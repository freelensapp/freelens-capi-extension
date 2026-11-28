// The second identity of the restricted session (SPEC-0004, P23), with no cluster: the kinds that it is granted, those
// of the page of the Clusters and of the tree of a Cluster (SPEC-0005, P19), what each access lets it read, the objects
// of RBAC that grant an access, the reviews that ask the cluster about it, the refusals that a step expects, and its
// kubeconfig.

import { describe, expect, it } from "vitest";
import {
  accessObjects,
  accessReviews,
  allows,
  allowsDefinitions,
  CLUSTERS_PAGE_DEFINITIONS,
  CLUSTERS_PAGE_KINDS,
  CONTROL_PLANE_DEFINITION,
  extraObjects,
  IDENTITY,
  IDENTITY_USER,
  INFRASTRUCTURE,
  INFRASTRUCTURE_DEFINITION,
  identityObjects,
  keyOf,
  kubeconfigOf,
  MACHINE_DEFINITION,
  MACHINE_TEMPLATE_DEFINITION,
  NAMED_DEFINITIONS,
  NAMESPACES,
  PAGE_KINDS,
  PROVIDER_KINDS,
  permissionsOf,
  READ_KINDS,
  refusedDefinitions,
  refusedLists,
  START_PAGE_RULES,
  TREE_KINDS,
  wrongAnswers,
} from "../integration/__tests__/restricted-access";
import { followedObjectsOf, followedReferencesOf, isClusterApiKind } from "../src/common/views/references";
import { Cluster } from "../src/renderer/api/cluster/cluster-v1beta2";
import { CONTEXT_MODELS, TREE_MODELS } from "../src/renderer/api/context/context-models";
import { fixtureSet, STATES } from "./fixture-sets";

import type { Access, Kind } from "../integration/__tests__/restricted-access";
import type { KubeObjectData } from "../src/common/status/index";

const HEALTHY = "freelens-capi-healthy";
const PAUSED = "freelens-capi-paused";

const kind = (plural: string) => READ_KINDS.find((each) => each.plural === plural) as Kind;

const CLUSTERS_IN_PAUSED: Access = {
  scope: "namespaces",
  refused: [{ plural: "clusters", namespace: PAUSED }],
  definitions: "list",
};
const MACHINES_IN_BOTH: Access = {
  scope: "namespaces",
  refused: [
    { plural: "machines", namespace: HEALTHY },
    { plural: "machines", namespace: PAUSED },
  ],
  definitions: "list",
};
const BY_NAME: Access = { scope: "namespaces", refused: [], definitions: [CONTROL_PLANE_DEFINITION] };
const OVER_THE_CLUSTER: Access = { scope: "cluster" };
const ACCESSES = [CLUSTERS_IN_PAUSED, MACHINES_IN_BOTH, BY_NAME, OVER_THE_CLUSTER];

type Manifest = Record<string, any>;

function objectsOfKind(objects: readonly Manifest[], kindName: string): Manifest[] {
  return objects.filter((object) => object.kind === kindName);
}

// A kind that a model reads, as the identity is granted it: its group, its version and its plural.
function kindOfModel(model: { crd: { apiVersions: readonly string[]; plural: string } }): Kind {
  const [group, version] = model.crd.apiVersions[0].split("/");

  return { group, version, plural: model.crd.plural };
}

// The kinds of the providers that the tree of the Cluster of each state of the fixtures reads, by `group/Kind`: those
// that the references of the Cluster name, and those that the objects of the Cluster whose references the reads of the
// tree follow name (SPEC-0005, P6), as the read of one Cluster follows them.
function providerKindsOfTheFixtures(): string[] {
  const kinds = new Set<string>();

  for (const state of STATES) {
    const objects = fixtureSet(state) as unknown as KubeObjectData[];
    const ofKind = (kind: string) => objects.filter((object) => object.kind === kind);
    const [cluster] = ofKind("Cluster");
    const references = [
      ...followedReferencesOf(cluster),
      ...followedObjectsOf(cluster, {
        machines: ofKind("Machine"),
        machineDeployments: ofKind("MachineDeployment"),
        machineSets: ofKind("MachineSet"),
        machinePools: ofKind("MachinePool"),
        kubeadmControlPlanes: ofKind("KubeadmControlPlane"),
      }).flatMap(({ object, controlPlane }) => followedReferencesOf(object, controlPlane)),
    ];

    for (const { reference } of references) {
      if (!isClusterApiKind(reference.apiGroup, reference.kind)) kinds.add(`${reference.apiGroup}/${reference.kind}`);
    }
  }
  return [...kinds].sort();
}

