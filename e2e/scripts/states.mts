/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The states of the fixtures, each one a folder of integration/fixtures and a namespace of the same name as
// its workload cluster, and how the real project is brought into each one to capture it. A capture makes a
// workload cluster of its own in its namespace, from a template of the release or from objects of the scripts,
// brings it into its state by what a user or the project does, and takes the objects of the namespace once
// they hold the state and stop changing; the command that runs it then deletes the cluster. One state is
// written by hand, from SPEC-0001 R2.66 to R2.69, since the development provider cannot show it.

import { setTimeout as delay } from "node:timers/promises";
import { ensure } from "./checks.mts";
import {
  CAPTURE_TIME,
  FIXTURE_RESOURCES,
  HOST_BOOT_ID,
  HOST_CAPACITY,
  HOST_KERNEL,
  holdsHostCapacity,
  inNameOrder,
  objectKey,
  printedObjects,
} from "./fixtures.mts";
import {
  clusterWithoutTopology,
  FOREIGN_PROVIDER_ID,
  kindnetLabelArgument,
  machineSetWithoutNode,
  objectsWithoutStatus,
} from "./manifests.mts";

import type { KubeObject } from "./fixtures.mts";

// What a capture needs of the cluster of the real project.
export interface RealProject {
  // kubectl on the cluster of the real project, and its output.
  kubectl(args: string[], options?: { input?: string; timeout?: number }): string;
  // A server-side apply of the objects of a manifest, by the field manager of the scripts.
  apply(manifest: string): void;
  // The pinned clusterctl, on the cluster of the real project.
  clusterctl(args: string[]): string;
  // The manifest of a workload cluster, from a template of the release.
  generate(cluster: WorkloadCluster): string;
  // The ConfigMap with kindnet and the ClusterResourceSet that applies it, for a namespace.
  kindnet(namespace: string): string;
  // The versions of Kubernetes of the workload clusters, and the one that a workload cluster upgrades from.
  kubernetesVersion: string;
  upgradeFromKubernetesVersion: string;
  clusterApiVersion: string;
  log(line: string): void;
}

export interface WorkloadCluster {
  name: string;
  namespace: string;
  flavor: string;
  kubernetesVersion: string;
  controlPlane: number;
  workers: number;
}

// The objects of a namespace, and the moment when they held the state, in seconds, as Kubernetes writes a time.
export interface Captured {
  objects: KubeObject[];
  capturedAt: string;
}

export interface FixtureState {
  name: string;
  // The namespace of its objects, and the name of its workload cluster.
  namespace: string;
  title: string;
  // How the state is reached, in Markdown, for the README of the set.
  how: string;
  // Undefined for the set written by hand.
  capture?: (project: RealProject, namespace: string) => Promise<Captured>;
  // How its objects come from the real project: stored and reconciled, by default; from a workload cluster
  // made at `workloadKubernetesUpgradeFrom` of the pins and upgraded; or answered to a server-side dry run of
  // their creation, which stores nothing.
  source?: "upgrade" | "dry run";
}

interface Condition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

// The types of the conditions of negative polarity, False when normal (SPEC-0001 H3).
const NEGATIVE_CONDITIONS = new Set([
  "Paused",
  "Deleting",
  "RollingOut",
  "ScalingUp",
  "ScalingDown",
  "Remediating",
  "Updating",
]);

const CLUSTER = "clusters.v1beta2.cluster.x-k8s.io";
const MACHINE = "machines.v1beta2.cluster.x-k8s.io";
const MACHINE_DEPLOYMENT = "machinedeployments.v1beta2.cluster.x-k8s.io";
const CORE_LABEL = "cluster.x-k8s.io";

// The hooks of the scripts that hold the deletion of a Machine, before its drain and before its infrastructure
// goes, and the annotations of the project that choose a Machine to delete and ask for its remediation.
export const PRE_DRAIN_HOOK = "pre-drain.delete.hook.machine.cluster.x-k8s.io/test-environment";
export const PRE_TERMINATE_HOOK = "pre-terminate.delete.hook.machine.cluster.x-k8s.io/test-environment";
const DELETE_MACHINE = "cluster.x-k8s.io/delete-machine";
const REMEDIATE_MACHINE = "cluster.x-k8s.io/remediate-machine";

function conditionsOf(object: KubeObject | undefined): Condition[] {
  const conditions = object?.status?.conditions;

  return Array.isArray(conditions) ? (conditions as Condition[]) : [];
}

function condition(object: KubeObject | undefined, type: string): Condition | undefined {
  return conditionsOf(object).find((item) => item.type === type);
}

function is(object: KubeObject | undefined, type: string, status: string, reason?: string): boolean {
  const found = condition(object, type);

  return found?.status === status && (reason === undefined || found.reason === reason);
}

function name(object: KubeObject): string {
  return `${object.kind} ${object.metadata.name}`;
}

function ofKind(objects: readonly KubeObject[], kind: string): KubeObject[] {
  return inNameOrder(objects.filter((object) => object.kind === kind));
}

function only(objects: readonly KubeObject[], kind: string): KubeObject | undefined {
  const found = ofKind(objects, kind);

  return found.length === 1 ? found[0] : undefined;
}

function deleting(object: KubeObject): boolean {
  return object.metadata.deletionTimestamp !== undefined;
}

function ready(object: KubeObject): boolean {
  return is(object, "Ready", "True");
}

// The Machines of a MachineDeployment, by its label, and those of the control plane.
function machinesOf(objects: readonly KubeObject[], deployment: KubeObject | undefined): KubeObject[] {
  return ofKind(objects, "Machine").filter(
    (machine) => deployment && machine.metadata.labels?.[`${CORE_LABEL}/deployment-name`] === deployment.metadata.name,
  );
}

