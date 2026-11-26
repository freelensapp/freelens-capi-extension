/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The tree of a Cluster (SPEC-0005, P7, P8, P12, P21), as pure functions of what the reads of the tree give: one row
// for each object, placed by the first rule of P7 that places it.
//
// - The Cluster is the root. Under it: its infrastructure cluster and its control plane, by the references of the
//   Cluster; Workers, a virtual node, with the MachineDeployments and the MachinePools labelled with the name of the
//   Cluster, the MachineSets under their MachineDeployment, and the MachineSets and the Machines that the Cluster owns;
//   the Machines of the control plane under it, whatever their owner, or under the virtual node Control plane when the
//   Cluster names no control plane; the other Machines under their MachineSet or their MachinePool; the infrastructure
//   machine and the bootstrap config of a Machine under it, and those of a MachinePool under it, before its Machines.
// - A template, a kind whose name ends in `Template`, sits once, under the Templates of the highest object of the tree
//   that names it, in the order control plane, MachineDeployment, MachineSet, MachinePool, then a control plane that
//   the Cluster does not name, and of two objects of one kind the first by name; every other object that names it keeps
//   the field by which it names it.
// - An IPAddressClaim of the Cluster sits under its controller when the tree holds it, and its IPAddress under it.
// - The ClusterClass of the Cluster, read in the namespace that its reference names; Add-ons, with the
//   ClusterResourceSets that select the Cluster or that its binding names, each with the resources that it applied to
//   this Cluster as the binding records them, and the binding; Health checks, with the MachineHealthChecks.
// - An object of the Cluster that no rule above places, labelled with its name or naming it in `spec.clusterName`,
//   sits under its controller, else the first of its owners, that the tree holds, the Cluster apart; under the row of
//   an owner of a kind that cannot be read, made from its owner reference; or under Other objects, with its reason,
//   where it holds what it owns and names by the same rules.
// - A kind that cannot be read is a node of its own, under the Cluster (P12), and so is a kind of a provider whose
//   definition cannot be read. An object that a reference names and that the tree cannot read, or does not find, is a
//   row made from that reference, which says why.
//
// What is no node (P8): the tree reads no Secret, ConfigMap, MachineDrainRule, Node, remediation request, IPAM pool,
// kind of the operator, `Provider` of `clusterctl` or ExtensionConfig, and follows no reference that names them, nor
// the templates of a ClusterClass, whose class is one node (`references.ts`).
//
// Every node keeps the order of P14: under the Cluster, the infrastructure cluster, the control plane, Workers, the
// ClusterClass, Add-ons, Health checks, Other objects, then the nodes of the kinds that cannot be read; under an
// object, its objects in the order of the rows of P7, Templates last; two kinds of one row in the order of their names,
// and the objects of one kind in the order of their names, never by their state.
//
// The status of each object is the model's, with the context of SPEC-0003 for its kind, under the keys of SPEC-0003
// (`evaluateTree`), and the indexes and the tree are built once for each change of what they read (`TreeBuilds`).

import { PAUSED_ANNOTATION, UNREAD_WORDS } from "./cluster-details";
import { clusterViewOf, holdsOf } from "./cluster-view";
import { clusterContextOf, contextKeyOf, contextVersions, indexContext, inputStateOf } from "./context";
import { selectorSelects } from "./label-selector";
import { fieldsOf, labelOf, listOf, nameOf, namespaceOf, ownersOf, textOf, versionOf } from "./objects";
import { namespaceRead } from "./read-state";
import {
  classReferenceOf,
  clusterReferencesOf,
  contractReferenceOf,
  controlPlaneTemplateOf,
  isClusterApiKind,
  isTemplateKind,
  machineReferencesOf,
  templateReferencesOf,
} from "./references";

import type { ContractVersion } from "../parsers/contract-label";
import type {
  BindingInput,
  ClusterObject,
  ClusterResourceSetBindingObject,
  KubeObjectData,
  MachineObject,
  ObjectStatus,
  StatusContext,
} from "../status/index";
import type { ClusterViewState } from "./cluster-view";
import type { ContextIndex, ContextObjects, KindObjects, ProviderKindObjects, StatusMemo } from "./context";
import type { ReadFailure, ReadsState } from "./read-state";
import type {
  ContractReference,
  FollowedReference,
  ReferenceRole,
  ResolvedReference,
  UnreadReason,
} from "./references";

const CORE = "cluster.x-k8s.io";
const CLUSTER_NAME_LABEL = "cluster.x-k8s.io/cluster-name";
const CONTROL_PLANE_LABEL = "cluster.x-k8s.io/control-plane";

// The rows of P7, which order the nodes under one node (P14).
const ROW = {
  infrastructure: 2,
  controlPlane: 3,
  workers: 4,
  deploymentOrPool: 5,
  machineSet: 6,
  // The bootstrap config and the infrastructure machine pool of a MachinePool, before its Machines (P7).
  poolReference: 6.5,
  machine: 7,
  machineReference: 8,
  template: 10,
  claim: 11,
  address: 12,
  clusterClass: 13,
  clusterResourceSet: 14,
  entry: 15,
  binding: 16,
  healthCheck: 17,
  owner: 18,
  other: 19,
  kind: 20,
  // The virtual node Templates comes last under the object that names its templates.
  templates: 99,
} as const;

// The order of the nodes under the Cluster (P14).
const ROOT_ORDER = {
  infrastructure: 1,
  controlPlane: 2,
  workers: 3,
  clusterClass: 4,
  addOns: 5,
  healthChecks: 6,
  other: 7,
  kind: 8,
} as const;

// The row of P7 that the role of a reference places an object of a provider by.
const ROLE_ROW: Readonly<Record<ReferenceRole, number>> = {
  "infrastructure-cluster": ROW.infrastructure,
  "control-plane": ROW.controlPlane,
  "infrastructure-machine": ROW.machineReference,
  "bootstrap-config": ROW.machineReference,
  "infrastructure-machine-pool": 9,
  template: ROW.template,
};

// The address of a node (P2): `<group>/<Kind>/<name>`, or `<group>/<Kind>/<namespace>/<name>` for the class in another
// namespace than its Cluster, the one node that can live elsewhere.
export function addressOf(group: string, kind: string, name: string, namespace?: string): string {
  return namespace === undefined ? `${group}/${kind}/${name}` : `${group}/${kind}/${namespace}/${name}`;
}

// An owner of an object, by its group, its kind and its name in the namespace of the object.
export interface OwnerName {
  readonly group: string;
  readonly kind: string;
  readonly name: string;
}

// Why an object of a kind that the tree reads, or a kind, could not be read (P12): the reason in the words of
// SPEC-0004, the failures of each answer, and the namespace whose read the reason names, that of the Cluster or that of
// its class.
export interface Unread {
  readonly state: "not-read" | "not-found";
  readonly reason: UnreadReason;
  readonly failures: readonly ReadFailure[];
  readonly namespace: string;
  readonly classNamespace: boolean;
}

// Why an object sits under Other objects, or under the row of an owner that cannot be read (P7).
export type PlaceReason =
  // It has no owner.
  | { readonly code: "no-owner" }
  // Its owner is of a kind that cannot be read: it sits under the row of that owner.
  | { readonly code: "owner-not-read"; readonly owner: OwnerName; readonly unread: Unread }
  // Its owners are not nodes of the tree: of kinds that the tree read, which its namespace does not hold or no rule
  // places, or of a kind that the tree does not read.
  | { readonly code: "owners-not-in-tree"; readonly owners: readonly OwnerName[] }
  // The Cluster owns it and no object of the tree names it, with the kinds that can name it and could not be read.
  | { readonly code: "owned-by-cluster"; readonly namers: readonly string[] };

// How the tree found a node (P7, P17).
export type Placement =
  | { readonly by: "root" }
  // A reference of the node above it, by its field.
  | { readonly by: "reference"; readonly field: string; readonly from: string }
  // The label of the name of the Cluster, for a MachineDeployment and a MachinePool, or that of the control plane, for
  // a Machine of the control plane.
  | { readonly by: "label"; readonly label: string }
  // Its controller, the node above it.
  | { readonly by: "controller"; readonly owner: string }
  // An owner reference to the Cluster, for a MachineSet or a Machine under Workers.
  | { readonly by: "cluster-owner" }
  // `spec.clusterName`, for a MachineHealthCheck and the binding of the Cluster.
  | { readonly by: "cluster-name" }
  // A ClusterResourceSet: its selector selects the Cluster, or the binding of the Cluster names it.
  | { readonly by: "selector" }
  | { readonly by: "binding" }
  // An IPAddress: the address of its claim, or the claim that it names.
  | { readonly by: "claim"; readonly field: "status.addressRef" | "spec.claimRef" }
  // An object under an owner that the tree holds, the node above it (P7, the row of the owners).
  | { readonly by: "owner"; readonly owner: string }
  // An object under Other objects, or under the row of an owner that cannot be read.
  | { readonly by: "reason"; readonly reason: PlaceReason }
  // The row of an owner of a kind that cannot be read, which no object that the tree read names, under the node of its
  // kind.
  | { readonly by: "kind" };

