// The rule every kind follows (SPEC-0003, "Tests", "Unit", and "Health"; SPEC-0001, H1): the summary `True` with
// and without another issue, `False`, `Unknown`, missing or of another status, no status at all; what changes
// nothing, a condition of negative polarity `True`, a condition other than the summary `Unknown`, the pending
// changes of P4 and P5 and a mark of freshness; an object that is deleting; the word of the project while a change
// is in flight, at the capture and past every threshold of D2, which no activity holds (D1), and its tone, which
// alone follows the activity (D2); and a field of the wrong type. The objects come from the fixtures of SPEC-0002
// (test/status-objects.ts); a case that changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  CAPTURE,
  contextOf,
  deleting,
  healthy,
  noStatus,
  paused,
  provisioning,
  remediation,
  rollingOut,
  scalingDown,
  scalingUp,
  withCondition,
  withMetadata,
  withoutCondition,
  withoutNode,
  withSpec,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { KubeObjectData, StatusContext } from "./index";

function healthOf(object: KubeObjectData, context: StatusContext = contextOf()) {
  return statusOf(object, context).health;
}

function wordOf(object: KubeObjectData, context?: StatusContext) {
  return healthOf(object, context).health;
}

// The moments at which a case reads the word: the capture, past the 30 minutes of a Cluster and the threshold of a
// Machine, and a day later.
const MOMENTS = [CAPTURE, CAPTURE + 31 * 60_000, CAPTURE + 86_400_000];

describe("the rule every kind follows", () => {
  it("reads Healthy a summary True with no other issue", () => {
    expect(healthOf(healthy.workerMachine)).toMatchObject({
      health: "Healthy",
      restsOn: { form: "condition", type: "Ready", condition: { status: "True", weight: "Ok" } },
      issues: [],
    });
  });

  it("reads Degraded a summary True with another condition of positive polarity False", () => {
    expect(healthOf(rollingOut.machineDeployment)).toMatchObject({
      health: "Degraded",
      restsOn: { form: "condition", type: "Available", condition: { status: "True" } },
      issues: [{ form: "condition", type: "MachinesReady", condition: { status: "False", weight: "Issue" } }],
    });
  });

  it("reads Unhealthy a summary False", () => {
    expect(healthOf(provisioning.kubeadmControlPlane)).toMatchObject({
      health: "Unhealthy",
      restsOn: { type: "Available", condition: { status: "False", reason: "NotAvailable" } },
    });
  });

  it.each([
    ["Unknown", withoutNode.machine],
    ["missing", withoutCondition(healthy.workerMachine, "Ready")],
    ["of a status outside the set", withCondition(healthy.workerMachine, "Ready", { status: "Maybe" })],
  ])("reads Unknown a summary that is %s", (_, machine) => {
    expect(wordOf(machine)).toBe("Unknown");
  });

  it("rests on the summary that is missing, with no condition", () => {
    expect(healthOf(withoutCondition(healthy.workerMachine, "Ready"))).toMatchObject({
      restsOn: { form: "condition", type: "Ready", condition: undefined },
    });
  });

  it("reads Unknown an object with no status yet", () => {
    expect(healthOf(noStatus.machine)).toEqual({
      health: "Unknown",
      restsOn: { form: "condition", type: "Ready", condition: undefined },
      issues: [],
    });
  });

  it("is changed neither by a condition of negative polarity True nor by another condition that is Unknown", () => {
    // The KubeadmControlPlane of healthy rolling out, and with external etcd, whose `EtcdClusterHealthy` stays
    // `Unknown` (SPEC-0001, R2.80): each case changes one condition.
    expect(
      wordOf(withCondition(healthy.kubeadmControlPlane, "RollingOut", { status: "True", reason: "RollingOut" })),
    ).toBe("Healthy");
    expect(
      wordOf(
        withCondition(healthy.kubeadmControlPlane, "EtcdClusterHealthy", {
          status: "Unknown",
          reason: "HealthUnknown",
        }),
      ),
    ).toBe("Healthy");
  });

  it("lists the issues that point 3 counts whatever the word", () => {
    expect(healthOf(remediation.deferredMachine)).toMatchObject({
      health: "Unhealthy",
      issues: [
        { form: "condition", type: "Available" },
        { form: "condition", type: "HealthCheckSucceeded" },
        { form: "condition", type: "OwnerRemediated" },
      ],
    });
  });

  it("gives no health to an object that is deleting", () => {
    expect(healthOf(deleting.cluster)).toEqual({ health: "none", because: "deleting" });
    expect(healthOf(scalingDown.deletingMachine)).toEqual({ health: "none", because: "deleting" });
    expect(healthOf(remediation.deletingMachine)).toEqual({ health: "none", because: "deleting" });
  });

  it("gives no health to a deleting object whose deletion time is unavailable", () => {
    expect(healthOf(withMetadata(healthy.workerMachine, { deletionTimestamp: "2026-02-30T00:00:00Z" }))).toEqual({
      health: "none",
      because: "deleting",
    });
  });

  it("reads an empty deletion time as no deletion, as an absent one", () => {
    expect(wordOf(withMetadata(healthy.workerMachine, { deletionTimestamp: "" }))).toBe("Healthy");
  });

  it("gives no health to a kind with no status", () => {
    expect(healthOf(healthy.binding)).toEqual({ health: "none", because: "no status" });
    expect(healthOf(healthy.kubeadmConfigTemplate)).toEqual({ health: "none", because: "no status" });
  });
});

