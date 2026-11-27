/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The second identity of the restricted session (SPEC-0004, P23), as pure data and functions, which its unit test
// checks with no cluster: a ServiceAccount in a namespace of its own on the cluster of the definitions, what each step
// of a case lets it read, the objects of RBAC that grant it, the permissions that the session asks the cluster about
// until it answers as the step says, the refusals that a step expects, and the kubeconfig that holds its token. Its
// name does not match `*.tests.ts`, so Vitest does not collect it as a session.
//
// What an identity may read is said as an access: in `default` and in the namespaces of the fixtures, every kind that
// the page of the Clusters and the tree of a Cluster read but those that the access refuses there, or every such kind
// over the whole cluster; the definitions, listed, or read by their names alone; and in every access, the namespaces
// over the whole cluster, as the frame of a cluster lists them, and what the start page of the host reads in
// `default`, so that no other read of the session is refused. Every role grants `get`, `list` and `watch` alone.

import { IDENTITY_NAMESPACE } from "../../e2e/scripts/commands.mts";
import { printedObjects } from "../../e2e/scripts/fixtures.mts";
import { statesOf } from "../../e2e/scripts/states.mts";

// The objects of the identity on the cluster of the definitions, the name of its kubeconfig file, and the label of
// every object that the session makes, by which it finds them again, also those that a run that was killed left.
export const IDENTITY = {
  // The scripts refuse to fill or to remove it as the namespace of the objects of a session (`ownNamespaceProblem`).
  namespace: IDENTITY_NAMESPACE,
  serviceAccount: "freelens-capi-restricted",
  // The name of the cluster, of the user and of the context of its kubeconfig: the name of the cluster in the catalog
  // of Freelens.
  context: "freelens-capi-restricted",
  file: "freelens-capi-restricted.kubeconfig",
  label: "test-environment.freelens.app/session",
  labelValue: "restricted",
} as const;

// The user that the cluster sees in a request of the identity, which names it in a refusal.
export const IDENTITY_USER = `system:serviceaccount:${IDENTITY.namespace}:${IDENTITY.serviceAccount}`;

// A kind that the identity reads: its group, the version at which a view lists it, and its plural.
export interface Kind {
  readonly group: string;
  readonly version: string;
  readonly plural: string;
}

const CORE = "cluster.x-k8s.io";
const OPERATOR = "operator.cluster.x-k8s.io";

// The kinds that the page of the Clusters reads in the namespaces of the filter, and a view of one Cluster in its
// namespace (SPEC-0004, "What the view reads"): the Clusters, the kinds of the context, and the seven kinds of the
// operator (P2), at the versions that the view reads.
export const PAGE_KINDS: readonly Kind[] = [
  { group: CORE, version: "v1beta2", plural: "clusters" },
  { group: CORE, version: "v1beta2", plural: "machines" },
  { group: CORE, version: "v1beta2", plural: "machinesets" },
  { group: CORE, version: "v1beta2", plural: "machinedeployments" },
  { group: CORE, version: "v1beta2", plural: "machinepools" },
  { group: "controlplane.cluster.x-k8s.io", version: "v1beta2", plural: "kubeadmcontrolplanes" },
  { group: CORE, version: "v1beta2", plural: "machinehealthchecks" },
  { group: CORE, version: "v1beta2", plural: "clusterclasses" },
  ...[
    "coreproviders",
    "bootstrapproviders",
    "controlplaneproviders",
    "infrastructureproviders",
    "addonproviders",
    "ipamproviders",
    "runtimeextensionproviders",
  ].map((plural) => ({ group: OPERATOR, version: "v1alpha2", plural })),
];

// The kinds that the tree of a Cluster reads beside them, through its models, in the namespace of its Cluster
// (SPEC-0005, "What the tree reads", P6), at the versions that it reads.
export const TREE_KINDS: readonly Kind[] = [
  { group: "bootstrap.cluster.x-k8s.io", version: "v1beta2", plural: "kubeadmconfigs" },
  { group: "bootstrap.cluster.x-k8s.io", version: "v1beta2", plural: "kubeadmconfigtemplates" },
  { group: "addons.cluster.x-k8s.io", version: "v1beta2", plural: "clusterresourcesets" },
  { group: "addons.cluster.x-k8s.io", version: "v1beta2", plural: "clusterresourcesetbindings" },
  { group: "ipam.cluster.x-k8s.io", version: "v1beta2", plural: "ipaddressclaims" },
  { group: "ipam.cluster.x-k8s.io", version: "v1beta2", plural: "ipaddresses" },
];

const DEVELOPMENT = "infrastructure.cluster.x-k8s.io";

