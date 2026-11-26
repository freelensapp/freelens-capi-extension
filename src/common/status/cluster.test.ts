// The rule of a Cluster (SPEC-0003, "Tests", "Unit", and "The rule of each kind", Cluster; SPEC-0001, R2.8 to R2.32
// and H1): `Available` that sums it up, the issues that make it Degraded and those that do not, its MachinePools,
// which its `Available` leaves out, a Cluster that the project never reports available (P7), each phase of its closed
// set and one outside it, and the deprecated failure (P6). The objects come from the fixtures of SPEC-0002
// (test/status-objects.ts); a case that changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  machinePools,
  noStatus,
  poolWithoutMachines,
  provisioning,
  rollingOut,
  upgrading,
  withCondition,
  withoutTopology,
  withSpec,
  withStatus,
  withThirdPartyCondition,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { ClusterObject, Health, KubeObjectData, ObjectStatus, StatusContext } from "./index";

// The parts of the Cluster are given, with none, and its ClusterClass, quick-start, the class of every Cluster of the
// fixtures with a topology, so that the Cluster notes nothing that a case does not test.
function statusOfCluster(cluster: KubeObjectData, context: Partial<StatusContext> = {}): ObjectStatus {
  return statusOf(
    cluster,
    contextOf({ machinePools: [], parts: { machineDeployments: [] }, clusterClass: healthy.clusterClass, ...context }),
  );
}

function healthOf(cluster: KubeObjectData, context: Partial<StatusContext> = {}): Health {
  return statusOfCluster(cluster, context).health;
}

function issueTypesOf(health: Health): string[] {
  return health.health === "none"
    ? []
    : health.issues.map((issue) => (issue.form === "condition" ? issue.type : issue.form));
}

// The result of statusOf for a MachinePool, as the view gives it in `machinePools`.
function poolStatus(health: Health["health"], name = "freelens-capi-machine-pools-mp-0-s48vb"): ObjectStatus {
  const status = statusOf(machinePools.machinePool, contextOf({ machines: [machinePools.poolMachine] }));

  return {
    ...status,
    object: { ...status.object, name },
    health: health === "none" ? { health, because: "deleting" } : { health, restsOn: { form: "none" }, issues: [] },
  };
}

describe("a Cluster", () => {
  it("reads Healthy when Available is True and nothing it counts is an issue", () => {
    expect(healthOf(healthy.cluster)).toMatchObject({
      health: "Healthy",
      restsOn: { form: "condition", type: "Available", condition: { status: "True" } },
      issues: [],
    });
    expect(healthOf(withoutTopology.cluster).health).toBe("Healthy");
  });

  it("reads Unhealthy when Available is False, and Unknown while it is missing or Unknown", () => {
    expect(healthOf(provisioning.cluster).health).toBe("Unhealthy");
    expect(healthOf(noStatus.cluster).health).toBe("Unknown");
    expect(
      healthOf(withCondition(healthy.cluster, "Available", { status: "Unknown", reason: "AvailableUnknown" })).health,
    ).toBe("Unknown");
  });

  it.each([
    ["ControlPlaneMachinesReady", "with MachinePools only", machinePools.cluster],
    ["WorkerMachinesReady", "rolling out", rollingOut.cluster],
    ["ControlPlaneMachinesReady", "upgrading", upgrading.cluster],
    // The Cluster of healthy with its `ControlPlaneInitialized` changed to `False`.
    [
      "ControlPlaneInitialized",
      "with its control plane not initialized",
      withCondition(healthy.cluster, "ControlPlaneInitialized", { status: "False" }),
    ],
  ])("reads Degraded from %s while Available is True, %s", (type, _, cluster) => {
    const health = healthOf(cluster);

    expect(health.health).toBe("Degraded");
    expect(issueTypesOf(health)).toEqual([type]);
  });

  it("reads Degraded from a TopologyReconciled that fails while Available keeps an older True (R2.8, R2.24)", () => {
    // The Cluster of healthy whose ClusterClass cannot be read: only its `TopologyReconciled` changes.
    const failing = withCondition(healthy.cluster, "TopologyReconciled", {
      status: "False",
      reason: "ReconcileFailed",
      message: "ClusterClass is not up to date",
    });

    expect(issueTypesOf(healthOf(failing))).toEqual(["TopologyReconciled"]);
    expect(healthOf(failing).health).toBe("Degraded");
  });

  it("counts no TopologyReconciled that is False for a reason that is no failure, nor the pending changes of P4", () => {
    expect(issueTypesOf(healthOf(upgrading.cluster))).toEqual(["ControlPlaneMachinesReady"]);
    expect(issueTypesOf(healthOf(rollingOut.cluster))).toEqual(["WorkerMachinesReady"]);
  });

  it("counts none of the inputs of Available, which Available already merges", () => {
    // The Cluster of healthy with a gate of its availability `False`, which `Available` would turn `False`.
    const gated = withSpec(
      withStatus(healthy.cluster, {
        conditions: [
          ...healthy.cluster.status.conditions,
          {
            type: "example.com/Drained",
            status: "False",
            reason: "NotDrained",
            message: "",
            lastTransitionTime: "2025-12-31T23:59:50Z",
            observedGeneration: 1,
          },
        ],
      }),
      { availabilityGates: [{ conditionType: "example.com/Drained" }] },
    );

    expect(healthOf(gated).health).toBe("Healthy");
  });

  it.each(["RemoteConnectionProbe", "InfrastructureReady", "ControlPlaneAvailable", "WorkersAvailable"])(
    "counts no %s, an input of Available (R2.21)",
    (type) => {
      // The Cluster of healthy with that condition `False`, which its `Available` would turn `False`.
      expect(healthOf(withCondition(healthy.cluster, type, { status: "False" }))).toMatchObject({
        health: "Healthy",
        issues: [],
      });
    },
  );

  it("reads Degraded from a condition of a third party that is False, unless a gate of its ClusterClass names it (H1)", () => {
    // The Cluster of healthy with a condition of a third party `False`, which its `Available` leaves out; then with
    // the class of healthy given a gate that names it, which makes it an input of `Available`.
    const backup = withThirdPartyCondition(healthy.cluster);
    const gated = withSpec(healthy.clusterClass, { availabilityGates: [{ conditionType: "example.com/BackupReady" }] });

    expect(healthOf(backup)).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "example.com/BackupReady" }],
    });
    expect(healthOf(backup, { clusterClass: gated }).health).toBe("Healthy");
    expect(healthOf(withThirdPartyCondition(healthy.cluster, "True")).health).toBe("Healthy");
  });
});

