/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The cells of a row of the tree of a Cluster (SPEC-0005, P9 to P12), as pure functions of its node, of the result of
// the model for its object and of the counts of what it holds. Seven columns, after the grammar of the list of
// SPEC-0004: Name, Replicas, Version, Activity, Condition, Status and Age. Every cell is one line, and no cell is
// empty: where a column does not apply it says N/A, with why in its tooltip; a node that cannot be read says "Not read"
// or "Not found" in its cells of state, never N/A, which says that a kind has no status (P12). Every mark of state
// comes from the model, and every word is one of the closed sets of SPEC-0003 or of the project, never reworded.
//
// The search of the tree matches the words that a row shows (P15): those of `nodeWords` of `tree-rows.ts`, with the
// words of the cells Version and Status of this module (`searchWordsOf`).

import { parseTime } from "../parsers/time";
import { activityCell, compareVersions, countersCell, headlineOf, healthCell, versionCell } from "./cluster-cells";
import { noteWords } from "./cluster-details";
import { kindWords, unreadWords } from "./cluster-tree";
import { countOf, fieldsOf, listOf, textOf } from "./objects";
import { countWords, nodeWords, VIRTUAL_NAMES } from "./tree-rows";
import { ROLE_WORDS } from "./words";

import type { MessageLine } from "../parsers/condition-message";
import type { ClusterObject, ConditionsResult, KubeObjectData, Note, WeightedCondition } from "../status/index";
import type { ActivityCell, HealthCell, Time } from "./cluster-cells";
import type {
  ClusterTree,
  EntryNode,
  KindNode,
  NodeStatus,
  ObjectNode,
  PlaceReason,
  ReferenceNode,
  TreeNode,
} from "./cluster-tree";
import type { Notice } from "./read-state";
import type { NodeCounts, TreeRow } from "./tree-rows";

// The columns of the tree, in their order (P9).
export const TREE_COLUMNS = ["name", "replicas", "version", "activity", "condition", "status", "age"] as const;

export type TreeColumn = (typeof TREE_COLUMNS)[number];

export const COLUMN_TITLES: Readonly<Record<TreeColumn, string>> = {
  name: "Name",
  replicas: "Replicas",
  version: "Version",
  activity: "Activity",
  condition: "Condition",
  status: "Status",
  age: "Age",
};

// A line of a tooltip, with its indentation, as the parser of SPEC-0003 nests the lines of a message (P27).
export interface TooltipLine {
  readonly text: string;
  readonly indentation: number;
}

// A cell of words: its text on its line, and its whole content in its tooltip.
export interface WordsCell {
  readonly text: string;
  readonly tooltip: readonly TooltipLine[];
}

// Why a column does not apply to a node, said in the tooltip of its N/A (DESIGN.md, "Words").
export const NOT_APPLICABLE = {
  replicas: "Its kind keeps no replicas.",
  version: "Its kind has no version.",
  status: "Its kind has no status.",
  deleting: "No health: it is deleting. The stage of its deletion is in its details.",
  virtual: "No object: this row holds the objects under it.",
  entry: "A record of the binding of this Cluster, and no object.",
  kind: "Its objects were not read.",
} as const;

function line(text: string): TooltipLine {
  return { text, indentation: 0 };
}

function words(text: string, ...tooltip: readonly string[]): WordsCell {
  return { text, tooltip: (tooltip.length === 0 ? [text] : tooltip).map(line) };
}

function notApplicable(why: string): WordsCell {
  return words("N/A", why);
}

// The name (P9)

export interface NameCell {
  // The depth of the node under the Cluster, at 0, one step of indentation for each level.
  readonly depth: number;
  // It has children: the button that expands or collapses it.
  readonly expandable: boolean;
  readonly expanded: boolean;
  // Its kind and its name, `namespace/name` for the class read in another namespace than its Cluster; the name of a
  // virtual node; the noun of the kind of a node of a kind.
  readonly text: string;
  // The role of an object of a provider, in the words of SPEC-0003.
  readonly role: string | undefined;
  // A node of an object, read or not, opens its details: its name is a button. A virtual node, the node of a kind and
  // an entry of a binding have none, and show their words as text.
  readonly opens: boolean;
  readonly tooltip: readonly TooltipLine[];
}

