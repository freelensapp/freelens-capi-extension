/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rows of the page of the tree of a Cluster as the sessions read them in the frame of a cluster (SPEC-0005), and
// the outline that they give, as `tree-expectations.ts` writes one, as functions of the document or pure, which their
// unit tests check against the cells that the page draws, with no app, and on the page that the page test renders in
// jsdom. A row of the page carries the identity of its node in its id, `capi-tree-row-<node>`, its level in
// `aria-level` and whether it is expanded in `aria-expanded` (P18); its cells hold the words and the marks of P9 to
// P12, each found by its test id. Its name does not match `*.tests.ts`, so Vitest does not collect it as a session.

import type { OutlineRow } from "./tree-expectations";

// The prefix of the id of the element of a row, before the identity of its node (`tree-keys.ts`).
export const ROW_ID_PREFIX = "capi-tree-row-";

// A mark of state in a cell, as the page draws it: its word, its state when it is not Progressing, and its tone.
export interface ReadMark {
  readonly word: string;
  readonly state: string;
  readonly tone: string;
}

// A row of the tree, as a session reads it from the element of the row.
export interface ReadRow {
  // The identity of its node (P2), from the id of its element.
  readonly id: string;
  // Its place among the rows shown, from its top in the list, one row a line of 33 px.
  readonly index: number;
  // Its level, from 1 for the Cluster.
  readonly level: number;
  readonly expanded: string | null;
  readonly selected: string | null;
  // The words of its cell Name: the kind and the name of an object, or the words of a virtual node, of the node of a
  // kind or of an entry of a binding; and the role of an object of a provider.
  readonly name: string;
  readonly role: string | null;
  // The marks of its cell Activity, or its words when it holds none: N/A, Not read, Not found.
  readonly activities: readonly ReadMark[];
  readonly activityWords: string | null;
  // The mark of its health, the word stale, the whole text of its cell Condition, and the counts of P11.
  readonly health: ReadMark | null;
  readonly stale: boolean;
  readonly condition: string;
  readonly counts: string | null;
  // The text of its cell Status.
  readonly status: string;
  // A cell of state that shows the spinner of the host, while its inputs load.
  readonly pending: boolean;
}

// A row that the virtual list draws, with its top and its bottom from the top of the window of the list.
export interface DrawnRow extends ReadRow {
  readonly top: number;
  readonly bottom: number;
}

// The rows that the virtual list of the element of the tree draws, in their order in the document, each as the session
// reads it from its element: the identity of its node from its id, its place from its top in the list, its attributes,
// and the words and the marks of its cells, each found by its test id. The sessions run it in the frame, through
// `drawnRows` of `tree-page.ts`, which hands it to the page as its text: it reads nothing but its arguments and the
// document. A case of the page test reads the page that it renders with it.
export function readDrawnRows(element: Element, { prefix, height }: { prefix: string; height: number }): DrawnRow[] {
  const list = element.querySelector<HTMLElement>(".VirtualList > .list");

  if (list === null) return [];

  const box = list.getBoundingClientRect();
  const contentTop = box.top - list.scrollTop;
  const words = (node: Element | null) => (node === null ? null : (node.textContent ?? "").trim());
  const markOf = (mark: Element): ReadMark => ({
    word: mark.getAttribute("data-word") ?? "",
    state: mark.getAttribute("data-state") ?? "",
    tone: mark.getAttribute("data-tone") ?? "",
  });

  return [...element.querySelectorAll<HTMLElement>('[role="row"][aria-level]')].map((row) => {
    const rowBox = row.getBoundingClientRect();
    const button = row.querySelector('[data-testid="capi-tree-name-button"]');
    const role = row.querySelector('[data-testid="capi-tree-role"]');
    const activity = row.querySelector('[data-testid="capi-tree-activity"]');
    const status = row.querySelector('[data-testid="capi-tree-status"]');
    const marks = [...row.querySelectorAll('[data-testid="capi-tree-activity-mark"]')].map(markOf);
    const health = row.querySelector('[data-testid="capi-tree-health"]');
    const whole = row.querySelector('[data-testid="capi-tree-name"]')?.textContent ?? "";
    const roleText = role?.textContent ?? "";

    return {
      id: row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id,
      index: Math.round((rowBox.top - contentTop) / height),
      level: Number(row.getAttribute("aria-level")),
      expanded: row.getAttribute("aria-expanded"),
      selected: row.getAttribute("aria-selected"),
      name:
        words(button) ??
        (roleText !== "" && whole.endsWith(roleText) ? whole.slice(0, -roleText.length) : whole).trim(),
      role: words(role),
      activities: marks,
      activityWords: activity !== null && marks.length === 0 ? words(activity) : null,
      health: health === null ? null : markOf(health),
      stale: row.querySelector('[data-testid="capi-tree-stale"]') !== null,
      condition: words(row.querySelector('[data-testid="capi-tree-condition"]')) ?? "",
      counts: words(row.querySelector('[data-testid="capi-tree-counts"]')),
      status: words(status) ?? "",
      pending: activity === null || status === null,
      top: rowBox.top - box.top,
      bottom: rowBox.bottom - box.top,
    };
  });
}

// The identity of the node of a row, from the id of its element.
export function nodeIdOfRow(rowId: string): string {
  return rowId.startsWith(ROW_ID_PREFIX) ? rowId.slice(ROW_ID_PREFIX.length) : rowId;
}

// How the binding of the Cluster records a resource of a ClusterResourceSet, from the row of its entry, as an outline
// writes it: applied, not applied, in no binding, or not read when the bindings cannot be read (P10, P12).
function entryState(row: ReadRow): string {
  if (row.activityWords === "Not read") return "not read";
  if (row.status.startsWith("Applied")) return "applied";
  if (row.status === "Not applied") return "not applied";
  if (row.status === "In no binding of this Cluster") return "in no binding";
  return "pending";
}

// The text of a row in an outline (`tree-expectations.ts`): the kind and the name of an object, with its role in
// parentheses for an object of a provider, and `[not found]` or `[not read]` for a node that cannot be read, which its
// cells of state say (P12); the words of a virtual node; the noun of a kind that cannot be read and `[not read]`; the
// kind and the name of a resource of a ClusterResourceSet, with how the binding records it.
export function outlineTextOf(row: ReadRow): string {
  if (row.id.startsWith("virtual:")) return row.name;
  if (row.id.startsWith("kind:")) return `${row.name} [not read]`;
  if (row.id.startsWith("entry:")) return `${row.name} [${entryState(row)}]`;

  const read =
    row.activityWords === "Not found" ? " [not found]" : row.activityWords === "Not read" ? " [not read]" : "";

  return `${row.name}${row.role === null ? "" : ` (${row.role})`}${read}`;
}

// The outline of the rows, in their order, each at its depth under the Cluster.
export function outlineOfRows(rows: readonly ReadRow[]): OutlineRow[] {
  return [...rows]
    .sort((one, other) => one.index - other.index)
    .map((row) => ({
      depth: row.level - 1,
      text: outlineTextOf(row),
    }));
}

// The node above each row, by the identities of their nodes: the nearest row before it one level up; none for the
// Cluster.
export function parentsOfRows(rows: readonly ReadRow[]): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>();
  const above: string[] = [];

  for (const row of [...rows].sort((one, other) => one.index - other.index)) {
    above.length = row.level - 1;
    parents.set(row.id, row.level === 1 ? undefined : above[row.level - 2]);
    above[row.level - 1] = row.id;
  }
  return parents;
}
