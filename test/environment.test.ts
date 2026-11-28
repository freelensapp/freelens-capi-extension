// The checks of the scripts of the test environment that need no cluster: the pins, the API server of a
// kubeconfig of the scripts and its node, the local Docker, the digest of a download, the files of an archive,
// the private state and its lock, the environment of a command, the containers that `down` deletes and what it
// decides, the providers of the real project against the pins, the command line, what the scripts make of the
// files of a release and of a chart, the fixtures: the shift of their times, the cleaning of a captured
// object, their apply, their YAML, their states and the sets of the repository, and the captures of Kamaji of
// SPEC-0028: the cluster of the captures, its pins and its providers, the commands, the nine states, the cleaning and
// the README of their sets, the definitions of Kamaji on the first tier and the workflow of the captures.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filesOfTarball, headerChecksum } from "../e2e/scripts/archives.mts";
import {
  assertDigest,
  assertKindNode,
  assertLocalDocker,
  isLoopbackHost,
  localApiServer,
  sha256,
  workloadContainerIds,
} from "../e2e/scripts/checks.mts";
import {
  applyObjects,
  CAPTURE_LEAVES_OUT,
  COMMAND_NAMES,
  captureNamespaces,
  DOWN_WORKLOADS,
  IDENTITY_NAMESPACE,
  KAMAJI_WORKLOADS,
  kamajiProvidersAgainstPins,
  onceItSucceeds,
  ownNamespaceProblem,
  parseCommand,
  providerDeployments,
  providersAgainstPins,
  removeCapture,
  removeObjects,
  TIER_RESOURCES,
  takeDown,
} from "../e2e/scripts/commands.mts";
import {
  everyPinnedFile,
  helmArchive,
  kamajiChartFile,
  kamajiEtcdChart,
  kamajiProviderAsset,
  metallbManifest,
  pinnedContent,
  sveltosChart,
  sveltosExtensionPackage,
} from "../e2e/scripts/downloads.mts";
import {
  applyPlan,
  CAPTURE_TIME,
  cleanObject,
  creationLevels,
  FIXTURE_CHECKSUM,
  FIXTURE_FINALIZER,
  FIXTURE_RESOURCES,
  FIXTURES_FOLDER,
  fixtureFiles,
  fixtureResourcesOn,
  HOST_BOOT_ID,
  HOST_CAPACITY,
  HOST_KERNEL,
  isTime,
  KAMAJI_RESOURCES,
  PROBE_TIME_WORDS,
  readFixtureSet,
  roundTripDifferences,
  secondsBetween,
  shiftTime,
  shiftTimes,
  timesInsideText,
} from "../e2e/scripts/fixtures.mts";
import {
  assertCapturesHost,
  childEnvironment,
  clusterctlAsset,
  conntrackMax,
  conntrackSetting,
  INOTIFY_LIMITS,
  inotifySettings,
  raiseConntrackMax,
  restoreConntrackMax,
} from "../e2e/scripts/host.mts";
import {
  ADDRESS_HELPER,
  assertChartDependencies,
  ciRun,
  describedClusterRow,
  KAMAJI_CLUSTER,
  KAMAJI_STATES,
  kamajiReadme,
  nextMinor,
  readmeRecords,
} from "../e2e/scripts/kamaji.mts";
import {
  chartDefinitions,
  clusterctlConfiguration,
  customResourceDefinitions,
  definitionName,
  KAMAJI_PROVIDER,
  KINDNET_LABEL,
  kamajiCluster,
  kindnetLabelArgument,
  kindnetManifest,
  kindnetResources,
  metallbPool,
  objectsWithoutStatus,
  poolAddress,
  relabeledDefinitions,
  S7,
  s7Clusters,
  s7ClusterWithNoReference,
} from "../e2e/scripts/manifests.mts";
import { kubernetesMinor, PINS_FILE, parsePins, parseWorkflowPins, readPins } from "../e2e/scripts/pins.mts";
import {
  changedFiles,
  fingerprints,
  isInside,
  kubeconfigFiles,
  preparePrivateFolder,
  stateFolder,
  takeLock,
} from "../e2e/scripts/state.mts";
import {
  FIXTURE_STATES,
  fixtureReadme,
  HAND_WRITTEN_STATE,
  healthChecksPending,
  notHealthy,
  selects,
  statesOf,
} from "../e2e/scripts/states.mts";
import { parseDocuments, plainAllowed, stringifyDocuments } from "../e2e/scripts/yaml.mts";

import type {
  CapturesTier,
  DefinitionsSession,
  DownOperations,
  InventoryProvider,
  Tier,
  Workload,
} from "../e2e/scripts/commands.mts";
import type { Fetch, PinnedFile } from "../e2e/scripts/downloads.mts";
import type { KubeObject } from "../e2e/scripts/fixtures.mts";
import type { ConntrackHost } from "../e2e/scripts/host.mts";
import type { KamajiProject, KamajiState } from "../e2e/scripts/kamaji.mts";

const root = join(import.meta.dirname, "..");
const pinsText = readFileSync(join(root, PINS_FILE), "utf8");

// The folders that a test made, removed after it.
const folders: string[] = [];

function folder(): string {
  const made = mkdtempSync(join(tmpdir(), "capi-environment-test-"));

  folders.push(made);
  return made;
}

afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});

// The pins file of the repository, changed by `change`.
function changedPins(change: (pins: Record<string, any>) => void): string {
  const pins = JSON.parse(pinsText);

  change(pins);
  return JSON.stringify(pins);
}

describe("the pins", () => {
  it("reads the pins of the repository, and kind from the integration workflow", () => {
    expect(() => readPins(root)).not.toThrow();
  });

  it("pins the Kubernetes of the kind clusters inside the range that it declares, which Renovate keeps", () => {
    const { version, supported } = readPins(root).pins.managementKubernetes;
    const from = kubernetesMinor(supported.from);
    const to = kubernetesMinor(supported.to);
    const rule = JSON.parse(readFileSync(join(root, ".renovaterc.json"), "utf8")).packageRules.find(
      (packageRule: { matchDepNames?: string[] }) => packageRule.matchDepNames?.includes("kindest/node"),
    );
    const allowed = new RegExp(rule.allowedVersions.slice(1, -1));

    expect(kubernetesMinor(version)).toBeGreaterThanOrEqual(from);
    expect(kubernetesMinor(version)).toBeLessThanOrEqual(to);
    // The rule of Renovate allows the same minor versions as the pins, and no other.
    for (let minor = from - 2; minor <= to + 2; minor++) {
      expect(allowed.test(`v1.${minor}.0`)).toBe(minor >= from && minor <= to);
    }
  });

  it.each([
    [
      "a digest in capitals",
      (pins: Record<string, any>) => {
        pins.clusterApi.assets["core-components.yaml"] = pins.clusterApi.assets["core-components.yaml"].toUpperCase();
      },
      /clusterApi\.assets\.core-components\.yaml is not a SHA-256 digest/,
    ],
    [
      "a digest cut short",
      (pins: Record<string, any>) => {
        pins.clusterApiOperator.assets["operator-components.yaml"] = pins.clusterApiOperator.assets[
          "operator-components.yaml"
        ].slice(0, 16);
      },
      /clusterApiOperator\.assets\.operator-components\.yaml is not a SHA-256 digest/,
    ],
    [
      "a source without its digest",
      (pins: Record<string, any>) => {
        delete pins.clusterApi.sources["test/e2e/data/cni/kindnet/kindnet.yaml"];
      },
      /clusterApi\.sources misses test\/e2e\/data\/cni\/kindnet\/kindnet\.yaml/,
    ],
    [
      "an asset the scripts do not download",
      (pins: Record<string, any>) => {
        pins.clusterApi.assets["clusterctl-windows-amd64.exe"] = "0".repeat(64);
      },
      /clusterApi\.assets has clusterctl-windows-amd64\.exe, which the scripts do not know/,
    ],
    [
      "a prerelease",
      (pins: Record<string, any>) => {
        pins.clusterApi.version = `${pins.clusterApi.version}-beta.1`;
      },
      /clusterApi\.version is not a release version/,
    ],
    [
      "a version without its v",
      (pins: Record<string, any>) => {
        pins.certManager.version = pins.certManager.version.slice(1);
      },
      /certManager\.version is not a release version/,
    ],
    [
      "a Kubernetes of the workload clusters that is not a release",
      (pins: Record<string, any>) => {
        pins.clusterApi.workloadKubernetesVersion = "latest";
      },
      /clusterApi\.workloadKubernetesVersion is not a release version/,
    ],
    [
      "a Kubernetes to upgrade the workload clusters from that is not a release",
      (pins: Record<string, any>) => {
        pins.clusterApi.workloadKubernetesUpgradeFrom = "v1.36";
      },
      /clusterApi\.workloadKubernetesUpgradeFrom is not a release version/,
    ],
    [
      "a Kubernetes to upgrade the workload clusters from that is not before theirs",
      (pins: Record<string, any>) => {
        pins.clusterApi.workloadKubernetesUpgradeFrom = pins.clusterApi.workloadKubernetesVersion;
      },
      /clusterApi\.workloadKubernetesUpgradeFrom v1\.\d+\.\d+ is not before clusterApi\.workloadKubernetesVersion/,
    ],
    [
      "a commit cut short",
      (pins: Record<string, any>) => {
        pins.clusterApi.commit = pins.clusterApi.commit.slice(0, 12);
      },
      /clusterApi\.commit is not a commit/,
    ],
    [
      "another repository for Renovate",
      (pins: Record<string, any>) => {
        pins.clusterApiOperator.depName = "kubernetes-sigs/cluster-api";
      },
      /clusterApiOperator\.depName is not kubernetes-sigs\/cluster-api-operator/,
    ],
    [
      "another datasource for Renovate",
      (pins: Record<string, any>) => {
        pins.clusterApi.datasource = "github-tags";
      },
      /clusterApi\.datasource is not github-releases/,
    ],
    [
      "a version before its datasource and depName, which Renovate does not read",
      (pins: Record<string, any>) => {
        const { version, ...rest } = pins.clusterApiOperator;

        pins.clusterApiOperator = { version, ...rest };
      },
      /clusterApiOperator: datasource, depName and version do not follow each other in this order/,
    ],
    [
      "a pin of a project the scripts do not know",
      (pins: Record<string, any>) => {
        pins.calico = { version: "v3.30.0", assets: {} };
      },
      /has calico, which the scripts do not know/,
    ],
    [
      "a Kubernetes of the kind clusters above the range that it declares",
      (pins: Record<string, any>) => {
        const { supported } = pins.managementKubernetes;

        pins.managementKubernetes.version = `v1.${kubernetesMinor(supported.to) + 1}.0`;
      },
      /managementKubernetes\.version v1\.\d+\.0 is outside v1\.\d+ to v1\.\d+/,
    ],
    [
      "a Kubernetes of the kind clusters below the range that it declares",
      (pins: Record<string, any>) => {
        const { supported } = pins.managementKubernetes;

        pins.managementKubernetes.version = `v1.${kubernetesMinor(supported.from) - 1}.0`;
      },
      /managementKubernetes\.version v1\.\d+\.0 is outside/,
    ],
    [
      "a range of the Kubernetes of the kind clusters that is not of minor versions",
      (pins: Record<string, any>) => {
        pins.managementKubernetes.supported.to = `${pins.managementKubernetes.supported.to}.0`;
      },
      /managementKubernetes\.supported\.to is not a minor version/,
    ],
    [
      "another image for the Kubernetes of the kind clusters",
      (pins: Record<string, any>) => {
        pins.managementKubernetes.depName = "kindest/haproxy";
      },
      /managementKubernetes\.depName is not kindest\/node/,
    ],
    [
      "a version of the Sveltos extension with a v, which npm does not write",
      (pins: Record<string, any>) => {
        pins.sveltos.extension.version = `v${pins.sveltos.extension.version}`;
      },
      /sveltos\.extension\.version is not a version/,
    ],
    [
      "a digest of the chart of Sveltos cut short",
      (pins: Record<string, any>) => {
        pins.sveltos.chart.sha256 = pins.sveltos.chart.sha256.slice(0, 32);
      },
      /sveltos\.chart\.sha256 is not a SHA-256 digest/,
    ],
    [
      "the pins of S6 without the chart of Sveltos",
      (pins: Record<string, any>) => {
        delete pins.sveltos.chart;
      },
      /sveltos misses chart/,
    ],
    [
      "an address for the package of the Sveltos extension, which the scripts make",
      (pins: Record<string, any>) => {
        pins.sveltos.extension.url = "https://example.com/sveltos-extension.tgz";
      },
      /sveltos\.extension has url, which the scripts do not know/,
    ],
    // The pins of the cluster of the captures of SPEC-0028 (P3), each refused without its digest, as the others.
    [
      "the Kamaji control plane provider without the digest of its metadata",
      (pins: Record<string, any>) => {
        delete pins.kamajiProvider.assets["metadata.yaml"];
      },
      /kamajiProvider\.assets misses metadata\.yaml/,
    ],
    [
      "a digest of the components of the Kamaji control plane provider in capitals",
      (pins: Record<string, any>) => {
        const assets = pins.kamajiProvider.assets;

        assets["control-plane-components.yaml"] = assets["control-plane-components.yaml"].toUpperCase();
      },
      /kamajiProvider\.assets\.control-plane-components\.yaml is not a SHA-256 digest/,
    ],
    [
      "a file of the chart of Kamaji without its digest",
      (pins: Record<string, any>) => {
        pins.kamaji.chart["charts/kamaji/templates/controller.yaml"] = "";
      },
      /kamaji\.chart\.charts\/kamaji\/templates\/controller\.yaml is not a SHA-256 digest/,
    ],
    [
      "the chart of Kamaji without a file that the scripts read themselves",
      (pins: Record<string, any>) => {
        delete pins.kamaji.chart["charts/kamaji/crds/kamaji.clastix.io_tenantcontrolplanes.yaml"];
      },
      /kamaji\.chart misses charts\/kamaji\/crds\/kamaji\.clastix\.io_tenantcontrolplanes\.yaml/,
    ],
    [
      "a file outside the folder of the chart of Kamaji",
      (pins: Record<string, any>) => {
        pins.kamaji.chart["charts/kamaji/../../go.mod"] = "0".repeat(64);
      },
      /kamaji\.chart has charts\/kamaji\/\.\.\/\.\.\/go\.mod, which is not a file of the folder charts\/kamaji/,
    ],
    [
      "a version of Kamaji that is not an edge release, the one kind of release that it publishes",
      (pins: Record<string, any>) => {
        pins.kamaji.version = pins.kamaji.version.replace(/-edge$/, "");
      },
      /kamaji\.version is not an edge release/,
    ],
    [
      "a commit of Kamaji cut short",
      (pins: Record<string, any>) => {
        pins.kamaji.commit = pins.kamaji.commit.slice(0, 12);
      },
      /kamaji\.commit is not a commit/,
    ],
    [
      "kamaji-etcd without its digest",
      (pins: Record<string, any>) => {
        delete pins.kamajiEtcd.sha256;
      },
      /kamajiEtcd misses sha256/,
    ],
    [
      "a digest of MetalLB cut short",
      (pins: Record<string, any>) => {
        pins.metallb.sha256 = pins.metallb.sha256.slice(0, 63);
      },
      /metallb\.sha256 is not a SHA-256 digest/,
    ],
    [
      "a version of MetalLB without its v",
      (pins: Record<string, any>) => {
        pins.metallb.version = pins.metallb.version.slice(1);
      },
      /metallb\.version is not a release version/,
    ],
    [
      "helm without its digest",
      (pins: Record<string, any>) => {
        delete pins.helm.sha256;
      },
      /helm misses sha256/,
    ],
    [
      "the pins without MetalLB",
      (pins: Record<string, any>) => {
        delete pins.metallb;
      },
      /misses metallb/,
    ],
  ])("refuses %s", (_case, change, error) => {
    expect(() => parsePins(changedPins(change))).toThrow(error);
  });

  it("refuses a file that is not JSON", () => {
    expect(() => parsePins(pinsText.replace("{", "["))).toThrow(/is not JSON/);
  });

  // A workflow with the env of the template, and versions of no release in particular.
  const workflow = [
    "name: Integration tests",
    "",
    "env:",
    "  kind_version: 0.1.2 # datasource=github-releases depName=kubernetes-sigs/kind",
    "  kubernetes_version: 1.2.3 # datasource=docker depName=kindest/node",
    "",
    "jobs:",
    "  test-integration:",
    "    env:",
    "      DO_NOT_TRACK: 1",
    "",
  ].join("\n");

  it("reads kind from the top-level env of the workflow, without the hint of Renovate", () => {
    expect(parseWorkflowPins(workflow)).toEqual({ kind: "0.1.2" });
  });

  it.each([
    [
      "without kind",
      (text: string) => text.replace(/^ {2}kind_version:.*$/m, ""),
      /kind_version of .* is not a version/,
    ],
    [
      "with a version that is not one",
      (text: string) => text.replace(/^( {2}kind_version:) \S+/m, "$1 latest"),
      /kind_version of .* is not a version/,
    ],
    [
      "with kind only in the env of a job",
      (text: string) =>
        text.replace(/^ {2}kind_version:.*$/m, "").replace(/^( {4}env:)$/m, "$1\n      kind_version: 0.1.2"),
      /kind_version of .* is not a version/,
    ],
    [
      "with kind twice",
      (text: string) => text.replace(/^( {2}kind_version:.*)$/m, "$1\n$1"),
      /sets kind_version twice/,
    ],
  ])("refuses a workflow %s", (_case, change, error) => {
    const changed = change(workflow);

    expect(changed).not.toBe(workflow);
    expect(() => parseWorkflowPins(changed)).toThrow(error);
  });
});

// A kubeconfig of the scripts, as `kubectl config view --raw -o json` prints the one that kind writes.
function kindKubeconfig(server = "https://127.0.0.1:41234"): Record<string, any> {
  const name = "kind-freelens-capi-definitions";

  return {
    kind: "Config",
    apiVersion: "v1",
    preferences: {},
    clusters: [{ name, cluster: { server, "certificate-authority-data": "Q0E=" } }],
    users: [{ name, user: { "client-certificate-data": "Q0VSVA==", "client-key-data": "S0VZ" } }],
    contexts: [{ name, context: { cluster: name, user: name } }],
    "current-context": name,
  };
}

const NODE_ID = "a1".repeat(32);

// The node of the kind cluster, as `docker inspect` prints it.
function kindNode(port = "41234", hostIp = "127.0.0.1"): Record<string, any>[] {
  return [
    {
      Id: NODE_ID,
      Name: "/freelens-capi-definitions-control-plane",
      State: { Running: true },
      Config: {
        Labels: { "io.x-k8s.kind.cluster": "freelens-capi-definitions", "io.x-k8s.kind.role": "control-plane" },
      },
      Mounts: [{ Source: "/var/run/docker.sock", Destination: "/var/run/docker.sock" }],
      NetworkSettings: { Ports: { "6443/tcp": [{ HostIp: hostIp, HostPort: port }] } },
    },
  ];
}

describe("the check of a local API server", () => {
  const context = "kind-freelens-capi-definitions";

  it.each([
    "https://127.0.0.1:41234",
    "https://127.0.0.2:41234",
    "https://127.1:41234",
    "https://[::1]:41234",
    "https://[0:0:0:0:0:0:0:1]:41234",
  ])("accepts %s", (server) => {
    expect(isLoopbackHost(localApiServer(kindKubeconfig(server), context).hostname)).toBe(true);
  });

  it.each([
    "https://10.0.0.1:6443",
    "https://192.168.1.20:6443",
    "https://[::ffff:127.0.0.1]:6443",
    "https://localhost:6443",
    "https://kubernetes.example.com:6443",
    "https://127.0.0.1.example.com:6443",
  ])("refuses %s", (server) => {
    expect(() => localApiServer(kindKubeconfig(server), context)).toThrow(/is not a loopback address/);
  });

  it.each([
    [
      "a server over HTTP",
      (config: Record<string, any>) => {
        config.clusters[0].cluster.server = "http://127.0.0.1:41234";
      },
      /not reached over HTTPS/,
    ],
    [
      "a server with no port",
      (config: Record<string, any>) => {
        config.clusters[0].cluster.server = "https://127.0.0.1";
      },
      /has no port/,
    ],
    [
      "a second context",
      (config: Record<string, any>) => {
        config.contexts.push({ name: "production", context: { cluster: "production", user: "production" } });
      },
      /does not hold one context/,
    ],
    [
      "another current context",
      (config: Record<string, any>) => {
        config["current-context"] = "production";
      },
      /names another context/,
    ],
    [
      "a context that names another cluster",
      (config: Record<string, any>) => {
        config.contexts[0].context.cluster = "production";
      },
      /does not name the cluster and the user of its kubeconfig/,
    ],
    [
      "a context that names another user",
      (config: Record<string, any>) => {
        config.contexts[0].context.user = "production";
      },
      /does not name the cluster and the user of its kubeconfig/,
    ],
    [
      "a cluster with no authority",
      (config: Record<string, any>) => {
        delete config.clusters[0].cluster["certificate-authority-data"];
      },
      /not reached with the authority of kind alone/,
    ],
    [
      "a proxy",
      (config: Record<string, any>) => {
        config.clusters[0].cluster["proxy-url"] = "http://127.0.0.1:3128";
      },
      /not reached with the authority of kind alone/,
    ],
    [
      "a cluster that skips the verification of the server",
      (config: Record<string, any>) => {
        config.clusters[0].cluster["insecure-skip-tls-verify"] = true;
      },
      /not reached with the authority of kind alone/,
    ],
    [
      "a credential plugin",
      (config: Record<string, any>) => {
        config.users[0].user = { exec: { command: "aws", args: ["eks", "get-token"] } };
      },
      /is not the client certificate of kind/,
    ],
  ])("refuses %s", (_case, change, error) => {
    const config = kindKubeconfig();

    change(config);
    expect(() => localApiServer(config, context)).toThrow(error);
  });

  const server = localApiServer(kindKubeconfig(), context);
  const expected = { name: "freelens-capi-definitions", server, nodeId: NODE_ID, dockerSocket: true };

  it("accepts the node that the scripts created, which publishes the API server", () => {
    expect(() => assertKindNode(kindNode(), expected)).not.toThrow();
  });

  it.each([
    ["a node that the state did not record", (node: Record<string, any>) => node, { nodeId: undefined }, /no record/],
    [
      "another container of the same name",
      (node: Record<string, any>) => {
        node.Id = "b2".repeat(32);
      },
      {},
      /is not the container that the scripts created/,
    ],
    [
      "another name",
      (node: Record<string, any>) => {
        node.Name = "/freelens-capi-definitions-worker";
      },
      {},
      /is not the control plane node of the kind cluster freelens-capi-definitions/,
    ],
    [
      "the label of another kind cluster",
      (node: Record<string, any>) => {
        node.Config.Labels["io.x-k8s.kind.cluster"] = "freelens-capi-management";
      },
      {},
      /is not the control plane node/,
    ],
    [
      "another role",
      (node: Record<string, any>) => {
        node.Config.Labels["io.x-k8s.kind.role"] = "worker";
      },
      {},
      /is not the control plane node/,
    ],
    [
      "a node that is not running",
      (node: Record<string, any>) => {
        node.State.Running = false;
        node.NetworkSettings.Ports = {};
      },
      {},
      /is not running: start it with docker start freelens-capi-definitions-control-plane/,
    ],
    [
      "another port",
      (node: Record<string, any>) => {
        node.NetworkSettings.Ports["6443/tcp"][0].HostPort = "41235";
      },
      {},
      /does not publish its API server at 127\.0\.0\.1:41234/,
    ],
    [
      "every address",
      (node: Record<string, any>) => {
        node.NetworkSettings.Ports["6443/tcp"][0].HostIp = "0.0.0.0";
      },
      {},
      /does not publish its API server/,
    ],
    [
      "no socket of Docker for the real project",
      (node: Record<string, any>) => {
        node.Mounts = [];
      },
      {},
      /does not mount the socket of Docker/,
    ],
  ])("refuses %s", (_case, change, override, error) => {
    const nodes = kindNode();

    change(nodes[0]);
    expect(() => assertKindNode(nodes, { ...expected, ...override })).toThrow(error);
  });
});

describe("the local Docker", () => {
  it("accepts a Unix socket, from the context or from DOCKER_HOST", () => {
    expect(() => assertLocalDocker(undefined, "unix:///var/run/docker.sock")).not.toThrow();
    expect(() => assertLocalDocker("unix:///run/user/1000/docker.sock", "unix:///var/run/docker.sock")).not.toThrow();
  });

  it.each([
    ["a context over TCP", undefined, "tcp://192.168.1.20:2376"],
    ["a context over SSH", undefined, "ssh://builder@192.168.1.20"],
    ["DOCKER_HOST over TCP, before a local context", "tcp://127.0.0.1:2375", "unix:///var/run/docker.sock"],
    ["DOCKER_HOST over SSH, before a local context", "ssh://builder@192.168.1.20", "unix:///var/run/docker.sock"],
  ])("refuses %s", (_case, dockerHost, endpoint) => {
    expect(() => assertLocalDocker(dockerHost, endpoint)).toThrow(/the scripts need the local Docker/);
  });
});

