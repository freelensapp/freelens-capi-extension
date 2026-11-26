// Stores of the host for the unit tests of the views, with the APIs that the host registers for the kinds of Cluster
// API, on the stub of the SDK (`test/freelens-extensions.ts`). A store holds the objects that a test gives it, in every
// namespace, as a store of the host holds those of every namespace it has read; its loads and its subscriptions are
// recorded, and a load ends when the test says.

import { observable, runInAction } from "mobx";
import { vi } from "vitest";
import { host, Renderer } from "./freelens-extensions";

import type { StubApi } from "./freelens-extensions";

type Fields = Record<string, unknown>;

// An object as the store of the host holds it: an instance of its `KubeObject`, with an id and a link of its own.
export type HostObject = InstanceType<typeof Renderer.K8sApi.LensExtensionKubeObject>;

let uids = 0;

export function hostObject(data: Fields): HostObject {
  const metadata = (data.metadata ?? {}) as Fields;
  const uid = (metadata.uid as string | undefined) ?? `uid-${++uids}`;

  return new Renderer.K8sApi.LensExtensionKubeObject({
    ...data,
    metadata: {
      resourceVersion: "1",
      selfLink: `/apis/test/${String(data.kind)}/${String(metadata.namespace)}/${String(metadata.name)}`,
      ...metadata,
      uid,
    },
  });
}

function api(kind: string, group: string, version: string, plural: string): StubApi {
  return {
    kind,
    apiVersionWithGroup: `${group}/${version}`,
    apiBase: `/apis/${group}/${version}/${plural}`,
    isNamespaced: true,
  };
}

export const APIS = {
  clusters: api("Cluster", "cluster.x-k8s.io", "v1beta2", "clusters"),
  machines: api("Machine", "cluster.x-k8s.io", "v1beta2", "machines"),
  machineSets: api("MachineSet", "cluster.x-k8s.io", "v1beta2", "machinesets"),
  machineDeployments: api("MachineDeployment", "cluster.x-k8s.io", "v1beta2", "machinedeployments"),
  machinePools: api("MachinePool", "cluster.x-k8s.io", "v1beta2", "machinepools"),
  kubeadmControlPlanes: api("KubeadmControlPlane", "controlplane.cluster.x-k8s.io", "v1beta2", "kubeadmcontrolplanes"),
  healthChecks: api("MachineHealthCheck", "cluster.x-k8s.io", "v1beta2", "machinehealthchecks"),
  clusterClasses: api("ClusterClass", "cluster.x-k8s.io", "v1beta2", "clusterclasses"),
  coreProviders: api("CoreProvider", "operator.cluster.x-k8s.io", "v1alpha2", "coreproviders"),
  devClusters: api("DevCluster", "infrastructure.cluster.x-k8s.io", "v1beta2", "devclusters"),
} as const;

export type ApiName = keyof typeof APIS;

// The APIs of the kinds that the tree of a Cluster reads beside those of the page (SPEC-0005, P6): the kinds that it
// adds, and the kinds of the development provider that the references of the fixtures name.
export const TREE_APIS = {
  kubeadmConfigs: api("KubeadmConfig", "bootstrap.cluster.x-k8s.io", "v1beta2", "kubeadmconfigs"),
  kubeadmConfigTemplates: api(
    "KubeadmConfigTemplate",
    "bootstrap.cluster.x-k8s.io",
    "v1beta2",
    "kubeadmconfigtemplates",
  ),
  clusterResourceSets: api("ClusterResourceSet", "addons.cluster.x-k8s.io", "v1beta2", "clusterresourcesets"),
  clusterResourceSetBindings: api(
    "ClusterResourceSetBinding",
    "addons.cluster.x-k8s.io",
    "v1beta2",
    "clusterresourcesetbindings",
  ),
  ipAddressClaims: api("IPAddressClaim", "ipam.cluster.x-k8s.io", "v1beta2", "ipaddressclaims"),
  ipAddresses: api("IPAddress", "ipam.cluster.x-k8s.io", "v1beta2", "ipaddresses"),
  devMachines: api("DevMachine", "infrastructure.cluster.x-k8s.io", "v1beta2", "devmachines"),
  devMachineTemplates: api("DevMachineTemplate", "infrastructure.cluster.x-k8s.io", "v1beta2", "devmachinetemplates"),
  devMachinePools: api("DevMachinePool", "infrastructure.cluster.x-k8s.io", "v1beta2", "devmachinepools"),
} as const;

// A store of the host for one API.
export class FakeStore {
  readonly api: StubApi;
  readonly items = observable.array<HostObject>([], { deep: false });
  readonly #state = observable({ isLoaded: false, isLoading: false, failedLoading: false });
  readonly #pending: (() => void)[] = [];
  holdLoads = false;
  // The failures that the next load reports, one for each namespace that fails, as the store of the host reports
  // them through `onLoadFailure`.
  failures: unknown[] = [];

