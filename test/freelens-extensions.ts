// Minimal stub of `@freelensapp/extensions` for unit tests.
//
// The published package is a shim that reads `Common`, `Main` and `Renderer`
// off `globalThis.FreelensExtensionApi`, which the Freelens host sets before it
// loads an extension. A Vitest process has no host, so importing the real
// package throws. `vitest.config.ts` aliases the import to this file instead.
// The package ships no mocks of its own to use in its place.
//
// Only the surface the tests exercise is stubbed here, and only at runtime: the
// tests are type-checked against the real declaration of the package. Extend it
// as your tests need more of the host API. What a test sets up of the host, the
// APIs it registers, their stores, the store of definitions and the context of
// the frame, is in `host`, which a test imports from this file by its path: the
// alias and the path resolve to the same module.
import { observable, runInAction } from "mobx";
import React from "react";
import { vi } from "vitest";

interface StubMetadata {
  name?: string;
  namespace?: string;
  uid?: string;
  selfLink?: string;
  resourceVersion?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
}

// An API of the host, as its registry holds it.
export interface StubApi {
  kind: string;
  apiVersionWithGroup: string;
  apiBase: string;
  isNamespaced: boolean;
}

// The context of the frame of a cluster, as a store of the extension's class
// gives it through its getter `context`.
export interface StubContext {
  contextNamespaces: string[];
  allNamespaces: string[];
  hasSelectedAll: boolean;
  isLoadingAll: (namespaces: string[]) => boolean;
  isGlobalWatchEnabled: () => boolean;
}

function newContext(): StubContext {
  return observable(
    {
      contextNamespaces: ["default"],
      allNamespaces: ["default"],
      hasSelectedAll: false,
      isLoadingAll: () => false,
      isGlobalWatchEnabled: () => true,
    },
    { isLoadingAll: false, isGlobalWatchEnabled: false },
  );
}

