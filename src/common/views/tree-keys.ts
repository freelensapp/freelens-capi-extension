/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The keyboard and the focus of the tree of a Cluster (SPEC-0005, P16, P18), as pure functions of its rows:
//
// - the tree is one stop of Tab, an element with the role `treegrid` around the table, which takes the keys of a tree,
//   as a tree of a desktop application does, and names the row of the active node in `aria-activedescendant` once that
//   row is drawn, and no row while it is not;
// - each row carries the role `row`, an id, its level, whether it is expanded when it has children, and whether its
//   details are open; each of its cells the role `gridcell`; the header row the role `row`, and its cells
//   `columnheader`;
// - the active node is kept by its identity; when the rows no longer show it, a search gives it to the first node that
//   matches, and a collapse or a change of the reads to the nearest node above it that is shown;
// - a move brings its row fully into view, by the scroll of the list, when the list leaves it partly in view.

import { ROW_HEIGHT } from "./tree-rows";

import type { ClusterTree } from "./cluster-tree";
import type { TreeRow, TreeSearch } from "./tree-rows";

// The id of the element of the row of a node, which `aria-activedescendant` names.
export function rowDomId(id: string): string {
  return `capi-tree-row-${id}`;
}

// The attributes of a tree item that a row carries, spread on the `TableRow` of the host, which spreads every prop
// that it does not use on its element (P18).
export interface RowAttributes {
  readonly role: "row";
  readonly id: string;
  readonly "aria-level": number;
  readonly "aria-expanded"?: boolean;
  readonly "aria-selected": boolean;
}

// A row at its level, from 1 for the Cluster; `aria-expanded` on a node with children alone; selected while its
// details are open.
export function rowAttributes(row: TreeRow, selected: boolean): RowAttributes {
  return {
    role: "row",
    id: rowDomId(row.node.id),
    "aria-level": row.depth + 1,
    ...(row.expandable ? { "aria-expanded": row.expanded } : {}),
    "aria-selected": selected,
  };
}

export const HEAD_ROW_ATTRIBUTES = { role: "row" } as const;

export const HEAD_CELL_ATTRIBUTES = { role: "columnheader" } as const;

export const CELL_ATTRIBUTES = { role: "gridcell" } as const;

// What a key does on the active node (P18).
export type KeyAction =
  // Another node becomes active.
  | { readonly type: "move"; readonly to: string }
  | { readonly type: "expand"; readonly id: string }
  | { readonly type: "collapse"; readonly id: string }
  // Its details open.
  | { readonly type: "open"; readonly id: string }
  // The key is taken, and nothing changes: Down on the last node, Enter on an entry of a binding.
  | { readonly type: "none" };

// The keys that the tree takes, by `KeyboardEvent.key`; it prevents the default of each, Page Up and Page Down
// included, so that none scrolls the list but by the moves of the page (P18).
export const TREE_KEYS: readonly string[] = [
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowRight",
  "ArrowLeft",
  "Enter",
  " ",
];

function moveTo(rows: readonly TreeRow[], index: number): KeyAction {
  const to = rows[Math.max(0, Math.min(rows.length - 1, index))];

  return to === undefined ? { type: "none" } : { type: "move", to: to.node.id };
}

