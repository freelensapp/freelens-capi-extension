/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The captures of a Cluster with a KamajiControlPlane (SPEC-0028, P1 to P7): the nine states that the probes of the
// provider reached and that the views tell apart, each captured from the provider on the cluster of the captures, a kind
// cluster of its own, one at a time, how each one is reached, held and waited for, and what the README of its set says.
// The commands that run them are `up-kamaji` and `capture-kamaji` of commands.mts; until the sets are in the repository,
// no other command knows these states.

import { assertDigest, ensure, sha256 } from "./checks.mts";
import { CAPTURE_TIME, FIXTURE_FINALIZER, PROBE_TIME_WORDS } from "./fixtures.mts";
import { kamajiCluster, podQuota } from "./manifests.mts";
import {
  condition,
  deleting,
  hostFacts,
  is,
  list,
  MINUTES_TO_HEALTHY,
  notHealthy,
  notPaused,
  ofKind,
  only,
  paragraph,
  snapshot,
  until,
} from "./states.mts";

import type { PinnedFile } from "./downloads.mts";
import type { KubeObject } from "./fixtures.mts";
import type { Captured, NamespaceReader, Wait } from "./states.mts";

// The kind cluster of the captures, which only `up-kamaji` makes and `down` deletes (P2).
export const KAMAJI_CLUSTER = "freelens-capi-kamaji";

// What a capture of a Kamaji state needs of the cluster of the captures.
export interface KamajiProject extends NamespaceReader {
  // A server-side apply of the objects of a manifest, by the field manager of the scripts.
  apply(manifest: string): void;
  // The ConfigMap with kindnet and the ClusterResourceSet that applies it, for a namespace.
  kindnet(namespace: string): string;
  // The one address of the pool of MetalLB, which every tenant of type LoadBalancer gets, one tenant at a time (P4).
  address: string;
  // What `clusterctl describe cluster` prints of the Cluster of a namespace, named as it, with the pinned clusterctl, its
  // default flags, no check of a newer version and no terminal (P6).
  describe(namespace: string): string;
  versions: KamajiVersions;
}

// The versions that a Kamaji state names: those of the releases on the cluster of the captures, and of Kubernetes of
// the tenant and of its worker, made at `workloadKubernetesUpgradeFrom` of the pins, upgraded to
// `workloadKubernetesVersion`, and the minor after it, which Kamaji refuses (P3).
export interface KamajiVersions {
  clusterApi: string;
  provider: string;
  kamaji: string;
  tenant: string;
  upgradeTo: string;
  refused: string;
}

export interface KamajiState {
  name: string;
  // The namespace of its objects, and the name of its Cluster, of its KamajiControlPlane and of its tenant.
  namespace: string;
  title: string;
  // How the state is reached and held, in Markdown, for the README of the set.
  how: (versions: KamajiVersions) => string;
  // Made with a worker, whose DevCluster has the endpoint of the tenant written (P1, P4).
  worker: boolean;
  // The namespace of a helper Cluster of the scripts, which the capture makes beside the Cluster of the state, does not
  // read, and deletes with it (P5).
  helper?: string;
  capture: (project: KamajiProject, namespace: string) => Promise<Captured>;
}

// The minor of Kubernetes after a version, `v1.38.0` after `v1.37.0`: the version that Kamaji refuses when the pins
// give the tenants the minor that it supports (K22; L3).
export function nextMinor(version: string): string {
  const [major, minor] = version.slice(1).split(".").map(Number);

  return `v${major}.${minor + 1}.0`;
}

const KCP = "kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io";
const CLUSTER = "clusters.v1beta2.cluster.x-k8s.io";

// The namespace of the helper Cluster of `kamaji-provisioning`, whose tenant takes the one address of the pool.
export const ADDRESS_HELPER = "freelens-capi-kamaji-address";

export function kamajiControlPlaneOf(objects: readonly KubeObject[]): KubeObject | undefined {
  return only(objects, "KamajiControlPlane");
}

export function tenantOf(objects: readonly KubeObject[]): KubeObject | undefined {
  return only(objects, "TenantControlPlane");
}

// A field of the status of an object, by its path.
function field(object: KubeObject | undefined, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (value, key) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined),
    object?.status,
  );
}

// The state of a tenant, as Kamaji computes it (K11).
export function tenantState(objects: readonly KubeObject[]): string | undefined {
  const state = field(tenantOf(objects), "kubernetesResources", "version", "status");

  return typeof state === "string" ? state : undefined;
}

const COUNTERS = ["replicas", "readyReplicas", "availableReplicas", "upToDateReplicas"] as const;