describe("the check of a digest", () => {
  // The SHA-256 of "abc", from FIPS 180-2.
  const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  it("accepts the content that has the pinned digest", () => {
    expect(() => assertDigest("abc", Buffer.from("abc"), abc)).not.toThrow();
  });

  it("refuses any other content", () => {
    expect(() => assertDigest("abc", Buffer.from("abd"), abc)).toThrow(
      /abc has the SHA-256 [0-9a-f]{64}, and the pin is ba7816bf/,
    );
    expect(() => assertDigest("abc", Buffer.from(""), abc)).toThrow(/and the pin is/);
  });

  it("refuses a pin that is not a digest", () => {
    expect(() => assertDigest("abc", Buffer.from("abc"), abc.toUpperCase())).toThrow(/is not a SHA-256 digest/);
    expect(() => assertDigest("abc", Buffer.from("abc"), abc.slice(0, 63))).toThrow(/is not a SHA-256 digest/);
  });
});

describe("the downloads", () => {
  const content = Buffer.from("the content of a release asset\n");

  function pinned(cache: string): PinnedFile {
    return {
      name: "asset.yaml",
      url: "https://github.com/example/example/releases/download/v1.0.0/asset.yaml",
      file: join(cache, "asset.yaml"),
      digest: sha256(content),
      executable: false,
    };
  }

  // A fetch that answers with `answer`, and counts its calls.
  function fetching(answer: Buffer | Error): { fetch: Fetch; calls: () => number } {
    let calls = 0;
    const fetch: Fetch = async () => {
      calls++;
      if (answer instanceof Error) throw answer;
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(answer).buffer };
    };

    return { fetch, calls: () => calls };
  }

  const quiet = { log: () => undefined, retryDelay: 0 };

  it("keeps a download that has its digest", async () => {
    const file = pinned(folder());
    const { fetch, calls } = fetching(content);

    expect(await pinnedContent(file, { ...quiet, fetch })).toEqual(content);
    expect(readFileSync(file.file)).toEqual(content);
    expect(calls()).toBe(1);
  });

  it("refuses a download that does not have its digest, and keeps nothing", async () => {
    const file = pinned(folder());
    const { fetch } = fetching(Buffer.from("another content\n"));

    await expect(pinnedContent(file, { ...quiet, fetch })).rejects.toThrow(/asset\.yaml has the SHA-256/);
    expect(existsSync(file.file)).toBe(false);
    expect(existsSync(`${file.file}.part`)).toBe(false);
  });

  it("uses a copy of the cache that has its digest, with no download", async () => {
    const file = pinned(folder());
    const { fetch, calls } = fetching(new Error("no network"));

    writeFileSync(file.file, content);
    expect(await pinnedContent(file, { ...quiet, fetch })).toEqual(content);
    expect(calls()).toBe(0);
  });

  it("removes a copy of the cache that changed, and downloads the file again", async () => {
    const file = pinned(folder());
    const { fetch, calls } = fetching(content);

    writeFileSync(file.file, "a copy cut sh");
    expect(await pinnedContent(file, { ...quiet, fetch })).toEqual(content);
    expect(calls()).toBe(1);
  });

  it("removes a copy of the cache that changed also when the download fails", async () => {
    const file = pinned(folder());
    const { fetch } = fetching(new Error("no network"));

    writeFileSync(file.file, "a copy cut sh");
    await expect(pinnedContent(file, { ...quiet, fetch })).rejects.toThrow(/no network/);
    expect(existsSync(file.file)).toBe(false);
  });

  it("downloads a file again when asked, and keeps the copy when the download fails", async () => {
    const file = pinned(folder());
    const { fetch, calls } = fetching(new Error("no network"));

    writeFileSync(file.file, content);
    await expect(pinnedContent(file, { ...quiet, fetch, fresh: true })).rejects.toThrow(/no network/);
    expect(calls()).toBe(3);
    expect(readFileSync(file.file)).toEqual(content);
  });

  it("lists every pinned file once, from the official source of its project", () => {
    const { pins } = readPins(root);
    const files = everyPinnedFile(pins, "/cache");

    expect(new Set(files.map((file) => file.url)).size).toBe(files.length);
    expect(files.map((file) => file.digest).sort()).toEqual(
      [
        ...Object.values(pins.clusterApi.assets),
        ...Object.values(pins.clusterApi.sources),
        ...Object.values(pins.clusterApiOperator.assets),
        ...Object.values(pins.certManager.assets),
        pins.sveltos.extension.sha256,
        pins.sveltos.chart.sha256,
        ...Object.values(pins.kamajiProvider.assets),
        ...Object.values(pins.kamaji.chart),
        pins.kamajiEtcd.sha256,
        pins.metallb.sha256,
        pins.helm.sha256,
      ].sort(),
    );
    for (const file of files) {
      expect(file.url).toMatch(
        /^https:\/\/(github\.com\/(kubernetes-sigs\/cluster-api|kubernetes-sigs\/cluster-api-operator|cert-manager\/cert-manager|projectsveltos\/helm-charts|clastix\/cluster-api-control-plane-provider-kamaji)\/releases\/download\/|raw\.githubusercontent\.com\/(kubernetes-sigs\/cluster-api|clastix\/kamaji)\/[0-9a-f]{40}\/|raw\.githubusercontent\.com\/metallb\/metallb\/v\d+\.\d+\.\d+\/|registry\.npmjs\.org\/@freelensapp\/sveltos-extension\/-\/|clastix\.github\.io\/charts\/kamaji-etcd-|get\.helm\.sh\/helm-v\d+\.\d+\.\d+-linux-amd64\.tar\.gz$)/,
      );
    }
  });

  it("takes the package of the Sveltos extension from the npm registry, and the chart of Sveltos from its release, at the versions of the pins (SPEC-0004, P29)", () => {
    const { pins } = readPins(root);
    const { version: extension } = pins.sveltos.extension;
    const { version: chart } = pins.sveltos.chart;

    expect(sveltosExtensionPackage(pins, "/cache")).toEqual({
      name: `the package of @freelensapp/sveltos-extension ${extension}`,
      url: `https://registry.npmjs.org/@freelensapp/sveltos-extension/-/sveltos-extension-${extension}.tgz`,
      file: join("/cache", "sveltos-extension", extension, `sveltos-extension-${extension}.tgz`),
      digest: pins.sveltos.extension.sha256,
      executable: false,
    });
    expect(sveltosChart(pins, "/cache")).toEqual({
      name: `the chart projectsveltos ${chart}`,
      url: `https://github.com/projectsveltos/helm-charts/releases/download/projectsveltos-${chart}/projectsveltos-${chart}.tgz`,
      file: join("/cache", "projectsveltos", chart, `projectsveltos-${chart}.tgz`),
      digest: pins.sveltos.chart.sha256,
      executable: false,
    });
    // The releases that SPEC-0001 read and that the CI of the Sveltos extension applies at that release.
    expect([extension, chart]).toEqual(["2.1.0", "1.16.1"]);
  });
});

// An entry of a tar archive, as the POSIX ustar format writes it: a header of 512 bytes, with its checksum, then its data
// in blocks of 512 bytes.
function tarEntry(name: string, data: string, options: { type?: string; prefix?: string } = {}): Buffer {
  const content = Buffer.from(data);
  const header = Buffer.alloc(512);

  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.write(options.type ?? "0", 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  header.write(options.prefix ?? "", 345, 155, "utf8");
  header.write(`${headerChecksum(header).toString(8).padStart(6, "0")}\0 `, 148);
  return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512)]);
}

// A record of an extended header of pax: its length, which counts the whole record, then the key and the value.
function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;

  while (`${length}${body}`.length !== length) length++;
  return `${length}${body}`;
}

// A gzipped tar archive of the entries, with the two empty blocks that end it.
function tarball(...entries: Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

describe("the files of an archive", () => {
  it("keeps the regular files by their path, with their content, and no folder or link", () => {
    const files = filesOfTarball(
      tarball(
        tarEntry("chart/", "", { type: "5" }),
        tarEntry("chart/Chart.yaml", "name: chart\n"),
        tarEntry("chart/crds/a.yaml", "x".repeat(700)),
        tarEntry("chart/link", "", { type: "2" }),
      ),
    );

    expect([...files.keys()]).toEqual(["chart/Chart.yaml", "chart/crds/a.yaml"]);
    expect(files.get("chart/Chart.yaml")?.toString("utf8")).toBe("name: chart\n");
    expect(files.get("chart/crds/a.yaml")?.toString("utf8")).toBe("x".repeat(700));
  });

  it("takes the path of an entry from its prefix, from the extended header of pax before it, and from a long name of GNU", () => {
    const long = `chart/crds/${"a".repeat(120)}.yaml`;
    const files = filesOfTarball(
      tarball(
        tarEntry("b.yaml", "b", { prefix: "chart/crds" }),
        tarEntry("PaxHeader", paxRecord("path", long), { type: "x" }),
        tarEntry("cut-short.yaml", "pax"),
        tarEntry("././@LongLink", `${long}-gnu\0`, { type: "L" }),
        tarEntry("cut-short.yaml", "gnu"),
        tarEntry("old.yaml", "old", { type: "\0" }),
      ),
    );

    expect(Object.fromEntries([...files].map(([path, data]) => [path, data.toString("utf8")]))).toEqual({
      "chart/crds/b.yaml": "b",
      [long]: "pax",
      [`${long}-gnu`]: "gnu",
      "old.yaml": "old",
    });
  });

  it("refuses a header that does not match its checksum, and an archive cut short", () => {
    const entry = tarEntry("chart/Chart.yaml", "name: chart\n");
    const changed = Buffer.from(entry);

    changed[0] = "C".charCodeAt(0);
    expect(() => filesOfTarball(tarball(changed))).toThrow(/does not match the checksum of its header/);
    expect(() => filesOfTarball(gzipSync(entry))).toThrow(/cut short: it does not end with an empty block/);
    expect(() => filesOfTarball(gzipSync(tarEntry("chart/crds/a.yaml", "x".repeat(700)).subarray(0, 600)))).toThrow(
      /cut short: an entry has less data than its header says/,
    );
  });
});

describe("the private state", () => {
  it("is in $XDG_STATE_HOME when it is an absolute path, and in ~/.local/state otherwise", () => {
    expect(stateFolder({ XDG_STATE_HOME: "/state" }, "/home/user")).toBe("/state/freelens-capi-extension");
    expect(stateFolder({ XDG_STATE_HOME: "state" }, "/home/user")).toBe(
      "/home/user/.local/state/freelens-capi-extension",
    );
    expect(stateFolder({}, "/home/user")).toBe("/home/user/.local/state/freelens-capi-extension");
  });

  it("tells a path inside a folder from one beside it", () => {
    expect(isInside("/repository", "/repository")).toBe(true);
    expect(isInside("/repository", "/repository/state")).toBe(true);
    expect(isInside("/repository", "/repository/..state")).toBe(true);
    expect(isInside("/repository", "/repository-state")).toBe(false);
    expect(isInside("/repository", "/state")).toBe(false);
  });

  it("is created for the user alone, outside the repository", () => {
    const base = folder();
    const state = join(base, "state", "freelens-capi-extension");

    mkdirSync(join(base, "repository"));
    preparePrivateFolder(state, join(base, "repository"));
    expect(statSync(state).mode & 0o777).toBe(0o700);
  });

  it.each([
    ["inside the repository", "repository/..state"],
    ["that is the repository itself", "repository"],
  ])("refuses a folder %s", (_case, path) => {
    const base = folder();

    mkdirSync(join(base, "repository"));
    expect(() => preparePrivateFolder(join(base, path), join(base, "repository"))).toThrow(/is inside the repository/);
  });

  it("refuses a symbolic link", () => {
    const base = folder();

    mkdirSync(join(base, "repository"));
    mkdirSync(join(base, "elsewhere"));
    symlinkSync(join(base, "elsewhere"), join(base, "state"));
    expect(() => preparePrivateFolder(join(base, "state"), join(base, "repository"))).toThrow(/is a symbolic link/);
  });
});

describe("the lock of a run", () => {
  const alive = (live: number[]) => (pid: number) => live.includes(pid);

  it("is taken when it is free, and released by its holder only", () => {
    const state = folder();
    const release = takeLock(state, 1001, alive([1001]));

    expect(readFileSync(join(state, "run.lock"), "utf8")).toBe("1001");
    writeFileSync(join(state, "run.lock"), "1002");
    release();
    expect(readFileSync(join(state, "run.lock"), "utf8")).toBe("1002");
  });

  it("is refused while another run holds it", () => {
    const state = folder();

    writeFileSync(join(state, "run.lock"), "1002");
    expect(() => takeLock(state, 1001, alive([1001, 1002]))).toThrow(/process 1002, is going on/);
  });

  it("is taken over from a run that is gone, and the takeover is left free", () => {
    const state = folder();

    writeFileSync(join(state, "run.lock"), "1002");
    takeLock(state, 1001, alive([1001]))();
    expect(existsSync(join(state, "run.lock"))).toBe(false);
    expect(existsSync(join(state, "run.lock.takeover"))).toBe(false);
  });

  it("is not taken over while another run takes it over", () => {
    const state = folder();

    writeFileSync(join(state, "run.lock"), "1002");
    writeFileSync(join(state, "run.lock.takeover"), "1003");
    expect(() => takeLock(state, 1001, alive([1001, 1003]))).toThrow(/is taking over the lock of process 1002/);
    expect(readFileSync(join(state, "run.lock"), "utf8")).toBe("1002");
  });

  it("names a takeover left by a run that is gone, to be removed by hand", () => {
    const state = folder();

    writeFileSync(join(state, "run.lock"), "1002");
    writeFileSync(join(state, "run.lock.takeover"), "1003");
    expect(() => takeLock(state, 1001, alive([1001]))).toThrow(/names process 1003, which is gone: remove it/);
  });
});

describe("the kubeconfig of the user", () => {
  it("is KUBECONFIG or ~/.kube/config, leaving out the files of the scripts", () => {
    expect(kubeconfigFiles({}, "/home/user", "/state")).toEqual(["/home/user/.kube/config"]);
    expect(kubeconfigFiles({ KUBECONFIG: "/a:/state/tier/kubeconfig::/b" }, "/home/user", "/state")).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("is reported when a run changed it, created it or removed it", () => {
    const base = folder();
    const files = ["changed", "created", "removed", "kept"].map((name) => join(base, name));

    writeFileSync(files[0], "before");
    writeFileSync(files[2], "before");
    writeFileSync(files[3], "before");

    const before = fingerprints(files);

    writeFileSync(files[0], "after");
    writeFileSync(files[1], "after");
    rmSync(files[2]);
    expect(changedFiles(before, fingerprints(files))).toEqual(files.slice(0, 3));
  });
});

describe("the environment of a command", () => {
  const environment = childEnvironment(
    {
      PATH: "/usr/bin",
      HOME: "/home/user",
      DOCKER_HOST: "unix:///var/run/docker.sock",
      KUBECONFIG: "/home/user/.kube/production",
      EXP_MACHINE_POOL: "false",
      CLUSTER_TOPOLOGY: "false",
      HTTPS_PROXY: "http://proxy:3128",
    },
    "/state/kubeconfig",
    "/state/cache/kubectl",
    { CLUSTER_TOPOLOGY: "true" },
  );

  it("passes what finds the tools and the local Docker", () => {
    expect(environment).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/home/user",
      DOCKER_HOST: "unix:///var/run/docker.sock",
    });
  });

  it("names the kubeconfig of the scripts, turns kuberc off, and passes nothing else of the user", () => {
    expect(environment).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/user",
      DOCKER_HOST: "unix:///var/run/docker.sock",
      KUBECONFIG: "/state/kubeconfig",
      KUBECACHEDIR: "/state/cache/kubectl",
      KUBERC: "off",
      CLUSTER_TOPOLOGY: "true",
    });
  });
});

