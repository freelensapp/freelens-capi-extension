/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The details of a Cluster (SPEC-0004, "The details", P17, P18, P27), as pure functions of the Cluster, of what the
// status model returns for it and for each of its parts, and of the reads of its namespace. Every mark of state comes
// from `statusOf` and `conditionsOf`; the words are those of the closed sets of SPEC-0003 and of the project, never
// reworded, and the facts of the project are shown as it writes them. A section, or a row, that has nothing to show is
// left out.
//
// - Status: the health and the condition it rests on, the source of its tone, the activities, the marks of freshness
//   and the reads that failed, the summary, the issues, the notes of the model, the phase and the failure fields.
// - Control plane: its object, or the control plane Machines of its own, its counters, versions, whether it is
//   initialized (P27) and its endpoint.
// - Workers: their counters and versions, and one row for each part that the Cluster sums (P17).
// - Infrastructure: its object, whether it is provisioned (P27), and the failure domains.
// - Topology, Network and Conditions.
//
// A reference to an object of Cluster API of the Cluster opens the tree of the Cluster at its node, with its details,
// the details of the extension that SPEC-0005 gives every object of a Cluster (SPEC-0005, P3, P5): as the maintainer
// decided for the KubeadmControlPlane, the MachineDeployments, the MachinePools and the ClusterClass, and as SPEC-0005
// proposes for the MachineSets and the worker Machines among the parts and for a name in a message that names an object
// of Cluster API of the Cluster that the view read. A reference to an object of a provider is a link to the details of
// the host when the view read the object, and otherwise text that says why.

import { PENDING_HOOKS_ANNOTATION, parseListAnnotation } from "../parsers/list-annotation";
import { activityCell, compareVersions, healthCell } from "./cluster-cells";
import { holdsOf } from "./cluster-view";
import { countOf, fieldsOf, listOf, metadataOf, nameOf, namespaceOf, textOf } from "./objects";
import { namespaceRead } from "./read-state";
import { classReferenceOf, contractReferenceOf, isClusterApiKind, targetReadOf } from "./references";
import { addressOf } from "./tree-address";
import { variableNamesOf } from "./variable-names";

import type { ConditionMessage, MessageLine } from "../parsers/condition-message";
import type { ParsedTime } from "../parsers/time";
import type {
  Activity,
  ClusterObject,
  ConditionsResult,
  Issue,
  KubeObjectData,
  Note,
  ObjectStatus,
  WeightedCondition,
} from "../status/index";
import type { ActivityCell, HealthCell, Mark, Time, Tone } from "./cluster-cells";
import type { Holds } from "./cluster-view";
import type { ClusterParts, ContextIndex, InputState, MachinePart, Part, ProviderKindObjects } from "./context";
import type { KindDescriptor, ReadsState } from "./read-state";
import type { TargetRead, UnreadReason } from "./references";

// A time that the project wrote, as the views show it: N/A for a time that is not valid, none for one not written
// (SPEC-0003, P30).
export function parsedTimeOf(parsed: ParsedTime | undefined): Time | undefined {
  if (parsed === undefined || parsed.state === "absent") return undefined;
  return parsed.state === "accepted" ? { state: "written", text: parsed.text } : { state: "unavailable" };
}

// References (P18)

// An object is of Cluster API when its group and its kind are among the kinds of SPEC-0001, R1, the `Provider` of
// `clusterctl` and the seven kinds of the operator included (SPEC-0005, P5), which widens the list that SPEC-0004
// decided while implementing P18; any other kind is of a provider. None of them ever gets the link to the details of
// the host (SPEC-0001, A7): the details of the extension, the node of the object in the tree, stand for it.
export function isClusterApiObject(group: string, kind: string): boolean {
  return isClusterApiKind(group, kind);
}

export type ReferenceRead =
  // Found, with what the model computes for it, its health and its activities as marks.
  | { readonly state: "found"; readonly part: Part; readonly health: HealthCell; readonly activity: ActivityCell }
  | Exclude<TargetRead, { readonly state: "found" }>;

export interface ReferenceView {
  readonly kind: string;
  readonly name: string;
  readonly group: string;
  // An object of Cluster API, which opens the tree of the Cluster at its node (SPEC-0005, P5).
  readonly clusterApi: boolean;
  // The node of an object of Cluster API in the tree of the Cluster, by its address (SPEC-0005, P2); undefined for an
  // object of a provider.
  readonly node: string | undefined;
  // The address of the details of the host for an object of a provider that the view read; undefined for text.
  readonly selfLink: string | undefined;
  readonly read: ReferenceRead;
}

