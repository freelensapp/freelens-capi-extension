// The conditions of an object and the weight of each (SPEC-0003, "Tests", "Unit", and "The weight of a condition";
// SPEC-0001, H3): the seven types of negative polarity, a positive type, a status that is neither `True` nor `False`,
// the gates and their polarity, the reasons of `TopologyReconciled`, the pending changes of P4 and P5, the wait and
// the stale `ProviderUpgraded` of P14, an older generation (P23), the severity and the two lists of an object of a
// provider (P15), and the order as stored. The objects come from the fixtures of SPEC-0002 (test/status-objects.ts);
// a case that changes one of them says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  deleting,
  healthy,
  noStatus,
  paused,
  provisioning,
  remediation,
  rollingOut,
  scalingUpHeld,
  upgrading,
  withAddedCondition,
  withCondition,
  withMetadata,
  withoutNode,
  withSpec,
  withStatus,
} from "../../../test/status-objects";
import { conditionsOf } from "./index";

import type { KubeObjectData, StatusContext, Weight, WeightedCondition } from "./index";

function listOf(object: KubeObjectData, context: StatusContext = contextOf()): readonly WeightedCondition[] {
  const result = conditionsOf(object, context);

  if (result.state !== "read") throw new Error("the conditions were not read");
  return result.conditions;
}

function conditionOf(object: KubeObjectData, type: string, context?: StatusContext): WeightedCondition {
  const condition = listOf(object, context).find((each) => each.type === type);

  if (condition === undefined) throw new Error(`no condition ${type}`);
  return condition;
}

function weightOf(object: KubeObjectData, type: string, context?: StatusContext): Weight {
  return conditionOf(object, type, context).weight;
}

// An operator object of the core provider, written from the schema of the operator, since the fixtures have none: the
// test environment installs with clusterctl (SPEC-0002).
function operatorObject(conditions: Record<string, unknown>[], installedVersion: string, version: string) {
  return {
    apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
    kind: "CoreProvider",
    metadata: { name: "cluster-api", namespace: "capi-system", generation: 2 },
    spec: { version },
    status: { conditions, installedVersion, observedGeneration: 2 },
  };
}

function operatorCondition(type: string, status: string, reason: string) {
  return { type, status, reason, message: "", lastTransitionTime: "2025-12-31T23:59:00Z", observedGeneration: 2 };
}

