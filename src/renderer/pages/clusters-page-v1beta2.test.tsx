// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { CAPTURE, fixtureSet, ofKind } from "../../../test/fixture-sets";
import { host, Renderer } from "../../../test/freelens-extensions";
import { APIS, DEFINITIONS, definition, FakeStore, hostObject, serve } from "../../../test/host-stores";
import { indexContext } from "../../common/views/context";
import markStyles from "../components/marks.module.scss";
import { ClustersPage, COLUMNS, TABLE_ID } from "./clusters-page-v1beta2";

import type { Renderer as Extensions } from "@freelensapp/extensions";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { ApiName, HostObject } from "../../../test/host-stores";
import type * as Context from "../../common/views/context";

// The indexes of the context, counted where the page builds them.
vi.mock("../../common/views/context", async (importOriginal) => {
  const actual = await importOriginal<typeof Context>();

  return { ...actual, indexContext: vi.fn(actual.indexContext) };
});

// The cases of SPEC-0004, "Tests", "Unit", `clusters-page-v1beta2.test.tsx`: the props that the layout of the host
// gets, the reads through the adapters of the page, the states and their words, and the details that the page opens
// over its list, with their parameter and their focus.
// The layout of the stub records its props and renders the parts where the host calls back into the page; the
// subscription is the host's, which the stub does not run: the test drives the loads through the adapters, as the
// host would.

type LayoutProps = {
  store: Adapter;
  dependentStores: Adapter[];
  items: HostObject[];
  isReady: boolean;
  isSelectable: boolean;
  hasDetailsView?: boolean;
  onDetails?: (cluster: HostObject) => void;
  renderItemMenu: unknown;
  addRemoveButtons: { onRemove?: unknown };
  subscribeStores?: boolean;
  tableId: string;
  renderHeaderTitle: string;
  searchFilters: ((cluster: HostObject) => unknown[])[];
  sortingCallbacks: Record<string, (cluster: HostObject) => unknown>;
  renderTableHeader: unknown[];
  tableProps: Record<string, unknown>;
  customizeHeader?: unknown;
};

interface Adapter {
  api: { kind: string; apiBase: string };
  loadAll(opts: unknown): Promise<unknown>;
  subscribe(opts: unknown): () => void;
}

const layout = Renderer.Component.KubeObjectListLayout;

// The extension, which the registration gives the page.
const EXTENSION = new Renderer.LensExtension({
  name: "@freelensapp/capi-extension",
}) as unknown as Extensions.LensExtension;

// The parameter `details` of the page, as the host gives it: its value in the address of the frame (P6).
function detailsParam(initial = "") {
  const value = observable.box(initial);

  return {
    get: () => value.get(),
    set: vi.fn((next: string) => runInAction(() => value.set(next))),
    clear: () => runInAction(() => value.set("")),
  };
}

// The page as the host renders it, with its parameter, given the extension from its registration.
function pageOf(param = detailsParam()) {
  return (
    <ClustersPage
      params={{ details: param as unknown as Extensions.Navigation.PageParam<string> }}
      extension={EXTENSION}
    />
  );
}

function lastLayout(): LayoutProps {
  const calls = layout.mock.calls;

  return calls[calls.length - 1][0] as unknown as LayoutProps;
}

function adaptersOf(props: LayoutProps): Adapter[] {
  return [props.store, ...props.dependentStores];
}

// A load of every store of the layout, of these namespaces, as the host runs it when it subscribes them.
async function loadEvery(namespaces: string[], onlyKinds?: string[]) {
  const props = lastLayout();

  await act(async () => {
    await Promise.all(
      adaptersOf(props)
        .filter((adapter) => onlyKinds === undefined || onlyKinds.includes(adapter.api.kind))
        .map((adapter) =>
          adapter.loadAll({ namespaces, reqInit: { signal: new AbortController().signal }, onLoadFailure: vi.fn() }),
        ),
    );
  });
}

function select(namespaces: string[], selectedAll = false) {
  runInAction(() => {
    host.context.contextNamespaces = namespaces;
    host.context.allNamespaces = selectedAll ? namespaces : [...new Set([...namespaces, "default"])];
    host.context.hasSelectedAll = selectedAll;
  });
}

// The objects of a state of the fixtures in the stores of the host, as it holds them.
function hold(stores: Partial<Record<ApiName, FakeStore>>, states: string[]) {
  const objects = states.flatMap((state) => fixtureSet(state));
  const kinds: Record<string, ApiName> = {
    Cluster: "clusters",
    Machine: "machines",
    MachineSet: "machineSets",
    MachineDeployment: "machineDeployments",
    MachinePool: "machinePools",
    KubeadmControlPlane: "kubeadmControlPlanes",
    MachineHealthCheck: "healthChecks",
    ClusterClass: "clusterClasses",
  };

  for (const [kind, name] of Object.entries(kinds)) {
    stores[name]?.set(
      ofKind<KubeObject>(objects, kind).map((object) => hostObject(object as unknown as Record<string, unknown>)),
    );
  }
}

