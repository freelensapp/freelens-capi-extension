/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rules of a KubeadmControlPlane and of a KubeadmConfig, with their templates, which have no status (SPEC-0003,
// "The rule of each kind", KubeadmControlPlane and KubeadmConfig; SPEC-0001, R2.74 to R2.83 and H1).
//
// - KubeadmControlPlane: it has no `Ready` (R2.79). `Available` sums it up, and it is Degraded from
//   `EtcdClusterHealthy`, `ControlPlaneComponentsHealthy`, `MachinesReady`, `Initialized` and `CertificatesAvailable`,
//   and from a condition of a third party (H1); `MachinesUpToDate` is no issue (P4). With external etcd,
//   `EtcdClusterHealthy` can stay `Unknown`, which changes nothing (R2.80). Before it is initialized its `Available` is
//   `False`, so it reads Unhealthy, as the project says (R2.78). Its checks of etcd and of the components go `False`
//   while a Machine joins or leaves, also for an etcd member that has no Machine yet, which the project calls an error
//   since it cannot tell a member that starts from one that does not: it then reads Degraded, as the project reports it
//   (D1).
// - KubeadmConfig: `Ready` sums it up, and only a condition of a third party makes it Degraded: its other two
//   conditions are the inputs of `Ready` (R2.83, H1). Its `DataSecretAvailable` is `False` `NotAvailable` both while it
//   waits for the infrastructure or the control plane and when its data cannot be built, which only the message tells
//   apart, so it reads Unhealthy while it waits, as the project says.
//
// No field of their specs but the replicas and the version is read (SPEC-0001, A3 and R3.36).

import { allButInputs, everyOtherCondition, noStatusRule, summaryHealth } from "./health";

import type { HealthInput, HealthOutcome, KindRule } from "./health";

// Of the conditions of a KubeadmControlPlane, a closed set (SPEC-0001, R2.78), `Available` merges none: each other
// condition of positive polarity is one that its table names, `MachinesUpToDate` of P4, or one of a third party.
function kubeadmControlPlaneHealth(input: HealthInput): HealthOutcome {
  return { health: summaryHealth(input.conditions, "Available", everyOtherCondition), notes: [] };
}

// The `Ready` of a KubeadmConfig merges its two other conditions (SPEC-0001, R2.83), which count only through it.
const READY_INPUTS: readonly string[] = ["DataSecretAvailable", "CertificatesAvailable"];

function kubeadmConfigHealth(input: HealthInput): HealthOutcome {
  return { health: summaryHealth(input.conditions, "Ready", allButInputs(READY_INPUTS)), notes: [] };
}

// A KubeadmControlPlane has no phase (controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml).
export const KUBEADM_CONTROL_PLANE_RULE: KindRule = {
  kind: "KubeadmControlPlane",
  apiVersion: "controlplane.cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Available"],
  provider: "control-plane-kubeadm",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: true,
  deprecatedFailure: true,
  health: kubeadmControlPlaneHealth,
};

export const KUBEADM_CONFIG_RULE: KindRule = {
  kind: "KubeadmConfig",
  apiVersion: "bootstrap.cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Ready"],
  provider: "bootstrap-kubeadm",
  pause: "object-or-cluster",
  observedGeneration: "status",
  followsWorkloadCluster: false,
  deprecatedFailure: true,
  health: kubeadmConfigHealth,
};

export const KUBEADM_CONTROL_PLANE_TEMPLATE_RULE: KindRule = noStatusRule(
  "KubeadmControlPlaneTemplate",
  "controlplane.cluster.x-k8s.io/v1beta2",
);

export const KUBEADM_CONFIG_TEMPLATE_RULE: KindRule = noStatusRule(
  "KubeadmConfigTemplate",
  "bootstrap.cluster.x-k8s.io/v1beta2",
);
