# SPEC-0004: Clusters, list and details

- **Status:** Approved
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Reviewed project:** Cluster API `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`, and the Cluster API Operator
  `v0.30.1`, commit `2b43298`
- **Freelens:** 2.1.0, tag `v2.1.0`
- **Dependencies:** [SPEC-0001](SPEC-0001-reconnaissance.md),
  [SPEC-0002](SPEC-0002-test-environment.md),
  [SPEC-0003](SPEC-0003-status-model.md). The test environment of SPEC-0002
  is verified on `main`, with its fixtures, their session in Freelens and the
  jobs of CI of its two tiers (TESTING.md, "The fixtures", "Continuous
  integration"); the implementation waits for that of SPEC-0003, the model on
  which every mark of the view rests
- **Approval:** Approved on 2026-11-26 under the maintainer's delegation for
  the work inside M1, after four independent reviews; P18 as the maintainer
  decided on 2026-11-25; it is reviewed with the rest of M1 at its review

## Goal

An operator sees every Cluster of the namespaces they chose, live, with its
health in the words of the project, what it is doing and for how long,
whether that health is fresh, and the message of the project that says why.
One click opens the details of a Cluster, which explain it part by part:
its conditions with their weight, its control plane and its workers, its
topology, and the objects it names. The view only reads.

## Upstream reference

The sources were read at the tag and commit of each. They are a reference
for behavior and for the domain: no code, text or style is copied from them.
The facts come from SPEC-0001 and the rules of status from SPEC-0003, which
every rule below cites; where a rule needs a fact that neither holds, it
cites the source.

| Source                                     | At                        | Read for                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubernetes-sigs/cluster-api`              | `v1.14.4`, `4356c154f4a7` | The types and the definition of Cluster at `v1beta2`; the glossary of the book; `clusterctl describe cluster` (`docs/book/src/clusterctl/commands/describe-cluster.md`); the contract labels; the labels and annotations of the book; the templates of the demo |
| `kubernetes-sigs/cluster-api-operator`     | `v0.30.1`, `2b43298`      | The kinds whose `Ready` gives the availability of a controller (SPEC-0003, P24)                                                                                                                                                                                 |
| `freelensapp/freelens`                     | `v2.1.0`, `c4700f9`       | The list layout, the drawer, the details of the host and their order, the stores, their loads and watches, and the errors of its client, the navigation, the themes                                                                                             |
| `freelensapp/freelens-example-extension`   | `5c75d60`                 | The page of a kind that the cluster may not serve                                                                                                                                                                                                               |
| `freelensapp/freelens-velero-extension`    | `v1.0.0`, `fd68262`       | Rows with no selection and no menu, which open a view of the extension, and the state of a read taken from the code of its answer                                                                                                                               |
| `freelensapp/freelens-kubeswift-extension` | `v1.0.0`, `49e92de`       | The grammar of a list, and the title of a kind that collides with one of the host                                                                                                                                                                               |
| `freelensapp/freelens-sveltos-extension`   | `v2.1.0`, `2fec578`       | Its view of the Clusters at `v1beta1`, its search, and the release of Sveltos whose definitions its CI applies, for S6 (P29)                                                                                                                                    |

As in SPEC-0001 and SPEC-0003, a path with no prefix is in
`kubernetes-sigs/cluster-api` at `v1.14.4`, and any other path is prefixed with
the name of its source and a colon, `freelens@v2.0.0` for Freelens at that tag;
`kit` is the Freelens extension kit at `v0.1.3`, and `crd` is
`core/config/crd/bases/cluster.x-k8s.io_clusters.yaml`. The documents of this
repository are cited by their name and a section, as SPEC-0003 cites them:
AGENTS.md, and ROADMAP.md, TESTING.md, TRY-IT.md and ARCHITECTURE.md of
`docs/development/`; the files that this spec adds or changes in this
repository, under `src/`, `integration/`, `e2e/` and `.github/workflows/`, are
named by their path in it. None of them is a path of Cluster API. A rule that
SPEC-0001, SPEC-0003 and the kit do not settle is marked "Proposed:" with its
reason and the facts it rests on, and numbered from P1 in the order in which it
was first proposed: P24 to P34 came with the four independent reviews of this
draft, and P24 went with the second. A rule marked "Decided:" was decided while
drafting, under the delegation for M1, and is numbered from D1; the first review
removed D1. A number that goes is not reused. A decision of the maintainer is
recorded as the maintainer's, with its date, in the rule it settles. A rule of
SPEC-0003 is always cited with its spec, as "SPEC-0003, P31", so that the series
never mix. Every rule proposed or decided here is listed again under "Notes and
deviations", with what it adds to the kit, SPEC-0001 or SPEC-0003, or how it
departs from them.

## Scope

Included:

- The model of Cluster at `v1beta2`, with its types written from the schema
  of the release (A4), listed in `customResources` (A7).
- The models of the kinds that the status model reads around a Cluster,
  with the types that SPEC-0003 gives them (P1).
- The page of the Clusters and its sidebar entry, which is the root entry of
  the extension.
- The list, in the grammar of the kit, with the status of SPEC-0003.
- The details: the extension's own, which the list opens (A7), and the same
  content in the details of the host (S5).
- The reads of the page, through the subscription of the list layout of the
  host, and those of a view of one Cluster outside the namespaces of the page,
  through stores of its own (P19, P25, P26, P31), and the notice of a list that
  the host reads once and does not follow (P34).
- The references to the objects that a Cluster names: links to the objects of
  providers, resolved through their contract (A2), and plain text for the
  objects of Cluster API until SPEC-0005 gives them details of the extension
  (P18).
- The states that are not the happy one.
- The first `docs/development/DESIGN.md`, with the decisions that this view
  sets for the others (kit, `docs/process.md`, "Where the method lives in an
  extension").
- The documents that the first model and the first view change, in the same
  pull request (kit, `docs/process.md`, "The loop"):
  - AGENTS.md: the model of Cluster and the files of this view in place of the
    `Example` of the template, in "CRD KubeObject Pattern", "Adding an API" and
    "Renderer Components", which ask the spec of the first model and of the
    first view to replace it, and the sentence of "Architecture" that the
    extension registers nothing yet; and the sentences that the departures of
    this spec leave untrue there, each with its exception and the rule that
    makes it: that the `KubeApi` and `KubeObjectStore` subclasses are never
    instantiated (P31, P34), that the page of a kind is made by
    `createAvailableVersionPage` (P20), that every struct has an interface (P1),
    and step 8 of "Adding an API" (P30) (kit, `docs/process.md`, "The loop").
  - TRY-IT.md: the walk through this view on the demo, which its first part
    leaves to the views ("How to walk through the views on it comes with the
    views"), and which the kit asks of it (kit, `docs/review.md`, "The demo
    cluster and its walkthrough").
  - ARCHITECTURE.md: in "What it reads", the stores of a view of one Cluster
    beside those of the host (P31); in "Shared decisions", how the views read
    the stores of the host (P19, P31, P34), the kinds of the operator in the
    namespaces of the filter (P2), and what "Namespaces" now says of a view of
    one Cluster (P31).
  - TESTING.md and AGENTS.md, "Workflows": the fixtures of every state on the
    cluster of the sessions, Freelens dev in the jobs of the real project, one
    for each release (P33), the second identity of the restricted session and
    its grants in `default` (P23), and the release of Sveltos of S6 with its
    package (P29).
  - The README: a section "Supported APIs" with the row of Cluster at
    `v1beta2`, as the template has one for each kind and version
    (freelens-example-extension:README.md:66-88), which the README of this
    repository does not have yet, and a section "Permissions" with what this
    view reads and the permission each read takes, which A12 asks of the
    README (R6.4, R6.5); the rest of the README is SPEC-0027.
- The workflows of CI that the sessions of this view need (P33):
  `integration-tests.yaml` applies the fixtures of every state, and the job
  of the real project of `test-environment.yaml` runs Freelens dev and the
  sessions of the real tier.
- Step 8 of "Adding an API" of AGENTS.md left out, with no `examples/` for
  Cluster (P30).
- The trials of S5 and S6 of SPEC-0001, S6 by a session (P29), and of S2
  (P3).
- The tests: unit, in Freelens on the fixtures of SPEC-0002, and with the
  real project.

Excluded:

- Every object below the first level of a Cluster: the MachineSets of a
  MachineDeployment, the Machines of a part, the infrastructure machines and
  the bootstrap configs, the ClusterResourceSets and the templates. They are
  the tree of a Cluster (SPEC-0005), to which the details will link.
- The picture of the whole management cluster: what is wrong and where, the
  counts across the Clusters, the providers, and what it shows where Cluster
  API is not installed (SPEC-0006).
- The variables of a topology, its patches and its upgrade plan,
  `status.controlPlane.upgradePlan` and `status.workers.upgradePlan` (R2.14):
  SPEC-0012, with the ClusterClasses.
- The events of a Cluster: SPEC-0017.
- The views of the other kinds: M2. A reference to one of their objects is
  plain text until SPEC-0005 gives it details of the extension (P18).
- Every action, the kubeconfig of a workload cluster included: M3.
- The pass before the review of M1, which then checks this view in both
  themes: SPEC-0007.

## Design

### A list with its details, and why

The task comes first (kit, `docs/design.md`, "Start from the tasks"). An
operator who runs clusters with Cluster API has three things to do here, in
this order:

1. **Notice** the Clusters that are not healthy, and those that are
   changing, and for how long: among many, at a glance.
2. **Understand** one of them: what the project says of it, which of its
   conditions weigh, what it is doing and whether that has lasted too long,
   and whether what the view shows is fresh.
3. **Find** the part that carries it: the control plane, a MachineDeployment
   or a MachinePool, or an object of a provider, and go to it.

A list is the shape of the first: many objects of one kind, compared by the
same marks, searched and sorted, each row a way to its details. The details
are the shape of the second and the third: one object, explained, with each of
its parts named, and a way to those that have details (P18). Both are the
components of the host (kit, `docs/design.md`, "Lists", "Details"), so the
view is standard. What a list cannot carry has its own spec: the tree of one
Cluster (SPEC-0005) and the picture of the whole management cluster
(SPEC-0006), both ad hoc views of M1.

What the view shows, point by point, with what the host shows of any custom
resource (R7.3 to R7.6) and what `clusterctl describe cluster` shows of the
same Cluster (R4.1 to R4.35), so that the two can be read side by side:

1. **The health in the words of the project**, with the exceptions that
   SPEC-0003 draws from H1. A Cluster whose `Available` is `True` while a
   MachinePool or its control plane Machines are not ready reads Degraded,
   with the condition that says so (SPEC-0003, the rule of Cluster; R2.29).
   The host shows the status of `Available` as a column (R1.10, R7.3), and
   `clusterctl describe cluster` its status and reason (R4.22); on the
   cluster of the real project, `freelens-capi-mp` reports `Available`
   `True` with no control plane Machine ready (SPEC-0002, "Notes and
   deviations").
2. **What the Cluster is doing**, apart from its health: each activity, its
   state, and for how long (SPEC-0003, "Activity", D4, P34). The host derives
   no activity, and `clusterctl describe cluster` shows how long ago the
   condition of each of its rows changed (R4.27).
3. **The tone of the health**, which tells a change in flight within its time
   from one that has lasted too long (SPEC-0003, D2).
4. **Whether the health is fresh**: paused, and by which of the two forms,
   which reach different objects (R4.56 to R4.58); a status of an older
   generation; a controller that is not available (SPEC-0003, "Freshness").
5. **The conditions with their weight**: a condition of negative polarity at
   rest is never an issue (H3); the details of the host paint it as an error
   (R7.6).
6. **The message of the summary**, line by line as the project nests it,
   with the objects it names, as P18 shows them (SPEC-0003, P27);
   `clusterctl describe cluster` shows it as wrapped text (R4.26).
7. **The control plane and the workers, part by part**: each
   MachineDeployment and MachinePool with its own health and activities, and
   the versions at which the Machines run; `clusterctl describe cluster`
   shows no status on the row of a MachinePool (R4.33).
8. **The references to the objects of providers as links**, at the version
   that their contract gives (A2); the link helper of the host assumes `v1`
   for a reference with no version (R7.19).
9. **The topology**: its class, its version and the lifecycle hooks still
   pending (R3.22); `clusterctl describe cluster` reads no ClusterClass
   (R4.31).
10. **Every refusal said as one**, with the permission it takes, never as an
    empty list (kit, `docs/design.md`, "States that are not the happy one").

This list was also read against the inventory of the other interfaces for
Cluster API, which SPEC-0001 keeps outside this repository, where they can be
named (SPEC-0001, "Scope").

A sketch of the details, with the names of a fixture and with the messages
left out:

```text
Cluster: freelens-capi-md                                       [copy] [x]
  (the metadata of the host)
Status
  Health          [Degraded] on Available, in the tone of progress:
                  Provisioning of a Machine, a warning after 10m
  Activities      [Rolling out 4m12s] [Provisioning 2m3s]
  Available       True  Available  since 10:04, 3h  (the message nested)
  Issues          WorkerMachinesReady  False
  Phase           Provisioned
Control plane     KubeadmControlPlane freelens-capi-md-...  [Healthy]  Idle
  Machines        1 desired, 1 current, 1 ready, 1 available, 1 up to date
Workers           2 desired, 3 current, 2 ready, 2 available, 2 up to date
  MachineDeployment freelens-capi-md-md-0-...  [Degraded]  Rolling out  2/2
Infrastructure    DockerCluster freelens-capi-md-...  [Healthy]
Topology          quick-start, v1.37.0, pending hooks: none
Network           pods 192.168.0.0/16, services 10.128.0.0/12
Conditions        [Ok] Available ... [At rest] Paused ... [Activity] ...
```

### What the view reads

| Kind                                | Version                                   | Where                                                                                                            | For                                                                                                                                                                                                   | Facts                |
| ----------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Cluster                             | `v1beta2`                                 | The namespaces of the filter (P19); the namespace of a Cluster whose details or panel is open outside them (P31) | The rows and the details                                                                                                                                                                              | A2, A13              |
| Machine                             | `v1beta2`                                 | The namespaces of the filter; that of a view of one Cluster outside them (P31)                                   | `machines` of the model: for a Cluster by its label, for each of its parts by their owners (SPEC-0003, "What it takes and returns"); the worker Machines that the Cluster owns, for its workers (P17) | R2.13, R3.4          |
| MachineSet                          | `v1beta2`                                 | The same                                                                                                         | The way from a MachineDeployment to its Machines; the MachineSets that the Cluster owns, for its workers (P17)                                                                                        | R2.13, R3.4          |
| MachineDeployment                   | `v1beta2`                                 | The same                                                                                                         | `parts`, by the label `cluster.x-k8s.io/cluster-name` (A13); the workers of the details                                                                                                               | R2.13, R2.19, A13    |
| MachinePool                         | `v1beta2`                                 | The same                                                                                                         | `machinePools`, by the same label (A13); the workers of the details                                                                                                                                   | R2.29, H1, A13       |
| KubeadmControlPlane                 | `v1beta2`                                 | The same                                                                                                         | `parts`: the control plane                                                                                                                                                                            | R1.17, R2.78         |
| A control plane of another provider | The version that its contract label gives | The namespaces of the filter; that of a view of one Cluster outside them (P31)                                   | `parts`: the control plane                                                                                                                                                                            | R1.15, R1.16, A2, P3 |
| An infrastructure cluster           | The version that its contract label gives | The namespaces of the filter; that of a view of one Cluster outside them (P31)                                   | The details: its link and its health                                                                                                                                                                  | R1.15, R1.16, A2, P3 |
| MachineHealthCheck                  | `v1beta2`                                 | The namespaces of the filter; that of a view of one Cluster outside them (P31)                                   | `healthChecks`: the threshold of a Machine                                                                                                                                                            | SPEC-0003, D2        |
| ClusterClass                        | `v1beta2`                                 | The namespaces of the filter; that of a view of one Cluster outside them (P31)                                   | `clusterClass`: the availability gates; its name (P18)                                                                                                                                                | R2.21, R3.12         |
| The seven kinds of the operator     | `v1alpha2`                                | The namespaces of the filter, as every other kind (P2)                                                           | `controllers`                                                                                                                                                                                         | SPEC-0003, P24; P2   |
| CustomResourceDefinition            | `apiextensions.k8s.io/v1`                 | One by its name                                                                                                  | The contract label of a kind of a provider                                                                                                                                                            | R1.16, R6.5, A2      |

Every kind is read through the stores of the host, watched (A2), as P19
says, and through no client of the extension's own (kit, `docs/safety.md`,
"Reading"). A view of one Cluster reads its objects in its namespace,
whatever namespaces the filter selects (A13), through stores of its own, as
P31 says. A ClusterClass in another namespace than its Cluster (R3.12) is
read only where the filter selects that namespace; otherwise the model notes
that it was not read (SPEC-0003, "What it takes and returns"), as P2 and P31
say of the kinds that they leave out. The view never requests `v1beta1` (A2,
A3), never reads a Secret, and reads no field of the spec of a
KubeadmControlPlane but `spec.replicas` and `spec.version` (A3; SPEC-0003,
"Safety").

**P1.** Proposed: the kinds that this view reads only as the context of the
status model, Machine, MachineSet, MachineDeployment, MachinePool,
KubeadmControlPlane, MachineHealthCheck, ClusterClass and the seven kinds of
the operator, get a model each, in `src/renderer/api/`, with the `static`
metadata of AGENTS.md ("CRD KubeObject Pattern") and, as their spec and
status, the plain-data types of SPEC-0003 for the fields that its rules read
(SPEC-0003, "Where it lives"), and nothing else. The whole types of each come
with the spec of its own view, in M2, which replaces them. The view reads no
other field of these kinds; the store of a kind is reached through its model
(AGENTS.md, "CRD KubeObject Pattern"); and the types of the spec of a
KubeadmControlPlane would type the fields that A3 never reads (R3.36). They
are not in `customResources`, since they have no page: there they would leave
the Custom Resources tree of the host with nothing in their place (AGENTS.md,
"CRD KubeObject Pattern"). It departs from "Adding an API" of AGENTS.md,
which types every struct of a kind.

**P2.** Proposed: the seven kinds of the operator are read as every other kind,
in the namespaces of the filter, by the subscription of the list layout (P19),
and only when the cluster serves them. Their objects live in the namespaces of
the providers, not in those of the Clusters (R1.2, R3.19), and they stand for
the controllers of the whole management cluster (SPEC-0003, P24). Where the
filter leaves out the namespace of a provider, the context has no object of the
operator for it, as on a management cluster that `clusterctl` installed, which
has only `Provider` objects (SPEC-0003, P24), and one that holds the kinds of
the operator only where the operator installed the providers (SPEC-0001, "R1.
The surface"): the model then notes that the availability of that controller is
not known, and marks nothing (SPEC-0003, P24). Reading them in every namespace
would take loads of their own beside those of the layout: on the stores of the
host, whose `loadedNamespaces` the last load decides (P19), or on stores of
their own, as P31 builds for one namespace; the note keeps the parts fewer, and
says what was not read.

**P3.** Proposed: the view resolves the control plane and the infrastructure
cluster of each Cluster through their references, reading the definition of
each kind by its name (A2), from the store of definitions of the host when it
holds it, and otherwise with a GET of that one definition
(freelens:packages/core/src/extensions/renderer-api/k8s-api.ts:74, 110;
R6.5, R7.18); so this spec tries S2, which SPEC-0001 gives to the first spec
that shows an object of a provider. The control plane is a part of the
status of its Cluster (SPEC-0003, "What it takes and returns"), without which
the activity of the Cluster reads Unknown (SPEC-0003, P1); and the
infrastructure cluster is a reference that the kit asks to be a link when its
target exists (kit, `docs/design.md`, "Details"). The store of a kind of a
provider is the one that the host registers for each version that a
definition serves (R7.17), found by kind and version
(freelens:packages/core/src/common/k8s-api/api-manager/api-manager.ts:93-94),
which the list layout subscribes as a dependent store (P19). The objects of a
provider below a Machine stay with the tree (SPEC-0005).

### The model of a Cluster

`src/renderer/api/cluster/cluster-v1beta2.ts` holds the model, as AGENTS.md
asks ("CRD KubeObject Pattern", "Adding an API"), with the shared types in
`src/renderer/api/types.ts`:

```ts
export class Cluster extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.NamespaceScopedMetadata,
  ClusterStatus,
  ClusterSpec
> {
  declare kind: "Cluster";
  declare apiVersion: "cluster.x-k8s.io/v1beta2";

  static readonly kind = "Cluster";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/cluster.x-k8s.io/v1beta2/clusters";

  static readonly crd: ClusterApiKubeObjectCRD = {
    apiVersions: ["cluster.x-k8s.io/v1beta2"],
    plural: "clusters",
    singular: "cluster",
    shortNames: ["cl"],
    title: "Workload Clusters",
  };
}

export class ClusterApi extends Renderer.K8sApi.KubeApi<Cluster> {}
export class ClusterStore extends Renderer.K8sApi.KubeObjectStore<Cluster, ClusterApi> {}
```

The plural, the singular and the short name are those of the definition
(crd:13-18), and the title is that of P4. `ClusterApiKubeObjectCRD`, in
`src/renderer/api/types.ts`, adds the title of the page to the fields of the
host, as the template types its own `crd` (AGENTS.md, "CRD KubeObject Pattern").
The file also exports the `KubeApi` and `KubeObjectStore` subclasses of the
pattern (AGENTS.md, "CRD KubeObject Pattern", "Adding an API"): the list uses
the type of `ClusterApi`, the store that the page reads is the host's, through
`Cluster.getStore()`, and the `KubeObjectStore` subclasses are constructed only
by a view of one Cluster outside the namespaces of the page, for that namespace
(P31), and once by the page, for the context of the frame alone (P34). The name
`Cluster` stays inside its module: the host exports a model of the same name for
another group (R7.20). The types follow the Go types of the release, one
interface for each struct, with the fields under their JSON names and `?` where
the schema does not require them (AGENTS.md, "Adding an API"):

| Interface                                                                               | Fields                                                                                                                                                       | Source                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Cluster`                                                                               | `spec`, `status?`                                                                                                                                            | `api/core/v1beta2/cluster_types.go:1695-1708`; crd:3888                                                               |
| `ClusterSpec`                                                                           | `paused?`, `clusterNetwork?`, `controlPlaneEndpoint?`, `controlPlaneRef?`, `infrastructureRef?`, `topology?`, `availabilityGates?`                           | `api/core/v1beta2/cluster_types.go:481-521`                                                                           |
| `ContractVersionedObjectReference`                                                      | `kind`, `name`, `apiGroup`                                                                                                                                   | `api/core/v1beta2/common_types.go:391-417`; crd:2101, 2137                                                            |
| `ClusterAvailabilityGate`                                                               | `conditionType`, `polarity?`, with `ConditionPolarity` the union `"Positive" \| "Negative"`                                                                  | `api/core/v1beta2/cluster_types.go:524-525, 538-555`; crd:1992                                                        |
| `Topology`                                                                              | `classRef`, `version`, `controlPlane?`, `workers?`, `variables?`                                                                                             | `api/core/v1beta2/cluster_types.go:558-587`; crd:3492                                                                 |
| `ClusterClassRef`                                                                       | `name`, `namespace?`                                                                                                                                         | `api/core/v1beta2/cluster_types.go:595-616`; crd:2177                                                                 |
| `ControlPlaneTopology`                                                                  | `replicas?`, read; `metadata?`, `rollout?`, `healthCheck?`, `deletion?`, `taints?`, `readinessGates?`, `variables?`, typed and not read                      | `api/core/v1beta2/cluster_types.go:620-684`                                                                           |
| `WorkersTopology`                                                                       | `machineDeployments?`, `machinePools?`                                                                                                                       | `api/core/v1beta2/cluster_types.go:859-875`                                                                           |
| `MachineDeploymentTopology`, `MachinePoolTopology`                                      | `class`, `name`, `replicas?`, read; the other fields typed and not read                                                                                      | `api/core/v1beta2/cluster_types.go:879-973, 1226-1299`                                                                |
| The structs of the health checks, rollouts, deletions and variables of a topology       | Typed whole, not read by this view                                                                                                                           | `api/core/v1beta2/cluster_types.go:688-855, 977-1222, 1303-1379`; `api/core/v1beta2/common_types.go:361-375, 436-468` |
| `ClusterNetwork`, `NetworkRanges`                                                       | `apiServerPort?`, `services?`, `pods?`, `serviceDomain?`; `cidrBlocks`                                                                                       | `api/core/v1beta2/cluster_types.go:1384-1405, 1408-1417`; crd:2027, 2049                                              |
| `APIEndpoint`                                                                           | `host?`, `port?`                                                                                                                                             | `api/core/v1beta2/cluster_types.go:1644-1656`                                                                         |
| `ClusterStatus`                                                                         | `conditions?`, `initialization?`, `controlPlane?`, `workers?`, `failureDomains?`, `phase?`, `observedGeneration?`, `deprecated?`                             | `api/core/v1beta2/cluster_types.go:1428-1473`                                                                         |
| A condition of `v1beta2`                                                                | `type`, `status`, with the union `"True" \| "False" \| "Unknown"`, `observedGeneration?`, `lastTransitionTime`, `reason`, `message`                          | crd:3501-3561                                                                                                         |
| `ClusterPhase`                                                                          | The union `"Pending" \| "Provisioning" \| "Provisioned" \| "Deleting" \| "Failed" \| "Unknown"`                                                              | `api/core/v1beta2/cluster_types.go:1462`; `api/core/v1beta2/cluster_phase_types.go:31-61`                             |
| `ClusterInitializationStatus`                                                           | `infrastructureProvisioned?`, `controlPlaneInitialized?`                                                                                                     | `api/core/v1beta2/cluster_types.go:1478-1493`                                                                         |
| `ClusterControlPlaneStatus`, `WorkersStatus`                                            | `desiredReplicas?`, `replicas?`, `upToDateReplicas?`, `readyReplicas?`, `availableReplicas?`, `versions?`, read; `upgradePlan?`, typed and left to SPEC-0012 | `api/core/v1beta2/cluster_types.go:1534-1575, 1578-1619`                                                              |
| `StatusVersion`, `StatusUpgradePlanVersion`                                             | `version`, `replicas?`; `version`                                                                                                                            | `api/core/v1beta2/common_types.go:271-282, 285-291`                                                                   |
| `FailureDomain`                                                                         | `name`, `controlPlane?`, `attributes?`                                                                                                                       | `api/core/v1beta2/cluster_types.go:1768-1782`; crd:3757                                                               |
| `ClusterDeprecatedStatus`, `ClusterV1Beta1DeprecatedStatus`, the condition of `v1beta1` | `v1beta1?`; `failureReason?` and `failureMessage?`, read with the label of A5; `conditions?`, typed and not read (A2)                                        | `api/core/v1beta2/cluster_types.go:1497-1531`; `api/core/v1beta2/condition_types.go:56-98`                            |

A single line of crd cited above is the `required:` list of its struct.

A test of types checks that the model fits the input of the rule of Cluster
in SPEC-0003, as SPEC-0003 asks of each spec that adds the model of a kind
("Where it lives").

**P30.** Proposed: step 8 of "Adding an API", `examples/<version>/` with the
definition and a test object and the `kubectl apply -k` of the README, is left
out for Cluster. The definitions are those of the release of Cluster API,
which `pnpm e2e:cluster:up:definitions` installs (TESTING.md, "The definitions
alone"), and the objects are the fixtures of SPEC-0002, captured from the real
project; a copy of the definition in this repository would reproduce a text of
the project, which AGENTS.md forbids ("Licensing and provenance
constraints"). The README points to the commands of the test environment and
to TRY-IT.md instead. It departs from AGENTS.md ("Adding an API", step 8);
`examples/` keeps only its `.yamlfmt.yaml`.

### The page and its sidebar entry

The registrations of `src/renderer/index.tsx`, each component inside the
error boundary of the template (AGENTS.md, "Renderer Components"):

- `clusterPages`: one page, with the parameter `details` (P6), its component
  made once and given the extension from the registration (AGENTS.md,
  "Renderer Components").
- `clusterPageMenus`: the root entry, with its icon and the page as its
  target, and one child, text only (P4).
- `kubeObjectDetailItems`: the details of Cluster at `v1beta2`, made with
  `Renderer.K8sApi.detailsFor`, priority 250 (P16).
- `customResources`: the model of Cluster, so that the Custom Resources tree
  of the host does not list the Clusters a second time; the list and the
  details of the host stay reachable by their address (R7.13; A7).
- `engines.freelens` stays `^2.0.0` (A8) while the view uses no member of the
  extension API that 2.1.0 added. R7.25 names some of those members, "among
  which", not all of them, so the pull request checks each member that the view
  uses, the props of the list layout, the store class of P31 and P34 and its
  getter `context` among them, against the declaration of
  `@freelensapp/extensions` `2.0.0`, and moves `engines` to `^2.1.0` as A8 says
  when one is missing there. The behaviors of the host that this spec relies on
  were read at `v2.1.0`, such as the copy of the title of the drawer, made with
  `CopyToClipboardIcon`, which R7.25 lists as new in 2.1.0
  (freelens:packages/core/src/renderer/components/drawer/drawer.tsx:17, 222),
  and the mark of a cluster that cannot be reached, which 2.0.0 does not have
  (P26): every session of the integration tests runs on both releases
  (AGENTS.md, "Workflows"), and where `v2.0.0` differs the spec says so, or is
  corrected in the same pull request. What the view shows of the host stays the
  host's on each release; the view reads no member of a store that the extension
  API does not give.

**P4.** Proposed: the root entry of the sidebar is titled "Cluster API", with
an icon drawn for this extension, monochrome and with no fill of its own
(kit, `docs/design.md`, "Navigation"), which reproduces no logo of the
project, whose use is under a trademark policy (C3). Its target is the page
of the Clusters, and its one child is titled "Workload Clusters". The host has
a root entry titled "Cluster" (R7.20), the kit qualifies a title that would
collide with one of the host with the word of its domain (kit,
`docs/design.md`, "Navigation"), as the KubeSwift extension titled its
clusters (freelens-kubeswift-extension:docs/development/DESIGN.md:186-201),
and the book calls the clusters that a management cluster provisions workload
clusters (`docs/book/src/reference/glossary.md:355-357, 512-514`). The
details keep the kind in their title, "Cluster: <name>", as the host writes it
(freelens:packages/core/src/renderer/components/kube-object-details/kube-object-details.tsx:58).
The entry shows on every cluster, with no `visible`
(freelens:packages/core/src/renderer/components/layout/cluster-page-menu.ts:15-30):
the page then says why a cluster has no Clusters ("The states that are not
the happy one"), and the overview of SPEC-0006 has a state for a cluster
without Cluster API (ROADMAP.md, M1).

**P5.** Proposed: the `tableId` of the list is the literal
`clusterApiClustersTable`. The host keeps the sort of every list by its id,
in one place that every extension shares
(freelens:packages/core/src/renderer/components/table/table-model/table-model.ts:23-27),
so an id made from the plural, `clustersTable`, could be another's; the
KubeSwift extension qualifies its own the same way
(freelens-kubeswift-extension:src/renderer/pages/fleetclusters-page-v1alpha1.tsx:56-62),
and the Sveltos extension uses `sveltosClustersTable`
(freelens-sveltos-extension:src/renderer/pages/sveltos-clusters-page.tsx:58).

**P6.** Proposed: the page has one parameter, `details`, which holds
`<namespace>/<name>` of the Cluster whose details are open; the list sets it,
closing the details clears it, and any view opens the details of a Cluster
by navigating to the page with it (freelens:docs/extensions/api.md:988-993,
1010-1028). A namespace and a name hold no `/` (Kubernetes behavior, not in
these sources), so a value that is not two names joined by one `/` names no
Cluster: the details then say so, with the value as written, and nothing is
read for it ("The states that are not the happy one"). So the tree
(SPEC-0005), the overview (SPEC-0006) and the views of M2 open the details of a
Cluster, as the kit asks of every mark of an ad hoc view (kit,
`docs/design.md`, "Ad hoc views"); and the details stay open under those of the
host, whose address keeps the parameters of the page
(freelens:packages/core/src/renderer/components/kube-detail-params/get-details-url.injectable.ts:21-36).

### The list

The list is the list layout of the host (kit, `docs/design.md`, "Lists"),
`Renderer.Component.KubeObjectListLayout`, with:

- `tableId` of P5, and `renderHeaderTitle` the title of P4;
- `isSelectable={false}` and `renderItemMenu={undefined}`, which leaves no
  checkbox and no cell of the menu in the rows: the layout of the host spreads
  the props of the page after its own menu
  (freelens:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:293-300,
  313;
  freelens:packages/core/src/renderer/components/item-object-list/content.tsx:353-355,
  382-386); the header keeps the empty cell of the menu that the host always
  renders there (content.tsx:531-533); and a right click finds no menu of the
  host to open
  (freelens:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:224-256)
  (A7);
- `addRemoveButtons={{ onRemove: undefined }}`, which the layout spreads after
  its own, so that no remove button of the host shows, whatever the store of the
  host holds selected (content.tsx:583-595), and the adapter of the store
  selects nothing and removes nothing (P19; A7);
- `onDetails` that opens the details of the extension (A7, P15);
- as `store`, the adapter of the store of the Clusters, and as `dependentStores`
  the adapters of the stores of the context, with `subscribeStores` left on, so
  that the layout subscribes them as the host does for its own lists (P19);
- as `items`, the Clusters of the namespaces that the page has loaded, and as
  `isReady`, false until the first load of the Clusters in a mount of the page
  has ended, and then while a load of the Clusters runs and no row is listed
  (P19): the store stays loaded once its first load has ended, and the layout
  would show its empty list during the next load, or the rows of a namespace
  that it reads again as current
  (freelens:packages/core/src/renderer/components/item-object-list/list-layout.tsx:108,
  249-251; content.tsx:457-480);
- `searchFilters` of P14;
- the sorting of the columns below (P28);
- `customizeHeader`, which puts "not counted" in the place of the count of the
  header when a read failed and no row is listed, and keeps the marks of the
  host (P25);
- in the states that the page draws itself, its own content in the place of the
  rows (P25).

| Column        | Shows                                                                                                                                                                                                               | From                                                                        | Sorted by               | When missing                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| Name          | The name, a button that opens the details (P13), truncated, whole in its tooltip                                                                                                                                    | `metadata.name`                                                             | Name                    | Never                                                                         |
| Namespace     | The namespace badge of the host, which selects it in the filter                                                                                                                                                     | `metadata.namespace`                                                        | Namespace               | Never                                                                         |
| Control plane | The available Machines of the desired, `1/3` (P8); in the tooltip every counter, with its unit                                                                                                                      | `status.controlPlane` (R2.12)                                               | Available, then desired | N/A for a counter not written (R2.12)                                         |
| Workers       | The same, for the workers (P8)                                                                                                                                                                                      | `status.workers` (R2.13)                                                    | Available, then desired | N/A for a counter not written (R2.13)                                         |
| Version       | P9                                                                                                                                                                                                                  | `spec.topology.version`, else `status.controlPlane.versions` (R2.12, R2.96) | P28                     | N/A                                                                           |
| ClusterClass  | The name of the class, with its namespace when it is not that of the Cluster (R3.12)                                                                                                                                | `spec.topology.classRef`                                                    | Name, then namespace    | N/A, with the tooltip that the Cluster has no managed topology                |
| Activity      | Each activity in a mark of its tone, with its state when it is not Progressing and its duration, in the order of the closed set of SPEC-0003 (P7)                                                                   | `statusOf` (SPEC-0003, "What it takes and returns")                         | P28                     | Never: Idle or Unknown                                                        |
| Condition     | The word of the health in its tone; then the word stale when the health has a mark of freshness (P12), and how many MachinePools of the Cluster are of unknown health, when one is (SPEC-0003, the rule of Cluster) | `statusOf`                                                                  | P28                     | N/A for a Cluster that is deleting (SPEC-0003, "The rule every kind follows") |
| Status        | The headline of the message of `Available` (P11), truncated, the whole message nested in its tooltip                                                                                                                | `status.conditions` (R2.21, R2.91)                                          | The text                | N/A when the Cluster has no `Available` (R2.1)                                |
| Age           | The age component of the host                                                                                                                                                                                       | `metadata.creationTimestamp`                                                | Creation                | Never                                                                         |

The tooltip of a cell of counters names each counter with its unit: the
desired, current, ready, available and up-to-date Machines, as the project
counts them (R2.12, R2.13). When a MachinePool of the Cluster has no Machines,
the tooltip of the workers adds that its counters count the instances of its
provider whatever the readiness of their Nodes (R2.67; SPEC-0003, P10).

**P7.** Proposed: the state takes three columns, in this order, after the
columns of the domain: Activity, Condition and Status. The kit shows state in
two (kit, `docs/design.md`, "Status"); SPEC-0003 keeps the activities apart from
the health, and the activity sets the tone of the health (SPEC-0003, D2, "How a
view uses it"), so the two stand side by side and the tone of the health reads
next to its cause. In a narrow window the columns of the domain give their room
before those of state, the class and the version first, so that the state of
every row stays in view (kit, `docs/design.md`, "Interaction and performance").
The host has no such rule: its layout hides columns only when a page makes it
configurable, and then by a choice of the user, off by default
(freelens:packages/core/src/renderer/components/item-object-list/list-layout.tsx:110-111,
153). So the head cells of the columns carry classes of the page, which the
layout copies to the cells of each row (content.tsx:360-362;
list-layout.tsx:154), and the stylesheet of the page gives the columns of state
a minimum width and no shrink, and those of the domain a shrink, the largest for
the class and the version. The user can still resize a column, as in any list
of the host (content.tsx:366-376, 517-520). It departs from the kit, and
DESIGN.md records it.

**P8.** Proposed: the cells of the control plane and of the workers show the
available Machines of the desired, and their tooltip every counter. The
availability is what the summary of the project counts, through
`ControlPlaneAvailable` and `WorkersAvailable` (R2.19, R2.21), and what the
project's own columns show by default, with the desired and the up to date
(R1.10).

**P9.** Proposed: the cell of the version shows `spec.topology.version` for a
Cluster with a managed topology, as the project's own column does (R1.10),
and otherwise the versions that the control plane reports,
`status.controlPlane.versions`, oldest first (R2.12, R2.75). Its tooltip
lists the versions of the control plane and of the workers, each with its
number of Machines (R2.12, R2.13). A Cluster without a topology has no
version in its spec, and the versions in its status are those that the
kubelets report, else those of the Machines (SPEC-0003, "Kubernetes version";
`internal/util/version/version.go:91-93`). A version that the parser of
SPEC-0003 does not know is shown as written, and sorted last (SPEC-0003, P28).

**P10.** Proposed: the list has no column of the phase; the details show it.
The type of the phase says that no software should take it as a reliable
state of the Cluster (`api/core/v1beta2/cluster_phase_types.go:19-28`;
R2.18), and a Cluster is `Provisioned` while its Machines are not ready
(R2.17; H1).

**P11.** Proposed: the cell of the status shows the headline of the message
of `Available`, its first line as the parser gives it (SPEC-0003, P27), and,
when the message is empty, the reason of `Available`; with no `Available`,
N/A, whose tooltip says that the Cluster reports none yet (R2.1). A summary
that is `True` writes its lines of information only when they carry a message
(R2.91), so a healthy Cluster often has an empty message, and no cell is
empty (kit, `docs/design.md`, "Lists").

**P12.** Proposed: in the list, a health with a mark of freshness has, after its
word, the word "stale" in the tone of a mark of freshness, and its tooltip names
each cause and when it began; the details name each cause next to the health
(SPEC-0003, "Freshness"). A Cluster can carry three causes (SPEC-0003,
"Freshness", P25), which one line of a cell does not hold, and the cause Paused
is already the activity Paused in the column next to it (H2). It departs from
SPEC-0003, which shows each cause next to the health, in the list alone. How
many MachinePools of a Cluster are of unknown health, a note of the result,
follows the word of the health in the cell, and the health in the details, as
SPEC-0003 asks (SPEC-0003, the rule of Cluster).

**P13.** Proposed: the name of a row is a button that opens the details, so that
the keyboard reaches them; a click on the rest of the row opens them too, and a
click on the name stops at the name, as a link in a row does (kit,
`docs/design.md`, "Lists"). A row of the host answers to the pointer alone: it
is an element with no place in the order of the keyboard and no handler of keys
(freelens:packages/core/src/renderer/components/table/table-row.tsx:39-43;
freelens:packages/core/src/renderer/components/table/table-cell.tsx:27-34, 108),
and the kit asks that controls be reachable from the keyboard (kit,
`docs/design.md`, "Interaction and performance"). The Velero extension does the
same
(freelens-velero-extension:src/renderer/components/family-page.tsx:148-162).

**P14.** Proposed: the search of the list matches the name, the namespace, the
id and the labels, as `key=value`, which `getSearchFields()` of the host gives
(freelens:packages/kube-object/src/kube-object.ts:196-198, 217-219), and the
words that the columns show: the health, the activities, the version and the
class. The page passes both to the layout in `searchFilters`: the layout
searches only the fields that a page gives it, none by default, and shows no
search box without them (list-layout.tsx:157, 264-276;
freelens:packages/core/src/renderer/components/item-object-list/header.tsx:89),
as the list of custom resources of the host passes `getSearchFields()` itself
(freelens:packages/core/src/renderer/components/custom-resources/view.tsx:140).
An operator looks for "Degraded", "Upgrading" or a version, and a search covers
what a column shows.

**P28.** Proposed: each column of state, and the version, sort in an order
that the kit does not give, worst first, so that the rows that need attention
come first:

- Condition: Unhealthy, Degraded, Unknown, Healthy, then no health.
- Activity: the rows with an activity in the order of the closed set of
  SPEC-0003, by their first activity, from Deleting to Replacing; then the rows
  whose activity is Unknown alone; then Idle (SPEC-0003, "The closed sets").
- Version: the version that the cell shows first, the version of the topology
  or the oldest of those of the control plane (P9), in the order of the parser
  of SPEC-0003, a version that it does not know last (SPEC-0003, P28).
- Control plane and Workers: the available Machines, then the desired; Status:
  its text; ClusterClass: the name, then the namespace.

The kit asks a list to be sorted, and gives no order of state (kit,
`docs/design.md`, "Lists"); the order of the closed set is that of SPEC-0003,
and Unknown before Idle keeps a source that cannot be read above the rows that
have nothing in flight.

### The details

The same content shows in two places:

- **The details of the extension**, which a row opens (A7): the host's
  `Drawer` that the page renders over the list (P15), with the metadata of
  the host first.
- **The details of the host**, which open a Cluster from its address, from
  its definition, from the command palette and from the favorites (R7.13):
  the panel of the extension, after the metadata of the host, without them
  (P16).

The content, in this order, each section hidden when it has nothing to show
(kit, `docs/design.md`, "Details"):

1. **Status.**
   - The health, its word in its tone (SPEC-0003, D2), and how many of the
     MachinePools of the Cluster are of unknown health, when one is
     (SPEC-0003, the rule of Cluster); the condition it rests on, `Available`
     (SPEC-0003, the rule of Cluster); and the source of its tone: the
     activity that sets it, on which object, and the time after which it turns
     to a warning (SPEC-0003, P2).
   - The activities, each with its state, the instant it started and how long
     it has lasted (SPEC-0003, P34), and its tone. For Deleting, the stage,
     which is the reason of `Deleting`, and its message (R2.25). For
     Upgrading, the reason of `TopologyReconciled` and its message (R2.23).
     For Paused, the form that pauses it: `spec.paused`, which reaches the
     Cluster and every object of it, or the annotation
     `cluster.x-k8s.io/paused`, which reaches the Cluster alone, or both
     (R4.56 to R4.58; SPEC-0003, P19).
   - The marks of freshness, each with when it began, as an instant and a
     duration, when the project wrote one (SPEC-0003, "Freshness"). The word
     "stale" is theirs alone: a read that failed says that it could not read
     again, when and why (P25).
   - The summary: `Available`, its status, its reason, the instant of its
     last transition, and its message, each line nested as the parser gives
     it, the objects named in a subject as P18 shows them (SPEC-0003, P27).
   - The issues that make the Cluster Degraded, each a condition with its
     reason, or a MachinePool with its health (SPEC-0003, "The rule every
     kind follows" and the rule of Cluster).
   - The notes of the model, in words (SPEC-0003, "What it takes and
     returns").
   - The phase, as the project writes it, with the remark that the project
     tells no software to decide on it
     (`api/core/v1beta2/cluster_phase_types.go:19-28`); `Failed` with the
     label "deprecated" (A5; SPEC-0003, P6).
   - The failure reason and message of `status.deprecated.v1beta1`, with the
     label "deprecated" (A5; SPEC-0003, P6), hidden when unset.
2. **Control plane.**
   - The object: the reference, kind and name, as a link or as text (P18),
     with the health and the activities of that object (SPEC-0003, `parts`).
     A Cluster with no reference has control plane Machines of its own,
     labelled `cluster.x-k8s.io/control-plane` (R3.7): they are its rows, as
     the workers below are.
   - The Machines: desired, current, ready, available and up to date (R2.12),
     N/A for a counter not written.
   - The versions, each with its number of Machines (R2.12).
   - Initialized: Yes, No or Unknown, from `ControlPlaneInitialized` (P27).
   - The endpoint, `spec.controlPlaneEndpoint`, `host:port`, which a
     controller writes (R2.100).
3. **Workers.**
   - The Machines: the five counters, and the versions (R2.13).
   - A nested table of the host, one row for each part (P17): kind, name as
     text (P18), health, activities, and the available replicas of the
     desired.
   - The remark on a MachinePool that has no Machines, whose counters count
     the instances of its provider (R2.67; SPEC-0003, P10).
4. **Infrastructure.**
   - The object: the reference as a link or as text (P18), with its health,
     by the rule of an infrastructure cluster (SPEC-0003, "Objects of a
     provider").
   - Provisioned: Yes, No or Unknown, from
     `status.initialization.infrastructureProvisioned` (P27).
   - The failure domains, each name, and whether it suits the control plane
     (R2.15; `api/core/v1beta2/cluster_types.go:1768-1782`).
5. **Topology**, for a Cluster with `spec.topology`.
   - The class: its name as text (P18), with its namespace when it is not
     that of the Cluster (R3.12).
   - The version (R2.96).
   - The replicas of the control plane, and the name, the class and the
     replicas of each MachineDeployment and MachinePool of the topology; a
     number that the topology leaves unset reads N/A, with the tooltip that
     the topology does not set it (R2.102;
     `api/core/v1beta2/cluster_types.go:628-633`).
   - The lifecycle hooks still pending, the items of the annotation
     `runtime.cluster.x-k8s.io/pending-hooks`, an item the release does not
     define kept as written and marked unknown (R3.22; SPEC-0003, P29;
     `api/runtime/v1beta2/extensionconfig_types.go:317`).
6. **Network**: the API server port, the CIDR blocks of the pods and of the
   services, and the domain of the services, each row hidden when unset
   (`api/core/v1beta2/cluster_types.go:1384-1417`).
7. **Conditions.** One row for each condition, in the order that the
   controllers keep (R2.94; SPEC-0003, `conditionsOf`): its weight as a mark
   (H3), its type, its status and its reason as written, the instant of its
   last transition, a mark when it describes an older generation (SPEC-0003,
   P23), and its message, every line nested as the parser gives it, with the
   names of its subjects as P18 shows them (SPEC-0003, P27).

**P15.** Proposed: the details of the extension are the `Drawer` of the host,
which the page renders over the list: its title, "Cluster: <name>", the copy of
the name, its width, which the details of the host share, and its closing are
those of the host
(freelens:packages/core/src/renderer/components/drawer/drawer.tsx:28-48, 89-95,
138-168, 209-226;
freelens:packages/core/src/renderer/components/drawer/drawer-storage/drawer-storage.injectable.ts:13-19).
It closes on Escape, through a listener on the window (drawer.tsx:93, 138-146),
and on a click anywhere outside every drawer: on the header of the page, its
filter, its search or an empty part of the list as well (drawer.tsx:92,
148-168). A click on a row does not reach that listener: the row prevents the
default of the click and stops its propagation as it handles it
(content.tsx:350;
freelens:packages/utility-features/utilities/src/prevDefault.ts:21-27), so a
click on another row shows that Cluster in the same details. Its toolbar stays
empty until the actions of M3. The content renders inside an error boundary of
its own, with the Cluster as its key of reset (AGENTS.md, "Renderer
Components"), so that an error in the details leaves the list. Closing them by
their icon or by Escape gives the focus back to the name that opened them
(kit, `docs/design.md`, "Interaction and performance"). A click outside closes
them from a listener on the window, after the press of the click has given the
focus to the control under it (drawer.tsx:91-92, 148-171): the focus goes back
to the name then only while it is still in the details or on the body of the
page, so that a click on the search, or on any other control, keeps the focus
where it landed. A7 asks for details of the extension's own, and the component
of the host keeps them native (kit, `docs/design.md`, "Native first").

**P16.** Proposed: in the details of the host, the panel of the extension comes
after the metadata of the host and before its custom resource section and its
events: its priority is 250, so its order is 50, between the 0 of the metadata,
the 100 of the custom resource section and the last place of the events, in a
list sorted by order
(freelens:packages/core/src/renderer/components/kube-object-details/kube-object-detail-items/kube-object-detail-item-registrator.injectable.ts:60;
freelens:packages/core/src/renderer/components/kube-object-details/default-kube-meta-details-item.injectable.ts:17;
freelens:packages/core/src/renderer/components/kube-object-details/custom-resource-detail-item.injectable.tsx:47;
freelens:packages/core/src/renderer/components/kube-object-details/kube-object-detail-items/implementations/kube-event-detail-item.injectable.ts:18;
freelens:packages/core/src/renderer/components/kube-object-details/kube-object-detail-items/kube-object-detail-items.injectable.ts:24).
The panel leaves out the metadata, which the host renders there, and keeps its
counters and its conditions, which the custom resource section of the host shows
again, as printer columns and as badges that paint a negative condition at rest
as an error (R1.10, R7.5, R7.6): the extension cannot take that section away
(R7.14), and its own carry the weights and the notes. It departs from the kit,
which renders nothing twice (kit, `docs/design.md`, "Details"), and DESIGN.md
records it. This is how this spec reads "in the right order" of S5. The panel
takes its Cluster and the context of its Cluster from the stores of the page
when the page reads its namespace, and otherwise reads both as P31 says, so that
a change of the Cluster reaches it whatever the host follows.

**P17.** Proposed: the workers of the details are one row for each
MachineDeployment, each MachinePool, each MachineSet that the Cluster owns and
each worker Machine that the Cluster owns: the four kinds whose counters the
Cluster sums, and the only ones of each (R2.13;
`core/reconcilers/cluster/cluster_controller_status.go:221-238, 240-257,
259-279, 281-300`). The controllers make the Cluster the owner of a
stand-alone MachineSet and of a stand-alone Machine
(`core/reconcilers/machineset/machineset_controller.go:521-530`;
`core/reconcilers/machine/machine_controller.go:450-459`), so a MachineSet that
the Cluster does not own yet has no row, as the Cluster does not count it, and
the rows add up to the counters above them. A row shows what the model computes
for that object (SPEC-0003, "How a view uses it"): the view adds no mark of its
own over several rows. The objects below a row belong to the tree (SPEC-0005).

**P27.** Proposed: the rows Initialized and Provisioned read a fact of the
project in three words, Yes, No and Unknown, never No for what the project has
not said, since the kit maps an unknown value to Unknown, never to a guess
(kit, `docs/design.md`, "Status"; kit, `docs/safety.md`, "Reading"):

- Initialized reads the status of `ControlPlaneInitialized` as `conditionsOf`
  gives it, with its weight (SPEC-0003, "The weight of a condition"): Yes when
  it is `True`, since its transition, which never changes once `True`; No when
  it is `False`; Unknown when it is `Unknown`, as it is with `InternalError`
  or `ObjectDoesNotExist`, or of any other status, with its reason, and when
  the Cluster has not written it yet, with the tooltip that it reports none
  yet (R2.1, R2.19, R2.28;
  `api/core/v1beta2/cluster_types.go:183-193`). The field
  `status.initialization.controlPlaneInitialized` is not read, since it stays
  unset for a control plane of Machines of its own (R2.11).
- Provisioned reads `status.initialization.infrastructureProvisioned`: Yes
  once it is true; No while it is unset on a Cluster that has a status, since
  the controller writes it only as true (R2.10); Unknown while the Cluster has
  no status yet (R2.1).

### Links between the objects of a Cluster

**P18.** Proposed, but for the references to the objects of Cluster API that
the maintainer decided, below:

- A link opens the view of the extension for the kind of its target, at the
  details of that object, through the parameter of its page (P6), when the
  extension has one; in this spec it has a view of Clusters alone.
- A reference to an object of a provider, group, kind and name, is resolved to
  its version through the contract label of its definition (A2; SPEC-0003,
  "Contract label"), and its plural is that of the definition, never
  guessed; the link helper of the host would assume `v1` (R7.19). Its link
  opens the details of the host for that object, the page of the host that A6
  gives it
  (freelens:packages/core/src/extensions/renderer-api/navigation.ts:51-57),
  over the details of the extension, which stay open under them, since the
  address of the details of the host keeps the parameters of the page
  (freelens:packages/core/src/renderer/components/kube-detail-params/get-details-url.injectable.ts:21-36).
  Both are a `Drawer`, and every `Drawer` closes on Escape through its own
  listener on the window: one Escape closes both, and the close icon of the
  details of the host closes them alone, and leaves those of the extension
  open (drawer.tsx:93, 138-146, 225;
  freelens:packages/core/src/renderer/components/kube-object-details/kube-object-details.tsx:55-61).
- A link is shown only when its target is in the store the view read; a
  target that the view cannot resolve is plain text, `kind name` with its
  group in the tooltip, and the tooltip and the details say why: its
  definition cannot be read, its definition names no version that the parser
  knows (SPEC-0003, P26), the cluster serves no such kind, or the object does
  not exist (kit, `docs/design.md`, "Details"; A2).
- A click on a link stops at the link, so that a row does not open its
  details as well (kit, `docs/design.md`, "Lists").

Decided by the maintainer on 2026-11-25, in answer to the question that the
first review of this draft raised on this rule: A7 holds, and the references
to the KubeadmControlPlane, the MachineDeployments, the MachinePools and the
ClusterClass are plain text, their kind and their name, and open nothing,
until SPEC-0005 gives them details of the extension. The extension has no
details of these objects yet, so a link to one of them would open the details
of the host, which carry the menu of the host in their toolbar, with Edit,
Delete and Force Finalize (kube-object-details.tsx:59; R7.7 to R7.9), one
click away from the pages of the extension; A7 keeps that menu away from
them, and it holds as it is written. The decision departs from the kit, which
asks a reference to be a link when its target exists (kit, `docs/design.md`,
"Details"; kit, `docs/review.md`, "The pre-review pass"), for these
references and until SPEC-0005; DESIGN.md records the departure.

Proposed, as what that decision and A7 ask of the other objects of Cluster API
that this view names, the MachineSets and the worker Machines among the parts
of the workers (P17) and the Machines and MachineSets named in a subject of a
message: each is plain text in the same way, until SPEC-0005, since its link
too could only open the details of the host. So the names in a subject, which
SPEC-0003 gives a view to link (SPEC-0003, "Condition message"), are links
only to an object that has details of the extension, a Cluster, or to an
object of a provider; it departs from SPEC-0003 for the others, until
SPEC-0005. Nothing of the extension opens the details of the host for an
object of Cluster API.

**P32.** Proposed: the details of the extension show the metadata of the host
with `hideFields` that adds `namespace` and `ownerReferences` to the three
fields that the component hides by default, `uid`, `resourceVersion` and
`selfLink`, since the prop replaces that default
(freelens:packages/core/src/renderer/components/kube-object-meta/kube-object-meta.tsx:40-43,
77; freelens:packages/core/src/extensions/renderer-api/components.ts:117). The
component links every owner to the details of the host, and the namespace to
the details of its Namespace (kube-object-meta.tsx:131-133, 157-165;
freelens:packages/core/src/renderer/components/kube-object-link/link-to-namespace.tsx:34-44),
both with the menu of the host in their toolbar (kube-object-details.tsx:59),
the Delete of a Namespace included, which A7 keeps away from the pages of the
extension. So the details show the owners themselves, as text, the kind and
the name of each, and the namespace as the namespace badge of the host, as the
list does, whose click selects the namespace in the filter and opens nothing
(freelens:packages/core/src/renderer/components/namespaces/namespace-select-badge.tsx:48).
It departs from the kit, which asks a reference to be a link when its target
exists (kit, `docs/design.md`, "Details"; kit, `docs/review.md`, "The
pre-review pass"): for an owner of Cluster API until SPEC-0005 gives it
details (P18), and for the namespace for as long as the extension has no
details of a Namespace; DESIGN.md records it.

### The reads

**P19.** Proposed: the page reads its stores as the host reads those of its own
lists: the list layout of the host subscribes them. The facts it rests on:

- `KubeObjectListLayout` takes `subscribeStores`, on by default, and
  `dependentStores`, and the extension API exports it with its props
  (freelens:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:47-56,
  116-118; freelens:packages/core/src/extensions/renderer-api/components.ts:115).
  On its mount it subscribes the store of the page and its dependent stores
  through the host (kube-object-list-layout.tsx:131-157), which gives each
  store one subscription that follows the namespaces of the filter: one
  `loadAll` of those namespaces, then, once it has ended and unless it was
  aborted, its `subscribe`, both under one `AbortController`, and both again
  when the namespaces change
  (freelens:packages/core/src/renderer/kube-watch-api/kube-watch-api.ts:115-207).
- Each store keeps its own `loadedNamespaces`, which each of its loads
  replaces as it starts, before its request, so that a load that is then
  aborted has replaced it too
  (freelens:packages/core/src/common/k8s-api/kube-object.store.ts:138, 250-252,
  284). Its `subscribe` watches the value that it finds when it is called,
  through a reaction of mobx that reads it at once outside a batch of actions
  (kube-object.store.ts:545-584;
  freelens:packages/utility-features/utilities/src/wait.ts:13-34), as it is
  when the host calls it, after the `await` of its load
  (kube-watch-api.ts:147-156). With one subscription for each store, the
  `subscribe` of a load follows that load, and every namespace that the list
  shows is watched, within the limits that the lists of the host have, which
  "Notes and deviations" lists.

So:

- The store of the Clusters is the store of the layout, and the stores of the
  context are its dependent stores: the kinds of "What the view reads" that the
  cluster serves, those of the operator included (P2), and those of the
  providers that the references of the Clusters read name (P3). The layout
  subscribes its stores on its mount alone
  (kube-object-list-layout.tsx:131-157), so the page keys it by the set of its
  stores: a store that appears later, as the host registers an API (AGENTS.md,
  "CRD KubeObject Pattern") or as a reference names a kind of a provider, mounts
  it again with that store. The store of definitions is not one of them: the
  page only reads it (P3). The host subscribes it itself, with no
  `onLoadFailure`, so that a refused list leaves it failed, and from that state
  the host registers the APIs of the custom resources from the discovery
  (freelens:packages/core/src/renderer/components/custom-resource-definitions/definitions.injectable.ts:34-41;
  freelens:packages/core/src/renderer/before-frame-starts/runnables/setup-auto-crd-api-creations.injectable.ts:43-54);
  a subscription of the layout, with its own `onLoadFailure`, would leave it
  loaded and empty, and the host would drop every API that it registered from
  the discovery (kube-object.store.ts:257-277, 333-336). Each store of the host
  has one adapter, however many kinds or references name it: the layout keeps
  one entry for each object that it is given, and the host one watch for each
  (kube-object-list-layout.tsx:133; kube-watch-api.ts:121-133), so two adapters
  of one store would load and watch it twice.
- Each store reaches the layout through an adapter of the page, as the Velero
  extension hands the layout a store of its own
  (freelens-velero-extension:src/renderer/state/list-store.ts:29-106;
  freelens-velero-extension:src/renderer/components/family-page.tsx:73,
  122-128). The adapter has the members that the layout and the host use, and no
  other
  (freelens:packages/core/src/renderer/components/item-object-list/list-layout.tsx:56-76;
  kube-object-list-layout.tsx:41-45; kube-watch-api.ts:94-103). It passes to the
  store of the host, unchanged, those that read: `api`, `isLoaded`,
  `failedLoading`, `contextItems`, `getByPath`, `loadAll` and `subscribe`. It
  answers itself those that select and remove, as the Velero store does
  (freelens-velero-extension:src/renderer/state/list-store.ts:30, 33, 96-103):
  no row is selected, `selectedItems` is an empty list, `pickOnlySelected` gives
  none, the toggles change nothing, and `removeItems` removes nothing and sends
  nothing. The store of the host keeps a selection, which its own list of
  Clusters sets, reachable by its address (R7.13), and which nothing clears
  between pages (freelens:packages/core/src/common/item.store.ts:52, 62-64,
  217-269); the layout shows the remove button of the host whenever the store
  has a selection among the rows, whatever `isSelectable` says, and the dialog
  of that button deletes each object (content.tsx:408-455, 555, 583-595;
  kube-object.store.ts:506-522; R7.11). A selection passed through would put the
  deletion of workload clusters one click and a confirmation away from a page
  that shows no checkbox (A7). Its `getTotalCount` counts the rows that the page
  gives the layout, so that the header counts what the list shows. It also tells
  the page what the layout keeps to itself (kube-object-list-layout.tsx:146-153,
  163-184): the start and the end of each load, the namespaces it reads, which
  the host names in its call (kube-watch-api.ts:147, 170, 194), and each failure
  that `onLoadFailure` reports, of a load and of the reload after a 410, the one
  path by which a subscription reports a failure (kube-object.store.ts:642-651).
  It hands each failure on to the layout as well, which keeps its own mark of
  it. A load that the host aborts reports no failure, and the adapter tells no
  outcome of it (kube-object.store.ts:261-269, 298-302, 340-348).
- The page loads nothing and subscribes nothing itself. A namespace is loaded
  once a load of a store that includes it has ended in this mount of the page,
  and it stays loaded while the filter keeps it, also when a new set of stores
  mounts the layout again: the layout subscribes on its mount and lets go on its
  unmount (kube-object-list-layout.tsx:131-161), and the kinds of the providers
  are known only once the Clusters are read, so the first load of a visit is
  followed by a new mount. One that the filter adds is not loaded until the load
  that includes it ends, even when the store still holds its objects from an
  earlier read, which nothing has watched since: a load merges the namespaces it
  reads into the items of the store and keeps those of a namespace that the
  filter no longer selects (kube-object.store.ts:376-383). But after a load over
  the whole cluster that the host follows, a namespace that the filter adds
  while every namespace stays selected, `hasSelectedAll` in the context of the
  frame (P34), counts as loaded: the host starts no load for it
  (kube-watch-api.ts:181-188), and its watch over the whole cluster brings its
  objects into the store (kube-object.store.ts:568-569, 671-745); when the host
  does not follow that load, P34 says so. The rows are the Clusters of the store
  in the namespaces that it has loaded, which the page passes to the layout as
  `items`, in the place of the `contextItems` that the layout lists by default
  (kube-object.store.ts:162-170; kube-object-list-layout.tsx:265); and the
  context of the model takes from each store its objects in the namespaces that
  that store has loaded: those of a namespace that it has not loaded yet are not
  given, and the marks that need them show the spinner (SPEC-0003, "What it
  takes and returns").
- The page passes `isReady` false from its mount until the first load of the
  Clusters has ended, and then while a load of the Clusters runs and no row is
  listed, so that the layout shows its spinner in the place of the rows: a load
  sets only `isLoading`, and only a reset of the store clears `isLoaded`, so the
  layout, which falls back on `isLoaded` when it is given no `isReady`, would
  show its empty list instead, or rows of an earlier visit (list-layout.tsx:108,
  249-251; content.tsx:457-480; kube-object.store.ts:328, 335;
  item.store.ts:262-269), a flash of empty content that the kit forbids (kit,
  `docs/design.md`, "States that are not the happy one").
- A view of one Cluster whose namespace the page does not read reads it as
  P31 says.
- Whether the host follows the list, the page tells as P34 says.

The host keeps each store in step with its loads, as in every list of the
host, and the page adds to each store a listener and nothing that loads.

**P25.** Proposed: the page tells the outcome of each load from the code of each
failure that its adapters hand it, never from a text (kit, `docs/design.md`,
"States that are not the happy one"). A read that the server refuses throws,
through the client of the host, the `Status` of Kubernetes itself, whose `code`
is 403 (freelens:packages/utility-features/json-api/src/json-api.ts:41-50,
256-259; freelens:packages/utility-features/kube-api/src/kube-api.ts:636-655),
and the store hands it on as the cause of its failure
(kube-object.store.ts:257-277, 286-313): that is a refusal. Any other failure is
a failure, its text shown as its reason and never read; the client of the host
keeps the body of any other answer in a private field (json-api.ts:107-122,
262-267), so no other code is read. The store names no namespace in a failure
(kube-object.store.ts:271, 305), and it decides itself, from the context of the
frame, whether it reads the namespaces of a load over the whole cluster
(freelens:packages/core/src/renderer/cluster-frame-context/for-namespaced-resources.injectable.ts:56-59;
freelens:packages/core/src/extensions/common-api/k8s-api.ts:173-195). So the
page states what the failures and the rows say, and the message of each answer,
shown as the cluster wrote it and never read, says where: over the whole
cluster, or in which namespace. A load of namespaces one by one reports a
failure for each namespace that fails, a load over the whole cluster one, and a
namespace read with no Cluster nothing (kube-object.store.ts:257-277, 284-313).
The page knows the namespaces of each load (P19), and whether the load read them
over the whole cluster (P34), so it tells a load in which every namespace
failed, with as many failures as namespaces, or one over the whole cluster, from
a load in which some were read.

- **Restricted.** Every namespace of a load of the Clusters refused: in the
  place of the rows, that the user may not list the Clusters of the namespaces
  that the filter selects, the message of each answer, and the permission it
  takes, `get`, `list` and `watch` on `clusters` of `cluster.x-k8s.io`, in those
  namespaces or over the whole cluster (R6.4), and that the filter selects the
  namespaces that the user may read, which the host reads with one request for
  each, all at once, when the filter leaves out one of the namespaces of the
  cluster (for-namespaced-resources.injectable.ts:56-59;
  kube-object.store.ts:284-288).
- **Partial.** Some namespaces of a load of the Clusters failed, refused or not,
  and the others were read: their Clusters, and a notice that the Clusters could
  not all be read, with the message of each answer and, for a refusal, the
  permission; over the list, above the layout, when rows are listed, and in the
  place of the rows when none is, where it also says that the namespaces that
  could be read hold no Cluster. A kind of the context that could not be read,
  in every namespace of its load or in some, gives the same notice, which names
  the kind and what reads Unknown or is noted because of it (SPEC-0003, "What it
  takes and returns"). The page then gives that kind to no Cluster of the
  namespaces of that load: the store names no namespace in a failure and keeps
  what the other namespaces returned (kube-object.store.ts:305, 379-383), so the
  empty list of a refused namespace would read as one that was read, and
  SPEC-0003 gives Idle only when every source of activity was read (SPEC-0003,
  "The closed sets"). Those Clusters read Unknown where that kind counts, with a
  note of the model, until a load of that kind through the layout ends with no
  failure.
- **Failed.** Every namespace of a load of the Clusters failed, not all refused:
  in the place of the rows, that the Clusters could not be read, with the reason
  of each answer and, for a refusal among them, its permission.
- **A refresh that failed.** A reload after a 410 that fails empties the kind,
  or the namespace of its watch (kube-object.store.ts:271-277, 304-313,
  379-383). The page says it as an event of the past, with its time: that the
  Clusters, or the kind, could not be read again at that time, and why, as
  Partial or Failed say; and a kind of the context is then given to no Cluster
  of the namespaces of its last load, as in Partial. It keeps the notice, and
  holds the kind back, until a later read of the kind ends with no failure: a
  load of the layout, at a change of the filter or at a new mount, or a reload
  that the store starts on its own, which tells no one when it succeeds
  (kube-object.store.ts:642-651) but sets the public `isLoading` of the store
  while it runs (freelens:packages/core/src/common/item.store.ts:49;
  kube-object.store.ts:328, 353-355). The adapter takes a run of `isLoading`
  during which no load of the layout runs and no failure is reported for a
  reload that succeeded, and the page then releases the kind and ends the
  notice.
- **A view of one Cluster** that reads its namespace as P31 says gives the state
  of that view alone: Not found, or its namespace refused, with the permission;
  the list does not change.

A notice that the page draws in the place of the rows goes to the table of the
layout through `tableProps`, which the layout passes after its own content for
no rows
(freelens:packages/core/src/renderer/components/item-object-list/content.tsx:566-578;
freelens:packages/core/src/renderer/components/table/table.tsx:274-275), so it
shows only when no row is listed, and only in those states, so that the spinner
and the empty list stay the host's. A notice with rows, of Partial or of a
refresh that failed, shows over the list, above the layout. The header of the
layout stays in every state of the reads: the title, the filter of namespaces,
which is the way to other namespaces, the search, and the marks of the host
(kube-object-list-layout.tsx:259-292). Its count counts what the list shows
(P19), so over a read that failed with no row listed it would read "0 items"
(freelens:packages/core/src/renderer/components/item-object-list/header.tsx:56-69).
In Restricted, Failed and Partial with no row, the page puts "not counted" in
its place through `customizeHeader`, as the Velero extension does
(freelens-velero-extension:src/renderer/components/family-page.tsx:132-136), and
keeps the marks of the host: the count is the first child of the `info` that the
layout hands the customizers of a page, before its marks
(kube-object-list-layout.tsx:282-288;
freelens@v2.0.0:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:263-267),
and the page replaces that child alone. That order is not an API of the host:
the restricted session sees it on both releases (case 1). The states before the
list, Checking, Not installed and An older Cluster API, have no store to read,
so they are drawn in the place of the layout, under the title of the page (P20).
The Velero extension also takes the state of a read from the code of its answer,
and maps 401 to forbidden and 404 to not served as well
(freelens-velero-extension:src/common/read-state.ts:41-47); here a refusal is
403 alone, since a kind that the cluster does not serve has no API and is told
before any read (P20), and the client of the host keeps the code of any other
answer private.

**P26.** Proposed: Stale is what the host shows, with the words of P25 for a
refresh that failed. A store tells its subscriber of no failed watch:
`subscribe` takes only `onLoadFailure` and an `AbortController`, a watch that
fails starts again on its own, and one answered 401 or 404 stops, with no call
(kube-object.store.ts:59-70, 545, 598-608, 628-641, 652-655).

- **On 2.1.0** the host marks a cluster that it cannot reach, in the header of
  the list, with a tooltip that says that the list may be out of date until
  the cluster answers again
  (freelens:packages/core/src/common/k8s-api/watch-reconnect.ts:25-29;
  kube-object-list-layout.tsx:81-92, 286). Meanwhile the watches wait and the
  store keeps its items, so the list keeps its rows
  (kube-object.store.ts:598-608).
- **On both releases** the layout marks the failures of its loads in its
  header, their text in a tooltip (kube-object-list-layout.tsx:163-184), and
  the page says them in words (P25).
- **On 2.0.0** the host has no such mark: its stores have no `watchReconnect`,
  and a watch that fails starts again every 5 seconds and logs each failure
  (freelens@v2.0.0:packages/core/src/common/k8s-api/kube-object.store.ts:93-96,
  568-575, 586-590). There the list keeps its rows with no mark. The phase of
  the cluster in the catalog, which the extension API gives on both releases
  (freelens:packages/core/src/extensions/renderer-api/catalog.ts:62), does
  not take its place: it is the connection that the main process checks every
  30 seconds (freelens:packages/core/src/main/cluster/manager.ts:139-152;
  freelens:packages/core/src/main/cluster/cluster-connection.injectable.ts:243-247),
  not the watches of the list, and the lists of the host do not show it.
- The page keeps no copy of what it read, and reads no protected member of a
  store: a refresh that failed leaves out what it could not read, as in the
  lists of the host.

It departs from the kit, whose Stale keeps the last data, with their time and
the failure of the refresh (kit, `docs/design.md`, "States that are not the
happy one"), and which keeps nothing important only in a tooltip (kit,
`docs/design.md`, "Interaction and performance"): the mark of the host carries
no time and says its words in a tooltip, 2.0.0 has none, and a refresh that
failed keeps no data. These are what the host gives, which "Notes and
deviations" lists; DESIGN.md records the departure.

**P31.** Proposed: a view of one Cluster whose namespace the page does not read,
the details of the extension opened by their address (P6) or the panel in the
details of the host (P16), which can open with no page of the extension mounted
(R7.13), reads its Cluster and the objects of its Cluster in that namespace
through stores of its own, as A13 asks whatever namespaces the filter selects:

- one instance of the `KubeObjectStore` subclass of the model of each kind that
  it reads, the Cluster included (AGENTS.md, "CRD KubeObject Pattern"), built
  with the API that the host registered for that kind (k8s-api.ts:173-195) and
  never registered, so that the store that the host returns for that API stays
  its own
  (freelens:packages/core/src/common/k8s-api/api-manager/api-manager.ts:122-131,
  162-178);
- for a kind of a provider, which has no model in the extension, since its kind
  is known at run time alone (A6), one instance of `ProviderObjectStore`, a
  generic subclass of `Renderer.K8sApi.KubeObjectStore` in
  `src/renderer/reads/`, built in the same way with the API that the host
  registered for that kind at the version of its contract (P3), which the host
  builds with a class of its own
  (setup-auto-crd-api-creations.injectable.ts:93-112), and never registered
  either;
- in the effect that the view opens: one `loadAll` of that namespace, then its
  `subscribe`, under one `AbortController` that the effect creates, as the host
  does for its own subscriptions (kube-watch-api.ts:145-164; AGENTS.md, "Rules
  That Fail Silently"); when the view closes, the subscription ends.

Each of these stores keeps its own `loadedNamespaces` and its own items
(kube-object.store.ts:138), so the read touches nothing that the page, or a list
of the host, reads, and its failures give the state of the view alone (P25). The
view shows its Cluster from its own store of Clusters, and not the object that
the host hands the panel, which comes from the store of the host by its address,
read once when that store does not hold it, and follows only while a
subscription covers its namespace
(freelens:packages/core/src/renderer/components/kube-object-details/current-kube-object-in-details.injectable.ts:29-44;
kube-object.store.ts:400-414). It takes its context from the items of its
stores, which hold that namespace alone, and not from their `contextItems`,
which follow the filter (kube-object.store.ts:162-170).

Its limits. It reads the namespace of its Cluster alone, so the kinds of the
operator, which the page reads in the namespaces of the filter (P2), and a
ClusterClass in another namespace (R3.12) are not read for that view, and the
model notes them (SPEC-0003, "What it takes and returns"). Its list and its
watch of that namespace also set the resource version that the `KubeApi` of the
host keeps for the whole cluster
(freelens:packages/utility-features/kube-api/src/kube-api.ts:584-585,
1011-1012), from which every watch of that API over the whole cluster starts
again after a failure (kube-api.ts:812-818, 834; kube-object.store.ts:586-589,
620-625): one that starts again while the view reads, such as the watch of the
list of Clusters of the host with every namespace selected, under the panel,
starts from a version of that namespace alone, and can miss a change made in
another namespace in between. "Notes and deviations" lists both.

It departs from AGENTS.md, whose `KubeApi` and `KubeObjectStore` subclasses are
never instantiated ("CRD KubeObject Pattern").

**P34.** Proposed: the page says in words when the host reads its list once and
does not follow it. The host reads a selection of every namespace that the
cluster lists over the whole cluster, and watches it only when the user may
watch every resource of the core group over the whole cluster, `watch` on `*`
with no namespace; otherwise it watches nothing, no watch fails, and it marks
nothing ("Notes and deviations"). The extension API tells both only through the
context of a store of the extension's own class, its public getter `context`
(freelens:packages/core/src/extensions/common-api/k8s-api.ts:178-180):
`isLoadingAll(namespaces)`, whether a load of those namespaces reads over the
whole cluster, and `isGlobalWatchEnabled()`, the answer to the review of access
of `watch` on `*` that the host makes when the cluster connects, again every 15
minutes and when the definitions that its frame lists change, which the page
reads with no request of its own (for-namespaced-resources.injectable.ts:56-60;
cluster-connection.injectable.ts:248-252, 417-430, 466-469, 521;
freelens:packages/core/src/main/cluster/create-can-i.injectable.ts:35-45). So:

- The page builds one `ClusterStore` (The model of a Cluster), once in the frame
  of the cluster, also when it mounts twice, with the API of Clusters at
  `v1beta2` that the host registered, and never loads, registers or subscribes
  it: the store that the page reads stays the host's (api-manager.ts:122-131,
  162-178). Of it the page reads `context` alone.
- When a load of the store of the Clusters starts, which its adapter tells it
  with the namespaces of that load (P19), the page reads `isLoadingAll` for
  those namespaces, as the store does when the load starts; when the load ends
  with no failure, it reads `isGlobalWatchEnabled()`, as the store does at the
  `subscribe` that follows (kube-object.store.ts:247-252, 563-574). The
  namespaces of the cluster follow a store that the host watches
  (freelens:packages/core/src/renderer/frames/cluster-frame/cluster-frame.tsx:34),
  so the answer of `isLoadingAll` could change in between. When the first is
  true and the second false, the page says, above the layout, with rows or
  without, as an event of the past with its time, that the list was read once,
  at that time, over the whole cluster, and is not followed, so that a change
  reaches it when the filter changes or the page opens again; that the host
  follows a list over the whole cluster only for a user who may watch every
  resource of the core group over the whole cluster; and that a selection that
  leaves out a namespace is read and watched namespace by namespace. The kinds
  of the context are read with the same namespaces, so the notice covers what
  the list shows of each Cluster. The words are on the page, in no tooltip (kit,
  `docs/design.md`, "States that are not the happy one", "Interaction and
  performance").

Tried in Freelens dev at `v2.0.0` and at `v2.1.0`, on the cluster of the
definitions with the kubeconfig of the scripts: built in the frame with the API
of Clusters of the host, such a store sent no request, logged nothing, and was
neither registered nor loaded, and its `context` was that of the store of
Clusters of the host. On both releases the getter, the same at `v2.0.0`
(freelens@v2.0.0:packages/core/src/extensions/common-api/k8s-api.ts:177-179),
gave `contextNamespaces`, `allNamespaces`, `hasSelectedAll`, `isLoadingAll`,
false for one namespace and true for every namespace of the cluster, and
`isGlobalWatchEnabled()`, true for that identity, which may watch everything.
Its false, for an identity that may not, was seen on neither release: the
restricted session sees it on both (case 4).

It departs from AGENTS.md, whose `KubeApi` and `KubeObjectStore` subclasses are
never instantiated, because the store comes from the host ("CRD KubeObject
Pattern"): the page still reads the store of the host, and this instance is the
one way in which the extension API tells the page that the host does not follow
its list.

### The states that are not the happy one

| State                                  | What the page does                                                                                                                                                                                                                                                                                                                                                                                                 | Decided from                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading                                | The spinner of the list of the host, in the place of the rows, until the first load of the Clusters in a mount of the page has ended, and then while a load of the Clusters runs and no row is listed, through `isReady`; in the details, the spinner in the place of a mark whose inputs are still loading, or lie in a namespace that a store has not loaded yet, never a mark computed from them                | The reads of the page (P19)                                                                                                                                  |
| Empty                                  | The empty list of the host, under the title of the page and the filter of namespaces, which say what was looked for                                                                                                                                                                                                                                                                                                | A load of the namespaces of the filter with no failure, and no Cluster (freelens:packages/core/src/renderer/components/item-object-list/content.tsx:457-480) |
| Checking                               | "Checking whether this cluster serves Cluster API", in the place of the list, under the title of the page                                                                                                                                                                                                                                                                                                          | P20                                                                                                                                                          |
| Not installed                          | "Cluster API is not installed in this cluster: it serves no Cluster at `cluster.x-k8s.io/v1beta2`", in the place of the list, under the title of the page                                                                                                                                                                                                                                                          | P20                                                                                                                                                          |
| An older Cluster API                   | That the cluster serves Clusters at `v1beta1` alone, which this extension does not read, and that `v1beta2` came with Cluster API v1.11 (`CHANGELOG/v1.11.0.md:11`; A2), in the place of the list, under the title of the page                                                                                                                                                                                     | P20                                                                                                                                                          |
| Restricted                             | In the place of the rows, under the header of the layout: that the user may not list the Clusters of the namespaces that the filter selects, the message of each answer, which says where, the permission it takes: `get`, `list` and `watch` on `clusters` of `cluster.x-k8s.io` (R6.4), and that the filter selects the namespaces that the user may read; "not counted" in the place of the count of the header | Every namespace of the load refused (P25)                                                                                                                    |
| Partial                                | The list, and over it, above the layout, a notice for each kind that could not be read, or for the Clusters that could not all be read: the message of each answer, what reads Unknown or is noted because of it, and the permission it takes (R6.4); with no row, the notice in the place of the rows, which says that the namespaces read hold no Cluster, and "not counted" in the place of the count           | Some namespaces of a load failed (P25)                                                                                                                       |
| Failed                                 | In the place of the rows, under the header of the layout, that the Clusters could not be read, with the reason of each answer and the permission of a refusal among them, and "not counted" in the place of the count; after a refresh that failed, that they could not be read again at its time, and why                                                                                                         | Every namespace of the load failed, not all refused (P25)                                                                                                    |
| Stale                                  | What the host shows: on 2.1.0, the rows with the mark of the host for a cluster that it cannot reach, in the header of the layout; on both releases, the mark of the host for the failures of its loads, with the words of P25; on 2.0.0, the rows with no mark                                                                                                                                                    | P26; freelens:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:81-92, 163-184                                       |
| Not followed                           | Above the layout, with rows or without: that the list was read once, at its time, over the whole cluster, and is not followed, that the host follows such a list only for a user who may watch every resource of the core group over the whole cluster, and that a selection that leaves out a namespace is read and watched namespace by namespace                                                                | The context of the frame, when a load starts and when it ends with no failure (P34)                                                                          |
| Details of a Cluster that is not found | In the details, that no Cluster `<namespace>/<name>` is in its namespace, which was read, or that its namespace cannot be read, with the permission it takes                                                                                                                                                                                                                                                       | The read of its namespace, by the page or as P31 says (P25)                                                                                                  |
| An address that names no Cluster       | In the details, that the value of `details` is not `<namespace>/<name>`, as written; nothing is read for it                                                                                                                                                                                                                                                                                                        | P6                                                                                                                                                           |
| A render error                         | The error page of the template, in the place of the page or of the details alone                                                                                                                                                                                                                                                                                                                                   | The error boundaries (AGENTS.md, "Renderer Components"; P15)                                                                                                 |

**P20.** Proposed: the page tells four cases apart before the list, from the
APIs that the host registers and from its store of definitions, never by a read
of its own. The host registers an API of a kind for every version that its
definition serves, or, when the user may not list the definitions, for every
version that the discovery of the cluster lists
(freelens:packages/core/src/renderer/before-frame-starts/runnables/setup-auto-crd-api-creations.injectable.ts:43-54,
62-85;
freelens:packages/core/src/renderer/components/custom-resources/discovered-custom-resources.injectable.ts:41-61),
and its store of definitions says whether it is loaded or failed
(freelens:packages/core/src/common/item.store.ts:48, 50). So:

- the host still checking: that store neither loaded nor failed, and no API
  of Clusters at `v1beta2` registered yet;
- Cluster API not installed: that store loaded with no definition
  `clusters.cluster.x-k8s.io`, or, once it failed, no API of Clusters in any
  version from the discovery;
- an older Cluster API: an API of Clusters at `v1beta1` and none at
  `v1beta2`, registered from the definition (R7.18) or from the discovery, as
  on a cluster whose definitions the user may not list and which serves
  Clusters at `v1beta1` alone;
- the list: an API of Clusters at `v1beta2`.

An API is looked up in the registry of the host, which sends no request
(api-manager.ts:93-94), so the page never requests `v1beta1` (A3). The page of
the template says "not available" in all three cases
(freelens-example-extension:src/renderer/components/available-version.tsx:43-80),
where the kit tells checking from not installed (kit, `docs/design.md`,
"States that are not the happy one"). It departs from AGENTS.md, which makes
the page of a kind with `createAvailableVersionPage` from the pages of its
versions ("CRD KubeObject Pattern", "Adding an API"): this page reads one
version alone (A2), and needs the three states that page does not have. The
page is an `observer`, and follows when the host registers the API (AGENTS.md,
"Rules That Fail Silently").

### The theme

The view authors no color. Each state takes the token that SPEC-0003 gives
it (SPEC-0003, P31), applied as P21 says, and nothing tells a dark theme from
a light one. The pull request of the view checks it in the dark and the light
theme of Freelens, and in a theme that is not the default, such as the high
contrast theme of 2.1.0
(freelens:packages/core/src/features/theme/files/common/high-contrast.theme.yaml),
with the screenshots of that check (kit, `docs/design.md`, "Theme", "How it
is enforced").

**P21.** Proposed: a mark of state, of health, of activity, of weight or of
freshness, is the `Badge` of the host, its word in the color of the text of
the theme, on a background that `color-mix` takes from the token of its tone
and with a border of that token; a mark of the tone of Unknown keeps the
background that the host gives its badges, which is that token itself
(freelens:packages/core/src/renderer/components/badge/badge.module.scss:34-39).
Two tokens of SPEC-0003 cannot be the color of a word: in the dark Freelens
theme, `--colorVague` is `#36393e` and `--colorTerminated` is `#4c5053`, on a
content color of `#262b2f`
(freelens:packages/core/src/features/theme/files/common/freelens.theme.yaml:31,
72, 73), contrasts of about 1.2 and 1.8 to 1, computed here from those values;
and the host takes `--colorVague` as a background itself
(freelens:packages/core/src/renderer/components/badge/badge.module.scss:34-39).
The kit derives an accent from a token with `color-mix` (kit,
`docs/design.md`, "Theme"), and the words carry the meaning without the color
(kit, `docs/design.md`, "Status").

### A7, S5, S6 and S2

**A7** is built as "The list" and "The details" say: no selection, no menu, no
remove button, details of the extension's own, so that the menu of the host,
with its Edit, Delete and Force Finalize (R7.7 to R7.9), and the removal of the
selected rows (R7.11) are not one click away from the list or from its details;
the adapter of the store answers the selection and the removal itself, since the
store of the host keeps the selection that its own list of Clusters sets (P19).
The references to the KubeadmControlPlane, the MachineDeployments, the
MachinePools and the ClusterClass are plain text until SPEC-0005, as the
maintainer decided, and so are the other objects of Cluster API that the view
names (P18), and the owners and the namespace that the metadata of the host
would link (P32): nothing of the extension opens the details of the host for an
object of Cluster API, or for a Namespace. An object of a provider links to the
page of the host, as A6 gives it.

**S5**, tried by this first list page:

**P22.** Proposed: S5 is tried in its two halves. On the page of the extension,
the rows have no checkbox and no menu, a right click opens no menu of the host,
no remove button shows, also with Clusters selected in the list of the host, and
a click opens the details of the extension, not those of the host. In the
details of the host, which open a Cluster from its address as R7.13 says, the
panel of the extension sits after the metadata and before the custom resource
section and the events (P16).

**S6**, tried by this first view of Clusters: with the Sveltos extension
installed, both extensions list the same Clusters, and neither watch disturbs
the other. The Sveltos extension reads Clusters at `v1beta1` through the store
of the host for that version, and this one at `v1beta2` through another (R7.17,
R7.28, A9); it registers no API, so it never becomes the store that the Sveltos
extension reads (R7.31). A read at `v1beta1` works only where the conversion
webhook runs (R4.115), so S6 is tried on the cluster of the real project, by a
session (P29).

**P29.** Proposed: S6 is a session of the integration tests, in the job of the
real project (P33), with the Sveltos extension at the release that SPEC-0001
read, `@freelensapp/sveltos-extension` `2.1.0` (A9;
freelens-sveltos-extension:package.json:2-3), from its official package, and
the definitions of Sveltos from the release whose definitions the CI of that
extension at `2.1.0` applies, the chart `projectsveltos` `1.16.1`
(freelens-sveltos-extension:.github/workflows/integration-tests.yaml:264-279),
at least that of `SveltosCluster`, without which the page of that extension
does not render (freelens-sveltos-extension:src/renderer/index.tsx:68-69). The
pins of the test environment fix both by version and by the SHA-256 of the
file that the session uses, the package of the extension and the file of the
definitions, as they fix every file that they download (kit,
`docs/safety.md`, "Development and tests"; TESTING.md, "The pins"): the
session downloads the package, checks it against its pin, and installs that
file, which the Extensions page installs as it installs a release tarball
(AGENTS.md, "Checking the Extension in Freelens Dev"; the README, "From a
release tarball"). The reason: S6 runs in Freelens dev on a kind cluster, as
every session does, so it can be codified, and the kit verifies nothing only
once and has every manual step run by the maintainer (kit, `docs/testing.md`,
"Non-regression policy"; kit, `docs/process.md`, "Manual testing
escalation"). It replaces D1, which tried S6 once by hand, by the coding
agent, with a release of Sveltos that it did not fix.

**S2**, which this spec tries (P3): a user who may read the definition of a
kind of a provider by its name, and may not list the definitions, sees the
reference as a link; a user who may not read it sees it as text, with the
reason and the permission it takes (R6.5).

### Safety

- **What it reads.** The kinds of "What the view reads", through the stores
  of the host and those of P31, at the versions A2 names, and one definition
  at a time by its name. Never a Secret, never a workload cluster, never
  `v1beta1`, and no field of the spec of a KubeadmControlPlane but
  `spec.replicas` and `spec.version` (A3; SPEC-0003, "Safety").
- **What it writes.** Nothing: no create, no patch, no delete, and no request
  that creates an object, such as a review of access, which is a write even when
  only asked to look (kit, `docs/safety.md`, "Writing"). Its list and its
  details offer none of the paths of the host that write, the remove button of
  the host included, which the adapter of the store keeps away whatever the host
  holds selected (P19), and nothing of the extension opens the details of the
  host, with their menu, for an object of Cluster API or for a Namespace: the
  references to those objects are plain text until SPEC-0005, and the owners and
  the namespace in the metadata are text and the namespace badge (A7; P18, P32).
  The one link to the details of the host is that of an object of a provider,
  which A6 gives.
- **How the tests prove it.** A unit test reads the modules of the view, in
  `src/renderer/` and `src/common/views/`, the test files left out, and fails
  on a call of a method that writes, of a store, of an API or of the client
  of the host, on a request other than a GET, and on the paths under which the
  fields of R3.36 lie, matched from `spec`: `spec.files`, `spec.users`,
  `spec.initConfiguration`, `spec.joinConfiguration` and
  `spec.kubeadmConfigSpec`, as SPEC-0003 checks its own two folders
  (SPEC-0003, "Safety"); it is seen failing once on each of two lines planted
  for the purpose, a write and a read of `spec.kubeadmConfigSpec` (kit,
  `docs/testing.md`, "Checks worth trusting"). In Freelens, every request that
  the frame of the cluster sends to the groups that the view reads is a GET, a
  list or a watch, and every object of the fixtures has, after the session,
  the `resourceVersion` it had before it, or the one that a write of the
  session itself gave it; both checks are seen failing once, on a run in which
  the session patches a label of a fixture from the frame of the cluster
  (kit, `docs/testing.md`, "Checks worth trusting").

## Tests

### Unit

The cases start from the objects of the fixtures of SPEC-0002, as those of
SPEC-0003 do, and a value that the schema rejects is written at this layer
only (kit, `docs/testing.md`, "The test environment has two tiers"). The
pure functions of the view live in `src/common/views/`, whose program has
neither the DOM nor Node, as SPEC-0003 places the model (SPEC-0003, P35).

- `src/renderer/api/cluster/cluster-v1beta2.test.ts`: the static metadata,
  the kind, the namespace scope, the `apiBase`, and the `crd` with the one
  version `cluster.x-k8s.io/v1beta2`, the plural, the singular, the short
  name `cl` and the title of P4; types: every Cluster of the fixtures read at
  `v1beta2` fits `Cluster`, `Cluster` fits the input of the rule of Cluster
  of SPEC-0003, and a Cluster with no `spec`, a topology with no `classRef`
  or no `version`, and a reference with no `apiGroup`, `kind` or `name` fail
  the check of types, as the schema requires them (crd:2101, 2137, 3492,
  3888).
- `src/renderer/api/context/context-models.test.ts`: each model of P1, its
  kind, version, scope and `apiBase`; each fits the input of its rule in
  SPEC-0003; the model of KubeadmControlPlane types no field of the spec but
  `replicas` and `version` (A3, R3.36).
- `src/renderer/reads/store-adapter.test.ts` (P19), with a double of a store of
  the host: the adapter has the members that the layout and the host use, and no
  other; it passes `api`, `isLoaded`, `failedLoading`, `contextItems`,
  `getByPath`, and `loadAll` and `subscribe` with the options of the host, to
  the store, unchanged; with a Cluster selected in the double, it selects
  nothing, `selectedItems` is an empty list, `pickOnlySelected` gives no row,
  the toggles leave the double as it was, and `removeItems` sends nothing, so
  that the layout, which decides its remove button from them
  (content.tsx:583-595), shows none, seen failing once against an adapter that
  passes the selection and the removal through; `getTotalCount` counts the rows
  that the page gives the layout; it tells the page the start and the end of
  each load, its namespaces, and each failure of a load and of a subscription,
  and hands each failure on to the `onLoadFailure` of the layout as well; a load
  that the host aborts gives no outcome; seen failing once against an adapter
  that drops the `onLoadFailure` of the subscription, whose failure of a reload
  the page then never sees. The subscription itself is the host's, which the
  stub of the SDK does not run; the session in Freelens checks it (In Freelens,
  step 6).
- `src/renderer/reads/cluster-namespace-read.test.ts` (P31): a view of one
  Cluster whose namespace the page reads builds no store of its own; one whose
  namespace it does not read, and the panel with no page mounted, build one
  store of the model's class for each kind, the Cluster included, and one
  `ProviderObjectStore` for each kind of a provider, built with the API that the
  host registered for that kind and version, all never registered with the API
  manager of the host (its `registerStore` never called, its `getStore` still
  the host's store), load that namespace alone, then subscribe each store, and
  end the subscriptions when the view closes; seen failing once against a view
  that registers its stores. The view shows its Cluster from its own store, and
  not the object that the host hands the panel, seen failing once against a
  panel that shows that object. The effect run twice, as Freelens dev runs it,
  leaves one read running, seen failing once against a controller kept across
  the two runs (AGENTS.md, "Rules That Fail Silently"); a failure of that read
  gives the state of the view alone.
- `src/common/views/read-state.test.ts` (P25, P26, P34): a failure whose cause
  is a `Status` with the code 403, a refusal; a `Status` with another code, an
  error of the client of the host that carries no `Status`, and a thrown string,
  failures, with their text as the reason and never read; every namespace of a
  load of the Clusters refused, or a load over the whole cluster refused,
  Restricted, with the message of each answer, the permission and the way
  through the filter, never empty; some namespaces refused or failed and the
  others read, Partial, with rows, and with none, where it says that those
  namespaces hold no Cluster; a refusal and another failure in every namespace,
  Failed, with each reason and the permission of the refusal; "not counted" in
  Restricted, in Failed and in Partial with no row; a kind of the context
  refused in one of the two namespaces of its load, Partial, naming the kind,
  and given to no Cluster of either namespace, whose activities read Unknown
  with the note of the model, never Idle, seen failing once against a context
  that gives each Cluster what was read, and given again once a load of that
  kind ends with no failure; the failure of the reload after a 410, a refresh
  that failed, said as an event of the past with its time and its reason, no row
  kept of what it could not read, seen failing once against a state that keeps
  the rows of the last read (P26), its notice, and a kind of the context held
  back, until the next load of that kind through its adapter, and not after; the
  load of a view of one Cluster refused, the state of that view alone, the list
  unchanged; a watch that fails and starts again, which the host reports to no
  one, no state of its own; the notice of a list not followed, with the time of
  its read, after a load that started over the whole cluster and ended with no
  watch of every resource of the core group, and none after a load that started
  namespace by namespace, for a user who may watch them, or after a load that
  failed (P34); `isLoadingAll` true at the start of a load and false at its end,
  with no watch of every resource, the notice, and false at the start and true
  at the end, none, seen failing once against a page that reads `isLoadingAll`
  at the end of the load (P34); a reload that the store starts itself and that
  ends with no failure, seen through `isLoading` while no load of the layout
  runs, releases a kind held back and ends the notice of its refresh, and one
  that fails keeps both, seen failing once against a page that waits for a load
  of the layout (P25).
- `src/common/views/availability.test.ts` (P20): the store of definitions
  neither loaded nor failed and no API, checking; loaded with no definition of
  Clusters, not installed; a definition that serves `v1beta1` alone, an older
  Cluster API; the API at `v1beta2`, the list; the definitions refused and the
  discovery with Clusters at `v1beta2`, the list; at `v1beta1` alone, an older
  Cluster API; with no Clusters, not installed.
- `src/common/views/context.test.ts`: for each Cluster of the fixtures, the
  context of SPEC-0003: its Machines by its label and their owners, never by the
  labels whose value is a hash beyond 63 characters (R3.6); its control plane by
  its reference; its MachineDeployments and MachinePools by the label
  `cluster.x-k8s.io/cluster-name` in its namespace (A13), which the defaulting
  webhooks set from `spec.clusterName`
  (`core/webhooks/admission/machinedeployment.go:90`;
  `core/webhooks/admission/machinepool.go:83`), as the controller of the Cluster
  finds them (`core/reconcilers/cluster/cluster_controller.go:583-605`); the
  MachineSets and the worker Machines that the Cluster owns (P17); its class by
  `classRef`, in the namespace of the Cluster when the reference names none
  (R3.12), and none, noted as not read, when its namespace was not read; the
  MachineHealthChecks of its namespace; `controllers` from the objects of the
  operator in the namespaces read, none for a provider whose namespace was not
  read, and none where the cluster serves no kind of the operator, each noted by
  the model (P2); two Clusters of one name in two namespaces keep their objects
  apart; an input not yet read is left out and is not empty, and one refused is
  left out with its reason; the key of the memo changes with the `uid` and the
  `resourceVersion` of any object of the context, with the version of
  `controllers` and with the time that the result names, and with nothing else
  (SPEC-0003, "How a view uses it"); the context of every row comes from indexes
  built once for each change of the stores, never row by row; an object that a
  store still holds in a namespace that the filter no longer selects is not in
  the context, seen failing once against a context built from every item of the
  store, and neither is one of a namespace that its store has not loaded yet
  (P19).
- `src/common/views/references.test.ts`: a reference to a KubeadmControlPlane
  resolves to `controlplane.cluster.x-k8s.io/v1beta2` from the labels of its
  definition (R1.17), and one to the infrastructure cluster of the development
  provider to the version its labels give (R1.19); text with its reason: the
  definition refused, a definition with no contract label that the parser knows
  (SPEC-0003, P26), a kind that the cluster does not serve, an object that does
  not exist; `v1beta2` when the label lists `v1beta1` too; the plural from the
  definition; the class with its namespace.
- `src/common/views/cluster-cells.test.ts`: the counters, `1/3`, N/A for each
  counter not written, the tooltip with every counter and its unit, and the
  remark on a MachinePool with no Machines; the version of the topology, the
  versions of the control plane oldest first without a topology, a version
  the parser does not know shown as written and sorted last, and N/A; the
  class, with its namespace when it differs, and N/A with its tooltip; the
  words of each activity and of each state of an activity as SPEC-0003 writes
  them, Progressing left unsaid and `Blocked` and `Unknown` said, Idle and
  Unknown, in the order of the closed set of SPEC-0003, Replacing included;
  each health, N/A for a Cluster that is deleting, the word stale with each
  cause in its tooltip, and the count of the MachinePools of unknown health,
  from the case of SPEC-0003 with a MachinePool without Machines; the status,
  the headline of a message of several lines, the reason for an empty message,
  and N/A; the words that the search matches, the fields of
  `getSearchFields()` among them (P14); each order of the sort of P28, Idle and
  Unknown placed, and the oldest version for a Cluster with several.
- `src/renderer/pages/clusters-page-v1beta2.test.tsx`: the props that the layout
  gets, no selection, no menu, `searchFilters`, the details of the extension on
  a click; `addRemoveButtons` with an own key `onRemove` that holds `undefined`,
  which the layout spreads over its own, seen failing once against `{}`, which
  leaves the remove button of the host in place (content.tsx:585-593); as
  `store` and `dependentStores`, the adapters of the store of the Clusters and
  of the stores of the context that the cluster serves, those of the operator
  among them (P2), with `subscribeStores` on; the store of definitions never
  among them, seen failing once against a page that subscribes it; one adapter
  for a store that two references name, seen failing once against an adapter for
  each reference; the layout keyed by the set of its stores, so that a store
  that the host registers later mounts it again with that store, with the rows
  of the namespaces loaded kept, no spinner, and details that stay with the
  stores of the page, seen failing once against a page that forgets the
  namespaces loaded at the new mount (P19); the page loads and subscribes
  nothing itself; `isReady` false from the mount of the page until the first
  load of the Clusters has ended, with a store loaded on an earlier visit, seen
  failing once against a page that passes none before that load; after a change
  of the filter that adds a namespace whose Clusters the store still holds from
  an earlier read, no row of it until the load that reads it ends, and with no
  row listed the spinner in the place of the rows, through `isReady`, never the
  empty list, seen failing once against a page that lists the items of the store
  as they are; with every namespace selected and a load over the whole cluster
  that the host follows, a namespace that the filter adds while every namespace
  stays selected counts as loaded, and the Clusters that the watch brings into
  it are listed, seen failing once against a page that takes the namespaces
  loaded from the calls of the loads alone; the name, a button that Enter
  presses; the parameter `details`, which opens the named Cluster and which
  closing clears, and a value that is not `<namespace>/<name>`, which shows its
  state and reads nothing; closing the details by their icon or by Escape gives
  the focus back to the name that opened them, and so does a click outside that
  leaves the focus on the body, while a click on the search keeps the focus
  there and the search takes what is typed (P15); each state of the table of
  states, with its words, the header of the layout with its title and its filter
  kept in every state of the reads, a notice with rows above the layout, and the
  title of the page alone in the states before the list; "not counted" in the
  place of the count when a read failed and no row is listed, every other child
  of the `info` of the host kept, seen failing once against a customizer that
  replaces the whole `info`; the store of P34, built once, also when the page
  mounts twice, with its `loadAll` and `subscribe` and the `registerStore` of
  the API manager never called, and its `context` read for the notice of a list
  not followed, above the layout with rows and without, seen failing once
  against a page that reads no such store; a Cluster in the tone of progress
  turns to the tone of a warning at the time that the result names, with no
  other input changed, through a clock of the test (SPEC-0003, "What it takes
  and returns"); the page follows when the host registers the API of Clusters,
  through a `getStore` that reads an observable, as the template tests it
  (AGENTS.md, "CRD KubeObject Pattern").
- `src/renderer/details/cluster-details-v1beta2.test.tsx`: each section, shown
  or hidden, for each Cluster of the fixtures; the metadata in the details of
  the extension alone; the activity that sets the tone, its threshold and the
  instant it turns; the stage of a deletion; the form of a pause and what it
  reaches; the failure fields and the phase `Failed` with their label; the phase
  with its remark; Initialized Yes and No, and Unknown for a
  `ControlPlaneInitialized` that is `Unknown` with `InternalError` and for one
  not written yet; Provisioned Yes, No and Unknown (P27); the count of the
  MachinePools of unknown health next to the health; the conditions in their
  stored order, each with its weight, a negative condition at rest never in the
  tone of an issue; the lines of a message nested, the names of its subjects as
  P18 shows them; one row for each part, a MachineSet and a worker Machine that
  the Cluster owns included, and a MachineSet that the Cluster does not own left
  out (P17); the references to the KubeadmControlPlane, to a MachineDeployment,
  a MachinePool, a MachineSet and a worker Machine among the parts, to the
  ClusterClass and to a Machine named in a message, each plain text, its kind
  and its name, with no element of the role link and no handler of a click, and
  a click on it calls neither `showDetails` nor `navigate` of the stub of the
  SDK (P18), seen failing once against a planted line that renders such a
  reference with the link of the view, as the infrastructure cluster has it; the
  infrastructure cluster, a link to the details of the host; the metadata of the
  host with `hideFields` that holds `namespace`, `ownerReferences`, `uid`,
  `resourceVersion` and `selfLink`, the owners as text and the namespace as the
  namespace badge, no element of the role link in either, seen failing once
  against the metadata with its default `hideFields` (P32); the pending hooks,
  an unknown item kept; a refresh that failed, with its time and its reason
  (P25); a spinner, never Unknown, while the inputs of a mark load; an error
  thrown in a section shows the error page in the details and leaves the list;
  the panel in the details of the host takes its Cluster and its context from
  the stores of the page when the page reads its namespace, and otherwise reads
  both as P31 says, and stops when it unmounts.
- `src/renderer/components/marks.test.tsx`: each tone of SPEC-0003, P31,
  gives its token, the background mixed from it and its border, and Unknown
  the background of the badge of the host; every mark has its word.
- `src/renderer/styles.test.ts`: the stylesheets of the view hold no color
  but tokens and `transparent`; the classes of the columns of state set a
  minimum width and no shrink, and those of the domain a shrink, the largest
  for the class and the version (P7); seen failing once on a planted `#fff`,
  and once on a column of state that shrinks.
- `src/renderer/read-only.test.ts`: the check of "Safety", the writes and the
  fields of R3.36, seen failing once on each of two planted lines.
- `src/renderer/index.test.tsx`: one page with the parameter `details`; the
  root entry with its icon and one child of text; the details of Cluster at
  `v1beta2` alone, at priority 250, through `withDetailsErrorBoundary`;
  `customResources` with the model of Cluster alone; no API registered, at
  `v1beta1` or at any other version (R7.31).

### In Freelens, on the definitions and the fixtures

`integration/__tests__/clusters.tests.ts`, a session on the cluster of the
definitions with the fixtures of every state of SPEC-0002 (P33), each state in
its namespace (TESTING.md, "The fixtures"), which fails on any error that
either process logs (AGENTS.md, "Workflows"):

1. The page lists every Cluster of the fixtures, each with the health, the
   tone, the activities and the marks that the table of SPEC-0003 gives for
   its state at the time of the session, with its counters, version, class
   and status; the Cluster of `machine-pools` reads Degraded, with its
   `Available` `True` (H1).
2. A7 and the first half of S5: no checkbox in the header or in the rows, no
   cell of the menu in the rows, the header keeping the empty one that the
   host renders there (content.tsx:531-533), no menu of the host on a right
   click; a click opens the details of the extension, titled "Cluster:
   <name>", the address holds `details` and not the parameter of the details of
   the host, and no details of the host are open; a click on another row shows
   that Cluster; a click on the title of the page closes them, and so does
   Escape, each time with the focus back on the name; a click in the search
   closes them and leaves the focus there, and the search takes what is typed
   (P15); Tab reaches a name, and Enter opens its details.
3. The second half of S5, on the list of the host of the Clusters, opened by its
   address. With the namespace `default` alone selected, the details of the host
   of the Cluster of `healthy`, opened from its address, show the metadata, the
   panel of the extension, the custom resource section of the host and the
   events, in this order. The session sets the annotation
   `cluster.x-k8s.io/paused` on that Cluster with kubectl: the panel shows the
   activity Paused, and the annotation as the form of the pause, with no reload,
   while nothing of the host watches its namespace, and the metadata and the
   custom resource section of the host keep the Cluster as first read, with no
   such annotation (P16, P31); then it removes the annotation, also when a check
   failed. With the namespace of `healthy` selected, the session selects that
   Cluster with the checkbox of its row, then opens the page of the extension:
   no remove button shows, before or after a click on a row (A7; P19). The
   sessions of the template open no page of the host, whose requests can log
   errors of their own (AGENTS.md, "Workflows"); S5 is about these pages, so
   this session opens them, and an error that they log fails it as any other.
4. The references (P18, P32): the infrastructure cluster opens the details of
   the host of the object of the development provider, at the version of its
   contract label, over those of the Cluster; the close icon of the details of
   the host shows those of the Cluster again, and one Escape closes both. The
   control plane, the parts of the workers, the class, the names in the lines
   of a message and the owners in the metadata are plain text, with no link,
   and the namespace is the namespace badge; a click on one opens no details.
5. The Clusters of `paused`, `deleting`, `upgrading`, `without-topology` and
   `remediation` show the sections that "The details" give them: the form of
   the pause and its instant, the stage of the deletion and no health, the
   topology or none.
6. The list stays live (P19): with the namespaces of `healthy` and `paused`
   selected, and the details of the Cluster of `upgrading` open by their
   address, which reads its namespace as P31 says, a search for a label that the
   session sets with kubectl on the Cluster of `healthy` finds its row, as the
   search matches the labels (P14), and one set on the Cluster of `upgrading`
   reaches the metadata of the details, with no reload; after the filter selects
   the namespace of `without-topology` too, a search for a label set on its
   Cluster finds its row.
7. While the extension is enabled, the Custom Resources tree of the sidebar
   has no entry for the Clusters of `cluster.x-k8s.io` (R7.13; AGENTS.md,
   "Adding an API").
8. The read-only check of "Safety", seen failing once.

`integration/__tests__/clusters-restricted.tests.ts`, a session with a user who
may read only part of the cluster (P23). In every case the identity may list and
watch the namespaces, as the frame of the cluster does
(freelens:packages/core/src/renderer/frames/cluster-frame/cluster-frame.tsx:34),
so that the filter offers more than the namespace of its context, and the host
reads over the whole cluster when every namespace is selected
(freelens:packages/core/src/renderer/components/namespaces/namespace-select-filter-model/namespace-select-filter-model.tsx:84-95;
freelens:packages/core/src/main/cluster/cluster-connection.injectable.ts:648-673;
for-namespaced-resources.injectable.ts:56-59); it may get, list and watch the
definitions, and every kind that the page reads in `default` and in the
namespaces of the fixtures, but for what the case refuses, and what the start
page of the host reads in `default` (P23), so that no other read of it is
refused:

1. The Clusters refused in the namespace of `paused` alone: with the namespaces
   of `healthy` and `paused` selected, the Clusters of `healthy`, over them the
   notice of Partial, with the message of the answer and the permission, and in
   the header the mark of the host for the failure of its load, on both releases
   (P26). Refused in both: Restricted, never the empty list, and in the header
   "not counted" next to that mark, on both releases (P25). With every namespace
   selected, where the host reads each kind over the whole cluster, which grants
   in namespaces do not allow: Restricted, with the message of the answer, which
   says that the user may not list the Clusters over the whole cluster; then,
   with the namespace of `healthy` selected in the filter, the page lists its
   Clusters (P25).
2. The Machines refused in the namespace of `paused` alone, with the namespaces
   of `healthy` and `paused` selected: the Clusters of both, a notice that names
   Machines and the permission, and the activities of both Clusters Unknown,
   with the note of the model, never Idle (P25). Refused in both: the same.
3. S2, with an identity that may not list the definitions: one that may get
   the definition of the infrastructure cluster by its name sees its link;
   one that may not sees text, with the reason and the permission.
4. A list that the host does not follow (P34), with an identity that may get,
   list and watch every kind that the page reads over the whole cluster, and,
   beside the namespaces and what the start page of the host reads in `default`,
   no other resource, so that it may not watch every resource of the core group
   over the whole cluster: with every namespace selected, the Clusters of the
   fixtures, and above them the notice that the list was read once and is not
   followed; then, with the namespace of `healthy` alone selected, no notice,
   and a search for a label that the session sets with kubectl on its Cluster
   finds its row with no reload. It is the one session that sees
   `isGlobalWatchEnabled()` false, on both releases.

Like every session, it fails on any error that either process logs (AGENTS.md,
"Workflows"). It leaves out a refusal that its case expects only when the
refusal arrives, by its status and its URL, as AGENTS.md asks of a response that
a test expects ("Reading the console"), and by the frame that logged it and the
page that frame shows, as the session of the fixtures decides a repeated key
(AGENTS.md, "Workflows"; kit, `docs/testing.md`, "Checks worth trusting"), never
by a pattern for the whole session: the 403 of each list that a case refuses; of
the GET of the definition that S2 refuses; and, in S2, of the list of the
definitions that the host makes itself when the cluster connects
(freelens:packages/core/src/renderer/components/custom-resource-definitions/definitions.injectable.ts:28-40).
A 403 at any other URL, and any other error, fails the session.

**P23.** Proposed: the restricted session uses a second identity on the
cluster of the definitions:

- **Its objects.** The session creates, on that cluster, a ServiceAccount in a
  namespace of its own, for each case a Role or a ClusterRole with what the case
  allows, and its binding, and a token for the ServiceAccount through a
  TokenRequest: writes to the disposable cluster of the tests, which the kit
  allows (kit, `docs/safety.md`, "Development and tests"). A refusal is tried
  only with an identity that is refused. Each identity also gets, in `default`,
  `get`, `list` and `watch` on what the start page of the host reads there, and
  on the kinds that the page reads: a user who may not list Nodes opens a
  cluster on the overview of the workloads, which reads cron jobs, daemon sets,
  deployments, events, jobs, pods, replica sets and stateful sets in the
  namespace that the filter selects for a cluster opened for the first time,
  `default`
  (freelens:packages/core/src/renderer/frames/cluster-frame/start-url.injectable.ts:20-26;
  freelens:packages/core/src/common/front-end-routing/routes/cluster/overview/cluster-overview-route.injectable.ts:17-19;
  freelens:packages/core/src/renderer/components/workloads-overview/overview.tsx:71-80;
  freelens:packages/core/src/features/namespace-filtering/renderer/storage.injectable.ts:20-24),
  and the page then reads its kinds there first. A refusal that a grant avoids
  is granted, not left out, so that what the session leaves out stays the
  refusals of its cases, which it cannot avoid (kit, `docs/testing.md`, "Checks
  worth trusting").
- **Its kubeconfig.** The session writes the token, the server and the
  authority of the kubeconfig of the scripts, through which it reaches that
  cluster (AGENTS.md, "Workflows"), and one context of its own name, into a
  file in a folder that the profile of Freelens dev syncs. Freelens lists the
  cluster of a file that appears in a synced folder
  (freelens:packages/core/src/main/catalog-sources/kubeconfig-sync/watch-file-changes.injectable.ts:106-129).
  In CI the workflow creates the cluster of the definitions with the scripts,
  and its step "Seed the Freelens dev profile" writes one entry of the
  Kubeconfig Syncs, a copy of the kubeconfig of the scripts, before Freelens
  starts (AGENTS.md, "Workflows"; TESTING.md, "Continuous integration"); the
  folder of this session is a second entry next to that copy, in
  `RUNNER_TEMP`. Locally the developer adds the folder once, outside the
  repository, where TESTING.md says; without it the session skips with a
  warning, as a session of the template does without Freelens dev, and in CI
  it fails (AGENTS.md, "Workflows").
- **Its end.** The session deletes the file, the bindings, the Roles or the
  ClusterRoles, the ServiceAccount and its namespace, also when a case failed,
  and checks that they are gone. The token never leaves the machine of the
  session, is never logged, and the folder is never uploaded as an artifact of
  CI (kit, `docs/safety.md`, "Data of real environments").
- **TESTING.md.** Its "Safety" describes one kubeconfig of the scripts for each
  kind cluster, one context and one user, the client certificate of kind
  (TESTING.md, "Safety"); the pull request adds the kubeconfig of this session,
  which the scripts never read, and its rules, among them the grants that every
  identity has in `default`.

The workflow seeds one kubeconfig (AGENTS.md, "Workflows"): this session is
the first that needs another.

### With the real project

`integration/__tests__/clusters-real.tests.ts`, in the job of the real project
of `test-environment.yaml`, which this spec gives Freelens dev (P33):

1. The details of `freelens-capi-md` and the row of the Cluster of
   `clusterctl describe cluster freelens-capi-md`, run with the kubeconfig of
   the scripts and `CLUSTERCTL_DISABLE_VERSIONCHECK=true` (R4.9), give the
   same status and reason of `Available`, and the counters of the control
   plane and of the workers add up to its replicas and to its available,
   ready and up-to-date Machines (R4.22), as the kit asks of what the view
   says of the project (kit, `docs/testing.md`, "Domain correctness").
2. `freelens-capi-mp` reads Degraded, with `ControlPlaneMachinesReady` among
   its issues, while `clusterctl describe cluster` gives its `Available` as
   `True` (H1; SPEC-0002, "Notes and deviations").
3. The topology of both Clusters: the class `quick-start`, their version, and
   a MachineDeployment for one and a MachinePool for the other
   (`test/infrastructure/docker/templates/cluster-template-development.yaml:13-34`;
   `test/infrastructure/docker/templates/cluster-template-development-mp.yaml:13-34`).

`integration/__tests__/clusters-sveltos.tests.ts`, S6, in the same job, with
the Sveltos extension and the definitions of Sveltos of P29:

1. The session installs the Sveltos extension `2.1.0` from the file of its
   official package, which it downloads and checks against its pin, next to
   this checkout, and applies to the cluster of the real project the
   definitions of Sveltos of P29, checked against their pin, and nothing else
   of Sveltos.
   Expected: both extensions enabled, the definitions established, and no
   error in either process.
2. It opens the page of the Clusters of the Sveltos extension, switches it to
   the Clusters of Cluster API, then opens the page of this extension.
   Expected: both list `freelens-capi-md` and `freelens-capi-mp` in `default`,
   and nothing else.
3. It sets the label `tier=dev` on `freelens-capi-md` with kubectl and the
   kubeconfig of the scripts, and searches for it: `tier: dev` in the page of
   the Sveltos extension, whose search reads `key: value` as a label and its
   value
   (freelens-sveltos-extension:src/renderer/api/search-query.ts:14-47;
   freelens-sveltos-extension:src/renderer/pages/sveltos-clusters-page.tsx:69-84),
   and `tier=dev` in this page, which matches the labels as `key=value` (P14).
   Expected: both find `freelens-capi-md`, with no reload.
4. With one page open, it removes the label, then opens the other page; then
   the same the other way round. Expected: the page that is open follows at
   once, the other shows the change when it opens, and neither process logs an
   error, a failed watch of `cluster.x-k8s.io` included.
5. At its end, also when a step failed, it removes the label, uninstalls the
   Sveltos extension and deletes the definitions of Sveltos it applied.

**P33.** Proposed: the workflows of CI change with the sessions of this view, in
its pull request, and with them AGENTS.md, "Workflows", and TESTING.md,
"Continuous integration":

- `integration-tests.yaml` applies the fixtures of every state, `pnpm
  e2e:fixtures:up all`, in place of those of `healthy` alone. Each state lives
  in a namespace of its own, so that the fixtures of every state can be on the
  cluster at once (TESTING.md, "The fixtures"), and the sessions of this view
  read several states at once. The session of the fixtures still opens the state
  that `TEST_FIXTURE_STATE` names, in its namespace, and changes nothing
  (AGENTS.md, "Workflows"). Its step "Seed the Freelens dev profile", which
  writes one entry, a copy of the kubeconfig of the scripts
  (integration-tests.yaml:283-290), writes the entry of the restricted session
  next to it (P23).
- The job of the real project of `test-environment.yaml` brings the real project
  up and down on `ubuntu-24.04`, within 60 minutes, and runs no Freelens
  (test-environment.yaml:105-109; TESTING.md, "Continuous integration"). It
  becomes a matrix of the releases of `integration-tests.yaml`, `v2.0.0` and
  `v2.1.0` (integration-tests.yaml:22-31), each job with Freelens dev at its
  release, built as `integration-tests.yaml` builds it, a profile seeded with
  one entry, a copy of the kubeconfig of the scripts for the cluster of the real
  project, and the sessions of the real tier, `clusters-real.tests.ts` and
  `clusters-sveltos.tests.ts`, before it takes the real project down; each job
  has 120 minutes, the sum of the budgets of the two jobs that it joins. Its
  concurrency group, one for each pull request, or for each run on `main` and at
  night, with `cancel-in-progress` (test-environment.yaml:111-115), includes the
  release, so that the two jobs of a run do not cancel each other, and the runs
  of `main` and of the night are still never cancelled (TESTING.md, "Continuous
  integration"). The steps taken from `integration-tests.yaml` name the runner
  of this job, `ubuntu-24.04`, in their keys of cache, where they name
  `ubuntu-24.04-arm` (integration-tests.yaml:124-130, 181-211). The job of
  `v2.1.0` alone saves the cache of pnpm, which both would save under one key,
  and the job of `v2.0.0` only restores it, as the job of the fixtures does
  (test-environment.yaml:54-63, 134-140). It runs on `main` and every night, as
  now, and on a pull request that changes what it runs: the paths that trigger
  it now (test-environment.yaml:12-22), and the main process, the shared modules
  and the sessions of the real tier, `src/main/**`, `src/common/**` and those
  two files, as the kit asks (kit, `docs/testing.md`, "What runs when"). These
  paths are those of the whole workflow, so they run its job of the fixtures as
  well.

It departs from SPEC-0002, whose integration workflow applies one state per run,
and whose job of the real project runs no session in Freelens and runs on a pull
request only for the paths of the test environment (AGENTS.md, "Workflows";
TESTING.md, "Continuous integration").

### Manual verification

None: S6 is a session (P29). Beyond the tests, the check of the themes that
every pull request of a view records with its screenshots (kit,
`docs/design.md`, "How it is enforced"), until the pass before the review of
M1 runs it (SPEC-0007).

## Notes and deviations

Filled during implementation.

Every rule below is proposed in this draft for the approval to confirm or
reopen, under the delegation for M1, and listed for the review of the
milestone, but for the part of P18 that the maintainer decided, which is the
maintainer's. Each adds to the kit, to SPEC-0001 or to SPEC-0003, or departs
from them, and the last column says why:

| Rule | What the kit, SPEC-0001, SPEC-0003 or AGENTS.md say                                                                                                                                                                                                                                                                                  | What the rule adds or changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | Every struct of a kind has its interface (AGENTS.md, "Adding an API")                                                                                                                                                                                                                                                                | The kinds read only as the context of the model get the types of SPEC-0003 alone, until their own views                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | They read no other field, their store needs a model, and the spec of a KubeadmControlPlane holds the fields that A3 never reads; it departs from AGENTS.md                                                                                                                      |
| P2   | A view of one Cluster reads its objects in its namespace (A13)                                                                                                                                                                                                                                                                       | The kinds of the operator are read as every other kind, in the namespaces of the filter; where the filter leaves out the namespace of a provider, the model notes that the availability of its controller is not known                                                                                                                                                                                                                                                                                                                                                                                                                              | Reading them in every namespace would take loads of their own beside those of the layout, on the same stores or on stores of their own; the note keeps the parts fewer                                                                                                          |
| P3   | S2 belongs to the first spec that shows an object of a provider (SPEC-0001, "Spikes")                                                                                                                                                                                                                                                | This spec reads the control plane and the infrastructure cluster of each Cluster, and tries S2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The control plane is a part of the status of the Cluster, and the infrastructure cluster a reference that the kit asks to be a link                                                                                                                                             |
| P4   | Titles in Title Case, qualified when they collide with the host (kit, "Navigation")                                                                                                                                                                                                                                                  | "Cluster API" for the root, "Workload Clusters" for the page; the entry on every cluster                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The host has a root entry "Cluster"; the book calls these clusters workload clusters; the page says why a cluster has none                                                                                                                                                      |
| P5   | None                                                                                                                                                                                                                                                                                                                                 | The literal `clusterApiClustersTable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The host keeps the sort of every list by its id, in one place that every extension shares                                                                                                                                                                                       |
| P6   | A click opens the details (kit, "Lists")                                                                                                                                                                                                                                                                                             | The details of a Cluster have an address: the parameter `details` of the page; a value that names no Cluster has a state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Every view, the tree and the overview included, opens them, and they stay under the details of the host                                                                                                                                                                         |
| P7   | State in two columns (kit, "Status")                                                                                                                                                                                                                                                                                                 | Three: Activity, Condition, Status; in a narrow window the columns of the domain shrink first, through the classes of the page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | SPEC-0003 keeps the activity apart from the health and lets it set the tone of the health; the host has no rule for a narrow window; it departs from the kit                                                                                                                    |
| P8   | None                                                                                                                                                                                                                                                                                                                                 | The counters of a cell are the available of the desired                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The project's summary counts the availability, and its own columns show it                                                                                                                                                                                                      |
| P9   | None                                                                                                                                                                                                                                                                                                                                 | The version of the topology, else the versions of the control plane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A Cluster without a topology has no version in its spec                                                                                                                                                                                                                         |
| P10  | The phase or the message of the project in the column of the status (kit, "Status")                                                                                                                                                                                                                                                  | No column of the phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The project says that no software should take the phase as the state of the Cluster                                                                                                                                                                                             |
| P11  | The headline of the message of the summary (SPEC-0003, "How a view uses it")                                                                                                                                                                                                                                                         | Its reason when the message is empty, N/A with no summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A healthy Cluster often has an empty message, and no cell is empty                                                                                                                                                                                                              |
| P12  | The causes of freshness next to the health (SPEC-0003, "Freshness")                                                                                                                                                                                                                                                                  | In the list, the one word "stale", the causes in its tooltip and in the details; the count of MachinePools of unknown health next to the health in both                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Three causes do not hold in one line, and Paused is already an activity next to it; it departs from SPEC-0003 in the list alone                                                                                                                                                 |
| P13  | A click on a row opens the details (kit, "Lists")                                                                                                                                                                                                                                                                                    | The name is also a button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A row of the host answers to the pointer alone, and controls must be reachable from the keyboard                                                                                                                                                                                |
| P14  | The search of the host                                                                                                                                                                                                                                                                                                               | `getSearchFields()` and the words of the columns, which the page passes to the layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The layout searches only what a page gives it; a search covers what a column shows                                                                                                                                                                                              |
| P15  | The host draws the title, the toolbar and the closing of the details (kit, "Details"); details of the extension's own (A7); focus comes back after a dialog (kit, "Interaction and performance")                                                                                                                                     | The `Drawer` of the host, rendered by the page, with an error boundary of its own; the focus back on the name after the icon and Escape, and after a click outside only when it is still in the details or on the body                                                                                                                                                                                                                                                                                                                                                                                                                              | The details stay native, an error in them leaves the list, and a click on another control keeps its focus                                                                                                                                                                       |
| P16  | Nothing shows twice (kit, "Details"); "in the right order" (SPEC-0001, S5)                                                                                                                                                                                                                                                           | In the details of the host, the panel after the metadata and before the section of the host, with counters and conditions shown twice; the panel shows its Cluster from the stores of the page, or from those of P31                                                                                                                                                                                                                                                                                                                                                                                                                                | The section of the host cannot be taken away and paints negative conditions at rest as errors; it departs from the kit                                                                                                                                                          |
| P17  | Control plane and workers (ROADMAP.md, M1)                                                                                                                                                                                                                                                                                           | One row for each part whose counters the Cluster sums: the MachineDeployments, the MachinePools, and the MachineSets and worker Machines that the Cluster owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The rows are what the model computes, and add up to the counters of the Cluster; the view adds no mark of its own                                                                                                                                                               |
| P18  | A reference is a link when its target exists (kit, "Details"; kit, `docs/review.md`, "The pre-review pass"); the names in a subject are what a view links (SPEC-0003, "Condition message"); a link to the page of the host for an object of a provider (A6); no menu of the host one click away from the pages of the extension (A7) | A link opens the view of the extension when there is one, and, for an object of a provider, the details of the host; contract references resolved; text with its reason; the KubeadmControlPlane, the MachineDeployments, the MachinePools and the ClusterClass in plain text until SPEC-0005, decided by the maintainer on 2026-11-25; the MachineSets and worker Machines among the parts, and the Machines and MachineSets named in a message, in plain text too, proposed                                                                                                                                                                       | The link helper of the host would assume `v1`; the extension has no details of those objects before SPEC-0005, and a link would open the details of the host, whose menu A7 keeps away; it departs from the kit, and from SPEC-0003 for the names in a subject, until SPEC-0005 |
| P19  | Through the stores of the host, watched (A2)                                                                                                                                                                                                                                                                                         | The list layout subscribes the store of the Clusters and, as its dependent stores, those of the context, as the host does for its own lists, keyed by their set; each store, but that of the definitions, through one adapter that passes its reads, tells the page its loads and their failures, and selects and removes nothing; the rows of the namespaces loaded, kept across a new mount of the layout, a namespace that the filter adds while every namespace stays selected counted as loaded after a load that the host follows, and the spinner until the first load ends and while a load runs with no row; the page loads nothing itself | The host keeps each store in step with its loads, with the fewest parts; its lists have the limits listed below; the store of the host keeps a selection that would put its removal on the page                                                                                 |
| P20  | Checking is not the same as not installed (kit, "States that are not the happy one"); the page of a kind from `createAvailableVersionPage` (AGENTS.md, "Adding an API")                                                                                                                                                              | Four cases: checking, not installed, an older Cluster API, the list, from the definitions or from the discovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The page of the template says "not available" in all three; this page reads one version; it departs from AGENTS.md                                                                                                                                                              |
| P21  | A state maps to a token (kit, "Status"); `color-mix` for a derived accent (kit, "Theme")                                                                                                                                                                                                                                             | The word in the color of the text, the tone in a background and a border                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Two tokens are unreadable as the color of a word in the dark Freelens theme                                                                                                                                                                                                     |
| P22  | S5 (SPEC-0001, "Spikes")                                                                                                                                                                                                                                                                                                             | Tried in its two halves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Its text names both the page of the extension and the details of the host                                                                                                                                                                                                       |
| P23  | One kubeconfig in the profile of the tests (AGENTS.md, "Workflows"); one kubeconfig of the scripts, one context and one user (TESTING.md, "Safety")                                                                                                                                                                                  | A second identity, of the session, for the restricted cases and S2: what each case allows, with what the start page of the host reads in `default`, its token, a second synced entry next to the copy of the kubeconfig of the scripts in CI, added once locally, and its end                                                                                                                                                                                                                                                                                                                                                                       | A refusal is tried only with an identity that is refused, and one that a grant avoids is granted; TESTING.md changes in the same pull request                                                                                                                                   |
| P25  | A refusal is never an absence; a view decides from the status of an answer; nothing important only in a tooltip (kit, "States that are not the happy one", "Interaction and performance")                                                                                                                                            | Restricted, Partial, Failed and a refresh that failed, from the codes of the failures that the adapters hand the page, counted against the namespaces of each load; a kind refused in part given to no Cluster of the namespaces of that load; a refresh that failed said as an event of the past, until a later read of the kind ends with no failure, a reload of the store included; the notices in the place of the rows, or above the layout when rows remain; "not counted" in the place of the count when no row is listed                                                                                                                   | The store names no namespace in a failure, and the message of each answer says where; the layout keeps the failures in a tooltip                                                                                                                                                |
| P26  | Stale keeps the last data, their time and the failure of the refresh (kit, "States that are not the happy one")                                                                                                                                                                                                                      | Stale as the host shows it: its mark of a cluster that it cannot reach, on 2.1.0, and of the failures of its loads; the words of P25 for a refresh that failed; no copy, no protected member; nothing on 2.0.0                                                                                                                                                                                                                                                                                                                                                                                                                                      | These are the signals that the host gives; it departs from the kit for the last data and their time                                                                                                                                                                             |
| P27  | A boolean phrased so that green means healthy; an unknown value is Unknown (kit, "Status")                                                                                                                                                                                                                                           | Initialized and Provisioned in three words, Yes, No and Unknown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `ControlPlaneInitialized` can be `Unknown` or unwritten, and `infrastructureProvisioned` is never written false                                                                                                                                                                 |
| P28  | None                                                                                                                                                                                                                                                                                                                                 | The orders of the sort of the columns of state and of the version, worst first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The rows that need attention come first; the order of the activities is that of SPEC-0003                                                                                                                                                                                       |
| P29  | Nothing is verified only once; a manual step is run by the maintainer (kit, `docs/testing.md`, "Non-regression policy"; kit, `docs/process.md`, "Manual testing escalation")                                                                                                                                                         | S6 is a session of the real tier, with the Sveltos extension `2.1.0` and the definitions of Sveltos, both pinned by version and SHA-256                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | S6 runs in Freelens dev on a kind cluster, so it can be codified; it replaces D1                                                                                                                                                                                                |
| P30  | Step 8 of "Adding an API": `examples/<version>/` and the `kubectl apply -k` of the README (AGENTS.md)                                                                                                                                                                                                                                | No `examples/` for Cluster: the definitions of the release through the scripts, and the fixtures of SPEC-0002                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A copy of the definition would reproduce a text of the project; it departs from AGENTS.md                                                                                                                                                                                       |
| P31  | A view of one Cluster loads its objects in its namespace, whatever the filter selects (A13); the `KubeApi` and `KubeObjectStore` subclasses are never instantiated (AGENTS.md, "CRD KubeObject Pattern")                                                                                                                             | A view of one Cluster outside the namespaces of the page, the details by address or the panel, reads its Cluster and its namespace through stores of the model's class, and of `ProviderObjectStore` for the kinds of providers, never registered, one load and its subscribe each                                                                                                                                                                                                                                                                                                                                                                  | The stores of the host follow the filter, and the host hands the panel an object that follows only while a subscription covers it; stores of its own keep their own loaded namespaces and items; it departs from AGENTS.md                                                      |
| P32  | A reference is a link when its target exists (kit, "Details"); no menu of the host one click away (A7)                                                                                                                                                                                                                               | The metadata of the host in the details of the extension hides the owners and the namespace, which the details show as text and as the namespace badge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The metadata of the host links them to the details of the host, with its menu, the Delete of a Namespace included; it departs from the kit, for an owner of Cluster API until SPEC-0005 and for the namespace for good                                                          |
| P33  | One state of the fixtures per run, and no session in Freelens on the real project (SPEC-0002; AGENTS.md, "Workflows")                                                                                                                                                                                                                | The integration workflow applies the fixtures of every state and seeds the entry of P23; the job of the real project becomes a matrix of the two releases, with Freelens dev and the sessions of the real tier, in 120 minutes, a concurrency group for each release, the keys of cache of its runner and one job that saves the cache of pnpm, and it also runs on a pull request that changes the main process, the shared modules or those sessions                                                                                                                                                                                              | The sessions of this view read several states at once, and two of them need the real project; it departs from SPEC-0002                                                                                                                                                         |
| P34  | A view says what is missing (kit, "States that are not the happy one"); nothing important only in a tooltip (kit, "Interaction and performance"); the `KubeApi` and `KubeObjectStore` subclasses are never instantiated (AGENTS.md, "CRD KubeObject Pattern")                                                                        | One `ClusterStore`, built once in the frame, never loaded, registered or subscribed, read through its public `context` alone; the notice, as an event of the past with its time, of a list read once over the whole cluster and not followed, when `isLoadingAll` is true for the namespaces of a load as it starts and `isGlobalWatchEnabled()` false as it ends                                                                                                                                                                                                                                                                                   | The host follows such a list only for a user who may watch every resource of the core group, and marks nothing otherwise; the extension API tells it only through that getter; it departs from AGENTS.md                                                                        |

Decided by the maintainer on 2026-11-25, in answer to the question that the
first review of this draft raised on P18: A7 holds, and the references to the
KubeadmControlPlane, the MachineDeployments, the MachinePools and the
ClusterClass are plain text, their kind and their name, and open nothing,
until SPEC-0005 gives them details of the extension. It departs from the rule
of the kit that a reference is a link when its target exists (kit,
`docs/design.md`, "Details"; kit, `docs/review.md`, "The pre-review pass"),
for these references, until SPEC-0005; DESIGN.md records the departure.

What the host gives, which this view keeps as it is (P19, P26, P34). The page
reads its stores through the subscription of the list layout of the host, so its
list has the limits of the lists of the host, and no others:

- A selection of every namespace that the cluster lists, when it lists more than
  one and its settings name no accessible namespaces, is read over the whole
  cluster (for-namespaced-resources.injectable.ts:26-39, 56-59), and watched
  only when the user may watch every resource of the core group over the whole
  cluster, which the host asks the cluster when it connects, again every 15
  minutes and when the definitions that its frame lists change
  (freelens:packages/core/src/renderer/before-frame-starts/runnables/refresh-accessibility-on-crd-changes.injectable.ts:20-35),
  as a review of access of `watch` on `*`
  (freelens:packages/core/src/main/cluster/cluster-connection.injectable.ts:466-469,
  521; for-namespaced-resources.injectable.ts:60); otherwise it is read once and
  not followed (kube-object.store.ts:247-252, 560-574). No watch fails, so the
  host marks nothing; the page says it in words (P34).
- A watch that fails starts again on its own, and one answered 401 or 404
  stops, with no word to its subscriber (kube-object.store.ts:598-608,
  628-641, 652-655). A watch that the server refuses while it allows the list
  starts again with no end, and the probe of the host takes any answer of the
  cluster, a 403 included, for one, so it marks nothing
  (freelens:packages/core/src/renderer/k8s/watch-reconnect/watch-reconnect.injectable.ts:18-33).
  The list then shows as if it were followed, and the page cannot tell.
- A reload after a 410 that fails empties the kind, or the namespace of its
  watch: the page says that the read failed again, when and why (P25), and
  keeps no copy of what it had (P26).
- The mark of a cluster that cannot be reached carries no time and says its
  words in a tooltip, on 2.1.0; 2.0.0 has none (P26).
- In the details of the host, the object that its metadata and its custom
  resource section show, and that it hands the panel, comes from the store of
  the host by its address, read once when the store does not hold it, and
  follows only while some subscription covers its namespace
  (current-kube-object-in-details.injectable.ts:29-44;
  kube-object.store.ts:400-414): when no subscription covers its namespace, the
  sections of the host show the Cluster as first read, while the panel follows
  it (P16, P31).

The stores of a view of one Cluster (P31) have the limits of the watches, of the
reload after a 410 and of the mark too, and not that of a selection of every
namespace: each reads one namespace, which the host never reads over the whole
cluster (for-namespaced-resources.injectable.ts:56-59), with one load and its
`subscribe`, and their failures give the state of that view alone. Their list
and their watch set the resource version of the whole cluster that the API of
the host keeps, from which a watch of that API over the whole cluster starts
again, as P31 says: that limit is theirs.

The kit asks a view to show no refusal as an absence and to say what is missing
(kit, `docs/design.md`, "States that are not the happy one"): the page says in
words every refusal and every failure of a load or of a reload that the host
hands it (P25), and a list that the host reads once and does not follow (P34);
the rest of what the host hands no one, above, the page cannot say.

Removed after the first review: D1, which tried S6 once by hand, by the coding
agent and not by the maintainer, with a release of Sveltos that it did not fix;
P29 replaces it. Removed after the second review: P24, which built a store of
the extension's class for the context of the frame, from which the reads of the
page took their namespaces, and read the mark of the host through a protected
member of that store; the subscription of the host (P19) takes the namespaces of
the filter itself, the page leaves the mark to the host (P26), and P34 keeps
such a store for its public `context` alone. Their numbers are not reused.

This draft went through four independent reviews, of 35 findings, of 26, of 16
and of 11, each checked against its source before it was applied. All were
applied, two of the first in part: finding 1, whose case of a change in the
first of two namespaces read one by one is now a change in one of two namespaces
that the host reads in one load, and in a third that a view of one Cluster reads
(In Freelens, step 6); and finding 18, since the behaviors of the host that this
view relies on were read at `v2.1.0`, but for the mark of P26, and the sessions
check them on `v2.0.0`. The answer to finding 5 of the first review is the
decision of the maintainer recorded in P18, and the answer to finding 1 of the
second is P34.

No question is open.

The spec is implemented in three pull requests: the first has the models of
the kinds that the view reads, the reads, the page with its sidebar entry and
its list, and their states, with the session of the list in Freelens on the
fixtures of every state and the part of P33 that applies them; the second the
details, the links between the objects, the panel in the details of the host
and the reads of one Cluster outside the namespaces of the page (P6, P13, P15,
P16, P18, P31, P32); the third the sessions with restricted identities and
with the real project, the rest of the changes to the jobs of CI (P23, P29,
P33), and the documents that only the whole view completes, the README,
TRY-IT.md and ARCHITECTURE.md.

- Decided while implementing the first part: until the second, a row opens
  nothing. The layout gets `hasDetailsView={false}` and an `onDetails` that
  does nothing, so that a click opens no details of the host (A7); the name is
  text, whole in its tooltip, and becomes the button of P13 with the details;
  the page has no parameter yet, and `kubeObjectDetailItems` and
  `kubeObjectMenuItems` are empty.
- Decided while implementing: the reads of the page are events. The adapter of
  each store (P19) tells the page the start of each load with its namespaces,
  each failure of it, its end or its abort by the host, each failure of a
  subscription, and each run of `isLoading` while the store is subscribed; the
  page folds them, with each change of the filter, into one state, kept by a
  pure function of `src/common/views/read-state.ts`, from which it takes the
  namespaces loaded, the readiness of the list, its outcome and its notices.
  The cases of `read-state.test.ts` that concern when the page reads the
  context of the frame, and the runs of `isLoading`, are in
  `src/renderer/reads/page-reads.test.ts`, which drives the adapters, since
  the state receives both as events; the case of P26 that no row is kept is in
  `clusters-page-v1beta2.test.tsx`, since the rows are the items of the store
  of the host, of which the state keeps none.
- Decided while implementing: the answer of `isLoadingAll` that the page reads
  as a load starts travels with that load, which the adapter hands back at its
  end, and the page reads `isGlobalWatchEnabled()` as the load ends (P34); a
  load that the host aborts gives neither. Its module keeps the `ClusterStore`
  of P34, built at the first mount of the page in the frame, with the API of
  Clusters that the host registered.
- Decided while implementing: a run of `isLoading` while no load of the layout
  runs is a reload that the store started itself, and one during a load of the
  layout is that load (P25). A load that fails holds its kind back in every
  namespace of the load, since the store names no namespace in a failure, and
  a refresh that fails holds back those of the last load; both end with the
  next load of that kind that ends with no failure, or with a reload that
  reports none.
- Decided while implementing: "not counted" takes the place of the first child
  of the `info` that the layout hands `customizeHeader`, the count, and keeps
  the others, the marks of the host, as `kube-object-list-layout.tsx` builds
  it at `v2.0.0` and at `v2.1.0`; an `info` of another shape is replaced whole
  (P25).
- Decided while implementing, where P3 is silent: the GET of a definition by
  its name needs its plural, which a reference does not carry. When the store
  of definitions failed, the page takes it from the API that the host
  registered for that kind from the discovery of the cluster,
  `/apis/<group>/<version>/<plural>`, and a kind with no such API is one that
  the cluster does not serve. The GET runs once for each definition in a mount
  of the page, from an effect.
- Decided while implementing, where P20 is silent: with the definition of
  Clusters in the store of definitions and no API of Clusters registered yet,
  the page is still checking, since the host registers the APIs of a
  definition as its store holds it; and an API of Clusters at a version other
  than `v1beta1`, with none at `v1beta2`, takes the state of an older Cluster
  API, whose words name the versions served and say that the extension reads
  `v1beta2` alone.
- Decided while implementing, where P8 and P28 are silent: a cell of counters
  with one of its two counters written shows N/A for the other, `N/A/2`, and
  N/A alone when neither is; N/A sorts after every value in the columns of the
  domain, and a row whose marks of state still show the spinner sorts after
  every other in Activity and Condition.
- Decided while implementing: the background of a mark mixes 20% of the token
  of its tone with `transparent` (P21).
- Decided while implementing: the page evaluates the model with the time of
  each render, and again, through a timer, at the earliest time that a result
  of its rows names. It keeps each result under the key of SPEC-0003 ("How a
  view uses it") until that time, and drops at each render those of the
  Clusters that it no longer lists.
- Decided while implementing: `engines.freelens` stays `^2.0.0`. The renderer
  and the integration tests check with no error against the declarations of
  `@freelensapp/extensions` `2.0.0`: the props of the list layout, the store
  class and its getter `context`, and every other member that the view uses are
  there.
- Decided while implementing: the unit tests of the page render it against the
  stub of the extension API, `test/freelens-extensions.ts`, whose list layout
  records its props and renders the parts where the host calls back into the
  page, among them the remove button, decided as `content.tsx` decides it. The
  subscription is the host's, which the stub does not run, so the tests drive
  the loads through the adapters, as the host would.
- Decided while implementing: the session of the list in Freelens,
  `integration/__tests__/clusters.tests.ts`, runs, of the steps of "In
  Freelens": step 1; step 2 but the details of the extension, with a click that
  opens no details of the host and leaves their parameter out of the address;
  the part of step 3 on the remove button; step 6 but the details of
  `upgrading`; step 7; and step 8, whose check reads every request of the frame
  to the groups that the view reads, each a GET, and the version of every
  object of the fixtures before and after the session, but the versions that
  its own labels gave. A write that the session plants from the frame when
  `TEST_PLANT_WRITE` is set makes both fail. The rest of steps 2, 3 and 6, and
  steps 4 and 5, come with the second part.
- Decided while implementing: in step 1, the session allows a row in flight the
  tone of progress or that of a warning. It runs minutes after the workflow
  applied the fixtures, whose times move to the moment of the apply
  (TESTING.md, "On the first tier"), so a threshold of SPEC-0003 may have
  passed by then.
- Seen while implementing: in 5 of the 15 states of the fixtures, the first line
  of the message of `Available` is a subject with no words of its own, such as
  `* WorkersAvailable:`, whose words are on the lines below it. The cell of the
  status shows that line, as P11 says, and its tooltip the whole message.
- Seen while implementing: the table of SPEC-0003, "The fixtures of SPEC-0002
  give these results", gives the Cluster of `machine-without-node` Unhealthy,
  with its `Available` `False` through `WorkersAvailable`. In the fixture its
  `Available`, `WorkersAvailable` and `WorkerMachinesReady` are `True`: the
  Cluster reconciles on a change of its MachineDeployments and not of a
  MachineSet, so it still counts the one worker of its topology (the README of
  the fixture), and the model gives it Healthy and Idle. The session expects
  what the model gives on the fixture.