// Whether the Cluster holds the counters of its KamajiControlPlane, which core copies some seconds after the control
// plane settles (L9, L11), and why not.
export function countersNotCopied(objects: readonly KubeObject[]): string | undefined {
  const own = COUNTERS.map((counter) => field(kamajiControlPlaneOf(objects), counter));
  const copied = COUNTERS.map((counter) => field(only(objects, "Cluster"), "controlPlane", counter));

  return own.every((value, index) => value === copied[index])
    ? undefined
    : `the Cluster holds ${copied.join(", ")} as the counters of its control plane, and the KamajiControlPlane ${own.join(", ")}`;
}

// What keeps a Cluster of Kamaji from being healthy: what keeps any workload cluster from it (`notHealthy`), and the
// counters of its control plane not yet copied into its status (P5).
export function kamajiNotHealthy(objects: readonly KubeObject[]): string | undefined {
  return notHealthy(objects) ?? countersNotCopied(objects);
}

// Whether the quota of the scripts refused a Pod to the Deployment of the tenant, which the TenantControlPlane copies
// as a condition ReplicaFailure True of its status (L24).
export function quotaRefused(objects: readonly KubeObject[]): boolean {
  const conditions = field(tenantOf(objects), "kubernetesResources", "deployment", "conditions");

  return (
    Array.isArray(conditions) && conditions.some((item) => item?.type === "ReplicaFailure" && item?.status === "True")
  );
}

// Whether a Pod of the tenant still ends, which the TenantControlPlane copies as `terminatingReplicas` of its
// Deployment, written once more some 30 s after a change that ends Pods (L25).
export function tenantPodsEnding(objects: readonly KubeObject[]): boolean {
  const ending = field(tenantOf(objects), "kubernetesResources", "deployment", "terminatingReplicas");

  return typeof ending === "number" && ending > 0;
}

// Why the probe of core of the workload cluster has not failed after a success yet, in the words that it writes then
// (K23; L23).
export function probeNotFailed(objects: readonly KubeObject[]): string | undefined {
  const probe = condition(only(objects, "Cluster"), "RemoteConnectionProbe");

  return probe?.status === "False" && probe.message?.startsWith(PROBE_TIME_WORDS[0])
    ? undefined
    : "the probe of core of the workload cluster has not failed after a success yet";
}

// Why the worker Machines are not past the grace of the conditions of their Nodes yet: each with NodeReady and
// NodeHealthy Unknown ConnectionDown and the time of the last probe that succeeded, and the objects that sum them up
// after it, the MachineSet, the MachineDeployment and the Cluster, no longer ready (K23; P5).
export function workersNotPastGrace(objects: readonly KubeObject[]): string | undefined {
  const machines = ofKind(objects, "Machine");

  if (!machines.length) return "the Cluster has no worker Machine";
  for (const machine of machines) {
    for (const type of ["NodeReady", "NodeHealthy"]) {
      const node = condition(machine, type);

      if (
        node?.status !== "Unknown" ||
        node.reason !== "ConnectionDown" ||
        !node.message?.startsWith(PROBE_TIME_WORDS[1])
      ) {
        return `Machine ${machine.metadata.name} does not report ${type} Unknown ConnectionDown with the time of the last probe yet`;
      }
    }
  }
  for (const [kind, type] of [
    ["Machine", "Ready"],
    ["MachineSet", "MachinesReady"],
    ["MachineDeployment", "MachinesReady"],
    ["Cluster", "WorkerMachinesReady"],
  ]) {
    const unready = ofKind(objects, kind).find((object) => is(object, type, "True"));

    if (unready) return `${kind} ${unready.metadata.name} still reports ${type} True`;
  }
  return undefined;
}

// Why a tenant that no longer answers is not read yet: a Pod of it still ending, the probe of core not failed, or the
// worker Machines not past their grace (P5).
function unreachableNotReported(objects: readonly KubeObject[]): string | undefined {
  if (tenantPodsEnding(objects)) return "a Pod of the tenant still ends";
  return probeNotFailed(objects) ?? workersNotPastGrace(objects);
}

function kcpCheck(
  objects: readonly KubeObject[],
  expected: { type: string; status: string; reason?: string; message?: string },
): string | undefined {
  const found = condition(kamajiControlPlaneOf(objects), expected.type);

  return found?.status === expected.status &&
    (expected.reason === undefined || found.reason === expected.reason) &&
    (expected.message === undefined || found.message?.includes(expected.message))
    ? undefined
    : `the KamajiControlPlane does not report ${expected.type} ${expected.status}${expected.reason ? ` ${expected.reason}` : ""}${expected.message ? ` with ${expected.message}` : ""}`;
}

