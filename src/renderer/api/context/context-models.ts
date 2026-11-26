/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The models of the kinds that the view of Clusters reads only as the context of the status model (SPEC-0004, P1):
// the parts and the Machines of a Cluster, its MachineHealthChecks and its ClusterClass, and the seven kinds of the
// Cluster API Operator. Each has the `static` metadata of the pattern (AGENTS.md, "CRD KubeObject Pattern"), through
// which the store that the host keeps for it is reached, and, as its spec and its status, the plain-data types of the
// status model for the fields that its rules read (SPEC-0003, "Where it lives"), and nothing else: no view reads
// another field of these kinds, and the spec of a KubeadmControlPlane holds fields that SPEC-0001, A3 never reads. The
// whole types of each come with the spec of its own view, in M2, which replaces them.
//
// None of them is in `customResources`: they have no page, and there they would leave the Custom Resources tree of
// the host with nothing in their place (AGENTS.md, "CRD KubeObject Pattern").

import { Renderer } from "@freelensapp/extensions";

import type {
  ClusterClassObject,
  KubeadmControlPlaneObject,
  MachineDeploymentObject,
  MachineHealthCheckObject,
  MachineObject,
  MachinePoolObject,
  MachineSetObject,
  OperatorProviderObject,
} from "../../../common/status/index";

type Metadata = Renderer.K8sApi.NamespaceScopedMetadata;
type CRD = Renderer.K8sApi.LensExtensionKubeObjectCRD;

// The status of a kind, as the status model types it; the object has none until a controller writes one.
type StatusOf<T extends { readonly status?: unknown }> = NonNullable<T["status"]>;

export class Machine extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineObject>,
  MachineObject["spec"]
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

export class MachineSet extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineSetObject>,
  MachineSetObject["spec"]
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
  MachineDeploymentObject["spec"]
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
  MachinePoolObject["spec"]
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

// Of the spec, the replicas and the version alone (SPEC-0001, A3 and R3.36).
export class KubeadmControlPlane extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<KubeadmControlPlaneObject>,
  KubeadmControlPlaneObject["spec"]
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

export class MachineHealthCheck extends Renderer.K8sApi.LensExtensionKubeObject<
  Metadata,
  StatusOf<MachineHealthCheckObject>,
  MachineHealthCheckObject["spec"]
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
