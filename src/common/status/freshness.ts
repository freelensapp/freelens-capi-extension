/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The marks of freshness (SPEC-0003, "Freshness"; SPEC-0001, H1): the causes for which a health is stale. A stale
// health keeps its value, and each mark stands next to it, with the time it began when the project wrote one.
//
// - Paused: the `Paused` condition is `True`, or the pause is requested, as the controllers of the kind honour the
//   request (P19). The pause is also the cause of the generation that its controllers do not observe meanwhile
//   (SPEC-0001, R2.2 and R2.5), so a paused object carries no mark of an older generation: the pause is its own cause.
// - Older generation: the generation that the status describes is below `metadata.generation`; for a ClusterClass,
//   the mark says that the topology of its Clusters is not reconciled until the class is (P8).
// - Controller not available: the view says so in `controllers`, from the object of the operator for the provider;
//   with no evidence the result notes it and marks nothing (P24).
// - Workload cluster unreachable: the `RemoteConnectionProbe` of the Cluster is `False` while its
//   `ControlPlaneInitialized` is `True`, for the kinds whose conditions follow the workload cluster (P25).

import { parseTime } from "../parsers/time";
import { conditionOf, weighConditions } from "./conditions";
import { fieldOf, readCount, readEntry, readFields, readFlag, UNREADABLE } from "./fields";
import { summaryTypeOf } from "./health";

import type { ParsedTime } from "../parsers/time";
import type { ConditionsResult, WeightedCondition } from "./conditions";
import type { KindRule, Note } from "./health";
import type { KubeObjectData, StatusContext } from "./types";

export type FreshnessCause =
  | "Paused"
  | "Older generation"
  | "Controller not available"
  | "Workload cluster unreachable";

export type FreshnessMark =
  // Since the transition of `Paused` to `True`; undefined when the pause is only requested, which has no time.
  | { readonly cause: "Paused"; readonly since: ParsedTime | undefined }
  // No time is written for it.
  | {
      readonly cause: "Older generation";
      readonly generation: number;
      readonly observedGeneration: number;
      readonly topologiesHeld: boolean;
    }
  // Since the time that `controllers` gives for the last change.
  | { readonly cause: "Controller not available"; readonly provider: string; readonly since: ParsedTime | undefined }
  // Since the transition of `RemoteConnectionProbe` to `False`.
  | { readonly cause: "Workload cluster unreachable"; readonly since: ParsedTime | undefined };

export const PAUSED_ANNOTATION = "cluster.x-k8s.io/paused";

// Whether an object is paused, and since when (P19). The activity Paused reads the same.
export interface Pause {
  readonly paused: boolean;
  // The transition of `Paused` to `True`; undefined while the pause is only requested.
  readonly since: ParsedTime | undefined;
}

// Whether a Cluster requests the pause of its objects: by `spec.paused`, and, for the kinds that read its
// annotation too, an IPAddressClaim, by the annotation (P19).
function clusterPauses(cluster: KubeObjectData, withAnnotation: boolean, prefix: string, notes: Note[]): boolean {
  const paused = readFlag(fieldOf(readFields(cluster.spec), "paused"));
  const annotation = withAnnotation ? annotationPauses(cluster, prefix, notes) : false;

  if (paused === UNREADABLE) notes.push({ code: "field-unreadable", field: `${prefix}spec.paused` });
  return paused === true || annotation === true;
}

// The annotation `cluster.x-k8s.io/paused`, by its presence, whatever its value (SPEC-0001, R4.57).
function annotationPauses(object: KubeObjectData, prefix: string, notes: Note[]): boolean {
  const value = readEntry(fieldOf(readFields(object.metadata), "annotations"), PAUSED_ANNOTATION);

  if (value === UNREADABLE) {
    notes.push({ code: "field-unreadable", field: `${prefix}metadata.annotations` });
    return false;
  }
  return value !== undefined;
}

// Whether the pause of an object is requested, as its controllers honour the request: the annotation on the object
// or `spec.paused` of its Cluster, the annotation alone, or the field or the annotation of its Cluster (P19). The
// annotation on a Cluster pauses only the Cluster (SPEC-0001, R4.57).
function pauseRequested(rule: KindRule, object: KubeObjectData, context: StatusContext, notes: Note[]): boolean {
  if (rule.pause === "none") return false;
  if (rule.pause !== "cluster" && annotationPauses(object, "", notes)) return true;
  if (rule.pause === "object") return false;
  // A Cluster is its own Cluster.
  if (rule.kind === "Cluster" && rule.role === undefined) return clusterPauses(object, false, "", notes);
  if (context.cluster === undefined) {
    notes.push({ code: "input-not-given", input: "cluster" });
    return false;
  }
  return clusterPauses(context.cluster, rule.pause === "cluster", "cluster.", notes);
}

