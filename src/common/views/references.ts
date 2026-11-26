/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The references that a Cluster makes (SPEC-0004, P3, P18): a reference of the contract names a group, a kind and a
// name, and the version at which the object is read is the one that the contract label of the definition of its kind
// gives, with the parser of SPEC-0003, never guessed; its plural is that of the definition. A reference that cannot
// be resolved says why: its definition cannot be read, it names no version that the parser knows, or the cluster
// serves no such kind. The reference to a ClusterClass names its namespace, or none for that of the Cluster.

import { parseContractLabel } from "../parsers/contract-label";
import { fieldsOf, namespaceOf, textOf } from "./objects";

import type { ContractVersion } from "../parsers/contract-label";
import type { KubeObjectData } from "../status/index";
import type { ReadFailure } from "./read-state";

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