// The class of the Cluster read in another namespace than the Cluster, the one node whose address names a namespace.
function classElsewhere(node: ObjectNode | ReferenceNode): string | undefined {
  const parts = node.id.split("/");

  return node.kind === "ClusterClass" && parts.length === 4 ? parts[2] : undefined;
}

// The kind and the name of a node of an object, as its row shows them.
export function objectText(node: ObjectNode | ReferenceNode): string {
  const namespace = classElsewhere(node);

  return `${node.kind} ${namespace === undefined ? node.name : `${namespace}/${node.name}`}`;
}

// The words of a row, as its name says them.
export function nameText(node: TreeNode): string {
  switch (node.form) {
    case "object":
    case "reference":
      return objectText(node);
    case "virtual":
      return VIRTUAL_NAMES[node.role];
    case "kind":
      return node.noun;
    case "entry":
      return `${node.kind} ${node.name}`;
  }
}

// Why an object sits under Other objects, or under the row of an owner that cannot be read (P7), in words: it has no
// owner; its owner is of a kind not read, which it names, with the reason of that kind; its owners are not nodes of
// the tree, which it names; or the Cluster owns it and no object of the tree names it, with the kinds that can name it
// and could not be read.
export function placeReasonWords(reason: PlaceReason): string {
  switch (reason.code) {
    case "no-owner":
      return "It has no owner.";
    case "owner-not-read":
      return `Its owner ${reason.owner.kind} ${reason.owner.name} is of a kind not read. ${unreadWords(reason.unread)}`;
    case "owners-not-in-tree":
      return `Its owners are not nodes of the tree: ${reason.owners.map((owner) => `${owner.kind} ${owner.name}`).join(", ")}.`;
    case "owned-by-cluster":
      return reason.namers.length === 0
        ? "The Cluster owns it, and no object of the tree names it."
        : `The Cluster owns it, and no object of the tree names it; the ${reason.namers.join(", the ")}, which can name it, could not be read.`;
  }
}

function nameCell(row: TreeRow): NameCell {
  const { node } = row;
  const text = nameText(node);
  const role = node.form === "object" || node.form === "reference" ? node.role : undefined;
  const placement = node.form === "object" || node.form === "reference" ? node.placement : undefined;
  const namespace = node.form === "object" || node.form === "reference" ? classElsewhere(node) : undefined;
  const tooltip = [
    role === undefined ? text : `${text}, ${ROLE_WORDS[role]}`,
    ...(placement?.by === "reason" ? [placeReasonWords(placement.reason)] : []),
    ...(namespace === undefined
      ? []
      : [`In the namespace ${namespace}, which the class reference of the Cluster names.`]),
    ...(node.form === "kind" ? [kindWords(node)] : []),
  ];

  return {
    depth: row.depth,
    expandable: row.expandable,
    expanded: row.expanded,
    text,
    role: role === undefined ? undefined : ROLE_WORDS[role],
    opens: node.form === "object" || node.form === "reference",
    tooltip: tooltip.map(line),
  };
}

// The replicas (P9)

const COUNTERS = [
  ["desired", "spec.replicas"],
  ["current", "status.replicas"],
  ["ready", "status.readyReplicas"],
  ["available", "status.availableReplicas"],
  ["up to date", "status.upToDateReplicas"],
] as const;

// A counter of the replicas of an object, by its label; at the contract `v1beta1` of a control plane, the available
// ones carry the unavailable ones, of which they are the desired less.
export interface ReplicaCounter {
  readonly label: (typeof COUNTERS)[number][0];
  readonly count: number | undefined;
  readonly unavailable?: number;
}

function machines(count: number): string {
  return count === 1 ? "1 Machine" : `${count} Machines`;
}

function fieldAt(object: KubeObjectData, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => fieldsOf(value)?.[key], object);
}