function selfLinkOf(part: Part): string | undefined {
  const link = textOf(metadataOf(part.object)?.selfLink);

  return link === undefined || link === "" ? undefined : link;
}

// The reference of a Cluster to its control plane or its infrastructure cluster, with how its object was read.
function referenceView(
  reads: ReadsState,
  cluster: ClusterObject,
  field: "controlPlaneRef" | "infrastructureRef",
  kinds: ReadonlyMap<string, ProviderKindObjects> | undefined,
  found: Part | InputState | undefined,
): ReferenceView | undefined {
  const reference = contractReferenceOf(fieldsOf(cluster.spec)?.[field]);

  if (reference === undefined) return undefined;

  const { apiGroup: group, kind, name } = reference;
  const clusterApi = isClusterApiObject(group, kind);
  const view = { kind, name, group, clusterApi, node: clusterApi ? addressOf(group, kind, name) : undefined };
  const objects = kinds?.get(`${group}/${kind}`);
  const resolution = objects?.resolution;

  if (found !== undefined && typeof found !== "string") {
    return {
      ...view,
      selfLink: clusterApi ? undefined : selfLinkOf(found),
      read: { state: "found", part: found, health: healthCell(found.status), activity: activityCell(found.status) },
    };
  }

  const namespace = namespaceOf(cluster) ?? "";
  const kindRead = objects?.key === undefined ? "not-served" : namespaceRead(reads, objects.key, namespace);
  const holds =
    objects?.key === undefined ? { load: undefined, refresh: undefined } : holdsOf(reads, objects.key, namespace);
  // A part that is still loading is pending, whatever its kind says.
  const read =
    found === "pending"
      ? ({ state: "pending" } as const)
      : targetReadOf(
          resolution,
          kindRead,
          [...(holds.load?.failures ?? []), ...(holds.refresh?.failures ?? [])],
          false,
        );

  return { ...view, selfLink: undefined, read: read.state === "found" ? { state: "pending" } : read };
}

export const UNREAD_WORDS: Record<UnreadReason, string> = {
  "definition-refused":
    "Its definition could not be read: reading it takes get on customresourcedefinitions of apiextensions.k8s.io, for that definition.",
  "definition-failed": "Its definition could not be read.",
  "no-known-version": "Its definition names no version of the contract that this extension knows.",
  "not-served": "This cluster serves no such kind.",
  "version-not-served":
    "This cluster does not serve this kind at the version that the contract label of its definition names.",
  "kind-not-read": "Its kind could not be read in the namespace of the Cluster.",
  "not-found": "No such object is in the namespace of the Cluster.",
};

// The names of a subject of a line of a message, each as P18 shows it, as a link only when the view read its target:
// a Cluster of the namespace that the view read opens its details of the extension; an object of Cluster API of the
// Cluster that the view read opens the tree of the Cluster at its node (SPEC-0005, P5); an object of a provider that a
// reference of the Cluster names, its control plane or its infrastructure cluster, read by the view, opens the details
// of the host as the link of that reference does; every other name is text.
export type SubjectTarget =
  | { readonly form: "cluster"; readonly namespace: string; readonly name: string }
  | { readonly form: "tree"; readonly node: string }
  | { readonly form: "host"; readonly selfLink: string }
  | { readonly form: "text" };

export function subjectTarget(
  details: Pick<ClusterDetails, "cluster" | "controlPlane" | "infrastructure" | "readClusters" | "readObjects">,
  kind: string,
  name: string,
): SubjectTarget {
  if (kind === "Cluster") {
    return details.readClusters.includes(name)
      ? { form: "cluster", namespace: namespaceOf(details.cluster) ?? "", name }
      : { form: "text" };
  }

  const node = details.readObjects.get(`${kind}/${name}`);

  if (node !== undefined) return { form: "tree", node };
  for (const reference of [details.controlPlane?.reference, details.infrastructure?.reference]) {
    if (reference?.kind === kind && reference.name === name && reference.selfLink !== undefined) {
      return { form: "host", selfLink: reference.selfLink };
    }
  }
  return { form: "text" };
}

