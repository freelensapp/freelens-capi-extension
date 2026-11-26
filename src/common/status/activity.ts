/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What an object is doing (SPEC-0003, "Activity"; SPEC-0001, H2): each activity that holds, with its state, the
// start of its duration and the tone of its mark; Idle when every source of activity was read and none holds; and
// Unknown, next to the activities that hold, when a source cannot be read (P1).
//
// - The sources. Deleting comes from the deletion timestamp, and Paused from the pause that freshness.ts reads (P19).
//   The others come from the conditions of the same names on any kind that writes them (P1, P4), from the Machines
//   of an owner and the parts of a Cluster (D3), from the field that the contract of an object of a provider names
//   (P17), from the installed version of a kind of the operator (P14), from the versions of a control plane (P28),
//   and from the counters of a MachinePool (P20). A deleting object does nothing else: its deletion is what it does
//   (D3).
// - The state. An activity is Blocked while the object is paused, and when the project names a failure or a stop
//   (P33, D4, P18, P21); Unknown when the reason of its condition is `InternalError` or, on a kind of Cluster API, a
//   reason this release does not define (P1); and Progressing otherwise. The text ` is blocked because` of a scale
//   stays in the message and is never read as Blocked (D4).
// - The clock. An activity in progress, and Deleting, have a threshold (D2, P2): that of one Machine, the 30 minutes
//   of a Cluster or the 15 minutes of a deletion, counted from the start that the project wrote, held to the creation
//   of the object (P34). For what is in progress, the 30 minutes after the creation of the Cluster of the object are
//   a floor. An activity whose start the project did not write counts as past its threshold. No rule assumes that an
//   activity ends: one that lasts only outlasts its threshold.

import { compareKubernetesVersions, parseKubernetesVersion } from "../parsers/kubernetes-version";
import { parseTime } from "../parsers/time";
import { CLUSTER_RULE, isSet } from "./cluster";
import { conditionOf, readConditions, TOPOLOGY_REASONS, upgradeSettled } from "./conditions";
import {
  fieldOf,
  isFields,
  readCount,
  readEntry,
  readFields,
  readFlag,
  readList,
  readText,
  UNREADABLE,
} from "./fields";
import { namesNoCluster, pauseOf } from "./freshness";
import { deletionOf, identityOf } from "./health";
import { MACHINE_PHASES, MACHINE_RULE } from "./machines";

import type { ParsedTime } from "../parsers/time";
import type { ConditionsResult, WeightedCondition } from "./conditions";
import type { Fields } from "./fields";
import type { Pause } from "./freshness";
import type { KindRule, Note, ObjectIdentity } from "./health";
import type { ObjectStatus } from "./index";
import type { KubeObjectData, StatusContext } from "./types";

// The closed set of H2, with Replacing (D3), in the order in which the views list the activities that hold.
export const ACTIVITY_NAMES = [
  "Deleting",
  "Paused",
  "Rollout paused",
  "Provisioning",
  "Upgrading",
  "Rolling out",
  "Scaling up",
  "Scaling down",
  "Remediating",
  "Updating",
  "Replacing",
] as const;

export type ActivityName = (typeof ACTIVITY_NAMES)[number];

// The state of an activity (P1, D4). An activity is in progress when it is one of Provisioning to Replacing and its
// state is Progressing.
export type ActivityState = "Progressing" | "Blocked" | "Unknown";

// The tone of the mark of an activity (P31): progress within its threshold; a warning past it, or while Blocked;
// vague while its state is Unknown; terminated for Deleting within its 15 minutes, Paused and Rollout paused.
export type ActivityTone = "progress" | "warning" | "vague" | "terminated";

// The threshold past which an activity in progress turns the tone of the health into a warning (D2, P2).
export interface Threshold {
  // Its length: that of one Machine, the 30 minutes of a Cluster, or the 15 minutes of a deletion.
  readonly seconds: number;
  // The instant, in milliseconds since the Unix epoch, at which the activity outlasts it, the floor of the 30
  // minutes of its Cluster included; undefined when the project wrote no start, which counts as past it.
  readonly passesAt: number | undefined;
}

export interface Activity {
  readonly name: ActivityName;
  readonly state: ActivityState;
  // The start of its duration as the project wrote it, never before the creation of the object, which the views
  // hand to the duration component of the host (P34); undefined where the project writes none.
  readonly since: ParsedTime | undefined;
  // The threshold of an activity in progress and of Deleting; undefined for one that has no clock: Paused, Rollout
  // paused, and an activity that is Blocked or Unknown.
  readonly threshold: Threshold | undefined;
  readonly tone: ActivityTone;
  // The condition it comes from, with its reason and its message, when it comes from one.
  readonly condition: WeightedCondition | undefined;
  // The object that makes it hold, when it is another: the Machine of an owner that is Provisioning or deleting,
  // the part of a Cluster.
  readonly source: ObjectIdentity | undefined;
}

export type Activities =
  // A kind with no status that is not deleting: no activity, and neither Idle nor Unknown (P16).
  | { readonly state: "none" }
  | {
      readonly state: "read";
      // The activities that hold, in the order of ACTIVITY_NAMES.
      readonly activities: readonly Activity[];
      // Every source of activity was read and none holds.
      readonly idle: boolean;
      // A source of activity cannot be read (P1).
      readonly unknown: boolean;
      // The earliest instant at which an activity would change with the passing of time alone.
      readonly changesAt: number | undefined;
      // What was not read, such as the Machines or the parts that the view did not give, and the note of P4.
      readonly notes: readonly Note[];
    };

export interface ActivityInput {
  readonly object: KubeObjectData;
  readonly rule: KindRule;
  // The conditions of the object with their weights; unknown when its status or its conditions cannot be read.
  readonly conditions: ConditionsResult;
  // Its pause, as freshness.ts reads it (P19), for the activity Paused and the Blocked of P33.
  readonly pause: Pause;
  readonly context: StatusContext;
}

// The three thresholds of D2, in seconds: one Machine, the default that the project gives the time it allows a Node
// to start (R2.97); the first provisioning of a Cluster; a deletion, after which the project calls it stale (R2.47).
const MACHINE_SECONDS = 600;
const CLUSTER_SECONDS = 1800;
const DELETION_SECONDS = 900;

// The activities that can be in progress.
const IN_PROGRESS: readonly ActivityName[] = [
  "Provisioning",
  "Upgrading",
  "Rolling out",
  "Scaling up",
  "Scaling down",
  "Remediating",
  "Updating",
  "Replacing",
];

// The conditions of an activity and the activities they give (H2, P1).
const ACTIVITY_OF: Readonly<Record<string, ActivityName>> = {
  RollingOut: "Rolling out",
  ScalingUp: "Scaling up",
  ScalingDown: "Scaling down",
  Remediating: "Remediating",
  Updating: "Updating",
};

// The reasons with which this release writes each of them `True`, for a kind of Cluster API
// (api/core/v1beta2/condition_consts.go:125-144, 176; api/core/v1beta2/machine_types.go:177-186). Any other reason
// gives the state Unknown there; the reasons of a provider are an open set, where only `InternalError` does (P1).
const TRUE_REASONS: Readonly<Record<string, readonly string[]>> = {
  RollingOut: ["RollingOut"],
  ScalingUp: ["ScalingUp"],
  ScalingDown: ["ScalingDown"],
  Remediating: ["Remediating"],
  Updating: ["InPlaceUpdating", "InPlaceUpdateFailed"],
  Paused: ["Paused"],
};

