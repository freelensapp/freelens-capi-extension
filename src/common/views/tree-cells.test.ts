import { describe, expect, it } from "vitest";
import { TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet } from "../../../test/fixture-sets";
import { outlineText, resolved, treeSourceOf } from "../../../test/tree-sources";
import { buildTree, evaluateTree, indexTree } from "./cluster-tree";
import { poolsWithoutMachinesOf, StatusMemo } from "./context";
import { treeNotices } from "./read-state";
import { NOT_APPLICABLE, placeReasonWords, searchWordsOf, TREE_COLUMNS, treeCellsOf } from "./tree-cells";
import { countsOf, rowsOf } from "./tree-rows";
import { ROLE_WORDS } from "./words";

import type { TreeSourceOptions } from "../../../test/tree-sources";
import type { KubeObjectData, ProviderRole } from "../status/index";
import type { ClusterTree, NodeStatus, TreeNode } from "./cluster-tree";
import type { ReadFailure } from "./read-state";
import type { ResolvedReference } from "./references";
import type { TreeCells } from "./tree-cells";
import type { NodeCounts } from "./tree-rows";

// The cases of SPEC-0005, "Tests", "Unit", `tree-cells.test.ts` (P9, P10, P12): each column for each kind of node; each
// form of P10, a MachinePool with no Machine at 0 replicas and an IPAddressClaim that writes `Ready` among them; N/A
// with its tooltip where a column does not apply; "Not read" and "Not found" in the cells of state of a node that
// cannot be read, never N/A; the role of each kind of a provider; the counts of a virtual node alone; the name of an
// IPAddress at seven levels; the cells of the node of a kind that cannot be read; the entries of a binding; and the
// note of the MachinePools of unknown health. A value that the fixtures do not hold is written by the case into a copy
// of a fixture, which the case says (SPEC-0003, "Tests").

// An object of the fixtures, which a case changes.
interface Writable {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    ownerReferences?: { apiVersion: string; kind: string; name: string; controller?: boolean }[];
  };
  spec: any;
  status?: any;
}

interface View {
  readonly tree: ClusterTree;
  readonly statuses: ReadonlyMap<string, NodeStatus>;
  readonly counts: ReadonlyMap<string, NodeCounts>;
  readonly memo: StatusMemo;
}

const HEALTHY = "freelens-capi-healthy";
const REFUSED: ReadFailure = { refused: true, message: 'kubeadmconfigs is forbidden in "freelens-capi-healthy"' };

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

  if (outcome.state !== "found") throw new Error(`No tree of ${name}: ${outcome.state}`);

  const memo = new StatusMemo();
  const statuses = evaluateTree(outcome.tree, index, CAPTURE, memo);

  return { tree: outcome.tree, statuses, counts: countsOf(outcome.tree, statuses), memo };
}

function stateView(state: string, options: TreeSourceOptions = {}): View {
  return viewOf(setOf(state), TREE_CLUSTERS[state], options);
}

// The cells of the row of a node, by the text of its outline, with every node expanded, as the page gives them their
// inputs.
function cellsOf(view: View, text: string): TreeCells {
  const rows = rowsOf(view.tree, new Set(view.tree.nodes.keys()));
  const found = rows.filter((row) => outlineText(row.node) === text);

  if (found.length !== 1) throw new Error(`${found.length} rows ${text}`);

  const [row] = found;
  const status = view.statuses.get(row.node.id);
  const conditions =
    status === undefined || row.node.form !== "object"
      ? undefined
      : view.memo.conditions(row.node.object, status.context, status.key);

  return treeCellsOf(view.tree, row, {
    status,
    counts: view.counts.get(row.node.id),
    conditions,
    poolsWithoutMachines: poolsWithoutMachinesOf(view.statuses.get(view.tree.root.id)?.context),
  });
}

// The words of a cell of state: its marks, its words, or the spinner.
function activityText(cells: TreeCells): string {
  const { activity } = cells;

  if (activity.form === "pending") return "(spinner)";
  if (activity.form === "words") return activity.words.text;
  return activity.cell.marks.map((mark) => `${mark.word}${mark.state === undefined ? "" : ` ${mark.state}`}`).join(" ");
}

function conditionText(cells: TreeCells): string {
  const { own, counts } = cells.condition;
  const marks =
    own === undefined
      ? []
      : own.form === "pending"
        ? ["(spinner)"]
        : own.form === "words"
          ? [own.words.text]
          : [own.cell.mark?.word ?? "", ...(own.cell.stale.length > 0 ? ["stale"] : [])];

  return [...marks, ...(counts === undefined ? [] : [counts.form === "pending" ? "(spinner)" : counts.text])].join(
    " | ",
  );
}

