/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The session of the tree on the real project (SPEC-0005, "With the real project", `cluster-tree-real.tests.ts`), a
// session of the real tier, which the job of the real project of test-environment.yaml runs in Freelens dev on each
// release of the integration tests, and nothing else runs (SPEC-0004, P33). It opens the cluster of the real project,
// through the copy of the kubeconfig of the scripts that the profile of Freelens dev syncs, and compares the tree of its
// two workload clusters, every node expanded, with what `clusterctl describe cluster` prints of them with
// `--show-machinesets`, `--show-templates`, `--show-resourcesets`, `--echo` and `--grouping=false`, run by the scripts
// with the pinned clusterctl, which checks for no newer one (kit, `docs/testing.md`, "Domain correctness"):
//
// 1. every row of an object that the tool prints is a node of the tree with its kind and its name, under the node of
//    the row that holds it in the tool, at its depth, the virtual rows Workers, ClusterResourceSets and Templates read as
//    the nodes Workers, Add-ons and Templates, and a row under the virtual row Other read where P7 places it;
// 2. for every row with a status, the condition that the health of its node rests on, which the summary of its details
//    gives, has the type, the status and the reason that the tool shows, the details closed on Escape after each, and
//    the counters of the rows of a control plane and of a MachineDeployment are those of the tooltip of the cell
//    Replicas of their nodes, each row brought into the window of the list first;
// 3. every node of the tree that the tool does not print is of a kind that the tool leaves out.
//
// The objects of the real project change as its controllers write them, so each comparison reads both sides again
// until they agree, five minutes at most. The session reads the cluster alone, and writes nothing to it. It reaches the
// cluster through the scripts of the test environment, which check the target before every request, and fails on any
// error that either process logs.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openRealProject } from "../../e2e/scripts/commands.mts";
import {
  appReady,
  connectApp,
  disconnectKindCluster,
  installExtension,
  navigateCluster,
  openKindCluster,
} from "./extension-helpers";
import {
  countersDifferences,
  describedConditionType,
  describedTree,
  objectOfNode,
  replicaCountersOf,
  summaryConditionOf,
  TREE_FLAGS,
  treeDifferences,
} from "./real-project-checks";
import { parentsOfRows } from "./tree-outline";
import {
  allRows,
  detailsOf,
  expandAll,
  openTree,
  rowInView,
  titleOf,
  tooltipLines,
  treeAddress,
  treeOf,
  until,
} from "./tree-page";

import type { Frame, Locator } from "playwright";

import type { RealProjectSession } from "../../e2e/scripts/commands.mts";
import type { AppSession } from "./extension-helpers";
import type { DescribedRow, ReadNode } from "./real-project-checks";
import type { DrawnRow } from "./tree-page";

const viewTimeout = { timeout: 60 * 1000 };
// The time within which the view and the tool agree on objects that the controllers still write.
const settleTimeout = { timeout: 5 * 60 * 1000, interval: 5 * 1000 };

// The workload clusters of the real project, in the namespace where `pnpm e2e:cluster:up` makes them (TESTING.md, "The
// real project").
const NAMESPACE = "default";
const CLUSTERS = ["freelens-capi-md", "freelens-capi-mp"];

