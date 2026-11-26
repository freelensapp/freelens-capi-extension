// The expectations of S7 (s7-expectations.ts), which the test of the real tier checks on its readings, checked here on
// readings rebuilt from the trial by hand on Cluster API v1.14.4, from the first run of the test in CI and from the
// code of the release: each case passes on what they saw, at the times they saw each change, and fails on a reading
// that contradicts one of its rows. The messages that no expectation reads are left empty, and the one it compares is
// a text of the test.

import { describe, expect, it } from "vitest";
import { S7 } from "../../e2e/scripts/manifests.mts";
import { expectCase1, expectCase2, expectCase3, WATCH_SECONDS, watchNamespace } from "./s7-expectations";

import type { KubeObject, OwnerReference } from "../../e2e/scripts/fixtures.mts";
import type { S7Reading } from "./s7-expectations";

const CREATION = Date.UTC(2026, 0, 1);
const NAMESPACE = S7.namespace;
const MACHINE = `${S7.infrastructureOnly}-control-plane-0`;
// The message of the Available of the KubeadmControlPlane that is not initialized, which the Cluster of case 3 mirrors.
const NOT_INITIALIZED = "the message of the KubeadmControlPlane";

function at(seconds: number): string {
  return new Date(CREATION + seconds * 1000).toISOString().replace(".000Z", "Z");
}

interface Change {
  readonly from: number;
  readonly type: string;
  readonly status: string;
  readonly reason: string;
  readonly message?: string;
  // The time of the transition when it is not that of the change, as a mirror keeps it.
  readonly since?: number;
}

// The conditions of an object at a time: the last change of each type up to that time, each with the time of its
// transition, which a change keeps when the status does not change (util/conditions/setter.go:64).
function conditionsAt(changes: readonly Change[], seconds: number): Record<string, unknown>[] {
  const current = new Map<string, Record<string, unknown>>();

  for (const change of changes.filter((each) => each.from <= seconds)) {
    const previous = current.get(change.type);
    const since =
      change.since ?? (previous !== undefined && previous.status === change.status ? undefined : change.from);

    current.set(change.type, {
      type: change.type,
      status: change.status,
      reason: change.reason,
      message: change.message ?? "",
      lastTransitionTime: since === undefined ? previous?.lastTransitionTime : at(since),
    });
  }
  return [...current.values()];
}

function object(apiVersion: string, kind: string, name: string, rest: Record<string, unknown> = {}): KubeObject {
  return { apiVersion, kind, metadata: { name, namespace: NAMESPACE, creationTimestamp: at(0) }, ...rest };
}

const CORE = "cluster.x-k8s.io/v1beta2";
const CLUSTER_OWNER: OwnerReference = { apiVersion: CORE, kind: "Cluster", name: S7.infrastructureOnly };

// Case 2, as the trial saw it: the first condition at +1s, the first full status at +2s, the infrastructure at +4s,
// the probe at +36s, the Node at +37s, the control plane initialized at +38s, the Machine available at +53s. Until
// its DevCluster reports `Ready`, the Cluster mirrors `InfrastructureReady` as `False` `NotReady`, the fallback that the
// code writes from the first full status (core/reconcilers/cluster/cluster_controller_status.go:365-374), which the
// trial could not see.
const CASE_2: readonly Change[] = [
  { from: 1, type: "Paused", status: "False", reason: "NotPaused" },
  { from: 2, type: "Available", status: "False", reason: "NotAvailable" },
  { from: 2, type: "ControlPlaneAvailable", status: "Unknown", reason: "InternalError" },
  { from: 2, type: "ControlPlaneInitialized", status: "False", reason: "NotInitialized" },
  { from: 2, type: "RemoteConnectionProbe", status: "False", reason: "ProbeFailed" },
  { from: 2, type: "WorkersAvailable", status: "True", reason: "NoWorkers" },
  ...["RollingOut", "ScalingUp", "ScalingDown", "Remediating"].map((type) => ({
    from: 2,
    type,
    status: "False",
    reason: `Not${type}`,
  })),
  { from: 2, type: "Deleting", status: "False", reason: "NotDeleting" },
  { from: 2, type: "WorkerMachinesReady", status: "True", reason: "NoReplicas" },
  { from: 2, type: "WorkerMachinesUpToDate", status: "True", reason: "NoReplicas" },
  { from: 2, type: "ControlPlaneMachinesUpToDate", status: "True", reason: "NoReplicas" },
  { from: 3, type: "ControlPlaneMachinesReady", status: "False", reason: "NotReady" },
  { from: 2, type: "InfrastructureReady", status: "False", reason: "NotReady" },
  { from: 4, type: "InfrastructureReady", status: "True", reason: "Ready" },
  { from: 36, type: "RemoteConnectionProbe", status: "True", reason: "ProbeSucceeded" },
  { from: 36, type: "Available", status: "Unknown", reason: "AvailableUnknown" },
  { from: 36, type: "ControlPlaneMachinesReady", status: "Unknown", reason: "ReadyUnknown" },
  { from: 36, type: "ControlPlaneMachinesUpToDate", status: "Unknown", reason: "UpToDateUnknown" },
  { from: 38, type: "ControlPlaneInitialized", status: "True", reason: "Initialized" },
];

