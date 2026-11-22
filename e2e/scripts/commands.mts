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
//
// Run again, `up` and `up-definitions` resume. The scripts keep their state in a private folder outside the
// repository: for each kind cluster a kubeconfig of their own and the ID of its node, and the cache of what
// they download, which is checked against its pin every time it is used. Before every request they check that
// the API server of the kubeconfig is local and published by the node they created. They never write the
// kubeconfig of the user, and check that a run left it as it was.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertKindNode, assertLocalDocker, ensure, localApiServer, workloadContainerIds } from "./checks.mts";
import {
  certManagerComponents,
  everyPinnedFile,
  operatorComponents,
  pinnedContent,
  releaseAsset,
  sourceFile,
} from "./downloads.mts";
import { childEnvironment, clusterctlAsset, INOTIFY_LIMITS, inotifySettings } from "./host.mts";
import {
  clusterctlConfiguration,
  customResourceDefinitions,
  kindConfiguration,
  kindnetLabelArgument,
  kindnetManifest,
  kindnetResources,
  PROVIDERS,
} from "./manifests.mts";
import { CLUSTER_API_SOURCES, kubernetesMinor, readPins } from "./pins.mts";
import { changedFiles, fingerprints, kubeconfigFiles, preparePrivateFolder, stateFolder, takeLock } from "./state.mts";

import type { ClusterApiAsset, Pins, WorkflowPins } from "./pins.mts";

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

// The workload clusters of the real project, made from the templates of the release, with one control
// plane each: one with a MachineDeployment and kindnet, which becomes healthy, and one with a MachinePool and
// no network add-on, whose Nodes never become ready.
export interface Workload {
  name: string;
  flavor: string;
  workers: number;
  kindnet: boolean;
}

const WORKLOADS: readonly Workload[] = [
  { name: "freelens-capi-md", flavor: "development", workers: 2, kindnet: true },
  { name: "freelens-capi-mp", flavor: "development-mp", workers: 1, kindnet: false },
];
const NAMESPACE = "default";
const FIELD_MANAGER = "freelens-capi-environment";
const AVAILABLE_WITHIN_MINUTES = 20;

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

// The checks of a target before any request: the kubeconfig of the scripts holds one context, whose API
// server is on a loopback address, published there by the node that the scripts recorded when they created
// the cluster.
function checkTarget(target: Tier, facts: TargetFacts): void {
  assertKindNode(facts.node, {
    name: target.name,
    server: localApiServer(facts.config, target.context),
    nodeId: recordedNode(target),
    dockerSocket: target.dockerSocket,
  });
}

function verifyTarget(target: Tier): void {
  ensure(existsSync(target.kubeconfig), `The state folder has no kubeconfig of ${target.name}: take it down`);
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
function workloadContainers(workload: Workload): string[] {
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

interface InventoryProvider {
  metadata: { namespace: string };
  providerName: string;
  type: string;
  version: string;
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

  preflight(workflow, pins.managementKubernetes.version, { processors: 4, memoryGiB: 8 });
  raiseInotifyLimits();
  await writeRepository(pins);

  const binary = await clusterctlBinary(pins);
  const kindnet = kindnetManifest(
    (await pinnedContent(sourceFile(pins, DOWNLOADS, "test/e2e/data/cni/kindnet/kindnet.yaml"))).toString("utf8"),
  );

  ensureKindCluster(MANAGEMENT, pins.managementKubernetes.version);

  // The providers that clusterctl installed, from its inventory: a run that resumes installs only the
  // missing ones, since clusterctl refuses to install a provider twice.
  const before = installedProviders();
  const missing = PROVIDERS.filter(
    (provider) => !before.some((item) => item.type === provider.type && item.providerName === provider.name),
  );

  for (const item of before) {
    ensure(
      item.version === version,
      `${item.type} ${item.providerName} is installed at ${item.version}, and the pins say ${version}: take the environment down first`,
    );
  }
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
  workloadContainers(workload: Workload): string[];
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
  workloads: readonly Workload[],
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
    WORKLOADS,
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

export const COMMAND_NAMES = ["up", "up-definitions", "down", "demo", "check-pins"] as const;

type CommandName = (typeof COMMAND_NAMES)[number];

// Each command, and whether it uses Docker, which is then checked first.
const COMMANDS: Record<CommandName, { run: () => void | Promise<void>; docker: boolean }> = {
  up: { run: up, docker: true },
  "up-definitions": { run: upDefinitions, docker: true },
  down: { run: down, docker: true },
  demo: { run: demo, docker: true },
  "check-pins": { run: checkPins, docker: false },
};

// The name of the command of the arguments, which must be one of the commands and come alone.
export function parseCommand(argv: readonly string[]): CommandName {
  const [name, ...rest] = argv;

  ensure(
    COMMAND_NAMES.some((command) => command === name) && !rest.length,
    `Usage: node e2e/scripts/environment.mts <${COMMAND_NAMES.join("|")}>`,
  );
  return name as CommandName;
}

// Runs a command: Docker first, for a command that uses it, then the state folder, under the lock of the
// run. The kubeconfig files of the user are compared before and after the command, whether it succeeded or
// failed; a change is reported after the error of the command, if it had one.
export async function main(argv: readonly string[]): Promise<void> {
  const command = COMMANDS[parseCommand(argv)];

  process.umask(0o077);
  if (command.docker) localDocker();
  preparePrivateFolder(STATE, ROOT);

  const files = kubeconfigFiles(process.env, homedir(), STATE);
  const before = fingerprints(files);
  const release = takeLock(STATE, process.pid, alive);
  let failure: unknown;

  try {
    await command.run();
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
