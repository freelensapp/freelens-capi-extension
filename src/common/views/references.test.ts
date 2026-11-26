import { describe, expect, it } from "vitest";
import { classReferenceOf, contractReferenceOf, definitionOf, findDefinition, resolveReference } from "./references";

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
