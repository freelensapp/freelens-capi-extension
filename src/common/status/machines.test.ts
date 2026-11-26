// The rules of a Machine, a MachineSet, a MachineDeployment and a MachinePool (SPEC-0003, "Tests", "Unit", and "The
// rule of each kind", Machine, and MachineSet, MachineDeployment and MachinePool; P4, P5, P9, P10; SPEC-0001, R2.38
// to R2.69 and H1): what sums each up or stands for it, what makes it Degraded and what does not, the exceptions of
// H1 for a MachinePool, each phase of each closed set and one outside it, and the deprecated failure (P6). The
// objects come from the fixtures of SPEC-0002 (test/status-objects.ts); a case that changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  machinePools,
  noStatus,
  poolWithoutMachines,
  provisioning,
  remediation,
  rollingOut,
  scalingDown,
  scalingUp,
  scalingUpHeld,
  withAddedCondition,
  withCondition,
  withMetadata,
  withoutNode,
  withSpec,
  withStatus,
  withThirdPartyCondition,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { Health, KubeObjectData, MachineObject, StatusContext } from "./index";

function healthOf(object: KubeObjectData, context: Partial<StatusContext> = {}): Health {
  return statusOf(object, contextOf({ cluster: healthy.cluster, ...context })).health;
}

function wordOf(object: KubeObjectData, context: Partial<StatusContext> = {}) {
  return healthOf(object, context).health;
}

describe("a Machine", () => {
  it("reads Healthy when Ready is True", () => {
    expect(healthOf(healthy.workerMachine)).toMatchObject({
      health: "Healthy",
      restsOn: { form: "condition", type: "Ready" },
      issues: [],
    });
    expect(wordOf(healthy.controlPlaneMachine)).toBe("Healthy");
  });

  it("reads Degraded from any other condition of positive polarity, in practice one of a third party", () => {
    // The worker of healthy with a condition of a third party that is `False`.
    const backup = withAddedCondition(healthy.workerMachine, {
      type: "example.com/BackupReady",
      status: "False",
      reason: "BackupFailed",
      message: "",
      lastTransitionTime: "2025-12-31T23:59:50Z",
      observedGeneration: 1,
    });

    expect(healthOf(backup)).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "example.com/BackupReady" }],
    });
  });

  it("reads a condition of a third party as no issue, with the note, when a readiness gate that might name it cannot be read", () => {
    // The worker of healthy with a condition of a third party `False` and a readiness gate with no type.
    const unsure = withSpec(withThirdPartyCondition(healthy.workerMachine), {
      readinessGates: [{ polarity: "Negative" }],
    });
    const status = statusOf(unsure, contextOf({ cluster: healthy.cluster }));

    expect(status.health).toMatchObject({ health: "Healthy", issues: [] });
    expect(status.notes).toContainEqual({ code: "field-unreadable", field: "spec.readinessGates" });
  });

  it("is made Degraded neither by UpToDate (P4) nor by an Available that waits for minReadySeconds (P5)", () => {
    expect(healthOf(rollingOut.oldMachine)).toMatchObject({ health: "Healthy", issues: [] });
    // The worker of healthy with its `Available` changed to the wait.
    const waiting = withCondition(healthy.workerMachine, "Available", {
      status: "False",
      reason: "WaitingForMinReadySeconds",
    });

    expect(healthOf(waiting)).toMatchObject({ health: "Healthy", issues: [] });
  });

  it("reads Unknown while it waits for its Node, with NodeHealthy and so Ready Unknown", () => {
    expect(healthOf(withoutNode.machine)).toMatchObject({
      health: "Unknown",
      restsOn: { condition: { status: "Unknown" } },
    });
  });

  it("reads Unhealthy while it provisions, and when a check marks it for remediation", () => {
    expect(wordOf(provisioning.controlPlaneMachine)).toBe("Unhealthy");
    expect(wordOf(provisioning.workerMachine)).toBe("Unhealthy");
    expect(wordOf(remediation.deferredMachine)).toBe("Unhealthy");
  });

  it("reads Unhealthy when its Node was deleted, though its phase stays Running (R2.44)", () => {
    // The worker of healthy once its Node is deleted: the project writes `NodeHealthy` `False` `NodeDeleted`, which
    // turns its `Ready` `False`.
    const nodeDeleted = withCondition(
      withCondition(healthy.workerMachine, "NodeHealthy", { status: "False", reason: "NodeDeleted" }),
      "Ready",
      { status: "False", reason: "NotReady" },
    );
    const status = statusOf(nodeDeleted, contextOf({ cluster: healthy.cluster }));

    expect(status.health.health).toBe("Unhealthy");
    expect(status.phase?.phase).toBe("Running");
  });

  it.each(["Pending", "Provisioning", "Provisioned", "Running", "Updating", "Deleting", "Deleted", "Unknown"])(
    "shows the phase %s as written",
    (phase) => {
      expect(statusOf(withStatus(healthy.workerMachine, { phase }), contextOf()).phase).toEqual({
        phase,
        written: phase,
        deprecated: false,
      });
    },
  );

  it("shows Failed with the deprecated label, and Unknown for a phase outside the set", () => {
    expect(statusOf(withStatus(healthy.workerMachine, { phase: "Failed" }), contextOf()).phase).toEqual({
      phase: "Failed",
      written: "Failed",
      deprecated: true,
    });
    expect(statusOf(withStatus(healthy.workerMachine, { phase: "Booting" }), contextOf()).phase).toEqual({
      phase: "Unknown",
      written: "Booting",
      deprecated: false,
    });
  });

  it("notes the deprecated failure, which it never reads for the health (P6)", () => {
    const failed = withStatus(healthy.workerMachine, {
      deprecated: { v1beta1: { failureReason: "UpdateError", failureMessage: "the instance was terminated" } },
    });
    const status = statusOf(failed, contextOf({ cluster: healthy.cluster }));

    expect(status.health.health).toBe("Healthy");
    expect(status.notes).toEqual([
      { code: "deprecated-failure", reason: "UpdateError", message: "the instance was terminated" },
    ]);
  });
});

