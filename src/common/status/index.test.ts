// The two entry points of the status model (SPEC-0003, "Tests", "Unit", and "What it takes and returns"): the
// condition that sums up each kind is the one that `clusterctl describe` shows for it, `Available` on a Cluster, a
// MachineDeployment and a control plane, else `Ready`, and `Ready` on a Machine and on the other objects of a
// provider, while neither a MachineSet nor a MachinePool has one there (SPEC-0001, R4.22, R4.33); an object of a kind
// the model does not know is Unknown with a note; and the shape of the result, with its activities, the tone of its
// health and the earliest time at which it would change. The objects come from the fixtures of SPEC-0002
// (test/status-objects.ts).

import { describe, expect, it } from "vitest";
import {
  CAPTURE,
  contextOf,
  healthy,
  machinePools,
  noStatus,
  provisioning,
  rollingOut,
} from "../../../test/status-objects";
import { conditionsOf, statusOf } from "./index";

import type { KubeObjectData, StatusContext } from "./index";

function restsOnOf(object: KubeObjectData, context: Partial<StatusContext> = {}) {
  const { health } = statusOf(object, contextOf(context));

  return health.health === "none" ? undefined : health.restsOn;
}

describe("the condition that sums up each kind, as clusterctl describe shows it", () => {
  const provider = { provider: "infrastructure-docker" };

  it.each([
    ["a Cluster", "Available", healthy.cluster, {}],
    ["a MachineDeployment", "Available", healthy.machineDeployment, {}],
    ["a KubeadmControlPlane", "Available", healthy.kubeadmControlPlane, {}],
    ["a Machine", "Ready", healthy.workerMachine, {}],
    ["an infrastructure cluster", "Ready", healthy.devCluster, { ...provider, role: "infrastructure-cluster" }],
    ["an infrastructure machine", "Ready", healthy.devMachine, { ...provider, role: "infrastructure-machine" }],
  ] as const)("is %s's %s", (_, type, object, context) => {
    expect(restsOnOf(object, context)).toMatchObject({ form: "condition", type });
  });

  it("is Available, else Ready, on a control plane of a provider", () => {
    // The KubeadmControlPlane of healthy read as a control plane of another provider, which writes `Available`.
    const context = { provider: "control-plane-test", role: "control-plane" } as const;
    const other = {
      ...healthy.kubeadmControlPlane,
      apiVersion: "controlplane.test.example/v1beta2",
      kind: "TestControlPlane",
    };

    expect(restsOnOf(other, context)).toMatchObject({ form: "condition", type: "Available" });
    expect(restsOnOf(healthy.devCluster, context)).toMatchObject({ form: "condition", type: "Ready" });
  });

  it("is none on a MachineSet and a MachinePool, whose counters stand for one", () => {
    expect(restsOnOf(healthy.machineSet)).toEqual({ form: "replicas", available: 2, replicas: 2 });
    expect(restsOnOf(machinePools.machinePool, { machines: [machinePools.poolMachine] })).toEqual({
      form: "replicas",
      available: 0,
      replicas: 1,
    });
  });
});

describe("an object of a kind the model does not know", () => {
  it("is Unknown, with an activity Unknown and a note, and no mark, phase or remediation", () => {
    const configMap = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "cni-kindnet", namespace: "freelens-capi-healthy", generation: 3 },
      status: { observedGeneration: 1, conditions: [] },
    };

    expect(statusOf(configMap, contextOf())).toEqual({
      object: { apiVersion: "v1", kind: "ConfigMap", name: "cni-kindnet", namespace: "freelens-capi-healthy" },
      health: { health: "Unknown", restsOn: { form: "none" }, issues: [] },
      tone: { state: "read", tone: "health", setBy: undefined, changesAt: undefined, notes: [] },
      activities: { state: "read", activities: [], idle: false, unknown: true, changesAt: undefined, notes: [] },
      freshness: [],
      phase: undefined,
      remediation: undefined,
      notes: [{ code: "kind-unknown" }],
      changesAt: undefined,
    });
  });

  it("is a kind of Cluster API at a version that A2 does not name", () => {
    const v1beta1 = { ...healthy.cluster, apiVersion: "cluster.x-k8s.io/v1beta1" };

    expect(statusOf(v1beta1, contextOf()).notes).toEqual([{ code: "kind-unknown" }]);
  });

  it("lists its conditions, as those of an object of a provider", () => {
    const result = conditionsOf({ ...healthy.devCluster, kind: "UnknownKind" }, contextOf());

    expect(result.state === "read" && result.conditions.map((condition) => condition.type)).toEqual([
      "Ready",
      "LoadBalancerAvailable",
      "Paused",
    ]);
  });
});

