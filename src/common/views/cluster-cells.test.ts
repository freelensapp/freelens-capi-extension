import { describe, expect, it } from "vitest";
import { CAPTURE, fixtureSet, ofKind, STATES } from "../../../test/fixture-sets";
import { parseConditionMessage } from "../parsers/condition-message";
import { ACTIVITY_NAMES } from "../status/activity";
import {
  activityCell,
  classCell,
  compareVersions,
  countersCell,
  headlineOf,
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

// The row of the Cluster of a state of the fixtures, with every kind of its context read, and the Cluster as a case
// changes it.
function rowOf(
  state: string,
  now = CAPTURE,
  change: (cluster: ClusterObject) => ClusterObject = (cluster) => cluster,
): ClusterRow {
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

  return clusterRowOf(index, change(ofKind<ClusterObject>(objects, "Cluster")[0]), now, new StatusMemo());
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

describe("the sort of the counters and of the class (P28)", () => {
  it("is by the available Machines, then the desired, a counter not written last", () => {
    expect(countersCell(clusterOf("scaling-up"), "controlPlane").sort).toEqual([1, 3]);
    expect(countersCell(clusterOf("scaling-up"), "workers").sort).toEqual([1, 2]);
    expect(countersCell(clusterOf("no-status"), "workers").sort).toEqual([
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]);
  });

  it("is by the name of the class, then its namespace, N/A last", () => {
    const cluster = clusterOf("healthy");
    const elsewhere: ClusterObject = {
      ...cluster,
      spec: {
        ...cluster.spec,
        topology: { classRef: { name: "quick-start", namespace: "classes" }, version: "v1.37.0" },
      },
    };
    const sorts = [classCell(elsewhere).sort, classCell(clusterOf("without-topology")).sort, classCell(cluster).sort];

    // The class of the namespace classes comes before the same class in the namespace of the Cluster.
    expect([...sorts].sort((one, other) => one.join("\u0000").localeCompare(other.join("\u0000")))).toEqual([
      ["quick-start", "classes"],
      ["quick-start", "freelens-capi-healthy"],
      classCell(clusterOf("without-topology")).sort,
    ]);
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

  it("is in its own tone when no activity sets one: Degraded in that of a warning, Unhealthy in that of an error", () => {
    // Past the 28 minutes in which the MachinePool of machine-pools provisions, the Cluster is Idle and Degraded.
    const degraded = rowOf("machine-pools", CAPTURE + 29 * 60 * 1000);
    // The Cluster of healthy, with its Available False, written at this layer alone: Idle and Unhealthy.
    const unhealthy = rowOf("healthy", CAPTURE, (cluster) =>
      withStatus(cluster, {
        conditions: ((cluster.status?.conditions as Record<string, unknown>[] | undefined) ?? []).map((condition) =>
          condition.type === "Available"
            ? { ...condition, status: "False", reason: "NotAvailable", message: "* WorkersAvailable: not available" }
            : condition,
        ),
      }),
    );

    expect(activityCell(degraded.status).marks).toEqual([{ word: "Idle", tone: "info" }]);
    expect(healthCell(degraded.status).mark).toEqual({ word: "Degraded", tone: "warning" });
    expect(activityCell(unhealthy.status).marks).toEqual([{ word: "Idle", tone: "info" }]);
    expect(healthCell(unhealthy.status).mark).toEqual({ word: "Unhealthy", tone: "error" });
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

  it("names each cause of stale, with its detail and when it began", () => {
    const since = { state: "accepted", text: "2025-12-31T23:40:00Z", instant: CAPTURE - 20 * 60 * 1000 } as const;
    const cell = healthCell({
      ...rowOf("healthy").status,
      freshness: [
        { cause: "Older generation", generation: 3, observedGeneration: 2, topologiesHeld: false },
        { cause: "Controller not available", provider: "infrastructure-docker", since },
        { cause: "Workload cluster unreachable", since },
      ],
    });

    expect(cell.stale).toEqual([
      { cause: "Older generation", detail: "generation 3, observed 2", since: undefined },
      {
        cause: "Controller not available",
        detail: "infrastructure-docker",
        since: { state: "written", text: "2025-12-31T23:40:00Z" },
      },
      {
        cause: "Workload cluster unreachable",
        detail: undefined,
        since: { state: "written", text: "2025-12-31T23:40:00Z" },
      },
    ]);
  });

  it("sorts worst first: Unhealthy, Degraded, Unknown, Healthy, then no health (P28)", () => {
    const sorts = ["provisioning", "upgrading", "no-status", "healthy", "deleting"].map(
      (state) => healthCell(rowOf(state).status).sort,
    );

    expect(sorts).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("the status (P11)", () => {
  it("is the first line of the message of Available when it has words of its own, without its bullet, which its tooltip keeps", () => {
    const cell = statusCell(rowOf("provisioning").conditions);

    expect(cell.text).toBe("RemoteConnectionProbe: Remote connection not established yet");
    expect(cell.lines).toHaveLength(4);
    expect(cell.lines[0]).toEqual({
      indentation: 0,
      text: "* RemoteConnectionProbe: Remote connection not established yet",
    });
  });

  it("never starts with the bullet of the parser, in any state of the fixtures", () => {
    const texts = STATES.map((state) => statusCell(rowOf(state).conditions).text);

    expect(texts.filter((text) => text.startsWith("* "))).toEqual([]);
    expect(texts).toContain("RemoteConnectionProbe: Remote connection not established yet");
  });

  it("is the subject of a first line with no words of its own and the first line under it that has some", () => {
    const cell = statusCell(rowOf("scaling-up").conditions);

    expect(cell.text).toBe(
      "WorkersAvailable: MachineDeployment freelens-capi-scaling-up-md-0-474jl: 1 available replicas, at least 2 required (spec.strategy.rollout.maxUnavailable is 0, spec.replicas is 2)",
    );
    expect(cell.lines).toHaveLength(2);
    expect(cell.lines[0]).toEqual({ indentation: 0, text: "* WorkersAvailable:" });
    expect(cell.lines[1].indentation).toBe(2);
    expect(cell.lines[1].text).toMatch(/^\* MachineDeployment freelens-capi-scaling-up-md-0-/);
    expect(statusCell(rowOf("upgrading").conditions).text).toBe(
      "ControlPlaneAvailable: 1 of 2 Machines has healthy control plane components, at least 1 required",
    );
  });

  it("skips the subjects with no words of their own under the first line, and keeps the subject alone when none has", () => {
    const message = (text: string) =>
      parseConditionMessage(text) as Extract<ReturnType<typeof parseConditionMessage>, { state: "read" }>;

    expect(headlineOf(message("* Deleting:\n  * MachineDeployment md-0:\n    * Machine m-1: draining"))).toBe(
      "Deleting: Machine m-1: draining",
    );
    expect(headlineOf(message("* Deleting:\n  * MachineDeployment md-0:"))).toBe("Deleting:");
    expect(headlineOf(message("* Deleting:"))).toBe("Deleting:");
    expect(headlineOf(message("  * Deleting: Machine m-1"))).toBe("Deleting: Machine m-1");
    expect(headlineOf(message(""))).toBeUndefined();
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
