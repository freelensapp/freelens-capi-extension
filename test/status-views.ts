// The status model read as a view reads it (SPEC-0003, "What it takes and returns"): each object of a set, a fixture
// set of SPEC-0002 or the objects of the trial S7 on the real project, evaluated with the context that a view builds
// from the same set; and what a case asserts of the result. The cases on the fixtures
// (src/common/status/fixtures.test.ts) and the test of S7 (test/real-project/s7.tests.ts) share it.
//
// The context of an object, from the objects of its set:
// - `machines`, by the owner reference, as "What it takes and returns" names them for each kind;
// - `cluster`, the Cluster that its `spec.clusterName` or its label names, else the one that owns it, else that of
//   the object that names it in a reference, as a view finds it from the object it followed the reference from;
// - for a Cluster, `parts` and `machinePools`, the result of `statusOf` for its control plane, its MachineDeployments
//   and its MachinePools, each with its own context, and `clusterClass` when it has a topology and no gates of its
//   own;
// - for a ClusterResourceSet, the bindings of the set, each with its Cluster;
// - for an object of the development provider, the role that the reference that names it gives it (SPEC-0001,
//   R1.15), the contract of its definitions, whose highest contract label is `v1beta2`, and the manifest label of the
//   provider (test/infrastructure/docker/config/crd/kustomization.yaml:5-6;
//   test/infrastructure/docker/config/default/kustomization.yaml:8);
// - `healthChecks`, the MachineHealthChecks of the set, and `controllers`, every provider available, as on the tier
//   that installs with clusterctl, which has no object of the operator to tell (P24).

import { statusOf } from "../src/common/status/index";
import { AVAILABLE_CONTROLLERS } from "./status-objects";

import type { KubeObject } from "../e2e/scripts/fixtures.mts";
import type { Activity, KubeObjectData, ObjectStatus, ProviderRole, StatusContext } from "../src/common/status/index";

export const CORE = "cluster.x-k8s.io/v1beta2";
export const ADDONS = "addons.cluster.x-k8s.io/v1beta2";
export const CONTROL_PLANE = "controlplane.cluster.x-k8s.io/v1beta2";
export const BOOTSTRAP = "bootstrap.cluster.x-k8s.io/v1beta2";
const CLUSTER_NAME = "cluster.x-k8s.io/cluster-name";

// The role of each kind of the development provider, as the reference that names it gives it.
export const ROLES: Readonly<Record<string, ProviderRole>> = {
  DevCluster: "infrastructure-cluster",
  DevMachine: "infrastructure-machine",
  DevMachinePool: "infrastructure-machine-pool",
  DevClusterTemplate: "template",
  DevMachineTemplate: "template",
  DevMachinePoolTemplate: "template",
};

interface Reference {
  readonly kind?: string;
  readonly name?: string;
}

export interface Condition {
  readonly type: string;
  readonly status: string;
  readonly reason?: string;
  readonly message?: string;
  readonly lastTransitionTime?: string;
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// A field of an object by its path, undefined where a level is missing.
export function path(object: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((value, key) => fields(value)[key], object);
}

export function nameOf(object: KubeObject): string {
  return `${object.kind} ${object.metadata.name}`;
}

export function conditionOf(object: KubeObject, type: string): Condition | undefined {
  const conditions = path(object, "status", "conditions");

  return Array.isArray(conditions) ? (conditions as Condition[]).find((each) => each.type === type) : undefined;
}

// A set of objects as the model reads it, through the contexts that a view builds from them.
export class ObjectSet {
  readonly label: string;
  readonly objects: readonly KubeObject[];
  private readonly statuses = new Map<string, ObjectStatus>();

  constructor(label: string, objects: readonly KubeObject[]) {
    this.label = label;
    this.objects = objects;
  }

  ofKind(kind: string, apiVersion = CORE): KubeObject[] {
    return this.objects.filter((object) => object.kind === kind && object.apiVersion === apiVersion);
  }

  named(kind: string, name: string): KubeObject | undefined {
    return this.objects.find((object) => object.kind === kind && object.metadata.name === name);
  }