// The first of the checks that fails, or undefined.
function first(...checks: (() => string | undefined)[]): string | undefined {
  for (const check of checks) {
    const missing = check();

    if (missing) return missing;
  }
  return undefined;
}

function kubectl(project: KamajiProject, ...args: string[]): void {
  project.kubectl(args);
}

// The Cluster of a state, in the namespace of its name, with kindnet for a worker, made at the version of the tenant.
function startKamaji(project: KamajiProject, namespace: string, options: { worker: boolean }): void {
  project.kubectl(["create", "namespace", namespace]);
  if (options.worker) project.apply(project.kindnet(namespace));
  project.apply(
    list(
      kamajiCluster(namespace, namespace, {
        version: project.versions.tenant,
        worker: options.worker,
        ...(options.worker ? { address: project.address } : {}),
      }),
    ),
  );
}

// The Cluster of `kamaji-healthy`, once it is healthy, from which every state but `kamaji-provisioning` starts (P1).
async function healthyKamaji(project: KamajiProject, namespace: string): Promise<KubeObject[]> {
  startKamaji(project, namespace, { worker: true });
  return until(project, namespace, {
    what: "the Cluster of Kamaji to be healthy",
    check: kamajiNotHealthy,
    minutes: MINUTES_TO_HEALTHY,
  });
}

// Takes the objects of a namespace once they hold the state of `wait`, two readings agree, and a third one agrees with
// them after `clusterctl describe cluster` (P6).
function described(project: KamajiProject, namespace: string, wait: Wait): Promise<Captured> {
  return snapshot(project, namespace, wait, () => project.describe(namespace));
}

function patchControlPlane(project: KamajiProject, namespace: string, patch: unknown): void {
  kubectl(
    project,
    "patch",
    KCP,
    namespace,
    "--namespace",
    namespace,
    "--type",
    "merge",
    "--patch",
    JSON.stringify(patch),
  );
}

// What the README of every Kamaji set says of its KamajiControlPlane (P1, P4), of a Cluster with a worker, and of the
// two states whose tenant no longer answers (P5).
const OF_ONE_REPLICA =
  "Its KamajiControlPlane has one replica, its Service of type `LoadBalancer`, the default, and the addons CoreDNS, with the address of its Service in the service network of the Cluster, and kube-proxy, which the kind does not default; the provider runs with its gate `SkipInfraClusterPatch`.";
const WITH_A_WORKER = (versions: KamajiVersions) =>
  `The Cluster of \`kamaji-healthy\`, with a DevCluster whose endpoint is the endpoint of the tenant, the one address of the pool of MetalLB of the scripts and the port of the tenant, a tenant at Kubernetes \`${versions.tenant}\` and one worker at the same version, a MachineDeployment of the development provider with kindnet applied by a ClusterResourceSet. ${OF_ONE_REPLICA}`;
const READ_ONCE_UNREACHABLE =
  "Read once every controller has reported a tenant that no longer answers: no Pod of the tenant ending, the probe of core of the workload cluster failed after a success, and, past their grace, the conditions `NodeReady` and `NodeHealthy` of the worker Machine `Unknown` `ConnectionDown`, with the time of the last probe that succeeded, and the objects that sum them up after it.";

