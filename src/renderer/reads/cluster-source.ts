/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Where a view of one Cluster takes its Cluster and the context of its Cluster (SPEC-0004, P16, P31): from the stores
// of the page of the Clusters when the page reads the namespace of the Cluster and follows it, so that the details
// stay with the stores of the page, and otherwise from stores of the view's own, which read that namespace alone. The
// details of the extension are a child of the page; the panel in the details of the host is not, and finds the page
// that is mounted, when one is, through the one it publishes here while it is mounted.

import { observable, runInAction } from "mobx";
import { isNotFollowed } from "../../common/views/read-state";

import type { ClusterObject } from "../../common/status/index";
import type { ContextIndex, ContextObjects, KindObjects } from "../../common/views/context";
import type { KindDescriptor, ReadsState } from "../../common/views/read-state";
import type { DefinitionReads } from "./definitions";

// The reads that a view of one Cluster takes: the state of the reads of its stores, its Clusters, what the status
// model takes, the indexes of that context, built again only when what they read changes, and the kinds that it reads,
// for what it says of a read that failed.
export interface ClusterSource {
  readonly reads: ReadsState;
  readonly definitions: DefinitionReads;
  clusters(): KindObjects<ClusterObject>;
  objects(): ContextObjects;
  index(): ContextIndex;
  kinds(): readonly (KindDescriptor & { readonly key: string })[];
}

const mounted = observable.box<ClusterSource | undefined>(undefined, { deep: false });

// Publishes the reads of a mounted page, for an effect of the page, which withdraws them on its cleanup.
export function publishPageSource(source: ClusterSource): () => void {
  runInAction(() => mounted.set(source));
  return () =>
    runInAction(() => {
      if (mounted.get() === source) mounted.set(undefined);
    });
}

// The reads of the page that is mounted, when one is.
export function mountedPageSource(): ClusterSource | undefined {
  return mounted.get();
}

// Whether the reads of a page cover a namespace for a view of one Cluster: the page reads the namespaces that its
// filter selects (P19), and follows them, but after a read over the whole cluster that the host does not follow (P34);
// then the view reads with stores of its own, a watch of its namespace, so that a change of its Cluster reaches it
// whatever the host follows (P16).
export function readsNamespace(source: ClusterSource, namespace: string): boolean {
  const clusters = source.clusters().key;

  if (clusters !== undefined && isNotFollowed(source.reads, clusters)) return false;
  return source.reads.filter?.namespaces.includes(namespace) ?? false;
}
