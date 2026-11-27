/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the sessions of the tree of a Cluster do on its page in the frame of a cluster (SPEC-0005, "Tests"): open the
// page at an address, read the rows that the virtual list of the host draws, read every row of the tree by scrolling
// the list, expand every node, scroll the list by code and by the wheel, read a tooltip, and record in the frame what
// a reading after the fact would miss: the first rows drawn and the answers to the requests of the frame, the row that
// `aria-activedescendant` names at each frame, and the rows drawn at each change of the document; and read the tree of
// accessibility of the frame through CDP. The virtual list draws only the rows of its window and ten on each side (P9;
// H3), so a session reads a whole tree by scrolling it, and finds a row by the identity of its node, never by its place
// among the elements. Its name does not match `*.tests.ts`, so Vitest does not collect it as a session.

import { extensionPageAddress, navigateCluster } from "./extension-helpers";
import { ROW_ID_PREFIX } from "./tree-outline";

import type { Frame, Locator, Page } from "playwright";

import type { Answer, AxNode, FirstDraw } from "./tree-checks";
import type { ReadMark, ReadRow } from "./tree-outline";

// The page of the tree, in the frame of a cluster.
export const TREE_PAGE = extensionPageAddress("cluster-tree");

// The height of a row of the table of the host, one line (P9; H3).
export const ROW_HEIGHT = 33;

const viewTimeout = 60 * 1000;

// The address of the page of the tree of a Cluster, at a node with its details when one is named (P2).
export function treeAddress(namespace: string, name: string, details?: string): string {
  const params = new URLSearchParams({ cluster: `${namespace}/${name}` });

  if (details !== undefined) params.set("details", details);
  return `${TREE_PAGE}?${params.toString()}`;
}

// The element of the tree, with the role treegrid, around the table (P18).
export function treeOf(frame: Frame): Locator {
  return frame.getByTestId("capi-tree");
}

// The details of a node, the drawer of the host over the tree (P17).
export function detailsOf(frame: Frame): Locator {
  return frame.getByTestId("capi-tree-details");
}

// The title of a drawer of the host, without the icon that copies it; null while the drawer is not open.
export function titleOf(drawer: Locator): Promise<string | null> {
  return drawer.locator(".drawer-title-text").evaluateAll((elements) => elements[0]?.firstChild?.textContent ?? null);
}

// The element of the virtual list of the table that scrolls (`listElementOf` of the page).
export function listOf(tree: Locator): Locator {
  return tree.locator(".VirtualList > .list");
}