// The objects of Cluster API of a Cluster that the view read, which a name in a message may name, by their kind and
// their name, each with the address of its node in the tree of the Cluster (SPEC-0005, P2, P5): its Machines, its
// MachineSets, its MachineDeployments and its MachinePools, by the label of the name of the Cluster, and its control
// plane when it is a KubeadmControlPlane, in the namespace of the Cluster, as the indexes of the context hold them.
export function readObjectsOf(index: ContextIndex, cluster: ClusterObject): ReadonlyMap<string, string> {
  const namespace = namespaceOf(cluster) ?? "";
  const name = nameOf(cluster) ?? "";
  const key = `${namespace}/${name}`;
  const found = new Map<string, string>();
  const add = (objects: readonly KubeObjectData[] | undefined) => {
    for (const object of objects ?? []) {
      const kind = textOf(object.kind) ?? "";
      const objectName = nameOf(object) ?? "";

      found.set(`${kind}/${objectName}`, addressOf("cluster.x-k8s.io", kind, objectName));
    }
  };

  add(index.machinesByCluster.get(key));
  add(index.machineSetsByCluster.get(key));
  add(index.deploymentsByCluster.get(key));
  add(index.poolsByCluster.get(key));

  const reference = contractReferenceOf(fieldsOf(cluster.spec)?.controlPlaneRef);

  if (reference !== undefined && isClusterApiObject(reference.apiGroup, reference.kind)) {
    const read = index.controlPlanes
      .get(`${reference.apiGroup}/${reference.kind}`)
      ?.get(`${namespace}/${reference.name}`);

    if (read !== undefined) {
      found.set(`${reference.kind}/${reference.name}`, addressOf(reference.apiGroup, reference.kind, reference.name));
    }
  }
  return found;
}

// A line of a message, nested as the parser gives it (SPEC-0003, P27), with the names of its subject.
export interface MessageLineView {
  readonly text: string;
  readonly bullet: boolean;
  // The subject of an aggregate, `<Kind> <names>`, which starts the text; the rest of the text follows it.
  readonly subject: { readonly kind: string; readonly names: readonly string[]; readonly length: number } | undefined;
  readonly children: readonly MessageLineView[];
}

function lineView(line: MessageLine): MessageLineView {
  const subject = line.subject?.form === "aggregate" ? line.subject : undefined;

  return {
    text: line.text,
    bullet: line.bullet,
    subject:
      subject === undefined ? undefined : { kind: subject.kind, names: subject.names, length: subject.text.length },
    children: line.children.map(lineView),
  };
}

export function messageLines(message: ConditionMessage): readonly MessageLineView[] {
  return message.state === "read" ? message.lines.map(lineView) : [];
}

// Notes (SPEC-0003, "What it takes and returns")

const INPUT_WORDS: Readonly<Record<string, string>> = {
  cluster: "its Cluster",
  healthChecks: "the MachineHealthChecks of its namespace, for the threshold of its Machines",
  machines: "its Machines",
  parts: "its control plane and its MachineDeployments",
  machinePools: "its MachinePools",
  clusterClass: "its ClusterClass, whose availability gates apply to it",
  bindings: "its ClusterResourceSetBindings",
  role: "the reference that names it",
  contract: "the contract of its definition",
  provider: "the provider of its definition",
  controllers: "the availability of the controllers of its providers",
};

// A note of the model, in words; undefined for the notes that the details show elsewhere: the failure fields, which
// have rows of their own, and the MachinePools of unknown health, which follow the health.
export function noteWords(note: Note): string | undefined {
  switch (note.code) {
    case "input-not-given":
      return `Not read, so not given to the status model: ${INPUT_WORDS[note.input] ?? note.input}.`;
    case "field-unreadable":
      return `The field ${note.field} holds a value of the wrong type, read as unknown.`;
    case "kind-unknown":
      return "The status model does not know this kind.";
    case "never-available":
      return `The project never reports this Cluster available: it has no managed topology, and no ${note.missing.join(" and no ")}.`;
    case "no-machine":
      return "This MachinePool has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.";
    case "applied-to-no-cluster":
      return "This ClusterResourceSet applied to no Cluster.";
    case "no-contract-status":
      return "No contract of the project names the status of this object.";
    case "controller-unknown":
      return `The availability of the controller of ${note.provider} is not known.`;
    case "stale-condition":
      return `${note.type} records a past failure: no issue, and at rest.`;
    case "machines-differ-from-spec":
      return "Its Machines differ from its spec while nothing rolls them out.";
    case "deprecated-failure":
    case "machine-pools-unknown":
      return undefined;
  }
}

// The status section

