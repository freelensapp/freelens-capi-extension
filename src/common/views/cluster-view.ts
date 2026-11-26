/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The state of a view of one Cluster (SPEC-0004, P25, P31, "The states that are not the happy one"): the details of
// the extension, or the panel in the details of the host, from the reads of the namespace of the Cluster, by the
// stores of the page when the page reads that namespace, or by stores of the view's own otherwise. The state is that
// of the view alone: a read of the view that fails leaves the list as it is.
//
// - Loading: the Clusters of the namespace are not read yet, and the view shows the spinner.
// - Found: the Cluster is in the store, in a namespace that was read.
// - Not found: the namespace was read, and no Cluster of that name is in it.
// - Not read: the read of the Clusters of the namespace was refused or failed, or a refresh of it failed, which the
//   view says with the message of each answer and, for a refusal, the permission it takes (SPEC-0001, R6.4).

import { nameOf, namespaceOf } from "./objects";
import { namespaceRead } from "./read-state";

import type { KubeObjectData } from "../status/index";
import type { KindObjects } from "./context";
import type { Hold, ReadsState } from "./read-state";

// The holds of a kind in a namespace (P25): after a load that failed there, and after a refresh that failed there, an
// event of the past with its time.
export interface Holds {
  readonly load: Hold | undefined;
  readonly refresh: Hold | undefined;
}

export function holdsOf(reads: ReadsState, key: string, namespace: string): Holds {
  const kind = reads.kinds[key];
  const covering = (hold: Hold | undefined) => (hold?.namespaces.includes(namespace) ? hold : undefined);

  return { load: covering(kind?.loadHold), refresh: covering(kind?.refreshHold) };
}

export type ClusterViewState<T extends KubeObjectData> =
  | { readonly state: "pending" }
  | { readonly state: "found"; readonly cluster: T }
  | { readonly state: "not-found" }
  // Every failure of the read of the namespace was a refusal, with the code 403.
  | ({ readonly state: "not-read"; readonly refused: boolean } & Holds);

export function clusterViewOf<T extends KubeObjectData>(
  reads: ReadsState,
  clusters: KindObjects<T>,
  namespace: string,
  name: string,
): ClusterViewState<T> {
  if (clusters.key === undefined) return { state: "pending" };

  const read = namespaceRead(reads, clusters.key, namespace);

  if (read.state === "held") {
    const holds = holdsOf(reads, clusters.key, namespace);
    const failures = [...(holds.load?.failures ?? []), ...(holds.refresh?.failures ?? [])];

    return {
      state: "not-read",
      refused: failures.length > 0 && failures.every((failure) => failure.refused),
      ...holds,
    };
  }
  if (read.state !== "read") return { state: "pending" };

  const cluster = clusters.items.find((item) => namespaceOf(item) === namespace && nameOf(item) === name);

  return cluster === undefined ? { state: "not-found" } : { state: "found", cluster };
}

// The permission that a read of the Clusters of a namespace takes (SPEC-0001, R6.4).
export const CLUSTERS_PERMISSION = "get, list and watch on clusters of cluster.x-k8s.io";
