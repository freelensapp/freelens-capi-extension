// What the sessions of the tree decide from what they read in the frame of a cluster (SPEC-0005, "Tests", "In
// Freelens"), with no app (`integration/__tests__/tree-checks.ts`): the marks and the expansion of the rows that the
// page draws for the fixtures, made here from its cells, against the expectations written by hand; the first rows
// against the answers to the lists; the effect of each key, written from the table of P18, against the handler of the
// page, and the scroll that a move leaves; the first row in view; the rows lost by a refresh; the tree of accessibility;
// and the requests that write.

import { describe, expect, it } from "vitest";
import {
  accessibilityOfTree,
  expansionProblems,
  firstDrawProblems,
  firstInView,
  keyEffect,
  marksProblems,
  moveScrollProblem,
  readsAGroupOfTheTree,
  rowsLost,
  waitingReads,
  wholeInView,
  writesOfTheFrame,
} from "../integration/__tests__/tree-checks";
import { EXPECTED_MARKS, FIRST_EXPANSIONS, TREE_CLUSTERS } from "../integration/__tests__/tree-expectations";
import { buildTree, indexTree } from "../src/common/views/cluster-tree";
import { keyAction, TREE_KEYS } from "../src/common/views/tree-keys";
import { rowsOf } from "../src/common/views/tree-rows";
import { CAPTURE, fixtureSet, STATES } from "./fixture-sets";
import { readRows } from "./tree-read-rows";
import { treeSourceOf } from "./tree-sources";

import type { AxNode, FirstDraw, ShownRow } from "../integration/__tests__/tree-checks";
import type { ReadRow } from "../integration/__tests__/tree-outline";
import type { KubeObjectData } from "../src/common/status/index";
import type { ClusterTree } from "../src/common/views/cluster-tree";
import type { TreeRow } from "../src/common/views/tree-rows";

const MINUTE = 60 * 1000;

function withRow(rows: readonly ReadRow[], text: string, change: Partial<ReadRow>): ReadRow[] {
  return rows.map((row) =>
    `${row.name}${row.role === null ? "" : ` (${row.role})`}` === text ? { ...row, ...change } : row,
  );
}

