import { describe, expect, it } from "vitest";
import { EXPECTED_TREES, outlineRows, TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet, STATES } from "../../../test/fixture-sets";
import { resolved, treeKeyOf, treeOutline, treeSourceOf } from "../../../test/tree-sources";
import { statusOf } from "../status/index";
import { buildTree, evaluateTree, indexTree, kindWords, TreeBuilds, unreadWords } from "./cluster-tree";
import { clusterContextOf, StatusMemo } from "./context";

import type { OutlineRow } from "../../../integration/__tests__/tree-expectations";
import type { TreeSourceOptions } from "../../../test/tree-sources";
import type { KubeObjectData, StatusContext } from "../status/index";
import type { ClusterTree, KindNode, ObjectNode, ReferenceNode, TreeNode } from "./cluster-tree";
import type { ReadFailure } from "./read-state";

// The cases of SPEC-0005, "Tests", "Unit", `cluster-tree.test.ts` (P7, P8, P12, P21): the tree of the Cluster of each
// state of the fixtures, against the expected trees that `tree-expectations.ts` writes by hand from the sets; then the
// cases that change an object of the fixtures to reach a placement that no set holds, each change said in its case
// (SPEC-0003, "Tests"); the nodes that cannot be read; and the status of each node, from the model, under its key.

// An object of the fixtures, which a case changes.
interface Writable {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    deletionTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: { apiVersion: string; kind: string; name: string; controller?: boolean }[];
  };
  spec: any;
  status?: any;
}

const HEALTHY = "freelens-capi-healthy";
const REFUSED: ReadFailure = { refused: true, message: 'machines.cluster.x-k8s.io is forbidden in "x"' };

function setOf(state: string): Writable[] {
  return structuredClone(fixtureSet(state)) as unknown as Writable[];
}

function named(objects: readonly Writable[], kind: string, name?: string): Writable {
  const found = objects.find((object) => object.kind === kind && (name === undefined || object.metadata.name === name));

  if (found === undefined) throw new Error(`No ${kind} ${name ?? ""} in the set`);
  return found;
}

