import { describe, expect, it } from "vitest";
import { TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet, STATES } from "../../../test/fixture-sets";
import { outlineText, treeSourceOf } from "../../../test/tree-sources";
import { buildTree, compareText, evaluateTree, indexTree } from "./cluster-tree";
import { StatusMemo } from "./context";
import {
  countsOf,
  countWords,
  firstExpansion,
  needsLook,
  nodeWords,
  rowsOf,
  rowsStateOf,
  scrollOffset,
  searched,
  searchTree,
  toggled,
} from "./tree-rows";

import type { TreeSourceOptions } from "../../../test/tree-sources";
import type { KubeObjectData } from "../status/index";
import type { ClusterTree, NodeStatus, ObjectNode, ReferenceNode, TreeNode } from "./cluster-tree";
import type { ReadFailure } from "./read-state";
import type { RowsState, TreeRow } from "./tree-rows";

// The cases of SPEC-0005, "Tests", "Unit", `tree-rows.test.ts` (P11, P13 to P16): the expansion at first of the states
// of the fixtures, and of the changes that a case makes to them, each said in its case; the state of the rows after it;
// the order; the counts; the offset of the scroll; the search; and a tree of 500 Machines.

// An object of the fixtures, which a case changes.
interface Writable {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    deletionTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: { apiVersion: string; kind: string; name: string; controller?: boolean }[];
  };
  spec: any;
  status?: any;
}

interface View {
  readonly tree: ClusterTree;
  readonly statuses: ReadonlyMap<string, NodeStatus>;
}

const REFUSED: ReadFailure = { refused: true, message: "forbidden" };

function setOf(state: string): Writable[] {
  return structuredClone(fixtureSet(state)) as unknown as Writable[];
}

function named(objects: readonly Writable[], kind: string, name?: string): Writable {
  const found = objects.find((object) => object.kind === kind && (name === undefined || object.metadata.name === name));

  if (found === undefined) throw new Error(`No ${kind} ${name ?? ""} in the set`);
  return found;
}

