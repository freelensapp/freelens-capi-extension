/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The large Cluster of the session of the tree (SPEC-0005, P22), as a pure function of the objects of `healthy`, which
// its unit test checks with no cluster. It is no state of the fixtures: the session makes it at run time, in a
// namespace of its own, which is the namespace of no state, applies it through the scripts of the test environment as
// they apply a state, and deletes it at its end. The repository holds none of it.
//
// It is the Cluster of `healthy` with its objects, moved to that namespace under the same names, with its workers
// replaced by copies of the first of them: each a copy of that worker Machine, with its infrastructure machine and its
// bootstrap config, named apart and owned by its own objects, as the controllers write them for a healthy worker. The
// counters of its MachineDeployment, of its MachineSet, of its topology and of the workers of the Cluster count the
// copies, and its MachineHealthCheck of the workers targets them all. A copy carries only what the controllers write
// in that state, which the set of `healthy` captured (kit, `docs/testing.md`, "The test environment has two tiers").
// Its name does not match `*.tests.ts`, so Vitest does not collect it as a session.

import type { KubeObject, OwnerReference } from "../../e2e/scripts/fixtures.mts";

// The namespace of the large Cluster, which is the namespace of no state of the fixtures.
export const LARGE_NAMESPACE = "freelens-capi-tree-large";

// The workers of the large Cluster, which the session makes.
export const LARGE_WORKERS = 300;

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : undefined;
}

function controllerOf(object: KubeObject): OwnerReference | undefined {
  return object.metadata.ownerReferences?.find((owner) => owner.controller === true);
}

function only(objects: readonly KubeObject[], kind: string): KubeObject {
  const found = objects.filter((object) => object.kind === kind);

  if (found.length !== 1) throw new Error(`The set holds ${found.length} objects of the kind ${kind}, and not one`);
  return found[0];
}

// The object of a kind and a name of a set.
function named(objects: readonly KubeObject[], kind: string, name: string): KubeObject {
  const found = objects.find((object) => object.kind === kind && object.metadata.name === name);

  if (found === undefined) throw new Error(`The set holds no ${kind} ${name}`);
  return found;
}

// A copy of a value with every string in which `from` appears written with `to` in its place: the name of a Machine
// in its own name, in its references, in its provider ID, its Node and its addresses, and in those of its objects.
function renamed<Value>(value: Value, from: string, to: string): Value {
  if (typeof value === "string") return value.split(from).join(to) as Value;
  if (Array.isArray(value)) return value.map((item) => renamed(item, from, to)) as Value;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renamed(item, from, to)])) as Value;
  }
  return value;
}

// The value at a key of an object, or at an index of a list.
function member(value: unknown, key: string): unknown {
  return Array.isArray(value) ? value[Number(key)] : fields(value)?.[key];
}

// Sets a counter at a path of an object, which the object must hold already as a number.
function count(object: KubeObject, path: readonly string[], value: number): void {
  const holder = path.slice(0, -1).reduce<unknown>(member, object);
  const key = path[path.length - 1];
  const parent = fields(holder);

  if (parent === undefined || typeof parent[key] !== "number") {
    throw new Error(`${object.kind} ${object.metadata.name} has no counter ${path.join(".")}`);
  }
  parent[key] = value;
}

// Sets the counters that every list of versions of an object holds, each `replicas` of `status.versions`, or of
// `status.<part>.versions` of a Cluster, which the set writes with one version alone.
function countVersions(versions: unknown, value: number): void {
  if (!Array.isArray(versions) || versions.length !== 1) throw new Error("The set writes more than one version");
  const entry = fields(versions[0]);

  if (entry === undefined || typeof entry.replicas !== "number") throw new Error("A version holds no replicas");
  entry.replicas = value;
}

// The name of the worker of a number, from 1: the name of its MachineSet and the number, written with as many digits
// as the last one, so that the names sort in the order of their numbers, as the tree orders them (P14).
export function workerName(machineSet: string, number: number, workers = LARGE_WORKERS): string {
  return `${machineSet}-${String(number).padStart(String(workers).length, "0")}`;
}

export interface LargeCluster {
  // Every object of the set, in the namespace of the large Cluster.
  readonly objects: readonly KubeObject[];
  readonly namespace: string;
  readonly cluster: string;
  readonly machineDeployment: string;
  readonly machineSet: string;
  // The names of the worker Machines, in the order of their numbers.
  readonly workers: readonly string[];
}

