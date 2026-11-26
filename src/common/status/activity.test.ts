// The activities of an object (SPEC-0003, "Tests", "Unit", and "Activity"; SPEC-0001, H2): each activity of the
// closed set from each of its sources, and Idle; several at once, in the order of H2; Rollout paused in place of
// Rolling out; the note of P4; the Provisioning of a Machine in each phase and of an owner, a Cluster and a
// MachinePool (D3, P17); Replacing (D3); the activities of a control plane of a provider (P1); Unknown and never
// Idle (P1, P28); the Upgrading of a control plane (P28); each case of Blocked (D4, P14, P18, P21, P33); the scale of
// a MachinePool (P20); and the duration of each activity (P34). The objects come from the fixtures of SPEC-0002
// (test/status-objects.ts); a case that changes one says what it changes, and the kinds that the fixtures do not
// have, the operator and a control plane of a provider, are written from their schemas.

import { describe, expect, it } from "vitest";
import {
  CAPTURE,
  contextOf,
  deleting,
  healthy,
  machinePools,
  noStatus,
  paused,
  poolWithoutMachines,
  provisioning,
  remediation,
  rollingOut,
  scalingDown,
  scalingUp,
  scalingUpHeld,
  upgrading,
  withCondition,
  withMetadata,
  withoutCondition,
  withoutNode,
  withoutStatus,
  withoutTopology,
  withSpec,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type {
  Activities,
  Activity,
  ActivityName,
  KubeObjectData,
  ObjectStatus,
  ProviderRole,
  StatusContext,
} from "./index";

type Read = Extract<Activities, { state: "read" }>;

function activitiesOf(object: KubeObjectData, context: Partial<StatusContext> = {}): Read {
  const { activities } = statusOf(object, contextOf(context));

  if (activities.state !== "read") throw new Error("the activities were not read");
  return activities;
}

function namesOf(object: KubeObjectData, context: Partial<StatusContext> = {}): ActivityName[] {
  return activitiesOf(object, context).activities.map(({ name }) => name);
}

function activityOf(object: KubeObjectData, name: ActivityName, context: Partial<StatusContext> = {}): Activity {
  const found = activitiesOf(object, context).activities.find((activity) => activity.name === name);

  if (found === undefined) throw new Error(`no activity ${name}`);
  return found;
}

function instant(text: string): number {
  return Date.parse(text);
}

function since(text: string) {
  return { state: "accepted", text, instant: instant(text) };
}

// A condition as the controllers write it, at the generation of the object.
function condition(type: string, status: string, reason: string, lastTransitionTime: string, message = "") {
  return { type, status, reason, message, lastTransitionTime, observedGeneration: 1 };
}

// The inputs of each group of the fixtures, given whole, so that a case notes nothing that it does not test. The
// fixtures have a MachineHealthCheck of the workers in healthy, provisioning and remediation only.
const ofHealthy = {
  cluster: healthy.cluster,
  healthChecks: [healthy.machineHealthCheck],
  machinePools: [],
  parts: { machineDeployments: [] },
};
const ofProvisioning = { cluster: provisioning.cluster, healthChecks: [provisioning.machineHealthCheck] };
const ofRollingOut = { cluster: rollingOut.cluster, healthChecks: [] };
const ofScalingDown = { cluster: scalingDown.cluster, healthChecks: [] };
const ofRemediation = { cluster: remediation.cluster, healthChecks: [remediation.machineHealthCheck] };

// The second worker of healthy, which the MachineHealthCheck of healthy names in its targets: a copy of the first
// worker with that name.
const secondWorker = withMetadata(healthy.workerMachine, { name: "freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9" });

// The MachineDeployment of rolling-out as the view gives it to its Cluster.
function rollingOutPart(deployment: KubeObjectData = rollingOut.machineDeployment): ObjectStatus {
  return statusOf(deployment, contextOf({ ...ofRollingOut, machines: [rollingOut.oldMachine, rollingOut.newMachine] }));
}

// A control plane of a provider other than kubeadm, written from the contract of the book
// (docs/book/src/developer/providers/contracts/control-plane.md) on the shape of the KubeadmControlPlane of healthy.
const providerControlPlane = {
  ...healthy.kubeadmControlPlane,
  apiVersion: "controlplane.test.example/v1beta2",
  kind: "TestControlPlane",
};
const asControlPlane = {
  role: "control-plane",
  provider: "control-plane-test",
  contract: "v1beta2",
  cluster: healthy.cluster,
} as const;

// A kind of the operator, written from its schema (cluster-api-operator:config/crd/bases), since the test
// environment installs with clusterctl and has none.
function operator(conditions: Record<string, unknown>[], installedVersion?: string, version = "v1.14.4") {
  return {
    apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
    kind: "BootstrapProvider",
    metadata: {
      name: "kubeadm",
      namespace: "capi-kubeadm-bootstrap-system",
      creationTimestamp: "2025-12-31T23:58:00Z",
    },
    spec: { version },
    status: { conditions, installedVersion, observedGeneration: 1 },
  };
}

describe("each activity from each of its sources", () => {
  describe("Deleting", () => {
    it("holds from the deletion timestamp, with the stage of Deleting and the 15 minutes of a deletion", () => {
      expect(activitiesOf(deleting.cluster)).toEqual({
        state: "read",
        activities: [
          {
            name: "Deleting",
            state: "Progressing",
            since: since("2025-12-31T23:59:47Z"),
            threshold: { seconds: 900, passesAt: instant("2025-12-31T23:59:47Z") + 900_000 },
            tone: "terminated",
            condition: expect.objectContaining({ type: "Deleting", reason: "WaitingForWorkersDeletion" }),
            source: undefined,
          },
        ],
        idle: false,
        unknown: false,
        changesAt: instant("2025-12-31T23:59:47Z") + 900_000,
        notes: [],
      });
    });

    it.each([
      ["a MachineDeployment", deleting.machineDeployment, "Deleting"],
      ["a Machine", scalingDown.deletingMachine, "WaitingForPreDrainHook"],
      [
        "a KubeadmControlPlane",
        // The control plane of healthy deleting: a deletion timestamp, and its `Deleting` at that stage.
        withCondition(
          withMetadata(healthy.kubeadmControlPlane, { deletionTimestamp: "2025-12-31T23:59:50Z" }),
          "Deleting",
          {
            status: "True",
            reason: "WaitingForMachineDeletion",
          },
        ),
        "WaitingForMachineDeletion",
      ],
    ])("reads the stage of %s, and nothing else while it deletes (D3)", (_, object, reason) => {
      const read = activitiesOf(object as KubeObjectData);

      expect(read.activities).toEqual([
        expect.objectContaining({
          name: "Deleting",
          state: "Progressing",
          condition: expect.objectContaining({ reason }),
        }),
      ]);
      expect(read).toMatchObject({ idle: false, unknown: false, notes: [] });
    });

    it("holds for a kind with no status, which shows no other activity, neither Idle nor Unknown (P16)", () => {
      const binding = withMetadata(noStatus.binding, { deletionTimestamp: "2025-12-31T23:59:59Z" });

      expect(activitiesOf(binding)).toMatchObject({
        activities: [{ name: "Deleting", state: "Progressing", condition: undefined }],
        idle: false,
        unknown: false,
      });
      expect(statusOf(noStatus.binding, contextOf()).activities).toEqual({ state: "none" });
    });

    it("reads Unknown a stage outside the set, InternalError, and a Deleting that is Unknown", () => {
      // The Cluster of deleting with its `Deleting` changed.
      for (const changes of [{ reason: "WaitingForSomething" }, { reason: "InternalError" }, { status: "Unknown" }]) {
        expect(activityOf(withCondition(deleting.cluster, "Deleting", changes), "Deleting")).toMatchObject({
          state: "Unknown",
          threshold: undefined,
          tone: "vague",
        });
      }
    });

    it("reads Progressing, with no stage, a Deleting that is still False, written before the deletion", () => {
      const early = withCondition(deleting.cluster, "Deleting", { status: "False", reason: "NotDeleting" });

      expect(activityOf(early, "Deleting")).toMatchObject({ state: "Progressing", condition: undefined });
    });

    it("turns to the tone of a warning past its 15 minutes", () => {
      const passesAt = instant("2025-12-31T23:59:47Z") + 900_000;

      expect(activityOf(deleting.cluster, "Deleting", { now: passesAt - 1 }).tone).toBe("terminated");
      expect(activityOf(deleting.cluster, "Deleting", { now: passesAt }).tone).toBe("warning");
    });
  });

  describe("Paused", () => {
    it("holds from the Paused condition, since its transition, with no threshold", () => {
      expect(activityOf(paused.cluster, "Paused", ofHealthy)).toEqual({
        name: "Paused",
        state: "Progressing",
        since: since("2025-12-31T23:59:45Z"),
        threshold: undefined,
        tone: "terminated",
        condition: expect.objectContaining({ type: "Paused", status: "True" }),
        source: undefined,
      });
    });

    it("holds from the request, with no time", () => {
      // The Cluster of healthy paused by its field, before its controllers write `Paused`.
      const cluster = withSpec(healthy.cluster, { paused: true });

      expect(activityOf(healthy.workerMachine, "Paused", { ...ofHealthy, cluster })).toMatchObject({
        since: undefined,
        condition: undefined,
        tone: "terminated",
      });
    });

    it("reads the state Unknown for a reason of Paused that the release does not define", () => {
      const odd = withCondition(paused.cluster, "Paused", { reason: "PausedByUser" });

      expect(activityOf(odd, "Paused", ofHealthy)).toMatchObject({ state: "Unknown", tone: "vague" });
    });

    it("reads Unknown a Paused condition that is Unknown", () => {
      const unsure = withCondition(healthy.workerMachine, "Paused", { status: "Unknown", reason: "PausedUnknown" });

      expect(activitiesOf(unsure, ofHealthy)).toMatchObject({ activities: [], idle: false, unknown: true });
    });
  });

  it("reads Rollout paused in place of Rolling out, with no time", () => {
    // The MachineDeployment of rolling-out with its rollout held by `spec.paused`.
    const held = withSpec(rollingOut.machineDeployment, { paused: true });
    const context = { ...ofRollingOut, machines: [rollingOut.oldMachine, rollingOut.newMachine] };

    expect(namesOf(held, context)).toEqual(["Rollout paused", "Provisioning", "Scaling down"]);
    expect(activityOf(held, "Rollout paused", context)).toEqual({
      name: "Rollout paused",
      state: "Progressing",
      since: undefined,
      threshold: undefined,
      tone: "terminated",
      condition: expect.objectContaining({ type: "RollingOut", status: "True" }),
      source: undefined,
    });
  });

  describe("Provisioning", () => {
    it("holds for a Cluster until its control plane is initialized, since its creation, with its 30 minutes", () => {
      expect(
        activityOf(provisioning.cluster, "Provisioning", { machinePools: [], parts: { machineDeployments: [] } }),
      ).toEqual({
        name: "Provisioning",
        state: "Progressing",
        since: since("2025-12-31T23:59:34Z"),
        threshold: { seconds: 1800, passesAt: instant("2025-12-31T23:59:34Z") + 1_800_000 },
        tone: "progress",
        condition: expect.objectContaining({ type: "ControlPlaneInitialized", status: "False" }),
        source: undefined,
      });
    });

    it("holds for a Cluster again through a part that is Provisioning, with its start and its threshold", () => {
      const part = rollingOutPart();
      const provisioningPart = (part.activities as Read).activities.find(({ name }) => name === "Provisioning");

      expect(
        activityOf(rollingOut.cluster, "Provisioning", { machinePools: [], parts: { machineDeployments: [part] } }),
      ).toEqual({
        name: "Provisioning",
        state: "Progressing",
        since: since("2025-12-31T23:59:40Z"),
        threshold: provisioningPart?.threshold,
        tone: "progress",
        condition: undefined,
        source: part.object,
      });
      expect(namesOf(rollingOut.cluster, { machinePools: [], parts: { machineDeployments: [] } })).not.toContain(
        "Provisioning",
      );
    });

    it("holds for a Cluster through a MachinePool, which is a part of it (D3)", () => {
      const pool = statusOf(
        machinePools.machinePool,
        contextOf({ cluster: machinePools.cluster, machines: [machinePools.poolMachine], healthChecks: [] }),
      );

      expect(
        activityOf(machinePools.cluster, "Provisioning", { machinePools: [pool], parts: { machineDeployments: [] } }),
      ).toMatchObject({ since: since("2025-12-31T23:59:47Z"), source: { kind: "MachinePool" } });
    });

    it("is Blocked for a paused Cluster through a part (P33)", () => {
      // The Cluster of rolling-out paused: its `Paused` changed to `True`.
      const pausedCluster = withCondition(rollingOut.cluster, "Paused", { status: "True", reason: "Paused" });
      const context = { machinePools: [], parts: { machineDeployments: [rollingOutPart()] }, machines: [] };

      expect(activityOf(pausedCluster, "Provisioning", context)).toMatchObject({ state: "Blocked", tone: "warning" });
    });

    it("is Blocked for an owner whose Machines that provision are all paused", () => {
      // The Machine of without-node paused by its own annotation, which its MachineSet does not carry.
      const pausedMachine = withMetadata(withoutNode.machine, { annotations: { "cluster.x-k8s.io/paused": "" } });

      expect(
        activityOf(withoutNode.machineSet, "Provisioning", { machines: [pausedMachine], healthChecks: [] }),
      ).toMatchObject({ state: "Blocked", threshold: undefined });
    });

    it("holds for an owner and for a Cluster since the oldest Machine or part whose Provisioning is not Blocked", () => {
      // The Machine of without-node paused by its own annotation, and a copy of it two minutes younger that is not:
      // its name and its creation changed.
      const pausedMachine = withMetadata(withoutNode.machine, { annotations: { "cluster.x-k8s.io/paused": "" } });
      const younger = withMetadata(withoutNode.machine, {
        name: "freelens-capi-without-node-without-node-r2xk7",
        creationTimestamp: "2026-01-01T00:01:41Z",
      });
      const owner = withSpec(withoutNode.machineSet, { replicas: 2 });

      expect(activityOf(owner, "Provisioning", { machines: [pausedMachine, younger], healthChecks: [] })).toMatchObject(
        { state: "Progressing", since: since("2026-01-01T00:01:41Z"), source: { name: younger.metadata.name } },
      );

      // The KubeadmControlPlane of provisioning paused by its own annotation, whose Machine was created at 23:59:40,
      // and the MachinePool of machine-pools, whose Machine was created at 23:59:47, given as the parts of the
      // Cluster of machine-pools.
      const pausedPlane = statusOf(
        withMetadata(provisioning.kubeadmControlPlane, { annotations: { "cluster.x-k8s.io/paused": "" } }),
        contextOf({ ...ofProvisioning, machines: [provisioning.controlPlaneMachine] }),
      );
      const pool = statusOf(
        machinePools.machinePool,
        contextOf({ cluster: machinePools.cluster, machines: [machinePools.poolMachine], healthChecks: [] }),
      );
      const parts = (pools: readonly ObjectStatus[]) => ({
        machinePools: pools,
        parts: { controlPlane: pausedPlane, machineDeployments: [] },
      });

      expect(activityOf(machinePools.cluster, "Provisioning", parts([pool]))).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:59:47Z"),
        source: { kind: "MachinePool" },
      });
      expect(activityOf(machinePools.cluster, "Provisioning", parts([]))).toMatchObject({
        state: "Blocked",
        since: since("2025-12-31T23:59:40Z"),
        threshold: undefined,
        source: { kind: "KubeadmControlPlane" },
      });
    });

    it.each([
      ["a MachineSet", withoutNode.machineSet, [withoutNode.machine], {}, "2025-12-31T23:59:41Z"],
      [
        "a MachineDeployment",
        provisioning.machineDeployment,
        [provisioning.workerMachine],
        ofProvisioning,
        "2025-12-31T23:59:41Z",
      ],
      [
        "a KubeadmControlPlane",
        provisioning.kubeadmControlPlane,
        [provisioning.controlPlaneMachine],
        ofProvisioning,
        "2025-12-31T23:59:40Z",
      ],
      [
        "a MachinePool",
        machinePools.machinePool,
        [machinePools.poolMachine],
        { cluster: machinePools.cluster },
        "2025-12-31T23:59:47Z",
      ],
    ])(
      "holds for %s while one of its Machines is, since that Machine was created",
      (_, owner, machines, context, created) => {
        const machine = machines[0] as KubeObjectData;

        expect(
          activityOf(owner as KubeObjectData, "Provisioning", { healthChecks: [], ...context, machines }),
        ).toMatchObject({
          state: "Progressing",
          since: since(created),
          source: { name: machine.metadata.name, kind: "Machine" },
        });
      },
    );

    it("holds for an owner since the oldest of its Machines that are Provisioning, with the threshold of that Machine", () => {
      // A second Machine of the MachineSet of without-node, created two minutes after the first, with a
      // MachineHealthCheck of 300 seconds for the first alone, written for the case.
      const younger = withMetadata(withoutNode.machine, {
        name: "freelens-capi-without-node-without-node-r2xk7",
        creationTimestamp: "2026-01-01T00:01:41Z",
      });
      const check = withStatus(withSpec(healthy.machineHealthCheck, { checks: { nodeStartupTimeoutSeconds: 300 } }), {
        targets: [withoutNode.machine.metadata.name],
      });
      const owner = withSpec(withoutNode.machineSet, { replicas: 2 });
      const context = {
        machines: [younger, withoutNode.machine],
        healthChecks: [withMetadata(check, { namespace: "freelens-capi-without-node" })],
      };

      expect(activityOf(owner, "Provisioning", context)).toMatchObject({
        since: since("2025-12-31T23:59:41Z"),
        threshold: { seconds: 300, passesAt: instant("2025-12-31T23:59:41Z") + 300_000 },
        source: { name: withoutNode.machine.metadata.name },
      });
    });

    it("holds for a KubeadmConfig until its data secret is created, with the threshold of its Machine (P17)", () => {
      const context = { ...ofProvisioning, machines: [provisioning.workerMachine] };

      expect(activityOf(provisioning.workerKubeadmConfig, "Provisioning", context)).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:59:41Z"),
        threshold: { seconds: 600 },
      });
      expect(namesOf(healthy.kubeadmConfig, { ...ofHealthy, machines: [healthy.controlPlaneMachine] })).toEqual([]);
    });

    describe("for an object of a provider, until the field of its contract says that it is ready (P17)", () => {
      const as = (role: ProviderRole, contract?: "v1beta1" | "v1beta2") => ({
        ...ofHealthy,
        role,
        contract,
        provider: "infrastructure-docker",
        machines: [healthy.controlPlaneMachine],
      });
      // The DevMachine and the DevCluster of healthy before they are provisioned: their `status.initialization`
      // emptied, the one field each case changes, or their `status.ready` set under the v1beta1 contract.
      const devMachine = withStatus(healthy.devMachine, { initialization: {} });
      const devCluster = withStatus(healthy.devCluster, { initialization: {} });

      it.each([
        ["an infrastructure machine", devMachine, "infrastructure-machine", { initialization: { provisioned: true } }],
        ["an infrastructure cluster", devCluster, "infrastructure-cluster", { initialization: { provisioned: true } }],
        ["a bootstrap config", devMachine, "bootstrap-config", { initialization: { dataSecretCreated: true } }],
        [
          "a control plane",
          withStatus(providerControlPlane, { initialization: {} }),
          "control-plane",
          { initialization: { controlPlaneInitialized: true } },
        ],
      ] as const)("reads %s at v1beta2", (_, object, role, ready) => {
        expect(namesOf(object as KubeObjectData, as(role, "v1beta2"))).toContain("Provisioning");
        expect(namesOf(withStatus(object as KubeObjectData, ready), as(role, "v1beta2"))).not.toContain("Provisioning");
      });

      it.each([
        ["an infrastructure machine", "infrastructure-machine", { ready: false }, { ready: true }],
        ["a bootstrap config", "bootstrap-config", { ready: false }, { ready: true }],
        ["a control plane", "control-plane", { initialized: false }, { initialized: true }],
      ] as const)("reads %s at v1beta1", (_, role, notReady, ready) => {
        const object = role === "control-plane" ? providerControlPlane : devMachine;

        expect(namesOf(withStatus(object as KubeObjectData, notReady), as(role, "v1beta1"))).toContain("Provisioning");
        expect(namesOf(withStatus(object as KubeObjectData, ready), as(role, "v1beta1"))).not.toContain("Provisioning");
      });

      it("reads an infrastructure machine pool as provisioned when either of its two fields says so", () => {
        const context = as("infrastructure-machine-pool");

        expect(namesOf(machinePools.devMachinePool, context)).not.toContain("Provisioning");
        expect(namesOf(withStatus(machinePools.devMachinePool, { ready: false }), context)).toContain("Provisioning");
        expect(
          namesOf(
            withStatus(machinePools.devMachinePool, { ready: false, initialization: { provisioned: true } }),
            context,
          ),
        ).not.toContain("Provisioning");
      });

      it("leaves the source unread, and notes it, when the view gave no contract", () => {
        const read = activitiesOf(devMachine, { ...as("infrastructure-machine"), contract: undefined });

        expect(read).toMatchObject({ activities: [], idle: false, unknown: true });
        expect(read.notes).toEqual([{ code: "input-not-given", input: "contract" }]);
      });
    });

    it("holds for a kind of the operator while its installed version is unset, since its creation (P14)", () => {
      const installing = operator([
        condition("PreflightCheckPassed", "True", "PreflightChecksPassed", "2025-12-31T23:58:05Z"),
      ]);

      expect(activityOf(installing, "Provisioning")).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:58:00Z"),
        threshold: { seconds: 600, passesAt: instant("2025-12-31T23:58:00Z") + 600_000 },
      });
    });
  });

  describe("Upgrading", () => {
    it("holds for a Cluster whose TopologyReconciled says that it upgrades, since its transition", () => {
      const context = { machinePools: [], parts: { machineDeployments: [] }, machines: [] };

      expect(activityOf(upgrading.cluster, "Upgrading", context)).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:59:40Z"),
        condition: { type: "TopologyReconciled", reason: "ClusterUpgrading" },
      });
    });

    it("holds for a KubeadmControlPlane whose version in its spec comes after one in its status, with no start", () => {
      expect(
        activityOf(upgrading.kubeadmControlPlane, "Upgrading", { cluster: upgrading.cluster, machines: [] }),
      ).toEqual({
        name: "Upgrading",
        state: "Progressing",
        since: undefined,
        threshold: { seconds: 600, passesAt: undefined },
        tone: "warning",
        condition: undefined,
        source: undefined,
      });
    });

    it("holds for a control plane through the contract, from status.version when it has no status.versions", () => {
      const upgradingProvider = withStatus(providerControlPlane, { versions: undefined, version: "v1.36.4" });

      expect(namesOf(upgradingProvider, asControlPlane)).toContain("Upgrading");
      expect(namesOf(providerControlPlane, asControlPlane)).not.toContain("Upgrading");
    });

    it("holds for a kind of the operator whose installed version differs from its spec, with no start (P14)", () => {
      const ready = [
        condition("PreflightCheckPassed", "True", "PreflightChecksPassed", "2025-12-31T23:58:05Z"),
        condition("ProviderInstalled", "True", "ProviderInstalled", "2025-12-31T23:58:10Z"),
        condition("Ready", "True", "DeploymentAvailable", "2025-12-31T23:58:20Z"),
      ];

      expect(activityOf(operator(ready, "v1.14.4", "v1.15.0"), "Upgrading")).toMatchObject({
        state: "Progressing",
        since: undefined,
        threshold: { seconds: 600, passesAt: undefined },
      });
      expect(activitiesOf(operator(ready, "v1.14.4"))).toMatchObject({ activities: [], idle: true });
    });
  });

  describe("Rolling out, Scaling up, Scaling down and Remediating, from their conditions", () => {
    it.each([
      ["a MachineDeployment", "Rolling out", rollingOut.machineDeployment, "2025-12-31T23:59:39Z"],
      ["a KubeadmControlPlane", "Rolling out", upgrading.kubeadmControlPlane, "2025-12-31T23:59:41Z"],
      ["a Cluster", "Scaling up", scalingUpHeld.cluster, "2025-12-31T23:59:40Z"],
      ["a MachineSet", "Scaling up", scalingUpHeld.machineSet, "2025-12-31T23:59:40Z"],
      ["a KubeadmControlPlane", "Scaling up", scalingUp.kubeadmControlPlane, "2025-12-31T23:59:36Z"],
      ["a Cluster", "Scaling down", scalingDown.cluster, "2025-12-31T23:59:53Z"],
      ["a MachineSet", "Scaling down", scalingDown.machineSet, "2025-12-31T23:59:53Z"],
      ["a MachineDeployment", "Scaling down", scalingDown.machineDeployment, "2025-12-31T23:59:52Z"],
      ["a KubeadmControlPlane", "Scaling down", upgrading.kubeadmControlPlane, "2025-12-31T23:59:42Z"],
      ["a Cluster", "Remediating", remediation.cluster, "2025-12-31T23:59:55Z"],
      ["a MachineSet", "Remediating", remediation.machineSet, "2025-12-31T23:59:55Z"],
      ["a MachineDeployment", "Remediating", remediation.machineDeployment, "2025-12-31T23:59:55Z"],
    ] as const)("reads %s %s since the transition of its condition", (_, name, object, transition) => {
      const context = {
        machines: [remediation.deletingMachine, remediation.deferredMachine],
        healthChecks: [],
        machinePools: [],
        parts: { machineDeployments: [rollingOutPart()] },
      };

      expect(activityOf(object as KubeObjectData, name, context)).toMatchObject({
        state: "Progressing",
        since: since(transition),
        condition: { status: "True" },
      });
    });

    it("reads them on a MachineDeployment and a KubeadmControlPlane whose fixtures do not have them", () => {
      // The MachineDeployment of healthy scaling up, and the control plane of healthy remediating: one condition
      // changed for each.
      const scaling = withCondition(healthy.machineDeployment, "ScalingUp", {
        status: "True",
        reason: "ScalingUp",
        message: "Scaling up from 2 to 3 replicas",
      });
      const remediating = withCondition(healthy.kubeadmControlPlane, "Remediating", {
        status: "True",
        reason: "Remediating",
      });

      expect(namesOf(scaling, { ...ofHealthy, machines: [healthy.workerMachine, secondWorker] })).toEqual([
        "Scaling up",
      ]);
      expect(namesOf(remediating, { ...ofHealthy, machines: [healthy.controlPlaneMachine] })).toEqual(["Remediating"]);
    });

    it("reads the Remediating of a Cluster without its Machines as Progressing, and notes them", () => {
      const read = activitiesOf(remediation.cluster, { machinePools: [], parts: { machineDeployments: [] } });

      expect(read.activities.find(({ name }) => name === "Remediating")?.state).toBe("Progressing");
      expect(read.notes).toContainEqual({ code: "input-not-given", input: "machines" });
    });

    it("reads the Rolling out of a Cluster through a part that rolls out (P4)", () => {
      const context = {
        machinePools: [],
        parts: { machineDeployments: [rollingOutPart()] },
        machines: [],
        healthChecks: [],
      };

      expect(activityOf(rollingOut.cluster, "Rolling out", context)).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:59:40Z"),
      });
    });
  });

  describe("the activities of a Machine", () => {
    it("reads Remediating from OwnerRemediated, since its transition (P21)", () => {
      expect(activityOf(remediation.deferredMachine, "Remediating", ofRemediation)).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:59:55Z"),
        condition: { type: "OwnerRemediated", reason: "RemediationDeferred" },
      });
    });

    it("reads Remediating from ExternallyRemediated, waiting for the external remediation (P21)", () => {
      // The deferred Machine of remediation remediated by an external controller: its `OwnerRemediated` changed to
      // `ExternallyRemediated`.
      const external = withCondition(remediation.deferredMachine, "OwnerRemediated", {
        type: "ExternallyRemediated",
        reason: "WaitingForRemediation",
      });

      expect(activityOf(external, "Remediating", ofRemediation)).toMatchObject({
        state: "Progressing",
        condition: { type: "ExternallyRemediated" },
      });
    });

    it("reads Updating from its condition, since its transition", () => {
      // The worker of healthy updating in place: its `Updating` changed to `True`.
      const updating = withCondition(healthy.workerMachine, "Updating", {
        status: "True",
        reason: "InPlaceUpdating",
        lastTransitionTime: "2025-12-31T23:59:50Z",
      });

      expect(activityOf(updating, "Updating", ofHealthy)).toMatchObject({
        state: "Progressing",
        since: since("2025-12-31T23:59:50Z"),
        threshold: { seconds: 600 },
      });
    });
  });

  it.each([
    ["a Cluster", healthy.cluster, { machines: [] }],
    ["a Cluster without a topology, which has no TopologyReconciled", withoutTopology.cluster, { machines: [] }],
    ["a Machine", healthy.workerMachine, {}],
    ["a MachineSet", healthy.machineSet, { machines: [healthy.workerMachine, secondWorker] }],
    ["a MachineDeployment", healthy.machineDeployment, { machines: [healthy.workerMachine, secondWorker] }],
    ["a KubeadmControlPlane", healthy.kubeadmControlPlane, { machines: [healthy.controlPlaneMachine] }],
    ["a KubeadmConfig", healthy.kubeadmConfig, { machines: [healthy.controlPlaneMachine] }],
    ["a MachineHealthCheck", healthy.machineHealthCheck, {}],
    ["a ClusterResourceSet", healthy.clusterResourceSet, { bindings: [] }],
    ["a ClusterClass", healthy.clusterClass, {}],
    ["an infrastructure cluster", healthy.devCluster, { role: "infrastructure-cluster", contract: "v1beta2" }],
  ] as const)("reads Idle for %s whose every source was read and none holds", (_, object, context) => {
    expect(
      activitiesOf(object as KubeObjectData, { ...ofHealthy, provider: "infrastructure-docker", ...context }),
    ).toEqual({
      state: "read",
      activities: [],
      idle: true,
      unknown: false,
      changesAt: undefined,
      notes: [],
    });
  });
});