function viewOf(
  objects: readonly KubeObjectData[],
  name: string,
  options: TreeSourceOptions = {},
  namespace = name,
): View {
  const source = treeSourceOf(objects, { cluster: { namespace, name }, ...options });
  const index = indexTree(source.clusters, source.objects);
  const outcome = buildTree(index, namespace, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${namespace}/${name}`);
  return { tree: outcome.tree, statuses: evaluateTree(outcome.tree, index, CAPTURE, new StatusMemo()) };
}

function stateView(state: string, options: TreeSourceOptions = {}): View {
  return viewOf(setOf(state), TREE_CLUSTERS[state], options);
}

// The rows as an outline, each at its depth.
function outline(rows: readonly TreeRow[]): string[] {
  return rows.map((row) => `${"  ".repeat(row.depth)}${outlineText(row.node)}`);
}

function firstRows(view: View, address?: string): string[] {
  return outline(rowsOf(view.tree, firstExpansion(view.tree, view.statuses, address)));
}

function idOf(tree: ClusterTree, text: string, under?: string): string {
  const nodes = under === undefined ? [...tree.nodes.values()] : (tree.nodes.get(idOf(tree, under))?.children ?? []);
  const found = nodes.filter((each) => outlineText(each) === text);

  if (found.length !== 1) throw new Error(`${found.length} nodes ${text}`);
  return found[0].id;
}

const machine = (name: string) => `cluster.x-k8s.io/Machine/${name}`;

describe("the expansion at first (P13)", () => {
  it("of healthy is the first level alone", () => {
    expect(firstRows(stateView("healthy"))).toEqual([
      "Cluster freelens-capi-healthy",
      "  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)",
      "  KubeadmControlPlane freelens-capi-healthy-d2lgq",
      "  Workers",
      "  ClusterClass quick-start",
      "  Add-ons",
      "  Health checks",
    ]);
  });

  it("of rolling-out goes down to the new Machine, which it expands, and leaves the old MachineSet collapsed", () => {
    expect(firstRows(stateView("rolling-out"))).toEqual([
      "Cluster freelens-capi-rolling-out",
      "  DevCluster freelens-capi-rolling-out-c8hvj (infrastructure cluster)",
      "  KubeadmControlPlane freelens-capi-rolling-out-hsfpd",
      "  Workers",
      "    MachineDeployment freelens-capi-rolling-out-md-0-t96dp",
      "      MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t",
      "        Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n",
      "          DevMachine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n (infrastructure machine)",
      "          KubeadmConfig freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n",
      "      MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62",
      "      Templates",
      "  ClusterClass quick-start",
      "  Add-ons",
      "  Health checks",
    ]);
  });

  it("of paused expands nothing for the pause of the Cluster alone, which its root says", () => {
    const view = stateView("paused");

    expect(firstRows(view)).toEqual([
      "Cluster freelens-capi-paused",
      "  DevCluster freelens-capi-paused-mb7z2 (infrastructure cluster)",
      "  KubeadmControlPlane freelens-capi-paused-q6kg9",
      "  Workers",
      "  ClusterClass quick-start",
      "  Add-ons",
      "  Health checks",
    ]);
    expect(view.statuses.get(view.tree.root.id)?.status.activities).toMatchObject({
      activities: [{ name: "Paused" }],
    });
  });

  it("expands a Machine of healthy paused by its own annotation, with the nodes above it", () => {
    const objects = setOf("healthy");

    named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg").metadata.annotations = {
      "cluster.x-k8s.io/paused": "",
    };

    expect(firstRows(viewOf(objects, "freelens-capi-healthy"))).toEqual([
      "Cluster freelens-capi-healthy",
      "  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)",
      "  KubeadmControlPlane freelens-capi-healthy-d2lgq",
      "  Workers",
      "    MachineDeployment freelens-capi-healthy-md-0-m9x7h",
      "      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
      "        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)",
      "          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
      "      Templates",
      "  ClusterClass quick-start",
      "  Add-ons",
      "  Health checks",
    ]);
  });

  it("expands what rolls out when the Cluster of rolling-out is paused by the case, its activities Blocked next to Paused", () => {
    const objects = setOf("rolling-out");

    named(objects, "Cluster").spec.paused = true;

    const view = viewOf(objects, "freelens-capi-rolling-out");
    const root = view.statuses.get(view.tree.root.id)?.status.activities;
    const deployment = view.statuses.get("cluster.x-k8s.io/MachineDeployment/freelens-capi-rolling-out-md-0-t96dp");

    expect(root?.state === "read" ? root.activities.map((each) => [each.name, each.state]) : []).toEqual([
      ["Paused", "Progressing"],
      ["Provisioning", "Blocked"],
      ["Rolling out", "Blocked"],
      ["Scaling down", "Blocked"],
    ]);
    expect(deployment?.status.freshness.map((mark) => mark.cause)).toEqual(["Paused"]);
    expect(firstRows(view)).toEqual(firstRows(stateView("rolling-out")));

    // The MachineDeployment needs a look for its activities alone, Blocked while the pause holds them, whatever its
    // health: the same result with the health Healthy.
    const id = "cluster.x-k8s.io/MachineDeployment/freelens-capi-rolling-out-md-0-t96dp";
    const status = deployment as NodeStatus;
    const activities = status.status.activities;
    const healthy: NodeStatus = {
      ...status,
      status: { ...status.status, health: { ...status.status.health, health: "Healthy" } as never },
    };

    expect(activities.state === "read" ? activities.activities.map((each) => each.state) : []).toContain("Blocked");
    expect(needsLook(view.tree.nodes.get(id) as TreeNode, healthy)).toBe(true);
  });

  it("of deleting goes down to every deleting object, and to the templates not found", () => {
    expect(firstRows(stateView("deleting"))).toEqual([
      "Cluster freelens-capi-deleting",
      "  DevCluster freelens-capi-deleting-n2jlv (infrastructure cluster)",
      "  KubeadmControlPlane freelens-capi-deleting-4kcdh",
      "  Workers",
      "    MachineDeployment freelens-capi-deleting-md-0-8dcql",
      "      MachineSet freelens-capi-deleting-md-0-8dcql-vp49h",
      "        Machine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw",
      "          DevMachine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw (infrastructure machine)",
      "          KubeadmConfig freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw",
      "      Templates",
      "        DevMachineTemplate freelens-capi-deleting-md-0-gq8t7 (template) [not found]",
      "        KubeadmConfigTemplate freelens-capi-deleting-md-0-nddmd [not found]",
      "  ClusterClass quick-start",
      "  Health checks",
    ]);
  });

  it("shows the node of the address, with the nodes above it expanded", () => {
    const view = stateView("healthy");
    const address = "infrastructure.cluster.x-k8s.io/DevMachine/freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9";

    expect(firstRows(view, address).slice(3, 11)).toEqual([
      "  Workers",
      "    MachineDeployment freelens-capi-healthy-md-0-m9x7h",
      "      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
      "        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
      "          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine)",
      "          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
      "      Templates",
    ]);
  });
});

describe("the state of the rows after the expansion at first (P13)", () => {
  // healthy, and healthy with the Machine 2xxxg Unhealthy: its condition `Ready` False, so that a node under the
  // Workers needs a look.
  function changed() {
    const objects = setOf("healthy");
    const sick = named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");

    for (const condition of sick.status.conditions) {
      if (["Ready", "Available", "NodeHealthy"].includes(condition.type)) {
        condition.status = "False";
        condition.reason = "NodeNotReady";
      }
    }
    sick.metadata.resourceVersion = "99";
    return viewOf(objects, "freelens-capi-healthy");
  }

  it("is the expansion at first for a Cluster that the page shows for the first time", () => {
    const view = stateView("healthy");

    expect(rowsStateOf(undefined, view.tree, view.statuses)).toEqual({
      cluster: "freelens-capi-healthy/freelens-capi-healthy",
      expanded: firstExpansion(view.tree, view.statuses),
      search: "",
    });
  });

  it("expands nothing and moves no row when a state changes after it", () => {
    const before = stateView("healthy");
    const after = changed();
    const state = rowsStateOf(undefined, before.tree, before.statuses);
    const next = rowsStateOf(state, after.tree, after.statuses);

    // The change needs a look: the expansion at first of the changed tree would open the Workers.
    expect(firstRows(after)).toContain("        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");
    expect(next).toBe(state);
    expect(outline(rowsOf(after.tree, next.expanded))).toEqual(outline(rowsOf(before.tree, state.expanded)));
  });

  it("keeps the choices of the user by the identity of each node", () => {
    const before = stateView("healthy");
    const after = changed();
    const workers = idOf(before.tree, "Workers");
    const state = toggled(rowsStateOf(undefined, before.tree, before.statuses), workers);

    expect(state.expanded.has(workers)).toBe(true);
    expect(outline(rowsOf(after.tree, rowsStateOf(state, after.tree, after.statuses).expanded))).toContain(
      "    MachineDeployment freelens-capi-healthy-md-0-m9x7h",
    );
    expect(toggled(state, workers).expanded.has(workers)).toBe(false);
  });

  it("is computed again for another Cluster", () => {
    const healthy = stateView("healthy");
    const rolling = stateView("rolling-out");
    const state = rowsStateOf(undefined, healthy.tree, healthy.statuses);

    expect(rowsStateOf(state, rolling.tree, rolling.statuses).cluster).toBe(
      "freelens-capi-rolling-out/freelens-capi-rolling-out",
    );
  });
});

describe("the order of the nodes (P14)", () => {
  // The place of each node under the Cluster.
  function rankOf(node: TreeNode): number {
    switch (node.form) {
      case "virtual":
        return { "control-plane": 2, workers: 3, "add-ons": 5, "health-checks": 6, "other-objects": 7, templates: -1 }[
          node.role
        ];
      case "kind":
        return 8;
      case "entry":
        return -1;
      default:
        if (node.role === "infrastructure-cluster") return 1;
        if (node.role === "control-plane" || node.kind === "KubeadmControlPlane") return 2;
        return node.kind === "ClusterClass" ? 4 : -1;
    }
  }

  it.each(STATES)("holds on %s: the Cluster's nodes in their order, Templates last, and one kind by name", (state) => {
    const { tree } = stateView(state);
    const ranks = tree.root.children.map(rankOf);

    expect(ranks.every((rank) => rank > 0)).toBe(true);
    expect([...ranks].sort((one, other) => one - other)).toEqual(ranks);
    for (const node of tree.nodes.values()) {
      const templates = node.children.findIndex((child) => child.form === "virtual" && child.role === "templates");

      if (templates !== -1) expect(templates, node.id).toBe(node.children.length - 1);

      const objects = node.children.filter(
        (child): child is ObjectNode | ReferenceNode => child.form === "object" || child.form === "reference",
      );

      for (const [index, child] of objects.entries()) {
        const next = objects[index + 1];

        if (next !== undefined && child.kind === next.kind) {
          expect(compareText(child.name, next.name), `${child.id} before ${next.id}`).toBeLessThan(0);
        }
      }
    }
  });

  it("puts the nodes of the kinds that cannot be read last, in the order of the rows of P7, two kinds of one row by name", () => {
    const { tree } = stateView("healthy", {
      failures: Object.fromEntries(
        [
          "addons.cluster.x-k8s.io/ClusterResourceSetBinding",
          "bootstrap.cluster.x-k8s.io/KubeadmConfig",
          "cluster.x-k8s.io/MachinePool",
          "cluster.x-k8s.io/MachineSet",
          "cluster.x-k8s.io/MachineDeployment",
        ].map((kind) => [kind, [REFUSED]]),
      ),
    });

    expect(tree.root.children.filter((node) => node.form === "kind").map(outlineText)).toEqual([
      "MachineDeployments [not read]",
      "MachinePools [not read]",
      "MachineSets [not read]",
      "KubeadmConfigs [not read]",
      "ClusterResourceSetBindings [not read]",
    ]);
    expect(tree.root.children.at(-6)?.form).not.toBe("kind");
  });
});

describe("the counts of the objects under a node (P11)", () => {
  it("count the objects at every depth, worst first, never an entry of a binding", () => {
    const { tree, statuses } = stateView("healthy");
    const counts = countsOf(tree, statuses);

    expect(countWords(counts.get(tree.root.id)!)).toBe("21 objects: 17 Healthy, 4 with no health");
    expect(countWords(counts.get(idOf(tree, "Add-ons"))!)).toBe("2 objects: 1 Healthy, 1 with no health");
    expect(counts.get(idOf(tree, "ClusterResourceSet cni-kindnet"))).toBeUndefined();
    expect(countWords(counts.get(idOf(tree, "Machine freelens-capi-healthy-d2lgq-zqlcx"))!)).toBe(
      "2 objects: 2 Healthy",
    );
    expect(counts.get(idOf(tree, "DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)"))).toBeUndefined();
    expect(countWords(counts.get(idOf(tree, "Templates", "KubeadmControlPlane freelens-capi-healthy-d2lgq"))!)).toBe(
      "1 object: 1 with no health",
    );
  });

  it("put the objects not read and not found after Unknown and before Healthy", () => {
    const objects = setOf("machine-pool-without-machines").filter((object) => object.kind !== "DevCluster");
    const { tree, statuses } = viewOf(objects, "freelens-capi-pool-without-machines", {
      failures: { "bootstrap.cluster.x-k8s.io/KubeadmConfig": [REFUSED] },
    });

    expect(countWords(countsOf(tree, statuses).get(tree.root.id)!)).toBe(
      "11 objects: 1 Unhealthy, 1 Degraded, 1 Unknown, 2 not read, 1 not found, 4 Healthy, 1 with no health",
    );
  });

  it("keep the stale ones of each health in parentheses after it", () => {
    const { tree, statuses } = stateView("paused");

    expect(countWords(countsOf(tree, statuses).get(tree.root.id)!)).toBe(
      "18 objects: 14 Healthy (12 stale), 4 with no health",
    );
  });

  it("show the spinner while an object under the node still loads", () => {
    const { tree, statuses } = stateView("healthy", { pending: ["bootstrap.cluster.x-k8s.io/KubeadmConfig"] });
    const counts = countsOf(tree, statuses);

    expect(counts.get(tree.root.id)?.pending).toBe(true);
    expect(counts.get(idOf(tree, "Health checks"))?.pending).toBe(false);
  });
});

describe("the offset of the scroll that keeps the first row in view in place (P13)", () => {
  // The rows of healthy with every node expanded, and with a third Machine of the MachineSet,
  // `freelens-capi-healthy-md-0-m9x7h-m5gtb-0aaaa`, which sorts before the two others: three rows, with those of its
  // DevMachine and its KubeadmConfig, which are not found yet.
  function rows(extra: boolean): TreeRow[] {
    const objects = setOf("healthy");

    if (extra) {
      const added = structuredClone(named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg"));

      added.metadata.name = "freelens-capi-healthy-md-0-m9x7h-m5gtb-0aaaa";
      added.spec.infrastructureRef.name = added.metadata.name;
      added.spec.bootstrap.configRef.name = added.metadata.name;
      objects.push(added);
    }

    const { tree } = viewOf(objects, "freelens-capi-healthy");

    return rowsOf(tree, new Set(tree.nodes.keys()));
  }

  const below = "infrastructure.cluster.x-k8s.io/DevMachine/freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9";
  const above = "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq";

  it("moves by the height of the rows that the reads insert above the first row in view, and back when they go", () => {
    // Three rows of 33 px, the height of a row of the table of the host (P9, P13).
    expect(scrollOffset(rows(false), rows(true), below, "reads")).toBe(99);
    expect(scrollOffset(rows(true), rows(false), below, "reads")).toBe(-99);
  });

  it("does not move for rows below the first row in view, a change of state, an expansion or a search", () => {
    expect(scrollOffset(rows(false), rows(true), above, "reads")).toBe(0);
    expect(scrollOffset(rows(false), rows(false), below, "reads")).toBe(0);
    expect(scrollOffset(rows(false), rows(true), below, "expansion")).toBe(0);
    expect(scrollOffset(rows(false), rows(true), below, "search")).toBe(0);
  });

  it("keeps the next row in place when the reads remove the first row in view", () => {
    const first = machine("freelens-capi-healthy-md-0-m9x7h-m5gtb-0aaaa");

    // The rows in view stay where they were: the Machine 2xxxg, three rows below the top, stays there.
    expect(scrollOffset(rows(true), rows(false), first, "reads")).toBe(-99);
  });
});

describe("the search (P15)", () => {
  // healthy in a namespace that no name holds, with its class in another namespace.
  function searchable(): View {
    const objects = setOf("healthy");

    for (const object of objects) object.metadata.namespace = "team-a";
    named(objects, "Cluster").spec.topology.classRef.namespace = "freelens-capi-classes";
    named(objects, "ClusterClass").metadata.namespace = "freelens-capi-classes";
    named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg").metadata.uid =
      "0f6c1a52-3d0e-4c38-9a1d-4b7f0e2d5c11";
    return viewOf(objects, "freelens-capi-healthy", { classNamespace: "freelens-capi-classes" }, "team-a");
  }

  function search(view: View, words: string) {
    return searchTree(view.tree, words, (node) => nodeWords(view.tree, node, view.statuses.get(node.id)));
  }

  function matched(view: View, words: string): string[] {
    const found = search(view, words);

    return [...(found?.matches ?? [])].map((id) => outlineText(view.tree.nodes.get(id) as TreeNode)).sort();
  }

  it("shows the nodes that match and the nodes above them, expanded, and counts the matches", () => {
    const view = searchable();
    const found = search(view, "m5gtb-2xxxg");

    expect(found?.matches.size).toBe(3);
    expect(outline(rowsOf(view.tree, new Set(), found))).toEqual([
      "Cluster freelens-capi-healthy",
      "  Workers",
      "    MachineDeployment freelens-capi-healthy-md-0-m9x7h",
      "      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
      "        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)",
      "          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
    ]);
  });

  it("matches the kind, the role, the words of the marks, whatever their case, and a name without its dashes", () => {
    const view = searchable();
    const rolling = stateView("rolling-out");

    expect(matched(view, "MachineHealthCheck")).toEqual([
      "MachineHealthCheck freelens-capi-healthy-d2lgq",
      "MachineHealthCheck freelens-capi-healthy-md-0-m9x7h",
    ]);
    expect(matched(view, "infrastructure cluster")).toEqual([
      "DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)",
    ]);
    expect(matched(rolling, "unhealthy")).toEqual([
      "Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n",
      "MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t",
    ]);
    expect(matched(rolling, "Scaling down")).toEqual([
      "Cluster freelens-capi-rolling-out",
      "MachineDeployment freelens-capi-rolling-out-md-0-t96dp",
    ]);
    // The Cluster, and the twelve objects under it whose health is stale (P11).
    expect(matched(stateView("paused"), "stale")).toHaveLength(13);
    expect(matched(view, "m9x7hm5gtb5pzv9")).toEqual([
      "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine)",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
      "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
    ]);
  });

  it("matches the namespace of the class read elsewhere, and not that of the Cluster, a label, an id or the counts", () => {
    const view = searchable();

    expect(matched(view, "freelens-capi-classes")).toEqual(["ClusterClass freelens-capi-classes/quick-start"]);
    expect(matched(view, "team-a")).toEqual([]);
    expect(matched(view, "cluster.x-k8s.io/deployment-name")).toEqual([]);
    expect(matched(view, "0f6c1a52")).toEqual([]);
    expect(matched(view, "21 objects")).toEqual([]);
    expect(matched(view, "17 Healthy")).toEqual([]);
  });

  it("matches the words of P12 of a node that cannot be read", () => {
    const view = stateView("healthy", { failures: { "bootstrap.cluster.x-k8s.io/KubeadmConfig": [REFUSED] } });

    expect(matched(view, "Not read")).toHaveLength(4);
  });

  it("gives back the expansions of the user once it is cleared", () => {
    const view = searchable();
    const workers = idOf(view.tree, "Workers");
    const state: RowsState = toggled(rowsStateOf(undefined, view.tree, view.statuses), workers);
    const before = outline(rowsOf(view.tree, state.expanded));
    const during = searched(state, "KubeadmConfig");

    expect(outline(rowsOf(view.tree, during.expanded, search(view, during.search)))).not.toEqual(before);

    const cleared = searched(during, "");

    expect(search(view, cleared.search)).toBeUndefined();
    expect(outline(rowsOf(view.tree, cleared.expanded, search(view, cleared.search)))).toEqual(before);
  });
});

describe("a Cluster of 500 Machines (P16)", () => {
  // healthy, with 500 Machines in its MachineSet in place of its two, each with its DevMachine and its KubeadmConfig.
  function large(): View {
    const objects = setOf("healthy");
    const kinds = ["Machine", "DevMachine", "KubeadmConfig"];
    const model = Object.fromEntries(
      kinds.map((kind) => [kind, named(objects, kind, "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg")]),
    );
    const kept = objects.filter(
      (object) => !(kinds.includes(object.kind) && object.metadata.name.startsWith("freelens-capi-healthy-md-0-")),
    );

    for (let index = 0; index < 500; index++) {
      const name = `freelens-capi-healthy-md-0-m9x7h-m5gtb-${String(index).padStart(5, "0")}`;

      for (const kind of kinds) {
        const object = structuredClone(model[kind]);

        object.metadata.name = name;
        object.metadata.uid = `${kind}-${index}`;
        for (const owner of object.metadata.ownerReferences ?? []) {
          if (owner.kind === "Machine") owner.name = name;
        }
        if (kind === "Machine") {
          object.spec.infrastructureRef.name = name;
          object.spec.bootstrap.configRef.name = name;
        }
        kept.push(object);
      }
    }
    return viewOf(kept, "freelens-capi-healthy");
  }

  it("is collapsed at first, expands to every row, and counts the objects of its MachineSet", () => {
    const view = large();
    const set = idOf(view.tree, "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb");
    const opened = new Set([
      ...firstExpansion(view.tree, view.statuses),
      idOf(view.tree, "Workers"),
      idOf(view.tree, "MachineDeployment freelens-capi-healthy-md-0-m9x7h"),
      set,
    ]);

    expect(rowsOf(view.tree, firstExpansion(view.tree, view.statuses))).toHaveLength(7);
    expect(rowsOf(view.tree, opened)).toHaveLength(510);
    expect(rowsOf(view.tree, new Set(view.tree.nodes.keys()))).toHaveLength(view.tree.nodes.size);
    expect(view.tree.nodes.size).toBe(28 - 6 + 1500);
    expect(countWords(countsOf(view.tree, view.statuses).get(set)!)).toBe("1500 objects: 1500 Healthy");
  });
});
