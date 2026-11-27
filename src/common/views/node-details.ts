/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The details of a node of the tree of a Cluster other than its root (SPEC-0005, P17, P20), as pure functions of the
// tree and of the result of the model for its object. The details of the root are those of a Cluster (SPEC-0004),
// which the page gives the reads of the tree. Each section is left out when it has nothing to show:
//
// 1. Metadata: those of the host, with the namespace as the namespace badge and the owners as links to their nodes,
//    when the tree holds them, else as text; for a KubeadmConfig, a KubeadmConfigTemplate, a KubeadmControlPlane, the
//    ClusterClass and every object of a provider, the annotations in a row of their own, every one but the one that
//    `kubectl apply` writes, whose presence alone they say (`annotations.ts`).
// 2. Place: its role among the objects of the Cluster, the object above it and the field by which the tree found it,
//    a link to that node; for one under Other objects, or under the row of an owner that cannot be read, why.
// 3. Status: from `statusOf` of the node, as the details of a Cluster show theirs: the health, what it rests on (P10)
//    and the source of its tone; the activities; the marks of freshness; the condition that sums it up, its message
//    nested; the issues; the notes of the model; the phase; the deprecated failure fields. For a node that cannot be
//    read, why, with the message of each answer (P12).
// 4. Its facts, those of its kind.
// 5. Conditions: each with its weight, its type, its status and its reason as written, the instant of its last
//    transition, a mark of an older generation, and its message, nested.
//
// The pool of an IPAddressClaim and the remediation template of a MachineHealthCheck are text: the tree reads neither,
// nor the definitions of their kinds (P8, P17). The names of the variables of a ClusterClass and of its patches come
// from `variableNamesOf`, never their values (P20).

import { annotationsOf } from "./annotations";
import { activityCell, healthCell } from "./cluster-cells";
import {
  conditionViews,
  messageLines,
  noteWords,
  parsedTimeOf,
  subjectKindsOf,
  toneSourceOf,
  UNREAD_WORDS,
} from "./cluster-details";
import { pausedByAnnotation, unreadWords } from "./cluster-tree";
import { countOf, fieldsOf, listOf, metadataOf, namespaceOf, ownersOf, textOf } from "./objects";
import { contractReferenceOf, isClusterApiKind, objectReferenceOf } from "./references";
import { addressOf } from "./tree-address";
import { nameText, objectText, placeReasonWords, replicaCounters, treeCellsOf } from "./tree-cells";
import { VIRTUAL_NAMES } from "./tree-rows";
import { variableNamesOf } from "./variable-names";
import { ROLE_WORDS } from "./words";

import type { ClusterObject, ConditionsResult, Issue, KubeObjectData, ObjectStatus } from "../status/index";
import type { ShownAnnotations } from "./annotations";
import type { ActivityCell, HealthCell, Mark, Time } from "./cluster-cells";
import type { Answer, ConditionView, Counter, MessageLineView, ToneSource } from "./cluster-details";
import type { ClusterTree, NodeStatus, ObjectNode, Placement, ReferenceNode, TreeNode } from "./cluster-tree";
import type { WordsCell } from "./tree-cells";
import type { TreeRow } from "./tree-rows";

const CORE = "cluster.x-k8s.io";

// A link to a node of the tree, by its identity, with the words that it shows.
export interface NodeLink {
  readonly node: string;
  readonly text: string;
}

// An owner of an object: a link to its node when the tree holds it, an owner of Cluster API included; else text, its
// kind and its name, since the details of the host would hold the menu of the host for one of Cluster API (SPEC-0001,
// A7), and the tree has no version for the link of one of a provider whose kind it does not read (P5).
export interface OwnerView {
  readonly kind: string;
  readonly name: string;
  readonly node: string | undefined;
}

export interface MetadataView {
  // The namespace of the object, which the details show as the namespace badge of the host (SPEC-0004, P32).
  readonly namespace: string | undefined;
  readonly owners: readonly OwnerView[];
  // The annotations of the kinds of P20, which the details show in a row of their own, the metadata of the host
  // leaving them out; undefined for every other kind, whose annotations the host shows.
  readonly annotations: ShownAnnotations | undefined;
}

