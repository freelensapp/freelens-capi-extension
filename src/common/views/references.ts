/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The references that a Cluster makes (SPEC-0004, P3, P18): a reference of the contract names a group, a kind and a
// name, and the version at which the object is read is the one that the contract label of the definition of its kind
// gives, with the parser of SPEC-0003, never guessed; its plural is that of the definition. A reference that cannot
// be resolved says why: its definition cannot be read, it names no version that the parser knows, or the cluster
// serves no such kind. The reference to a ClusterClass names its namespace, or none for that of the Cluster. The
// target of a reference is shown as a link only when the view read it, and otherwise says why it is not (P18): one of
// those reasons, its kind could not be read in the namespace of the Cluster, or the object does not exist there.
//
// The tree of a Cluster follows more references (SPEC-0005, P6, P7): those of its Machines, the templates of its
// MachineDeployments, MachineSets and MachinePools, the bootstrap config and the infrastructure machine pool of a
// MachinePool, and the template of the Machines of each of its control planes, at `v1beta1` an object reference from
// whose `apiVersion` the tree takes the group alone. It follows no other reference (P8): not the remediation template
// of a MachineHealthCheck, the pool of an IPAddressClaim, the Node of a Machine, or the templates of a ClusterClass.
// One function, `followedReferencesOf`, says what an object names, for the reads of the tree and for the tree, and
// `followedObjectsOf` gives the reads the objects of a Cluster by which the tree places what they name.

import { parseContractLabel } from "../parsers/contract-label";
import { fieldsOf, groupOf, namespaceOf, textOf } from "./objects";

import type { ContractVersion } from "../parsers/contract-label";
import type { KubeObjectData, ProviderRole } from "../status/index";
import type { NamespaceRead, ReadFailure } from "./read-state";

// The label of the definition of a kind of a provider that names the provider, by its manifest label
// (SPEC-0003, P24).
export const PROVIDER_LABEL = "cluster.x-k8s.io/provider";

export interface ContractReference {
  readonly apiGroup: string;
  readonly kind: string;
  readonly name: string;
}

// A definition of a kind, as the views read it, from the store of definitions of the host or from a GET of it by
// its name.
export interface DefinitionData {
  readonly name: string;
  readonly group: string;
  readonly kind: string;
  readonly plural: string;
  readonly labels: Readonly<Record<string, unknown>> | undefined;
}

// The read of the definition of the kind that a reference names.
export type DefinitionRead =
  // Not read yet: the store of definitions of the host has not loaded, or the GET of it runs.
  | { readonly state: "pending" }
  | { readonly state: "read"; readonly definition: DefinitionData }
  // The cluster serves no such kind: its definitions, or its discovery, have none.
  | { readonly state: "not-served" }
  // The read was refused or failed.
  | { readonly state: "refused" | "failed"; readonly failure: ReadFailure };

export type ResolvedReference =
  | { readonly state: "pending"; readonly reference: ContractReference }
  | {
      readonly state: "resolved";
      readonly reference: ContractReference;
      // The version of the group to read the object at, as `group/version`, and the plural of the definition.
      readonly apiVersion: string;
      readonly plural: string;
      readonly contract: ContractVersion;
      // The manifest label of the provider that serves the kind, when its definition names one (SPEC-0003, P24).
      readonly provider: string | undefined;
    }
  | {
      readonly state: "unresolved";
      readonly reference: ContractReference;
      readonly reason: "definition-refused" | "definition-failed" | "no-known-version" | "not-served";
      readonly failure: ReadFailure | undefined;
    };

// A definition, from the object that the host or a GET hands the view; undefined for one that it cannot read.
export function definitionOf(object: KubeObjectData): DefinitionData | undefined {
  const spec = fieldsOf(object.spec);
  const names = fieldsOf(spec?.names);
  const name = textOf(fieldsOf(object.metadata)?.name);
  const group = textOf(spec?.group);
  const kind = textOf(names?.kind);
  const plural = textOf(names?.plural);

  if (name === undefined || group === undefined || kind === undefined || plural === undefined) return undefined;
  return { name, group, kind, plural, labels: fieldsOf(fieldsOf(object.metadata)?.labels) };
}

// The definition of a group and a kind among those of the store of definitions.
export function findDefinition(
  definitions: readonly DefinitionData[],
  group: string,
  kind: string,
): DefinitionData | undefined {
  return definitions.find((definition) => definition.group === group && definition.kind === kind);
}