it("lists several activities at once, in the order of H2", () => {
  // The control plane of scaling-up-held paused: its `Paused` changed to `True`.
  const pausedControlPlane = withCondition(scalingUpHeld.kubeadmControlPlane, "Paused", {
    status: "True",
    reason: "Paused",
  });

  expect(namesOf(upgrading.kubeadmControlPlane, { cluster: upgrading.cluster, machines: [] })).toEqual([
    "Upgrading",
    "Rolling out",
    "Scaling down",
  ]);
  expect(namesOf(pausedControlPlane, { cluster: scalingUpHeld.cluster, machines: [] })).toEqual([
    "Paused",
    "Upgrading",
    "Rolling out",
    "Scaling down",
  ]);
});

describe("the note of P4", () => {
  it("shows the note, and not Rolling out, for a MachineDeployment under OnDelete with RollingOut True", () => {
    // The MachineDeployment of rolling-out under the strategy OnDelete.
    const onDelete = withSpec(rollingOut.machineDeployment, { rollout: { strategy: { type: "OnDelete" } } });
    const read = activitiesOf(onDelete, { ...ofRollingOut, machines: [rollingOut.oldMachine, rollingOut.newMachine] });

    expect(read.activities.map(({ name }) => name)).not.toContain("Rolling out");
    expect(read.notes).toEqual([{ code: "machines-differ-from-spec" }]);
  });

  it("shows the note for a MachineSet and a Machine not up to date, which write no RollingOut", () => {
    expect(
      activitiesOf(rollingOut.oldMachineSet, { ...ofRollingOut, machines: [rollingOut.oldMachine] }).notes,
    ).toEqual([{ code: "machines-differ-from-spec" }]);
    expect(activitiesOf(rollingOut.oldMachine, ofRollingOut).notes).toEqual([{ code: "machines-differ-from-spec" }]);
    expect(
      activitiesOf(healthy.machineSet, { ...ofHealthy, machines: [healthy.workerMachine, secondWorker] }).notes,
    ).toEqual([]);
  });

  it("reads the Rolling out of a Cluster from its condition, with the note of its parts, when the view gave none", () => {
    const read = activitiesOf(rollingOut.cluster, { machinePools: [], machines: [], healthChecks: [] });

    expect(read.activities.find(({ name }) => name === "Rolling out")).toMatchObject({ state: "Progressing" });
    expect(read.notes).toContainEqual({ code: "input-not-given", input: "parts" });
    expect(read.notes).not.toContainEqual({ code: "machines-differ-from-spec" });
  });

  it("shows no note for a Cluster none of whose parts rolls out when a part cannot be read, which may", () => {
    const wrong = { object: { kind: "MachineDeployment", name: "broken" }, activities: { state: "read" } } as never;
    const read = activitiesOf(rollingOut.cluster, {
      machinePools: [],
      machines: [],
      healthChecks: [],
      parts: { machineDeployments: [wrong] },
    });

    expect(read.activities.map(({ name }) => name)).not.toContain("Rolling out");
    expect(read).toMatchObject({ idle: false, unknown: true, notes: [] });
  });

  it("shows the note for a Cluster whose parts that roll out are all under OnDelete", () => {
    const onDelete = withSpec(rollingOut.machineDeployment, { rollout: { strategy: { type: "OnDelete" } } });
    const context = { machinePools: [], machines: [], healthChecks: [] };
    const read = activitiesOf(rollingOut.cluster, {
      ...context,
      parts: { machineDeployments: [rollingOutPart(onDelete)] },
    });

    expect(read.activities.map(({ name }) => name)).not.toContain("Rolling out");
    expect(read.notes).toEqual([{ code: "machines-differ-from-spec" }]);
  });
});

