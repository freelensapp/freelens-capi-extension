// The rules of a KubeadmControlPlane and of a KubeadmConfig, and their templates (SPEC-0003, "Tests", "Unit", and
// "The rule of each kind", KubeadmControlPlane and KubeadmConfig; SPEC-0001, R2.74 to R2.83 and H1): `Available` and
// `Ready` that sum them up, each condition that makes a KubeadmControlPlane Degraded, its checks `False` while a
// Machine joins, an etcd member with no Machine yet included, in the tone of progress while it scales (D2), and what
// makes neither Degraded. The objects come from the fixtures of SPEC-0002 (test/status-objects.ts); a case that
// changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  noStatus,
  provisioning,
  scalingUp,
  scalingUpHeld,
  upgrading,
  withCondition,
  withStatus,
  withThirdPartyCondition,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { Health, KubeObjectData } from "./index";

function healthOf(object: KubeObjectData): Health {
  return statusOf(object, contextOf({ cluster: healthy.cluster })).health;
}

function issueTypesOf(health: Health): string[] {
  return health.health === "none"
    ? []
    : health.issues.map((issue) => (issue.form === "condition" ? issue.type : issue.form));
}

describe("a KubeadmControlPlane", () => {
  it("reads Healthy when Available is True and nothing it counts is an issue", () => {
    expect(healthOf(healthy.kubeadmControlPlane)).toMatchObject({
      health: "Healthy",
      restsOn: { form: "condition", type: "Available" },
      issues: [],
    });
  });

  it("reads Degraded from its checks of etcd while a Machine joins, an etcd member with no Machine yet included", () => {
    const health = healthOf(scalingUp.kubeadmControlPlane);

    expect(health.health).toBe("Degraded");
    expect(issueTypesOf(health)).toEqual(["EtcdClusterHealthy", "MachinesReady"]);
    expect(health.health !== "none" && health.issues[0]).toMatchObject({
      condition: { message: expect.stringContaining("does not have a corresponding Machine") },
    });
  });

  it("reads Degraded in the tone of progress while a Machine joins, then of a warning past its threshold (D1, D2)", () => {
    // The fixtures of scaling-up have no Cluster and no Machine object: its Scaling up, since 23:59:36, takes the
    // threshold of one Machine, 600 seconds, with no floor.
    const passesAt = Date.parse("2025-12-31T23:59:36Z") + 600_000;
    const at = (now: number) =>
      statusOf(scalingUp.kubeadmControlPlane, contextOf({ machines: [], healthChecks: [], now }));

    expect(at(passesAt - 1)).toMatchObject({
      health: { health: "Degraded" },
      activities: { activities: [{ name: "Scaling up", state: "Progressing" }] },
      tone: { tone: "progress", setBy: { activity: { name: "Scaling up" } } },
    });
    expect(at(passesAt)).toMatchObject({ health: { health: "Degraded" }, tone: { tone: "warning" } });
  });

  it.each(["ControlPlaneComponentsHealthy", "Initialized", "CertificatesAvailable"])(
    "reads Degraded from %s while Available is True",
    (type) => {
      // The control plane of healthy with that condition changed to `False`.
      const health = healthOf(withCondition(healthy.kubeadmControlPlane, type, { status: "False" }));

      expect(health.health).toBe("Degraded");
      expect(issueTypesOf(health)).toEqual([type]);
    },
  );

  it("reads Degraded from MachinesReady during an upgrade, and leaves out MachinesUpToDate (P4)", () => {
    expect(issueTypesOf(healthOf(upgrading.kubeadmControlPlane))).toEqual(["MachinesReady"]);
    expect(issueTypesOf(healthOf(scalingUpHeld.kubeadmControlPlane))).toEqual(["MachinesReady"]);
  });

  it("is not made Degraded by an EtcdClusterHealthy that stays Unknown, as with external etcd", () => {
    const external = withCondition(healthy.kubeadmControlPlane, "EtcdClusterHealthy", {
      status: "Unknown",
      reason: "HealthUnknown",
    });

    expect(healthOf(external)).toMatchObject({ health: "Healthy", issues: [] });
  });

  it("reads Unhealthy before it is initialized, as the project says, and Unknown with no status", () => {
    expect(healthOf(provisioning.kubeadmControlPlane)).toMatchObject({
      health: "Unhealthy",
      restsOn: { condition: { message: "Control plane not yet initialized" } },
    });
    expect(healthOf(noStatus.kubeadmControlPlane).health).toBe("Unknown");
  });

  it("reads Degraded from a condition of a third party that is False, which Available leaves out (H1)", () => {
    expect(healthOf(withThirdPartyCondition(healthy.kubeadmControlPlane))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "example.com/BackupReady" }],
    });
  });

  it("has no phase", () => {
    expect(statusOf(healthy.kubeadmControlPlane, contextOf()).phase).toBeUndefined();
  });

  it("notes the deprecated failure (P6)", () => {
    const failed = withStatus(healthy.kubeadmControlPlane, {
      deprecated: { v1beta1: { failureMessage: "etcd failed" } },
    });

    const context = contextOf({ cluster: healthy.cluster, machines: [healthy.controlPlaneMachine] });

    expect(statusOf(failed, context).notes).toEqual([
      { code: "deprecated-failure", reason: undefined, message: "etcd failed" },
    ]);
  });
});