// The real project through the scripts; outside CI the session skips with a warning when it is not up, in CI it fails
// instead.
async function open(): Promise<RealProjectSession | undefined> {
  try {
    return await openRealProject();
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn(
      `Skipping the session of the tree on the real project: it cannot be reached through the scripts: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
}

const project = (await appReady({ cluster: false })) ? await open() : undefined;

describe.skipIf(project === undefined)("the tree of the Clusters of the real project, against clusterctl", () => {
  const real = project as RealProjectSession;
  let session: AppSession | undefined;
  let frame: Frame | undefined;

  function opened(): { session: AppSession; frame: Frame } {
    if (!session || !frame) throw new Error("The cluster of the real project is not open");
    return { session, frame };
  }

  // The tree of a Cluster with every node expanded, and every row of it.
  async function expandedTreeOf(name: string): Promise<{ tree: Locator; rows: DrawnRow[] }> {
    const tree = await openTree(opened().frame, NAMESPACE, name);

    await expandAll(tree);
    return { tree, rows: await allRows(tree) };
  }

  // The nodes of the tree as the comparison reads them: the identity of each, its depth and the node above it.
  function nodesOf(rows: readonly DrawnRow[]): ReadNode[] {
    const parents = parentsOfRows(rows);

    return rows.map((row) => ({ id: row.id, depth: row.level - 1, parent: parents.get(row.id) }));
  }

  // The node of the tree of the object of a row of the tool, by its kind and its name.
  function nodeOfRow(rows: readonly DrawnRow[], row: DescribedRow): DrawnRow | undefined {
    return rows.find((each) => {
      const object = objectOfNode(each.id);

      return object?.kind === row.object?.kind && object?.name === row.object?.name;
    });
  }

  // The summary of the details of a node, opened by the address of the page: `<type>: <status>, <reason>`. The details
  // then close on Escape, pressed on the element of the tree, which takes the focus first, so that the key reaches the
  // window of the frame, where their drawer hears it: the drawer covers the frame from 480 px (H19), the cell Replicas
  // of the rows among it, which a hover after them would not reach.
  async function summaryOf(name: string, node: DrawnRow): Promise<string> {
    const { frame } = opened();
    const drawer = detailsOf(frame);
    const [, kind = ""] = node.id.split("/");
    const title = `${kind}: ${node.id.split("/").slice(-1)[0]}`;

    await navigateCluster(frame, treeAddress(NAMESPACE, name, node.id));
    await until(`the details of ${title}`, async () => (await titleOf(drawer)) === title);

    const summary = drawer.getByTestId("capi-details-summary");

    await summary.waitFor(viewTimeout);

    const said = ((await summary.locator(".value > div").first().textContent()) ?? "").trim();

    await treeOf(frame).press("Escape");
    await until(`the details of ${title} to close`, async () => (await titleOf(drawer)) === null);
    return said;
  }

  beforeAll(async () => {
    // clusterctl set up once, so that a setup that fails fails here, at once, and not each wait for its whole time.
    await real.describeCluster(CLUSTERS[0], TREE_FLAGS);
    session = await connectApp();
    await session.window.setViewportSize({ width: 1280, height: 900 });
    await installExtension(session);
    frame = await openKindCluster(session);
  }, 240 * 1000);

  afterAll(async () => {
    const failures: unknown[] = [];
    const attempt = async <T>(step: () => T | Promise<T>, otherwise: T): Promise<T> => {
      try {
        return await step();
      } catch (error) {
        failures.push(error);
        return otherwise;
      }
    };
    // The errors stop being collected before the cluster is disconnected: what the app logs while it disconnects says
    // nothing about the extension.
    const errors = await attempt(async () => (await session?.stopCollecting()) ?? [], [] as string[]);

    if (session) {
      const app = session;

      await attempt(() => disconnectKindCluster(app), undefined);
      await attempt(() => app.close(), undefined);
    }
    await attempt(() => real.close(), undefined);

    const failed = [
      ...(errors.length === 0 ? [] : [`The app logged errors:\n${errors.join("\n")}`]),
      ...failures.map(
        (failure) => `The end of the session failed: ${failure instanceof Error ? failure.message : String(failure)}`,
      ),
    ];

    if (failed.length > 0) {
      throw new Error(`${failed.length} checks at the end of the session failed:\n\n${failed.join("\n\n")}`);
    }
  }, 240 * 1000);

  it.each(CLUSTERS)(
    "gives %s the tree that clusterctl describe cluster prints with every object on a row, each row of an object a node under its node at its depth, and every other node of a kind that the tool leaves out (1, 3)",
    async (name) => {
      // Both sides read again until they agree: what differs, empty once they do.
      await expect
        .poll(async () => {
          const described = describedTree(await real.describeCluster(name, TREE_FLAGS));
          const { rows } = await expandedTreeOf(name);

          return described.length === 0 ? ["clusterctl printed no tree"] : treeDifferences(described, nodesOf(rows));
        }, settleTimeout)
        .toEqual([]);
      expect(await opened().session.errors()).toEqual([]);
    },
    // The tree opened, two minutes at most, and the comparison, five.
    8 * 60 * 1000,
  );

  it.each(CLUSTERS)(
    "gives each node of %s with a status in clusterctl the condition of its row, and its control plane and its MachineDeployment the counters of their rows (2)",
    async (name) => {
      await expect
        .poll(async () => {
          const described = describedTree(await real.describeCluster(name, TREE_FLAGS));
          const { tree, rows } = await expandedTreeOf(name);
          const differences: string[] = [];

          for (const row of described) {
            const type = describedConditionType(row, described);
            const node = nodeOfRow(rows, row);
            const what = `${row.object?.kind} ${row.object?.name}`;

            if (row.object === undefined) continue;
            if (node === undefined) {
              differences.push(`${what}: no node of the tree`);
              continue;
            }
            if (
              row.object.kind === "MachineDeployment" ||
              (row.depth === 1 && row.object.version !== undefined && row.object.kind !== "MachinePool")
            ) {
              // The row brought into the window of the list, whose virtual rows draw only those near it.
              const cell = (await rowInView(tree, node.id)).getByTestId("capi-tree-replicas");
              const lines = await tooltipLines(opened().frame, opened().session.window, cell);

              differences.push(...countersDifferences(row, replicaCountersOf(lines)));
            }
            if (type === undefined || row.status === "") continue;

            const said = summaryConditionOf(await summaryOf(name, node));

            if (said === undefined) {
              differences.push(`${what}: the details give no summary`);
            } else if (said.type !== type || said.status !== row.status || said.reason !== row.reason) {
              differences.push(
                `${what}: the details give ${said.type} ${said.status} ${said.reason}, clusterctl ${type} ${row.status} ${row.reason}`,
              );
            }
          }
          return differences;
        }, settleTimeout)
        .toEqual([]);
      expect(await opened().session.errors()).toEqual([]);
    },
    // The tree and the details of each node, opened again at each reading, five minutes at most, and their first
    // reading, three.
    10 * 60 * 1000,
  );
});
