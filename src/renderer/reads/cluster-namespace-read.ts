/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The reads of a view of one Cluster whose namespace the page does not read (SPEC-0004, P31): the details of the
// extension opened by their address on a namespace that the filter leaves out, or the panel in the details of the
// host, which can open with no page of the extension mounted. It reads its Cluster and the objects of its Cluster in
// that namespace through stores of its own, whatever namespaces the filter selects (SPEC-0001, A13):
//
// - one instance of the `KubeObjectStore` subclass of the model of each kind that it reads, the Cluster included,
//   built with the API that the host registered for that kind, and never registered, so that the store that the host
//   returns for that API stays its own;
// - for a kind of a provider that the Cluster names, its control plane or its infrastructure cluster, one
//   `ProviderObjectStore`, built with the API that the host registered for that kind at the version of its contract;
// - in the effect that the view opens: for each store, one `loadAll` of that namespace, then its `subscribe`, under
//   one `AbortController` that the effect creates, as the host does for its own subscriptions; a store that the view
//   needs later, as a reference names a kind of a provider, is loaded and subscribed under the same controller. When
//   the view closes, the subscriptions end.
//
// The stores are built in the effect, once for the view, so that the second run of an effect that Freelens dev
// renders in `React.StrictMode` builds nothing more, and a view that never mounts builds nothing. Each store keeps its
// own loaded namespaces and its own items, so the read touches nothing that the page, or a list of the host, reads,
// and its failures give the state of the view alone (P25). The view takes its context from the items of its stores,
// which hold that namespace alone, and not from their `contextItems`, which follow the filter.
//
// It reads the namespace of its Cluster alone: the kinds of the operator, which the page reads in the namespaces of
// the filter (P2), and a ClusterClass in another namespace (SPEC-0001, R3.12), are not read for the view, and the
// model notes them.

import { Renderer } from "@freelensapp/extensions";
import { observable, reaction, runInAction } from "mobx";
import { failureOf, NO_READS, reduceReads } from "../../common/views/read-state";
import { contractReferenceOf, resolveReference } from "../../common/views/references";
import { Cluster, ClusterStore } from "../api/cluster/cluster-v1beta2";
import {
  ClusterClass,
  ClusterClassStore,
  KubeadmControlPlane,
  KubeadmControlPlaneStore,
  Machine,
  MachineDeployment,
  MachineDeploymentStore,
  MachineHealthCheck,
  MachineHealthCheckStore,
  MachinePool,
  MachinePoolStore,
  MachineSet,
  MachineSetStore,
  MachineStore,
} from "../api/context/context-models";
import { DefinitionReads } from "./definitions";
import { storeKey } from "./page-reads";
import { ProviderObjectStore } from "./provider-object-store";
import { StoreAdapter } from "./store-adapter";

import type { ClusterObject } from "../../common/status/index";
import type { ContextObjects, KindObjects, ProviderKindObjects } from "../../common/views/context";
import type { KindDescriptor, KindFeeds, ReadEvent, ReadsState } from "../../common/views/read-state";
import type { ContractReference, ResolvedReference } from "../../common/views/references";
import type { ClusterSource } from "./cluster-source";
import type { HostStore, Load, ReadStore, ReadsListener } from "./store-adapter";

type HostObject = Renderer.K8sApi.KubeObject;

// The API that the host registered for a kind, as the stores of the view take it.
type HostApi = ConstructorParameters<typeof ProviderObjectStore>[0];

// A store of the view's own, as it reads it: through an adapter, which tells the view its loads and their failures,
// and its items, which hold the namespace of the view alone.
type OwnStore = HostStore<HostObject> & { readonly items: readonly HostObject[] };

interface ModelKind {
  readonly model: { readonly kind: string; readonly crd: { readonly apiVersions: readonly string[]; plural: string } };
  readonly Store: new (api: never) => unknown;
  readonly noun: string;
  readonly feeds: KindFeeds;
}

// The kinds of Cluster API that a view of one Cluster reads in its namespace, each with the store class of its model.
const MODEL_KINDS = {
  clusters: { model: Cluster, Store: ClusterStore, noun: "Clusters", feeds: "rows" },
  machines: { model: Machine, Store: MachineStore, noun: "Machines", feeds: "machines" },
  machineSets: { model: MachineSet, Store: MachineSetStore, noun: "MachineSets", feeds: "machine-sets" },
  machineDeployments: {
    model: MachineDeployment,
    Store: MachineDeploymentStore,
    noun: "MachineDeployments",
    feeds: "parts",
  },
  machinePools: { model: MachinePool, Store: MachinePoolStore, noun: "MachinePools", feeds: "machine-pools" },
  kubeadmControlPlanes: {
    model: KubeadmControlPlane,
    Store: KubeadmControlPlaneStore,
    noun: "KubeadmControlPlanes",
    feeds: "parts",
  },
  healthChecks: {
    model: MachineHealthCheck,
    Store: MachineHealthCheckStore,
    noun: "MachineHealthChecks",
    feeds: "health-checks",
  },
  clusterClasses: { model: ClusterClass, Store: ClusterClassStore, noun: "ClusterClasses", feeds: "cluster-class" },
} satisfies Record<string, ModelKind>;

