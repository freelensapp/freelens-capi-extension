import { describe, expect, it } from "vitest";
import { availabilityOf } from "./availability";

// The four cases of SPEC-0004, P20, before the list: from the store of definitions of the host and the versions at which
// the host registered an API of Clusters, from the definitions or from the discovery of the cluster.

describe("whether the page can list the Clusters (P20)", () => {
  it("is checking while the store of definitions has neither loaded nor failed and no API is registered", () => {
    expect(availabilityOf({ definitions: "loading", hasClusterDefinition: false, clusterVersions: [] })).toEqual({
      state: "checking",
    });
  });

  it("is not installed once the store has loaded with no definition of Clusters", () => {
    expect(availabilityOf({ definitions: "loaded", hasClusterDefinition: false, clusterVersions: [] })).toEqual({
      state: "not-installed",
    });
  });

  it("is an older Cluster API for a definition that serves v1beta1 alone", () => {
    expect(availabilityOf({ definitions: "loaded", hasClusterDefinition: true, clusterVersions: ["v1beta1"] })).toEqual(
      {
        state: "older",
        versions: ["v1beta1"],
      },
    );
  });

  it("is the list once an API of Clusters is registered at v1beta2, whatever else is", () => {
    expect(
      availabilityOf({ definitions: "loaded", hasClusterDefinition: true, clusterVersions: ["v1beta1", "v1beta2"] }),
    ).toEqual({ state: "list" });
    expect(
      availabilityOf({ definitions: "loading", hasClusterDefinition: false, clusterVersions: ["v1beta2"] }),
    ).toEqual({
      state: "list",
    });
  });

  it("reads the discovery when the definitions are refused: the list, an older Cluster API, or not installed", () => {
    expect(
      availabilityOf({ definitions: "failed", hasClusterDefinition: false, clusterVersions: ["v1beta2"] }),
    ).toEqual({
      state: "list",
    });
    expect(
      availabilityOf({ definitions: "failed", hasClusterDefinition: false, clusterVersions: ["v1beta1"] }),
    ).toEqual({
      state: "older",
      versions: ["v1beta1"],
    });
    expect(availabilityOf({ definitions: "failed", hasClusterDefinition: false, clusterVersions: [] })).toEqual({
      state: "not-installed",
    });
  });

  it("is still checking while the store holds the definition and the host has not registered its API yet", () => {
    expect(availabilityOf({ definitions: "loaded", hasClusterDefinition: true, clusterVersions: [] })).toEqual({
      state: "checking",
    });
  });
});
