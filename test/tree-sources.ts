// The reads of the tree of a Cluster for the unit tests of the tree (SPEC-0005, "Tests", "Unit"): the objects of a set
// as the stores of the tree hold them, each kind under the key of its store, with the state of the reads that the case
// gives, and the kinds of a provider that the references of the set name, resolved as the definitions of the release
// resolve them (test/infrastructure/docker/config/crd/kustomization.yaml:1-6;
// controlplane/kubeadm/config/crd/kustomization.yaml:1-6); and the outline of a tree, as `tree-expectations.ts` writes
// one.

import { NO_READS, reduceReads } from "../src/common/views/read-state";
import {
  clusterReferencesOf,
  controlPlaneTemplateOf,
  isClusterApiKind,
  machineReferencesOf,
  templateReferencesOf,
} from "../src/common/views/references";
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
  // namespace of the load, or whose refresh failed after their load.
  readonly pending?: readonly string[];
  readonly failures?: Readonly<Record<string, readonly ReadFailure[]>>;
  readonly refreshes?: Readonly<Record<string, ReadFailure>>;
  // The resolution of the references to a kind of a provider, resolved by default.
  readonly resolutions?: Readonly<Record<string, ResolvedReference>>;
  // The kinds that the cluster does not serve, which have no store.
  readonly notServed?: readonly string[];
  // The namespace in which the reads of the tree read the ClusterClasses, that of the Cluster by default.
  readonly classNamespace?: string;
}

// The kinds of a provider that the references of a set name: those of the Clusters, and those that the tree follows
// beside them, of the Machines, of the MachineDeployments, the MachineSets and the MachinePools, and of the control
// planes that the Clusters name, at the contract that their resolution gives. An object of a kind that the reads do not
// give, still loading or refused, names nothing, as in the reads of the tree.
function providerKinds(
  given: readonly KubeObjectData[],
  options: TreeSourceOptions,
): { readonly cluster: Set<string>; readonly tree: Set<string> } {
  const { resolutions } = options;
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

  for (const object of objects) {
    if (object.kind === "Cluster") {
      add(cluster, clusterReferencesOf(object));

      const controlPlane = clusterReferencesOf(object).find((entry) => entry.role === "control-plane");

      if (controlPlane === undefined) continue;

      const id = `${controlPlane.reference.apiGroup}/${controlPlane.reference.kind}`;
      const resolution = resolutions?.[id];
      const contract = resolution?.state === "resolved" ? resolution.contract : "v1beta2";

      for (const each of objects.filter((candidate) => kindOf(candidate) === id)) {
        add(tree, controlPlaneTemplateOf(each, contract));
      }
    } else if (object.kind === "Machine") {
      add(tree, machineReferencesOf(object));
    } else if (["MachineDeployment", "MachineSet", "MachinePool"].includes(object.kind)) {
      add(tree, templateReferencesOf(object));
    }
  }
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

    const refresh = options.refreshes?.[kind];

    if (refresh !== undefined)
      events.push({ type: "refresh-failed", kind: key, failure: refresh, at: CAPTURE + 60_000 });
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
  const clusterKinds = (role: "infrastructure-cluster" | "control-plane") =>
    new Map(
      [
        ...new Set(
          objects
            .filter((object) => object.kind === "Cluster")
            .flatMap((cluster) => clusterReferencesOf(cluster).filter((entry) => entry.role === role))
            .map(({ reference }) => `${reference.apiGroup}/${reference.kind}`),
        ),
      ].map(provider),
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
