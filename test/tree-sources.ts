// The reads of the tree of a Cluster for the unit tests of the tree (SPEC-0005, "Tests", "Unit"): the objects of a set
// as the stores of the tree hold them, each kind under the key of its store, with the state of the reads that the case
// gives, and the kinds of a provider that the references of the set name, resolved as the definitions of the release
// resolve them (test/infrastructure/docker/config/crd/kustomization.yaml:1-6;
// controlplane/kubeadm/config/crd/kustomization.yaml:1-6); and the outline of a tree, as `tree-expectations.ts` writes
// one.

import { NO_READS, reduceReads } from "../src/common/views/read-state";
import { followedObjectsOf, followedReferencesOf, isClusterApiKind } from "../src/common/views/references";
import { ROLE_WORDS } from "../src/common/views/words";
import { CAPTURE } from "./fixture-sets";

import type { OutlineRow } from "../integration/__tests__/tree-expectations";
import type { ClusterObject, KubeObjectData } from "../src/common/status/index";
import type { ClusterTree, TreeNode } from "../src/common/views/cluster-tree";
import type { ContextObjects, KindObjects, ProviderKindObjects } from "../src/common/views/context";
import type { ReadEvent, ReadFailure, ReadsState } from "../src/common/views/read-state";
import type { ResolvedReference } from "../src/common/views/references";

// The kinds that the tree reads through its models, by `group/kind`, with the plural of their API.
const MODELS: Readonly<Record<string, string>> = {
  "cluster.x-k8s.io/Cluster": "clusters",
  "cluster.x-k8s.io/Machine": "machines",
  "cluster.x-k8s.io/MachineSet": "machinesets",
  "cluster.x-k8s.io/MachineDeployment": "machinedeployments",
  "cluster.x-k8s.io/MachinePool": "machinepools",
  "cluster.x-k8s.io/MachineHealthCheck": "machinehealthchecks",
  "cluster.x-k8s.io/ClusterClass": "clusterclasses",
  "controlplane.cluster.x-k8s.io/KubeadmControlPlane": "kubeadmcontrolplanes",
  "bootstrap.cluster.x-k8s.io/KubeadmConfig": "kubeadmconfigs",
  "bootstrap.cluster.x-k8s.io/KubeadmConfigTemplate": "kubeadmconfigtemplates",
  "addons.cluster.x-k8s.io/ClusterResourceSet": "clusterresourcesets",
  "addons.cluster.x-k8s.io/ClusterResourceSetBinding": "clusterresourcesetbindings",
  "ipam.cluster.x-k8s.io/IPAddressClaim": "ipaddressclaims",
  "ipam.cluster.x-k8s.io/IPAddress": "ipaddresses",
};

function groupOf(object: KubeObjectData): string {
  const slash = object.apiVersion.indexOf("/");

  return slash === -1 ? "" : object.apiVersion.slice(0, slash);
}

export function kindOf(object: KubeObjectData): string {
  return `${groupOf(object)}/${object.kind}`;
}

// The key of the store of a kind, the base of its API at v1beta2.
export function treeKeyOf(kind: string): string {
  const slash = kind.lastIndexOf("/");
  const group = kind.slice(0, slash);
  const plural = MODELS[kind] ?? `${kind.slice(slash + 1).toLowerCase()}s`;

  return `/apis/${group}/v1beta2/${plural}`;
}

// A kind of a provider resolved as its definition in the release, its contract `v1beta2`.
export function resolved(kind: string, provider = "infrastructure-docker"): ResolvedReference {
  const slash = kind.lastIndexOf("/");
  const group = kind.slice(0, slash);
  const name = kind.slice(slash + 1);

  return {
    state: "resolved",
    reference: { apiGroup: group, kind: name, name: "" },
    apiVersion: `${group}/v1beta2`,
    plural: MODELS[kind] ?? `${name.toLowerCase()}s`,
    contract: "v1beta2",
    provider,
  };
}

export interface TreeSourceOptions {
  // The namespaces that the reads hold: those of the objects by default, and the namespace of the class.
  readonly namespaces?: readonly string[];
  // The kinds, by `group/kind`, whose first load has not ended, or whose load failed with these failures, one for each
  // namespace of the load.
  readonly pending?: readonly string[];
  readonly failures?: Readonly<Record<string, readonly ReadFailure[]>>;
  // The resolution of the references to a kind of a provider, resolved by default.
  readonly resolutions?: Readonly<Record<string, ResolvedReference>>;
  // The kinds that the cluster does not serve, which have no store.
  readonly notServed?: readonly string[];
  // The namespace in which the reads of the tree read the ClusterClasses, that of the Cluster by default.
  readonly classNamespace?: string;
  // The Cluster of the tree, whose references the reads follow, as the read of one Cluster does: by default the one
  // Cluster of the set.
  readonly cluster?: { readonly namespace: string; readonly name: string };
}

