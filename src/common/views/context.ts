/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The context of the status model for each Cluster of a list (SPEC-0003, "What it takes and returns"; SPEC-0004,
// "What the view reads", P2, P17, P19), built from the objects of the stores that the page reads, through indexes
// made once for each change of the stores and never row by row (kit, `docs/design.md`, "Interaction and
// performance"):
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
  ConditionsResult,
  ContextInput,
  ControllerAvailability,
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

// The objects of a kind of control plane that the references of the Clusters name, with the resolution of those
// references to the version of their contract (P3).
export interface ControlPlaneObjects extends KindObjects {
  readonly resolution: ResolvedReference;
}

export interface ContextObjects {
  readonly reads: ReadsState;
  readonly machines: KindObjects<MachineObject>;
  readonly machineSets: KindObjects<MachineSetObject>;
  readonly machineDeployments: KindObjects<MachineDeploymentObject>;
  readonly machinePools: KindObjects<MachinePoolObject>;
  readonly healthChecks: KindObjects<MachineHealthCheckObject>;
  readonly clusterClasses: KindObjects<ClusterClassObject>;
  // Every kind of the operator; one that the cluster does not serve has no key.
  readonly operator: readonly KindObjects<OperatorProviderObject>[];
  // The kinds of control plane that the references of the Clusters name, by `group/kind`.
  readonly controlPlanes: ReadonlyMap<string, ControlPlaneObjects>;
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
}

interface Controllers {
  readonly state: "given" | "pending" | "held";
  readonly record: Readonly<Record<string, ControllerAvailability>>;
  readonly version: string;
}

export interface ContextIndex {
  readonly objects: ContextObjects;
  readonly machinesByCluster: ReadonlyMap<string, readonly MachineObject[]>;
  readonly machinesByController: ReadonlyMap<string, readonly MachineObject[]>;
  readonly machineSetsByController: ReadonlyMap<string, readonly MachineSetObject[]>;
  readonly deploymentsByCluster: ReadonlyMap<string, readonly MachineDeploymentObject[]>;
  readonly poolsByCluster: ReadonlyMap<string, readonly MachinePoolObject[]>;
  readonly checksByNamespace: ReadonlyMap<string, readonly MachineHealthCheckObject[]>;
  readonly classes: ReadonlyMap<string, ClusterClassObject>;
  readonly controlPlanes: ReadonlyMap<string, ReadonlyMap<string, KubeObjectData>>;
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
// leave its availability unknown.
function controllersOf(objects: ContextObjects): Controllers {
  const { reads, operator } = objects;
  const filter = reads.filter?.namespaces ?? [];
  const record: Record<string, ControllerAvailability> = {};
  const versions: string[] = [];
  let state: Controllers["state"] = "given";

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

// The indexes of the context, built once for each change of the stores that the page reads.
export function indexContext(objects: ContextObjects): ContextIndex {
  const { reads } = objects;
  const machines = readItems(reads, objects.machines);
  const controlPlanes = new Map<string, Map<string, KubeObjectData>>();

  for (const [kind, controlPlaneObjects] of objects.controlPlanes) {
    const byName = new Map<string, KubeObjectData>();

    for (const item of readItems(reads, controlPlaneObjects)) {
      byName.set(scoped(namespaceOf(item), nameOf(item) ?? ""), item);
    }
    controlPlanes.set(kind, byName);
  }

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
    machineSetsByController: byController(readItems(reads, objects.machineSets)),
    deploymentsByCluster: byClusterLabel(readItems(reads, objects.machineDeployments)),
    poolsByCluster: byClusterLabel(readItems(reads, objects.machinePools)),
    checksByNamespace,
    classes,
    controlPlanes,
    controllers: controllersOf(objects),
  };
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

  partStatus(object: KubeObjectData, context: StatusContext): ObjectStatus {
    const key = [
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

    return this.memo.status(object, context, key);
  }
}

function controlPlaneOf(builder: ContextBuilder, base: StatusContext): ObjectStatus | InputState | undefined {
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

  return builder.partStatus(
    object,
    builder.partContext(machines, {
      ...base,
      role: "control-plane",
      contract: resolution.contract,
      ...(resolution.provider === undefined ? {} : { provider: resolution.provider }),
    }),
  );
}

function deploymentsOf(builder: ContextBuilder, base: StatusContext): ObjectStatus[] | InputState {
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
    return builder.partStatus(deployment, builder.partContext(machines, base));
  });
}

function poolsOf(builder: ContextBuilder, base: StatusContext): ObjectStatus[] | InputState {
  const { index, cluster, namespace } = builder;
  const state = stateOf(index.objects.reads, index.objects.machinePools.key, namespace);

  if (state === "not-served") return [];
  if (state !== "given") return state;

  const pools = index.poolsByCluster.get(scoped(namespace, nameOf(cluster) ?? "")) ?? [];

  builder.record(pools);
  return pools.map((pool) => {
    const machines = builder.machinesOf(pool, "cluster.x-k8s.io");

    if (machines === "pending") builder.pending = true;
    return builder.partStatus(pool, builder.partContext(machines, base));
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
  if (controllers.state !== "pending") context.controllers = controllers.record;

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
      ...(controlPlane === undefined ? {} : { controlPlane }),
      machineDeployments: deployments,
    };
    builder.mark("parts", "given");
  }

  const pools = poolsOf(builder, base);

  if (typeof pools === "string") {
    builder.mark("machinePools", pools);
  } else {
    context.machinePools = pools;
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

export function clusterRowOf(index: ContextIndex, cluster: ClusterObject, now: number, memo: StatusMemo): ClusterRow {
  const { context, inputs, pending, key } = clusterContextOf(index, cluster, now, memo);

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
