// The marks of freshness (SPEC-0003, "Tests", "Unit", and "Freshness"; P19, P24, P25; SPEC-0001, H1): a pause from
// the condition, from the annotation with the value "false" and from `spec.paused` of the Cluster, for a kind that
// honours both and for each of the three that honour only the annotation; an IPAddressClaim paused by its Cluster;
// a kind of the operator with the annotation; an older generation from the status and from the condition that sums
// an object up, and none judged without either; a controller available, not available and unknown; a workload
// cluster that cannot be reached after the initialization of its control plane, and before it. The objects come
// from the fixtures of SPEC-0002 (test/status-objects.ts); a case that changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  machinePools,
  noStatus,
  paused,
  provisioning,
  remediation,
  rollingOut,
  scalingUp,
  withCondition,
  withMetadata,
  withoutStatus,
  withSpec,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { FreshnessMark, KubeObjectData, Note, StatusContext } from "./index";

function marksOf(object: KubeObjectData, context: StatusContext = contextOf()): readonly FreshnessMark[] {
  return statusOf(object, context).freshness;
}

function causesOf(object: KubeObjectData, context?: StatusContext): string[] {
  return marksOf(object, context).map((mark) => mark.cause);
}

function notesOf(object: KubeObjectData, context: StatusContext = contextOf()): readonly Note[] {
  return statusOf(object, context).notes;
}

const pausedByAnnotation = { "cluster.x-k8s.io/paused": "false" };
// The Cluster of healthy paused by its field, as `clusterctl move` pauses one, with no condition written yet.
const pausedCluster = withSpec(healthy.cluster, { paused: true });

// An ExtensionConfig and an IPAddressClaim with a status, written from the schemas of the release, since the
// fixtures have none: the test environment runs without RuntimeSDK, and with no IPAM provider (SPEC-0002). The claim
// of the fixtures names no Cluster; this one names the Cluster of healthy.
const extensionConfig = {
  apiVersion: "runtime.cluster.x-k8s.io/v1beta2",
  kind: "ExtensionConfig",
  metadata: { name: "test-extension", generation: 2, creationTimestamp: "2025-12-31T23:58:00Z" },
  spec: {},
  status: {
    conditions: [
      {
        type: "Discovered",
        status: "True",
        observedGeneration: 1,
        lastTransitionTime: "2025-12-31T23:58:10Z",
        reason: "Discovered",
        message: "",
      },
    ],
  },
};
const ipAddressClaim = withStatus(
  withMetadata(withSpec(noStatus.ipAddressClaim, { clusterName: "freelens-capi-healthy" }), { generation: 2 }),
  {
    conditions: [
      {
        type: "Ready",
        status: "True",
        observedGeneration: 1,
        lastTransitionTime: "2025-12-31T23:59:58Z",
        reason: "Ready",
        message: "",
      },
    ],
    addressRef: { name: "freelens-capi-no-status" },
  },
);