// The place of a node (P7, P17): its role, the object above it and how the tree found it, or why no rule placed it.
export interface PlaceView {
  // The role of an object of a provider, in the words of SPEC-0003; the kind of an object of Cluster API.
  readonly role: string;
  // The nearest object above it, the virtual nodes between them left out; a link to its node.
  readonly of: NodeLink | undefined;
  // The virtual node right above it, when there is one, as Workers or Other objects.
  readonly under: string | undefined;
  // How the tree found it, in words.
  readonly by: string | undefined;
  // Why it sits under Other objects, or under the row of an owner that cannot be read.
  readonly reason: string | undefined;
}

// The form of a pause of an object (SPEC-0003, P19): by its own annotation, which the tree tells by its presence; by
// `spec.paused` of its Cluster, which reaches every object of it whose controller honours it; or both.
export type NodePause = "own" | "cluster" | "both";

export interface NodeActivity {
  readonly mark: Mark;
  readonly name: string;
  readonly since: Time | undefined;
  // The stage of a deletion, the reason and the message of its condition (R2.25, R2.49, R2.81).
  readonly stage: { readonly reason: string | undefined; readonly lines: readonly MessageLineView[] } | undefined;
  readonly pause: NodePause | undefined;
  // The object that makes it hold, when it is another.
  readonly source: { readonly kind: string | undefined; readonly name: string | undefined } | undefined;
}

export interface NodeStatusSection {
  // An input of its model still loads: the marks show the spinner, never a mark computed without it.
  readonly pending: boolean;
  readonly health: HealthCell;
  // What the health rests on, in the words of its cell Status (P10).
  readonly restsOn: WordsCell;
  readonly toneSource: ToneSource | undefined;
  readonly activities: readonly NodeActivity[];
  // Idle or Unknown, when no activity holds or a source cannot be read.
  readonly otherActivities: readonly Mark[];
  // The condition that sums it up, when its health rests on one that is written.
  readonly summary:
    | {
        readonly type: string;
        readonly status: string | undefined;
        readonly reason: string | undefined;
        readonly since: Time | undefined;
        readonly lines: readonly MessageLineView[];
      }
    | undefined;
  readonly issues: readonly Issue[];
  readonly notes: readonly string[];
  // The phase as the project writes it, with the remark that the project tells no software to decide on it, where
  // the type of the phase says so (P17).
  readonly phase:
    | { readonly written: string; readonly deprecated: boolean; readonly remark: string | undefined }
    | undefined;
  readonly failure: { readonly reason: string | undefined; readonly message: string | undefined } | undefined;
}

// A fact of the kind of a node (P17).
export type Fact =
  | { readonly name: string; readonly form: "text"; readonly text: string; readonly tooltip?: string }
  // Nodes of the tree, as links, each with the field that names it, when one does; and the objects that the fact names
  // and that the tree does not hold, as text, each with why.
  | {
      readonly name: string;
      readonly form: "links";
      readonly links: readonly (NodeLink & { readonly field?: string })[];
      readonly texts?: readonly { readonly text: string; readonly why: string }[];
    }
  // A field that the project writes only as true, in the three words of SPEC-0004, P27.
  | { readonly name: string; readonly form: "answer"; readonly answer: Answer; readonly field: string }
  // The link to the details of the host of an object of a provider, at the version of its contract (SPEC-0001, A6).
  | { readonly name: string; readonly form: "host"; readonly text: string; readonly selfLink: string }
  | { readonly name: string; readonly form: "counters"; readonly counters: readonly Counter[] }
  // Words, each on its line.
  | { readonly name: string; readonly form: "list"; readonly items: readonly string[] };

export interface NodeDetails {
  readonly node: ObjectNode | ReferenceNode;
  // The title of the drawer of the host, `<Kind>: <name>`.
  readonly title: string;
  readonly metadata: MetadataView | undefined;
  readonly place: PlaceView;
  readonly status: NodeStatusSection | undefined;
  // What a node that cannot be read says (P12), or undefined while its kind still loads.
  readonly unread: { readonly words: string; readonly messages: readonly string[] } | undefined;
  readonly loading: boolean;
  readonly facts: readonly Fact[];
  readonly conditions: readonly ConditionView[] | undefined;
}