const refused = (namespace: string) =>
  new Error("Failed to load /apis/cluster.x-k8s.io/v1beta2/clusters", {
    cause: {
      kind: "Status",
      code: 403,
      message: `clusters.cluster.x-k8s.io is forbidden: cannot list resource "clusters" in the namespace "${namespace}"`,
    },
  });

beforeEach(() => {
  host.reset();
  layout.mockClear();
  vi.setSystemTime(CAPTURE);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the list layout of the page (P5, P19; SPEC-0001, A7)", () => {
  it("gets no selection, no menu of the host but an empty cell of the menu in each row, and the details of the extension on a click", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"]);

    const props = lastLayout();
    const [row] = screen.getAllByTestId("host-row");

    expect(props.tableId).toBe(TABLE_ID);
    expect(props.tableId).toBe("clusterApiClustersTable");
    expect(props.renderHeaderTitle).toBe("Workload Clusters");
    expect(props.isSelectable).toBe(false);
    // The rows keep the cell of the menu that the header always has, empty, so that the columns line up.
    expect(props.renderItemMenu).toBeTypeOf("function");
    expect((props.renderItemMenu as (item: HostObject) => unknown)(props.items[0])).toBeNull();
    expect(within(row).getByTestId("host-row-menu").childNodes).toHaveLength(0);
    expect(within(screen.getByTestId("host-header")).getByTestId("host-head-menu")).toBeDefined();
    // A click on a row opens the details of the extension: the layout keeps its rows clickable, and calls the page,
    // which opens no details of the host (P13, P15).
    expect(props.hasDetailsView).toBeUndefined();
    expect(props.onDetails).toBeTypeOf("function");
    expect(props.renderTableHeader).toBe(COLUMNS);
  });

  it("gets a title for each column in a flat badge of the host that never expands, whose tooltip carries it whole", () => {
    const titles = [
      "Name",
      "Namespace",
      "Control plane",
      "Workers",
      "Version",
      "ClusterClass",
      "Activity",
      "Condition",
      "Status",
      "Age",
    ];

    expect(COLUMNS.map(({ title }) => [title.type, title.props])).toEqual(
      titles.map((title) => [
        Renderer.Component.WithTooltip,
        { expandable: false, "data-testid": "capi-clusters-head", children: title },
      ]),
    );
  });

  it("gets addRemoveButtons with an own key onRemove that holds undefined, which the layout spreads over its own", () => {
    serve();
    render(pageOf());

    const props = lastLayout();

    expect(Object.hasOwn(props.addRemoveButtons, "onRemove")).toBe(true);
    expect(props.addRemoveButtons.onRemove).toBeUndefined();
  });

  it("gets as its stores the adapters of the Clusters and of the context, the operator among them, subscribed", () => {
    serve();
    render(pageOf());

    const props = lastLayout();

    expect(props.store.api.kind).toBe("Cluster");
    expect(props.dependentStores.map((adapter) => adapter.api.kind)).toEqual([
      "Machine",
      "MachineSet",
      "MachineDeployment",
      "MachinePool",
      "KubeadmControlPlane",
      "MachineHealthCheck",
      "ClusterClass",
      "CoreProvider",
    ]);
    expect(props.subscribeStores).toBeUndefined();
    // The store of definitions is only read: the host subscribes it itself (P19).
    expect(adaptersOf(props).some((adapter) => adapter.api.kind === "CustomResourceDefinition")).toBe(false);
  });

  it("loads and subscribes nothing itself", () => {
    const stores = serve();

    render(pageOf());

    for (const store of Object.values(stores)) {
      expect(store?.loadAll).not.toHaveBeenCalled();
      expect(store?.subscribe).not.toHaveBeenCalled();
    }
  });

  it("gives one adapter to a store that two references name", async () => {
    const stores = serve();

    hold(stores, ["healthy", "paused"]);
    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused"]);

    const props = lastLayout();

    expect(props.items).toHaveLength(2);
    expect(adaptersOf(props).filter((adapter) => adapter.api.kind === "KubeadmControlPlane")).toHaveLength(1);
  });

  it("searches the fields that getSearchFields() of the host gives and the words that the columns show (P14)", async () => {
    const stores = serve();

    hold(stores, ["paused"]);
    select(["freelens-capi-paused"]);
    render(pageOf());
    await loadEvery(["freelens-capi-paused"]);

    const props = lastLayout();
    const [cluster] = props.items;
    const words = props.searchFilters.flatMap((filter) => filter(cluster));

    expect(words).toEqual(expect.arrayContaining(cluster.getSearchFields()));
    expect(words).toEqual(expect.arrayContaining(["freelens-capi-paused", "Healthy", "stale", "Paused", "v1.37.0"]));
    expect(words.some((word) => typeof word === "string" && word.startsWith("cluster.x-k8s.io/cluster-name="))).toBe(
      true,
    );
  });
});

