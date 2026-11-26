// The refusals that a session expects, with no app (SPEC-0004, P23, "Notes and deviations"): which 403 that Chromium
// reports the error collector leaves out, and which refusals a step waited for and never saw.

import { describe, expect, it } from "vitest";
import { isExpectedRefusal, refusalsNotSeen } from "../integration/__tests__/expected-refusals";

import type { ExpectedRefusal, FailedResponse } from "../integration/__tests__/expected-refusals";

const FRAME = "0123abcd.renderer.freelens.app:9081";
const PAGE = "/extension/freelensapp--capi-extension/clusters";
const LIST = "/apis/cluster.x-k8s.io/v1beta2/namespaces/freelens-capi-paused/clusters";
const DEFINITIONS = "/apis/apiextensions.k8s.io/v1/customresourcedefinitions";

const EXPECTED: ExpectedRefusal[] = [
  { frameHost: FRAME, page: PAGE, path: LIST },
  { frameHost: FRAME, path: DEFINITIONS },
];

// A 403 of a GET of the list of the Clusters of paused, from the frame of the identity, on the page of the Clusters.
function refused(change: Partial<FailedResponse> = {}): FailedResponse {
  return { status: "403", url: `https://${FRAME}/api-kube${LIST}`, methods: ["GET"], page: PAGE, ...change };
}

describe("the refusals that a session expects", () => {
  it("leaves out the 403 of a GET of a list that a step expects, from its frame and on its page, with its query", () => {
    expect(isExpectedRefusal(EXPECTED, refused())).toBe(true);
    expect(isExpectedRefusal(EXPECTED, refused({ url: `https://${FRAME}/api-kube${LIST}?limit=500` }))).toBe(true);
  });

  it("leaves out a refusal that names no page whatever page the frame shows, the list of the definitions that the host sends as the frame starts", () => {
    const definitions = `https://${FRAME}/api-kube${DEFINITIONS}`;

    expect(isExpectedRefusal(EXPECTED, refused({ url: definitions, page: "/workloads" }))).toBe(true);
    expect(isExpectedRefusal(EXPECTED, refused({ url: definitions, page: undefined }))).toBe(true);
  });

  it("counts a refusal on another page, from another frame, or at another path", () => {
    expect(isExpectedRefusal(EXPECTED, refused({ page: "/workloads" }))).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ page: undefined }))).toBe(false);
    expect(
      isExpectedRefusal(EXPECTED, refused({ url: `https://ffff0000.renderer.freelens.app:9081/api-kube${LIST}` })),
    ).toBe(false);
    expect(
      isExpectedRefusal(
        EXPECTED,
        refused({
          url: `https://${FRAME}/api-kube/apis/cluster.x-k8s.io/v1beta2/namespaces/freelens-capi-paused/machines`,
        }),
      ),
    ).toBe(false);
  });

  it("counts every answer but a 403, a watch, and a request outside the API of the cluster", () => {
    expect(isExpectedRefusal(EXPECTED, refused({ status: "404" }))).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ status: "500" }))).toBe(false);
    expect(
      isExpectedRefusal(EXPECTED, refused({ url: `https://${FRAME}/api-kube${LIST}?watch=1&resourceVersion=4021` })),
    ).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ url: `https://${FRAME}${LIST}` }))).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ url: "not an address" }))).toBe(false);
  });

  it("counts the refusal of a request that was not a GET alone, or that the renderer was not seen to send", () => {
    expect(isExpectedRefusal(EXPECTED, refused({ methods: ["POST"] }))).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ methods: ["GET", "DELETE"] }))).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ methods: [] }))).toBe(false);
    expect(isExpectedRefusal(EXPECTED, refused({ methods: ["GET", "GET"] }))).toBe(true);
  });

  it("gives the refusals that a step waited for and never saw, by their paths", () => {
    const leftOut = [`403 https://${FRAME}/api-kube${LIST}?limit=500`];

    expect(refusalsNotSeen([LIST, DEFINITIONS], leftOut)).toEqual([DEFINITIONS]);
    expect(refusalsNotSeen([LIST], leftOut)).toEqual([]);
    expect(refusalsNotSeen([LIST], [])).toEqual([LIST]);
  });
});