describe("a KubeadmConfig", () => {
  it("reads Healthy when Ready is True", () => {
    expect(healthOf(healthy.kubeadmConfig)).toMatchObject({
      health: "Healthy",
      restsOn: { form: "condition", type: "Ready" },
      issues: [],
    });
  });

  it("reads Unhealthy while it waits for the control plane, which only the message tells from a failure", () => {
    expect(healthOf(provisioning.workerKubeadmConfig)).toMatchObject({
      health: "Unhealthy",
      restsOn: { condition: { status: "False" } },
    });
  });

  it("is made Degraded by none of its own conditions, which are the inputs of Ready, and by one of a third party", () => {
    // The config of healthy with its `DataSecretAvailable` changed to `False`, while its `Ready` stays `True`.
    const stale = withCondition(healthy.kubeadmConfig, "DataSecretAvailable", {
      status: "False",
      reason: "NotAvailable",
    });

    expect(healthOf(stale)).toMatchObject({ health: "Healthy", issues: [] });
    expect(
      healthOf(
        withCondition(healthy.kubeadmConfig, "CertificatesAvailable", { status: "False", reason: "NotAvailable" }),
      ),
    ).toMatchObject({ health: "Healthy", issues: [] });
    expect(healthOf(noStatus.kubeadmConfig).health).toBe("Unknown");
    expect(healthOf(withThirdPartyCondition(healthy.kubeadmConfig))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "example.com/BackupReady" }],
    });
  });
});

describe("the deprecated failure of a KubeadmConfig (P6)", () => {
  it("notes it, since its schema keeps it", () => {
    const failed = withStatus(healthy.kubeadmConfig, {
      deprecated: { v1beta1: { failureReason: "DataSecretGenerationFailed", failureMessage: "no join token" } },
    });
    const context = contextOf({ cluster: healthy.cluster, machines: [healthy.controlPlaneMachine] });

    expect(statusOf(failed, context).notes).toEqual([
      { code: "deprecated-failure", reason: "DataSecretGenerationFailed", message: "no join token" },
    ]);
  });
});

describe("the templates of kubeadm", () => {
  it.each([
    ["KubeadmControlPlaneTemplate", healthy.kubeadmControlPlaneTemplate],
    ["KubeadmConfigTemplate", healthy.kubeadmConfigTemplate],
    ["KubeadmControlPlaneTemplate with no status", noStatus.kubeadmControlPlaneTemplate],
    ["KubeadmConfigTemplate with no status", noStatus.kubeadmConfigTemplate],
  ])("gives a %s no health", (_, template) => {
    expect(healthOf(template)).toEqual({ health: "none", because: "no status" });
  });
});