// Case 3, as the trial saw it: the Cluster with its first full status at +2s, its KubeadmControlPlane at +4s, scaling
// up, and the Cluster scaling up with it from +5s, its mirror keeping the time of +2s. Until then the Cluster has
// `ScalingUp` `False`, as the code writes it from the first full status while the control plane reports none
// (core/reconcilers/cluster/cluster_controller_status.go:88, :997-1003), which the trial could not see.
const CASE_3: readonly Change[] = [
  { from: 1, type: "Paused", status: "False", reason: "NotPaused" },
  { from: 2, type: "Available", status: "False", reason: "NotAvailable" },
  { from: 2, type: "InfrastructureReady", status: "Unknown", reason: "InternalError" },
  { from: 2, type: "ControlPlaneAvailable", status: "False", reason: "NotAvailable" },
  { from: 2, type: "ControlPlaneInitialized", status: "False", reason: "NotInitialized" },
  { from: 2, type: "RemoteConnectionProbe", status: "False", reason: "ProbeFailed" },
  { from: 2, type: "WorkersAvailable", status: "True", reason: "NoWorkers" },
  ...["RollingOut", "ScalingDown", "Remediating"].map((type) => ({
    from: 2,
    type,
    status: "False",
    reason: `Not${type}`,
  })),
  { from: 2, type: "Deleting", status: "False", reason: "NotDeleting" },
  ...["ControlPlaneMachinesReady", "ControlPlaneMachinesUpToDate", "WorkerMachinesReady", "WorkerMachinesUpToDate"].map(
    (type) => ({ from: 2, type, status: "True", reason: "NoReplicas" }),
  ),
  { from: 2, type: "ScalingUp", status: "False", reason: "NotScalingUp" },
  { from: 5, type: "ScalingUp", status: "True", reason: "ScalingUp" },
  { from: 5, type: "ControlPlaneAvailable", status: "False", reason: "NotAvailable", message: NOT_INITIALIZED },
];

const CONTROL_PLANE: readonly Change[] = [
  { from: 3, type: "Paused", status: "False", reason: "NotPaused" },
  { from: 4, type: "Available", status: "False", reason: "NotAvailable", message: NOT_INITIALIZED },
  { from: 4, type: "Initialized", status: "False", reason: "NotInitialized" },
  { from: 4, type: "CertificatesAvailable", status: "True", reason: "Available" },
  { from: 4, type: "EtcdClusterHealthy", status: "Unknown", reason: "InspectionFailed" },
  { from: 4, type: "ControlPlaneComponentsHealthy", status: "Unknown", reason: "InspectionFailed" },
  { from: 4, type: "ScalingUp", status: "True", reason: "ScalingUp" },
  { from: 4, type: "MachinesReady", status: "True", reason: "NoReplicas" },
  { from: 4, type: "MachinesUpToDate", status: "True", reason: "NoReplicas" },
  ...["RollingOut", "ScalingDown", "Remediating"].map((type) => ({
    from: 4,
    type,
    status: "False",
    reason: `Not${type}`,
  })),
  { from: 4, type: "Deleting", status: "False", reason: "NotDeleting" },
];

