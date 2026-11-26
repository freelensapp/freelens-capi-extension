/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The fields that the rules of the status model read (SPEC-0003, "Where it lives"), as plain data. They are
// written from the schemas of Cluster API v1.14.4 (core/config/crd/bases, controlplane/kubeadm/config/crd/bases and
// bootstrap/kubeadm/config/crd/bases), from those of the Cluster API Operator v0.30.1
// (cluster-api-operator:config/crd/bases), and, for the objects of a provider, from the contracts of the book
// (docs/book/src/developer/providers/contracts). A field is optional where its schema does not require it.
//
// The host hands a view the objects of its own stores, and a rule reads their fields and calls no method (AGENTS.md,
// "CRD KubeObject Pattern"), so the model is a set of functions of the objects. No field that holds a secret is
// declared (SPEC-0001, A3 and R3.36): of the spec of a KubeadmConfig, a KubeadmControlPlane and their templates, the
// rules read the replicas and the version alone.
//
// The rules do not take these types on trust. The unit tests write values that a schema rejects, and an object
// stored before a field became required may lack it, so every field is read with a check of its type (fields.ts),
// and one of the wrong type makes the result Unknown (SPEC-0003, "States that are not the happy one").

import type { ContractVersion } from "../parsers/contract-label";
import type { ObjectStatus } from "./index";

// The object, of any kind, as the host hands it over. The model reads its kind and version first, to find its rule.
export interface KubeObjectData {
  readonly apiVersion: string;
  readonly kind: string;
  readonly metadata: ObjectMetadata;
  readonly spec?: unknown;
  readonly status?: unknown;
}

// The metadata that the rules read. The labels and the annotations are partial records, as the host types them.
export interface ObjectMetadata {
  readonly name: string;
  readonly namespace?: string;
  readonly uid?: string;
  readonly generation?: number;
  readonly creationTimestamp?: string;
  readonly deletionTimestamp?: string;
  readonly labels?: Readonly<Partial<Record<string, string>>>;
  readonly annotations?: Readonly<Partial<Record<string, string>>>;
  readonly ownerReferences?: readonly OwnerReference[];
}

// An owner, as Kubernetes writes it; the fixtures of SPEC-0002 leave out the identifiers that the API server adds.
export interface OwnerReference {
  readonly apiVersion: string;
  readonly kind: string;
  readonly name: string;
  readonly uid?: string;
  readonly controller?: boolean;
}

// Conditions

export type ConditionStatus = "True" | "False" | "Unknown";

// A condition at v1beta2, as every kind of Cluster API and of the operator writes it
// (core/config/crd/bases/cluster.x-k8s.io_clusters.yaml, status.conditions).
export interface Condition {
  readonly type: string;
  readonly status: ConditionStatus;
  readonly observedGeneration?: number;
  readonly lastTransitionTime: string;
  readonly reason: string;
  readonly message: string;
}

// A condition of the v1beta1 contract: under status.deprecated.v1beta1.conditions of a kind of Cluster API, and in
// status.conditions of an object of a provider of that contract, with its severity (SPEC-0001, R2.93 and R2.95).
export interface DeprecatedCondition {
  readonly type: string;
  readonly status: string;
  readonly severity?: string;
  readonly lastTransitionTime: string;
  readonly reason?: string;
  readonly message?: string;
}

// The deprecated part of a status of Cluster API: the conditions of v1beta1 and, on the kinds that keep them, the
// failure reason and message (SPEC-0003, P6).
export interface DeprecatedStatus {
  readonly v1beta1?: {
    readonly conditions?: readonly DeprecatedCondition[];
    readonly failureReason?: string;
    readonly failureMessage?: string;
  };
}

// A gate of the availability of a Cluster or of a ClusterClass, or of the readiness of a Machine
// (api/core/v1beta2/cluster_types.go:528-554; api/core/v1beta2/machine_types.go:535-551).
export type ConditionPolarity = "Positive" | "Negative";

export interface ConditionGate {
  readonly conditionType: string;
  readonly polarity?: ConditionPolarity;
}

// A reference to an object of a provider, by its group, kind and name (SPEC-0001, R1.15).
export interface ContractVersionedObjectReference {
  readonly apiGroup: string;
  readonly kind: string;
  readonly name: string;
}

// The version of Kubernetes that a number of replicas runs (status.versions).
export interface StatusVersion {
  readonly version: string;
  readonly replicas?: number;
}

// Cluster (core/config/crd/bases/cluster.x-k8s.io_clusters.yaml)

export type ClusterPhase = "Pending" | "Provisioning" | "Provisioned" | "Deleting" | "Failed" | "Unknown";

