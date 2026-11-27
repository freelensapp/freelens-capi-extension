import { describe, expect, it } from "vitest";
import { fixtureSet } from "../../../test/fixture-sets";
import {
  classReferenceOf,
  clusterNamesOf,
  clusterReferencesOf,
  contractReferenceOf,
  controlPlaneTemplateOf,
  definitionOf,
  findDefinition,
  followedObjectsOf,
  followedReferencesOf,
  isClusterApiKind,
  isTemplateKind,
  machineReferencesOf,
  objectReferenceOf,
  resolveReference,
  targetReadOf,
  templateReferencesOf,
} from "./references";

import type { ClusterObject, KubeObjectData } from "../status/index";
import type { DefinitionData } from "./references";

// The cases of SPEC-0004, "Tests", "Unit", `references.test.ts` (P3): the version of a reference of the contract, from
// the labels of the definition of its kind, which the release of Cluster API v1.14.4 gives its kubeadm and
// development providers (SPEC-0001, R1.17, R1.19;
// controlplane/kubeadm/config/crd/kustomization.yaml:1-6; controlplane/kubeadm/config/default/kustomization.yaml:8;
// test/infrastructure/docker/config/crd/kustomization.yaml:1-6; test/infrastructure/docker/config/default/kustomization.yaml:8).

function definition(name: string, group: string, kind: string, labels?: Record<string, string>): KubeObjectData {
  const plural = name.slice(0, name.indexOf("."));

  return {
    apiVersion: "apiextensions.k8s.io/v1",
    kind: "CustomResourceDefinition",
    metadata: { name, ...(labels === undefined ? {} : { labels }) },
    spec: {
      group,
      names: { kind, plural, singular: kind.toLowerCase(), listKind: `${kind}List` },
      scope: "Namespaced",
    },
  };
}

const CONTRACTS = { "cluster.x-k8s.io/v1beta1": "v1beta1", "cluster.x-k8s.io/v1beta2": "v1beta2" };

const KUBEADM_CONTROL_PLANES = definitionOf(
  definition(
    "kubeadmcontrolplanes.controlplane.cluster.x-k8s.io",
    "controlplane.cluster.x-k8s.io",
    "KubeadmControlPlane",
    {
      ...CONTRACTS,
      "cluster.x-k8s.io/provider": "control-plane-kubeadm",
    },
  ),
) as DefinitionData;

const DEV_CLUSTERS = definitionOf(
  definition("devclusters.infrastructure.cluster.x-k8s.io", "infrastructure.cluster.x-k8s.io", "DevCluster", {
    ...CONTRACTS,
    "cluster.x-k8s.io/provider": "infrastructure-docker",
  }),
) as DefinitionData;

