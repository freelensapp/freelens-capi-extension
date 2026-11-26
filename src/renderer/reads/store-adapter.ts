/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The adapter of a store of the host for the list layout of the host (SPEC-0004, P19). The layout subscribes the
// store of a page and its dependent stores through the host, which loads the namespaces of the filter and then
// watches them, again when the filter changes; each store reaches it through one adapter of the page, as the Velero
// extension hands the layout a store of its own.
//
// The adapter has the members that the layout and the host use, and no other
// (freelens:packages/core/src/renderer/components/item-object-list/list-layout.tsx:56-76;
// freelens:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:41-45;
// freelens:packages/core/src/renderer/kube-watch-api/kube-watch-api.ts:94-103):
//
// - It passes to the store, unchanged, those that read: `api`, `isLoaded`, `failedLoading`, `contextItems`,
//   `getByPath`, and `loadAll` and `subscribe` with the options of the host.
// - It answers itself those that select and remove: no row is selected, and nothing is removed or sent. The store of
//   the host keeps a selection, which its own list of Clusters sets and nothing clears between pages, and the layout
//   shows the remove button of the host whenever the store has a selection among the rows, whatever `isSelectable`
//   says (content.tsx:408-455, 555, 583-595): passed through, it would put the deletion of workload clusters one click
//   and a confirmation away from a page that shows no checkbox (SPEC-0001, A7).
// - `getTotalCount` counts the rows that the page gives the layout, so that the header counts what the list shows.
// - It tells the page what the layout keeps to itself: the start and the end of each load, with the namespaces that
//   the host names in its call, and each failure that `onLoadFailure` reports, of a load and of the reload after a
//   410, which it hands on to the layout as well. A load that the host aborts reports no failure, and the adapter
//   tells no outcome of it. While the store is subscribed, it tells the page each run of `isLoading` of the store,
//   which a reload that the store starts on its own sets, and which tells no one when it succeeds (P25).

import { reaction } from "mobx";

import type { Renderer } from "@freelensapp/extensions";

type HostObject = Renderer.K8sApi.KubeObject;

// The members of a store of the host that the adapter reads.
export interface HostStore<K extends HostObject> {
  readonly api: {
    readonly isNamespaced: boolean;
    readonly apiBase: string;
    readonly kind: string;
    readonly apiVersionWithGroup?: string;
  };
  readonly isLoaded: boolean;
  readonly isLoading: boolean;
  readonly failedLoading: boolean;
  readonly contextItems: K[];
  getByPath(path: string): K | undefined;
  loadAll(opts?: Renderer.K8sApi.KubeObjectStoreLoadAllParams): Promise<unknown>;
  subscribe(opts?: Renderer.K8sApi.KubeObjectStoreSubscribeParams): () => void;
}

// The store whose reads an adapter tells, by its API.
export interface ReadStore {
  readonly api: HostStore<HostObject>["api"];
}

// A load of a store, as the page knows it from its start to its end: its identifier, its namespaces, and what the page
// read of the context of the frame as it started.
export interface Load {
  readonly id: number;
  readonly namespaces: readonly string[];
  readonly overWholeCluster: boolean;
}

// What the adapter tells the page of the reads of its store.
export interface ReadsListener {
  // A load starts, for these namespaces; the page answers with the load, which the adapter hands back with its end.
  loadStarted(store: ReadStore, namespaces: readonly string[]): Load;
  loadFailed(store: ReadStore, load: Load, error: unknown): void;
  loadEnded(store: ReadStore, load: Load): void;
  // The host aborted the load: no outcome.
  loadAborted(store: ReadStore, load: Load): void;
  // The reload of a watch after a 410 failed (P25).
  refreshFailed(store: ReadStore, error: unknown): void;
  // A run of `isLoading` of the store, while it is subscribed.
  reloadStarted(store: ReadStore): void;
  reloadEnded(store: ReadStore): void;
}

export class StoreAdapter<K extends HostObject = HostObject> {
  readonly #store: HostStore<K>;
  readonly #listener: ReadsListener;
  readonly #countRows: () => number;

  // Answered here: no row is ever selected, and nothing is removed.
  readonly selectedItems: K[] = [];

  constructor(store: HostStore<K>, listener: ReadsListener, countRows: () => number) {
    this.#store = store;
    this.#listener = listener;
    this.#countRows = countRows;
  }

  get api(): HostStore<K>["api"] {
    return this.#store.api;
  }

  get isLoaded(): boolean {
    return this.#store.isLoaded;
  }

  get failedLoading(): boolean {
    return this.#store.failedLoading;
  }

  get contextItems(): K[] {
    return this.#store.contextItems;
  }

  readonly getByPath = (path: string): K | undefined => this.#store.getByPath(path);

  readonly getTotalCount = (): number => this.#countRows();

  readonly isSelected = (_item: K): boolean => false;

  readonly isSelectedAll = (_items: K[]): boolean => false;

  readonly pickOnlySelected = (_items: K[]): K[] => [];

  readonly toggleSelection = (_item: K): void => undefined;

  readonly toggleSelectionAll = (_items: K[]): void => undefined;

  readonly removeItems = async (_items: K[]): Promise<void> => undefined;

  readonly loadAll = async (opts: Renderer.K8sApi.KubeObjectStoreLoadAllParams = {}): Promise<unknown> => {
    const load = this.#listener.loadStarted(this, opts.namespaces ?? []);
    const handOn = opts.onLoadFailure;

    try {
      return await this.#store.loadAll({
        ...opts,
        onLoadFailure: (error: unknown) => {
          this.#listener.loadFailed(this, load, error);
          handOn?.(error);
        },
      });
    } finally {
      if (opts.reqInit?.signal?.aborted) this.#listener.loadAborted(this, load);
      else this.#listener.loadEnded(this, load);
    }
  };

  readonly subscribe = (opts: Renderer.K8sApi.KubeObjectStoreSubscribeParams = {}): (() => void) => {
    const handOn = opts.onLoadFailure;
    const stopRuns = reaction(
      () => this.#store.isLoading,
      (loading) => (loading ? this.#listener.reloadStarted(this) : this.#listener.reloadEnded(this)),
    );
    const unsubscribe = this.#store.subscribe({
      ...opts,
      onLoadFailure: (error: unknown) => {
        this.#listener.refreshFailed(this, error);
        handOn?.(error);
      },
    });

    return () => {
      stopRuns();
      unsubscribe();
    };
  };
}
