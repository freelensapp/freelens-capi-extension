// The tone of the mark of health (SPEC-0003, "Tests", "Unit", and "The tone of the health"; D2, P2, P31): Unhealthy
// and Degraded in the tone of progress, then of a warning past the threshold, and in the tone of their health with
// Idle, Unknown, Paused and Blocked; Healthy and Unknown, whose tone never changes; the thresholds of P2, the floor of
// the 30 minutes of a Cluster and an activity with no start; and what each object takes for its tone: the first
// provisioning of its Cluster, the Machines of an owner, the parts of a Cluster, the Clusters of the bindings of a
// ClusterResourceSet. The objects come from the fixtures of SPEC-0002 (test/status-objects.ts); a case that changes
// one says what it changes.

import { describe, expect, it } from "vitest";
import {
  CAPTURE,
  contextOf,
  healthy,
  machinePools,
  noStatus,
  paused,
  provisioning,
  rollingOut,
  scalingDown,
  upgrading,
  withCondition,
  withMetadata,
  withoutNode,
  withSpec,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { KubeObjectData, MachineObject, ProviderRole, StatusContext, Tone } from "./index";

function toneOf(object: KubeObjectData, context: Partial<StatusContext> = {}): Tone {
  return statusOf(object, contextOf(context)).tone;
}

function instant(text: string): number {
  return Date.parse(text);
}

const minutes = (count: number) => count * 60_000;

// A Cluster created long enough before the capture that the floor of its 30 minutes (P2) has passed: its creation
// moved back to 23:00, the one field that the case changes.
function settled<T extends KubeObjectData>(cluster: T): T {
  return withMetadata(cluster, { creationTimestamp: "2025-12-31T23:00:00Z" });
}

// The second worker of healthy, which the MachineHealthCheck of healthy names in its targets: a copy of the first
// worker with that name.
const secondWorker = withMetadata(healthy.workerMachine, { name: "freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9" });

describe("the tone of an Unhealthy or Degraded health", () => {
  it("is that of progress while an activity is within its threshold, then of a warning, for an Unhealthy Cluster", () => {
    const context = { machinePools: [], parts: { machineDeployments: [] } };
    // The 30 minutes of the Cluster of provisioning, created at 23:59:34.
    const passesAt = instant("2025-12-31T23:59:34Z") + minutes(30);

    expect(toneOf(provisioning.cluster, { ...context, now: passesAt - 1 })).toMatchObject({
      tone: "progress",
      changesAt: passesAt,
    });
    expect(toneOf(provisioning.cluster, { ...context, now: passesAt })).toMatchObject({
      tone: "warning",
      changesAt: undefined,
    });
  });

  it("is that of progress while an activity is within its threshold, then of a warning, for a Degraded MachineDeployment", () => {
    // Its Scaling down, since 23:59:52, lasts the longest of its activities: 15 minutes.
    const context = {
      cluster: settled(rollingOut.cluster),
      healthChecks: [],
      machines: [rollingOut.oldMachine, rollingOut.newMachine],
    };
    const passesAt = instant("2025-12-31T23:59:42Z") + minutes(15);

    expect(statusOf(rollingOut.machineDeployment, contextOf({ ...context, now: passesAt - 1 }))).toMatchObject({
      health: { health: "Degraded" },
      tone: { tone: "progress", changesAt: passesAt },
    });
    expect(statusOf(rollingOut.machineDeployment, contextOf({ ...context, now: passesAt }))).toMatchObject({
      health: { health: "Degraded" },
      tone: { tone: "warning" },
    });
  });

  it("is that of its health when it is Idle", () => {
    // The new Machine of rolling-out once past its threshold: it has its Node, is not available, and is Idle.
    const context = { cluster: settled(rollingOut.cluster), healthChecks: [], now: CAPTURE + minutes(20) };
    const status = statusOf(rollingOut.newMachine, contextOf(context));

    expect(status.health.health).toBe("Unhealthy");
    expect(status.activities).toMatchObject({ activities: [], idle: true });
    expect(status.tone).toEqual({ state: "read", tone: "health", setBy: undefined, changesAt: undefined, notes: [] });
  });

  it("is that of its health when its activity is Unknown", () => {
    // The MachineSet of without-node, whose Machines the view did not give, of a Cluster whose control plane is
    // initialized: the Cluster of healthy.
    const status = statusOf(withoutNode.machineSet, contextOf({ cluster: healthy.cluster, healthChecks: [] }));

    expect(status.health.health).toBe("Unhealthy");
    expect(status.activities).toMatchObject({ activities: [], unknown: true });
    expect(status.tone.tone).toBe("health");
  });

  it("is that of its health while it is Paused, its other activities Blocked, and takes nothing (P33)", () => {
    // The MachineDeployment of paused scaling up and not available: its `ScalingUp` and its `Available` changed.
    const scaling = withCondition(
      withCondition(paused.machineDeployment, "ScalingUp", { status: "True", reason: "ScalingUp" }),
      "Available",
      { status: "False", reason: "NotAvailable" },
    );
    const status = statusOf(
      scaling,
      contextOf({ cluster: paused.cluster, machines: [paused.workerMachine], healthChecks: [] }),
    );

    expect(status.health.health).toBe("Unhealthy");
    expect(status.activities).toMatchObject({
      activities: [
        { name: "Paused", state: "Progressing" },
        { name: "Scaling up", state: "Blocked" },
      ],
    });
    expect(status.tone.tone).toBe("health");
  });

  it("is that of its health when its activity is Blocked", () => {
    // The worker of healthy whose in-place update failed, past its threshold: its `Updating` and `Ready` changed.
    const failed = withCondition(
      withCondition(healthy.workerMachine, "Updating", { status: "True", reason: "InPlaceUpdateFailed" }),
      "Ready",
      { status: "False", reason: "NotReady" },
    );
    const context = { cluster: settled(healthy.cluster), healthChecks: [], now: CAPTURE + minutes(20) };
    const status = statusOf(failed, contextOf(context));

    expect(status.health.health).toBe("Unhealthy");
    expect(status.activities).toMatchObject({ activities: [{ name: "Updating", state: "Blocked" }] });
    expect(status.tone.tone).toBe("health");
  });
});

describe("the tone of a Healthy or Unknown health", () => {
  it("never changes, whatever is in progress", () => {
    // The MachineDeployment of healthy scaling up, still Healthy: its `ScalingUp` changed to `True`.
    const scaling = withCondition(healthy.machineDeployment, "ScalingUp", { status: "True", reason: "ScalingUp" });
    const context = { cluster: healthy.cluster, healthChecks: [], machines: [healthy.workerMachine, secondWorker] };

    for (const now of [CAPTURE, CAPTURE + 86_400_000]) {
      expect(statusOf(scaling, contextOf({ ...context, now }))).toMatchObject({
        health: { health: "Healthy" },
        activities: { activities: [{ name: "Scaling up" }] },
        tone: { tone: "health", setBy: undefined, changesAt: undefined },
      });
      expect(statusOf(withoutNode.machine, contextOf({ healthChecks: [], now }))).toMatchObject({
        health: { health: "Unknown" },
        activities: { activities: [{ name: "Provisioning" }] },
        tone: { tone: "health", setBy: undefined },
      });
    }
  });

  it("is that of the health for an object with no health, also a deleting owner whose Machines provision", () => {
    const none: Tone = { state: "read", tone: "health", setBy: undefined, changesAt: undefined, notes: [] };
    // The MachineDeployment of provisioning, deleting while its worker and its Cluster still provision: its deletion
    // time set to 23:59:59, the one field that the case changes.
    const deletingOwner = withMetadata(provisioning.machineDeployment, { deletionTimestamp: "2025-12-31T23:59:59Z" });
    const context = { cluster: provisioning.cluster, healthChecks: [], machines: [provisioning.workerMachine] };

    expect(toneOf(healthy.binding)).toEqual(none);
    expect(statusOf(deletingOwner, contextOf(context))).toMatchObject({
      health: { health: "none", because: "deleting" },
      activities: { activities: [{ name: "Deleting" }] },
      tone: none,
    });
  });
});

describe("the thresholds (P2)", () => {
  describe("of one Machine", () => {
    // The Machine of without-node, which provisions, and MachineHealthChecks of its namespace written for each case
    // from the one of healthy, with the timeout and the targets that the case gives.
    const check = (seconds: number, name = "check", targets: readonly string[] = [withoutNode.machine.metadata.name]) =>
      withStatus(
        withSpec(withMetadata(healthy.machineHealthCheck, { name, namespace: "freelens-capi-without-node" }), {
          checks: { nodeStartupTimeoutSeconds: seconds },
        }),
        { targets },
      );
    const secondsWith = (healthChecks: readonly KubeObjectData[] | undefined) => {
      const { activities } = statusOf(withoutNode.machine, contextOf({ healthChecks: healthChecks as never }));

      return activities.state === "read" ? activities.activities[0]?.threshold?.seconds : undefined;
    };

    it("is the shortest timeout above zero of the MachineHealthChecks whose targets name it", () => {
      expect(secondsWith([check(450, "a"), check(300, "b")])).toBe(300);
      expect(secondsWith([check(0, "a"), check(450, "b")])).toBe(450);
    });

    it("is 600 seconds with one or every MachineHealthCheck at 0, with none, and with none that names it", () => {
      expect(secondsWith([check(0, "a")])).toBe(600);
      expect(secondsWith([check(0, "a"), check(0, "b")])).toBe(600);
      expect(secondsWith([])).toBe(600);
      expect(secondsWith([check(300, "a", ["another-machine"])])).toBe(600);
    });

    it("counts only a MachineHealthCheck of the namespace of the Machine", () => {
      const elsewhere = withMetadata(check(300, "a"), { namespace: "freelens-capi-healthy" });

      expect(secondsWith([elsewhere])).toBe(600);
    });

    it("is 600 seconds, noted, when the view gave no MachineHealthChecks", () => {
      expect(secondsWith(undefined)).toBe(600);
      expect(statusOf(withoutNode.machine, contextOf()).notes).toContainEqual({
        code: "input-not-given",
        input: "healthChecks",
      });
    });
  });

  describe("of the Machine that an object serves or takes", () => {
    // A MachineHealthCheck of healthy that gives the control plane Machine 300 seconds to start, written for the
    // case from the one of healthy.
    const quick = withStatus(
      withSpec(withMetadata(healthy.machineHealthCheck, { name: "control-plane" }), {
        checks: { nodeStartupTimeoutSeconds: 300 },
      }),
      { targets: [healthy.controlPlaneMachine.metadata.name] },
    );
    const context = { cluster: healthy.cluster, healthChecks: [quick], machines: [healthy.controlPlaneMachine] };
    const secondsOf = (object: KubeObjectData, more: Partial<StatusContext> = {}) => {
      const { activities } = statusOf(object, contextOf({ ...context, ...more }));

      return activities.state === "read" ? activities.activities.map((each) => each.threshold?.seconds) : [];
    };

    it("is that of its Machine for a KubeadmConfig, an infrastructure machine and a bootstrap config", () => {
      // The KubeadmConfig and the DevMachine of the control plane of healthy before they are ready: their
      // `status.initialization` emptied.
      const config = withStatus(healthy.kubeadmConfig, { initialization: {} });
      const devMachine = withStatus(healthy.devMachine, { initialization: {} });
      const as = (role: ProviderRole) => ({ role, provider: "infrastructure-docker", contract: "v1beta2" as const });

      expect(secondsOf(config)).toEqual([300]);
      expect(secondsOf(devMachine, as("infrastructure-machine"))).toEqual([300]);
      expect(secondsOf(devMachine, as("bootstrap-config"))).toEqual([300]);
      expect(secondsOf(withStatus(healthy.devCluster, { initialization: {} }), as("infrastructure-cluster"))).toEqual([
        600,
      ]);
    });

    it("is the shortest of those of its Machines for a Cluster", () => {
      // The Cluster of healthy scaling up: its `ScalingUp` changed to `True`. Its control plane Machine has 300
      // seconds, and its worker, which no MachineHealthCheck of the case names, 600.
      const scaling = withCondition(healthy.cluster, "ScalingUp", { status: "True", reason: "ScalingUp" });

      expect(
        secondsOf(scaling, {
          machinePools: [],
          parts: { machineDeployments: [] },
          machines: [healthy.workerMachine, healthy.controlPlaneMachine],
        }),
      ).toEqual([300]);
    });
  });

  it("dates an owner from its oldest Machine, and takes each Machine with its own start and threshold", () => {
    // The MachineSet of without-node at two replicas, with a second Machine created five minutes after the first,
    // both without a Node, of a Cluster whose 30 minutes have passed: the Cluster of healthy, moved back.
    const younger = withMetadata(withoutNode.machine, {
      name: "freelens-capi-without-node-without-node-r2xk7",
      creationTimestamp: "2026-01-01T00:04:41Z",
    });
    const owner = withSpec(withoutNode.machineSet, { replicas: 2 });
    const context = {
      cluster: settled(healthy.cluster),
      healthChecks: [],
      machines: [withoutNode.machine, younger],
      now: instant("2025-12-31T23:59:41Z") + minutes(12),
    };
    const status = statusOf(owner, contextOf(context));

    // The owner's own Provisioning dates from the oldest Machine and is past its threshold; the younger Machine
    // keeps the tone in progress until its own threshold.
    expect(status.activities).toMatchObject({
      activities: [{ name: "Provisioning", since: { text: "2025-12-31T23:59:41Z" }, tone: "warning" }],
    });
    expect(status.tone).toMatchObject({
      tone: "progress",
      setBy: { activity: { name: "Provisioning" }, heldBy: { name: younger.metadata.name } },
      changesAt: instant("2026-01-01T00:04:41Z") + minutes(10),
    });
  });

  describe("of an in-place update, at 9 and at 11 minutes from the transition of Updating", () => {
    // The MachineSet of healthy during an in-place update of its first worker, which its counters leave out: its
    // `status.availableReplicas` changed to 1; the worker with `Updating` `True` since 00:05, and its `Ready` and
    // `Available` `False`, as its `Updating` makes them. The MachineSet itself does nothing: it is Idle.
    const updating = withCondition(
      withCondition(
        withCondition(healthy.workerMachine, "Updating", {
          status: "True",
          reason: "InPlaceUpdating",
          lastTransitionTime: "2026-01-01T00:05:00Z",
        }),
        "Ready",
        { status: "False", reason: "NotReady" },
      ),
      "Available",
      { status: "False", reason: "NotReady" },
    );
    const owner = withStatus(healthy.machineSet, { availableReplicas: 1 });
    const context = { cluster: settled(healthy.cluster), healthChecks: [], machines: [updating, secondWorker] };

    it("is in the tone of progress at 9 minutes, Unhealthy and Idle", () => {
      const status = statusOf(owner, contextOf({ ...context, now: instant("2026-01-01T00:14:00Z") }));

      expect(status.health.health).toBe("Unhealthy");
      expect(status.activities).toMatchObject({ activities: [], idle: true });
      expect(status.tone).toMatchObject({
        tone: "progress",
        setBy: { activity: { name: "Updating" }, heldBy: { name: healthy.workerMachine.metadata.name } },
        changesAt: instant("2026-01-01T00:15:00Z"),
      });
    });

    it("is in the tone of a warning at 11 minutes", () => {
      expect(toneOf(owner, { ...context, now: instant("2026-01-01T00:16:00Z") })).toMatchObject({
        tone: "warning",
        setBy: { activity: { name: "Updating" } },
      });
    });
  });

  describe("an owner takes the Updating of its Machines, which is no activity of its own", () => {
    // Each owner of healthy not available while a Machine of it updates in place since 00:15, read at 00:20, past
    // the threshold of the Machine's own Provisioning and of the floor of its Cluster, moved back: the condition or
    // the counter of each owner changed, and the Machine updating as in the case above.
    const updatingSince = (machine: MachineObject) =>
      withCondition(
        withCondition(
          withCondition(machine, "Updating", {
            status: "True",
            reason: "InPlaceUpdating",
            lastTransitionTime: "2026-01-01T00:15:00Z",
          }),
          "Ready",
          { status: "False", reason: "NotReady" },
        ),
        "Available",
        { status: "False", reason: "NotReady" },
      );
    const now = instant("2026-01-01T00:20:00Z");

    it.each([
      [
        "a MachineDeployment",
        withCondition(healthy.machineDeployment, "Available", { status: "False", reason: "NotAvailable" }),
        [updatingSince(healthy.workerMachine), secondWorker],
      ],
      [
        "a KubeadmControlPlane",
        withCondition(healthy.kubeadmControlPlane, "Available", { status: "False", reason: "NotAvailable" }),
        [updatingSince(healthy.controlPlaneMachine)],
      ],
      ["a MachinePool", machinePools.machinePool, [updatingSince(machinePools.poolMachine)]],
    ] as const)("%s", (_, owner, machines) => {
      const context = { cluster: settled(healthy.cluster), healthChecks: [], machines: machines as never, now };
      const status = statusOf(owner as KubeObjectData, contextOf(context));

      expect(status.health.health).toBe("Unhealthy");
      expect(status.tone).toMatchObject({ tone: "progress", setBy: { activity: { name: "Updating" } } });
    });
  });

  it("of Replacing, at 15 minutes less one second and at 15 minutes and one second from the oldest deletion", () => {
    // The MachineSet of healthy one Machine short: its first worker deleted by hand at 23:59:50, and its
    // `status.availableReplicas` changed to 1.
    const deleted = withMetadata(healthy.workerMachine, { deletionTimestamp: "2025-12-31T23:59:50Z" });
    const owner = withStatus(healthy.machineSet, { availableReplicas: 1 });
    const context = { cluster: settled(healthy.cluster), healthChecks: [], machines: [deleted, secondWorker] };
    const passesAt = instant("2025-12-31T23:59:50Z") + minutes(15);

    expect(toneOf(owner, { ...context, now: passesAt - 1000 })).toMatchObject({
      tone: "progress",
      setBy: { activity: { name: "Replacing" } },
    });
    expect(toneOf(owner, { ...context, now: passesAt + 1000 })).toMatchObject({ tone: "warning" });
  });

  it("of Scaling down, from its transition", () => {
    // The MachineDeployment of scaling-down with the Machine that it keeps, a copy of the worker of healthy in its
    // namespace, so that it is not one Machine short.
    const kept = withMetadata(healthy.workerMachine, {
      name: "freelens-capi-scaling-down-md-0-97cl7-8p6v4-kept1",
      namespace: "freelens-capi-scaling-down",
    });
    const context = {
      cluster: settled(scalingDown.cluster),
      healthChecks: [],
      machines: [scalingDown.deletingMachine, kept],
    };
    const passesAt = instant("2025-12-31T23:59:52Z") + minutes(15);

    expect(toneOf(scalingDown.machineDeployment, { ...context, now: passesAt - 1000 })).toMatchObject({
      tone: "progress",
      setBy: { activity: { name: "Scaling down" } },
    });
    expect(toneOf(scalingDown.machineDeployment, { ...context, now: passesAt + 1000 }).tone).toBe("warning");
  });

  it("of the own Provisioning of a Cluster, at 29 and at 31 minutes", () => {
    const context = { machinePools: [], parts: { machineDeployments: [] } };
    const created = instant("2025-12-31T23:59:34Z");

    expect(toneOf(provisioning.cluster, { ...context, now: created + minutes(29) }).tone).toBe("progress");
    expect(toneOf(provisioning.cluster, { ...context, now: created + minutes(31) }).tone).toBe("warning");
  });

  it("keeps a worker Machine created one minute after its Cluster in the tone of progress at minute 25", () => {
    // The new Machine of rolling-out, created at 23:59:40, and its Cluster created a minute before it: the
    // creation of the Cluster moved, the one field that the case changes. The Machine has its Node and is not
    // available: past its own threshold of 10 minutes, it is within the 30 minutes of its Cluster.
    const cluster = withMetadata(rollingOut.cluster, { creationTimestamp: "2025-12-31T23:58:40Z" });
    const context = { cluster, healthChecks: [] };
    const created = instant("2025-12-31T23:58:40Z");

    expect(statusOf(rollingOut.newMachine, contextOf({ ...context, now: created + minutes(25) }))).toMatchObject({
      activities: {
        activities: [{ name: "Provisioning", threshold: { seconds: 600, passesAt: created + minutes(30) } }],
      },
      tone: { tone: "progress" },
    });
    expect(toneOf(rollingOut.newMachine, { ...context, now: created + minutes(31) }).tone).toBe("health");
  });

  it("keeps the tone of progress while one of several activities is within its threshold", () => {
    // At 00:12, the Rolling out of the MachineDeployment of rolling-out has passed its 10 minutes, and its Scaling
    // down is within its 15.
    const context = {
      cluster: settled(rollingOut.cluster),
      healthChecks: [],
      machines: [rollingOut.oldMachine, rollingOut.newMachine],
      now: instant("2026-01-01T00:12:00Z"),
    };
    const status = statusOf(rollingOut.machineDeployment, contextOf(context));

    expect(status.activities).toMatchObject({
      activities: [
        { name: "Rolling out", tone: "warning" },
        { name: "Scaling down", tone: "progress" },
      ],
    });
    expect(status.tone).toMatchObject({ tone: "progress", setBy: { activity: { name: "Scaling down" } } });
  });

  it("gives no tone of progress for an activity whose start the project did not write", () => {
    // The control plane of upgrading with neither its rollout nor its scale written: its `RollingOut` and
    // `ScalingDown` changed to `False`. Its Upgrading has no start.
    const upgradingOnly = withCondition(
      withCondition(upgrading.kubeadmControlPlane, "RollingOut", { status: "False", reason: "NotRollingOut" }),
      "ScalingDown",
      { status: "False", reason: "NotScalingDown" },
    );
    const status = statusOf(upgradingOnly, contextOf({ cluster: upgrading.cluster, machines: [], healthChecks: [] }));

    expect(status.activities).toMatchObject({ activities: [{ name: "Upgrading", since: undefined }] });
    expect(status.tone).toMatchObject({ tone: "warning", setBy: { activity: { name: "Upgrading" } } });
  });

  it("is 600 seconds for a kind of the operator, from its creation", () => {
    // A kind of the operator installing, written from its schema, which waits for the core provider.
    const installing = {
      apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
      kind: "BootstrapProvider",
      metadata: {
        name: "kubeadm",
        namespace: "capi-kubeadm-bootstrap-system",
        creationTimestamp: "2025-12-31T23:58:00Z",
      },
      spec: { version: "v1.14.4" },
      status: { conditions: [] },
    };
    const passesAt = instant("2025-12-31T23:58:00Z") + 600_000;
    const at = (now: number) => statusOf(installing, contextOf({ now }));

    expect(at(passesAt - 1).activities).toMatchObject({ activities: [{ name: "Provisioning", tone: "progress" }] });
    expect(at(passesAt).activities).toMatchObject({ activities: [{ name: "Provisioning", tone: "warning" }] });
    expect(at(passesAt).tone.tone).toBe("health");
  });

  it("names the earliest time at which the tone changes: the end of the last activity within its threshold", () => {
    const context = {
      cluster: settled(rollingOut.cluster),
      healthChecks: [],
      machines: [rollingOut.oldMachine, rollingOut.newMachine],
    };

    expect(toneOf(rollingOut.machineDeployment, context).changesAt).toBe(instant("2025-12-31T23:59:42Z") + minutes(15));
    expect(toneOf(rollingOut.machineDeployment, { ...context, now: CAPTURE + minutes(20) }).changesAt).toBeUndefined();
  });
});

describe("what an object takes for its tone (D2)", () => {
  it("a Machine with a Node that is not yet Ready or Available, while young, and not past its threshold", () => {
    const context = { cluster: settled(rollingOut.cluster), healthChecks: [] };
    const passesAt = instant("2025-12-31T23:59:40Z") + minutes(10);

    expect(toneOf(rollingOut.newMachine, { ...context, now: passesAt - 1 }).tone).toBe("progress");
    expect(toneOf(rollingOut.newMachine, { ...context, now: passesAt }).tone).toBe("health");
  });

  it("a Machine that waits for minReadySeconds, Healthy itself, seen from its MachineSet and its MachineDeployment", () => {
    // The first worker of healthy waiting for an hour of minReadySeconds since its `Ready` turned `True` at
    // 23:59:39: its `Available` changed to the wait, and `spec.minReadySeconds` set. Its MachineSet and its
    // MachineDeployment count it as not available: `status.availableReplicas` of the first changed to 1, and the
    // `Available` of the second changed to `False`.
    const waiting = withSpec(
      withCondition(healthy.workerMachine, "Available", { status: "False", reason: "WaitingForMinReadySeconds" }),
      { minReadySeconds: 3600 },
    );
    const machineSet = withStatus(healthy.machineSet, { availableReplicas: 1 });
    const machineDeployment = withCondition(healthy.machineDeployment, "Available", {
      status: "False",
      reason: "NotAvailable",
      message:
        "1 available replicas, at least 2 required (spec.strategy.rollout.maxUnavailable is 0, spec.replicas is 2)",
    });
    const context = { cluster: settled(healthy.cluster), healthChecks: [], machines: [waiting, secondWorker] };
    const end = instant("2025-12-31T23:59:39Z") + minutes(60);

    expect(statusOf(waiting, contextOf({ ...context, now: end - 1 }))).toMatchObject({
      health: { health: "Healthy" },
      tone: { tone: "health" },
    });
    for (const owner of [machineSet, machineDeployment]) {
      expect(statusOf(owner, contextOf({ ...context, now: end - 1 }))).toMatchObject({
        health: { health: "Unhealthy" },
        tone: { tone: "progress", setBy: { activity: { name: "Provisioning" } }, changesAt: end },
      });
      expect(toneOf(owner, { ...context, now: end }).tone).toBe("warning");
    }
  });

  it("a KubeadmControlPlane of one replica, before its initialization the first provisioning of its Cluster", () => {
    // The control plane of provisioning before its first Machine is created.
    const status = statusOf(
      provisioning.kubeadmControlPlane,
      contextOf({ cluster: provisioning.cluster, machines: [], healthChecks: [] }),
    );

    expect(status.health.health).toBe("Unhealthy");
    expect(status.activities).toMatchObject({ activities: [], idle: true });
    expect(status.tone).toMatchObject({
      tone: "progress",
      setBy: {
        activity: { name: "Provisioning", condition: { type: "ControlPlaneInitialized" } },
        heldBy: { kind: "Cluster", name: provisioning.cluster.metadata.name },
      },
      changesAt: instant("2025-12-31T23:59:34Z") + minutes(30),
    });
  });

  it("a KubeadmControlPlane of one replica, after its initialization that of its Machine until it is Available", () => {
    // The Cluster of provisioning with its control plane initialized, and moved back so that its 30 minutes have
    // passed: its `ControlPlaneInitialized` and its creation changed. The control plane Machine with its Node, not
    // available yet: its `status.nodeRef` set, its phase `Running`; and once Available.
    const cluster = withCondition(settled(provisioning.cluster), "ControlPlaneInitialized", {
      status: "True",
      reason: "Initialized",
    });
    const joined = withStatus(provisioning.controlPlaneMachine, {
      phase: "Running",
      nodeRef: { name: provisioning.controlPlaneMachine.metadata.name },
    });
    const available = withCondition(joined, "Available", { status: "True", reason: "Available" });
    const at = (machine: MachineObject) =>
      statusOf(provisioning.kubeadmControlPlane, contextOf({ cluster, machines: [machine], healthChecks: [] }));

    expect(at(joined)).toMatchObject({
      health: { health: "Unhealthy" },
      tone: { tone: "progress", setBy: { activity: { name: "Provisioning", source: { kind: "Machine" } } } },
    });
    expect(at(available).tone.tone).toBe("health");
  });

  it("an object of a Cluster, in the tone of its first provisioning, and not after its control plane is initialized", () => {
    // The DevMachine of provisioning, provisioned and Unhealthy while it bootstraps, which does nothing itself.
    const context = {
      role: "infrastructure-machine",
      provider: "infrastructure-docker",
      contract: "v1beta2",
      healthChecks: [],
      machines: [provisioning.controlPlaneMachine],
    } as const;
    const initialized = withCondition(provisioning.cluster, "ControlPlaneInitialized", {
      status: "True",
      reason: "Initialized",
    });

    expect(statusOf(provisioning.devMachine, contextOf({ ...context, cluster: provisioning.cluster }))).toMatchObject({
      health: { health: "Unhealthy" },
      activities: { activities: [], idle: true },
      tone: { tone: "progress", setBy: { heldBy: { kind: "Cluster" } } },
    });
    expect(toneOf(provisioning.devMachine, { ...context, cluster: initialized }).tone).toBe("health");
  });

  it("an IPAddressClaim of a Cluster in its first provisioning", () => {
    // A claim that its provider reports not ready, written from the schema of the release, since the test
    // environment has no IPAM provider, of the Cluster of provisioning.
    const claim = withStatus(noStatus.ipAddressClaim, {
      conditions: [
        {
          type: "Ready",
          status: "False",
          reason: "PoolNotReady",
          message: "",
          lastTransitionTime: "2025-12-31T23:59:50Z",
          observedGeneration: 1,
        },
      ],
    });

    expect(statusOf(claim, contextOf({ cluster: provisioning.cluster, provider: "ipam-test" }))).toMatchObject({
      health: { health: "Unhealthy" },
      tone: { tone: "progress", setBy: { heldBy: { kind: "Cluster" } } },
    });
  });

  describe("nothing from a first provisioning that does not lend its tone", () => {
    // The control plane of provisioning before its first Machine, with its Cluster changed as each case says.
    const toneWith = (cluster: KubeObjectData, object: KubeObjectData = provisioning.kubeadmControlPlane) =>
      toneOf(object, { cluster: cluster as never, machines: [], healthChecks: [] });

    it.each([
      [
        "paused by its own annotation, which pauses it alone",
        withMetadata(provisioning.cluster, { annotations: { "cluster.x-k8s.io/paused": "" } }),
      ],
      [
        "whose creation a hook holds",
        withCondition(provisioning.cluster, "TopologyReconciled", { status: "False", reason: "ClusterCreating" }),
      ],
      [
        "whose ControlPlaneInitialized is Unknown",
        withCondition(provisioning.cluster, "ControlPlaneInitialized", { status: "Unknown", reason: "InternalError" }),
      ],
      ["that is deleting", withMetadata(provisioning.cluster, { deletionTimestamp: "2025-12-31T23:59:59Z" })],
    ])("of a Cluster %s", (_, cluster) => {
      expect(toneWith(cluster)).toMatchObject({ tone: "health", setBy: undefined });
    });

    it("for an object that is paused itself", () => {
      // The control plane of provisioning paused: its `Paused` changed to `True`.
      const pausedControlPlane = withCondition(provisioning.kubeadmControlPlane, "Paused", {
        status: "True",
        reason: "Paused",
      });

      expect(toneWith(provisioning.cluster, pausedControlPlane)).toMatchObject({ tone: "health" });
    });
  });

  it("an owner notes the inputs that its Machines need for their tone", () => {
    expect(
      toneOf(withoutNode.machineSet, { cluster: healthy.cluster, machines: [withoutNode.machine] }).notes,
    ).toContainEqual({
      code: "input-not-given",
      input: "healthChecks",
    });
  });

  it("notes the Cluster that the view did not give, which it needs for its tone", () => {
    expect(
      statusOf(
        provisioning.devMachine,
        contextOf({ role: "infrastructure-machine", provider: "infrastructure-docker", contract: "v1beta2" }),
      ).tone,
    ).toMatchObject({
      tone: "health",
      notes: [{ code: "input-not-given", input: "cluster" }],
    });
  });

  it("a Cluster through a part, while the part has an activity in progress", () => {
    // The Cluster of healthy Degraded from its workers, moved back so that its 30 minutes have passed, with its
    // MachineDeployment scaling up: the condition of each changed.
    const cluster = withCondition(settled(healthy.cluster), "WorkerMachinesReady", {
      status: "False",
      reason: "NotReady",
    });
    const scaling = withCondition(healthy.machineDeployment, "ScalingUp", {
      status: "True",
      reason: "ScalingUp",
      lastTransitionTime: "2025-12-31T23:59:50Z",
    });
    const part = statusOf(
      scaling,
      contextOf({ cluster, healthChecks: [], machines: [healthy.workerMachine, secondWorker] }),
    );
    const status = statusOf(
      cluster,
      contextOf({ machinePools: [], parts: { machineDeployments: [part] }, machines: [] }),
    );

    expect(status.health.health).toBe("Degraded");
    expect(status.activities).toMatchObject({ activities: [], idle: true });
    expect(status.tone).toMatchObject({
      tone: "progress",
      setBy: { activity: { name: "Scaling up" }, heldBy: { kind: "MachineDeployment" } },
    });
  });

  it("a Cluster takes the activity that sets the tone of a part, though it is no activity of the part", () => {
    // The MachineDeployment of healthy not available while its first worker updates in place since 23:59:50, and its
    // Cluster Degraded from its workers, moved back so that its 30 minutes have passed: the condition of each
    // changed, and the worker as in the case of the in-place update.
    const cluster = withCondition(settled(healthy.cluster), "WorkerMachinesReady", {
      status: "False",
      reason: "NotReady",
    });
    const updating = withCondition(
      withCondition(
        withCondition(healthy.workerMachine, "Updating", {
          status: "True",
          reason: "InPlaceUpdating",
          lastTransitionTime: "2026-01-01T00:15:00Z",
        }),
        "Ready",
        { status: "False", reason: "NotReady" },
      ),
      "Available",
      { status: "False", reason: "NotReady" },
    );
    const deployment = withCondition(healthy.machineDeployment, "Available", {
      status: "False",
      reason: "NotAvailable",
    });
    const now = instant("2026-01-01T00:20:00Z");
    const part = statusOf(
      deployment,
      contextOf({ cluster, healthChecks: [], machines: [updating, secondWorker], now }),
    );
    const status = statusOf(
      cluster,
      contextOf({ machinePools: [], parts: { machineDeployments: [part] }, machines: [], now }),
    );

    expect(part.activities).toMatchObject({ activities: [] });
    expect(part.tone).toMatchObject({ tone: "progress", setBy: { activity: { name: "Updating" } } });
    expect(status.tone).toMatchObject({
      tone: "progress",
      setBy: { activity: { name: "Updating" }, heldBy: { kind: "Machine" } },
    });
  });

  it("a part lends its tone to its Cluster, never to a sibling", () => {
    // The Cluster of healthy not available while its MachineDeployment scales up, moved back so that its 30 minutes
    // have passed; the MachineDeployment not available; and an unrelated KubeadmConfig that is not ready: the
    // condition of each changed.
    const cluster = withCondition(settled(healthy.cluster), "Available", { status: "False", reason: "NotAvailable" });
    const scaling = withCondition(
      withCondition(healthy.machineDeployment, "ScalingUp", { status: "True", reason: "ScalingUp" }),
      "Available",
      { status: "False", reason: "NotAvailable" },
    );
    const config = withCondition(healthy.kubeadmConfig, "Ready", { status: "False", reason: "NotReady" });
    const context = { cluster, healthChecks: [], machines: [healthy.workerMachine, secondWorker] };
    const part = statusOf(scaling, contextOf(context));

    expect(part).toMatchObject({ health: { health: "Unhealthy" }, tone: { tone: "progress" } });
    expect(
      statusOf(cluster, contextOf({ machinePools: [], parts: { machineDeployments: [part] }, machines: [] })),
    ).toMatchObject({ health: { health: "Unhealthy" }, tone: { tone: "progress" } });
    expect(
      statusOf(config, contextOf({ cluster, healthChecks: [], machines: [healthy.controlPlaneMachine] })),
    ).toMatchObject({ health: { health: "Unhealthy" }, tone: { tone: "health" } });
  });

  describe("a ClusterResourceSet during the creation of a Cluster that it selects", () => {
    const bound = (cluster: KubeObjectData) => ({
      bindings: [{ binding: provisioning.binding, cluster: cluster as never }],
    });

    it("is Unhealthy in the tone of progress while that Cluster is in its first provisioning and cannot be reached", () => {
      expect(statusOf(provisioning.clusterResourceSet, contextOf(bound(provisioning.cluster)))).toMatchObject({
        health: { health: "Unhealthy" },
        activities: { activities: [], idle: true },
        tone: {
          tone: "progress",
          setBy: {
            activity: { name: "Provisioning" },
            heldBy: { kind: "Cluster", name: "freelens-capi-provisioning" },
          },
          changesAt: instant("2025-12-31T23:59:34Z") + minutes(30),
        },
      });
    });

    it("is in the tone of a warning past the 30 minutes of that Cluster", () => {
      const context = { ...bound(provisioning.cluster), now: instant("2025-12-31T23:59:34Z") + minutes(30) };

      expect(toneOf(provisioning.clusterResourceSet, context).tone).toBe("warning");
    });

    it("is in the tone of its health once that Cluster can be reached, or is past its first provisioning", () => {
      // The Cluster of provisioning once its probe succeeds, and once its control plane is initialized.
      const reached = withCondition(provisioning.cluster, "RemoteConnectionProbe", {
        status: "True",
        reason: "ProbeSucceeded",
      });
      const initialized = withCondition(provisioning.cluster, "ControlPlaneInitialized", {
        status: "True",
        reason: "Initialized",
      });

      expect(toneOf(provisioning.clusterResourceSet, bound(reached)).tone).toBe("health");
      expect(toneOf(provisioning.clusterResourceSet, bound(initialized)).tone).toBe("health");
    });

    it("takes nothing from a binding that holds no entry for it", () => {
      // The binding of the Cluster of provisioning with the entry of another ClusterResourceSet alone.
      const other = withSpec(provisioning.binding, { bindings: [{ clusterResourceSetName: "another-set" }] });

      expect(
        toneOf(provisioning.clusterResourceSet, { bindings: [{ binding: other, cluster: provisioning.cluster }] }),
      ).toMatchObject({ tone: "health", setBy: undefined });
    });

    it("notes the Cluster of a binding that the view did not give", () => {
      expect(toneOf(provisioning.clusterResourceSet, { bindings: [{ binding: provisioning.binding }] })).toMatchObject({
        tone: "health",
        notes: [{ code: "input-not-given", input: "cluster" }],
      });
    });
  });

  it("carries the activity that sets the tone, with the object that holds it", () => {
    expect(toneOf(provisioning.cluster, { machinePools: [], parts: { machineDeployments: [] } }).setBy).toEqual({
      activity: {
        name: "Provisioning",
        state: "Progressing",
        since: { state: "accepted", text: "2025-12-31T23:59:34Z", instant: instant("2025-12-31T23:59:34Z") },
        threshold: { seconds: 1800, passesAt: instant("2025-12-31T23:59:34Z") + minutes(30) },
        tone: "progress",
        condition: expect.objectContaining({ type: "ControlPlaneInitialized", status: "False" }),
        source: undefined,
      },
      heldBy: {
        apiVersion: "cluster.x-k8s.io/v1beta2",
        kind: "Cluster",
        name: "freelens-capi-provisioning",
        namespace: "freelens-capi-provisioning",
      },
    });
  });
});

it("is that of a warning, noted, with no time of the evaluation that is a number", () => {
  const status = statusOf(
    provisioning.cluster,
    contextOf({ machinePools: [], parts: { machineDeployments: [] }, now: Number.NaN }),
  );

  expect(status.tone).toMatchObject({ tone: "warning", notes: [{ code: "field-unreadable", field: "now" }] });
  expect(status.activities).toMatchObject({ activities: [{ name: "Provisioning", tone: "warning" }] });
});

describe("a control plane that scales up for good, as the trial of S7 showed", () => {
  // The control plane of provisioning whose Cluster has no endpoint: it writes `ScalingUp` `True` from its first
  // status, 4 seconds after its creation, and creates no Machine, for good (the trial of S7 of SPEC-0003, case 3).
  // Its `ScalingUp` changed so, the one condition the case changes.
  const stuck = withCondition(provisioning.kubeadmControlPlane, "ScalingUp", {
    status: "True",
    reason: "ScalingUp",
    message: "Scaling up from 0 to 1 replicas",
    lastTransitionTime: "2025-12-31T23:59:38Z",
  });
  const at = (now: number) =>
    statusOf(stuck, contextOf({ cluster: provisioning.cluster, machines: [], healthChecks: [], now }));
  const passesAt = instant("2025-12-31T23:59:34Z") + minutes(30);

  it("reads Scaling up, Progressing, in the tone of progress within the 30 minutes of its Cluster", () => {
    expect(at(passesAt - 1)).toMatchObject({
      health: { health: "Unhealthy" },
      activities: { activities: [{ name: "Scaling up", state: "Progressing", tone: "progress" }] },
      tone: { tone: "progress" },
    });
  });

  it("turns to the tone of a warning past them, and no rule ends the scale", () => {
    for (const now of [passesAt, passesAt + 86_400_000]) {
      expect(at(now)).toMatchObject({
        health: { health: "Unhealthy" },
        activities: { activities: [{ name: "Scaling up", state: "Progressing", tone: "warning" }] },
        tone: { tone: "warning", setBy: { activity: { name: "Scaling up" } } },
      });
    }
  });
});
