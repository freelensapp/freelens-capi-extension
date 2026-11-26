// The expectations of S7 of SPEC-0001 on the real project (SPEC-0003, "With the real project: S7", P32), on the
// readings that the test of the real tier takes of the namespace of the trial, s7.tests.ts: what the trial by hand
// saw on Cluster API v1.14.4, the rows of the table of S7 that it confirmed and those that it corrected, among them
// the control plane with no endpoint that scales up for good. Each holds at every reading, from the first full status
// of its object, which the trial saw within two seconds of the creation, to the end of the watch. The unit tests,
// s7-expectations.test.ts, check them on readings rebuilt from the trial, and on readings that contradict a row.

import { expect } from "vitest";
import { S7 } from "../../e2e/scripts/manifests.mts";
import { CONTROL_PLANE, conditionOf, nameOf, ObjectSet, path, readStatus } from "../status-views";

import type { KubeObject, OwnerReference } from "../../e2e/scripts/fixtures.mts";
import type { Condition } from "../status-views";

const SECOND = 1000;

// The 30 minutes of the first provisioning of a Cluster (D2), past which the tone of progress turns to a warning.
const FIRST_PROVISIONING = 1800 * SECOND;

// How long after the creation of the Clusters the test watches them, so that "for good" is seen over several
// reconciles: the trial saw the KubeadmControlPlane of case 3 reconcile again at +100s and +183s, and the cache of
// the workload clusters fail to connect for the fifth time at +153s, with nothing changed in either case from +53s.
export const WATCH_SECONDS = 240;

// How long the test waits for case 2 to settle, its probe succeeded and its control plane initialized, which the
// trial saw at +36s and +38s, and its Machine available at +53s: ten times as long.
export const SETTLE_SECONDS = 600;

// A reading of the namespace of the trial.
export interface S7Reading {
  // The time of the reading, in milliseconds since the Unix epoch.
  readonly at: number;
  // The objects of the kinds of the fixtures in the namespace.
  readonly objects: readonly KubeObject[];
  // The owners of the Secret `<cluster>-kubeconfig` of each Cluster of the trial, by the name of the Cluster, and
  // undefined while it has none. The content of a Secret is never read.
  readonly kubeconfigs: Readonly<Record<string, readonly OwnerReference[] | undefined>>;
}

function named(reading: S7Reading, kind: string, name: string): KubeObject | undefined {
  return reading.objects.find((object) => object.kind === kind && object.metadata.name === name);
}

function created(object: KubeObject): number {
  return Date.parse(String(object.metadata.creationTimestamp));
}

function expectCondition(object: KubeObject, type: string, status: string, reason?: string): Condition {
  const found = conditionOf(object, type);

  expect(
    { status: found?.status, ...(reason === undefined ? {} : { reason: found?.reason }) },
    `${nameOf(object)}: ${type}`,
  ).toEqual({ status, ...(reason === undefined ? {} : { reason }) });
  return found as Condition;
}

// The Cluster of a case at each reading from its first full status, which carries `Available`.
function settledReadings(
  readings: readonly S7Reading[],
  cluster: string,
): { reading: S7Reading; cluster: KubeObject }[] {
  return readings.flatMap((reading) => {
    const object = named(reading, "Cluster", cluster);

    return object !== undefined && conditionOf(object, "Available") !== undefined ? [{ reading, cluster: object }] : [];
  });
}

// The readings cover the watch: from the creation of the Cluster to WATCH_SECONDS after it.
function expectWatched(readings: readonly S7Reading[], cluster: string): void {
  const object = readings.map((reading) => named(reading, "Cluster", cluster)).find((each) => each !== undefined);

  expect(object, `the Cluster ${cluster} was read`).toBeDefined();
  expect(readings[readings.length - 1].at - created(object as KubeObject), "the watch").toBeGreaterThanOrEqual(
    WATCH_SECONDS * SECOND,
  );
}

// Case 1: the server-side dry run of a Cluster with neither reference nor topology is refused on the field `spec`,
// with the cause `Forbidden`, which the webhook of Cluster gives (core/webhooks/admission/cluster.go:183-191) and no
// rule of the schema of a Cluster does; and nothing is written.
export function expectCase1(refusal: string, readings: readonly S7Reading[]): void {
  expect(refusal).toMatch(/ is invalid: spec: Forbidden: /);
  expect(readings.length).toBeGreaterThan(0);
  for (const reading of readings) {
    expect(named(reading, "Cluster", S7.noReference), "the Cluster of the dry run").toBeUndefined();
  }
}