function controlPlaneMachines(objects: readonly KubeObject[]): KubeObject[] {
  return ofKind(objects, "Machine").filter(
    (machine) => machine.metadata.labels?.[`${CORE_LABEL}/control-plane`] !== undefined,
  );
}

function ownedBy(objects: readonly KubeObject[], owner: KubeObject | undefined, kind: string): KubeObject[] {
  return ofKind(objects, kind).filter((object) =>
    object.metadata.ownerReferences?.some(
      (reference) => owner && reference.kind === owner.kind && reference.name === owner.metadata.name,
    ),
  );
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: { key: string; operator: string; values?: string[] }[];
}

// Whether labels match a label selector, as Kubernetes matches them: every label of `matchLabels` and every
// expression of `matchExpressions`, so that an empty selector matches every object.
export function selects(selector: LabelSelector | undefined, labels: Record<string, string> = {}): boolean {
  const has = (key: string) => Object.hasOwn(labels, key);

  return (
    Object.entries(selector?.matchLabels ?? {}).every(([key, value]) => has(key) && labels[key] === value) &&
    (selector?.matchExpressions ?? []).every(({ key, operator, values = [] }) => {
      if (operator === "In") return has(key) && values.includes(labels[key]);
      if (operator === "NotIn") return !has(key) || !values.includes(labels[key]);
      if (operator === "Exists") return has(key);
      return operator === "DoesNotExist" && !has(key);
    })
  );
}

// The annotations that keep a Machine out of the checks of a MachineHealthCheck: a pause of the Machine, and
// the opt-out of remediation.
const HEALTH_CHECK_SKIPS = ["cluster.x-k8s.io/paused", "cluster.x-k8s.io/skip-remediation"];

// The Machines that a MachineHealthCheck checks, found as its controller finds them, from its selector and not
// from its status: those of its namespace that its selector and the label of its Cluster match, but a Machine
// with an annotation of HEALTH_CHECK_SKIPS
// (core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:297-362 and 457-467).
function healthCheckTargets(objects: readonly KubeObject[], check: KubeObject): KubeObject[] {
  const spec = check.spec as { clusterName?: string; selector?: LabelSelector } | undefined;

  return ofKind(objects, "Machine").filter(
    (machine) =>
      machine.metadata.namespace === check.metadata.namespace &&
      spec?.clusterName !== undefined &&
      machine.metadata.labels?.[`${CORE_LABEL}/cluster-name`] === spec.clusterName &&
      selects(spec.selector, machine.metadata.labels) &&
      HEALTH_CHECK_SKIPS.every((annotation) => machine.metadata.annotations?.[annotation] === undefined),
  );
}

// What keeps the MachineHealthChecks of a workload cluster from reporting every Machine they target healthy:
// a MachineHealthCheck whose `expectedMachines` and `currentHealthy` are not the number of the Machines it
// targets, found from its selector, so that one that has not counted them yet does not pass; or one of
// those Machines without `HealthCheckSucceeded` `True`, which its controller sets on a healthy Machine.
export function healthChecksPending(objects: readonly KubeObject[]): string | undefined {
  for (const check of ofKind(objects, "MachineHealthCheck")) {
    const targets = healthCheckTargets(objects, check);
    const status = check.status as { expectedMachines?: number; currentHealthy?: number } | undefined;

    if (status?.expectedMachines !== targets.length) {
      return `${name(check)} counts ${status?.expectedMachines ?? "no"} Machines, and targets ${targets.length}`;
    }
    if (status.currentHealthy !== targets.length) {
      return `${name(check)} reports ${status.currentHealthy ?? "none"} of the ${targets.length} Machines it targets healthy`;
    }

    const unchecked = targets.find((machine) => !is(machine, "HealthCheckSucceeded", "True"));

    if (unchecked) {
      return `${name(unchecked)}, which ${name(check)} targets, does not report HealthCheckSucceeded True`;
    }
  }
  return undefined;
}

// What keeps a workload cluster from being healthy: its Cluster not Available, a Machine without a Node, a
// condition of any object away from its normal value, True for a positive one, False for a negative one, or
// a MachineHealthCheck that does not report every Machine it targets healthy.
export function notHealthy(objects: readonly KubeObject[]): string | undefined {
  const cluster = only(objects, "Cluster");

  if (!is(cluster, "Available", "True")) return "the Cluster does not report Available True";
  for (const object of objects) {
    if (object.kind === "Machine" && !object.status?.nodeRef) return `${name(object)} has no Node`;
    for (const item of conditionsOf(object)) {
      if (item.status !== (NEGATIVE_CONDITIONS.has(item.type) ? "False" : "True")) {
        return `${name(object)} reports ${item.type} ${item.status}${item.reason ? ` ${item.reason}` : ""}`;
      }
    }
  }
  return healthChecksPending(objects);
}

// A time as Kubernetes writes it, in whole seconds.
function now(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

function list(items: readonly unknown[]): string {
  return JSON.stringify({ apiVersion: "v1", kind: "List", items });
}

// The objects of the kinds of the fixtures in a namespace.
export function readNamespace(kubectl: RealProject["kubectl"], namespace: string): KubeObject[] {
  return (
    JSON.parse(kubectl(["get", FIXTURE_RESOURCES.join(","), "--namespace", namespace, "--output", "json"])) as {
      items: KubeObject[];
    }
  ).items;
}

// The objects whose version differs between two readings, or that only one of them has.
function changedKeys(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key)).sort();
}

