/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The cells of the list of Clusters (SPEC-0004, "The list", P7 to P12, P14, P28), as pure functions of a Cluster and
// of what the status model returns for it. A mark of state comes from `statusOf` and `conditionsOf` alone, and the
// words are those of the closed sets of SPEC-0003 and of the project, never reworded. The tone of a mark is one of the
// tones of SPEC-0003, P31, which the views map to the tokens of the theme.

import { compareKubernetesVersions, parseKubernetesVersion } from "../parsers/kubernetes-version";
import { countOf, fieldsOf, listOf, textOf } from "./objects";
import { classReferenceOf } from "./references";
import { ACTIVITY_ORDER } from "./words";

import type { ConditionMessage, MessageLine } from "../parsers/condition-message";
import type { ParsedTime } from "../parsers/time";
import type { Activity, ClusterObject, ConditionsResult, FreshnessMark, ObjectStatus } from "../status/index";

// The tones of SPEC-0003, P31: Healthy and the weight Ok; progress, Idle and the weights Activity and At rest; a
// warning; an error; Deleting within its threshold, Paused and Rollout paused; and Unknown, with the marks of
// freshness.
export type Tone = "ok" | "info" | "warning" | "error" | "terminated" | "vague";

// A time that the project wrote, as the views show it: the text for the components of the host, or N/A for a time
// that is not valid (SPEC-0003, P30); none where the project wrote no time.
export type Time = { readonly state: "written"; readonly text: string } | { readonly state: "unavailable" };

function timeOf(parsed: ParsedTime | undefined): Time | undefined {
  if (parsed === undefined || parsed.state === "absent") return undefined;
  return parsed.state === "accepted" ? { state: "written", text: parsed.text } : { state: "unavailable" };
}

// A mark of state: its word, its tone, the state of an activity when it is not Progressing, and the start of its
// duration.
export interface Mark {
  readonly word: string;
  readonly tone: Tone;
  readonly state?: "Blocked" | "Unknown";
  readonly since?: Time;
}

// A counter cell: the available Machines of the desired, and every counter with its unit in the tooltip (P8).
export interface CountersCell {
  readonly text: string;
  readonly tooltip: readonly string[];
  readonly sort: readonly number[];
}

const COUNTERS = [
  ["desiredReplicas", "Desired"],
  ["replicas", "Current"],
  ["readyReplicas", "Ready"],
  ["availableReplicas", "Available"],
  ["upToDateReplicas", "Up to date"],
] as const;

function machines(count: number): string {
  return count === 1 ? "1 Machine" : `${count} Machines`;
}

// The counters of the control plane or of the workers of a Cluster, as the project sums them (SPEC-0001, R2.12,
// R2.13). A counter that the project has not written is N/A.
export function countersCell(
  cluster: ClusterObject,
  part: "controlPlane" | "workers",
  poolsWithoutMachines = 0,
): CountersCell {
  const counters = fieldsOf(fieldsOf(cluster.status)?.[part]);
  const available = countOf(counters?.availableReplicas);
  const desired = countOf(counters?.desiredReplicas);
  const text = available === undefined && desired === undefined ? "N/A" : `${available ?? "N/A"}/${desired ?? "N/A"}`;
  const tooltip = COUNTERS.map(([field, label]) => {
    const count = countOf(counters?.[field]);

    return `${label}: ${count === undefined ? "N/A, not written yet" : machines(count)}`;
  });

  if (part === "workers" && poolsWithoutMachines > 0) {
    tooltip.push(
      "A MachinePool of this Cluster has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.",
    );
  }
  return {
    text,
    tooltip,
    sort: [available ?? Number.POSITIVE_INFINITY, desired ?? Number.POSITIVE_INFINITY],
  };
}

// A version as the cell shows it: as written, whether the parser knows it or not.
export interface VersionCell {
  readonly text: string;
  readonly tooltip: readonly string[];
  // The version that the cell shows first, which the list sorts on (P28).
  readonly first: string | undefined;
}

interface VersionCount {
  readonly version: string;
  readonly replicas: number | undefined;
}