// Metadata (P5, P20)

// The kinds whose details leave the annotations out of the metadata of the host (P20): their specs hold, or may hold,
// what SPEC-0001, A3 never shows, and the annotation that `kubectl apply` writes copies the spec.
function hidesAnnotations(node: ObjectNode): boolean {
  if (!isClusterApiKind(node.group, node.kind)) return true;
  return (
    (node.group === "bootstrap.cluster.x-k8s.io" &&
      (node.kind === "KubeadmConfig" || node.kind === "KubeadmConfigTemplate")) ||
    (node.group === "controlplane.cluster.x-k8s.io" && node.kind === "KubeadmControlPlane") ||
    (node.group === CORE && (node.kind === "ClusterClass" || node.kind === "Cluster"))
  );
}

function metadataView(tree: ClusterTree, node: ObjectNode): MetadataView {
  return {
    namespace: namespaceOf(node.object),
    owners: ownersOf(node.object).map((owner) => {
      const id = addressOf(owner.group, owner.kind, owner.name);

      return { kind: owner.kind, name: owner.name, node: tree.nodes.has(id) ? id : undefined };
    }),
    annotations: hidesAnnotations(node) ? annotationsOf(node.object) : undefined,
  };
}

// Place (P7, P17)

// The nearest node above a node that is an object, the virtual nodes between them left out, and the virtual node
// right above it.
function aboveOf(tree: ClusterTree, id: string): { of: TreeNode | undefined; under: TreeNode | undefined } {
  const parent = tree.parents.get(id);
  const under = parent === undefined ? undefined : tree.nodes.get(parent);
  let of = under;

  while (of !== undefined && of.form !== "object" && of.form !== "reference") {
    const above = tree.parents.get(of.id);

    of = above === undefined ? undefined : tree.nodes.get(above);
  }
  return { of, under: under?.form === "virtual" || under?.form === "kind" ? under : undefined };
}

function placementWords(tree: ClusterTree, placement: Placement): string | undefined {
  switch (placement.by) {
    case "root":
      return undefined;
    case "reference":
      return placement.field;
    case "label":
      return `the label ${placement.label}`;
    case "controller":
      return "its controller";
    case "cluster-owner":
      return "its owner reference to the Cluster";
    case "cluster-name":
      return "spec.clusterName";
    case "selector":
      return "its selector, which selects the Cluster";
    case "binding":
      return "the binding of the Cluster, which names it";
    case "claim":
      return placement.field;
    case "owner": {
      const owner = tree.nodes.get(placement.owner);

      return owner === undefined ? "its owner" : `its owner, ${nameText(owner)}`;
    }
    case "reason":
      return undefined;
    case "kind":
      return "the owner references of the objects that it owns, as the row of an owner of a kind that cannot be read";
  }
}

function linkOf(node: TreeNode | undefined): NodeLink | undefined {
  return node === undefined || (node.form !== "object" && node.form !== "reference")
    ? undefined
    : { node: node.id, text: nameText(node) };
}

function placeView(tree: ClusterTree, node: ObjectNode | ReferenceNode): PlaceView {
  const { of, under } = aboveOf(tree, node.id);

  return {
    role: node.role === undefined ? node.kind : ROLE_WORDS[node.role],
    of: linkOf(of),
    under: under === undefined ? undefined : under.form === "virtual" ? VIRTUAL_NAMES[under.role] : nameText(under),
    by: placementWords(tree, node.placement),
    reason: node.placement.by === "reason" ? placeReasonWords(node.placement.reason) : undefined,
  };
}

// Status (P17)

function pauseOf(node: ObjectNode, cluster: ClusterObject): NodePause {
  const own = pausedByAnnotation(node.object);
  const clusterPaused = fieldsOf(cluster.spec)?.paused === true;

  if (own && clusterPaused) return "both";
  return own ? "own" : "cluster";
}