interface NodeBase {
  readonly id: string;
  readonly children: readonly TreeNode[];
}

// A node of an object that the tree read.
export interface ObjectNode extends NodeBase {
  readonly form: "object";
  readonly object: KubeObjectData;
  readonly group: string;
  readonly kind: string;
  readonly name: string;
  readonly namespace: string;
  // The role of an object of a provider; undefined for an object of Cluster API, whose role is its kind.
  readonly role: ReferenceRole | undefined;
  // The resolution of the kind of an object of a provider.
  readonly resolution: Extract<ResolvedReference, { readonly state: "resolved" }> | undefined;
  readonly placement: Placement;
  // The objects of the tree that name it in a reference, the one above it included, each with its field.
  readonly namedBy: readonly { readonly id: string; readonly field: string }[];
}

// A node of an object that the tree cannot read, or does not find (P12): made from the reference that names it, or
// from the owner reference of an object that it owns.
export interface ReferenceNode extends NodeBase {
  readonly form: "reference";
  readonly group: string;
  readonly kind: string;
  readonly name: string;
  readonly role: ReferenceRole | undefined;
  readonly read: { readonly state: "pending" } | Unread;
  readonly placement: Placement;
  readonly namedBy: readonly { readonly id: string; readonly field: string }[];
}

export type VirtualRole = "control-plane" | "workers" | "templates" | "add-ons" | "health-checks" | "other-objects";

// A virtual node, which holds the objects of one role and is no object.
export interface VirtualNode extends NodeBase {
  readonly form: "virtual";
  readonly role: VirtualRole;
}

// The node of a kind that cannot be read (P12): its read refused or failed, or held back after a refresh that failed,
// or, for a kind of a provider, its definition, which could not be read, so that the kind is never read.
export interface KindNode extends NodeBase {
  readonly form: "kind";
  readonly group: string;
  readonly kind: string;
  readonly noun: string;
  readonly unread: Unread;
  // The definition of a kind of a provider could not be read: its objects are not shown.
  readonly definition: boolean;
  // Its objects name the kinds of the providers that the tree reads: the objects that only that kind names are not
  // read either.
  readonly namesProviderKinds: boolean;
}

// A resource of a ClusterResourceSet, as the binding of this Cluster records it (P7), a record of the binding and no
// object.
export interface EntryNode extends NodeBase {
  readonly form: "entry";
  readonly clusterResourceSet: string;
  readonly kind: string;
  readonly name: string;
  // Applied, not applied, in no binding of this Cluster, not read with the bindings, or pending while they load.
  readonly state: "applied" | "not applied" | "missing" | "not-read" | "pending";
  readonly lastAppliedTime: string | undefined;
  readonly unread: Unread | undefined;
}

export type TreeNode = ObjectNode | ReferenceNode | VirtualNode | KindNode | EntryNode;

// The tree of one Cluster.
export interface ClusterTree {
  readonly root: ObjectNode;
  // Every node, by its identity.
  readonly nodes: ReadonlyMap<string, TreeNode>;
  // The node above each node, by their identities.
  readonly parents: ReadonlyMap<string, string>;
  // The namespace of the class of the Cluster, when it names one.
  readonly classNamespace: string | undefined;
}

// The tree, or the state of the view of the Cluster when it is not found (SPEC-0004, P25; P19).
export type TreeOutcome =
  | { readonly state: "found"; readonly tree: ClusterTree }
  | Exclude<ClusterViewState<ClusterObject>, { readonly state: "found" }>;

// The indexes

// A kind that the tree reads: a kind of Cluster API that a model of the view reads, or a kind of a provider that a
// reference names, with its store key and the resolution of that reference, its objects in the namespaces read, the
// row of P7 that places them, and where the tree reads it.
interface TreeKind {
  readonly group: string;
  readonly kind: string;
  readonly noun: string;
  readonly row: number;
  readonly key: string | undefined;
  readonly resolution: ResolvedReference | undefined;
  readonly where: "cluster" | "class";
  readonly items: readonly KubeObjectData[];
  // The roles of the references that name a kind of a provider.
  readonly roles: readonly ReferenceRole[];
}

// An object that the tree read, with its kind and its address in its namespace.
interface TreeObject {
  readonly object: KubeObjectData;
  readonly kind: TreeKind;
  readonly name: string;
  readonly namespace: string;
}

export interface TreeIndex {
  readonly objects: ContextObjects;
  readonly context: ContextIndex;
  readonly clusters: KindObjects<ClusterObject>;
  // Every kind that the tree reads, by `group/kind`.
  readonly kinds: ReadonlyMap<string, TreeKind>;
  // The objects read, by `group/kind/namespace/name`.
  readonly byAddress: ReadonlyMap<string, TreeObject>;
  // The objects labelled with the name of a Cluster or naming it in `spec.clusterName`, by `namespace/name`.
  readonly byCluster: ReadonlyMap<string, readonly TreeObject[]>;
}

// The kinds of Cluster API that the tree reads through their models, with the noun of their notices and the row of P7
// that places their objects.
const MODEL_KINDS: readonly {
  readonly group: string;
  readonly kind: string;
  readonly noun: string;
  readonly row: number;
  readonly where: "cluster" | "class";
  readonly of: (objects: ContextObjects) => KindObjects | undefined;
}[] = [
  {
    group: CORE,
    kind: "MachineDeployment",
    noun: "MachineDeployments",
    row: ROW.deploymentOrPool,
    where: "cluster",
    of: (objects) => objects.machineDeployments,
  },
  {
    group: CORE,
    kind: "MachinePool",
    noun: "MachinePools",
    row: ROW.deploymentOrPool,
    where: "cluster",
    of: (objects) => objects.machinePools,
  },
  {
    group: CORE,
    kind: "MachineSet",
    noun: "MachineSets",
    row: ROW.machineSet,
    where: "cluster",
    of: (objects) => objects.machineSets,
  },
  {
    group: CORE,
    kind: "Machine",
    noun: "Machines",
    row: ROW.machine,
    where: "cluster",
    of: (objects) => objects.machines,
  },
  {
    group: "controlplane.cluster.x-k8s.io",
    kind: "KubeadmControlPlane",
    noun: "KubeadmControlPlanes",
    row: ROW.controlPlane,
    where: "cluster",
    of: (objects) => objects.tree?.kubeadmControlPlanes,
  },
  {
    group: "bootstrap.cluster.x-k8s.io",
    kind: "KubeadmConfig",
    noun: "KubeadmConfigs",
    row: ROW.machineReference,
    where: "cluster",
    of: (objects) => objects.tree?.kubeadmConfigs,
  },
  {
    group: "bootstrap.cluster.x-k8s.io",
    kind: "KubeadmConfigTemplate",
    noun: "KubeadmConfigTemplates",
    row: ROW.template,
    where: "cluster",
    of: (objects) => objects.tree?.kubeadmConfigTemplates,
  },
  {
    group: "ipam.cluster.x-k8s.io",
    kind: "IPAddressClaim",
    noun: "IPAddressClaims",
    row: ROW.claim,
    where: "cluster",
    of: (objects) => objects.tree?.ipAddressClaims,
  },
  {
    group: "ipam.cluster.x-k8s.io",
    kind: "IPAddress",
    noun: "IPAddresses",
    row: ROW.address,
    where: "cluster",
    of: (objects) => objects.tree?.ipAddresses,
  },
  {
    group: CORE,
    kind: "ClusterClass",
    noun: "ClusterClasses",
    row: ROW.clusterClass,
    where: "class",
    of: (objects) => objects.clusterClasses,
  },
  {
    group: "addons.cluster.x-k8s.io",
    kind: "ClusterResourceSet",
    noun: "ClusterResourceSets",
    row: ROW.clusterResourceSet,
    where: "cluster",
    of: (objects) => objects.tree?.clusterResourceSets,
  },
  {
    group: "addons.cluster.x-k8s.io",
    kind: "ClusterResourceSetBinding",
    noun: "ClusterResourceSetBindings",
    row: ROW.binding,
    where: "cluster",
    of: (objects) => objects.tree?.clusterResourceSetBindings,
  },
  {
    group: CORE,
    kind: "MachineHealthCheck",
    noun: "MachineHealthChecks",
    row: ROW.healthCheck,
    where: "cluster",
    of: (objects) => objects.healthChecks,
  },
];

