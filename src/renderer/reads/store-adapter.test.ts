import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { StoreAdapter } from "./store-adapter";

import type { Renderer } from "@freelensapp/extensions";

import type { HostStore, ReadsListener } from "./store-adapter";

// The cases of SPEC-0004, "Tests", "Unit", `store-adapter.test.ts` (P19), with a double of a store of the host. The
// subscription itself is the host's, which the stub of the SDK does not run; the session in Freelens checks it.

type HostObject = Renderer.K8sApi.KubeObject;

interface Item {
  getId(): string;
}

const ONE = { getId: () => "uid-one" } as unknown as HostObject;
const TWO = { getId: () => "uid-two" } as unknown as HostObject;

// A store of the host with a Cluster selected, as the list of the host of the Clusters leaves it.
function hostStore() {
  const selected = new Set(["uid-one"]);
  const state = observable({ isLoading: false });
  const store = {
    api: {
      isNamespaced: true,
      apiBase: "/apis/cluster.x-k8s.io/v1beta2/clusters",
      kind: "Cluster",
      apiVersionWithGroup: "cluster.x-k8s.io/v1beta2",
    },
    isLoaded: true,
    failedLoading: false,
    get isLoading() {
      return state.isLoading;
    },
    contextItems: [ONE, TWO],
    getByPath: vi.fn((path: string) => (path === "/one" ? ONE : undefined)),
    loadAll: vi.fn(async (_opts?: Renderer.K8sApi.KubeObjectStoreLoadAllParams) => [ONE, TWO]),
    subscribe: vi.fn((_opts?: Renderer.K8sApi.KubeObjectStoreSubscribeParams) => vi.fn()),
    // What the store of the host keeps of a selection, which the adapter never passes on.
    selected,
    isSelected: (item: Item) => selected.has(item.getId()),
    get selectedItems() {
      return [ONE, TWO].filter((item) => selected.has(item.getId()));
    },
    pickOnlySelected: (items: Item[]) => items.filter((item) => selected.has(item.getId())),
    toggleSelection: vi.fn((item: Item) =>
      selected.has(item.getId()) ? selected.delete(item.getId()) : selected.add(item.getId()),
    ),
    toggleSelectionAll: vi.fn(),
    removeItems: vi.fn(async () => undefined),
    removeSelectedItems: vi.fn(async () => undefined),
    setLoading(loading: boolean) {
      runInAction(() => {
        state.isLoading = loading;
      });
    },
  };

  return store;
}

function listener() {
  let loads = 0;

  return {
    loadStarted: vi.fn<ReadsListener["loadStarted"]>((_store, namespaces) => ({
      id: ++loads,
      namespaces,
      overWholeCluster: false,
    })),
    loadFailed: vi.fn<ReadsListener["loadFailed"]>(),
    loadEnded: vi.fn<ReadsListener["loadEnded"]>(),
    loadAborted: vi.fn<ReadsListener["loadAborted"]>(),
    refreshFailed: vi.fn<ReadsListener["refreshFailed"]>(),
    reloadStarted: vi.fn<ReadsListener["reloadStarted"]>(),
    reloadEnded: vi.fn<ReadsListener["reloadEnded"]>(),
  } satisfies ReadsListener;
}

// The remove button of the layout of the host, from the selection of its store among the rows, and the props of the
// page spread over its own (freelens:packages/core/src/renderer/components/item-object-list/content.tsx:555, 583-595).
function removeButtonShown(
  store: { removeItems?: unknown; removeSelectedItems?: unknown; pickOnlySelected(items: Item[]): Item[] },
  rows: Item[],
  addRemoveButtons: { onRemove?: () => void } = {},
): boolean {
  const selected = store.pickOnlySelected(rows);
  const props = {
    onRemove: (store.removeItems || store.removeSelectedItems) && selected.length > 0 ? () => undefined : undefined,
    ...addRemoveButtons,
  };

  return props.onRemove !== undefined;
}

function adapterOf(store = hostStore(), reads = listener(), rows = () => 2) {
  return { store, reads, adapter: new StoreAdapter(store as unknown as HostStore<HostObject>, reads, rows) };
}

