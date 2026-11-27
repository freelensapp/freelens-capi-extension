import { describe, expect, it } from "vitest";
import { TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet } from "../../../test/fixture-sets";
import { treeSourceOf } from "../../../test/tree-sources";
import { annotationsOf } from "./annotations";
import { buildTree, evaluateTree, indexTree } from "./cluster-tree";
import { StatusMemo } from "./context";
import { nodeDetailsOf, subjectNodes } from "./node-details";

import type { TreeSourceOptions } from "../../../test/tree-sources";
import type { KubeObjectData } from "../status/index";
import type { ClusterTree, NodeStatus, ObjectNode, ReferenceNode } from "./cluster-tree";
import type { Fact, NodeDetails } from "./node-details";
import type { ReadFailure } from "./read-state";

// The cases of SPEC-0005, "Tests", "Unit", `node-details.test.ts` (P17, P20): the sections of each kind, shown or
// hidden; the place of a node and the field that found it, and the reason of each case under Other objects; the
// owners as links to their nodes, and an owner that the tree does not hold as text; the subjects of a message as links
// to their nodes; the templates of an object as links to their rows; the phase with its remark for a Machine and a
// MachinePool, and with none for a MachineDeployment; the pool of a claim as text with its role, and the remediation
// template of a MachineHealthCheck as text; the reason of an object under the row of an owner that cannot be read; the
// annotations of the kinds of P20 without the one that `kubectl apply` writes, whose presence alone they say; and the
// names of the variables and of the patches of the class, with none of their values. A value that the fixtures do not
// hold is written by the case into a copy of a fixture, which the case says.

interface Writable {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: { apiVersion: string; kind: string; name: string; controller?: boolean }[];
  };
  spec: any;
  status?: any;
}

interface View {
  readonly tree: ClusterTree;
  readonly statuses: ReadonlyMap<string, NodeStatus>;
  readonly memo: StatusMemo;
}

const HEALTHY = "freelens-capi-healthy";
const LAST_APPLIED = "kubectl.kubernetes.io/last-applied-configuration";
const REFUSED: ReadFailure = { refused: true, message: 'machines.cluster.x-k8s.io is forbidden in "x"' };

function setOf(state: string): Writable[] {
  return structuredClone(fixtureSet(state)) as unknown as Writable[];
}

function named(objects: readonly Writable[], kind: string, name?: string): Writable {
  const found = objects.find((object) => object.kind === kind && (name === undefined || object.metadata.name === name));

  if (found === undefined) throw new Error(`No ${kind} ${name ?? ""} in the set`);
  return found;
}