// What a test sets up of the host. `reset` clears it between tests.
export const host = {
  // The registry of APIs, observable as the host's is, by the base of each.
  apis: observable.map<string, StubApi>({}, { deep: false }),
  // The store of each API, by its base.
  stores: new Map<string, unknown>(),
  // The store of definitions of the host, with its API.
  crdStore: observable(
    {
      api: {
        kind: "CustomResourceDefinition",
        apiBase: "/apis/apiextensions.k8s.io/v1/customresourcedefinitions",
        apiVersionWithGroup: "apiextensions.k8s.io/v1",
        isNamespaced: false,
      },
      isLoaded: false,
      failedLoading: false,
      items: [] as unknown[],
    },
    {},
    { deep: false },
  ),
  // The GET of one definition by its name.
  crdGet: vi.fn<(name: string) => Promise<unknown>>(),
  context: newContext(),
  // The stores of the extension's own class built in the frame, in order. A
  // test file is one frame: `reset` keeps them, as a frame keeps what its
  // modules built.
  builtStores: [] as unknown[],
  // What the stores of the extension's own class read of the cluster, by the
  // base of their API.
  cluster: new Map<string, ClusterData>(),
  registerStore: vi.fn(),
  // The APIs that the extension built itself, which it never does.
  builtApis: [] as unknown[],
  // The mounts of the list layout of the host, each of which subscribes its stores.
  layoutMounts: 0,
  // The navigations of the frame: to an address, to the details of the host, and to a page of the extension.
  navigate: vi.fn<(location: string) => void>(),
  showDetails: vi.fn<(selfLink: string, resetSelected?: boolean) => void>(),
  navigateExtension: vi.fn<(pageId?: string, params?: object) => Promise<void>>(async (pageId, params = {}) => {
    host.pushExtensionPage(pageId, params);
  }),
  // The entries that the navigations to a page of the extension add to the history of the frame, as the host adds
  // them: the address of the page with every parameter given, an empty one included, as the navigation of the
  // extension writes it (freelens:packages/core/src/extensions/lens-renderer-extension.ts:108-139), and, when one is
  // empty, the same address once more without it, which the observable history of the host pushes as it keeps the
  // parameters of its address without the empty ones (freelens:packages/routing/src/observable-history.ts:157-189;
  // freelens:packages/routing/src/search-params.ts:9-13). One Back goes to the entry before the last.
  history: [] as string[],
  pushExtensionPage(pageId: string | undefined, params: object) {
    const search = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
    const kept = new URLSearchParams([...search].filter(([, value]) => value !== ""));
    const address = (query: URLSearchParams) => `/${pageId ?? ""}${query.size > 0 ? `?${query.toString()}` : ""}`;

    host.history.push(address(search));
    if (kept.size !== search.size) host.history.push(address(kept));
  },
  // The parameters of the address of the frame, by their names, which a page parameter that the extension creates
  // reads, as `kube-details`, the parameter of the details of the host.
  params: observable.map<string, string>({}, { deep: false }),
  // `hideDetails` of the extension API, which writes `kube-details` with an empty value, as the host does.
  hideDetails: vi.fn(() => {
    runInAction(() => host.params.set("kube-details", ""));
  }),
  // The rows that the virtual list of a table draws, by their ids, of those that it has: all of them unless a test
  // gives the window of the list.
  drawnRows: undefined as ((ids: readonly string[]) => readonly string[]) | undefined,
  // The virtual lists of the tables mounted, each of which draws its rows again when it is told to.
  lists: new Set<() => void>(),
  // A scroll of the virtual lists to another window of rows: each draws the rows of that window again, as the virtual
  // list of the host does on a scroll, with no render of the page that holds it.
  scrollRows(window: (ids: readonly string[]) => readonly string[]) {
    host.drawnRows = window;
    for (const draw of host.lists) draw();
  },
  // While set, a `loadAll` of a store of the extension's own class waits for it before it reads, as a list of the
  // host waits for its answer; `deferLoads` sets it and gives the function that lets the loads end.
  loadGate: undefined as Promise<void> | undefined,
  deferLoads(): () => void {
    let release = () => undefined as void;

    host.loadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      host.loadGate = undefined;
      release();
    };
  },
  reset() {
    runInAction(() => {
      host.apis.clear();
      host.crdStore.isLoaded = false;
      host.crdStore.failedLoading = false;
      host.crdStore.items = [];
    });
    host.stores.clear();
    host.cluster.clear();
    host.crdGet.mockReset();
    host.context = newContext();
    host.registerStore.mockReset();
    host.builtApis.length = 0;
    host.layoutMounts = 0;
    host.navigate.mockReset();
    host.showDetails.mockReset();
    host.navigateExtension.mockClear();
    host.history.length = 0;
    runInAction(() => host.params.clear());
    host.hideDetails.mockClear();
    host.drawnRows = undefined;
    host.loadGate = undefined;
  },
  registerApi(api: StubApi, store?: unknown) {
    runInAction(() => host.apis.set(api.apiBase, api));
    if (store !== undefined) host.stores.set(api.apiBase, store);
  },
};

const apiManager = {
  getApi(found: (api: StubApi) => boolean): StubApi | undefined {
    for (const api of host.apis.values()) if (found(api)) return api;
    return undefined;
  },
  getApiByKind(kind: string, apiVersion: string): StubApi | undefined {
    return apiManager.getApi((api) => api.kind === kind && api.apiVersionWithGroup === apiVersion);
  },
  getStore(api: StubApi | undefined): unknown {
    return api === undefined ? undefined : host.stores.get(api.apiBase);
  },
  registerStore: (store: unknown) => host.registerStore(store),
};

class LensExtensionKubeObject {
  apiVersion?: string;
  kind?: string;
  metadata?: StubMetadata;
  spec?: unknown;
  status?: unknown;

  constructor(data: Record<string, unknown> = {}) {
    Object.assign(this, data);
  }

  // As the host's, from the metadata.
  getName() {
    return this.metadata?.name ?? "";
  }

  // An empty namespace is undefined, as the host's.
  getNs() {
    return this.metadata?.namespace || undefined;
  }

  getId() {
    return this.metadata?.uid ?? this.metadata?.selfLink ?? "";
  }

  get selfLink() {
    return this.metadata?.selfLink ?? "";
  }

  // The owners, as the host's.
  getOwnerRefs() {
    return (this.metadata as { ownerReferences?: { kind: string; name: string }[] } | undefined)?.ownerReferences ?? [];
  }

  getCreationTimestamp() {
    return new Date(this.metadata?.creationTimestamp ?? 0).getTime();
  }

  // The name, the namespace, the id and the labels as `key=value`, as the
  // host's.
  getSearchFields() {
    const labels = Object.entries(this.metadata?.labels ?? {}).map(([key, value]) => `${key}=${value}`);

    return [this.getName(), this.getNs(), this.getId(), ...labels];
  }

