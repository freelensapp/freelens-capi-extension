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
// through one adapter of the page, and keys the layout by the set of its stores, so that a store that appears later
// mounts the layout again with it; and it says what the host hands it of the reads in words, in the place of the rows
// or over the list (P25, P34). It evaluates the model with the time of the evaluation, and again at the earliest time that a result
// names. It is an `observer`, and follows when the host registers the API of Clusters (AGENTS.md, "Rules That Fail
// Silently").
//
// The details of the extension, which a row opens, come with the second pull request of SPEC-0004: until then a row
// opens nothing, and never the details of the host, whose menu SPEC-0001, A7 keeps away from the list.

import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { availabilityOf, CLUSTER_DEFINITION, CLUSTER_GROUP } from "../../common/views/availability";
import { rowCells, versionRanks } from "../../common/views/cluster-cells";
import { clusterRowOf, indexContext, StatusMemo } from "../../common/views/context";
import { isListReady, isLoaded, listNotices } from "../../common/views/read-state";
import { contractReferenceOf } from "../../common/views/references";
import { Cluster } from "../api/cluster/cluster-v1beta2";
import { Instant, MarkNote, Marks, MarkView } from "../components/marks";
import { NoticeView } from "../components/notice";
import { DefinitionReads } from "../reads/definitions";
import { frameContextOf } from "../reads/frame-context";
import { keyOf, PageReads } from "../reads/page-reads";
import { clustersKind, contextKinds, controlPlaneKinds, storeOfModel, uniqueStores } from "../reads/page-stores";
import styles from "./clusters-page.module.scss";

import type { ReactNode } from "react";

import type { Availability } from "../../common/views/availability";
import type { RowCells } from "../../common/views/cluster-cells";
import type { ContextObjects, ControlPlaneObjects, KindObjects } from "../../common/views/context";
import type { ContractReference } from "../../common/views/references";
import type { ClusterApi } from "../api/cluster/cluster-v1beta2";
import type { PageStore, ReadKind } from "../reads/page-stores";
import type { HostStore } from "../reads/store-adapter";

const {
  Component: { KubeObjectAge, KubeObjectListLayout, NamespaceSelectBadge, Spinner, WithTooltip },
} = Renderer;

// The id of the list, under which the host keeps its sort, in one place that every extension shares (P5).
export const TABLE_ID = "clusterApiClustersTable";

export const PAGE_TITLE = Cluster.crd.title;

