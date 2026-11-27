/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The reads of a view of one Cluster whose namespace the page does not read (SPEC-0004, P31): the details of the
// extension opened by their address on a namespace that the filter leaves out, or the panel in the details of the
// host, which can open with no page of the extension mounted; and the tree of a Cluster, which reads through nothing
// else (SPEC-0005, P6). It reads its Cluster and the objects of its Cluster in that namespace through stores of its
// own, whatever namespaces the filter selects (SPEC-0001, A13):
//
// - one instance of the `KubeObjectStore` subclass of the model of each kind that it reads, the Cluster included,
//   built with the API that the host registered for that kind, and never registered, so that the store that the host
//   returns for that API stays its own;
// - for a kind of a provider that a reference of what it read names, one `ProviderObjectStore`, built with the API
//   that the host registered for that kind at the version of its contract;
// - in the effect that the view opens: for each store, one `loadAll` of its namespace, then, once it has ended, its
//   `subscribe`, under one `AbortController` that the effect creates, as the host does for its own subscriptions.
//   Each store reads under a controller of its own, which that one aborts, so that a store that the view no longer
//   needs stops alone: a store that the view needs later, as a reference names a kind of a provider, starts as it is
//   built, and when the host registers the APIs again, as it does after its store of definitions failed, the stores
//   built on the old ones stop as those of the new ones start. When the view closes, every subscription ends.
//
// The kinds of a view are its parameter (SPEC-0005, P6): the details of a Cluster and the panel in the details of the
// host read the kinds of SPEC-0004, and follow the references of their Cluster alone; the tree reads more kinds,
// follows every reference that it places an object by, through the two functions of `references.ts` that the tree
// uses too, which say which objects of the Cluster it follows and what each of them names, and reads the
// ClusterClasses in the namespace that the class reference of its Cluster names, and no other, once the Cluster is
// read. When that is another namespace than that of the Cluster, the filter of the reads holds both, and every other
// store keeps the namespace of the Cluster alone; when the reference names another namespace, the store of
// ClusterClasses stops, the view forgets it, and a new one reads the namespace now named.
//
// The stores are built in the effect, once for each API and namespace, so that the second run of an effect that
// Freelens dev renders in `React.StrictMode` builds nothing more, and a view that never mounts builds nothing. Each
// store keeps its own loaded namespaces and its own items, so the read touches nothing that the page, or a list of the
// host, reads, and its failures give the state of the view alone (P25). The view takes its context from the items of
// its stores, which hold its namespaces alone, and not from their `contextItems`, which follow the filter, and builds
// the indexes of that context again only when what they read changes, as the list does.
//
// A refresh of the view (SPEC-0005, P23) ends the read of every store, its load, its watch and its reload, and starts
// it again on the same store, which keeps its objects meanwhile; each load that it starts is a refresh, which the
// state of the reads tells from a first load. It forgets the definitions whose read was refused or failed, and asks
// for those again.
//
// It reads no kind of the operator, which the page reads in the namespaces of the filter (P2), and the details read no
// ClusterClass in another namespace than that of their Cluster (SPEC-0001, R3.12): the model notes them.

