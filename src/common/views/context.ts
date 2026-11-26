/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The context of the status model for each Cluster of a list or of a view of one Cluster (SPEC-0003, "What it takes and
// returns"; SPEC-0004, "What the view reads", P2, P17, P19, P31), built from the objects of the stores that the view
// reads, through indexes made once for each change of the stores and never row by row (kit, `docs/design.md`,
// "Interaction and performance"):
//
// - `machines`: the Machines labelled with the name of the Cluster, in its namespace;
// - `parts`: the result of `statusOf` for its control plane, found by its reference at the version that the contract
//   of its definition gives (P3), and for each of its MachineDeployments, found by the label
//   `cluster.x-k8s.io/cluster-name` in its namespace (SPEC-0001, A13);
// - `machinePools`: the result of `statusOf` for each of its MachinePools, by the same label;
// - `clusterClass`: its class, by `spec.topology.classRef`, in the namespace of the Cluster when the reference names
//   none (SPEC-0001, R3.12), when the Cluster declares no gates of its own;
// - `healthChecks`: the MachineHealthChecks of its namespace;
// - `controllers`: the availability of the controller of each provider, from the `Ready` of the objects of the
//   Cluster API Operator in the namespaces read (SPEC-0003, P24; P2).
//
// The Machines of a part are those it controls, found by the owner reference and never by a label whose value can
// be a hash (SPEC-0001, R3.6): those of the MachineSets that a MachineDeployment controls, for a MachineDeployment.
//
// The details of a Cluster show its parts, each with what the model computes for it (P17): its control plane, or the
// control plane Machines of its own when it names none (SPEC-0001, R3.7); its MachineDeployments and MachinePools; the
// MachineSets and the worker Machines that it owns, which it counts as the project does, by the label of its name and
// an owner reference to it (core/reconcilers/cluster/cluster_controller.go:584-622;
// core/reconcilers/cluster/cluster_controller_status.go:259-300); and its infrastructure cluster, found by its
// reference at the version of its contract, with the role that the reference gives it (SPEC-0003, "Objects of a
// provider").
//
// A store gives the objects of the namespaces that it has loaded alone (P19): an object that it still holds in a
// namespace that the filter no longer selects, or in one that it has not loaded yet, is not in the context. An input
// whose namespace is not loaded yet is not given, and the marks that need it show the spinner; one that the page holds
// back after a failure (P25), one in a namespace that the filter does not select (P2), and one that the view cannot
// resolve, are not given either, and the model notes them. An input is never given empty in place of one not read.

import { conditionsOf, statusOf } from "../status/index";
import { fieldsOf, labelOf, listOf, nameOf, namespaceOf, ownersOf, textOf, versionOf } from "./objects";
import { namespaceRead } from "./read-state";
import { classReferenceOf, contractReferenceOf } from "./references";

import type {
  ClusterClassObject,
  ClusterObject,
  ClusterResourceSetBindingObject,
  ClusterResourceSetObject,
  ConditionsResult,
  ContextInput,
  ControllerAvailability,
  IPAddressClaimObject,
  KubeadmConfigObject,
  KubeadmControlPlaneObject,
  KubeObjectData,
  MachineDeploymentObject,
  MachineHealthCheckObject,
  MachineObject,
  MachinePoolObject,
  MachineSetObject,
  ObjectStatus,
  OperatorProviderObject,
  StatusContext,
} from "../status/index";
import type { NamespaceRead, ReadsState } from "./read-state";
import type { ResolvedReference } from "./references";

// The label that names the Cluster of an object (SPEC-0001, A13).
export const CLUSTER_NAME_LABEL = "cluster.x-k8s.io/cluster-name";

// The objects of a kind that the page reads: the key under which the reads of the page follow its store, undefined
// when the cluster does not serve the kind, and the items of the store, in every namespace that it holds.
export interface KindObjects<T extends KubeObjectData = KubeObjectData> {
  readonly key: string | undefined;
  readonly items: readonly T[];
}

// The objects of a kind of a provider that the references of the Clusters name, a control plane or an infrastructure
// cluster, with the resolution of those references to the version of their contract (P3).
export interface ProviderKindObjects extends KindObjects {
  readonly resolution: ResolvedReference;
}

export type ControlPlaneObjects = ProviderKindObjects;

// The objects of the kinds that the tree of a Cluster reads beside those of the context (SPEC-0005, P6), which no other
// view reads.
export interface TreeKindObjects {
  // The KubeadmControlPlanes of the namespace, which the context takes from the reference of each Cluster alone.
  readonly kubeadmControlPlanes: KindObjects<KubeadmControlPlaneObject>;
  readonly kubeadmConfigs: KindObjects<KubeadmConfigObject>;
  readonly kubeadmConfigTemplates: KindObjects;
  readonly clusterResourceSets: KindObjects<ClusterResourceSetObject>;
  readonly clusterResourceSetBindings: KindObjects<ClusterResourceSetBindingObject>;
  readonly ipAddressClaims: KindObjects<IPAddressClaimObject>;
  readonly ipAddresses: KindObjects;
  // The kinds of a provider that the references that the tree follows name, beside those of the Cluster, by
  // `group/kind`: its infrastructure machines and machine pools, the bootstrap configs of a provider and the templates.
  readonly providers: ReadonlyMap<string, ProviderKindObjects>;
}

export interface ContextObjects {
  readonly reads: ReadsState;
  readonly machines: KindObjects<MachineObject>;
  readonly machineSets: KindObjects<MachineSetObject>;
  readonly machineDeployments: KindObjects<MachineDeploymentObject>;
  readonly machinePools: KindObjects<MachinePoolObject>;
  readonly healthChecks: KindObjects<MachineHealthCheckObject>;
  readonly clusterClasses: KindObjects<ClusterClassObject>;
  // Every kind of the operator; one that the cluster does not serve has no key. A view of one Cluster reads none, and
  // gives none (SPEC-0004, P31).
  readonly operator?: readonly KindObjects<OperatorProviderObject>[];
  // The kinds of control plane that the references of the Clusters name, by `group/kind`.
  readonly controlPlanes: ReadonlyMap<string, ControlPlaneObjects>;
  // The kinds of infrastructure cluster that the references of the Clusters name, by `group/kind`, which the details
  // read (SPEC-0004, "What the view reads").
  readonly infrastructures?: ReadonlyMap<string, ProviderKindObjects>;
  // The kinds that the tree adds, for a view of the tree alone (SPEC-0005, P6).
  readonly tree?: TreeKindObjects;
}

// How an input of the context of a Cluster was given.
export type InputState =
  | "given"
  // Its namespace is not loaded yet: the marks that need it show the spinner.
  | "pending"
  // The page holds it back after a failure (P25).
  | "held"
  // The page does not read it: its namespace is not selected (P2), the reference that names it cannot be resolved,
  // or its object does not exist.
  | "not-read";

type IndexedInput = Exclude<ContextInput, "now" | "cluster" | "bindings" | "role" | "contract" | "provider">;

export interface ClusterContext {
  readonly context: StatusContext;
  readonly inputs: Readonly<Partial<Record<IndexedInput, InputState>>>;
  // An input is not loaded yet: the marks that need it show the spinner, never a mark computed without it.
  readonly pending: boolean;
  // The `uid` and `resourceVersion` of the Cluster and of every object of its context, the version of
  // `controllers`, and how each input was given (SPEC-0003, "How a view uses it").
  readonly key: string;
  // The parts behind `parts` and `machinePools`, with their objects, or how they are not given (P17).
  readonly parts: {
    readonly controlPlane: Part | InputState | undefined;
    readonly machineDeployments: readonly Part[] | InputState;
    readonly machinePools: readonly Part[] | InputState;
  };
}

interface Controllers {
  readonly state: "given" | "pending" | "held" | "not-read";
  readonly record: Readonly<Record<string, ControllerAvailability>>;
  readonly version: string;
}

export interface ContextIndex {
  readonly objects: ContextObjects;
  readonly machinesByCluster: ReadonlyMap<string, readonly MachineObject[]>;
  readonly machinesByController: ReadonlyMap<string, readonly MachineObject[]>;
  readonly machineSetsByController: ReadonlyMap<string, readonly MachineSetObject[]>;
  readonly machineSetsByCluster: ReadonlyMap<string, readonly MachineSetObject[]>;
  readonly deploymentsByCluster: ReadonlyMap<string, readonly MachineDeploymentObject[]>;
  readonly poolsByCluster: ReadonlyMap<string, readonly MachinePoolObject[]>;
  readonly checksByNamespace: ReadonlyMap<string, readonly MachineHealthCheckObject[]>;
  readonly classes: ReadonlyMap<string, ClusterClassObject>;
  readonly controlPlanes: ReadonlyMap<string, ReadonlyMap<string, KubeObjectData>>;
  readonly infrastructures: ReadonlyMap<string, ReadonlyMap<string, KubeObjectData>>;
  readonly controllers: Controllers;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);

  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function scoped(namespace: string | undefined, ...parts: string[]): string {
  return [namespace ?? "", ...parts].join("/");
}

// The objects of a kind in the namespaces whose read is done, the others left out (P19).
function readItems<T extends KubeObjectData>(reads: ReadsState, objects: KindObjects<T>): T[] {
  const { key } = objects;

  if (key === undefined) return [];

  const states = new Map<string, NamespaceRead["state"]>();

  return objects.items.filter((item) => {
    const namespace = namespaceOf(item) ?? "";
    let state = states.get(namespace);

    if (state === undefined) {
      state = namespaceRead(reads, key, namespace).state;
      states.set(namespace, state);
    }
    return state === "read";
  });
}

// The objects that an owner controls, by the owner reference with `controller` set.
function byController<T extends KubeObjectData>(items: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();

  for (const item of items) {
    for (const owner of ownersOf(item)) {
      if (owner.controller) push(index, scoped(namespaceOf(item), owner.group, owner.kind, owner.name), item);
    }
  }
  return index;
}

function byClusterLabel<T extends KubeObjectData>(items: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();

  for (const item of items) {
    const cluster = labelOf(item, CLUSTER_NAME_LABEL);

    if (cluster !== undefined) push(index, scoped(namespaceOf(item), cluster), item);
  }
  return index;
}

// The manifest label of the provider of an object of the operator: its name, with the prefix of the type that its
// kind gives (SPEC-0003, P24; cmd/clusterctl/api/v1alpha3/labels.go:45-62).
const MANIFEST_PREFIXES: Readonly<Record<string, string>> = {
  CoreProvider: "",
  BootstrapProvider: "bootstrap-",
  ControlPlaneProvider: "control-plane-",
  InfrastructureProvider: "infrastructure-",
  IPAMProvider: "ipam-",
  RuntimeExtensionProvider: "runtime-extension-",
  AddonProvider: "addon-",
};

function availabilityOf(object: OperatorProviderObject): ControllerAvailability {
  const ready = listOf(fieldsOf(object.status)?.conditions)
    .map((entry) => fieldsOf(entry))
    .find((condition) => condition?.type === "Ready");
  const status = textOf(ready?.status);
  const since = textOf(ready?.lastTransitionTime);

  return { available: status === "True" ? true : status === "False" ? false : "unknown", since };
}

// The availability of each controller, from the objects of the operator in the namespaces read. A kind of the operator
// whose namespaces of the filter are not all loaded yet leaves `controllers` not given yet; one that the page holds
// back gives nothing, and the model notes the controllers it does not know. Two objects of one provider that disagree
// leave its availability unknown. With no kind of the operator read, as for a view of one Cluster, `controllers` is
// not given, and the model notes it as not read (SPEC-0004, P31).
function controllersOf(objects: ContextObjects): Controllers {
  const { reads, operator } = objects;
  const filter = reads.filter?.namespaces ?? [];
  const record: Record<string, ControllerAvailability> = {};
  const versions: string[] = [];
  let state: Controllers["state"] = "given";

  if (operator === undefined) return { state: "not-read", record, version: "not-read" };
  for (const kind of operator) {
    if (kind.key === undefined) continue;

    const key = kind.key;
    const states = filter.map((namespace) => namespaceRead(reads, key, namespace).state);

    if (reads.filter === undefined || states.includes("pending")) return { state: "pending", record: {}, version: "" };
    if (states.includes("held")) {
      state = "held";
      continue;
    }
    for (const item of readItems(reads, kind)) {
      const name = nameOf(item);
      const prefix = MANIFEST_PREFIXES[textOf(item.kind) ?? ""];

      if (name === undefined || prefix === undefined) continue;

      const provider = `${prefix}${name}`;
      const availability = availabilityOf(item);
      const earlier = record[provider];

      record[provider] =
        earlier === undefined || earlier.available === availability.available
          ? (earlier ?? availability)
          : { available: "unknown" };
      versions.push(versionOf(item));
    }
  }
  return { state, record, version: versions.sort().join(",") };
}

// The objects of the kinds of a provider that the references name, by kind and by their namespace and name.
function byKindAndName(
  reads: ReadsState,
  kinds: ReadonlyMap<string, ProviderKindObjects>,
): Map<string, Map<string, KubeObjectData>> {
  const index = new Map<string, Map<string, KubeObjectData>>();

  for (const [kind, objects] of kinds) {
    const byName = new Map<string, KubeObjectData>();

    for (const item of readItems(reads, objects)) byName.set(scoped(namespaceOf(item), nameOf(item) ?? ""), item);
    index.set(kind, byName);
  }
  return index;
}

// The indexes of the context, built once for each change of the stores that the page reads.
export function indexContext(objects: ContextObjects): ContextIndex {
  const { reads } = objects;
  const machines = readItems(reads, objects.machines);
  const machineSets = readItems(reads, objects.machineSets);
  const controlPlanes = byKindAndName(reads, objects.controlPlanes);

  const checksByNamespace = new Map<string, MachineHealthCheckObject[]>();

  for (const check of readItems(reads, objects.healthChecks)) push(checksByNamespace, namespaceOf(check) ?? "", check);

  const classes = new Map<string, ClusterClassObject>();

  for (const item of readItems(reads, objects.clusterClasses)) {
    classes.set(scoped(namespaceOf(item), nameOf(item) ?? ""), item);
  }

  return {
    objects,
    machinesByCluster: byClusterLabel(machines),
    machinesByController: byController(machines),
    machineSetsByController: byController(machineSets),
    machineSetsByCluster: byClusterLabel(machineSets),
    deploymentsByCluster: byClusterLabel(readItems(reads, objects.machineDeployments)),
    poolsByCluster: byClusterLabel(readItems(reads, objects.machinePools)),
    checksByNamespace,
    classes,
    controlPlanes,
    infrastructures: byKindAndName(reads, objects.infrastructures ?? new Map()),
    controllers: controllersOf(objects),
  };
}

// What the indexes of the context read of the stores, as one text: the key, the identity and the version of every
// object of each kind, and how each reference of a control plane or of an infrastructure cluster resolves. A view
// builds the indexes again when this text or the state of the reads changes, and for nothing else; the arrays of the
// stores are no key, since the host changes them in place (AGENTS.md, "Rules That Fail Silently").
export function contextVersions(objects: ContextObjects): string {
  const infrastructures = objects.infrastructures ?? new Map<string, ProviderKindObjects>();
  const { tree } = objects;
  const providers = tree?.providers ?? new Map<string, ProviderKindObjects>();
  const kinds: readonly KindObjects[] = [
    objects.machines,
    objects.machineSets,
    objects.machineDeployments,
    objects.machinePools,
    objects.healthChecks,
    objects.clusterClasses,
    ...(objects.operator ?? []),
    ...objects.controlPlanes.values(),
    ...infrastructures.values(),
    ...(tree === undefined
      ? []
      : [
          tree.kubeadmControlPlanes,
          tree.kubeadmConfigs,
          tree.kubeadmConfigTemplates,
          tree.clusterResourceSets,
          tree.clusterResourceSetBindings,
          tree.ipAddressClaims,
          tree.ipAddresses,
          ...providers.values(),
        ]),
  ];
  const resolutions = [...objects.controlPlanes, ...infrastructures, ...providers].map(
    ([id, kind]) => `${id}=${JSON.stringify(kind.resolution)}`,
  );

  return [...kinds.map((kind) => `${kind.key ?? "-"}:${kind.items.map(versionOf).join(",")}`), ...resolutions].join(
    "|",
  );
}

// The results of the model for the objects of a list, kept while the key of each and the time that it names hold: a
// result is computed again when the `uid` or the `resourceVersion` of the object or of an object of its context
// changes, when the version of `controllers` changes, or once the time that the result names has come (SPEC-0003,
// "How a view uses it"), and for nothing else.
export class StatusMemo {
  #entries = new Map<string, { key: string; status: ObjectStatus; conditions?: ConditionsResult }>();
  #used = new Set<string>();

  // The number of results computed, which the tests count.
  computed = 0;

  #idOf(object: KubeObjectData): string {
    const id = versionOf(object);

    return id.slice(0, id.lastIndexOf("@"));
  }

  #valid(id: string, key: string, now: number) {
    const entry = this.#entries.get(id);

    this.#used.add(id);
    if (entry === undefined || entry.key !== key) return undefined;
    return entry.status.changesAt === undefined || now < entry.status.changesAt ? entry : undefined;
  }

  status(object: KubeObjectData, context: StatusContext, key: string): ObjectStatus {
    const id = this.#idOf(object);
    const entry = this.#valid(id, key, context.now);

    if (entry !== undefined) return entry.status;

    const status = statusOf(object, context);

    this.computed++;
    this.#entries.set(id, { key, status });
    return status;
  }

  // The conditions of an object, with the status of the same key.
  conditions(object: KubeObjectData, context: StatusContext, key: string): ConditionsResult {
    const id = this.#idOf(object);
    const entry = this.#valid(id, key, context.now) ?? { key, status: this.status(object, context, key) };

    if (entry.conditions !== undefined) return entry.conditions;

    const conditions = conditionsOf(object, context);

    this.#entries.set(id, { ...entry, conditions });
    return conditions;
  }

  // Leaves out the results of the objects that no evaluation used since the last sweep: those that the list no longer
  // shows.
  sweep(): void {
    this.#entries = new Map([...this.#entries].filter(([id]) => this.#used.has(id)));
    this.#used = new Set();
  }
}

