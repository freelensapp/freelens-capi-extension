/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The health of an object (SPEC-0003, "Health"; SPEC-0001, H1): the rule every kind follows, the shape of the rule
// of each kind, which the family modules give, and what the result says beside the word.
//
// 1. An object with a deletion timestamp has no health, and neither has a kind with no status (P16).
// 2. The rule of each kind names the condition that sums the object up, or what stands for one. When it is
//    `False` the object is Unhealthy; when it is `Unknown`, missing or of any other status, or the object has no
//    status yet, it is Unknown.
// 3. When it is `True`, the object is Degraded if another condition of positive polarity that its rule counts is
//    an issue, and Healthy otherwise. A condition of a third party counts, unless it is a gate (allButInputs).
// 4. What is no issue never makes it Degraded: a condition other than the summary that is `Unknown`, a condition
//    of negative polarity, a `TopologyReconciled` that is `False` for a reason that is no failure, the pending
//    changes of P4 and P5, all of which conditions.ts weighs as something other than Issue, and what the rule of a
//    kind leaves out.
// 5. No activity holds, suspends or replaces the health (D1), and a mark of freshness never changes it (H1): the
//    health reads no clock, no activity and no mark.
//
// Each kind runs its rule with or without a status, so that the notes of the inputs it needs are there in both
// cases; with no status, every rule finds its summary missing, or what stands for it unset, and gives Unknown.

import { conditionOf, weighConditions } from "./conditions";
import { fieldOf, readFields, readText, UNREADABLE } from "./fields";

import type { ConditionsResult, WeightedCondition } from "./conditions";
import type { Fields } from "./fields";
import type { KubeObjectData, ProviderRole, StatusContext } from "./types";

export type HealthWord = "Healthy" | "Degraded" | "Unhealthy" | "Unknown";

export type Health =
  // No health: a kind with no status (P16), or an object that is deleting (H1). The views show N/A.
  | { readonly health: "none"; readonly because: "no status" | "deleting" }
  // The word of the project, what it rests on, and the issues that point 3 counts, whatever the word.
  | { readonly health: HealthWord; readonly restsOn: HealthBasis; readonly issues: readonly Issue[] };

// What the health rests on: the condition that sums the object up, or what stands for one.
export type HealthBasis =
  // The summary as read, undefined when it is missing.
  | { readonly form: "condition"; readonly type: string; readonly condition: WeightedCondition | undefined }
  // The available Machines against `spec.replicas`, for a MachineSet and a MachinePool (P9, P10).
  | { readonly form: "replicas"; readonly available: number | undefined; readonly replicas: number | undefined }
  // The targets of a MachineHealthCheck (P11).
  | {
      readonly form: "targets";
      readonly expectedMachines: number | undefined;
      readonly currentHealthy: number | undefined;
    }
  // The address of an IPAddressClaim that writes no `Ready` (P13).
  | { readonly form: "address"; readonly address: string | undefined }
  // `ResourcesApplied` of a ClusterResourceSet with what each binding records, Cluster by Cluster (P12); undefined
  // when the view gave no bindings.
  | {
      readonly form: "bindings";
      readonly condition: WeightedCondition | undefined;
      readonly clusters: readonly AppliedToCluster[] | undefined;
    }
  // Nothing: no rule names a summary for the object (P15, an object of a kind the model does not know), or a field
  // could not be read.
  | { readonly form: "none" };

// What a ClusterResourceSet applied to one Cluster, from the entry of the binding of that Cluster (P12).
export interface AppliedToCluster {
  readonly cluster: string | undefined;
  readonly resources: readonly {
    readonly kind: string;
    readonly name: string;
    readonly state: "applied" | "not applied" | "missing";
  }[];
}

// An issue of health: what point 3 counts.
export type Issue =
  // A condition that is an issue, or one that the rule of a kind of the operator wants `True` and that is not, or
  // is missing (P14).
  | { readonly form: "condition"; readonly type: string; readonly condition: WeightedCondition | undefined }
  // A MachinePool of a Cluster that is Unhealthy or Degraded (H1).
  | { readonly form: "machine-pool"; readonly name: string | undefined; readonly health: "Unhealthy" | "Degraded" }
  // A Machine of a MachinePool whose `Ready` is `False` (P10), or a target of a MachineHealthCheck whose
  // `HealthCheckSucceeded` is `False` (P11), with that condition.
  | { readonly form: "machine"; readonly name: string | undefined; readonly condition: WeightedCondition }
  // A resource of a ClusterResourceSet missing from, or not applied in, the binding of a Cluster (P12).
  | {
      readonly form: "resource";
      readonly cluster: string | undefined;
      readonly kind: string;
      readonly name: string;
      readonly state: "not applied" | "missing";
    };

