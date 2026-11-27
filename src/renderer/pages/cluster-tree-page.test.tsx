// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { CAPTURE, fixtureSet } from "../../../test/fixture-sets";
import { Common, host, Renderer } from "../../../test/freelens-extensions";
import {
  APIS,
  DEFINITIONS,
  DEV_CLUSTERS,
  DEV_DEFINITIONS,
  definition,
  hostObject,
  serve,
  TREE_APIS,
} from "../../../test/host-stores";
import { objectsOfStates } from "../../../test/view-sources";
import { TreeBuilds } from "../../common/views/cluster-tree";
import { nodeDetailsOf } from "../../common/views/node-details";
import { COLUMN_TITLES, TREE_COLUMNS } from "../../common/views/tree-cells";
import { rowDomId } from "../../common/views/tree-keys";
import { ROW_HEIGHT } from "../../common/views/tree-rows";
import { ErrorBoundary } from "../components/error-boundary";
import { ClusterPanel } from "../details/cluster-details-v1beta2";
import { mountedPageSource } from "../reads/cluster-source";
import styles from "./cluster-tree.module.scss";
import { ClusterTreePage } from "./cluster-tree-page";

import type { Renderer as Extensions } from "@freelensapp/extensions";

import type { HostObject } from "../../../test/host-stores";
import type { Cluster } from "../api/cluster/cluster-v1beta2";

// The cases of SPEC-0005, "Tests", "Unit", `cluster-tree-page.test.tsx` (P1, P2, P6, P9, P13 to P19, P23): the page
// with its parameters and its title; the states of P19; the spinner until the first loads end; the `Table` of the host,
// its `selectedItemId` and the scroll of the list's element; the element of the tree, its keys and the attributes of
// its rows and cells; the text of every cell inside the element that cuts it; the names, the buttons and the focus; the
// details of a node, their closing and the focus back; the clicks on the rows and the details of the host; the search;
// the reads of the page, which it publishes to no one; and the refresh.
// The `Table` of the stub draws the rows that `getTableRow` gives inside an element of the class `VirtualList`, around
// the element of the class `list` that scrolls, as the virtual list of the host does, and records its props. jsdom lays
// nothing out: a case gives that element its height and its scroll, and the frames that the page asks for run when the
// case says, through `requestAnimationFrame`, which the cases replace.

// The function of the details of a node, as the page imports it, which a case makes throw (P17, P19).
vi.mock("../../common/views/node-details", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../common/views/node-details")>();

  return { ...actual, nodeDetailsOf: vi.fn(actual.nodeDetailsOf) };
});

const EXTENSION = new Renderer.LensExtension({
  name: "@freelensapp/capi-extension",
}) as unknown as Extensions.LensExtension;

const HEALTHY = "freelens-capi-healthy";
const ADDRESS = `${HEALTHY}/${HEALTHY}`;
const ROOT = `cluster.x-k8s.io/Cluster/${HEALTHY}`;
const DEV_CLUSTER = `infrastructure.cluster.x-k8s.io/DevCluster/${HEALTHY}-8fgcf`;
const CONTROL_PLANE = `controlplane.cluster.x-k8s.io/KubeadmControlPlane/${HEALTHY}-d2lgq`;
const WORKERS = "virtual:workers";
const DEPLOYMENT = `cluster.x-k8s.io/MachineDeployment/${HEALTHY}-md-0-m9x7h`;
const MACHINE_SET = `cluster.x-k8s.io/MachineSet/${HEALTHY}-md-0-m9x7h-m5gtb`;
const MACHINE = `cluster.x-k8s.io/Machine/${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`;
const OTHER_MACHINE = `cluster.x-k8s.io/Machine/${HEALTHY}-md-0-m9x7h-m5gtb-5pzv9`;
const DEV_MACHINE = `infrastructure.cluster.x-k8s.io/DevMachine/${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`;
const CONFIG = `bootstrap.cluster.x-k8s.io/KubeadmConfig/${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`;

const REFRESH_WAIT = "The tree is still being read: it can be read again once it is";

interface TableProps {
  readonly className?: string;
  readonly virtual?: boolean;
  readonly selectable?: boolean;
  readonly items: readonly { getId(): string }[];
  readonly getTableRow?: (uid: string) => unknown;
  readonly selectedItemId?: string;
}

// A store of the extension's own class that the read of the page built.
interface OwnStore {
  readonly api: { readonly kind: string; readonly apiBase: string };
  readonly items: HostObject[] & { push(item: HostObject): void; replace(items: HostObject[]): void };
  readonly loadAll: ReturnType<typeof vi.fn>;
}

type Writable = Record<string, any>;

const table = Renderer.Component.Table;

function tableProps(): TableProps[] {
  return table.mock.calls.map(([props]) => props as unknown as TableProps);
}

function lastTable(): TableProps {
  const calls = tableProps();

  return calls[calls.length - 1];
}

// The ids of the rows that the page gave the table last.
function rowIds(): string[] {
  return lastTable().items.map((item) => item.getId());
}

// A parameter of the page, as the host gives it: its value in the address of the frame (P2).
function pageParam(initial = "") {
  const value = observable.box(initial);

  return {
    get: () => value.get(),
    set: vi.fn((next: string) => runInAction(() => value.set(next))),
    clear: vi.fn(() => runInAction(() => value.set(""))),
  };
}

type Param = ReturnType<typeof pageParam>;

interface Params {
  readonly cluster: Param;
  readonly details: Param;
}

function paramsOf(cluster = ADDRESS, details = ""): Params {
  return { cluster: pageParam(cluster), details: pageParam(details) };
}

// The page as the host renders it, with the parameters of its registration, given the extension from it.
function pageOf(params: Params) {
  return (
    <ClusterTreePage
      params={params as unknown as Record<string, Extensions.Navigation.PageParam<string>>}
      extension={EXTENSION}
    />
  );
}

// The host of a cluster that serves Cluster API and the kinds of the tree, with the definitions of the kinds of the
// development provider that the fixtures name, and the objects that the stores of the extension's own class read, with
// the failures of the first load of a kind, by its name, in the namespace of the Cluster.
function serveTree(objects: readonly HostObject[], failures: Partial<Record<string, unknown[]>> = {}) {
  serve(undefined, [...DEFINITIONS, DEV_CLUSTERS, ...DEV_DEFINITIONS]);
  for (const api of Object.values(TREE_APIS)) host.registerApi(api);
  for (const api of [...Object.values(APIS), ...Object.values(TREE_APIS)]) {
    host.cluster.set(api.apiBase, {
      items: objects.filter((object) => object.kind === api.kind),
      failures: (failures[api.kind] ?? []).map((error) => ({ namespace: HEALTHY, error })),
    });
  }
}