function statusText(cells: TreeCells): string {
  return cells.status.form === "pending" ? "(spinner)" : cells.status.words.text;
}

function tooltipOf(lines: readonly { readonly text: string }[]): string[] {
  return lines.map((line) => line.text);
}

// A row as one line of its cells, as the table shows it.
function rowText(cells: TreeCells): string {
  return [
    `${cells.name.text}${cells.name.role === undefined ? "" : ` (${cells.name.role})`}`,
    cells.replicas.text,
    cells.version.text,
    activityText(cells),
    conditionText(cells),
    statusText(cells),
    cells.age === undefined ? (cells.ageNotApplicable?.text ?? "") : "age",
  ].join(" || ");
}

describe("the columns of the tree (P9)", () => {
  it("are seven, after the grammar of the list of SPEC-0004", () => {
    expect(TREE_COLUMNS).toEqual(["name", "replicas", "version", "activity", "condition", "status", "age"]);
  });
});

describe("each column for each kind of node (P9, P10, P11)", () => {
  const view = stateView("healthy");

  it("the Cluster: its version as the list shows it, its activities, its health and the counts, and Available", () => {
    const cells = cellsOf(view, `Cluster ${HEALTHY}`);

    expect(rowText(cells)).toBe(
      `Cluster ${HEALTHY} || N/A || v1.37.0 || Idle || Healthy | 21 objects: 17 Healthy, 4 with no health || Available || age`,
    );
    expect(tooltipOf(cells.replicas.tooltip)).toEqual([NOT_APPLICABLE.replicas]);
    expect(tooltipOf(cells.version.tooltip)).toEqual([
      "Topology: v1.37.0",
      "Control plane: v1.37.0: 1 Machine",
      "Workers: v1.37.0: 2 Machines",
    ]);
    expect(cells.name).toMatchObject({ depth: 0, expandable: true, opens: true, role: undefined });
  });

  it("a control plane: the available Machines of the desired, by its contract, every counter in the tooltip, and its spec.version", () => {
    const cells = cellsOf(view, "KubeadmControlPlane freelens-capi-healthy-d2lgq");

    expect(rowText(cells)).toBe(
      "KubeadmControlPlane freelens-capi-healthy-d2lgq || 1/1 || v1.37.0 || Idle || Healthy | 4 objects: 3 Healthy, 1 with no health || Available || age",
    );
    expect(tooltipOf(cells.replicas.tooltip)).toEqual([
      "Desired: 1 Machine",
      "Current: 1 Machine",
      "Ready: 1 Machine",
      "Available: 1 Machine",
      "Up to date: 1 Machine",
    ]);
  });

  it("a MachineDeployment and a MachineSet: status.availableReplicas of spec.replicas, and spec.template.spec.version", () => {
    expect(rowText(cellsOf(view, "MachineDeployment freelens-capi-healthy-md-0-m9x7h"))).toBe(
      "MachineDeployment freelens-capi-healthy-md-0-m9x7h || 2/2 || v1.37.0 || Idle || Healthy | 9 objects: 7 Healthy, 2 with no health || Available || age",
    );
    expect(rowText(cellsOf(view, "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb"))).toBe(
      "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb || 2/2 || v1.37.0 || Idle || Healthy | 6 objects: 6 Healthy || 2 of 2 Machines available || age",
    );
  });

  it("a Machine: one desired, one available when its Available is True, and its spec.version", () => {
    const cells = cellsOf(view, "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");

    expect(rowText(cells)).toBe(
      "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg || 1/1 || v1.37.0 || Idle || Healthy | 2 objects: 2 Healthy || Ready || age",
    );
    expect(tooltipOf(cells.replicas.tooltip)).toEqual([
      "Desired: 1 Machine",
      "Available: 1 Machine, from its Available",
    ]);
  });

  it("a Machine whose Available is not True: none available of one desired", () => {
    const provisioning = stateView("provisioning");
    const machine = [...provisioning.tree.nodes.values()].find(
      (node) =>
        node.form === "object" &&
        node.kind === "Machine" &&
        (
          (node.object.status as { conditions?: { type: string; status: string }[] } | undefined)?.conditions ?? []
        ).some((condition) => condition.type === "Available" && condition.status === "False"),
    );
    const cells = cellsOf(provisioning, outlineText(machine as TreeNode));

    expect(cells.replicas.text).toBe("0/1");
    expect(tooltipOf(cells.replicas.tooltip)).toEqual([
      "Desired: 1 Machine",
      "Available: 0 Machines, from its Available",
    ]);
  });

  it("an object of a provider: its role after its name, N/A where its kind keeps no replicas and has no version", () => {
    const cells = cellsOf(view, "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)");

    expect(rowText(cells)).toBe(
      "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine) || N/A || N/A || Idle || Healthy || Ready || age",
    );
    expect(cells.name.depth).toBe(5);
    expect(tooltipOf(cells.name.tooltip)).toEqual([
      "DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg, infrastructure machine",
    ]);
    expect(tooltipOf(cells.version.tooltip)).toEqual([NOT_APPLICABLE.version]);
  });

  it("Workers: the counters and the versions that the Cluster keeps of them, and the counts alone", () => {
    const cells = cellsOf(view, "Workers");

    expect(rowText(cells)).toBe(
      "Workers || 2/2 || v1.37.0 || N/A || 10 objects: 8 Healthy, 2 with no health || N/A || N/A",
    );
    expect(cells.name).toMatchObject({ opens: false, role: undefined, expandable: true });
    expect(tooltipOf(cells.version.tooltip)).toEqual(["v1.37.0: 2 Machines"]);
    expect(cells.condition.own).toBeUndefined();
    expect(tooltipOf(cells.replicas.tooltip)).toEqual([
      "Desired: 2 Machines",
      "Current: 2 Machines",
      "Ready: 2 Machines",
      "Available: 2 Machines",
      "Up to date: 2 Machines",
    ]);
    expect(cells.condition.counts).toEqual({
      form: "counts",
      text: "10 objects: 8 Healthy, 2 with no health",
      tooltip: "Under Workers: 10 objects: 8 Healthy, 2 with no health",
    });
  });

  it("a virtual node with no counters of the Cluster: N/A in every column but its name and its counts, with why", () => {
    const cells = cellsOf(view, "Health checks");

    expect(rowText(cells)).toBe("Health checks || N/A || N/A || N/A || 2 objects: 2 Healthy || N/A || N/A");
    for (const cell of [cells.replicas, cells.version, cells.ageNotApplicable]) {
      expect(tooltipOf(cell?.tooltip ?? [])).toEqual([NOT_APPLICABLE.virtual]);
    }
    expect(cells.activity).toEqual({
      form: "words",
      words: { text: "N/A", tooltip: [{ text: NOT_APPLICABLE.virtual, indentation: 0 }] },
    });
  });

  it("a template: a kind with no status, N/A in its cells of state with the tooltip that it has none", () => {
    const cells = cellsOf(view, "DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)");

    expect(rowText(cells)).toBe(
      "DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template) || N/A || N/A || N/A || N/A || N/A || age",
    );
    expect(cells.activity.form === "words" ? tooltipOf(cells.activity.words.tooltip) : []).toEqual([
      NOT_APPLICABLE.status,
    ]);
    expect(cells.status.form === "words" ? tooltipOf(cells.status.words.tooltip) : []).toEqual([NOT_APPLICABLE.status]);
  });

  it("a ClusterResourceSet, the headline of ResourcesApplied, else its reason; its entry, applied, at the instant of lastAppliedTime", () => {
    expect(rowText(cellsOf(view, "ClusterResourceSet cni-kindnet"))).toBe(
      "ClusterResourceSet cni-kindnet || N/A || N/A || Idle || Healthy || Applied || age",
    );

    const entry = cellsOf(view, "ConfigMap cni-kindnet [applied]");

    expect(rowText(entry)).toBe("ConfigMap cni-kindnet || N/A || N/A || N/A || N/A || Applied || N/A");
    expect(entry.name).toMatchObject({ opens: false, expandable: false });
    expect(entry.status).toMatchObject({ form: "words", since: { state: "written" } });
    for (const cell of [entry.replicas, entry.version, entry.ageNotApplicable]) {
      expect(tooltipOf(cell?.tooltip ?? [])).toEqual([NOT_APPLICABLE.entry]);
    }
  });

  it("a MachineHealthCheck: its targets healthy of those expected, with the mark of remediation in the tooltip", () => {
    const rollingOut = stateView("rolling-out");
    const cells = cellsOf(rollingOut, "MachineHealthCheck freelens-capi-rolling-out-md-0-t96dp");

    expect(statusText(cells)).toBe("2 of 3 targets healthy");
    expect(cells.status.form === "words" ? tooltipOf(cells.status.words.tooltip).slice(0, 2) : []).toEqual([
      "2 of 3 targets healthy",
      "Remediation allowed: Yes",
    ]);
  });
});