// The tone of the mark of a weight (SPEC-0003, P31): Ok, Issue, Activity and At rest, Unknown.
export function weightTone(weight: WeightedCondition["weight"]): Tone {
  switch (weight) {
    case "Ok":
      return "ok";
    case "Issue":
      return "error";
    case "Activity":
    case "At rest":
      return "info";
    case "Unknown":
      return "vague";
  }
}

// The source of the tone of the health (SPEC-0003, D2, P2): the activity that sets it, the object that holds it, and
// the time after which it turns to a warning.
export interface ToneSource {
  readonly tone: "progress" | "warning";
  readonly activity: Activity;
  readonly heldBy: { readonly kind: string | undefined; readonly name: string | undefined };
  // The length of its threshold, in seconds, and the instant at which it is passed; undefined when the project wrote
  // no start, which counts as past it.
  readonly seconds: number | undefined;
  readonly passesAt: number | undefined;
}

// The form that pauses a Cluster (SPEC-0003, P19; SPEC-0001, R4.56 to R4.58): `spec.paused`, which reaches the Cluster
// and every object of it, the annotation, which reaches the Cluster alone, or both.
export type PauseForm = "spec.paused" | "annotation" | "both";

export const PAUSED_ANNOTATION = "cluster.x-k8s.io/paused";

export function pauseFormOf(cluster: ClusterObject): PauseForm | undefined {
  const field = fieldsOf(cluster.spec)?.paused === true;
  const annotations = fieldsOf(metadataOf(cluster)?.annotations);
  const annotation = annotations !== undefined && Object.hasOwn(annotations, PAUSED_ANNOTATION);

  if (field && annotation) return "both";
  if (field) return "spec.paused";
  return annotation ? "annotation" : undefined;
}

export interface ActivityView {
  readonly mark: Mark;
  readonly activity: Activity;
  // When it started, as the project wrote it.
  readonly since: Time | undefined;
  // What the project writes of it: the stage of a deletion, the reason of `TopologyReconciled` for an upgrade, with
  // the message of that condition, and the form of a pause.
  readonly stage: { readonly reason: string | undefined; readonly lines: readonly MessageLineView[] } | undefined;
  readonly pause: PauseForm | undefined;
  // The object that makes it hold, when it is another.
  readonly source: { readonly kind: string | undefined; readonly name: string | undefined } | undefined;
}

// A read that failed in the namespace of the Cluster: what the details say of it (P25), a load that failed there, a
// refresh that failed there, or both.
export interface ReadFailureView extends Holds {
  readonly descriptor: KindDescriptor;
}

export interface StatusSection {
  readonly health: HealthCell;
  readonly restsOn: WeightedCondition | undefined;
  readonly restsOnType: string | undefined;
  readonly toneSource: ToneSource | undefined;
  readonly activities: readonly ActivityView[];
  // Idle or Unknown, when no activity holds or a source cannot be read.
  readonly otherActivities: readonly Mark[];
  readonly reads: readonly ReadFailureView[];
  readonly summary: WeightedCondition | undefined;
  readonly summarySince: Time | undefined;
  readonly summaryLines: readonly MessageLineView[];
  readonly issues: readonly Issue[];
  readonly notes: readonly string[];
  readonly phase: { readonly written: string; readonly deprecated: boolean } | undefined;
  readonly failure: { readonly reason: string | undefined; readonly message: string | undefined } | undefined;
}

export function toneSourceOf(status: ObjectStatus): ToneSource | undefined {
  const { tone } = status;

  if (tone.tone === "health" || tone.setBy === undefined) return undefined;
  return {
    tone: tone.tone,
    activity: tone.setBy.activity,
    heldBy: { kind: tone.setBy.heldBy.kind, name: tone.setBy.heldBy.name },
    seconds: tone.setBy.activity.threshold?.seconds,
    passesAt: tone.setBy.activity.threshold?.passesAt,
  };
}

function activityViews(cluster: ClusterObject, status: ObjectStatus, cell: ActivityCell): ActivityView[] {
  const { activities } = status;

  if (activities.state !== "read") return [];

  const own = { kind: textOf(cluster.kind), name: nameOf(cluster) };

  return activities.activities.map((activity, index) => {
    const condition = activity.condition;
    const stage =
      (activity.name === "Deleting" || activity.name === "Upgrading") && condition !== undefined
        ? { reason: condition.reason, lines: messageLines(condition.parsedMessage) }
        : undefined;
    const source =
      activity.source === undefined || (activity.source.kind === own.kind && activity.source.name === own.name)
        ? undefined
        : { kind: activity.source.kind, name: activity.source.name };

    return {
      mark: cell.marks[index],
      activity,
      since: parsedTimeOf(activity.since),
      stage,
      pause: activity.name === "Paused" ? pauseFormOf(cluster) : undefined,
      source,
    };
  });
}

