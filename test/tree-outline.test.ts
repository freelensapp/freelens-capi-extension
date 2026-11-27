// The rows of the page of the tree as the sessions read them (SPEC-0005, "Tests", "In Freelens"), with no app: the
// rows are made here from the cells that the page draws for each node, as the session finds them in the element of
// each row, and the outline that the session reads from them is the expected tree that `tree-expectations.ts` writes
// by hand, for the Cluster of every state of the fixtures and for the trees of the kinds that cannot be read that the
// restricted session reads.

import { describe, expect, it } from "vitest";
import { EXPECTED_TREES, outlineRows } from "../integration/__tests__/tree-expectations";
import {
  nodeIdOfRow,
  outlineOfRows,
  outlineTextOf,
  parentsOfRows,
  ROW_ID_PREFIX,
} from "../integration/__tests__/tree-outline";
import { rowDomId } from "../src/common/views/tree-keys";
import { countWords } from "../src/common/views/tree-rows";
import { STATES } from "./fixture-sets";
import { readRows } from "./tree-read-rows";
import { treeOutline } from "./tree-sources";

import type { ReadRow } from "../integration/__tests__/tree-outline";
import type { ReadFailure } from "../src/common/views/read-state";

const REFUSED: ReadFailure = { refused: true, message: "forbidden" };

describe("the rows of the page of the tree, as the sessions read them", () => {
  it("name their nodes by the ids of their elements", () => {
    expect(rowDomId("cluster.x-k8s.io/Machine/a")).toBe(`${ROW_ID_PREFIX}cluster.x-k8s.io/Machine/a`);
    expect(nodeIdOfRow(`${ROW_ID_PREFIX}virtual:templates:cluster.x-k8s.io/MachineDeployment/b`)).toBe(
      "virtual:templates:cluster.x-k8s.io/MachineDeployment/b",
    );
  });

  it.each(STATES)("give the expected tree of %s, every row once, at its depth, under its node", (state) => {
    const { tree, rows } = readRows(state);

    expect(outlineOfRows(rows)).toEqual(outlineRows(EXPECTED_TREES[state]));
    expect(outlineOfRows([...rows].reverse())).toEqual(outlineRows(EXPECTED_TREES[state]));
    expect(parentsOfRows(rows)).toEqual(new Map(rows.map((row) => [row.id, tree.parents.get(row.id)])));
    expect(rows.every((row) => !row.pending)).toBe(true);
  });

  it("read a node that cannot be read, the node of its kind, and an entry whose binding cannot be read, as the outline writes them", () => {
    const machines = readRows("healthy", { failures: { "cluster.x-k8s.io/Machine": [REFUSED] } });
    const bindings = readRows("healthy", {
      failures: { "addons.cluster.x-k8s.io/ClusterResourceSetBinding": [REFUSED] },
    });

    expect(outlineOfRows(machines.rows)).toEqual(treeOutline(machines.tree));
    expect(outlineOfRows(machines.rows).map((row) => row.text)).toEqual(
      expect.arrayContaining([
        "Machines [not read]",
        "Machine freelens-capi-healthy-d2lgq-zqlcx [not read]",
        "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx",
      ]),
    );
    expect(outlineOfRows(bindings.rows)).toEqual(treeOutline(bindings.tree));
    expect(outlineOfRows(bindings.rows).map((row) => row.text)).toEqual(
      expect.arrayContaining(["ConfigMap cni-kindnet [not read]", "ClusterResourceSetBindings [not read]"]),
    );
  });

  it("read the counts of a node, which the outline leaves out, apart", () => {
    const { rows } = readRows("healthy");
    const root = rows.find((row) => row.level === 1);

    expect(root?.counts).toBe("21 objects: 17 Healthy, 4 with no health");
    expect(outlineTextOf(root as ReadRow)).toBe("Cluster freelens-capi-healthy");
    expect(countWords({ objects: 1, pending: false, groups: [{ word: "Healthy", count: 1, stale: 0 }] })).toBe(
      "1 object: 1 Healthy",
    );
  });
});
