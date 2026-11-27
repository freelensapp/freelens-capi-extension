import { describe, expect, it } from "vitest";
import { fixtureSet, ofKind } from "../../../test/fixture-sets";
import { variableNamesOf } from "./variable-names";

import type { KubeObjectData } from "../status/index";

// The cases of SPEC-0005, "Tests", "Unit", `variable-names.test.ts` (P20): the names of the variables of a Cluster and
// of the variables and the patches of its class, and never what a variable is set to or what a patch writes.

const HEALTHY = fixtureSet("healthy") as unknown as KubeObjectData[];
const [CLUSTER] = ofKind<KubeObjectData>(HEALTHY as never, "Cluster");
const [CLASS] = ofKind<KubeObjectData>(HEALTHY as never, "ClusterClass");
const NAMES = ["imageRepository", "etcdImageTag", "coreDNSImageTag", "podSecurityStandard"];

describe("the names of the variables and of the patches (P20)", () => {
  it("are those of the variables of the Cluster of healthy", () => {
    expect(variableNamesOf(CLUSTER)).toEqual({ variableNames: NAMES, patchNames: [] });
  });

  it("are those of the variables and of the patches of its class", () => {
    expect(variableNamesOf(CLASS)).toEqual({
      variableNames: NAMES,
      patchNames: ["imageRepository", "etcdImageTag", "coreDNSImageTag", "customImage", "podSecurityStandard"],
    });
  });

  it("hold nothing that a variable is set to or that a patch writes", () => {
    const cluster = structuredClone(CLUSTER) as KubeObjectData & { spec: any };
    const clusterClass = structuredClone(CLASS) as KubeObjectData & { spec: any };

    cluster.spec.topology.variables.push({
      name: "extraFiles",
      value: [{ path: "/etc/x", content: "planted-content" }],
    });
    clusterClass.spec.patches[0].definitions[0].jsonPatches[0].value = "planted-patch";

    const written = JSON.stringify([variableNamesOf(cluster), variableNamesOf(clusterClass)]);

    expect(written).not.toContain("planted-content");
    expect(written).not.toContain("planted-patch");
    // What the fixtures set podSecurityStandard to, and the path that the first patch of the class writes.
    expect(written).not.toContain("baseline");
    expect(written).not.toContain("/spec/template");
    expect(variableNamesOf(cluster).variableNames).toEqual([...NAMES, "extraFiles"]);
  });

  it("are each given once, and an entry with no name is left out", () => {
    const cluster = structuredClone(CLUSTER) as KubeObjectData & { spec: any };

    cluster.spec.topology.variables.push({ name: "imageRepository" }, { name: "" }, {});
    expect(variableNamesOf(cluster).variableNames).toEqual(NAMES);
  });

  it("are none for another kind, or for a kind of the same name in another group", () => {
    const [machine] = ofKind<KubeObjectData>(HEALTHY as never, "Machine");

    expect(variableNamesOf(machine)).toEqual({ variableNames: [], patchNames: [] });
    expect(variableNamesOf({ ...CLUSTER, apiVersion: "cluster.example.test/v1" })).toEqual({
      variableNames: [],
      patchNames: [],
    });
  });
});
