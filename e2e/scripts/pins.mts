/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The pins of the test environment. `e2e/environment/pins.json` holds the version and the SHA-256 of every
// file that the scripts download, and the versions of Kubernetes of the clusters, each within the versions
// that the release of Cluster API supports for it; kind is pinned once, in the env of the integration
// workflow of the template, and read from there. A pin that is missing, unknown, malformed or outside its
// range stops the scripts before they download or create anything.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensure } from "./checks.mts";

export const PINS_FILE = "e2e/environment/pins.json";
export const WORKFLOW_FILE = ".github/workflows/integration-tests.yaml";

// The assets of the release of Cluster API that the scripts use: the components of the core, of the kubeadm
// bootstrap and control plane providers and of the development infrastructure provider, the templates of
// the workload clusters, the metadata that clusterctl reads in a local repository, and clusterctl for each
// system the scripts run on.
export const CLUSTER_API_ASSETS = [
  "core-components.yaml",
  "bootstrap-components.yaml",
  "control-plane-components.yaml",
  "infrastructure-components-development.yaml",
  "cluster-template-development.yaml",
  "cluster-template-development-mp.yaml",
  "clusterclass-quick-start.yaml",
  "metadata.yaml",
  "clusterctl-darwin-amd64",
  "clusterctl-darwin-arm64",
  "clusterctl-linux-amd64",
  "clusterctl-linux-arm64",
] as const;

// The files of the source of Cluster API, at the commit of its tag, that no asset of the release carries:
// the definition of the inventory of clusterctl, and the network add-on of the tests of the project.
export const CLUSTER_API_SOURCES = [
  "cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml",
  "test/e2e/data/cni/kindnet/kindnet.yaml",
] as const;

export const OPERATOR_ASSETS = ["operator-components.yaml"] as const;
export const CERT_MANAGER_ASSETS = ["cert-manager.yaml"] as const;

export type ClusterApiAsset = (typeof CLUSTER_API_ASSETS)[number];
export type ClusterApiSource = (typeof CLUSTER_API_SOURCES)[number];

export interface Release<Asset extends string> {
  version: string;
  // The SHA-256 of each asset, by its name in the release.
  assets: Record<Asset, string>;
}

export interface Pins {
  clusterApi: Release<ClusterApiAsset> & {
    commit: string;
    // The version of Kubernetes of the workload clusters: one that the release supports for workload
    // clusters, in the table of versions of its book. It changes with Cluster API, not with the template.
    workloadKubernetesVersion: string;
    // The SHA-256 of each file of the source, by its path at the commit.
    sources: Record<ClusterApiSource, string>;
  };
  // The version of Kubernetes of the kind clusters, the tag of `kindest/node`, and the minor versions that
  // the release of Cluster API supports for a management cluster, in the table of versions of its book. The
  // integration workflow of the template moves on its own; this one stays within that range.
  managementKubernetes: {
    version: string;
    supported: { from: string; to: string };
  };
  clusterApiOperator: Release<(typeof OPERATOR_ASSETS)[number]>;
  certManager: Release<(typeof CERT_MANAGER_ASSETS)[number]>;
}

export interface WorkflowPins {
  // The version of kind, without a leading v, as the workflow writes it.
  kind: string;
}

// A release, not a prerelease: the environment runs what the project published as stable.
const RELEASE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const WORKFLOW_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const KUBERNETES = /^v1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const KUBERNETES_MINOR = /^v1\.(0|[1-9]\d*)$/;

// The minor version of a version of Kubernetes, `v1.37.0` or `v1.37`.
export function kubernetesMinor(version: string): number {
  return Number(version.split(".")[1]);
}

type Fields = Record<string, unknown>;

function fields(value: unknown, where: string): Fields {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value), `${where} is not an object`);
  return value as Fields;
}

// The keys of an object are exactly the expected ones: a missing pin stops the scripts, and so does one they
// do not know, which is a typo or a file they do not download.
function exactKeys(object: Fields, expected: readonly string[], where: string): void {
  const missing = expected.filter((key) => !(key in object));
  const unknown = Object.keys(object).filter((key) => !expected.includes(key));

  ensure(!missing.length, `${where} misses ${missing.join(", ")}`);
  ensure(!unknown.length, `${where} has ${unknown.join(", ")}, which the scripts do not know`);
}

function matching(value: unknown, pattern: RegExp, where: string, what: string): string {
  ensure(typeof value === "string" && pattern.test(value), `${where} is not ${what}`);
  return value;
}

function digests<Name extends string>(value: unknown, names: readonly Name[], where: string): Record<Name, string> {
  const object = fields(value, where);

  exactKeys(object, names, where);
  for (const name of names) {
    matching(object[name], SHA256, `${where}.${name}`, "a SHA-256 digest, 64 lowercase hexadecimal characters");
  }
  return object as Record<Name, string>;
}

// An object that Renovate follows: its datasource and its package are the ones the scripts download from,
// so that Renovate looks up the same project, and they come right before the version, in this order, as the
// regular expression of the custom manager in .renovaterc.json reads them.
function followed(object: Fields, where: string, datasource: string, depName: string): void {
  const keys = Object.keys(object);
  const first = keys.indexOf("datasource");

  ensure(
    keys.slice(first, first + 3).join(" ") === "datasource depName version",
    `${where}: datasource, depName and version do not follow each other in this order, which Renovate needs`,
  );
  ensure(object.datasource === datasource, `${where}.datasource is not ${datasource}`);
  ensure(object.depName === depName, `${where}.depName is not ${depName}`);
}