export const KAMAJI_STATES: readonly KamajiState[] = [
  {
    name: "kamaji-provisioning",
    namespace: "freelens-capi-kamaji-provisioning",
    title: "A Cluster of Kamaji provisioning, its tenant waiting for an address",
    worker: false,
    helper: ADDRESS_HELPER,
    how: (versions) =>
      `A Cluster with a KamajiControlPlane at Kubernetes \`${versions.tenant}\` and no worker, whose DevCluster has no endpoint written, so that the development provider gives it the address of its own load balancer. ${OF_ONE_REPLICA} Within the same capture, a helper Cluster of Kamaji of the scripts, in the namespace \`${ADDRESS_HELPER}\`, which the capture does not read, takes first the one address of the pool of MetalLB, so that the tenant of this Cluster waits for an address for as long as the helper keeps it. Captured once the DevCluster is provisioned and the KamajiControlPlane waits at \`TenantControlPlaneAddressReady\` \`False\` \`Pending\`; both Clusters are deleted after it.`,
    capture: async (project, namespace) => {
      startKamaji(project, ADDRESS_HELPER, { worker: false });
      await until(project, ADDRESS_HELPER, {
        what: "the tenant of the helper Cluster to take the one address of the pool",
        check: (objects) => kcpCheck(objects, { type: "TenantControlPlaneAddressReady", status: "True" }),
        minutes: 5,
      });
      startKamaji(project, namespace, { worker: false });
      return described(project, namespace, {
        what: "the tenant to wait for an address, the DevCluster provisioned",
        check: (objects) =>
          first(
            () => kcpCheck(objects, { type: "TenantControlPlaneAddressReady", status: "False", reason: "Pending" }),
            () =>
              condition(kamajiControlPlaneOf(objects), "Available")
                ? "the KamajiControlPlane reports Available"
                : undefined,
            () => (tenantOf(objects) ? undefined : "the TenantControlPlane is not made yet"),
            () =>
              is(only(objects, "Cluster"), "InfrastructureReady", "True")
                ? undefined
                : "the DevCluster is not provisioned yet",
          ),
        missed: (objects) =>
          is(kamajiControlPlaneOf(objects), "TenantControlPlaneAddressReady", "True")
            ? "the tenant has an address"
            : undefined,
        minutes: 5,
      });
    },
  },
  {
    name: "kamaji-healthy",
    namespace: "freelens-capi-kamaji-healthy",
    title: "A Cluster of Kamaji, healthy",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions).replace("The Cluster of `kamaji-healthy`, with", "A Cluster with")} Captured once every condition of every object is at its normal value, \`True\` for a positive one and \`False\` for a negative one, the Node of the worker is ready, and core has copied the counters of the control plane into the Cluster.`,
    capture: async (project, namespace) => {
      startKamaji(project, namespace, { worker: true });
      return described(project, namespace, {
        what: "every condition to be at its normal value",
        check: kamajiNotHealthy,
        minutes: MINUTES_TO_HEALTHY,
      });
    },
  },
  {
    name: "kamaji-scaling",
    namespace: "freelens-capi-kamaji-scaling",
    title: "A Cluster of Kamaji whose tenant scales up, held by a quota",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, a ResourceQuota of the scripts in its namespace allows one Pod, the one that the tenant has, and the KamajiControlPlane is scaled to three replicas through its subresource \`scale\`: the Deployment of the tenant cannot make the new Pods, so Kamaji keeps its rollout in progress, \`Unknown\`. Captured while the quota holds it.`,
    capture: async (project, namespace) => {
      await healthyKamaji(project, namespace);
      project.apply(podQuota(namespace, 1));
      kubectl(project, "scale", KCP, namespace, "--namespace", namespace, "--replicas", "3");
      return described(project, namespace, {
        what: "the quota to hold the scale of the tenant",
        check: (objects) =>
          first(
            () =>
              kamajiControlPlaneOf(objects)?.spec?.replicas === 3
                ? undefined
                : "the KamajiControlPlane does not ask for three replicas",
            () =>
              kcpCheck(objects, {
                type: "KamajiControlPlaneIsReady",
                status: "False",
                reason: "Failed",
                message: "Unknown",
              }),
            () => kcpCheck(objects, { type: "Available", status: "False", reason: "NotAvailable" }),
            () =>
              tenantState(objects) === "Unknown" ? undefined : `the tenant is ${tenantState(objects)}, not Unknown`,
            () => (quotaRefused(objects) ? undefined : "the quota has not refused a Pod of the tenant yet"),
            () =>
              field(only(objects, "Cluster"), "controlPlane", "desiredReplicas") === 3
                ? undefined
                : "the Cluster does not want three replicas of its control plane yet",
            () => countersNotCopied(objects),
            () =>
              is(only(objects, "Cluster"), "Available", "False")
                ? undefined
                : "the Cluster does not report Available False",
          ),
        missed: (objects) =>
          Number(field(kamajiControlPlaneOf(objects), "readyReplicas")) > 1
            ? "the quota did not hold the scale"
            : undefined,
        minutes: 5,
      });
    },
  },
  {
    name: "kamaji-upgrading",
    namespace: "freelens-capi-kamaji-upgrading",
    title: "A Cluster of Kamaji whose tenant upgrades, held by a quota",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, a ResourceQuota of the scripts in its namespace allows one Pod, the one that the tenant has, and \`spec.version\` of the KamajiControlPlane is changed to \`${versions.upgradeTo}\`: Kamaji rolls a tenant out with a surge and no replica unavailable, so the quota keeps the new Pod from being made and the old one runs, \`Upgrading\`. Captured while the quota holds it.`,
    capture: async (project, namespace) => {
      await healthyKamaji(project, namespace);
      project.apply(podQuota(namespace, 1));
      patchControlPlane(project, namespace, { spec: { version: project.versions.upgradeTo } });
      return described(project, namespace, {
        what: "the quota to hold the upgrade of the tenant",
        check: (objects) => {
          const controlPlane = kamajiControlPlaneOf(objects);

          return first(
            () =>
              controlPlane?.spec?.version === project.versions.upgradeTo
                ? undefined
                : "the KamajiControlPlane does not ask for the new version",
            () =>
              field(controlPlane, "version") === project.versions.tenant
                ? undefined
                : "the KamajiControlPlane does not report the old version",
            () => (field(controlPlane, "upToDateReplicas") === 0 ? undefined : "a replica of the tenant is up to date"),
            () => kcpCheck(objects, { type: "Available", status: "True" }),
            () =>
              tenantState(objects) === "Upgrading" ? undefined : `the tenant is ${tenantState(objects)}, not Upgrading`,
            () => (quotaRefused(objects) ? undefined : "the quota has not refused a Pod of the tenant yet"),
            () => countersNotCopied(objects),
            () =>
              is(only(objects, "Cluster"), "Available", "True")
                ? undefined
                : "the Cluster does not report Available True",
          );
        },
        missed: (objects) =>
          field(kamajiControlPlaneOf(objects), "version") === project.versions.upgradeTo
            ? "the upgrade is done: the quota did not hold it"
            : undefined,
        minutes: 5,
      });
    },
  },
  {
    name: "kamaji-version-refused",
    namespace: "freelens-capi-kamaji-version-refused",
    title: "A Cluster of Kamaji whose control plane asks for a version that Kamaji refuses",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, \`spec.version\` of the KamajiControlPlane is changed to \`${versions.refused}\`, a minor above the one that Kamaji supports: the webhook of Kamaji refuses the update of the TenantControlPlane that the provider makes, and the state holds by itself. Captured once the KamajiControlPlane reports \`TenantControlPlaneCreated\` \`False\`.`,
    capture: async (project, namespace) => {
      await healthyKamaji(project, namespace);
      patchControlPlane(project, namespace, { spec: { version: project.versions.refused } });
      return described(project, namespace, {
        what: "the webhook of Kamaji to refuse the version",
        check: (objects) =>
          first(
            () =>
              kamajiControlPlaneOf(objects)?.spec?.version === project.versions.refused
                ? undefined
                : "the KamajiControlPlane does not ask for the version yet",
            () => kcpCheck(objects, { type: "TenantControlPlaneCreated", status: "False" }),
            () => kcpCheck(objects, { type: "Available", status: "True" }),
            () => countersNotCopied(objects),
          ),
        missed: (objects) =>
          tenantOf(objects)?.spec?.kubernetes &&
          (tenantOf(objects)?.spec?.kubernetes as { version?: string }).version?.endsWith(
            project.versions.refused.slice(1),
          )
            ? "the TenantControlPlane took the version: Kamaji did not refuse it"
            : undefined,
        minutes: 5,
      });
    },
  },
  {
    name: "kamaji-sleeping",
    namespace: "freelens-capi-kamaji-sleeping",
    title: "A Cluster of Kamaji whose tenant is scaled to 0",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, \`spec.replicas\` of the KamajiControlPlane is changed to 0, which Kamaji keeps \`Sleeping\`. ${READ_ONCE_UNREACHABLE}`,
    capture: async (project, namespace) => {
      await healthyKamaji(project, namespace);
      patchControlPlane(project, namespace, { spec: { replicas: 0 } });
      return described(project, namespace, {
        what: "every controller to report the tenant scaled to 0",
        check: (objects) =>
          first(
            () =>
              tenantState(objects) === "Sleeping" ? undefined : `the tenant is ${tenantState(objects)}, not Sleeping`,
            () =>
              COUNTERS.every((counter) => field(kamajiControlPlaneOf(objects), counter) === 0)
                ? undefined
                : "the counters of the KamajiControlPlane are not 0",
            () => kcpCheck(objects, { type: "KamajiControlPlaneIsReady", status: "False", message: "Sleeping" }),
            () => kcpCheck(objects, { type: "Available", status: "False" }),
            () => countersNotCopied(objects),
            () => unreachableNotReported(objects),
          ),
        minutes: 12,
      });
    },
  },
  {
    name: "kamaji-not-ready",
    namespace: "freelens-capi-kamaji-not-ready",
    title: "A Cluster of Kamaji whose tenant has no ready replica, held by a quota",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, a ResourceQuota of the scripts in its namespace allows no Pod, and the Pods of the tenant are deleted, so that its Deployment has no ready replica and can make none, \`NotReady\`. ${READ_ONCE_UNREACHABLE}`,
    capture: async (project, namespace) => {
      const healthy = await healthyKamaji(project, namespace);
      const selector = field(tenantOf(healthy), "kubernetesResources", "deployment", "selector");

      ensure(
        typeof selector === "string" && selector,
        `${namespace}: the TenantControlPlane names no selector of its Pods`,
      );
      project.apply(podQuota(namespace, 0));
      kubectl(project, "delete", "pods", "--namespace", namespace, "--selector", selector, "--wait=false");
      return described(project, namespace, {
        what: "every controller to report the tenant with no ready replica",
        check: (objects) =>
          first(
            () =>
              tenantState(objects) === "NotReady" ? undefined : `the tenant is ${tenantState(objects)}, not NotReady`,
            () =>
              COUNTERS.every((counter) => field(kamajiControlPlaneOf(objects), counter) === 0)
                ? undefined
                : "the counters of the KamajiControlPlane are not 0",
            () => kcpCheck(objects, { type: "KamajiControlPlaneIsReady", status: "False", message: "NotReady" }),
            () => kcpCheck(objects, { type: "Available", status: "False" }),
            () => (quotaRefused(objects) ? undefined : "the quota has not refused a Pod of the tenant yet"),
            () => countersNotCopied(objects),
            () => unreachableNotReported(objects),
          ),
        minutes: 12,
      });
    },
  },
  {
    name: "kamaji-paused",
    namespace: "freelens-capi-kamaji-paused",
    title: "A Cluster of Kamaji, paused",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, the Cluster is paused through \`spec.paused\`. The provider writes \`Paused\` only at an event of the KamajiControlPlane, of a Secret that it owns or of its tenant, and watches no Cluster, so it is read before any such event, its KamajiControlPlane with no \`Paused\`, once every other controller has reported the pause; a \`Paused\` that the KamajiControlPlane gets meanwhile stops the capture.`,
    capture: async (project, namespace) => {
      await healthyKamaji(project, namespace);
      kubectl(
        project,
        "patch",
        CLUSTER,
        namespace,
        "--namespace",
        namespace,
        "--type",
        "merge",
        "--patch",
        JSON.stringify({ spec: { paused: true } }),
      );
      return described(project, namespace, {
        what: "every object but the KamajiControlPlane to report Paused True",
        check: notPaused,
        missed: (objects) =>
          condition(kamajiControlPlaneOf(objects), "Paused")
            ? "the KamajiControlPlane got an event, and reports Paused"
            : undefined,
        minutes: 5,
      });
    },
  },
  {
    name: "kamaji-deleting",
    namespace: "freelens-capi-kamaji-deleting",
    title: "A Cluster of Kamaji deleting, its control plane held",
    worker: true,
    how: (versions) =>
      `${WITH_A_WORKER(versions)} Once it is healthy, its KamajiControlPlane gets the finalizer of the scripts, \`${FIXTURE_FINALIZER}\`, which holds it, and the Cluster is deleted. Captured once the worker is gone, while the Cluster waits for the deletion of its control plane; the capture removes the finalizer before it deletes the Cluster again.`,
    capture: async (project, namespace) => {
      const healthy = await healthyKamaji(project, namespace);
      const finalizers = kamajiControlPlaneOf(healthy)?.metadata.finalizers ?? [];

      patchControlPlane(project, namespace, { metadata: { finalizers: [...finalizers, FIXTURE_FINALIZER] } });
      kubectl(project, "delete", CLUSTER, namespace, "--namespace", namespace, "--wait=false");
      return described(project, namespace, {
        what: "the Cluster to wait for the deletion of its control plane, its worker gone",
        check: (objects) => {
          const cluster = only(objects, "Cluster");
          const controlPlane = kamajiControlPlaneOf(objects);

          return first(
            () =>
              cluster && deleting(cluster) && is(cluster, "Deleting", "True", "WaitingForControlPlaneDeletion")
                ? undefined
                : "the Cluster does not report Deleting True WaitingForControlPlaneDeletion",
            () => (controlPlane && deleting(controlPlane) ? undefined : "the KamajiControlPlane is not deleting"),
            () => (ofKind(objects, "Machine").length ? "the worker is not gone" : undefined),
          );
        },
        missed: (objects) => (kamajiControlPlaneOf(objects) ? undefined : "the KamajiControlPlane is gone"),
        minutes: 10,
      });
    },
  },
];