describe("the adapter of a store of the host (P19)", () => {
  it("has the members that the layout and the host use, and no other", () => {
    const { adapter } = adapterOf();
    const members = [
      ...Object.keys(adapter),
      ...Object.getOwnPropertyNames(StoreAdapter.prototype).filter((name) => name !== "constructor"),
    ].sort();

    expect(members).toEqual(
      [
        "api",
        "contextItems",
        "failedLoading",
        "getByPath",
        "getTotalCount",
        "isLoaded",
        "isSelected",
        "isSelectedAll",
        "loadAll",
        "pickOnlySelected",
        "removeItems",
        "selectedItems",
        "subscribe",
        "toggleSelection",
        "toggleSelectionAll",
      ].sort(),
    );
  });

  it("passes to the store, unchanged, what reads it", () => {
    const { store, adapter } = adapterOf();

    expect(adapter.api).toBe(store.api);
    expect(adapter.isLoaded).toBe(true);
    expect(adapter.failedLoading).toBe(false);
    expect(adapter.contextItems).toBe(store.contextItems);
    expect(adapter.getByPath("/one")).toBe(ONE);
    expect(store.getByPath).toHaveBeenCalledWith("/one");
  });

  it("passes loadAll and subscribe to the store with the options of the host", async () => {
    const { store, adapter } = adapterOf();
    const controller = new AbortController();

    await adapter.loadAll({
      namespaces: ["a", "b"],
      merge: true,
      reqInit: { signal: controller.signal },
      onLoadFailure: vi.fn(),
    });
    adapter.subscribe({ abortController: controller, onLoadFailure: vi.fn() });

    expect(store.loadAll).toHaveBeenCalledWith(
      expect.objectContaining({ namespaces: ["a", "b"], merge: true, reqInit: { signal: controller.signal } }),
    );
    expect(store.subscribe).toHaveBeenCalledWith(expect.objectContaining({ abortController: controller }));
  });

  it("selects nothing and removes nothing, with a Cluster selected in the store, so that no remove button shows", async () => {
    const { store, adapter } = adapterOf();

    expect(removeButtonShown(store, [ONE, TWO])).toBe(true);
    expect(adapter.isSelected(ONE)).toBe(false);
    expect(adapter.isSelectedAll([ONE, TWO])).toBe(false);
    expect(adapter.selectedItems).toEqual([]);
    expect(adapter.pickOnlySelected([ONE, TWO])).toEqual([]);

    adapter.toggleSelection(TWO);
    adapter.toggleSelectionAll([ONE, TWO]);
    await adapter.removeItems([ONE]);

    expect([...store.selected]).toEqual(["uid-one"]);
    expect(store.toggleSelection).not.toHaveBeenCalled();
    expect(store.toggleSelectionAll).not.toHaveBeenCalled();
    expect(store.removeItems).not.toHaveBeenCalled();
    expect(store.removeSelectedItems).not.toHaveBeenCalled();
    expect(removeButtonShown(adapter, [ONE, TWO])).toBe(false);
  });

  it("counts the rows that the page gives the layout", () => {
    const { adapter } = adapterOf(hostStore(), listener(), () => 7);

    expect(adapter.getTotalCount()).toBe(7);
  });

  it("tells the page the start and the end of each load, its namespaces, and each failure, handed on to the layout", async () => {
    const store = hostStore();
    const reads = listener();
    const { adapter } = adapterOf(store, reads);
    const refused = new Error("Failed to load", { cause: { kind: "Status", code: 403 } });
    const layout = vi.fn();

    store.loadAll.mockImplementationOnce(async (opts) => {
      opts?.onLoadFailure?.(refused);
      return [];
    });
    await adapter.loadAll({
      namespaces: ["a", "b"],
      reqInit: { signal: new AbortController().signal },
      onLoadFailure: layout,
    });

    const load = reads.loadStarted.mock.results[0]?.value;

    expect(reads.loadStarted).toHaveBeenCalledWith(adapter, ["a", "b"]);
    expect(reads.loadFailed.mock.calls).toEqual([[adapter, load, refused]]);
    expect(reads.loadFailed.mock.calls[0][1]).toBe(load);
    expect(layout).toHaveBeenCalledWith(refused);
    expect(reads.loadEnded.mock.calls).toEqual([[adapter, load]]);
    expect(reads.loadEnded.mock.calls[0][1]).toBe(load);
    expect(reads.loadAborted).not.toHaveBeenCalled();
  });

  it("tells no outcome of a load that the host aborts", async () => {
    const { reads, adapter } = adapterOf();
    const controller = new AbortController();

    controller.abort();
    await adapter.loadAll({ namespaces: ["a"], reqInit: { signal: controller.signal }, onLoadFailure: vi.fn() });

    expect(reads.loadAborted.mock.calls).toEqual([[adapter, reads.loadStarted.mock.results[0]?.value]]);
    expect(reads.loadEnded).not.toHaveBeenCalled();
    expect(reads.loadFailed).not.toHaveBeenCalled();
  });

  it("tells the page the failure of the reload of a subscription after a 410, and hands it on to the layout", () => {
    const store = hostStore();
    const reads = listener();
    const { adapter } = adapterOf(store, reads);
    const layout = vi.fn();
    const failure = new Error("Failed to load", { cause: new Error("socket hang up") });

    adapter.subscribe({ abortController: new AbortController(), onLoadFailure: layout });
    store.subscribe.mock.calls[0][0]?.onLoadFailure?.(failure);

    expect(reads.refreshFailed).toHaveBeenCalledWith(adapter, failure);
    expect(layout).toHaveBeenCalledWith(failure);
  });

  it("tells the page each run of isLoading while the store is subscribed, and none after", () => {
    const store = hostStore();
    const reads = listener();
    const { adapter } = adapterOf(store, reads);
    const stop = adapter.subscribe({ abortController: new AbortController(), onLoadFailure: vi.fn() });

    store.setLoading(true);
    store.setLoading(false);
    stop();
    store.setLoading(true);

    expect(reads.reloadStarted).toHaveBeenCalledTimes(1);
    expect(reads.reloadEnded).toHaveBeenCalledTimes(1);
    expect(store.subscribe.mock.results[0].value).toHaveBeenCalledTimes(1);
  });
});
