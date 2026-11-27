/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rows of the tree of a Cluster (SPEC-0005, P11, P13 to P16), as pure functions of the tree and of the results of
// the model for its objects:
//
// - the counts of the objects under each node, worst first, the stale ones of each health next to it (P11);
// - whether an object needs a look, and the expansion at first, which the state of the rows keeps once it is computed,
//   so that a change of what the reads give expands nothing and moves no row; then only the user expands and
//   collapses, and a node that the address names later is shown, the nodes above it expanded (P2, P13);
// - the rows that the table shows, each node under the nodes expanded above it, in the order of the tree (P14, P16);
// - the search: the words that a row shows, the nodes that match them and the nodes above them, expanded, while the
//   expansions of the user stay as they were (P15);
// - the offset of the scroll that keeps the first row in view in place when the reads insert or remove rows above it
//   (P13).
//
// None of them is a rule of status: they read the results of the model and change no word of them (P13).

import { activityCell, healthCell } from "./cluster-cells";
import { kindWords, pausedByAnnotation, unreadWords } from "./cluster-tree";
import { ROLE_WORDS } from "./words";

import type { ClusterTree, NodeStatus, TreeNode, VirtualRole } from "./cluster-tree";

// The height of every row of the table of the host, one line (P9, P13).
export const ROW_HEIGHT = 33;

// The names of the virtual nodes (P7, P9).
export const VIRTUAL_NAMES = {
  "control-plane": "Control plane",
  workers: "Workers",
  templates: "Templates",
  "add-ons": "Add-ons",
  "health-checks": "Health checks",
  "other-objects": "Other objects",
} as const satisfies Record<VirtualRole, string>;

// The counts (P11)

// The groups of the counts, in the order in which the columns of state sort, worst first: the words of the health that
// the model gives, then the objects not read and those not found, whose health is unknown, never healthy, before
// Healthy, and last the objects with no health, a kind with no status or an object that is deleting.
export const COUNT_ORDER = [
  "Unhealthy",
  "Degraded",
  "Unknown",
  "not read",
  "not found",
  "Healthy",
  "with no health",
] as const;

export type CountWord = (typeof COUNT_ORDER)[number];

export interface CountGroup {
  readonly word: CountWord;
  readonly count: number;
  // The objects of the group whose health is stale, which the count keeps next to it (SPEC-0003, "Freshness").
  readonly stale: number;
}

// The counts of the objects under a node, never a virtual node, the node of a kind or an entry of a binding, which are
// no objects.
export interface NodeCounts {
  readonly objects: number;
  // The groups that hold objects, in the order of `COUNT_ORDER`.
  readonly groups: readonly CountGroup[];
  // An object under the node still loads: the counts show the spinner of the host in their place.
  readonly pending: boolean;
}

// What one node adds to the counts of the nodes above it: the group of its object and whether its health is stale, or
// that it still loads; nothing for a node that is no object.
type Counted = { readonly word: CountWord; readonly stale: boolean } | "pending" | undefined;

function countedOf(node: TreeNode, statuses: ReadonlyMap<string, NodeStatus>): Counted {
  switch (node.form) {
    case "object": {
      const result = statuses.get(node.id);

      if (result === undefined || result.pending) return "pending";

      const { health, freshness } = result.status;

      return health.health === "none"
        ? { word: "with no health", stale: false }
        : { word: health.health, stale: freshness.length > 0 };
    }
    case "reference":
      if (node.read.state === "pending") return "pending";
      return { word: node.read.state === "not-found" ? "not found" : "not read", stale: false };
    default:
      return undefined;
  }
}

interface Tally {
  objects: number;
  pending: boolean;
  readonly counts: Map<CountWord, { count: number; stale: number }>;
}

function add(tally: Tally, counted: Counted): void {
  if (counted === undefined) return;
  if (counted === "pending") {
    tally.pending = true;
    return;
  }

  const group = tally.counts.get(counted.word) ?? { count: 0, stale: 0 };

  tally.objects++;
  tally.counts.set(counted.word, {
    count: group.count + 1,
    stale: group.stale + (counted.stale ? 1 : 0),
  });
}

function merge(into: Tally, from: Tally): void {
  into.objects += from.objects;
  into.pending ||= from.pending;
  for (const [word, group] of from.counts) {
    const known = into.counts.get(word) ?? { count: 0, stale: 0 };

    into.counts.set(word, { count: known.count + group.count, stale: known.stale + group.stale });
  }
}

