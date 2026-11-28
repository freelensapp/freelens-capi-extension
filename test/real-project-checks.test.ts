// What the sessions of the real tier compare (SPEC-0004, "With the real project"; SPEC-0005, "With the real project"),
// with no cluster: the row of a Cluster that `clusterctl describe cluster` prints, the counters of the details, the row
// that they give, summed as the project sums them (SPEC-0001, R4.21, R4.22), the lists of the Clusters that the page of
// the Sveltos extension sends without a watch, and the tree that the tool prints with every row of an object shown,
// against the tree of the extension. The tables below are written for these cases, in the layout of R4.21: the columns
// of R4.21, no border, and cells at least two spaces apart, each column as wide as its widest cell, a cell that the tool
// leaves empty with no mark in its place (internal/util/tree/tree.go:69-93). Every counter of a row, and of a sum, has
// a value of its own, so that two counters read in each other's place fail.

import { describe, expect, it } from "vitest";
import {
  clusterListsBetween,
  countersDifferences,
  countersOf,
  describedCluster,
  describedConditionType,
  describedTree,
  objectOfNode,
  replicaCountersOf,
  summaryConditionOf,
  summaryOf,
  summedCounters,
  TREE_FLAGS,
  treeDifferences,
} from "../integration/__tests__/real-project-checks";

import type { ReadNode } from "../integration/__tests__/real-project-checks";

const HEADER =
  "NAME                                       REPLICAS  AVAILABLE  READY  UP TO DATE  STATUS  REASON     SINCE  MESSAGE";

function table(...rows: string[]): string {
  return [HEADER, ...rows, ""].join("\n");
}

describe("the row of a Cluster that clusterctl describe cluster prints (R4.21, R4.22)", () => {
  it("is the line of the Cluster, with the version of its topology, its counters, and the status and reason of Available", () => {
    const output = table(
      "Cluster default/workload-a, v1.37.0         5/6       4          3      2           True    Available  12m",
      // The prefixes of the tree, which clusterctl draws with the box drawing characters.
      "\u251c\u2500ClusterInfrastructure - DevCluster default/workload-a-x1",
      "\u2514\u2500Workers",
      "  \u2514\u2500MachineDeployment default/workload-a-md-0, v1.37.0  2/2  2  2  2  True  Available  10m",
    );

    expect(describedCluster(output, "default", "workload-a")).toEqual({
      replicas: "5/6",
      available: "4",
      ready: "3",
      upToDate: "2",
      status: "True",
      reason: "Available",
    });
  });

  it("is read without the colors of a terminal, the message of its first line left aside, and without a topology", () => {
    const output = table(
      "\u001b[1mCluster default/workload-b\u001b[0m  3/4  2  1  0  \u001b[32mTrue\u001b[0m  Available  3m  * ControlPlaneAvailable: ok",
    );

    expect(describedCluster(output, "default", "workload-b")).toEqual({
      replicas: "3/4",
      available: "2",
      ready: "1",
      upToDate: "0",
      status: "True",
      reason: "Available",
    });
  });

  it("is none for another Cluster, a Cluster of another namespace, or a row with a cell not written yet", () => {
    const output = table(
      "Cluster default/workload-ab, v1.37.0  3/3  3  3  3  True  Available  12m",
      "Cluster other/workload-a, v1.37.0  3/3  3  3  3  True  Available  12m",
      "Cluster default/workload-c, v1.37.0  0/1  1  1  False  NotAvailable  1m",
      "Cluster default/workload-d  1  1  1  True  Available  1m",
    );

    expect(describedCluster(output, "default", "workload-a")).toBeUndefined();
    expect(describedCluster(output, "default", "workload-c")).toBeUndefined();
    expect(describedCluster(output, "default", "workload-d")).toBeUndefined();
    expect(describedCluster("", "default", "workload-a")).toBeUndefined();
  });
});

