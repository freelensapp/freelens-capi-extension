// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet, STATES } from "../../../test/fixture-sets";
import { Common, host, Renderer } from "../../../test/freelens-extensions";
import {
  APIS,
  DEFINITIONS,
  DEV_CLUSTERS,
  DEV_DEFINITIONS,
  hostObject,
  serve,
  TREE_APIS,
} from "../../../test/host-stores";
import { hostObjects, objectsOfStates, sourceOf } from "../../../test/view-sources";
import { buildTree, indexTree } from "../../common/views/cluster-tree";
import * as references from "../../common/views/references";
import { ClusterStore } from "../api/cluster/cluster-v1beta2";
import {
  ClusterClassStore,
  ClusterResourceSetBindingStore,
  ClusterResourceSetStore,
  IPAddressClaimStore,
  IPAddressStore,
  KubeadmConfigStore,
  KubeadmConfigTemplateStore,
  KubeadmControlPlaneStore,
  MachineDeploymentStore,
  MachineHealthCheckStore,
  MachinePoolStore,
  MachineSetStore,
  MachineStore,
} from "../api/context/context-models";
import { ClusterPanel, SourcedClusterView } from "../details/cluster-details-v1beta2";
import { CLUSTER_VIEW_KINDS, ClusterNamespaceRead, TREE_VIEW_KINDS } from "./cluster-namespace-read";
import { publishPageSource } from "./cluster-source";
import { storeKey } from "./page-reads";
import { ProviderObjectStore } from "./provider-object-store";

import type { Renderer as Sdk } from "@freelensapp/extensions";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { HostObject } from "../../../test/host-stores";
import type { ClusterTree, TreeNode } from "../../common/views/cluster-tree";
import type { Cluster } from "../api/cluster/cluster-v1beta2";

// The cases of SPEC-0004, "Tests", "Unit", `cluster-namespace-read.test.ts` (P31): a view of one Cluster whose
// namespace the page reads builds no store of its own; one whose namespace it does not read, and the panel with no
// page mounted, build one store of the model's class for each kind, the Cluster included, and one
// `ProviderObjectStore` for each kind of a provider, with the API that the host registered, never registered with the
// API manager of the host, load that namespace alone, then subscribe each store, and end the subscriptions when the
// view closes; the view shows its Cluster from its own store; the effect run twice leaves one read running; and a
// failure of the read gives the state of the view alone.

const EXTENSION = new Renderer.LensExtension({ name: "@freelensapp/capi-extension" }) as unknown as Sdk.LensExtension;

const NAMESPACE = "freelens-capi-healthy";
const NAME = "freelens-capi-healthy";

interface OwnStore {
  readonly api: { readonly apiBase: string; readonly kind: string };
  readonly loadAll: ReturnType<typeof vi.fn>;
  readonly subscribe: ReturnType<typeof vi.fn>;
}

// The objects that the stores of the extension's own class read of the cluster, by the base of their API, with the
// failures that the next load of a kind reports, each for the namespace of the Cluster.
function serveOwn(objects: readonly HostObject[], failures: Partial<Record<string, unknown[]>> = {}) {
  for (const api of [...Object.values(APIS), ...Object.values(TREE_APIS)]) {
    host.cluster.set(api.apiBase, {
      items: objects.filter((object) => object.kind === api.kind),
      failures: (failures[api.kind] ?? []).map((error) => ({ namespace: NAMESPACE, error })),
    });
  }
}

function builtSince(count: number): OwnStore[] {
  return host.builtStores.slice(count) as OwnStore[];
}

function view(element: React.ReactElement) {
  return render(element);
}

function own(namespace = NAMESPACE, name = NAME) {
  return (
    <SourcedClusterView
      namespace={namespace}
      name={name}
      host={{ extension: EXTENSION, openCluster: vi.fn() }}
      metadata={true}
    />
  );
}

beforeEach(() => {
  host.reset();
  vi.setSystemTime(CAPTURE);
  Common.logger.error.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a view of one Cluster whose namespace the page reads", () => {
  it("builds no store of its own, and shows the Cluster from the stores of the page", () => {
    const objects = objectsOfStates(["healthy"]);
    const built = host.builtStores.length;
    const unpublish = publishPageSource(sourceOf(objects));

    try {
      view(own());

      expect(builtSince(built)).toEqual([]);
      expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    } finally {
      unpublish();
    }
  });
});

