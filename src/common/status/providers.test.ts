// The rules of what providers serve (SPEC-0003, "Tests", "Unit", and "The rule of each kind", ClusterResourceSet,
// IPAM and providers, and Objects of a provider; P13, P14, P15, P16; SPEC-0001, R2.86 to R2.88 and H1): an
// IPAddressClaim with and without `Ready`; the kinds of the operator, the wait for the core provider, an upgrade that
// failed or whose manifests cannot be fetched, and a `ProviderUpgraded` that is stale; the objects of a provider by
// their role; and the kinds of the group with no status. The fixtures of SPEC-0002 have objects of the development
// provider, which the cases read in each role, and no IPAddressClaim with a status nor any object of the operator,
// since the test environment has no IPAM provider and installs with clusterctl: those are written from the schemas of
// the release and of the operator, with the wait for the core provider before and after its threshold, the activity
// and the tone of the health.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  machinePools,
  noStatus,
  provisioning,
  withAddedCondition,
  withCondition,
  withMetadata,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { Health, KubeObjectData, ProviderRole, StatusContext } from "./index";

function healthOf(object: KubeObjectData, context: Partial<StatusContext> = {}): Health {
  return statusOf(object, contextOf({ cluster: healthy.cluster, ...context })).health;
}

const READY_AT = "2025-12-31T23:59:58Z";

function condition(type: string, status: string, reason: string, message = "") {
  return { type, status, reason, message, lastTransitionTime: READY_AT, observedGeneration: 1 };
}

describe("an IPAddressClaim (P13)", () => {
  const claim = (status: Record<string, unknown>) => withStatus(noStatus.ipAddressClaim, status);
  const context = { provider: "ipam-test" };

  it("reads Ready when the provider writes it", () => {
    expect(healthOf(claim({ conditions: [condition("Ready", "True", "Ready")] }), context)).toMatchObject({
      health: "Healthy",
      restsOn: { form: "condition", type: "Ready" },
    });
    expect(healthOf(claim({ conditions: [condition("Ready", "False", "PoolExhausted")] }), context).health).toBe(
      "Unhealthy",
    );
  });

  it("reads Healthy with no Ready and an address, which the contract makes the mark of a claim served", () => {
    expect(healthOf(claim({ addressRef: { name: "freelens-capi-no-status" } }), context)).toEqual({
      health: "Healthy",
      restsOn: { form: "address", address: "freelens-capi-no-status" },
      issues: [],
    });
  });

  it("reads Unknown with neither, and with no status", () => {
    expect(healthOf(claim({ conditions: [] }), context)).toEqual({
      health: "Unknown",
      restsOn: { form: "address", address: undefined },
      issues: [],
    });
    expect(healthOf(noStatus.ipAddressClaim, context).health).toBe("Unknown");
  });

  it("reads Unknown, and notes it, an address of the wrong type", () => {
    for (const [addressRef, field] of [
      ["freelens-capi-no-status", "status.addressRef"],
      [{ name: 5 }, "status.addressRef.name"],
    ] as const) {
      const status = statusOf(claim({ addressRef }), contextOf({ cluster: healthy.cluster, ...context }));

      expect(status.health).toMatchObject({ health: "Unknown", restsOn: { form: "address", address: undefined } });
      expect(status.notes).toContainEqual({ code: "field-unreadable", field });
    }
  });
});

