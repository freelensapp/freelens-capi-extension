// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { TREE_CLUSTERS } from "../../../integration/__tests__/tree-expectations";
import { CAPTURE, fixtureSet } from "../../../test/fixture-sets";
import { Common, host, Renderer } from "../../../test/freelens-extensions";
import { APIS, DEFINITIONS, DEV_CLUSTERS, DEV_DEFINITIONS, serve, TREE_APIS } from "../../../test/host-stores";
import { treeSourceOf } from "../../../test/tree-sources";
import { hostObjects, objectsOfStates } from "../../../test/view-sources";
import { buildTree, evaluateTree, indexTree } from "../../common/views/cluster-tree";
import { StatusMemo } from "../../common/views/context";
import { nodeDetailsOf } from "../../common/views/node-details";
import { ClusterTreePage } from "../pages/cluster-tree-page";
import { ObjectDetails } from "./object-details";

import type { Renderer as Extensions } from "@freelensapp/extensions";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { KubeObjectData } from "../../common/status/index";
import type { ClusterTree, NodeStatus, ObjectNode, ReferenceNode } from "../../common/views/cluster-tree";
import type { Fact, NodeDetails } from "../../common/views/node-details";
import type { MessageLinks, ViewHost } from "./cluster-details-v1beta2";

// The cases of SPEC-0005, "Tests", "Unit", `object-details.test.tsx` (P17): the details of each kind of node of the
// trees of the fixtures rendered, each section where the details hold it, every fact in the form that its kind gives
// it, the nodes that they name as buttons that open them, the object of a provider linked to the details of the host;
// and an error thrown in a section, which leaves the other sections and the tree. What the details hold is the case of
// `node-details.test.ts`; these cases render it.

const EXTENSION = new Renderer.LensExtension({
  name: "@freelensapp/capi-extension",
}) as unknown as Extensions.LensExtension;

const HEALTHY = "freelens-capi-healthy";
const WORKER = `${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`;
const MACHINE = `cluster.x-k8s.io/Machine/${WORKER}`;
const LAST_APPLIED = "kubectl.kubernetes.io/last-applied-configuration";

type Writable = Record<string, any>;

interface View {
  readonly tree: ClusterTree;
  readonly statuses: ReadonlyMap<string, NodeStatus>;
  readonly memo: StatusMemo;
}

