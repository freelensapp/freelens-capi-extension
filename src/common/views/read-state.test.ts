import { describe, expect, it } from "vitest";
import {
  failureOf,
  isListReady,
  isLoaded,
  listNotices,
  listOutcome,
  NO_READS,
  namespaceRead,
  reduceReads,
  TIME,
} from "./read-state";

import type { KindDescriptor, ReadEvent, ReadFailure, ReadsState } from "./read-state";

// The cases of SPEC-0004, "Tests", "Unit", `read-state.test.ts` (P25, P26, P34), on the pure state of the reads: the
// adapters tell it what the host does, as these events say.

const CLUSTERS = "/apis/cluster.x-k8s.io/v1beta2/clusters";
const MACHINES = "/apis/cluster.x-k8s.io/v1beta2/machines";

const clusters: KindDescriptor & { key: string } = {
  key: CLUSTERS,
  kind: "Cluster",
  noun: "Clusters",
  resource: "clusters",
  group: "cluster.x-k8s.io",
  feeds: "rows",
};

const machines: KindDescriptor & { key: string } = {
  key: MACHINES,
  kind: "Machine",
  noun: "Machines",
  resource: "machines",
  group: "cluster.x-k8s.io",
  feeds: "machines",
};

// The `Status` of Kubernetes that the client of the host throws for a refused read, as the store hands it on.
function refusal(namespace: string): Error {
  return new Error(`Failed to load ${CLUSTERS}`, {
    cause: {
      kind: "Status",
      apiVersion: "v1",
      status: "Failure",
      reason: "Forbidden",
      code: 403,
      message: `clusters.cluster.x-k8s.io is forbidden: User "reader" cannot list resource "clusters" in API group "cluster.x-k8s.io" in the namespace "${namespace}"`,
    },
  });
}

const REFUSED_A = failureOf(refusal("a"));
const REFUSED_B = failureOf(refusal("b"));
const FAILED: ReadFailure = { refused: false, message: "Failed to load: connection reset" };

function run(events: readonly ReadEvent[], from: ReadsState = NO_READS): ReadsState {
  return events.reduce(reduceReads, from);
}

const FILTER_AB: ReadEvent = { type: "filter-changed", namespaces: ["a", "b"], selectedAll: false };

// A load of a kind, its failures and its end.
function load(
  kind: string,
  id: number,
  namespaces: string[],
  failures: ReadFailure[] = [],
  options: { overWholeCluster?: boolean; followed?: boolean; at?: number } = {},
): ReadEvent[] {
  return [
    { type: "load-started", kind, id, namespaces },
    ...failures.map((failure): ReadEvent => ({ type: "load-failed", kind, id, failure })),
    {
      type: "load-ended",
      kind,
      id,
      overWholeCluster: options.overWholeCluster ?? false,
      followed: options.followed ?? true,
      at: options.at ?? 1000,
    },
  ];
}

describe("a failure", () => {
  it("is a refusal when its cause is a Status with the code 403, with the message of that answer", () => {
    expect(failureOf(refusal("a"))).toEqual({
      refused: true,
      message:
        'clusters.cluster.x-k8s.io is forbidden: User "reader" cannot list resource "clusters" in API group "cluster.x-k8s.io" in the namespace "a"',
    });
  });

  it("is a failure for a Status with another code, an error with no Status and a thrown string, with its text", () => {
    const notFound = new Error("Failed to load", { cause: { kind: "Status", code: 404, message: "not found" } });

    expect(failureOf(notFound)).toEqual({ refused: false, message: "not found" });
    expect(failureOf(new Error("Failed to load", { cause: new Error("socket hang up") }))).toEqual({
      refused: false,
      message: "Failed to load: socket hang up",
    });
    expect(failureOf("unreachable")).toEqual({ refused: false, message: "unreachable" });
  });

  it("never reads the text: a message that says 403 is no refusal", () => {
    expect(failureOf(new Error("403 Forbidden")).refused).toBe(false);
  });
});