import { Renderer } from "@freelensapp/extensions";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { contextVersions, indexContext } from "../../common/views/context";
import { failureOf, firstLoadsEnded, NO_READS, reduceReads } from "../../common/views/read-state";
import {
  classReferenceOf,
  contractReferenceOf,
  followedObjectsOf,
  followedReferencesOf,
  resolveReference,
} from "../../common/views/references";
import { Cluster, ClusterStore } from "../api/cluster/cluster-v1beta2";
import {
  ClusterClass,
  ClusterClassStore,
  ClusterResourceSet,
  ClusterResourceSetBinding,
  ClusterResourceSetBindingStore,
  ClusterResourceSetStore,
  IPAddress,
  IPAddressClaim,
  IPAddressClaimStore,
  IPAddressStore,
  KubeadmConfig,
  KubeadmConfigStore,
  KubeadmConfigTemplate,
  KubeadmConfigTemplateStore,
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

import type { ClusterObject, KubeObjectData } from "../../common/status/index";
import type { ContextIndex, ContextObjects, KindObjects, ProviderKindObjects } from "../../common/views/context";
import type { KindDescriptor, KindFeeds, ReadEvent, ReadsState } from "../../common/views/read-state";
import type { ContractReference, FollowedReference, ResolvedReference } from "../../common/views/references";
import type { ClusterSource } from "./cluster-source";
import type { HostStore, Load, ReadStore, ReadsListener } from "./store-adapter";

type HostObject = Renderer.K8sApi.KubeObject;

// The API that the host registered for a kind, as the stores of the view take it.
type HostApi = ConstructorParameters<typeof ProviderObjectStore>[0];

// A store of the view's own, as it reads it: through an adapter, which tells the view its loads and their failures,
// and its items, which hold the namespace of the store alone.
type OwnStore = HostStore<HostObject> & { readonly items: readonly HostObject[] };

// A kind of Cluster API that a view reads, with the store class of its model, its noun, what the status model takes
// from it, and where it reads it: in the namespace of its Cluster, or, for the ClusterClasses of the tree, in the one
// that the class reference of the Cluster names (SPEC-0005, P6).
export interface ModelKind {
  readonly model: { readonly kind: string; readonly crd: { readonly apiVersions: readonly string[]; plural: string } };
  readonly Store: new (api: never) => unknown;
  readonly noun: string;
  readonly feeds: KindFeeds;
  readonly where: "cluster" | "class";
}

// The kinds that every view of one Cluster reads, and those that the tree adds.
type ContextKind =
  | "clusters"
  | "machines"
  | "machineSets"
  | "machineDeployments"
  | "machinePools"
  | "kubeadmControlPlanes"
  | "healthChecks"
  | "clusterClasses";
type TreeKind =
  | "kubeadmConfigs"
  | "kubeadmConfigTemplates"
  | "clusterResourceSets"
  | "clusterResourceSetBindings"
  | "ipAddressClaims"
  | "ipAddresses";

// The kinds of a view of one Cluster (SPEC-0005, P6): the models that it reads, and the references that it follows to
// the kinds of a provider, those of its Cluster alone or every one that the tree places an object by.
export interface ViewKinds {
  readonly models: Readonly<Record<ContextKind, ModelKind>> & Readonly<Partial<Record<TreeKind, ModelKind>>>;
  readonly references: "cluster" | "tree";
}

const CONTEXT_KINDS: Readonly<Record<ContextKind, ModelKind>> = {
  clusters: { model: Cluster, Store: ClusterStore, noun: "Clusters", feeds: "rows", where: "cluster" },
  machines: { model: Machine, Store: MachineStore, noun: "Machines", feeds: "machines", where: "cluster" },
  machineSets: {
    model: MachineSet,
    Store: MachineSetStore,
    noun: "MachineSets",
    feeds: "machine-sets",
    where: "cluster",
  },
  machineDeployments: {
    model: MachineDeployment,
    Store: MachineDeploymentStore,
    noun: "MachineDeployments",
    feeds: "parts",
    where: "cluster",
  },
  machinePools: {
    model: MachinePool,
    Store: MachinePoolStore,
    noun: "MachinePools",
    feeds: "machine-pools",
    where: "cluster",
  },
  kubeadmControlPlanes: {
    model: KubeadmControlPlane,
    Store: KubeadmControlPlaneStore,
    noun: "KubeadmControlPlanes",
    feeds: "parts",
    where: "cluster",
  },
  healthChecks: {
    model: MachineHealthCheck,
    Store: MachineHealthCheckStore,
    noun: "MachineHealthChecks",
    feeds: "health-checks",
    where: "cluster",
  },
  clusterClasses: {
    model: ClusterClass,
    Store: ClusterClassStore,
    noun: "ClusterClasses",
    feeds: "cluster-class",
    where: "cluster",
  },
};

// The kinds that the details of a Cluster and the panel in the details of the host read (SPEC-0004, "What the view
// reads", P31).
export const CLUSTER_VIEW_KINDS: ViewKinds = { models: CONTEXT_KINDS, references: "cluster" };

// The kinds that the tree of a Cluster reads (SPEC-0005, "What the tree reads", P6).
export const TREE_VIEW_KINDS: ViewKinds = {
  models: {
    ...CONTEXT_KINDS,
    clusterClasses: { ...CONTEXT_KINDS.clusterClasses, where: "class" },
    kubeadmConfigs: {
      model: KubeadmConfig,
      Store: KubeadmConfigStore,
      noun: "KubeadmConfigs",
      feeds: "nodes",
      where: "cluster",
    },
    kubeadmConfigTemplates: {
      model: KubeadmConfigTemplate,
      Store: KubeadmConfigTemplateStore,
      noun: "KubeadmConfigTemplates",
      feeds: "nodes",
      where: "cluster",
    },
    clusterResourceSets: {
      model: ClusterResourceSet,
      Store: ClusterResourceSetStore,
      noun: "ClusterResourceSets",
      feeds: "nodes",
      where: "cluster",
    },
    clusterResourceSetBindings: {
      model: ClusterResourceSetBinding,
      Store: ClusterResourceSetBindingStore,
      noun: "ClusterResourceSetBindings",
      feeds: "bindings",
      where: "cluster",
    },
    ipAddressClaims: {
      model: IPAddressClaim,
      Store: IPAddressClaimStore,
      noun: "IPAddressClaims",
      feeds: "nodes",
      where: "cluster",
    },
    ipAddresses: { model: IPAddress, Store: IPAddressStore, noun: "IPAddresses", feeds: "nodes", where: "cluster" },
  },
  references: "tree",
};

// The group of a model, from the first of its versions.
function groupOfModel(model: ModelKind["model"]): string {
  return model.crd.apiVersions[0].split("/")[0];
}

// The API that the host registered for a model, from its registry, which sends no request; undefined for a kind that
// the cluster does not serve.
function apiOfModel(model: ModelKind["model"]): HostApi | undefined {
  for (const apiVersion of model.crd.apiVersions) {
    const api = Renderer.K8sApi.apiManager.getApiByKind(model.kind, apiVersion);

    if (api !== undefined) return api as unknown as HostApi;
  }
  return undefined;
}

// A kind of a provider that a reference names, with the resolution of the reference, its API, and what the view
// takes from it.
interface ProviderRead {
  readonly reference: ContractReference;
  readonly resolution: ResolvedReference;
  readonly api: HostApi | undefined;
  readonly feeds: KindFeeds;
}

// A store of the view: its API, the namespace that it reads, and the store.
interface Built {
  readonly api: HostApi;
  readonly namespace: string;
  readonly store: OwnStore;
}

// A store that the view needs, before it is built.
interface Needed {
  readonly api: HostApi;
  readonly namespace: string;
  readonly Store: new (api: HostApi) => OwnStore;
}

const NOT_READ: KindObjects<never> = { key: undefined, items: [] };

export class ClusterNamespaceRead implements ReadsListener, ClusterSource {
  readonly namespace: string;
  readonly name: string;
  readonly viewKinds: ViewKinds;
  readonly definitions: DefinitionReads;
  readonly #state: { get(): ReadsState; set(state: ReadsState): void };
  // The stores of the view, one for each API and namespace, however many kinds or references name it. Built in the
  // effect.
  readonly #stores = observable.array<Built>([], { deep: false });
  // The key of the store of the view behind each adapter, which keys the state of its reads.
  readonly #keys = new WeakMap<ReadStore, string>();
  // The adapters whose load a refresh starts: each adapter reads one load and its subscription.
  readonly #refreshing = new WeakSet<ReadStore>();
  readonly #now: () => number;
  #nextLoad = 0;
  #index: { readonly reads: ReadsState; readonly versions: string; readonly index: ContextIndex } | undefined;
  // What a refresh does while the effect runs.
  #restart: (() => void) | undefined;
  // The first loads of the view have all ended once, its store of Clusters among them, which they stay for the life of
  // the read (SPEC-0005, P13).
  #firstLoadsEnded = false;

  constructor(
    namespace: string,
    name: string,
    kinds: ViewKinds,
    definitions = new DefinitionReads(),
    now: () => number = Date.now,
  ) {
    this.namespace = namespace;
    this.name = name;
    this.viewKinds = kinds;
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
    return this.#stores.map((built) => built.store);
  }

  #builtOf(api: HostApi | undefined, namespace: string | undefined): Built | undefined {
    return api === undefined || namespace === undefined
      ? undefined
      : this.#stores.find((built) => built.api === api && built.namespace === namespace);
  }

  // The key of a store and its items, which the model takes as the plain data of its kind.
  #objectsOf(
    api: HostApi | undefined,
    namespace: string | undefined,
  ): { readonly key: string | undefined; readonly items: never[] } {
    const built = this.#builtOf(api, namespace);

    return {
      key: built === undefined ? undefined : storeKey(built.store),
      items: (built?.store.items ?? []) as never[],
    };
  }

  // The Clusters of the namespace, from the view's own store of Clusters.
  clusters(): KindObjects<ClusterObject> {
    return this.#objectsOf(apiOfModel(Cluster), this.namespace);
  }

  // The Cluster of the view, once its store holds it.
  #own(): ClusterObject | undefined {
    return this.clusters().items.find((cluster) => cluster.metadata?.name === this.name);
  }

  // The namespace in which the view reads the ClusterClasses of the tree: the one that the class reference of its
  // Cluster names, that of the Cluster when it names none; undefined until the Cluster is read, and for a Cluster with
  // no class (SPEC-0005, P6).
  #classNamespace(): string | undefined {
    const cluster = this.#own();

    return cluster === undefined ? undefined : classReferenceOf(cluster)?.namespace;
  }

  #namespaceOf(kind: ModelKind): string | undefined {
    return kind.where === "cluster" ? this.namespace : this.#classNamespace();
  }

  #modelObjects(kind: ModelKind | undefined): KindObjects<never> {
    return kind === undefined ? NOT_READ : this.#objectsOf(apiOfModel(kind.model), this.#namespaceOf(kind));
  }

  // The kind of a provider that a reference names, resolved through its definition (SPEC-0004, P3).
  #providerRead(reference: ContractReference, feeds: KindFeeds): ProviderRead {
    const resolution = resolveReference(reference, this.definitions.readOf(reference.apiGroup, reference.kind));
    const api =
      resolution.state === "resolved"
        ? (Renderer.K8sApi.apiManager.getApiByKind(reference.kind, resolution.apiVersion) as HostApi | undefined)
        : undefined;

    return { reference, resolution, api, feeds };
  }

  // The kinds of a provider that the Cluster of the view names, its control plane and its infrastructure cluster.
  #providers(field: "controlPlaneRef" | "infrastructureRef"): ProviderRead[] {
    const cluster = this.#own();
    const reference = cluster === undefined ? undefined : contractReferenceOf(cluster.spec?.[field]);

    return reference === undefined
      ? []
      : [this.#providerRead(reference, field === "controlPlaneRef" ? "parts" : "infrastructure")];
  }

  #providerObjects(reads: readonly ProviderRead[]): Map<string, ProviderKindObjects> {
    return new Map(
      reads.map(({ reference, resolution, api }) => [
        `${reference.apiGroup}/${reference.kind}`,
        { ...this.#objectsOf(api, this.namespace), resolution },
      ]),
    );
  }

  // Whether a model of the view reads the kind that a reference names: its objects are then in the store of that
  // model, and the view reads no definition for it.
  #isModel(reference: ContractReference): boolean {
    return Object.values(this.viewKinds.models).some(
      (kind) =>
        kind !== undefined && kind.model.kind === reference.kind && groupOfModel(kind.model) === reference.apiGroup,
    );
  }

  // The references that the tree follows beside those of its Cluster (SPEC-0005, P6), those by which it places what
  // they name: of the Machines, the MachineDeployments, the MachineSets and the MachinePools of its Cluster, and of its
  // control planes, the KubeadmControlPlanes at `v1beta2` with no definition and the objects of the kind of a provider
  // that the Cluster names as its control plane once its definition resolves (`followedObjectsOf`), each by what
  // `followedReferencesOf` says that it names; none for a view that follows those of its Cluster alone.
  #treeReferences(): FollowedReference[] {
    const cluster = this.#own();

    if (this.viewKinds.references !== "tree" || cluster === undefined) return [];

    const { models } = this.viewKinds;
    const itemsOf = (kind: ModelKind) => this.#modelObjects(kind).items as readonly KubeObjectData[];
    const [controlPlane] = this.#providers("controlPlaneRef");
    const resolution = controlPlane?.resolution;
    const ofProvider =
      controlPlane === undefined || resolution?.state !== "resolved" || this.#isModel(controlPlane.reference)
        ? undefined
        : {
            objects: this.#objectsOf(controlPlane.api, this.namespace).items as readonly KubeObjectData[],
            contract: resolution.contract,
          };

    return followedObjectsOf(cluster, {
      machines: itemsOf(models.machines),
      machineDeployments: itemsOf(models.machineDeployments),
      machineSets: itemsOf(models.machineSets),
      machinePools: itemsOf(models.machinePools),
      kubeadmControlPlanes: itemsOf(models.kubeadmControlPlanes),
      ...(ofProvider === undefined ? {} : { controlPlanes: ofProvider }),
    }).flatMap(({ object, controlPlane: contract }) => followedReferencesOf(object, contract));
  }

  // The kinds of a provider that the references of the tree name, each once, but those that a model of the view reads.
  #treeProviders(): ProviderRead[] {
    const seen = new Map<string, ProviderRead>();

    for (const { reference } of this.#treeReferences()) {
      const id = `${reference.apiGroup}/${reference.kind}`;

      if (!seen.has(id) && !this.#isModel(reference)) seen.set(id, this.#providerRead(reference, "nodes"));
    }
    return [...seen.values()];
  }

  // What the status model takes, from the items of the stores of the view, in their namespaces alone.
  objects(): ContextObjects {
    const { models } = this.viewKinds;

    return {
      reads: this.reads,
      machines: this.#modelObjects(models.machines),
      machineSets: this.#modelObjects(models.machineSets),
      machineDeployments: this.#modelObjects(models.machineDeployments),
      machinePools: this.#modelObjects(models.machinePools),
      healthChecks: this.#modelObjects(models.healthChecks),
      clusterClasses: this.#modelObjects(models.clusterClasses),
      // No kind of the operator, which a view of one Cluster does not read: the model notes the availability of the
      // controllers as not read.
      controlPlanes: this.#providerObjects(this.#providers("controlPlaneRef")),
      infrastructures: this.#providerObjects(this.#providers("infrastructureRef")),
      ...(this.viewKinds.references === "tree"
        ? {
            tree: {
              kubeadmControlPlanes: this.#modelObjects(models.kubeadmControlPlanes),
              kubeadmConfigs: this.#modelObjects(models.kubeadmConfigs),
              kubeadmConfigTemplates: this.#modelObjects(models.kubeadmConfigTemplates),
              clusterResourceSets: this.#modelObjects(models.clusterResourceSets),
              clusterResourceSetBindings: this.#modelObjects(models.clusterResourceSetBindings),
              ipAddressClaims: this.#modelObjects(models.ipAddressClaims),
              ipAddresses: this.#modelObjects(models.ipAddresses),
              providers: this.#providerObjects(this.#treeProviders()),
            },
          }
        : {}),
    };
  }

  // The indexes of the context, built again only when what they read changes: the state of the reads, and the key, the
  // identity and the version of every object of every store of the view, and how each reference resolves; never at a
  // render or a tick of a timer that changes none of them (AGENTS.md, "Rules That Fail Silently").
  index(): ContextIndex {
    const objects = this.objects();
    const versions = contextVersions(objects);

    if (this.#index === undefined || this.#index.reads !== objects.reads || this.#index.versions !== versions) {
      this.#index = { reads: objects.reads, versions, index: indexContext(objects) };
    }
    return this.#index.index;
  }

  #allProviders(): ProviderRead[] {
    return [...this.#providers("controlPlaneRef"), ...this.#providers("infrastructureRef"), ...this.#treeProviders()];
  }

  // The kinds that the view reads, by the key of their store, for what it says of a read that failed.
  kinds(): (KindDescriptor & { readonly key: string })[] {
    const models = Object.values(this.viewKinds.models).flatMap((kind) => {
      if (kind === undefined) return [];

      const { model, noun, feeds } = kind;
      const built = this.#builtOf(apiOfModel(model), this.#namespaceOf(kind));

      return built === undefined
        ? []
        : [
            {
              key: storeKey(built.store),
              kind: model.kind,
              noun,
              feeds,
              group: groupOfModel(model),
              resource: model.crd.plural,
            },
          ];
    });
    const providers = this.#allProviders().flatMap(({ reference, resolution, api, feeds }) => {
      const built = this.#builtOf(api, this.namespace);

      return built === undefined || resolution.state !== "resolved"
        ? []
        : [
            {
              key: storeKey(built.store),
              kind: reference.kind,
              noun: `${reference.kind} objects`,
              feeds,
              group: reference.apiGroup,
              resource: resolution.plural,
            },
          ];
    });
    const seen = new Set<string>();

    return [...models, ...providers].filter((kind) => !seen.has(kind.key) && Boolean(seen.add(kind.key)));
  }

  // Whether the first loads of the view have ended (SPEC-0005, P13): the first load of its store of Clusters has ended,
  // loaded or failed, and so has the first load of every other store that the view reads, and every reference to a kind
  // of a provider has been resolved, or cannot be; the tree shows no row before. The view builds its store of Clusters
  // in `start`, once the host has registered the API of the Clusters, so they have not ended before the read starts,
  // nor while the host has registered no API, as while it checks (P19) and the view has no store yet. Once they have
  // all ended, they stay so for the life of the read: a load that starts later, of a kind that a reference names later,
  // of the namespace that the class reference names now, or of a definition that a refresh asks again, is no first load
  // of the tree, which stays shown, and its nodes show their own loading (P6, P19, P23).
  firstLoadsEnded(): boolean {
    this.#firstLoadsEnded ||=
      this.clusters().key !== undefined &&
      this.#allProviders().every(({ resolution }) => resolution.state !== "pending") &&
      firstLoadsEnded(
        this.reads,
        this.#stores.map((built) => storeKey(built.store)),
      );
    return this.#firstLoadsEnded;
  }

  // Whether a first read of a kind runs now (SPEC-0005, P23): before the first loads of the view have ended, and, once
  // they have, while the first load of a store runs that the view built later, of a kind that a reference names later
  // or of the namespace that the class reference names now, or while the definition of a kind of a provider that a
  // reference names is still being read. Unlike `firstLoadsEnded`, it does not stay false once it is: it turns true
  // again whenever such a read starts, and false once it has ended. The refresh of the tree is disabled while it holds,
  // since a refresh would end such a load, and a load of a refresh that fails leaves the kind with no load that ended.
  firstLoadsRun(): boolean {
    return (
      !this.firstLoadsEnded() ||
      this.#allProviders().some(({ resolution }) => resolution.state === "pending") ||
      !firstLoadsEnded(
        this.reads,
        this.#stores.map((built) => storeKey(built.store)),
      )
    );
  }

  // The stores that the view needs: those of its models, each on its namespace, then those of the kinds of a provider
  // that the references that it follows name, once what names them is read and their definitions are.
  #neededStores(): Needed[] {
    const models = Object.values(this.viewKinds.models).flatMap((kind): Needed[] => {
      const api = kind === undefined ? undefined : apiOfModel(kind.model);
      const namespace = kind === undefined ? undefined : this.#namespaceOf(kind);

      return kind === undefined || api === undefined || namespace === undefined
        ? []
        : [{ api, namespace, Store: kind.Store as unknown as Needed["Store"] }];
    });
    const providers = this.#allProviders().flatMap(({ api }): Needed[] =>
      api === undefined
        ? []
        : [
            {
              api,
              namespace: this.namespace,
              Store: (Object.values(this.viewKinds.models).find(
                (kind) => kind !== undefined && apiOfModel(kind.model) === api,
              )?.Store ?? ProviderObjectStore) as unknown as Needed["Store"],
            },
          ],
    );
    const unique: Needed[] = [];

    for (const needed of [...models, ...providers]) {
      if (!unique.some((each) => each.api === needed.api && each.namespace === needed.namespace)) unique.push(needed);
    }
    return unique;
  }

  // A store of the view for an API and a namespace, built once: of the model's class for a kind of Cluster API, else of
  // the generic class for a kind of a provider.
  #build({ api, namespace, Store }: Needed): Built {
    let built = this.#builtOf(api, namespace);

    if (built === undefined) {
      built = { api, namespace, store: new Store(api) };
      runInAction(() => this.#stores.push(built as Built));
    }
    return built;
  }

  // The namespaces of the filter of the reads: that of the Cluster, and that of its class when the tree reads one
  // elsewhere.
  #filterNamespaces(): string[] {
    const classNamespace = Object.values(this.viewKinds.models).some((kind) => kind?.where === "class")
      ? this.#classNamespace()
      : undefined;

    return [...new Set([this.namespace, ...(classNamespace === undefined ? [] : [classNamespace])])];
  }

  // The definitions of the kinds of a provider that the references name, by a GET when the host cannot list them (P3).
  #definitionKinds(): { group: string; kind: string }[] {
    return this.#allProviders().map(({ reference }) => ({ group: reference.apiGroup, kind: reference.kind }));
  }

  // Reads the view again, for the refresh of the tree (SPEC-0005, P23), while its effect runs; nothing otherwise.
  refresh(): void {
    this.#restart?.();
  }

  // The reads of the view, for an effect of the view, which ends them on its cleanup.
  start(): () => void {
    // The filter follows the namespace of the class that the tree reads (SPEC-0005, P6). It is followed before the
    // stores start, since a load can end within the call that starts it.
    const stopFilter = reaction(
      () => this.#filterNamespaces(),
      (namespaces) => {
        if (!compareStructural(namespaces, this.reads.filter?.namespaces)) {
          this.#dispatch({ type: "filter-changed", namespaces, selectedAll: false });
        }
      },
      { fireImmediately: true, equals: compareStructural },
    );
    const controller = new AbortController();
    // The reads that run, by store, each with what stops it.
    let running = new Map<Built, () => void>();
    const read = (built: Built, refresh: boolean): (() => void) => {
      const own = new AbortController();
      const abortOwn = () => own.abort();
      const adapter = new StoreAdapter(built.store, this, () => 0);
      let unsubscribe: (() => void) | undefined;

      controller.signal.addEventListener("abort", abortOwn);
      this.#keys.set(adapter, storeKey(built.store));
      if (refresh) this.#refreshing.add(adapter);
      void adapter
        .loadAll({
          namespaces: [built.namespace],
          reqInit: { signal: own.signal },
          onLoadFailure: () => undefined,
        })
        .then(() => {
          if (!own.signal.aborted) {
            unsubscribe = adapter.subscribe({ onLoadFailure: () => undefined, abortController: own });
          }
        });
      return () => {
        controller.signal.removeEventListener("abort", abortOwn);
        own.abort();
        unsubscribe?.();
      };
    };
    const stopStores = reaction(
      () => this.#neededStores(),
      (needs) => {
        const needed = new Set(needs.map((need) => this.#build(need)));

        // A store that the view no longer needs, as one built on an API that the host replaced, or the store of the
        // ClusterClasses of a namespace that the class reference no longer names, stops, and the view forgets it, as
        // the stores of the new APIs start.
        for (const [built, stop] of running) {
          if (needed.has(built)) continue;
          stop();
          this.#forget(built);
        }
        running = new Map([...running].filter(([built]) => needed.has(built)));
        for (const built of needed) if (!running.has(built)) running.set(built, read(built, false));
      },
      { fireImmediately: true },
    );
    // The definitions of the kinds that the references name, by a GET when the host cannot list them (P3).
    const stopDefinitions = reaction(
      () => this.#definitionKinds(),
      (kinds) => this.definitions.request(kinds),
      { fireImmediately: true, equals: compareStructural },
    );

    this.#restart = () => {
      this.definitions.forgetFailures();
      running = new Map(
        [...running].map(([built, stop]) => {
          stop();
          return [built, read(built, true)] as const;
        }),
      );
      this.definitions.request(this.#definitionKinds());
    };

    return () => {
      this.#restart = undefined;
      stopStores();
      stopFilter();
      stopDefinitions();
      controller.abort();
      for (const stop of running.values()) stop();
      running.clear();
    };
  }

  // A store of the view that it no longer needs, which it forgets.
  #forget(built: Built): void {
    runInAction(() => this.#stores.replace(this.#stores.filter((each) => each !== built)));
  }

  #dispatch(event: ReadEvent): void {
    runInAction(() => this.#state.set(reduceReads(this.#state.get(), event)));
  }

  #keyOf(store: ReadStore): string {
    return this.#keys.get(store) ?? storeKey(store);
  }

  loadStarted(store: ReadStore, namespaces: readonly string[]): Load {
    const load: Load = { id: ++this.#nextLoad, namespaces, overWholeCluster: false };
    const refresh = this.#refreshing.has(store);

    this.#dispatch({
      type: "load-started",
      kind: this.#keyOf(store),
      id: load.id,
      namespaces,
      ...(refresh ? { refresh } : {}),
    });
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
