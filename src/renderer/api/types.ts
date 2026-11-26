/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The types that the models of the kinds of Cluster API share (AGENTS.md, "Adding an API"), written from the Go types
// of Cluster API v1.14.4, `api/core/v1beta2/`, and from the schemas of its definitions, which settle what each field
// requires. A field is optional where the schema does not require it, and an enumeration of the schema is a union of
// its values.

import type { Renderer } from "@freelensapp/extensions";

// The `crd` of a model that has a page: the fields of the host, and the title of the page (SPEC-0004, P4).
export interface ClusterApiKubeObjectCRD extends Renderer.K8sApi.LensExtensionKubeObjectCRD {
  title: string;
}

// A condition at v1beta2, as every kind of Cluster API writes it (metav1.Condition;
// core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:3501-3561).
export type ConditionStatus = "True" | "False" | "Unknown";

export interface Condition {
  type: string;
  status: ConditionStatus;
  observedGeneration?: number;
  lastTransitionTime: string;
  reason: string;
  message: string;
}

// A condition of v1beta1, which the deprecated part of a status keeps (api/core/v1beta2/condition_types.go:56-98). Its
// severity has no enumeration in the schema.
export interface V1Beta1Condition {
  type: string;
  status: string;
  severity?: string;
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

// The polarity of a condition that a gate names (api/core/v1beta2/cluster_types.go:524-536).
export type ConditionPolarity = "Positive" | "Negative";

// A reference to an object of a provider, by its group, kind and name; its version is the one that the contract
// label of the definition of its kind gives (api/core/v1beta2/common_types.go:391-417).
export interface ContractVersionedObjectReference {
  kind: string;
  name: string;
  apiGroup: string;
}

// The version of Kubernetes that a number of Machines runs, and a version of an upgrade plan
// (api/core/v1beta2/common_types.go:271-291).
export interface StatusVersion {
  version: string;
  replicas?: number;
}

export interface StatusUpgradePlanVersion {
  version: string;
}

// The labels and annotations that a topology gives the objects it makes (api/core/v1beta2/common_types.go:361-375).
export interface ObjectMeta {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

// A taint that Cluster API keeps on the Nodes of its Machines (api/core/v1beta2/common_types.go:436-489).
export type TaintEffect = "NoSchedule" | "PreferNoSchedule" | "NoExecute";

export type MachineTaintPropagation = "Always" | "OnInitialization";

export interface MachineTaint {
  key: string;
  value?: string;
  effect: TaintEffect;
  propagation: MachineTaintPropagation;
}

// A condition of a Machine counted in its readiness (api/core/v1beta2/machine_types.go:535-551).
export interface MachineReadinessGate {
  conditionType: string;
  polarity?: ConditionPolarity;
}

// The conditions after which a health check takes a Node or a Machine for unhealthy, and the template of its
// remediation (api/core/v1beta2/machinehealthcheck_types.go:169-262). The status of a condition of a Node has no
// enumeration in the schema; that of a condition of a Machine has.
export interface UnhealthyNodeCondition {
  type: string;
  status: string;
  timeoutSeconds: number;
}

export interface UnhealthyMachineCondition {
  type: string;
  status: ConditionStatus;
  timeoutSeconds: number;
}

export interface MachineHealthCheckRemediationTemplateReference {
  kind: string;
  name: string;
  apiVersion: string;
}

// A number or a percentage, as Kubernetes writes an `IntOrString`.
export type IntOrString = number | string;

// The order in which a MachineSet deletes its Machines, and the strategy of the rollout of a MachineDeployment
// (api/core/v1beta2/machineset_types.go:275; api/core/v1beta2/machinedeployment_types.go:36).
export type MachineSetDeletionOrder = "Random" | "Newest" | "Oldest";

export type MachineDeploymentRolloutStrategyType = "RollingUpdate" | "OnDelete";