// What a Cluster takes from a kind in its namespace: its objects when the read is done, else how it is not given.
function stateOf(reads: ReadsState, key: string | undefined, namespace: string): InputState | "not-served" {
  if (key === undefined) return "not-served";

  const read = namespaceRead(reads, key, namespace).state;

  return read === "read" ? "given" : read === "outside" ? "not-read" : read;
}

class ContextBuilder {
  readonly inputs: Partial<Record<IndexedInput, InputState>> = {};
  readonly versions: string[] = [];
  pending = false;

  constructor(
    readonly index: ContextIndex,
    readonly cluster: ClusterObject,
    readonly now: number,
    readonly memo: StatusMemo,
  ) {
    this.versions.push(versionOf(cluster));
  }

  get namespace(): string {
    return namespaceOf(this.cluster) ?? "";
  }

  mark(input: IndexedInput, state: InputState): void {
    const earlier = this.inputs[input];

    // An input given from several kinds takes the state of the one that gives least.
    if (earlier === undefined || earlier === "given" || state === "pending") this.inputs[input] = state;
    if (state === "pending") this.pending = true;
  }

  record(objects: readonly KubeObjectData[]): void {
    for (const object of objects) this.versions.push(versionOf(object));
  }

  // The Machines that an owner controls, or how they are not given.
  machinesOf(owner: KubeObjectData, group: string): readonly MachineObject[] | InputState {
    const state = stateOf(this.index.objects.reads, this.index.objects.machines.key, this.namespace);

    if (state === "not-served") return [];
    if (state !== "given") return state;

    const machines =
      this.index.machinesByController.get(
        scoped(this.namespace, group, textOf(owner.kind) ?? "", nameOf(owner) ?? ""),
      ) ?? [];

    this.record(machines);
    return machines;
  }

