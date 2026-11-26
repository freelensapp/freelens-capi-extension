import { describe, expect, it } from "vitest";
import {
  AddonProvider,
  BootstrapProvider,
  ClusterClass,
  CONTEXT_MODELS,
  ControlPlaneProvider,
  CoreProvider,
  InfrastructureProvider,
  IPAMProvider,
  KubeadmControlPlane,
  Machine,
  MachineDeployment,
  MachineHealthCheck,
  MachinePool,
  MachineSet,
  RuntimeExtensionProvider,
} from "./context-models";

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

// The cases of SPEC-0004, "Tests", "Unit", `context-models.test.ts`: the models of the kinds that the view reads as the
// context of the status model (P1), with the metadata of their definitions at Cluster API v1.14.4 and the Cluster API
// Operator v0.30.1.

describe("the models of the context (P1)", () => {
  it.each([
    [Machine, "Machine", "cluster.x-k8s.io/v1beta2", "/apis/cluster.x-k8s.io/v1beta2/machines"],
    [MachineSet, "MachineSet", "cluster.x-k8s.io/v1beta2", "/apis/cluster.x-k8s.io/v1beta2/machinesets"],
    [
      MachineDeployment,
      "MachineDeployment",
      "cluster.x-k8s.io/v1beta2",
      "/apis/cluster.x-k8s.io/v1beta2/machinedeployments",
    ],
    [MachinePool, "MachinePool", "cluster.x-k8s.io/v1beta2", "/apis/cluster.x-k8s.io/v1beta2/machinepools"],
    [
      KubeadmControlPlane,
      "KubeadmControlPlane",
      "controlplane.cluster.x-k8s.io/v1beta2",
      "/apis/controlplane.cluster.x-k8s.io/v1beta2/kubeadmcontrolplanes",
    ],
    [
      MachineHealthCheck,
      "MachineHealthCheck",
      "cluster.x-k8s.io/v1beta2",
      "/apis/cluster.x-k8s.io/v1beta2/machinehealthchecks",
    ],
    [ClusterClass, "ClusterClass", "cluster.x-k8s.io/v1beta2", "/apis/cluster.x-k8s.io/v1beta2/clusterclasses"],
    [
      CoreProvider,
      "CoreProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/coreproviders",
    ],
    [
      BootstrapProvider,
      "BootstrapProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/bootstrapproviders",
    ],
    [
      ControlPlaneProvider,
      "ControlPlaneProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/controlplaneproviders",
    ],
    [
      InfrastructureProvider,
      "InfrastructureProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/infrastructureproviders",
    ],
    [
      AddonProvider,
      "AddonProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/addonproviders",
    ],
    [
      IPAMProvider,
      "IPAMProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/ipamproviders",
    ],
    [
      RuntimeExtensionProvider,
      "RuntimeExtensionProvider",
      "operator.cluster.x-k8s.io/v1alpha2",
      "/apis/operator.cluster.x-k8s.io/v1alpha2/runtimeextensionproviders",
    ],
  ] as const)(
    "%o has the kind, the version, the scope and the base of its definition",
    (model, kind, apiVersion, apiBase) => {
      expect(model.kind).toBe(kind);
      expect(model.namespaced).toBe(true);
      expect(model.apiBase).toBe(apiBase);
      expect(model.crd.apiVersions).toEqual([apiVersion]);
      expect(apiBase.endsWith(`/${model.crd.plural}`)).toBe(true);
    },
  );

  it("are the fourteen kinds of What the view reads, the seven of the operator among them", () => {
    expect(CONTEXT_MODELS.map((model) => model.kind)).toEqual([
      "Machine",
      "MachineSet",
      "MachineDeployment",
      "MachinePool",
      "KubeadmControlPlane",
      "MachineHealthCheck",
      "ClusterClass",
      "CoreProvider",
      "BootstrapProvider",
      "ControlPlaneProvider",
      "InfrastructureProvider",
      "AddonProvider",
      "IPAMProvider",
      "RuntimeExtensionProvider",
    ]);
  });

  it("fit the input of the rule of each in SPEC-0003", () => {
    const inputs = [
      (object: Machine): MachineObject => object,
      (object: MachineSet): MachineSetObject => object,
      (object: MachineDeployment): MachineDeploymentObject => object,
      (object: MachinePool): MachinePoolObject => object,
      (object: KubeadmControlPlane): KubeadmControlPlaneObject => object,
      (object: MachineHealthCheck): MachineHealthCheckObject => object,
      (object: ClusterClass): ClusterClassObject => object,
      (object: CoreProvider): OperatorProviderObject => object,
      (object: BootstrapProvider): OperatorProviderObject => object,
      (object: ControlPlaneProvider): OperatorProviderObject => object,
      (object: InfrastructureProvider): OperatorProviderObject => object,
      (object: AddonProvider): OperatorProviderObject => object,
      (object: IPAMProvider): OperatorProviderObject => object,
      (object: RuntimeExtensionProvider): OperatorProviderObject => object,
    ];

    expect(inputs).toHaveLength(14);
  });

  it("type no field of the spec of a KubeadmControlPlane but its replicas and its version (SPEC-0001, A3, R3.36)", () => {
    type Keys = keyof KubeadmControlPlane["spec"];
    const exactly: [Keys] extends ["replicas" | "version"]
      ? ["replicas" | "version"] extends [Keys]
        ? true
        : false
      : false = true;

    // @ts-expect-error: the spec of the model holds no configuration of kubeadm
    const configuration: KubeadmControlPlane["spec"]["kubeadmConfigSpec"] = undefined;

    expect([exactly, configuration]).toEqual([true, undefined]);
  });
});