describe("the rows of the list (P7 to P12)", () => {
  it("show each Cluster of the namespaces loaded with the marks of the status model", async () => {
    const stores = serve();

    hold(stores, ["healthy", "machine-pools", "deleting"]);
    select(["freelens-capi-healthy", "freelens-capi-machine-pools", "freelens-capi-deleting"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy", "freelens-capi-machine-pools", "freelens-capi-deleting"]);

    const rows = screen.getAllByTestId("host-row");
    const health = rows.map((row) => within(row).getByTestId("capi-cluster-health").textContent);
    const activities = rows.map((row) =>
      within(row)
        .queryAllByTestId("capi-cluster-activity")
        .map((mark) => mark.textContent),
    );

    expect(health).toEqual(["Healthy", "Degraded", "N/A"]);
    expect(activities[0]).toEqual(["Idle"]);
    expect(activities[2][0]).toMatch(/^Deleting /);
    expect(within(rows[1]).getByTestId("capi-cluster-health").getAttribute("data-tone")).toBe("info");
    expect(within(rows[0]).getByTestId("capi-cluster-control-plane").textContent).toBe("1/1");
    expect(within(rows[0]).getByTestId("capi-cluster-status").textContent).toBe("Available");
  });

  it("show the spinner in the place of the marks whose inputs are still loading, never a mark computed without them", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"], ["Cluster"]);

    const [row] = screen.getAllByTestId("host-row");

    expect(within(row).getAllByTestId("host-cell-spinner")).toHaveLength(2);
    expect(within(row).queryByTestId("capi-cluster-health")).toBeNull();
  });

  it("keep each cell on one line, cut with an ellipsis, with every mark of the cell in its tooltip (P12)", async () => {
    const stores = serve();
    const states = ["rolling-out", "paused", "machine-pool-without-machines"];
    const namespaces = ["freelens-capi-rolling-out", "freelens-capi-paused", "freelens-capi-pool-without-machines"];

    hold(stores, states);
    select(namespaces);
    render(pageOf());
    await loadEvery(namespaces);

    const rows = screen.getAllByTestId("host-row");
    const rowOf = (name: string) =>
      rows.find((row) => within(row).getByTestId("capi-cluster-name").textContent === name) as HTMLElement;
    const tooltip = (row: HTMLElement, testId: string) => within(row).getByTestId(`${testId}-tooltip`).textContent;

    // No content of a cell expands on a click, which would wrap it, and the marks are in a cell of one line.
    for (const row of rows) {
      expect(row.querySelectorAll('[data-expandable="true"]')).toHaveLength(0);
      expect(within(row).getByTestId("capi-cluster-activities").className).toBe(markStyles.cell);
      expect(within(row).getByTestId("capi-cluster-condition").className).toBe(markStyles.cell);
    }
    expect(tooltip(rowOf("freelens-capi-rolling-out"), "capi-cluster-activities")).toBe(
      [
        "Provisioning, for 2025-12-31T23:59:40Z, since 2025-12-31T23:59:40Z",
        "Rolling out, for 2025-12-31T23:59:40Z, since 2025-12-31T23:59:40Z",
        "Scaling down, for 2025-12-31T23:59:43Z, since 2025-12-31T23:59:43Z",
      ].join(""),
    );
    expect(tooltip(rowOf("freelens-capi-paused"), "capi-cluster-condition")).toBe(
      "HealthyStale: Paused, since 2025-12-31T23:59:45Z",
    );
    expect(tooltip(rowOf("freelens-capi-pool-without-machines"), "capi-cluster-condition")).toBe(
      "Degraded1 MachinePool of unknown health",
    );

    // The marks and the note are boxes of the line of the cell, which its stylesheet lines up at the middle.
    const condition = within(rowOf("freelens-capi-pool-without-machines")).getByTestId("capi-cluster-condition");

    expect([...condition.children].map((child) => child.className.split(" ")[0])).toEqual([
      markStyles.mark,
      markStyles.note,
    ]);
  });

  it("sort the counters by the available then the desired, the class by name then namespace, and the age as the host", async () => {
    const stores = serve();
    const namespaces = ["freelens-capi-healthy", "freelens-capi-scaling-up"];

    hold(stores, ["healthy", "scaling-up"]);
    select(namespaces);
    render(pageOf());
    await loadEvery(namespaces, ["Cluster"]);

    const props = lastLayout();
    const [healthy, scalingUp] = props.items;

    expect(props.sortingCallbacks.controlPlane(scalingUp)).toEqual([1, 3]);
    expect(props.sortingCallbacks.workers(scalingUp)).toEqual([1, 2]);
    expect(props.sortingCallbacks.clusterClass(healthy)).toEqual(["quick-start", "freelens-capi-healthy"]);
    // The rows whose marks still show the spinner sort after every other (P28).
    expect(props.sortingCallbacks.activity(healthy)).toBe(Number.MAX_SAFE_INTEGER);
    expect(props.sortingCallbacks.condition(healthy)).toBe(Number.MAX_SAFE_INTEGER);
    // The lists of the host sort the age by the negative of the creation, so the arrow means the same.
    expect(props.sortingCallbacks.age(healthy)).toBe(-healthy.getCreationTimestamp());
  });

  it("sort the activities and the health worst first (P28)", async () => {
    const stores = serve();
    const namespaces = ["freelens-capi-healthy", "freelens-capi-provisioning", "freelens-capi-upgrading"];

    hold(stores, ["healthy", "provisioning", "upgrading"]);
    select(namespaces);
    render(pageOf());
    await loadEvery(namespaces);

    const props = lastLayout();
    const order = (column: string) =>
      [...props.items]
        .sort((one, other) => {
          const a = props.sortingCallbacks[column](one) as number;
          const b = props.sortingCallbacks[column](other) as number;

          return a - b;
        })
        .map((cluster) => cluster.getName());

    expect(order("condition")).toEqual([
      "freelens-capi-provisioning",
      "freelens-capi-upgrading",
      "freelens-capi-healthy",
    ]);
    expect(order("activity").at(-1)).toBe("freelens-capi-healthy");
  });
});

describe("the reads of the page (P19)", () => {
  it("pass isReady false from the mount until the first load of the Clusters ends, with a store loaded before", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    stores.clusters?.markLoaded();
    select(["freelens-capi-healthy"]);
    render(pageOf());

    expect(lastLayout().isReady).toBe(false);
    expect(screen.getByTestId("host-spinner")).toBeDefined();

    await loadEvery(["freelens-capi-healthy"]);

    expect(lastLayout().isReady).toBe(true);
    expect(screen.getAllByTestId("host-row")).toHaveLength(1);
  });

  it("show no count in the header until the list is ready, never 0 items, the marks of the host kept", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    stores.clusters?.markLoaded();
    select(["freelens-capi-healthy"]);
    render(pageOf());

    const header = () => screen.getByTestId("host-header");

    expect(header().textContent).not.toMatch(/\d+ items?/);
    expect(within(header()).queryByTestId("capi-clusters-not-counted")).toBeNull();
    expect(within(header()).getByTestId("host-mark")).toBeDefined();

    await loadEvery(["freelens-capi-healthy"]);

    expect(header().textContent).toMatch(/^Workload Clusters1 item/);
  });

  it("build the indexes of the context once for each change of what they read, not at a render or a tick that changes none", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(CAPTURE);

    const stores = serve();

    hold(stores, ["provisioning"]);
    select(["freelens-capi-provisioning"]);
    render(pageOf());
    await loadEvery(["freelens-capi-provisioning"]);

    const built = vi.mocked(indexContext).mock.calls.length;
    const tone = () =>
      within(screen.getByTestId("host-row")).getByTestId("capi-cluster-health").getAttribute("data-tone");

    // The time that the result of the Cluster names comes: the page renders again, with nothing that the indexes read
    // changed.
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    expect(tone()).toBe("warning");
    expect(vi.mocked(indexContext).mock.calls.length).toBe(built);

    // A Machine of the store changes its version: the indexes are built again, once.
    act(() => {
      const [machine, ...others] = stores.machines?.items ?? [];

      stores.machines?.set([
        hostObject({ ...machine, metadata: { ...machine.metadata, resourceVersion: "2" } } as Record<string, unknown>),
        ...others,
      ]);
    });
    expect(vi.mocked(indexContext).mock.calls.length).toBe(built + 1);
  });

  it("send the GET of a definition when the store of definitions fails after the page mounted (P3)", async () => {
    const stores = serve();

    host.crdGet.mockResolvedValue(DEFINITIONS[1]);
    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"]);

    expect(host.crdGet).not.toHaveBeenCalled();

    await act(async () => {
      runInAction(() => {
        host.crdStore.items = [];
        host.crdStore.failedLoading = true;
      });
    });

    // The definitions of the kinds of a provider that the Cluster names, its control plane and its infrastructure
    // cluster, named from the APIs that the host registered from the discovery.
    expect(host.crdGet.mock.calls).toEqual([
      ["kubeadmcontrolplanes.controlplane.cluster.x-k8s.io"],
      ["devclusters.infrastructure.cluster.x-k8s.io"],
    ]);
  });

  it("list no row of a namespace that the filter adds until the load that reads it ends, with the spinner and no row", async () => {
    const stores = serve();

    hold(stores, ["healthy", "paused"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"]);

    expect(lastLayout().items.map((cluster) => cluster.getNs())).toEqual(["freelens-capi-healthy"]);

    // The store still holds the Clusters of the namespace of paused, from an earlier read that nothing has watched.
    act(() => select(["freelens-capi-paused"]));

    expect(lastLayout().items).toEqual([]);

    stores.clusters && (stores.clusters.holdLoads = true);

    let load: Promise<unknown> = Promise.resolve();

    await act(async () => {
      load = lastLayout().store.loadAll({
        namespaces: ["freelens-capi-paused"],
        reqInit: { signal: new AbortController().signal },
        onLoadFailure: vi.fn(),
      });
    });
    expect(lastLayout().isReady).toBe(false);
    expect(screen.getByTestId("host-spinner")).toBeDefined();

    await act(async () => {
      stores.clusters?.finishLoads();
      await load;
    });

    expect(lastLayout().items.map((cluster) => cluster.getNs())).toEqual(["freelens-capi-paused"]);
  });

  it("count as loaded a namespace that the filter adds while every namespace stays selected, after a load over the whole cluster that the host follows", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy", "freelens-capi-paused-before"], true);
    runInAction(() => {
      host.context.isLoadingAll = () => true;
      host.context.isGlobalWatchEnabled = () => true;
    });
    render(pageOf());
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused-before"]);

    // A namespace is created, every namespace stays selected, and the watch over the whole cluster brings its Cluster.
    act(() => select(["freelens-capi-healthy", "freelens-capi-paused-before", "freelens-capi-paused"], true));
    act(() => {
      stores.clusters?.set([
        ...(stores.clusters?.items ?? []),
        ...ofKind<KubeObject>(fixtureSet("paused"), "Cluster").map((object) =>
          hostObject(object as unknown as Record<string, unknown>),
        ),
      ]);
    });

    expect(
      lastLayout()
        .items.map((cluster) => cluster.getNs())
        .sort(),
    ).toEqual(["freelens-capi-healthy", "freelens-capi-paused"]);
  });

  it("mount the layout again, keyed by the set of its stores, when the host registers an API later, with the rows kept and the details with the stores of the page", async () => {
    const stores = serve([
      "clusters",
      "machines",
      "machineSets",
      "machineDeployments",
      "machinePools",
      "kubeadmControlPlanes",
      "healthChecks",
      "clusterClasses",
    ]);
    const built = host.builtStores.length;

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf(detailsParam("freelens-capi-healthy/freelens-capi-healthy")));
    await loadEvery(["freelens-capi-healthy"]);

    expect(lastLayout().dependentStores.map((adapter) => adapter.api.kind)).not.toContain("CoreProvider");
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();

    const mounts = host.layoutMounts;

    act(() => host.registerApi(APIS.coreProviders, new FakeStore(APIS.coreProviders)));

    const props = lastLayout();

    // One new mount, in which the host subscribes the new store (kube-object-list-layout.tsx:131-161).
    expect(host.layoutMounts).toBe(mounts + 1);
    expect(props.dependentStores.map((adapter) => adapter.api.kind)).toContain("CoreProvider");
    expect(props.items.map((cluster) => cluster.getName())).toEqual(["freelens-capi-healthy"]);
    expect(props.isReady).toBe(true);
    // The details stay with the stores of the page, which read their namespace: no spinner, and no store of their own
    // (P19, P31).
    expect(screen.queryByTestId("capi-details-loading")).toBeNull();
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(host.builtStores.length).toBe(built);
  });

  it("mount the layout again with a store that the host replaces under the same base, which it reads anew", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"]);

    const spinners = () => within(screen.getByTestId("host-row")).queryAllByTestId("host-cell-spinner");
    const mounts = host.layoutMounts;
    const replacing = new FakeStore(APIS.machines);

    expect(spinners()).toHaveLength(0);

    // The host registers the APIs of the definitions again, each with a new store, as when its store of definitions
    // fails (setup-auto-crd-api-creations.injectable.ts:45-54; api-manager.ts:67-75).
    replacing.set([...(stores.machines?.items ?? [])]);
    act(() => host.registerApi({ ...APIS.machines }, replacing));

    expect(host.layoutMounts).toBe(mounts + 1);
    expect(spinners()).toHaveLength(2);

    await loadEvery(["freelens-capi-healthy"], ["Machine"]);

    expect(replacing.loadAll).toHaveBeenCalledTimes(1);
    expect(spinners()).toHaveLength(0);
  });

  it("forget what a store loaded when it leaves the set of the page, and read it anew when it comes back", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"]);

    const spinners = () => within(screen.getByTestId("host-row")).queryAllByTestId("host-cell-spinner");

    expect(spinners()).toHaveLength(0);

    // The host drops the API of the CoreProviders, then registers it again with the store it had.
    act(() => runInAction(() => host.apis.delete(APIS.coreProviders.apiBase)));
    expect(spinners()).toHaveLength(0);
    act(() => host.registerApi(APIS.coreProviders, stores.coreProviders));

    // The objects that nothing watched meanwhile wait for the next load of the store (P19).
    expect(spinners()).toHaveLength(2);
  });
});