describe("the Provisioning of a Machine (D3)", () => {
  // The Machine of without-node, which has no Node and is not available, a day after the capture.
  const aDayLater = CAPTURE + 86_400_000;

  it.each(["Pending", "Provisioning", "Provisioned"])(
    "holds in the phase %s with no Node, whatever its age",
    (phase) => {
      expect(namesOf(withStatus(withoutNode.machine, { phase }), { healthChecks: [], now: aDayLater })).toEqual([
        "Provisioning",
      ]);
    },
  );

  it.each(["Running", "Updating", "Deleting", "Deleted", "Failed"])(
    "does not hold in the phase %s for a Machine that is available",
    (phase) => {
      expect(namesOf(withStatus(healthy.workerMachine, { phase }), ofHealthy)).toEqual([]);
    },
  );

  it("leaves the source unread with no Node and a phase that is not written or outside the set", () => {
    for (const phase of [undefined, "Booting", "Unknown"]) {
      expect(
        activitiesOf(withStatus(withoutNode.machine, { phase }), { healthChecks: [], now: aDayLater }),
      ).toMatchObject({
        idle: false,
        unknown: true,
      });
    }
  });

  it("holds with a Node and not Available while it is within its threshold, and not after it", () => {
    // The new Machine of rolling-out has its Node and is not available; its Cluster is moved back by 30 minutes,
    // the one field the case changes, so that the floor of P2 has passed.
    const cluster = withMetadata(rollingOut.cluster, { creationTimestamp: "2025-12-31T23:28:20Z" });
    const passesAt = instant("2025-12-31T23:59:40Z") + 600_000;
    const context = { cluster, healthChecks: [] };

    expect(namesOf(rollingOut.newMachine, { ...context, now: passesAt - 1 })).toEqual(["Provisioning"]);
    expect(namesOf(rollingOut.newMachine, { ...context, now: passesAt })).toEqual([]);
  });

  it("holds while it waits for minReadySeconds, whatever its age, with the wait within its threshold (P2, P5)", () => {
    // The worker of healthy waiting for an hour of minReadySeconds: its `Available` changed to the wait, and
    // `spec.minReadySeconds` set; its `Ready` turned `True` at 23:59:39.
    const waiting = withSpec(
      withCondition(healthy.workerMachine, "Available", { status: "False", reason: "WaitingForMinReadySeconds" }),
      { minReadySeconds: 3600 },
    );
    const end = instant("2025-12-31T23:59:39Z") + 3_600_000;

    expect(activityOf(waiting, "Provisioning", ofHealthy)).toMatchObject({
      since: since("2025-12-31T23:58:34Z"),
      threshold: { seconds: 600, passesAt: end },
      condition: { type: "Available", reason: "WaitingForMinReadySeconds" },
    });
    expect(activityOf(waiting, "Provisioning", { ...ofHealthy, now: end - 1 }).tone).toBe("progress");
    expect(activityOf(waiting, "Provisioning", { ...ofHealthy, now: end + 86_400_000 }).tone).toBe("warning");
  });

  it("does not hold by its phase for a Machine that has its Node, and holds while its Available is Unknown", () => {
    // The worker of healthy with the phase that it had before its Node, its `status.nodeRef` set; and the new
    // Machine of rolling-out with its `Available` `Unknown`, within its threshold.
    expect(namesOf(withStatus(healthy.workerMachine, { phase: "Provisioned" }), ofHealthy)).toEqual([]);
    expect(
      namesOf(
        withCondition(rollingOut.newMachine, "Available", { status: "Unknown", reason: "InternalError" }),
        ofRollingOut,
      ),
    ).toEqual(["Provisioning"]);
  });

  it("does not hold for a Machine that is deleting, whose deletion is what it does", () => {
    expect(namesOf(remediation.deletingMachine, ofRemediation)).toEqual(["Deleting"]);
  });
});

