# SPEC-0005: The tree of a Cluster

- **Status:** Approved
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Reviewed project:** Cluster API `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`
- **Freelens:** 2.1.0, tag `v2.1.0`
- **Dependencies:** [SPEC-0001](SPEC-0001-reconnaissance.md), approved, and
  [SPEC-0002](SPEC-0002-test-environment.md),
  [SPEC-0003](SPEC-0003-status-model.md) and
  [SPEC-0004](SPEC-0004-clusters.md), verified on `main`: the tree reads as
  the view of one Cluster of SPEC-0004 reads, and marks every object with the
  model of SPEC-0003
- **Approval:** Approved on 2026-11-26 under the maintainer's delegation for
  the work inside M1, after four independent reviews and a probe in Freelens
  2.0.0 and 2.1.0 ("The host, as probed"); the references of P5 to the
  KubeadmControlPlane, the MachineDeployments, the MachinePools and the
  ClusterClass as the maintainer decided on 2026-11-26; it is reviewed with
  the rest of M1 at its review

## Goal

An operator who opens a Cluster sees, live, in one tree, the objects that make
it, each on a row of its own, as P7 places them: its infrastructure, its
control plane and its workers down to each Machine and the objects of the
providers under it, the templates that its Machines are made from, its class,
its add-ons, its addresses and its health checks; P8 says what the tree leaves
out and where it goes. Each object shows its health and what it is doing in
the words of the project, for how long, whether that is fresh, the reason and
the message that the project writes, and its place among the others. Among
hundreds of Machines the tree leads to the object that carries the state of
the Cluster, and any object opens its details. The view only reads.

## Upstream reference

The sources were read at the tag and commit of each. They are a reference for
behavior and for the domain: no code, text or style is copied from them. The
facts come from SPEC-0001, the rules of status from SPEC-0003 and the reads and
the details from SPEC-0004, which every rule below cites; where a rule needs a
fact that none of them holds, it cites the source.

| Source                        | At                        | Read for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubernetes-sigs/cluster-api` | `v1.14.4`, `4356c154f4a7` | `clusterctl describe cluster`, its tree and its printer (`cmd/clusterctl/client/tree/`, `internal/util/tree/`); what ties a Cluster to its objects (R3), the owners of the templates and of the objects that a MachineSet or a control plane makes; the references of the contract of a control plane at `v1beta1`; how a ClusterResourceSet selects its Clusters, how a MachineDrainRule applies to a Machine, how a MachineHealthCheck makes a remediation request; the contracts of the book |
| `freelensapp/freelens`        | `v2.1.0`, `c4700f9`       | The table and the tree of the host, its virtual list, its badge, its icon and its search input, the drawer and the metadata of the details, the namespace badge, the navigation of an extension, the list layout and its mark of a cluster that cannot be reached, the stores of the host and their loads; each at `v2.0.0` too                                                                                                                                                                 |

As in SPEC-0001, SPEC-0003 and SPEC-0004, a path with no prefix is in
`kubernetes-sigs/cluster-api` at `v1.14.4`, and any other path is prefixed
with the name of its source and a colon: `freelens:` for Freelens at `v2.1.0`,
and `freelens@v2.0.0:` for Freelens at that tag, given where its lines differ;
a path of Freelens with one prefix names the same lines at both tags, unless
it is marked "at `v2.1.0` alone", for lines that `v2.0.0` does not have. `kit`
is the Freelens extension kit at `v0.1.4`. The files of this repository, under
`src/`, `integration/`, `e2e/`, `test/` and `.github/workflows/`, and its
configurations, are named by their path in it; none of them is a path of
Cluster API that this spec cites. The files below, whose paths do not fit in a
line, are cited by their name: those of Freelens always with the prefix of
their source, as `freelens:table.tsx:98-119`, and those of Cluster API with
none:

| Name                                | Path                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `badge.module.scss`, `badge.tsx`    | `packages/core/src/renderer/components/badge/badge.module.scss`, `badge.tsx` beside it          |
| `catalog-menu.tsx`                  | `packages/core/src/renderer/components/catalog/catalog-menu.tsx`                                |
| `components.ts`                     | `packages/core/src/extensions/renderer-api/components.ts`                                       |
| `content.tsx`                       | `packages/core/src/renderer/components/item-object-list/content.tsx`                            |
| `drawer.scss`, `drawer.tsx`         | `packages/core/src/renderer/components/drawer/drawer.scss`, `drawer.tsx` beside it              |
| `get-details-url.injectable.ts`     | `packages/core/src/renderer/components/kube-detail-params/get-details-url.injectable.ts`        |
| `hide-details.injectable.ts`        | `packages/core/src/renderer/components/kube-detail-params/hide-details.injectable.ts`           |
| `high-contrast.theme.yaml`          | `packages/core/src/features/theme/files/common/high-contrast.theme.yaml`                        |
| `icon.tsx`                          | `packages/ui-components/icon/src/icon.tsx`                                                      |
| `input/index.ts`                    | `packages/core/src/renderer/components/input/index.ts`                                          |
| `input/input.tsx`                   | `packages/core/src/renderer/components/input/input.tsx`                                         |
| `item-list-layout.scss`             | `packages/core/src/renderer/components/item-object-list/item-list-layout.scss`                  |
| `kube-object-details.tsx`           | `packages/core/src/renderer/components/kube-object-details/kube-object-details.tsx`             |
| `kube-object-list-layout.tsx`       | `packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx`     |
| `kube-object-meta.tsx`              | `packages/core/src/renderer/components/kube-object-meta/kube-object-meta.tsx`                   |
| `kube-object.store.ts`              | `packages/core/src/common/k8s-api/kube-object.store.ts`                                         |
| `lens-renderer-extension.ts`        | `packages/core/src/extensions/lens-renderer-extension.ts`                                       |
| `list-layout.tsx`                   | `packages/core/src/renderer/components/item-object-list/list-layout.tsx`                        |
| `namespace-select-badge.tsx`        | `packages/core/src/renderer/components/namespaces/namespace-select-badge.tsx`                   |
| `navigate-to-route.injectable.ts`   | `packages/core/src/renderer/routes/navigate-to-route.injectable.ts`                             |
| `navigation.ts`                     | `packages/core/src/extensions/renderer-api/navigation.ts`                                       |
| `react-root.injectable.ts`          | `packages/technical-features/react-application/src/render-application/react-root.injectable.ts` |
| `search-input.tsx`                  | `packages/core/src/renderer/components/input/search-input.tsx`                                  |
| `show-details.injectable.ts`        | `packages/core/src/renderer/components/kube-detail-params/show-details.injectable.ts`           |
| `start-url.injectable.ts`           | `packages/core/src/renderer/frames/cluster-frame/start-url.injectable.ts`                       |
| `table-cell.scss`, `table-cell.tsx` | `packages/core/src/renderer/components/table/table-cell.scss`, `table-cell.tsx` beside it       |
| `table-head.tsx`                    | `packages/core/src/renderer/components/table/table-head.tsx`                                    |
| `table-row.tsx`                     | `packages/core/src/renderer/components/table/table-row.tsx`                                     |
| `table.scss`, `table.tsx`           | `packages/core/src/renderer/components/table/table.scss`, `table.tsx` beside it                 |
| `tree-view.module.scss`             | `packages/core/src/renderer/components/tree-view/tree-view.module.scss`                         |
| `tree-view.tsx`                     | `packages/core/src/renderer/components/tree-view/tree-view.tsx`                                 |
| `virtual-list.tsx`                  | `packages/core/src/renderer/components/virtual-list/virtual-list.tsx`                           |
| `clusterresourceset_controller.go`  | `core/reconcilers/clusterresourceset/clusterresourceset_controller.go`                          |
| `controlplane.go`, `references.go`  | `internal/contract/controlplane.go`, `internal/contract/references.go`                          |
| `desired_state.go`                  | `controlplane/kubeadm/pkg/desiredstate/desired_state.go`                                        |
| `discovery.go`                      | `cmd/clusterctl/client/tree/discovery.go`                                                       |
| `drain.go`, `filters.go`            | `core/reconcilers/machine/drain/drain.go`, `core/reconcilers/machine/drain/filters.go`          |
| `machinehealthcheck_controller.go`  | `core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go`                          |
| `machineset_controller.go`          | `core/reconcilers/machineset/machineset_controller.go`                                          |

The documents of this repository are cited by their name and a section, or a
line: AGENTS.md, and ROADMAP.md, TESTING.md, TRY-IT.md, ARCHITECTURE.md and
DESIGN.md of `docs/development/`. A rule that SPEC-0001, SPEC-0003, SPEC-0004
and the kit do not settle is marked "Proposed:" with its reason and the facts
it rests on, and numbered from P1 in the order in which it was first proposed:
P23 came with the first two reviews of this draft, and P4 went with them, its
number kept with the word "Dropped" and its reason, so that the reviews still
read. A rule of SPEC-0003 or of SPEC-0004 is always cited with its spec, as
"SPEC-0004, P31", and so are the decisions H1 to H3 of SPEC-0001, as
"SPEC-0001, H3", since H1 and the numbers after it name here the facts of "The
host, as probed", so that the series never mix. A decision of the maintainer is
recorded as the maintainer's, with its date, in the rule it settles. Every rule
proposed here is listed again under "Notes and deviations", with what it adds
to the kit, SPEC-0001, SPEC-0003 or SPEC-0004, or how it departs from them. The
two questions that the draft asked are settled, one by the roadmap (P8) and one
by the maintainer on 2026-11-26 (P5).

What only the running application shows of the host was measured for this
draft by a probe, whose facts "The host, as probed" states, numbered from H1
and cited by their number, as "(H5)"; the sessions of this spec check those
facts again (Tests). A rule whose fact the probe did not reach says so, with
its fallback, and its row of "Notes and deviations" says "Open".

## Scope

Included:

- The page of the tree of one Cluster (P1), its address (P2), and the ways to
  it: the row "Tree" of the details of a Cluster, in the drawer of the
  extension and in the panel in the details of the host, and the references
  that those details make to an object of Cluster API of the Cluster (P3, P5).
- The objects of a Cluster that P7 places, those of the providers included,
  each on a row of its own, and what P8 leaves out, with where it goes.
- Every node: its kind and its name, its role, its health, its activities and
  its marks of freshness from SPEC-0003, the reason and the message of the
  project, and the counts of the objects under it (P9 to P11), and what it says
  of an object or a kind that it cannot read (P12).
- What is expanded at first, the order of the nodes, the search, a large
  Cluster (P13 to P16).
- The reads, through those of a view of one Cluster of SPEC-0004, P31, which
  take the kinds of each view as a parameter, with the models of the kinds that
  the tree adds and the namespace of a class that lives elsewhere (P6); the
  watches that keep the tree live, and the refresh of its reads (P23).
- The details of every object of the tree (P17); the references of the details
  of a Cluster that the decision of the maintainer of 2026-11-26 turns into
  ways to the tree, and the other links between the objects of a Cluster (P5).
- Keyboard and focus (P18), the theme, the states that are not the happy one
  (P19), and what the details never show (P20).
- The IPAddressClaims of a Cluster and their IPAddresses (P21), with the field
  that the set `no-status` of SPEC-0002 gives its claim so that the sessions see
  one.
- The large Cluster that the session of the tree makes for itself (P22).
- The documents that the view changes, in the same pull request (kit,
  `docs/process.md`, "The loop"): DESIGN.md, whose new rules this draft holds
  in a copy; ARCHITECTURE.md, "What it reads" and "Shared decisions", for the
  kinds that the tree reads, the namespace of a class elsewhere and the
  refresh; the README, "Permissions", for the reads of the tree and what a list
  of KubeadmConfigs returns (P6); TRY-IT.md, the walk through the tree on the
  demo; TESTING.md, the large Cluster and the sessions of the tree; AGENTS.md,
  "Architecture", "Adding an API" and "Workflows", for the files, the models
  and the sessions of the tree; and the row of the roadmap.
- The tests: unit, in Freelens on the fixtures of every state of SPEC-0002, with
  a restricted identity, and on the real project against `clusterctl`.

Excluded:

- The picture of the whole management cluster (SPEC-0006), whose marks open the
  tree of a Cluster at its address (P2).
- The views of each kind, in M2: their pages, their lists, their panels in the
  details of the host, and the fields of each kind beyond those that the details
  of a node show (P17): SPEC-0008 to SPEC-0016.
- The events of the objects, in their details and in the tree: SPEC-0017, as the
  roadmap gives them (ROADMAP.md:64).
- The MachineDrainRules that apply to the Machines of a Cluster, and the
  remediation requests of its MachineHealthChecks with their remediation
  templates: SPEC-0013, as the roadmap gives them (ROADMAP.md:60; P8).
- The values of the variables and the patches of a ClusterClass, and its
  upgrade plan: SPEC-0012 (ROADMAP.md:59). The tree shows the class of a
  Cluster as one node, whose details name its variables and its patches (P20).
  The templates of a ClusterClass are left to M2.
- The IPAM pools, left to M2; the ExtensionConfigs, SPEC-0015 (ROADMAP.md:62);
  the providers installed, from the `Provider` of `clusterctl` or from the
  kinds of the Cluster API Operator, SPEC-0016 (ROADMAP.md:63).
- The Node of a Machine, which lives in the workload cluster: the tree names it
  and links nothing, until SPEC-0023 (A2; R3.38).
- The counters of the list of the Clusters as ways into the tree, left for
  later (P4; "Notes and deviations").
- Every action: M3.
- The pass before the review of M1, which checks this view in both themes:
  SPEC-0007.

## The host, as probed

What only the running application shows of the host, this draft takes from a
probe: a page of the extension made for it, which the repository does not
keep, run in Freelens dev at `v2.0.0` and at `v2.1.0` on the cluster of the
definitions of the test environment. These are its facts, H1 to H25, each with
what was done and what it showed, which the rules cite by their number; a path
of Freelens follows the convention of "Upstream reference". The probe is no
test of this spec: the sessions check again, on the tree itself, the facts that
its rules rest on (Tests).

- **H1. The releases and the setting.** Freelens dev at `v2.0.0` and at
  `v2.1.0`, with a fresh profile for each run, the filter of namespaces on all
  namespaces, and the root page set to 1280 by 900 CSS pixels at a scale of 1,
  in which the frame of the cluster measured 1205 by 839; the cluster of the
  definitions, with the fixtures of `healthy`, 28 objects, its Cluster
  `Available`. Both releases gave the same behavior, and the same values but
  for the frames sampled and the times that H4, H6 and H15 give. The one
  difference found: the extension API exports
  `Renderer.Component.VirtualList` on `v2.1.0`, a function, and not on
  `v2.0.0`. Neither process of Freelens logged an error, by the rules of the
  integration tests, in any run.
- **H2. The page of the probe.** A page of the cluster, registered in
  `clusterPages` with the parameters `cluster` and `details` and opened by the
  navigation of the extension. It drew a header of one line, with its title,
  the `SearchInput` of the host with its defaults and a count of rows; under
  it, an element with `role="tree"`, `tabIndex={0}`, `aria-activedescendant`
  and a handler of the keys Down, Up, Home, End and Enter; inside that element,
  the `Table` of the host with `virtual`, `selectable`, `getTableRow` and
  `selectedItemId`, in four columns, Name, Role, Condition and Status; rows
  made up, named `node-0000` to `node-0999`, at a depth of 0 to 7, shown as an
  indent of 16 px for each level, then a chevron and the name as a button,
  `tabIndex` 0 for the active row and -1 for the others; in the cell Role, a
  flat small `Badge` of the host and the same words as plain text of the same
  size; in the cell Condition, the counts as P11 writes them, as
  `909 objects: 3 Unhealthy, 2 Degraded, 1 Unknown, 903 Healthy`; each
  `TableRow` keyed by its id, with `selected`, a click that opened the drawer
  through `details`, stopped or not as each fact says, and the props of a tree
  item; and the `Drawer` of the host, open while `details` named a row. A key
  move made a row active and brought it into view, either by giving the table
  its `selectedItemId` in the render after the move alone, cleared two
  animation frames later, or by setting the scroll of the list itself, and
  then gave the focus to the name of its row, with `preventScroll`, once that
  row was drawn. Unless a fact says otherwise, the page, the element around
  the table, the `Table` and its `.VirtualList` formed a chain of flex items,
  each with `min-height: 0` (H5).
- **H3. The virtual rows.** With 20 rows the table drew 20 row elements in a
  list 660 px high, shrunk to its rows; with 300 rows, 32 row elements at the
  top, 22 in view and 10 below, in a list 726 px high over 9,900 px of
  content; with 1000 rows, 32 at the top and 43 after a scroll, 10 above, 23 in
  view and 10 below, over 33,000 px. A row was one line of 33 px, from the
  defaults of the table, `rowLineHeight` 17 and `rowPadding` 8
  (freelens:table.tsx:130-137), and the scrollbar was 16 px wide. `selectable`
  drew the selected row, its bar and its background, in the screenshots.
- **H4. A scroll.** Over 1000 rows, twelve steps of the wheel of 400 px, 40 ms
  apart: of 85 frames sampled, 12 had a strip with no row, one after each step,
  40 to 70 px at the bottom of the 726 px of the list; once the list settled,
  at 4,800 px, none. A drag of the scrollbar, 15 moves of 20 px 30 ms apart,
  took the list from 0 to 13,656 px: of 109 frames sampled, 119 on `v2.0.0`,
  15 had no row on 551 to 580 px of the 726, one after each move; once the list
  settled, none.
- **H5. The height of the table.** With the page, the element around the
  table, the `Table` and its `.VirtualList` a chain of flex items, each of a
  definite height that may shrink below its content, `min-height: 0`, the list
  was 726 px high, drew 32 rows and was the one element that scrolled. Without
  `min-height: 0` on the `Table` and the list, or with no flex layout at all,
  the list was 33,000 px high, drew all 1000 rows and did not scroll, and the
  content area of the host, `overflow-y: hidden`, clipped the rows past
  806 px, which nothing could reach.
- **H6. `selectedItemId`.** Over 1000 rows, given at every render with the row
  `n-10` selected: the list, scrolled by code to 20,000 px, went back to 0 at
  the next render of the page, which a state outside the table caused, and
  again from 25,000 px at a second render, at every render and not once; a
  scroll of the wheel with no render left it where it was. The same
  `getTableRow` function at every render changed nothing: a render still took
  the list back to 0. Given only in the render after a key move: a render with
  no move left the list at 20,000 px; Down, from the active row `n-4` scrolled
  away, made `n-5` active, two renders gave `selectedItemId` `n-5` and then
  none, the list went to 0 with `n-5` drawn, and its name had the focus one
  frame later, 99 ms after the key, 101 ms on `v2.0.0`; a render after that,
  from 25,000 px, left the list there.
- **H7. The focus in a virtual row.** A `TableRow` given `tabIndex={-1}` took
  the focus. A focused row or name that a scroll by code, the wheel, Page Down
  or rows inserted above it took out of the drawn window was unmounted: the
  focus fell to the body, the tree had no stop of Tab left, Tab went to the tab
  Terminal of the dock after the page, and Down reached no handler. Ten rows
  inserted at index 0 above a focused row, the list at its top, did the same,
  since the rows are drawn by index, and the row at that index, which then
  holds another item, is mounted again under the `key` of that item.
- **H8. Who receives the keys.** The handler of a row and that of the element
  around the table, the keys bubbling from a row or from a name in it; the
  handler given to the `Table` never ran, since its root is a `div` with its
  classes alone (freelens:table.tsx:308).
- **H9. `focus` with `preventScroll`.** A drawn row below the view, `n-24`, in
  the overscan, focused with `focus({ preventScroll: true })`, took the focus
  and the list stayed at 0; another, `n-26`, focused with `focus()`, took it
  and the list scrolled to 512 px to show it.
- **H10. The flat `Badge`.** In the dark and the light theme of each release,
  `Dark` and `Light` on `v2.0.0` and the dark and the light variant of
  `freelens` on `v2.1.0`, the flat small badge had no background and no
  padding, 12 px in the color of the plain text beside it,
  `rgb(142, 146, 151)` in the dark theme and `rgb(85, 85, 85)` in the light
  one, and the box of that text, 121 by 13 px with no radius in the dark
  theme; neither the computed style nor the screenshots told the badge from
  the text. In a window 1024 px wide it cut itself with an ellipsis (H22).
- **H11. The drawer of a row.** Over 1000 rows at the top, each click 30 px
  into a row, in the indentation of a row at depth 2 or more, since the drawer
  covers the right part of the rows and 4 px into a row lies the anchor that
  resizes the sidebar: a click on a row opened the drawer of that row and set
  `details`, and its press gave the focus to the element around the table; a
  click on another row while the drawer was open, the click of the row
  stopped, kept it open on the other row; the same click not stopped opened
  the drawer, and the host closed it at once, 31 to 37 ms after the click,
  `details` empty, every time; Escape closed it and left the focus where it
  was, on the element around the table; a click on the title of the page
  closed it, the focus on the body; its close icon, which had the focus and
  went with it, closed it with the focus on the body. The host gave the focus
  nowhere of its own. Given back by the page on Escape, the focus reached the
  name of the row in the same frame while the row was drawn; with the row
  scrolled away, no element held that name in 31 frames, and the focus stayed
  on the element around the table.
- **H12. The parameters, the history, a reload and a reconnection.** Opened by
  the navigation of the extension with `cluster` and `details=n-120`, over 300
  rows, the page had both in its address, read both, and opened its drawer on
  that row. After another page of the extension, or the page `/namespaces` of
  the host, `history.back()` of the frame brought the page back with both
  parameters, its drawer open and its list at the same place. Loading the frame
  again started it at `/overview` of the host, with no page of the extension
  and no parameter; after Disconnect from the catalog, which left the entity
  `disconnected`, the frame, opened again from the catalog, started at
  `/overview` the same way.
- **H13. An element around the table.** An element around the table with
  `role="tree"` and `tabIndex={0}` kept the focus through scrolls and
  insertions, and received every key: Down three times gave three records,
  each with the element itself as its target.
- **H14. The props of a tree item.** Given to a `TableRow`, `role="treeitem"`,
  `id`, `aria-level`, `aria-expanded` and `aria-selected` were all in the DOM,
  as `id="y-row-n-3"`, `aria-level="4"`, `aria-expanded="true"` and
  `aria-selected="true"`, with `aria-activedescendant="y-row-n-3"` on the
  element around the table, read in the DOM and not through the tree of
  accessibility. Once that row was scrolled away, the element still named it,
  though no element held that id any longer, and kept the focus.
- **H15. A key move.** End made the last row, `n-999`, active: it was drawn 2
  frames after the render that gave `selectedItemId`, and its name had the
  focus 83 ms after the key, 85 ms on `v2.0.0`; Home took 101 ms, 94 on
  `v2.0.0`; with the scroll of the list set by the handler of the keys instead,
  the row was there at the first frame, 80 ms after the key on both releases.
  Thirty presses of Down took the focus to `n-30`.
- **H16. The keys that scroll the list natively.** With the focus on the name
  of a row and no handler of the keys, Down scrolled the list by 40 px each
  time and kept the focus, and Page Down scrolled it by 635 px, which took the
  focused row out of the window, the focus falling to the body, after which
  End and Home did nothing; with a handler that does not prevent their
  default, the handler moved the active row and the list scrolled 40 px as
  well; with a handler that prevents the default of the arrows alone, they
  only moved the active row, while Page Down, which it did not handle, still
  scrolled the list by 635 px and the focus fell to the body. All of it with
  the focus on a name, never on the element around the table.
- **H17. The address at the first mount.** Opened with `details=n-120`, over
  300 rows, the list scrolled at its first mount to 3,977 px, which left the
  row `n-120`, whose top is at 3,960 px, 17 px above the top of the list, half
  under the head of the table; `selectedItemId`, given in four renders, did not
  move it again, a row partly in view not being scrolled to.
- **H18. Rows inserted above the view.** Ten rows inserted at index 0 while the
  list showed `n-500` at its top, at 16,500 px: the list kept its offset, so the
  rows in view shifted, `n-490` at the top; the ten removed again, `n-500` was
  at the top again. The page then moved the scroll of the list's element by the
  height of the rows that it inserted, in the same task, right after it asked
  for them: `n-500` stayed at the top, the scroll going from 16,500 to
  16,830 px, on both releases, `VirtualList` absent on `v2.0.0` (H1). It
  compensated insertions alone: its removal moved no scroll. The `Table` hands
  its list no ref, so the one way to scroll that list through the table is
  `selectedItemId`.
- **H19. Where the drawer lands.** The `Drawer` was absolute in the body of the
  frame, which gives it no positioned ancestor, 725 px wide, from 480 to
  1205 px of the frame, and 839 px high, the whole frame: over the page, which
  spans 200 to 1205 px by 0 to 806, and over the dock. At a window 1280 px wide
  it left in view the first 280 px of the page, the names of its rows, and
  covered every other column.
- **H20. The details of the host over the page.** `showDetails` of the
  extension API, called on a DevCluster with the page open, added
  `kube-details` with the path of that object to the address and kept
  `cluster` and `details`; the drawer of those details lay at the place of that
  of the page, above it, at a z-index of 101 over 100. A click on the row `n-8`
  then changed the drawer of the page under it, `details=n-8`, while that of
  the host stayed on top and showed the DevCluster; one Escape closed both, and
  the address lost both. The probe did not read whether `kube-details` stayed
  in the address with an empty value, which P17 takes from the source. Only
  Escape was tried with both drawers open.
- **H21. The search of the host.** The `SearchInput` of the host, with its
  defaults, took the focus when the page mounted, every time. With the drawer
  open, an Escape in the empty search did nothing, and one in a search with
  text cleared it; the drawer stayed open after either, and after a second
  Escape.
- **H22. Seven levels in a window 1024 px wide.** The rows at depth 7 stayed
  one line of 33 px, and a name at that depth, made up as every name of the
  probe, showed whole, 173 px; in the cell Condition, the counts of P11 were
  cut at 222 of their 401 px with no ellipsis, being the text of the cell and
  not of an element that cuts it, while the flat badge in the cell Role cut
  itself with an ellipsis.
- **H23. An IPAddressClaim with `spec.clusterName`.** With kubectl, on the
  cluster of the definitions: the definition
  `ipaddressclaims.ipam.cluster.x-k8s.io` serves `v1alpha1`, `v1beta1` and
  `v1beta2`, its storage version, and at `v1beta2` its spec has `clusterName`,
  a string of 1 to 63 characters, and `poolRef`, required. The claim of the
  set `no-status`, given `spec.clusterName` `freelens-capi-no-status`, at
  `v1beta2`, in the namespace of `healthy`, since that of `no-status` is not on
  that cluster, passed a dry run on the server, which stored nothing. With a
  `clusterName` of 64 characters the server refused it, with the words
  `Too long: may not be more than 63 bytes`, and with an unknown field,
  `spec.clusterNames`, with `strict decoding error`. That cluster has no
  ValidatingWebhookConfiguration and no MutatingWebhookConfiguration, and no
  service but `default/kubernetes` and `kube-system/kube-dns`; the definition
  declares a conversion webhook, which a request at its storage version does
  not call.
- **H24. A Cluster of 300 Machines.** Derived from the objects of `healthy`
  with the reader and the writer of the scripts, in a namespace and under a
  name of its own: its two worker Machines, with their DevMachines and their
  KubeadmConfigs, replaced by 300 copies of the first, each named apart; the
  replicas and the counters of its MachineDeployment, of its MachineSet, of its
  topology and of its workers at 300; and its MachineHealthCheck of the workers
  with them all as targets. The set held 922 objects, 301 Machines, 301
  DevMachines, 301 KubeadmConfigs and the 19 other objects of `healthy`, and,
  written as files, 18 files, 2.8 MB and 94,604 lines of YAML. Listed as a
  state of the scripts on a branch that was not kept, it was applied by
  `pnpm e2e:fixtures:up` in 52.6 s, after which its Cluster read `Available`
  and its workers 300 of 300, and deleted by `pnpm e2e:fixtures:down` in
  77.0 s, the scripts removing the finalizer of each object with a call of its
  own, on a local kind cluster. In Freelens dev at `v2.1.0`, with the extension
  of `main`, the page of the Clusters showed `300/300` in the cell Workers of
  its row at its first reading, 376 ms after the navigation began; the renderer
  that runs the frame used 0.77 s of CPU in the first 0.9 s, about 85% of one
  core, and 1.21 s in 10.5 s, with one long task of 188 ms. The tree of these
  922 objects was not built.
- **H25. What the probe did not reach.** The close icon of the details of the
  host over the page, since only Escape was tried with both drawers open; a
  scroll that the page sets itself at the first mount, to the row of the
  address, since only the scroll of the host at the mount was seen; what a
  screen reader announces, since the attributes were read in the DOM and not
  through the tree of accessibility; rows that a watch inserts or removes,
  since the page inserted and removed its rows itself, a watch of the host
  going through the same render; the `TreeView` of the host; the objects of a
  real Cluster, since the rows were made up, and a tree of 922 objects; the
  High Contrast theme of `v2.1.0`, and widths other than 1280 and 1024 px; a
  packaged Freelens, since only Freelens dev ran, which renders in
  `React.StrictMode`; and the times of H24 on a runner of CI.

## Design

### Why a tree

The task comes first (kit, `docs/design.md`, "Start from the tasks"). SPEC-0004
gives an operator three things to do with the Clusters: notice the ones that
are not healthy, understand one of them, and find the part that carries it and
go to it (SPEC-0004, "A list with its details, and why"). The list carries the
first and the details the second. The third stops at the first level in the
details, which name the control plane, the MachineDeployments, the
MachinePools, and the MachineSets and Machines that the Cluster owns
(SPEC-0004, P17), and leave every object below them to this spec (SPEC-0004,
"Scope"). Yet the state of a Cluster is carried by objects several levels down:
a Cluster that rolls out is Degraded from `WorkerMachinesReady` because one new
Machine, under a MachineSet under a MachineDeployment, is not available yet
(SPEC-0003, the rows of `rolling-out`), and a Machine that is not ready waits on
its Node, its bootstrap config or its infrastructure machine, whose conditions
its own `Ready` merges (R2.46).

The objects of a Cluster form a tree. Controller references run down the
chains: a MachineSet to its MachineDeployment, a Machine to its MachineSet, its
MachinePool or its control plane, the infrastructure machine and the bootstrap
config to their Machine (R3.4), and an object has one controller at most
(Kubernetes behavior, not in these sources). The project's own tool prints a
Cluster as a tree too, from the Cluster down to the objects of each Machine
(R4.10 to R4.12), with the Machines of one state merged into one row by default
(R4.14 to R4.17), and the Machines of a MachineDeployment under it unless
`--show-machinesets` is passed (R4.20; discovery.go:315-329). A tree shows that
chain as it is, each object on a row of its own under the object that controls
it or names it (P7), with the same columns of state as the list for every row,
so that the path from the Cluster to the object that carries its state is read
at a glance and walked with the keyboard. The lists of the host show one kind
at a time and lose the chain (R7.1 to R7.3); a graph of nodes and edges has no
columns in which the states of its nodes line up for a scan, and grows past
what a window holds once a Cluster has hundreds of Machines. The relations that
are no chain show where the tree places each object, once: a template that two
objects name under the highest of them, whose rows the details of the others
link (P7, P17); a MachineHealthCheck under Health checks, whose details link
its targets; a ClusterResourceSet that selects the Cluster under Add-ons, with
what it applied to this Cluster under it and its selector as text in its
details; and the class of the Cluster, which other Clusters may share (P17).

This makes the tree an ad hoc view: relationships, and the way from a summary
to the objects behind it, which a list cannot carry (kit, `docs/design.md`, "Ad
hoc views", "When"). It is built from the components of the host (P9), and held
to the rules of a list: every cell one line, no cell empty, every mark from the
model, every row a way to its details.

### The tree beside `clusterctl describe cluster` and the host

What the tree shows, point by point, and what `clusterctl describe cluster`
prints of the same Cluster, with its default flags unless a point names one
(R4.1 to R4.35), and what the host shows of any custom resource (R7.1 to
R7.6), so that they can be read side by side:

1. **Live.** The tree follows its objects through the watches of the stores
   that it reads (P6, P23). `clusterctl describe cluster` prints one snapshot,
   from GETs and LISTs (R4.9), and the host shows no tree.
2. **Each object on a row of its own.** Every object that P7 places is one
   node, collapsed or not, a template under the highest object that names it
   (P7, P13); P8 lists what is no node, and "Notes and deviations" what the
   tree cannot see. By default `clusterctl describe cluster` merges the
   Machines whose `Available`, `Ready` and `UpToDate` match into one row,
   without their children (R4.14 to R4.17), and leaves out an infrastructure
   machine or a bootstrap config whose `Ready` is `True` or repeats that of its
   parent (R4.18); `--grouping=false` and `--echo` print each of them. It lists
   no MachineDeployment while no worker Machine exists, no MachineSet that no
   MachineDeployment controls (R4.32), no provider object or binding that it
   may not read (R4.8), and no object of a definition with no contract label
   (R4.35).
3. **A health for every object with a status,** by the rule of its kind
   (SPEC-0003, "The rule of each kind"): a MachinePool from its Machines, a
   MachineSet from its counters, a MachineHealthCheck from its targets, a
   ClusterResourceSet from its bindings (SPEC-0003, P9 to P12). The tool shows
   no status on the row of a MachinePool or of a MachineSet (R4.22, R4.33).
4. **What each object is doing, and for how long,** with the tone that says
   whether it lasts too long (SPEC-0003, "Activity", D2). The tool shows how
   long ago the condition of each row changed (R4.27).
5. **Whether each health is fresh:** paused, an older generation, a workload
   cluster that cannot be reached (SPEC-0003, "Freshness").
6. **The weight of every condition,** in the details of each node, a negative
   condition at rest never an issue (SPEC-0001, H3); the host paints it as an
   error (R7.6).
7. **The class of the Cluster with its health**, and the mark that says that
   the topology of its Clusters waits for it (SPEC-0003, P8). The tool reads no
   ClusterClass (R4.31).
8. **What each ClusterResourceSet applied to this Cluster,** resource by
   resource, as its binding records it (SPEC-0003, P12). With
   `--show-resourcesets` the tool builds their nodes from their names and reads
   none (R4.10).
9. **The MachineHealthChecks of the Cluster,** with their targets and whether
   they may remediate (SPEC-0003, P11). The tool reads none: its reads are
   those of R4.4 and R4.5.
10. **The templates that the Machines are made from,** and a template that a
    part names and that does not exist, said as such (P12). The tool shows the
    templates only with `--show-templates`, which then fails on a definition
    with no contract label; without it, the objects of such a definition are
    hidden (R4.20, R4.35).
11. **Every read that failed, said as one,** with its reason and the permission
    it takes (SPEC-0004, P25), and a kind that cannot be read as a node of its
    own, never as an absence (P12). `clusterctl describe cluster` stops when it
    may not read the Cluster or list a kind, and leaves out a provider object or
    the binding that it may not read (R6.6).
12. **From any object to its details,** of the extension for every object, and
    of the host for an object of a provider, from its details (A6); for an
    object of Cluster API, never the details of the host, whose menu edits and
    deletes, one click away (A7; P5).
13. **Hundreds of Machines** in rows that the host draws only where the window
    shows them, with the counts of what each node holds and a search (P11, P15,
    P16), where `clusterctl describe cluster` groups them by default (R4.15).

### Where it lives

**P1.** Proposed: the tree is a page of its own, `cluster-tree`, registered in
`clusterPages` with the parameters of P2, its component made once and given the
extension from the registration (AGENTS.md, "Renderer Components"), with no
entry in the sidebar. Its title is "Cluster Tree" (kit, `docs/design.md`,
"Navigation": titles in Title Case), followed by the name of the Cluster and
its namespace, as text. The namespace badge of the host, which the list shows
and the details of a node keep (P17), sets the global filter of namespaces to
its namespace on a click, as its tooltip says
(freelens:namespace-select-badge.tsx:41-48), which changes nothing that the
tree shows, since the tree reads its namespace whatever the filter selects
(P6): in the title, which says what the page shows, it would be a control that
changes nothing of the page under it. The reasons:

- **Room.** The details of a Cluster are a drawer 725 px wide unless the user
  resizes it, at least 300 (SPEC-0004, "Notes and deviations"). A tree whose
  rows carry the columns of state needs the width of the page, and hundreds of
  rows need a scroll of their own, which a section of the details would nest
  inside a drawer that scrolls as a whole (kit, `docs/design.md`, "Ad hoc
  views": no scrolling inside a card). Over the page, the drawer of a node
  covers the right of the tree: in a window 1280 px wide it leaves in view the
  first 280 px of the tree, the names of its nodes, beside the details of one
  of them (P17; H19).
- **Reads.** The tree reads the bootstrap configs, the infrastructure machines,
  the templates and the add-ons of one Cluster, which the list never needs. A
  page of its own reads them in the namespace of its Cluster, through stores of
  its own (P6), and the list keeps the reads of SPEC-0004, P19 as they are, in
  every namespace of the filter.
- **An address.** The page has one (P2), which the overview of SPEC-0006 and the
  views of M2 use to open the objects of a Cluster. The history of the frame
  keeps it while the cluster stays connected: back brings the page back with
  both parameters and its drawer open. Loading the frame again, and
  disconnecting the cluster and connecting it again from the catalog, start the
  frame at the overview of the host, with no page of the extension and no
  parameter, on both releases (H12), although the documents of the extension
  API say that the host restores the last page when a cluster is opened
  (freelens:docs/extensions/migrating-from-v1.md:1450-1453;
  freelens@v2.0.0:docs/extensions/migrating-from-v1.md:1439-1442; AGENTS.md,
  "CRD KubeObject Pattern").
- **Details over it.** Every node opens its details in the drawer of the host
  over the tree, as a Cluster opens its details over the list (SPEC-0004, P15).

So not both: the details of a Cluster keep the sections of SPEC-0004 and gain
the way to the tree of P3, not a second tree. No sidebar entry: the tree is
that of one Cluster, and an entry would name none; the kit gives one entry to
each resource (kit, `docs/design.md`, "Navigation"), and the tree is no
resource. The page opened with no Cluster says what it shows and that a Cluster
opens it from its details (P19).

A sketch of the page on the Cluster of `rolling-out`, as it opens (P13), with
the names and the roles cut, the messages left out, three of the seven columns
of P9, the counts of P11 on the virtual nodes alone, cut after the number of
objects, and the marks that the model is expected to give its fixtures at the
start of the session, the first activity of a row first and the others cut:
the new Machine is Unhealthy while its Node is not ready, and its
infrastructure machine and its bootstrap config are Healthy. The counts count
objects (P11): Workers holds 14, Templates 2, Health checks its two
MachineHealthChecks, and Add-ons 2, the ClusterResourceSet `cni-kindnet` and
the binding of the Cluster, and not the entry of the ConfigMap that the binding
records, a row under the ClusterResourceSet that is no object
(`integration/fixtures/rolling-out/clusterresourceset.yaml:13-15`;
`integration/fixtures/rolling-out/clusterresourcesetbinding.yaml:12-19`):

```text
Cluster Tree: freelens-capi-rolling-out, freelens-capi-rolling-out
                                                     [search]  [refresh]
