/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The reading of the fields of the objects that the views hand the status model and show. The host hands the objects
// of its stores, whose types the views do not take on trust: a field of the wrong type reads as absent here, and the
// model, which reads every field with a check of its own, says what it could not read.

import type { KubeObjectData } from "../status/index";

export type Fields = Readonly<Record<string, unknown>>;

export function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fieldsOf(value: unknown): Fields | undefined {
  return isFields(value) ? value : undefined;
}

export function textOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

// A count as the project writes it: an integer of 0 or more that keeps its value.
export function countOf(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

export function metadataOf(object: KubeObjectData): Fields | undefined {
  return fieldsOf(object.metadata);
}

export function nameOf(object: KubeObjectData): string | undefined {
  return textOf(metadataOf(object)?.name);
}

export function namespaceOf(object: KubeObjectData): string | undefined {
  return textOf(metadataOf(object)?.namespace);
}

// The value of a label of an object, when it is text.
export function labelOf(object: KubeObjectData, key: string): string | undefined {
  const labels = fieldsOf(metadataOf(object)?.labels);

  return labels !== undefined && Object.hasOwn(labels, key) ? textOf(labels[key]) : undefined;
}

// What identifies the version of an object that a view read: its `uid` and its `resourceVersion`. The objects of the
// fixtures, which the unit tests read, have neither, and are told apart by their kind, namespace and name.
export function versionOf(object: KubeObjectData): string {
  const metadata = metadataOf(object);
  const uid = textOf(metadata?.uid) ?? `${textOf(object.kind)}/${namespaceOf(object)}/${nameOf(object)}`;

  return `${uid}@${textOf(metadata?.resourceVersion) ?? ""}`;
}

// An owner of an object, as Kubernetes writes it.
export interface Owner {
  readonly group: string;
  readonly kind: string;
  readonly name: string;
  readonly uid: string | undefined;
  readonly controller: boolean;
}

// The group of an `apiVersion`, empty for the core group.
export function groupOf(apiVersion: string): string {
  const slash = apiVersion.indexOf("/");

  return slash === -1 ? "" : apiVersion.slice(0, slash);
}

export function ownersOf(object: KubeObjectData): Owner[] {
  return listOf(metadataOf(object)?.ownerReferences).flatMap((entry) => {
    const owner = fieldsOf(entry);
    const apiVersion = textOf(owner?.apiVersion);
    const kind = textOf(owner?.kind);
    const name = textOf(owner?.name);

    if (apiVersion === undefined || kind === undefined || name === undefined) return [];
    return [
      { group: groupOf(apiVersion), kind, name, uid: textOf(owner?.uid), controller: owner?.controller === true },
    ];
  });
}
