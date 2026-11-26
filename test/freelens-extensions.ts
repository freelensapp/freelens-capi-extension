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
  navigateExtension: vi.fn<(pageId?: string, params?: object) => Promise<void>>(async () => undefined),
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
// objects of the cluster, in every namespace, and the failures that a load
// reports, one for each namespace that fails, through `onLoadFailure`, as the
// store of the host reports them. A test sets it with `host.cluster`.
interface ClusterData {
  items: unknown[];
  failures: unknown[];
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

    for (const failure of data?.failures.splice(0) ?? []) opts?.onLoadFailure?.(failure);
    runInAction(() => {
      const read = (data?.items ?? []).filter((item) =>
        namespaces.includes((item as { metadata?: { namespace?: string } }).metadata?.namespace ?? ""),
      );

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
// view, then its name and its value.
function DrawerItem(props: {
  name?: React.ReactNode;
  hidden?: boolean;
  className?: string;
  children?: React.ReactNode;
  "data-testid"?: string;
}) {
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
}

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

function Table(props: { children?: React.ReactNode; "data-testid"?: string }) {
  return React.createElement("div", { "data-testid": props["data-testid"], "data-host-table": "" }, props.children);
}

function TableHead(props: { children?: React.ReactNode }) {
  return React.createElement("div", { "data-host-table-head": "" }, props.children);
}

function TableRow(props: { children?: React.ReactNode; "data-testid"?: string }) {
  return React.createElement("div", { "data-testid": props["data-testid"], "data-host-table-row": "" }, props.children);
}

function TableCell(props: { children?: React.ReactNode; "data-testid"?: string }) {
  return React.createElement("div", { "data-testid": props["data-testid"] }, props.children);
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

export const Renderer = {
  Component: {
    Badge,
    Drawer,
    DrawerItem,
    DrawerTitle,
    Icon: (props: { material?: string; svg?: string }) =>
      React.createElement("i", { "data-icon": props.material ?? "svg" }),
    KubeObjectAge: (props: { object: { metadata?: { creationTimestamp?: string } } }) =>
      React.createElement("span", { "data-testid": "host-age" }, props.object.metadata?.creationTimestamp),
    KubeObjectListLayout,
    KubeObjectMeta,
    LocaleDate: (props: { date: string | Date }) =>
      React.createElement("time", null, props.date instanceof Date ? props.date.toISOString() : props.date),
    MaybeLink,
    NamespaceSelectBadge: (props: { namespace: string }) =>
      React.createElement("span", { "data-testid": "host-namespace" }, props.namespace),
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