type ModelName = keyof typeof MODEL_KINDS;

// The API that the host registered for a model, from its registry, which sends no request; undefined for a kind that
// the cluster does not serve.
function apiOfModel(model: ModelKind["model"]): HostApi | undefined {
  for (const apiVersion of model.crd.apiVersions) {
    const api = Renderer.K8sApi.apiManager.getApiByKind(model.kind, apiVersion);

    if (api !== undefined) return api as unknown as HostApi;
  }
  return undefined;
}

// A kind of a provider that the Cluster names, with the resolution of its reference and its store.
interface ProviderRead {
  readonly reference: ContractReference;
  readonly resolution: ResolvedReference;
  readonly api: HostApi | undefined;
}

export class ClusterNamespaceRead implements ReadsListener, ClusterSource {
  readonly namespace: string;
  readonly name: string;
  readonly definitions: DefinitionReads;
  readonly #state: { get(): ReadsState; set(state: ReadsState): void };
  // The stores of the view, by the API that the host registered for their kind: one for each API, however many
  // kinds or references name it. Built in the effect.
  readonly #stores = observable.map<HostApi, OwnStore>([], { deep: false });
  // The key of the store of the view behind each adapter, which keys the state of its reads.
  readonly #keys = new WeakMap<ReadStore, string>();
  readonly #now: () => number;
  #nextLoad = 0;

