# Design

The design decisions of the Freelens extension for Cluster API, on top of the
directives of the Freelens extension kit, its `docs/design.md` at the version
that AGENTS.md names. They are what the views share. Each spec of a view
declares its own design and any departure, and updates this document in the
same pull request (kit, `docs/design.md`, "How it is enforced"). The first
view, the list and the details of Clusters, set the rules below
([SPEC-0004](../specs/SPEC-0004-clusters.md)); the later views add theirs. The
facts behind them are in [SPEC-0001](../specs/SPEC-0001-reconnaissance.md),
and the rules of status in [SPEC-0003](../specs/SPEC-0003-status-model.md).

A path prefixed with `freelens:` is in Freelens at `v2.1.0`. The documents of
this repository are cited by their name, the specs by their number and rule,
as "SPEC-0003, P31", and the kit as `kit` with its file.

## The status model in lists and details

- Every view takes the status of an object from the two entry points of
  SPEC-0003, `statusOf` and `conditionsOf`, and adds no rule of status of its
  own. A count over several objects counts the results of the model, and a
  mark over several objects is one that the model computes (SPEC-0003, "How
  a view uses it").
- The context of the model is built from the stores that the view reads
  (SPEC-0001, A2), once for each change of the stores, through indexes by
  Cluster and by owner, and never row by row while a list renders (kit,
  `docs/design.md`, "Interaction and performance"). The key of a result holds
  the `uid` and the `resourceVersion` of the object and of every object of its
  context, the version of `controllers`, and the time that the result names
  (SPEC-0003, "How a view uses it").
- A page reads its stores as the host reads those of its own lists: the list
  layout of the host subscribes the store of the page and, as its dependent
  stores, those of the context, one load of the namespaces of the filter and its
  subscribe for each store, again when the filter changes (SPEC-0004, P19). Each
  store reaches the layout through one adapter, which passes the reads of the
  store, tells the page its loads and their failures, and selects nothing and
  removes nothing, so that no selection that the host keeps on its store reaches
  the page; the store of definitions is only read, never subscribed (SPEC-0004,
  P19). The page loads nothing itself, and its list has the limits of the lists
  of the host, which SPEC-0004 lists. A namespace is loaded once a load that
  includes it has ended in the mount of the page, whatever new mounts of the
  layout a new set of stores causes; after a load over the whole cluster that
  the host follows, a namespace that the filter adds while every namespace stays
  selected counts as loaded, since the host loads nothing for it and its watch
  brings its objects. Until a namespace is loaded, its rows are not listed and
  its objects are not given to the model; the list shows the spinner of the host
  until the first load of the page has ended, and then while a load runs with no
  row, never its empty list (SPEC-0004, P19). The rows and the context of the
  model take from each store its items in the namespaces loaded alone, since a
  store keeps those of a namespace that the filter no longer selects, unwatched
  (SPEC-0004, P19). An object of the context in a namespace that is not read, as
  the controller of a provider or a class in another namespace than its Cluster,
  is left out, and the model notes it (SPEC-0004, P2). A view of one Cluster
  whose namespace the page does not read reads its Cluster and that namespace
  through stores of its own, of the model's class or of a generic class for the
  kinds of providers, never registered (SPEC-0004, P31). Whether the host
  follows the list, a page reads from the public `context` of one store of the
  model's class, built once in the frame and never loaded, registered or
  subscribed (SPEC-0004, P34).
- An activity in progress changes the tone of an Unhealthy or Degraded health,
  never its word, and only within its threshold, counted from a start that the
  project wrote: past it, or with no start written, the tone is that of a
  warning (SPEC-0003, D2, P2, P34). The kit allows that softening for a bounded
  time counted from a time that the project wrote (kit, `docs/design.md`,
  "Status").
- An input that is still loading is not given yet: its mark shows the
  spinner of the host in its place, never Unknown. An input that cannot be
  read is not given either, and the model notes it (SPEC-0003, "What it takes
  and returns").
- A view evaluates the model with the time of the evaluation, and again at
  the earliest time that the result names, not at every tick (SPEC-0003,
  "What it takes and returns").
- A list of a kind with a status shows state in three columns, after the
  columns of the domain: Activity, Condition and Status (SPEC-0004, P7). In a
  narrow window the columns of the domain give their room first, through the
  classes of their cells, whose stylesheet gives the columns of state a
  minimum width and no shrink (SPEC-0004, P7). A list of a kind with no status
  shows no column of health or activity, and Deleting as the state of a row
  that is deleting (SPEC-0003, P16).
  - Activity: each activity, in a mark of its tone, with its state when it is
    not Progressing and its duration, in the order of the closed set of
    SPEC-0003, Replacing included (SPEC-0003, "The closed sets").
  - Condition: the word of the health in its tone, then the word "stale" when
    the health has a mark of freshness, whose tooltip names each cause and
    when it began (SPEC-0004, P12), and, for a Cluster, how many of its
    MachinePools are of unknown health, when one is (SPEC-0003, the rule of
    Cluster). N/A for an object with no health.
  - Status: the headline of the message of the condition that sums the object
    up, its reason when the message is empty, and N/A when the object has no
    such condition (SPEC-0004, P11). For a kind whose summary is not a
    condition, such as a MachineSet, a MachinePool or a MachineHealthCheck
    (SPEC-0003, P9 to P11), the spec of its view says what the cell shows.
- The columns of state sort worst first: the health Unhealthy, Degraded,
  Unknown, Healthy, then no health; the activities in the order of the closed
  set of SPEC-0003 by the first of a row, then Unknown alone, then Idle; a
  version by the order of the parser of SPEC-0003, one that it does not know
  last (SPEC-0004, P28).
- The details show, in this order: the health, the condition it rests on and
  the source of its tone, and, for a Cluster, how many of its MachinePools
  are of unknown health; the activities, each with its state, its start, its
  duration, its tone and what the project writes of it, such as the stage of
  a deletion or the form of a pause; each cause of freshness and when it
  began; the summary, with its message nested and the objects it names, as
  "Between the objects of a Cluster" shows them; the issues; the notes of the
  model; the phase; the parts of the object, each with its own status; and
  the conditions, each with its weight (SPEC-0004, "The details").
- The phase is never a column. The details show it as the project writes it,
  with the remark that the project tells no software to decide on it
  (SPEC-0004, P10).
- A form that the project has deprecated, such as the failure fields of
  `status.deprecated` or the phase `Failed`, shows with the label
  "deprecated" (SPEC-0001, A5; SPEC-0003, P6).

## Tones and their tokens

Each state takes the token of the theme that SPEC-0003 gives it (SPEC-0003,
P31):

| Tone                  | Token               | States                                                                                                                              |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Healthy               | `--colorOk`         | Healthy; the weight Ok                                                                                                              |
| Progress, and at rest | `--colorInfo`       | Unhealthy or Degraded in the tone of progress; an activity in progress within its threshold; the weights Activity and At rest; Idle |
| Warning               | `--colorWarning`    | Degraded in the tone of its health; Unhealthy or Degraded in the tone of a warning; an activity past its threshold, or Blocked      |
| Error                 | `--colorError`      | Unhealthy in the tone of its health; the weight Issue                                                                               |
| Stopped               | `--colorTerminated` | Deleting within its threshold; Paused; Rollout paused                                                                               |
| Unknown               | `--colorVague`      | Unknown health; the activity Unknown; an activity whose state is Unknown; the weight Unknown; a mark of freshness                   |
| None                  | No token            | No health: the text N/A                                                                                                             |

A mark is the `Badge` of the host. Its word keeps the color of the text of
the theme; its tone is a background that `color-mix` takes from the token,
and a border of the token. A mark of the tone Unknown keeps the background
that the host gives every badge, which is `--colorVague` itself
(freelens:packages/core/src/renderer/components/badge/badge.module.scss:34-39).
A token is never the color of a word: `--colorVague` and `--colorTerminated`
cannot be read as words on the content of the dark Freelens theme
(freelens:packages/core/src/features/theme/files/common/freelens.theme.yaml:31,
72, 73; SPEC-0004, P21). The words carry the meaning without the color.

No view authors a color, and none tells a dark theme from a light one: the
tokens do. Every view is checked in the dark and the light theme of Freelens
and in a theme that is not the default, such as its high contrast theme
(kit, `docs/design.md`, "Theme").

## Words

- The names of the closed sets are those of SPEC-0003: Healthy, Degraded,
  Unhealthy, Unknown; Deleting, Paused, Rollout paused, Provisioning,
  Upgrading, Rolling out, Scaling up, Scaling down, Remediating, Updating,
  Replacing, Idle, Unknown; Progressing, Blocked, Unknown, the states of an
  activity; Ok, Issue, Activity, At rest, Unknown; Paused, Older generation,
  Controller not available, Workload cluster unreachable (SPEC-0003, "The
  closed sets").
- An activity in progress reads its name and how long it has lasted, as
  "Rolling out 4m12s". One whose state is Blocked or Unknown adds that state,
  in the words of SPEC-0003, as "Rolling out Blocked 4m12s"; Progressing is
  left unsaid. An activity whose start the project did not write has no
  duration (SPEC-0003, P34).
- The words of the project are shown as it writes them, never humanized or
  reworded: kinds, names, condition types, reasons, messages, phases and the
  items of an annotation. A message keeps its lines, nested as the parser of
  SPEC-0003 gives them (SPEC-0003, P27).
- A missing value is N/A, with a tooltip that says why when the reason is
  known: not written yet, no managed topology, not set by the topology.
- Counters name their kind and their unit: desired, current, ready,
  available and up to date Machines. A cell of counters shows the available
  of the desired, as `2/3`, with every counter in its tooltip (SPEC-0004,
  P8).
- A yes or no is phrased so that Yes is the healthy answer, as "Initialized:
  Yes", and reads Unknown, never No, when the project has not said
  (SPEC-0004, P27; kit, `docs/design.md`, "Status"). A field that the project
  writes only as true, and leaves unset until then, reads No while it is unset
  on an object that has a status, and Unknown on one with no status yet, as
  "Provisioned" does (SPEC-0004, P27; SPEC-0001, R2.10).
- The word "stale" belongs to the marks of freshness of SPEC-0003. A read
  that failed says that it could not read again, when and why (SPEC-0004,
  P25).
- The root entry of the sidebar is "Cluster API". A page whose title would
  collide with one of the host is qualified with the word of the domain:
  "Workload Clusters" (SPEC-0004, P4). The details keep the kind, as the host
  writes it: "Cluster: <name>".
- A notice says what was looked for, what could not be read, the message of
  the answer as the cluster wrote it, and the permission it takes.

## Navigation

- **The sidebar.** One root entry, "Cluster API", with the icon of the
  extension: original, monochrome, with no fill of its own, and no logo of
  the project, whose use is under a trademark policy (SPEC-0001, C3). It
  shows on every cluster, so that a page can say why a cluster has nothing
  to show (SPEC-0004, P4). Its children are text only.
- **A page of a kind.** The list layout of the host, with no selection, no menu
  and no remove button of the host, whose details are those of the extension
  (SPEC-0001, A7; SPEC-0004, P19). The name of a row is a button that opens the
  details, so that the keyboard reaches them (SPEC-0004, P13). The search
  matches the fields that `getSearchFields()` of the host gives, which the page
  passes to the layout itself, and the words that the columns show (SPEC-0004,
  P14). The id of a list is a qualified literal, as `clusterApiClustersTable`,
  since the host keeps the sort of every list by its id in one place that every
  extension shares (SPEC-0004, P5).
- **The details of the extension.** The `Drawer` of the host, which the page
  renders over its list: its title, the copy of the name, its width and its
  closing are those of the host. It closes on Escape and on a click outside
  every drawer, which a click on a row does not reach. The details render
  inside an error boundary of their own, so that an error in them leaves the
  list. Closing them by their icon or by Escape gives the focus back to the
  name that opened them, and so does a click outside while the focus is still
  in the details or on the body, so that a click on another control keeps its
  focus (SPEC-0004, P15). Their metadata are those of the host, with the
  owners as text and the namespace as the namespace badge, which selects it in
  the filter, since the host would link both to its own details (SPEC-0004,
  P32).
- **An address for the details.** The page of a kind has the parameter
  `details`, `<namespace>/<name>` of the object whose details are open, or its
  `<name>` alone for a kind that has no namespace, as ExtensionConfig
  (SPEC-0001, "R1. The surface"). Any view opens the details of an object by
  navigating to the page of its kind with it (SPEC-0004, P6). A value that names
  no object has a state of its own, and reads nothing.
- **The details of the host.** The same content is the panel of the extension in
  the details of the host, at priority 250, so its order is 50: after the
  metadata of the host, without them, and before the custom resource section of
  the host and its events (SPEC-0004, P16). It shows its object from the stores
  that the view reads, and not the one that the host hands it, which follows
  only while a subscription of the host covers its namespace (SPEC-0004, P16,
  P31).
- **Between the objects of a Cluster.** A link opens the view of the
  extension for the kind of its target, at its details, when the extension
  has one; for an object of a provider, the details of the host, over those
  of the extension, which stay open under them (SPEC-0001, A6; SPEC-0004,
  P18). Both are a drawer of the host: one Escape closes both, and the close
  icon of the details of the host closes them alone. The references to the
  KubeadmControlPlane, the MachineDeployments, the MachinePools and the
  ClusterClass are plain text, their kind and their name, and open nothing,
  until SPEC-0005 gives them details of the extension, as the maintainer
  decided on 2026-11-25; so are the other objects of Cluster API that a view
  names, a MachineSet or a Machine among the parts or in a message (SPEC-0004,
  P18), and the owners and the namespace in the metadata (SPEC-0004, P32).
  Nothing of the extension opens the details of the host, with their menu,
  for an object of Cluster API or for a Namespace (SPEC-0001, A7). A click on a
  link stops at the link, so that a row does not open its details as well. The
  view of one Cluster reads its objects in its namespace, whatever namespaces
  the filter selects (SPEC-0001, A13; SPEC-0004, P31).

## Links to the objects of providers

- A reference of the contract, group, kind and name, is resolved to the
  version that the contract label of the definition of its kind gives, with
  the parser of SPEC-0003, and to the plural of that definition (SPEC-0001,
  A2; SPEC-0003, "Contract label"). The definition comes from the store of
  definitions of the host when it holds it, and otherwise from a GET of that
  one definition by its name (SPEC-0004, P3).
- The link opens the details of the host for the object at that version, when
  the object is in the store that the view read (SPEC-0001, A6). A version is
  never guessed, and never `v1`, which the link helper of the host would
  assume (SPEC-0001, R7.19).
- A reference that cannot be resolved is text, `Kind name`, with its group in
  its tooltip, and the tooltip and the details say why: its definition cannot
  be read, with the permission it takes, `get` on that definition
  (SPEC-0001, R6.5); its definition names no version that the parser knows
  (SPEC-0003, P26); the cluster serves no such kind; or the object does not
  exist.

## The states that are not the happy one

A page decides its state from the code of each answer, never from a text. The
adapters of its stores hand it the failures that the host reports with
`onLoadFailure`, of a load and of the reload after a 410 (SPEC-0004, P19). A
refused read throws, through the client of the host, the `Status` of
Kubernetes itself, whose `code` is 403
(freelens:packages/utility-features/json-api/src/json-api.ts:256-259): that
is a refusal. Any other failure is failed, its text shown as its reason and
never read. The page states what the failures and the rows say, and the
message of each answer, shown and never read, says where, over the whole
cluster or in which namespace (SPEC-0004, P25). A kind that the cluster does
not serve has no API, which the page tells before it reads (SPEC-0004, P20).

The states of the reads are drawn in the place of the rows of the list layout,
when no row is listed, or above the layout when rows remain. The header of the
layout stays: the title, the filter of namespaces, which is the way to other
namespaces, the search, and the marks of the host. The states before the list
have no store to read yet: they are drawn in the place of the layout, under the
title of the page (SPEC-0004, P25). When a read failed and no row is listed, the
count of the header reads "not counted", next to the marks of the host
(SPEC-0004, P25). A kind that could not be read in some namespaces of a load is
given to no object of those namespaces, which read Unknown with a note, and a
refresh that failed is said as an event of the past, with its time, until a
later read of the kind ends with no failure (SPEC-0004, P25). A list that the
host reads once and does not follow, a page says from that `context` (SPEC-0004,
P34); what the host tells no one, as a watch that the server refuses, a page
cannot say, and SPEC-0004 lists it.

| State                     | What a view does                                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                   | The spinner of the list of the host, in the place of the rows, until the first load of a mount of the page has ended, and then while a load runs and no row is listed, never its empty list; in the details, the spinner in the place of a mark whose inputs still load                                    |
| Empty                     | The empty list of the host, after a load of the namespaces of the filter with no failure and no row, under the title of the page and the filter of namespaces, which say what was looked for                                                                                                               |
| Checking                  | That the view is checking whether the cluster serves Cluster API, while the host has not loaded its definitions (SPEC-0004, P20)                                                                                                                                                                           |
| Not installed             | That the cluster serves the kind of the page in no version, from its definitions or from its discovery (SPEC-0004, P20)                                                                                                                                                                                    |
| An older Cluster API      | That the cluster serves the kind at `v1beta1` alone, which the extension does not read, and that `v1beta2` came with Cluster API v1.11 (SPEC-0004, P20)                                                                                                                                                    |
| Restricted                | In the place of the rows, when every namespace of a load of the kind of the page is refused: the kind, the message of each answer, which says where, the permission it takes (SPEC-0001, R6.4), and that the filter selects the namespaces that the user may read; "not counted" in the place of the count |
| Partial                   | The list, and over it, above the layout, a notice for each kind that could not be read, or could not all be read: the message of each answer, what reads Unknown or is noted because of it, and the permission it takes; with no row, the notice in the place of the rows, and "not counted"               |
| Failed                    | In the place of the rows, when every namespace of a load failed, not all refused: that the kind could not be read, with the reason of each answer; after a refresh that failed, that it could not be read again at its time, and why                                                                       |
| Stale                     | What the host shows: the mark of a cluster that it cannot reach, from Freelens 2.1.0, with the rows that the store keeps meanwhile, and the mark of the failures of its loads; the words of a refresh that failed, as Partial or Failed say; no copy of what was read (SPEC-0004, P26)                     |
| Not followed              | Above the layout, with rows or without, as an event of the past with its time: that the host read the list once over the whole cluster and does not follow it, why, and that a selection that leaves out a namespace is read and watched namespace by namespace (SPEC-0004, P34)                           |
| Not found                 | In the details whose address names an object that is not in its namespace, once the page or the view itself has read it, or whose namespace cannot be read: which of the two, and, for the second, the permission it takes                                                                                 |
| An address with no object | In the details, that the value of the parameter `details` is neither `<namespace>/<name>` nor, for a kind that has no namespace, `<name>` alone, as written                                                                                                                                                |
| A render error            | The error page of the template, in the place of the page, or of the details alone                                                                                                                                                                                                                          |

A refusal is never an empty list, and a kind that the cluster does not serve
is never a refusal.

## Time and duration

- An instant is the date component of the host, in the time zone that the
  user chose
  (freelens:packages/core/src/renderer/components/locale-date/locale-date.tsx:14-24).
- A duration is the duration component of the host, in its compact form,
  from its start, and it updates as time passes
  (freelens:packages/core/src/renderer/components/duration/reactive-duration.tsx:11-55).
  Its tooltip gives the instant of its start.
- An age is the age component of the host
  (freelens:packages/core/src/renderer/components/kube-object/age.tsx:10-25).
- A duration runs from the time that the project wrote for its start, and is
  never longer than the age of the object. It is `0s` while the start is
  after the clock of the desktop, as the host shows it
  (freelens:packages/utility-features/utilities/src/formatDuration.ts:55-61),
  and there is none where the project wrote no start (SPEC-0003, P34).
- A time that the parser of SPEC-0003 reads as Absent hides its row; one that
  it reads as Unavailable shows N/A, whose tooltip says that the project
  wrote a time that is not valid (SPEC-0003, P30).
- A threshold reads as a duration in the same form, as "a warning after
  10m".

## Departures from the kit

| Directive of the kit                                                                                                                                                                 | This extension                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                     | Decided in     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A list shows state in two columns ("Status")                                                                                                                                         | Three: Activity, Condition, Status                                                                                                                                                                    | The status model keeps the activities apart from the health, and the activity sets the tone of the health, so they stand side by side                                                                                                                                                   | SPEC-0004, P7  |
| What the host already renders is not rendered again ("Details")                                                                                                                      | In the details of the host, the counters and the conditions show twice: in the panel of the extension and in the section of the host                                                                  | The host's section cannot be taken away, and its badges paint a negative condition at rest as an error; the panel carries the weights and the notes                                                                                                                                     | SPEC-0004, P16 |
| Pending, waiting and in progress take `--colorWarning` ("Status")                                                                                                                    | The tone of progress takes `--colorInfo`; `--colorWarning` is kept for a warning past a threshold and for Blocked                                                                                     | The warning of a change that has lasted too long must stand apart from progress, and the words carry the meaning                                                                                                                                                                        | SPEC-0003, P31 |
| Only real timestamps; a time that makes no sense is unavailable ("Status")                                                                                                           | A start before the creation of the object counts from the creation, and a start after the clock of the desktop gives zero                                                                             | The times of a condition come from the clock of a controller and the creation from that of the API server; the host shows zero for a start in the future                                                                                                                                | SPEC-0003, P34 |
| A reference to another object is a link when its target exists ("Details"; `docs/review.md`, "The pre-review pass")                                                                  | Until SPEC-0005, a reference to an object of Cluster API that has no details of the extension is plain text, its kind and its name, and opens nothing                                                 | A link could only open the details of the host, whose menu SPEC-0001, A7 keeps away from the pages of the extension; decided by the maintainer on 2026-11-25 for the KubeadmControlPlane, the MachineDeployments, the MachinePools and the ClusterClass, proposed for the other objects | SPEC-0004, P18 |
| Stale keeps the last data, with their time and the failure of the refresh ("States that are not the happy one"); nothing important only in a tooltip ("Interaction and performance") | Stale as the host shows it: its mark of a cluster that it cannot reach, in a tooltip with no time, from 2.1.0, and none on 2.0.0; a refresh that failed keeps no data, and the page says when and why | The page reads through the subscription of the host and reads no protected member of a store; these are the signals that the host gives                                                                                                                                                 | SPEC-0004, P26 |
| A reference to another object is a link when its target exists ("Details")                                                                                                           | In the details of the extension, the owners of an object are text, and its namespace is the namespace badge, which selects it in the filter                                                           | The metadata of the host would link them to its own details, with their menu and the Delete of a Namespace, which SPEC-0001, A7 keeps away; for an owner of Cluster API until SPEC-0005, for the namespace for good                                                                     | SPEC-0004, P32 |
