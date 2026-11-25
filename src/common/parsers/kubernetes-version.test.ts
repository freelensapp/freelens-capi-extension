// The versions of Kubernetes (SPEC-0003, "Tests", "Unit", P28): what is read, with or without its leading `v`; the
// order of two versions, as the project orders them when it decides that a control plane is upgrading; and what is
// unknown, which is never compared.

import { describe, expect, it } from "vitest";
import { compareKubernetesVersions, parseKubernetesVersion } from "./kubernetes-version";

function compare(one: unknown, other: unknown) {
  return compareKubernetesVersions(parseKubernetesVersion(one), parseKubernetesVersion(other));
}

// Each version of the list against each one after it, both ways.
function expectAscending(versions: string[]): void {
  for (let index = 0; index < versions.length; index++) {
    for (const later of versions.slice(index + 1)) {
      expect([versions[index], later, compare(versions[index], later)]).toEqual([versions[index], later, "before"]);
      expect([later, versions[index], compare(later, versions[index])]).toEqual([later, versions[index], "after"]);
    }
  }
}

describe("a version of Kubernetes", () => {
  it("reads v1.37.0 and 1.37.0 the same", () => {
    expect(parseKubernetesVersion("v1.37.0")).toEqual({
      state: "known",
      text: "v1.37.0",
      major: 1,
      minor: 37,
      patch: 0,
      preRelease: [],
      build: [],
    });
    expect(parseKubernetesVersion("1.37.0")).toEqual({
      state: "known",
      text: "1.37.0",
      major: 1,
      minor: 37,
      patch: 0,
      preRelease: [],
      build: [],
    });
    expect(compare("v1.37.0", "1.37.0")).toBe("equal");
  });

  it("reads the identifiers of a pre-release and of build metadata", () => {
    expect(parseKubernetesVersion("v1.37.0-rc.1+build.005-a")).toEqual({
      state: "known",
      text: "v1.37.0-rc.1+build.005-a",
      major: 1,
      minor: 37,
      patch: 0,
      preRelease: ["rc", "1"],
      build: ["build", "005-a"],
    });
  });

  it("reads every number up to 2^53 - 1, and orders such numbers exactly", () => {
    expect(parseKubernetesVersion("v9007199254740991.0.0")).toMatchObject({ state: "known", major: 9007199254740991 });
    expect(parseKubernetesVersion("v1.37.0-rc.9007199254740991")).toMatchObject({
      state: "known",
      preRelease: ["rc", "9007199254740991"],
    });
    expect(parseKubernetesVersion("v1.37.0+0009007199254740991")).toMatchObject({
      state: "known",
      build: ["0009007199254740991"],
    });
    expect(compare("v1.37.0+9007199254740990", "v1.37.0+9007199254740991")).toBe("before");
    expect(compare("v1.37.0-rc.9007199254740991", "v1.37.0-rc.9007199254740990")).toBe("after");
  });

  it("orders by the major, the minor and the patch, each by its number", () => {
    expectAscending(["v0.9.9", "v1.9.10", "v1.10.0", "v1.10.2", "v1.10.10", "v2.0.0"]);
  });

  it("orders the pre-releases before their release, and among themselves as semantic versions do", () => {
    expectAscending([
      "v1.37.0-alpha",
      "v1.37.0-alpha.1",
      "v1.37.0-alpha.beta",
      "v1.37.0-beta",
      "v1.37.0-beta.2",
      "v1.37.0-beta.11",
      "v1.37.0-rc.1",
      "v1.37.0",
    ]);
    expect(compare("v1.37.0-rc.1", "1.37.0-rc.1")).toBe("equal");
  });

  it.each([
    ["by number", "v1.37.0+2", "v1.37.0+10", "before"],
    ["by number, whatever its leading zeros", "v1.37.0+010", "v1.37.0+10", "equal"],
    ["a number before a word", "v1.37.0+9", "v1.37.0+a", "before"],
    ["a word after a number", "v1.37.0+a.1", "v1.37.0+9.2", "after"],
    ["two different words not ordered", "v1.37.0+abc", "v1.37.0+abd", "unordered"],
    ["two different words not ordered, either way", "v1.37.0+abd.1", "v1.37.0+abc.1", "unordered"],
    ["two equal words, and the next identifier", "v1.37.0+abc.1", "v1.37.0+abc.2", "before"],
    ["the longer of two equal lists after", "v1.37.0+abc.1", "v1.37.0+abc", "after"],
    ["no build metadata before some", "v1.37.0", "v1.37.0+1", "before"],
    ["only once the precedence is equal", "v1.37.1+1", "v1.37.0+abc", "after"],
  ])("orders build metadata as the project does: %s", (_, one, other, order) => {
    expect(compare(one, other)).toBe(order);
  });

  it.each([
    ["v1.37"],
    ["v1.037.0"],
    ["latest"],
    [""],
    ["v1.37.0.1"],
    ["V1.37.0"],
    [" v1.37.0"],
    ["v1.37.0-"],
    ["v1.37.0+"],
    ["v1.37.0-rc.01"],
    ["v1.37.0+build_1"],
    ["v9007199254740992.0.0"],
    ["v1.37.0-rc.9007199254740992"],
    ["v1.37.0+9007199254740992"],
  ])("reads %j as Unknown, with its text", (value) => {
    expect(parseKubernetesVersion(value)).toEqual({ state: "unknown", text: value });
  });

  it("compares with an Unknown as Unknown", () => {
    expect(compare("v1.37.0", "latest")).toBe("unknown");
    expect(compare("v1.37", "v1.37.0")).toBe("unknown");
    expect(compare("latest", "latest")).toBe("unknown");
    expect(compare("v1.37.0", undefined)).toBe("unknown");
  });

  it.each([
    ["a number", 1.37],
    ["null", null],
    ["absent", undefined],
    ["an object", { version: "v1.37.0" }],
  ])("reads %s as Unknown, and does not throw", (_, value) => {
    expect(parseKubernetesVersion(value)).toEqual({ state: "unknown" });
  });
});