// The counts of every node with objects under it, by the identity of the node: every object below it, at any depth,
// each in the group of its health, as the model gives it.
export function countsOf(
  tree: ClusterTree,
  statuses: ReadonlyMap<string, NodeStatus>,
): ReadonlyMap<string, NodeCounts> {
  const counts = new Map<string, NodeCounts>();
  const visit = (node: TreeNode): Tally => {
    const tally: Tally = { objects: 0, pending: false, counts: new Map() };

    for (const child of node.children) {
      merge(tally, visit(child));
      add(tally, countedOf(child, statuses));
    }
    if (tally.objects > 0 || tally.pending) {
      counts.set(node.id, {
        objects: tally.objects,
        groups: COUNT_ORDER.flatMap((word) => {
          const group = tally.counts.get(word);

          return group === undefined ? [] : [{ word, count: group.count, stale: group.stale }];
        }),
        pending: tally.pending,
      });
    }
    return tally;
  };

  visit(tree.root);
  return counts;
}

// The words of the counts, as `12 objects: 1 Unhealthy, 1 not read, 10 Healthy` and
// `14 objects: 1 Unhealthy, 13 Healthy (2 stale)`.
export function countWords(counts: NodeCounts): string {
  const groups = counts.groups.map(
    ({ word, count, stale }) => `${count} ${word}${stale > 0 ? ` (${stale} stale)` : ""}`,
  );

  return `${counts.objects} ${counts.objects === 1 ? "object" : "objects"}: ${groups.join(", ")}`;
}

// The expansion (P13)

// Whether an object needs a look: its health is Unhealthy, Degraded or Unknown; it has an activity other than Idle
// and Paused, Unknown among them, or the activity Paused by its own annotation `cluster.x-k8s.io/paused`; a mark of
// freshness other than Paused; or it could not be read or was not found. A virtual node, the node of a kind and an
// entry of a binding are no objects, and an object whose result still waits for an input says nothing yet.
export function needsLook(node: TreeNode, status: NodeStatus | undefined): boolean {
  if (node.form === "reference") return node.read.state !== "pending";
  if (node.form !== "object" || status === undefined || status.pending) return false;

  const { health, activities, freshness } = status.status;

  if (health.health === "Unhealthy" || health.health === "Degraded" || health.health === "Unknown") return true;
  if (freshness.some((mark) => mark.cause !== "Paused")) return true;
  if (activities.state === "none") return false;
  if (activities.unknown) return true;
  return activities.activities.some((activity) => activity.name !== "Paused" || pausedByAnnotation(node.object));
}

// The nodes above a node, from its parent up to the Cluster.
export function ancestorsOf(tree: ClusterTree, id: string): string[] {
  const ancestors: string[] = [];

  for (let parent = tree.parents.get(id); parent !== undefined; parent = tree.parents.get(parent)) {
    ancestors.push(parent);
  }
  return ancestors;
}

// The expansion at first: the Cluster, and every node with children under which, or at which, an object needs a look;
// then the nodes above the node that the address names, so that it is shown. A subtree whose objects are all Healthy
// and Idle stays collapsed, with its counts.
export function firstExpansion(
  tree: ClusterTree,
  statuses: ReadonlyMap<string, NodeStatus>,
  address?: string,
): ReadonlySet<string> {
  const expanded = new Set<string>([tree.root.id]);
  const visit = (node: TreeNode): boolean => {
    let below = false;

    for (const child of node.children) {
      if (visit(child)) below = true;
    }

    const look = needsLook(node, statuses.get(node.id));

    if (node.children.length > 0 && (below || look)) expanded.add(node.id);
    return below || look;
  };

  visit(tree.root);
  if (address !== undefined && tree.nodes.has(address)) {
    for (const id of ancestorsOf(tree, address)) expanded.add(id);
  }
  return expanded;
}

// What the page keeps of the rows of the tree of one Cluster: that Cluster, by its namespace and its name, the nodes
// expanded, which start from the expansion at first and which only the user changes after it, and the words of the
// search.
export interface RowsState {
  readonly cluster: string;
  readonly expanded: ReadonlySet<string>;
  readonly search: string;
}

function clusterOf(tree: ClusterTree): string {
  return `${tree.root.namespace}/${tree.root.name}`;
}