describe("the outcome of a load of the Clusters (P25)", () => {
  it("is Restricted when every namespace of the load is refused, with each message, the permission and the filter", () => {
    const state = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A, REFUSED_B])]);
    const notices = listNotices(state, clusters, [], 0);

    expect(listOutcome(state, CLUSTERS)).toMatchObject({ state: "restricted" });
    expect(notices.inPlaceOfRows).toMatchObject({
      title: "You may not list the Clusters of the namespaces that the filter selects",
      messages: [REFUSED_A.message, REFUSED_B.message],
    });
    expect(notices.inPlaceOfRows?.lines).toEqual([
      "Listing them takes get, list and watch on clusters of cluster.x-k8s.io, in those namespaces or over the whole cluster.",
      "Select in the namespace filter the namespaces whose Clusters you may read.",
    ]);
    expect(notices.notCounted).toBe(true);
  });

  it("is Restricted when a load over the whole cluster is refused, its one failure for every namespace", () => {
    const state = run([
      { type: "filter-changed", namespaces: ["a", "b"], selectedAll: true },
      ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A], { overWholeCluster: true }),
    ]);

    expect(listOutcome(state, CLUSTERS)).toMatchObject({ state: "restricted", overWholeCluster: true });
    expect(listNotices(state, clusters, [], 0).inPlaceOfRows?.title).toMatch(/over the whole cluster/);
  });

  it("is Partial when some namespaces failed and the others were read, over the list with rows", () => {
    const state = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A])]);
    const notices = listNotices(state, clusters, [], 2);

    expect(listOutcome(state, CLUSTERS).state).toBe("partial");
    expect(notices.inPlaceOfRows).toBeUndefined();
    expect(notices.overList).toHaveLength(1);
    expect(notices.overList[0]).toMatchObject({
      title: "The Clusters could not all be read",
      messages: [REFUSED_A.message],
    });
    expect(notices.overList[0].lines).not.toContain("The namespaces that could be read hold no Cluster.");
    expect(notices.notCounted).toBe(false);
  });

  it("is Partial in the place of the rows with no row, saying that the namespaces read hold no Cluster", () => {
    const state = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [FAILED])]);
    const notices = listNotices(state, clusters, [], 0);

    expect(notices.inPlaceOfRows?.lines).toContain("The namespaces that could be read hold no Cluster.");
    expect(notices.inPlaceOfRows?.lines.join(" ")).not.toMatch(/Listing them takes/);
    expect(notices.notCounted).toBe(true);
  });

  it("is Failed when every namespace failed, not all refused, with each reason and the permission of the refusal", () => {
    const state = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A, FAILED])]);
    const notices = listNotices(state, clusters, [], 0);

    expect(listOutcome(state, CLUSTERS).state).toBe("failed");
    expect(notices.inPlaceOfRows).toMatchObject({
      title: "The Clusters could not be read",
      messages: [REFUSED_A.message, FAILED.message],
    });
    expect(notices.inPlaceOfRows?.lines.join(" ")).toMatch(/get, list and watch on clusters of cluster.x-k8s.io/);
    expect(notices.notCounted).toBe(true);
  });

  it("is read, with no notice and the count of the host, when the load reports no failure", () => {
    const state = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"])]);

    expect(listOutcome(state, CLUSTERS).state).toBe("read");
    expect(listNotices(state, clusters, [], 0)).toEqual({ inPlaceOfRows: undefined, overList: [], notCounted: false });
  });

  it("says nothing of a watch that fails and starts again, which the host reports to no one", () => {
    // No event reaches the page: the state is that of the load.
    const state = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"])]);

    expect(listNotices(state, clusters, [], 3).overList).toEqual([]);
  });
});