describe("the containers of a workload cluster", () => {
  function container(name: string, role: string, workload = "freelens-capi-md"): Record<string, any> {
    return {
      Id: sha256(Buffer.from(name)),
      Name: `/${name}`,
      Config: { Labels: { "io.x-k8s.kind.cluster": workload, "io.x-k8s.kind.role": role } },
    };
  }

  const made = [
    container("freelens-capi-md-lb", "external-load-balancer"),
    container("freelens-capi-md-4f2f2-8fn8l", "control-plane"),
    container("freelens-capi-md-md-0-hcmqb-49vxj-6bgh8", "worker"),
  ];

  it("are the containers that the development provider made for it", () => {
    expect(workloadContainerIds(made, "freelens-capi-md")).toEqual(made.map((item) => item.Id));
    expect(
      workloadContainerIds(
        [container("freelens-capi-mp-worker-wywpm2", "worker", "freelens-capi-mp")],
        "freelens-capi-mp",
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["another name", container("database", "worker")],
    ["another role", container("freelens-capi-md-x7k2p-9qz4r", "registry")],
    ["the label of another cluster", container("freelens-capi-md-x7k2p-9qz4r", "worker", "freelens-capi-mp")],
    ["a node that kind named", container("freelens-capi-md-control-plane", "control-plane")],
    ["a worker that kind named", container("freelens-capi-md-worker2", "worker")],
    ["a load balancer that kind named", container("freelens-capi-md-external-load-balancer", "external-load-balancer")],
  ])("leave every one in place beside a container with %s", (_case, other) => {
    expect(() => workloadContainerIds([...made, other], "freelens-capi-md")).toThrow(
      /is not one that the development provider makes: every container of freelens-capi-md is left in place/,
    );
  });
});

describe("down", () => {
  const tierOf = (name: string): Tier => ({
    name,
    context: `kind-${name}`,
    folder: `/state/${name}`,
    kubeconfig: `/state/${name}/kubeconfig`,
    record: `/state/${name}/node`,
    dockerSocket: false,
    resources: FIXTURE_RESOURCES,
  });
  const management = tierOf("freelens-capi-management");
  const definitions = tierOf("freelens-capi-definitions");
  const workloads: Workload[] = [
    { name: "freelens-capi-md", flavor: "development", workers: 2, kindnet: true },
    { name: "freelens-capi-mp", flavor: "development-mp", workers: 1, kindnet: false },
  ];

  interface System {
    clusters: string[];
    nodes: Record<string, string>;
    records: Record<string, string>;
    containers: Record<string, string[]>;
    failing?: "docker" | "list" | "delete" | "remove";
  }

  // The system that `down` acts on, which records what it is asked to do.
  function system(setup: System): { operations: DownOperations; done: string[] } {
    const done: string[] = [];
    const operations: DownOperations = {
      localDocker: () => {
        if (setup.failing === "docker") throw new Error("docker info failed with 1: Cannot connect to the daemon");
      },
      kindClusters: () => {
        if (setup.failing === "list") throw new Error("kind cannot reach Docker");
        return [...setup.clusters];
      },
      nodeId: (target) => setup.nodes[target.name],
      recordedNode: (target) => setup.records[target.name],
      deleteCluster: (target) => {
        if (setup.failing === "delete") throw new Error("Docker did not answer");
        done.push(`delete ${target.name}`);
        setup.clusters = setup.clusters.filter((name) => name !== target.name);
      },
      workloadContainers: (workload) => setup.containers[workload.name] ?? [],
      removeContainers: (ids) => {
        if (setup.failing === "remove") throw new Error("Docker did not answer");
        done.push(`remove ${ids.join(" ")}`);
        for (const name of Object.keys(setup.containers)) {
          setup.containers[name] = setup.containers[name].filter((id) => !ids.includes(id));
        }
      },
      forget: (target) => done.push(`forget ${target.name}`),
      // Called for the cluster of the captures of Kamaji alone, which these cases do not give.
      restoreSettings: (target) => done.push(`restore ${target.name}`),
      log: () => undefined,
    };

    return { operations, done };
  }

  const ours = (): System => ({
    clusters: ["freelens-capi-management", "freelens-capi-definitions", "freelens-capi-md", "freelens-capi-mp"],
    nodes: { "freelens-capi-management": "m1", "freelens-capi-definitions": "d1" },
    records: { "freelens-capi-management": "m1", "freelens-capi-definitions": "d1" },
    containers: { "freelens-capi-md": ["a", "b"], "freelens-capi-mp": ["c"] },
  });

  it("deletes the cluster of the real project first, then the definitions and the workload containers", () => {
    const { operations, done } = system(ours());

    takeDown(operations, management, definitions, workloads);
    expect(done).toEqual([
      "delete freelens-capi-management",
      "delete freelens-capi-definitions",
      "remove a b",
      "remove c",
      "forget freelens-capi-management",
      "forget freelens-capi-definitions",
    ]);
  });

  it("deletes nothing, and keeps the state, when the kind clusters cannot be listed", () => {
    const { operations, done } = system({ ...ours(), failing: "list" });

    expect(() => takeDown(operations, management, definitions, workloads)).toThrow(
      /could not be listed, and nothing was deleted/,
    );
    expect(done).toEqual([]);
  });

  it("deletes nothing, and keeps the state, when Docker is not the local one or does not answer", () => {
    const { operations, done } = system({ ...ours(), failing: "docker" });

    expect(() => takeDown(operations, management, definitions, workloads)).toThrow(
      "Docker is not the local one, or does not answer, and nothing was deleted: docker info failed with 1",
    );
    expect(done).toEqual([]);
  });

  it.each([
    ["a node that this state folder did not record", { records: { "freelens-capi-management": "m1" } }],
    [
      "another node of the same name",
      { nodes: { "freelens-capi-management": "m1", "freelens-capi-definitions": "x9" } },
    ],
  ])("leaves in place a kind cluster with %s, and keeps the state", (_case, change) => {
    const { operations, done } = system({ ...ours(), ...change });

    expect(() => takeDown(operations, management, definitions, workloads)).toThrow(
      /freelens-capi-definitions: it is not the kind cluster that the scripts created from this state folder/,
    );
    expect(done).not.toContain("delete freelens-capi-definitions");
    expect(done.filter((step) => step.startsWith("forget"))).toEqual([]);
  });

  it("leaves in place the containers of a workload cluster when this state folder did not create its cluster", () => {
    const { operations, done } = system({ ...ours(), clusters: [], records: {} });

    expect(() => takeDown(operations, management, definitions, workloads)).toThrow(
      /deleting the containers of freelens-capi-md: this state folder has no record of the cluster of the real project/,
    );
    expect(done).toEqual([]);
  });

  it("tries every step when one fails, reports it, and keeps the state", () => {
    const { operations, done } = system({ ...ours(), failing: "remove" });

    expect(() => takeDown(operations, management, definitions, workloads)).toThrow(
      /deleting the containers of freelens-capi-md: Docker did not answer/,
    );
    expect(done).toEqual(["delete freelens-capi-management", "delete freelens-capi-definitions"]);
  });
});

describe("the command line", () => {
  it.each(COMMAND_NAMES.map((name) => [name]))("accepts %s, with the states it takes", (name) => {
    const argv =
      name === "capture" || name === "fixtures-up"
        ? [name, "paused"]
        : name === "capture-kamaji"
          ? [name, "kamaji-healthy"]
          : [name];

    expect(parseCommand(argv).name).toBe(name);
  });

  it("takes the states of the fixtures after a command, every one when it is given none, or all", () => {
    expect(parseCommand(["fixtures-up", "paused", "deleting"]).states.map((state) => state.name)).toEqual([
      "paused",
      "deleting",
    ]);
    expect(parseCommand(["fixtures-check"]).states).toEqual(FIXTURE_STATES);
    expect(parseCommand(["fixtures-down", "all"]).states).toEqual(FIXTURE_STATES);
    expect(parseCommand(["capture", "all"]).states).toEqual(FIXTURE_STATES.filter((state) => state.capture));
    expect(parseCommand(["up"]).states).toEqual([]);
  });

  it.each([
    [[]],
    [["constructor"]],
    [["toString"]],
    [["__proto__"]],
    [["upgrade"]],
    [["up", "--force"]],
    [["up", "paused"]],
    [["capture"]],
    [["fixtures-up"]],
  ])("refuses %j", (argv) => {
    expect(() => parseCommand(argv)).toThrow(/^Usage: node e2e\/scripts\/environment\.mts/);
  });

  it.each([
    [["capture", "constructor"], /constructor is not a state of the fixtures that the scripts capture/],
    [["capture", "machine-pool-without-machines"], /is not a state of the fixtures that the scripts capture/],
    [["fixtures-up", "toString"], /toString is not a state of the fixtures: /],
    [["fixtures-down", "paused", "all"], /all is not a state of the fixtures/],
  ])("refuses %j", (argv, error) => {
    expect(() => parseCommand(argv)).toThrow(error);
  });
});

describe("what a session of the real tier makes once", () => {
  it("is made at the first call and kept once it succeeded, and made again at the next call after a failure", async () => {
    let calls = 0;
    const made = onceItSucceeds(async () => {
      calls++;
      if (calls === 1) throw new Error("the first setup failed");
      return `clusterctl ${calls}`;
    });

    await expect(made()).rejects.toThrow(/the first setup failed/);
    expect(await made()).toBe("clusterctl 2");
    expect(await made()).toBe("clusterctl 2");
    expect(calls).toBe(2);
  });
});

describe("the providers of the real project", () => {
  const provider = (type: string, providerName: string, version: string): InventoryProvider => ({
    metadata: { namespace: "capi-system" },
    type,
    providerName,
    version,
  });
  const atThePins = [
    provider("CoreProvider", "cluster-api", "v1.14.4"),
    provider("BootstrapProvider", "kubeadm", "v1.14.4"),
    provider("ControlPlaneProvider", "kubeadm", "v1.14.4"),
    provider("InfrastructureProvider", "docker", "v1.14.4"),
  ];

  it("finds the providers of the pins that the inventory lacks, and those of another release", () => {
    expect(providersAgainstPins(atThePins, "v1.14.4")).toEqual({ missing: [], other: [] });
    expect(providersAgainstPins(atThePins.slice(1), "v1.14.4").missing.map((item) => item.type)).toEqual([
      "CoreProvider",
    ]);
    expect(
      providersAgainstPins(
        [...atThePins.slice(0, 3), provider("InfrastructureProvider", "docker", "v1.14.3")],
        "v1.14.4",
      ),
    ).toEqual({
      missing: [],
      other: ["InfrastructureProvider docker is installed at v1.14.3, and the pins say v1.14.4"],
    });
  });
});

describe("the host", () => {
  const instances = "fs.inotify.max_user_instances";
  const watches = "fs.inotify.max_user_watches";

  it("raises only the limits of inotify that are lower than the workload clusters need", () => {
    // 128 instances, the default of some systems, where the nodes of the workload clusters exit as they start.
    expect(inotifySettings({ [instances]: 128, [watches]: INOTIFY_LIMITS[watches] })).toEqual([
      `${instances}=${INOTIFY_LIMITS[instances]}`,
    ]);
    expect(inotifySettings({ [instances]: INOTIFY_LIMITS[instances], [watches]: 65536 })).toEqual([
      `${watches}=${INOTIFY_LIMITS[watches]}`,
    ]);
    expect(inotifySettings({ [instances]: 2 ** 20, [watches]: 2 ** 22 })).toEqual([]);
    expect(inotifySettings({})).toHaveLength(2);
  });

  it("takes the clusterctl of the system, and refuses a system the pins have none for", () => {
    expect(clusterctlAsset("linux", "x64")).toBe("clusterctl-linux-amd64");
    expect(clusterctlAsset("darwin", "arm64")).toBe("clusterctl-darwin-arm64");
    expect(() => clusterctlAsset("win32", "x64")).toThrow(/not on win32 x64/);
    expect(() => clusterctlAsset("linux", "ppc64")).toThrow(/not on linux ppc64/);
  });
});

describe("the files of a release", () => {
  const definition = (name: string, apiVersion = "apiextensions.k8s.io/v1") =>
    `apiVersion: ${apiVersion}\nkind: CustomResourceDefinition\nmetadata:\n  name: ${name}\nspec:\n  names:\n    kind: Cluster\n`;

  it("keeps the definitions, as they are, and nothing else", () => {
    const release = [
      "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: capi-system\n",
      definition("clusters.cluster.x-k8s.io"),
      "apiVersion: cert-manager.io/v1\nkind: Certificate\nmetadata:\n  name: capi-serving-cert\n",
      definition("machines.cluster.x-k8s.io"),
    ].join("---\n");

    expect(customResourceDefinitions(release)).toEqual([
      definition("clusters.cluster.x-k8s.io"),
      definition("machines.cluster.x-k8s.io"),
    ]);
    expect(customResourceDefinitions(`---\n${definition("providers.clusterctl.cluster.x-k8s.io")}`)).toEqual([
      definition("providers.clusterctl.cluster.x-k8s.io"),
    ]);
  });

  it("refuses two documents with no separator between them", () => {
    expect(() =>
      customResourceDefinitions(`${definition("clusters.cluster.x-k8s.io")}${definition("machines.cluster.x-k8s.io")}`),
    ).toThrow(/has 2 kinds/);
  });

  it("refuses a definition of another version of the API", () => {
    expect(() =>
      customResourceDefinitions(definition("clusters.cluster.x-k8s.io", "apiextensions.k8s.io/v1beta1")),
    ).toThrow(/is not apiextensions\.k8s\.io\/v1/);
  });

  it("keeps the definitions of the folder crds of a chart, as they are, in the order of their paths, and nothing else (SPEC-0004, P29)", () => {
    const files = new Map([
      ["chart/Chart.yaml", Buffer.from("apiVersion: v2\nname: chart\n")],
      ["chart/crds/b-crd.yaml", Buffer.from(definition("bs.example.com"))],
      ["chart/crds/a-crd.yaml", Buffer.from(`---\n${definition("as.example.com")}`)],
      ["chart/crds/README.md", Buffer.from("kind: CustomResourceDefinition\n")],
      ["chart/templates/crd.yaml", Buffer.from(definition("templates.example.com"))],
      ["other/crds/c-crd.yaml", Buffer.from(definition("cs.example.com"))],
    ]);

    expect(chartDefinitions(files, "chart")).toEqual([definition("as.example.com"), definition("bs.example.com")]);
    expect(() =>
      chartDefinitions(new Map([...files].filter(([path]) => !path.startsWith("chart/crds/"))), "chart"),
    ).toThrow(/The chart chart has no definition in its folder crds/);
  });

  it("names a definition by the name of its metadata, which kubectl applies and deletes it by, and not by a label of that name (SPEC-0004, P29)", () => {
    const named = [
      "apiVersion: apiextensions.k8s.io/v1",
      "kind: CustomResourceDefinition",
      "metadata:",
      "  annotations:",
      "    controller-gen.kubebuilder.io/version: v0.16.3",
      "  labels:",
      "    name: not-this-one",
      "",
      "  name: sveltosclusters.lib.projectsveltos.io",
      "spec:",
      "  group: lib.projectsveltos.io",
      "",
    ].join("\n");

    expect(definitionName(named)).toBe("sveltosclusters.lib.projectsveltos.io");
    expect(definitionName(definition("as.example.com"))).toBe("as.example.com");
    // Four spaces, as the chart of Sveltos indents its definitions.
    expect(definitionName(named.replaceAll(/^( +)/gm, "$1$1"))).toBe("sveltosclusters.lib.projectsveltos.io");
    expect(() =>
      definitionName("apiVersion: apiextensions.k8s.io/v1\nkind: CustomResourceDefinition\nspec:\n  name: x\n"),
    ).toThrow(/A definition has no name in its metadata/);
  });

  it("puts the CIDRs of the workload clusters in the kindnet manifest, and refuses one it cannot complete", () => {
    const manifest = "        - name: POD_SUBNET\n          value: '${DOCKER_POD_CIDRS},${DOCKER_POD_IPV6_CIDRS}'\n";

    expect(kindnetManifest(manifest)).toBe(
      "        - name: POD_SUBNET\n          value: '192.168.0.0/16,fd00:100:96::/48'\n",
    );
    expect(() => kindnetManifest(manifest.replace("${DOCKER_POD_IPV6_CIDRS}", "fd00::/48"))).toThrow(
      /does not have \$\{DOCKER_POD_IPV6_CIDRS\}/,
    );
    expect(() => kindnetManifest(`${manifest}  image: \${KINDNET_IMAGE}\n`)).toThrow(
      /a variable that the scripts do not set/,
    );
  });

  it("applies kindnet to the Clusters that have the label that the scripts give", () => {
    const [, clusterResourceSet] = JSON.parse(kindnetResources("kind: DaemonSet\n", "default")).items;
    const [key, value] = kindnetLabelArgument().split("=");

    expect(clusterResourceSet.spec.clusterSelector.matchLabels).toEqual({ [key]: value });
    expect({ [KINDNET_LABEL.key]: KINDNET_LABEL.value }).toEqual({ [key]: value });
  });
});

// A KubeadmConfig of a worker, as the API server returns it, with the fields that A3 of SPEC-0001 forbids
// showing; every secret of it is made up.
function capturedKubeadmConfig(): KubeObject {
  return {
    apiVersion: "bootstrap.cluster.x-k8s.io/v1beta2",
    kind: "KubeadmConfig",
    metadata: {
      name: "workload-md-0-abcde-fghij",
      namespace: "workload",
      uid: "0d7e1b9c-5b7f-4b8e-9a51-6c2f0c2d8e11",
      resourceVersion: "123456",
      generation: 2,
      creationTimestamp: "2026-11-22T13:00:00Z",
      labels: { "cluster.x-k8s.io/cluster-name": "workload" },
      annotations: {
        "kubectl.kubernetes.io/last-applied-configuration": '{"spec":{"users":[{"passwd":"made-up"}]}}',
        "machine.cluster.x-k8s.io/certificates-expiry": "2027-11-22T13:00:00Z",
      },
      ownerReferences: [
        {
          apiVersion: "cluster.x-k8s.io/v1beta2",
          kind: "Machine",
          name: "workload-md-0-abcde-fghij",
          uid: "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
      managedFields: [{ manager: "manager", operation: "Update", time: "2026-11-22T13:00:01Z" }],
    },
    spec: {
      files: [{ path: "/etc/example.conf", permissions: "0600", content: "made-up: secret\n" }],
      users: [{ name: "operator", passwd: "made-up" }],
      joinConfiguration: {
        discovery: {
          bootstrapToken: {
            apiServerEndpoint: "172.18.0.3:6443",
            caCertHashes: [`sha256:${"a".repeat(64)}`],
            token: "madeup.madeupmadeupmade",
          },
          tlsBootstrapToken: "madeup.madeupmadeupmade",
        },
        nodeRegistration: { kubeletExtraArgs: [{ name: "eviction-hard", value: "nodefs.available<0%" }] },
      },
    },
    status: {
      observedGeneration: 2,
      dataSecretName: "workload-md-0-abcde-fghij",
      initialization: { dataSecretCreated: true },
      conditions: [
        {
          type: "Ready",
          status: "True",
          reason: "Ready",
          observedGeneration: 2,
          lastTransitionTime: "2026-11-22T13:00:30Z",
        },
      ],
    },
  };
}

describe("the shift of the times of a fixture", () => {
  it("moves a time by whole seconds, across a day and a year, as Kubernetes writes it", () => {
    expect(shiftTime("2026-11-22T13:19:10Z", -60)).toBe("2026-11-22T13:18:10Z");
    expect(shiftTime("2026-01-01T00:00:30Z", -60)).toBe("2025-12-31T23:59:30Z");
    expect(shiftTime("2026-11-22T13:19:10Z", 86_400 * 365)).toBe("2027-11-22T13:19:10Z");
  });

  it("keeps the fraction of a time, and writes an offset in UTC", () => {
    expect(shiftTime("2026-11-22T13:19:10.123456Z", 1)).toBe("2026-11-22T13:19:11.123456Z");
    expect(shiftTime("2026-11-22T14:19:10+01:00", 0)).toBe("2026-11-22T13:19:10Z");
  });

  it("refuses a value that is not a time, and a shift of a part of a second", () => {
    expect(() => shiftTime("2026-11-22", 1)).toThrow(/is not a time that the scripts move/);
    expect(() => shiftTime("2026-02-30T00:00:00Z", 1)).toThrow(/is not a time that the scripts move/);
    expect(() => shiftTime("2026-11-22T13:19:10Z", 0.5)).toThrow(/is not a time that the scripts move/);
    expect(isTime("2026-11-22T13:19:10Z")).toBe(true);
    expect(isTime("v1.37.0")).toBe(false);
  });

  it("moves every time of an object, wherever it is, and nothing else", () => {
    const moved = shiftTimes(capturedKubeadmConfig(), 3600);

    expect(moved.metadata.creationTimestamp).toBe("2026-11-22T14:00:00Z");
    expect(moved.metadata.annotations?.["machine.cluster.x-k8s.io/certificates-expiry"]).toBe("2027-11-22T14:00:00Z");
    expect(moved.metadata.managedFields).toEqual([
      { manager: "manager", operation: "Update", time: "2026-11-22T14:00:01Z" },
    ]);
    expect((moved.status?.conditions as { lastTransitionTime: string }[])[0].lastTransitionTime).toBe(
      "2026-11-22T14:00:30Z",
    );
    // What is not a time stays as it is: names, versions, counts, keys.
    expect({ ...moved, metadata: {}, status: {} }).toEqual({ ...capturedKubeadmConfig(), metadata: {}, status: {} });
    expect(moved.status?.observedGeneration).toBe(2);
  });

  it("gives back the times of the file when the run moves them there and the read back moves them home", () => {
    const fixture = cleanObject(capturedKubeadmConfig(), -3600).object;

    expect(shiftTimes(shiftTimes(fixture, 12_345_678), -12_345_678)).toEqual(fixture);
  });

  it("finds a time inside a text, which no shift reaches", () => {
    expect(
      timesInsideText({ status: { conditions: [{ message: "since 2026-11-22T13:19:10Z", reason: "Ready" }] } }),
    ).toEqual([".status.conditions[0].message"]);
    expect(timesInsideText(capturedKubeadmConfig())).toEqual([]);
  });
});

describe("the cleaning of a captured object", () => {
  const capturedAt = "2026-11-22T13:05:00Z";
  const seconds = secondsBetween(capturedAt, CAPTURE_TIME);

  it("leaves out what the API server adds, and keeps every time as its offset from the capture", () => {
    const { object } = cleanObject(capturedKubeadmConfig(), seconds);

    expect(object.metadata).toEqual({
      name: "workload-md-0-abcde-fghij",
      namespace: "workload",
      creationTimestamp: "2025-12-31T23:55:00Z",
      labels: { "cluster.x-k8s.io/cluster-name": "workload" },
      annotations: { "machine.cluster.x-k8s.io/certificates-expiry": "2026-12-31T23:55:00Z" },
      ownerReferences: [
        {
          apiVersion: "cluster.x-k8s.io/v1beta2",
          kind: "Machine",
          name: "workload-md-0-abcde-fghij",
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    });
    expect(object.status).toEqual({
      observedGeneration: 1,
      dataSecretName: "workload-md-0-abcde-fghij",
      initialization: { dataSecretCreated: true },
      conditions: [
        {
          type: "Ready",
          status: "True",
          reason: "Ready",
          observedGeneration: 1,
          lastTransitionTime: "2025-12-31T23:55:30Z",
        },
      ],
    });
  });

  it("leaves out what A3 of SPEC-0001 forbids showing, and says where", () => {
    const { object, leftOut } = cleanObject(capturedKubeadmConfig(), seconds);

    expect(object.spec).toEqual({
      files: [{ path: "/etc/example.conf", permissions: "0600" }],
      users: [{ name: "operator" }],
      joinConfiguration: {
        discovery: {
          bootstrapToken: { apiServerEndpoint: "172.18.0.3:6443", caCertHashes: [`sha256:${"a".repeat(64)}`] },
        },
        nodeRegistration: { kubeletExtraArgs: [{ name: "eviction-hard", value: "nodefs.available<0%" }] },
      },
    });
    expect(leftOut).toEqual([
      "spec.files[0].content",
      "spec.users[0].passwd",
      "spec.joinConfiguration.discovery.bootstrapToken.token",
      "spec.joinConfiguration.discovery.tlsBootstrapToken",
    ]);
    expect(JSON.stringify(object)).not.toMatch(/made-?up/);
  });

  it.each([
    ["KubeadmConfigTemplate", "bootstrap.cluster.x-k8s.io/v1beta2", ["spec", "template", "spec"]],
    ["KubeadmControlPlane", "controlplane.cluster.x-k8s.io/v1beta2", ["spec", "kubeadmConfigSpec"]],
    [
      "KubeadmControlPlaneTemplate",
      "controlplane.cluster.x-k8s.io/v1beta2",
      ["spec", "template", "spec", "kubeadmConfigSpec"],
    ],
  ])("leaves out the same of a %s, and the tokens and credentials of a kubeconfig", (kind, apiVersion, path) => {
    const configuration = {
      files: [{ path: "/etc/example.conf", content: "made-up" }],
      initConfiguration: { bootstrapTokens: [{ token: "madeup.madeupmadeupmade", ttlSeconds: 900 }] },
      joinConfiguration: {
        discovery: {
          file: {
            kubeConfigPath: "/etc/kubernetes/discovery.conf",
            kubeConfig: {
              user: {
                authProvider: { name: "example", config: { secret: "made-up" } },
                exec: { command: "example", env: [{ name: "TOKEN", value: "made-up" }] },
              },
            },
          },
        },
      },
    };
    let fields: Record<string, unknown> = configuration;

    for (const key of [...path].reverse()) fields = { [key]: fields };

    const { object, leftOut } = cleanObject(
      { apiVersion, kind, metadata: { name: "example", namespace: "workload" }, ...fields },
      0,
    );
    const where = path.join(".");

    expect(JSON.stringify(object)).not.toMatch(/made-?up/);
    expect(leftOut).toEqual([
      `${where}.files[0].content`,
      `${where}.initConfiguration.bootstrapTokens`,
      `${where}.joinConfiguration.discovery.file.kubeConfig.user.authProvider.config`,
      `${where}.joinConfiguration.discovery.file.kubeConfig.user.exec.env`,
    ]);
  });

  it("keeps nothing that kubelet tells of the machine of the capture, and the identifiers of each container", () => {
    const machine: KubeObject = {
      apiVersion: "cluster.x-k8s.io/v1beta2",
      kind: "Machine",
      metadata: { name: "workload-md-0-abcde-fghij", namespace: "workload" },
      status: {
        nodeInfo: {
          architecture: "amd64",
          bootID: "68d1d970-6d40-45ec-ab3c-f600248273d6",
          kernelVersion: "6.18.0-a-kernel-of-the-host",
          machineID: "0ba0c7d463df4a778885995cfed55f28",
          systemUUID: "0ba0c7d463df4a778885995cfed55f28",
          swap: { capacity: 8_589_934_592 },
        },
      },
    };

    expect(cleanObject(machine, 0).object.status?.nodeInfo).toEqual({
      architecture: "amd64",
      bootID: HOST_BOOT_ID,
      kernelVersion: HOST_KERNEL,
      machineID: "0ba0c7d463df4a778885995cfed55f28",
      systemUUID: "0ba0c7d463df4a778885995cfed55f28",
    });
  });

  it.each([
    ["DevMachineTemplate", "infrastructure.cluster.x-k8s.io/v1beta2"],
    ["DockerMachineTemplate", "infrastructure.cluster.x-k8s.io/v1beta2"],
  ])("writes in a %s the capacity of the fixtures, in place of that of the host of the capture", (kind, apiVersion) => {
    const template = (status?: Record<string, unknown>): KubeObject => ({
      apiVersion,
      kind,
      metadata: { name: "workload-md-0", namespace: "workload" },
      spec: { template: { spec: {} } },
      ...(status ? { status } : {}),
    });

    expect(HOST_CAPACITY).toEqual({ cpu: "4", memory: "8Gi" });
    expect(cleanObject(template({ capacity: { cpu: "32", memory: "131072Mi" } }), 0).object.status).toEqual({
      capacity: HOST_CAPACITY,
    });
    // A template that its controller has not reconciled yet has no capacity, and gets none.
    expect(cleanObject(template(), 0).object.status).toBeUndefined();
    expect(cleanObject(template({}), 0).object.status).toEqual({});
  });

  it("keeps the finalizers of the project, without the one of the scripts", () => {
    const captured = capturedKubeadmConfig();

    captured.metadata.finalizers = ["machine.cluster.x-k8s.io", FIXTURE_FINALIZER];
    expect(cleanObject(captured, 0).object.metadata.finalizers).toEqual(["machine.cluster.x-k8s.io"]);
    captured.metadata.finalizers = [FIXTURE_FINALIZER];
    expect(cleanObject(captured, 0).object.metadata.finalizers).toBeUndefined();
  });

  it.each([
    [
      "observed at its generation",
      { generation: 5, deleting: false },
      { observed: 5, conditions: [5, 5] },
      undefined,
      [1, 1, 1],
    ],
    [
      "paused, whose status is of the generation before",
      { generation: 3, deleting: false },
      { observed: 2, conditions: [2, 3] },
      2,
      [1, 1, 2],
    ],
    [
      "deleting, observed at its generation",
      { generation: 4, deleting: true },
      { observed: 4, conditions: [4] },
      2,
      [2, 2],
    ],
    [
      "deleting, and observed before its deletion",
      { generation: 4, deleting: true },
      { observed: 3, conditions: [3] },
      2,
      [1, 1],
    ],
    ["with no status", { generation: 7, deleting: false }, undefined, undefined, []],
  ])(
    "keeps the generation of an object %s as its distance from what its status observed",
    (_case, { generation, deleting }, observed, expected, expectedObserved) => {
      const captured = capturedKubeadmConfig();

      captured.metadata.generation = generation;
      if (deleting) captured.metadata.deletionTimestamp = "2026-11-22T13:04:00Z";
      captured.status = observed && {
        observedGeneration: observed.observed,
        conditions: observed.conditions.map((value) => ({ type: "Ready", status: "True", observedGeneration: value })),
      };

      const { object } = cleanObject(captured, 0);
      const status = object.status as
        | { observedGeneration: number; conditions: { observedGeneration: number }[] }
        | undefined;

      expect(object.metadata.generation).toBe(expected);
      expect(
        status ? [status.observedGeneration, ...status.conditions.map((item) => item.observedGeneration)] : [],
      ).toEqual(expectedObserved);
    },
  );

  it("refuses a status that observed a generation after the one of its object, and a Secret", () => {
    const captured = capturedKubeadmConfig();

    captured.metadata.generation = 1;
    expect(() => cleanObject(captured, 0)).toThrow(/observed a generation after its own, 1/);
    expect(() =>
      cleanObject(
        { apiVersion: "v1", kind: "Secret", metadata: { name: "workload-kubeconfig", namespace: "workload" } },
        0,
      ),
    ).toThrow(/is a Secret, which no fixture holds/);
  });

  it("gives back a cleaned object when it cleans it again", () => {
    const { object } = cleanObject(capturedKubeadmConfig(), seconds);

    expect(cleanObject(object, 0)).toEqual({ object, leftOut: [] });
  });
});

// A Cluster and what it owns, as a fixture holds them.
function fixtureObject(kind: string, name: string, owner?: string, fields: Partial<KubeObject> = {}): KubeObject {
  return {
    apiVersion: "cluster.x-k8s.io/v1beta2",
    kind,
    ...fields,
    metadata: {
      name,
      namespace: "workload",
      ...(owner
        ? {
            ownerReferences: [
              { apiVersion: "cluster.x-k8s.io/v1beta2", kind: owner.split("/")[0], name: owner.split("/")[1] },
            ],
          }
        : {}),
      ...fields.metadata,
    },
  };
}

describe("the apply of a fixture", () => {
  const cluster = fixtureObject("Cluster", "workload");
  const deployment = fixtureObject("MachineDeployment", "workload-md-0", "Cluster/workload");
  const set = fixtureObject("MachineSet", "workload-md-0-abcde", "MachineDeployment/workload-md-0");
  const machine = fixtureObject("Machine", "workload-md-0-abcde-fghij", "MachineSet/workload-md-0-abcde");

  it("creates the owners before their dependents", () => {
    expect(creationLevels([machine, set, cluster, deployment]).map((level) => level.map((item) => item.kind))).toEqual([
      ["Cluster"],
      ["MachineDeployment"],
      ["MachineSet"],
      ["Machine"],
    ]);
  });

  it("refuses an owner that the set does not hold, and owners in a cycle", () => {
    expect(() => creationLevels([machine, set])).toThrow(
      /is owned by cluster\.x-k8s\.io\/MachineDeployment\/workload\/workload-md-0, which the fixture does not hold/,
    );
    expect(() =>
      creationLevels([fixtureObject("Machine", "a", "Machine/b"), fixtureObject("Machine", "b", "Machine/a")]),
    ).toThrow(/make a cycle/);
  });

  it("moves the times to the run, and leaves to the API server the times it writes and the generation", () => {
    const fixture = fixtureObject("Machine", "workload-md-0-abcde-fghij", undefined, {
      metadata: { name: "workload-md-0-abcde-fghij", creationTimestamp: "2025-12-31T23:50:00Z" },
      spec: { rollout: { after: "2025-12-31T23:55:00Z" } },
      status: { lastUpdated: "2025-12-31T23:59:00Z" },
    });
    const plan = applyPlan(fixture, 60);

    expect(plan.create.metadata.creationTimestamp).toBeUndefined();
    expect(plan.create.status).toBeUndefined();
    expect(plan.create.spec).toEqual({ rollout: { after: "2025-12-31T23:56:00Z" } });
    expect(plan.status).toEqual({ lastUpdated: "2026-01-01T00:00:00Z" });
    expect(plan).toMatchObject({ changes: [], deleting: false });
  });

  it("holds a deleting object with the finalizer of the scripts, and counts its deletion as a change", () => {
    const fixture = fixtureObject("Cluster", "workload", undefined, {
      metadata: {
        name: "workload",
        generation: 2,
        finalizers: ["cluster.cluster.x-k8s.io"],
        deletionTimestamp: "2025-12-31T23:58:00Z",
      },
    });
    const plan = applyPlan(fixture, 0);

    expect(plan.create.metadata).toEqual({
      name: "workload",
      namespace: "workload",
      finalizers: ["cluster.cluster.x-k8s.io", FIXTURE_FINALIZER],
    });
    expect(plan).toMatchObject({ changes: [], deleting: true });
  });

  it.each([
    [2, { spec: {} }, [{ spec: { paused: true } }]],
    [3, { spec: { paused: true } }, [{ spec: { paused: null } }, { spec: { paused: true } }]],
  ])(
    "changes a paused Cluster of generation %i back and forth, to give it its generation",
    (generation, create, changes) => {
      const fixture = fixtureObject("Cluster", "workload", undefined, {
        metadata: { name: "workload", generation },
        spec: { paused: true },
      });
      const plan = applyPlan(fixture, 0);

      expect(plan.create.spec).toEqual(create.spec);
      expect(plan.changes).toEqual(changes);
    },
  );

  it("changes a DevMachine of generation 2 once, deep in its spec, to give it its generation", () => {
    const fixture: KubeObject = {
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
      kind: "DevMachine",
      metadata: { name: "workload-md-0-abcde-fghij", namespace: "workload", generation: 2 },
      spec: { backend: { docker: { customImage: "kindest/node:v1.37.0" } }, providerID: "docker:////x" },
    };
    const plan = applyPlan(fixture, 0);

    expect(plan.create.spec).toEqual({
      backend: { docker: { customImage: "kindest/node:v1.37.0", bootstrapTimeout: "5m0s" } },
      providerID: "docker:////x",
    });
    expect(plan.changes).toEqual([{ spec: { backend: { docker: { bootstrapTimeout: null } } } }]);
    expect(fixture.spec).toEqual({
      backend: { docker: { customImage: "kindest/node:v1.37.0" } },
      providerID: "docker:////x",
    });
  });

  it("refuses a generation that the scripts cannot give an object on the first tier", () => {
    expect(() =>
      applyPlan(
        fixtureObject("MachineSet", "workload-md-0-abcde", undefined, { metadata: { name: "x", generation: 2 } }),
        0,
      ),
    ).toThrow(/has generation 2, which the scripts cannot give a MachineSet on the first tier/);
  });

  it("finds an object read back as its file, apart from the times that only the API server writes", () => {
    const file = fixtureObject("Cluster", "workload", undefined, {
      metadata: {
        name: "workload",
        creationTimestamp: "2025-12-31T23:50:00Z",
        deletionTimestamp: "2025-12-31T23:58:00Z",
      },
      status: { phase: "Deleting" },
    });
    const read = structuredClone(file);

    read.metadata.creationTimestamp = "2026-01-01T00:00:02Z";
    read.metadata.deletionTimestamp = "2026-01-01T00:00:03Z";
    expect(roundTripDifferences([file], [read])).toEqual([]);

    delete read.metadata.deletionTimestamp;
    (read.status as { phase: string }).phase = "Provisioned";
    expect(roundTripDifferences([file], [read, machine])).toEqual([
      'cluster.x-k8s.io/Cluster/workload/workload.metadata.deletionTimestamp: "set by the API server", and undefined read back',
      'cluster.x-k8s.io/Cluster/workload/workload.status.phase: "Deleting", and "Provisioned" read back',
      "cluster.x-k8s.io/Machine/workload/workload-md-0-abcde-fghij: read back, and not in the fixture set",
    ]);
    expect(roundTripDifferences([file, machine], [])).toHaveLength(2);
  });
});

describe("the YAML of the fixtures", () => {
  const machine = {
    apiVersion: "cluster.x-k8s.io/v1beta2",
    kind: "Machine",
    metadata: {
      name: "workload-md-0-abcde",
      namespace: "workload",
      labels: { "cluster.x-k8s.io/cluster-name": "workload" },
      finalizers: ["machine.cluster.x-k8s.io"],
    },
    spec: {
      clusterName: "workload",
      providerID: "docker:////workload-md-0-abcde",
      minReadySeconds: 0,
      readinessGates: [],
    },
    status: {
      conditions: [
        {
          type: "Ready",
          status: "True",
          reason: "Ready",
          message: "",
          lastTransitionTime: "2025-12-31T23:55:00Z",
          observedGeneration: 1,
        },
      ],
      phase: "Running",
      nodeRef: { name: "workload-md-0-abcde" },
      deletion: {},
    },
  };
  const text = [
    "apiVersion: cluster.x-k8s.io/v1beta2",
    "kind: Machine",
    "metadata:",
    "  finalizers:",
    "  - machine.cluster.x-k8s.io",
    "  labels:",
    "    cluster.x-k8s.io/cluster-name: workload",
    "  name: workload-md-0-abcde",
    "  namespace: workload",
    "spec:",
    "  clusterName: workload",
    "  minReadySeconds: 0",
    "  providerID: docker:////workload-md-0-abcde",
    "  readinessGates: []",
    "status:",
    "  conditions:",
    '  - lastTransitionTime: "2025-12-31T23:55:00Z"',
    '    message: ""',
    "    observedGeneration: 1",
    "    reason: Ready",
    '    status: "True"',
    "    type: Ready",
    "  deletion: {}",
    "  nodeRef:",
    "    name: workload-md-0-abcde",
    "  phase: Running",
    "",
  ].join("\n");

  it("writes an object as kubectl writes it, keys in order and sequences unindented, and reads it back", () => {
    expect(stringifyDocuments([machine])).toBe(text);
    expect(parseDocuments(text)).toEqual([machine]);
    expect(parseDocuments(stringifyDocuments([machine, machine]))).toEqual([machine, machine]);
  });

  it.each([
    "true",
    "True",
    "yes",
    "On",
    "off",
    "~",
    "null",
    "",
    "1",
    "-2",
    "0755",
    "0x1F",
    "1.0",
    ".inf",
    "1:20",
    "2026-01-01",
    "2026-01-01T00:00:00Z",
    "<<",
    "=",
    " leading",
    "trailing ",
    "* NodeHealthy: Waiting",
    "key: value",
    "a #comment",
    "#hash",
    "- item",
    "{{ .value }}",
    "[list]",
    "&anchor",
    "!tag",
    "|block",
    "'quoted'",
    '"quoted"',
    "%directive",
    "@at",
    "`tick`",
    "ends with:",
    "tab\there",
  ])("quotes %j, which a plain value cannot be", (value) => {
    expect(plainAllowed(value)).toBe(false);
    expect(parseDocuments(stringifyDocuments([{ value }]))).toEqual([{ value }]);
  });

  it.each(["v1.37.0", "docker:////workload-md-0", "sha256:abc", "a,b", "-x", "a#b", "y", "1.2.3", "1e3", "Running"])(
    "writes %j plain, which yamllint refuses to see quoted",
    (value) => {
      expect(plainAllowed(value)).toBe(true);
      expect(stringifyDocuments([{ value }])).toBe(`value: ${value}\n`);
      expect(parseDocuments(`value: ${value}\n`)).toEqual([{ value }]);
    },
  );

  it("writes a text of several lines, or one that yamlfmt would fold at its width, as a literal block", () => {
    const lines = "* Machine a:\n  * NodeHealthy: Waiting\n* Machine b:\n  * NodeHealthy: Waiting";
    const long = `${"word ".repeat(30)}end`;
    const written = stringifyDocuments([{ status: { message: lines, sentence: long, items: [lines] } }]);

    expect(written).toBe(
      [
        "status:",
        "  items:",
        "  - |-",
        "    * Machine a:",
        "      * NodeHealthy: Waiting",
        "    * Machine b:",
        "      * NodeHealthy: Waiting",
        "  message: |-",
        "    * Machine a:",
        "      * NodeHealthy: Waiting",
        "    * Machine b:",
        "      * NodeHealthy: Waiting",
        "  sentence: |-",
        `    ${long}`,
        "",
      ].join("\n"),
    );
    expect(parseDocuments(written)).toEqual([{ status: { message: lines, sentence: long, items: [lines] } }]);
    expect(parseDocuments(stringifyDocuments([{ value: "ends with one line break\n" }]))).toEqual([
      { value: "ends with one line break\n" },
    ]);
  });

  it("writes in double quotes a text that a literal block cannot hold", () => {
    for (const value of [
      "space before \nthe break",
      "trailing space ",
      "two\n\n",
      "\u0007bell",
      "\r",
      " leading\nlines",
      // A tab that would start a line of the block, which a reader takes for an indentation.
      "first\n\tsecond",
      "first\n  \tsecond",
      "--- ",
    ]) {
      const written = stringifyDocuments([{ value }]);

      expect(written).toMatch(/^value: "/);
      expect(parseDocuments(written)).toEqual([{ value }]);
    }
  });

  it("writes in a literal block a value that starts as a document marker, which yamlfmt and yamllint both keep", () => {
    // Plain, yamlfmt quotes it; quoted, yamllint finds the quotes redundant.
    for (const value of ["---", "---x", "--- x", "...", "...x"]) {
      expect(plainAllowed(value)).toBe(false);

      const written = stringifyDocuments([{ value }]);

      expect(written).toBe(`value: |-\n  ${value}\n`);
      expect(parseDocuments(written)).toEqual([{ value }]);
    }
  });

  it("orders the objects of a file by the code units of their names, in every locale", () => {
    // The system as one in Czech, where `ch` is a letter of its own, after `h`: an order that follows the
    // locale, as `localeCompare` does, puts `ch-b` last.
    const czech = new Intl.Collator("cs").compare;
    const localeCompare = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: unknown,
      that: string,
    ) {
      return czech(String(this), that);
    });
    const machine = (name: string) => fixtureObject("Machine", name);

    try {
      expect(["h-c", "ch-b", "d-a"].sort((a, b) => a.localeCompare(b))).toEqual(["d-a", "h-c", "ch-b"]);

      const files = fixtureFiles([machine("h-c"), machine("ch-b"), machine("d-a")]);

      expect(
        parseDocuments(files.get("machine.yaml") ?? "").map((object) => (object.metadata as { name: string }).name),
      ).toEqual(["ch-b", "d-a", "h-c"]);
    } finally {
      localeCompare.mockRestore();
    }
  });

  it("reads what yamlfmt makes of a long value: folded over lines, with comments and empty lines", () => {
    const formatted = [
      "# a comment",
      "data:",
      "  plain: a long value that goes on",
      "    over the next line",
      '  quoted: "a value with a \\"quote\\" that',
      "    goes on, and \\",
      '    joins"',
      "",
      "  # another comment",
      '  empty: ""',
      "  paragraphs: first",
      "",
      "    second",
      "---",
      "data: {}",
      "",
    ].join("\n");

    expect(parseDocuments(formatted)).toEqual([
      {
        data: {
          plain: "a long value that goes on over the next line",
          quoted: 'a value with a "quote" that goes on, and joins',
          empty: "",
          paragraphs: "first\nsecond",
        },
      },
      { data: {} },
    ]);
  });

  it("refuses a plain value that YAML 1.1 reads as another type, a tab that indents, and a key twice", () => {
    expect(() => parseDocuments("value: yes\n")).toThrow(
      /Line 1: the plain value yes is one that YAML 1.1 does not read/,
    );
    expect(() => parseDocuments("data:\n\tvalue: x\n")).toThrow(/Line 2: a tab indents it/);
    expect(() => parseDocuments("value: a\nvalue: b\n")).toThrow(/Line 2: the key value is there twice/);
    expect(() => parseDocuments("- a\n")).toThrow(/a document is not a mapping/);
  });
});

describe("the states of the fixtures", () => {
  it("each have a name and a namespace of their own, which is the name of their workload cluster", () => {
    expect(new Set(FIXTURE_STATES.map((state) => state.name)).size).toBe(FIXTURE_STATES.length);
    expect(new Set(FIXTURE_STATES.map((state) => state.namespace)).size).toBe(FIXTURE_STATES.length);
    for (const state of FIXTURE_STATES) expect(state.namespace).toMatch(/^freelens-capi-[a-z-]+$/);
    expect(FIXTURE_STATES.filter((state) => !state.capture).map((state) => state.name)).toEqual([HAND_WRITTEN_STATE]);
  });

  it("tell a healthy workload cluster from one that is not", () => {
    const healthy = [
      fixtureObject("Cluster", "workload", undefined, {
        status: {
          conditions: [
            { type: "Available", status: "True" },
            { type: "ScalingUp", status: "False" },
          ],
        },
      }),
      fixtureObject("Machine", "workload-a", undefined, {
        status: { nodeRef: { name: "workload-a" }, conditions: [{ type: "Ready", status: "True" }] },
      }),
    ];

    expect(notHealthy(healthy)).toBeUndefined();
    expect(notHealthy(healthy.slice(1))).toBe("the Cluster does not report Available True");

    const scaling = structuredClone(healthy);

    (scaling[0].status?.conditions as { status: string }[])[1].status = "True";
    expect(notHealthy(scaling)).toBe("Cluster workload reports ScalingUp True");

    const withoutNode = structuredClone(healthy);

    delete withoutNode[1].status?.nodeRef;
    expect(notHealthy(withoutNode)).toBe("Machine workload-a has no Node");
  });

  // A workload cluster whose MachineHealthCheck targets two workers, by its selector and the label of its Cluster.
  function checkedWorkers(status: Record<string, unknown> | undefined, healthChecked = [true, true]): KubeObject[] {
    const machine = (name: string, labels: Record<string, string>, checked: boolean) =>
      fixtureObject("Machine", name, undefined, {
        metadata: { name, labels: { "cluster.x-k8s.io/cluster-name": "workload", ...labels } },
        status: {
          nodeRef: { name },
          conditions: [
            { type: "Ready", status: "True" },
            ...(checked ? [{ type: "HealthCheckSucceeded", status: "True" }] : []),
          ],
        },
      });
    const deployment = { "topology.cluster.x-k8s.io/deployment-name": "md-0" };

    return [
      fixtureObject("Cluster", "workload", undefined, {
        status: { conditions: [{ type: "Available", status: "True" }] },
      }),
      fixtureObject("MachineHealthCheck", "workload-md-0", undefined, {
        spec: { clusterName: "workload", selector: { matchLabels: deployment } },
        ...(status ? { status } : {}),
      }),
      machine("workload-md-0-a", deployment, healthChecked[0]),
      machine("workload-md-0-b", deployment, healthChecked[1]),
      // Neither the control plane nor a Machine of another Cluster with the same labels is a target.
      machine("workload-control-plane-a", { "cluster.x-k8s.io/control-plane": "" }, false),
      machine("other-md-0-a", { ...deployment, "cluster.x-k8s.io/cluster-name": "other" }, false),
    ];
  }

  it("waits for every Machine that a MachineHealthCheck targets, found from its selector, to be healthy", () => {
    expect(notHealthy(checkedWorkers({ expectedMachines: 2, currentHealthy: 2 }))).toBeUndefined();
    // A MachineHealthCheck that has not counted the Machines yet, which its status alone would let pass.
    expect(notHealthy(checkedWorkers(undefined))).toBe(
      "MachineHealthCheck workload-md-0 counts no Machines, and targets 2",
    );
    expect(notHealthy(checkedWorkers({ expectedMachines: 0, currentHealthy: 0 }))).toBe(
      "MachineHealthCheck workload-md-0 counts 0 Machines, and targets 2",
    );
    expect(notHealthy(checkedWorkers({ expectedMachines: 2, currentHealthy: 1 }))).toBe(
      "MachineHealthCheck workload-md-0 reports 1 of the 2 Machines it targets healthy",
    );
    expect(notHealthy(checkedWorkers({ expectedMachines: 2, currentHealthy: 2 }, [true, false]))).toBe(
      "Machine workload-md-0-b, which MachineHealthCheck workload-md-0 targets, does not report HealthCheckSucceeded True",
    );
  });

  it("leaves out of the targets a Machine that an annotation pauses or keeps out of remediation", () => {
    // Two more workers of the MachineDeployment, which the controller of the MachineHealthCheck does not check:
    // neither has HealthCheckSucceeded, and neither is counted.
    const skipped = ["cluster.x-k8s.io/paused", "cluster.x-k8s.io/skip-remediation"].map((annotation, index) =>
      fixtureObject("Machine", `workload-md-0-skipped-${index}`, undefined, {
        metadata: {
          name: `workload-md-0-skipped-${index}`,
          labels: { "cluster.x-k8s.io/cluster-name": "workload", "topology.cluster.x-k8s.io/deployment-name": "md-0" },
          annotations: { [annotation]: "" },
        },
        status: {
          nodeRef: { name: `workload-md-0-skipped-${index}` },
          conditions: [{ type: "Ready", status: "True" }],
        },
      }),
    );

    expect(
      healthChecksPending([...checkedWorkers({ expectedMachines: 2, currentHealthy: 2 }), ...skipped]),
    ).toBeUndefined();
  });

  it("finds the targets of a MachineHealthCheck whose selector has expressions", () => {
    const withSelector = (selector: Record<string, unknown>) =>
      checkedWorkers({ expectedMachines: 2, currentHealthy: 2 }).map((object) =>
        object.kind === "MachineHealthCheck" ? { ...object, spec: { clusterName: "workload", selector } } : object,
      );
    const deployment = "topology.cluster.x-k8s.io/deployment-name";

    expect(
      healthChecksPending(withSelector({ matchExpressions: [{ key: deployment, operator: "In", values: ["md-0"] }] })),
    ).toBeUndefined();
    // Only the control plane Machine of the Cluster has no such label.
    expect(
      healthChecksPending(withSelector({ matchExpressions: [{ key: deployment, operator: "DoesNotExist" }] })),
    ).toBe("MachineHealthCheck workload-md-0 counts 2 Machines, and targets 1");
  });

  it("matches labels as a selector of Kubernetes does", () => {
    const labels = { "cluster.x-k8s.io/cluster-name": "workload", tier: "workers" };

    expect(selects({}, labels)).toBe(true);
    expect(selects({ matchLabels: { tier: "workers" } }, labels)).toBe(true);
    expect(selects({ matchLabels: { tier: "control-plane" } }, labels)).toBe(false);
    expect(selects({ matchExpressions: [{ key: "tier", operator: "In", values: ["workers"] }] }, labels)).toBe(true);
    expect(selects({ matchExpressions: [{ key: "tier", operator: "NotIn", values: ["workers"] }] }, labels)).toBe(
      false,
    );
    expect(selects({ matchExpressions: [{ key: "pool", operator: "NotIn", values: ["a"] }] }, labels)).toBe(true);
    expect(selects({ matchExpressions: [{ key: "tier", operator: "Exists" }] }, labels)).toBe(true);
    expect(selects({ matchExpressions: [{ key: "constructor", operator: "Exists" }] }, labels)).toBe(false);
    expect(selects({ matchExpressions: [{ key: "tier", operator: "DoesNotExist" }] }, labels)).toBe(false);
    expect(selects({ matchExpressions: [{ key: "tier", operator: "Gt", values: ["1"] }] }, labels)).toBe(false);
  });

  it("writes the objects of no-status as a user writes them, its claim naming its Cluster in spec.clusterName (SPEC-0005, P21)", () => {
    const objects = objectsWithoutStatus("workload", "workload-namespace", {
      kubernetes: "v1.37.0",
      clusterApi: "v1.14.4",
    }) as KubeObject[];

    expect(objects.filter((object) => object.kind === "Cluster").map((cluster) => cluster.metadata.name)).toEqual([
      "workload",
    ]);
    expect(objects.filter((object) => object.kind === "IPAddressClaim").map((claim) => claim.spec)).toEqual([
      {
        clusterName: "workload",
        poolRef: { apiGroup: "ipam.test-environment.freelens.app", kind: "AddressPool", name: "workload" },
      },
    ]);
  });

  it.each(["healthy", "paused"])(
    "finds in the set of %s every Machine that a MachineHealthCheck targets healthy",
    (name) => {
      const objects = readFixtureSet(join(root, FIXTURES_FOLDER, name));

      expect(objects.filter((object) => object.kind === "MachineHealthCheck").length).toBeGreaterThan(0);
      expect(healthChecksPending(objects)).toBeUndefined();
      if (name === "healthy") expect(notHealthy(objects)).toBeUndefined();
    },
  );
});

describe("the objects that a session applies to a namespace of its own", () => {
  it("go to a namespace of the scripts that is no namespace of a state of the fixtures, whose objects they would replace, nor that of the restricted identity", () => {
    expect(ownNamespaceProblem("freelens-capi-tree-large")).toBeUndefined();
    for (const state of FIXTURE_STATES) {
      expect(ownNamespaceProblem(state.namespace)).toBe(
        `${state.namespace} is the namespace of the fixtures of ${state.name}`,
      );
    }
    expect(ownNamespaceProblem(IDENTITY_NAMESPACE)).toBe(
      "freelens-capi-restricted is the namespace of the second identity of the restricted session",
    );
    for (const namespace of ["default", "kube-system", "freelens-capi-", "freelens-capi-Large", "freelens-capi-x-"]) {
      expect(ownNamespaceProblem(namespace), namespace).toBe(
        `${namespace} is not a namespace of the scripts, freelens-capi- and a name`,
      );
    }
    expect(ownNamespaceProblem(`freelens-capi-${"x".repeat(49)}`)).toBeUndefined();
    expect(ownNamespaceProblem(`freelens-capi-${"x".repeat(50)}`)).toMatch(/is not a namespace of the scripts/);
  });

  it("are refused, before any request, in the namespace of a state, outside the namespaces of the scripts, or in another namespace than theirs", () => {
    const requests: string[][] = [];
    // A session whose kubectl records what it is asked, and answers nothing.
    const session = {
      kubectl: (args: string[]) => {
        requests.push(args);
        return "";
      },
    } as unknown as DefinitionsSession;
    const elsewhere = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "x", namespace: "freelens-capi-other" },
    };

    expect(() => applyObjects(session, "freelens-capi-healthy", [])).toThrow(
      "freelens-capi-healthy is the namespace of the fixtures of healthy: the objects of a session go to a namespace of their own",
    );
    expect(() => removeObjects(session, "default")).toThrow(/^default is not a namespace of the scripts/);
    expect(() => removeObjects(session, IDENTITY_NAMESPACE)).toThrow(
      "freelens-capi-restricted is the namespace of the second identity of the restricted session: the objects of a session go to a namespace of their own",
    );
    expect(() => applyObjects(session, "freelens-capi-tree-large", [elsewhere])).toThrow(
      "/ConfigMap/freelens-capi-other/x is not in freelens-capi-tree-large, the namespace of a session",
    );
    expect(requests).toEqual([]);
  });

  it("are applied once what the namespace held is removed, the finalizers of its objects first, then the namespace, which the apply creates again", () => {
    const namespace = "freelens-capi-tree-large";
    // The cluster of the definitions serves the kinds of Kamaji, which its reads name (SPEC-0028, P6).
    const resources = fixtureResourcesOn("definitions").join(",");
    const held = {
      apiVersion: "cluster.x-k8s.io/v1beta2",
      kind: "Machine",
      metadata: { name: "m", namespace, finalizers: ["machine.cluster.x-k8s.io"] },
    };
    const requests: string[][] = [];
    // A session whose kubectl records what it is asked, and answers as a namespace that holds one object with a
    // finalizer until the apply creates it again, empty.
    const session = {
      kubectl: (args: string[]) => {
        requests.push(args);
        if (args[0] === "get" && args[1] === "namespace") return `namespace/${namespace}\n`;
        if (args[0] === "get" && args[1] === resources) {
          const created = requests.some((request) => request[0] === "create" && request[1] === "namespace");

          return JSON.stringify({ items: created ? [] : [held] });
        }
        return "";
      },
    } as unknown as DefinitionsSession;

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      applyObjects(session, namespace, []);
    } finally {
      log.mockRestore();
    }
    expect(requests.map((args) => args.slice(0, 3).join(" "))).toEqual([
      `get namespace ${namespace}`,
      `get ${resources} --namespace`,
      "patch machine.v1beta2.cluster.x-k8s.io m",
      `delete namespace ${namespace}`,
      `create namespace ${namespace}`,
      `get ${resources} --namespace`,
    ]);
  });
});

describe("the fixture sets of the repository", () => {
  const setsFolder = join(root, FIXTURES_FOLDER);

  it.each(FIXTURE_STATES.map((state) => [state.name, state]))(
    "%s is written as the scripts write it, in its namespace, with every owner and nothing that a capture leaves out",
    (_name, state) => {
      const folder = join(setsFolder, state.name);
      const files = readdirSync(folder).filter((file) => file.endsWith(".yaml"));
      const objects = readFixtureSet(folder);

      expect(readdirSync(folder)).toContain("README.md");
      expect(objects.length).toBeGreaterThan(0);
      // Each file is a fixed point of the writer: what yamlfmt and yamllint were checked on.
      for (const file of files) {
        const text = readFileSync(join(folder, file), "utf8");

        expect(stringifyDocuments(parseDocuments(text))).toBe(text);
      }
      expect(fixtureFiles(objects)).toEqual(
        new Map(files.map((file) => [file, readFileSync(join(folder, file), "utf8")])),
      );
      expect(() => creationLevels(objects)).not.toThrow();
      for (const object of objects) {
        expect(object.metadata.namespace).toBe(state.namespace);
        expect(["Secret", "ConfigMap"]).not.toContain(object.kind);
        expect(cleanObject(object, 0)).toEqual({ object, leftOut: [] });
        expect(timesInsideText(object)).toEqual([]);
        // The first tier can give the object its generation.
        expect(() => applyPlan(object, 0)).not.toThrow();
      }
    },
  );

  it.each(FIXTURE_STATES.filter((state) => state.capture).map((state) => [state.name, state]))(
    "%s has the README that the scripts write for it",
    (_name, state) => {
      const folder = join(setsFolder, state.name);
      const readme = readFileSync(join(folder, "README.md"), "utf8");
      const { clusterApi } = readPins(root).pins;
      // What a capture left out of A3 is not in the files any more: the README is what says it.
      const leftOut = [
        ...(/What SPEC-0001 A3 forbids showing is left out:([^]*)$/.exec(readme)?.[1] ?? "").matchAll(/`([^`]+)`/g),
      ].map((match) => match[1]);

      expect(readme).toBe(
        fixtureReadme(state, readFixtureSet(folder), leftOut, {
          clusterApi: clusterApi.version,
          kubernetes: clusterApi.workloadKubernetesVersion,
          upgradeFrom: clusterApi.workloadKubernetesUpgradeFrom,
        }),
      );
    },
  );

  it("holds no capacity but the one of the fixtures, in any object of any set", () => {
    // The paths of every capacity of a value that is not the one of the fixtures, wherever it is.
    const otherCapacities = (value: unknown, path: string): string[] => {
      if (Array.isArray(value)) return value.flatMap((item, index) => otherCapacities(item, `${path}[${index}]`));
      if (typeof value !== "object" || value === null) return [];
      return Object.entries(value).flatMap(([key, item]) =>
        key === "capacity" && !isDeepStrictEqual(item, HOST_CAPACITY)
          ? [`${path}.${key}`]
          : otherCapacities(item, `${path}.${key}`),
      );
    };
    const found = FIXTURE_STATES.flatMap((state) =>
      readFixtureSet(join(setsFolder, state.name)).flatMap((object) =>
        otherCapacities(object, `${state.name}: ${object.kind} ${object.metadata.name} `),
      ),
    );

    expect(found).toEqual([]);
  });

  it("holds a set for each state and nothing else", () => {
    expect(
      readdirSync(setsFolder)
        .filter((entry) => !entry.startsWith("."))
        .sort(),
    ).toEqual(FIXTURE_STATES.map((state) => state.name).sort());
  });
});

describe("the trial of S7", () => {
  const objects = s7Clusters("v1.37.0") as KubeObject[];
  const find = (kind: string, name: string) =>
    objects.find((object) => object.kind === kind && object.metadata.name === name) as KubeObject;
  // The fields of a spec of a Cluster that name its parts or its topology.
  const parts = (spec: Record<string, unknown> | undefined) =>
    ["controlPlaneRef", "infrastructureRef", "topology"].filter((key) => spec?.[key] !== undefined);

  it("has a namespace of its own, and workload clusters named as the scripts name theirs, which down deletes", () => {
    expect(S7.namespace).toMatch(/^freelens-capi-[a-z0-9-]+$/);
    expect(FIXTURE_STATES.map((state) => state.namespace)).not.toContain(S7.namespace);
    for (const name of [S7.noReference, S7.infrastructureOnly, S7.controlPlaneOnly]) {
      expect(name).toMatch(/^freelens-capi-s7-[a-z-]+$/);
    }
    expect(DOWN_WORKLOADS.map((workload) => workload.name)).toEqual(
      expect.arrayContaining([S7.infrastructureOnly, S7.controlPlaneOnly, "freelens-capi-md", "freelens-capi-healthy"]),
    );
  });

  it("writes case 1 with neither reference nor topology, and one field of its spec, which the schema asks", () => {
    const cluster = s7ClusterWithNoReference() as KubeObject;

    expect(cluster.metadata).toEqual({ name: S7.noReference, namespace: S7.namespace });
    expect(parts(cluster.spec)).toEqual([]);
    expect(Object.keys(cluster.spec ?? {})).toEqual(["clusterNetwork"]);
  });

  it("writes case 2 with an infrastructure reference only, labelled for kindnet, and one control plane Machine", () => {
    const cluster = find("Cluster", S7.infrastructureOnly);
    const machine = find("Machine", `${S7.infrastructureOnly}-control-plane-0`);

    expect(parts(cluster.spec)).toEqual(["infrastructureRef"]);
    expect(cluster.metadata.labels).toEqual({ [KINDNET_LABEL.key]: KINDNET_LABEL.value });
    expect(cluster.spec?.infrastructureRef).toMatchObject({ kind: "DevCluster", name: S7.infrastructureOnly });
    expect(find("DevCluster", S7.infrastructureOnly)).toBeDefined();
    expect(machine.metadata.labels).toEqual({ "cluster.x-k8s.io/control-plane": "" });
    expect(machine.spec).toMatchObject({
      clusterName: S7.infrastructureOnly,
      version: "v1.37.0",
      bootstrap: { configRef: { kind: "KubeadmConfig", name: machine.metadata.name } },
      infrastructureRef: { kind: "DevMachine", name: machine.metadata.name },
    });
    expect(find("KubeadmConfig", machine.metadata.name).spec).toHaveProperty("initConfiguration");
    expect(find("DevMachine", machine.metadata.name)).toBeDefined();
  });

  it("writes case 3 with a control plane reference only, to a KubeadmControlPlane of one replica", () => {
    const cluster = find("Cluster", S7.controlPlaneOnly);

    expect(parts(cluster.spec)).toEqual(["controlPlaneRef"]);
    expect(cluster.spec?.controlPlaneRef).toMatchObject({ kind: "KubeadmControlPlane", name: S7.controlPlaneOnly });
    expect(find("KubeadmControlPlane", S7.controlPlaneOnly).spec).toMatchObject({
      replicas: 1,
      version: "v1.37.0",
      machineTemplate: { spec: { infrastructureRef: { kind: "DevMachineTemplate", name: S7.controlPlaneOnly } } },
    });
    expect(find("DevMachineTemplate", S7.controlPlaneOnly)).toBeDefined();
  });

  it("names the containers of case 2 as down takes them: its load balancer, and the node of its Machine", () => {
    // The development provider names the node of a Machine that is not of a MachinePool after the Machine, which is
    // the name of the Cluster with what follows when it starts with it, and the load balancer after the Cluster
    // (test/infrastructure/docker/internal/controllers/backends/docker/dockermachine_backend.go:809-814;
    // test/infrastructure/docker/internal/docker/util.go:47-53; loadbalancer.go:103).
    const machine = find("Machine", `${S7.infrastructureOnly}-control-plane-0`).metadata.name;
    const labels = (role: string) => ({
      Labels: { "io.x-k8s.kind.cluster": S7.infrastructureOnly, "io.x-k8s.kind.role": role },
    });
    const containers = [
      { Id: "load-balancer", Name: `/${S7.infrastructureOnly}-lb`, Config: labels("external-load-balancer") },
      { Id: "node", Name: `/${machine}`, Config: labels("control-plane") },
    ];

    expect(machine.startsWith(`${S7.infrastructureOnly}-`)).toBe(true);
    expect(workloadContainerIds(containers, S7.infrastructureOnly)).toEqual(["load-balancer", "node"]);
    // One character shorter, it would be the name that kind gives a node, and down would leave every container.
    expect(() =>
      workloadContainerIds(
        [
          ...containers,
          { Id: "kind", Name: `/${S7.infrastructureOnly}-control-plane`, Config: labels("control-plane") },
        ],
        S7.infrastructureOnly,
      ),
    ).toThrow(/is not one that the development provider makes/);
  });

  it("writes every object in the namespace of the trial, at v1beta2", () => {
    expect(objects).toHaveLength(8);
    for (const object of objects) {
      expect(object.metadata.namespace, `${object.kind} ${object.metadata.name}`).toBe(S7.namespace);
      expect(object.apiVersion).toMatch(/\/v1beta2$/);
    }
  });
});

// The captures of a Cluster with a KamajiControlPlane (SPEC-0028, P1 to P8): what the first of their pull requests
// brings, with no set in the repository yet.
describe("the files of the captures of Kamaji", () => {
  it("are each taken from the official source of its project, at the versions of the pins (SPEC-0028, P3)", () => {
    const { pins } = readPins(root);
    const chart = "charts/kamaji/Chart.lock";

    expect(kamajiProviderAsset(pins, "/cache", "control-plane-components.yaml")).toEqual({
      name: `control-plane-components.yaml of the Kamaji control plane provider ${pins.kamajiProvider.version}`,
      url: `https://github.com/clastix/cluster-api-control-plane-provider-kamaji/releases/download/${pins.kamajiProvider.version}/control-plane-components.yaml`,
      file: join(
        "/cache",
        "cluster-api-control-plane-provider-kamaji",
        pins.kamajiProvider.version,
        "control-plane-components.yaml",
      ),
      digest: pins.kamajiProvider.assets["control-plane-components.yaml"],
      executable: false,
    });
    expect(kamajiChartFile(pins, "/cache", chart)).toMatchObject({
      url: `https://raw.githubusercontent.com/clastix/kamaji/${pins.kamaji.commit}/${chart}`,
      file: join("/cache", "kamaji", pins.kamaji.commit, chart),
      digest: pins.kamaji.chart[chart],
    });
    expect(() => kamajiChartFile(pins, "/cache", "charts/kamaji/values.sample.yml")).toThrow(
      /is not a file of the chart of Kamaji that the pins hold/,
    );
    expect(kamajiEtcdChart(pins, "/cache").url).toBe(
      `https://clastix.github.io/charts/kamaji-etcd-${pins.kamajiEtcd.version}.tgz`,
    );
    expect(metallbManifest(pins, "/cache").url).toBe(
      `https://raw.githubusercontent.com/metallb/metallb/${pins.metallb.version}/config/manifests/metallb-native.yaml`,
    );
    expect(helmArchive(pins, "/cache").url).toBe(`https://get.helm.sh/helm-${pins.helm.version}-linux-amd64.tar.gz`);
    // The releases that SPEC-0028 read, and the version of kamaji-etcd that the Chart.lock of Kamaji names.
    expect([pins.kamajiProvider.version, pins.kamaji.version, pins.kamajiEtcd.version]).toEqual([
      "v0.22.0",
      "26.9.3-edge",
      "0.15.0",
    ]);
  });

  it("refuses the archive of kamaji-etcd that helm dependency build downloads, before the install, when it is not the one of its pin (SPEC-0028, P3)", () => {
    const archive = Buffer.from("the archive of kamaji-etcd\n");
    const pinned = { ...kamajiEtcdChart(readPins(root).pins, "/cache"), digest: sha256(archive) };
    const name = pinned.file.split("/").pop() as string;

    expect(() => assertChartDependencies(new Map([[name, archive]]), pinned)).not.toThrow();
    expect(() =>
      assertChartDependencies(new Map([[name, Buffer.from("the archive of kamaji-etcd, changed\n")]]), pinned),
    ).toThrow(/the chart kamaji-etcd 0\.15\.0 has the SHA-256 [0-9a-f]{64}, and the pin is/);
    expect(() =>
      assertChartDependencies(
        new Map([
          [name, archive],
          ["kamaji-etcd-0.18.1.tgz", archive],
        ]),
        pinned,
      ),
    ).toThrow(/left kamaji-etcd-0\.15\.0\.tgz, kamaji-etcd-0\.18\.1\.tgz in the folder charts/);
    expect(() => assertChartDependencies(new Map(), pinned)).toThrow(/left nothing in the folder charts/);
  });
});