// The state of the rows for a tree, once its rows can be shown: the expansion at first when the page shows this
// Cluster for the first time, with the node of the address shown; else the state as it was, which a change of what the
// reads give, of states or of objects, does not change (P13).
export function rowsStateOf(
  previous: RowsState | undefined,
  tree: ClusterTree,
  statuses: ReadonlyMap<string, NodeStatus>,
  address?: string,
): RowsState {
  if (previous !== undefined && previous.cluster === clusterOf(tree)) return previous;
  return { cluster: clusterOf(tree), expanded: firstExpansion(tree, statuses, address), search: "" };
}

// The user expands or collapses a node.
export function toggled(state: RowsState, id: string): RowsState {
  const expanded = state.expanded.has(id) ? [...state.expanded].filter((each) => each !== id) : [...state.expanded, id];

  return { ...state, expanded: new Set(expanded) };
}

// The words of the search change; the expansions of the user stay as they were, and come back when it is cleared.
export function searched(state: RowsState, search: string): RowsState {
  return { ...state, search };
}

// The user expands or collapses a node while the search holds words: against what the search expands, for that search
// alone, which the rows show at once, while the expansions of the user stay as they were for when it is cleared (P15).
export function toggledInSearch(toggles: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return toggles.has(id) ? new Set([...toggles].filter((each) => each !== id)) : new Set([...toggles, id]);
}

// A node that the address names once the expansion at first is computed, as one that appears later, or that a link
// of the details names (P2, P5): the nodes above it are expanded, so that it is shown; nothing else changes.
export function revealed(state: RowsState, tree: ClusterTree, id: string): RowsState {
  if (!tree.nodes.has(id)) return state;

  const above = ancestorsOf(tree, id).filter((each) => !state.expanded.has(each));

  return above.length === 0 ? state : { ...state, expanded: new Set([...state.expanded, ...above]) };
}

// The rows (P14, P15, P16)

export interface TreeRow {
  readonly node: TreeNode;
  // Its depth under the Cluster, which is at 0.
  readonly depth: number;
  // It has children: its row has the button that expands or collapses it.
  readonly expandable: boolean;
  readonly expanded: boolean;
}

// The search (P15): the nodes that match, the nodes that it shows, those and the nodes above them, and the nodes that
// it expands, the nodes above a match.
export interface TreeSearch {
  readonly matches: ReadonlySet<string>;
  readonly shown: ReadonlySet<string>;
  readonly expanded: ReadonlySet<string>;
}

const NO_TOGGLES: ReadonlySet<string> = new Set();

// The rows that the table shows: depth first, in the order of the tree, each node under the nodes expanded above it;
// or, while the search holds words, the nodes that it shows, those above a match expanded, and what the user expands
// or collapses during that search, against what the search expands (`toggles`): a node that the user expands shows
// every node under it, and one that the user collapses none (P15).
export function rowsOf(
  tree: ClusterTree,
  expanded: ReadonlySet<string>,
  search?: TreeSearch,
  toggles: ReadonlySet<string> = NO_TOGGLES,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (node: TreeNode, depth: number, every: boolean): void => {
    if (search !== undefined && !every && !search.shown.has(node.id)) return;

    const expandable = node.children.length > 0;
    const bySearch = search !== undefined && search.expanded.has(node.id);
    const open = expandable && (search === undefined ? expanded.has(node.id) : bySearch !== toggles.has(node.id));

    rows.push({ node, depth, expandable, expanded: open });
    if (!open) return;
    // Under a node that the search expands, the nodes that it shows; under one that the user expands, every node.
    for (const child of node.children) visit(child, depth + 1, !bySearch);
  };

  visit(tree.root, 0, false);
  return rows;
}

// The word that P12 puts in the cells Activity and Condition of a node that cannot be read.
function cellWords(state: "not-read" | "not-found"): string {
  return state === "not-found" ? "Not found" : "Not read";
}

