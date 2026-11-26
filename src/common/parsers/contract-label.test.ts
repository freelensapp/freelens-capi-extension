// The contract label of a definition (SPEC-0003, "Tests", "Unit", P26): which label is read, the latest version
// in the order of Kubernetes, and what reads Unknown.

import { describe, expect, it } from "vitest";
import { parseContractLabel } from "./contract-label";

const V1BETA2 = "cluster.x-k8s.io/v1beta2";
const V1BETA1 = "cluster.x-k8s.io/v1beta1";
const UNKNOWN = { state: "unknown" };

describe("the contract label of a definition", () => {
  it("reads v1beta2 alone, as on the definitions of kubeadm", () => {
    expect(parseContractLabel({ [V1BETA1]: "v1beta1", [V1BETA2]: "v1beta2" })).toEqual({
      state: "known",
      contract: "v1beta2",
      version: "v1beta2",
    });
  });

  it("takes the latest of v1beta1_v1beta2", () => {
    expect(parseContractLabel({ [V1BETA2]: "v1beta1_v1beta2" })).toEqual({
      state: "known",
      contract: "v1beta2",
      version: "v1beta2",
    });
  });

  it("takes the latest of v1alpha3_v1alpha4_v1beta1", () => {
    expect(parseContractLabel({ [V1BETA1]: "v1alpha3_v1alpha4_v1beta1" })).toEqual({
      state: "known",
      contract: "v1beta1",
      version: "v1beta1",
    });
  });

  it.each([
    ["a version with no stability suffix above v1beta2", "v1beta2_v1_v1beta1", "v1"],
    ["the stability before the major", "v2alpha1_v1beta1", "v1beta1"],
    ["the higher major", "v9_v10", "v10"],
    ["the higher minor, by its number", "v1alpha10_v1alpha9", "v1alpha10"],
  ])("takes %s", (_, value, version) => {
    expect(parseContractLabel({ [V1BETA2]: value })).toEqual({ state: "known", contract: "v1beta2", version });
  });

  it("uses the v1beta1 label when the v1beta2 one is missing, and when it is empty", () => {
    const expected = { state: "known", contract: "v1beta1", version: "v1beta1" };

    expect(parseContractLabel({ [V1BETA1]: "v1alpha4_v1beta1" })).toEqual(expected);
    expect(parseContractLabel({ [V1BETA2]: "", [V1BETA1]: "v1alpha4_v1beta1" })).toEqual(expected);
  });

  it("ignores any other contract label", () => {
    expect(parseContractLabel({ "cluster.x-k8s.io/v1beta3": "v1beta3", [V1BETA1]: "v1beta1" })).toEqual({
      state: "known",
      contract: "v1beta1",
      version: "v1beta1",
    });
    expect(parseContractLabel({ "cluster.x-k8s.io/v1alpha4": "v1alpha4" })).toEqual(UNKNOWN);
  });

  it("reads no label as Unknown, as on the definitions of the core", () => {
    expect(parseContractLabel({ "cluster.x-k8s.io/provider": "cluster-api" })).toEqual(UNKNOWN);
    expect(parseContractLabel({})).toEqual(UNKNOWN);
  });

  it("reads only items that are not versions as Unknown, with no fall back on the v1beta1 label", () => {
    expect(parseContractLabel({ [V1BETA2]: "beta_V1_v1.2_v01_v1beta_v1gamma1_ v1", [V1BETA1]: "v1beta1" })).toEqual(
      UNKNOWN,
    );
  });

  it("leaves out empty items between two _, and an item that is not a version", () => {
    expect(parseContractLabel({ [V1BETA2]: "_v1beta1__v1beta2_" })).toEqual({
      state: "known",
      contract: "v1beta2",
      version: "v1beta2",
    });
    expect(parseContractLabel({ [V1BETA2]: "v1beta2_v3.0" })).toEqual({
      state: "known",
      contract: "v1beta2",
      version: "v1beta2",
    });
  });

  it("leaves out a major or a minor above 2^53 - 1, and takes one at the limit", () => {
    expect(parseContractLabel({ [V1BETA2]: "v1beta2_v9007199254740992_v1beta9007199254740992" })).toEqual({
      state: "known",
      contract: "v1beta2",
      version: "v1beta2",
    });
    expect(parseContractLabel({ [V1BETA2]: "v1beta2_v1beta9007199254740991" })).toEqual({
      state: "known",
      contract: "v1beta2",
      version: "v1beta9007199254740991",
    });
  });

  it.each([
    ["absent labels", undefined],
    ["null", null],
    ["a string", "cluster.x-k8s.io/v1beta2=v1beta2"],
    ["a list, even one that carries the label", Object.assign([V1BETA2], { [V1BETA2]: "v1beta2" })],
    ["a label that is not a string", { [V1BETA2]: 2, [V1BETA1]: "v1beta1" }],
  ])("reads %s as Unknown, and does not throw", (_, labels) => {
    expect(parseContractLabel(labels)).toEqual(UNKNOWN);
  });
});