describe("the cluster of the captures of Kamaji", () => {
  it("runs on Linux on amd64 alone, and refuses any other system or processor by its name (SPEC-0028, P2)", () => {
    expect(() => assertCapturesHost("linux", "x64")).not.toThrow();
    for (const [platform, arch] of [
      ["linux", "arm64"],
      ["darwin", "arm64"],
      ["darwin", "x64"],
      ["win32", "x64"],
    ]) {
      expect(() => assertCapturesHost(platform, arch)).toThrow(`not on ${platform} ${arch}`);
    }
  });

  it("gives the host the value of nf_conntrack_max that kube-proxy computes, when it has another one (SPEC-0028, P3)", () => {
    // 32768 for each processor, and 131072 at least.
    expect([1, 4, 16].map(conntrackMax)).toEqual([131_072, 131_072, 524_288]);
    expect(conntrackSetting(524_288, 16)).toBeUndefined();
    expect(conntrackSetting(262_144, 16)).toBe("net.netfilter.nf_conntrack_max=524288");
    // kube-proxy writes it whenever it differs, a higher value too.
    expect(conntrackSetting(1_048_576, 16)).toBe("net.netfilter.nf_conntrack_max=524288");
    expect(conntrackSetting(undefined, 2)).toBe("net.netfilter.nf_conntrack_max=131072");
  });

  it("takes the one address of its pool of MetalLB near the end of the network of kind (SPEC-0028, P3, P4)", () => {
    expect(poolAddress("172.19.0.0/16")).toBe("172.19.255.200");
    expect(poolAddress("172.18.5.0/16")).toBe("172.18.255.200");
    expect(poolAddress("10.89.0.0/24")).toBe("10.89.0.200");
    for (const subnet of ["fc00:f853:ccd:e793::/64", "172.19.0.0/25", "300.19.0.0/16", "172.19.0.0"]) {
      expect(() => poolAddress(subnet), subnet).toThrow(/is not an IPv4 subnet of a \/24 or larger/);
    }

    const [pool, advertisement] = JSON.parse(metallbPool("172.19.255.200")).items;

    expect(pool.spec).toEqual({ addresses: ["172.19.255.200/32"] });
    expect(advertisement.spec).toEqual({ ipAddressPools: [pool.metadata.name] });
  });

  it("installs the Kamaji control plane provider from the local repository, under the label that clusterctl gives it (SPEC-0028, P3)", () => {
    const configuration = (kamaji?: string) =>
      JSON.parse(
        clusterctlConfiguration("/repository", "/overrides", {
          clusterApi: "v1.14.4",
          certManager: "v1.21.3",
          ...(kamaji ? { kamaji } : {}),
        }),
      ).providers as { name: string; type: string; url: string }[];

    expect(configuration().map((provider) => provider.name)).toEqual(["cluster-api", "kubeadm", "kubeadm", "docker"]);
    expect(configuration("v0.22.0").at(-1)).toEqual({
      name: "kamaji",
      type: "ControlPlaneProvider",
      url: "/repository/control-plane-kamaji/v0.22.0/control-plane-components.yaml",
    });
    expect(KAMAJI_PROVIDER.label).toBe("control-plane-kamaji");
  });

  const provider = (type: string, providerName: string, version: string): InventoryProvider => ({
    metadata: { namespace: "kamaji-system" },
    type,
    providerName,
    version,
  });
  const atThePins = [
    provider("CoreProvider", "cluster-api", "v1.14.4"),
    provider("BootstrapProvider", "kubeadm", "v1.14.4"),
    provider("ControlPlaneProvider", "kubeadm", "v1.14.4"),
    provider("InfrastructureProvider", "docker", "v1.14.4"),
    provider("ControlPlaneProvider", "kamaji", "v0.22.0"),
  ];
  const versions = { clusterApi: "v1.14.4", kamaji: "v0.22.0" };

  it("runs the providers of the pins and the Kamaji control plane provider at its own, and refuses one missing, one at another release and one more (SPEC-0028, P3)", () => {
    expect(kamajiProvidersAgainstPins(atThePins, versions)).toEqual({ missing: [], other: [] });
    expect(kamajiProvidersAgainstPins(atThePins.slice(0, 4), versions).missing).toEqual([
      { type: "ControlPlaneProvider", name: "kamaji", version: "v0.22.0" },
    ]);
    expect(
      kamajiProvidersAgainstPins(
        [...atThePins.slice(0, 4), provider("ControlPlaneProvider", "kamaji", "v0.21.0")],
        versions,
      ).other,
    ).toEqual(["ControlPlaneProvider kamaji is installed at v0.21.0, and the pins say v0.22.0"]);
    expect(
      kamajiProvidersAgainstPins([...atThePins, provider("InfrastructureProvider", "aws", "v1.14.4")], versions).other,
    ).toEqual(["InfrastructureProvider aws is installed, and the cluster of the captures runs no such provider"]);
  });

  it("starts the Kamaji control plane provider again before the captures, and refuses a cluster where it finds no Deployment of it (SPEC-0028, P5)", () => {
    expect(providerDeployments("deployment.apps/capi-kamaji-controller-manager\n")).toEqual([
      "deployment.apps/capi-kamaji-controller-manager",
    ]);
    expect(() => providerDeployments("")).toThrow(
      "The cluster of the captures has no Deployment of the Kamaji control plane provider with the label cluster.x-k8s.io/provider=control-plane-kamaji",
    );
  });
});

