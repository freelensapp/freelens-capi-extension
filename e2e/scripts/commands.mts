/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The commands of the test environment, which environment.mts runs; this module runs nothing when it is
// imported.
//
//   up              the real project: a kind cluster that mounts the socket of Docker, Cluster API installed
//                   by the pinned clusterctl, and two workload clusters of the development provider
//   up-definitions  the definitions alone: a kind cluster with the definitions of the releases, as they are
//   down            deletes the kind clusters that the scripts created, and the containers of their workload
//                   clusters
//   demo            says how to open the cluster of the real project in Freelens
//   check-pins      downloads every pinned file from its source and checks it, with no cluster
//   capture         brings workload clusters of the real project into the states of the fixtures, and writes
//                   the objects of each state into integration/fixtures
//   fixtures-up     applies the fixtures of states to the cluster of the definitions
//   fixtures-down   removes the fixtures of states from it, or all of them
//   fixtures-check  applies the fixtures of each state, reads them back and compares them with their files
//
// Run again, `up` and `up-definitions` resume. The scripts keep their state in a private folder outside the
// repository: for each kind cluster a kubeconfig of their own and the ID of its node, and the cache of what
// they download, which is checked against its pin every time it is used. Before every request they check that
// the API server of the kubeconfig is local and published by the node they created. They never write the
// kubeconfig of the user, and check that a run left it as it was.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { filesOfTarball } from "./archives.mts";
import { assertKindNode, assertLocalDocker, ensure, localApiServer, workloadContainerIds } from "./checks.mts";
import {
  certManagerComponents,
  everyPinnedFile,
  operatorComponents,
  pinnedContent,
  releaseAsset,
  sourceFile,
  sveltosChart,
  sveltosExtensionPackage,
} from "./downloads.mts";
import {
  applyPlan,
  CAPTURE_TIME,
  cleanObject,
  creationLevels,
  differences,
  FIXTURES_FOLDER,
  fileOf,
  fixtureFiles,
  inNameOrder,
  objectKey,
  printedObjects,
  readFixtureSet,
  roundTripDifferences,
  secondsBetween,
  timesInsideText,
} from "./fixtures.mts";
import { childEnvironment, clusterctlAsset, INOTIFY_LIMITS, inotifySettings } from "./host.mts";
import {
  chartDefinitions,
  clusterctlConfiguration,
  customResourceDefinitions,
  kindConfiguration,
  kindnetLabelArgument,
  kindnetManifest,
  kindnetResources,
  PROVIDERS,
  S7,
} from "./manifests.mts";
import { CLUSTER_API_SOURCES, kubernetesMinor, readPins } from "./pins.mts";
import { changedFiles, fingerprints, kubeconfigFiles, preparePrivateFolder, stateFolder, takeLock } from "./state.mts";
import {
  FIXTURE_STATES,
  fixtureReadme,
  PRE_DRAIN_HOOK,
  PRE_TERMINATE_HOOK,
  readNamespace,
  statesOf,
} from "./states.mts";
import { parseDocuments } from "./yaml.mts";

import type { RepositoryProvider } from "./manifests.mts";
import type { ClusterApiAsset, Pins, WorkflowPins } from "./pins.mts";
import type { Captured, FixtureState, ReadmeVersions, RealProject } from "./states.mts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const STATE = stateFolder(process.env, homedir());
const DOWNLOADS = join(STATE, "downloads");
const CLUSTERCTL = join(STATE, "clusterctl");
const CLUSTERCTL_CONFIG = join(CLUSTERCTL, "clusterctl.yaml");
const KUBECTL_CACHE = join(STATE, "cache", "kubectl");

// A kind cluster of the scripts: its name, which is global to the Docker daemon, its folder in the state,
// with its kubeconfig, which holds its one context, and the record of its node, the ID of the container that
// the scripts created.
export interface Tier {
  name: string;
  context: string;
  folder: string;
  kubeconfig: string;
  record: string;
  dockerSocket: boolean;
}

function tier(name: string, dockerSocket: boolean): Tier {
  const folder = join(STATE, name);

  return {
    name,
    context: `kind-${name}`,
    folder,
    kubeconfig: join(folder, "kubeconfig"),
    record: join(folder, "node"),
    dockerSocket,
  };
}

const DEFINITIONS = tier("freelens-capi-definitions", false);
const MANAGEMENT = tier("freelens-capi-management", true);

// A workload cluster of the real project, by its name, which is global to the Docker daemon.
export interface WorkloadName {
  name: string;
}

// The workload clusters of the real project, made from the templates of the release, with one control
// plane each: one with a MachineDeployment and kindnet, which becomes healthy, and one with a MachinePool and
// no network add-on, whose Nodes never become ready.
export interface Workload extends WorkloadName {
  flavor: string;
  workers: number;
  kindnet: boolean;
}

const WORKLOADS: readonly Workload[] = [
  { name: "freelens-capi-md", flavor: "development", workers: 2, kindnet: true },
  { name: "freelens-capi-mp", flavor: "development-mp", workers: 1, kindnet: false },
];
// The workload clusters that the captures of the fixtures make, each in the namespace of its name, which `down`
// deletes as it deletes those of `up`.
const CAPTURE_WORKLOADS: readonly WorkloadName[] = FIXTURE_STATES.filter((state) => state.capture).map((state) => ({
  name: state.namespace,
}));
// The workload clusters of the trial of S7, a test of the real tier: only the first has an infrastructure, and so
// containers, but a run that was killed leaves nothing either way.
const S7_WORKLOADS: readonly WorkloadName[] = [{ name: S7.infrastructureOnly }, { name: S7.controlPlaneOnly }];
// The workload clusters whose containers `down` deletes: those of `up`, of the captures and of the trial of S7.
export const DOWN_WORKLOADS: readonly WorkloadName[] = [...WORKLOADS, ...CAPTURE_WORKLOADS, ...S7_WORKLOADS];
const NAMESPACE = "default";
const FIELD_MANAGER = "freelens-capi-environment";
const AVAILABLE_WITHIN_MINUTES = 20;
// What the real project wants of Docker, for `up` and for the captures that make workload clusters on it.
const REAL_PROJECT_NEEDS = { processors: 4, memoryGiB: 8 };

function environment(kubeconfig?: string, extra: Record<string, string> = {}): Record<string, string> {
  return childEnvironment(process.env, kubeconfig ?? join(STATE, "no-kubeconfig"), KUBECTL_CACHE, extra);
}

interface RunOptions {
  input?: string;
  env?: Record<string, string>;
  // Milliseconds.
  timeout?: number;
  // The standard output goes to the terminal, for the long commands that report their progress there.
  stream?: boolean;
  // The standard error is kept out of the terminal, and its last lines go into the error of a failure.
  quiet?: boolean;
}