  readonly loadAll = vi.fn(async (opts?: { namespaces?: string[]; onLoadFailure?: (error: unknown) => void }) => {
    if (this.holdLoads) await new Promise<void>((resolve) => this.#pending.push(resolve));
    for (const failure of this.failures.splice(0)) opts?.onLoadFailure?.(failure);
    runInAction(() => {
      this.#state.isLoaded = true;
    });
    return [];
  });

  readonly subscribe = vi.fn((_opts?: unknown) => () => undefined);

  constructor(api: StubApi) {
    this.api = api;
  }

  get isLoaded() {
    return this.#state.isLoaded;
  }

  get isLoading() {
    return this.#state.isLoading;
  }

  get failedLoading() {
    return this.#state.failedLoading;
  }

  get contextItems() {
    return this.items.filter((item) => host.context.contextNamespaces.includes(item.getNs() ?? ""));
  }

  getByPath(path: string) {
    return this.items.find((item) => item.metadata?.selfLink === path);
  }

  set(items: HostObject[]) {
    runInAction(() => this.items.replace(items));
  }

  // Ends the loads that wait.
  finishLoads() {
    for (const resolve of this.#pending.splice(0)) resolve();
  }

  markLoaded() {
    runInAction(() => {
      this.#state.isLoaded = true;
    });
  }
}

// A definition of the store of definitions of the host, with the labels of its contract.
export function definition(name: string, group: string, kind: string, labels: Record<string, string> = {}): HostObject {
  return hostObject({
    apiVersion: "apiextensions.k8s.io/v1",
    kind: "CustomResourceDefinition",
    metadata: { name, namespace: undefined, labels },
    spec: { group, names: { kind, plural: name.slice(0, name.indexOf(".")) }, scope: "Namespaced" },
  });
}

// The definitions of Clusters and of KubeadmControlPlanes, with the labels of the release
// (controlplane/kubeadm/config/crd/kustomization.yaml:1-6; controlplane/kubeadm/config/default/kustomization.yaml:8).
export const DEFINITIONS = [
  definition("clusters.cluster.x-k8s.io", "cluster.x-k8s.io", "Cluster"),
  definition(
    "kubeadmcontrolplanes.controlplane.cluster.x-k8s.io",
    "controlplane.cluster.x-k8s.io",
    "KubeadmControlPlane",
    {
      "cluster.x-k8s.io/v1beta1": "v1beta1",
      "cluster.x-k8s.io/v1beta2": "v1beta2",
      "cluster.x-k8s.io/provider": "control-plane-kubeadm",
    },
  ),
];

// The definition of the infrastructure cluster of the development provider, with the labels of the release
// (test/infrastructure/docker/config/crd/kustomization.yaml:1-6; test/infrastructure/docker/config/default/kustomization.yaml:8).
export const DEV_CLUSTERS = definition(
  "devclusters.infrastructure.cluster.x-k8s.io",
  "infrastructure.cluster.x-k8s.io",
  "DevCluster",
  {
    "cluster.x-k8s.io/v1beta1": "v1beta1",
    "cluster.x-k8s.io/v1beta2": "v1beta2",
    "cluster.x-k8s.io/provider": "infrastructure-docker",
  },
);

// The definitions of the kinds of the development provider that the tree reads beside its infrastructure cluster, with
// the same labels.
export const DEV_DEFINITIONS = [
  ["devmachines", "DevMachine"],
  ["devmachinetemplates", "DevMachineTemplate"],
  ["devmachinepools", "DevMachinePool"],
].map(([plural, kind]) =>
  definition(`${plural}.infrastructure.cluster.x-k8s.io`, "infrastructure.cluster.x-k8s.io", kind, {
    "cluster.x-k8s.io/v1beta1": "v1beta1",
    "cluster.x-k8s.io/v1beta2": "v1beta2",
    "cluster.x-k8s.io/provider": "infrastructure-docker",
  }),
);

// The host of a cluster that serves Cluster API: the APIs and the stores of the kinds named, and the store of
// definitions loaded with the definitions given.
export function serve(names: readonly ApiName[] = Object.keys(APIS) as ApiName[], definitions = DEFINITIONS) {
  const stores = Object.fromEntries(
    names.map((name) => {
      const store = new FakeStore(APIS[name]);

      host.registerApi(APIS[name], store);
      return [name, store];
    }),
  ) as Partial<Record<ApiName, FakeStore>>;

  runInAction(() => {
    host.crdStore.items = definitions;
    host.crdStore.isLoaded = true;
  });
  return stores;
}