describe("each form of what the health rests on, in the cell Status (P10)", () => {
  it("a condition: the headline of its message, the whole message in the tooltip", () => {
    const cells = cellsOf(stateView("rolling-out"), "Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n");

    expect(statusText(cells)).toMatch(/^NodeHealthy: Node\.Ready: /);
    expect(cells.status.form === "words" ? cells.status.words.tooltip[0].text : "").toMatch(/^Ready: False, /);
  });

  it("a condition not written yet: N/A, with the tooltip that the object reports none yet", () => {
    const cells = cellsOf(stateView("no-status"), "DevCluster freelens-capi-no-status (infrastructure cluster)");

    expect(statusText(cells)).toBe("N/A");
    expect(cells.status.form === "words" ? tooltipOf(cells.status.words.tooltip) : []).toEqual([
      "It reports no Ready yet.",
    ]);
  });

  it("a MachineSet: its available Machines of its replicas, the message of MachinesReady in the tooltip", () => {
    const cells = cellsOf(stateView("rolling-out"), "MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t");

    expect(statusText(cells)).toBe("0 of 1 Machines available");
    expect(cells.status.form === "words" ? tooltipOf(cells.status.words.tooltip).slice(0, 2) : []).toEqual([
      "0 of 1 Machines available",
      expect.stringMatching(/^MachinesReady: /),
    ]);
  });

  it("a MachinePool with Machines: its available Machines of its replicas", () => {
    const cells = cellsOf(stateView("machine-pools"), "MachinePool freelens-capi-machine-pools-mp-0-s48vb");

    expect(statusText(cells)).toBe("0 of 1 Machines available");
  });

  it("a MachinePool without Machines and with replicas: the note of the model and its deprecated Ready", () => {
    const view = stateView("machine-pool-without-machines");
    const pool = [...view.tree.nodes.values()].find((node) => node.form === "object" && node.kind === "MachinePool");
    const cells = cellsOf(view, outlineText(pool as TreeNode));

    expect(statusText(cells)).toBe(
      "This MachinePool has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.",
    );
    expect(cells.status.form === "words" ? cells.status.words.tooltip[1].text : "").toMatch(/^Ready \(deprecated\): /);
  });

  it("the workers of a Cluster with a MachinePool without Machines: their counters, and that they count the instances of its provider, as the list says it", () => {
    const view = stateView("machine-pool-without-machines");
    const workers = tooltipOf(cellsOf(view, "Workers").replicas.tooltip);

    expect(poolsWithoutMachinesOf(view.statuses.get(view.tree.root.id)?.context)).toBe(1);
    expect(workers.at(-1)).toBe(
      "A MachinePool of this Cluster has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.",
    );
    // A Cluster whose MachinePools have Machines has no such remark.
    expect(tooltipOf(cellsOf(stateView("machine-pools"), "Workers").replicas.tooltip).join(" ")).not.toMatch(
      /has no Machines/,
    );
  });

  it("a MachinePool with no Machine at 0 replicas, which is Healthy, as the case writes it", () => {
    const objects = setOf("machine-pool-without-machines");
    const pool = named(objects, "MachinePool");

    pool.spec.replicas = 0;

    const view = viewOf(objects, TREE_CLUSTERS["machine-pool-without-machines"]);
    const cells = cellsOf(view, `MachinePool ${pool.metadata.name}`);

    expect(conditionText(cells).startsWith("Healthy")).toBe(true);
    expect(statusText(cells)).toBe(`${pool.status.availableReplicas ?? "N/A"} of 0 Machines available`);
  });

  // The claim and the address of no-status, in the namespace of healthy, the claim naming its Cluster (P21).
  function claimed(change: (claim: Writable) => void) {
    const objects = setOf("healthy");
    const [claim, address] = ["IPAddressClaim", "IPAddress"].map((kind) =>
      structuredClone(named(setOf("no-status"), kind)),
    );

    for (const object of [claim, address]) object.metadata.namespace = HEALTHY;
    claim.spec.clusterName = HEALTHY;
    change(claim);
    return viewOf([...objects, claim, address], HEALTHY);
  }

  it("an IPAddressClaim that writes no Ready: the name of the IPAddress of status.addressRef, or N/A with why", () => {
    const none = cellsOf(
      claimed(() => undefined),
      "IPAddressClaim freelens-capi-no-status",
    );
    const addressed = cellsOf(
      claimed((claim) => {
        claim.status = { addressRef: { name: "freelens-capi-no-status" } };
      }),
      "IPAddressClaim freelens-capi-no-status",
    );

    expect(statusText(none)).toBe("N/A");
    expect(none.status.form === "words" ? tooltipOf(none.status.words.tooltip) : []).toEqual([
      "No address is written yet.",
    ]);
    expect(statusText(addressed)).toBe("freelens-capi-no-status");
  });

  it("an IPAddressClaim that writes Ready, as the case writes it: its condition", () => {
    const cells = cellsOf(
      claimed((claim) => {
        claim.status = {
          conditions: [
            {
              type: "Ready",
              status: "False",
              reason: "WaitingForAddress",
              message: "The pool has no address left",
              lastTransitionTime: "2025-12-31T23:59:00Z",
            },
          ],
        };
      }),
      "IPAddressClaim freelens-capi-no-status",
    );

    expect(statusText(cells)).toBe("The pool has no address left");
    expect(conditionText(cells)).toBe("Unhealthy | 1 object: 1 with no health");
  });

  it("nothing, for a field of the wrong type: N/A, with the note of the model in the tooltip", () => {
    const objects = setOf("healthy");

    named(objects, "ClusterResourceSet").spec.resources = "not a list";

    const cells = cellsOf(viewOf(objects, HEALTHY), "ClusterResourceSet cni-kindnet");

    expect(statusText(cells)).toBe("N/A");
    expect(cells.status.form === "words" ? cells.status.words.tooltip[0].text : "").toBe(
      "The field spec.resources holds a value of the wrong type, read as unknown.",
    );
  });

  it("an object that is deleting: N/A in its cells of health, with the tooltip that it is deleting", () => {
    const cells = cellsOf(stateView("deleting"), "Machine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw");

    expect(activityText(cells)).toMatch(/^Deleting/);
    expect(statusText(cells)).toBe("N/A");
    expect(conditionText(cells)).toBe("N/A | 2 objects: 2 Healthy");
    expect(cells.status.form === "words" ? tooltipOf(cells.status.words.tooltip) : []).toEqual([
      NOT_APPLICABLE.deleting,
    ]);
  });
});