function sameVersions(before: Map<string, string>, after: Map<string, string>): boolean {
  return !changedKeys(before, after).length;
}

interface Wait {
  what: string;
  // What the objects still miss, or undefined when they hold the state.
  check: (objects: KubeObject[]) => string | undefined;
  // Why the state can no longer be reached, when it cannot: the capture stops at once.
  missed?: (objects: KubeObject[]) => string | undefined;
  minutes: number;
}

async function waitFor(project: RealProject, namespace: string, wait: Wait, stable: boolean): Promise<Captured> {
  const deadline = Date.now() + wait.minutes * 60_000;
  let previous: Map<string, string> | undefined;
  let said = "";
  let saidAt = 0;
  let changedSaidAt = 0;

  for (;;) {
    const at = now();
    let objects: KubeObject[] = [];
    let missing: string | undefined;

    try {
      objects = readNamespace(project.kubectl, namespace);
      missing = wait.check(objects);
    } catch (error) {
      missing = `the objects could not be read: ${error instanceof Error ? error.message : error}`;
    }

    const missed = objects.length ? wait.missed?.(objects) : undefined;

    ensure(!missed, `${namespace}: the state can no longer be reached: ${missed}`);
    if (missing === undefined) {
      // Two readings with the same version of every object: the objects held the state, all together, between
      // them.
      const versions = new Map(objects.map((object) => [objectKey(object), String(object.metadata.resourceVersion)]));

      if (!stable || (previous && sameVersions(previous, versions))) return { objects, capturedAt: at };
      if (previous && Date.now() - changedSaidAt >= 30_000) {
        project.log(
          `${namespace}: the state holds, and these objects changed between two readings: ${changedKeys(previous, versions).join(", ")}`,
        );
        changedSaidAt = Date.now();
      }
      previous = versions;
      await delay(2_000);
      continue;
    }
    previous = undefined;
    if (missing !== said || Date.now() - saidAt >= 60_000) {
      project.log(`${namespace}: waiting for ${wait.what}: ${missing}`);
      said = missing;
      saidAt = Date.now();
    }
    ensure(
      Date.now() < deadline,
      `${namespace}: ${wait.what} did not happen within ${wait.minutes} minutes: ${missing}`,
    );
    await delay(3_000);
  }
}

// Takes the objects of a namespace once they hold a state and stop changing.
function snapshot(project: RealProject, namespace: string, wait: Wait): Promise<Captured> {
  return waitFor(project, namespace, wait, true);
}

async function until(project: RealProject, namespace: string, wait: Wait): Promise<KubeObject[]> {
  return (await waitFor(project, namespace, wait, false)).objects;
}

interface WorkloadOptions {
  flavor: "development" | "development-mp";
  controlPlane: number;
  workers: number;
  kindnet: boolean;
  kubernetesVersion?: string;
  // A change to the objects of the template before they are applied, which a state needs to be reached.
  change?: (objects: KubeObject[]) => void;
}

// The command that holds the initialization of a control plane: the development provider runs the commands of
// a bootstrap within five minutes.
const HOLD_INITIALIZATION = "sleep 150";

// Gives the KubeadmControlPlaneTemplate of the objects of a template the command that holds kubeadm, on every
// control plane Machine it makes.
function holdKubeadm(objects: KubeObject[]): void {
  const template = objects.find((object) => object.kind === "KubeadmControlPlaneTemplate");
  const configuration = (template?.spec?.template as { spec?: { kubeadmConfigSpec?: Record<string, unknown> } })?.spec
    ?.kubeadmConfigSpec;

  ensure(configuration, "The template of the release has no KubeadmControlPlaneTemplate");
  configuration.preKubeadmCommands = [HOLD_INITIALIZATION];
}

// A workload cluster of a template of the release in its own namespace, with kindnet when it asks for it.
function startWorkload(project: RealProject, namespace: string, options: WorkloadOptions): void {
  project.kubectl(["create", "namespace", namespace]);
  if (options.kindnet) project.apply(project.kindnet(namespace));
  const manifest = project.generate({
    name: namespace,
    namespace,
    flavor: options.flavor,
    kubernetesVersion: options.kubernetesVersion ?? project.kubernetesVersion,
    controlPlane: options.controlPlane,
    workers: options.workers,
  });

  if (options.change) {
    // The objects of the manifest, as kubectl reads them, without asking the server to create anything.
    const objects = printedObjects(
      project.kubectl(["create", "--dry-run=client", "--output", "json", "--filename", "-"], { input: manifest }),
    );

    options.change(objects);
    project.apply(list(objects));
  } else {
    project.apply(manifest);
  }
  if (options.kindnet) {
    project.kubectl(["label", CLUSTER, namespace, "--namespace", namespace, kindnetLabelArgument(), "--overwrite"]);
  }
}

const MINUTES_TO_HEALTHY = 20;

async function healthyWorkload(
  project: RealProject,
  namespace: string,
  options: WorkloadOptions,
): Promise<KubeObject[]> {
  startWorkload(project, namespace, options);
  return until(project, namespace, {
    what: "the workload cluster to be healthy",
    check: notHealthy,
    minutes: MINUTES_TO_HEALTHY,
  });
}

function patchCluster(project: RealProject, namespace: string, type: "merge" | "json", patch: unknown): void {
  project.kubectl([
    "patch",
    CLUSTER,
    namespace,
    "--namespace",
    namespace,
    "--type",
    type,
    "--patch",
    JSON.stringify(patch),
  ]);
}