// The store of a kind that the read of the page built, of those built since a count.
function ownStore(kind: string, since: number): OwnStore {
  const found = (host.builtStores.slice(since) as OwnStore[]).find((store) => store.api.kind === kind);

  if (found === undefined) throw new Error(`No store of ${kind}`);
  return found;
}

// Lets the loads, their ends and the subscriptions that follow them run.
async function settle() {
  for (let turn = 0; turn < 6; turn++) await act(async () => undefined);
}

// The page of the tree of healthy, with the parameter details given, once its reads have settled.
async function opened(details = "") {
  const built = host.builtStores.length;

  serveTree(objectsOfStates(["healthy"]));

  const params = paramsOf(ADDRESS, details);
  const view = render(pageOf(params));

  await settle();
  return { params, built, view };
}

let frames: FrameRequestCallback[] = [];

// Runs the frames that the page asked for; those that they ask for wait for the next.
function nextFrame() {
  const due = frames.splice(0);

  act(() => {
    for (const callback of due) callback(0);
  });
}

// The element of the virtual list that scrolls, with the height and the scroll that the case gives it, since jsdom
// lays nothing out.
function layOut(height: number, scrollTop = 0): HTMLElement {
  const list = document.querySelector<HTMLElement>(".VirtualList > .list");
  let top = scrollTop;
  let tall = height;

  if (list === null) throw new Error("No list");
  Object.defineProperty(list, "clientHeight", {
    configurable: true,
    get: () => tall,
    set: (value: number) => {
      tall = value;
    },
  });
  Object.defineProperty(list, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  return list;
}

function tree(): HTMLElement {
  return screen.getByTestId("capi-tree");
}

function rowOf(id: string): HTMLElement {
  const row = document.getElementById(rowDomId(id));

  if (row === null) throw new Error(`No row of ${id}`);
  return row;
}

function rowElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.VirtualList > .list > [role="row"]')];
}

function drawerTitle(): string | null {
  return within(screen.getByTestId("capi-tree-details")).getByTestId("host-drawer-title").textContent;
}

function search(): HTMLInputElement {
  return screen.getByTestId("host-search-input") as HTMLInputElement;
}

function escapeIn(element: Element | Window) {
  return fireEvent.keyDown(element, { code: "Escape", key: "Escape" });
}

// A copy of an object of healthy, with the change of the case, as a watch brings it.
function changed(kind: string, name: string, change: (object: Writable) => void): HostObject {
  const object = structuredClone(
    fixtureSet("healthy").find((each) => each.kind === kind && each.metadata.name === name),
  ) as unknown as Writable | undefined;

  if (object === undefined) throw new Error(`No ${kind} ${name}`);
  delete object.metadata.uid;
  change(object);
  return hostObject(object);
}

const refusal = (resource: string) =>
  new Error("Failed to load", {
    cause: { kind: "Status", code: 403, message: `${resource} is forbidden in "${HEALTHY}"` },
  });

beforeEach(() => {
  host.reset();
  table.mockClear();
  Common.logger.error.mockClear();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.setSystemTime(CAPTURE);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the page and its parameters (P1, P2)", () => {
  it("shows the tree of the Cluster that its parameter cluster names, titled with its name and its namespace as text", async () => {
    await opened();

    const title = screen.getByTestId("capi-tree-title");

    expect(title.tagName).toBe("H5");
    expect(title.textContent).toBe("Cluster Tree: freelens-capi-healthy, freelens-capi-healthy");
    // Text: no badge of the namespace, no link.
    expect(title.children).toHaveLength(0);
    expect(rowIds()[0]).toBe(ROOT);
    expect(Common.logger.error).not.toHaveBeenCalled();
  });

  it("titles a Cluster that is not found with its name, then its namespace", async () => {
    serveTree(objectsOfStates(["healthy"]));
    render(pageOf(paramsOf(`${HEALTHY}/freelens-capi-other`)));
    await settle();

    expect(screen.getByTestId("capi-tree-title").textContent).toBe(
      "Cluster Tree: freelens-capi-other, freelens-capi-healthy",
    );
  });

  it("says what it shows when its address names no Cluster, and that a value that is not <namespace>/<name> names none, and reads nothing", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const built = host.builtStores.length;
    const { unmount } = render(pageOf(paramsOf("")));

    await settle();
    expect(screen.getByTestId("capi-tree-no-cluster").textContent).toBe(
      "This page shows the tree of one Cluster, which the details of that Cluster open, from their row Tree. Open the page of the Clusters",
    );
    expect(screen.getByRole("heading").textContent).toBe("Cluster Tree");
    fireEvent.click(within(screen.getByTestId("capi-tree-no-cluster")).getByRole("button"));
    expect(host.navigateExtension.mock.calls.map(([page]) => page)).toEqual(["clusters"]);
    unmount();

    render(pageOf(paramsOf("a/b/c")));
    await settle();
    expect(screen.getByTestId("capi-tree-invalid").textContent).toBe(
      'The address names no Cluster: the value of cluster is "a/b/c", which is not <namespace>/<name>.',
    );
    expect(host.builtStores.length).toBe(built);
  });

  it("says, under its title alone, that the host is checking, that Cluster API is not installed, or is older", () => {
    const { unmount } = render(pageOf(paramsOf()));

    expect(screen.getByTestId("capi-tree-checking").textContent).toBe(
      "Checking whether this cluster serves Cluster API",
    );
    expect(screen.getByRole("heading").textContent).toBe("Cluster Tree");
    expect(screen.queryByTestId("capi-tree")).toBeNull();
    unmount();

    runInAction(() => {
      host.crdStore.isLoaded = true;
    });
    render(pageOf(paramsOf()));
    expect(screen.getByTestId("capi-tree-not-installed").textContent).toBe(
      "Cluster API is not installed in this cluster: it serves no Cluster at cluster.x-k8s.io/v1beta2",
    );
    cleanup();

    runInAction(() => {
      host.crdStore.items = [definition("clusters.cluster.x-k8s.io", "cluster.x-k8s.io", "Cluster")];
    });
    host.registerApi({
      ...APIS.clusters,
      apiVersionWithGroup: "cluster.x-k8s.io/v1beta1",
      apiBase: "/apis/cluster.x-k8s.io/v1beta1/clusters",
    });
    render(pageOf(paramsOf()));
    expect(screen.getByTestId("capi-tree-older").textContent).toMatch(/serves Clusters at v1beta1 alone/);
  });
});