function push<K, T>(map: Map<K, T[]>, key: K, value: T): void {
  const list = map.get(key);

  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function kindId(group: string, kind: string): string {
  return `${group}/${kind}`;
}

function scopedAddress(group: string, kind: string, namespace: string, name: string): string {
  return `${group}/${kind}/${namespace}/${name}`;
}

function addressOfEntry(entry: TreeObject): string {
  return scopedAddress(entry.kind.group, entry.kind.kind, entry.namespace, entry.name);
}

// The objects of a kind in the namespaces whose read is done, the others left out (SPEC-0004, P19).
function readItems(reads: ReadsState, objects: KindObjects | undefined): KubeObjectData[] {
  const key = objects?.key;

  if (objects === undefined || key === undefined) return [];
  return objects.items.filter((item) => namespaceRead(reads, key, namespaceOf(item) ?? "").state === "read");
}

// An object of a control plane: a KubeadmControlPlane, or an object of a provider that a reference names as one.
function isControlPlaneNode(node: ObjectNode): boolean {
  return (
    (node.group === "controlplane.cluster.x-k8s.io" && node.kind === "KubeadmControlPlane") ||
    node.role === "control-plane"
  );
}

// The names of the Clusters that an object names, by its label or by `spec.clusterName`.
function clusterNamesOf(object: KubeObjectData): string[] {
  const label = labelOf(object, CLUSTER_NAME_LABEL);
  const named = textOf(fieldsOf(object.spec)?.clusterName);

  return [...new Set([label, named].filter((name): name is string => name !== undefined && name !== ""))];
}

// The references that the tree follows from the objects of the namespaces read, which give the kinds of a provider
// their roles: those of the Machines, of the MachineDeployments, the MachineSets and the MachinePools, and of the
// control planes that the Clusters name.
function rolesOf(objects: ContextObjects): Map<string, ReferenceRole[]> {
  const { reads } = objects;
  const roles = new Map<string, ReferenceRole[]>();
  const add = (entries: readonly FollowedReference[]) => {
    for (const { reference, role } of entries) {
      const id = kindId(reference.apiGroup, reference.kind);

      if (!(roles.get(id) ?? []).includes(role)) push(roles, id, role);
    }
  };

  for (const machine of readItems(reads, objects.machines)) add(machineReferencesOf(machine));
  for (const owner of [objects.machineDeployments, objects.machineSets, objects.machinePools].flatMap((kind) =>
    readItems(reads, kind),
  )) {
    add(templateReferencesOf(owner));
  }
  for (const [id, kind] of objects.controlPlanes) {
    if (kind.resolution.state !== "resolved") continue;

    const contract = kind.resolution.contract;

    for (const controlPlane of readItems(reads, kind)) add(controlPlaneTemplateOf(controlPlane, contract));
    if (!(roles.get(id) ?? []).includes("control-plane")) push(roles, id, "control-plane");
  }
  for (const id of objects.infrastructures?.keys() ?? []) {
    if (!(roles.get(id) ?? []).includes("infrastructure-cluster")) push(roles, id, "infrastructure-cluster");
  }
  return roles;
}

// The indexes of the tree, built once for each change of what they read (P16).
export function indexTree(
  clusters: KindObjects<ClusterObject>,
  objects: ContextObjects,
  context: ContextIndex = indexContext(objects),
): TreeIndex {
  const { reads } = objects;
  const kinds = new Map<string, TreeKind>();
  const roles = rolesOf(objects);

  for (const model of MODEL_KINDS) {
    const of = model.of(objects);

    if (of === undefined) continue;
    kinds.set(kindId(model.group, model.kind), {
      group: model.group,
      kind: model.kind,
      noun: model.noun,
      row: model.row,
      key: of.key,
      resolution: undefined,
      where: model.where,
      items: readItems(reads, of),
      roles: [],
    });
  }

  const providers: [string, ProviderKindObjects][] = [
    ...(objects.infrastructures ?? new Map<string, ProviderKindObjects>()),
    ...objects.controlPlanes,
    ...(objects.tree?.providers ?? new Map<string, ProviderKindObjects>()),
  ];

  for (const [id, kind] of providers) {
    if (kinds.has(id)) continue;

    const [group, name] = [id.slice(0, id.lastIndexOf("/")), id.slice(id.lastIndexOf("/") + 1)];
    const kindRoles = roles.get(id) ?? [];

    kinds.set(id, {
      group,
      kind: name,
      noun: `${name} objects`,
      row: Math.min(ROW.template, ...kindRoles.map((role) => ROLE_ROW[role])),
      key: kind.key,
      resolution: kind.resolution,
      where: "cluster",
      items: readItems(reads, kind),
      roles: kindRoles,
    });
  }

  const byAddress = new Map<string, TreeObject>();
  const byCluster = new Map<string, TreeObject[]>();

  for (const kind of kinds.values()) {
    for (const object of kind.items) {
      const name = nameOf(object) ?? "";
      const namespace = namespaceOf(object) ?? "";
      const entry: TreeObject = { object, kind, name, namespace };

      byAddress.set(scopedAddress(kind.group, kind.kind, namespace, name), entry);
      for (const cluster of clusterNamesOf(object)) push(byCluster, `${namespace}/${cluster}`, entry);
    }
  }
  return { objects, context, clusters, kinds, byAddress, byCluster };
}

// The tree

// What a read of a kind gives in a namespace: its objects, or why it gives none.
type KindRead =
  | { readonly state: "read" }
  | { readonly state: "pending" }
  | { readonly state: "unread"; readonly reason: UnreadReason; readonly failures: readonly ReadFailure[] };

function kindReadOf(index: TreeIndex, kind: TreeKind | undefined, namespace: string): KindRead {
  if (kind === undefined) return { state: "unread", reason: "not-served", failures: [] };

  const { resolution } = kind;

  if (resolution?.state === "pending") return { state: "pending" };
  if (resolution?.state === "unresolved") {
    return {
      state: "unread",
      reason: resolution.reason,
      failures: resolution.failure === undefined ? [] : [resolution.failure],
    };
  }
  if (kind.key === undefined) {
    return { state: "unread", reason: resolution === undefined ? "not-served" : "version-not-served", failures: [] };
  }

  const read = namespaceRead(index.objects.reads, kind.key, namespace).state;

  if (read === "read") return { state: "read" };
  if (read === "held") {
    const holds = holdsOf(index.objects.reads, kind.key, namespace);

    return {
      state: "unread",
      reason: "kind-not-read",
      failures: [...(holds.load?.failures ?? []), ...(holds.refresh?.failures ?? [])],
    };
  }
  // A namespace that the filter does not hold is one that the view does not read: it is still to be read.
  return { state: "pending" };
}

// Whether the objects of a kind cannot be read in a namespace, as an owner row or a kind node says it (P12): its read
// refused or failed, or held back, or, for a kind of a provider, its definition could not be read.
function cannotBeRead(read: KindRead): read is Extract<KindRead, { readonly state: "unread" }> {
  return (
    read.state === "unread" &&
    (read.reason === "kind-not-read" || read.reason === "definition-refused" || read.reason === "definition-failed")
  );
}

// A node under construction: the node, with the children that the placement gives it, and its place in the order of
// its siblings (P14).
interface Draft {
  node: TreeNode;
  readonly children: Draft[];
  parent: Draft | undefined;
  readonly order: readonly [number, number, string, string];
  readonly namedBy: { id: string; field: string }[];
}

// The kinds whose objects name the kinds of the providers that the tree reads (P6, P12).
const NAMERS_OF_PROVIDER_KINDS: ReadonlySet<string> = new Set([
  kindId(CORE, "Machine"),
  kindId(CORE, "MachineDeployment"),
  kindId(CORE, "MachineSet"),
  kindId(CORE, "MachinePool"),
  kindId("controlplane.cluster.x-k8s.io", "KubeadmControlPlane"),
]);

class Placer {
  readonly #index: TreeIndex;
  readonly #cluster: ClusterObject;
  readonly #namespace: string;
  readonly #name: string;
  readonly #classNamespace: string | undefined;
  readonly #drafts = new Map<string, Draft>();
  // The objects placed, by their address in their namespace.
  readonly #placed = new Set<string>();
  readonly #root: Draft;
  // The control plane of the tree: the node that the reference of the Cluster makes, or the virtual Control plane.
  #controlPlane: Draft | undefined;
  #controlPlaneNamed = false;

  constructor(index: TreeIndex, cluster: ClusterObject) {
    this.#index = index;
    this.#cluster = cluster;
    this.#namespace = namespaceOf(cluster) ?? "";
    this.#name = nameOf(cluster) ?? "";
    this.#classNamespace = classReferenceOf(cluster)?.namespace;
    this.#root = this.#add(undefined, [0, 0, "", ""], {
      form: "object",
      id: addressOf(CORE, "Cluster", this.#name),
      children: [],
      object: cluster,
      group: CORE,
      kind: "Cluster",
      name: this.#name,
      namespace: this.#namespace,
      role: undefined,
      resolution: undefined,
      placement: { by: "root" },
      namedBy: [],
    });
    this.#placed.add(scopedAddress(CORE, "Cluster", this.#namespace, this.#name));
  }

  #add(parent: Draft | undefined, order: Draft["order"], node: TreeNode): Draft {
    const draft: Draft = { node, children: [], parent, order, namedBy: [] };

    this.#drafts.set(node.id, draft);
    parent?.children.push(draft);
    return draft;
  }

  #kind(group: string, kind: string): TreeKind | undefined {
    return this.#index.kinds.get(kindId(group, kind));
  }

  // A virtual node, made once, under its parent.
  #virtual(parent: Draft, role: VirtualRole, order: Draft["order"]): Draft {
    const id = role === "templates" ? `virtual:templates:${parent.node.id}` : `virtual:${role}`;

    return this.#drafts.get(id) ?? this.#add(parent, order, { form: "virtual", id, role, children: [] });
  }

  #workers(): Draft {
    return this.#virtual(this.#root, "workers", [ROOT_ORDER.workers, 0, "", ""]);
  }

  // The order of a node under its parent: the order of P14 under the Cluster, else the row of P7 that placed it, then
  // its kind and its name.
  #order(parent: Draft, row: number, kind: string, name: string, rootOrder?: number): Draft["order"] {
    return parent === this.#root ? [rootOrder ?? ROOT_ORDER.other, row, kind, name] : [row, 0, kind, name];
  }

  // Places an object that the tree read under a node; an object already placed stays where it is.
  #placeObject(
    entry: TreeObject,
    parent: Draft,
    row: number,
    placement: Placement,
    role: ReferenceRole | undefined,
    rootOrder?: number,
  ): Draft | undefined {
    const address = scopedAddress(entry.kind.group, entry.kind.kind, entry.namespace, entry.name);

    if (this.#placed.has(address)) return undefined;
    this.#placed.add(address);

    const elsewhere = entry.kind.where === "class" && entry.namespace !== this.#namespace;
    const id = addressOf(entry.kind.group, entry.kind.kind, entry.name, elsewhere ? entry.namespace : undefined);
    const provider = !isClusterApiKind(entry.kind.group, entry.kind.kind);
    const resolution = entry.kind.resolution?.state === "resolved" ? entry.kind.resolution : undefined;

    return this.#add(parent, this.#order(parent, row, entry.kind.kind, entry.name, rootOrder), {
      form: "object",
      id,
      children: [],
      object: entry.object,
      group: entry.kind.group,
      kind: entry.kind.kind,
      name: entry.name,
      namespace: entry.namespace,
      role: provider ? (role ?? entry.kind.roles[0]) : undefined,
      resolution: provider ? resolution : undefined,
      placement,
      namedBy: [],
    });
  }

  // The node of an object that a reference names: the object, when the tree read it, else a row made from the
  // reference, which says why (P12). An object already placed keeps its place, and records the field that names it.
  #placeReference(
    reference: ContractReference,
    role: ReferenceRole | undefined,
    parent: Draft,
    row: number,
    field: string,
    options: { readonly namespace?: string; readonly rootOrder?: number; readonly namer?: Draft } = {},
  ): Draft {
    const { namespace = this.#namespace, rootOrder, namer = parent } = options;
    const kind = this.#kind(reference.apiGroup, reference.kind);
    const entry = this.#index.byAddress.get(
      scopedAddress(reference.apiGroup, reference.kind, namespace, reference.name),
    );
    const elsewhere = namespace !== this.#namespace;
    const id = addressOf(reference.apiGroup, reference.kind, reference.name, elsewhere ? namespace : undefined);
    const placement: Placement = { by: "reference", field, from: namer.node.id };
    const known = this.#drafts.get(id);

    if (known !== undefined) {
      this.#named(known, namer, field);
      return known;
    }

    const placed = entry === undefined ? undefined : this.#placeObject(entry, parent, row, placement, role, rootOrder);

    if (placed !== undefined) {
      this.#named(placed, namer, field);
      return placed;
    }

    const read = kindReadOf(this.#index, kind, namespace);
    const draft = this.#add(parent, this.#order(parent, row, reference.kind, reference.name, rootOrder), {
      form: "reference",
      id,
      children: [],
      group: reference.apiGroup,
      kind: reference.kind,
      name: reference.name,
      role: isClusterApiKind(reference.apiGroup, reference.kind) ? undefined : role,
      read:
        read.state === "pending"
          ? { state: "pending" }
          : {
              state: read.state === "read" ? "not-found" : "not-read",
              reason: read.state === "read" ? "not-found" : read.reason,
              failures: read.state === "read" ? [] : read.failures,
              namespace,
              classNamespace: elsewhere || (kind?.where === "class" && namespace === this.#classNamespace),
            },
      placement,
      namedBy: [],
    });

    this.#named(draft, namer, field);
    return draft;
  }

  // Records an object of the tree that names a node, by its field, once.
  #named(draft: Draft, namer: Draft, field: string): void {
    if (!draft.namedBy.some((named) => named.id === namer.node.id && named.field === field)) {
      draft.namedBy.push({ id: namer.node.id, field });
    }
  }

  // The objects of the Cluster of a kind, by its label or by `spec.clusterName`.
  #candidates(): TreeObject[] {
    return [...(this.#index.byCluster.get(`${this.#namespace}/${this.#name}`) ?? [])];
  }

  #isPlaced(entry: TreeObject): boolean {
    return this.#placed.has(scopedAddress(entry.kind.group, entry.kind.kind, entry.namespace, entry.name));
  }

  #draftOfOwner(owner: OwnerName): Draft | undefined {
    const draft = this.#drafts.get(addressOf(owner.group, owner.kind, owner.name));

    return draft !== undefined && draft !== this.#root && draft.node.form === "object" ? draft : undefined;
  }

  #ownsCluster(object: KubeObjectData): boolean {
    return ownersOf(object).some(
      (owner) => owner.group === CORE && owner.kind === "Cluster" && owner.name === this.#name,
    );
  }

  // The infrastructure cluster and the control plane, by the references of the Cluster (P7).
  placeClusterReferences(): void {
    for (const { reference, role, field } of clusterReferencesOf(this.#cluster)) {
      const draft = this.#placeReference(
        reference,
        role,
        this.#root,
        role === "control-plane" ? ROW.controlPlane : ROW.infrastructure,
        field,
        { rootOrder: role === "control-plane" ? ROOT_ORDER.controlPlane : ROOT_ORDER.infrastructure },
      );

      if (role === "control-plane") {
        this.#controlPlane = draft;
        this.#controlPlaneNamed = true;
      }
    }
  }

  // The workers and the Machines (P7): what the labels, the controllers and the owner references to the Cluster place.
  #placeWorkers(): boolean {
    let placed = false;
    const candidates = this.#candidates().filter((entry) => !this.#isPlaced(entry) && entry.kind.group === CORE);

    for (const entry of candidates) {
      const { kind, object } = entry;

      if (kind.kind === "MachineDeployment" || kind.kind === "MachinePool") {
        if (labelOf(object, CLUSTER_NAME_LABEL) !== this.#name) continue;
        if (
          this.#placeObject(
            entry,
            this.#workers(),
            ROW.deploymentOrPool,
            { by: "label", label: CLUSTER_NAME_LABEL },
            undefined,
          ) !== undefined
        )
          placed = true;
      }
    }
    for (const entry of candidates) {
      const { kind, object } = entry;

      if (kind.kind !== "MachineSet" || labelOf(object, CLUSTER_NAME_LABEL) !== this.#name || this.#isPlaced(entry)) {
        continue;
      }

      const controller = ownersOf(object).find((owner) => owner.controller);
      const deployment =
        controller?.group === CORE && controller.kind === "MachineDeployment"
          ? this.#draftOfOwner(controller)
          : undefined;

      if (deployment !== undefined) {
        if (
          this.#placeObject(
            entry,
            deployment,
            ROW.machineSet,
            { by: "controller", owner: deployment.node.id },
            undefined,
          ) !== undefined
        )
          placed = true;
      } else if (this.#ownsCluster(object)) {
        if (this.#placeObject(entry, this.#workers(), ROW.machineSet, { by: "cluster-owner" }, undefined) !== undefined)
          placed = true;
      }
    }
    for (const entry of candidates) {
      const { kind, object } = entry;

      if (kind.kind !== "Machine" || labelOf(object, CLUSTER_NAME_LABEL) !== this.#name || this.#isPlaced(entry))
        continue;
      if (Object.hasOwn(fieldsOf(fieldsOf(object.metadata)?.labels) ?? {}, CONTROL_PLANE_LABEL)) {
        // The Machines of the control plane go under the control plane of the tree, whatever their owner, or under the
        // virtual node Control plane when the Cluster names none (P7).
        const controlPlane =
          this.#controlPlane ??
          (this.#controlPlaneNamed
            ? undefined
            : this.#virtual(this.#root, "control-plane", [ROOT_ORDER.controlPlane, 0, "", ""]));

        if (controlPlane === undefined) continue;
        if (
          this.#placeObject(
            entry,
            controlPlane,
            ROW.machine,
            { by: "label", label: CONTROL_PLANE_LABEL },
            undefined,
          ) !== undefined
        )
          placed = true;
        continue;
      }

      const controller = ownersOf(object).find((owner) => owner.controller);
      const owner =
        controller?.group === CORE && (controller.kind === "MachineSet" || controller.kind === "MachinePool")
          ? this.#draftOfOwner(controller)
          : undefined;

      if (owner !== undefined) {
        if (
          this.#placeObject(entry, owner, ROW.machine, { by: "controller", owner: owner.node.id }, undefined) !==
          undefined
        )
          placed = true;
      } else if (this.#ownsCluster(object)) {
        if (this.#placeObject(entry, this.#workers(), ROW.machine, { by: "cluster-owner" }, undefined) !== undefined)
          placed = true;
      }
    }
    return placed;
  }

  // The objects that the references of the Machines and of the MachinePools of the tree name (P7).
  #placeMachineReferences(): boolean {
    let placed = false;

    for (const draft of [...this.#drafts.values()]) {
      const { node } = draft;

      if (node.form !== "object" || node.group !== CORE) continue;
      if (node.kind === "Machine") {
        for (const { reference, role, field } of machineReferencesOf(node.object)) {
          if (this.#placeOnce(reference, role, draft, ROW.machineReference, field)) placed = true;
        }
      } else if (node.kind === "MachinePool") {
        for (const { reference, role, field } of templateReferencesOf(node.object)) {
          if (role !== "template") if (this.#placeOnce(reference, role, draft, ROW.poolReference, field)) placed = true;
        }
      }
    }
    return placed;
  }

  // Places what a reference names, once; whether it made a node.
  #placeOnce(
    reference: ContractReference,
    role: ReferenceRole | undefined,
    parent: Draft,
    row: number,
    field: string,
  ): boolean {
    const known = this.#drafts.get(addressOf(reference.apiGroup, reference.kind, reference.name));

    if (known !== undefined) {
      this.#named(known, parent, field);
      return false;
    }
    this.#placeReference(reference, role, parent, row, field);
    return true;
  }

  // The IPAddressClaims of the Cluster under their controller, when the tree holds it, and the IPAddress of each claim
  // under it (P7, P21).
  #placeClaims(): boolean {
    let placed = false;

    for (const entry of this.#candidates()) {
      if (entry.kind.kind !== "IPAddressClaim" || this.#isPlaced(entry)) continue;

      const controller = ownersOf(entry.object).find((owner) => owner.controller);
      const owner = controller === undefined ? undefined : this.#draftOfOwner(controller);

      if (owner !== undefined) {
        if (
          this.#placeObject(entry, owner, ROW.claim, { by: "controller", owner: owner.node.id }, undefined) !==
          undefined
        )
          placed = true;
      }
    }
    for (const draft of [...this.#drafts.values()]) {
      const { node } = draft;

      if (node.form !== "object" || node.kind !== "IPAddressClaim") continue;

      const addressRef = textOf(fieldsOf(fieldsOf(node.object.status)?.addressRef)?.name);

      if (addressRef !== undefined && addressRef !== "") {
        if (
          this.#placeOnce(
            { apiGroup: "ipam.cluster.x-k8s.io", kind: "IPAddress", name: addressRef },
            undefined,
            draft,
            ROW.address,
            "status.addressRef",
          )
        )
          placed = true;
      }
      for (const address of this.#kind("ipam.cluster.x-k8s.io", "IPAddress")?.items ?? []) {
        const claim = textOf(fieldsOf(fieldsOf(address.spec)?.claimRef)?.name);
        const entry = this.#index.byAddress.get(
          scopedAddress("ipam.cluster.x-k8s.io", "IPAddress", namespaceOf(address) ?? "", nameOf(address) ?? ""),
        );

        if (claim !== node.name || namespaceOf(address) !== this.#namespace || entry === undefined) continue;
        if (
          this.#placeObject(entry, draft, ROW.address, { by: "claim", field: "spec.claimRef" }, undefined) !== undefined
        )
          placed = true;
      }
    }
    return placed;
  }

  // The row of an owner of a kind that cannot be read (P7, P12): the row that a reference of an object read makes of
  // that owner, else a row of its own under the node of its kind, one for each owner.
  #ownerRow(owner: OwnerName, read: Extract<KindRead, { readonly state: "unread" }>): Draft {
    const id = addressOf(owner.group, owner.kind, owner.name);
    const known = this.#drafts.get(id);

    if (known !== undefined) return known;

    const kindNode = this.#drafts.get(`kind:${kindId(owner.group, owner.kind)}`) ?? this.#root;

    return this.#add(kindNode, this.#order(kindNode, ROW.owner, owner.kind, owner.name), {
      form: "reference",
      id,
      children: [],
      group: owner.group,
      kind: owner.kind,
      name: owner.name,
      role: undefined,
      read: {
        state: "not-read",
        reason: read.reason,
        failures: read.failures,
        namespace: this.#namespace,
        classNamespace: false,
      },
      placement: { by: "kind" },
      namedBy: [],
    });
  }

  // The owner that places an object that no row above places (P7): its controller, else the first of its owners, that
  // is a node of the tree other than the Cluster, or of a kind that cannot be read. Undefined while an owner of a kind
  // still loading may place it, and when none does.
  #ownerOf(
    object: KubeObjectData,
  ):
    | { readonly owner: OwnerName; readonly draft: Draft }
    | { readonly owner: OwnerName; readonly read: Extract<KindRead, { readonly state: "unread" }> }
    | "wait"
    | undefined {
    const owners = ownersOf(object);
    const ordered = [...owners.filter((owner) => owner.controller), ...owners.filter((owner) => !owner.controller)];

    for (const owner of ordered) {
      if (owner.group === CORE && owner.kind === "Cluster" && owner.name === this.#name) continue;

      const draft = this.#draftOfOwner(owner);

      if (draft !== undefined) return { owner, draft };

      const kind = this.#kind(owner.group, owner.kind);

      if (kind === undefined) continue;

      const read = kindReadOf(this.#index, kind, this.#namespace);

      if (read.state === "pending") return "wait";
      if (cannotBeRead(read)) return { owner, read };
    }
    return undefined;
  }

  // The row of the owners (P7): an object of the Cluster that no row above places, under the owner that the tree holds
  // or the row of an owner of a kind that cannot be read. Templates wait for every object that names one to be placed.
  #placeByOwners(templates: boolean): boolean {
    let placed = false;

    for (const entry of this.#candidates()) {
      if (this.#isPlaced(entry) || isTemplateKind(entry.kind.kind) !== templates) continue;

      const found = this.#ownerOf(entry.object);

      if (found === undefined || found === "wait") continue;

      const owner: OwnerName = { group: found.owner.group, kind: found.owner.kind, name: found.owner.name };
      const unread: Unread | undefined =
        "read" in found
          ? {
              state: "not-read",
              reason: found.read.reason,
              failures: found.read.failures,
              namespace: this.#namespace,
              classNamespace: false,
            }
          : undefined;
      const draft = "read" in found ? this.#ownerRow(owner, found.read) : found.draft;
      const placement: Placement =
        unread === undefined
          ? { by: "owner", owner: draft.node.id }
          : { by: "reason", reason: { code: "owner-not-read", owner, unread } };

      if (this.#placeObject(entry, draft, ROW.owner, placement, undefined) !== undefined) placed = true;
    }
    return placed;
  }

  // What the rows of the workers, the references and the owners place, until they place nothing more.
  #settle(): void {
    for (;;) {
      if (this.#placeWorkers() || this.#placeMachineReferences() || this.#placeClaims()) continue;
      if (this.#placeByOwners(false)) continue;
      return;
    }
  }

  // The kinds that can name an object that the Cluster owns, and that could not be read, by their nouns (P7): the
  // control planes, the MachineDeployments, the MachineSets and the MachinePools for a template, the Machines and the
  // MachinePools for any other object.
  #unreadNamersOf(entry: TreeObject): string[] {
    const template = isTemplateKind(entry.kind.kind);
    const controlPlane = contractReferenceOf(fieldsOf(this.#cluster.spec)?.controlPlaneRef);
    const namers = template
      ? [
          ...(controlPlane === undefined ? [] : [kindId(controlPlane.apiGroup, controlPlane.kind)]),
          kindId(CORE, "MachineDeployment"),
          kindId(CORE, "MachineSet"),
          kindId(CORE, "MachinePool"),
        ]
      : [kindId(CORE, "Machine"), kindId(CORE, "MachinePool")];

    return namers.flatMap((id) => {
      const kind = this.#index.kinds.get(id);

      return kind !== undefined && cannotBeRead(kindReadOf(this.#index, kind, this.#namespace)) ? [kind.noun] : [];
    });
  }

  // Other objects (P7): an object of the Cluster that no row places, with its reason, which holds what it owns and
  // names by the same rules. The objects go there one at a time, owners first, and the rows above place again after
  // each, so that an object that the last one controls or names goes under it, never beside it with a false reason. An
  // object whose owner is of a kind still loading waits for it, and so does an object whose owner, or whose Machine or
  // MachinePool that names it, waits.
  #placeOthers(templates: boolean): void {
    // The objects that no row placed, in the order of the rows of P7 that place their kinds, then of their addresses,
    // whatever the order of a store.
    const remaining = this.#candidates()
      .filter((entry) => !this.#isPlaced(entry) && isTemplateKind(entry.kind.kind) === templates)
      .sort((one, other) => one.kind.row - other.kind.row || compareText(addressOfEntry(one), addressOfEntry(other)));
    const above = this.#holdersAmong(remaining);
    const waiting = new Set(remaining.filter((entry) => this.#ownerOf(entry.object) === "wait"));

    for (let grown = true; grown; ) {
      grown = false;
      for (const entry of remaining) {
        if (!waiting.has(entry) && (above.get(entry) ?? []).some((holder) => waiting.has(holder))) {
          waiting.add(entry);
          grown = true;
        }
      }
    }

    const ready = remaining.filter((entry) => !waiting.has(entry));
    const open = (entry: TreeObject) => !this.#isPlaced(entry);

    for (;;) {
      const left = ready.filter(open);
      // An object that another of them would hold goes after that one; of objects that would hold each other, the
      // first in the order above.
      const next = left.find((entry) => !(above.get(entry) ?? []).some((holder) => open(holder))) ?? left[0];

      if (next === undefined) return;
      this.#placeOther(next);
      this.#settle();
    }
  }

  // The objects among these that the rows of P7 would place each of them under, once they are nodes: its owners, and
  // the Machine or the MachinePool whose references name it.
  #holdersAmong(entries: readonly TreeObject[]): Map<TreeObject, TreeObject[]> {
    const byName = new Map(
      entries.map((entry) => [`${kindId(entry.kind.group, entry.kind.kind)}/${entry.name}`, entry]),
    );
    const find = (group: string, kind: string, name: string) => byName.get(`${kindId(group, kind)}/${name}`);
    const above = new Map<TreeObject, TreeObject[]>();
    const add = (entry: TreeObject | undefined, holder: TreeObject) => {
      if (entry !== undefined && entry !== holder) push(above, entry, holder);
    };

    for (const entry of entries) {
      for (const owner of ownersOf(entry.object)) {
        const holder = find(owner.group, owner.kind, owner.name);

        if (holder !== undefined) add(entry, holder);
      }

      const { group, kind } = entry.kind;
      const named =
        group !== CORE
          ? []
          : kind === "Machine"
            ? machineReferencesOf(entry.object)
            : kind === "MachinePool"
              ? templateReferencesOf(entry.object).filter((each) => each.role !== "template")
              : [];

      for (const { reference } of named) add(find(reference.apiGroup, reference.kind, reference.name), entry);
    }
    return above;
  }

  // An object under Other objects, with its reason (P7).
  #placeOther(entry: TreeObject): void {
    const owners = ownersOf(entry.object).filter(
      (owner) => !(owner.group === CORE && owner.kind === "Cluster" && owner.name === this.#name),
    );
    const reason: PlaceReason =
      ownersOf(entry.object).length === 0
        ? { code: "no-owner" }
        : owners.length === 0
          ? { code: "owned-by-cluster", namers: this.#unreadNamersOf(entry) }
          : {
              code: "owners-not-in-tree",
              owners: owners.map(({ group, kind, name }) => ({ group, kind, name })),
            };
    const other = this.#virtual(this.#root, "other-objects", [ROOT_ORDER.other, 0, "", ""]);

    this.#placeObject(entry, other, entry.kind.row, { by: "reason", reason }, undefined);
  }

  // The templates (P7): each once, under the Templates of the highest object of the tree that names it. A control plane
  // that the Cluster does not name, which sits under Other objects, names its machine template after the four namers of
  // P7, so that a template that only it names has a row (SPEC-0005, "Notes and deviations").
  #placeTemplates(): void {
    const namers: { readonly draft: Draft; readonly rank: number; readonly entries: FollowedReference[] }[] = [];

    for (const draft of this.#drafts.values()) {
      const { node } = draft;

      if (node.form !== "object") continue;

      const contract: ContractVersion | undefined = isClusterApiKind(node.group, node.kind)
        ? "v1beta2"
        : node.resolution?.contract;

      if (draft === this.#controlPlane) {
        namers.push({ draft, rank: 0, entries: controlPlaneTemplateOf(node.object, contract) });
      } else if (isControlPlaneNode(node)) {
        namers.push({ draft, rank: 4, entries: controlPlaneTemplateOf(node.object, contract) });
      } else if (node.group === CORE && ["MachineDeployment", "MachineSet", "MachinePool"].includes(node.kind)) {
        const rank = ["MachineDeployment", "MachineSet", "MachinePool"].indexOf(node.kind) + 1;

        namers.push({
          draft,
          rank,
          entries: templateReferencesOf(node.object).filter((entry) => entry.role === "template"),
        });
      }
    }
    namers.sort((one, other) => one.rank - other.rank || compareText(nameOfDraft(one.draft), nameOfDraft(other.draft)));
    for (const { draft, entries } of namers) {
      for (const { reference, field } of entries) {
        const id = addressOf(reference.apiGroup, reference.kind, reference.name);
        const known = this.#drafts.get(id);

        if (known !== undefined) {
          this.#named(known, draft, field);
          continue;
        }

        const templates = this.#virtual(draft, "templates", [ROW.templates, 0, "", ""]);

        this.#placeReference(reference, "template", templates, ROW.template, field, { namer: draft });
      }
    }
  }

  // The ClusterClass of the Cluster, in the namespace that its reference names (P6, P7).
  placeClass(): void {
    const reference = classReferenceOf(this.#cluster);

    if (reference === undefined) return;
    this.#placeReference(
      { apiGroup: CORE, kind: "ClusterClass", name: reference.name },
      undefined,
      this.#root,
      ROW.clusterClass,
      "spec.topology.classRef",
      { namespace: reference.namespace, rootOrder: ROOT_ORDER.clusterClass },
    );
  }

  // Add-ons (P7): the ClusterResourceSets that select the Cluster or that its binding names, each with what it applied
  // to this Cluster, and the binding of the Cluster.
  placeAddOns(): void {
    const sets = this.#kind("addons.cluster.x-k8s.io", "ClusterResourceSet");
    const bindingsKind = this.#kind("addons.cluster.x-k8s.io", "ClusterResourceSetBinding");
    const bindingsRead = kindReadOf(this.#index, bindingsKind, this.#namespace);
    const binding = (bindingsKind?.items ?? []).find(
      (item) => namespaceOf(item) === this.#namespace && textOf(fieldsOf(item.spec)?.clusterName) === this.#name,
    ) as ClusterResourceSetBindingObject | undefined;
    const bound = listOf(fieldsOf(binding?.spec)?.bindings).flatMap((entry) => {
      const name = textOf(fieldsOf(entry)?.clusterResourceSetName);

      return name === undefined ? [] : [{ name, resources: listOf(fieldsOf(entry)?.resources) }];
    });
    const deleting = textOf(fieldsOf(this.#cluster.metadata)?.deletionTimestamp) !== undefined;
    const labels = fieldsOf(this.#cluster.metadata)?.labels;

    for (const set of sets?.items ?? []) {
      if (namespaceOf(set) !== this.#namespace) continue;

      const name = nameOf(set) ?? "";
      const selected = !deleting && selectorSelects(fieldsOf(set.spec)?.clusterSelector, labels);
      const named = bound.find((entry) => entry.name === name);

      if (!selected && named === undefined) continue;

      const addOns = this.#virtual(this.#root, "add-ons", [ROOT_ORDER.addOns, 0, "", ""]);
      const entry = this.#index.byAddress.get(
        scopedAddress("addons.cluster.x-k8s.io", "ClusterResourceSet", this.#namespace, name),
      );
      const draft =
        entry === undefined
          ? undefined
          : this.#placeObject(
              entry,
              addOns,
              ROW.clusterResourceSet,
              selected ? { by: "selector" } : { by: "binding" },
              undefined,
            );

      if (draft === undefined) continue;
      for (const resource of listOf(fieldsOf(set.spec)?.resources)) {
        const kind = textOf(fieldsOf(resource)?.kind) ?? "";
        const resourceName = textOf(fieldsOf(resource)?.name) ?? "";
        const recorded = named?.resources
          .map((each) => fieldsOf(each))
          .find((each) => textOf(each?.kind) === kind && textOf(each?.name) === resourceName);
        const state: EntryNode["state"] =
          bindingsRead.state === "pending"
            ? "pending"
            : bindingsRead.state === "unread"
              ? "not-read"
              : recorded === undefined
                ? "missing"
                : recorded.applied === true
                  ? "applied"
                  : "not applied";

        this.#add(draft, [ROW.entry, 0, kind, resourceName], {
          form: "entry",
          id: `entry:${name}:${kind}/${resourceName}`,
          children: [],
          clusterResourceSet: name,
          kind,
          name: resourceName,
          state,
          lastAppliedTime: state === "applied" ? textOf(recorded?.lastAppliedTime) : undefined,
          unread:
            bindingsRead.state === "unread"
              ? {
                  state: "not-read",
                  reason: bindingsRead.reason,
                  failures: bindingsRead.failures,
                  namespace: this.#namespace,
                  classNamespace: false,
                }
              : undefined,
        });
      }
    }

    const bindingEntry =
      binding === undefined
        ? undefined
        : this.#index.byAddress.get(
            scopedAddress(
              "addons.cluster.x-k8s.io",
              "ClusterResourceSetBinding",
              this.#namespace,
              nameOf(binding) ?? "",
            ),
          );

    if (bindingEntry !== undefined) {
      this.#placeObject(
        bindingEntry,
        this.#virtual(this.#root, "add-ons", [ROOT_ORDER.addOns, 0, "", ""]),
        ROW.binding,
        { by: "cluster-name" },
        undefined,
      );
    }
  }

  // Health checks (P7): the MachineHealthChecks of the Cluster.
  placeHealthChecks(): void {
    for (const entry of this.#kind(CORE, "MachineHealthCheck")?.items ?? []) {
      const tree = this.#index.byAddress.get(
        scopedAddress(CORE, "MachineHealthCheck", namespaceOf(entry) ?? "", nameOf(entry) ?? ""),
      );

      if (
        tree === undefined ||
        tree.namespace !== this.#namespace ||
        textOf(fieldsOf(entry.spec)?.clusterName) !== this.#name
      ) {
        continue;
      }
      this.#placeObject(
        tree,
        this.#virtual(this.#root, "health-checks", [ROOT_ORDER.healthChecks, 0, "", ""]),
        ROW.healthCheck,
        { by: "cluster-name" },
        undefined,
      );
    }
  }

  // The node of each kind that cannot be read (P12), under the Cluster, in the order of the rows of P7 and, within one
  // row, of their nouns: a kind refused, failed or held back in its namespace, and a kind of a provider whose
  // definition cannot be read. The Clusters are no such node: without them there is no tree.
  placeKinds(): void {
    for (const [id, kind] of this.#index.kinds) {
      const namespace = kind.where === "class" ? this.#classNamespace : this.#namespace;

      if (namespace === undefined) continue;

      const read = kindReadOf(this.#index, kind, namespace);

      if (!cannotBeRead(read)) continue;

      const definition = read.reason === "definition-refused" || read.reason === "definition-failed";

      this.#add(this.#root, [ROOT_ORDER.kind, kind.row, kind.noun, ""], {
        form: "kind",
        id: `kind:${id}`,
        children: [],
        group: kind.group,
        kind: kind.kind,
        noun: kind.noun,
        unread: {
          state: "not-read",
          reason: read.reason,
          failures: read.failures,
          namespace,
          classNamespace: kind.where === "class" && namespace !== this.#namespace,
        },
        definition,
        namesProviderKinds: NAMERS_OF_PROVIDER_KINDS.has(id) || kind.roles.includes("control-plane"),
      });
    }
  }

  // The tree, with the children of every node in the order of P14.
  build(): ClusterTree {
    this.placeKinds();
    this.placeClusterReferences();
    this.placeClass();
    this.placeAddOns();
    this.placeHealthChecks();
    this.#settle();
    this.#placeOthers(false);
    this.#placeTemplates();
    this.#placeByOwners(true);
    this.#placeOthers(true);

    const parents = new Map<string, string>();
    const nodes = new Map<string, TreeNode>();
    const freeze = (draft: Draft): TreeNode => {
      const children = [...draft.children].sort(compareDrafts).map((child) => {
        parents.set(child.node.id, draft.node.id);
        return freeze(child);
      });
      const node =
        draft.node.form === "object" || draft.node.form === "reference"
          ? ({ ...draft.node, children, namedBy: [...draft.namedBy] } as TreeNode)
          : ({ ...draft.node, children } as TreeNode);

      nodes.set(node.id, node);
      return node;
    };
    const root = freeze(this.#root) as ObjectNode;

    return { root, nodes, parents, classNamespace: this.#classNamespace };
  }
}

function nameOfDraft(draft: Draft): string {
  return "name" in draft.node ? draft.node.name : draft.node.id;
}

// Text in the order of its characters, the same in every locale.
export function compareText(one: string, other: string): number {
  return one < other ? -1 : one > other ? 1 : 0;
}

function compareDrafts(one: Draft, other: Draft): number {
  for (let at = 0; at < one.order.length; at++) {
    const [left, right] = [one.order[at], other.order[at]];
    const order = typeof left === "number" ? left - (right as number) : compareText(left, right as string);

    if (order !== 0) return order;
  }
  return compareText(one.node.id, other.node.id);
}

// The tree of the Cluster of a namespace and a name, from the indexes of what the reads give; the state of the view of
// that Cluster when the tree has no root.
export function buildTree(index: TreeIndex, namespace: string, name: string): TreeOutcome {
  const view = clusterViewOf(index.objects.reads, index.clusters, namespace, name);

  if (view.state !== "found") return view;
  return { state: "found", tree: new Placer(index, view.cluster).build() };
}

// The statuses (P11, P13, P16)

// The status of an object of the tree, as the model returns it with the context of its kind, and the key of SPEC-0003
// under which it is kept; pending while an input of its model still loads, when its marks show the spinner.
export interface NodeStatus {
  readonly status: ObjectStatus;
  readonly context: StatusContext;
  readonly key: string;
  readonly pending: boolean;
}

// The status of every object of the tree (SPEC-0003, "What it takes and returns", "How a view uses it"): the Cluster
// with the context of a Cluster that the list and the details give it, and every other object with its Cluster, the
// MachineHealthChecks of its namespace and the controllers that the Cluster takes, and the inputs of its kind: the
// Machines that it controls, those of its MachineSets for a MachineDeployment, those that its targets name for a
// MachineHealthCheck, the one that owns it for a bootstrap config or an infrastructure machine; the bindings of the
// namespace with their Clusters for a ClusterResourceSet; and the role, the contract and the provider of an object of a
// provider. The class and the ClusterResourceSets, which other Clusters share, take no Cluster.
export function evaluateTree(
  tree: ClusterTree,
  index: TreeIndex,
  now: number,
  memo: StatusMemo,
): ReadonlyMap<string, NodeStatus> {
  const statuses = new Map<string, NodeStatus>();
  const cluster = tree.root.object as ClusterObject;
  const namespace = namespaceOf(cluster) ?? "";
  const clusterContext = clusterContextOf(index.context, cluster, now, memo);
  const { inputs } = clusterContext;
  const controllers = index.context.controllers;
  const base: StatusContext = {
    now,
    ...(clusterContext.context.healthChecks === undefined ? {} : { healthChecks: clusterContext.context.healthChecks }),
    ...(clusterContext.context.controllers === undefined ? {} : { controllers: clusterContext.context.controllers }),
  };
  const sharedPending = inputs.healthChecks === "pending" || inputs.controllers === "pending";
  const machinesState = inputStateOf(index.objects.reads, index.objects.machines.key, namespace);
  const setsState = inputStateOf(index.objects.reads, index.objects.machineSets.key, namespace);
  const bindingsKind = index.kinds.get(kindId("addons.cluster.x-k8s.io", "ClusterResourceSetBinding"));
  const bindingsState = inputStateOf(index.objects.reads, bindingsKind?.key, namespace);
  const machinesGiven = machinesState === "given" || machinesState === "not-served";

  statuses.set(tree.root.id, {
    status: memo.status(cluster, clusterContext.context, clusterContext.key),
    context: clusterContext.context,
    key: clusterContext.key,
    pending: clusterContext.pending,
  });

  const controlled = (object: KubeObjectData, group: string): readonly MachineObject[] =>
    index.context.machinesByController.get(
      `${namespace}/${group}/${textOf(object.kind) ?? ""}/${nameOf(object) ?? ""}`,
    ) ?? [];
  const machinesOf = (node: ObjectNode): { machines?: readonly MachineObject[]; pending: boolean } => {
    const pending = machinesState === "pending";
    const given = (machines: readonly MachineObject[]) => (machinesGiven ? { machines, pending } : { pending });

    switch (node.kind) {
      case "MachineSet":
      case "MachinePool":
        return given(controlled(node.object, node.group));
      case "MachineDeployment": {
        if (setsState === "pending") return { pending: true };
        if (setsState !== "given" && setsState !== "not-served") return { pending };

        const sets =
          index.context.machineSetsByController.get(`${namespace}/${CORE}/MachineDeployment/${node.name}`) ?? [];

        return given(sets.flatMap((set) => controlled(set, CORE)));
      }
      case "MachineHealthCheck": {
        const targets = listOf(fieldsOf(node.object.status)?.targets).filter((target) => typeof target === "string");
        const machines = (index.kinds.get(kindId(CORE, "Machine"))?.items ?? []).filter(
          (machine) => namespaceOf(machine) === namespace && targets.includes(nameOf(machine) ?? ""),
        ) as MachineObject[];

        return given(machines);
      }
      default:
        break;
    }
    if (node === tree.root) return { pending: false };
    // A control plane, of a provider or not, and the Machines it controls.
    if (node.placement.by === "reference" && node.placement.field === "spec.controlPlaneRef") {
      return given(controlled(node.object, node.group));
    }
    // A bootstrap config or an infrastructure machine, and the Machine that owns it.
    if (node.kind === "KubeadmConfig" || node.role === "bootstrap-config" || node.role === "infrastructure-machine") {
      const owner = ownersOf(node.object).find((each) => each.group === CORE && each.kind === "Machine");
      const machine =
        owner === undefined ? undefined : index.byAddress.get(scopedAddress(CORE, "Machine", namespace, owner.name));

      return given(machine === undefined ? [] : [machine.object as MachineObject]);
    }
    return { pending: false };
  };
  const bindingsOf = (): readonly BindingInput[] | undefined => {
    if (bindingsState !== "given") return undefined;

    const clusters = index.clusters.items.filter((item) => namespaceOf(item) === namespace);

    return (bindingsKind?.items ?? [])
      .filter((binding) => namespaceOf(binding) === namespace)
      .map((binding) => {
        const owner = clusters.find((item) => nameOf(item) === textOf(fieldsOf(binding.spec)?.clusterName));

        return {
          binding: binding as ClusterResourceSetBindingObject,
          ...(owner === undefined ? {} : { cluster: owner }),
        };
      });
  };

  for (const node of tree.nodes.values()) {
    if (node.form !== "object" || node === tree.root) continue;

    const shared = node.kind === "ClusterClass" || node.kind === "ClusterResourceSet";
    const { machines, pending } = machinesOf(node);
    const bindings = node.kind === "ClusterResourceSet" ? bindingsOf() : undefined;
    const resolution = node.resolution;
    const context: StatusContext = {
      ...base,
      ...(shared ? {} : { cluster }),
      ...(machines === undefined ? {} : { machines }),
      ...(bindings === undefined ? {} : { bindings }),
      ...(node.role === undefined ? {} : { role: node.role }),
      ...(resolution === undefined ? {} : { contract: resolution.contract }),
      ...(resolution?.provider === undefined ? {} : { provider: resolution.provider }),
      ...(node.placement.by === "reference" && node.placement.field === "spec.controlPlaneRef"
        ? controlPlaneContextOf(index, node)
        : {}),
    };
    const key = contextKeyOf(node.object, context, controllers.version);

    statuses.set(node.id, {
      status: memo.status(node.object, context, key),
      context,
      key,
      pending: pending || sharedPending || (node.kind === "ClusterResourceSet" && bindingsState === "pending"),
    });
  }
  return statuses;
}

// The role, the contract and the provider that the context of a Cluster gives its control plane, from the resolution of
// its reference (SPEC-0004, P3), so that the node and the part of the Cluster share one result.
function controlPlaneContextOf(index: TreeIndex, node: ObjectNode): Partial<StatusContext> {
  const resolution = index.objects.controlPlanes.get(kindId(node.group, node.kind))?.resolution;

  return resolution?.state === "resolved"
    ? {
        role: "control-plane",
        contract: resolution.contract,
        ...(resolution.provider === undefined ? {} : { provider: resolution.provider }),
      }
    : {};
}

// Whether an object is paused by its own annotation `cluster.x-k8s.io/paused`, by its presence (SPEC-0003, P19).
export function pausedByAnnotation(object: KubeObjectData): boolean {
  const annotations = fieldsOf(fieldsOf(object.metadata)?.annotations);

  return annotations !== undefined && Object.hasOwn(annotations, PAUSED_ANNOTATION);
}

// The words of P12

// The reason why the tree cannot read an object, or does not find it, in the words of SPEC-0004, the namespace named:
// that of the Cluster, or that of its class, which its reference names.
function reasonWords(unread: Unread): string {
  if (unread.classNamespace && unread.reason === "kind-not-read") {
    return `Its kind could not be read in the namespace ${unread.namespace}, which the class reference of the Cluster names.`;
  }
  if (unread.classNamespace && unread.reason === "not-found") {
    return `No such object is in the namespace ${unread.namespace}, which the class reference of the Cluster names.`;
  }
  return UNREAD_WORDS[unread.reason];
}

// What a node that cannot be read says (P12): "Not read." and its reason, or the reason alone for an object that its
// namespace, which was read, does not hold.
export function unreadWords(unread: Unread): string {
  return unread.state === "not-found" ? reasonWords(unread) : `Not read. ${reasonWords(unread)}`;
}

// What the node of a kind that cannot be read says (P12): "Not read." and its reason; then, for a kind whose objects
// name the kinds of the providers that the tree reads, that the objects that only that kind names are not read either;
// and, for a kind of a provider whose definition cannot be read, that its objects are not shown.
export function kindWords(node: KindNode): string {
  return [
    unreadWords(node.unread),
    ...(node.definition ? ["Its objects are not shown, since they are never read."] : []),
    ...(node.namesProviderKinds
      ? [
          `The objects that only the ${node.noun} name are not read either, since the tree learns their kinds from them.`,
        ]
      : []),
  ].join(" ");
}

// Built once for each change

// The indexes and the tree of one Cluster, built again only when what they read changes: the state of the reads, the
// key, the identity and the version of every object of every kind, how each reference resolves, and the Clusters; never
// at a render or a tick that changes none of them (P16).
export class TreeBuilds {
  // The number of indexes and trees built, which the tests count.
  built = 0;
  #last:
    | {
        readonly reads: ReadsState;
        readonly versions: string;
        readonly address: string;
        readonly index: TreeIndex;
        readonly outcome: TreeOutcome;
      }
    | undefined;

  treeOf(
    clusters: KindObjects<ClusterObject>,
    objects: ContextObjects,
    namespace: string,
    name: string,
  ): { readonly index: TreeIndex; readonly outcome: TreeOutcome } {
    const versions = `${clusters.key ?? "-"}:${clusters.items.map(versionOf).join(",")}|${contextVersions(objects)}`;
    const address = `${namespace}/${name}`;
    const last = this.#last;

    if (last !== undefined && last.reads === objects.reads && last.versions === versions && last.address === address) {
      return { index: last.index, outcome: last.outcome };
    }

    const index = indexTree(clusters, objects);
    const outcome = buildTree(index, namespace, name);

    this.built++;
    this.#last = { reads: objects.reads, versions, address, index, outcome };
    return { index, outcome };
  }
}