  // The context of a part of the Cluster: its Cluster, its Machines and what the Cluster has.
  partContext(machines: readonly MachineObject[] | InputState, base: StatusContext): StatusContext {
    return {
      ...base,
      cluster: this.cluster,
      ...(typeof machines === "string" ? {} : { machines }),
    };
  }

  // The key of the result of a part: the versions of the part and of every object of its context.
  partKey(object: KubeObjectData, context: StatusContext): string {
    return [
      versionOf(object),
      versionOf(this.cluster),
      ...(context.machines ?? []).map(versionOf),
      ...(context.healthChecks ?? []).map(versionOf),
      context.machines === undefined ? "machines:-" : "",
      this.index.controllers.version,
      context.role ?? "",
      context.contract ?? "",
      context.provider ?? "",
    ].join("|");
  }

  partStatus(object: KubeObjectData, context: StatusContext): ObjectStatus {
    return this.memo.status(object, context, this.partKey(object, context));
  }

  // A part of the Cluster: the object, what the model computes for it, and whether its Machines are still loading.
  part(object: KubeObjectData, context: StatusContext, machines?: readonly MachineObject[] | InputState): Part {
    return { object, status: this.partStatus(object, context), pending: machines === "pending" };
  }
}

// A part of a Cluster, as its details show it (P17): the object, what the model computes for it, and whether an input
// of its model is not loaded yet, which shows the spinner in the place of its marks.
export interface Part {
  readonly object: KubeObjectData;
  readonly status: ObjectStatus;
  readonly pending: boolean;
}