describe("the states of the tree (P13, P19)", () => {
  it("shows the spinner of the host in the place of the tree until the first load of every kind has ended, and no row before", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const release = host.deferLoads();

    render(pageOf(paramsOf(ADDRESS, MACHINE)));
    await settle();

    expect(screen.getByTestId("capi-tree-loading")).toBeDefined();
    expect(screen.queryByTestId("capi-tree")).toBeNull();
    expect(table).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="row"]')).toHaveLength(0);
    // The details of the node of the address wait as well, with the spinner, titled as the address names it.
    expect(screen.getByTestId("capi-tree-details-loading")).toBeDefined();
    expect(drawerTitle()).toBe(`Machine: ${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`);

    release();
    await settle();

    expect(screen.queryByTestId("capi-tree-loading")).toBeNull();
    expect(rowElements().length).toBeGreaterThan(0);
    expect(screen.queryByTestId("capi-tree-details-loading")).toBeNull();
    expect(screen.getByTestId("capi-node-details")).toBeDefined();
  });

  it("says that the Cluster is not found once it is gone, after the tree was shown", async () => {
    const { built } = await opened();
    const clusters = ownStore("Cluster", built);

    expect(rowIds()[0]).toBe(ROOT);
    act(() => {
      runInAction(() => clusters.items.replace([]));
    });

    expect(screen.getByTestId("capi-tree-not-found").textContent).toMatch(
      /^No Cluster freelens-capi-healthy\/freelens-capi-healthy is in the namespace freelens-capi-healthy, which was read\./,
    );
    expect(screen.queryByTestId("capi-tree")).toBeNull();
  });

  it("shows the error page of the template in the place of the tree when it throws, the header kept", async () => {
    const implementation = table.getMockImplementation();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    table.mockImplementation(() => {
      throw new TypeError("the table failed");
    });
    onTestFinished(() => {
      if (implementation !== undefined) table.mockImplementation(implementation);
    });
    await opened();

    expect(screen.getByText("TypeError: the table failed")).toBeDefined();
    expect(screen.getByTestId("capi-tree-title").textContent).toBe(
      "Cluster Tree: freelens-capi-healthy, freelens-capi-healthy",
    );
    expect(screen.getByTestId("host-search-input")).toBeDefined();
    expect(screen.getByTestId("capi-tree-refresh")).toBeDefined();
    expect(screen.queryByTestId("capi-tree")).toBeNull();
  });

  it("shows the error page in the place of the tree when what the tree computes throws, the header kept", async () => {
    const treeOf = vi.spyOn(TreeBuilds.prototype, "treeOf").mockImplementation(() => {
      throw new TypeError("the tree failed");
    });

    onTestFinished(() => treeOf.mockRestore());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    serveTree(objectsOfStates(["healthy"]));
    // The page as its registration renders it, inside the error boundary of a page.
    render(<ErrorBoundary extension={EXTENSION}>{pageOf(paramsOf(ADDRESS, MACHINE))}</ErrorBoundary>);
    await settle();

    expect(treeOf).toHaveBeenCalled();
    expect(screen.getByText("TypeError: the tree failed")).toBeDefined();
    expect(screen.getByTestId("capi-tree-title").textContent).toBe(
      "Cluster Tree: freelens-capi-healthy, freelens-capi-healthy",
    );
    expect(screen.getByTestId("host-search-input")).toBeDefined();
    expect(screen.getByTestId("capi-tree-refresh")).toBeDefined();
    expect(screen.queryByTestId("capi-tree")).toBeNull();
  });

  it("shows the error page in the drawer alone when the details of a node throw, the tree and the header kept", async () => {
    const details = vi.mocked(nodeDetailsOf);
    const real = details.getMockImplementation() as typeof nodeDetailsOf;

    details.mockImplementation((found, node, inputs) => {
      if (node.kind === "Machine") throw new TypeError("the details failed");
      return real(found, node, inputs);
    });
    onTestFinished(() => {
      details.mockImplementation(real);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    serveTree(objectsOfStates(["healthy"]));
    render(<ErrorBoundary extension={EXTENSION}>{pageOf(paramsOf(ADDRESS, MACHINE))}</ErrorBoundary>);
    await settle();

    const drawer = screen.getByTestId("capi-tree-details");

    expect(within(drawer).getByText("TypeError: the details failed")).toBeDefined();
    expect(drawerTitle()).toBe(`Machine: ${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`);
    expect(rowIds()).toContain(MACHINE);
    expect(within(tree()).getAllByRole("row").length).toBeGreaterThan(5);
    expect(screen.getByTestId("capi-tree-title")).toBeDefined();
    expect(Common.logger.error).toHaveBeenCalledTimes(1);

    // The details of another node show, the boundary of the drawer being keyed by the node.
    fireEvent.click(rowOf(DEV_CLUSTER));
    expect(within(screen.getByTestId("capi-tree-details")).queryByText("TypeError: the details failed")).toBeNull();
    expect(screen.getByTestId("capi-node-details")).toBeDefined();
  });

  it("says that no such Cluster is in its namespace, which was read, with a button to the page of the Clusters", async () => {
    serveTree(objectsOfStates(["healthy"]));
    render(pageOf(paramsOf(`${HEALTHY}/freelens-capi-other`)));
    await settle();

    const state = screen.getByTestId("capi-tree-not-found");

    expect(state.textContent).toBe(
      "No Cluster freelens-capi-healthy/freelens-capi-other is in the namespace freelens-capi-healthy, which was read. Open the page of the Clusters",
    );
    fireEvent.click(within(state).getByRole("button"));
    expect(host.navigateExtension.mock.calls.map(([page]) => page)).toEqual(["clusters"]);
    expect(screen.queryByTestId("capi-tree")).toBeNull();
    expect(screen.queryByTestId("capi-tree-details")).toBeNull();
  });

  it("says Restricted in the place of the tree when the Clusters of its namespace are refused, with the permission, and Failed otherwise", async () => {
    serveTree(objectsOfStates(["healthy"]), { Cluster: [refusal("clusters.cluster.x-k8s.io")] });

    const { unmount } = render(pageOf(paramsOf()));

    await settle();

    const restricted = screen.getByTestId("capi-tree-restricted");

    expect(restricted.textContent).toBe(
      [
        "You may not list the Clusters of the namespace freelens-capi-healthy.",
        `clusters.cluster.x-k8s.io is forbidden in "${HEALTHY}"`,
        "Reading them takes get, list and watch on clusters of cluster.x-k8s.io, in that namespace.",
      ].join(""),
    );
    expect(screen.queryByTestId("capi-tree")).toBeNull();
    unmount();

    serveTree(objectsOfStates(["healthy"]), {
      Cluster: [new Error("Failed to load", { cause: new Error("socket hang up") })],
    });
    render(pageOf(paramsOf()));
    await settle();

    const failed = screen.getByTestId("capi-tree-failed");

    expect(failed.textContent).toMatch(/^The Clusters of the namespace freelens-capi-healthy could not be read\./);
    expect(failed.textContent).toMatch(/socket hang up/);
    expect(failed.textContent).not.toMatch(/Reading them takes/);
  });

  it("says Partial above the tree when a kind could not be read, the tree kept", async () => {
    serveTree(objectsOfStates(["healthy"]), { KubeadmConfig: [refusal("kubeadmconfigs.bootstrap.cluster.x-k8s.io")] });
    render(pageOf(paramsOf()));
    await settle();

    const notices = [...document.querySelectorAll<HTMLElement>('[data-testid^="capi-notice-"]')];
    const kind = "kind:bootstrap.cluster.x-k8s.io/KubeadmConfig";

    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toMatch(/KubeadmConfig/);
    expect(notices[0].textContent).toMatch(/kubeadmconfigs\.bootstrap\.cluster\.x-k8s\.io is forbidden/);
    expect(notices[0].compareDocumentPosition(tree()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rowIds()[0]).toBe(ROOT);
    // The node of the kind under the Cluster, whose tooltip carries the notice whole, with what it leaves unread (P7, P12).
    expect(rowOf(kind).getAttribute("aria-level")).toBe("2");
    expect(within(rowOf(kind)).getByTestId("capi-tree-status-tooltip").textContent).toMatch(
      /kubeadmconfigs\.bootstrap\.cluster\.x-k8s\.io is forbidden/,
    );
    expect(within(rowOf(kind)).getByTestId("capi-tree-status-tooltip").textContent).toContain(
      "Until they can be read, their nodes in the tree read as not read.",
    );
  });

  it("says in the place of the tree that the Clusters could not be read again when a refresh of them fails, never Restricted", async () => {
    await opened();

    host.cluster.get(APIS.clusters.apiBase)?.failures.push({
      namespace: HEALTHY,
      error: refusal("clusters.cluster.x-k8s.io"),
    });
    fireEvent.click(screen.getByTestId("capi-tree-refresh"));
    await settle();

    const state = screen.getByTestId("capi-tree-not-read-again");

    expect(state.textContent).toMatch(
      /^The Clusters of the namespace freelens-capi-healthy could not be read again, at /,
    );
    expect(state.textContent).not.toMatch(/You may not list/);
    expect(screen.queryByTestId("capi-tree-restricted")).toBeNull();
    expect(screen.queryByTestId("capi-tree")).toBeNull();
  });
});

describe("the table of the tree (P9, P13, P16)", () => {
  it("is the Table of the host with virtual rows, getTableRow and selectable, one item for each node shown", async () => {
    await opened();

    const props = lastTable();

    expect(props.virtual).toBe(true);
    expect(props.selectable).toBe(true);
    expect(typeof props.getTableRow).toBe("function");
    expect(props.className).toBe(styles.table);
    // The expansion at first of healthy, whose objects are all Healthy and Idle: the Cluster alone.
    expect(rowIds()).toEqual([
      ROOT,
      DEV_CLUSTER,
      CONTROL_PLANE,
      WORKERS,
      "cluster.x-k8s.io/ClusterClass/quick-start",
      "virtual:add-ons",
      "virtual:health-checks",
    ]);
    expect(rowElements().map((row) => row.id)).toEqual(rowIds().map(rowDomId));
  });

  it("puts the attributes of a tree item on each row in the DOM, the header a row of columnheader cells, every cell of a row a gridcell", async () => {
    await opened(DEV_CLUSTER);

    const head = document.querySelector<HTMLElement>(".TableHead");

    expect(head?.getAttribute("role")).toBe("row");
    expect([...(head?.children ?? [])].map((cell) => cell.getAttribute("role"))).toEqual(
      TREE_COLUMNS.map(() => "columnheader"),
    );
    expect(
      within(head as HTMLElement)
        .getAllByTestId("capi-tree-head")
        .map((title) => title.textContent),
    ).toEqual(TREE_COLUMNS.map((column) => COLUMN_TITLES[column]));

    for (const row of rowElements()) {
      expect(row.getAttribute("role")).toBe("row");
      expect([...row.children].map((cell) => cell.getAttribute("role"))).toEqual(TREE_COLUMNS.map(() => "gridcell"));
    }

    expect(rowOf(ROOT).getAttribute("aria-level")).toBe("1");
    expect(rowOf(ROOT).getAttribute("aria-expanded")).toBe("true");
    expect(rowOf(ROOT).getAttribute("aria-selected")).toBe("false");
    expect(rowOf(WORKERS).getAttribute("aria-level")).toBe("2");
    expect(rowOf(WORKERS).getAttribute("aria-expanded")).toBe("false");
    // A leaf carries no aria-expanded; the row whose details are open is selected.
    expect(rowOf(DEV_CLUSTER).hasAttribute("aria-expanded")).toBe(false);
    expect(rowOf(DEV_CLUSTER).getAttribute("aria-selected")).toBe("true");
    expect(rowOf(DEV_CLUSTER).className.split(" ")).toContain("selected");
  });

  it("holds the text of every cell, the counts included, inside the element that cuts it with an ellipsis", async () => {
    await opened(MACHINE);

    // The text of a cell outside that element, but for its tooltip, hidden next to it in the stub.
    const outside = (cell: Element): string[] => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const found: string[] = [];

      for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
        const parent = text.parentElement;
        const content = parent?.closest(`.${styles.content}`);

        if ((text.textContent ?? "").trim() === "" || parent?.closest("[hidden]")) continue;
        if (content === null || content === undefined || !cell.contains(content)) found.push(text.textContent ?? "");
      }
      return found;
    };
    const rows = rowElements();

    for (const row of rows) {
      for (const cell of row.children) expect(outside(cell), `${row.id} ${cell.className}`).toEqual([]);
    }

    // The counts of the rows whose children are collapsed, such as those of the control plane.
    const counts = within(rowOf(CONTROL_PLANE)).getByTestId("capi-tree-counts");

    expect(counts.textContent).toMatch(/^\d+ objects: /);
    expect(counts.closest(`.${styles.content}`)).not.toBeNull();
    expect(rows.length).toBeGreaterThan(8);
  });

  it("gives selectedItemId in the first render of the tree for the node of the address and in the render after a key move, clears it once the row is drawn, and never at a render of a change of state", async () => {
    const { built } = await opened(MACHINE);
    const first = tableProps();

    expect(first[0].selectedItemId).toBe(MACHINE);
    expect(lastTable().selectedItemId).toBe(MACHINE);

    // The frame after the row is drawn clears it.
    nextFrame();
    expect(lastTable().selectedItemId).toBeUndefined();

    // A change of state: the other Machine changes, as a watch brings it, and the tree renders again.
    const count = table.mock.calls.length;
    const machines = ownStore("Machine", built);

    act(() => {
      runInAction(() =>
        machines.items.replace(
          machines.items.map((machine) =>
            machine.getName() === `${HEALTHY}-md-0-m9x7h-m5gtb-5pzv9`
              ? changed("Machine", machine.getName(), (object) => {
                  object.metadata.labels.changed = "true";
                  object.metadata.resourceVersion = "2";
                })
              : machine,
          ),
        ),
      );
    });
    expect(table.mock.calls.length).toBeGreaterThan(count);
    expect(
      tableProps()
        .slice(count)
        .map((props) => props.selectedItemId),
    ).toEqual(
      tableProps()
        .slice(count)
        .map(() => undefined),
    );

    // A key move: the render after it gives the row that it moves to, until the row is drawn.
    fireEvent.keyDown(tree(), { key: "ArrowDown" });
    expect(lastTable().selectedItemId).toBe(OTHER_MACHINE);
    nextFrame();
    expect(lastTable().selectedItemId).toBeUndefined();
  });

  it("shows and scrolls to a node that the address names later, as a link names it, but not the node of a row clicked", async () => {
    const { params } = await opened();

    expect(rowIds()).not.toContain(MACHINE);

    // The address names the Machine: its row is shown, the nodes above it expanded, and the list scrolls to it.
    act(() => params.details.set(MACHINE));
    expect(rowIds()).toContain(MACHINE);
    expect(lastTable().selectedItemId).toBe(MACHINE);
    nextFrame();
    expect(lastTable().selectedItemId).toBeUndefined();

    // A click on a row sets the address too, which shows a row already in view: the list scrolls nothing.
    const count = table.mock.calls.length;

    fireEvent.click(rowOf(CONTROL_PLANE));
    expect(params.details.get()).toBe(CONTROL_PLANE);
    expect(
      tableProps()
        .slice(count)
        .map((props) => props.selectedItemId),
    ).toEqual(
      tableProps()
        .slice(count)
        .map(() => undefined),
    );
  });

  it("shows and scrolls to a node that the address names once it appears", async () => {
    const name = `${HEALTHY}-md-0-m9x7h-m5gtb-0aaaa`;
    const { built } = await opened(`cluster.x-k8s.io/Machine/${name}`);

    expect(screen.getByTestId("capi-tree-details-absent")).toBeDefined();
    expect(rowIds()).not.toContain(MACHINE_SET);

    const machines = ownStore("Machine", built);

    act(() => {
      runInAction(() =>
        machines.items.push(
          changed("Machine", `${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`, (object) => {
            object.metadata.name = name;
          }),
        ),
      );
    });

    expect(rowIds()).toContain(`cluster.x-k8s.io/Machine/${name}`);
    expect(lastTable().selectedItemId).toBe(`cluster.x-k8s.io/Machine/${name}`);
    expect(drawerTitle()).toBe(`Machine: ${name}`);
  });

  it("brings the row of the node of the address whole into view once the element of the list has its height", async () => {
    await opened(MACHINE);

    const list = layOut(0);

    // The list has no height yet: the page scrolls nothing, and asks for another frame.
    nextFrame();
    nextFrame();
    expect(list.scrollTop).toBe(0);

    // The list gets its height, as the layout of the host gives it.
    (list as { clientHeight: number }).clientHeight = 3 * ROW_HEIGHT;
    nextFrame();

    const index = rowIds().indexOf(MACHINE);

    expect(index).toBeGreaterThan(3);
    expect(list.scrollTop).toBe((index + 1) * ROW_HEIGHT - 3 * ROW_HEIGHT);
  });

  it("brings the row that a key move leaves partly in view whole into view, by the scroll of the list", async () => {
    await opened();

    // Three rows and a part of the fourth in view.
    const list = layOut(3 * ROW_HEIGHT + 10);

    for (let move = 0; move < 2; move++) {
      fireEvent.keyDown(tree(), { key: "ArrowDown" });
      nextFrame();
      expect(list.scrollTop).toBe(0);
    }
    fireEvent.keyDown(tree(), { key: "ArrowDown" });
    nextFrame();
    expect(list.scrollTop).toBe(4 * ROW_HEIGHT - (3 * ROW_HEIGHT + 10));

    // A move up to a row above the view brings its top to the top of the view.
    list.scrollTop = 2 * ROW_HEIGHT;
    fireEvent.keyDown(tree(), { key: "Home" });
    nextFrame();
    expect(list.scrollTop).toBe(0);
  });

  it("keeps the rows in view in place, in a layout effect, when the reads insert or remove rows above the first row in view", async () => {
    const { built } = await opened(MACHINE);

    nextFrame();

    const list = layOut(5 * ROW_HEIGHT);
    const before = rowIds();
    const first = before.indexOf(OTHER_MACHINE) + 1;
    const machines = ownStore("Machine", built);
    const added = changed("Machine", `${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`, (object) => {
      object.metadata.name = `${HEALTHY}-md-0-m9x7h-m5gtb-0aaaa`;
    });

    list.scrollTop = first * ROW_HEIGHT;
    // A Machine that sorts before the others arrives under the MachineSet, above the first row in view.
    act(() => {
      runInAction(() => machines.items.push(added));
    });
    expect(rowIds().indexOf(`cluster.x-k8s.io/Machine/${HEALTHY}-md-0-m9x7h-m5gtb-0aaaa`)).toBeLessThan(first);
    expect(rowIds()).toHaveLength(before.length + 1);
    expect(list.scrollTop).toBe((first + 1) * ROW_HEIGHT);

    // It goes, and the rows in view stay in place.
    act(() => {
      runInAction(() => machines.items.replace(machines.items.filter((machine) => machine !== added)));
    });
    expect(rowIds()).toEqual(before);
    expect(list.scrollTop).toBe(first * ROW_HEIGHT);

    // An expansion moves no row in view and scrolls nothing.
    fireEvent.click(within(rowOf("virtual:health-checks")).getByTestId("capi-tree-expander"));
    expect(rowIds().length).toBeGreaterThan(before.length);
    expect(list.scrollTop).toBe(first * ROW_HEIGHT);
  });

  it("gives no selectedItemId and sets no scroll after a search that keeps the row of the active node out of view", async () => {
    await opened(MACHINE);

    // The row of the address is brought into view.
    const list = layOut(3 * ROW_HEIGHT);

    nextFrame();
    expect(list.scrollTop).toBeGreaterThan(0);

    // The user scrolls back to the top: the window of the list draws its first three rows, and the row of the Machine,
    // the active node, is out of it.
    list.scrollTop = 0;
    host.drawnRows = (ids) => ids.slice(0, 3);

    const count = table.mock.calls.length;

    fireEvent.change(search(), { target: { value: "2xxxg" } });

    expect(rowIds()).toEqual([ROOT, WORKERS, DEPLOYMENT, MACHINE_SET, MACHINE, DEV_MACHINE, CONFIG]);
    expect(
      tableProps()
        .slice(count)
        .map((props) => props.selectedItemId),
    ).toEqual(
      tableProps()
        .slice(count)
        .map(() => undefined),
    );
    nextFrame();
    expect(list.scrollTop).toBe(0);
    expect(tree().getAttribute("aria-activedescendant")).toBeNull();
  });
});

