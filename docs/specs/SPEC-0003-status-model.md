# SPEC-0003: Status model

- **Status:** Approved
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Reviewed project:** Cluster API `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`, and the Cluster API Operator
  `v0.30.1`, commit `2b43298`
- **Freelens:** 2.1.0, tag `v2.1.0`
- **Dependencies:** [SPEC-0001](SPEC-0001-reconnaissance.md),
  [SPEC-0002](SPEC-0002-test-environment.md)
- **Approval:** Approved on 2026-11-22 under the maintainer's delegation for
  the work inside M1, after four independent reviews; it is reviewed with
  the rest of M1 at its review, with the decisions D1 to D4

## Goal

Every view of the extension says the same of an object of Cluster API: its
health, what it is doing, how fresh that is, and how much each of its
conditions weighs. One set of pure functions computes it from the object as
its controller wrote it, and the lists, the details and the overview of the
next specs are built on them. An unknown value is shown as Unknown, never as
healthy. The health is always what the project says of the object, and a
change in flight is shown in flight: it changes only the tone of the health,
never its word.

## Upstream reference

The sources were read at the tag and commit of each. They are a reference
for behavior: no code, text or status logic is copied from them. The facts
come from SPEC-0001, which every rule below cites; where a rule needs a fact
that SPEC-0001 does not hold, it cites the source.