function controlPlaneOf(builder: ContextBuilder, base: StatusContext): Part | InputState | undefined {
  const { index, cluster, namespace } = builder;
  const reference = contractReferenceOf(fieldsOf(cluster.spec)?.controlPlaneRef);

  // A Cluster with no control plane of a provider has control plane Machines of its own (SPEC-0001, R3.7).
  if (reference === undefined) return undefined;

  const objects = index.objects.controlPlanes.get(`${reference.apiGroup}/${reference.kind}`);
  const resolution = objects?.resolution;

  if (objects === undefined || resolution === undefined || resolution.state === "pending") return "pending";
  if (resolution.state === "unresolved") return "not-read";

  const state = stateOf(index.objects.reads, objects.key, namespace);

  if (state === "not-served") return "not-read";
  if (state !== "given") return state;

  const object = index.controlPlanes
    .get(`${reference.apiGroup}/${reference.kind}`)
    ?.get(scoped(namespace, reference.name));

  // A control plane that the Cluster names and that does not exist is not given: the Cluster has one, and the model
  // reads its activities from it, so an empty place would read as one that does nothing.
  if (object === undefined) return "not-read";

  const machines = builder.machinesOf(object, reference.apiGroup);

  if (machines === "pending") builder.pending = true;
  builder.record([object]);

  return builder.part(
    object,
    builder.partContext(machines, {
      ...base,
      role: "control-plane",
      contract: resolution.contract,
      ...(resolution.provider === undefined ? {} : { provider: resolution.provider }),
    }),
    machines,
  );
}