  // The host finds the API of the class by its kind and one of its
  // `crd.apiVersions`, and throws when there is none.
  static getApi(this: { kind?: string; crd?: { apiVersions: string[] }; name: string }): StubApi {
    for (const apiVersion of this.crd?.apiVersions ?? []) {
      const api = apiManager.getApiByKind(this.kind ?? "", apiVersion);

      if (api) return api;
    }
    throw new Error(`API for ${this.name} is not registered. Extension won't work correctly.`);
  }

  // The host returns the store it registered for the API of the class, and
  // throws when there is none. The registry is observable, as the host's is, so
  // a component that reads it follows when a test registers an API.
  static getStore(this: typeof LensExtensionKubeObject): unknown {
    const store = apiManager.getStore(this.getApi());

    if (store === undefined)
      throw new Error(`Store for ${this.name} is not registered. Extension won't work correctly.`);
    return store;
  }
}

// What a store of the extension's own class reads, by the base of its API: the
// objects of the cluster, in every namespace, and the failures of the lists of
// some namespaces, each with its namespace. The next load of a namespace that
// fails reports its failure through `onLoadFailure`, once, and leaves the
// objects of that namespace out of the store, as the store of the host does
// (freelens kube-object.store.ts at v2.1.0: 284-311, 333, 372-388). A test sets
// it with `host.cluster`.
interface ClusterData {
  items: unknown[];
  failures: { readonly namespace: string; readonly error: unknown }[];
}

// The base of the stores of the extension's own class: building one sends
// nothing, and its getter `context` gives the context of the frame. A load
// reads the objects of its namespaces from what the test set of the cluster
// (`host.cluster`), into the items of the store, as the host merges them.
class KubeObjectStore {
  readonly api: { apiBase?: string };
  readonly items = observable.array<{ metadata?: { namespace?: string; selfLink?: string } }>([], { deep: false });
  readonly #state = observable({ isLoaded: false, isLoading: false });

  readonly loadAll = vi.fn(async (opts?: { namespaces?: string[]; onLoadFailure?: (error: unknown) => void }) => {
    if (host.loadGate !== undefined) await host.loadGate;

    const data = host.cluster.get(this.api.apiBase ?? "");
    const namespaces = opts?.namespaces ?? [];
    const failing = (data?.failures ?? []).filter((failure) => namespaces.includes(failure.namespace));
    const failed = new Set(failing.map((failure) => failure.namespace));

    if (data !== undefined) data.failures = data.failures.filter((failure) => !failing.includes(failure));
    for (const failure of failing) opts?.onLoadFailure?.(failure.error);
    runInAction(() => {
      const read = (data?.items ?? []).filter((item) => {
        const namespace = (item as { metadata?: { namespace?: string } }).metadata?.namespace ?? "";

        return namespaces.includes(namespace) && !failed.has(namespace);
      });

      this.items.replace([
        ...this.items.filter((item) => !namespaces.includes(item.metadata?.namespace ?? "")),
        ...(read as never[]),
      ]);
      this.#state.isLoaded = true;
    });
    return [];
  });

  readonly subscribe = vi.fn((_opts?: unknown) => () => undefined);

  constructor(api: { apiBase?: string }) {
    this.api = api;
    host.builtStores.push(this);
  }

  get context() {
    return host.context;
  }

  get isLoaded() {
    return this.#state.isLoaded;
  }

  get isLoading() {
    return this.#state.isLoading;
  }

  get failedLoading() {
    return false;
  }

  get contextItems() {
    return [...this.items];
  }

  getByPath(path: string) {
    return this.items.find((item) => item.metadata?.selfLink === path);
  }
}

// The host's store loads the saved model with `fromStore()` and saves it
// whenever `toJSON()` changes, through a `reaction`. The stub keeps nothing; a
// test that needs that behaviour sets up the reaction itself.
class ExtensionStore<M extends object> {
  constructor(_params: { configName: string; defaults: M }) {}
}

interface StubItem {
  getId(): string;
}

interface StubListStore {
  readonly isLoaded: boolean;
  readonly failedLoading: boolean;
  readonly contextItems: StubItem[];
  getTotalCount(): number;
  pickOnlySelected(items: StubItem[]): StubItem[];
  removeItems?: (items: StubItem[]) => Promise<void>;
  removeSelectedItems?: () => Promise<void>;
}

