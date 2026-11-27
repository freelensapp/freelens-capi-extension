// The checks of the scripts of the test environment that need no cluster: the pins, the API server of a
// kubeconfig of the scripts and its node, the local Docker, the digest of a download, the files of an archive,
// the private state and its lock, the environment of a command, the containers that `down` deletes and what it
// decides, the providers of the real project against the pins, the command line, what the scripts make of the
// files of a release and of a chart, and the fixtures: the shift of their times, the cleaning of a captured
// object, their apply, their YAML, their states and the sets of the repository.

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
  COMMAND_NAMES,
  DOWN_WORKLOADS,
  onceItSucceeds,
  ownNamespaceProblem,
  parseCommand,
  providersAgainstPins,
  removeObjects,
  takeDown,
} from "../e2e/scripts/commands.mts";
import { everyPinnedFile, pinnedContent, sveltosChart, sveltosExtensionPackage } from "../e2e/scripts/downloads.mts";
import {
  applyPlan,
  CAPTURE_TIME,
  cleanObject,
  creationLevels,
  FIXTURE_FINALIZER,
  FIXTURES_FOLDER,
  fixtureFiles,
  HOST_BOOT_ID,
  HOST_CAPACITY,
  HOST_KERNEL,
  isTime,
  readFixtureSet,
  roundTripDifferences,
  secondsBetween,
  shiftTime,
  shiftTimes,
  timesInsideText,
} from "../e2e/scripts/fixtures.mts";
import { childEnvironment, clusterctlAsset, INOTIFY_LIMITS, inotifySettings } from "../e2e/scripts/host.mts";
import {
  chartDefinitions,
  customResourceDefinitions,
  definitionName,
  KINDNET_LABEL,
  kindnetLabelArgument,
  kindnetManifest,
  kindnetResources,
  objectsWithoutStatus,
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
} from "../e2e/scripts/states.mts";
import { parseDocuments, plainAllowed, stringifyDocuments } from "../e2e/scripts/yaml.mts";

import type {
  DefinitionsSession,
  DownOperations,
  InventoryProvider,
  Tier,
  Workload,
} from "../e2e/scripts/commands.mts";
import type { Fetch, PinnedFile } from "../e2e/scripts/downloads.mts";
import type { KubeObject } from "../e2e/scripts/fixtures.mts";

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
      ].sort(),
    );
    for (const file of files) {
      expect(file.url).toMatch(
        /^https:\/\/(github\.com\/(kubernetes-sigs\/cluster-api|kubernetes-sigs\/cluster-api-operator|cert-manager\/cert-manager|projectsveltos\/helm-charts)\/releases\/download\/|raw\.githubusercontent\.com\/kubernetes-sigs\/cluster-api\/[0-9a-f]{40}\/|registry\.npmjs\.org\/@freelensapp\/sveltos-extension\/-\/)/,
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
    failing?: "list" | "delete" | "remove";
  }

  // The system that `down` acts on, which records what it is asked to do.
  function system(setup: System): { operations: DownOperations; done: string[] } {
    const done: string[] = [];
    const operations: DownOperations = {
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
    const argv = name === "capture" || name === "fixtures-up" ? [name, "paused"] : [name];

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
  it("go to a namespace of the scripts that is no namespace of a state of the fixtures, whose objects they would replace", () => {
    expect(ownNamespaceProblem("freelens-capi-tree-large")).toBeUndefined();
    for (const state of FIXTURE_STATES) {
      expect(ownNamespaceProblem(state.namespace)).toBe(
        `${state.namespace} is the namespace of the fixtures of ${state.name}`,
      );
    }
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
    expect(() => applyObjects(session, "freelens-capi-tree-large", [elsewhere])).toThrow(
      /is not in the namespace of the namespace freelens-capi-tree-large/,
    );
    expect(requests).toEqual([]);
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