describe("the weight of a condition", () => {
  it.each([
    ["Paused", paused.cluster, healthy.cluster],
    ["Deleting", deleting.cluster, healthy.cluster],
    ["RollingOut", rollingOut.cluster, healthy.cluster],
    ["ScalingUp", scalingUpHeld.cluster, healthy.cluster],
    ["ScalingDown", rollingOut.cluster, healthy.cluster],
    ["Remediating", remediation.cluster, healthy.cluster],
    // The fixtures have no in-place update: the Machine of healthy with its `Updating` changed to `True`.
    [
      "Updating",
      withCondition(healthy.workerMachine, "Updating", { status: "True", reason: "InPlaceUpdating" }),
      healthy.workerMachine,
    ],
  ])("weighs the negative type %s Activity when True and At rest when False", (type, holding, atRest) => {
    expect(conditionOf(holding, type)).toMatchObject({ status: "True", polarity: "negative", weight: "Activity" });
    expect(conditionOf(atRest, type)).toMatchObject({ status: "False", polarity: "negative", weight: "At rest" });
  });

  it("weighs a positive type Ok when True and Issue when False", () => {
    expect(conditionOf(healthy.cluster, "Available")).toMatchObject({ polarity: "positive", weight: "Ok" });
    expect(conditionOf(provisioning.cluster, "Available")).toMatchObject({ polarity: "positive", weight: "Issue" });
  });

  it("weighs Unknown a status Unknown, a missing status and a status outside the set", () => {
    expect(weightOf(withoutNode.machine, "Ready")).toBe("Unknown");
    expect(weightOf(withCondition(healthy.workerMachine, "Ready", { status: undefined }), "Ready")).toBe("Unknown");
    expect(weightOf(withCondition(healthy.workerMachine, "Ready", { status: "Maybe" }), "Ready")).toBe("Unknown");
    expect(weightOf(withCondition(healthy.workerMachine, "Paused", { status: "Maybe" }), "Paused")).toBe("Unknown");
  });

  it("weighs Unknown the Available of a Machine that is False with a reason of the wrong type, and notes it", () => {
    // The worker of healthy not available, with a reason that is not text: only the reason tells the wait of P5.
    const unsure = withCondition(healthy.workerMachine, "Available", { status: "False", reason: 5 });

    expect(conditionOf(unsure, "Available")).toMatchObject({
      reason: undefined,
      polarity: "positive",
      weight: "Unknown",
    });
    expect(conditionsOf(unsure, contextOf()).notes).toEqual([
      { code: "field-unreadable", field: "status.conditions[Available].reason" },
    ]);
    expect(weightOf(withCondition(unsure, "Available", { reason: undefined }), "Available")).toBe("Unknown");
  });

  it("notes the fields of the wrong type of a list of conditions only when the whole list can be read", () => {
    // The worker of healthy whose `Ready` has a reason that is not text, before an entry with no type.
    const machine = withAddedCondition(withCondition(healthy.workerMachine, "Ready", { reason: 2 }), {
      status: "True",
    });

    expect(conditionsOf(machine, contextOf())).toEqual({
      state: "unknown",
      notes: [{ code: "field-unreadable", field: "status.conditions" }],
    });
  });

  it("notes each field of the wrong type in a condition, with the type of the condition, and reads it as absent", () => {
    // The `Ready` of the worker of healthy with each field of the wrong type.
    const odd = withCondition(healthy.workerMachine, "Ready", {
      status: 1,
      reason: 2,
      message: 3,
      severity: 4,
      observedGeneration: -1,
      lastTransitionTime: 5,
    });

    expect(conditionOf(odd, "Ready")).toMatchObject({
      status: undefined,
      reason: undefined,
      message: undefined,
      severity: undefined,
      observedGeneration: undefined,
      lastTransitionTime: { state: "unavailable" },
      weight: "Unknown",
    });
    expect(conditionsOf(odd, contextOf()).notes).toEqual(
      ["status", "reason", "message", "severity", "observedGeneration", "lastTransitionTime"].map((name) => ({
        code: "field-unreadable",
        field: `status.conditions[Ready].${name}`,
      })),
    );
  });

  it("weighs a type that the release does not define, a condition of a third party, as positive", () => {
    const machine = withAddedCondition(healthy.workerMachine, {
      type: "example.com/BackupReady",
      status: "False",
      reason: "BackupFailed",
      message: "",
      lastTransitionTime: "2025-12-31T23:59:50Z",
    });

    expect(conditionOf(machine, "example.com/BackupReady")).toMatchObject({ polarity: "positive", weight: "Issue" });
  });
});

