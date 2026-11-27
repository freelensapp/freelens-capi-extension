/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The page of the tree of one Cluster (SPEC-0005, P1, P2, P9 to P19, P23): `cluster-tree`, with no entry in the
// sidebar, titled "Cluster Tree" with the name of its Cluster and its namespace as text, and two parameters, `cluster`,
// `<namespace>/<name>` of the Cluster, and `details`, the node whose details are open (P2).
//
// It reads its Cluster and the objects of its Cluster through the read of one Cluster with the kinds of the tree, stores
// of its own that it starts in an effect and that follow their watches (P6, P23), and never publishes that read as the
// source of the mounted page, which the panel in the details of the host would then take (P6). The spinner of the host
// stands in the place of the tree until the first load of every kind that the tree reads has ended (P13); then the
// tree is the `Table` of the host with virtual rows, `selectable`, one row for each node shown, inside an element with
// the role `treegrid`, the one stop of Tab of the tree, which takes the keys of a tree (P9, P18). The indexes and the
// tree are built once for each change of what they read, and the model is evaluated with the time of each render, and
// again at the earliest time that a result names (P16).
//
// The scroll of the list:
//
// - the virtual list of the host scrolls to its `selectedItemId` at every render, so the page gives it only in the
//   render after a key move, after the details close and for a node that the address names, and clears it once the
//   row is drawn; it then brings the row whole into view itself, by the scroll of the list's element, which the list
//   leaves half under its head at its first mount (P16; H6, H17);
// - rows that the reads insert or remove above the first row in view leave the rows in view in place: a layout effect
//   moves the scroll of the list by their height, before the paint (P13; H18); an expansion, a collapse and a search
//   move no row and scroll nothing.
//
// What the page computes is computed inside the error boundary that P17 and P19 give it, so that an error leaves the
// header, and the tree when it is in the details: the page renders its header and, inside the boundary of the tree, a
// child that builds the tree, evaluates the model, counts and searches, and renders the tree and the drawer; the drawer
// computes the details of the node inside a boundary of its own (P17, P19).
//
// The details of a node are the `Drawer` of the host over the tree (`tree-details-drawer.tsx`). A click on a row stops
// there as it opens them, so that the listener of the host on the window does not close them at once (H11), and while
// the details of the host are open over them, which the address says by `kube-details` with a value, a click on a row
// and an Escape in the empty search close those of the host first (P15, P17; H20). The names and the buttons that
// expand take no stop of Tab and no focus on a press of the mouse, whose default is prevented: their click, and that of
// a row, give the focus to the element of the tree, which keeps it through every scroll (P18; H7, H13).

import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import React, { createRef, useEffect, useLayoutEffect, useReducer, useState } from "react";
import { addressKindRead, evaluateTree, TreeBuilds } from "../../common/views/cluster-tree";
import { CLUSTERS_PERMISSION } from "../../common/views/cluster-view";
import { StatusMemo } from "../../common/views/context";
import { detailsAddressOf } from "../../common/views/details-address";
import { nodeDetailsOf, subjectNodes } from "../../common/views/node-details";
import { treeNotices } from "../../common/views/read-state";
import { parseNodeAddress, parseTreeCluster, treeParams } from "../../common/views/tree-address";
import { COLUMN_TITLES, searchWordsOf, TREE_COLUMNS, treeCellsOf } from "../../common/views/tree-cells";
import {
  activeDescendant,
  activeOf,
  CELL_ATTRIBUTES,
  HEAD_CELL_ATTRIBUTES,
  HEAD_ROW_ATTRIBUTES,
  keyAction,
  revealScroll,
  rowAttributes,
  windowRows,
} from "../../common/views/tree-keys";
import {
  countsOf,
  ROW_HEIGHT,
  revealed,
  rowsOf,
  rowsStateOf,
  scrollOffset,
  searchTree,
  toggled,
} from "../../common/views/tree-rows";
import { ErrorBoundary } from "../components/error-boundary";
import { Instant, MarkLine, MarkNote, MarksCell, MarkView } from "../components/marks";
import { NoticeView } from "../components/notice";
import { TextButton } from "../details/cluster-details-v1beta2";
import { TreeDetailsDrawer } from "../details/tree-details-drawer";
import { ClusterNamespaceRead, TREE_VIEW_KINDS } from "../reads/cluster-namespace-read";
import styles from "./cluster-tree.module.scss";
import { availability, availabilityWords } from "./clusters-page-v1beta2";
import { CLUSTERS_PAGE, TREE_PAGE } from "./page-ids";

import type { Common } from "@freelensapp/extensions";

import type { CSSProperties, ReactNode } from "react";