function deploymentsOf(builder: ContextBuilder, base: StatusContext): Part[] | InputState {
  const { index, cluster, namespace } = builder;
  const state = stateOf(index.objects.reads, index.objects.machineDeployments.key, namespace);

  if (state === "not-served") return [];
  if (state !== "given") return state;

  const deployments = index.deploymentsByCluster.get(scoped(namespace, nameOf(cluster) ?? "")) ?? [];
  const setsState = stateOf(index.objects.reads, index.objects.machineSets.key, namespace);

  builder.record(deployments);
  return deployments.map((deployment) => {
    let machines: readonly MachineObject[] | InputState;

    if (setsState === "not-served") {
      machines = [];
    } else if (setsState !== "given") {
      machines = setsState;
      builder.mark("parts", setsState);
    } else {
      const sets =
        index.machineSetsByController.get(
          scoped(namespace, "cluster.x-k8s.io", "MachineDeployment", nameOf(deployment) ?? ""),
        ) ?? [];
      const owned = sets.map((set) => builder.machinesOf(set, "cluster.x-k8s.io"));
      const unread = owned.find((entry) => typeof entry === "string");

      builder.record(sets);
      machines =
        typeof unread === "string" ? unread : owned.flatMap((entry) => (typeof entry === "string" ? [] : entry));
    }
    if (machines === "pending") builder.pending = true;
    return builder.part(deployment, builder.partContext(machines, base), machines);
  });
}

