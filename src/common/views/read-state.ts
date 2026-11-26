/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The state of the reads of a page (SPEC-0004, P19, P25, P26, P34), as pure functions of what the adapters of its
// stores tell it: the start of each load, with its namespaces, each failure of a load and of the reload after a 410,
// the end of each load, with whether it read its namespaces over the whole cluster and whether the host follows it, a
// load that the host aborts, and a reload that a store starts on its own. From these, the page knows which namespaces
// of each kind are loaded, which kinds it holds back and where, and what it says: Restricted, Partial, Failed, a
// refresh that failed, and a list that the host reads once and does not follow.
//
// A failure is told from the code of its answer, never from a text: the client of the host throws the `Status` of
// Kubernetes itself for a refused read, whose `code` is 403, and the store hands it on as the cause of its failure.
// Any other failure is a failure, its text shown as its reason and never read. The store names no namespace in a
// failure: the message of each answer, shown as the cluster wrote it, says where, and the page counts the failures of
// a load against its namespaces.

// A failure, as the page shows it.
export interface ReadFailure {
  // The answer was a refusal: the `Status` of Kubernetes with the code 403.
  readonly refused: boolean;
  // The message of the answer as the cluster wrote it, or the text of the failure; shown, never read.
  readonly message: string;
}

// A kind that the page reads, as its notices name it.
export interface KindDescriptor {
  // The kind, as the project names it, and its plural for a sentence, such as `Machines`.
  readonly kind: string;
  readonly noun: string;
  // The resource and the group of the permission that a read of it takes.
  readonly resource: string;
  readonly group: string;
  // What the status model takes from the kind (SPEC-0003, "What it takes and returns"); `rows` for the Clusters.
  readonly feeds: KindFeeds;
}

export type KindFeeds =
  | "rows"
  | "machines"
  | "machine-sets"
  | "parts"
  | "machine-pools"
  | "health-checks"
  | "cluster-class"
  | "controllers"
  // The infrastructure clusters, which the details of a Cluster show, and the model of the Cluster does not take.
  | "infrastructure";

interface RunningLoad {
  readonly id: number;
  readonly namespaces: readonly string[];
  readonly failures: readonly ReadFailure[];
}

// The last load of a kind that ended in this mount of the page.
export interface EndedLoad {
  readonly namespaces: readonly string[];
  // `isLoadingAll` of the context of the frame for its namespaces, read as it started (P34).
  readonly overWholeCluster: boolean;
  readonly failures: readonly ReadFailure[];
  readonly endedAt: number;
  // `isGlobalWatchEnabled()` of the context of the frame, read as it ended with no failure (P34).
  readonly followed: boolean;
}

// A kind that the page gives to no object of some namespaces, after a load or a refresh that failed (P25).
export interface Hold {
  readonly namespaces: readonly string[];
  readonly failures: readonly ReadFailure[];
  readonly at: number;
}

export interface KindReads {
  readonly running: readonly RunningLoad[];
  // The namespaces that a load of the kind that included them has loaded, in this mount of the page, which the
  // filter still selects.
  readonly loaded: readonly string[];
  // The last load ended over the whole cluster, with no failure, and the host follows it.
  readonly followsWholeCluster: boolean;
  readonly last: EndedLoad | undefined;
  // A load of the kind that failed holds it back in every namespace of the load, since the store names no namespace
  // in a failure, until a load of the kind ends with no failure (P25).
  readonly loadHold: Hold | undefined;
  // A refresh that failed, the reload of a watch after a 410, holds the kind back in the namespaces of its last load,
  // until a load of the kind ends, or a reload that the store starts itself reports no failure (P25, P26). A refresh
  // never turns the hold of a load into its own: a reload never covers a namespace whose list failed.
  readonly refreshHold: Hold | undefined;
  // A reload that the store started on its own, while no load of the page ran, with the failures it reported.
  readonly reload: { readonly failures: readonly ReadFailure[] } | undefined;
}

export interface ReadsState {
  readonly kinds: Readonly<Record<string, KindReads>>;
  // The namespaces that the filter selects, and whether it selects every namespace of the cluster.
  readonly filter: { readonly namespaces: readonly string[]; readonly selectedAll: boolean } | undefined;
}