describe("Replacing (D3)", () => {
  const ofHealthyWorkers = (machines: readonly KubeObjectData[]) => ({ ...ofHealthy, machines: machines as never });
  // The first worker of healthy deleted by hand, ten seconds before the capture.
  const deletedByHand = withMetadata(healthy.workerMachine, { deletionTimestamp: "2025-12-31T23:59:50Z" });

  it("holds for a Machine deleted by hand, since the deletion, with the 15 minutes of a deletion", () => {
    // The Cluster of healthy is moved back by 30 minutes, the one field the case changes, so that the floor of P2
    // has passed.
    const cluster = withMetadata(healthy.cluster, { creationTimestamp: "2025-12-31T23:00:00Z" });

    expect(
      activityOf(healthy.machineSet, "Replacing", { ...ofHealthyWorkers([deletedByHand, secondWorker]), cluster }),
    ).toEqual({
      name: "Replacing",
      state: "Progressing",
      since: since("2025-12-31T23:59:50Z"),
      threshold: { seconds: 900, passesAt: instant("2025-12-31T23:59:50Z") + 900_000 },
      tone: "progress",
      condition: undefined,
      source: expect.objectContaining({ name: healthy.workerMachine.metadata.name }),
    });
  });

  it("holds for a remediation, since the deletion of the remediated Machine", () => {
    const context = { ...ofRemediation, machines: [remediation.deletingMachine, remediation.deferredMachine] };

    expect(activityOf(remediation.machineSet, "Replacing", context)).toMatchObject({
      since: since("2025-12-31T23:59:55Z"),
      source: { name: remediation.deletingMachine.metadata.name },
    });
  });

  it("dates from the earliest of the deletions that make it hold", () => {
    // A second Machine of the MachineSet of remediation deleted five seconds before the first: a copy of it.
    const earlier = withMetadata(remediation.deletingMachine, {
      name: "freelens-capi-remediation-md-0-qrjs5-t4crs-p8w2k",
      deletionTimestamp: "2025-12-31T23:59:50Z",
    });
    const context = {
      ...ofRemediation,
      machines: [remediation.deletingMachine, earlier, remediation.deferredMachine],
    };

    expect(activityOf(remediation.machineSet, "Replacing", context)).toMatchObject({
      since: since("2025-12-31T23:59:50Z"),
      source: { name: earlier.metadata.name },
    });
  });

  it("holds for a rollout with maxUnavailable 1, and not for one that surges", () => {
    // The MachineDeployment of rolling-out with maxUnavailable 1 and no surge, and its old Machine deleted before
    // the new one is created; then, as it surges, with its new Machine created first.
    const unavailable = withSpec(rollingOut.machineDeployment, {
      rollout: { strategy: { type: "RollingUpdate", rollingUpdate: { maxSurge: 0, maxUnavailable: 1 } } },
    });
    const oldDeleting = withMetadata(rollingOut.oldMachine, { deletionTimestamp: "2025-12-31T23:59:50Z" });
    const otherOld = withMetadata(rollingOut.oldMachine, { name: "freelens-capi-rolling-out-md-0-t96dp-xkg62-tfl6d" });

    expect(namesOf(unavailable, { ...ofRollingOut, machines: [oldDeleting, otherOld] })).toContain("Replacing");
    expect(
      namesOf(rollingOut.machineDeployment, {
        ...ofRollingOut,
        machines: [oldDeleting, otherOld, rollingOut.newMachine],
      }),
    ).not.toContain("Replacing");
  });

  it("does not hold for a scale down, once the deleting Machine is gone, or while the owner is deleting", () => {
    // The MachineSet of healthy scaled down from 3 to 2 replicas: a third worker, a copy of the first with another
    // name, deleting, and the two others kept.
    const third = withMetadata(healthy.workerMachine, {
      name: "freelens-capi-healthy-md-0-m9x7h-m5gtb-x7q2w",
      deletionTimestamp: "2025-12-31T23:59:50Z",
    });

    expect(namesOf(healthy.machineSet, ofHealthyWorkers([healthy.workerMachine, secondWorker, third]))).toEqual([]);
    expect(
      namesOf(remediation.machineSet, { ...ofRemediation, machines: [remediation.deferredMachine] }),
    ).not.toContain("Replacing");
    expect(
      namesOf(withMetadata(remediation.machineSet, { deletionTimestamp: "2025-12-31T23:59:59Z" }), {
        ...ofRemediation,
        machines: [remediation.deletingMachine, remediation.deferredMachine],
      }),
    ).toEqual(["Deleting"]);
  });
});