describe("the counters of the details, summed as the project sums them (R4.22)", () => {
  it("reads each count with its label, N/A for one not written", () => {
    expect(countersOf("1 desired, 1 current, 0 ready, 1 available, N/A up to date")).toEqual(
      new Map<string, number | undefined>([
        ["desired", 1],
        ["current", 1],
        ["ready", 0],
        ["available", 1],
        ["up to date", undefined],
      ]),
    );
    expect(countersOf("")).toEqual(new Map());
  });

  it("refuses the text of the whole item of the drawer, which starts with its name, so that the first count is never lost", () => {
    // The host renders the name of an item of a drawer next to its value with nothing between them, so the text of the
    // whole item reads "Machines1 desired, ...": the session reads the value of the item alone.
    expect(() => countersOf("Machines1 desired, 1 current, 0 ready, 1 available, N/A up to date")).toThrow(
      /"Machines1 desired" of .* is not a count with its label/,
    );
  });

  it("gives the current of the desired, and the sum of each counter, a counter not written counting as zero", () => {
    const controlPlane = countersOf("3 desired, 3 current, 2 ready, 1 available, 0 up to date");
    const workers = countersOf("4 desired, 5 current, 4 ready, 3 available, N/A up to date");

    expect(summedCounters(controlPlane, workers)).toEqual({
      replicas: "8/7",
      available: "4",
      ready: "6",
      upToDate: "0",
    });
    expect(summedCounters(new Map(), new Map())).toEqual({ replicas: "", available: "", ready: "", upToDate: "" });
  });
});

describe("the summary of the details", () => {
  it("gives the status and the reason of Available", () => {
    expect(summaryOf("Available: True, Available since 26/11/2026, 10:04:00")).toEqual({
      status: "True",
      reason: "Available",
    });
    expect(summaryOf("Available: N/A, N/A")).toEqual({ status: "N/A", reason: "N/A" });
    expect(summaryOf("Health: Degraded")).toBeUndefined();
  });
});

describe("the lists of the Clusters that the page of the Sveltos extension sends without a watch", () => {
  it("are the GETs of the Clusters at v1beta1, in a namespace or over the whole cluster, with no watch, sent from the write to the update", () => {
    const origin = "https://0123abcd.renderer.freelens.app:9081/api-kube/apis/cluster.x-k8s.io";
    const requests = [
      { method: "GET", url: `${origin}/v1beta1/namespaces/default/clusters`, at: 1000 },
      { method: "GET", url: `${origin}/v1beta1/namespaces/default/clusters?watch=1&resourceVersion=7`, at: 1200 },
      { method: "GET", url: `${origin}/v1beta2/namespaces/default/clusters`, at: 1300 },
      { method: "GET", url: `${origin}/v1beta1/namespaces/default/machines`, at: 1400 },
      { method: "GET", url: `${origin}/v1beta1/clusters?limit=500`, at: 1500 },
      { method: "POST", url: `${origin}/v1beta1/namespaces/default/clusters`, at: 1600 },
      { method: "GET", url: `${origin}/v1beta1/namespaces/default/clusters/freelens-capi-md`, at: 1700 },
      { method: "GET", url: `${origin}/v1beta1/namespaces/default/clusters`, at: 999 },
      { method: "GET", url: `${origin}/v1beta1/namespaces/default/clusters`, at: 2001 },
    ];

    // The list in default and the one over the whole cluster; not a watch, the list of this extension at v1beta2,
    // another kind, a create, the get of one Cluster, or a list before the write or after the update.
    expect(clusterListsBetween(requests, 1000, 2000).map((request) => request.at)).toEqual([1000, 1500]);
    expect(clusterListsBetween(requests, 1001, 1499)).toEqual([]);
  });
});

// A table of the tool: the header, then a row for each list of cells, each column padded to its widest cell, two
// spaces after a cell of a row and one after a title of the header, as the tool lays them out, by the width that a
// cell shows, the colors of a terminal left out (internal/util/tree/tree.go:69-93).
const TITLES = ["NAME", "REPLICAS", "AVAILABLE", "READY", "UP TO DATE", "STATUS", "REASON", "SINCE", "MESSAGE"];