describe("the keys and the focus of the tree (P18)", () => {
  it("is a treegrid with its label and the one stop of Tab of the tree, which takes the keys of a tree, their default prevented", async () => {
    const { params } = await opened();
    const element = tree();

    expect(element.getAttribute("role")).toBe("treegrid");
    expect(element.getAttribute("aria-label")).toBe("Tree of the Cluster freelens-capi-healthy");
    expect(element.tabIndex).toBe(0);
    expect(
      [...element.querySelectorAll<HTMLElement>("button, a, input, [tabindex]")].filter((each) => each.tabIndex >= 0),
    ).toEqual([]);

    layOut(3 * ROW_HEIGHT);

    const rows = rowIds();
    const active = () => element.getAttribute("aria-activedescendant");
    const press = (key: string) => {
      const kept = fireEvent.keyDown(element, { key });

      nextFrame();
      return kept;
    };

    expect(active()).toBe(rowDomId(ROOT));
    expect(press("ArrowDown")).toBe(false);
    expect(active()).toBe(rowDomId(rows[1]));
    expect(press("ArrowUp")).toBe(false);
    expect(active()).toBe(rowDomId(ROOT));
    expect(press("End")).toBe(false);
    expect(active()).toBe(rowDomId(rows[rows.length - 1]));
    expect(press("Home")).toBe(false);
    expect(active()).toBe(rowDomId(ROOT));
    // A window of the list holds three rows.
    expect(press("PageDown")).toBe(false);
    expect(active()).toBe(rowDomId(rows[3]));
    expect(press("PageUp")).toBe(false);
    expect(active()).toBe(rowDomId(ROOT));

    // Right expands the Workers, Left collapses them, and Left again goes to the Cluster.
    press("PageDown");
    expect(active()).toBe(rowDomId(WORKERS));
    expect(press("ArrowRight")).toBe(false);
    expect(rowOf(WORKERS).getAttribute("aria-expanded")).toBe("true");
    expect(rowIds()).toContain(DEPLOYMENT);
    expect(press("ArrowLeft")).toBe(false);
    expect(rowOf(WORKERS).getAttribute("aria-expanded")).toBe("false");
    expect(press("ArrowLeft")).toBe(false);
    expect(active()).toBe(rowDomId(ROOT));

    // Enter opens the details of an object.
    press("ArrowDown");
    expect(press("Enter")).toBe(false);
    expect(params.details.get()).toBe(DEV_CLUSTER);

    // A key that the tree does not take keeps its default.
    expect(fireEvent.keyDown(element, { key: "a" })).toBe(true);
  });

  it("names no row in aria-activedescendant while the row of the active node is not drawn", async () => {
    await opened();

    expect(tree().getAttribute("aria-activedescendant")).toBe(rowDomId(ROOT));

    host.drawnRows = (ids) => ids.slice(1);
    fireEvent.change(search(), { target: { value: "x" } });
    fireEvent.change(search(), { target: { value: "" } });

    expect(tree().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("gives the names and the buttons of the rows no stop of Tab and no focus on a press, and a click on one gives the focus to the tree with preventScroll", async () => {
    await opened();

    const element = tree();
    const names = within(element).getAllByTestId("capi-tree-name-button");
    const expanders = within(element).getAllByTestId("capi-tree-expander");

    expect(names.length).toBeGreaterThan(1);
    expect(expanders.length).toBeGreaterThan(1);
    for (const button of [...names, ...expanders]) {
      expect(button.tabIndex).toBe(-1);
      // The default of the press, which would give the button the focus, is prevented.
      expect(fireEvent.mouseDown(button)).toBe(false);
    }

    const focus = vi.spyOn(element, "focus");

    fireEvent.click(within(rowOf(CONTROL_PLANE)).getByTestId("capi-tree-name-button"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(element);

    focus.mockClear();
    element.blur();
    fireEvent.click(within(rowOf(WORKERS)).getByTestId("capi-tree-expander"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(element);
    expect(rowOf(WORKERS).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the details of a node (P15, P17)", () => {
  it("open over the tree on a click on the row of a node, which stops there, titled by its kind and its name, and show another node on a click on another row", async () => {
    const { params } = await opened();

    fireEvent.click(rowOf(DEV_CLUSTER));
    expect(params.details.get()).toBe(DEV_CLUSTER);
    expect(drawerTitle()).toBe("DevCluster: freelens-capi-healthy-8fgcf");
    expect(rowOf(DEV_CLUSTER).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(rowOf(CONTROL_PLANE));
    expect(params.details.get()).toBe(CONTROL_PLANE);
    expect(drawerTitle()).toBe("KubeadmControlPlane: freelens-capi-healthy-d2lgq");
    expect(screen.getAllByTestId("capi-tree-details")).toHaveLength(1);
    expect(rowOf(DEV_CLUSTER).getAttribute("aria-selected")).toBe("false");
  });

  it("stay open on a click on a virtual row, which expands it", async () => {
    const { params } = await opened(DEV_CLUSTER);

    fireEvent.click(rowOf(WORKERS));

    expect(params.details.get()).toBe(DEV_CLUSTER);
    expect(drawerTitle()).toBe("DevCluster: freelens-capi-healthy-8fgcf");
    expect(rowOf(WORKERS).getAttribute("aria-expanded")).toBe("true");
  });

  it("close the details of the host first on a click on a row while kube-details holds a value, and not while it holds none", async () => {
    const { params } = await opened();

    runInAction(() => host.params.set("kube-details", "/apis/infrastructure.cluster.x-k8s.io/v1beta2/devclusters/x"));
    fireEvent.click(rowOf(DEV_CLUSTER));

    expect(host.hideDetails).toHaveBeenCalledTimes(1);
    expect(host.hideDetails.mock.invocationCallOrder[0]).toBeLessThan(params.details.set.mock.invocationCallOrder[0]);
    expect(params.details.get()).toBe(DEV_CLUSTER);

    // `hideDetails` left the parameter with an empty value.
    host.hideDetails.mockClear();
    fireEvent.click(rowOf(CONTROL_PLANE));
    expect(host.hideDetails).not.toHaveBeenCalled();
    expect(params.details.get()).toBe(CONTROL_PLANE);
  });

  it("of a node of Cluster API open no details of the host, and those of a node of a provider link to them", async () => {
    await opened();

    fireEvent.click(rowOf(CONTROL_PLANE));
    expect(screen.getByTestId("capi-node-details")).toBeDefined();
    expect(host.showDetails).not.toHaveBeenCalled();
    expect(host.navigate).not.toHaveBeenCalled();
    expect(host.params.get("kube-details") ?? "").toBe("");

    fireEvent.click(rowOf(DEV_CLUSTER));

    const row = within(screen.getByTestId("capi-tree-details"))
      .getAllByTestId("capi-node-fact")
      .find((fact) => fact.querySelector("[data-drawer-item-name]")?.textContent === "In Freelens");
    const link = row?.querySelector("a");

    expect(link?.textContent).toBe(`DevCluster ${HEALTHY}-8fgcf`);
    expect(link?.getAttribute("href")).toBe(
      `?kube-details=${encodeURIComponent(`/apis/test/DevCluster/${HEALTHY}/${HEALTHY}-8fgcf`)}`,
    );

    // The link opens the details of the host over those of the node, and the click stops at it.
    fireEvent.click(link as HTMLAnchorElement);
    expect(host.navigate).toHaveBeenCalledWith(link?.getAttribute("href"));
    expect(screen.getByTestId("capi-tree-details")).toBeDefined();
  });

  it("of the root are those of a Cluster, from the read of the tree, without their row Tree", async () => {
    await opened(ROOT);

    expect(drawerTitle()).toBe("Cluster: freelens-capi-healthy");
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(screen.queryByTestId("capi-details-section-tree")).toBeNull();
    expect(screen.queryByTestId("capi-details-open-tree")).toBeNull();
  });

  it("close on the icon of the drawer, and give the focus back to the tree once the row of the node is in view", async () => {
    const { params } = await opened();

    fireEvent.click(rowOf(DEV_CLUSTER));

    const close = screen.getByTestId("capi-tree-details-close");

    // The press gives the focus to the icon, which is in the details.
    fireEvent.mouseDown(close);
    close.focus();
    fireEvent.click(close);

    expect(params.details.get()).toBe("");
    expect(screen.queryByTestId("capi-tree-details")).toBeNull();
    expect(lastTable().selectedItemId).toBe(DEV_CLUSTER);
    expect(document.activeElement).not.toBe(tree());

    layOut(5 * ROW_HEIGHT);
    nextFrame();

    expect(lastTable().selectedItemId).toBeUndefined();
    expect(document.activeElement).toBe(tree());
    expect(tree().getAttribute("aria-activedescendant")).toBe(rowDomId(DEV_CLUSTER));
  });

  it("close on Escape, through the listener of the drawer on the window, with the focus back on the tree", async () => {
    const { params } = await opened(DEV_CLUSTER);

    layOut(5 * ROW_HEIGHT);
    nextFrame();
    escapeIn(window);

    expect(params.details.get()).toBe("");
    nextFrame();
    expect(document.activeElement).toBe(tree());
  });

  it("close on a click outside, with the focus back on the tree when the click leaves it on the body, and kept on the search after a click on it", async () => {
    const { params } = await opened();

    layOut(5 * ROW_HEIGHT);
    fireEvent.click(rowOf(DEV_CLUSTER));
    (document.activeElement as HTMLElement | null)?.blur();

    const title = screen.getByTestId("capi-tree-title");

    fireEvent.mouseDown(title);
    fireEvent.click(title);
    expect(params.details.get()).toBe("");
    nextFrame();
    expect(document.activeElement).toBe(tree());

    fireEvent.click(rowOf(DEV_CLUSTER));
    nextFrame();

    const input = search();

    fireEvent.mouseDown(input);
    input.focus();
    fireEvent.click(input);
    expect(params.details.get()).toBe("");
    nextFrame();
    expect(document.activeElement).toBe(input);
  });

  it("say that a value that names no node names none, as written, and that a node is not in the tree, or no longer", async () => {
    await opened("not-a-node");

    expect(drawerTitle()).toBe("Details");
    expect(screen.getByTestId("capi-tree-details-invalid").textContent).toBe(
      'The address names no object: the value of details is "not-a-node", which is not <group>/<Kind>/<name>, or <group>/<Kind>/<namespace>/<name> for a class in another namespace.',
    );
    cleanup();

    const params = paramsOf(ADDRESS, "cluster.x-k8s.io/Machine/none");
    const built = host.builtStores.length;

    render(pageOf(params));
    await settle();
    expect(screen.getByTestId("capi-tree-details-absent").textContent).toBe(
      "No such object is in the tree of the Cluster freelens-capi-healthy/freelens-capi-healthy, which was read: Machine none.",
    );

    // A Machine that was in the tree goes, while its details are open.
    act(() => params.details.set(OTHER_MACHINE));
    expect(drawerTitle()).toBe(`Machine: ${HEALTHY}-md-0-m9x7h-m5gtb-5pzv9`);

    const machines = ownStore("Machine", built);

    act(() => {
      runInAction(() =>
        machines.items.replace(
          machines.items.filter((machine) => machine.getName() !== `${HEALTHY}-md-0-m9x7h-m5gtb-5pzv9`),
        ),
      );
    });
    expect(screen.getByTestId("capi-tree-details-absent").textContent).toBe(
      `No such object is in the tree of the Cluster freelens-capi-healthy/freelens-capi-healthy any longer: Machine ${HEALTHY}-md-0-m9x7h-m5gtb-5pzv9 was there, and is gone.`,
    );
  });
});

describe("the search (P15)", () => {
  it("is the search of the host with autoFocus false, says how many nodes match, and an Escape in it clears its words", async () => {
    await opened();

    const input = search();
    const before = rowIds();

    expect(input.dataset.autofocus).toBe("false");
    expect(document.activeElement).not.toBe(input);

    fireEvent.change(input, { target: { value: "2xxxg" } });
    expect(screen.getByTestId("capi-tree-matches").textContent).toBe("3 nodes match");
    expect(rowIds()).toEqual([ROOT, WORKERS, DEPLOYMENT, MACHINE_SET, MACHINE, DEV_MACHINE, CONFIG]);

    escapeIn(input);
    expect(input.value).toBe("");
    expect(screen.queryByTestId("capi-tree-matches")).toBeNull();
    expect(rowIds()).toEqual(before);
  });

  it("closes, on an Escape in it with no words, the details of the host while kube-details holds a value, else the details of the node", async () => {
    const { params } = await opened(DEV_CLUSTER);

    runInAction(() => host.params.set("kube-details", "/apis/infrastructure.cluster.x-k8s.io/v1beta2/devclusters/x"));
    escapeIn(search());

    expect(host.hideDetails).toHaveBeenCalledTimes(1);
    expect(params.details.get()).toBe(DEV_CLUSTER);
    expect(screen.getByTestId("capi-tree-details")).toBeDefined();

    escapeIn(search());

    expect(host.hideDetails).toHaveBeenCalledTimes(1);
    expect(params.details.get()).toBe("");
    expect(screen.queryByTestId("capi-tree-details")).toBeNull();
  });
});

describe("the reads of the page (P6, P23)", () => {
  it("publish no source of the mounted page, and the panel of a Cluster in the details of the host reads with stores of its own beside it", async () => {
    await opened();

    expect(mountedPageSource()).toBeUndefined();

    const page = host.builtStores.length;
    const cluster = objectsOfStates(["healthy"]).find((object) => object.kind === "Cluster");

    render(
      <ClusterPanel
        object={cluster as unknown as Cluster}
        extension={EXTENSION}
        openCluster={vi.fn()}
        openTree={vi.fn()}
      />,
    );
    await settle();

    expect(host.builtStores.length).toBeGreaterThan(page);
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
  });

  it("read every store of the tree again on the refresh, disabled with the tooltip that says why until the first load of every kind has ended", async () => {
    serveTree(objectsOfStates(["healthy"]));

    const built = host.builtStores.length;
    const release = host.deferLoads();

    render(pageOf(paramsOf()));
    await settle();

    const refresh = () => screen.getByTestId("capi-tree-refresh");

    expect(refresh().getAttribute("role")).toBe("button");
    expect(refresh().getAttribute("aria-label")).toBe("Read the tree again");
    expect(refresh().dataset.disabled).toBe("true");
    expect(refresh().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("capi-tree-refresh-tooltip").textContent).toBe(REFRESH_WAIT);

    const stores = host.builtStores.slice(built) as OwnStore[];
    const loads = () => stores.map((store) => store.loadAll.mock.calls.length);
    const first = loads();

    fireEvent.click(refresh());
    expect(loads()).toEqual(first);

    release();
    await settle();

    expect(refresh().dataset.disabled).toBeUndefined();
    expect(refresh().getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByTestId("capi-tree-refresh-tooltip").textContent).toBe("Read the tree again");

    fireEvent.click(refresh());
    await settle();

    expect(loads()).toEqual(first.map((count) => count + 1));
    expect(rowIds()[0]).toBe(ROOT);
  });

  it("disable the refresh again, with the tree shown, while the first load of a kind of a provider that a new Machine names runs", async () => {
    // healthy, and then a Machine of its Cluster that names an infrastructure machine of a kind that no other object
    // names, ExampleMachine, which arrives once the first loads have ended, as a watch brings it.
    const kind = "ExampleMachine";
    const examples = {
      kind,
      apiVersionWithGroup: "infrastructure.example.test/v1beta2",
      apiBase: "/apis/infrastructure.example.test/v1beta2/examplemachines",
      isNamespaced: true,
    };
    const built = host.builtStores.length;

    serveTree(objectsOfStates(["healthy"]));
    runInAction(() => {
      host.crdStore.items = [
        ...host.crdStore.items,
        definition("examplemachines.infrastructure.example.test", "infrastructure.example.test", kind, {
          "cluster.x-k8s.io/v1beta2": "v1beta2",
        }),
      ];
    });
    host.registerApi(examples);
    host.cluster.set(examples.apiBase, { items: [], failures: [] });
    render(pageOf(paramsOf()));
    await settle();

    const refresh = () => screen.getByTestId("capi-tree-refresh");

    expect(refresh().dataset.disabled).toBeUndefined();

    const release = host.deferLoads();
    const machines = ownStore("Machine", built);
    const added = changed("Machine", `${HEALTHY}-md-0-m9x7h-m5gtb-2xxxg`, (object) => {
      object.metadata.name = `${HEALTHY}-added`;
      object.spec.infrastructureRef = { apiGroup: "infrastructure.example.test", kind, name: "added" };
    });

    act(() => {
      runInAction(() => machines.items.push(added));
    });
    await settle();

    expect(ownStore(kind, built)).toBeDefined();
    expect(screen.getByTestId("capi-tree")).toBeDefined();
    expect(refresh().dataset.disabled).toBe("true");
    expect(screen.getByTestId("capi-tree-refresh-tooltip").textContent).toBe(REFRESH_WAIT);

    release();
    await settle();

    expect(refresh().dataset.disabled).toBeUndefined();
  });
});