// The counters of the replicas of a control plane, a MachineDeployment, a MachineSet or a MachinePool, by the fields of
// the project at `v1beta2`; for a control plane at the contract `v1beta1`, by the fields of that contract, which names
// the ready, the updated and the unavailable replicas and no available ones: the Cluster counts those as the desired
// less the unavailable ones, none below 0, and none while either is not written
// (core/reconcilers/cluster/cluster_controller_status.go:150-159; internal/contract/controlplane.go:212-261). A counter
// that is not written is undefined.
export function replicaCounters(object: KubeObjectData, contract?: string): ReplicaCounter[] {
  if (contract !== "v1beta1") {
    return COUNTERS.map(([label, path]) => ({ label, count: countOf(fieldAt(object, path)) }));
  }

  const desired = countOf(fieldAt(object, "spec.replicas"));
  const unavailable = countOf(fieldAt(object, "status.unavailableReplicas"));

  return [
    { label: "desired", count: desired },
    { label: "current", count: countOf(fieldAt(object, "status.replicas")) },
    { label: "ready", count: countOf(fieldAt(object, "status.readyReplicas")) },
    {
      label: "available",
      count: desired === undefined || unavailable === undefined ? undefined : Math.max(0, desired - unavailable),
      ...(desired === undefined || unavailable === undefined ? {} : { unavailable }),
    },
    { label: "up to date", count: countOf(fieldAt(object, "status.updatedReplicas")) },
  ];
}

// The available Machines of the desired, as `2/3`, with every counter in the tooltip; a counter that is not written is
// N/A.
function replicasOf(object: KubeObjectData, contract?: string): WordsCell {
  const counters = replicaCounters(object, contract);
  const available = counters[3].count;
  const desired = counters[0].count;

  return {
    text: available === undefined && desired === undefined ? "N/A" : `${available ?? "N/A"}/${desired ?? "N/A"}`,
    tooltip: counters.map(({ label, count, unavailable }) =>
      line(
        `${label[0].toUpperCase()}${label.slice(1)}: ${count === undefined ? "N/A, not written yet" : machines(count)}${
          unavailable === undefined ? "" : `, the desired less ${unavailable} unavailable`
        }`,
      ),
    ),
  };
}

// A Machine counts as one desired, available when its `Available` is `True`, as the project counts a stand-alone
// Machine (core/reconcilers/cluster/cluster_controller_status.go:221-300).
function machineReplicas(conditions: ConditionsResult | undefined): WordsCell {
  const available =
    conditions?.state === "read"
      ? conditions.conditions.find((condition) => condition.type === "Available")?.status === "True"
        ? 1
        : 0
      : undefined;

  return {
    text: `${available ?? "N/A"}/1`,
    tooltip: [
      line("Desired: 1 Machine"),
      line(`Available: ${available === undefined ? "N/A, not written yet" : machines(available)}, from its Available`),
    ],
  };
}

function isControlPlane(node: ObjectNode): boolean {
  return (
    (node.group === "controlplane.cluster.x-k8s.io" && node.kind === "KubeadmControlPlane") ||
    node.role === "control-plane"
  );
}

const CORE = "cluster.x-k8s.io";

function counters(cell: { readonly text: string; readonly tooltip: readonly string[] }): WordsCell {
  return { text: cell.text, tooltip: cell.tooltip.map(line) };
}

function replicasCell(
  tree: ClusterTree,
  node: TreeNode,
  conditions: ConditionsResult | undefined,
  poolsWithoutMachines: number,
): WordsCell {
  const cluster = tree.root.object as ClusterObject;

  switch (node.form) {
    case "object":
      // By the contract of a control plane of a provider (P9).
      if (isControlPlane(node)) return replicasOf(node.object, node.resolution?.contract);
      if (node.group === CORE && ["MachineDeployment", "MachineSet", "MachinePool"].includes(node.kind)) {
        return replicasOf(node.object);
      }
      if (node.group === CORE && node.kind === "Machine") return machineReplicas(conditions);
      return notApplicable(NOT_APPLICABLE.replicas);
    case "reference":
      return notApplicable(node.read.state === "pending" ? "Still being read." : unreadWords(node.read));
    case "virtual":
      // The counters of the workers that the Cluster keeps, as the list shows them, with the remark on a MachinePool
      // with no Machines, whose counters count the instances of its provider (SPEC-0004, P8).
      if (node.role === "workers") return counters(countersCell(cluster, "workers", poolsWithoutMachines));
      if (node.role === "control-plane") return counters(countersCell(cluster, "controlPlane"));
      return notApplicable(NOT_APPLICABLE.virtual);
    case "kind":
      return notApplicable(NOT_APPLICABLE.kind);
    case "entry":
      return notApplicable(NOT_APPLICABLE.entry);
  }
}

