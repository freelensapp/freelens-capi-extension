import { describe, expect, it } from "vitest";
import {
  AddonProvider,
  BootstrapProvider,
  ClusterClass,
  ClusterResourceSet,
  ClusterResourceSetBinding,
  CONTEXT_MODELS,
  ControlPlaneProvider,
  CoreProvider,
  InfrastructureProvider,
  IPAddress,
  IPAddressClaim,
  IPAMProvider,
  KubeadmConfig,
  KubeadmConfigTemplate,
  KubeadmControlPlane,
  Machine,
  MachineDeployment,
  MachineHealthCheck,
  MachinePool,
  MachineSet,
  RuntimeExtensionProvider,
  TREE_MODELS,
} from "./context-models";

import type {
  ClusterClassObject,
  ClusterResourceSetBindingObject,
  ClusterResourceSetObject,
  IPAddressClaimObject,
  KubeadmConfigObject,
  KubeadmControlPlaneObject,
  KubeObjectData,
  MachineDeploymentObject,
  MachineHealthCheckObject,
  MachineObject,
  MachinePoolObject,
  MachineSetObject,
  OperatorProviderObject,
} from "../../../common/status/index";
import type { ContractVersionedObjectReference, MachineSpec } from "../types";

// Whether two types are the same, for the cases of what a model types.
type Same<One, Other> = [One] extends [Other] ? ([Other] extends [One] ? true : false) : false;

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
});

