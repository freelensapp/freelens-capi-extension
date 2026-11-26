/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Whether the page of the Clusters can list them (SPEC-0004, P20), from what the host has registered and from its
// store of definitions, never from a read of its own. The host registers an API of a kind for every version that its
// definition serves, or, when the user may not list the definitions, for every version that the discovery of the
// cluster lists; and its store of definitions says whether it has loaded or failed. Looking an API up in its registry
// sends no request, so the page never requests `v1beta1` (SPEC-0001, A3).

// The definition of Clusters, by its name, and the version that this extension reads (SPEC-0001, A2).
export const CLUSTER_DEFINITION = "clusters.cluster.x-k8s.io";
export const CLUSTER_GROUP = "cluster.x-k8s.io";
export const CLUSTER_VERSION = "v1beta2";

export interface AvailabilityInputs {
  // The state of the store of definitions of the host.
  readonly definitions: "loading" | "loaded" | "failed";
  // Whether that store holds the definition of Clusters.
  readonly hasClusterDefinition: boolean;
  // The versions of the group of Cluster API at which the host has registered an API of Clusters.
  readonly clusterVersions: readonly string[];
}

export type Availability =
  // The host has not loaded its definitions, and has registered no API of Clusters at v1beta2 yet.
  | { readonly state: "checking" }
  // The cluster serves no Cluster of Cluster API.
  | { readonly state: "not-installed" }
  // The cluster serves Clusters at other versions alone, which this extension does not read.
  | { readonly state: "older"; readonly versions: readonly string[] }
  | { readonly state: "list" };

export function availabilityOf(inputs: AvailabilityInputs): Availability {
  const { definitions, hasClusterDefinition, clusterVersions } = inputs;

  if (clusterVersions.includes(CLUSTER_VERSION)) return { state: "list" };
  if (clusterVersions.length > 0) return { state: "older", versions: [...clusterVersions].sort() };
  if (definitions === "failed") return { state: "not-installed" };
  // The host registers the APIs of a definition as its store holds it: until then, the page is still checking.
  if (definitions === "loading" || hasClusterDefinition) return { state: "checking" };
  return { state: "not-installed" };
}