// The Cluster of the tree: the one that the options name, else the one Cluster of the set.
function clusterOf(objects: readonly KubeObjectData[], options: TreeSourceOptions): KubeObjectData | undefined {
  const clusters = objects.filter((object) => kindOf(object) === "cluster.x-k8s.io/Cluster");
  const named = options.cluster;

  if (named !== undefined) {
    return clusters.find((each) => each.metadata.namespace === named.namespace && each.metadata.name === named.name);
  }
  if (clusters.length > 1) throw new Error("The set holds more than one Cluster: name the Cluster of the tree");
  return clusters[0];
}

// The kinds of a provider that the references of the Cluster of the tree name, and those that the reads of its tree
// follow beside them, through the functions of the read: the objects that `followedObjectsOf` gives, each by what
// `followedReferencesOf` says that it names, the control plane of a provider at the contract that its resolution
// gives. An object of a kind that the reads do not give, still loading or refused, names nothing, as in the reads of
// the tree.
function providerKinds(
  given: readonly KubeObjectData[],
  options: TreeSourceOptions,
): { readonly cluster: Set<string>; readonly tree: Set<string> } {
  const objects = given.filter(
    (object) =>
      !(options.pending ?? []).includes(kindOf(object)) && (options.failures?.[kindOf(object)] ?? []).length === 0,
  );
  const cluster = new Set<string>();
  const tree = new Set<string>();
  const add = (into: Set<string>, entries: readonly { reference: { apiGroup: string; kind: string } }[]) => {
    for (const { reference } of entries) {
      if (!isClusterApiKind(reference.apiGroup, reference.kind)) into.add(`${reference.apiGroup}/${reference.kind}`);
    }
  };
  const own = clusterOf(objects, options);

  if (own === undefined) return { cluster, tree };

  const references = followedReferencesOf(own);
  const controlPlane = references.find((entry) => entry.role === "control-plane")?.reference;
  const id = controlPlane === undefined ? undefined : `${controlPlane.apiGroup}/${controlPlane.kind}`;
  const resolution = id === undefined ? undefined : (options.resolutions?.[id] ?? resolved(id));
  const ofKind = (kind: string) => objects.filter((object) => kindOf(object) === kind);

  add(cluster, references);
  add(
    tree,
    followedObjectsOf(own, {
      machines: ofKind("cluster.x-k8s.io/Machine"),
      machineDeployments: ofKind("cluster.x-k8s.io/MachineDeployment"),
      machineSets: ofKind("cluster.x-k8s.io/MachineSet"),
      machinePools: ofKind("cluster.x-k8s.io/MachinePool"),
      kubeadmControlPlanes: ofKind("controlplane.cluster.x-k8s.io/KubeadmControlPlane"),
      ...(id === undefined || controlPlane === undefined || isClusterApiKind(controlPlane.apiGroup, controlPlane.kind)
        ? {}
        : resolution?.state === "resolved"
          ? { controlPlanes: { objects: ofKind(id), contract: resolution.contract } }
          : {}),
    }).flatMap(({ object, controlPlane: contract }) => followedReferencesOf(object, contract)),
  );
  return { cluster, tree };
}

export interface TreeSource {
  readonly clusters: KindObjects<ClusterObject>;
  readonly objects: ContextObjects;
}