function shown(cell: string): number {
  return cell.replaceAll(/\u001b\[[0-9;]*m/g, "").length;
}

function laidOut(rows: readonly (readonly string[])[]): string {
  const widths = TITLES.map((title, column) =>
    Math.max(title.length + 1, ...rows.map((row) => shown(row[column] ?? "") + 2)),
  );
  const line = (cells: readonly string[]) =>
    TITLES.map((_, column) => {
      const cell = cells[column] ?? "";

      return `${cell}${" ".repeat(widths[column] - shown(cell))}`;
    }).join("");

  return [line(TITLES), ...rows.map(line), ""].join("\n");
}

const [T, L, P] = ["\u251c\u2500", "\u2514\u2500", "\u2502 "];

// What the tool prints of freelens-capi-md with the flags of the session of the tree, children by z-order, the node
// Templates first, then by the text of their rows (R4.13), with a message that it wraps on two more rows (R4.26).
const MD_TREE = laidOut([
  ["Cluster default/freelens-capi-md, v1.37.0", "3/3", "3", "3", "3", "True", "Available", "5m"],
  [`${T}ClusterResourceSets`],
  [`${P}${L}ClusterResourceSet default/freelens-capi-md-kindnet`],
  [`${T}DevCluster default/freelens-capi-md-p4sj9`, "", "", "", "", "True", "Ready", "6m"],
  [`${T}KubeadmControlPlane default/freelens-capi-md-wqmfr, v1.37.0`, "1/1", "1", "1", "1", "True", "Available", "5m"],
  [`${P}${T}Templates`],
  [`${P}${P}${L}DevMachineTemplate default/freelens-capi-md-control-plane-7k2fs`],
  [`${P}${L}Machine default/freelens-capi-md-wqmfr-zq9pl, v1.37.0`, "1", "1", "1", "1", "True", "Ready", "5m"],
  [`${P}  ${T}DevMachine default/freelens-capi-md-wqmfr-zq9pl`, "", "", "", "", "True", "Ready", "5m"],
  [`${P}  ${L}KubeadmConfig default/freelens-capi-md-wqmfr-zq9pl`, "", "", "", "", "True", "Ready", "6m"],
  [`${L}Workers`],
  [
    `  ${L}MachineDeployment default/freelens-capi-md-md-0-ttd2x, v1.37.0`,
    "2/2",
    "2",
    "1",
    "2",
    "False",
    "NotAvailable",
    "1m",
    "* Machine freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q:",
  ],
  ["    ", "", "", "", "", "", "", "", "  * NodeHealthy: Node is not ready"],
  [`    ${T}Templates`],
  [`    ${P}${T}DevMachineTemplate default/freelens-capi-md-md-0-hzs4n`],
  [`    ${P}${L}KubeadmConfigTemplate default/freelens-capi-md-md-0-b2kgl`],
  [`    ${L}MachineSet default/freelens-capi-md-md-0-ttd2x-b4lzj, v1.37.0`, "2/2", "2", "1", "2"],
  [
    `      ${T}Machine default/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q, v1.37.0`,
    "1",
    "1",
    "0",
    "1",
    "False",
    "NotReady",
    "1m",
    "* NodeHealthy:",
  ],
  [`      ${P}${P}`, "", "", "", "", "", "", "", "  * Node is not ready"],
  [`      ${P}${T}DevMachine default/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`, "", "", "", "", "True", "Ready", "2m"],
  [
    `      ${P}${L}KubeadmConfig default/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`,
    "",
    "",
    "",
    "",
    "True",
    "Ready",
    "2m",
  ],
  [
    `      ${L}Machine default/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d, v1.37.0`,
    "1",
    "1",
    "1",
    "1",
    "True",
    "Ready",
    "3m",
  ],
  [`        ${T}DevMachine default/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`, "", "", "", "", "True", "Ready", "3m"],
  [`        ${L}KubeadmConfig default/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`, "", "", "", "", "True", "Ready", "3m"],
]);

const CORE = "cluster.x-k8s.io";
const INFRASTRUCTURE = "infrastructure.cluster.x-k8s.io";
const BOOTSTRAP = "bootstrap.cluster.x-k8s.io";
const ROOT = `${CORE}/Cluster/freelens-capi-md`;
const KCP = "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-md-wqmfr";
const MD = `${CORE}/MachineDeployment/freelens-capi-md-md-0-ttd2x`;
const MS = `${CORE}/MachineSet/freelens-capi-md-md-0-ttd2x-b4lzj`;
const CRS = "addons.cluster.x-k8s.io/ClusterResourceSet/freelens-capi-md-kindnet";

function node(id: string, depth: number, parent?: string): ReadNode {
  return { id, depth, parent };
}

// The tree of the extension of the same Cluster, as the session reads it with every node expanded, in the order of
// P14, with what the tool leaves out: the class, the binding, the entry of the ClusterResourceSet, and the checks.
const MD_NODES: readonly ReadNode[] = [
  node(ROOT, 0),
  node(`${INFRASTRUCTURE}/DevCluster/freelens-capi-md-p4sj9`, 1, ROOT),
  node(KCP, 1, ROOT),
  node(`${CORE}/Machine/freelens-capi-md-wqmfr-zq9pl`, 2, KCP),
  node(`${INFRASTRUCTURE}/DevMachine/freelens-capi-md-wqmfr-zq9pl`, 3, `${CORE}/Machine/freelens-capi-md-wqmfr-zq9pl`),
  node(`${BOOTSTRAP}/KubeadmConfig/freelens-capi-md-wqmfr-zq9pl`, 3, `${CORE}/Machine/freelens-capi-md-wqmfr-zq9pl`),
  node(`virtual:templates:${KCP}`, 2, KCP),
  node(`${INFRASTRUCTURE}/DevMachineTemplate/freelens-capi-md-control-plane-7k2fs`, 3, `virtual:templates:${KCP}`),
  node("virtual:workers", 1, ROOT),
  node(MD, 2, "virtual:workers"),
  node(MS, 3, MD),
  node(`${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`, 4, MS),
  node(
    `${INFRASTRUCTURE}/DevMachine/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`,
    5,
    `${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`,
  ),
  node(
    `${BOOTSTRAP}/KubeadmConfig/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`,
    5,
    `${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q`,
  ),
  node(`${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`, 4, MS),
  node(
    `${INFRASTRUCTURE}/DevMachine/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`,
    5,
    `${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`,
  ),
  node(
    `${BOOTSTRAP}/KubeadmConfig/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`,
    5,
    `${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`,
  ),
  node(`virtual:templates:${MD}`, 3, MD),
  node(`${INFRASTRUCTURE}/DevMachineTemplate/freelens-capi-md-md-0-hzs4n`, 4, `virtual:templates:${MD}`),
  node(`${BOOTSTRAP}/KubeadmConfigTemplate/freelens-capi-md-md-0-b2kgl`, 4, `virtual:templates:${MD}`),
  node(`${CORE}/ClusterClass/quick-start`, 1, ROOT),
  node("virtual:add-ons", 1, ROOT),
  node(CRS, 2, "virtual:add-ons"),
  node("entry:freelens-capi-md-kindnet:ConfigMap/cni-freelens-capi-md-kindnet", 3, CRS),
  node("addons.cluster.x-k8s.io/ClusterResourceSetBinding/freelens-capi-md", 2, "virtual:add-ons"),
  node("virtual:health-checks", 1, ROOT),
  node(`${CORE}/MachineHealthCheck/freelens-capi-md-md-0-ttd2x`, 2, "virtual:health-checks"),
];

describe("the tree that clusterctl describe cluster prints with every row of an object shown (SPEC-0005, With the real project)", () => {
  it("is asked with the flags that show every MachineSet, the templates, the ClusterResourceSets, every infrastructure machine and bootstrap config, and every Machine", () => {
    expect(TREE_FLAGS).toEqual([
      "--show-machinesets",
      "--show-templates",
      "--show-resourcesets",
      "--echo",
      "--grouping=false",
    ]);
  });

  it("reads each row: its depth from its prefix, the object that it names or its virtual node, the row above it, and its cells read where its header puts them", () => {
    const rows = describedTree(MD_TREE);
    const names = rows.map((row) =>
      row.object === undefined ? `${row.depth} ${row.virtual}` : `${row.depth} ${row.object.kind} ${row.object.name}`,
    );

    expect(names).toEqual([
      "0 Cluster freelens-capi-md",
      "1 ClusterResourceSets",
      "2 ClusterResourceSet freelens-capi-md-kindnet",
      "1 DevCluster freelens-capi-md-p4sj9",
      "1 KubeadmControlPlane freelens-capi-md-wqmfr",
      "2 Templates",
      "3 DevMachineTemplate freelens-capi-md-control-plane-7k2fs",
      "2 Machine freelens-capi-md-wqmfr-zq9pl",
      "3 DevMachine freelens-capi-md-wqmfr-zq9pl",
      "3 KubeadmConfig freelens-capi-md-wqmfr-zq9pl",
      "1 Workers",
      "2 MachineDeployment freelens-capi-md-md-0-ttd2x",
      "3 Templates",
      "4 DevMachineTemplate freelens-capi-md-md-0-hzs4n",
      "4 KubeadmConfigTemplate freelens-capi-md-md-0-b2kgl",
      "3 MachineSet freelens-capi-md-md-0-ttd2x-b4lzj",
      "4 Machine freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q",
      "5 DevMachine freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q",
      "5 KubeadmConfig freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q",
      "4 Machine freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d",
      "5 DevMachine freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d",
      "5 KubeadmConfig freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d",
    ]);
    // The row above each row, by its name.
    expect(
      rows.map((row) => (row.parent === undefined ? "" : (rows[row.parent].object?.name ?? rows[row.parent].virtual))),
    ).toEqual([
      "",
      "freelens-capi-md",
      "ClusterResourceSets",
      "freelens-capi-md",
      "freelens-capi-md",
      "freelens-capi-md-wqmfr",
      "Templates",
      "freelens-capi-md-wqmfr",
      "freelens-capi-md-wqmfr-zq9pl",
      "freelens-capi-md-wqmfr-zq9pl",
      "freelens-capi-md",
      "Workers",
      "freelens-capi-md-md-0-ttd2x",
      "Templates",
      "Templates",
      "freelens-capi-md-md-0-ttd2x",
      "freelens-capi-md-md-0-ttd2x-b4lzj",
      "freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q",
      "freelens-capi-md-md-0-ttd2x-b4lzj-5rk7q",
      "freelens-capi-md-md-0-ttd2x-b4lzj",
      "freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d",
      "freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d",
    ]);
    expect(rows[0].object).toEqual({
      kind: "Cluster",
      namespace: "default",
      name: "freelens-capi-md",
      version: "v1.37.0",
      deleted: false,
    });
    // A cell that the tool leaves empty stays empty, and the cells after it stay in their columns.
    expect(rows[3]).toMatchObject({ replicas: "", available: "", status: "True", reason: "Ready" });
    expect(rows[11]).toMatchObject({
      replicas: "2/2",
      available: "2",
      ready: "1",
      upToDate: "2",
      status: "False",
      reason: "NotAvailable",
    });
    expect(rows[15]).toMatchObject({
      replicas: "2/2",
      available: "2",
      ready: "1",
      upToDate: "2",
      status: "",
      reason: "",
    });
    expect(rows[5]).toMatchObject({ virtual: "Templates", replicas: "", status: "" });
  });

  it("reads a row of an object that is deleting by its mark, the colors of a terminal left out, and nothing without a header", () => {
    const rows = describedTree(
      laidOut([
        [
          "\u001b[1mCluster default/workload, v1.37.0\u001b[0m",
          "1/1",
          "1",
          "1",
          "1",
          "\u001b[32mTrue\u001b[0m",
          "Available",
          "1m",
        ],
        [
          `${L}\u001b[31m!! DELETED !!\u001b[0m Machine default/workload-a, v1.37.0`,
          "1",
          "0",
          "0",
          "1",
          "False",
          "Deleting",
          "1m",
        ],
      ]),
    );

    expect(rows.map((row) => row.object)).toEqual([
      { kind: "Cluster", namespace: "default", name: "workload", version: "v1.37.0", deleted: false },
      { kind: "Machine", namespace: "default", name: "workload-a", version: "v1.37.0", deleted: true },
    ]);
    expect(rows[0].status).toBe("True");
    expect(describedTree("Error: not found\n")).toEqual([]);
  });

  it("agrees with the tree of the extension of the same Cluster, which has the class, the binding, the entries and the checks beside it", () => {
    expect(objectOfNode(KCP)).toEqual({
      group: "controlplane.cluster.x-k8s.io",
      kind: "KubeadmControlPlane",
      name: "freelens-capi-md-wqmfr",
    });
    expect(objectOfNode("cluster.x-k8s.io/ClusterClass/classes/quick-start")).toMatchObject({ name: "quick-start" });
    expect(objectOfNode("virtual:workers")).toBeUndefined();
    expect(treeDifferences(describedTree(MD_TREE), MD_NODES)).toEqual([]);
  });

  it("finds a row of an object that is no node of the tree, a node under another node or at another depth, and a node that the tool does not print", () => {
    const described = describedTree(MD_TREE);
    const machine = `${CORE}/Machine/freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d`;
    const elsewhere = MD_NODES.map((each) =>
      each.id === machine
        ? node(machine, 3, MD)
        : each.id === `${CORE}/ClusterClass/quick-start`
          ? node("virtual:other-objects", 1, ROOT)
          : each,
    );

    expect(treeDifferences(described, elsewhere)).toEqual([
      `Machine freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d sits under ${MD}, and under ${MS} in clusterctl`,
      "Machine freelens-capi-md-md-0-ttd2x-b4lzj-x8m2d is at depth 3, and 4 in clusterctl",
      `the tree has virtual:other-objects under ${ROOT}, which clusterctl does not print`,
    ]);
    expect(
      treeDifferences(
        described,
        MD_NODES.filter((each) => each.id !== CRS),
      ),
    ).toEqual(["clusterctl prints ClusterResourceSet freelens-capi-md-kindnet, of which the tree has 0 nodes"]);
    expect(
      treeDifferences(
        described,
        MD_NODES.filter((each) => each.id !== "virtual:workers"),
      ),
    ).toEqual(["clusterctl prints the virtual node Workers, which the tree has no node of"]);
  });

  it("leaves a template that only an older MachineSet names, with its node Templates, among what the tool does not print", () => {
    const older = `${CORE}/MachineSet/freelens-capi-md-md-0-ttd2x-older`;
    const nodes = [
      ...MD_NODES,
      node(older, 3, MD),
      node(`virtual:templates:${older}`, 4, older),
      node(`${INFRASTRUCTURE}/DevMachineTemplate/freelens-capi-md-md-0-older`, 5, `virtual:templates:${older}`),
    ];

    expect(treeDifferences(describedTree(MD_TREE), nodes)).toEqual([
      `the tree has ${older} under ${MD}, which clusterctl does not print`,
    ]);
  });

  it("reads a Machine under the virtual node Other of the tool where the tree places it, by its own node above it alone", () => {
    const orphan = "freelens-capi-md-orphan";
    const described = describedTree(
      laidOut([
        ["Cluster default/freelens-capi-md, v1.37.0", "1/1", "1", "1", "1", "True", "Available", "5m"],
        [`${L}Workers`],
        [`  ${L}Other`],
        [`    ${L}Machine default/${orphan}, v1.37.0`, "1", "0", "0", "0", "False", "NotReady", "1m"],
        [`      ${L}DevMachine default/${orphan}`, "", "", "", "", "False", "NotReady", "1m"],
      ]),
    );
    const nodes = [
      node(ROOT, 0),
      node("virtual:workers", 1, ROOT),
      node("virtual:other-objects", 1, ROOT),
      node(`${CORE}/Machine/${orphan}`, 2, "virtual:other-objects"),
      node(`${INFRASTRUCTURE}/DevMachine/${orphan}`, 3, `${CORE}/Machine/${orphan}`),
    ];

    expect(treeDifferences(described, nodes)).toEqual([
      `the tree has virtual:other-objects under ${ROOT}, which clusterctl does not print`,
    ]);
    expect(
      treeDifferences(
        described,
        nodes.map((each) =>
          each.id.endsWith(`DevMachine/${orphan}`) ? node(each.id, 3, "virtual:other-objects") : each,
        ),
      ),
    ).toContain(
      `DevMachine ${orphan} sits under virtual:other-objects, and under ${CORE}/Machine/${orphan} in clusterctl`,
    );
  });

  it("gives each row the condition that the tool shows: Available on a Cluster, a MachineDeployment and a control plane, else Ready, and none on a MachineSet or a MachinePool", () => {
    const rows = describedTree(MD_TREE);
    const type = (name: string) => {
      const row = rows.find((each) => each.object?.name === name || each.virtual === name);

      if (row === undefined) throw new Error(`No row ${name}`);
      return describedConditionType(row, rows);
    };

    expect(type("freelens-capi-md")).toBe("Available");
    expect(type("freelens-capi-md-wqmfr")).toBe("Available");
    expect(type("freelens-capi-md-p4sj9")).toBe("Ready");
    expect(type("freelens-capi-md-md-0-ttd2x")).toBe("Available");
    expect(type("freelens-capi-md-md-0-ttd2x-b4lzj")).toBeUndefined();
    expect(type("freelens-capi-md-wqmfr-zq9pl")).toBe("Ready");
    expect(type("Workers")).toBeUndefined();

    const pool = describedTree(
      laidOut([
        ["Cluster default/freelens-capi-mp, v1.37.0", "2/2", "1", "1", "2", "True", "Available", "5m"],
        [`${L}Workers`],
        [`  ${L}MachinePool default/freelens-capi-mp-mp-0-ab12c, v1.37.0`],
      ]),
    );

    expect(describedConditionType(pool[2], pool)).toBeUndefined();
  });

  it("reads the condition of the summary of the details of a node", () => {
    expect(summaryConditionOf("Ready: True, Ready since 27/11/2026, 05:00:00")).toEqual({
      type: "Ready",
      status: "True",
      reason: "Ready",
    });
    expect(summaryConditionOf("Available: False, NotAvailable")).toEqual({
      type: "Available",
      status: "False",
      reason: "NotAvailable",
    });
    expect(summaryConditionOf("No summary")).toBeUndefined();
  });

  it("compares the counters of a row of a control plane or a MachineDeployment with those of the tooltip of the cell Replicas of its node", () => {
    const rows = describedTree(MD_TREE);
    const deployment = rows[11];
    const counters = replicaCountersOf([
      "Desired: 2 Machines",
      "Current: 2 Machines",
      "Ready: 1 Machine",
      "Available: 2 Machines",
      "Up to date: 2 Machines",
    ]);

    expect(counters).toEqual(
      new Map([
        ["desired", 2],
        ["current", 2],
        ["ready", 1],
        ["available", 2],
        ["up to date", 2],
      ]),
    );
    expect(countersDifferences(deployment, counters)).toEqual([]);
    expect(
      countersDifferences(
        deployment,
        replicaCountersOf([
          "Desired: 2 Machines",
          "Current: 3 Machines",
          "Ready: N/A, not written yet",
          "Available: 2 Machines, the desired less 0 unavailable",
          "Up to date: 2 Machines",
        ]),
      ),
    ).toEqual([
      "MachineDeployment freelens-capi-md-md-0-ttd2x: replicas 3/2 in the tree, 2/2 in clusterctl",
      "MachineDeployment freelens-capi-md-md-0-ttd2x: ready nothing in the tree, 1 in clusterctl",
    ]);
  });
});
