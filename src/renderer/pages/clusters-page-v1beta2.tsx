/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The page of the Clusters at v1beta2 (SPEC-0004, "The page and its sidebar entry", "The list", "The reads", "The
// states that are not the happy one"): the list layout of the host, with no selection, no menu and no remove button of
// the host, whose rows are the Clusters of the namespaces that the page has loaded, each with the marks that the status
// model of SPEC-0003 gives it.
//
// Before the list, the page tells from the APIs that the host registers and from its store of definitions whether the
// cluster serves Clusters at v1beta2 (P20). It reads its stores through the subscription of the layout (P19), each
// through one adapter of the page, and keys the layout by the set of its stores, each store object by its identity,
// so that a store that appears later, or that the host replaces, mounts the layout again with it; and it says what the
// host hands it of the reads in words, in the place of the rows or over the list (P25, P34). The rows and the indexes
// of the context of the model are computed once for each change of their inputs; the model is evaluated with the time
// of each render, and again at the earliest time that a result names. It is an `observer`, and follows when the host
// registers the API of Clusters (AGENTS.md, "Rules That Fail Silently").
//
// The page has one parameter, `details`, which holds `<namespace>/<name>` of the Cluster whose details are open (P6):
// the list sets it, from a click on a row or on its name, which is a button that the keyboard reaches (P13), and
// closing the details clears it. The details are those of the extension, the `Drawer` of the host over the list
// (P15), and never those of the host, whose menu SPEC-0001, A7 keeps away from the list. They take their Cluster from
// the stores of the page when the page reads its namespace, and otherwise read it through stores of their own (P31);
// the page publishes its reads while it is mounted, for the panel in the details of the host (P16).

import { Renderer } from "@freelensapp/extensions";
import { computed } from "mobx";
import { observer } from "mobx-react";
import React, { useEffect, useRef, useState } from "react";
import { availabilityOf, CLUSTER_DEFINITION, CLUSTER_GROUP } from "../../common/views/availability";
import { rowCells, versionRanks } from "../../common/views/cluster-cells";
import { clusterRowOf, contextVersions, indexContext, StatusMemo } from "../../common/views/context";
import { detailsAddressOf, parseDetailsAddress } from "../../common/views/details-address";
import { isListReady, isLoaded, listNotices } from "../../common/views/read-state";
import { treeParams } from "../../common/views/tree-address";
import { Cluster } from "../api/cluster/cluster-v1beta2";
import { Instant, MarkLine, MarkNote, MarksCell, MarkView } from "../components/marks";
import { NoticeView } from "../components/notice";
import { ClusterDetailsDrawer } from "../details/cluster-details-drawer";
import { publishPageSource } from "../reads/cluster-source";
import { DefinitionReads } from "../reads/definitions";
import { frameContextOf } from "../reads/frame-context";
import { PageReads, storeKey, storesKey } from "../reads/page-reads";
import {
  clustersKind,
  contextKinds,
  controlPlaneKinds,
  infrastructureKinds,
  referencesOf,
  storeOfModel,
  uniqueStores,
} from "../reads/page-stores";
import styles from "./clusters-page.module.scss";
import { TREE_PAGE } from "./page-ids";

import type { Common } from "@freelensapp/extensions";

import type { ReactNode } from "react";

import type { ClusterObject } from "../../common/status/index";
import type { Availability } from "../../common/views/availability";
import type { RowCells } from "../../common/views/cluster-cells";
import type { ContextIndex, ContextObjects, KindObjects, ProviderKindObjects } from "../../common/views/context";
import type { KindDescriptor, ReadsState } from "../../common/views/read-state";
import type { ClusterApi } from "../api/cluster/cluster-v1beta2";
import type { ViewHost } from "../details/cluster-details-v1beta2";
import type { ClusterSource } from "../reads/cluster-source";
import type { ContextKinds, PageStore, ProviderKind, ReadKind } from "../reads/page-stores";
import type { HostStore } from "../reads/store-adapter";

const {
  Component: { KubeObjectAge, KubeObjectListLayout, NamespaceSelectBadge, Spinner, WithTooltip },
} = Renderer;

// The id of the list, under which the host keeps its sort, in one place that every extension shares (P5).
export const TABLE_ID = "clusterApiClustersTable";

export const PAGE_TITLE = Cluster.crd.title;

// The title of a column, in a flat badge of the host that never expands, as the content of a cell is: a title that its
// column does not hold is cut by the badge with an ellipsis, and the tooltip of the badge carries it whole.
function head(title: string) {
  return (
    <WithTooltip expandable={false} data-testid="capi-clusters-head">
      {title}
    </WithTooltip>
  );
}

// The columns, in this order (P7): those of the domain, then those of state.
export const COLUMNS = [
  { title: head("Name"), id: "name", sortBy: "name", className: styles.name },
  { title: head("Namespace"), id: "namespace", sortBy: "namespace", className: styles.namespace },
  { title: head("Control plane"), id: "control-plane", sortBy: "controlPlane", className: styles.controlPlane },
  { title: head("Workers"), id: "workers", sortBy: "workers", className: styles.workers },
  { title: head("Version"), id: "version", sortBy: "version", className: styles.version },
  { title: head("ClusterClass"), id: "cluster-class", sortBy: "clusterClass", className: styles.clusterClass },
  { title: head("Activity"), id: "activity", sortBy: "activity", className: styles.activity },
  { title: head("Condition"), id: "condition", sortBy: "condition", className: styles.condition },
  { title: head("Status"), id: "status", sortBy: "status", className: styles.status },
  { title: head("Age"), id: "age", sortBy: "age", className: styles.age },
];

// A row whose marks of state show the spinner sorts after every other (P28).
const PENDING_RANK = Number.MAX_SAFE_INTEGER;

// The versions of the group of Cluster API at which the host registered an API of Clusters, from its registry, which
// sends no request (P20).
function clusterVersions(): string[] {
  const versions: string[] = [];

  Renderer.K8sApi.apiManager.getApi((api) => {
    const apiVersion = api.apiVersionWithGroup ?? "";

    if (api.kind === "Cluster" && apiVersion.startsWith(`${CLUSTER_GROUP}/`)) {
      versions.push(apiVersion.slice(CLUSTER_GROUP.length + 1));
    }
    return false;
  });
  return versions;
}

export function availability(): Availability {
  const store = Renderer.K8sApi.crdStore;

  return availabilityOf({
    definitions: store.failedLoading ? "failed" : store.isLoaded ? "loaded" : "loading",
    hasClusterDefinition: store.items.some((definition) => definition.getName() === CLUSTER_DEFINITION),
    clusterVersions: clusterVersions(),
  });
}

// What a state before the list says (P20), which the page of the tree says as well (SPEC-0005, P19).
export function availabilityWords(state: Exclude<Availability, { state: "list" }>): ReactNode {
  switch (state.state) {
    case "checking":
      return "Checking whether this cluster serves Cluster API";
    case "not-installed":
      return (
        <>
          Cluster API is not installed in this cluster: it serves no Cluster at <code>cluster.x-k8s.io/v1beta2</code>
        </>
      );
    case "older":
      return (
        <>
          This cluster serves Clusters at {state.versions.map((version) => version).join(", ")} alone, which this
          extension does not read: it reads <code>cluster.x-k8s.io/v1beta2</code>, which came with Cluster API v1.11
        </>
      );
  }
}

// A state before the list, in the place of the layout, under the title of the page (P20).
function PageState({ availability: state }: { availability: Exclude<Availability, { state: "list" }> }) {
  const words = availabilityWords(state);

  return (
    <div className={styles.page} data-testid="capi-clusters-page">
      <h5 className={styles.title}>{PAGE_TITLE}</h5>
      <div className={styles.state} role="status" data-testid={`capi-clusters-${state.state}`}>
        {words}
      </div>
    </div>
  );
}

function objectsOf(kind: ReadKind): KindObjects<never> {
  return {
    key: kind.store === undefined ? undefined : storeKey(kind.store),
    items: (kind.store?.items ?? []) as never[],
  };
}

// What the page reads: the kinds of the context, and those of control plane and of infrastructure cluster that the
// references of the rows name, the store of each once, in the order of the page (P1 to P3, P19); the details show the
// infrastructure cluster. They are read in the render: the host makes the store of a kind of a definition when it is
// first asked for it, which a derivation of mobx may not do.
interface PageKinds {
  readonly referenceIds: readonly string[];
  readonly context: ContextKinds;
  readonly controlPlanes: ReadonlyMap<string, ProviderKind>;
  readonly infrastructures: ReadonlyMap<string, ProviderKind>;
  readonly readKinds: readonly ReadKind[];
  readonly stores: readonly PageStore[];
}

function pageKinds(items: readonly Cluster[], clusterStore: PageStore, definitions: DefinitionReads): PageKinds {
  // The kinds of a provider that the references of the listed Clusters name (P3).
  const controlPlaneReferences = referencesOf(items, "controlPlaneRef");
  const infrastructureReferences = referencesOf(items, "infrastructureRef");
  const context = contextKinds();
  const controlPlanes = controlPlaneKinds([...controlPlaneReferences.values()], definitions);
  const infrastructures = infrastructureKinds([...infrastructureReferences.values()], definitions);
  const readKinds = [
    context.machines,
    context.machineSets,
    context.machineDeployments,
    context.machinePools,
    context.kubeadmControlPlanes,
    context.healthChecks,
    context.clusterClasses,
    ...context.operator,
    ...controlPlanes.values(),
    ...infrastructures.values(),
  ];

  return {
    referenceIds: [...new Set([...controlPlaneReferences.keys(), ...infrastructureReferences.keys()])].sort(),
    context,
    controlPlanes,
    infrastructures,
    readKinds,
    stores: uniqueStores([clustersKind(clusterStore), ...readKinds]),
  };
}

function providerObjectsOf(kinds: ReadonlyMap<string, ProviderKind>): Map<string, ProviderKindObjects> {
  return new Map(
    [...kinds].map(([id, kind]): [string, ProviderKindObjects] => [
      id,
      { ...objectsOf(kind), resolution: kind.resolution },
    ]),
  );
}

function contextObjectsOf(reads: ReadsState, { context, controlPlanes, infrastructures }: PageKinds): ContextObjects {
  return {
    reads,
    machines: objectsOf(context.machines),
    machineSets: objectsOf(context.machineSets),
    machineDeployments: objectsOf(context.machineDeployments),
    machinePools: objectsOf(context.machinePools),
    healthChecks: objectsOf(context.healthChecks),
    clusterClasses: objectsOf(context.clusterClasses),
    operator: context.operator.map((kind) => objectsOf(kind)),
    controlPlanes: providerObjectsOf(controlPlanes),
    infrastructures: providerObjectsOf(infrastructures),
  };
}

// The kinds that the notices of the page name, each once, by its store, as its model names it when it has one; the
// Clusters apart.
function noticeKindsOf(kinds: PageKinds, clusterStore: PageStore): (ReadKind & { readonly key: string })[] {
  const found = new Map<string, ReadKind & { readonly key: string }>();

  for (const kind of kinds.readKinds) {
    const key = kind.store === undefined || kind.store === clusterStore ? undefined : storeKey(kind.store);

    if (key !== undefined && !found.has(key)) found.set(key, { ...kind, key });
  }
  return [...found.values()];
}

// What the page keeps for its mount: the reads of its stores, the definitions it read, the results of the model, the
// rows, computed once for each change of the items of the store of Clusters or of the state of the reads, and the
// indexes of the context of the model.
class ListModel {
  readonly reads: PageReads;
  readonly definitions = new DefinitionReads();
  readonly memo = new StatusMemo();
  readonly clusterStore: PageStore;
  readonly clustersKey: string;
  #index: { readonly reads: ReadsState; readonly versions: string; readonly index: ContextIndex } | undefined;

  // The Clusters of the namespaces that the page has loaded: the rows of the list (P19).
  readonly #items = computed(() =>
    (this.clusterStore.items as Cluster[]).filter((cluster) =>
      isLoaded(this.reads.state, this.clustersKey, cluster.getNs() ?? ""),
    ),
  );

  constructor(clusterStore: PageStore) {
    this.clusterStore = clusterStore;
    this.clustersKey = storeKey(clusterStore);
    // The header of the layout counts the rows that the page gives it.
    this.reads = new PageReads(frameContextOf(clusterStore.api as ClusterApi), () => this.items.length);
  }

  get items(): Cluster[] {
    return this.#items.get();
  }

  // The indexes of the context of the model, built again only when what they read changes: the state of the reads,
  // and the key, the identity and the version of every object of every store of the page, and how each reference of a
  // control plane resolves; never at a render or a tick of the timer that changes none of them, and never keyed on the
  // arrays of the stores, which the host changes in place (AGENTS.md, "Rules That Fail Silently"; SPEC-0004,
  // `context.test.ts`; kit, `docs/design.md`, "Interaction and performance").
  indexOf(objects: ContextObjects): ContextIndex {
    const versions = contextVersions(objects);

    if (this.#index === undefined || this.#index.reads !== objects.reads || this.#index.versions !== versions) {
      this.#index = { reads: objects.reads, versions, index: indexContext(objects) };
    }
    return this.#index.index;
  }
}

