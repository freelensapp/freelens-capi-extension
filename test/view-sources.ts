// The reads of a view of one Cluster for the unit tests of the details (SPEC-0004, "Tests", "Unit"): a source that
// holds the objects of the fixtures of SPEC-0002 as the stores of the host hold them, with the state of the reads of
// every kind in the namespaces given, as a page or a view of one Cluster would have read them.

import { NO_READS, reduceReads } from "../src/common/views/read-state";
import { DefinitionReads } from "../src/renderer/reads/definitions";
import { CAPTURE, fixtureSet } from "./fixture-sets";
import { hostObject } from "./host-stores";

import type { KubeObject } from "../e2e/scripts/fixtures.mts";
import type { ClusterObject } from "../src/common/status/index";
import type { ContextObjects, KindObjects, ProviderKindObjects } from "../src/common/views/context";
import type { KindDescriptor, KindFeeds, ReadEvent, ReadFailure, ReadsState } from "../src/common/views/read-state";
import type { ResolvedReference } from "../src/common/views/references";
import type { ClusterSource } from "../src/renderer/reads/cluster-source";
import type { HostObject } from "./host-stores";

// The kinds that a view reads, by the key of their store, which is the base of their API.
export const KINDS = {
  clusters: ["Cluster", "Clusters", "clusters", "cluster.x-k8s.io", "rows"],
  machines: ["Machine", "Machines", "machines", "cluster.x-k8s.io", "machines"],
  machineSets: ["MachineSet", "MachineSets", "machinesets", "cluster.x-k8s.io", "machine-sets"],
  machineDeployments: ["MachineDeployment", "MachineDeployments", "machinedeployments", "cluster.x-k8s.io", "parts"],
  machinePools: ["MachinePool", "MachinePools", "machinepools", "cluster.x-k8s.io", "machine-pools"],
  healthChecks: [
    "MachineHealthCheck",
    "MachineHealthChecks",
    "machinehealthchecks",
    "cluster.x-k8s.io",
    "health-checks",
  ],
  clusterClasses: ["ClusterClass", "ClusterClasses", "clusterclasses", "cluster.x-k8s.io", "cluster-class"],
  kubeadmControlPlanes: [
    "KubeadmControlPlane",
    "KubeadmControlPlanes",
    "kubeadmcontrolplanes",
    "controlplane.cluster.x-k8s.io",
    "parts",
  ],
  devClusters: ["DevCluster", "DevCluster objects", "devclusters", "infrastructure.cluster.x-k8s.io", "infrastructure"],
} as const satisfies Record<string, readonly [string, string, string, string, KindFeeds]>;

export type KindName = keyof typeof KINDS;

export function keyOf(name: KindName): string {
  const [, , resource, group] = KINDS[name];

  return `/apis/${group}/v1beta2/${resource}`;
}

export function descriptorOf(name: KindName): KindDescriptor & { readonly key: string } {
  const [kind, noun, resource, group, feeds] = KINDS[name];

  return { key: keyOf(name), kind, noun, resource, group, feeds };
}

// The resolution of the references to a KubeadmControlPlane and to a DevCluster, from the labels of their definitions
// in the release (controlplane/kubeadm/config/crd/kustomization.yaml:1-6; test/infrastructure/docker/config/crd/kustomization.yaml:1-6).
export const RESOLVED: Record<"kubeadmControlPlanes" | "devClusters", ResolvedReference> = {
  kubeadmControlPlanes: {
    state: "resolved",
    reference: { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane", name: "" },
    apiVersion: "controlplane.cluster.x-k8s.io/v1beta2",
    plural: "kubeadmcontrolplanes",
    contract: "v1beta2",
    provider: "control-plane-kubeadm",
  },
  devClusters: {
    state: "resolved",
    reference: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: "" },
    apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
    plural: "devclusters",
    contract: "v1beta2",
    provider: "infrastructure-docker",
  },
};

