import { describe, expect, it } from "vitest";
import { CAPTURE, fixtureSet, ofKind } from "../../../test/fixture-sets";
import { descriptorOf, hostObjects, objectsOfStates, readsOf, sourceOf } from "../../../test/view-sources";
import { Cluster } from "../../renderer/api/cluster/cluster-v1beta2";
import { CONTEXT_MODELS, TREE_MODELS } from "../../renderer/api/context/context-models";
import { parseConditionMessage } from "../parsers/condition-message";
import {
  clusterDetailsOf,
  isClusterApiObject,
  messageLines,
  noteWords,
  pauseFormOf,
  readFailuresOf,
  subjectKindsOf,
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
// subject whatever the number of its kind, the parts and their counters, and the reads that failed in the namespace of
// the Cluster.

type Fields = Record<string, any>;

function detailsOf(states: string[], change?: (cluster: Fields) => void, options = {}): ClusterDetails {
  const objects = objectsOfStates(states);
  const cluster = objects.find((object) => object.kind === "Cluster") as unknown as Fields;

  change?.(cluster);

  const source = sourceOf(objects, options);
  const index = indexContext(source.objects());
  const parts = clusterPartsOf(index, cluster as unknown as ClusterObject, CAPTURE, new StatusMemo());

  return clusterDetailsOf(
    parts,
    index,
    readFailuresOf(source.reads, source.kinds(), cluster.metadata.namespace),
    source
      .clusters()
      .items.filter((item) => item.metadata?.namespace === cluster.metadata.namespace)
      .map((item) => item.metadata?.name ?? ""),
  );
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

  it("tell the objects of Cluster API, every kind of R1, from those of a provider (P18; SPEC-0005, P5)", () => {
    for (const [group, kind] of [
      ["cluster.x-k8s.io", "MachineDeployment"],
      ["cluster.x-k8s.io", "ClusterClass"],
      ["controlplane.cluster.x-k8s.io", "KubeadmControlPlane"],
      ["controlplane.cluster.x-k8s.io", "KubeadmControlPlaneTemplate"],
      ["bootstrap.cluster.x-k8s.io", "KubeadmConfig"],
      ["bootstrap.cluster.x-k8s.io", "KubeadmConfigTemplate"],
      ["addons.cluster.x-k8s.io", "ClusterResourceSet"],
      ["addons.cluster.x-k8s.io", "ClusterResourceSetBinding"],
      ["ipam.cluster.x-k8s.io", "IPAddress"],
      ["ipam.cluster.x-k8s.io", "IPAddressClaim"],
      ["runtime.cluster.x-k8s.io", "ExtensionConfig"],
      ["clusterctl.cluster.x-k8s.io", "Provider"],
      ["operator.cluster.x-k8s.io", "CoreProvider"],
    ]) {
      expect(isClusterApiObject(group, kind), `${group}/${kind}`).toBe(true);
    }
    expect(isClusterApiObject("infrastructure.cluster.x-k8s.io", "DevCluster")).toBe(false);
    expect(isClusterApiObject("controlplane.example.com", "ExampleControlPlane")).toBe(false);
    // A kind of a provider in a group of Cluster API is of a provider (SPEC-0005, P5).
    expect(isClusterApiObject("bootstrap.cluster.x-k8s.io", "ExampleConfig")).toBe(false);
    expect(isClusterApiObject("controlplane.cluster.x-k8s.io", "ExampleControlPlane")).toBe(false);
  });

  it("say why a reference opens nothing, for every reason", () => {
    expect(Object.keys(UNREAD_WORDS).sort()).toEqual(
      [
        "definition-refused",
        "definition-failed",
        "no-known-version",
        "not-served",
        "version-not-served",
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

  it("link a Cluster named in a subject to its details, an object of Cluster API of the Cluster to its node in the tree, and the object of a provider that the Cluster names, when the view read them", () => {
    const details = detailsOf(["healthy"]);
    const devCluster = details.infrastructure?.reference;
    const controlPlane = details.controlPlane?.reference?.name ?? "";

    expect(subjectTarget(details, "Cluster", "freelens-capi-healthy")).toEqual({
      form: "cluster",
      namespace: "freelens-capi-healthy",
      name: "freelens-capi-healthy",
    });
    // A Cluster that the view did not read in the namespace is text.
    expect(subjectTarget(details, "Cluster", "another")).toEqual({ form: "text" });
    expect(subjectTarget(details, "DevCluster", devCluster?.name ?? "")).toEqual({
      form: "host",
      selfLink: devCluster?.selfLink,
    });
    expect(subjectTarget(details, "DevCluster", "not-this-one")).toEqual({ form: "text" });
    // The objects of Cluster API of the Cluster that the view read open the tree at their node (SPEC-0005, P5); a name
    // that the view did not read stays text.
    expect(subjectTarget(details, "Machine", "a-machine")).toEqual({ form: "text" });
    expect(subjectTarget(details, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg")).toEqual({
      form: "tree",
      node: "cluster.x-k8s.io/Machine/freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
    });
    expect(subjectTarget(details, "MachineDeployment", "freelens-capi-healthy-md-0-m9x7h")).toEqual({
      form: "tree",
      node: "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
    });
    expect(subjectTarget(details, "MachineSet", "freelens-capi-healthy-md-0-m9x7h-m5gtb")).toEqual({
      form: "tree",
      node: "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
    });
    expect(subjectTarget(details, "KubeadmControlPlane", controlPlane)).toEqual({
      form: "tree",
      node: `controlplane.cluster.x-k8s.io/KubeadmControlPlane/${controlPlane}`,
    });
    expect(subjectTarget(details, "KubeadmControlPlane", "another")).toEqual({ form: "text" });
  });

  it("leave as text a KubeadmControlPlane that the Cluster names and that the view did not read (SPEC-0005, P5)", () => {
    // healthy, the control plane reference of its Cluster naming a KubeadmControlPlane that its namespace does not
    // hold, as the case writes it.
    const gone = "freelens-capi-healthy-gone";
    const details = detailsOf(["healthy"], (cluster) => {
      cluster.spec.controlPlaneRef.name = gone;
    });

    expect(details.controlPlane?.reference?.name).toBe(gone);
    expect(subjectTarget(details, "KubeadmControlPlane", gone)).toEqual({ form: "text" });
  });

  it("write a kind as a subject writes it, alone and in the plural, the plural of each kind that the extension models being that of its definition in the capitals of the kind (SPEC-0005, P5)", () => {
    for (const model of [Cluster, ...CONTEXT_MODELS, ...TREE_MODELS]) {
      const [kind, plural] = subjectKindsOf(model.kind);

      expect(kind).toBe(model.kind);
      expect(plural.startsWith(model.kind), model.kind).toBe(true);
      expect(plural.toLowerCase(), model.kind).toBe(model.crd.plural);
    }
    expect(subjectKindsOf("ClusterClass")).toEqual(["ClusterClass", "ClusterClasses"]);
    expect(subjectKindsOf("IPAddress")).toEqual(["IPAddress", "IPAddresses"]);
    expect(subjectKindsOf("Machine")).toEqual(["Machine", "Machines"]);
  });

  it("open the tree from each name of a subject whatever the number of its kind, as the messages of rolling-out write its Machines (SPEC-0005, P5)", () => {
    const details = detailsOf(["rolling-out"]);
    const subjectOf = (type: string) =>
      details.conditions?.find((view) => view.condition.type === type)?.lines[0]?.subject;
    // One Machine that is not ready, `* Machine <name>:`, and two that are not up to date, `* Machines <a>, <b>:`, as
    // the parser gives them.
    const one = subjectOf("WorkerMachinesReady");
    const two = subjectOf("WorkerMachinesUpToDate");

    expect(one?.kind).toBe("Machine");
    expect(one?.names).toHaveLength(1);
    expect(two?.kind).toBe("Machines");
    expect(two?.names).toHaveLength(2);
    for (const subject of [one, two]) {
      for (const name of subject?.names ?? []) {
        expect(subjectTarget(details, subject?.kind ?? "", name), `${subject?.kind} ${name}`).toEqual({
          form: "tree",
          node: `cluster.x-k8s.io/Machine/${name}`,
        });
      }
    }
  });

  it("open the target of each name of a subject in the plural on lines that the case writes, every other name text (SPEC-0004, P18; SPEC-0005, P5)", () => {
    const details = detailsOf(["healthy"]);
    const devCluster = details.infrastructure?.reference;
    const controlPlane = details.controlPlane?.reference?.name ?? "";
    const message = parseConditionMessage(
      [
        "* MachineSets freelens-capi-healthy-md-0-m9x7h-m5gtb, not-read-here: waiting",
        "* MachineDeployments a, freelens-capi-healthy-md-0-m9x7h, b, ... (2 more): waiting",
        `* KubeadmControlPlanes ${controlPlane}, another: waiting`,
        "* Clusters freelens-capi-healthy, another: waiting",
        `* DevClusters ${devCluster?.name}, not-this-one: waiting`,
        // A word that the parser reads as the kind of a subject and that names no kind, as `deleting` writes it.
        "* Worker Machines: freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      ].join("\n"),
    );
    const targets = messageLines(message).flatMap(({ subject }) =>
      (subject?.names ?? []).map((name) => [
        `${subject?.kind} ${name}`,
        subjectTarget(details, subject?.kind ?? "", name),
      ]),
    );

    expect(targets).toEqual([
      [
        "MachineSets freelens-capi-healthy-md-0-m9x7h-m5gtb",
        { form: "tree", node: "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb" },
      ],
      ["MachineSets not-read-here", { form: "text" }],
      ["MachineDeployments a", { form: "text" }],
      [
        "MachineDeployments freelens-capi-healthy-md-0-m9x7h",
        { form: "tree", node: "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h" },
      ],
      ["MachineDeployments b", { form: "text" }],
      [
        `KubeadmControlPlanes ${controlPlane}`,
        { form: "tree", node: `controlplane.cluster.x-k8s.io/KubeadmControlPlane/${controlPlane}` },
      ],
      ["KubeadmControlPlanes another", { form: "text" }],
      [
        "Clusters freelens-capi-healthy",
        { form: "cluster", namespace: "freelens-capi-healthy", name: "freelens-capi-healthy" },
      ],
      ["Clusters another", { form: "text" }],
      [`DevClusters ${devCluster?.name}`, { form: "host", selfLink: devCluster?.selfLink }],
      ["DevClusters not-this-one", { form: "text" }],
      ["Worker Machines", { form: "text" }],
    ]);
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