function treeOf(state: string): ClusterTree {
  const name = TREE_CLUSTERS[state];
  const source = treeSourceOf(fixtureSet(state) as unknown as KubeObjectData[], { cluster: { namespace: name, name } });
  const outcome = buildTree(indexTree(source.clusters, source.objects), name, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${state}`);
  return outcome.tree;
}

function shown(rows: readonly TreeRow[]): ShownRow[] {
  return rows.map((row) => ({
    id: row.node.id,
    level: row.depth + 1,
    expanded: row.expandable ? String(row.expanded) : null,
  }));
}

describe("what the sessions of the tree decide", () => {
  it.each(STATES)("find in the rows of %s the marks of step 1, and nothing else to report", (state) => {
    const { rows } = readRows(state, { now: CAPTURE + 5 * MINUTE });

    expect(marksProblems(rows, EXPECTED_MARKS[state])).toEqual([]);
  });

  it("report a health, a tone, an activity, a state, a stale, a note or a row that differs", () => {
    const { rows } = readRows("paused", { now: CAPTURE + 5 * MINUTE });
    const cluster = "Cluster freelens-capi-paused";
    const marks = EXPECTED_MARKS.paused;
    const pool = readRows("machine-pool-without-machines", { now: CAPTURE + 5 * MINUTE }).rows;

    expect(
      marksProblems(withRow(rows, cluster, { health: { word: "Degraded", state: "", tone: "ok" } }), marks),
    ).toEqual([`${cluster}: health Degraded, expected Healthy`]);
    expect(
      marksProblems(withRow(rows, cluster, { health: { word: "Healthy", state: "", tone: "info" } }), marks),
    ).toEqual([`${cluster}: the tone of its health is info, expected one of ok`]);
    expect(
      marksProblems(withRow(rows, cluster, { activities: [{ word: "Idle", state: "", tone: "info" }] }), marks),
    ).toEqual([`${cluster}: activities Idle, expected Paused`]);
    expect(
      marksProblems(
        withRow(rows, cluster, { activities: [{ word: "Paused", state: "Blocked", tone: "terminated" }] }),
        marks,
      ),
    ).toEqual([`${cluster}: Paused is Blocked, expected Progressing`]);
    expect(
      marksProblems(withRow(rows, cluster, { activities: [{ word: "Paused", state: "", tone: "info" }] }), marks),
    ).toEqual([`${cluster}: Paused in the tone info, expected terminated`]);
    expect(marksProblems(withRow(rows, cluster, { stale: false }), marks)).toEqual([
      `${cluster}: not stale, expected stale`,
    ]);
    expect(marksProblems(withRow(rows, cluster, { pending: true }), marks)).toEqual([
      `${cluster}: its cells still load`,
    ]);
    expect(
      marksProblems(
        withRow(pool, "Cluster freelens-capi-pool-without-machines", { condition: "Degraded" }),
        EXPECTED_MARKS["machine-pool-without-machines"],
      ),
    ).toEqual([
      'Cluster freelens-capi-pool-without-machines: the cell Condition says Degraded, with no "1 MachinePool of unknown health"',
    ]);
    expect(
      marksProblems(
        rows.filter((row) => row.level !== 1),
        marks,
      ),
    ).toEqual([`${cluster}: 0 rows`]);
    // A kind with no status says N/A in its cells Activity and Condition.
    const binding = "ClusterResourceSetBinding freelens-capi-healthy";
    const healthy = readRows("healthy").rows;

    expect(
      marksProblems(withRow(healthy, binding, { activityWords: "Idle", condition: "Healthy" }), EXPECTED_MARKS.healthy),
    ).toEqual([
      `${binding}: the cell Condition says Healthy, expected N/A`,
      `${binding}: the cell Activity says Idle, expected N/A`,
    ]);
  });

  it.each(Object.keys(FIRST_EXPANSIONS))(
    "find in the rows of %s as it opens the expansion and the counts of step 2",
    (state) => {
      const { rows } = readRows(state, { now: CAPTURE + 5 * MINUTE, expansion: "first" });

      expect(expansionProblems(rows, FIRST_EXPANSIONS[state])).toEqual([]);
      expect(expansionProblems([...rows].reverse(), FIRST_EXPANSIONS[state])).toEqual([]);
    },
  );

  it("report the rows, an expansion and counts that differ from the expansion at first", () => {
    const { rows } = readRows("healthy", { now: CAPTURE + 5 * MINUTE, expansion: "first" });
    const expected = FIRST_EXPANSIONS.healthy;
    const workers = rows.map((row) => (row.name === "Workers" ? { ...row, expanded: "true" } : row));
    const counts = rows.map((row) => (row.name === "Workers" ? { ...row, counts: "10 objects: 10 Healthy" } : row));

    expect(expansionProblems(workers, expected)).toEqual(["Workers: aria-expanded true, expected false"]);
    expect(expansionProblems(counts, expected)).toEqual([
      "Workers: counts 10 objects: 10 Healthy, expected 10 objects: 8 Healthy, 2 with no health",
    ]);
    expect(expansionProblems(rows.slice(0, -1), expected)[0]).toMatch(/^The rows are\n/);
    expect(expansionProblems(readRows("healthy").rows, expected).length).toBeGreaterThan(0);
  });

  it("take the first rows drawn once every answer of the tree had arrived, and report a draw before one", () => {
    const namespace = "freelens-capi-healthy";
    const settled = [
      { id: "cluster.x-k8s.io/Cluster/freelens-capi-healthy", expanded: "true" },
      { id: "infrastructure.cluster.x-k8s.io/DevCluster/freelens-capi-healthy-8fgcf", expanded: null },
    ];
    const first: FirstDraw = { at: 500, rows: settled.slice(0, 1) };
    const api = "https://f.renderer.freelens.app/api-kube/apis";
    const clusters = { url: `${api}/cluster.x-k8s.io/v1beta2/namespaces/${namespace}/clusters`, start: 100, end: 300 };
    const machines = { url: `${api}/cluster.x-k8s.io/v1beta2/namespaces/${namespace}/machines`, start: 120, end: 480 };
    const definition = {
      url: `${api}/apiextensions.k8s.io/v1/customresourcedefinitions/devmachines.infrastructure.cluster.x-k8s.io`,
      start: 320,
      end: 499,
    };

    expect(firstDrawProblems(first, settled, [clusters, machines, definition], namespace)).toEqual([]);
    // A list whose answer ends after the draw.
    expect(firstDrawProblems(first, settled, [clusters, { ...machines, end: 520 }], namespace)).toEqual([
      `The rows were drawn at 500.0 ms, before the answer to /api-kube/apis/cluster.x-k8s.io/v1beta2/namespaces/${namespace}/machines ended at 520.0 ms`,
    ]);
    expect(firstDrawProblems(first, settled, [clusters, { ...definition, end: 600 }], namespace)).toHaveLength(1);
    // A watch, a list of another namespace and a list sent after the draw are not answers that the draw waits for.
    expect(
      firstDrawProblems(
        first,
        settled,
        [
          clusters,
          { url: `${machines.url}?watch=1&resourceVersion=4`, start: 200, end: 9000 },
          { url: machines.url.replace(namespace, "freelens-capi-paused"), start: 120, end: 800 },
          { ...machines, start: 600, end: 700 },
        ],
        namespace,
      ),
    ).toEqual([]);
    // No answer to the list of the Clusters, rows that differ, and no draw at all.
    expect(firstDrawProblems(first, settled, [machines], namespace)).toEqual([
      `No answer to the list of the Clusters of ${namespace} came before the first rows`,
    ]);
    expect(
      firstDrawProblems({ at: 500, rows: [{ ...settled[0], expanded: "false" }] }, settled, [clusters], namespace),
    ).toEqual([
      "The first frame drew cluster.x-k8s.io/Cluster/freelens-capi-healthy (aria-expanded false) at row 0, where the tree shows cluster.x-k8s.io/Cluster/freelens-capi-healthy (aria-expanded true)",
    ]);
    expect(firstDrawProblems({ at: 500, rows: settled.slice(1) }, settled, [clusters], namespace)).toHaveLength(1);
    expect(firstDrawProblems(undefined, settled, [clusters], namespace)).toEqual([
      "The observer recorded no row drawn",
    ]);
  });

  it("give each key the effect that the handler of the page gives it, on every row of the tree of every state", () => {
    for (const state of STATES) {
      const tree = treeOf(state);

      for (const expanded of [new Set(tree.nodes.keys()), new Set([tree.root.id])]) {
        const rows = rowsOf(tree, expanded);
        const shownRows = shown(rows);

        for (const row of rows) {
          for (const key of TREE_KEYS) {
            const action = keyAction(tree, rows, row.node.id, key, 7);
            const effect = keyEffect(shownRows, row.node.id, key, 7);
            const where = `${state}, ${row.node.id}, ${key}`;

            switch (action?.type) {
              case "move":
                expect(effect, where).toEqual({ active: action.to });
                break;
              case "expand":
                expect(effect, where).toEqual({ active: row.node.id, toggles: "expands" });
                break;
              case "collapse":
                expect(effect, where).toEqual({ active: row.node.id, toggles: "collapses" });
                break;
              case "open":
                expect(effect, where).toEqual({ active: row.node.id, opens: true });
                break;
              default:
                expect(effect, where).toEqual({ active: row.node.id });
            }
          }
        }
      }
    }
  });

  it("take a scroll of the list for a move of the page only when the key moved to a row that was not whole in view", () => {
    const view = 700;
    const inView = { top: 33, bottom: 66 };
    const below = { top: 800, bottom: 833 };
    const shownAfter = { top: 667, bottom: 700 };
    const move = { active: "b" };

    // A move to a row whole in view leaves the scroll where it was; one to a row out of view leaves that row whole in it.
    expect(
      moveScrollProblem(
        "ArrowDown",
        move,
        true,
        { scrollTop: 0, target: inView },
        { scrollTop: 0, target: inView },
        view,
      ),
    ).toBeUndefined();
    expect(
      moveScrollProblem(
        "ArrowDown",
        move,
        true,
        { scrollTop: 0, target: inView },
        { scrollTop: 40, target: { top: -7, bottom: 26 } },
        view,
      ),
    ).toBe("ArrowDown moved the list from 0 to 40 px to a row that was whole in view");
    expect(
      moveScrollProblem(
        "End",
        move,
        true,
        { scrollTop: 0, target: below },
        { scrollTop: 133, target: shownAfter },
        view,
      ),
    ).toBeUndefined();
    expect(
      moveScrollProblem(
        "End",
        move,
        true,
        { scrollTop: 0, target: undefined },
        { scrollTop: 133, target: shownAfter },
        view,
      ),
    ).toBeUndefined();
    expect(
      moveScrollProblem("PageDown", move, true, { scrollTop: 0, target: below }, { scrollTop: 0, target: below }, view),
    ).toBe("PageDown left the row of b out of view, at 800 px");
    // No move, an expansion and the details leave the scroll where it was.
    for (const effect of [
      { active: "a" },
      { active: "a", toggles: "expands" as const },
      { active: "a", opens: true },
    ]) {
      expect(
        moveScrollProblem(
          "ArrowRight",
          effect,
          effect.toggles !== undefined || effect.opens !== undefined,
          { scrollTop: 66, target: inView },
          { scrollTop: 66, target: inView },
          view,
        ),
      ).toBeUndefined();
      expect(
        moveScrollProblem(
          "ArrowRight",
          effect,
          false,
          { scrollTop: 66, target: inView },
          { scrollTop: 106, target: inView },
          view,
        ),
      ).toBe("ArrowRight moved the list from 66 to 106 px with no move");
    }
    expect(
      moveScrollProblem(
        "Enter",
        { active: "a", opens: true },
        true,
        { scrollTop: 0, target: inView },
        { scrollTop: 40, target: inView },
        view,
      ),
    ).toBe("Enter moved the list from 0 to 40 px with no move");
  });

  it("wait for the answers of every list and get of the tree that the frame sent, and see a list of the Clusters among them", () => {
    const namespace = "freelens-capi-healthy";
    const api = "https://f.renderer.freelens.app/api-kube/apis";
    const clusters = `${api}/cluster.x-k8s.io/v1beta2/namespaces/${namespace}/clusters`;
    const machines = `${api}/cluster.x-k8s.io/v1beta2/namespaces/${namespace}/machines`;
    const sent = [
      { method: "GET", url: clusters },
      { method: "GET", url: machines },
      { method: "GET", url: `${machines}?watch=1` },
      { method: "GET", url: `${api}/cluster.x-k8s.io/v1beta2/namespaces/freelens-capi-paused/machines` },
    ];

    expect(waitingReads(sent, [{ url: clusters, start: 120, end: 130 }], 100, namespace)).toEqual({
      waiting: [machines],
      clusters: true,
    });
    expect(
      waitingReads(
        sent,
        [
          { url: clusters, start: 120, end: 130 },
          { url: machines, start: 110, end: 300 },
        ],
        100,
        namespace,
      ),
    ).toEqual({ waiting: [], clusters: true });
    // An answer that started before the time is that of another request.
    expect(waitingReads(sent, [{ url: clusters, start: 90, end: 95 }], 100, namespace).waiting).toEqual([
      clusters,
      machines,
    ]);
    expect(waitingReads(sent.slice(1), [], 100, namespace).clusters).toBe(false);
  });

  it("find the first row in view, partly in view at the top included, and a row whole in view", () => {
    const rows = [
      { id: "c", top: 30, bottom: 63 },
      { id: "a", top: -40, bottom: -7 },
      { id: "b", top: -3, bottom: 30 },
    ];

    expect(firstInView(rows)?.id).toBe("b");
    expect(firstInView(rows.filter((row) => row.id !== "b"))?.id).toBe("c");
    expect(firstInView([])).toBeUndefined();
    expect(wholeInView({ top: 0, bottom: 33 }, 33)).toBe(true);
    expect(wholeInView({ top: -3, bottom: 30 }, 700)).toBe(false);
    expect(wholeInView({ top: 690, bottom: 723 }, 700)).toBe(false);
  });

  it("report the rows drawn before a refresh that a record after it does not hold", () => {
    expect(
      rowsLost(
        ["a", "b"],
        [
          { at: 1, ids: ["a", "b", "c"] },
          { at: 2, ids: ["b", "a"] },
        ],
      ),
    ).toEqual([]);
    expect(
      rowsLost(
        ["a", "b"],
        [
          { at: 1, ids: ["a"] },
          { at: 2, ids: ["a", "b"] },
        ],
      ),
    ).toEqual(["b"]);
    expect(rowsLost(["a", "b"], [])).toEqual([]);
  });

  it("read the rows drawn in the tree of accessibility as rows of the treegrid, and report those that are not", () => {
    const titles = ["Name", "Replicas"];
    const ax = (nodeId: string, role: string, extra: Partial<AxNode> = {}): AxNode => ({
      nodeId,
      ignored: false,
      role: { value: role },
      ...extra,
    });
    const cell = (nodeId: string, role = "gridcell", name = "") => ax(nodeId, role, { name: { value: name } });
    const row = (nodeId: string, backend: number, level: number, cells: string[]) =>
      ax(nodeId, "row", {
        backendDOMNodeId: backend,
        childIds: cells,
        properties: [{ name: "level", value: { value: level } }],
      });
    const tree = (owned: string[], listChildren: string[] = []): AxNode[] => [
      ax("1", "treegrid", { childIds: ["2", "h", ...owned] }),
      ax("2", "generic", { childIds: ["3"] }),
      ax("3", "list", { childIds: listChildren }),
      ax("h", "row", { childIds: ["h1", "h2"] }),
      cell("h1", "columnheader", "Name"),
      cell("h2", "columnheader", "Replicas"),
      row("r1", 11, 1, ["c1", "c2"]),
      cell("c1"),
      cell("c2"),
      row("r2", 12, 2, ["c3", "c4"]),
      cell("c3"),
      cell("c4"),
    ];
    const ids = new Map([
      [11, "capi-tree-row-a"],
      [12, "capi-tree-row-b"],
    ]);
    const drawn = [
      { id: "capi-tree-row-a", level: 1 },
      { id: "capi-tree-row-b", level: 2 },
    ];

    expect(accessibilityOfTree(tree(["r1", "r2"]), ids, drawn, titles)).toEqual({
      problems: [],
      list: "a node with the role list, not ignored, with 0 children",
    });
    // A row that the list holds, as with no `aria-owns`, a level that differs, and a cell that is no gridcell.
    expect(accessibilityOfTree(tree(["r1"], ["r2"]), ids, drawn, titles).problems).toEqual([
      "capi-tree-row-b: a row of list, not of the treegrid",
    ]);
    expect(
      accessibilityOfTree(tree(["r1", "r2"]), ids, [drawn[0], { ...drawn[1], level: 3 }], titles).problems,
    ).toEqual(["capi-tree-row-b: the level 2, expected 3"]);
    expect(
      accessibilityOfTree(
        tree(["r1", "r2"]).map((node) => (node.nodeId === "c4" ? cell("c4", "cell") : node)),
        ids,
        drawn,
        titles,
      ).problems,
    ).toEqual(["capi-tree-row-b: its cells are gridcell, cell, expected 2 gridcells"]);
    expect(
      accessibilityOfTree(tree(["r1", "r2"]), ids, [...drawn, { id: "capi-tree-row-c", level: 1 }], titles).problems,
    ).toEqual(["capi-tree-row-c: no node of the tree of accessibility"]);
    expect(accessibilityOfTree(tree(["r1", "r2"]), ids, drawn, ["Name", "Version"]).problems).toEqual([
      "The header holds columnheader Name, columnheader Replicas",
    ]);
    expect(
      accessibilityOfTree(
        tree(["r1", "r2"]).filter((node) => node.nodeId !== "h"),
        ids,
        drawn,
        titles,
      ).problems,
    ).toEqual(["The tree of accessibility holds 0 rows of columnheaders"]);
    expect(accessibilityOfTree([], ids, drawn, titles).problems).toEqual([
      "The tree of accessibility holds 0 treegrids",
    ]);
  });

  it("take for a write of the frame a request to a group of the tree that is not a GET", () => {
    const api = "https://f.renderer.freelens.app/api-kube";
    const requests = [
      { method: "GET", url: `${api}/apis/cluster.x-k8s.io/v1beta2/namespaces/a/machines?watch=1` },
      { method: "PATCH", url: `${api}/apis/cluster.x-k8s.io/v1beta2/namespaces/a/machines/m` },
      { method: "DELETE", url: `${api}/apis/infrastructure.cluster.x-k8s.io/v1beta2/namespaces/a/devmachines/m` },
      { method: "POST", url: `${api}/apis/ipam.cluster.x-k8s.io/v1beta2/namespaces/a/ipaddressclaims` },
      { method: "PUT", url: `${api}/apis/apiextensions.k8s.io/v1/customresourcedefinitions/x` },
      { method: "POST", url: `${api}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews` },
      { method: "PATCH", url: `${api}/api/v1/namespaces/a/pods/p` },
    ];

    expect(writesOfTheFrame(requests).map((request) => request.method)).toEqual(["PATCH", "DELETE", "POST", "PUT"]);
    expect(readsAGroupOfTheTree(`${api}/apis/addons.cluster.x-k8s.io/v1beta2/clusterresourcesets`)).toBe(true);
    expect(readsAGroupOfTheTree(`${api}/apis/cluster.x-k8s.io.example/v1/x`)).toBe(false);
  });
});
