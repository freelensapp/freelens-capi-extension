import { describe, expect, it } from "vitest";
import { addressOf, parseNodeAddress, parseTreeCluster, treeParams } from "./tree-address";

// The cases of SPEC-0005, "Tests", "Unit", `tree-address.test.ts` (P2): the parameters `cluster` and `details` read
// and written; a node named by three parts and by four; and a value with an empty part, one with `.` or `..`, and one
// with five parts, each naming nothing.

describe("the parameter cluster (P2)", () => {
  it("reads <namespace>/<name>, as the parameter details of the page of the Clusters", () => {
    expect(parseTreeCluster("freelens-capi-healthy/freelens-capi-healthy")).toEqual({
      state: "cluster",
      namespace: "freelens-capi-healthy",
      name: "freelens-capi-healthy",
    });
  });

  it("names no Cluster when it is empty or absent", () => {
    expect(parseTreeCluster(undefined)).toEqual({ state: "none" });
    expect(parseTreeCluster("")).toEqual({ state: "none" });
  });

  it.each([
    ["one part", "freelens-capi-healthy"],
    ["three parts", "a/b/c"],
    ["an empty namespace", "/freelens-capi-healthy"],
    ["a namespace that is ..", "../freelens-capi-healthy"],
    ["a name that is .", "freelens-capi-healthy/."],
    ["a namespace that is no DNS-1123 label", "Freelens/freelens-capi-healthy"],
  ])("names no Cluster, as written, with %s", (_case, value) => {
    expect(parseTreeCluster(value)).toEqual({ state: "invalid", value });
  });

  it("is written by the parameters of the page, with no parameter details for the root, and with a node", () => {
    expect(treeParams("freelens-capi-healthy", "freelens-capi-healthy")).toStrictEqual({
      cluster: "freelens-capi-healthy/freelens-capi-healthy",
    });
    expect(treeParams("freelens-capi-healthy", "freelens-capi-healthy", "")).toStrictEqual({
      cluster: "freelens-capi-healthy/freelens-capi-healthy",
    });
    expect(
      treeParams("freelens-capi-healthy", "freelens-capi-healthy", "cluster.x-k8s.io/Machine/freelens-capi-healthy-a"),
    ).toEqual({
      cluster: "freelens-capi-healthy/freelens-capi-healthy",
      details: "cluster.x-k8s.io/Machine/freelens-capi-healthy-a",
    });
  });
});

describe("the parameter details (P2)", () => {
  it("names a node by its group, its kind and its name, its identity in the tree", () => {
    const value = "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq";

    expect(parseNodeAddress(value)).toEqual({
      state: "node",
      id: value,
      group: "controlplane.cluster.x-k8s.io",
      kind: "KubeadmControlPlane",
      name: "freelens-capi-healthy-d2lgq",
      namespace: undefined,
    });
    expect(addressOf("controlplane.cluster.x-k8s.io", "KubeadmControlPlane", "freelens-capi-healthy-d2lgq")).toBe(
      value,
    );
  });

  it("names the class in another namespace by four parts, its namespace before its name", () => {
    const value = "cluster.x-k8s.io/ClusterClass/freelens-capi-classes/quick-start";

    expect(parseNodeAddress(value)).toEqual({
      state: "node",
      id: value,
      group: "cluster.x-k8s.io",
      kind: "ClusterClass",
      name: "quick-start",
      namespace: "freelens-capi-classes",
    });
    expect(addressOf("cluster.x-k8s.io", "ClusterClass", "quick-start", "freelens-capi-classes")).toBe(value);
  });

  it("opens no details when it is empty or absent", () => {
    expect(parseNodeAddress(undefined)).toEqual({ state: "closed" });
    expect(parseNodeAddress("")).toEqual({ state: "closed" });
  });

  it.each([
    ["an empty part", "cluster.x-k8s.io//freelens-capi-healthy-a"],
    ["an empty last part", "cluster.x-k8s.io/Machine/"],
    ["a part that is .", "cluster.x-k8s.io/Machine/."],
    ["a part that is ..", "cluster.x-k8s.io/../Machine/freelens-capi-healthy-a"],
    ["five parts", "cluster.x-k8s.io/Machine/a/b/c"],
    ["two parts", "cluster.x-k8s.io/Machine"],
    ["one part", "freelens-capi-healthy-a"],
  ])("names no node, as written, with %s", (_case, value) => {
    expect(parseNodeAddress(value)).toEqual({ state: "invalid", value });
  });
});
