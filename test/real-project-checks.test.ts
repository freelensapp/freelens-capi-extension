// What the session of the real project compares (SPEC-0004, "With the real project"), with no cluster: the row of a
// Cluster that `clusterctl describe cluster` prints, the counters of the details, and the row that they give, summed as
// the project sums them (SPEC-0001, R4.21, R4.22). The tables below are written for these cases, in the layout of
// R4.21: the columns of R4.21, no border, and cells at least two spaces apart.

import { describe, expect, it } from "vitest";
import { countersOf, describedCluster, summaryOf, summedCounters } from "../integration/__tests__/real-project-checks";

const HEADER =
  "NAME                                       REPLICAS  AVAILABLE  READY  UP TO DATE  STATUS  REASON     SINCE  MESSAGE";

function table(...rows: string[]): string {
  return [HEADER, ...rows, ""].join("\n");
}

describe("the row of a Cluster that clusterctl describe cluster prints (R4.21, R4.22)", () => {
  it("is the line of the Cluster, with the version of its topology, its counters, and the status and reason of Available", () => {
    const output = table(
      "Cluster default/workload-a, v1.37.0         3/3       3          3      3           True    Available  12m",
      // The prefixes of the tree, which clusterctl draws with the box drawing characters.
      "├─ClusterInfrastructure - DevCluster default/workload-a-x1",
      "└─Workers",
      "  └─MachineDeployment default/workload-a-md-0, v1.37.0  2/2  2  2  2  True  Available  10m",
    );

    expect(describedCluster(output, "default", "workload-a")).toEqual({
      replicas: "3/3",
      available: "3",
      ready: "3",
      upToDate: "3",
      status: "True",
      reason: "Available",
    });
  });

  it("is read without the colors of a terminal, the message of its first line left aside, and without a topology", () => {
    const output = table(
      "\u001b[1mCluster default/workload-b\u001b[0m  2/2  1  1  2  \u001b[32mTrue\u001b[0m  Available  3m  * ControlPlaneAvailable: ok",
    );

    expect(describedCluster(output, "default", "workload-b")).toMatchObject({
      replicas: "2/2",
      available: "1",
      status: "True",
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

  it("gives the current of the desired, and the sum of each counter, a counter not written counting as zero", () => {
    const controlPlane = countersOf("1 desired, 1 current, 1 ready, 1 available, 1 up to date");
    const workers = countersOf("2 desired, 3 current, 2 ready, 2 available, N/A up to date");

    expect(summedCounters(controlPlane, workers)).toEqual({
      replicas: "4/3",
      available: "3",
      ready: "3",
      upToDate: "1",
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