export interface ClusterObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "Cluster";
  readonly spec: {
    readonly paused?: boolean;
    readonly controlPlaneRef?: ContractVersionedObjectReference;
    readonly infrastructureRef?: ContractVersionedObjectReference;
    readonly topology?: {
      readonly classRef: { readonly name: string; readonly namespace?: string };
      readonly version: string;
    };
    readonly availabilityGates?: readonly ConditionGate[];
  };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly initialization?: {
      readonly infrastructureProvisioned?: boolean;
      readonly controlPlaneInitialized?: boolean;
    };
    readonly phase?: ClusterPhase;
    readonly observedGeneration?: number;
    readonly deprecated?: DeprecatedStatus;
  };
}

// ClusterClass and ExtensionConfig (cluster.x-k8s.io_clusterclasses.yaml, runtime.cluster.x-k8s.io_extensionconfigs.yaml)

export interface ClusterClassObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "ClusterClass";
  readonly spec: {
    readonly availabilityGates?: readonly ConditionGate[];
  };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly observedGeneration?: number;
  };
}

// No status.observedGeneration: the condition that sums it up carries its generation (SPEC-0001, R2.6).
export interface ExtensionConfigObject extends KubeObjectData {
  readonly apiVersion: "runtime.cluster.x-k8s.io/v1beta2";
  readonly kind: "ExtensionConfig";
  readonly status?: {
    readonly conditions?: readonly Condition[];
  };
}

// Machine (cluster.x-k8s.io_machines.yaml)

export type MachinePhase =
  | "Pending"
  | "Provisioning"
  | "Provisioned"
  | "Running"
  | "Updating"
  | "Deleting"
  | "Deleted"
  | "Failed"
  | "Unknown";

export interface MachineObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "Machine";
  readonly spec: {
    readonly clusterName: string;
    readonly version?: string;
    readonly minReadySeconds?: number;
    readonly readinessGates?: readonly ConditionGate[];
  };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly phase?: MachinePhase;
    readonly nodeRef?: { readonly name: string };
    readonly initialization?: {
      readonly bootstrapDataSecretCreated?: boolean;
      readonly infrastructureProvisioned?: boolean;
    };
    readonly deletion?: {
      readonly waitForPreDrainHookStartTime?: string;
      readonly nodeDrainStartTime?: string;
      readonly waitForNodeVolumeDetachStartTime?: string;
      readonly waitForPreTerminateHookStartTime?: string;
    };
    readonly observedGeneration?: number;
    readonly deprecated?: DeprecatedStatus;
  };
}

// MachineSet, MachineDeployment and MachinePool (cluster.x-k8s.io_machinesets.yaml,
// cluster.x-k8s.io_machinedeployments.yaml, cluster.x-k8s.io_machinepools.yaml)

// The counters that a MachineSet, a MachineDeployment, a MachinePool and a KubeadmControlPlane keep in their status.
export interface ReplicaCounters {
  readonly replicas?: number;
  readonly readyReplicas?: number;
  readonly availableReplicas?: number;
  readonly upToDateReplicas?: number;
}

export interface MachineSetObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "MachineSet";
  readonly spec: {
    readonly clusterName: string;
    readonly replicas?: number;
  };
  readonly status?: ReplicaCounters & {
    readonly conditions?: readonly Condition[];
    readonly versions?: readonly StatusVersion[];
    readonly observedGeneration?: number;
    readonly deprecated?: DeprecatedStatus;
  };
}

export type MachineDeploymentPhase = "ScalingUp" | "ScalingDown" | "Running" | "Failed" | "Unknown";

export type RolloutStrategyType = "RollingUpdate" | "OnDelete";

export interface MachineDeploymentObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "MachineDeployment";
  readonly spec: {
    readonly clusterName: string;
    readonly replicas?: number;
    readonly paused?: boolean;
    readonly rollout?: {
      readonly strategy?: {
        readonly type: RolloutStrategyType;
        readonly rollingUpdate?: {
          readonly maxSurge?: number | string;
          readonly maxUnavailable?: number | string;
        };
      };
    };
  };
  readonly status?: ReplicaCounters & {
    readonly conditions?: readonly Condition[];
    readonly phase?: MachineDeploymentPhase;
    readonly observedGeneration?: number;
  };
}

export type MachinePoolPhase =
  | "Pending"
  | "Provisioning"
  | "Provisioned"
  | "Running"
  | "ScalingUp"
  | "ScalingDown"
  | "Scaling"
  | "Deleting"
  | "Failed"
  | "Unknown";