const MACHINE_CHANGES: readonly Change[] = [
  { from: 2, type: "Available", status: "False", reason: "NotReady" },
  { from: 2, type: "Ready", status: "False", reason: "NotReady" },
  { from: 2, type: "Updating", status: "False", reason: "NotUpdating" },
  { from: 2, type: "Deleting", status: "False", reason: "NotDeleting" },
  { from: 2, type: "Paused", status: "False", reason: "NotPaused" },
  { from: 53, type: "Available", status: "True", reason: "Available" },
  { from: 53, type: "Ready", status: "True", reason: "Ready" },
];

function statusOf(changes: readonly Change[], seconds: number, rest: Record<string, unknown> = {}) {
  const conditions = conditionsAt(changes, seconds);

  return conditions.length === 0 ? {} : { status: { conditions, ...rest } };
}

// The metadata of an object of the trial with its generation.
function metadataOf(name: string, generation: number) {
  return { metadata: { name, namespace: NAMESPACE, creationTimestamp: at(0), generation } };
}

// The objects of the namespace at a time, as the trial saw them. Each status observes a generation from the first
// full status of its object. The Cluster of case 2 takes its endpoint from its DevCluster together with its
// infrastructure, at +4s, a change of its spec that makes its generation 2, which its status observes from +7s: the
// first run in CI read the older one at +6.361s (s7-expectations.ts).
function objectsAt(seconds: number): KubeObject[] {
  const infrastructure = S7.infrastructureOnly;
  const controlPlane = S7.controlPlaneOnly;
  const counters = { replicas: 0, readyReplicas: 0, availableReplicas: 0, upToDateReplicas: 0 };

  return [
    object(CORE, "Cluster", infrastructure, {
      ...metadataOf(infrastructure, seconds >= 4 ? 2 : 1),
      spec: {
        infrastructureRef: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: infrastructure },
      },
      ...statusOf(CASE_2, seconds, {
        ...(seconds >= 2 ? { observedGeneration: seconds >= 7 ? 2 : 1 } : {}),
        ...(seconds >= 4 ? { initialization: { infrastructureProvisioned: true } } : {}),
      }),
    }),
    object("infrastructure.cluster.x-k8s.io/v1beta2", "DevCluster", infrastructure, {
      ...statusOf([{ from: 4, type: "Ready", status: "True", reason: "Ready" }], seconds),
    }),
    object(CORE, "Machine", MACHINE, {
      metadata: {
        name: MACHINE,
        namespace: NAMESPACE,
        creationTimestamp: at(0),
        labels: { "cluster.x-k8s.io/cluster-name": infrastructure, "cluster.x-k8s.io/control-plane": "" },
      },
      spec: { clusterName: infrastructure },
      ...statusOf(MACHINE_CHANGES, seconds, {
        phase: seconds >= 37 ? "Running" : "Provisioned",
        ...(seconds >= 37 ? { nodeRef: { name: MACHINE } } : {}),
      }),
    }),
    object(CORE, "Cluster", controlPlane, {
      ...metadataOf(controlPlane, 1),
      spec: {
        controlPlaneRef: { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane", name: controlPlane },
      },
      ...statusOf(
        CASE_3,
        seconds,
        seconds >= 2 ? { observedGeneration: 1, initialization: { infrastructureProvisioned: true } } : {},
      ),
    }),
    object("controlplane.cluster.x-k8s.io/v1beta2", "KubeadmControlPlane", controlPlane, {
      ...metadataOf(controlPlane, 1),
      spec: { replicas: 1, version: "v1.37.0" },
      ...statusOf(CONTROL_PLANE, seconds, seconds >= 4 ? { observedGeneration: 1, ...counters } : {}),
    }),
  ];
}

function readingAt(seconds: number, change?: (objects: KubeObject[]) => void): S7Reading {
  const objects = objectsAt(seconds);

  change?.(objects);
  return {
    at: CREATION + seconds * 1000,
    objects,
    kubeconfigs: {
      [S7.infrastructureOnly]: seconds >= 7 ? [CLUSTER_OWNER] : undefined,
      [S7.controlPlaneOnly]: undefined,
    },
  };
}

