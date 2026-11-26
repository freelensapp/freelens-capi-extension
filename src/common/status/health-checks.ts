/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rule of a MachineHealthCheck, and the kind of the same group of R2 that has no status, MachineDrainRule
// (SPEC-0003, "The rule of each kind", MachineHealthCheck; SPEC-0001, R2.70 to R2.73 and H1).
//
// What stands for a summary is its targets (P11). It is Unknown while its status or `RemediationAllowed` is missing,
// and Healthy when `status.currentHealthy` equals `status.expectedMachines`. Otherwise, with the Machines of its
// targets from the view, it is Degraded when one of them has `HealthCheckSucceeded` `False`, and Healthy when none
// has: the others are starting, deleting or inside a timeout, which the check counts as not healthy for its limit
// only (R2.71). Without them it is Unknown, since the count alone does not tell a target that starts from one that
// failed. It is never Unhealthy: its targets carry their own health.
//
// Whether remediation is allowed is a mark of its own, next to the health, from `RemediationAllowed`, with the weight
// of that condition and the message of the project. The reason `TooManyUnhealthy` covers both a count above the
// limit and, with `unhealthyInRange`, a count below the range, none included, which only the message tells apart
// (R2.72).

import { conditionOf, readConditions } from "./conditions";
import { fieldOf, readCount, UNREADABLE } from "./fields";
import { identityOf, noStatusRule, unknownHealth } from "./health";

import type { WeightedCondition } from "./conditions";
import type { HealthBasis, HealthInput, HealthOutcome, Issue, KindRule, Note } from "./health";

// Whether remediation is allowed (P11): undefined when `RemediationAllowed` is missing or neither `True` nor `False`.
// The views give the mark the token of the weight of the condition (P31).
export interface RemediationMark {
  readonly allowed: boolean | undefined;
  readonly condition: WeightedCondition | undefined;
}

export function remediationOf(conditions: readonly WeightedCondition[]): RemediationMark {
  const condition = conditionOf(conditions, "RemediationAllowed");
  const allowed = condition?.status === "True" ? true : condition?.status === "False" ? false : undefined;

  return { allowed, condition };
}

function countOf(input: HealthInput, field: string, notes: Note[]): number | undefined {
  const count = readCount(fieldOf(input.status, field));

  if (count !== UNREADABLE) return count;
  notes.push({ code: "field-unreadable", field: `status.${field}` });
  return undefined;
}

function machineHealthCheckHealth(input: HealthInput): HealthOutcome {
  const notes: Note[] = [];
  const basis: HealthBasis = {
    form: "targets",
    expectedMachines: countOf(input, "expectedMachines", notes),
    currentHealthy: countOf(input, "currentHealthy", notes),
  };

  if (notes.length > 0 || conditionOf(input.conditions, "RemediationAllowed") === undefined) {
    return { health: unknownHealth(basis), notes };
  }
  if (basis.expectedMachines !== undefined && basis.currentHealthy === basis.expectedMachines) {
    return { health: { health: "Healthy", restsOn: basis, issues: [] }, notes };
  }

  const machines = input.context.machines;

  if (machines === undefined) {
    return { health: unknownHealth(basis), notes: [{ code: "input-not-given", input: "machines" }] };
  }

  const issues: Issue[] = [];

  for (const machine of machines) {
    const read = readConditions(machine, "Machine", input.context);
    const check = read.state === "read" ? conditionOf(read.conditions, "HealthCheckSucceeded") : undefined;

    if (check?.status === "False") issues.push({ form: "machine", name: identityOf(machine).name, condition: check });
  }
  return { health: { health: issues.length > 0 ? "Degraded" : "Healthy", restsOn: basis, issues }, notes };
}

export const MACHINE_HEALTH_CHECK_RULE: KindRule = {
  kind: "MachineHealthCheck",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: [],
  provider: "cluster-api",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: true,
  deprecatedFailure: false,
  health: machineHealthCheckHealth,
};

export const MACHINE_DRAIN_RULE_RULE: KindRule = noStatusRule("MachineDrainRule", "cluster.x-k8s.io/v1beta2");
