/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The conditions of an object and the weight of each (SPEC-0003, "The weight of a condition"; SPEC-0001, H3). A
// condition of positive polarity weighs Ok when `True` and Issue when `False`; one of negative polarity weighs
// Activity when `True` and At rest when `False`; any condition weighs Unknown when its status is neither `True` nor
// `False`. The types of negative polarity are a closed set of seven, which the project does not declare as such
// (SPEC-0001, R2.20), and a gate declared `Negative`; every other type is positive, a condition of a provider and a
// type that the release does not define included. A few conditions change their weight by the rule of their kind:
// a `TopologyReconciled` of a Cluster that is `False` for a reason that is no failure (H3, P22), the pending changes
// of P4 and P5, and a stale `ProviderUpgraded` of a kind of the operator (P14). No other condition changes its
// weight while a change is in flight (D1).
//
// The conditions keep the order in which the controllers store them (SPEC-0001, R2.94), each with its parsed
// message, the time of its last transition, and whether it describes an older generation than the object (P23).

import { parseConditionMessage } from "../parsers/condition-message";
import { parseTime } from "../parsers/time";
import { fieldOf, readCount, readFields, readList, readText, UNREADABLE } from "./fields";

import type { ConditionMessage } from "../parsers/condition-message";
import type { ParsedTime } from "../parsers/time";
import type { Unreadable } from "./fields";
import type { Note } from "./health";
import type { KubeObjectData, StatusContext } from "./types";

export type Weight = "Ok" | "Issue" | "Activity" | "At rest" | "Unknown";

// The polarity of a condition: unknown for a gate whose `polarity` is neither `Positive`, `Negative` nor empty (P22).
export type Polarity = "positive" | "negative" | "unknown";

// The types of negative polarity (SPEC-0001, H3 and R2.20).
export const NEGATIVE_TYPES: readonly string[] = [
  "Paused",
  "Deleting",
  "RollingOut",
  "ScalingUp",
  "ScalingDown",
  "Remediating",
  "Updating",
];

// The reasons of the `TopologyReconciled` of a Cluster that this release defines (SPEC-0001, R2.23;
// api/core/v1beta2/cluster_types.go:70-147), the six that it deprecates and never sets included. Each but the two
// failures weighs Activity when the condition is `False`, and a reason outside the set weighs Unknown (P22); the
// activity Upgrading of a Cluster reads the same set (activity.ts).
const TOPOLOGY_FAILURES: readonly string[] = ["ReconcileFailed", "ClusterClassNotReconciled"];
export const TOPOLOGY_REASONS: readonly string[] = [
  ...TOPOLOGY_FAILURES,
  "ReconcileSucceeded",
  "Paused",
  "Deleting",
  "ClusterCreating",
  "ClusterUpgrading",
  "MachineDeploymentsUpgradeDeferred",
  "MachinePoolsUpgradeDeferred",
  "ControlPlaneUpgradePending",
  "MachineDeploymentsCreatePending",
  "MachineDeploymentsUpgradePending",
  "MachinePoolsUpgradePending",
  "MachinePoolsCreatePending",
  "LifecycleHookBlocking",
];

// The conditions that say that a change is pending, not that something is wrong: they weigh Activity when `False`,
// never Issue (P4).
const PENDING_CHANGES: Readonly<Record<string, readonly string[]>> = {
  Cluster: ["ControlPlaneMachinesUpToDate", "WorkerMachinesUpToDate"],
  Machine: ["UpToDate"],
  MachineSet: ["MachinesUpToDate"],
  MachineDeployment: ["MachinesUpToDate"],
  KubeadmControlPlane: ["MachinesUpToDate"],
};

// The kinds of the operator, whose `ProviderUpgraded` can be stale (P14).
const OPERATOR_KINDS: readonly string[] = [
  "CoreProvider",
  "BootstrapProvider",
  "ControlPlaneProvider",
  "InfrastructureProvider",
  "AddonProvider",
  "IPAMProvider",
  "RuntimeExtensionProvider",
];

export interface WeightedCondition {
  readonly type: string;
  // The status as written: `True`, `False`, `Unknown` or any other text, undefined when it is not text.
  readonly status: string | undefined;
  readonly reason: string | undefined;
  // The message as written, and its lines (SPEC-0003, P27).
  readonly message: string | undefined;
  readonly parsedMessage: ConditionMessage;
  readonly lastTransitionTime: ParsedTime;
  readonly observedGeneration: number | undefined;
  // Whether its `observedGeneration` is below the `metadata.generation` of the object (P23).
  readonly olderGeneration: boolean;
  readonly polarity: Polarity;
  readonly weight: Weight;
  // The severity of a condition of the v1beta1 contract, which the views show with a "deprecated" label; it has no
  // weight, since the mirror of the project copies only the status, the reason, the message and the time (P15).
  readonly severity: string | undefined;
}

