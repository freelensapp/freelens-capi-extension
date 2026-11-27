// The rows of the page of the tree as the sessions read them from the DOM (`integration/__tests__/tree-page.ts`), made
// here with no app from the cells that the page draws for each node of the tree of a state of the fixtures, for the
// unit tests of what the sessions read and decide: the words of each cell as its element holds them, the cell
// Condition as the whole text of its element, the word of its health, stale, the note of the MachinePools of unknown
// health, its own words and the counts one after the other, and an entry applied with its instant after "at".

import { nodeIdOfRow } from "../integration/__tests__/tree-outline";
import { buildTree, evaluateTree, indexTree } from "../src/common/views/cluster-tree";
import { StatusMemo } from "../src/common/views/context";
import { treeCellsOf } from "../src/common/views/tree-cells";
import { rowDomId } from "../src/common/views/tree-keys";
import { countsOf, firstExpansion, rowsOf } from "../src/common/views/tree-rows";
import { CAPTURE, fixtureSet } from "./fixture-sets";
import { treeSourceOf } from "./tree-sources";

import type { ReadRow } from "../integration/__tests__/tree-outline";
import type { KubeObjectData } from "../src/common/status/index";
import type { ClusterTree } from "../src/common/views/cluster-tree";
import type { TreeSourceOptions } from "./tree-sources";

export interface ReadOptions extends TreeSourceOptions {
  // The time of the reading, the capture by default.
  readonly now?: number;
  // Every node expanded, by default, or the expansion at first.
  readonly expansion?: "all" | "first";
  // The objects of the set, those of the state by default.
  readonly objects?: readonly KubeObjectData[];
}

function poolsWords(count: number): string {
  return `${count === 1 ? "1 MachinePool" : `${count} MachinePools`} of unknown health`;
}

// The tree of the Cluster of a state, and its rows as the page draws them and the sessions read them, in their order.
export function readRows(state: string, options: ReadOptions = {}): { tree: ClusterTree; rows: ReadRow[] } {
  const { now = CAPTURE, expansion = "all", objects, ...source } = options;
  const set = objects ?? (fixtureSet(state) as unknown as KubeObjectData[]);
  const clusters = set.filter((object) => object.kind === "Cluster");

  if (clusters.length !== 1) throw new Error(`The set of ${state} holds ${clusters.length} Clusters`);

  const name = String(clusters[0].metadata.name);
  const namespace = String(clusters[0].metadata.namespace);
  const read = treeSourceOf(set, { cluster: { namespace, name }, ...source });
  const index = indexTree(read.clusters, read.objects);
  const outcome = buildTree(index, namespace, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${state}`);

  const { tree } = outcome;
  const statuses = evaluateTree(tree, index, now, new StatusMemo());
  const counts = countsOf(tree, statuses);
  const expanded = expansion === "all" ? new Set(tree.nodes.keys()) : firstExpansion(tree, statuses);
  const rows = rowsOf(tree, expanded).map((row, at): ReadRow => {
    const cells = treeCellsOf(tree, row, { status: statuses.get(row.node.id), counts: counts.get(row.node.id) });
    const { activity, condition, status } = cells;
    const health = condition.own?.form === "health" ? condition.own.cell : undefined;
    const countsText = condition.counts?.form === "counts" ? condition.counts.text : null;

    return {
      id: nodeIdOfRow(rowDomId(row.node.id)),
      index: at,
      level: row.depth + 1,
      expanded: row.expandable ? String(row.expanded) : null,
      selected: "false",
      name: cells.name.text,
      role: cells.name.role ?? null,
      activities:
        activity.form === "marks"
          ? activity.cell.marks.map((mark) => ({ word: mark.word, state: mark.state ?? "", tone: mark.tone }))
          : [],
      activityWords: activity.form === "words" ? activity.words.text : null,
      health: health?.mark === undefined ? null : { word: health.mark.word, state: "", tone: health.mark.tone },
      stale: (health?.stale.length ?? 0) > 0,
      condition: [
        health?.mark?.word ?? "",
        (health?.stale.length ?? 0) > 0 ? "stale" : "",
        (health?.poolsUnknown ?? 0) > 0 ? poolsWords(health?.poolsUnknown ?? 0) : "",
        condition.own?.form === "words" ? condition.own.words.text : "",
        countsText ?? "",
      ].join(""),
      counts: countsText,
      status:
        status.form !== "words"
          ? ""
          : status.since === undefined
            ? status.words.text
            : `${status.words.text} at 1/1/2026`,
      pending: activity.form === "pending" || status.form === "pending",
    };
  });

  return { tree, rows };
}