function activitiesOf(
  node: ObjectNode,
  status: ObjectStatus,
  cell: ActivityCell,
  cluster: ClusterObject,
): NodeActivity[] {
  const { activities } = status;

  if (activities.state !== "read") return [];

  const own = { kind: node.kind, name: node.name };

  return activities.activities.map((activity, index) => {
    const condition = activity.condition;

    return {
      mark: cell.marks[index],
      name: activity.name,
      since: parsedTimeOf(activity.since),
      stage:
        activity.name === "Deleting" && condition !== undefined
          ? { reason: condition.reason, lines: messageLines(condition.parsedMessage) }
          : undefined,
      pause: activity.name === "Paused" ? pauseOf(node, cluster) : undefined,
      source:
        activity.source === undefined || (activity.source.kind === own.kind && activity.source.name === own.name)
          ? undefined
          : { kind: activity.source.kind, name: activity.source.name },
    };
  });
}

// The kinds whose phase the project tells no software to decide on (P17; api/core/v1beta2/machine_phase_types.go:24-28;
// api/core/v1beta2/machinepool_types.go:248-252); a MachineDeployment has a phase with no such remark.
const PHASE_REMARKS: Readonly<Record<string, string>> = {
  Machine: "The project tells no software to decide on the phase of a Machine.",
  MachinePool: "The project tells no software to decide on the phase of a MachinePool.",
};

function statusSection(tree: ClusterTree, node: ObjectNode, status: NodeStatus, restsOn: WordsCell): NodeStatusSection {
  const result = status.status;
  const cell = activityCell(result);
  const activities = activitiesOf(node, result, cell, tree.root.object as ClusterObject);
  const { health } = result;
  const basis = health.health === "none" ? undefined : health.restsOn;
  const summary = basis?.form === "condition" || basis?.form === "bindings" ? basis.condition : undefined;
  const failure = result.notes.find((note) => note.code === "deprecated-failure");

  return {
    pending: status.pending,
    health: healthCell(result),
    restsOn,
    toneSource: toneSourceOf(result),
    activities,
    otherActivities: cell.marks.slice(activities.length),
    summary:
      summary === undefined
        ? undefined
        : {
            type: summary.type,
            status: summary.status,
            reason: summary.reason,
            since: parsedTimeOf(summary.lastTransitionTime),
            lines: messageLines(summary.parsedMessage),
          },
    issues: health.health === "none" ? [] : health.issues,
    notes: result.notes.map(noteWords).filter((words): words is string => words !== undefined),
    phase:
      result.phase?.written === undefined ||
      !(node.group === CORE && ["Machine", "MachinePool", "MachineDeployment"].includes(node.kind))
        ? undefined
        : { written: result.phase.written, deprecated: result.phase.deprecated, remark: PHASE_REMARKS[node.kind] },
    failure: failure?.code === "deprecated-failure" ? { reason: failure.reason, message: failure.message } : undefined,
  };
}

// Facts (P17)

function fieldAt(object: KubeObjectData, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => fieldsOf(value)?.[key], object);
}

// The counters, as the cell Replicas counts them, by the contract of a control plane of a provider (P9).
function countersOf(node: ObjectNode): Counter[] {
  return replicaCounters(node.object, node.resolution?.contract).map(({ label, count }) => ({
    label: `${label} Machines`,
    count,
  }));
}

// The nodes of the tree that a node names in its references, by the field of each, and those that name it.
function namedLinks(tree: ClusterTree, node: TreeNode, fields?: readonly string[]): (NodeLink & { field: string })[] {
  const links: (NodeLink & { field: string })[] = [];

  for (const each of tree.nodes.values()) {
    if (each.form !== "object" && each.form !== "reference") continue;
    for (const named of each.namedBy) {
      if (named.id === node.id && (fields === undefined || fields.includes(named.field))) {
        links.push({ node: each.id, text: nameText(each), field: named.field });
      }
    }
  }
  return links;
}

function namersOf(tree: ClusterTree, node: ObjectNode | ReferenceNode): (NodeLink & { field: string })[] {
  return node.namedBy.flatMap((named) => {
    const namer = tree.nodes.get(named.id);

    return namer === undefined ? [] : [{ node: namer.id, text: nameText(namer), field: named.field }];
  });
}

function text(name: string, value: string | undefined): Fact[] {
  return value === undefined || value === "" ? [] : [{ name, form: "text", text: value }];
}

