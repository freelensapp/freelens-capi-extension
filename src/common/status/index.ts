/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The two entry points of the status model (SPEC-0003, "What it takes and returns"), which every view calls for each
// object it shows, with the context it has, so that no view classifies by a rule of its own.
//
// - `statusOf` returns the status of one object: its health, with what it rests on and its issues; the tone of the
//   mark of its health, with the activity that sets it (D2); its activities; its marks of freshness; its phase; the
//   mark of remediation of a MachineHealthCheck (P11); its notes; and the earliest time at which it would change with
//   the passing of time alone, so that a view evaluates the object again then, and not at every tick.
// - `conditionsOf` returns its conditions, in the order that the controllers keep, each with its weight, its parsed
//   message, the time of its last transition and whether it describes an older generation.
//
// The object is the one the host hands over, at the version that A2 names: a kind of Cluster API at `v1beta2`,
// `Provider` at `v1alpha3` and the kinds of the operator at `v1alpha2`; an object of a provider is read by the role
// that the context gives. An object of a kind the model does not know is Unknown, with a note. The model reads no
// clock and sends no request, keeps no state, and never throws.

import { CONTRACT_LABELS } from "../parsers/contract-label";
import { activitiesOf } from "./activity";
import { CLUSTER_RESOURCE_SET_BINDING_RULE, CLUSTER_RESOURCE_SET_RULE } from "./add-ons";
import { CLUSTER_RULE } from "./cluster";
import { CLUSTER_CLASS_RULE, EXTENSION_CONFIG_RULE } from "./cluster-class";
import { readConditions } from "./conditions";
import {
  KUBEADM_CONFIG_RULE,
  KUBEADM_CONFIG_TEMPLATE_RULE,
  KUBEADM_CONTROL_PLANE_RULE,
  KUBEADM_CONTROL_PLANE_TEMPLATE_RULE,
} from "./control-plane";
import { isFields } from "./fields";
import { freshnessOf } from "./freshness";
import { deprecatedFailureOf, healthOf, identityOf, phaseOf, unknownHealth } from "./health";
import { MACHINE_DRAIN_RULE_RULE, MACHINE_HEALTH_CHECK_RULE, remediationOf } from "./health-checks";
import { MACHINE_DEPLOYMENT_RULE, MACHINE_POOL_RULE, MACHINE_RULE, MACHINE_SET_RULE } from "./machines";
import {
  CLUSTERCTL_PROVIDER_RULE,
  IP_ADDRESS_CLAIM_RULE,
  IP_ADDRESS_RULE,
  OPERATOR_RULES,
  PROVIDER_ROLES,
  providerRule,
} from "./providers";
import { toneOf } from "./tone";

import type { Activities } from "./activity";
import type { ConditionsResult } from "./conditions";
import type { FreshnessMark } from "./freshness";
import type { Health, KindRule, Note, ObjectIdentity, Phase } from "./health";
import type { RemediationMark } from "./health-checks";
import type { Tone } from "./tone";
import type { KubeObjectData, StatusContext } from "./types";

export type { Activities, Activity, ActivityName, ActivityState, ActivityTone, Threshold } from "./activity";
export type { ConditionsResult, Polarity, Weight, WeightedCondition } from "./conditions";
export type { FreshnessCause, FreshnessMark } from "./freshness";
export type {
  AppliedToCluster,
  ContextInput,
  Health,
  HealthBasis,
  HealthWord,
  Issue,
  Note,
  ObjectIdentity,
  Phase,
} from "./health";
export type { RemediationMark } from "./health-checks";
export type { HealthTone, Tone, ToneSetter } from "./tone";
export type * from "./types";

export interface ObjectStatus {
  readonly object: ObjectIdentity;
  readonly health: Health;
  readonly tone: Tone;
  readonly activities: Activities;
  readonly freshness: readonly FreshnessMark[];
  // The phase of a kind that has one (Cluster, Machine, MachineDeployment, MachinePool).
  readonly phase: Phase | undefined;
  // The mark of remediation of a MachineHealthCheck (P11).
  readonly remediation: RemediationMark | undefined;
  readonly notes: readonly Note[];
  // The earliest instant, in milliseconds since the Unix epoch, at which the result would change with the passing
  // of time alone; undefined when nothing in it depends on time.
  readonly changesAt: number | undefined;
}

// The versions of the contract of a provider that the model reads (P17).
const CONTRACTS = Object.keys(CONTRACT_LABELS) as (keyof typeof CONTRACT_LABELS)[];

// The kinds of Cluster API, of `clusterctl` and of the operator, by the group and version that A2 names.
const RULES: ReadonlyMap<string, KindRule> = new Map(
  [
    CLUSTER_RULE,
    CLUSTER_CLASS_RULE,
    EXTENSION_CONFIG_RULE,
    MACHINE_RULE,
    MACHINE_SET_RULE,
    MACHINE_DEPLOYMENT_RULE,
    MACHINE_POOL_RULE,
    MACHINE_HEALTH_CHECK_RULE,
    MACHINE_DRAIN_RULE_RULE,
    KUBEADM_CONTROL_PLANE_RULE,
    KUBEADM_CONTROL_PLANE_TEMPLATE_RULE,
    KUBEADM_CONFIG_RULE,
    KUBEADM_CONFIG_TEMPLATE_RULE,
    CLUSTER_RESOURCE_SET_RULE,
    CLUSTER_RESOURCE_SET_BINDING_RULE,
    IP_ADDRESS_CLAIM_RULE,
    IP_ADDRESS_RULE,
    CLUSTERCTL_PROVIDER_RULE,
    ...OPERATOR_RULES,
  ].map((rule) => [`${rule.apiVersion} ${rule.kind}`, rule]),
);