  // The objects of a kind of the core that an owner controls.
  controlledBy(owner: KubeObject, kind: string): KubeObject[] {
    return this.ofKind(kind).filter((object) =>
      object.metadata.ownerReferences?.some(
        (reference) =>
          reference.controller === true && reference.kind === owner.kind && reference.name === owner.metadata.name,
      ),
    );
  }

  // The Machines of an object, by the owner reference: those it controls, for a MachineSet, a MachinePool and a
  // KubeadmControlPlane; those of its MachineSets, for a MachineDeployment; those labelled with its name, for a
  // Cluster; those that its `status.targets` names, for a MachineHealthCheck; the one that owns it, for a bootstrap
  // config or an infrastructure machine. Undefined for any other object.
  machinesOf(object: KubeObject): KubeObject[] | undefined {
    const machines = this.ofKind("Machine");

    switch (object.kind) {
      case "MachineSet":
      case "MachinePool":
      case "KubeadmControlPlane":
        return this.controlledBy(object, "Machine");
      case "MachineDeployment":
        return this.controlledBy(object, "MachineSet").flatMap((set) => this.controlledBy(set, "Machine"));
      case "Cluster":
        return machines.filter((machine) => machine.metadata.labels?.[CLUSTER_NAME] === object.metadata.name);
      case "MachineHealthCheck": {
        const targets = path(object, "status", "targets");

        return machines.filter((machine) => Array.isArray(targets) && targets.includes(machine.metadata.name));
      }
      case "KubeadmConfig":
      case "DevMachine":
        return machines.filter((machine) =>
          object.metadata.ownerReferences?.some(
            (reference) => reference.kind === "Machine" && reference.name === machine.metadata.name,
          ),
        );
      default:
        return undefined;
    }
  }

  // The object that names this one in a reference: a Cluster its control plane and its infrastructure cluster, a
  // Machine its bootstrap config and its infrastructure machine, a MachinePool those of its template.
  private referrerOf(object: KubeObject): KubeObject | undefined {
    const names = (reference: unknown) =>
      (reference as Reference | undefined)?.kind === object.kind &&
      (reference as Reference | undefined)?.name === object.metadata.name;

    return this.objects.find(
      (each) =>
        (each.kind === "Cluster" &&
          (names(path(each, "spec", "controlPlaneRef")) || names(path(each, "spec", "infrastructureRef")))) ||
        (each.kind === "Machine" &&
          (names(path(each, "spec", "bootstrap", "configRef")) || names(path(each, "spec", "infrastructureRef")))) ||
        (each.kind === "MachinePool" &&
          (names(path(each, "spec", "template", "spec", "bootstrap", "configRef")) ||
            names(path(each, "spec", "template", "spec", "infrastructureRef")))),
    );
  }

  // The Cluster of an object: the one its `spec.clusterName` or its label names, else the one that owns it, else that
  // of the object that names it in a reference.
  clusterOf(object: KubeObject): KubeObject | undefined {
    const byName = path(object, "spec", "clusterName") ?? object.metadata.labels?.[CLUSTER_NAME];
    const owner = object.metadata.ownerReferences?.find((reference) => reference.kind === "Cluster")?.name;

    if (byName !== undefined || owner !== undefined) {
      return this.ofKind("Cluster").find((cluster) => cluster.metadata.name === (byName ?? owner));
    }

    const referrer = this.referrerOf(object);

    if (referrer === undefined) return undefined;
    return referrer.kind === "Cluster" ? referrer : this.clusterOf(referrer);
  }