// The inputs of the context that a rule may need.
export type ContextInput = Exclude<keyof StatusContext, "now">;

// What the result says next to the health, the marks and the activities. The views phrase each note.
export type Note =
  // An input that a rule needs and that the view did not give: never assumed (SPEC-0003, "What it takes and
  // returns").
  | { readonly code: "input-not-given"; readonly input: ContextInput }
  // A field of the wrong type, read as unknown (SPEC-0003, "States that are not the happy one").
  | { readonly code: "field-unreadable"; readonly field: string }
  // A kind the model does not know, with no role from the view, which an object of a provider needs (P15).
  | { readonly code: "kind-unknown" }
  // The failure reason and message of the deprecated status, never an input of health, which the views show with
  // a "deprecated" label (P6).
  | { readonly code: "deprecated-failure"; readonly reason: string | undefined; readonly message: string | undefined }
  // A Cluster that the project never reports available, for the references it lacks (P7).
  | {
      readonly code: "never-available";
      readonly missing: readonly ("spec.controlPlaneRef" | "spec.infrastructureRef")[];
    }
  // MachinePools of a Cluster whose health is Unknown, which its `Available` leaves out (H1).
  | { readonly code: "machine-pools-unknown"; readonly count: number }
  // A MachinePool with no Machine to stand for its instances, with its deprecated `v1beta1` `Ready`, which the
  // views show with its label (P10).
  | { readonly code: "no-machine"; readonly deprecatedReady: WeightedCondition | undefined }
  // A ClusterResourceSet that applied to no Cluster (P12).
  | { readonly code: "applied-to-no-cluster" }
  // A remediation request, whose status no contract names (P15).
  | { readonly code: "no-contract-status" }
  // A controller whose availability is not known: the mark of P24 is not set on no evidence.
  | { readonly code: "controller-unknown"; readonly provider: string }
  // A condition that records a past failure, no issue and At rest (P14).
  | { readonly code: "stale-condition"; readonly type: string }
  // An object whose Machines differ from its spec while nothing rolls them out (P4).
  | { readonly code: "machines-differ-from-spec" };

// How a pause is requested of a kind (P19): by the annotation `cluster.x-k8s.io/paused` of the object or
// `spec.paused` of its Cluster, by the annotation alone, by the field or the annotation of its Cluster, or not at all.
export type PauseRequest = "object-or-cluster" | "object" | "cluster" | "none";

// The rule of a kind: what the family modules give for each kind, and freshness.ts, activity.ts and tone.ts read.
export interface KindRule {
  // The kind as the project names it, and the version of its group that A2 reads; for an object of a provider, the
  // kind of the object and its role, with no version; for an object of a kind that the model does not know, neither
  // a version nor a role.
  readonly kind: string;
  readonly apiVersion?: string;
  readonly role?: ProviderRole;
  // A kind with no status has no health (P16).
  readonly hasStatus: boolean;
  // The conditions that may sum the object up, the first present winning: what point 2 reads, and where
  // freshness.ts reads a generation when the status keeps none.
  readonly summary: readonly string[];
  // The manifest label of the provider whose controller serves the kind (P24): `from-context` when the view gives
  // it, for an object of a provider and an IPAddressClaim; undefined for the kinds of the operator.
  readonly provider: string | undefined;
  readonly pause: PauseRequest;
  // Where the generation that the status describes is read (Freshness): `status.observedGeneration`, the condition
  // that sums the object up, or the first and else the second.
  readonly observedGeneration: "status" | "summary" | "status-else-summary";
  // Whether the conditions of the kind follow the workload cluster, so that the mark of P25 holds for it.
  readonly followsWorkloadCluster: boolean;
  // Whether an older generation of the kind keeps the topology of its Clusters from reconciling (P8).
  readonly holdsTopologies?: boolean;
  // The closed set of its phase, when it has one.
  readonly phases?: readonly string[];
  // Whether its status keeps the deprecated failure reason and message (P6).
  readonly deprecatedFailure: boolean;
  // The rule of its health, run once point 1 is passed and the status, the spec and the conditions are readable.
  readonly health?: (input: HealthInput) => HealthOutcome;
}