function statusSection(
  cluster: ClusterObject,
  status: ObjectStatus,
  conditions: ConditionsResult,
  reads: readonly ReadFailureView[],
): StatusSection {
  const cell = activityCell(status);
  const views = activityViews(cluster, status, cell);
  const { health } = status;
  const restsOn = health.health !== "none" && health.restsOn.form === "condition" ? health.restsOn : undefined;
  const summary =
    conditions.state === "read" ? conditions.conditions.find((condition) => condition.type === "Available") : undefined;
  const failure = status.notes.find((note) => note.code === "deprecated-failure");

  return {
    health: healthCell(status),
    restsOn: restsOn?.condition,
    restsOnType: restsOn?.type,
    toneSource: toneSourceOf(status),
    activities: views,
    otherActivities: cell.marks.slice(views.length),
    reads,
    summary,
    summarySince: parsedTimeOf(summary?.lastTransitionTime),
    summaryLines: summary === undefined ? [] : messageLines(summary.parsedMessage),
    issues: health.health === "none" ? [] : health.issues,
    notes: status.notes.map(noteWords).filter((words): words is string => words !== undefined),
    phase:
      status.phase?.written === undefined
        ? undefined
        : { written: status.phase.written, deprecated: status.phase.deprecated },
    failure: failure?.code === "deprecated-failure" ? { reason: failure.reason, message: failure.message } : undefined,
  };
}

// The parts (P17)

// What a row of a part shows: its kind and name as text, what the model computes for it, and the available replicas
// of the desired.
export interface PartRow {
  readonly kind: string;
  readonly name: string;
  readonly namespace: string | undefined;
  // The node of the part in the tree of its Cluster, which its name opens (SPEC-0005, P5).
  readonly node: string;
  readonly health: HealthCell;
  readonly activity: ActivityCell;
  // An input of its model is not loaded yet: its marks show the spinner.
  readonly pending: boolean;
  readonly available: number | undefined;
  readonly desired: number | undefined;
  // A MachinePool with no Machines, whose counters count the instances of its provider (SPEC-0003, P10).
  readonly withoutMachines: boolean;
}

function partRow(part: Part, counted: { available: number | undefined; desired: number | undefined }): PartRow {
  const kind = textOf(part.object.kind) ?? "";
  const name = nameOf(part.object) ?? "";

  return {
    kind,
    name,
    namespace: namespaceOf(part.object),
    node: addressOf("cluster.x-k8s.io", kind, name),
    health: healthCell(part.status),
    activity: activityCell(part.status),
    pending: part.pending,
    available: counted.available,
    desired: counted.desired,
    withoutMachines: part.status.notes.some((note) => note.code === "no-machine"),
  };
}

// The available replicas of the desired, as the project counts them: `status.availableReplicas` of `spec.replicas`
// for a MachineDeployment, a MachineSet and a MachinePool; for a stand-alone Machine, one desired, available when its
// `Available` is `True` (core/reconcilers/cluster/cluster_controller_status.go:221-300).
function replicasRow(part: Part): PartRow {
  return partRow(part, {
    available: countOf(fieldsOf(part.object.status)?.availableReplicas),
    desired: countOf(fieldsOf(part.object.spec)?.replicas),
  });
}

function machineRow(part: MachinePart): PartRow {
  const available =
    part.conditions.state === "read"
      ? part.conditions.conditions.find((condition) => condition.type === "Available")?.status === "True"
        ? 1
        : 0
      : undefined;

  return partRow(part, { available, desired: 1 });
}

// A list of parts, or how it is not given: still loading, or not read, which the reads that failed say.
export type Rows = { readonly state: "rows"; readonly rows: readonly PartRow[] } | { readonly state: InputState };

function rowsOf<T extends Part>(found: readonly T[] | InputState, row: (part: T) => PartRow): Rows {
  return typeof found === "string" ? { state: found } : { state: "rows", rows: found.map(row) };
}

// The counters of a part of a Cluster, `status.controlPlane` or `status.workers` (SPEC-0001, R2.12, R2.13).
export interface Counter {
  readonly label: string;
  readonly count: number | undefined;
}

const COUNTERS = [
  ["desiredReplicas", "desired"],
  ["replicas", "current"],
  ["readyReplicas", "ready"],
  ["availableReplicas", "available"],
  ["upToDateReplicas", "up to date"],
] as const;