// A reference of the contract, from the field of a spec that holds it; undefined when it is not set.
export function contractReferenceOf(value: unknown): ContractReference | undefined {
  const fields = fieldsOf(value);
  const apiGroup = textOf(fields?.apiGroup);
  const kind = textOf(fields?.kind);
  const name = textOf(fields?.name);

  if (apiGroup === undefined || kind === undefined || name === undefined) return undefined;
  if (apiGroup === "" || kind === "" || name === "") return undefined;
  return { apiGroup, kind, name };
}

// A reference of the `v1beta1` contract of a control plane to the template of its Machines, an object reference with
// `apiVersion`, `kind` and `name` (internal/contract/references.go:52-69): its group is the part of `apiVersion` before
// its `/`, and its version is never taken from it, but from the contract label of the definition of its kind
// (SPEC-0001, A2; SPEC-0005, P6). Undefined when a field is missing or empty, or for the core group.
export function objectReferenceOf(value: unknown): ContractReference | undefined {
  const fields = fieldsOf(value);
  const apiVersion = textOf(fields?.apiVersion);

  return apiVersion === undefined
    ? undefined
    : contractReferenceOf({ apiGroup: groupOf(apiVersion), kind: fields?.kind, name: fields?.name });
}

// The kinds of Cluster API at v1.14.4, as SPEC-0001, R1 lists them, the `Provider` of `clusterctl` and the seven kinds
// of the operator included (SPEC-0001, A12; SPEC-0005, P5): every kind of the group `cluster.x-k8s.io`, and these of the
// other groups. Any other kind is of a provider, one in those groups included, since the kinds of a provider are known
// only at run time (SPEC-0001, R1.15).
const CLUSTER_API_GROUP = "cluster.x-k8s.io";
const KUBEADM_CONTROL_PLANE_GROUP = "controlplane.cluster.x-k8s.io";
const CLUSTER_API_KINDS: ReadonlySet<string> = new Set([
  "addons.cluster.x-k8s.io/ClusterResourceSet",
  "addons.cluster.x-k8s.io/ClusterResourceSetBinding",
  "bootstrap.cluster.x-k8s.io/KubeadmConfig",
  "bootstrap.cluster.x-k8s.io/KubeadmConfigTemplate",
  "controlplane.cluster.x-k8s.io/KubeadmControlPlane",
  "controlplane.cluster.x-k8s.io/KubeadmControlPlaneTemplate",
  "ipam.cluster.x-k8s.io/IPAddress",
  "ipam.cluster.x-k8s.io/IPAddressClaim",
  "runtime.cluster.x-k8s.io/ExtensionConfig",
  "clusterctl.cluster.x-k8s.io/Provider",
  "operator.cluster.x-k8s.io/CoreProvider",
  "operator.cluster.x-k8s.io/BootstrapProvider",
  "operator.cluster.x-k8s.io/ControlPlaneProvider",
  "operator.cluster.x-k8s.io/InfrastructureProvider",
  "operator.cluster.x-k8s.io/AddonProvider",
  "operator.cluster.x-k8s.io/IPAMProvider",
  "operator.cluster.x-k8s.io/RuntimeExtensionProvider",
]);

export function isClusterApiKind(group: string, kind: string): boolean {
  return group === CLUSTER_API_GROUP || CLUSTER_API_KINDS.has(`${group}/${kind}`);
}

// The fields by which the tree finds an object through a reference of another (SPEC-0005, P7).
export type ReferenceField =
  | "spec.infrastructureRef"
  | "spec.controlPlaneRef"
  | "spec.bootstrap.configRef"
  | "spec.template.spec.infrastructureRef"
  | "spec.template.spec.bootstrap.configRef"
  | "spec.machineTemplate.spec.infrastructureRef"
  | "spec.machineTemplate.infrastructureRef";

// The role that a reference gives the object that it names (SPEC-0001, R1.15; SPEC-0003, P15): the roles of the
// objects that the tree places through references, a role of `ProviderRole`. An object of Cluster API keeps its kind as
// its role, which the tree tells by `isClusterApiKind`.
export type ReferenceRole = Exclude<ProviderRole, "ipam-pool" | "remediation-request">;

// A reference that the tree follows, from the object that holds it, by the field that holds it, with the role that it
// gives its object (SPEC-0005, P6, P7).
export interface FollowedReference {
  readonly reference: ContractReference;
  readonly from: KubeObjectData;
  readonly field: ReferenceField;
  readonly role: ReferenceRole;
}

