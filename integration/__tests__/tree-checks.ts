/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the sessions of the tree of a Cluster decide from what they read in the frame of a cluster (SPEC-0005,
// "Tests", "In Freelens"), as pure functions, which their unit test checks with no app: the marks, the expansion and
// the counts of the rows against the expectations written by hand, the first rows that the page draws against the
// answers to its lists, the node that a key makes active and the scroll that a move leaves, the first row in view, the
// rows of the tree in the tree of accessibility of Chromium, and the requests of the frame that write. Each returns
// what differs, empty when nothing does, so that a session reports every difference of a step at once. Its name does
// not match `*.tests.ts`, so Vitest does not collect it as a session.

import { activityTones, outlineRows } from "./tree-expectations";
import { outlineOfRows, outlineTextOf } from "./tree-outline";

import type { ExpectedMarks, FirstExpansion } from "./tree-expectations";
import type { ReadRow } from "./tree-outline";

// The rows and the marks

// What differs between the marks of the rows read and those that step 1 expects (`EXPECTED_MARKS`): each object of the
// table of SPEC-0003 is one row, with the word and the tone of its health, or N/A and no mark for an object with none,
// its activities in their order, each Progressing and in a tone of its word, none for a kind with no status, whose cell
// says N/A, the word stale, and the note of the MachinePools of unknown health.
export function marksProblems(rows: readonly ReadRow[], expected: readonly ExpectedMarks[]): string[] {
  const problems: string[] = [];

  for (const marks of expected) {
    const found = rows.filter((row) => outlineTextOf(row) === marks.text);

    if (found.length !== 1) {
      problems.push(`${marks.text}: ${found.length} rows`);
      continue;
    }

    const [row] = found;
    const health = row.health?.word ?? "N/A";
    const activities = row.activities.map((mark) => mark.word);

    if (row.pending) problems.push(`${marks.text}: its cells still load`);
    if (health !== marks.health) problems.push(`${marks.text}: health ${health}, expected ${marks.health}`);
    if (marks.health === "N/A" && !row.condition.startsWith("N/A")) {
      problems.push(`${marks.text}: the cell Condition says ${row.condition}, expected N/A`);
    }
    if (marks.tones.length > 0 && !marks.tones.includes(row.health?.tone ?? "")) {
      problems.push(
        `${marks.text}: the tone of its health is ${row.health?.tone}, expected one of ${marks.tones.join(", ")}`,
      );
    }
    if (activities.join(", ") !== marks.activities.join(", ")) {
      problems.push(
        `${marks.text}: activities ${activities.join(", ") || "none"}, expected ${marks.activities.join(", ") || "none"}`,
      );
    }
    if (marks.activities.length === 0 && row.activityWords !== "N/A") {
      problems.push(`${marks.text}: the cell Activity says ${row.activityWords}, expected N/A`);
    }
    for (const mark of row.activities) {
      if (mark.state !== "") problems.push(`${marks.text}: ${mark.word} is ${mark.state}, expected Progressing`);
      if (!activityTones(mark.word).includes(mark.tone)) {
        problems.push(
          `${marks.text}: ${mark.word} in the tone ${mark.tone}, expected ${activityTones(mark.word).join(" or ")}`,
        );
      }
    }
    if (row.stale !== (marks.stale ?? false)) {
      problems.push(
        `${marks.text}: ${row.stale ? "stale" : "not stale"}, expected ${marks.stale ? "stale" : "not stale"}`,
      );
    }
    if (marks.note !== undefined && !row.condition.includes(marks.note)) {
      problems.push(`${marks.text}: the cell Condition says ${row.condition}, with no "${marks.note}"`);
    }
  }
  return problems;
}

// What differs between the rows that the tree shows when it opens and the expansion at first of step 2
// (`FIRST_EXPANSIONS`): the outline, each row with rows under it expanded but those collapsed, each row with no row
// under it and not collapsed a leaf, and the counts of every row that holds objects, those of no other.
export function expansionProblems(rows: readonly ReadRow[], expected: FirstExpansion): string[] {
  const problems: string[] = [];
  const sorted = [...rows].sort((one, other) => one.index - other.index);
  const outline = outlineOfRows(sorted);
  const wanted = outlineRows(expected.outline);

  if (JSON.stringify(outline) !== JSON.stringify(wanted)) {
    problems.push(
      `The rows are\n${outline.map((row) => `${"  ".repeat(row.depth)}${row.text}`).join("\n")}\nexpected\n${expected.outline.trim()}`,
    );
  }
  sorted.forEach((row, at) => {
    const text = outlineTextOf(row);
    const under = (sorted[at + 1]?.level ?? 0) > row.level;
    const state = expected.collapsed.includes(text) ? "false" : under ? "true" : null;

    if (row.expanded !== state) problems.push(`${text}: aria-expanded ${row.expanded}, expected ${state}`);
    if (row.counts !== (expected.counts[text] ?? null)) {
      problems.push(`${text}: counts ${row.counts}, expected ${expected.counts[text] ?? "none"}`);
    }
  });
  return problems;
}

// The first rows

// The first frame that drew rows of the tree, as an observer of the DOM in the frame records it: when, in the clock of
// the frame, and its rows, in their order in the document.
export interface FirstDraw {
  readonly at: number;
  readonly rows: readonly { readonly id: string; readonly expanded: string | null }[];
}

// An answer to a request of the frame, from the resource timing of the frame, in the clock of the frame: the address of
// the request, when it started and when its answer ended.
export interface Answer {
  readonly url: string;
  readonly start: number;
  readonly end: number;
}

// The groups that the tree of a Cluster reads: those of Cluster API and of its providers, `cluster.x-k8s.io` and its
// subgroups, and that of the definitions.
const TREE_GROUPS = /\/apis\/(?:(?:[a-z0-9-]+\.)*cluster\.x-k8s\.io|apiextensions\.k8s\.io)\//;

function pathOf(url: string): string {
  return URL.canParse(url) ? new URL(url).pathname : url;
}

// Whether a request goes to a group that the tree reads.
export function readsAGroupOfTheTree(url: string): boolean {
  return TREE_GROUPS.test(pathOf(url));
}

// Whether a request is a list or a get that the tree of a Cluster of a namespace makes, never a watch: of a kind of a
// group that it reads in that namespace, or of a definition.
function isReadOf(url: string, namespace: string): boolean {
  const path = pathOf(url);

  return (
    readsAGroupOfTheTree(url) &&
    !(URL.canParse(url) && new URL(url).searchParams.has("watch")) &&
    (path.includes(`/namespaces/${namespace}/`) || path.includes("/apis/apiextensions.k8s.io/"))
  );
}

// What differs between the first rows that the page drew and what step 2 expects of them (P13): drawn once the answer
// to every list and get that the frame sent before them, of the kinds of the groups of the tree in the namespace of its
// Cluster and of the definitions, had arrived, and among them an answer to the list of the Clusters of that namespace,
// which shows that the session read the answers; and the rows of the tree once it settled, their first ones by their
// nodes and their `aria-expanded`.
export function firstDrawProblems(
  first: FirstDraw | undefined,
  settled: readonly { readonly id: string; readonly expanded: string | null }[],
  answers: readonly Answer[],
  namespace: string,
): string[] {
  if (first === undefined) return ["The observer recorded no row drawn"];

  const problems: string[] = [];
  const before = answers.filter((answer) => isReadOf(answer.url, namespace) && answer.start < first.at);

  for (const answer of before) {
    if (answer.end > first.at) {
      problems.push(
        `The rows were drawn at ${first.at.toFixed(1)} ms, before the answer to ${pathOf(answer.url)} ended at ${answer.end.toFixed(1)} ms`,
      );
    }
  }
  if (!before.some((answer) => pathOf(answer.url).endsWith(`/namespaces/${namespace}/clusters`))) {
    problems.push(`No answer to the list of the Clusters of ${namespace} came before the first rows`);
  }
  first.rows.forEach((row, at) => {
    const now = settled[at];

    if (now === undefined || now.id !== row.id || now.expanded !== row.expanded) {
      problems.push(
        `The first frame drew ${row.id} (aria-expanded ${row.expanded}) at row ${at}, where the tree shows ${now === undefined ? "no row" : `${now.id} (aria-expanded ${now.expanded})`}`,
      );
    }
  });
  if (first.rows.length === 0) problems.push("The first frame recorded drew no row");
  return problems;
}

// The keys and the scroll

// A row that the tree shows, in its order: the identity of its node, its level and its `aria-expanded`.
export interface ShownRow {
  readonly id: string;
  readonly level: number;
  readonly expanded: string | null;
}

// What a key does on the active node, as the table of P18 says, written here from that table: the node that it makes
// active, and whether it expands or collapses that node or opens its details.
export interface KeyEffect {
  readonly active: string;
  readonly toggles?: "expands" | "collapses";
  readonly opens?: boolean;
}

export function keyEffect(rows: readonly ShownRow[], active: string, key: string, windowRows: number): KeyEffect {
  const at = rows.findIndex((row) => row.id === active);

  if (at === -1) throw new Error(`The active node ${active} is no row shown`);

  const row = rows[at];
  const to = (index: number) => ({ active: rows[Math.max(0, Math.min(rows.length - 1, index))].id });

  switch (key) {
    case "ArrowDown":
      return to(at + 1);
    case "ArrowUp":
      return to(at - 1);
    case "Home":
      return to(0);
    case "End":
      return to(rows.length - 1);
    case "PageDown":
      return to(at + windowRows);
    case "PageUp":
      return to(at - windowRows);
    case "ArrowRight":
      if (row.expanded === "false") return { active, toggles: "expands" };
      return row.expanded === "true" ? to(at + 1) : { active };
    case "ArrowLeft": {
      if (row.expanded === "true") return { active, toggles: "collapses" };

      const parent = rows
        .slice(0, at)
        .reverse()
        .find((each) => each.level === row.level - 1);

      return { active: parent?.id ?? active };
    }
    case "Enter":
    case " ":
      if (row.id.startsWith("entry:")) return { active };
      if (row.id.startsWith("virtual:") || row.id.startsWith("kind:")) {
        return row.expanded === null
          ? { active }
          : { active, toggles: row.expanded === "true" ? "collapses" : "expands" };
      }
      return { active, opens: true };
    default:
      throw new Error(`No effect of ${key} is written`);
  }
}

// What differs between the scroll of the list before and after a key and what the moves of the page give it (P16,
// P18; step 5): a key that moves no node, expands, collapses or opens the details leaves the scroll where it was, and
// so does a move to a row whole in view before it; a move to another row leaves that row whole in view, the scroll
// moved by the list and the page alone, which the virtual list of the host scrolls to its selected row and the page
// then brings whole into view. A scroll of the browser of its own, as a key whose default is not prevented gives,
// changes the scroll where none of these does.
export function moveScrollProblem(
  key: string,
  effect: KeyEffect,
  moved: boolean,
  before: {
    readonly scrollTop: number;
    readonly target: { readonly top: number; readonly bottom: number } | undefined;
  },
  after: { readonly scrollTop: number; readonly target: { readonly top: number; readonly bottom: number } | undefined },
  viewHeight: number,
): string | undefined {
  const still = Math.abs(after.scrollTop - before.scrollTop) <= 0.5;

  if (!moved || effect.toggles !== undefined || effect.opens === true) {
    return still ? undefined : `${key} moved the list from ${before.scrollTop} to ${after.scrollTop} px with no move`;
  }
  if (before.target !== undefined && wholeInView(before.target, viewHeight)) {
    return still
      ? undefined
      : `${key} moved the list from ${before.scrollTop} to ${after.scrollTop} px to a row that was whole in view`;
  }
  if (after.target === undefined || !wholeInView(after.target, viewHeight)) {
    return `${key} left the row of ${effect.active} out of view, at ${after.target?.top ?? "no"} px`;
  }
  return undefined;
}

// A row that the virtual list draws, with its top and its bottom from the top of the window of the list.
export interface PlacedRow {
  readonly id: string;
  readonly top: number;
  readonly bottom: number;
}

// The first row in view: the one whose bottom is under the top of the window of the list and whose top is the
// highest, a row partly in view at the top included.
export function firstInView(rows: readonly PlacedRow[]): PlacedRow | undefined {
  return [...rows].filter((row) => row.bottom > 0.5).sort((one, other) => one.top - other.top)[0];
}

// Whether a row is whole in the window of the list, its top at or under the top of the window.
export function wholeInView(row: { readonly top: number; readonly bottom: number }, viewHeight: number): boolean {
  return row.top >= -0.5 && row.bottom <= viewHeight + 0.5;
}

// The scroll of the list at which the rows that a change of the reads removes, by their places among the rows shown,
// are all above the first row in view, which shows two thirds of itself, and the list is short of its end (P13; step
// 6). At its end the browser keeps the scroll within the shorter list once rows go, which takes it back by their
// height, as the page does, so a page that moves nothing would keep the rows in view in place there too. Undefined when
// the list is too tall for both.
export function removalScroll(
  removed: readonly number[],
  scrollHeight: number,
  clientHeight: number,
  rowHeight: number,
): number | undefined {
  const below = (Math.max(...removed) + 1) * rowHeight;
  const end = scrollHeight - clientHeight;
  const target = Math.min(below + rowHeight / 3, end - 1);

  return removed.length > 0 && target >= below ? target : undefined;
}

// The rows drawn before a change of the reads that the frame no longer draws at some moment after it, from the rows
// that an observer of the DOM recorded at each change of the document (P23).
export function rowsLost(
  before: readonly string[],
  records: readonly { readonly at: number; readonly ids: readonly string[] }[],
): string[] {
  const lost = new Set<string>();

  for (const record of records) {
    const drawn = new Set(record.ids);

    for (const id of before) if (!drawn.has(id)) lost.add(id);
  }
  return [...lost];
}

// The tree of accessibility

// A node of the tree of accessibility of Chromium, as `Accessibility.getFullAXTree` of CDP gives it, with what the
// session reads of it.
export interface AxNode {
  readonly nodeId: string;
  readonly ignored: boolean;
  readonly role?: { readonly value?: unknown };
  readonly name?: { readonly value?: unknown };
  readonly properties?: readonly { readonly name: string; readonly value: { readonly value?: unknown } }[];
  readonly parentId?: string;
  readonly childIds?: readonly string[];
  readonly backendDOMNodeId?: number;
}

function roleOf(node: AxNode | undefined): string {
  return typeof node?.role?.value === "string" ? node.role.value : "";
}

function nameOf(node: AxNode): string {
  return typeof node.name?.value === "string" ? node.name.value.trim() : "";
}

function levelOf(node: AxNode): number | undefined {
  const level = node.properties?.find((property) => property.name === "level")?.value.value;

  return typeof level === "number" ? level : undefined;
}

// The roles that stand between a row and its grid with no meaning of their own.
const PLAIN = new Set(["generic", "none", "presentation", "rowgroup", "GenericContainer", ""]);

// What the tree of accessibility of the frame says of the tree (P18, "Notes and deviations"): what differs from a
// treegrid that holds each row drawn as a row at its level, with its cells as gridcells, and the header as a row of
// columnheaders with the titles of the columns; and, to be logged, what it holds of the element with the role `list`
// that the virtual list of the host puts between the treegrid and the rows. `domIds` gives the id of the element of
// each node of the document, by its backend node id.
export function accessibilityOfTree(
  nodes: readonly AxNode[],
  domIds: ReadonlyMap<number, string>,
  drawn: readonly { readonly id: string; readonly level: number }[],
  titles: readonly string[],
): { problems: string[]; list: string } {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const parents = new Map<string, string>();

  for (const node of nodes) {
    if (node.parentId !== undefined) parents.set(node.nodeId, node.parentId);
    for (const child of node.childIds ?? []) parents.set(child, node.nodeId);
  }

  const grids = nodes.filter((node) => !node.ignored && roleOf(node) === "treegrid");

  if (grids.length !== 1) return { problems: [`The tree of accessibility holds ${grids.length} treegrids`], list: "" };

  const [grid] = grids;
  // The nearest node above a node that carries a role of its own.
  const holderOf = (node: AxNode): AxNode | undefined => {
    for (let at = parents.get(node.nodeId); at !== undefined; at = parents.get(at)) {
      const above = byId.get(at);

      if (above !== undefined && !above.ignored && !PLAIN.has(roleOf(above))) return above;
    }
    return undefined;
  };
  const childrenOf = (node: AxNode) =>
    (node.childIds ?? []).map((id) => byId.get(id)).filter((child): child is AxNode => child !== undefined);
  const problems: string[] = [];
  const byDomId = new Map<string, AxNode>();

  for (const node of nodes) {
    const id = node.backendDOMNodeId === undefined ? undefined : domIds.get(node.backendDOMNodeId);

    if (id !== undefined && id !== "") byDomId.set(id, node);
  }
  for (const row of drawn) {
    const node = byDomId.get(row.id);

    if (node === undefined || node.ignored) {
      problems.push(`${row.id}: no node of the tree of accessibility`);
      continue;
    }
    if (roleOf(node) !== "row") problems.push(`${row.id}: the role ${roleOf(node)}, expected row`);
    if (levelOf(node) !== row.level) problems.push(`${row.id}: the level ${levelOf(node)}, expected ${row.level}`);
    if (holderOf(node)?.nodeId !== grid.nodeId) {
      problems.push(`${row.id}: a row of ${roleOf(holderOf(node)) || "nothing"}, not of the treegrid`);
    }

    const cells = childrenOf(node).filter((child) => !child.ignored);

    if (cells.length !== titles.length || cells.some((cell) => roleOf(cell) !== "gridcell")) {
      problems.push(`${row.id}: its cells are ${cells.map(roleOf).join(", ")}, expected ${titles.length} gridcells`);
    }
  }

  const headers = nodes.filter(
    (node) =>
      !node.ignored && roleOf(node) === "row" && childrenOf(node).some((child) => roleOf(child) === "columnheader"),
  );

  if (headers.length !== 1) {
    problems.push(`The tree of accessibility holds ${headers.length} rows of columnheaders`);
  } else {
    const [header] = headers;
    const cells = childrenOf(header).filter((child) => !child.ignored);

    if (holderOf(header)?.nodeId !== grid.nodeId) problems.push("The header is no row of the treegrid");
    if (cells.some((cell) => roleOf(cell) !== "columnheader") || cells.map(nameOf).join("|") !== titles.join("|")) {
      problems.push(`The header holds ${cells.map((cell) => `${roleOf(cell)} ${nameOf(cell)}`).join(", ")}`);
    }
  }

  const lists = nodes.filter((node) => roleOf(node) === "list" && holderOf(node)?.nodeId === grid.nodeId);
  const list =
    lists.length === 0
      ? "no node with the role list in the treegrid"
      : lists
          .map(
            (node) =>
              `a node with the role list, ${node.ignored ? "ignored" : "not ignored"}, with ${childrenOf(node).filter((child) => !child.ignored).length} children`,
          )
          .join("; ");

  return { problems, list };
}

// The requests

// A request of the renderer, as the sessions record it.
export interface Sent {
  readonly method: string;
  readonly url: string;
}

// The requests to the groups that the tree reads that are not a GET, a list or a watch, as the check of "Safety" reads
// them (SPEC-0005, "Safety"; SPEC-0004, "Notes and deviations").
export function writesOfTheFrame(requests: readonly Sent[]): Sent[] {
  return requests.filter((request) => readsAGroupOfTheTree(request.url) && request.method !== "GET");
}

// The lists and the gets of the tree of a Cluster of a namespace that the frame sent, by their addresses, to which no
// answer recorded since a time, in the clock of the frame, has ended yet; and whether a list of the Clusters of that
// namespace is among those sent (P23; step 6).
export function waitingReads(
  sent: readonly Sent[],
  answers: readonly Answer[],
  since: number,
  namespace: string,
): { waiting: string[]; clusters: boolean } {
  const reads = sent.filter((request) => request.method === "GET" && isReadOf(request.url, namespace));
  const answered = new Set(answers.filter((answer) => answer.start >= since).map((answer) => hrefOf(answer.url)));

  return {
    waiting: reads.map((request) => request.url).filter((url) => !answered.has(hrefOf(url))),
    clusters: reads.some((request) => pathOf(request.url).endsWith(`/namespaces/${namespace}/clusters`)),
  };
}

function hrefOf(url: string): string {
  return URL.canParse(url) ? new URL(url).href : url;
}