describe("the MachinePools of a Cluster (H1)", () => {
  it.each(["Unhealthy", "Degraded"] as const)("reads Degraded from a MachinePool that is %s", (health) => {
    // The Cluster of healthy, whose `Available` leaves out a MachinePool of the given health.
    expect(healthOf(healthy.cluster, { machinePools: [poolStatus(health)] })).toMatchObject({
      health: "Degraded",
      issues: [{ form: "machine-pool", name: "freelens-capi-machine-pools-mp-0-s48vb", health }],
    });
  });

  it("reads a MachinePool as no more than Degraded, and leaves its health as it is when Available is False", () => {
    const pools = [poolStatus("Unhealthy")];

    expect(healthOf(provisioning.cluster, { machinePools: pools }).health).toBe("Unhealthy");
    expect(healthOf(healthy.cluster, { machinePools: [poolStatus("Healthy"), poolStatus("none")] }).health).toBe(
      "Healthy",
    );
  });

  it("says how many MachinePools are Unknown, next to its health, leaving out those with no health", () => {
    const status = statusOfCluster(poolWithoutMachines.cluster, {
      machinePools: [
        poolStatus("Unknown", "a"),
        poolStatus("Unknown", "b"),
        poolStatus("Healthy", "c"),
        poolStatus("none", "d"),
      ],
    });

    expect(status.health.health).toBe("Degraded");
    expect(status.notes).toContainEqual({ code: "machine-pools-unknown", count: 2 });
  });

  it("notes that the MachinePools were not read when the view did not give them", () => {
    const status = statusOf(
      healthy.cluster,
      contextOf({ parts: { machineDeployments: [] }, clusterClass: healthy.clusterClass }),
    );

    expect(status.health.health).toBe("Healthy");
    expect(status.notes).toEqual([{ code: "input-not-given", input: "machinePools" }]);
  });

  it("reads the MachinePools of the Cluster of machine-pools as the project leaves them out", () => {
    const pool = statusOf(machinePools.machinePool, contextOf({ machines: [machinePools.poolMachine] }));

    expect(pool.health.health).toBe("Unhealthy");
    expect(issueTypesOf(healthOf(machinePools.cluster, { machinePools: [pool] }))).toEqual([
      "ControlPlaneMachinesReady",
      "machine-pool",
    ]);
  });
});

