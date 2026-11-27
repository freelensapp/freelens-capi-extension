/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the sessions of the real tier compare (SPEC-0004, "With the real project", `clusters-real.tests.ts` and
// `clusters-sveltos.tests.ts`; SPEC-0005, "With the real project", `cluster-tree-real.tests.ts`), as pure functions,
// which their unit test checks with no cluster: the row of a Cluster that `clusterctl describe cluster` prints, the
// counters that the details of the extension show, the row that those counters give, summed as the project sums them
// (SPEC-0001, R4.21, R4.22), the lists of the Clusters that the page of the Sveltos extension sends without a watch,
// and the tree that the tool prints of a Cluster with every row of an object shown, against the tree of the extension.
// Its name does not match `*.tests.ts`, so Vitest does not collect it as a session.

// The cells of the row of a Cluster in the table of `clusterctl describe cluster`: REPLICAS, the current of the
// desired Machines, AVAILABLE, READY and UP TO DATE, and the STATUS and REASON of its `Available` (R4.21, R4.22).
export interface DescribedCluster {
  readonly replicas: string;
  readonly available: string;
  readonly ready: string;
  readonly upToDate: string;
  readonly status: string;
  readonly reason: string;
}

// The escape sequences of the colors of a terminal, which clusterctl writes only to one.
const COLORS = /\u001b\[[0-9;]*m/g;

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The row of a Cluster in what `clusterctl describe cluster` prints: the line whose name is `Cluster <namespace>/<name>`,
// then the version of its topology when it has one, then its cells, at least two spaces apart, the table having no
// border (R4.21, R4.24, R4.25); undefined when no line is the row of that Cluster, or when one of its cells is not
// written yet. clusterctl leaves a cell empty, with no mark in its place, when no part writes its counter (R4.22),
// and the status when it shows the conditions of the Cluster in rows of their own (R4.28), which the scripts do not
// ask for: the cells after an empty one then move to the left, and the cell of the status holds no longer True,
// False or Unknown.
export function describedCluster(output: string, namespace: string, name: string): DescribedCluster | undefined {
  const row = new RegExp(`^Cluster ${escaped(`${namespace}/${name}`)}(?:, \\S+)?(?= {2,})(.*)$`);

  for (const line of output.replaceAll(COLORS, "").split("\n")) {
    const found = row.exec(line.trim());

    if (found === null) continue;

    const [replicas, available, ready, upToDate, status, reason] = found[1].trim().split(/ {2,}/);

    return /^(True|False|Unknown)$/.test(status ?? "") && reason
      ? { replicas, available, ready, upToDate, status, reason }
      : undefined;
  }
  return undefined;
}

// The counters of the control plane or of the workers, from the value of their item in the details of the extension:
// each count with its label, such as `3 desired`, or `N/A up to date` for one not written, separated by commas. A
// part that is not a count with its label is refused: the text of the whole item of the drawer is its name and its
// value with nothing between them, `Machines1 desired, ...`, as the host renders it (drawer-item.tsx:47-48, at
// `v2.1.0`), and its first count would otherwise be lost.
export function countersOf(text: string): Map<string, number | undefined> {
  const counters = new Map<string, number | undefined>();

  for (const part of text.split(",")) {
    if (part.trim() === "") continue;

    const counter = /^\s*(\d+|N\/A) (.+?)\s*$/.exec(part);

    if (!counter) {
      throw new Error(`"${part.trim()}" of "${text}" is not a count with its label: read the value of the item alone`);
    }
    counters.set(counter[2], counter[1] === "N/A" ? undefined : Number(counter[1]));
  }
  return counters;
}

// The sum of a counter of the control plane and of the workers, as clusterctl sums it: a counter not written counts as
// zero, and the cell is empty when neither part writes it (R4.22).
function sum(controlPlane: Map<string, number | undefined>, workers: Map<string, number | undefined>, label: string) {
  const one = controlPlane.get(label);
  const other = workers.get(label);

  return one === undefined && other === undefined ? "" : String((one ?? 0) + (other ?? 0));
}

// The counters of the row of a Cluster that the counters of its control plane and of its workers give, as the
// project sums them: REPLICAS the current of the desired, and AVAILABLE, READY and UP TO DATE (R4.22).
export function summedCounters(
  controlPlane: Map<string, number | undefined>,
  workers: Map<string, number | undefined>,
): Pick<DescribedCluster, "replicas" | "available" | "ready" | "upToDate"> {
  const current = sum(controlPlane, workers, "current");
  const desired = sum(controlPlane, workers, "desired");

  return {
    replicas: current === "" && desired === "" ? "" : `${current || "0"}/${desired || "0"}`,
    available: sum(controlPlane, workers, "available"),
    ready: sum(controlPlane, workers, "ready"),
    upToDate: sum(controlPlane, workers, "up to date"),
  };
}

// The status and the reason of `Available`, from the line of the summary of the details: `Available: <status>, <reason>`.
export function summaryOf(text: string): { status: string; reason: string } | undefined {
  const summary = /^Available: (\S+), (\S+)/.exec(text.trim());

  return summary === null ? undefined : { status: summary[1], reason: summary[2] };
}

// A request of the renderer, as the sessions record it: its method, its address, and when the session saw it go.
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly at: number;
}

// The lists of the Clusters at `v1beta1`, the version that the Sveltos extension reads, in a namespace or over the
// whole cluster, without a watch, that the renderer sent from `from` to `to`, both included: such as the reloads that
// the page of the Sveltos extension makes every 30 seconds, whatever changed (freelens-sveltos-extension:
// src/renderer/api/subscribe-stores.ts:4, 54-62). An update that the page shows with none of them between the write
// and the moment it shows came through a watch.
export function clusterListsBetween(requests: readonly RecordedRequest[], from: number, to: number): RecordedRequest[] {
  return requests.filter((request) => {
    if (request.method !== "GET" || request.at < from || request.at > to || !URL.canParse(request.url)) return false;

    const address = new URL(request.url);

    return (
      !address.searchParams.has("watch") &&
      /^(?:\/api-kube)?\/apis\/cluster\.x-k8s\.io\/v1beta1\/(?:namespaces\/[^/]+\/)?clusters$/.test(address.pathname)
    );
  });
}

// The tree of a Cluster (SPEC-0005, "With the real project")

// The flags with which the session of the tree runs `clusterctl describe cluster`: every MachineSet, the templates that
// the tool shows, under a node of their own, the ClusterResourceSets, every infrastructure machine and bootstrap config,
// and every Machine on a row of its own (SPEC-0001, R4.2, R4.10, R4.14, R4.18, R4.20).
export const TREE_FLAGS: readonly string[] = [
  "--show-machinesets",
  "--show-templates",
  "--show-resourcesets",
  "--echo",
  "--grouping=false",
];

// The columns of the table of the tool, in their order (R4.21).
const COLUMNS = ["NAME", "REPLICAS", "AVAILABLE", "READY", "UP TO DATE", "STATUS", "REASON", "SINCE", "MESSAGE"];

// The characters of the prefix of the tree that the tool draws before a name, two for each level
// (internal/util/tree/tree.go:48-51).
const PREFIX = /^[\u2502\u251c\u2514\u2500 ]*/;

// An object that a row of the tool names: `Kind namespace/name`, then `, <version>` for a Cluster with a topology, a
// control plane, a MachineDeployment, a MachineSet, a MachinePool and a Machine, after `!! DELETED !!` for an object
// with a deletion timestamp (R4.24, R4.25).
export interface DescribedObject {
  readonly kind: string;
  readonly namespace: string;
  readonly name: string;
  readonly version: string | undefined;
  readonly deleted: boolean;
}

// A row of the tree that the tool prints: its depth from its prefix, the object that it names or the name of a virtual
// node, `Workers`, `ClusterResourceSets`, `Templates` or `Other`, the index of the row of the node above it, and its
// cells (R4.22).
export interface DescribedRow {
  readonly depth: number;
  readonly object: DescribedObject | undefined;
  readonly virtual: string | undefined;
  readonly parent: number | undefined;
  readonly replicas: string;
  readonly available: string;
  readonly ready: string;
  readonly upToDate: string;
  readonly status: string;
  readonly reason: string;
}

const DELETED = "!! DELETED !! ";
const OBJECT_NAME = /^(\S+) ([^/\s]+)\/([^,\s]+)(?:, (\S+))?$/;

function objectOfName(name: string): DescribedObject | undefined {
  const deleted = name.startsWith(DELETED);
  const found = OBJECT_NAME.exec(deleted ? name.slice(DELETED.length) : name);

  return found === null
    ? undefined
    : { kind: found[1], namespace: found[2], name: found[3], version: found[4], deleted };
}

// The rows of the tree that the tool prints, from its table: the cells of a row are read at the places of the titles
// of its header, since a cell that the tool leaves empty has no mark in its place (R4.22); a row that the tool adds for
// a message that it wraps holds only the prefix of the tree in its cell NAME, and is no row of an object (R4.26).
export function describedTree(output: string): DescribedRow[] {
  const lines = output.replaceAll(COLORS, "").split("\n");
  const header = lines.findIndex((line) => line.startsWith("NAME") && line.includes("REPLICAS"));

  if (header === -1) return [];

  const starts: number[] = [];

  for (const title of COLUMNS) {
    const at = lines[header].indexOf(title, starts.length === 0 ? 0 : starts[starts.length - 1] + 1);

    if (at === -1) throw new Error(`The header of the table of the tool has no column ${title}: ${lines[header]}`);
    starts.push(at);
  }

  const cell = (line: string, column: number) => line.slice(starts[column], starts[column + 1]).trim();
  const rows: DescribedRow[] = [];
  // The index of the last row at each depth, for the node above a row.
  const last: number[] = [];

  for (const line of lines.slice(header + 1)) {
    const named = line.slice(0, starts[1]);
    const prefix = PREFIX.exec(named)?.[0] ?? "";
    const name = named.slice(prefix.length).trim();

    if (name === "") continue;

    const depth = prefix.length / 2;
    const object = objectOfName(name);

    last[depth] = rows.length;
    last.length = depth + 1;
    rows.push({
      depth,
      object,
      virtual: object === undefined ? name : undefined,
      parent: depth === 0 ? undefined : last[depth - 1],
      replicas: cell(line, 1),
      available: cell(line, 2),
      ready: cell(line, 3),
      upToDate: cell(line, 4),
      status: cell(line, 5),
      reason: cell(line, 6),
    });
  }
  return rows;
}

// A node of the tree of the extension as the session reads it, every node expanded: its identity, which names the
// group, the kind and the name of an object, its depth under the Cluster, and the identity of the node above it.
export interface ReadNode {
  readonly id: string;
  readonly depth: number;
  readonly parent: string | undefined;
}

// The group, the kind and the name of the object of a node, from its identity, `<group>/<Kind>/<name>`, or
// `<group>/<Kind>/<namespace>/<name>` for the class in another namespace; nothing for a virtual node, the node of a kind
// or an entry of a binding (SPEC-0005, P2).
export function objectOfNode(id: string): { group: string; kind: string; name: string } | undefined {
  if (/^(?:virtual|kind|entry):/.test(id)) return undefined;

  const parts = id.split("/");

  return parts.length < 3 ? undefined : { group: parts[0], kind: parts[1], name: parts[parts.length - 1] };
}

// The virtual nodes of the tool that the tree reads as its own (SPEC-0005, "With the real project", 1).
const VIRTUAL_NODES: Readonly<Record<string, string>> = {
  Workers: "virtual:workers",
  ClusterResourceSets: "virtual:add-ons",
};

// Whether a node that the tool does not print is of a kind that the tool leaves out (step 3): the ClusterClass
// (R4.31); the node Health checks and its MachineHealthChecks, which the tool never reads (R4.4, R4.5); the binding,
// which it reads to name the ClusterResourceSets and prints as no row (R4.4, R4.10); the resources under each
// ClusterResourceSet, which it never reads (R4.10); and a template that only a MachineSet names, which it shows under no
// MachineSet, with the node Templates that holds it (R4.20).
function leftOutByTheTool(node: ReadNode): boolean {
  const object = objectOfNode(node.id);

  if (node.id === "virtual:health-checks" || node.id.startsWith("entry:")) return true;
  if (node.id.startsWith("virtual:templates:cluster.x-k8s.io/MachineSet/")) return true;
  if (node.parent?.startsWith("virtual:templates:cluster.x-k8s.io/MachineSet/")) return true;
  return (
    object !== undefined &&
    ((object.group === "cluster.x-k8s.io" && ["ClusterClass", "MachineHealthCheck"].includes(object.kind)) ||
      (object.group === "addons.cluster.x-k8s.io" && object.kind === "ClusterResourceSetBinding"))
  );
}

// What differs between the tree that the tool prints and the tree of the extension (SPEC-0005, "With the real
// project", 1 and 3): a row of an object that is no node of the tree, with its kind and its name, or that sits under
// another node or at another depth; a virtual node of the tool that the tree does not have; and a node of the tree that
// the tool does not print and does not leave out. A row under the virtual node Other of the tool sits where P7 places
// it, under Workers, the virtual node Control plane or Other objects, so its node above it and its depth are not
// compared, nor the depth of the rows under it. Empty when they agree.
export function treeDifferences(described: readonly DescribedRow[], nodes: readonly ReadNode[]): string[] {
  const differences: string[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const mapped: (string | undefined)[] = [];
  const underOther = (index: number): boolean => {
    for (let at = described[index].parent; at !== undefined; at = described[at].parent) {
      if (described[at].virtual === "Other") return true;
    }
    return false;
  };
  const said = (row: DescribedRow) =>
    row.object === undefined ? `the virtual node ${row.virtual}` : `${row.object.kind} ${row.object.name}`;

  described.forEach((row, index) => {
    const parent = row.parent === undefined ? undefined : mapped[row.parent];

    if (row.object !== undefined) {
      const { kind, name } = row.object;
      const found = nodes.filter((node) => {
        const object = objectOfNode(node.id);

        return object?.kind === kind && object.name === name;
      });

      if (found.length !== 1) {
        mapped.push(undefined);
        differences.push(`clusterctl prints ${kind} ${name}, of which the tree has ${found.length} nodes`);
        return;
      }
      mapped.push(found[0].id);
    } else if (row.virtual === "Templates") {
      mapped.push(parent === undefined ? undefined : `virtual:templates:${parent}`);
    } else if (row.virtual === "Other") {
      mapped.push(undefined);
      return;
    } else {
      mapped.push(VIRTUAL_NODES[row.virtual ?? ""]);
      if (mapped[index] === undefined) {
        differences.push(`clusterctl prints ${said(row)}, which the tree does not read as a node of its own`);
        return;
      }
    }

    const id = mapped[index];
    const node = id === undefined ? undefined : byId.get(id);

    if (node === undefined) {
      differences.push(`clusterctl prints ${said(row)}, which the tree has no node of`);
      return;
    }
    if (underOther(index)) {
      if (row.parent !== undefined && described[row.parent].virtual !== "Other" && node.parent !== parent) {
        differences.push(`${said(row)} sits under ${node.parent}, and under ${parent} in clusterctl`);
      }
      return;
    }
    if (node.parent !== parent)
      differences.push(`${said(row)} sits under ${node.parent}, and under ${parent} in clusterctl`);
    if (node.depth !== row.depth)
      differences.push(`${said(row)} is at depth ${node.depth}, and ${row.depth} in clusterctl`);
  });

  const printed = new Set(mapped.filter((id): id is string => id !== undefined));

  for (const node of nodes) {
    if (!printed.has(node.id) && !leftOutByTheTool(node)) {
      differences.push(`the tree has ${node.id} under ${node.parent}, which clusterctl does not print`);
    }
  }
  return differences;
}

// The type of the condition that the tool shows on the row of an object: `Available` on a Cluster, a
// MachineDeployment and a control plane, a row under the Cluster with a version, else `Ready`; none on a MachineSet
// and a MachinePool, whose rows show no status (R4.22, R4.23, R4.33).
export function describedConditionType(row: DescribedRow, rows: readonly DescribedRow[]): string | undefined {
  const object = row.object;

  if (object === undefined || ["MachineSet", "MachinePool"].includes(object.kind)) return undefined;
  if (object.kind === "Cluster" && row.depth === 0) return "Available";
  if (object.kind === "MachineDeployment") return "Available";

  const parent = row.parent === undefined ? undefined : rows[row.parent];

  return parent?.depth === 0 && object.version !== undefined ? "Available" : "Ready";
}

// The condition that the summary of the details of a node gives: `<type>: <status>, <reason>`.
export function summaryConditionOf(text: string): { type: string; status: string; reason: string } | undefined {
  const summary = /^(\S+): (\S+), (\S+)/.exec(text.trim());

  return summary === null ? undefined : { type: summary[1], status: summary[2], reason: summary[3] };
}

// The counters of the tooltip of the cell Replicas of a node, each line `<Label>: <n> Machines`, or `N/A, not written
// yet`, by their labels in lower case: desired, current, ready, available and up to date.
export function replicaCountersOf(lines: readonly string[]): Map<string, number | undefined> {
  const counters = new Map<string, number | undefined>();

  for (const line of lines) {
    const counter = /^(Desired|Current|Ready|Available|Up to date): (?:(\d+) Machines?|N\/A)/.exec(line.trim());

    if (counter !== null)
      counters.set(counter[1].toLowerCase(), counter[2] === undefined ? undefined : Number(counter[2]));
  }
  return counters;
}

// What differs between the counters of a row of the tool, REPLICAS the current of the desired, AVAILABLE, READY and UP
// TO DATE, and those of the tooltip of the cell Replicas of its node (SPEC-0005, "With the real project", 2).
export function countersDifferences(row: DescribedRow, counters: ReadonlyMap<string, number | undefined>): string[] {
  const written = (label: string) => {
    const value = counters.get(label);

    return value === undefined ? "" : String(value);
  };
  const view = {
    replicas: `${written("current")}/${written("desired")}`,
    available: written("available"),
    ready: written("ready"),
    upToDate: written("up to date"),
  };
  const name = row.object === undefined ? String(row.virtual) : `${row.object.kind} ${row.object.name}`;

  return (["replicas", "available", "ready", "upToDate"] as const)
    .filter((cell) => view[cell] !== row[cell])
    .map((cell) => `${name}: ${cell} ${view[cell] || "nothing"} in the tree, ${row[cell] || "nothing"} in clusterctl`);
}