describe("the gates", () => {
  // The fixtures declare no gate on a Cluster: the Cluster of healthy with a gate of a third party, and its condition.
  const drained = (status: string) => ({
    type: "example.com/Drained",
    status,
    reason: "Drained",
    message: "",
    lastTransitionTime: "2025-12-31T23:59:50Z",
  });
  const negativeGate = [{ conditionType: "example.com/Drained", polarity: "Negative" }];

  it("weighs a gate declared Negative on the Cluster Activity when True and At rest when False", () => {
    const cluster = withSpec(healthy.cluster, { availabilityGates: negativeGate });

    expect(conditionOf(withAddedCondition(cluster, drained("True")), "example.com/Drained")).toMatchObject({
      polarity: "negative",
      weight: "Activity",
    });
    expect(weightOf(withAddedCondition(cluster, drained("False")), "example.com/Drained")).toBe("At rest");
  });

  it("weighs the gates of the ClusterClass when the Cluster has none, and the Cluster's own when it has them", () => {
    const clusterClass = withSpec(healthy.clusterClass, { availabilityGates: negativeGate });
    const cluster = withAddedCondition(healthy.cluster, drained("False"));
    const withOwnGate = withSpec(cluster, { availabilityGates: [{ conditionType: "example.com/Drained" }] });

    expect(weightOf(cluster, "example.com/Drained", contextOf({ clusterClass }))).toBe("At rest");
    expect(weightOf(cluster, "example.com/Drained")).toBe("Issue");
    expect(weightOf(withOwnGate, "example.com/Drained", contextOf({ clusterClass }))).toBe("Issue");
  });

  it("weighs a gate declared Positive or with no polarity as positive, as the readiness gates of a Machine", () => {
    const cluster = withSpec(withAddedCondition(healthy.cluster, drained("False")), {
      availabilityGates: [{ conditionType: "example.com/Drained", polarity: "Positive" }],
    });

    expect(weightOf(cluster, "example.com/Drained")).toBe("Issue");
    expect(conditionOf(healthy.controlPlaneMachine, "EtcdMemberHealthy")).toMatchObject({
      polarity: "positive",
      weight: "Ok",
    });
  });

  it("weighs a readiness gate of a Machine declared Negative by its polarity", () => {
    const machine = withSpec(withAddedCondition(healthy.workerMachine, drained("True")), {
      readinessGates: negativeGate,
    });

    expect(weightOf(machine, "example.com/Drained")).toBe("Activity");
  });

  it("weighs Unknown a gate with a polarity outside the set, which only the unit layer can write (P22)", () => {
    const cluster = withSpec(withAddedCondition(healthy.cluster, drained("False")), {
      availabilityGates: [{ conditionType: "example.com/Drained", polarity: "Sideways" }],
    });

    expect(conditionOf(cluster, "example.com/Drained")).toMatchObject({ polarity: "unknown", weight: "Unknown" });
  });

  it("notes a ClusterClass that the view did not give, for a Cluster with a topology and no gates of its own", () => {
    expect(conditionsOf(healthy.cluster, contextOf()).notes).toEqual([
      { code: "input-not-given", input: "clusterClass" },
    ]);
    expect(conditionsOf(healthy.cluster, contextOf({ clusterClass: healthy.clusterClass })).notes).toEqual([]);
    expect(conditionsOf(withSpec(healthy.cluster, { availabilityGates: negativeGate }), contextOf()).notes).toEqual([]);
  });

  it("reads each gate on its own: one that cannot be read is noted, and the conditions it might name weigh Unknown", () => {
    // The Cluster of healthy with two conditions of a third party, and gates of the wrong type: a list that is not
    // one, or an entry with no type next to one that declares `example.com/Drained` `Negative`.
    const cluster = withAddedCondition(withAddedCondition(healthy.cluster, drained("False")), {
      ...drained("False"),
      type: "example.com/BackupReady",
    });
    const notListed = withSpec(cluster, { availabilityGates: "example.com/Drained" });
    const mixed = withSpec(cluster, { availabilityGates: [{ polarity: "Negative" }, ...negativeGate] });
    const context = contextOf({ clusterClass: healthy.clusterClass });

    for (const object of [notListed, mixed]) {
      expect(conditionsOf(object, context).notes).toEqual([
        { code: "field-unreadable", field: "spec.availabilityGates" },
      ]);
      expect(conditionOf(object, "example.com/BackupReady", context)).toMatchObject({
        polarity: "unknown",
        weight: "Unknown",
      });
      // A condition of the project can be a gate too; the summary, which the gates feed, and a type of negative
      // polarity, which no gate changes, keep their weights.
      expect(weightOf(object, "ControlPlaneMachinesReady", context)).toBe("Unknown");
      expect(weightOf(object, "Available", context)).toBe("Ok");
      expect(weightOf(object, "RollingOut", context)).toBe("At rest");
    }
    expect(weightOf(notListed, "example.com/Drained", context)).toBe("Unknown");
    expect(weightOf(mixed, "example.com/Drained", context)).toBe("At rest");
    // An entry whose type is empty names no condition either.
    expect(conditionsOf(withSpec(cluster, { availabilityGates: [{ conditionType: "" }] }), context).notes).toEqual([
      { code: "field-unreadable", field: "spec.availabilityGates" },
    ]);
  });

  it("weighs Unknown, on a Machine with a readiness gate that cannot be read, all but Ready, which the gates feed", () => {
    // The worker of healthy with a condition of a third party and a readiness gate that is not an object.
    const machine = withSpec(withAddedCondition(healthy.workerMachine, drained("False")), {
      readinessGates: ["example.com/Drained"],
    });

    expect(weightOf(machine, "Ready")).toBe("Ok");
    expect(weightOf(machine, "example.com/Drained")).toBe("Unknown");
    expect(weightOf(machine, "NodeHealthy")).toBe("Unknown");
    expect(conditionsOf(machine, contextOf()).notes).toEqual([
      { code: "field-unreadable", field: "spec.readinessGates" },
    ]);
  });

  it("notes no ClusterClass for a Cluster without a topology", () => {
    expect(conditionsOf(noStatus.cluster, contextOf()).notes).toEqual([]);
  });
});