// The readings of the trial, every five seconds from the creation to the end of the watch, at each change, and at +6s,
// where the first run in CI found the older generation of case 2.
const TIMES = [
  ...new Set([
    ...[0, 1, 2, 3, 4, 5, 6, 7, 36, 37, 38, 53],
    ...Array.from({ length: WATCH_SECONDS / 5 + 1 }, (_, n) => n * 5),
  ]),
].sort((a, b) => a - b);

function trial(change?: (objects: KubeObject[], seconds: number) => void): S7Reading[] {
  return TIMES.map((seconds) => readingAt(seconds, change && ((objects) => change(objects, seconds))));
}

function find(objects: KubeObject[], kind: string, name: string): KubeObject {
  return objects.find((each) => each.kind === kind && each.metadata.name === name) as KubeObject;
}

// A copy of a condition of an object with fields changed, from a time.
function changeCondition(kind: string, name: string, type: string, from: number, fields: Record<string, unknown>) {
  return (objects: KubeObject[], seconds: number) => {
    if (seconds < from) return;

    const target = find(objects, kind, name);
    const conditions = (target.status?.conditions ?? []) as Record<string, unknown>[];

    target.status = {
      ...target.status,
      conditions: conditions.map((each) => (each.type === type ? { ...each, ...fields } : each)),
    };
  };
}