function versionsOf(cluster: ClusterObject, part: "controlPlane" | "workers"): VersionCount[] {
  return listOf(fieldsOf(fieldsOf(cluster.status)?.[part])?.versions).flatMap((entry) => {
    const version = textOf(fieldsOf(entry)?.version);

    return version === undefined ? [] : [{ version, replicas: countOf(fieldsOf(entry)?.replicas) }];
  });
}

// Versions in the order of the parser of SPEC-0003, oldest first, one that it does not know last (P28).
export function compareVersions(one: string, other: string): number {
  const first = parseKubernetesVersion(one);
  const second = parseKubernetesVersion(other);

  if (first.state !== "known" || second.state !== "known") {
    return Number(first.state !== "known") - Number(second.state !== "known");
  }

  const order = compareKubernetesVersions(first, second);

  return order === "before" ? -1 : order === "after" ? 1 : 0;
}

function countLine(entry: VersionCount): string {
  return entry.replicas === undefined ? entry.version : `${entry.version}: ${machines(entry.replicas)}`;
}

// The version of a Cluster (P9): that of its topology, else the versions that its control plane reports, oldest
// first; the tooltip lists the versions of the control plane and of the workers, each with its number of Machines.
export function versionCell(cluster: ClusterObject): VersionCell {
  const topology = textOf(fieldsOf(fieldsOf(cluster.spec)?.topology)?.version);
  const controlPlane = versionsOf(cluster, "controlPlane").sort((one, other) =>
    compareVersions(one.version, other.version),
  );
  const workers = versionsOf(cluster, "workers").sort((one, other) => compareVersions(one.version, other.version));
  const shown = topology !== undefined && topology !== "" ? [topology] : controlPlane.map((entry) => entry.version);
  const tooltip = [
    ...(topology !== undefined && topology !== "" ? [`Topology: ${topology}`] : []),
    `Control plane: ${controlPlane.length === 0 ? "N/A, not written yet" : controlPlane.map(countLine).join(", ")}`,
    `Workers: ${workers.length === 0 ? "N/A, not written yet" : workers.map(countLine).join(", ")}`,
  ];

  return { text: shown.length === 0 ? "N/A" : shown.join(", "), tooltip, first: shown[0] };
}

// The position of each version in the order of the parser, for the sort of the list: one for each version that the
// rows show first, and the same for versions that the parser cannot order, unknown versions last.
export function versionRanks(versions: readonly (string | undefined)[]): Map<string, number> {
  const known = [...new Set(versions.filter((version) => version !== undefined))].sort(compareVersions);
  const ranks = new Map<string, number>();
  let rank = 0;

  known.forEach((version, index) => {
    if (index > 0 && compareVersions(known[index - 1], version) !== 0) rank = index;
    ranks.set(version, rank);
  });
  return ranks;
}

// The class of a Cluster with a managed topology, with its namespace when it is not that of the Cluster (R3.12).
export interface ClassCell {
  readonly text: string;
  readonly tooltip: string | undefined;
  readonly sort: readonly string[];
}

export function classCell(cluster: ClusterObject): ClassCell {
  const reference = classReferenceOf(cluster);

  if (reference === undefined) {
    return { text: "N/A", tooltip: "This Cluster has no managed topology", sort: ["\uffff", ""] };
  }
  return {
    text: reference.elsewhere ? `${reference.namespace}/${reference.name}` : reference.name,
    tooltip: reference.elsewhere ? `In the namespace ${reference.namespace}` : undefined,
    sort: [reference.name, reference.namespace ?? ""],
  };
}

// The tone of the mark of an activity (SPEC-0003, P31).
function activityTone(activity: Activity): Tone {
  switch (activity.tone) {
    case "progress":
      return "info";
    case "warning":
      return "warning";
    case "terminated":
      return "terminated";
    case "vague":
      return "vague";
  }
}

export interface ActivityCell {
  // The activities, in the order of the closed set, then Unknown when a source cannot be read, or Idle.
  readonly marks: readonly Mark[];
  readonly sort: number;
}

function activityMark(activity: Activity): Mark {
  return {
    word: activity.name,
    tone: activityTone(activity),
    ...(activity.state === "Progressing" ? {} : { state: activity.state }),
    ...(timeOf(activity.since) === undefined ? {} : { since: timeOf(activity.since) }),
  };
}