// The words that a row shows and that the search matches, those of its name and of its marks of state: the kind and the
// name, the role of an object of a provider, `namespace/name` for the class read in another namespace than its Cluster,
// which its name shows, the name of a virtual node and the noun of the node of a kind; the word of the health, "stale"
// and the words of the activities and their states, as the cells of the list show them (SPEC-0004, P14), unless the
// result still waits for an input; and, for a node that cannot be read, the words that P12 puts in its cells: "Not
// read", or "Not found" for an object that its namespace does not hold, in its cells Activity and Condition, and the
// reason in its cell Status. Never the counts, a label, an id or the namespace of the Cluster, which every row would
// match. The words of the cells Version and Status of an object join them in `searchWordsOf` of `tree-cells.ts`, which
// the search of the page matches (SPEC-0005, "Notes and deviations").
export function nodeWords(tree: ClusterTree, node: TreeNode, status: NodeStatus | undefined): string[] {
  switch (node.form) {
    case "object":
    case "reference": {
      const elsewhere =
        node.kind === "ClusterClass" &&
        tree.classNamespace !== undefined &&
        tree.classNamespace !== tree.root.namespace &&
        node.id !== tree.root.id;
      const words = [
        node.kind,
        elsewhere ? `${tree.classNamespace}/${node.name}` : node.name,
        ...(node.role === undefined ? [] : [ROLE_WORDS[node.role]]),
      ];

      if (node.form === "reference") {
        return node.read.state === "pending" ? words : [...words, cellWords(node.read.state), unreadWords(node.read)];
      }
      if (status === undefined || status.pending) return words;

      const health = healthCell(status.status);
      const activity = activityCell(status.status);

      return [
        ...words,
        ...(health.mark === undefined ? [] : [health.mark.word]),
        ...(health.stale.length > 0 ? ["stale"] : []),
        ...activity.marks.flatMap((mark) => [mark.word, ...(mark.state === undefined ? [] : [mark.state])]),
      ];
    }
    case "virtual":
      return [VIRTUAL_NAMES[node.role]];
    case "kind":
      return [node.noun, cellWords(node.unread.state), kindWords(node)];
    case "entry":
      return [
        node.kind,
        node.name,
        ...(node.unread === undefined ? [] : [cellWords(node.unread.state), unreadWords(node.unread)]),
      ];
  }
}

// Whether a word holds the words searched, as a search of a list of the host matches a field: whatever their case, in
// the word as it is or in the word without its dashes and underscores, the dashes and underscores of the words searched
// kept (freelens:packages/core/src/renderer/components/item-object-list/search-matcher.ts, at both releases, which the
// extension API does not export).
function holds(word: string, search: string): boolean {
  const text = word.toLowerCase();

  return text.includes(search) || text.replaceAll("-", "").replaceAll("_", "").includes(search);
}

// The search of the words of a row: a node matches when one of its words holds the words searched; the search shows it
// and the nodes above it, expanded. Empty, it searches nothing, and the rows are the user's.
export function searchTree(
  tree: ClusterTree,
  search: string,
  wordsOf: (node: TreeNode) => readonly string[],
): TreeSearch | undefined {
  if (search === "") return undefined;

  const query = search.toLowerCase();
  const matches = new Set<string>();
  const expanded = new Set<string>();

  for (const node of tree.nodes.values()) {
    if (!wordsOf(node).some((word) => holds(word, query))) continue;
    matches.add(node.id);
    for (const id of ancestorsOf(tree, node.id)) {
      if (expanded.has(id)) break;
      expanded.add(id);
    }
  }
  return { matches, shown: new Set([...matches, ...expanded]), expanded };
}

// The scroll (P13)

// What changed the rows: the reads, which insert and remove rows as objects come and go and change the states of
// others, or the user, who expands, collapses and searches.
export type RowsChange = "reads" | "expansion" | "search";

// The offset by which the page moves the scroll of the list, so that the first row in view stays in place: the height
// of the rows inserted above it, less that of the rows removed above it, when the reads changed the rows; none for rows
// below it, and none for an expansion or a search, which move no row. When the reads removed the first row in view
// itself, the next row after it that remains stays in place.
export function scrollOffset(
  before: readonly TreeRow[],
  after: readonly TreeRow[],
  firstInView: string | undefined,
  change: RowsChange,
): number {
  if (change !== "reads" || firstInView === undefined) return 0;

  const was = before.findIndex((row) => row.node.id === firstInView);

  if (was === -1) return 0;

  const now = new Map(after.map((row, index) => [row.node.id, index]));

  for (let index = was; index < before.length; index++) {
    const at = now.get(before[index].node.id);

    if (at !== undefined) return (at - index) * ROW_HEIGHT;
  }
  return 0;
}