describe("nf_conntrack_max of the host of the cluster of the captures", () => {
  const RECORD = "/state/freelens-capi-kamaji/conntrack";

  // The host as the scripts reach it: its value, `sudo -n sysctl -w`, which sets it unless `sudo` is false, and the
  // record of the value that it had, each step that changes something recorded in `done`.
  function host(value: number | undefined, options: { sudo?: boolean; record?: string } = {}) {
    const done: string[] = [];
    let record = options.record;
    const operations: ConntrackHost = {
      read: () => value,
      write: (setting) => {
        done.push(`sudo -n sysctl -w ${setting}`);
        if (options.sudo === false) return false;
        value = Number(setting.split("=")[1]);
        return true;
      },
      recorded: () => record,
      record: (recorded) => {
        done.push(`record ${recorded}`);
        record = `${recorded}\n`;
      },
      forget: () => {
        done.push("forget");
        record = undefined;
      },
      recordFile: RECORD,
      log: () => undefined,
    };

    return { operations, done, record: () => record };
  }

  it("records the value that the host had once it has set the new one, the first time alone (SPEC-0028, P3)", () => {
    const first = host(262_144);

    raiseConntrackMax(first.operations, 16);
    expect(first.done).toEqual(["sudo -n sysctl -w net.netfilter.nf_conntrack_max=524288", "record 262144"]);

    // Set again over a record of a change before it: the record keeps the value from before the first change.
    const again = host(262_144, { record: "131072\n" });

    raiseConntrackMax(again.operations, 16);
    expect(again.done).toEqual(["sudo -n sysctl -w net.netfilter.nf_conntrack_max=524288"]);
    expect(again.record()).toBe("131072\n");

    const already = host(524_288);

    raiseConntrackMax(already.operations, 16);
    expect(already.done).toEqual([]);

    // A value that cannot be read is set, and nothing records it.
    const unread = host(undefined);

    raiseConntrackMax(unread.operations, 2);
    expect(unread.done).toEqual(["sudo -n sysctl -w net.netfilter.nf_conntrack_max=131072"]);
  });

  it("leaves no record when it cannot set the value, and names the command that sets it", () => {
    const refused = host(262_144, { sudo: false });

    expect(() => raiseConntrackMax(refused.operations, 16)).toThrow(
      "set it with sudo sysctl -w net.netfilter.nf_conntrack_max=524288, then run this command again. The host has 262144 now",
    );
    expect(refused.done).toEqual(["sudo -n sysctl -w net.netfilter.nf_conntrack_max=524288"]);
    expect(refused.record()).toBeUndefined();
  });

  it("gives the value back and forgets the record, with no sudo when the host holds that value already (SPEC-0028, P2)", () => {
    const changed = host(524_288, { record: "262144\n" });

    restoreConntrackMax(changed.operations);
    expect(changed.done).toEqual(["sudo -n sysctl -w net.netfilter.nf_conntrack_max=262144", "forget"]);

    // After a reboot, or once it was given back by hand: no sudo, which could not run here.
    const back = host(262_144, { record: "262144\n", sudo: false });

    restoreConntrackMax(back.operations);
    expect(back.done).toEqual(["forget"]);

    const none = host(524_288);

    restoreConntrackMax(none.operations);
    expect(none.done).toEqual([]);
  });

  it("keeps the record when it cannot give the value back, and names the command that gives it back", () => {
    const refused = host(524_288, { record: "262144\n", sudo: false });

    expect(() => restoreConntrackMax(refused.operations)).toThrow(
      "give it back with sudo sysctl -w net.netfilter.nf_conntrack_max=262144, then run pnpm e2e:cluster:down again",
    );
    expect(refused.record()).toBe("262144\n");

    const broken = host(524_288, { record: "NaN\n" });

    expect(() => restoreConntrackMax(broken.operations)).toThrow(
      `${RECORD} does not hold a value of net.netfilter.nf_conntrack_max`,
    );
    expect(broken.done).toEqual([]);
  });
});

describe("down with the cluster of the captures of Kamaji", () => {
  const tierOf = (name: string): Tier => ({
    name,
    context: `kind-${name}`,
    folder: `/state/${name}`,
    kubeconfig: `/state/${name}/kubeconfig`,
    record: `/state/${name}/node`,
    dockerSocket: false,
    resources: FIXTURE_RESOURCES,
  });
  const management = tierOf("freelens-capi-management");
  const definitions = tierOf("freelens-capi-definitions");
  const captures: CapturesTier = {
    tier: tierOf(KAMAJI_CLUSTER),
    workloads: [{ name: "freelens-capi-kamaji-healthy" }, { name: ADDRESS_HELPER }],
  };

  // The system that `down` acts on, with the cluster of the captures and the containers of its workload clusters: Docker
  // or kind failing when `failing` says so, and the settings of the host not given back when `restoring` is an error.
  function system(records: Record<string, string>, options: { restoring?: Error; failing?: "docker" | "list" } = {}) {
    const { restoring, failing } = options;
    const done: string[] = [];
    let clusters = [KAMAJI_CLUSTER, "freelens-capi-definitions"];
    const containers: Record<string, string[]> = {
      "freelens-capi-kamaji-healthy": ["k1", "k2"],
      [ADDRESS_HELPER]: ["h1"],
    };
    const operations: DownOperations = {
      localDocker: () => {
        if (failing === "docker") throw new Error("DOCKER_HOST names another Docker than the local one");
      },
      kindClusters: () => {
        if (failing === "list") throw new Error("kind cannot reach Docker");
        return [...clusters];
      },
      nodeId: (target) => ({ [KAMAJI_CLUSTER]: "k0", "freelens-capi-definitions": "d1" })[target.name],
      recordedNode: (target) => records[target.name],
      deleteCluster: (target) => {
        done.push(`delete ${target.name}`);
        clusters = clusters.filter((name) => name !== target.name);
      },
      workloadContainers: (workload) => containers[workload.name] ?? [],
      removeContainers: (ids) => {
        done.push(`remove ${ids.join(" ")}`);
        for (const name of Object.keys(containers))
          containers[name] = containers[name].filter((id) => !ids.includes(id));
      },
      forget: (target) => done.push(`forget ${target.name}`),
      restoreSettings: (target) => {
        if (restoring) throw restoring;
        done.push(`restore ${target.name}`);
      },
      log: () => undefined,
    };

    return { operations, done };
  }

  it("deletes the cluster of the captures and the containers of its workload clusters, the helper among them, and gives the host its setting back (SPEC-0028, P2)", () => {
    const { operations, done } = system({ [KAMAJI_CLUSTER]: "k0", "freelens-capi-definitions": "d1" });

    takeDown(operations, management, definitions, [], captures);
    expect(done).toEqual([
      `delete ${KAMAJI_CLUSTER}`,
      "delete freelens-capi-definitions",
      "remove k1 k2",
      "remove h1",
      `restore ${KAMAJI_CLUSTER}`,
      "forget freelens-capi-management",
      `forget ${KAMAJI_CLUSTER}`,
      "forget freelens-capi-definitions",
    ]);
  });

  it("leaves in place the cluster of the captures and its containers when this state folder did not record it, and keeps the state", () => {
    const { operations, done } = system({ "freelens-capi-definitions": "d1" });

    expect(() => takeDown(operations, management, definitions, [], captures)).toThrow(
      /deleting the kind cluster freelens-capi-kamaji: it is not the kind cluster that the scripts created[^]*deleting the containers of freelens-capi-kamaji-healthy: this state folder has no record of the cluster of the captures/,
    );
    expect(done).toEqual(["delete freelens-capi-definitions", `restore ${KAMAJI_CLUSTER}`]);
  });

  it("keeps the state when the setting of the host cannot be given back", () => {
    const { operations, done } = system(
      { [KAMAJI_CLUSTER]: "k0", "freelens-capi-definitions": "d1" },
      { restoring: new Error("sudo -n sysctl failed") },
    );

    expect(() => takeDown(operations, management, definitions, [], captures)).toThrow(
      /giving back the settings of the host of freelens-capi-kamaji: sudo -n sysctl failed/,
    );
    expect(done.filter((step) => step.startsWith("forget"))).toEqual([]);
  });

  it.each([
    [
      "Docker is not the local one",
      "docker",
      "Docker is not the local one, or does not answer, and nothing was deleted: DOCKER_HOST names another Docker than the local one",
    ],
    [
      "the kind clusters cannot be listed",
      "list",
      "The kind clusters could not be listed, and nothing was deleted: kind cannot reach Docker",
    ],
  ] as const)(
    "gives the host its setting back, and deletes nothing, when %s (SPEC-0028, P2)",
    (_case, failing, error) => {
      const records = { [KAMAJI_CLUSTER]: "k0", "freelens-capi-definitions": "d1" };
      const stopped = system(records, { failing });

      expect(() => takeDown(stopped.operations, management, definitions, [], captures)).toThrow(error);
      expect(stopped.done).toEqual([`restore ${KAMAJI_CLUSTER}`]);

      // Neither given back: both said, the state kept.
      const refused = system(records, { failing, restoring: new Error("sudo -n sysctl failed") });

      expect(() => takeDown(refused.operations, management, definitions, [], captures)).toThrow(
        `${error}; giving back the settings of the host of ${KAMAJI_CLUSTER}: sudo -n sysctl failed`,
      );
      expect(refused.done).toEqual([]);
    },
  );

  it("knows the workload clusters of every Kamaji state and of the helper, apart from those of the real project", () => {
    expect(KAMAJI_WORKLOADS.map((workload) => workload.name)).toEqual([
      ...KAMAJI_STATES.map((state) => state.namespace),
      ADDRESS_HELPER,
    ]);
    expect(DOWN_WORKLOADS.map((workload) => workload.name).filter((name) => name.includes("kamaji"))).toEqual([]);
  });
});