// The reads of the page, as a view of one Cluster takes them when the page reads the namespace of its Cluster: its
// details, and the panel in the details of the host while the page is mounted (P16, P31).
class PageSource implements ClusterSource {
  readonly #model: ListModel;

  constructor(model: ListModel) {
    this.#model = model;
  }

  get reads(): ReadsState {
    return this.#model.reads.state;
  }

  get definitions(): DefinitionReads {
    return this.#model.definitions;
  }

  #kinds(): PageKinds {
    return pageKinds(this.#model.items, this.#model.clusterStore, this.#model.definitions);
  }

  clusters(): KindObjects<ClusterObject> {
    return objectsOf(clustersKind(this.#model.clusterStore));
  }

  objects(): ContextObjects {
    return contextObjectsOf(this.reads, this.#kinds());
  }

  // The indexes that the list builds, once for each change of what they read, and not again for the details.
  index(): ContextIndex {
    return this.#model.indexOf(this.objects());
  }

  kinds(): (KindDescriptor & { readonly key: string })[] {
    const clusters = clustersKind(this.#model.clusterStore);

    return [{ ...clusters, key: this.#model.clustersKey }, ...noticeKindsOf(this.#kinds(), this.#model.clusterStore)];
  }
}

// The count of the header, in the place of which the page puts nothing while the list is not ready, since no read
// has ended that it counts, and "not counted" when a read failed and no row is listed (P25). Every other child of the
// `info` that the layout hands the customizers of a page is kept: the marks of the host follow the count there.
type HeaderInfo = Renderer.Component.HeaderPlaceholders["info"];

function replaceCount(info: HeaderInfo, count: ReactNode): HeaderInfo {
  if (React.isValidElement<{ children?: ReactNode }>(info) && info.type === React.Fragment) {
    const children = [info.props.children].flat();

    return React.cloneElement(info, undefined, count, ...children.slice(1));
  }
  return <>{count}</>;
}

function CountersView({ cell, testId }: { cell: RowCells["controlPlane"]; testId: string }) {
  return (
    <WithTooltip
      tooltip={<div className={styles.tooltip}>{cell.tooltip.join("\n")}</div>}
      expandable={false}
      data-testid={testId}
    >
      {cell.text}
    </WithTooltip>
  );
}

// The activities, on one line, with every activity, its state and its duration in the tooltip of the cell.
function ActivityView({ cell }: { cell: RowCells["activity"] }) {
  return (
    <MarksCell
      tooltip={cell.marks.map((mark, index) => <MarkLine key={`${mark.word}-${index}`} mark={mark} />)}
      data-testid="capi-cluster-activities"
    >
      {cell.marks.map((mark, index) => (
        <MarkView key={`${mark.word}-${index}`} mark={mark} data-testid="capi-cluster-activity" />
      ))}
    </MarksCell>
  );
}

function poolsWords(count: number): string {
  return `${count === 1 ? "1 MachinePool" : `${count} MachinePools`} of unknown health`;
}

// The health, on one line, with the word stale and the note of the MachinePools of unknown health, and all of it in
// the tooltip of the cell, each cause of stale with when it began (P12).
function HealthView({ cell }: { cell: RowCells["health"] }) {
  if (cell.mark === undefined) {
    return (
      <WithTooltip
        tooltip={cell.none === "deleting" ? "No health: the Cluster is deleting" : "No health"}
        expandable={false}
        data-testid="capi-cluster-health"
      >
        N/A
      </WithTooltip>
    );
  }

  const tooltip = (
    <>
      <MarkLine mark={cell.mark} />
      {cell.stale.map((cause) => (
        <div key={cause.cause}>
          {`Stale: ${cause.cause}`}
          {cause.detail === undefined ? null : `, ${cause.detail}`}
          {cause.since === undefined ? null : (
            <>
              {", since "}
              <Instant since={cause.since} />
            </>
          )}
        </div>
      ))}
      {cell.poolsUnknown === 0 ? null : <div>{poolsWords(cell.poolsUnknown)}</div>}
    </>
  );

  return (
    <MarksCell tooltip={tooltip} data-testid="capi-cluster-condition">
      <MarkView mark={cell.mark} data-testid="capi-cluster-health" />
      {cell.stale.length === 0 ? null : (
        <MarkView mark={{ word: "stale", tone: "vague" }} data-testid="capi-cluster-stale" />
      )}
      {cell.poolsUnknown === 0 ? null : <MarkNote>{poolsWords(cell.poolsUnknown)}</MarkNote>}
    </MarksCell>
  );
}

function StatusView({ cell }: { cell: RowCells["status"] }) {
  const tooltip = cell.reported ? (
    <div className={styles.tooltip}>
      {cell.lines.length === 0
        ? cell.text
        : cell.lines.map((line, index) => (
            <div key={`line-${index}`} style={{ paddingLeft: `${line.indentation / 2}em` }}>
              {line.text}
            </div>
          ))}
    </div>
  ) : (
    "This Cluster reports no Available condition yet"
  );

  return (
    <WithTooltip tooltip={tooltip} expandable={false} data-testid="capi-cluster-status">
      {cell.text}
    </WithTooltip>
  );
}

// The parameter of the page that holds the address of the details (P6), as the host gives it.
type DetailsParam = Renderer.Navigation.PageParam<string>;

interface ClustersListProps {
  readonly clusterStore: PageStore;
  readonly details: DetailsParam | undefined;
  readonly extension: Renderer.LensExtension;
}

// The list of the Clusters, from the store of the host for Clusters at v1beta2.
const ClustersList = observer(({ clusterStore, details, extension }: ClustersListProps) => {
  const [model] = useState(() => new ListModel(clusterStore));
  const [source] = useState(() => new PageSource(model));
  const [, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const state = model.reads.state;
  const clustersKey = model.clustersKey;
  const items = model.items;
  const kinds = pageKinds(items, clusterStore, model.definitions);
  const { referenceIds, stores } = kinds;
  // The key of the layout: the set of its stores, each by its identity, so that rows that change their order mount
  // nothing again (P19).
  const layoutKey = storesKey(stores);
  const referencesKey = referenceIds.join(" ");
  const clusterAdapter = model.reads.adapterOf(clusterStore as unknown as HostStore<Cluster>);
  const dependentAdapters = stores
    .filter((store) => store !== clusterStore)
    .map((store) => model.reads.adapterOf(store));
  const index = model.indexOf(contextObjectsOf(state, kinds));
  const now = Date.now();

  model.memo.sweep();

  const rows = new Map(
    items.map((cluster) => {
      const row = clusterRowOf(index, cluster, now, model.memo);

      return [cluster.getId(), { row, cells: rowCells(row) }] as const;
    }),
  );
  const ranks = versionRanks([...rows.values()].map(({ cells }) => cells.version.first));
  const cellsOf = (cluster: Cluster): RowCells | undefined => rows.get(cluster.getId())?.cells;
  const notices = listNotices(
    state,
    { ...clustersKind(clusterStore), key: clustersKey },
    noticeKindsOf(kinds, clusterStore),
    items.length,
  );
  const ready = isListReady(state, clustersKey, items.length);
  const header = !ready ? "none" : notices.notCounted ? "not-counted" : "count";
  const next = [...rows.values()]
    .map(({ row }) => row.status.changesAt)
    .filter((instant): instant is number => instant !== undefined && instant > now)
    .reduce<number | undefined>(
      (earliest, instant) => (earliest === undefined ? instant : Math.min(earliest, instant)),
      undefined,
    );
  // The store of definitions failing after the mount sends the GETs that it no longer answers (P3).
  const definitionsFailed = Renderer.K8sApi.crdStore.failedLoading;
  const address = parseDetailsAddress(details?.get());
  const openDetails = (namespace: string, name: string) => details?.set(detailsAddressOf(namespace, name));
  // The tree of a Cluster, from the row Tree of its details and from their references to an object of Cluster API
  // (SPEC-0005, P3, P5).
  const openTree = (namespace: string, name: string, node?: string) =>
    void extension.navigate(TREE_PAGE, treeParams(namespace, name, node));
  const host: ViewHost = { extension, openCluster: openDetails, openTree };
  // The name of a Cluster in the list, which gets the focus back when its details close (P15).
  const focusName = (value: string) => {
    const names = root.current?.querySelectorAll<HTMLElement>("[data-capi-cluster]") ?? [];

    [...names].find((name) => name.dataset.capiCluster === value)?.focus();
  };

  useEffect(() => model.reads.followFilter(), [model]);

  // The reads of the page, for the panel in the details of the host, while the page is mounted (P16).
  useEffect(() => publishPageSource(source), [source]);

  // A store that leaves the set of the page loses what it loaded (P19).
  useEffect(() => model.reads.retain(layoutKey.split(" ")), [model, layoutKey]);

  // The GET of a definition that the store of definitions does not give, from an effect, never from a render (P3).
  useEffect(() => {
    model.definitions.request(
      referencesKey
        .split(" ")
        .filter((id) => id !== "")
        .map((id) => ({ group: id.slice(0, id.lastIndexOf("/")), kind: id.slice(id.lastIndexOf("/") + 1) })),
    );
  }, [model, referencesKey, definitionsFailed]);

  // The model is evaluated again at the earliest time that a result names, and not at every tick.
  useEffect(() => {
    if (next === undefined) return undefined;

    const timer = setTimeout(() => setTick((tick) => tick + 1), Math.max(0, next - Date.now()));

    return () => clearTimeout(timer);
  }, [next]);

  const sortingCallbacks = {
    name: (cluster: Cluster) => cluster.getName(),
    namespace: (cluster: Cluster) => cluster.getNs() ?? "",
    controlPlane: (cluster: Cluster) => [...(cellsOf(cluster)?.controlPlane.sort ?? [])],
    workers: (cluster: Cluster) => [...(cellsOf(cluster)?.workers.sort ?? [])],
    version: (cluster: Cluster) => ranks.get(cellsOf(cluster)?.version.first ?? "") ?? PENDING_RANK,
    clusterClass: (cluster: Cluster) => [...(cellsOf(cluster)?.clusterClass.sort ?? [])],
    activity: (cluster: Cluster) => {
      const cells = cellsOf(cluster);

      return cells === undefined || cells.pending ? PENDING_RANK : cells.activity.sort;
    },
    condition: (cluster: Cluster) => {
      const cells = cellsOf(cluster);

      return cells === undefined || cells.pending ? PENDING_RANK : cells.health.sort;
    },
    status: (cluster: Cluster) => cellsOf(cluster)?.status.text ?? "",
    // As the lists of the host sort it, so that the arrow of the column means what it means there.
    age: (cluster: Cluster) => -cluster.getCreationTimestamp(),
  };

  const inPlaceOfRows = ready && items.length === 0 ? notices.inPlaceOfRows : undefined;

  return (
    <div className={styles.page} data-testid="capi-clusters-page" ref={root}>
      {notices.overList.length === 0 ? null : (
        <div className={styles.notices}>
          {notices.overList.map((notice) => (
            <NoticeView key={notice.id} notice={notice} />
          ))}
        </div>
      )}
      <KubeObjectListLayout<Cluster, ClusterApi>
        key={layoutKey}
        tableId={TABLE_ID}
        className={styles.list}
        store={clusterAdapter}
        dependentStores={dependentAdapters}
        items={items}
        isReady={ready}
        // No selection and no menu in the rows, and no remove button of the host whatever its store holds selected
        // (SPEC-0001, A7; P19). The menu of each row is an empty cell, as the header always has one, so that the
        // columns of the rows line up with their heads; with no menu of the host registered, a right click opens
        // nothing. The own key `onRemove` holds undefined, which the layout spreads over its own. A click on a row
        // opens the details of the extension, never those of the host (P13, P15).
        isSelectable={false}
        renderItemMenu={() => null}
        addRemoveButtons={{ onRemove: undefined }}
        onDetails={(cluster: Cluster) => openDetails(cluster.getNs() ?? "", cluster.getName())}
        renderHeaderTitle={PAGE_TITLE}
        customizeHeader={
          header === "count"
            ? undefined
            : ({ info, ...placeholders }) => ({
                ...placeholders,
                info: replaceCount(
                  info,
                  header === "none" ? null : <span data-testid="capi-clusters-not-counted">not counted</span>,
                ),
              })
        }
        tableProps={inPlaceOfRows === undefined ? {} : { noItems: <NoticeView notice={inPlaceOfRows} inPlaceOfRows /> }}
        searchFilters={[
          (cluster: Cluster) => cluster.getSearchFields(),
          (cluster: Cluster) => [...(cellsOf(cluster)?.search ?? [])],
        ]}
        sortingCallbacks={sortingCallbacks}
        renderTableHeader={COLUMNS}
        renderTableContents={(cluster: Cluster) => {
          const cells = cellsOf(cluster);

          return [
            // The name is a button, which the keyboard reaches, and a click on it stops at it (P13).
            <WithTooltip tooltip={cluster.getName()} expandable={false} data-testid="capi-cluster-name">
              <button
                type="button"
                className={styles.nameButton}
                data-capi-cluster={detailsAddressOf(cluster.getNs() ?? "", cluster.getName())}
                onClick={(event) => {
                  event.stopPropagation();
                  openDetails(cluster.getNs() ?? "", cluster.getName());
                }}
              >
                {cluster.getName()}
              </button>
            </WithTooltip>,
            <NamespaceSelectBadge namespace={cluster.getNs() ?? ""} />,
            cells === undefined ? null : <CountersView cell={cells.controlPlane} testId="capi-cluster-control-plane" />,
            cells === undefined ? null : <CountersView cell={cells.workers} testId="capi-cluster-workers" />,
            cells === undefined ? null : (
              <WithTooltip
                tooltip={<div className={styles.tooltip}>{cells.version.tooltip.join("\n")}</div>}
                expandable={false}
                data-testid="capi-cluster-version"
              >
                {cells.version.text}
              </WithTooltip>
            ),
            cells === undefined ? null : (
              <WithTooltip tooltip={cells.clusterClass.tooltip} expandable={false} data-testid="capi-cluster-class">
                {cells.clusterClass.text}
              </WithTooltip>
            ),
            cells === undefined || cells.pending ? <Spinner /> : <ActivityView cell={cells.activity} />,
            cells === undefined || cells.pending ? <Spinner /> : <HealthView cell={cells.health} />,
            cells === undefined ? null : <StatusView cell={cells.status} />,
            <KubeObjectAge object={cluster} />,
          ];
        }}
      />
      <ClusterDetailsDrawer
        address={address}
        page={source}
        host={host}
        close={() => details?.clear()}
        focusName={focusName}
      />
    </div>
  );
});

export interface ClustersPageProps extends Common.Types.PageComponentProps {
  // The extension, from the registration of the page (AGENTS.md, "Renderer Components"), whose error boundaries the
  // details take.
  readonly extension: Renderer.LensExtension;
}

// The page of the Clusters: the list once the cluster serves them at v1beta2, else the state that says why not. The
// list is keyed by the identity of the store of Clusters, so that a store that the host replaces starts a new list.
export const ClustersPage = observer(({ params, extension }: ClustersPageProps) => {
  const state = availability();
  const clusterStore = state.state === "list" ? storeOfModel(Cluster) : undefined;
  const details = params.details as DetailsParam | undefined;

  if (state.state !== "list") return <PageState availability={state} />;
  // The host registers the store of an API with the API: until then, it is still checking.
  if (clusterStore === undefined) return <PageState availability={{ state: "checking" }} />;
  return (
    <ClustersList key={storeKey(clusterStore)} clusterStore={clusterStore} details={details} extension={extension} />
  );
});