describe("Paused", () => {
  it("is read from the condition, since its transition", () => {
    expect(marksOf(paused.cluster)).toEqual([
      {
        cause: "Paused",
        since: { state: "accepted", text: "2025-12-31T23:59:45Z", instant: Date.UTC(2025, 11, 31, 23, 59, 45) },
        topologiesHeld: false,
      },
    ]);
    expect(causesOf(paused.workerMachine, contextOf({ cluster: paused.cluster }))).toEqual(["Paused"]);
  });

  it("is read from the annotation by its presence, its value false included, with no time", () => {
    const machine = withMetadata(healthy.workerMachine, { annotations: pausedByAnnotation });

    expect(marksOf(machine, contextOf({ cluster: healthy.cluster }))).toEqual([
      { cause: "Paused", since: undefined, topologiesHeld: false },
    ]);
  });

  it("is read from spec.paused of the Cluster, for a kind that honours both", () => {
    expect(marksOf(healthy.workerMachine, contextOf({ cluster: pausedCluster }))).toEqual([
      { cause: "Paused", since: undefined, topologiesHeld: false },
    ]);
    expect(causesOf(healthy.kubeadmControlPlane, contextOf({ cluster: pausedCluster }))).toEqual(["Paused"]);
    expect(causesOf(pausedCluster)).toEqual(["Paused"]);
  });

  it.each([
    ["a MachineSet", healthy.machineSet, {}],
    ["a MachineDeployment", healthy.machineDeployment, {}],
    ["a MachinePool", machinePools.machinePool, {}],
    ["a MachineHealthCheck", healthy.machineHealthCheck, {}],
    ["a KubeadmConfig", healthy.kubeadmConfig, {}],
    ["an infrastructure cluster", healthy.devCluster, { role: "infrastructure-cluster" }],
    ["an infrastructure machine", healthy.devMachine, { role: "infrastructure-machine" }],
    ["an infrastructure machine pool", machinePools.devMachinePool, { role: "infrastructure-machine-pool" }],
    ["a control plane of a provider", healthy.devCluster, { role: "control-plane" }],
  ] as const)("is read from spec.paused of the Cluster for %s too", (_, object, role) => {
    const context = (cluster: KubeObjectData) =>
      contextOf({ ...role, provider: "infrastructure-docker", cluster: cluster as never });

    expect(causesOf(object as KubeObjectData, context(pausedCluster))).toContain("Paused");
    expect(causesOf(object as KubeObjectData, context(healthy.cluster))).not.toContain("Paused");
  });

  it.each([
    ["a ClusterClass", healthy.clusterClass],
    ["a ClusterResourceSet", healthy.clusterResourceSet],
    ["an ExtensionConfig", withMetadata(extensionConfig, { generation: 1 })],
  ])("is read for %s from its own annotation alone, never from its Cluster", (_, object) => {
    const annotated = withMetadata(object, { annotations: pausedByAnnotation });

    expect(causesOf(annotated, contextOf({ cluster: healthy.cluster }))).toEqual(["Paused"]);
    expect(causesOf(object, contextOf({ cluster: pausedCluster }))).toEqual([]);
  });

  it("follows the ClusterClass and the ClusterResourceSet of a paused Cluster, which report Paused False", () => {
    expect(causesOf(paused.clusterClass, contextOf({ cluster: paused.cluster }))).toEqual([]);
    expect(causesOf(paused.clusterResourceSet, contextOf({ cluster: paused.cluster }))).toEqual([]);
  });

  it("is not requested of an IPAddressClaim that names no Cluster, which needs none, its tone included", () => {
    // The claim above, Unhealthy, so that its tone reads what it takes, with no Cluster named: its
    // `spec.clusterName` unset, then empty.
    const unhealthy = withCondition(ipAddressClaim, "Ready", { status: "False", reason: "PoolExhausted" });

    for (const clusterName of [undefined, ""]) {
      const status = statusOf(
        withSpec(unhealthy, { clusterName }),
        contextOf({ provider: "ipam-test", controllers: {} }),
      );

      expect(status.health.health).toBe("Unhealthy");
      expect(status.freshness.map((mark) => mark.cause)).not.toContain("Paused");
      expect(status.notes).not.toContainEqual({ code: "input-not-given", input: "cluster" });
    }
    expect(notesOf(unhealthy, contextOf({ provider: "ipam-test", controllers: {} }))).toContainEqual({
      code: "input-not-given",
      input: "cluster",
    });
  });

  it("is read for an IPAddressClaim from the annotation of its Cluster, and not from its own", () => {
    const context = (cluster: KubeObjectData) => contextOf({ cluster: cluster as never, provider: "ipam-test" });
    const annotatedCluster = withMetadata(healthy.cluster, { annotations: pausedByAnnotation });
    const annotatedClaim = withMetadata(ipAddressClaim, { annotations: pausedByAnnotation });

    expect(causesOf(ipAddressClaim, context(annotatedCluster))).toContain("Paused");
    expect(causesOf(ipAddressClaim, context(pausedCluster))).toContain("Paused");
    expect(causesOf(annotatedClaim, context(healthy.cluster))).not.toContain("Paused");
  });

  it("pauses a Cluster by its own annotation, and not its objects (SPEC-0001, R4.57)", () => {
    const annotatedCluster = withMetadata(healthy.cluster, { annotations: pausedByAnnotation });

    expect(causesOf(annotatedCluster)).toEqual(["Paused"]);
    expect(causesOf(healthy.workerMachine, contextOf({ cluster: annotatedCluster }))).toEqual([]);
  });

  it("is never read for a kind of the operator from the annotation, which the operator does not read", () => {
    const operator = {
      apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
      kind: "InfrastructureProvider",
      metadata: { name: "docker", namespace: "capd-system", annotations: pausedByAnnotation },
      spec: { version: "v1.14.4" },
      status: { conditions: [], installedVersion: "v1.14.4" },
    };

    expect(causesOf(operator, contextOf({ cluster: pausedCluster }))).toEqual([]);
  });

  it("is read for the bootstrap config of a provider as for an infrastructure machine", () => {
    // The fixtures have no bootstrap provider other than kubeadm: the DevMachine of healthy read with that role.
    const context = (cluster: KubeObjectData) =>
      contextOf({ role: "bootstrap-config", provider: "infrastructure-docker", cluster: cluster as never });

    expect(causesOf(healthy.devMachine, context(pausedCluster))).toEqual(["Paused"]);
    expect(causesOf(healthy.devMachine, context(healthy.cluster))).toEqual([]);
  });

  it("is read for a remediation request from its condition alone", () => {
    const context = contextOf({
      role: "remediation-request",
      provider: "infrastructure-docker",
      cluster: pausedCluster,
    });

    expect(causesOf(healthy.devMachine, context)).toEqual([]);
    expect(
      causesOf(paused.devCluster, contextOf({ role: "remediation-request", provider: "infrastructure-docker" })),
    ).toEqual(["Paused"]);
  });

  it("notes annotations and a spec.paused of the wrong type, and marks no pause on no evidence", () => {
    const annotated = withMetadata(healthy.workerMachine, { annotations: "cluster.x-k8s.io/paused" });
    const oddCluster = withSpec(healthy.cluster, { paused: "yes" });

    expect(causesOf(annotated, contextOf({ cluster: healthy.cluster }))).toEqual([]);
    expect(notesOf(annotated, contextOf({ cluster: healthy.cluster }))).toEqual([
      { code: "field-unreadable", field: "metadata.annotations" },
    ]);
    expect(causesOf(healthy.workerMachine, contextOf({ cluster: oddCluster }))).toEqual([]);
    expect(notesOf(healthy.workerMachine, contextOf({ cluster: oddCluster }))).toEqual([
      { code: "field-unreadable", field: "cluster.spec.paused" },
    ]);
  });

  it("notes a Cluster that the view did not give, when nothing else says the object is paused", () => {
    // The KubeadmConfig of healthy, whose conditions do not follow the workload cluster, paused: its `Paused`
    // changed to `True`.
    const pausedConfig = withCondition(healthy.kubeadmConfig, "Paused", { status: "True", reason: "Paused" });

    expect(notesOf(healthy.kubeadmConfig, contextOf())).toEqual([{ code: "input-not-given", input: "cluster" }]);
    expect(notesOf(pausedConfig, contextOf())).toEqual([]);
  });
});