describe("a view of one Cluster whose namespace the page does not read (P31)", () => {
  it("builds a store of the model's class for each kind and one ProviderObjectStore for the kind of a provider, never registered", async () => {
    const stores = serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);
    const built = host.builtStores.length;

    serveOwn(objectsOfStates(["healthy"]));
    view(own());
    await act(async () => undefined);

    const ownStores = builtSince(built);
    const byKind = new Map(ownStores.map((store) => [store.api.kind, store]));

    expect(ownStores.map((store) => store.api.kind).sort()).toEqual(
      [
        "Cluster",
        "ClusterClass",
        "DevCluster",
        "KubeadmControlPlane",
        "Machine",
        "MachineDeployment",
        "MachineHealthCheck",
        "MachinePool",
        "MachineSet",
      ].sort(),
    );
    expect(byKind.get("Cluster")).toBeInstanceOf(ClusterStore);
    expect(byKind.get("Machine")).toBeInstanceOf(MachineStore);
    expect(byKind.get("MachineSet")).toBeInstanceOf(MachineSetStore);
    expect(byKind.get("MachineDeployment")).toBeInstanceOf(MachineDeploymentStore);
    expect(byKind.get("MachinePool")).toBeInstanceOf(MachinePoolStore);
    expect(byKind.get("KubeadmControlPlane")).toBeInstanceOf(KubeadmControlPlaneStore);
    expect(byKind.get("MachineHealthCheck")).toBeInstanceOf(MachineHealthCheckStore);
    expect(byKind.get("ClusterClass")).toBeInstanceOf(ClusterClassStore);
    expect(byKind.get("DevCluster")).toBeInstanceOf(ProviderObjectStore);

    // Each with the API that the host registered for its kind, at the version of its contract for the provider.
    expect(byKind.get("Cluster")?.api).toBe(APIS.clusters);
    expect(byKind.get("DevCluster")?.api).toBe(APIS.devClusters);
    // Never registered: the store that the host returns for each API stays its own.
    expect(host.registerStore).not.toHaveBeenCalled();
    for (const [name, api] of Object.entries(APIS)) {
      expect(Renderer.K8sApi.apiManager.getStore(api), name).toBe(stores[name as keyof typeof stores]);
    }
  });

  it("loads the namespace of its Cluster alone, then subscribes each store, and ends the subscriptions when it closes", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const built = host.builtStores.length;

    serveOwn(objectsOfStates(["healthy"]));

    const { unmount } = view(own());

    await act(async () => undefined);

    const ownStores = builtSince(built);

    for (const store of ownStores) {
      expect(store.loadAll, store.api.kind).toHaveBeenCalledTimes(1);
      expect(store.loadAll.mock.calls[0][0].namespaces, store.api.kind).toEqual([NAMESPACE]);
      expect(store.subscribe, store.api.kind).toHaveBeenCalledTimes(1);
      expect(store.loadAll.mock.invocationCallOrder[0]).toBeLessThan(store.subscribe.mock.invocationCallOrder[0]);
      // The load and the subscription of a store run under one controller, of that store alone.
      expect(store.subscribe.mock.calls[0][0].abortController.signal, store.api.kind).toBe(
        store.loadAll.mock.calls[0][0].reqInit.signal,
      );
    }

    const controllers = ownStores.map((store) => store.subscribe.mock.calls[0][0].abortController as AbortController);

    expect(new Set(controllers).size).toBe(ownStores.length);
    expect(controllers.filter((controller) => controller.signal.aborted)).toEqual([]);
    unmount();
    expect(controllers.filter((controller) => !controller.signal.aborted)).toEqual([]);
  });

  it("subscribes a store only once its load has ended", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const built = host.builtStores.length;

    serveOwn(objectsOfStates(["healthy"]));

    // The answers to the loads wait, as those of the cluster do.
    const release = host.deferLoads();

    view(own());
    await act(async () => undefined);

    const waiting = builtSince(built);

    expect(waiting.map((store) => store.api.kind)).toContain("Cluster");
    for (const store of waiting) {
      expect(store.loadAll, store.api.kind).toHaveBeenCalledTimes(1);
      expect(store.subscribe, store.api.kind).not.toHaveBeenCalled();
    }

    release();
    await act(async () => undefined);
    await act(async () => undefined);

    for (const store of waiting) expect(store.subscribe, store.api.kind).toHaveBeenCalledTimes(1);
  });

  it("stops the stores built on the APIs that the host replaced as it starts those of the new ones", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const built = host.builtStores.length;

    serveOwn(objectsOfStates(["healthy"]));
    view(own());
    await act(async () => undefined);

    const old = builtSince(built).find((store) => store.api.kind === "Machine");
    const replaced = host.builtStores.length;

    // The host registers the API of the Machines again, as it does after its store of definitions failed.
    act(() => host.registerApi({ ...APIS.machines }));
    await act(async () => undefined);

    const started = builtSince(replaced);

    expect(started.map((store) => store.api.kind)).toEqual(["Machine"]);
    expect(started[0].api).not.toBe(old?.api);
    expect(started[0].loadAll).toHaveBeenCalledTimes(1);
    expect(started[0].subscribe).toHaveBeenCalledTimes(1);
    // The store of the old API stops: the controller of its read is aborted, and nothing reads it again.
    expect(old?.subscribe.mock.calls[0][0].abortController.signal.aborted).toBe(true);
    expect(old?.loadAll).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
  });

  it("is what the panel in the details of the host does when no page is mounted", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const objects = objectsOfStates(["healthy"]);
    const built = host.builtStores.length;

    serveOwn(objects);
    view(
      <ClusterPanel
        object={objects.find((object) => object.kind === "Cluster") as unknown as Cluster}
        extension={EXTENSION}
        openCluster={vi.fn()}
      />,
    );
    await act(async () => undefined);

    expect(builtSince(built).map((store) => store.api.kind)).toContain("Cluster");
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
  });

  it("shows its Cluster from its own store, not the object that the host hands the panel", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const objects = objectsOfStates(["healthy"]);
    // The Cluster as the cluster holds it now, paused by its annotation, which the host's object, read before, lacks.
    const [fixture] = fixtureSet("healthy").filter((object) => object.kind === "Cluster");
    const current = structuredClone(fixture) as unknown as { metadata: { annotations?: Record<string, string> } };

    current.metadata.annotations = { ...current.metadata.annotations, "cluster.x-k8s.io/paused": "" };
    serveOwn([
      ...objects.filter((object) => object.kind !== "Cluster"),
      hostObject(current as unknown as Record<string, unknown>),
    ]);
    view(
      <ClusterPanel
        object={objects.find((object) => object.kind === "Cluster") as unknown as Cluster}
        extension={EXTENSION}
        openCluster={vi.fn()}
      />,
    );
    await act(async () => undefined);

    expect(screen.getByTestId("capi-details-pause").textContent).toBe(
      "Paused by the annotation cluster.x-k8s.io/paused, which reaches the Cluster alone",
    );
  });

  it("leaves one read running when the effect runs twice, as Freelens dev runs it", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const built = host.builtStores.length;

    serveOwn(objectsOfStates(["healthy"]));
    view(<React.StrictMode>{own()}</React.StrictMode>);
    await act(async () => undefined);

    for (const store of builtSince(built)) {
      const running = store.subscribe.mock.calls.filter(
        ([opts]) => !(opts.abortController as AbortController).signal.aborted,
      );
      const loads = store.loadAll.mock.calls.filter(([opts]) => !(opts.reqInit.signal as AbortSignal).aborted);

      expect(running, store.api.kind).toHaveLength(1);
      expect(loads, store.api.kind).toHaveLength(1);
    }
    // The stores of the view are built once, also when the effect runs twice.
    expect(builtSince(built).filter((store) => store.api.kind === "Cluster")).toHaveLength(1);
  });

  it("gives the state of the view alone when its read fails", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const page = sourceOf([], { filter: ["default"], loaded: ["default"] });
    const reads = page.reads;
    const unpublish = publishPageSource(page);
    const refused = new Error("Failed to load /apis/cluster.x-k8s.io/v1beta2/clusters", {
      cause: { kind: "Status", code: 403, message: `clusters.cluster.x-k8s.io is forbidden in "${NAMESPACE}"` },
    });

    serveOwn([], { Cluster: [refused] });

    try {
      view(own());
      await act(async () => undefined);

      expect(screen.getByTestId("capi-details-not-read").textContent).toMatch(
        new RegExp(`^The namespace ${NAMESPACE} cannot be read: you may not list its Clusters\\.`),
      );
      // The reads of the page are as they were.
      expect(page.reads).toBe(reads);
    } finally {
      unpublish();
    }
  });
});

