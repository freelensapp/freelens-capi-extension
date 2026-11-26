// The cases on the fixtures of SPEC-0002 (SPEC-0003, "Tests", the table "The fixtures of SPEC-0002 give these
// results"): each set read from its files with the YAML reader of the scripts of the test environment, each object
// evaluated with the context that a view builds from the same set (test/status-views.ts), every provider available,
// as on the tier that installs with clusterctl, which has no object of the operator to tell (P24). Every case first
// asserts, on the fixture, the conditions that its row names, so that a capture in another state fails as such and
// not as a fault of the model; then the health, the tone, the activities and the marks of its row, at the capture
// and past the thresholds.
//
// - "At the capture" is the time of the capture, `CAPTURE_TIME` of the scripts, from which the fixtures keep every
//   time as an offset; "past the thresholds" is 30 minutes and one second after it. Every time that a threshold
//   counts from is at or before the capture, and no threshold of the model is longer than the 30 minutes of a Cluster
//   (D2, P2), which the first cases check on every set.
// - Every row but those of `provisioning` is read after the 30 minutes of its Cluster: when the capture falls within
//   them, the case moves the creation of the Cluster back by 30 minutes, the one field it changes.

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPTURE_TIME, FIXTURES_FOLDER, isTime, readFixtureSet } from "../../../e2e/scripts/fixtures.mts";
import {
  ADDONS,
  BOOTSTRAP,
  CONTROL_PLANE,
  CORE,
  conditionOf,
  issuesOf,
  nameOf as name,
  ObjectSet,
  offsetFrom,
  path,
  ROLES,
  readStatus,
} from "../../../test/status-views";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { Condition, StatusReading } from "../../../test/status-views";
import type { ObjectStatus } from "./index";

const SECOND = 1000;
// The thresholds of D2: one Machine, which a MachineHealthCheck of these sets leaves at 600 seconds; a deletion; the
// first provisioning of a Cluster.
const MACHINE = 600 * SECOND;
const DELETION = 900 * SECOND;
const CLUSTER = 1800 * SECOND;

const CAPTURE = Date.parse(CAPTURE_TIME);
const PAST = CAPTURE + CLUSTER + SECOND;

const FIXTURES = resolve(import.meta.dirname, "..", "..", "..", FIXTURES_FOLDER);

function instantOf(text: unknown): number {
  const instant = typeof text === "string" ? Date.parse(text) : Number.NaN;

  expect(instant, `a time: ${String(text)}`).not.toBeNaN();
  return instant;
}

const created = (object: KubeObject) => instantOf(object.metadata.creationTimestamp);
const deleted = (object: KubeObject) => instantOf(object.metadata.deletionTimestamp);
const transition = (object: KubeObject, type: string) => instantOf(conditionOf(object, type)?.lastTransitionTime);

// An instant as its offset from the capture, which the expectations and their failures print.
function offset(instant: number | undefined): string {
  return offsetFrom(CAPTURE, instant);
}

// What a case asserts of a result, every time written as its offset from the capture.
function read(status: ObjectStatus): StatusReading {
  return readStatus(status, CAPTURE);
}

// The one object of a kind in a set.
function only(set: ObjectSet, kind: string, apiVersion = CORE): KubeObject {
  const found = set.ofKind(kind, apiVersion);

  expect(found.map(name), `${set.label} has one ${kind}`).toHaveLength(1);
  return found[0];
}

// The Cluster of a set moved back by 30 minutes when the capture falls within them, the one field the case changes.
function settled(objects: readonly KubeObject[]): KubeObject[] {
  return objects.map((object) => {
    if (object.kind !== "Cluster" || object.apiVersion !== CORE || CAPTURE - created(object) >= CLUSTER) return object;
    return {
      ...object,
      metadata: {
        ...object.metadata,
        creationTimestamp: new Date(created(object) - CLUSTER).toISOString().replace(".000Z", "Z"),
      },
    };
  });
}

function readSet(state: string): KubeObject[] {
  return readFixtureSet(resolve(FIXTURES, state));
}

function fixture(state: string): ObjectSet {
  const objects = readSet(state);

  return new ObjectSet(state, state === "provisioning" ? objects : settled(objects));
}

// The fixture holds a condition of the row: its status, and its reason when the row names one.
function expectCondition(object: KubeObject, type: string, status: string, reason?: string): void {
  const found = conditionOf(object, type);

  expect(
    { status: found?.status, ...(reason === undefined ? {} : { reason: found?.reason }) },
    `${name(object)}: ${type}`,
  ).toEqual({ status, ...(reason === undefined ? {} : { reason }) });
}

function expectNoCondition(object: KubeObject, type: string): void {
  expect(conditionOf(object, type), `${name(object)} has no ${type}`).toBeUndefined();
}

// No condition of an activity `True`: the conditions of negative polarity that H2 reads, `Paused` and `Deleting` apart.
function expectNoActivityCondition(object: KubeObject): void {
  for (const type of ["RollingOut", "ScalingUp", "ScalingDown", "Remediating", "Updating"]) {
    expect(conditionOf(object, type)?.status, `${name(object)}: ${type}`).not.toBe("True");
  }
}

// The Cluster of a row read after its first provisioning: its control plane initialized, so that no object of it takes
// that first provisioning for its tone (D2), and its workload cluster reachable, so that no object of it carries the
// mark of P25.
function expectReachable(cluster: KubeObject): void {
  expectCondition(cluster, "ControlPlaneInitialized", "True");
  expectCondition(cluster, "RemoteConnectionProbe", "True");
}

function hasNode(machine: KubeObject): boolean {
  return typeof path(machine, "status", "nodeRef", "name") === "string";
}