function poolsOf(builder: ContextBuilder, base: StatusContext): Part[] | InputState {
  const { index, cluster, namespace } = builder;
  const state = stateOf(index.objects.reads, index.objects.machinePools.key, namespace);

  if (state === "not-served") return [];
  if (state !== "given") return state;

  const pools = index.poolsByCluster.get(scoped(namespace, nameOf(cluster) ?? "")) ?? [];

  builder.record(pools);
  return pools.map((pool) => {
    const machines = builder.machinesOf(pool, "cluster.x-k8s.io");

    if (machines === "pending") builder.pending = true;
    return builder.part(pool, builder.partContext(machines, base), machines);
  });
}

// The class of a Cluster whose gates it reads: one with a managed topology and no gates of its own (SPEC-0001, R2.21).
function classOf(builder: ContextBuilder): ClusterClassObject | InputState | undefined {
  const { index, cluster } = builder;
  const reference = classReferenceOf(cluster);

  if (reference === undefined || listOf(fieldsOf(cluster.spec)?.availabilityGates).length > 0) return undefined;

  const state = stateOf(index.objects.reads, index.objects.clusterClasses.key, reference.namespace ?? "");

  if (state === "not-served") return "not-read";
  if (state !== "given") return state;

  const found = index.classes.get(scoped(reference.namespace, reference.name));

  if (found === undefined) return "not-read";
  builder.record([found]);
  return found;
}

// The context of the status model for one Cluster of the list.
export function clusterContextOf(
  index: ContextIndex,
  cluster: ClusterObject,
  now: number,
  memo: StatusMemo,
): ClusterContext {
  const builder = new ContextBuilder(index, cluster, now, memo);
  const { reads } = index.objects;
  const namespace = builder.namespace;
  const context: { -readonly [Key in keyof StatusContext]: StatusContext[Key] } = { now };

  const controllers = index.controllers;

  builder.mark("controllers", controllers.state);
  if (controllers.state === "given" || controllers.state === "held") context.controllers = controllers.record;

  const checksState = stateOf(reads, index.objects.healthChecks.key, namespace);

  if (checksState === "not-served" || checksState === "given") {
    const checks = checksState === "given" ? (index.checksByNamespace.get(namespace) ?? []) : [];

    builder.record(checks);
    context.healthChecks = checks;
    builder.mark("healthChecks", "given");
  } else {
    builder.mark("healthChecks", checksState);
  }

  // What the parts of the Cluster take from it.
  const base: StatusContext = {
    now,
    ...(context.healthChecks === undefined ? {} : { healthChecks: context.healthChecks }),
    ...(context.controllers === undefined ? {} : { controllers: context.controllers }),
  };

  const machinesState = stateOf(reads, index.objects.machines.key, namespace);

  if (machinesState === "not-served" || machinesState === "given") {
    const machines =
      machinesState === "given" ? (index.machinesByCluster.get(scoped(namespace, nameOf(cluster) ?? "")) ?? []) : [];

    builder.record(machines);
    context.machines = machines;
    builder.mark("machines", "given");
  } else {
    builder.mark("machines", machinesState);
  }

  const controlPlane = controlPlaneOf(builder, base);
  const deployments = deploymentsOf(builder, base);

  if (typeof controlPlane === "string") builder.mark("parts", controlPlane);
  if (typeof deployments === "string") builder.mark("parts", deployments);
  if (typeof controlPlane !== "string" && typeof deployments !== "string") {
    context.parts = {
      ...(controlPlane === undefined ? {} : { controlPlane: controlPlane.status }),
      machineDeployments: deployments.map((part) => part.status),
    };
    builder.mark("parts", "given");
  }

  const pools = poolsOf(builder, base);

  if (typeof pools === "string") {
    builder.mark("machinePools", pools);
  } else {
    context.machinePools = pools.map((part) => part.status);
    builder.mark("machinePools", "given");
  }

  const clusterClass = classOf(builder);

  if (typeof clusterClass === "string") {
    builder.mark("clusterClass", clusterClass);
  } else if (clusterClass !== undefined) {
    context.clusterClass = clusterClass;
    builder.mark("clusterClass", "given");
  }

  const inputs = Object.entries(builder.inputs)
    .map(([input, state]) => `${input}=${state}`)
    .sort();

  return {
    context,
    inputs: builder.inputs,
    pending: builder.pending,
    key: [...builder.versions.sort(), `controllers=${controllers.version}`, ...inputs].join("|"),
    parts: { controlPlane, machineDeployments: deployments, machinePools: pools },
  };
}

