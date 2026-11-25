/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The two annotations of Cluster API that hold lists, each read as its controller reads it (SPEC-0003, "The
// parsers", P29; SPEC-0001, R3.21 and R3.22). The value is split on commas, the empty items are dropped, and each
// item is kept once, in the order of the value.
//
// - `runtime.cluster.x-k8s.io/pending-hooks`: the hooks that a Cluster or a Machine waits to call. The items are
//   not trimmed, since the tracker of the hooks matches an item exactly (internal/hooks/tracking.go:62-82,
//   174-200): an item with a space is another item, and unknown.
// - `machineset.cluster.x-k8s.io/skip-preflight-checks`: the preflight checks that a MachineSet skips. The items
//   are trimmed of white space, as the MachineSet controller trims them with `strings.TrimSpace` of Go
//   (core/reconcilers/machineset/machineset_preflight.go:240-277).
//
// An item that is not in the set of its key is kept as written and marked unknown. For the preflight checks, such
// an item skips nothing, since the controller matches the names exactly
// (core/reconcilers/machineset/machineset_preflight.go:149-152): the names that the comment of the annotation
// itself gives, `KubeadmVersion`, `KubernetesVersion` and `ControlPlaneStable`, are such items
// (api/core/v1beta2/common_types.go:144-150).

export const PENDING_HOOKS_ANNOTATION = "runtime.cluster.x-k8s.io/pending-hooks";
export const SKIP_PREFLIGHT_CHECKS_ANNOTATION = "machineset.cluster.x-k8s.io/skip-preflight-checks";

// The hooks that the controllers mark as pending: those of a Cluster, then the one of a Machine. The parser reads
// the key and the value, not the kind of the object, so the set of the key holds both.
export const PENDING_HOOKS = [
  "AfterControlPlaneInitialized",
  "AfterControlPlaneUpgrade",
  "BeforeWorkersUpgrade",
  "AfterWorkersUpgrade",
  "AfterClusterUpgrade",
  "UpdateMachine",
] as const;

// The preflight checks of a MachineSet (api/core/v1beta2/common_types.go:222-260).
export const PREFLIGHT_CHECKS = [
  "All",
  "KubeadmVersionSkew",
  "KubernetesVersionSkew",
  "ControlPlaneIsStable",
  "ControlPlaneVersionSkew",
] as const;

const LISTS: Record<ListAnnotationKey, { names: readonly string[]; trimmed: boolean }> = {
  [PENDING_HOOKS_ANNOTATION]: { names: PENDING_HOOKS, trimmed: false },
  [SKIP_PREFLIGHT_CHECKS_ANNOTATION]: { names: PREFLIGHT_CHECKS, trimmed: true },
};

export type ListAnnotationKey = typeof PENDING_HOOKS_ANNOTATION | typeof SKIP_PREFLIGHT_CHECKS_ANNOTATION;

// The white space that `strings.TrimSpace` of Go trims: the characters of the White_Space property of Unicode, as
// the documentation of `unicode.IsSpace` of Go defines them, which the reviewed sources do not hold. The trim of
// JavaScript differs on two: it trims U+FEFF, which Go keeps, and keeps U+0085, which Go trims. Each one is a
// single code unit, so a string is trimmed one code unit at a time, in a time linear in its length.
const GO_WHITE_SPACE = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/;

function trimGoWhiteSpace(text: string): string {
  let start = 0;
  let end = text.length;

  while (start < end && GO_WHITE_SPACE.test(text[start])) start++;
  while (end > start && GO_WHITE_SPACE.test(text[end - 1])) end--;
  return text.slice(start, end);
}

export interface ListItem {
  // The item as the value holds it, trimmed for the preflight checks.
  name: string;
  // Whether the item is in the set of its key.
  known: boolean;
}

export type ListAnnotation =
  // The items of the value; none when the annotation is absent or empty.
  | { state: "read"; items: ListItem[] }
  // A value that is not a string, or a key that holds no list.
  | { state: "unknown" };

// The items of the value of an annotation, `undefined` when the object does not carry it. A value that is not a
// string, or a key that holds no list, is unknown, and nothing throws.
export function parseListAnnotation(key: ListAnnotationKey, value: unknown): ListAnnotation {
  const list = Object.hasOwn(LISTS, key) ? LISTS[key] : undefined;

  if (list === undefined) return { state: "unknown" };
  if (value === undefined) return { state: "read", items: [] };
  if (typeof value !== "string") return { state: "unknown" };

  const items: ListItem[] = [];
  // The names already kept, so that each item is kept once in a time linear in the number of items: anyone who
  // may annotate the object chooses the length of the value.
  const kept = new Set<string>();

  for (const written of value.split(",")) {
    const name = list.trimmed ? trimGoWhiteSpace(written) : written;

    if (name !== "" && !kept.has(name)) {
      kept.add(name);
      items.push({ name, known: list.names.includes(name) });
    }
  }
  return { state: "read", items };
}