// The version (P9)

// The versions that the Cluster keeps of its control plane or of its workers, oldest first, each with its number of
// Machines.
function partVersions(cluster: ClusterObject, part: "controlPlane" | "workers"): WordsCell {
  const versions = listOf(fieldsOf(fieldsOf(cluster.status)?.[part])?.versions)
    .flatMap((entry) => {
      const version = textOf(fieldsOf(entry)?.version);

      return version === undefined ? [] : [{ version, replicas: countOf(fieldsOf(entry)?.replicas) }];
    })
    .sort((one, other) => compareVersions(one.version, other.version));

  if (versions.length === 0) return notApplicable("Not written yet.");
  return {
    text: versions.map((entry) => entry.version).join(", "),
    tooltip: versions.map((entry) =>
      line(entry.replicas === undefined ? entry.version : `${entry.version}: ${machines(entry.replicas)}`),
    ),
  };
}

function specVersion(object: KubeObjectData, path: string): WordsCell {
  const version = textOf(fieldAt(object, path));

  return version === undefined || version === "" ? notApplicable(`Not set: ${path} holds no version.`) : words(version);
}

function versionCellOf(tree: ClusterTree, node: TreeNode): WordsCell {
  const cluster = tree.root.object as ClusterObject;

  switch (node.form) {
    case "object": {
      if (node === tree.root) {
        const cell = versionCell(cluster);

        return { text: cell.text, tooltip: cell.tooltip.map(line) };
      }
      if (isControlPlane(node)) return specVersion(node.object, "spec.version");
      if (node.group === CORE && ["MachineDeployment", "MachineSet", "MachinePool"].includes(node.kind)) {
        return specVersion(node.object, "spec.template.spec.version");
      }
      if (node.group === CORE && node.kind === "Machine") return specVersion(node.object, "spec.version");
      return notApplicable(NOT_APPLICABLE.version);
    }
    case "reference":
      return notApplicable(node.read.state === "pending" ? "Still being read." : unreadWords(node.read));
    case "virtual":
      if (node.role === "workers") return partVersions(cluster, "workers");
      if (node.role === "control-plane") return partVersions(cluster, "controlPlane");
      return notApplicable(NOT_APPLICABLE.virtual);
    case "kind":
      return notApplicable(NOT_APPLICABLE.kind);
    case "entry":
      return notApplicable(NOT_APPLICABLE.entry);
  }
}

// The cells of state (P9, P11, P12)

// The cell Activity: the spinner while the inputs of the model of its object load; the marks of the model; or words,
// N/A where the column does not apply and "Not read" or "Not found" for a node that cannot be read, as text with no
// tone.
export type ActivityView =
  | { readonly form: "pending" }
  | { readonly form: "marks"; readonly cell: ActivityCell }
  | { readonly form: "words"; readonly words: WordsCell };

// What a node that cannot be read says in its cells of state (P12): "Not read", or "Not found" for an object that its
// namespace, which was read, does not hold; and, in their tooltip, "Not read." and the reason whole, with the message
// of each answer.
function unreadCell(read: ReferenceNode["read"] | KindNode["unread"], reason: string): WordsCell {
  if (read.state === "pending") return words("Not read", reason);

  const messages = read.failures.map((failure) => failure.message);

  return words(read.state === "not-found" ? "Not found" : "Not read", reason, ...messages);
}

function activityView(node: TreeNode, status: NodeStatus | undefined): ActivityView {
  switch (node.form) {
    case "object": {
      if (status === undefined || status.pending) return { form: "pending" };

      const cell = activityCell(status.status);

      return cell.marks.length === 0
        ? { form: "words", words: notApplicable(NOT_APPLICABLE.status) }
        : { form: "marks", cell };
    }
    case "reference":
      return node.read.state === "pending"
        ? { form: "pending" }
        : { form: "words", words: unreadCell(node.read, unreadWords(node.read)) };
    case "virtual":
      return { form: "words", words: notApplicable(NOT_APPLICABLE.virtual) };
    case "kind":
      return { form: "words", words: unreadCell(node.unread, kindWords(node)) };
    case "entry":
      if (node.state === "pending") return { form: "pending" };
      return node.unread === undefined
        ? { form: "words", words: notApplicable(NOT_APPLICABLE.entry) }
        : { form: "words", words: unreadCell(node.unread, unreadWords(node.unread)) };
  }
}