// What the weight of a condition depends on, beyond the condition itself.
export interface WeighingRules {
  // The kind of the object, for the rules of P4, P5, P14 and P22; undefined for an object of a provider.
  readonly kind: string | undefined;
  // The gates of the object, by condition type, with the `polarity` as written.
  readonly gates: ReadonlyMap<string, unknown>;
  // For a kind of the operator, whether its `status.installedVersion` is its `spec.version` (P14).
  readonly upgradeSettled: boolean;
}

export type ConditionsResult =
  // The conditions in the order stored, and the notes of what could not be read for their weights.
  | { readonly state: "read"; readonly conditions: readonly WeightedCondition[]; readonly notes: readonly Note[] }
  // A status or a list of conditions of the wrong type.
  | { readonly state: "unknown"; readonly notes: readonly Note[] };

function polarityOf(type: string, gates: ReadonlyMap<string, unknown>): Polarity {
  if (NEGATIVE_TYPES.includes(type)) return "negative";
  if (!gates.has(type)) return "positive";

  const polarity = gates.get(type);

  if (polarity === "Negative") return "negative";
  return polarity === "Positive" || polarity === undefined || polarity === "" ? "positive" : "unknown";
}

// The weight of a condition of positive polarity that is `False`, by the rule of its kind.
function weightOfPositiveFalse(type: string, reason: string | undefined, rules: WeighingRules): Weight {
  const kind = rules.kind ?? "";

  if (kind === "Cluster" && type === "TopologyReconciled") {
    if (reason !== undefined && TOPOLOGY_FAILURES.includes(reason)) return "Issue";
    return reason !== undefined && TOPOLOGY_REASONS.includes(reason) ? "Activity" : "Unknown";
  }
  if (PENDING_CHANGES[kind]?.includes(type)) return "Activity";
  if (kind === "Machine" && type === "Available" && reason === "WaitingForMinReadySeconds") return "Activity";
  if (OPERATOR_KINDS.includes(kind) && type === "ProviderUpgraded" && rules.upgradeSettled) return "At rest";
  return "Issue";
}

// The weight of a condition (H3), with the rules of its kind.
export function weightOf(
  condition: { readonly type: string; readonly status: string | undefined; readonly reason: string | undefined },
  rules: WeighingRules,
): { polarity: Polarity; weight: Weight } {
  const polarity = polarityOf(condition.type, rules.gates);
  const { status } = condition;

  if (polarity === "unknown" || (status !== "True" && status !== "False")) return { polarity, weight: "Unknown" };
  if (polarity === "negative") return { polarity, weight: status === "True" ? "Activity" : "At rest" };
  return {
    polarity,
    weight: status === "True" ? "Ok" : weightOfPositiveFalse(condition.type, condition.reason, rules),
  };
}

function textOrUndefined(value: unknown): string | undefined {
  const text = readText(value);

  return text === UNREADABLE ? undefined : text;
}

// One entry of a list of conditions: an object with a type. A status, a reason or a message of the wrong type reads
// as absent, which weighs Unknown where it matters; a type that is not text makes the list unreadable.
function readCondition(
  entry: unknown,
  generation: number | undefined,
  rules: WeighingRules,
): WeightedCondition | Unreadable {
  const fields = readFields(entry);
  const type = readText(fieldOf(fields, "type"));

  if (fields === undefined || fields === UNREADABLE || type === undefined || type === UNREADABLE || type === "") {
    return UNREADABLE;
  }

  const status = textOrUndefined(fields.status);
  const reason = textOrUndefined(fields.reason);
  const message = textOrUndefined(fields.message);
  const observed = readCount(fields.observedGeneration);
  const observedGeneration = observed === UNREADABLE ? undefined : observed;

  return {
    type,
    status,
    reason,
    message,
    parsedMessage: parseConditionMessage(message ?? ""),
    lastTransitionTime: parseTime(fields.lastTransitionTime),
    observedGeneration,
    olderGeneration: observedGeneration !== undefined && generation !== undefined && observedGeneration < generation,
    ...weightOf({ type, status, reason }, rules),
    severity: textOrUndefined(fields.severity),
  };
}

// A list of conditions, read and weighed in the order stored; unreadable when it is not a list or one of its
// entries is not a condition.
export function weighConditions(
  value: unknown,
  generation: number | undefined,
  rules: WeighingRules,
): readonly WeightedCondition[] | undefined | Unreadable {
  const list = readList(value);

  if (list === undefined || list === UNREADABLE) return list;

  const conditions: WeightedCondition[] = [];

  for (const entry of list) {
    const condition = readCondition(entry, generation, rules);

    if (condition === UNREADABLE) return UNREADABLE;
    conditions.push(condition);
  }
  return conditions;
}

