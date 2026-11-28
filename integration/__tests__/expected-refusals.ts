/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The refusals and the throttling that a session expects, and whether a response that Chromium reports as a failure is
// one of them (SPEC-0004, P23, P29, "Notes and deviations"), and the requests of the modules of Freelens dev that
// Chromium refuses for lack of resources (SPEC-0005, "Notes and deviations"), as pure data and functions, which their
// unit test checks with no app. The error collector of the sessions, in `extension-helpers.ts`, leaves out of the errors
// what a step expects, and counts every other. Its name does not match `*.tests.ts`, so Vitest does not collect it as a
// session.

// The prefix under which a frame of a cluster sends the requests of the API of the cluster, on its own origin
// (freelens:packages/core/src/common/vars.ts:16).
export const API_KUBE_PREFIX = "/api-kube";

/**
 * A refusal that a session expects: the 403 of a GET of the API of a cluster, a list or a get and never a watch, at
 * one path, sent by the frame of one cluster while that frame shows one page, as Playwright last saw its address, or
 * whatever page it shows when the expectation names none.
 */
export interface ExpectedRefusal {
  /** The host of the frame of the cluster, `<id>.renderer.freelens.app` with its port. */
  readonly frameHost: string;
  /** The path of the page that the frame shows, without its query; any page when it is not given. */
  readonly page?: string;
  /** The path of the request in the API of the cluster, such as `/apis/cluster.x-k8s.io/v1beta2/clusters`. */
  readonly path: string;
}

/** A response that Chromium reported as a failure, as the error collector knows it when the message arrives. */
export interface FailedResponse {
  /** The status that the message gives, such as `403`. */
  readonly status: string;
  /** The address of the request, which is the location of the message. */
  readonly url: string;
  /** The methods of the requests that the renderer sent to that address, which Playwright reports before the answer. */
  readonly methods: readonly string[];
  /** The path of the page that the frame of that address showed, as Playwright last saw it, if it found the frame. */
  readonly page: string | undefined;
}

/**
 * Whether a failed response is a refusal that one of the expectations names: a 403 of the API of a cluster, under
 * its prefix, to requests that were all GETs, and never a watch, at the path, from the frame, and on the page that an
 * expectation names, or on any page when it names none.
 */
export function isExpectedRefusal(expected: readonly ExpectedRefusal[], response: FailedResponse): boolean {
  if (response.status !== "403" || !URL.canParse(response.url)) {
    return false;
  }
  if (response.methods.length === 0 || response.methods.some((method) => method !== "GET")) {
    return false;
  }

  const request = new URL(response.url);

  if (request.searchParams.has("watch")) {
    return false;
  }

  // The path in the API of the cluster, under its prefix; an address outside it has none.
  const path = request.pathname.startsWith(`${API_KUBE_PREFIX}/`)
    ? request.pathname.slice(API_KUBE_PREFIX.length)
    : undefined;

  return expected.some(
    (refusal) =>
      refusal.frameHost === request.host &&
      refusal.path === path &&
      (refusal.page === undefined || refusal.page === response.page),
  );
}

/**
 * A throttling that a session expects: the 429 of a GET that another extension sends to the groups of its own kinds,
 * whose names end with `groupSuffix`, such as `.projectsveltos.io`, from the frame of one cluster.
 */
export interface ExpectedThrottling {
  /** The host of the frame of the cluster, `<id>.renderer.freelens.app` with its port. */
  readonly frameHost: string;
  /** The end of the names of the groups, such as `.projectsveltos.io`. */
  readonly groupSuffix: string;
}

// The groups that this view reads, whose throttling is never left out, whatever a session expects: those of Cluster
// API and of its providers, `cluster.x-k8s.io` and its subgroups, and that of the definitions.
const VIEW_GROUPS = /^(?:(?:.+\.)?cluster\.x-k8s\.io|apiextensions\.k8s\.io)$/;

/**
 * Whether a failed response is a throttling that one of the expectations names: a 429 of the API of a cluster, under
 * its prefix, to requests that were all GETs, at the path of a group whose name ends as the expectation says and that
 * this view does not read, from the frame that the expectation names.
 */
export function isExpectedThrottling(expected: readonly ExpectedThrottling[], response: FailedResponse): boolean {
  if (response.status !== "429" || !URL.canParse(response.url)) {
    return false;
  }
  if (response.methods.length === 0 || response.methods.some((method) => method !== "GET")) {
    return false;
  }

  const request = new URL(response.url);
  const group = new RegExp(`^${API_KUBE_PREFIX}/apis/([^/]+)/`).exec(request.pathname)?.[1];

  return (
    group !== undefined &&
    !VIEW_GROUPS.test(group) &&
    expected.some((throttling) => throttling.frameHost === request.host && group.endsWith(throttling.groupSuffix))
  );
}

// Chromium refuses a request with `net::ERR_INSUFFICIENT_RESOURCES`, which it logs as "Failed to load resource", when the
// renderer that sends it holds as many requests at once as Chromium lets one process hold. A frame of a cluster in
// Freelens dev loads each module of the renderer as a request of its own, from the dev server, under `/@fs/`, `/@id/`,
// `/@vite/` and `/node_modules/`, thousands of them, so a load of the frame can meet that limit, and the frame
// then does not start (SPEC-0005, "Notes and deviations").
const insufficientResourcesPattern = /^Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES$/;
const devServerModulePattern = /^\/(?:@fs|@id|@vite|node_modules)\//;

/**
 * Whether a message of the console is the refusal of a request of a module of the dev server for lack of resources:
 * its text, and its location a module that the dev server serves, never a request of the API of a cluster.
 */
export function isRefusedModuleLoad(text: string, url: string): boolean {
  return (
    insufficientResourcesPattern.test(text.trim()) &&
    URL.canParse(url) &&
    devServerModulePattern.test(new URL(url).pathname)
  );
}

/**
 * The expected refusals that never arrived: those whose path no refusal left out reached, each left out as its status
 * and its address, as the error collector keeps them. A step checks with it that the refusals that it waits for came,
 * so that a refusal that it expects is never one that the host stopped sending.
 */
export function refusalsNotSeen(paths: readonly string[], leftOut: readonly string[]): string[] {
  const seen = new Set(
    leftOut.flatMap((entry) => {
      const url = entry.slice(entry.indexOf(" ") + 1);

      return URL.canParse(url) ? [new URL(url).pathname.slice(API_KUBE_PREFIX.length)] : [];
    }),
  );

  return paths.filter((path) => !seen.has(path));
}