// The field of the contract of an object of a provider that says that it is ready, as SPEC-0003, P17 reads it, in the
// three words of SPEC-0004, P27: Yes once true; No while it is unset on an object that has a status, since the
// provider writes it only as true; Unknown while the object has no status, or for a value of the wrong type.
function readyFact(node: ObjectNode): Fact[] {
  const role = node.role;
  const v1beta1 = node.resolution?.contract === "v1beta1";
  let paths: readonly string[];

  switch (role) {
    case undefined:
    case "template":
      return [];
    case "control-plane":
      paths = [v1beta1 ? "status.initialized" : "status.initialization.controlPlaneInitialized"];
      break;
    case "bootstrap-config":
      paths = [v1beta1 ? "status.ready" : "status.initialization.dataSecretCreated"];
      break;
    case "infrastructure-machine-pool":
      paths = ["status.initialization.provisioned", "status.ready"];
      break;
    default:
      paths = [v1beta1 ? "status.ready" : "status.initialization.provisioned"];
  }

  const values = paths.map((path) => fieldAt(node.object, path));
  const answer: Answer =
    fieldsOf(node.object.status) === undefined ||
    values.some((value) => value !== undefined && typeof value !== "boolean")
      ? { answer: "Unknown", reason: undefined, written: false }
      : values.some((value) => value === true)
        ? { answer: "Yes", since: undefined }
        : { answer: "No", reason: undefined };

  return [{ name: "Ready by its contract", form: "answer", answer, field: paths.join(" or ") }];
}

function selfLinkOf(object: KubeObjectData): string | undefined {
  const link = textOf(metadataOf(object)?.selfLink);

  return link === undefined || link === "" ? undefined : link;
}

// The selector of a ClusterResourceSet as text: its labels and its expressions as written (P17).
function selectorWords(selector: unknown): string[] {
  const fields = fieldsOf(selector);
  const labels = Object.entries(fieldsOf(fields?.matchLabels) ?? {}).map(
    ([key, value]) => `${key}=${textOf(value) ?? ""}`,
  );
  const expressions = listOf(fields?.matchExpressions).map((entry) => {
    const expression = fieldsOf(entry);
    const values = listOf(expression?.values).map((value) => textOf(value) ?? "");

    return `${textOf(expression?.key) ?? ""} ${textOf(expression?.operator) ?? ""}${values.length === 0 ? "" : ` (${values.join(", ")})`}`;
  });

  return [...labels, ...expressions];
}