// The rule of a kind with no status (P16): no health, no mark of freshness, and its one activity is Deleting.
export function noStatusRule(kind: string, apiVersion?: string, role?: ProviderRole): KindRule {
  return {
    kind,
    apiVersion,
    role,
    hasStatus: false,
    summary: [],
    provider: undefined,
    pause: "none",
    observedGeneration: "status",
    followsWorkloadCluster: false,
    deprecatedFailure: false,
  };
}

export interface HealthInput {
  readonly object: KubeObjectData;
  readonly spec: Fields | undefined;
  // The status, undefined while the object has none.
  readonly status: Fields | undefined;
  readonly conditions: readonly WeightedCondition[];
  readonly context: StatusContext;
}

export interface HealthOutcome {
  readonly health: Health;
  readonly notes: readonly Note[];
}

// The object a result describes, as the view handed it: a field of the wrong type reads as absent.
export interface ObjectIdentity {
  readonly apiVersion: string | undefined;
  readonly kind: string | undefined;
  readonly name: string | undefined;
  readonly namespace: string | undefined;
}

function textOf(value: unknown): string | undefined {
  const text = readText(value);

  return text === UNREADABLE ? undefined : text;
}

export function identityOf(object: KubeObjectData): ObjectIdentity {
  const metadata = readFields(object.metadata);

  return {
    apiVersion: textOf(object.apiVersion),
    kind: textOf(object.kind),
    name: textOf(fieldOf(metadata, "name")),
    namespace: textOf(fieldOf(metadata, "namespace")),
  };
}

const NO_BASIS: HealthBasis = { form: "none" };

export function unknownHealth(restsOn: HealthBasis = NO_BASIS, issues: readonly Issue[] = []): Health {
  return { health: "Unknown", restsOn, issues };
}

// The word of a summary (points 2 and 3).
export function wordOf(summary: WeightedCondition | undefined, issues: readonly Issue[]): HealthWord {
  if (summary?.status === "False") return "Unhealthy";
  if (summary?.status !== "True") return "Unknown";
  return issues.length > 0 ? "Degraded" : "Healthy";
}

// The conditions other than the summary that are issues and that the rule of the kind counts (points 3 and 4).
export function conditionIssues(
  conditions: readonly WeightedCondition[],
  summary: string | undefined,
  counts: (type: string) => boolean,
): Issue[] {
  return conditions
    .filter((condition) => condition.type !== summary && condition.weight === "Issue" && counts(condition.type))
    .map((condition) => ({ form: "condition", type: condition.type, condition }));
}

// The summary of a kind: the first of its candidates that the object writes, else the first.
export function summaryTypeOf(rule: KindRule, conditions: readonly WeightedCondition[]): string | undefined {
  return rule.summary.find((type) => conditionOf(conditions, type) !== undefined) ?? rule.summary[0];
}

// Points 2 to 4 for a kind whose health a condition sums up, with the issues its rule counts and any other issue
// that it adds.
export function summaryHealth(
  conditions: readonly WeightedCondition[],
  summary: string,
  counts: (type: string) => boolean,
  more: readonly Issue[] = [],
): Health {
  const condition = conditionOf(conditions, summary);
  const issues = [...conditionIssues(conditions, summary, counts), ...more];

  return { health: wordOf(condition, issues), restsOn: { form: "condition", type: summary, condition }, issues };
}

// Every other condition of positive polarity counts, for the kinds whose table says "another condition of positive
// polarity".
export function everyOtherCondition(): boolean {
  return true;
}

// The conditions that point 3 counts on a kind whose summary merges some of its own conditions and its gates: every
// other condition of positive polarity, those of its closed set that its table names and one of a third party, which
// the summary leaves out (H1), but the inputs of the summary, which count only through it (SPEC-0001, R2.21, R2.83).
export function allButInputs(
  inputs: readonly string[],
  gates: ReadonlySet<string> = new Set(),
): (type: string) => boolean {
  return (type) => !inputs.includes(type) && !gates.has(type);
}