// The states of the command line of the captures of Kamaji, by their names, or every one with `all`.
export function kamajiStatesOf(names: readonly string[]): KamajiState[] {
  if (names.length === 1 && names[0] === "all") return [...KAMAJI_STATES];
  return names.map((name) => {
    const state = KAMAJI_STATES.find((item) => item.name === name);

    ensure(
      state,
      `${name} is not a state of the captures of Kamaji: ${KAMAJI_STATES.map((item) => item.name).join(", ")}, or all`,
    );
    return state;
  });
}

// The cells of the row of a Cluster that `clusterctl describe cluster` prints, which a README of a Kamaji set keeps, by
// the titles of their columns: no time and no address, where SINCE is an age and MESSAGE can hold the time of a probe
// that failed (P6; L22).
export const DESCRIBE_CELLS = ["REPLICAS", "AVAILABLE", "READY", "UP TO DATE", "STATUS", "REASON"] as const;

export type DescribedRow = Record<(typeof DESCRIBE_CELLS)[number], string>;

const DESCRIBE_COLUMNS = ["NAME", ...DESCRIBE_CELLS, "SINCE", "MESSAGE"] as const;
const DELETED = "!! DELETED !! ";

// The row of the Cluster `<namespace>/<name>` in what `clusterctl describe cluster` prints with its default flags, each
// cell read by the column that the line of its header names, so that a cell that clusterctl leaves empty stays empty,
// and the row of a deleting Cluster found by its name after `!! DELETED !!`. An output with no header that names every
// column, or with no row of that Cluster, is refused.
export function describedClusterRow(output: string, namespace: string, name: string): DescribedRow {
  const lines = output.split("\n").map((line) => line.replace(/\s+$/, ""));
  const header = lines.find((line) => line.startsWith("NAME "));

  ensure(header, "clusterctl describe cluster printed no header");

  const starts: number[] = [];

  for (const title of DESCRIBE_COLUMNS) {
    const from = starts.length ? starts[starts.length - 1] + 1 : 0;
    const found = new RegExp(`(^| )${title}( |$)`).exec(header.slice(from));

    ensure(found, `The header that clusterctl describe cluster printed has no column ${title}`);
    starts.push(from + found.index + found[1].length);
  }

  const cluster = `Cluster ${namespace}/${name}`;
  const row = lines.find((line) => {
    const cell = line.slice(0, starts[1]).trim();

    return cell === cluster || cell === `${DELETED}${cluster}`;
  });

  ensure(row, `clusterctl describe cluster printed no row of the Cluster ${namespace}/${name}`);
  return Object.fromEntries(
    DESCRIBE_CELLS.map((cell, index) => [cell, row.slice(starts[index + 1], starts[index + 2]).trim()]),
  ) as DescribedRow;
}