describe("Older generation", () => {
  it("is read from the status, with no time", () => {
    // The Machine of provisioning is at generation 2, and its status observed generation 1.
    expect(marksOf(provisioning.controlPlaneMachine, contextOf({ cluster: provisioning.cluster }))).toEqual([
      { cause: "Older generation", generation: 2, observedGeneration: 1, topologiesHeld: false },
    ]);
    expect(causesOf(healthy.workerMachine, contextOf({ cluster: healthy.cluster }))).toEqual([]);
  });

  it("is read from the condition that sums up an ExtensionConfig and an IPAddressClaim", () => {
    expect(marksOf(extensionConfig)).toEqual([
      { cause: "Older generation", generation: 2, observedGeneration: 1, topologiesHeld: false },
    ]);
    expect(marksOf(ipAddressClaim, contextOf({ cluster: healthy.cluster, provider: "ipam-test" }))).toEqual([
      { cause: "Older generation", generation: 2, observedGeneration: 1, topologiesHeld: false },
    ]);
  });

  it("is not judged without the generation of the status or of the summary", () => {
    const noObserved = withStatus(provisioning.controlPlaneMachine, { observedGeneration: undefined });
    const noCondition = withStatus(extensionConfig, { conditions: [] });

    expect(causesOf(noObserved, contextOf({ cluster: provisioning.cluster }))).toEqual([]);
    expect(causesOf(noCondition)).toEqual([]);
    expect(causesOf(withMetadata(provisioning.controlPlaneMachine, { generation: undefined }))).not.toContain(
      "Older generation",
    );
  });

  it("is read for an object of a provider from its status, else from the condition that sums it up", () => {
    const context = contextOf({
      role: "infrastructure-machine",
      provider: "infrastructure-docker",
      cluster: healthy.cluster,
    });
    // The DevMachine of healthy keeps no status.observedGeneration and its `Ready` is at its generation, 2.
    const olderReady = withCondition(healthy.devMachine, "Ready", { observedGeneration: 1 });

    expect(causesOf(healthy.devMachine, context)).toEqual([]);
    expect(causesOf(olderReady, context)).toEqual(["Older generation"]);
    expect(causesOf(withStatus(olderReady, { observedGeneration: 2 }), context)).toEqual([]);
  });

  it("says, for a ClusterClass, that the topology of its Clusters is held (P8)", () => {
    const changed = withMetadata(healthy.clusterClass, { generation: 2 });

    expect(marksOf(changed)).toEqual([
      { cause: "Older generation", generation: 2, observedGeneration: 1, topologiesHeld: true },
    ]);
    expect(statusOf(changed, contextOf()).health.health).toBe("Healthy");
  });

  it("is not marked while the object is paused: the pause is its own cause", () => {
    // The Cluster of paused is at generation 2 and observed 1, since its controller stopped at the pause.
    expect(causesOf(paused.cluster)).toEqual(["Paused"]);
    expect(causesOf(withSpec(paused.cluster, { paused: false }))).toEqual(["Paused"]);
    // Once resumed, before its controller observes the generation again: `spec.paused` and `Paused` changed.
    const resumed = withCondition(withSpec(paused.cluster, { paused: false }), "Paused", {
      status: "False",
      reason: "NotPaused",
    });

    expect(causesOf(resumed)).toEqual(["Older generation"]);
  });

  it("is not read while the object is paused, so a generation of the wrong type is not noted then", () => {
    // The Machine of healthy with its `status.observedGeneration` of the wrong type, paused by its Cluster.
    const odd = withStatus(healthy.workerMachine, { observedGeneration: "2" });
    const note = { code: "field-unreadable", field: "status.observedGeneration" };

    expect(notesOf(odd, contextOf({ cluster: pausedCluster }))).not.toContainEqual(note);
    expect(notesOf(odd, contextOf({ cluster: healthy.cluster }))).toContainEqual(note);
  });
});