describe("a node that cannot be read (P12)", () => {
  it("says Not found in its cells of state, never N/A, the reason in its cell Status, and N/A with why elsewhere", () => {
    const cells = cellsOf(
      stateView("deleting"),
      "DevMachineTemplate freelens-capi-deleting-md-0-gq8t7 (template) [not found]",
    );
    const why = "No such object is in the namespace of the Cluster.";

    expect(rowText(cells)).toBe(
      `DevMachineTemplate freelens-capi-deleting-md-0-gq8t7 (template) || N/A || N/A || Not found || Not found || ${why} || N/A`,
    );
    expect(cells.name.opens).toBe(true);
    for (const cell of [cells.replicas, cells.version, cells.ageNotApplicable]) {
      expect(tooltipOf(cell?.tooltip ?? [])).toEqual([why]);
    }
  });

  it("says Not read, with Not read. and the reason whole and the message of each answer in the tooltip", () => {
    const view = stateView("healthy", { failures: { "bootstrap.cluster.x-k8s.io/KubeadmConfig": [REFUSED] } });
    const cells = cellsOf(view, "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [not read]");
    const why = "Not read. Its kind could not be read in the namespace of the Cluster.";

    expect(activityText(cells)).toBe("Not read");
    expect(conditionText(cells)).toBe("Not read");
    expect(statusText(cells)).toBe(why);
    for (const tooltip of [
      cells.activity.form === "words" ? cells.activity.words.tooltip : [],
      cells.status.form === "words" ? cells.status.words.tooltip : [],
    ]) {
      expect(tooltipOf(tooltip)).toEqual([why, REFUSED.message]);
    }
  });

  it("shows the spinner in the place of its marks while its kind loads, never Unknown", () => {
    const view = stateView("healthy", { pending: ["bootstrap.cluster.x-k8s.io/KubeadmConfig"] });
    const cells = cellsOf(view, "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [pending]");

    expect([activityText(cells), conditionText(cells), statusText(cells)]).toEqual([
      "(spinner)",
      "(spinner)",
      "(spinner)",
    ]);
  });

  it("the node of the Machines refused: Not read, its reason, then the words of the objects that only they name, the whole text in its tooltip with the notice", () => {
    const failures = { "cluster.x-k8s.io/Machine": [REFUSED] };
    const view = stateView("healthy", { failures });
    const node = view.tree.nodes.get("kind:cluster.x-k8s.io/Machine") as TreeNode;
    const words =
      "Not read. Its kind could not be read in the namespace of the Cluster. The objects that only the Machines name are not read either, since the tree learns their kinds from them.";
    const source = treeSourceOf(setOf("healthy") as never, { failures });
    const [notice] = treeNotices(source.objects.reads, [
      {
        key: "/apis/cluster.x-k8s.io/v1beta2/machines",
        kind: "Machine",
        noun: "Machines",
        resource: "machines",
        group: "cluster.x-k8s.io",
        feeds: "machines",
      },
    ]);
    const rows = rowsOf(view.tree, new Set(view.tree.nodes.keys()));
    const row = rows.find((each) => each.node === node);
    const cells = treeCellsOf(view.tree, row ?? rows[0], {
      status: undefined,
      counts: view.counts.get(node.id),
      notice,
    });

    expect(cells.name).toMatchObject({ text: "Machines", opens: false });
    expect(activityText(cells)).toBe("Not read");
    expect(conditionText(cells)).toBe("Not read | 6 objects: 3 not read, 3 Healthy");
    expect(statusText(cells)).toBe(words);
    expect(cells.status.form === "words" ? tooltipOf(cells.status.words.tooltip) : []).toEqual([
      words,
      REFUSED.message,
      notice.title,
      ...notice.messages,
      ...notice.lines,
    ]);
  });

  it("the node of the KubeadmConfigs refused: the reason alone, since a KubeadmConfig names no kind of a provider", () => {
    const view = stateView("healthy", { failures: { "bootstrap.cluster.x-k8s.io/KubeadmConfig": [REFUSED] } });
    const cells = cellsOf(view, "KubeadmConfigs [not read]");

    expect(statusText(cells)).toBe("Not read. Its kind could not be read in the namespace of the Cluster.");
  });

  it("the node of the DevMachines whose definition is refused: that its definition could not be read and that its objects are not shown, never the words of the objects that only it names", () => {
    const view = stateView("healthy", {
      resolutions: {
        "infrastructure.cluster.x-k8s.io/DevMachine": {
          state: "unresolved",
          reference: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevMachine", name: "" },
          reason: "definition-refused",
          failure: { refused: true, message: "customresourcedefinitions is forbidden" },
        },
      },
    });
    const cells = cellsOf(view, "DevMachine objects [not read]");

    expect(statusText(cells)).toBe(
      "Not read. Its definition could not be read: reading it takes get on customresourcedefinitions of apiextensions.k8s.io, for that definition. Its objects are not shown, since they are never read.",
    );
    expect(statusText(cells)).not.toMatch(/only the DevMachine objects name/);
  });
});