// A template is a kind whose name ends in `Template`, as the controllers of the project tell one
// (core/reconcilers/machineset/machineset_controller.go:1860; SPEC-0005, P7).
export function isTemplateKind(kind: string): boolean {
  return kind.endsWith("Template");
}

function followed(
  from: KubeObjectData,
  field: ReferenceField,
  role: ReferenceRole,
  value: unknown,
  read: (value: unknown) => ContractReference | undefined = contractReferenceOf,
): FollowedReference[] {
  const reference = read(value);

  return reference === undefined ? [] : [{ reference, from, field, role }];
}

// The references of a Cluster: its infrastructure cluster and its control plane (SPEC-0004, P3).
export function clusterReferencesOf(cluster: KubeObjectData): FollowedReference[] {
  const spec = fieldsOf(cluster.spec);

  return [
    ...followed(cluster, "spec.infrastructureRef", "infrastructure-cluster", spec?.infrastructureRef),
    ...followed(cluster, "spec.controlPlaneRef", "control-plane", spec?.controlPlaneRef),
  ];
}

// The references of a Machine: its infrastructure machine and its bootstrap config (SPEC-0005, P7).
export function machineReferencesOf(machine: KubeObjectData): FollowedReference[] {
  const spec = fieldsOf(machine.spec);

  return [
    ...followed(machine, "spec.infrastructureRef", "infrastructure-machine", spec?.infrastructureRef),
    ...followed(machine, "spec.bootstrap.configRef", "bootstrap-config", fieldsOf(spec?.bootstrap)?.configRef),
  ];
}

// The template references of a MachineDeployment, a MachineSet or a MachinePool, in the spec of the template of their
// Machines: a reference to a kind whose name ends in `Template` names a template; of a MachinePool, a reference to any
// other kind names its infrastructure machine pool or its bootstrap config (SPEC-0005, P7). A MachineDeployment or a
// MachineSet that names a kind that is no template names nothing that the tree places by that reference.
export function templateReferencesOf(owner: KubeObjectData): FollowedReference[] {
  const spec = fieldsOf(fieldsOf(fieldsOf(owner.spec)?.template)?.spec);
  const pool = textOf(owner.kind) === "MachinePool";
  const all = [
    ...followed(owner, "spec.template.spec.infrastructureRef", "infrastructure-machine-pool", spec?.infrastructureRef),
    ...followed(
      owner,
      "spec.template.spec.bootstrap.configRef",
      "bootstrap-config",
      fieldsOf(spec?.bootstrap)?.configRef,
    ),
  ];

  return all.flatMap((entry) => {
    if (isTemplateKind(entry.reference.kind)) return [{ ...entry, role: "template" as const }];
    return pool ? [entry] : [];
  });
}

// The reference of a control plane to the template of its Machines, by the field that its contract names
// (internal/contract/controlplane.go:466-477; SPEC-0005, P6): at `v1beta2`, `spec.machineTemplate.spec.infrastructureRef`,
// a reference of the contract; at `v1beta1`, `spec.machineTemplate.infrastructureRef`, an object reference. A kind of
// Cluster API, as the KubeadmControlPlane, follows the contract at `v1beta2`. It names a template.
export function controlPlaneTemplateOf(
  controlPlane: KubeObjectData,
  contract: ContractVersion | undefined,
): FollowedReference[] {
  const template = fieldsOf(fieldsOf(controlPlane.spec)?.machineTemplate);
  const entries =
    contract === "v1beta1"
      ? followed(
          controlPlane,
          "spec.machineTemplate.infrastructureRef",
          "template",
          template?.infrastructureRef,
          objectReferenceOf,
        )
      : followed(
          controlPlane,
          "spec.machineTemplate.spec.infrastructureRef",
          "template",
          fieldsOf(template?.spec)?.infrastructureRef,
        );

  return entries.filter((entry) => isTemplateKind(entry.reference.kind));
}