  constructor(namespace: string, name: string, definitions = new DefinitionReads(), now: () => number = Date.now) {
    this.namespace = namespace;
    this.name = name;
    this.definitions = definitions;
    this.#now = now;
    this.#state = observable.box<ReadsState>(
      reduceReads(NO_READS, { type: "filter-changed", namespaces: [namespace], selectedAll: false }),
      { deep: false },
    );
  }

  get reads(): ReadsState {
    return this.#state.get();
  }

  // The stores that the view has built, which the tests read.
  get stores(): readonly OwnStore[] {
    return [...this.#stores.values()];
  }

  #storeOf(api: HostApi | undefined): OwnStore | undefined {
    return api === undefined ? undefined : this.#stores.get(api);
  }

  // The key of a store and its items, which the model takes as the plain data of its kind.
  #objectsOf(api: HostApi | undefined): { readonly key: string | undefined; readonly items: never[] } {
    const store = this.#storeOf(api);

    return { key: store === undefined ? undefined : storeKey(store), items: (store?.items ?? []) as never[] };
  }

  // The Clusters of the namespace, from the view's own store of Clusters.
  clusters(): KindObjects<ClusterObject> {
    return this.#objectsOf(apiOfModel(Cluster));
  }

  // The kinds of a provider that the Cluster of the view names, its control plane and its infrastructure cluster,
  // resolved through their definitions (P3).
  #providers(field: "controlPlaneRef" | "infrastructureRef"): ProviderRead[] {
    const own = this.clusters().items.filter((cluster) => cluster.metadata?.name === this.name);

    return own.flatMap((cluster) => {
      const reference = contractReferenceOf(cluster.spec?.[field]);

      if (reference === undefined) return [];

      const resolution = resolveReference(reference, this.definitions.readOf(reference.apiGroup, reference.kind));
      const api =
        resolution.state === "resolved"
          ? (Renderer.K8sApi.apiManager.getApiByKind(reference.kind, resolution.apiVersion) as HostApi | undefined)
          : undefined;

      return [{ reference, resolution, api }];
    });
  }

  #providerObjects(field: "controlPlaneRef" | "infrastructureRef"): Map<string, ProviderKindObjects> {
    return new Map(
      this.#providers(field).map(({ reference, resolution, api }) => [
        `${reference.apiGroup}/${reference.kind}`,
        { ...this.#objectsOf(api), resolution },
      ]),
    );
  }

  // What the status model takes, from the items of the stores of the view, in its namespace alone.
  objects(): ContextObjects {
    const of = (name: ModelName) => this.#objectsOf(apiOfModel(MODEL_KINDS[name].model));

    return {
      reads: this.reads,
      machines: of("machines"),
      machineSets: of("machineSets"),
      machineDeployments: of("machineDeployments"),
      machinePools: of("machinePools"),
      healthChecks: of("healthChecks"),
      clusterClasses: of("clusterClasses"),
      // No kind of the operator, which a view of one Cluster does not read: the model notes the availability of the
      // controllers as not read.
      controlPlanes: this.#providerObjects("controlPlaneRef"),
      infrastructures: this.#providerObjects("infrastructureRef"),
    };
  }

  // The kinds that the view reads, by the key of their store, for what it says of a read that failed.
  kinds(): (KindDescriptor & { readonly key: string })[] {
    const models = Object.values(MODEL_KINDS).flatMap(({ model, noun, feeds }) => {
      const store = this.#storeOf(apiOfModel(model));
      const [group] = model.crd.apiVersions[0].split("/");

      return store === undefined
        ? []
        : [{ key: storeKey(store), kind: model.kind, noun, feeds, group, resource: model.crd.plural }];
    });
    const providers = (["controlPlaneRef", "infrastructureRef"] as const).flatMap((field) =>
      this.#providers(field).flatMap(({ reference, resolution, api }) => {
        const store = this.#storeOf(api);

        return store === undefined || resolution.state !== "resolved"
          ? []
          : [
              {
                key: storeKey(store),
                kind: reference.kind,
                noun: `${reference.kind} objects`,
                feeds: (field === "controlPlaneRef" ? "parts" : "infrastructure") as KindFeeds,
                group: reference.apiGroup,
                resource: resolution.plural,
              },
            ];
      }),
    );
    const seen = new Set<string>();

    return [...models, ...providers].filter((kind) => !seen.has(kind.key) && Boolean(seen.add(kind.key)));
  }

  // The APIs of the stores that the view needs: those of the models, then those of the kinds of a provider that its
  // Cluster names, once the Cluster is read and their definitions are.
  #neededApis(): HostApi[] {
    const models = Object.values(MODEL_KINDS)
      .map(({ model }) => apiOfModel(model))
      .filter((api): api is HostApi => api !== undefined);
    const providers = [...this.#providers("controlPlaneRef"), ...this.#providers("infrastructureRef")]
      .map(({ api }) => api)
      .filter((api): api is HostApi => api !== undefined);

    return [...new Set([...models, ...providers])];
  }

  // A store of the view for an API, built once: of the model's class for a kind of Cluster API, else of the generic
  // class for a kind of a provider.
  #build(api: HostApi): OwnStore {
    let store = this.#stores.get(api);

    if (store === undefined) {
      const model = Object.values(MODEL_KINDS).find((kind) => apiOfModel(kind.model) === api);
      const Store = (model?.Store ?? ProviderObjectStore) as new (api: HostApi) => OwnStore;

      store = new Store(api);
      runInAction(() => this.#stores.set(api, store as OwnStore));
    }
    return store;
  }

  // The reads of the view, for an effect of the view, which ends them on its cleanup.
  start(): () => void {
    const controller = new AbortController();
    const unsubscribes: (() => void)[] = [];
    const started = new Set<OwnStore>();
    const read = (store: OwnStore) => {
      const adapter = new StoreAdapter(store, this, () => 0);

      this.#keys.set(adapter, storeKey(store));
      started.add(store);
      void adapter
        .loadAll({
          namespaces: [this.namespace],
          reqInit: { signal: controller.signal },
          onLoadFailure: () => undefined,
        })
        .then(() => {
          if (!controller.signal.aborted) {
            unsubscribes.push(adapter.subscribe({ onLoadFailure: () => undefined, abortController: controller }));
          }
        });
    };
    const stopStores = reaction(
      () => this.#neededApis(),
      (apis) => {
        for (const api of apis) {
          const store = this.#build(api);

          if (!started.has(store)) read(store);
        }
      },
      { fireImmediately: true },
    );
    // The definitions of the kinds that the Cluster names, by a GET when the host cannot list them (P3).
    const stopDefinitions = reaction(
      () =>
        [...this.#providers("controlPlaneRef"), ...this.#providers("infrastructureRef")].map(({ reference }) => ({
          group: reference.apiGroup,
          kind: reference.kind,
        })),
      (kinds) => this.definitions.request(kinds),
      { fireImmediately: true, equals: (one, other) => JSON.stringify(one) === JSON.stringify(other) },
    );

    return () => {
      stopStores();
      stopDefinitions();
      controller.abort();
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    };
  }

  #dispatch(event: ReadEvent): void {
    runInAction(() => this.#state.set(reduceReads(this.#state.get(), event)));
  }

  #keyOf(store: ReadStore): string {
    return this.#keys.get(store) ?? storeKey(store);
  }

  loadStarted(store: ReadStore, namespaces: readonly string[]): Load {
    const load: Load = { id: ++this.#nextLoad, namespaces, overWholeCluster: false };

    this.#dispatch({ type: "load-started", kind: this.#keyOf(store), id: load.id, namespaces });
    return load;
  }

  loadFailed(store: ReadStore, load: Load, error: unknown): void {
    this.#dispatch({ type: "load-failed", kind: this.#keyOf(store), id: load.id, failure: failureOf(error) });
  }

  // A view of one namespace never reads it over the whole cluster (P34 does not concern it).
  loadEnded(store: ReadStore, load: Load): void {
    this.#dispatch({
      type: "load-ended",
      kind: this.#keyOf(store),
      id: load.id,
      overWholeCluster: false,
      followed: true,
      at: this.#now(),
    });
  }

  loadAborted(store: ReadStore, load: Load): void {
    this.#dispatch({ type: "load-aborted", kind: this.#keyOf(store), id: load.id });
  }

  refreshFailed(store: ReadStore, error: unknown): void {
    this.#dispatch({ type: "refresh-failed", kind: this.#keyOf(store), failure: failureOf(error), at: this.#now() });
  }

  reloadStarted(store: ReadStore): void {
    this.#dispatch({ type: "reload-started", kind: this.#keyOf(store) });
  }

  reloadEnded(store: ReadStore): void {
    this.#dispatch({ type: "reload-ended", kind: this.#keyOf(store) });
  }
}
