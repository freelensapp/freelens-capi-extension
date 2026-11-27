# Design

The design decisions of the Freelens extension for Cluster API, on top of the
directives of the Freelens extension kit, its `docs/design.md` at the version
that AGENTS.md names. They are what the views share. Each spec of a view
declares its own design and any departure, and updates this document in the
same pull request (kit, `docs/design.md`, "How it is enforced"). The first
view, the list and the details of Clusters, set the rules below
([SPEC-0004](../specs/SPEC-0004-clusters.md)); the tree of a Cluster added the
rules of a tree, of the details of every object of a Cluster, of the links
between them and of the reads of a view by its own kinds
([SPEC-0005](../specs/SPEC-0005-cluster-tree.md)); a Cluster with the control
plane of another provider added the word of counters that are not Machines,
the version that a control plane reports, the cause of an activity that cannot
be read, and the way to the tenant of a KamajiControlPlane, which the Kamaji
extension of the organization shows
([SPEC-0028](../specs/SPEC-0028-other-control-plane.md)); the later views add
theirs.
The facts behind them are in
[SPEC-0001](../specs/SPEC-0001-reconnaissance.md), and the rules of status in
[SPEC-0003](../specs/SPEC-0003-status-model.md).

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
  the controller of a provider or a class in another namespace than its Cluster
  in the list and the details of a Cluster, is left out, and the model notes it
  (SPEC-0004, P2). A view of one Cluster whose namespace the page does not read
  reads its Cluster and that namespace through stores of its own, of the model's
  class or of a generic class for the kinds of providers, never registered
  (SPEC-0004, P31), with the kinds of that view, which the read takes as a
  parameter: the details and the panel those of SPEC-0004, the tree its own,
  with its ClusterClass in the namespace that its reference names, which the
  tree reads too when it is another (SPEC-0005, P6). The read of the tree is
  never the source of the mounted page, which the panel would take (SPEC-0005,
  P6). Two views of one Cluster can then differ: the root of the tree rests on
  the gates of a class in another namespace, which its row in the list leaves
  out and notes unless the filter selects that namespace; so do its details
  and the panel, which take the reads of the page when those cover the
  namespace of the Cluster, and otherwise read with their own, which read that
  namespace alone; each takes the one model, with the inputs that its read
  gives, and the note of the model says which input is missing (SPEC-0004,
  P16, P31; SPEC-0005, P6). Whether the host follows the list, a page reads from
  the public `context` of one store of the model's class, built once in the
  frame and never loaded, registered or subscribed (SPEC-0004, P34).
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
  narrow window the columns of the domain give their room first, the class and
  the version before the others and the name last, through the classes of
  their cells, whose stylesheet gives the columns of state a minimum width, as
  small as cells of one line allow, and no shrink (SPEC-0004, P7, "Notes and
  deviations"). Each cell is one line: the marks of a cell sit side by side,
  with a note after them, all at the middle of the line, what does not fit is
  cut with an ellipsis, and the tooltip of the cell carries its whole content;
  no mark in a cell has a tooltip of its own, and no cell expands on a click
  (kit, `docs/design.md`, "Lists"; SPEC-0004, P12, "Notes and deviations"). A
  title of the head that its column does not hold is cut the same way, by a
  badge whose tooltip carries it whole. A list of a kind with no status shows
  no column of health or activity, and Deleting as the state of a row that is
  deleting (SPEC-0003, P16).
  - Activity: each activity, in a mark of its tone, with its state when it is
    not Progressing and its duration, in the order of the closed set of
    SPEC-0003, Replacing included (SPEC-0003, "The closed sets"). A control
    plane that has none of `RollingOut`, `ScalingUp` and `ScalingDown`, and its
    Cluster, stay Unknown, but while they are deleting, and are never read as
    Idle, and the model gives each, with that Unknown, the note
    `activities-not-written`: for that note alone, the tooltip of the cell says
    why, next to the activity Unknown, and the details say it among the notes of
    the model (SPEC-0003, P1; SPEC-0028, P9).
  - Condition: the word of the health in its tone, then the word "stale" when
    the health has a mark of freshness, and, for a Cluster, how many of its
    MachinePools are of unknown health, when one is (SPEC-0003, the rule of
    Cluster); the tooltip of the cell names each cause of stale and when it
    began (SPEC-0004, P12). N/A for an object with no health.
  - Status: the headline of the message of the condition that sums the object
    up, its reason when the message is empty, and N/A when the object has no
    such condition (SPEC-0004, P11). The headline is the first line of the
    message without its bullet, and, when that line is a subject with no words
    of its own, such as `* WorkersAvailable:`, the subject and the first line
    under it with words, both without their bullets: no headline starts with
    the bullet of the parser, which the tooltip keeps (SPEC-0004, "Notes and
    deviations", decided under the delegation for M1). For a kind whose summary
    is not a condition, such as a MachineSet, a MachinePool or a
    MachineHealthCheck (SPEC-0003, P9 to P11), the cell shows what the health
    of the object rests on as the model returns it: for a MachineSet, and a
    MachinePool with Machines or with none at 0 replicas,
    `<available> of <replicas> Machines available`; for a MachinePool without
    Machines and with replicas, the note of the model; for a
    MachineHealthCheck, `<healthy> of <expected> targets healthy`; for an
    IPAddressClaim that writes no `Ready`, the name of the IPAddress of
    `status.addressRef`; for a ClusterResourceSet, the headline of
    `ResourcesApplied`; and N/A, with the tooltip that the kind has no status,
    for a template, a binding and an IPAddress (SPEC-0005, P10).
  - Counts: a row that holds other objects, as a node of the tree, counts them
    after its own marks, in its cell Condition, worst first, in the order in
    which the columns of state sort: Unhealthy, Degraded and Unknown, then
    those not read and those not found, then Healthy, and last those with no
    health, as `12 objects: 1 Unhealthy, 1 not read, 10 Healthy`; the number of
    the stale ones of a health follows its count in parentheses, as
    `13 Healthy (2 stale)`, and the spinner of the host stands in their place
    while one of them still loads. It counts objects, never a row that is no
    object, which shows the counts alone, nor an entry of a binding. The counts
    are words of the cell, not a control: the row is the door (SPEC-0005,
    P11).
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
  the conditions, each with its weight (SPEC-0004, "The details"). The details
  of every other object of a Cluster show, in this order: the metadata of the
  host; its place, the node above it and the field by which it was found, or
  why no rule placed it; its status, as those of a Cluster show theirs; its
  facts, those of its kind and, for an object of a provider, the field of its
  contract that says it is ready and the link to the details of the host; and
  its conditions, each with its weight (SPEC-0005, P17).
- The phase is never a column. The details show it as the project writes it,
  with the remark that the project tells no software to decide on it where
  the type of the phase says so, as for a Cluster, a Machine and a
  MachinePool, and not for a MachineDeployment (SPEC-0004, P10; SPEC-0005,
  P17).
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
  known: not written yet, no managed topology, not set by the topology, a kind
  that keeps no replicas, a kind that has no status, an object that the view
  could not read, as a control plane whose version it takes from that object
  (SPEC-0028, P11), an object that is deleting, to which the model gives no
  health, with the stage of its deletion in its details (SPEC-0005, "Notes and
  deviations").
- The role of an object of a provider is said in the words of the closed set of
  SPEC-0003, the eight of `ProviderRole`: infrastructure cluster, control plane,
  infrastructure machine, bootstrap config, infrastructure machine pool, IPAM
  pool, remediation request, template (SPEC-0003, P15; SPEC-0005, P9). The role
  of an object of Cluster API is its kind.
- An object is of Cluster API when its group and its kind are among the kinds
  of SPEC-0001, R1, the `Provider` of `clusterctl` and the seven kinds of the
  operator included (SPEC-0001, A12): every kind of `cluster.x-k8s.io`,
  ClusterResourceSet and ClusterResourceSetBinding, KubeadmConfig and
  KubeadmConfigTemplate, KubeadmControlPlane and KubeadmControlPlaneTemplate,
  IPAddress and IPAddressClaim, ExtensionConfig, Provider of
  `clusterctl.cluster.x-k8s.io`, and the kinds of `operator.cluster.x-k8s.io`.
  None of them ever gets the link to the details of the host (SPEC-0001, A7).
  Any other kind is of a provider, one in the same groups included (SPEC-0005,
  P5).
- An object that a view cannot read says "Not read." and why, or that it is
  not found when its namespace, which was read, does not hold it; in its cells
  of Activity and Condition it reads "Not read" or "Not found", never N/A,
  which says that a kind has no status, and in its cell Status the reason
  (SPEC-0004, P18; SPEC-0005, P12).
- Counters name their kind and their unit: desired, current, ready,
  available and up to date, each with the word of what is counted. A cell of
  counters shows the available of the desired, as `2/3`, with every counter in
  its tooltip (SPEC-0004, P8). The counters of a control plane carry the word
  of what it counts, as far as the view knows it. A KubeadmControlPlane counts
  Machines, by its kind, whether its object was read or not, with no spinner
  for the word, and so do the control plane Machines of a Cluster with no
  control plane reference. A control plane of another kind shows the spinner
  of the host in the place of its counters while its own object still loads,
  then Machines when that object has `spec.machineTemplate`, which the
  contract asks of a control plane of Machines, and replicas when it has none
  or when the view could not read it, since replicas is the word of the
  contract and claims nothing of what a replica is. The count of each version
  of the control plane takes the same word (SPEC-0028, P10).
- A version is the one that the project gives the object. A Cluster with no
  version in its topology and none copied from its control plane shows the one
  that its control plane reports, its `status.versions`, else its
  `status.version`, as the project reads it, an empty one being no version;
  `status.version` is a field that the contract deprecates, which the details
  say with the label "deprecated" after the field, and a cell of a list in its
  tooltip, never in the cell, where the label would read as a word on the
  version. The version of the topology, or one copied from the control plane,
  shows whatever the object of the control plane; the spinner takes the place
  of the version only when neither gives one and that object still loads
  (SPEC-0028, P11).
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
  (SPEC-0001, A7; SPEC-0004, P19). Its rows keep an empty cell of the menu,
  which lines them up with the header, where the host always renders one
  (SPEC-0004, "Notes and deviations"). The name of a row is a button that opens
  the details, so that the keyboard reaches them (SPEC-0004, P13), and it shows
  its focus, as the button of a Cluster named in a message does, with an outline
  in the token `--primary` of the theme inside its box, since the host resets
  the outline of every element (kit, `docs/design.md`, "Interaction and
  performance"; SPEC-0004, "Notes and deviations"). The search matches the
  fields that `getSearchFields()` of the host gives, which the page passes to
  the layout itself, and the words that the columns show (SPEC-0004, P14). The
  id of a list is a qualified literal, as `clusterApiClustersTable`, since the
  host keeps the sort of every list by its id in one place that every extension
  shares (SPEC-0004, P5).
- **The tree of a Cluster.** A page of its own, `cluster-tree`, with no entry
  in the sidebar, titled "Cluster Tree" with the name of the Cluster and its
  namespace as text, since the namespace badge would set a filter that the tree
  does not read, and two parameters: `cluster`, `<namespace>/<name>` of the
  Cluster, read as the parameter `details` of the page of the Clusters, and
  `details`, the node whose details are open, `<group>/<Kind>/<name>`, or
  `<group>/<Kind>/<namespace>/<name>` for a class in another namespace, which
  names one row. The history of the frame keeps the address; the host
  restores it neither when the frame loads again nor when the cluster connects
  again (SPEC-0005, P1, P2). Its header holds the search of the host, which
  takes no focus at first, and a refresh. The details of a Cluster open it from
  a row "Tree" and from their references to an object of Cluster API of the
  Cluster; the list of the Clusters opens it from nothing of its own
  (SPEC-0005, P1 to P5). Every node opens its details in the drawer of the host
  over the tree, as a Cluster opens its details over the list, and a click on a
  row, or an Escape in the empty search, while the details of the host are
  open over them closes those first (SPEC-0005, P15, P17).
- **The details of the extension.** The `Drawer` of the host, which the page
  renders over its list: its title, the copy of the name, its width and its
  closing are those of the host. It closes on Escape and on a click outside
  every drawer, which a click on a row does not reach. The details render
  inside an error boundary of their own, so that an error in them leaves the
  list. Closing them by their icon or by Escape gives the focus back to the
  name that opened them, and so does a click outside while the focus is still
  in the details or on the body, so that a click on another control keeps its
  focus (SPEC-0004, P15); over the tree, the focus goes back to the element of
  the tree once the row of the node is in view, since the host gives it
  nowhere (SPEC-0005, P17, P18). Their metadata are those of the host, with
  the owners that the tree holds as links to their nodes and the others as
  text, and the namespace as the namespace badge, whose click sets the global
  filter of namespaces to it and changes nothing of a view of one Cluster, each
  where the host puts it, since the host would link both to its own details
  (SPEC-0004, P32; SPEC-0005, P5, P17).
- **An address for the details.** The page of a kind has the parameter
  `details`, `<namespace>/<name>` of the object whose details are open, or its
  `<name>` alone for a kind that has no namespace, as ExtensionConfig
  (SPEC-0001, "R1. The surface"). Any view opens the details of an object by
  navigating to the page of its kind with it (SPEC-0004, P6). The objects of a
  Cluster other than the Cluster have the address of their node in the tree of
  their Cluster, each object one row, until a view of M2 gives their kind a
  page of its own, whose spec says where its references go (SPEC-0005, P2). A
  value that names no object has a state of its own, and reads nothing.
- **The details of the host.** The same content is the panel of the extension in
  the details of the host, at priority 250, so its order is 50: after the
  metadata of the host, without them, and before the custom resource section of
  the host and its events (SPEC-0004, P16). It shows its object from the stores
  that the view reads, and not the one that the host hands it, which follows
  only while a subscription of the host covers its namespace (SPEC-0004, P16,
  P31).
- **Between the objects of a Cluster.** A link opens the view of the extension
  for the kind of its target, at its details, when the extension has one; for an
  object of a provider, the details of the host, over those of the extension,
  which stay open under them (SPEC-0001, A6; SPEC-0004, P18). Both are a drawer
  of the host: one Escape closes both, and the close icon of the details of the
  host closes them alone. Over a list, after that Escape the focus goes back to
  the name that opened the details of the extension, which give it back once
  both have closed, whatever their order (SPEC-0028, P17). In the details of a
  Cluster, the references to its KubeadmControlPlane, its MachineDeployments,
  its MachinePools and its
  ClusterClass, which the maintainer decided on 2026-11-25 to keep as plain text
  until SPEC-0005 gave them details of the extension (SPEC-0004, P18), open the
  tree of that Cluster at their node, with its details, as the maintainer
  decided on 2026-11-26 (SPEC-0005, P5). So do, as SPEC-0005 proposes, the
  MachineSets and the worker Machines among the parts, every name in a message
  that names an object of Cluster API of the Cluster that the view read,
  MachineDeployments and MachinePools included, and the owners in the metadata
  that the tree holds (SPEC-0005, P5). In the details of a Cluster, its
  infrastructure cluster and a control plane of a provider keep the link to the
  details of the host, which SPEC-0001, A6 gives an object of a provider; in the
  tree, their node opens the details of the extension, which carry that link
  (SPEC-0005, P5). An owner that the tree does not hold stays text, its kind and
  its name: one of Cluster API, whose details of the host hold their menu
  (SPEC-0001, A7), and one of a provider whose kind the tree does not read, such
  as an IPAM pool, which has no version for a link (SPEC-0001, A2); the
  namespace stays the namespace badge (SPEC-0004, P32). Inside the page of the
  tree, a link to an object of the Cluster selects its node and opens its
  details there. A name in a message opens something only when the view read its
  target (SPEC-0004, P18). Nothing of the extension opens the details of the
  host, with their menu, for an object of Cluster API or for a Namespace
  (SPEC-0001, A7). A click on a link stops at the link, so that a row does not
  open its details as well. The view of one Cluster reads its objects in its
  namespace, whatever namespaces the filter selects (SPEC-0001, A13; SPEC-0004,
  P31), and the tree reads its ClusterClass in the namespace that its reference
  names (SPEC-0005, P6).

## Links to the objects of providers

- A reference of the contract, group, kind and name, is resolved to the
  version that the contract label of the definition of its kind gives, with
  the parser of SPEC-0003, and to the plural of that definition (SPEC-0001,
  A2; SPEC-0003, "Contract label"). The definition comes from the store of
  definitions of the host when it holds it, and otherwise from a GET of that
  one definition by its name (SPEC-0004, P3).
- The link opens the details of the host for the object at that version, when
  the object is in the store that the view read (SPEC-0001, A6): in the details
  of a Cluster, from its reference, and in the tree, from the details of the
  node (SPEC-0005, P5). A version is never guessed, and never `v1`, which the
  link helper of the host would assume (SPEC-0001, R7.19).
- A reference that cannot be resolved is text, `Kind name`, with its group in
  its tooltip, and the tooltip and the details say why: its definition cannot
  be read, with the permission it takes, `get` on that definition
  (SPEC-0001, R6.5); its definition names no version that the parser knows
  (SPEC-0003, P26); the cluster serves no such kind; or the object does not
  exist.

## The tenant of a KamajiControlPlane

The TenantControlPlane of Kamaji is the one kind of another project that the
extension reads, by the exception to SPEC-0001, A2 and A3 that the maintainer
decided on 2026-11-26 for that kind alone: at
`kamaji.clastix.io/v1alpha1`, its name, its namespace and its owner
references, only while the Kamaji extension of the organization is enabled,
and never its Secrets (SPEC-0028, P16). It is no rule for another kind or
another project, which would need a decision of its own.

- The tenant of a KamajiControlPlane is found as the provider makes it: by its
  name, its namespace and its owner reference with the flag of controller, the
  name alone never enough (SPEC-0028, P14).
- It is read, and linked, only while the Kamaji extension is enabled, as
  `Common.App.getEnabledExtensions()` of the extension API says, read in an
  observer so that the view follows the extension enabled, disabled or
  uninstalled with no reload: no page of the documents of the extension API
  describes a way to know it, and that member is the least fragile one that the
  API gives (SPEC-0028, P15, P16). Whether the cluster serves the kind comes
  from the store of definitions of the host, or, for a user who may not list the
  definitions, from the APIs that the host registers from the discovery of the
  cluster, with no request, and no definition of Kamaji is read by its name
  (SPEC-0028, P16, P17).
- The link opens the details of the host for the tenant, where the Kamaji
  extension registers its panel, over the details of the extension, as the
  link to an object of a provider does (SPEC-0028, P17). While the Kamaji
  extension is not enabled, the tenant is text that says which extension shows
  it, with the name of its package in the text itself, and nothing of its kind
  is read, so that no permission is asked for it and no refusal of it is
  shown; no text says that the cluster serves no TenantControlPlane before the
  host knows the kinds that it serves (SPEC-0028, P16, P17).
- The tenant of a KamajiControlPlane whose deployment names a cluster of its
  own is text that says so, and no tenant is looked for, whatever the view
  reads of its namespace; nothing under that field is read, never the Secret
  of the kubeconfig that names that cluster (SPEC-0001, A3; SPEC-0028, P14,
  P17).

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

| State                         | What a view does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                       | The spinner of the list of the host, in the place of the rows, until the first load of a mount of the page has ended, and then while a load runs and no row is listed, never its empty list; in the details, the spinner in the place of a mark whose inputs still load; in a tree, the spinner in the place of the tree until the first load of every kind that it reads has ended, so that no row shows before its place is known (SPEC-0005, P13, P19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Empty                         | The empty list of the host, after a load of the namespaces of the filter with no failure and no row, under the title of the page and the filter of namespaces, which say what was looked for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Checking                      | That the view is checking whether the cluster serves Cluster API, while the host has not loaded its definitions (SPEC-0004, P20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Not installed                 | That the cluster serves the kind of the page in no version, from its definitions or from its discovery (SPEC-0004, P20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| An older Cluster API          | That the cluster serves the kind at `v1beta1` alone, which the extension does not read, and that `v1beta2` came with Cluster API v1.11 (SPEC-0004, P20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Restricted                    | In the place of the rows, when every namespace of a load of the kind of the page is refused: the kind, the message of each answer, which says where, the permission it takes (SPEC-0001, R6.4), and that the filter selects the namespaces that the user may read; "not counted" in the place of the count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Partial                       | The list, and over it, above the layout, a notice for each kind that could not be read, or could not all be read: the message of each answer, what reads Unknown or is noted because of it, and the permission it takes; with no row, the notice in the place of the rows, and "not counted"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Failed                        | In the place of the rows, when every namespace of a load failed, not all refused: that the kind could not be read, with the reason of each answer; after a refresh that failed, that it could not be read again at its time, and why; in a view of one Cluster, a refresh that failed is said as one, never as Failed or Restricted, which say the first load (SPEC-0005, P23)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Stale                         | What the host shows: the mark of a cluster that it cannot reach, from Freelens 2.1.0, with the rows that the store keeps meanwhile, and the mark of the failures of its loads; the words of a refresh that failed, as Partial or Failed say; no copy of what was read (SPEC-0004, P26). A page with no list layout, as the tree, has no such mark, which the host draws in the header of its list layout alone (SPEC-0005, P19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Not followed                  | Above the layout, with rows or without, as an event of the past with its time: that the host read the list once over the whole cluster and does not follow it, why, and that a selection that leaves out a namespace is read and watched namespace by namespace (SPEC-0004, P34)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Not found                     | In the details whose address names an object that is not in its namespace, once the page or the view itself has read it, or whose namespace cannot be read: which of the two, and, for the second, the permission it takes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| An address with no object     | In the details, that the value of the parameter `details` is neither `<namespace>/<name>` nor, for a kind that has no namespace, `<name>` alone, as written; in the tree, that `cluster` names no Cluster, or `details` no node, as written (SPEC-0005, P2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| An object that cannot be read | In a tree, its row made from the reference that names it, or from the owner reference of an object that it owns: its kind and its name as text; "Not read", or "Not found" for an object that its namespace, which was read, does not hold, in its cells of Activity and Condition, never N/A; and in its cell Status the reason, in the words of SPEC-0004, with "Not read." and the message of each answer and the permission it takes in the tooltip; its details say the same. An object whose owner cannot be read sits under the row of that owner, made from its owner reference, which sits where an object read names the owner, as a control plane under the Cluster, and else under the node of its kind. A kind that cannot be read, a kind of a provider whose definition cannot be read included, is a node of its own under the root, named by the noun of the kind, which says the same, and, in its cell Status after the reason, for a kind whose objects name the kinds of the providers, the Machines, the MachineDeployments, the MachineSets, the MachinePools and the control planes, that the objects that only that kind names are not read either, and, for a kind of a provider whose definition cannot be read, that its objects are not shown, the whole text in its tooltip; an entry of a binding that cannot be read says "Not read", never that it is in no binding (SPEC-0004, P18; SPEC-0005, P7, P12) |
| A render error                | The error page of the template, in the place of the page, or of the details alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

A refusal is never an empty list, and a kind that the cluster does not serve
is never a refusal.

## A tree of objects

The rules of a view that shows objects under the objects that hold them, as the
tree of a Cluster does (SPEC-0005):

- **The component.** The `Table` of the host, `selectable`, which draws the
  hover and the selected row as the host draws them and adds no checkbox, with
  virtual rows, one row for each node shown, every row of one line, so that the
  host draws only the rows that the window shows. The page, the element around
  the table, the `Table` and its virtual list form a chain of flexible boxes,
  each with `min-height: 0`, as the list layout of the host gives its own,
  without which the list draws every row and never scrolls; and the content of
  every cell sits in an element that cuts it with an ellipsis, since the cell
  of the host cuts its text with none. Neither the list layout of the host, the
  list of one kind, whose store, sort and search would reorder and cut a
  hierarchy, nor its `TreeView`, which renders every child of a group whatever
  its state, holds no columns, answers to the pointer alone and keeps the state
  of a group to itself (SPEC-0005, P9).
- **The columns.** Those of a list of the extension, Name first and the columns
  of state after those of the domain (SPEC-0004, P7); N/A, with its reason in
  the tooltip, where a column does not apply to a node; "Not read" or "Not
  found" in the cells of Activity and Condition of a node that cannot be read,
  and the reason in its cell Status (SPEC-0005, P9, P12).
- **A node.** Its indentation is one step of the spacing of the host for each
  level; a node with children has a button, with the icons `chevron_right` and
  `expand_more`, whose click stops at it; its kind and its name are a button
  that opens its details; neither takes a stop of Tab, nor the focus on a
  press of the mouse, and their click gives the focus to the element of the
  tree, so that no scroll unmounts it with their row. An object of a provider
  shows its role in a small flat badge after its name, with no background, so
  that it does not read as a mark of the tone Unknown, and that never expands;
  it reads as plain text. A row with no details, a virtual node that holds the
  objects of one role or stands for a kind that cannot be read, or an entry of
  a binding, shows its words as text and the counts of what it holds, and a
  click on it leaves the details as they are (SPEC-0005, P9, P11, P12).
- **Where each object goes.** Each object is one row, never merged with another
  and never left out for its state: under its controller, matched by group,
  kind and name, never by a label whose value can be a hash; a control plane
  Machine under the control plane, whatever its owner; an object that a
  reference names under the object that names it, a template under the highest
  object that names it, the control plane, then the MachineDeployment, the
  MachineSet and the MachinePool, and of two of one kind the first by name, the
  details of the others linking to its row; an object whose owner is a node
  other than the Cluster, under that owner; an object whose owner is of a kind
  that cannot be read, under the row of that owner, made from its owner
  reference, which sits where an object read names the owner, as a control
  plane under the Cluster, and else in the node of that kind, never as an
  absence; and every other object of the Cluster under a node of its own,
  Other objects, with the reason (SPEC-0005, P7, P12). A field of a contract
  that the object does not have, as the machine template of a control plane
  that keeps no Machines, is no node and no node not found; the
  TenantControlPlane of a KamajiControlPlane, which the view reads only for the
  row Tenant of its details, is no node, and neither is its kind when it cannot
  be read, whose notice names no node; the tree waits for no first load of it,
  which the row Tenant alone shows (SPEC-0028, P13, P16).
- **The order.** The roles in a fixed order, then the nodes of the kinds that
  cannot be read, in the order of the rules that place their objects and, for
  one rule, by name, and the nodes of one kind by their names, never by their
  state, so that no row moves when its state changes (SPEC-0005, P14).
- **What is expanded.** No row before the first load of every kind has ended;
  at first, every node at or under which an object needs a look: Unhealthy,
  Degraded or Unknown, an activity other than Idle and Paused, a pause by its
  own annotation, a mark of freshness other than Paused, or not read; computed
  once; then only the user expands and collapses, and each choice is kept while
  the view shows the same root. Rows inserted or removed above the rows in view
  leave those rows in place: the view moves the scroll of the list by their
  height once they change and before the paint, since the list keeps its
  offset; an expansion, a collapse and a search move no row and scroll nothing
  (SPEC-0005, P13).
- **The counts.** Words of the cell Condition, worst first, objects alone, as
  "Counts" says above; the row is the door (SPEC-0005, P11).
- **The search.** It keeps the nodes that match the words that their rows show,
  their version and the words of their cell Status included, and no field that
  no row shows, the namespace that every row shares and the counts left out,
  with the nodes above them, expanded, says how many match, gives the
  expansions of the user back once it is cleared, and takes no focus when the
  page opens; an Escape in it clears its words, or, when it holds none, closes
  the details, those of the host first while they are open over those of a
  node (SPEC-0005, P15).
- **The scroll.** The view scrolls the list on a key move, an address, the
  closing of the details, and to keep the rows in view in place when rows are
  inserted or removed above them, and never otherwise, so the active node may
  leave the view until the next key move. It gives the virtual list of the
  host its `selectedItemId` in the render that follows a key move, and in its
  first render for the row of an address, and clears it once the list has
  scrolled to that row, since the list scrolls to it at every render; and it
  sets the scroll of the list itself for a row that a move leaves partly in
  view and for the row of an address, which the list leaves half hidden at its
  first mount (SPEC-0005, P2, P16).
- **The keyboard.** The tree is one stop of Tab, an element around the table
  with the role `treegrid`, since it has columns and a header row, which takes
  the keys and prevents their default, and names the active row in
  `aria-activedescendant` once that row is drawn, and no row while it is not;
  each row carries the role `row`, an id, `aria-level`, `aria-selected`, and
  `aria-expanded` when it has children, and each of its cells the role
  `gridcell`, and the header row the role `row` with cells of the role
  `columnheader`, spread on the row, the head and the cells of the host, or on
  an element of the extension's own inside them where a release drops them. A
  press of the mouse on a name or on a button that expands moves no focus into
  the row, and the click gives the focus to the element, with `preventScroll`.
  Down and Up, Home and End, Page Up and Page Down move; Right expands, or goes
  to the first child; Left collapses, or goes to the node above; Enter and
  Space open the details, or expand or collapse a virtual node or the node of a
  kind, and do nothing on an entry of a binding; Escape closes the details,
  with the focus back on the element. A move first brings its row into view.
  The focus stays on the element when the active row leaves the window. When
  the rows no longer show the active node, a search makes the first node that
  it matches active, with no scroll, and a collapse or a change of the reads
  the nearest node above it that the rows show, else the root. The keys act
  only while the focus is in the tree (SPEC-0005, P18, "Notes and
  deviations").
- **Live.** The view follows the watches of its stores and polls nothing; its
  header holds a refresh that reads its stores again, which keep their rows
  while it loads, as the reload after a 410 does: a refresh that fails is said
  as one, with its time, and its kind is held back. The refresh is disabled,
  with a tooltip that says why, while a first load of a kind runs, also of a
  kind that a reference names later, since a refresh would end it (SPEC-0005,
  P23).

## What the details never show

The details of a KubeadmConfig, a KubeadmConfigTemplate, a KubeadmControlPlane,
a ClusterClass, a Cluster and of every object of a provider leave the
annotations out of the metadata of the host, through `hideFields`, and show
them in a row of their own, every annotation but
`kubectl.kubernetes.io/last-applied-configuration`, whose presence alone they
say: the host shows that annotation, which copies the spec of an object applied
with `kubectl apply`, and the spec of these kinds can hold the fields that
SPEC-0001, A3 never shows (SPEC-0001, R3.36; SPEC-0005, P20). The host, which
the extension cannot change, still shows it: in the details of the host of an
object of a provider, to which the link of SPEC-0001, A6 leads, and, for a
Cluster, in its metadata in the drawer of the host that holds the panel of the
extension, just above the panel (SPEC-0005, P20).

The details of a ClusterClass and of a Cluster show the names of the variables
and of the patches, never their values, which can carry the fields of
SPEC-0001, A3 and whatever a user writes there. One function of
`src/common/views/` reads the variables and the patches, for their names alone,
and no other module of a view reads them, which the check of Safety asserts
(SPEC-0005, P20).

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

| Directive of the kit                                                                                                                                                                             | This extension                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                                                                  | Decided in                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| A list shows state in two columns ("Status")                                                                                                                                                     | Three: Activity, Condition, Status                                                                                                                                                                                                                                   | The status model keeps the activities apart from the health, and the activity sets the tone of the health, so they stand side by side                                                                                                                                                                                                                                | SPEC-0004, P7                 |
| What the host already renders is not rendered again ("Details")                                                                                                                                  | In the details of the host, the counters and the conditions show twice: in the panel of the extension and in the section of the host                                                                                                                                 | The host's section cannot be taken away, and its badges paint a negative condition at rest as an error; the panel carries the weights and the notes                                                                                                                                                                                                                  | SPEC-0004, P16                |
| Pending, waiting and in progress take `--colorWarning` ("Status")                                                                                                                                | The tone of progress takes `--colorInfo`; `--colorWarning` is kept for a warning past a threshold and for Blocked                                                                                                                                                    | The warning of a change that has lasted too long must stand apart from progress, and the words carry the meaning                                                                                                                                                                                                                                                     | SPEC-0003, P31                |
| Only real timestamps; a time that makes no sense is unavailable ("Status")                                                                                                                       | A start before the creation of the object counts from the creation, and a start after the clock of the desktop gives zero                                                                                                                                            | The times of a condition come from the clock of a controller and the creation from that of the API server; the host shows zero for a start in the future                                                                                                                                                                                                             | SPEC-0003, P34                |
| Stale keeps the last data, with their time and the failure of the refresh ("States that are not the happy one"); nothing important only in a tooltip ("Interaction and performance")             | Stale as the host shows it: its mark of a cluster that it cannot reach, in a tooltip with no time, from 2.1.0; a refresh that failed keeps no data, and the page says when and why                                                                                   | The page reads through the subscription of the host and reads no protected member of a store; these are the signals that the host gives                                                                                                                                                                                                                              | SPEC-0004, P26                |
| A reference to another object is a link when its target exists ("Details")                                                                                                                       | In the details of the extension, the namespace of an object is the namespace badge, which selects it in the filter, and an owner of Cluster API that the tree does not hold is text; so is an owner of a provider whose kind the tree does not read, as an IPAM pool | The metadata of the host would link them to its own details, with their menu and the Delete of a Namespace, which SPEC-0001, A7 keeps away; the owners that the tree holds link to their nodes from SPEC-0005; the tree reads neither the kind nor the definition of such an owner of a provider, so it has no version for the link of SPEC-0001, A6 (SPEC-0001, A2) | SPEC-0004, P32; SPEC-0005, P5 |
| Stale keeps the last data, with their time ("States that are not the happy one")                                                                                                                 | The page of the tree has no mark of a cluster that cannot be reached                                                                                                                                                                                                 | The host draws that mark in the header of its list layout alone, from a dependency that the extension API does not give, and the tree has no list layout                                                                                                                                                                                                             | SPEC-0005, P19                |
| A list inside an ad hoc view is still the list of the host ("Ad hoc views"); a list stays live through the subscription of the layout of the host, not a reader of the extension's own ("Lists") | The tree is the `Table` of the host, not its list layout, and stays live through the reads of a view of one Cluster, stores of its own that it loads and watches                                                                                                     | A tree of many kinds is no list of one kind: the store, the sort and the search of the layout would reorder and cut the hierarchy; the reads of SPEC-0004, P31 say every refusal and failure of their loads, and the refresh of the tree reads again what a watch can lose                                                                                           | SPEC-0005, P6, P9, P23        |
| Live data are polled at an interval that the panel shows, with a manual refresh ("Interaction and performance")                                                                                  | The tree follows the watches of its stores, with no interval, and has a manual refresh in its header                                                                                                                                                                 | The stores of the tree, its own, bring each change through their watches, as the stores of every view of the extension do; the refresh reads again what a watch can lose, as the reload after a 410 does                                                                                                                                                             | SPEC-0005, P23                |
| A reference to another object is a link when its target exists ("Details")                                                                                                                       | The IPAM pool of an IPAddressClaim and the remediation template of a MachineHealthCheck are text: their kind, their name and their group, and the role of the pool                                                                                                   | The tree reads neither, nor the definitions of their kinds, so it can tell neither whether they exist nor the version of a link, until the view of the pools in M2 and that of the remediations, SPEC-0013                                                                                                                                                           | SPEC-0005, P17                |
| Every tile and every mark is a door: a count opens the filtered list ("Ad hoc views")                                                                                                            | The counts of a node of the tree are words of its cell Condition, and no control: the row is the door, which opens its details or expands it                                                                                                                         | A count that opened something else would be a second target inside a row; the search of the tree keeps the nodes whose health is the word searched                                                                                                                                                                                                                   | SPEC-0005, P11                |
| A reference to another object is a link when its target exists ("Details")                                                                                                                       | The tenant of a KamajiControlPlane, which the Kamaji extension of the organization shows, is text while that extension is not enabled                                                                                                                                | Its view is the panel of the Kamaji extension in the details of the host; without it, nothing of this extension needs the tenant, and no permission on a kind of Kamaji is asked                                                                                                                                                                                     | SPEC-0028, P17                |
| A form the project has deprecated is shown with a label that says so ("Status")                                                                                                                  | The version that a control plane reports in `status.version` has the label "deprecated" in the details and in the tooltip of the cell of a list, not in the cell                                                                                                     | In a cell of one line the label would read as a word on the version, which is the version that the control plane runs                                                                                                                                                                                                                                                | SPEC-0028, P11                |