function treeOf(
  objects: readonly KubeObjectData[],
  name: string,
  options: TreeSourceOptions = {},
  namespace = name,
): ClusterTree {
  const source = treeSourceOf(objects, options);
  const outcome = buildTree(indexTree(source.clusters, source.objects), namespace, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${namespace}/${name}: ${outcome.state}`);
  return outcome.tree;
}

function stateTree(state: string, options: TreeSourceOptions = {}): ClusterTree {
  return treeOf(setOf(state), TREE_CLUSTERS[state], options);
}

// The node above a node, by the text of its outline.
function parentOf(tree: ClusterTree, id: string): string | undefined {
  const parent = tree.parents.get(id);

  return parent === undefined ? undefined : text(tree.nodes.get(parent) as TreeNode);
}

function text(node: TreeNode): string {
  return treeOutline({ root: node as ObjectNode, nodes: new Map(), parents: new Map(), classNamespace: undefined })[0]
    .text;
}

function nodeOf<T extends TreeNode>(tree: ClusterTree, id: string): T {
  const node = tree.nodes.get(id);

  if (node === undefined) throw new Error(`No node ${id}: ${JSON.stringify([...tree.nodes.keys()])}`);
  return node as T;
}

// The rows of an outline under the row of a text, with their depth from it.
function under(rows: readonly OutlineRow[], text: string): string[] {
  const at = rows.findIndex((row) => row.text === text);
  const depth = rows[at].depth;
  const end = rows.findIndex((row, index) => index > at && row.depth <= depth);

  return rows
    .slice(at + 1, end === -1 ? undefined : end)
    .map((row) => `${"  ".repeat(row.depth - depth - 1)}${row.text}`);
}

const machineId = (name: string) => `cluster.x-k8s.io/Machine/${name}`;

describe("the tree of the Cluster of each state (P7, P8)", () => {
  it("covers every state of the fixtures", () => {
    expect(Object.keys(EXPECTED_TREES).sort()).toEqual([...STATES].sort());
  });

  it.each(STATES)("%s is the expected tree, one row for each object, under its node", (state) => {
    expect(treeOutline(stateTree(state))).toEqual(outlineRows(EXPECTED_TREES[state]));
  });

  it.each(STATES)(
    "%s has no node of what is no node: the templates that only the class names, the MachineDrainRule, the Provider, a Secret or a ConfigMap (P8)",
    (state) => {
      const tree = stateTree(state);
      const objects = [...tree.nodes.values()].filter((node) => node.form === "object" || node.form === "reference");

      for (const node of objects) {
        expect(
          ["MachineDrainRule", "Provider", "Secret", "ConfigMap", "KubeadmControlPlaneTemplate"],
          node.id,
        ).not.toContain((node as ObjectNode).kind);
        expect((node as ObjectNode).name.startsWith("quick-start-"), node.id).toBe(false);
      }
    },
  );
});

describe("a template (P7)", () => {
  it("that the control plane and a MachineDeployment both name is one row under the control plane, which the MachineDeployment names too", () => {
    const objects = setOf("healthy");

    named(objects, "MachineDeployment").spec.template.spec.infrastructureRef.name = "freelens-capi-healthy-rclml";

    const tree = treeOf(objects, HEALTHY);
    const template = nodeOf<ObjectNode>(
      tree,
      "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml",
    );

    expect(parentOf(tree, tree.parents.get(template.id) as string)).toBe(
      "KubeadmControlPlane freelens-capi-healthy-d2lgq",
    );
    expect(template.namedBy).toEqual([
      {
        id: "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
        field: "spec.machineTemplate.spec.infrastructureRef",
      },
      {
        id: "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
        field: "spec.template.spec.infrastructureRef",
      },
    ]);
    // The MachineSet alone still names the template that the MachineDeployment named.
    expect(under(treeOutline(tree), "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb")).toContain(
      "  DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)",
    );
  });

  it("that an older MachineSet alone names sits under that MachineSet", () => {
    const objects = setOf("rolling-out");
    const older = named(objects, "MachineSet", "freelens-capi-rolling-out-md-0-t96dp-xkg62");
    const template = structuredClone(named(objects, "DevMachineTemplate", "freelens-capi-rolling-out-md-0-hcxz5"));

    template.metadata.name = "freelens-capi-rolling-out-md-0-older";
    older.spec.template.spec.infrastructureRef.name = template.metadata.name;

    const rows = treeOutline(treeOf([...objects, template], "freelens-capi-rolling-out"));

    expect(under(rows, "MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62").slice(-2)).toEqual([
      "Templates",
      "  DevMachineTemplate freelens-capi-rolling-out-md-0-older (template)",
    ]);
  });

  it("that two MachineDeployments name sits under the first by name, and one that two older MachineSets name under the first of them, whatever the order of the store", () => {
    const objects = setOf("healthy");
    const deployment = named(objects, "MachineDeployment");
    const second = structuredClone(deployment);

    second.metadata.name = "freelens-capi-healthy-md-0-aaaaa";

    const one = treeOf([...objects, second], HEALTHY);
    const other = treeOf([second, ...objects].reverse(), HEALTHY);
    const template = "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-md-0-xp9c7";

    for (const tree of [one, other]) {
      expect(parentOf(tree, tree.parents.get(template) as string)).toBe(
        "MachineDeployment freelens-capi-healthy-md-0-aaaaa",
      );
    }

    // The MachineDeployment of rolling-out names other templates: its two MachineSets name the old ones.
    const rolling = setOf("rolling-out");

    named(rolling, "MachineDeployment").spec.template.spec.infrastructureRef.name =
      "freelens-capi-rolling-out-md-0-next";

    for (const objects of [rolling, [...rolling].reverse()]) {
      const tree = treeOf(objects, "freelens-capi-rolling-out");

      expect(
        parentOf(
          tree,
          tree.parents.get(
            "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-rolling-out-md-0-hcxz5",
          ) as string,
        ),
      ).toBe("MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t");
    }
  });

  it("that the Cluster owns and no object names sits under Other objects, with that reason", () => {
    const objects = setOf("healthy");
    const unused = structuredClone(named(objects, "DevMachineTemplate", "freelens-capi-healthy-md-0-xp9c7"));

    unused.metadata.name = "freelens-capi-healthy-unused";

    const tree = treeOf([...objects, unused], HEALTHY);
    const node = nodeOf<ObjectNode>(
      tree,
      "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-unused",
    );

    expect(parentOf(tree, node.id)).toBe("Other objects");
    expect(node.placement).toEqual({ by: "reason", reason: { code: "owned-by-cluster", namers: [] } });
  });
});

describe("the objects of a Machine and of a MachineSet (P7)", () => {
  it("whose Machine does not exist yet sit under the MachineSet that made them, by its owner reference with no flag of controller", () => {
    const objects = setOf("healthy");
    const set = named(objects, "MachineSet");
    const owner = { apiVersion: "cluster.x-k8s.io/v1beta2", kind: "MachineSet", name: set.metadata.name };
    const made = [
      structuredClone(named(objects, "KubeadmConfig", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg")),
      structuredClone(named(objects, "DevMachine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg")),
    ];

    for (const object of made) {
      object.metadata.name = "freelens-capi-healthy-md-0-m9x7h-m5gtb-new";
      object.metadata.ownerReferences = [owner];
    }

    const tree = treeOf([...objects, ...made], HEALTHY);
    const rows = under(treeOutline(tree), "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb");

    expect(rows.filter((row) => row.includes("-new"))).toEqual([
      "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-new (infrastructure machine)",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-new",
    ]);
    expect(
      nodeOf<ObjectNode>(tree, "bootstrap.cluster.x-k8s.io/KubeadmConfig/freelens-capi-healthy-md-0-m9x7h-m5gtb-new")
        .placement,
    ).toEqual({
      by: "owner",
      owner: "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
    });
  });

  it("an infrastructure machine of a pool whose Machine does not exist yet sits under its infrastructure machine pool", () => {
    const objects = setOf("machine-pools").filter(
      (object) => !(object.kind === "Machine" && object.metadata.name === "worker-c6khcq"),
    );
    const tree = treeOf(objects, "freelens-capi-machine-pools");

    expect(parentOf(tree, "infrastructure.cluster.x-k8s.io/DevMachine/worker-c6khcq")).toBe(
      "DevMachinePool freelens-capi-machine-pools-mp-0-6cl2n (infrastructure machine pool)",
    );
  });

  it("a Machine sits under its controller by group, kind and name, whatever its label of the name of its MachineSet says", () => {
    const objects = setOf("healthy");
    const machine = named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");

    (machine.metadata.labels as Record<string, string>)["cluster.x-k8s.io/set-name"] = "hash_0123456789abcdef";

    const tree = treeOf(objects, HEALTHY);

    expect(parentOf(tree, machineId(machine.metadata.name))).toBe("MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb");
    // Found by the row of the Machines, the field that the details show, not by the row of the owners after it.
    expect(nodeOf<ObjectNode>(tree, machineId(machine.metadata.name)).placement).toEqual({
      by: "controller",
      owner: "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
    });
  });

  it("a Machine of the control plane that its KubeadmControlPlane does not own yet sits under it, by its label", () => {
    const objects = setOf("healthy");
    const machine = named(objects, "Machine", "freelens-capi-healthy-d2lgq-zqlcx");

    delete machine.metadata.ownerReferences;

    const tree = treeOf(objects, HEALTHY);

    expect(parentOf(tree, machineId(machine.metadata.name))).toBe("KubeadmControlPlane freelens-capi-healthy-d2lgq");
    expect(nodeOf<ObjectNode>(tree, machineId(machine.metadata.name)).placement).toEqual({
      by: "label",
      label: "cluster.x-k8s.io/control-plane",
    });
  });

  it("the Machines of the control plane of a Cluster that names no control plane sit under the virtual node Control plane", () => {
    const objects = setOf("without-topology");

    delete named(objects, "Cluster").spec.controlPlaneRef;

    const rows = treeOutline(treeOf(objects, "freelens-capi-without-topology"));

    expect(under(rows, "Control plane")).toEqual([
      "Machine freelens-capi-without-topology-control-plane-jxdks",
      "  DevMachine freelens-capi-without-topology-control-plane-jxdks (infrastructure machine)",
      "  KubeadmConfig freelens-capi-without-topology-control-plane-jxdks",
    ]);
    // Its KubeadmControlPlane, which the Cluster owns and no object names, under Other objects, with the template that
    // it alone names, which has no label of the Cluster (SPEC-0005, "Notes and deviations").
    expect(under(rows, "Other objects")).toEqual([
      "KubeadmControlPlane freelens-capi-without-topology-control-plane",
      "  Templates",
      "    DevMachineTemplate freelens-capi-without-topology-control-plane (template)",
    ]);
  });
});

describe("an object of a provider (P7)", () => {
  // The control plane of healthy, as a provider of its own serves it: the kind, its group and its definition changed.
  function withProviderControlPlane(contract: "v1beta1" | "v1beta2") {
    const objects = setOf("healthy");
    const cluster = named(objects, "Cluster");
    const controlPlane = named(objects, "KubeadmControlPlane");
    const machine = named(objects, "Machine", "freelens-capi-healthy-d2lgq-zqlcx");
    const kind = "ExampleControlPlane";

    cluster.spec.controlPlaneRef = { apiGroup: "controlplane.example.test", kind, name: "example" };
    machine.metadata.ownerReferences = [
      { apiVersion: `controlplane.example.test/${contract}`, kind, name: "example", controller: true },
    ];

    const provider: Writable = {
      apiVersion: `controlplane.example.test/${contract}`,
      kind,
      metadata: { name: "example", namespace: HEALTHY, labels: { "cluster.x-k8s.io/cluster-name": HEALTHY } },
      spec:
        contract === "v1beta2"
          ? {
              machineTemplate: {
                spec: { infrastructureRef: controlPlane.spec.machineTemplate.spec.infrastructureRef },
              },
            }
          : {
              machineTemplate: {
                infrastructureRef: {
                  apiVersion: "infrastructure.cluster.x-k8s.io/v1beta1",
                  kind: "DevMachineTemplate",
                  name: "freelens-capi-healthy-rclml",
                },
              },
            },
    };
    const resolution = {
      ...resolved(`controlplane.example.test/${kind}`, "control-plane-example"),
      apiVersion: `controlplane.example.test/${contract}`,
      contract,
    } as const;

    return treeOf([...objects.filter((object) => object !== controlPlane), provider], HEALTHY, {
      resolutions: { [`controlplane.example.test/${kind}`]: resolution },
    });
  }

  it.each(["v1beta2", "v1beta1"] as const)(
    "a control plane at the contract %s has its role, its Machines and its template by the field of its contract",
    (contract) => {
      const tree = withProviderControlPlane(contract);

      expect(under(treeOutline(tree), "ExampleControlPlane example (control plane)")).toEqual([
        "Machine freelens-capi-healthy-d2lgq-zqlcx",
        "  DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine)",
        "  KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx",
        "Templates",
        "  DevMachineTemplate freelens-capi-healthy-rclml (template)",
      ]);
      // The template is read at the version of the contract label of its definition, never at that of `apiVersion`.
      expect(
        nodeOf<ObjectNode>(tree, "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml")
          .namedBy,
      ).toEqual([
        {
          id: "controlplane.example.test/ExampleControlPlane/example",
          field:
            contract === "v1beta2"
              ? "spec.machineTemplate.spec.infrastructureRef"
              : "spec.machineTemplate.infrastructureRef",
        },
      ]);
    },
  );

  it("a bootstrap config of a provider, which a Machine names, sits under that Machine with its role", () => {
    const objects = setOf("healthy");
    const machine = named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");
    const config: Writable = {
      apiVersion: "bootstrap.example.test/v1beta2",
      kind: "ExampleConfig",
      metadata: {
        name: "example-config",
        namespace: HEALTHY,
        labels: { "cluster.x-k8s.io/cluster-name": HEALTHY },
        ownerReferences: [
          { apiVersion: "cluster.x-k8s.io/v1beta2", kind: "Machine", name: machine.metadata.name, controller: true },
        ],
      },
      spec: {},
    };

    machine.spec.bootstrap.configRef = {
      apiGroup: "bootstrap.example.test",
      kind: "ExampleConfig",
      name: "example-config",
    };

    const tree = treeOf([...objects, config], HEALTHY, {
      resolutions: {
        "bootstrap.example.test/ExampleConfig": resolved("bootstrap.example.test/ExampleConfig", "bootstrap-example"),
      },
    });

    // The KubeadmConfig that the Machine no longer names comes after them, under the Machine that owns it.
    expect(under(treeOutline(tree), `Machine ${machine.metadata.name}`)).toEqual([
      `DevMachine ${machine.metadata.name} (infrastructure machine)`,
      "ExampleConfig example-config (bootstrap config)",
      `KubeadmConfig ${machine.metadata.name}`,
    ]);
    expect(nodeOf<ObjectNode>(tree, `bootstrap.example.test/ExampleConfig/example-config`).placement).toEqual({
      by: "reference",
      field: "spec.bootstrap.configRef",
      from: machineId(machine.metadata.name),
    });
    expect(
      nodeOf<ObjectNode>(tree, `bootstrap.cluster.x-k8s.io/KubeadmConfig/${machine.metadata.name}`).placement,
    ).toEqual({
      by: "owner",
      owner: machineId(machine.metadata.name),
    });
  });
});

describe("the IPAddressClaims of a Cluster (P7, P21)", () => {
  // The claim and the address of no-status, in the namespace of healthy, the claim naming its Cluster.
  function claimed(owner?: Writable) {
    const objects = setOf("healthy");
    const [claim, address] = ["IPAddressClaim", "IPAddress"].map((kind) =>
      structuredClone(named(setOf("no-status"), kind)),
    );

    for (const object of [claim, address]) object.metadata.namespace = HEALTHY;
    claim.spec.clusterName = HEALTHY;
    if (owner !== undefined) {
      claim.metadata.ownerReferences = [
        { apiVersion: owner.apiVersion, kind: owner.kind, name: owner.metadata.name, controller: true },
      ];
    }
    return [...objects, claim, address];
  }

  it("a claim with no owner sits under Other objects with that reason, its address under it", () => {
    const tree = treeOf(claimed(), HEALTHY);

    expect(under(treeOutline(tree), "Other objects")).toEqual([
      "IPAddressClaim freelens-capi-no-status",
      "  IPAddress freelens-capi-no-status",
    ]);
    expect(nodeOf<ObjectNode>(tree, "ipam.cluster.x-k8s.io/IPAddressClaim/freelens-capi-no-status").placement).toEqual({
      by: "reason",
      reason: { code: "no-owner" },
    });
  });

  it("a claim that its infrastructure machine controls sits under it, at seven levels with its address", () => {
    const objects = claimed();
    const devMachine = named(objects, "DevMachine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");
    const tree = treeOf(claimed(devMachine), HEALTHY);
    const rows = treeOutline(tree);

    expect(under(rows, "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)")).toEqual([
      "IPAddressClaim freelens-capi-no-status",
      "  IPAddress freelens-capi-no-status",
    ]);
    expect(rows.find((row) => row.text === "IPAddress freelens-capi-no-status")?.depth).toBe(7);
    // Found by the row of the claims, as the contract asks of the infrastructure machine, and its address by its claim.
    expect(nodeOf<ObjectNode>(tree, "ipam.cluster.x-k8s.io/IPAddressClaim/freelens-capi-no-status").placement).toEqual({
      by: "controller",
      owner: "infrastructure.cluster.x-k8s.io/DevMachine/freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
    });
    expect(nodeOf<ObjectNode>(tree, "ipam.cluster.x-k8s.io/IPAddress/freelens-capi-no-status").placement).toEqual({
      by: "claim",
      field: "spec.claimRef",
    });
  });

  it("the claim of no-status that names its Cluster, as P21 captures it, sits under Other objects with its address", () => {
    const objects = setOf("no-status");

    named(objects, "IPAddressClaim").spec.clusterName = "freelens-capi-no-status";

    const rows = treeOutline(treeOf(objects, "freelens-capi-no-status"));

    expect(under(rows, "Other objects").slice(-2)).toEqual([
      "IPAddressClaim freelens-capi-no-status",
      "  IPAddress freelens-capi-no-status",
    ]);
  });
});

describe("the ClusterClass and the add-ons (P6, P7)", () => {
  const CLASSES = "freelens-capi-classes";

  function elsewhere(options: TreeSourceOptions = {}) {
    const objects = setOf("healthy");
    const clusterClass = named(objects, "ClusterClass");

    named(objects, "Cluster").spec.topology.classRef.namespace = CLASSES;
    clusterClass.metadata.namespace = CLASSES;
    return { objects, tree: () => treeOf(objects, HEALTHY, { classNamespace: CLASSES, ...options }) };
  }

  it("is read in the namespace that the reference of the Cluster names, its row named with it", () => {
    const tree = elsewhere().tree();

    expect(treeOutline(tree).map((row) => row.text)).toContain("ClusterClass freelens-capi-classes/quick-start");
    expect(nodeOf<ObjectNode>(tree, `cluster.x-k8s.io/ClusterClass/${CLASSES}/quick-start`).namespace).toBe(CLASSES);
  });

  it("is not read when the read of its namespace is refused, in the words of P12 for that namespace", () => {
    const tree = elsewhere({ failures: { "cluster.x-k8s.io/ClusterClass": [REFUSED, REFUSED] } }).tree();
    const node = nodeOf<ReferenceNode>(tree, `cluster.x-k8s.io/ClusterClass/${CLASSES}/quick-start`);

    expect(text(node)).toBe("ClusterClass freelens-capi-classes/quick-start [not read]");
    expect(node.read.state === "pending" ? undefined : unreadWords(node.read)).toBe(
      "Not read. Its kind could not be read in the namespace freelens-capi-classes, which the class reference of the Cluster names.",
    );
    expect(treeOutline(tree).at(-1)?.text).toBe("ClusterClasses [not read]");
  });

  it("gives the root the gates of the class read elsewhere, which the root read without that class leaves out and notes", () => {
    const { objects, tree } = elsewhere();
    const cluster = named(objects, "Cluster");

    named(objects, "ClusterClass").spec.availabilityGates = [{ conditionType: "ExampleGate" }];
    cluster.status.conditions.push({
      type: "ExampleGate",
      status: "False",
      reason: "NotYet",
      message: "",
      lastTransitionTime: "2025-12-31T23:59:44Z",
    });

    const withClass = tree();
    const source = treeSourceOf(objects, { classNamespace: CLASSES });
    const index = indexTree(source.clusters, source.objects);
    const read = evaluateTree(withClass, index, CAPTURE, new StatusMemo()).get(withClass.root.id)?.status;
    // The details read the namespace of the Cluster alone: the class is not read.
    const detailsSource = treeSourceOf(objects, { namespaces: [HEALTHY] });
    const detailsIndex = indexTree(detailsSource.clusters, detailsSource.objects);
    const details = buildTree(detailsIndex, HEALTHY, HEALTHY);
    const without =
      details.state === "found"
        ? evaluateTree(details.tree, detailsIndex, CAPTURE, new StatusMemo()).get(details.tree.root.id)?.status
        : undefined;

    expect(read?.health.health).toBe("Healthy");
    expect(without?.health.health).toBe("Degraded");
    expect(without?.notes).toContainEqual({ code: "input-not-given", input: "clusterClass" });
  });

  it("a ClusterResourceSet whose selector a deleting Cluster no longer meets is placed by the binding of the Cluster alone", () => {
    const objects = setOf("deleting");
    const binding = structuredClone(named(setOf("healthy"), "ClusterResourceSetBinding"));

    binding.metadata.name = "freelens-capi-deleting";
    binding.metadata.namespace = "freelens-capi-deleting";
    binding.spec.clusterName = "freelens-capi-deleting";

    const tree = treeOf([...objects, binding], "freelens-capi-deleting");

    expect(under(treeOutline(tree), "Add-ons")).toEqual([
      "ClusterResourceSet cni-kindnet",
      "  ConfigMap cni-kindnet [applied]",
      "ClusterResourceSetBinding freelens-capi-deleting",
    ]);
    expect(nodeOf<ObjectNode>(tree, "addons.cluster.x-k8s.io/ClusterResourceSet/cni-kindnet").placement).toEqual({
      by: "binding",
    });
  });

  it("two Clusters of one namespace each have their own objects alone", () => {
    const healthy = setOf("healthy");
    const rolling = setOf("rolling-out").filter(
      (object) => !healthy.some((each) => each.kind === object.kind && each.metadata.name === object.metadata.name),
    );

    for (const object of rolling) object.metadata.namespace = HEALTHY;

    const objects = [...healthy, ...rolling];

    expect(treeOutline(treeOf(objects, HEALTHY))).toEqual(outlineRows(EXPECTED_TREES.healthy));
    expect(treeOutline(treeOf(objects, "freelens-capi-rolling-out", {}, HEALTHY))).toEqual(
      outlineRows(EXPECTED_TREES["rolling-out"]),
    );
  });
});

describe("a node that cannot be read (P12)", () => {
  const DEV_CLUSTER = "infrastructure.cluster.x-k8s.io/DevCluster";
  const infrastructure = "infrastructure.cluster.x-k8s.io/DevCluster/freelens-capi-healthy-8fgcf";
  const refused: ReadFailure = {
    refused: true,
    message: "customresourcedefinitions.apiextensions.k8s.io is forbidden",
  };

  it.each([
    [
      "a definition refused",
      {
        resolutions: {
          [DEV_CLUSTER]: {
            state: "unresolved",
            reference: { apiGroup: "", kind: "", name: "" },
            reason: "definition-refused",
            failure: refused,
          },
        },
      },
      "Not read. Its definition could not be read: reading it takes get on customresourcedefinitions of apiextensions.k8s.io, for that definition.",
    ],
    [
      "a definition with no contract label",
      {
        resolutions: {
          [DEV_CLUSTER]: {
            state: "unresolved",
            reference: { apiGroup: "", kind: "", name: "" },
            reason: "no-known-version",
            failure: undefined,
          },
        },
      },
      "Not read. Its definition names no version of the contract that this extension knows.",
    ],
    [
      "a kind not served",
      {
        resolutions: {
          [DEV_CLUSTER]: {
            state: "unresolved",
            reference: { apiGroup: "", kind: "", name: "" },
            reason: "not-served",
            failure: undefined,
          },
        },
      },
      "Not read. This cluster serves no such kind.",
    ],
    [
      "a version not served",
      { notServed: [DEV_CLUSTER] },
      "Not read. This cluster does not serve this kind at the version that the contract label of its definition names.",
    ],
    [
      "a kind held back",
      { failures: { [DEV_CLUSTER]: [REFUSED] } },
      "Not read. Its kind could not be read in the namespace of the Cluster.",
    ],
  ] as const)("says Not read. and its reason for %s", (_, options, words) => {
    const node = nodeOf<ReferenceNode>(stateTree("healthy", options as TreeSourceOptions), infrastructure);

    expect(node.form).toBe("reference");
    expect(node.read.state === "pending" ? "pending" : unreadWords(node.read)).toBe(words);
  });

  it("says the reason alone for an object that its namespace, which was read, does not hold", () => {
    const objects = setOf("healthy").filter((object) => object.kind !== "DevCluster");
    const node = nodeOf<ReferenceNode>(treeOf(objects, HEALTHY), infrastructure);

    expect(node.read.state === "pending" ? "pending" : unreadWords(node.read)).toBe(
      "No such object is in the namespace of the Cluster.",
    );
  });

  it("the definition of the DevMachines refused: the rows that the Machines make of them, and the node of the kind, which says that its objects are not shown", () => {
    const tree = stateTree("healthy", {
      resolutions: {
        "infrastructure.cluster.x-k8s.io/DevMachine": {
          state: "unresolved",
          reference: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevMachine", name: "" },
          reason: "definition-refused",
          failure: refused,
        },
      },
    });
    const rows = treeOutline(tree);
    const kind = nodeOf<KindNode>(tree, "kind:infrastructure.cluster.x-k8s.io/DevMachine");

    expect(rows.filter((row) => row.text.startsWith("DevMachine freelens-")).map((row) => row.text)).toEqual([
      "DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine) [not read]",
      "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine) [not read]",
      "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine) [not read]",
    ]);
    expect(rows.at(-1)).toEqual({ depth: 1, text: "DevMachine objects [not read]" });
    expect(kindWords(kind)).toBe(
      "Not read. Its definition could not be read: reading it takes get on customresourcedefinitions of apiextensions.k8s.io, for that definition. Its objects are not shown, since they are never read.",
    );
  });

  it("the Machines refused: their node, with the rows of the Machines that own the KubeadmConfigs under it, and no DevMachine", () => {
    const tree = stateTree("healthy", { failures: { "cluster.x-k8s.io/Machine": [REFUSED] } });
    const rows = treeOutline(tree);

    expect(under(rows, "Machines [not read]")).toEqual([
      "Machine freelens-capi-healthy-d2lgq-zqlcx [not read]",
      "  KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx",
      "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [not read]",
      "  KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 [not read]",
      "  KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
    ]);
    expect(rows.some((row) => row.text.startsWith("DevMachine "))).toBe(false);
    expect(kindWords(nodeOf<KindNode>(tree, "kind:cluster.x-k8s.io/Machine"))).toBe(
      "Not read. Its kind could not be read in the namespace of the Cluster. The objects that only the Machines name are not read either, since the tree learns their kinds from them.",
    );

    const config = nodeOf<ObjectNode>(
      tree,
      "bootstrap.cluster.x-k8s.io/KubeadmConfig/freelens-capi-healthy-d2lgq-zqlcx",
    );

    expect(config.placement).toMatchObject({
      by: "reason",
      reason: { code: "owner-not-read", owner: { kind: "Machine", name: "freelens-capi-healthy-d2lgq-zqlcx" } },
    });
  });

  it("the KubeadmControlPlanes refused: the row of the control plane from the reference of the Cluster holds its Machine and what it made before its Machine, and the node of the kind holds none", () => {
    const objects = setOf("healthy");
    const early = structuredClone(named(objects, "KubeadmConfig", "freelens-capi-healthy-d2lgq-zqlcx"));

    early.metadata.name = "freelens-capi-healthy-d2lgq-early";
    early.metadata.ownerReferences = [
      {
        apiVersion: "controlplane.cluster.x-k8s.io/v1beta2",
        kind: "KubeadmControlPlane",
        name: "freelens-capi-healthy-d2lgq",
      },
    ];

    const tree = treeOf([...objects, early], HEALTHY, {
      failures: { "controlplane.cluster.x-k8s.io/KubeadmControlPlane": [REFUSED] },
    });
    const rows = treeOutline(tree);

    expect(rows[2]).toEqual({ depth: 1, text: "KubeadmControlPlane freelens-capi-healthy-d2lgq [not read]" });
    expect(under(rows, "KubeadmControlPlane freelens-capi-healthy-d2lgq [not read]")).toEqual([
      "Machine freelens-capi-healthy-d2lgq-zqlcx",
      "  DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine)",
      "  KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx",
      "KubeadmConfig freelens-capi-healthy-d2lgq-early",
    ]);
    expect(under(rows, "KubeadmControlPlanes [not read]")).toEqual([]);
    // The template of its Machines, which no object read names now, sits under Other objects, with the kind that can
    // name it and could not be read.
    expect(
      nodeOf<ObjectNode>(tree, "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-rclml")
        .placement,
    ).toEqual({ by: "reason", reason: { code: "owned-by-cluster", namers: ["KubeadmControlPlanes"] } });
  });

  it("the KubeadmConfigs refused: their rows under their Machines, and the node of their kind with no row, which says its reason alone", () => {
    const tree = stateTree("healthy", { failures: { "bootstrap.cluster.x-k8s.io/KubeadmConfig": [REFUSED] } });
    const rows = treeOutline(tree);

    expect(rows.filter((row) => row.text.startsWith("KubeadmConfig ")).map((row) => row.text)).toEqual([
      "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx [not read]",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [not read]",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 [not read]",
    ]);
    expect(under(rows, "KubeadmConfigs [not read]")).toEqual([]);
    expect(kindWords(nodeOf<KindNode>(tree, "kind:bootstrap.cluster.x-k8s.io/KubeadmConfig"))).toBe(
      "Not read. Its kind could not be read in the namespace of the Cluster.",
    );
  });

  it("the ClusterResourceSetBindings refused: the node of their kind, and the entry of cni-kindnet not read, never in no binding", () => {
    const tree = stateTree("healthy", { failures: { "addons.cluster.x-k8s.io/ClusterResourceSetBinding": [REFUSED] } });
    const rows = treeOutline(tree);

    expect(under(rows, "Add-ons")).toEqual(["ClusterResourceSet cni-kindnet", "  ConfigMap cni-kindnet [not read]"]);
    expect(rows.at(-1)?.text).toBe("ClusterResourceSetBindings [not read]");
  });

  it("the MachineSets refused: the Machines under the rows of their MachineSets, under the node of the kind, and a template that an older MachineSet alone could name under Other objects", () => {
    const objects = setOf("healthy");
    const older = structuredClone(named(objects, "DevMachineTemplate", "freelens-capi-healthy-md-0-xp9c7"));

    older.metadata.name = "freelens-capi-healthy-md-0-older";

    const tree = treeOf([...objects, older], HEALTHY, { failures: { "cluster.x-k8s.io/MachineSet": [REFUSED] } });
    const rows = treeOutline(tree);

    expect(under(rows, "MachineSets [not read]")).toEqual([
      "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb [not read]",
      "  Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "    DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)",
      "    KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "  Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
      "    DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine)",
      "    KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
    ]);
    expect(
      nodeOf<ObjectNode>(tree, "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-healthy-md-0-older")
        .placement,
    ).toEqual({ by: "reason", reason: { code: "owned-by-cluster", namers: ["MachineSets"] } });
  });

  it("a kind still loading has its nodes pending, never Unknown, and no node of its kind", () => {
    const tree = stateTree("healthy", { pending: ["bootstrap.cluster.x-k8s.io/KubeadmConfig"] });
    const rows = treeOutline(tree);

    expect(rows.filter((row) => row.text.startsWith("KubeadmConfig ")).map((row) => row.text)).toEqual([
      "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx [pending]",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [pending]",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 [pending]",
    ]);
    expect(rows.some((row) => row.text === "KubeadmConfigs [not read]")).toBe(false);
  });

  it("the Machines still loading: the statuses that take them pending, and what they own waiting, never under Other objects", () => {
    const source = treeSourceOf(setOf("healthy"), { pending: ["cluster.x-k8s.io/Machine"] });
    const index = indexTree(source.clusters, source.objects);
    const tree = (buildTree(index, HEALTHY, HEALTHY) as { tree: ClusterTree }).tree;
    const statuses = evaluateTree(tree, index, CAPTURE, new StatusMemo());

    for (const id of [
      tree.root.id,
      "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
      "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
      "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
      "cluster.x-k8s.io/MachineHealthCheck/freelens-capi-healthy-md-0-m9x7h",
    ]) {
      expect(statuses.get(id)?.pending, id).toBe(true);
    }
    expect(treeOutline(tree).filter((row) => /^(Other objects|KubeadmConfig |Machines)/.test(row.text))).toEqual([]);
  });
});

describe("the status of each node (P16; SPEC-0003, What it takes and returns)", () => {
  const objects = setOf("healthy");
  const source = treeSourceOf(objects);
  const index = indexTree(source.clusters, source.objects);
  const tree = (buildTree(index, HEALTHY, HEALTHY) as { tree: ClusterTree }).tree;
  const statuses = evaluateTree(tree, index, CAPTURE, new StatusMemo());
  const cluster = named(objects, "Cluster");
  const checks = objects.filter((object) => object.kind === "MachineHealthCheck");
  const machines = (prefix: string) =>
    objects.filter((object) => object.kind === "Machine" && object.metadata.name.startsWith(prefix));
  const statusAt = (id: string) => statuses.get(id)?.status;
  const expected = (object: Writable, context: Omit<StatusContext, "now">) =>
    statusOf(object, { now: CAPTURE, ...context });

  it.each([
    [
      "a MachineSet: its Machines, its Cluster and the MachineHealthChecks",
      "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb",
      () => ({ cluster, healthChecks: checks, machines: machines("freelens-capi-healthy-md-0-m9x7h-m5gtb-") }),
    ],
    [
      "a MachineDeployment: the Machines of its MachineSets",
      "cluster.x-k8s.io/MachineDeployment/freelens-capi-healthy-md-0-m9x7h",
      () => ({ cluster, healthChecks: checks, machines: machines("freelens-capi-healthy-md-0-m9x7h-") }),
    ],
    [
      "a KubeadmControlPlane: its Machines and the role, the contract and the provider of its reference",
      "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-healthy-d2lgq",
      () => ({
        cluster,
        healthChecks: checks,
        machines: machines("freelens-capi-healthy-d2lgq-"),
        role: "control-plane",
        contract: "v1beta2",
        provider: "control-plane-kubeadm",
      }),
    ],
    [
      "a KubeadmConfig: the Machine that owns it",
      "bootstrap.cluster.x-k8s.io/KubeadmConfig/freelens-capi-healthy-d2lgq-zqlcx",
      () => ({ cluster, healthChecks: checks, machines: machines("freelens-capi-healthy-d2lgq-zqlcx") }),
    ],
    [
      "an infrastructure machine: its Machine, its role, its contract and its provider",
      "infrastructure.cluster.x-k8s.io/DevMachine/freelens-capi-healthy-d2lgq-zqlcx",
      () => ({
        cluster,
        healthChecks: checks,
        machines: machines("freelens-capi-healthy-d2lgq-zqlcx"),
        role: "infrastructure-machine",
        contract: "v1beta2",
        provider: "infrastructure-docker",
      }),
    ],
    [
      "a ClusterResourceSet: the bindings of the namespace with their Clusters, and no Cluster of its own",
      "addons.cluster.x-k8s.io/ClusterResourceSet/cni-kindnet",
      () => ({
        healthChecks: checks,
        bindings: [{ binding: named(objects, "ClusterResourceSetBinding") as never, cluster: cluster as never }],
      }),
    ],
    [
      "a MachineHealthCheck: the Machines that its targets name",
      "cluster.x-k8s.io/MachineHealthCheck/freelens-capi-healthy-md-0-m9x7h",
      () => ({ cluster, healthChecks: checks, machines: machines("freelens-capi-healthy-md-0-m9x7h-") }),
    ],
  ] as const)("is that of the model for %s", (_, id, context) => {
    // The context that the tree gives, input by input, and the result of the model with it.
    expect(statuses.get(id)?.context).toEqual({ now: CAPTURE, ...context() });
    expect(statusAt(id)).toEqual(expected(named(objects, id.split("/")[1], id.split("/")[2]), context() as never));
  });

  it("is that of the model for the Cluster, with the context that its row and its details give it", () => {
    const details = clusterContextOf(index.context, cluster as never, CAPTURE, new StatusMemo());

    expect(statusAt(tree.root.id)).toEqual(statusOf(cluster, details.context));
    expect(statuses.get(tree.root.id)?.key).toBe(details.key);
    expect(statuses.get(tree.root.id)?.pending).toBe(false);
  });

  it("is kept under a key that changes with the version of an object of its context, and with nothing else", () => {
    const set = "cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb";
    const changed = structuredClone(objects);
    const machine = named(changed, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");

    machine.metadata.uid = "uid-1";
    machine.metadata.resourceVersion = "7";

    const after = treeSourceOf(changed);
    const afterIndex = indexTree(after.clusters, after.objects);
    const afterTree = (buildTree(afterIndex, HEALTHY, HEALTHY) as { tree: ClusterTree }).tree;
    const afterStatuses = evaluateTree(afterTree, afterIndex, CAPTURE, new StatusMemo());

    expect(afterStatuses.get(set)?.key).not.toBe(statuses.get(set)?.key);
    expect(afterStatuses.get(set)?.key).toContain("uid-1@7");

    // A label that changes with no new version changes no key.
    const relabelled = structuredClone(objects);

    (
      named(relabelled, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg").metadata.labels as Record<
        string,
        string
      >
    ).extra = "x";

    const same = treeSourceOf(relabelled);
    const sameIndex = indexTree(same.clusters, same.objects);
    const sameTree = (buildTree(sameIndex, HEALTHY, HEALTHY) as { tree: ClusterTree }).tree;

    expect(evaluateTree(sameTree, sameIndex, CAPTURE, new StatusMemo()).get(set)?.key).toBe(statuses.get(set)?.key);
  });

  it("evaluates again only the objects whose context changed", () => {
    const memo = new StatusMemo();

    evaluateTree(tree, index, CAPTURE, memo);

    const first = memo.computed;

    evaluateTree(tree, index, CAPTURE + 1000, memo);
    expect(memo.computed).toBe(first);
  });
});

describe("the indexes and the tree, built once for each change of what they read (P16)", () => {
  it("are built again when the version of an object changes, and for nothing else", () => {
    const builds = new TreeBuilds();
    const objects = setOf("healthy");
    const source = treeSourceOf(objects);

    builds.treeOf(source.clusters, source.objects, HEALTHY, HEALTHY);
    builds.treeOf(source.clusters, source.objects, HEALTHY, HEALTHY);
    builds.treeOf(source.clusters, { ...source.objects }, HEALTHY, HEALTHY);
    expect(builds.built).toBe(1);

    const changed = structuredClone(objects);

    named(changed, "Machine", "freelens-capi-healthy-d2lgq-zqlcx").metadata.resourceVersion = "9";

    const next = treeSourceOf(changed);

    builds.treeOf(next.clusters, { ...next.objects, reads: source.objects.reads }, HEALTHY, HEALTHY);
    expect(builds.built).toBe(2);
    builds.treeOf(next.clusters, { ...next.objects, reads: source.objects.reads }, HEALTHY, HEALTHY);
    expect(builds.built).toBe(2);
    expect(treeKeyOf("cluster.x-k8s.io/Machine")).toBe("/apis/cluster.x-k8s.io/v1beta2/machines");
  });
});