describe("a Cluster that the project never reports available (P7)", () => {
  it.each([
    ["no spec.controlPlaneRef", { controlPlaneRef: undefined }, ["spec.controlPlaneRef"]],
    ["no spec.infrastructureRef", { infrastructureRef: undefined }, ["spec.infrastructureRef"]],
    [
      "neither reference",
      { controlPlaneRef: undefined, infrastructureRef: undefined },
      ["spec.controlPlaneRef", "spec.infrastructureRef"],
    ],
  ])(
    "notes a Cluster without a topology and with %s, which is Unknown or Unhealthy but never Healthy",
    (_, spec, missing) => {
      // The Cluster of without-topology with a reference taken out, as the trial of S7 makes one. Its `Available`
      // stays `True` only in a status written by hand, as the fixture is: the project never writes it so (R2.27).
      const cluster = withSpec(withoutTopology.cluster, spec);
      const status = statusOfCluster(cluster);
      const degraded = withCondition(cluster, "WorkerMachinesReady", { status: "False", reason: "NotReady" });

      expect(status.notes).toContainEqual({ code: "never-available", missing });
      expect(status.health).toMatchObject({
        health: "Unknown",
        restsOn: { form: "condition", type: "Available", condition: { status: "True" } },
      });
      expect(statusOfCluster(degraded).health).toMatchObject({
        health: "Unknown",
        issues: [{ form: "condition", type: "WorkerMachinesReady" }],
      });
      expect(statusOfCluster(withCondition(cluster, "Available", { status: "False" })).health.health).toBe("Unhealthy");
    },
  );

  it("notes nothing for a Cluster with both references or with a topology", () => {
    expect(statusOfCluster(withoutTopology.cluster).notes).toEqual([]);
    expect(
      statusOfCluster(withSpec(healthy.cluster, { controlPlaneRef: undefined, infrastructureRef: undefined })).notes,
    ).toEqual([]);
  });

  it("reads a reference with an empty name, kind and group as no reference", () => {
    const cluster = withSpec(withoutTopology.cluster, { controlPlaneRef: { apiGroup: "", kind: "", name: "" } });

    expect(statusOfCluster(cluster).notes).toContainEqual({
      code: "never-available",
      missing: ["spec.controlPlaneRef"],
    });
  });
});

describe("the phase of a Cluster", () => {
  it.each(["Pending", "Provisioning", "Provisioned", "Deleting", "Unknown"])(
    "shows the phase %s as written",
    (phase) => {
      expect(statusOfCluster(withStatus(healthy.cluster, { phase })).phase).toEqual({
        phase,
        written: phase,
        deprecated: false,
      });
    },
  );

  it("shows the phase Failed with the deprecated label, and does not read it for the health (P6)", () => {
    const failed = statusOfCluster(withStatus(healthy.cluster, { phase: "Failed" }));

    expect(failed.phase).toEqual({ phase: "Failed", written: "Failed", deprecated: true });
    expect(failed.health.health).toBe("Healthy");
  });

  it("reads Unknown a phase outside the set, and one that is not written", () => {
    expect(statusOfCluster(withStatus(healthy.cluster, { phase: "Upgraded" })).phase).toEqual({
      phase: "Unknown",
      written: "Upgraded",
      deprecated: false,
    });
    expect(statusOfCluster(noStatus.cluster).phase).toEqual({
      phase: "Unknown",
      written: undefined,
      deprecated: false,
    });
  });

  it("reads Unknown a phase that is not text, and notes it", () => {
    const status = statusOfCluster(withStatus(healthy.cluster, { phase: 3 }));

    expect(status.phase).toEqual({ phase: "Unknown", written: undefined, deprecated: false });
    expect(status.notes).toContainEqual({ code: "field-unreadable", field: "status.phase" });
  });
});

describe("the deprecated failure of a Cluster (P6)", () => {
  it("notes the failure reason and message, which it never reads for the health", () => {
    const failed: ClusterObject = withStatus(healthy.cluster, {
      deprecated: { v1beta1: { failureReason: "InvalidConfiguration", failureMessage: "the load balancer failed" } },
    });
    const status = statusOfCluster(failed);

    expect(status.health.health).toBe("Healthy");
    expect(status.notes).toEqual([
      { code: "deprecated-failure", reason: "InvalidConfiguration", message: "the load balancer failed" },
    ]);
  });

  it("notes nothing for empty failure fields", () => {
    const empty = withStatus(healthy.cluster, { deprecated: { v1beta1: { failureReason: "", failureMessage: "" } } });

    expect(statusOfCluster(empty).notes).toEqual([]);
  });
});
