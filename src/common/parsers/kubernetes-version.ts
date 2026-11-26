/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The versions of Kubernetes that the objects carry (SPEC-0003, "The parsers", P28): `spec.version`,
// `spec.topology.version`, the entries of `status.versions` and of the upgrade plans, and `status.version` of a
// control plane. A version is a semantic version, with the leading `v` that the webhooks of the project require
// and add, or without it, as an object written without the webhooks may carry it. Anything else is unknown: it is
// shown as written and never compared. The project reads these versions with a tolerant parser whose tolerance
// the reviewed sources do not hold, so a version that only that parser reads is not guessed here.
//
// Two versions are ordered as the project orders them when it decides that a control plane is upgrading
// (util/version/version.go:52-201; internal/contract/controlplane.go:296-352): by the precedence of semantic
// versions, then by their build metadata, where an identifier of digits compares by its number, a number comes
// before a word, two different words cannot be ordered, and of two lists equal as far as the shorter goes, the
// longer comes after.

export type KubernetesVersion =
  // A semantic version: the text as written, the three numbers, and the identifiers of its pre-release and of its
  // build metadata, as written.
  | {
      state: "known";
      text: string;
      major: number;
      minor: number;
      patch: number;
      preRelease: string[];
      build: string[];
    }
  // Anything else, with its text when it is one.
  | { state: "unknown"; text?: string };

type KnownVersion = Extract<KubernetesVersion, { state: "known" }>;

// Where the first version comes against the second: `unordered` when their build metadata differ by words, which
// the project counts as a change without an order, and `unknown` when either is unknown.
export type VersionOrder = "before" | "equal" | "after" | "unordered" | "unknown";

// A number of a version: no leading zero.
const NUMBER = /^(0|[1-9]\d*)$/;
// An identifier of a pre-release or of build metadata: ASCII letters, digits and hyphens.
const IDENTIFIER = /^[0-9A-Za-z-]+$/;
const DIGITS = /^\d+$/;

// Whether a number of digits keeps its value: it is not above 2^53 - 1.
function isExact(digits: string): boolean {
  return Number(digits) <= Number.MAX_SAFE_INTEGER;
}

// An identifier of a pre-release: one of digits is a number, with no leading zero.
function isPreReleaseIdentifier(identifier: string): boolean {
  if (!IDENTIFIER.test(identifier)) return false;
  return !DIGITS.test(identifier) || (NUMBER.test(identifier) && isExact(identifier));
}

// An identifier of build metadata: one of digits is a number, which may have a leading zero.
function isBuildIdentifier(identifier: string): boolean {
  return IDENTIFIER.test(identifier) && (!DIGITS.test(identifier) || isExact(identifier));
}

// A version of Kubernetes, with or without its leading `v`. A number above 2^53 - 1, among the three numbers, in
// the pre-release or in the build metadata, makes the version unknown, so that every number keeps its value; the
// project reads a number of build metadata as an unsigned integer of 64 bits, and ignores the error of a larger
// one (util/version/version.go:92-97). A value of another type is unknown, and nothing throws.
export function parseKubernetesVersion(value: unknown): KubernetesVersion {
  if (typeof value !== "string") return { state: "unknown" };

  const unknown: KubernetesVersion = { state: "unknown", text: value };
  const rest = value.startsWith("v") ? value.slice(1) : value;
  const plus = rest.indexOf("+");
  const precedence = plus === -1 ? rest : rest.slice(0, plus);
  const build = plus === -1 ? [] : rest.slice(plus + 1).split(".");
  const dash = precedence.indexOf("-");
  const numbers = (dash === -1 ? precedence : precedence.slice(0, dash)).split(".");
  const preRelease = dash === -1 ? [] : precedence.slice(dash + 1).split(".");

  if (numbers.length !== 3) return unknown;
  if (!numbers.every((number) => NUMBER.test(number) && isExact(number))) return unknown;
  if (!preRelease.every(isPreReleaseIdentifier)) return unknown;
  if (!build.every(isBuildIdentifier)) return unknown;

  const [major, minor, patch] = numbers.map(Number);

  return { state: "known", text: value, major, minor, patch, preRelease, build };
}

function sign(difference: number): number {
  if (difference > 0) return 1;
  return difference < 0 ? -1 : 0;
}

// Two identifiers, where one of digits comes before a word and two of digits compare by their numbers, which are
// exact, whatever their leading zeros; `undefined` when both are words.
function compareNumbers(one: string, other: string): number | undefined {
  const numeric = Number(DIGITS.test(other)) - Number(DIGITS.test(one));

  if (numeric !== 0) return numeric;
  return DIGITS.test(one) ? sign(Number(one) - Number(other)) : undefined;
}

// Two words of a pre-release, in ASCII order, which is the order of their code units.
function compareWords(one: string, other: string): number {
  if (one === other) return 0;
  return one < other ? -1 : 1;
}

// The precedence of semantic versions: the three numbers, then the pre-release. A version with a pre-release
// comes before its release; two pre-releases compare identifier by identifier, numbers by their value and before
// words, words in ASCII order, and the one that has more identifiers comes after when the others are equal.
function comparePrecedence(one: KnownVersion, other: KnownVersion): number {
  const numbers = sign(one.major - other.major) || sign(one.minor - other.minor) || sign(one.patch - other.patch);

  if (numbers !== 0) return numbers;
  if (one.preRelease.length === 0 || other.preRelease.length === 0) {
    return sign(other.preRelease.length - one.preRelease.length);
  }
  for (let index = 0; index < Math.min(one.preRelease.length, other.preRelease.length); index++) {
    const mine = one.preRelease[index];
    const theirs = other.preRelease[index];
    const order = compareNumbers(mine, theirs) ?? compareWords(mine, theirs);

    if (order !== 0) return order;
  }
  return sign(one.preRelease.length - other.preRelease.length);
}

// The build metadata as the project compares it once the precedence is equal: identifier by identifier, numbers by
// their value and before words, and two different words with no order between them.
function compareBuild(one: string[], other: string[]): number | "unordered" {
  for (let index = 0; index < Math.min(one.length, other.length); index++) {
    const mine = one[index];
    const theirs = other[index];
    const order = compareNumbers(mine, theirs) ?? (mine === theirs ? 0 : "unordered");

    if (order !== 0) return order;
  }
  return sign(one.length - other.length);
}

const ORDERS: Record<number, VersionOrder> = { [-1]: "before", 0: "equal", 1: "after" };

// Where the first version comes against the second. A comparison with an unknown version is unknown, and no
// activity is inferred from it.
export function compareKubernetesVersions(one: KubernetesVersion, other: KubernetesVersion): VersionOrder {
  if (one.state !== "known" || other.state !== "known") return "unknown";

  const precedence = comparePrecedence(one, other);
  const order = precedence !== 0 ? precedence : compareBuild(one.build, other.build);

  return order === "unordered" ? order : ORDERS[order];
}