describe("the reasons of TopologyReconciled", () => {
  const upgradingCluster = scalingUpHeld.cluster;

  it.each([
    ["ReconcileFailed", "Issue"],
    ["ClusterClassNotReconciled", "Issue"],
    ["Paused", "Activity"],
    ["Deleting", "Activity"],
    ["ClusterCreating", "Activity"],
    ["ClusterUpgrading", "Activity"],
    ["MachineDeploymentsUpgradeDeferred", "Activity"],
    ["MachinePoolsUpgradeDeferred", "Activity"],
    ["ControlPlaneUpgradePending", "Activity"],
    ["MachineDeploymentsCreatePending", "Activity"],
    ["MachineDeploymentsUpgradePending", "Activity"],
    ["MachinePoolsUpgradePending", "Activity"],
    ["MachinePoolsCreatePending", "Activity"],
    ["LifecycleHookBlocking", "Activity"],
  ])("weighs TopologyReconciled False with the reason %s as %s", (reason, weight) => {
    const cluster = withCondition(upgradingCluster, "TopologyReconciled", { reason });

    expect(weightOf(cluster, "TopologyReconciled")).toBe(weight);
  });

  it("weighs as it is captured the TopologyReconciled of an upgrade", () => {
    expect(conditionOf(upgradingCluster, "TopologyReconciled")).toMatchObject({
      status: "False",
      reason: "ClusterUpgrading",
      weight: "Activity",
    });
    expect(weightOf(paused.cluster, "TopologyReconciled")).toBe("Activity");
    expect(weightOf(deleting.cluster, "TopologyReconciled")).toBe("Activity");
  });

  it("weighs Unknown a reason that the release does not define, and Ok a TopologyReconciled that is True (P22)", () => {
    expect(
      weightOf(withCondition(upgradingCluster, "TopologyReconciled", { reason: "Rebasing" }), "TopologyReconciled"),
    ).toBe("Unknown");
    expect(
      weightOf(withCondition(upgradingCluster, "TopologyReconciled", { reason: undefined }), "TopologyReconciled"),
    ).toBe("Unknown");
    expect(weightOf(healthy.cluster, "TopologyReconciled")).toBe("Ok");
  });
});

describe("the pending changes of P4 and P5", () => {
  it.each([
    ["WorkerMachinesUpToDate of a Cluster", rollingOut.cluster, "WorkerMachinesUpToDate"],
    ["ControlPlaneMachinesUpToDate of a Cluster", upgrading.cluster, "ControlPlaneMachinesUpToDate"],
    ["UpToDate of a Machine", rollingOut.oldMachine, "UpToDate"],
    ["MachinesUpToDate of a MachineSet", rollingOut.oldMachineSet, "MachinesUpToDate"],
    ["MachinesUpToDate of a MachineDeployment", rollingOut.machineDeployment, "MachinesUpToDate"],
    ["MachinesUpToDate of a KubeadmControlPlane", upgrading.kubeadmControlPlane, "MachinesUpToDate"],
  ])("weighs the %s that is False Activity, never Issue", (_, object, type) => {
    expect(conditionOf(object, type)).toMatchObject({ status: "False", polarity: "positive", weight: "Activity" });
  });

  it("weighs the Available of a Machine that waits for minReadySeconds Activity, and any other False Issue", () => {
    // The fixtures have no Machine within its minReadySeconds: the worker of healthy with its `Available` changed.
    const waiting = withCondition(healthy.workerMachine, "Available", {
      status: "False",
      reason: "WaitingForMinReadySeconds",
    });

    expect(weightOf(waiting, "Available")).toBe("Activity");
    expect(weightOf(rollingOut.newMachine, "Available")).toBe("Issue");
  });

  it("weighs a pending change of another kind by its polarity alone", () => {
    expect(weightOf(remediation.deferredMachine, "Ready")).toBe("Issue");
    expect(weightOf(withCondition(healthy.machineSet, "MachinesReady", { status: "False" }), "MachinesReady")).toBe(
      "Issue",
    );
  });
});

