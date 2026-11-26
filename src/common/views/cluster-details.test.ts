import { describe, expect, it } from "vitest";
import { CAPTURE, fixtureSet, ofKind } from "../../../test/fixture-sets";
import { descriptorOf, hostObjects, objectsOfStates, readsOf, sourceOf } from "../../../test/view-sources";
import {
  clusterDetailsOf,
  isClusterApiObject,
  messageLines,
  noteWords,
  pauseFormOf,
  readFailuresOf,
  subjectTarget,
  UNREAD_WORDS,
  weightTone,
} from "./cluster-details";
import { clusterPartsOf, indexContext, StatusMemo } from "./context";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { ClusterObject, Note } from "../status/index";
import type { ClusterDetails } from "./cluster-details";

// The pure functions of the details of a Cluster (SPEC-0004, "The details", P17, P18, P27): the words of the notes of
// the model, the tone of a weight, the form of a pause, the objects of Cluster API that stay text, the names of a
// subject, the parts and their counters, and the reads that failed in the namespace of the Cluster.

type Fields = Record<string, any>;

function detailsOf(states: string[], change?: (cluster: Fields) => void, options = {}): ClusterDetails {
  const objects = objectsOfStates(states);
  const cluster = objects.find((object) => object.kind === "Cluster") as unknown as Fields;

  change?.(cluster);

  const source = sourceOf(objects, options);
  const index = indexContext(source.objects());
  const parts = clusterPartsOf(index, cluster as unknown as ClusterObject, CAPTURE, new StatusMemo());

  return clusterDetailsOf(parts, index, readFailuresOf(source.reads, source.kinds(), cluster.metadata.namespace));
}

describe("the notes of the model, in words (SPEC-0003, What it takes and returns)", () => {
  it.each<[Note, string | undefined]>([
    [
      { code: "input-not-given", input: "clusterClass" },
      "Not read, so not given to the status model: its ClusterClass, whose availability gates apply to it.",
    ],
    [
      { code: "input-not-given", input: "controllers" },
      "Not read, so not given to the status model: the availability of the controllers of its providers.",
    ],
    [
      { code: "field-unreadable", field: "status.phase" },
      "The field status.phase holds a value of the wrong type, read as unknown.",
    ],
    [{ code: "kind-unknown" }, "The status model does not know this kind."],
    [
      { code: "never-available", missing: ["spec.controlPlaneRef", "spec.infrastructureRef"] },
      "The project never reports this Cluster available: it has no managed topology, and no spec.controlPlaneRef and no spec.infrastructureRef.",
    ],
    [
      { code: "no-machine", deprecatedReady: undefined },
      "This MachinePool has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.",
    ],
    [{ code: "applied-to-no-cluster" }, "This ClusterResourceSet applied to no Cluster."],
    [{ code: "no-contract-status" }, "No contract of the project names the status of this object."],
    [
      { code: "controller-unknown", provider: "cluster-api" },
      "The availability of the controller of cluster-api is not known.",
    ],
    [
      { code: "stale-condition", type: "ProviderUpgraded" },
      "ProviderUpgraded records a past failure: no issue, and at rest.",
    ],
    [{ code: "machines-differ-from-spec" }, "Its Machines differ from its spec while nothing rolls them out."],
    // Shown in rows of their own, and next to the health.
    [{ code: "deprecated-failure", reason: "a", message: "b" }, undefined],
    [{ code: "machine-pools-unknown", count: 1 }, undefined],
  ])("say %j", (note, words) => {
    expect(noteWords(note)).toBe(words);
  });
});

