/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The reads of one mount of a page (SPEC-0004, P19, P25, P34): the adapter of each store of the host that the list
// layout subscribes, one for each store however many kinds or references name it, and the state of the reads that
// they tell, as the pure functions of `read-state.ts` keep it. The page loads nothing and subscribes nothing itself:
// the layout does, through the host. The state lives as long as the mount of the page, also when a new set of stores
// mounts the layout again, so that the namespaces loaded stay loaded while the filter keeps them.
//
// The context of the frame tells, as a load starts, whether it reads its namespaces over the whole cluster, and, as
// it ends with no failure, whether the host follows it (P34). It is read as the store of the host reads it, when the
// load starts and when it ends, since the namespaces of the cluster can change in between.

import { compareStructural, observable, reaction, runInAction } from "mobx";
import { failureOf, NO_READS, reduceReads } from "../../common/views/read-state";
import { StoreAdapter } from "./store-adapter";

import type { Renderer } from "@freelensapp/extensions";

import type { ReadEvent, ReadsState } from "../../common/views/read-state";
import type { FrameContext } from "./frame-context";
import type { HostStore, Load, ReadStore, ReadsListener } from "./store-adapter";

type HostObject = Renderer.K8sApi.KubeObject;

// The key under which the state of the reads follows a store: the base of its API.
export function keyOf(store: { readonly api: { readonly apiBase: string } }): string {
  return store.api.apiBase;
}

export class PageReads implements ReadsListener {
  readonly #state: { get(): ReadsState; set(state: ReadsState): void };
  readonly #adapters = new Map<HostStore<HostObject>, StoreAdapter>();
  readonly #context: FrameContext;
  readonly #countRows: () => number;
  readonly #now: () => number;
  #nextLoad = 0;

  // The context of the frame is read from the start, before the layout, a child of the page, mounts and loads.
  constructor(context: FrameContext, countRows: () => number, now: () => number = Date.now) {
    this.#context = context;
    this.#countRows = countRows;
    this.#now = now;
    this.#state = observable.box<ReadsState>(
      reduceReads(NO_READS, {
        type: "filter-changed",
        namespaces: [...context.contextNamespaces],
        selectedAll: context.hasSelectedAll,
      }),
      { deep: false },
    );
  }

  get state(): ReadsState {
    return this.#state.get();
  }

  // The adapter of a store of the host, the same one for the whole mount of the page.
  adapterOf<K extends HostObject>(store: HostStore<K>): StoreAdapter<K> {
    let adapter = this.#adapters.get(store as HostStore<HostObject>);

    if (adapter === undefined) {
      adapter = new StoreAdapter(store as HostStore<HostObject>, this, this.#countRows);
      this.#adapters.set(store as HostStore<HostObject>, adapter);
    }
    return adapter as unknown as StoreAdapter<K>;
  }

  // Follows the namespaces that the filter selects, for an effect of the page, which ends it on its cleanup.
  followFilter(): () => void {
    const context = this.#context;

    return reaction(
      () => ({ namespaces: [...context.contextNamespaces], selectedAll: context.hasSelectedAll }),
      ({ namespaces, selectedAll }) => this.#dispatch({ type: "filter-changed", namespaces, selectedAll }),
      { fireImmediately: true, equals: compareStructural },
    );
  }

  #dispatch(event: ReadEvent): void {
    runInAction(() => this.#state.set(reduceReads(this.#state.get(), event)));
  }

  // The page reads `isLoadingAll` for the namespaces of a load as the load starts, as the store reads it then: the
  // namespaces of the cluster follow a store that the host watches, so the answer can change before the load ends.
  // The load carries the answer to its end.
  loadStarted(store: ReadStore, namespaces: readonly string[]): Load {
    const load: Load = {
      id: ++this.#nextLoad,
      namespaces,
      overWholeCluster: store.api.isNamespaced && this.#context.isLoadingAll([...namespaces]),
    };

    this.#dispatch({ type: "load-started", kind: keyOf(store), id: load.id, namespaces });
    return load;
  }

  loadFailed(store: ReadStore, load: Load, error: unknown): void {
    this.#dispatch({ type: "load-failed", kind: keyOf(store), id: load.id, failure: failureOf(error) });
  }

  // As the load ends, the page reads `isGlobalWatchEnabled()`, as the store reads it at the `subscribe` that follows.
  loadEnded(store: ReadStore, load: Load): void {
    this.#dispatch({
      type: "load-ended",
      kind: keyOf(store),
      id: load.id,
      overWholeCluster: load.overWholeCluster,
      followed: this.#context.isGlobalWatchEnabled(),
      at: this.#now(),
    });
  }

  loadAborted(store: ReadStore, load: Load): void {
    this.#dispatch({ type: "load-aborted", kind: keyOf(store), id: load.id });
  }

  refreshFailed(store: ReadStore, error: unknown): void {
    this.#dispatch({ type: "refresh-failed", kind: keyOf(store), failure: failureOf(error), at: this.#now() });
  }

  reloadStarted(store: ReadStore): void {
    this.#dispatch({ type: "reload-started", kind: keyOf(store) });
  }

  reloadEnded(store: ReadStore): void {
    this.#dispatch({ type: "reload-ended", kind: keyOf(store) });
  }
}
