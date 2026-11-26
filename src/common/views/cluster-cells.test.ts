import { describe, expect, it } from "vitest";
import { CAPTURE, fixtureSet, ofKind } from "../../../test/fixture-sets";
import { ACTIVITY_NAMES } from "../status/activity";
import {
  activityCell,
  classCell,
  compareVersions,
  countersCell,
  healthCell,
  rowCells,
  searchWords,
  statusCell,
  versionCell,
  versionRanks,
} from "./cluster-cells";
import { clusterRowOf, indexContext, StatusMemo } from "./context";
import { NO_READS, reduceReads } from "./read-state";
import { ACTIVITY_ORDER } from "./words";

import type { Activity, ClusterObject, ObjectStatus } from "../status/index";
import type { ClusterRow } from "./context";
import type { ReadEvent } from "./read-state";

// The cases of SPEC-0004, "Tests", "Unit", `cluster-cells.test.ts`: the cells of the list (P7 to P12, P14, P28), from
// the Clusters of the fixtures of SPEC-0002 and what the status model gives them.

const KINDS = ["Machine", "MachineSet", "MachineDeployment", "MachinePool", "MachineHealthCheck", "ClusterClass"];

// The row of the Cluster of a state of the fixtures, with every kind of its context read.
function rowOf(state: string, now = CAPTURE): ClusterRow {
  const objects = fixtureSet(state);
  const namespaces = [...new Set(objects.map((object) => object.metadata.namespace ?? ""))];
  const keys = [...KINDS, "KubeadmControlPlane"];
  const events: ReadEvent[] = [{ type: "filter-changed", namespaces, selectedAll: false }];

  keys.forEach((key, index) => {
    events.push({ type: "load-started", kind: key, id: index, namespaces });
    events.push({ type: "load-ended", kind: key, id: index, overWholeCluster: false, followed: true, at: CAPTURE });
  });

  const reads = events.reduce(reduceReads, NO_READS);
  const items = (kind: string) => objects.filter((object) => object.kind === kind) as never[];
  const index = indexContext({
    reads,
    machines: { key: "Machine", items: items("Machine") },
    machineSets: { key: "MachineSet", items: items("MachineSet") },
    machineDeployments: { key: "MachineDeployment", items: items("MachineDeployment") },
    machinePools: { key: "MachinePool", items: items("MachinePool") },
    healthChecks: { key: "MachineHealthCheck", items: items("MachineHealthCheck") },
    clusterClasses: { key: "ClusterClass", items: items("ClusterClass") },
    operator: [],
    controlPlanes: new Map([
      [
        "controlplane.cluster.x-k8s.io/KubeadmControlPlane",
        {
          key: "KubeadmControlPlane",
          items: items("KubeadmControlPlane"),
          resolution: {
            state: "resolved",
            reference: { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane", name: "" },
            apiVersion: "controlplane.cluster.x-k8s.io/v1beta2",
            plural: "kubeadmcontrolplanes",
            contract: "v1beta2",
            provider: "control-plane-kubeadm",
          },
        },
      ],
    ]),
  });

  return clusterRowOf(index, ofKind<ClusterObject>(objects, "Cluster")[0], now, new StatusMemo());
}

function clusterOf(state: string): ClusterObject {
  return ofKind<ClusterObject>(fixtureSet(state), "Cluster")[0];
}

function withStatus(cluster: ClusterObject, status: Record<string, unknown>): ClusterObject {
  return { ...cluster, status: { ...cluster.status, ...status } };
}

describe("the counters (P8)", () => {
  it("show the available Machines of the desired, with every counter and its unit in the tooltip", () => {
    const cell = countersCell(clusterOf("scaling-up"), "controlPlane");

    expect(cell.text).toBe("1/3");
    expect(cell.tooltip).toEqual([
      "Desired: 3 Machines",
      "Current: 2 Machines",
      "Ready: 1 Machine",
      "Available: 1 Machine",
      "Up to date: 2 Machines",
    ]);
  });

  it("read N/A for each counter not written, and N/A when none is", () => {
    const cluster = clusterOf("healthy");
    const partial = withStatus(cluster, { workers: { desiredReplicas: 2 } });

    expect(countersCell(partial, "workers").text).toBe("N/A/2");
    expect(countersCell(partial, "workers").tooltip).toContain("Available: N/A, not written yet");
    expect(countersCell(clusterOf("no-status"), "workers").text).toBe("N/A");
  });

  it("say on the workers that a MachinePool without Machines counts the instances of its provider", () => {
    const row = rowOf("machine-pool-without-machines");

    expect(row.poolsWithoutMachines).toBe(1);
    expect(rowCells(row).workers.tooltip.join(" ")).toMatch(/count the instances of its provider/);
    expect(rowCells(rowOf("machine-pools")).workers.tooltip.join(" ")).not.toMatch(/instances of its provider/);
  });
});

describe("the version (P9)", () => {
  it("is that of the topology, else the versions of the control plane oldest first, else N/A", () => {
    const withoutTopology = clusterOf("without-topology");
    const mixed = withStatus(withoutTopology, {
      controlPlane: {
        versions: [
          { version: "v1.37.0", replicas: 2 },
          { version: "v1.36.4", replicas: 1 },
        ],
      },
    });

    expect(versionCell(clusterOf("healthy")).text).toBe("v1.37.0");
    expect(versionCell(mixed)).toMatchObject({ text: "v1.36.4, v1.37.0", first: "v1.36.4" });
    expect(versionCell(mixed).tooltip).toContain("Control plane: v1.36.4: 1 Machine, v1.37.0: 2 Machines");
    expect(versionCell(clusterOf("no-status"))).toMatchObject({ text: "N/A", first: undefined });
  });

  it("shows a version that the parser does not know as written, and sorts it last", () => {
    const cluster = withStatus(clusterOf("without-topology"), {
      controlPlane: { versions: [{ version: "latest" }, { version: "v1.36.4" }] },
    });

    expect(versionCell(cluster).text).toBe("v1.36.4, latest");
    expect(compareVersions("latest", "v1.37.0")).toBeGreaterThan(0);

    const ranks = versionRanks(["v1.37.0", "latest", "v1.36.4", undefined, "v1.37.0"]);

    expect([ranks.get("v1.36.4"), ranks.get("v1.37.0"), ranks.get("latest")]).toEqual([0, 1, 2]);
  });
});

describe("the ClusterClass", () => {
  it("is the name of the class, with its namespace when it is not that of the Cluster, and N/A with no topology", () => {
    const cluster = clusterOf("healthy");
    const elsewhere: ClusterObject = {
      ...cluster,
      spec: {
        ...cluster.spec,
        topology: { classRef: { name: "quick-start", namespace: "classes" }, version: "v1.37.0" },
      },
    };

    expect(classCell(cluster)).toMatchObject({ text: "quick-start", tooltip: undefined });
    expect(classCell(elsewhere)).toMatchObject({ text: "classes/quick-start", tooltip: "In the namespace classes" });
    expect(classCell(clusterOf("without-topology"))).toMatchObject({
      text: "N/A",
      tooltip: "This Cluster has no managed topology",
    });
  });
});

// A result of the model with these activities, the rest as statusOf writes it.
function statusWith(activities: Partial<Activity>[], flags: { idle?: boolean; unknown?: boolean } = {}): ObjectStatus {
  return {
    ...rowOf("healthy").status,
    activities: {
      state: "read",
      activities: activities.map((activity) => ({
        name: "Rolling out",
        state: "Progressing",
        since: undefined,
        threshold: undefined,
        tone: "progress",
        condition: undefined,
        source: undefined,
        ...activity,
      })),
      idle: flags.idle ?? false,
      unknown: flags.unknown ?? false,
      changesAt: undefined,
      notes: [],
    },
  };
}

describe("the activities (P7)", () => {
  it("are in the order of the closed set of SPEC-0003, Replacing included, which is the model's", () => {
    expect([...ACTIVITY_ORDER]).toEqual([...ACTIVITY_NAMES]);
  });

  it("say each activity in its words, its state when it is not Progressing, and its duration from its start", () => {
    const cell = activityCell(
      statusWith([
        {
          name: "Rolling out",
          state: "Progressing",
          since: { state: "accepted", text: "2025-12-31T23:50:00Z", instant: 0 },
        },
        { name: "Scaling up", state: "Blocked", tone: "warning" },
        { name: "Remediating", state: "Unknown", tone: "vague" },
        { name: "Replacing", since: { state: "unavailable" } },
      ]),
    );

    expect(cell.marks).toEqual([
      { word: "Rolling out", tone: "info", since: { state: "written", text: "2025-12-31T23:50:00Z" } },
      { word: "Scaling up", tone: "warning", state: "Blocked" },
      { word: "Remediating", tone: "vague", state: "Unknown" },
      { word: "Replacing", tone: "info", since: { state: "unavailable" } },
    ]);
  });

  it("are Idle when none holds and every source was read, and Unknown next to them when a source was not", () => {
    expect(activityCell(rowOf("healthy").status).marks).toEqual([{ word: "Idle", tone: "info" }]);
    expect(activityCell(statusWith([{ name: "Deleting", tone: "terminated" }], { unknown: true })).marks).toEqual([
      { word: "Deleting", tone: "terminated" },
      { word: "Unknown", tone: "vague" },
    ]);
    expect(activityCell(statusWith([], { unknown: true })).marks).toEqual([{ word: "Unknown", tone: "vague" }]);
  });

  it("sort worst first: by the first activity in the order of the closed set, then Unknown alone, then Idle (P28)", () => {
    const deleting = activityCell(statusWith([{ name: "Deleting" }, { name: "Paused" }])).sort;
    const replacing = activityCell(statusWith([{ name: "Replacing" }])).sort;
    const unknown = activityCell(statusWith([], { unknown: true })).sort;
    const idle = activityCell(statusWith([], { idle: true })).sort;

    expect([deleting, replacing, unknown, idle]).toEqual([0, 10, 11, 12]);
  });
});

describe("the health (P12)", () => {
  it("is the word of the model in its tone, the tone of progress while an activity sets it", () => {
    expect(healthCell(rowOf("healthy").status).mark).toEqual({ word: "Healthy", tone: "ok" });
    expect(healthCell(rowOf("upgrading").status).mark).toEqual({ word: "Degraded", tone: "info" });
    expect(healthCell(rowOf("provisioning").status).mark).toEqual({ word: "Unhealthy", tone: "info" });
    expect(healthCell(rowOf("no-status").status).mark).toEqual({ word: "Unknown", tone: "vague" });
  });

  it("turns to the tone of a warning at the time that the result names, with no other input changed", () => {
    const row = rowOf("provisioning");
    const changesAt = row.status.changesAt as number;

    expect(healthCell(row.status).mark).toEqual({ word: "Unhealthy", tone: "info" });
    expect(healthCell(rowOf("provisioning", changesAt - 1).status).mark?.tone).toBe("info");
    expect(healthCell(rowOf("provisioning", changesAt).status).mark).toEqual({ word: "Unhealthy", tone: "warning" });
  });

  it("is N/A for a Cluster that is deleting, with the reason", () => {
    expect(healthCell(rowOf("deleting").status)).toMatchObject({ mark: undefined, none: "deleting" });
  });

  it("says stale with each cause and when it began, and counts the MachinePools of unknown health", () => {
    const paused = healthCell(rowOf("paused").status);
    const pool = healthCell(rowOf("machine-pool-without-machines").status);

    expect(paused.stale).toEqual([
      { cause: "Paused", detail: undefined, since: { state: "written", text: "2025-12-31T23:59:45Z" } },
    ]);
    expect(pool.poolsUnknown).toBe(1);
    expect(healthCell(rowOf("machine-pools").status).poolsUnknown).toBe(0);
  });

  it("sorts worst first: Unhealthy, Degraded, Unknown, Healthy, then no health (P28)", () => {
    const sorts = ["provisioning", "upgrading", "no-status", "healthy", "deleting"].map(
      (state) => healthCell(rowOf(state).status).sort,
    );

    expect(sorts).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("the status (P11)", () => {
  it("is the headline of the message of Available, with every line in its tooltip", () => {
    const cell = statusCell(rowOf("scaling-up").conditions);

    expect(cell.text).toBe("* WorkersAvailable:");
    expect(cell.lines).toHaveLength(2);
    expect(cell.lines[1].indentation).toBe(2);
    expect(cell.lines[1].text).toMatch(/^\* MachineDeployment freelens-capi-scaling-up-md-0-/);
  });

  it("is the reason of Available when its message is empty, and N/A when the Cluster reports none", () => {
    expect(statusCell(rowOf("healthy").conditions)).toMatchObject({ text: "Available", reported: true });
    expect(statusCell(rowOf("no-status").conditions)).toMatchObject({ text: "N/A", reported: false });
  });
});

describe("the search (P14)", () => {
  it("matches the words that the columns show: the health, stale, the activities, the version and the class", () => {
    const words = rowCells(rowOf("paused")).search;

    expect(words).toEqual(expect.arrayContaining(["Healthy", "stale", "Paused", "v1.37.0", "quick-start"]));
  });

  it("gives no word of a mark that shows the spinner", () => {
    const row = rowOf("healthy");
    const cells = rowCells({ ...row, pending: true });

    expect(cells.search).toEqual(["v1.37.0", "quick-start"]);
    expect(
      searchWords({ health: undefined, activity: undefined, version: cells.version, clusterClass: cells.clusterClass }),
    ).toEqual(["v1.37.0", "quick-start"]);
  });
});