// The counts of the objects under a node, after its own marks (P11): their words, or the spinner while one of them
// still loads, and the whole of them in the tooltip, which names the node that holds them.
export type CountsView =
  | { readonly form: "pending" }
  | { readonly form: "counts"; readonly text: string; readonly tooltip: string };

// The cell Condition: its own marks, the word of its health in its tone and the word "stale", and for the Cluster how
// many of its MachinePools are of unknown health; or the spinner while its inputs load; or words, N/A, "Not read" or
// "Not found"; then the counts of P11, alone for a virtual node.
export interface ConditionView {
  readonly own:
    | { readonly form: "pending" }
    | { readonly form: "health"; readonly cell: HealthCell }
    | { readonly form: "words"; readonly words: WordsCell }
    | undefined;
  readonly counts: CountsView | undefined;
}

function countsView(node: TreeNode, counts: NodeCounts | undefined): CountsView | undefined {
  if (counts === undefined) return undefined;
  if (counts.pending) return { form: "pending" };

  const text = countWords(counts);

  return { form: "counts", text, tooltip: `Under ${nameText(node)}: ${text}` };
}

function conditionView(node: TreeNode, status: NodeStatus | undefined, counts: NodeCounts | undefined): ConditionView {
  const all = countsView(node, counts);

  switch (node.form) {
    case "object": {
      if (status === undefined || status.pending) return { own: { form: "pending" }, counts: all };

      const cell = healthCell(status.status);

      if (cell.mark !== undefined) return { own: { form: "health", cell }, counts: all };
      return {
        own: {
          form: "words",
          words: notApplicable(cell.none === "deleting" ? NOT_APPLICABLE.deleting : NOT_APPLICABLE.status),
        },
        counts: all,
      };
    }
    case "reference":
      return node.read.state === "pending"
        ? { own: { form: "pending" }, counts: all }
        : { own: { form: "words", words: unreadCell(node.read, unreadWords(node.read)) }, counts: all };
    case "virtual":
      return { own: undefined, counts: all };
    case "kind":
      return { own: { form: "words", words: unreadCell(node.unread, kindWords(node)) }, counts: all };
    case "entry":
      if (node.state === "pending") return { own: { form: "pending" }, counts: undefined };
      return node.unread === undefined
        ? { own: { form: "words", words: notApplicable(NOT_APPLICABLE.entry) }, counts: undefined }
        : { own: { form: "words", words: unreadCell(node.unread, unreadWords(node.unread)) }, counts: undefined };
  }
}

// The status (P10)

// The cell Status: the spinner while the inputs of the model of its object load, or its words, the whole of them in
// the tooltip; an entry applied says when, through the date component of the host.
export type StatusView =
  | { readonly form: "pending" }
  | { readonly form: "words"; readonly words: WordsCell; readonly since?: Time };

function messageTooltip(condition: WeightedCondition): TooltipLine[] {
  const lines: TooltipLine[] = [];
  const flatten = (nested: readonly MessageLine[]) => {
    for (const each of nested) {
      lines.push({ text: each.written.slice(each.indentation), indentation: each.indentation });
      flatten(each.children);
    }
  };

  if (condition.parsedMessage.state === "read") flatten(condition.parsedMessage.lines);
  else if (condition.message !== undefined && condition.message !== "") lines.push(line(condition.message));
  return [line(`${condition.type}: ${condition.status ?? "N/A"}, ${condition.reason ?? "N/A"}`), ...lines];
}

// The headline of the message of a condition, else its reason (DESIGN.md, "The status model in lists and details").
function headlineText(condition: WeightedCondition): string | undefined {
  const headline = condition.parsedMessage.state === "read" ? headlineOf(condition.parsedMessage) : condition.message;

  if (headline !== undefined && headline !== "") return headline;
  return condition.reason === undefined || condition.reason === "" ? undefined : condition.reason;
}