describe("a MachinePool", () => {
  // The pool of pool-without-machines with no Node left: its `status.nodeRefs` emptied, the one field the case
  // changes.
  const withoutNodes = withStatus(poolWithoutMachines.machinePool, { nodeRefs: [] });
  const context = { cluster: poolWithoutMachines.cluster, machines: [] };

  it("with no Machine is Provisioning while it has no Node, with no start (P17)", () => {
    expect(activityOf(withoutNodes, "Provisioning", context)).toEqual({
      name: "Provisioning",
      state: "Progressing",
      since: undefined,
      threshold: { seconds: 600, passesAt: undefined },
      tone: "warning",
      condition: undefined,
      source: undefined,
    });
    expect(namesOf(poolWithoutMachines.machinePool, context)).toEqual([]);
  });

  it("with no Machine is never Provisioning at 0 replicas", () => {
    expect(namesOf(withSpec(withoutNodes, { replicas: 0 }), context)).not.toContain("Provisioning");
  });

  it("is never Idle, since it writes neither RollingOut nor Remediating (P1)", () => {
    expect(activitiesOf(poolWithoutMachines.machinePool, context)).toMatchObject({
      activities: [],
      idle: false,
      unknown: true,
      notes: [],
    });
  });

  it("is Idle once it writes RollingOut and Remediating, as a later release may, and Unknown with a count unset", () => {
    // The pool of pool-without-machines with the two conditions written `False`, which this release never writes.
    const written = withStatus(poolWithoutMachines.machinePool, {
      conditions: [
        ...poolWithoutMachines.machinePool.status.conditions,
        condition("RollingOut", "False", "NotRollingOut", "2025-12-31T23:58:38Z"),
        condition("Remediating", "False", "NotRemediating", "2025-12-31T23:58:38Z"),
      ],
    });

    expect(activitiesOf(written, context)).toMatchObject({ activities: [], idle: true, unknown: false });
    expect(activitiesOf(withStatus(written, { replicas: undefined }), context)).toMatchObject({
      idle: false,
      unknown: true,
    });
  });

  describe("scales as its counters say (P20)", () => {
    const pool = (replicas: number, annotations?: Record<string, string>) =>
      withMetadata(withStatus(poolWithoutMachines.machinePool, { replicas }), { annotations });

    it("is Scaling up below spec.replicas and Scaling down above, with no start", () => {
      expect(activityOf(pool(0), "Scaling up", context)).toMatchObject({ since: undefined, tone: "warning" });
      expect(activityOf(pool(2), "Scaling down", context)).toMatchObject({ since: undefined, tone: "warning" });
      expect(namesOf(pool(1), context)).toEqual([]);
    });

    it('reads the annotation replicas-managed-by with the value "false" as absent, and another value as an outside count', () => {
      expect(namesOf(pool(0, { "cluster.x-k8s.io/replicas-managed-by": "false" }), context)).toEqual(["Scaling up"]);
      expect(namesOf(pool(0, { "cluster.x-k8s.io/replicas-managed-by": "external-autoscaler" }), context)).toEqual([]);
      expect(namesOf(pool(0, { "cluster.x-k8s.io/replicas-managed-by": "" }), context)).toEqual([]);
    });

    it("leaves the scale unread with a count unset", () => {
      expect(activitiesOf(withStatus(poolWithoutMachines.machinePool, { replicas: undefined }), context)).toMatchObject(
        {
          activities: [],
          unknown: true,
        },
      );
    });
  });
});

describe("a control plane of a provider (P1)", () => {
  it.each([
    ["RollingOut", "Rolling out"],
    ["ScalingUp", "Scaling up"],
    ["ScalingDown", "Scaling down"],
  ] as const)("reads %s, one of the three conditions that it writes", (type, name) => {
    // The control plane of the provider with that condition changed to `True`.
    const active = withCondition(providerControlPlane, type, { status: "True", reason: type });

    expect(activitiesOf(providerControlPlane, asControlPlane)).toMatchObject({
      activities: [],
      idle: true,
      unknown: false,
    });
    expect(namesOf(active, asControlPlane)).toEqual([name]);
  });

  it("reads Unknown when it writes none of them, and so does its Cluster with it in parts", () => {
    const silent = withoutCondition(
      withoutCondition(withoutCondition(providerControlPlane, "RollingOut"), "ScalingUp"),
      "ScalingDown",
    );
    const part = statusOf(silent, contextOf(asControlPlane));

    expect(part.activities).toMatchObject({ activities: [], idle: false, unknown: true });
    expect(
      activitiesOf(healthy.cluster, { machinePools: [], parts: { controlPlane: part, machineDeployments: [] } }),
    ).toMatchObject({ activities: [], idle: false, unknown: true });
  });
});