// What a key does on the active node, given the rows shown and how many rows a window of the list holds; undefined for
// a key that the tree does not take, which keeps its default, such as Escape, which the drawer of the host hears on
// the window and which closes the details.
//
// | Key                | What it does                                                                                       |
// | ------------------ | -------------------------------------------------------------------------------------------------- |
// | Down, Up           | The next node shown, the one before                                                                |
// | Home, End          | The first node, the last node shown                                                                |
// | Page Up, Page Down | The node a window of rows above or below the active one, the first or the last node shown at most |
// | Right              | Expands a collapsed node; on an expanded one, goes to its first child                             |
// | Left               | Collapses an expanded node; on a collapsed one or a leaf, goes to the node above it               |
// | Enter, Space       | Opens the details; on a node with no details, expands or collapses it; on an entry, nothing       |
export function keyAction(
  tree: ClusterTree,
  rows: readonly TreeRow[],
  active: string,
  key: string,
  windowRows: number,
): KeyAction | undefined {
  if (!TREE_KEYS.includes(key)) return undefined;

  const at = rows.findIndex((row) => row.node.id === active);

  if (at === -1) return rows.length === 0 ? { type: "none" } : moveTo(rows, 0);

  const row = rows[at];
  const page = Math.max(1, windowRows);

  switch (key) {
    case "ArrowDown":
      return at === rows.length - 1 ? { type: "none" } : moveTo(rows, at + 1);
    case "ArrowUp":
      return at === 0 ? { type: "none" } : moveTo(rows, at - 1);
    case "Home":
      return at === 0 ? { type: "none" } : moveTo(rows, 0);
    case "End":
      return at === rows.length - 1 ? { type: "none" } : moveTo(rows, rows.length - 1);
    case "PageDown":
      return at === rows.length - 1 ? { type: "none" } : moveTo(rows, at + page);
    case "PageUp":
      return at === 0 ? { type: "none" } : moveTo(rows, at - page);
    case "ArrowRight":
      if (!row.expandable) return { type: "none" };
      return row.expanded ? moveTo(rows, at + 1) : { type: "expand", id: active };
    case "ArrowLeft": {
      if (row.expandable && row.expanded) return { type: "collapse", id: active };

      const parent = tree.parents.get(active);

      return parent === undefined || !rows.some((each) => each.node.id === parent)
        ? { type: "none" }
        : { type: "move", to: parent };
    }
    default: {
      // Enter and Space.
      const { node } = row;

      if (node.form === "object" || node.form === "reference") return { type: "open", id: active };
      if (node.form === "entry" || !row.expandable) return { type: "none" };
      return row.expanded ? { type: "collapse", id: active } : { type: "expand", id: active };
    }
  }
}

// The active node among the rows shown: the one that was, by its identity, while the rows show it; once they do not,
// the first node that a search matches, with no scroll (P18), and otherwise, after a collapse or a change of the reads,
// the nearest node above it that the rows show, else the Cluster.
export function activeOf(
  tree: ClusterTree,
  rows: readonly TreeRow[],
  active: string | undefined,
  search: TreeSearch | undefined,
): string | undefined {
  if (rows.length === 0) return undefined;
  if (active !== undefined && rows.some((row) => row.node.id === active)) return active;
  if (search !== undefined) return (rows.find((row) => search.matches.has(row.node.id)) ?? rows[0]).node.id;

  const shown = new Set(rows.map((row) => row.node.id));

  for (let parent = active === undefined ? undefined : tree.parents.get(active); parent !== undefined; ) {
    if (shown.has(parent)) return parent;
    parent = tree.parents.get(parent);
  }
  return rows[0].node.id;
}

// The row that `aria-activedescendant` names: that of the active node once it is drawn, and none while it is not, since
// the virtual list draws only the rows of its window and a name of a row that is not in the document names nothing
// (P18).
export function activeDescendant(active: string | undefined, drawn: boolean): string | undefined {
  return active === undefined || !drawn ? undefined : rowDomId(active);
}

// How many rows a window of the list holds, for Page Up and Page Down, at least one.
export function windowRows(viewHeight: number): number {
  return Math.max(1, Math.floor(viewHeight / ROW_HEIGHT));
}

// The scroll of the list that shows a row whole, from the top of the list, when the list leaves it partly in view or
// out of it; undefined when it is whole in view, or when the list has no height yet (P16).
export function revealScroll(index: number, scrollTop: number, viewHeight: number): number | undefined {
  if (viewHeight <= 0 || index < 0) return undefined;

  const top = index * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;

  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewHeight) return Math.max(0, bottom - viewHeight);
  return undefined;
}