function conditionWords(type: string, condition: WeightedCondition | undefined): WordsCell {
  if (condition === undefined) return notApplicable(`It reports no ${type} yet.`);

  const text = headlineText(condition);

  return { text: text ?? "N/A", tooltip: messageTooltip(condition) };
}

function conditionOf(conditions: ConditionsResult | undefined, type: string): WeightedCondition | undefined {
  return conditions?.state === "read" ? conditions.conditions.find((condition) => condition.type === type) : undefined;
}

function noteLines(notes: readonly Note[]): string[] {
  return notes.map(noteWords).filter((each): each is string => each !== undefined);
}

function objectStatus(node: ObjectNode, status: NodeStatus, conditions: ConditionsResult | undefined): WordsCell {
  const { health, notes, remediation } = status.status;

  if (health.health === "none") {
    return notApplicable(health.because === "deleting" ? NOT_APPLICABLE.deleting : NOT_APPLICABLE.status);
  }

  const basis = health.restsOn;

  switch (basis.form) {
    case "condition":
      return conditionWords(basis.type, basis.condition);
    case "replicas": {
      const machineless = notes.find((note) => note.code === "no-machine");

      // A MachinePool without Machines and with replicas: the note of the model, and its deprecated `Ready` (P10).
      if (machineless?.code === "no-machine") {
        const ready = machineless.deprecatedReady;
        const text = noteWords(machineless) ?? "";

        return words(
          text,
          text,
          ready === undefined
            ? "Ready (deprecated): not written"
            : `Ready (deprecated): ${ready.status ?? "N/A"}, ${ready.reason ?? "N/A"}`,
        );
      }

      const text = `${basis.available ?? "N/A"} of ${basis.replicas ?? "N/A"} Machines available`;
      const ready = node.kind === "MachineSet" ? conditionOf(conditions, "MachinesReady") : undefined;

      return { text, tooltip: [line(text), ...(ready === undefined ? [] : messageTooltip(ready))] };
    }
    case "targets": {
      const text = `${basis.currentHealthy ?? "N/A"} of ${basis.expectedMachines ?? "N/A"} targets healthy`;
      const allowed = remediation?.allowed === true ? "Yes" : remediation?.allowed === false ? "No" : "Unknown";

      return {
        text,
        tooltip: [
          line(text),
          line(`Remediation allowed: ${allowed}`),
          ...(remediation?.condition === undefined ? [] : messageTooltip(remediation.condition)),
        ],
      };
    }
    case "address":
      return basis.address === undefined || basis.address === ""
        ? notApplicable("No address is written yet.")
        : words(basis.address, `IPAddress ${basis.address}`);
    case "bindings":
      return conditionWords("ResourcesApplied", basis.condition);
    case "none": {
      const lines = noteLines(notes);

      return lines.length === 0 ? notApplicable("The status model does not know this object.") : words("N/A", ...lines);
    }
  }
}

function statusView(
  node: TreeNode,
  status: NodeStatus | undefined,
  conditions: ConditionsResult | undefined,
): StatusView {
  switch (node.form) {
    case "object":
      return status === undefined || status.pending
        ? { form: "pending" }
        : { form: "words", words: objectStatus(node, status, conditions) };
    case "reference":
      return node.read.state === "pending"
        ? { form: "pending" }
        : { form: "words", words: statusOfUnread(node.read, unreadWords(node.read)) };
    case "virtual":
      return { form: "words", words: notApplicable(NOT_APPLICABLE.virtual) };
    case "kind":
      return { form: "words", words: statusOfUnread(node.unread, kindWords(node)) };
    case "entry":
      return entryStatus(node);
  }
}

// The reason of a node that cannot be read, in its cell Status, and in its tooltip the reason whole with the message of
// each answer (P12).
function statusOfUnread(
  read: Exclude<ReferenceNode["read"], { readonly state: "pending" }>,
  reason: string,
): WordsCell {
  return words(reason, reason, ...read.failures.map((failure) => failure.message));
}