| Source                                  | At                        | Read for                                                                                                                                                                                |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubernetes-sigs/cluster-api`           | `v1.14.4`, `4356c154f4a7` | The condition types and reasons in `api/`, the code that writes status, `util/conditions`, the webhooks, and the contracts of the book in `docs/book/src/developer/providers/contracts` |
| `kubernetes-sigs/cluster-api-operator`  | `v0.30.1`, `2b43298`      | When the conditions of its seven kinds are written                                                                                                                                      |
| `freelensapp/freelens`                  | `v2.1.0`, `c4700f9`       | The component that shows a duration, to which the views hand the times                                                                                                                  |
| `freelensapp/freelens-velero-extension` | `v1.0.0`, `fd68262`       | Where an extension of the organization keeps its status model                                                                                                                           |

As in SPEC-0001, a path with no prefix is in `kubernetes-sigs/cluster-api`
at `v1.14.4`, and any other path is prefixed with the name of its source and
a colon. A rule that SPEC-0001 does not settle, or on which two of its facts
disagree, is marked "Proposed:" with its reason and the facts it rests on,
and numbered from P1 in the order the rules were first proposed, so that
the approval can confirm or reopen each one. A rule marked "Decided:" was
decided under the delegation for M1, while the milestone was under way, and
is numbered from D1. Every rule of either kind that adds to H1 to H3, or
departs from them or from the design rules of the kit, is listed again under
"Notes and deviations", for the review of the milestone, with why it stays
within them or why it departs.

## Scope

Included:

- The closed sets of SPEC-0001, H1 to H3, turned into the rule of each kind
  of R1 that has a status, of the objects of a provider that R1.15
  describes, and of the kinds with no status.
- What a change in flight changes: the tone of the health, never its word,
  with the thresholds past which progress turns into a warning, and the
  duration of every activity.
- The marks of freshness of H1: paused, an older generation, a controller
  not available, a workload cluster not reachable.
- The parsers of A4: the value of a contract label, the messages of
  conditions, Kubernetes versions, the annotations that hold lists, and the
  times.
- The tokens of the theme that each state maps to.
- Where the code lives, what it takes and returns, and how a view uses it.
- The unit tests, and S7 of SPEC-0001, tried on the real tier of SPEC-0002.

Excluded:

- Every view. The lists and details of Clusters (SPEC-0004), the tree
  (SPEC-0005), the overview (SPEC-0006) and the views of M2 use the model
  and say how they lay it out.
- Reading anything. The views read the objects through the stores of the
  host (A2) and hand them to the model.
- Any change to SPEC-0001: the model reads only what A2 and A12 let the
  views read.
- The health of an installed provider as a row of its own (SPEC-0016), which
  takes as an input the availability of controllers defined here.
- The events of the objects (SPEC-0017).
- What `v1.15` changes (R1.29 to R1.33), reasons and messages included: the
  drift watch at the start of a milestone brings it in.

## Design

### No view

This spec adds no page, panel, menu item or preference, and registers
nothing with the host: it is neither a standard nor an ad hoc view. It is
the classifier that the kit asks of each family of kinds: pure functions
from the object to small closed sets, covered by unit tests, with no markup
and no color in them (kit, `docs/design.md`, "Status"). The views that use
it declare their own design.

### Where it lives

Two folders of `src/common/`, each module with its test file next to it:

- `src/common/status/`: `types.ts`, `conditions.ts`, `health.ts`,
  `activity.ts`, `tone.ts`, `freshness.ts`, one module per family
  (`cluster.ts`, `cluster-class.ts`, `machines.ts`, `health-checks.ts`,
  `control-plane.ts`, `add-ons.ts`, `providers.ts`), and `index.ts`, which
  exports the two entry points.
- `src/common/parsers/`: `contract-label.ts`, `condition-message.ts`,
  `kubernetes-version.ts`, `list-annotation.ts` and `time.ts`.

**P35.** Proposed: the model lives in those two folders, for these reasons:

- `src/common/` holds code that uses only what both runtimes have, and the
  environment tests compile it in a program with neither the DOM nor Node
  (AGENTS.md, "Main, renderer and common" and "Environment tests"). A rule
  that reached for markup, the DOM or a Node module would fail the type
  check, and Biome rejects a Node module there too (AGENTS.md, "Biome"):
  the purity that the kit asks for is checked, not only promised.
- The renderer, where every view runs (A1), imports it, and so can the main
  process when a spec brings one.
- The extension of the organization that follows the kit keeps its status
  model there, with the fields it reads as plain-data types
  (freelens-velero-extension:src/common/phases.ts:1-2;
  freelens-velero-extension:src/common/types.ts:1-4).

`types.ts` holds, as plain data, the fields of each kind that its rule
reads, written from the schemas of the release as AGENTS.md asks ("Adding an
API"). The host hands a view instances of its own `KubeObject`, not of the
classes of the extension, and a method that a class of the extension defines
is not there (AGENTS.md, "CRD KubeObject Pattern"): the rules read the
fields of the object and call no method, so they are functions of the
object. Each spec that later adds the model of a kind adds a type test that
the model fits the input of its rule.

### What it takes and returns

Two entry points, in `index.ts`:

- `statusOf(object, context)` returns the status of one object: its health,
  with the condition it rests on and its issues; the tone of the mark of its
  health, with the activity that sets it (D2); its activities, each with its
  state, the start of its duration and its tone; its marks of freshness; its
  phase; and its notes.
- `conditionsOf(object, context)` returns its conditions, in the order that
  the controllers keep (R2.94), each with its weight (H3), its parsed
  message, the time of its last transition and whether it describes an older
  generation.

The object is the one the host hands over, at the version A2 names: a kind
of Cluster API at `v1beta2`, `Provider` at `v1alpha3`, the kinds of the
operator at `v1alpha2`, and an object of a provider at the version that the
contract label of its definition gives. The context holds what a rule needs
beyond the object:

- `now`, the time of the evaluation. The model never reads the clock.
- `cluster`, the Cluster of the object, for its pause, its creation, which
  starts the 30 minutes of its first provisioning, that first provisioning,
  which every object of it takes for its tone while its control plane is
  not initialized (D2), and its probe of the workload cluster.
- `healthChecks`, the MachineHealthChecks of the namespace, for the
  threshold of a Machine (D2).
- `machines`, the Machines of the object: those it controls, for a
  MachineSet, a MachinePool and a KubeadmControlPlane; those of its
  MachineSets, for a MachineDeployment; those labelled with its name, for a
  Cluster; those that its `status.targets` names, for a MachineHealthCheck;
  the one that owns it, for a bootstrap config or an infrastructure machine
  (R2.70, R3.1, R3.4). They are found by the owner reference, never by the
  labels `cluster.x-k8s.io/set-name`, `pool-name` or `control-plane-name`,
  whose value is a hash when a name is longer than 63 characters
  (api/core/v1beta2/machine_types.go:38-51;
  core/reconcilers/machinepool/machinepool_controller_phases.go:524).
- `parts`, for a Cluster: the result of `statusOf` for its control plane and
  for each of its MachineDeployments (P1, D2, D3).
- `machinePools`, for a Cluster: the result of `statusOf` for each of its
  MachinePools, read by P10 (H1), and with `parts` by D2 and D3.
- `clusterClass`, for a Cluster whose `spec.availabilityGates` is unset, its
  class, whose gates then apply (R2.21).
- `bindings`, for a ClusterResourceSet: the ClusterResourceSetBindings of
  its namespace, and the result of `statusOf` for the Cluster of each
  (R3.17).
- `role` and `contract`, for an object of a provider: the reference that
  names it (R1.15) and the contract of its definition (R1.16, A2).
- `controllers`, the availability of the controller of each provider
  (Freshness).

An input that a rule needs and that the view did not give is never assumed:
the result notes what was not read, and the rule goes on with what it has.
Every result also carries the earliest time at which it would change with
the passing of time alone, such as the threshold of an activity, so that a
view evaluates the object again then, and not at every tick.

### The closed sets

As SPEC-0001 has them, with the names the views show:

- **Health (H1):** Healthy, Degraded, Unhealthy, Unknown. A kind with no
  status, and an object that is deleting, have no health, and the result
  says which of the two.
- **Activity (H2):** Deleting, Paused, Rollout paused, Provisioning,
  Upgrading, Rolling out, Scaling up, Scaling down, Remediating, Updating,
  and Replacing (D3), listed in this order; Idle when every source of
  activity was read and none holds; and Unknown, next to the activities that
  hold, when a source cannot be read (P1). An activity is in progress when
  it is one of Provisioning to Replacing and its state is Progressing.
- **State of an activity:** Progressing, Blocked, Unknown (P1, D4).
- **Tone of the mark of health (D2):** progress, warning, or the tone of the
  health itself.
- **Weight of a condition (H3):** Ok (positive, `True`), Issue (positive,
  `False`), Activity (negative, `True`), At rest (negative, `False`),
  Unknown (`Unknown`, or any status other than `True` and `False`).
- **Types of negative polarity (H3):** `Paused`, `Deleting`, `RollingOut`,
  `ScalingUp`, `ScalingDown`, `Remediating` and `Updating`, and a gate
  declared `Negative`. Every other type is positive, a condition of a
  provider and an unknown type included, and so is a gate declared
  `Positive` or with no polarity (H3, R2.20; P22 for any other value).
- **Causes of a stale health (H1):** Paused, Older generation, Controller
  not available, Workload cluster unreachable.

**P1.** Proposed: the activities come from the conditions of the same names
on any kind that writes them, a control plane of a provider included, and
from the fields that the table under "Activity" names. An activity is
Blocked when the project names a failure or a stop (D4); Unknown when
the reason of its condition is `InternalError` or, on a kind of Cluster API,
a reason this release does not define for that condition; and Progressing
otherwise. The reasons of a condition of a provider are an open set (R2.26,
R2.51), so there only `InternalError` makes the state Unknown. The activity
Unknown takes the place of Idle when a source of activity cannot be read: a
condition of an activity that is `Unknown` or has a status other than
`True` and `False`; a value that does not parse (P20, P28); an object of a
kind that writes conditions, with no status yet; a control plane of a
provider that writes none of `RollingOut`, `ScalingUp` and `ScalingDown`,
and a Cluster whose control plane, in `parts`, is such a one; a
MachinePool, which writes neither `RollingOut` nor `Remediating` (R2.69);
and an owner or a Cluster whose Machines or parts the view did not give,
since D3 reads Provisioning and Replacing from them.
H2 takes the activities from the conditions of those names, the Cluster
reads them from any control plane that writes them and leaves out one that
writes none, and the contract recommends them to every control plane
(core/reconcilers/cluster/cluster_controller_status.go:906-911, 977-982,
1054-1059;
docs/book/src/developer/providers/contracts/control-plane.md:768-769).
The Cluster writes `RollingOutUnknown`, `ScalingUpUnknown` and
`ScalingDownUnknown` (api/core/v1beta2/cluster_types.go:373, 396, 419), the
window of R2.9 and an error while listing Machines give `InternalError`
(core/reconcilers/machineset/machineset_controller_status.go:111-120), and
the next release adds reasons (R1.31). Idle there would be a guess, and the
kit forbids one (kit, `docs/design.md`, "Status").

### Health

#### The rule every kind follows

1. An object with a deletion timestamp has no health: its activity is
   Deleting, and the reason of its `Deleting` condition says how far it is
   (H1).
2. The rule of each kind below names the condition that sums the object
   up, or what stands for one. When it is `False` the object is Unhealthy;
   when it is `Unknown`, missing or of any other status, or the object has
   no status yet, it is Unknown (H1, R2.1).
3. When it is `True`, the object is Degraded if another condition of
   positive polarity is `False` and point 4 does not leave it out, and
   Healthy otherwise (H1).
4. These are never issues of health: a condition other than the summary
   that is `Unknown` (H1); a condition of negative polarity that is `True`,
   which is an activity (H1, H3); `TopologyReconciled` `False` with a reason
   other than `ReconcileFailed` and `ClusterClassNotReconciled` (H3, R2.22);
   the pending changes of P4 and P5; and what the rule of a kind below
   leaves out, with its reason (P11, P12, P14).
5. No activity holds, suspends or replaces the health (D1): an activity in
   progress changes only the tone of its mark (D2).
6. A mark of freshness never changes the health (H1).

**D1.** Decided: the health is always the verdict of the project, as points
1 to 4 and the rule of each kind map it, with the exceptions of H1 for
MachinePools, for the Machines that the `Available` of a Cluster leaves
out, for the bindings of a ClusterResourceSet, for the targets of a
MachineHealthCheck, for the three conditions of a kind of the operator, and
for the kinds with no status. It is never held, suspended or replaced while
a change is in flight. The exception of H1 for the conditions that a
normal rollout or scale down turns `False` is met by the tone of D2 rather
than by the word: those conditions count, and the object reads Degraded or
Unhealthy, as the project reports it, in the tone of progress while the
activity lasts. Only the conditions that say that a change is pending, and
not that something is wrong, stay out of the health (P4, P5). Holding a
health while a change is in flight needs a rule for every way in which a
change can stall, and each such rule left a case where an issue was hidden
or a normal operation read broken; the conditions of the project have
neither fault, and the activity next to them says what is in flight.

#### The tone of the health

**D2.** Decided: what an activity changes is the tone of the mark of
health, never its word. While the object has an activity in progress, or
one that it takes for its tone, an Unhealthy or Degraded health takes the
tone of progress; once that activity has lasted longer than its threshold,
the tone of a warning; with no activity in progress, Idle, Unknown, Paused
or Blocked, the tone of its health. Healthy and Unknown keep their own
tone. An object takes for its tone:

- for every object of a Cluster in its first provisioning, while its
  control plane is not yet initialized, its control plane included, that
  first provisioning;
- for a ClusterResourceSet, the first provisioning of the Clusters of its
  bindings that cannot be reached yet, whose `RemoteConnectionProbe` is not
  `True`;
- along the chain of a part: for an owner, a MachineSet, a
  MachineDeployment, a MachinePool or a KubeadmControlPlane, the
  Provisioning and the Updating of its Machines, and its own Replacing; for
  a Cluster, the activities of its parts. After the first provisioning, this
  chain is the only one: a part lends its tone to its owner and to its
  Cluster, never to a sibling, so an object that has nothing in flight keeps
  the tone of its health.

The thresholds are three:

- For what concerns one Machine: the shortest
  `spec.checks.nodeStartupTimeoutSeconds` above zero of the
  MachineHealthChecks whose `status.targets` names it, else 600 seconds,
  the default that the project gives that field, the time it allows a Node
  to start; 600 seconds also when a MachineHealthCheck sets 0, which stops
  the count of the project but not that of the views (R2.97;
  api/core/v1beta2/machinehealthcheck_types.go:42-46, 89-103;
  core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:216-221).
- For a Cluster and its first provisioning: 30 minutes from its creation.
  No controller of the project bounds a first provisioning, and the
  project's own end-to-end tests with the development provider allow 5
  minutes for the Cluster, 10 for its control plane and 5 for its workers
  (test/e2e/config/docker.yaml:256-262): 30 minutes is a generous bound of
  that order.
- For a deletion: the 15 minutes after which the project itself calls a
  deletion stale, and writes "since more than 15m" in the `Ready` of a
  Machine (core/reconcilers/machine/machine_controller_status.go:835-836;
  api/core/v1beta2/machine_types.go:130; R2.47).

These are the only clocks, and they change only a tone. The duration of
each activity is always shown next to it, computed from the times that the
project wrote (P34), and is zero while the clock of the desktop is behind
them.

**P2.** Proposed: the threshold and the start of each activity in progress,
from the three of D2:

- The threshold of one Machine: for the Provisioning of a Machine, from its
  creation, except that its wait of `minReadySeconds` (D3) counts as within
  its threshold, since that setting bounds it; for that of an owner, from
  the creation of the oldest of its Machines that are Provisioning, with the
  threshold of that Machine (D3);
  for that of the bootstrap config and the infrastructure machine of a
  Machine, the threshold of their Machine; for the Updating of a Machine,
  from the transition of `Updating` to `True`, which only the update moves,
  since its reason changes with no transition
  (core/reconcilers/machine/machine_controller_status.go:634-656;
  util/conditions/setter.go:62-64), and which the project bounds nowhere
  (core/reconcilers/machine/machine_controller_inplace_update.go:102-117);
  and for the Remediating of a Machine (P21), from the transition of its
  condition. Rolling out, Scaling up, Upgrading and the Remediating of an
  owner or of a Cluster go from one Machine to the next, and take the
  threshold of one Machine from their own start: the shortest of those of
  the Machines of the owner or of the Cluster.
- The 15 minutes of a deletion: for Replacing, from the deletion timestamp
  of the oldest of the Machines that make it so (D3); for Scaling down, from
  the transition of its condition; and for the mark of Deleting itself, from
  the deletion timestamp.
- The 30 minutes of a Cluster: for its own Provisioning, from its creation
  (D3). They are also a floor: within the 30 minutes after the creation of a
  Cluster, no activity of the Cluster or of an object of it has outlasted its
  threshold, since what starts then waits on the first provisioning, as a
  worker waits for its control plane (R2.82). An object of P17 that serves
  no Machine, an infrastructure cluster, a control plane of a provider or
  what a MachinePool provisions, takes the threshold of one Machine, 600
  seconds, with that floor.
- A kind of the operator, which no MachineHealthCheck selects, takes 600
  seconds (P14).
- An activity whose start the project did not write (P34) counts as past its
  threshold: it gives no tone of progress by itself.

An activity that an object takes for its tone (D2) keeps the start and the
threshold that it has on the object that holds it: each Machine of an owner
its own, the part of a Cluster its own, and the first provisioning of a
Cluster, for its objects and for a ClusterResourceSet, the 30 minutes from
the creation of the Cluster. With
several activities in progress, its own and those it takes, the tone is that
of progress while one of them is within its threshold, and that of a warning
once every one has outlasted its own: a long rollout stays in progress while
its current Machine starts, and a stuck one turns into a warning. The result
carries the activity that sets the tone, which the details show, and the
earliest time at which the tone would change.

#### What is no issue of health

**P4.** Proposed: `UpToDate` on a Machine, `MachinesUpToDate` on a
MachineSet, a MachineDeployment and a KubeadmControlPlane, and
`ControlPlaneMachinesUpToDate` and `WorkerMachinesUpToDate` on a Cluster say
that a change is pending, not that something is wrong: they weigh Activity
when `False`, never Issue, and an object whose only `False` conditions of
positive polarity are of that family is not Degraded. A change of the
template makes them `False` before any Machine is replaced (R2.52), and they
stay `False` under the strategy `OnDelete`, which replaces a Machine only
once the user deletes it, and while a rollout is held by `spec.paused`
(api/core/v1beta2/machinedeployment_types.go:43-44, 311-321; R2.65,
R4.44). What is pending shows as the activity Rolling out when the
controller of the object rolls it: its `RollingOut` is `True`, which the
project computes from those conditions (R2.64, R2.78), and, for a
MachineDeployment, its `spec.rollout.strategy.type` is not `OnDelete`;
`spec.paused` makes it Rollout paused (H2). Otherwise the object carries a
note that its Machines differ from its spec: a MachineDeployment under
`OnDelete`, and a MachineSet or a Machine, which write no `RollingOut`. A
Cluster, whose `RollingOut` aggregates those of its parts, shows Rolling out
while its control plane or one of its MachineDeployments does, and the note
otherwise, when the view gave `parts`. So a MachineDeployment under
`OnDelete`, or with a paused rollout, is never Degraded for good.

**P5.** Proposed: the `Available` of a Machine that is `False` with the
reason `WaitingForMinReadySeconds` is not an issue, and weighs Activity. It
is the wait of `spec.minReadySeconds` after `Ready` turned `True`, and the
only other `False` it takes follows from `Ready` itself
(core/reconcilers/machine/machine_controller_status.go:874-916). Its owners
count the Machine as not available meanwhile (R2.56), and the wait makes it
Provisioning (D3), which they take for their tone (D2).

**P6.** Proposed: the failure reason and message under `status.deprecated`,
and the phase `Failed`, are never inputs of health. The result carries them
as a note, which the views show with a "deprecated" label (A5). The
controllers never clear the failure fields (R2.16), so they can outlive the
failure they recorded, and no controller sets `Failed` (R2.17, R2.43,
R2.61, R2.68).

#### The rule of each kind

The tables follow the groups of R2. "Sums it up" names the condition of
point 2, or what stands for one; "Degraded from" names the conditions of
positive polarity outside it that point 3 counts.

Cluster:

| Kind    | Sums it up  | Degraded from                                                                                                                                                                                                | Facts                                       |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Cluster | `Available` | `ControlPlaneMachinesReady` and `WorkerMachinesReady`; `ControlPlaneInitialized`; a `TopologyReconciled` that fails while `Available` keeps an older `True`; and a MachinePool that is Unhealthy or Degraded | R2.8, R2.19, R2.21, R2.22, R2.24, R2.29, H1 |

- Its `Available` leaves out its MachinePools (R2.29). So a Cluster is at
  most Degraded when one of them is Unhealthy or Degraded by the rule of the
  MachinePool below; one whose MachinePools are Unknown says how many next to
  its health; and when the view gave no `machinePools`, the result notes
  that they were not read (H1).
- While its ClusterClass cannot be read, the controller stops computing the
  status, and only `TopologyReconciled` changes (R2.8). A
  `TopologyReconciled` `False` with `ReconcileFailed` next to an `Available`
  `True` makes it Degraded by point 3 (R2.24).
- While the contract version of its control plane cannot be read, the
  controller writes nothing at all, not even its conditions (R2.8;
  core/reconcilers/cluster/cluster_controller_status.go:52-57;
  core/reconcilers/cluster/cluster_controller.go:177-182). Its last health
  stays, Healthy included, and no mark can tell it, as after a restart of
  the controller (P25).
- **P7.** Proposed: a Cluster with neither a topology nor
  `spec.controlPlaneRef`, or with neither a topology nor
  `spec.infrastructureRef`, keeps the health its `Available` gives, Unknown
  or Unhealthy but never Healthy, with a note that the project never reports
  such a Cluster available. The missing part reports `Unknown`
  `InternalError`, so its `Available` never turns `True` (R2.27), and the
  note tells the user why rather than leaving an Unknown with no cause. S7
  tries it (Tests).
- Phase: the closed set of R2.17, shown as the project writes it. A value
  outside it reads Unknown, as the getter of the project does (R2.17), and
  `Failed` takes the "deprecated" label (P6).

ClusterClass and ExtensionConfig:

| Kind            | Sums it up                                                                                                         | Degraded from         | Facts        |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------- | ------------ |
| ClusterClass    | `VariablesReady`, which the topology controller and the Cluster webhook require; an older generation is a mark, P8 | `RefVersionsUpToDate` | R2.33, R2.34 |
| ExtensionConfig | `Discovered`                                                                                                       | none                  | R2.37        |

- **P8.** Proposed: a ClusterClass whose `status.observedGeneration` is
  below its `metadata.generation` keeps the health that its conditions give,
  with the mark Older generation, and the mark says that the topology of its
  Clusters is not reconciled until the class is. The project counts such a
  class as not reconciled (R2.34), and its Clusters then report
  `TopologyReconciled` `False` `ReconcileFailed` (R2.24), while H1 marks an
  older generation as stale instead of changing the health. The two facts
  disagree for this kind, and the mark keeps both: the generation also lags
  for good while a template of the class is missing (R2.35), and the
  Clusters carry the failure in their own health.
- An ExtensionConfig writes no status while `RuntimeSDK` is off, while the
  registry warms up, or while its CA cannot be injected, and `Discovered`
  then keeps its last value, `True` included (R2.37). Nothing marks that,
  since the gates are not read (A10); the generation of `Discovered` marks a
  change of its spec not yet observed (Freshness).

Machine:

| Kind    | Sums it up | Degraded from                                                                                                                                                                                                                                                    | Facts                             |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Machine | `Ready`    | another condition of positive polarity: in practice one of a third party, since `Ready` merges the others, `OwnerRemediated` and `ExternallyRemediated` come with `HealthCheckSucceeded` `False`, and P4 and P5 leave out `UpToDate` and the wait of `Available` | R2.31, R2.45, R2.46, R2.53, R2.54 |

- `Ready` already merges `BootstrapConfigReady`, `InfrastructureReady`,
  `NodeHealthy`, `HealthCheckSucceeded` and the readiness gates, the six of
  KubeadmControlPlane included, each with its polarity (R2.46, R2.55).
  `NodeReady` is not an input, but `NodeHealthy` covers the `Ready` of the
  Node (R2.45). `Available` and `UpToDate` follow P5 and P4.
- A Machine that waits for its Node, with bootstrap and infrastructure
  ready, has `NodeHealthy` `Unknown`, so its `Ready` is `Unknown` and it is
  Unknown, unless a MachineHealthCheck marks it
  (core/reconcilers/machine/machine_controller_status.go:398-412; R2.46,
  R2.53). While it provisions, its health stays the project's, in the tone
  of progress (D2).
- A Machine whose Node was deleted stays in the phase `Running`, and
  `NodeHealthy` `False` `NodeDeleted` makes it Unhealthy (R2.44).
- Phase: the closed set of R2.43; a value outside it reads Unknown (R2.43),
  and `Failed` takes the "deprecated" label (P6).

MachineSet, MachineDeployment and MachinePool:

| Kind              | Sums it up                                                                   | Degraded from                                               | Facts               |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| MachineSet        | What stands for one (P9): `status.availableReplicas` against `spec.replicas` | `MachinesReady`                                             | R2.56, R2.57, R2.58 |
| MachineDeployment | `Available`                                                                  | `MachinesReady`                                             | R2.62, R2.63        |
| MachinePool       | What stands for one (P10): its Machines, when it has them                    | one of its Machines that is not deleting and is not `Ready` | R2.66 to R2.69, H1  |

- **P9.** Proposed: a MachineSet is Unknown while `spec.replicas` or
  `status.availableReplicas` is unset, Unhealthy while fewer Machines are
  available than `spec.replicas`, and otherwise read by point 3, with
  `MachinesReady`. R2.58 makes `MachinesReady` and the counters against
  `spec.replicas` stand for a summary. `MachinesReady`
  alone would make a MachineSet Unhealthy at every scale down, since it
  counts the deleting Machines, which are never `Ready`
  (core/reconcilers/machineset/machineset_controller_status.go:236-281;
  api/core/v1beta2/machine_types.go:122-124). The counters leave the
  deleting Machines out, since they are not available, and so are the
  Machines of an in-place update (R2.56;
  core/reconcilers/machineset/machineset_controller_status.go:80-108): a
  MachineSet then reads as the `Available` of a MachineDeployment with
  `maxUnavailable` 0 does (R2.60, R2.63). It reads Unhealthy while one of its
  Machines starts, waits for `minReadySeconds`, updates in place or is
  replaced, in the tone of progress that the activities of its Machines give
  it (D2).
- **P10.** Proposed: a MachinePool with Machines is read as a MachineSet
  (P9), on its `status.availableReplicas`, which then counts the `Available`
  of its Machines (R2.67), and is Degraded when one of its Machines that is
  not deleting is not `Ready`. Its Machines are those it
  controls (R3.4). With no Machine and `spec.replicas` above zero it is
  Unknown, with the reason that no Machine stands for its instances, and the
  deprecated `v1beta1` `Ready` next to it with its label, as the evidence it
  is (H1, A2, A5). With `spec.replicas` 0 and no Machine it is Healthy, where
  H1 says Unknown: a pool asked to run nothing has no instance whose
  readiness is unknown, and a MachineSet without Machines reports
  `MachinesReady` `True` `NoReplicas` (R2.57). When the view gave no
  `machines`, it is Unknown and notes that they were not read. A MachinePool
  writes no health condition at `v1beta2`, its counters copy the instances
  of its provider when the provider keeps no Machines, and its `v1beta1`
  readiness does not follow a Node that turns not ready after joining
  (R2.67, R2.69).
- The phases are the closed sets of R2.61 and R2.68; a value outside them
  reads Unknown, and `Failed` takes the "deprecated" label (P6). The phase
  `Running` of a MachineDeployment says nothing of readiness (R2.61).

MachineHealthCheck:

| Kind               | Sums it up                             | Degraded from | Facts                   |
| ------------------ | -------------------------------------- | ------------- | ----------------------- |
| MachineHealthCheck | What stands for one (P11): its targets | none          | R2.70, R2.71, R2.72, H1 |

- **P11.** Proposed: a MachineHealthCheck is Unknown while its status or
  `RemediationAllowed` is missing, and Healthy when `status.currentHealthy`
  equals `status.expectedMachines`. Otherwise, with the Machines of its
  targets from the view, it is Degraded when one of them has
  `HealthCheckSucceeded` `False`, and Healthy when none has: the others are
  starting, deleting or inside a timeout, which the check counts as not
  healthy for its limit only (R2.71;
  core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:384-416;
  core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:792-794).
  Without them it is Unknown, with the note that the targets were not read,
  since the count alone does not tell a target that starts from one that
  failed. It is never Unhealthy: its targets carry their own health. Whether
  remediation is allowed is a mark of its own, next to the health: allowed,
  or not allowed, from `RemediationAllowed`, with the weight of that
  condition (H3, P31) and the message of the project. The reason
  `TooManyUnhealthy` covers both a count above the limit and, with
  `unhealthyInRange`, a count below the range, none included, which only
  the message tells apart (R2.72;
  core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:731-756).

KubeadmControlPlane and KubeadmConfig:

| Kind                | Sums it up  | Degraded from                                                                                                     | Facts                   |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| KubeadmControlPlane | `Available` | `EtcdClusterHealthy`, `ControlPlaneComponentsHealthy` and `MachinesReady`; `Initialized`; `CertificatesAvailable` | R2.78, R2.79, R2.80, H1 |
| KubeadmConfig       | `Ready`     | none: its other two conditions are the inputs of `Ready`                                                          | R2.83                   |

- KubeadmControlPlane has no `Ready` (R2.79). With external etcd,
  `EtcdClusterHealthy` can stay `Unknown`, which changes nothing (R2.80, H1).
- Before it is initialized, its `Available` is `False` (R2.78): it reads
  Unhealthy, in the tone of progress of the first provisioning of its
  Cluster, which every object of the Cluster takes for its tone (D2).
  After its initialization, a control plane of one replica reads Unhealthy
  until its Machine is `Available`, in the tone of progress while that
  Machine is Provisioning (D2, D3).
- Its `EtcdClusterHealthy` and `ControlPlaneComponentsHealthy` go `False`
  while a Machine joins or leaves, also for an etcd member that has no
  Machine yet, which the project calls an error since it cannot tell a
  member that starts from one that does not (R2.80;
  controlplane/kubeadm/pkg/workload_cluster_conditions.go:438-447): the
  KubeadmControlPlane then reads Degraded, in the tone of progress while it
  rolls out, scales or replaces a Machine (D1, D2).
- The `DataSecretAvailable` of a KubeadmConfig is `False` `NotAvailable`
  both while it waits for the infrastructure or the control plane and when
  its data cannot be built, which only the message tells apart (R2.83). It
  reads Unhealthy while it waits, in the tone of progress while it is
  Provisioning within its threshold (P17, D2); a worker waits for the
  control plane only until it is initialized (R2.82), and the 30 minutes of
  its Cluster are the floor of that threshold (P2).

ClusterResourceSet, IPAM and providers:

| Kind                            | Sums it up                                                         | Degraded from                                                                                            | Facts            |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------- |
| ClusterResourceSet              | `ResourcesApplied`, with its bindings (P12)                        | a resource of `spec.resources` missing from, or not applied in, the binding of a Cluster                 | R2.84, R2.85, H1 |
| IPAddressClaim                  | `Ready`, else `status.addressRef` (P13)                            | none                                                                                                     | R2.86            |
| The seven kinds of the operator | `Ready`, else `ProviderInstalled` and `PreflightCheckPassed` (P14) | `PreflightCheckPassed` but while it waits for the core provider, `ProviderInstalled`, `ProviderUpgraded` | R2.88, H1        |

- **P12.** Proposed: a ClusterResourceSet whose `ResourcesApplied` is `True`
  is Degraded when, in a binding that holds an entry for it, a resource of
  its `spec.resources` has no entry or has `applied` false, and Healthy
  otherwise. The details list the result Cluster by Cluster. With no entry
  in any binding and no `ResourcesApplied`, it is Unknown with the note that
  it applied to no Cluster; without `bindings` from the view, its health
  rests on `ResourcesApplied` alone, with the note that the bindings were
  not read. The project sets `ResourcesApplied` `True` with a resource
  missing, and records that resource only by the absence of an entry
  (R2.84); a failed apply records `applied` false
  (core/reconcilers/clusterresourceset/clusterresourceset_controller.go:387-440).
  The controller writes the entry of a Cluster before it tries to reach it,
  and reports one that it cannot reach yet as `ResourcesApplied` `False`
  `InternalError`, the reason it also writes when it cannot list the
  Clusters or read a resource
  (core/reconcilers/clusterresourceset/clusterresourceset_controller.go:170-180,
  317-324, 347-384). So a ClusterResourceSet reads Unhealthy while a new
  Cluster of its bindings comes up, as the project says (D1), with the
  message of the project, in the tone of progress while that Cluster is in
  its first provisioning, its control plane not yet initialized, which the
  ClusterResourceSet takes for its tone (D2); the test tier of SPEC-0002
  applies its network add-on in this way.
- **P13.** Proposed: an IPAddressClaim with no `Ready` is Healthy when its
  `status.addressRef` is set, and Unknown otherwise. The provider writes
  both (R2.86), but the contract of the book asks for a `Ready` condition on
  the pool only, asks the provider to set `status.addressRef` on the claim,
  and has the infrastructure provider wait for that reference
  (docs/book/src/developer/providers/contracts/ipam.md:17-24, 36-49, 78). A
  provider that writes no `Ready` on its claims would otherwise leave every
  claim Unknown.
- **P14.** Proposed: a kind of the operator is Provisioning while its
  `status.installedVersion` is unset, which the operator writes after the
  first installation that succeeds (R2.88), and Upgrading while that
  version is set and differs from `spec.version`, which is when the
  operator upgrades it
  (cluster-api-operator:internal/controller/phase_lifecycle.go:43-56). Both
  are Blocked when `ProviderInstalled` or `ProviderUpgraded` is `False`, or
  `PreflightCheckPassed` is `False` with a reason other than
  `WaitingForCoreProviderReady` (D4, P18).
  - The wait for the core provider, `PreflightCheckPassed` `False` with the
    reason `WaitingForCoreProviderReady`, is a step of those activities,
    Progressing, since the operator treats it as no error
    (cluster-api-operator:internal/controller/preflight_checks.go:51,
    147-158, 246-259;
    cluster-api-operator:internal/controller/genericprovider_controller.go:193-198).
    It looks only for a `CoreProvider` object of the operator, so without
    one it lasts for good: past the threshold of the activity, 600 seconds
    (P2), the mark of the activity takes the tone of a warning, and so does
    that of a health that is Degraded (D2, P31). When the kind is installed and
    up to date, the wait is no activity of its own, and the kind reads
    Degraded in the tone of its health: the operator holds it back while the
    core provider, which carries the failure, is not ready.
  - The health follows H1. With `Ready`, the kind is Healthy only when
    `PreflightCheckPassed`, `ProviderInstalled` and `Ready` are all `True`,
    Unhealthy when `Ready` is `False`, and Degraded otherwise. `Ready` is
    not written while `ProviderInstalled` is not `True` (R2.88); with no
    `Ready`, the kind is Unhealthy when `ProviderInstalled` is `False`, or
    `PreflightCheckPassed` is `False` with another reason than the wait,
    since a first installation that failed is the project's own statement
    that the provider does not run
    (cluster-api-operator:internal/controller/genericprovider_controller.go:240-248),
    and Unknown otherwise.
  - `ProviderUpgraded`, which H1 does not name, counts by point 3 while
    `status.installedVersion` differs from `spec.version`: it is `False`
    after an upgrade that failed
    (cluster-api-operator:internal/controller/phase_lifecycle.go:62-76), and
    `ProviderInstalled` also turns `False` when an upgrade cannot fetch its
    manifests
    (cluster-api-operator:internal/controller/phase_lifecycle.go:78-79),
    which reads as an upgrade that failed and not as an installation, since
    the installed version stays. Once the two versions match again,
    `ProviderUpgraded` `False` is stale: only an upgrade that succeeds
    writes it `True`, and the operator returns before it when the versions
    match (cluster-api-operator:internal/controller/phase_lifecycle.go:49-54,
    71-76). It is then no issue of health, weighs At rest and is noted as
    stale, as P6 does for the failure fields that the project never clears.

Objects of a provider:

| Role                                         | Sums it up                                            | Degraded from                          | Facts                                                                              |
| -------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| Infrastructure cluster                       | `Ready`                                               | another condition of positive polarity | R2.26; docs/book/src/developer/providers/contracts/infra-cluster.md:381-399        |
| Control plane other than KubeadmControlPlane | `Available`, else `Ready`                             | another condition of positive polarity | R2.26, R4.22; docs/book/src/developer/providers/contracts/control-plane.md:740-758 |
| Infrastructure machine                       | `Ready`                                               | another condition of positive polarity | R2.51; docs/book/src/developer/providers/contracts/infra-machine.md:364            |
| Bootstrap config other than KubeadmConfig    | `Ready`                                               | another condition of positive polarity | R2.51; docs/book/src/developer/providers/contracts/bootstrap-config.md:304         |
| Infrastructure machine pool                  | `Ready`                                               | another condition of positive polarity | docs/book/src/developer/providers/contracts/infra-machinepool.md:377               |
| IPAM pool                                    | `Ready`                                               | another condition of positive polarity | docs/book/src/developer/providers/contracts/ipam.md:17-24                          |
| Remediation request                          | none: no contract of the book names a condition of it | none                                   | R1.15, R3.15                                                                       |

- **P15.** Proposed: the role comes from the reference that names the
  object (R1.15), and the conditions from `status.v1beta2.conditions` when
  that list is present, else from `status.conditions`, as the project reads
  them (R2.93, R4.29). The `severity` of a condition of the `v1beta1`
  contract is shown in the list of conditions with a "deprecated" label and
  has no weight, since the mirror of the project copies only the status, the
  reason, the message and the time (R2.93, R2.95, A5). A remediation
  request is Unknown, with the note that no contract names its status, and
  its conditions are listed with their weights. An object whose role the
  view did not give is Unknown, with the note that its role is not known:
  the summary depends on it.

Kinds with no status:

- **P16.** Proposed: MachineDrainRule, KubeadmConfigTemplate,
  KubeadmControlPlaneTemplate, IPAddress, ClusterResourceSetBinding, the
  `Provider` of `clusterctl` and the templates of a provider have no health
  (H1; R1, R2.73, R2.85, R2.86, R2.87). Their one activity is Deleting, from
  the deletion timestamp (H2); neither Idle nor Unknown is shown for them,
  since either would speak of a status they do not have. A view of one of
  these kinds alone shows no column of health or activity, and shows
  Deleting as the state of a row that is deleting; a view that shows them
  next to kinds with a status, such as the tree, shows N/A in the cell of
  health, as the kit asks of a missing value (kit, `docs/design.md`,
  "Lists").

### Activity

The sources of each activity of H2, the time it has lasted from, and when it
is Blocked. The views show every activity that holds, with its state and
how long it has lasted, through the duration component of the host.

| Activity       | Kinds                                                                                                                          | Holds when                                                                                                                                                                                                                                                                                                                          | Since                                                                                | Blocked when                                                                                                                                        | Facts                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Deleting       | every kind                                                                                                                     | `metadata.deletionTimestamp` is set                                                                                                                                                                                                                                                                                                 | the deletion timestamp                                                               | `DeletingNode` on a Machine; on a Cluster, a `TopologyReconciled` whose message says `Following hooks are blocking delete`; while paused (P18, P33) | H2, R2.25, R2.49, R2.81                              |
| Paused         | every kind with a status                                                                                                       | `Paused` is `True`, or the pause is requested (P19)                                                                                                                                                                                                                                                                                 | the transition of `Paused` to `True`; none when it is only requested                 | never                                                                                                                                               | H2, R4.59                                            |
| Rollout paused | MachineDeployment                                                                                                              | `spec.paused` is true while `RollingOut` is `True`; it takes the place of Rolling out                                                                                                                                                                                                                                               | none: no time is written for it                                                      | while paused (P33)                                                                                                                                  | H2, R2.65, R4.44                                     |
| Provisioning   | Cluster                                                                                                                        | its control plane is not initialized, or one of its parts is Provisioning (D3)                                                                                                                                                                                                                                                      | its creation, else the start of the Provisioning of the part                         | `TopologyReconciled` is `False` `ClusterCreating`; while paused (P18, P33)                                                                          | H2, R2.11, R2.23, R2.28, D3                          |
| Provisioning   | Machine                                                                                                                        | its phase is `Pending`, `Provisioning` or `Provisioned`, and it has no Node; or it is not `Available` and younger than its threshold; or its `Available` is `False` `WaitingForMinReadySeconds` (D3)                                                                                                                                | its creation                                                                         | while paused (P33)                                                                                                                                  | H2, R2.42, R2.43, D3, P5                             |
| Provisioning   | MachineSet, MachineDeployment, MachinePool, KubeadmControlPlane                                                                | one of its Machines is Provisioning; a MachinePool with no Machine as P17 says, and never at 0 replicas                                                                                                                                                                                                                             | the creation of the oldest of those Machines; none for a MachinePool with no Machine | while paused (P33)                                                                                                                                  | H2, R2.66, R2.68, D3, P17                            |
| Provisioning   | bootstrap config, infrastructure machine, infrastructure cluster, control plane of a provider, infrastructure machine pool     | the field of its contract that P17 names is not true                                                                                                                                                                                                                                                                                | its creation                                                                         | while paused (P33)                                                                                                                                  | P17                                                  |
| Provisioning   | a kind of the operator                                                                                                         | `status.installedVersion` is unset (P14)                                                                                                                                                                                                                                                                                            | its creation                                                                         | as P14 says                                                                                                                                         | P14, R2.88                                           |
| Upgrading      | Cluster with a topology                                                                                                        | `TopologyReconciled` is `False` with `ClusterUpgrading`, `MachineDeploymentsUpgradeDeferred` or `MachinePoolsUpgradeDeferred`                                                                                                                                                                                                       | the transition of `TopologyReconciled` (P34)                                         | a deferred reason, or a message that says `Following hooks are blocking upgrade`; while paused (P18, P33)                                           | H2, R2.23                                            |
| Upgrading      | KubeadmControlPlane, and a control plane through the contract                                                                  | the project says that it is upgrading: `spec.version` is greater than an entry of `status.versions`, or than `status.version` when the list is absent or empty, or differs from it only by words of its build metadata; never when neither is set or the version is empty, and never for a downgrade, which reads Rolling out (P28) | none: no time is written (P34)                                                       | while paused (P33)                                                                                                                                  | H2, R2.75; internal/contract/controlplane.go:295-352 |
| Upgrading      | a kind of the operator                                                                                                         | `status.installedVersion` is set and differs from `spec.version` (P14)                                                                                                                                                                                                                                                              | none: no time is written (P34)                                                       | as P14 says                                                                                                                                         | P14                                                  |
| Rolling out    | every kind that writes `RollingOut`: Cluster, MachineDeployment, KubeadmControlPlane, a control plane of a provider            | `RollingOut` is `True` while its controller rolls the object, not under `OnDelete`; a Cluster through a part that rolls out (P4)                                                                                                                                                                                                    | its transition                                                                       | while paused (P33)                                                                                                                                  | H2, R2.19, R2.62, R2.64, R2.78, P1, P4               |
| Scaling up     | every kind that writes `ScalingUp`: Cluster, MachineSet, MachineDeployment, KubeadmControlPlane, a control plane of a provider | `ScalingUp` is `True`                                                                                                                                                                                                                                                                                                               | its transition                                                                       | while paused (P33), and never for a message that says ` is blocked because` (D4)                                                                    | H2, R2.19, R2.57, R2.59, R2.62, R2.78, P1            |
| Scaling up     | MachinePool                                                                                                                    | P20                                                                                                                                                                                                                                                                                                                                 | none: no time is written (P34)                                                       | while paused (P33)                                                                                                                                  | P20                                                  |
| Scaling down   | every kind that writes `ScalingDown`, as Scaling up                                                                            | `ScalingDown` is `True`                                                                                                                                                                                                                                                                                                             | its transition                                                                       | as Scaling up (D4, P33)                                                                                                                             | H2, R2.19, R2.57, R2.62, R2.78, P1                   |
| Scaling down   | MachinePool                                                                                                                    | P20                                                                                                                                                                                                                                                                                                                                 | none: no time is written (P34)                                                       | while paused (P33)                                                                                                                                  | P20                                                  |
| Remediating    | every kind that writes `Remediating`: Cluster, MachineSet, MachineDeployment, KubeadmControlPlane                              | `Remediating` is `True`                                                                                                                                                                                                                                                                                                             | its transition                                                                       | none of its Machines in remediation can be remediated (P21); while paused (P33)                                                                     | H2, R2.31, R2.57, R2.62, R2.78                       |
| Remediating    | Machine                                                                                                                        | P21                                                                                                                                                                                                                                                                                                                                 | the transition of that condition                                                     | the reasons of P21; while paused (P33)                                                                                                              | P21                                                  |
| Updating       | Machine                                                                                                                        | `Updating` is `True`                                                                                                                                                                                                                                                                                                                | its transition                                                                       | the reason `InPlaceUpdateFailed`; while paused (P18, P33)                                                                                           | H2, R2.45; api/core/v1beta2/machine_types.go:177-186 |
| Replacing      | MachineSet, MachineDeployment, MachinePool, KubeadmControlPlane                                                                | one of its Machines is deleting, and it has fewer Machines that are not deleting than `spec.replicas` (D3)                                                                                                                                                                                                                          | the deletion timestamp of the oldest of those Machines                               | while paused (P33)                                                                                                                                  | D3                                                   |
| Idle           | every kind with a status                                                                                                       | every source was read and none of the above holds                                                                                                                                                                                                                                                                                   | none                                                                                 | never                                                                                                                                               | H2, P1                                               |
| Unknown        | every kind with a status                                                                                                       | a source cannot be read (P1)                                                                                                                                                                                                                                                                                                        | none                                                                                 | never                                                                                                                                               | P1                                                   |

At `v1.14.4`, a condition of an activity that is `True` gives the state
Progressing with one of these reasons, unless D4 makes it Blocked:
`RollingOut`, `ScalingUp`, `ScalingDown` and `Remediating`
(api/core/v1beta2/condition_consts.go:125-144); `Paused`
(api/core/v1beta2/condition_consts.go:176); `InPlaceUpdating` and
`InPlaceUpdateFailed` for `Updating`; and the stages of `Deleting` of R2.25,
R2.49 and R2.81, with `Deleting` on a MachineSet and a MachineDeployment
(api/core/v1beta2/machineset_types.go:253;
api/core/v1beta2/machinedeployment_types.go:229). `InternalError` and any
other reason give the state Unknown (P1).

**D3.** Decided: the activities that the Machines of an object make, with
no clock:

- A Machine is Provisioning while its phase is `Pending`, `Provisioning` or
  `Provisioned`, the phases of a Machine with no Node yet, which the
  project computes from its bootstrap data, its infrastructure and its
  `status.nodeRef` (R2.43;
  core/reconcilers/machine/machine_controller_status.go:918-954); its tone
  turns to a warning past its threshold (D2). It is Provisioning also while
  it is not `Available` and is younger than its threshold, whatever its
  phase: a Machine that has its Node is not ready at once, and a provider
  can say that the infrastructure is provisioned before the bootstrap ends,
  as the development provider does
  (test/infrastructure/docker/internal/controllers/backends/docker/dockermachine_backend.go:124-142).
  And it is Provisioning, whatever its age, while its `Available` is `False`
  with the reason `WaitingForMinReadySeconds`, a wait that
  `spec.minReadySeconds` bounds (P5).
- A MachineSet, a MachineDeployment, a MachinePool and a
  KubeadmControlPlane are Provisioning while one of their Machines is,
  since the oldest such Machine was created; and Replacing, a member that
  this spec adds to the closed set of H2, while one of their Machines is
  deleting and they have fewer Machines that are not deleting than they
  want, their `spec.replicas`. A Machine deleted by hand, a remediation, or a
  rollout with `maxUnavailable` above zero leaves its owner short with no
  activity of the project: `ScalingUp` and `ScalingDown` stay `False`, since
  the deleting Machine still counts, and the owner creates the replacement
  only once it is gone
  (core/reconcilers/machineset/machineset_controller.go:621-622, 778-789;
  core/reconcilers/machineset/machineset_controller_status.go:138-153).
- A Cluster is Provisioning until its control plane is initialized, its
  `ControlPlaneInitialized` `True`, which never changes once `True`
  (R2.19), or while one of its parts, its control plane, a
  MachineDeployment or a MachinePool, is Provisioning.
- The other activities come from the conditions of the same names (H2,
  P1). Nothing is Provisioning or Replacing once the Machines that make it
  so are gone or no longer are, nor while the object itself is deleting:
  its deletion is then what it does (H1, H2).

**P17.** Proposed: Provisioning holds also, with no clock, for the objects
that provision with the kinds of D3, until the field of their contract says
that they are ready: `status.initialization.provisioned` for an
infrastructure cluster or machine,
`status.initialization.controlPlaneInitialized` for a control plane of a
provider, `status.initialization.dataSecretCreated` for a bootstrap config,
a KubeadmConfig included (R2.82), and under the `v1beta1` contract
`status.ready`, or `status.initialized` for a control plane (R2.10, R2.11,
R2.38; internal/contract/bootstrap.go:36-46;
internal/contract/controlplane.go:182-192;
internal/contract/infrastructure_cluster.go:58-68;
internal/contract/infrastructure_machine.go:46-56). An infrastructure
machine pool is provisioned when either `status.initialization.provisioned`
or `status.ready` is true: the contract of `v1.14.4` names the first, and
the MachinePool controller of `v1.14.4` reads the second
(docs/book/src/developer/providers/contracts/infra-machinepool.md:313-315;
controllers/external/util.go:271-278;
core/reconcilers/machinepool/machinepool_controller_phases.go:284-289;
R2.66). A MachinePool with no Machine is Provisioning while its
`spec.replicas` is above zero and its `status.nodeRefs` is empty, as H2
says; at 0 replicas it is not, since its `status.nodeRefs` stays or becomes
empty with nothing to provision
(core/reconcilers/machinepool/machinepool_controller_noderef.go:72-104,
227-230). A kind of the operator is Provisioning as P14 says. These objects
provision with the kinds of H2 and D3, and each reports itself not ready
while it does: without the activity they would read Unhealthy, in the tone
of their health, for the whole creation of every cluster (R2.78, R2.83).

**D4.** Decided: an activity is Blocked only when the project names a
failure or a stop: a reason such as `InPlaceUpdateFailed`;
`CannotBeRemediated`, except when its message says that the Machine is
pending removal due to a rollout (P21); a lifecycle hook whose message says
that it is blocking; `ClusterCreating`; a deferred upgrade; and a pause
(P33). The text ` is blocked because`, which KubeadmControlPlane,
MachineSet and MachineDeployment add to the message of a scale, is never
read as Blocked: it stays in the message shown, and the tone of D2 tells a
wait that lasts. The same text carries the waits of the preflight checks,
which come with every creation of a control plane of several Machines,
every rollout and every topology upgrade, and which the project logs as on
hold until the checks pass
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:336-344,
381-389, 873-899;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/preflight.go:111-121,
166-217; core/reconcilers/machineset/machineset_preflight.go:143,
154-193), and real blocks, missing certificates, for which the preflight
check says that the intervention of the user is required, and a template
that does not exist
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/preflight.go:99-108;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:339-341,
888-890; core/reconcilers/machineset/machineset_controller_status.go:157-167;
core/reconcilers/machinedeployment/machinedeployment_status.go:290-294).
Read as Blocked, it made every normal rollout read blocked; read as a wait
within a clock, it needed the holds that D1 removes. The message, shown as
the project wrote it, says which.

**P18.** Proposed: at `v1.14.4`, D4 counts these, each a failure or a stop
that the project names:

- `Updating` `True` `InPlaceUpdateFailed` on a Machine (R2.45;
  core/reconcilers/machine/machine_controller_inplace_update.go:102-106).
- `Deleting` `True` `DeletingNode` on a Machine, which the controller writes
  only when it fails to delete the Node, with "Error deleting Node"
  (core/reconcilers/machine/machine_controller.go:666-676).
- On a deleting Cluster, a `TopologyReconciled` with the reason `Deleting`
  whose message says `Following hooks are blocking delete`, which the
  topology controller writes while a `BeforeClusterDelete` hook holds the
  deletion (core/reconcilers/topology/cluster/status.go:134-153;
  exp/topology/scope/hookresponsetracker.go:84-105). The reason
  `WaitingForBeforeDeleteHook` of its `Deleting` alone is progress: the
  Cluster controller writes it until the Cluster is marked as ready to be
  deleted, which happens at once when no extension serves the hook (R2.25;
  core/reconcilers/cluster/cluster_controller.go:347-352;
  core/reconcilers/topology/cluster/cluster_controller.go:560-571).
- `TopologyReconciled` `False` `ClusterCreating`, which is written only
  while a `BeforeClusterCreate` hook holds the creation (R2.23;
  core/reconcilers/topology/cluster/status.go:180-197); and the deferred
  reasons, an upgrade that the annotations hold (R2.23, R3.21;
  core/reconcilers/topology/cluster/status.go:263-301).
- A `ClusterUpgrading` whose message says
  `Following hooks are blocking upgrade`, which the topology controller
  writes for a hook that holds the upgrade
  (core/reconcilers/topology/cluster/status.go:240-243).
- The reasons of P21, for the remediation of a Machine and of its owner;
  and the steps of a kind of the operator that failed (P14).
- Any activity of an object that is paused (P33).

The text of a hook is matched anywhere in the message of the
`TopologyReconciled` of the Cluster, which the topology controller writes
itself, and never in an aggregate, which puts the message of a part under
its own line (util/conditions/merge_strategies.go:488-496, 561-596). The
message is read for meaning only there and for the remediation of P21
(P27), so a new wording in a later minor (R1.32) changes nothing but them,
which the drift watch checks.

**P19.** Proposed: the pause is also read from its request when the
`Paused` condition does not say it yet, for the kinds whose controllers
honour the request and as they honour it (R4.57, R4.58). For Cluster,
MachineDeployment, MachineSet, Machine, MachinePool, MachineHealthCheck,
KubeadmControlPlane and KubeadmConfig, and for an infrastructure cluster,
machine or machine pool and a control plane of a provider, whose contracts
ask the same of their controllers, the request is the annotation
`cluster.x-k8s.io/paused` on the object, by its presence, whatever its
value, or `spec.paused` of its Cluster
(docs/book/src/developer/providers/contracts/infra-cluster.md:538-542;
docs/book/src/developer/providers/contracts/infra-machine.md:526-530;
docs/book/src/developer/providers/contracts/infra-machinepool.md:354-358;
docs/book/src/developer/providers/contracts/control-plane.md:967-971). For
ClusterResourceSet, ClusterClass and ExtensionConfig it is their own
annotation alone (R2.3). For an IPAddressClaim it is the field or the
annotation of its Cluster, and not its own, as the contract of the book asks
of its provider (docs/book/src/developer/providers/contracts/ipam.md:37-41).
For the kinds of the operator there is none: no code of the operator reads
the annotation or the field. Among the kinds of Cluster API, the annotation
on a Cluster pauses only the Cluster (R4.57). The controllers check the
request before they write anything else (R2.2), so it is in effect from
their next reconcile, and a kind that writes no `Paused` condition, such as
an IPAddressClaim or many a provider object, has only the request. A pause
that is only requested has no time, since none is written.

**P20.** Proposed: a MachinePool is Scaling up while its `status.replicas` is
below `spec.replicas`, and Scaling down while it is above, unless its
annotation `cluster.x-k8s.io/replicas-managed-by` has a value other than
`"false"`, which says that something outside Cluster API sets the count, so
that `spec.replicas` is not the target; the project reads the annotation so
(util/annotations/helpers.go:68-71, 133-144). With either count unset, the
scale cannot be read, and the activity is Unknown (P1). A MachinePool writes
no `ScalingUp` or `ScalingDown` at `v1beta2` (R2.69); its phases `ScalingUp`
and `ScalingDown` compare `spec.replicas` with the deprecated count of ready
replicas, so they also report a Node that is not ready as a scale
(core/reconcilers/machinepool/machinepool_controller_phases.go:69-100), and
H2 forbids an activity from the phase alone; its `status.replicas` is the
count of instances of its provider (R2.66;
api/core/v1beta2/common_types.go:181-185).

**P21.** Proposed: a Machine is Remediating while its `OwnerRemediated` or
`ExternallyRemediated` condition is present. The activity is Blocked when
the reason says that the remediation cannot be started:
`CannotBeRemediated` for the first, which covers a control plane of one
replica, one that a remediation would break, a move of the etcd leader that
failed and a remediation that failed `maxRetry` times; and
`RemediationTemplateNotFound` or `RemediationRequestCreationFailed` for the
second. `CannotBeRemediated` with the message that the MachineSet writes for
a Machine that its rollout removes anyway, "Machine won't be remediated
because it is pending removal due to rollout", is no stop: the rollout
removes the Machine, and the activity is Progressing
(core/reconcilers/machineset/machineset_controller.go:1680-1692). It is
Unknown with `InternalError`, and Progressing with `WaitingForRemediation`,
with `MachineDeleting`, and with `RemediationDeferred`, which waits behind
the remediations in flight, for the preflight checks of a MachineSet, for a
version that the topology has not propagated yet, for another control plane
Machine that provisions or deletes, for a check of etcd, or for the retry
period after a failure
(R2.54; api/core/v1beta2/machine_types.go:329-360;
core/reconcilers/machineset/machineset_controller.go:1722-1787;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/remediation.go:190-208,
230-243, 246-282, 300-311, 322-330, 543-567). A Machine has no `Remediating`
condition; these two are present only while a remediation is pending
(R2.45). The `Remediating` of a Cluster, a MachineSet, a MachineDeployment
and a KubeadmControlPlane is Blocked when each of its Machines whose
`OwnerRemediated` is present is Blocked by this rule, one at least: the
owner keeps its own condition `True` while it writes that reason on its
Machines, which the view has in `machines`.

**P33.** Proposed: while an object is paused, every other activity it holds
is Blocked, with Paused next to it. Its controllers write only the `Paused`
condition while it is paused, so the other conditions keep the values they
had when it stopped (R2.2), and a paused object that is deleting stays so
until it is resumed (R4.60): the pause is the stop that the project
declares (R4.59).

**P34.** Proposed: the duration of an activity runs from the time that the
project wrote for its start (D2): the deletion timestamp; the transition of
its condition; for Provisioning, the creation of the Machine, of the oldest
Machine that makes an owner Provisioning, of the Cluster while its control
plane is not initialized, else of the start of the Provisioning of its part,
or of the object of P17 or P14; for Replacing, the deletion timestamp of the
oldest of the Machines that make it so. The duration is never longer than
the age of the object: the times of conditions are written with the clock
of a controller (util/conditions/setter.go:62-64) and the creation with that
of the API server, and the fixtures of SPEC-0002 write status by hand, so a
start before the creation counts from the creation. It is zero while the
start is after `now`, as the host shows it
(freelens:packages/utility-features/utilities/src/formatDuration.ts:55-61).
Where the project wrote no start, none is shown, and the activity counts as
past its threshold (P2): a pause that is only requested, a rollout held by
`spec.paused`, the scale of a MachinePool (P20) and the Provisioning of one
with no Machine, the Upgrading of a control plane, whose version changes
with no time, and that of a kind of the operator. The Upgrading of a Cluster
runs from the transition of its `TopologyReconciled` to `False`, the start
of the upgrade unless the condition was already `False` for another reason,
since its time changes only with its status
(core/reconcilers/topology/cluster/status.go:86-132).

### The weight of a condition

- A condition of positive polarity weighs Ok when `True` and Issue when
  `False`; one of negative polarity weighs Activity when `True` and At rest
  when `False`; any condition weighs Unknown when `Unknown` (H3). The list of
  conditions of the extension never shows a negative condition at rest as an
  error, as the drawer of the host does (R7.6).
- The polarity of a gate is the `polarity` of its entry: in
  `spec.availabilityGates` of a Cluster, or of its ClusterClass when the
  Cluster has none, and in `spec.readinessGates` of a Machine; `Negative`
  makes it negative, and `Positive` or an empty value positive (R2.21,
  R2.46; api/core/v1beta2/cluster_types.go:528-554;
  api/core/v1beta2/machine_types.go:535-551).
- A `TopologyReconciled` `False` with a reason other than `ReconcileFailed`
  and `ClusterClassNotReconciled` weighs Activity (H3); so do the conditions
  of P4 and P5. A `ProviderUpgraded` `False` that P14 finds stale weighs At
  rest. No other condition changes its weight while an activity is in
  flight (D1).
- **P22.** Proposed: a `TopologyReconciled` `False` with a reason that is
  not in the closed set of R2.23 weighs Unknown, and so does a gate with any
  `polarity` other than `Positive`, `Negative` and empty. H3 makes every
  reason but the two failures an activity, and R2.22 shows the project
  counting them as information; a reason that the release does not define
  belongs to a newer one, and the kit maps an unknown value to Unknown. The
  schema accepts only the two polarities
  (api/core/v1beta2/cluster_types.go:523-524), so the second case is tested
  at the unit layer only (kit, `docs/testing.md`, "The test environment has
  two tiers"). The health does not change either way, since a condition
  other than the summary that is `Unknown` is no issue (H1).
- **P23.** Proposed: a condition whose `observedGeneration` is below the
  `metadata.generation` of the object is marked as describing an older
  generation in the list of conditions. Each condition of `v1beta2` carries
  its own generation (R2.6), and one can lag behind the others.

### Freshness

The causes of H1 for which a health is marked stale, what is read for each,
and the time it holds from. A stale health keeps its value (H1).

| Cause                        | Kinds                                                                                      | What is read                                                                                                                                                                                                                                                              | Since                                                                       | Facts                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Paused                       | every kind with a status                                                                   | the activity Paused (P19)                                                                                                                                                                                                                                                 | the transition of `Paused` to `True`; none when the pause is only requested | H1, R2.2, R2.3, R4.57, R4.58                                                                |
| Older generation             | the kinds of R2.5, and the kinds of the operator                                           | `status.observedGeneration` below `metadata.generation`; for an ExtensionConfig and an IPAddressClaim, the generation of the condition that sums it up; for an object of a provider, `status.observedGeneration` when present, else that of the condition that sums it up | none: no time is written for it                                             | H1, R2.5, R2.6, R2.88; docs/book/src/developer/providers/contracts/infra-cluster.md:386-393 |
| Controller not available     | every kind with a status                                                                   | the availability of the controller of its provider, from `controllers` (P24)                                                                                                                                                                                              | the transition that `controllers` gives                                     | H1, R1.2, R2.88, R3.20                                                                      |
| Workload cluster unreachable | Machine, MachineSet, MachineDeployment, MachinePool, the control plane, MachineHealthCheck | the `RemoteConnectionProbe` of their Cluster is `False` while its `ControlPlaneInitialized` is `True` (P25)                                                                                                                                                               | the transition of `RemoteConnectionProbe` to `False`                        | H1, R2.30, R2.50, R2.80                                                                     |

An older generation means a change not yet processed, a reconcile that
fails, or a pause (R2.5), and the mark says which of these it can tell: the
pause is its own cause.

**P24.** Proposed: `controllers` gives, for the manifest label of each
provider, whether its controller is available, with the time of the last
change. A kind is served by the provider of the table below. Where the
Cluster API Operator installed the provider, the view reads it from the
`Ready` of the operator's object of that provider, which copies the
`Available` of the Deployment of the controller (R2.88); the object is named
after the provider and its kind gives the type, from which the manifest
label follows (R3.19; cmd/clusterctl/api/v1alpha3/labels.go:45-62). With no
such object the availability is Unknown: the result notes it, and marks
nothing, since a controller is not called unavailable on no evidence. H1
asks for the mark, and A2 reads the kinds of the operator; a management
cluster installed by `clusterctl` has only `Provider` objects, which have no
status (R2.87), and A2 and A12 give the views no other way to the
controllers. The operator copies that `Ready` with a check of its own, so
while the operator itself is stopped, the `Ready` keeps its last value
(cluster-api-operator:internal/controller/healthcheck/healthcheck_controller.go:160-209),
which no mark can tell, as after a restart of a controller (P25).

| Kinds                                                                                                                               | Provider                                                                                               | Facts                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Cluster, ClusterClass, Machine, MachineSet, MachineDeployment, MachinePool, MachineHealthCheck, ClusterResourceSet, ExtensionConfig | `cluster-api`                                                                                          | R1.1, R1.2                                            |
| KubeadmControlPlane                                                                                                                 | `control-plane-kubeadm`                                                                                | R1.2                                                  |
| KubeadmConfig                                                                                                                       | `bootstrap-kubeadm`                                                                                    | R1.2                                                  |
| IPAddressClaim                                                                                                                      | the label `cluster.x-k8s.io/provider` of the definition of the kind that its `spec.poolRef` names      | R1.15, R2.86, R3.20                                   |
| An object of a provider                                                                                                             | the label `cluster.x-k8s.io/provider` of its definition, which A2 already reads for the contract label | R1.2, R3.20, A2                                       |
| The kinds of the operator                                                                                                           | none: the Deployment of the operator carries no such label                                             | cluster-api-operator:config/manager/manager.yaml:7-16 |

**P25.** Proposed: the mark Workload cluster unreachable holds for the
Machines, MachineSets, MachineDeployments, MachinePools, the control plane
and the MachineHealthChecks of a Cluster whose `RemoteConnectionProbe` is
`False` while its `ControlPlaneInitialized` is `True`, and not for the
Cluster itself. `NodeReady` and `NodeHealthy` of a Machine, and the checks
of etcd and of the components of a KubeadmControlPlane, are read from the
workload cluster and keep their last value for a grace period, counted from
the later of the last probe that succeeded and the initialization of the
control plane, before they turn `Unknown` `ConnectionDown` (R2.50, R2.80;
core/reconcilers/machine/machine_controller_status.go:278-296); the other
kinds aggregate or count them (R2.66, R2.71, R2.92). Before the
initialization those conditions are `Unknown` `InspectionFailed`, with no
last value to keep, while the probe is `False` from the creation of the
Cluster (core/reconcilers/machine/machine_controller_status.go:262-276;
core/reconcilers/cluster/cluster_controller_status.go:311-324): the mark
would then say nothing true. The probe is the one input of the status of the
Cluster that comes from the workload cluster, and its `Available` counts it,
so the health of the Cluster already says it (R2.21, R2.30). After a restart
of the controller an old `True` of the probe stays until a probe succeeds or
five fail (R2.30), which no mark can tell.

The views show each cause next to the health, never in its place, with the
time it began when the project wrote one, through the duration component of
the host. A count of health in the overview keeps the number of stale ones
next to it, and never adds a stale health to the fresh ones without saying
so.

### The parsers

The tested parsers that A4 asks for. Each takes a value as the project
writes it and returns a typed value, or a value marked unknown that the
views show as it is written and never compare.

| Parser             | Input                              | Output                                                                 | A value it does not know                                          | Facts            |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------- |
| Contract label     | the labels of a definition         | the contract, `v1beta2` or `v1beta1`, and the version to request       | Unknown when no item is a version of the form of Kubernetes (P26) | A4, R1.16, R1.17 |
| Condition message  | the message of a condition         | its lines, nested by indentation, each with its bullet and its subject | kept as text, with its indentation (P27)                          | A4, R2.91, R2.92 |
| Kubernetes version | a version string                   | major, minor, patch, pre-release and build, and an order between two   | Unknown, never compared (P28)                                     | A4               |
| List annotation    | the key and value of an annotation | its items, each known or not                                           | kept, marked unknown (P29)                                        | A4, R3.21, R3.22 |
| Time               | a time as Kubernetes writes it     | the instant, Absent, or Unavailable                                    | Unavailable (P30)                                                 | A4, R2.6, R2.7   |

**Contract label.** It reads `cluster.x-k8s.io/v1beta2`, or, when that
label is missing or empty, `cluster.x-k8s.io/v1beta1`, ignores any other
contract label, splits the value on `_`, and takes the latest version in the
order of Kubernetes: a version with no `alpha` or `beta` first, then `beta`,
then `alpha`, then the higher major, then the higher minor (R1.16;
internal/contract/version.go:118-144, 183-195). The definitions of the core
carry no label, and those of kubeadm both (R1.17). It serves the references
of A2; a reference whose label gives nothing is shown as group, kind and
name, with no link (A2, S2).

- **P26.** Proposed: an item that is not `v` followed by a major and,
  optionally, `alpha` or `beta` and a minor, an empty item included, is left
  out of the choice, and with no item left the result is Unknown. The order
  of such items comes from a library of Kubernetes, which these sources do
  not hold, and a version the extension does not understand is not one it
  should request (A3).

**Condition message.** Each line keeps its indentation, whether it is a
bullet (`*` and a space after the indentation), its text, and, when the line
is one the project composes, its subject: the type of a line of a summary,
`* <Type>:`; the kind, the names and the count of the others in a line of an
aggregate, `* <Kind> <name>:`, `* <Kinds> <a>, <b>:` or
`* <Kinds> <a>, <b>, <c>, ... (<n> more):`; and the kind and the count of a
line that closes an aggregate, `And <n> <Kind or Kinds> <text>`
(util/conditions/merge_strategies.go:374-379, 490-494, 513-516). A line
indented under another is its child, as the project indents a message of
several lines under its bullet (util/conditions/merge_strategies.go:559-596).
The first line is the headline that a list shows. The names of objects in a
subject are what a view links.

- **P27.** Proposed: a line of any other shape, with tabs or an odd
  indentation for instance, is kept as text with its indentation; no line is
  dropped, merged or reordered, and the parser gives no meaning to any text.
  The project changes its messages across minors (R1.32), and the views show
  the message as the project wrote it. Two readings give meaning, each
  pinned to this release and checked by the drift watch, both where D4
  names a stop: the text of a hook in the `TopologyReconciled` of a Cluster
  (P18), and the message of a remediation that a rollout makes needless
  (P21). The text ` is blocked because` of a scale is shown, never read
  (D4).

**Kubernetes version.** It reads `spec.version`, `spec.topology.version`,
the entries of `status.versions` and of the plans of
`status.controlPlane.upgradePlan` and `status.workers.upgradePlan`, and
`status.version` of a control plane under the contract (R2.12, R2.14,
R2.75). The entries of `status.versions` are the versions that the kubelets
report, else those of the Machines
(internal/util/version/version.go:62-100). It accepts a semantic version
with the leading `v` that the webhooks require and add (R2.96, R2.97,
R2.99; core/webhooks/admission/machine.go:63, 119-122;
controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane.go:73,
323-326), and orders two versions as the project does when it decides that
a control plane is upgrading: by the precedence of semantic versions, then
by their build metadata, where numeric identifiers compare by number, a
number comes before a word, two different words cannot be ordered, and of
two equal lists the longer comes after (util/version/version.go:52-212;
internal/contract/controlplane.go:296-352). A control plane is Upgrading
when the project says so: when its `spec.version` comes after one of its
versions in status, or differs from it only by words of its build metadata
(internal/contract/controlplane.go:295-352). H2 says "differ"; a downgrade,
which the webhook of KubeadmControlPlane accepts as long as no minor is
skipped upward
(controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane.go:643-658),
is not Upgrading for the project, and reads Rolling out, from the
`RollingOut` that it brings.

- **P28.** Proposed: the same string without the leading `v` is accepted,
  and anything else, a version with two parts, a leading zero, a word or an
  empty string, is Unknown. A comparison with an Unknown is Unknown, and no
  activity is inferred from it: the activity reads Unknown in place of
  Upgrading or Idle (P1). A control plane whose `status.versions` is absent
  or empty, and whose `status.version` is absent or empty, is not
  upgrading, as the project reads it, since its first Machine is still
  provisioning (internal/contract/controlplane.go:296-299, 332-344); one
  with no `spec.version` has no version to upgrade to. Objects written
  without the webhooks, as on the first tier of SPEC-0002, carry what was
  written (R4.117), and the contract asks a control plane provider to add
  the `v`, not to refuse a version without it
  (docs/book/src/developer/providers/contracts/control-plane.md:396-399).
  The project parses these versions with the tolerant parser of the library
  it uses (go.mod:11), whose tolerance these sources do not hold: a version
  that the project reads and this parser does not is shown as written, and
  never guessed.

**List annotation.** It splits the value on commas, drops the empty items
and keeps each item once. Two annotations hold lists, and each is read as
its controller reads it:

- `runtime.cluster.x-k8s.io/pending-hooks`, on a Cluster:
  `AfterControlPlaneInitialized`, `AfterControlPlaneUpgrade`,
  `BeforeWorkersUpgrade`, `AfterWorkersUpgrade` and `AfterClusterUpgrade`;
  and on a Machine: `UpdateMachine` (R3.22;
  core/reconcilers/topology/cluster/reconcile_state.go:189, 426;
  exp/topology/desiredstate/desired_state.go:590, 687, 735-743;
  core/reconcilers/machineset/machineset_controller.go:414;
  controlplane/kubeadm/reconcilers/kubeadmcontrolplane/inplace_trigger.go:131;
  api/runtime/catalog/catalog.go:345-349). The items are not trimmed: the
  tracker of hooks matches an item exactly, so an item with a space is
  another item (internal/hooks/tracking.go:62-82, 174-200).
- `machineset.cluster.x-k8s.io/skip-preflight-checks`, on a MachineSet, a
  MachineDeployment or a bootstrap config template: `All`,
  `KubeadmVersionSkew`, `KubernetesVersionSkew`, `ControlPlaneIsStable` and
  `ControlPlaneVersionSkew` (R2.59, R3.21;
  api/core/v1beta2/common_types.go:144-154, 222-260). The items are trimmed,
  as the MachineSet controller trims them
  (core/reconcilers/machineset/machineset_preflight.go:240-277).

The internal annotations of in-place updates, which also hold lists, are not
read: the views do not show them (api/core/v1beta2/machineset_types.go:43-58).
The lists kept on Nodes are in the workload cluster, which the extension
never reads (R3.40, A2).

- **P29.** Proposed: an item that is not in the set of its key is kept as
  written and marked unknown. For the preflight checks, the views then say
  that it skips nothing, since the controller matches the names exactly
  (core/reconcilers/machineset/machineset_preflight.go:149-152); the names
  that the comment of the annotation itself gives, `KubeadmVersion`,
  `KubernetesVersion` and `ControlPlaneStable`, are such items
  (api/core/v1beta2/common_types.go:144-150). For the pending hooks, an item
  with a space is unknown for the same reason.

**Time.** It reads the times of R2.6 and R2.7, `lastTransitionTime`, Machine
`status.lastUpdated`, `status.certificatesExpiryDate` and the four start
times of `status.deletion`, KubeadmControlPlane `status.lastRemediation.time`
and the `lastAppliedTime` of a binding, and also `creationTimestamp`,
`deletionTimestamp` and the annotation
`machine.cluster.x-k8s.io/certificates-expiry`, which the project reads as
RFC 3339 (core/reconcilers/machine/machine_controller_phases.go:393-410). A
time the project left at zero is not written at all, and reads Absent
(api/core/v1beta2/machine_types.go:585, 606, 733-753). The views hand an
accepted time, as its original string, to the date and duration components
of the host
(freelens:packages/core/src/renderer/components/duration/reactive-duration.tsx:11-55).

- **P30.** Proposed: it accepts RFC 3339 with an upper case `T`, optional
  fractional seconds, and `Z` or a numeric offset, and checks every field
  against the calendar. Anything else is Unavailable: a date that does not
  exist, such as 30 February, an hour 24 or a second 60, is never rolled
  over into another date; the zero time of Go, `0001-01-01T00:00:00Z`, is
  Unavailable; and an Unavailable time is shown as N/A, never replaced by the
  current time. The kit shows only real times, and a time that makes no
  sense as unavailable (kit, `docs/design.md`, "Status"). A time ahead of the
  clock of the desktop is accepted, and the host shows its duration as `0s`
  (freelens:packages/utility-features/utilities/src/formatDuration.ts:55-61),
  and a duration from it is zero (P34).

### How a view uses it

- A view calls `statusOf` and `conditionsOf` for each object it shows, with
  the context it has. It computes them again whenever an input changes: the
  key of a memo holds the `metadata.uid` and `metadata.resourceVersion` of
  the object and of every object that its context carries, its Cluster, its
  ClusterClass, its Machines, its MachineHealthChecks, the objects behind
  `parts`, `machinePools` and `bindings`, and the version of `controllers`,
  together with the time that the result names. A memo keyed on the object
  alone, or on the array of a store, would keep an old result, and the two
  marks that matter when nothing else changes, a controller not available
  and a workload cluster not reachable, would never appear (AGENTS.md,
  "Rules That Fail Silently").
- A list shows the health and the activities as two marks, never pressed
  into one word (kit, `docs/design.md`, "Status"): the word of the health,
  which is the project's, in the tone of D2, and each activity with its
  state and its duration. The marks of freshness stand next to the health,
  and the headline of the message of the condition that sums the object up,
  truncated, with the whole message in its tooltip.
- The details show the same, the issues that make the object Degraded, the
  activity that sets the tone of its health with its threshold, the notes,
  and the list of conditions with their weights, the lines of each message
  nested, and the time of each transition.
- The overview and the tree count and mark from the same two calls, so that
  no view classifies by a rule of its own (SPEC-0001, "Status model").
- The views show the names of the closed sets as this spec writes them, and
  the reasons and messages of the project as the project wrote them.

### Tokens of the theme

**P31.** Proposed: the states map to the tokens of the kit, which the views
apply; the model has no color. The words carry the meaning without the
color, and the host's error class on a negative condition at rest is not
followed (kit, `docs/design.md`, "Status"; R7.6). The tone of progress of D2
takes `--colorInfo`, and not `--colorWarning`, which the kit gives to what
is pending, waiting or in progress: the warning of D2, past a threshold,
takes `--colorWarning`, and must stand apart from progress. The mark of an
activity takes the same tones: in progress within its threshold, that of
progress; past it, or Blocked, `--colorWarning`, which is never the color
of an error, whatever the activity; Unknown, `--colorVague`; Deleting
within its 15 minutes, Paused and Rollout paused, `--colorTerminated`. Idle
and the weight At rest keep `--colorInfo`, which they share with progress,
and their words tell them apart. The mark of remediation of a
MachineHealthCheck takes the token of the weight of `RemediationAllowed`
(P11), so that the mark and the condition next to it never disagree.

| State                                                                                                                              | Token               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Healthy; weight Ok                                                                                                                 | `--colorOk`         |
| Unhealthy or Degraded in the tone of progress; an activity in progress within its threshold; weight Activity; Idle; weight At rest | `--colorInfo`       |
| Degraded in the tone of its health; Unhealthy or Degraded in the tone of a warning; an activity past its threshold, or Blocked     | `--colorWarning`    |
| Unhealthy in the tone of its health; weight Issue                                                                                  | `--colorError`      |
| Deleting within its threshold; Paused; Rollout paused                                                                              | `--colorTerminated` |
| Unknown health; the activity Unknown; an activity whose state is Unknown; weight Unknown; a mark of freshness                      | `--colorVague`      |
| No health                                                                                                                          | none: the text N/A  |

### States that are not the happy one

The model has no loading or failed state of its own: it classifies what the
view hands it. A missing input never turns into a pass or a zero: it is
Unknown, or a note says what was not read (kit, `docs/design.md`, "States
that are not the happy one"). A field of the wrong type, such as a status
that is not an object, conditions that are not a list or a negative count,
makes the result Unknown, and the model never throws, so a view never loses
a panel to an object it cannot read.

### Safety

- **What it reads.** Nothing on its own: it is pure functions of the objects
  and the context that a view hands them. It sends no request, reads no
  store, no Secret, no clock and no storage, and keeps no state.
- **What it writes.** Nothing.
- **What it never touches.** The fields of KubeadmConfig, KubeadmControlPlane
  and their templates that hold a join token, a password, the content of a
  file or the credentials of a discovery (A3, R3.36): no rule reads a field
  of their specs other than `spec.replicas` and `spec.version`.
- **How the tests prove it.** The program of `src/common/` has neither the
  DOM nor Node, and Biome rejects a Node module there (AGENTS.md). A unit
  test reads the modules of both folders, the test files left out, and fails
  on an import from outside them, on `fetch`, `XMLHttpRequest`, `WebSocket`,
  `setTimeout`, `setInterval`, `Date.now`, a `new Date()` with no argument,
  `localStorage` and `indexedDB`, and on the paths under which the fields
  of R3.36 lie, matched from `spec`: `spec.files`, `spec.users`,
  `spec.initConfiguration`, `spec.joinConfiguration` and
  `spec.kubeadmConfigSpec`, which no rule reads; it is seen failing once on
  a line planted for the purpose (kit, `docs/testing.md`, "Checks worth
  trusting"). The test itself reads the files with a Node module, which
  tests may import (AGENTS.md, "Biome").

## Tests

### Unit

The cases start from the objects that SPEC-0002 captures from the real
project at the pinned release, each in a state that the views tell apart,
and pass as `now` the time of the capture, from which the fixtures keep
every time as an offset, or a time past a threshold when the case says so.
A case that needs a state the project does not produce on demand changes one
field of a captured object and says which; a value that the schema rejects is
written at this layer only (kit, `docs/testing.md`, "The test environment has
two tiers"). Every closed set has a case for each of its values, and a case
where a value it does not know maps to Unknown.

- `src/common/parsers/time.test.ts`: a time as Kubernetes writes it; with
  fractional seconds and an offset, as the annotation of the expiry of the
  certificates may carry; absent, null and empty, which read Absent; 30
  February, 29 February of a year that is not a leap year, a month 13, an
  hour 24 and a second 60, which read Unavailable and are never rolled over;
  29 February of a leap year, which is accepted; a lower case `t` or `z`, a
  space in place of the `T`, a date with no time and a number, which read
  Unavailable; the zero time of Go, which reads Unavailable.
- `src/common/parsers/kubernetes-version.test.ts`: `v1.37.0`, and `1.37.0`
  read the same; pre-releases order before their release, and among
  themselves by the rules of semantic versions; build metadata ordered as
  the project orders it, by number, a number before a word, two different
  words not ordered, and the longer of two equal lists after; `v1.37`,
  `v1.037.0`, `latest`, an empty string and four parts read Unknown; a
  comparison with an Unknown is Unknown.
- `src/common/parsers/contract-label.test.ts`: `v1beta2` alone, as on the
  definitions of kubeadm; `v1beta1_v1beta2`; `v1alpha3_v1alpha4_v1beta1`; a
  version with no stability suffix above `v1beta2`; the `v1beta1` label
  used when the `v1beta2` one is missing and when it is empty; another
  contract label ignored; no label, as on the definitions of the core, which
  reads Unknown; only items that are not versions, which read Unknown; empty
  items between two `_`, left out.
- `src/common/parsers/condition-message.test.ts`: an empty message; one
  line; a summary of three bullets, each with its type; a message of
  several lines nested under its bullet; the three forms of a line of an
  aggregate and the line that closes it; a headline followed by bullets, as
  a scale up that waits writes it; the message of `ClusterUpgrading`, whose
  bullets are indented under the headline; tabs, odd indentation, a `*`
  with no space and a line ending in a carriage return, kept as text; for
  every message of the fixtures of SPEC-0002, as many lines out as in.
- `src/common/parsers/list-annotation.test.ts`: two pending hooks; empty
  items and a repeated item; a hook with a space, kept and unknown; a hook
  name outside the set, kept and unknown; `All`; two checks with a space
  after the comma, trimmed; the names of the comment of the annotation,
  marked unknown and skipping nothing; an absent annotation and an empty
  value, which give no item.
- `src/common/status/conditions.test.ts`: each of the seven negative types,
  `True` and `False`; a positive type, `True` and `False`; `Unknown`, a
  missing status and a status `Maybe`; a gate declared `Negative` on the
  Cluster, and on its ClusterClass when the Cluster has none; a gate with a
  `polarity` outside the set; `TopologyReconciled` `False` with each reason
  of R2.23, and with a reason outside it; the conditions of P4 and P5,
  which weigh Activity; the wait of P14, which weighs Issue, and a stale
  `ProviderUpgraded`, which weighs At rest;
  a condition with an older `observedGeneration`; a condition of a provider
  with a `severity`; the order of the conditions as stored; the two lists of
  a provider object, `status.v1beta2.conditions` taken whole when present.
- `src/common/status/health.test.ts`: the summary `True` with no other
  issue; `True` with another positive condition `False`; `False`;
  `Unknown`, missing, and with a status outside the set; no status at all;
  a negative condition `True` and a condition other than the summary
  `Unknown`, which change nothing; a deleting object, which has no health;
  an object that provisions, rolls out, scales, replaces a Machine or
  updates in place, whose word of health is the project's before and after
  each threshold; a MachineDeployment whose only `False` conditions are of
  the family of P4, Healthy during a rollout, under `OnDelete` and with its
  rollout paused, and a Machine that waits for `minReadySeconds`, Healthy;
  a stale mark, which changes nothing; a field of the wrong type, which
  gives Unknown and does not throw.
- `src/common/status/tone.test.ts`: Unhealthy and Degraded in the tone of
  progress, then of a warning past the threshold, and in the tone of their
  health with Idle, Unknown, Paused and Blocked; Healthy and Unknown, whose
  tone never changes; a Cluster in the tone of progress through a part; the
  threshold of a Machine with two MachineHealthChecks above zero, the
  shortest winning, with one or every one at 0, which give 600 seconds, and
  with none; an owner Provisioning, dated from its oldest Machine, with the
  threshold of that Machine; Updating at 9 and at 11 minutes from the
  transition of `Updating`; Replacing at 15 minutes less one second and at
  15 minutes and one second from the oldest deletion; Scaling down from its
  transition; a Cluster's own Provisioning at 29 and at 31 minutes; a worker
  Machine created one minute after its Cluster, still in the tone of
  progress at minute 25 though past its own threshold; several activities,
  one within its threshold; an activity with no start written, which gives
  no tone of progress; a kind of the operator at 600 seconds; the earliest
  time at which the tone changes. What an object takes for its tone: a
  Machine with a Node that is not yet `Ready` or `Available`, young and past
  its threshold; a Machine that waits for `minReadySeconds`, Healthy itself,
  seen from its MachineSet and its MachineDeployment, which read Unhealthy in
  the tone of progress; a MachineSet during an in-place update of one of its
  Machines, Unhealthy and Idle in the tone of progress, then of a warning
  past the threshold of the update; a KubeadmControlPlane of one replica
  before its initialization, in the tone of the first provisioning of its
  Cluster, and after it, in that of its Machine until the Machine is
  `Available`; an object of a Cluster, its control plane included, in the
  tone of the first provisioning of the Cluster, and not after its control
  plane is initialized; a Cluster with a MachineDeployment scaling up and an
  unrelated Unhealthy object, which keeps the tone of its health while the
  MachineDeployment and the Cluster take the tone of progress; a
  ClusterResourceSet during the creation of a Cluster that it selects,
  Unhealthy in the tone of progress while that Cluster is in its first
  provisioning and cannot be reached, and in the tone of its health past
  it; and the activity that sets the tone, in the result.
- `src/common/status/activity.test.ts`: each activity of the closed set from
  each of its sources, and Idle; several at once, in the order of H2;
  Rollout paused in place of Rolling out; a MachineDeployment under
  `OnDelete` with `RollingOut` `True`, which shows the note of P4 and not
  Rolling out, a MachineSet and a Machine not up to date, with the note, and
  a Cluster whose parts that roll out are all under `OnDelete`, with the
  note; a Machine in each phase, Provisioning in `Pending`, `Provisioning`
  and `Provisioned` whatever its age, with a Node and not `Available` while
  it is younger than its threshold and not after it, and while it waits for
  `minReadySeconds` whatever its age; an owner Provisioning since its oldest
  such Machine; Replacing for a Machine deleted by hand, for a remediation
  and for a rollout with `maxUnavailable` 1, and not for a scale down, for a
  rollout that surges, once the deleting Machine is gone, or while the owner
  is deleting; a
  Cluster Provisioning until its control plane is initialized, and again
  through a part that is; a MachinePool with no Machine, Provisioning while
  it has no Node and never at 0 replicas; the activities of a control plane
  of a provider that writes the three conditions, and of one that writes
  none, which reads Unknown, as its Cluster does with it in `parts`; a
  MachinePool, whose activity is never Idle; an owner or a Cluster without
  its Machines or parts, Unknown and noted; a condition of an activity that
  is `Unknown`, one with `InternalError`, an object with no status and a
  version that does not parse, each giving Unknown and never Idle; a control
  plane that the project calls upgrading, with a greater version and with
  other words of build metadata, one with no version in its status or an
  empty one, and a downgrade, which reads Rolling out and not Upgrading;
  each case of Blocked of D4, P14, P18, P21 and P33; `CannotBeRemediated`
  for a Machine that a rollout removes, Progressing; an owner whose Machines
  in remediation are all Blocked, Blocked; `WaitingForBeforeDeleteHook`
  alone, Progressing, and with the text of a blocking hook in
  `TopologyReconciled`, Blocked; a scale whose message says
  ` is blocked because`, from KubeadmControlPlane, MachineSet and
  MachineDeployment, missing certificates and a missing template included,
  Progressing, with its message; a reason outside the set, which gives the
  state Unknown; the annotation `replicas-managed-by` with the value
  `"false"`, read as absent, and with another value; a kind of the operator
  whose upgrade failed, Upgrading and Blocked, and not Provisioning; the
  duration of each activity of P34, never longer than the age of the object,
  zero when its start is after `now`, and none where none is written, and
  the Provisioning of a MachineDeployment created a year before a rollout,
  dated from its new Machine.
- `src/common/status/freshness.test.ts`: a pause from the condition, from
  the annotation with the value `"false"`, and from `spec.paused` of the
  Cluster, for a kind that honours both and for each of the three that
  honour only the annotation; an IPAddressClaim paused by the annotation of
  its Cluster and not by its own; a kind of the operator with the
  annotation, not paused; an older generation from the status, from the
  condition that sums up an ExtensionConfig and an IPAddressClaim, and not
  judged without either; a controller available, not available and
  unknown, the last noted and marking nothing; a Cluster whose probe is
  `False` after its initialization, which marks its Machines, MachineSets,
  MachineDeployments, MachinePools, control plane and MachineHealthChecks
  and not itself, and one whose probe is `False` before it, which marks
  nothing.
- `src/common/status/cluster.test.ts`, `cluster-class.test.ts`,
  `machines.test.ts`, `health-checks.test.ts`, `control-plane.test.ts`,
  `add-ons.test.ts` and `providers.test.ts`: every row of the tables of
  each kind, every exception of H1 and every rule that concerns the kind,
  each phase of each closed set and a phase outside it; for the
  KubeadmControlPlane, its checks `False` while a Machine joins, an etcd
  member with no Machine yet included, Degraded in the tone of progress; for
  the MachineHealthCheck, with and without the Machines of its targets, and
  the two values of its mark of remediation, each with the token of its
  weight; for the ClusterResourceSet, the binding of a Cluster that cannot
  be reached yet, Unhealthy, in the tone of progress while that Cluster is
  in its first provisioning and in that of its health after it, and an
  `InternalError`
  with no such binding; for the operator, the wait for the
  core provider before and after its threshold, with and without a
  `CoreProvider` object, an upgrade whose manifests cannot be fetched, and a
  `ProviderUpgraded` `False` after the version is set back, stale and no
  issue.
- `src/common/status/index.test.ts`: the condition that sums up each kind is
  the one that `clusterctl describe` shows for it, `Available` on a Cluster,
  a MachineDeployment and a control plane, else `Ready`, and `Ready` on a
  Machine and on the other objects of a provider, and neither MachineSet
  nor MachinePool has one there (R4.22, R4.33); an object of a kind the
  model does not know is Unknown with a note.
- `src/common/status/purity.test.ts`: the check of Safety, seen failing on a
  planted line.

Each case of `tone.test.ts` that turns progress into a warning fails against
a tone with no end, and each case of `health.test.ts` that reads the word
of the project fails against a rule that holds a health.

The fixtures of SPEC-0002 give these results. Each case first asserts, on
the fixture, the conditions that its row names, so that a capture in
another state fails as such and not as a fault of the model. Each passes
`controllers` with every provider available, since that tier installs with
`clusterctl` and has no object of the operator (SPEC-0002, "Design"), so
that no note of P24 appears. "At the capture" passes the time of the
capture as `now`, and "past the threshold" a time past the threshold of
every activity of the row and past the 30 minutes of its Cluster (D2).
Every row but "A Cluster provisioning" is read after those 30 minutes: when
the capture falls within them, the case moves the creation of the Cluster
back by 30 minutes, the one field it changes.

| State of the fixture                    | Object                                                                                              | The fixture has                                                                                                                                                                            | Health                                                                          | Tone of the health                                                                                                               | Activities                                                                                                                                                                                                         | Marks and notes                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A Cluster provisioning                  | the Cluster                                                                                         | `ControlPlaneInitialized` not `True`, `Available` `False`, a creation less than 30 minutes before the capture                                                                              | Unhealthy                                                                       | at the capture, progress; past the threshold, a warning                                                                          | Provisioning since its creation, and Scaling up when its `ScalingUp` is `True`                                                                                                                                     | none                                                                                 |
| A Cluster provisioning                  | its KubeadmControlPlane                                                                             | `status.initialization.controlPlaneInitialized` unset                                                                                                                                      | Unhealthy                                                                       | at the capture, progress; past the threshold, a warning                                                                          | Provisioning while a Machine of it has no Node, since its creation, and Scaling up when its `ScalingUp` is `True`                                                                                                  | none                                                                                 |
| Provisioned and healthy                 | the Cluster, its control plane, MachineDeployments, MachineSets, Machines and KubeadmConfigs        | every summary `True`, no other positive condition `False`, no condition of an activity `True`, every Machine `Ready`                                                                       | Healthy                                                                         | that of its health                                                                                                               | Idle                                                                                                                                                                                                               | none                                                                                 |
| Provisioned and healthy                 | its templates and its bindings                                                                      | no status                                                                                                                                                                                  | none: no status                                                                 | none                                                                                                                             | none                                                                                                                                                                                                               | none                                                                                 |
| A Machine that never got a Node         | the Machine                                                                                         | phase `Provisioned`, no `status.nodeRef`, `BootstrapConfigReady` and `InfrastructureReady` `True`, `NodeHealthy` `Unknown`, no `HealthCheckSucceeded`                                      | Unknown                                                                         | that of its health                                                                                                               | Provisioning since its creation, in the tone of progress at the capture and of a warning past the threshold                                                                                                        | none                                                                                 |
| A Machine that never got a Node         | its MachineSet                                                                                      | fewer available Machines than `spec.replicas`, that Machine the only one not available, every replica created                                                                              | Unhealthy                                                                       | at the capture, progress; past the threshold of that Machine, a warning                                                          | Provisioning since the creation of that Machine                                                                                                                                                                    | none                                                                                 |
| A Machine that never got a Node         | its MachineDeployment and its Cluster                                                               | the `Available` of the MachineDeployment `False` for that Machine alone, and that of the Cluster `False` through `WorkersAvailable` only                                                   | Unhealthy                                                                       | at the capture, progress, the Cluster through its MachineDeployment; past the threshold, a warning                               | Provisioning since the creation of that Machine, for both                                                                                                                                                          | none                                                                                 |
| Rolling out                             | the MachineDeployment                                                                               | its strategy `RollingUpdate`, `RollingOut` `True`, `Available` `True`, `MachinesReady` and `MachinesUpToDate` `False`, each Machine not `Ready` with no Node at the capture, none deleting | Degraded, from `MachinesReady`; `MachinesUpToDate` is no issue (P4)             | at the capture, progress; past the threshold of each activity, a warning                                                         | Rolling out since its transition; Provisioning since the creation of its new Machine; Scaling up and Scaling down when their conditions are `True`                                                                 | none                                                                                 |
| Rolling out                             | its Cluster                                                                                         | `RollingOut` `True`, `Available` `True`, `WorkerMachinesReady` and `WorkerMachinesUpToDate` `False`                                                                                        | Degraded, from `WorkerMachinesReady`; `WorkerMachinesUpToDate` is no issue (P4) | at the capture, progress; past the threshold of its activities and of those of its parts, a warning                              | Rolling out, and Provisioning through its MachineDeployment                                                                                                                                                        | none                                                                                 |
| Scaling                                 | a MachineDeployment scaling up                                                                      | `ScalingUp` `True`, `Available` `False`, `maxUnavailable` 0, fewer Machines than `spec.replicas`                                                                                           | Unhealthy                                                                       | at the capture, progress; past the threshold, a warning                                                                          | Scaling up, Progressing also when its message says ` is blocked because`; Provisioning while a Machine of it has no Node                                                                                           | none                                                                                 |
| Scaling                                 | a MachineDeployment whose Machines are created                                                      | `ScalingUp` `False`, `Available` `False`, `maxUnavailable` 0, each Machine not available with no Node at the capture                                                                       | Unhealthy                                                                       | at the capture, progress; past the threshold, a warning                                                                          | Provisioning since the creation of the oldest new Machine                                                                                                                                                          | none                                                                                 |
| Scaling                                 | the Cluster of that MachineDeployment                                                               | `Available` `False` through `WorkersAvailable` only                                                                                                                                        | Unhealthy                                                                       | as its MachineDeployment                                                                                                         | Provisioning through its MachineDeployment, and Scaling up while its `ScalingUp` is `True`                                                                                                                         | none                                                                                 |
| Scaling                                 | a MachineDeployment scaling down                                                                    | `ScalingDown` `True`, `Available` `True`, a Machine deleting for less than 15 minutes at the capture                                                                                       | Degraded when `MachinesReady` is `False`, Healthy when it is `True`             | when Degraded, progress at the capture and a warning past 15 minutes from the transition of `ScalingDown`; when Healthy, its own | Scaling down                                                                                                                                                                                                       | none                                                                                 |
| Paused                                  | the Cluster and its objects with a status                                                           | `Paused` `True`                                                                                                                                                                            | the health that their conditions give                                           | that of its health                                                                                                               | Paused, and every other activity Blocked                                                                                                                                                                           | Paused, since the transition of `Paused`                                             |
| Deleting                                | the Cluster                                                                                         | a deletion timestamp, `Deleting` `True`                                                                                                                                                    | none: deleting                                                                  | none                                                                                                                             | Deleting, Progressing with the stage of its reason, `WaitingForBeforeDeleteHook` included, or Blocked with the text of a blocking hook in `TopologyReconciled`; past 15 minutes, its mark in the tone of a warning | none                                                                                 |
| With a managed topology, upgrading      | the Cluster                                                                                         | `TopologyReconciled` `False` `ClusterUpgrading`, `RollingOut` `True`                                                                                                                       | the health that its `Available` gives                                           | when Unhealthy or Degraded, progress while it or a part has an activity within its threshold; when Healthy, its own              | Upgrading since the transition of `TopologyReconciled`, Progressing, or Blocked with the text of a hook; Rolling out                                                                                               | none                                                                                 |
| Without a managed topology              | the Cluster                                                                                         | no `spec.topology`, no `TopologyReconciled`, every summary `True`, no condition of an activity `True`                                                                                      | Healthy                                                                         | that of its health                                                                                                               | Idle                                                                                                                                                                                                               | none                                                                                 |
| With MachinePools only                  | the Cluster                                                                                         | `Available` `True`, `ControlPlaneMachinesReady` `False`, `WorkersAvailable` `True` `NoWorkers`, no condition of an activity `True`                                                         | Degraded, where the project says available                                      | that of its health, unless a part has an activity in progress                                                                    | Idle, unless a part is Provisioning                                                                                                                                                                                | none                                                                                 |
| With MachinePools only                  | a MachinePool with Machines                                                                         | its Machines not `Ready`, each with no Node at the capture                                                                                                                                 | Unhealthy                                                                       | at the capture, progress; past the threshold, a warning                                                                          | Provisioning since the creation of the oldest of them, Scaling up or Scaling down as P20 reads its counters, and Unknown                                                                                           | none                                                                                 |
| With MachinePools only, written by hand | a MachinePool without Machines                                                                      | no Machine, `spec.replicas` above zero                                                                                                                                                     | Unknown                                                                         | that of its health                                                                                                               | Provisioning while its `status.nodeRefs` is empty, with no duration; Scaling up or Scaling down as P20 reads its counters; Unknown                                                                                 | the reason, and the deprecated `v1beta1` `Ready`                                     |
| With MachinePools only, written by hand | the same MachinePool at 0 replicas                                                                  | `spec.replicas` set to 0, the one field the case changes, and no `status.nodeRefs`                                                                                                         | Healthy                                                                         | that of its health                                                                                                               | Scaling down while its `status.replicas` is above 0, and Unknown; never Provisioning                                                                                                                               | none                                                                                 |
| With MachinePools only, written by hand | its Cluster                                                                                         | that MachinePool, and the conditions of the first row of MachinePools only                                                                                                                 | as that row: the pool adds no issue                                             | as that row                                                                                                                      | as that row                                                                                                                                                                                                        | one MachinePool of unknown health                                                    |
| A remediation in progress               | the Machine                                                                                         | `HealthCheckSucceeded` `False`, `OwnerRemediated` `False` `WaitingForRemediation`, not deleting                                                                                            | Unhealthy                                                                       | at the capture, progress; past the threshold of its remediation, a warning                                                       | Remediating, Progressing                                                                                                                                                                                           | none                                                                                 |
| A remediation in progress               | its MachineSet and MachineDeployment                                                                | that Machine not available and not deleting, `Remediating` `True`                                                                                                                          | Unhealthy                                                                       | at the capture, progress; past the threshold of the remediation, a warning                                                       | Remediating; Replacing once that Machine deletes                                                                                                                                                                   | none                                                                                 |
| Objects with no status                  | Cluster, Machine, MachinePool, KubeadmControlPlane, KubeadmConfig, MachineDeployment and MachineSet | no status, no Machine                                                                                                                                                                      | Unknown                                                                         | that of its health                                                                                                               | Unknown                                                                                                                                                                                                            | the inputs that the case does not give                                               |
| Objects with no status                  | MachineHealthCheck, ClusterResourceSet, ClusterClass, ExtensionConfig and IPAddressClaim            | no status                                                                                                                                                                                  | Unknown                                                                         | that of its health                                                                                                               | Unknown                                                                                                                                                                                                            | the inputs that the case does not give, and for a ClusterResourceSet the note of P12 |
| Objects with no status                  | each kind with no status                                                                            | no status                                                                                                                                                                                  | none: no status                                                                 | none                                                                                                                             | none                                                                                                                                                                                                               | none                                                                                 |

### In Freelens

None: this spec adds no view. The specs of the views check the model in
Freelens, on the fixtures of SPEC-0002.

### With the real project: S7

S7 of SPEC-0001 says that a Cluster with no reference and no topology
reports `Unknown` on the conditions of the missing parts, and so is never
available (R2.27).

**P32.** Proposed: S7 is tried as three cases, since the webhook of Cluster
refuses a Cluster that has neither `spec.controlPlaneRef`,
`spec.infrastructureRef` nor `spec.topology`
(core/webhooks/admission/cluster.go:183-191): the trial of the case of S7
as written is that refusal, and each half of R2.27 is tried on a Cluster
that has the other reference. The project runs a Cluster of the second
kind, with an infrastructure reference and a control plane Machine of its
own, in its own end-to-end tests
(test/e2e/data/infrastructure-docker/main/cluster-template-kcp-adoption/step1/cluster-with-cp0.yaml:1-75;
test/e2e/kcp_adoption.go:140-159), and the trial builds its objects from the
schemas, with that file as a reference only.

The trial is a test of the real tier of SPEC-0002, in the job with the real
project, in a namespace of its own that it deletes at the end, as it does
the objects; it records its outcome under "Notes and deviations".

1. A server-side dry run of a Cluster with neither reference nor topology is
   refused by the webhook of Cluster, on the field `spec`, and writes
   nothing.
2. A Cluster with `spec.infrastructureRef` to an infrastructure cluster of
   the development provider, no `spec.controlPlaneRef` and no topology,
   labelled so that the ClusterResourceSet of the tier selects it and
   applies its network add-on; and one control plane Machine with its
   KubeadmConfig and infrastructure machine.
3. A Cluster with `spec.controlPlaneRef` to a KubeadmControlPlane, no
   `spec.infrastructureRef` and no topology.

Expected, from the code; the trial confirms or corrects each row:

| Case | What is read              | Expected                                                                                                                                                                                                                                                      | Facts                                                                                                                                 |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | `ControlPlaneAvailable`   | `Unknown` `InternalError`, for good                                                                                                                                                                                                                           | R2.27                                                                                                                                 |
| 2    | `InfrastructureReady`     | `True`, mirrored from the infrastructure cluster                                                                                                                                                                                                              | R2.26                                                                                                                                 |
| 2    | `ControlPlaneInitialized` | `True` once the Machine has a Node; `status.initialization.controlPlaneInitialized` stays unset                                                                                                                                                               | R2.11, R2.28                                                                                                                          |
| 2    | `RemoteConnectionProbe`   | `True` once the workload cluster answers, through the Secret `<cluster>-kubeconfig` that the Cluster controller creates                                                                                                                                       | R2.30, R3.26                                                                                                                          |
| 2    | `WorkersAvailable`        | `True` `NoWorkers`                                                                                                                                                                                                                                            | R2.29                                                                                                                                 |
| 2    | `Available`               | `False` until the probe first succeeds, then `Unknown` `AvailableUnknown`, never `True`                                                                                                                                                                       | R2.21, R2.22, R2.27, R2.30, R2.90                                                                                                     |
| 2    | The model                 | Unhealthy until the probe first succeeds, then Unknown, with the note of P7; Provisioning until `ControlPlaneInitialized` is `True`, then Idle; while Unhealthy and Provisioning, in the tone of progress for 30 minutes from its creation, then of a warning | P7, D1, D2, D3, H2                                                                                                                    |
| 3    | `InfrastructureReady`     | `Unknown` `InternalError`, for good; `status.initialization.infrastructureProvisioned` true at once                                                                                                                                                           | R2.10, R2.27                                                                                                                          |
| 3    | `ControlPlaneAvailable`   | `False`, mirrored from a KubeadmControlPlane that is not initialized                                                                                                                                                                                          | R2.26, R2.78                                                                                                                          |
| 3    | `RemoteConnectionProbe`   | `False` `ProbeFailed`, not established yet: the KubeadmControlPlane waits for an endpoint, writes no kubeconfig, and no probe runs                                                                                                                            | R2.30, R2.75, R3.26; core/reconcilers/cluster/cluster_controller_status.go:311-324; controllers/clustercache/cluster_cache.go:483-519 |
| 3    | `Available`               | `False`, never `True`                                                                                                                                                                                                                                         | R2.21, R2.27                                                                                                                          |
| 3    | The model                 | Unhealthy, with the note of P7; Provisioning for good, since its control plane is never initialized; in the tone of progress for 30 minutes from its creation, then of a warning                                                                              | P7, D1, D2, D3, H2                                                                                                                    |

### Manual verification

None.

## Notes and deviations

Every rule below is proposed in this draft, or decided under the delegation
for M1, for the review of the milestone to confirm or reopen. Each adds to
H1 to H3, or departs from them or from the design rules of the kit, and the
last column says why it stays within them, or why it departs:

| Rule   | What H1 to H3, or the kit, say                                                                                                                                                                                                          | What the rule adds or changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1     | Degraded when the summary is `True` and another positive condition is `False`; the conditions that a normal rollout or scale down turns `False` do not make the object Degraded while that activity lasts, and the spec names them (H1) | No condition leaves the health while an activity is in flight, but the pending changes of P4 and P5: the object reads Degraded or Unhealthy as the project reports it, and the tone of D2 says that the activity lasts; P3 is removed                                                                                                                                                                                                                                                              | It departs from that exception of H1 in the word and keeps it in the tone: every rule that held a health left a case where an issue was hidden or a normal operation read broken, and the conditions of the project have neither fault                                                                                                                                                                 |
| D2     | An object that is provisioning and Unhealthy is shown as provisioning until the time the project allows a Node to start, then as Unhealthy (H2); lifecycle and health are not pressed into one mark (kit, `docs/design.md`, "Status")   | The mark of health keeps its word, and takes the tone of progress while an activity is in progress within its threshold, then of a warning; three thresholds, which change only a tone; every object of a Cluster in its first provisioning takes that first provisioning for its tone, and a ClusterResourceSet that of the Clusters that it cannot reach yet; after it, a part lends its tone only along its chain, its Machines to their owner and the owner to the Cluster, never to a sibling | "Shown as provisioning first" becomes the tone of progress. The word stays the project's and the activity keeps its own mark, so the two are not pressed into one word; the tone of the health follows the activity, which the kit does not foresee                                                                                                                                                    |
| D3     | Provisioning for a Cluster until its control plane is initialized, a Machine until it has a Node, a MachinePool until it reports its Nodes, and never an activity from the phase alone (H2)                                             | The Provisioning of a Machine read from its phase, and also while it is not `Available` within its threshold and while it waits for `minReadySeconds`; that of an owner from its Machines; that of a Cluster also while a part provisions; Replacing, a new member of the closed set                                                                                                                                                                                                               | The three phases are those that the project computes for a Machine with no Node, from the fields that H2 would read; a Machine that has its Node is not ready at once, and a provider can call it provisioned before its bootstrap ends; an owner or a Cluster whose Machines provision does provision; a deletion that leaves an owner short shows no activity of the project, and Replacing names it |
| D4     | An activity whose reason or message says that it failed or is blocked is shown as blocked (H2)                                                                                                                                          | Blocked only for what the project names as a failure or a stop; ` is blocked because` is never Blocked                                                                                                                                                                                                                                                                                                                                                                                             | It departs: that text carries both the waits of every normal creation and rollout and real blocks, the model cannot tell them apart, and the message shown says which; the tone turns a wait that lasts into a warning                                                                                                                                                                                 |
| P1     | Activity is a closed set, Idle when none holds; a blocked activity is not progress (H2)                                                                                                                                                 | The value Unknown in place of Idle when a source cannot be read, a MachinePool and a Cluster whose control plane writes no activity included; a state Unknown for an `InternalError` or an undefined reason; the activities of a control plane of a provider                                                                                                                                                                                                                                       | H2 takes the activities from their conditions, and an unreadable condition is no evidence of Idle; the kit maps an unknown value to Unknown, never to a guess                                                                                                                                                                                                                                          |
| P2     | Three thresholds (D2)                                                                                                                                                                                                                   | Which threshold each activity takes, from which start; the 30 minutes of a Cluster as a floor for what starts within them; an activity with no start written counts as past its threshold; with several activities, progress while one is within its threshold                                                                                                                                                                                                                                     | Each activity takes the threshold of what it waits on; the floor covers what waits on the first provisioning, as a worker waits for its control plane                                                                                                                                                                                                                                                  |
| P4, P5 | A positive condition `False` is an issue (H3), and Degraded outside the summary (H1); Rolling out from the condition of that name, `True` (H2)                                                                                          | `UpToDate` and its aggregates, and `Available` waiting for `minReadySeconds`, weigh Activity and are no issue; under `OnDelete`, a `RollingOut` `True` shows as a note that the Machines differ from the spec, not as Rolling out                                                                                                                                                                                                                                                                  | They say that a change is pending, not that something is wrong: they are `False` during every rollout, under `OnDelete`, while a rollout is held and while a ready Machine waits; under `OnDelete` the controller replaces a Machine only once the user deletes it, so nothing rolls until then                                                                                                        |
| P8     | An older generation is a mark, not a change of health (H1)                                                                                                                                                                              | The mark of a ClusterClass says that its Clusters do not reconcile                                                                                                                                                                                                                                                                                                                                                                                                                                 | It keeps H1, and adds what R2.34 says of the class                                                                                                                                                                                                                                                                                                                                                     |
| P10    | A MachinePool without Machines is Unknown (H1)                                                                                                                                                                                          | `spec.replicas` 0 with no Machine is Healthy                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Nothing whose readiness is unknown exists                                                                                                                                                                                                                                                                                                                                                              |
| P11    | The health counts the unhealthy targets, and the remediation allowed or not is apart (H1)                                                                                                                                               | Healthy when the targets that are not healthy are only starting, deleting or inside a timeout; never Unhealthy; Unknown without the targets                                                                                                                                                                                                                                                                                                                                                        | It counts the targets that the check marks unhealthy, as H1 says                                                                                                                                                                                                                                                                                                                                       |
| P12    | The health is read from the bindings, Cluster by Cluster (H1)                                                                                                                                                                           | Degraded when a binding misses a resource or has not applied it while `ResourcesApplied` is `True`; Unhealthy, as the project says, while a Cluster of its bindings cannot be reached yet                                                                                                                                                                                                                                                                                                          | The project sets `ResourcesApplied` `True` with a resource missing (R2.84), and reports a Cluster that it cannot reach yet as an `InternalError`, in the tone of progress while that Cluster is in its first provisioning (D2)                                                                                                                                                                         |
| P13    | A missing summary is Unknown (H1)                                                                                                                                                                                                       | An IPAddressClaim with no `Ready` and an address is Healthy                                                                                                                                                                                                                                                                                                                                                                                                                                        | The contract makes the address the mark of a claim served                                                                                                                                                                                                                                                                                                                                              |
| P14    | Healthy only when `PreflightCheckPassed`, `ProviderInstalled` and `Ready` are `True` (H1); Provisioning for a Cluster, a Machine and a MachinePool (H2)                                                                                 | Provisioning and Upgrading of a kind of the operator, from its installed version; the wait for the core provider is progress within 600 seconds; a `ProviderUpgraded` `False` that is stale once the versions match is no issue                                                                                                                                                                                                                                                                    | The operator treats the wait as no error and bounds it nowhere; only an upgrade that succeeds clears `ProviderUpgraded`, so once the version is set back it records a past failure, as the fields of P6 do                                                                                                                                                                                             |
| P16    | A kind with no status has no health (H1); Idle when no activity holds (H2)                                                                                                                                                              | Neither Idle nor Unknown for such a kind                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Both would speak of a status it does not have                                                                                                                                                                                                                                                                                                                                                          |
| P17    | Provisioning for a Cluster, a Machine and a MachinePool (H2)                                                                                                                                                                            | Provisioning for the objects that provision with them, until their contract says that they are ready                                                                                                                                                                                                                                                                                                                                                                                               | Each reports itself not ready while it provisions, as the kinds of H2 do                                                                                                                                                                                                                                                                                                                               |
| P18    | An activity whose reason or message says that it is blocked is shown as blocked (H2)                                                                                                                                                    | `WaitingForBeforeDeleteHook` alone is progress                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The reason is written until the Cluster is marked as ready to be deleted, before any hook answers                                                                                                                                                                                                                                                                                                      |
| P19    | Paused from the `Paused` condition (H2)                                                                                                                                                                                                 | Also from the request, for the kinds whose controllers honour it, as they honour it                                                                                                                                                                                                                                                                                                                                                                                                                | The controllers act on the request first                                                                                                                                                                                                                                                                                                                                                               |
| P20    | Never an activity from the phase alone (H2)                                                                                                                                                                                             | The scale of a MachinePool from its counters, unless something outside Cluster API sets them                                                                                                                                                                                                                                                                                                                                                                                                       | It reads the counters, not the phase                                                                                                                                                                                                                                                                                                                                                                   |
| P21    | Remediating from the condition of that name (H2)                                                                                                                                                                                        | Remediating of a Machine from `OwnerRemediated` and `ExternallyRemediated`; the `Remediating` of an owner Blocked when none of its Machines in remediation can be remediated; `CannotBeRemediated` for a Machine that a rollout removes is no stop                                                                                                                                                                                                                                                 | A Machine has no `Remediating`; the owner keeps its condition `True` while it writes the block on its Machines; the rollout removes such a Machine anyway                                                                                                                                                                                                                                              |
| P22    | A `TopologyReconciled` `False` with another reason is an activity (H3)                                                                                                                                                                  | A reason this release does not define weighs Unknown                                                                                                                                                                                                                                                                                                                                                                                                                                               | The kit maps an unknown value to Unknown; the health does not change                                                                                                                                                                                                                                                                                                                                   |
| P24    | A mark when the controller of a kind is not available (H1)                                                                                                                                                                              | The mark only where the Cluster API Operator gives the availability of the controller; Unknown, and noted, otherwise; a `Ready` that a stopped operator keeps is not told                                                                                                                                                                                                                                                                                                                          | It departs: A2 and A12 give the views no other reading of the controllers, this spec does not change them, and a controller is never called unavailable on no evidence                                                                                                                                                                                                                                 |
| P25    | A mark for the conditions computed from a workload cluster, which keep their last value (H1)                                                                                                                                            | Only once the control plane is initialized                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Before it, those conditions keep no last value                                                                                                                                                                                                                                                                                                                                                         |
| P28    | Upgrading, a control plane whose versions in status differ from the version in its spec (H2)                                                                                                                                            | Upgrading when the project says so: a greater version in the spec, or one that differs only by words of build metadata; a downgrade reads Rolling out; no version in status is no upgrade                                                                                                                                                                                                                                                                                                          | The project decides upgrades so, and a downgrade, which the webhook accepts, is a rollout to an older version                                                                                                                                                                                                                                                                                          |
| P31    | Pending, waiting and in progress take `--colorWarning` (kit, `docs/design.md`, "Status")                                                                                                                                                | The tone of progress takes `--colorInfo`; `--colorWarning` is kept for a warning past a threshold and for Blocked                                                                                                                                                                                                                                                                                                                                                                                  | D2 needs progress and warning apart, and the words carry the meaning, as the kit asks                                                                                                                                                                                                                                                                                                                  |
| P33    | A blocked activity is not shown as progress (H2)                                                                                                                                                                                        | The activities of a paused object are Blocked                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The pause is a stop the project declares                                                                                                                                                                                                                                                                                                                                                               |
| P34    | The views show how long an activity has lasted (H2); only real timestamps, and a time that makes no sense is unavailable (kit, `docs/design.md`, "Status")                                                                              | Durations from the times the project wrote, never longer than the age of the object, zero when the start is after `now`, and none where no start is written; the Upgrading of a Cluster from the transition of its `TopologyReconciled`                                                                                                                                                                                                                                                            | It departs from the kit as D2 decides: a start before the creation counts from the creation, and one after `now` gives zero, rather than unavailable; the duration of the upgrade of a Cluster can be longer than the upgrade when the condition was already `False` for another reason                                                                                                                |

Removed by D1: P3, which held a health while a change was in flight, with
the two clocks that ended its holds. Its number is not reused; P2 now names
the threshold of each activity.

This draft went through four independent reviews. The design changed after
the third, into D1 to D4, and the fixes that the fourth asked for are
checked in the main session before the approval.

P32 tries S7 as three cases, since the webhook of Cluster refuses its case
as written; the trial records its outcome here.