describe("the conditions of a kind of the operator (P14)", () => {
  it("weighs the wait for the core provider Issue, as any PreflightCheckPassed that is False", () => {
    const waiting = operatorObject(
      [operatorCondition("PreflightCheckPassed", "False", "WaitingForCoreProviderReady")],
      "v1.14.4",
      "v1.14.4",
    );

    expect(weightOf(waiting, "PreflightCheckPassed")).toBe("Issue");
  });

  it("weighs a ProviderUpgraded that is False At rest once the installed version is the version of the spec", () => {
    const upgraded = [operatorCondition("ProviderUpgraded", "False", "ComponentsUpgradeError")];

    expect(weightOf(operatorObject(upgraded, "v1.14.4", "v1.14.4"), "ProviderUpgraded")).toBe("At rest");
    expect(weightOf(operatorObject(upgraded, "v1.14.4", "v1.15.0"), "ProviderUpgraded")).toBe("Issue");
  });
});

describe("what a condition carries", () => {
  it("keeps the order of the conditions as stored", () => {
    expect(listOf(healthy.cluster).map((condition) => condition.type)).toEqual(
      healthy.cluster.status.conditions.map((condition) => condition.type),
    );
    expect(listOf(rollingOut.machineDeployment).map((condition) => condition.type)).toEqual(
      rollingOut.machineDeployment.status.conditions.map((condition) => condition.type),
    );
  });

  it("marks a condition whose observedGeneration is below the generation of the object (P23)", () => {
    // The Cluster of provisioning is at generation 2, and its probe was last written at generation 1.
    expect(conditionOf(provisioning.cluster, "RemoteConnectionProbe")).toMatchObject({
      observedGeneration: 1,
      olderGeneration: true,
    });
    expect(conditionOf(provisioning.cluster, "Available")).toMatchObject({
      observedGeneration: 2,
      olderGeneration: false,
    });
    expect(conditionOf(healthy.cluster, "Available").olderGeneration).toBe(false);
  });

  it("does not judge the generation of a condition that keeps none", () => {
    const unobserved = withCondition(provisioning.cluster, "RemoteConnectionProbe", { observedGeneration: undefined });

    expect(conditionOf(unobserved, "RemoteConnectionProbe")).toMatchObject({
      observedGeneration: undefined,
      olderGeneration: false,
    });
  });

  it("parses the message and the time of the last transition", () => {
    const available = conditionOf(provisioning.cluster, "Available");

    expect(available.message).toBe(provisioning.cluster.status.conditions[0].message);
    expect(available.parsedMessage).toMatchObject({
      state: "read",
      headline: "* RemoteConnectionProbe: Remote connection not established yet",
    });
    expect(available.lastTransitionTime).toEqual({
      state: "accepted",
      text: "2025-12-31T23:59:36Z",
      instant: Date.UTC(2025, 11, 31, 23, 59, 36),
    });
    expect(conditionOf(healthy.cluster, "Available").parsedMessage).toEqual({
      state: "read",
      headline: undefined,
      lines: [],
    });
  });

  it("lists no condition for a kind with no status, nor for an object that has no status yet", () => {
    expect(conditionsOf(healthy.binding, contextOf())).toEqual({ state: "read", conditions: [], notes: [] });
    expect(conditionsOf(noStatus.machine, contextOf())).toEqual({ state: "read", conditions: [], notes: [] });
  });
});