describe("the deprecated failure of the owners of Machines (P6)", () => {
  // Each owner of the fixtures with a failure written under `status.deprecated.v1beta1`.
  const failure = { deprecated: { v1beta1: { failureReason: "UpdateError", failureMessage: "a Machine failed" } } };
  const noted = { code: "deprecated-failure", reason: "UpdateError", message: "a Machine failed" };

  it.each([
    ["a MachineSet", healthy.machineSet, [healthy.workerMachine]],
    ["a MachinePool", machinePools.machinePool, [machinePools.poolMachine]],
  ] as const)("notes it for %s, whose schema keeps it", (_, owner, machines) => {
    const status = statusOf(
      withStatus(owner as KubeObjectData, failure),
      contextOf({ cluster: healthy.cluster, machines }),
    );

    expect(status.notes).toContainEqual(noted);
  });

  it("notes none for a MachineDeployment, whose schema keeps none", () => {
    const status = statusOf(
      withStatus(healthy.machineDeployment, failure),
      contextOf({ cluster: healthy.cluster, machines: [healthy.workerMachine] }),
    );

    expect(status.notes).not.toContainEqual(noted);
  });
});

describe("a MachineSet (P9)", () => {
  it("reads Healthy when every wanted Machine is available, and rests on the counters", () => {
    expect(healthOf(healthy.machineSet)).toEqual({
      health: "Healthy",
      restsOn: { form: "replicas", available: 2, replicas: 2 },
      issues: [],
    });
  });

  it("reads Healthy with more Machines available than spec.replicas, as while a scale down deletes one", () => {
    // The MachineSet of healthy scaled down to one replica while both of its Machines are still available.
    expect(healthOf(withSpec(healthy.machineSet, { replicas: 1 }))).toMatchObject({
      health: "Healthy",
      restsOn: { form: "replicas", available: 2, replicas: 1 },
    });
  });

  it("reads Unhealthy while fewer Machines are available than spec.replicas", () => {
    expect(healthOf(withoutNode.machineSet)).toMatchObject({
      health: "Unhealthy",
      restsOn: { form: "replicas", available: 0, replicas: 1 },
    });
    expect(wordOf(rollingOut.newMachineSet)).toBe("Unhealthy");
    expect(wordOf(scalingUpHeld.machineSet)).toBe("Unhealthy");
    expect(wordOf(remediation.machineSet)).toBe("Unhealthy");
  });

  it("reads Degraded from MachinesReady when enough Machines are available, as at a scale down", () => {
    expect(healthOf(scalingDown.machineSet)).toMatchObject({
      health: "Degraded",
      restsOn: { form: "replicas", available: 1, replicas: 1 },
      issues: [{ form: "condition", type: "MachinesReady" }],
    });
  });

  it("reads Degraded from a condition of a third party that is False, as from MachinesReady (H1)", () => {
    expect(healthOf(withThirdPartyCondition(healthy.machineSet))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "example.com/BackupReady" }],
    });
  });

  it("is made Degraded neither by MachinesUpToDate (P4) nor by a MachinesReady that is Unknown", () => {
    expect(healthOf(rollingOut.oldMachineSet)).toMatchObject({ health: "Healthy", issues: [] });
    expect(
      wordOf(withCondition(healthy.machineSet, "MachinesReady", { status: "Unknown", reason: "ReadyUnknown" })),
    ).toBe("Healthy");
  });

  it("reads Unknown while spec.replicas or status.availableReplicas is unset", () => {
    expect(healthOf(withSpec(healthy.machineSet, { replicas: undefined }))).toMatchObject({
      health: "Unknown",
      restsOn: { form: "replicas", available: 2, replicas: undefined },
    });
    expect(wordOf(withStatus(healthy.machineSet, { availableReplicas: undefined }))).toBe("Unknown");
    expect(wordOf(noStatus.machineSet)).toBe("Unknown");
  });

  it("has no phase", () => {
    expect(statusOf(healthy.machineSet, contextOf()).phase).toBeUndefined();
  });
});