describe("the command line of the captures of Kamaji", () => {
  it("takes the Kamaji states with capture-kamaji alone, named or all (SPEC-0028, P7)", () => {
    expect(parseCommand(["capture-kamaji", "all"])).toEqual({
      name: "capture-kamaji",
      states: [],
      kamajiStates: KAMAJI_STATES,
    });
    expect(
      parseCommand(["capture-kamaji", "kamaji-paused", "kamaji-healthy"]).kamajiStates.map((state) => state.name),
    ).toEqual(["kamaji-paused", "kamaji-healthy"]);
    expect(() => parseCommand(["capture-kamaji"])).toThrow(/capture-kamaji takes the states of the fixtures/);
    expect(() => parseCommand(["capture-kamaji", "healthy"])).toThrow(
      /healthy is not a state of the captures of Kamaji/,
    );
  });

  it("leaves the Kamaji states out of capture all, and of every state of the fixtures, and says so (SPEC-0028, P7)", () => {
    const kamaji = KAMAJI_STATES.map((state) => state.name);

    expect(parseCommand(["capture", "all"]).states.map((state) => state.name)).not.toEqual(
      expect.arrayContaining([kamaji[0]]),
    );
    for (const argv of [["capture", "all"], ["fixtures-check"], ["fixtures-down", "all"]]) {
      expect(parseCommand(argv).states.filter((state) => kamaji.includes(state.name))).toEqual([]);
    }
    expect(statesOf(["all"]).filter((state) => kamaji.includes(state.name))).toEqual([]);
    for (const name of kamaji) expect(CAPTURE_LEAVES_OUT).toContain(name);
    expect(CAPTURE_LEAVES_OUT).toContain("pnpm e2e:fixtures:capture:kamaji");
    expect(() => parseCommand(["capture", "kamaji-healthy"])).toThrow(
      /kamaji-healthy is a state of the captures of Kamaji, which pnpm e2e:fixtures:capture:kamaji alone takes/,
    );
    expect(() => parseCommand(["fixtures-up", "kamaji-healthy"])).toThrow(/is a state of the captures of Kamaji/);
  });
});

describe("the kinds that the scripts read in a namespace", () => {
  it("are those of the cluster that a command reads, each kind cluster of the scripts with its own (SPEC-0028, P6)", () => {
    expect(TIER_RESOURCES).toEqual({
      "freelens-capi-definitions": [...FIXTURE_RESOURCES, ...KAMAJI_RESOURCES],
      "freelens-capi-management": FIXTURE_RESOURCES,
      [KAMAJI_CLUSTER]: [...FIXTURE_RESOURCES, ...KAMAJI_RESOURCES],
    });
  });

  it("name the two kinds of Kamaji on the cluster of the captures and on the cluster of the definitions alone (SPEC-0028, P6)", () => {
    expect(fixtureResourcesOn("real project")).toEqual(FIXTURE_RESOURCES);
    for (const cluster of ["captures", "definitions"] as const) {
      expect(fixtureResourcesOn(cluster)).toEqual([...FIXTURE_RESOURCES, ...KAMAJI_RESOURCES]);
    }
    expect(KAMAJI_RESOURCES).toEqual([
      "kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io",
      "tenantcontrolplanes.v1alpha1.kamaji.clastix.io",
    ]);
    // Never a Secret, a ConfigMap, a Deployment, a Service, a Pod or the DataStore.
    for (const resource of fixtureResourcesOn("captures")) {
      expect(resource).not.toMatch(/^(secrets|configmaps|deployments|services|pods|datastores)\./);
    }
  });
});

describe("the definitions of Kamaji on the first tier", () => {
  it("are those of the release of the provider, with the label of the provider that clusterctl gives them, as they are otherwise (SPEC-0028, P8)", () => {
    const definition = (name: string, provider = "kamaji") =>
      [
        "apiVersion: apiextensions.k8s.io/v1",
        "kind: CustomResourceDefinition",
        "metadata:",
        "  annotations:",
        "    controller-gen.kubebuilder.io/version: v0.19.0",
        "  labels:",
        `    cluster.x-k8s.io/provider: ${provider}`,
        "    cluster.x-k8s.io/v1beta2: v1alpha2",
        `  name: ${name}`,
        "spec:",
        "  group: controlplane.cluster.x-k8s.io",
        "  names:",
        "    description: the label cluster.x-k8s.io/provider: kamaji, in a text",
        "",
      ].join("\n");
    const release = [
      "apiVersion: v1\nkind: Namespace\nmetadata:\n  labels:\n    cluster.x-k8s.io/provider: kamaji\n  name: kamaji-system\n",
      definition("kamajicontrolplanes.controlplane.cluster.x-k8s.io"),
      definition("kamajicontrolplanetemplates.controlplane.cluster.x-k8s.io"),
    ].join("---\n");

    expect(relabeledDefinitions(release, "control-plane-kamaji")).toEqual([
      definition("kamajicontrolplanes.controlplane.cluster.x-k8s.io", "control-plane-kamaji"),
      definition("kamajicontrolplanetemplates.controlplane.cluster.x-k8s.io", "control-plane-kamaji"),
    ]);
    expect(() =>
      relabeledDefinitions(definition("x.example.com").replace("    cluster.x-k8s.io/provider: kamaji\n", ""), "y"),
    ).toThrow(/The definition x\.example\.com does not have one label cluster\.x-k8s\.io\/provider in its metadata/);
  });
});

describe("the toggles of the Kamaji kinds on the first tier", () => {
  it("give a KamajiControlPlane the generation of a set whose Available observed the one before, as kamaji-version-refused will hold one, by spec.dataStoreSchema (SPEC-0028, P8)", () => {
    // Written as the set of kamaji-version-refused will hold it, which comes with the sets: the step that failed
    // observed the generation of the object, and Available the one before (K6).
    const captured: KubeObject = {
      apiVersion: "controlplane.cluster.x-k8s.io/v1alpha2",
      kind: "KamajiControlPlane",
      metadata: { name: "workload", namespace: "workload", generation: 3 },
      spec: { replicas: 1, version: "v1.38.0" },
      status: {
        conditions: [
          { type: "TenantControlPlaneCreated", status: "False", reason: "Pending", observedGeneration: 3 },
          { type: "Available", status: "True", reason: "Available", observedGeneration: 2 },
        ],
      },
    };
    const fixture = cleanObject(captured, 0).object;

    expect(fixture.metadata.generation).toBe(2);

    const plan = applyPlan(fixture, 0);

    expect(plan.create.spec).toEqual({ replicas: 1, version: "v1.38.0", dataStoreSchema: "test-environment" });
    expect(plan.changes).toEqual([{ spec: { dataStoreSchema: null } }]);
    expect(applyPlan({ ...fixture, metadata: { ...fixture.metadata, generation: 3 } }, 0).changes).toEqual([
      { spec: { dataStoreSchema: "test-environment" } },
      { spec: { dataStoreSchema: null } },
    ]);
  });

  it("give a TenantControlPlane whose own status observed the generation before its own its generation, by spec.dataStoreOverrides (SPEC-0028, P8)", () => {
    const fixture: KubeObject = {
      apiVersion: "kamaji.clastix.io/v1alpha1",
      kind: "TenantControlPlane",
      metadata: { name: "workload", namespace: "workload", generation: 2 },
      spec: { dataStore: "default", kubernetes: { version: "v1.37.0" } },
      status: { observedGeneration: 1 },
    };
    const plan = applyPlan(fixture, 0);

    expect(plan.create.spec).toEqual({
      dataStore: "default",
      kubernetes: { version: "v1.37.0" },
      dataStoreOverrides: [],
    });
    expect(plan.changes).toEqual([{ spec: { dataStoreOverrides: null } }]);
    expect(fixture.spec).toEqual({ dataStore: "default", kubernetes: { version: "v1.37.0" } });
  });
});