// The infrastructure cluster of the fixtures, a DevCluster of the development provider, which the page and the
// details read for the references of the Clusters at the version of its contract label (P3; SPEC-0001, R1.19).
export const INFRASTRUCTURE: Kind = { group: DEVELOPMENT, version: "v1beta2", plural: "devclusters" };

// The kinds of the providers of the fixtures that the tree reads, through the references of the objects of a Cluster,
// at the version of their contract label: its infrastructure cluster, and the infrastructure machines, their templates
// and the infrastructure machine pools of the development provider (SPEC-0005, P6).
export const PROVIDER_KINDS: readonly Kind[] = [
  INFRASTRUCTURE,
  { group: DEVELOPMENT, version: "v1beta2", plural: "devmachines" },
  { group: DEVELOPMENT, version: "v1beta2", plural: "devmachinetemplates" },
  { group: DEVELOPMENT, version: "v1beta2", plural: "devmachinepools" },
];

// Every kind that an access grants or refuses.
export const READ_KINDS: readonly Kind[] = [...PAGE_KINDS, ...TREE_KINDS, ...PROVIDER_KINDS];

// What the start page of the host reads in the namespace that the filter selects for a cluster opened for the first
// time, `default`: the overview of the workloads, for a user who may not list the Nodes
// (freelens:packages/core/src/renderer/components/workloads-overview/overview.tsx:71-80;
// freelens:packages/core/src/renderer/frames/cluster-frame/start-url.injectable.ts:20-26).
export const START_PAGE_RULES = [
  { apiGroups: [""], resources: ["events", "pods"] },
  { apiGroups: ["apps"], resources: ["daemonsets", "deployments", "replicasets", "statefulsets"] },
  { apiGroups: ["batch"], resources: ["cronjobs", "jobs"] },
] as const;

// The definitions that a view reads by their names when the host may not list them (P3): those of the kinds that a
// Cluster of the fixtures names, its control plane and its infrastructure cluster; and those that the tree of the
// Cluster of `healthy` reads beside them, of its infrastructure machines and of their templates (SPEC-0005, P6).
export const CONTROL_PLANE_DEFINITION = "kubeadmcontrolplanes.controlplane.cluster.x-k8s.io";
export const INFRASTRUCTURE_DEFINITION = "devclusters.infrastructure.cluster.x-k8s.io";
export const MACHINE_DEFINITION = "devmachines.infrastructure.cluster.x-k8s.io";
export const MACHINE_TEMPLATE_DEFINITION = "devmachinetemplates.infrastructure.cluster.x-k8s.io";
export const NAMED_DEFINITIONS = [
  CONTROL_PLANE_DEFINITION,
  INFRASTRUCTURE_DEFINITION,
  MACHINE_DEFINITION,
  MACHINE_TEMPLATE_DEFINITION,
] as const;

// The path of the list of the definitions, which the host makes as the frame of a cluster starts.
export const DEFINITIONS_PATH = "/apis/apiextensions.k8s.io/v1/customresourcedefinitions";

// `default`, which the page reads first, and the namespaces of the fixtures of every state.
export const NAMESPACES: readonly string[] = ["default", ...statesOf(["all"]).map((state) => state.namespace)];

// A kind that an access refuses in a namespace.
export interface Refusal {
  readonly plural: string;
  readonly namespace: string;
}

// What an identity may read, beside the namespaces and the start page of the host, which every access grants.
export type Access =
  | {
      readonly scope: "namespaces";
      readonly refused: readonly Refusal[];
      // Listed, or read by these names alone.
      readonly definitions: "list" | readonly string[];
    }
  | { readonly scope: "cluster" };

// Whether an access lets the identity list a kind, in a namespace, or over the whole cluster with none.
export function allows(access: Access, kind: Kind, namespace: string | undefined): boolean {
  if (access.scope === "cluster") return true;
  if (namespace === undefined || !NAMESPACES.includes(namespace)) return false;
  return !access.refused.some((refusal) => refusal.plural === kind.plural && refusal.namespace === namespace);
}

// Whether an access lets the identity list the definitions, with no name, or get the one of a name.
export function allowsDefinitions(access: Access, name?: string): boolean {
  if (access.scope === "cluster" || access.definitions === "list") return true;
  return name !== undefined && access.definitions.includes(name);
}

type Manifest = Record<string, unknown>;

const LABELS = { [IDENTITY.label]: IDENTITY.labelValue };
const READ_VERBS = ["get", "list", "watch"];
const SUBJECTS = [{ kind: "ServiceAccount", name: IDENTITY.serviceAccount, namespace: IDENTITY.namespace }];
const PREFIX = IDENTITY.serviceAccount;

function metadata(name: string, namespace?: string): Manifest {
  return { name, ...(namespace === undefined ? {} : { namespace }), labels: LABELS };
}