// An entry of a binding (P10): applied, with the instant of `lastAppliedTime`, not applied, or in no binding of this
// Cluster, as the binding records it; when the bindings cannot be read, "Not read." and their reason, never in no
// binding, which would show a refusal as an absence (P12).
function entryStatus(node: EntryNode): StatusView {
  switch (node.state) {
    case "pending":
      return { form: "pending" };
    case "applied": {
      const parsed = parseTime(node.lastAppliedTime);
      const since: Time | undefined =
        parsed.state === "accepted"
          ? { state: "written", text: parsed.text }
          : parsed.state === "unavailable"
            ? { state: "unavailable" }
            : undefined;

      return {
        form: "words",
        words: words("Applied", "Applied to this Cluster, as its binding records it"),
        ...(since === undefined ? {} : { since }),
      };
    }
    case "not applied":
      return { form: "words", words: words("Not applied", "Not applied to this Cluster, as its binding records it") };
    case "missing":
      return {
        form: "words",
        words: words("In no binding of this Cluster", "The binding of this Cluster records no such resource"),
      };
    case "not-read":
      // The entry of a ClusterResourceSet whose bindings cannot be read, which always says why.
      return node.unread === undefined
        ? { form: "words", words: words("Not read") }
        : { form: "words", words: statusOfUnread(node.unread, unreadWords(node.unread)) };
  }
}

// The cells of a row

export interface TreeCells {
  readonly name: NameCell;
  readonly replicas: WordsCell;
  readonly version: WordsCell;
  readonly activity: ActivityView;
  readonly condition: ConditionView;
  readonly status: StatusView;
  // The object whose age the age component of the host shows; undefined for a row with no object read, N/A.
  readonly age: KubeObjectData | undefined;
  readonly ageNotApplicable: WordsCell | undefined;
}

export interface CellInputs {
  readonly status: NodeStatus | undefined;
  readonly counts: NodeCounts | undefined;
  // The conditions of its object, as the model weighs them, for the tooltip of a cell.
  readonly conditions?: ConditionsResult;
  // The notice of the kind of the node of a kind that cannot be read (P19), whose words its cell Status holds.
  readonly notice?: Notice;
  // How many MachinePools of the Cluster have no Machines, which the cell Replicas of Workers says, from the result of
  // the Cluster (`poolsWithoutMachinesOf` of `context.ts`).
  readonly poolsWithoutMachines?: number;
}

function ageOf(node: TreeNode): WordsCell | undefined {
  switch (node.form) {
    case "object":
      return undefined;
    case "reference":
      return notApplicable(node.read.state === "pending" ? "Still being read." : unreadWords(node.read));
    case "virtual":
      return notApplicable(NOT_APPLICABLE.virtual);
    case "kind":
      return notApplicable(NOT_APPLICABLE.kind);
    case "entry":
      return notApplicable(NOT_APPLICABLE.entry);
  }
}

export function treeCellsOf(tree: ClusterTree, row: TreeRow, inputs: CellInputs): TreeCells {
  const { node } = row;
  const status = statusView(node, inputs.status, inputs.conditions);

  return {
    name: nameCell(row),
    replicas: replicasCell(tree, node, inputs.conditions, inputs.poolsWithoutMachines ?? 0),
    version: versionCellOf(tree, node),
    activity: activityView(node, inputs.status),
    condition: conditionView(node, inputs.status, inputs.counts),
    status:
      node.form === "kind" && inputs.notice !== undefined && status.form === "words"
        ? {
            ...status,
            words: {
              text: status.words.text,
              tooltip: [...status.words.tooltip, ...noticeLines(inputs.notice)],
            },
          }
        : status,
    age: node.form === "object" ? node.object : undefined,
    ageNotApplicable: ageOf(node),
  };
}

function noticeLines(notice: Notice): TooltipLine[] {
  return [notice.title, ...notice.messages, ...notice.lines].map(line);
}

// The search (P15)

// The words of a row that the search matches: those of its name and of its marks of state (`nodeWords`), and those
// of its cells Version and Status, the headline, else the reason, or the words of P10 and P12, never N/A.
export function searchWordsOf(tree: ClusterTree, node: TreeNode, status: NodeStatus | undefined): string[] {
  const version = versionCellOf(tree, node);
  const cell = statusView(node, status, undefined);

  return [
    ...nodeWords(tree, node, status),
    ...(version.text === "N/A" ? [] : version.text.split(", ")),
    ...(cell.form === "words" && cell.words.text !== "N/A" ? [cell.words.text] : []),
  ];
}