describe("the marks and the words of the details", () => {
  it("give each weight the tone of SPEC-0003, P31, a negative condition at rest never that of an issue", () => {
    expect(weightTone("Ok")).toBe("ok");
    expect(weightTone("Issue")).toBe("error");
    expect(weightTone("Activity")).toBe("info");
    expect(weightTone("At rest")).toBe("info");
    expect(weightTone("Unknown")).toBe("vague");
  });

  it("tell the form of a pause: spec.paused, the annotation, both, or none (SPEC-0003, P19)", () => {
    const cluster = (spec: Fields, annotations?: Fields) =>
      ({ kind: "Cluster", metadata: { name: "a", annotations }, spec }) as unknown as ClusterObject;

    expect(pauseFormOf(cluster({ paused: true }))).toBe("spec.paused");
    expect(pauseFormOf(cluster({}, { "cluster.x-k8s.io/paused": "" }))).toBe("annotation");
    expect(pauseFormOf(cluster({ paused: true }, { "cluster.x-k8s.io/paused": "true" }))).toBe("both");
    expect(pauseFormOf(cluster({ paused: false }, { other: "" }))).toBeUndefined();
  });

  it("keep the objects of Cluster API as text, and not those of a provider (P18)", () => {
    expect(isClusterApiObject("cluster.x-k8s.io", "MachineDeployment")).toBe(true);
    expect(isClusterApiObject("cluster.x-k8s.io", "ClusterClass")).toBe(true);
    expect(isClusterApiObject("controlplane.cluster.x-k8s.io", "KubeadmControlPlane")).toBe(true);
    expect(isClusterApiObject("bootstrap.cluster.x-k8s.io", "KubeadmConfig")).toBe(true);
    expect(isClusterApiObject("infrastructure.cluster.x-k8s.io", "DevCluster")).toBe(false);
    expect(isClusterApiObject("controlplane.example.com", "ExampleControlPlane")).toBe(false);
  });

  it("say why a reference opens nothing, for every reason", () => {
    expect(Object.keys(UNREAD_WORDS).sort()).toEqual(
      [
        "definition-refused",
        "definition-failed",
        "no-known-version",
        "not-served",
        "kind-not-read",
        "not-found",
      ].sort(),
    );
  });

  it("read the names of the subject of a line, as the parser gives them, with the length of the subject", () => {
    const [line] = messageLines({
      state: "read",
      headline: "* Machines a, b: not ready",
      lines: [
        {
          written: "* Machines a, b: not ready",
          indentation: 0,
          bullet: true,
          text: "Machines a, b: not ready",
          subject: { form: "aggregate", text: "Machines a, b:", kind: "Machines", names: ["a", "b"], others: 0 },
          children: [],
        },
      ],
    });

    expect(line).toEqual({
      text: "Machines a, b: not ready",
      bullet: true,
      subject: { kind: "Machines", names: ["a", "b"], length: "Machines a, b:".length },
      children: [],
    });
  });

  it("link a Cluster named in a subject to its details, and the object of a provider that the Cluster names", () => {
    const details = detailsOf(["healthy"]);
    const devCluster = details.infrastructure?.reference;

    expect(subjectTarget(details, "Cluster", "another")).toEqual({
      form: "cluster",
      namespace: "freelens-capi-healthy",
      name: "another",
    });
    expect(subjectTarget(details, "DevCluster", devCluster?.name ?? "")).toEqual({
      form: "host",
      selfLink: devCluster?.selfLink,
    });
    expect(subjectTarget(details, "DevCluster", "not-this-one")).toEqual({ form: "text" });
    expect(subjectTarget(details, "Machine", "a-machine")).toEqual({ form: "text" });
    expect(subjectTarget(details, "KubeadmControlPlane", details.controlPlane?.reference?.name ?? "")).toEqual({
      form: "text",
    });
  });
});

describe("the sections of the details", () => {
  it("count a worker Machine as the Cluster counts it: one desired, available when its Available is True (P17)", () => {
    const [machine] = ofKind<KubeObject>(fixtureSet("healthy"), "Machine").filter(
      (object) => object.metadata.labels?.["cluster.x-k8s.io/control-plane"] === undefined,
    );
    const owned = (available: string) => {
      const copy = structuredClone(machine) as unknown as Fields;

      copy.metadata.name = `stand-alone-${available}`;
      copy.metadata.labels = { "cluster.x-k8s.io/cluster-name": "freelens-capi-healthy" };
      copy.metadata.ownerReferences = [
        { apiVersion: "cluster.x-k8s.io/v1beta2", kind: "Cluster", name: "freelens-capi-healthy" },
      ];
      copy.status.conditions = copy.status.conditions.map((condition: Fields) =>
        condition.type === "Available" ? { ...condition, status: available } : condition,
      );
      return copy as unknown as KubeObject;
    };
    const objects = hostObjects([...fixtureSet("healthy"), owned("True"), owned("False")]);
    const source = sourceOf(objects);
    const index = indexContext(source.objects());
    const cluster = objects.find((object) => object.kind === "Cluster") as unknown as ClusterObject;
    const details = clusterDetailsOf(clusterPartsOf(index, cluster, CAPTURE, new StatusMemo()), index, []);
    const rows = (details.workers?.rows ?? []).filter((row) => row.kind === "Machine");

    expect(rows.map((row) => [row.name, row.available, row.desired])).toEqual([
      ["stand-alone-True", 1, 1],
      ["stand-alone-False", 0, 1],
    ]);
  });

  it("read Provisioned No while the field is unset on a Cluster with a status, and Unknown with none (P27)", () => {
    expect(
      detailsOf(["healthy"], (cluster) => {
        cluster.status.initialization = {};
      }).infrastructure?.provisioned,
    ).toEqual({ answer: "No", reason: undefined });
    expect(detailsOf(["no-status"]).infrastructure?.provisioned).toEqual({
      answer: "Unknown",
      reason: undefined,
      written: false,
    });
  });

  it("sort the versions of the control plane oldest first, each with its Machines", () => {
    expect(detailsOf(["upgrading"]).controlPlane?.versions).toEqual([
      { version: "v1.36.4", replicas: 1 },
      { version: "v1.37.0", replicas: 1 },
    ]);
  });

  it("leave out the network when the Cluster sets none of its fields", () => {
    expect(
      detailsOf(["healthy"], (cluster) => {
        cluster.spec.clusterNetwork = {};
      }).network,
    ).toBeUndefined();
  });

  it("name every kind that failed in the namespace of the Cluster, and no other", () => {
    const objects = objectsOfStates(["healthy"]);
    const failure = { refused: true, message: "forbidden" };
    const reads = readsOf(objects, { failures: { machines: [failure] } });
    const failures = readFailuresOf(
      reads,
      [descriptorOf("machines"), descriptorOf("machineSets")],
      "freelens-capi-healthy",
    );

    expect(failures.map((view) => view.descriptor.kind)).toEqual(["Machine"]);
    expect(failures[0].load?.failures).toEqual([failure]);
    expect(readFailuresOf(reads, [descriptorOf("machines")], "freelens-capi-paused")).toEqual([]);
  });
});
