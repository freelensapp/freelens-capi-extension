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
// MachinePool, and the template of the Machines of its control plane, at `v1beta1` an object reference from whose
// `apiVersion` the tree takes the group alone. It follows no other reference (P8): not the remediation template of a
// MachineHealthCheck, the pool of an IPAddressClaim, the Node of a Machine, or the templates of a ClusterClass.

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

// The references that the tree follows from an object, by its kind, or, for a control plane of a provider, by the role
// that the reference of its Cluster gives it, with the contract of its definition (SPEC-0005, P6, P7). It follows no
// other (P8): not the remediation template that a MachineHealthCheck names, the pool of an IPAddressClaim or of an
// IPAddress, the Node of a Machine, nor the templates of a ClusterClass, whose class is one node.
export function referencesOf(
  object: KubeObjectData,
  controlPlane?: { readonly contract: ContractVersion | undefined },
): FollowedReference[] {
  if (controlPlane !== undefined) return controlPlaneTemplateOf(object, controlPlane.contract);
  if (groupOf(textOf(object.apiVersion) ?? "") !== CLUSTER_API_GROUP) return [];
  switch (textOf(object.kind)) {
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