describe("the word of the project while a change is in flight (D1)", () => {
  it.each([
    ["a Cluster that provisions", "Unhealthy", provisioning.cluster],
    ["a KubeadmControlPlane that provisions", "Unhealthy", provisioning.kubeadmControlPlane],
    ["a Machine that provisions", "Unhealthy", provisioning.controlPlaneMachine],
    ["a KubeadmConfig that waits for the control plane", "Unhealthy", provisioning.workerKubeadmConfig],
    ["a MachineDeployment that rolls out", "Degraded", rollingOut.machineDeployment],
    ["a MachineSet that a rollout creates", "Unhealthy", rollingOut.newMachineSet],
    ["a KubeadmControlPlane that scales up", "Degraded", scalingUp.kubeadmControlPlane],
    ["a MachineDeployment that scales down", "Degraded", scalingDown.machineDeployment],
    ["a MachineSet that scales down", "Degraded", scalingDown.machineSet],
    ["a MachineSet that replaces a Machine", "Unhealthy", remediation.machineSet],
    // The fixtures have no in-place update: the MachineSet of healthy with one Machine less available, as its
    // counters count a Machine that updates in place (SPEC-0001, R2.56).
    [
      "a MachineSet whose Machine updates in place",
      "Unhealthy",
      withStatus(healthy.machineSet, { availableReplicas: 1 }),
    ],
  ])("reads %s as %s at the capture and past every threshold", (_, word, object) => {
    for (const now of MOMENTS) {
      expect(wordOf(object, contextOf({ now }))).toBe(word);
    }
  });

  it("reads a Machine that waits for minReadySeconds Healthy, as P5 leaves the wait out", () => {
    // The worker of healthy with its `Available` changed to the wait.
    const waiting = withCondition(healthy.workerMachine, "Available", {
      status: "False",
      reason: "WaitingForMinReadySeconds",
    });

    for (const now of MOMENTS) {
      expect(healthOf(waiting, contextOf({ now }))).toMatchObject({ health: "Healthy", issues: [] });
    }
  });

  describe("a MachineDeployment whose only False conditions are of the family of P4", () => {
    // The MachineDeployment of rolling-out once its new Machine is ready: its `MachinesReady` changed to `True`.
    const rolling = withCondition(rollingOut.machineDeployment, "MachinesReady", { status: "True", reason: "Ready" });

    it("reads Healthy during a rollout", () => {
      expect(healthOf(rolling)).toMatchObject({ health: "Healthy", issues: [] });
    });

    it("reads Healthy under the strategy OnDelete", () => {
      const onDelete = withSpec(rolling, { rollout: { strategy: { type: "OnDelete" } } });

      expect(wordOf(onDelete)).toBe("Healthy");
    });

    it("reads Healthy with its rollout paused", () => {
      expect(wordOf(withSpec(rolling, { paused: true }))).toBe("Healthy");
    });
  });
});