function countersOf(cluster: ClusterObject, part: "controlPlane" | "workers"): Counter[] | undefined {
  const counters = fieldsOf(fieldsOf(cluster.status)?.[part]);

  if (counters === undefined) return undefined;
  return COUNTERS.map(([field, label]) => ({ label, count: countOf(counters[field]) }));
}

export interface VersionCount {
  readonly version: string;
  readonly replicas: number | undefined;
}

function versionsOf(cluster: ClusterObject, part: "controlPlane" | "workers"): VersionCount[] {
  return listOf(fieldsOf(fieldsOf(cluster.status)?.[part])?.versions)
    .flatMap((entry) => {
      const version = textOf(fieldsOf(entry)?.version);

      return version === undefined ? [] : [{ version, replicas: countOf(fieldsOf(entry)?.replicas) }];
    })
    .sort((one, other) => compareVersions(one.version, other.version));
}

// Initialized and Provisioned (P27).
export type Answer =
  | { readonly answer: "Yes"; readonly since: Time | undefined }
  | { readonly answer: "No"; readonly reason: string | undefined }
  | { readonly answer: "Unknown"; readonly reason: string | undefined; readonly written: boolean };

// Initialized reads `ControlPlaneInitialized` as `conditionsOf` gives it: Yes when `True`, since its transition; No
// when `False`; Unknown for any other status, with its reason, and when the Cluster has not written it yet.
function initializedOf(conditions: ConditionsResult): { answer: Answer; condition: WeightedCondition | undefined } {
  const condition =
    conditions.state === "read"
      ? conditions.conditions.find((entry) => entry.type === "ControlPlaneInitialized")
      : undefined;

  if (condition === undefined) return { answer: { answer: "Unknown", reason: undefined, written: false }, condition };
  if (condition.status === "True") {
    return { answer: { answer: "Yes", since: parsedTimeOf(condition.lastTransitionTime) }, condition };
  }
  if (condition.status === "False") return { answer: { answer: "No", reason: condition.reason }, condition };
  return { answer: { answer: "Unknown", reason: condition.reason, written: true }, condition };
}

// Provisioned reads `status.initialization.infrastructureProvisioned`, which the controller writes only as true: No
// while it is unset on a Cluster that has a status, Unknown while the Cluster has none.
function provisionedOf(cluster: ClusterObject): Answer {
  const status = fieldsOf(cluster.status);

  if (status === undefined) return { answer: "Unknown", reason: undefined, written: false };
  return fieldsOf(status.initialization)?.infrastructureProvisioned === true
    ? { answer: "Yes", since: undefined }
    : { answer: "No", reason: undefined };
}

export interface ControlPlaneSection {
  readonly reference: ReferenceView | undefined;
  // With no reference, the control plane Machines of its own (SPEC-0001, R3.7).
  readonly machines: Rows | undefined;
  readonly counters: readonly Counter[] | undefined;
  readonly versions: readonly VersionCount[];
  readonly initialized: Answer;
  readonly initializedCondition: WeightedCondition | undefined;
  readonly endpoint: string | undefined;
}

export interface WorkersSection {
  readonly counters: readonly Counter[] | undefined;
  readonly versions: readonly VersionCount[];
  readonly rows: readonly PartRow[];
  // The kinds of part that are still loading, or that were not read.
  readonly pending: boolean;
  readonly unread: boolean;
}

export interface InfrastructureSection {
  readonly reference: ReferenceView | undefined;
  readonly provisioned: Answer;
  readonly failureDomains: readonly { readonly name: string; readonly controlPlane: boolean | undefined }[];
}

// The topology (SPEC-0001, R2.96, R2.102, R3.22): its class, its version, the replicas it sets, each part it makes,
// and the lifecycle hooks still pending.
export interface TopologyPart {
  readonly kind: "MachineDeployment" | "MachinePool";
  readonly name: string;
  readonly className: string;
  readonly replicas: number | undefined;
}

export interface TopologySection {
  readonly className: string;
  readonly classNamespace: string | undefined;
  // The node of the class in the tree of the Cluster, which its name opens (SPEC-0005, P5).
  readonly classNode: string;
  // The names of the variables that the topology sets, never their values (SPEC-0005, P20).
  readonly variableNames: readonly string[];
  readonly version: string | undefined;
  readonly controlPlaneReplicas: number | undefined;
  readonly parts: readonly TopologyPart[];
  readonly hooks: { readonly state: "read"; readonly items: readonly { name: string; known: boolean }[] } | undefined;
}

