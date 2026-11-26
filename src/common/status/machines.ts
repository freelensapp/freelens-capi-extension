/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rules of a Machine, a MachineSet, a MachineDeployment and a MachinePool (SPEC-0003, "The rule of each kind",
// Machine, and MachineSet, MachineDeployment and MachinePool; SPEC-0001, R2.38 to R2.69 and H1).
//
// - Machine: `Ready` sums it up, which merges `BootstrapConfigReady`, `InfrastructureReady`, `NodeHealthy`,
//   `HealthCheckSucceeded` and the readiness gates, each with its polarity (R2.46), and every other condition of
//   positive polarity makes it Degraded: in practice one of a third party. `UpToDate` (P4) and an `Available` that
//   waits for `spec.minReadySeconds` (P5) are no issue. A Machine that waits for its Node has `NodeHealthy`
//   `Unknown`, so its `Ready` is `Unknown` and it is Unknown, and one whose Node was deleted is Unhealthy from
//   `NodeHealthy` `False` `NodeDeleted` (R2.44).
// - MachineSet: what stands for a summary is `status.availableReplicas` against `spec.replicas` (P9): Unknown while
//   either is unset, Unhealthy while fewer Machines are available than wanted, and otherwise Degraded from
//   `MachinesReady` or Healthy. `MachinesReady` alone would make it Unhealthy at every scale down, since it counts
//   the deleting Machines, which the counters leave out (R2.56, R2.58). A condition of a third party counts as
//   `MachinesReady` does (H1).
// - MachineDeployment: `Available` sums it up, and it is Degraded from `MachinesReady` and from a condition of a
//   third party (H1); `MachinesUpToDate` is no issue (P4).
// - MachinePool: it writes no condition of health at v1beta2 (R2.69), so its Machines stand for one, when it has
//   them (P10): it is read as a MachineSet on its counters, which then count the `Available` of its Machines (R2.67),
//   and is Degraded when one of its Machines that is not deleting is not `Ready`. With no Machine it is Healthy at 0
//   replicas, and Unknown otherwise, with the reason and its deprecated `v1beta1` `Ready`. Its health comes from its
//   Machines (H1), so no condition of its own counts.

import { conditionOf, readConditions } from "./conditions";
import { fieldOf, readCount, UNREADABLE } from "./fields";
import {
  conditionIssues,
  deletionOf,
  deprecatedReadyOf,
  everyOtherCondition,
  identityOf,
  summaryHealth,
  unknownHealth,
} from "./health";

import type { HealthBasis, HealthInput, HealthOutcome, Issue, KindRule, Note } from "./health";
import type { MachineObject } from "./types";

export const MACHINE_PHASES = [
  "Pending",
  "Provisioning",
  "Provisioned",
  "Running",
  "Updating",
  "Deleting",
  "Deleted",
  "Failed",
  "Unknown",
] as const;

export const MACHINE_DEPLOYMENT_PHASES = ["ScalingUp", "ScalingDown", "Running", "Failed", "Unknown"] as const;

export const MACHINE_POOL_PHASES = [
  "Pending",
  "Provisioning",
  "Provisioned",
  "Running",
  "ScalingUp",
  "ScalingDown",
  "Scaling",
  "Deleting",
  "Failed",
  "Unknown",
] as const;

function machineHealth(input: HealthInput): HealthOutcome {
  return { health: summaryHealth(input.conditions, "Ready", everyOtherCondition), notes: [] };
}

type ReplicasBasis = Extract<HealthBasis, { form: "replicas" }>;

// The available Machines against `spec.replicas`, and the notes of a count of the wrong type, which reads as unset.
function replicasOf(input: HealthInput): { basis: ReplicasBasis; notes: Note[] } {
  const replicas = readCount(fieldOf(input.spec, "replicas"));
  const available = readCount(fieldOf(input.status, "availableReplicas"));
  const notes: Note[] = [];

  if (replicas === UNREADABLE) notes.push({ code: "field-unreadable", field: "spec.replicas" });
  if (available === UNREADABLE) notes.push({ code: "field-unreadable", field: "status.availableReplicas" });
  return {
    basis: {
      form: "replicas",
      available: available === UNREADABLE ? undefined : available,
      replicas: replicas === UNREADABLE ? undefined : replicas,
    },
    notes,
  };
}

// P9 and P10: Unknown while either count is unset, Unhealthy while fewer Machines are available than wanted, and
// otherwise Degraded from the issues given, or Healthy.
function fromReplicas(basis: ReplicasBasis, issues: readonly Issue[]): HealthOutcome["health"] {
  const { available, replicas } = basis;

  if (available === undefined || replicas === undefined) return unknownHealth(basis, issues);
  if (available < replicas) return { health: "Unhealthy", restsOn: basis, issues };
  return { health: issues.length > 0 ? "Degraded" : "Healthy", restsOn: basis, issues };
}

function machineSetHealth(input: HealthInput): HealthOutcome {
  const { basis, notes } = replicasOf(input);
  // Of its conditions, a closed set (SPEC-0001, R2.57), each of positive polarity is `MachinesReady` or the
  // `MachinesUpToDate` of P4, so every other counts: `MachinesReady`, and one of a third party.
  const issues = conditionIssues(input.conditions, undefined, everyOtherCondition);

  return { health: fromReplicas(basis, issues), notes };
}

// Of its conditions, a closed set (SPEC-0001, R2.62), `Available` merges none: each other of positive polarity is
// `MachinesReady`, the `MachinesUpToDate` of P4, or one of a third party.
function machineDeploymentHealth(input: HealthInput): HealthOutcome {
  return { health: summaryHealth(input.conditions, "Available", everyOtherCondition), notes: [] };
}

// A Machine of a MachinePool that is not deleting and whose `Ready` is `False`. A `Ready` that is `Unknown` is no
// issue, as it is no issue in the `MachinesReady` that a MachineSet writes for the same Machines (P10).
function machineIssue(machine: MachineObject, input: HealthInput): Issue | undefined {
  if (deletionOf(machine) !== false) return undefined;

  const read = readConditions(machine, "Machine", input.context);
  const ready = read.state === "read" ? conditionOf(read.conditions, "Ready") : undefined;

  return ready?.status === "False" ? { form: "machine", name: identityOf(machine).name, condition: ready } : undefined;
}

function machinePoolHealth(input: HealthInput): HealthOutcome {
  const { basis, notes } = replicasOf(input);
  const machines = input.context.machines;

  if (machines === undefined) {
    return { health: unknownHealth(basis), notes: [...notes, { code: "input-not-given", input: "machines" }] };
  }
  if (input.status === undefined) return { health: unknownHealth(basis), notes };
  if (machines.length === 0) {
    if (basis.replicas === 0) return { health: { health: "Healthy", restsOn: basis, issues: [] }, notes };
    return {
      health: unknownHealth(basis),
      notes: [...notes, { code: "no-machine", deprecatedReady: deprecatedReadyOf(input.object) }],
    };
  }

  const issues = machines.map((machine) => machineIssue(machine, input)).filter((issue) => issue !== undefined);

  return { health: fromReplicas(basis, issues), notes };
}

export const MACHINE_RULE: KindRule = {
  kind: "Machine",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Ready"],
  provider: "cluster-api",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: true,
  phases: MACHINE_PHASES,
  deprecatedFailure: true,
  health: machineHealth,
};

// A MachineSet has no phase (SPEC-0001, R2.56).
export const MACHINE_SET_RULE: KindRule = {
  kind: "MachineSet",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: [],
  provider: "cluster-api",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: true,
  deprecatedFailure: true,
  health: machineSetHealth,
};

// The deprecated status of a MachineDeployment keeps no failure reason
// (core/config/crd/bases/cluster.x-k8s.io_machinedeployments.yaml).
export const MACHINE_DEPLOYMENT_RULE: KindRule = {
  kind: "MachineDeployment",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Available"],
  provider: "cluster-api",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: true,
  phases: MACHINE_DEPLOYMENT_PHASES,
  deprecatedFailure: false,
  health: machineDeploymentHealth,
};

export const MACHINE_POOL_RULE: KindRule = {
  kind: "MachinePool",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: [],
  provider: "cluster-api",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: true,
  phases: MACHINE_POOL_PHASES,
  deprecatedFailure: true,
  health: machinePoolHealth,
};