// Case 2, an infrastructure reference only: `ControlPlaneAvailable` `Unknown` `InternalError`, for good;
// `InfrastructureReady` `True`, mirrored with the time of the `Ready` of the DevCluster; `ControlPlaneInitialized`
// `True` once the Machine has a Node, with `status.initialization.controlPlaneInitialized` unset; the probe `True`
// once the workload cluster answers, through the Secret of its kubeconfig, which the Cluster owns, not as its
// controller; `WorkersAvailable` `True` `NoWorkers`; `Available` `False` until the probe first succeeds, then `Unknown`
// `AvailableUnknown`, never `True`. The model: Unhealthy until the probe first succeeds, then Unknown, with the note of
// P7; Provisioning until the control plane is initialized, then Idle; while Unhealthy and Provisioning, in the tone
// of progress until 30 minutes after the creation; and Unknown before the first full status.
export function expectCase2(readings: readonly S7Reading[]): void {
  const name = S7.infrastructureOnly;
  const machineName = `${name}-control-plane-0`;
  const settled = settledReadings(readings, name);

  expectWatched(readings, name);
  for (const reading of readings) {
    const cluster = named(reading, "Cluster", name);

    if (cluster === undefined || conditionOf(cluster, "Available") !== undefined) continue;
    expect(
      readStatus(new ObjectSet(name, reading.objects).statusOf(cluster, reading.at), created(cluster)).health,
    ).toBe("Unknown");
  }
  expect(settled.length).toBeGreaterThan(0);
  for (const { reading, cluster } of settled) {
    const at = `at +${(reading.at - created(cluster)) / SECOND}s`;
    const machine = named(reading, "Machine", machineName);
    const infrastructure = named(reading, "DevCluster", name);

    expectCondition(cluster, "ControlPlaneAvailable", "Unknown", "InternalError");
    expectCondition(cluster, "WorkersAvailable", "True", "NoWorkers");
    expect(
      path(cluster, "status", "initialization", "controlPlaneInitialized"),
      `status.initialization.controlPlaneInitialized ${at}`,
    ).toBeUndefined();

    const probe = conditionOf(cluster, "RemoteConnectionProbe");
    const available = conditionOf(cluster, "Available");

    expect({ status: available?.status, reason: available?.reason }, `Available ${at}`).toEqual(
      probe?.status === "True"
        ? { status: "Unknown", reason: "AvailableUnknown" }
        : { status: "False", reason: "NotAvailable" },
    );
    if (probe?.status === "True") {
      expect(probe.reason).toBe("ProbeSucceeded");
      expect(
        reading.kubeconfigs[name]?.map((owner) => ({
          kind: owner.kind,
          name: owner.name,
          controller: owner.controller === true,
        })),
        `the owners of the Secret of the kubeconfig ${at}`,
      ).toEqual([{ kind: "Cluster", name, controller: false }]);
    }
    if (conditionOf(cluster, "ControlPlaneInitialized")?.status === "True") {
      expect(path(machine, "status", "nodeRef", "name"), `the Node of ${machineName} ${at}`).toBeTypeOf("string");
    } else {
      expectCondition(cluster, "ControlPlaneInitialized", "False");
    }
    if (conditionOf(cluster, "InfrastructureReady")?.status === "True") {
      const ready = expectCondition(infrastructure as KubeObject, "Ready", "True");

      expect(conditionOf(cluster, "InfrastructureReady")?.lastTransitionTime, `the mirror ${at}`).toBe(
        ready.lastTransitionTime,
      );
    }

    const initialized = conditionOf(cluster, "ControlPlaneInitialized")?.status === "True";
    const unhealthy = available?.status === "False";
    const status = readStatus(new ObjectSet(name, reading.objects).statusOf(cluster, reading.at), created(cluster));

    expect(status, `the model ${at}`).toEqual({
      health: unhealthy ? "Unhealthy" : "Unknown",
      tone: unhealthy && !initialized ? `progress by Provisioning until ${FIRST_PROVISIONING / SECOND}s` : "health",
      activities: initialized ? ["Idle"] : ["Provisioning Progressing since 0s"],
      marks: [],
      notes: ["never-available: spec.controlPlaneRef"],
    });
  }

  // It settles: its probe succeeded and its control plane is initialized.
  const { cluster } = settled[settled.length - 1];

  expectCondition(cluster, "RemoteConnectionProbe", "True", "ProbeSucceeded");
  expectCondition(cluster, "ControlPlaneInitialized", "True");
  expectCondition(cluster, "Available", "Unknown", "AvailableUnknown");
}