export function pauseOf(
  rule: KindRule,
  object: KubeObjectData,
  conditions: readonly WeightedCondition[],
  context: StatusContext,
  notes: Note[],
): Pause {
  const condition = conditionOf(conditions, "Paused");

  if (condition?.status === "True") return { paused: true, since: condition.lastTransitionTime };
  return { paused: pauseRequested(rule, object, context, notes), since: undefined };
}

// The generation that the status describes, where the kind keeps it (SPEC-0003, "Freshness"; SPEC-0001, R2.5, R2.6).
function observedGenerationOf(
  rule: KindRule,
  object: KubeObjectData,
  conditions: readonly WeightedCondition[],
  notes: Note[],
): number | undefined {
  const observed = readCount(fieldOf(readFields(object.status), "observedGeneration"));

  if (observed === UNREADABLE) {
    notes.push({ code: "field-unreadable", field: "status.observedGeneration" });
    return undefined;
  }
  if (
    rule.observedGeneration === "status" ||
    (rule.observedGeneration === "status-else-summary" && observed !== undefined)
  ) {
    return observed;
  }

  const summary = summaryTypeOf(rule, conditions);

  return summary === undefined ? undefined : conditionOf(conditions, summary)?.observedGeneration;
}

function olderGenerationOf(
  rule: KindRule,
  object: KubeObjectData,
  conditions: readonly WeightedCondition[],
  notes: Note[],
): FreshnessMark | undefined {
  const generation = readCount(fieldOf(readFields(object.metadata), "generation"));
  const observedGeneration = observedGenerationOf(rule, object, conditions, notes);

  if (generation === UNREADABLE) {
    notes.push({ code: "field-unreadable", field: "metadata.generation" });
    return undefined;
  }
  if (generation === undefined || observedGeneration === undefined || observedGeneration >= generation) {
    return undefined;
  }
  return { cause: "Older generation", generation, observedGeneration, topologiesHeld: rule.holdsTopologies === true };
}

// The provider that serves the kind, and whether its controller is not available (P24).
function controllerOf(rule: KindRule, context: StatusContext, notes: Note[]): FreshnessMark | undefined {
  const provider = rule.provider === "from-context" ? context.provider : rule.provider;

  if (rule.provider === undefined) return undefined;
  if (provider === undefined) {
    notes.push({ code: "input-not-given", input: "provider" });
    return undefined;
  }
  if (context.controllers === undefined) {
    notes.push({ code: "input-not-given", input: "controllers" });
    return undefined;
  }

  const controller = Object.hasOwn(context.controllers, provider) ? context.controllers[provider] : undefined;

  if (controller?.available === true) return undefined;
  if (controller?.available !== false) {
    notes.push({ code: "controller-unknown", provider });
    return undefined;
  }
  return { cause: "Controller not available", provider, since: parseTime(controller.since) };
}

// Whether the workload cluster of the object cannot be reached since its control plane was initialized (P25).
function unreachableOf(rule: KindRule, context: StatusContext, notes: Note[]): FreshnessMark | undefined {
  if (!rule.followsWorkloadCluster) return undefined;
  if (context.cluster === undefined) {
    notes.push({ code: "input-not-given", input: "cluster" });
    return undefined;
  }

  const conditions = weighConditions(fieldOf(readFields(context.cluster.status), "conditions"), undefined, {
    kind: "Cluster",
    gates: new Map(),
    upgradeSettled: false,
  });

  if (conditions === UNREADABLE) {
    notes.push({ code: "field-unreadable", field: "cluster.status.conditions" });
    return undefined;
  }

  const probe = conditionOf(conditions ?? [], "RemoteConnectionProbe");
  const initialized = conditionOf(conditions ?? [], "ControlPlaneInitialized");

  return probe?.status === "False" && initialized?.status === "True"
    ? { cause: "Workload cluster unreachable", since: probe.lastTransitionTime }
    : undefined;
}

export interface Freshness {
  readonly marks: readonly FreshnessMark[];
  readonly pause: Pause;
  readonly notes: readonly Note[];
}

// The marks of an object, with its pause, which the activity Paused reads, and the notes of what was not read. A kind
// with no status gets none: its rule requests no pause, names no provider and follows no workload cluster, and it
// keeps no generation.
export function freshnessOf(
  rule: KindRule,
  object: KubeObjectData,
  conditions: ConditionsResult,
  context: StatusContext,
): Freshness {
  const notes: Note[] = [];
  const read = conditions.state === "read" ? conditions.conditions : [];
  const pause = pauseOf(rule, object, read, context, notes);
  const marks = [
    pause.paused ? ({ cause: "Paused", since: pause.since } as const) : undefined,
    pause.paused ? undefined : olderGenerationOf(rule, object, read, notes),
    controllerOf(rule, context, notes),
    unreachableOf(rule, context, notes),
  ];

  return { marks: marks.filter((mark) => mark !== undefined), pause, notes };
}