describe("a MachineDeployment", () => {
  it("reads Healthy when Available is True, and Degraded from MachinesReady", () => {
    expect(healthOf(healthy.machineDeployment)).toMatchObject({ health: "Healthy", restsOn: { type: "Available" } });
    expect(healthOf(rollingOut.machineDeployment)).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "MachinesReady" }],
    });
  });

  it("reads Degraded from a condition of a third party that is False, which Available leaves out (H1)", () => {
    expect(healthOf(withThirdPartyCondition(healthy.machineDeployment))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "example.com/BackupReady" }],
    });
  });

  it("reads Unhealthy when Available is False, and Unknown with no status", () => {
    expect(wordOf(scalingUp.machineDeployment)).toBe("Unhealthy");
    expect(wordOf(provisioning.machineDeployment)).toBe("Unhealthy");
    expect(wordOf(noStatus.machineDeployment)).toBe("Unknown");
  });

  it.each(["ScalingUp", "ScalingDown", "Running", "Unknown"])("shows the phase %s as written", (phase) => {
    expect(statusOf(withStatus(healthy.machineDeployment, { phase }), contextOf()).phase).toEqual({
      phase,
      written: phase,
      deprecated: false,
    });
  });

  it("shows Failed with the deprecated label, and Unknown for a phase outside the set", () => {
    expect(statusOf(withStatus(healthy.machineDeployment, { phase: "Failed" }), contextOf()).phase?.deprecated).toBe(
      true,
    );
    expect(statusOf(withStatus(healthy.machineDeployment, { phase: "Provisioned" }), contextOf()).phase).toEqual({
      phase: "Unknown",
      written: "Provisioned",
      deprecated: false,
    });
  });
});