describe("Unknown and never Idle (P1)", () => {
  const context = { ...ofHealthy, machines: [healthy.workerMachine, secondWorker] };

  it("for a condition of an activity that is Unknown, as the project writes it when it cannot list its Machines", () => {
    const unsure = withCondition(healthy.machineDeployment, "ScalingUp", {
      status: "Unknown",
      reason: "InternalError",
    });

    expect(activitiesOf(unsure, context)).toMatchObject({ activities: [], idle: false, unknown: true });
  });

  it("for a condition of an activity that is missing on a kind that writes it", () => {
    expect(activitiesOf(withoutCondition(healthy.machineDeployment, "RollingOut"), context)).toMatchObject({
      idle: false,
      unknown: true,
    });
  });

  it("for a condition of an activity that is missing on a Machine and on a Cluster, which write them", () => {
    expect(activitiesOf(withoutCondition(healthy.workerMachine, "Updating"), ofHealthy)).toMatchObject({
      idle: false,
      unknown: true,
    });
    expect(activitiesOf(withoutCondition(healthy.cluster, "ScalingUp"), { ...ofHealthy, machines: [] })).toMatchObject({
      idle: false,
      unknown: true,
    });
  });

  it("for a ControlPlaneInitialized that is missing or Unknown, which leaves the Provisioning of a Cluster unread", () => {
    const pools = { ...ofHealthy, machines: [] };

    for (const cluster of [
      withoutCondition(healthy.cluster, "ControlPlaneInitialized"),
      withCondition(healthy.cluster, "ControlPlaneInitialized", { status: "Unknown", reason: "InternalError" }),
    ]) {
      expect(activitiesOf(cluster, pools)).toMatchObject({ activities: [], idle: false, unknown: true });
    }
  });

  it("for a TopologyReconciled with a reason that the release does not define (P22)", () => {
    const odd = withCondition(upgrading.cluster, "TopologyReconciled", { reason: "ClusterUpgradingSlowly" });
    const read = activitiesOf(odd, { machinePools: [], parts: { machineDeployments: [] }, machines: [] });

    expect(read.activities.map(({ name }) => name)).not.toContain("Upgrading");
    expect(read).toMatchObject({ idle: false, unknown: true });
  });

  it("for an owner one of whose Machines has no status yet", () => {
    expect(
      activitiesOf(withoutNode.machineSet, { machines: [withoutStatus(withoutNode.machine)], healthChecks: [] }),
    ).toMatchObject({ idle: false, unknown: true });
  });

  it("for a Cluster with a part that the view built wrong", () => {
    const wrong = { object: { kind: "MachineDeployment", name: "broken" }, activities: { state: "read" } } as never;

    expect(
      activitiesOf(healthy.cluster, { ...ofHealthy, machines: [], parts: { machineDeployments: [wrong] } }),
    ).toMatchObject({ idle: false, unknown: true });
  });

  it("for a deletion time that is not text", () => {
    expect(
      activitiesOf(withMetadata(healthy.workerMachine, { deletionTimestamp: 1_767_225_600 }), ofHealthy),
    ).toMatchObject({ idle: false, unknown: true });
  });

  it("for the Provisioning of a Machine by its age with no time of the evaluation, which is noted", () => {
    const read = activitiesOf(rollingOut.newMachine, { ...ofRollingOut, now: Number.NaN });

    expect(read).toMatchObject({ activities: [], idle: false, unknown: true });
    expect(read.notes).toContainEqual({ code: "field-unreadable", field: "now" });
  });

  it("for a condition of an activity True with InternalError, whose state is Unknown, a provider's included", () => {
    expect(
      activityOf(
        withCondition(providerControlPlane, "ScalingUp", { status: "True", reason: "InternalError" }),
        "Scaling up",
        asControlPlane,
      ).state,
    ).toBe("Unknown");
  });

  it("for a condition of an activity True with InternalError, whose state is Unknown", () => {
    const failing = withCondition(healthy.machineDeployment, "ScalingUp", { status: "True", reason: "InternalError" });

    expect(activityOf(failing, "Scaling up", context)).toMatchObject({
      state: "Unknown",
      threshold: undefined,
      tone: "vague",
    });
  });

  it("for an object with no status yet, noting the inputs that the case does not give", () => {
    expect(activitiesOf(noStatus.machineDeployment)).toEqual({
      state: "read",
      activities: [],
      idle: false,
      unknown: true,
      changesAt: undefined,
      notes: [{ code: "input-not-given", input: "machines" }],
    });
  });

  it("for a parent of the field of a contract that is not an object, which is noted and never read as unset (P17)", () => {
    // The KubeadmConfig of provisioning with its `status.initialization` of the wrong type.
    const config = withStatus(provisioning.workerKubeadmConfig, { initialization: "pending" });
    const read = activitiesOf(config, { ...ofProvisioning, machines: [provisioning.workerMachine] });

    expect(read).toMatchObject({ activities: [], idle: false, unknown: true });
    expect(read.notes).toContainEqual({ code: "field-unreadable", field: "status.initialization" });
  });

  it.each([
    ["spec.rollout", { rollout: "RollingUpdate" }],
    ["spec.rollout.strategy", { rollout: { strategy: "RollingUpdate" } }],
    ["spec.rollout.strategy.type", { rollout: { strategy: { type: 2 } } }],
    ["spec.paused", { paused: "yes" }],
  ])("for a %s of the wrong type, under which P4 reads the strategy, noted", (field, spec) => {
    // The MachineDeployment of rolling-out, whose `RollingOut` is `True`, with that field of the wrong type.
    const read = activitiesOf(withSpec(rollingOut.machineDeployment, spec), {
      ...ofRollingOut,
      machines: [rollingOut.oldMachine, rollingOut.newMachine],
    });

    expect(read.activities.map(({ name }) => name)).not.toContain("Rolling out");
    expect(read).toMatchObject({ idle: false, unknown: true });
    expect(read.notes).toContainEqual({ code: "field-unreadable", field });
  });

  it("for a topology of the wrong type, which never reads as no topology", () => {
    // The Cluster of upgrading, whose `TopologyReconciled` says that it upgrades, with its `spec.topology` of the
    // wrong type.
    const odd = withSpec(upgrading.cluster, { topology: "quick-start" });
    const read = activitiesOf(odd, { machinePools: [], parts: { machineDeployments: [] }, machines: [] });

    expect(read.activities.map(({ name }) => name)).not.toContain("Upgrading");
    expect(read).toMatchObject({ idle: false, unknown: true });
    expect(read.notes).toContainEqual({ code: "field-unreadable", field: "spec.topology" });
  });

  it("for a Machine whose creation cannot be read, whose age then cannot be judged, and for its owner", () => {
    // The new Machine of rolling-out, which has its Node and is not available, with its creation of the wrong type
    // and then not a time.
    for (const creationTimestamp of [1_767_225_580, "yesterday"]) {
      const machine = withMetadata(rollingOut.newMachine, { creationTimestamp });
      const read = activitiesOf(machine, ofRollingOut);

      expect(read).toMatchObject({ activities: [], idle: false, unknown: true });
      expect(read.notes).toContainEqual({ code: "field-unreadable", field: "metadata.creationTimestamp" });
      expect(activitiesOf(rollingOut.newMachineSet, { ...ofRollingOut, machines: [machine] })).toMatchObject({
        idle: false,
        unknown: true,
      });
    }
  });

  it("for a kind of the operator installed with no version in its spec, which is no upgrade", () => {
    // A kind of the operator installed, whose spec lost its version, which the operator writes before it installs.
    const ready = [condition("Ready", "True", "DeploymentAvailable", "2025-12-31T23:58:20Z")];

    for (const version of [undefined, "", 7]) {
      const read = activitiesOf(withSpec(operator(ready, "v1.14.4"), { version }));

      expect(read).toMatchObject({ activities: [], idle: false, unknown: true });
      expect(read.notes).toContainEqual({ code: "field-unreadable", field: "spec.version" });
    }
  });

  it("for a version that does not parse (P28)", () => {
    // The control plane of healthy with a version of its spec that is not one of Kubernetes.
    const wrong = withSpec(healthy.kubeadmControlPlane, { version: "latest" });

    expect(activitiesOf(wrong, { ...ofHealthy, machines: [healthy.controlPlaneMachine] })).toMatchObject({
      activities: [],
      idle: false,
      unknown: true,
    });
  });

  it("for an owner without its Machines, and a Cluster without its parts, each noted", () => {
    expect(activitiesOf(healthy.machineSet, ofHealthy)).toMatchObject({
      idle: false,
      unknown: true,
      notes: [{ code: "input-not-given", input: "machines" }],
    });
    expect(activitiesOf(healthy.cluster, { machinePools: [] })).toMatchObject({
      idle: false,
      unknown: true,
      notes: [{ code: "input-not-given", input: "parts" }],
    });
    expect(activitiesOf(healthy.cluster, { parts: { machineDeployments: [] } })).toMatchObject({
      idle: false,
      unknown: true,
      notes: [{ code: "input-not-given", input: "machinePools" }],
    });
  });
});