// The tree of the Cluster of a state, from its objects as the stores of the host hold them, with the change of the case.
function stateView(state: string, change: (objects: Writable[]) => void = () => undefined): View {
  const objects = structuredClone(fixtureSet(state)) as unknown as Writable[];
  const name = TREE_CLUSTERS[state];

  change(objects);

  const held = hostObjects(objects as unknown as KubeObject[]) as unknown as KubeObjectData[];
  const source = treeSourceOf(held, { cluster: { namespace: name, name } });
  const index = indexTree(source.clusters, source.objects);
  const outcome = buildTree(index, name, name);

  if (outcome.state !== "found") throw new Error(`No tree of ${name}`);

  const memo = new StatusMemo();

  return { tree: outcome.tree, statuses: evaluateTree(outcome.tree, index, CAPTURE, memo), memo };
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

interface Rendered {
  readonly openNode: ReturnType<typeof vi.fn<(node: string) => void>>;
  readonly unmount: () => void;
}

function rendered(details: NodeDetails): Rendered {
  const openNode = vi.fn<(node: string) => void>();
  const viewHost: ViewHost = { extension: EXTENSION, openCluster: vi.fn(), openTree: vi.fn() };
  const links: MessageLinks = { target: () => ({ form: "text" }), openCluster: vi.fn(), openNode };
  const { unmount } = render(<ObjectDetails details={details} host={viewHost} links={links} openNode={openNode} />);

  return { openNode, unmount };
}

// The row of the details with a name.
function rowNamed(name: string): HTMLElement {
  const row = [...document.querySelectorAll<HTMLElement>("[data-drawer-item]")].find(
    (item) => item.querySelector("[data-drawer-item-name]")?.textContent === name,
  );

  if (row === undefined) throw new Error(`No row ${name}`);
  return row;
}

// The value of a row of the details, after its name.
function valueOf(testId: string): string {
  return screen.getByTestId(testId).querySelector(".value")?.textContent ?? "";
}

// The words that a fact shows, as its form gives them.
function factWords(fact: Exclude<Fact, { form: "counters" }>): string[] {
  switch (fact.form) {
    case "text":
    case "host":
      return [fact.text];
    case "links":
      return [...fact.links.map((link) => link.text), ...(fact.texts ?? []).map((entry) => entry.text)];
    case "answer":
      return [fact.answer.answer, `(${fact.field})`];
    case "list":
      return [...fact.items];
  }
}

beforeEach(() => {
  host.reset();
  Common.logger.error.mockClear();
  vi.setSystemTime(CAPTURE);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the details of a node (P17)", () => {
  // One case for each state of the fixtures, so that no case renders the details of the hundreds of nodes of every
  // state at once, which came near the default timeout on a loaded machine.
  it.each(Object.keys(TREE_CLUSTERS))(
    "render every node of the tree of %s, each section where its details hold it, every fact in its form, with no error",
    (state) => {
      const view = stateView(state);
      let count = 0;

      for (const node of view.tree.nodes.values()) {
        if (node.form !== "object" && node.form !== "reference") continue;

        const details = detailsOf(view, node.id);
        const { unmount } = rendered(details);
        const where = `${state} ${node.id}`;
        const sections = [...screen.getByTestId("capi-node-details").children].map((section) =>
          section.getAttribute("data-testid"),
        );

        expect(sections, where).toEqual([
          ...(details.metadata === undefined ? [] : ["capi-node-section-metadata"]),
          "capi-node-section-place",
          ...(details.status === undefined && node.form === "object" ? [null] : ["capi-node-section-status"]),
          ...(details.facts.length === 0 ? [] : ["capi-node-section-facts"]),
          ...((details.conditions?.length ?? 0) === 0 ? [] : ["capi-details-section-conditions"]),
        ]);
        expect(valueOf("capi-node-place").toLowerCase(), where).toMatch(
          new RegExp(`^${details.place.role.toLowerCase()}`),
        );
        if (details.status === undefined && details.unread !== undefined) {
          expect(valueOf("capi-node-unread"), where).toMatch(
            new RegExp(`^${details.unread.words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
          );
        }
        if (details.facts.length > 0) {
          const facts = screen.getByTestId("capi-node-section-facts");

          expect(within(facts).getByRole("heading").textContent, where).toBe(node.kind);
          for (const fact of details.facts) {
            if (fact.form === "counters") {
              expect(within(facts).getByTestId("capi-details-counters"), where).toBeDefined();
              continue;
            }

            const text = rowNamed(fact.name).textContent ?? "";

            for (const words of factWords(fact)) expect(text, `${where} ${fact.name}`).toContain(words);
          }
        }
        unmount();
        count++;
      }

      expect(count).toBeGreaterThan(0);
      expect(Common.logger.error).not.toHaveBeenCalled();
    },
  );

  it("cover in those cases more than 200 nodes of objects, read or not, in the trees of the fixtures", () => {
    const nodes = Object.keys(TREE_CLUSTERS).flatMap((state) =>
      [...stateView(state).tree.nodes.values()].filter((node) => node.form === "object" || node.form === "reference"),
    );

    expect(nodes.length).toBeGreaterThan(200);
  });

  it("make the object above a node, an owner that the tree holds and the nodes of a fact buttons that open their nodes", () => {
    const view = stateView("healthy");
    const { openNode } = rendered(detailsOf(view, MACHINE));
    const machineSet = `cluster.x-k8s.io/MachineSet/${HEALTHY}-md-0-m9x7h-m5gtb`;

    expect(valueOf("capi-node-place")).toBe(`Machine of MachineSet ${HEALTHY}-md-0-m9x7h-m5gtb, by its controller`);
    fireEvent.click(within(screen.getByTestId("capi-node-place")).getByRole("button"));
    expect(openNode).toHaveBeenLastCalledWith(machineSet);

    const [owner] = screen.getAllByTestId("capi-node-owner");

    expect(owner.textContent).toBe(`MachineSet ${HEALTHY}-md-0-m9x7h-m5gtb`);
    fireEvent.click(within(owner).getByRole("button"));
    expect(openNode).toHaveBeenLastCalledWith(machineSet);

    const objects = within(rowNamed("Objects")).getAllByRole("button");

    expect(objects.map((button) => button.textContent)).toEqual([`DevMachine ${WORKER}`, `KubeadmConfig ${WORKER}`]);
    fireEvent.click(objects[0]);
    expect(openNode).toHaveBeenLastCalledWith(`infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`);
    expect(host.navigate).not.toHaveBeenCalled();
  });

  it("show a target that the tree does not hold as text, with why in its tooltip, and no button", () => {
    // The MachineHealthCheck of the workers names a Machine gone since it wrote its targets, as the case writes it.
    const name = `${HEALTHY}-md-0-m9x7h`;
    const view = stateView("healthy", (objects) => {
      for (const object of objects) {
        if (object.kind === "MachineHealthCheck" && object.metadata.name === name) {
          object.status.targets = [...object.status.targets, `${HEALTHY}-gone`];
        }
      }
    });

    rendered(detailsOf(view, `cluster.x-k8s.io/MachineHealthCheck/${name}`));

    const row = rowNamed("Targets");
    const unheld = within(row).getByTestId("capi-node-unheld");

    expect(within(row).getAllByRole("button")).toHaveLength(2);
    expect(unheld.textContent).toBe(`Machine ${HEALTHY}-gone`);
    expect(within(row).getByTestId("capi-node-unheld-tooltip").textContent).toBe(
      "No such object is in the namespace of the Cluster.",
    );
  });

  it("link an object of a provider to the details of the host, whose click stops at the link", () => {
    const view = stateView("healthy");

    rendered(detailsOf(view, `infrastructure.cluster.x-k8s.io/DevMachine/${WORKER}`));

    const link = within(rowNamed("In Freelens")).getByRole("link");
    const outside = vi.fn();

    document.body.addEventListener("click", outside);
    onTestFinished(() => document.body.removeEventListener("click", outside));
    fireEvent.click(link);

    expect(link.textContent).toBe(`DevMachine ${WORKER}`);
    expect(link.getAttribute("href")).toBe(
      `?kube-details=${encodeURIComponent(`/apis/test/DevMachine/${HEALTHY}/${WORKER}`)}`,
    );
    expect(host.navigate).toHaveBeenCalledWith(link.getAttribute("href"));
    expect(outside).not.toHaveBeenCalled();
  });

  it("show the annotations of the kinds of P20 in a row of their own, without the one that kubectl apply writes, whose presence alone they say", () => {
    const applied = '{"apiVersion":"bootstrap.cluster.x-k8s.io/v1beta2","spec":{"files":[{"content":"secret"}]}}';
    const view = stateView("healthy", (objects) => {
      for (const object of objects) {
        if (object.metadata.name !== WORKER) continue;
        object.metadata.annotations = { ...object.metadata.annotations, [LAST_APPLIED]: applied, example: "shown" };
      }
    });

    rendered(detailsOf(view, `bootstrap.cluster.x-k8s.io/KubeadmConfig/${WORKER}`));

    const annotations = screen.getByTestId("capi-details-annotations");

    expect(annotations.textContent).toContain("example=shown");
    expect(screen.getByTestId("capi-details-annotation-held").textContent).toBe(
      `${LAST_APPLIED}: held, and not shown, since it copies the spec of the object as it was applied`,
    );
    expect(document.body.textContent).not.toContain("secret");
    // The metadata of the host leave out their annotations.
    for (const meta of screen.getAllByTestId("host-meta")) {
      expect((meta.dataset.fields ?? "").split(" ")).not.toContain("annotations");
    }
    cleanup();

    // A Machine is no kind of P20: the metadata of the host show its annotations, and the details have no row of
    // their own.
    rendered(detailsOf(view, MACHINE));
    expect(screen.queryByTestId("capi-details-annotations")).toBeNull();
    expect(
      screen.getAllByTestId("host-meta").some((meta) => (meta.dataset.fields ?? "").split(" ").includes("annotations")),
    ).toBe(true);
  });

  it("say the pause of a node, the phase with its remark, and why a node that cannot be read is not", () => {
    const paused = stateView("healthy", (objects) => {
      for (const object of objects) {
        if (object.kind === "Machine" && object.metadata.name === WORKER) {
          object.metadata.annotations = { ...object.metadata.annotations, "cluster.x-k8s.io/paused": "" };
        }
      }
    });

    rendered(detailsOf(paused, MACHINE));
    expect(screen.getByTestId("capi-details-pause").textContent).toBe(
      "Paused by its own annotation cluster.x-k8s.io/paused",
    );
    expect(valueOf("capi-details-phase")).toBe(
      "RunningThe project tells no software to decide on the phase of a Machine.",
    );
    cleanup();

    rendered(
      detailsOf(
        stateView("deleting"),
        "infrastructure.cluster.x-k8s.io/DevMachineTemplate/freelens-capi-deleting-md-0-gq8t7",
      ),
    );
    expect(valueOf("capi-node-unread")).toBe("No such object is in the namespace of the Cluster.");
    expect(screen.queryByTestId("capi-node-section-metadata")).toBeNull();
  });

  it("show the error page in a section that throws, keep the other sections, and leave the tree", async () => {
    const metadata = Renderer.Component.KubeObjectMeta.getMockImplementation();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Renderer.Component.KubeObjectMeta.mockImplementation(() => {
      throw new TypeError("the metadata failed");
    });
    onTestFinished(() => {
      if (metadata !== undefined) Renderer.Component.KubeObjectMeta.mockImplementation(metadata);
    });

    rendered(detailsOf(stateView("healthy"), MACHINE));

    const details = screen.getByTestId("capi-node-details");

    expect(within(details).getByText("TypeError: the metadata failed")).toBeDefined();
    expect(within(details).queryByTestId("capi-node-section-metadata")).toBeNull();
    expect(within(details).getByTestId("capi-node-section-place")).toBeDefined();
    expect(within(details).getByTestId("capi-node-section-status")).toBeDefined();
    expect(within(details).getByTestId("capi-node-section-facts")).toBeDefined();
    cleanup();

    // In the page, the tree stays.
    const value = (initial: string) => {
      const box = observable.box(initial);

      return { get: () => box.get(), set: (next: string) => runInAction(() => box.set(next)), clear: vi.fn() };
    };

    serve(undefined, [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS]);
    for (const api of Object.values(TREE_APIS)) host.registerApi(api);
    for (const api of [...Object.values(APIS), ...Object.values(TREE_APIS)]) {
      host.cluster.set(api.apiBase, {
        items: objectsOfStates(["healthy"]).filter((object) => object.kind === api.kind),
        failures: [],
      });
    }
    render(
      <ClusterTreePage
        params={
          { cluster: value(`${HEALTHY}/${HEALTHY}`), details: value(MACHINE) } as unknown as Record<
            string,
            Extensions.Navigation.PageParam<string>
          >
        }
        extension={EXTENSION}
      />,
    );
    for (let turn = 0; turn < 6; turn++) await act(async () => undefined);

    expect(within(screen.getByTestId("capi-tree-details")).getByText("TypeError: the metadata failed")).toBeDefined();
    expect(within(screen.getByTestId("capi-tree")).getAllByRole("row").length).toBeGreaterThan(5);
  });
});