describe("the role of an object of a provider (P9)", () => {
  it("is said in the eight words of ProviderRole, of which the tree places six", () => {
    expect(Object.keys(ROLE_WORDS).sort()).toEqual(
      (
        [
          "infrastructure-cluster",
          "control-plane",
          "infrastructure-machine",
          "bootstrap-config",
          "infrastructure-machine-pool",
          "ipam-pool",
          "remediation-request",
          "template",
        ] satisfies ProviderRole[]
      ).sort(),
    );

    const pools = stateView("machine-pools");
    const roles = [...pools.tree.nodes.values(), ...stateView("healthy").tree.nodes.values()]
      .filter((node) => node.form === "object" && node.role !== undefined)
      .map((node) => (node.form === "object" ? node.role : undefined));

    expect([...new Set(roles)].sort()).toEqual(
      ["infrastructure-cluster", "infrastructure-machine", "infrastructure-machine-pool", "template"].sort(),
    );
    expect(
      cellsOf(pools, "DevMachinePool freelens-capi-machine-pools-mp-0-6cl2n (infrastructure machine pool)").name.role,
    ).toBe("infrastructure machine pool");
  });

  // The counters of a control plane of a provider, which the contract of its definition names: at `v1beta2`, the
  // available and the up to date replicas; at `v1beta1`, the ready, the updated and the unavailable ones, and no
  // available ones (internal/contract/controlplane.go:212-261).
  const CONTRACT_STATUS: Readonly<Record<string, Record<string, number>>> = {
    v1beta2: { replicas: 3, readyReplicas: 2, availableReplicas: 2, upToDateReplicas: 3 },
    v1beta1: { replicas: 3, readyReplicas: 3, updatedReplicas: 1, unavailableReplicas: 1 },
  };

  // healthy with a control plane of a provider, ExampleControlPlane, at the contract given, with the counters of that
  // contract alone, in the place of its KubeadmControlPlane, and a bootstrap config of a provider for one of its worker
  // Machines, as the case writes them.
  function exampleView(contract: string, status: Record<string, number> = CONTRACT_STATUS[contract]): View {
    const objects = setOf("healthy");
    const cluster = named(objects, "Cluster");
    const controlPlane = named(objects, "KubeadmControlPlane");
    const machine = named(objects, "Machine", "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg");
    const provider: Writable = {
      apiVersion: "controlplane.example.test/v1beta2",
      kind: "ExampleControlPlane",
      metadata: { name: "example", namespace: HEALTHY, labels: { "cluster.x-k8s.io/cluster-name": HEALTHY } },
      spec: { replicas: 3, version: "v1.37.0" },
      status,
    };
    const config: Writable = {
      apiVersion: "bootstrap.example.test/v1beta2",
      kind: "ExampleConfig",
      metadata: { name: "example-config", namespace: HEALTHY, labels: { "cluster.x-k8s.io/cluster-name": HEALTHY } },
      spec: {},
    };

    cluster.spec.controlPlaneRef = {
      apiGroup: "controlplane.example.test",
      kind: "ExampleControlPlane",
      name: "example",
    };
    machine.spec.bootstrap.configRef = {
      apiGroup: "bootstrap.example.test",
      kind: "ExampleConfig",
      name: "example-config",
    };

    return viewOf([...objects.filter((object) => object !== controlPlane), provider, config], HEALTHY, {
      resolutions: {
        "controlplane.example.test/ExampleControlPlane": {
          ...resolved("controlplane.example.test/ExampleControlPlane", "control-plane-example"),
          contract,
        } as ResolvedReference,
        "bootstrap.example.test/ExampleConfig": resolved("bootstrap.example.test/ExampleConfig", "bootstrap-example"),
      },
    });
  }

  it("names a control plane and a bootstrap config of a provider by their roles, as the case writes them", () => {
    const view = exampleView("v1beta2");
    const plane = cellsOf(view, "ExampleControlPlane example (control plane)");

    expect(plane.name.role).toBe("control plane");
    // By the contract of a control plane: its replicas and its version.
    expect([plane.replicas.text, plane.version.text]).toEqual(["2/3", "v1.37.0"]);
    expect(tooltipOf(plane.replicas.tooltip)).toContain("Up to date: 3 Machines");
    expect(cellsOf(view, "ExampleConfig example-config (bootstrap config)").name.role).toBe("bootstrap config");
  });

  it("counts a control plane at the contract v1beta1 by the fields of that contract, its available Machines the desired less the unavailable ones, as the Cluster counts them", () => {
    const plane = cellsOf(exampleView("v1beta1"), "ExampleControlPlane example (control plane)");

    expect(plane.replicas.text).toBe("2/3");
    expect(tooltipOf(plane.replicas.tooltip)).toEqual([
      "Desired: 3 Machines",
      "Current: 3 Machines",
      "Ready: 3 Machines",
      "Available: 2 Machines, the desired less 1 unavailable",
      "Up to date: 1 Machine",
    ]);

    // More unavailable than desired: none available, never fewer.
    const over = cellsOf(
      exampleView("v1beta1", { replicas: 3, readyReplicas: 0, updatedReplicas: 3, unavailableReplicas: 5 }),
      "ExampleControlPlane example (control plane)",
    );

    expect(over.replicas.text).toBe("0/3");

    // No unavailable replicas written yet: the available ones are not known, whatever a field of another contract says.
    const unwritten = cellsOf(
      exampleView("v1beta1", { replicas: 3, availableReplicas: 3 }),
      "ExampleControlPlane example (control plane)",
    );

    expect(unwritten.replicas.text).toBe("N/A/3");
    expect(tooltipOf(unwritten.replicas.tooltip)).toContain("Available: N/A, not written yet");
  });
});