// The first condition of a type.
export function conditionOf(conditions: readonly WeightedCondition[], type: string): WeightedCondition | undefined {
  return conditions.find((condition) => condition.type === type);
}

// The gates of an object, by condition type, with the `polarity` of each as written: those of
// `spec.availabilityGates` of a Cluster, or of its ClusterClass when the Cluster has none (SPEC-0001, R2.21), and
// those of `spec.readinessGates` of a Machine (R2.46).
function gatesOf(
  object: KubeObjectData,
  kind: string | undefined,
  context: StatusContext,
  listing: boolean,
  notes: Note[],
): ReadonlyMap<string, unknown> {
  const spec = readFields(object.spec);
  let field: string | undefined;
  let value: unknown;

  if (kind === "Cluster") {
    field = "spec.availabilityGates";
    value = fieldOf(spec, "availabilityGates");
    if (value === undefined || value === null) {
      const topology = fieldOf(spec, "topology");

      if (context.clusterClass === undefined) {
        if (listing && topology !== undefined && topology !== null) {
          notes.push({ code: "input-not-given", input: "clusterClass" });
        }
        return new Map();
      }
      field = "clusterClass.spec.availabilityGates";
      value = fieldOf(readFields(context.clusterClass.spec), "availabilityGates");
    }
  } else if (kind === "Machine") {
    field = "spec.readinessGates";
    value = fieldOf(spec, "readinessGates");
  }

  const gates = new Map<string, unknown>();
  const list = readList(value);

  if (list === UNREADABLE) {
    notes.push({ code: "field-unreadable", field: field ?? "" });
    return gates;
  }
  for (const entry of list ?? []) {
    const gate = readFields(entry);
    const type = readText(fieldOf(gate, "conditionType"));

    if (gate === UNREADABLE || type === UNREADABLE || type === undefined) {
      notes.push({ code: "field-unreadable", field: field ?? "" });
      return new Map();
    }
    gates.set(type, gate?.polarity);
  }
  return gates;
}

// Whether a kind of the operator has installed the version of its spec, which makes a `ProviderUpgraded` `False`
// stale: only an upgrade that succeeds writes it `True`, and the operator does not try one once the versions match,
// comparing them as text (P14; cluster-api-operator:internal/controller/phase_lifecycle.go:49-54).
export function upgradeSettled(object: KubeObjectData): boolean {
  const installed = readText(fieldOf(readFields(object.status), "installedVersion"));
  const wanted = readText(fieldOf(readFields(object.spec), "version"));

  return typeof installed === "string" && installed === wanted;
}

// The `metadata.generation` of an object; undefined, and noted, when it is of the wrong type.
export function generationOf(object: KubeObjectData, notes: Note[]): number | undefined {
  const generation = readCount(fieldOf(readFields(object.metadata), "generation"));

  if (generation === UNREADABLE) {
    notes.push({ code: "field-unreadable", field: "metadata.generation" });
    return undefined;
  }
  return generation;
}

// The conditions of an object with their weights. Those of a kind of Cluster API or of the operator are in
// `status.conditions`; those of an object of a provider, whose `kind` is undefined here, are in
// `status.v1beta2.conditions` when that list is present, taken whole, and in `status.conditions` otherwise, as the
// project reads them (SPEC-0001, R2.93; P15). The gates of the ClusterClass of a Cluster weigh only conditions that
// the rule of a Cluster does not count, so only the list of the conditions notes a class that the view did not give.
export function readConditions(
  object: KubeObjectData,
  kind: string | undefined,
  context: StatusContext,
  listing = false,
): ConditionsResult {
  const notes: Note[] = [];
  const status = readFields(object.status);

  if (status === UNREADABLE) return { state: "unknown", notes: [{ code: "field-unreadable", field: "status" }] };

  const generation = generationOf(object, notes);
  const rules: WeighingRules = {
    kind,
    gates: gatesOf(object, kind, context, listing, notes),
    upgradeSettled: upgradeSettled(object),
  };
  let field = "status.conditions";
  let value = fieldOf(status, "conditions");

  if (kind === undefined) {
    const v1beta2 = readFields(fieldOf(status, "v1beta2"));
    const listed = fieldOf(v1beta2, "conditions");

    if (v1beta2 === UNREADABLE)
      return { state: "unknown", notes: [...notes, { code: "field-unreadable", field: "status.v1beta2" }] };
    if (listed !== undefined && listed !== null) {
      field = "status.v1beta2.conditions";
      value = listed;
    }
  }

  const conditions = weighConditions(value, generation, rules);

  if (conditions === UNREADABLE) return { state: "unknown", notes: [...notes, { code: "field-unreadable", field }] };
  return { state: "read", conditions: conditions ?? [], notes };
}