// The activities of a Cluster (P7): each in a mark of its tone, with its state when it is not Progressing and its
// duration, in the order of the closed set of SPEC-0003; Unknown next to them when a source cannot be read; Idle when
// none holds and every source was read.
export function activityCell(status: ObjectStatus): ActivityCell {
  const { activities } = status;

  if (activities.state === "none") return { marks: [], sort: ACTIVITY_ORDER.length + 2 };

  const marks = activities.activities.map(activityMark);

  if (activities.unknown) marks.push({ word: "Unknown", tone: "vague" });
  if (activities.idle) marks.push({ word: "Idle", tone: "info" });

  const first = activities.activities[0];
  const sort =
    first !== undefined
      ? ACTIVITY_ORDER.indexOf(first.name)
      : activities.unknown
        ? ACTIVITY_ORDER.length
        : ACTIVITY_ORDER.length + 1;

  return { marks, sort };
}

// The health of a Cluster in the list (P12): its word in its tone; the word "stale" in the tone of a mark of
// freshness, whose tooltip names each cause and when it began; and how many of its MachinePools are of unknown health.
export interface HealthCell {
  // Undefined for a Cluster with no health: N/A, with the reason.
  readonly mark: Mark | undefined;
  readonly none: "deleting" | "no status" | undefined;
  readonly stale: readonly FreshnessCause[];
  readonly poolsUnknown: number;
  readonly sort: number;
}

export interface FreshnessCause {
  readonly cause: string;
  readonly detail: string | undefined;
  readonly since: Time | undefined;
}

const HEALTH_ORDER = ["Unhealthy", "Degraded", "Unknown", "Healthy"] as const;

function causeOf(mark: FreshnessMark): FreshnessCause {
  switch (mark.cause) {
    case "Paused":
      return { cause: mark.cause, detail: undefined, since: timeOf(mark.since) };
    case "Older generation":
      return {
        cause: mark.cause,
        detail: `generation ${mark.generation}, observed ${mark.observedGeneration}`,
        since: undefined,
      };
    case "Controller not available":
      return { cause: mark.cause, detail: mark.provider, since: timeOf(mark.since) };
    case "Workload cluster unreachable":
      return { cause: mark.cause, detail: undefined, since: timeOf(mark.since) };
  }
}

// The tone of the mark of health (SPEC-0003, D2, P31): that of progress or of a warning that an activity sets, else
// that of the health itself.
function healthTone(status: ObjectStatus, word: string): Tone {
  if (status.tone.tone === "progress") return "info";
  if (status.tone.tone === "warning") return "warning";
  switch (word) {
    case "Healthy":
      return "ok";
    case "Degraded":
      return "warning";
    case "Unhealthy":
      return "error";
    default:
      return "vague";
  }
}

export function healthCell(status: ObjectStatus): HealthCell {
  const { health } = status;
  const note = status.notes.find((entry) => entry.code === "machine-pools-unknown");
  const poolsUnknown = note?.code === "machine-pools-unknown" ? note.count : 0;
  const stale = status.freshness.map(causeOf);

  if (health.health === "none") {
    return { mark: undefined, none: health.because, stale, poolsUnknown, sort: HEALTH_ORDER.length };
  }
  return {
    mark: { word: health.health, tone: healthTone(status, health.health) },
    none: undefined,
    stale,
    poolsUnknown,
    sort: HEALTH_ORDER.indexOf(health.health),
  };
}

// The status of a Cluster (P11): the headline of the message of `Available`, else its reason; N/A when the Cluster has
// no `Available` yet. The tooltip holds the whole message, each line with its indentation, as the parser nests it.
export interface StatusCell {
  readonly text: string;
  readonly lines: readonly { readonly indentation: number; readonly text: string }[];
  readonly reported: boolean;
}

function flatten(lines: readonly MessageLine[], into: { indentation: number; text: string }[]): void {
  for (const line of lines) {
    into.push({ indentation: line.indentation, text: line.written.slice(line.indentation) });
    flatten(line.children, into);
  }
}