Name                                       Activity          Condition
v Cluster ...rolling-out                   [Provisioning]..  [Degraded]
    DevCluster ...-c8hvj [infra cluster]   [Idle]            [Healthy]
  > KubeadmControlPlane ...-hsfpd          [Idle]            [Healthy]
  v Workers                                N/A               14 objects ...
    v MachineDeployment ...-md-0           [Provisioning]..  [Degraded]
      v MachineSet ...-k525t               [Provisioning]    [Unhealthy]
        v Machine ...-k525t-b5t8n          [Provisioning]    [Unhealthy]
            DevMachine ... [infra machine] [Idle]            [Healthy]
            KubeadmConfig ...-b5t8n        [Idle]            [Healthy]
      > MachineSet ...-xkg62               [Idle]            [Healthy]
      > Templates                          N/A               2 objects ...
    ClusterClass quick-start               [Idle]            [Healthy]
  > Add-ons                                N/A               2 objects ...
  > Health checks                          N/A               2 objects ...
```

### The address of the tree

**P2.** Proposed: the page has two parameters, declared in its registration as
the page of the Clusters declares `details` (SPEC-0004, P6):

- `cluster`: `<namespace>/<name>` of the Cluster, read as SPEC-0004 decided for
  the parameter `details` of its page: a namespace, a DNS-1123 label of at most
  63 characters, and a name, a DNS-1123 subdomain of at most 253, joined by one
  `/`, neither of them `.` or `..` (SPEC-0004, "Notes and deviations").
- `details`: the node whose details are open, `<group>/<Kind>/<name>`, or
  `<group>/<Kind>/<namespace>/<name>` for the one node that can live in another
  namespace than its Cluster, its ClusterClass (R3.12); empty when no details
  are open. Each object is one row (P7), so a value names one row. A group, a
  kind and a name hold no `/` (Kubernetes behavior, not in these sources), so a
  value has three parts or four. A virtual node of P7, as Workers, and an entry
  of a binding have no details and no address.

A value of `cluster` that names no Cluster opens the state of an address with no
Cluster, which says the value as written and reads nothing (SPEC-0004, P6); a
value of `details` that names no node of the tree opens, in the drawer, the
state that says that no such object is in the tree of the Cluster, which was
read, or the value as written when it parses as no node (P19). Any view opens
the tree of a Cluster at an object by navigating to this page with both, as it
opens the details of a Cluster by navigating to the page of the Clusters
(SPEC-0004, P6): the details of a Cluster (P3), the overview of SPEC-0006, and
the views of M2 until a spec gives a kind a page of its own. When the address
names a node, the tree shows the nodes above it expanded, brings its row fully
into view once the list has its height, and opens its details (P13, P16).

Both parameters reach the page by the navigation of the extension, which opened
it with both and its drawer open, and by the history of the frame, which
brought both back, on both releases; the details of the host opened over the
page keep both and add their own, `kube-details` (H12, H20;
freelens:get-details-url.injectable.ts:21-36). The host restores neither when
the frame loads again or the cluster connects again: a new frame starts at its
start page, the overview (freelens:start-url.injectable.ts:19-33; P1). An
address of the page with no `cluster` opens the state that says what the page
shows and links the page of the Clusters (P19).

### The ways to the tree

**P3.** Proposed: the details of a Cluster, in both places that SPEC-0004, P16
gives them, the drawer over the list and the panel in the details of the host,
gain a row before their Status, "Tree", whose value is a button, "Open the tree
of this Cluster", that opens the page of P1 on it; and their references to an
object of Cluster API of the Cluster open the tree at that object, with its
details, as P5 says, while a reference to an object of a provider keeps its link
to the details of the host (P5). From the panel, the extension navigates with
its `navigate`, which builds the address of the page from its parameters alone
(freelens:lens-renderer-extension.ts:108-139;
freelens:navigate-to-route.injectable.ts:20-31), so the details of the host
close as the tree opens, as they do when the panel opens the details of another
Cluster (SPEC-0004, P6). When the details of a Cluster show inside the page of
the tree, for its root node (P17), the row "Tree" is left out, since the tree is
under them. The kit asks every mark of an ad hoc view to be a door (kit,
`docs/design.md`, "Ad hoc views"), and SPEC-0004 left the objects below the
first level to the tree, "to which the details will link" (SPEC-0004, "Scope").

**P4.** Dropped after the first two reviews of this draft. It made the cells of
the control plane and of the workers of the list of the Clusters buttons that
opened the tree at the control plane or at Workers. Such a door needs an
address for a node with no object, as Workers, which P2 does not give, and a
click inside a row that neither the click of the row, which opens the details
(SPEC-0004, P13), nor the session of the Clusters, which clicks the middle of a
row (`integration/__tests__/clusters.tests.ts:986, 1019, 1035, 1108`), would hit
by mistake. The list of the Clusters stays as SPEC-0004 decided it, with no
departure, and "Notes and deviations" keeps the counters as doors into the tree
as a step left for later.

### Links between the objects of a Cluster

**P5.** Proposed, but for the four references that the maintainer decided,
below, as what this spec does with the rest of SPEC-0004, P18:

- **What is of Cluster API.** An object is of Cluster API when its group and its
  kind are among the kinds of R1 at `v1.14.4`, the `Provider` of `clusterctl`
  and the seven kinds of the operator included, as A12 counts them (R1, the
  table; A12): every kind of `cluster.x-k8s.io`, ClusterResourceSet and
  ClusterResourceSetBinding of `addons.cluster.x-k8s.io`, KubeadmConfig and
  KubeadmConfigTemplate of `bootstrap.cluster.x-k8s.io`, KubeadmControlPlane and
  KubeadmControlPlaneTemplate of `controlplane.cluster.x-k8s.io`, IPAddress and
  IPAddressClaim of `ipam.cluster.x-k8s.io`, ExtensionConfig of
  `runtime.cluster.x-k8s.io`, Provider of `clusterctl.cluster.x-k8s.io`, and
  CoreProvider, BootstrapProvider, ControlPlaneProvider, InfrastructureProvider,
  AddonProvider, IPAMProvider and RuntimeExtensionProvider of
  `operator.cluster.x-k8s.io`. None of them ever gets the link to the details
  of the host (A7). Any other kind is of a provider, one in those groups
  included, since the kinds of a provider are known only at run time (R1.15).
  It widens the list that SPEC-0004 decided while implementing P18, the group
  `cluster.x-k8s.io`, the KubeadmControlPlane and the KubeadmConfig (SPEC-0004,
  "Notes and deviations"), to every kind of R1; the tree shows those that P7
  places.
- **The details of the extension of an object of a Cluster are those of its
  node in the tree** (P17), opened by the address of P2. In the details of a
  Cluster, the references to its KubeadmControlPlane, its MachineDeployments,
  its MachinePools and its ClusterClass open the tree at their node, with its
  details, as the maintainer decided (below). Proposed apart from that
  decision: the MachineSets and the worker Machines among the parts of the
  workers, and the names in a subject of a message that name an object of
  Cluster API of the Cluster that the view read, which SPEC-0004, P18 proposed
  to keep as text until this spec, open the tree the same way. A name in a
  message still opens something only when the view read its target (SPEC-0004,
  P18).
- **An object of a provider.** In the details of a Cluster, the reference to its
  infrastructure cluster, and to a control plane of a provider, stays the link
  to the details of the host that SPEC-0004, P18 verified: A6 gives an object of
  a provider the page of the host, since the extension has no view of the kinds
  of a provider and the details of the host show their fields (A6). In the
  tree, its node opens the details of the extension as every node does (P17),
  and those details carry the link to the details of the host, at the version
  of its contract (A6; SPEC-0004, P18), which open over the drawer of the tree
  and keep the parameters of the page
  (freelens:get-details-url.injectable.ts:21-36; H20): one Escape closes both,
  and the close icon of the details of the host closes them alone (SPEC-0004,
  P18).
- **No details of the host for an object of Cluster API.** Nothing of the
  extension opens the details of the host for an object of Cluster API or for a
  Namespace, whose toolbar holds the menu of the host (A7; SPEC-0004, P18, P32).
  The details of the host of an object of a provider link its owners to their
  own details in the host (freelens:kube-object-meta.tsx:157-165;
  freelens@v2.0.0:kube-object-meta.tsx:131-139), so the details of the host of
  its Machine, with their menu, are two clicks away from the details of its
  node, the link of A6 and then that of the owner, and three from the tree, as
  they are two from the details of a Cluster through its infrastructure cluster
  (SPEC-0004, P18): never one click away, which is what A7 asks (A7).
- **Owners.** In the details of the extension, an owner of an object is a link
  to its node when the tree holds it, an owner of Cluster API included, which
  SPEC-0004, P32 kept as text until this spec. An owner of Cluster API that the
  tree does not hold stays text, its kind and its name, since the details of
  the host would hold the menu of the host (A7); and so does an owner of a
  provider whose kind the tree does not read, such as the IPAM pool that owns
  an IPAddress (R3.18; P8), since the tree can resolve no version for a link to
  the details of the host without its definition (A2; R7.19), nor tell whether
  it exists. The namespace stays the namespace badge (SPEC-0004, P32), whose
  click sets the global filter of namespaces to it and changes nothing of the
  tree (P1, P17).
- **Inside the page of the tree,** a link to an object of the Cluster selects
  its node and opens its details, in the same page, with no navigation away.

Decided by the maintainer on 2026-11-26, in answer to the question whether the
details of a node of the tree, its status, its conditions and its place, are
the details of the extension that their decision of 2026-11-25 awaits
(SPEC-0004, P18), so that those references become links: yes, links to the
tree, by the option that read "every reference opens the tree at its node, with
its details; the views of M2 will enrich them later". So the references to the
KubeadmControlPlane, the MachineDeployments, the MachinePools and the
ClusterClass in the details of a Cluster, which the decision of 2026-11-25 kept
as plain text, open the tree at their node, with its details (P17). The
decision covers those four kinds, as the one of 2026-11-25 does; every other
way to the tree of this rule is proposed.

### What the tree reads

| Kind                                                                                                             | Version                                   | Where                                                                                                    | For                                                                                                                                                                   | Facts                               |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Cluster                                                                                                          | `v1beta2`                                 | The namespace of the Cluster                                                                             | The root of the tree                                                                                                                                                  | A2, A13; SPEC-0004, P31             |
| Machine, MachineSet, MachineDeployment, MachinePool, KubeadmControlPlane, MachineHealthCheck                     | `v1beta2`                                 | The same                                                                                                 | Their nodes, and the context of the model of each node                                                                                                                | R3.1, R3.4; SPEC-0004, P1           |
| ClusterClass                                                                                                     | `v1beta2`                                 | The namespace that the class reference of the Cluster names, that of the Cluster when it names none (P6) | The node of the class, and the context of the Cluster                                                                                                                 | R3.12, A12                          |
| KubeadmConfig, KubeadmConfigTemplate                                                                             | `v1beta2`                                 | The namespace of the Cluster                                                                             | The bootstrap configs and their templates; no field of their spec                                                                                                     | R1, R3.35, R3.36, A3                |
| ClusterResourceSet, ClusterResourceSetBinding                                                                    | `v1beta2`                                 | The same                                                                                                 | The add-ons, what each applied to this Cluster, and the `bindings` of the model of a ClusterResourceSet                                                               | R3.17, R2.84, R2.85; SPEC-0003, P12 |
| IPAddressClaim, IPAddress                                                                                        | `v1beta2`                                 | The same                                                                                                 | The addresses of the Machines (P21)                                                                                                                                   | R3.18, R2.86, A13                   |
| A kind of a provider: infrastructure cluster, machine or machine pool, bootstrap config, control plane, template | The version that its contract label gives | The same                                                                                                 | Their nodes                                                                                                                                                           | R1.15, R1.16, A2, A6                |
| CustomResourceDefinition                                                                                         | `apiextensions.k8s.io/v1`                 | One by its name                                                                                          | The contract label of a kind of a provider, and the label of its provider, which the model takes as `provider` (SPEC-0003, P24; `src/common/status/types.ts:501-503`) | R1.16, R6.5; SPEC-0004, P3          |

The kinds of the operator are not read, as for every view of one Cluster
(SPEC-0004, P31): the model notes the availability of the controllers as not
read, and marks nothing; with no `controllers`, the label of the provider of a
definition changes only which note the model writes
(`src/common/status/freshness.ts:171-183`). The definitions of the IPAM pools
are not read: the pool of a claim is no node (P8), and the model notes that the
provider of the claim was not given. No Secret is read (A3), and no ConfigMap,
since no rule of the tree needs one: the resources of a ClusterResourceSet are
named from its binding (P7). A list of KubeadmConfigs returns, in clear, the
join tokens and the content of the files that their specs hold (R3.35, R3.36):
the tree types none of those fields and shows none (A3), and the README,
"Permissions", says what that list returns.

**P6.** Proposed: the tree reads as a view of one Cluster of SPEC-0004, P31
reads, and through nothing else: through `ClusterNamespaceRead` of
`src/renderer/reads/cluster-namespace-read.ts`, which takes the kinds of each
view as a parameter, so that the panel in the details of the host and the
details of a Cluster read what they read now, and the page of the tree what the
table above names.

- **The kinds as a parameter.** The read builds its stores from a fixed set of
  kinds: the models of `MODEL_KINDS` (cluster-namespace-read.ts:84-109) and the
  kinds of a provider that the two references of the Cluster name (:181-208),
  which `objects()`, `kinds()` and the APIs that it needs read (:210-227,
  242-286). Its constructor (:145-154) gains the set of kinds of its view: the
  models that it reads, each with its store class, its noun and what it feeds,
  and the references that name the kinds of a provider. The details of a
  Cluster and the panel pass the set that they read now, where they build the
  read (`src/renderer/details/cluster-details-v1beta2.tsx:1065-1073`); the page
  of the tree passes its own: those models, KubeadmConfig,
  KubeadmConfigTemplate, ClusterResourceSet, ClusterResourceSetBinding,
  IPAddressClaim and IPAddress, and, as the references of the kinds of a
  provider, those of the Cluster,
  `spec.infrastructureRef` and `spec.bootstrap.configRef` of each Machine, the
  template references of each MachineDeployment, MachineSet and MachinePool,
  and the machine template of the control plane. A kind of a provider is read
  once a reference of an object already read names it, so the reads of the
  tree grow by steps, as the stores of the control plane and of the
  infrastructure cluster start in SPEC-0004 once the Cluster is read (SPEC-0004,
  "Notes and deviations"); the GETs of their definitions follow the same
  references (:350-359).
- **No source of the mounted page.** The page of the tree never publishes its
  read as the source of the mounted page, as the page of the Clusters publishes
  its own (`src/renderer/pages/clusters-page-v1beta2.tsx:521`;
  `src/renderer/reads/cluster-source.ts:34-41`). The details of a Cluster over
  the list take the reads of their page, and the panel in the details of the
  host those of the mounted page, whenever those reads cover the namespace of
  the Cluster, as SPEC-0004 does (SPEC-0004, P16, P31;
  `src/renderer/details/cluster-details-v1beta2.tsx:1075-1084`;
  `src/renderer/reads/cluster-source.ts:43-57`), and read with a read of their
  own, with the kinds of SPEC-0004 and the namespace of the Cluster alone,
  otherwise. The reads of the tree hold other kinds and, for a class elsewhere,
  a namespace in which they read ClusterClasses alone, so a panel that took
  them would read what the tree reads: with no source published by the page of
  the tree, the panel reads with its own while the tree is mounted, and the
  details of the root of the tree are given the read of the tree itself (P17).
- **The class in another namespace.** The state of the reads of one Cluster
  holds a filter of one namespace
  (`src/renderer/reads/cluster-namespace-read.ts:150-153`), which keeps a
  namespace that a load read only while the filter names it
  (`src/common/views/read-state.ts:180-186, 211`) and gives any other as
  outside (:320-328), and the model finds the class of a Cluster in the
  namespace that its reference names
  (`src/common/views/context.ts:598-614`;
  `src/common/views/references.ts:145-156`). So the store of ClusterClasses of
  the tree loads and watches the namespace that the class reference of the
  Cluster names, that of the Cluster when it names none, once the Cluster is
  read, and no other; when that is another namespace, the read sets its filter
  to both, and every other store keeps the namespace of the Cluster alone. A12
  gives the views the namespaces of the Clusters and of their ClusterClasses;
  the class is an object of the topology of the Cluster, and its gates apply to
  the health of the Cluster when the Cluster declares none (R2.21; SPEC-0003,
  "What it takes and returns"). So the root of the tree can rest on the gates
  of a class that the list of SPEC-0004 leaves out and notes when the filter
  does not select its namespace (SPEC-0004, "What the view reads"); the
  details of a Cluster and the panel read such a class when they take the
  reads of the page and the filter selects its namespace, as the list does,
  and leave it out and note it otherwise, also whenever they read with their
  own, which read the namespace of the Cluster alone
  (`src/renderer/reads/cluster-namespace-read.ts:30-32`): for the same
  Cluster, the health of the root of the tree can then differ from that of its
  row in the list, of its details over the list and of the panel, one click
  apart (P3). Each takes the one model, with the inputs that its read gives,
  and the note of the model says which input is missing
  (`src/common/status/conditions.ts:283-301`); a unit case tries the health of
  the root with the gates of such a class (Tests). Each store loads one
  namespace, that of the Cluster or that of the class
  (`src/renderer/reads/cluster-namespace-read.ts:316-321, 383-388`), which the
  host never reads over the whole cluster (SPEC-0004, "Notes and deviations"),
  so P34 of SPEC-0004, a list that the host reads once over the whole cluster
  and does not follow, does not concern these reads, with two namespaces in
  the filter either.
- **A change of the class reference.** The read follows the reference of the
  Cluster in its store: when the namespace that it names changes, the store of
  ClusterClasses stops its read, its load and its watch, and the read forgets it
  (:370-373), as it forgets a store that it no longer needs (:333-349); a new
  store reads the namespace now named, and the filter follows, which drops the
  namespace that the reference no longer names (read-state.ts:284-292). The
  node of the class shows the spinner of the host until the new load has ended
  (P19). A change of the name alone reads nothing again, since the store holds
  every class of its namespace.
- **`KindFeeds`.** It names what the model takes from each kind, for the notice
  of a kind that cannot be read (read-state.ts:27-49, 399-438). It gains
  `nodes`, for a kind that gives the tree its nodes and no input of the model of
  another node, the bootstrap configs, the infrastructure machines and machine
  pools, the templates, the ClusterResourceSets, the IPAddressClaims and the
  IPAddresses, whose notice says that their nodes read as not read until they
  can be read; and `bindings`, for the ClusterResourceSetBindings, which the
  model of a ClusterResourceSet takes (SPEC-0003, "What it takes and
  returns"), whose notice says that the ClusterResourceSets of those
  namespaces rest on `ResourcesApplied` alone, which the model notes
  (SPEC-0003, P12). The ClusterClasses keep `cluster-class`, the control planes
  of a provider `parts`, and the infrastructure clusters `infrastructure`.

For each kind the read builds one store of the class of its model, or of
`ProviderObjectStore` for a kind of a provider, with the API that the host
registered for that kind and version, never registered, loaded once on its
namespace and then subscribed, under an `AbortController` that the effect of
the page creates, until the page closes (SPEC-0004, P31; AGENTS.md, "Rules That
Fail Silently"). The definition of each kind of a provider is read as
SPEC-0004, P3 reads it: from the store of definitions of the host when it holds
it, otherwise with a GET of that one definition by its name. Every read folds
into the state of SPEC-0004, P25, with its notices and its holds. The reasons:
the roadmap asks the tree to be live (ROADMAP.md:43); SPEC-0004, P31 is how a
view of one Cluster reads its namespace whatever namespaces the filter selects
(A13), with one load and one watch of each kind, whose failures give the state
of that view alone (SPEC-0004, P31); and a reader of the tree's own, a poll or
a client of its own, would read the same objects a second time, outside the
states of SPEC-0004, P25, where the extension reads through the connection of
the host (kit, `docs/safety.md`, "Reading").

Two more points:

- **One field more of a control plane.** The tree reads
  `spec.machineTemplate.spec.infrastructureRef` of a KubeadmControlPlane, the
  reference to the template of its Machines, which is the field of the control
  plane contract at `v1beta2` (R1.15, R4.20), and holds no field of R3.36. For a
  control plane of a provider, it reads the field that the contract of its
  definition names (R4.20; controlplane.go:466-477): at `v1beta2`,
  `spec.machineTemplate.spec.infrastructureRef`, a reference of the contract,
  read as every other (A2); at `v1beta1`,
  `spec.machineTemplate.infrastructureRef`, an object reference with
  `apiVersion`, `kind` and `name` (references.go:52-69), from which the tree
  takes the group, the part of `apiVersion` before its `/`, and never the
  version, which the contract label of the definition of that kind gives (A2),
  since the parser of a reference of the extension reads `apiGroup` alone
  (`src/common/views/references.ts:92-102`).
  SPEC-0004 read no field of the spec of a KubeadmControlPlane but
  `spec.replicas` and `spec.version` (SPEC-0004, "What the view reads"); A3
  forbids showing the fields of R3.36, all under `spec.kubeadmConfigSpec`,
  which the check of Safety keeps matching.
- **The models.** The kinds that the tree adds get a model each in
  `src/renderer/api/context/context-models.ts`, as SPEC-0004, P1 gave the kinds
  of the context: KubeadmConfig, KubeadmConfigTemplate, ClusterResourceSet,
  ClusterResourceSetBinding, IPAddressClaim and IPAddress, with the plain-data
  types of SPEC-0003 for the fields that its rules read and the fields of the
  next sentence, and none of them in `customResources`, since they have no page
  (SPEC-0004, P1). The models of the context gain the fields that the tree
  reads, written from the schemas of the release (AGENTS.md, "Adding an API"):
  of a Machine, `spec.infrastructureRef`, `spec.bootstrap.configRef` and
  `spec.providerID` (R1.15, R2.39;
  `api/core/v1beta2/machine_types.go:431, 453, 787`), its `status.nodeRef`
  being typed already (`src/common/status/types.ts:190`); of a
  MachineHealthCheck, `spec.remediation.templateRef`, a reference with
  `apiVersion`, `kind` and `name` (R1.18;
  `api/core/v1beta2/machinehealthcheck_types.go:83, 141, 169-194`), which its
  type does not hold (`src/common/status/types.ts:296-302`); of a
  MachineDeployment, a MachineSet and a MachinePool,
  `spec.template.spec.infrastructureRef`,
  `spec.template.spec.bootstrap.configRef` and `spec.template.spec.version`
  (R4.11, R4.20, R4.25;
  `api/core/v1beta2/machinedeployment_types.go:277`;
  `api/core/v1beta2/machineset_types.go:100, 260-269`;
  `api/core/v1beta2/machinepool_types.go:82`); of a ClusterClass, the names of
  its variables and of its patches (P20); of a ClusterResourceSet,
  `spec.clusterSelector` (`api/addons/v1beta2/clusterresourceset_types.go:61`);
  of an IPAddressClaim, `spec.clusterName` and `spec.poolRef`
  (`api/ipam/v1beta2/ipaddressclaim_types.go:49, 53`); of an IPAddress,
  `spec.claimRef`, `spec.poolRef`, `spec.address`, `spec.prefix` and
  `spec.gateway` (R3.18; `api/ipam/v1beta2/ipaddress_types.go:25-49`).
  KubeadmConfig and KubeadmConfigTemplate type no field of their spec, which
  holds the fields of R3.36 (A3). It departs from SPEC-0004, P1, whose models
  type the fields of the rules of SPEC-0003 alone, and from the one exception
  of "Adding an API" of AGENTS.md, which types those fields "and nothing else"
  (AGENTS.md, "Adding an API"), by the fields that the tree follows; AGENTS.md
  says so in the same pull request.

### How the tree is built

**P7.** Proposed: the tree is built from what the reads give, one row for each
object, by these rules, each object placed by the first rule that places it,
in this order:

| Node                                                                                                                                        | Found by                                                                                                                                                                                                                                                                                                                           | Placed under                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Facts                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Cluster                                                                                                                                 | Its namespace and its name, in the store of Clusters of the page                                                                                                                                                                                                                                                                   | The root                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | SPEC-0004, P31                                                                                                                                                                                                 |
| The infrastructure cluster                                                                                                                  | `spec.infrastructureRef` of the Cluster, at the version of its contract                                                                                                                                                                                                                                                            | The Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | R1.15, R4.10; SPEC-0004, P3                                                                                                                                                                                    |
| The control plane                                                                                                                           | `spec.controlPlaneRef` of the Cluster, the same way                                                                                                                                                                                                                                                                                | The Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | R1.15, R4.10                                                                                                                                                                                                   |
| Workers, a virtual node                                                                                                                     | One worker of the next rows at least                                                                                                                                                                                                                                                                                               | The Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | R2.13, R4.10                                                                                                                                                                                                   |
| A MachineDeployment, a MachinePool                                                                                                          | The label `cluster.x-k8s.io/cluster-name` with the name of the Cluster, in its namespace                                                                                                                                                                                                                                           | Workers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | R3.1, A13; SPEC-0004, "What the view reads"                                                                                                                                                                    |
| A MachineSet                                                                                                                                | The same label                                                                                                                                                                                                                                                                                                                     | Its controller, a MachineDeployment of the tree; else Workers, when an owner reference names the Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | R3.3, R3.4; SPEC-0004, P17                                                                                                                                                                                     |
| A Machine                                                                                                                                   | The same label                                                                                                                                                                                                                                                                                                                     | With the label `cluster.x-k8s.io/control-plane`: the control plane of the tree, whatever its owner, as the tool places them (discovery.go:145-151), or, when the Cluster names no control plane, Control plane, a virtual node under the Cluster, where the tool puts them under its node Other (discovery.go:177-188); else its controller, a MachineSet or a MachinePool of the tree; else Workers, when an owner reference names the Cluster                                                                                                                                                                                                                                                                                                                                                                  | R3.3, R3.4, R3.7, R4.10; SPEC-0004, P17                                                                                                                                                                        |
| An infrastructure machine, a bootstrap config                                                                                               | `spec.infrastructureRef` and `spec.bootstrap.configRef` of a Machine of the tree                                                                                                                                                                                                                                                   | That Machine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | R1.15, R4.12                                                                                                                                                                                                   |
| The bootstrap config and the infrastructure machine pool of a MachinePool                                                                   | `spec.template.spec.bootstrap.configRef` and `spec.template.spec.infrastructureRef` of the MachinePool                                                                                                                                                                                                                             | The MachinePool, before its Machines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | R4.11                                                                                                                                                                                                          |
| A template                                                                                                                                  | A reference to a kind whose name ends in `Template`, as the controllers tell a template (machineset_controller.go:1860; `controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:130`): the machine template of the control plane (P6), and the template references of a MachineDeployment, a MachineSet and a MachinePool | Templates, a virtual node, after the other nodes of the highest object of the tree that names it, in this order: the control plane, the MachineDeployment, the MachineSet, the MachinePool, and, of two objects of one kind that name it, the first by name, in the order of P14; so a template that only an older MachineSet still names sits under that MachineSet                                                                                                                                                                                                                                                                                                                                                                                                                                             | R3.3, R4.20; machineset_controller.go:1859-1900; P14                                                                                                                                                           |
| An IPAddressClaim                                                                                                                           | `spec.clusterName`, or the label of the name of the Cluster                                                                                                                                                                                                                                                                        | Its controller, when it is a node of the tree, as the contract asks of the infrastructure machine; else as the last two rows say                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | R3.2, R3.18, A13                                                                                                                                                                                               |
| An IPAddress                                                                                                                                | `status.addressRef` of a claim of the tree, else its own `spec.claimRef.name`                                                                                                                                                                                                                                                      | That claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | R3.18                                                                                                                                                                                                          |
| The ClusterClass                                                                                                                            | `spec.topology.classRef`, in the namespace that it names, that of the Cluster when none                                                                                                                                                                                                                                            | The Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | R3.12                                                                                                                                                                                                          |
| A ClusterResourceSet                                                                                                                        | Its `spec.clusterSelector`, in its namespace, matches the labels of a Cluster that has no deletion timestamp, an empty selector matching none, as its controller selects; or, always, the binding of the Cluster names it                                                                                                          | Add-ons, a virtual node under the Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | R3.17, A13; clusterresourceset_controller.go:260-288                                                                                                                                                           |
| A resource of a ClusterResourceSet, as the binding of this Cluster records it                                                               | `spec.resources` of the ClusterResourceSet, and the entry of the binding; `spec.resources` alone when the bindings cannot be read, each entry then "Not read" (P12)                                                                                                                                                                | That ClusterResourceSet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | R2.85; SPEC-0003, P12                                                                                                                                                                                          |
| The ClusterResourceSetBinding of the Cluster                                                                                                | `spec.clusterName`                                                                                                                                                                                                                                                                                                                 | Add-ons, after the ClusterResourceSets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | R3.17                                                                                                                                                                                                          |
| A MachineHealthCheck                                                                                                                        | `spec.clusterName`                                                                                                                                                                                                                                                                                                                 | Health checks, a virtual node under the Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | R3.2, R3.15                                                                                                                                                                                                    |
| An object that no row above places, of a kind that the tree reads, labelled with the name of the Cluster or naming it in `spec.clusterName` | Its owner references                                                                                                                                                                                                                                                                                                               | Its controller, else the first of its owners, that is a node of the tree other than the Cluster or of a kind that cannot be read (P12). Under such a node: a bootstrap config or an infrastructure machine whose Machine does not exist yet, under the MachineSet or the control plane that made it, and an infrastructure machine of a machine pool whose Machine does not exist yet, under its infrastructure machine pool. For an owner of a kind that cannot be read, under the row of that owner, made from the owner reference, its kind and its name, "Not read" (P12): that row sits where an object that the tree read names the owner, as a control plane under the Cluster that names it, and else under the node of the owner's kind, one row for each owner, which holds every object that names it | R3.4; desired_state.go:203-213, 255-265; machineset_controller.go:1932-1941, 2010-2019; `integration/fixtures/machine-pools/devmachine.yaml:94-97`; kit, `docs/design.md`, "States that are not the happy one" |
| Every other such object                                                                                                                     | What placed none of the rows above                                                                                                                                                                                                                                                                                                 | Other objects, a virtual node under the Cluster, with what it holds by the same rules, and the reason of each                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | R3.1, R3.2                                                                                                                                                                                                     |
| A kind that cannot be read, a node made by the tree                                                                                         | Its read refused or failed, or held back, in the namespace of the Cluster, or in that of the class (P6; SPEC-0004, P25); or, for a kind of a provider, its definition, which could not be read, so that the kind is never read (`src/renderer/reads/cluster-namespace-read.ts:183-198`)                                            | The Cluster, after Other objects, one node for each such kind, named by the noun of the kind, as "Machines", or, for a kind of a provider, as "DevMachine objects" (`src/renderer/reads/cluster-namespace-read.ts:262`; P12, P14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | kit, `docs/design.md`, "States that are not the happy one"; SPEC-0004, P25                                                                                                                                     |

How the rules read the objects:

- An owner is matched by its group, its kind and its name in the namespace of
  the object, as the project matches a controller (R4.11), and as the views of
  SPEC-0004 match the owners of a part (SPEC-0004, "Notes and deviations");
  never by the labels `cluster.x-k8s.io/set-name` and `pool-name` (R3.6) or
  `control-plane-name` (R3.7), whose value is a hash beyond 63 characters.
- A reference of the contract is resolved to the version that the contract
  label of the definition of its kind gives, and to its plural (A2; SPEC-0004,
  P3, P18); a reference of the `v1beta1` contract of a control plane gives its
  group from its `apiVersion` (P6). A reference names an object; when that
  object is not in its store, the node of the reference says why (P12).
- A selector of a ClusterResourceSet is read as its controller reads it: its
  `matchLabels` and its `matchExpressions`, with the operators of a label
  selector of Kubernetes, against the labels of the Cluster; an empty or absent
  selector selects no Cluster, and a Cluster with a deletion timestamp is
  selected by none (clusterresourceset_controller.go:260-288). Its binding
  places it whatever the selector says, as long as the binding names it.
- Each object is one row. A template is owned by the Cluster, through an owner
  reference with no flag of controller that the controller of the object that
  names it adds (R3.3; machineset_controller.go:1886-1899), and the class by
  none of its Clusters (R3.12): so neither is placed by its owner, but by the
  references that name it, under the highest object that names it, and the
  details of every other object that names it link to its row (P17). Two
  objects of one kind can name one template: two MachineDeployments, or two
  older MachineSets of one MachineDeployment, as the two MachineSets of
  `rolling-out` name the same two templates
  (`integration/fixtures/rolling-out/machineset.yaml:45-53, 180-188`), which
  nothing in Cluster API prevents (machineset_controller.go:1859-1899). The
  template then sits under the first of them by name, the order of P14, so that
  a value of `details` names one row (P2) and the place of a template depends
  on no order of a store.
- Every node keeps the order and the place of P14.

An object under Other objects, or under the row of an owner that cannot be
read, says why, in the tooltip of its name and in its details (P17), in one of
these words:

- it has no owner, as the MachineSet and the Machine of the set `no-status`,
  whose objects are written as a user writes them, with no owner
  (`integration/fixtures/no-status/README.md`), and which the project counts in
  no worker of the Cluster (R2.13);
- its owner is of a kind not read, which it names, with the reason of that
  kind (P12): the object then sits under the row of that owner, which sits
  where an object that the tree read names the owner, and else under the node
  of its kind, and not under Other objects, so that a refusal never reads as an
  absence (kit, `docs/design.md`, "States that are not the happy one");
- its owners are not nodes of the tree, which it names: owners of kinds that
  the tree read, which its namespace does not hold or no rule places, or of a
  kind that the tree does not read, as the IPAM pool of an IPAddress (P8);
- or the Cluster owns it and no object of the tree names it, as a template that
  no object names any longer (R3.3), with the kinds that can name it and could
  not be read, when there are any, since one of their objects may name it.

An infrastructure machine or a bootstrap config labelled with the name of the
Cluster, whose Machine and whose creator are gone, shows there too, when the
tree reads its kind; a kind that no object of the Cluster names is not read, so
an object of it is not seen, which "Notes and deviations" lists, and neither is
a kind that only a kind that cannot be read names, which the node of that kind
says (P12).

**P8.** Proposed: these are no nodes of the tree, each for its reason:

- **The Secrets and the ConfigMaps of a Cluster** (R3.24 to R3.37): the
  extension never reads a Secret outside the two kubeconfig actions (A3), and
  the tree reads no ConfigMap, since no rule of the tree needs one, the init
  lock `<cluster>-lock` included (R3.37). The resources of a ClusterResourceSet
  are named from its binding, or from its `spec.resources` when the bindings
  cannot be read (P7), by kind and name, never read.
- **The templates of a ClusterClass that only the class names**, in its own
  namespace, which it owns (R3.13): the class is one node, and its templates
  are left to M2. A template that a part of the Cluster names is a node where
  P7 places it, also when the class names it too, as on the set `no-status`
  (`integration/fixtures/no-status/clusterclass.yaml:10-35`;
  `integration/fixtures/no-status/kubeadmcontrolplane.yaml:21-24`).
- **The MachineDrainRules.** Nothing names one (R3.16): its controller lists the
  rules of the namespace of a Machine at its drain, keeps those whose selectors
  match the Machine and its Cluster, a rule with no selector of Machines
  applying to every Machine, and applies the first that matches each Pod
  (drain.go:168-219; filters.go:362-374). A rule is a policy of the namespace
  for the Pods of a workload cluster, which the extension never reads (A2), and
  has no status (SPEC-0003, P16).
- **The remediation requests** that a MachineHealthCheck creates for an
  unhealthy Machine, of the kind of its remediation template without the word
  `Template`, named as the Machine, with an owner reference to it (R3.15;
  machinehealthcheck_controller.go:470-529;
  controllers/external/util.go:243-250). A request is about one Machine, not a
  part of the Cluster; the node of the
  Machine shows the remediation through `ExternallyRemediated`, its activity
  Remediating with its reason (SPEC-0003, P21); and no contract of the book
  names a status of a request, which is always Unknown (SPEC-0003, P15).
- **The remediation template that a MachineHealthCheck names** in
  `spec.remediation.templateRef`, a reference with `apiVersion`, `kind` and
  `name` (R1.18; `api/core/v1beta2/machinehealthcheck_types.go:141, 169-194`):
  the template of the requests above; the details of the MachineHealthCheck
  name it as text, a departure from the kit that P17 records.
- **The IPAM pools**, which a claim names by `spec.poolRef` (R1.15): a pool
  serves the claims of many Clusters (SPEC-0003, "Notes and deviations"), and
  the details of a claim name it as text, with its role (P17); its view is left
  to M2.
- **The Node of a Machine**, in the workload cluster (A2, R3.38): the details of
  the Machine name it, `status.nodeRef.name`, as text (P17).
- **The kinds of the operator, the `Provider` of `clusterctl` and the
  ExtensionConfigs**, which belong to the management cluster and not to one
  Cluster (R1.2, R3.19, R3.14): SPEC-0015 and SPEC-0016 (ROADMAP.md:62, 63).

Settled by the roadmap: the MachineDrainRules that apply to the Machines of a
Cluster, which A13 counts among what a view of one Cluster loads, the
remediation requests of its MachineHealthChecks and their remediation
templates are for SPEC-0013, "Health checks and drain rules:
MachineHealthChecks with their targets and remediations, MachineDrainRules",
in M2 (ROADMAP.md:60). The IPAddressClaims of the Cluster, which A13 names, are
in the tree (P21).

### Every node

**P9.** Proposed: the tree is the `Table` of the host with virtual rows, one row
for each node shown, and neither the list layout of the host nor its
`TreeView`.

- **The `Table`.** The extension API exports it on both releases, with
  `TableRow` (freelens:components.ts:171; freelens@v2.0.0:components.ts:114),
  with `virtual`, `getTableRow` and the heights of its rows, and with `virtual`
  it draws only the rows that the window shows, through the virtual list of the
  host (freelens:table.tsx:98-119, 130-137, 278-291): with 300 or 1000 rows, 32
  row elements at the top and 43 after a scroll, the rows in view and ten on
  each side, in a list 726 px high in a window of 1280 by 900 CSS pixels, on
  both releases (H1, H3). Every row has the height of one line, 33 px
  (freelens:table.tsx:130-137, 280), so every cell is one line, cut with an
  ellipsis, its tooltip whole, as SPEC-0004 decided for the cells of its list
  (SPEC-0004, "Notes and deviations"), and a list of the host stays
  virtualized (kit, `docs/design.md`, "Interaction and performance"). The
  table is `selectable`, a class that draws the hover of a row and the
  selected row as the host draws them, and adds no checkbox, which is a cell
  that the list layout adds (freelens:table.tsx:58-61, 298-305;
  freelens:table.scss:24-50; freelens:content.tsx:353-355). The screenshots of
  the probe show the selected row so drawn, its bar and its background (H3);
  they recorded neither the hover nor the absence of a checkbox, which the
  screenshots of the themes show (Manual verification).
- **The height of the table.** The virtual list fills the height of its parent
  (freelens:virtual-list.tsx:138-142, 155;
  freelens@v2.0.0:virtual-list.tsx:125-129, 142). The page, the element around
  the table (P18), the `Table` and its `.VirtualList` form a chain of flexible
  boxes of a definite height, each of which may shrink below its content,
  `min-height: 0`, as the list layout of the host does for its own
  (freelens:item-list-layout.scss:34-46). Without it the list takes the height
  of all its rows, draws every one of them, 1000 of 1000, and never scrolls,
  and the content area of the host clips the rows past the window, which no one
  can reach, on both releases; with it, the list is 726 px high and is the one
  element that scrolls (H5). The table hands its class to its list as well
  (freelens:table.tsx:288, 299; freelens:virtual-list.tsx:144;
  freelens@v2.0.0:virtual-list.tsx:131), so a rule on that class reaches both.
  A case of `styles.test.ts` checks the chain, seen failing once on a
  stylesheet without `min-height: 0` (Tests).
- **A cell cut with an ellipsis.** A cell of the host lays out its content as a
  flexible box (freelens:table-cell.scss:11-18), whose text is cut with no
  ellipsis: at seven levels of depth in a window 1024 px wide, the counts of
  P11, the text of their cell, were cut at 222 of their 401 px with nothing to
  say so (H22). So every cell holds its content inside an element of the
  extension that cuts it with an ellipsis, as the marks of a cell of the list
  are held (`src/renderer/styles.test.ts:126-132`), the counts included; the
  flat badge of a role cuts itself (freelens:badge.module.scss:28-39).
- **Not the list layout.** The list layout of the host is the list of one kind:
  one store, which it subscribes and whose selection it offers to remove
  (SPEC-0004, P19), a search that keeps only the rows that match
  (freelens:list-layout.tsx:264-276), and columns that sort the rows (SPEC-0004,
  P28). The rows of the tree are objects of many kinds and virtual nodes in the
  order of a hierarchy, which a sort would reorder and a search that drops the
  nodes above a match would cut (P14, P15). The kit gives a view of
  relationships, and the way from a summary to the objects behind it, to an ad
  hoc view, built with the components that the host has, its tables among them
  (kit, `docs/design.md`, "Ad hoc views", "When", "With what"). It departs from
  the kit, whose list inside an ad hoc view is still the list of the host (kit,
  `docs/design.md`, "Ad hoc views", "Where"), and whose list stays live through
  the subscription of the layout of the host (kit, `docs/design.md`, "Lists"):
  the tree stays live through the reads of SPEC-0004, P31 (P6, P23). DESIGN.md
  records both.
- **Not the `TreeView`.** The extension API exports a `TreeView` on both
  releases (freelens:components.ts:173; freelens@v2.0.0:components.ts:116),
  which the host uses for the categories of its catalog
  (freelens:catalog-menu.tsx:45-67). It holds no columns; it renders every
  child of a group whatever its state, hiding a collapsed group by a height of
  zero (freelens:tree-view.tsx:110-128; freelens:tree-view.module.scss:29-41),
  so hundreds of Machines would all be drawn; it answers to the pointer alone
  (freelens:tree-view.tsx:66-75, 113-114); and it keeps the state of a group to
  itself, set once from `defaultExpanded` (freelens:tree-view.tsx:107-110), so
  neither the address nor the keyboard could open a group. It carries the roles
  `tree`, `treeitem` and `group` (freelens:tree-view.tsx:29, 70, 113), which
  the `Table` and its rows do not (freelens:table.tsx:297-312;
  freelens:table-row.tsx:37-47): the tree carries those of a tree with
  columns, `treegrid`, `row`, `columnheader` and `gridcell`, itself (P18).
  The `Table` is a component of the host as well, so the tree stays native
  (kit, `docs/design.md`, "Native first").

The columns, after the grammar of the list of SPEC-0004 (SPEC-0004, P7):

| Column    | Shows                                                                                                                                                                                                                                                                                                                                                                                                                                  | When it does not apply                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name      | The indentation of its depth, the button that expands or collapses a node with children, and the kind and the name as the project writes them, a button that opens the details (SPEC-0004, P13); for an object of a provider, its role in words after the name; for the class in another namespace, `namespace/name`; for a row with no details, its words as text                                                                     | Never                                                                                                                                                                                                                                                                                                                      |
| Replicas  | The available Machines of the desired (SPEC-0004, P8): of a control plane, by its contract; of a MachineDeployment, a MachineSet and a MachinePool, `status.availableReplicas` of `spec.replicas`; of a Machine, one desired, one available when its `Available` is `True`; of Workers and of Control plane, those of the Cluster, `status.workers` and `status.controlPlane` (R2.12, R2.13, R4.22; SPEC-0004, "Notes and deviations") | N/A, its tooltip that the kind keeps no replicas, or that the object was not read (P12)                                                                                                                                                                                                                                    |
| Version   | Of the Cluster, as the list shows it (SPEC-0004, P9); of a control plane, `spec.version` by its contract; of a MachineDeployment, a MachineSet and a MachinePool, `spec.template.spec.version`; of a Machine, `spec.version` (R4.25); of Workers and Control plane, the versions of the Cluster, oldest first (R2.12, R2.13)                                                                                                           | N/A, its tooltip that the kind has no version, or that the object was not read (P12)                                                                                                                                                                                                                                       |
| Activity  | Each activity in a mark of its tone, with its state when it is not Progressing and its duration, as the list shows them (SPEC-0004, P7; DESIGN.md, "The status model in lists and details")                                                                                                                                                                                                                                            | Deleting alone, or N/A, for a kind with no status (SPEC-0003, P16); N/A for a virtual node or an entry of a binding; "Not read" or "Not found" for a node that cannot be read, the node of a kind that cannot be read and an entry whose binding cannot be read (P12)                                                      |
| Condition | The word of the health in its tone, the word "stale" with its causes in the tooltip (SPEC-0004, P12), then the counts of P11; for the Cluster, how many of its MachinePools are of unknown health, when one is, as the list shows it (SPEC-0004, P12)                                                                                                                                                                                  | N/A for an object that is deleting or of a kind with no status (SPEC-0003, P16), and for an entry of a binding; the counts alone for a virtual node; "Not read" or "Not found" for a node that cannot be read, an entry whose binding cannot be read, and, before its counts, the node of a kind that cannot be read (P12) |
| Status    | P10                                                                                                                                                                                                                                                                                                                                                                                                                                    | P10                                                                                                                                                                                                                                                                                                                        |
| Age       | The age component of the host                                                                                                                                                                                                                                                                                                                                                                                                          | N/A for a virtual node, the node of a kind that cannot be read included, or an entry of a binding, and for a node that cannot be read (P12)                                                                                                                                                                                |

- **The name.** Its indentation is one step of the spacing of the host for each
  level (kit, `docs/design.md`, "Theme": spacing from the scale of the host), so
  that the depth reads without lines. The button that expands a node shows the
  icons that the tree of the host shows, `chevron_right` collapsed and
  `expand_more` expanded (freelens:tree-view.tsx:116-118), and stops its click
  at itself, as a link in a row does (kit, `docs/design.md`, "Lists"). A leaf
  has none, and its name keeps the place of the button. Neither the button that
  expands nor the name takes a stop of Tab, `tabIndex` -1, nor the focus on a
  press of the mouse, whose `mousedown` has its default prevented: the element
  of the tree takes the keys, and the click gives it the focus (P18).
- **The role.** For an object of a provider, whose kind is known only at run
  time (R1.15), the name is followed by its role in the words of the closed set
  of SPEC-0003, the eight of `ProviderRole` (SPEC-0003, P15;
  `src/common/status/types.ts:442-452`): infrastructure cluster, control plane,
  infrastructure machine, bootstrap config, infrastructure machine pool, IPAM
  pool, remediation request, template. The tree places objects of six of these
  roles: an IPAM pool and a remediation request are no nodes (P8), and the
  details of a claim name its pool with its role (P17). The role is a small
  flat badge of the host, with no background, since a mark of state is a badge
  whose background is its tone, and a badge of the host with its own
  background would read as a mark of the tone Unknown (SPEC-0004, P21;
  freelens:badge.module.scss:34-43); and it never expands, `expandable={false}`
  (freelens:badge.tsx:42, 53-65), since no cell expands on a click (DESIGN.md,
  "The status model in lists and details"). The flat badge reads as plain
  text: the same size and the same color as a text of that size beside it, in
  the dark and the light theme of both releases (H10). The role of an object
  of Cluster API is its kind, and its place in the tree.
- **Rows with no details.** The virtual nodes, which hold the objects of one
  role, or stand for a kind that cannot be read, and are no objects: Control
  plane, Workers, Templates, Add-ons, Health checks, Other objects and the node
  of each kind that cannot be read (P7, P12); and the entries of a binding, the
  resources of a ClusterResourceSet (P7). They have no health and no activity of
  their own; a virtual node shows the counts of P11, and Workers and Control
  plane show the counters and the versions that the Cluster keeps of them. Their
  name is text, not a button. A click on such a row stops its propagation, as a
  click on every row does (P17), so that open details stay open and show what
  they showed; on a virtual node it expands or collapses it, and so do Enter and
  Space (P18).
- **A narrow window.** The columns of the domain give their room first,
  Replicas and Version before the name, and the columns of state keep their
  minimum width and do not shrink, through the classes of their cells, as the
  list does (SPEC-0004, P7; DESIGN.md, "The status model in lists and
  details"), so that the state of every row stays in view (kit,
  `docs/design.md`, "Interaction and performance"); the test of the stylesheets
  checks it, as it checks the list (Tests). At seven levels of depth, that of
  an IPAddress under its claim, in a window 1024 px wide, the rows of the probe
  stayed one line of 33 px and a name at that depth showed whole, on both
  releases; but its names were made up, in four columns (H2, H22), so how the
  names and the seven columns of the tree fare at that width is the session's
  to measure (Tests). No fixture reaches that depth, since no claim of the
  fixtures sits under an infrastructure machine (P21), so it is tried at the
  unit layer alone, on a tree that a case builds (Tests). The counts of P11
  take the element that cuts them with an ellipsis, above.

**P10.** Proposed: the cell Status shows what the health of the node rests on,
as the model returns it (SPEC-0003, "What it takes and returns";
`src/common/status/health.ts`, `HealthBasis`), the whole of it in its tooltip:

| What the health rests on                                            | Kinds                                                                                                                                                                 | The cell                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A condition                                                         | Cluster, Machine, MachineDeployment, the control planes, KubeadmConfig, ClusterClass, an IPAddressClaim that writes `Ready` (SPEC-0003, P13), an object of a provider | The headline of its message, else its reason (DESIGN.md, "The status model in lists and details"); N/A when it is not written, with the tooltip that the object reports none yet (R2.1)                                                                                                                      |
| The available Machines against `spec.replicas` (SPEC-0003, P9, P10) | MachineSet; MachinePool with Machines, or with none at 0 replicas, which is Healthy (SPEC-0003, P10; `src/common/status/machines.ts:136-143`)                         | `<available> of <replicas> Machines available`, N/A for a count that is not written; for a MachineSet, the message of `MachinesReady` in the tooltip (R2.58)                                                                                                                                                 |
| No Machine for a MachinePool (SPEC-0003, P10)                       | MachinePool without Machines and with replicas above 0                                                                                                                | The words of the note of the model, that no Machine stands for its instances, and its deprecated `v1beta1` `Ready` with the label "deprecated" in the tooltip (A5)                                                                                                                                           |
| The targets of a MachineHealthCheck (SPEC-0003, P11)                | MachineHealthCheck                                                                                                                                                    | `<healthy> of <expected> targets healthy`, and the mark of remediation of P11 of SPEC-0003 in the tooltip, with the message of `RemediationAllowed`                                                                                                                                                          |
| The address of a claim with no `Ready` (SPEC-0003, P13)             | IPAddressClaim that writes no `Ready`                                                                                                                                 | The name of the IPAddress of `status.addressRef`, or N/A with the tooltip that no address is written yet                                                                                                                                                                                                     |
| `ResourcesApplied` with the bindings (SPEC-0003, P12)               | ClusterResourceSet                                                                                                                                                    | The headline of `ResourcesApplied`, else its reason; what it applied to this Cluster is in its children                                                                                                                                                                                                      |
| Nothing (SPEC-0003, P15)                                            | An object whose role or kind the model does not know                                                                                                                  | N/A, with the note of the model in the tooltip                                                                                                                                                                                                                                                               |
| No status (SPEC-0003, P16)                                          | The templates, the binding, IPAddress                                                                                                                                 | N/A, with the tooltip that the kind has no status                                                                                                                                                                                                                                                            |
| An entry of a binding                                               | A resource of a ClusterResourceSet                                                                                                                                    | `Applied` with the instant of `lastAppliedTime`, `Not applied`, or `In no binding of this Cluster`, as the binding records it (R2.85; SPEC-0003, P12); when the bindings cannot be read, "Not read." and their reason, never `In no binding of this Cluster`, which would show a refusal as an absence (P12) |
| Not read (P12)                                                      | A node that the tree cannot read, and the node of a kind that cannot be read                                                                                          | Its reason, as P12 says                                                                                                                                                                                                                                                                                      |

DESIGN.md leaves the cell of a kind whose summary is not a condition to the spec
of its view (DESIGN.md, "The status model in lists and details"): the tree is
the first view of these kinds, and gives each the words of what its health
rests on, which no cell leaves empty (kit, `docs/design.md`, "Lists"); DESIGN.md
takes them as the rule of every view.

**P11.** Proposed: every node with objects under it carries, in its cell
Condition after its own marks, the counts of those objects, worst first, in the
order in which the columns of state sort (DESIGN.md, "The status model in lists
and details"; SPEC-0004, P28): Unhealthy, Degraded and Unknown, then those not
read and those not found (P12), whose health is unknown, never healthy (kit,
`docs/safety.md`, "Reading"), then Healthy, each by the word of their health as
the model gives it, and last those with no health, as
`12 objects: 1 Unhealthy, 1 not read, 10 Healthy`. The number of objects whose
health is stale follows the count of their health, in parentheses, as
`14 objects: 1 Unhealthy, 13 Healthy (2 stale)`, since SPEC-0003 asks a count
of health to keep the stale ones next to it and never to add a stale health to
the fresh ones without saying so (SPEC-0003, "Freshness"). The counts count
objects: never a virtual node, and never an entry of a binding, which is a
record of the binding, no object (P7). The tooltip names the node that holds
them and says the same whole, with the stale ones of each health. While an
object under the node still loads, the counts show the spinner of the host in
their place, as a mark does (DESIGN.md, "The status model in lists and
details"). A virtual node shows these counts alone. A count over several
objects counts the results of the model, and the view adds no mark of its own
over several objects (SPEC-0003, "How a view uses it"; DESIGN.md, "The status
model in lists and details"; SPEC-0004, P17). The counts are shown whether the
node is expanded or not: under a node with hundreds of Machines they say how
many need a look before the user scrolls (P16).

The counts are words of their cell, and no control: the row is the door, which
opens the details of its node, or expands or collapses a virtual node, on a
click and on Enter (P9, P17, P18), and the search of P15 keeps the nodes whose
health is the word searched, as `Unhealthy`, with the nodes above them. It
departs from the kit, whose count opens the filtered list (kit,
`docs/design.md`, "Ad hoc views"): a count that opened something else would be
a second target inside a row, which P4 left for later in the list of the
Clusters for the same reason; DESIGN.md records it.

### A node that cannot be read

**P12.** Proposed: a node whose object the tree cannot read is still a row,
made from the reference that names it, or from the owner reference of an
object that it owns (P7), and says "Not read." and its reason, as the details
of a Cluster say it of a reference that they cannot read
(`src/renderer/details/cluster-details-v1beta2.tsx:526-528`; SPEC-0004, P18).
A kind that the tree cannot read in the namespace of the Cluster, or in that
of the class, its read refused or failed, or held back after a refresh that
failed (P23), is a node of its own under the Cluster, made by the tree and
named by the noun of its kind, as "Machines", which says "Not read." and its
reason in the same way, and stands for every object of that kind that no
reference names. So is a kind of a provider whose definition cannot be read,
which the reads then never read
(`src/renderer/reads/cluster-namespace-read.ts:183-198`), named as the notices
of SPEC-0004 name it, as "DevMachine objects" (:262). An object whose owner is
of a kind that cannot be read sits under the row of that owner, made from its
owner reference: that row sits where an object that the tree read names the
owner, as a control plane under the Cluster that names it, and else under the
node of the owner's kind (P7). Its row, as every row of a node that cannot be
read:

- **Name:** its kind and its name as text, and its role; for the node of a
  kind, the noun of the kind as text.
- **Activity and Condition:** the words "Not read", or "Not found" for an
  object that its namespace, which was read, does not hold, as text with no
  tone; never N/A, which in these columns says that a kind has no status
  (SPEC-0003, P16; DESIGN.md, "Words"), and never a mark of the model, which did
  not see the object.
- **Status:** the reason, in the words of SPEC-0004
  (`src/common/views/cluster-details.ts:138-148`): its definition could not be
  read, with the permission that it takes, `get` on that definition (R6.5); its
  definition names no version of the contract that the extension knows
  (SPEC-0003, P26); the cluster serves no such kind, or not at the version that
  its contract label names; its kind could not be read in its namespace, which
  the words name: the namespace of the Cluster, or, for the class, the one that
  its reference names (P6); or no such object is in that namespace, which was
  read, with no "Not read.", as SPEC-0004 says it (SPEC-0004, "Notes and
  deviations"). For the node of a kind, the reason, and after it, for a kind
  whose objects name the kinds of the providers that the tree reads (P6), the
  Machines, the MachineDeployments, the MachineSets, the MachinePools and the
  control planes, the words that the objects that only that kind names are
  not read either, since the tree learns their kinds from its objects alone
  (P6), as the infrastructure machines that only Machines name; so the
  objects of such a kind that no reference names, as an infrastructure
  machine whose Machine does not exist yet (P7), read as not read, and never
  as absent. The node of any other kind, as the KubeadmConfigs, the
  ClusterResourceSetBindings or the DevMachines, whose objects name no kind
  that the tree learns from them, never says those words. The node of a kind
  of a provider whose definition cannot be read says that its definition
  could not be read and that its objects are not shown, since the reads never
  read them, and then, for a control plane, the words above; so the objects
  of that kind that no reference names, as the DevMachines that no Machine
  names, are not shown as an absence.
- **Replicas, Version and Age:** N/A, with the tooltip that the object was not
  read, or not found.

The tooltip of the cells of Activity, Condition and Status says "Not read." and
the reason whole, with the message of each answer, shown and never read
(SPEC-0004, P25), and the details of the node say the same. The node of a kind
that cannot be read has no details, as no virtual node has (P9): its cell
Status says the reason and the words that follow it above, cut with an
ellipsis as every cell, and the tooltip of that cell holds the whole text,
with what the notice of the kind says (P19), since the kit keeps nothing
important in a tooltip alone (kit, `docs/design.md`, "Interaction and
performance"). An entry of a ClusterResourceSet whose binding cannot be read,
built from `spec.resources` alone (P7), says "Not read" in its cells of state
and, in its cell Status, the reason of the bindings, never
`In no binding of this Cluster`, which would show a refusal as an absence
(P10). A node whose kind is still loading shows the spinner of the host in the
place of its marks, never Unknown (DESIGN.md, "The status model in lists and
details"). The counts of P11 count such a node as not read, or not found, and
never the node of a kind, which is no object. The kit wants a reference that
cannot be followed shown as text, a refusal never shown as an absence (kit,
`docs/design.md`, "Details", "States that are not the happy one"), and a status
that cannot be read shown as unknown, never as healthy (kit, `docs/safety.md`,
"Reading"); on the set `deleting`, the templates that its MachineDeployment
names are gone, and their nodes say so.

### What is expanded at first, and the order

**P13.** Proposed: the tree shows its rows once the first load of every kind
that it reads has ended in this mount of the page, loaded or failed, the kinds
of the providers that the objects of those loads name included, or once their
references cannot be resolved; before, the spinner of the host stands in the
place of the tree (P19), so that the expansion at first applies before any row
is seen. It opens with the Cluster expanded, and with every node expanded under
which, or at which, an object needs a look: its health is Unhealthy, Degraded or
Unknown; it has an activity other than Idle and Paused, or the activity Paused
by its own annotation `cluster.x-k8s.io/paused`; a mark of freshness other
than Paused; or it could not be read or was not found. A subtree whose objects
are all Healthy and Idle stays collapsed, with its counts (P11). This expansion
is computed once; then the node that the address names is shown, the nodes
above it expanded. After that only the user expands and collapses, and the tree
keeps each choice by the identity of the node, for as long as the page shows
that Cluster: a change of state expands nothing and moves no row, so that the
row under the pointer or the focus stays where it is while only states change.
It reads the results of the model and changes no word of them: it is no rule
of status.

The pause: `spec.paused` of a Cluster pauses every object of it whose controller
honours it (SPEC-0003, P19; R4.57), and the activity Paused of the Cluster, at
the root, says it once. An object paused by its own annotation, by its presence,
which the Cluster does not report (SPEC-0003, P19), is expanded with the nodes
above it, as a paused Cluster shows its pause at the root; the tree tells it by
the annotation of the object, as the details tell the form of the pause of a
Cluster (`src/common/views/cluster-details.ts:279-292`).

Rows inserted or removed above the rows in view: a rollout adds and removes
Machines every few seconds, and the virtual list of the host keeps its offset
when rows are inserted above the rows in view, so those rows move under the user
by the rows inserted, on both releases: ten rows inserted at the top showed
`n-490` where `n-500` was (H18). So the page keeps the rows in view in place:
it keeps the identity of the first row in view, and, in a layout effect, which
runs once the rows of a render are in the DOM and before the browser paints
them (React behavior, not in these sources), it moves the scroll of the list's
element by the height of the rows inserted above that row, 33 px a row
(freelens:table.tsx:130-137, 280), and back by that of the rows removed above
it. The user then sees what the probe showed: the probe moved the scroll in the
same task in which it asked for the rows, before the host drew them, since the
host renders with `createRoot` (freelens:react-root.injectable.ts:28), whose
renders run after the code that asked for them (React behavior, not in these
sources), and `n-500` stayed at the top on both releases (H18). The `Table`
hands the page no handle on its list but `selectedItemId`
(freelens:table.tsx:283-290), and the virtual list of the host, with its
`scrollToItem`, is exported by 2.1.0 alone (freelens:components.ts:174-181, at
`v2.1.0` alone; H1, H18), which the extension does not use, since it runs on
2.0.0 as well (A8): the page sets the scroll of the element of the list that
its table holds, under the `.VirtualList` of the table
(freelens:virtual-list.tsx:144-156; freelens@v2.0.0:virtual-list.tsx:131-143).
Two cases are open: rows that a watch inserts, since the probe inserted its
rows from the page, and a watch brings its objects through the same render
(H25); and rows removed above the view, whose compensation the probe did not
try (H18). The session tries both (Tests); where the compensation does not
hold, the fallback is that the rows in view shift by the rows inserted or
removed above them, as the list of the host leaves them. Expanding, collapsing
and searching are no such change: the page moves no row for them and does not
scroll the list, so the active node may leave the view until the next key move
brings it back (P16, P18). The project's own tool hides what is ready and
merges what is alike to show the problems first (R4.15 to R4.18); the tree
shows them first by what it expands, and hides nothing.

**P14.** Proposed: the nodes under the Cluster come in this order: the
infrastructure cluster, the control plane or the virtual node Control plane,
Workers, the ClusterClass, Add-ons, Health checks, Other objects, then the node
of each kind that cannot be read, in the order of the rows of P7, and two kinds
of one row in the order of their names, as MachineDeployments before
MachinePools (P12). The first three are the parts that the `Available` of a
Cluster merges, in the order in which it merges them (R2.21). The tool of the
project prints the children of a node by a z-order of its own, the node
Templates first, then by the text of their rows (R4.13;
`internal/util/tree/tree.go:251-264`), so its order follows the kinds and the
names of its rows. Under Workers come the MachineDeployments, the MachinePools,
the MachineSets and then the Machines that the Cluster owns; under an object,
its objects in the order of the rows of P7, Templates last. The nodes of one
kind under one node are in the order of their names, as the tool orders the
rows of one z-order (R4.13), and never by their state: a row does not move when
its state changes (P13); of two objects of one kind that name one template, the
first in that order holds it (P7). The search of P15 and the counts of P11 find
the objects that need a look among hundreds.

**P15.** Proposed: the header of the page holds the search of the host,
`SearchInput`, which the extension API exports on both releases
(freelens:components.ts:109; freelens@v2.0.0:components.ts:67;
freelens:input/index.ts:10). By default it takes the focus when the page mounts,
and an Escape in it clears it and stops there (freelens:search-input.tsx:27-32,
64-71): on a page opened at an address with `details`, the search had the focus,
and Escape cleared it, or did nothing to it when it was empty, and never closed
the details, on both releases (H21). So the page gives it `autoFocus` false,
which the input passes to its element (freelens:search-input.tsx:81-98;
freelens:input/input.tsx:385-405, 461), so that the focus goes to the tree
(P18), and an `onKeyDown` of its own, which the input calls before its own
(freelens:search-input.tsx:65): an Escape in a search that holds words clears
them, as in every list of the host, and one in an empty search closes the
details. While the details of the host are open over those of a node, which
the address says by `kube-details` with a value (P17), that Escape closes
those of the host first, with `hideDetails`, as a click on a row does (P17),
since the search stops the Escape before the listener of their drawer on the
window hears it (freelens:search-input.tsx:64-71); otherwise it closes the
details of the node. While the search holds words, the tree shows the nodes
that match, and the nodes above them, expanded, and says next to the search
how many nodes match; when it is cleared, the expansions of the user come back
as they were.

A node matches the words that its row shows: its kind and its name, its role,
its version, the words of its cells Activity and Condition but the counts of
P11, and those of its cell Status, the headline, else the reason, or the words
of P10 and P12; and, for the class read in another namespace, that namespace,
which its row shows (P9). The namespace of every other row is that of the
Cluster, which the title names: a word of it would keep every row, so it is not
searched; and the counts, which say what the nodes under a node hold, would
keep every node above a match, and inflate how many nodes match. It departs
from the rule given after the first reviews of this draft, which listed the
namespace among the words that a node matches, for that reason. It departs
from the search of the list of SPEC-0004, which also matches the namespace, the
id and the labels, as `key=value`, that `getSearchFields()` of the host gives
(SPEC-0004, P14): the search of the tree keeps the nodes above each match, so a
match must show in its own row, which a label or an id would not. An operator
looks for "Unhealthy", "Provisioning", a version or the name of a Machine, and
a search covers what a column shows (SPEC-0004, P14).

### A large Cluster

**P16.** Proposed: a Cluster of hundreds of Machines, each with its
infrastructure machine and its bootstrap config, gives the tree a thousand
objects and more. The tree holds them so:

- **Rows that the window shows.** The table draws only the rows in the window
  and ten on each side (P9), and a scroll leaves no row blank once it settles:
  for one frame after each step of the wheel a strip of 40 to 70 px of the
  726 px of the list had no row, and after each move of a drag of the
  scrollbar 551 to 580 px, on both releases (H4). The tree scrolls only on a
  key move (P18), an address (P2), the closing of the details (P17) and the
  compensation of rows inserted or removed above the view (P13), and never
  otherwise: expanding, collapsing and searching move no row and do not
  scroll, and the active node may leave the view until the next key move
  brings it back. The virtual list of the host scrolls to its
  `selectedItemId` at every render (freelens:virtual-list.tsx:126-136;
  freelens@v2.0.0:virtual-list.tsx:113-123), and the table renders it at every
  render of its own (freelens:table.tsx:283-291): given at every render, it
  took the list back to the selected row at each render of the page, with the
  same `getTableRow` at each render too, on both releases (H6). So the page
  gives it in the render that follows a key move, and in its first render for
  the row of the address (below), and in no other, and clears it once the list
  has scrolled to that row, which the page knows when the row is drawn (P18):
  the probe cleared it two animation frames after the render that gave it, by
  when the row of the move was drawn, and no render after moved the list (H2,
  H6, H15). A render of a change of state, which comes every few seconds while
  a Cluster rolls out, never takes the user back to a row that they scrolled
  away from. The list leaves a row that is partly in view where it is (H17),
  so a row that a move leaves partly in view the page brings fully into view
  itself, by the scroll of the list's element, as the handler of the keys of
  the probe did, the row there at the first frame (H15; P13).
- **The address at the first mount.** The list scrolls to its `selectedItemId`
  at its first mount before it has measured its height, which is 0 until then
  (freelens:virtual-list.tsx:73, 152; freelens@v2.0.0:virtual-list.tsx:60,
  139): the row of the address landed half under the head, its top 17 px above
  the top of the list, on both releases, and the renders after left it there
  (H17). So the page gives `selectedItemId` for the address in its first
  render, as the probe did, clears it once the list has scrolled, as after a
  key move, and, once the list's element has its height, sets its scroll so
  that the whole row shows (P2). The probe did not try that second scroll at
  the first mount (H25); the page test and the session read the top of the row
  against the top of the list, and without it the row stays half under the
  head, as the host scrolls it, with its details open.
- **No work in a render.** The indexes of the objects, the tree and the results
  of the model are built once for each change of what they read, never at a
  render or a tick that changes none of them, and the results are kept under the
  keys of SPEC-0003 (SPEC-0003, "How a view uses it"; SPEC-0004, "Notes and
  deviations"), so that a watch event on one Machine evaluates that Machine and
  the objects whose context holds it, its owners and its Cluster, again. The
  page evaluates the model with the time of each render, and again at the
  earliest time that a result of the tree names (SPEC-0004, "Notes and
  deviations").
- **Nothing merged.** Each Machine stays one row (P7), where the tool of the
  project merges Machines of one state into a group that drops their children
  and their marks of deletion (R4.15 to R4.17, R4.25). The counts of each node
  (P11), the expansion at first (P13) and the search (P15) lead to the ones that
  need a look.

The session of the tree tries it on a Cluster of 300 Machines that it makes
itself (P22), alone in its namespace. Every kind is read over the namespace of
the Cluster (P6), so a namespace that holds many Clusters gives the reads of the
tree the objects of all of them, which the indexes keep apart (Tests, "Unit")
and no session measures.

### The large Cluster of the session

**P22.** Proposed: the large Cluster is no state of the fixtures. The session of
the tree in Freelens makes it itself, in its last step, after the read-only
check of the fixtures (Tests), in a namespace of its own,
`freelens-capi-tree-large`, which is the namespace of no state (TESTING.md,
"The fixtures"), from manifests that it generates at run time from the objects
of `healthy`, read from their files as the unit tests read them
(`test/fixture-sets.ts:27-29`): the Cluster of `healthy` with its objects, in
that namespace, its MachineDeployment, its MachineSet and the counters of the
Cluster at 300 workers, its MachineHealthCheck of the workers with them all as
its targets, and 300 worker Machines, each a copy of a worker of the set with
its infrastructure machine and its bootstrap config, each with a name of its
own and its owner references to its own objects, as the controllers write them
for a healthy worker. A copy of a captured object carries only what the
controller writes in that state (kit, `docs/testing.md`, "The test environment
has two tiers"), and no capture can make 300 Machines on a runner of CI. The
session applies them as the scripts apply a state, the objects first, owners
before their dependents, then the changes that give each its generation, then
each status through the status subresource
(`e2e/scripts/commands.mts:1366-1430`), through a function that the scripts
export beside `openDefinitions` (`e2e/scripts/commands.mts:1307-1343`); and it
deletes that namespace at its end, also when a step failed, and checks that it
is gone, before any other session runs, since the sessions run one at a time
(`vitest.integration.config.ts:19-21`). The probe derived such a set from
`healthy` with the reader and the writer of the scripts, 922 objects: 301
Machines, 301 DevMachines, 301 KubeadmConfigs and the 19 other objects of the
set; written as files, it is 18 files and 2.8 MB, which is why the session makes
it at run time and the repository holds none of it (H24). A state of the
scripts would also take an entry in `FIXTURE_STATES`
(`e2e/scripts/states.mts:464`), which the tests below that read every state
would read.

So no test that reads every state changes: the check that the folders of the
fixtures are the fifteen states (`src/common/status/fixtures.test.ts:158-185`),
the states that the unit tests read from those folders
(`test/fixture-sets.ts:22-25`), the states of the scripts
(`test/environment.test.ts:2106-2112`), the sessions that read every state
(`integration/__tests__/clusters.tests.ts:60-71`;
`integration/__tests__/clusters-restricted.tests.ts:90-109, 680`), and
`pnpm e2e:fixtures:check`, which takes every state
(`e2e/scripts/commands.mts:1540`). The generation is a pure function of a module
of the session, `integration/__tests__/large-cluster.ts`, with its unit test in
`test/large-cluster.test.ts`, as `restricted-access.ts` is tested (SPEC-0004,
"Notes and deviations"): every copy is named apart, every owner reference names
an object of the set, and the counters add up to the Machines.

Time. The scripts applied the set of the probe in 52.6 s and deleted it in
77.0 s, on a local kind cluster, the deletion longer since they remove the
finalizer of each object with a call of its own (H24;
`e2e/scripts/commands.mts:1352-1364`), and the page of the Clusters showed its
300 workers at its first reading, 376 ms after the navigation, with 1.21 s of
CPU of the renderer in 10.5 s and one long task of 188 ms (H24). So the
session runs the large Cluster in a time of its own: the step that applies it
has a limit of 180 s, and the hook that deletes it one of 240 s, about three
times what the probe measured, a margin for the runners of CI, which the probe
did not try (H25), in place of the 120 s of every other test and hook
(`vitest.integration.config.ts:26-27`). Two limits of 25 minutes bound it: the
step of the tests of the integration workflow, which every session shares
(`timeout 1500`, `.github/workflows/integration-tests.yaml:351`; TESTING.md,
"Continuous integration"), and the window of the marks of the fixtures, which
hold for 25 minutes after their apply, after which a session that checks them
fails at its start (TESTING.md, "Continuous integration", "Safety"; SPEC-0004,
"Notes and deviations"). The sessions run in no set order, so the time of the
large Cluster, seven minutes at most with its limits, comes off the window of
every session after it; a run of CI that TESTING.md records took 3.3 minutes in
that step (TESTING.md, "Continuous integration"), and the pull request measures
the apply, the deletion and the step on a runner, and sets the limits from what
it measures. The tree of 922 objects was not built in the probe (H24, H25):
the session is the first to build it.

### Live

**P23.** Proposed: the tree follows the stores of P6 through their watches, as
the list follows its stores (SPEC-0004, P19, P31), and polls nothing: an object
that a watch brings appears under its node, one that is deleted goes, and a
change of state changes the marks of its row, the counts of the nodes above it
and their own marks through the model, in place, with no reload; rows inserted
or removed above the rows in view leave those rows where they are (P13). The
details that are open follow their object; when it goes, they say that no such
object is in the tree of the Cluster any longer, and stay open until the user
closes them (P19).

The header of the page holds a refresh: the icon `refresh` of the host as a
button, with its tooltip, which Tab reaches and Enter and Space press
(freelens:icon.tsx:201, 208-221, 241). It is disabled while any first load of
a kind runs: until the first load of every kind that the tree reads has ended
in this mount of the page (P13), and again while the first load of a kind
that a reference names once the tree is shown runs, since the reads start a
kind when a reference first names it (P6). It is disabled through the
`disabled` of the icon, which drops its click and takes it out of Tab
(freelens:icon.tsx:156, 203-207, 241), and its tooltip then says that the
tree is still being read and can be read again once it is. A refresh pressed
during a first load would end it
(`src/renderer/reads/cluster-namespace-read.ts:327-331`;
`src/common/views/read-state.ts:253-257`), and if its own load then failed,
which leaves `last` as it was (below), its kind would have no load that ended:
before the tree shows, the spinner of P13 would stand in the place of the
tree for good, and for the Clusters the outcome of their reads would stay
loading (read-state.ts:355-358); once it shows, the nodes of that kind would
stay loading for good, the spinner in the place of their marks (P12). The
page test tries both (Tests). Once enabled, the refresh ends the read of every
store of the page, its load, its watch and its reload
(`src/renderer/reads/cluster-namespace-read.ts:327-331`), and starts it again
on the same store, one load of its namespace and its watch once that load has
ended, as the page starts it (:308-326). The stores keep their objects while it
loads, since a load replaces them only when it ends
(freelens:kube-object.store.ts:321-356, 372-388;
freelens@v2.0.0:kube-object.store.ts:276-311, 327-343), so the rows stay, with
the expansions and the active node. It behaves as the reload of a watch after a
410 of SPEC-0004 (SPEC-0004, P25): a refresh that fails holds its kind back as
a reload that failed does, and never as a first load that failed, so the tree
stays, with the notice of the kind, which says that it could not be read again,
at its time, and the nodes of that kind as P12 says. That takes two changes:

- **The read state learns that a load is a refresh.** In
  `src/common/views/read-state.ts`, the event `load-started` (:101-106) and the
  load that runs, `RunningLoad` (:51-55), gain `refresh`, true for a load that
  the refresh starts, which `ClusterNamespaceRead` sets in `loadStarted`
  (`src/renderer/reads/cluster-namespace-read.ts:383-388`) for a store whose
  read the refresh started again. `endLoad` (read-state.ts:192-220) then treats
  a refresh that ends with a failure as `refreshFailed` treats the reload after
  a 410 (:222-234): it holds the kind back in the namespaces of that load, with
  its failures and its time, in `refreshHold`, and leaves `last` and `loadHold`
  as they were, so that `listOutcome` (:347-371), which tells Restricted,
  Failed and Partial from the last load, still reads the first load of the
  mount, and the notice of the kind says "could not be read again, at" its
  time (:423-428). A refresh that ends with no failure releases both holds and
  becomes `last`, as every load does (:208-219).
- **The definitions are asked again.** `DefinitionReads` asks for each
  definition by a GET once (`src/renderer/reads/definitions.ts:87-113`) and
  keeps a refusal or a failure for as long as the page lives (:96, 109). It
  gains a method that forgets the reads that were refused or failed, which the
  refresh calls before it asks again, with `request`, for the definitions of
  the kinds that the references name (:89-113): those alone are asked again.
  The store of definitions of the host, which the host subscribes itself, is
  not loaded again (SPEC-0004, P19).

A load that fails empties the store in the namespace whose list failed
(freelens:kube-object.store.ts:284-311, 380-387;
freelens@v2.0.0:kube-object.store.ts:239-266, 335-342), as a reload after a 410
that fails does (SPEC-0004, "Notes and deviations"): after a refresh that
fails, the objects of that kind are no longer in the store, and the tree says
so as P12 does for a kind that cannot be read, the node of the kind included,
until a later refresh, or a reload that the store starts itself, reads them
with no failure (read-state.ts:265-276). For the Clusters, the root goes with
them: the page says, in the place of the tree, that the Clusters of the
namespace could not be read again, at its time, with the message of each answer
and the permission, as the view of one Cluster says it
(`src/common/views/cluster-view.ts:64-73`;
`src/renderer/details/cluster-details-v1beta2.tsx:904-926`), and never
Restricted or Failed, which say the first load (P19). A unit case tries a
refresh that fails, and one that ends with no failure (Tests).

It recovers what SPEC-0004 lists among what a view that reads with stores of its
own cannot tell (SPEC-0004, "Notes and deviations"):

- a watch that starts again and skips events that it never received, after
  which the view keeps an older object until the next change of that object or
  the next load: the refresh is that load;
- a watch answered 401 or 404, which stops with no word: the refresh starts it
  again;
- a reload after a 410 that failed and emptied the kind in its namespace: the
  refresh reads that namespace again, and a load that ends with no failure
  releases the kind (SPEC-0004, P25);
- a watch that the server refuses while it allows the list, which starts again
  with no end: the refresh reads the objects again, and the watch then fails as
  before, which the page still cannot tell.

The kit asks live data to be polled at an interval that the panel shows, with a
manual refresh, and the polling stopped when the panel is not visible (kit,
`docs/design.md`, "Interaction and performance"): the tree follows the watches
of its stores, as every view of the extension does, and has the manual refresh.
It departs from the kit for the interval, which DESIGN.md records.

### The details of a node

**P17.** Proposed: a node opens its details in the `Drawer` of the host, which
the page renders over the tree, outside the box of the table, as the page of the
Clusters renders the details of a Cluster (SPEC-0004, P15, "Notes and
deviations"): the title of the host, `<Kind>: <name>`
(freelens:kube-object-details.tsx:58), the copy of the name, the width, which
the details of the host share, and the closing are the host's. The drawer is
absolute in the body of the frame, which gives it no positioned ancestor, 725 px
wide and as high as the whole frame, over the page and over the dock: in a
window 1280 px wide it covers every column of the tree but its first 280 px,
the names (H19; freelens:drawer.scss:9, 13-17, 23-24, 35-40).

They close on Escape, on their icon and on a click outside every drawer, which
the host listens for on the window (freelens:drawer.tsx:89-95, 138-168;
freelens@v2.0.0:drawer.tsx:90-96, 139-169), and the host gives the focus
nowhere when they close: Escape leaves it where it was, and the icon, which held
it and goes, leaves it on the body (H11). So closing them gives the focus back
to the element of the tree (P18) once the row of the node is in view: the page
brings that row into view first (P16), since the row of a node that the user
scrolled away is not drawn, and a focus given back to it found no element in
the probe (H11); as the details of a Cluster give it back to the name that
opened them (SPEC-0004, P15).

A click on a row stops its propagation as it opens the details of that node,
as the rows of the list of the host do (freelens:content.tsx:350): without the
stop, the click that opens them reaches the listener of the host on the window,
which closes them at once, 31 to 37 ms later, on both releases; with it, a
click on another row while they are open shows that node (H11), and a click on
the background of the tree closes them. The details of the host of an object of
a provider open over those of the tree (P5), at the same place and above them;
a click on a row then changed the details of the tree under them, where the
user did not see it, and one Escape closed both (H20). So a click on a row
while the address holds `kube-details` with a value, the parameter of the
details of the host (freelens:get-details-url.injectable.ts:21-36), first
closes them with `hideDetails` of the extension API
(freelens:navigation.ts:54; freelens:hide-details.injectable.ts:12-18), and
then opens the details of that node. The value counts, and not the parameter
alone: `hideDetails` writes `kube-details` with an empty value
(freelens:hide-details.injectable.ts:17;
freelens:show-details.injectable.ts:24-27;
freelens:get-details-url.injectable.ts:24), which the address keeps once the
details of the host have closed. The row of the node whose details are open is
the selected row of the table, which the table draws since it is `selectable`
(P9; freelens:table-row.tsx:16-19, 39-40; freelens:table.scss:37-50). Their
toolbar stays empty until the actions of M3, and their content renders inside
an error boundary of its own, keyed by the node, so that an error leaves the
tree (AGENTS.md, "Renderer Components").

For the Cluster, the root, the details are those of SPEC-0004, with their
sections, given the read of the tree itself, which is a source of a view of one
Cluster (`src/renderer/reads/cluster-source.ts:20-30`; SPEC-0004, P31) and is
never published as that of the mounted page (P6), but the row "Tree" (P3), and
with the names of the variables of its topology (P20). For every other node,
these sections, each hidden when it has nothing to show (kit, `docs/design.md`,
"Details"):

1. **Metadata**, those of the host, as SPEC-0004, P32 shows them: the namespace
   as the namespace badge, whose click sets the global filter of namespaces to
   that namespace, as its tooltip says, which changes what the lists of the
   host show and nothing of the tree (P1;
   freelens:namespace-select-badge.tsx:41-48); the owners as the links of P5;
   and, for the kinds of P20, the annotations as P20 says.
2. **Place**: its role among the objects of the Cluster, the node above it and
   the field by which the tree found it, as "the infrastructure machine of
   Machine `<name>`, by `spec.infrastructureRef`", a link to that node (P5); for
   one under Other objects or under the row of an owner that cannot be read,
   why, as P7 says, and the owners that it names.
3. **Status**, what the details of a Cluster show of their Cluster, for any
   kind, from `statusOf` of the node: the health, what it rests on (P10) and the
   source of its tone; the activities, each with its state, its start, its
   duration, its tone and what the project writes of it, as the stage of a
   deletion (R2.25, R2.49, R2.81); the marks of freshness, each with when it
   began; the summary, its message nested, the names of its subjects as the
   links of P5; the issues; the notes of the model; the phase, with the remark
   that the project tells no software to decide on it, for a Machine and a
   MachinePool, as for a Cluster (SPEC-0004, P10;
   `api/core/v1beta2/machine_phase_types.go:24-28`;
   `api/core/v1beta2/machinepool_types.go:248-252`), and with none for a
   MachineDeployment, whose type says none
   (`api/core/v1beta2/machinedeployment_types.go:534-556`) and whose phase
   `Running` says nothing of readiness (R2.61); and the deprecated failure
   fields with their label (SPEC-0004, "The details"; A5).
4. **Its facts**: for a control plane, a MachineDeployment, a MachineSet and a
   MachinePool, every counter with its unit and its versions (R2.12, R2.56,
   R2.60, R2.66), and the templates that it names, as links to their rows (P7);
   for a Machine, its version, its provider ID (`spec.providerID`), its Node,
   `status.nodeRef.name`, as text (P8), and its infrastructure machine and
   bootstrap config as links (P5); for an object of a provider, the field of its
   contract that says it is ready, as P17 of SPEC-0003 reads it, in the three
   words of SPEC-0004, P27, the provider ID of an infrastructure machine
   (R2.38), and the link to the details of the host (A6; P5); for a
   MachineHealthCheck, its targets as links, its counts, its mark of
   remediation (SPEC-0003, P11), and its remediation template as text (P8); for
   a ClusterResourceSet, its selector as text and what it applied to this
   Cluster, resource by resource (SPEC-0003, P12); for the binding, its entries;
   for an IPAddressClaim, its pool as text, its kind and its name with its group
   in the tooltip, and its role, IPAM pool (P8, P9), and its IPAddress as a
   link; for an IPAddress, its address, its prefix and its gateway; for a
   template, that its kind has no status (SPEC-0003, P16), and the nodes that
   name it, as links; for the ClusterClass, the names of its variables and of
   its patches (P20).
5. **Conditions**: one row for each, in the order that the controllers keep
   (R2.94): its weight as a mark, its type, its status and its reason as
   written, the instant of its last transition, a mark when it describes an
   older generation, and its message, nested (SPEC-0004, "The details";
   SPEC-0003, P23, P27).

The pool of a claim and the remediation template of a MachineHealthCheck are
text: the tree reads neither, nor the definitions of their kinds (P8), so it can
tell neither whether they exist nor the version of a link to the details of the
host (A2; R7.19). It departs from the kit, which asks a reference to be a link
when its target exists (kit, `docs/design.md`, "Details"), until the view of the
pools in M2 and SPEC-0013 for the remediations; DESIGN.md records both.

These are the details of the extension that SPEC-0004, P18 awaits for the
objects of Cluster API (P5), given to every object of a Cluster at once, from
the one model that every view shares. The views of M2 add to the details of
their kind what their specs give, such as the certificates and the drain of a
Machine (SPEC-0008), and say whether their kind keeps these details or opens a
page of its own.

### Keyboard and focus

**P18.** Proposed: the tree is one stop of the Tab key, an element of the page
around the table, with `tabIndex` 0, a label, and the role `treegrid`, since
the tree has columns and a header row, which takes the keys; the names, the
buttons that expand and the rows take no Tab of their own, the names and the
buttons `tabIndex` -1, for the pointer. A name is no Tab stop because the
virtual list unmounts the row of a node that leaves the drawn window, by the
wheel, a scroll by code, Page Down or rows inserted above it: the focus then
fell to the body, the tree had no Tab stop left, Tab went on to the Terminal
tab of the dock, and no key reached the tree, on both releases, while the
element around the table kept the focus through all of these and received
every key (H7, H13). The `Table` types the events of a `div` and renders only
a `div` with its classes, so a handler given to it is dropped, which the probe
saw (freelens:table.tsx:41, 297-312; H8): the keys bubble from a row to that
element, whose handler takes them and prevents their default, and that of
Page Up and Page Down. With the focus on the name of a row, the arrows
scrolled the list natively by 40 px each, unless a handler prevented their
default, and Page Down by 635 px, which took the focused row out: the probe
prevented the default of the arrows alone, and Page Down, which its handler
did not take, still scrolled (H16). The probe measured that with the focus on
a name, never on the element around the table, so the session checks it with
the focus on the element: whether these keys scroll the list when their
default is not prevented, and that the list moves only by the moves of the
page with the handler of the page (Tests).

Each row carries the role `row`, an `id`, `aria-level`, `aria-expanded` on a
node with children, and `aria-selected`, true on the node whose details are
open, and each of its cells the role `gridcell`; the header row, the
`TableHead`, carries the role `row` too, and each of its cells the role
`columnheader`; the element names the row of the active node in
`aria-activedescendant`. `TableRow` types the events of a `div` alone
(freelens:table-row.tsx:16), and so do `TableHead` and `TableCell`
(freelens:table-head.tsx:14;
freelens:packages/list-layout/src/list-layout-column.ts:26), so the type check
refuses `role` and `id` written on a row, and takes them in a spread of an
object of a type of the extension's own, whose properties it does not check
against those of the row, as it takes the names with a hyphen, `aria-level`
and the others, written on it (tried for this draft with the compiler of the
repository, TypeScript 7.0.2, on the declaration of `@freelensapp/extensions`
2.1.0, for `TableRow`); the roles of the head and of the cells take the same
spread. At run time `TableRow`, `TableHead` and `TableCell` spread every prop
that they do not use on their `div` (freelens:table-row.tsx:37-47;
freelens:table-head.tsx:28, 37; freelens:table-cell.tsx:80-97, 108), and the
table renders the head that the page gives it as it is, since the tree sorts
nothing (freelens:table.tsx:167-200, 309). The probe read the props of its
rows in the DOM, `aria-activedescendant` on the element around the table
naming a row, on both releases (H14); it gave no role to a head or a cell. The
session reads them in the DOM on both releases, so that a release whose
`TableRow`, `TableHead` or `TableCell` drops them fails, and the page test
reads them on the stub of the SDK, whose `TableRow`, `TableHead` and
`TableCell`, which drop them today (`test/freelens-extensions.ts:637-647`),
spread their props as the host's do; the fallback is an element of the
extension's own that carries them, inside each row, head or cell. The rows
belong to the treegrid only if no element of the virtual list between them
carries a role of its own, which the sources read here cannot show, the list
of the host being a library that they do not hold
(freelens:virtual-list.tsx:144-156; freelens@v2.0.0:virtual-list.tsx:131-143):
the session reads the tree of accessibility of the frame and checks that each
row is a row of the treegrid, at its level, with its cells as gridcells, and
the header a row of columnheaders, and the fallback is `aria-owns` on the
element, naming the rows drawn.

The tree keeps the active node by its identity, the root at first. A key move
makes another node active, first brings its row into view (P16), and only then
names it in `aria-activedescendant`, once the row is drawn: 80 to 101 ms after
the key in the probe (H6, H15). The page knows which rows are drawn from a
reference to an element of each row, which the host mounts and unmounts with
the row. When the row of the active node leaves the window, by the wheel or the
scrollbar, the element keeps the focus and names no row, since the reference
would name a row that is no longer in the DOM, as it did in the probe (H14);
the next key move brings the row back. While the element has the focus, the
row of the active node shows the outline of DESIGN.md ("Navigation"), inside
its box, since the host resets the outline of every element and the cell cuts
what overflows it (SPEC-0004, "Notes and deviations").

A click on a row makes its node active and gives the focus to the element. The
probe clicked rows in their indentation, where nothing takes the focus, and the
press of the click gave it to the element around the table (H11); but the names
and the buttons that expand are buttons, which a press of the mouse focuses
although their `tabIndex` is -1 (browser behavior, not in these sources), and a
name that holds the focus is unmounted with its row by the next turn of the
wheel that takes the row out, the focus falling to the body (H7). So a press of
the mouse on a name or on a button that expands moves no focus into the row:
its `mousedown` has its default prevented, which leaves the focus where it was;
and the click of a row, of a name or of a button that expands gives the focus
to the element with `preventScroll`, which kept the list still when the probe
focused a row with it (H9). A step of the session clicks a name, scrolls the
wheel until its row leaves the window, and checks that the focus is still on
the element, seen failing once against a page that lets the press focus the
name (Tests). Closing the details gives the focus back to the element (P17).

In the tree, as in a tree of a desktop application (the conventions of trees,
not in these sources):

| Key                | What it does                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Down, Up           | The next node shown, the one before                                                                                                   |
| Home, End          | The first node, the last node shown                                                                                                   |
| Page Up, Page Down | The node a window of rows above or below the active one, the first or the last node shown at most                                     |
| Right              | Expands a collapsed node; on an expanded one, goes to its first child                                                                 |
| Left               | Collapses an expanded node; on a collapsed one or a leaf, goes to the node above it                                                   |
| Enter, Space       | Opens the details of the node; on a virtual node, expands or collapses it; on an entry of a binding, does nothing                     |
| Escape             | Closes the details, through the drawer of the host, which listens on the window (SPEC-0004, P15), with the focus on the element (P17) |

The keys act only while the focus is in the tree, so the extension adds no key
binding of its own that could shadow one of the host (kit, `docs/design.md`,
"Interaction and performance"); the handler prevents the default of each key
that it takes, as above. A search that hides the active node gives it to the
first node that matches, with no scroll (P16).

### The states that are not the happy one

**P19.** Proposed: the page states what its reads say, as the view of one
Cluster of SPEC-0004 does (SPEC-0004, P25, P31), and what a page with no list
layout can say:

| State                                         | What the page does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Decided from                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Loading                                       | The spinner of the host in the place of the tree, under the title, until the first load of every kind that the tree reads has ended in this mount of the page, loaded or failed, the kinds of the providers that the objects of those loads name included, or their references cannot be resolved (P13), and the refresh disabled until then, its tooltip saying why (P23); then the tree, with the spinner in the place of the marks of a node whose inputs still load, never a mark computed without them, and in the place of the marks of the class while its new namespace loads (P6), and the refresh disabled again while the first load of a kind that a reference names later runs (P23) | The reads (P6); DESIGN.md, "The status model in lists and details"                      |
| Checking, Not installed, An older Cluster API | As the page of the Clusters says them, in the place of the tree, under the title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SPEC-0004, P20                                                                          |
| No Cluster named                              | That the page shows the tree of one Cluster, which opens it from its details, and a link to the page of the Clusters, for an address of the page with no `cluster`; the host restores no page of the extension (P1, P2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | P1, P2                                                                                  |
| An address with no Cluster                    | That the value of `cluster` is not `<namespace>/<name>`, as written; nothing is read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | P2; SPEC-0004, P6                                                                       |
| Not found                                     | That no Cluster `<namespace>/<name>` is in its namespace, which was read, with a link to the page of the Clusters; once the tree was shown, the same, when the Cluster is gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The read of its namespace (P6; SPEC-0004, P25)                                          |
| Restricted                                    | In the place of the tree: that the user may not list the Clusters of that namespace, the message of the answer, and the permission it takes, `get`, `list` and `watch` on `clusters` of `cluster.x-k8s.io` in that namespace (R6.4)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Every read of the Clusters refused in the first load of the mount (SPEC-0004, P25; P23) |
| Failed                                        | In the place of the tree: that the Clusters could not be read, with the reason of each answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The first load of the Clusters of the mount failed (SPEC-0004, P25; P23)                |
| Partial                                       | The tree, and above it a notice for each kind that could not be read: the message of each answer, which nodes it leaves unread and which inputs of the model it leaves out, which the model notes, as the value of `KindFeeds` of the kind says (P6), and the permission it takes (R6.4); its nodes as P12 says, and the node of the kind under the Cluster (P7)                                                                                                                                                                                                                                                                                                                                  | Some kinds refused or failed (SPEC-0004, P25)                                           |
| A refresh that failed                         | The tree kept, and the notice of the kind, that it could not be read again, at its time, with its reason, as SPEC-0004, P25 says an event of the past; the kind held back, its nodes as P12 says, until a later read of it ends with no failure, such as the refresh of P23; for the Clusters, in the place of the tree, that the Clusters of the namespace could not be read again, at its time, as the view of one Cluster says it, never Restricted or Failed (P23)                                                                                                                                                                                                                            | SPEC-0004, P25, P26; P23                                                                |
| Stale                                         | The rows of the stores meanwhile, with no mark of a cluster that cannot be reached, which the host draws in the header of its list layout alone; the words of a refresh that failed; the refresh of P23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | P19, below                                                                              |
| A node that cannot be read                    | Its row as P12 says, and its details the same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | P12                                                                                     |
| Details of a node that is not in the tree     | In the drawer: that no such object is in the tree of the Cluster, which was read, and, for one that was there, that it is no longer; the spinner while its kind loads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P2, P17                                                                                 |
| An address with no node                       | In the drawer: that the value of `details` names no object, as written                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P2                                                                                      |
| A render error                                | The error page of the template in the place of the tree, the header kept, or in the drawer alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The error boundaries (AGENTS.md, "Renderer Components"; P17)                            |

There is no empty state: the tree of a Cluster that the page read has its root
at least, and a Cluster with nothing under it shows its references, each as P12
says when its object is missing.

Stale: from 2.1.0 the host marks a cluster that it cannot reach in the header of
its list layout, from a dependency that the layout takes itself and that the
extension API does not give (freelens:kube-object-list-layout.tsx:19, 72, 81-92,
205, 286, at `v2.1.0` alone), and 2.0.0 has no such mark (SPEC-0004, P26). The
page of the tree has no list layout (P9), so it has no such mark, on either
release. The page keeps no copy of what it read and reads no protected member of
a store (SPEC-0004, P26). It departs from the kit, whose Stale keeps the last
data with their time (kit, `docs/design.md`, "States that are not the happy
one"), as SPEC-0004, P26 does, and "Notes and deviations" lists it.

### What the details never show

**P20.** Proposed: in the details of a KubeadmConfig, a KubeadmConfigTemplate, a
KubeadmControlPlane, the ClusterClass, the Cluster and every object of a
provider, the metadata of the host leave out the annotations, and the details
show them in a row of their own, every annotation but
`kubectl.kubernetes.io/last-applied-configuration`, whose presence alone they
say, as held and not shown. The host shows that annotation whole, among the
others at `v2.0.0` (freelens@v2.0.0:kube-object-meta.tsx:129), and as YAML in an
editor at `v2.1.0` (freelens:kube-object-meta.tsx:51-63, 104-108, 144-155); for
an object applied with `kubectl apply` it copies the spec, and the spec of the
kubeadm kinds holds the join tokens, the passwords and the content of the files
of R3.36, which the extension never shows (A3). The spec of an object of a
provider is not known to the extension (A6), and may hold the same; the
variables of a Cluster and the patches of its class can carry them too, as the
next paragraph says. `hideFields` with `annotations` hides both items of the
host at `v2.1.0` (freelens:kube-object-meta.tsx:144-146) and its one item at
`v2.0.0` (freelens@v2.0.0:kube-object-meta.tsx:129). The host still shows that
annotation where the extension cannot change it, on both releases: in the
details of the host of an object of a provider, one click away through the link
of A6 (P5); and, for a Cluster, in the drawer of the host that holds the panel
of the extension, in the metadata of the host just above the panel (SPEC-0004,
P16; freelens:kube-object-meta.tsx:144-155;
freelens@v2.0.0:kube-object-meta.tsx:129). Hiding it in the tree keeps the
extension from showing it itself. For the Cluster it departs from SPEC-0004,
P32, whose details show the annotations of the host.

Proposed too: the details of the ClusterClass and of the Cluster show the names
of the variables and of the patches, never their values: of the class,
`spec.variables[].name` and `spec.patches[].name`
(`api/core/v1beta2/clusterclass_types.go:128, 137, 890, 1298`), and of the
Cluster, `spec.topology.variables[].name`
(`api/core/v1beta2/cluster_types.go:586, 1332`), in its section Topology
(SPEC-0004, "The details"). One function of `src/common/views/`,
`variableNamesOf` in `src/common/views/variable-names.ts`, reads the variables
of a Cluster and the variables and the patches of a class, and returns their
names alone; no other module of the view reads them, which the check of Safety
asserts, the `value` that the model of the Cluster types for each variable
(`src/renderer/api/cluster/cluster-v1beta2.ts:197-202`) included. The value of a
variable (`api/core/v1beta2/cluster_types.go:1342`) can carry the fields of A3,
and whatever a user writes there, and the patches of a class write fields into
its templates (`api/core/v1beta2/clusterclass_types.go:1322, 1327`), as the
class of the fixtures writes `files` with their `content` into its
KubeadmControlPlaneTemplate
(`integration/fixtures/healthy/clusterclass.yaml:140-167`).

### The IPAddressClaims of a Cluster

**P21.** Proposed: the tree shows the IPAddressClaims of a Cluster under the
object that controls each, the infrastructure machine as the contract asks, and
the IPAddress of each claim under it (P7). A13 counts a claim among the objects
of a Cluster, found by `spec.clusterName`, and the contract of the book makes
the address the mark of a claim served, on which the infrastructure machine
waits (R3.18; SPEC-0003, P13): a claim that waits is the reason why a Machine
does not provision. No state of the fixtures holds a claim of a Cluster: the
claim of `no-status` names no Cluster, and the development provider uses no
IPAM. So the set `no-status` gives its claim `spec.clusterName`, the name of the
Cluster of the set, as a user writes it, in the dry run that captures the set
(TESTING.md, "The fixtures"); the claim and its address then show under Other
objects, since the claim has no owner, as no object of that set has. The field
is in the schema of the release
(`api/ipam/v1beta2/ipaddressclaim_types.go:45-49`), and the definition on the
cluster of the definitions takes it: a claim of `ipam.cluster.x-k8s.io/v1beta2`
with `spec.clusterName` passed a dry run on the server there, which checks the
schema, since it refused a name of 64 characters and an unknown field, and which
runs no webhook, since that cluster has none (H23). The webhooks of the real
project, where the capture runs its dry run, were not tried, and the pull
request runs that capture: if they refuse the field, the claim of `no-status`
keeps no `spec.clusterName`, and a claim of a Cluster is tried at the unit
layer alone. A claim under its infrastructure machine is tried at the unit
layer, with one field of that claim changed, which the case says (SPEC-0003,
"Tests"); "Notes and deviations" lists the capture that is still missing.

### The theme

The view authors no color. Each state takes the token that SPEC-0003 gives it
(SPEC-0003, P31), applied as SPEC-0004, P21 says, in the `Badge` of the host;
the role of an object of a provider is a flat badge, with no background, which
reads as plain text in the dark and the light theme of both releases (P9;
H10); the selected row and the hover are those of the table of the host, which
is `selectable` (P9; freelens:table.scss:24-50); the indentation is the spacing
of the host, and the focus the outline of DESIGN.md. Nothing tells a dark theme
from a light one. The pull request checks the tree in the dark and the light
theme of Freelens and in a theme that is not the default, such as the High
Contrast theme of 2.1.0 (freelens:high-contrast.theme.yaml, at `v2.1.0` alone),
which the probe did not try (H25), with the screenshots of that check ("Manual
verification"; kit, `docs/design.md`, "Theme", "How it is enforced").

### Safety

- **What it reads.** The kinds of "What the tree reads", through the stores of
  P6, at the versions that A2 names, and one definition at a time by its name.
  Never a Secret, never a ConfigMap, never a workload cluster, never `v1beta1`,
  no field of the spec of a KubeadmConfig or of a KubeadmConfigTemplate, and of
  a KubeadmControlPlane `spec.replicas`, `spec.version` and the reference to its
  machine template alone (A3; P6). A list of KubeadmConfigs returns, in clear,
  the join tokens and the content of the files that their specs hold (R3.35,
  R3.36); the extension types none of those fields and shows none (A3), and the
  README says what that list returns.
- **What it shows.** No field of R3.36, no value of a variable or of a patch,
  and no annotation `kubectl.kubernetes.io/last-applied-configuration` of the
  kinds of P20.
- **What it writes.** Nothing: no create, no patch, no delete, and no request
  that creates an object (kit, `docs/safety.md`, "Writing"). Nothing of the tree
  opens the details of the host for an object of Cluster API or for a Namespace
  (A7; P5); the details of an object of a provider link to the page of the host
  that A6 gives it, which shows that annotation as the host does (P20).
- **How the tests prove it.** The unit check of SPEC-0004 reads the modules of
  the view, the modules of the tree among them, and fails on a call of a method
  that writes, on a request other than a GET, and on the paths of R3.36
  (SPEC-0004, "Safety"). It gains two cases: one that fails on a module that
  names `kubectl.kubernetes.io/last-applied-configuration` anywhere but in the
  one function of `src/common/views/` that reads whether an object holds it,
  with `Object.hasOwn`, and on that function when it reads the value under that
  key; and one that fails on a module of the view that reads `variables`,
  `overrides` or `patches` of an object, by a member, an index or a
  destructuring, but `src/common/views/variable-names.ts` (P20), and on that
  module when it names `value` or a member of a patch but `name`. So the value
  of a variable, which the model of the Cluster types
  (`src/renderer/api/cluster/cluster-v1beta2.ts:197-202`), and the content of a
  patch are read nowhere. The check matches reads, not names: the check of R3.36
  matches a name wherever it is read or declared
  (`src/renderer/read-only.test.ts:47-57`), and `value` and `definitions` are
  read elsewhere for other things
  (`src/renderer/details/cluster-details-drawer.tsx:111`;
  `src/renderer/reads/cluster-namespace-read.ts:191, 357`), while `variables`,
  `overrides` and `patches` are only declared, by the model of the Cluster
  (`src/renderer/api/cluster/cluster-v1beta2.ts:60, 77, 131, 188, 205-213`).
  Each case is seen failing once on a line planted for the purpose, with the
  line printed (kit, `docs/testing.md`, "Checks worth trusting"). The details of
  a KubeadmConfig of the fixtures, with that annotation written by the test to
  hold `files` with a content, show neither the content nor the annotation, seen
  failing once against the metadata of the host with their default fields. In
  Freelens, every request that the frame of the cluster sends to the groups that
  the tree reads is a GET, a list or a watch, and every object of the fixtures
  has after the steps that read the fixtures the version it had before, or the
  one that a write of the session itself gave it, which the session records
  from the answer of the server to each of its writes, and checks that it
  changed (kit, `docs/testing.md`, "Checks worth trusting"); both are seen
  failing once, on a run in which the session patches a label of a fixture
  from the frame (SPEC-0004, "Safety").

## Tests

### Unit

The cases start from the objects of the fixtures of SPEC-0002, read with the
YAML reader of the scripts of the test environment, as those of SPEC-0003 and
SPEC-0004 do (`test/fixture-sets.ts`), and a value that the schema rejects is
written at this layer only (kit, `docs/testing.md`, "The test environment has
two tiers"). The expected trees of the states are written by hand from the
sets, and never computed by the code that they test, so that a defect of that
code cannot write its own expectation, in
`integration/__tests__/tree-expectations.ts`, which the unit tests and the
session in Freelens both read, as `restricted-access.ts` serves both its unit
test and its session (SPEC-0004, "Notes and deviations"). The pure functions of
the tree live in `src/common/views/`, whose program has neither the DOM nor Node
(SPEC-0003, P35).

- `src/common/views/cluster-tree.test.ts` (P7, P8, P12, P21): for the Cluster of
  each state of the fixtures, the node above every object of its set, one row
  each, from the table of the expected trees: on `healthy`, the DevCluster, the
  KubeadmControlPlane with its Machine, its DevMachine and its KubeadmConfig,
  and its DevMachineTemplate under its Templates, Workers with the
  MachineDeployment, its MachineSet, its two Machines and their objects, and
  the DevMachineTemplate and the KubeadmConfigTemplate that the
  MachineDeployment and its MachineSet both name, once, under the Templates of
  the MachineDeployment, the ClusterClass, Add-ons with the ClusterResourceSet
  `cni-kindnet`, its ConfigMap applied, and the binding, and Health checks with
  the two MachineHealthChecks; on `machine-without-node`, the MachineSet that
  the Cluster owns under Workers, with its Machine and its own Templates; on
  `rolling-out`, the two MachineSets under the MachineDeployment, each with its
  Machines, and the templates once, under the MachineDeployment; on
  `machine-pools`, the MachinePool with its KubeadmConfig, its DevMachinePool
  and its Machine with its DevMachine, and no node Add-ons, since the set has no
  ClusterResourceSet; on `machine-pool-without-machines`, the MachinePool with
  no Machine; on `without-topology`, no node of a class; on `deleting`, the two
  templates of the MachineDeployment as not found, and no node Add-ons: the
  selector of its ClusterResourceSet matches the labels of its Cluster, which
  has a deletion timestamp, so its controller selects it no longer, and the set
  has no binding (`integration/fixtures/deleting/cluster.yaml:5, 9-11`;
  `integration/fixtures/deleting/clusterresourceset.yaml:10-12`;
  clusterresourceset_controller.go:280-286); on `no-status`, the MachineSet and
  the Machine with its DevMachine and its KubeadmConfig under Other objects,
  each with the reason that it has no owner, the MachineDeployment and the
  MachinePool under Workers, the templates that the MachineDeployment and the
  class both name under the MachineDeployment, the ClusterResourceSet that its
  selector finds with the binding that has no entry, and the claim of P21 with
  its IPAddress under Other objects; on every set, the templates that only the
  class names, the MachineDrainRule, the `Provider` and every Secret and
  ConfigMap never nodes (P8). Then, each with the change that the case makes to
  an object of the fixtures: a template that the control plane and a
  MachineDeployment both name, one row under the control plane, with the
  details of the MachineDeployment linking to it; a template that an older
  MachineSet alone names, under that MachineSet; two MachineDeployments that
  name one template, and two older MachineSets of one MachineDeployment that
  name a template that it no longer names, the template under the first of
  each two by name, whatever the order of the store; a bootstrap config and an
  infrastructure machine whose Machine does not exist yet, with the owner
  reference of their MachineSet and no flag of controller, under that
  MachineSet; a DevMachine of the pool of `machine-pools` whose Machine does not
  exist yet, under the DevMachinePool; a template that the Cluster owns and no
  object names, under Other objects with that reason; a Machine under its
  controller by group, kind and name, also when the label
  `cluster.x-k8s.io/set-name` holds a hash (R3.6); a control plane Machine that
  its KubeadmControlPlane does not own yet, under the KubeadmControlPlane, as
  the tool places it (R4.10); a Cluster with no control plane reference, the
  reference of `without-topology` removed, its Machines of the control plane
  under the virtual node Control plane; a control plane of a provider, by its
  role, with its Machines and its template by the field of its contract at
  `v1beta2`, and at `v1beta1`, its reference written with `apiVersion` and no
  `apiGroup` at `spec.machineTemplate.infrastructureRef` and the label of its
  definition for that contract alone, the version taken from the label and
  never from `apiVersion`; a bootstrap config of a provider, the kind that a
  Machine names and its definition changed, under its Machine by its role; a
  claim under its infrastructure machine, its owner reference written; the
  class in another namespace read there, and not read when that read is
  refused, in the words of P12 for that namespace; the health of the root with
  the availability gates of such a class, which name a condition that the
  Cluster writes `False`, against the health of the same Cluster read without
  that class, as its row of the list and its details read it when the filter
  does not select the namespace of the class, which notes the class as not
  given (P6; `src/common/status/conditions.ts:283-301`); a ClusterResourceSet
  that selects a Cluster with a deletion timestamp, placed only by its
  binding; two Clusters of the namespace, the sets of `healthy` and of
  `rolling-out` in one namespace, each tree with its own objects alone; each
  reason of P12, from a definition refused, one with no contract label, a kind
  not served, a version not served, a kind held back and an object not found,
  "Not read." with the reason, and the reason alone for an object not found;
  the definition of the DevMachines refused: the rows that the Machines make
  of their DevMachines "Not read", and under the Cluster the node
  "DevMachine objects", which says that its definition could not be read; the
  Machines of `healthy` refused: the node Machines under the Cluster, "Not
  read", with its reason and then the words of the objects that only they
  name, under it three rows of the Machines that own the three KubeadmConfigs,
  each "Not read", with its KubeadmConfig and the reason that its owner is of
  a kind not read, and no DevMachine, whose kind only the Machines name; the
  KubeadmControlPlanes refused: the row of the control plane, made from the
  reference of the Cluster, "Not read" under the Cluster, with the Machine of
  the control plane under it by its label, and a KubeadmConfig that the
  control plane made before its Machine, with the owner reference of the
  control plane and no flag of controller (desired_state.go:203-213), written
  by the case, under that row too, and the node KubeadmControlPlanes with no
  row under it; the KubeadmConfigs refused, their rows "Not read" under their
  Machines and the node of their kind with no row under it; the
  ClusterResourceSetBindings refused, the node of their kind and the entry of
  `cni-kindnet` "Not read", never in no binding of the Cluster; the
  MachineSets refused, the Machines of the MachineDeployment under the rows of
  their MachineSets, under the node MachineSets, and a template that only an
  older MachineSet names under Other objects, with the reason that the
  MachineSets, which can name it, were not read; a kind still loading, its
  nodes pending and never Unknown; each node's status equal to `statusOf`
  with the context of SPEC-0003 for its kind, its Machines, its Cluster, its
  role, its contract and its bindings, under the keys of SPEC-0003, a key that
  changes with the `uid` and the `resourceVersion` of any object of the context
  and with nothing else; the indexes built once for each change of what they
  read, counted, and never at a render.
- `src/common/views/label-selector.test.ts` (P7): `matchLabels`, each operator
  of `matchExpressions`, both together; an empty selector, and an absent one,
  which select no Cluster; seen failing once against a matcher that takes an
  empty selector for every Cluster, as a drain rule would (filters.go:362-374).
- `src/common/views/tree-rows.test.ts` (P11, P13 to P16): the expansion at first
  of each state, `healthy` with the first level alone, `rolling-out` down to
  the new Machine, `paused` with nothing expanded for the pause of the Cluster
  alone, a Machine of `healthy` paused by its own annotation, written by the
  case, expanded with the nodes above it, the Cluster of `rolling-out` paused
  by the case while it rolls out, its activities Blocked next to Paused and the
  objects that roll out expanded, `deleting` down to every deleting object; no
  row before the first load of every kind has ended, the kinds of the providers
  that the objects name included; a change of state after it that expands
  nothing and moves no row, seen failing once against an expansion computed at
  every change; the node of the address shown, with its nodes above it; the
  order of P14 on every set, the nodes of the kinds that cannot be read last,
  in the order of the rows of P7, and the MachineDeployments and the
  MachinePools both refused, in the order of their names; the counts of each
  node, worst first, objects alone, never an entry of a binding, the objects
  not read and not found after Unknown and before Healthy, and the stale ones
  of each health in parentheses after it; the offset of the scroll that keeps
  the first row in view in place, moved by 33 px for each row inserted or
  removed above it, and by none for rows below it, a change of state, an
  expansion or a search; the search, its matches with their nodes above them,
  a version and the words of a cell Status matched, a label, an id, the
  namespace of the Cluster and the counts not matched, the namespace of a
  class read elsewhere matched, the count, and the expansions of the user back
  once it is cleared; a tree of 500 Machines built by the case, its rows
  collapsed and expanded, and the counts of its MachineSet, in objects.
- `src/common/views/tree-cells.test.ts` (P9, P10, P12): each column for each
  kind of node; each form of P10, a MachinePool with no Machine at 0 replicas
  and an IPAddressClaim that writes `Ready` among them; N/A with its tooltip
  where a column does not apply; "Not read" and "Not found" in the cells of
  Activity and Condition of a node that cannot be read, never N/A; the role of
  each kind of a provider, in the eight words of `ProviderRole`; the counts of a
  virtual node alone; the cell Name of an IPAddress at seven levels of depth,
  which no fixture reaches, under its claim under the infrastructure machine
  of a worker Machine, on a tree that the case builds from `rolling-out` with
  the claim of `no-status` and its IPAddress: seven steps of indentation, and
  the name inside the element that cuts it with an ellipsis; the cells of the
  node of a kind that cannot be read, its cell Status with the reason and then
  the words of the objects that only that kind names, and its tooltip with the
  whole text, for the Machines refused; the reason alone for the
  KubeadmConfigs refused, whose objects name no kind of a provider; and, for a
  definition of the DevMachines refused, that its definition could not be read
  and that its objects are not shown, never the words of the objects that only
  it names; an entry of a binding applied, not applied and in no binding, and
  "Not read" when the bindings cannot be read; the note of the MachinePools of
  unknown health in the cell Condition of the Cluster.
- `src/common/views/tree-address.test.ts` (P2): `cluster` and `details` read and
  written; three parts and four; a value with an empty part, one with `.` or
  `..`, and one with five parts, each naming nothing.
- `src/common/views/tree-keys.test.ts` (P18): the node that each key gives, on
  the first and the last node, on an expanded node, a collapsed one, a leaf, a
  virtual node and an entry of a binding, Page Up and Page Down by a window of
  rows, and after a search that hides the active node; the attributes of each
  row, its role `row`, `aria-expanded` on a node with children alone, and the
  role `gridcell` of its cells, and those of the header, a `row` of
  `columnheader` cells; and the `aria-activedescendant` of the element, which
  names the row of a move once that row is drawn, and no row while the row of
  the active node is not.
- `src/common/views/references.test.ts` (P5, P6): every kind of R1 of Cluster
  API by its group and its kind, the `Provider` of `clusterctl` and the seven
  kinds of the operator included; a kind of a provider in the group
  `bootstrap.cluster.x-k8s.io` or `controlplane.cluster.x-k8s.io` is of a
  provider; a reference of the `v1beta1` contract with `apiVersion` gives its
  group, and never its version.
- `src/common/views/read-state.test.ts` (P6, P23): the values `nodes` and
  `bindings` of `KindFeeds`, each with its notice; a filter of two namespaces,
  a load of the second alone that leaves it read for its kind, and a change of
  the filter that drops it; a refresh that fails, which holds the kind back in
  the namespaces of that load as a reload after a 410 that failed does, leaves
  `last` and the hold of a load as they were, so that `listOutcome` gives no
  Restricted and no Failed, and the notice of the kind says that it could not
  be read again, with its time, seen failing once against a read state that
  takes it for a first load that failed; a refresh that ends with no failure,
  which releases both holds.
- `src/common/views/variable-names.test.ts` (P20): the names of the variables
  of the Cluster of `healthy` and of the variables and the patches of its
  class, and none of their values, seen failing once against a function that
  returns a value.
- `src/common/views/node-details.test.ts` (P17, P20): the sections of each kind,
  shown or hidden; the place of a node and the field that found it, and the
  reason of each case under Other objects; the owners as links to their nodes,
  and an owner that the tree does not hold, the IPAM pool of an IPAddress, as
  text; the subjects of a message as links to their nodes; the templates of an
  object as links to their rows; the phase with its remark for a Machine and a
  MachinePool, and with none for a MachineDeployment; the pool of a claim as
  text with its role, and the remediation template of a MachineHealthCheck as
  text; the reason of an object under the row of an owner that cannot be read;
  the namespace as the namespace badge; the annotations of the kinds of P20 with
  `kubectl.kubernetes.io/last-applied-configuration` left out and its presence
  said, seen failing once against the annotations of the host; the names of the
  variables and of the patches of the class of `healthy`, and of the variables
  of its Cluster, with none of their values, seen failing once against details
  that show a value.
- `src/renderer/api/context/context-models.test.ts` (P6): each new model, its
  kind, version, scope and `apiBase`; each fits the input of its rule in
  SPEC-0003; KubeadmConfig and KubeadmConfigTemplate type no field of their
  spec; KubeadmControlPlane types `spec.machineTemplate.spec.infrastructureRef`
  and no field of R3.36; MachineHealthCheck types
  `spec.remediation.templateRef`; the ClusterClass types the names of its
  variables and of its patches and no value.
- `src/renderer/reads/cluster-namespace-read.test.tsx` (P6, P23): the details of
  a Cluster and the panel read the kinds that they read now, seen failing once
  against a read that gives them the kinds of the tree; the reads of the tree
  build one store of the class of its model for each kind of Cluster API of the
  tree and one `ProviderObjectStore` for each kind of a provider that a
  reference of an object of the tree names, as that object is read, never
  registered, each loaded on its namespace and then subscribed; the store of
  ClusterClasses loads the namespace that the class reference names, and no
  other, and a change of that namespace stops it and starts one on the new
  namespace; the refresh ends every read and starts it again on the same
  stores, which keep their objects meanwhile, each load that it starts marked
  as a refresh, and asks again for a definition whose read was refused or
  failed, and for no other; the effect run twice leaves one read; the reads end
  when the page closes; a refusal gives the state of the tree alone.
- `src/renderer/reads/definitions.test.ts` (P23): the reads refused or failed
  forgotten, the next request asks again for those alone, and a definition
  that was read keeps its read.
- `src/renderer/pages/cluster-tree-page.test.tsx` (P1, P2, P6, P9, P13 to P19,
  P23): the page with its parameters, its title with the namespace as text; each
  state of P19, with its words; the spinner until the first loads end, and no
  row before; the `Table` with `virtual`, `getTableRow` and `selectable`;
  `selectedItemId` given in the render after a key move and in the first render
  for the address, cleared once the row is drawn, and never at a render of a
  change of state, seen failing once against a page that gives it at every
  render; the scroll of the list's element that the page sets, for the address
  once the element has its height, for a row that a move leaves partly in view,
  and, in a layout effect, by the rows inserted or removed above the first row
  in view, on an element whose height and scroll the test gives, since the stub
  has no layout; a search with the row of the active node out of view, which
  gives no `selectedItemId` and sets no scroll of the list's element, seen
  failing once against a page that brings the active node into view after a
  search; the element of the tree with its role `treegrid`, its label, its one
  stop of Tab and its keys, their default prevented, Page Up and Page Down
  included; the attributes of each row read in the DOM, where the spread on
  `TableRow` puts them, the header a `row` of `columnheader` cells and the
  cells of every row `gridcell`, on a stub of the SDK whose `Table` draws the
  rows of `getTableRow` inside an element of the class `VirtualList`, which the
  page finds as it finds that of the host (freelens:virtual-list.tsx:144;
  freelens@v2.0.0:virtual-list.tsx:131), and whose `TableRow`, `TableHead`
  and `TableCell` spread their props as the host's do
  (`test/freelens-extensions.ts:633-647`; AGENTS.md, "Tests and tooling");
  every cell of a row, the counts of P11 included, with its text
  inside the element of the extension that cuts it with an ellipsis, found by
  its class, as the test of the page of the Clusters finds the marks of its
  cells (`src/renderer/pages/clusters-page-v1beta2.test.tsx:328-348`), seen
  failing once against a cell that holds the counts as its own text; the names
  and the buttons with `tabIndex` -1, the default of their `mousedown`
  prevented, and a click on a name that gives the focus to the element with
  `preventScroll`; the drawer, its title, its closing and the focus back on the
  element once the row of its node is in view; a click on a row that stops
  there; a click on another row shows that node; a click on a virtual row keeps
  the drawer open; a click on a row while the address holds `kube-details`
  with a value calls `hideDetails` first, and one while it holds the parameter
  with an empty value does not; a node of Cluster API that opens no details of
  the host, and a node of a provider whose details hold the link to them; the
  row "Tree" left out of the details of the root; the search, with `autoFocus`
  false, and an Escape in it that clears its words, or, when it holds none,
  calls `hideDetails` while `kube-details` has a value, and closes the details
  of the node otherwise; no source of the mounted page published, and the
  panel mounted beside the page with its own read, seen failing once against a
  page that publishes its read; the refresh, its button and the reads that it
  starts again, and the button disabled, with the tooltip that says why, until
  the first load of every kind has ended, seen failing once against a page
  whose refresh is enabled at its mount, and disabled again, once the tree is
  shown, while the first load of a kind of a provider that a new Machine
  names runs, seen failing once against a page that disables it at its mount
  alone; a refresh of the Clusters that fails,
  which says in the place of the tree that they could not be read again, and
  never Restricted.
- `src/renderer/details/object-details.test.tsx` (P17): the details of each kind
  of node rendered; an error thrown in a section that leaves the tree.
- `src/renderer/details/cluster-details-v1beta2.test.tsx` (P3, P5, P20): the row
  "Tree" navigates to the page of the tree; the references to the
  KubeadmControlPlane, a MachineDeployment, a MachinePool and the ClusterClass,
  as the maintainer decided, and to a MachineSet and a worker Machine among the
  parts, to a Machine named in a message and to an owner of Cluster API, as
  proposed, each a button that opens the tree at its node, seen failing once
  against the text of SPEC-0004, P18; the infrastructure cluster still a link to
  the details of the host; the panel navigates with `navigate` of the
  extension; the names of the variables of the topology, with no value; the
  annotation `kubectl.kubernetes.io/last-applied-configuration` held and not
  shown.
- `src/renderer/index.test.tsx` (P1): two pages, that of the tree with the
  parameters `cluster` and `details`; no new entry of the sidebar, no new panel,
  `customResources` with the model of Cluster alone.
- `src/renderer/read-only.test.ts`: the check of "Safety", seen failing once on
  each planted line, the line printed.
- `src/renderer/styles.test.ts` (P9, P18): the stylesheet of the tree holds no
  color but tokens and `transparent`; its cells hold one line, with no wrap and
  what overflows cut with an ellipsis, as those of the list
  (`src/renderer/styles.test.ts:115-155`); its columns of state keep a minimum
  width and never shrink, and those of the domain shrink, Replicas and Version
  the most and the name the least, as those of the list
  (`src/renderer/styles.test.ts:183-211`); its indentation is the spacing of the
  host; the active row shows its focus with the outline of DESIGN.md; the page,
  the element around the table, the `Table` and its `.VirtualList` form a chain
  of flexible boxes, each with `min-height: 0`, as the list layout of the host
  gives its own (freelens:item-list-layout.scss:34-46); the class of the
  element that holds the content of every cell holds one line and cuts what
  overflows with an ellipsis, as that of the marks of the list
  (`src/renderer/styles.test.ts:126-132`), which the test of the page finds
  around the text of every cell, the counts included; each seen failing once
  on a planted value, the chain on a stylesheet without `min-height: 0`.
- `test/large-cluster.test.ts` (P22): the generation of the large Cluster, as
  P22 says.
- `test/restricted-access.test.ts` (P19): the kinds of the identity are those of
  the models of the page and of the tree, and those of the providers of the
  fixtures that the tree reads, each under its group.

### In Freelens, on the definitions and the fixtures

`integration/__tests__/cluster-tree.tests.ts`, a session on the cluster of the
definitions with the fixtures of every state of SPEC-0002, each in its
namespace (SPEC-0004, P33), and the large Cluster that it makes (P22), which
fails on any error that either process logs (AGENTS.md, "Workflows"), and runs
in the integration workflow on both releases of its matrix, as the session of
the Clusters does (SPEC-0004, P33). Like that session, it fails at its start
when the fixtures were applied more than 25 minutes before it, the window in
which their marks hold (TESTING.md, "Continuous integration"; SPEC-0004, "Notes
and deviations"). It sets the metrics of the root page to 1280 by 900 CSS
pixels, as the probe did, where the frame of the cluster measured 1205 by 839,
and the list of the page of the probe, under a header of one line, was 726 px
high and showed 22 rows (H1, H2, H3). The header of the tree holds its own
controls, and the notices of Partial stand above the tree (P19), so the height
of the list of the tree is the session's to measure: a step that needs the
list to scroll reads it first. It finds a row once the tree
shows only the rows that a search keeps, as the session of the Clusters learned
to (SPEC-0004, "Notes and deviations"), and a cell by what it holds, never by
the class of its column (AGENTS.md, "Workflows").

1. The tree of the Cluster of each state, opened by its address: every node of
   the expected trees is a row, once, under its node, at its depth, with its
   kind, its name and its role; and the objects that the table of SPEC-0003
   gives a row have the health, the tone, the activities and the marks that it
   gives them at the time of the session, as the session of the Clusters reads
   them (SPEC-0003, "The fixtures of SPEC-0002 give these results"; SPEC-0004,
   "Notes and deviations"); and, with the root page at 1024 by 900 CSS pixels,
   every row of the tree of `rolling-out`, every node expanded, is one line of
   33 px, the name of each row shows whole, or cut with an ellipsis and whole
   in its tooltip, and the cells of its columns of state keep at least their
   minimum width (P9).
2. The expansion at first of `healthy`, `rolling-out` and `deleting`, and the
   counts of each node shown (P11, P13); and no row before the first loads
   have ended: an observer of the DOM, which the session installs in the frame
   before it opens the address, records the rows of the first frame that draws
   any, their ids and their `aria-expanded`, which are those drawn once the
   answers to the lists of the page have arrived, which the session reads from
   the requests that it records; seen failing once against a page that draws
   its rows as each load ends.
3. The ways in: the row "Tree" of the details of a Cluster, and its reference to
   its KubeadmControlPlane, open the tree there, with the details of that node;
   the same from the panel in the details of the host, which close (P3, P5).
4. The details: a click on a row opens them, over the page and the dock, their
   left edge at 480 px of the frame, the names of the tree in view; a click on
   another row shows that node, and a click on a virtual row leaves them as
   they are; with the row of their node scrolled out of the window by the
   wheel, Escape closes them, brings that row into view, its top at or under
   the top of the list, and leaves the focus on the element of the tree; the
   icon, which held the focus and goes with them (H11), closes them with the
   focus on the element as well; the details of the DevMachine of a Machine
   hold the link to the details of the host at the version of its contract,
   which open over them, the close icon of the host shows the details of the
   tree again, and one Escape closes both; a click on a row while the details
   of the host are open closes them first and shows the details of that node;
   with the details of the host open over those of a node, an Escape in the
   empty search closes those of the host alone, and a second one those of the
   node; no node of Cluster API opens the details of the host (P5, P15, P17).
5. The keyboard, on the tree of `healthy` with every node expanded, 28 rows of
   33 px, 924 px, taller than the frame of the cluster, 839 px high (H1), and
   so than its list: Tab reaches the element of the tree, Down, Up, Right,
   Left, Home, End, Page Up and Page Down move and expand as P18 says, the row
   of each move in view before `aria-activedescendant` names it, and Enter
   opens its details. With the focus on the element, the offset of the list,
   read before and after each key, changes by the moves of the page alone; run
   once against a handler that does not prevent the default of these keys, the
   step records whether they scroll the list from the element, which the probe
   measured from a name alone (H16). A scroll of the wheel that takes the
   active row out of the window leaves the focus on the element, which names
   no row, and the next key move brings the row back; a click on a name, then
   a scroll of the wheel that takes its row out of the window, leaves the focus
   on the element, seen failing once against a page that lets the press of the
   mouse focus the name; and the tree of accessibility of the frame, read
   through CDP, holds each row drawn as a row of the treegrid, at its level,
   its cells as gridcells, and the header as a row of columnheaders (P18).
6. Live, on `healthy`: the annotation `cluster.x-k8s.io/paused`, which the
   session sets with a merge patch on a worker Machine, makes its activity
   Paused, with no reload, and expands nothing, as no change of state does
   (P13); a Machine that it creates with the labels of the Cluster and of its
   control plane and no owner, and with a name that sorts before that of the
   Machine of the control plane of the set, while the tree with every node
   expanded is scrolled to its end, shows first under the KubeadmControlPlane
   (P14), as the tool places it (P7), its infrastructure machine as not found;
   the step asserts that the row of that Machine sits above the first row in
   view, and only then that the first row in view keeps its place, by its id
   and its top, seen failing once against a page with no compensation; before
   the session deletes it, the step scrolls the list up from its end by more
   than the rows that go, since at its end the list would keep its place
   whatever the page does, and the first row in view keeps its place again
   (P13), seen failing once against a page with no compensation; a status
   that it writes on a worker Machine through the status subresource
   with `Ready` `False` makes that Machine Unhealthy and changes the counts of
   the nodes above it, with no node expanded and no row moved; it undoes each
   write at its end, also when a check failed (SPEC-0004, "Notes and
   deviations"). It records each write of its own, the annotation, the Machine
   that it creates, the status and each undo, by the version that the answer
   of the server carries, and checks that it changed (kit, `docs/testing.md`,
   "Checks worth trusting"), and the Machine that it deletes by its absence;
   the check of step 8 takes them as writes of the session. The refresh of the
   header reads the tree again, and an observer of the DOM records, from the
   click until the answers to the lists of the refresh have arrived, that
   every row drawn before the click stays drawn; seen failing once against a
   refresh that empties its stores before it loads them (P23).
7. The search: `Unhealthy`, a version and the name of a Machine keep the rows
   that match and the rows above them, and how many nodes match counts the
   rows whose own words hold the word, never those whose counts alone do; the
   expansions come back once it is cleared; the search does not take the focus
   when the page opens, and an Escape in it with words clears them and leaves
   the details open (P11, P15).
8. The read-only check of "Safety", on the fixtures, seen failing once.
9. A large Cluster (P22), the last step, after the read-only check of the
   fixtures: the session makes it, within the limit of that step, opens its
   tree at the address of its two hundredth Machine, which expands Workers,
   the MachineDeployment and the MachineSet above it (P13) and shows its row
   whole, its top at or under the top of the list, with its details open (P2,
   P16); then the rows of the table in the page are far fewer than the nodes
   shown, which the virtual rows draw; the counts of the MachineSet say 900
   objects, its 300 Machines with their infrastructure machines and their
   bootstrap configs, and those of the MachineDeployment 903, with its
   MachineSet and its 2 templates (P11); End reaches the last node shown,
   Health checks, with its row in view (P16, P18); every request that the
   frame sends meanwhile to the groups that the tree reads is a GET, a list or
   a watch, as step 8 checks them; and the session deletes the Cluster at its
   end, within the limit of its hook, and checks that its namespace is gone
   (P22).

### With a restricted identity

`integration/__tests__/clusters-restricted.tests.ts` gains these cases, with the
identity of SPEC-0004, P23, its checks of the messages and its loads of the
frame again (SPEC-0004, "Notes and deviations"). The grants of each case cover
every kind that the tree reads, the kinds of P6 and those of the providers of
the fixtures, in `default` and in the namespaces of the fixtures, but for what
the case refuses, so that no other refusal arrives (SPEC-0004, P23);
`integration/__tests__/restricted-access.ts` gains them, and its unit test
checks them (Unit):

5. Restricted: the Clusters refused in the namespace of `healthy`: the tree of
   its Cluster, opened by its address, says in the place of the tree that the
   user may not list the Clusters of that namespace, with the message of the
   answer and the permission (P19).
6. Partial: the KubeadmConfigs refused in the namespace of `healthy`: the tree
   of its Cluster with the notice of Partial, which names the KubeadmConfigs and
   the permission, their nodes under their Machines "Not read. Its kind could
   not be read in the namespace of the Cluster.", and the node KubeadmConfigs
   under the Cluster, with that reason alone, since a KubeadmConfig names no
   kind of a provider, and with no row under it, while the Machines keep the
   health that their own conditions give (P12, P19).
7. The Machines refused in the namespace of `healthy`: the notice names the
   Machines and the permission; under the Cluster, the node Machines, "Not
   read" in its cells of state, and in its cell Status its reason, then the
   words that the objects that only the Machines name are not read either, the
   whole text in its tooltip; under it, the rows of the three Machines that own
   the three KubeadmConfigs of the set, each "Not read" with the same reason,
   each with its KubeadmConfig under it, whose reason says that its owner is of
   a kind not read
   (`integration/fixtures/healthy/kubeadmconfig.yaml:17-18, 107-108, 183-184`);
   no row of a DevMachine, whose kind only the Machines name; and the
   MachineSet, the MachineDeployment and the KubeadmControlPlane read their
   activities Unknown, with the note of the model, never Idle (P7, P12;
   SPEC-0004, P25; SPEC-0003, P1).
8. The ClusterResourceSetBindings refused in the namespace of `healthy`: the
   notice names them and the permission; under the Cluster, the node
   ClusterResourceSetBindings, "Not read" with its reason alone, since a
   binding names no kind of a provider; under Add-ons, the
   ClusterResourceSet `cni-kindnet`, which its selector finds, and under it the
   entry of the ConfigMap `cni-kindnet`, "Not read" in its cells of state and
   the reason in its cell Status, never in no binding of the Cluster; and the
   ClusterResourceSet rests on `ResourcesApplied` alone, with the note of the
   model that its bindings were not read, never Healthy from an empty list
   (P10, P12; SPEC-0003, P12).
9. With an identity that may not list the definitions, and may not get that of
   the DevMachines by its name: the nodes of the DevMachines as text, with the
   reason and the permission, and, under the Cluster, the node "DevMachine
   objects", "Not read", whose cell Status says that the definition of its
   kind could not be read, with the permission, and that its objects are not
   shown, never the words of the objects that only it names, and which stands
   for the DevMachines that no Machine names; and with one that may get it,
   the nodes as rows of their objects and no node of the kind (R6.5;
   SPEC-0004, P3; P12).

### With the real project

`integration/__tests__/cluster-tree-real.tests.ts`, in the job of the real
project of `test-environment.yaml`, on both releases of its matrix (SPEC-0004,
P33). It joins `REAL_PROJECT_SESSIONS` (`vitest.integration.config.ts:5-8`),
which the configuration of the real tier runs and the integration workflow
leaves out (`vitest.integration-real-project.config.ts:13`;
`vitest.integration.config.ts:17-18`), and the paths that start that job on a
pull request (`.github/workflows/test-environment.yaml:21-47`). It compares the
tree of `freelens-capi-md` and of `freelens-capi-mp` with what
`clusterctl describe cluster` prints of them with `--show-machinesets`,
`--show-templates`, `--show-resourcesets`, `--echo` and `--grouping=false`,
which show every MachineSet, the templates that the tool shows, under a node of
their own (`cmd/clusterctl/cmd/describe_cluster.go:153`), the
ClusterResourceSets, every infrastructure machine and bootstrap config, and
every Machine on a row of its own (R4.2, R4.10, R4.14, R4.18, R4.20), run by the
scripts with the pinned clusterctl and no check for a newer one, as the
comparison of SPEC-0004 runs it (SPEC-0004, "With the real project"; R4.9):

1. Every row of an object that the tool prints is a node of the tree with its
   kind and its name, under the node of the row that holds it in the tool. The
   rows that the tool adds for a message that it wraps hold only the prefix of
   the tree in their cell NAME, and are no rows of an object (R4.26;
   `internal/util/tree/tree.go:171-231`): `freelens-capi-mp`, Degraded, has such
   a message. The virtual rows of the tool, Workers, ClusterResourceSets and
   Templates, are read as the nodes Workers, Add-ons and Templates. A Machine
   under the virtual row Other of the tool, which the tool prints under Workers
   (discovery.go:177-188), is read under the node that P7 gives it: Workers for
   a Machine that the Cluster owns, Control plane for a control plane Machine of
   a Cluster with no control plane, or Other objects. The depth of a row of the
   tool is read from its prefix, two characters for each level
   (`internal/util/tree/tree.go:48-51`), and compared with that of its node,
   but under Other.
2. For every row with a status, the condition that the health of its node rests
   on has the same type, status and reason as the tool shows (R4.22; SPEC-0003,
   `src/common/status/index.test.ts`), and the counters of the rows of a control
   plane and of a MachineDeployment are those of the tooltip of its cell
   Replicas.
3. Every node of the tree that the tool does not print is of a kind that the
   tool leaves out: the ClusterClass (R4.31); the node Health checks and its
   MachineHealthChecks, which the tool never reads (R4.4, R4.5); the binding,
   which it reads with `--show-resourcesets` to name the ClusterResourceSets,
   and prints as no row (R4.4, R4.10); the resources under each
   ClusterResourceSet, which it never reads (R4.10); and a template that only a
   MachineSet names, which it shows under no MachineSet (R4.20).

Each side is read again until they agree, five minutes at most, as the
controllers still write the objects, and the session writes nothing, as the
comparison of SPEC-0004 (SPEC-0004, "Notes and deviations"). The domain is the
project's: the kit asks the suite to compare what the view says with what the
project's own tool reports (kit, `docs/testing.md`, "Domain correctness").

### Manual verification

None but the check of the themes (kit, `docs/design.md`, "How it is enforced"):
the session of the tree, run in CI from a branch made for it, with one job for
each theme, which is set in the profile of Freelens dev before it starts (kit,
`docs/testing.md`, "What runs when"), in the Dark and the Light theme of 2.0.0
and in the freelens and the High Contrast themes of 2.1.0, dark and light, takes
the screenshots of the tree of `rolling-out`, `deleting` and `no-status`, from
their top, of the details of a Machine of `rolling-out`, and of the states that
are not the happy one that the session reaches: the nodes of `deleting` that are
not found, the page with no Cluster named, an address with no Cluster, the
details of a node that is not in the tree, and, from the restricted session on
the same branch, Restricted and Partial (kit, `docs/design.md`, "How it is
enforced"). The pull request shows them in a comment, until the pass before the
review of M1 runs it (SPEC-0007). The fixtures are synthetic, so the
screenshots carry no data of a real environment (kit, `docs/safety.md`, "Data
of real environments").

## Notes and deviations

Filled during implementation.

Every rule below is proposed in this draft for the approval to confirm or
reopen, and listed for the review of the milestone, but for the part of P5 that
the maintainer decided on 2026-11-26, which is the maintainer's. Each adds to
the kit, to SPEC-0001, to SPEC-0003 or to SPEC-0004, or departs from them, and
the last column says why. The facts of the host that only the running
application shows come from the probe of this draft in Freelens 2.0.0 and
2.1.0, which "The host, as probed" states, H1 to H25; a row marked "Open"
names a fact that the probe did not reach, whose rule says its fallback and
whose session checks it.

| Rule | What the kit, SPEC-0001, SPEC-0003, SPEC-0004 or AGENTS.md say                                                                                                                                                                                                                                                                                                                                                                                                                                               | What the rule adds or changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | An ad hoc view is a page of its own or a section of the details (kit, "Ad hoc views"); one sidebar entry for each resource (kit, "Navigation")                                                                                                                                                                                                                                                                                                                                                               | The tree is a page of its own, `cluster-tree`, titled "Cluster Tree" with the name and the namespace of its Cluster as text, with no sidebar entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The drawer is too narrow for its columns and would nest a scroll; the list keeps its reads; the tree has an address, which the history of the frame keeps and the host does not restore (H12), and is no resource; the namespace badge in the title would set a filter that the tree does not read                                                                                                                                                                                                                                                                                                                                                                                           |
| P2   | The details of a Cluster have an address (SPEC-0004, P6)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The page has `cluster` and `details`; a node is named by group, kind and name, and by its namespace for a class elsewhere, and a value names one row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Every view, the overview of SPEC-0006 included, opens the tree at an object; both parameters reach the page by the navigation of the extension and by the history of the frame, and the host restores neither when the frame loads again or the cluster connects again (H12)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P3   | Every mark of an ad hoc view is a door (kit, "Ad hoc views"); the details link to the tree (SPEC-0004, "Scope")                                                                                                                                                                                                                                                                                                                                                                                              | A row "Tree" in the details of a Cluster, in the drawer and in the panel; none in the details of the root of the tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The objects below the first level are in the tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P4   | Dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Dropped: the cells of the counters of the list as buttons that opened the tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | They need an address for a node with no object and a click inside a row that neither the click of the row nor the session that clicks the middle of a row would hit; the list stays as SPEC-0004 decided it, and the step is left for later                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P5   | A reference is a link when its target exists (kit, "Details"); the references to the KubeadmControlPlane, the MachineDeployments, the MachinePools and the ClusterClass plain text until SPEC-0005, decided by the maintainer on 2026-11-25, and the other objects of Cluster API proposed so (SPEC-0004, P18); owners as text (SPEC-0004, P32); a link to the page of the host for an object of a provider (A6)                                                                                             | Decided by the maintainer on 2026-11-26: those four references open the tree at their node, with its details. Proposed: the MachineSets, the worker Machines and the names in a message that name an object of Cluster API of the Cluster open it the same way; the owners that the tree holds link to their nodes, and an owner that it does not hold is text; an object of a provider keeps its link to the details of the host in the details of a Cluster, and has it in the details of its node; the kinds of Cluster API by group and kind, every kind of R1, the `Provider` of `clusterctl` and the kinds of the operator included                                                                                                                                                                                     | The tree gives every object of a Cluster details of the extension, which the decision of 2026-11-25 awaited; A6 gives an object of a provider the page of the host, since the extension has no view of its kind; A7 holds for every kind of R1, and the menu of the host stays two clicks away from the details of a node, never one; an owner of a kind that the tree does not read has no version for a link (A2)                                                                                                                                                                                                                                                                          |
| P6   | A view of one Cluster reads its namespace through stores of its own, the kinds of SPEC-0004 alone (SPEC-0004, P31); no field of the spec of a KubeadmControlPlane but replicas and version (SPEC-0004, "What the view reads"); the models of the context type the fields of the rules of SPEC-0003 alone, "and nothing else" (SPEC-0004, P1; AGENTS.md, "Adding an API"); live data polled, and a list live through the subscription of the layout of the host (kit, "Interaction and performance", "Lists") | The read of one Cluster takes the kinds of each view as a parameter, and the details and the panel keep theirs, and the reads of the page when those cover the namespace of the Cluster, as SPEC-0004 does; the page of the tree publishes no source of the mounted page; the tree reads its kinds, the ClusterClass in the namespace that its reference names, and follows a change of that reference, so its root and the row of the list of the same Cluster can differ; one field more of a control plane, the reference to its machine template, read at `v1beta1` from `apiVersion`; models for six kinds and the fields that the tree follows, the remediation template of a MachineHealthCheck among them; `KindFeeds` gains `nodes` and `bindings`                                                                   | The roadmap asks the tree to be live; A12 gives the namespaces of the classes; the field holds nothing of R3.36; the panel would otherwise take the reads of the tree, of other kinds. It departs from SPEC-0004, P31 for the kinds and the class, from SPEC-0004, P1 and the exception of "Adding an API" of AGENTS.md for the fields, and from the kit for its liveness (P9, P23)                                                                                                                                                                                                                                                                                                          |
| P7   | What ties objects together (R3); the tool of the project, which merges and hides by default (R4.10 to R4.18)                                                                                                                                                                                                                                                                                                                                                                                                 | One row for each object: placed by its controller, by the reference that names it, a template under the highest object that names it and, of two of one kind, the first by name, or by an owner that the tree holds; under the row of an owner of a kind that cannot be read, which sits where an object read names that owner, else in the node of that kind; Other objects, with its reason, for what no rule places                                                                                                                                                                                                                                                                                                                                                                                                        | Each object once, under the object that controls it or names it, where the address of P2 finds it, whatever the order of a store; a refusal never shown as an absence. P8 and "What the tree cannot see" list what the tree does not show; the node Other of the tool holds Machines alone (discovery.go:177-188; R4.34)                                                                                                                                                                                                                                                                                                                                                                     |
| P8   | A view of one Cluster loads the MachineDrainRules that apply to it (A13); the kinds of R1 (R1)                                                                                                                                                                                                                                                                                                                                                                                                               | No node for the drain rules, the remediation requests and their template, the Secrets and the ConfigMaps, the templates that only the class names, the IPAM pools, the Node, the kinds of the operator, the `Provider` of `clusterctl` and the ExtensionConfigs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Each is no part of the Cluster, or never read, or belongs to a view of M2; the drain rules and the remediations are SPEC-0013 (ROADMAP.md:60)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P9   | Native first (kit, "Native first"); a cell is one line, a list virtualized (kit, "Lists", "Interaction and performance"); a list inside an ad hoc view is the list of the host, live through the subscription of its layout (kit, "Ad hoc views", "Lists")                                                                                                                                                                                                                                                   | The `Table` of the host, `selectable`, with virtual rows, in a chain of flexible boxes with `min-height: 0`, neither its list layout nor its `TreeView`; seven columns, each cell in an element that cuts it with an ellipsis; the role in a flat badge that never expands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A tree of many kinds is no list of one kind: the store, the sort and the search of the layout would reorder and cut the hierarchy; the `TreeView` draws every child, holds no columns, answers to the pointer alone and keeps its state to itself. Without the chain the list draws every row and never scrolls, and the text of a cell is cut with no ellipsis; the flat badge reads as plain text in both themes (H5, H10, H22)                                                                                                                                                                                                                                                            |
| P10  | The spec of a view says what the cell of a kind with no summary condition shows (DESIGN.md)                                                                                                                                                                                                                                                                                                                                                                                                                  | The cell Status from what the health rests on, for each form, as the rule of every view                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The tree is the first view of these kinds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P11  | A count counts the results of the model; no mark of a view's own over several objects (SPEC-0003, "How a view uses it"; DESIGN.md); a count of health keeps the stale ones next to it (SPEC-0003, "Freshness"); a count opens the filtered list (kit, "Ad hoc views")                                                                                                                                                                                                                                        | The counts of the objects under each node, worst first, those not read and not found after Unknown and before Healthy, the stale ones of each health in parentheses, never an entry of a binding; words of the cell, no control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | They say where to look among hundreds of objects; the row is the door, its details or its expansion, and the search keeps the nodes of a word of health; a count that opened something else would be a second target in a row, which P4 left for later                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P12  | A reference that cannot be followed is text that says why (kit, "Details"; SPEC-0004, P18); a status that cannot be read is unknown, never healthy (kit, `docs/safety.md`, "Reading")                                                                                                                                                                                                                                                                                                                        | A row for each object that the tree cannot read, from its reference or the owner reference of what it owns, and a node for each kind that it cannot read, a kind of a provider whose definition cannot be read included: "Not read" or "Not found" in their cells of state, and the reason in the words of SPEC-0004, for the namespace of the Cluster or of its class, followed, in the cell Status of the node of a kind whose objects name the kinds of the providers, the Machines, the MachineDeployments, the MachineSets, the MachinePools and the control planes, by the words that the objects that only that kind names are not read either, and in that of a kind of a provider whose definition cannot be read by the words that its objects are not shown; an entry whose binding cannot be read says "Not read" | A refusal is never an absence, and N/A says that a kind has no status; objects found by a label or by `spec.clusterName` have no reference to make their row from                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P13  | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | No row before the first loads have ended; expanded at first where an object needs a look, a pause of its own included, computed once; the choices of the user kept; the rows in view kept in place when rows are inserted or removed above them, by the scroll of the list, moved in a layout effect before the paint; no scroll for an expansion, a collapse or a search                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Problems first, with nothing hidden and no row seen before its place is known. The list keeps its offset when rows are inserted above the view, so they shift, and moving its scroll by their height kept them in place on both releases (H18). Open: rows inserted by a watch, and rows removed above the view, whose compensation the probe did not try (H18, H25), which the session tries; fallback: the rows in view shift by them                                                                                                                                                                                                                                                      |
| P14  | The tool orders the children of a node by a z-order of its own and then by the text of their rows (R4.13)                                                                                                                                                                                                                                                                                                                                                                                                    | The roles in the order of the summary of a Cluster, then the nodes of the kinds that cannot be read, in the order of the rows of P7 and, within one row, by name; the nodes of one kind by name, never by state, and of two that name one template the first holds it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | No row moves when its state changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P15  | The search of a list covers what its columns show, and the fields of `getSearchFields()` (SPEC-0004, P14)                                                                                                                                                                                                                                                                                                                                                                                                    | A search of the tree that keeps the matches and the nodes above them, on the words that the rows show, not the namespace of the Cluster nor the counts; no focus at first; an Escape in the empty search closes the details, those of the host first while `kube-details` has a value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Hundreds of objects; a match shows in its own row; the namespace of the Cluster would keep every row, and the counts every node above a match. The search of the host takes the focus at the mount and stops Escape (H21). It departs from the rule of the first reviews of this draft, which searched the namespace                                                                                                                                                                                                                                                                                                                                                                         |
| P16  | No work in the render path (kit, "Interaction and performance")                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rows drawn where the window shows them; a scroll on a key move, an address, the closing of the details and the compensation of P13 alone; `selectedItemId` in the render after a key move and in the first render for the address, cleared once the list has scrolled, and the scroll of the list set by the page for a row partly in view and for the address; nothing merged                                                                                                                                                                                                                                                                                                                                                                                                                                                | The virtual list of the host scrolls to its selected item at every render, and leaves a row partly in view where it is: the row of the address landed half under the head (H6, H17). Open: the scroll of the page at the first mount, which the session reads                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P17  | Details of the extension's own (A7; SPEC-0004, P15); provider objects with their conditions and contract fields (A6); a reference is a link when its target exists (kit, "Details")                                                                                                                                                                                                                                                                                                                          | The drawer of the host over the tree, with the details of every node from the model; those of the Cluster from SPEC-0004; the focus back on the tree once the row is in view; a click on a row, and an Escape in the empty search, that close the details of the host first while `kube-details` has a value; the pool of a claim and the remediation template of a MachineHealthCheck as text                                                                                                                                                                                                                                                                                                                                                                                                                                | One model and one place for every object of a Cluster. The drawer covers all but the names, the host gives the focus nowhere, a row must stop its click, and a click under the details of the host changed the tree unseen (H11, H19, H20). The tree reads neither a pool nor a remediation template, nor their definitions (P8)                                                                                                                                                                                                                                                                                                                                                             |
| P18  | Controls reachable from the keyboard, focus visible and back after a dialog, no global key binding (kit, "Interaction and performance")                                                                                                                                                                                                                                                                                                                                                                      | One Tab stop, an element with the role `treegrid` that takes the keys of a tree; rows with the role `row` and the states of a tree, spread on `TableRow`, the header a `row` of `columnheader` cells and the cells `gridcell`; the active node by its identity, named once its row is drawn; a press of the mouse on a name or a button that expands moves no focus, and the click gives it to the element                                                                                                                                                                                                                                                                                                                                                                                                                    | The `Table` drops a handler of keys and carries no roles, and its rows are virtual: a focused name is unmounted with its row, and the focus falls to the body (H7, H8); a press of the mouse would focus a name as well, which the rule takes from the browser, the probe having clicked the indentation of rows alone (H11). Fallback, if a release drops the attributes: an element of the extension's own inside each row, head or cell. The keys scrolled the list natively from a name (H16); the session checks them from the element. Open: a role of the virtual list between the treegrid and its rows, which the session reads in the tree of accessibility; fallback: `aria-owns` |
| P19  | Stale keeps the last data, with their time (kit, "States that are not the happy one"); Stale as the host shows it (SPEC-0004, P26)                                                                                                                                                                                                                                                                                                                                                                           | The states of the page; no mark of a cluster that cannot be reached; the spinner until the first load of every kind has ended, and the refresh disabled while a first load of a kind runs; a refresh that failed said as one, never Restricted or Failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The host draws that mark in its list layout alone, from 2.1.0, from a dependency that the extension API does not give; it departs from the kit, as SPEC-0004, P26 does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P20  | Never show the fields of R3.36 (A3); the details of a Cluster with the annotations of the host (SPEC-0004, P32)                                                                                                                                                                                                                                                                                                                                                                                              | The annotations of the kubeadm kinds, of the ClusterClass, of the Cluster and of the objects of a provider without `kubectl.kubernetes.io/last-applied-configuration`; the names of the variables and of the patches, never their values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The host shows that annotation, which copies the spec, and the values of the variables and the patches can carry the fields of A3; the details of the host keep it, and the metadata of the host over the panel of a Cluster, which the extension cannot change; one function reads the variables and the patches, for their names; it departs from SPEC-0004, P32 for the Cluster                                                                                                                                                                                                                                                                                                           |
| P21  | A13 counts the IPAddressClaims among the objects of a Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                | The claims and their addresses in the tree; the claim of `no-status` names its Cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A claim that waits holds a Machine; no state holds one of a Cluster. The definition on the cluster of the definitions takes `spec.clusterName` (H23). Open: the webhooks of the real project in the capture; fallback: no such claim on the first tier, and the claim of a Cluster at the unit layer alone                                                                                                                                                                                                                                                                                                                                                                                   |
| P22  | Static objects carry what a controller writes in a state (kit, "The test environment has two tiers")                                                                                                                                                                                                                                                                                                                                                                                                         | A large Cluster of 300 Machines, made by the session of the tree from `healthy` at run time in a namespace of its own, in its last step, and deleted at its end; no state of the fixtures; limits of its own for its apply and its deletion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | No capture can make 300 Machines on a runner, no test that reads every state changes, and the set is 2.8 MB of files. The scripts applied it in 52.6 s and deleted it in 77.0 s on a local kind cluster (H24). Open: the times on a runner, which the pull request measures                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P23  | Live data are polled at an interval that the panel shows, with a manual refresh (kit, "Interaction and performance")                                                                                                                                                                                                                                                                                                                                                                                         | Watches, as every view of the extension reads, and a manual refresh in the header that reads the tree again, as the reload after a 410, disabled while a first load of a kind runs: the read state knows a refresh, and the definitions refused or failed are asked again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A watch brings each change at once; the refresh recovers what a watch can lose (SPEC-0004, "Notes and deviations"), and a refresh that fails is no first load that failed; a refresh during a first load would end it and could leave the tree loading for good; it departs from the kit for the interval                                                                                                                                                                                                                                                                                                                                                                                    |

Left for later: the counters of the control plane and of the workers of the
list of the Clusters as doors into the tree (P4). They need an address for a
node with no object, as Workers or the virtual Control plane, which P2 does not
give, and a click inside a row that neither the click of the row, which opens
the details (SPEC-0004, P13), nor the session of the Clusters, which clicks the
middle of a row
(`integration/__tests__/clusters.tests.ts:986, 1019, 1035, 1108`), would hit by
mistake.

What the host gives, which the tree keeps as it is (P6, P19, P23). The tree
reads as a view of one Cluster of SPEC-0004, P31, so it has the limits that
SPEC-0004 lists for those reads, for every kind that it reads: the list and the
watch of each kind on one namespace set the resource version that the API of
the host keeps for the whole cluster, and a watch of the tree that starts again
can skip events that it never received, until the next change of that object or
the next load; a watch that the server refuses while it allows the list starts
again with no end, and the page cannot tell; and a reload after a 410 that
fails empties the kind in that namespace (SPEC-0004, "Notes and deviations").
The refresh of P23 reads again what a watch that starts again skipped and what
a reload that failed emptied, and the objects under a refused watch, which then
fails again; a refresh that fails empties its kind in that namespace as a
reload does (P23). The page of the tree has no mark of a cluster that cannot be
reached, on either release (P19). The probe adds what only the application
shows: a scroll leaves rows blank for one frame and never once it settles; the
list keeps its offset when rows are inserted above the view; the drawer covers
all of the page but the names; the host gives the focus nowhere when a drawer
closes; and the search of the host takes the focus at the mount and stops
Escape (H4, H11, H18, H19, H21), which P13, P15, P16 and P17 answer.

What the tree cannot see. A kind that no object of the Cluster names is not
read, so an object of it labelled with the name of the Cluster, such as an
infrastructure machine of a kind that no Machine names any longer, shows nowhere
(P7); nor does a kind that only a kind that cannot be read names, as the
DevMachines while the Machines are refused, which the node of the refused kind
says (P12). The availability of the controllers is not read, as for every view
of one Cluster (SPEC-0004, P31).

Captures still missing, as SPEC-0003 lists its own (SPEC-0003, "Notes and
deviations"): a claim controlled by its infrastructure machine, which the
development provider does not make (P21); a control plane of a provider, at the
contract `v1beta2` and at `v1beta1`, and a bootstrap config of a provider, which
the test environment does not install; and a Cluster paused while it rolls out,
whose objects would show their activities Blocked (SPEC-0003, "Notes and
deviations"). The unit tests read them from objects of the fixtures whose fields
the case changes, as each case says: one field for a claim; the kind that a
Machine names and its definition for a bootstrap config of a provider; the kind,
the reference, with `apiVersion` in the place of `apiGroup` at `v1beta1`, and
the contract label of the definition for a control plane of a provider; and
`spec.paused` of the Cluster of `rolling-out` for a pause in a rollout (Tests,
"Unit").

- Decided while implementing: the spec is implemented in three pull requests.
  The first has the models of the kinds that the tree reads and the fields that
  it follows (P6), the read of one Cluster with the kinds of its view, the class
  where its reference names it and a refresh (P6, P23), and the tree as pure
  functions of `src/common/views/`, with their unit tests: the placement, what
  is no node, the nodes that cannot be read, the counts, the expansion at first
  and the order, the search, the offset of the scroll and the names of the
  variables (P7, P8, P11 to P16, P20, P21), in `cluster-tree.ts`,
  `tree-rows.ts`, `label-selector.ts` and `variable-names.ts`. The second has
  the page: its registration and its address, the table with its cells, the
  details of a node, the keys and the focus, its states and its refresh, the
  links of P5 from the details of a Cluster, and its stylesheets (P1 to P5, P9,
  P10, P13 to P19, the check of the annotation of P20). The third has the
  sessions in Freelens, the large Cluster of P22 with its generator, the
  capture of P21, the second identity with the kinds of the tree (P19), the
  jobs of CI, the screenshots of the themes, and the README, TRY-IT.md,
  ARCHITECTURE.md and TESTING.md.
- Decided while implementing the first part: the models that the tree adds are
  a list of their own, `TREE_MODELS` of
  `src/renderer/api/context/context-models.ts`, apart from `CONTEXT_MODELS`,
  which the page of the Clusters reads and whose kinds the second identity of
  the restricted session is granted (`test/restricted-access.test.ts`), so that
  both read what they read before until the third part. Their types are the
  structs of the Go types of the release under their names, with the fields
  that the tree follows alone ("Adding an API" in AGENTS.md): a kind with no
  status types none, the specs of a KubeadmConfig and of its template type no
  field, and the six models have no short names, which their definitions do not
  give.
- Decided while implementing, where P6 is silent on its form: the kinds of a
  view are a parameter of the read of one Cluster, `ViewKinds` of
  `src/renderer/reads/cluster-namespace-read.ts`, the models that it reads and
  the references that it follows; the details and the panel pass
  `CLUSTER_VIEW_KINDS`, the kinds of SPEC-0004, and the tree
  `TREE_VIEW_KINDS`. The store of the ClusterClasses of the tree is built once
  the Cluster is read and names a class, on the namespace that its class
  reference names, and none for a Cluster with no topology. The reaction to the
  filter of the namespaces runs before the reaction to the stores, so that the
  read state knows the namespaces of a load when a store answers at once.
- Decided while implementing, where P6 and P7 are silent: the reads of the
  tree follow the references of the objects by which the tree places what they
  name, and no other, so that the reads and the tree follow the same
  references: the Machines, the MachineDeployments, the MachineSets and the
  MachinePools that their label or their `spec.clusterName` gives the Cluster,
  in its namespace, as the tree takes the objects of its Cluster (P7); and
  every control plane of the Cluster, the one that its reference names and any
  other that its label gives it, a KubeadmControlPlane at `v1beta2` with no
  definition, and an object of the kind of a provider that the Cluster names as
  its control plane at the contract of its definition, once that resolves. So a
  control plane that the Cluster does not name, which sits under Other objects,
  names its machine template after the four objects of P7 that name templates,
  and that template, which carries no label of the Cluster, has a row, as the
  case of `without-topology` with its reference removed shows, whose kind the
  reads read; without it the template would be in no row, and the details of
  that control plane would link to nothing (P17). One function,
  `followedObjectsOf` of `src/common/views/references.ts`, gives the reads
  those objects, and one, `followedReferencesOf`, says what each object names,
  for the reads and for the tree, which `test/tree-sources.ts` calls as the
  read does; a case of the read and a case of the tree see each call it, a case
  builds the tree of every state of the fixtures from the read of that state,
  with no row of a kind that the read never tried, and a case of the read sees
  it read the machine template of a kind that only the control plane of a
  provider names, whose row is then an object. A reference to a kind that a
  model of the view reads is found in the store of that model, with no
  definition read; the two references of the Cluster keep the resolution of
  SPEC-0004, P3. A template reference of a MachineDeployment or of a MachineSet
  to a kind whose name does not end in `Template` is not followed, as P7 tells
  a template. A kind that the reads never tried reads as not read, "Not read.
  The tree has not read its kind.", never as not served, which its definition
  alone says (P12).
- Decided while implementing: the read marks each load that a refresh starts,
  store by store, with `refresh` in the event `load-started` of `read-state.ts`
  (P23). `DefinitionReads` forgets a read refused or failed by replacing its map
  with the reads that remain, and the read keeps the stores that it refreshes
  in a `WeakSet` that it reads with `has`: the check of Safety of SPEC-0004
  matches the name of a method that writes, `delete` and `remove` among them,
  and so takes such a call on a collection of the view for a write
  (`src/renderer/read-only.test.ts`). The check is kept as it is, and the view
  calls no such method of a collection.
- Decided while implementing: the objects that the tree reads beside the
  context hold the KubeadmControlPlanes of the namespace, since the context
  takes a control plane from the reference of each Cluster alone, and a
  KubeadmControlPlane labelled with the name of the Cluster that it no longer
  names is still an object of that Cluster (P7).
- Decided while implementing: the parts of the details and the nodes of the
  tree key the result of an object with one function, `contextKeyOf` of
  `context.ts`, so that one object with one context has one result (P16;
  SPEC-0003, "How a view uses it"). The key of a part changes its form; no
  result of a part changes.
- Decided while implementing, where P14 is silent: under one node, two kinds of
  one row of P7 come in the order of the names of their kinds, and the objects
  of one kind in the order of their names, both in the order of their
  characters, the same in every locale. So the DevMachinePool of a MachinePool
  comes before its KubeadmConfig, which "Tests", "Unit" names in the other
  order for `machine-pools`.
- Decided while implementing, where P7 is silent: an object of a kind of a
  provider that no reference names, such as one under Other objects, takes the
  role of the first reference that names its kind elsewhere, and so does the
  row of an owner of such a kind that cannot be read (P12). The kinds that can
  name an object that the Cluster owns, which its reason names when they could
  not be read, are those that the rules of P7 give: for a template, the kind of
  the control plane that the Cluster names, the KubeadmControlPlanes, the
  MachineDeployments, the MachineSets and the MachinePools; for a
  KubeadmConfig, the Machines and the MachinePools; for an IPAddress, the
  IPAddressClaims; for a ClusterResourceSet, the ClusterResourceSetBindings;
  for an object of a provider, by the roles of its kind, the Machines for an
  infrastructure machine, the Machines and the MachinePools for a bootstrap
  config, and the MachinePools for an infrastructure machine pool; and none for
  any other object, which only the Cluster, which is read, can name.
- Decided while implementing, where P7 is silent: an object whose owner is of
  a kind still loading waits for that load, and no row places it meanwhile, so
  that it never shows under Other objects for a moment; so does an object whose
  owner, or whose Machine or MachinePool that names it, waits. A template is
  placed after every other object, so that the highest object that names it
  decides, whatever the order in which the rows found them, and the row of the
  owners places a template only after the templates.
- Decided while implementing, where P7 says that Other objects holds what it
  holds by the same rules: the objects that no row places go under Other
  objects one at a time, in the order of the rows of P7 of their kinds and then
  of their addresses, whatever the order of a store, an object that another of
  them owns, or that a Machine or a MachinePool among them names, after that
  one; and after each the rows of P7 place what it holds, and what that holds
  in turn, so that the objects that it controls, owns or names go under it.
  The templates aside, as the second part found and its unit case pins: the
  row of the owners places no template once the templates are placed, so a
  template that a template under Other objects owns goes beside it, and an
  object that a template alone owns goes there before the templates are
  placed, each with the reason that its owners are not nodes of the tree,
  naming a template that is a node by then; Cluster API makes neither shape.
  The rows then read only the objects that the nodes made since they
  last read control, own or name, in the order in which a pass over every
  object reads them, so that the tree is the one that every row run again over
  every object gives, and the work grows with the objects of the Cluster, never
  with their square, which hundreds of Machines restored with no owner
  references would otherwise make it (P16). A worker Machine with no owner
  holds its infrastructure machine and its bootstrap config, also once they
  lost their owner references, as after a restore, and a MachineSet whose
  MachineDeployment is gone holds its Machines, their objects and its
  templates.
- Decided while implementing, where P7 and P21 are silent: an IPAddress that
  the `status.addressRef` of a claim names and that its namespace does not hold
  is a row made from that reference, "Not found", under the claim. The
  resources of a ClusterResourceSet are those of its `spec.resources`, each
  matched in the binding of the Cluster by its kind and its name.
- Decided while implementing, where P7 and P12 are silent on its row: a
  ClusterResourceSet that the binding of the Cluster names and that the tree
  did not read, its kind refused, failed or still loading, or the object not in
  its namespace, is a row under Add-ons made from that name, by the field of the
  binding that names it, which says why, since the binding places it always;
  the node of its kind then stands for the others alone. The row holds no
  entry, since the resources of a ClusterResourceSet are those of its
  `spec.resources`, which the tree did not read.
- Decided while implementing, where P7 asks a selector read as its controller
  reads it: a selector with a key or a value that is not that of a label of
  Kubernetes, which Kubernetes refuses to convert, selects nothing, as the
  controller then selects nothing (clusterresourceset_controller.go:265-268).
  The admission webhook of the project refuses such a selector
  (core/webhooks/admission/clusterresourceset.go:78-84), so only a cluster
  without that webhook, as the cluster of the definitions, holds one.
- Decided while implementing, where P12 gives the words for the namespace of
  the Cluster alone: for the class read in another namespace, the reason names
  that namespace and says that the class reference of the Cluster names it, as
  "Its kind could not be read in the namespace `<namespace>`, which the class
  reference of the Cluster names." A class in the namespace of its Cluster,
  whose reference names none or names that namespace, is said in the words of
  the namespace of the Cluster.
- Decided while implementing, where P11 is silent: the objects with no health,
  of a kind with no status or deleting, are counted last as "with no health",
  as `21 objects: 17 Healthy, 4 with no health`; the stale ones are counted for
  an object with a health alone, and a count of one object reads `1 object`.
- Decided while implementing, where P13 is silent: an entry of a binding never
  needs a look, since it is no object (P7, P11), and what its
  ClusterResourceSet applied is in the health of the ClusterResourceSet, which
  the model gives; the activity Unknown, which the cell Activity shows next to
  the others, needs one, as an activity other than Idle and Paused; and an
  object whose result waits for an input needs none yet.
- Decided while implementing, where P13 and P15 are silent on their form: the
  state of the rows, `RowsState` of `tree-rows.ts`, holds the expansion at
  first of one Cluster, by its namespace and its name, and then the choices of
  the user; the search expands the nodes above its matches apart from it, so
  that clearing it gives the expansions of the user back as they were. The
  offset of the scroll takes what changed the rows, the reads, an expansion or
  a search, and moves for the reads alone; when the reads remove the first row
  in view itself, the next row after it that remains stays in place, so that
  no row in view moves.
- Decided while implementing, where P15 is silent on how a word matches: as a
  search of a list of the host matches a field, whatever its case, in the word
  as it is or in the word without its dashes and underscores
  (freelens:packages/core/src/renderer/components/item-object-list/search-matcher.ts,
  the same at `v2.0.0`), written in `tree-rows.ts`, since the extension API does
  not export it. The first part matches the words of the name of a row, its
  role, the namespace of the class read elsewhere, the words of the health,
  "stale" and the activities as the cells of the list give them, and, for a
  node that cannot be read, the words that P12 puts in its cells: "Not read",
  or "Not found" for an object that its namespace does not hold, and the
  reason; the words of the cells Version and Status of an object join them with
  those cells, in the second part.
- Decided while implementing: until the page imports them, `knip.jsonc` lists
  `cluster-tree.ts`, `tree-rows.ts` and `variable-names.ts` as production
  entries, since only their tests reach them; the page removes the entries,
  which the second part did.
- Decided while implementing, for the names of the variables and of the patches,
  in place of what P6, P20, "Tests", "Unit" and "Safety" say of them, whose
  rules stay as they were approved, since a change to an approved spec is made
  in its notes (kit, `docs/specs.md`, "Evidence"): the check of Safety matches
  the names `variables`, `overrides` and `patches` wherever they are read or
  declared, as the check of R3.36 matches its names, in every module of the view
  but `variable-names.ts`, which reads them for their names, so that a read by a
  member, an index or any destructuring, with a new name, a default or a pattern
  of its own, is found. So no model types them. This note supersedes, in P20,
  "the `value` that the model of the Cluster types for each variable", which no
  model types; in "Tests", "Unit", the line of `context-models.test.ts` by which
  "the ClusterClass types the names of its variables and of its patches and no
  value", since it types neither, as that test asserts; in "Safety", "the value
  of a variable, which the model of the Cluster types", and that the check
  "matches reads, not names" while `variables`, `overrides` and `patches` "are
  only declared, by the model of the Cluster", since the check matches the names
  and no model declares them; in P6, the names of the variables and of the
  patches among the fields that the model of a ClusterClass types, which
  `variableNamesOf` reads from the object, untyped; and, in SPEC-0004, the types
  that "What the view reads" gives the topology of a Cluster, whose model leaves
  out the variables of its topology and of its parts, which the test of its
  types reads in the fixtures as left out on purpose (SPEC-0004, "Notes and
  deviations"). `variableNamesOf` returns the names as `variableNames` and
  `patchNames`, which the check does not take for those names; in
  `variable-names.ts` it finds `value` and every member of a patch but its name,
  in the code, the comments left out. The check of the annotation of P20 comes
  with the details of a node, whose function reads it, in the second part.
- The large Cluster of P22 comes with its generator,
  `integration/__tests__/large-cluster.ts`, and its unit test in the third
  part, with the session that applies it. Until the capture of P21 in the third
  part gives the claim of `no-status` its `spec.clusterName`, the expected tree
  of `no-status` holds no claim, and the case of P21 of `cluster-tree.test.ts`
  writes the field.
- Decided while implementing, where P13 puts in the tests of the rows the case
  of no row before the first loads have ended: that case is a case of the read,
  `firstLoadsEnded` of `cluster-namespace-read.test.tsx` and of
  `read-state.test.ts`, since the read decides it, with the definitions still
  read when the store of definitions failed; the page shows the spinner until
  then in the second part. The first loads end with the first load of the store
  of Clusters of the read, which it builds once it starts and the host has
  registered the API of the Clusters: before the read starts, as a first render
  of the page asks before its effect runs, and while the host has registered no
  API, as while it checks (P19), they have not ended, though no store of the
  read is loading. The read keeps its first loads ended once they have all
  ended, for its life: a load that starts later, of a kind that a reference
  names later, of the namespace that the class reference names now, or of a
  definition that a refresh asks again, is no first load of the tree, which
  stays shown, and its nodes show their own loading (P6, P19, P23). The refresh
  of P23, disabled again while the first load of a kind that a reference names
  later runs, reads the loads that run, in the second part.
- Decided while implementing, where P19 is silent on the words of its notices:
  the notices of the tree are those of `treeNotices` of `read-state.ts`, one
  for each kind that the tree reads and holds back, the Clusters apart, which
  the page says in the place of the tree: that its nodes read as not read until
  it can be read, and so do the objects that only it names for the Machines,
  the MachineSets, the MachineDeployments, the MachinePools and the control
  planes, or the resources of the ClusterResourceSets for the bindings; then the
  inputs that the model leaves out, for the Cluster of the tree and for the
  objects of the tree that take them, as the value of `KindFeeds` of the kind
  says, and, for the ClusterClasses, for the Cluster of the tree, whatever
  namespace its class reference names, and never for the Clusters of that
  namespace. The list of the Clusters keeps its words, and says nothing more of
  a kind that the tree alone reads.
- Decided while implementing, where P23 is silent: a refresh, or the reload
  after a 410, that fails again with an answer that the hold of its refresh
  already holds keeps one entry for that answer, the latest, and the hold the
  time of the latest. The read state is that of every view, so the notices of
  the list and of the details of SPEC-0004 keep one entry too, which its notes
  record (SPEC-0004, "Notes and deviations").

- Decided while implementing the second part, where P2 is silent on how a
  value is read: `details` names a node by its parts alone, three or four, none
  of them empty, `.` or `..`, and is only ever looked up among the nodes of the
  tree, never sent; `cluster` is read by the parser of the parameter `details`
  of the page of the Clusters (SPEC-0004, P6), in `tree-address.ts`. The ids of
  the two pages are in `src/renderer/pages/page-ids.ts`, which the
  registration, the page of the Clusters and the page of the tree import. The
  page of the tree is keyed by its Cluster, so that another Cluster starts a new
  read.
- Decided while implementing the second part, where P13 and P16 give a reason
  that no longer holds: the page gives the virtual list of the host its
  `selectedItemId` and sets the scroll of the list's element, as they say,
  although the extension follows 2.1.0 alone, since the `Table` of the host
  hands it no handle on its list, whose `scrollToItem` would be the only other
  way. The page gives `selectedItemId` in the render after a key move, after
  the details close and in the render that shows the node of an address, and
  clears it in the frame after the row is drawn, which a reference on an
  element of each row tells; in that frame it brings the row whole into view by
  the scroll of `.VirtualList > .list`, and, while that element has no height
  yet, as at the first mount, it tries again in the next frame, for 30 frames
  at most. The rows that the reads insert or remove above the first row in view
  move the scroll in a layout effect, by `scrollOffset` of `tree-rows.ts`.
- Decided while implementing the second part, where P2 and P13 are silent on a
  node that the address names later: it is shown, the nodes above it expanded,
  and scrolled to, once, when a link or a navigation names it and when it
  appears in the tree; the node of a row that the user clicks, whose address the
  page sets itself, is not scrolled to, since its row is in view.
- Decided while implementing the second part, where P10 is silent on an object
  that is deleting, to which the model gives no health: its cells Condition and
  Status read N/A, with the tooltip "No health: it is deleting. The stage of its
  deletion is in its details." (DESIGN.md, "Words"); while the inputs of the
  model of an object load, its cells Activity, Condition and Status show the
  spinner of the host, as the list does.
- Decided while implementing the second part, where P9 is silent on the form of
  some cells: the cell Replicas of a control plane, a MachineDeployment, a
  MachineSet and a MachinePool is `status.availableReplicas` of
  `spec.replicas`, as `2/3`, with every counter in its tooltip, the up to date
  Machines of a control plane at the contract `v1beta1` read from
  `status.updatedReplicas`; a Machine counts one desired, and one available
  when its `Available` is `True`; the virtual nodes Control plane and Workers
  show the counters and the versions that the Cluster keeps of them. The cell
  Status of a node that cannot be read holds the reason, with "Not read." and
  the message of each answer in its tooltip, and that of the node of a kind adds
  the notice of the kind to its tooltip (P19); an entry applied reads "Applied
  at" its instant; the tooltip of the counts names the node that holds them, as
  "Under Workers: 10 objects: 8 Healthy, 2 with no health". The indentation is
  twice the spacing of the host, `--padding`, for each level, 16 px, as the
  probe drew it (H2). The columns flex as `cluster-tree.module.scss` says: those
  of state keep their minimum width and never shrink, Replicas and Version
  shrink the most and the name the least.
- Decided while implementing the second part, where P12 says that the kind and
  the name of a node that cannot be read are text: they are a button, as those
  of an object read, since P17 gives that node details, which say why it cannot
  be read; a virtual node, the node of a kind and an entry of a binding keep
  their words as text.
- Decided while implementing the second part, where P18 is silent: when the
  rows no longer show the active node, a search makes the first node that it
  matches active, with no scroll, and a collapse or a change of the reads the
  nearest node above it that the rows show, else the root; Enter and Space
  expand or collapse the node of a kind, as they do a virtual node. The element
  of the tree is labelled "Tree of the Cluster <name>".
- Decided while implementing the second part, where P17 is silent on the words
  of the details: the title of the drawer is `<Kind>: <name>`, "Cluster: <name>"
  for the root and "Details" for an address that names no node; the row Place
  reads as "Machine of MachineSet <name>, by its controller", or
  "MachineDeployment of Cluster <name>, under Workers, by the label
  cluster.x-k8s.io/cluster-name", with a row "Why there" for an object under
  Other objects or under the row of an owner that cannot be read; the pause of a
  node says whether its own annotation, `spec.paused` of its Cluster or both
  hold it. The facts of each kind are those of `nodeDetailsOf` of
  `node-details.ts`: the counters, the version and the templates of a control
  plane, a MachineDeployment, a MachineSet and a MachinePool, and the version of
  the Machines of a control plane; the version, the provider ID, the Node and
  the objects of a Machine; the field of the contract that says that an object
  of a provider is ready, its provider ID and the link to the details of the
  host; the targets, the counts, the remediation and the remediation template of
  a MachineHealthCheck; the selector of a ClusterResourceSet and what it applied
  to the Cluster; the entries of a binding; the pool and the IPAddress of a
  claim; the address, the prefix and the gateway of an IPAddress; that a
  template has no status, and the nodes that name it; and the names of the
  variables and of the patches of the ClusterClass.
- Decided while implementing the second part, where P5 and P17 are silent on
  some links: an owner that is the Cluster links to the root, whose details are
  those of a Cluster, and the owners of the Cluster itself, in the details of
  the root, stay text, as SPEC-0004, P32 has them; a name in a message in the
  details of a node opens the node of an object of Cluster API of the tree, by
  its kind and its name, the class read in another namespace included, the one
  node of the tree of its kind. In the details of a Cluster, a name in a message
  opens the node of a Machine, a MachineSet, a MachineDeployment or a
  MachinePool of the Cluster and of its KubeadmControlPlane when the view read
  them, and the row Tree is a section of its own before the Status, with the
  button "Open the tree of this Cluster".
- Decided while implementing the second part, where "Safety" names "the one
  function" that reads the annotation that `kubectl apply` writes: it is one
  module, `annotations.ts`, whose `annotationsOf` reads whether an object holds
  it, with `Object.hasOwn`, and never its value; the check of Safety finds the
  name of the annotation in no other module of the view, and in that one no
  index, no destructuring by its key, no `get` and no walk of every value of the
  annotations.
- Decided while implementing the second part, where P23 is silent on the form of
  the refresh: an icon of the host with the role `button`, labelled "Read the
  tree again", disabled while `firstLoadsRun` of the read holds, with the
  tooltip "The tree is still being read: it can be read again once it is".
  `firstLoadsRun` holds before the first loads end, while the first load of a
  store built later runs, and while the definition of a kind of a provider that
  a reference names is still read; unlike `firstLoadsEnded`, it turns true
  again whenever such a read starts.
- Decided while implementing the second part, where P1, P15 and P19 are silent
  on some words: the title reads "Cluster Tree: <name>, <namespace>", as the
  sketch of P1 has it; the search says "N nodes match", or "1 node matches"; a
  page opened with no Cluster says that it shows the tree of one Cluster, which
  the details of that Cluster open from their row Tree, with a button to the
  page of the Clusters; the details of a node that the tree does not hold say
  that no such object is in the tree of the Cluster, which was read, and, for
  one that was there in this mount, that it is no longer.
- Decided while implementing the second part: the focus goes back to the
  element of the tree when the details close on their icon, on Escape, or on a
  click outside while the focus is still in the details or on the body, as the
  details of a Cluster do (SPEC-0004, P15), and stays on the control that a
  click outside gave it to.

- Decided while implementing the second part, after the last review of the
  first: the case of the placement that counts its passes over the objects of
  the Cluster counts too what the rows read of each object, the calls of
  `followedReferencesOf` and of `ownersOf`, from 150 to 300 restored Machines,
  which grow as the Machines do, at most twice, so that a row that read every
  node or every object for each object under Other objects fails it. Four cases
  pin the mechanisms by which the rows place what an object under Other objects
  holds as a pass of every row over every object places it, each on the
  smallest set on which the review found it to change the tree: what a node
  placed in a pass owns after it joins that pass; what it owns before it waits
  for the next pass; the objects that the nodes own are read in the order of
  the objects of the Cluster; and the row of the claims reads again the nodes
  that its own pass made.
- Decided while implementing the second part, where the order of the rows of P7
  and the passes of the rows part: the row of the owners places, in one pass
  over the objects of the Cluster in their order, every object that it can
  place, and an object that it places makes a node under which the same pass
  places what that object owns after it, by its owner, where an earlier row of
  P7 would place it by its own rule: an IPAddress that its claim controls and
  that the `status.addressRef` of the claim names, by its owner rather than by
  that reference, when the row of the owners places the claim, as under the row
  of an owner of a kind that cannot be read; and a claim that a MachineSet
  controls, by its owner rather than by its controller, when that row places the
  MachineSet. The parent is the same; the placement that the details say and the
  order of P14 among the siblings differ. The placement keeps it, as the whole
  settle of the first part did, and unit cases pin it.
- Decided while implementing the second part: the first settle of the rows,
  before any object goes under Other objects, still runs every row over every
  object until they place nothing more, so a chain of owners in which each
  object comes before its owner in the order of the objects of the Cluster, its
  head a node, takes as many passes as it has links, the square of its length;
  the chains of owners of Cluster API are a few levels deep.
- Decided while implementing the second part: the first loads of the read wait
  for the first load of the store of the Clusters itself, never for that of
  whatever store the read has built, which a case of the read pins with the
  host registering the API of the Machines alone at first.

- Decided while implementing the second part, after its reviews, where P17 and
  P19 give the error boundaries: what the page computes is computed inside
  them. The page renders its header, the title, the search, how many nodes
  match and the refresh, and, inside the boundary of the tree, a child that
  builds the tree, evaluates the model, counts, searches and gives the
  notices, and draws them, the tree and the drawer, so that an error there
  leaves the header, with the error page in the place of the tree; the child
  tells the header how many nodes match. The drawer computes the details of
  its node inside a boundary of its own, keyed by the node, so that an error
  there leaves the tree, and takes its title from the address alone; it goes
  with the tree when the tree fails. Two cases plant a throw, one in the tree
  and one in the details of a node.
- Decided while implementing the second part, after its reviews, where P19
  and P23 do not say in which namespace a node that the tree does not hold can
  still be loading: in the one where the tree reads its kind alone, that of
  the Cluster, or, for the ClusterClasses, the one that the class reference of
  the Cluster names now, and in no other (P6). There the details show the
  spinner while the first load of that kind runs. In any other namespace they
  never do: an object named there is not read, "Not read: the tree of the
  Cluster `<namespace>/<name>` reads no `<noun of the kind>` in the namespace
  `<namespace>`", or, for one that was there, as the class whose reference
  names another namespace now, no longer in the tree (`addressKindRead` of
  `cluster-tree.ts`). They name the object as its row would, with its
  namespace for an address of four parts.
- Decided while implementing the second part, after its reviews, where P23
  keeps the details of an object that goes open: when the Cluster goes, every
  object of its tree goes with it, and the details that are open stay, saying
  that their object is no longer in the tree, until the user closes them.
  While the Clusters of its namespace cannot be read, refused, failed, or not
  read again after a refresh, the drawer goes with the tree, whose place says
  why, since what the tree held is not known then.
- Decided while implementing the second part, after its reviews, where P13
  moves the scroll of the list in a layout effect: the page reads the offset
  of the list's element before React changes the rows, in
  `getSnapshotBeforeUpdate` of a class component that renders nothing, since
  Chromium clamps that offset to the shorter list once rows go at its end, and
  takes the first row in view from that offset, never from the clamped one;
  then, in the same commit and before the paint, it sets the scroll to that
  offset moved by the height of the rows inserted or removed above that row.
  Taken from the clamped offset, rows removed while the user sits at the
  bottom of the tree moved the rows in view a second time, which a case of the
  page shows on a list that clamps its scroll as Chromium does.
- Decided while implementing the second part, after its reviews, where P15 is
  silent on what the user expands or collapses during a search: it acts on what
  the search shows, at once, against what the search expands, so that a node
  that the user expands shows every node under it, those that match or not,
  and one that the user collapses none (`toggledInSearch` and `rowsOf` of
  `tree-rows.ts`); the expansions of the user are not changed, and come back
  as they were once the search is cleared, and other words start a search of
  their own, with nothing expanded or collapsed by the user. Before, a click on
  the button of a node, Right or Left changed the expansions of the user
  alone, which nothing showed until the search was cleared.
- Decided while implementing the second part, after its reviews, as P15 means
  the focus that goes to the tree: the page gives it to the element of the
  tree as that element is drawn, once the first loads have ended, with
  `preventScroll`, unless a control holds the focus, as the search in which
  the user typed while the tree loaded. Before, it stayed on the body, and Tab
  reached the search and the refresh first.
- A fact of the host seen in Freelens 2.1.0, after the probe, which settles
  the role that P18 left open: between the element with the role `treegrid`
  and a row, the host puts the element of the `Table`, `div.Table`, and that
  of its virtual list, `div.VirtualList`, with no role, and the element of the
  list that scrolls, `div.list`, with the role `list`, so the rows sit in a
  list for assistive technology. The session of the screenshots of the second
  part, run in Freelens dev 2.1.0 in both variants of the theme `freelens` on
  a branch that is no part of this spec, read it in the DOM, by the roles of
  the elements between the element of the tree and a row; it did not read the
  tree of accessibility.
- Decided while implementing the second part, after that run: the fallback of
  P18 applies. The element of the tree owns the rows that the virtual list
  draws by `aria-owns`, which names their ids in their order in the document;
  the page names them again whenever the list draws a row or takes one away,
  from the reference on an element of each row, since the list draws other
  rows on a scroll with no render of the page, and it alone writes the
  attribute, which React does not render (`ownedRows` of `tree-keys.ts`). The
  check in the tree of accessibility of the frame, through CDP, that each row
  drawn is a row of the treegrid, at its level, with its cells as gridcells,
  and the header a row of columnheaders (Tests, "In Freelens", step 5), is
  left to the session of the third part, which also says whether the element
  with the role `list`, left with no row, stays in that tree.
- Decided while implementing the second part, after its reviews, so that the
  code follows the note above on P18: once a change of the reads removes the
  active node from the tree, the nearest node above it that the rows show
  becomes active, above it in the tree in which the page last showed it, whose
  nodes above the active node the page keeps from one render to the next, and
  the next key move starts there; the code gave the root.
- Decided while implementing the second part, after its reviews, in place of
  what the note above on the cell Replicas says of the contract `v1beta1`: a
  control plane at the contract `v1beta1` is counted by the fields of that
  contract, `spec.replicas`, `status.replicas`, `status.readyReplicas`,
  `status.updatedReplicas` and `status.unavailableReplicas`, which names no
  available replicas: the cell and the details count its available Machines as
  the Cluster counts them, the desired less the unavailable ones, none below 0,
  and none while either is not written
  (core/reconcilers/cluster/cluster_controller_status.go:150-159), and the
  tooltip says so, as "Available: 2 Machines, the desired less 1 unavailable";
  its up to date Machines are `status.updatedReplicas`
  (internal/contract/controlplane.go:212-261). The unit object of that
  contract holds its fields alone.
- Decided while implementing the second part, after its reviews: the cell
  Replicas of Workers, the counters that the Cluster keeps of its workers,
  says in its tooltip, as the list says it, that a MachinePool of the Cluster
  has no Machines and that its counters count the instances of its provider,
  from the result of the Cluster (`poolsWithoutMachinesOf` of `context.ts`,
  which the list uses too; SPEC-0004, P8).
- Decided while implementing the second part, after its reviews, where P17
  gives a MachineHealthCheck its targets as links: a target that the tree does
  not hold, a Machine gone since the MachineHealthCheck wrote `status.targets`,
  or one whose kind could not be read and that no row holds, is its kind and
  its name as text, with why in its tooltip in the words of P12, as the details
  of a Cluster show a reference that opens nothing (SPEC-0004, P18); the
  details dropped it, with no word.
- Decided while implementing the second part, after its reviews, where P18
  shows the outline of the row of the active node "while the element has the
  focus": the stylesheet draws it on `:focus-visible` of the element of the
  tree, so the browser shows it when the focus came from the keyboard or a key
  acts in the tree, and not after a click of the mouse until a key is pressed,
  as it shows the focus of a control of the host (browser behavior, not in
  these sources); after a click, the hover and the selected row of the host
  show where the user is, and the outline says where the keys act once they
  are used. So does the focus that the page gives the tree as it is drawn,
  after the click that opened the page.
- Decided while implementing the second part, after its reviews: the line of
  "Tests", "Unit", for `cluster-details-v1beta2.test.tsx` that asks for "an
  owner of Cluster API" as a button that opens the tree at its node is not
  followed. The owners of a Cluster stay text in the drawer of the page of the
  Clusters, in the panel in the details of the host and in the details of the
  root, as SPEC-0004, P32 has them: the tree of a Cluster holds the objects
  under it, never an owner of the Cluster, so such a button would name no node
  of that tree. The owners in the details of every other node link to their
  nodes when the tree holds them, as P5 says, and an owner that is the Cluster
  to the root (the note above on P5 and P17).
- Decided while implementing the second part, after its reviews, where P2 and
  P15 are silent on a node that the address names while the search holds
  words, as a link of the details names it: it is shown among the rows of the
  search, active and scrolled to, with the nodes above it, those that the
  search hid joining the nodes that it expands, as the nodes above a match do,
  and one that the user collapsed during the search expanded again; the nodes
  above it that the rows show expanded stay as they are, so nothing that the
  user expanded closes, the count of the matches stays the search's own, and
  other words start a search with nothing added (`revealedInSearch` and
  `withReveals` of `tree-rows.ts`). Before, the node was shown in the
  expansions of the user alone, which the search does not show: its details
  opened with no row, and the first match of the search became the active node.

From the maintainer's decision of 2026-11-26 (SPEC-0001, "Notes and
deviations"), the sessions in Freelens run on 2.1.0 alone; what a rule of this
spec says of 2.0.0 stays a fact of the host, as probed then.

- Amended by SPEC-0028, P13: the TenantControlPlane of a KamajiControlPlane is
  no node (P8), the last rows of P7 leave it out, and its kind, which is no kind
  of the tree, makes no node when its read is refused or fails at its first
  load, or is held back after a refresh that failed, unlike a kind of P12; the
  tree reads the TenantControlPlanes for the row Tenant of the details of a
  control plane (P6, P17), through a store that the read of one Cluster builds
  once its first loads have ended, their kind being none of those whose first
  loads the tree waits for (P13; SPEC-0028, P16); the notice of the tree for
  their kind says that the details of the node of the control plane show the
  tenant as text, with the reason, until it can be read, and names no node of
  it, an exception to the note of this spec on the words of the notices of the
  tree, those of `treeNotices` (SPEC-0028, P16); the tooltip of the cell of the
  activity says the note of SPEC-0028, P9, as in the list; the cell Replicas of
  a control plane and its details take the word of SPEC-0028, P10, and the
  versions in the details of its node follow SPEC-0028, P11 (P9, P17). The
  Kamaji sets of SPEC-0028 hold a control plane of a provider at the contract
  `v1beta2`, which "Notes and deviations" lists among the captures still
  missing: only the one at `v1beta1` stays missing.