// Waits until a condition of the page holds, up to a time, and fails saying what it waited for.
export async function until(what: string, holds: () => Promise<boolean>, timeout = viewTimeout): Promise<void> {
  const deadline = Date.now() + timeout;

  while (!(await holds().catch(() => false))) {
    if (Date.now() > deadline) throw new Error(`Waited ${timeout / 1000} s for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Two frames of the frame of the tree, once a scroll, a click or a key has rendered what it changes.
export async function rendered(element: Locator): Promise<void> {
  await element.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

export interface OpenOptions {
  // The node whose details the address names (P2).
  readonly details?: string;
  // What the session does in the frame once the page with no Cluster shows, before the address of the tree.
  readonly before?: () => Promise<void>;
}

// Opens the page of the tree of a Cluster at its address, as a navigation of the frame does, after the page with no
// Cluster, so that the page mounts again with no state of a mount before it, and waits until the tree draws a row with
// its marks: the root, or the rows around the node of an address.
export async function openTree(
  frame: Frame,
  namespace: string,
  name: string,
  options: OpenOptions = {},
): Promise<Locator> {
  await navigateCluster(frame, TREE_PAGE);
  await frame.getByTestId("capi-tree-no-cluster").waitFor({ timeout: viewTimeout });
  await options.before?.();
  await navigateCluster(frame, treeAddress(namespace, name, options.details));

  const tree = treeOf(frame);

  await tree
    .locator('[role="row"][aria-level] [data-testid="capi-tree-activity"]')
    .first()
    .waitFor({ timeout: viewTimeout });
  await rendered(tree);
  return tree;
}

// A row that the virtual list draws, with its top and its bottom from the top of the window of the list.
export interface DrawnRow extends ReadRow {
  readonly top: number;
  readonly bottom: number;
}

// The rows that the virtual list draws now, in their order in the document, each as the session reads it from its
// element: the identity of its node from its id, its place from its top in the list, its attributes, and the words and
// the marks of its cells, each found by its test id (`tree-outline.ts`).
export function drawnRows(tree: Locator): Promise<DrawnRow[]> {
  return tree.evaluate(
    (element, { prefix, height }) => {
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
    },
    { prefix: ROW_ID_PREFIX, height: ROW_HEIGHT },
  );
}

// The scroll of the list, its height and the height of all its rows.
export function listMetrics(tree: Locator): Promise<{ scrollTop: number; clientHeight: number; scrollHeight: number }> {
  return listOf(tree).evaluate((list) => ({
    scrollTop: list.scrollTop,
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight,
  }));
}

// Sets the scroll of the list, as a scroll by code does, through the setter of the element itself, which a session
// that plants a page with no compensation leaves to the session alone, and waits until the list draws the row at its
// top.
export async function scrollListTo(tree: Locator, top: number): Promise<void> {
  const target = await listOf(tree).evaluate((list, wanted) => {
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");

    scrollTop?.set?.call(list, wanted);
    return scrollTop?.get?.call(list) as number;
  }, top);

  await until(`the list to draw its row at ${target} px`, async () =>
    (await drawnRows(tree)).some((row) => row.index === Math.floor(target / ROW_HEIGHT)),
  );
  await rendered(tree);
}

// Every row of the tree that the rows show, in their order, read by scrolling the list from its top to its end, the
// list then back where it was.
export async function allRows(tree: Locator): Promise<DrawnRow[]> {
  const start = (await listMetrics(tree)).scrollTop;
  const rows = new Map<string, DrawnRow>();

  await scrollListTo(tree, 0);
  for (let guard = 0; guard < 1000; guard++) {
    for (const row of await drawnRows(tree)) if (!rows.has(row.id)) rows.set(row.id, row);

    const { scrollTop, clientHeight, scrollHeight } = await listMetrics(tree);

    if (scrollTop + clientHeight >= scrollHeight - 1) break;
    await scrollListTo(tree, scrollTop + Math.max(ROW_HEIGHT, clientHeight - 2 * ROW_HEIGHT));
  }
  await scrollListTo(tree, start);
  return [...rows.values()].sort((one, other) => one.index - other.index);
}

// Every row of the tree, once none of them shows the spinner of the host in a cell of state.
export async function settledRows(tree: Locator): Promise<DrawnRow[]> {
  let rows: DrawnRow[] = [];

  await until("every row of the tree to show its cells", async () => {
    rows = await allRows(tree);
    return rows.length > 0 && rows.every((row) => !row.pending);
  });
  return rows;
}

// Expands every node of the tree, from its top to its end, each by its button, as a user expands it, and brings the
// list back to its top.
export async function expandAll(tree: Locator): Promise<void> {
  await scrollListTo(tree, 0);
  for (let guard = 0; guard < 2000; guard++) {
    const next = await tree.evaluate((element) => {
      const collapsed = element.querySelector<HTMLElement>('[role="row"][aria-expanded="false"]');

      if (collapsed !== null) {
        collapsed.querySelector<HTMLElement>('[data-testid="capi-tree-expander"]')?.click();
        return collapsed.id;
      }

      const list = element.querySelector<HTMLElement>(".VirtualList > .list");

      return list !== null && list.scrollTop + list.clientHeight < list.scrollHeight - 1 ? "" : undefined;
    });

    if (next === undefined) break;
    if (next === "") {
      const { scrollTop, clientHeight } = await listMetrics(tree);

      await scrollListTo(tree, scrollTop + Math.max(ROW_HEIGHT, clientHeight - 2 * ROW_HEIGHT));
    } else {
      await until(`${next} to expand`, () =>
        tree.evaluate(
          (element, id) => element.querySelector(`[id="${id}"]`)?.getAttribute("aria-expanded") !== "false",
          next,
        ),
      );
      await rendered(tree);
    }
  }
  await scrollListTo(tree, 0);
}

// The row of a node that the list draws now, by the identity of its node.
export function rowOf(tree: Locator, id: string): Locator {
  return tree.locator(`[id="${ROW_ID_PREFIX}${id}"]`);
}

// Brings the row of a node into the window of the list, by its place among the rows, and gives its element.
export async function rowInView(tree: Locator, id: string): Promise<Locator> {
  const row = (await allRows(tree)).find((each) => each.id === id);

  if (row === undefined) throw new Error(`The tree shows no row ${id}`);

  const { scrollTop, clientHeight } = await listMetrics(tree);
  const top = row.index * ROW_HEIGHT;

  if (top < scrollTop || top + ROW_HEIGHT > scrollTop + clientHeight) await scrollListTo(tree, top);
  return rowOf(tree, id);
}

// The row of a node that the element of the tree names in `aria-activedescendant`, by the identity of its node, and
// whether the element of the tree has the focus.
export function activeOf(tree: Locator): Promise<{ active: string | null; focused: boolean }> {
  return tree.evaluate((element, prefix) => {
    const active = element.getAttribute("aria-activedescendant");

    return {
      active: active === null ? null : active.startsWith(prefix) ? active.slice(prefix.length) : active,
      focused: document.activeElement === element,
    };
  }, ROW_ID_PREFIX);
}

// Scrolls the list by the wheel of the mouse, over the column of the names in the middle of the window of the list,
// which no drawer covers, and waits until the scroll of the list stops moving.
export async function wheel(window: Page, tree: Locator, deltaY: number): Promise<void> {
  const box = await listOf(tree).boundingBox();

  if (box === null) throw new Error("The tree has no list to scroll the wheel over");
  await window.mouse.move(box.x + 24, box.y + box.height / 2);
  await window.mouse.wheel(0, deltaY);

  let last = Number.NaN;

  await until("the scroll of the list to stop after the wheel", async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));

    const { scrollTop } = await listMetrics(tree);
    const still = scrollTop === last;

    last = scrollTop;
    return still;
  });
  await rendered(tree);
}

// The lines of the tooltip that a hover of an element shows, once it is visible, each a block of the tooltip; the pointer
// leaves the frame first, so that the tooltip of a hover before it is gone.
export async function tooltipLines(frame: Frame, window: Page, target: Locator): Promise<string[]> {
  await window.mouse.move(5, 5);
  await until(
    "the tooltip of the hover before to go",
    async () => (await frame.locator('[role="tooltip"].visible').count()) === 0,
  );
  await target.hover();

  const tooltip = frame.locator('[role="tooltip"].visible');

  await tooltip.waitFor({ timeout: viewTimeout });

  const lines = (await tooltip.locator(":scope > div > div").allTextContents()).map((line) => line.trim());

  return lines.length > 0 ? lines : [((await tooltip.textContent()) ?? "").trim()];
}

// What the frame records

// Records in the frame, from now, the first rows that the tree draws, by an observer of the DOM, and every answer to a
// request of the frame, by its resource timing, cleared first, both in the clock of the frame (step 2).
export async function recordFirstDraw(frame: Frame): Promise<void> {
  await frame.evaluate((prefix) => {
    const store = globalThis as unknown as Record<string, { observer?: MutationObserver; first?: unknown } | undefined>;

    store.capiFirstDraw?.observer?.disconnect();
    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(100_000);

    const state: { observer?: MutationObserver; first?: unknown } = {};
    const observer = new MutationObserver(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="capi-tree"] [role="row"][aria-level]')];

      if (rows.length === 0 || state.first !== undefined) return;
      state.first = {
        at: performance.now(),
        rows: rows.map((row) => ({
          id: row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id,
          expanded: row.getAttribute("aria-expanded"),
        })),
      };
      observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    state.observer = observer;
    store.capiFirstDraw = state;
  }, ROW_ID_PREFIX);
}

// The first rows that the frame recorded, and the answers to its requests since it started to record them.
export function firstDrawOf(frame: Frame): Promise<{ first: FirstDraw | undefined; answers: Answer[] }> {
  return frame.evaluate(() => {
    const store = globalThis as unknown as Record<string, { observer?: MutationObserver; first?: unknown } | undefined>;
    const state = store.capiFirstDraw;

    state?.observer?.disconnect();
    return {
      first: state?.first as FirstDraw | undefined,
      answers: performance.getEntriesByType("resource").map((entry) => ({
        url: entry.name,
        start: entry.startTime,
        end: (entry as PerformanceResourceTiming).responseEnd,
      })),
    };
  });
}

// The answers to the requests of the frame since it started to record them, in the clock of the frame, and the time
// of that clock now.
export function answersOf(frame: Frame): Promise<{ now: number; answers: Answer[] }> {
  return frame.evaluate(() => ({
    now: performance.now(),
    answers: performance.getEntriesByType("resource").map((entry) => ({
      url: entry.name,
      start: entry.startTime,
      end: (entry as PerformanceResourceTiming).responseEnd,
    })),
  }));
}

// The row that `aria-activedescendant` names at the first frame after each change of it, with its top and its bottom
// in the window of the list, and the scroll and the height of the list then.
export interface ActiveRecord {
  readonly active: string | null;
  readonly top: number | null;
  readonly bottom: number | null;
  readonly scrollTop: number;
  readonly viewHeight: number;
}

// Records in the frame, from now, the row that the element of the tree names at the first frame after each change of
// `aria-activedescendant`, which is when the browser paints it (P16, P18; step 5).
export async function recordActive(tree: Locator): Promise<void> {
  await tree.evaluate((element, prefix) => {
    const store = globalThis as unknown as Record<
      string,
      { observer: MutationObserver; records: unknown[] } | undefined
    >;

    store.capiActive?.observer.disconnect();

    const records: unknown[] = [];
    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => {
        const id = element.getAttribute("aria-activedescendant");
        const row = id === null ? null : document.getElementById(id);
        const list = element.querySelector<HTMLElement>(".VirtualList > .list");
        const listTop = list?.getBoundingClientRect().top ?? 0;
        const box = row?.getBoundingClientRect();

        records.push({
          active: id === null ? null : id.startsWith(prefix) ? id.slice(prefix.length) : id,
          top: box === undefined ? null : box.top - listTop,
          bottom: box === undefined ? null : box.bottom - listTop,
          scrollTop: list?.scrollTop ?? 0,
          viewHeight: list?.clientHeight ?? 0,
        });
      });
    });

    observer.observe(element, { attributes: true, attributeFilter: ["aria-activedescendant"] });
    store.capiActive = { observer, records };
  }, ROW_ID_PREFIX);
}

// What the frame recorded of `aria-activedescendant` since it started, the records then cleared.
export function activeRecords(tree: Locator): Promise<ActiveRecord[]> {
  return tree.evaluate(() => {
    const store = globalThis as unknown as Record<string, { records: ActiveRecord[] } | undefined>;
    const records = store.capiActive?.records ?? [];

    return records.splice(0, records.length);
  });
}

// Records in the frame, from now, the rows of the tree drawn at each change of the document, and the answers to its
// requests, by their resource timing, cleared first (P23; step 6).
export async function recordDrawn(frame: Frame): Promise<void> {
  await frame.evaluate((prefix) => {
    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(100_000);

    const store = globalThis as unknown as Record<
      string,
      { observer: MutationObserver; records: unknown[] } | undefined
    >;

    store.capiDrawn?.observer.disconnect();

    const records: unknown[] = [];
    const observer = new MutationObserver(() => {
      records.push({
        at: performance.now(),
        ids: [...document.querySelectorAll<HTMLElement>('[data-testid="capi-tree"] [role="row"][aria-level]')].map(
          (row) => (row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.id),
        ),
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    store.capiDrawn = { observer, records };
  }, ROW_ID_PREFIX);
}

// The rows that the frame recorded at each change of the document since it started, and it stops recording them.
export function drawnRecords(frame: Frame): Promise<{ at: number; ids: string[] }[]> {
  return frame.evaluate(() => {
    const store = globalThis as unknown as Record<
      string,
      { observer: MutationObserver; records: { at: number; ids: string[] }[] } | undefined
    >;
    const state = store.capiDrawn;

    state?.observer.disconnect();
    return state?.records ?? [];
  });
}

// The tree of accessibility

// The tree of accessibility of the document of the frame, as Chromium computes it, through CDP and not through the
// snapshot of Playwright, and the id of the element of each row node, by its backend node id. A frame of a cluster
// that Chromium renders in a process of its own has a session of its own; one in the process of its page is read
// through the session of the page, by the id of the frame.
export async function accessibilityTreeOf(
  window: Page,
  frame: Frame,
): Promise<{ nodes: AxNode[]; domIds: Map<number, string> }> {
  const context = window.context();
  let session = await context.newCDPSession(frame).catch(() => undefined);
  let frameId: string | undefined;

  if (session === undefined) {
    session = await context.newCDPSession(window);

    const origin = new URL(frame.url()).origin;
    const { frameTree } = await session.send("Page.getFrameTree");
    const frames = [frameTree];

    for (let at = 0; at < frames.length; at++) frames.push(...(frames[at].childFrames ?? []));
    frameId = frames.find((each) => each.frame.url.startsWith(origin))?.frame.id;
    if (frameId === undefined) throw new Error(`No frame of ${origin} in the tree of frames of the page`);
  }
  try {
    await session.send("Accessibility.enable");

    const { nodes } = await session.send("Accessibility.getFullAXTree", frameId === undefined ? {} : { frameId });
    const domIds = new Map<number, string>();

    for (const node of nodes) {
      if (node.role?.value !== "row" || node.backendDOMNodeId === undefined) continue;

      const { node: element } = await session.send("DOM.describeNode", { backendNodeId: node.backendDOMNodeId });
      const attributes = element.attributes ?? [];
      const at = attributes.indexOf("id");

      if (at !== -1 && at % 2 === 0) domIds.set(node.backendDOMNodeId, attributes[at + 1]);
    }
    await session.send("Accessibility.disable");
    return { nodes: nodes as AxNode[], domIds };
  } finally {
    await session.detach().catch(() => undefined);
  }
}