// What an object names that the tree of a Cluster follows (SPEC-0005, P6, P7, P8), the one function that says it for
// the reads of the tree and for the tree itself: of a Cluster, its infrastructure cluster and its control plane; of a
// Machine, its infrastructure machine and its bootstrap config; of a MachineDeployment, a MachineSet and a MachinePool,
// the references of the spec of the template of their Machines; of a control plane, the template of its Machines by the
// field of its contract: a KubeadmControlPlane at `v1beta2`, which needs no definition, and a control plane of a
// provider, which the reference of its Cluster tells, at the contract that its definition gives. It follows no other
// (P8): not the remediation template that a MachineHealthCheck names, the pool of an IPAddressClaim or of an
// IPAddress, the Node of a Machine, nor the templates of a ClusterClass, whose class is one node.
export function followedReferencesOf(
  object: KubeObjectData,
  controlPlane?: { readonly contract: ContractVersion },
): FollowedReference[] {
  const group = groupOf(textOf(object.apiVersion) ?? "");
  const kind = textOf(object.kind);

  if (controlPlane !== undefined) return controlPlaneTemplateOf(object, controlPlane.contract);
  if (group === KUBEADM_CONTROL_PLANE_GROUP && kind === "KubeadmControlPlane") {
    return controlPlaneTemplateOf(object, "v1beta2");
  }
  if (group !== CLUSTER_API_GROUP) return [];
  switch (kind) {
    case "Cluster":
      return clusterReferencesOf(object);
    case "Machine":
      return machineReferencesOf(object);
    case "MachineDeployment":
    case "MachineSet":
    case "MachinePool":
      return templateReferencesOf(object);
    default:
      return [];
  }
}

// The label with the name of the Cluster of an object (SPEC-0001, R3.1).
export const CLUSTER_NAME_LABEL = "cluster.x-k8s.io/cluster-name";

// The names of the Clusters that an object names, by the label of the name of its Cluster or by `spec.clusterName`,
// which give the objects of a Cluster to its tree (SPEC-0005, P7).
export function clusterNamesOf(object: KubeObjectData): string[] {
  const labels = fieldsOf(fieldsOf(object.metadata)?.labels);
  const label =
    labels !== undefined && Object.hasOwn(labels, CLUSTER_NAME_LABEL) ? textOf(labels[CLUSTER_NAME_LABEL]) : undefined;
  const named = textOf(fieldsOf(object.spec)?.clusterName);

  return [...new Set([label, named].filter((name): name is string => name !== undefined && name !== ""))];
}

// The objects that the reads of the tree of a Cluster read for what they name, by the kind of their store.
export interface TreeSources {
  readonly machines: readonly KubeObjectData[];
  readonly machineDeployments: readonly KubeObjectData[];
  readonly machineSets: readonly KubeObjectData[];
  readonly machinePools: readonly KubeObjectData[];
  readonly kubeadmControlPlanes: readonly KubeObjectData[];
  // The objects of the kind of a provider that the control plane reference of the Cluster names, with the contract of
  // its definition, once that resolves.
  readonly controlPlanes?: { readonly objects: readonly KubeObjectData[]; readonly contract: ContractVersion };
}

// An object whose references the tree follows, and, for a control plane, the contract by whose field it names the
// template of its Machines.
export interface FollowedObject {
  readonly object: KubeObjectData;
  readonly controlPlane: { readonly contract: ContractVersion } | undefined;
}

// The objects of a Cluster whose references the reads of its tree follow, beside the Cluster itself, to learn the
// kinds of the providers that the tree reads (SPEC-0005, P6), the objects by which the tree places what they name
// (P7), so that the reads and the tree follow the same references: the Machines, the MachineDeployments, the
// MachineSets and the MachinePools that their label or their `spec.clusterName` gives the Cluster, in its namespace;
// and its control planes, the one that its reference names and any other that its label gives it, a
// KubeadmControlPlane at `v1beta2` with no definition, and an object of the kind of a provider that the Cluster names
// as its control plane at the contract of its definition, once that resolves.
export function followedObjectsOf(cluster: KubeObjectData, sources: TreeSources): FollowedObject[] {
  const namespace = namespaceOf(cluster);
  const name = textOf(fieldsOf(cluster.metadata)?.name) ?? "";
  const named = contractReferenceOf(fieldsOf(cluster.spec)?.controlPlaneRef);
  const ofCluster = (object: KubeObjectData) =>
    namespaceOf(object) === namespace && clusterNamesOf(object).includes(name);
  const isControlPlane = (object: KubeObjectData) =>
    ofCluster(object) ||
    (named !== undefined &&
      namespaceOf(object) === namespace &&
      groupOf(textOf(object.apiVersion) ?? "") === named.apiGroup &&
      textOf(object.kind) === named.kind &&
      textOf(fieldsOf(object.metadata)?.name) === named.name);
  const { controlPlanes } = sources;
  const ofProvider =
    controlPlanes === undefined
      ? []
      : controlPlanes.objects
          .filter(isControlPlane)
          .map((object) => ({ object, controlPlane: { contract: controlPlanes.contract } }));

  return [
    ...[...sources.machines, ...sources.machineDeployments, ...sources.machineSets, ...sources.machinePools]
      .filter(ofCluster)
      .map((object) => ({ object, controlPlane: undefined })),
    ...sources.kubeadmControlPlanes
      .filter(isControlPlane)
      .map((object) => ({ object, controlPlane: { contract: "v1beta2" as const } })),
    ...ofProvider,
  ];
}