function annotate(project: RealProject, namespace: string, machine: KubeObject, ...annotations: string[]): void {
  project.kubectl([
    "annotate",
    MACHINE,
    machine.metadata.name,
    "--namespace",
    namespace,
    ...annotations.map((annotation) => `${annotation}=`),
    "--overwrite",
  ]);
}

// Every condition of the objects that follow the pause of their Cluster: all of them but a ClusterClass and a
// ClusterResourceSet, which follow only their own annotation (SPEC-0001 R4.58).
function notPaused(objects: readonly KubeObject[]): string | undefined {
  for (const object of objects) {
    if (object.kind === "ClusterClass" || object.kind === "ClusterResourceSet") continue;

    const paused = condition(object, "Paused");

    if (paused && paused.status !== "True") return `${name(object)} reports Paused ${paused.status}`;
  }
  return is(only(objects, "Cluster"), "Paused", "True") ? undefined : "the Cluster does not report Paused True";
}

export const FIXTURE_STATES: readonly FixtureState[] = [
  {
    name: "provisioning",
    namespace: "freelens-capi-provisioning",
    title: "A Cluster provisioning",
    how: `A Cluster with a managed topology, from the template \`development\` of the release, with one control plane Machine and one worker, captured while the bootstrap of its first control plane Machine runs, before its control plane is initialized: the development provider has provisioned the container of the Machine, and runs the commands of its bootstrap inside it, which it counts in the readiness of the infrastructure of the Machine. The scripts give the KubeadmControlPlaneTemplate of its ClusterClass the command \`${HOLD_INITIALIZATION}\`, which runs before kubeadm, so that this lasts: kubeadm takes a few seconds on a machine with the images at hand, too few for two readings of the objects to agree.`,
    capture: async (project, namespace) => {
      startWorkload(project, namespace, {
        flavor: "development",
        controlPlane: 1,
        workers: 1,
        kindnet: true,
        change: holdKubeadm,
      });
      return snapshot(project, namespace, {
        what: "the bootstrap of the first control plane Machine to run, before the control plane is initialized",
        check: (objects) => {
          const [machine] = controlPlaneMachines(objects);

          if (!machine?.spec?.providerID) return "no control plane Machine is provisioned";
          if (!is(machine, "InfrastructureReady", "False"))
            return "the bootstrap of the control plane Machine does not run";
          if (!is(only(objects, "Cluster"), "Available", "False")) return "the Cluster does not report Available False";
          return undefined;
        },
        missed: (objects) => {
          const [machine] = controlPlaneMachines(objects);

          if (is(only(objects, "Cluster"), "ControlPlaneInitialized", "True"))
            return "the control plane is initialized";
          return is(machine, "InfrastructureReady", "True")
            ? "the bootstrap of the control plane Machine is done"
            : undefined;
        },
        minutes: 10,
      });
    },
  },
  {
    name: "healthy",
    namespace: "freelens-capi-healthy",
    title: "Provisioned and healthy, with a managed topology",
    how: `A Cluster with a managed topology, from the template \`development\` of the release, with one control plane Machine, two workers of a MachineDeployment, and kindnet applied by a ClusterResourceSet, captured once every condition of every object is at its normal value, \`True\` for a positive one and \`False\` for a negative one, every Machine has a Node, and every MachineHealthCheck reports every Machine that its selector targets healthy.`,
    capture: async (project, namespace) => {
      startWorkload(project, namespace, { flavor: "development", controlPlane: 1, workers: 2, kindnet: true });
      return snapshot(project, namespace, {
        what: "every condition to be at its normal value",
        check: notHealthy,
        minutes: MINUTES_TO_HEALTHY,
      });
    },
  },
  {
    name: "machine-without-node",
    namespace: "freelens-capi-without-node",
    title: "A Machine that never got a Node",
    how: `The Cluster of \`healthy\`, with one worker, and a MachineSet of one Machine that the scripts add to it, apart from its topology, whose bootstrap template gives kubelet the provider ID \`${FOREIGN_PROVIDER_ID}\`. The development provider gives a Node a provider ID only when it has none, so the Node of that Machine registers with that one, and the Machine, provisioned, never finds a Node with its own. Captured once its bootstrap is done. The Cluster reconciles on a change of its control plane Machines, its MachineDeployments and its MachinePools, and not of a MachineSet or a worker Machine, so in the capture it still counts the one worker of its topology and reports \`WorkerMachinesReady\` \`True\`.`,
    capture: async (project, namespace) => {
      await healthyWorkload(project, namespace, { flavor: "development", controlPlane: 1, workers: 1, kindnet: true });
      project.apply(list(machineSetWithoutNode(namespace, namespace, project.kubernetesVersion)));
      return snapshot(project, namespace, {
        what: "the Machine of the MachineSet to be provisioned, with no Node",
        check: (objects) => {
          const set = ofKind(objects, "MachineSet").find((item) => item.metadata.name === `${namespace}-without-node`);
          const [machine] = ownedBy(objects, set, "Machine");

          if (!machine) return "the MachineSet has no Machine";
          if (!is(machine, "BootstrapConfigReady", "True") || !is(machine, "InfrastructureReady", "True")) {
            return "its Machine is not provisioned";
          }
          return machine.status?.nodeRef ? "its Machine has a Node" : undefined;
        },
        minutes: 10,
      });
    },
  },
  {
    name: "rolling-out",
    namespace: "freelens-capi-rolling-out",
    title: "Rolling out",
    how: `The Cluster of \`healthy\`, captured during the rollout that \`clusterctl alpha rollout restart\` of its MachineDeployment starts, while a new Machine starts and no old one is deleted yet.`,
    capture: async (project, namespace) => {
      const objects = await healthyWorkload(project, namespace, {
        flavor: "development",
        controlPlane: 1,
        workers: 2,
        kindnet: true,
      });
      const deployment = only(objects, "MachineDeployment");

      ensure(deployment, `${namespace} does not have one MachineDeployment`);
      project.clusterctl([
        ...["alpha", "rollout", "restart", `machinedeployment/${deployment.metadata.name}`],
        ...["--namespace", namespace],
      ]);
      return snapshot(project, namespace, {
        what: "a new Machine to start, with no old one deleting",
        check: (current) => {
          const machineDeployment = only(current, "MachineDeployment");
          const machines = machinesOf(current, machineDeployment);

          if (!is(machineDeployment, "RollingOut", "True"))
            return "the MachineDeployment does not report RollingOut True";
          if (!is(machineDeployment, "Available", "True"))
            return "the MachineDeployment does not report Available True";
          if (machines.some(deleting)) return "a Machine is deleting";
          return machines.some((machine) => !ready(machine)) ? undefined : "every Machine is ready";
        },
        minutes: 10,
      });
    },
  },
  {
    name: "scaling-up",
    namespace: "freelens-capi-scaling-up",
    title: "Scaling up",
    how: `The Cluster of \`healthy\`, with one worker, whose topology asks for three control plane Machines and two workers, captured while the second control plane Machine and the new worker start. A MachineSet creates every Machine it misses at once, so its MachineDeployment reports \`ScalingUp\` \`False\` as soon as the new Machine exists; the KubeadmControlPlane adds one Machine at a time, and reports \`ScalingUp\` \`True\` while it starts the second one.`,
    capture: async (project, namespace) => {
      await healthyWorkload(project, namespace, { flavor: "development", controlPlane: 1, workers: 1, kindnet: true });
      patchCluster(project, namespace, "json", [
        { op: "replace", path: "/spec/topology/controlPlane/replicas", value: 3 },
        { op: "replace", path: "/spec/topology/workers/machineDeployments/0/replicas", value: 2 },
      ]);
      return snapshot(project, namespace, {
        what: "a control plane Machine and a worker to start",
        check: (objects) => {
          const controlPlane = only(objects, "KubeadmControlPlane");
          const workers = machinesOf(objects, only(objects, "MachineDeployment"));

          if (!is(controlPlane, "ScalingUp", "True")) return "the KubeadmControlPlane does not report ScalingUp True";
          if (ofKind(objects, "Machine").some(deleting)) return "a Machine is deleting";
          if (!controlPlaneMachines(objects).some((machine) => !ready(machine)))
            return "no control plane Machine starts";
          return workers.length === 2 && workers.some((machine) => !ready(machine)) ? undefined : "no worker starts";
        },
        minutes: 8,
      });
    },
  },
  {
    name: "scaling-up-held",
    namespace: "freelens-capi-scaling-up-held",
    title: "Scaling up, held by the preflight checks",
    source: "upgrade",
    how: `A Cluster with a managed topology, from the template \`development\` of the release, with one control plane Machine and one worker, made at the version of Kubernetes \`workloadKubernetesUpgradeFrom\` of the pins. Its topology leaves the replicas of its MachineDeployment to the MachineDeployment, as with an autoscaler, and its KubeadmControlPlaneTemplate runs \`${HOLD_INITIALIZATION}\` before kubeadm, as in \`provisioning\`, so that an upgrade of its control plane lasts. Its \`spec.topology.version\` is changed to \`workloadKubernetesVersion\`, and its MachineDeployment scaled to two workers: while the control plane upgrades, the preflight checks of the MachineSet hold the new worker, \`ControlPlaneIsStable\` and those of the skew between its version and that of the control plane, and the MachineSet and the MachineDeployment report \`ScalingUp\` \`True\` with fewer Machines than their replicas. Captured while the checks hold it.`,
    capture: async (project, namespace) => {
      const objects = await healthyWorkload(project, namespace, {
        flavor: "development",
        controlPlane: 1,
        workers: 1,
        kindnet: true,
        kubernetesVersion: project.upgradeFromKubernetesVersion,
        change: (objects) => {
          holdKubeadm(objects);

          const topology = only(objects, "Cluster")?.spec?.topology as
            | { workers?: { machineDeployments?: Record<string, unknown>[] } }
            | undefined;
          const [deployment] = topology?.workers?.machineDeployments ?? [];

          ensure(deployment, "The template of the release has no MachineDeployment in its topology");
          delete deployment.replicas;
        },
      });
      const deployment = only(objects, "MachineDeployment");

      ensure(deployment, `${namespace} has no MachineDeployment`);
      // The topology changes no MachineDeployment while its control plane upgrades: the MachineDeployment is
      // scaled by its own replicas, as an autoscaler scales it.
      patchCluster(project, namespace, "merge", { spec: { topology: { version: project.kubernetesVersion } } });
      project.kubectl([
        "patch",
        MACHINE_DEPLOYMENT,
        deployment.metadata.name,
        "--namespace",
        namespace,
        "--type",
        "merge",
        "--patch",
        JSON.stringify({ spec: { replicas: 2 } }),
      ]);
      return snapshot(project, namespace, {
        what: "the preflight check of the MachineSet to hold the new worker",
        check: (objects) => {
          const deployment = only(objects, "MachineDeployment");
          const machineSet = only(objects, "MachineSet");

          if (
            !is(machineSet, "ScalingUp", "True") ||
            !condition(machineSet, "ScalingUp")?.message?.includes("ControlPlaneIsStable")
          ) {
            return "the MachineSet does not report its scale up held by ControlPlaneIsStable";
          }
          if (!is(deployment, "ScalingUp", "True")) return "the MachineDeployment does not report ScalingUp True";
          if (!controlPlaneMachines(objects).some((machine) => !ready(machine))) {
            return "no control plane Machine of the new version starts";
          }
          return machinesOf(objects, deployment).length === 1 ? undefined : "the new worker exists";
        },
        missed: (objects) =>
          machinesOf(objects, only(objects, "MachineDeployment")).length > 1 ? "the new worker exists" : undefined,
        minutes: 10,
      });
    },
  },
  {
    name: "scaling-down",
    namespace: "freelens-capi-scaling-down",
    title: "Scaling down",
    how: `The Cluster of \`healthy\`, with two workers, scaled down to one through its topology after one worker got the annotation \`${DELETE_MACHINE}\`, which a MachineSet deletes first, and the pre-drain hook of the scripts, \`${PRE_DRAIN_HOOK}\`, which holds its deletion before the drain. Captured while the hook holds it.`,
    capture: async (project, namespace) => {
      const objects = await healthyWorkload(project, namespace, {
        flavor: "development",
        controlPlane: 1,
        workers: 2,
        kindnet: true,
      });
      const [machine] = machinesOf(objects, only(objects, "MachineDeployment"));

      ensure(machine, `${namespace} has no worker`);
      annotate(project, namespace, machine, DELETE_MACHINE, PRE_DRAIN_HOOK);
      patchCluster(project, namespace, "json", [
        { op: "replace", path: "/spec/topology/workers/machineDeployments/0/replicas", value: 1 },
      ]);
      return snapshot(project, namespace, {
        what: "the worker to wait for the hook",
        check: (current) => {
          const held = ofKind(current, "Machine").find((item) => item.metadata.name === machine.metadata.name);

          if (!is(only(current, "MachineDeployment"), "ScalingDown", "True")) {
            return "the MachineDeployment does not report ScalingDown True";
          }
          return held && deleting(held) && is(held, "Deleting", "True", "WaitingForPreDrainHook")
            ? undefined
            : `${machine.metadata.name} does not wait for the hook`;
        },
        minutes: 5,
      });
    },
  },
  {
    name: "paused",
    namespace: "freelens-capi-paused",
    title: "Paused",
    how: `The Cluster of \`healthy\`, with one worker, paused through \`spec.paused\`, as \`clusterctl move\` pauses one, captured once every object that follows the pause of its Cluster reports \`Paused\` \`True\`. The ClusterClass and the ClusterResourceSet follow only their own annotation, and report \`Paused\` \`False\`.`,
    capture: async (project, namespace) => {
      await healthyWorkload(project, namespace, { flavor: "development", controlPlane: 1, workers: 1, kindnet: true });
      patchCluster(project, namespace, "merge", { spec: { paused: true } });
      return snapshot(project, namespace, { what: "every object to report Paused True", check: notPaused, minutes: 5 });
    },
  },
  {
    name: "deleting",
    namespace: "freelens-capi-deleting",
    title: "Deleting",
    how: `The Cluster of \`healthy\`, with two workers, deleted after one worker got the pre-terminate hook of the scripts, \`${PRE_TERMINATE_HOOK}\`, which a deleting Cluster does not skip. Captured while the hook holds that Machine, and with it the deletion of the Cluster, at \`WaitingForWorkersDeletion\`. On the first tier, the finalizers of the project and the one of the scripts hold the deleting objects.`,
    capture: async (project, namespace) => {
      const objects = await healthyWorkload(project, namespace, {
        flavor: "development",
        controlPlane: 1,
        workers: 2,
        kindnet: true,
      });
      const [machine] = machinesOf(objects, only(objects, "MachineDeployment"));

      ensure(machine, `${namespace} has no worker`);
      annotate(project, namespace, machine, PRE_TERMINATE_HOOK);
      project.kubectl(["delete", CLUSTER, namespace, "--namespace", namespace, "--wait=false"]);
      return snapshot(project, namespace, {
        what: "the deletion of the Cluster to wait for the worker that the hook holds",
        check: (current) => {
          const cluster = only(current, "Cluster");
          const workers = ofKind(current, "Machine").filter((item) => !controlPlaneMachines(current).includes(item));

          if (!cluster || !is(cluster, "Deleting", "True", "WaitingForWorkersDeletion")) {
            return "the Cluster does not report Deleting True WaitingForWorkersDeletion";
          }
          if (workers.length !== 1 || workers[0].metadata.name !== machine.metadata.name) {
            return "the other workers are not gone";
          }
          return is(workers[0], "Deleting", "True", "WaitingForPreTerminateHook")
            ? undefined
            : `${machine.metadata.name} does not wait for the hook`;
        },
        minutes: 10,
      });
    },
  },
  {
    name: "upgrading",
    namespace: "freelens-capi-upgrading",
    title: "With a managed topology, upgrading",
    source: "upgrade",
    how: `A Cluster with a managed topology, from the template \`development\` of the release, with one control plane Machine and one worker, made at the version of Kubernetes \`workloadKubernetesUpgradeFrom\` of the pins, whose \`spec.topology.version\` is then changed to \`workloadKubernetesVersion\`. Captured while its control plane rolls out to the new version.`,
    capture: async (project, namespace) => {
      await healthyWorkload(project, namespace, {
        flavor: "development",
        controlPlane: 1,
        workers: 1,
        kindnet: true,
        kubernetesVersion: project.upgradeFromKubernetesVersion,
      });
      patchCluster(project, namespace, "merge", { spec: { topology: { version: project.kubernetesVersion } } });
      return snapshot(project, namespace, {
        what: "the control plane to roll out to the new version",
        check: (objects) => {
          const cluster = only(objects, "Cluster");

          if (!is(cluster, "TopologyReconciled", "False", "ClusterUpgrading")) {
            return "the Cluster does not report TopologyReconciled False ClusterUpgrading";
          }
          if (!is(cluster, "RollingOut", "True")) return "the Cluster does not report RollingOut True";
          return controlPlaneMachines(objects).some((machine) => !deleting(machine) && !ready(machine))
            ? undefined
            : "no new control plane Machine starts";
        },
        minutes: 10,
      });
    },
  },
  {
    name: "without-topology",
    namespace: "freelens-capi-without-topology",
    title: "Without a managed topology",
    how: `A Cluster without a managed topology, which no template of the release makes, written by the scripts from the schemas of the release: it names a DevCluster and a KubeadmControlPlane of one Machine, and has a MachineDeployment of two workers and kindnet applied by a ClusterResourceSet. Captured once every condition of every object is at its normal value.`,
    capture: async (project, namespace) => {
      project.kubectl(["create", "namespace", namespace]);
      project.apply(project.kindnet(namespace));
      project.apply(list(clusterWithoutTopology(namespace, namespace, project.kubernetesVersion)));
      return snapshot(project, namespace, {
        what: "every condition to be at its normal value",
        check: notHealthy,
        minutes: MINUTES_TO_HEALTHY,
      });
    },
  },
  {
    name: "machine-pools",
    namespace: "freelens-capi-machine-pools",
    title: "A Cluster whose only workers are MachinePools",
    how: `A Cluster with a managed topology, from the template \`development-mp\` of the release, whose only workers are a MachinePool of one worker, with no network add-on, so that no Node becomes ready. Captured once the Cluster reports \`Available\` \`True\` and the Machines of the pool exist, each with its Node, which does not become ready: the development provider keeps Machines for its pools.`,
    capture: async (project, namespace) => {
      startWorkload(project, namespace, { flavor: "development-mp", controlPlane: 1, workers: 1, kindnet: false });
      return snapshot(project, namespace, {
        what: "the Cluster to report Available True, with the Machines of its pool",
        check: (objects) => {
          const pool = only(objects, "MachinePool");
          const machines = ownedBy(objects, pool, "Machine");

          if (!is(only(objects, "Cluster"), "Available", "True")) return "the Cluster does not report Available True";
          if (!machines.length) return "the MachinePool has no Machine";
          return machines.every((machine) => machine.status?.nodeRef) ? undefined : "a Machine of the pool has no Node";
        },
        minutes: 15,
      });
    },
  },
  {
    name: "machine-pool-without-machines",
    namespace: "freelens-capi-pool-without-machines",
    title: "A MachinePool whose provider keeps no Machines, written by hand",
    how: "",
  },
  {
    name: "remediation",
    namespace: "freelens-capi-remediation",
    title: "A remediation in progress",
    how: `The Cluster of \`healthy\`, with two workers, whose topology gives its MachineDeployment \`maxInFlight\` 1 for remediations. Both workers get the pre-drain hook of the scripts, \`${PRE_DRAIN_HOOK}\`, then the annotation \`${REMEDIATE_MACHINE}\`, which makes the MachineHealthCheck mark them. The MachineSet remediates one, whose deletion the hook holds, and defers the other while that one is in flight. Captured while both are so.`,
    capture: async (project, namespace) => {
      await healthyWorkload(project, namespace, { flavor: "development", controlPlane: 1, workers: 2, kindnet: true });
      patchCluster(project, namespace, "json", [
        {
          op: "add",
          path: "/spec/topology/workers/machineDeployments/0/healthCheck",
          value: { remediation: { maxInFlight: 1 } },
        },
      ]);

      const objects = await until(project, namespace, {
        what: "the MachineDeployment to take maxInFlight 1",
        check: (current) =>
          (only(current, "MachineDeployment")?.spec?.remediation as { maxInFlight?: unknown } | undefined)
            ?.maxInFlight === 1
            ? undefined
            : "the MachineDeployment does not have it",
        minutes: 2,
      });
      const workers = machinesOf(objects, only(objects, "MachineDeployment"));

      ensure(workers.length === 2, `${namespace} does not have two workers`);
      for (const machine of workers) annotate(project, namespace, machine, PRE_DRAIN_HOOK);
      for (const machine of workers) annotate(project, namespace, machine, REMEDIATE_MACHINE);
      return snapshot(project, namespace, {
        what: "one worker to be remediated and the other deferred",
        check: (current) => {
          const machines = machinesOf(current, only(current, "MachineDeployment"));
          const remediated = machines.filter((machine) => deleting(machine) && is(machine, "OwnerRemediated", "False"));
          const waiting = machines.filter(
            (machine) =>
              !deleting(machine) &&
              is(machine, "HealthCheckSucceeded", "False") &&
              is(machine, "OwnerRemediated", "False"),
          );

          if (!is(only(current, "MachineDeployment"), "Remediating", "True")) {
            return "the MachineDeployment does not report Remediating True";
          }
          if (remediated.length !== 1 || !is(remediated[0], "Deleting", "True", "WaitingForPreDrainHook")) {
            return "no worker is remediated and held by the hook";
          }
          return waiting.length === 1 ? undefined : "no worker waits for its remediation";
        },
        minutes: 5,
      });
    },
  },
  {
    name: "no-status",
    namespace: "freelens-capi-no-status",
    title: "Objects with no status",
    source: "dry run",
    how: `One object of each kind of the fixtures, two of DevMachineTemplate and of KubeadmConfig, and none of the Docker kinds of the development provider, which no template of the release uses, as a user writes it, before any controller reconciles it, so with no status: the scripts send them to the real project in a server-side dry run of their creation, which its webhooks default and validate and which stores nothing, and keep what the API server answers. They make one Cluster without a topology, whose parts name each other, and a ClusterClass. No ExtensionConfig is among them: the real project of the test environment runs without the feature RuntimeSDK, without which its webhook refuses one.`,
    capture: async (project, namespace) => {
      project.kubectl(["create", "namespace", namespace]);

      const capturedAt = now();
      const objects = printedObjects(
        project.kubectl(["create", "--dry-run=server", "--output", "json", "--filename", "-"], {
          input: list(
            objectsWithoutStatus(namespace, namespace, {
              kubernetes: project.kubernetesVersion,
              clusterApi: project.clusterApiVersion,
            }),
          ),
        }),
      );

      return { objects, capturedAt };
    },
  },
];