describe("the reads of one Cluster, as a source of the view", () => {
  it("build the indexes of the context again only when what they read changes", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, CLUSTER_VIEW_KINDS);

    serveOwn(objectsOfStates(["healthy"]));

    const stop = read.start();

    await act(async () => undefined);

    const index = read.index();

    expect(read.index()).toBe(index);

    // A Machine of the namespace changes its version.
    const machines = read.stores.find((store) => store.api.kind === "Machine") as unknown as {
      items: { replace(items: unknown[]): void } & HostObject[];
    };

    act(() => {
      const [machine, ...others] = [...machines.items];

      machines.items.replace([
        hostObject({ ...machine, metadata: { ...machine.metadata, resourceVersion: "2" } } as Record<string, unknown>),
        ...others,
      ]);
    });
    expect(read.index()).not.toBe(index);
    stop();
  });

  it("give the model the objects of the namespace alone, and no object of the operator", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, CLUSTER_VIEW_KINDS);

    serveOwn(hostObjects([...fixtureSet("healthy"), ...fixtureSet("paused")] as KubeObject[]));

    const stop = read.start();

    await act(async () => undefined);

    const objects = read.objects();

    expect(new Set(objects.machines.items.map((machine) => machine.metadata.namespace))).toEqual(new Set([NAMESPACE]));
    expect(objects.operator).toBeUndefined();
    expect([...(objects.infrastructures ?? new Map()).keys()]).toEqual(["infrastructure.cluster.x-k8s.io/DevCluster"]);
    stop();
  });
});

// The cases of SPEC-0005, "Tests", "Unit", `cluster-namespace-read.test.tsx` (P6, P23): the read of one Cluster takes
// the kinds of its view as a parameter. The details and the panel read the kinds that SPEC-0004 gives them; the tree
// reads its own, the kinds of a provider that a reference of what it read names, and its ClusterClass in the namespace
// that the class reference of its Cluster names; a refresh reads every store again.

// The host of a cluster that serves the kinds of the tree too, with the definitions of the kinds of the development
// provider that the fixtures name.
function serveTree(objects: readonly HostObject[], failures: Partial<Record<string, unknown[]>> = {}) {
  const stores = serve(undefined, [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS]);

  for (const api of Object.values(TREE_APIS)) host.registerApi(api);
  serveOwn(objects, failures);
  return stores;
}

// The stores of a read by the kind of their API.
function byKind(read: ClusterNamespaceRead): Map<string, OwnStore> {
  return new Map(read.stores.map((store) => [store.api.kind, store as unknown as OwnStore]));
}

// Lets the loads, their ends and the subscriptions that follow them run.
async function settle() {
  for (let turn = 0; turn < 4; turn++) await act(async () => undefined);
}

const TREE_KINDS = [
  "Cluster",
  "Machine",
  "MachineSet",
  "MachineDeployment",
  "MachinePool",
  "KubeadmControlPlane",
  "MachineHealthCheck",
  "ClusterClass",
  "KubeadmConfig",
  "KubeadmConfigTemplate",
  "ClusterResourceSet",
  "ClusterResourceSetBinding",
  "IPAddressClaim",
  "IPAddress",
];