interface HeaderPlaceholders {
  title?: React.ReactNode;
  info?: React.ReactNode;
  filters?: React.ReactNode;
}

interface StubListLayoutProps {
  store: StubListStore;
  items?: StubItem[];
  isReady?: boolean;
  renderHeaderTitle?: React.ReactNode;
  customizeHeader?: ((placeholders: HeaderPlaceholders) => HeaderPlaceholders) | undefined;
  tableProps?: { noItems?: React.ReactNode };
  renderTableContents: (item: StubItem) => React.ReactNode[];
  renderItemMenu?: (item: StubItem) => React.ReactNode;
  addRemoveButtons?: { onRemove?: () => void };
  hasDetailsView?: boolean;
  onDetails?: (item: StubItem) => void;
}

// The parts of the host's list layout where it calls back into the extension
// or decides from the props of a page: the header, with the count that the
// store gives followed by a mark of the host, through the customizers of the
// page; the rows of `items`, else of the `contextItems` of the store, with the
// cells that `renderTableContents` gives from its own render, a child of the
// page; with no row, the `noItems` of `tableProps`, else the spinner while it is
// not ready and its empty list once it is; and the remove button, from the
// selection of the store among the rows, the props of the page spread over its
// own (freelens:packages/core/src/renderer/components/item-object-list/content.tsx:457-480,
// 566-595); the cell of the menu, which the header always has and each row has
// when the page gives a `renderItemMenu` (content.tsx:382-386, 531-533). Its
// calls are recorded, so that a test reads the props a page gave, and its mounts
// are counted, since the host subscribes the stores of a layout when it mounts
// (kube-object-list-layout.tsx:131-161). It subscribes nothing: the
// subscription is the host's.
const KubeObjectListLayout = vi.fn((props: StubListLayoutProps) => {
  const { store, items, isReady, renderHeaderTitle, customizeHeader, tableProps, renderTableContents } = props;
  const { renderItemMenu, onDetails, hasDetailsView = true } = props;
  const rows = items ?? store.contextItems;

  React.useEffect(() => {
    host.layoutMounts++;
  }, []);

  const count = store.getTotalCount();
  const initial: HeaderPlaceholders = {
    title: React.createElement("h5", null, renderHeaderTitle),
    info: React.createElement(
      React.Fragment,
      null,
      count === 1 ? `${count} item` : `${count} items`,
      React.createElement("span", { "data-testid": "host-mark" }, "mark of the host"),
    ),
  };
  const header = [customizeHeader]
    .flat()
    .reduce<HeaderPlaceholders>(
      (placeholders, customize) => (customize === undefined ? placeholders : customize(placeholders)),
      initial,
    );
  const selected = store.pickOnlySelected(rows);
  const removal = {
    onRemove: (store.removeItems || store.removeSelectedItems) && selected.length > 0 ? () => undefined : undefined,
    ...props.addRemoveButtons,
  };
  const ready = isReady ?? store.isLoaded;
  const empty =
    tableProps?.noItems ??
    React.createElement("div", { "data-testid": ready ? "host-no-items" : "host-spinner" }, ready ? "No items" : "");

  return React.createElement(
    "div",
    { "data-testid": "host-layout" },
    React.createElement(
      "div",
      { "data-testid": "host-header" },
      header.title,
      header.info,
      React.createElement("input", { "data-testid": "host-search", placeholder: "Search..." }),
      React.createElement("div", { "data-testid": "host-head-menu" }),
    ),
    rows.length === 0
      ? empty
      : rows.map((item) =>
          React.createElement(
            "div",
            {
              key: item.getId(),
              "data-testid": "host-row",
              // A row opens the details, and stops the click as it handles it
              // (freelens:packages/core/src/renderer/components/item-object-list/content.tsx).
              onClick: hasDetailsView
                ? (event: React.MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDetails?.(item);
                  }
                : undefined,
            },
            ...renderTableContents(item).map((cell, index) => React.createElement("div", { key: index }, cell)),
            renderItemMenu === undefined
              ? null
              : React.createElement("div", { key: "menu", "data-testid": "host-row-menu" }, renderItemMenu(item)),
          ),
        ),
    removal.onRemove === undefined ? null : React.createElement("button", { "data-testid": "host-remove" }, "Remove"),
  );
});