describe("a kind of the context that could not all be read (P25)", () => {
  it("is given to no Cluster of the namespaces of its load, with a notice that names it, until a load ends well", () => {
    const refused = run([FILTER_AB, ...load(MACHINES, 1, ["a", "b"], [REFUSED_A])]);
    const notices = listNotices(refused, clusters, [machines], 2);

    expect(namespaceRead(refused, MACHINES, "a").state).toBe("held");
    expect(namespaceRead(refused, MACHINES, "b").state).toBe("held");
    expect(notices.overList).toHaveLength(1);
    expect(notices.overList[0].title).toBe("The Machines could not all be read");
    expect(notices.overList[0].lines.join(" ")).toMatch(/get, list and watch on machines of cluster.x-k8s.io/);
    expect(notices.overList[0].lines.join(" ")).toMatch(/activities read Unknown/);

    const read = run(load(MACHINES, 2, ["a", "b"]), refused);

    expect(namespaceRead(read, MACHINES, "a").state).toBe("read");
    expect(listNotices(read, clusters, [machines], 2).overList).toEqual([]);
  });
});

describe("a kind of the context refused in one namespace of its load (P25)", () => {
  const reload: ReadEvent[] = [
    { type: "reload-started", kind: MACHINES },
    { type: "reload-ended", kind: MACHINES },
  ];

  it("stays held after a reload that the store starts itself and that reports no failure", () => {
    const refused = run([FILTER_AB, ...load(MACHINES, 1, ["a", "b"], [REFUSED_A])]);
    const reloaded = run(reload, refused);

    expect(namespaceRead(reloaded, MACHINES, "a").state).toBe("held");
    expect(namespaceRead(reloaded, MACHINES, "b").state).toBe("held");
    expect(listNotices(reloaded, clusters, [machines], 2).overList.map((notice) => notice.title)).toEqual([
      "The Machines could not all be read",
    ]);
  });

  it("stays held after a refresh that fails and then a reload that reports no failure, the refresh said next to it", () => {
    const refused = run([FILTER_AB, ...load(MACHINES, 1, ["a", "b"], [REFUSED_A])]);
    const failed = run(
      [
        { type: "reload-started", kind: MACHINES },
        { type: "refresh-failed", kind: MACHINES, failure: FAILED, at: 5000 },
        { type: "reload-ended", kind: MACHINES },
      ],
      refused,
    );
    const notice = listNotices(failed, clusters, [machines], 2).overList[0];

    expect(namespaceRead(failed, MACHINES, "a").state).toBe("held");
    expect(notice).toMatchObject({
      title: "The Machines could not all be read, and could not be read again at {time}",
    });
    expect(notice.messages).toEqual([REFUSED_A.message, FAILED.message]);
    expect(notice.at).toBe(5000);
    expect(namespaceRead(run(reload, failed), MACHINES, "a").state).toBe("held");
    expect(namespaceRead(run(load(MACHINES, 2, ["a", "b"]), failed), MACHINES, "a").state).toBe("read");
  });
});