// A MachinePool writes no condition of health at v1beta2, only `Paused`; its deprecated v1beta1 conditions hold the
// readiness that the views show with a label (SPEC-0001, R2.69; SPEC-0003, P10).
export interface MachinePoolObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "MachinePool";
  readonly spec: {
    readonly clusterName: string;
    readonly replicas?: number;
  };
  readonly status?: ReplicaCounters & {
    readonly conditions?: readonly Condition[];
    readonly phase?: MachinePoolPhase;
    readonly nodeRefs?: readonly { readonly name?: string }[];
    readonly initialization?: {
      readonly bootstrapDataSecretCreated?: boolean;
      readonly infrastructureProvisioned?: boolean;
    };
    readonly observedGeneration?: number;
    readonly deprecated?: DeprecatedStatus;
  };
}

// MachineHealthCheck (cluster.x-k8s.io_machinehealthchecks.yaml)

export interface MachineHealthCheckObject extends KubeObjectData {
  readonly apiVersion: "cluster.x-k8s.io/v1beta2";
  readonly kind: "MachineHealthCheck";
  readonly spec: {
    readonly clusterName: string;
    readonly checks?: { readonly nodeStartupTimeoutSeconds?: number };
  };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly expectedMachines?: number;
    readonly currentHealthy?: number;
    readonly remediationsAllowed?: number;
    readonly targets?: readonly string[];
    readonly observedGeneration?: number;
  };
}

// KubeadmControlPlane and KubeadmConfig (controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml,
// bootstrap.cluster.x-k8s.io_kubeadmconfigs.yaml)

export interface KubeadmControlPlaneObject extends KubeObjectData {
  readonly apiVersion: "controlplane.cluster.x-k8s.io/v1beta2";
  readonly kind: "KubeadmControlPlane";
  readonly spec: {
    readonly replicas?: number;
    readonly version: string;
  };
  readonly status?: ReplicaCounters & {
    readonly conditions?: readonly Condition[];
    readonly initialization?: { readonly controlPlaneInitialized?: boolean };
    readonly version?: string;
    readonly versions?: readonly StatusVersion[];
    readonly lastRemediation?: { readonly machine: string; readonly retryCount: number; readonly time: string };
    readonly observedGeneration?: number;
    readonly deprecated?: DeprecatedStatus;
  };
}

// No field of its spec is read.
export interface KubeadmConfigObject extends KubeObjectData {
  readonly apiVersion: "bootstrap.cluster.x-k8s.io/v1beta2";
  readonly kind: "KubeadmConfig";
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly initialization?: { readonly dataSecretCreated?: boolean };
    readonly dataSecretName?: string;
    readonly observedGeneration?: number;
    readonly deprecated?: DeprecatedStatus;
  };
}

// ClusterResourceSet and its bindings (addons.cluster.x-k8s.io_clusterresourcesets.yaml,
// addons.cluster.x-k8s.io_clusterresourcesetbindings.yaml)

export type ResourceKind = "Secret" | "ConfigMap";

export interface ClusterResourceSetObject extends KubeObjectData {
  readonly apiVersion: "addons.cluster.x-k8s.io/v1beta2";
  readonly kind: "ClusterResourceSet";
  readonly spec: {
    readonly resources: readonly { readonly kind: ResourceKind; readonly name: string }[];
  };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly observedGeneration?: number;
  };
}

// A binding has no status: what each ClusterResourceSet applied to its Cluster is in its spec (SPEC-0001, R2.85).
export interface ClusterResourceSetBindingObject extends KubeObjectData {
  readonly apiVersion: "addons.cluster.x-k8s.io/v1beta2";
  readonly kind: "ClusterResourceSetBinding";
  readonly spec: {
    readonly clusterName: string;
    readonly bindings?: readonly {
      readonly clusterResourceSetName: string;
      readonly resources?: readonly {
        readonly kind: ResourceKind;
        readonly name: string;
        readonly applied: boolean;
        readonly lastAppliedTime?: string;
      }[];
    }[];
  };
}

// IPAddressClaim (ipam.cluster.x-k8s.io_ipaddressclaims.yaml). No status.observedGeneration (SPEC-0001, R2.6).
export interface IPAddressClaimObject extends KubeObjectData {
  readonly apiVersion: "ipam.cluster.x-k8s.io/v1beta2";
  readonly kind: "IPAddressClaim";
  readonly spec: {
    readonly clusterName?: string;
    readonly poolRef: ContractVersionedObjectReference;
  };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly addressRef?: { readonly name: string };
  };
}

// The seven kinds of the operator (cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_coreproviders.yaml,
// and the six others of the same shape).

export type OperatorKind =
  | "CoreProvider"
  | "BootstrapProvider"
  | "ControlPlaneProvider"
  | "InfrastructureProvider"
  | "AddonProvider"
  | "IPAMProvider"
  | "RuntimeExtensionProvider";