function expectMachineStarting(machine: KubeObject, node: boolean): void {
  expect(hasNode(machine), `${name(machine)} has a Node`).toBe(node);
  expectCondition(machine, "Available", "False");
  expect(machine.metadata.deletionTimestamp, `${name(machine)} is not deleting`).toBeUndefined();
  expect(CAPTURE - created(machine), `${name(machine)} is younger than its threshold`).toBeLessThan(MACHINE);
}

// Every set of the fixtures, by its folder.
const STATES = [
  "provisioning",
  "healthy",
  "machine-without-node",
  "rolling-out",
  "scaling-up",
  "scaling-up-held",
  "scaling-down",
  "paused",
  "deleting",
  "upgrading",
  "without-topology",
  "machine-pools",
  "machine-pool-without-machines",
  "remediation",
  "no-status",
];

describe("the fixture sets", () => {
  it("are every set of the folder of the fixtures", () => {
    expect(
      readdirSync(FIXTURES, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([...STATES].sort());
  });

  it("start every threshold at or before the capture, and give no Machine more than 30 minutes", () => {
    const later: string[] = [];

    for (const state of STATES) {
      for (const object of readSet(state)) {
        // The times that a threshold counts from: a creation, a deletion and the transition of a condition (P2).
        const conditions = (path(object, "status", "conditions") as Condition[] | undefined) ?? [];
        const starts = [
          object.metadata.creationTimestamp,
          object.metadata.deletionTimestamp,
          ...conditions.map((condition) => condition.lastTransitionTime),
        ];

        for (const start of starts) {
          if (typeof start === "string" && isTime(start) && Date.parse(start) > CAPTURE) {
            later.push(`${state} ${name(object)} ${start}`);
          }
        }
        if (object.kind === "MachineHealthCheck") {
          expect(path(object, "spec", "checks", "nodeStartupTimeoutSeconds") ?? 600).toBeLessThanOrEqual(1800);
        }
      }
    }
    expect(later).toEqual([]);
  });
});

describe("A Cluster provisioning", () => {
  const set = fixture("provisioning");
  const cluster = only(set, "Cluster");
  const controlPlane = only(set, "KubeadmControlPlane", CONTROL_PLANE);
  const [machine] = set.controlledBy(controlPlane, "Machine");
  const firstProvisioning = created(cluster) + CLUSTER;

  function clusterHas() {
    expectCondition(cluster, "ControlPlaneInitialized", "False");
    expectCondition(cluster, "Available", "False");
    expectCondition(cluster, "ScalingUp", "False");
    expect(CAPTURE - created(cluster)).toBeLessThan(CLUSTER);
  }

  function controlPlaneHas() {
    clusterHas();
    expect(path(controlPlane, "status", "initialization", "controlPlaneInitialized")).toBeUndefined();
    expectCondition(controlPlane, "ScalingUp", "False");
    expect(set.controlledBy(controlPlane, "Machine").map(name)).toEqual([name(machine)]);
    expect(hasNode(machine)).toBe(false);
  }

  it("the Cluster, at the capture: Unhealthy, in the tone of progress for its first 30 minutes, Provisioning since its creation", () => {
    clusterHas();
    expect(read(set.statusOf(cluster, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Provisioning until ${offset(firstProvisioning)}`,
      activities: [`Provisioning Progressing since ${offset(created(cluster))}`],
      marks: [],
      notes: [],
    });
  });

  it("the Cluster, past the thresholds: Unhealthy, in the tone of a warning", () => {
    clusterHas();
    expect(read(set.statusOf(cluster, PAST))).toEqual({
      health: "Unhealthy",
      tone: "warning by Provisioning",
      activities: [`Provisioning Progressing since ${offset(created(cluster))}`],
      marks: [],
      notes: [],
    });
  });

  it("its KubeadmControlPlane, at the capture: Unhealthy, in the tone of progress, Provisioning since its Machine was created", () => {
    controlPlaneHas();
    // The threshold of its Machine, raised to the end of the 30 minutes of the Cluster (P2).
    expect(read(set.statusOf(controlPlane, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Provisioning until ${offset(Math.max(created(machine) + MACHINE, firstProvisioning))}`,
      activities: [`Provisioning Progressing since ${offset(created(machine))}`],
      marks: [],
      notes: [],
    });
  });

  it("its KubeadmControlPlane, past the thresholds: Unhealthy, in the tone of a warning", () => {
    controlPlaneHas();
    expect(read(set.statusOf(controlPlane, PAST))).toEqual({
      health: "Unhealthy",
      tone: "warning by Provisioning",
      activities: [`Provisioning Progressing since ${offset(created(machine))}`],
      marks: [],
      notes: [],
    });
  });
});

describe("Provisioned and healthy", () => {
  const set = fixture("healthy");
  const kinds: [string, string][] = [
    ["Cluster", CORE],
    ["KubeadmControlPlane", CONTROL_PLANE],
    ["MachineDeployment", CORE],
    ["MachineSet", CORE],
    ["Machine", CORE],
    ["KubeadmConfig", BOOTSTRAP],
  ];
  const objects = kinds.flatMap(([kind, apiVersion]) => set.ofKind(kind, apiVersion));
  const summaries: Readonly<Record<string, string>> = {
    Cluster: "Available",
    KubeadmControlPlane: "Available",
    MachineDeployment: "Available",
    Machine: "Ready",
    KubeadmConfig: "Ready",
  };
  const NEGATIVE = new Set(["Paused", "Deleting", "RollingOut", "ScalingUp", "ScalingDown", "Remediating", "Updating"]);

  function has(object: KubeObject) {
    const summary = summaries[object.kind];

    if (summary === undefined) {
      // A MachineSet has no summary: what stands for one is every replica available (P9).
      expect(path(object, "status", "availableReplicas"), name(object)).toBe(path(object, "spec", "replicas"));
    } else {
      expectCondition(object, summary, "True");
    }
    for (const condition of (path(object, "status", "conditions") as Condition[] | undefined) ?? []) {
      if (!NEGATIVE.has(condition.type)) {
        expect(condition.status, `${name(object)}: ${condition.type}`).not.toBe("False");
      }
    }
    expectNoActivityCondition(object);
    if (object.kind === "Machine") expectCondition(object, "Ready", "True");
  }

  it("the Cluster, its control plane, MachineDeployments, MachineSets, Machines and KubeadmConfigs: Healthy and Idle", () => {
    expectReachable(only(set, "Cluster"));
    for (const [kind, apiVersion] of kinds) expect(set.ofKind(kind, apiVersion).length, kind).toBeGreaterThan(0);
    for (const object of objects) {
      has(object);
      for (const now of [CAPTURE, PAST]) {
        expect(read(set.statusOf(object, now)), `${name(object)} at ${offset(now)}`).toEqual({
          health: "Healthy",
          tone: "health",
          activities: ["Idle"],
          marks: [],
          notes: [],
        });
      }
    }
  });

  it("its templates and its bindings: no health and no activity, the DevMachineTemplates with the capacity that the development provider writes (P16)", () => {
    const templates = set.objects.filter(
      (object) => object.kind.endsWith("Template") || object.kind === "ClusterResourceSetBinding",
    );

    expect(templates.length).toBeGreaterThan(0);
    for (const object of templates) {
      if (object.kind === "DevMachineTemplate") {
        expect(Object.keys(object.status ?? {}), name(object)).toEqual(["capacity"]);
      } else {
        expect(object.status, name(object)).toBeUndefined();
      }
      expect(read(set.statusOf(object, CAPTURE)), name(object)).toEqual({
        health: "none: no status",
        tone: "health",
        activities: ["none"],
        marks: [],
        notes: [],
      });
    }
  });
});

describe("A Machine that never got a Node", () => {
  const set = fixture("machine-without-node");
  const machine = set.ofKind("Machine").find((each) => !hasNode(each)) as KubeObject;
  const machineSet = set.ofKind("MachineSet").find((each) => set.controlledBy(each, "Machine").includes(machine));
  const cluster = only(set, "Cluster");
  const threshold = () => created(machine) + MACHINE;

  function machineHas() {
    expectReachable(cluster);
    expect(machine, "a Machine with no Node").toBeDefined();
    expect(path(machine, "status", "phase")).toBe("Provisioned");
    expectCondition(machine, "BootstrapConfigReady", "True");
    expectCondition(machine, "InfrastructureReady", "True");
    expectCondition(machine, "NodeHealthy", "Unknown");
    expectNoCondition(machine, "HealthCheckSucceeded");
  }

  function machineSetHas() {
    machineHas();
    expect(machineSet, "the MachineSet of that Machine").toBeDefined();
    const owned = set.controlledBy(machineSet as KubeObject, "Machine");

    expect(path(machineSet, "status", "replicas")).toBe(path(machineSet, "spec", "replicas"));
    expect(path(machineSet, "status", "availableReplicas")).toBeLessThan(
      path(machineSet, "spec", "replicas") as number,
    );
    expect(owned.filter((each) => conditionOf(each, "Available")?.status !== "True").map(name)).toEqual([
      name(machine),
    ]);
  }

  it("the Machine, at the capture: Unknown, in the tone of its health, Provisioning in the tone of progress", () => {
    machineHas();
    const status = set.statusOf(machine, CAPTURE);

    expect(read(status)).toEqual({
      health: "Unknown",
      tone: "health",
      activities: [`Provisioning Progressing since ${offset(created(machine))}`],
      marks: [],
      notes: [],
    });
    expect(status.activities.state === "read" && status.activities.activities[0].tone).toBe("progress");
    expect(status.changesAt).toBe(threshold());
  });

  it("the Machine, past the threshold: Provisioning in the tone of a warning", () => {
    machineHas();
    const status = set.statusOf(machine, PAST);

    expect(read(status).activities).toEqual([`Provisioning Progressing since ${offset(created(machine))}`]);
    expect(status.activities.state === "read" && status.activities.activities[0].tone).toBe("warning");
  });

  it("its MachineSet, at the capture: Unhealthy, in the tone of progress, Provisioning since that Machine was created", () => {
    machineSetHas();
    expect(read(set.statusOf(machineSet as KubeObject, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Provisioning until ${offset(threshold())}`,
      activities: [`Provisioning Progressing since ${offset(created(machine))}`],
      marks: [],
      notes: [],
    });
  });

  it("its MachineSet, past the threshold of that Machine: in the tone of a warning", () => {
    machineSetHas();
    expect(read(set.statusOf(machineSet as KubeObject, PAST)).tone).toBe("warning by Provisioning");
  });

  it("its Cluster, which owns that MachineSet beside its topology and does not follow it: Healthy and Idle", () => {
    machineSetHas();
    expect(machineSet?.metadata.ownerReferences?.map((owner) => owner.kind)).toEqual(["Cluster"]);
    expectCondition(cluster, "Available", "True");
    expectCondition(cluster, "WorkersAvailable", "True");
    for (const now of [CAPTURE, PAST]) {
      expect(read(set.statusOf(cluster, now))).toEqual({
        health: "Healthy",
        tone: "health",
        activities: ["Idle"],
        marks: [],
        notes: [],
      });
    }
  });
});

describe("Rolling out", () => {
  const set = fixture("rolling-out");
  const deployment = only(set, "MachineDeployment");
  const cluster = only(set, "Cluster");
  const machines = set.machinesOf(deployment) ?? [];
  const starting = machines.filter((machine) => conditionOf(machine, "Ready")?.status !== "True");
  const [newMachine] = starting;

  function deploymentHas() {
    expectReachable(cluster);
    expect(path(deployment, "spec", "rollout", "strategy", "type")).toBe("RollingUpdate");
    expectCondition(deployment, "RollingOut", "True");
    expectCondition(deployment, "Available", "True");
    expectCondition(deployment, "MachinesReady", "False");
    expectCondition(deployment, "MachinesUpToDate", "False");
    expectCondition(deployment, "ScalingDown", "True");
    expectCondition(deployment, "ScalingUp", "False");
    expect(starting.map(name)).toHaveLength(1);
    expectMachineStarting(newMachine, true);
    expect(machines.filter((machine) => machine.metadata.deletionTimestamp !== undefined)).toEqual([]);
  }

  // The reading of the Cluster rests on that of its MachineDeployment, which it rolls out and provisions through.
  function clusterHas() {
    deploymentHas();
    expectCondition(cluster, "RollingOut", "True");
    expectCondition(cluster, "ScalingDown", "True");
    expectCondition(cluster, "Available", "True");
    expectCondition(cluster, "WorkerMachinesReady", "False");
    expectCondition(cluster, "WorkerMachinesUpToDate", "False");
  }

  it("the MachineDeployment, at the capture: Degraded from MachinesReady alone, Provisioning, Rolling out and Scaling down", () => {
    deploymentHas();
    const status = set.statusOf(deployment, CAPTURE);

    expect(issuesOf(status)).toEqual(["MachinesReady"]);
    expect(read(status)).toEqual({
      health: "Degraded",
      tone: `progress by Scaling down until ${offset(transition(deployment, "ScalingDown") + DELETION)}`,
      activities: [
        `Provisioning Progressing since ${offset(created(newMachine))}`,
        `Rolling out Progressing since ${offset(transition(deployment, "RollingOut"))}`,
        `Scaling down Progressing since ${offset(transition(deployment, "ScalingDown"))}`,
      ],
      marks: [],
      notes: [],
    });
  });

  it("the MachineDeployment, past the thresholds: in the tone of a warning, its new Machine no longer Provisioning", () => {
    deploymentHas();
    expect(read(set.statusOf(deployment, PAST))).toEqual({
      health: "Degraded",
      tone: "warning by Scaling down",
      activities: [
        `Rolling out Progressing since ${offset(transition(deployment, "RollingOut"))}`,
        `Scaling down Progressing since ${offset(transition(deployment, "ScalingDown"))}`,
      ],
      marks: [],
      notes: [],
    });
  });

  it("its Cluster, at the capture: Degraded from WorkerMachinesReady alone, Provisioning through its MachineDeployment, Rolling out and Scaling down", () => {
    clusterHas();
    const status = set.statusOf(cluster, CAPTURE);

    expect(issuesOf(status)).toEqual(["WorkerMachinesReady"]);
    expect(read(status)).toEqual({
      health: "Degraded",
      tone: `progress by Scaling down until ${offset(transition(cluster, "ScalingDown") + DELETION)}`,
      activities: [
        `Provisioning Progressing since ${offset(created(newMachine))}`,
        `Rolling out Progressing since ${offset(transition(cluster, "RollingOut"))}`,
        `Scaling down Progressing since ${offset(transition(cluster, "ScalingDown"))}`,
      ],
      marks: [],
      notes: [],
    });
  });

  it("its Cluster, past the thresholds: in the tone of a warning", () => {
    clusterHas();
    expect(read(set.statusOf(cluster, PAST))).toEqual({
      health: "Degraded",
      tone: "warning by Scaling down",
      activities: [
        `Rolling out Progressing since ${offset(transition(cluster, "RollingOut"))}`,
        `Scaling down Progressing since ${offset(transition(cluster, "ScalingDown"))}`,
      ],
      marks: [],
      notes: [],
    });
  });
});

describe("Scaling up, held by the preflight checks", () => {
  const set = fixture("scaling-up-held");
  const deployment = only(set, "MachineDeployment");
  const machineSet = only(set, "MachineSet");
  const owners = [deployment, machineSet];

  function has() {
    expectReachable(only(set, "Cluster"));
    for (const owner of owners) {
      expectCondition(owner, "ScalingUp", "True");
      expect(set.machinesOf(owner)?.length).toBeLessThan(path(owner, "spec", "replicas") as number);
      expect((set.machinesOf(owner) ?? []).every(hasNode), `every Machine of ${name(owner)} has a Node`).toBe(true);
    }
    expectCondition(deployment, "Available", "False");
    expect(path(deployment, "spec", "rollout", "strategy", "rollingUpdate", "maxUnavailable")).toBe(0);
    expect(conditionOf(machineSet, "ScalingUp")?.message).toContain(" is blocked because");
  }

  for (const [label, now] of [
    ["at the capture", CAPTURE],
    ["past the thresholds", PAST],
  ] as const) {
    it(`the MachineDeployment and its MachineSet, ${label}: Unhealthy, Scaling up, Progressing, in the tone of ${now === CAPTURE ? "progress" : "a warning"}`, () => {
      has();
      for (const owner of owners) {
        const ending = transition(owner, "ScalingUp") + MACHINE;

        expect(read(set.statusOf(owner, now)), name(owner)).toEqual({
          health: "Unhealthy",
          tone: now === CAPTURE ? `progress by Scaling up until ${offset(ending)}` : "warning by Scaling up",
          activities: [`Scaling up Progressing since ${offset(transition(owner, "ScalingUp"))}`],
          marks: [],
          notes: [],
        });
      }
    });
  }
});

describe("Scaling up", () => {
  const set = fixture("scaling-up");
  const deployment = only(set, "MachineDeployment");
  const cluster = only(set, "Cluster");
  const controlPlane = only(set, "KubeadmControlPlane", CONTROL_PLANE);
  const [newWorker] = (set.machinesOf(deployment) ?? []).filter(
    (each) => conditionOf(each, "Available")?.status !== "True",
  );
  const [newControlPlaneMachine] = set
    .controlledBy(controlPlane, "Machine")
    .filter((each) => conditionOf(each, "Available")?.status !== "True");

  function deploymentHas() {
    expectReachable(cluster);
    expectCondition(deployment, "ScalingUp", "False");
    expectCondition(deployment, "Available", "False");
    expect(path(deployment, "spec", "rollout", "strategy", "rollingUpdate", "maxUnavailable")).toBe(0);
    expect(newWorker, "a new worker").toBeDefined();
    expectMachineStarting(newWorker, true);
  }

  function clusterHas() {
    deploymentHas();
    // `Available` `False` through `WorkersAvailable` alone, of the inputs that it merges (SPEC-0001, R2.21).
    expectCondition(cluster, "Available", "False");
    for (const type of ["RemoteConnectionProbe", "InfrastructureReady", "ControlPlaneAvailable"]) {
      expectCondition(cluster, type, "True");
    }
    expectCondition(cluster, "WorkersAvailable", "False");
    expectCondition(cluster, "ScalingUp", "True");
    expectCondition(controlPlane, "ScalingUp", "True");
    expect(newControlPlaneMachine, "a new control plane Machine").toBeDefined();
    expectMachineStarting(newControlPlaneMachine, false);
  }

  it("a MachineDeployment whose Machines are created, at the capture: Unhealthy, Provisioning since its new Machine was created", () => {
    deploymentHas();
    expect(read(set.statusOf(deployment, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Provisioning until ${offset(created(newWorker) + MACHINE)}`,
      activities: [`Provisioning Progressing since ${offset(created(newWorker))}`],
      marks: [],
      notes: [],
    });
  });

  it("a MachineDeployment whose Machines are created, past the threshold of its new Machine, which has its Node: Idle, in the tone of its health (D3)", () => {
    deploymentHas();
    expect(read(set.statusOf(deployment, PAST))).toEqual({
      health: "Unhealthy",
      tone: "health",
      activities: ["Idle"],
      marks: [],
      notes: [],
    });
  });

  it("the Cluster of that MachineDeployment, at the capture: Unhealthy, Provisioning through the oldest part that provisions, and Scaling up", () => {
    clusterHas();
    const oldest = Math.min(created(newWorker), created(newControlPlaneMachine));

    expect(read(set.statusOf(cluster, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Scaling up until ${offset(transition(cluster, "ScalingUp") + MACHINE)}`,
      activities: [
        `Provisioning Progressing since ${offset(oldest)}`,
        `Scaling up Progressing since ${offset(transition(cluster, "ScalingUp"))}`,
      ],
      marks: [],
      notes: [],
    });
  });

  it("the Cluster of that MachineDeployment, past the thresholds: in the tone of a warning, its control plane Machine still with no Node", () => {
    clusterHas();
    expect(read(set.statusOf(cluster, PAST))).toEqual({
      health: "Unhealthy",
      tone: "warning by Scaling up",
      activities: [
        `Provisioning Progressing since ${offset(created(newControlPlaneMachine))}`,
        `Scaling up Progressing since ${offset(transition(cluster, "ScalingUp"))}`,
      ],
      marks: [],
      notes: [],
    });
  });
});

describe("Scaling down", () => {
  const set = fixture("scaling-down");
  const deployment = only(set, "MachineDeployment");
  const deleting = (set.machinesOf(deployment) ?? []).filter((each) => each.metadata.deletionTimestamp !== undefined);

  function has() {
    expectReachable(only(set, "Cluster"));
    expectCondition(deployment, "ScalingDown", "True");
    expectCondition(deployment, "Available", "True");
    expectCondition(deployment, "MachinesReady", "False");
    expect(deleting.map(name)).toHaveLength(1);
    expect(CAPTURE - deleted(deleting[0])).toBeLessThan(DELETION);
  }

  it("a MachineDeployment scaling down, at the capture: Degraded from MachinesReady, Scaling down in the tone of progress", () => {
    has();
    const status = set.statusOf(deployment, CAPTURE);

    expect(issuesOf(status)).toEqual(["MachinesReady"]);
    expect(read(status)).toEqual({
      health: "Degraded",
      tone: `progress by Scaling down until ${offset(transition(deployment, "ScalingDown") + DELETION)}`,
      activities: [`Scaling down Progressing since ${offset(transition(deployment, "ScalingDown"))}`],
      marks: [],
      notes: [],
    });
  });

  it("a MachineDeployment scaling down, past 15 minutes from the transition of ScalingDown: in the tone of a warning", () => {
    has();
    expect(read(set.statusOf(deployment, PAST))).toEqual({
      health: "Degraded",
      tone: "warning by Scaling down",
      activities: [`Scaling down Progressing since ${offset(transition(deployment, "ScalingDown"))}`],
      marks: [],
      notes: [],
    });
  });
});

describe("Paused", () => {
  const set = fixture("paused");
  const byOwnAnnotation = ["ClusterClass", "ClusterResourceSet"];
  const withStatus = set.objects.filter((object) => object.status !== undefined && ROLES[object.kind] !== "template");
  const followers = withStatus.filter((object) => !byOwnAnnotation.includes(object.kind));
  const others = withStatus.filter((object) => byOwnAnnotation.includes(object.kind));

  it("the Cluster and its objects with a status: the health of their conditions, Paused alone, with the mark Paused since its transition", () => {
    expectReachable(only(set, "Cluster"));
    expect(followers.length).toBeGreaterThan(1);
    for (const object of followers) {
      expectCondition(object, "Paused", "True");
      const status = set.statusOf(object, CAPTURE);

      expect(read(status), name(object)).toEqual({
        health: "Healthy",
        tone: "health",
        activities: [`Paused Progressing since ${offset(transition(object, "Paused"))}`],
        marks: [`Paused since ${offset(transition(object, "Paused"))}`],
        notes: [],
      });
      expect(read(set.statusOf(object, PAST)), name(object)).toEqual(read(status));
    }
  });

  it("its ClusterClass and its ClusterResourceSet, which follow their own annotation alone (P19): not paused, Idle", () => {
    expect(others.map((object) => object.kind).sort()).toEqual(byOwnAnnotation);
    for (const object of others) {
      expectCondition(object, "Paused", "False");
      expect(read(set.statusOf(object, CAPTURE)), name(object)).toEqual({
        health: "Healthy",
        tone: "health",
        activities: ["Idle"],
        marks: [],
        notes: [],
      });
    }
  });
});

describe("Deleting", () => {
  const set = fixture("deleting");
  const cluster = only(set, "Cluster");

  function has() {
    expect(cluster.metadata.deletionTimestamp).toBeDefined();
    expectCondition(cluster, "Deleting", "True", "WaitingForWorkersDeletion");
    expect(conditionOf(cluster, "TopologyReconciled")?.message).not.toContain("hook");
    // A scale down that its deletion makes, which a deleting object does not show (D3).
    expectCondition(cluster, "ScalingDown", "True");
    expect(CAPTURE - deleted(cluster)).toBeLessThan(DELETION);
  }

  for (const [label, now, tone] of [
    ["at the capture", CAPTURE, "terminated"],
    ["past 15 minutes of its deletion", PAST, "warning"],
  ] as const) {
    it(`the Cluster, ${label}: no health, Deleting alone, with the stage of its reason, in the tone ${tone}`, () => {
      has();
      const status = set.statusOf(cluster, now);

      expect(read(status)).toEqual({
        health: "none: deleting",
        tone: "health",
        activities: [`Deleting Progressing since ${offset(deleted(cluster))}`],
        marks: [],
        notes: [],
      });
      expect(status.activities.state === "read" && status.activities.activities[0]).toMatchObject({
        tone,
        condition: { type: "Deleting", reason: "WaitingForWorkersDeletion" },
      });
    });
  }
});

describe("With a managed topology, upgrading", () => {
  const set = fixture("upgrading");
  const cluster = only(set, "Cluster");
  const controlPlane = only(set, "KubeadmControlPlane", CONTROL_PLANE);
  const [newMachine] = set.controlledBy(controlPlane, "Machine").filter((each) => !hasNode(each));

  function has() {
    expectReachable(cluster);
    expectCondition(cluster, "TopologyReconciled", "False", "ClusterUpgrading");
    expect(conditionOf(cluster, "TopologyReconciled")?.message).not.toContain("hook");
    expectCondition(cluster, "RollingOut", "True");
    expectCondition(cluster, "ScalingDown", "True");
    expectCondition(cluster, "Available", "True");
    expectCondition(cluster, "ControlPlaneMachinesReady", "False");
    expectCondition(controlPlane, "RollingOut", "True");
    expect(newMachine, "a control plane Machine with no Node").toBeDefined();
  }

  const activities = () => [
    `Provisioning Progressing since ${offset(created(newMachine))}`,
    `Upgrading Progressing since ${offset(transition(cluster, "TopologyReconciled"))}`,
    `Rolling out Progressing since ${offset(transition(cluster, "RollingOut"))}`,
    `Scaling down Progressing since ${offset(transition(cluster, "ScalingDown"))}`,
  ];

  it("the Cluster, at the capture: Degraded from ControlPlaneMachinesReady, Provisioning through its control plane, Upgrading, Rolling out and Scaling down", () => {
    has();
    const status = set.statusOf(cluster, CAPTURE);

    expect(issuesOf(status)).toEqual(["ControlPlaneMachinesReady"]);
    expect(read(status)).toEqual({
      health: "Degraded",
      tone: `progress by Scaling down until ${offset(transition(cluster, "ScalingDown") + DELETION)}`,
      activities: activities(),
      marks: [],
      notes: [],
    });
  });

  it("the Cluster, past the thresholds: in the tone of a warning", () => {
    has();
    expect(read(set.statusOf(cluster, PAST))).toEqual({
      health: "Degraded",
      tone: "warning by Scaling down",
      activities: activities(),
      marks: [],
      notes: [],
    });
  });
});

describe("Without a managed topology", () => {
  const set = fixture("without-topology");
  const cluster = only(set, "Cluster");

  it("the Cluster: Healthy and Idle", () => {
    expect(path(cluster, "spec", "topology")).toBeUndefined();
    expectNoCondition(cluster, "TopologyReconciled");
    expectCondition(cluster, "Available", "True");
    for (const type of ["ControlPlaneMachinesReady", "WorkerMachinesReady", "ControlPlaneInitialized"]) {
      expectCondition(cluster, type, "True");
    }
    expectNoActivityCondition(cluster);
    for (const now of [CAPTURE, PAST]) {
      expect(read(set.statusOf(cluster, now))).toEqual({
        health: "Healthy",
        tone: "health",
        activities: ["Idle"],
        marks: [],
        notes: [],
      });
    }
  });
});

describe("With MachinePools only", () => {
  const set = fixture("machine-pools");
  const cluster = only(set, "Cluster");
  const pool = only(set, "MachinePool");
  const controlPlane = only(set, "KubeadmControlPlane", CONTROL_PLANE);
  const [controlPlaneMachine] = set.controlledBy(controlPlane, "Machine");
  const poolMachines = set.controlledBy(pool, "Machine");

  function poolHas() {
    expectReachable(cluster);
    expect(poolMachines.length).toBeGreaterThan(0);
    for (const machine of poolMachines) {
      expectCondition(machine, "Ready", "False");
      expectMachineStarting(machine, true);
    }
    expect(path(pool, "status", "replicas")).toBe(path(pool, "spec", "replicas"));
  }

  // The reading of the Cluster rests on that of its parts, its pool included.
  function clusterHas() {
    poolHas();
    expectCondition(cluster, "Available", "True");
    expectCondition(cluster, "ControlPlaneMachinesReady", "False");
    expectCondition(cluster, "WorkersAvailable", "True", "NoWorkers");
    expectNoActivityCondition(cluster);
    expectMachineStarting(controlPlaneMachine, true);
  }

  it("the Cluster, at the capture: Degraded where the project says available, in the tone of progress through its parts", () => {
    clusterHas();
    const status = set.statusOf(cluster, CAPTURE);

    expect(issuesOf(status)).toEqual(["ControlPlaneMachinesReady", `machine-pool ${pool.metadata.name}`]);
    expect(read(status)).toEqual({
      health: "Degraded",
      tone: `progress by Provisioning until ${offset(created(poolMachines[0]) + MACHINE)}`,
      activities: [`Provisioning Progressing since ${offset(created(controlPlaneMachine))}`],
      marks: [],
      notes: [],
    });
  });

  it("the Cluster, past the thresholds of its Machines, which have their Nodes: Idle, in the tone of its health", () => {
    clusterHas();
    expect(read(set.statusOf(cluster, PAST))).toEqual({
      health: "Degraded",
      tone: "health",
      activities: ["Idle"],
      marks: [],
      notes: [],
    });
  });

  it("a MachinePool with Machines, at the capture: Unhealthy, Provisioning since its Machine was created, and Unknown", () => {
    poolHas();
    expect(read(set.statusOf(pool, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Provisioning until ${offset(created(poolMachines[0]) + MACHINE)}`,
      activities: [`Provisioning Progressing since ${offset(created(poolMachines[0]))}`, "Unknown"],
      marks: [],
      notes: [],
    });
  });

  it("a MachinePool with Machines, past the threshold of its Machine, which has its Node: Unknown, in the tone of its health", () => {
    poolHas();
    expect(read(set.statusOf(pool, PAST))).toEqual({
      health: "Unhealthy",
      tone: "health",
      activities: ["Unknown"],
      marks: [],
      notes: [],
    });
  });
});

describe("With MachinePools only, written by hand", () => {
  const set = fixture("machine-pool-without-machines");
  const cluster = only(set, "Cluster");
  const pool = only(set, "MachinePool");
  const controlPlane = only(set, "KubeadmControlPlane", CONTROL_PLANE);
  const [controlPlaneMachine] = set.controlledBy(controlPlane, "Machine");
  const atZero = set.with(pool, { ...pool, spec: { ...pool.spec, replicas: 0 } });

  function poolHas() {
    expectReachable(cluster);
    expect(set.controlledBy(pool, "Machine")).toEqual([]);
    expect(path(pool, "spec", "replicas")).toBeGreaterThan(0);
    expect(path(pool, "status", "replicas")).toBe(path(pool, "spec", "replicas"));
    expect(path(pool, "status", "nodeRefs")).toHaveLength(1);
  }

  it("a MachinePool without Machines: Unknown, no Provisioning while its nodeRefs name its Node, no scale, and the note of its deprecated Ready", () => {
    poolHas();
    const status = set.statusOf(pool, CAPTURE);

    expect(read(status)).toEqual({
      health: "Unknown",
      tone: "health",
      activities: ["Unknown"],
      marks: [],
      notes: ["no-machine"],
    });
    expect(status.notes[0]).toMatchObject({ deprecatedReady: { type: "Ready", status: "False" } });
  });

  it("the same MachinePool at 0 replicas: Healthy, Scaling down and Unknown, never Provisioning", () => {
    poolHas();
    for (const now of [CAPTURE, PAST]) {
      expect(read(atZero.statusOf(only(atZero, "MachinePool"), now))).toEqual({
        health: "Healthy",
        tone: "health",
        activities: ["Scaling down Progressing", "Unknown"],
        marks: [],
        notes: [],
      });
    }
  });

  it("its Cluster: as the Cluster of the first set of MachinePools only, the pool adding no issue, with one MachinePool of unknown health", () => {
    poolHas();
    expectCondition(cluster, "Available", "True");
    expectCondition(cluster, "ControlPlaneMachinesReady", "False");
    expectCondition(cluster, "WorkersAvailable", "True", "NoWorkers");
    expectNoActivityCondition(cluster);
    expectMachineStarting(controlPlaneMachine, true);
    const status = set.statusOf(cluster, CAPTURE);

    expect(issuesOf(status)).toEqual(["ControlPlaneMachinesReady"]);
    expect(read(status)).toEqual({
      health: "Degraded",
      tone: `progress by Provisioning until ${offset(created(controlPlaneMachine) + MACHINE)}`,
      activities: [`Provisioning Progressing since ${offset(created(controlPlaneMachine))}`],
      marks: [],
      notes: ["machine-pools-unknown"],
    });
    expect(read(set.statusOf(cluster, PAST))).toEqual({
      health: "Degraded",
      tone: "health",
      activities: ["Idle"],
      marks: [],
      notes: ["machine-pools-unknown"],
    });
  });
});

describe("A remediation in progress", () => {
  const set = fixture("remediation");
  const deployment = only(set, "MachineDeployment");
  const machineSet = only(set, "MachineSet");
  const workers = set.machinesOf(deployment) ?? [];
  const waiting = workers.find((each) => each.metadata.deletionTimestamp === undefined) as KubeObject;
  const remediated = workers.find((each) => each.metadata.deletionTimestamp !== undefined) as KubeObject;

  function machineHas() {
    expectReachable(only(set, "Cluster"));
    expect(workers.map(name)).toHaveLength(2);
    expectCondition(waiting, "HealthCheckSucceeded", "False");
    expectCondition(waiting, "OwnerRemediated", "False", "RemediationDeferred");
    expectMachineStarting(waiting, true);
  }

  function ownersHave() {
    machineHas();
    expectCondition(remediated, "OwnerRemediated", "False", "MachineDeleting");
    expectCondition(remediated, "Deleting", "True", "WaitingForPreDrainHook");
    for (const owner of [machineSet, deployment]) expectCondition(owner, "Remediating", "True");
  }

  it("the Machine whose remediation waits, at the capture: Unhealthy, Remediating, and Provisioning while younger than its threshold (D3)", () => {
    machineHas();
    expect(read(set.statusOf(waiting, CAPTURE))).toEqual({
      health: "Unhealthy",
      tone: `progress by Remediating until ${offset(transition(waiting, "OwnerRemediated") + MACHINE)}`,
      activities: [
        `Provisioning Progressing since ${offset(created(waiting))}`,
        `Remediating Progressing since ${offset(transition(waiting, "OwnerRemediated"))}`,
      ],
      marks: [],
      notes: [],
    });
  });

  it("the Machine whose remediation waits, past the threshold of its remediation: Remediating, in the tone of a warning", () => {
    machineHas();
    expect(read(set.statusOf(waiting, PAST))).toEqual({
      health: "Unhealthy",
      tone: "warning by Remediating",
      activities: [`Remediating Progressing since ${offset(transition(waiting, "OwnerRemediated"))}`],
      marks: [],
      notes: [],
    });
  });

  for (const [label, now] of [
    ["at the capture", CAPTURE],
    ["past the thresholds", PAST],
  ] as const) {
    it(`its MachineSet and MachineDeployment, ${label}: Unhealthy, Remediating and Replacing${now === CAPTURE ? ", and Provisioning through the waiting Machine" : ""}`, () => {
      ownersHave();
      for (const owner of [machineSet, deployment]) {
        const replacing = deleted(remediated);

        expect(read(set.statusOf(owner, now)), name(owner)).toEqual({
          health: "Unhealthy",
          tone:
            now === CAPTURE ? `progress by Replacing until ${offset(replacing + DELETION)}` : "warning by Replacing",
          activities: [
            ...(now === CAPTURE ? [`Provisioning Progressing since ${offset(created(waiting))}`] : []),
            `Remediating Progressing since ${offset(transition(owner, "Remediating"))}`,
            `Replacing Progressing since ${offset(replacing)}`,
          ],
          marks: [],
          notes: [],
        });
      }
    });
  }
});

describe("Objects with no status", () => {
  const set = fixture("no-status");

  function has(object: KubeObject) {
    expect(object.status, name(object)).toBeUndefined();
  }

  it("the Cluster, its Machine, MachinePool, KubeadmControlPlane, KubeadmConfigs, MachineDeployment and MachineSet: Unknown, the owners with no Machine", () => {
    const objects = [
      ...["Cluster", "Machine", "MachinePool", "MachineDeployment", "MachineSet"].map((kind) => only(set, kind)),
      only(set, "KubeadmControlPlane", CONTROL_PLANE),
      ...set.ofKind("KubeadmConfig", BOOTSTRAP),
    ];

    for (const object of objects) {
      has(object);
      if (["MachineSet", "MachineDeployment", "MachinePool", "KubeadmControlPlane"].includes(object.kind)) {
        expect(set.machinesOf(object), name(object)).toEqual([]);
      }
      expect(read(set.statusOf(object, CAPTURE)), name(object)).toEqual({
        health: "Unknown",
        tone: "health",
        activities: ["Unknown"],
        marks: [],
        notes: object.kind === "Cluster" ? ["machine-pools-unknown"] : [],
      });
    }
  });

  it("its MachineHealthCheck, ClusterResourceSet, ClusterClass and IPAddressClaim: Unknown, with the note of P12 and the provider that no pool of the set names", () => {
    const objects = [
      only(set, "MachineHealthCheck"),
      only(set, "ClusterResourceSet", ADDONS),
      only(set, "ClusterClass"),
      only(set, "IPAddressClaim", "ipam.cluster.x-k8s.io/v1beta2"),
    ];
    const notes: Readonly<Record<string, readonly string[]>> = {
      ClusterResourceSet: ["applied-to-no-cluster"],
      IPAddressClaim: ["input-not-given: provider"],
    };

    for (const object of objects) {
      has(object);
      expect(read(set.statusOf(object, CAPTURE)), name(object)).toEqual({
        health: "Unknown",
        tone: "health",
        activities: ["Unknown"],
        marks: [],
        notes: notes[object.kind] ?? [],
      });
    }
  });

  it("each kind with no status: no health and no activity", () => {
    const kinds = [
      "ClusterResourceSetBinding",
      "DevClusterTemplate",
      "DevMachinePoolTemplate",
      "DevMachineTemplate",
      "IPAddress",
      "KubeadmConfigTemplate",
      "KubeadmControlPlaneTemplate",
      "MachineDrainRule",
      "Provider",
    ];
    const objects = set.objects.filter((object) => kinds.includes(object.kind));

    expect([...new Set(objects.map((object) => object.kind))].sort()).toEqual(kinds);
    for (const object of objects) {
      has(object);
      expect(read(set.statusOf(object, CAPTURE)), name(object)).toEqual({
        health: "none: no status",
        tone: "health",
        activities: ["none"],
        marks: [],
        notes: [],
      });
    }
  });
});