// The version and the plural of the kind that a reference names, from the read of its definition.
export function resolveReference(reference: ContractReference, read: DefinitionRead): ResolvedReference {
  switch (read.state) {
    case "pending":
      return { state: "pending", reference };
    case "not-served":
      return { state: "unresolved", reference, reason: "not-served", failure: undefined };
    case "refused":
      return { state: "unresolved", reference, reason: "definition-refused", failure: read.failure };
    case "failed":
      return { state: "unresolved", reference, reason: "definition-failed", failure: read.failure };
  }

  const { definition } = read;
  const contract = parseContractLabel(definition.labels);

  if (contract.state === "unknown") {
    return { state: "unresolved", reference, reason: "no-known-version", failure: undefined };
  }

  const provider = definition.labels === undefined ? undefined : textOf(definition.labels[PROVIDER_LABEL]);

  return {
    state: "resolved",
    reference,
    apiVersion: `${definition.group}/${contract.version}`,
    plural: definition.plural,
    contract: contract.contract,
    provider: provider === "" ? undefined : provider,
  };
}

// The ClusterClass of a Cluster with a managed topology: its name, and its namespace, that of the Cluster when the
// reference names none (SPEC-0001, R3.12).
export interface ClassReference {
  readonly name: string;
  readonly namespace: string | undefined;
  // Whether the reference names another namespace than that of the Cluster.
  readonly elsewhere: boolean;
}

export function classReferenceOf(cluster: KubeObjectData): ClassReference | undefined {
  const reference = fieldsOf(fieldsOf(fieldsOf(cluster.spec)?.topology)?.classRef);
  const name = textOf(reference?.name);
  const named = textOf(reference?.namespace);
  const own = namespaceOf(cluster);

  if (name === undefined || name === "") return undefined;

  const namespace = named === undefined || named === "" ? own : named;

  return { name, namespace, elsewhere: namespace !== own };
}

// Why the target of a reference is not shown as a link (P18): its definition refused or failed, a definition that names
// no version that the parser knows, a kind that the cluster does not serve, a kind whose definition the cluster has
// and whose version of the contract it does not serve, its kind not read in the namespace of the Cluster, or no such
// object in that namespace, which was read.
export type UnreadReason =
  | Extract<ResolvedReference, { readonly state: "unresolved" }>["reason"]
  | "version-not-served"
  | "kind-not-read"
  | "not-found";

export type TargetRead =
  | { readonly state: "found" }
  // Its definition, or its kind in the namespace of the Cluster, is still being read.
  | { readonly state: "pending" }
  | { readonly state: "unread"; readonly reason: UnreadReason; readonly failures: readonly ReadFailure[] };

// How the target of a reference was read: from the resolution of the reference, the read of its kind in the namespace
// of the Cluster, which is `not-served` for a kind with no store, the failures that hold that kind back there, and
// whether the object is in the store.
export function targetReadOf(
  resolution: ResolvedReference | undefined,
  kindRead: NamespaceRead | "not-served",
  held: readonly ReadFailure[],
  found: boolean,
): TargetRead {
  if (found) return { state: "found" };
  if (resolution === undefined || resolution.state === "pending") return { state: "pending" };
  if (resolution.state === "unresolved") {
    return {
      state: "unread",
      reason: resolution.reason,
      failures: resolution.failure === undefined ? [] : [resolution.failure],
    };
  }
  // The definition names a version that the host registered no API for: the cluster has the kind, not at that version.
  if (kindRead === "not-served") return { state: "unread", reason: "version-not-served", failures: [] };
  if (kindRead.state === "held") return { state: "unread", reason: "kind-not-read", failures: held };
  if (kindRead.state !== "read") return { state: "pending" };
  return { state: "unread", reason: "not-found", failures: [] };
}