function viewOf(objects: readonly unknown[], name: string, options: TreeSourceOptions = {}): View {
  const source = treeSourceOf(objects as KubeObjectData[], { cluster: { namespace: name, name }, ...options });
  const index = indexTree(source.clusters, source.objects);
  const outcome = buildTree(index, name, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${name}`);

  const memo = new StatusMemo();

  return { tree: outcome.tree, statuses: evaluateTree(outcome.tree, index, CAPTURE, memo), memo };
}

function stateView(state: string, options: TreeSourceOptions = {}): View {
  return viewOf(setOf(state), TREE_CLUSTERS[state], options);
}

function detailsOf(view: View, id: string): NodeDetails {
  const node = view.tree.nodes.get(id);

  if (node === undefined || (node.form !== "object" && node.form !== "reference")) throw new Error(`No node ${id}`);

  const status = view.statuses.get(id);
  const conditions =
    status === undefined || node.form !== "object"
      ? undefined
      : view.memo.conditions(node.object, status.context, status.key);

  return nodeDetailsOf(view.tree, node as ObjectNode | ReferenceNode, { status, conditions });
}

function sections(details: NodeDetails): string[] {
  return [
    ...(details.metadata === undefined ? [] : ["metadata"]),
    "place",
    ...(details.status === undefined ? [] : ["status"]),
    ...(details.unread === undefined ? [] : ["unread"]),
    ...(details.facts.length === 0 ? [] : ["facts"]),
    ...(details.conditions === undefined ? [] : ["conditions"]),
  ];
}

function factOf(details: NodeDetails, name: string): Fact | undefined {
  return details.facts.find((fact) => fact.name === name);
}

const machine = (name: string) => `cluster.x-k8s.io/Machine/${name}`;
const WORKER = "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg";

describe("the sections of the details of a node (P17)", () => {
  const view = stateView("healthy");

  it("of an object read: its metadata, its place, its status, its facts and its conditions", () => {
    const details = detailsOf(view, machine(WORKER));

    expect(details.title).toBe(`Machine: ${WORKER}`);
    expect(sections(details)).toEqual(["metadata", "place", "status", "facts", "conditions"]);
    expect(details.metadata?.namespace).toBe(HEALTHY);
  });

  it("of a template: no conditions, the words that its kind has no status, and the nodes that name it as links", () => {
    const details = detailsOf(
      view,
      "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-md-0-xp9c7",
    );

    expect(sections(details)).toEqual(["metadata", "place", "status", "facts"]);
    expect(factOf(details, "Status")).toEqual({ name: "Status", form: "text", text: "Its kind has no status." });
    expect(factOf(details, "Named by")).toEqual({
      name: "Named by",
      form: "links",
      links: [
        {
          node: "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
          text: "MachineDeployment freelens-capi-healthy-md-0-m9x7h",
          field: "spec.template.spec.infrastructureRef",
        },
        {
          node: "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
          text: "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
          field: "spec.template.spec.infrastructureRef",
        },
      ],
    });
  });

  it("of a node that cannot be read: its place, and why, with no metadata, status or conditions", () => {
    const deleting = stateView("deleting");
    const details = detailsOf(
      deleting,
      "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-deleting-md-0-gq8t7",
    );

    expect(sections(details)).toEqual(["place", "unread", "facts"]);
    expect(details.unread).toEqual({ words: "No such object is in the namespace of the Cluster.", messages: [] });
  });

  it("of a node whose kind still loads: the spinner, and no words yet", () => {
    const loading = stateView("healthy", { pending: ["bootstrap.cluster.x-k8s.io/KubeadmConfig"] });
    const details = detailsOf(loading, `bootstrap.cluster.x-k8s.io/KubeadmConfig/${WORKER}`);

    expect(details.loading).toBe(true);
    expect(details.unread).toBeUndefined();
  });
});

describe("the place of a node (P7, P17)", () => {
  const view = stateView("healthy");

  it("names its role, the object above it as a link and the field by which the tree found it", () => {
    expect(detailsOf(view, `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`).place).toEqual({
      role: "infrastructure machine",
      of: { node: machine(WORKER), text: `Machine ${WORKER}` },
      under: undefined,
      by: "spec.infrastructureRef",
      reason: undefined,
    });
    expect(detailsOf(view, machine(WORKER)).place).toEqual({
      role: "Machine",
      of: {
        node: "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
        text: "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
      },
      under: undefined,
      by: "its controller",
      reason: undefined,
    });
  });

  it("leaves out the virtual nodes between it and the object above it, and names the one right above it", () => {
    expect(detailsOf(view, "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h").place).toEqual({
      role: "MachineDeployment",
      of: { node: `cluster.x-k8s.io/Cluster/${HEALTHY}`, text: `Cluster ${HEALTHY}` },
      under: "Workers",
      by: "the label cluster.x-k8s.io/cluster-name",
      reason: undefined,
    });
  });

  it("says why an object sits under Other objects", () => {
    const noStatus = stateView("no-status");

    expect(detailsOf(noStatus, "cluster.x-k8s.io/MachineSet/freelens-capi-no-status-set").place).toMatchObject({
      under: "Other objects",
      reason: "It has no owner.",
    });
  });

  it("says why an object sits under the row of an owner that cannot be read", () => {
    const refused = stateView("healthy", { failures: { "cluster.x-k8s.io/Machine": [REFUSED] } });

    expect(detailsOf(refused, `bootstrap.cluster.x-k8s.io/KubeadmConfig/${WORKER}`).place).toEqual({
      role: "KubeadmConfig",
      of: { node: machine(WORKER), text: `Machine ${WORKER}` },
      under: undefined,
      by: undefined,
      reason: `Its owner Machine ${WORKER} is of a kind not read. Not read. Its kind could not be read in the namespace of the Cluster.`,
    });
  });
});

describe("the metadata of a node (P5, P20)", () => {
  it("give an owner that the tree holds as a link to its node, an owner of Cluster API included, the Cluster too", () => {
    const view = stateView("healthy");
    const details = detailsOf(view, `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`);

    expect(details.metadata?.owners).toEqual([{ kind: "Machine", name: WORKER, node: machine(WORKER) }]);
    // The Cluster, the root of the tree, whose details the drawer shows as those of a Cluster.
    expect(
      detailsOf(view, "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h").metadata?.owners,
    ).toEqual([{ kind: "Cluster", name: HEALTHY, node: `cluster.x-k8s.io/Cluster/${HEALTHY}` }]);
  });

  it("give an owner that the tree does not hold as text, the IPAM pool of an IPAddress, written by the case", () => {
    const objects = setOf("healthy");
    const [claim, address] = ["IPAddressClaim", "IPAddress"].map((kind) =>
      structuredClone(named(setOf("no-status"), kind)),
    );

    for (const object of [claim, address]) object.metadata.namespace = HEALTHY;
    claim.spec.clusterName = HEALTHY;
    address.metadata.ownerReferences = [
      {
        apiVersion: "ipam.test-environment.freelens.app/v1alpha1",
        kind: "AddressPool",
        name: "freelens-capi-no-status",
      },
    ];

    const details = detailsOf(
      viewOf([...objects, claim, address], HEALTHY),
      "ipam.cluster.x-k8s.io/IPAddress/freelens-capi-no-status",
    );

    expect(details.metadata?.owners).toEqual([
      { kind: "AddressPool", name: "freelens-capi-no-status", node: undefined },
    ]);
    expect(factOf(details, "Address")).toMatchObject({ text: "10.0.0.10" });
    expect(factOf(details, "Prefix")).toMatchObject({ text: "24" });
    expect(factOf(details, "Gateway")).toMatchObject({ text: "10.0.0.1" });
  });

  it("give the annotations of the kinds of P20 in a row of their own, the one that kubectl apply writes left out and its presence said", () => {
    const objects = setOf("healthy");
    const config = named(objects, "KubeadmConfig", WORKER);

    // The annotation that `kubectl apply` writes, holding the spec as applied, written by the case.
    config.metadata.annotations = {
      ...config.metadata.annotations,
      [LAST_APPLIED]: JSON.stringify({ spec: { files: [{ path: "/etc/secret", content: "s3cr3t" }] } }),
    };

    const view = viewOf(objects, HEALTHY);
    const annotations = detailsOf(view, `bootstrap.cluster.x-k8s.io/KubeadmConfig/${WORKER}`).metadata?.annotations;

    expect(annotations).toEqual({
      shown: [
        { key: "cluster.x-k8s.io/cloned-from-groupkind", value: "KubeadmConfigTemplate.bootstrap.cluster.x-k8s.io" },
        { key: "cluster.x-k8s.io/cloned-from-name", value: "freelens-capi-healthy-md-0-2wh2v" },
      ],
      held: [LAST_APPLIED],
    });
    expect(JSON.stringify(annotations)).not.toMatch(/s3cr3t/);
    // A Machine is no kind of P20: the host shows its annotations.
    expect(detailsOf(view, machine(WORKER)).metadata?.annotations).toBeUndefined();
    // An object of a provider is.
    expect(detailsOf(view, `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`).metadata?.annotations).toBeDefined();
  });

  it.each([
    ["a KubeadmConfig", "KubeadmConfig", WORKER],
    ["a KubeadmConfigTemplate", "KubeadmConfigTemplate", "freelens-capi-healthy-md-0-2wh2v"],
    ["a KubeadmControlPlane", "KubeadmControlPlane", "freelens-capi-healthy-d2lgq"],
    ["the ClusterClass", "ClusterClass", "quick-start"],
    ["the Cluster", "Cluster", HEALTHY],
    ["the infrastructure cluster of a provider", "DevCluster", "freelens-capi-healthy-8fgcf"],
    ["an infrastructure machine of a provider", "DevMachine", WORKER],
    ["a template of a provider", "DevMachineTemplate", "freelens-capi-healthy-md-0-xp9c7"],
  ])(
    "leave the annotations of %s out of the metadata of the host, in a row of their own, the one that kubectl apply writes held and not shown (P20)",
    (_, kind, name) => {
      const objects = setOf("healthy");
      const object = named(objects, kind, name);

      // The annotation that `kubectl apply` writes, holding the spec as applied, and another one, written by the case.
      object.metadata.annotations = {
        ...object.metadata.annotations,
        [LAST_APPLIED]: JSON.stringify({ spec: { files: [{ path: "/etc/secret", content: "s3cr3t" }] } }),
        "example.test/shown": "yes",
      };

      const view = viewOf(objects, HEALTHY);
      const node = [...view.tree.nodes.values()].find(
        (each) => each.form === "object" && each.kind === kind && each.name === name,
      );
      const annotations = detailsOf(view, node?.id ?? "").metadata?.annotations;

      expect(annotations?.held).toEqual([LAST_APPLIED]);
      expect(annotations?.shown).toContainEqual({ key: "example.test/shown", value: "yes" });
      expect(JSON.stringify(annotations)).not.toMatch(/s3cr3t/);
    },
  );

  it("read whether an object holds that annotation, never its value", () => {
    const object = {
      apiVersion: "v1",
      kind: "Object",
      metadata: {
        name: "a",
        annotations: new Proxy({ [LAST_APPLIED]: "held", other: "shown" } as Record<string, string>, {
          get(target, key) {
            if (key === LAST_APPLIED) throw new Error("the value of the annotation was read");
            return Reflect.get(target, key);
          },
        }),
      },
    } as unknown as KubeObjectData;

    expect(annotationsOf(object)).toEqual({ shown: [{ key: "other", value: "shown" }], held: [LAST_APPLIED] });
  });
});

describe("the status of a node (P17)", () => {
  it("shows the phase with its remark for a Machine and a MachinePool, and with none for a MachineDeployment", () => {
    const view = stateView("machine-pools");
    const pool = [...view.tree.nodes.values()].find((node) => node.form === "object" && node.kind === "MachinePool");
    const deployment = detailsOf(
      stateView("healthy"),
      "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
    );

    expect(detailsOf(stateView("healthy"), machine(WORKER)).status?.phase).toEqual({
      written: "Running",
      deprecated: false,
      remark: "The project tells no software to decide on the phase of a Machine.",
    });
    expect(detailsOf(view, pool?.id ?? "").status?.phase?.remark).toBe(
      "The project tells no software to decide on the phase of a MachinePool.",
    );
    expect(deployment.status?.phase).toEqual({ written: "Running", deprecated: false, remark: undefined });
  });

  it("names what the health rests on, in the words of its cell Status, and the condition that sums it up", () => {
    const details = detailsOf(stateView("healthy"), machine(WORKER));

    expect(details.status?.restsOn.text).toBe("Ready");
    expect(details.status?.summary).toMatchObject({ type: "Ready", status: "True" });
    expect(details.status?.health.mark?.word).toBe("Healthy");
  });

  it("shows the stage of a deletion", () => {
    const details = detailsOf(stateView("deleting"), machine("freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw"));

    expect(details.status?.activities[0]).toMatchObject({ name: "Deleting", stage: { reason: expect.any(String) } });
  });

  it("tells a pause by the own annotation of an object", () => {
    const objects = setOf("healthy");

    named(objects, "Machine", WORKER).metadata.annotations = { "cluster.x-k8s.io/paused": "" };

    const details = detailsOf(viewOf(objects, HEALTHY), machine(WORKER));

    expect(details.status?.activities.find((activity) => activity.name === "Paused")?.pause).toBe("own");
  });
});

describe("the facts of each kind (P17)", () => {
  const view = stateView("healthy");

  it("of a control plane, a MachineDeployment and a MachineSet: every counter with its unit, the version, and the templates as links", () => {
    const controlPlane = detailsOf(
      view,
      "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
    );
    const deployment = detailsOf(view, "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h");

    expect(factOf(controlPlane, "Machines")).toEqual({
      name: "Machines",
      form: "counters",
      counters: [
        { label: "desired Machines", count: 1 },
        { label: "current Machines", count: 1 },
        { label: "ready Machines", count: 1 },
        { label: "available Machines", count: 1 },
        { label: "up to date Machines", count: 1 },
      ],
    });
    expect(factOf(controlPlane, "Version")).toMatchObject({ text: "v1.37.0" });
    expect(factOf(controlPlane, "Templates")).toEqual({
      name: "Templates",
      form: "links",
      links: [
        {
          node: "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml",
          text: "DevMachineTemplate freelens-capi-healthy-rclml",
          field: "spec.machineTemplate.spec.infrastructureRef",
        },
      ],
    });
    expect(factOf(deployment, "Templates")).toMatchObject({
      links: [
        { text: "DevMachineTemplate freelens-capi-healthy-md-0-xp9c7" },
        { text: "KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v" },
      ],
    });
    // The MachineSet names the same templates, which sit under the MachineDeployment: its details link to their rows.
    expect(
      factOf(detailsOf(view, "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb"), "Templates"),
    ).toMatchObject({
      links: [{ node: "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-md-0-xp9c7" }, {}],
    });
  });

  it("of a Machine: its version, its provider ID, its Node as text, and its infrastructure machine and bootstrap config as links", () => {
    const details = detailsOf(view, machine(WORKER));

    expect(factOf(details, "Version")).toMatchObject({ text: "v1.37.0" });
    expect(factOf(details, "Provider ID")).toMatchObject({ form: "text" });
    expect(factOf(details, "Node")).toMatchObject({ form: "text", text: expect.stringMatching(/worker|md-0/) });
    expect(factOf(details, "Objects")).toEqual({
      name: "Objects",
      form: "links",
      links: [
        {
          node: `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`,
          text: `DevMachine ${WORKER}`,
          field: "spec.infrastructureRef",
        },
        {
          node: `bootstrap.cluster.x-k8s.io/KubeadmConfig/${WORKER}`,
          text: `KubeadmConfig ${WORKER}`,
          field: "spec.bootstrap.configRef",
        },
      ],
    });
  });

  it("of an object of a provider: the field of its contract that says it is ready, in three words, and the link to the details of the host", () => {
    const details = detailsOf(view, `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`);

    expect(factOf(details, "Ready by its contract")).toEqual({
      name: "Ready by its contract",
      form: "answer",
      answer: { answer: "Yes", since: undefined },
      field: "status.initialization.provisioned",
    });
    expect(factOf(details, "Provider ID")).toMatchObject({ form: "text" });
  });

  it("of an object of a provider: the link to the details of the host by its self link, and none for an object of Cluster API", () => {
    const objects = setOf("healthy");
    const link = (kind: string) => `/apis/example/${kind}/${WORKER}`;

    for (const kind of ["DevMachine", "Machine"]) {
      (named(objects, kind, WORKER).metadata as Writable["metadata"] & { selfLink?: string }).selfLink = link(kind);
    }

    const linked = viewOf(objects, HEALTHY);

    expect(factOf(detailsOf(linked, `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`), "In Freelens")).toEqual({
      name: "In Freelens",
      form: "host",
      text: `DevMachine ${WORKER}`,
      selfLink: link("DevMachine"),
    });
    expect(detailsOf(linked, machine(WORKER)).facts.some((fact) => fact.form === "host")).toBe(false);
  });

  it("of a MachineHealthCheck: its targets as links, its counts, its mark of remediation, and its remediation template as text", () => {
    const objects = setOf("healthy");
    const check = named(objects, "MachineHealthCheck", "freelens-capi-healthy-md-0-m9x7h");

    check.spec.remediation = {
      ...check.spec.remediation,
      templateRef: { apiVersion: "remediation.example.test/v1alpha1", kind: "ExampleRemediationTemplate", name: "fix" },
    };

    const details = detailsOf(
      viewOf(objects, HEALTHY),
      "cluster.x-k8s.io/MachineHealthCheck/freelens-capi-healthy-md-0-m9x7h",
    );

    expect(factOf(details, "Targets")).toEqual({
      name: "Targets",
      form: "links",
      links: [
        { node: machine(WORKER), text: `Machine ${WORKER}` },
        {
          node: machine("freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9"),
          text: "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
        },
      ],
    });
    expect(factOf(details, "Remediation")).toMatchObject({ form: "text", text: "Allowed" });
    expect(factOf(details, "Remediation template")).toEqual({
      name: "Remediation template",
      form: "text",
      text: "ExampleRemediationTemplate fix",
      tooltip: "remediation.example.test",
    });
  });

  it("of a ClusterResourceSet: its selector as text and what it applied to this Cluster", () => {
    const details = detailsOf(view, "addons.cluster.x-k8s.io/ClusterResourceSet/cni-kindnet");

    expect(factOf(details, "Selector")?.form).toBe("list");
    expect(factOf(details, "Applied to this Cluster")).toEqual({
      name: "Applied to this Cluster",
      form: "list",
      items: ["ConfigMap cni-kindnet: applied"],
    });
  });

  it("of an IPAddressClaim: its pool as text with its role, its group in the tooltip, and its IPAddress as a link", () => {
    const objects = setOf("healthy");
    const [claim, address] = ["IPAddressClaim", "IPAddress"].map((kind) =>
      structuredClone(named(setOf("no-status"), kind)),
    );

    for (const object of [claim, address]) object.metadata.namespace = HEALTHY;
    claim.spec.clusterName = HEALTHY;
    claim.status = { addressRef: { name: "freelens-capi-no-status" } };

    const details = detailsOf(
      viewOf([...objects, claim, address], HEALTHY),
      "ipam.cluster.x-k8s.io/IPAddressClaim/freelens-capi-no-status",
    );

    expect(factOf(details, "Pool")).toEqual({
      name: "Pool",
      form: "text",
      text: "AddressPool freelens-capi-no-status, IPAM pool",
      tooltip: "ipam.test-environment.freelens.app",
    });
    expect(factOf(details, "IPAddress")).toEqual({
      name: "IPAddress",
      form: "links",
      links: [
        { node: "ipam.cluster.x-k8s.io/IPAddress/freelens-capi-no-status", text: "IPAddress freelens-capi-no-status" },
      ],
    });
  });

  it("of the ClusterClass: the names of its variables and of its patches, and none of their values", () => {
    const details = detailsOf(view, "cluster.x-k8s.io/ClusterClass/quick-start");
    const variables = factOf(details, "Variables");
    const patches = factOf(details, "Patches");
    const clusterClass = named(setOf("healthy"), "ClusterClass");

    expect(variables).toEqual({
      name: "Variables",
      form: "list",
      items: clusterClass.spec.variables.map((variable: { name: string }) => variable.name),
    });
    expect(patches).toEqual({
      name: "Patches",
      form: "list",
      items: clusterClass.spec.patches.map((patch: { name: string }) => patch.name),
    });
    // No value of a variable, and nothing of a patch but its name.
    expect(JSON.stringify(details.facts)).not.toMatch(/"openAPIV3Schema"|"definitions"|"jsonPatches"|"valueFrom"/);
  });
});

describe("the subjects of a message (P5)", () => {
  it("name the nodes of the objects of Cluster API of the Cluster, by their kind and their name", () => {
    const subjects = subjectNodes(stateView("healthy").tree);

    expect(subjects.get(`Machine/${WORKER}`)).toBe(machine(WORKER));
    expect(subjects.get("KubeadmControlPlane/freelens-capi-healthy-d2lgq")).toBe(
      "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
    );
    expect(subjects.get(`Cluster/${HEALTHY}`)).toBe(`cluster.x-k8s.io/Cluster/${HEALTHY}`);
    // An object of a provider is no node that a subject opens.
    expect(subjects.get(`DevMachine/${WORKER}`)).toBeUndefined();
    expect(subjects.get("ClusterClass/quick-start")).toBe("cluster.x-k8s.io/ClusterClass/quick-start");
  });

  it("name the class of the Cluster read in another namespace, the one node of the tree of its kind and its name", () => {
    const objects = setOf("healthy");

    named(objects, "Cluster").spec.topology.classRef.namespace = "freelens-capi-classes";
    named(objects, "ClusterClass").metadata.namespace = "freelens-capi-classes";

    const subjects = subjectNodes(viewOf(objects, HEALTHY, { classNamespace: "freelens-capi-classes" }).tree);

    expect(subjects.get("ClusterClass/quick-start")).toBe(
      "cluster.x-k8s.io/ClusterClass/freelens-capi-classes/quick-start",
    );
  });
});
