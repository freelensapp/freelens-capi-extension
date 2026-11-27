// The expectations that the sessions of the tree read in Freelens (SPEC-0005, "Tests", "In Freelens", "With a
// restricted identity"), written by hand in `tree-expectations.ts`, checked here against what the model and the tree
// give the fixtures with no app, so that a session in CI that does not find them finds a fault of the page, not of its
// expectations: the marks of step 1 at any time of the window of the session, the expansion at first and the counts of
// step 2, the searches of step 7, the writes of step 6 and what the tree says after each, and the trees of the
// restricted cases 6 to 9.

import { describe, expect, it } from "vitest";
import {
  activityTones,
  CREATED_MACHINE,
  CREATED_ROWS,
  createdMachine,
  EXPECTED_MARKS,
  EXPECTED_TREES,
  FIRST_EXPANSIONS,
  IN_FLIGHT,
  LIVE_NAMESPACE,
  NOT_READY,
  NOT_READY_COUNTS,
  NOT_READY_WORKER,
  outlineRows,
  PAUSED_COUNTS,
  PAUSED_WORKER,
  RESTRICTED_TREES,
  ROLLING_OUT_SEARCHES,
  TREE_CLUSTERS,
} from "../integration/__tests__/tree-expectations";
import { activityCell, healthCell } from "../src/common/views/cluster-cells";
import { buildTree, evaluateTree, indexTree } from "../src/common/views/cluster-tree";
import { StatusMemo } from "../src/common/views/context";
import { searchWordsOf } from "../src/common/views/tree-cells";
import { countsOf, countWords, firstExpansion, rowsOf, searchTree } from "../src/common/views/tree-rows";
import { CAPTURE, fixtureSet, STATES } from "./fixture-sets";
import { outlineText, treeOutline, treeSourceOf } from "./tree-sources";

import type { KubeObjectData } from "../src/common/status/index";
import type { ClusterTree, NodeStatus, TreeNode } from "../src/common/views/cluster-tree";
import type { ReadFailure } from "../src/common/views/read-state";
import type { TreeSourceOptions } from "./tree-sources";

const MINUTE = 60 * 1000;
const REFUSED: ReadFailure = { refused: true, message: "forbidden" };

// The times of the session within the window of 25 minutes after the apply of the fixtures, whose times move to it.
const WINDOW = [1, 12, 24].map((minutes) => CAPTURE + minutes * MINUTE);

interface Evaluated {
  readonly tree: ClusterTree;
  readonly statuses: ReadonlyMap<string, NodeStatus>;
}

