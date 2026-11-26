/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The models of the kinds that the views read only as the context of the status model (SPEC-0004, P1), and of the
// kinds that the tree of a Cluster adds (SPEC-0005, P6): the parts and the Machines of a Cluster, its
// MachineHealthChecks and its ClusterClass, the seven kinds of the Cluster API Operator, and, for the tree, the
// KubeadmConfigs and their templates, the ClusterResourceSets and their bindings, the IPAddressClaims and the
// IPAddresses. Each has the `static` metadata of the pattern (AGENTS.md, "CRD KubeObject Pattern"), through which the
// store that the host keeps for it is reached, and, as its spec and its status, the plain-data types of the status
// model for the fields that its rules read (SPEC-0003, "Where it lives"), and the fields that the tree follows, written
// from the schemas of the release (SPEC-0005, P6), and nothing else: no view reads another field of these kinds, and
// the specs of a KubeadmControlPlane and of a KubeadmConfig hold fields that SPEC-0001, A3 never reads, which a model
// never types. The whole types of each come with the spec of its own view, in M2, which replaces them.
//
// None of them is in `customResources`: they have no page, and there they would leave the Custom Resources tree of
// the host with nothing in their place (AGENTS.md, "CRD KubeObject Pattern").

import { Renderer } from "@freelensapp/extensions";

import type {
  ClusterClassObject,
  ClusterResourceSetBindingObject,
  ClusterResourceSetObject,
  IPAddressClaimObject,
  KubeadmConfigObject,
  KubeadmControlPlaneObject,
  MachineDeploymentObject,
  MachineHealthCheckObject,
  MachineObject,
  MachinePoolObject,
  MachineSetObject,
  OperatorProviderObject,
} from "../../../common/status/index";
import type {
  ContractVersionedObjectReference,
  LabelSelector,
  MachineHealthCheckRemediationTemplateReference,
  MachineSpec,
  MachineTemplateSpec,
} from "../types";

type Metadata = Renderer.K8sApi.NamespaceScopedMetadata;
type CRD = Renderer.K8sApi.LensExtensionKubeObjectCRD;

// The status of a kind, as the status model types it; the object has none until a controller writes one.
type StatusOf<T extends { readonly status?: unknown }> = NonNullable<T["status"]>;

// The spec of a kind of which the models type no field: those of a KubeadmConfig and of its template hold the fields
// that SPEC-0001, A3 never reads (R3.35, R3.36).
type NoFields = Readonly<Record<never, never>>;

// The spec of a Machine: the fields of the status model, and those that the tree follows (SPEC-0005, P6).
type MachineModelSpec = MachineObject["spec"] & MachineSpec;

export class Machine extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineObject>,
  MachineModelSpec
> {
  declare kind: "Machine";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "Machine";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/machines";

  static readonly crd: CRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "machines",
    singular: "machine",
    shortNames: ["ma"],
  };
}

export class MachineApi extends Renderer.K8sApi.KubeApi<Machine> {}
export class MachineStore extends Renderer.K8sApi.KubeObjectStore<Machine, MachineApi> {}

// The spec of a MachineSet, a MachineDeployment and a MachinePool: the fields of the status model, and the template of
// their Machines, of which the tree follows the references and the version (SPEC-0005, P6;
// api/core/v1beta2/machineset_types.go:100; api/core/v1beta2/machinedeployment_types.go:277;
// api/core/v1beta2/machinepool_types.go:82).
interface WithTemplate {
  template: MachineTemplateSpec;
}

export class MachineSet extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineSetObject>,
  MachineSetObject["spec"] & WithTemplate
> {
  declare kind: "MachineSet";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "MachineSet";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/machinesets";

  static readonly crd: CRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "machinesets",
    singular: "machineset",
    shortNames: ["ms"],
  };
}

export class MachineSetApi extends Renderer.K8sApi.KubeApi<MachineSet> {}
export class MachineSetStore extends Renderer.K8sApi.KubeObjectStore<MachineSet, MachineSetApi> {}

export class MachineDeployment extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineDeploymentObject>,
  MachineDeploymentObject["spec"] & WithTemplate
> {
  declare kind: "MachineDeployment";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "MachineDeployment";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/machinedeployments";

  static readonly crd: CRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "machinedeployments",
    singular: "machinedeployment",
    shortNames: ["md"],
  };
}