describe("the expectations of S7", () => {
  it("hold on the readings of the trial by hand", () => {
    const readings = trial();

    expectCase1(
      'The Cluster "freelens-capi-s7-no-reference" is invalid: spec: Forbidden: neither reference nor topology',
      readings,
    );
    expectCase2(readings);
    expectCase3(readings);
  });

  it.each([
    ["an accepted dry run", ""],
    ["a refusal by the schema", 'The Cluster "x" is invalid: spec: Invalid value: 0: spec has no field'],
  ])("refuse, for case 1, %s", (_, refusal) => {
    expect(() => expectCase1(refusal, trial())).toThrow(/ is invalid: spec: Forbidden: /);
  });

  it("refuse, for case 1, a Cluster written by the dry run", () => {
    const readings = trial((objects) =>
      objects.push(object(CORE, "Cluster", S7.noReference, { spec: { clusterNetwork: {} } })),
    );

    expect(() => expectCase1(" is invalid: spec: Forbidden: ", readings)).toThrow(/the Cluster of the dry run/);
  });

  it.each([
    [
      "Available True",
      changeCondition("Cluster", S7.infrastructureOnly, "Available", 120, { status: "True" }),
      /^Available at \+120s/,
    ],
    [
      "ControlPlaneAvailable True",
      changeCondition("Cluster", S7.infrastructureOnly, "ControlPlaneAvailable", 60, {
        status: "True",
        reason: "Ready",
      }),
      /: ControlPlaneAvailable:/,
    ],
    [
      "WorkersAvailable with another reason",
      changeCondition("Cluster", S7.infrastructureOnly, "WorkersAvailable", 60, { reason: "Available" }),
      /: WorkersAvailable:/,
    ],
    [
      "status.initialization.controlPlaneInitialized set",
      (objects: KubeObject[], seconds: number) => {
        const cluster = find(objects, "Cluster", S7.infrastructureOnly);

        if (seconds >= 60) cluster.status = { ...cluster.status, initialization: { controlPlaneInitialized: true } };
      },
      /^status.initialization.controlPlaneInitialized at \+60s/,
    ],
    [
      "ControlPlaneInitialized True before the Node",
      changeCondition("Cluster", S7.infrastructureOnly, "ControlPlaneInitialized", 30, {
        status: "True",
        reason: "Initialized",
      }),
      /^the Node of /,
    ],
    [
      "InfrastructureReady True with another time than the DevCluster",
      changeCondition("Cluster", S7.infrastructureOnly, "InfrastructureReady", 4, { lastTransitionTime: at(3) }),
      /^the mirror at \+4s/,
    ],
    [
      "a probe that never succeeds",
      changeCondition("Cluster", S7.infrastructureOnly, "RemoteConnectionProbe", 36, {
        status: "False",
        reason: "ProbeFailed",
      }),
      /^Available at \+36s/,
    ],
  ] as const)("refuse, for case 2, %s", (_, change, failure) => {
    expect(() => expectCase2(trial(change))).toThrow(failure);
  });

  it("refuse, for case 2, a kubeconfig that the Cluster owns as its controller, and a watch shorter than the trial's", () => {
    const controlled = trial().map((reading) => ({
      ...reading,
      kubeconfigs: {
        ...reading.kubeconfigs,
        [S7.infrastructureOnly]: reading.kubeconfigs[S7.infrastructureOnly]?.map((owner) => ({
          ...owner,
          controller: true,
        })),
      },
    }));

    expect(() => expectCase2(controlled)).toThrow(/^the owners of the Secret of the kubeconfig/);
    expect(() => expectCase2(trial().slice(0, -1))).toThrow(/^the watch/);
  });

  it.each([
    [
      "a mirror with the time of the KubeadmControlPlane after its own",
      changeCondition("Cluster", S7.controlPlaneOnly, "ControlPlaneAvailable", 5, { lastTransitionTime: at(6) }),
      /^the time of the mirror at \+5s/,
    ],
    [
      "a mirror with another message",
      changeCondition("Cluster", S7.controlPlaneOnly, "ControlPlaneAvailable", 60, { message: "another message" }),
      /^the mirror:/,
    ],
    [
      "a scale up of the KubeadmControlPlane that ends",
      changeCondition("KubeadmControlPlane", S7.controlPlaneOnly, "ScalingUp", 120, {
        status: "False",
        reason: "NotScalingUp",
      }),
      /^KubeadmControlPlane freelens-capi-s7-cp-only: ScalingUp/,
    ],
    [
      "a probe that succeeds",
      changeCondition("Cluster", S7.controlPlaneOnly, "RemoteConnectionProbe", 120, {
        status: "True",
        reason: "ProbeSucceeded",
      }),
      /: RemoteConnectionProbe:/,
    ],
    [
      "an infrastructure that is ready",
      changeCondition("Cluster", S7.controlPlaneOnly, "InfrastructureReady", 60, { status: "True", reason: "Ready" }),
      /: InfrastructureReady:/,
    ],
    [
      "a control plane that is initialized",
      changeCondition("Cluster", S7.controlPlaneOnly, "ControlPlaneInitialized", 60, {
        status: "True",
        reason: "Initialized",
      }),
      /: ControlPlaneInitialized:/,
    ],
    [
      "a Machine of the control plane",
      (objects: KubeObject[], seconds: number) => {
        if (seconds >= 120) {
          objects.push(
            object(CORE, "Machine", `${S7.controlPlaneOnly}-0`, { spec: { clusterName: S7.controlPlaneOnly } }),
          );
        }
      },
      /^the Machines of the Cluster at \+120s/,
    ],
    [
      "an endpoint",
      (objects: KubeObject[], seconds: number) => {
        const cluster = find(objects, "Cluster", S7.controlPlaneOnly);

        if (seconds >= 60) cluster.spec = { ...cluster.spec, controlPlaneEndpoint: { host: "10.0.0.1", port: 6443 } };
      },
      /^the endpoint at \+60s/,
    ],
    [
      "an infrastructure that is no longer provisioned",
      (objects: KubeObject[], seconds: number) => {
        const cluster = find(objects, "Cluster", S7.controlPlaneOnly);

        if (seconds >= 60) cluster.status = { ...cluster.status, initialization: {} };
      },
      /^status.initialization.infrastructureProvisioned at \+60s/,
    ],
    [
      "an infrastructure that is never provisioned",
      (objects: KubeObject[]) => {
        const cluster = find(objects, "Cluster", S7.controlPlaneOnly);

        if (cluster.status !== undefined) cluster.status = { ...cluster.status, initialization: {} };
      },
      /^status.initialization.infrastructureProvisioned at the end of the watch/,
    ],
    [
      "an infrastructure that is not provisioned",
      (objects: KubeObject[]) => {
        const cluster = find(objects, "Cluster", S7.controlPlaneOnly);

        if (cluster.status !== undefined) {
          cluster.status = { ...cluster.status, initialization: { infrastructureProvisioned: false } };
        }
      },
      /^status.initialization.infrastructureProvisioned at \+2s/,
    ],
  ] as const)("refuse, for case 3, %s", (_, change, failure) => {
    expect(() => expectCase3(trial(change))).toThrow(failure);
  });

  it.each([
    [
      "a reading between the first full conditions of its Cluster and the rest of its status",
      (objects: KubeObject[], seconds: number) => {
        const cluster = find(objects, "Cluster", S7.controlPlaneOnly);

        if (seconds === 2) cluster.status = { conditions: cluster.status?.conditions };
      },
    ],
    [
      "a generation of its Cluster that its status has not observed yet",
      (objects: KubeObject[], seconds: number) => {
        const cluster = find(objects, "Cluster", S7.controlPlaneOnly);

        if (seconds >= 60) cluster.metadata.generation = 2;
        if (seconds >= 65) cluster.status = { ...cluster.status, observedGeneration: 2 };
      },
    ],
  ] as const)("hold, for case 3, on %s", (_, change) => {
    expectCase3(trial(change));
  });

  it("refuse, for case 3, a Secret of a kubeconfig", () => {
    const readings = trial().map((reading) => ({
      ...reading,
      kubeconfigs: { ...reading.kubeconfigs, [S7.controlPlaneOnly]: [] },
    }));

    expect(() => expectCase3(readings)).toThrow(/^the Secret of the kubeconfig/);
  });
});