import type { ConditionsResult } from "../../common/status/index";
import type { ClusterTree, NodeStatus, TreeIndex, TreeNode } from "../../common/views/cluster-tree";
import type { ClusterViewState } from "../../common/views/cluster-view";
import type { NodeDetails } from "../../common/views/node-details";
import type { Notice } from "../../common/views/read-state";
import type { NodeAddress } from "../../common/views/tree-address";
import type { ConditionView, StatusView, TooltipLine, TreeCells, WordsCell } from "../../common/views/tree-cells";
import type { RowsChange, RowsState, TreeRow, TreeSearch } from "../../common/views/tree-rows";
import type { MessageLinks, ViewHost } from "../details/cluster-details-v1beta2";
import type { DrawerContent } from "../details/tree-details-drawer";

const {
  Component: {
    Badge,
    Icon,
    KubeObjectAge,
    LocaleDate,
    SearchInput,
    Spinner,
    Table,
    TableCell,
    TableHead,
    TableRow,
    WithTooltip,
  },
  Navigation,
} = Renderer;

export const PAGE_TITLE = "Cluster Tree";

const REFRESH_WORDS = "Read the tree again";
const REFRESH_WAIT = "The tree is still being read: it can be read again once it is";

// A parameter of the page, as the host gives it.
type Param = Renderer.Navigation.PageParam<string>;

// The parameter of the details of the host, `kube-details`, which holds the address of the object whose details of
// the host are open, and which `hideDetails` writes with an empty value (P17).
let hostDetails: { get(): string | undefined } | undefined;

function hostDetailsOpen(): boolean {
  hostDetails ??= Navigation.createPageParam({ name: "kube-details", defaultValue: "" });
  return (hostDetails.get() ?? "") !== "";
}

// The element of the virtual list of the table that scrolls, under its `.VirtualList` (virtual-list.tsx of Freelens).
function listElementOf(tree: HTMLElement | null): HTMLElement | null {
  return tree?.querySelector<HTMLElement>(".VirtualList > .list") ?? null;
}