export interface NetworkSection {
  readonly apiServerPort: number | undefined;
  readonly pods: readonly string[];
  readonly services: readonly string[];
  readonly serviceDomain: string | undefined;
}

export interface ConditionView {
  readonly condition: WeightedCondition;
  readonly since: Time | undefined;
  readonly lines: readonly MessageLineView[];
}

export interface ClusterDetails {
  readonly cluster: ClusterObject;
  // The names of the Clusters that the view read in the namespace of the Cluster, which a message may name.
  readonly readClusters: readonly string[];
  // The objects of Cluster API of the Cluster that the view read, which a message may name, by `<Kind>/<name>`, each
  // with the address of its node in the tree.
  readonly readObjects: ReadonlyMap<string, string>;
  // An input of the model of the Cluster is not loaded yet: its marks show the spinner.
  readonly pending: boolean;
  readonly status: StatusSection;
  readonly controlPlane: ControlPlaneSection | undefined;
  readonly workers: WorkersSection | undefined;
  readonly infrastructure: InfrastructureSection | undefined;
  readonly topology: TopologySection | undefined;
  readonly network: NetworkSection | undefined;
  readonly conditions: readonly ConditionView[] | undefined;
}

function controlPlaneSection(
  cluster: ClusterObject,
  parts: ClusterParts,
  index: ContextIndex,
  conditions: ConditionsResult,
): ControlPlaneSection | undefined {
  const reference = referenceView(
    index.objects.reads,
    cluster,
    "controlPlaneRef",
    index.objects.controlPlanes,
    parts.controlPlane,
  );
  const machines =
    parts.controlPlaneMachines === undefined ? undefined : rowsOf(parts.controlPlaneMachines, machineRow);
  const counters = countersOf(cluster, "controlPlane");
  const versions = versionsOf(cluster, "controlPlane");
  const initialized = initializedOf(conditions);
  const endpoint = fieldsOf(fieldsOf(cluster.spec)?.controlPlaneEndpoint);
  const host = textOf(endpoint?.host);
  const port = countOf(endpoint?.port);
  const section = {
    reference,
    machines,
    counters,
    versions,
    initialized: initialized.answer,
    initializedCondition: initialized.condition,
    endpoint: host === undefined || host === "" ? undefined : port === undefined ? host : `${host}:${port}`,
  };
  // A Cluster with a status says whether its control plane is initialized, Unknown while it reports none yet.
  const empty =
    reference === undefined &&
    (machines === undefined || (machines.state === "rows" && machines.rows.length === 0)) &&
    counters === undefined &&
    versions.length === 0 &&
    section.endpoint === undefined &&
    fieldsOf(cluster.status) === undefined;

  return empty ? undefined : section;
}

function workersSection(cluster: ClusterObject, parts: ClusterParts): WorkersSection | undefined {
  const lists = [
    rowsOf(parts.machineDeployments, replicasRow),
    rowsOf(parts.machinePools, replicasRow),
    rowsOf(parts.machineSets, replicasRow),
    rowsOf(parts.workerMachines, machineRow),
  ];
  const rows = lists.flatMap((list) => (list.state === "rows" ? list.rows : []));
  const counters = countersOf(cluster, "workers");
  const versions = versionsOf(cluster, "workers");
  const pending = lists.some((list) => list.state === "pending");
  const unread = lists.some((list) => list.state === "held" || list.state === "not-read");

  if (rows.length === 0 && counters === undefined && versions.length === 0 && !pending && !unread) return undefined;
  return { counters, versions, rows, pending, unread };
}

function infrastructureSection(
  cluster: ClusterObject,
  parts: ClusterParts,
  index: ContextIndex,
): InfrastructureSection | undefined {
  const reference = referenceView(
    index.objects.reads,
    cluster,
    "infrastructureRef",
    index.objects.infrastructures,
    parts.infrastructure,
  );
  const failureDomains = listOf(fieldsOf(cluster.status)?.failureDomains).flatMap((entry) => {
    const domain = fieldsOf(entry);
    const name = textOf(domain?.name);
    const controlPlane = domain?.controlPlane;

    return name === undefined
      ? []
      : [{ name, controlPlane: typeof controlPlane === "boolean" ? controlPlane : undefined }];
  });

  if (reference === undefined && failureDomains.length === 0 && fieldsOf(cluster.status) === undefined)
    return undefined;
  return { reference, provisioned: provisionedOf(cluster), failureDomains };
}

