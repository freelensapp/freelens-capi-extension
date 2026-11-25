// The annotations that hold lists (SPEC-0003, "Tests", "Unit", P29): the pending hooks, read exactly as the
// tracker of the hooks reads them, and the preflight checks to skip, trimmed as the MachineSet controller trims
// them; each item kept, known or not. The names of each set are written here as the release spells them, so
// that a set of the parser that misspells one fails.

import { describe, expect, it } from "vitest";
import { PENDING_HOOKS_ANNOTATION, parseListAnnotation, SKIP_PREFLIGHT_CHECKS_ANNOTATION } from "./list-annotation";

import type { ListAnnotationKey } from "./list-annotation";

// White space that the trims of Go and of JavaScript tell apart, built from code points so that no invisible
// character stands in the source.
const NEXT_LINE = String.fromCodePoint(0x85);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000);
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

describe("the pending hooks", () => {
  it.each([
    "AfterControlPlaneInitialized",
    "AfterControlPlaneUpgrade",
    "BeforeWorkersUpgrade",
    "AfterWorkersUpgrade",
    "AfterClusterUpgrade",
    "UpdateMachine",
  ])("reads %s as a known pending hook", (name) => {
    expect(parseListAnnotation(PENDING_HOOKS_ANNOTATION, name)).toEqual({
      state: "read",
      items: [{ name, known: true }],
    });
  });

  it("reads two pending hooks", () => {
    expect(parseListAnnotation(PENDING_HOOKS_ANNOTATION, "AfterClusterUpgrade,AfterControlPlaneUpgrade")).toEqual({
      state: "read",
      items: [
        { name: "AfterClusterUpgrade", known: true },
        { name: "AfterControlPlaneUpgrade", known: true },
      ],
    });
  });

  it("drops the empty items, and keeps a repeated item once", () => {
    expect(parseListAnnotation(PENDING_HOOKS_ANNOTATION, ",UpdateMachine,,UpdateMachine,")).toEqual({
      state: "read",
      items: [{ name: "UpdateMachine", known: true }],
    });
  });

  it("keeps a hook with a space as written, and unknown", () => {
    expect(parseListAnnotation(PENDING_HOOKS_ANNOTATION, "AfterClusterUpgrade, AfterWorkersUpgrade")).toEqual({
      state: "read",
      items: [
        { name: "AfterClusterUpgrade", known: true },
        { name: " AfterWorkersUpgrade", known: false },
      ],
    });
  });

  it("keeps a hook name outside the set, unknown", () => {
    expect(parseListAnnotation(PENDING_HOOKS_ANNOTATION, "BeforeWorkersUpgrade,BeforeClusterUpgrade")).toEqual({
      state: "read",
      items: [
        { name: "BeforeWorkersUpgrade", known: true },
        { name: "BeforeClusterUpgrade", known: false },
      ],
    });
  });
});

describe("the preflight checks to skip", () => {
  it.each(["All", "KubeadmVersionSkew", "KubernetesVersionSkew", "ControlPlaneIsStable", "ControlPlaneVersionSkew"])(
    "reads %s as a known preflight check",
    (name) => {
      expect(parseListAnnotation(SKIP_PREFLIGHT_CHECKS_ANNOTATION, name)).toEqual({
        state: "read",
        items: [{ name, known: true }],
      });
    },
  );

  it("trims two checks with a space after the comma, and drops what is empty once trimmed", () => {
    expect(parseListAnnotation(SKIP_PREFLIGHT_CHECKS_ANNOTATION, "KubeadmVersionSkew, ControlPlaneIsStable, ")).toEqual(
      {
        state: "read",
        items: [
          { name: "KubeadmVersionSkew", known: true },
          { name: "ControlPlaneIsStable", known: true },
        ],
      },
    );
  });

  it("trims the white space that Go trims, U+0085 and the spaces of Unicode included", () => {
    const value = [
      `${NEXT_LINE}All`,
      `${NO_BREAK_SPACE}ControlPlaneIsStable${IDEOGRAPHIC_SPACE}`,
      `KubeadmVersionSkew${NEXT_LINE}`,
    ].join(",");

    expect(parseListAnnotation(SKIP_PREFLIGHT_CHECKS_ANNOTATION, value)).toEqual({
      state: "read",
      items: [
        { name: "All", known: true },
        { name: "ControlPlaneIsStable", known: true },
        { name: "KubeadmVersionSkew", known: true },
      ],
    });
  });

  it("keeps U+FEFF, which Go does not trim, so that the check is unknown and skips nothing", () => {
    expect(parseListAnnotation(SKIP_PREFLIGHT_CHECKS_ANNOTATION, `${BYTE_ORDER_MARK}All`)).toEqual({
      state: "read",
      items: [{ name: `${BYTE_ORDER_MARK}All`, known: false }],
    });
  });

  it("marks the names of the comment of the annotation unknown, so that they skip nothing", () => {
    const read = parseListAnnotation(
      SKIP_PREFLIGHT_CHECKS_ANNOTATION,
      "KubeadmVersion,KubernetesVersion,ControlPlaneStable",
    );

    expect(read).toEqual({
      state: "read",
      items: [
        { name: "KubeadmVersion", known: false },
        { name: "KubernetesVersion", known: false },
        { name: "ControlPlaneStable", known: false },
      ],
    });
    expect(read.state === "read" && read.items.filter((item) => item.known)).toEqual([]);
  });
});

describe("either annotation", () => {
  // The controllers match a name exactly, and each key has its own set.
  it.each<[string, ListAnnotationKey, string]>([
    ["all in lower case", SKIP_PREFLIGHT_CHECKS_ANNOTATION, "all"],
    ["the check All as a pending hook", PENDING_HOOKS_ANNOTATION, "All"],
    ["the hook UpdateMachine as a preflight check", SKIP_PREFLIGHT_CHECKS_ANNOTATION, "UpdateMachine"],
  ])("reads %s as unknown", (_, key, name) => {
    expect(parseListAnnotation(key, name)).toEqual({ state: "read", items: [{ name, known: false }] });
  });

  it.each<[ListAnnotationKey, string | undefined]>([
    [PENDING_HOOKS_ANNOTATION, undefined],
    [PENDING_HOOKS_ANNOTATION, ""],
    [SKIP_PREFLIGHT_CHECKS_ANNOTATION, undefined],
    [SKIP_PREFLIGHT_CHECKS_ANNOTATION, ""],
  ])("gives no item for %s when it is absent or empty (%j)", (key, value) => {
    expect(parseListAnnotation(key, value)).toEqual({ state: "read", items: [] });
  });

  it.each([
    ["a number", PENDING_HOOKS_ANNOTATION, 2],
    ["null", SKIP_PREFLIGHT_CHECKS_ANNOTATION, null],
    ["a list", SKIP_PREFLIGHT_CHECKS_ANNOTATION, ["All"]],
    ["a key that holds no list", "cluster.x-k8s.io/paused", "true"],
  ])("reads %s as Unknown, and does not throw", (_, key, value) => {
    expect(parseListAnnotation(key as ListAnnotationKey, value)).toEqual({ state: "unknown" });
  });
});
