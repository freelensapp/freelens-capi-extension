// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { runInAction } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// The cases of SPEC-0004, "Tests", "Unit", `clusters-page-v1beta2.test.tsx`, for the list of the first pull request:
// the props that the layout of the host gets, the reads through the adapters of the page, the states and their words.
// The layout of the stub records its props and renders the parts where the host calls back into the page; the
// subscription is the host's, which the stub does not run: the test drives the loads through the adapters, as the
// host would.

type LayoutProps = {
  store: Adapter;
  dependentStores: Adapter[];
  items: HostObject[];
  isReady: boolean;
  isSelectable: boolean;
  hasDetailsView: boolean;
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
  it("gets no selection, no menu of the host but an empty cell of the menu in each row, and no details of the host", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(<ClustersPage extension={EXTENSION} />);
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
    expect(props.hasDetailsView).toBe(false);
    expect(props.renderTableHeader).toBe(COLUMNS);
  });

  it("gets addRemoveButtons with an own key onRemove that holds undefined, which the layout spreads over its own", () => {
    serve();
    render(<ClustersPage extension={EXTENSION} />);

    const props = lastLayout();

    expect(Object.hasOwn(props.addRemoveButtons, "onRemove")).toBe(true);
    expect(props.addRemoveButtons.onRemove).toBeUndefined();
  });

  it("gets as its stores the adapters of the Clusters and of the context, the operator among them, subscribed", () => {
    serve();
    render(<ClustersPage extension={EXTENSION} />);

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

    render(<ClustersPage extension={EXTENSION} />);

    for (const store of Object.values(stores)) {
      expect(store?.loadAll).not.toHaveBeenCalled();
      expect(store?.subscribe).not.toHaveBeenCalled();
    }
  });

  it("gives one adapter to a store that two references name", async () => {
    const stores = serve();

    hold(stores, ["healthy", "paused"]);
    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(<ClustersPage extension={EXTENSION} />);
    await loadEvery(["freelens-capi-healthy", "freelens-capi-paused"]);

    const props = lastLayout();

    expect(props.items).toHaveLength(2);
    expect(adaptersOf(props).filter((adapter) => adapter.api.kind === "KubeadmControlPlane")).toHaveLength(1);
  });

  it("searches the fields that getSearchFields() of the host gives and the words that the columns show (P14)", async () => {
    const stores = serve();

    hold(stores, ["paused"]);
    select(["freelens-capi-paused"]);
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
  });

  it("sort the counters by the available then the desired, the class by name then namespace, and the age as the host", async () => {
    const stores = serve();
    const namespaces = ["freelens-capi-healthy", "freelens-capi-scaling-up"];

    hold(stores, ["healthy", "scaling-up"]);
    select(namespaces);
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);

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
    render(<ClustersPage extension={EXTENSION} />);

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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
    await loadEvery(["freelens-capi-healthy"]);

    expect(host.crdGet).not.toHaveBeenCalled();

    await act(async () => {
      runInAction(() => {
        host.crdStore.items = [];
        host.crdStore.failedLoading = true;
      });
    });

    expect(host.crdGet.mock.calls).toEqual([["kubeadmcontrolplanes.controlplane.cluster.x-k8s.io"]]);
  });

  it("list no row of a namespace that the filter adds until the load that reads it ends, with the spinner and no row", async () => {
    const stores = serve();

    hold(stores, ["healthy", "paused"]);
    select(["freelens-capi-healthy"]);
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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

  it("mount the layout again, keyed by the set of its stores, when the host registers an API later, with the rows kept", async () => {
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

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(<ClustersPage extension={EXTENSION} />);
    await loadEvery(["freelens-capi-healthy"]);

    expect(lastLayout().dependentStores.map((adapter) => adapter.api.kind)).not.toContain("CoreProvider");

    const mounts = host.layoutMounts;

    act(() => host.registerApi(APIS.coreProviders, new FakeStore(APIS.coreProviders)));

    const props = lastLayout();

    // One new mount, in which the host subscribes the new store (kube-object-list-layout.tsx:131-161).
    expect(host.layoutMounts).toBe(mounts + 1);
    expect(props.dependentStores.map((adapter) => adapter.api.kind)).toContain("CoreProvider");
    expect(props.items.map((cluster) => cluster.getName())).toEqual(["freelens-capi-healthy"]);
    expect(props.isReady).toBe(true);
  });

  it("mount the layout again with a store that the host replaces under the same base, which it reads anew", async () => {
    const stores = serve();

    hold(stores, ["healthy"]);
    select(["freelens-capi-healthy"]);
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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

describe("the states of the page (P20, P25, P26, P34)", () => {
  it("say, under the title alone, that the host is checking, that Cluster API is not installed, or is older", () => {
    const { unmount } = render(<ClustersPage extension={EXTENSION} />);

    expect(screen.getByTestId("capi-clusters-checking").textContent).toBe(
      "Checking whether this cluster serves Cluster API",
    );
    expect(screen.getByRole("heading").textContent).toBe("Workload Clusters");
    expect(screen.queryByTestId("host-layout")).toBeNull();
    unmount();

    runInAction(() => {
      host.crdStore.isLoaded = true;
    });
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
    expect(screen.getByTestId("capi-clusters-older").textContent).toMatch(/serves Clusters at v1beta1 alone/);
    expect(screen.getByTestId("capi-clusters-older").textContent).toMatch(/came with Cluster API v1.11/);
  });

  it("follows when the host registers the API of Clusters after the page rendered", () => {
    runInAction(() => {
      host.crdStore.items = DEFINITIONS;
      host.crdStore.isLoaded = true;
    });
    render(<ClustersPage extension={EXTENSION} />);
    expect(screen.getByTestId("capi-clusters-checking")).toBeDefined();

    act(() => {
      serve();
    });

    expect(screen.getByTestId("host-layout")).toBeDefined();
  });

  it("say Restricted in the place of the rows, and not counted next to the marks of the host, the header kept", async () => {
    const stores = serve();

    select(["freelens-capi-healthy", "freelens-capi-paused"]);
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(<ClustersPage extension={EXTENSION} />);
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
    render(
      <React.StrictMode>
        <ClustersPage extension={EXTENSION} />
      </React.StrictMode>,
    );
    cleanup();
    render(<ClustersPage extension={EXTENSION} />);

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
    render(<ClustersPage extension={EXTENSION} />);
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