describe("the word of the project in the tone of D2, at the capture, past every threshold and a day later", () => {
  // The worker of healthy during an in-place update since 23:59:50, as the MachineSet of healthy counts it.
  const updating = withCondition(
    withCondition(
      withCondition(healthy.workerMachine, "Updating", {
        status: "True",
        reason: "InPlaceUpdating",
        lastTransitionTime: "2025-12-31T23:59:50Z",
      }),
      "Ready",
      { status: "False", reason: "NotReady" },
    ),
    "Available",
    { status: "False", reason: "NotReady" },
  );
  // The Machine that the MachineDeployment of scaling-down keeps: a copy of the worker of healthy in its namespace.
  const kept = withMetadata(healthy.workerMachine, {
    name: "freelens-capi-scaling-down-md-0-97cl7-8p6v4-kept1",
    namespace: "freelens-capi-scaling-down",
  });
  const second = withMetadata(healthy.workerMachine, { name: "freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9" });

  it.each([
    [
      "a Cluster that provisions",
      "Unhealthy",
      provisioning.cluster,
      { machinePools: [], parts: { machineDeployments: [] } },
      ["progress", "warning", "warning"],
    ],
    [
      "a KubeadmControlPlane that provisions",
      "Unhealthy",
      provisioning.kubeadmControlPlane,
      { cluster: provisioning.cluster, machines: [provisioning.controlPlaneMachine], healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
    [
      "a Machine that provisions",
      "Unhealthy",
      provisioning.controlPlaneMachine,
      { cluster: provisioning.cluster, healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
    [
      "a KubeadmConfig that waits for the control plane",
      "Unhealthy",
      provisioning.workerKubeadmConfig,
      { cluster: provisioning.cluster, machines: [provisioning.workerMachine], healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
    [
      "a MachineDeployment that rolls out",
      "Degraded",
      rollingOut.machineDeployment,
      { cluster: rollingOut.cluster, machines: [rollingOut.oldMachine, rollingOut.newMachine], healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
    // Its Machine is Provisioning while it is within its threshold, and the MachineSet does nothing after it.
    [
      "a MachineSet that a rollout creates",
      "Unhealthy",
      rollingOut.newMachineSet,
      { cluster: rollingOut.cluster, machines: [rollingOut.newMachine], healthChecks: [] },
      ["progress", "health", "health"],
    ],
    [
      "a KubeadmControlPlane that scales up",
      "Degraded",
      scalingUp.kubeadmControlPlane,
      { machines: [], healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
    [
      "a MachineDeployment that scales down",
      "Degraded",
      scalingDown.machineDeployment,
      { cluster: scalingDown.cluster, machines: [scalingDown.deletingMachine, kept], healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
    [
      "a MachineSet that replaces a Machine",
      "Unhealthy",
      remediation.machineSet,
      {
        cluster: remediation.cluster,
        machines: [remediation.deletingMachine, remediation.deferredMachine],
        healthChecks: [remediation.machineHealthCheck],
      },
      ["progress", "warning", "warning"],
    ],
    [
      "a MachineSet whose Machine updates in place",
      "Unhealthy",
      withStatus(healthy.machineSet, { availableReplicas: 1 }),
      { cluster: healthy.cluster, machines: [updating, second], healthChecks: [] },
      ["progress", "warning", "warning"],
    ],
  ] as const)("reads %s as %s, whose tone alone follows its activities", (_, word, object, context, tones) => {
    MOMENTS.forEach((now, index) => {
      const status = statusOf(object as KubeObjectData, contextOf({ ...(context as Partial<StatusContext>), now }));

      expect(status.health.health).toBe(word);
      expect(status.tone.tone).toBe(tones[index]);
    });
  });

  it("reads Unhealthy the MachineSet and the MachineDeployment of a Machine that waits for minReadySeconds, in the tone of progress", () => {
    // The worker of healthy waiting for an hour of minReadySeconds: its `Available` changed to the wait and
    // `spec.minReadySeconds` set; its MachineSet and its MachineDeployment count it as not available.
    const waiting = withSpec(
      withCondition(healthy.workerMachine, "Available", { status: "False", reason: "WaitingForMinReadySeconds" }),
      { minReadySeconds: 3600 },
    );
    const owners = [
      withStatus(healthy.machineSet, { availableReplicas: 1 }),
      withCondition(healthy.machineDeployment, "Available", { status: "False", reason: "NotAvailable" }),
    ];

    for (const owner of owners) {
      for (const now of MOMENTS.slice(0, 2)) {
        const status = statusOf(
          owner,
          contextOf({ cluster: healthy.cluster, machines: [waiting, second], healthChecks: [], now }),
        );

        expect(status.health.health).toBe("Unhealthy");
        expect(status.tone).toMatchObject({ tone: "progress", setBy: { activity: { name: "Provisioning" } } });
      }
    }
  });
});

describe("a stale health", () => {
  it("keeps the word of a paused Cluster whose status describes an older generation", () => {
    const status = statusOf(paused.cluster, contextOf());

    expect(status.health).toMatchObject({ health: "Healthy", issues: [] });
    expect(status.freshness.map((mark) => mark.cause)).toEqual(["Paused"]);
  });

  it("keeps the word of an object whose controller is not available", () => {
    const context = contextOf({ controllers: { "cluster-api": { available: false } } });

    expect(healthOf(rollingOut.machineDeployment, context)).toEqual(healthOf(rollingOut.machineDeployment));
    expect(healthOf(rollingOut.machineDeployment, context).health).toBe("Degraded");
    expect(statusOf(rollingOut.machineDeployment, context).freshness).toHaveLength(1);
  });

  it("keeps the word of a Machine whose workload cluster cannot be reached", () => {
    // The Cluster of healthy with its probe changed to `False`.
    const cluster = withCondition(healthy.cluster, "RemoteConnectionProbe", { status: "False", reason: "ProbeFailed" });
    const status = statusOf(healthy.workerMachine, contextOf({ cluster }));

    expect(status.health.health).toBe("Healthy");
    expect(status.freshness.map((mark) => mark.cause)).toEqual(["Workload cluster unreachable"]);
  });
});

describe("a field of the wrong type", () => {
  it.each([
    ["a status that is not an object", { ...healthy.workerMachine, status: "Running" }, "status"],
    ["a spec that is not an object", { ...healthy.workerMachine, spec: ["v1.37.0"] }, "spec"],
    ["conditions that are not a list", withStatus(healthy.workerMachine, { conditions: {} }), "status.conditions"],
    [
      "a deletion time that is not text",
      withMetadata(healthy.workerMachine, { deletionTimestamp: 1_767_225_600 }),
      "metadata.deletionTimestamp",
    ],
    ["a negative count", withStatus(healthy.machineSet, { availableReplicas: -1 }), "status.availableReplicas"],
    ["a count that is not a number", withSpec(healthy.machineSet, { replicas: "2" }), "spec.replicas"],
  ])("reads Unknown with %s, notes it, and does not throw", (_, object, field) => {
    const status = statusOf(object as KubeObjectData, contextOf());

    expect(status.health.health).toBe("Unknown");
    expect(status.notes).toContainEqual({ code: "field-unreadable", field });
  });

  it("reads Unknown an object that is not an object, and does not throw", () => {
    const status = statusOf(null as unknown as KubeObjectData, contextOf());

    expect(status.health).toEqual({ health: "Unknown", restsOn: { form: "none" }, issues: [] });
    expect(status.notes).toEqual([{ code: "kind-unknown" }]);
  });
});