// The rules that grant reading kinds, one for each group, in the order of the kinds.
function readRules(kinds: readonly Kind[]): Manifest[] {
  const groups = new Map<string, string[]>();

  for (const kind of kinds) groups.set(kind.group, [...(groups.get(kind.group) ?? []), kind.plural]);
  return [...groups].map(([group, resources]) => ({ apiGroups: [group], resources, verbs: READ_VERBS }));
}

function clusterRole(name: string, rules: readonly unknown[]): Manifest {
  return { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", metadata: metadata(name), rules };
}

// A binding to a ClusterRole, in a namespace or over the whole cluster, named as its role: the role that a binding
// names cannot change, so a binding to another role is another binding.
function binding(role: string, namespace?: string): Manifest {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: namespace === undefined ? "ClusterRoleBinding" : "RoleBinding",
    metadata: metadata(role, namespace),
    roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "ClusterRole", name: role },
    subjects: SUBJECTS,
  };
}

// The namespace of the identity and its ServiceAccount, which the session makes once.
export function identityObjects(): Manifest[] {
  return [
    { apiVersion: "v1", kind: "Namespace", metadata: metadata(IDENTITY.namespace) },
    { apiVersion: "v1", kind: "ServiceAccount", metadata: metadata(IDENTITY.serviceAccount, IDENTITY.namespace) },
  ];
}

// The role that lets the identity read every kind but those refused, named after them.
function readsRole(refused: readonly string[]): string {
  return refused.length === 0 ? `${PREFIX}-reads` : `${PREFIX}-reads-but-${[...refused].sort().join("-")}`;
}

// The objects of RBAC that grant an access, each with the label of the session.
export function accessObjects(access: Access): Manifest[] {
  const common = [
    clusterRole(`${PREFIX}-namespaces`, [{ apiGroups: [""], resources: ["namespaces"], verbs: READ_VERBS }]),
    binding(`${PREFIX}-namespaces`),
    clusterRole(
      `${PREFIX}-start-page`,
      START_PAGE_RULES.map((rule) => ({ ...rule, verbs: READ_VERBS })),
    ),
    binding(`${PREFIX}-start-page`, "default"),
  ];

  if (access.scope === "cluster") {
    return [
      ...common,
      clusterRole(`${PREFIX}-definitions`, [
        { apiGroups: ["apiextensions.k8s.io"], resources: ["customresourcedefinitions"], verbs: READ_VERBS },
      ]),
      binding(`${PREFIX}-definitions`),
      clusterRole(readsRole([]), readRules(READ_KINDS)),
      binding(readsRole([])),
    ];
  }

  const definitions =
    access.definitions === "list"
      ? { apiGroups: ["apiextensions.k8s.io"], resources: ["customresourcedefinitions"], verbs: READ_VERBS }
      : {
          apiGroups: ["apiextensions.k8s.io"],
          resources: ["customresourcedefinitions"],
          resourceNames: [...access.definitions],
          verbs: ["get"],
        };
  const roles = new Map<string, readonly string[]>();
  const bindings = NAMESPACES.map((namespace) => {
    const refused = access.refused
      .filter((refusal) => refusal.namespace === namespace)
      .map((refusal) => refusal.plural);
    const role = readsRole(refused);

    roles.set(role, refused);
    return binding(role, namespace);
  });

  return [
    ...common,
    clusterRole(`${PREFIX}-definitions`, [definitions]),
    binding(`${PREFIX}-definitions`),
    ...[...roles].map(([role, refused]) =>
      clusterRole(role, readRules(READ_KINDS.filter((kind) => !refused.includes(kind.plural)))),
    ),
    ...bindings,
  ];
}

// An object of the session, by its kind, its namespace, empty for one over the whole cluster, and its name, as the
// session lists them and `extraObjects` compares them.
export interface ObjectKey {
  readonly kind: string;
  readonly namespace: string;
  readonly name: string;
}

export function keyOf(object: Manifest): ObjectKey {
  const meta = object.metadata as { name: string; namespace?: string };

  return { kind: String(object.kind), namespace: meta.namespace ?? "", name: meta.name };
}

// The objects of RBAC of the session that the next access does not have: those that the session deletes once it has
// applied the next.
export function extraObjects(existing: readonly ObjectKey[], next: readonly Manifest[]): ObjectKey[] {
  const kept = new Set(next.map(keyOf).map((key) => `${key.kind}/${key.namespace}/${key.name}`));

  return existing.filter((key) => !kept.has(`${key.kind}/${key.namespace}/${key.name}`));
}

// A permission of the identity and the answer that an access gives it: the list of a kind in a namespace, or over the
// whole cluster with none, the list of the definitions, or the get of one of them by its name.
export interface Permission {
  readonly verb: "list" | "get";
  readonly group: string;
  readonly resource: string;
  readonly namespace?: string;
  readonly name?: string;
  readonly allowed: boolean;
}