export const HAND_WRITTEN_STATE = "machine-pool-without-machines";

// A paragraph of Markdown in lines of at most 80 columns.
function paragraph(text: string): string {
  const lines: string[] = [];
  let line = "";

  // A code span is one word, which a line break does not cut.
  for (const word of text.match(/`[^`]*`\S*|\S+/g) ?? []) {
    if (line && line.length + 1 + word.length > 80) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line].join("\n");
}

// The versions that the README of a set names: of Cluster API, of the Kubernetes of the workload clusters,
// and of the one that a workload cluster is made at before an upgrade.
export interface ReadmeVersions {
  clusterApi: string;
  kubernetes: string;
  upgradeFrom: string;
}

// What the machine of the capture told of itself in a set, and what the set says in its place: the kernel,
// the boot and the swap of its Nodes, and the capacity of its machine templates. Empty for a set with
// neither.
function hostFacts(objects: readonly KubeObject[]): string[] {
  const nodes = objects.some((object) => typeof object.status?.nodeInfo === "object");
  const templates = objects.some((object) => holdsHostCapacity(object) && typeof object.status?.capacity === "object");
  const capacity = Object.entries(HOST_CAPACITY)
    .map(([resource, value]) => `\`${resource}: ${/^\d+$/.test(value) ? `"${value}"` : value}\``)
    .join(" and ");

  return [
    ...(nodes
      ? [
          `the kernel and the boot of each Node are \`${HOST_KERNEL}\` and \`${HOST_BOOT_ID}\`, its swap is left out, and its architecture is kept`,
        ]
      : []),
    ...(templates
      ? [
          `the processors and the memory of the machine, which the development provider writes into the capacity of each machine template, are written as ${capacity}`,
        ]
      : []),
  ];
}