export class MachineDeploymentApi extends Renderer.K8sApi.KubeApi<MachineDeployment> {}
export class MachineDeploymentStore extends Renderer.K8sApi.KubeObjectStore<MachineDeployment, MachineDeploymentApi> {}

export class MachinePool extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachinePoolObject>,
  MachinePoolObject["spec"] & WithTemplate
> {
  declare kind: "MachinePool";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "MachinePool";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/machinepools";

  static readonly crd: CRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "machinepools",
    singular: "machinepool",
    shortNames: ["mp"],
  };
}

export class MachinePoolApi extends Renderer.K8sApi.KubeApi<MachinePool> {}
export class MachinePoolStore extends Renderer.K8sApi.KubeObjectStore<MachinePool, MachinePoolApi> {}

// The template of the Machines of a KubeadmControlPlane, of which the tree follows the reference to the template of its
// infrastructure machines, the field of the contract of a control plane at v1beta2 (SPEC-0005, P6;
// api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:459, 482-503).
export interface KubeadmControlPlaneMachineTemplate {
  spec: KubeadmControlPlaneMachineTemplateSpec;
}

export interface KubeadmControlPlaneMachineTemplateSpec {
  infrastructureRef: ContractVersionedObjectReference;
}

// Of the spec, the replicas, the version and the reference to the template of its Machines alone, none of them a field
// of R3.36 (SPEC-0001, A3; SPEC-0005, P6).
export class KubeadmControlPlane extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<KubeadmControlPlaneObject>,
  KubeadmControlPlaneObject["spec"] & { machineTemplate: KubeadmControlPlaneMachineTemplate }
> {
  declare kind: "KubeadmControlPlane";
  declare apiVersion: "controlplane.cluster.x-k8s.io/v1beta2";

  static readonly kind = "KubeadmControlPlane";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/controlplane.cluster.x-k8s.io/v1beta2/kubeadmcontrolplanes";

  static readonly crd: CRD = {
    apiVersions: ["controlplane.cluster.x-k8s.io/v1beta2"],
    plural: "kubeadmcontrolplanes",
    singular: "kubeadmcontrolplane",
    shortNames: ["kcp"],
  };
}

export class KubeadmControlPlaneApi extends Renderer.K8sApi.KubeApi<KubeadmControlPlane> {}
export class KubeadmControlPlaneStore extends Renderer.K8sApi.KubeObjectStore<
  KubeadmControlPlane,
  KubeadmControlPlaneApi
> {}

// The remediation of a MachineHealthCheck, of which the details name the template of its remediation requests
// (SPEC-0005, P6, P8; api/core/v1beta2/machinehealthcheck_types.go:83, 128-142, 169-194).
export interface MachineHealthCheckRemediation {
  templateRef?: MachineHealthCheckRemediationTemplateReference;
}

export class MachineHealthCheck extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineHealthCheckObject>,
  MachineHealthCheckObject["spec"] & { remediation?: MachineHealthCheckRemediation }
> {
  declare kind: "MachineHealthCheck";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "MachineHealthCheck";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/machinehealthchecks";

  static readonly crd: CRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "machinehealthchecks",
    singular: "machinehealthcheck",
    shortNames: ["mhc", "mhcs"],
  };
}

export class MachineHealthCheckApi extends Renderer.K8sApi.KubeApi<MachineHealthCheck> {}
export class MachineHealthCheckStore extends Renderer.K8sApi.KubeObjectStore<
  MachineHealthCheck,
  MachineHealthCheckApi
> {}

// A ClusterClass types the fields that its rule of SPEC-0003 reads alone: neither its variables nor its patches, whose
// schemas and definitions can carry the fields that SPEC-0001, A3 never shows; one function of the views reads them,
// for their names alone, and the check of Safety finds their names in no other module of the view (SPEC-0005, P20,
// "Safety"; api/core/v1beta2/clusterclass_types.go:128, 137).
export class ClusterClass extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<ClusterClassObject>,
  ClusterClassObject["spec"]
> {
  declare kind: "ClusterClass";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "ClusterClass";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/clusterclasses";

  static readonly crd: CRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "clusterclasses",
    singular: "clusterclass",
    shortNames: ["cc"],
  };
}