// The tooltip of a component of the host, hidden next to it, which a test
// finds by the test id of the component and `-tooltip`.
function tooltipOf(tooltip: React.ReactNode, testId: string | undefined) {
  return tooltip === undefined || tooltip === null
    ? null
    : React.createElement("span", { hidden: true, "data-testid": testId && `${testId}-tooltip` }, tooltip);
}

// A component of the host that renders its label, or its children, and what a
// test looks for in it: whether a click expands it, which the host does when
// its content does not fit, and its tooltip.
function Labelled(props: {
  label?: React.ReactNode;
  children?: React.ReactNode;
  tooltip?: React.ReactNode;
  expandable?: boolean;
  "data-testid"?: string;
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "span",
      { "data-testid": props["data-testid"], "data-expandable": String(props.expandable ?? true) },
      props.label,
      props.children,
    ),
    tooltipOf(props.tooltip, props["data-testid"]),
  );
}

interface StubDrawerProps {
  open: boolean;
  title: React.ReactNode;
  onClose?: () => void;
  toolbar?: React.ReactNode;
  children?: React.ReactNode;
  "data-testid"?: string;
  testIdForClose?: string;
}

// The drawer of the host as the details of a page use it: its title, its
// close icon, and its children while it is open; it closes on its icon, on
// Escape through a listener on the window, and on a click that the window
// receives outside every drawer, unless the press of that click was in it or
// the click was handled (freelens:packages/core/src/renderer/components/drawer/drawer.tsx).
class Drawer extends React.Component<StubDrawerProps> {
  #root: HTMLElement | null = null;
  #pressed: EventTarget | null = null;