describe("a refresh that failed (P25, P26)", () => {
  const read = run([FILTER_AB, ...load(MACHINES, 1, ["a", "b"]), ...load(CLUSTERS, 2, ["a", "b"])]);

  it("is said as an event of the past, with its time and its reason, in the place of the rows when none is left", () => {
    const state = run([{ type: "refresh-failed", kind: CLUSTERS, failure: FAILED, at: 5000 }], read);
    const notices = listNotices(state, clusters, [], 0);

    expect(notices.inPlaceOfRows).toMatchObject({
      title: "The Clusters could not be read again, at {time}",
      messages: [FAILED.message],
      at: 5000,
    });
    expect(notices.notCounted).toBe(true);
    expect(listNotices(state, clusters, [], 1).overList.map((notice) => notice.id)).toEqual(["list:refresh"]);
  });

  it("holds a kind of the context back, with its notice, until the next load of that kind ends, and not after", () => {
    const failed = run([{ type: "refresh-failed", kind: MACHINES, failure: REFUSED_A, at: 5000 }], read);

    expect(namespaceRead(failed, MACHINES, "a").state).toBe("held");
    expect(listNotices(failed, clusters, [machines], 1).overList[0]).toMatchObject({
      title: "The Machines could not be read again, at {time}",
      at: 5000,
    });

    const reloaded = run(load(MACHINES, 3, ["a", "b"]), failed);

    expect(namespaceRead(reloaded, MACHINES, "a").state).toBe("read");
    expect(listNotices(reloaded, clusters, [machines], 1).overList).toEqual([]);
  });

  it("is released by a reload that the store starts itself and that ends with no failure, and kept by one that fails", () => {
    const failed = run([{ type: "refresh-failed", kind: MACHINES, failure: FAILED, at: 5000 }], read);
    const released = run(
      [
        { type: "reload-started", kind: MACHINES },
        { type: "reload-ended", kind: MACHINES },
      ],
      failed,
    );
    const kept = run(
      [
        { type: "reload-started", kind: MACHINES },
        { type: "refresh-failed", kind: MACHINES, failure: FAILED, at: 6000 },
        { type: "reload-ended", kind: MACHINES },
      ],
      failed,
    );

    expect(namespaceRead(released, MACHINES, "a").state).toBe("read");
    expect(listNotices(released, clusters, [machines], 1).overList).toEqual([]);
    expect(namespaceRead(kept, MACHINES, "a").state).toBe("held");
    expect(listNotices(kept, clusters, [machines], 1).overList[0].at).toBe(6000);
  });

  it("takes a run of isLoading during a load of the page for that load, not for a reload", () => {
    const failed = run([{ type: "refresh-failed", kind: MACHINES, failure: FAILED, at: 5000 }], read);
    const state = run(
      [
        { type: "load-started", kind: MACHINES, id: 9, namespaces: ["a", "b"] },
        { type: "reload-started", kind: MACHINES },
        { type: "reload-ended", kind: MACHINES },
      ],
      failed,
    );

    expect(namespaceRead(state, MACHINES, "a").state).toBe("held");
  });
});

describe("a list read once over the whole cluster (P34)", () => {
  const all: ReadEvent = { type: "filter-changed", namespaces: ["a", "b"], selectedAll: true };

  it("is said, with the time of its read, after a load over the whole cluster that the host does not follow", () => {
    const state = run([
      all,
      ...load(CLUSTERS, 1, ["a", "b"], [], { overWholeCluster: true, followed: false, at: 7000 }),
    ]);
    const notices = listNotices(state, clusters, [], 2);

    expect(notices.overList).toHaveLength(1);
    expect(notices.overList[0]).toMatchObject({
      id: "list:not-followed",
      title: "This list was read once, at {time}, over the whole cluster, and is not followed",
      at: 7000,
    });
    expect(listNotices(state, clusters, [], 0).overList.map((notice) => notice.id)).toEqual(["list:not-followed"]);
  });

  it("is not said after a load namespace by namespace, after one that the host follows, or after one that failed", () => {
    const byNamespace = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [], { followed: false })]);
    const followed = run([all, ...load(CLUSTERS, 1, ["a", "b"], [], { overWholeCluster: true, followed: true })]);
    const failed = run([all, ...load(CLUSTERS, 1, ["a", "b"], [FAILED], { overWholeCluster: true, followed: false })]);

    for (const state of [byNamespace, followed, failed]) {
      expect(listNotices(state, clusters, [], 2).overList.map((notice) => notice.id)).not.toContain(
        "list:not-followed",
      );
    }
  });
});

