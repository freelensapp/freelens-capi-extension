import { describe, expect, it } from "vitest";
import { CAPTURE } from "../../../test/fixture-sets";
import { clusterViewOf, holdsOf } from "./cluster-view";
import { NO_READS, reduceReads } from "./read-state";

import type { ReadEvent, ReadFailure, ReadsState } from "./read-state";

// The state of a view of one Cluster (SPEC-0004, P25, P31, "The states that are not the happy one"), from the reads of
// the namespace of its Cluster: loading, found, not found, and a namespace that could not be read, or read again.

const KEY = "/apis/cluster.x-k8s.io/v1beta2/clusters#1";
const NAMESPACE = "freelens-capi-healthy";

const cluster = {
  apiVersion: "cluster.x-k8s.io/v1beta2",
  kind: "Cluster",
  metadata: { name: "freelens-capi-healthy", namespace: NAMESPACE },
};
const elsewhere = { ...cluster, metadata: { name: "freelens-capi-healthy", namespace: "freelens-capi-paused" } };

const refused: ReadFailure = { refused: true, message: `clusters.cluster.x-k8s.io is forbidden in "${NAMESPACE}"` };
const failed: ReadFailure = { refused: false, message: "the connection was reset" };

function readsOf(...events: ReadEvent[]): ReadsState {
  return [{ type: "filter-changed", namespaces: [NAMESPACE], selectedAll: false } as ReadEvent, ...events].reduce(
    reduceReads,
    NO_READS,
  );
}

const started: ReadEvent = { type: "load-started", kind: KEY, id: 1, namespaces: [NAMESPACE] };
const ended: ReadEvent = { type: "load-ended", kind: KEY, id: 1, overWholeCluster: false, followed: true, at: CAPTURE };

describe("the state of a view of one Cluster", () => {
  it("is loading until the read of the namespace of its Cluster has ended", () => {
    expect(clusterViewOf(readsOf(started), { key: KEY, items: [cluster] }, NAMESPACE, cluster.metadata.name)).toEqual({
      state: "pending",
    });
  });

  it("finds the Cluster by its namespace and its name, in a namespace that was read", () => {
    const view = clusterViewOf(
      readsOf(started, ended),
      { key: KEY, items: [elsewhere, cluster] },
      NAMESPACE,
      "freelens-capi-healthy",
    );

    expect(view).toEqual({ state: "found", cluster });
  });

  it("finds no Cluster of that name in its namespace, which was read", () => {
    expect(
      clusterViewOf(readsOf(started, ended), { key: KEY, items: [elsewhere] }, NAMESPACE, "freelens-capi-healthy"),
    ).toEqual({
      state: "not-found",
    });
  });

  it("says that its namespace was refused, with the failure, never that the Cluster is not there", () => {
    const view = clusterViewOf(
      readsOf(started, { type: "load-failed", kind: KEY, id: 1, failure: refused }, ended),
      { key: KEY, items: [] },
      NAMESPACE,
      "freelens-capi-healthy",
    );

    expect(view).toMatchObject({ state: "not-read", refused: true, refresh: undefined });
    expect(view.state === "not-read" && view.load?.failures).toEqual([refused]);
  });

  it("says that its namespace failed, not refused, when one failure is not a refusal", () => {
    const view = clusterViewOf(
      readsOf(started, { type: "load-failed", kind: KEY, id: 1, failure: failed }, ended),
      { key: KEY, items: [] },
      NAMESPACE,
      "freelens-capi-healthy",
    );

    expect(view).toMatchObject({ state: "not-read", refused: false });
  });

  it("says that the Clusters of its namespace could not be read again, with the time of the refresh", () => {
    const view = clusterViewOf(
      readsOf(started, ended, { type: "refresh-failed", kind: KEY, failure: failed, at: CAPTURE + 1000 }),
      { key: KEY, items: [] },
      NAMESPACE,
      "freelens-capi-healthy",
    );

    expect(view).toMatchObject({
      state: "not-read",
      load: undefined,
      refresh: { at: CAPTURE + 1000, failures: [failed] },
    });
  });
});

describe("the holds of a kind in a namespace", () => {
  it("are those that cover the namespace, after a load and after a refresh", () => {
    const reads = readsOf(started, { type: "load-failed", kind: KEY, id: 1, failure: refused }, ended);

    expect(holdsOf(reads, KEY, NAMESPACE).load?.failures).toEqual([refused]);
    expect(holdsOf(reads, KEY, "freelens-capi-paused")).toEqual({ load: undefined, refresh: undefined });
    expect(holdsOf(reads, "/apis/another", NAMESPACE)).toEqual({ load: undefined, refresh: undefined });
  });
});