// Whether an object is deleting: a deletion timestamp that is text, an unavailable time included, says so.
export function deletionOf(object: KubeObjectData): boolean | typeof UNREADABLE {
  const metadata = readFields(object.metadata);
  const deletion = readText(fieldOf(metadata, "deletionTimestamp"));

  if (metadata === UNREADABLE || deletion === UNREADABLE) return UNREADABLE;
  return deletion !== undefined && deletion !== "";
}

// The rule every kind follows: points 1 and 2, the fields of the wrong type, then the rule of the kind.
export function healthOf(
  rule: KindRule,
  object: KubeObjectData,
  conditions: ConditionsResult,
  context: StatusContext,
): HealthOutcome {
  if (!rule.hasStatus) return { health: { health: "none", because: "no status" }, notes: [] };

  const deleting = deletionOf(object);

  if (deleting === true) return { health: { health: "none", because: "deleting" }, notes: [] };

  const spec = readFields(object.spec);
  const status = readFields(object.status);
  const unreadable = [
    deleting === UNREADABLE ? "metadata.deletionTimestamp" : undefined,
    spec === UNREADABLE ? "spec" : undefined,
    status === UNREADABLE ? "status" : undefined,
  ]
    .filter((field) => field !== undefined)
    .map((field): Note => ({ code: "field-unreadable", field }));

  if (deleting === UNREADABLE || spec === UNREADABLE || status === UNREADABLE || conditions.state === "unknown") {
    return { health: unknownHealth(), notes: unreadable };
  }
  if (rule.health === undefined) return { health: unknownHealth(), notes: [] };
  return rule.health({ object, spec, status, conditions: conditions.conditions, context });
}

// The phase of a kind that has one: the value of its closed set as the project writes it, else Unknown, as the
// getters of the project read any other value (SPEC-0001, R2.17, R2.43, R2.61, R2.68).
export interface Phase {
  readonly phase: string;
  // The phase as written; undefined when the status keeps none.
  readonly written: string | undefined;
  // `Failed`, which no controller sets, takes the "deprecated" label (P6; SPEC-0001, A5).
  readonly deprecated: boolean;
}

export function phaseOf(rule: KindRule, object: KubeObjectData): { phase: Phase | undefined; notes: Note[] } {
  if (rule.phases === undefined) return { phase: undefined, notes: [] };

  const written = readText(fieldOf(readFields(object.status), "phase"));

  if (written === UNREADABLE) {
    return {
      phase: { phase: "Unknown", written: undefined, deprecated: false },
      notes: [{ code: "field-unreadable", field: "status.phase" }],
    };
  }

  const phase = written !== undefined && rule.phases.includes(written) ? written : "Unknown";

  return { phase: { phase, written, deprecated: phase === "Failed" }, notes: [] };
}

// The failure reason and message under `status.deprecated.v1beta1`, as a note and never an input of health (P6):
// the controllers never clear them, so they can outlive the failure they recorded (SPEC-0001, R2.16).
export function deprecatedFailureOf(rule: KindRule, object: KubeObjectData): Note[] {
  if (!rule.deprecatedFailure) return [];

  const v1beta1 = readFields(fieldOf(readFields(fieldOf(readFields(object.status), "deprecated")), "v1beta1"));
  const reason = readText(fieldOf(v1beta1, "failureReason"));
  const message = readText(fieldOf(v1beta1, "failureMessage"));
  const failure = {
    reason: reason === UNREADABLE || reason === "" ? undefined : reason,
    message: message === UNREADABLE || message === "" ? undefined : message,
  };

  return failure.reason === undefined && failure.message === undefined
    ? []
    : [{ code: "deprecated-failure", ...failure }];
}

// The deprecated `v1beta1` `Ready` of an object, which the views show with its label (P10).
export function deprecatedReadyOf(object: KubeObjectData): WeightedCondition | undefined {
  const v1beta1 = readFields(fieldOf(readFields(fieldOf(readFields(object.status), "deprecated")), "v1beta1"));
  const conditions = weighConditions(fieldOf(v1beta1, "conditions"), undefined, {
    kind: undefined,
    gates: new Map(),
    upgradeSettled: false,
  });

  return conditions === undefined || conditions === UNREADABLE ? undefined : conditionOf(conditions, "Ready");
}