// The stages of `Deleting` of each kind that writes it (SPEC-0001, R2.25, R2.49, R2.81;
// api/core/v1beta2/machineset_types.go:253; api/core/v1beta2/machinedeployment_types.go:229).
const DELETING_REASONS: Readonly<Record<string, readonly string[]>> = {
  Cluster: [
    "WaitingForBeforeDeleteHook",
    "WaitingForWorkersDeletion",
    "WaitingForControlPlaneDeletion",
    "WaitingForInfrastructureDeletion",
    "DeletionCompleted",
  ],
  Machine: [
    "Deleting",
    "WaitingForPreDrainHook",
    "DrainingNode",
    "WaitingForVolumeDetach",
    "WaitingForPreTerminateHook",
    "WaitingForInfrastructureDeletion",
    "WaitingForBootstrapDeletion",
    "DeletionCompleted",
    "DeletingNode",
  ],
  MachineSet: ["Deleting"],
  MachineDeployment: ["Deleting"],
  KubeadmControlPlane: ["WaitingForWorkersDeletion", "WaitingForMachineDeletion", "DeletionCompleted"],
};

// The conditions of an activity that a kind of Cluster API is to write, whose absence leaves a source of its activity
// unread (P1): those that each kind writes, and for a MachinePool the two that it does not write at v1beta2
// (SPEC-0001, R2.69), so that its activity is never Idle.
const ACTIVITY_SOURCES: Readonly<Record<string, readonly string[]>> = {
  Cluster: ["RollingOut", "ScalingUp", "ScalingDown", "Remediating"],
  Machine: ["Updating"],
  MachineSet: ["ScalingUp", "ScalingDown", "Remediating"],
  MachineDeployment: ["RollingOut", "ScalingUp", "ScalingDown", "Remediating"],
  MachinePool: ["RollingOut", "Remediating"],
  KubeadmControlPlane: ["RollingOut", "ScalingUp", "ScalingDown", "Remediating"],
};

// The kinds whose Machines make them Provisioning and Replacing (D3).
const OWNERS: readonly string[] = ["MachineSet", "MachineDeployment", "MachinePool", "KubeadmControlPlane"];

// The phases of a Machine that this release writes, and those of a Machine with no Node yet, which the project
// computes from its bootstrap data, its infrastructure and its `status.nodeRef` (SPEC-0001, R2.43; D3).
const MACHINE_PHASES_READ: readonly string[] = MACHINE_PHASES;
const NO_NODE_PHASES: readonly string[] = ["Pending", "Provisioning", "Provisioned"];

const OPERATOR_VERSION = "operator.cluster.x-k8s.io/v1alpha2";

// The texts that D4 reads, each pinned to this release and checked by the drift watch (P27): a lifecycle hook that
// holds a deletion or an upgrade, which the topology controller writes in the `TopologyReconciled` of a Cluster
// (exp/topology/scope/hookresponsetracker.go:84-105), and the remediation that a rollout makes needless
// (core/reconcilers/machineset/machineset_controller.go:1680-1692).
const DELETE_HOOK_TEXT = "Following hooks are blocking delete";
const UPGRADE_HOOK_TEXT = "Following hooks are blocking upgrade";
const ROLLOUT_REMOVAL_TEXT = "Machine won't be remediated because it is pending removal due to rollout";

// The reasons of `OwnerRemediated` and `ExternallyRemediated` (P21; api/core/v1beta2/machine_types.go:329-360;
// api/core/v1beta2/machineset_types.go:226-240;
// api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:307-321).
const OWNER_REMEDIATED_REASONS: readonly string[] = [
  "WaitingForRemediation",
  "CannotBeRemediated",
  "RemediationDeferred",
  "MachineDeleting",
];
const EXTERNALLY_REMEDIATED_REASONS: readonly string[] = [
  "WaitingForRemediation",
  "RemediationTemplateNotFound",
  "RemediationRequestCreationFailed",
];

// The reasons of the `TopologyReconciled` of a Cluster that say that it upgrades, and those of them that say that an
// upgrade is deferred, which D4 counts as a stop (SPEC-0001, R2.23).
const UPGRADE_REASONS: readonly string[] = [
  "ClusterUpgrading",
  "MachineDeploymentsUpgradeDeferred",
  "MachinePoolsUpgradeDeferred",
];
const DEFERRED_REASONS: readonly string[] = ["MachineDeploymentsUpgradeDeferred", "MachinePoolsUpgradeDeferred"];

// The annotation that says that something outside Cluster API sets the replicas of a MachinePool, unless its value is
// "false" (P20; util/annotations/helpers.go:68-71, 133-144).
const REPLICAS_MANAGED_BY = "cluster.x-k8s.io/replicas-managed-by";

// Whether an activity is in progress: one of Provisioning to Replacing, Progressing.
export function isInProgress(activity: Activity): boolean {
  return activity.state === "Progressing" && IN_PROGRESS.includes(activity.name);
}

// Whether an object belongs to a Cluster, whose first provisioning it takes for its tone and whose 30 minutes are
// the floor of its thresholds (D2, P2): the kinds whose controllers honour the pause of their Cluster (P19), which
// are the objects that a Cluster has, its control plane included, but for an IPAddressClaim that names no Cluster.
export function belongsToCluster(rule: KindRule, object: KubeObjectData): boolean {
  return (
    (rule.pause === "object-or-cluster" || rule.pause === "cluster") &&
    !isClusterRule(rule) &&
    !namesNoCluster(rule, object)
  );
}

// Whether a rule is that of a Cluster itself.
export function isClusterRule(rule: KindRule): boolean {
  return rule.kind === "Cluster" && rule.apiVersion !== undefined;
}

// Whether a kind is an owner of Machines, whose Machines make it Provisioning and Replacing (D3).
export function isOwnerRule(rule: KindRule): boolean {
  return rule.apiVersion !== undefined && OWNERS.includes(rule.kind);
}

// Whether a kind reads the Machines that the view gives: an owner (D3), a Cluster for the threshold of its activities
// and the remediation of its Machines (P2, P21), and a bootstrap config or an infrastructure machine for the
// threshold of the Machine that owns it (P2).
function readsMachines(rule: KindRule): boolean {
  if (rule.role !== undefined) return rule.role === "bootstrap-config" || rule.role === "infrastructure-machine";
  return (
    rule.apiVersion !== undefined && (OWNERS.includes(rule.kind) || ["Cluster", "KubeadmConfig"].includes(rule.kind))
  );
}

// Whether the reasons of the conditions of a kind are a closed set of this release: every kind of Cluster API but
// the IPAddressClaim, whose status the IPAM provider writes (SPEC-0001, R2.86).
function closedReasons(rule: KindRule): boolean {
  return rule.apiVersion !== undefined && rule.kind !== "IPAddressClaim";
}

// The clock of the activities of an object.
interface Clock {
  // The time of the evaluation; undefined when the context gives none that is a number.
  readonly now: number | undefined;
  readonly creation: ParsedTime;
  // The end of the 30 minutes after the creation of the Cluster of the object, read when a threshold needs it.
  readonly floor: () => number | undefined;
  readonly notes: Note[];
}

function creationOf(object: KubeObjectData): ParsedTime {
  return parseTime(fieldOf(readFields(object.metadata), "creationTimestamp"));
}

function nowOf(context: StatusContext): number | undefined {
  return Number.isFinite(context.now) ? context.now : undefined;
}

// The end of the 30 minutes after the creation of a Cluster (P2).
function floorOf(cluster: KubeObjectData | undefined): number | undefined {
  const creation = cluster === undefined ? undefined : creationOf(cluster);

  return creation?.state === "accepted" ? creation.instant + CLUSTER_SECONDS * 1000 : undefined;
}