describe("the time of a notice", () => {
  it("is in the title of every notice of an event of the past, at the place that the title gives it, and in no other", () => {
    const states = [
      run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A, REFUSED_B])]),
      run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A])]),
      run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"], [REFUSED_A, FAILED])]),
      run([
        FILTER_AB,
        ...load(CLUSTERS, 1, ["a", "b"]),
        ...load(MACHINES, 2, ["a", "b"], [REFUSED_A]),
        { type: "refresh-failed", kind: CLUSTERS, failure: FAILED, at: 5000 },
        { type: "refresh-failed", kind: MACHINES, failure: FAILED, at: 6000 },
      ]),
      run([
        { type: "filter-changed", namespaces: ["a", "b"], selectedAll: true },
        ...load(CLUSTERS, 1, ["a", "b"], [], { overWholeCluster: true, followed: false, at: 7000 }),
      ]),
    ];
    const notices = states.flatMap((state) =>
      [0, 2].flatMap((rows) => {
        const { inPlaceOfRows, overList } = listNotices(state, clusters, [machines], rows);

        return [...(inPlaceOfRows === undefined ? [] : [inPlaceOfRows]), ...overList];
      }),
    );

    expect(new Set(notices.map((notice) => notice.id))).toEqual(
      new Set(["list:restricted", "list:partial", "list:failed", "list:refresh", "kind:Machine", "list:not-followed"]),
    );
    for (const notice of notices) {
      expect(notice.title.split(TIME).length - 1, notice.title).toBe(notice.at === undefined ? 0 : 1);
    }
  });
});

describe("the namespaces loaded (P19)", () => {
  it("are those of a load that ended, never of one that the host aborted", () => {
    const state = run([
      FILTER_AB,
      { type: "load-started", kind: CLUSTERS, id: 1, namespaces: ["a"] },
      { type: "load-aborted", kind: CLUSTERS, id: 1 },
      ...load(CLUSTERS, 2, ["b"]),
    ]);

    expect(isLoaded(state, CLUSTERS, "a")).toBe(false);
    expect(isLoaded(state, CLUSTERS, "b")).toBe(true);
  });

  it("stay loaded while the filter keeps them, and a namespace that it drops and adds again waits for its load", () => {
    const loaded = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"])]);
    const dropped = run([{ type: "filter-changed", namespaces: ["a"], selectedAll: false }], loaded);
    const added = run([FILTER_AB], dropped);

    expect(isLoaded(dropped, CLUSTERS, "a")).toBe(true);
    expect(isLoaded(dropped, CLUSTERS, "b")).toBe(false);
    expect(namespaceRead(dropped, CLUSTERS, "b").state).toBe("outside");
    expect(isLoaded(added, CLUSTERS, "b")).toBe(false);
    expect(namespaceRead(added, CLUSTERS, "b").state).toBe("pending");
  });

  it("count one that the filter adds while every namespace stays selected, after a load over the whole cluster that the host follows", () => {
    const followed = run([
      { type: "filter-changed", namespaces: ["a", "b"], selectedAll: true },
      ...load(CLUSTERS, 1, ["a", "b"], [], { overWholeCluster: true, followed: true }),
      { type: "filter-changed", namespaces: ["a", "b", "c"], selectedAll: true },
    ]);
    const notFollowed = run([
      { type: "filter-changed", namespaces: ["a", "b"], selectedAll: true },
      ...load(CLUSTERS, 1, ["a", "b"], [], { overWholeCluster: true, followed: false }),
      { type: "filter-changed", namespaces: ["a", "b", "c"], selectedAll: true },
    ]);

    expect(isLoaded(followed, CLUSTERS, "c")).toBe(true);
    expect(isLoaded(notFollowed, CLUSTERS, "c")).toBe(false);
  });
});

describe("the readiness of the list (P19)", () => {
  it("waits for the first load of the Clusters, and for a load that runs with no row listed", () => {
    const started: ReadEvent = { type: "load-started", kind: CLUSTERS, id: 1, namespaces: ["a"] };
    const first = run([FILTER_AB, started]);
    const ended = run(
      [{ type: "load-ended", kind: CLUSTERS, id: 1, overWholeCluster: false, followed: true, at: 1 }],
      first,
    );
    const again = run([{ ...started, id: 2 }], ended);

    expect(isListReady(first, CLUSTERS, 3)).toBe(false);
    expect(isListReady(ended, CLUSTERS, 0)).toBe(true);
    expect(isListReady(again, CLUSTERS, 0)).toBe(false);
    expect(isListReady(again, CLUSTERS, 2)).toBe(true);
  });
});
