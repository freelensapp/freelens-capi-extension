/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The model of a Cluster of Cluster API at v1beta2 (SPEC-0004, "The model of a Cluster"), with its types, written from
// the Go types of Cluster API v1.14.4, `api/core/v1beta2/cluster_types.go`, one interface for each struct, the fields
// under their JSON names, optional where the schema of the definition does not require them
// (core/config/crd/bases/cluster.x-k8s.io_clusters.yaml). The name `Cluster` stays inside this module and the modules
// that import it: the host exports a model of the same name, for another group.
//
// The variables of a topology and of its parts are the one exception: the types leave them out, `variables` and the
// `overrides` of a part, since what a variable is set to can carry the fields that SPEC-0001, A3 never shows and
// whatever a user writes there; one function of the views reads them, for their names alone, and the check of Safety
// finds their names in no other module of the view, read or declared (SPEC-0005, "Notes and deviations", the names of
// the variables and of the patches).
//
// The host hands the extension objects of its own store, instances of its `KubeObject`, so the class has no method of
// its own (AGENTS.md, "CRD KubeObject Pattern"). The status of a Cluster is the status model's (SPEC-0003): the views
// read it through `statusOf` and `conditionsOf`, never from these fields alone.

import { Renderer } from "@freelensapp/extensions";

import type {
  ClusterApiKubeObjectCRD,
  Condition,
  ConditionPolarity,
  ContractVersionedObjectReference,
  IntOrString,
  MachineDeploymentRolloutStrategyType,
  MachineHealthCheckRemediationTemplateReference,
  MachineReadinessGate,
  MachineSetDeletionOrder,
  MachineTaint,
  ObjectMeta,
  StatusUpgradePlanVersion,
  StatusVersion,
  UnhealthyMachineCondition,
  UnhealthyNodeCondition,
  V1Beta1Condition,
} from "../types";

// The spec (api/core/v1beta2/cluster_types.go:481-521). The schema requires at least one of its fields.
export interface ClusterSpec {
  paused?: boolean;
  clusterNetwork?: ClusterNetwork;
  controlPlaneEndpoint?: APIEndpoint;
  controlPlaneRef?: ContractVersionedObjectReference;
  infrastructureRef?: ContractVersionedObjectReference;
  topology?: Topology;
  availabilityGates?: ClusterAvailabilityGate[];
}

// A condition that counts in the availability of the Cluster (api/core/v1beta2/cluster_types.go:538-555).
export interface ClusterAvailabilityGate {
  conditionType: string;
  polarity?: ConditionPolarity;
}

// The managed topology of a Cluster (api/core/v1beta2/cluster_types.go:558-616).
export interface Topology {
  classRef: ClusterClassRef;
  version: string;
  controlPlane?: ControlPlaneTopology;
  workers?: WorkersTopology;
}

export interface ClusterClassRef {
  name: string;
  namespace?: string;
}

// The control plane of a topology (api/core/v1beta2/cluster_types.go:620-855). This view reads its replicas alone.
export interface ControlPlaneTopology {
  metadata?: ObjectMeta;
  replicas?: number;
  rollout?: ControlPlaneTopologyRolloutSpec;
  healthCheck?: ControlPlaneTopologyHealthCheck;
  deletion?: ControlPlaneTopologyMachineDeletionSpec;
  taints?: MachineTaint[];
  readinessGates?: MachineReadinessGate[];
}

export interface ControlPlaneTopologyRolloutSpec {
  after?: string;
}

export interface ControlPlaneTopologyHealthCheck {
  enabled?: boolean;
  checks?: ControlPlaneTopologyHealthCheckChecks;
  remediation?: ControlPlaneTopologyHealthCheckRemediation;
}

export interface ControlPlaneTopologyHealthCheckChecks {
  nodeStartupTimeoutSeconds?: number;
  unhealthyNodeConditions?: UnhealthyNodeCondition[];
  unhealthyMachineConditions?: UnhealthyMachineCondition[];
}

export interface ControlPlaneTopologyHealthCheckRemediation {
  triggerIf?: ControlPlaneTopologyHealthCheckRemediationTriggerIf;
  templateRef?: MachineHealthCheckRemediationTemplateReference;
}

export interface ControlPlaneTopologyHealthCheckRemediationTriggerIf {
  unhealthyLessThanOrEqualTo?: IntOrString;
  unhealthyInRange?: string;
}

export interface ControlPlaneTopologyMachineDeletionSpec {
  nodeDrainTimeoutSeconds?: number;
  nodeVolumeDetachTimeoutSeconds?: number;
  nodeDeletionTimeoutSeconds?: number;
}

// The workers of a topology (api/core/v1beta2/cluster_types.go:859-1299). This view reads the class, the name and the
// replicas of each.
export interface WorkersTopology {
  machineDeployments?: MachineDeploymentTopology[];
  machinePools?: MachinePoolTopology[];
}

export interface MachineDeploymentTopology {
  metadata?: ObjectMeta;
  class: string;
  name: string;
  failureDomain?: string;
  replicas?: number;
  healthCheck?: MachineDeploymentTopologyHealthCheck;
  deletion?: MachineDeploymentTopologyMachineDeletionSpec;
  taints?: MachineTaint[];
  minReadySeconds?: number;
  readinessGates?: MachineReadinessGate[];
  rollout?: MachineDeploymentTopologyRolloutSpec;
}

export interface MachineDeploymentTopologyHealthCheck {
  enabled?: boolean;
  checks?: MachineDeploymentTopologyHealthCheckChecks;
  remediation?: MachineDeploymentTopologyHealthCheckRemediation;
}

