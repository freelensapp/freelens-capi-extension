// The rule of a MachineHealthCheck and of a MachineDrainRule (SPEC-0003, "Tests", "Unit", and "The rule of each kind",
// MachineHealthCheck; P11; SPEC-0001, R2.70 to R2.73 and H1): Healthy when every target is healthy; with and without
// the Machines of its targets when some are not; never Unhealthy; Unknown with no status or no
// `RemediationAllowed`; and the mark of remediation, allowed and not allowed, each with the weight of its condition,
// which gives its token (P31). The objects come from the fixtures of SPEC-0002 (test/status-objects.ts); a case
// that changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  noStatus,
  provisioning,
  remediation,
  withCondition,
  withoutCondition,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { KubeObjectData, MachineObject, StatusContext } from "./index";

function statusIn(object: KubeObjectData, context: Partial<StatusContext> = {}) {
  return statusOf(object, contextOf({ cluster: healthy.cluster, ...context }));
}

const targets: MachineObject[] = [remediation.deletingMachine, remediation.deferredMachine];

describe("a MachineHealthCheck", () => {
  it("reads Healthy when every target is healthy, and rests on its targets", () => {
    expect(statusIn(healthy.machineHealthCheck).health).toEqual({
      health: "Healthy",
      restsOn: { form: "targets", expectedMachines: 2, currentHealthy: 2 },
      issues: [],
    });
  });

  it("reads Degraded when a target of the view has HealthCheckSucceeded False", () => {
    expect(statusIn(remediation.machineHealthCheck, { machines: targets }).health).toMatchObject({
      health: "Degraded",
      restsOn: { form: "targets", expectedMachines: 2, currentHealthy: 0 },
      issues: [
        { form: "machine", name: "freelens-capi-remediation-md-0-qrjs5-t4crs-4g8dq" },
        { form: "machine", name: "freelens-capi-remediation-md-0-qrjs5-t4crs-bd642" },
      ],
    });
  });

  it("reads Healthy when the targets that are not healthy only start, as its count alone cannot tell", () => {
    // The MachineHealthCheck of the workers of provisioning: its one target has no Node yet, and no
    // `HealthCheckSucceeded`.
    expect(statusIn(provisioning.machineHealthCheck, { machines: [provisioning.workerMachine] }).health).toMatchObject({
      health: "Healthy",
      restsOn: { expectedMachines: 1, currentHealthy: 0 },
      issues: [],
    });
  });

  it("reads Unknown and notes it when the view gave no Machines of its targets", () => {
    const status = statusIn(remediation.machineHealthCheck);

    expect(status.health.health).toBe("Unknown");
    expect(status.notes).toEqual([{ code: "input-not-given", input: "machines" }]);
  });

  it("is never Unhealthy, when remediation is not allowed either", () => {
    // The check of remediation past its limit: its `RemediationAllowed` changed to `False`.
    const tooMany = withCondition(remediation.machineHealthCheck, "RemediationAllowed", {
      status: "False",
      reason: "TooManyUnhealthy",
      message: "Remediation is not allowed, the number of not started or unhealthy machines exceeds maxUnhealthy",
    });

    expect(statusIn(tooMany, { machines: targets }).health.health).toBe("Degraded");
    expect(statusIn(tooMany, { machines: [] }).health.health).toBe("Healthy");
  });

  it("reads Unknown while its status or RemediationAllowed is missing", () => {
    expect(statusIn(noStatus.machineHealthCheck, { machines: [] }).health.health).toBe("Unknown");
    expect(statusIn(withoutCondition(healthy.machineHealthCheck, "RemediationAllowed")).health.health).toBe("Unknown");
  });

  it("reads Unknown a count of the wrong type, and notes it", () => {
    const status = statusIn(withStatus(healthy.machineHealthCheck, { currentHealthy: -2 }));

    expect(status.health.health).toBe("Unknown");
    expect(status.notes).toContainEqual({ code: "field-unreadable", field: "status.currentHealthy" });
  });

  it("has no phase", () => {
    expect(statusIn(healthy.machineHealthCheck).phase).toBeUndefined();
  });
});

describe("the mark of remediation (P11)", () => {
  it("says that remediation is allowed, with the weight of RemediationAllowed", () => {
    expect(statusIn(healthy.machineHealthCheck).remediation).toMatchObject({
      allowed: true,
      condition: { type: "RemediationAllowed", status: "True", weight: "Ok" },
    });
  });

  it("says that remediation is not allowed, with the weight and the message of the project", () => {
    const message =
      "Remediation is not allowed, the number of not started or unhealthy machines does not fall within the range";
    const tooMany = withCondition(healthy.machineHealthCheck, "RemediationAllowed", {
      status: "False",
      reason: "TooManyUnhealthy",
      message,
    });

    expect(statusIn(tooMany).remediation).toMatchObject({
      allowed: false,
      condition: { reason: "TooManyUnhealthy", message, weight: "Issue" },
    });
  });

  it("says nothing it cannot read", () => {
    expect(statusIn(noStatus.machineHealthCheck).remediation).toEqual({ allowed: undefined, condition: undefined });
    expect(
      statusIn(withCondition(healthy.machineHealthCheck, "RemediationAllowed", { status: "Unknown" })).remediation,
    ).toMatchObject({ allowed: undefined, condition: { weight: "Unknown" } });
  });

  it("is a mark of a MachineHealthCheck alone", () => {
    expect(statusIn(healthy.workerMachine).remediation).toBeUndefined();
  });
});

describe("a MachineDrainRule", () => {
  it("has no health, no mark and no remediation", () => {
    const status = statusIn(noStatus.machineDrainRule);

    expect(status).toMatchObject({
      health: { health: "none", because: "no status" },
      freshness: [],
      remediation: undefined,
      notes: [],
    });
  });
});