export type ReadEvent =
  | {
      readonly type: "load-started";
      readonly kind: string;
      readonly id: number;
      readonly namespaces: readonly string[];
    }
  | { readonly type: "load-failed"; readonly kind: string; readonly id: number; readonly failure: ReadFailure }
  | {
      readonly type: "load-ended";
      readonly kind: string;
      readonly id: number;
      // `isLoadingAll` of the context of the frame for the namespaces of the load, as the page read it when the load
      // started, and `isGlobalWatchEnabled()`, as it read it when the load ended (P34).
      readonly overWholeCluster: boolean;
      readonly followed: boolean;
      readonly at: number;
    }
  | { readonly type: "load-aborted"; readonly kind: string; readonly id: number }
  | { readonly type: "refresh-failed"; readonly kind: string; readonly failure: ReadFailure; readonly at: number }
  | { readonly type: "reload-started"; readonly kind: string }
  | { readonly type: "reload-ended"; readonly kind: string }
  // The stores of the page, by their keys, when the set changes.
  | { readonly type: "stores-changed"; readonly kinds: readonly string[] }
  | { readonly type: "filter-changed"; readonly namespaces: readonly string[]; readonly selectedAll: boolean };

export const NO_READS: ReadsState = { kinds: {}, filter: undefined };

const NO_KIND_READS: KindReads = {
  running: [],
  loaded: [],
  followsWholeCluster: false,
  last: undefined,
  loadHold: undefined,
  refreshHold: undefined,
  reload: undefined,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

// The `Status` of Kubernetes, which the client of the host throws for a refused read.
function isStatus(value: unknown): value is { readonly code: number; readonly message?: unknown } {
  return isRecord(value) && value.kind === "Status" && typeof value.code === "number";
}

// The text of a failure, as the list layout of the host writes it in its tooltip: the message of each error of the
// chain of causes.
function textOf(error: unknown): string {
  if (error instanceof Error) {
    return error.cause === undefined ? error.message : `${error.message}: ${textOf(error.cause)}`;
  }
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

// A failure that the host reports: a refusal when the failure, or a cause of it, is a `Status` with the code 403, with
// the message of that answer; any other failure with its text. Nothing is read from either text.
export function failureOf(error: unknown): ReadFailure {
  for (let cause: unknown = error, depth = 0; cause !== undefined && depth < 8; depth++) {
    if (isStatus(cause)) {
      const message = typeof cause.message === "string" && cause.message !== "" ? cause.message : textOf(error);

      return { refused: cause.code === 403, message };
    }
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return { refused: false, message: textOf(error) };
}

function kindOf(state: ReadsState, kind: string): KindReads {
  return state.kinds[kind] ?? NO_KIND_READS;
}

function withKind(state: ReadsState, kind: string, change: (reads: KindReads) => KindReads): ReadsState {
  return { ...state, kinds: { ...state.kinds, [kind]: change(kindOf(state, kind)) } };
}

// The namespaces that the filter keeps; all of them before the page knows the filter.
function kept(state: ReadsState, namespaces: readonly string[]): string[] {
  const filter = state.filter;

  return filter === undefined
    ? [...namespaces]
    : namespaces.filter((namespace) => filter.namespaces.includes(namespace));
}

function unique(namespaces: readonly string[]): string[] {
  return [...new Set(namespaces)];
}

function endLoad(state: ReadsState, event: Extract<ReadEvent, { type: "load-ended" }>): ReadsState {
  const { kind, id, overWholeCluster, followed, at } = event;
  const reads = kindOf(state, kind);
  const load = reads.running.find((running) => running.id === id);

  if (load === undefined) return state;

  const failed = load.failures.length > 0;
  const last: EndedLoad = {
    namespaces: load.namespaces,
    overWholeCluster,
    failures: load.failures,
    endedAt: at,
    followed: !failed && followed,
  };

  return withKind(state, kind, () => ({
    ...reads,
    running: reads.running.filter((running) => running.id !== id),
    loaded: kept(state, unique([...reads.loaded, ...load.namespaces])),
    followsWholeCluster: overWholeCluster && last.followed,
    last,
    // A load that ends with no failure releases what an earlier one held back; one that fails holds the kind back in
    // every namespace of the load, since the store names none in a failure (P25). Either reads every namespace of the
    // load again, and ends the hold of a refresh that failed (P26).
    loadHold: failed ? { namespaces: load.namespaces, failures: load.failures, at } : undefined,
    refreshHold: undefined,
  }));
}

// A refresh that failed holds the kind back in the namespaces of its last load, next to the hold of a load that
// failed, which it leaves as it is.
function refreshFailed(state: ReadsState, kind: string, failure: ReadFailure, at: number): ReadsState {
  return withKind(state, kind, (reads) => ({
    ...reads,
    reload: reads.reload && { failures: [...reads.reload.failures, failure] },
    refreshHold: {
      namespaces: unique([...(reads.refreshHold?.namespaces ?? []), ...(reads.last?.namespaces ?? [])]),
      failures: [...(reads.refreshHold?.failures ?? []), failure],
      at,
    },
  }));
}

// The state after an event that an adapter or the filter tells the page.
export function reduceReads(state: ReadsState, event: ReadEvent): ReadsState {
  switch (event.type) {
    case "load-started":
      return withKind(state, event.kind, (reads) => ({
        ...reads,
        running: [...reads.running, { id: event.id, namespaces: event.namespaces, failures: [] }],
      }));
    case "load-failed":
      return withKind(state, event.kind, (reads) => ({
        ...reads,
        running: reads.running.map((running) =>
          running.id === event.id ? { ...running, failures: [...running.failures, event.failure] } : running,
        ),
      }));
    case "load-ended":
      return endLoad(state, event);
    case "load-aborted":
      return withKind(state, event.kind, (reads) => ({
        ...reads,
        running: reads.running.filter((running) => running.id !== event.id),
      }));
    case "refresh-failed":
      return refreshFailed(state, event.kind, event.failure, event.at);
    case "reload-started":
      // A run of `isLoading` during a load of the page is that load.
      return withKind(state, event.kind, (reads) =>
        reads.running.length > 0 || reads.reload !== undefined ? reads : { ...reads, reload: { failures: [] } },
      );
    case "reload-ended":
      return withKind(state, event.kind, (reads) => {
        if (reads.reload === undefined) return reads;
        // A reload that the store started on its own and that reported no failure read again what a refresh could not:
        // it releases the hold of that refresh and ends its notice (P25). It never releases the hold of a load: the
        // store watches no namespace whose list failed, so a reload never reads it again.
        return {
          ...reads,
          reload: undefined,
          refreshHold: reads.reload.failures.length === 0 ? undefined : reads.refreshHold,
        };
      });
    case "stores-changed":
      // A store that leaves the set of the page loses what it loaded: when it comes back, the objects of its
      // namespaces, which nothing has watched meanwhile, wait for its next load (P19).
      return {
        ...state,
        kinds: Object.fromEntries(Object.entries(state.kinds).filter(([kind]) => event.kinds.includes(kind))),
      };
    case "filter-changed": {
      const next: ReadsState = { ...state, filter: { namespaces: event.namespaces, selectedAll: event.selectedAll } };

      return {
        ...next,
        kinds: Object.fromEntries(
          Object.entries(state.kinds).map(([kind, reads]) => [kind, { ...reads, loaded: kept(next, reads.loaded) }]),
        ),
      };
    }
  }
}

// Whether the objects of a kind in a namespace are loaded: a load of the kind that included the namespace has ended
// in this mount of the page, and the filter keeps it; or, after a load over the whole cluster that the host follows,
// the filter selects every namespace, so that the host starts no load for one that it adds and its watch over the
// whole cluster brings its objects (P19).
export function isLoaded(state: ReadsState, kind: string, namespace: string): boolean {
  const reads = kindOf(state, kind);
  const filter = state.filter;

  if (reads.loaded.includes(namespace)) return true;
  return (
    reads.followsWholeCluster && filter !== undefined && filter.selectedAll && filter.namespaces.includes(namespace)
  );
}

// What the page gives the status model of a kind in a namespace: nothing yet, until a load of it has ended; nothing,
// held back with the failures, after a load or a refresh that failed there; nothing, for a namespace that the filter
// does not select, which the page does not read (P2); or what the store holds.
export type NamespaceRead =
  | { readonly state: "pending" }
  | { readonly state: "held" }
  | { readonly state: "outside" }
  | { readonly state: "read" };

export function namespaceRead(state: ReadsState, kind: string, namespace: string): NamespaceRead {
  const { loadHold, refreshHold } = kindOf(state, kind);
  const filter = state.filter;

  if (loadHold?.namespaces.includes(namespace) || refreshHold?.namespaces.includes(namespace)) return { state: "held" };
  if (isLoaded(state, kind, namespace)) return { state: "read" };
  if (filter !== undefined && !filter.namespaces.includes(namespace)) return { state: "outside" };
  return { state: "pending" };
}

// Whether the list is ready to show its rows, or its empty list (P19): not before the first load of the Clusters in
// this mount of the page has ended, and not while a load of the Clusters runs and no row is listed.
export function isListReady(state: ReadsState, clusters: string, rows: number): boolean {
  const reads = kindOf(state, clusters);

  if (reads.last === undefined) return false;
  return !(reads.running.length > 0 && rows === 0);
}

// The outcome of the last load of the Clusters, counted against its namespaces (P25).
export type ListOutcome =
  | { readonly state: "loading" }
  | { readonly state: "read" }
  | { readonly state: "restricted"; readonly failures: readonly ReadFailure[]; readonly overWholeCluster: boolean }
  | { readonly state: "failed"; readonly failures: readonly ReadFailure[] }
  | { readonly state: "partial"; readonly failures: readonly ReadFailure[] };

export function listOutcome(state: ReadsState, clusters: string): ListOutcome {
  const last = kindOf(state, clusters).last;

  if (last === undefined) return { state: "loading" };

  const { failures, namespaces, overWholeCluster } = last;

  if (failures.length === 0) return { state: "read" };

  // A load over the whole cluster reports one failure; a load of namespaces one by one, one for each namespace that
  // fails, so a load in which every namespace failed reports as many failures as it has namespaces.
  const everyNamespace = overWholeCluster || failures.length >= namespaces.length;

  if (!everyNamespace) return { state: "partial", failures };
  if (failures.every((failure) => failure.refused)) return { state: "restricted", failures, overWholeCluster };
  return { state: "failed", failures };
}

// The place of the time of a notice in its title, where the page puts the date component of the host.
export const TIME = "{time}";

// What a page says of its reads, in words, with the time of an event of the past.
export interface Notice {
  readonly id: string;
  readonly tone: "warning" | "info";
  // The title, with `TIME` where the time of the event goes, once, when the notice has one.
  readonly title: string;
  // The message of each answer, as the cluster wrote it.
  readonly messages: readonly string[];
  readonly lines: readonly string[];
  // The time of the event that the notice says, for the date component of the host.
  readonly at: number | undefined;
}

function permissionOf(descriptor: KindDescriptor): string {
  return `get, list and watch on ${descriptor.resource} of ${descriptor.group}`;
}

function refusalLine(descriptor: KindDescriptor, failures: readonly ReadFailure[]): string[] {
  return failures.some((failure) => failure.refused)
    ? [`Reading them takes ${permissionOf(descriptor)}, in those namespaces or over the whole cluster.`]
    : [];
}

const FEEDS_WORDS: Record<Exclude<KindFeeds, "rows" | "infrastructure">, string> = {
  machines: "their activities read Unknown where their Machines count, never Idle",
  "machine-sets": "the activities of their MachineDeployments, and so their own, read Unknown, never Idle",
  parts: "their activities read Unknown, never Idle",
  "machine-pools": "their health leaves out their MachinePools, and their activities read Unknown, never Idle",
  "health-checks": "the threshold of their Machines is the default of the project, 10 minutes",
  "cluster-class": "the availability gates of their ClusterClass are not read",
  controllers: "the availability of the controllers of their providers is not known",
};

// The notice of a kind of the context that the page holds back (P25): after a load that failed, after a refresh that
// failed, or after both, with the failures of each.
function contextNotice(descriptor: KindDescriptor, reads: KindReads): Notice | undefined {
  const { loadHold, refreshHold } = reads;

  if (loadHold === undefined && refreshHold === undefined) return undefined;

  const failures = [...(loadHold?.failures ?? []), ...(refreshHold?.failures ?? [])];
  const what =
    descriptor.feeds === "rows"
      ? ""
      : descriptor.feeds === "infrastructure"
        ? "Until they can be read, the details of the Clusters of those namespaces show their infrastructure cluster as text, with no health."
        : `Until they can be read, the Clusters of those namespaces are evaluated without them, which the status model notes: ${FEEDS_WORDS[descriptor.feeds]}.`;
  const title =
    loadHold === undefined
      ? `The ${descriptor.noun} could not be read again, at ${TIME}`
      : refreshHold === undefined
        ? `The ${descriptor.noun} could not all be read`
        : `The ${descriptor.noun} could not all be read, and could not be read again at ${TIME}`;

  return {
    id: `kind:${descriptor.kind}`,
    tone: "warning",
    title,
    messages: failures.map((failure) => failure.message),
    lines: [...refusalLine(descriptor, failures), ...(what === "" ? [] : [what])],
    at: refreshHold?.at,
  };
}

// What the page draws of the reads of its list: a notice in the place of the rows, when no row is listed, the notices
// over the list, and whether the count of the header is replaced (P25, P34).
export interface ListNotices {
  readonly inPlaceOfRows: Notice | undefined;
  readonly overList: readonly Notice[];
  readonly notCounted: boolean;
}

export function listNotices(
  state: ReadsState,
  clusters: KindDescriptor & { readonly key: string },
  context: readonly (KindDescriptor & { readonly key: string })[],
  rows: number,
): ListNotices {
  const reads = kindOf(state, clusters.key);
  const outcome = listOutcome(state, clusters.key);
  const overList: Notice[] = [];
  let inPlaceOfRows: Notice | undefined;
  const permission = `Listing them takes ${permissionOf(clusters)}, in those namespaces or over the whole cluster.`;

  if (outcome.state === "restricted") {
    inPlaceOfRows = {
      id: "list:restricted",
      tone: "warning",
      title: outcome.overWholeCluster
        ? "You may not list the Clusters over the whole cluster, which is how Freelens reads every namespace"
        : "You may not list the Clusters of the namespaces that the filter selects",
      messages: outcome.failures.map((failure) => failure.message),
      lines: [permission, "Select in the namespace filter the namespaces whose Clusters you may read."],
      at: undefined,
    };
  } else if (outcome.state === "failed") {
    inPlaceOfRows = {
      id: "list:failed",
      tone: "warning",
      title: "The Clusters could not be read",
      messages: outcome.failures.map((failure) => failure.message),
      lines: outcome.failures.some((failure) => failure.refused) ? [permission] : [],
      at: undefined,
    };
  } else if (outcome.state === "partial") {
    const notice: Notice = {
      id: "list:partial",
      tone: "warning",
      title: "The Clusters could not all be read",
      messages: outcome.failures.map((failure) => failure.message),
      lines: [
        ...(outcome.failures.some((failure) => failure.refused) ? [permission] : []),
        ...(rows === 0 ? ["The namespaces that could be read hold no Cluster."] : []),
      ],
      at: undefined,
    };

    if (rows === 0) inPlaceOfRows = notice;
    else overList.push(notice);
  }

  // A refresh of the Clusters that failed: an event of the past.
  if (reads.refreshHold !== undefined) {
    const notice: Notice = {
      id: "list:refresh",
      tone: "warning",
      title: `The Clusters could not be read again, at ${TIME}`,
      messages: reads.refreshHold.failures.map((failure) => failure.message),
      lines: reads.refreshHold.failures.some((failure) => failure.refused) ? [permission] : [],
      at: reads.refreshHold.at,
    };

    if (rows === 0 && inPlaceOfRows === undefined) inPlaceOfRows = notice;
    else overList.push(notice);
  }

  for (const descriptor of context) {
    const notice = contextNotice(descriptor, kindOf(state, descriptor.key));

    if (notice !== undefined) overList.push(notice);
  }

  // A list that the host read once over the whole cluster and does not follow (P34).
  const last = reads.last;

  if (last !== undefined && last.overWholeCluster && last.failures.length === 0 && !last.followed) {
    overList.push({
      id: "list:not-followed",
      tone: "info",
      title: `This list was read once, at ${TIME}, over the whole cluster, and is not followed`,
      messages: [],
      lines: [
        "A change reaches it when the namespace filter changes or the page opens again.",
        "Freelens follows a list read over the whole cluster only for a user who may watch every resource of the core group over the whole cluster.",
        "A selection that leaves out a namespace is read and watched namespace by namespace.",
      ],
      at: last.endedAt,
    });
  }

  const failedRead = outcome.state !== "read" && outcome.state !== "loading";

  const held = reads.loadHold !== undefined || reads.refreshHold !== undefined;

  return { inPlaceOfRows, overList, notCounted: rows === 0 && (failedRead || held) };
}
