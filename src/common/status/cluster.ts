/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rule of a Cluster (SPEC-0003, "The rule of each kind", Cluster; SPEC-0001, R2.8 to R2.32 and H1).
//
// `Available` sums it up, and it is Degraded from `ControlPlaneMachinesReady`, `WorkerMachinesReady`,
// `ControlPlaneInitialized`, a `TopologyReconciled` that fails while `Available` keeps an older `True` (R2.8,
// R2.24), a condition of a third party that is not a gate (H1), and a MachinePool that is Unhealthy or Degraded: its
// `Available` leaves out its MachinePools (R2.29), so a Cluster is at most Degraded for them, and one whose
// MachinePools are Unknown says how many. The `ControlPlaneMachinesUpToDate` and `WorkerMachinesUpToDate` of P4 are
// no issue, and the gates of its availability, its own or those of its ClusterClass, are inputs of `Available`
// itself, as are its other conditions (R2.21).
//
// A Cluster with neither a topology nor one of its two references is never available (P7): with the note, it is
// Unknown or Unhealthy, and never Healthy, so an `Available` `True`, which only a status written by hand can hold,
// gives Unknown.
//
// While the contract of its control plane cannot be read, the controller writes nothing at all, and its last health
// stays, which no mark can tell (R2.8, P25).

import { gateTypesOf } from "./conditions";
import { readFields, UNREADABLE } from "./fields";
import { allButInputs, summaryHealth, unknownHealth } from "./health";

import type { Fields } from "./fields";
import type { HealthInput, HealthOutcome, Issue, KindRule, Note } from "./health";

export const CLUSTER_PHASES = ["Pending", "Provisioning", "Provisioned", "Deleting", "Failed", "Unknown"] as const;

// The conditions of its own that its `Available` merges, with its gates, and that count only through it (SPEC-0001,
// R2.21): `Deleting`, of negative polarity, is the other, and `TopologyReconciled`, which `Available` merges too,
// counts when it fails while `Available` keeps an older `True` (R2.24). Every other condition of positive polarity
// that a Cluster writes (R2.19) counts: `ControlPlaneMachinesReady`, `WorkerMachinesReady` and
// `ControlPlaneInitialized`, while the pending changes of P4 weigh no issue.
const AVAILABLE_INPUTS: readonly string[] = [
  "RemoteConnectionProbe",
  "InfrastructureReady",
  "ControlPlaneAvailable",
  "WorkersAvailable",
];

// A reference is set when it names a kind, a name or a group, and a topology when it holds anything, as the project
// reads them (api/core/v1beta2/common_types.go:420-425; api/core/v1beta2/cluster_types.go:589-591). The activity
// Upgrading of a Cluster reads its topology the same way (activity.ts).
export function isSet(value: unknown): boolean {
  const fields = readFields(value);

  if (fields === undefined || fields === UNREADABLE) return false;
  return Object.values(fields).some((field) => field !== undefined && field !== null && field !== "");
}

// A Cluster with neither a topology nor one of its two references, which the project never reports available
// (P7; SPEC-0001, R2.27).
function neverAvailable(spec: Fields | undefined): Note[] {
  if (isSet(spec?.topology)) return [];

  const missing = (["controlPlaneRef", "infrastructureRef"] as const)
    .filter((reference) => !isSet(spec?.[reference]))
    .map((reference) => `spec.${reference}` as const);

  return missing.length === 0 ? [] : [{ code: "never-available", missing }];
}

function clusterHealth(input: HealthInput): HealthOutcome {
  const notes: Note[] = neverAvailable(input.spec);
  const pools = input.context.machinePools;
  const poolIssues: Issue[] = [];

  if (pools === undefined) {
    notes.push({ code: "input-not-given", input: "machinePools" });
  } else {
    let unknown = 0;

    for (const pool of pools) {
      const health = pool.health?.health;

      if (health === "Unhealthy" || health === "Degraded") {
        poolIssues.push({ form: "machine-pool", name: pool.object?.name, health });
      } else if (health === "Unknown") {
        unknown++;
      }
    }
    if (unknown > 0) notes.push({ code: "machine-pools-unknown", count: unknown });
  }

  const gates = gateTypesOf(input.object, "Cluster", input.context);
  const health = summaryHealth(input.conditions, "Available", allButInputs(AVAILABLE_INPUTS, gates), poolIssues);
  const neverHealthy = notes.some((note) => note.code === "never-available");

  if (neverHealthy && (health.health === "Healthy" || health.health === "Degraded")) {
    return { health: unknownHealth(health.restsOn, health.issues), notes };
  }
  return { health, notes };
}

export const CLUSTER_RULE: KindRule = {
  kind: "Cluster",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Available"],
  provider: "cluster-api",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: false,
  phases: CLUSTER_PHASES,
  deprecatedFailure: true,
  health: clusterHealth,
};
