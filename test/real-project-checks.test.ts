// What the sessions of the real tier compare (SPEC-0004, "With the real project"), with no cluster: the row of a
// Cluster that `clusterctl describe cluster` prints, the counters of the details, the row that they give, summed as the
// project sums them (SPEC-0001, R4.21, R4.22), and the lists of the Clusters that the page of the Sveltos extension
// sends without a watch. The tables below are written for these cases, in the layout of R4.21: the columns of R4.21, no
// border, and cells at least two spaces apart. Every counter of a row, and of a sum, has a value of its own, so that
// two counters read in each other's place fail.

import { describe, expect, it } from "vitest";
import {
  clusterListsBetween,
  countersOf,
  describedCluster,
  summaryOf,
  summedCounters,
} from "../integration/__tests__/real-project-checks";

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
