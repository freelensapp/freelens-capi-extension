import { describe, expect, it } from "vitest";
import { TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet } from "../../../test/fixture-sets";
import { outlineText, treeSourceOf } from "../../../test/tree-sources";
import { buildTree, evaluateTree, indexTree } from "./cluster-tree";
import { StatusMemo } from "./context";
import { searchWordsOf } from "./tree-cells";
import {
  activeDescendant,
  activeOf,
  CELL_ATTRIBUTES,
  HEAD_CELL_ATTRIBUTES,
  HEAD_ROW_ATTRIBUTES,
  keyAction,
  revealScroll,
  rowAttributes,
  rowDomId,
  TREE_KEYS,
  windowRows,
} from "./tree-keys";
import { firstExpansion, rowsOf, searchTree } from "./tree-rows";

import type { KubeObjectData } from "../status/index";
import type { ClusterTree, NodeStatus } from "./cluster-tree";
import type { TreeRow } from "./tree-rows";

// The cases of SPEC-0005, "Tests", "Unit", `tree-keys.test.ts` (P18): the node that each key gives, on the first and
// the last node, on an expanded node, a collapsed one, a leaf, a virtual node and an entry of a binding, Page Up and
// Page Down by a window of rows, and after a search that hides the active node; the attributes of each row and of the
// header; and the `aria-activedescendant` of the element, which names the row of a move once that row is drawn, and no
// row while the row of the active node is not.

interface View {
  readonly tree: ClusterTree;
  readonly statuses: ReadonlyMap<string, NodeStatus>;
}