  componentDidMount() {
    window.addEventListener("mousedown", this.#onPress);
    window.addEventListener("click", this.#onClick);
    window.addEventListener("keydown", this.#onKey);
  }

  componentWillUnmount() {
    window.removeEventListener("mousedown", this.#onPress);
    window.removeEventListener("click", this.#onClick);
    window.removeEventListener("keydown", this.#onKey);
  }

  #close = () => {
    if (this.props.open) this.props.onClose?.();
  };

  #onPress = (event: MouseEvent) => {
    if (this.props.open) this.#pressed = event.target;
  };

  #onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const pressedInside = this.#pressed instanceof Node && this.#root?.contains(this.#pressed);

    this.#pressed = null;
    if (!this.props.open || event.defaultPrevented || pressedInside) return;
    if (target.isConnected && !target.closest(".Drawer")) this.#close();
  };

  #onKey = (event: KeyboardEvent) => {
    if (this.props.open && event.code === "Escape") this.#close();
  };

  render() {
    if (!this.props.open) return null;
    return React.createElement(
      "div",
      {
        className: "Drawer",
        "data-testid": this.props["data-testid"],
        ref: (element: HTMLElement | null) => {
          this.#root = element;
        },
      },
      React.createElement(
        "div",
        { "data-testid": "host-drawer-title" },
        this.props.title,
        this.props.toolbar,
        React.createElement("i", {
          role: "button",
          tabIndex: 0,
          "data-testid": this.props.testIdForClose,
          onClick: this.#close,
        }),
      ),
      React.createElement("div", { "data-testid": "host-drawer-content" }, this.props.children),
    );
  }
}

// An item of the drawer with the classes that the host gives it (drawer-item.tsx): `DrawerItem` with the class of the
// view, then its name and its value. Its calls are recorded, so that a case can make the item of a row throw.
const DrawerItem = vi.fn(
  (props: {
    name?: React.ReactNode;
    hidden?: boolean;
    className?: string;
    children?: React.ReactNode;
    "data-testid"?: string;
  }) => {
    if (props.hidden) return null;
    return React.createElement(
      "div",
      {
        "data-testid": props["data-testid"],
        "data-drawer-item": "",
        className: ["DrawerItem", props.className].filter(Boolean).join(" "),
      },
      React.createElement("span", { "data-drawer-item-name": "", className: "name" }, props.name),
      React.createElement("span", { className: "value" }, props.children),
    );
  },
);

function DrawerTitle(props: { children?: React.ReactNode }) {
  return React.createElement("h6", null, props.children);
}

// The link of the host, which navigates in the frame unless its click is
// handled.
function MaybeLink(props: { to?: string; children?: React.ReactNode; onClick?: (event: React.MouseEvent) => void }) {
  if (props.to === undefined) return React.createElement(React.Fragment, null, props.children);
  return React.createElement(
    "a",
    {
      href: props.to,
      onClick: (event: React.MouseEvent) => {
        props.onClick?.(event);
        event.preventDefault();
        host.navigate(props.to ?? "");
      },
    },
    props.children,
  );
}

// The metadata of the host: the fields it shows, in its order, but those of
// `hideFields`, whose default is the three it hides, named in `data-fields`;
// the name as text, and the namespace and each owner as a link to the details
// of the host, as the host links them
// (freelens:packages/core/src/renderer/components/kube-object-meta/kube-object-meta.tsx).
const HOST_META_FIELDS = [
  "creationTimestamp",
  "deletionTimestamp",
  "name",
  "namespace",
  "uid",
  "selfLink",
  "resourceVersion",
  "labels",
  "annotations",
  "finalizers",
  "ownerReferences",
  "managedFields",
];

const KubeObjectMeta = vi.fn(
  (props: {
    object: {
      getName(): string;
      getNs(): string | undefined;
      getOwnerRefs(): { kind: string; name: string }[];
    };
    hideFields?: string[];
  }) => {
    const hidden = props.hideFields ?? ["uid", "resourceVersion", "selfLink"];
    const shown = HOST_META_FIELDS.filter((field) => !hidden.includes(field));
    const namespace = props.object.getNs();
    const owners = props.object.getOwnerRefs();

    return React.createElement(
      "div",
      { "data-testid": "host-meta", "data-fields": shown.join(" ") },
      shown.includes("name") ? React.createElement("span", null, props.object.getName()) : null,
      namespace === undefined || !shown.includes("namespace")
        ? null
        : React.createElement("a", { href: `?kube-details=/api/v1/namespaces/${namespace}` }, namespace),
      !shown.includes("ownerReferences")
        ? null
        : owners.map((owner) =>
            React.createElement(
              "a",
              { key: owner.name, href: `?kube-details=${owner.kind}/${owner.name}` },
              owner.name,
            ),
          ),
    );
  },
);

interface StubTableProps {
  children?: React.ReactNode;
  className?: string;
  selectable?: boolean;
  virtual?: boolean;
  items?: { getId(): string }[];
  getTableRow?: (uid: string) => React.ReactElement | null | undefined;
  selectedItemId?: string;
  "data-testid"?: string;
}

// The table of the host (freelens:packages/core/src/renderer/components/table/table.tsx): an element with its classes
// alone, the head that the page gives it, and its rows; with `virtual`, the rows that `getTableRow` gives for its
// items, inside the virtual list of the host, an element of the class `VirtualList`, which takes the class of the
// table too, around the element of the list that scrolls, of the class `list`
// (freelens:packages/core/src/renderer/components/virtual-list/virtual-list.tsx). The virtual list draws the rows of
// its window, all of them here unless a test gives the window (`host.drawnRows`), and draws them again on its own when a
// test scrolls it (`host.scrollRows`). The `Table` of the extension API is the table of the host given its
// dependencies by `withInjectables`, which renders it with the props that a layout effect of its own stored
// (freelens:packages/core/src/renderer/components/table/table.tsx:316-323; `withInjectables` of
// @ogre-tools/injectable-react 27.0.0, the version of the catalog of Freelens), so the table draws what a render of a
// page gives it in the commit after that render, and its head with its rows; so does the stub. Its calls are recorded,
// one for each render of the page, so that a test reads the props that a page gave at each render.
const Table = vi.fn((props: StubTableProps) => React.createElement(DrawnLater, { props }));

// What the table draws: the props of the last render of the page, which a layout effect stores, drawn by a table that
// renders again only when they change, as the table of the host, an observer, does.
function DrawnLater({ props }: { props: StubTableProps }) {
  const [given, setGiven] = React.useState<StubTableProps | undefined>(undefined);

  React.useLayoutEffect(() => {
    setGiven(props);
  }, [props]);
  return given === undefined ? null : React.createElement(DrawnTable, given);
}

const DrawnTable = React.memo((props: StubTableProps) => {
  const { children, className, selectable, virtual, items = [], getTableRow, selectedItemId } = props;
  const [, draw] = React.useReducer((count: number) => count + 1, 0);

  React.useEffect(() => {
    host.lists.add(draw);
    return () => {
      host.lists.delete(draw);
    };
  }, []);
  const content = React.Children.toArray(children) as React.ReactElement[];
  const head = content.filter((child) => child.type === TableHead);
  const ids = items.map((item) => item.getId());
  const drawn = host.drawnRows === undefined ? ids : host.drawnRows(ids);
  const rows = virtual
    ? React.createElement(
        "div",
        {
          key: "virtual-list",
          className: ["VirtualList", className].filter(Boolean).join(" "),
          "data-selected-item-id": selectedItemId,
        },
        React.createElement(
          "div",
          { className: "list" },
          drawn.map((id) => getTableRow?.(id) ?? null),
        ),
      )
    : content.filter((child) => child.type !== TableHead);

  return React.createElement(
    "div",
    {
      className: ["Table", className, selectable ? "selectable" : "", virtual ? "virtual" : ""]
        .filter(Boolean)
        .join(" "),
      "data-testid": props["data-testid"],
      "data-host-table": "",
    },
    ...head,
    rows,
  );
});

// The head, the rows and the cells of the table of the host, each of which spreads every prop that it does not use on
// its element (freelens:packages/core/src/renderer/components/table/table-head.tsx, table-row.tsx, table-cell.tsx).
function TableHead(props: { children?: React.ReactNode; className?: string; sticky?: boolean; flat?: boolean }) {
  const { children, className, sticky, flat, ...rest } = props;

  return React.createElement(
    "div",
    { className: ["TableHead", className].filter(Boolean).join(" "), "data-host-table-head": "", ...rest },
    children,
  );
}

function TableRow(props: {
  children?: React.ReactNode;
  className?: string;
  selected?: boolean;
  nowrap?: boolean;
  testId?: string;
  "data-testid"?: string;
}) {
  const { children, className, selected, nowrap, testId, ...rest } = props;

  return React.createElement(
    "div",
    {
      className: ["TableRow", className, selected ? "selected" : ""].filter(Boolean).join(" "),
      "data-testid": testId,
      "data-host-table-row": "",
      ...rest,
    },
    children,
  );
}

function TableCell(props: { children?: React.ReactNode; className?: string; title?: React.ReactNode }) {
  const { children, className, title, ...rest } = props;

  return React.createElement(
    "div",
    { ...rest, className: ["TableCell", className].filter(Boolean).join(" ") },
    title ?? children,
  );
}

// The compact duration of the host, for the thresholds that the details name.
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 120) return `${seconds}s`;
  if (seconds < 3600 * 3) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function Badge(props: {
  label?: React.ReactNode;
  className?: string;
  tooltip?: React.ReactNode;
  expandable?: boolean;
  "data-tone"?: string;
  "data-word"?: string;
  "data-state"?: string;
  "data-testid"?: string;
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "span",
      {
        className: props.className,
        "data-tone": props["data-tone"],
        "data-word": props["data-word"],
        "data-state": props["data-state"],
        "data-testid": props["data-testid"],
        "data-expandable": String(props.expandable ?? true),
      },
      props.label,
    ),
    tooltipOf(props.tooltip, props["data-testid"]),
  );
}