function topologyPartsOf(workers: unknown, field: "machineDeployments" | "machinePools"): TopologyPart[] {
  const kind = field === "machineDeployments" ? "MachineDeployment" : "MachinePool";

  return listOf(fieldsOf(workers)?.[field]).flatMap((entry) => {
    const part = fieldsOf(entry);
    const name = textOf(part?.name);

    return name === undefined
      ? []
      : [{ kind, name, className: textOf(part?.class) ?? "", replicas: countOf(part?.replicas) }];
  });
}

function topologySection(cluster: ClusterObject): TopologySection | undefined {
  const topology = fieldsOf(fieldsOf(cluster.spec)?.topology);
  const reference = classReferenceOf(cluster);

  if (topology === undefined || reference === undefined) return undefined;

  const annotations = fieldsOf(metadataOf(cluster)?.annotations);
  const hooks = parseListAnnotation(
    PENDING_HOOKS_ANNOTATION,
    annotations !== undefined && Object.hasOwn(annotations, PENDING_HOOKS_ANNOTATION)
      ? annotations[PENDING_HOOKS_ANNOTATION]
      : undefined,
  );
  const workers = topology.workers;

  const classNamespace = reference.elsewhere ? reference.namespace : undefined;

  return {
    className: reference.name,
    classNamespace,
    classNode: addressOf("cluster.x-k8s.io", "ClusterClass", reference.name, classNamespace),
    variableNames: variableNamesOf(cluster).variableNames,
    version: textOf(topology.version),
    controlPlaneReplicas: countOf(fieldsOf(topology.controlPlane)?.replicas),
    parts: [...topologyPartsOf(workers, "machineDeployments"), ...topologyPartsOf(workers, "machinePools")],
    hooks: hooks.state === "read" ? { state: "read", items: hooks.items } : undefined,
  };
}

function cidrBlocksOf(ranges: unknown): string[] {
  return listOf(fieldsOf(ranges)?.cidrBlocks).flatMap((block) => {
    const text = textOf(block);

    return text === undefined || text === "" ? [] : [text];
  });
}

function networkSection(cluster: ClusterObject): NetworkSection | undefined {
  const network = fieldsOf(fieldsOf(cluster.spec)?.clusterNetwork);

  if (network === undefined) return undefined;

  const section = {
    apiServerPort: countOf(network.apiServerPort),
    pods: cidrBlocksOf(network.pods),
    services: cidrBlocksOf(network.services),
    serviceDomain: textOf(network.serviceDomain) || undefined,
  };
  const empty =
    section.apiServerPort === undefined &&
    section.pods.length === 0 &&
    section.services.length === 0 &&
    section.serviceDomain === undefined;

  return empty ? undefined : section;
}

export function conditionViews(conditions: ConditionsResult): ConditionView[] | undefined {
  if (conditions.state !== "read" || conditions.conditions.length === 0) return undefined;
  return conditions.conditions.map((condition) => ({
    condition,
    since: parsedTimeOf(condition.lastTransitionTime),
    lines: messageLines(condition.parsedMessage),
  }));
}

// The reads that failed in the namespace of the Cluster, of the Clusters and of every kind that the view reads.
export function readFailuresOf(
  reads: ReadsState,
  kinds: readonly (KindDescriptor & { readonly key: string })[],
  namespace: string,
): ReadFailureView[] {
  return kinds.flatMap((descriptor) => {
    const holds = holdsOf(reads, descriptor.key, namespace);

    return holds.load === undefined && holds.refresh === undefined ? [] : [{ descriptor, ...holds }];
  });
}

// The details of a Cluster, from its parts and the reads of the view that shows it: the reads that failed in its
// namespace, and the names of the Clusters that it read there.
export function clusterDetailsOf(
  parts: ClusterParts,
  index: ContextIndex,
  failures: readonly ReadFailureView[],
  readClusters: readonly string[] = [],
): ClusterDetails {
  const { row } = parts;
  const { cluster } = row;

  return {
    cluster,
    readClusters,
    readObjects: readObjectsOf(index, cluster),
    pending: row.pending,
    status: statusSection(cluster, row.status, row.conditions, failures),
    controlPlane: controlPlaneSection(cluster, parts, index, row.conditions),
    workers: workersSection(cluster, parts),
    infrastructure: infrastructureSection(cluster, parts, index),
    topology: topologySection(cluster),
    network: networkSection(cluster),
    conditions: conditionViews(row.conditions),
  };
}