// The tree of the Cluster of a state, or of a set given, evaluated at a time.
function evaluated(
  state: string,
  now: number,
  objects: readonly KubeObjectData[] = fixtureSet(state) as unknown as KubeObjectData[],
  options: TreeSourceOptions = {},
): Evaluated {
  const name = TREE_CLUSTERS[state];
  const source = treeSourceOf(objects, { cluster: { namespace: name, name }, ...options });
  const index = indexTree(source.clusters, source.objects);
  const outcome = buildTree(index, name, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${state}`);
  return { tree: outcome.tree, statuses: evaluateTree(outcome.tree, index, now, new StatusMemo()) };
}

// The one node of a tree whose row in an outline has a text.
function nodeOf(tree: ClusterTree, text: string): TreeNode {
  const found = [...tree.nodes.values()].filter((node) => outlineText(node) === text);

  if (found.length !== 1) throw new Error(`${found.length} nodes are ${text}`);
  return found[0];
}

// The counts of the nodes of a tree, by the texts of their rows.
function countsByText({ tree, statuses }: Evaluated): Map<string, string> {
  const counts = countsOf(tree, statuses);

  return new Map(
    [...tree.nodes.values()].flatMap((node) => {
      const count = counts.get(node.id);

      return count === undefined ? [] : [[outlineText(node), countWords(count)] as const];
    }),
  );
}

// The objects of `healthy` with one Machine changed as step 6 changes it.
function healthyWith(change: (machine: Record<string, any>) => void, name: string): KubeObjectData[] {
  const objects = structuredClone(fixtureSet("healthy")) as unknown as Record<string, any>[];
  const machine = objects.find((object) => object.kind === "Machine" && object.metadata.name === name);

  if (machine === undefined) throw new Error(`No Machine ${name} in healthy`);
  change(machine);
  return objects as unknown as KubeObjectData[];
}

describe("the expectations of the sessions of the tree", () => {
  it("name for each state of the fixtures the rows of the objects of the table of SPEC-0003, each once", () => {
    expect(Object.keys(EXPECTED_MARKS).sort()).toEqual([...STATES].sort());
    for (const [state, rows] of Object.entries(EXPECTED_MARKS)) {
      const texts = outlineRows(EXPECTED_TREES[state]).map((row) => row.text);

      for (const row of rows)
        expect(
          texts.filter((text) => text === row.text),
          `${state}: ${row.text}`,
        ).toHaveLength(1);
    }
  });

  it.each(STATES)(
    "give the marks of step 1 that the model gives the objects of %s at any time of the window",
    (state) => {
      for (const now of WINDOW) {
        const { tree, statuses } = evaluated(state, now);

        for (const expected of EXPECTED_MARKS[state]) {
          const where = `${state} at ${(now - CAPTURE) / MINUTE} minutes: ${expected.text}`;
          const status = statuses.get(nodeOf(tree, expected.text).id);

          if (status === undefined || status.pending) throw new Error(`No status of ${where}`);

          const health = healthCell(status.status);
          const activities = activityCell(status.status).marks;

          expect(health.mark?.word ?? "N/A", where).toBe(expected.health);
          if (expected.tones.length > 0) expect(expected.tones, where).toContain(health.mark?.tone);
          expect(
            activities.map((mark) => mark.word),
            where,
          ).toEqual(expected.activities);
          for (const mark of activities)
            expect(activityTones(mark.word), `${where}: ${mark.word}`).toContain(mark.tone);
          expect(health.stale.length > 0, where).toBe(expected.stale ?? false);
          expect(health.poolsUnknown > 0 ? `${health.poolsUnknown} MachinePool of unknown health` : undefined).toBe(
            expected.note,
          );
        }
      }
    },
  );

  it("give an activity in flight the tones of progress and of a warning, and the others their own", () => {
    expect(activityTones("Provisioning")).toEqual(IN_FLIGHT);
    expect(activityTones("Idle")).toEqual(["info"]);
    expect(activityTones("Paused")).toEqual(["terminated"]);
    expect(activityTones("Deleting")).toEqual(["terminated", "warning"]);
    expect(activityTones("Unknown")).toEqual(["vague"]);
  });

  it.each(Object.keys(FIRST_EXPANSIONS))(
    "give the expansion at first of %s, the rows collapsed and the counts of every row that holds objects (step 2)",
    (state) => {
      const expected = FIRST_EXPANSIONS[state];

      for (const now of WINDOW) {
        const evaluation = evaluated(state, now);
        const rows = rowsOf(evaluation.tree, firstExpansion(evaluation.tree, evaluation.statuses));
        const counts = countsByText(evaluation);
        const texts = rows.map((row) => outlineText(row.node));

        expect(rows.map((row) => ({ depth: row.depth, text: outlineText(row.node) }))).toEqual(
          outlineRows(expected.outline),
        );
        expect(new Set(texts).size).toBe(texts.length);
        expect(rows.filter((row) => row.expandable && !row.expanded).map((row) => outlineText(row.node))).toEqual(
          expected.collapsed,
        );
        expect(
          Object.fromEntries(texts.flatMap((text) => (counts.has(text) ? [[text, counts.get(text)]] : []))),
        ).toEqual(expected.counts);
      }
    },
  );

  it.each(ROLLING_OUT_SEARCHES.map((search) => [search.words, search]))(
    "give the rows and the matches of the search %s on the tree of rolling-out as it opens (step 7)",
    (_words, search) => {
      const { tree, statuses } = evaluated("rolling-out", CAPTURE + MINUTE);
      const found = searchTree(tree, search.words, (node) => searchWordsOf(tree, node, statuses.get(node.id)));

      if (found === undefined) throw new Error("The search searched nothing");
      expect(found.matches.size).toBe(search.matches);
      expect(
        rowsOf(tree, firstExpansion(tree, statuses), found).map((row) => ({
          depth: row.depth,
          text: outlineText(row.node),
        })),
      ).toEqual(outlineRows(search.outline));
    },
  );

  it("give the trees of the restricted cases 6 to 9, as the reads that the identity may not make leave them", () => {
    const healthy = fixtureSet("healthy") as unknown as KubeObjectData[];
    const outline = (options: TreeSourceOptions) => treeOutline(evaluated("healthy", CAPTURE, healthy, options).tree);
    const definitionRefused = {
      state: "unresolved",
      reference: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevMachine", name: "" },
      reason: "definition-refused",
      failure: REFUSED,
    } as const;

    expect(outline({ failures: { "bootstrap.cluster.x-k8s.io/KubeadmConfig": [REFUSED] } })).toEqual(
      outlineRows(RESTRICTED_TREES["kubeadmconfigs-refused"]),
    );
    expect(outline({ failures: { "cluster.x-k8s.io/Machine": [REFUSED] } })).toEqual(
      outlineRows(RESTRICTED_TREES["machines-refused"]),
    );
    expect(outline({ failures: { "addons.cluster.x-k8s.io/ClusterResourceSetBinding": [REFUSED] } })).toEqual(
      outlineRows(RESTRICTED_TREES["bindings-refused"]),
    );
    expect(outline({ resolutions: { "infrastructure.cluster.x-k8s.io/DevMachine": definitionRefused } })).toEqual(
      outlineRows(RESTRICTED_TREES["machine-definition-refused"]),
    );
  });

  it("place the Machine that step 6 creates first under the KubeadmControlPlane, its infrastructure machine not found", () => {
    const machine = createdMachine();
    const objects = [
      ...(fixtureSet("healthy") as unknown as KubeObjectData[]),
      {
        ...machine,
        metadata: {
          ...machine.metadata,
          uid: "created",
          resourceVersion: "1",
          creationTimestamp: "2026-01-01T00:00:00Z",
        },
      } as unknown as KubeObjectData,
    ];
    const outline = treeOutline(evaluated("healthy", CAPTURE + MINUTE, objects).tree);
    const plane = outline.findIndex((row) => row.text === "KubeadmControlPlane freelens-capi-healthy-d2lgq");

    expect(machine.metadata.namespace).toBe(LIVE_NAMESPACE);
    expect(CREATED_MACHINE < "freelens-capi-healthy-d2lgq-zqlcx").toBe(true);
    expect(outline.slice(plane + 1, plane + 3)).toEqual([
      { depth: 2, text: CREATED_ROWS[0] },
      { depth: 3, text: CREATED_ROWS[1] },
    ]);
    expect(outline.filter((row) => !CREATED_ROWS.includes(row.text))).toEqual(outlineRows(EXPECTED_TREES.healthy));
  });

  it("count a worker Machine paused by its annotation as stale, and one whose Ready is False as Unhealthy, in the nodes above it (step 6)", () => {
    const paused = evaluated(
      "healthy",
      CAPTURE + MINUTE,
      healthyWith((machine) => {
        machine.metadata.annotations = { ...machine.metadata.annotations, "cluster.x-k8s.io/paused": "" };
      }, PAUSED_WORKER),
    );
    const pausedStatus = paused.statuses.get(nodeOf(paused.tree, `Machine ${PAUSED_WORKER}`).id);
    const notReady = evaluated(
      "healthy",
      CAPTURE + MINUTE,
      healthyWith((machine) => {
        const conditions = machine.status.conditions as Record<string, unknown>[];
        const at = conditions.findIndex((condition) => condition.type === NOT_READY.type);

        conditions[at] = { ...conditions[at], ...NOT_READY };
      }, NOT_READY_WORKER),
    );
    const notReadyStatus = notReady.statuses.get(nodeOf(notReady.tree, `Machine ${NOT_READY_WORKER}`).id);

    if (pausedStatus === undefined || notReadyStatus === undefined) throw new Error("No status of the Machines");
    expect(activityCell(pausedStatus.status).marks.map((mark) => mark.word)).toEqual(["Paused"]);
    expect(healthCell(pausedStatus.status).stale.length).toBeGreaterThan(0);
    expect(Object.fromEntries([...countsByText(paused)].filter(([text]) => text in PAUSED_COUNTS))).toEqual(
      PAUSED_COUNTS,
    );
    expect(healthCell(notReadyStatus.status).mark?.word).toBe("Unhealthy");
    expect(Object.fromEntries([...countsByText(notReady)].filter(([text]) => text in NOT_READY_COUNTS))).toEqual(
      NOT_READY_COUNTS,
    );
  });
});