const controlPlaneRef = { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane", name: "md-abcde" };
const infrastructureRef = { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: "md-fghij" };

describe("a reference of the contract (P3)", () => {
  it("resolves a KubeadmControlPlane to v1beta2 from the labels of its definition, with its plural and provider", () => {
    expect(resolveReference(controlPlaneRef, { state: "read", definition: KUBEADM_CONTROL_PLANES })).toEqual({
      state: "resolved",
      reference: controlPlaneRef,
      apiVersion: "controlplane.cluster.x-k8s.io/v1beta2",
      plural: "kubeadmcontrolplanes",
      contract: "v1beta2",
      provider: "control-plane-kubeadm",
    });
  });

  it("resolves the infrastructure cluster of the development provider to the version its labels give", () => {
    expect(resolveReference(infrastructureRef, { state: "read", definition: DEV_CLUSTERS })).toMatchObject({
      state: "resolved",
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
      provider: "infrastructure-docker",
    });
  });

  it("takes v1beta2 when the label lists v1beta1 too, and the plural of the definition, never a guessed one", () => {
    const geese = definitionOf(
      definition("geese.infrastructure.example.com", "infrastructure.example.com", "Goose", {
        "cluster.x-k8s.io/v1beta2": "v1beta1_v1beta2",
      }),
    ) as DefinitionData;

    expect(
      resolveReference(
        { apiGroup: "infrastructure.example.com", kind: "Goose", name: "one" },
        {
          state: "read",
          definition: geese,
        },
      ),
    ).toMatchObject({ apiVersion: "infrastructure.example.com/v1beta2", plural: "geese", provider: undefined });
  });

  it("is text with its reason: refused, failed, no contract label that the parser knows, a kind not served", () => {
    const refused = { refused: true, message: "customresourcedefinitions.apiextensions.k8s.io is forbidden" };
    const failed = { refused: false, message: "Failed to load: timeout" };
    const core = definitionOf(definition("clusters.cluster.x-k8s.io", "cluster.x-k8s.io", "Cluster")) as DefinitionData;

    expect(resolveReference(infrastructureRef, { state: "refused", failure: refused })).toEqual({
      state: "unresolved",
      reference: infrastructureRef,
      reason: "definition-refused",
      failure: refused,
    });
    expect(resolveReference(infrastructureRef, { state: "failed", failure: failed })).toMatchObject({
      reason: "definition-failed",
      failure: failed,
    });
    expect(resolveReference(infrastructureRef, { state: "read", definition: core })).toMatchObject({
      state: "unresolved",
      reason: "no-known-version",
    });
    expect(resolveReference(infrastructureRef, { state: "not-served" })).toMatchObject({
      state: "unresolved",
      reason: "not-served",
    });
    expect(resolveReference(infrastructureRef, { state: "pending" })).toEqual({
      state: "pending",
      reference: infrastructureRef,
    });
  });

  it("finds the definition of a group and a kind, and reads a reference only when it names all three", () => {
    expect(
      findDefinition([KUBEADM_CONTROL_PLANES, DEV_CLUSTERS], "infrastructure.cluster.x-k8s.io", "DevCluster"),
    ).toBe(DEV_CLUSTERS);
    expect(findDefinition([KUBEADM_CONTROL_PLANES], "infrastructure.cluster.x-k8s.io", "DevCluster")).toBeUndefined();
    expect(contractReferenceOf(controlPlaneRef)).toEqual(controlPlaneRef);
    expect(contractReferenceOf({ kind: "KubeadmControlPlane", name: "x" })).toBeUndefined();
    expect(contractReferenceOf({ apiGroup: "", kind: "KubeadmControlPlane", name: "x" })).toBeUndefined();
    expect(contractReferenceOf(undefined)).toBeUndefined();
  });
});

describe("the ClusterClass of a Cluster (SPEC-0001, R3.12)", () => {
  function clusterWith(classRef: unknown): ClusterObject {
    return {
      apiVersion: "cluster.x-k8s.io/v1beta2",
      kind: "Cluster",
      metadata: { name: "one", namespace: "team" },
      spec: classRef === undefined ? {} : { topology: { classRef, version: "v1.37.0" } as never },
    };
  }

  it("is in the namespace of the Cluster when the reference names none, and in the one it names otherwise", () => {
    expect(classReferenceOf(clusterWith({ name: "quick-start" }))).toEqual({
      name: "quick-start",
      namespace: "team",
      elsewhere: false,
    });
    expect(classReferenceOf(clusterWith({ name: "quick-start", namespace: "classes" }))).toEqual({
      name: "quick-start",
      namespace: "classes",
      elsewhere: true,
    });
    expect(classReferenceOf(clusterWith(undefined))).toBeUndefined();
  });
});

describe("the target of a reference (P18)", () => {
  const resolved = resolveReference(infrastructureRef, { state: "read", definition: DEV_CLUSTERS });
  const read = { state: "read" } as const;

  it("is found when the object is in the store that the view read", () => {
    expect(targetReadOf(resolved, read, [], true)).toEqual({ state: "found" });
  });

  it("is text, with why, when its definition cannot be read, names no known version, or its kind is not served", () => {
    const refused = { refused: true, message: "forbidden" };

    expect(
      targetReadOf(resolveReference(infrastructureRef, { state: "refused", failure: refused }), read, [], false),
    ).toEqual({
      state: "unread",
      reason: "definition-refused",
      failures: [refused],
    });
    expect(
      targetReadOf(
        resolveReference(infrastructureRef, { state: "read", definition: { ...DEV_CLUSTERS, labels: {} } }),
        read,
        [],
        false,
      ),
    ).toEqual({ state: "unread", reason: "no-known-version", failures: [] });
    expect(targetReadOf(resolveReference(infrastructureRef, { state: "not-served" }), read, [], false)).toEqual({
      state: "unread",
      reason: "not-served",
      failures: [],
    });
    // The definition names a version that the cluster does not serve: the kind is there, not at that version.
    expect(targetReadOf(resolved, "not-served", [], false)).toEqual({
      state: "unread",
      reason: "version-not-served",
      failures: [],
    });
  });

  it("is text, with why, for an object that does not exist in the namespace, which was read", () => {
    expect(targetReadOf(resolved, read, [], false)).toEqual({ state: "unread", reason: "not-found", failures: [] });
  });

  it("is text, with the failures, when its kind could not be read in the namespace", () => {
    const failed = { refused: false, message: "the connection was reset" };

    expect(targetReadOf(resolved, { state: "held" }, [failed], false)).toEqual({
      state: "unread",
      reason: "kind-not-read",
      failures: [failed],
    });
  });

  it("is still being read while its definition or its namespace is", () => {
    expect(targetReadOf(resolveReference(infrastructureRef, { state: "pending" }), read, [], false)).toEqual({
      state: "pending",
    });
    expect(targetReadOf(undefined, read, [], false)).toEqual({ state: "pending" });
    expect(targetReadOf(resolved, { state: "pending" }, [], false)).toEqual({ state: "pending" });
  });
});

// The cases of SPEC-0005, "Tests", "Unit", `references.test.ts` (P5, P6): what is of Cluster API, the references that
// the tree follows, and a reference of the `v1beta1` contract of a control plane.

describe("the kinds of Cluster API (SPEC-0005, P5)", () => {
  it.each([
    ["cluster.x-k8s.io", "Cluster"],
    ["cluster.x-k8s.io", "ClusterClass"],
    ["cluster.x-k8s.io", "Machine"],
    ["cluster.x-k8s.io", "MachineSet"],
    ["cluster.x-k8s.io", "MachineDeployment"],
    ["cluster.x-k8s.io", "MachinePool"],
    ["cluster.x-k8s.io", "MachineHealthCheck"],
    ["cluster.x-k8s.io", "MachineDrainRule"],
    ["addons.cluster.x-k8s.io", "ClusterResourceSet"],
    ["addons.cluster.x-k8s.io", "ClusterResourceSetBinding"],
    ["bootstrap.cluster.x-k8s.io", "KubeadmConfig"],
    ["bootstrap.cluster.x-k8s.io", "KubeadmConfigTemplate"],
    ["controlplane.cluster.x-k8s.io", "KubeadmControlPlane"],
    ["controlplane.cluster.x-k8s.io", "KubeadmControlPlaneTemplate"],
    ["ipam.cluster.x-k8s.io", "IPAddress"],
    ["ipam.cluster.x-k8s.io", "IPAddressClaim"],
    ["runtime.cluster.x-k8s.io", "ExtensionConfig"],
    ["clusterctl.cluster.x-k8s.io", "Provider"],
    ["operator.cluster.x-k8s.io", "CoreProvider"],
    ["operator.cluster.x-k8s.io", "BootstrapProvider"],
    ["operator.cluster.x-k8s.io", "ControlPlaneProvider"],
    ["operator.cluster.x-k8s.io", "InfrastructureProvider"],
    ["operator.cluster.x-k8s.io", "AddonProvider"],
    ["operator.cluster.x-k8s.io", "IPAMProvider"],
    ["operator.cluster.x-k8s.io", "RuntimeExtensionProvider"],
  ])("%s %s is of Cluster API", (group, kind) => {
    expect(isClusterApiKind(group, kind)).toBe(true);
  });

  it.each([
    ["bootstrap.cluster.x-k8s.io", "ExampleConfig"],
    ["controlplane.cluster.x-k8s.io", "ExampleControlPlane"],
    ["ipam.cluster.x-k8s.io", "InClusterIPPool"],
    ["infrastructure.cluster.x-k8s.io", "DevCluster"],
    ["infrastructure.cluster.x-k8s.io", "DevMachineTemplate"],
    ["operator.cluster.x-k8s.io", "Machine"],
  ])("%s %s is of a provider, whatever its group", (group, kind) => {
    expect(isClusterApiKind(group, kind)).toBe(false);
  });
});

describe("the references that the tree follows (SPEC-0005, P6, P7, P8)", () => {
  const healthy = fixtureSet("healthy") as unknown as KubeObjectData[];
  const pools = fixtureSet("machine-pools") as unknown as KubeObjectData[];
  const named = (objects: KubeObjectData[], kind: string, name?: string) =>
    objects.find(
      (object) => object.kind === kind && (name === undefined || (object.metadata as { name: string }).name === name),
    ) as KubeObjectData;
  const summary = (entries: ReturnType<typeof followedReferencesOf>) =>
    entries.map(
      ({ reference, field, role }) => `${field} ${role} ${reference.apiGroup}/${reference.kind}/${reference.name}`,
    );

  it("are the infrastructure cluster and the control plane of a Cluster", () => {
    expect(summary(clusterReferencesOf(named(healthy, "Cluster")))).toEqual([
      "spec.infrastructureRef infrastructure-cluster infrastructure.cluster.x-k8s.io/DevCluster/freelens-capi-healthy-8fgcf",
      "spec.controlPlaneRef control-plane controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
    ]);
  });

  it("are the infrastructure machine and the bootstrap config of a Machine", () => {
    expect(summary(machineReferencesOf(named(healthy, "Machine", "freelens-capi-healthy-d2lgq-zqlcx")))).toEqual([
      "spec.infrastructureRef infrastructure-machine infrastructure.cluster.x-k8s.io/DevMachine/freelens-capi-healthy-d2lgq-zqlcx",
      "spec.bootstrap.configRef bootstrap-config bootstrap.cluster.x-k8s.io/KubeadmConfig/freelens-capi-healthy-d2lgq-zqlcx",
    ]);
  });

  it("are the templates of a MachineDeployment and of a MachineSet, kinds whose names end in Template", () => {
    const expected = [
      "spec.template.spec.infrastructureRef template infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-md-0-xp9c7",
      "spec.template.spec.bootstrap.configRef template bootstrap.cluster.x-k8s.io/KubeadmConfigTemplate/freelens-capi-healthy-md-0-2wh2v",
    ];

    expect(summary(templateReferencesOf(named(healthy, "MachineDeployment")))).toEqual(expected);
    expect(summary(templateReferencesOf(named(healthy, "MachineSet")))).toEqual(expected);
    expect(isTemplateKind("DevMachineTemplate")).toBe(true);
    expect(isTemplateKind("DevMachine")).toBe(false);
  });

  it("are the infrastructure machine pool and the bootstrap config of a MachinePool, which name no template", () => {
    expect(summary(templateReferencesOf(named(pools, "MachinePool")))).toEqual([
      "spec.template.spec.infrastructureRef infrastructure-machine-pool infrastructure.cluster.x-k8s.io/DevMachinePool/freelens-capi-machine-pools-mp-0-6cl2n",
      "spec.template.spec.bootstrap.configRef bootstrap-config bootstrap.cluster.x-k8s.io/KubeadmConfig/freelens-capi-machine-pools-mp-0-wl6nx",
    ]);
  });

  it("are none of a MachineDeployment for a kind that is no template", () => {
    const deployment = structuredClone(named(healthy, "MachineDeployment")) as KubeObjectData & {
      spec: { template: { spec: { infrastructureRef: { kind: string } } } };
    };

    deployment.spec.template.spec.infrastructureRef.kind = "DevMachine";
    expect(summary(templateReferencesOf(deployment)).map((line) => line.split(" ")[0])).toEqual([
      "spec.template.spec.bootstrap.configRef",
    ]);
  });

  it("are the template of the Machines of a control plane, by the field of its contract", () => {
    const controlPlane = named(healthy, "KubeadmControlPlane");

    expect(summary(controlPlaneTemplateOf(controlPlane, "v1beta2"))).toEqual([
      "spec.machineTemplate.spec.infrastructureRef template infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml",
    ]);

    // At v1beta1 the contract names an object reference, with `apiVersion` in the place of `apiGroup`.
    const v1beta1 = {
      ...controlPlane,
      spec: {
        machineTemplate: {
          infrastructureRef: {
            apiVersion: "infrastructure.cluster.x-k8s.io/v1beta1",
            kind: "DevMachineTemplate",
            name: "old-contract",
          },
        },
      },
    };

    expect(summary(controlPlaneTemplateOf(v1beta1, "v1beta1"))).toEqual([
      "spec.machineTemplate.infrastructureRef template infrastructure.cluster.x-k8s.io/DevMachineTemplate/old-contract",
    ]);
    expect(controlPlaneTemplateOf(v1beta1, "v1beta2")).toEqual([]);
    expect(followedReferencesOf(v1beta1, { contract: "v1beta1" })).toHaveLength(1);
  });

  it("are said for each object by one function: of a Cluster, a Machine, a MachineDeployment, a MachineSet and a MachinePool by their kinds, and of a KubeadmControlPlane at v1beta2 with no definition", () => {
    for (const [objects, kind] of [
      [healthy, "Cluster"],
      [healthy, "Machine"],
      [healthy, "MachineDeployment"],
      [healthy, "MachineSet"],
      [pools, "MachinePool"],
    ] as const) {
      const object = named(objects, kind);
      const expected = {
        Cluster: clusterReferencesOf,
        Machine: machineReferencesOf,
        MachineDeployment: templateReferencesOf,
        MachineSet: templateReferencesOf,
        MachinePool: templateReferencesOf,
      }[kind](object);

      expect(expected.length, kind).toBeGreaterThan(0);
      expect(followedReferencesOf(object), kind).toEqual(expected);
    }
    expect(summary(followedReferencesOf(named(healthy, "KubeadmControlPlane")))).toEqual([
      "spec.machineTemplate.spec.infrastructureRef template infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml",
    ]);
  });

  it("give the group of an object reference of v1beta1, and never its version", () => {
    const reference = objectReferenceOf({
      apiVersion: "controlplane.example.test/v1beta1",
      kind: "ExampleMachineTemplate",
      name: "one",
    });

    expect(reference).toEqual({ apiGroup: "controlplane.example.test", kind: "ExampleMachineTemplate", name: "one" });
    expect(Object.values(reference ?? {}).some((value) => value.includes("v1beta1"))).toBe(false);
    expect(objectReferenceOf({ apiVersion: "v1", kind: "ConfigMap", name: "one" })).toBeUndefined();
    expect(objectReferenceOf({ kind: "ExampleMachineTemplate", name: "one" })).toBeUndefined();
  });

  it("are none of the objects whose references the tree never follows: a MachineHealthCheck, an IPAddressClaim, an IPAddress and a ClusterClass", () => {
    const noStatus = fixtureSet("no-status") as unknown as KubeObjectData[];
    const check = {
      ...named(noStatus, "MachineHealthCheck"),
      spec: {
        clusterName: "freelens-capi-no-status",
        remediation: {
          templateRef: {
            apiVersion: "infrastructure.example.test/v1beta2",
            kind: "ExampleRemediationTemplate",
            name: "one",
          },
        },
      },
    };

    for (const object of [
      check,
      named(noStatus, "IPAddressClaim"),
      named(noStatus, "IPAddress"),
      named(healthy, "ClusterClass"),
      named(noStatus, "MachineDrainRule"),
    ]) {
      expect(followedReferencesOf(object), String(object.kind)).toEqual([]);
    }
    // The Node of a Machine is no reference that the tree follows.
    expect(summary(followedReferencesOf(named(healthy, "Machine"))).map((line) => line.split(" ")[0])).toEqual([
      "spec.infrastructureRef",
      "spec.bootstrap.configRef",
    ]);
  });
});

describe("the objects of a Cluster that the reads of its tree follow (SPEC-0005, P6, P7)", () => {
  const HEALTHY = "freelens-capi-healthy";

  type Writable = KubeObjectData & {
    metadata: { name: string; namespace?: string; labels?: Record<string, string> };
    spec: { clusterName?: string; controlPlaneRef?: unknown };
  };

  function healthy(): Writable[] {
    return structuredClone(fixtureSet("healthy")) as unknown as Writable[];
  }

  function of(objects: readonly Writable[], kind: string): Writable[] {
    return objects.filter((object) => object.kind === kind);
  }

  function sources(objects: readonly Writable[]) {
    return {
      machines: of(objects, "Machine"),
      machineDeployments: of(objects, "MachineDeployment"),
      machineSets: of(objects, "MachineSet"),
      machinePools: of(objects, "MachinePool"),
      kubeadmControlPlanes: of(objects, "KubeadmControlPlane"),
    };
  }

  function followed(cluster: KubeObjectData, given: Parameters<typeof followedObjectsOf>[1]): string[] {
    return followedObjectsOf(cluster, given).map(
      ({ object, controlPlane }) =>
        `${String(object.kind)} ${(object.metadata as { name: string }).name}${controlPlane === undefined ? "" : ` at ${controlPlane.contract}`}`,
    );
  }

  it("give the names of the Clusters of an object by its label and by spec.clusterName", () => {
    const [machine] = of(healthy(), "Machine");

    expect(clusterNamesOf(machine)).toEqual([HEALTHY]);
    machine.metadata.labels = { "cluster.x-k8s.io/cluster-name": "other" };
    expect(clusterNamesOf(machine)).toEqual(["other", HEALTHY]);
    machine.spec.clusterName = "";
    expect(clusterNamesOf(machine)).toEqual(["other"]);
  });

  it("are the Machines, the MachineDeployments and the MachineSets of the Cluster, and the KubeadmControlPlane that it names at v1beta2", () => {
    const objects = healthy();
    const [cluster] = of(objects, "Cluster");

    expect(followed(cluster, sources(objects)).sort()).toEqual(
      [
        "KubeadmControlPlane freelens-capi-healthy-d2lgq at v1beta2",
        "Machine freelens-capi-healthy-d2lgq-zqlcx",
        "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
        "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
        "MachineDeployment freelens-capi-healthy-md-0-m9x7h",
        "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
      ].sort(),
    );
  });

  it("leave out an object of another Cluster of the namespace, and keep one that names the Cluster by its label or its spec.clusterName alone", () => {
    const objects = healthy();
    const [cluster] = of(objects, "Cluster");
    const [first, second, third] = of(objects, "Machine");

    first.metadata.labels = {};
    second.spec.clusterName = "other";
    third.metadata.labels = { "cluster.x-k8s.io/cluster-name": "other" };
    third.spec.clusterName = "other";

    const machines = followed(cluster, sources(objects)).filter((line) => line.startsWith("Machine "));

    expect(machines).toEqual([`Machine ${first.metadata.name}`, `Machine ${second.metadata.name}`]);
  });

  it("are every control plane of the Cluster: one that it does not name but labels, and none of another Cluster", () => {
    const objects = healthy();
    const [cluster] = of(objects, "Cluster");
    const [controlPlane] = of(objects, "KubeadmControlPlane");
    const labelled = structuredClone(controlPlane);
    const foreign = structuredClone(controlPlane);

    delete cluster.spec.controlPlaneRef;
    labelled.metadata.name = "labelled";
    foreign.metadata.name = "foreign";
    foreign.metadata.labels = { "cluster.x-k8s.io/cluster-name": "other" };

    const lines = followed(cluster, sources([...objects, labelled, foreign])).filter((line) =>
      line.startsWith("KubeadmControlPlane "),
    );

    expect(lines).toEqual([
      `KubeadmControlPlane ${controlPlane.metadata.name} at v1beta2`,
      "KubeadmControlPlane labelled at v1beta2",
    ]);
  });

  it("are a control plane of a provider that the Cluster names, with no label, at the contract of its definition", () => {
    const objects = healthy();
    const [cluster] = of(objects, "Cluster");
    const provider = {
      apiVersion: "controlplane.example.test/v1beta1",
      kind: "ExampleControlPlane",
      metadata: { name: "example", namespace: HEALTHY },
      spec: {},
    } as unknown as Writable;
    const other = { ...provider, metadata: { name: "other", namespace: HEALTHY } } as unknown as Writable;

    cluster.spec.controlPlaneRef = {
      apiGroup: "controlplane.example.test",
      kind: "ExampleControlPlane",
      name: "example",
    };

    expect(
      followed(cluster, { ...sources([]), controlPlanes: { objects: [provider, other], contract: "v1beta1" } }),
    ).toEqual(["ExampleControlPlane example at v1beta1"]);
  });
});