// The columns, in this order (P7): those of the domain, then those of state.
export const COLUMNS = [
  { title: "Name", id: "name", sortBy: "name", className: styles.name },
  { title: "Namespace", id: "namespace", sortBy: "namespace", className: styles.namespace },
  { title: "Control plane", id: "control-plane", sortBy: "controlPlane", className: styles.controlPlane },
  { title: "Workers", id: "workers", sortBy: "workers", className: styles.workers },
  { title: "Version", id: "version", sortBy: "version", className: styles.version },
  { title: "ClusterClass", id: "cluster-class", sortBy: "clusterClass", className: styles.clusterClass },
  { title: "Activity", id: "activity", sortBy: "activity", className: styles.activity },
  { title: "Condition", id: "condition", sortBy: "condition", className: styles.condition },
  { title: "Status", id: "status", sortBy: "status", className: styles.status },
  { title: "Age", id: "age", sortBy: "age", className: styles.age },
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

function availability(): Availability {
  const store = Renderer.K8sApi.crdStore;

  return availabilityOf({
    definitions: store.failedLoading ? "failed" : store.isLoaded ? "loaded" : "loading",
    hasClusterDefinition: store.items.some((definition) => definition.getName() === CLUSTER_DEFINITION),
    clusterVersions: clusterVersions(),
  });
}

// A state before the list, in the place of the layout, under the title of the page (P20).
function PageState({ availability: state }: { availability: Exclude<Availability, { state: "list" }> }) {
  let words: ReactNode;

  switch (state.state) {
    case "checking":
      words = "Checking whether this cluster serves Cluster API";
      break;
    case "not-installed":
      words = (
        <>
          Cluster API is not installed in this cluster: it serves no Cluster at <code>cluster.x-k8s.io/v1beta2</code>
        </>
      );
      break;
    case "older":
      words = (
        <>
          This cluster serves Clusters at {state.versions.map((version) => version).join(", ")} alone, which this
          extension does not read: it reads <code>cluster.x-k8s.io/v1beta2</code>, which came with Cluster API v1.11
        </>
      );
      break;
  }
  return (
    <div className={styles.page} data-testid="capi-clusters-page">
      <h5 className={styles.title}>{PAGE_TITLE}</h5>
      <div className={styles.state} role="status" data-testid={`capi-clusters-${state.state}`}>
        {words}
      </div>
    </div>
  );
}

// What the page keeps for its mount: the reads of its stores, the definitions it read, and the results of the model.
class ListModel {
  readonly reads: PageReads;
  readonly definitions = new DefinitionReads();
  readonly memo = new StatusMemo();
  #rows: () => number = () => 0;

  constructor(api: ClusterApi) {
    this.reads = new PageReads(frameContextOf(api), () => this.#rows());
  }

  // The rows that the page gives the layout, which its header counts.
  countRowsWith(rows: () => number): void {
    this.#rows = rows;
  }
}

function objectsOf(kind: ReadKind): KindObjects<never> {
  return {
    key: kind.store === undefined ? undefined : keyOf(kind.store),
    items: (kind.store?.items ?? []) as never[],
  };
}

// The count of the header, in the place of which a read that failed with no row listed puts "not counted", every
// other child of the `info` that the layout hands the customizers of a page kept: the marks of the host follow the
// count there (P25).
type HeaderInfo = Renderer.Component.HeaderPlaceholders["info"];

function notCounted(info: HeaderInfo): HeaderInfo {
  const count = <span data-testid="capi-clusters-not-counted">not counted</span>;

  if (React.isValidElement<{ children?: ReactNode }>(info) && info.type === React.Fragment) {
    const children = [info.props.children].flat();

    return React.cloneElement(info, undefined, count, ...children.slice(1));
  }
  return count;
}

function CountersView({ cell, testId }: { cell: RowCells["controlPlane"]; testId: string }) {
  return (
    <WithTooltip tooltip={<div className={styles.tooltip}>{cell.tooltip.join("\n")}</div>} data-testid={testId}>
      {cell.text}
    </WithTooltip>
  );
}

function ActivityView({ cell }: { cell: RowCells["activity"] }) {
  return (
    <Marks>
      {cell.marks.map((mark, index) => (
        <MarkView key={`${mark.word}-${index}`} mark={mark} data-testid="capi-cluster-activity" />
      ))}
    </Marks>
  );
}

function HealthView({ cell }: { cell: RowCells["health"] }) {
  if (cell.mark === undefined) {
    return (
      <WithTooltip
        tooltip={cell.none === "deleting" ? "No health: the Cluster is deleting" : "No health"}
        data-testid="capi-cluster-health"
      >
        N/A
      </WithTooltip>
    );
  }

  const stale = (
    <div className={styles.tooltip}>
      {cell.stale.map((cause) => (
        <div key={cause.cause}>
          {cause.cause}
          {cause.detail === undefined ? null : `, ${cause.detail}`}
          {cause.since === undefined ? null : (
            <>
              {", since "}
              <Instant since={cause.since} />
            </>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Marks>
      <MarkView mark={cell.mark} data-testid="capi-cluster-health" />
      {cell.stale.length === 0 ? null : (
        <MarkView mark={{ word: "stale", tone: "vague" }} tooltip={stale} data-testid="capi-cluster-stale" />
      )}
      {cell.poolsUnknown === 0 ? null : (
        <MarkNote>
          {cell.poolsUnknown === 1 ? "1 MachinePool" : `${cell.poolsUnknown} MachinePools`} of unknown health
        </MarkNote>
      )}
    </Marks>
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
    <WithTooltip tooltip={tooltip} data-testid="capi-cluster-status">
      {cell.text}
    </WithTooltip>
  );
}

// The list of the Clusters, from the store of the host for Clusters at v1beta2.
const ClustersList = observer(({ clusterStore }: { clusterStore: PageStore }) => {
  const [model] = useState(() => new ListModel(clusterStore.api as ClusterApi));
  const [, setTick] = useState(0);
  const state = model.reads.state;
  const clustersKey = keyOf(clusterStore);
  const items = (clusterStore.items as Cluster[]).filter((cluster) =>
    isLoaded(state, clustersKey, cluster.getNs() ?? ""),
  );

  model.countRowsWith(
    () =>
      (clusterStore.items as Cluster[]).filter((cluster) =>
        isLoaded(model.reads.state, clustersKey, cluster.getNs() ?? ""),
      ).length,
  );

  // The kinds of control plane that the references of the listed Clusters name (P3).
  const references = new Map<string, ContractReference>();

  for (const cluster of items) {
    const reference = contractReferenceOf(cluster.spec?.controlPlaneRef);

    if (reference !== undefined) references.set(`${reference.apiGroup}/${reference.kind}`, reference);
  }

  const referencesKey = [...references.keys()].sort().join(" ");
  const context = contextKinds();
  const controlPlanes = controlPlaneKinds([...references.values()], model.definitions);
  const clusters = clustersKind(clusterStore);
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
  ];
  const stores = uniqueStores([clusters, ...readKinds]);
  const clusterAdapter = model.reads.adapterOf(clusterStore as unknown as HostStore<Cluster>);
  const dependentAdapters = stores
    .filter((store) => store !== clusterStore)
    .map((store) => model.reads.adapterOf(store));
  const now = Date.now();
  const index = indexContext({
    reads: state,
    machines: objectsOf(context.machines),
    machineSets: objectsOf(context.machineSets),
    machineDeployments: objectsOf(context.machineDeployments),
    machinePools: objectsOf(context.machinePools),
    healthChecks: objectsOf(context.healthChecks),
    clusterClasses: objectsOf(context.clusterClasses),
    operator: context.operator.map((kind) => objectsOf(kind)),
    controlPlanes: new Map(
      [...controlPlanes].map(([id, kind]): [string, ControlPlaneObjects] => [
        id,
        { ...objectsOf(kind), resolution: kind.resolution },
      ]),
    ),
  } satisfies ContextObjects);

  model.memo.sweep();

  const rows = new Map(
    items.map((cluster) => {
      const row = clusterRowOf(index, cluster, now, model.memo);

      return [cluster.getId(), { row, cells: rowCells(row) }] as const;
    }),
  );
  const ranks = versionRanks([...rows.values()].map(({ cells }) => cells.version.first));
  const cellsOf = (cluster: Cluster): RowCells | undefined => rows.get(cluster.getId())?.cells;
  // The notices name each kind of the context once, by its store, as its model names it when it has one.
  const noticeKinds = new Map<string, ReadKind & { key: string }>();

  for (const kind of readKinds) {
    const key = kind.store === undefined || kind.store === clusterStore ? undefined : keyOf(kind.store);

    if (key !== undefined && !noticeKinds.has(key)) noticeKinds.set(key, { ...kind, key });
  }

  const notices = listNotices(state, { ...clusters, key: clustersKey }, [...noticeKinds.values()], items.length);
  const ready = isListReady(state, clustersKey, items.length);
  const next = [...rows.values()]
    .map(({ row }) => row.status.changesAt)
    .filter((instant): instant is number => instant !== undefined && instant > now)
    .reduce<number | undefined>(
      (earliest, instant) => (earliest === undefined ? instant : Math.min(earliest, instant)),
      undefined,
    );

  useEffect(() => model.reads.followFilter(), [model]);

  // The GET of a definition that the store of definitions does not give, from an effect (P3).
  useEffect(() => {
    model.definitions.request([...references.values()].map(({ apiGroup, kind }) => ({ group: apiGroup, kind })));
  }, [model, referencesKey]);

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
    age: (cluster: Cluster) => cluster.getCreationTimestamp(),
  };

  const inPlaceOfRows = ready && items.length === 0 ? notices.inPlaceOfRows : undefined;

  return (
    <div className={styles.page} data-testid="capi-clusters-page">
      {notices.overList.length === 0 ? null : (
        <div className={styles.notices}>
          {notices.overList.map((notice) => (
            <NoticeView key={notice.id} notice={notice} />
          ))}
        </div>
      )}
      <KubeObjectListLayout<Cluster, ClusterApi>
        key={stores.map(keyOf).join(" ")}
        tableId={TABLE_ID}
        className={styles.list}
        store={clusterAdapter}
        dependentStores={dependentAdapters}
        items={items}
        isReady={ready}
        // No selection and no menu in the rows, no remove button of the host whatever its store holds selected, and
        // no details of the host (SPEC-0001, A7; P19): the own key `onRemove` holds undefined, which the layout spreads
        // over its own.
        isSelectable={false}
        renderItemMenu={undefined}
        addRemoveButtons={{ onRemove: undefined }}
        hasDetailsView={false}
        onDetails={() => undefined}
        renderHeaderTitle={PAGE_TITLE}
        customizeHeader={
          notices.notCounted ? ({ info, ...placeholders }) => ({ ...placeholders, info: notCounted(info) }) : undefined
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
            <WithTooltip data-testid="capi-cluster-name">{cluster.getName()}</WithTooltip>,
            <NamespaceSelectBadge namespace={cluster.getNs() ?? ""} />,
            cells === undefined ? null : <CountersView cell={cells.controlPlane} testId="capi-cluster-control-plane" />,
            cells === undefined ? null : <CountersView cell={cells.workers} testId="capi-cluster-workers" />,
            cells === undefined ? null : (
              <WithTooltip
                tooltip={<div className={styles.tooltip}>{cells.version.tooltip.join("\n")}</div>}
                data-testid="capi-cluster-version"
              >
                {cells.version.text}
              </WithTooltip>
            ),
            cells === undefined ? null : (
              <WithTooltip tooltip={cells.clusterClass.tooltip} data-testid="capi-cluster-class">
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
    </div>
  );
});

// The page of the Clusters: the list once the cluster serves them at v1beta2, else the state that says why not.
export const ClustersPage = observer(() => {
  const state = availability();
  const clusterStore = state.state === "list" ? storeOfModel(Cluster) : undefined;

  if (state.state !== "list") return <PageState availability={state} />;
  // The host registers the store of an API with the API: until then, it is still checking.
  if (clusterStore === undefined) return <PageState availability={{ state: "checking" }} />;
  return <ClustersList key={keyOf(clusterStore)} clusterStore={clusterStore} />;
});