export class ClusterClassApi extends Renderer.K8sApi.KubeApi<ClusterClass> {}
export class ClusterClassStore extends Renderer.K8sApi.KubeObjectStore<ClusterClass, ClusterClassApi> {}

// The seven kinds of the Cluster API Operator, at v1alpha2 (cluster-api-operator:config/crd/bases), all of one shape:
// the `Ready` of each gives the availability of the controller of its provider (SPEC-0003, P24).
type OperatorStatus = StatusOf<OperatorProviderObject>;
type OperatorSpec = NonNullable<OperatorProviderObject["spec"]>;

export class CoreProvider extends Renderer.K8sApi.LensExtensionKubeObject<Metadata, OperatorStatus, OperatorSpec> {
  declare kind: "CoreProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "CoreProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/coreproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "coreproviders",
    singular: "coreprovider",
    shortNames: ["cacp"],
  };
}

export class CoreProviderApi extends Renderer.K8sApi.KubeApi<CoreProvider> {}
export class CoreProviderStore extends Renderer.K8sApi.KubeObjectStore<CoreProvider, CoreProviderApi> {}

export class BootstrapProvider extends Renderer.K8sApi.LensExtensionKubeObject<Metadata, OperatorStatus, OperatorSpec> {
  declare kind: "BootstrapProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "BootstrapProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/bootstrapproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "bootstrapproviders",
    singular: "bootstrapprovider",
    shortNames: ["cabp"],
  };
}

export class BootstrapProviderApi extends Renderer.K8sApi.KubeApi<BootstrapProvider> {}
export class BootstrapProviderStore extends Renderer.K8sApi.KubeObjectStore<BootstrapProvider, BootstrapProviderApi> {}

export class ControlPlaneProvider extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  OperatorStatus,
  OperatorSpec
> {
  declare kind: "ControlPlaneProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "ControlPlaneProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/controlplaneproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "controlplaneproviders",
    singular: "controlplaneprovider",
    shortNames: ["cacpp"],
  };
}

export class ControlPlaneProviderApi extends Renderer.K8sApi.KubeApi<ControlPlaneProvider> {}
export class ControlPlaneProviderStore extends Renderer.K8sApi.KubeObjectStore<
  ControlPlaneProvider,
  ControlPlaneProviderApi
> {}

export class InfrastructureProvider extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  OperatorStatus,
  OperatorSpec
> {
  declare kind: "InfrastructureProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "InfrastructureProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/infrastructureproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "infrastructureproviders",
    singular: "infrastructureprovider",
    shortNames: ["caip"],
  };
}

export class InfrastructureProviderApi extends Renderer.K8sApi.KubeApi<InfrastructureProvider> {}
export class InfrastructureProviderStore extends Renderer.K8sApi.KubeObjectStore<
  InfrastructureProvider,
  InfrastructureProviderApi
> {}

export class AddonProvider extends Renderer.K8sApi.LensExtensionKubeObject<Metadata, OperatorStatus, OperatorSpec> {
  declare kind: "AddonProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "AddonProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/addonproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "addonproviders",
    singular: "addonprovider",
    shortNames: ["caap"],
  };
}

export class AddonProviderApi extends Renderer.K8sApi.KubeApi<AddonProvider> {}
export class AddonProviderStore extends Renderer.K8sApi.KubeObjectStore<AddonProvider, AddonProviderApi> {}

export class IPAMProvider extends Renderer.K8sApi.LensExtensionKubeObject<Metadata, OperatorStatus, OperatorSpec> {
  declare kind: "IPAMProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "IPAMProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/ipamproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "ipamproviders",
    singular: "ipamprovider",
    shortNames: ["caipamp"],
  };
}

export class IPAMProviderApi extends Renderer.K8sApi.KubeApi<IPAMProvider> {}
export class IPAMProviderStore extends Renderer.K8sApi.KubeObjectStore<IPAMProvider, IPAMProviderApi> {}

export class RuntimeExtensionProvider extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  OperatorStatus,
  OperatorSpec