describe("a kind of the operator (P14)", () => {
  function operator(conditions: Record<string, unknown>[], installedVersion?: string, version = "v1.14.4") {
    return {
      apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
      kind: "BootstrapProvider",
      metadata: { name: "kubeadm", namespace: "capi-kubeadm-bootstrap-system", generation: 1 },
      spec: { version },
      status: { conditions, installedVersion, observedGeneration: 1 },
    };
  }
  const installed = condition("ProviderInstalled", "True", "ProviderInstalled");
  const preflight = condition("PreflightCheckPassed", "True", "PreflightCheckPassed");
  const ready = condition("Ready", "True", "DeploymentAvailable");
  const waiting = condition(
    "PreflightCheckPassed",
    "False",
    "WaitingForCoreProviderReady",
    "Waiting for the core provider",
  );

  it("reads Healthy only when PreflightCheckPassed, ProviderInstalled and Ready are all True", () => {
    expect(healthOf(operator([preflight, installed, ready], "v1.14.4"))).toEqual({
      health: "Healthy",
      restsOn: { form: "condition", type: "Ready", condition: expect.objectContaining({ status: "True" }) },
      issues: [],
    });
  });

  it("reads Unhealthy when Ready is False, and Unknown when Ready is Unknown", () => {
    const down = condition("Ready", "False", "MinimumReplicasUnavailable");

    expect(healthOf(operator([preflight, installed, down], "v1.14.4")).health).toBe("Unhealthy");
    expect(healthOf(operator([preflight, installed, { ...ready, status: "Unknown" }], "v1.14.4")).health).toBe(
      "Unknown",
    );
  });

  it("reads Degraded when Ready is True and another of the three is not, the wait for the core provider included", () => {
    expect(healthOf(operator([waiting, installed, ready], "v1.14.4"))).toMatchObject({
      health: "Degraded",
      issues: [
        { form: "condition", type: "PreflightCheckPassed", condition: { reason: "WaitingForCoreProviderReady" } },
      ],
    });
    expect(healthOf(operator([installed, ready], "v1.14.4"))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "PreflightCheckPassed", condition: undefined }],
    });
  });

  it("reads, with no Ready, Unhealthy for a first installation that failed and Unknown while it waits", () => {
    const failed = condition("ProviderInstalled", "False", "ComponentsFetchError");
    const refused = condition("PreflightCheckPassed", "False", "IncorrectVersionFormat");

    expect(healthOf(operator([preflight, failed]))).toMatchObject({
      health: "Unhealthy",
      restsOn: { type: "ProviderInstalled" },
    });
    expect(healthOf(operator([refused]))).toMatchObject({
      health: "Unhealthy",
      restsOn: { type: "PreflightCheckPassed" },
    });
    expect(healthOf(operator([waiting]))).toMatchObject({
      health: "Unknown",
      restsOn: { type: "Ready", condition: undefined },
    });
    expect(healthOf(operator([preflight, installed])).health).toBe("Unknown");
  });

  it("reads Unknown, with no Ready, a preflight check that is False with a reason of the wrong type, and notes it", () => {
    // Only the reason tells the wait for the core provider from a check that refuses: written as a number here.
    const status = statusOf(operator([{ ...waiting, reason: 7 }]), contextOf());

    expect(status.health).toMatchObject({ health: "Unknown", restsOn: { type: "Ready", condition: undefined } });
    expect(status.notes).toContainEqual({
      code: "field-unreadable",
      field: "status.conditions[PreflightCheckPassed].reason",
    });
    expect(status.activities).toMatchObject({ activities: [{ name: "Provisioning", state: "Unknown" }] });
  });

  it("counts a ProviderUpgraded that is False while the installed version differs from the spec", () => {
    const upgradeFailed = condition("ProviderUpgraded", "False", "ComponentsUpgradeError");

    expect(healthOf(operator([preflight, installed, ready, upgradeFailed], "v1.14.4", "v1.15.0"))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "ProviderUpgraded" }],
    });
  });

  it("reads an upgrade whose manifests cannot be fetched as an upgrade that failed", () => {
    const fetchFailed = condition("ProviderInstalled", "False", "ComponentsFetchError");

    expect(healthOf(operator([preflight, fetchFailed, ready], "v1.14.4", "v1.15.0"))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "ProviderInstalled" }],
    });
  });

  it("compares the two versions as text, as the operator does, so that v1.14.4 and 1.14.4 differ", () => {
    const upgradeFailed = condition("ProviderUpgraded", "False", "ComponentsUpgradeError");
    const status = statusOf(operator([preflight, installed, ready, upgradeFailed], "v1.14.4", "1.14.4"), contextOf());

    expect(status.health).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "ProviderUpgraded" }],
    });
    expect(status.notes).not.toContainEqual({ code: "stale-condition", type: "ProviderUpgraded" });
    expect(status.activities).toMatchObject({ activities: [{ name: "Upgrading" }] });
  });

  it("reads a ProviderUpgraded that is False once the version is set back as stale, At rest and no issue", () => {
    const upgradeFailed = condition("ProviderUpgraded", "False", "ComponentsUpgradeError");
    const status = statusOf(operator([preflight, installed, ready, upgradeFailed], "v1.14.4"), contextOf());

    expect(status.health).toMatchObject({ health: "Healthy", issues: [] });
    expect(status.notes).toEqual([{ code: "stale-condition", type: "ProviderUpgraded" }]);
  });

  describe("the wait for the core provider, which the operator treats as no error (P14)", () => {
    // The operator looks only for a CoreProvider object, which the model does not see: with one that turns ready,
    // the wait ends with the next preflight check; without one, it lasts for good, and only the clock tells it.
    const created = "2025-12-31T23:58:00Z";
    const passesAt = Date.parse(created) + 600_000;
    const at = (object: KubeObjectData, now: number) =>
      statusOf(withMetadata(object, { creationTimestamp: created }), contextOf({ now }));

    it("is a step of the Provisioning of a kind not installed yet, in progress within 600 seconds, a warning past them", () => {
      const installing = operator([waiting]);

      expect(at(installing, passesAt - 1)).toMatchObject({
        health: { health: "Unknown" },
        activities: { activities: [{ name: "Provisioning", state: "Progressing", tone: "progress" }] },
        tone: { tone: "health" },
      });
      for (const now of [passesAt, passesAt + 86_400_000]) {
        expect(at(installing, now)).toMatchObject({
          health: { health: "Unknown" },
          activities: { activities: [{ name: "Provisioning", state: "Progressing", tone: "warning" }] },
          tone: { tone: "health" },
        });
      }
    });

    it("ends once a CoreProvider is ready, when the preflight check passes and the installation goes on", () => {
      expect(at(operator([preflight]), passesAt - 1)).toMatchObject({
        activities: { activities: [{ name: "Provisioning", state: "Progressing" }] },
      });
      expect(at(operator([preflight, installed, ready], "v1.14.4"), passesAt - 1)).toMatchObject({
        health: { health: "Healthy" },
        activities: { activities: [], idle: true },
      });
    });

    it("is a step of an upgrade, with no start, so that a Degraded health and the activity take the tone of a warning", () => {
      expect(at(operator([waiting, installed, ready], "v1.14.4", "v1.15.0"), passesAt - 1)).toMatchObject({
        health: { health: "Degraded" },
        activities: { activities: [{ name: "Upgrading", state: "Progressing", since: undefined, tone: "warning" }] },
        tone: { tone: "warning", setBy: { activity: { name: "Upgrading" } } },
      });
    });

    it("is no activity of a kind installed and up to date, which reads Degraded in the tone of its health", () => {
      expect(at(operator([waiting, installed, ready], "v1.14.4"), passesAt - 1)).toMatchObject({
        health: { health: "Degraded" },
        activities: { activities: [], idle: true },
        tone: { tone: "health" },
      });
    });
  });

  it("reads each of the seven kinds by the same rule", () => {
    for (const kind of [
      "CoreProvider",
      "BootstrapProvider",
      "ControlPlaneProvider",
      "InfrastructureProvider",
      "AddonProvider",
      "IPAMProvider",
      "RuntimeExtensionProvider",
    ]) {
      expect(healthOf({ ...operator([preflight, installed, ready], "v1.14.4"), kind }).health).toBe("Healthy");
    }
  });
});

