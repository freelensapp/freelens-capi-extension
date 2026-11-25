/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The tone of the mark of health (SPEC-0003, "The tone of the health"; D2, P2, P31). What an activity changes is the
// tone of the mark, never its word: while the object has an activity in progress, or one that it takes for its
// tone, an Unhealthy or Degraded health takes the tone of progress; once every such activity has outlasted its
// threshold, the tone of a warning; with no activity in progress, Idle, Unknown, Paused or Blocked, the tone of its
// health. Healthy and Unknown keep their own tone, and an object with no health has no mark.
//
// An object takes for its tone (D2):
// - every object of a Cluster, its control plane included, the first provisioning of that Cluster, while its control
//   plane is not initialized;
// - a ClusterResourceSet, the first provisioning of the Clusters of its bindings that cannot be reached yet, whose
//   `RemoteConnectionProbe` is not `True`;
// - along the chain of a part, an owner the Provisioning and the Updating of its Machines, and a Cluster the
//   activities of its parts, with the activity that sets the tone of each, so that a part lends its tone to its
//   Cluster, never to a sibling.
// Each keeps the start and the threshold that it has on the object that holds it (P2). A paused object takes none:
// its controllers stop with it, and its activities are Blocked (P33).

import {
  ACTIVITY_NAMES,
  belongsToCluster,
  clusterPartsOf,
  firstProvisioningOf,
  isClusterRule,
  isInProgress,
  isOwnerRule,
  machineActivitiesOf,
  partActivities,
  uniqueNotes,
} from "./activity";
import { conditionOf, readConditions } from "./conditions";
import { fieldOf, isFields, readFields, readList, readText } from "./fields";
import { identityOf } from "./health";

import type { Activities, Activity } from "./activity";
import type { Health, KindRule, Note, ObjectIdentity } from "./health";
import type { ObjectStatus } from "./index";
import type { KubeObjectData, StatusContext } from "./types";

// The tone of the mark of health: progress, a warning, or the tone of the health itself.
export type HealthTone = "progress" | "warning" | "health";

// The activity that sets the tone, with the object that holds it: the object itself, one of its Machines, a part
// of its Cluster, or the Cluster whose first provisioning it takes (D2).
export interface ToneSetter {
  readonly activity: Activity;
  readonly heldBy: ObjectIdentity;
}

export interface Tone {
  readonly state: "read";
  readonly tone: HealthTone;
  // The activity that sets a tone of progress or of a warning, which the details show with its threshold.
  readonly setBy: ToneSetter | undefined;
  // The earliest instant at which the tone would change with the passing of time alone.
  readonly changesAt: number | undefined;
  // What was not read, such as the Cluster or the MachineHealthChecks that the view did not give.
  readonly notes: readonly Note[];
}

export interface ToneInput {
  readonly object: KubeObjectData;
  readonly rule: KindRule;
  readonly health: Health;
  readonly activities: Activities;
  readonly context: StatusContext;
}

// An activity that the object has in progress or takes for its tone.
interface Source extends ToneSetter {
  readonly own: boolean;
}

function toneWith(tone: HealthTone, notes: readonly Note[], setter?: Source, changesAt?: number): Tone {
  return {
    state: "read",
    tone,
    setBy: setter === undefined ? undefined : { activity: setter.activity, heldBy: setter.heldBy },
    changesAt,
    notes: uniqueNotes(notes),
  };
}

// The first provisioning of the Cluster of an object, while it is in progress (D2).
function takeFirstProvisioning(context: StatusContext, sources: Source[], notes: Note[]): void {
  if (context.cluster === undefined) {
    notes.push({ code: "input-not-given", input: "cluster" });
    return;
  }

  const activity = firstProvisioningOf(context.cluster, context, notes);

  if (activity !== undefined && isInProgress(activity)) {
    sources.push({ activity, heldBy: identityOf(context.cluster), own: false });
  }
}

// The first provisioning of the Clusters of the bindings of a ClusterResourceSet that cannot be reached yet (D2): the
// bindings that hold an entry for it, each with its Cluster.
function takeBindings(object: KubeObjectData, context: StatusContext, sources: Source[], notes: Note[]): void {
  const owner = identityOf(object).name;

  for (const { binding, cluster } of context.bindings ?? []) {
    const entries = readList(fieldOf(readFields(binding.spec), "bindings"));
    const holds =
      Array.isArray(entries) &&
      entries.some((entry) => readText(fieldOf(readFields(entry), "clusterResourceSetName")) === owner);

    if (!holds) continue;
    if (cluster === undefined) {
      notes.push({ code: "input-not-given", input: "cluster" });
      continue;
    }

    const conditions = readConditions(cluster, "Cluster", context);
    const probe = conditions.state === "read" ? conditionOf(conditions.conditions, "RemoteConnectionProbe") : undefined;
    const activity = firstProvisioningOf(cluster, context, notes);

    if (activity !== undefined && isInProgress(activity) && probe?.status !== "True") {
      sources.push({ activity, heldBy: identityOf(cluster), own: false });
    }
  }
}

