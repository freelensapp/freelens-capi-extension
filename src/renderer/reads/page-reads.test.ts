import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { listNotices, namespaceRead } from "../../common/views/read-state";
import { PageReads, storeKey, storesKey } from "./page-reads";

import type { Renderer } from "@freelensapp/extensions";

import type { KindDescriptor } from "../../common/views/read-state";
import type { HostStore } from "./store-adapter";

// The reads of a page through the adapters of its stores, with the context of the frame (SPEC-0004, P25, P34): the
// cases of `read-state.test.ts` that concern when the page reads the context of the frame and the runs of `isLoading`
// of a store, which the pure state receives in its events.

type HostObject = Renderer.K8sApi.KubeObject;

const CLUSTERS: KindDescriptor & { apiBase: string } = {
  apiBase: "/apis/cluster.x-k8s.io/v1beta2/clusters",
  kind: "Cluster",
  noun: "Clusters",
  resource: "clusters",
  group: "cluster.x-k8s.io",
  feeds: "rows",
};

const MACHINES: KindDescriptor & { apiBase: string } = {
  apiBase: "/apis/cluster.x-k8s.io/v1beta2/machines",
  kind: "Machine",
  noun: "Machines",
  resource: "machines",
  group: "cluster.x-k8s.io",
  feeds: "machines",
};

// The context of the frame, which the test changes as the host would.
interface TestContext {
  contextNamespaces: string[];
  allNamespaces: string[];
  hasSelectedAll: boolean;
  loadingAll: boolean;
  globalWatch: boolean;
  isLoadingAll(namespaces: string[]): boolean;
  isGlobalWatchEnabled(): boolean;
}

function context(): TestContext {
  return observable({
    contextNamespaces: ["a", "b"],
    allNamespaces: ["a", "b"],
    hasSelectedAll: true,
    loadingAll: true,
    globalWatch: false,
    isLoadingAll(this: TestContext) {
      return this.loadingAll;
    },
    isGlobalWatchEnabled(this: TestContext) {
      return this.globalWatch;
    },
  });
}

// A store of the host whose load the test ends, and whose `isLoading` the test sets, as a reload sets it.
function hostStore(apiBase: string) {
  const state = observable({ isLoading: false });
  let finish: (() => void) | undefined;
  const store = {
    api: { isNamespaced: true, apiBase, kind: "Kind", apiVersionWithGroup: "cluster.x-k8s.io/v1beta2" },
    isLoaded: true,
    failedLoading: false,
    contextItems: [],
    get isLoading() {
      return state.isLoading;
    },
    getByPath: () => undefined,
    loadAll: vi.fn(
      (_opts?: Renderer.K8sApi.KubeObjectStoreLoadAllParams) =>
        new Promise<unknown>((resolve) => {
          finish = () => resolve([]);
        }),
    ),
    subscribe: vi.fn((_opts?: Renderer.K8sApi.KubeObjectStoreSubscribeParams) => () => undefined),
    finishLoad() {
      finish?.();
    },
    setLoading(loading: boolean) {
      runInAction(() => {
        state.isLoading = loading;
      });
    },
  };

  return store;
}

function adapterOf(reads: PageReads, store: ReturnType<typeof hostStore>) {
  return reads.adapterOf(store as unknown as HostStore<HostObject>);
}

// A kind as the notices name it, under the key of its store.
function keyed(descriptor: KindDescriptor, store: ReturnType<typeof hostStore>): KindDescriptor & { key: string } {
  return { ...descriptor, key: storeKey(store) };
}

// The Clusters, for the notices of a test that reads the stores of the context alone.
const NO_CLUSTERS = { ...CLUSTERS, key: "no clusters" };