// The cases of SPEC-0005, "Tests", "Unit", `context-models.test.ts` (P6): the models of the kinds that the tree adds,
// with the metadata of their definitions at Cluster API v1.14.4, and the fields that the models gain for the tree.
describe("the models of the tree (SPEC-0005, P6)", () => {
  it.each([
    [
      KubeadmConfig,
      "KubeadmConfig",
      "bootstrap.cluster.x-k8s.io/v1beta2",
      "/apis/bootstrap.cluster.x-k8s.io/v1beta2/kubeadmconfigs",
    ],
    [
      KubeadmConfigTemplate,
      "KubeadmConfigTemplate",
      "bootstrap.cluster.x-k8s.io/v1beta2",
      "/apis/bootstrap.cluster.x-k8s.io/v1beta2/kubeadmconfigtemplates",
    ],
    [
      ClusterResourceSet,
      "ClusterResourceSet",
      "addons.cluster.x-k8s.io/v1beta2",
      "/apis/addons.cluster.x-k8s.io/v1beta2/clusterresourcesets",
    ],
    [
      ClusterResourceSetBinding,
      "ClusterResourceSetBinding",
      "addons.cluster.x-k8s.io/v1beta2",
      "/apis/addons.cluster.x-k8s.io/v1beta2/clusterresourcesetbindings",
    ],
    [
      IPAddressClaim,
      "IPAddressClaim",
      "ipam.cluster.x-k8s.io/v1beta2",
      "/apis/ipam.cluster.x-k8s.io/v1beta2/ipaddressclaims",
    ],
    [IPAddress, "IPAddress", "ipam.cluster.x-k8s.io/v1beta2", "/apis/ipam.cluster.x-k8s.io/v1beta2/ipaddresses"],
  ] as const)(
    "%o has the kind, the version, the scope and the base of its definition",
    (model, kind, apiVersion, apiBase) => {
      expect(model.kind).toBe(kind);
      expect(model.namespaced).toBe(true);
      expect(model.apiBase).toBe(apiBase);
      expect(model.crd.apiVersions).toEqual([apiVersion]);
      expect(apiBase.endsWith(`/${model.crd.plural}`)).toBe(true);
      expect(model.crd.singular).toBe(kind.toLowerCase());
    },
  );

  it("are the six kinds that What the tree reads adds, apart from those of the context", () => {
    expect(TREE_MODELS.map((model) => model.kind)).toEqual([
      "KubeadmConfig",
      "KubeadmConfigTemplate",
      "ClusterResourceSet",
      "ClusterResourceSetBinding",
      "IPAddressClaim",
      "IPAddress",
    ]);
    expect(CONTEXT_MODELS.filter((model) => (TREE_MODELS as readonly unknown[]).includes(model))).toEqual([]);
  });

  it("fit the input of the rule of each in SPEC-0003, a kind with no status that of any object", () => {
    const inputs = [
      (object: KubeadmConfig): KubeadmConfigObject => object,
      (object: KubeadmConfigTemplate): KubeObjectData => object,
      (object: ClusterResourceSet): ClusterResourceSetObject => object,
      (object: ClusterResourceSetBinding): ClusterResourceSetBindingObject => object,
      (object: IPAddressClaim): IPAddressClaimObject => object,
      (object: IPAddress): KubeObjectData => object,
    ];

    expect(inputs).toHaveLength(6);
  });

  it("type no field of the spec of a KubeadmConfig or of a KubeadmConfigTemplate (SPEC-0001, A3, R3.35, R3.36)", () => {
    const none: [Same<keyof KubeadmConfig["spec"], never>, Same<keyof KubeadmConfigTemplate["spec"], never>] = [
      true,
      true,
    ];
    // @ts-expect-error: the spec of the model holds no file
    const files: KubeadmConfig["spec"]["files"] = undefined;
    // @ts-expect-error: nor does that of its template
    const template: KubeadmConfigTemplate["spec"]["template"] = undefined;

    expect([none, files, template]).toEqual([[true, true], undefined, undefined]);
  });

  it("type of the spec of a KubeadmControlPlane its replicas, its version and the template of its Machines alone (SPEC-0001, A3, R3.36)", () => {
    const exactly: Same<keyof KubeadmControlPlane["spec"], "replicas" | "version" | "machineTemplate"> = true;
    const reference: Same<
      KubeadmControlPlane["spec"]["machineTemplate"]["spec"]["infrastructureRef"],
      ContractVersionedObjectReference
    > = true;
    const onlyTheReference: [
      Same<keyof KubeadmControlPlane["spec"]["machineTemplate"], "spec">,
      Same<keyof KubeadmControlPlane["spec"]["machineTemplate"]["spec"], "infrastructureRef">,
    ] = [true, true];

    // @ts-expect-error: the spec of the model holds no configuration of kubeadm
    const configuration: KubeadmControlPlane["spec"]["kubeadmConfigSpec"] = undefined;

    expect([exactly, reference, onlyTheReference, configuration]).toEqual([true, true, [true, true], undefined]);
  });

  it("type the references, the version and the provider ID of a Machine, and of the template of a MachineDeployment, a MachineSet and a MachinePool", () => {
    type Template<Model extends { spec: { template: { spec: unknown } } }> = Model["spec"]["template"]["spec"];

    const machine: [
      Same<Machine["spec"]["infrastructureRef"], ContractVersionedObjectReference>,
      Same<Machine["spec"]["bootstrap"]["configRef"], ContractVersionedObjectReference | undefined>,
      Same<Machine["spec"]["providerID"], string | undefined>,
    ] = [true, true, true];
    const templates: [
      Same<Template<MachineDeployment>, MachineSpec>,
      Same<Template<MachineSet>, MachineSpec>,
      Same<Template<MachinePool>, MachineSpec>,
      Same<MachineSpec["version"], string | undefined>,
    ] = [true, true, true, true];

    expect([machine, templates]).toEqual([
      [true, true, true],
      [true, true, true, true],
    ]);
  });

  it("type the reference to the remediation template of a MachineHealthCheck", () => {
    const reference: Same<
      NonNullable<MachineHealthCheck["spec"]["remediation"]>["templateRef"],
      { kind: string; name: string; apiVersion: string } | undefined
    > = true;

    expect(reference).toBe(true);
  });

  it("type neither the variables nor the patches of a ClusterClass, whose names one function of the views reads (SPEC-0005, the note on their names)", () => {
    // @ts-expect-error: the variables of a class, whose schemas a value follows, are not typed
    const variables: ClusterClass["spec"]["variables"] = undefined;
    // @ts-expect-error: nor are its patches, which write values into its templates
    const patches: ClusterClass["spec"]["patches"] = undefined;

    expect([variables, patches]).toEqual([undefined, undefined]);
  });
});
