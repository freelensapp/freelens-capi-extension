/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The session of the tree of a Cluster (SPEC-0005, "Tests", "In Freelens, on the definitions and the fixtures"), on the
// cluster of the definitions of Cluster API with the fixtures of every state of SPEC-0002, each state in its namespace,
// which the integration workflow applies with `pnpm e2e:fixtures:up all` (SPEC-0004, P33), and the large Cluster of
// P22, which it makes itself. The root page is 1280 by 900 CSS pixels, as the probe had it (H1, H2, H3). It checks:
//
// 1. the tree of the Cluster of each state, opened by its address, every node expanded, against the expected trees,
//    the marks of the objects of the table of SPEC-0003, and the parts of each cell of marks apart; and, 1024 px wide,
//    the rows of `rolling-out`;
// 2. the expansion at first and the counts of `healthy`, `rolling-out` and `deleting`, and that the first rows are
//    drawn once the answers to the lists of the page have arrived, from an observer of the DOM and the resource timing
//    of the frame;
// 3. the ways in from the details of a Cluster and from the panel in the details of the host, and the way back;
// 4. the details of a node and the details of the host over them; the states that are not the happy one (P19);
// 5. the keys of P18, the scroll that each leaves, and the roles of P18 in the DOM and in the tree of accessibility of
//    Chromium, read through CDP;
// 6. the tree live: an annotation, a Machine created and deleted above the rows in view, a status, and a refresh;
// 7. the search;
// 8. the check of "Safety" on the fixtures;
// 9. the large Cluster, with the focus kept by the element of the tree while the wheel unmounts rows.
//
// The session writes to the cluster of the tests alone, through the scripts of the test environment, which check the
// target before every request: the annotation `cluster.x-k8s.io/paused` on a worker Machine of `healthy`, a Machine of
// its own in that namespace, the condition `Ready` of another worker through the status subresource, and the large
// Cluster in a namespace of its own. It undoes each write at the end of its part, also when a check failed, and its end
// undoes what a part could not; it records the version that the answer to each write gives, and fails at once when it
// is the one before the write, so that the check of "Safety" tells its writes from those of the frame, and it checks
// that the Machine that it deletes and the namespace of the large Cluster are gone.
//
// The variables of the planted runs, each the run that shows a check failing once (kit, `docs/testing.md`, "Checks
// worth trusting"): TEST_PLANT_WRITE patches a label of a fixture from the frame, and both checks of "Safety" fail;
// TEST_PLANT_COMPENSATION gives the list an own `scrollTop` that drops what the page sets, a page with no compensation,
// and step 6 fails twice; TEST_PLANT_FOCUS lets the press of the mouse focus a name and drops the focus that the click
// gives the element of the tree, and step 9 fails; TEST_PLANT_KEYS drops `preventDefault` of the keys of the tree, and
// step 5 records whether they scroll the list from the element, asserting nothing of it. Two checks are planted in the
// page itself, by the branch of the screenshots: rows drawn as each load ends (step 2), and a refresh that empties its
// stores before it loads them (step 6). With TEST_SCREENSHOTS_DIR set the session takes the screenshots of the themes;
// with TEST_THEME and TEST_THEME_VARIANT set it checks the theme that the profile names.
//
// Step 1 holds while the fixtures are young: the session fails at its start, saying so, when the Clusters of the
// fixtures were created more than 25 minutes before it (SPEC-0004, "Notes and deviations").

import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyObjects, openDefinitions, removeObjects } from "../../e2e/scripts/commands.mts";
import { FIXTURE_RESOURCES, FIXTURES_FOLDER, readFixtureSet } from "../../e2e/scripts/fixtures.mts";
import { statesOf } from "../../e2e/scripts/states.mts";
import {
  appReady,
  connectApp,
  disconnectKindCluster,
  extensionPageAddress,
  hostLists,
  installExtension,
  navigateCluster,
  openKindCluster,
  recordRequests,
  selectNamespaces,
} from "./extension-helpers";
import { LARGE_NAMESPACE, largeCluster } from "./large-cluster";
import {
  accessibilityOfTree,
  expansionProblems,
  firstDrawProblems,
  firstInView,
  keyEffect,
  lineProblems,
  linesOf,
  marksProblems,
  moveScrollProblem,
  partsProblems,
  removalScroll,
  rowsLost,
  waitingReads,
  wholeInView,
  writesOfTheFrame,
} from "./tree-checks";
import {
  CREATED_CHILD,
  CREATED_MACHINE,
  CREATED_ROW,
  createdMachine,
  EXPECTED_MARKS,
  EXPECTED_TREES,
  FIRST_EXPANSIONS,
  LIVE_NAMESPACE,
  NOT_READY,
  NOT_READY_COUNTS,
  NOT_READY_WORKER,
  outlineRows,
  PAUSED_COUNTS,
  PAUSED_WORKER,
  ROLLING_OUT_SEARCHES,
  TREE_CLUSTERS,
} from "./tree-expectations";
import { outlineOfRows, outlineTextOf } from "./tree-outline";
import {
  accessibilityTreeOf,
  activeOf,
  activeRecords,
  allMarksCells,
  allRows,
  answersOf,
  detailsOf,
  drawnRecords,
  drawnRows,
  expandAll,
  firstDrawOf,
  listMetrics,
  listOf,
  openTree,
  ROW_HEIGHT,
  recordActive,
  recordDrawn,
  recordFirstDraw,
  rendered,
  rowOf,
  scrollListTo,
  settledRows,
  TREE_PAGE,
  titleOf,
  tooltipLines,
  treeAddress,
  treeOf,
  until,
  wheel,
} from "./tree-page";

import type { Frame, Locator } from "playwright";

import type { DefinitionsSession } from "../../e2e/scripts/commands.mts";
import type { AppSession } from "./extension-helpers";
import type { MeasuredCell, ShownRow } from "./tree-checks";
import type { OutlineRow } from "./tree-expectations";
import type { DrawnRow } from "./tree-page";

const viewTimeout = { timeout: 60 * 1000 };
const VIEWPORT = { width: 1280, height: 900 };
const NARROW = { width: 1024, height: 900 };

// The minutes after the apply of the fixtures within which step 1 holds.
const WINDOW_MINUTES = 25;

// The titles of the columns of the tree, in their order (P9).
const TITLES = ["Name", "Replicas", "Version", "Activity", "Condition", "Status", "Age"];

// The left edge of the drawer of the host in a frame 1205 px wide, as the probe measured it (H19).
const DRAWER_LEFT = 480;

// A cell of a row of step 1, 1024 px wide, as the frame measures it: what the check of one line reads, and, for the
// record, its scroll height, its client height and the height of the element of its content.
interface LaidOutCell extends MeasuredCell {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly contentHeight: number;
}

// A row of step 1, 1024 px wide: its height, its cells, whether its name is cut and with an ellipsis, and the columns
// of state under their minimum width.
interface RowLayout {
  readonly height: number;
  readonly cells: readonly LaidOutCell[];
  readonly cut: boolean;
  readonly ellipsis: boolean;
  readonly narrow: readonly string[];
}

const states = statesOf(["all"]);
const namespaces = states.map((state) => state.namespace);
const repository = path.resolve(import.meta.dirname, "..", "..");
const folder = process.env.TEST_SCREENSHOTS_DIR || undefined;

// The namespace and the name of the Cluster of a state.
function clusterOf(state: string): { namespace: string; name: string } {
  const found = states.find((each) => each.name === state);

  if (found === undefined) throw new Error(`No state ${state}`);
  return { namespace: found.namespace, name: TREE_CLUSTERS[state] };
}

function outlineText(rows: readonly OutlineRow[]): string {
  return rows.map((row) => `${"  ".repeat(row.depth)}${row.text}`).join("\n");
}