describe("the Upgrading of a control plane (P28)", () => {
  const context = { ...ofHealthy, machines: [healthy.controlPlaneMachine] };
  const controlPlane = (version: string, versions?: readonly { version: string }[], statusVersion?: string) =>
    withStatus(withSpec(healthy.kubeadmControlPlane, { version }), { versions, version: statusVersion });

  it("holds when the project calls it upgrading: a greater version, or other words of build metadata", () => {
    expect(namesOf(controlPlane("v1.37.1", [{ version: "v1.37.0" }]), context)).toEqual(["Upgrading"]);
    expect(namesOf(controlPlane("v1.37.0+build.b", [{ version: "v1.37.0+build.a" }]), context)).toEqual(["Upgrading"]);
    expect(namesOf(controlPlane("v1.37.0", [{ version: "v1.37.0" }, { version: "v1.36.4" }]), context)).toEqual([
      "Upgrading",
    ]);
    expect(namesOf(controlPlane("v1.37.0", [{ version: "v1.37.0" }]), context)).toEqual([]);
  });

  it("does not hold with no version in its status, or an empty one, which leaves nothing unread", () => {
    expect(activitiesOf(controlPlane("v1.37.0"), context)).toMatchObject({ activities: [], idle: true });
    expect(activitiesOf(controlPlane("v1.37.0", [], ""), context)).toMatchObject({ activities: [], idle: true });
    expect(namesOf(controlPlane("v1.37.0", [], "v1.36.4"), context)).toEqual(["Upgrading"]);
  });

  it("leaves the source unread for an entry of status.versions that does not parse", () => {
    expect(activitiesOf(controlPlane("v1.37.0", [{ version: "latest" }]), context)).toMatchObject({
      activities: [],
      idle: false,
      unknown: true,
    });
  });

  it("reads a downgrade as Rolling out, from the RollingOut that it brings, and not as Upgrading", () => {
    // The control plane of healthy asked for an older version, which rolls its Machines out.
    const downgrade = withCondition(controlPlane("v1.36.4", [{ version: "v1.37.0" }]), "RollingOut", {
      status: "True",
      reason: "RollingOut",
    });

    expect(namesOf(downgrade, context)).toEqual(["Rolling out"]);
  });
});

describe("Blocked (D4, P14, P18, P21, P33)", () => {
  it("for an in-place update that failed", () => {
    const failed = withCondition(healthy.workerMachine, "Updating", { status: "True", reason: "InPlaceUpdateFailed" });

    expect(activityOf(failed, "Updating", ofHealthy)).toMatchObject({
      state: "Blocked",
      threshold: undefined,
      tone: "warning",
    });
  });

  it("for a Machine whose Node cannot be deleted (P18)", () => {
    const failing = withCondition(scalingDown.deletingMachine, "Deleting", { reason: "DeletingNode" });

    expect(activityOf(failing, "Deleting", ofScalingDown)).toMatchObject({ state: "Blocked", tone: "warning" });
  });

  it("for a deleting Cluster whose TopologyReconciled has the text of a hook that blocks it, and not for the wait alone (P18)", () => {
    const waiting = withCondition(deleting.cluster, "Deleting", { reason: "WaitingForBeforeDeleteHook" });
    const hooked = withCondition(waiting, "TopologyReconciled", {
      message: "Cluster is deleting. Following hooks are blocking delete: BeforeClusterDelete: waiting for a backup",
    });

    expect(activityOf(waiting, "Deleting").state).toBe("Progressing");
    expect(activityOf(hooked, "Deleting").state).toBe("Blocked");
  });

  it("for a Cluster whose creation a hook holds (P18)", () => {
    const holding = withCondition(provisioning.cluster, "TopologyReconciled", {
      status: "False",
      reason: "ClusterCreating",
      message: "Following hooks are blocking Cluster topology creation: BeforeClusterCreate: waiting",
    });

    expect(activityOf(holding, "Provisioning", { machinePools: [], parts: { machineDeployments: [] } }).state).toBe(
      "Blocked",
    );
  });

  it.each([
    ["MachineDeploymentsUpgradeDeferred", ""],
    ["MachinePoolsUpgradeDeferred", ""],
    [
      "ClusterUpgrading",
      "Cluster is upgrading to v1.37.0\n  * Following hooks are blocking upgrade: BeforeClusterUpgrade",
    ],
  ])("for an upgrade of a Cluster with %s %s (D4, P18)", (reason, message) => {
    const held = withCondition(upgrading.cluster, "TopologyReconciled", { reason, message });
    const context = { machinePools: [], parts: { machineDeployments: [] }, machines: [] };

    expect(activityOf(held, "Upgrading", context).state).toBe("Blocked");
  });

  describe("the remediation of a Machine and of its owner (P21)", () => {
    const cannot = <T extends KubeObjectData>(
      machine: T,
      message = "KubeadmControlPlane can't remediate if current replicas are less or equal to 1",
    ) => withCondition(machine, "OwnerRemediated", { reason: "CannotBeRemediated", message });

    it("is Blocked for CannotBeRemediated, RemediationTemplateNotFound and RemediationRequestCreationFailed", () => {
      expect(activityOf(cannot(remediation.deferredMachine), "Remediating", ofRemediation).state).toBe("Blocked");
      for (const reason of ["RemediationTemplateNotFound", "RemediationRequestCreationFailed"]) {
        const external = withCondition(remediation.deferredMachine, "OwnerRemediated", {
          type: "ExternallyRemediated",
          reason,
        });

        expect(activityOf(external, "Remediating", ofRemediation).state).toBe("Blocked");
      }
    });

    it("is Progressing for CannotBeRemediated on a Machine that a rollout removes", () => {
      const removed = cannot(
        remediation.deferredMachine,
        "Machine won't be remediated because it is pending removal due to rollout",
      );

      expect(activityOf(removed, "Remediating", ofRemediation).state).toBe("Progressing");
    });

    it("is Blocked for an owner whose Machines in remediation are all Blocked, and Progressing otherwise", () => {
      const blockedMachines = [cannot(remediation.deletingMachine), cannot(remediation.deferredMachine)];

      expect(
        activityOf(remediation.machineSet, "Remediating", { ...ofRemediation, machines: blockedMachines }).state,
      ).toBe("Blocked");
      expect(
        activityOf(remediation.machineSet, "Remediating", {
          ...ofRemediation,
          machines: [cannot(remediation.deletingMachine), remediation.deferredMachine],
        }).state,
      ).toBe("Progressing");
    });
  });

  describe("the steps of a kind of the operator that failed (P14)", () => {
    const preflight = condition("PreflightCheckPassed", "True", "PreflightChecksPassed", "2025-12-31T23:58:05Z");
    const installed = condition("ProviderInstalled", "True", "ProviderInstalled", "2025-12-31T23:58:10Z");
    const ready = condition("Ready", "True", "DeploymentAvailable", "2025-12-31T23:58:20Z");

    it("reads an upgrade that failed as Upgrading and Blocked, and not as Provisioning", () => {
      const failed = condition("ProviderUpgraded", "False", "ComponentsUpgradeError", "2025-12-31T23:59:00Z");

      expect(namesOf(operator([preflight, installed, ready, failed], "v1.14.4", "v1.15.0"))).toEqual(["Upgrading"]);
      expect(
        activityOf(operator([preflight, installed, ready, failed], "v1.14.4", "v1.15.0"), "Upgrading"),
      ).toMatchObject({
        state: "Blocked",
        condition: { type: "ProviderUpgraded", reason: "ComponentsUpgradeError" },
      });
    });

    it("reads an upgrade whose manifests cannot be fetched as Upgrading and Blocked, from ProviderInstalled", () => {
      const fetchFailed = condition("ProviderInstalled", "False", "ComponentsFetchError", "2025-12-31T23:59:00Z");

      expect(activityOf(operator([preflight, fetchFailed, ready], "v1.14.4", "v1.15.0"), "Upgrading")).toMatchObject({
        state: "Blocked",
        condition: { type: "ProviderInstalled", reason: "ComponentsFetchError" },
      });
    });

    it("reads a first installation that failed, and a preflight check that refuses it, as Blocked", () => {
      const failed = condition("ProviderInstalled", "False", "ComponentsFetchError", "2025-12-31T23:58:10Z");
      const refused = condition("PreflightCheckPassed", "False", "IncorrectVersionFormat", "2025-12-31T23:58:05Z");

      expect(activityOf(operator([preflight, failed]), "Provisioning").state).toBe("Blocked");
      expect(activityOf(operator([refused]), "Provisioning").state).toBe("Blocked");
    });

    it("reads Blocked a paused kind whose preflight check has a reason of the wrong type, as P33 comes first", () => {
      // The operator writes no `Paused`: one written by hand, next to a reason that is a number.
      const unsure = condition("PreflightCheckPassed", "False", "WaitingForCoreProviderReady", "2025-12-31T23:58:05Z");
      const pausedByHand = condition("Paused", "True", "Paused", "2025-12-31T23:58:06Z");

      expect(activityOf(operator([{ ...unsure, reason: 7 }]), "Provisioning").state).toBe("Unknown");
      expect(activityOf(operator([{ ...unsure, reason: 7 }, pausedByHand]), "Provisioning").state).toBe("Blocked");
    });

    it("reads the wait for the core provider as a step of its activity, Progressing", () => {
      const waiting = condition("PreflightCheckPassed", "False", "WaitingForCoreProviderReady", "2025-12-31T23:58:05Z");

      expect(activityOf(operator([waiting]), "Provisioning")).toMatchObject({
        state: "Progressing",
        condition: { reason: "WaitingForCoreProviderReady" },
      });
    });
  });

  it("for every activity of a paused object, next to Paused, which is never Blocked (P33)", () => {
    // The control plane of upgrading paused: its `Paused` changed to `True`.
    const pausedUpgrade = withCondition(upgrading.kubeadmControlPlane, "Paused", { status: "True", reason: "Paused" });
    const read = activitiesOf(pausedUpgrade, { cluster: upgrading.cluster, machines: [] });

    expect(read.activities.map(({ name, state }) => [name, state])).toEqual([
      ["Paused", "Progressing"],
      ["Upgrading", "Blocked"],
      ["Rolling out", "Blocked"],
      ["Scaling down", "Blocked"],
    ]);
    expect(read.activities.slice(1).every((activity) => activity.tone === "warning")).toBe(true);
  });

  it("for the Rolling out of a Cluster when every part that rolls out is Blocked, as its Provisioning", () => {
    // The MachineDeployment of rolling-out paused by its own annotation, so that each of its activities is Blocked,
    // given as the part of its Cluster, which is not paused.
    const pausedPart = rollingOutPart(
      withMetadata(rollingOut.machineDeployment, { annotations: { "cluster.x-k8s.io/paused": "" } }),
    );
    const context = { machinePools: [], machines: [], healthChecks: [] };

    expect(
      activityOf(rollingOut.cluster, "Rolling out", { ...context, parts: { machineDeployments: [pausedPart] } }),
    ).toMatchObject({ state: "Blocked", tone: "warning" });
    expect(
      activityOf(rollingOut.cluster, "Rolling out", {
        ...context,
        parts: { machineDeployments: [pausedPart, rollingOutPart()] },
      }),
    ).toMatchObject({ state: "Progressing" });
  });

  it("for a deleting object that is paused, which stays so until it is resumed (P33)", () => {
    const pausedDeletion = withCondition(deleting.cluster, "Paused", { status: "True", reason: "Paused" });

    expect(activitiesOf(pausedDeletion).activities.map(({ name, state }) => [name, state])).toEqual([
      ["Deleting", "Blocked"],
      ["Paused", "Progressing"],
    ]);
  });
});