export interface SourceOptions {
  // The namespaces that the view read; every namespace of the objects by default.
  readonly loaded?: readonly string[];
  // The namespaces that the filter selects; those loaded by default.
  readonly filter?: readonly string[];
  // The kinds whose load has not ended yet.
  readonly pending?: readonly KindName[];
  // The failures of the load of a kind, one for each namespace that fails.
  readonly failures?: Partial<Record<KindName, readonly ReadFailure[]>>;
  // A refresh of a kind that failed after its load, with its failure.
  readonly refreshes?: Partial<Record<KindName, ReadFailure>>;
  // The resolution of the references to a kind of a provider, resolved by default.
  readonly resolutions?: Partial<Record<"kubeadmControlPlanes" | "devClusters", ResolvedReference>>;
}

// The objects of fixture sets as the stores of the host hold them, with a self link of their own.
export function hostObjects(objects: readonly KubeObject[]): HostObject[] {
  return objects.map((object) => hostObject(object as unknown as Record<string, unknown>));
}

export function objectsOfStates(states: readonly string[]): HostObject[] {
  return hostObjects(states.flatMap((state) => fixtureSet(state)));
}

function namespacesOf(objects: readonly HostObject[]): string[] {
  return [...new Set(objects.map((object) => object.getNs() ?? ""))].sort();
}

export function readsOf(objects: readonly HostObject[], options: SourceOptions = {}): ReadsState {
  const loaded = options.loaded ?? namespacesOf(objects);
  const events: ReadEvent[] = [
    { type: "filter-changed", namespaces: [...(options.filter ?? loaded)], selectedAll: false },
  ];
  let id = 0;

  for (const name of Object.keys(KINDS) as KindName[]) {
    const key = keyOf(name);

    id++;
    events.push({ type: "load-started", kind: key, id, namespaces: [...loaded] });
    if (options.pending?.includes(name)) continue;
    for (const failure of options.failures?.[name] ?? []) events.push({ type: "load-failed", kind: key, id, failure });
    events.push({ type: "load-ended", kind: key, id, overWholeCluster: false, followed: true, at: CAPTURE });

    const refresh = options.refreshes?.[name];

    if (refresh !== undefined)
      events.push({ type: "refresh-failed", kind: key, failure: refresh, at: CAPTURE + 60_000 });
  }
  return events.reduce(reduceReads, NO_READS);
}

function kindObjects(objects: readonly HostObject[], name: KindName): KindObjects<never> {
  return { key: keyOf(name), items: objects.filter((object) => object.kind === KINDS[name][0]) as never[] };
}

// A source of the reads of a view, from host objects.
export function sourceOf(objects: readonly HostObject[], options: SourceOptions = {}): ClusterSource {
  const reads = readsOf(objects, options);
  const provider = (name: "kubeadmControlPlanes" | "devClusters"): [string, ProviderKindObjects] => {
    const [kind, , , group] = KINDS[name];

    return [
      `${group}/${kind}`,
      { ...kindObjects(objects, name), resolution: options.resolutions?.[name] ?? RESOLVED[name] },
    ];
  };
  const contextObjects: ContextObjects = {
    reads,
    machines: kindObjects(objects, "machines"),
    machineSets: kindObjects(objects, "machineSets"),
    machineDeployments: kindObjects(objects, "machineDeployments"),
    machinePools: kindObjects(objects, "machinePools"),
    healthChecks: kindObjects(objects, "healthChecks"),
    clusterClasses: kindObjects(objects, "clusterClasses"),
    operator: [],
    controlPlanes: new Map([provider("kubeadmControlPlanes")]),
    infrastructures: new Map([provider("devClusters")]),
  };

  return {
    reads,
    definitions: new DefinitionReads({
      store: () => ({ isLoaded: true, failedLoading: false, items: [] }),
      findApi: () => undefined,
      get: async () => null,
    }),
    clusters: () => kindObjects(objects, "clusters") as KindObjects<ClusterObject>,
    objects: () => contextObjects,
    kinds: () => (Object.keys(KINDS) as KindName[]).map(descriptorOf),
  };
}