  contextOf(object: KubeObject, now: number): StatusContext {
    const context: Record<string, unknown> = {
      now,
      controllers: AVAILABLE_CONTROLLERS,
      healthChecks: this.ofKind("MachineHealthCheck"),
    };
    const machines = this.machinesOf(object);

    if (machines !== undefined) context.machines = machines;
    if (ROLES[object.kind] !== undefined) {
      Object.assign(context, { role: ROLES[object.kind], contract: "v1beta2", provider: "infrastructure-docker" });
    }
    if (object.kind === "Cluster") {
      const controlPlane = path(object, "spec", "controlPlaneRef") as Reference | undefined;
      const part = this.objects.find(
        (each) => each.kind === controlPlane?.kind && each.metadata.name === controlPlane?.name,
      );
      const ofCluster = (each: KubeObject) => path(each, "spec", "clusterName") === object.metadata.name;
      const topology = path(object, "spec", "topology", "classRef", "name");

      context.parts = {
        controlPlane: part === undefined ? undefined : this.statusOf(part, now),
        machineDeployments: this.ofKind("MachineDeployment")
          .filter(ofCluster)
          .map((each) => this.statusOf(each, now)),
      };
      context.machinePools = this.ofKind("MachinePool")
        .filter(ofCluster)
        .map((each) => this.statusOf(each, now));
      if (topology !== undefined && path(object, "spec", "availabilityGates") === undefined) {
        context.clusterClass = this.ofKind("ClusterClass").find((each) => each.metadata.name === topology);
      }
    } else {
      const cluster = this.clusterOf(object);

      if (cluster !== undefined) context.cluster = cluster;
    }
    if (object.kind === "ClusterResourceSet") {
      context.bindings = this.ofKind("ClusterResourceSetBinding", ADDONS).map((binding) => ({
        binding,
        cluster: this.clusterOf(binding),
      }));
    }
    return context as unknown as StatusContext;
  }

  statusOf(object: KubeObject, now: number): ObjectStatus {
    const key = `${now} ${object.apiVersion} ${nameOf(object)}`;
    let status = this.statuses.get(key);

    if (status === undefined) {
      status = statusOf(object as unknown as KubeObjectData, this.contextOf(object, now));
      this.statuses.set(key, status);
    }
    return status;
  }

  // The same set with one object changed, as a case that needs a state the project does not produce changes it.
  with(object: KubeObject, changed: KubeObject): ObjectSet {
    return new ObjectSet(
      this.label,
      this.objects.map((each) => (each === object ? changed : each)),
    );
  }
}

// What a case asserts of a result: the word of the health, the tone with the activity that sets it and the instant
// at which it changes, the activities with their states and starts, and the marks and notes, every time written as
// its offset in seconds from an origin, the capture of a fixture or the creation of a Cluster of the trial.
export interface StatusReading {
  readonly health: string;
  readonly tone: string;
  readonly activities: readonly string[];
  readonly marks: readonly string[];
  readonly notes: readonly string[];
}

export function offsetFrom(origin: number, instant: number | undefined): string {
  return instant === undefined ? "no time" : `${(instant - origin) / 1000}s`;
}

function activityText(activity: Activity, origin: number): string {
  const since = activity.since?.state === "accepted" ? ` since ${offsetFrom(origin, activity.since.instant)}` : "";

  return `${activity.name} ${activity.state}${since}`;
}

export function readStatus(status: ObjectStatus, origin: number): StatusReading {
  const { health, tone, activities } = status;
  const setBy = tone.setBy === undefined ? "" : ` by ${tone.setBy.activity.name}`;
  const until = tone.tone === "progress" ? ` until ${offsetFrom(origin, tone.changesAt)}` : "";

  return {
    health: health.health === "none" ? `none: ${health.because}` : health.health,
    tone: `${tone.tone}${setBy}${until}`,
    activities:
      activities.state === "none"
        ? ["none"]
        : [
            ...activities.activities.map((activity) => activityText(activity, origin)),
            ...(activities.idle ? ["Idle"] : []),
            ...(activities.unknown ? ["Unknown"] : []),
          ],
    marks: status.freshness.map((mark) =>
      mark.cause === "Paused" && mark.since?.state === "accepted"
        ? `Paused since ${offsetFrom(origin, mark.since.instant)}`
        : mark.cause,
    ),
    notes: status.notes.map((note) => {
      if (note.code === "input-not-given") return `${note.code}: ${note.input}`;
      if (note.code === "never-available") return `${note.code}: ${note.missing.join(", ")}`;
      return note.code;
    }),
  };
}

// The issues that a health counts, by the condition, the MachinePool, the Machine or the resource they name.
export function issuesOf(status: ObjectStatus): string[] {
  if (status.health.health === "none") return [];
  return status.health.issues.map((issue) =>
    issue.form === "condition" ? issue.type : `${issue.form} ${"name" in issue ? issue.name : ""}`.trim(),
  );
}
