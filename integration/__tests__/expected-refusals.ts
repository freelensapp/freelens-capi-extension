/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The refusals that a session expects, and whether a response that Chromium reports as a failure is one of them
// (SPEC-0004, P23, "Notes and deviations"), as pure data and a function, which their unit test checks with no app.
// The error collector of the sessions, in `extension-helpers.ts`, leaves out of the errors the refusals that a step
// expects, and counts every other. Its name does not match `*.tests.ts`, so Vitest does not collect it as a session.

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