it.each([
  ["a KubeadmControlPlane", scalingUp.kubeadmControlPlane, "Scaling up", { machines: [] }],
  ["a MachineSet", scalingUpHeld.machineSet, "Scaling up", { machines: [] }],
  [
    "a Cluster",
    scalingUpHeld.cluster,
    "Scaling down",
    { machinePools: [], parts: { machineDeployments: [] }, machines: [] },
  ],
] as const)(
  "reads the scale of %s whose message says it is blocked because as Progressing, with its message (D4)",
  (_, object, name, context) => {
    const activity = activityOf(object as KubeObjectData, name, { healthChecks: [], ...context });

    expect(activity.state).toBe("Progressing");
    expect(activity.condition?.message).toContain(" is blocked because");
  },
);

it.each([
  [
    "a KubeadmControlPlane whose certificates are missing",
    healthy.kubeadmControlPlane,
    "Scaling up from 1 to 3 replicas is blocked because:\n* cluster certificates are missing or unknown",
    [healthy.controlPlaneMachine],
  ],
  [
    "a MachineSet whose template is missing",
    healthy.machineSet,
    "Scaling up from 2 to 3 replicas is blocked because:\n* DevMachineTemplate does not exist",
    [healthy.workerMachine, secondWorker],
  ],
  [
    "a MachineDeployment whose template is missing",
    healthy.machineDeployment,
    "Scaling up from 2 to 3 replicas is blocked because DevMachineTemplate does not exist",
    [healthy.workerMachine, secondWorker],
  ],
] as const)(
  "reads the scale up of %s as Progressing, with the message of the project (D4)",
  (_, object, message, machines) => {
    // The object of healthy scaling up with what blocks it: its `ScalingUp` changed to `True` with that message.
    const blocked = withCondition(object as KubeObjectData, "ScalingUp", {
      status: "True",
      reason: "ScalingUp",
      message,
    });

    expect(activityOf(blocked, "Scaling up", { ...ofHealthy, machines: machines as never })).toMatchObject({
      state: "Progressing",
      condition: { message },
    });
  },
);

it("gives the state Unknown to a reason outside the set on a kind of Cluster API, and not on a provider", () => {
  const fast = { status: "True", reason: "ScalingUpQuickly" };

  expect(
    activityOf(withCondition(healthy.machineDeployment, "ScalingUp", fast), "Scaling up", {
      ...ofHealthy,
      machines: [healthy.workerMachine, secondWorker],
    }).state,
  ).toBe("Unknown");
  expect(activityOf(withCondition(providerControlPlane, "ScalingUp", fast), "Scaling up", asControlPlane).state).toBe(
    "Progressing",
  );
});

describe("the duration of each activity (P34)", () => {
  it("runs from the times that the project wrote: the deletion, the transition, the creation", () => {
    expect(activityOf(deleting.cluster, "Deleting").since).toEqual(since("2025-12-31T23:59:47Z"));
    expect(
      activityOf(scalingDown.cluster, "Scaling down", {
        machinePools: [],
        parts: { machineDeployments: [] },
        machines: [],
      }).since,
    ).toEqual(since("2025-12-31T23:59:53Z"));
    expect(activityOf(withoutNode.machine, "Provisioning", { healthChecks: [] }).since).toEqual(
      since("2025-12-31T23:59:41Z"),
    );
  });

  it("is never longer than the age of the object: a start before the creation counts from the creation", () => {
    // The MachineDeployment of healthy scaling up since a time that the clock of its controller wrote before its
    // creation, at 23:58:27.
    const early = withCondition(healthy.machineDeployment, "ScalingUp", {
      status: "True",
      reason: "ScalingUp",
      lastTransitionTime: "2025-12-31T23:50:00Z",
    });

    expect(
      activityOf(early, "Scaling up", { ...ofHealthy, machines: [healthy.workerMachine, secondWorker] }).since,
    ).toEqual(since("2025-12-31T23:58:27Z"));
  });

  it("keeps a start after the time of the evaluation, which the host shows as zero, and counts its threshold from it", () => {
    const later = withCondition(healthy.machineDeployment, "ScalingUp", {
      status: "True",
      reason: "ScalingUp",
      lastTransitionTime: "2026-01-01T00:10:00Z",
    });
    // The Cluster of healthy moved back by 30 minutes, so that the floor of P2 has passed.
    const cluster = withMetadata(healthy.cluster, { creationTimestamp: "2025-12-31T23:00:00Z" });
    const activity = activityOf(later, "Scaling up", {
      ...ofHealthy,
      cluster,
      machines: [healthy.workerMachine, secondWorker],
    });

    expect(activity.since).toEqual(since("2026-01-01T00:10:00Z"));
    expect(activity.threshold?.passesAt).toBe(instant("2026-01-01T00:10:00Z") + 600_000);
  });

  it("has none where the project writes none", () => {
    const pausedByRequest = activityOf(healthy.workerMachine, "Paused", {
      ...ofHealthy,
      cluster: withSpec(healthy.cluster, { paused: true }),
    });

    expect(pausedByRequest.since).toBeUndefined();
    expect(
      activityOf(withSpec(rollingOut.machineDeployment, { paused: true }), "Rollout paused", ofRollingOut).since,
    ).toBeUndefined();
    expect(
      activityOf(upgrading.kubeadmControlPlane, "Upgrading", { cluster: upgrading.cluster, machines: [] }).since,
    ).toBeUndefined();
  });

  it("dates the Provisioning of a MachineDeployment created a year before a rollout from its new Machine", () => {
    const old = withMetadata(rollingOut.machineDeployment, { creationTimestamp: "2025-01-01T00:00:00Z" });

    expect(
      activityOf(old, "Provisioning", { ...ofRollingOut, machines: [rollingOut.oldMachine, rollingOut.newMachine] })
        .since,
    ).toEqual(since("2025-12-31T23:59:40Z"));
  });
});

describe("the notes of the activities", () => {
  it("note each input once, though several rules need it", () => {
    // The MachineSet of remediation needs its Machines for its Provisioning and Replacing, and for its remediation.
    expect(activitiesOf(remediation.machineSet, ofRemediation).notes).toEqual([
      { code: "input-not-given", input: "machines" },
    ]);
  });

  it("note the Cluster that the floor of a threshold needs, when the view did not give it", () => {
    expect(activitiesOf(provisioning.workerMachine, { healthChecks: [provisioning.machineHealthCheck] }).notes).toEqual(
      [{ code: "input-not-given", input: "cluster" }],
    );
  });
});

describe("the earliest time at which the activities change", () => {
  it("is the earliest of the thresholds ahead", () => {
    // The MachineDeployment of rolling-out, whose Cluster is moved back by 30 minutes: its Rolling out, since
    // 23:59:39, ends first.
    const context = {
      cluster: withMetadata(rollingOut.cluster, { creationTimestamp: "2025-12-31T23:00:00Z" }),
      healthChecks: [],
      machines: [rollingOut.oldMachine, rollingOut.newMachine],
    };

    expect(activitiesOf(rollingOut.machineDeployment, context).changesAt).toBe(
      instant("2025-12-31T23:59:39Z") + 600_000,
    );
  });

  it("is the first threshold ahead, past which the tone of a mark changes", () => {
    expect(activitiesOf(deleting.cluster).changesAt).toBe(instant("2025-12-31T23:59:47Z") + 900_000);
    expect(
      activitiesOf(deleting.cluster, { now: instant("2025-12-31T23:59:47Z") + 900_000 }).changesAt,
    ).toBeUndefined();
  });

  it("is the end of the threshold of a Machine of an owner, which ends its Provisioning", () => {
    // The new MachineSet of rolling-out, whose Machine has its Node; its Cluster moved back by 30 minutes.
    const cluster = withMetadata(rollingOut.cluster, { creationTimestamp: "2025-12-31T23:28:20Z" });

    expect(
      activitiesOf(rollingOut.newMachineSet, { cluster, healthChecks: [], machines: [rollingOut.newMachine] })
        .changesAt,
    ).toBe(instant("2025-12-31T23:59:40Z") + 600_000);
  });
});