function clockOf(object: KubeObjectData, rule: KindRule, context: StatusContext, notes: Note[]): Clock {
  let floor: { value: number | undefined } | undefined;

  return {
    now: nowOf(context),
    creation: creationOf(object),
    notes,
    floor: () => {
      if (floor === undefined) {
        if (isClusterRule(rule)) {
          floor = { value: floorOf(object) };
        } else if (belongsToCluster(rule, object)) {
          if (context.cluster === undefined) notes.push({ code: "input-not-given", input: "cluster" });
          floor = { value: floorOf(context.cluster) };
        } else {
          floor = { value: undefined };
        }
      }
      return floor.value;
    },
  };
}

// Whether an instant is still ahead of the evaluation. With no time of the evaluation, nothing is within its
// threshold, and the result notes it.
function isAhead(clock: Clock, instant: number | undefined): boolean {
  if (instant === undefined) return false;
  if (clock.now === undefined) {
    clock.notes.push({ code: "field-unreadable", field: "now" });
    return false;
  }
  return clock.now < instant;
}

// The start of a duration, held to the creation of the object: the times of the conditions are written with the
// clock of a controller and the creation with that of the API server, so a start before the creation counts from the
// creation (P34).
function heldToCreation(start: ParsedTime | undefined, creation: ParsedTime): ParsedTime | undefined {
  if (start?.state !== "accepted" || creation.state !== "accepted") return start;
  return start.instant < creation.instant ? creation : start;
}

interface Timing {
  // The start that the project wrote; undefined where it writes none (P34).
  readonly start?: ParsedTime;
  // The length of the threshold, for an activity in progress and for Deleting.
  readonly seconds?: number;
  // A later end of the threshold, such as the end of the wait of minReadySeconds (P2).
  readonly until?: number;
  // A threshold already computed on the object that holds the activity, which an owner or a Cluster keeps (P2).
  readonly threshold?: Threshold;
}

function thresholdOf(
  clock: Clock,
  name: ActivityName,
  state: ActivityState,
  since: ParsedTime | undefined,
  timing: Timing,
): Threshold | undefined {
  if (state !== "Progressing" || (name !== "Deleting" && !IN_PROGRESS.includes(name))) return undefined;
  if (timing.threshold !== undefined) return timing.threshold;
  if (timing.seconds === undefined) return undefined;
  if (since?.state !== "accepted") return { seconds: timing.seconds, passesAt: undefined };

  let passesAt = since.instant + timing.seconds * 1000;

  if (timing.until !== undefined) passesAt = Math.max(passesAt, timing.until);
  if (name !== "Deleting") {
    const floor = clock.floor();

    if (floor !== undefined) passesAt = Math.max(passesAt, floor);
  }
  return { seconds: timing.seconds, passesAt };
}

// The tone of the mark of an activity (P31).
function activityTone(
  clock: Clock,
  name: ActivityName,
  state: ActivityState,
  threshold: Threshold | undefined,
): ActivityTone {
  if (state === "Unknown") return "vague";
  if (state === "Blocked") return "warning";
  if (name === "Paused" || name === "Rollout paused") return "terminated";

  const within = isAhead(clock, threshold?.passesAt);

  if (name === "Deleting") return within ? "terminated" : "warning";
  return within ? "progress" : "warning";
}

function buildActivity(
  clock: Clock,
  name: ActivityName,
  state: ActivityState,
  timing: Timing,
  condition?: WeightedCondition,
  source?: ObjectIdentity,
): Activity {
  const since = heldToCreation(timing.start, clock.creation);
  const threshold = thresholdOf(clock, name, state, since, timing);

  return { name, state, since, threshold, tone: activityTone(clock, name, state, threshold), condition, source };
}

// What the activities of an object are read from, and what the reading gathers.
interface Reading {
  readonly input: ActivityInput;
  readonly clock: Clock;
  readonly status: Fields | undefined;
  readonly spec: Fields | undefined;
  readonly conditions: readonly WeightedCondition[];
  readonly activities: Activity[];
  readonly notes: Note[];
  unknown: boolean;
  machineSeconds?: number;
}

function add(
  reading: Reading,
  name: ActivityName,
  state: ActivityState,
  timing: Timing,
  condition?: WeightedCondition,
  source?: ObjectIdentity,
): void {
  if (reading.activities.some((activity) => activity.name === name)) return;
  reading.activities.push(buildActivity(reading.clock, name, state, timing, condition, source));
}

// The state of an activity: Blocked while the object is paused (P33) or when the project names a stop (D4), Unknown
// for `InternalError` or, on a kind of Cluster API, a reason that this release does not define (P1), and Progressing
// otherwise.
function stateOf(
  reading: Reading,
  condition: WeightedCondition | undefined,
  options: { readonly blocked?: boolean; readonly reasons?: readonly string[] } = {},
): ActivityState {
  if (reading.input.pause.paused || options.blocked === true) return "Blocked";
  if (condition !== undefined) {
    const { reason } = condition;

    if (reason === "InternalError") return "Unknown";
    if (closedReasons(reading.input.rule) && options.reasons !== undefined) {
      if (reason === undefined || !options.reasons.includes(reason)) return "Unknown";
    }
  }
  return "Progressing";
}

// The threshold of one Machine (D2): the shortest `spec.checks.nodeStartupTimeoutSeconds` above zero of the
// MachineHealthChecks whose `status.targets` names it, else 600 seconds, the default that the project gives that
// field, and 600 seconds also when a MachineHealthCheck sets 0, which stops the count of the project but not that of
// the views (SPEC-0001, R2.97).
function machineSecondsOf(machine: KubeObjectData, context: StatusContext, notes: Note[]): number {
  const checks = context.healthChecks;

  if (checks === undefined) {
    notes.push({ code: "input-not-given", input: "healthChecks" });
    return MACHINE_SECONDS;
  }

  const { name, namespace } = identityOf(machine);
  const timeouts: number[] = [];

  for (const check of checks) {
    const target = identityOf(check);

    if (namespace !== undefined && target.namespace !== undefined && namespace !== target.namespace) continue;

    // Each level is read on its own, so that a parent of the wrong type is noted as such, and the check skipped.
    const status = readFields(check.status);
    const targets = readList(fieldOf(status, "targets"));
    const spec = readFields(check.spec);
    const settings = readFields(fieldOf(spec, "checks"));
    const timeout = readCount(fieldOf(settings, "nodeStartupTimeoutSeconds"));

    if (status === UNREADABLE || targets === UNREADABLE || spec === UNREADABLE || settings === UNREADABLE) {
      const field =
        status === UNREADABLE
          ? "status"
          : targets === UNREADABLE
            ? "status.targets"
            : spec === UNREADABLE
              ? "spec"
              : "spec.checks";

      notes.push({ code: "field-unreadable", field: `healthChecks.${field}` });
      continue;
    }
    if (name === undefined || !(targets ?? []).includes(name)) continue;
    if (timeout === UNREADABLE) {
      notes.push({ code: "field-unreadable", field: "healthChecks.spec.checks.nodeStartupTimeoutSeconds" });
      continue;
    }
    if ((timeout ?? MACHINE_SECONDS) > 0) timeouts.push(timeout ?? MACHINE_SECONDS);
  }
  return timeouts.length === 0 ? MACHINE_SECONDS : Math.min(...timeouts);
}

// The threshold of what goes from one Machine to the next (P2): that of the Machine itself; for an owner or a
// Cluster, the shortest of those of its Machines; for a bootstrap config or an infrastructure machine, that of its
// Machine; and 600 seconds for what serves no Machine.
function machineScopedSeconds(reading: Reading): number {
  if (reading.machineSeconds !== undefined) return reading.machineSeconds;

  const { rule, context, object } = reading.input;
  let seconds = MACHINE_SECONDS;

  if (rule.apiVersion !== undefined && rule.kind === "Machine") {
    seconds = machineSecondsOf(object, context, reading.notes);
  } else if (readsMachines(rule)) {
    if (context.machines === undefined) {
      reading.notes.push({ code: "input-not-given", input: "machines" });
    } else if (context.machines.length > 0) {
      seconds = Math.min(...context.machines.map((machine) => machineSecondsOf(machine, context, reading.notes)));
    }
  }
  reading.machineSeconds = seconds;
  return seconds;
}