describe("the identity of the restricted session (P23)", () => {
  it("is granted the kinds that the page reads, at the versions that it reads them, and the infrastructure cluster of the fixtures", () => {
    expect(PAGE_KINDS).toEqual([Cluster, ...CONTEXT_MODELS].map(kindOfModel));
    expect(READ_KINDS).toEqual([...PAGE_KINDS, ...TREE_KINDS, ...PROVIDER_KINDS]);
    expect(PROVIDER_KINDS[0]).toEqual(INFRASTRUCTURE);
    expect(NAMESPACES[0]).toBe("default");
    expect(NAMESPACES).toContain(HEALTHY);
    expect(NAMESPACES).toContain(PAUSED);
  });

  it("is granted the kinds that the tree of a Cluster reads: those of the models of the tree, and those of the providers of the fixtures that the tree reads, each under its group (SPEC-0005, P19)", () => {
    expect(TREE_KINDS).toEqual(TREE_MODELS.map(kindOfModel));
    // The kinds of the development provider, whose definitions in the release name the contract v1beta2 alone, at that
    // version, and with the plurals of their definitions, the kind in lower case and an s.
    expect(PROVIDER_KINDS.map((kind) => `${kind.group}/${kind.version}/${kind.plural}`).sort()).toEqual(
      providerKindsOfTheFixtures()
        .map((kind) => {
          const [group, name] = kind.split("/");

          return `${group}/v1beta2/${name.toLowerCase()}s`;
        })
        .sort(),
    );
    expect(providerKindsOfTheFixtures()).toEqual([
      "infrastructure.cluster.x-k8s.io/DevCluster",
      "infrastructure.cluster.x-k8s.io/DevMachine",
      "infrastructure.cluster.x-k8s.io/DevMachinePool",
      "infrastructure.cluster.x-k8s.io/DevMachineTemplate",
    ]);
    // Each kind once, under its group.
    expect(new Set(READ_KINDS.map((kind) => `${kind.plural}.${kind.group}`)).size).toBe(READ_KINDS.length);
  });

  it("may get by their names the definitions that the tree of healthy reads, beside those of the references of a Cluster", () => {
    expect(NAMED_DEFINITIONS).toEqual([
      CONTROL_PLANE_DEFINITION,
      INFRASTRUCTURE_DEFINITION,
      MACHINE_DEFINITION,
      MACHINE_TEMPLATE_DEFINITION,
    ]);
    for (const name of [INFRASTRUCTURE_DEFINITION, MACHINE_DEFINITION, MACHINE_TEMPLATE_DEFINITION]) {
      const [plural, ...group] = name.split(".");

      expect(PROVIDER_KINDS, name).toContainEqual({ group: group.join("."), version: "v1beta2", plural });
    }
  });

  it("may read with each access what its case says, and nothing outside default and the namespaces of the fixtures", () => {
    expect(allows(CLUSTERS_IN_PAUSED, kind("clusters"), HEALTHY)).toBe(true);
    expect(allows(CLUSTERS_IN_PAUSED, kind("clusters"), PAUSED)).toBe(false);
    expect(allows(CLUSTERS_IN_PAUSED, kind("machines"), PAUSED)).toBe(true);
    expect(allows(CLUSTERS_IN_PAUSED, kind("clusters"), undefined)).toBe(false);
    expect(allows(CLUSTERS_IN_PAUSED, kind("clusters"), "kube-system")).toBe(false);
    expect(allows(MACHINES_IN_BOTH, kind("machines"), HEALTHY)).toBe(false);
    expect(allows(MACHINES_IN_BOTH, kind("clusters"), PAUSED)).toBe(true);
    expect(allows(OVER_THE_CLUSTER, kind("clusters"), undefined)).toBe(true);
    expect(allows(OVER_THE_CLUSTER, INFRASTRUCTURE, "kube-system")).toBe(true);
    expect(allowsDefinitions(CLUSTERS_IN_PAUSED)).toBe(true);
    expect(allowsDefinitions(BY_NAME)).toBe(false);
    expect(allowsDefinitions(BY_NAME, CONTROL_PLANE_DEFINITION)).toBe(true);
    expect(allowsDefinitions(BY_NAME, INFRASTRUCTURE_DEFINITION)).toBe(false);
  });

  it("is granted reading alone, get, list and watch, never a Secret or every resource, through bindings named as their roles, each with the label of the session", () => {
    for (const access of ACCESSES) {
      const objects: Manifest[] = accessObjects(access);

      for (const object of [...objects, ...(identityObjects() as Manifest[])]) {
        expect(object.metadata.labels, `${object.kind} ${object.metadata.name}`).toEqual({
          [IDENTITY.label]: IDENTITY.labelValue,
        });
      }
      for (const role of objectsOfKind(objects, "ClusterRole")) {
        for (const rule of role.rules) {
          expect(["get", "list", "watch"], role.metadata.name).toEqual(expect.arrayContaining(rule.verbs));
          expect(rule.resources).not.toContain("secrets");
          expect(rule.resources).not.toContain("*");
          expect(rule.apiGroups).not.toContain("*");
        }
      }
      for (const binding of [
        ...objectsOfKind(objects, "RoleBinding"),
        ...objectsOfKind(objects, "ClusterRoleBinding"),
      ]) {
        expect(binding.metadata.name).toBe(binding.roleRef.name);
        expect(binding.roleRef.kind).toBe("ClusterRole");
        expect(binding.subjects).toEqual([
          { kind: "ServiceAccount", name: IDENTITY.serviceAccount, namespace: IDENTITY.namespace },
        ]);
        expect(objectsOfKind(objects, "ClusterRole").map((role) => role.metadata.name)).toContain(binding.roleRef.name);
      }
    }
  });

  it("may read with every access the namespaces over the whole cluster, and what the start page of the host reads in default", () => {
    for (const access of ACCESSES) {
      const objects = accessObjects(access);
      const roles = new Map(objectsOfKind(objects, "ClusterRole").map((role) => [role.metadata.name, role]));
      const namespaces = objectsOfKind(objects, "ClusterRoleBinding").find(
        (binding) => binding.roleRef.name === `${IDENTITY.serviceAccount}-namespaces`,
      );
      const startPage = objectsOfKind(objects, "RoleBinding").find(
        (binding) => binding.roleRef.name === `${IDENTITY.serviceAccount}-start-page`,
      );

      expect(roles.get(namespaces?.roleRef.name)?.rules).toEqual([
        { apiGroups: [""], resources: ["namespaces"], verbs: ["get", "list", "watch"] },
      ]);
      expect(startPage?.metadata.namespace).toBe("default");
      expect(roles.get(startPage?.roleRef.name)?.rules).toEqual(
        START_PAGE_RULES.map((rule) => ({ ...rule, verbs: ["get", "list", "watch"] })),
      );
    }
  });

  it("binds in each namespace the role of what it refuses there, each kind under its group, and over the whole cluster the role of every kind", () => {
    const objects = accessObjects(CLUSTERS_IN_PAUSED);
    const roles = new Map(objectsOfKind(objects, "ClusterRole").map((role) => [role.metadata.name, role]));
    // Each resource that a role grants, as `plural.group`, so that a kind granted under another group differs.
    const resources = (name: string): string[] =>
      roles
        .get(name)
        ?.rules.flatMap((rule: Manifest) =>
          rule.apiGroups.flatMap((group: string) => rule.resources.map((plural: string) => `${plural}.${group}`)),
        ) ?? [];
    const bindings = objectsOfKind(objects, "RoleBinding").filter((binding) => binding.roleRef.name.includes("-reads"));

    expect(bindings.map((binding) => binding.metadata.namespace).sort()).toEqual([...NAMESPACES].sort());
    for (const binding of bindings) {
      expect(resources(binding.roleRef.name).sort(), binding.metadata.namespace).toEqual(
        READ_KINDS.filter((each) => binding.metadata.namespace !== PAUSED || each.plural !== "clusters")
          .map((each) => `${each.plural}.${each.group}`)
          .sort(),
      );
    }
    expect(objectsOfKind(objects, "ClusterRoleBinding").map((binding) => binding.roleRef.name)).not.toContain(
      `${IDENTITY.serviceAccount}-reads`,
    );

    const cluster = accessObjects(OVER_THE_CLUSTER);

    expect(objectsOfKind(cluster, "RoleBinding").map((binding) => binding.roleRef.name)).toEqual([
      `${IDENTITY.serviceAccount}-start-page`,
    ]);
    expect(objectsOfKind(cluster, "ClusterRoleBinding").map((binding) => binding.roleRef.name)).toContain(
      `${IDENTITY.serviceAccount}-reads`,
    );
  });

  it("may get the definitions by their names alone when the access names them, and list them otherwise", () => {
    const rules = (access: Access) =>
      objectsOfKind(accessObjects(access), "ClusterRole").find(
        (role) => role.metadata.name === `${IDENTITY.serviceAccount}-definitions`,
      )?.rules;

    expect(rules(BY_NAME)).toEqual([
      {
        apiGroups: ["apiextensions.k8s.io"],
        resources: ["customresourcedefinitions"],
        resourceNames: [CONTROL_PLANE_DEFINITION],
        verbs: ["get"],
      },
    ]);
    expect(rules(CLUSTERS_IN_PAUSED)).toEqual([
      {
        apiGroups: ["apiextensions.k8s.io"],
        resources: ["customresourcedefinitions"],
        verbs: ["get", "list", "watch"],
      },
    ]);
  });

  it("deletes, from one access to the next, the objects that the next does not have", () => {
    const before = accessObjects(CLUSTERS_IN_PAUSED).map(keyOf);
    const next = accessObjects(MACHINES_IN_BOTH);
    const extra = extraObjects(before, next);

    // The Clusters read again in paused, and the Machines refused in healthy and in paused: the role and the binding
    // of paused that refused the Clusters go, and so does the binding of healthy that let it read every kind.
    expect(extra.map((key) => `${key.kind} ${key.namespace}/${key.name}`).sort()).toEqual([
      `ClusterRole /${IDENTITY.serviceAccount}-reads-but-clusters`,
      `RoleBinding ${HEALTHY}/${IDENTITY.serviceAccount}-reads`,
      `RoleBinding ${PAUSED}/${IDENTITY.serviceAccount}-reads-but-clusters`,
    ]);
    expect(extraObjects(next.map(keyOf), next)).toEqual([]);
  });

  it("asks the cluster every permission that an access decides, as the identity with its groups, and finds the answers that differ", () => {
    const permissions = permissionsOf(CLUSTERS_IN_PAUSED);
    const reviews = accessReviews(permissions);
    const refusedAt = permissions.findIndex(
      (permission) => permission.resource === "clusters" && permission.namespace === PAUSED,
    );

    expect(permissions).toHaveLength(READ_KINDS.length * (NAMESPACES.length + 1) + 1 + NAMED_DEFINITIONS.length);
    expect(permissions[refusedAt].allowed).toBe(false);
    expect(reviews[refusedAt]).toEqual({
      apiVersion: "authorization.k8s.io/v1",
      kind: "SubjectAccessReview",
      spec: {
        user: IDENTITY_USER,
        groups: ["system:serviceaccounts", `system:serviceaccounts:${IDENTITY.namespace}`, "system:authenticated"],
        resourceAttributes: { verb: "list", group: "cluster.x-k8s.io", resource: "clusters", namespace: PAUSED },
      },
    });

    // The answers as kubectl prints the objects of a list that it creates: each review whole, one after the other, in
    // the order of the list, and never a List of them.
    const printed = (allowed: (index: number) => boolean) =>
      reviews
        .map((review, index) => JSON.stringify({ ...review, status: { allowed: allowed(index) } }, null, 4))
        .join("\n");

    expect(
      wrongAnswers(
        permissions,
        printed((index) => permissions[index].allowed),
      ),
    ).toEqual([]);
    expect(
      wrongAnswers(
        permissions,
        printed((index) => permissions[index].allowed || index === refusedAt),
      ),
    ).toEqual([`allowed: list clusters.cluster.x-k8s.io in ${PAUSED}`]);
    expect(wrongAnswers(permissions, "")).toEqual([`The cluster answered 0 reviews of ${permissions.length}`]);
  });

  it("expects the refusals of the lists that an access refuses where the page reads, and of the definitions", () => {
    expect(refusedLists(CLUSTERS_IN_PAUSED, [HEALTHY, PAUSED])).toEqual([
      `/apis/cluster.x-k8s.io/v1beta2/namespaces/${PAUSED}/clusters`,
    ]);
    expect(refusedLists(MACHINES_IN_BOTH, [HEALTHY, PAUSED])).toEqual([
      `/apis/cluster.x-k8s.io/v1beta2/namespaces/${HEALTHY}/machines`,
      `/apis/cluster.x-k8s.io/v1beta2/namespaces/${PAUSED}/machines`,
    ]);
    expect(refusedLists(CLUSTERS_IN_PAUSED, "every")).toEqual(
      READ_KINDS.map((each) => `/apis/${each.group}/${each.version}/${each.plural}`),
    );
    expect(refusedLists(OVER_THE_CLUSTER, "every")).toEqual([]);
    expect(refusedDefinitions(CLUSTERS_IN_PAUSED)).toEqual([]);
    expect(refusedDefinitions(BY_NAME)).toEqual([
      "/apis/apiextensions.k8s.io/v1/customresourcedefinitions",
      `/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${INFRASTRUCTURE_DEFINITION}`,
      `/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${MACHINE_DEFINITION}`,
      `/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${MACHINE_TEMPLATE_DEFINITION}`,
    ]);
  });

  // The cases of the page of the Clusters leave out the refusals of what that page reads alone, so that the page of the
  // Clusters reading a kind or a definition of the tree, which it never reads, is a refusal that no case expects.
  it("expects in the cases of the page of the Clusters the refusals of the kinds and of the definitions that that page reads alone", () => {
    expect(CLUSTERS_PAGE_KINDS).toEqual([...PAGE_KINDS, INFRASTRUCTURE]);
    expect(CLUSTERS_PAGE_DEFINITIONS).toEqual([CONTROL_PLANE_DEFINITION, INFRASTRUCTURE_DEFINITION]);
    expect(refusedLists(CLUSTERS_IN_PAUSED, "every", CLUSTERS_PAGE_KINDS)).toEqual(
      [...PAGE_KINDS, INFRASTRUCTURE].map((each) => `/apis/${each.group}/${each.version}/${each.plural}`),
    );
    for (const each of [...TREE_KINDS, ...PROVIDER_KINDS.filter((provider) => provider !== INFRASTRUCTURE)]) {
      expect(refusedLists(CLUSTERS_IN_PAUSED, "every", CLUSTERS_PAGE_KINDS)).not.toContain(
        `/apis/${each.group}/${each.version}/${each.plural}`,
      );
    }
    expect(refusedDefinitions(BY_NAME, CLUSTERS_PAGE_DEFINITIONS)).toEqual([
      "/apis/apiextensions.k8s.io/v1/customresourcedefinitions",
      `/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${INFRASTRUCTURE_DEFINITION}`,
    ]);
  });

  it("has a kubeconfig of one cluster, verified with the authority of kind, one user that holds its token, and one current context of its name", () => {
    const kubeconfig = JSON.parse(kubeconfigOf("https://127.0.0.1:41234", "Q0E=", "a-made-up-token"));
    const name = IDENTITY.context;

    expect(kubeconfig).toEqual({
      apiVersion: "v1",
      kind: "Config",
      clusters: [{ name, cluster: { server: "https://127.0.0.1:41234", "certificate-authority-data": "Q0E=" } }],
      users: [{ name, user: { token: "a-made-up-token" } }],
      contexts: [{ name, context: { cluster: name, user: name } }],
      "current-context": name,
      preferences: {},
    });
  });
});
