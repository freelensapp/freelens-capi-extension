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
} as const;

export type ApiName = keyof typeof APIS;

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
