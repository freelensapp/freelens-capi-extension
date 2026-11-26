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
  registerStore: vi.fn(),
  // The APIs that the extension built itself, which it never does.
  builtApis: [] as unknown[],
  // The mounts of the list layout of the host, each of which subscribes its stores.
  layoutMounts: 0,
  reset() {
    runInAction(() => {
      host.apis.clear();
      host.crdStore.isLoaded = false;
      host.crdStore.failedLoading = false;
      host.crdStore.items = [];
    });
    host.stores.clear();
    host.crdGet.mockReset();
    host.context = newContext();
    host.registerStore.mockReset();
    host.builtApis.length = 0;
    host.layoutMounts = 0;
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

// The base of the stores of the extension's own class: building one sends
// nothing, and its getter `context` gives the context of the frame.
class KubeObjectStore {
  readonly api: unknown;
  readonly loadAll = vi.fn();
  readonly subscribe = vi.fn();

  constructor(api: unknown) {
    this.api = api;
    host.builtStores.push(this);
  }

  get context() {
    return host.context;
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
  const { renderItemMenu } = props;
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
      React.createElement("div", { "data-testid": "host-head-menu" }),
    ),
    rows.length === 0
      ? empty
      : rows.map((item) =>
          React.createElement(
            "div",
            { key: item.getId(), "data-testid": "host-row" },
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
    Icon: (props: { material?: string; svg?: string }) =>
      React.createElement("i", { "data-icon": props.material ?? "svg" }),
    KubeObjectAge: (props: { object: { metadata?: { creationTimestamp?: string } } }) =>
      React.createElement("span", { "data-testid": "host-age" }, props.object.metadata?.creationTimestamp),
    KubeObjectListLayout,
    LocaleDate: (props: { date: string | Date }) =>
      React.createElement("time", null, props.date instanceof Date ? props.date.toISOString() : props.date),
    NamespaceSelectBadge: (props: { namespace: string }) =>
      React.createElement("span", { "data-testid": "host-namespace" }, props.namespace),
    ReactiveDuration: (props: { timestamp?: string }) =>
      React.createElement("span", { "data-testid": "host-duration" }, props.timestamp),
    Spinner: () => React.createElement("span", { "data-testid": "host-cell-spinner" }),
    WithTooltip: Labelled,
  },
  // The base of the extension's own renderer: the host gives it its name, and
  // reads the registrations it holds.
  LensExtension: class LensExtension {
    readonly name: string;

    constructor(manifest: { name?: string } = {}) {
      this.name = manifest.name ?? "@freelensapp/capi-extension";
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
};
