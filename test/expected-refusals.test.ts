// The refusals and the throttling that a session expects, with no app (SPEC-0004, P23, P29, "Notes and deviations"):
// which 403 and which 429 that Chromium reports the error collector leaves out, and which refusals a step waited for
// and never saw; and which refusals of a request for lack of resources are of a module of Freelens dev (SPEC-0005,
// "Notes and deviations").

import { describe, expect, it } from "vitest";
import {
  isExpectedRefusal,
  isExpectedThrottling,
  isRefusedModuleLoad,
  refusalsNotSeen,
} from "../integration/__tests__/expected-refusals";

import type { ExpectedRefusal, ExpectedThrottling, FailedResponse } from "../integration/__tests__/expected-refusals";

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

describe("the throttling that a session expects", () => {
  const SVELTOS: ExpectedThrottling[] = [{ frameHost: FRAME, groupSuffix: ".projectsveltos.io" }];
  const lists = (path: string) => `https://${FRAME}/api-kube${path}`;

  // A 429 of a GET of a list of the Sveltos extension, from the frame of the cluster.
  function throttled(change: Partial<FailedResponse> = {}): FailedResponse {
    return {
      status: "429",
      url: lists("/apis/config.projectsveltos.io/v1beta1/clusterconfigurations"),
      methods: ["GET"],
      page: "/extension/freelensapp--sveltos-extension/sveltos-clusters",
      ...change,
    };
  }

  it("leaves out the 429 of a GET of a group of the other extension, a list or a watch, from the frame, on any page", () => {
    expect(isExpectedThrottling(SVELTOS, throttled())).toBe(true);
    expect(
      isExpectedThrottling(
        SVELTOS,
        throttled({ url: lists("/apis/lib.projectsveltos.io/v1beta1/sveltosclusters?watch=1&resourceVersion=12") }),
      ),
    ).toBe(true);
    expect(isExpectedThrottling(SVELTOS, throttled({ page: PAGE }))).toBe(true);
  });

  it("counts a 429 of a group that this view reads, whatever the expectation, and of any other group", () => {
    const wide: ExpectedThrottling[] = [{ frameHost: FRAME, groupSuffix: ".io" }];

    expect(isExpectedThrottling(wide, throttled({ url: lists("/apis/cluster.x-k8s.io/v1beta2/clusters") }))).toBe(
      false,
    );
    expect(
      isExpectedThrottling(
        wide,
        throttled({ url: lists("/apis/infrastructure.cluster.x-k8s.io/v1beta2/namespaces/default/devclusters") }),
      ),
    ).toBe(false);
    expect(
      isExpectedThrottling(
        [{ frameHost: FRAME, groupSuffix: ".k8s.io" }],
        throttled({ url: lists("/apis/apiextensions.k8s.io/v1/customresourcedefinitions") }),
      ),
    ).toBe(false);
    expect(isExpectedThrottling(SVELTOS, throttled({ url: lists("/apis/cluster.x-k8s.io/v1beta2/clusters") }))).toBe(
      false,
    );
    expect(isExpectedThrottling(SVELTOS, throttled({ url: lists("/api/v1/namespaces") }))).toBe(false);
    expect(
      isExpectedThrottling(SVELTOS, throttled({ url: lists("/apis/apps/v1/namespaces/default/deployments") })),
    ).toBe(false);
  });

  it("counts every answer but a 429, a request that was not a GET alone, another frame, and an address outside the API", () => {
    expect(isExpectedThrottling(SVELTOS, throttled({ status: "403" }))).toBe(false);
    expect(isExpectedThrottling(SVELTOS, throttled({ methods: ["POST"] }))).toBe(false);
    expect(isExpectedThrottling(SVELTOS, throttled({ methods: [] }))).toBe(false);
    expect(
      isExpectedThrottling(
        SVELTOS,
        throttled({
          url: "https://ffff0000.renderer.freelens.app:9081/api-kube/apis/config.projectsveltos.io/v1beta1/clusterconfigurations",
        }),
      ),
    ).toBe(false);
    expect(
      isExpectedThrottling(
        SVELTOS,
        throttled({ url: `https://${FRAME}/apis/config.projectsveltos.io/v1beta1/clusterconfigurations` }),
      ),
    ).toBe(false);
  });
});

describe("the requests of the modules of Freelens dev that Chromium refuses for lack of resources", () => {
  const refusal = "Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES";
  const module = (path: string) => `https://${FRAME}${path}`;

  it("are the refusals of a module that the dev server serves, as a load of the frame of a cluster met them in CI", () => {
    expect(
      isRefusedModuleLoad(
        refusal,
        module("/@fs/home/runner/work/x/freelens/packages/core/src/renderer/themes/active.injectable.ts"),
      ),
    ).toBe(true);
    expect(isRefusedModuleLoad(refusal, module("/@id/__x00__freelens-runtime-external:node:assert"))).toBe(true);
    expect(isRefusedModuleLoad(refusal, module("/@vite/client"))).toBe(true);
    expect(isRefusedModuleLoad(refusal, module("/node_modules/.vite/deps/react.js?v=0a1b2c3d"))).toBe(true);
  });

  it("count a refusal of another request, another failure of a module, and a message with no address", () => {
    expect(isRefusedModuleLoad(refusal, module("/api-kube/apis/cluster.x-k8s.io/v1beta2/clusters"))).toBe(false);
    expect(isRefusedModuleLoad(refusal, module("/extension/freelensapp--capi-extension/renderer.js"))).toBe(false);
    expect(
      isRefusedModuleLoad(
        "Failed to load resource: the server responded with a status of 502 (Bad Gateway)",
        module("/@fs/home/runner/work/x/freelens/packages/core/src/renderer/themes/active.injectable.ts"),
      ),
    ).toBe(false);
    expect(isRefusedModuleLoad(refusal, "")).toBe(false);
  });
});