describe("a list that the host reads once over the whole cluster (P34)", () => {
  it("is said when isLoadingAll is true as the load starts and the host follows no watch as it ends", async () => {
    const frame = context();
    const reads = new PageReads(
      frame,
      () => 0,
      () => 7000,
    );
    const store = hostStore(CLUSTERS.apiBase);
    const load = adapterOf(reads, store).loadAll({ namespaces: ["a", "b"], reqInit: {}, onLoadFailure: vi.fn() });

    // The namespaces of the cluster change while the load runs: the start decides.
    runInAction(() => {
      frame.loadingAll = false;
    });
    store.finishLoad();
    await load;

    expect(listNotices(reads.state, keyed(CLUSTERS, store), [], 2).overList).toMatchObject([
      { id: "list:not-followed", at: 7000 },
    ]);
  });

  it("is not said when isLoadingAll is false as the load starts, whatever it is as the load ends", async () => {
    const frame = context();
    const reads = new PageReads(
      frame,
      () => 0,
      () => 7000,
    );
    const store = hostStore(CLUSTERS.apiBase);

    runInAction(() => {
      frame.loadingAll = false;
    });

    const load = adapterOf(reads, store).loadAll({ namespaces: ["a"], reqInit: {}, onLoadFailure: vi.fn() });

    runInAction(() => {
      frame.loadingAll = true;
    });
    store.finishLoad();
    await load;

    expect(listNotices(reads.state, keyed(CLUSTERS, store), [], 2).overList).toEqual([]);
  });

  it("is not said when the host follows the list, as it does for a user who may watch every resource", async () => {
    const frame = context();
    const reads = new PageReads(frame, () => 0);
    const store = hostStore(CLUSTERS.apiBase);

    runInAction(() => {
      frame.globalWatch = true;
    });

    const load = adapterOf(reads, store).loadAll({ namespaces: ["a", "b"], reqInit: {}, onLoadFailure: vi.fn() });

    store.finishLoad();
    await load;

    expect(listNotices(reads.state, keyed(CLUSTERS, store), [], 2).overList).toEqual([]);
  });
});

describe("whether the host follows the list (P34)", () => {
  it("is read as the load ends, as the store reads it at the subscribe that follows, and not as the load starts", async () => {
    for (const [atStart, atEnd, said] of [
      [true, false, true],
      [false, true, false],
    ] as const) {
      const frame = context();
      const reads = new PageReads(
        frame,
        () => 0,
        () => 7000,
      );
      const store = hostStore(CLUSTERS.apiBase);

      runInAction(() => {
        frame.globalWatch = atStart;
      });

      const load = adapterOf(reads, store).loadAll({ namespaces: ["a", "b"], reqInit: {}, onLoadFailure: vi.fn() });

      runInAction(() => {
        frame.globalWatch = atEnd;
      });
      store.finishLoad();
      await load;

      expect(
        listNotices(reads.state, keyed(CLUSTERS, store), [], 2).overList.map((notice) => notice.id),
        `followed ${atStart} as the load started and ${atEnd} as it ended`,
      ).toEqual(said ? ["list:not-followed"] : []);
    }
  });
});

describe("the stores of the page (P19)", () => {
  async function loaded(reads: PageReads, store: ReturnType<typeof hostStore>) {
    const load = adapterOf(reads, store).loadAll({ namespaces: ["a", "b"], reqInit: {}, onLoadFailure: vi.fn() });

    store.finishLoad();
    await load;
  }

  it("are each keyed by the identity of the store: one that the host replaces under the same base loads anew", async () => {
    const reads = new PageReads(context(), () => 0);
    const replaced = hostStore(MACHINES.apiBase);
    const replacing = hostStore(MACHINES.apiBase);

    await loaded(reads, replaced);

    expect(storeKey(replaced)).toBe(storeKey(replaced));
    expect(storeKey(replacing)).not.toBe(storeKey(replaced));
    expect(adapterOf(reads, replacing)).not.toBe(adapterOf(reads, replaced));
    expect(namespaceRead(reads.state, storeKey(replaced), "a").state).toBe("read");
    expect(namespaceRead(reads.state, storeKey(replacing), "a").state).toBe("pending");
  });

  it("make one key of a set whatever their order, the key of the layout, which mounts again only when the set changes", () => {
    const clusters = hostStore(CLUSTERS.apiBase);
    const machines = hostStore(MACHINES.apiBase);
    const other = hostStore(MACHINES.apiBase);

    expect(storesKey([clusters, machines])).toBe(storesKey([machines, clusters]));
    expect(storesKey([clusters, other])).not.toBe(storesKey([clusters, machines]));
  });

  it("lose what they loaded when they leave the set of the page, and wait for their next load when they come back", async () => {
    const reads = new PageReads(context(), () => 0);
    const clusters = hostStore(CLUSTERS.apiBase);
    const machines = hostStore(MACHINES.apiBase);

    await loaded(reads, clusters);
    await loaded(reads, machines);
    reads.retain([storeKey(clusters)]);

    expect(namespaceRead(reads.state, storeKey(machines), "a").state).toBe("pending");
    expect(namespaceRead(reads.state, storeKey(clusters), "a").state).toBe("read");

    reads.retain([storeKey(clusters), storeKey(machines)]);

    expect(namespaceRead(reads.state, storeKey(machines), "a").state).toBe("pending");

    await loaded(reads, machines);

    expect(namespaceRead(reads.state, storeKey(machines), "a").state).toBe("read");
  });
});