function factsOf(tree: ClusterTree, node: ObjectNode, status: ObjectStatus | undefined): Fact[] {
  const { object } = node;
  const spec = fieldsOf(object.spec);
  const facts: Fact[] = [];
  const isCore = node.group === CORE;
  const controlPlane =
    (node.group === "controlplane.cluster.x-k8s.io" && node.kind === "KubeadmControlPlane") ||
    node.role === "control-plane";

  if (controlPlane || (isCore && ["MachineDeployment", "MachineSet", "MachinePool"].includes(node.kind))) {
    facts.push({ name: "Machines", form: "counters", counters: countersOf(node) });
    facts.push(
      ...text("Version", textOf(fieldAt(object, controlPlane ? "spec.version" : "spec.template.spec.version"))),
      ...(controlPlane ? text("Version of its Machines", textOf(fieldAt(object, "status.version"))) : []),
    );

    const templates = namedLinks(tree, node).filter((link) => isTemplate(tree, link.node));

    if (templates.length > 0) facts.push({ name: "Templates", form: "links", links: templates });
  }
  if (isCore && node.kind === "Machine") {
    facts.push(...text("Version", textOf(spec?.version)), ...text("Provider ID", textOf(spec?.providerID)));
    facts.push(...text("Node", textOf(fieldsOf(fieldsOf(object.status)?.nodeRef)?.name)));

    const parts = namedLinks(tree, node, ["spec.infrastructureRef", "spec.bootstrap.configRef"]);

    if (parts.length > 0) facts.push({ name: "Objects", form: "links", links: parts });
  }
  if (node.role !== undefined) {
    facts.push(...readyFact(node));
    if (node.role === "infrastructure-machine") facts.push(...text("Provider ID", textOf(spec?.providerID)));

    const selfLink = selfLinkOf(object);

    if (selfLink !== undefined) {
      facts.push({ name: "In Freelens", form: "host", text: `${node.kind} ${node.name}`, selfLink });
    }
  }
  if (isCore && node.kind === "MachineHealthCheck") {
    const statusFields = fieldsOf(object.status);
    const names = listOf(statusFields?.targets).flatMap((target) => textOf(target) ?? []);
    const targets = names.flatMap((name) => {
      const id = addressOf(CORE, "Machine", name);

      return tree.nodes.has(id) ? [{ node: id, text: `Machine ${name}` }] : [];
    });
    // A target that the tree does not hold, a Machine gone since the MachineHealthCheck wrote its targets or one whose
    // kind could not be read, is text, with why, as the node of a Machine not read would say it (P12).
    const machines = tree.nodes.get(`kind:${CORE}/Machine`);
    const why = machines?.form === "kind" ? unreadWords(machines.unread) : UNREAD_WORDS["not-found"];
    const texts = names
      .filter((name) => !tree.nodes.has(addressOf(CORE, "Machine", name)))
      .map((name) => ({ text: `Machine ${name}`, why }));
    const template = objectReferenceOf(fieldsOf(spec?.remediation)?.templateRef);
    const remediation = status?.remediation;

    if (names.length > 0) {
      facts.push({ name: "Targets", form: "links", links: targets, ...(texts.length === 0 ? {} : { texts }) });
    }
    facts.push({
      name: "Counts",
      form: "list",
      items: [
        `Expected Machines: ${countOf(statusFields?.expectedMachines) ?? "N/A"}`,
        `Healthy: ${countOf(statusFields?.currentHealthy) ?? "N/A"}`,
        `Remediations allowed: ${countOf(statusFields?.remediationsAllowed) ?? "N/A"}`,
      ],
    });
    facts.push({
      name: "Remediation",
      form: "text",
      text: remediation?.allowed === true ? "Allowed" : remediation?.allowed === false ? "Not allowed" : "Unknown",
      ...(remediation?.condition?.message === undefined ? {} : { tooltip: remediation.condition.message }),
    });
    if (template !== undefined) {
      facts.push({
        name: "Remediation template",
        form: "text",
        text: `${template.kind} ${template.name}`,
        tooltip: template.apiGroup,
      });
    }
  }
  if (node.group === "addons.cluster.x-k8s.io" && node.kind === "ClusterResourceSet") {
    const words = selectorWords(spec?.clusterSelector);

    facts.push({ name: "Selector", form: "list", items: words.length === 0 ? ["None: it selects no Cluster"] : words });

    const entries = (tree.nodes.get(node.id)?.children ?? []).flatMap((child) =>
      child.form === "entry" ? [child] : [],
    );

    if (entries.length > 0) {
      facts.push({
        name: "Applied to this Cluster",
        form: "list",
        items: entries.map((entry) => `${entry.kind} ${entry.name}: ${entryWords(entry.state)}`),
      });
    }
  }
  if (node.group === "addons.cluster.x-k8s.io" && node.kind === "ClusterResourceSetBinding") {
    const items = listOf(spec?.bindings).flatMap((binding) => {
      const set = textOf(fieldsOf(binding)?.clusterResourceSetName) ?? "";

      return listOf(fieldsOf(binding)?.resources).map((resource) => {
        const fields = fieldsOf(resource);

        return `${set}: ${textOf(fields?.kind) ?? ""} ${textOf(fields?.name) ?? ""}, ${fields?.applied === true ? "applied" : "not applied"}`;
      });
    });

    if (items.length > 0) facts.push({ name: "Entries", form: "list", items });
  }
  if (node.group === "ipam.cluster.x-k8s.io" && node.kind === "IPAddressClaim") {
    const pool = contractReferenceOf(spec?.poolRef);

    if (pool !== undefined) {
      facts.push({
        name: "Pool",
        form: "text",
        text: `${pool.kind} ${pool.name}, ${ROLE_WORDS["ipam-pool"]}`,
        tooltip: pool.apiGroup,
      });
    }

    const address = textOf(fieldsOf(fieldsOf(object.status)?.addressRef)?.name);
    const id = address === undefined ? undefined : addressOf("ipam.cluster.x-k8s.io", "IPAddress", address);

    if (id !== undefined && tree.nodes.has(id)) {
      facts.push({ name: "IPAddress", form: "links", links: [{ node: id, text: `IPAddress ${address}` }] });
    }
  }
  if (node.group === "ipam.cluster.x-k8s.io" && node.kind === "IPAddress") {
    facts.push(
      ...text("Address", textOf(spec?.address)),
      ...text("Prefix", countOf(spec?.prefix)?.toString()),
      ...text("Gateway", textOf(spec?.gateway)),
    );
  }
  if (isTemplate(tree, node.id)) {
    facts.push({ name: "Status", form: "text", text: "Its kind has no status." });

    const namers = namersOf(tree, node);

    if (namers.length > 0) facts.push({ name: "Named by", form: "links", links: namers });
  }
  if (isCore && node.kind === "ClusterClass") {
    const names = variableNamesOf(object);

    if (names.variableNames.length > 0) facts.push({ name: "Variables", form: "list", items: names.variableNames });
    if (names.patchNames.length > 0) facts.push({ name: "Patches", form: "list", items: names.patchNames });
  }
  return facts;
}