describe("the watch of S7", () => {
  // A clock of the test, which every sleep moves on.
  function clock() {
    let time = CREATION;

    return {
      now: () => time,
      sleep: async (milliseconds: number) => {
        time += milliseconds;
      },
    };
  }

  const DEADLINE = CREATION + 60_000;
  const EVERY = 5_000;

  it("reads again after a reading that fails, until the watch is over, and says why", async () => {
    const { now, sleep } = clock();
    const lines: string[] = [];
    let reads = 0;
    const readings = await watchNamespace({
      read: () => {
        reads += 1;
        if (reads === 2) throw new Error("kubectl get failed with 1: the connection to the server was refused");
        return readingAt((now() - CREATION) / 1000);
      },
      refusal: () => false,
      over: (reading) => reading.at - CREATION >= 15_000,
      deadline: DEADLINE,
      every: EVERY,
      now,
      sleep,
      log: (line) => lines.push(line),
    });

    expect(readings.map((reading) => (reading.at - CREATION) / 1000)).toEqual([0, 10, 15]);
    expect(lines).toEqual([
      "A reading of the namespace failed, and is taken again: kubectl get failed with 1: the connection to the server was refused",
    ]);
  });

  it("ends at once on a refusal of the checks of the target", async () => {
    const { now, sleep } = clock();
    const refusal = new Error("The node of the kind cluster is not the container that the scripts created");
    let reads = 0;
    const watching = watchNamespace({
      read: () => {
        reads += 1;
        if (reads === 2) throw refusal;
        return readingAt(0);
      },
      refusal: (error) => error === refusal,
      over: () => false,
      deadline: DEADLINE,
      every: EVERY,
      now,
      sleep,
      log: () => {},
    });

    await expect(watching).rejects.toBe(refusal);
    expect({ reads, at: now() }).toEqual({ reads: 2, at: CREATION + EVERY });
  });

  it("ends at the deadline with the readings it has, when every later reading fails", async () => {
    const { now, sleep } = clock();
    let reads = 0;
    const readings = await watchNamespace({
      read: () => {
        reads += 1;
        if (reads > 1) throw new Error("kubectl get did not complete");
        return readingAt(0);
      },
      refusal: () => false,
      over: () => false,
      deadline: DEADLINE,
      every: EVERY,
      now,
      sleep,
      log: () => {},
    });

    expect({ readings: readings.length, reads, at: now() }).toEqual({ readings: 1, reads: 13, at: DEADLINE });
  });
});
