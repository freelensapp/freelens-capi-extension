// The checks of the scripts of the test environment that need no cluster: the pins, the API server of a
// kubeconfig of the scripts and its node, the local Docker, the digest of a download, the private state and
// its lock, the environment of a command, the containers that `down` deletes and what it decides, the
// command line, and what the scripts make of the files of a release.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDigest,
  assertKindNode,
  assertLocalDocker,
  isLoopbackHost,
  localApiServer,
  sha256,
  workloadContainerIds,
} from "../e2e/scripts/checks.mts";
import { COMMAND_NAMES, parseCommand, takeDown } from "../e2e/scripts/commands.mts";
import { everyPinnedFile, pinnedContent } from "../e2e/scripts/downloads.mts";
import { childEnvironment, clusterctlAsset, INOTIFY_LIMITS, inotifySettings } from "../e2e/scripts/host.mts";
import {
  customResourceDefinitions,
  KINDNET_LABEL,
  kindnetLabelArgument,
  kindnetManifest,
  kindnetResources,
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

import type { DownOperations, Tier, Workload } from "../e2e/scripts/commands.mts";
import type { Fetch, PinnedFile } from "../e2e/scripts/downloads.mts";

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
      ].sort(),
    );
    for (const file of files) {
      expect(file.url).toMatch(
        /^https:\/\/(github\.com\/(kubernetes-sigs\/cluster-api|kubernetes-sigs\/cluster-api-operator|cert-manager\/cert-manager)\/releases\/download\/|raw\.githubusercontent\.com\/kubernetes-sigs\/cluster-api\/[0-9a-f]{40}\/)/,
      );
    }
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
  it.each(COMMAND_NAMES.map((name) => [name]))("accepts %s", (name) => {
    expect(parseCommand([name])).toBe(name);
  });

  it.each([[[]], [["constructor"]], [["toString"]], [["__proto__"]], [["upgrade"]], [["up", "--force"]]])(
    "refuses %j",
    (argv) => {
      expect(() => parseCommand(argv)).toThrow(/^Usage: node e2e\/scripts\/environment\.mts/);
    },
  );
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