describe("Controller not available (P24)", () => {
  const context = (controllers: StatusContext["controllers"]) => contextOf({ cluster: healthy.cluster, controllers });

  it("marks nothing and notes nothing when the controller is available", () => {
    expect(marksOf(healthy.workerMachine, context({ "cluster-api": { available: true } }))).toEqual([]);
    expect(notesOf(healthy.workerMachine, context({ "cluster-api": { available: true } }))).toEqual([]);
  });

  it("marks a controller that is not available, since its last change", () => {
    const controllers = { "cluster-api": { available: false, since: "2025-12-31T23:59:30Z" } };

    expect(marksOf(healthy.workerMachine, context(controllers))).toEqual([
      {
        cause: "Controller not available",
        provider: "cluster-api",
        since: { state: "accepted", text: "2025-12-31T23:59:30Z", instant: Date.UTC(2025, 11, 31, 23, 59, 30) },
      },
    ]);
  });

  it("notes a controller whose availability is unknown or not given, and marks nothing", () => {
    expect(marksOf(healthy.workerMachine, context({ "cluster-api": { available: "unknown" } }))).toEqual([]);
    expect(notesOf(healthy.workerMachine, context({ "cluster-api": { available: "unknown" } }))).toEqual([
      { code: "controller-unknown", provider: "cluster-api" },
    ]);
    expect(notesOf(healthy.workerMachine, context({}))).toEqual([
      { code: "controller-unknown", provider: "cluster-api" },
    ]);
    expect(notesOf(healthy.workerMachine, context(undefined))).toEqual([
      { code: "input-not-given", input: "controllers" },
    ]);
  });

  it.each([
    ["a Cluster", "cluster-api", healthy.cluster],
    ["a ClusterClass", "cluster-api", healthy.clusterClass],
    ["a MachineDeployment", "cluster-api", healthy.machineDeployment],
    ["a MachineHealthCheck", "cluster-api", healthy.machineHealthCheck],
    ["a ClusterResourceSet", "cluster-api", healthy.clusterResourceSet],
    ["a KubeadmControlPlane", "control-plane-kubeadm", healthy.kubeadmControlPlane],
    ["a KubeadmConfig", "bootstrap-kubeadm", healthy.kubeadmConfig],
  ])("reads %s as served by the provider %s", (_, provider, object) => {
    expect(causesOf(object, context({ [provider]: { available: false } }))).toContain("Controller not available");
  });

  it("reads an object of a provider and an IPAddressClaim as served by the provider the view gives", () => {
    const controllers = { "infrastructure-docker": { available: false }, "ipam-test": { available: false } };

    expect(
      causesOf(
        healthy.devCluster,
        contextOf({ role: "infrastructure-cluster", provider: "infrastructure-docker", controllers }),
      ),
    ).toEqual(["Controller not available"]);
    expect(
      causesOf(ipAddressClaim, contextOf({ cluster: healthy.cluster, provider: "ipam-test", controllers })),
    ).toContain("Controller not available");
    expect(notesOf(healthy.devCluster, contextOf({ role: "infrastructure-cluster" }))).toContainEqual({
      code: "input-not-given",
      input: "provider",
    });
  });

  it("reads no provider for a kind of the operator, and notes nothing", () => {
    const operator = {
      apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
      kind: "CoreProvider",
      metadata: { name: "cluster-api", namespace: "capi-system" },
      spec: { version: "v1.14.4" },
      status: { conditions: [], installedVersion: "v1.14.4" },
    };

    expect(statusOf(operator, context({})).notes).toEqual([]);
  });
});

