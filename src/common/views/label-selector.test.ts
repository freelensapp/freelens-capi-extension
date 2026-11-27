import { describe, expect, it } from "vitest";
import { selectorSelects } from "./label-selector";

// The cases of SPEC-0005, "Tests", "Unit", `label-selector.test.ts` (P7): the selector of a ClusterResourceSet, read
// as its controller reads it (clusterresourceset_controller.go:260-288), against the labels of a Cluster.

const LABELS = { cni: "kindnet", env: "dev" };

describe("the selector of a ClusterResourceSet (P7)", () => {
  it.each([
    ["matchLabels that the Cluster holds", { matchLabels: { cni: "kindnet" } }, true],
    ["matchLabels with another word", { matchLabels: { cni: "calico" } }, false],
    ["matchLabels with a label that the Cluster lacks", { matchLabels: { cni: "kindnet", zone: "a" } }, false],
    [
      "In with the word of the Cluster",
      { matchExpressions: [{ key: "env", operator: "In", values: ["prod", "dev"] }] },
      true,
    ],
    ["In without it", { matchExpressions: [{ key: "env", operator: "In", values: ["prod"] }] }, false],
    [
      "In of a label that the Cluster lacks",
      { matchExpressions: [{ key: "zone", operator: "In", values: ["a"] }] },
      false,
    ],
    [
      "NotIn with the word of the Cluster",
      { matchExpressions: [{ key: "env", operator: "NotIn", values: ["dev"] }] },
      false,
    ],
    ["NotIn without it", { matchExpressions: [{ key: "env", operator: "NotIn", values: ["prod"] }] }, true],
    [
      "NotIn of a label that the Cluster lacks",
      { matchExpressions: [{ key: "zone", operator: "NotIn", values: ["a"] }] },
      true,
    ],
    ["Exists", { matchExpressions: [{ key: "env", operator: "Exists" }] }, true],
    ["Exists of a label that the Cluster lacks", { matchExpressions: [{ key: "zone", operator: "Exists" }] }, false],
    ["DoesNotExist", { matchExpressions: [{ key: "env", operator: "DoesNotExist" }] }, false],
    [
      "DoesNotExist of a label that the Cluster lacks",
      { matchExpressions: [{ key: "zone", operator: "DoesNotExist" }] },
      true,
    ],
    [
      "matchLabels and matchExpressions, both met",
      { matchLabels: { cni: "kindnet" }, matchExpressions: [{ key: "env", operator: "In", values: ["dev"] }] },
      true,
    ],
    [
      "matchLabels and matchExpressions, the expression not met",
      { matchLabels: { cni: "kindnet" }, matchExpressions: [{ key: "env", operator: "In", values: ["prod"] }] },
      false,
    ],
  ])("%s", (_, selector, selects) => {
    expect(selectorSelects(selector, LABELS)).toBe(selects);
  });

  it.each([
    ["an empty selector", {}],
    ["an absent selector", undefined],
    ["a selector with empty lists", { matchLabels: {}, matchExpressions: [] }],
  ])("selects no Cluster for %s, as its controller decides", (_, selector) => {
    expect(selectorSelects(selector, LABELS)).toBe(false);
    expect(selectorSelects(selector, {})).toBe(false);
  });

  it.each([
    [
      "an operator that Kubernetes does not know",
      { matchExpressions: [{ key: "env", operator: "Gt", values: ["1"] }] },
    ],
    ["In with no values", { matchExpressions: [{ key: "env", operator: "In", values: [] }] }],
    ["NotIn with no values", { matchExpressions: [{ key: "zone", operator: "NotIn" }] }],
    ["Exists with values", { matchExpressions: [{ key: "env", operator: "Exists", values: ["dev"] }] }],
    ["a label of matchLabels that is not a word", { matchLabels: { cni: 1 } }],
    ["DoesNotExist of a key with a space", { matchExpressions: [{ key: "no zone", operator: "DoesNotExist" }] }],
    ["NotIn of a key with two slashes", { matchExpressions: [{ key: "a/b/zone", operator: "NotIn", values: ["a"] }] }],
    [
      "DoesNotExist of a key whose prefix is no DNS subdomain",
      { matchExpressions: [{ key: "Example.com/zone", operator: "DoesNotExist" }] },
    ],
    [
      "DoesNotExist of a key whose name is longer than 63 characters",
      { matchExpressions: [{ key: `zone-${"x".repeat(59)}`, operator: "DoesNotExist" }] },
    ],
    [
      "NotIn with a value that is no value of a label",
      { matchExpressions: [{ key: "env", operator: "NotIn", values: ["prod env"] }] },
    ],
  ])("selects no Cluster for a selector that Kubernetes refuses: %s", (_, selector) => {
    expect(selectorSelects(selector, LABELS)).toBe(false);
  });

  it.each([
    ["a key of matchLabels that is not the key of a label", { matchLabels: { "-cni": "kindnet" } }],
    ["a value of matchLabels that is not the value of a label", { matchLabels: { cni: "kindnet-" } }],
  ])("selects no Cluster for %s, even one whose labels hold it as written, which the schema refuses", (_, selector) => {
    // Labels written at this layer alone (SPEC-0005, "Tests", "Unit").
    expect(selectorSelects(selector, { ...LABELS, "-cni": "kindnet", cni: "kindnet-" })).toBe(false);
  });

  it.each([
    ["a key with a prefix", { matchExpressions: [{ key: "cluster.x-k8s.io/zone", operator: "DoesNotExist" }] }],
    ["a name of 63 characters", { matchExpressions: [{ key: `zone-${"x".repeat(58)}`, operator: "DoesNotExist" }] }],
    ["an empty value", { matchExpressions: [{ key: "env", operator: "NotIn", values: [""] }] }],
  ])("selects as written a selector that Kubernetes takes: %s", (_, selector) => {
    expect(selectorSelects(selector, LABELS)).toBe(true);
  });
});