describe("a MachinePool (P10)", () => {
  const machines = [machinePools.poolMachine];

  it("reads its Machines as a MachineSet: Unhealthy while fewer are available than spec.replicas", () => {
    expect(healthOf(machinePools.machinePool, { machines })).toEqual({
      health: "Unhealthy",
      restsOn: { form: "replicas", available: 0, replicas: 1 },
      issues: [{ form: "machine", name: "worker-c6khcq", condition: expect.objectContaining({ type: "Ready" }) }],
    });
  });

  it("reads Degraded from a Machine that is not deleting and not Ready, while enough are available", () => {
    // The pool of machine-pools with its Machine counted available, while its `Ready` stays `False`.
    const counted = withStatus(machinePools.machinePool, { availableReplicas: 1 });

    expect(healthOf(counted, { machines })).toMatchObject({
      health: "Degraded",
      issues: [{ form: "machine", name: "worker-c6khcq" }],
    });
  });

  it("counts no condition of its own, a third party's included, since its health comes from its Machines (H1)", () => {
    // The pool of machine-pools with its Machine `Ready`, available, and a condition of a third party `False`.
    const ready = withCondition(machinePools.poolMachine, "Ready", { status: "True", reason: "Ready" });
    const pool = withThirdPartyCondition(withStatus(machinePools.machinePool, { availableReplicas: 1 }));

    expect(healthOf(pool, { machines: [ready] })).toMatchObject({ health: "Healthy", issues: [] });
  });

  it("does not count a Machine that is deleting, nor one whose Ready is Unknown", () => {
    const counted = withStatus(machinePools.machinePool, { availableReplicas: 1 });
    const deleting: MachineObject = withMetadata(machinePools.poolMachine, {
      deletionTimestamp: "2025-12-31T23:59:58Z",
    });
    const unknown = withCondition(machinePools.poolMachine, "Ready", { status: "Unknown", reason: "ReadyUnknown" });

    expect(healthOf(counted, { machines: [deleting] })).toMatchObject({ health: "Healthy", issues: [] });
    expect(healthOf(counted, { machines: [unknown] })).toMatchObject({ health: "Healthy", issues: [] });
  });

  it("reads Unknown, with the reason and the deprecated v1beta1 Ready, with no Machine and replicas above zero", () => {
    const status = statusOf(poolWithoutMachines.machinePool, contextOf({ cluster: healthy.cluster, machines: [] }));

    expect(status.health).toMatchObject({
      health: "Unknown",
      restsOn: { form: "replicas", available: 1, replicas: 1 },
    });
    expect(status.notes).toEqual([
      {
        code: "no-machine",
        deprecatedReady: expect.objectContaining({
          type: "Ready",
          status: "False",
          reason: "WaitingForReplicasReady",
          severity: "Info",
        }),
      },
    ]);
  });

  it("reads Healthy with no Machine at 0 replicas, where nothing has a readiness to know", () => {
    // The pool without Machines asked to run none: its `spec.replicas` set to 0.
    expect(healthOf(withSpec(poolWithoutMachines.machinePool, { replicas: 0 }), { machines: [] })).toMatchObject({
      health: "Healthy",
      issues: [],
    });
  });

  it("reads Unknown and notes it when the view gave no Machines", () => {
    const status = statusOf(machinePools.machinePool, contextOf({ cluster: healthy.cluster }));

    expect(status.health.health).toBe("Unknown");
    expect(status.notes).toEqual([{ code: "input-not-given", input: "machines" }]);
  });

  it("reads Unknown with no status, whatever its Machines", () => {
    expect(wordOf(noStatus.machinePool, { machines: [] })).toBe("Unknown");
    expect(wordOf(withSpec(noStatus.machinePool, { replicas: 0 }), { machines: [] })).toBe("Unknown");
  });

  it.each([
    "Pending",
    "Provisioning",
    "Provisioned",
    "Running",
    "ScalingUp",
    "ScalingDown",
    "Scaling",
    "Deleting",
    "Unknown",
  ])("shows the phase %s as written", (phase) => {
    expect(statusOf(withStatus(machinePools.machinePool, { phase }), contextOf()).phase).toEqual({
      phase,
      written: phase,
      deprecated: false,
    });
  });

  it("shows Failed with the deprecated label, and Unknown for a phase outside the set", () => {
    expect(statusOf(withStatus(machinePools.machinePool, { phase: "Failed" }), contextOf()).phase?.deprecated).toBe(
      true,
    );
    expect(statusOf(withStatus(machinePools.machinePool, { phase: "Updating" }), contextOf()).phase?.phase).toBe(
      "Unknown",
    );
  });
});