describe("the name of a row (P7, P9)", () => {
  it("of an object under Other objects says why in its tooltip", () => {
    const cells = cellsOf(stateView("no-status"), "MachineSet freelens-capi-no-status-set");

    expect(tooltipOf(cells.name.tooltip)).toEqual(["MachineSet freelens-capi-no-status-set", "It has no owner."]);
  });

  it("says each reason of P7 in its words", () => {
    expect(placeReasonWords({ code: "no-owner" })).toBe("It has no owner.");
    expect(
      placeReasonWords({
        code: "owners-not-in-tree",
        owners: [{ group: "ipam.test", kind: "AddressPool", name: "pool" }],
      }),
    ).toBe("Its owners are not nodes of the tree: AddressPool pool.");
    expect(placeReasonWords({ code: "owned-by-cluster", namers: [] })).toBe(
      "The Cluster owns it, and no object of the tree names it.",
    );
    expect(placeReasonWords({ code: "owned-by-cluster", namers: ["MachineSets", "MachinePools"] })).toBe(
      "The Cluster owns it, and no object of the tree names it; the MachineSets, the MachinePools, which can name it, could not be read.",
    );
    expect(
      placeReasonWords({
        code: "owner-not-read",
        owner: { group: "cluster.x-k8s.io", kind: "Machine", name: "m" },
        unread: { state: "not-read", reason: "kind-not-read", failures: [], namespace: "n", classNamespace: false },
      }),
    ).toBe(
      "Its owner Machine m is of a kind not read. Not read. Its kind could not be read in the namespace of the Cluster.",
    );
  });

  it("of an IPAddress at seven levels, under its claim under the infrastructure machine of a worker Machine: seven steps of indentation", () => {
    const objects = setOf("rolling-out");
    const namespace = TREE_CLUSTERS["rolling-out"];
    const devMachine = named(objects, "DevMachine", "freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n");
    const [claim, address] = ["IPAddressClaim", "IPAddress"].map((kind) =>
      structuredClone(named(setOf("no-status"), kind)),
    );

    for (const object of [claim, address]) object.metadata.namespace = namespace;
    claim.spec.clusterName = namespace;
    claim.metadata.ownerReferences = [
      { apiVersion: devMachine.apiVersion, kind: "DevMachine", name: devMachine.metadata.name, controller: true },
    ];

    const cells = cellsOf(viewOf([...objects, claim, address], namespace), "IPAddress freelens-capi-no-status");

    expect(cells.name).toMatchObject({ depth: 7, text: "IPAddress freelens-capi-no-status", opens: true });
  });
});