// A TenantControlPlane as the API server returns it, in a settled state, with the status that Kamaji writes; every
// name and checksum is made up.
function capturedTenant(generation = 2): KubeObject {
  return {
    apiVersion: "kamaji.clastix.io/v1alpha1",
    kind: "TenantControlPlane",
    metadata: {
      name: "workload",
      namespace: "workload",
      generation,
      finalizers: ["finalizer.kamaji.clastix.io", "finalizer.kamaji.clastix.io/soot"],
      ownerReferences: [
        {
          apiVersion: "controlplane.cluster.x-k8s.io/v1alpha2",
          kind: "KamajiControlPlane",
          name: "workload",
          uid: "7d0c1b0a-1111-4222-8333-944455556666",
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    },
    spec: { dataStore: "default", kubernetes: { version: "v1.36.4" } },
    status: {
      observedGeneration: generation,
      certificates: {
        ca: {
          secretName: "workload-ca",
          checksum: "8e9c3a1f0b2d4c6e8a0b1c2d3e4f5a6b",
          lastUpdate: "2026-11-22T13:00:10Z",
        },
        apiServer: { secretName: "workload-api-server-certificate", checksum: "" },
      },
      kubeconfig: { admin: { secretName: "workload-admin-kubeconfig", checksum: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d" } },
      kubeadmconfig: { configmapName: "workload-kubeadmconfig", checksum: "aabbccddeeff00112233445566778899" },
      kubernetesResources: {
        version: { status: "Ready", version: "v1.36.4" },
        // The status of the Deployment of the tenant, one generation above the TenantControlPlane (L27).
        deployment: {
          name: "workload",
          namespace: "workload",
          selector: "kamaji.clastix.io/name=workload",
          observedGeneration: generation + 1,
          replicas: 1,
          readyReplicas: 1,
          conditions: [{ type: "Available", status: "True", reason: "MinimumReplicasAvailable" }],
        },
        service: {
          name: "workload",
          namespace: "workload",
          port: 6443,
          conditions: [{ type: "LoadBalancerReady", status: "True", observedGeneration: 7 }],
        },
      },
    },
  };
}

describe("the cleaning of a TenantControlPlane", () => {
  it("gives every checksum of its status one fixed value, and keeps the names of its Secrets and ConfigMaps (SPEC-0028, P6)", () => {
    const { object } = cleanObject(capturedTenant(), 0);
    const status = object.status as Record<string, any>;

    expect(FIXTURE_CHECKSUM).toMatch(/^0{32}$/);
    expect(status.certificates.ca).toEqual({
      secretName: "workload-ca",
      checksum: FIXTURE_CHECKSUM,
      lastUpdate: "2026-11-22T13:00:10Z",
    });
    // An empty checksum is no checksum: none is given one.
    expect(status.certificates.apiServer).toEqual({ secretName: "workload-api-server-certificate", checksum: "" });
    expect(status.kubeconfig.admin).toEqual({ secretName: "workload-admin-kubeconfig", checksum: FIXTURE_CHECKSUM });
    expect(status.kubeadmconfig).toEqual({ configmapName: "workload-kubeadmconfig", checksum: FIXTURE_CHECKSUM });
    expect(JSON.stringify(object)).not.toMatch(/8e9c3a1f|1a2b3c4d|aabbccdd/);
    // Another kind keeps what it holds under that name.
    const machine = fixtureObject("Machine", "m", undefined, { status: { checksum: "8e9c3a1f" } });

    expect(cleanObject(machine, 0).object.status).toEqual({ checksum: "8e9c3a1f" });
  });

  it("reads its generation from its own status.observedGeneration alone, and keeps every other one of its status as captured, one above its generation too (SPEC-0028, P6)", () => {
    const settled = cleanObject(capturedTenant(4), 0).object;
    const status = settled.status as Record<string, any>;

    expect(settled.metadata.generation).toBeUndefined();
    expect(status.observedGeneration).toBe(1);
    expect(status.kubernetesResources.deployment.observedGeneration).toBe(5);
    expect(status.kubernetesResources.service.conditions[0].observedGeneration).toBe(7);

    // Its own status one behind, as in the first second of an upgrade (L27): the generation is kept as that distance.
    const behind = capturedTenant(4);

    (behind.status as Record<string, any>).observedGeneration = 3;

    const cleaned = cleanObject(behind, 0).object;

    expect(cleaned.metadata.generation).toBe(2);
    expect((cleaned.status as Record<string, any>).observedGeneration).toBe(1);
    expect((cleaned.status as Record<string, any>).kubernetesResources.deployment.observedGeneration).toBe(5);
    // Every other kind follows the rule of SPEC-0002: a status that observed a later generation is refused.
    expect(() =>
      cleanObject(
        { ...capturedTenant(4), kind: "KamajiControlPlane", apiVersion: "controlplane.cluster.x-k8s.io/v1alpha2" },
        0,
      ),
    ).toThrow(/observed a generation after its own, 4/);
  });

  it("keeps the finalizers of Kamaji, and the owner of the tenant without its identifier", () => {
    const { object } = cleanObject(capturedTenant(), 0);

    expect(object.metadata.finalizers).toEqual(["finalizer.kamaji.clastix.io", "finalizer.kamaji.clastix.io/soot"]);
    expect(object.metadata.ownerReferences).toEqual([
      {
        apiVersion: "controlplane.cluster.x-k8s.io/v1alpha2",
        kind: "KamajiControlPlane",
        name: "workload",
        controller: true,
        blockOwnerDeletion: true,
      },
    ]);
    expect(cleanObject(object, 0)).toEqual({ object, leftOut: [] });
  });
});

describe("the times of the probe of core inside its messages", () => {
  const capturedAt = "2026-11-22T13:05:00Z";
  const seconds = secondsBetween(capturedAt, CAPTURE_TIME);
  const failed = `${PROBE_TIME_WORDS[0]}2026-11-22T13:03:50Z`;
  const machineFailed = `${PROBE_TIME_WORDS[1]}2026-11-22T13:03:50Z`;
  const cluster = (): KubeObject =>
    fixtureObject("Cluster", "workload", undefined, {
      status: {
        conditions: [
          { type: "RemoteConnectionProbe", status: "False", reason: "ProbeFailed", message: failed },
          {
            type: "Available",
            status: "False",
            reason: "NotAvailable",
            message: `* RemoteConnectionProbe: ${failed}\n* ControlPlaneAvailable: NotAvailable`,
          },
        ],
      },
    });
  const machine = (): KubeObject =>
    fixtureObject("Machine", "workload-md-0-a", undefined, {
      status: {
        conditions: [
          { type: "NodeReady", status: "Unknown", reason: "ConnectionDown", message: machineFailed },
          { type: "NodeHealthy", status: "Unknown", reason: "ConnectionDown", message: machineFailed },
          { type: "Ready", status: "Unknown", reason: "ReadyUnknown", message: `* NodeHealthy: ${machineFailed}` },
        ],
      },
    });
  const messages = (object: KubeObject) =>
    (object.status?.conditions as { message: string }[]).map((item) => item.message);

  it("move as the time of a field, in a capture, each matched by its own words, those that repeat them included (SPEC-0028, P6)", () => {
    expect(messages(cleanObject(cluster(), seconds).object)).toEqual([
      `${PROBE_TIME_WORDS[0]}2025-12-31T23:58:50Z`,
      `* RemoteConnectionProbe: ${PROBE_TIME_WORDS[0]}2025-12-31T23:58:50Z\n* ControlPlaneAvailable: NotAvailable`,
    ]);
    expect(messages(cleanObject(machine(), seconds).object)).toEqual([
      `${PROBE_TIME_WORDS[1]}2025-12-31T23:58:50Z`,
      `${PROBE_TIME_WORDS[1]}2025-12-31T23:58:50Z`,
      `* NodeHealthy: ${PROBE_TIME_WORDS[1]}2025-12-31T23:58:50Z`,
    ]);
    expect(timesInsideText(cluster())).toEqual([]);
    expect(timesInsideText(machine())).toEqual([]);
  });

  it("move to the run on an apply, and back home on the read back, as the times of the fields", () => {
    const fixture = cleanObject(machine(), seconds).object;
    const plan = applyPlan(fixture, 3600);

    expect(messages({ ...fixture, status: plan.status })[0]).toBe(`${PROBE_TIME_WORDS[1]}2026-01-01T00:58:50Z`);
    expect(shiftTimes(shiftTimes(fixture, 12_345), -12_345)).toEqual(fixture);
  });

  it("leave every other time inside a text refused", () => {
    for (const text of [
      "since 2026-11-22T13:19:10Z",
      "Last probe at 2026-11-22T13:19:10Z",
      `${PROBE_TIME_WORDS[0]}2026-02-30T00:00:00Z`,
      `${failed}, and again at 2026-11-22T13:04:10Z`,
    ]) {
      expect(timesInsideText({ status: { conditions: [{ message: text }] } }), text).toEqual([
        ".status.conditions[0].message",
      ]);
    }
  });
});

// What `clusterctl describe cluster` prints with its default flags, as the probes saw it (SPEC-0028, L22): each column
// as wide as its widest cell, one space between two, and the lines after the first of a message under it.
function describeOutput(rows: string[][]): string {
  const header = ["NAME", "REPLICAS", "AVAILABLE", "READY", "UP TO DATE", "STATUS", "REASON", "SINCE", "MESSAGE"];
  const table = [header, ...rows];
  const widths = header.map((_, index) => Math.max(...table.map((row) => (row[index] ?? "").split("\n")[0].length)));
  const message = widths.slice(0, -1).reduce((offset, width) => offset + width + 1, 0);

  return table
    .flatMap((row) => [
      row
        .map((cell, index) => (index < header.length - 1 ? cell.padEnd(widths[index]) : cell.split("\n")[0]))
        .join(" ")
        .trimEnd(),
      ...(row[8] ?? "")
        .split("\n")
        .slice(1)
        .map((line) => `${"\u2502".padEnd(message)}${line}`),
    ])
    .join("\n");
}

// Of a Cluster of Kamaji, with names and ages of no run in particular: a cell can be empty, a message can take several
// lines, and a deleting object has `!! DELETED !!` before its name.
const DESCRIBED = {
  healthy: describeOutput([
    ["Cluster workload/workload", "2/2", "2", "2", "2", "True", "Available", "1s", ""],
    ["\u251c\u2500DevCluster workload/workload", "", "", "", "", "True", "Ready", "32s", ""],
    ["\u251c\u2500KamajiControlPlane workload/workload, v1.36.4", "1/1", "1", "1", "1", "True", "Available", "12s", ""],
    ["\u2514\u2500Workers", "", "", "", "", "", "", "", ""],
  ]),
  provisioning: describeOutput([
    [
      "Cluster workload/workload",
      "0/1",
      "",
      "",
      "",
      "False",
      "NotAvailable",
      "2s",
      "* RemoteConnectionProbe: Remote connection not established yet\n* ControlPlaneAvailable: KamajiControlPlane status.initialization.controlPlaneInitialized is false",
    ],
    ["\u251c\u2500DevCluster workload/workload", "", "", "", "", "", "", "", ""],
    ["\u2514\u2500KamajiControlPlane workload/workload, v1.36.4", "", "", "", "", "", "", "", ""],
  ]),
  deleting: describeOutput([
    [
      "!! DELETED !! Cluster workload/workload",
      "1/1",
      "1",
      "1",
      "1",
      "False",
      "NotAvailable",
      "1s",
      "* Deleting: Waiting for KamajiControlPlane to be deleted",
    ],
    [
      "\u251c\u2500!! DELETED !! KamajiControlPlane workload/workload, v1.37.0",
      "1/1",
      "1",
      "1",
      "1",
      "True",
      "Available",
      "21s",
      "",
    ],
    ["\u2514\u2500DevCluster workload/workload", "", "", "", "", "True", "Ready", "4m5s", ""],
  ]),
};

describe("the row of clusterctl describe cluster that the README of a Kamaji set keeps", () => {
  it("reads each cell by the column that the header names, a cell that clusterctl leaves empty kept empty (SPEC-0028, P6)", () => {
    expect(describedClusterRow(DESCRIBED.healthy, "workload", "workload")).toEqual({
      REPLICAS: "2/2",
      AVAILABLE: "2",
      READY: "2",
      "UP TO DATE": "2",
      STATUS: "True",
      REASON: "Available",
    });
    expect(describedClusterRow(DESCRIBED.provisioning, "workload", "workload")).toEqual({
      REPLICAS: "0/1",
      AVAILABLE: "",
      READY: "",
      "UP TO DATE": "",
      STATUS: "False",
      REASON: "NotAvailable",
    });
  });

  it("finds the row of a deleting Cluster by its name after !! DELETED !!", () => {
    expect(describedClusterRow(DESCRIBED.deleting, "workload", "workload")).toEqual({
      REPLICAS: "1/1",
      AVAILABLE: "1",
      READY: "1",
      "UP TO DATE": "1",
      STATUS: "False",
      REASON: "NotAvailable",
    });
  });

  it("refuses an output with no row of the Cluster, or with no header that names every column", () => {
    expect(() => describedClusterRow(DESCRIBED.healthy, "workload", "other")).toThrow(
      /printed no row of the Cluster workload\/other/,
    );
    expect(() =>
      describedClusterRow(DESCRIBED.healthy.replace("UP TO DATE", "UP-TO-DATE"), "workload", "workload"),
    ).toThrow(/has no column UP TO DATE/);
    expect(() =>
      describedClusterRow(DESCRIBED.healthy.split("\n").slice(1).join("\n"), "workload", "workload"),
    ).toThrow(/printed no header/);
  });
});

describe("the README of a Kamaji set", () => {
  const state = KAMAJI_STATES.find((item) => item.name === "kamaji-healthy") as KamajiState;
  const versions = {
    clusterApi: "v1.14.4",
    provider: "v0.22.0",
    kamaji: "26.9.3-edge",
    tenant: "v1.36.4",
    upgradeTo: "v1.37.0",
    refused: "v1.38.0",
  };
  const objects = [
    fixtureObject("Cluster", state.namespace, undefined, {
      metadata: { name: state.namespace, namespace: state.namespace },
    }),
    {
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
      kind: "DevCluster",
      metadata: { name: state.namespace, namespace: state.namespace },
      spec: { controlPlaneEndpoint: { host: "172.18.255.200", port: 6443 } },
    },
  ];
  const files = new Map([
    ["cluster.yaml", "kind: Cluster\n"],
    ["devcluster.yaml", "kind: DevCluster\n"],
  ]);
  const row = describedClusterRow(DESCRIBED.provisioning, "workload", "workload");
  const run = "https://github.com/freelensapp/freelens-capi-extension/actions/runs/1/attempts/1";

  it("says the versions, the endpoint, the run, the six cells of the row of clusterctl and the SHA-256 of each file (SPEC-0028, P6)", () => {
    const readme = kamajiReadme(state, objects, [], { versions, run, row, files });
    // The paragraphs, which the README writes in lines of 80 columns, each on one line.
    const text = readme.replace(/\n(?!\n|- )/g, " ");

    for (const version of Object.values(versions).filter((value) => value !== "v1.37.0" && value !== "v1.38.0")) {
      expect(text).toContain(`\`${version}\``);
    }
    expect(text).toContain("`172.18.255.200:6443`");
    expect(text).toContain(`Captured by the run ${run}`);
    expect(text).toContain(`offset from the moment of the capture, from \`${CAPTURE_TIME}\`,`);
    expect(readme).toContain(
      "- REPLICAS: `0/1`\n- AVAILABLE: empty\n- READY: empty\n- UP TO DATE: empty\n- STATUS: `False`\n- REASON: `NotAvailable`",
    );
    expect(readme).toContain(`- \`cluster.yaml\`: \`${sha256(Buffer.from("kind: Cluster\n"))}\``);
    expect(readme).toContain(`- \`devcluster.yaml\`: \`${sha256(Buffer.from("kind: DevCluster\n"))}\``);
    expect(readme).toMatch(/^# A Cluster of Kamaji, healthy\n\n/);
    expect(readme).not.toMatch(/SINCE `|MESSAGE: /);
    expect(readmeRecords(readme)).toEqual({
      row,
      digests: new Map([...files].map(([file, text]) => [file, sha256(Buffer.from(text))])),
    });
    expect(kamajiReadme(state, objects, [], { versions, run: undefined, row, files })).toContain("Captured outside CI");
  });

  it("takes the run of CI from the variables of GitHub Actions alone", () => {
    expect(
      ciRun({
        GITHUB_ACTIONS: "true",
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "freelensapp/freelens-capi-extension",
        GITHUB_RUN_ID: "1",
        GITHUB_RUN_ATTEMPT: "2",
      }),
    ).toBe("https://github.com/freelensapp/freelens-capi-extension/actions/runs/1/attempts/2");
    expect(ciRun({ GITHUB_RUN_ID: "1" })).toBeUndefined();
    expect(ciRun({})).toBeUndefined();
  });
});

// A condition of an object of the states of Kamaji.
function kamajiCondition(type: string, status: string, reason?: string, message?: string) {
  return { type, status, ...(reason ? { reason } : {}), ...(message ? { message } : {}) };
}

interface KamajiReading {
  version: string;
  kcp?: { spec?: Record<string, unknown>; status?: Record<string, unknown>; conditions?: object[]; deleting?: boolean };
  tenant?: { state?: string; deployment?: Record<string, unknown> } | false;
  cluster?: { conditions?: object[]; controlPlane?: Record<string, unknown>; deleting?: boolean };
  machine?: { conditions: object[] } | false;
  // The conditions that sum up a worker Machine, on its MachineSet and its MachineDeployment.
  summary?: string;
}

// The objects of a namespace of the cluster of the captures as one reading gives them, from a healthy Cluster of Kamaji
// with one worker and what the reading changes, every object at the version of the reading.
function kamajiReading(namespace: string, reading: KamajiReading): KubeObject[] {
  const metadata = (kind: string, name = namespace) => ({
    name,
    namespace,
    resourceVersion: `${kind}-${reading.version}`,
  });
  const counters = { replicas: 1, readyReplicas: 1, availableReplicas: 1, upToDateReplicas: 1 };
  const kcpStatus = { ...counters, version: "v1.36.4", ready: true, ...reading.kcp?.status };
  const controlPlane = {
    desiredReplicas: 1,
    ...Object.fromEntries(Object.keys(counters).map((key) => [key, kcpStatus[key as keyof typeof counters]])),
    ...reading.cluster?.controlPlane,
  };
  const objects: KubeObject[] = [
    {
      apiVersion: "cluster.x-k8s.io/v1beta2",
      kind: "Cluster",
      metadata: {
        ...metadata("Cluster"),
        ...(reading.cluster?.deleting ? { deletionTimestamp: "2026-11-22T13:00:00Z" } : {}),
      },
      spec: {},
      status: {
        controlPlane,
        conditions: reading.cluster?.conditions ?? [
          kamajiCondition("Available", "True", "Available"),
          kamajiCondition("RemoteConnectionProbe", "True", "ProbeSucceeded"),
          kamajiCondition("InfrastructureReady", "True", "Ready"),
          kamajiCondition("WorkerMachinesReady", reading.summary ?? "True"),
          kamajiCondition("Paused", "False", "NotPaused"),
        ],
      },
    },
    {
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
      kind: "DevCluster",
      metadata: metadata("DevCluster"),
      spec: { controlPlaneEndpoint: { host: "172.18.255.200", port: 6443 } },
      status: { conditions: [kamajiCondition("Ready", "True", "Ready")] },
    },
    {
      apiVersion: "controlplane.cluster.x-k8s.io/v1alpha2",
      kind: "KamajiControlPlane",
      metadata: {
        ...metadata("KamajiControlPlane"),
        ...(reading.kcp?.deleting
          ? { deletionTimestamp: "2026-11-22T13:00:00Z", finalizers: [FIXTURE_FINALIZER] }
          : {}),
      },
      spec: { replicas: 1, version: "v1.36.4", ...reading.kcp?.spec },
      status: {
        ...kcpStatus,
        conditions: reading.kcp?.conditions ?? [
          kamajiCondition("TenantControlPlaneCreated", "True", "Succeeded"),
          kamajiCondition("TenantControlPlaneAddressReady", "True", "Succeeded"),
          kamajiCondition("KamajiControlPlaneIsReady", "True", "Succeeded"),
          kamajiCondition("Available", "True", "Available"),
        ],
      },
    },
  ];

  if (reading.tenant !== false) {
    objects.push({
      apiVersion: "kamaji.clastix.io/v1alpha1",
      kind: "TenantControlPlane",
      metadata: metadata("TenantControlPlane"),
      spec: { kubernetes: { version: "v1.36.4" } },
      status: {
        kubernetesResources: {
          version: { status: reading.tenant?.state ?? "Ready", version: "v1.36.4" },
          deployment: { selector: `kamaji.clastix.io/name=${namespace}`, ...reading.tenant?.deployment },
        },
      },
    });
  }
  if (reading.machine !== false) {
    const summary = [kamajiCondition("MachinesReady", reading.summary ?? "True"), kamajiCondition("Paused", "False")];

    objects.push(
      {
        apiVersion: "cluster.x-k8s.io/v1beta2",
        kind: "MachineDeployment",
        metadata: metadata("MachineDeployment", `${namespace}-md-0`),
        status: { conditions: summary },
      },
      {
        apiVersion: "cluster.x-k8s.io/v1beta2",
        kind: "MachineSet",
        metadata: metadata("MachineSet", `${namespace}-md-0-a`),
        status: { conditions: summary },
      },
      {
        apiVersion: "cluster.x-k8s.io/v1beta2",
        kind: "Machine",
        metadata: metadata("Machine", `${namespace}-md-0-a-b`),
        status: {
          nodeRef: { name: `${namespace}-md-0-a-b` },
          conditions: reading.machine?.conditions ?? [
            kamajiCondition("Ready", "True", "Ready"),
            kamajiCondition("NodeReady", "True", "NodeReady"),
            kamajiCondition("NodeHealthy", "True", "NodeHealthy"),
          ],
        },
      },
    );
  }
  return objects;
}

// A cluster of the captures for a capture of a Kamaji state, which answers the readings of each namespace in the order
// given, the last one again once they run out, records every other request, and describes a Cluster at once.
function capturesProject(readings: Record<string, KubeObject[][]>): {
  project: KamajiProject;
  requests: string[][];
  applied: unknown[];
} {
  const requests: string[][] = [];
  const applied: unknown[] = [];
  const project: KamajiProject = {
    kubectl: (args) => {
      if (args[0] === "get" && args[1] === fixtureResourcesOn("captures").join(",")) {
        const queue = readings[args[3]] ?? [[]];
        const items = queue.length > 1 ? queue.shift() : queue[0];

        requests.push(["read", args[3]]);
        return JSON.stringify({ items });
      }
      requests.push(args);
      return "";
    },
    apply: (manifest) => {
      const parsed = JSON.parse(manifest);

      applied.push(...(parsed.kind === "List" ? parsed.items : [parsed]));
      requests.push(["apply"]);
    },
    kindnet: (namespace) =>
      JSON.stringify({ kind: "List", items: [{ kind: "ClusterResourceSet", metadata: { namespace } }] }),
    resources: fixtureResourcesOn("captures"),
    address: "172.18.255.200",
    describe: (namespace) => {
      requests.push(["describe", namespace]);
      return DESCRIBED.healthy.replaceAll("workload", namespace);
    },
    versions: {
      clusterApi: "v1.14.4",
      provider: "v0.22.0",
      kamaji: "26.9.3-edge",
      tenant: "v1.36.4",
      upgradeTo: "v1.37.0",
      refused: "v1.38.0",
    },
    log: () => undefined,
    // At once, but through the loop of events, so that a capture that waits for good meets the timeout of its case.
    pause: () => new Promise((resolve) => setImmediate(resolve)),
  };

  return { project, requests, applied };
}

function kamajiState(name: string): KamajiState {
  return KAMAJI_STATES.find((state) => state.name === name) as KamajiState;
}

// A reading of a state of Kamaji, twice, for the two readings that agree, and a third time, after clusterctl.
const held = (objects: KubeObject[]) => [objects, objects, objects];

describe("the states of the captures of Kamaji", () => {
  it("are nine, each with a name and a namespace of its own, apart from the states of the fixtures (SPEC-0028, P1)", () => {
    expect(KAMAJI_STATES.map((state) => [state.name, state.namespace])).toEqual(
      [
        "provisioning",
        "healthy",
        "scaling",
        "upgrading",
        "version-refused",
        "sleeping",
        "not-ready",
        "paused",
        "deleting",
      ].map((name) => [`kamaji-${name}`, `freelens-capi-kamaji-${name}`]),
    );
    for (const state of KAMAJI_STATES) {
      expect(FIXTURE_STATES.map((item) => item.namespace)).not.toContain(state.namespace);
      expect(state.worker).toBe(state.name !== "kamaji-provisioning");
    }
    expect(nextMinor("v1.37.0")).toBe("v1.38.0");
  });

  it("make each KamajiControlPlane of one replica, its Service of type LoadBalancer, with the addons CoreDNS and kube-proxy, and the endpoint of the tenant written for a worker (SPEC-0028, P1, P4)", () => {
    const withWorker = kamajiCluster("workload", "workload", {
      version: "v1.36.4",
      address: "172.18.255.200",
      worker: true,
    }) as KubeObject[];
    const without = kamajiCluster("workload", "workload", { version: "v1.36.4", worker: false }) as KubeObject[];
    const find = (objects: KubeObject[], kind: string) => objects.find((object) => object.kind === kind) as KubeObject;

    for (const objects of [withWorker, without]) {
      expect(find(objects, "KamajiControlPlane").spec).toMatchObject({
        replicas: 1,
        version: "v1.36.4",
        network: { serviceType: "LoadBalancer" },
        addons: { coreDNS: { dnsServiceIPs: ["10.128.0.10"] }, kubeProxy: {} },
      });
      expect(find(objects, "Cluster").spec).toMatchObject({
        controlPlaneRef: { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KamajiControlPlane", name: "workload" },
        infrastructureRef: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: "workload" },
      });
    }
    expect(find(withWorker, "DevCluster").spec).toEqual({
      controlPlaneEndpoint: { host: "172.18.255.200", port: 6443 },
      backend: { docker: {} },
    });
    expect(find(without, "DevCluster").spec).toEqual({ backend: { docker: {} } });
    expect(find(withWorker, "MachineDeployment").spec).toMatchObject({
      replicas: 1,
      template: { spec: { version: "v1.36.4" } },
    });
    expect(find(withWorker, "Cluster").metadata.labels).toEqual({ [KINDNET_LABEL.key]: KINDNET_LABEL.value });
    expect(without.map((object) => object.kind)).toEqual(["Cluster", "DevCluster", "KamajiControlPlane"]);
  });

  it("hold kamaji-provisioning by a helper Cluster in a namespace of its own, which takes the address first and which the capture does not read (SPEC-0028, P5)", async () => {
    const state = kamajiState("kamaji-provisioning");
    const waiting = kamajiReading(state.namespace, {
      version: "2",
      kcp: {
        status: {
          ready: false,
          version: "",
          replicas: undefined,
          readyReplicas: undefined,
          availableReplicas: undefined,
          upToDateReplicas: undefined,
        },
        conditions: [
          kamajiCondition("TenantControlPlaneCreated", "True", "Succeeded"),
          kamajiCondition(
            "TenantControlPlaneAddressReady",
            "False",
            "Pending",
            "Control Plane Endpoint is not yet available",
          ),
        ],
      },
      machine: false,
    });
    const { project, requests, applied } = capturesProject({
      [ADDRESS_HELPER]: [kamajiReading(ADDRESS_HELPER, { version: "1", machine: false })],
      [state.namespace]: held(waiting),
    });
    const captured = await state.capture(project, state.namespace);

    expect(state.helper).toBe(ADDRESS_HELPER);
    expect(captureNamespaces(state)).toEqual([state.namespace, ADDRESS_HELPER]);
    expect(requests.slice(0, 4)).toEqual([
      ["create", "namespace", ADDRESS_HELPER],
      ["apply"],
      ["read", ADDRESS_HELPER],
      ["create", "namespace", state.namespace],
    ]);
    expect(requests.filter((request) => request[0] === "read" && request[1] === ADDRESS_HELPER)).toHaveLength(1);
    expect(captured.objects.every((object) => object.metadata.namespace === state.namespace)).toBe(true);
    expect(captured.described).toContain(`Cluster ${state.namespace}/${state.namespace}`);
    // No worker, and no endpoint written in the DevCluster of either Cluster.
    expect(applied.filter((object) => (object as KubeObject).kind === "MachineDeployment")).toEqual([]);
    expect(
      applied
        .filter((object) => (object as KubeObject).kind === "DevCluster")
        .map((object) => (object as KubeObject).spec),
    ).toEqual([{ backend: { docker: {} } }, { backend: { docker: {} } }]);
  });

  it("stop the capture of kamaji-provisioning when its tenant gets an address", async () => {
    const state = kamajiState("kamaji-provisioning");
    const { project } = capturesProject({
      [ADDRESS_HELPER]: [kamajiReading(ADDRESS_HELPER, { version: "1", machine: false })],
      [state.namespace]: [kamajiReading(state.namespace, { version: "2", machine: false })],
    });

    await expect(state.capture(project, state.namespace)).rejects.toThrow(
      /can no longer be reached: the tenant has an address/,
    );
  });

  it("hold kamaji-scaling and kamaji-upgrading by the quota of the scripts of one Pod, made before the change (SPEC-0028, P5)", async () => {
    const scaling = kamajiState("kamaji-scaling");
    const scaled = kamajiReading(scaling.namespace, {
      version: "2",
      kcp: {
        spec: { replicas: 3 },
        status: { ready: false },
        conditions: [
          kamajiCondition(
            "KamajiControlPlaneIsReady",
            "False",
            "Failed",
            "TenantControlPlane in Unknown status, enqueue back",
          ),
          kamajiCondition("Available", "False", "NotAvailable"),
        ],
      },
      tenant: {
        state: "Unknown",
        deployment: { conditions: [kamajiCondition("ReplicaFailure", "True", "FailedCreate")] },
      },
      cluster: {
        controlPlane: { desiredReplicas: 3 },
        conditions: [kamajiCondition("Available", "False", "NotAvailable")],
      },
    });
    const first = capturesProject({
      [scaling.namespace]: [kamajiReading(scaling.namespace, { version: "1" }), ...held(scaled)],
    });

    await scaling.capture(first.project, scaling.namespace);

    const quota = first.applied.find((object) => (object as KubeObject).kind === "ResourceQuota") as KubeObject;
    const order = first.requests.map((request) => request.join(" "));

    expect(quota).toEqual({
      apiVersion: "v1",
      kind: "ResourceQuota",
      metadata: { name: "test-environment", namespace: scaling.namespace },
      spec: { hard: { pods: "1" } },
    });
    expect(
      order.indexOf(
        `scale kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io ${scaling.namespace} --namespace ${scaling.namespace} --replicas 3`,
      ),
    ).toBeGreaterThan(order.lastIndexOf("apply"));

    const upgrading = kamajiState("kamaji-upgrading");
    const upgraded = kamajiReading(upgrading.namespace, {
      version: "2",
      kcp: { spec: { version: "v1.37.0" }, status: { upToDateReplicas: 0 } },
      tenant: {
        state: "Upgrading",
        deployment: { conditions: [kamajiCondition("ReplicaFailure", "True", "FailedCreate")] },
      },
    });
    const second = capturesProject({
      [upgrading.namespace]: [kamajiReading(upgrading.namespace, { version: "1" }), ...held(upgraded)],
    });

    await upgrading.capture(second.project, upgrading.namespace);
    expect(second.applied.filter((object) => (object as KubeObject).kind === "ResourceQuota")).toHaveLength(1);
    expect(second.requests.map((request) => request.join(" "))).toContain(
      `patch kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io ${upgrading.namespace} --namespace ${upgrading.namespace} --type merge --patch {"spec":{"version":"v1.37.0"}}`,
    );

    // A scale that the quota did not hold stops the capture.
    const notHeld = capturesProject({
      [scaling.namespace]: [
        kamajiReading(scaling.namespace, { version: "1" }),
        kamajiReading(scaling.namespace, {
          version: "2",
          kcp: { spec: { replicas: 3 }, status: { readyReplicas: 3 } },
        }),
      ],
    });

    await expect(scaling.capture(notHeld.project, scaling.namespace)).rejects.toThrow(
      /the quota did not hold the scale/,
    );
  });

  it("read kamaji-sleeping and kamaji-not-ready only past the grace of the conditions of the Nodes of their worker, once the probe of core failed and no Pod of the tenant ends (SPEC-0028, P5)", async () => {
    const machineFailed = `${PROBE_TIME_WORDS[1]}2026-11-22T13:03:50Z`;
    const zero = { replicas: 0, readyReplicas: 0, availableReplicas: 0, upToDateReplicas: 0, ready: false };
    const reading = (namespace: string, version: string, state: string, past: boolean, ending = 0): KubeObject[] =>
      kamajiReading(namespace, {
        version,
        kcp: {
          spec: state === "Sleeping" ? { replicas: 0 } : {},
          status: zero,
          conditions: [
            kamajiCondition(
              "KamajiControlPlaneIsReady",
              "False",
              "Failed",
              `TenantControlPlane in ${state} status, enqueue back`,
            ),
            kamajiCondition("Available", "False", "NotAvailable"),
          ],
        },
        tenant: {
          state,
          deployment: {
            terminatingReplicas: ending,
            conditions: [kamajiCondition("ReplicaFailure", "True", "FailedCreate")],
          },
        },
        cluster: {
          controlPlane: state === "Sleeping" ? { desiredReplicas: 0 } : {},
          conditions: [
            kamajiCondition(
              "RemoteConnectionProbe",
              "False",
              "ProbeFailed",
              `${PROBE_TIME_WORDS[0]}2026-11-22T13:03:50Z`,
            ),
            kamajiCondition("WorkerMachinesReady", past ? "Unknown" : "True"),
          ],
        },
        machine: {
          conditions: past
            ? [
                kamajiCondition("Ready", "Unknown"),
                kamajiCondition("NodeReady", "Unknown", "ConnectionDown", machineFailed),
                kamajiCondition("NodeHealthy", "Unknown", "ConnectionDown", machineFailed),
              ]
            : [
                kamajiCondition("Ready", "True"),
                kamajiCondition("NodeReady", "True"),
                kamajiCondition("NodeHealthy", "True"),
              ],
        },
        summary: past ? "Unknown" : "True",
      });

    for (const [name, state] of [
      ["kamaji-sleeping", "Sleeping"],
      ["kamaji-not-ready", "NotReady"],
    ]) {
      const { namespace } = kamajiState(name);
      const { project, requests, applied } = capturesProject({
        [namespace]: [
          kamajiReading(namespace, { version: "1" }),
          // A Pod of the tenant still ending, then the probe failed, the worker before its grace, long enough to be read
          // three times, as a capture would take it without the grace, then past it.
          reading(namespace, "2", state, false, 1),
          ...held(reading(namespace, "3", state, false)),
          ...held(reading(namespace, "4", state, true)),
        ],
      });
      const captured = await kamajiState(name).capture(project, namespace);

      expect(captured.objects.find((object) => object.kind === "Machine")?.status?.conditions).toEqual(
        reading(namespace, "4", state, true).find((object) => object.kind === "Machine")?.status?.conditions,
      );
      expect(requests.filter((request) => request[0] === "read")).toHaveLength(8);
      if (name === "kamaji-not-ready") {
        expect(applied.find((object) => (object as KubeObject).kind === "ResourceQuota")).toMatchObject({
          spec: { hard: { pods: "0" } },
        });
        expect(requests.map((request) => request.join(" "))).toContain(
          `delete pods --namespace ${namespace} --selector kamaji.clastix.io/name=${namespace} --wait=false`,
        );
      }
    }
  });

  it("stop the capture of kamaji-paused once its KamajiControlPlane gets an event and reports Paused (SPEC-0028, P5)", async () => {
    const state = kamajiState("kamaji-paused");
    const paused = (kcpPaused: boolean) =>
      kamajiReading(state.namespace, {
        version: "2",
        cluster: { conditions: [kamajiCondition("Available", "True"), kamajiCondition("Paused", "True", "Paused")] },
        kcp: kcpPaused
          ? { conditions: [kamajiCondition("Available", "True"), kamajiCondition("Paused", "True", "Paused")] }
          : undefined,
      }).map((object) =>
        ["MachineDeployment", "MachineSet", "Machine", "DevCluster"].includes(object.kind)
          ? { ...object, status: { ...object.status, conditions: [kamajiCondition("Paused", "True", "Paused")] } }
          : object,
      );
    const { project, requests } = capturesProject({
      [state.namespace]: [kamajiReading(state.namespace, { version: "1" }), ...held(paused(false))],
    });
    const captured = await state.capture(project, state.namespace);

    expect(requests.map((request) => request.join(" "))).toContain(
      `patch clusters.v1beta2.cluster.x-k8s.io ${state.namespace} --namespace ${state.namespace} --type merge --patch {"spec":{"paused":true}}`,
    );
    expect(captured.objects.find((object) => object.kind === "KamajiControlPlane")?.status?.conditions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "Paused" })]),
    );

    const stopped = capturesProject({
      [state.namespace]: [kamajiReading(state.namespace, { version: "1" }), paused(true)],
    });

    await expect(state.capture(stopped.project, state.namespace)).rejects.toThrow(
      /can no longer be reached: the KamajiControlPlane got an event, and reports Paused/,
    );
  });

  it("hold kamaji-deleting by the finalizer of the scripts on its KamajiControlPlane, read once the worker is gone (SPEC-0028, P5)", async () => {
    const state = kamajiState("kamaji-deleting");
    const deletingReading = (machine: boolean) =>
      kamajiReading(state.namespace, {
        version: machine ? "2" : "3",
        kcp: { deleting: true },
        cluster: {
          deleting: true,
          conditions: [kamajiCondition("Deleting", "True", "WaitingForControlPlaneDeletion")],
        },
        ...(machine ? {} : { machine: false }),
      });
    const { project, requests } = capturesProject({
      [state.namespace]: [
        kamajiReading(state.namespace, { version: "1" }),
        deletingReading(true),
        ...held(deletingReading(false)),
      ],
    });
    const captured = await state.capture(project, state.namespace);
    const order = requests.map((request) => request.join(" "));
    const finalizer = order.indexOf(
      `patch kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io ${state.namespace} --namespace ${state.namespace} --type merge --patch {"metadata":{"finalizers":["${FIXTURE_FINALIZER}"]}}`,
    );

    expect(finalizer).toBeGreaterThan(-1);
    expect(
      order.indexOf(
        `delete clusters.v1beta2.cluster.x-k8s.io ${state.namespace} --namespace ${state.namespace} --wait=false`,
      ),
    ).toBeGreaterThan(finalizer);
    expect(captured.objects.filter((object) => object.kind === "Machine")).toEqual([]);
  });

  it("remove with the workload cluster of a capture the finalizer of the scripts, before its deletion, and wait until the namespace is gone (SPEC-0028, P5)", async () => {
    const namespace = "freelens-capi-kamaji-deleting";
    let deleted = false;
    let namespaceDeleted = false;
    const requests: string[][] = [];
    const held = kamajiReading(namespace, { version: "1", kcp: { deleting: true }, machine: false });

    (held.find((object) => object.kind === "KamajiControlPlane") as KubeObject).metadata.finalizers = [
      "other",
      FIXTURE_FINALIZER,
    ];

    const project = {
      kubectl: (args: string[]) => {
        requests.push(args);
        if (args[0] === "get" && args[1] === "namespace") return namespaceDeleted ? "" : `namespace/${namespace}\n`;
        if (args[0] === "get") return JSON.stringify({ items: deleted ? [] : held });
        if (args[0] === "delete" && args[1] === "clusters.v1beta2.cluster.x-k8s.io") deleted = true;
        if (args[0] === "delete" && args[1] === "namespace") namespaceDeleted = true;
        return "";
      },
      resources: fixtureResourcesOn("captures"),
      log: () => undefined,
      pause: async () => undefined,
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await removeCapture(project, namespace);
    } finally {
      log.mockRestore();
    }

    const order = requests.map((args) => args.slice(0, 3).join(" "));

    expect(order).toEqual([
      `get namespace ${namespace}`,
      `get ${fixtureResourcesOn("captures").join(",")} --namespace`,
      `patch kamajicontrolplane.v1alpha2.controlplane.cluster.x-k8s.io ${namespace}`,
      "delete clusters.v1beta2.cluster.x-k8s.io --all",
      `get ${fixtureResourcesOn("captures").join(",")} --namespace`,
      `delete namespace ${namespace}`,
      `get namespace ${namespace}`,
    ]);
    expect(requests[2]).toContain(JSON.stringify({ metadata: { finalizers: ["other"] } }));
  });
});

// The time of the last probe that succeeded, in the messages of the conditions of the Node of a worker Machine past its
// grace (K23).
const NODE_DOWN = `${PROBE_TIME_WORDS[1]}2026-11-22T13:03:50Z`;

// A tenant that no longer answers, `Sleeping` or `NotReady`, as its capture reads it once every controller has reported
// it: no Pod of it ending, the probe of core failed after a success, and the worker Machine past its grace, with the
// objects that sum it up (SPEC-0028, P5).
function unreachableReading(namespace: string, version: string, state: "Sleeping" | "NotReady"): KubeObject[] {
  return kamajiReading(namespace, {
    version,
    kcp: {
      spec: state === "Sleeping" ? { replicas: 0 } : {},
      status: { replicas: 0, readyReplicas: 0, availableReplicas: 0, upToDateReplicas: 0, ready: false },
      conditions: [
        kamajiCondition(
          "KamajiControlPlaneIsReady",
          "False",
          "Failed",
          `TenantControlPlane in ${state} status, enqueue back`,
        ),
        kamajiCondition("Available", "False", "NotAvailable"),
      ],
    },
    tenant: {
      state,
      deployment: { terminatingReplicas: 0, conditions: [kamajiCondition("ReplicaFailure", "True", "FailedCreate")] },
    },
    cluster: {
      controlPlane: state === "Sleeping" ? { desiredReplicas: 0 } : {},
      conditions: [
        kamajiCondition("RemoteConnectionProbe", "False", "ProbeFailed", `${PROBE_TIME_WORDS[0]}2026-11-22T13:03:50Z`),
        kamajiCondition("WorkerMachinesReady", "Unknown"),
      ],
    },
    machine: {
      conditions: [
        kamajiCondition("Ready", "Unknown"),
        kamajiCondition("NodeReady", "Unknown", "ConnectionDown", NODE_DOWN),
        kamajiCondition("NodeHealthy", "Unknown", "ConnectionDown", NODE_DOWN),
      ],
    },
    summary: "Unknown",
  });
}

// Each Kamaji state as its capture reads it once the state holds (SPEC-0028, P1, P5).
const READ_STATES: Record<string, (namespace: string, version: string) => KubeObject[]> = {
  "kamaji-provisioning": (namespace, version) =>
    kamajiReading(namespace, {
      version,
      kcp: {
        status: {
          ready: false,
          version: "",
          replicas: undefined,
          readyReplicas: undefined,
          availableReplicas: undefined,
          upToDateReplicas: undefined,
        },
        conditions: [
          kamajiCondition("TenantControlPlaneCreated", "True", "Succeeded"),
          kamajiCondition(
            "TenantControlPlaneAddressReady",
            "False",
            "Pending",
            "Control Plane Endpoint is not yet available",
          ),
        ],
      },
      machine: false,
    }),
  "kamaji-healthy": (namespace, version) => kamajiReading(namespace, { version }),
  "kamaji-scaling": (namespace, version) =>
    kamajiReading(namespace, {
      version,
      kcp: {
        spec: { replicas: 3 },
        status: { ready: false },
        conditions: [
          kamajiCondition(
            "KamajiControlPlaneIsReady",
            "False",
            "Failed",
            "TenantControlPlane in Unknown status, enqueue back",
          ),
          kamajiCondition("Available", "False", "NotAvailable"),
        ],
      },
      tenant: {
        state: "Unknown",
        deployment: { conditions: [kamajiCondition("ReplicaFailure", "True", "FailedCreate")] },
      },
      cluster: {
        controlPlane: { desiredReplicas: 3 },
        conditions: [kamajiCondition("Available", "False", "NotAvailable")],
      },
    }),
  "kamaji-upgrading": (namespace, version) =>
    kamajiReading(namespace, {
      version,
      kcp: { spec: { version: "v1.37.0" }, status: { upToDateReplicas: 0 } },
      tenant: {
        state: "Upgrading",
        deployment: { conditions: [kamajiCondition("ReplicaFailure", "True", "FailedCreate")] },
      },
    }),
  "kamaji-version-refused": (namespace, version) =>
    kamajiReading(namespace, {
      version,
      kcp: {
        spec: { version: "v1.38.0" },
        conditions: [
          kamajiCondition("TenantControlPlaneCreated", "False", "Pending"),
          kamajiCondition("TenantControlPlaneAddressReady", "True", "Succeeded"),
          kamajiCondition("KamajiControlPlaneIsReady", "True", "Succeeded"),
          kamajiCondition("Available", "True", "Available"),
        ],
      },
    }),
  "kamaji-sleeping": (namespace, version) => unreachableReading(namespace, version, "Sleeping"),
  "kamaji-not-ready": (namespace, version) => unreachableReading(namespace, version, "NotReady"),
  "kamaji-paused": (namespace, version) =>
    kamajiReading(namespace, {
      version,
      cluster: {
        conditions: [kamajiCondition("Available", "True", "Available"), kamajiCondition("Paused", "True", "Paused")],
      },
    }).map((object) =>
      ["MachineDeployment", "MachineSet", "Machine", "DevCluster"].includes(object.kind)
        ? { ...object, status: { ...object.status, conditions: [kamajiCondition("Paused", "True", "Paused")] } }
        : object,
    ),
  "kamaji-deleting": (namespace, version) =>
    kamajiReading(namespace, {
      version,
      kcp: { deleting: true },
      cluster: {
        deleting: true,
        conditions: [kamajiCondition("Deleting", "True", "WaitingForControlPlaneDeletion")],
      },
      machine: false,
    }),
};

// A change of the objects of a reading, made in place.
type ReadingEdit = (objects: KubeObject[], namespace: string) => void;

// Sets a field of every object of a kind, by its path in the object, or removes it with `undefined`.
function setField(kind: string, path: string, value: unknown): ReadingEdit {
  return (objects) => {
    const keys = path.split(".");

    for (const object of objects.filter((item) => item.kind === kind)) {
      let at: Record<string, unknown> = object;

      for (const key of keys.slice(0, -1)) {
        at[key] ??= {};
        at = at[key] as Record<string, unknown>;
      }
      if (value === undefined) delete at[keys[keys.length - 1]];
      else at[keys[keys.length - 1]] = value;
    }
  };
}

// Gives every object of a kind a condition in place of the one of its type, or takes that one away with no status.
function setCondition(kind: string, type: string, status?: string, reason?: string, message?: string): ReadingEdit {
  return (objects) => {
    for (const object of objects.filter((item) => item.kind === kind)) {
      const conditions = ((object.status?.conditions ?? []) as { type: string }[]).filter((item) => item.type !== type);

      object.status = {
        ...object.status,
        conditions: status ? [...conditions, kamajiCondition(type, status, reason, message)] : conditions,
      };
    }
  };
}

function removeKind(kind: string): ReadingEdit {
  return (objects) => {
    objects.splice(0, objects.length, ...objects.filter((object) => object.kind !== kind));
  };
}

function edits(...all: ReadingEdit[]): ReadingEdit {
  return (objects, namespace) => {
    for (const edit of all) edit(objects, namespace);
  };
}

const TENANT_STATE = "status.kubernetesResources.version.status";
const TENANT_DEPLOYMENT = "status.kubernetesResources.deployment";

// The waits of the two states whose tenant no longer answers (SPEC-0028, P5; "Notes and deviations"), each as an edit of
// the readings of the state that makes them miss that wait alone.
const UNREACHABLE_WAITS: [string, ReadingEdit][] = [
  ["no Pod of the tenant ending", setField("TenantControlPlane", `${TENANT_DEPLOYMENT}.terminatingReplicas`, 1)],
  ["the probe of core failed", setCondition("Cluster", "RemoteConnectionProbe", "True", "ProbeSucceeded")],
  [
    "the probe of core failed after a success, in its words",
    setCondition("Cluster", "RemoteConnectionProbe", "False", "ProbeFailed", "Remote connection not established yet"),
  ],
  ["NodeReady of the worker Machine past its grace", setCondition("Machine", "NodeReady", "True", "NodeReady")],
  ["NodeHealthy of the worker Machine past its grace", setCondition("Machine", "NodeHealthy", "True", "NodeHealthy")],
  [
    "the conditions of the Node Unknown",
    edits(
      setCondition("Machine", "NodeReady", "False", "ConnectionDown", NODE_DOWN),
      setCondition("Machine", "NodeHealthy", "False", "ConnectionDown", NODE_DOWN),
    ),
  ],
  [
    "the conditions of the Node at ConnectionDown",
    edits(
      setCondition("Machine", "NodeReady", "Unknown", "NodeConditionsFailed", NODE_DOWN),
      setCondition("Machine", "NodeHealthy", "Unknown", "NodeConditionsFailed", NODE_DOWN),
    ),
  ],
  [
    "the conditions of the Node with the time of the last probe",
    edits(
      setCondition("Machine", "NodeReady", "Unknown", "ConnectionDown", "Waiting for the Node to report"),
      setCondition("Machine", "NodeHealthy", "Unknown", "ConnectionDown", "Waiting for the Node to report"),
    ),
  ],
  ["Ready of the worker Machine no longer True", setCondition("Machine", "Ready", "True", "Ready")],
  ["MachinesReady of its MachineSet no longer True", setCondition("MachineSet", "MachinesReady", "True")],
  ["MachinesReady of its MachineDeployment no longer True", setCondition("MachineDeployment", "MachinesReady", "True")],
  ["WorkerMachinesReady of the Cluster no longer True", setCondition("Cluster", "WorkerMachinesReady", "True")],
  ["a worker Machine", removeKind("Machine")],
];

// Each wait of each Kamaji state (SPEC-0028, P5; "Notes and deviations"), as an edit of the readings of the state that
// makes them miss that wait alone.
const KAMAJI_WAITS: [string, string, ReadingEdit][] = [
  [
    "kamaji-provisioning",
    "TenantControlPlaneAddressReady False Pending on its KamajiControlPlane",
    setCondition("KamajiControlPlane", "TenantControlPlaneAddressReady"),
  ],
  [
    "kamaji-provisioning",
    "no Available on its KamajiControlPlane",
    setCondition("KamajiControlPlane", "Available", "False", "NotAvailable"),
  ],
  ["kamaji-provisioning", "its TenantControlPlane made", removeKind("TenantControlPlane")],
  [
    "kamaji-provisioning",
    "its DevCluster provisioned",
    setCondition("Cluster", "InfrastructureReady", "False", "NotProvisioned"),
  ],
  // The surge of a rollout still copied, as L11 saw it.
  [
    "kamaji-healthy",
    "the counters of the control plane copied into the Cluster",
    setField("Cluster", "status.controlPlane.replicas", 2),
  ],
  ["kamaji-healthy", "the Cluster Available True", setCondition("Cluster", "Available")],
  ["kamaji-healthy", "the Node of its worker", setField("Machine", "status.nodeRef", undefined)],
  ["kamaji-healthy", "every condition at its normal value", setCondition("DevCluster", "Ready", "False", "NotReady")],
  ["kamaji-scaling", "the scale to three replicas", setField("KamajiControlPlane", "spec.replicas", 1)],
  [
    "kamaji-scaling",
    "KamajiControlPlaneIsReady False Failed with the state Unknown",
    setCondition("KamajiControlPlane", "KamajiControlPlaneIsReady", "True", "Succeeded"),
  ],
  [
    "kamaji-scaling",
    "Available False NotAvailable on its KamajiControlPlane",
    setCondition("KamajiControlPlane", "Available", "True", "Available"),
  ],
  ["kamaji-scaling", "the tenant Unknown", setField("TenantControlPlane", TENANT_STATE, "Ready")],
  [
    "kamaji-scaling",
    "the Pod that the quota refused",
    setField("TenantControlPlane", `${TENANT_DEPLOYMENT}.conditions`, []),
  ],
  [
    "kamaji-scaling",
    "three replicas wanted by the Cluster",
    setField("Cluster", "status.controlPlane.desiredReplicas", 1),
  ],
  [
    "kamaji-scaling",
    "the counters copied into the Cluster",
    setField("Cluster", "status.controlPlane.readyReplicas", 0),
  ],
  ["kamaji-scaling", "the Cluster Available False", setCondition("Cluster", "Available", "True", "Available")],
  ["kamaji-upgrading", "the new version asked", setField("KamajiControlPlane", "spec.version", "v1.36.4")],
  ["kamaji-upgrading", "the old version reported", setField("KamajiControlPlane", "status.version", "")],
  [
    "kamaji-upgrading",
    "no replica up to date",
    edits(
      setField("KamajiControlPlane", "status.upToDateReplicas", 1),
      setField("Cluster", "status.controlPlane.upToDateReplicas", 1),
    ),
  ],
  [
    "kamaji-upgrading",
    "Available True on its KamajiControlPlane",
    setCondition("KamajiControlPlane", "Available", "False", "NotAvailable"),
  ],
  ["kamaji-upgrading", "the tenant Upgrading", setField("TenantControlPlane", TENANT_STATE, "Ready")],
  [
    "kamaji-upgrading",
    "the Pod that the quota refused",
    setField("TenantControlPlane", `${TENANT_DEPLOYMENT}.conditions`, []),
  ],
  [
    "kamaji-upgrading",
    "the counters copied into the Cluster",
    setField("Cluster", "status.controlPlane.upToDateReplicas", 1),
  ],
  ["kamaji-upgrading", "the Cluster Available True", setCondition("Cluster", "Available", "False", "NotAvailable")],
  [
    "kamaji-version-refused",
    "the version that Kamaji refuses asked",
    setField("KamajiControlPlane", "spec.version", "v1.36.4"),
  ],
  [
    "kamaji-version-refused",
    "TenantControlPlaneCreated False",
    setCondition("KamajiControlPlane", "TenantControlPlaneCreated", "True", "Succeeded"),
  ],
  [
    "kamaji-version-refused",
    "Available True on its KamajiControlPlane",
    setCondition("KamajiControlPlane", "Available", "False", "NotAvailable"),
  ],
  [
    "kamaji-version-refused",
    "the counters copied into the Cluster",
    setField("Cluster", "status.controlPlane.replicas", 2),
  ],
  ...(["Sleeping", "NotReady"] as const).flatMap((state): [string, string, ReadingEdit][] => {
    const name = state === "Sleeping" ? "kamaji-sleeping" : "kamaji-not-ready";

    return [
      [name, `the tenant ${state}`, setField("TenantControlPlane", TENANT_STATE, "Ready")],
      [
        name,
        "the counters of its KamajiControlPlane at 0",
        edits(
          setField("KamajiControlPlane", "status.readyReplicas", 1),
          setField("Cluster", "status.controlPlane.readyReplicas", 1),
        ),
      ],
      [
        name,
        `KamajiControlPlaneIsReady False with the state ${state}`,
        setCondition("KamajiControlPlane", "KamajiControlPlaneIsReady", "True", "Succeeded"),
      ],
      [
        name,
        "Available False on its KamajiControlPlane",
        setCondition("KamajiControlPlane", "Available", "True", "Available"),
      ],
      ...(state === "NotReady"
        ? [
            [
              name,
              "the Pod that the quota refused",
              setField("TenantControlPlane", `${TENANT_DEPLOYMENT}.conditions`, []),
            ] as [string, string, ReadingEdit],
          ]
        : []),
      [name, "the counters copied into the Cluster", setField("Cluster", "status.controlPlane.readyReplicas", 1)],
      ...UNREACHABLE_WAITS.map(([wait, edit]): [string, string, ReadingEdit] => [name, wait, edit]),
    ];
  }),
  [
    "kamaji-paused",
    "every object but its KamajiControlPlane Paused True",
    setCondition("MachineSet", "Paused", "False", "NotPaused"),
  ],
  ["kamaji-paused", "the Cluster Paused True", setCondition("Cluster", "Paused")],
  [
    "kamaji-deleting",
    "the Cluster waiting for the deletion of its control plane",
    setCondition("Cluster", "Deleting", "True", "WaitingForWorkersDeletion"),
  ],
  [
    "kamaji-deleting",
    "its KamajiControlPlane deleting",
    setField("KamajiControlPlane", "metadata.deletionTimestamp", undefined),
  ],
  [
    "kamaji-deleting",
    "its worker gone",
    (objects, namespace) => {
      objects.push(
        ...kamajiReading(namespace, { version: "2" }).filter((object) =>
          ["MachineDeployment", "MachineSet", "Machine"].includes(object.kind),
        ),
      );
    },
  ],
];

// Each Kamaji state that can no longer be reached once its readings show it, and why, as an edit of its readings
// (SPEC-0028, P5): those of kamaji-provisioning, kamaji-scaling and kamaji-paused have cases of their own above.
const KAMAJI_MISSED: [string, string, ReadingEdit][] = [
  [
    "kamaji-upgrading",
    "the upgrade is done: the quota did not hold it",
    setField("KamajiControlPlane", "status.version", "v1.37.0"),
  ],
  [
    "kamaji-version-refused",
    "the TenantControlPlane took the version: Kamaji did not refuse it",
    setField("TenantControlPlane", "spec.kubernetes.version", "v1.38.0"),
  ],
  ["kamaji-deleting", "the KamajiControlPlane is gone", removeKind("KamajiControlPlane")],
];

// The readings of the namespace of a Kamaji state: of the healthy Cluster first, for a state that starts from
// kamaji-healthy, then those given.
function readingsOf(state: KamajiState, ...readings: KubeObject[][]): KubeObject[][] {
  const fromHealthy = state.name !== "kamaji-provisioning" && state.name !== "kamaji-healthy";

  return [...(fromHealthy ? [READ_STATES["kamaji-healthy"](state.namespace, "1")] : []), ...readings];
}

describe("the waits of the captures of Kamaji", () => {
  it("cover every Kamaji state", () => {
    expect(Object.keys(READ_STATES)).toEqual(KAMAJI_STATES.map((state) => state.name));
    expect([...new Set(KAMAJI_WAITS.map(([name]) => name))]).toEqual(KAMAJI_STATES.map((state) => state.name));
  });

  it.each(KAMAJI_WAITS)(
    "read %s only after %s, a reading that misses it alone held for the readings of a capture (SPEC-0028, P5)",
    async (name, _wait, edit) => {
      const state = kamajiState(name);
      const before = READ_STATES[name](state.namespace, "2");
      const holds = READ_STATES[name](state.namespace, "3");

      edit(before, state.namespace);
      expect(before).not.toEqual(READ_STATES[name](state.namespace, "2"));

      const { project } = capturesProject({
        [ADDRESS_HELPER]: [kamajiReading(ADDRESS_HELPER, { version: "1", machine: false })],
        [state.namespace]: readingsOf(state, ...held(before), ...held(holds)),
      });
      const captured = await state.capture(project, state.namespace);

      expect(captured.objects).toEqual(holds);
    },
  );

  it.each(KAMAJI_MISSED)("stop the capture of %s when %s (SPEC-0028, P5)", async (name, why, edit) => {
    const state = kamajiState(name);
    const missed = READ_STATES[name](state.namespace, "2");

    edit(missed, state.namespace);

    const { project } = capturesProject({ [state.namespace]: readingsOf(state, missed) });

    await expect(state.capture(project, state.namespace)).rejects.toThrow(`can no longer be reached: ${why}`);
  });

  it("read the namespace again after clusterctl, and start the readings again when an object changed meanwhile (SPEC-0028, P6)", async () => {
    const state = kamajiState("kamaji-healthy");
    const first = READ_STATES["kamaji-healthy"](state.namespace, "1");
    const changed = READ_STATES["kamaji-healthy"](state.namespace, "2");
    const { project } = capturesProject({ [state.namespace]: [first, first, changed] });
    let runs = 0;

    project.describe = () => {
      runs += 1;
      return `the output of run ${runs} of clusterctl`;
    };

    const captured = await state.capture(project, state.namespace);

    expect(captured.objects).toEqual(changed);
    expect(captured.described).toBe("the output of run 2 of clusterctl");
  });

  it("try clusterctl and the reading after it again when either fails, as a reading that failed (SPEC-0028, P6)", async () => {
    const state = kamajiState("kamaji-healthy");
    const read = READ_STATES["kamaji-healthy"](state.namespace, "1");
    const described = capturesProject({ [state.namespace]: [read] });
    let runs = 0;

    described.project.describe = () => {
      runs += 1;
      if (runs === 1) throw new Error("clusterctl describe failed with 1");
      return `the output of run ${runs} of clusterctl`;
    };
    expect((await state.capture(described.project, state.namespace)).described).toBe(
      "the output of run 2 of clusterctl",
    );

    // The third reading failing once, after a run of clusterctl whose output it would have kept.
    const third = capturesProject({ [state.namespace]: [read] });
    const kubectl = third.project.kubectl;
    let reads = 0;

    third.project.kubectl = (args, options) => {
      if (args[0] === "get" && args[1] === fixtureResourcesOn("captures").join(",")) {
        reads += 1;
        if (reads === 3) throw new Error("kubectl get failed with 1");
      }
      return kubectl(args, options);
    };

    const captured = await state.capture(third.project, state.namespace);

    expect(captured.objects).toEqual(read);
    expect(reads).toBe(6);
    expect(third.requests.filter((request) => request[0] === "describe")).toHaveLength(2);
  });

  it("change a state that starts from kamaji-healthy only once kamaji-healthy holds, its counters copied (SPEC-0028, P5)", async () => {
    const state = kamajiState("kamaji-scaling");
    const notCopied = READ_STATES["kamaji-healthy"](state.namespace, "1");

    setField("Cluster", "status.controlPlane.replicas", 2)(notCopied, state.namespace);

    const { project, requests } = capturesProject({
      [state.namespace]: [
        notCopied,
        READ_STATES["kamaji-healthy"](state.namespace, "2"),
        ...held(READ_STATES["kamaji-scaling"](state.namespace, "3")),
      ],
    });

    await state.capture(project, state.namespace);

    const order = requests.map((request) => request.join(" "));

    expect(
      order
        .slice(
          0,
          order.findIndex((request) => request.startsWith("scale ")),
        )
        .filter((request) => request.startsWith("read ")),
    ).toEqual([`read ${state.namespace}`, `read ${state.namespace}`]);
  });

  it("make the Cluster of kamaji-provisioning only once the tenant of the helper holds the one address (SPEC-0028, P5)", async () => {
    const state = kamajiState("kamaji-provisioning");
    const waiting = kamajiReading(ADDRESS_HELPER, {
      version: "1",
      kcp: {
        conditions: [
          kamajiCondition("TenantControlPlaneCreated", "True", "Succeeded"),
          kamajiCondition("TenantControlPlaneAddressReady", "False", "Pending"),
        ],
      },
      machine: false,
    });
    const { project, requests } = capturesProject({
      [ADDRESS_HELPER]: [waiting, kamajiReading(ADDRESS_HELPER, { version: "2", machine: false })],
      [state.namespace]: held(READ_STATES["kamaji-provisioning"](state.namespace, "1")),
    });

    await state.capture(project, state.namespace);
    expect(requests.slice(0, 5).map((request) => request.join(" "))).toEqual([
      `create namespace ${ADDRESS_HELPER}`,
      "apply",
      `read ${ADDRESS_HELPER}`,
      `read ${ADDRESS_HELPER}`,
      `create namespace ${state.namespace}`,
    ]);
  });

  it("reach kamaji-healthy with one worker and kindnet, and kamaji-version-refused by the minor after the version of the tenants (SPEC-0028, P1, P3, P5)", async () => {
    const healthy = kamajiState("kamaji-healthy");
    const read = READ_STATES["kamaji-healthy"](healthy.namespace, "1");
    const first = capturesProject({ [healthy.namespace]: held(read) });
    const captured = await healthy.capture(first.project, healthy.namespace);
    const applied = first.applied as KubeObject[];

    expect(captured.objects).toEqual(read);
    expect(captured.described).toContain(`Cluster ${healthy.namespace}/${healthy.namespace}`);
    expect(applied.find((object) => object.kind === "ClusterResourceSet")?.metadata.namespace).toBe(healthy.namespace);
    expect(applied.find((object) => object.kind === "MachineDeployment")?.spec).toMatchObject({
      replicas: 1,
      template: { spec: { version: "v1.36.4" } },
    });
    expect(applied.find((object) => object.kind === "DevCluster")?.spec).toMatchObject({
      controlPlaneEndpoint: { host: "172.18.255.200", port: 6443 },
    });

    const refused = kamajiState("kamaji-version-refused");
    const second = capturesProject({
      [refused.namespace]: readingsOf(refused, ...held(READ_STATES["kamaji-version-refused"](refused.namespace, "2"))),
    });

    await refused.capture(second.project, refused.namespace);
    expect(second.requests.map((request) => request.join(" "))).toContain(
      `patch kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io ${refused.namespace} --namespace ${refused.namespace} --type merge --patch {"spec":{"version":"v1.38.0"}}`,
    );
  });
});

// The problems of the workflow of the captures, read as a file: what starts it but a dispatch, and what its artifact
// holds but the folders of the Kamaji sets (SPEC-0028, P7).
function captureWorkflowProblems(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  const triggers: string[] = [];

  for (const line of start >= 0 ? lines.slice(start + 1) : []) {
    if (/^\S/.test(line)) break;

    const trigger = /^ {2}([A-Za-z_]+):/.exec(line);

    if (trigger) triggers.push(trigger[1]);
  }

  const problems = [
    ...(start < 0 ? ["it has no top-level on"] : []),
    ...triggers.filter((trigger) => trigger !== "workflow_dispatch").map((trigger) => `it starts on ${trigger}`),
    ...(triggers.includes("workflow_dispatch") ? [] : ["it does not start on workflow_dispatch"]),
  ];
  const expected = KAMAJI_STATES.map((state) => `integration/fixtures/${state.name}/`);
  const uploads = lines.flatMap((line, index) => (/^\s+uses: actions\/upload-artifact@/.test(line) ? [index] : []));

  if (uploads.length !== 1) problems.push(`it has ${uploads.length} steps that upload an artifact`);
  for (const index of uploads) {
    const step = lines.slice(index + 1, lines.findIndex((line, at) => at > index && /^\s+- name:/.test(line)) >>> 0);
    const path = step.findIndex((line) => /^\s+path:/.test(line));
    const paths = step
      .slice(path + 1)
      .filter((line) => /^\s{12}\S/.test(line))
      .map((line) => line.trim());

    if (path < 0 || !/^\s+path: \|$/.test(step[path] ?? "")) problems.push("its artifact names no list of paths");
    else if (paths.join(" ") !== expected.join(" ")) problems.push(`its artifact holds ${paths.join(" ")}`);
  }
  return problems;
}

describe("the workflow of the captures of Kamaji", () => {
  const workflow = readFileSync(join(root, ".github/workflows/kamaji-capture.yaml"), "utf8");

  it("runs when it is dispatched alone, and uploads the folders of the Kamaji sets alone (SPEC-0028, P7)", () => {
    expect(captureWorkflowProblems(workflow)).toEqual([]);
    expect(workflow).toContain("pnpm e2e:cluster:up:kamaji");
    expect(workflow).toContain("pnpm e2e:fixtures:capture:kamaji all");
    expect(workflow).toMatch(/run: pnpm e2e:cluster:down\n/);
    expect(workflow).toMatch(/timeout-minutes: 60\n/);
  });

  it.each([
    [
      "a pull request",
      (text: string) =>
        text.replace(
          "  workflow_dispatch: {}",
          "  workflow_dispatch: {}\n  pull_request:\n    branches:\n      - main",
        ),
      /it starts on pull_request/,
    ],
    [
      "a schedule",
      (text: string) => text.replace("  workflow_dispatch: {}", "  schedule:\n    - cron: 17 3 * * *"),
      /it starts on schedule[^]*it does not start on workflow_dispatch/,
    ],
    [
      "the state folder of the scripts in its artifact",
      (text: string) =>
        text.replace(
          "            integration/fixtures/kamaji-deleting/",
          "            integration/fixtures/kamaji-deleting/\n            ${{ runner.temp }}/test-environment/",
        ),
      /its artifact holds .*\/test-environment\//,
    ],
    [
      "a set missing from its artifact",
      (text: string) => text.replace("            integration/fixtures/kamaji-paused/\n", ""),
      /its artifact holds/,
    ],
    [
      "a second artifact",
      (text: string) =>
        `${text}\n      - name: Upload the logs\n        uses: actions/upload-artifact@v7\n        with:\n          path: logs/\n`,
      /it has 2 steps that upload an artifact/,
    ],
  ])("is refused with %s", (_case, change, error) => {
    const changed = change(workflow);

    expect(changed).not.toBe(workflow);
    expect(captureWorkflowProblems(changed).join("; ")).toMatch(error);
  });
});