// The README of a captured fixture set: how its state is reached, where its objects come from, and what the
// capture changes and leaves out, of the objects that it holds.
export function fixtureReadme(
  state: FixtureState,
  objects: readonly KubeObject[],
  leftOut: readonly string[],
  versions: ReadmeVersions,
): string {
  const project = `the real project of the test environment, Cluster API \`${versions.clusterApi}\` with its development provider`;
  const commands = `\`pnpm e2e:fixtures:capture ${state.name}\` captures them again, and \`pnpm e2e:fixtures:up ${state.name}\` applies them to the cluster of the definitions (\`docs/development/TESTING.md\`).`;
  const facts = hostFacts(objects);
  const origin =
    state.source === "dry run"
      ? `What ${project}, answered to a server-side dry run of the creation of the objects in the namespace \`${state.namespace}\`, which name Kubernetes \`${versions.kubernetes}\`: defaulted and validated by its webhooks, and stored and reconciled by nothing. Each one is at \`v1beta2\`, the Provider of clusterctl at \`v1alpha3\`, its only version.`
      : `The objects of the namespace \`${state.namespace}\` of ${project}, ${state.source === "upgrade" ? `made at Kubernetes \`${versions.upgradeFrom}\`, upgrading to \`${versions.kubernetes}\`` : `at Kubernetes \`${versions.kubernetes}\``}, as its controllers and its webhooks wrote them, read at \`v1beta2\`.`;

  return `${[
    `# ${state.title}`,
    paragraph(state.how),
    paragraph(`${origin} ${commands}`),
    paragraph(
      [
        `Every time is written as its offset from the moment of the capture, from \`${CAPTURE_TIME}\`, and every generation as its distance from the generations that the status of its object observed. What the API server adds is left out: the identifiers, the versions and the managed fields.`,
        ...(state.source === "dry run" ? [] : ["So are the Secrets and the ConfigMaps of the namespace."]),
        ...(facts.length
          ? [`What the machine that ran the capture tells of itself is not kept: ${facts.join("; ")}.`]
          : []),
      ].join(" "),
    ),
    paragraph(
      leftOut.length
        ? `What SPEC-0001 A3 forbids showing is left out: ${leftOut.map((path) => `\`${path}\``).join(", ")}.`
        : "No field that SPEC-0001 A3 forbids showing is in these objects.",
    ),
  ].join("\n\n")}\n`;
}

// The states of the command line, by their names, or every state that the command takes with `all`.
export function statesOf(names: readonly string[], captured = false): FixtureState[] {
  const states = FIXTURE_STATES.filter((state) => !captured || state.capture);

  if (names.length === 1 && names[0] === "all") return [...states];
  return names.map((name) => {
    const state = states.find((item) => item.name === name);

    ensure(
      state,
      `${name} is not a state of the fixtures${captured ? " that the scripts capture" : ""}: ${states.map((item) => item.name).join(", ")}, or all`,
    );
    return state;
  });
}