function stateView(state: string): View {
  const name = TREE_CLUSTERS[state];
  const source = treeSourceOf(fixtureSet(state) as unknown as KubeObjectData[], { cluster: { namespace: name, name } });
  const index = indexTree(source.clusters, source.objects);
  const outcome = buildTree(index, name, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${name}`);
  return { tree: outcome.tree, statuses: evaluateTree(outcome.tree, index, CAPTURE, new StatusMemo()) };
}

const healthy = stateView("healthy");
// Every node of healthy expanded: 28 rows.
const all = rowsOf(healthy.tree, new Set(healthy.tree.nodes.keys()));

function idOf(rows: readonly TreeRow[], text: string): string {
  const found = rows.find((row) => outlineText(row.node) === text);

  if (found === undefined) throw new Error(`No row ${text}`);
  return found.node.id;
}

function textOf(id: string): string {
  const node = healthy.tree.nodes.get(id);

  if (node === undefined) throw new Error(`No node ${id}`);
  return outlineText(node);
}

// The text of the node that a key gives from a node, by their texts.
function moveFrom(rows: readonly TreeRow[], from: string, key: string, window = 10): string {
  const action = keyAction(healthy.tree, rows, idOf(rows, from), key, window);

  if (action?.type !== "move") return JSON.stringify(action);
  return textOf(action.to);
}

const CLUSTER = "Cluster freelens-capi-healthy";
const CONTROL_PLANE = "KubeadmControlPlane freelens-capi-healthy-d2lgq";
const MACHINE = "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg";
const LAST = "MachineHealthCheck freelens-capi-healthy-md-0-m9x7h";

describe("the keys of the tree (P18)", () => {
  it("take Down, Up, Home, End, Page Up, Page Down, Right, Left, Enter and Space, and nothing else", () => {
    expect([...TREE_KEYS]).toEqual([
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
    ]);
    for (const key of ["Escape", "Tab", "a", "F"]) {
      expect(keyAction(healthy.tree, all, idOf(all, CLUSTER), key, 10), key).toBeUndefined();
    }
  });

  it("move Down and Up to the next node shown and the one before, and stay on the last and the first", () => {
    expect(all).toHaveLength(28);
    expect(moveFrom(all, CLUSTER, "ArrowDown")).toBe("DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)");
    expect(moveFrom(all, CONTROL_PLANE, "ArrowUp")).toBe(
      "DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)",
    );
    expect(keyAction(healthy.tree, all, idOf(all, LAST), "ArrowDown", 10)).toEqual({ type: "none" });
    expect(keyAction(healthy.tree, all, idOf(all, CLUSTER), "ArrowUp", 10)).toEqual({ type: "none" });
  });

  it("move Home to the first node and End to the last node shown", () => {
    expect(moveFrom(all, MACHINE, "Home")).toBe(CLUSTER);
    expect(moveFrom(all, MACHINE, "End")).toBe(LAST);

    const collapsed = rowsOf(healthy.tree, new Set([healthy.tree.root.id]));

    expect(moveFrom(collapsed, CLUSTER, "End")).toBe("Health checks");
  });

  it("move Page Down and Page Up by a window of rows, to the last and the first node shown at most", () => {
    expect(moveFrom(all, CLUSTER, "PageDown", 10)).toBe(outlineText(all[10].node));
    expect(moveFrom(all, outlineText(all[20].node), "PageDown", 10)).toBe(LAST);
    expect(moveFrom(all, outlineText(all[20].node), "PageUp", 10)).toBe(outlineText(all[10].node));
    expect(moveFrom(all, outlineText(all[5].node), "PageUp", 10)).toBe(CLUSTER);
    expect(windowRows(726)).toBe(22);
    expect(windowRows(0)).toBe(1);
  });

  it("expand a collapsed node on Right, and go to the first child of an expanded one", () => {
    const first = new Set([healthy.tree.root.id]);
    const rows = rowsOf(healthy.tree, first);
    const controlPlane = idOf(rows, CONTROL_PLANE);

    expect(keyAction(healthy.tree, rows, controlPlane, "ArrowRight", 10)).toEqual({
      type: "expand",
      id: controlPlane,
    });
    expect(moveFrom(all, CONTROL_PLANE, "ArrowRight")).toBe("Machine freelens-capi-healthy-d2lgq-zqlcx");
    // A leaf: nothing.
    expect(
      keyAction(healthy.tree, all, idOf(all, "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx"), "ArrowRight", 10),
    ).toEqual({ type: "none" });
  });

  it("collapse an expanded node on Left, and go to the node above a collapsed one or a leaf", () => {
    const controlPlane = idOf(all, CONTROL_PLANE);

    expect(keyAction(healthy.tree, all, controlPlane, "ArrowLeft", 10)).toEqual({ type: "collapse", id: controlPlane });
    expect(moveFrom(all, "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx", "ArrowLeft")).toBe(
      "Machine freelens-capi-healthy-d2lgq-zqlcx",
    );
    expect(moveFrom(rowsOf(healthy.tree, new Set([healthy.tree.root.id])), CONTROL_PLANE, "ArrowLeft")).toBe(CLUSTER);
    // The Cluster has no node above it.
    expect(keyAction(healthy.tree, rowsOf(healthy.tree, new Set()), healthy.tree.root.id, "ArrowLeft", 10)).toEqual({
      type: "none",
    });
  });

  it("open the details of a node of an object on Enter and Space, read or not", () => {
    const machine = idOf(all, MACHINE);

    expect(keyAction(healthy.tree, all, machine, "Enter", 10)).toEqual({ type: "open", id: machine });
    expect(keyAction(healthy.tree, all, machine, " ", 10)).toEqual({ type: "open", id: machine });

    // A node made from a reference, of an object that is not found: the DevMachineTemplate of deleting.
    const deleting = stateView("deleting");
    const rows = rowsOf(deleting.tree, new Set(deleting.tree.nodes.keys()));
    const missing = rows.find((row) => row.node.form === "reference")?.node.id ?? "";

    expect(missing).toBe("infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-deleting-md-0-gq8t7");
    expect(keyAction(deleting.tree, rows, missing, "Enter", 10)).toEqual({ type: "open", id: missing });
  });

  it("expand or collapse a virtual node on Enter and Space, which has no details", () => {
    const workers = idOf(all, "Workers");
    const rows = rowsOf(healthy.tree, new Set([healthy.tree.root.id]));

    expect(keyAction(healthy.tree, all, workers, "Enter", 10)).toEqual({ type: "collapse", id: workers });
    expect(keyAction(healthy.tree, rows, workers, " ", 10)).toEqual({ type: "expand", id: workers });
  });

  it("do nothing on Enter and Space on an entry of a binding, and take the keys", () => {
    const entry = idOf(all, "ConfigMap cni-kindnet [applied]");

    expect(keyAction(healthy.tree, all, entry, "Enter", 10)).toEqual({ type: "none" });
    expect(keyAction(healthy.tree, all, entry, " ", 10)).toEqual({ type: "none" });
  });
});

describe("the active node (P18)", () => {
  it("stays the one that was, by its identity, while the rows show it", () => {
    const machine = idOf(all, MACHINE);

    expect(activeOf(healthy.tree, all, machine, undefined)).toBe(machine);
  });

  it("is the first node that a search matches when the search hides it, with the rows of the search", () => {
    const search = searchTree(healthy.tree, "KubeadmConfigTemplate", (node) =>
      searchWordsOf(healthy.tree, node, healthy.statuses.get(node.id)),
    );
    const rows = rowsOf(healthy.tree, new Set(), search);
    const active = activeOf(healthy.tree, rows, idOf(all, MACHINE), search);

    expect(textOf(active ?? "")).toBe("KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v");
    // A key move from a node that the search hides starts from the first row.
    expect(keyAction(healthy.tree, rows, idOf(all, MACHINE), "ArrowDown", 10)).toEqual({
      type: "move",
      to: healthy.tree.root.id,
    });
  });

  it("is the nearest node above it that the rows show after a collapse, else the Cluster", () => {
    const rows = rowsOf(healthy.tree, firstExpansion(healthy.tree, healthy.statuses));

    expect(textOf(activeOf(healthy.tree, rows, idOf(all, MACHINE), undefined) ?? "")).toBe("Workers");
    expect(activeOf(healthy.tree, rows, "cluster.x-k8s.io/Machine/gone", undefined)).toBe(healthy.tree.root.id);
    expect(activeOf(healthy.tree, [], undefined, undefined)).toBeUndefined();
  });
});

describe("the attributes of the rows and of the header (P18)", () => {
  it("give each row the role row, its id, its level from 1, aria-expanded on a node with children alone, and aria-selected", () => {
    const cluster = all[0];
    const leaf = all.find(
      (row) => outlineText(row.node) === "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx",
    ) as TreeRow;

    expect(rowAttributes(cluster, false)).toEqual({
      role: "row",
      id: rowDomId(healthy.tree.root.id),
      "aria-level": 1,
      "aria-expanded": true,
      "aria-selected": false,
    });
    expect(rowAttributes(leaf, true)).toEqual({
      role: "row",
      id: rowDomId(leaf.node.id),
      "aria-level": 4,
      "aria-selected": true,
    });
    expect(
      rowAttributes(rowsOf(healthy.tree, new Set()).find((row) => row.node === healthy.tree.root) as TreeRow, false)[
        "aria-expanded"
      ],
    ).toBe(false);
  });

  it("give each cell the role gridcell, and the header a row of columnheader cells", () => {
    expect(CELL_ATTRIBUTES).toEqual({ role: "gridcell" });
    expect(HEAD_ROW_ATTRIBUTES).toEqual({ role: "row" });
    expect(HEAD_CELL_ATTRIBUTES).toEqual({ role: "columnheader" });
  });
});

describe("the aria-activedescendant of the element of the tree (P18)", () => {
  it("names the row of the active node once it is drawn, and no row while it is not", () => {
    const machine = idOf(all, MACHINE);

    expect(activeDescendant(machine, true)).toBe(`capi-tree-row-${machine}`);
    expect(activeDescendant(machine, false)).toBeUndefined();
    expect(activeDescendant(undefined, true)).toBeUndefined();
  });
});

describe("the scroll that brings a row whole into view (P16)", () => {
  it("is the top of a row above the view, and the bottom of a row below it, at the bottom of the list", () => {
    // A list 726 px high, scrolled to 330 px: rows 10 to 31, row 32 partly in view.
    expect(revealScroll(5, 330, 726)).toBe(165);
    expect(revealScroll(10, 330, 726)).toBeUndefined();
    // Row 31 ends at 1056 px, the bottom of the view; row 32 ends 33 px below it.
    expect(revealScroll(31, 330, 726)).toBeUndefined();
    expect(revealScroll(32, 330, 726)).toBe(33 * 33 - 726);
  });

  it("is none for a list with no height yet", () => {
    expect(revealScroll(5, 330, 0)).toBeUndefined();
  });
});
