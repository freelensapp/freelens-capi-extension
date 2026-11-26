// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE, fixtureSet } from "../../../test/fixture-sets";
import { Common, host, Renderer } from "../../../test/freelens-extensions";
import { APIS, DEFINITIONS, DEV_CLUSTERS, hostObject, serve } from "../../../test/host-stores";
import { hostObjects, objectsOfStates, sourceOf } from "../../../test/view-sources";
import { ClusterStore } from "../api/cluster/cluster-v1beta2";
import {
  ClusterClassStore,
  KubeadmControlPlaneStore,
  MachineDeploymentStore,
  MachineHealthCheckStore,
  MachinePoolStore,
  MachineSetStore,
  MachineStore,
} from "../api/context/context-models";
import { ClusterPanel, SourcedClusterView } from "../details/cluster-details-v1beta2";
import { ClusterNamespaceRead } from "./cluster-namespace-read";
import { publishPageSource } from "./cluster-source";
import { ProviderObjectStore } from "./provider-object-store";

import type { Renderer as Sdk } from "@freelensapp/extensions";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { HostObject } from "../../../test/host-stores";
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
// failures that a load of a kind reports.
function serveOwn(objects: readonly HostObject[], failures: Partial<Record<string, unknown[]>> = {}) {
  for (const api of Object.values(APIS)) {
    host.cluster.set(api.apiBase, {
      items: objects.filter((object) => object.kind === api.kind),
      failures: [...(failures[api.kind] ?? [])],
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
    }

    // One controller, which the effect created, for every subscription.
    const controllers = new Set(ownStores.map((store) => store.subscribe.mock.calls[0][0].abortController));

    expect(controllers.size).toBe(1);

    const [controller] = controllers as Set<AbortController>;

    expect(controller.signal.aborted).toBe(false);
    unmount();
    expect(controller.signal.aborted).toBe(true);
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
  it("give the model the objects of the namespace alone, and no object of the operator", async () => {
    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS]);

    const read = new ClusterNamespaceRead(NAMESPACE, NAME);

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