export interface MachineDeploymentTopologyHealthCheckChecks {
  nodeStartupTimeoutSeconds?: number;
  unhealthyNodeConditions?: UnhealthyNodeCondition[];
  unhealthyMachineConditions?: UnhealthyMachineCondition[];
}

export interface MachineDeploymentTopologyHealthCheckRemediation {
  maxInFlight?: IntOrString;
  triggerIf?: MachineDeploymentTopologyHealthCheckRemediationTriggerIf;
  templateRef?: MachineHealthCheckRemediationTemplateReference;
}

export interface MachineDeploymentTopologyHealthCheckRemediationTriggerIf {
  unhealthyLessThanOrEqualTo?: IntOrString;
  unhealthyInRange?: string;
}

export interface MachineDeploymentTopologyMachineDeletionSpec {
  order?: MachineSetDeletionOrder;
  nodeDrainTimeoutSeconds?: number;
  nodeVolumeDetachTimeoutSeconds?: number;
  nodeDeletionTimeoutSeconds?: number;
}

export interface MachineDeploymentTopologyRolloutSpec {
  after?: string;
  strategy?: MachineDeploymentTopologyRolloutStrategy;
}

export interface MachineDeploymentTopologyRolloutStrategy {
  type: MachineDeploymentRolloutStrategyType;
  rollingUpdate?: MachineDeploymentTopologyRolloutStrategyRollingUpdate;
}

export interface MachineDeploymentTopologyRolloutStrategyRollingUpdate {
  maxUnavailable?: IntOrString;
  maxSurge?: IntOrString;
}

export interface MachinePoolTopology {
  metadata?: ObjectMeta;
  class: string;
  name: string;
  failureDomains?: string[];
  deletion?: MachinePoolTopologyMachineDeletionSpec;
  taints?: MachineTaint[];
  minReadySeconds?: number;
  replicas?: number;
}

export interface MachinePoolTopologyMachineDeletionSpec {
  nodeDrainTimeoutSeconds?: number;
  nodeVolumeDetachTimeoutSeconds?: number;
  nodeDeletionTimeoutSeconds?: number;
}

// The network of the workload cluster (api/core/v1beta2/cluster_types.go:1384-1417).
export interface ClusterNetwork {
  apiServerPort?: number;
  services?: NetworkRanges;
  pods?: NetworkRanges;
  serviceDomain?: string;
}

export interface NetworkRanges {
  cidrBlocks: string[];
}

// The endpoint of the control plane, which a controller writes (api/core/v1beta2/cluster_types.go:1644-1656).
export interface APIEndpoint {
  host?: string;
  port?: number;
}

// The phase, which no software should take for the state of the Cluster
// (api/core/v1beta2/cluster_phase_types.go:19-61).
export type ClusterPhase = "Pending" | "Provisioning" | "Provisioned" | "Deleting" | "Failed" | "Unknown";

// The status (api/core/v1beta2/cluster_types.go:1428-1531).
export interface ClusterStatus {
  conditions?: Condition[];
  initialization?: ClusterInitializationStatus;
  controlPlane?: ClusterControlPlaneStatus;
  workers?: WorkersStatus;
  failureDomains?: FailureDomain[];
  phase?: ClusterPhase;
  observedGeneration?: number;
  deprecated?: ClusterDeprecatedStatus;
}

export interface ClusterInitializationStatus {
  infrastructureProvisioned?: boolean;
  controlPlaneInitialized?: boolean;
}

export interface ClusterDeprecatedStatus {
  v1beta1?: ClusterV1Beta1DeprecatedStatus;
}

// What the status keeps of v1beta1: the failure reason and message, which the details show with the label
// "deprecated" (SPEC-0001, A5), and the conditions of v1beta1, which no view reads (SPEC-0001, A2).
export interface ClusterV1Beta1DeprecatedStatus {
  conditions?: V1Beta1Condition[];
  failureReason?: string;
  failureMessage?: string;
}

// The counters of the control plane and of the workers, which the Cluster sums from its parts
// (api/core/v1beta2/cluster_types.go:1534-1619). The upgrade plans are left to SPEC-0012.
export interface ClusterControlPlaneStatus {
  desiredReplicas?: number;
  replicas?: number;
  upToDateReplicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  versions?: StatusVersion[];
  upgradePlan?: StatusUpgradePlanVersion[];
}

export interface WorkersStatus {
  desiredReplicas?: number;
  replicas?: number;
  upToDateReplicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  versions?: StatusVersion[];
  upgradePlan?: StatusUpgradePlanVersion[];
}

// A failure domain of the infrastructure (api/core/v1beta2/cluster_types.go:1768-1782).
export interface FailureDomain {
  name: string;
  controlPlane?: boolean;
  attributes?: Record<string, string>;
}

export class Cluster extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.NamespaceScopedMetadata,
  ClusterStatus,
  ClusterSpec
> {
  declare kind: "Cluster";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "Cluster";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/clusters";

  static readonly crd: ClusterApiKubeObjectCRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "clusters",
    singular: "cluster",
    shortNames: ["cl"],
    title: "Workload Clusters",
  };
}

// The list of the page is typed with this API, and it reads the store that the host keeps for Clusters at v1beta2,
// through `Cluster.getStore()`. The store class is built by the page once in the frame of a cluster, for the context
// of that frame alone (SPEC-0004, P34), and never loaded, registered or subscribed.
export class ClusterApi extends Renderer.K8sApi.KubeApi<Cluster> {}
export class ClusterStore extends Renderer.K8sApi.KubeObjectStore<Cluster, ClusterApi> {}