// The notes of a reading of another object that concern the inputs of this one: what the view did not give.
function inputNotes(activities: Activities): Note[] {
  return activities.state === "read" ? activities.notes.filter((note) => note.code === "input-not-given") : [];
}

// The activities of a Machine of an owner or of a Cluster, as the Machine itself reads them, with its own pause.
export function machineActivitiesOf(machine: KubeObjectData, context: StatusContext): Activities {
  const conditions = readConditions(machine, "Machine", context);
  const pause = pauseOf(MACHINE_RULE, machine, conditions.state === "read" ? conditions.conditions : [], context, []);

  return activitiesOf({ object: machine, rule: MACHINE_RULE, conditions, pause, context });
}

// The first provisioning of a Cluster (D3): Provisioning, since its creation, while its `ControlPlaneInitialized` is
// `False`; done once it is `True`, which never changes after (SPEC-0001, R2.19); unread while it is missing or of
// another status. It is Blocked while the Cluster is paused, and while a `BeforeClusterCreate` hook holds the
// creation, which `TopologyReconciled` `False` `ClusterCreating` says (P18).
function initializationOf(
  conditions: readonly WeightedCondition[],
  pause: Pause,
): { readonly holds: boolean; readonly unread: boolean; readonly blocked: boolean } {
  const initialized = conditionOf(conditions, "ControlPlaneInitialized");
  const topology = conditionOf(conditions, "TopologyReconciled");
  const creating = topology?.status === "False" && topology.reason === "ClusterCreating";

  return {
    holds: initialized?.status === "False",
    unread: initialized?.status !== "True" && initialized?.status !== "False",
    blocked: pause.paused || creating,
  };
}

// The first provisioning of the Cluster of an object, which every object of that Cluster takes for its tone while
// its control plane is not initialized, and a ClusterResourceSet while the Cluster cannot be reached yet (D2): the
// activity Provisioning of the Cluster, with its 30 minutes. Undefined when it does not hold or cannot be read.
export function firstProvisioningOf(
  cluster: KubeObjectData,
  context: StatusContext,
  notes: Note[],
): Activity | undefined {
  if (deletionOf(cluster) !== false) return undefined;

  const conditions = readConditions(cluster, "Cluster", context);

  if (conditions.state === "unknown") {
    notes.push({ code: "field-unreadable", field: "cluster.status.conditions" });
    return undefined;
  }

  const pause = pauseOf(CLUSTER_RULE, cluster, conditions.conditions, context, []);
  const initialization = initializationOf(conditions.conditions, pause);

  if (!initialization.holds) return undefined;

  const clock: Clock = { now: nowOf(context), creation: creationOf(cluster), floor: () => undefined, notes };

  return buildActivity(
    clock,
    "Provisioning",
    initialization.blocked ? "Blocked" : "Progressing",
    { start: clock.creation, seconds: CLUSTER_SECONDS },
    conditionOf(conditions.conditions, "ControlPlaneInitialized"),
  );
}

// Deleting, from the deletion timestamp, with the stage of the `Deleting` condition of a kind that writes it (H2).
// It is Blocked while paused (P33), for `DeletingNode` on a Machine, and on a Cluster while the text of a hook that
// holds the deletion is in its `TopologyReconciled` (P18); `WaitingForBeforeDeleteHook` alone is progress.
function readDeleting(reading: Reading): void {
  const { object, rule } = reading.input;
  const condition = conditionOf(reading.conditions, "Deleting");
  // A `Deleting` that is still `False` was written before the deletion, and tells no stage.
  const stage = condition?.status === "False" ? undefined : condition;
  const ofKind = rule.apiVersion !== undefined ? rule.kind : undefined;
  const topology = conditionOf(reading.conditions, "TopologyReconciled");
  const hook = isClusterRule(rule) && topology?.message?.includes(DELETE_HOOK_TEXT) === true;
  const deletingNode = ofKind === "Machine" && stage?.status === "True" && stage.reason === "DeletingNode";
  const blocked = reading.input.pause.paused || hook || deletingNode;
  // The stages are a closed set on the kinds that write them, and an open one on any other kind.
  const reasons = ofKind === undefined ? undefined : DELETING_REASONS[ofKind];
  const state =
    stage !== undefined && stage.status !== "True" && !blocked
      ? "Unknown"
      : stateOf(reading, stage, { blocked, reasons });
  const start = parseTime(fieldOf(readFields(object.metadata), "deletionTimestamp"));

  add(reading, "Deleting", state, { start, seconds: DELETION_SECONDS }, stage);
}

// Paused (H2, P19): the `Paused` condition `True`, since its transition, or the pause requested, with no time. It is
// never Blocked; a reason outside the set gives it the state Unknown (P1).
function readPaused(reading: Reading): void {
  const condition = conditionOf(reading.conditions, "Paused");

  if (condition !== undefined && condition.status !== "True" && condition.status !== "False") reading.unknown = true;
  if (!reading.input.pause.paused) return;

  const fromCondition = condition?.status === "True" ? condition : undefined;
  const reason = fromCondition?.reason;
  const undefinedReason = closedReasons(reading.input.rule) && !TRUE_REASONS.Paused.includes(reason ?? "");
  const state =
    fromCondition !== undefined && (reason === "InternalError" || undefinedReason) ? "Unknown" : "Progressing";

  add(reading, "Paused", state, { start: reading.input.pause.since }, fromCondition);
}

// Whether a Machine is held back by its remediation, as P21 reads it: `CannotBeRemediated` on `OwnerRemediated`,
// but for a Machine that a rollout removes anyway; `RemediationTemplateNotFound` or
// `RemediationRequestCreationFailed` on `ExternallyRemediated`.
function remediationBlocked(condition: WeightedCondition): boolean {
  if (condition.type === "OwnerRemediated") {
    return condition.reason === "CannotBeRemediated" && condition.message?.includes(ROLLOUT_REMOVAL_TEXT) !== true;
  }
  return condition.reason === "RemediationTemplateNotFound" || condition.reason === "RemediationRequestCreationFailed";
}

// Whether the `Remediating` of an owner or of a Cluster is Blocked (P21): each of its Machines whose
// `OwnerRemediated` is present is Blocked by P21, one at least. Without the Machines from the view it is not, and
// the threshold of the activity notes them.
function ownerRemediationBlocked(reading: Reading): boolean {
  const { machines } = reading.input.context;

  if (machines === undefined) return false;

  const remediated = machines
    .map((machine) => readConditions(machine, "Machine", reading.input.context))
    .map((read) => (read.state === "read" ? conditionOf(read.conditions, "OwnerRemediated") : undefined))
    .filter((condition) => condition !== undefined);

  return remediated.length > 0 && remediated.every(remediationBlocked);
}

// The activities of a part of a Cluster, from the result of statusOf that the view gives; undefined when that result
// does not hold them as statusOf writes them.
export function partActivities(part: ObjectStatus): readonly Activity[] | undefined {
  const value: unknown = part;
  const activities = isFields(value) ? value.activities : undefined;

  if (!isFields(activities)) return undefined;
  if (activities.state === "none") return [];
  if (activities.state !== "read" || !Array.isArray(activities.activities)) return undefined;
  return (activities.activities as unknown[]).filter(
    (activity): activity is Activity => isFields(activity) && typeof activity.name === "string",
  );
}

