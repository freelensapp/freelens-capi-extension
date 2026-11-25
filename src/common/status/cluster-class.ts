/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rules of a ClusterClass and of an ExtensionConfig (SPEC-0003, "The rule of each kind", ClusterClass and
// ExtensionConfig; SPEC-0001, R2.33 to R2.37).
//
// - ClusterClass: `VariablesReady`, which the topology controller and the webhook of Cluster require, sums it up,
//   and it is Degraded from `RefVersionsUpToDate` (R2.33, R2.34). An older generation is a mark, which says that the
//   topology of its Clusters is not reconciled until the class is: the project counts such a class as not
//   reconciled, and its Clusters carry the failure in their own health (P8).
// - ExtensionConfig: `Discovered` sums it up, and nothing makes it Degraded (R2.37). It writes no status while
//   `RuntimeSDK` is off, while the registry warms up or while its CA cannot be injected, and `Discovered` keeps its
//   last value meanwhile, which nothing marks, since the feature gates are not read (A10). The generation of
//   `Discovered` marks a change of its spec not yet observed.
//
// Both honour only their own annotation of pause (P19; SPEC-0001, R2.3).

import { summaryHealth } from "./health";

import type { HealthInput, HealthOutcome, KindRule } from "./health";

function clusterClassHealth(input: HealthInput): HealthOutcome {
  return {
    health: summaryHealth(input.conditions, "VariablesReady", (type) => type === "RefVersionsUpToDate"),
    notes: [],
  };
}

function extensionConfigHealth(input: HealthInput): HealthOutcome {
  return { health: summaryHealth(input.conditions, "Discovered", () => false), notes: [] };
}

export const CLUSTER_CLASS_RULE: KindRule = {
  kind: "ClusterClass",
  apiVersion: "cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["VariablesReady"],
  provider: "cluster-api",
  pause: "object",
  observedGeneration: "status",
  followsWorkloadCluster: false,
  holdsTopologies: true,
  deprecatedFailure: false,
  health: clusterClassHealth,
};

// The status of an ExtensionConfig keeps no generation: the condition that sums it up carries its own (SPEC-0001,
// R2.6).
export const EXTENSION_CONFIG_RULE: KindRule = {
  kind: "ExtensionConfig",
  apiVersion: "runtime.cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Discovered"],
  provider: "cluster-api",
  pause: "object",
  observedGeneration: "summary",
  followsWorkloadCluster: false,
  deprecatedFailure: false,
  health: extensionConfigHealth,
};