describe("the result", () => {
  it("names the object it describes, and carries every part of the status", () => {
    // The fixtures of rolling-out have no MachineHealthCheck. Every threshold of the MachineDeployment ends with the
    // 30 minutes of its Cluster, created at 23:58:20.
    const passesAt = Date.UTC(2026, 0, 1, 0, 28, 20);
    const status = statusOf(
      rollingOut.machineDeployment,
      contextOf({
        cluster: rollingOut.cluster,
        machines: [rollingOut.oldMachine, rollingOut.newMachine],
        healthChecks: [],
      }),
    );

    expect(status).toEqual({
      object: {
        apiVersion: "cluster.x-k8s.io/v1beta2",
        kind: "MachineDeployment",
        name: "freelens-capi-rolling-out-md-0-t96dp",
        namespace: "freelens-capi-rolling-out",
      },
      health: expect.objectContaining({ health: "Degraded" }),
      tone: expect.objectContaining({ state: "read", tone: "progress", changesAt: passesAt, notes: [] }),
      activities: expect.objectContaining({
        state: "read",
        idle: false,
        unknown: false,
        changesAt: passesAt,
        notes: [],
      }),
      freshness: [],
      phase: { phase: "ScalingDown", written: "ScalingDown", deprecated: false },
      remediation: undefined,
      notes: [],
      changesAt: passesAt,
    });
    expect(status.activities.state === "read" && status.activities.activities.map(({ name }) => name)).toEqual([
      "Provisioning",
      "Rolling out",
      "Scaling down",
    ]);
  });

  it("notes each input once, though several rules need it", () => {
    // The Machine of provisioning needs its Cluster for its pause, its probe, the floor of its threshold and the first
    // provisioning that it takes for its tone; the MachineHealthChecks of its namespace are given.
    expect(
      statusOf(provisioning.workerMachine, contextOf({ healthChecks: [provisioning.machineHealthCheck] })).notes,
    ).toEqual([{ code: "input-not-given", input: "cluster" }]);
  });

  it("changes with the passing of time only at the instant it names", () => {
    const at = (now: number) =>
      statusOf(
        provisioning.kubeadmControlPlane,
        contextOf({
          now,
          cluster: provisioning.cluster,
          machines: [provisioning.controlPlaneMachine],
          healthChecks: [],
        }),
      );
    const first = at(CAPTURE);
    // The 30 minutes of the first provisioning of the Cluster, created at 23:59:34.
    const changesAt = Date.UTC(2026, 0, 1, 0, 29, 34);

    expect(first.changesAt).toBe(changesAt);
    expect(at(changesAt - 1)).toEqual(first);
    expect(at(changesAt)).not.toEqual(first);
    expect(at(changesAt).tone.tone).toBe("warning");
  });

  it("notes the ClusterClass that the view did not give only in the list of the conditions", () => {
    expect(statusOf(healthy.cluster, contextOf({ machinePools: [], parts: { machineDeployments: [] } })).notes).toEqual(
      [],
    );
    expect(conditionsOf(healthy.cluster, contextOf()).notes).toEqual([
      { code: "input-not-given", input: "clusterClass" },
    ]);
  });

  it("gives a kind with no status no condition, no mark and no note", () => {
    expect(statusOf(noStatus.binding, contextOf({ controllers: undefined }))).toMatchObject({
      health: { health: "none", because: "no status" },
      freshness: [],
      notes: [],
    });
    expect(conditionsOf(noStatus.binding, contextOf())).toEqual({ state: "read", conditions: [], notes: [] });
  });

  it("never throws, whatever the object", () => {
    for (const object of [
      undefined,
      null,
      7,
      "Cluster",
      [],
      {},
      { kind: "Cluster", apiVersion: "cluster.x-k8s.io/v1beta2" },
    ]) {
      const status = statusOf(object as unknown as KubeObjectData, contextOf());

      expect(status.health.health).toBe("Unknown");
      expect(conditionsOf(object as unknown as KubeObjectData, contextOf()).state).toBeDefined();
    }
  });

  it("reads a context built wrong as one that gives less, and does not throw", () => {
    const wrong = {
      now: CAPTURE,
      cluster: "freelens-capi-healthy",
      machines: [null, machinePools.poolMachine],
      bindings: [{ binding: null }],
      controllers: ["cluster-api"],
    };

    expect(statusOf(healthy.workerMachine, wrong as never).notes).toEqual([
      { code: "input-not-given", input: "cluster" },
      { code: "input-not-given", input: "controllers" },
    ]);
    expect(statusOf(machinePools.machinePool, wrong as never).health.health).toBe("Unhealthy");
    expect(statusOf(healthy.clusterResourceSet, wrong as never).health).toMatchObject({
      health: "Healthy",
      restsOn: { clusters: [] },
    });
    expect(statusOf(healthy.workerMachine, undefined as never).health.health).toBe("Healthy");
  });

  it("reads a Cluster with no metadata as an object with no name", () => {
    const status = statusOf({ ...healthy.cluster, metadata: undefined } as never, contextOf());

    expect(status.object.name).toBeUndefined();
    expect(status.health.health).toBe("Healthy");
  });
});