describe("the conditions of an object of a provider (P15)", () => {
  const context = contextOf({ role: "infrastructure-cluster", provider: "infrastructure-docker" });
  // The fixtures have no object of the v1beta1 contract: the DevCluster of healthy as such an object writes it, its
  // conditions of v1beta1 in `status.conditions`, with a severity, and its conditions of v1beta2 in
  // `status.v1beta2.conditions`.
  const v1beta1Conditions = [
    {
      type: "Ready",
      status: "False",
      severity: "Warning",
      reason: "LoadBalancerProvisioningFailed",
      message: "",
      lastTransitionTime: "2025-12-31T23:58:31Z",
    },
  ];
  const bothLists = withStatus(healthy.devCluster, {
    conditions: v1beta1Conditions,
    v1beta2: { conditions: healthy.devCluster.status.conditions },
  });

  it("takes status.v1beta2.conditions whole when it is present", () => {
    expect(listOf(bothLists, context).map((condition) => [condition.type, condition.weight])).toEqual([
      ["Ready", "Ok"],
      ["LoadBalancerAvailable", "Ok"],
      ["Paused", "At rest"],
    ]);
    expect(listOf(withStatus(bothLists, { v1beta2: { conditions: [] } }), context)).toEqual([]);
  });

  it("reads status.conditions otherwise, keeping the severity of the v1beta1 contract with no weight", () => {
    const v1beta1 = withStatus(healthy.devCluster, { conditions: v1beta1Conditions });

    expect(conditionOf(v1beta1, "Ready", context)).toMatchObject({
      status: "False",
      severity: "Warning",
      weight: "Issue",
    });
    expect(conditionOf(healthy.devCluster, "Ready", context)).toMatchObject({ severity: undefined, weight: "Ok" });
  });

  it("weighs the conditions of a provider by their polarity, with none of the rules of a kind of Cluster API", () => {
    const upToDate = withAddedCondition(healthy.devCluster, {
      type: "MachinesUpToDate",
      status: "False",
      reason: "NotUpToDate",
      message: "",
      lastTransitionTime: "2025-12-31T23:59:50Z",
    });

    expect(weightOf(upToDate, "MachinesUpToDate", context)).toBe("Issue");
    expect(weightOf(upToDate, "Paused", context)).toBe("At rest");
  });
});

describe("a field of the wrong type", () => {
  it.each([
    [
      "conditions that are not a list",
      withStatus(healthy.cluster, { conditions: { Available: "True" } }),
      "status.conditions",
    ],
    ["an entry that is not an object", withStatus(healthy.cluster, { conditions: ["Available"] }), "status.conditions"],
    [
      "an entry with no type",
      withStatus(healthy.cluster, { conditions: [{ status: "True", reason: "Available" }] }),
      "status.conditions",
    ],
    ["a status that is not an object", { ...healthy.cluster, status: "Available" }, "status"],
  ])("reads %s as unknown, and does not throw", (_, object, field) => {
    expect(conditionsOf(object as KubeObjectData, contextOf({ clusterClass: healthy.clusterClass }))).toEqual({
      state: "unknown",
      notes: [{ code: "field-unreadable", field }],
    });
  });

  it("reads a reason, a message or a generation of the wrong type as absent", () => {
    const odd = withCondition(scalingUpHeld.cluster, "TopologyReconciled", {
      reason: 5,
      message: ["x"],
      observedGeneration: -1,
    });

    expect(conditionOf(odd, "TopologyReconciled")).toMatchObject({
      reason: undefined,
      message: undefined,
      observedGeneration: undefined,
      weight: "Unknown",
    });
  });

  it("notes a generation of the wrong type and judges no condition older", () => {
    const result = conditionsOf(
      withMetadata(provisioning.cluster, { generation: "2" }),
      contextOf({ clusterClass: healthy.clusterClass }),
    );

    expect(result.notes).toEqual([{ code: "field-unreadable", field: "metadata.generation" }]);
    expect(result.state === "read" && result.conditions.some((condition) => condition.olderGeneration)).toBe(false);
  });
});