describe("a reload that the store starts on its own (P25)", () => {
  async function refreshFailed() {
    const frame = context();
    const reads = new PageReads(
      frame,
      () => 1,
      () => 5000,
    );
    const store = hostStore(MACHINES.apiBase);
    const adapter = adapterOf(reads, store);
    const load = adapter.loadAll({ namespaces: ["a", "b"], reqInit: {}, onLoadFailure: vi.fn() });

    store.finishLoad();
    await load;
    adapter.subscribe({ abortController: new AbortController(), onLoadFailure: vi.fn() });

    const subscribed = store.subscribe.mock.calls[0][0];

    // The reload of the watch after a 410 fails.
    store.setLoading(true);
    subscribed?.onLoadFailure?.(new Error("Failed to load", { cause: new Error("socket hang up") }));
    store.setLoading(false);

    return { reads, store, subscribed };
  }

  it("that fails holds the kind back, with the notice of its refresh", async () => {
    const { reads, store } = await refreshFailed();

    expect(namespaceRead(reads.state, storeKey(store), "a").state).toBe("held");
    expect(listNotices(reads.state, NO_CLUSTERS, [keyed(MACHINES, store)], 1).overList[0]).toMatchObject({
      title: "The Machines could not be read again, at {time}",
      at: 5000,
    });
  });

  it("that ends with no failure, seen through isLoading while no load of the layout runs, releases the kind", async () => {
    const { reads, store } = await refreshFailed();

    store.setLoading(true);
    store.setLoading(false);

    expect(namespaceRead(reads.state, storeKey(store), "a").state).toBe("read");
    expect(listNotices(reads.state, NO_CLUSTERS, [keyed(MACHINES, store)], 1).overList).toEqual([]);
  });

  it("that fails again keeps the kind back and the notice", async () => {
    const { reads, store, subscribed } = await refreshFailed();

    store.setLoading(true);
    subscribed?.onLoadFailure?.(new Error("Failed to load", { cause: new Error("socket hang up") }));
    store.setLoading(false);

    expect(namespaceRead(reads.state, storeKey(store), "a").state).toBe("held");
  });
});

describe("the filter of the page", () => {
  it("is read from the context of the frame from the start, and followed once the page follows it", () => {
    const frame = context();
    const reads = new PageReads(frame, () => 0);

    expect(reads.state.filter).toEqual({ namespaces: ["a", "b"], selectedAll: true });

    const stop = reads.followFilter();

    runInAction(() => {
      frame.contextNamespaces = ["a"];
      frame.hasSelectedAll = false;
    });
    expect(reads.state.filter).toEqual({ namespaces: ["a"], selectedAll: false });
    stop();
  });

  it("gives one adapter for a store, however many times the page asks", () => {
    const reads = new PageReads(context(), () => 0);
    const store = hostStore(MACHINES.apiBase);

    expect(adapterOf(reads, store)).toBe(adapterOf(reads, store));
  });
});