// A state in the place of the tree, under the title (P19).
function TreeState({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <div className={styles.page} data-testid="capi-tree-page">
      <div className={styles.header}>
        <h5 className={styles.title}>{title}</h5>
      </div>
      <div className={styles.state} role="status" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}

function tooltipOf(lines: readonly TooltipLine[]): React.JSX.Element {
  return (
    <div className={styles.tooltip}>
      {lines.map((line, index) => (
        <div key={`${index}-${line.text}`} style={{ paddingLeft: `${line.indentation / 2}em` }}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

// The words of a cell, inside the element of the extension that cuts them with an ellipsis, a flat badge of the host
// that never expands, with the whole of them in its tooltip (P9).
function WordsView({ cell, testId }: { cell: WordsCell; testId: string }) {
  return (
    <Badge
      flat
      expandable={false}
      className={styles.content}
      label={cell.text}
      tooltip={tooltipOf(cell.tooltip)}
      data-testid={testId}
    />
  );
}

function ActivityView({ cells }: { cells: TreeCells }) {
  const { activity } = cells;

  if (activity.form === "pending") return <Spinner />;
  if (activity.form === "words") return <WordsView cell={activity.words} testId="capi-tree-activity" />;
  return (
    <MarksCell
      className={styles.content}
      tooltip={activity.cell.marks.map((mark, index) => <MarkLine key={`${mark.word}-${index}`} mark={mark} />)}
      data-testid="capi-tree-activity"
    >
      {activity.cell.marks.map((mark, index) => (
        <MarkView key={`${mark.word}-${index}`} mark={mark} data-testid="capi-tree-activity-mark" />
      ))}
    </MarksCell>
  );
}

function poolsWords(count: number): string {
  return `${count === 1 ? "1 MachinePool" : `${count} MachinePools`} of unknown health`;
}

// The cell Condition: the marks of the node, or its words, then the counts of what it holds, on one line in one element
// that cuts them, the whole of them in its tooltip (P9, P11, P12).
function ConditionCellView({ condition }: { condition: ConditionView }) {
  const { own, counts } = condition;

  if (own?.form === "pending" && counts === undefined) return <Spinner />;

  const tooltip = (
    <>
      {own?.form === "health" && own.cell.mark !== undefined ? <MarkLine mark={own.cell.mark} /> : null}
      {own?.form === "health"
        ? own.cell.stale.map((cause) => (
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
          ))
        : null}
      {own?.form === "health" && own.cell.poolsUnknown > 0 ? <div>{poolsWords(own.cell.poolsUnknown)}</div> : null}
      {own?.form === "words" ? tooltipOf(own.words.tooltip) : null}
      {counts?.form === "counts" ? <div data-testid="capi-tree-counts-tooltip">{counts.tooltip}</div> : null}
    </>
  );

  return (
    <MarksCell className={styles.content} tooltip={tooltip} data-testid="capi-tree-condition">
      {own?.form === "pending" ? <Spinner /> : null}
      {own?.form === "health" && own.cell.mark !== undefined ? (
        <MarkView mark={own.cell.mark} data-testid="capi-tree-health" />
      ) : null}
      {own?.form === "health" && own.cell.stale.length > 0 ? (
        <MarkView mark={{ word: "stale", tone: "vague" }} data-testid="capi-tree-stale" />
      ) : null}
      {own?.form === "health" && own.cell.poolsUnknown > 0 ? (
        <MarkNote>{poolsWords(own.cell.poolsUnknown)}</MarkNote>
      ) : null}
      {own?.form === "words" ? <MarkNote>{own.words.text}</MarkNote> : null}
      {counts === undefined ? null : counts.form === "pending" ? (
        <Spinner data-testid="capi-tree-counts-spinner" />
      ) : (
        <MarkNote>
          <span data-testid="capi-tree-counts">{counts.text}</span>
        </MarkNote>
      )}
    </MarksCell>
  );
}

function StatusCellView({ status }: { status: StatusView }) {
  if (status.form === "pending") return <Spinner />;

  const { words, since } = status;

  return (
    <Badge
      flat
      expandable={false}
      className={styles.content}
      label={
        since === undefined ? (
          words.text
        ) : (
          <>
            {words.text}
            {" at "}
            <Instant since={since} />
          </>
        )
      }
      tooltip={tooltipOf(words.tooltip)}
      data-testid="capi-tree-status"
    />
  );
}

// What the page knows of the rows between its renders, which no render reads as a dependency of its own: the
// element of the tree, the expansions of the user, the active node, the row that the list scrolls to and the one that
// the page brings whole into view, the address revealed last, the rows of the last commit and what changed them, and
// which rows are drawn.
class TreePage {
  // The element of the tree, around the table, which takes the focus and the keys (P18).
  readonly tree = createRef<HTMLDivElement>();
  rows: RowsState | undefined;
  active: string | undefined;
  // The `selectedItemId` of the table, until its row is drawn.
  target: string | undefined;
  clearing = false;
  // The row that the page brings whole into view once it is drawn, and whether the focus then goes back to the tree.
  reveal: string | undefined;
  focusBack = false;
  revealedAddress: string | undefined;
  // The address that the page itself set from the row of its node, which it does not reveal.
  openedByRow: string | undefined;
  before: readonly TreeRow[] | undefined;
  change: RowsChange = "reads";
  // The nodes of the tree seen in this mount, for the details of one that is gone.
  readonly seen = new Set<string>();
  // The rows drawn, from a reference to an element of each row, which the virtual list mounts and unmounts with it.
  readonly drawn = new Map<string, boolean>();
  readonly #refs = new Map<string, (element: HTMLElement | null) => void>();

  // A reference to an element of the row of a node, the same function for each node, so that a render attaches none
  // again.
  refOf(id: string, changed: () => void): (element: HTMLElement | null) => void {
    let ref = this.#refs.get(id);

    if (ref === undefined) {
      ref = (element) => {
        const drawn = element !== null;

        if (this.drawn.get(id) === drawn) return;
        this.drawn.set(id, drawn);
        if (id === this.active || id === this.target) changed();
      };
      this.#refs.set(id, ref);
    }
    return ref;
  }

  // The state of the rows for this render: the expansion at first, once, with the node that the address names shown and
  // scrolled to in the first render of the tree; and a node that the address names later, as one that appears later or
  // that a link names, shown and scrolled to as it is first found, unless the page set the address itself from its
  // row (P2, P13, P16).
  rowsFor(tree: ClusterTree, statuses: ReadonlyMap<string, NodeStatus>, address: string | undefined): RowsState {
    const cluster = `${tree.root.namespace}/${tree.root.name}`;
    const named = address !== undefined && tree.nodes.has(address) ? address : undefined;

    if (named !== undefined) this.seen.add(named);
    if (this.rows === undefined || this.rows.cluster !== cluster) {
      this.rows = rowsStateOf(undefined, tree, statuses, named);
      if (named !== undefined) this.#showNode(named);
      this.revealedAddress = named;
      return this.rows;
    }
    if (named !== undefined && named !== this.revealedAddress) {
      this.revealedAddress = named;
      if (named !== this.openedByRow) {
        this.rows = revealed(this.rows, tree, named);
        this.#showNode(named);
      }
    }
    if (address === undefined) this.revealedAddress = undefined;
    return this.rows;
  }

  #showNode(id: string): void {
    this.active = id;
    this.target = id;
    this.reveal = id;
  }

  // A key move, or the closing of the details: the row of the node is scrolled to, then brought whole into view.
  moveTo(id: string, focusBack = false): void {
    this.#showNode(id);
    this.focusBack = focusBack;
  }

  // Gives the focus to the element of the tree, with no scroll (P18).
  focusTree(): void {
    this.tree.current?.focus({ preventScroll: true });
  }
}

interface TreeItem {
  getId(): string;
  getName(): string;
}

interface TreeViewProps {
  readonly namespace: string;
  readonly name: string;
  readonly details: Param | undefined;
  readonly extension: Renderer.LensExtension;
}

// What the page says in the place of the tree when its Cluster is not shown: not found, or the Clusters of its
// namespace refused, failed, or not read again after a refresh (P19).
function ClusterState({
  namespace,
  name,
  view,
  openClusters,
}: {
  namespace: string;
  name: string;
  view: Exclude<ClusterViewState<never>, { state: "found" }>;
  openClusters: () => void;
}) {
  if (view.state === "pending") return <Spinner center data-testid="capi-tree-loading" />;
  if (view.state === "not-found") {
    return (
      <div className={styles.state} role="status" data-testid="capi-tree-not-found">
        {`No Cluster ${detailsAddressOf(namespace, name)} is in the namespace ${namespace}, which was read. `}
        <TextButton onOpen={openClusters}>Open the page of the Clusters</TextButton>
      </div>
    );
  }

  const failures = [...(view.load?.failures ?? []), ...(view.refresh?.failures ?? [])];
  const refused = failures.some((failure) => failure.refused);
  const permission = `Reading them takes ${CLUSTERS_PERMISSION}, in that namespace.`;

  return (
    <div
      className={styles.state}
      role="status"
      data-testid={
        view.load === undefined
          ? "capi-tree-not-read-again"
          : view.refused
            ? "capi-tree-restricted"
            : "capi-tree-failed"
      }
    >
      <div>
        {view.load === undefined ? (
          <>
            {`The Clusters of the namespace ${namespace} could not be read again, at `}
            {view.refresh === undefined ? null : <LocaleDate date={new Date(view.refresh.at)} />}
          </>
        ) : view.refused ? (
          `You may not list the Clusters of the namespace ${namespace}.`
        ) : (
          `The Clusters of the namespace ${namespace} could not be read.`
        )}
      </div>
      {failures.map((failure, index) => (
        <p key={`failure-${index}`}>{failure.message}</p>
      ))}
      {refused ? <p>{permission}</p> : null}
    </div>
  );
}

// The page of the tree of one Cluster: its header, the title, the search, how many nodes match and the refresh, and,
// inside the error boundary of the tree, what the page computes and draws from its reads (P15, P19, P23).
const TreeView = observer(({ namespace, name, details, extension }: TreeViewProps) => {
  const [read] = useState(() => new ClusterNamespaceRead(namespace, name, TREE_VIEW_KINDS));
  const [builds] = useState(() => new TreeBuilds());
  const [memo] = useState(() => new StatusMemo());
  const [page] = useState(() => new TreePage());
  const [search, setSearch] = useState("");
  // How many nodes the search matches, which the tree says once it has searched.
  const [matches, setMatches] = useState<number | undefined>(undefined);
  const [tick, rerender] = useReducer((count: number) => count + 1, 0);
  // Closes the details, the same function for the life of the page, which reads the address and the rows that the page
  // drew last when it runs: the row of the node is scrolled to, then brought whole into view, and the focus goes back to
  // the tree when the closing asks for it (P17). The parameters of a page are the same for its life.
  const [closeDetails] = useState(() => (focusBack: boolean) => {
    const address = parseNodeAddress(details?.get());
    const id = address.state === "node" ? address.id : undefined;

    page.openedByRow = undefined;
    details?.clear();
    if (id !== undefined && (page.before ?? []).some((row) => row.node.id === id)) page.moveTo(id, focusBack);
    else if (focusBack) page.focusTree();
    rerender();
  });

  useEffect(() => read.start(), [read]);

  const shown = read.firstLoadsEnded();
  const refreshDisabled = !shown || read.firstLoadsRun();
  const address = parseNodeAddress(details?.get());

  // An Escape in the empty search closes the details: those of the host first, while they are open over those of a
  // node, since the search stops the Escape before the listener of their drawer on the window hears it (P15).
  const onSearchKey = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.code !== "Escape" || search !== "") return;
    if (hostDetailsOpen()) Navigation.hideDetails();
    else if (address.state !== "closed") closeDetails(false);
  };

  return (
    <div className={styles.page} data-testid="capi-tree-page">
      <div className={styles.header}>
        <h5 className={styles.title} data-testid="capi-tree-title">{`${PAGE_TITLE}: ${name}, ${namespace}`}</h5>
        <div className={styles.search}>
          <SearchInput
            value={search}
            autoFocus={false}
            onChange={(value) => {
              page.change = "search";
              setSearch(value);
            }}
            onKeyDown={onSearchKey}
          />
        </div>
        {search === "" || matches === undefined ? null : (
          <span className={styles.matches} data-testid="capi-tree-matches">
            {matches === 1 ? "1 node matches" : `${matches} nodes match`}
          </span>
        )}
        <Icon
          material="refresh"
          interactive
          role="button"
          aria-label={REFRESH_WORDS}
          aria-disabled={refreshDisabled}
          disabled={refreshDisabled}
          tooltip={refreshDisabled ? REFRESH_WAIT : REFRESH_WORDS}
          onClick={() => read.refresh()}
          data-testid="capi-tree-refresh"
        />
      </div>
      <ErrorBoundary extension={extension} resetKey={`${namespace}/${name}`}>
        <TreeContent
          namespace={namespace}
          name={name}
          details={details}
          extension={extension}
          read={read}
          builds={builds}
          memo={memo}
          page={page}
          search={search}
          tick={tick}
          rerender={rerender}
          closeDetails={closeDetails}
          onMatches={setMatches}
        />
      </ErrorBoundary>
    </div>
  );
});

interface TreeContentProps extends TreeViewProps {
  readonly read: ClusterNamespaceRead;
  readonly builds: TreeBuilds;
  readonly memo: StatusMemo;
  readonly page: TreePage;
  readonly search: string;
  // A count that the page moves to render the tree again after a change of what it knows of the rows.
  readonly tick: number;
  readonly rerender: () => void;
  readonly closeDetails: (focusBack: boolean) => void;
  // Tells the header how many nodes the search matches, or that it searches nothing.
  readonly onMatches: (matches: number | undefined) => void;
}

// What the page computes from its reads and draws, inside the error boundary of the tree: the indexes and the tree,
// built once for each change of what they read, the model evaluated with the time of each render, the counts, the rows,
// the search and the notices (P13 to P16, P19); then the spinner, the state of the Cluster or the tree, and the drawer
// of the details of a node.
const TreeContent = observer((props: TreeContentProps) => {
  const { namespace, name, details, extension, read, builds, memo, page, search, rerender, closeDetails, onMatches } =
    props;
  const tree = page.tree;
  const shown = read.firstLoadsEnded();
  const now = Date.now();
  const address = parseNodeAddress(details?.get());
  const addressId = address.state === "node" ? address.id : undefined;
  const openClusters = () => void extension.navigate(CLUSTERS_PAGE);
  const { index, outcome } = shown
    ? builds.treeOf(read.clusters(), read.objects(), namespace, name)
    : { index: undefined, outcome: undefined };
  const found = outcome?.state === "found" ? outcome.tree : undefined;

  memo.sweep();

  const statuses: ReadonlyMap<string, NodeStatus> =
    found !== undefined && index !== undefined ? evaluateTree(found, index, now, memo) : new Map();
  const counts = found === undefined ? new Map() : countsOf(found, statuses);
  const rowsState = found === undefined ? undefined : page.rowsFor(found, statuses, addressId);
  const matched: TreeSearch | undefined =
    found === undefined
      ? undefined
      : searchTree(found, search, (node) => searchWordsOf(found, node, statuses.get(node.id)));
  const rows = found === undefined || rowsState === undefined ? [] : rowsOf(found, rowsState.expanded, matched);
  const active = found === undefined ? undefined : activeOf(found, rows, page.active ?? found.root.id, matched);
  const notices = shown ? treeNotices(read.reads, read.kinds()) : [];
  const next = [...statuses.values()]
    .map((status) => status.status.changesAt)
    .filter((instant): instant is number => instant !== undefined && instant > now)
    .reduce<number | undefined>(
      (earliest, instant) => (earliest === undefined ? instant : Math.min(earliest, instant)),
      undefined,
    );
  const matches = matched?.matches.size;

  page.active = active;

  // The node of the address, the details of the host and the focus.
  const focusTree = () => page.focusTree();
  const openDetails = (id: string) => {
    page.openedByRow = id;
    details?.set(id);
  };
  // A node that a link of the details names: it is shown, scrolled to, and its details open, in this page (P5).
  const selectNode = (id: string) => {
    page.openedByRow = undefined;
    details?.set(id);
  };
  const toggle = (id: string) => {
    if (page.rows === undefined) return;
    page.rows = toggled(page.rows, id);
    page.change = "expansion";
    rerender();
  };
  const clickRow = (row: TreeRow) => {
    const { node } = row;

    page.active = node.id;
    if (node.form === "object" || node.form === "reference") {
      if (hostDetailsOpen()) Navigation.hideDetails();
      openDetails(node.id);
    } else if (row.expandable && node.form !== "entry") {
      page.rows = page.rows === undefined ? undefined : toggled(page.rows, node.id);
      page.change = "expansion";
    }
    focusTree();
    rerender();
  };
  const host: ViewHost = {
    extension,
    openCluster: (clusterNamespace, clusterName) =>
      void extension.navigate(CLUSTERS_PAGE, { details: detailsAddressOf(clusterNamespace, clusterName) }),
    openTree: (clusterNamespace, clusterName, node) => {
      if (clusterNamespace === namespace && clusterName === name) {
        if (node !== undefined && node !== "") selectNode(node);
        return;
      }
      void extension.navigate(TREE_PAGE, treeParams(clusterNamespace, clusterName, node));
    },
  };
  const subjects = found === undefined ? new Map<string, string>() : subjectNodes(found);
  const links: MessageLinks = {
    target: (kind, subject) => {
      const node = subjects.get(`${kind}/${subject}`);

      return node === undefined ? { form: "text" } : { form: "tree", node };
    },
    openCluster: host.openCluster,
    openNode: selectNode,
  };

  // The model is evaluated again at the earliest time that a result names, and not at every tick.
  useEffect(() => {
    if (next === undefined) return undefined;

    const timer = setTimeout(() => rerender(), Math.max(0, next - Date.now()));

    return () => clearTimeout(timer);
  }, [next, rerender]);

  // The header says how many nodes the search matches, once the tree has searched, and nothing once the tree is gone.
  useLayoutEffect(() => onMatches(matches), [matches, onMatches]);
  useLayoutEffect(() => () => onMatches(undefined), [onMatches]);

  // Once the rows of a render are in the document and before the browser paints them (P13, P16).
  useLayoutEffect(() => {
    const list = listElementOf(tree.current);
    const before = page.before;
    const change = page.change;

    page.before = rows;
    page.change = "reads";
    // Rows that the reads inserted or removed above the first row in view leave it in place, by the scroll of the list,
    // which keeps its offset when rows change above the view (H18).
    if (list !== null && before !== undefined && before !== rows) {
      const first = before[Math.floor(list.scrollTop / ROW_HEIGHT)]?.node.id;
      const offset = scrollOffset(before, rows, first, change);

      if (offset !== 0) list.scrollTop += offset;
    }
    // The row that the list scrolls to is drawn: the page clears `selectedItemId` once the list has scrolled, and then
    // brings the row whole into view, which a row that the list leaves partly in view needs.
    const target = page.target;

    if (target === undefined || page.drawn.get(target) !== true || page.clearing) return;
    page.clearing = true;
    requestAnimationFrame(() => {
      page.clearing = false;
      if (page.target === target) page.target = undefined;
      revealWhole(target, 0);
      rerender();
    });
  });

  // Brings the row of a node whole into view, once the list's element has its height, and gives the focus back to the
  // tree when the closing of the details asked for it.
  const revealWhole = (id: string, attempt: number) => {
    if (page.reveal !== id) return;

    const list = listElementOf(tree.current);
    const at = (page.before ?? []).findIndex((row) => row.node.id === id);

    if (list !== null && list.clientHeight <= 0 && attempt < 30) {
      requestAnimationFrame(() => revealWhole(id, attempt + 1));
      return;
    }
    if (list !== null) {
      const top = revealScroll(at, list.scrollTop, list.clientHeight);

      if (top !== undefined) list.scrollTop = top;
    }
    page.reveal = undefined;
    if (page.focusBack) {
      page.focusBack = false;
      focusTree();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (found === undefined || active === undefined) return;

    const list = listElementOf(tree.current);
    const action = keyAction(found, rows, active, event.key, windowRows(list?.clientHeight ?? 0));

    if (action === undefined) return;
    event.preventDefault();
    switch (action.type) {
      case "move":
        page.moveTo(action.to);
        rerender();
        break;
      case "expand":
      case "collapse":
        toggle(action.id);
        break;
      case "open":
        if (hostDetailsOpen()) Navigation.hideDetails();
        openDetails(action.id);
        break;
      case "none":
        break;
    }
  };

  const conditionsOf = (node: TreeNode): ConditionsResult | undefined => {
    const status = statuses.get(node.id);

    return status === undefined || node.form !== "object"
      ? undefined
      : memo.conditions(node.object, status.context, status.key);
  };
  const noticeOf = (node: TreeNode): Notice | undefined =>
    node.form === "kind" ? notices.find((notice) => notice.id === `kind:${node.kind}`) : undefined;
  const byId = new Map(rows.map((row) => [row.node.id, row]));
  const items: TreeItem[] = rows.map((row) => ({ getId: () => row.node.id, getName: () => row.node.id }));
  const rowChanged = () => rerender();

  const getTableRow = (uid: string) => {
    const row = byId.get(uid);

    if (row === undefined || found === undefined) return null;

    const { node } = row;
    const cells = treeCellsOf(found, row, {
      status: statuses.get(node.id),
      counts: counts.get(node.id),
      conditions: conditionsOf(node),
      notice: noticeOf(node),
    });
    const selected = node.id === addressId;
    const stopPress = (event: React.MouseEvent) => event.preventDefault();

    return (
      <TableRow
        key={node.id}
        selected={selected}
        className={node.id === active ? styles.active : undefined}
        onClick={(event) => {
          event.stopPropagation();
          clickRow(row);
        }}
        {...(rowAttributes(row, selected) as object)}
      >
        <TableCell className={styles.name} {...(CELL_ATTRIBUTES as object)}>
          <span
            className={styles.indent}
            style={{ "--treeDepth": row.depth } as CSSProperties}
            ref={page.refOf(node.id, rowChanged)}
          />
          {row.expandable ? (
            <button
              type="button"
              tabIndex={-1}
              className={styles.expander}
              aria-label={row.expanded ? "Collapse" : "Expand"}
              data-testid="capi-tree-expander"
              onMouseDown={stopPress}
              onClick={(event) => {
                event.stopPropagation();
                page.active = node.id;
                toggle(node.id);
                focusTree();
              }}
            >
              <Icon material={row.expanded ? "expand_more" : "chevron_right"} small />
            </button>
          ) : (
            <span className={styles.expander} />
          )}
          <Badge
            flat
            expandable={false}
            className={styles.content}
            tooltip={tooltipOf(cells.name.tooltip)}
            data-testid="capi-tree-name"
            label={
              <>
                {cells.name.opens ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className={styles.nameButton}
                    data-testid="capi-tree-name-button"
                    onMouseDown={stopPress}
                    onClick={(event) => {
                      event.stopPropagation();
                      clickRow(row);
                    }}
                  >
                    {cells.name.text}
                  </button>
                ) : (
                  cells.name.text
                )}
                {cells.name.role === undefined ? null : (
                  <Badge
                    small
                    flat
                    expandable={false}
                    className={styles.role}
                    label={cells.name.role}
                    data-testid="capi-tree-role"
                  />
                )}
              </>
            }
          />
        </TableCell>
        <TableCell className={styles.replicas} {...(CELL_ATTRIBUTES as object)}>
          <WordsView cell={cells.replicas} testId="capi-tree-replicas" />
        </TableCell>
        <TableCell className={styles.version} {...(CELL_ATTRIBUTES as object)}>
          <WordsView cell={cells.version} testId="capi-tree-version" />
        </TableCell>
        <TableCell className={styles.activity} {...(CELL_ATTRIBUTES as object)}>
          <ActivityView cells={cells} />
        </TableCell>
        <TableCell className={styles.condition} {...(CELL_ATTRIBUTES as object)}>
          <ConditionCellView condition={cells.condition} />
        </TableCell>
        <TableCell className={styles.status} {...(CELL_ATTRIBUTES as object)}>
          <StatusCellView status={cells.status} />
        </TableCell>
        <TableCell className={styles.age} {...(CELL_ATTRIBUTES as object)}>
          {cells.age === undefined ? (
            <WordsView cell={cells.ageNotApplicable ?? { text: "N/A", tooltip: [] }} testId="capi-tree-age" />
          ) : (
            <span className={styles.content} data-testid="capi-tree-age">
              <KubeObjectAge object={cells.age as unknown as Renderer.K8sApi.KubeObject} />
            </span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  // What the drawer shows of the node of the address, which the drawer computes inside its own error boundary (P17).
  const contentOf = () =>
    drawerContent(found, index, address, namespace, page, (node) =>
      nodeDetailsOf(found as ClusterTree, node, { status: statuses.get(node.id), conditions: conditionsOf(node) }),
    );

  return (
    <>
      {notices.length === 0 ? null : (
        <div className={styles.notices}>
          {notices.map((notice) => (
            <NoticeView key={notice.id} notice={notice} />
          ))}
        </div>
      )}
      {!shown ? (
        <Spinner center data-testid="capi-tree-loading" />
      ) : outcome !== undefined && outcome.state !== "found" ? (
        <ClusterState namespace={namespace} name={name} view={outcome} openClusters={openClusters} />
      ) : (
        <div
          ref={tree}
          role="treegrid"
          tabIndex={0}
          aria-label={`Tree of the Cluster ${name}`}
          aria-activedescendant={activeDescendant(active, active !== undefined && page.drawn.get(active) === true)}
          className={styles.tree}
          data-testid="capi-tree"
          onKeyDown={onKeyDown}
        >
          <Table
            className={styles.table}
            virtual
            selectable
            items={items}
            getTableRow={getTableRow}
            selectedItemId={page.target}
          >
            <TableHead sticky={false} {...(HEAD_ROW_ATTRIBUTES as object)}>
              {TREE_COLUMNS.map((column) => (
                <TableCell key={column} className={styles[column]} {...(HEAD_CELL_ATTRIBUTES as object)}>
                  <WithTooltip expandable={false} data-testid="capi-tree-head">
                    {COLUMN_TITLES[column]}
                  </WithTooltip>
                </TableCell>
              ))}
            </TableHead>
          </Table>
        </div>
      )}
      {shown && outcome?.state !== "found" ? null : (
        <TreeDetailsDrawer
          address={address}
          contentOf={contentOf}
          namespace={namespace}
          name={name}
          source={read}
          host={host}
          links={links}
          openNode={selectNode}
          close={closeDetails}
        />
      )}
    </>
  );
});

// What the drawer shows of the node that the address names (P17, P19).
function drawerContent(
  tree: ClusterTree | undefined,
  index: TreeIndex | undefined,
  address: NodeAddress,
  namespace: string,
  page: TreePage,
  detailsOf: (node: Extract<TreeNode, { readonly form: "object" | "reference" }>) => NodeDetails,
): DrawerContent {
  if (address.state !== "node" || tree === undefined || index === undefined) return { state: "loading" };

  const node = tree.nodes.get(address.id);

  if (node === tree.root) return { state: "root" };
  if (node?.form === "object" || node?.form === "reference") return { state: "node", details: detailsOf(node) };

  // A namespace in which the tree does not read the kind of the node is never loading: the object is not read there,
  // or is no longer in the tree, for one that was there, as the class whose reference names another namespace now
  // (P19, P23).
  const read = addressKindRead(index, tree, address.group, address.kind, address.namespace ?? namespace);

  if (read.state === "pending") return { state: "loading" };
  return {
    state: "absent",
    gone: page.seen.has(address.id),
    ...(read.state === "not-read" ? { notRead: { noun: read.noun, namespace: address.namespace ?? namespace } } : {}),
  };
}

export interface ClusterTreePageProps extends Common.Types.PageComponentProps {
  // The extension, from the registration of the page (AGENTS.md, "Renderer Components"), whose error boundaries the
  // page takes, and whose navigation opens the page of the Clusters and the details of a Cluster.
  readonly extension: Renderer.LensExtension;
}

// The page of the tree: the tree of the Cluster that its address names once the cluster serves Clusters at v1beta2,
// else the state that says why not (P19). The tree is keyed by its Cluster, so that another Cluster starts a new read.
export const ClusterTreePage = observer(({ params, extension }: ClusterTreePageProps) => {
  const served = availability();
  const cluster = parseTreeCluster((params.cluster as Param | undefined)?.get());
  const details = params.details as Param | undefined;
  const openClusters = () => void extension.navigate(CLUSTERS_PAGE);

  if (served.state !== "list") {
    return (
      <TreeState title={PAGE_TITLE} testId={`capi-tree-${served.state}`}>
        {availabilityWords(served)}
      </TreeState>
    );
  }
  if (cluster.state === "none") {
    return (
      <TreeState title={PAGE_TITLE} testId="capi-tree-no-cluster">
        {"This page shows the tree of one Cluster, which the details of that Cluster open, from their row Tree. "}
        <TextButton onOpen={openClusters}>Open the page of the Clusters</TextButton>
      </TreeState>
    );
  }
  if (cluster.state === "invalid") {
    return (
      <TreeState title={PAGE_TITLE} testId="capi-tree-invalid">
        {`The address names no Cluster: the value of cluster is "${cluster.value}", which is not <namespace>/<name>.`}
      </TreeState>
    );
  }
  return (
    <TreeView
      key={detailsAddressOf(cluster.namespace, cluster.name)}
      namespace={cluster.namespace}
      name={cluster.name}
      details={details}
      extension={extension}
    />
  );
});