describe("an object of a provider (P15)", () => {
  const as = (role: ProviderRole) => ({ role, provider: "infrastructure-docker" });

  it("reads an infrastructure cluster by Ready, and Degraded from any other condition of positive polarity", () => {
    expect(healthOf(healthy.devCluster, as("infrastructure-cluster"))).toMatchObject({
      health: "Healthy",
      restsOn: { type: "Ready" },
    });
    // The DevCluster of healthy with its load balancer gone: `LoadBalancerAvailable` changed to `False`.
    const noBalancer = withCondition(healthy.devCluster, "LoadBalancerAvailable", { status: "False" });

    expect(healthOf(noBalancer, as("infrastructure-cluster"))).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "LoadBalancerAvailable" }],
    });
  });

  it("reads an infrastructure machine by Ready", () => {
    expect(healthOf(healthy.devMachine, as("infrastructure-machine")).health).toBe("Healthy");
    expect(healthOf(provisioning.devMachine, as("infrastructure-machine"))).toMatchObject({
      health: "Unhealthy",
      restsOn: { type: "Ready" },
      issues: [{ form: "condition", type: "BootstrapCompleted" }],
    });
  });

  it("reads an infrastructure machine pool, a bootstrap config and an IPAM pool by Ready", () => {
    expect(healthOf(machinePools.devMachinePool, as("infrastructure-machine-pool")).health).toBe("Healthy");
    expect(healthOf(healthy.devMachine, as("bootstrap-config")).health).toBe("Healthy");
    expect(healthOf(healthy.devCluster, as("ipam-pool"))).toMatchObject({
      health: "Healthy",
      restsOn: { type: "Ready" },
    });
  });

  it("reads a control plane by Available, else by Ready", () => {
    // The DevCluster of healthy read as a control plane of another provider, which writes `Ready` alone, then also an
    // `Available` that is `False`.
    const unavailable = withAddedCondition(healthy.devCluster, condition("Available", "False", "NotAvailable"));

    expect(healthOf(healthy.devCluster, as("control-plane"))).toMatchObject({
      health: "Healthy",
      restsOn: { type: "Ready" },
    });
    expect(healthOf(unavailable, as("control-plane"))).toMatchObject({
      health: "Unhealthy",
      restsOn: { type: "Available" },
    });
    expect(healthOf(noStatus.devCluster, as("control-plane"))).toMatchObject({
      health: "Unknown",
      restsOn: { type: "Available", condition: undefined },
    });
  });

  it("reads a remediation request as Unknown, with the note that no contract names its status", () => {
    const status = statusOf(healthy.devMachine, contextOf({ ...as("remediation-request"), cluster: healthy.cluster }));

    expect(status.health).toEqual({ health: "Unknown", restsOn: { form: "none" }, issues: [] });
    expect(status.notes).toEqual([{ code: "no-contract-status" }]);
  });

  it("gives a template of a provider no health", () => {
    expect(healthOf(healthy.devMachineTemplate, as("template"))).toEqual({ health: "none", because: "no status" });
  });

  it("reads Unknown, with a note, an object whose role the view did not give", () => {
    const status = statusOf(healthy.devCluster, contextOf());

    expect(status.health).toEqual({ health: "Unknown", restsOn: { form: "none" }, issues: [] });
    expect(status.notes).toEqual([{ code: "kind-unknown" }]);
  });

  it("reads Unknown an object of a provider with no status yet", () => {
    expect(healthOf(noStatus.devCluster, as("infrastructure-cluster")).health).toBe("Unknown");
  });
});

describe("the kinds of the group with no status (P16)", () => {
  it.each([
    ["an IPAddress", noStatus.ipAddress],
    ["the Provider of clusterctl", noStatus.provider],
  ])("gives %s no health", (_, object) => {
    expect(statusOf(object, contextOf()).health).toEqual({ health: "none", because: "no status" });
  });
});