// Case 3, a control plane reference only: `InfrastructureReady` `Unknown` `InternalError`, for good, with
// `status.initialization.infrastructureProvisioned` true; `ControlPlaneAvailable` `False`, with the reason and the
// message of the `Available` of a KubeadmControlPlane that is not initialized, and its own first time, which the
// mirror keeps when the status does not change (util/conditions/setter.go:64); the probe `False` `ProbeFailed`, with
// no endpoint and no kubeconfig; `Available` `False`, never `True`; the KubeadmControlPlane `ScalingUp` `True` for
// good with no Machine, and the Cluster with it. The model: Unhealthy, with the note of P7; Provisioning for good, and
// Scaling up, Progressing, which no rule assumes ends; in the tone of progress for 30 minutes from the creation, then
// of a warning, the KubeadmControlPlane too.
export function expectCase3(readings: readonly S7Reading[]): void {
  const name = S7.controlPlaneOnly;
  const settled = settledReadings(readings, name);

  expectWatched(readings, name);
  expect(settled.length).toBeGreaterThan(0);
  for (const { reading, cluster } of settled) {
    const at = `at +${(reading.at - created(cluster)) / SECOND}s`;
    const controlPlane = named(reading, "KubeadmControlPlane", name);
    const view = new ObjectSet(name, reading.objects);

    expectCondition(cluster, "InfrastructureReady", "Unknown", "InternalError");
    expect(path(cluster, "status", "initialization", "infrastructureProvisioned"), at).toBe(true);
    expectCondition(cluster, "RemoteConnectionProbe", "False", "ProbeFailed");
    expect(reading.kubeconfigs[name], `the Secret of the kubeconfig ${at}`).toBeUndefined();
    expect(path(cluster, "spec", "controlPlaneEndpoint", "host") ?? "", `the endpoint ${at}`).toBe("");
    expectCondition(cluster, "Available", "False", "NotAvailable");
    expectCondition(cluster, "ControlPlaneInitialized", "False");

    const mirror = expectCondition(cluster, "ControlPlaneAvailable", "False", "NotAvailable");
    const source = controlPlane === undefined ? undefined : conditionOf(controlPlane, "Available");

    if (source !== undefined) {
      // The time of the first `False` of the Cluster, which the mirror keeps: never after that of the source.
      expect(Date.parse(String(mirror.lastTransitionTime)), `the time of the mirror ${at}`).toBeLessThanOrEqual(
        Date.parse(String(source.lastTransitionTime)),
      );
      expectCondition(controlPlane as KubeObject, "ScalingUp", "True", "ScalingUp");
      expect(path(controlPlane, "status", "initialization", "controlPlaneInitialized") ?? false, at).toBe(false);
    }
    expect(
      view
        .ofKind("Machine")
        .filter((machine) => view.clusterOf(machine) === cluster)
        .map(nameOf),
      `the Machines of the Cluster ${at}`,
    ).toEqual([]);

    const scaling = conditionOf(cluster, "ScalingUp");
    const since = (condition: Condition | undefined) =>
      (Date.parse(String(condition?.lastTransitionTime)) - created(cluster)) / SECOND;

    // Its first status has no `ScalingUp` before its KubeadmControlPlane has one, which leaves the source unread (P1).
    expect(readStatus(view.statusOf(cluster, reading.at), created(cluster)), `the model ${at}`).toEqual({
      health: "Unhealthy",
      tone: `progress by Provisioning until ${FIRST_PROVISIONING / SECOND}s`,
      activities: [
        "Provisioning Progressing since 0s",
        ...(scaling?.status === "True" ? [`Scaling up Progressing since ${since(scaling)}s`] : []),
        ...(scaling === undefined ? ["Unknown"] : []),
      ],
      marks: [],
      notes: ["never-available: spec.infrastructureRef"],
    });
    if (source !== undefined) {
      expect(
        readStatus(view.statusOf(controlPlane as KubeObject, reading.at), created(cluster)),
        `the model of the KubeadmControlPlane ${at}`,
      ).toMatchObject({
        health: "Unhealthy",
        tone: `progress by Scaling up until ${FIRST_PROVISIONING / SECOND}s`,
        activities: [`Scaling up Progressing since ${since(conditionOf(controlPlane as KubeObject, "ScalingUp"))}s`],
      });
    }
  }

  // At the end of the watch, the Cluster mirrors the reason and the message of the `Available` of its
  // KubeadmControlPlane, which it follows on its next reconcile, and scales up with it; past the 30 minutes of its
  // first provisioning, both are in the tone of a warning, still Provisioning and Scaling up.
  const { reading, cluster } = settled[settled.length - 1];
  const view = new ObjectSet(name, reading.objects);
  const controlPlane = view.named("KubeadmControlPlane", name);
  const past = created(cluster) + FIRST_PROVISIONING + SECOND;
  const mirror = conditionOf(cluster, "ControlPlaneAvailable");
  const source = controlPlane === undefined ? undefined : conditionOf(controlPlane, "Available");

  expect(controlPlane?.apiVersion).toBe(CONTROL_PLANE);
  expect({ reason: mirror?.reason, message: mirror?.message }, "the mirror").toEqual({
    reason: source?.reason,
    message: source?.message,
  });
  expectCondition(cluster, "ScalingUp", "True", "ScalingUp");
  expect(readStatus(view.statusOf(cluster, past), created(cluster))).toMatchObject({
    health: "Unhealthy",
    tone: "warning by Provisioning",
    activities: [
      "Provisioning Progressing since 0s",
      `Scaling up Progressing since ${(Date.parse(String(conditionOf(cluster, "ScalingUp")?.lastTransitionTime)) - created(cluster)) / SECOND}s`,
    ],
  });
  expect(readStatus(view.statusOf(controlPlane as KubeObject, past), created(cluster))).toMatchObject({
    health: "Unhealthy",
    tone: "warning by Scaling up",
  });
}