// Whether the activities of a part cannot be read, or say that a source of theirs cannot.
function partUnread(part: ObjectStatus): boolean {
  const value: unknown = part;
  const activities = isFields(value) ? value.activities : undefined;

  return partActivities(part) === undefined || (isFields(activities) && activities.unknown === true);
}

export interface ClusterParts {
  // The control plane and the MachineDeployments, from `parts`, whose rollouts the Cluster aggregates (P4).
  readonly rolling: readonly ObjectStatus[];
  // Every part that provisions with the Cluster: those and its MachinePools (D3).
  readonly all: readonly ObjectStatus[];
}

// The parts of a Cluster that the view gives (D2, D3).
export function clusterPartsOf(context: StatusContext): ClusterParts {
  const rolling = [
    ...(context.parts?.controlPlane === undefined ? [] : [context.parts.controlPlane]),
    ...(context.parts?.machineDeployments ?? []),
  ];

  return { rolling, all: [...rolling, ...(context.machinePools ?? [])] };
}

// A condition of an activity (H2, P1): `True` gives the activity, `False` none, any other status leaves the source
// unread, and so does its absence on a kind that writes it. The rules of P4 hold the Rolling out of a
// MachineDeployment and of a Cluster, and those of D4 and P21 its state.
function readConditionActivity(reading: Reading, type: string): void {
  const { rule, context } = reading.input;
  const name = ACTIVITY_OF[type];
  const condition = conditionOf(reading.conditions, type);
  const sources = rule.apiVersion !== undefined ? (ACTIVITY_SOURCES[rule.kind] ?? []) : [];

  if (condition === undefined) {
    if (sources.includes(type)) reading.unknown = true;
    return;
  }
  if (condition.status !== "True" && condition.status !== "False") {
    reading.unknown = true;
    return;
  }
  if (condition.status === "False") return;

  let activity: ActivityName = name;

  if (type === "RollingOut" && rule.apiVersion !== undefined && rule.kind === "MachineDeployment") {
    // Each level is read on its own, so that a parent of the wrong type is noted as such.
    const rollout = readFields(fieldOf(reading.spec, "rollout"));
    const strategyFields = readFields(fieldOf(rollout, "strategy"));
    const strategy = readText(fieldOf(strategyFields, "type"));
    const paused = readFlag(fieldOf(reading.spec, "paused"));
    const unreadable =
      rollout === UNREADABLE
        ? "spec.rollout"
        : strategyFields === UNREADABLE
          ? "spec.rollout.strategy"
          : strategy === UNREADABLE
            ? "spec.rollout.strategy.type"
            : paused === UNREADABLE
              ? "spec.paused"
              : undefined;

    if (unreadable !== undefined) {
      reading.notes.push({ code: "field-unreadable", field: unreadable });
      reading.unknown = true;
      return;
    }
    // Under OnDelete the controller replaces a Machine only once the user deletes it: nothing rolls out (P4).
    if (strategy === "OnDelete") {
      reading.notes.push({ code: "machines-differ-from-spec" });
      return;
    }
    if (paused === true) activity = "Rollout paused";
  }
  let throughParts: readonly Activity[] | undefined;

  if (type === "RollingOut" && isClusterRule(rule) && context.parts !== undefined) {
    const { rolling } = clusterPartsOf(context);

    throughParts = rolling.flatMap((part) =>
      (partActivities(part) ?? []).filter((each) => each.name === "Rolling out"),
    );
    // The `RollingOut` of a Cluster aggregates those of its parts: with none of them rolling out, the Machines differ
    // from the spec while nothing rolls them out (P4), which a part whose activities cannot be read leaves untold.
    if (throughParts.length === 0) {
      if (!rolling.some(partUnread)) reading.notes.push({ code: "machines-differ-from-spec" });
      return;
    }
  }

  const owner =
    type === "Remediating" && (isClusterRule(rule) || (rule.apiVersion !== undefined && OWNERS.includes(rule.kind)));
  // A Cluster rolls out through its parts, and is held when every part that rolls out is, as its Provisioning is.
  const blocked =
    (type === "Updating" && condition.reason === "InPlaceUpdateFailed") ||
    (owner && ownerRemediationBlocked(reading)) ||
    (throughParts !== undefined && throughParts.every((each) => each.state === "Blocked"));
  const state = stateOf(reading, condition, { blocked, reasons: TRUE_REASONS[type] });

  // A rollout held by `spec.paused` has no time of its own (P34).
  if (activity === "Rollout paused") {
    add(reading, activity, state, {}, condition);
    return;
  }
  add(
    reading,
    activity,
    state,
    {
      start: condition.lastTransitionTime,
      seconds: type === "ScalingDown" ? DELETION_SECONDS : machineScopedSeconds(reading),
    },
    condition,
  );
}

// The Provisioning of a Machine (D3): while its phase is `Pending`, `Provisioning` or `Provisioned` and it has no
// Node; while it is not `Available` and is within its threshold, whatever its phase; and while its `Available` is
// `False` `WaitingForMinReadySeconds`, whatever its age, a wait that counts as within its threshold until
// `spec.minReadySeconds` after its `Ready` turned `True` (P2, P5).
function readMachineProvisioning(reading: Reading): void {
  const { object, context } = reading.input;
  const written = readText(fieldOf(reading.status, "phase"));
  const phase =
    typeof written === "string" && written !== "Unknown" && MACHINE_PHASES_READ.includes(written) ? written : undefined;
  const nodeRef = readFields(fieldOf(reading.status, "nodeRef"));
  const node = readText(fieldOf(nodeRef, "name"));
  const available = conditionOf(reading.conditions, "Available");
  const ready = conditionOf(reading.conditions, "Ready");
  const waiting = available?.status === "False" && available.reason === "WaitingForMinReadySeconds";

  if (nodeRef === UNREADABLE || node === UNREADABLE) {
    reading.notes.push({ code: "field-unreadable", field: "status.nodeRef" });
    reading.unknown = true;
    return;
  }

  const noNode = node === undefined || node === "";
  const byPhase = noNode && phase !== undefined && NO_NODE_PHASES.includes(phase);
  const notAvailable = available?.status !== "True";

  // With no Node, the phase decides, and one that is not written or outside the set leaves the source unread.
  if (noNode && phase === undefined) reading.unknown = true;
  if (!byPhase && !notAvailable) return;

  const seconds = machineSecondsOf(object, context, reading.notes);
  const since = heldToCreation(reading.clock.creation, reading.clock.creation);
  const base = thresholdOf(reading.clock, "Provisioning", "Progressing", since, { seconds });

  // A Machine that is not available is Provisioning while it is within its threshold; with no clock, or no time of
  // its creation, it cannot be told.
  if (notAvailable && !byPhase && !waiting && (reading.clock.now === undefined || since?.state !== "accepted")) {
    reading.unknown = true;
  }

  const byAge = notAvailable && isAhead(reading.clock, base?.passesAt);

  if (!byPhase && !byAge && !waiting) return;

  const minReady = readCount(fieldOf(reading.spec, "minReadySeconds"));

  if (minReady === UNREADABLE) reading.notes.push({ code: "field-unreadable", field: "spec.minReadySeconds" });

  const readySince = ready?.status === "True" ? ready.lastTransitionTime : undefined;
  const wait = minReady === UNREADABLE ? 0 : (minReady ?? 0);
  const until = waiting && readySince?.state === "accepted" ? readySince.instant + wait * 1000 : undefined;

  add(
    reading,
    "Provisioning",
    stateOf(reading, undefined),
    { start: reading.clock.creation, seconds, until },
    waiting ? available : undefined,
  );
}

