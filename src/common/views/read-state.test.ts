import { describe, expect, it } from "vitest";
import {
  failureOf,
  firstLoadsEnded,
  isListReady,
  isLoaded,
  listNotices,
  listOutcome,
  NO_READS,
  namespaceRead,
  reduceReads,
  TIME,
  treeNotices,
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

describe("a kind of infrastructure cluster that could not all be read (P25)", () => {
  it("says that the details show the infrastructure cluster of those Clusters as text, with no health", () => {
    const DEV_CLUSTERS = "/apis/infrastructure.cluster.x-k8s.io/v1beta2/devclusters";
    const devClusters: KindDescriptor & { key: string } = {
      key: DEV_CLUSTERS,
      kind: "DevCluster",
      noun: "DevCluster objects",
      resource: "devclusters",
      group: "infrastructure.cluster.x-k8s.io",
      feeds: "infrastructure",
    };
    const refused = run([FILTER_AB, ...load(DEV_CLUSTERS, 1, ["a", "b"], [REFUSED_A])]);
    const [notice] = listNotices(refused, clusters, [devClusters], 2).overList;

    expect(notice.title).toBe("The DevCluster objects could not all be read");
    expect(notice.lines).toEqual([
      "Reading them takes get, list and watch on devclusters of infrastructure.cluster.x-k8s.io, in those namespaces or over the whole cluster.",
      "Until they can be read, the details of the Clusters of those namespaces show their infrastructure cluster as text, with no health.",
    ]);
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

// The cases of SPEC-0005, "Tests", "Unit", `read-state.test.ts` (P6, P23): the kinds that the tree adds, the namespace
// of a class read elsewhere, and the refresh of the tree.

const CONFIGS = "/apis/bootstrap.cluster.x-k8s.io/v1beta2/kubeadmconfigs";
const BINDINGS = "/apis/addons.cluster.x-k8s.io/v1beta2/clusterresourcesetbindings";
const CLASSES = "/apis/cluster.x-k8s.io/v1beta2/clusterclasses";

const configs: KindDescriptor & { key: string } = {
  key: CONFIGS,
  kind: "KubeadmConfig",
  noun: "KubeadmConfigs",
  resource: "kubeadmconfigs",
  group: "bootstrap.cluster.x-k8s.io",
  feeds: "nodes",
};

const bindings: KindDescriptor & { key: string } = {
  key: BINDINGS,
  kind: "ClusterResourceSetBinding",
  noun: "ClusterResourceSetBindings",
  resource: "clusterresourcesetbindings",
  group: "addons.cluster.x-k8s.io",
  feeds: "bindings",
};

// A refresh of a kind: a load that the refresh starts, its failures and its end.
function refresh(kind: string, id: number, namespaces: string[], failures: ReadFailure[] = [], at = 9000): ReadEvent[] {
  const [started, ...rest] = load(kind, id, namespaces, failures, { at });

  return [{ ...(started as Extract<ReadEvent, { type: "load-started" }>), refresh: true }, ...rest];
}

describe("the notices of the tree (SPEC-0005, P6, P19)", () => {
  const FILTER_A: ReadEvent = { type: "filter-changed", namespaces: ["a"], selectedAll: false };
  const NOT_READ = "Until they can be read, their nodes in the tree read as not read";
  const classes: KindDescriptor & { key: string } = {
    key: CLASSES,
    kind: "ClusterClass",
    noun: "ClusterClasses",
    resource: "clusterclasses",
    group: "cluster.x-k8s.io",
    feeds: "cluster-class",
  };

  it("say of a kind that gives the tree its nodes alone that its nodes read as not read", () => {
    const state = run([FILTER_A, ...load(CONFIGS, 1, ["a"], [REFUSED_A])]);
    const [notice] = treeNotices(state, [clusters, configs]);

    expect(notice.title).toBe("The KubeadmConfigs could not all be read");
    expect(notice.lines).toEqual([
      "Reading them takes get, list and watch on kubeadmconfigs of bootstrap.cluster.x-k8s.io, in those namespaces or over the whole cluster.",
      `${NOT_READ}.`,
    ]);
  });

  it("say of the bindings that the resources of the ClusterResourceSets read as not read too, which rest on ResourcesApplied alone", () => {
    const state = run([FILTER_A, ...load(BINDINGS, 2, ["a"], [FAILED])]);

    expect(treeNotices(state, [bindings]).map((notice) => notice.lines)).toEqual([
      [
        `${NOT_READ}, and so do the resources of the ClusterResourceSets of the Cluster.`,
        "Until then, the ClusterResourceSets of the tree rest on ResourcesApplied alone, which the status model notes.",
      ],
    ]);
  });

  it("say of the Machines which nodes they leave unread, the objects that only they name among them, and which inputs the Cluster and the objects of the tree go without", () => {
    const state = run([FILTER_A, ...load(MACHINES, 1, ["a"], [REFUSED_A])]);

    expect(treeNotices(state, [machines])[0].lines.slice(1)).toEqual([
      `${NOT_READ}, and so do the objects that only they name, since the tree learns their kinds from them.`,
      "Until then, the Cluster and the objects of the tree that count Machines are evaluated without them, which the status model notes: their activities read Unknown where their Machines count, never Idle.",
    ]);
  });

  it("say of the ClusterClasses read in another namespace that the Cluster of the tree is evaluated without its class, never the Clusters of that namespace", () => {
    const state = run([
      { type: "filter-changed", namespaces: ["a", "classes"], selectedAll: false },
      ...load(CLASSES, 1, ["classes"], [REFUSED_B]),
    ]);
    const [notice] = treeNotices(state, [classes]);

    expect(notice.lines.slice(1)).toEqual([
      `${NOT_READ}.`,
      "Until then, the Cluster of the tree is evaluated without its ClusterClass, which the status model notes: the availability gates of its ClusterClass are not read.",
    ]);
    expect(notice.lines.join(" ")).not.toMatch(/the Clusters of those namespaces/);
  });

  it.each([
    "machines",
    "machine-sets",
    "parts",
    "machine-pools",
    "health-checks",
    "cluster-class",
    "infrastructure",
    "nodes",
    "bindings",
  ] as const)("say, for a kind that feeds %s, which nodes it leaves unread", (feeds) => {
    const state = run([FILTER_A, ...load(MACHINES, 1, ["a"], [FAILED])]);
    const [notice] = treeNotices(state, [{ ...machines, feeds }]);

    expect(notice.lines[0].startsWith(NOT_READ)).toBe(true);
  });

  it("say nothing of the Clusters, which the tree says in its place", () => {
    const state = run([FILTER_A, ...load(CLUSTERS, 1, ["a"], [REFUSED_A])]);

    expect(treeNotices(state, [clusters])).toEqual([]);
  });

  it("are not those of the list, which says nothing more of a kind that the tree alone reads", () => {
    const state = run([FILTER_A, ...load(CONFIGS, 1, ["a"], [REFUSED_A]), ...load(BINDINGS, 2, ["a"], [FAILED])]);
    const [nodes, bound] = listNotices(state, clusters, [configs, bindings], 1).overList;

    expect(nodes.lines).toEqual([
      "Reading them takes get, list and watch on kubeadmconfigs of bootstrap.cluster.x-k8s.io, in those namespaces or over the whole cluster.",
    ]);
    expect(bound.lines).toEqual([]);
  });
});

describe("a class read in another namespace (SPEC-0005, P6)", () => {
  it("is read for its kind alone in the second namespace of the filter, and no longer once the filter drops it", () => {
    const both: ReadEvent = { type: "filter-changed", namespaces: ["a", "classes"], selectedAll: false };
    const state = run([both, ...load(MACHINES, 1, ["a"]), ...load(CLASSES, 2, ["classes"])]);

    expect(namespaceRead(state, CLASSES, "classes").state).toBe("read");
    expect(namespaceRead(state, MACHINES, "classes").state).toBe("pending");
    expect(namespaceRead(state, MACHINES, "a").state).toBe("read");

    const moved = run(
      [{ type: "filter-changed", namespaces: ["a", "other"], selectedAll: false }, ...load(CLASSES, 3, ["other"])],
      state,
    );

    expect(namespaceRead(moved, CLASSES, "classes").state).toBe("outside");
    expect(namespaceRead(moved, CLASSES, "other").state).toBe("read");
    expect(moved.kinds[CLASSES]?.loaded).toEqual(["other"]);
  });
});

describe("a refresh of the tree (SPEC-0005, P23)", () => {
  const read = run([FILTER_AB, ...load(CLUSTERS, 1, ["a", "b"]), ...load(MACHINES, 2, ["a", "b"])]);

  it("that fails holds its kind back in the namespaces of its load, as a reload after a 410 that failed, and leaves the first load as it was", () => {
    const failed = run(refresh(MACHINES, 3, ["a"], [REFUSED_A], 9000), read);
    const reads = failed.kinds[MACHINES];

    expect(namespaceRead(failed, MACHINES, "a").state).toBe("held");
    expect(namespaceRead(failed, MACHINES, "b").state).toBe("read");
    expect(reads?.refreshHold).toEqual({ namespaces: ["a"], failures: [REFUSED_A], at: 9000 });
    expect(reads?.last).toBe(read.kinds[MACHINES]?.last);
    expect(reads?.loadHold).toBeUndefined();
    expect(reads?.running).toEqual([]);
    expect(listNotices(failed, clusters, [machines], 2).overList[0]).toMatchObject({
      title: "The Machines could not be read again, at {time}",
      messages: [REFUSED_A.message],
      at: 9000,
    });
  });

  it("of the Clusters that fails is said as one, never Restricted or Failed, which say the first load", () => {
    const failed = run(refresh(CLUSTERS, 3, ["a", "b"], [REFUSED_A, REFUSED_B], 9000), read);

    expect(listOutcome(failed, CLUSTERS)).toEqual({ state: "read" });
    expect(listNotices(failed, clusters, [], 0).inPlaceOfRows).toMatchObject({
      id: "list:refresh",
      title: "The Clusters could not be read again, at {time}",
      at: 9000,
    });
  });

  it("that ends with no failure releases the hold of a load and that of a refresh, and is the last load", () => {
    const held = run(
      [...load(MACHINES, 3, ["a", "b"], [REFUSED_A], { at: 5000 }), ...refresh(MACHINES, 4, ["b"], [FAILED], 6000)],
      read,
    );

    expect(held.kinds[MACHINES]?.loadHold?.namespaces).toEqual(["a", "b"]);
    expect(held.kinds[MACHINES]?.refreshHold?.namespaces).toEqual(["b"]);

    const released = run(refresh(MACHINES, 5, ["a", "b"], [], 7000), held);

    expect(released.kinds[MACHINES]?.loadHold).toBeUndefined();
    expect(released.kinds[MACHINES]?.refreshHold).toBeUndefined();
    expect(released.kinds[MACHINES]?.last?.endedAt).toBe(7000);
    expect(namespaceRead(released, MACHINES, "a").state).toBe("read");
  });

  it("that fails again with the same answer keeps one entry for it, at the time of the last", () => {
    const twice = run(
      [...refresh(MACHINES, 3, ["a"], [REFUSED_A], 9000), ...refresh(MACHINES, 4, ["a"], [REFUSED_A], 9500)],
      read,
    );
    const other = run(refresh(MACHINES, 5, ["a"], [FAILED], 9800), twice);

    expect(twice.kinds[MACHINES]?.refreshHold).toEqual({ namespaces: ["a"], failures: [REFUSED_A], at: 9500 });
    expect(listNotices(twice, clusters, [machines], 2).overList[0]).toMatchObject({
      messages: [REFUSED_A.message],
      at: 9500,
    });
    // Another answer is one entry more.
    expect(other.kinds[MACHINES]?.refreshHold?.failures).toEqual([REFUSED_A, FAILED]);
  });

  it("that a store starts after a 410, and that fails again with the same answer, keeps one entry for it, at the time of the last", () => {
    const failed: ReadEvent = { type: "refresh-failed", kind: MACHINES, failure: FAILED, at: 9000 };
    const again = run([failed, { ...failed, at: 9500 }], read);

    expect(again.kinds[MACHINES]?.refreshHold).toEqual({ namespaces: ["a", "b"], failures: [FAILED], at: 9500 });
  });

  it("marks the loads that it starts, and no other", () => {
    const running = run([{ type: "load-started", kind: MACHINES, id: 3, namespaces: ["a"], refresh: true }], read);
    const first = run([{ type: "load-started", kind: CLUSTERS, id: 4, namespaces: ["a"] }], read);

    expect(running.kinds[MACHINES]?.running.map((entry) => entry.refresh)).toEqual([true]);
    expect(first.kinds[CLUSTERS]?.running.map((entry) => entry.refresh)).toEqual([false]);
  });
});

describe("the first loads of a view (SPEC-0005, P13)", () => {
  it("have ended once every kind has ended one, loaded or failed, and not while one runs or has not started", () => {
    const started: ReadEvent = { type: "load-started", kind: MACHINES, id: 2, namespaces: ["a"] };
    const clustersRead = run([FILTER_AB, ...load(CLUSTERS, 1, ["a"])]);
    const machinesRunning = run([started], clustersRead);
    const machinesFailed = run(
      [
        { type: "load-failed", kind: MACHINES, id: 2, failure: FAILED },
        { type: "load-ended", kind: MACHINES, id: 2, overWholeCluster: false, followed: true, at: 2 },
      ],
      machinesRunning,
    );

    expect(firstLoadsEnded(clustersRead, [CLUSTERS])).toBe(true);
    expect(firstLoadsEnded(clustersRead, [CLUSTERS, MACHINES])).toBe(false);
    expect(firstLoadsEnded(machinesRunning, [CLUSTERS, MACHINES])).toBe(false);
    expect(firstLoadsEnded(machinesFailed, [CLUSTERS, MACHINES])).toBe(true);
    expect(firstLoadsEnded(run([started], machinesFailed), [CLUSTERS, MACHINES])).toBe(true);
  });
});