describe("Workload cluster unreachable (P25)", () => {
  // The Cluster of healthy with its probe changed to `False`, after its control plane was initialized.
  const unreachable = withCondition(healthy.cluster, "RemoteConnectionProbe", {
    status: "False",
    reason: "ProbeFailed",
    lastTransitionTime: "2025-12-31T23:59:50Z",
  });
  const context = contextOf({ cluster: unreachable });

  it.each([
    ["a Machine", healthy.workerMachine],
    ["a MachineSet", healthy.machineSet],
    ["a MachineDeployment", healthy.machineDeployment],
    ["a MachinePool", machinePools.machinePool],
    ["the control plane", healthy.kubeadmControlPlane],
    ["a MachineHealthCheck", healthy.machineHealthCheck],
  ])("marks %s of the Cluster, since the probe turned False", (_, object) => {
    expect(marksOf(object, context)).toEqual([
      {
        cause: "Workload cluster unreachable",
        since: { state: "accepted", text: "2025-12-31T23:59:50Z", instant: Date.UTC(2025, 11, 31, 23, 59, 50) },
      },
    ]);
  });

  it("marks a control plane of a provider, and no other object of a provider", () => {
    const provider = { provider: "infrastructure-docker", cluster: unreachable };

    expect(causesOf(scalingUp.kubeadmControlPlane, contextOf(provider))).toEqual(["Workload cluster unreachable"]);
    expect(causesOf(healthy.devCluster, contextOf({ ...provider, role: "control-plane" }))).toEqual([
      "Workload cluster unreachable",
    ]);
    expect(causesOf(healthy.devMachine, contextOf({ ...provider, role: "infrastructure-machine" }))).toEqual([]);
  });

  it("does not mark the Cluster itself, nor a kind whose conditions do not follow the workload cluster", () => {
    expect(causesOf(unreachable)).toEqual([]);
    expect(causesOf(healthy.kubeadmConfig, context)).toEqual([]);
    expect(causesOf(healthy.clusterResourceSet, context)).toEqual([]);
  });

  it("marks nothing while the probe is False before the control plane is initialized", () => {
    // The Cluster of provisioning, whose probe has been False since its creation.
    expect(causesOf(provisioning.kubeadmControlPlane, contextOf({ cluster: provisioning.cluster }))).toEqual([]);
    expect(causesOf(provisioning.workerMachine, contextOf({ cluster: provisioning.cluster }))).toEqual([]);
  });

  it("marks nothing for a Cluster whose probe is True, and notes a Cluster that the view did not give", () => {
    expect(causesOf(rollingOut.newMachine, contextOf({ cluster: rollingOut.cluster }))).toEqual([]);
    expect(notesOf(remediation.deferredMachine, contextOf())).toContainEqual({
      code: "input-not-given",
      input: "cluster",
    });
  });
});

describe("a kind with no status, and an object with no status yet", () => {
  it("marks nothing for a kind with no status", () => {
    expect(marksOf(healthy.binding, contextOf({ cluster: pausedCluster, controllers: {} }))).toEqual([]);
    expect(notesOf(healthy.binding, contextOf({ controllers: {} }))).toEqual([]);
  });

  it("marks nothing for a template of a provider, whatever its fields say (P16)", () => {
    // The DevMachineTemplate of healthy at generation 2, with a status that says 1, annotated as paused.
    const template = withStatus(
      withMetadata(healthy.devMachineTemplate, { generation: 2, annotations: pausedByAnnotation }),
      { observedGeneration: 1 },
    );
    const status = statusOf(template, contextOf({ role: "template", provider: "infrastructure-docker" }));

    expect(status.health).toEqual({ health: "none", because: "no status" });
    expect(status.freshness).toEqual([]);
  });

  it("marks the pause of an object with no status yet that is requested", () => {
    expect(causesOf(withoutStatus(healthy.workerMachine), contextOf({ cluster: pausedCluster }))).toEqual(["Paused"]);
  });
});