export interface OperatorProviderObject extends KubeObjectData {
  readonly apiVersion: "operator.cluster.x-k8s.io/v1alpha2";
  readonly kind: OperatorKind;
  readonly spec?: { readonly version?: string };
  readonly status?: {
    readonly conditions?: readonly Condition[];
    readonly installedVersion?: string;
    readonly contract?: string;
    readonly observedGeneration?: number;
  };
}

// An object of a provider, whose kind is known only at run time (SPEC-0001, R1.15): the fields that the contracts of
// the book name. Its conditions are in status.v1beta2.conditions while it moves to the v1beta2 contract, else in
// status.conditions (SPEC-0001, R2.93; SPEC-0003, P15), and the fields that say it is ready follow its contract
// (SPEC-0003, P17).
export interface ProviderObject extends KubeObjectData {
  readonly spec?: { readonly version?: string; readonly replicas?: number };
  readonly status?: ReplicaCounters & {
    readonly conditions?: readonly (Condition | DeprecatedCondition)[];
    readonly v1beta2?: { readonly conditions?: readonly Condition[] };
    readonly initialization?: {
      readonly provisioned?: boolean;
      readonly controlPlaneInitialized?: boolean;
      readonly dataSecretCreated?: boolean;
    };
    readonly ready?: boolean;
    readonly initialized?: boolean;
    readonly version?: string;
    readonly versions?: readonly StatusVersion[];
    readonly observedGeneration?: number;
  };
}

// The role of an object of a provider, from the reference that names it (SPEC-0001, R1.15; SPEC-0003, P15): the
// view knows it from the object it followed the reference from. A template of a provider has no status (P16).
export type ProviderRole =
  | "infrastructure-cluster"
  | "control-plane"
  | "infrastructure-machine"
  | "bootstrap-config"
  | "infrastructure-machine-pool"
  | "ipam-pool"
  | "remediation-request"
  | "template";

// The context

// The availability of the controller of a provider, as the view reads it from the `Ready` of the object of the
// Cluster API Operator for that provider, which copies the `Available` of the Deployment of the controller
// (SPEC-0003, P24; SPEC-0001, R2.88).
export interface ControllerAvailability {
  // The status of that `Ready`: `unknown` for `Unknown` or any other status.
  readonly available: boolean | "unknown";
  // Its `lastTransitionTime`, as written: the time of the last change.
  readonly since?: string;
}

// A binding of the namespace of a ClusterResourceSet, with the Cluster it names, for the first provisioning and the
// probe of that Cluster, which the tone of the ClusterResourceSet reads (D2).
export interface BindingInput {
  readonly binding: ClusterResourceSetBindingObject;
  readonly cluster?: ClusterObject;
}

// What a rule needs beyond the object (SPEC-0003, "What it takes and returns"). An input that a rule needs and that
// the view did not give is never assumed: the result notes what was not read, and the rule goes on with what it has.
export interface StatusContext {
  // The time of the evaluation, in milliseconds since the Unix epoch. The model never reads the clock.
  readonly now: number;
  // The Cluster of the object: its pause, its creation and first provisioning, and its probe of the workload cluster.
  readonly cluster?: ClusterObject;
  // The MachineHealthChecks of the namespace, for the threshold of a Machine (D2).
  readonly healthChecks?: readonly MachineHealthCheckObject[];
  // The Machines of the object, found by the owner reference, never by a label whose value can be a hash: those it
  // controls, for a MachineSet, a MachinePool and a KubeadmControlPlane; those of its MachineSets, for a
  // MachineDeployment; those labelled with its name, for a Cluster; those that its `status.targets` names, for a
  // MachineHealthCheck; the one that owns it, for a bootstrap config or an infrastructure machine.
  readonly machines?: readonly MachineObject[];
  // For a Cluster: the result of `statusOf` for its control plane, when it has one, and for each MachineDeployment.
  readonly parts?: {
    readonly controlPlane?: ObjectStatus;
    readonly machineDeployments: readonly ObjectStatus[];
  };
  // For a Cluster: the result of `statusOf` for each of its MachinePools (H1).
  readonly machinePools?: readonly ObjectStatus[];
  // For a Cluster whose `spec.availabilityGates` is unset: its class, whose gates then apply (SPEC-0001, R2.21).
  readonly clusterClass?: ClusterClassObject;
  // For a ClusterResourceSet: the bindings of its namespace, each with its Cluster.
  readonly bindings?: readonly BindingInput[];
  // For an object of a provider: the role that the reference naming it gives, and the contract of its definition.
  readonly role?: ProviderRole;
  readonly contract?: ContractVersion;
  // For an object of a provider and an IPAddressClaim: the manifest label of the provider that serves it, the label
  // `cluster.x-k8s.io/provider` of its definition, or of that of its pool (P24).
  readonly provider?: string;
  // The availability of the controller of each provider, by its manifest label (P24).
  readonly controllers?: Readonly<Record<string, ControllerAvailability>>;
}
