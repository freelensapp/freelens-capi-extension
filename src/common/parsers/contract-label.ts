/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The contract of the definition of a kind of a provider, and the version of the kind to request, from the labels
// of the definition, as Cluster API reads them (SPEC-0003, "The parsers", P26; SPEC-0001, R1.16 and R1.17;
// internal/contract/version.go:118-144, 183-195). The label `cluster.x-k8s.io/v1beta2` is read, or
// `cluster.x-k8s.io/v1beta1` when that one is missing or empty, and any other contract label is ignored. Its value
// lists versions joined by `_`, of which the latest in the order of Kubernetes is requested: a version with no
// `alpha` or `beta` first, then `beta`, then `alpha`, then the higher major, then the higher minor.
//
// The order of an item of another form comes from a library of Kubernetes that the reviewed sources do not hold,
// and a version that the extension does not understand is not one it should request: such an item, an empty one
// included, is left out, and with no item left the result is unknown, as it is for the definitions of the core,
// which carry no contract label.

export const CONTRACT_LABELS = {
  v1beta2: "cluster.x-k8s.io/v1beta2",
  v1beta1: "cluster.x-k8s.io/v1beta1",
} as const;

export type ContractVersion = keyof typeof CONTRACT_LABELS;

export type ContractLabel =
  // The contract whose label was read, and the version to request.
  | { state: "known"; contract: ContractVersion; version: string }
  // No label to read, no version of the form in it, or labels of the wrong type: a reference to the kind is
  // shown as its group, kind and name, with no link.
  | { state: "unknown" };

// The order of the stability of a version, the latest last.
const STABILITIES = ["alpha", "beta", ""];

// `v`, a major, and optionally `alpha` or `beta` and a minor, each number without a leading zero: `v01` is not of
// the form, and is left out with the items of any other form. Neither is a major or a minor above 2^53 - 1, which
// would not keep its value.
const API_VERSION = /^v(0|[1-9]\d*)(?:(alpha|beta)(0|[1-9]\d*))?$/;

type Rank = [stability: number, major: number, minor: number];

// The stability, the major and the minor of a version of the form, in the order of comparison.
function rank(version: string): Rank | undefined {
  const found = API_VERSION.exec(version);

  if (!found) return undefined;

  const major = Number(found[1]);
  const minor = Number(found[3] ?? 0);

  if (major > Number.MAX_SAFE_INTEGER || minor > Number.MAX_SAFE_INTEGER) return undefined;
  return [STABILITIES.indexOf(found[2] ?? ""), major, minor];
}

function isLater(one: Rank, other: Rank): boolean {
  for (let index = 0; index < one.length; index++) {
    if (one[index] !== other[index]) return one[index] > other[index];
  }
  return false;
}

function isLabels(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The contract and the version to request, from the labels of a definition. A label of the wrong type makes the
// result unknown, as do labels that are not an object, and nothing throws.
export function parseContractLabel(labels: unknown): ContractLabel {
  if (!isLabels(labels)) return { state: "unknown" };

  for (const contract of ["v1beta2", "v1beta1"] as const) {
    const key = CONTRACT_LABELS[contract];
    const value = Object.hasOwn(labels, key) ? labels[key] : undefined;

    if (value === undefined || value === "") continue;
    if (typeof value !== "string") return { state: "unknown" };

    let latest: { version: string; rank: Rank } | undefined;

    for (const version of value.split("_")) {
      const found = rank(version);

      if (found && (!latest || isLater(found, latest.rank))) latest = { version, rank: found };
    }
    return latest ? { state: "known", contract, version: latest.version } : { state: "unknown" };
  }
  return { state: "unknown" };
}