// Runs a command and returns its standard output. A failure names the command by its first two words, the
// tool and its subcommand, which carry no path of the private state.
function run(command: string, args: string[], options: RunOptions = {}): string {
  const result = spawnSync(command, args, {
    env: options.env ?? environment(),
    input: options.input,
    encoding: "utf8",
    stdio: ["pipe", options.stream ? "inherit" : "pipe", options.quiet ? "pipe" : "inherit"],
    timeout: options.timeout ?? 2 * 60_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const what = [basename(command), ...args.slice(0, 2).filter((arg) => !arg.startsWith("-"))].join(" ");

  if (result.error) {
    throw new Error(`${what} did not complete: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.quiet ? (result.stderr ?? "").trim().split("\n").slice(-3).join(" ") : "";

    throw new Error(`${what} failed with ${result.status ?? result.signal}${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout ?? "";
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The ID of the node of a kind cluster that the scripts recorded when they created it.
function recordedNode(target: Tier): string | undefined {
  try {
    return readFileSync(target.record, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

// The ID of the control plane container of the kind cluster of that name, when Docker has one.
function nodeId(target: Tier): string | undefined {
  try {
    const format = ["--type", "container", "--format", "{{.Id}}"];

    return run("docker", ["inspect", ...format, `${target.name}-control-plane`], { quiet: true }).trim() || undefined;
  } catch {
    return undefined;
  }
}

// What the checks of a target read: the kubeconfig of the scripts, as kubectl prints it without asking any
// server, and the node of the kind cluster of that name, as Docker prints it.
interface TargetFacts {
  config: unknown;
  node: unknown;
}

function targetFacts(target: Tier): TargetFacts {
  return {
    config: JSON.parse(
      run("kubectl", ["config", "view", "--raw", "--output", "json", "--kubeconfig", target.kubeconfig], {
        env: environment(target.kubeconfig),
        quiet: true,
      }),
    ),
    node: JSON.parse(
      run("docker", ["inspect", "--type", "container", `${target.name}-control-plane`], { quiet: true }),
    ),
  };
}

// A refusal of the checks of a target. A wait reads again after a request that failed, which may succeed later, and
// stops at once on a refusal, since no retry makes another cluster the one that the scripts created.
export class TargetRefusal extends Error {}

// The checks of a target before any request: the kubeconfig of the scripts holds one context, whose API
// server is on a loopback address, published there by the node that the scripts recorded when they created
// the cluster.
function checkTarget(target: Tier, facts: TargetFacts): void {
  try {
    assertKindNode(facts.node, {
      name: target.name,
      server: localApiServer(facts.config, target.context),
      nodeId: recordedNode(target),
      dockerSocket: target.dockerSocket,
    });
  } catch (error) {
    throw new TargetRefusal(message(error));
  }
}

function verifyTarget(target: Tier): void {
  if (!existsSync(target.kubeconfig)) {
    throw new TargetRefusal(`The state folder has no kubeconfig of ${target.name}: take it down`);
  }
  checkTarget(target, targetFacts(target));
}

function kubectlArguments(target: Tier, args: string[]): string[] {
  return [...args, "--kubeconfig", target.kubeconfig, "--context", target.context, "--cache-dir", KUBECTL_CACHE];
}

function kubectl(target: Tier, args: string[], options: RunOptions = {}): string {
  verifyTarget(target);
  return run("kubectl", kubectlArguments(target, args), { ...options, env: environment(target.kubeconfig) });
}

// The environment of clusterctl: ClusterTopology on, as the release asks for ClusterClasses, no check for a
// newer clusterctl, and a home and a configuration folder of the scripts in place of those of the user,
// where clusterctl would look for a configuration of its own.
function clusterctlEnvironment(kubeconfig?: string): Record<string, string> {
  const home = join(CLUSTERCTL, "home");

  return environment(kubeconfig, {
    CLUSTER_TOPOLOGY: "true",
    CLUSTERCTL_DISABLE_VERSIONCHECK: "true",
    HOME: home,
    XDG_CONFIG_HOME: home,
  });
}

function clusterctl(binary: string, target: Tier, args: string[], options: RunOptions = {}): string {
  verifyTarget(target);
  return run(
    binary,
    [
      ...args,
      ...["--config", CLUSTERCTL_CONFIG],
      ...["--kubeconfig", target.kubeconfig, "--kubeconfig-context", target.context],
    ],
    { ...options, env: clusterctlEnvironment(target.kubeconfig) },
  );
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Docker, before any command that uses it does anything: the local one, which runs Linux containers.
function localDocker(): void {
  const endpoint = run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], {
    quiet: true,
  }).trim();

  assertLocalDocker(process.env.DOCKER_HOST, endpoint);

  const info = JSON.parse(run("docker", ["info", "--format", "{{json .}}"], { quiet: true })) as { OSType?: string };

  ensure(info.OSType === "linux", "Docker does not run Linux containers");
}

// The tools: kind at the version that the integration workflow pins, and a kubectl near the Kubernetes of the
// kind clusters. What a tier wants of Docker is said when it has less, and not enforced: the nodes are what
// decides.
function preflight(workflow: WorkflowPins, kubernetes: string, needs: { processors: number; memoryGiB: number }): void {
  const docker = JSON.parse(run("docker", ["info", "--format", "{{json .}}"], { quiet: true })) as {
    NCPU?: number;
    MemTotal?: number;
  };

  if ((docker.MemTotal ?? 0) < needs.memoryGiB * 1024 ** 3 || (docker.NCPU ?? 0) < needs.processors) {
    console.warn(
      `Warning: Docker has ${docker.NCPU} processors and ${((docker.MemTotal ?? 0) / 1024 ** 3).toFixed(1)} GiB of memory; this environment wants ${needs.processors} processors and ${needs.memoryGiB} GiB.`,
    );
  }

  const kind = /^kind v(\S+)/.exec(run("kind", ["version"], { quiet: true }));

  ensure(
    kind?.[1] === workflow.kind,
    `The scripts need kind ${workflow.kind}, the version that the integration workflow pins, and found ${kind?.[1] ?? "none"}`,
  );

  const client = JSON.parse(run("kubectl", ["version", "--client", "--output", "json"], { quiet: true })) as {
    clientVersion?: { major?: string; minor?: string };
  };
  const skew = Math.abs(Number.parseInt(client.clientVersion?.minor ?? "", 10) - kubernetesMinor(kubernetes));

  if (!(skew <= 1)) {
    console.warn(
      `Warning: kubectl ${client.clientVersion?.major}.${client.clientVersion?.minor} is more than one minor version away from Kubernetes ${kubernetes}.`,
    );
  }
}

// On Linux, the limits of inotify of the workload clusters, raised when they are lower, or a warning.
function raiseInotifyLimits(): void {
  if (process.platform !== "linux") return;

  const current: Record<string, number> = {};

  for (const key of Object.keys(INOTIFY_LIMITS)) {
    try {
      current[key] = Number(readFileSync(`/proc/sys/${key.replaceAll(".", "/")}`, "utf8"));
    } catch {
      // A limit that cannot be read is raised as one that is lower.
    }
  }

  const settings = inotifySettings(current);

  if (!settings.length) return;

  const result = spawnSync("sudo", ["-n", "sysctl", "-w", ...settings], {
    env: environment(),
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });

  if (result.status === 0) {
    console.log(`Raised the limits of inotify: ${settings.join(" ")}`);
  } else {
    console.warn(
      `Warning: could not raise the limits of inotify (sudo -n sysctl failed). The workload clusters may fail: their nodes can exit as they start. Raise them with: sudo sysctl -w ${settings.join(" ")}`,
    );
  }
}

function asset(pins: Pins, name: ClusterApiAsset): Promise<Buffer> {
  return pinnedContent(releaseAsset(pins, DOWNLOADS, name));
}

// The release and the commit that clusterctl reports are those of the pins: the binary is the one of the
// release, and the commit of the pins is the one of its tag.
function checkClusterctlVersion(binary: string, pins: Pins): void {
  const version = JSON.parse(
    run(binary, ["version", "--output", "json", "--config", CLUSTERCTL_CONFIG], {
      env: clusterctlEnvironment(),
      quiet: true,
    }),
  ) as { clusterctl?: { gitVersion?: string; gitCommit?: string } };

  ensure(
    version.clusterctl?.gitVersion === pins.clusterApi.version &&
      version.clusterctl.gitCommit === pins.clusterApi.commit,
    `The pinned clusterctl is ${version.clusterctl?.gitVersion} at ${version.clusterctl?.gitCommit}, and the pins say ${pins.clusterApi.version} at ${pins.clusterApi.commit}`,
  );
}

// clusterctl for this system, checked against its pin, then against the release and the commit of the pins.
// The local repository and the configuration of clusterctl are written first.
async function clusterctlBinary(pins: Pins): Promise<string> {
  const pinned = releaseAsset(pins, DOWNLOADS, clusterctlAsset(process.platform, process.arch));

  await pinnedContent(pinned);
  checkClusterctlVersion(pinned.file, pins);
  return pinned.file;
}

// The local repository of clusterctl, written from the checked files at every run: the components of the
// four providers and the metadata of the release, the templates of the development provider next to its
// components, and cert-manager in the folder of its version.
async function writeRepository(pins: Pins): Promise<void> {
  const { version } = pins.clusterApi;
  const repository = join(CLUSTERCTL, "repository");
  const overrides = join(CLUSTERCTL, "overrides");
  const metadata = await asset(pins, "metadata.yaml");

  rmSync(repository, { recursive: true, force: true });
  for (const provider of PROVIDERS) {
    const folder = join(repository, provider.label, version);
    const files: ClusterApiAsset[] = [provider.components];

    if (provider.type === "InfrastructureProvider") {
      files.push(
        "cluster-template-development.yaml",
        "cluster-template-development-mp.yaml",
        "clusterclass-quick-start.yaml",
      );
    }
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "metadata.yaml"), metadata);
    for (const file of files) {
      writeFileSync(join(folder, file), await asset(pins, file));
    }
  }

  const certManager = join(repository, "cert-manager", pins.certManager.version);

  mkdirSync(certManager, { recursive: true });
  writeFileSync(join(certManager, "cert-manager.yaml"), await pinnedContent(certManagerComponents(pins, DOWNLOADS)));
  mkdirSync(overrides, { recursive: true });
  writeFileSync(
    CLUSTERCTL_CONFIG,
    clusterctlConfiguration(repository, overrides, { clusterApi: version, certManager: pins.certManager.version }),
  );
}

function kindClusters(): string[] {
  return lines(run("kind", ["get", "clusters"], { quiet: true }));
}

// The kind cluster of a tier: created with the node image of the Kubernetes of the pins, and its node
// recorded; or used again when it exists and the state folder has its kubeconfig and the record of its node.
// A kind cluster of that name that the scripts did not create from this state folder is refused, not
// adopted. Either way the target is checked before anything else is done with it.
function ensureKindCluster(target: Tier, kubernetes: string): void {
  mkdirSync(target.folder, { recursive: true });
  if (kindClusters().includes(target.name)) {
    ensure(
      existsSync(target.kubeconfig) && recordedNode(target) !== undefined,
      `The kind cluster ${target.name} exists, and the state folder has no kubeconfig or no record of it, so the scripts did not create it from there. If it is yours, delete it with kind delete cluster --name ${target.name}, then run this command again`,
    );
    console.log(`The kind cluster ${target.name} exists, and is used again`);
  } else {
    const configuration = join(target.folder, "kind.yaml");

    writeFileSync(configuration, kindConfiguration(target.dockerSocket));
    rmSync(target.kubeconfig, { force: true });
    rmSync(target.record, { force: true });
    console.log(`Creating the kind cluster ${target.name}, with kindest/node:${kubernetes}`);
    run(
      "kind",
      [
        "create",
        "cluster",
        ...["--name", target.name, "--image", `kindest/node:${kubernetes}`],
        ...["--config", configuration, "--kubeconfig", target.kubeconfig, "--wait", "5m"],
      ],
      { stream: true, timeout: 20 * 60_000 },
    );

    const id = nodeId(target);

    ensure(id, `kind created ${target.name}, and Docker has no node of it`);
    writeFileSync(target.record, `${id}\n`);
  }
  verifyTarget(target);
}

// The containers of a workload cluster, by the label that the development provider gives each of them,
// checked as `workloadContainerIds` says.
function workloadContainers(workload: WorkloadName): string[] {
  const ids = lines(
    run("docker", ["ps", "--all", "--quiet", "--filter", `label=io.x-k8s.kind.cluster=${workload.name}`], {
      quiet: true,
    }),
  );

  if (!ids.length) return [];
  return workloadContainerIds(
    JSON.parse(run("docker", ["inspect", "--type", "container", ...ids], { quiet: true })),
    workload.name,
  );
}

export interface InventoryProvider {
  metadata: { namespace: string };
  providerName: string;
  type: string;
  version: string;
}

// The providers of the inventory of clusterctl against those of the pins: those of PROVIDERS that it lacks,
// which `up` installs, and those that it holds at another release than the one of the pins, which `up`
// refuses, and a capture too, since its sets would come from those controllers under the name of the pins.
export function providersAgainstPins(
  installed: readonly InventoryProvider[],
  version: string,
): { missing: RepositoryProvider[]; other: string[] } {
  return {
    missing: PROVIDERS.filter(
      (provider) => !installed.some((item) => item.type === provider.type && item.providerName === provider.name),
    ),
    other: installed
      .filter((item) => item.version !== version)
      .map((item) => `${item.type} ${item.providerName} is installed at ${item.version}, and the pins say ${version}`),
  };
}

// The inventory of clusterctl in the cluster of the real project, empty before its definition exists.
function installedProviders(): InventoryProvider[] {
  const definition = ["customresourcedefinitions", "providers.clusterctl.cluster.x-k8s.io"];

  if (!kubectl(MANAGEMENT, ["get", ...definition, "--ignore-not-found", "--output", "name"]).trim()) return [];
  return (
    JSON.parse(
      kubectl(MANAGEMENT, [
        "get",
        "providers.v1alpha3.clusterctl.cluster.x-k8s.io",
        "--all-namespaces",
        "--output",
        "json",
      ]),
    ) as { items: InventoryProvider[] }
  ).items;
}

async function up(): Promise<void> {
  const { pins, workflow } = readPins(ROOT);
  const { version, workloadKubernetesVersion } = pins.clusterApi;

  preflight(workflow, pins.managementKubernetes.version, REAL_PROJECT_NEEDS);
  raiseInotifyLimits();
  await writeRepository(pins);

  const binary = await clusterctlBinary(pins);
  const kindnet = kindnetManifest(
    (await pinnedContent(sourceFile(pins, DOWNLOADS, "test/e2e/data/cni/kindnet/kindnet.yaml"))).toString("utf8"),
  );

  ensureKindCluster(MANAGEMENT, pins.managementKubernetes.version);

  // The providers that clusterctl installed, from its inventory: a run that resumes installs only the
  // missing ones, since clusterctl refuses to install a provider twice.
  const { missing, other } = providersAgainstPins(installedProviders(), version);

  ensure(!other.length, `${other.join("; ")}: take the environment down first`);
  if (missing.length) {
    const flags = {
      CoreProvider: "--core",
      BootstrapProvider: "--bootstrap",
      ControlPlaneProvider: "--control-plane",
      InfrastructureProvider: "--infrastructure",
    };

    console.log(`Installing Cluster API ${version} with clusterctl, with ClusterTopology on`);
    clusterctl(
      binary,
      MANAGEMENT,
      [
        "init",
        ...missing.flatMap((provider) => [flags[provider.type], `${provider.name}:${version}`]),
        ...["--wait-providers", "--wait-provider-timeout", "900"],
      ],
      { stream: true, timeout: 40 * 60_000 },
    );
  } else {
    console.log(`Cluster API ${version} is installed`);
  }
  for (const namespace of new Set(["cert-manager", ...installedProviders().map((item) => item.metadata.namespace)])) {
    kubectl(
      MANAGEMENT,
      ["wait", "deployments", "--all", "--namespace", namespace, "--for", "condition=Available", "--timeout", "600s"],
      { timeout: 11 * 60_000 },
    );
  }

  kubectl(MANAGEMENT, ["apply", "--server-side", "--field-manager", FIELD_MANAGER, "--filename", "-"], {
    input: kindnetResources(kindnet, NAMESPACE),
  });
  for (const workload of WORKLOADS) {
    const cluster = ["clusters.v1beta2.cluster.x-k8s.io", workload.name, "--namespace", NAMESPACE];

    if (kubectl(MANAGEMENT, ["get", ...cluster, "--ignore-not-found", "--output", "name"]).trim()) {
      console.log(`The workload cluster ${workload.name} exists`);
    } else {
      ensure(
        !workloadContainers(workload).length,
        `Containers of a workload cluster named ${workload.name} exist, and the management cluster has no Cluster of that name: take the environment down first`,
      );
      console.log(
        `Creating the workload cluster ${workload.name}, from the template of the flavor ${workload.flavor}, with Kubernetes ${workloadKubernetesVersion}`,
      );
      kubectl(MANAGEMENT, ["apply", "--server-side", "--field-manager", FIELD_MANAGER, "--filename", "-"], {
        input: clusterctl(binary, MANAGEMENT, [
          ...["generate", "cluster", workload.name, "--flavor", workload.flavor],
          ...["--infrastructure", `docker:${version}`, "--kubernetes-version", workloadKubernetesVersion],
          ...["--control-plane-machine-count", "1", "--worker-machine-count", String(workload.workers)],
          ...["--target-namespace", NAMESPACE],
        ]),
      });
    }
    if (workload.kindnet) {
      kubectl(MANAGEMENT, ["label", ...cluster, kindnetLabelArgument(), "--overwrite"]);
    }
  }

  await waitAvailable(WORKLOADS[0]);
  console.log(kubectl(MANAGEMENT, ["get", "clusters.v1beta2.cluster.x-k8s.io", "--all-namespaces"]).trimEnd());
  console.log(`The real project is up: kubeconfig ${MANAGEMENT.kubeconfig}, context ${MANAGEMENT.context}`);
}

interface Condition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

// Waits until a workload cluster reports Available True, saying how far it is when its state changes, and
// at least once a minute. A request that fails, or a target that cannot be read, is tried again until the
// deadline; a target that is read and refused stops the wait at once.
async function waitAvailable(workload: Workload): Promise<void> {
  const deadline = Date.now() + AVAILABLE_WITHIN_MINUTES * 60_000;
  let said = "";
  let saidAt = 0;

  for (;;) {
    let state = "";
    let facts: TargetFacts | undefined;
    let available: Condition | undefined;

    try {
      facts = targetFacts(MANAGEMENT);
    } catch (error) {
      state = `its target could not be read: ${message(error)}`;
    }
    if (facts) {
      checkTarget(MANAGEMENT, facts);
      try {
        const get = ["get", "clusters.v1beta2.cluster.x-k8s.io", workload.name, "--namespace", NAMESPACE];
        const cluster = JSON.parse(
          run("kubectl", kubectlArguments(MANAGEMENT, [...get, "--output", "json"]), {
            env: environment(MANAGEMENT.kubeconfig),
            quiet: true,
          }),
        ) as { status?: { phase?: string; conditions?: Condition[] } };

        available = cluster.status?.conditions?.find((condition) => condition.type === "Available");
        if (available?.status === "True") {
          console.log(`The workload cluster ${workload.name} reports Available True`);
          return;
        }
        state = `phase ${cluster.status?.phase ?? "not reported"}, Available ${available?.status ?? "not reported"}${available?.reason ? `, ${available.reason}` : ""}`;
      } catch (error) {
        state = `the request failed: ${message(error)}`;
      }
    }
    if (state !== said || Date.now() - saidAt >= 60_000) {
      console.log(`Waiting for ${workload.name} to report Available True: ${state}`);
      said = state;
      saidAt = Date.now();
    }
    ensure(
      Date.now() < deadline,
      `${workload.name} did not report Available True within ${AVAILABLE_WITHIN_MINUTES} minutes: ${state}${available?.message ? `, ${available.message.split("\n")[0]}` : ""}`,
    );
    await delay(10_000);
  }
}

async function upDefinitions(): Promise<void> {
  const { pins, workflow } = readPins(ROOT);
  const files: { name: string; content: Buffer }[] = [];

  preflight(workflow, pins.managementKubernetes.version, { processors: 2, memoryGiB: 2 });
  for (const name of [
    "core-components.yaml",
    "bootstrap-components.yaml",
    "control-plane-components.yaml",
    "infrastructure-components-development.yaml",
  ] as const) {
    files.push({ name, content: await asset(pins, name) });
  }
  files.push({
    name: "operator-components.yaml",
    content: await pinnedContent(operatorComponents(pins, DOWNLOADS)),
  });
  files.push({
    name: CLUSTER_API_SOURCES[0],
    content: await pinnedContent(sourceFile(pins, DOWNLOADS, CLUSTER_API_SOURCES[0])),
  });

  const definitions = files.flatMap(({ name, content }) => {
    const found = customResourceDefinitions(content.toString("utf8"));

    ensure(found.length, `${name} has no definition`);
    return found;
  });

  ensureKindCluster(DEFINITIONS, pins.managementKubernetes.version);
  console.log(`Applying ${definitions.length} definitions, as the releases have them`);

  const names = lines(
    kubectl(
      DEFINITIONS,
      ["apply", "--server-side", "--field-manager", FIELD_MANAGER, "--output", "name", "--filename", "-"],
      { input: definitions.join("---\n"), timeout: 5 * 60_000 },
    ),
  );

  ensure(names.length === definitions.length, `kubectl applied ${names.length} of ${definitions.length} definitions`);
  kubectl(DEFINITIONS, ["wait", ...names, "--for", "condition=Established", "--timeout", "180s"], {
    timeout: 4 * 60_000,
  });
  console.log(
    `${names.length} definitions are Established: kubeconfig ${DEFINITIONS.kubeconfig}, context ${DEFINITIONS.context}`,
  );
}

// What `down` does to the system, apart from what it decides, so that its decisions can be tested.
export interface DownOperations {
  kindClusters(): string[];
  // The ID of the control plane container of the kind cluster of that name, when Docker has one.
  nodeId(target: Tier): string | undefined;
  // The ID of its node that the scripts recorded when they created it.
  recordedNode(target: Tier): string | undefined;
  deleteCluster(target: Tier): void;
  workloadContainers(workload: WorkloadName): string[];
  removeContainers(ids: string[]): void;
  // Removes the folder of a tier from the state: its kubeconfig and the record of its node.
  forget(target: Tier): void;
  log(line: string): void;
}

// Takes the environment down. A kind cluster of the scripts is deleted only when its node is the container
// that the scripts recorded: a cluster of that name made by anyone else is left in place. The cluster of the
// real project goes first, so that no controller creates a node of a workload cluster again; then the
// containers of the workload clusters, only when this state folder records the cluster of the real project
// that created them. Every step is tried, what is left is checked, and a step that failed makes the command
// fail and keeps the state, so that the next run tries again. When the kind clusters cannot be listed,
// nothing is deleted.
export function takeDown(
  operations: DownOperations,
  management: Tier,
  definitions: Tier,
  workloads: readonly WorkloadName[],
): void {
  const failures: string[] = [];
  const attempt = (what: string, action: () => void) => {
    try {
      action();
    } catch (error) {
      failures.push(`${what}: ${message(error)}`);
    }
  };
  let clusters: string[];

  try {
    clusters = operations.kindClusters();
  } catch (error) {
    throw new Error(`The kind clusters could not be listed, and nothing was deleted: ${message(error)}`);
  }

  const managed = operations.recordedNode(management) !== undefined;
  const deleted: string[] = [];

  for (const target of [management, definitions]) {
    attempt(`deleting the kind cluster ${target.name}`, () => {
      if (!clusters.includes(target.name)) return;

      const recorded = operations.recordedNode(target);

      ensure(
        recorded !== undefined && operations.nodeId(target) === recorded,
        `it is not the kind cluster that the scripts created from this state folder, and is left in place. If it is yours, delete it with kind delete cluster --name ${target.name}`,
      );
      operations.log(`Deleting the kind cluster ${target.name}`);
      operations.deleteCluster(target);
      deleted.push(target.name);
    });
  }
  for (const workload of workloads) {
    attempt(`deleting the containers of ${workload.name}`, () => {
      const ids = operations.workloadContainers(workload);

      if (!ids.length) return;
      ensure(
        managed,
        "this state folder has no record of the cluster of the real project that created them, and they are left in place",
      );
      operations.log(`Deleting the ${ids.length} containers of the workload cluster ${workload.name}`);
      operations.removeContainers(ids);
    });
  }
  attempt("checking what is left", () => {
    const left = operations.kindClusters().filter((name) => deleted.includes(name));
    const containers = managed ? workloads.flatMap((workload) => operations.workloadContainers(workload)) : [];

    ensure(!left.length, `kind still lists ${left.join(", ")}`);
    ensure(!containers.length, `${containers.length} containers of the workload clusters are left`);
  });
  if (failures.length) {
    throw new Error(`The environment was not taken down:\n- ${failures.join("\n- ")}`);
  }
  operations.forget(management);
  operations.forget(definitions);
  operations.log("Nothing of the test environment is left: no kind cluster and no container of its own");
}

function down(): void {
  takeDown(
    {
      kindClusters,
      nodeId,
      recordedNode,
      deleteCluster: (target) =>
        run("kind", ["delete", "cluster", "--name", target.name, "--kubeconfig", target.kubeconfig], {
          timeout: 5 * 60_000,
        }),
      workloadContainers,
      removeContainers: (ids) =>
        run("docker", ["rm", "--force", "--volumes", ...ids], { quiet: true, timeout: 5 * 60_000 }),
      forget: (target) => rmSync(target.folder, { recursive: true, force: true }),
      log: (line) => console.log(line),
    },
    MANAGEMENT,
    DEFINITIONS,
    DOWN_WORKLOADS,
  );
}

// What the demo is, and how to open it in Freelens.
function demo(): void {
  const clusters = lines(
    kubectl(MANAGEMENT, ["get", "clusters.v1beta2.cluster.x-k8s.io", "--namespace", NAMESPACE, "--output", "name"]),
  );

  ensure(clusters.length, `The demo cluster has no workload cluster: run pnpm demo:up`);
  console.log(
    [
      "",
      `The demo cluster is ${MANAGEMENT.context}, with Cluster API and the workload clusters ${WORKLOADS.map((workload) => workload.name).join(" and ")}.`,
      `In Freelens, add its kubeconfig in Kubeconfig Syncs of the Kubernetes preferences, then open ${MANAGEMENT.context} from the catalog:`,
      "",
      `  ${MANAGEMENT.kubeconfig}`,
      "",
      "The load balancers of the workload clusters publish their API servers on every address of this machine: keep the demo down on a network you do not trust.",
      "Take it down with pnpm demo:down.",
    ].join("\n"),
  );
}

// Downloads every pinned file from its source, not from the cache, and checks it against its pin, with no
// cluster; then, when every file matches, the release and the commit that the clusterctl of this system
// reports. Every file that does not match is reported, with its digest.
async function checkPins(): Promise<void> {
  const { pins } = readPins(ROOT);
  const files = everyPinnedFile(pins, DOWNLOADS);
  const failures: string[] = [];

  for (const file of files) {
    try {
      await pinnedContent(file, { fresh: true });
      console.log(`Matches its pin: ${file.name}`);
    } catch (error) {
      failures.push(message(error));
      console.log(`Does not match its pin: ${file.name}`);
    }
  }
  ensure(
    !failures.length,
    `${failures.length} of the ${files.length} pinned files do not match their pins:\n- ${failures.join("\n- ")}`,
  );
  await writeRepository(pins);
  await clusterctlBinary(pins);
  console.log(
    `The ${files.length} pinned files match their pins, and clusterctl reports ${pins.clusterApi.version} at ${pins.clusterApi.commit}`,
  );
}

// How many captures of the fixtures run at a time, each with a workload cluster of its own.
const CAPTURES_AT_ONCE = 3;

function list(items: readonly unknown[]): string {
  return JSON.stringify({ apiVersion: "v1", kind: "List", items });
}

// A time as Kubernetes writes it, in whole seconds.
function now(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

// The resource of an object, as kubectl takes it: its kind, its version and its group.
function resourceOf(object: { apiVersion: string; kind: string }): string {
  const [group, version] = object.apiVersion.includes("/") ? object.apiVersion.split("/") : ["", object.apiVersion];

  return `${object.kind.toLowerCase()}.${version}.${group}`;
}

function folderOf(state: FixtureState): string {
  return join(ROOT, FIXTURES_FOLDER, state.name);
}

// Runs an action for each item, at most `limit` at a time.
async function inParallel<Item>(items: readonly Item[], limit: number, action: (item: Item) => Promise<void>) {
  const queue = [...items];

  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await action(item);
    }),
  );
}

// Writes the fixture set of a state from its capture: every object cleaned, in the namespace of the state, with
// every owner in the set, no time inside a text, and a generation that the first tier can give it, in files
// that read back as the objects, with a README. The folder and its files get the modes of a checkout, 755 and
// 644, and not those of the private umask of the scripts.
function writeFixtureSet(state: FixtureState, captured: Captured, versions: ReadmeVersions) {
  const seconds = secondsBetween(captured.capturedAt, CAPTURE_TIME);
  const leftOut = new Set<string>();
  const objects = captured.objects.map((read) => {
    ensure(read.metadata.namespace === state.namespace, `${objectKey(read)} is not in the namespace of ${state.name}`);

    const { object, leftOut: paths } = cleanObject(read, seconds);
    const inside = timesInsideText(object);

    ensure(!inside.length, `${objectKey(object)} holds a time inside a text, at ${inside.join(", ")}`);
    for (const path of paths) leftOut.add(`${object.kind} ${path.replace(/\[\d+\]/g, "[]")}`);
    return object;
  });

  ensure(objects.length, `${state.name} has no object`);
  creationLevels(objects);
  // A set that the first tier would refuse fails here, and not at its first apply.
  for (const object of objects) applyPlan(object, 0);

  const files = fixtureFiles(objects);

  for (const [file, text] of files) {
    const written = inNameOrder(objects.filter((object) => fileOf(object) === file));
    const read = parseDocuments(text);

    ensure(
      read.length === written.length && written.every((object, index) => !differences(object, read[index]).length),
      `${file} of ${state.name} does not read back as its objects`,
    );
  }

  const folder = folderOf(state);
  const written = new Map([...files, ["README.md", fixtureReadme(state, objects, [...leftOut].sort(), versions)]]);

  mkdirSync(folder, { recursive: true });
  for (const file of readdirSync(folder)) {
    if (file.endsWith(".yaml") && !file.startsWith(".")) rmSync(join(folder, file));
  }
  for (const [file, text] of written) {
    writeFileSync(join(folder, file), text);
    chmodSync(join(folder, file), 0o644);
  }
  chmodSync(folder, 0o755);
  console.log(
    `${state.namespace}: wrote ${objects.length} objects in ${files.size} files to ${FIXTURES_FOLDER}/${state.name}`,
  );
}

// Removes the workload cluster of a capture and its namespace, letting its deletion go first: a paused Cluster
// resumed, the hooks of the scripts removed from its Machines. It waits without holding the process, so that the
// captures that run beside it go on.
async function removeCapture(project: RealProject, namespace: string): Promise<void> {
  const exists = () =>
    project.kubectl(["get", "namespace", namespace, "--ignore-not-found", "--output", "name"]).trim() !== "";
  const gone = async (what: string, check: () => boolean, minutes: number) => {
    const deadline = Date.now() + minutes * 60_000;

    while (!check()) {
      ensure(Date.now() < deadline, `${namespace}: ${what} did not go within ${minutes} minutes`);
      await delay(5_000);
    }
  };

  if (!exists()) return;

  const objects = readNamespace(project.kubectl, namespace);

  for (const cluster of objects.filter((object) => object.kind === "Cluster" && object.spec?.paused)) {
    project.kubectl([
      ...["patch", resourceOf(cluster), cluster.metadata.name, "--namespace", namespace],
      ...["--type", "merge", "--patch", JSON.stringify({ spec: { paused: null } })],
    ]);
  }
  for (const machine of objects.filter((object) => object.kind === "Machine")) {
    const hooks = [PRE_DRAIN_HOOK, PRE_TERMINATE_HOOK].filter(
      (hook) => machine.metadata.annotations?.[hook] !== undefined,
    );

    if (hooks.length) {
      project.kubectl([
        ...["annotate", resourceOf(machine), machine.metadata.name, "--namespace", namespace],
        ...hooks.map((hook) => `${hook}-`),
      ]);
    }
  }
  console.log(`${namespace}: deleting the workload cluster and its namespace`);
  project.kubectl(["delete", "clusters.v1beta2.cluster.x-k8s.io", "--all", "--namespace", namespace, "--wait=false"]);
  await gone(
    "the workload cluster",
    () => !readNamespace(project.kubectl, namespace).some((object) => object.kind === "Cluster"),
    15,
  );
  project.kubectl(["delete", "namespace", namespace, "--wait=false"]);
  await gone("the namespace", () => !exists(), 10);
}

// Brings workload clusters of the real project into the states of the fixtures, at most CAPTURES_AT_ONCE at a
// time, each in its own namespace, writes the objects of each one into its fixture set, and deletes them. A
// capture that fails is reported after the others, and makes the command fail; its fixture set stays as it
// was.
async function capture(states: readonly FixtureState[]): Promise<void> {
  const { pins, workflow } = readPins(ROOT);
  const { version, workloadKubernetesVersion, workloadKubernetesUpgradeFrom } = pins.clusterApi;

  // The workload clusters of the captures need what those of `up` need, the limits of inotify above all,
  // which a Linux system sets back to its own at every boot.
  preflight(workflow, pins.managementKubernetes.version, REAL_PROJECT_NEEDS);
  raiseInotifyLimits();
  verifyTarget(MANAGEMENT);

  const { missing, other } = providersAgainstPins(installedProviders(), version);

  ensure(
    !missing.length,
    `The cluster of the real project lacks ${missing.map((provider) => `${provider.type} ${provider.name}`).join(", ")}: run pnpm e2e:cluster:up first`,
  );
  ensure(!other.length, `${other.join("; ")}: take the environment down, and bring it up again`);
  await writeRepository(pins);

  const binary = await clusterctlBinary(pins);
  const kindnet = kindnetManifest(
    (await pinnedContent(sourceFile(pins, DOWNLOADS, "test/e2e/data/cni/kindnet/kindnet.yaml"))).toString("utf8"),
  );
  const project: RealProject = {
    kubectl: (args, options = {}) => kubectl(MANAGEMENT, args, { quiet: true, ...options }),
    apply: (manifest) => {
      kubectl(MANAGEMENT, ["apply", "--server-side", "--field-manager", FIELD_MANAGER, "--filename", "-"], {
        input: manifest,
        quiet: true,
      });
    },
    clusterctl: (args) => clusterctl(binary, MANAGEMENT, args, { quiet: true }),
    generate: (cluster) =>
      clusterctl(
        binary,
        MANAGEMENT,
        [
          ...["generate", "cluster", cluster.name, "--flavor", cluster.flavor],
          ...["--infrastructure", `docker:${version}`, "--kubernetes-version", cluster.kubernetesVersion],
          ...["--control-plane-machine-count", String(cluster.controlPlane)],
          ...["--worker-machine-count", String(cluster.workers), "--target-namespace", cluster.namespace],
        ],
        { quiet: true },
      ),
    kindnet: (namespace) => kindnetResources(kindnet, namespace),
    kubernetesVersion: workloadKubernetesVersion,
    upgradeFromKubernetesVersion: workloadKubernetesUpgradeFrom,
    clusterApiVersion: version,
    log: (line) => console.log(line),
  };
  const failures: string[] = [];

  await inParallel(states, CAPTURES_AT_ONCE, async (state) => {
    const { capture: run } = state;

    ensure(run, `${state.name} is written by hand`);
    try {
      await removeCapture(project, state.namespace);
      console.log(`${state.namespace}: capturing ${state.name}`);
      writeFixtureSet(state, await run(project, state.namespace), {
        clusterApi: version,
        kubernetes: workloadKubernetesVersion,
        upgradeFrom: workloadKubernetesUpgradeFrom,
      });
    } catch (error) {
      failures.push(`${state.name}: ${message(error)}`);
      console.error(`${state.namespace}: the capture failed: ${message(error)}`);
    } finally {
      try {
        await removeCapture(project, state.namespace);
      } catch (error) {
        failures.push(`${state.name}, removing its workload cluster: ${message(error)}`);
      }
    }
  });
  ensure(!failures.length, `${failures.length} of ${states.length} captures failed:\n- ${failures.join("\n- ")}`);
}

// A session of a test on a tier: kubectl on its cluster, through the kubeconfig of the scripts, with the target checked
// before every request, as every command of the scripts checks it, so that a test refuses any other cluster and writes
// to this one alone.
export interface TierSession {
  // kubectl on the cluster of the tier, and its output. A failure throws, with the last lines of its error.
  kubectl(args: string[], options?: { input?: string; timeout?: number }): string;
  // A server-side apply of the objects of a manifest, by the field manager of the scripts, and the names of the objects
  // applied, as `kind.group/name`.
  apply(manifest: string): string[];
  // Releases the lock of the state folder, and fails when the kubeconfig of the user changed meanwhile.
  close(): void;
}

// The cluster of the real project, as a test of the real tier reaches it (docs/development/TESTING.md, "Tests of the
// real tier").
export interface RealProjectSession extends TierSession {
  // The ConfigMap with kindnet and the ClusterResourceSet that applies it, for a namespace.
  kindnet(namespace: string): string;
  // The version of Kubernetes of the workload clusters, from the pins.
  kubernetesVersion: string;
  // What `clusterctl describe cluster` prints of a workload cluster of the namespace of the workload clusters of `up`,
  // with the pinned clusterctl, which checks for no newer clusterctl (SPEC-0001, R4.9): the tool of the project, which
  // the sessions of the real tier compare the view with (SPEC-0004, "With the real project").
  describeCluster(name: string): Promise<string>;
  // The pinned files of S6 (SPEC-0004, P29), each checked against its pin: the package of the Sveltos extension, with
  // its file name and its SHA-256, and the definitions of the chart of Sveltos, each as its text.
  sveltos(): Promise<{
    extension: { file: string; content: Buffer; sha256: string };
    definitions: string[];
  }>;
}

// The cluster of the definitions, as a test in Freelens that writes to it reaches it: the restricted session of
// SPEC-0004, which makes a second identity there (P23).
export interface DefinitionsSession extends TierSession {
  // kubectl as another user, through the impersonation that the kubeconfig of the scripts may do, whose answer is
  // returned whether it succeeded or not: whether the cluster allows a request to that user, and the message of its
  // refusal, as the cluster gives it.
  impersonate(user: string, args: string[]): { status: number; stdout: string; stderr: string };
  // The API server of the kubeconfig of the scripts and the authority that kind generated for it, for the kubeconfig
  // of a second identity on the same cluster.
  apiServer(): { server: string; certificateAuthorityData: string };
}

// What a session of a test holds beside its tier: the lock of the state folder, and the kubeconfig files of the user,
// which it compares when it closes.
type Opened<Session> = Omit<Session, "close">;

// Opens a tier for a test as a command of the scripts runs: the private umask, the local Docker, then the state folder
// under the lock of the run, which `close` releases, failing when the kubeconfig of the user changed meanwhile. It
// fails, holding nothing, when `open` does.
async function openTest<Session extends TierSession>(open: () => Promise<Opened<Session>>): Promise<Session> {
  process.umask(0o077);
  localDocker();
  preparePrivateFolder(STATE, ROOT);

  const files = kubeconfigFiles(process.env, homedir(), STATE);
  const before = fingerprints(files);
  const release = takeLock(STATE, process.pid, alive);

  try {
    const opened = await open();

    return {
      ...opened,
      close: () => {
        release();

        const changed = changedFiles(before, fingerprints(files));

        ensure(
          !changed.length,
          `The kubeconfig ${changed.join(", ")} changed during the run. The scripts never write it: check which program did`,
        );
      },
    } as Session;
  } catch (error) {
    release();
    throw error;
  }
}

// What `make` gives, made at the first call and kept once it succeeded: a call that fails keeps nothing, so that the
// next call makes it again, and a session that waits on it is not held by a failure that has passed.
export function onceItSucceeds<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined;

  return () => {
    made ??= make().catch((error: unknown) => {
      made = undefined;
      throw error;
    });
    return made;
  };
}

// kubectl and the server-side apply of a test on a tier.
function tierRequests(target: Tier): Omit<TierSession, "close"> {
  return {
    kubectl: (args, options = {}) => kubectl(target, args, { quiet: true, ...options }),
    apply: (manifest) =>
      lines(
        kubectl(
          target,
          ["apply", "--server-side", "--field-manager", FIELD_MANAGER, "--output", "name", "--filename", "-"],
          { input: manifest, quiet: true, timeout: 5 * 60_000 },
        ),
      ),
  };
}

// Opens the cluster of the real project for a test, as a command of the scripts opens it, and as a capture goes on,
// since a test makes workload clusters too: the tools, the limits of inotify, a real project with the providers of the
// pins and no other, and the files of the pins it uses, checked. It fails, holding nothing, when any of them is not
// so.
export async function openRealProject(): Promise<RealProjectSession> {
  const { pins, workflow } = readPins(ROOT);

  return openTest<RealProjectSession>(async () => {
    preflight(workflow, pins.managementKubernetes.version, REAL_PROJECT_NEEDS);
    raiseInotifyLimits();
    verifyTarget(MANAGEMENT);

    const { missing, other } = providersAgainstPins(installedProviders(), pins.clusterApi.version);

    ensure(
      !missing.length,
      `The cluster of the real project lacks ${missing.map((provider) => `${provider.type} ${provider.name}`).join(", ")}: run pnpm e2e:cluster:up first`,
    );
    ensure(!other.length, `${other.join("; ")}: take the environment down, and bring it up again`);

    const kindnet = kindnetManifest(
      (await pinnedContent(sourceFile(pins, DOWNLOADS, "test/e2e/data/cni/kindnet/kindnet.yaml"))).toString("utf8"),
    );
    // clusterctl and its configuration, written from the checked files at the first describe, and again at the next
    // one when that failed.
    const binary = onceItSucceeds(() => writeRepository(pins).then(() => clusterctlBinary(pins)));

    return {
      ...tierRequests(MANAGEMENT),
      kindnet: (namespace) => kindnetResources(kindnet, namespace),
      kubernetesVersion: pins.clusterApi.workloadKubernetesVersion,
      describeCluster: async (name) =>
        clusterctl(await binary(), MANAGEMENT, ["describe", "cluster", name, "--namespace", NAMESPACE], {
          quiet: true,
        }),
      sveltos: async () => {
        const extension = sveltosExtensionPackage(pins, DOWNLOADS);

        return {
          extension: {
            file: basename(extension.file),
            content: await pinnedContent(extension),
            sha256: extension.digest,
          },
          definitions: chartDefinitions(
            filesOfTarball(await pinnedContent(sveltosChart(pins, DOWNLOADS))),
            "projectsveltos",
          ),
        };
      },
    };
  });
}

// Opens the cluster of the definitions for a test in Freelens that writes to it, as a command of the scripts opens
// it, with the target checked before every request. It fails, holding nothing, when the cluster is not the one that
// the scripts created.
export async function openDefinitions(): Promise<DefinitionsSession> {
  return openTest<DefinitionsSession>(async () => {
    verifyTarget(DEFINITIONS);

    return {
      ...tierRequests(DEFINITIONS),
      impersonate: (user, args) => {
        verifyTarget(DEFINITIONS);

        const result = spawnSync("kubectl", kubectlArguments(DEFINITIONS, [...args, "--as", user]), {
          env: environment(DEFINITIONS.kubeconfig),
          encoding: "utf8",
          timeout: 2 * 60_000,
          maxBuffer: 64 * 1024 * 1024,
        });

        if (result.error) throw new Error(`kubectl ${args[0] ?? ""} did not complete: ${result.error.message}`);
        return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
      },
      apiServer: () => {
        const facts = targetFacts(DEFINITIONS);

        checkTarget(DEFINITIONS, facts);

        const [cluster] = (facts.config as { clusters: { cluster: Record<string, string> }[] }).clusters;

        return {
          server: cluster.cluster.server,
          certificateAuthorityData: cluster.cluster["certificate-authority-data"],
        };
      },
    };
  });
}

// kubectl on the cluster of the definitions.
function definitions(args: string[], options: RunOptions = {}): string {
  return kubectl(DEFINITIONS, args, { quiet: true, ...options });
}

// Removes the fixtures of a state from the cluster of the definitions: every finalizer of their objects first,
// the one of the scripts and those of the project, which no controller removes there, then their namespace.
function removeFixtures(state: FixtureState): void {
  const { namespace } = state;

  if (!definitions(["get", "namespace", namespace, "--ignore-not-found", "--output", "name"]).trim()) return;
  for (const object of readNamespace(definitions, namespace)) {
    if (!object.metadata.finalizers?.length) continue;
    definitions([
      ...["patch", resourceOf(object), object.metadata.name, "--namespace", namespace, "--type", "merge"],
      ...["--patch", JSON.stringify({ metadata: { finalizers: null } })],
    ]);
  }
  definitions(["delete", "namespace", namespace, "--wait", "--timeout", "300s"], { timeout: 6 * 60_000 });
}

// Applies the fixtures of a state to the cluster of the definitions, in place of those it has, and returns the
// moment of the run, to which their times move: the objects first, owners before their dependents, each one
// given the identifiers of its owners; then the changes that give an object its generation; then the status of
// each one through the status subresource; then the deletion of each deleting object, which the finalizers
// hold.
function applyFixtures(state: FixtureState): string {
  const objects = readFixtureSet(folderOf(state));

  for (const object of objects) {
    ensure(
      object.metadata.namespace === state.namespace,
      `${objectKey(object)} is not in the namespace of ${state.name}`,
    );
  }
  removeFixtures(state);

  const runAt = now();
  const plans = objects.map((object) => applyPlan(object, secondsBetween(CAPTURE_TIME, runAt)));
  const identifiers = new Map<string, string>();

  definitions(["create", "namespace", state.namespace]);
  for (const level of creationLevels(plans.map((plan) => plan.create))) {
    const bodies = level.map((object) => ({
      ...object,
      metadata: {
        ...object.metadata,
        ownerReferences: object.metadata.ownerReferences?.map((owner) => ({
          ...owner,
          uid: identifiers.get(
            objectKey({
              apiVersion: owner.apiVersion,
              kind: owner.kind,
              metadata: { ...object.metadata, name: owner.name },
            }),
          ),
        })),
      },
    }));

    for (const created of printedObjects(
      definitions(["create", "--output", "json", "--filename", "-"], { input: list(bodies) }),
    )) {
      identifiers.set(objectKey(created), String(created.metadata.uid));
    }
  }
  for (const plan of plans) {
    for (const change of plan.changes) {
      definitions([
        ...["patch", resourceOf(plan.create), plan.create.metadata.name, "--namespace", state.namespace],
        ...["--type", "merge", "--patch", JSON.stringify(change)],
      ]);
    }
  }

  const current = new Map(readNamespace(definitions, state.namespace).map((object) => [objectKey(object), object]));
  const statuses = plans
    .filter((plan) => plan.status)
    .map((plan) => ({ ...current.get(plan.key), status: plan.status }));

  if (statuses.length) {
    definitions(["replace", "--subresource", "status", "--output", "name", "--filename", "-"], {
      input: list(statuses),
    });
  }
  for (const plan of plans.filter((item) => item.deleting)) {
    definitions([
      ...["delete", resourceOf(plan.create), plan.create.metadata.name, "--namespace", state.namespace],
      "--wait=false",
    ]);
  }
  console.log(
    `Applied the ${objects.length} objects of ${state.name} to ${DEFINITIONS.context}, in ${state.namespace}`,
  );
  return runAt;
}

function fixturesUp(states: readonly FixtureState[]): void {
  verifyTarget(DEFINITIONS);
  for (const state of states) applyFixtures(state);
}

function fixturesDown(states: readonly FixtureState[]): void {
  verifyTarget(DEFINITIONS);
  for (const state of states) removeFixtures(state);
  console.log(`Removed the fixtures of ${states.map((state) => state.name).join(", ")} from ${DEFINITIONS.context}`);
}

// The round trip of the fixtures: each set applied to the cluster of the definitions, every object read back at
// the version of its file, cleaned as a capture is, and compared with its file; the times of creation and of
// deletion, which only the API server writes, apart. Each set is removed after its check. Every difference is
// reported, and makes the command fail.
function fixturesCheck(states: readonly FixtureState[]): void {
  const failures: string[] = [];

  verifyTarget(DEFINITIONS);
  for (const state of states) {
    try {
      const runAt = applyFixtures(state);
      const read = readNamespace(definitions, state.namespace).map(
        (object) => cleanObject(object, secondsBetween(runAt, CAPTURE_TIME)).object,
      );
      const found = roundTripDifferences(readFixtureSet(folderOf(state)), read);

      if (found.length) failures.push(`${state.name}:\n  ${found.join("\n  ")}`);
      else console.log(`${state.name}: every object reads back as its file`);
    } catch (error) {
      failures.push(`${state.name}: ${message(error)}`);
    } finally {
      try {
        removeFixtures(state);
      } catch (error) {
        failures.push(`${state.name}, removing it: ${message(error)}`);
      }
    }
  }
  ensure(
    !failures.length,
    `${failures.length} of ${states.length} fixture sets do not read back as their files:\n${failures.join("\n")}`,
  );
  console.log(`The ${states.length} fixture sets read back as their files`);
}

export const COMMAND_NAMES = [
  "up",
  "up-definitions",
  "down",
  "demo",
  "check-pins",
  "capture",
  "fixtures-up",
  "fixtures-down",
  "fixtures-check",
] as const;

type CommandName = (typeof COMMAND_NAMES)[number];

// Each command, whether it uses Docker, which is then checked first, and the states of the fixtures it takes:
// none, at least one, or, when none is given, every one. `capture` takes only the states that it captures.
const COMMANDS: Record<
  CommandName,
  {
    run: (states: readonly FixtureState[]) => void | Promise<void>;
    docker: boolean;
    states: "none" | "required" | "optional";
  }
> = {
  up: { run: up, docker: true, states: "none" },
  "up-definitions": { run: upDefinitions, docker: true, states: "none" },
  down: { run: down, docker: true, states: "none" },
  demo: { run: demo, docker: true, states: "none" },
  "check-pins": { run: checkPins, docker: false, states: "none" },
  capture: { run: capture, docker: true, states: "required" },
  "fixtures-up": { run: fixturesUp, docker: true, states: "required" },
  "fixtures-down": { run: fixturesDown, docker: true, states: "optional" },
  "fixtures-check": { run: fixturesCheck, docker: true, states: "optional" },
};

// The command of the arguments, which must be one of the commands, and the states that follow it, which must be
// states of the fixtures, or `all`, for a command that takes them.
export function parseCommand(argv: readonly string[]): { name: CommandName; states: FixtureState[] } {
  const [name, ...rest] = argv;
  const usage = `Usage: node e2e/scripts/environment.mts <${COMMAND_NAMES.join("|")}> [<state>...|all]`;

  ensure(
    COMMAND_NAMES.some((command) => command === name),
    usage,
  );

  const command = COMMANDS[name as CommandName];

  ensure(command.states !== "none" || !rest.length, usage);
  ensure(command.states !== "required" || rest.length, `${usage}: ${name} takes the states of the fixtures`);
  return {
    name: name as CommandName,
    states: command.states === "none" ? [] : statesOf(rest.length ? rest : ["all"], name === "capture"),
  };
}

// Runs a command: Docker first, for a command that uses it, then the state folder, under the lock of the
// run. The kubeconfig files of the user are compared before and after the command, whether it succeeded or
// failed; a change is reported after the error of the command, if it had one.
export async function main(argv: readonly string[]): Promise<void> {
  const parsed = parseCommand(argv);
  const command = COMMANDS[parsed.name];

  process.umask(0o077);
  if (command.docker) localDocker();
  preparePrivateFolder(STATE, ROOT);

  const files = kubeconfigFiles(process.env, homedir(), STATE);
  const before = fingerprints(files);
  const release = takeLock(STATE, process.pid, alive);
  let failure: unknown;

  try {
    await command.run(parsed.states);
  } catch (error) {
    failure = error;
  } finally {
    release();
  }

  const changed = changedFiles(before, fingerprints(files));

  if (changed.length) {
    const change = new Error(
      `The kubeconfig ${changed.join(", ")} changed during the run. The scripts never write it: check which program did`,
    );

    if (failure === undefined) failure = change;
    else console.error(`Error: ${change.message}`);
  }
  if (failure !== undefined) throw failure;
}