function release<Asset extends string>(
  value: unknown,
  where: string,
  assets: readonly Asset[],
  renovate?: { depName: string },
  extra: readonly string[] = [],
): { object: Fields; release: Release<Asset> } {
  const object = fields(value, where);

  exactKeys(object, [...(renovate ? ["datasource", "depName"] : []), "version", ...extra, "assets"], where);
  if (renovate) followed(object, where, "github-releases", renovate.depName);
  return {
    object,
    release: {
      version: matching(object.version, RELEASE, `${where}.version`, "a release version, such as v1.2.3"),
      assets: digests(object.assets, assets, `${where}.assets`),
    },
  };
}

// The version of Kubernetes of the kind clusters, the tag of `kindest/node` that Renovate follows, inside the
// minor versions, from and to, that the pins declare Cluster API supports for a management cluster.
function managementKubernetes(value: unknown): Pins["managementKubernetes"] {
  const where = "managementKubernetes";
  const object = fields(value, where);

  exactKeys(object, ["datasource", "depName", "version", "supported"], where);
  followed(object, where, "docker", "kindest/node");

  const version = matching(object.version, KUBERNETES, `${where}.version`, "a version of Kubernetes, such as v1.2.3");
  const supported = fields(object.supported, `${where}.supported`);

  exactKeys(supported, ["from", "to"], `${where}.supported`);

  const from = matching(supported.from, KUBERNETES_MINOR, `${where}.supported.from`, "a minor version, such as v1.2");
  const to = matching(supported.to, KUBERNETES_MINOR, `${where}.supported.to`, "a minor version, such as v1.2");

  ensure(
    kubernetesMinor(from) <= kubernetesMinor(version) && kubernetesMinor(version) <= kubernetesMinor(to),
    `${where}.version ${version} is outside ${from} to ${to}, the versions of Kubernetes that the pins declare Cluster API supports for a management cluster`,
  );
  return { version, supported: { from, to } };
}

// The pins, from the text of e2e/environment/pins.json.
export function parsePins(text: string): Pins {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${PINS_FILE} is not JSON: ${error instanceof Error ? error.message : error}`);
  }

  const root = fields(value, PINS_FILE);

  exactKeys(
    root,
    ["description", "clusterApi", "managementKubernetes", "clusterApiOperator", "certManager"],
    PINS_FILE,
  );
  ensure(
    Array.isArray(root.description) && root.description.every((line) => typeof line === "string"),
    `${PINS_FILE}: description is not a list of lines`,
  );

  const clusterApi = release(
    root.clusterApi,
    "clusterApi",
    CLUSTER_API_ASSETS,
    { depName: "kubernetes-sigs/cluster-api" },
    ["commit", "workloadKubernetesVersion", "sources"],
  );

  return {
    clusterApi: {
      ...clusterApi.release,
      commit: matching(
        clusterApi.object.commit,
        COMMIT,
        "clusterApi.commit",
        "a commit, 40 lowercase hexadecimal characters",
      ),
      workloadKubernetesVersion: matching(
        clusterApi.object.workloadKubernetesVersion,
        RELEASE,
        "clusterApi.workloadKubernetesVersion",
        "a release version, such as v1.2.3",
      ),
      sources: digests(clusterApi.object.sources, CLUSTER_API_SOURCES, "clusterApi.sources"),
    },
    managementKubernetes: managementKubernetes(root.managementKubernetes),
    clusterApiOperator: release(root.clusterApiOperator, "clusterApiOperator", OPERATOR_ASSETS, {
      depName: "kubernetes-sigs/cluster-api-operator",
    }).release,
    certManager: release(root.certManager, "certManager", CERT_MANAGER_ASSETS).release,
  };
}

// The version of kind, from the top-level env of the integration workflow, where `kind_version` carries the
// hint that Renovate follows. The `kubernetes_version` there is the one of the integration tests of the
// template: the kind clusters of the scripts take theirs from the pins.
export function parseWorkflowPins(text: string): WorkflowPins {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^env:\s*$/.test(line));
  const values = new Map<string, string>();

  ensure(start >= 0, `${WORKFLOW_FILE} has no top-level env`);
  for (const line of lines.slice(start + 1)) {
    // The next top-level key ends the env.
    if (/^\S/.test(line)) break;

    const entry = /^ {2}([A-Za-z_][A-Za-z0-9_]*):(.*)$/.exec(line);

    if (!entry) continue;
    ensure(!values.has(entry[1]), `${WORKFLOW_FILE} sets ${entry[1]} twice in its env`);
    values.set(entry[1], entry[2].replace(/\s+#.*$/, "").trim());
  }

  return {
    kind: matching(values.get("kind_version"), WORKFLOW_VERSION, `kind_version of ${WORKFLOW_FILE}`, "a version"),
  };
}

// The pins of the repository at `root`.
export function readPins(root: string): { pins: Pins; workflow: WorkflowPins } {
  return {
    pins: parsePins(readFileSync(join(root, PINS_FILE), "utf8")),
    workflow: parseWorkflowPins(readFileSync(join(root, WORKFLOW_FILE), "utf8")),
  };
}