interface StubIconProps {
  material?: string;
  svg?: string;
  small?: boolean;
  interactive?: boolean;
  focusable?: boolean;
  disabled?: boolean;
  tooltip?: React.ReactNode;
  onClick?: (event: React.MouseEvent) => void;
  "data-testid"?: string;
  [attribute: string]: unknown;
}

// The icon of the host (freelens:packages/ui-components/icon/src/icon.tsx): interactive with a click, which a disabled
// one drops, with a stop of Tab unless it is disabled, Enter and Space pressing it, and every other prop on its element;
// its tooltip hidden next to it.
function Icon(props: StubIconProps) {
  const { material, svg, small, interactive, focusable = true, disabled, tooltip, onClick, ...rest } = props;
  const isInteractive = interactive ?? Boolean(onClick);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement("i", {
      ...rest,
      "data-icon": material ?? "svg",
      "data-disabled": disabled ? "true" : undefined,
      tabIndex: isInteractive && focusable && !disabled ? 0 : undefined,
      onClick: isInteractive ? (event: React.MouseEvent) => (disabled ? undefined : onClick?.(event)) : undefined,
      onKeyDown: isInteractive
        ? (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.nativeEvent.code === "Enter" || event.nativeEvent.code === "Space") {
              event.currentTarget.click();
              event.preventDefault();
            }
          }
        : undefined,
    }),
    tooltipOf(tooltip, rest["data-testid"] as string | undefined),
  );
}