> {
  declare kind: "RuntimeExtensionProvider";
  declare apiVersion: "operator.cluster.x-k8s.io/v1alpha2";

  static readonly kind = "RuntimeExtensionProvider";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/operator.cluster.x-k8s.io/v1alpha2/runtimeextensionproviders";

  static readonly crd: CRD = {
    apiVersions: ["operator.cluster.x-k8s.io/v1alpha2"],
    plural: "runtimeextensionproviders",
    singular: "runtimeextensionprovider",
    shortNames: ["carep"],
  };
}

export class RuntimeExtensionProviderApi extends Renderer.K8sApi.KubeApi<RuntimeExtensionProvider> {}
export class RuntimeExtensionProviderStore extends Renderer.K8sApi.KubeObjectStore<
  RuntimeExtensionProvider,
  RuntimeExtensionProviderApi
> {}

// The kinds that the tree of a Cluster adds (SPEC-0005, P6), at v1beta2 (bootstrap/kubeadm/config/crd/bases and
// core/config/crd/bases): their definitions name no short name.

// No field of its spec, which holds the fields of R3.36 (SPEC-0001, A3).
export class KubeadmConfig extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<KubeadmConfigObject>,
  NoFields
> {
  declare kind: "KubeadmConfig";
  declare apiVersion: "bootstrap.cluster.x-k8s.io/v1beta2";

  static readonly kind = "KubeadmConfig";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/bootstrap.cluster.x-k8s.io/v1beta2/kubeadmconfigs";

  static readonly crd: CRD = {
    apiVersions: ["bootstrap.cluster.x-k8s.io/v1beta2"],
    plural: "kubeadmconfigs",
    singular: "kubeadmconfig",
  };
}

export class KubeadmConfigApi extends Renderer.K8sApi.KubeApi<KubeadmConfig> {}
export class KubeadmConfigStore extends Renderer.K8sApi.KubeObjectStore<KubeadmConfig, KubeadmConfigApi> {}

// A template has no status (SPEC-0003, P16), and no field of its spec is typed, for the reason of a KubeadmConfig.
export class KubeadmConfigTemplate extends Renderer.K8sApi.LensExtensionKubeObject<Metadata, never, NoFields> {
  declare kind: "KubeadmConfigTemplate";
  declare apiVersion: "bootstrap.cluster.x-k8s.io/v1beta2";

  static readonly kind = "KubeadmConfigTemplate";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/bootstrap.cluster.x-k8s.io/v1beta2/kubeadmconfigtemplates";

  static readonly crd: CRD = {
    apiVersions: ["bootstrap.cluster.x-k8s.io/v1beta2"],
    plural: "kubeadmconfigtemplates",
    singular: "kubeadmconfigtemplate",
  };
}

export class KubeadmConfigTemplateApi extends Renderer.K8sApi.KubeApi<KubeadmConfigTemplate> {}
export class KubeadmConfigTemplateStore extends Renderer.K8sApi.KubeObjectStore<
  KubeadmConfigTemplate,
  KubeadmConfigTemplateApi
> {}

// The spec: the resources of the status model, and the selector of its Clusters, which the tree reads as its controller
// does (SPEC-0005, P7; api/addons/v1beta2/clusterresourceset_types.go:61).
export class ClusterResourceSet extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<ClusterResourceSetObject>,
  ClusterResourceSetObject["spec"] & { clusterSelector: LabelSelector }
> {
  declare kind: "ClusterResourceSet";
  declare apiVersion: "addons.cluster.x-k8s.io/v1beta2";

  static readonly kind = "ClusterResourceSet";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/addons.cluster.x-k8s.io/v1beta2/clusterresourcesets";

  static readonly crd: CRD = {
    apiVersions: ["addons.cluster.x-k8s.io/v1beta2"],
    plural: "clusterresourcesets",
    singular: "clusterresourceset",
  };
}

export class ClusterResourceSetApi extends Renderer.K8sApi.KubeApi<ClusterResourceSet> {}
export class ClusterResourceSetStore extends Renderer.K8sApi.KubeObjectStore<
  ClusterResourceSet,
  ClusterResourceSetApi
> {}

// A binding has no status: what each ClusterResourceSet applied to its Cluster is in its spec (SPEC-0001, R2.85).
export class ClusterResourceSetBinding extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  never,
  ClusterResourceSetBindingObject["spec"]