describe("the entries of a binding (P10, P12)", () => {
  it("say applied, not applied and in no binding, as the binding records them", () => {
    const objects = setOf("healthy");
    const binding = named(objects, "ClusterResourceSetBinding");
    const set = named(objects, "ClusterResourceSet");

    set.spec.resources = [...set.spec.resources, { kind: "ConfigMap", name: "freelens-capi-unbound" }];
    binding.spec.bindings[0].resources = [
      { ...binding.spec.bindings[0].resources[0], applied: false, lastAppliedTime: undefined },
    ];

    const view = viewOf(objects, HEALTHY);

    expect(statusText(cellsOf(view, "ConfigMap cni-kindnet [not applied]"))).toBe("Not applied");
    expect(statusText(cellsOf(view, "ConfigMap freelens-capi-unbound [in no binding]"))).toBe(
      "In no binding of this Cluster",
    );
  });

  it("say Not read, with the reason of the bindings, when they cannot be read, never in no binding", () => {
    const view = stateView("healthy", {
      failures: { "addons.cluster.x-k8s.io/ClusterResourceSetBinding": [REFUSED] },
    });
    const cells = cellsOf(view, "ConfigMap cni-kindnet [not read]");

    expect([activityText(cells), conditionText(cells)]).toEqual(["Not read", "Not read"]);
    expect(statusText(cells)).toBe("Not read. Its kind could not be read in the namespace of the Cluster.");
    expect(statusText(cells)).not.toMatch(/In no binding/);
  });
});