describe("the kinds of a view of one Cluster (SPEC-0005, P6)", () => {
  it("are those of SPEC-0004 for the details and the panel, also with the kinds of the tree served", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const built = host.builtStores.length;

    view(own());
    view(
      <ClusterPanel
        object={objectsOfStates(["healthy"]).find((object) => object.kind === "Cluster") as unknown as Cluster}
        extension={EXTENSION}
        openCluster={vi.fn()}
      />,
    );
    await settle();

    const kinds = builtSince(built).map((store) => store.api.kind);
    const expected = [
      "Cluster",
      "ClusterClass",
      "DevCluster",
      "KubeadmControlPlane",
      "Machine",
      "MachineDeployment",
      "MachineHealthCheck",
      "MachinePool",
      "MachineSet",
    ];

    // Two views, each with its own read of the same kinds.
    expect(kinds.sort()).toEqual([...expected, ...expected].sort());
  });

  it("read the ClusterClasses in the namespace of the Cluster alone for the details and the panel, when its class reference names another", async () => {
    const CLASSES = "freelens-capi-classes";
    const objects = structuredClone(fixtureSet("healthy")) as KubeObject[];
    const cluster = objects.find((object) => object.kind === "Cluster") as unknown as {
      spec: { topology: { classRef: { namespace?: string } } };
    };
    const clusterClass = objects.find((object) => object.kind === "ClusterClass") as KubeObject;

    cluster.spec.topology.classRef.namespace = CLASSES;
    serveTree(
      hostObjects([...objects, { ...clusterClass, metadata: { ...clusterClass.metadata, namespace: CLASSES } }]),
    );

    const built = host.builtStores.length;

    view(own());
    view(
      <ClusterPanel
        object={hostObjects(objects).find((object) => object.kind === "Cluster") as unknown as Cluster}
        extension={EXTENSION}
        openCluster={vi.fn()}
      />,
    );
    await settle();

    const loads = (builtSince(built) as OwnStore[]).map(
      (store) => `${store.api.kind} ${store.loadAll.mock.calls.map(([opts]) => opts.namespaces.join(",")).join(" ")}`,
    );

    // Two views, each with its ClusterClasses in the namespace of the Cluster, and no store of the namespace of the class.
    expect(loads.filter((line) => line.startsWith("ClusterClass "))).toEqual([
      `ClusterClass ${NAMESPACE}`,
      `ClusterClass ${NAMESPACE}`,
    ]);
    expect(loads.filter((line) => line.includes(CLASSES))).toEqual([]);
  });

  it("build no store of ClusterClasses for a Cluster with no topology, and no other store than the kinds and the references give", async () => {
    const STATE = "freelens-capi-without-topology";

    serveTree(objectsOfStates(["without-topology"]));

    const read = new ClusterNamespaceRead(STATE, STATE, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect([...byKind(read).keys()].sort()).toEqual(
      [
        ...TREE_KINDS.filter((kind) => kind !== "ClusterClass"),
        "DevCluster",
        "DevMachine",
        "DevMachineTemplate",
      ].sort(),
    );
    expect(read.reads.filter?.namespaces).toEqual([STATE]);
    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("are those of the tree for the tree: a store of the class of each model, and one ProviderObjectStore for each kind of a provider that a reference names, never registered", async () => {
    const stores = serveTree(objectsOfStates(["healthy"]));
    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    const kinds = byKind(read);

    expect([...kinds.keys()].sort()).toEqual([...TREE_KINDS, "DevCluster", "DevMachine", "DevMachineTemplate"].sort());
    expect(kinds.get("Cluster")).toBeInstanceOf(ClusterStore);
    expect(kinds.get("KubeadmConfig")).toBeInstanceOf(KubeadmConfigStore);
    expect(kinds.get("KubeadmConfigTemplate")).toBeInstanceOf(KubeadmConfigTemplateStore);
    expect(kinds.get("ClusterResourceSet")).toBeInstanceOf(ClusterResourceSetStore);
    expect(kinds.get("ClusterResourceSetBinding")).toBeInstanceOf(ClusterResourceSetBindingStore);
    expect(kinds.get("IPAddressClaim")).toBeInstanceOf(IPAddressClaimStore);
    expect(kinds.get("IPAddress")).toBeInstanceOf(IPAddressStore);
    for (const kind of ["DevCluster", "DevMachine", "DevMachineTemplate"]) {
      expect(kinds.get(kind), kind).toBeInstanceOf(ProviderObjectStore);
    }
    expect(kinds.get("DevMachine")?.api).toBe(TREE_APIS.devMachines);
    // Each loaded on the namespace of the Cluster, then subscribed.
    for (const [kind, store] of kinds) {
      expect(
        store.loadAll.mock.calls.map(([opts]) => opts.namespaces),
        kind,
      ).toEqual([[NAMESPACE]]);
      expect(store.subscribe, kind).toHaveBeenCalledTimes(1);
      expect(store.loadAll.mock.invocationCallOrder[0]).toBeLessThan(store.subscribe.mock.invocationCallOrder[0]);
    }
    // Never registered: the store that the host returns for each API stays its own.
    expect(host.registerStore).not.toHaveBeenCalled();
    for (const [name, api] of Object.entries(APIS)) {
      expect(Renderer.K8sApi.apiManager.getStore(api), name).toBe(stores[name as keyof typeof stores]);
    }
    // The model takes the kinds of the tree, the KubeadmControlPlanes of the namespace among them, and the kinds of a
    // provider that only the tree reads.
    expect(read.objects().tree?.kubeadmControlPlanes.items).toHaveLength(1);
    expect(read.objects().tree?.kubeadmConfigs.items).toHaveLength(3);
    expect([...(read.objects().tree?.providers.keys() ?? [])].sort()).toEqual([
      "infrastructure.cluster.x-k8s.io/DevMachine",
      "infrastructure.cluster.x-k8s.io/DevMachineTemplate",
    ]);
    stop();
  });

  it("read a kind of a provider once an object that the tree read names it, and wait for its first load", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const release = host.deferLoads();
    const stop = read.start();

    await settle();

    // Nothing is read yet that names a kind of a provider.
    expect([...byKind(read).keys()].sort()).toEqual([...TREE_KINDS].filter((kind) => kind !== "ClusterClass").sort());
    expect(read.firstLoadsEnded()).toBe(false);

    release();
    await settle();

    expect(byKind(read).has("DevMachine")).toBe(true);
    expect(byKind(read).has("ClusterClass")).toBe(true);
    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("read the ClusterClass in the namespace that the reference of the Cluster names, and no other, and follow a change of that namespace", async () => {
    const CLASSES = "freelens-capi-classes";
    const OTHER = "freelens-capi-other-classes";
    const objects = fixtureSet("healthy").map((object) => structuredClone(object)) as KubeObject[];
    const cluster = objects.find((object) => object.kind === "Cluster") as unknown as {
      spec: { topology: { classRef: { name: string; namespace?: string } } };
    };
    const clusterClass = objects.find((object) => object.kind === "ClusterClass") as KubeObject;

    cluster.spec.topology.classRef.namespace = CLASSES;
    serveTree(
      hostObjects([
        ...objects.filter((object) => object.kind !== "ClusterClass"),
        { ...clusterClass, metadata: { ...clusterClass.metadata, namespace: CLASSES } },
        { ...clusterClass, metadata: { ...clusterClass.metadata, namespace: OTHER } },
      ] as KubeObject[]),
    );

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    const classes = byKind(read).get("ClusterClass") as OwnStore;

    expect(classes.loadAll.mock.calls.map(([opts]) => opts.namespaces)).toEqual([[CLASSES]]);
    for (const [kind, store] of byKind(read)) {
      if (kind !== "ClusterClass") expect(store.loadAll.mock.calls[0][0].namespaces, kind).toEqual([NAMESPACE]);
    }
    expect(read.reads.filter?.namespaces).toEqual([NAMESPACE, CLASSES]);
    expect(read.objects().clusterClasses.items.map((item) => item.metadata.namespace)).toEqual([CLASSES]);

    // The Cluster names another namespace: the store of that one stops, and a new one reads the namespace now named.
    const clusters = byKind(read).get("Cluster") as unknown as {
      items: { replace(items: unknown[]): void } & HostObject[];
    };

    act(() => {
      const [current] = [...clusters.items];
      const moved = structuredClone({ ...current }) as unknown as Record<string, unknown> & {
        spec: { topology: { classRef: { namespace?: string } } };
      };

      moved.spec.topology.classRef.namespace = OTHER;
      clusters.items.replace([hostObject({ ...moved, metadata: { ...current.metadata, resourceVersion: "2" } })]);
    });
    await settle();

    const moved = byKind(read).get("ClusterClass") as OwnStore;

    expect(moved).not.toBe(classes);
    expect(read.stores).not.toContain(classes);
    expect(classes.subscribe.mock.calls[0][0].abortController.signal.aborted).toBe(true);
    expect(moved.loadAll.mock.calls.map(([opts]) => opts.namespaces)).toEqual([[OTHER]]);
    expect(read.reads.filter?.namespaces).toEqual([NAMESPACE, OTHER]);
    expect(read.objects().clusterClasses.items.map((item) => item.metadata.namespace)).toEqual([OTHER]);
    stop();
  });

  it("give the state of the tree alone when a kind is refused, its notice saying what its nodes read", async () => {
    const page = sourceOf([], { filter: ["default"], loaded: ["default"] });
    const reads = page.reads;
    const unpublish = publishPageSource(page);
    const refused = new Error("Failed to load /apis/bootstrap.cluster.x-k8s.io/v1beta2/kubeadmconfigs", {
      cause: {
        kind: "Status",
        code: 403,
        message: `kubeadmconfigs.bootstrap.cluster.x-k8s.io is forbidden in "${NAMESPACE}"`,
      },
    });

    serveTree(objectsOfStates(["healthy"]), { KubeadmConfig: [refused] });

    try {
      const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
      const stop = read.start();

      await settle();

      const configs = read.kinds().find((kind) => kind.kind === "KubeadmConfig");

      expect(configs).toMatchObject({ noun: "KubeadmConfigs", feeds: "nodes" });
      expect(read.reads.kinds[configs?.key ?? ""]?.loadHold?.failures).toEqual([
        { refused: true, message: `kubeadmconfigs.bootstrap.cluster.x-k8s.io is forbidden in "${NAMESPACE}"` },
      ]);
      expect(page.reads).toBe(reads);
      stop();
    } finally {
      unpublish();
    }
  });

  it("leave one read of the tree running when the effect runs twice, and end every read when the view closes", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);

    read.start()();

    const stop = read.start();

    await settle();

    for (const [kind, store] of byKind(read)) {
      const loads = store.loadAll.mock.calls.filter(([opts]) => !(opts.reqInit.signal as AbortSignal).aborted);
      const subscriptions = store.subscribe.mock.calls.filter(
        ([opts]) => !(opts.abortController as AbortController).signal.aborted,
      );

      expect(loads, kind).toHaveLength(1);
      expect(subscriptions, kind).toHaveLength(1);
    }
    stop();
    for (const [kind, store] of byKind(read)) {
      const open = store.subscribe.mock.calls.filter(
        ([opts]) => !(opts.abortController as AbortController).signal.aborted,
      );

      expect(open, kind).toEqual([]);
    }
  });
});

// The tree of the Cluster of a read, built from what the read gives, as the page builds it.
function treeOfRead(read: ClusterNamespaceRead): ClusterTree {
  const outcome = buildTree(indexTree(read.clusters(), read.objects()), read.namespace, read.name);

  if (outcome.state !== "found") throw new Error(`No tree of ${read.namespace}/${read.name}: ${outcome.state}`);
  return outcome.tree;
}

// What a node of the tree says of how it was read: an object, or a row made from a reference and why.
function readOfNode(node: TreeNode | undefined): string {
  if (node === undefined) return "no node";
  if (node.form !== "reference") return node.form;
  return node.read.state === "pending" ? "pending" : `${node.read.state}: ${node.read.reason}`;
}

describe("the references that the read of the tree follows, those by which the tree places what they name (SPEC-0005, P6, P7)", () => {
  const TEMPLATE = "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml";

  // healthy without its MachineDeployment and its MachineSet, so that the control plane alone names the
  // DevMachineTemplates, and with the change that the case makes to its Cluster.
  function controlPlaneAlone(change: (cluster: { spec: { controlPlaneRef?: unknown } }) => void = () => undefined) {
    const objects = structuredClone(fixtureSet("healthy")).filter(
      (object) => !["MachineDeployment", "MachineSet"].includes(object.kind),
    ) as KubeObject[];

    change(objects.find((object) => object.kind === "Cluster") as unknown as { spec: { controlPlaneRef?: unknown } });
    return hostObjects(objects);
  }

  it("follow the template of a control plane that the Cluster does not name, which the tree places under Other objects", async () => {
    serveTree(controlPlaneAlone((cluster) => delete cluster.spec.controlPlaneRef));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect(byKind(read).has("DevMachineTemplate")).toBe(true);
    expect(readOfNode(treeOfRead(read).nodes.get(TEMPLATE))).toBe("object");
    stop();
  });

  it("follow the template of the KubeadmControlPlane that the Cluster names at v1beta2, while its definition cannot be read", async () => {
    serveTree(controlPlaneAlone());
    runInAction(() => {
      host.crdStore.items = [];
      host.crdStore.failedLoading = true;
    });

    const definitions = new Map(
      [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS].map((definition) => [definition.metadata?.name, definition]),
    );

    host.crdGet.mockImplementation(async (name) => {
      if (name === "kubeadmcontrolplanes.controlplane.cluster.x-k8s.io") {
        throw new Error("Failed to get", { cause: { kind: "Status", code: 403, message: "forbidden" } });
      }
      return definitions.get(name) ?? null;
    });

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect(read.definitions.readOf("controlplane.cluster.x-k8s.io", "KubeadmControlPlane").state).toBe("refused");
    expect(byKind(read).has("DevMachineTemplate")).toBe(true);
    expect(readOfNode(treeOfRead(read).nodes.get(TEMPLATE))).toBe("object");
    stop();
  });

  it("follow what each object of the Cluster names by what followedReferencesOf says that it names, the function by which the tree places it (P8)", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const said = vi.spyOn(references, "followedReferencesOf");
    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    try {
      await settle();

      const asked = new Set(
        said.mock.calls.map(([object]) => `${String(object.kind)} ${String(object.metadata?.name)}`),
      );

      expect([...asked].sort()).toEqual(
        [
          "KubeadmControlPlane freelens-capi-healthy-d2lgq",
          "Machine freelens-capi-healthy-d2lgq-zqlcx",
          "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
          "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
          "MachineDeployment freelens-capi-healthy-md-0-m9x7h",
          "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
        ].sort(),
      );
    } finally {
      stop();
      said.mockRestore();
    }
  });

  it("follow the references of a MachinePool to its infrastructure machine pool", async () => {
    const STATE = "freelens-capi-machine-pools";

    serveTree(objectsOfStates(["machine-pools"]));

    const read = new ClusterNamespaceRead(STATE, STATE, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect(byKind(read).get("DevMachinePool")?.api).toBe(TREE_APIS.devMachinePools);
    expect(read.objects().tree?.providers.get("infrastructure.cluster.x-k8s.io/DevMachinePool")?.items).toHaveLength(1);
    stop();
  });

  it("follow no reference of an object of another Cluster of the namespace", async () => {
    const objects = structuredClone(fixtureSet("healthy")) as KubeObject[];
    const machine = structuredClone(objects.find((object) => object.kind === "Machine") as KubeObject) as KubeObject & {
      metadata: { name: string; labels: Record<string, string> };
      spec: { clusterName: string; infrastructureRef: { kind: string; name: string } };
    };

    machine.metadata.name = "another-cluster-machine";
    machine.metadata.labels = { "cluster.x-k8s.io/cluster-name": "another" };
    machine.spec.clusterName = "another";
    machine.spec.infrastructureRef.kind = "DevMachinePool";
    machine.spec.infrastructureRef.name = "another-pool";
    serveTree(hostObjects([...objects, machine]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect(read.objects().machines.items.map((item) => item.metadata.name)).toContain("another-cluster-machine");
    expect(byKind(read).has("DevMachinePool")).toBe(false);
    expect([...(read.objects().tree?.providers.keys() ?? [])]).not.toContain(
      "infrastructure.cluster.x-k8s.io/DevMachinePool",
    );
    stop();
  });

  it("follow the template of the control plane when no MachineDeployment or MachineSet names a template of its kind", async () => {
    const objects = structuredClone(fixtureSet("healthy")) as KubeObject[];

    for (const object of objects.filter((each) => ["MachineDeployment", "MachineSet"].includes(each.kind))) {
      (
        object as unknown as { spec: { template: { spec: { infrastructureRef: { kind: string } } } } }
      ).spec.template.spec.infrastructureRef.kind = "DevMachine";
    }
    serveTree(hostObjects(objects));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect(byKind(read).get("DevMachineTemplate")?.api).toBe(TREE_APIS.devMachineTemplates);
    expect(
      readOfNode(
        treeOfRead(read).nodes.get("infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml"),
      ),
    ).toBe("object");
    stop();
  });

  it.each(STATES)(
    "give the tree of %s every kind that it places an object by, none of its rows a kind that the read never tried",
    async (state) => {
      serveTree(objectsOfStates([state]));

      const read = new ClusterNamespaceRead(TREE_CLUSTERS[state], TREE_CLUSTERS[state], TREE_VIEW_KINDS);
      const stop = read.start();

      await settle();

      const rows = [...treeOfRead(read).nodes.values()]
        .filter((node) => node.form === "reference")
        .map((node) => `${node.id} ${readOfNode(node)}`);

      expect(read.firstLoadsEnded()).toBe(true);
      expect(rows.filter((row) => !row.endsWith("not-found: not-found"))).toEqual([]);
      stop();
    },
  );
});

describe("the refresh of the tree (SPEC-0005, P23)", () => {
  it("ends every read and starts it again on the same stores, which keep their objects meanwhile, each load a refresh", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    const before = byKind(read);
    const first = new Map([...before].map(([kind, store]) => [kind, store.subscribe.mock.calls[0][0].abortController]));
    const release = host.deferLoads();

    act(() => read.refresh());
    await settle();

    // While the loads of the refresh run, the stores keep their objects, and each load is a refresh.
    expect(byKind(read)).toEqual(before);
    expect((read.objects().tree?.kubeadmConfigs.items ?? []).length).toBe(3);
    for (const kind of read.kinds()) {
      expect(
        read.reads.kinds[kind.key]?.running.map((load) => load.refresh),
        kind.kind,
      ).toEqual([true]);
    }

    release();
    await settle();

    for (const [kind, store] of byKind(read)) {
      expect(store.loadAll, kind).toHaveBeenCalledTimes(2);
      expect(store.subscribe, kind).toHaveBeenCalledTimes(2);
      expect((first.get(kind) as AbortController).signal.aborted, kind).toBe(true);
      expect(store.subscribe.mock.calls[1][0].abortController.signal.aborted, kind).toBe(false);
    }
    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("that fails empties its kind in the namespace of the Cluster, as the store of the host does, and holds it back", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();
    expect(read.objects().tree?.kubeadmConfigs.items).toHaveLength(3);

    host.cluster.get(TREE_APIS.kubeadmConfigs.apiBase)?.failures.push({
      namespace: NAMESPACE,
      error: new Error("Failed to load", {
        cause: {
          kind: "Status",
          code: 403,
          message: `kubeadmconfigs.bootstrap.cluster.x-k8s.io is forbidden in "${NAMESPACE}"`,
        },
      }),
    });
    act(() => read.refresh());
    await settle();

    const key = read.kinds().find((kind) => kind.kind === "KubeadmConfig")?.key ?? "";

    expect(read.reads.kinds[key]?.refreshHold?.failures).toHaveLength(1);
    expect((byKind(read).get("KubeadmConfig") as unknown as { items: unknown[] }).items).toEqual([]);
    expect(
      readOfNode(
        treeOfRead(read).nodes.get("bootstrap.cluster.x-k8s.io/KubeadmConfig/freelens-capi-healthy-d2lgq-zqlcx"),
      ),
    ).toBe("not-read: kind-not-read");
    stop();
  });

  it("asks again for a definition whose read was refused, and for no other", async () => {
    serveTree(objectsOfStates(["healthy"]));
    runInAction(() => {
      host.crdStore.items = [];
      host.crdStore.failedLoading = true;
    });

    const refusal = new Error("Failed to get", {
      cause: {
        kind: "Status",
        code: 403,
        message: 'customresourcedefinitions.apiextensions.k8s.io "devmachines" is forbidden',
      },
    });
    const definitions = new Map(
      [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS].map((definition) => [definition.metadata?.name, definition]),
    );

    host.crdGet.mockImplementation(async (name) => {
      if (name === "devmachines.infrastructure.cluster.x-k8s.io") throw refusal;
      return definitions.get(name) ?? null;
    });

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    const asked = host.crdGet.mock.calls.map(([name]) => name);

    expect(asked.sort()).toEqual(
      [
        "devclusters.infrastructure.cluster.x-k8s.io",
        "devmachines.infrastructure.cluster.x-k8s.io",
        "devmachinetemplates.infrastructure.cluster.x-k8s.io",
        "kubeadmcontrolplanes.controlplane.cluster.x-k8s.io",
      ].sort(),
    );
    expect(read.definitions.readOf("infrastructure.cluster.x-k8s.io", "DevMachine").state).toBe("refused");
    host.crdGet.mockClear();

    act(() => read.refresh());
    await settle();

    expect(host.crdGet.mock.calls).toEqual([["devmachines.infrastructure.cluster.x-k8s.io"]]);
    stop();
  });
});

describe("the first loads of the read of the tree (SPEC-0005, P13)", () => {
  it("have not ended before the read starts, asked as a first render asks before its effect runs, nor while they run after it", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);

    expect(read.firstLoadsEnded()).toBe(false);

    const release = host.deferLoads();
    const stop = read.start();

    await settle();

    // The stores are built, and their first loads run.
    expect(byKind(read).has("Cluster")).toBe(true);
    expect(read.firstLoadsEnded()).toBe(false);

    release();
    await settle();

    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("have not ended while the host has registered no API, as while it checks, nor while they run once the APIs arrive", async () => {
    // The objects of the cluster, and no API registered: the view has no store yet (P19).
    serveOwn(objectsOfStates(["healthy"]));

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    expect(read.stores).toEqual([]);
    expect(read.firstLoadsEnded()).toBe(false);

    // The host registers the APIs, and the stores that they give start their first loads.
    const release = host.deferLoads();

    act(() => {
      serveTree(objectsOfStates(["healthy"]));
    });
    await settle();

    expect(byKind(read).has("Cluster")).toBe(true);
    expect(read.firstLoadsEnded()).toBe(false);

    release();
    await settle();

    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("have not ended while a definition that a reference names is still read, with the store of definitions failed, its stores loaded", async () => {
    serveTree(objectsOfStates(["healthy"]));
    runInAction(() => {
      host.crdStore.items = [];
      host.crdStore.failedLoading = true;
    });

    const definitions = new Map(
      [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS].map((definition) => [definition.metadata?.name, definition]),
    );
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });

    host.crdGet.mockImplementation(async (name) => {
      await answered;
      return definitions.get(name) ?? null;
    });

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();

    // Every store of the read has ended its first load; the definitions of the DevClusters and the DevMachines are not
    // read yet.
    expect(read.stores.every((store) => read.reads.kinds[storeKey(store)]?.last !== undefined)).toBe(true);
    expect(read.definitions.readOf("infrastructure.cluster.x-k8s.io", "DevCluster").state).toBe("pending");
    expect(read.firstLoadsEnded()).toBe(false);

    answer();
    await settle();

    expect(byKind(read).has("DevMachine")).toBe(true);
    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("stay ended once they have ended, through a refresh that asks again for a definition that was refused", async () => {
    serveTree(objectsOfStates(["healthy"]));
    runInAction(() => {
      host.crdStore.items = [];
      host.crdStore.failedLoading = true;
    });

    const definitions = new Map(
      [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS].map((definition) => [definition.metadata?.name, definition]),
    );
    let answer: "refuse" | "wait" = "refuse";

    host.crdGet.mockImplementation(async (name) => {
      if (name !== "devmachines.infrastructure.cluster.x-k8s.io") return definitions.get(name) ?? null;
      if (answer === "wait") return new Promise(() => undefined);
      throw new Error("Failed to get", { cause: { kind: "Status", code: 403, message: "forbidden" } });
    });

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();
    expect(read.firstLoadsEnded()).toBe(true);

    answer = "wait";
    act(() => read.refresh());
    await settle();

    // The definition is asked again and has not answered: no first load of the tree.
    expect(read.definitions.readOf("infrastructure.cluster.x-k8s.io", "DevMachine").state).toBe("pending");
    expect(read.firstLoadsEnded()).toBe(true);
    stop();
  });

  it("stay ended once they have ended, through a change of the namespace that the class reference names, while the new store loads", async () => {
    const objects = structuredClone(fixtureSet("healthy")) as KubeObject[];
    const clusterClass = objects.find((object) => object.kind === "ClusterClass") as KubeObject;

    serveTree(
      hostObjects([
        ...objects,
        { ...clusterClass, metadata: { ...clusterClass.metadata, namespace: "freelens-capi-classes" } },
      ] as KubeObject[]),
    );

    const read = new ClusterNamespaceRead(NAMESPACE, NAME, TREE_VIEW_KINDS);
    const stop = read.start();

    await settle();
    expect(read.firstLoadsEnded()).toBe(true);

    const release = host.deferLoads();
    const clusters = byKind(read).get("Cluster") as unknown as {
      items: { replace(items: unknown[]): void } & HostObject[];
    };

    act(() => {
      const [current] = [...clusters.items];
      const moved = structuredClone({ ...current }) as unknown as Record<string, unknown> & {
        spec: { topology: { classRef: { namespace?: string } } };
      };

      moved.spec.topology.classRef.namespace = "freelens-capi-classes";
      runInAction(() =>
        clusters.items.replace([hostObject({ ...moved, metadata: { ...current.metadata, resourceVersion: "2" } })]),
      );
    });
    await settle();

    // The store of the new namespace loads: no first load of the tree.
    expect(read.reads.filter?.namespaces).toEqual([NAMESPACE, "freelens-capi-classes"]);
    expect(read.firstLoadsEnded()).toBe(true);
    release();
    await settle();
    stop();
  });
});