> {
  declare kind: "ClusterResourceSetBinding";
  declare apiVersion: "addons.cluster.x-k8s.io/v1beta2";

  static readonly kind = "ClusterResourceSetBinding";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/addons.cluster.x-k8s.io/v1beta2/clusterresourcesetbindings";

  static readonly crd: CRD = {
    apiVersions: ["addons.cluster.x-k8s.io/v1beta2"],
    plural: "clusterresourcesetbindings",
    singular: "clusterresourcesetbinding",
  };
}

export class ClusterResourceSetBindingApi extends Renderer.K8sApi.KubeApi<ClusterResourceSetBinding> {}
export class ClusterResourceSetBindingStore extends Renderer.K8sApi.KubeObjectStore<
  ClusterResourceSetBinding,
  ClusterResourceSetBindingApi
> {}

// The spec of the status model: the Cluster that a claim names, and its pool (api/ipam/v1beta2/ipaddressclaim_types.go:44-53).
export class IPAddressClaim extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<IPAddressClaimObject>,
  IPAddressClaimObject["spec"]
> {
  declare kind: "IPAddressClaim";
  declare apiVersion: "ipam.cluster.x-k8s.io/v1beta2";

  static readonly kind = "IPAddressClaim";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/ipam.cluster.x-k8s.io/v1beta2/ipaddressclaims";

  static readonly crd: CRD = {
    apiVersions: ["ipam.cluster.x-k8s.io/v1beta2"],
    plural: "ipaddressclaims",
    singular: "ipaddressclaim",
  };
}

export class IPAddressClaimApi extends Renderer.K8sApi.KubeApi<IPAddressClaim> {}
export class IPAddressClaimStore extends Renderer.K8sApi.KubeObjectStore<IPAddressClaim, IPAddressClaimApi> {}

// The spec of an IPAddress, which has no status (SPEC-0001, R3.18; api/ipam/v1beta2/ipaddress_types.go:24-87): its
// claim, its pool, the address, its prefix and its gateway.
export interface IPAddressSpec {
  claimRef: IPAddressClaimReference;
  poolRef: IPPoolReference;
  address: string;
  prefix: number;
  gateway?: string;
}

export interface IPAddressClaimReference {
  name: string;
}

export interface IPPoolReference {
  name: string;
  kind: string;
  apiGroup: string;
}

export class IPAddress extends Renderer.K8sApi.LensExtensionKubeObject<Metadata, never, IPAddressSpec> {
  declare kind: "IPAddress";
  declare apiVersion: "ipam.cluster.x-k8s.io/v1beta2";

  static readonly kind = "IPAddress";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/ipam.cluster.x-k8s.io/v1beta2/ipaddresses";

  static readonly crd: CRD = {
    apiVersions: ["ipam.cluster.x-k8s.io/v1beta2"],
    plural: "ipaddresses",
    singular: "ipaddress",
  };
}

export class IPAddressApi extends Renderer.K8sApi.KubeApi<IPAddress> {}
export class IPAddressStore extends Renderer.K8sApi.KubeObjectStore<IPAddress, IPAddressApi> {}

// The models of the context, in the order in which "What the view reads" of SPEC-0004 lists them.
export const CONTEXT_MODELS = [
  Machine,
  MachineSet,
  MachineDeployment,
  MachinePool,
  KubeadmControlPlane,
  MachineHealthCheck,
  ClusterClass,
  CoreProvider,
  BootstrapProvider,
  ControlPlaneProvider,
  InfrastructureProvider,
  AddonProvider,
  IPAMProvider,
  RuntimeExtensionProvider,
] as const;

export type ContextModel = (typeof CONTEXT_MODELS)[number];

// The kinds of the operator, whose objects give `controllers` (SPEC-0003, P24; SPEC-0004, P2).
export const OPERATOR_MODELS = [
  CoreProvider,
  BootstrapProvider,
  ControlPlaneProvider,
  InfrastructureProvider,
  AddonProvider,
  IPAMProvider,
  RuntimeExtensionProvider,
] as const;

// The kinds that the tree adds, in the order in which "What the tree reads" of SPEC-0005 lists them (P6).
export const TREE_MODELS = [
  KubeadmConfig,
  KubeadmConfigTemplate,
  ClusterResourceSet,
  ClusterResourceSetBinding,
  IPAddressClaim,
  IPAddress,
] as const;