describe("the counts and the note of the Cluster (P11)", () => {
  it("count the objects under a node, not read and not found among them, in the cell Condition after its marks", () => {
    expect(conditionText(cellsOf(stateView("deleting"), "Workers"))).toBe(
      "7 objects: 2 not found, 2 Healthy, 3 with no health",
    );
  });

  it("show the spinner in the place of the counts while an object under the node still loads", () => {
    const view = stateView("healthy", { pending: ["bootstrap.cluster.x-k8s.io/KubeadmConfig"] });

    expect(cellsOf(view, "Workers").condition.counts).toEqual({ form: "pending" });
  });

  it("hold the note of the MachinePools of unknown health in the cell Condition of the Cluster", () => {
    const cells = cellsOf(stateView("no-status"), "Cluster freelens-capi-no-status");

    expect(cells.condition.own?.form === "health" ? cells.condition.own.cell.poolsUnknown : 0).toBe(1);
  });
});

describe("the words that the search matches (P15)", () => {
  it("join the words of the cells Version and Status to those of the name and the marks, never N/A", () => {
    const view = stateView("healthy");
    const node = view.tree.nodes.get("cluster.x-k8s.io/MachineSet/freelens-capi-healthy-md-0-m9x7h-m5gtb") as TreeNode;
    const words = searchWordsOf(view.tree, node, view.statuses.get(node.id));

    expect(words).toEqual(
      expect.arrayContaining(["MachineSet", "v1.37.0", "2 of 2 Machines available", "Healthy", "Idle"]),
    );
    expect(searchWordsOf(view.tree, view.tree.nodes.get("virtual:workers") as TreeNode, undefined)).toEqual([
      "Workers",
      "v1.37.0",
    ]);
    expect(
      searchWordsOf(view.tree, view.tree.nodes.get("virtual:health-checks") as TreeNode, undefined).includes("N/A"),
    ).toBe(false);
  });
});