// The Remediating of a Machine (P21): while its `OwnerRemediated` or its `ExternallyRemediated` is present, since
// the transition of that condition.
function readMachineRemediation(reading: Reading): void {
  const owner = conditionOf(reading.conditions, "OwnerRemediated");
  const condition = owner ?? conditionOf(reading.conditions, "ExternallyRemediated");

  if (condition === undefined) return;

  const state = stateOf(reading, condition, {
    blocked: remediationBlocked(condition),
    reasons: condition.type === "OwnerRemediated" ? OWNER_REMEDIATED_REASONS : EXTERNALLY_REMEDIATED_REASONS,
  });

  add(
    reading,
    "Remediating",
    state,
    { start: condition.lastTransitionTime, seconds: machineScopedSeconds(reading) },
    condition,
  );
}

// The note of P4 on a kind that writes no `RollingOut`: its Machines differ from its spec while nothing rolls them
// out.
function notePending(reading: Reading, type: string): void {
  if (conditionOf(reading.conditions, type)?.status === "False")
    reading.notes.push({ code: "machines-differ-from-spec" });
}

interface MachineOfOwner {
  readonly machine: KubeObjectData;
  readonly deleting: boolean | typeof UNREADABLE;
  readonly activities: Activities;
}

// Whether an instant comes before another, an unknown instant last.
function earlier(one: ParsedTime | undefined, other: ParsedTime | undefined): boolean {
  if (one?.state !== "accepted") return false;
  return other?.state !== "accepted" || one.instant < other.instant;
}

// The Provisioning and the Replacing of an owner (D3), from its Machines, which the view gives: Provisioning while
// one of them is, since the creation of the oldest of those whose Provisioning is in flight, with the threshold of
// that Machine (P2); Replacing while one of them is deleting and fewer Machines that are not deleting are left than
// `spec.replicas`, since the oldest of those deletions, with the 15 minutes of a deletion. A MachinePool with no
// Machine is Provisioning as P17 says, with no start, and never at 0 replicas.
function readOwnerMachines(reading: Reading, machines: readonly KubeObjectData[]): void {
  const { context, rule } = reading.input;
  const owned: MachineOfOwner[] = machines.map((machine) => ({
    machine,
    deleting: deletionOf(machine),
    activities: machineActivitiesOf(machine, context),
  }));

  for (const { deleting, activities } of owned) {
    reading.notes.push(...inputNotes(activities));
    if (deleting === UNREADABLE || (activities.state === "read" && activities.unknown)) reading.unknown = true;
  }

  // A deleting Machine does nothing but its deletion, so it never makes its owner Provisioning.
  const provisioning = owned
    .map((each) => ({
      machine: each.machine,
      activity:
        each.activities.state === "read"
          ? each.activities.activities.find((activity) => activity.name === "Provisioning")
          : undefined,
    }))
    .filter((each): each is { machine: KubeObjectData; activity: Activity } => each.activity !== undefined);

  if (provisioning.length > 0) {
    const flowing = provisioning.filter((each) => each.activity.state !== "Blocked");
    const candidates = flowing.length > 0 ? flowing : provisioning;
    const oldest = candidates.reduce((one, other) => (earlier(other.activity.since, one.activity.since) ? other : one));
    const state = reading.input.pause.paused ? "Blocked" : oldest.activity.state;

    add(
      reading,
      "Provisioning",
      state,
      { start: oldest.activity.since, threshold: oldest.activity.threshold },
      undefined,
      identityOf(oldest.machine),
    );
  } else if (rule.kind === "MachinePool" && machines.length === 0) {
    readPoolWithoutMachines(reading);
  }

  const deleting = owned.filter((each) => each.deleting === true);

  if (deleting.length === 0) return;

  const replicas = readCount(fieldOf(reading.spec, "replicas"));

  if (replicas === UNREADABLE) reading.notes.push({ code: "field-unreadable", field: "spec.replicas" });
  if (replicas === UNREADABLE || replicas === undefined) {
    reading.unknown = true;
    return;
  }
  if (owned.filter((each) => each.deleting === false).length >= replicas) return;

  const deletionOfMachine = (machine: KubeObjectData) =>
    parseTime(fieldOf(readFields(machine.metadata), "deletionTimestamp"));
  const first = deleting.reduce((one, other) =>
    earlier(deletionOfMachine(other.machine), deletionOfMachine(one.machine)) ? other : one,
  );

  add(
    reading,
    "Replacing",
    stateOf(reading, undefined),
    { start: deletionOfMachine(first.machine), seconds: DELETION_SECONDS },
    undefined,
    identityOf(first.machine),
  );
}

// A MachinePool with no Machine (P17): Provisioning while its `spec.replicas` is above zero and its
// `status.nodeRefs` is empty, with no start; never at 0 replicas.
function readPoolWithoutMachines(reading: Reading): void {
  const replicas = readCount(fieldOf(reading.spec, "replicas"));
  const nodeRefs = readList(fieldOf(reading.status, "nodeRefs"));

  if (replicas === UNREADABLE) reading.notes.push({ code: "field-unreadable", field: "spec.replicas" });
  if (nodeRefs === UNREADABLE) reading.notes.push({ code: "field-unreadable", field: "status.nodeRefs" });
  if (replicas === UNREADABLE || replicas === undefined || nodeRefs === UNREADABLE) {
    reading.unknown = true;
    return;
  }
  if (replicas > 0 && (nodeRefs ?? []).length === 0) {
    add(reading, "Provisioning", stateOf(reading, undefined), { seconds: MACHINE_SECONDS });
  }
}

// The scale of a MachinePool (P20): Scaling up while its `status.replicas` is below `spec.replicas`, Scaling down
// while it is above, with no start, unless something outside Cluster API sets the count; unread with either count
// unset.
function readPoolScale(reading: Reading): void {
  const annotations = fieldOf(readFields(reading.input.object.metadata), "annotations");
  const managedBy = readEntry(annotations, REPLICAS_MANAGED_BY);

  if (managedBy === UNREADABLE) {
    reading.notes.push({ code: "field-unreadable", field: "metadata.annotations" });
    reading.unknown = true;
    return;
  }
  if (managedBy !== undefined && managedBy !== "false") return;

  const wanted = readCount(fieldOf(reading.spec, "replicas"));
  const counted = readCount(fieldOf(reading.status, "replicas"));

  if (wanted === UNREADABLE) reading.notes.push({ code: "field-unreadable", field: "spec.replicas" });
  if (counted === UNREADABLE) reading.notes.push({ code: "field-unreadable", field: "status.replicas" });
  if (wanted === UNREADABLE || counted === UNREADABLE || wanted === undefined || counted === undefined) {
    reading.unknown = true;
    return;
  }
  if (counted < wanted)
    add(reading, "Scaling up", stateOf(reading, undefined), { seconds: machineScopedSeconds(reading) });
  if (counted > wanted) add(reading, "Scaling down", stateOf(reading, undefined), { seconds: DELETION_SECONDS });
}

