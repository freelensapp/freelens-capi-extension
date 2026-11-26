import { describe, expect, it } from "vitest";
import { detailsAddressOf, parseDetailsAddress } from "./details-address";

// The parameter `details` of the page of the Clusters (SPEC-0004, P6): `<namespace>/<name>` of the Cluster whose details
// are open, and a value that is not a namespace, a DNS-1123 label, and a name, a DNS-1123 subdomain, joined by one `/`
// names no Cluster, as written.

describe("the address of the details of a Cluster (P6)", () => {
  it("is closed when the parameter is empty or not there", () => {
    expect(parseDetailsAddress("")).toEqual({ state: "closed" });
    expect(parseDetailsAddress(undefined)).toEqual({ state: "closed" });
  });

  it("names a Cluster by its namespace and its name, joined by one slash", () => {
    expect(parseDetailsAddress("freelens-capi-healthy/freelens-capi-healthy")).toEqual({
      state: "cluster",
      namespace: "freelens-capi-healthy",
      name: "freelens-capi-healthy",
    });
    expect(detailsAddressOf("freelens-capi-healthy", "freelens-capi-healthy")).toBe(
      "freelens-capi-healthy/freelens-capi-healthy",
    );
  });

  it.each([
    ["a-name-alone"],
    ["a/b/c"],
    ["/a-name"],
    ["a-namespace/"],
    ["/"],
    ["a//b"],
    // Dot segments, which the host would join into the path of its requests as they are, reading over the whole
    // cluster or elsewhere.
    ["../x"],
    ["./x"],
    ["x/.."],
    ["x/."],
    // Not a DNS-1123 label as a namespace, or not a DNS-1123 subdomain as a name.
    ["a b/x"],
    ["Upper/x"],
    ["-a/x"],
    ["a.b/x"],
    [`${"a".repeat(64)}/x`],
    ["a/x_y"],
    ["a/x."],
  ])("names no Cluster with %s, kept as written", (value) => {
    expect(parseDetailsAddress(value)).toEqual({ state: "invalid", value });
  });

  it("takes a name of several labels, as a subdomain", () => {
    expect(parseDetailsAddress("a-namespace/a.name-2")).toEqual({
      state: "cluster",
      namespace: "a-namespace",
      name: "a.name-2",
    });
  });
});