function isTemplate(tree: ClusterTree, id: string): boolean {
  const node = tree.nodes.get(id);

  return (node?.form === "object" || node?.form === "reference") && node.kind.endsWith("Template");
}

function entryWords(state: "applied" | "not applied" | "missing" | "not-read" | "pending"): string {
  switch (state) {
    case "applied":
      return "applied";
    case "not applied":
      return "not applied";
    case "missing":
      return "in no binding of this Cluster";
    case "not-read":
      return "not read";
    case "pending":
      return "still being read";
  }
}

// The details of a node

export interface NodeDetailsInputs {
  readonly status: NodeStatus | undefined;
  readonly conditions: ConditionsResult | undefined;
}

// The details of a node of an object, read or not, other than the root of the tree.
export function nodeDetailsOf(
  tree: ClusterTree,
  node: ObjectNode | ReferenceNode,
  inputs: NodeDetailsInputs,
): NodeDetails {
  const title = `${node.kind}: ${objectText(node).slice(node.kind.length + 1)}`;
  const place = placeView(tree, node);

  if (node.form === "reference") {
    const namers = namersOf(tree, node);

    return {
      node,
      title,
      metadata: undefined,
      place,
      status: undefined,
      unread:
        node.read.state === "pending"
          ? undefined
          : { words: unreadWords(node.read), messages: node.read.failures.map((failure) => failure.message) },
      loading: node.read.state === "pending",
      facts: namers.length === 0 ? [] : [{ name: "Named by", form: "links", links: namers }],
      conditions: undefined,
    };
  }

  const row: TreeRow = { node, depth: 0, expandable: false, expanded: false };
  const cells = treeCellsOf(tree, row, { status: inputs.status, counts: undefined, conditions: inputs.conditions });
  const restsOn: WordsCell = cells.status.form === "words" ? cells.status.words : { text: "", tooltip: [] };

  return {
    node,
    title,
    metadata: metadataView(tree, node),
    place,
    status: inputs.status === undefined ? undefined : statusSection(tree, node, inputs.status, restsOn),
    unread: undefined,
    loading: inputs.status === undefined,
    facts: factsOf(tree, node, inputs.status?.status),
    conditions: inputs.conditions === undefined ? undefined : conditionViews(inputs.conditions),
  };
}

// The node of the tree that a name of a subject of a message names, when the tree holds an object of Cluster API of
// that kind and that name (P5): the names of the objects of Cluster API of the Cluster that the view read, its class
// read in another namespace included, the one node of the tree of its kind, by `<Kind>/<name>` and by the plural of
// the kind, `<Kinds>/<name>`, as the subject writes it (`subjectKindsOf`); undefined for any other name, which stays
// text.
export function subjectNodes(tree: ClusterTree): ReadonlyMap<string, string> {
  const found = new Map<string, string>();

  for (const node of tree.nodes.values()) {
    if (node.form !== "object" || !isClusterApiKind(node.group, node.kind)) continue;
    for (const written of subjectKindsOf(node.kind)) found.set(`${written}/${node.name}`, node.id);
  }
  return found;
}