// The run of CI that captured a set, from the variables that GitHub Actions sets, or undefined outside CI.
export function ciRun(env: Record<string, string | undefined>): string | undefined {
  const { GITHUB_ACTIONS, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT } = env;

  if (GITHUB_ACTIONS !== "true" || !GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return undefined;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT ?? "1"}`;
}

// What the README of a Kamaji set holds besides its objects: the versions, the run of CI, the row that
// `clusterctl describe cluster` printed for its Cluster, and the files of the set as the capture wrote them.
export interface KamajiReadmeDetails {
  versions: KamajiVersions;
  run: string | undefined;
  row: DescribedRow;
  files: ReadonlyMap<string, string>;
}

// The endpoint of the DevCluster of a set, as `host:port`.
function endpointOf(objects: readonly KubeObject[]): string | undefined {
  const endpoint = only(objects, "DevCluster")?.spec?.controlPlaneEndpoint as
    | { host?: string; port?: number }
    | undefined;

  return endpoint?.host ? `${endpoint.host}:${endpoint.port}` : undefined;
}

// The README of a Kamaji set (P6): how its state was reached and held; the versions of Cluster API, of the provider, of
// Kamaji, and of Kubernetes of the tenant and of the worker; the endpoint of P4; the run of CI that captured it; what the
// capture changed and left out; the six cells of the row that `clusterctl describe cluster` printed for its Cluster;
// and the SHA-256 of each YAML file of the set as the capture wrote it.
export function kamajiReadme(
  state: KamajiState,
  objects: readonly KubeObject[],
  leftOut: readonly string[],
  details: KamajiReadmeDetails,
): string {
  const { versions, run, row, files } = details;
  const endpoint = endpointOf(objects);
  const facts = hostFacts(objects);
  const probeTimes =
    JSON.stringify(objects).includes(PROBE_TIME_WORDS[0]) || JSON.stringify(objects).includes(PROBE_TIME_WORDS[1]);
  const origin = [
    `The objects of the namespace \`${state.namespace}\` of the cluster of the captures of the test environment, Cluster API \`${versions.clusterApi}\` with its development provider, the Kamaji control plane provider \`${versions.provider}\` and Kamaji \`${versions.kamaji}\`, as their controllers and their webhooks wrote them, the KamajiControlPlane read at \`v1alpha2\`, the TenantControlPlane at \`v1alpha1\` and the others at \`v1beta2\`; the tenant made at Kubernetes \`${versions.tenant}\`${state.worker ? ", and its worker at the same version" : ", with no worker"}.`,
    endpoint
      ? state.worker
        ? `The DevCluster has the endpoint of the tenant written, \`${endpoint}\`, the one address of the pool of MetalLB of the scripts and the port of the tenant, so that the Cluster takes the endpoint of its tenant.`
        : `The DevCluster has no endpoint written, and the development provider gave it the address of its own load balancer, \`${endpoint}\`, which the Cluster took.`
      : "The DevCluster has no endpoint.",
    run
      ? `Captured by the run ${run} of the workflow \`kamaji-capture.yaml\`.`
      : "Captured outside CI, by no run of the workflow `kamaji-capture.yaml`.",
    `\`pnpm e2e:fixtures:capture:kamaji ${state.name}\` captures them again, on the cluster of the captures, and \`pnpm e2e:fixtures:up ${state.name}\` applies them to the cluster of the definitions (\`docs/development/TESTING.md\`).`,
  ].join(" ");
  const cleaning = [
    `Every time is written as its offset from the moment of the capture, from \`${CAPTURE_TIME}\`, and every generation as its distance from the generations that the status of its object observed, the TenantControlPlane by its own \`status.observedGeneration\` alone, its other observed generations kept as captured. What the API server adds is left out: the identifiers, the versions and the managed fields.`,
    "So are the Secrets, the ConfigMaps, the Deployments, the Services and the Pods of the namespace, and the DataStore, which has no namespace.",
    ...(probeTimes
      ? [
          "The time of the last probe of core that succeeded, inside the messages of its conditions, moves as the time of a field.",
        ]
      : []),
    ...(objects.some((object) => object.kind === "TenantControlPlane")
      ? [
          "Every checksum in the status of the TenantControlPlane, of the content of a Secret or of a ConfigMap of the tenant, is written as one fixed value, and their names are kept.",
        ]
      : []),
    ...(facts.length
      ? [`What the machine that ran the capture tells of itself is not kept: ${facts.join("; ")}.`]
      : []),
    "The addresses are those of the network of Docker that ran it.",
  ].join(" ");

  return `${[
    `# ${state.title}`,
    paragraph(state.how(versions)),
    paragraph(origin),
    paragraph(cleaning),
    paragraph(
      leftOut.length
        ? `What SPEC-0001 A3 forbids showing is left out: ${leftOut.map((path) => `\`${path}\``).join(", ")}.`
        : "No field that SPEC-0001 A3 forbids showing is in these objects.",
    ),
    paragraph(
      "The row that `clusterctl describe cluster` printed for the Cluster with its default flags, between the readings of the set, by the columns of its header, SINCE, an age, and MESSAGE left out:",
    ),
    DESCRIBE_CELLS.map((cell) => `- ${cell}: ${row[cell] ? `\`${row[cell]}\`` : "empty"}`).join("\n"),
    paragraph("The SHA-256 of each YAML file of the set, as the capture wrote it:"),
    [...files.entries()].map(([file, text]) => `- \`${file}\`: \`${sha256(Buffer.from(text))}\``).join("\n"),
  ].join("\n\n")}\n`;
}

// The cells of the row of `clusterctl describe cluster` and the SHA-256 of each file that the README of a Kamaji set
// holds, read back from its text.
export function readmeRecords(readme: string): { row: DescribedRow; digests: Map<string, string> } {
  const cell = (title: string) => {
    const found = new RegExp(`^- ${title}: (?:\`([^\`]*)\`|empty)$`, "m").exec(readme);

    ensure(found, `The README has no cell ${title}`);
    return found[1] ?? "";
  };

  return {
    row: Object.fromEntries(DESCRIBE_CELLS.map((title) => [title, cell(title)])) as DescribedRow,
    digests: new Map(
      [...readme.matchAll(/^- `([a-z0-9.-]+\.yaml)`: `([0-9a-f]{64})`$/gm)].map((match) => [match[1], match[2]]),
    ),
  };
}

// The folder `charts` of the chart of Kamaji once `helm dependency build` has run, by the name of each file: the archive
// of kamaji-etcd at the version that the Chart.lock names, checked against its pin before the install, and nothing else
// (P3). A folder with another file, or with that archive changed, is refused.
export function assertChartDependencies(files: ReadonlyMap<string, Uint8Array>, etcd: PinnedFile): void {
  const archive = etcd.file.split("/").pop() ?? "";
  const others = [...files.keys()].filter((name) => name !== archive);

  ensure(
    files.has(archive) && !others.length,
    `helm dependency build left ${[...files.keys()].join(", ") || "nothing"} in the folder charts of the chart of Kamaji, and the pins name ${archive} alone`,
  );
  assertDigest(etcd.name, files.get(archive) ?? new Uint8Array(), etcd.digest);
}