// The reads of the tree over a set of objects.
export function treeSourceOf(objects: readonly KubeObjectData[], options: TreeSourceOptions = {}): TreeSource {
  const namespaces =
    options.namespaces ??
    [
      ...new Set([
        ...objects.map((object) => object.metadata.namespace ?? ""),
        ...(options.classNamespace ? [options.classNamespace] : []),
      ]),
    ].sort();
  const providers = providerKinds(objects, options);
  const kinds = [...new Set([...Object.keys(MODELS), ...providers.cluster, ...providers.tree])].filter(
    (kind) => !(options.notServed ?? []).includes(kind),
  );
  const events: ReadEvent[] = [{ type: "filter-changed", namespaces: [...namespaces], selectedAll: false }];
  let id = 0;

  for (const kind of kinds) {
    const key = treeKeyOf(kind);

    id++;
    events.push({ type: "load-started", kind: key, id, namespaces: [...namespaces] });
    if (options.pending?.includes(kind)) continue;
    for (const failure of options.failures?.[kind] ?? []) events.push({ type: "load-failed", kind: key, id, failure });
    events.push({ type: "load-ended", kind: key, id, overWholeCluster: false, followed: true, at: CAPTURE });
  }

  const reads: ReadsState = events.reduce(reduceReads, NO_READS);
  const of = <T extends KubeObjectData = KubeObjectData>(kind: string): KindObjects<T> => ({
    key: (options.notServed ?? []).includes(kind) ? undefined : treeKeyOf(kind),
    items: objects.filter((object) => kindOf(object) === kind) as T[],
  });
  const provider = (kind: string): [string, ProviderKindObjects] => {
    const resolution =
      options.resolutions?.[kind] ??
      resolved(kind, kind.startsWith("controlplane.") ? "control-plane-kubeadm" : undefined);
    const unread = resolution.state !== "resolved";

    return [kind, { ...(unread ? { key: undefined, items: [] } : of(kind)), resolution }];
  };
  // The kinds that the references of the Cluster of the tree name, as the read of one Cluster reads them.
  const own = clusterOf(objects, options);
  const clusterKinds = (role: "infrastructure-cluster" | "control-plane") =>
    new Map(
      (own === undefined ? [] : followedReferencesOf(own))
        .filter((entry) => entry.role === role)
        .map(({ reference }) => provider(`${reference.apiGroup}/${reference.kind}`)),
    );

  return {
    clusters: of<ClusterObject>("cluster.x-k8s.io/Cluster"),
    objects: {
      reads,
      machines: of("cluster.x-k8s.io/Machine"),
      machineSets: of("cluster.x-k8s.io/MachineSet"),
      machineDeployments: of("cluster.x-k8s.io/MachineDeployment"),
      machinePools: of("cluster.x-k8s.io/MachinePool"),
      healthChecks: of("cluster.x-k8s.io/MachineHealthCheck"),
      clusterClasses: of("cluster.x-k8s.io/ClusterClass"),
      controlPlanes: clusterKinds("control-plane"),
      infrastructures: clusterKinds("infrastructure-cluster"),
      tree: {
        kubeadmControlPlanes: of("controlplane.cluster.x-k8s.io/KubeadmControlPlane"),
        kubeadmConfigs: of("bootstrap.cluster.x-k8s.io/KubeadmConfig"),
        kubeadmConfigTemplates: of("bootstrap.cluster.x-k8s.io/KubeadmConfigTemplate"),
        clusterResourceSets: of("addons.cluster.x-k8s.io/ClusterResourceSet"),
        clusterResourceSetBindings: of("addons.cluster.x-k8s.io/ClusterResourceSetBinding"),
        ipAddressClaims: of("ipam.cluster.x-k8s.io/IPAddressClaim"),
        ipAddresses: of("ipam.cluster.x-k8s.io/IPAddress"),
        providers: new Map([...providers.tree].map(provider)),
      },
    },
  };
}

const VIRTUAL_WORDS: Readonly<Record<string, string>> = {
  "control-plane": "Control plane",
  workers: "Workers",
  templates: "Templates",
  "add-ons": "Add-ons",
  "health-checks": "Health checks",
  "other-objects": "Other objects",
};

const ENTRY_WORDS: Readonly<Record<string, string>> = {
  applied: "applied",
  "not applied": "not applied",
  missing: "in no binding",
  "not-read": "not read",
  pending: "pending",
};

// The text of a node in an outline.
export function outlineText(node: TreeNode): string {
  switch (node.form) {
    case "object": {
      const name =
        node.kind === "ClusterClass" && node.id.split("/").length === 4 ? `${node.namespace}/${node.name}` : node.name;

      return `${node.kind} ${name}${node.role === undefined ? "" : ` (${ROLE_WORDS[node.role]})`}`;
    }
    case "reference": {
      const parts = node.id.split("/");
      const name = parts.length === 4 ? `${parts[2]}/${node.name}` : node.name;
      const state =
        node.read.state === "pending" ? "pending" : node.read.state === "not-found" ? "not found" : "not read";

      return `${node.kind} ${name}${node.role === undefined ? "" : ` (${ROLE_WORDS[node.role]})`} [${state}]`;
    }
    case "virtual":
      return VIRTUAL_WORDS[node.role];
    case "kind":
      return `${node.noun} [not read]`;
    case "entry":
      return `${node.kind} ${node.name} [${ENTRY_WORDS[node.state]}]`;
  }
}

// The outline of a tree: every node, at its depth under the Cluster, in the order of the tree.
export function treeOutline(tree: ClusterTree): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (node: TreeNode, depth: number) => {
    rows.push({ depth, text: outlineText(node) });
    for (const child of node.children) walk(child, depth + 1);
  };

  walk(tree.root, 0);
  return rows;
}