// The result of the model for a Cluster of the list, and its conditions, with the context of the Cluster.
export interface ClusterRow {
  readonly cluster: ClusterObject;
  readonly status: ObjectStatus;
  readonly conditions: ConditionsResult;
  readonly pending: boolean;
  readonly inputs: ClusterContext["inputs"];
  // How many MachinePools of the Cluster have no Machine to stand for their instances (SPEC-0003, P10).
  readonly poolsWithoutMachines: number;
}

function rowOf(cluster: ClusterObject, clusterContext: ClusterContext, memo: StatusMemo): ClusterRow {
  const { context, inputs, pending, key } = clusterContext;

  return {
    cluster,
    status: memo.status(cluster, context, key),
    conditions: memo.conditions(cluster, context, key),
    pending,
    inputs,
    poolsWithoutMachines: (context.machinePools ?? []).filter((pool) =>
      pool.notes.some((note) => note.code === "no-machine"),
    ).length,
  };
}

export function clusterRowOf(index: ContextIndex, cluster: ClusterObject, now: number, memo: StatusMemo): ClusterRow {
  return rowOf(cluster, clusterContextOf(index, cluster, now, memo), memo);
}

// A worker Machine, with its conditions, whose `Available` the Cluster counts (P17).
export interface MachinePart extends Part {
  readonly conditions: ConditionsResult;
}

// The details of a Cluster (P17): its row, and each of its parts with what the model computes for it, or how it is not
// given. A part that the Cluster does not name, or that it names and the view cannot read, is told apart by the
// details, from the references and the reads.
export interface ClusterParts {
  readonly row: ClusterRow;
  // The control plane that its reference names; undefined with no reference.
  readonly controlPlane: Part | InputState | undefined;
  // With no reference, the control plane Machines of its own (SPEC-0001, R3.7); undefined with one.
  readonly controlPlaneMachines: readonly MachinePart[] | InputState | undefined;
  readonly machineDeployments: readonly Part[] | InputState;
  readonly machinePools: readonly Part[] | InputState;
  // The MachineSets and the worker Machines that it owns, which it counts with its workers.
  readonly machineSets: readonly Part[] | InputState;
  readonly workerMachines: readonly MachinePart[] | InputState;
  // The infrastructure cluster that its reference names; undefined with no reference.
  readonly infrastructure: Part | InputState | undefined;
}

// The label of the control plane Machines, and that of the Machines of a MachinePool (SPEC-0001, R3.7;
// api/core/v1beta2/machine_types.go:31, 48).
const CONTROL_PLANE_LABEL = "cluster.x-k8s.io/control-plane";
const POOL_NAME_LABEL = "cluster.x-k8s.io/pool-name";

// Whether an object has an owner reference to the Cluster, by group, kind and name, as the project matches it
// (util/util.go:363-404).
function ownedBy(object: KubeObjectData, cluster: ClusterObject): boolean {
  const name = nameOf(cluster);

  return ownersOf(object).some(
    (owner) => owner.group === "cluster.x-k8s.io" && owner.kind === "Cluster" && owner.name === name,
  );
}

function hasLabel(object: KubeObjectData, key: string): boolean {
  return Object.hasOwn(fieldsOf(fieldsOf(object.metadata)?.labels) ?? {}, key);
}