describe("the details of the extension (P6, P13, P15)", () => {
  const ADDRESS = "freelens-capi-healthy/freelens-capi-healthy";

  // The page with the Clusters of healthy and paused read, and the parameter of its details.
  async function opened(value = "") {
    const stores = serve();
    const param = detailsParam(value);

    hold(stores, ["healthy", "paused"]);
    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(pageOf(param));
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused"]);
    return param;
  }

  function nameOf(address: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>("[data-capi-cluster]")].find(
      (button) => button.dataset.capiCluster === address,
    );

    if (found === undefined) throw new Error(`No name ${address}`);
    return found;
  }

  function title(): string | null {
    return within(screen.getByTestId("capi-cluster-details")).getByTestId("host-drawer-title").textContent;
  }

  it("make the name of a row a button, which opens the details of its Cluster and stops at it", async () => {
    const param = await opened();
    const name = nameOf(ADDRESS);

    expect(name.tagName).toBe("BUTTON");
    expect(name.type).toBe("button");
    expect(name.textContent).toBe("freelens-capi-healthy");
    expect(screen.queryByTestId("capi-cluster-details")).toBeNull();

    fireEvent.click(name);

    expect(param.get()).toBe(ADDRESS);
    // The click stops at the name: the row, which opens the details too, does not set the address a second time.
    expect(param.set).toHaveBeenCalledTimes(1);
    expect(title()).toBe("Cluster: freelens-capi-healthy");
    expect(screen.getByTestId("capi-details-section-metadata")).toBeDefined();
  });

  it("open the details of a Cluster on a click on its row, and show another Cluster in the same details on another", async () => {
    const param = await opened();
    const rows = screen.getAllByTestId("host-row");

    fireEvent.click(rows[0]);
    expect(param.get()).toBe(ADDRESS);
    expect(title()).toBe("Cluster: freelens-capi-healthy");

    fireEvent.click(rows[1]);
    expect(param.get()).toBe("freelens-capi-paused/freelens-capi-paused");
    expect(title()).toBe("Cluster: freelens-capi-paused");
    expect(screen.getAllByTestId("capi-cluster-details")).toHaveLength(1);
  });

  it("open the Cluster that the parameter names, and clear the parameter when the details close", async () => {
    const param = await opened(ADDRESS);

    expect(title()).toBe("Cluster: freelens-capi-healthy");
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();

    fireEvent.click(screen.getByTestId("capi-cluster-details-close"));

    expect(param.get()).toBe("");
    expect(screen.queryByTestId("capi-cluster-details")).toBeNull();
  });

  it("say that a value that is not <namespace>/<name> names no Cluster, as written, and read nothing for it", async () => {
    const built = host.builtStores.length;

    await opened("not-a-cluster");

    expect(title()).toBe("Cluster");
    expect(screen.getByTestId("capi-details-invalid").textContent).toBe(
      'The address names no Cluster: the value of details is "not-a-cluster", which is not <namespace>/<name>.',
    );
    expect(host.builtStores.length).toBe(built);
  });

  it("read the Cluster of a namespace that the page does not read through stores of its own (P31)", async () => {
    const built = host.builtStores.length;

    // The stores of the details are theirs, not of the frame, whose one store the case of P34 counts.
    onTestFinished(() => {
      host.builtStores.splice(built);
    });

    for (const api of Object.values(APIS)) {
      host.cluster.set(api.apiBase, {
        items: fixtureSet("upgrading")
          .filter((object) => object.kind === api.kind)
          .map((object) => hostObject(object as unknown as Record<string, unknown>)),
        failures: [],
      });
    }
    await opened("freelens-capi-upgrading/freelens-capi-upgrading");
    await act(async () => undefined);

    expect(title()).toBe("Cluster: freelens-capi-upgrading");
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(host.builtStores.length).toBeGreaterThan(built);
    // The list does not change: it lists the Clusters of the namespaces of the filter alone.
    expect(lastLayout().items.map((cluster) => cluster.getName())).toEqual([
      "freelens-capi-healthy",
      "freelens-capi-paused",
    ]);
  });

  it("give the focus back to the name on the close icon", async () => {
    await opened();
    nameOf(ADDRESS).focus();
    fireEvent.click(nameOf(ADDRESS));

    const close = screen.getByTestId("capi-cluster-details-close");

    // The press gives the focus to the icon, which is in the details.
    fireEvent.mouseDown(close);
    close.focus();
    fireEvent.click(close);

    expect(screen.queryByTestId("capi-cluster-details")).toBeNull();
    expect(document.activeElement).toBe(nameOf(ADDRESS));
  });

  it("give the focus back to the name of the Cluster whose details close on Escape, also from another control", async () => {
    const paused = "freelens-capi-paused/freelens-capi-paused";

    await opened();
    // The details of the second row, while the focus is on the name of the first.
    fireEvent.click(nameOf(paused));
    nameOf(ADDRESS).focus();

    fireEvent.keyDown(window, { code: "Escape", key: "Escape" });

    expect(screen.queryByTestId("capi-cluster-details")).toBeNull();
    expect(document.activeElement).toBe(nameOf(paused));
  });

  it("give the focus back to the name on a click outside that leaves the focus on the body", async () => {
    await opened();
    fireEvent.click(nameOf(ADDRESS));
    (document.activeElement as HTMLElement | null)?.blur();

    const heading = within(screen.getByTestId("host-header")).getByRole("heading");

    fireEvent.mouseDown(heading);
    fireEvent.click(heading);

    expect(screen.queryByTestId("capi-cluster-details")).toBeNull();
    expect(document.activeElement).toBe(nameOf(ADDRESS));
  });

  it("keep the focus on the search after a click on it, which closes the details, and the search takes what is typed", async () => {
    await opened();
    fireEvent.click(nameOf(ADDRESS));

    const search = screen.getByTestId("host-search") as HTMLInputElement;

    fireEvent.mouseDown(search);
    search.focus();
    fireEvent.click(search);

    expect(screen.queryByTestId("capi-cluster-details")).toBeNull();
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: "paused" } });

    expect(search.value).toBe("paused");
    expect(document.activeElement).toBe(search);
  });

  it("give the details the indexes of the page, which a render of the details does not build again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(CAPTURE);

    const stores = serve();

    hold(stores, ["provisioning"]);
    select(["freelens-capi-provisioning"]);
    render(pageOf(detailsParam("freelens-capi-provisioning/freelens-capi-provisioning")));
    await loadEvery(["freelens-capi-provisioning"]);

    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();

    const built = vi.mocked(indexContext).mock.calls.length;

    // The time that the result of the Cluster names comes: the list and the details render again, with nothing that
    // the indexes read changed.
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    expect(screen.getByTestId("capi-details-tone").textContent).toMatch(/In the tone of a warning/);
    expect(vi.mocked(indexContext).mock.calls.length).toBe(built);
  });

  it("show the error page in the details alone when they throw, and leave the list", async () => {
    const metadata = Renderer.Component.KubeObjectMeta.getMockImplementation();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Renderer.Component.KubeObjectMeta.mockImplementation(() => {
      throw new TypeError("the metadata failed");
    });
    onTestFinished(() => {
      if (metadata !== undefined) Renderer.Component.KubeObjectMeta.mockImplementation(metadata);
    });
    await opened(ADDRESS);

    expect(
      within(screen.getByTestId("capi-cluster-details")).getByText("TypeError: the metadata failed"),
    ).toBeDefined();
    expect(screen.getAllByTestId("host-row")).toHaveLength(2);
  });
});