// The rule of a kind the model does not know and for which the view gave no role: Unknown, with a note, and no mark
// of freshness, since the model knows nothing of what its status keeps.
function unknownKindRule(identity: ObjectIdentity): KindRule {
  return {
    kind: identity.kind ?? "",
    hasStatus: true,
    summary: [],
    provider: undefined,
    pause: "none",
    observedGeneration: "status",
    followsWorkloadCluster: false,
    deprecatedFailure: false,
    health: () => ({ health: unknownHealth(), notes: [{ code: "kind-unknown" }] }),
  };
}

// The rule of an object: its kind of Cluster API, of `clusterctl` or of the operator, at the version that A2 names,
// else its role as an object of a provider.
function ruleOf(identity: ObjectIdentity, context: StatusContext): { rule: KindRule; known: boolean } {
  const rule = RULES.get(`${identity.apiVersion} ${identity.kind}`);

  if (rule !== undefined) return { rule, known: true };
  if (context.role !== undefined && identity.kind !== undefined) {
    return { rule: providerRule(identity.kind, context.role), known: true };
  }
  return { rule: unknownKindRule(identity), known: false };
}

// The object as the model reads it: one that is not an object reads as one with no field.
function objectOf(object: KubeObjectData): KubeObjectData {
  return isFields(object) ? object : ({} as KubeObjectData);
}

// The objects of a list of the context; an entry that is not an object is left out.
function objectsOf<T>(list: readonly T[] | undefined): readonly T[] | undefined {
  return Array.isArray(list) ? list.filter((entry: T) => isFields(entry)) : undefined;
}

// The context as the rules read it: an input that is not an object reads as not given, and an entry of a list that is
// not an object is left out, so that no rule throws on a context that a view built wrong. A binding whose Cluster is
// not an object has its Cluster not given, and a role or a contract outside its closed set is not given either.
function contextOf(given: StatusContext): StatusContext {
  const context = isFields(given) ? given : ({} as StatusContext);
  const parts = isFields(context.parts) ? context.parts : undefined;

  return {
    ...context,
    role: PROVIDER_ROLES.find((each) => each === context.role),
    contract: CONTRACTS.find((each) => each === context.contract),
    cluster: isFields(context.cluster) ? context.cluster : undefined,
    healthChecks: objectsOf(context.healthChecks),
    machines: objectsOf(context.machines),
    parts: parts && {
      controlPlane: isFields(parts.controlPlane) ? parts.controlPlane : undefined,
      machineDeployments: objectsOf(parts.machineDeployments) ?? [],
    },
    machinePools: objectsOf(context.machinePools),
    clusterClass: isFields(context.clusterClass) ? context.clusterClass : undefined,
    bindings: objectsOf(context.bindings)
      ?.filter((input) => isFields(input.binding))
      .map((input) => ({ binding: input.binding, cluster: isFields(input.cluster) ? input.cluster : undefined })),
    controllers: isFields(context.controllers) ? context.controllers : undefined,
  };
}

// The kind whose rules of weight apply to the conditions: none for an object of a provider or of an unknown kind,
// whose conditions are read as those of an object of a provider (P15).
function conditionsKindOf(rule: KindRule): string | undefined {
  return rule.apiVersion === undefined ? undefined : rule.kind;
}

// The notes of every part of the result, each once, in the order in which they come.
function mergeNotes(...lists: (readonly Note[])[]): Note[] {
  const seen = new Set<string>();

  return lists.flat().filter((note) => {
    const key = JSON.stringify(note);

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function earliest(...instants: (number | undefined)[]): number | undefined {
  const known = instants.filter((instant) => instant !== undefined);

  return known.length === 0 ? undefined : Math.min(...known);
}

export function statusOf(object: KubeObjectData, given: StatusContext): ObjectStatus {
  const read = objectOf(object);
  const context = contextOf(given);
  const identity = identityOf(read);
  const { rule, known } = ruleOf(identity, context);
  const conditions: ConditionsResult = rule.hasStatus
    ? readConditions(read, conditionsKindOf(rule), context)
    : { state: "read", conditions: [], notes: [] };
  const health = healthOf(rule, read, conditions, context);
  const freshness = known
    ? freshnessOf(rule, read, conditions, context)
    : { marks: [], pause: { paused: false, since: undefined }, notes: [] };
  const phase = phaseOf(rule, read);
  const activities = activitiesOf({ object: read, rule, conditions, pause: freshness.pause, context });
  const tone = toneOf({ object: read, rule, health: health.health, activities, context });
  const remediation =
    rule === MACHINE_HEALTH_CHECK_RULE
      ? remediationOf(conditions.state === "read" ? conditions.conditions : [])
      : undefined;

  return {
    object: identity,
    health: health.health,
    tone,
    activities,
    freshness: freshness.marks,
    phase: phase.phase,
    remediation,
    notes: mergeNotes(
      conditions.notes,
      health.notes,
      freshness.notes,
      phase.notes,
      deprecatedFailureOf(rule, read),
      activities.state === "read" ? activities.notes : [],
      tone.state === "read" ? tone.notes : [],
    ),
    changesAt: earliest(
      activities.state === "read" ? activities.changesAt : undefined,
      tone.state === "read" ? tone.changesAt : undefined,
    ),
  };
}

export function conditionsOf(object: KubeObjectData, given: StatusContext): ConditionsResult {
  const read = objectOf(object);
  const context = contextOf(given);
  const { rule } = ruleOf(identityOf(read), context);

  if (!rule.hasStatus) return { state: "read", conditions: [], notes: [] };
  return readConditions(read, conditionsKindOf(rule), context);
}