// The Machines labelled with the name of the Cluster that the view shows as parts: those of its control plane, or
// the worker Machines that it owns, which the project counts apart from those of a MachinePool.
function clusterMachinesOf(
  builder: ContextBuilder,
  base: StatusContext,
  which: "control-plane" | "workers",
): MachinePart[] | InputState {
  const { index, cluster, namespace } = builder;
  const state = stateOf(index.objects.reads, index.objects.machines.key, namespace);

  if (state === "not-served") return [];
  if (state !== "given") return state;

  const labelled = index.machinesByCluster.get(scoped(namespace, nameOf(cluster) ?? "")) ?? [];
  const machines =
    which === "control-plane"
      ? labelled.filter((machine) => hasLabel(machine, CONTROL_PLANE_LABEL))
      : labelled.filter(
          (machine) =>
            !hasLabel(machine, CONTROL_PLANE_LABEL) && !hasLabel(machine, POOL_NAME_LABEL) && ownedBy(machine, cluster),
        );

  return machines.map((machine) => {
    const context = { ...base, cluster };
    const key = builder.partKey(machine, context);

    return {
      object: machine,
      status: builder.memo.status(machine, context, key),
      conditions: builder.memo.conditions(machine, context, key),
      pending: false,
    };
  });
}

// The MachineSets that the Cluster owns, apart from those of its MachineDeployments.
function ownedSetsOf(builder: ContextBuilder, base: StatusContext): Part[] | InputState {
  const { index, cluster, namespace } = builder;
  const state = stateOf(index.objects.reads, index.objects.machineSets.key, namespace);

  if (state === "not-served") return [];
  if (state !== "given") return state;

  const sets = (index.machineSetsByCluster.get(scoped(namespace, nameOf(cluster) ?? "")) ?? []).filter((set) =>
    ownedBy(set, cluster),
  );

  return sets.map((set) => {
    const machines = builder.machinesOf(set, "cluster.x-k8s.io");

    return builder.part(set, builder.partContext(machines, base), machines);
  });
}

// The infrastructure cluster that the reference names, at the version of its contract, with its role (SPEC-0003,
// "Objects of a provider"). One that the view cannot resolve or that does not exist is not read.
function infrastructureOf(builder: ContextBuilder, base: StatusContext): Part | InputState | undefined {
  const { index, cluster, namespace } = builder;
  const reference = contractReferenceOf(fieldsOf(cluster.spec)?.infrastructureRef);

  if (reference === undefined) return undefined;

  const id = `${reference.apiGroup}/${reference.kind}`;
  const objects = index.objects.infrastructures?.get(id);
  const resolution = objects?.resolution;

  if (objects === undefined || resolution === undefined || resolution.state === "pending") return "pending";
  if (resolution.state === "unresolved") return "not-read";

  const state = stateOf(index.objects.reads, objects.key, namespace);

  if (state === "not-served") return "not-read";
  if (state !== "given") return state;

  const object = index.infrastructures.get(id)?.get(scoped(namespace, reference.name));

  if (object === undefined) return "not-read";
  return builder.part(object, {
    ...base,
    cluster,
    role: "infrastructure-cluster",
    contract: resolution.contract,
    ...(resolution.provider === undefined ? {} : { provider: resolution.provider }),
  });
}

export function clusterPartsOf(
  index: ContextIndex,
  cluster: ClusterObject,
  now: number,
  memo: StatusMemo,
): ClusterParts {
  const clusterContext = clusterContextOf(index, cluster, now, memo);
  const { context, parts } = clusterContext;
  const builder = new ContextBuilder(index, cluster, now, memo);
  const base: StatusContext = {
    now,
    ...(context.healthChecks === undefined ? {} : { healthChecks: context.healthChecks }),
    ...(context.controllers === undefined ? {} : { controllers: context.controllers }),
  };
  const named = contractReferenceOf(fieldsOf(cluster.spec)?.controlPlaneRef) !== undefined;
  // Every part takes the MachineHealthChecks and the controllers that the Cluster takes: while they load, the marks of
  // every part show the spinner.
  const { inputs } = clusterContext;
  const shared = inputs.healthChecks === "pending" || inputs.controllers === "pending";
  const one = <T extends Part>(part: T): T => (shared && !part.pending ? { ...part, pending: true } : part);
  const each = <T extends Part>(found: readonly T[] | InputState) =>
    typeof found === "string" ? found : found.map(one);
  const single = <T extends Part>(found: T | InputState | undefined) =>
    found === undefined || typeof found === "string" ? found : one(found);

  return {
    row: rowOf(cluster, clusterContext, memo),
    controlPlane: single(parts.controlPlane),
    controlPlaneMachines: named ? undefined : each(clusterMachinesOf(builder, base, "control-plane")),
    machineDeployments: each(parts.machineDeployments),
    machinePools: each(parts.machinePools),
    machineSets: each(ownedSetsOf(builder, base)),
    workerMachines: each(clusterMachinesOf(builder, base, "workers")),
    infrastructure: single(infrastructureOf(builder, base)),
  };
}