// The large Cluster, from the objects of `healthy`, with this many workers, in that namespace.
export function largeCluster(
  healthy: readonly KubeObject[],
  workers = LARGE_WORKERS,
  namespace = LARGE_NAMESPACE,
): LargeCluster {
  const objects = healthy.map((object) => {
    const copy = structuredClone(object);

    copy.metadata.namespace = namespace;
    return copy;
  });
  const cluster = only(objects, "Cluster");
  const deployment = only(objects, "MachineDeployment");
  const set = only(objects, "MachineSet");
  // The workers of the set, which its MachineSet controls, and the first of them by name, which the copies copy.
  const ownWorkers = objects
    .filter((object) => object.kind === "Machine" && controllerOf(object)?.name === set.metadata.name)
    .sort((one, other) => (one.metadata.name < other.metadata.name ? -1 : 1));

  if (ownWorkers.length === 0) throw new Error("The MachineSet of the set controls no Machine");

  // The infrastructure machine and the bootstrap config of a worker, by the references of its spec.
  const partsOf = (machine: KubeObject): KubeObject[] => {
    const spec = fields(machine.spec);
    const infrastructure = fields(spec?.infrastructureRef);
    const bootstrap = fields(fields(spec?.bootstrap)?.configRef);

    return [
      named(objects, String(infrastructure?.kind), String(infrastructure?.name)),
      named(objects, String(bootstrap?.kind), String(bootstrap?.name)),
    ];
  };
  const template = ownWorkers[0];
  const templateParts = partsOf(template);
  const replaced = new Set(ownWorkers.flatMap((machine) => [machine, ...partsOf(machine)]));
  const names = Array.from({ length: workers }, (_, index) => workerName(set.metadata.name, index + 1, workers));
  const copies = names.flatMap((name) =>
    [template, ...templateParts].map((object) => renamed(object, template.metadata.name, name)),
  );

  // The counters of the workers, which count the copies: of the topology and of the status of the Cluster, of the
  // MachineDeployment, and of the MachineSet, whose annotations of the MachineDeployment say the same.
  const topology = fields(fields(fields(cluster.spec)?.topology)?.workers)?.machineDeployments;

  if (!Array.isArray(topology) || topology.length !== 1) throw new Error("The topology has not one MachineDeployment");
  count(cluster, ["spec", "topology", "workers", "machineDeployments", "0", "replicas"], workers);
  for (const counter of ["availableReplicas", "desiredReplicas", "readyReplicas", "replicas", "upToDateReplicas"]) {
    count(cluster, ["status", "workers", counter], workers);
  }
  countVersions(fields(fields(cluster.status)?.workers)?.versions, workers);

  count(deployment, ["spec", "replicas"], workers);
  for (const counter of ["availableReplicas", "readyReplicas", "replicas", "upToDateReplicas"]) {
    count(deployment, ["status", counter], workers);
  }
  for (const counter of ["availableReplicas", "readyReplicas", "updatedReplicas"]) {
    count(deployment, ["status", "deprecated", "v1beta1", counter], workers);
  }
  countVersions(fields(deployment.status)?.versions, workers);

  const surge = fields(fields(fields(deployment.spec)?.rollout)?.strategy)?.rollingUpdate;
  const maxSurge = fields(surge)?.maxSurge;

  if (typeof maxSurge !== "number") throw new Error("The MachineDeployment has no maxSurge as a number");
  set.metadata.annotations = {
    ...set.metadata.annotations,
    "machinedeployment.clusters.x-k8s.io/desired-replicas": String(workers),
    "machinedeployment.clusters.x-k8s.io/max-replicas": String(workers + maxSurge),
  };
  count(set, ["spec", "replicas"], workers);
  for (const counter of ["availableReplicas", "readyReplicas", "replicas", "upToDateReplicas"]) {
    count(set, ["status", counter], workers);
  }
  for (const counter of ["availableReplicas", "fullyLabeledReplicas", "readyReplicas"]) {
    count(set, ["status", "deprecated", "v1beta1", counter], workers);
  }
  countVersions(fields(set.status)?.versions, workers);

  // The MachineHealthCheck of the workers, the one whose targets were the workers of the set: it targets every copy,
  // each healthy.
  const workerNames = new Set(ownWorkers.map((machine) => machine.metadata.name));
  const checks = objects.filter(
    (object) =>
      object.kind === "MachineHealthCheck" &&
      (fields(object.status)?.targets as unknown[] | undefined)?.some((target) => workerNames.has(String(target))),
  );

  if (checks.length !== 1) throw new Error(`${checks.length} MachineHealthChecks target the workers, and not one`);
  for (const counter of ["currentHealthy", "expectedMachines", "remediationsAllowed"]) {
    count(checks[0], ["status", counter], workers);
  }
  (fields(checks[0].status) as Fields).targets = [...names];

  return {
    objects: [...objects.filter((object) => !replaced.has(object)), ...copies],
    namespace,
    cluster: cluster.metadata.name,
    machineDeployment: deployment.metadata.name,
    machineSet: set.metadata.name,
    workers: names,
  };
}