// The cluster of the definitions through the scripts, which check it before every request; outside CI the session
// skips with a warning when it cannot reach it, in CI it fails instead.
async function open(): Promise<DefinitionsSession | undefined> {
  try {
    return await openDefinitions();
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn(
      `Skipping the session of the tree: the cluster of the definitions cannot be reached through the scripts: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
}

const definitions = (await appReady({ cluster: true, namespace: clusterOf("healthy").namespace }))
  ? await open()
  : undefined;

describe.skipIf(definitions === undefined)("the tree of a Cluster", () => {
  const cluster = definitions as DefinitionsSession;
  let session: AppSession | undefined;
  let frame: Frame | undefined;
  let recorder: ReturnType<typeof recordRequests> | undefined;
  let before: Map<string, string> | undefined;
  // The version that each write of the session itself gave an object, by kind, namespace and name.
  const ownWrites = new Map<string, string>();
  // What the session wrote and did not undo yet, by what it is, with how to undo it, which its end runs.
  const pending = new Map<string, () => void>();

  function opened(): { session: AppSession; frame: Frame } {
    if (!session || !frame) throw new Error("The cluster is not open");
    return { session, frame };
  }

  // The version of an object of the cluster of the definitions, empty when it is not there.
  function versionOf(resource: string, namespace: string, name: string): string {
    return cluster
      .kubectl([
        "get",
        resource,
        name,
        "--namespace",
        namespace,
        "--ignore-not-found",
        "--output",
        "jsonpath={.metadata.resourceVersion}",
      ])
      .trim();
  }

  // Records the version that the answer to a write of the session gave an object, which a write always changes: one
  // recorded as it was before would make the check of "Safety" take the write of the session for one of the frame.
  function recordWrite(key: string, previous: string, version: string, what: string) {
    if (version === "" || version === previous) {
      throw new Error(
        `${what} gave the version ${version || "(none)"}, which it had before the write: the session cannot record its own write`,
      );
    }
    ownWrites.set(key, version);
  }

  // The version of every object of the fixtures, by kind, namespace and name, one object a line.
  function versionsOfFixtures(): Map<string, string> {
    const listed = cluster.kubectl([
      "get",
      FIXTURE_RESOURCES.join(","),
      "--all-namespaces",
      "--output",
      'jsonpath={range .items[*]}{.kind}{"\\t"}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\t"}{.metadata.resourceVersion}{"\\n"}{end}',
    ]);

    return new Map(
      listed
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => line.split("\t"))
        .filter(([, namespace]) => namespaces.includes(namespace ?? ""))
        .map(([kind, namespace, name, version]) => [`${kind}/${namespace}/${name}`, version ?? ""]),
    );
  }

  // Takes a screenshot of the root window into the folder of the screenshots, when there is one.
  async function shot(name: string) {
    if (folder === undefined) return;

    const file = path.join(folder, `tree-${name}.png`);

    await opened().session.window.screenshot({ path: file });
    console.log(`screenshot ${file}`);
  }

  // Waits until a drawer of the host has ended its slide, its right edge at the right edge of the frame.
  async function slid(drawer: Locator) {
    await until("the drawer to end its slide", () =>
      drawer.evaluate(
        (element) => Math.abs(element.getBoundingClientRect().right - document.documentElement.clientWidth) <= 0.5,
      ),
    );
    await rendered(drawer);
  }

  // The address of the frame as the page of the tree reads it (P2), and the details of the host.
  function addressOf(): { page: string; cluster: string | null; details: string; kubeDetails: string } {
    const url = new URL(opened().frame.url());

    return {
      page: url.pathname,
      cluster: url.searchParams.get("cluster"),
      details: url.searchParams.get("details") ?? "",
      kubeDetails: url.searchParams.get("kube-details") ?? "",
    };
  }

  // The drawer that shows at the middle of the details of a node: theirs, or those of the host over them.
  function drawerOnTop(): Promise<string> {
    return opened().frame.evaluate(() => {
      const own = document.querySelector('[data-testid="capi-tree-details"]');

      if (!own) return "none";

      const box = own.getBoundingClientRect();
      const shown = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest(".Drawer");

      if (shown === own) return "extension";
      return shown?.classList.contains("KubeObjectDetails") ? "host" : "other";
    });
  }

  // The details of a node, once their title names it.
  async function detailsShow(title: string): Promise<Locator> {
    const drawer = detailsOf(opened().frame);

    await until(`the details of ${title}`, async () => (await titleOf(drawer)) === title);
    return drawer;
  }

  async function detailsClosed() {
    await until("the details of the node to close", async () => (await titleOf(detailsOf(opened().frame))) === null);
  }

  // The row of the outline text among the rows read.
  function rowWith(rows: readonly DrawnRow[], text: string): DrawnRow {
    const found = rows.filter((row) => outlineTextOf(row) === text);

    if (found.length !== 1) throw new Error(`${found.length} rows are ${text}`);
    return found[0];
  }

  // Clicks the name of the row of a node, as a user opens its details (P15).
  async function clickName(tree: Locator, id: string) {
    await rowOf(tree, id).getByTestId("capi-tree-name-button").click();
  }

  // The rows that the list draws, in the order of their places.
  async function sortedRows(tree: Locator): Promise<DrawnRow[]> {
    return (await drawnRows(tree)).sort((one, other) => one.index - other.index);
  }

  // The rows that the list draws, in their order, as the keys of P18 move among them.
  async function shownRows(tree: Locator): Promise<ShownRow[]> {
    return (await sortedRows(tree)).map((row) => ({ id: row.id, level: row.level, expanded: row.expanded }));
  }

  // The top and the bottom of the row of a node in the window of the list, when the list draws it.
  async function placeOf(tree: Locator, id: string): Promise<{ top: number; bottom: number } | undefined> {
    const row = (await drawnRows(tree)).find((each) => each.id === id);

    return row === undefined ? undefined : { top: row.top, bottom: row.bottom };
  }

  // The search of the page, in its header.
  function searchOf(): Locator {
    return opened().frame.getByTestId("capi-tree-page").locator('input[placeholder^="Search"]');
  }

  beforeAll(async () => {
    const { namespace, name } = clusterOf("healthy");
    const created = Date.parse(
      cluster.kubectl([
        "get",
        "clusters.v1beta2.cluster.x-k8s.io",
        name,
        "--namespace",
        namespace,
        "--output",
        "jsonpath={.metadata.creationTimestamp}",
      ]),
    );
    const minutes = (Date.now() - created) / 60000;

    if (!(minutes <= WINDOW_MINUTES)) {
      throw new Error(
        `The fixtures were applied ${Math.round(minutes)} minutes ago: step 1 holds for ${WINDOW_MINUTES} minutes after the apply. Apply them again with pnpm e2e:fixtures:up all`,
      );
    }
    // A namespace of the large Cluster that a run that was killed left.
    removeObjects(cluster, LARGE_NAMESPACE);
    if (folder !== undefined) mkdirSync(folder, { recursive: true });
    before = versionsOfFixtures();
    session = await connectApp();
    await session.window.setViewportSize(VIEWPORT);
    recorder = recordRequests(session.window);
    await installExtension(session);
    frame = await openKindCluster(session);
  }, 300 * 1000);

  afterAll(async () => {
    // Every step of the end runs whatever failed before it: the writes that a part could not undo are undone, the
    // namespace of the large Cluster removed, the cluster disconnected and the connection closed; what failed is thrown
    // once the end is done.
    const failures: unknown[] = [];
    const attempt = async <T>(step: () => T | Promise<T>, otherwise: T): Promise<T> => {
      try {
        return await step();
      } catch (error) {
        failures.push(error);
        return otherwise;
      }
    };
    const errors = await attempt(async () => (await session?.stopCollecting()) ?? [], [] as string[]);

    recorder?.stop();
    for (const [what, undo] of pending) {
      await attempt(() => {
        console.log(`the end of the session undoes ${what}`);
        undo();
      }, undefined);
    }
    await attempt(() => removeObjects(cluster, LARGE_NAMESPACE), undefined);
    if (session) {
      const app = session;

      await attempt(() => disconnectKindCluster(app), undefined);
      await attempt(() => app.close(), undefined);
    }

    const left = await attempt(
      () => [
        ...(versionOf("machines.v1beta2.cluster.x-k8s.io", LIVE_NAMESPACE, CREATED_MACHINE) === ""
          ? []
          : [`Machine ${LIVE_NAMESPACE}/${CREATED_MACHINE}`]),
        ...cluster
          .kubectl(["get", "namespace", LARGE_NAMESPACE, "--ignore-not-found", "--output", "name"])
          .split("\n")
          .filter((line) => line.length > 0),
      ],
      [] as string[],
    );

    await attempt(() => cluster.close(), undefined);

    const failed = [
      ...(errors.length === 0 ? [] : [`The app logged errors:\n${errors.join("\n")}`]),
      ...(left.length === 0 ? [] : [`The session left:\n${left.join("\n")}`]),
      ...failures.map(
        (failure) => `The end of the session failed: ${failure instanceof Error ? failure.message : String(failure)}`,
      ),
    ];

    if (failed.length > 0) {
      throw new Error(
        `${failed.length === 1 ? "A check" : `${failed.length} checks`} at the end of the session failed:\n\n${failed.join("\n\n")}`,
      );
    }
  }, 600 * 1000);

  it("applies the theme and the variant that the profile names, in the root frame and in that of the cluster (the theme)", async () => {
    const { session, frame } = opened();
    const theme = process.env.TEST_THEME || undefined;
    const variant = process.env.TEST_THEME_VARIANT || undefined;

    if (theme === undefined && variant === undefined) {
      console.log("TEST_THEME and TEST_THEME_VARIANT are not set: the theme is not checked");
      return;
    }
    for (const [where, page] of [
      ["the root frame", session.window],
      ["the frame of the cluster", frame],
    ] as const) {
      const active = await page.evaluate(() => {
        const current = globalThis.FreelensExtensionApi.Renderer?.Theme.activeTheme.get();

        return {
          name: current?.name,
          type: current?.type,
          light: document.body.classList.contains("theme-light"),
        };
      });

      console.log(`${where}: the theme ${active.name}, ${active.type}`);
      if (theme !== undefined) expect(active.name, where).toBe(theme);
      if (variant !== undefined) expect(active.type, where).toBe(variant);
      expect(active.light, where).toBe(active.type === "light");
    }
  });

  it(
    "shows the tree of the Cluster of every state, every node a row under its node at its depth, with the marks that SPEC-0003 gives its objects and the parts of each cell of marks apart; and, 1024 px wide, rows of one line whose names show whole or cut and whole in their tooltip, the columns of state at their minimum width (1; P7, P9, P12, P14)",
    async () => {
      const { session, frame } = opened();
      const problems: string[] = [];

      for (const state of states) {
        const { namespace, name } = clusterOf(state.name);
        const tree = await openTree(frame, namespace, name);

        await expandAll(tree);

        const rows = await settledRows(tree);
        const outline = outlineOfRows(rows);
        const expected = outlineRows(EXPECTED_TREES[state.name]);

        if (new Set(rows.map((row) => row.id)).size !== rows.length) problems.push(`${state.name}: a node in two rows`);
        if (JSON.stringify(outline) !== JSON.stringify(expected)) {
          problems.push(`${state.name}: the rows are\n${outlineText(outline)}\nexpected\n${outlineText(expected)}`);
        }
        problems.push(...marksProblems(rows, EXPECTED_MARKS[state.name]).map((problem) => `${state.name}: ${problem}`));
        // The parts of each cell of marks, its marks, its notes and its spinners, each apart from the one before it.
        problems.push(...partsProblems(await allMarksCells(tree)).map((problem) => `${state.name}: ${problem}`));
        if (["rolling-out", "deleting", "no-status"].includes(state.name)) {
          await scrollListTo(tree, 0);
          await shot(`${state.name}-expanded`);
        }
      }
      expect(problems).toEqual([]);

      // 1024 px wide, the tree of rolling-out with every node expanded, from its top and from its end.
      await session.window.setViewportSize(NARROW);
      try {
        const { namespace, name } = clusterOf("rolling-out");
        const tree = await openTree(frame, namespace, name);

        await expandAll(tree);

        const layout = new Map<string, RowLayout>();
        // Each row drawn: its height; each cell measured by the lines of its texts and the boxes of its elements, with
        // its scroll height and its client height and the height of the element of its content, for the record; whether
        // its name is cut, by its badge or by its button, with an ellipsis; and the columns of state under their minimum
        // width.
        const readLayout = () =>
          tree.evaluate(
            (element, columns) => {
              const found: [string, RowLayout][] = [];

              for (const row of element.querySelectorAll<HTMLElement>('[role="row"][aria-level]')) {
                const box = row.getBoundingClientRect();
                const cells = [...row.querySelectorAll<HTMLElement>(':scope > [role="gridcell"]')];
                const name = row.querySelector<HTMLElement>('[data-testid="capi-tree-name"]');
                const button = row.querySelector<HTMLElement>('[data-testid="capi-tree-name-button"]');
                const cutBy = [name, button].filter(
                  (part): part is HTMLElement => part !== null && part.scrollWidth > part.clientWidth + 0.5,
                );
                const measure = (cell: HTMLElement, at: number) => {
                  const content = cell.querySelector<HTMLElement>("[data-testid]");
                  const texts: { top: number; height: number }[][] = [];
                  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);

                  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
                    if ((node.textContent ?? "").trim() === "") continue;

                    const range = document.createRange();

                    range.selectNodeContents(node);
                    texts.push(
                      [...range.getClientRects()]
                        .filter((rect) => rect.width > 0 && rect.height > 0)
                        .map((rect) => ({ top: rect.top, height: rect.height })),
                    );
                  }

                  const beyond = [...cell.querySelectorAll<Element>("*")].find((part) => {
                    const bounds = part.getBoundingClientRect();

                    return (
                      bounds.width > 0 &&
                      bounds.height > 0 &&
                      (bounds.top < box.top - 0.5 || bounds.bottom > box.bottom + 0.5)
                    );
                  });

                  return {
                    testId: content?.getAttribute("data-testid") ?? `cell ${at + 1}`,
                    text: ((content ?? cell).textContent ?? "").trim(),
                    texts,
                    beyond:
                      beyond === undefined
                        ? null
                        : `${beyond.tagName.toLowerCase()} "${beyond.getAttribute("class") ?? ""}", ${beyond.getBoundingClientRect().top - box.top} to ${beyond.getBoundingClientRect().bottom - box.top} px of a row of ${box.height} px`,
                    scrollHeight: cell.scrollHeight,
                    clientHeight: cell.clientHeight,
                    contentHeight: content?.getBoundingClientRect().height ?? 0,
                  };
                };

                found.push([
                  row.id,
                  {
                    height: box.height,
                    cells: cells.map(measure),
                    cut: cutBy.length > 0,
                    ellipsis: cutBy.every((part) => getComputedStyle(part).textOverflow === "ellipsis"),
                    narrow: columns
                      .filter(
                        (column) =>
                          cells[column] === undefined ||
                          cells[column].getBoundingClientRect().width + 0.5 <
                            Number.parseFloat(getComputedStyle(cells[column]).minWidth),
                      )
                      .map((column) => String(column)),
                  },
                ]);
              }
              return found;
            },
            [3, 4, 5],
          );

        for (const [id, row] of await readLayout()) layout.set(id, row);

        // For the record, the cells of the first row, the Cluster: those of the marks of state stand into the padding of
        // their cell, on one line, which their scroll height counts ("Notes and deviations").
        const [rootId, root] = [...layout][0] ?? [];

        if (root !== undefined) {
          console.log(
            `1024 px wide, the cells of ${rootId}: ${root.cells
              .map(
                (cell) =>
                  `${cell.testId}, its content ${cell.contentHeight.toFixed(1)} px high, scroll height ${cell.scrollHeight} of ${cell.clientHeight}, ${Math.max(0, ...cell.texts.map(linesOf))} line`,
              )
              .join("; ")}`,
          );
        }
        await scrollListTo(tree, (await listMetrics(tree)).scrollHeight);
        for (const [id, row] of await readLayout()) layout.set(id, row);

        const rows = await allRows(tree);
        const lineFaults: string[] = [];

        expect(rows.map((row) => row.id).sort()).toEqual(
          [...layout.keys()].map((id) => id.replace(/^capi-tree-row-/, "")).sort(),
        );
        for (const [id, row] of layout) {
          if (Math.abs(row.height - ROW_HEIGHT) > 0.5) lineFaults.push(`${id}: a row of ${row.height} px, not 33`);
          lineFaults.push(...lineProblems(id, row.cells));
          if (row.narrow.length > 0) {
            lineFaults.push(`${id}: the columns of state ${row.narrow.join(", ")} under their minimum width`);
          }
          if (row.cut && !row.ellipsis) lineFaults.push(`${id}: a name cut with no ellipsis`);
        }
        expect(lineFaults).toEqual([]);
        // A name that its cell cuts is whole in its tooltip, with the role of an object of a provider.
        for (const row of rows) {
          if (layout.get(`capi-tree-row-${row.id}`)?.cut !== true) continue;

          const lines = await tooltipLines(frame, session.window, rowOf(tree, row.id).getByTestId("capi-tree-name"));

          expect(lines[0], row.id).toBe(row.role === null ? row.name : `${row.name}, ${row.role}`);
        }
        console.log(
          `1024 px wide: ${[...layout.values()].filter((row) => row.cut).length} of ${layout.size} names cut, each whole in its tooltip`,
        );
      } finally {
        await session.window.setViewportSize(VIEWPORT);
      }
      expect(await session.errors()).toEqual([]);
    },
    900 * 1000,
  );

  it(
    "opens healthy, rolling-out and deleting with the expansion at first and the counts of each node, and draws no row before the answers to the lists of the page have arrived (2; P11, P13)",
    async () => {
      const { session, frame } = opened();
      const problems: string[] = [];

      for (const state of Object.keys(FIRST_EXPANSIONS)) {
        const { namespace, name } = clusterOf(state);
        const tree = await openTree(frame, namespace, name, { before: () => recordFirstDraw(frame) });
        const rows = await settledRows(tree);
        const { first, answers } = await firstDrawOf(frame);

        problems.push(...expansionProblems(rows, FIRST_EXPANSIONS[state]).map((problem) => `${state}: ${problem}`));
        problems.push(
          ...firstDrawProblems(
            first,
            rows.map((row) => ({ id: row.id, expanded: row.expanded })),
            answers,
            namespace,
          ).map((problem) => `${state}: ${problem}`),
        );
        console.log(
          `${state}: the first ${first?.rows.length ?? 0} rows drawn at ${first?.at.toFixed(1)} ms, after ${answers.length} answers recorded`,
        );
        if (state === "deleting") await shot("deleting-not-found");
      }
      expect(problems).toEqual([]);
      expect(await session.errors()).toEqual([]);
    },
    300 * 1000,
  );

  it(
    "opens the tree from the row Tree of the details of a Cluster and from its reference to its control plane, at that node with its details, and from the panel in the details of the host, which close; one Back brings the details of the Cluster again (3; P3, P5)",
    async () => {
      const { session, frame } = opened();
      const { namespace, name } = clusterOf("healthy");
      const fixture = readFixtureSet(path.join(repository, FIXTURES_FOLDER, "healthy")).find(
        (object) => object.kind === "Cluster",
      );
      const reference = (fixture?.spec as { controlPlaneRef?: { apiGroup: string; kind: string; name: string } })
        ?.controlPlaneRef;

      if (reference === undefined) throw new Error("The Cluster of healthy names no control plane");

      const node = `${reference.apiGroup}/${reference.kind}/${reference.name}`;
      const clustersPage = extensionPageAddress("clusters");
      const clusterDetails = frame.getByTestId("capi-cluster-details");
      const hostDetails = frame.locator(".KubeObjectDetails");
      const treeDetails = detailsOf(frame);
      const selfLink = `/apis/cluster.x-k8s.io/v1beta2/namespaces/${namespace}/clusters/${name}`;
      const treeShows = async (details: string) => {
        await until("the page of the tree", async () => addressOf().page === TREE_PAGE);
        expect(addressOf()).toMatchObject({ cluster: `${namespace}/${name}`, details, kubeDetails: "" });
        await frame.getByTestId("capi-tree-title").waitFor(viewTimeout);
        expect(await frame.getByTestId("capi-tree-title").textContent()).toBe(`Cluster Tree: ${name}, ${namespace}`);
        await treeOf(frame).waitFor(viewTimeout);
      };
      const openClusterDetails = async () => {
        await navigateCluster(frame, `${clustersPage}?details=${encodeURIComponent(`${namespace}/${name}`)}`);
        await until("the details of the Cluster", async () => (await titleOf(clusterDetails)) === `Cluster: ${name}`);
        await clusterDetails.getByTestId("capi-details-section-tree").waitFor(viewTimeout);
      };
      const openPanel = async () => {
        await hostLists(frame, { group: "cluster.x-k8s.io", plural: "clusters" }, namespace, [name]);
        await navigateCluster(frame, `?kube-details=${encodeURIComponent(selfLink)}`);
        await hostDetails
          .getByTestId("capi-cluster-details-view")
          .getByTestId("capi-details-section-tree")
          .waitFor(viewTimeout);
      };

      // The address of the frame, with its parameters, and the length of the history of its window.
      const whereFrameIs = async () => {
        const url = new URL(frame.url());

        return `${url.pathname}${url.search}, the history ${await frame.evaluate(() => window.history.length)} entries long`;
      };

      await selectNamespaces(frame, [namespace]);

      // The row Tree of the details of the extension opens the tree of the Cluster, with no details, in one entry of the
      // history; one Back brings the details of the Cluster again, its list holding no search. The addresses of the
      // frame before the click, after it and after the Back are logged, whatever the step finds.
      await openClusterDetails();

      const beforeClick = await whereFrameIs();
      let afterClick = "not read";

      try {
        await clusterDetails.getByTestId("capi-details-open-tree").click();
        await treeShows("");
        afterClick = await whereFrameIs();
        expect(await titleOf(treeDetails)).toBeNull();
        expect(await clusterDetails.count()).toBe(0);
        await frame.evaluate(() => window.history.back());
        await until(
          "the details of the Cluster after one Back",
          async () => (await titleOf(clusterDetails)) === `Cluster: ${name}`,
        );
      } finally {
        console.log(
          `the way back from the row Tree: the frame at ${beforeClick} before the click, at ${afterClick} after it, and at ${await whereFrameIs().catch(() => "no address")} after one Back`,
        );
      }
      expect(new URL(frame.url()).pathname).toBe(clustersPage);
      expect(new URL(frame.url()).searchParams.get("details")).toBe(`${namespace}/${name}`);

      // Its reference to its control plane opens the tree at that node, with its details.
      await clusterDetails.getByTestId("capi-details-section-tree").waitFor(viewTimeout);
      await clusterDetails.getByTestId("capi-details-control-plane-reference").getByRole("button").click();
      await treeShows(node);
      await detailsShow(`${reference.kind}: ${reference.name}`);
      await treeDetails.getByTestId("capi-node-details").waitFor(viewTimeout);

      // The same from the panel in the details of the host, which close.
      await openPanel();
      await hostDetails.getByTestId("capi-cluster-details-view").getByTestId("capi-details-open-tree").click();
      await treeShows("");
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await openPanel();
      await hostDetails
        .getByTestId("capi-cluster-details-view")
        .getByTestId("capi-details-control-plane-reference")
        .getByRole("button")
        .click();
      await treeShows(node);
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await detailsShow(`${reference.kind}: ${reference.name}`);
      expect(await session.errors()).toEqual([]);
    },
    300 * 1000,
  );

  it(
    "opens the details of a node over the page and the dock, keeps the names in view, closes them on Escape and on their icon with the focus on the tree, and opens the details of the host of an object of a provider over them (4; P5, P15, P17)",
    async () => {
      const { session, frame } = opened();
      const keyboard = session.window.keyboard;
      const { namespace, name } = clusterOf("healthy");
      const tree = await openTree(frame, namespace, name);
      const hostDetails = frame.locator(".KubeObjectDetails");
      const noHostDetails = async () => {
        expect(await hostDetails.count()).toBe(0);
        expect(addressOf().kubeDetails).toBe("");
      };

      await expandAll(tree);

      const rows = await settledRows(tree);
      const plane = rowWith(rows, "KubeadmControlPlane freelens-capi-healthy-d2lgq");
      const machine = rowWith(rows, "Machine freelens-capi-healthy-d2lgq-zqlcx");
      const devMachine = rowWith(rows, `DevMachine ${PAUSED_WORKER} (infrastructure machine)`);
      const healthChecks = rowWith(rows, "Health checks");

      // A click on a row opens its details, over the page and the dock, from 480 px of the frame, the names of the
      // tree in view; no node of Cluster API opens those of the host.
      await clickName(tree, plane.id);

      const drawer = await detailsShow("KubeadmControlPlane: freelens-capi-healthy-d2lgq");

      await slid(drawer);
      await noHostDetails();

      const box = await drawer.evaluate((element) => {
        const bounds = element.getBoundingClientRect();

        return {
          left: bounds.left,
          top: bounds.top,
          bottom: bounds.bottom,
          height: document.documentElement.clientHeight,
          atMiddle:
            document
              .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
              ?.closest('[data-testid="capi-tree-details"]') === element,
        };
      });

      expect(Math.abs(box.left - DRAWER_LEFT)).toBeLessThanOrEqual(1);
      expect(box.top).toBeLessThanOrEqual(0.5);
      expect(box.bottom).toBeGreaterThanOrEqual(box.height - 0.5);
      expect(box.atMiddle).toBe(true);
      expect(
        await tree.evaluate((element) =>
          [...element.querySelectorAll<HTMLElement>('[role="row"][aria-level]')]
            .filter((row) => {
              const list = element.querySelector(".VirtualList > .list")?.getBoundingClientRect();
              const bounds = row.getBoundingClientRect();

              return list !== undefined && bounds.top >= list.top && bounds.bottom <= list.bottom;
            })
            .filter((row) => {
              const name = row.querySelector('[data-testid="capi-tree-name"]')?.getBoundingClientRect();

              return (
                name === undefined ||
                !row.contains(document.elementFromPoint(name.left + 2, name.top + name.height / 2))
              );
            })
            .map((row) => row.id),
        ),
      ).toEqual([]);

      // A click on another row shows that node; a click on a virtual row leaves them as they are.
      await clickName(tree, machine.id);
      await detailsShow("Machine: freelens-capi-healthy-d2lgq-zqlcx");
      await noHostDetails();
      await rowOf(tree, healthChecks.id).getByTestId("capi-tree-name").click();
      await until(
        "Health checks to collapse",
        async () => (await rowOf(tree, healthChecks.id).getAttribute("aria-expanded")) === "false",
      );
      expect(await titleOf(drawer)).toBe("Machine: freelens-capi-healthy-d2lgq-zqlcx");
      expect(addressOf().details).toBe(machine.id);
      await rowOf(tree, healthChecks.id).getByTestId("capi-tree-name").click();
      await until(
        "Health checks to expand",
        async () => (await rowOf(tree, healthChecks.id).getAttribute("aria-expanded")) === "true",
      );

      // With the row of their node out of the window by the wheel, Escape closes them, brings the row into view, its
      // top at or under the top of the list, and leaves the focus on the element of the tree.
      await wheel(session.window, tree, 3000);
      expect((await placeOf(tree, machine.id))?.bottom ?? 0).toBeLessThanOrEqual(0.5);
      await keyboard.press("Escape");
      await detailsClosed();
      await until("the row of the details to come into view", async () => {
        const place = await placeOf(tree, machine.id);

        return place !== undefined && wholeInView(place, (await listMetrics(tree)).clientHeight);
      });
      expect((await activeOf(tree)).focused).toBe(true);

      // The close icon, which holds the focus as it is clicked and goes with them, closes them with the focus on the
      // element as well (H11).
      await clickName(tree, machine.id);
      await detailsShow("Machine: freelens-capi-healthy-d2lgq-zqlcx");
      await frame.getByTestId("capi-tree-details-close").click();
      await detailsClosed();
      await until("the focus on the tree", async () => (await activeOf(tree)).focused);

      // The details of a DevMachine link to the details of the host of the object, at a version of the contract label
      // of its definition, which open over them; the close icon of the host shows those of the tree again, and one
      // Escape closes both.
      const definition = JSON.parse(
        cluster.kubectl([
          "get",
          "customresourcedefinitions.apiextensions.k8s.io",
          "devmachines.infrastructure.cluster.x-k8s.io",
          "--output",
          "json",
        ]),
      ) as { metadata: { labels?: Record<string, string> } };
      const versions = (definition.metadata.labels?.["cluster.x-k8s.io/v1beta2"] ?? "").split("_");
      const openHostDetails = async () => {
        await clickName(tree, devMachine.id);
        await detailsShow(`DevMachine: ${PAUSED_WORKER}`);
        await drawer.getByTestId("capi-node-fact").filter({ hasText: "In Freelens" }).locator("a").click();
        await until(
          "the details of the host",
          async () => (await titleOf(hostDetails)) === `DevMachine: ${PAUSED_WORKER}`,
        );
        await until("the details of the host over those of the node", async () => (await drawerOnTop()) === "host");
      };

      await openHostDetails();

      const link = new RegExp(
        `^/apis/infrastructure\\.cluster\\.x-k8s\\.io/([^/]+)/namespaces/${namespace}/devmachines/${PAUSED_WORKER}$`,
      ).exec(addressOf().kubeDetails);

      expect(link, addressOf().kubeDetails).not.toBeNull();
      expect(versions).toContain(link?.[1]);
      expect(addressOf().details).toBe(devMachine.id);
      await hostDetails.locator('.drawer-title [data-icon-name="close"]').click();
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await until("the details of the node on top", async () => (await drawerOnTop()) === "extension");
      expect(await titleOf(drawer)).toBe(`DevMachine: ${PAUSED_WORKER}`);
      await drawer.getByTestId("capi-node-fact").filter({ hasText: "In Freelens" }).locator("a").click();
      await until("the details of the host over those of the node", async () => (await drawerOnTop()) === "host");
      await keyboard.press("Escape");
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await detailsClosed();

      // A click on a row while the details of the host are open closes them first and shows the details of that node.
      await openHostDetails();
      await clickName(tree, plane.id);
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await detailsShow("KubeadmControlPlane: freelens-capi-healthy-d2lgq");
      await noHostDetails();

      // With the details of the host over those of a node, an Escape in the empty search closes those of the host
      // alone, and a second one those of the node.
      await openHostDetails();
      await searchOf().focus();
      await keyboard.press("Escape");
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      expect(await titleOf(drawer)).toBe(`DevMachine: ${PAUSED_WORKER}`);
      await keyboard.press("Escape");
      await detailsClosed();
      expect(await session.errors()).toEqual([]);
    },
    300 * 1000,
  );

  it(
    "says in the place of the tree that no Cluster is named, that the address names none, that the Cluster is not in its namespace, and in the drawer that the tree holds no such node and that the address names no node (P19)",
    async () => {
      const { session, frame } = opened();
      const { namespace, name } = clusterOf("healthy");
      const missing = `${namespace}-nothing`;

      await navigateCluster(frame, TREE_PAGE);

      const none = frame.getByTestId("capi-tree-no-cluster");

      await none.waitFor(viewTimeout);
      expect(await none.textContent()).toContain(
        "This page shows the tree of one Cluster, which the details of that Cluster open, from their row Tree.",
      );
      await shot("no-cluster");
      await navigateCluster(frame, `${TREE_PAGE}?cluster=${encodeURIComponent(name)}`);

      const invalid = frame.getByTestId("capi-tree-invalid");

      await invalid.waitFor(viewTimeout);
      expect(await invalid.textContent()).toBe(
        `The address names no Cluster: the value of cluster is "${name}", which is not <namespace>/<name>.`,
      );
      await shot("address-with-no-cluster");
      await navigateCluster(frame, treeAddress(namespace, missing));

      const notFound = frame.getByTestId("capi-tree-not-found");

      await notFound.waitFor(viewTimeout);
      expect(await notFound.textContent()).toContain(
        `No Cluster ${namespace}/${missing} is in the namespace ${namespace}, which was read.`,
      );
      await shot("cluster-not-found");

      // The details of a node that the tree does not hold, and an address that names no node.
      const machine = `cluster.x-k8s.io/Machine/${missing}`;

      await openTree(frame, namespace, name, { details: machine });

      const absent = detailsOf(frame).getByTestId("capi-tree-details-absent");

      await absent.waitFor(viewTimeout);
      expect(await absent.textContent()).toBe(
        `No such object is in the tree of the Cluster ${namespace}/${name}, which was read: Machine ${missing}.`,
      );
      await slid(detailsOf(frame));
      await shot("details-of-no-node");
      await navigateCluster(frame, treeAddress(namespace, name, "nothing"));

      const noNode = detailsOf(frame).getByTestId("capi-tree-details-invalid");

      await noNode.waitFor(viewTimeout);
      expect(await noNode.textContent()).toBe(
        'The address names no object: the value of details is "nothing", which is not <group>/<Kind>/<name>, or <group>/<Kind>/<namespace>/<name> for a class in another namespace.',
      );
      expect(await titleOf(detailsOf(frame))).toBe("Details");
      expect(await session.errors()).toEqual([]);
    },
    240 * 1000,
  );

  it(
    "takes Tab and the keys of a tree on healthy with every node expanded, each move in view at the first frame that names it and the list moved by the moves of the page alone, and holds its rows as rows of a treegrid in the DOM and in the tree of accessibility (5; P16, P18)",
    async () => {
      const { session, frame } = opened();
      const keyboard = session.window.keyboard;
      const { namespace, name } = clusterOf("healthy");
      const tree = await openTree(frame, namespace, name);
      const planted = Boolean(process.env.TEST_PLANT_KEYS);
      let dropping: (() => Promise<void>) | undefined;

      await expandAll(tree);

      const rows = await settledRows(tree);
      const { clientHeight } = await listMetrics(tree);
      const windowRows = Math.max(1, Math.floor(clientHeight / ROW_HEIGHT));

      // 28 rows of 33 px, taller than the list (H1).
      expect(rows).toHaveLength(28);
      expect(rows.length * ROW_HEIGHT).toBeGreaterThan(clientHeight);

      // The roles of P18 in the DOM: the treegrid with its label, which owns the rows that the list draws, in their
      // order; each row with its id, its level and `aria-selected`, its cells gridcells; the header a row of
      // columnheaders.
      const roles = await tree.evaluate((element) => {
        const drawn = [...element.querySelectorAll<HTMLElement>('[role="row"][aria-level]')];
        const head = element.querySelector('.TableHead[role="row"]');

        return {
          role: element.getAttribute("role"),
          label: element.getAttribute("aria-label"),
          tabIndex: element.tabIndex,
          owns: element.getAttribute("aria-owns"),
          ids: drawn.map((row) => row.id),
          selected: drawn.every((row) => row.getAttribute("aria-selected") === "false"),
          cells: drawn.every(
            (row) =>
              [...row.children].length === 7 &&
              [...row.children].every((cell) => cell.getAttribute("role") === "gridcell"),
          ),
          head:
            head === null
              ? []
              : [...head.children].map((cell) => `${cell.getAttribute("role")} ${cell.textContent?.trim()}`),
        };
      });

      expect(roles).toMatchObject({
        role: "treegrid",
        label: `Tree of the Cluster ${name}`,
        tabIndex: 0,
        selected: true,
        cells: true,
      });
      expect(roles.owns).toBe(roles.ids.join(" "));
      expect(roles.head).toEqual(TITLES.map((title) => `columnheader ${title}`));

      // The tree of accessibility of the frame, read through CDP: each row drawn a row of the treegrid, at its level,
      // with its cells as gridcells, and the header a row of columnheaders.
      const accessibility = await accessibilityTreeOf(session.window, frame);
      const drawn = await drawnRows(tree);
      const read = accessibilityOfTree(
        accessibility.nodes,
        accessibility.domIds,
        drawn.map((row) => ({ id: `capi-tree-row-${row.id}`, level: row.level })),
        TITLES,
      );

      console.log(`the tree of accessibility: ${accessibility.nodes.length} nodes; ${read.list}`);
      expect(read.problems).toEqual([]);

      // Tab reaches the element of the tree from the search.
      await searchOf().click();
      for (let press = 0; press < 6 && !(await activeOf(tree)).focused; press++) await keyboard.press("Tab");
      expect((await activeOf(tree)).focused).toBe(true);
      if (planted) dropping = await dropKeyDefaults(frame);
      await recordActive(tree);

      let active = (await activeOf(tree)).active ?? rows[0].id;
      const problems: string[] = [];
      // On the tree of healthy with every node expanded: Down and Up, Right that goes to the first child of an expanded
      // node and expands a collapsed one, Left that goes to the node above a leaf and collapses an expanded node, Home,
      // End, Page Up and Page Down, each from where the keys before it left the active node.
      const keys = [
        "Home",
        "ArrowDown",
        "ArrowDown",
        "ArrowRight",
        "ArrowRight",
        "ArrowLeft",
        "ArrowLeft",
        "ArrowRight",
        "ArrowLeft",
        "ArrowLeft",
        "End",
        "PageUp",
        "ArrowUp",
        "PageUp",
        "PageDown",
        "Home",
        "PageDown",
        "End",
        "Home",
        "ArrowDown",
        "ArrowDown",
      ];

      try {
        for (const key of keys) {
          const shown = await shownRows(tree);
          const effect = keyEffect(shown, active, key, windowRows);
          const metricsBefore = await listMetrics(tree);
          const targetBefore = await placeOf(tree, effect.active);

          await keyboard.press(key);
          if (effect.toggles !== undefined) {
            await until(
              `${key} to ${effect.toggles === "expands" ? "expand" : "collapse"} ${effect.active}`,
              async () =>
                (await rowOf(tree, effect.active).getAttribute("aria-expanded")) ===
                (effect.toggles === "expands" ? "true" : "false"),
            );
          }
          await until(
            `${key} to make ${effect.active} active`,
            async () => (await activeOf(tree)).active === effect.active,
          );
          await rendered(tree);
          await rendered(tree);

          const metricsAfter = await listMetrics(tree);
          const problem = moveScrollProblem(
            key,
            effect,
            effect.active !== active,
            { scrollTop: metricsBefore.scrollTop, target: targetBefore },
            { scrollTop: metricsAfter.scrollTop, target: await placeOf(tree, effect.active) },
            metricsAfter.clientHeight,
          );
          const named = (await activeRecords(tree)).find((record) => record.active === effect.active);

          if (planted) {
            console.log(
              `with the default of the keys not prevented, ${key} from the element: the list from ${metricsBefore.scrollTop} to ${metricsAfter.scrollTop} px; ${problem ?? "moved by the moves of the page alone"}`,
            );
          } else if (problem !== undefined) {
            problems.push(problem);
          }
          if (effect.active !== active) {
            if (named === undefined) {
              problems.push(`${key}: no frame named ${effect.active}`);
            } else if (
              named.top === null ||
              named.bottom === null ||
              !wholeInView({ top: named.top, bottom: named.bottom }, named.viewHeight)
            ) {
              problems.push(
                `${key}: the first frame that named ${effect.active} had its row at ${named.top} px, out of view`,
              );
            }
          }
          if (!(await activeOf(tree)).focused) problems.push(`${key}: the element of the tree lost the focus`);
          active = effect.active;
        }
      } finally {
        await dropping?.();
      }
      expect(problems).toEqual([]);

      // Enter opens the details of the active node, and Escape closes them with the row of their node active.
      const worker = `cluster.x-k8s.io/Machine/${PAUSED_WORKER}`;
      const devMachine = `infrastructure.cluster.x-k8s.io/DevMachine/${PAUSED_WORKER}`;

      await clickName(tree, worker);
      await detailsShow(`Machine: ${PAUSED_WORKER}`);
      await keyboard.press("Escape");
      await detailsClosed();
      expect((await activeOf(tree)).active).toBe(worker);
      await keyboard.press("ArrowDown");
      await until(
        "the DevMachine of the worker to be active",
        async () => (await activeOf(tree)).active === devMachine,
      );
      await keyboard.press("Enter");
      await detailsShow(`DevMachine: ${PAUSED_WORKER}`);
      expect(addressOf().details).toBe(devMachine);
      expect(await rowOf(tree, devMachine).getAttribute("aria-selected")).toBe("true");
      await keyboard.press("Escape");
      await detailsClosed();
      expect(await session.errors()).toEqual([]);
    },
    300 * 1000,
  );

  it(
    "follows the cluster with no reload: an annotation that pauses a Machine expands nothing, a Machine created and deleted above the rows in view leaves them in place, a status changes the counts above it, and a refresh keeps every row drawn (6; P13, P14, P23)",
    async () => {
      const { session, frame } = opened();
      const { namespace, name } = clusterOf("healthy");
      const machines = "machines.v1beta2.cluster.x-k8s.io";
      const problems: string[] = [];

      expect(namespace).toBe(LIVE_NAMESPACE);

      // The annotation: Paused and stale, with no reload and nothing expanded; the user's expansions of the rows of
      // the worker stay as they are.
      let tree = await openTree(frame, namespace, name);
      const paused = `cluster.x-k8s.io/Machine/${PAUSED_WORKER}`;

      for (const id of [
        "virtual:workers",
        "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
        "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
      ]) {
        await rowOf(tree, id).getByTestId("capi-tree-expander").click();
        await until(`${id} to expand`, async () => (await rowOf(tree, id).getAttribute("aria-expanded")) === "true");
      }
      await tree.evaluate((element) => element.setAttribute("data-capi-session", "before"));

      const expansions = async () => (await allRows(tree)).map((row) => `${row.id} ${row.expanded}`);
      const beforeAnnotation = await expansions();
      const annotate = (value: string | null) =>
        cluster
          .kubectl([
            ...["patch", machines, PAUSED_WORKER, "--namespace", namespace, "--type", "merge"],
            ...["--patch", JSON.stringify({ metadata: { annotations: { "cluster.x-k8s.io/paused": value } } })],
            ...["--output", "jsonpath={.metadata.resourceVersion}"],
          ])
          .trim();
      const key = `Machine/${namespace}/${PAUSED_WORKER}`;

      pending.set(`the annotation of ${PAUSED_WORKER}`, () => {
        annotate(null);
      });
      try {
        recordWrite(key, versionOf(machines, namespace, PAUSED_WORKER), annotate(""), "The annotation of the session");
        await until("the worker to read Paused", async () => {
          const row = (await drawnRows(tree)).find((each) => each.id === paused);

          return row?.activities.map((mark) => mark.word).join(",") === "Paused" && row.stale;
        });
        expect(await expansions()).toEqual(beforeAnnotation);
        expect(await tree.getAttribute("data-capi-session")).toBe("before");

        const counted = Object.fromEntries(
          (await allRows(tree))
            .filter((row) => outlineTextOf(row) in PAUSED_COUNTS)
            .map((row) => [outlineTextOf(row), row.counts]),
        );

        expect(counted).toEqual(PAUSED_COUNTS);
      } finally {
        const previous = versionOf(machines, namespace, PAUSED_WORKER);

        recordWrite(key, previous, annotate(null), "The removal of the annotation of the session");
        pending.delete(`the annotation of ${PAUSED_WORKER}`);
      }

      // The Machine created above the rows in view, the tree with every node expanded and scrolled to its end: it is
      // the first row under the KubeadmControlPlane, collapsed, as a node that a watch adds comes (P13), with the counts
      // of its infrastructure machine, which is not found, and the first row in view keeps its place, by its id and its
      // top; then the Machine expanded shows that infrastructure machine; then, with the rows that go above the first
      // row in view and the list short of its end, the Machine deleted, and the first row in view keeps its place again.
      tree = await openTree(frame, namespace, name);
      await expandAll(tree);
      await scrollListTo(tree, (await listMetrics(tree)).scrollHeight);

      const planted = Boolean(process.env.TEST_PLANT_COMPENSATION);
      const inView = async () => {
        const first = firstInView(await drawnRows(tree));

        if (first === undefined) throw new Error("No row in view");
        return { id: first.id, top: Math.round(first.top) };
      };
      const dropped = planted ? await dropCompensation(tree) : undefined;
      const created = `cluster.x-k8s.io/Machine/${CREATED_MACHINE}`;
      const deleteCreated = () => {
        cluster.kubectl([
          ...["delete", machines, CREATED_MACHINE, "--namespace", namespace],
          ...["--ignore-not-found", "--wait", "--timeout", "120s"],
        ]);
      };

      pending.set(`the Machine ${CREATED_MACHINE}`, deleteCreated);
      try {
        const firstBefore = await inView();
        const listBefore = await listMetrics(tree);
        const version = cluster
          .kubectl(["create", "--output", "jsonpath={.metadata.resourceVersion}", "--filename", "-"], {
            input: JSON.stringify(createdMachine()),
          })
          .trim();

        recordWrite(`Machine/${namespace}/${CREATED_MACHINE}`, "", version, "The Machine of the session");
        await until("the Machine of the session to show", async () =>
          (await drawnRows(tree)).some((row) => row.id === created),
        );
        await rendered(tree);
        // The scroll, the height of the rows and that of the list before the Machine and once it shows: at the end of
        // the list the scroll moves by the row of the Machine, which the height of the rows makes room for.
        console.log(
          `the list before the Machine of the session ${JSON.stringify(listBefore)}, and once it shows ${JSON.stringify(await listMetrics(tree))}`,
        );

        const drawn = await sortedRows(tree);
        const at = drawn.findIndex((row) => row.id === created);
        const plane = drawn.findIndex(
          (row) => row.id === "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
        );

        // The row of the Machine alone: its place, its level, collapsed, and its counts.
        expect(at).toBe(plane + 1);
        expect(outlineTextOf(drawn[at])).toBe(CREATED_ROW.text);
        expect(drawn[at].level).toBe(drawn[plane].level + 1);
        expect(drawn[at].expanded).toBe(CREATED_ROW.expanded);
        expect(drawn[at].counts).toBe(CREATED_ROW.counts);
        // The row of the Machine sits above the first row in view, so that it is inserted above the view.
        expect(drawn[at].bottom).toBeLessThanOrEqual(0.5);
        if (JSON.stringify(await inView()) !== JSON.stringify(firstBefore)) {
          problems.push(
            `The first row in view was ${JSON.stringify(firstBefore)}, and ${JSON.stringify(await inView())} once the Machine of the session was created`,
          );
        }

        // Once the compensation is checked, the Machine expanded by its button, as a user expands it: its
        // infrastructure machine not found, a level under it. An expansion moves no row of its own (P13), so the
        // rows in view shift by that row, which no check reads.
        await rowOf(tree, created)
          .getByTestId("capi-tree-expander")
          .evaluate((button) => (button as HTMLElement).click());
        await until(
          `${created} to expand`,
          async () => (await rowOf(tree, created).getAttribute("aria-expanded")) === "true",
        );
        await rendered(tree);

        const expandedRows = await sortedRows(tree);
        const machineAt = expandedRows.findIndex((row) => row.id === created);

        expect(outlineTextOf(expandedRows[machineAt + 1])).toBe(CREATED_CHILD);
        expect(expandedRows[machineAt + 1].level).toBe(expandedRows[machineAt].level + 1);

        // The rows that go, the Machine and its infrastructure machine, above the first row in view, and the list short
        // of its end: at its end the browser keeps the scroll within the shorter list, which takes it back by the height
        // of the rows that go as the page does, and a page that moves nothing would pass.
        const { scrollHeight, clientHeight } = await listMetrics(tree);
        const target = removalScroll(
          expandedRows.slice(machineAt, machineAt + 2).map((row) => row.index),
          scrollHeight,
          clientHeight,
          ROW_HEIGHT,
        );

        if (target === undefined) {
          throw new Error(
            `The list of ${clientHeight} px cannot hold the rows that go above its view and stay short of its end: ${scrollHeight} px of rows`,
          );
        }
        await scrollListTo(tree, target);

        const firstUp = await inView();

        deleteCreated();
        if (versionOf(machines, namespace, CREATED_MACHINE) !== "")
          throw new Error("The Machine of the session is still there");
        pending.delete(`the Machine ${CREATED_MACHINE}`);
        await until(
          "the Machine of the session to go",
          async () => !(await drawnRows(tree)).some((row) => row.id === created),
        );
        await rendered(tree);
        if (JSON.stringify(await inView()) !== JSON.stringify(firstUp)) {
          problems.push(
            `The first row in view was ${JSON.stringify(firstUp)}, and ${JSON.stringify(await inView())} once the Machine of the session was deleted`,
          );
        }
      } finally {
        await dropped?.();
      }

      // The condition Ready False on another worker, through the status subresource: Unhealthy, and the counts above it,
      // with no node expanded and no row moved.
      const notReady = `cluster.x-k8s.io/Machine/${NOT_READY_WORKER}`;
      const object = JSON.parse(
        cluster.kubectl(["get", machines, NOT_READY_WORKER, "--namespace", namespace, "--output", "json"]),
      ) as {
        status: { conditions: Record<string, unknown>[] };
      };
      const at = object.status.conditions.findIndex((condition) => condition.type === NOT_READY.type);
      const original = object.status.conditions[at];
      const setCondition = (condition: Record<string, unknown>) =>
        cluster
          .kubectl([
            ...[
              "patch",
              machines,
              NOT_READY_WORKER,
              "--namespace",
              namespace,
              "--subresource",
              "status",
              "--type",
              "json",
            ],
            "--patch",
            JSON.stringify([
              { op: "test", path: `/status/conditions/${at}/type`, value: NOT_READY.type },
              { op: "replace", path: `/status/conditions/${at}`, value: condition },
            ]),
            ...["--output", "jsonpath={.metadata.resourceVersion}"],
          ])
          .trim();
      const statusKey = `Machine/${namespace}/${NOT_READY_WORKER}`;

      expect(at).toBeGreaterThanOrEqual(0);
      await scrollListTo(tree, 0);

      const rowsBefore = (await allRows(tree)).map((row) => `${row.id} ${row.index} ${row.expanded}`);
      const firstBeforeStatus = await inView();

      pending.set(`the condition Ready of ${NOT_READY_WORKER}`, () => {
        setCondition(original);
      });
      try {
        recordWrite(
          statusKey,
          versionOf(machines, namespace, NOT_READY_WORKER),
          setCondition({ ...original, ...NOT_READY }),
          "The status of the session",
        );
        await until("the worker to read Unhealthy", async () => {
          const row = (await allRows(tree)).find((each) => each.id === notReady);

          return row?.health?.word === "Unhealthy";
        });

        const rowsAfter = await allRows(tree);
        const counted = Object.fromEntries(
          rowsAfter
            .filter((row) => outlineTextOf(row) in NOT_READY_COUNTS)
            .map((row) => [outlineTextOf(row), row.counts]),
        );

        expect(counted).toEqual(NOT_READY_COUNTS);
        expect(rowsAfter.map((row) => `${row.id} ${row.index} ${row.expanded}`)).toEqual(rowsBefore);
        expect(await inView()).toEqual(firstBeforeStatus);
      } finally {
        recordWrite(
          statusKey,
          versionOf(machines, namespace, NOT_READY_WORKER),
          setCondition(original),
          "The undo of the status of the session",
        );
        pending.delete(`the condition Ready of ${NOT_READY_WORKER}`);
      }

      // The refresh reads the tree again; every row drawn before the click stays drawn until the answers to its lists
      // have arrived.
      await until("the worker to read Healthy again", async () => {
        const row = (await allRows(tree)).find((each) => each.id === notReady);

        return row?.health?.word === "Healthy";
      });

      const drawnBefore = (await drawnRows(tree)).map((row) => row.id);
      const sentBefore = recorder?.requests().length ?? 0;

      await recordDrawn(frame);

      const { now: clicked } = await answersOf(frame);

      await frame.getByTestId("capi-tree-refresh").click();
      await until("the answers to the lists of the refresh", async () => {
        const { answers } = await answersOf(frame);
        const { waiting, clusters } = waitingReads(
          recorder?.requests().slice(sentBefore) ?? [],
          answers,
          clicked,
          namespace,
        );

        return clusters && waiting.length === 0;
      });
      await rendered(tree);

      const lost = rowsLost(drawnBefore, await drawnRecords(frame));

      if (lost.length > 0) problems.push(`The refresh took away the rows ${lost.join(", ")}`);
      expect(problems).toEqual([]);
      expect(await session.errors()).toEqual([]);
    },
    480 * 1000,
  );

  it(
    "searches the words of the rows: the rows that match and those above them, the matches of their own words, the expansions back once cleared, no focus at the mount, and Escape clears it with the details open (7; P11, P15)",
    async () => {
      const { session, frame } = opened();
      const keyboard = session.window.keyboard;
      const { namespace, name } = clusterOf("rolling-out");
      const tree = await openTree(frame, namespace, name);
      const matches = frame.getByTestId("capi-tree-matches");

      // The search does not take the focus when the page opens.
      expect(await searchOf().evaluate((input) => input === document.activeElement)).toBe(false);

      const opening = outlineOfRows(await settledRows(tree));

      for (const search of ROLLING_OUT_SEARCHES) {
        await searchOf().fill(search.words);
        await until(
          `the matches of ${search.words}`,
          async () => (await matches.count()) > 0 && (await matches.textContent()) === `${search.matches} nodes match`,
        );
        expect(outlineOfRows(await settledRows(tree)), search.words).toEqual(outlineRows(search.outline));
      }
      await searchOf().fill("");
      await until("the search to be cleared", async () => (await matches.count()) === 0);
      expect(outlineOfRows(await settledRows(tree))).toEqual(opening);

      // An Escape in the search with words clears them and leaves the details open.
      const machine = "cluster.x-k8s.io/Machine/freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n";

      await clickName(tree, machine);

      const drawer = await detailsShow("Machine: freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n");

      await slid(drawer);
      await shot("rolling-out-machine-details");
      await searchOf().fill("Unhealthy");
      await until("the matches of Unhealthy", async () => (await matches.count()) > 0);
      await searchOf().focus();
      await keyboard.press("Escape");
      await until("the search to be cleared by Escape", async () => (await searchOf().inputValue()) === "");
      expect(await titleOf(drawer)).toBe("Machine: freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n");
      await frame.getByTestId("capi-tree-details-close").click();
      await detailsClosed();
      expect(await session.errors()).toEqual([]);
    },
    300 * 1000,
  );

  it.runIf(process.env.TEST_PLANT_WRITE)(
    "plants a write from the frame of the cluster, which the checks of Safety see (8)",
    async () => {
      const { namespace, name } = clusterOf("healthy");

      pending.set("the planted label", () => {
        cluster.kubectl([
          ...["patch", "clusters.v1beta2.cluster.x-k8s.io", name, "--namespace", namespace, "--type", "merge"],
          ...["--patch", JSON.stringify({ metadata: { labels: { "freelens-capi-planted": null } } })],
        ]);
      });
      await opened().frame.evaluate(
        async ({ namespace, name }) => {
          const api = globalThis.FreelensExtensionApi.Renderer?.K8sApi.apiManager.getApi(
            (item) => item.kind === "Cluster" && item.apiVersionWithGroup === "cluster.x-k8s.io/v1beta2",
          );

          await api?.patch(
            { name, namespace },
            { metadata: { labels: { "freelens-capi-planted": "write" } } },
            "merge",
          );
        },
        { namespace, name },
      );
    },
  );

  it("sends no request but a GET, a list or a watch, to the groups that the tree reads, and leaves every object of the fixtures at the version that it had or that a write of the session gave it (8; Safety)", () => {
    const writes = writesOfTheFrame(recorder?.requests() ?? []);
    const after = versionsOfFixtures();
    const changed = [...(before ?? new Map<string, string>())]
      .filter(([key, version]) => after.get(key) !== (ownWrites.get(key) ?? version))
      .map(([key]) => key);
    const failed = [
      ...(writes.length === 0
        ? []
        : [
            `The frame sent requests other than a GET:\n${writes.map((write) => `${write.method} ${write.url}`).join("\n")}`,
          ]),
      ...(changed.length === 0 ? [] : [`Objects of the fixtures changed their version:\n${changed.join("\n")}`]),
    ];

    console.log(`the check of Safety read ${recorder?.requests().length ?? 0} requests and ${after.size} objects`);
    expect(failed).toEqual([]);
  });

  describe("a large Cluster (9; P16, P22)", () => {
    const large = largeCluster(readFixtureSet(path.join(repository, FIXTURES_FOLDER, "healthy")));
    const machine = `cluster.x-k8s.io/Machine/${large.workers[199]}`;
    const machineSet = `cluster.x-k8s.io/MachineSet/${large.machineSet}`;
    const machineDeployment = `cluster.x-k8s.io/MachineDeployment/${large.machineDeployment}`;

    beforeAll(() => {
      const started = Date.now();

      applyObjects(cluster, LARGE_NAMESPACE, large.objects);
      console.log(
        `applied the ${large.objects.length} objects of the large Cluster in ${((Date.now() - started) / 1000).toFixed(1)} s`,
      );
    }, 180 * 1000);

    afterAll(async () => {
      const started = Date.now();

      // The frame leaves the tree first, so that its watches do not follow the deletion of every object.
      if (frame !== undefined) await navigateCluster(frame, TREE_PAGE).catch(() => undefined);
      removeObjects(cluster, LARGE_NAMESPACE);
      console.log(`deleted the large Cluster in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      expect(
        cluster.kubectl(["get", "namespace", LARGE_NAMESPACE, "--ignore-not-found", "--output", "name"]).trim(),
      ).toBe("");
    }, 240 * 1000);

    it(
      "opens the tree at its two hundredth Machine, whole in view with its details, draws far fewer rows than it shows, counts its MachineSet and its MachineDeployment, keeps the focus on the element while the wheel unmounts rows, and reaches Health checks with End, with no request that writes",
      async () => {
        const { session, frame } = opened();
        const keyboard = session.window.keyboard;
        const started = Date.now();
        const sentBefore = recorder?.requests().length ?? 0;
        const tree = await openTree(frame, LARGE_NAMESPACE, large.cluster, { details: machine });

        await (await detailsShow(`Machine: ${large.workers[199]}`))
          .getByTestId("capi-node-details")
          .waitFor(viewTimeout);

        // The row of the address shown whole, its top at or under the top of the list, with its details open, the
        // nodes above it expanded.
        await until("the row of the address whole in view", async () => {
          const place = await placeOf(tree, machine);

          return place !== undefined && wholeInView(place, (await listMetrics(tree)).clientHeight);
        });
        console.log(
          `the tree of the large Cluster opened at its two hundredth Machine in ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );

        const { scrollHeight } = await listMetrics(tree);
        const shown = Math.round(scrollHeight / ROW_HEIGHT);
        const drawn = (await drawnRows(tree)).length;

        // The rows that the table draws are far fewer than the nodes shown: 310, the rows of the expansion at first
        // with Workers, the MachineDeployment and the MachineSet expanded, and its 300 Machines.
        expect(shown).toBe(310);
        expect(drawn).toBeLessThan(shown / 4);
        console.log(`the large Cluster shows ${shown} rows, of which the table draws ${drawn}`);

        // The wheel takes the active row out of the drawn rows: the element keeps the focus and names no row, and the
        // next key move brings the row back.
        await frame.getByTestId("capi-tree-details-close").click();
        await detailsClosed();
        await until("the focus on the tree", async () => (await activeOf(tree)).focused);
        expect((await activeOf(tree)).active).toBe(machine);
        await wheel(session.window, tree, 2500);
        expect(await placeOf(tree, machine)).toBeUndefined();
        expect(await activeOf(tree)).toEqual({ active: null, focused: true });
        await keyboard.press("ArrowDown");

        const after = `cluster.x-k8s.io/Machine/${large.workers[200]}`;

        await until("the next Machine active and in view", async () => {
          const place = await placeOf(tree, after);

          return (
            (await activeOf(tree)).active === after &&
            place !== undefined &&
            wholeInView(place, (await listMetrics(tree)).clientHeight)
          );
        });

        // A click on a name, then the wheel that unmounts its row, leaves the focus on the element.
        const named = (await drawnRows(tree)).find(
          (row) => row.id.startsWith("cluster.x-k8s.io/Machine/") && row.top > ROW_HEIGHT,
        );

        if (named === undefined) throw new Error("No Machine in view to click");

        const restore = process.env.TEST_PLANT_FOCUS ? await focusTheName(tree) : undefined;

        try {
          await clickName(tree, named.id);
          await detailsShow(`Machine: ${named.id.split("/").slice(-1)[0]}`);
          await wheel(session.window, tree, -4000);
          expect(await placeOf(tree, named.id)).toBeUndefined();
          expect((await activeOf(tree)).focused).toBe(true);
        } finally {
          await restore?.();
        }
        await frame.getByTestId("capi-tree-details-close").click();
        await detailsClosed();
        await until("the focus on the tree", async () => (await activeOf(tree)).focused);

        // End reaches the last node shown, Health checks, with its row in view.
        await keyboard.press("End");
        await until("Health checks active and in view", async () => {
          const place = await placeOf(tree, "virtual:health-checks");

          return (
            (await activeOf(tree)).active === "virtual:health-checks" &&
            place !== undefined &&
            wholeInView(place, (await listMetrics(tree)).clientHeight)
          );
        });

        // The counts of the MachineSet and of the MachineDeployment, and the nodes above the address expanded.
        await scrollListTo(tree, 0);

        const top = await drawnRows(tree);
        const counts = (id: string) => top.find((row) => row.id === id);

        expect(counts(machineSet)?.counts).toBe("900 objects: 900 Healthy");
        expect(counts(machineDeployment)?.counts).toBe("903 objects: 901 Healthy, 2 with no health");
        for (const id of ["virtual:workers", machineDeployment, machineSet])
          expect(counts(id)?.expanded, id).toBe("true");

        // Every request of the frame meanwhile to the groups that the tree reads is a GET, a list or a watch.
        expect(writesOfTheFrame(recorder?.requests().slice(sentBefore) ?? [])).toEqual([]);
        console.log(`the step of the large Cluster took ${((Date.now() - started) / 1000).toFixed(1)} s`);
        expect(await session.errors()).toEqual([]);
      },
      300 * 1000,
    );
  });
});

// The planted runs

// Drops `preventDefault` of the keys of the tree, as a handler that does not prevent their default, until the
// returned function puts it back (TEST_PLANT_KEYS).
async function dropKeyDefaults(frame: Frame): Promise<() => Promise<void>> {
  await frame.evaluate(() => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End", "PageUp", "PageDown", "ArrowRight", "ArrowLeft"];
    const drop = (event: KeyboardEvent) => {
      if (keys.includes(event.key)) Object.defineProperty(event, "preventDefault", { value: () => undefined });
    };

    (globalThis as unknown as Record<string, unknown>).capiDropKeys = drop;
    document.addEventListener("keydown", drop, true);
  });
  return async () => {
    await frame.evaluate(() => {
      const store = globalThis as unknown as Record<string, ((event: KeyboardEvent) => void) | undefined>;
      const drop = store.capiDropKeys;

      if (drop !== undefined) document.removeEventListener("keydown", drop, true);
    });
  };
}

// Gives the list of the tree an own `scrollTop` that drops what is set, as a page with no compensation, until the
// returned function takes it away; the session scrolls through the setter of the element itself (TEST_PLANT_COMPENSATION).
async function dropCompensation(tree: Locator): Promise<() => Promise<void>> {
  await listOf(tree).evaluate((list) => {
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");

    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrollTop?.get?.call(list),
      set: () => undefined,
    });
  });
  return async () => {
    await listOf(tree).evaluate((list) => {
      delete (list as unknown as Record<string, unknown>).scrollTop;
    });
  };
}

// Lets the press of the mouse focus a name, and drops the focus that the click gives the element of the tree, as a
// page whose names hold the focus, until the returned function puts both back (TEST_PLANT_FOCUS).
async function focusTheName(tree: Locator): Promise<() => Promise<void>> {
  await tree.evaluate((element) => {
    const keep = (event: MouseEvent) => {
      Object.defineProperty(event, "preventDefault", { value: () => undefined });
    };

    (globalThis as unknown as Record<string, unknown>).capiKeepPress = keep;
    document.addEventListener("mousedown", keep, true);
    Object.defineProperty(element, "focus", { configurable: true, value: () => undefined });
  });
  return async () => {
    await tree.evaluate((element) => {
      const store = globalThis as unknown as Record<string, ((event: MouseEvent) => void) | undefined>;
      const keep = store.capiKeepPress;

      if (keep !== undefined) document.removeEventListener("mousedown", keep, true);
      delete (element as unknown as Record<string, unknown>).focus;
    });
  };
}