// The Upgrading of a KubeadmControlPlane, and of a control plane through the contract (P28): when the project says
// that it upgrades, `spec.version` after an entry of `status.versions`, or after `status.version` when the list is
// absent or empty, or apart from it only by words of its build metadata, the entries read in their order, as the
// project reads them (internal/contract/controlplane.go:295-352). Never with no version in the status, nor for a
// downgrade; a version that does not parse leaves the source unread. No start is written.
function readControlPlaneUpgrade(reading: Reading): void {
  const raw = fieldOf(reading.spec, "version");

  if (raw === undefined || raw === null) return;
  if (typeof raw !== "string") {
    reading.notes.push({ code: "field-unreadable", field: "spec.version" });
    reading.unknown = true;
    return;
  }

  const wanted = parseKubernetesVersion(raw);
  const versions = readList(fieldOf(reading.status, "versions"));
  const unread = (field?: string) => {
    if (field !== undefined) reading.notes.push({ code: "field-unreadable", field });
    reading.unknown = true;
  };

  if (wanted.state === "unknown") return unread();
  if (versions === UNREADABLE) return unread("status.versions");

  let texts: (string | undefined | typeof UNREADABLE)[];

  if (versions !== undefined && versions.length > 0) {
    texts = versions.map((entry) => (isFields(entry) ? readText(entry.version) : UNREADABLE));
  } else {
    const version = readText(fieldOf(reading.status, "version"));

    if (version === UNREADABLE) return unread("status.version");
    if (version === undefined || version === "") return;
    texts = [version];
  }
  for (const text of texts) {
    if (text === UNREADABLE || text === undefined) return unread("status.versions");

    const order = compareKubernetesVersions(wanted, parseKubernetesVersion(text));

    if (order === "unknown") return unread();
    if (order === "after" || order === "unordered") {
      add(reading, "Upgrading", stateOf(reading, undefined), { seconds: machineScopedSeconds(reading) });
      return;
    }
  }
}

// The Provisioning of an object of P17, until the field of its contract says that it is ready, since its creation:
// a KubeadmConfig and the bootstrap config of a provider, with the threshold of their Machine; an infrastructure
// machine, with that of its Machine; an infrastructure cluster, a control plane of a provider and an infrastructure
// machine pool, with that of one Machine (internal/contract/bootstrap.go:36-46; controlplane.go:182-192;
// infrastructure_cluster.go:58-68; infrastructure_machine.go:46-56). An infrastructure machine pool is provisioned
// when either of its two fields says so, as the contract and the MachinePool controller of this release each read
// one of them.
function readContractProvisioning(reading: Reading): void {
  const { rule, context } = reading.input;
  const role = rule.role;
  let paths: readonly (readonly string[])[];

  if (role === undefined) {
    paths = [["initialization", "dataSecretCreated"]];
  } else if (role === "infrastructure-machine-pool") {
    paths = [["initialization", "provisioned"], ["ready"]];
  } else {
    if (context.contract === undefined) {
      reading.notes.push({ code: "input-not-given", input: "contract" });
      reading.unknown = true;
      return;
    }

    const v1beta1 = context.contract === "v1beta1";

    if (role === "control-plane") paths = [v1beta1 ? ["initialized"] : ["initialization", "controlPlaneInitialized"]];
    else if (role === "bootstrap-config") paths = [v1beta1 ? ["ready"] : ["initialization", "dataSecretCreated"]];
    else paths = [v1beta1 ? ["ready"] : ["initialization", "provisioned"]];
  }

  let ready = false;

  for (const path of paths) {
    // Each level is read on its own, so that a parent of the wrong type, such as `status.initialization`, is noted as
    // such, and never taken for a field that is not set.
    let parent: Fields | undefined = reading.status;
    let unreadable: string | undefined;

    for (const [index, key] of path.slice(0, -1).entries()) {
      const next = readFields(fieldOf(parent, key));

      if (next === UNREADABLE) {
        unreadable = ["status", ...path.slice(0, index + 1)].join(".");
        break;
      }
      parent = next;
    }

    const flag = unreadable === undefined ? readFlag(fieldOf(parent, path[path.length - 1])) : UNREADABLE;

    if (flag === UNREADABLE) {
      reading.notes.push({ code: "field-unreadable", field: unreadable ?? ["status", ...path].join(".") });
      reading.unknown = true;
      return;
    }
    ready ||= flag === true;
  }
  if (ready) return;

  const machineScoped = role === undefined || role === "bootstrap-config" || role === "infrastructure-machine";

  add(reading, "Provisioning", stateOf(reading, undefined), {
    start: reading.clock.creation,
    seconds: machineScoped ? machineScopedSeconds(reading) : MACHINE_SECONDS,
  });
}

// A kind of the operator (P14): Provisioning while `status.installedVersion` is unset, since its creation, and
// Upgrading while it is set and differs from `spec.version`, as the operator compares them, with no start; both with
// 600 seconds, since no MachineHealthCheck selects them. Both are Blocked when `ProviderInstalled` or
// `ProviderUpgraded` is `False`, or `PreflightCheckPassed` is `False` for another reason than the wait for the core
// provider, which is a step of either. Installed and up to date, the kind does nothing, the wait included.
function readOperator(reading: Reading): void {
  const installed = readText(fieldOf(reading.status, "installedVersion"));

  if (installed === UNREADABLE) {
    reading.notes.push({ code: "field-unreadable", field: "status.installedVersion" });
    reading.unknown = true;
    return;
  }

  const wanted = readText(fieldOf(reading.spec, "version"));

  // The operator writes `spec.version` before it installs, from the default of its repository
  // (cluster-api-operator:internal/controller/manifests_downloader.go:91-97): an installed kind without one cannot be
  // compared, and is no upgrade by default.
  if (installed !== undefined && installed !== "" && (wanted === undefined || wanted === UNREADABLE || wanted === "")) {
    reading.notes.push({ code: "field-unreadable", field: "spec.version" });
    reading.unknown = true;
    return;
  }

  const upgrading = installed !== undefined && installed !== "" && !upgradeSettled(reading.input.object);

  if (installed !== undefined && installed !== "" && !upgrading) return;

  const failed = ["ProviderInstalled", "ProviderUpgraded"]
    .map((type) => conditionOf(reading.conditions, type))
    .find((condition) => condition?.status === "False");
  const preflight = conditionOf(reading.conditions, "PreflightCheckPassed");
  // Only the reason tells the wait for the core provider from a check that refuses: one that cannot be read leaves
  // the state Unknown.
  const unsure = failed === undefined && preflight?.status === "False" && preflight.reason === undefined;
  const refused =
    preflight?.status === "False" &&
    preflight.reason !== undefined &&
    preflight.reason !== "WaitingForCoreProviderReady";
  const shown = failed ?? (preflight?.status === "False" ? preflight : undefined);
  const state =
    unsure && !reading.input.pause.paused
      ? "Unknown"
      : stateOf(reading, undefined, { blocked: failed !== undefined || refused });

  if (upgrading) add(reading, "Upgrading", state, { seconds: MACHINE_SECONDS }, shown);
  else add(reading, "Provisioning", state, { start: reading.clock.creation, seconds: MACHINE_SECONDS }, shown);
}

// The Provisioning of a Cluster (D3): until its control plane is initialized, since its creation, with its 30
// minutes; else while one of its parts is Provisioning, with the start and the threshold of the oldest of those whose
// Provisioning is in flight, as an owner reads its Machines, and Blocked when every such part is. A hook that holds
// the creation does so before the control plane is initialized (P18), so it blocks only the first.
function readClusterProvisioning(reading: Reading): void {
  const initialization = initializationOf(reading.conditions, reading.input.pause);

  if (initialization.unread) reading.unknown = true;
  if (initialization.holds) {
    add(
      reading,
      "Provisioning",
      stateOf(reading, undefined, { blocked: initialization.blocked }),
      { start: reading.clock.creation, seconds: CLUSTER_SECONDS },
      conditionOf(reading.conditions, "ControlPlaneInitialized"),
    );
    return;
  }

  const provisioning = clusterPartsOf(reading.input.context)
    .all.map((part) => ({ part, activity: (partActivities(part) ?? []).find((each) => each.name === "Provisioning") }))
    .filter((each): each is { part: ObjectStatus; activity: Activity } => each.activity !== undefined);

  if (provisioning.length === 0) return;

  const flowing = provisioning.filter((each) => each.activity.state !== "Blocked");
  const candidates = flowing.length > 0 ? flowing : provisioning;
  const oldest = candidates.reduce((one, other) => (earlier(other.activity.since, one.activity.since) ? other : one));
  const state = reading.input.pause.paused ? "Blocked" : oldest.activity.state;

  add(
    reading,
    "Provisioning",
    state,
    { start: oldest.activity.since, threshold: oldest.activity.threshold },
    undefined,
    oldest.part.object,
  );
}