// Every permission that an access decides, with its answer: what the session asks the cluster until it answers the
// same, before the identity reads again.
export function permissionsOf(access: Access): Permission[] {
  return [
    ...READ_KINDS.flatMap((kind) =>
      [...NAMESPACES, undefined].map(
        (namespace): Permission => ({
          verb: "list",
          group: kind.group,
          resource: kind.plural,
          ...(namespace === undefined ? {} : { namespace }),
          allowed: allows(access, kind, namespace),
        }),
      ),
    ),
    ...[undefined, ...NAMED_DEFINITIONS].map(
      (name): Permission => ({
        verb: name === undefined ? "list" : "get",
        group: "apiextensions.k8s.io",
        resource: "customresourcedefinitions",
        ...(name === undefined ? {} : { name }),
        allowed: allowsDefinitions(access, name),
      }),
    ),
  ];
}

// The groups that the cluster gives a token of a ServiceAccount, which a review of its access names with its user.
const IDENTITY_GROUPS = [
  "system:serviceaccounts",
  `system:serviceaccounts:${IDENTITY.namespace}`,
  "system:authenticated",
];

// A SubjectAccessReview of each permission, which asks the cluster what it answers the identity, and stores nothing.
export function accessReviews(permissions: readonly Permission[]): Manifest[] {
  return permissions.map(({ verb, group, resource, namespace, name }) => ({
    apiVersion: "authorization.k8s.io/v1",
    kind: "SubjectAccessReview",
    spec: {
      user: IDENTITY_USER,
      groups: IDENTITY_GROUPS,
      resourceAttributes: {
        verb,
        group,
        resource,
        ...(namespace === undefined ? {} : { namespace }),
        ...(name === undefined ? {} : { name }),
      },
    },
  }));
}

// The permissions that the cluster answered otherwise than the access, from the reviews that it gave back as kubectl
// prints the objects of a list that it creates, one after the other (`printedObjects` of the scripts), in the order of
// the permissions, each said as `verb resource.group in namespace`.
export function wrongAnswers(permissions: readonly Permission[], printed: string): string[] {
  const items = printedObjects(printed);

  if (items.length !== permissions.length) {
    return [`The cluster answered ${items.length} reviews of ${permissions.length}`];
  }
  return permissions
    .filter((permission, index) => (items[index].status?.allowed === true) !== permission.allowed)
    .map(
      ({ verb, group, resource, namespace, name, allowed }) =>
        `${allowed ? "not allowed" : "allowed"}: ${verb} ${resource}.${group}${name === undefined ? "" : `/${name}`} ${namespace === undefined ? "over the whole cluster" : `in ${namespace}`}`,
    );
}

// The path of the list of a kind, in a namespace or over the whole cluster with none.
export function listPath(kind: Kind, namespace?: string): string {
  return `/apis/${kind.group}/${kind.version}/${namespace === undefined ? "" : `namespaces/${namespace}/`}${kind.plural}`;
}

// The refusals that the page expects when it reads every kind in these namespaces, or over the whole cluster with
// every namespace selected: the list of each kind that the access refuses there.
export function refusedLists(access: Access, namespaces: readonly string[] | "every"): string[] {
  return READ_KINDS.flatMap((kind) =>
    namespaces === "every"
      ? allows(access, kind, undefined)
        ? []
        : [listPath(kind)]
      : namespaces
          .filter((namespace) => !allows(access, kind, namespace))
          .map((namespace) => listPath(kind, namespace)),
  );
}

// The refusals of the definitions that an access expects: the list that the host makes as the frame of a cluster
// starts, and the get of each definition that a view reads by its name and the access does not name.
export function refusedDefinitions(access: Access): string[] {
  return [
    ...(allowsDefinitions(access) ? [] : [DEFINITIONS_PATH]),
    ...NAMED_DEFINITIONS.filter((name) => !allowsDefinitions(access, name)).map(
      (name) => `${DEFINITIONS_PATH}/${name}`,
    ),
  ];
}

// The kubeconfig of the identity, as JSON, which a kubeconfig file may hold: one cluster, the API server of the
// kubeconfig of the scripts verified with the authority that kind generated, one user with the token of the
// identity, and one context of the name of the identity, which is current.
export function kubeconfigOf(server: string, certificateAuthorityData: string, token: string): string {
  const name = IDENTITY.context;

  return `${JSON.stringify(
    {
      apiVersion: "v1",
      kind: "Config",
      clusters: [{ name, cluster: { server, "certificate-authority-data": certificateAuthorityData } }],
      users: [{ name, user: { token } }],
      contexts: [{ name, context: { cluster: name, user: name } }],
      "current-context": name,
      preferences: {},
    },
    null,
    2,
  )}\n`;
}