// The Provisioning and the Updating of the Machines of an owner, each as the Machine holds it (D2).
function takeMachines(context: StatusContext, sources: Source[], notes: Note[]): void {
  for (const machine of context.machines ?? []) {
    const activities = machineActivitiesOf(machine, context);

    if (activities.state !== "read") continue;
    notes.push(...activities.notes.filter((note) => note.code === "input-not-given"));
    for (const activity of activities.activities) {
      if ((activity.name === "Provisioning" || activity.name === "Updating") && isInProgress(activity)) {
        sources.push({ activity, heldBy: identityOf(machine), own: false });
      }
    }
  }
}

// The activity that sets the tone of a part, from the result of statusOf that the view gives.
function setterOf(part: ObjectStatus): ToneSetter | undefined {
  const value: unknown = part;
  const tone = isFields(value) ? value.tone : undefined;
  const setter = isFields(tone) ? tone.setBy : undefined;

  if (!isFields(setter) || !isFields(setter.activity) || !isFields(setter.heldBy)) return undefined;
  return setter as unknown as ToneSetter;
}

// The object that a part describes; one that the view built wrong names nothing.
function partIdentity(part: ObjectStatus): ObjectIdentity {
  const value: unknown = part;
  const object = isFields(value) ? value.object : undefined;

  return isFields(object)
    ? (object as unknown as ObjectIdentity)
    : { apiVersion: undefined, kind: undefined, name: undefined, namespace: undefined };
}

// The activities of the parts of a Cluster, and the activity that sets the tone of each, as the part holds them (D2).
function takeParts(context: StatusContext, sources: Source[]): void {
  for (const part of clusterPartsOf(context).all) {
    const heldBy = partIdentity(part);
    const setter = setterOf(part);

    for (const activity of partActivities(part) ?? []) {
      if (isInProgress(activity)) sources.push({ activity, heldBy, own: false });
    }
    if (setter !== undefined && isInProgress(setter.activity)) sources.push({ ...setter, own: false });
  }
}

// The order in which the activities set the tone: the one that stays within its threshold the longest first, an
// activity with no start last; then the object's own before those it takes, in the order of ACTIVITY_NAMES.
function compareSources(one: Source, other: Source): number {
  const mine = one.activity.threshold?.passesAt;
  const theirs = other.activity.threshold?.passesAt;

  if (mine !== theirs) {
    if (mine === undefined) return 1;
    if (theirs === undefined) return -1;
    return theirs - mine;
  }
  if (one.own !== other.own) return one.own ? -1 : 1;
  return ACTIVITY_NAMES.indexOf(one.activity.name) - ACTIVITY_NAMES.indexOf(other.activity.name);
}

export function toneOf(input: ToneInput): Tone {
  const { object, rule, health, activities, context } = input;

  if (health.health !== "Unhealthy" && health.health !== "Degraded") return toneWith("health", []);
  if (activities.state !== "read" || activities.activities.some((activity) => activity.name === "Paused")) {
    return toneWith("health", []);
  }

  const notes: Note[] = [];
  const own = identityOf(object);
  const sources: Source[] = activities.activities
    .filter(isInProgress)
    .map((activity) => ({ activity, heldBy: own, own: true }));

  if (belongsToCluster(rule)) takeFirstProvisioning(context, sources, notes);
  if (rule.apiVersion !== undefined && rule.kind === "ClusterResourceSet")
    takeBindings(object, context, sources, notes);
  if (isOwnerRule(rule)) takeMachines(context, sources, notes);
  if (isClusterRule(rule)) takeParts(context, sources);
  if (sources.length === 0) return toneWith("health", notes);

  const now = Number.isFinite(context.now) ? context.now : undefined;
  const ordered = [...sources].sort(compareSources);

  if (now === undefined) {
    notes.push({ code: "field-unreadable", field: "now" });
    return toneWith("warning", notes, ordered[0]);
  }

  // Progress while one of them is within its threshold, until the last of those outlasts its own.
  const within = ordered.find((source) => (source.activity.threshold?.passesAt ?? -Infinity) > now);

  if (within !== undefined) return toneWith("progress", notes, within, within.activity.threshold?.passesAt);
  return toneWith("warning", notes, ordered[0]);
}