// The Upgrading of a Cluster with a topology (H2): its `TopologyReconciled` `False` with `ClusterUpgrading` or a
// deferred reason, since the transition of that condition (P34). It is Blocked for a deferred reason and while the
// text of a hook that holds the upgrade is in its message (P18). A reason that this release does not define, like a
// missing condition, leaves the source unread.
function readClusterUpgrade(reading: Reading): void {
  const topology = readFields(fieldOf(reading.spec, "topology"));

  if (topology === UNREADABLE) {
    reading.notes.push({ code: "field-unreadable", field: "spec.topology" });
    reading.unknown = true;
    return;
  }
  if (!isSet(topology)) return;

  const condition = conditionOf(reading.conditions, "TopologyReconciled");

  if (condition === undefined || (condition.status !== "True" && condition.status !== "False")) {
    reading.unknown = true;
    return;
  }
  if (condition.status === "True") return;
  if (condition.reason === undefined || !TOPOLOGY_REASONS.includes(condition.reason)) {
    reading.unknown = true;
    return;
  }
  if (!UPGRADE_REASONS.includes(condition.reason)) return;

  const blocked =
    DEFERRED_REASONS.includes(condition.reason) || condition.message?.includes(UPGRADE_HOOK_TEXT) === true;

  add(
    reading,
    "Upgrading",
    stateOf(reading, undefined, { blocked }),
    { start: condition.lastTransitionTime, seconds: machineScopedSeconds(reading) },
    condition,
  );
}

// The parts of a Cluster (D3): the view gives them, and a control plane or a MachineDeployment whose activities
// cannot be read leaves those of the Cluster unread, as a control plane of a provider that writes none of the
// conditions of an activity does (P1). A MachinePool is always Unknown for conditions that it does not write, which
// the Cluster does not read either (SPEC-0001, R2.29): its Provisioning alone counts.
function readClusterParts(reading: Reading): void {
  const { context } = reading.input;

  if (context.parts === undefined) reading.notes.push({ code: "input-not-given", input: "parts" });
  if (context.machinePools === undefined) reading.notes.push({ code: "input-not-given", input: "machinePools" });
  if (context.parts === undefined || context.machinePools === undefined) reading.unknown = true;

  const parts = clusterPartsOf(context);

  if (parts.rolling.some(partUnread)) reading.unknown = true;
}

// The inputs that the rule of a kind always needs, noted with or without a status (D3).
function noteNeededInputs(reading: Reading): void {
  const { rule, context } = reading.input;

  if (rule.apiVersion !== undefined && OWNERS.includes(rule.kind) && context.machines === undefined) {
    reading.notes.push({ code: "input-not-given", input: "machines" });
  }
  if (isClusterRule(rule)) {
    if (context.parts === undefined) reading.notes.push({ code: "input-not-given", input: "parts" });
    if (context.machinePools === undefined) reading.notes.push({ code: "input-not-given", input: "machinePools" });
  }
}

// The rules of each kind, once the status is read.
function readKind(reading: Reading): void {
  const { rule, context } = reading.input;

  if (rule.role !== undefined) {
    if (rule.role !== "ipam-pool" && rule.role !== "remediation-request") readContractProvisioning(reading);
    if (rule.role === "control-plane") {
      const written = ["RollingOut", "ScalingUp", "ScalingDown"].some((type) => conditionOf(reading.conditions, type));

      // A control plane of a provider that writes none of them leaves its activity unread (P1).
      if (!written) reading.unknown = true;
      readControlPlaneUpgrade(reading);
    }
    return;
  }
  if (rule.apiVersion === OPERATOR_VERSION) return readOperator(reading);

  switch (rule.kind) {
    case "Cluster":
      readClusterParts(reading);
      readClusterProvisioning(reading);
      readClusterUpgrade(reading);
      return;
    case "Machine":
      readMachineProvisioning(reading);
      readMachineRemediation(reading);
      notePending(reading, "UpToDate");
      return;
    case "KubeadmConfig":
      readContractProvisioning(reading);
      return;
  }
  if (!OWNERS.includes(rule.kind)) return;
  if (context.machines === undefined) {
    reading.notes.push({ code: "input-not-given", input: "machines" });
    reading.unknown = true;
  } else {
    readOwnerMachines(reading, context.machines);
  }
  if (rule.kind === "MachinePool") readPoolScale(reading);
  if (rule.kind === "KubeadmControlPlane") readControlPlaneUpgrade(reading);
  if (rule.kind === "MachineSet") notePending(reading, "MachinesUpToDate");
}

function resultOf(reading: Reading): Extract<Activities, { state: "read" }> {
  const { now } = reading.clock;
  const activities = [...reading.activities].sort(
    (one, other) => ACTIVITY_NAMES.indexOf(one.name) - ACTIVITY_NAMES.indexOf(other.name),
  );
  // The activities change with time where their thresholds end, those that an owner or a Cluster takes from a
  // Machine or a part included, since each keeps its own (P2).
  const changes = activities
    .map((activity) => activity.threshold?.passesAt)
    .filter((instant): instant is number => instant !== undefined && now !== undefined && instant > now);

  return {
    state: "read",
    activities,
    idle: activities.length === 0 && !reading.unknown,
    unknown: reading.unknown,
    changesAt: changes.length === 0 ? undefined : Math.min(...changes),
    notes: uniqueNotes(reading.notes),
  };
}

// The notes, each once, in the order in which they come.
export function uniqueNotes(notes: readonly Note[]): Note[] {
  const seen = new Set<string>();

  return notes.filter((note) => {
    const key = JSON.stringify(note);

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function activitiesOf(input: ActivityInput): Activities {
  const { object, rule, context } = input;
  const deleting = deletionOf(object);

  if (!rule.hasStatus && deleting !== true) return { state: "none" };

  const notes: Note[] = [];
  const status = readFields(object.status);
  const spec = readFields(object.spec);
  const reading: Reading = {
    input,
    clock: clockOf(object, rule, context, notes),
    status: status === UNREADABLE ? undefined : status,
    spec: spec === UNREADABLE ? undefined : spec,
    conditions: input.conditions.state === "read" ? input.conditions.conditions : [],
    activities: [],
    notes,
    unknown: false,
  };

  // Every start held to the creation, and the age of a Machine, read it (P34, D3).
  if (reading.clock.creation.state === "unavailable") {
    notes.push({ code: "field-unreadable", field: "metadata.creationTimestamp" });
  }

  // A deleting object does nothing but its deletion, held while it is paused (D3, P33).
  if (deleting === true) {
    readDeleting(reading);
    if (input.pause.paused) readPaused(reading);
    return { ...resultOf(reading), unknown: false };
  }
  if (deleting === UNREADABLE) reading.unknown = true;
  readPaused(reading);

  // An object of a kind that the model does not know: nothing of its status is known (P15).
  if (rule.apiVersion === undefined && rule.role === undefined) {
    reading.unknown = true;
    return resultOf(reading);
  }
  // An object with no status yet, or one that cannot be read (P1).
  if (status === undefined || status === UNREADABLE || spec === UNREADABLE || input.conditions.state === "unknown") {
    reading.unknown = true;
    noteNeededInputs(reading);
    return resultOf(reading);
  }
  readKind(reading);
  for (const type of Object.keys(ACTIVITY_OF)) readConditionActivity(reading, type);
  return resultOf(reading);
}