// The search of the host (freelens:packages/core/src/renderer/components/input/search-input.tsx): it takes the focus
// when it mounts unless `autoFocus` is false, and calls the `onKeyDown` of the page before its own, which clears its
// words on Escape and stops the key there.
function SearchInput(props: {
  value?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onChange?: (value: string, event: unknown) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  "data-testid"?: string;
}) {
  const { value, autoFocus = true, placeholder = "Search...", onChange, onKeyDown, onClear } = props;

  return React.createElement("input", {
    "data-testid": props["data-testid"] ?? "host-search-input",
    "data-autofocus": String(autoFocus),
    value: value ?? "",
    autoFocus,
    placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value, event),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.nativeEvent.code === "Escape") {
        if (onClear === undefined) onChange?.("", event);
        else onClear();
        event.stopPropagation();
      }
    },
  });
}

// A parameter of the address of the frame, which reads and writes the parameters that a test sets in `host.params`.
function createPageParam(init: { name: string; defaultValue?: string }) {
  return {
    name: init.name,
    get: () => host.params.get(init.name) ?? init.defaultValue,
    set: (value: string) => runInAction(() => host.params.set(init.name, value)),
    clear: () => runInAction(() => host.params.set(init.name, "")),
  };
}

export const Renderer = {
  Component: {
    Badge,
    Drawer,
    DrawerItem,
    DrawerTitle,
    Icon,
    KubeObjectAge: (props: { object: { metadata?: { creationTimestamp?: string } } }) =>
      React.createElement("span", { "data-testid": "host-age" }, props.object.metadata?.creationTimestamp),
    KubeObjectListLayout,
    KubeObjectMeta,
    LocaleDate: (props: { date: string | Date }) =>
      React.createElement("time", null, props.date instanceof Date ? props.date.toISOString() : props.date),
    MaybeLink,
    NamespaceSelectBadge: (props: { namespace: string }) =>
      React.createElement("span", { "data-testid": "host-namespace" }, props.namespace),
    SearchInput,
    ReactiveDuration: (props: { timestamp?: string }) =>
      React.createElement("span", { "data-testid": "host-duration" }, props.timestamp),
    Spinner: (props: { "data-testid"?: string }) =>
      React.createElement("span", { "data-testid": props["data-testid"] ?? "host-cell-spinner" }),
    Table,
    TableCell,
    TableHead,
    TableRow,
    WithTooltip: Labelled,
  },
  // The navigation of the frame. `getDetailsUrl` gives the parameter of the
  // details of the host alone, where the host merges it into the parameters
  // that the address already has; no case reads the others.
  Navigation: {
    getDetailsUrl: (selfLink: string) => `?kube-details=${encodeURIComponent(selfLink)}`,
    showDetails: (selfLink: string, resetSelected?: boolean) => host.showDetails(selfLink, resetSelected),
    hideDetails: () => host.hideDetails(),
    createPageParam,
    navigate: (location: string) => host.navigate(location),
  },
  // The base of the extension's own renderer: the host gives it its name, and
  // reads the registrations it holds.
  LensExtension: class LensExtension {
    readonly name: string;

    constructor(manifest: { name?: string } = {}) {
      this.name = manifest.name ?? "@freelensapp/capi-extension";
    }

    // Goes to a page of the extension, with its parameters.
    navigate(pageId?: string, params?: object): Promise<void> {
      return host.navigateExtension(pageId, params);
    }
  },
  K8sApi: {
    LensExtensionKubeObject,
    // Building an API of the extension's own registers it with the host.
    KubeApi: class KubeApi {
      constructor() {
        host.builtApis.push(this);
      }
    },
    KubeObjectStore,
    apiManager,
    // The registration of a details panel for a model class, with its kind and
    // the versions of its `crd`, as the host's helper builds it.
    detailsFor: (
      model: { kind?: string; crd?: { apiVersions: string[] } },
      registration: { Details: unknown; priority?: number },
    ) => ({
      kind: model.kind,
      apiVersions: [...(model.crd?.apiVersions ?? [])],
      components: { Details: registration.Details },
      ...(registration.priority === undefined ? {} : { priority: registration.priority }),
    }),
    get crdStore() {
      return host.crdStore;
    },
    crdApi: {
      get: (descriptor: { name: string }) => host.crdGet(descriptor.name),
    },
  },
};

export const Common = {
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  Store: {
    ExtensionStore,
  },
  Util: {
    formatDuration,
  },
};