// A line that has words of its own: not empty, and more than the subject that starts it.
function hasWords(line: MessageLine): boolean {
  const text = line.text.trim();

  return text !== "" && (line.subject === undefined || text !== line.subject.text);
}

// The first line with words of its own among these lines and the lines nested under them, in their order.
function firstWorded(lines: readonly MessageLine[]): MessageLine | undefined {
  for (const line of lines) {
    if (hasWords(line)) return line;

    const nested = firstWorded(line.children);

    if (nested !== undefined) return nested;
  }
  return undefined;
}

// The headline of a message (P11): its first line as the parser gives it. A first line that is a subject with no words
// of its own, such as `* WorkersAvailable:`, whose words are in the lines nested under it, says nothing in a list: the
// headline is then that subject followed by the first line under it that has words, both as the parser gives their
// text, without their bullets, such as `WorkersAvailable: MachineDeployment md-0: 0 available replicas` (decided while
// implementing, under the delegation for M1).
export function headlineOf(message: Extract<ConditionMessage, { state: "read" }>): string | undefined {
  const [first] = message.lines;

  if (first === undefined || hasWords(first)) return message.headline;

  const worded = firstWorded(first.children);

  return worded === undefined ? message.headline : `${first.text.trim()} ${worded.text.trim()}`;
}

export function statusCell(conditions: ConditionsResult): StatusCell {
  const available =
    conditions.state === "read" ? conditions.conditions.find((condition) => condition.type === "Available") : undefined;

  if (available === undefined) return { text: "N/A", lines: [], reported: false };

  const lines: { indentation: number; text: string }[] = [];
  const message = available.parsedMessage;

  if (message.state === "read") flatten(message.lines, lines);

  const headline = message.state === "read" ? headlineOf(message) : available.message;
  const text = headline !== undefined && headline !== "" ? headline : (available.reason ?? "");

  return { text: text === "" ? "N/A" : text, lines, reported: true };
}

// The words of a row that its columns show, which the search matches next to the fields that `getSearchFields()` of
// the host gives (P14).
// The marks of state of a row whose inputs are still loading show the spinner, and give no word.
export function searchWords(cells: {
  readonly health: HealthCell | undefined;
  readonly activity: ActivityCell | undefined;
  readonly version: VersionCell;
  readonly clusterClass: ClassCell;
}): string[] {
  return [
    ...(cells.health?.mark === undefined ? [] : [cells.health.mark.word]),
    ...(cells.health !== undefined && cells.health.stale.length > 0 ? ["stale"] : []),
    ...(cells.activity?.marks ?? []).flatMap((mark) => [mark.word, ...(mark.state === undefined ? [] : [mark.state])]),
    ...(cells.version.first === undefined ? [] : cells.version.text.split(", ")),
    ...(cells.clusterClass.text === "N/A" ? [] : [cells.clusterClass.text]),
  ];
}

// The cells of one row of the list, from the result of the model for its Cluster.
export interface RowCells {
  readonly controlPlane: CountersCell;
  readonly workers: CountersCell;
  readonly version: VersionCell;
  readonly clusterClass: ClassCell;
  readonly activity: ActivityCell;
  readonly health: HealthCell;
  readonly status: StatusCell;
  readonly search: readonly string[];
  // An input of the model is not loaded yet: the marks of state show the spinner (SPEC-0004, P19).
  readonly pending: boolean;
}

export function rowCells(row: {
  readonly cluster: ClusterObject;
  readonly status: ObjectStatus;
  readonly conditions: ConditionsResult;
  readonly pending: boolean;
  readonly poolsWithoutMachines: number;
}): RowCells {
  const version = versionCell(row.cluster);
  const clusterClass = classCell(row.cluster);
  const activity = activityCell(row.status);
  const health = healthCell(row.status);

  return {
    controlPlane: countersCell(row.cluster, "controlPlane"),
    workers: countersCell(row.cluster, "workers", row.poolsWithoutMachines),
    version,
    clusterClass,
    activity,
    health,
    status: statusCell(row.conditions),
    search: row.pending
      ? searchWords({ health: undefined, activity: undefined, version, clusterClass })
      : searchWords({ health, activity, version, clusterClass }),
    pending: row.pending,
  };
}