describe("the states of the page (P20, P25, P26, P34)", () => {
  it("say, under the title alone, that the host is checking, that Cluster API is not installed, or is older", () => {
    const { unmount } = render(pageOf());

    expect(screen.getByTestId("capi-clusters-checking").textContent).toBe(
      "Checking whether this cluster serves Cluster API",
    );
    expect(screen.getByRole("heading").textContent).toBe("Workload Clusters");
    expect(screen.queryByTestId("host-layout")).toBeNull();
    unmount();

    runInAction(() => {
      host.crdStore.isLoaded = true;
    });
    render(pageOf());
    expect(screen.getByTestId("capi-clusters-not-installed").textContent).toBe(
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
    render(pageOf());
    expect(screen.getByTestId("capi-clusters-older").textContent).toMatch(/serves Clusters at v1beta1 alone/);
    expect(screen.getByTestId("capi-clusters-older").textContent).toMatch(/came with Cluster API v1.11/);
  });

  it("follows when the host registers the API of Clusters after the page rendered", () => {
    runInAction(() => {
      host.crdStore.items = DEFINITIONS;
      host.crdStore.isLoaded = true;
    });
    render(pageOf());
    expect(screen.getByTestId("capi-clusters-checking")).toBeDefined();

    act(() => {
      serve();
    });

    expect(screen.getByTestId("host-layout")).toBeDefined();
  });

  it("say Restricted in the place of the rows, and not counted next to the marks of the host, the header kept", async () => {
    const stores = serve();

    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(pageOf());
    stores.clusters && (stores.clusters.failures = [refused("freelens-capi-healthy"), refused("freelens-capi-paused")]);
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused"], ["Cluster"]);

    expect(screen.getByTestId("capi-notice-list-restricted").textContent).toMatch(
      /You may not list the Clusters of the namespaces that the filter selects/,
    );
    expect(screen.getByTestId("capi-notice-list-restricted").textContent).toMatch(
      /get, list and watch on clusters of cluster.x-k8s.io/,
    );

    const header = screen.getByTestId("host-header");

    expect(within(header).getByRole("heading").textContent).toBe("Workload Clusters");
    expect(within(header).getByTestId("capi-clusters-not-counted").textContent).toBe("not counted");
    expect(within(header).getByTestId("host-mark")).toBeDefined();
    expect(header.textContent).not.toMatch(/\d+ items?/);
  });

  it("say Partial over the list, above the layout, when rows remain", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(pageOf());
    stores.clusters && (stores.clusters.failures = [refused("freelens-capi-paused")]);
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused"]);

    const notice = screen.getByTestId("capi-notice-list-partial");
    const page = screen.getByTestId("capi-clusters-page");

    expect(notice.textContent).toMatch(/The Clusters could not all be read/);
    expect(
      notice.compareDocumentPosition(screen.getByTestId("host-layout")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(page.contains(notice)).toBe(true);
    expect(screen.getAllByTestId("host-row")).toHaveLength(1);
    expect(within(screen.getByTestId("host-header")).queryByTestId("capi-clusters-not-counted")).toBeNull();
  });

  it("say Failed in the place of the rows when every namespace failed, not all refused", async () => {
    const stores = serve();

    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(pageOf());
    stores.clusters &&
      (stores.clusters.failures = [refused("freelens-capi-healthy"), new Error("Failed to load: timeout")]);
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused"], ["Cluster"]);

    expect(screen.getByTestId("capi-notice-list-failed").textContent).toMatch(/The Clusters could not be read/);
    expect(screen.getByTestId("capi-notice-list-failed").textContent).toMatch(/timeout/);
  });

  it("leave out of a refresh that failed what it could not read, and say when and why (P26)", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(pageOf());
    await loadEvery(["freelens-capi-healthy"]);
    lastLayout().store.subscribe({ abortController: new AbortController(), onLoadFailure: vi.fn() });

    const subscribed = stores.clusters?.subscribe.mock.calls[0][0] as { onLoadFailure: (error: unknown) => void };

    // The reload after a 410 fails, and empties the namespace of its watch.
    act(() => {
      stores.clusters?.set([]);
      subscribed.onLoadFailure(new Error("Failed to load", { cause: new Error("socket hang up") }));
    });

    expect(screen.queryAllByTestId("host-row")).toHaveLength(0);
    expect(screen.getByTestId("capi-notice-list-refresh").textContent).toMatch(/could not be read again, at/);
    expect(screen.getByTestId("capi-notice-list-refresh").textContent).toMatch(/socket hang up/);
  });

  it("say above the layout, with rows and without, that the host reads the list once and does not follow it (P34)", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy", "default"], true);
    runInAction(() => {
      host.context.isLoadingAll = () => true;
      host.context.isGlobalWatchEnabled = () => false;
    });
    render(pageOf());
    await loadEvery(["freelens-capi-healthy", "default"]);

    expect(screen.getByTestId("capi-notice-list-not-followed").textContent).toMatch(
      /This list was read once, at 2026-01-01T00:00:00.000Z, over the whole cluster, and is not followed/,
    );
    expect(screen.getAllByTestId("host-row")).toHaveLength(1);

    act(() => stores.clusters?.set([]));

    expect(screen.getByTestId("capi-notice-list-not-followed")).toBeDefined();
    expect(screen.getByTestId("host-no-items")).toBeDefined();
  });

  it("build the store of the context of the frame once, also when the page mounts twice, and never load, register or subscribe it", async () => {
    serve();
    render(<React.StrictMode>{pageOf()}</React.StrictMode>);
    cleanup();
    render(pageOf());

    const [store] = host.builtStores as {
      api: unknown;
      loadAll: ReturnType<typeof vi.fn>;
      subscribe: ReturnType<typeof vi.fn>;
    }[];

    expect(host.builtStores).toHaveLength(1);
    expect(store.api).toBe(APIS.clusters);
    expect(store.loadAll).not.toHaveBeenCalled();
    expect(store.subscribe).not.toHaveBeenCalled();
    expect(host.registerStore).not.toHaveBeenCalled();
  });
});

describe("the clock of the page (SPEC-0003, What it takes and returns)", () => {
  it("turns a Cluster in the tone of progress to the tone of a warning at the time that its result names", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(CAPTURE);

    const stores = serve();

    hold(stores, ["provisioning"]);
    select(["freelens-capi-provisioning"]);
    render(pageOf());
    await loadEvery(["freelens-capi-provisioning"]);

    const tone = () =>
      within(screen.getByTestId("host-row")).getByTestId("capi-cluster-health").getAttribute("data-tone");

    expect(tone()).toBe("info");

    // The first provisioning of a Cluster has 30 minutes from its start, which the fixture wrote at 23:59:34.
    act(() => {
      vi.advanceTimersByTime(29 * 60 * 1000);
    });
    expect(tone()).toBe("info");

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(tone()).toBe("warning");
  });
});
