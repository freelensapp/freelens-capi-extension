# SPEC-0002: Test environment

- **Status:** Verified
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Reviewed project:** Cluster API `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`
- **Freelens:** 2.1.0, tag `v2.1.0`
- **Dependencies:** [SPEC-0001](SPEC-0001-reconnaissance.md)
- **Approval:** Approved on 2026-11-22 under the maintainer's delegation for
  the work inside M1; it is reviewed with the rest of M1 at its review

## Goal

Every later spec tests its views against Cluster API objects in the states
that matter, fast and with the same result at every run, and its actions
against the real project; and the maintainer brings up a demo cluster for the
review of a milestone with one command.

## Upstream reference

- The assets of the release `v1.14.4`: `core-components.yaml`,
  `bootstrap-components.yaml`, `control-plane-components.yaml`,
  `infrastructure-components-development.yaml`,
  `cluster-template-development.yaml`,
  `cluster-template-development-mp.yaml`, `clusterclass-quick-start.yaml`,
  and the `clusterctl` binaries, each pinned by the digest GitHub keeps for
  it.
- The quick start of the book for the development provider: a kind cluster
  that mounts the Docker socket, `CLUSTER_TOPOLOGY=true`, and `clusterctl
  init --infrastructure docker` (`docs/book/src/user/quick-start.md`).
- The network add-on of the tests of the project,
  `test/e2e/data/cni/kindnet/kindnet.yaml`, with the CIDRs of
  `test/e2e/config/docker.yaml`.
- The assets of the Cluster API Operator `v0.30.1`, for its definitions.
- SPEC-0001: the kinds (R1), what each state writes (R2), and what the build
  of the release adds to the definitions (R4.108 to R4.111).

## Scope

Included:

- The two tiers of the kit: the definitions alone, and the real project.
- The commands of the kit: `pnpm e2e:cluster:up`,
  `pnpm e2e:cluster:up:definitions`, `pnpm e2e:cluster:down`,
  `pnpm demo:up` and `pnpm demo:down`.
- One file of pins, which Renovate follows.
- The fixtures of the first tier, and the script that captures them from the
  second.
- The integration tests: the session of the template that installs the
  extension, and a session that loads the definitions and the fixtures and
  checks that the extension activates on them with no error.
- The jobs of CI for both tiers.
- `docs/development/TESTING.md` and the first part of
  `docs/development/TRY-IT.md`: how to bring the demo up and down.

Excluded: the suites of the views, which come with the spec of each view;
the pre-review pass, which has a spec of its own at the end of M1.

## Design

- **No view.** This spec adds no page, panel or menu item.
- **The first tier, the definitions alone.** A kind cluster, with the
  versions of kind and Kubernetes that the template pins, where the scripts
  apply the definitions of Cluster API taken from the assets of the release,
  as they are: with the conversion webhook, whose service does not exist
  there, and with the contract labels of the build (SPEC-0001 S1). Only
  `v1beta2` is requested, as by the extension. The definitions of the
  development provider stand for those of a provider. The definitions of the
  operator and of the inventory of `clusterctl` come from their releases.
- **The fixtures.** Each fixture is a set of objects in one of the states
  that the views tell apart: a Cluster provisioning; provisioned and healthy;
  with a Machine that never got a Node; rolling out; scaling; paused;
  deleting; with a managed topology and without; with MachinePools only,
  where the summary of the project says available and the extension does
  not (SPEC-0001 H1); with a remediation in progress; and objects with no
  status, for Unknown. A fixture carries only what the controller writes in
  that state, so the fixtures are captured from the second tier, at the
  pinned release, by a script that removes what the API server adds, keeps
  every time as an offset from the capture, and names nothing real. The one
  state the development provider cannot show, a MachinePool whose provider
  keeps no Machines for it, is written by hand from SPEC-0001 R2.66 to
  R2.69, and says so in its file. The API server still applies the schema of
  each definition, its CEL rules included, without the controllers
  (SPEC-0001 R4.117): every fixture passes it, and no schema is weakened. The
  scripts apply the fixtures with their status written through the `status`
  subresource, shift the times to the moment of the run, and hold a deleting
  object with a finalizer of their own, which `down` removes.
- **The second tier, the real project.** A kind cluster that mounts the Docker
  socket, with Cluster API installed by the pinned `clusterctl` from the
  assets of the release, `ClusterTopology` on, and workload clusters of the
  development provider, made from the templates of the release, with kindnet
  applied by a ClusterResourceSet. It answers what needs a controller, and it
  is the demo cluster.
- **The pins.** One file holds the versions and digests of Cluster API, of
  `clusterctl`, of the operator, of kind and of Kubernetes, with Renovate
  rules that follow them.
- **The scripts.** They work with a kubeconfig of their own, in a private
  directory, holding one context; they check that its API server is local
  before any request; they never write the kubeconfig of the developer or
  change its current context. `down` deletes the kind cluster and the
  containers of the workload clusters that `up` created, by the labels that
  the development provider puts on them, and nothing else, and it reports a
  cleanup that failed. On Linux they raise the limits of inotify that a
  workload cluster needs, or say they could not.
- **CI.** The integration workflow of the template applies the definitions
  and the fixtures to its kind cluster. A job with the real project runs when
  the scripts of the environment, the pins or the toolchain change, on
  `main`, and every night.
- **Safety.** The scripts write only to the kind cluster they created and to
  the containers of its workload clusters. They refuse a context whose API
  server is not local. Downloads are checked against their pinned digests
  before use.

## Tests

- Unit: the parser of the pins file, the check of a local API server, the
  shift of the times of a fixture, the cleaning of a captured object; each
  seen failing on a broken case. In `test/environment.test.ts`, by the groups
  of its cases, for the first pull request:
  - the pins: the pins of the repository are read, and the Kubernetes of the
    kind clusters is inside the range that they declare, which the rule of
    Renovate allows and no other; refused, a digest in capitals or cut short,
    a source without its digest, an asset the scripts do not download, a
    prerelease, a version without its `v`, a Kubernetes of the workload
    clusters that is not a release, a commit cut short, another repository or
    datasource for Renovate, a version before its datasource and depName, a
    project the scripts do not know, a Kubernetes of the kind clusters above
    or below its range, a range that is not of minor versions, another image
    for it, a file that is not JSON; kind is read from the top-level env of a
    workflow, which is refused without kind, with a version that is not one,
    with kind only in the env of a job, and with kind twice;
  - the check of a local API server: loopback addresses accepted, in their
    forms, and any other address or name refused; refused, a server over HTTP
    or with no port, a second context, another current context, a context that
    names another cluster or user, a cluster with no authority, with a proxy or
    that skips the verification of the server, a credential plugin; the node
    that the scripts created accepted, and refused, a node that the state did
    not record, another container of the same name, another name, the label of
    another kind cluster, another role, a node that is not running, another
    port, every address, no socket of Docker for the real project;
  - the local Docker: a Unix socket accepted, a context or a `DOCKER_HOST` over
    TCP or SSH refused;
  - the check of a digest, and the downloads: a download kept with its digest,
    refused and not kept without it, a good copy of the cache used with no
    download, a changed copy removed and downloaded again, a fresh download
    that fails keeping the copy, and every pinned file listed once from the
    official source of its project;
  - the private state: its folder, inside the repository, the repository
    itself, or a symbolic link refused; the lock of a run, taken when free,
    released by its holder only, refused while held, taken over from a run
    that is gone, not while another run takes it over; the kubeconfig of the
    user, and its changes reported;
  - the environment of a command: nothing of the user but what finds the
    tools and Docker, the kubeconfig of the scripts, no kuberc;
  - the containers of a workload cluster, and every one left in place beside a
    container that the development provider did not make; `down`, which
    deletes the cluster of the real project first, nothing when the kind
    clusters cannot be listed, no kind cluster that it did not create, no
    workload container without the record of its cluster, and keeps the state
    when a step fails;
  - the command line, which refuses a name that is not a command, such as
    `constructor`; the limits of inotify and the clusterctl of the system; the
    definitions of a release file, kindnet and its label.

  The shift of the times of a fixture and the cleaning of a captured object
  come with the fixtures, in the second pull request, in the same file:
  - the pins, also refused: a Kubernetes to upgrade the workload clusters from
    that is not a release, or that is not before theirs;
  - the shift of the times of a fixture: a time moved by whole seconds, across
    a day and a year, its fraction kept and an offset written in UTC; refused,
    what is not a time, a date that does not exist and a part of a second;
    every time of an object moved, wherever it is, and nothing else; there and
    back, the file again; a time inside a text found;
  - the cleaning of a captured object: what the API server adds left out, and
    every time kept as its offset from the capture; what A3 of SPEC-0001
    forbids showing left out of a KubeadmConfig, a KubeadmConfigTemplate, a
    KubeadmControlPlane and a KubeadmControlPlaneTemplate, with the paths of
    what it left out; nothing kept that the machine of the capture tells of
    itself, the kernel and the boot of a Node replaced and its swap left out,
    the identifiers of each container and the architecture kept, and the
    capacity of a DevMachineTemplate and of a DockerMachineTemplate replaced,
    none given to a template that has none; the finalizers of the project
    kept, and the one of the scripts not; the generation of an object observed
    at its generation, paused, deleting, deleting and observed before, and
    with no status; refused, a status that observed a later generation, and a
    Secret; a cleaned object the same when cleaned again;
  - the apply of a fixture: the owners first; refused, an owner that the set
    does not hold, and owners in a cycle; the times moved to the run, and the
    times and the generation that the API server writes left to it; a deleting
    object held by the finalizer of the scripts; a paused Cluster changed back
    and forth to its generation, and a DevMachine once, deep in its spec;
    refused, a generation that the first tier cannot give a kind; an object
    read back compared with its file, the times of the API server apart;
  - the YAML of the fixtures: an object written as kubectl writes it, and read
    back; the values that a plain value cannot be quoted, and those that it can
    written plain; a text of several lines, or one past the width of yamlfmt,
    in a literal block; a text that a literal block cannot hold in double
    quotes, a line that starts with a tab among them; a value that starts as a
    document marker in a literal block; what yamlfmt makes of a long value
    read; refused, a plain value of another type in YAML 1.1, a tab that
    indents, a key twice, and a document that is not a mapping; the objects of
    a file in the order of the code units of their names, with the collation
    of a language where it differs;
  - the states of the fixtures: a name and a namespace of their own, one set
    written by hand; a healthy workload cluster told from one that is not,
    and from one with a MachineHealthCheck that does not report every Machine
    that its selector targets healthy, or that has not counted them yet; the
    Machines that an annotation keeps out of its checks left out, and a
    selector with expressions; the labels that a selector matches; the sets of
    `healthy` and `paused` with every Machine that a MachineHealthCheck targets
    healthy;
  - the providers of the real project: those of the pins that the inventory
    of clusterctl lacks, and those at another release;
  - the fixture sets of the repository: each written as the scripts write it,
    every file as their YAML writes it again, in the namespace of its state,
    with every owner, no Secret or ConfigMap, nothing that a cleaning leaves
    out, no time inside a text and a generation that the first tier can give
    each object; the README of each captured set as the scripts write it; no
    capacity but the one of the fixtures; a set for each state, and nothing
    else;
  - the command line: the states after a command, `all`, and every state when
    none is given; refused, a command without the states it needs, a state
    that does not exist, and the set written by hand for a capture.
- In Freelens, on the definitions and the fixtures: the extension installs
  and activates with no error in either process, and the host lists the
  objects of every fixture.
- With the real project: `pnpm e2e:cluster:up` reaches workload clusters
  whose Cluster reports `Available` `True`, run again it resumes, and
  `pnpm e2e:cluster:down` leaves no container and no cluster behind.
- The fixtures: a test applies each fixture to the first tier, reads every
  object back at `v1beta2`, and compares it with the file:
  `pnpm e2e:fixtures:check`.

## Notes and deviations

Filled during implementation.

The spec is implemented in two pull requests: the first has the scripts, the
pins, their check in CI, the documents and the unit tests; the second the
fixtures, their capture, the session in Freelens on the definitions and the
fixtures, and the jobs of CI of the two tiers.

- Decided while implementing the first part: the kind clusters are
  `freelens-capi-definitions` and `freelens-capi-management`, and the workload
  clusters `freelens-capi-md`, with a MachineDeployment of two workers and
  kindnet, and `freelens-capi-mp`, with a MachinePool of one worker and no
  network add-on, both in `default` ([TESTING.md](../development/TESTING.md)).
  These names are global to the Docker daemon: the scripts record the node of
  each kind cluster they create, and use again, or delete, only the cluster
  whose node they recorded.
- Deviation, decided while implementing: kind is pinned once, by version and
  with no digest, in the env of the integration workflow of the template,
  which the scripts read, and not in the one file of pins that the Design
  names: the template keeps it there for its own integration tests, and
  Renovate follows it there.
- Decided while implementing: the kind clusters do not take the Kubernetes of
  the integration workflow, which Renovate moves for the template whatever
  Cluster API supports. They take `managementKubernetes` of the pins, the tag
  of `kindest/node`, `v1.37.0`, with the minor versions that `v1.14.4`
  supports for a management cluster, `v1.33` to `v1.37`, declared next to it
  (the table of the core provider in `docs/book/src/reference/versions.md` at
  the tag, where `v1.31` and `v1.32` are for workload clusters only). The
  scripts refuse a version outside the declared range; a rule of Renovate
  follows the tag within it, and a unit test checks that the rule allows the
  same range. The range changes with Cluster API. The node image is
  `kindest/node` at that version, by its tag.
- Decided while implementing: the workload clusters take their version of
  Kubernetes from the pins, `v1.37.0`, which the release supports for workload
  clusters (`docs/book/src/reference/versions.md` at the tag), and not from
  the workflow, which Renovate updates whatever Cluster API supports.
- Deviation, decided while implementing: the `Provider` definition of the
  inventory of clusterctl comes from the source of Cluster API at the commit of
  the tag, checked by digest, and not from a release, as the Design says of the
  definitions of the operator and of the inventory: no asset of the release
  carries it, and clusterctl installs it from a copy inside its binary.
- Deviation, decided while implementing: the kind cluster of the real project
  has one IP family, IPv4, where the quick start of the book makes a dual-stack
  one (`networking.ipFamily: dual`); the workload clusters of the scripts are
  IPv4 clusters.
- Deviation, decided while implementing: `up` waits for `freelens-capi-md`
  alone to report `Available` `True`, where the Tests say "workload clusters".
  `freelens-capi-mp` reported `Available` `True` in every run too, with no Node
  ready, but only because the summary of the project leaves MachinePools out
  (SPEC-0001, H1), which a later release can change.
- Decided while implementing: the pins name cert-manager too, at the version
  that the pinned clusterctl installs by default, `v1.21.3`, with the digest
  of its `cert-manager.yaml`, so that clusterctl reads every manifest from a
  local repository of checked files and downloads nothing itself. The digests
  pin the manifests; the images they name are pulled by their tags.
- Decided while implementing: a command, `pnpm e2e:pins:check`, downloads
  every pinned file and checks it, with no cluster, and the workflow
  `e2e-pins-check.yaml` runs it on every change to the pins or the scripts, so
  that a pull request that changes a version without the digests of its
  release fails before the jobs of the two tiers exist.
- Decided while implementing: the scripts raise the limits of inotify to the
  values of the troubleshooting page of the book of Cluster API, 8192
  instances and 1048576 watches.
- Decided while implementing: the definitions of the first tier are the
  documents of the release files whose kind is `CustomResourceDefinition`,
  applied as they are with a server-side apply, which keeps no copy of each
  one in an annotation of its own.
- Seen on 2026-11-22, on a kind cluster with Kubernetes 1.37.0 and the pins of
  this spec: the development provider gives the containers of a workload
  cluster the labels of kind, `io.x-k8s.kind.cluster` with the name of the
  workload cluster and `io.x-k8s.kind.role`, and names them after it, so kind
  lists the workload clusters as clusters of its own; `down` deletes them by
  that label, their name and their role. `freelens-capi-mp` reported
  `Available` `True` with no control plane Machine ready, as SPEC-0001 notes.
  Docker published the API server of the kind node and of each control plane
  Machine on `127.0.0.1`, and the load balancer of each workload cluster on
  `0.0.0.0`, its API server and the statistics of HAProxy, as the Safety
  section of [TESTING.md](../development/TESTING.md) says.
- Decided while implementing the second part: the fixtures are the sets of
  `integration/fixtures/<state>/`, one for each state of the Design, with the
  states and the namespaces of [TESTING.md](../development/TESTING.md): with a
  managed topology is `healthy`, which is also provisioned and healthy,
  `upgrading` adds a Cluster whose topology upgrades, and scaling up is two
  sets, `scaling-up` and `scaling-up-held`. Each set has its own
  namespace, named as its workload cluster, so that every set can be on the
  first tier at once, and a `README.md` that says how its state was reached
  and what the capture left out.
- Deviation, decided while implementing: a set has one file for each kind and
  no `kustomization.yaml`, which the fixtures of the template have:
  `kubectl apply -k` cannot write a status, give an owner reference the
  identifier of its owner or move the times to the run, so only
  `pnpm e2e:fixtures:up` applies a set.
- Deviation, decided while implementing: each capture makes a workload cluster
  of its own, in the namespace of its state, and deletes it, rather than
  bringing the two workload clusters of `up` into each state; the demo stays as
  `up` made it, and a capture needs only the real project up. `down` deletes the
  containers of the clusters of the captures as it deletes those of the demo.
- Decided while implementing: every time of a fixture is written from
  `2026-01-01T00:00:00Z`, the moment of every capture, as its offset from it;
  and every generation as its distance from the generations that the status of
  its object observed, the lowest generation that the first tier can give it, 1,
  or 2 for a deleting object, whose deletion the API server counts as a change,
  raised by that distance. The first tier gives an object a generation above 1
  with changes of one field of its spec, set and unset before its status is
  written: `spec.paused` of a Cluster, `spec.minReadySeconds` of a Machine and
  `spec.backend.docker.bootstrapTimeout` of a DevMachine, the kinds that need
  them in the sets, a paused Cluster, and the Machines and DevMachines whose
  spec their controllers wrote after some of their conditions; the apply
  refuses a set that would need them for another kind.
- Seen while implementing, on the first captures: kubelet reports in the
  `nodeInfo` of a Node, which a Machine copies, the kernel, the boot and the
  swap of the machine it runs on, and a node of the development provider runs
  on the machine of the capture. The development provider writes the
  processors and the memory of its Docker host, the machine of the capture,
  into `status.capacity` of every DevMachineTemplate, and its controller of
  DockerMachineTemplates does the same
  (test/infrastructure/docker/internal/controllers/devmachinetemplate_controller.go:65-88).
  Decided while implementing: a capture replaces the version of the kernel and
  the identifier of the boot, which the schema requires, with values of its
  own, leaves the swap out, and writes the capacity of every such template as
  `cpu: "4"` and `memory: 8Gi`, `HOST_CAPACITY` of the scripts, so that no
  fixture says anything of the machine that captured it; the Design asks that
  the fixtures name nothing real. The architecture of each Node is kept: it
  names only a family of processors.
- Decided while implementing: the files are YAML as kubectl writes it, in the
  format that yamlfmt keeps with `integration/fixtures/.yamlfmt.yaml` and with
  quotes only where yamllint asks for them, so that `trunk check` passes on them
  as they are written. A module of the scripts, `yaml.mts`, writes and reads
  them, so that no library of YAML is a dependency of the extension.
- Decided while implementing: a capture takes the objects of its namespace once
  they hold its state and two readings of them a few seconds apart agree, so
  that the set is one moment of the real project. Two states last too few
  seconds for that on a machine with the images at hand, and the scripts make
  them last, each set saying how: the control plane of `provisioning` runs
  `sleep 150` before kubeadm, a command of its KubeadmControlPlaneTemplate, and
  the Machine of `machine-without-node`, of a MachineSet beside the topology,
  never gets a Node, since the bootstrap template of the MachineSet gives
  kubelet a provider ID of its own, and the development provider sets the
  provider ID of a Node only when the Node has none.
- Decided while implementing: the deletion of `deleting` and of `scaling-down`
  is held by a hook of the scripts on a Machine, a pre-terminate one for the
  Cluster, which skips the pre-drain hooks of its Machines (SPEC-0001 R4.77),
  and a pre-drain one for the Machine that a scale down deletes first; the
  remediation of `remediation` is held by `maxInFlight` 1, through the
  topology: of two Machines that the annotation
  `cluster.x-k8s.io/remediate-machine` marks, the MachineSet deletes one, held
  by a pre-drain hook, and defers the other, whose `OwnerRemediated` is then
  `False` `RemediationDeferred`.
- Seen while implementing, at `v1.14.4`: a MachineSet creates every Machine it
  misses at once, and a MachineSet and a MachineDeployment report `ScalingUp`
  `True` only while they have fewer Machines than their replicas, so their
  `ScalingUp` is `False` while a new Machine starts, unless a preflight check
  holds the scale up (core/reconcilers/machineset/machineset_controller.go:766-1023;
  core/reconcilers/machineset/machineset_controller_status.go:110-170;
  core/reconcilers/machinedeployment/machinedeployment_status.go:244-301). A
  KubeadmControlPlane adds one Machine at a time and reports `ScalingUp` `True`
  while it does, so `scaling-up` scales the control plane and the workers
  together. Of a Cluster with a managed topology, the preflight check
  `ControlPlaneIsStable` of a MachineSet holds a scale up while the version of
  the topology is not that of the control plane, or the control plane
  upgrades, and the MachineSet then says so in the message of its `ScalingUp`
  (core/reconcilers/machineset/machineset_preflight.go:154-193). The topology
  changes no MachineDeployment while its control plane upgrades: in a run that
  moved the version and the replicas of a MachineDeployment of the topology in
  one change, the new replicas reached the MachineDeployment with the new
  version, once the control plane was upgraded, and the MachineSet created its
  Machines at once. So `scaling-up-held`, for a MachineDeployment that reports
  `ScalingUp` `True` with fewer Machines than its replicas, leaves the replicas
  to the MachineDeployment, as an autoscaler does, scales it while the control
  plane upgrades, and makes the upgrade last with the command of
  `provisioning` before kubeadm. In its capture, three checks held the new
  worker: `ControlPlaneIsStable`, `KubeadmVersionSkew` and
  `ControlPlaneVersionSkew`, each a line of the message of `ScalingUp`.
- Decided while implementing: `upgrading` and `scaling-up-held` start their
  workload clusters at `workloadKubernetesUpgradeFrom` of the pins, `v1.36.4`,
  a release that Cluster API supports for workload clusters and the tag of
  `kindest/node` that the development provider runs them on, and upgrade them
  to `workloadKubernetesVersion`; the scripts refuse a version to upgrade from
  that is not before it.
- Deviation, decided while implementing: the objects with no status are taken
  from the API server of the real project in a server-side dry run of their
  creation, which its webhooks default and validate and which nothing stores or
  reconciles, since a controller writes a status, a `Paused` condition at
  least, within a second of the creation of most kinds. No ExtensionConfig is
  among them: the real project runs without the feature RuntimeSDK, as the
  quick start of the book does, and the webhook of ExtensionConfig refuses one
  then (core/webhooks/admission/extensionconfig.go:81-87). Neither are the
  Docker kinds of the development provider, which no template of the release
  uses and no set holds. No kind of the Cluster API Operator has a fixture: the
  real project does not run the operator.
- Decided while implementing: `machine-pool-without-machines` is written by
  hand from the set of `machine-pools`, in a namespace of its own, without the
  Machines of the pool and what they own, and with the status that R2.66 to
  R2.69 give a MachinePool whose provider keeps no Machines. Its `README.md`
  says so, and what it changed; its YAML files, written by the writer of the
  scripts as those of every set, carry no comment.
- Deviation, decided while implementing: on the first tier, the time of
  creation of every object and the time of deletion of a deleting one are
  those of the API server, the moment of the run, which a client cannot set;
  the round trip compares every other field. A deleting object is held there
  by its finalizers, those of the project and the one of the scripts, and
  `pnpm e2e:fixtures:down`, the `down` of the fixtures, removes all of them
  before it deletes their namespace, since nothing else would remove those of
  the project there.
- Deviation, decided while implementing: the integration workflow creates its
  kind cluster with the scripts, the cluster of the definitions, in place of the
  action of the template, so that the scripts apply the definitions and the
  fixtures to a cluster of their own, as their safety rules ask; its
  `kubernetes_version`, with no cluster to give it to, is gone. Its session of
  the fixtures opens one state, `healthy`, at each run; `TEST_FIXTURE_STATE`
  names another, and the round trip checks every set against the schemas of the
  first tier.
- Seen while implementing, in Freelens dev `v2.1.0`: the list of the host for a
  custom resource keys its columns by the names of the printer columns of the
  definition, and at `v1beta2` MachineDeployment and KubeadmControlPlane name
  two columns `Available`, their condition and their count of available
  replicas (core/config/crd/bases/cluster.x-k8s.io_machinedeployments.yaml:873-889;
  controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:2878-2894),
  so React logs a repeated key at every render of their lists. Decided while
  implementing: the session of the fixtures decides each such error in the
  handler of its message, on the address that the frame that logged it had
  then, as Playwright reports it in order with the messages, and leaves it out
  only when that address is the list of the host for a custom resource, with
  no details panel open, and the key is a column that the list repeats, as the
  host makes its columns from the definition: the printer columns of the
  version it reads, without those of a priority above 0. The keys of a list
  are read before the session opens it, or, for a list that Freelens restores,
  when its first message arrives. Any other repeated key counts, those of the
  views of the extension included; the error is the host's, and says nothing
  about the extension. The session checks that the host imported the renderer
  of the extension in the frame of the cluster, where the host links its
  stylesheet before it activates it, an error of the activation failing its
  teardown, and finds every object of a set by the cell of its name in the
  list of the host.
- Decided while implementing: the jobs of the two tiers are the workflow
  `test-environment.yaml`, on `ubuntu-24.04`, an amd64 runner, the processor of
  the machine where the scripts ran the captures. A new push to a pull request
  cancels the job of the real project that still runs for it, and those of
  `main` and of the night are never cancelled.
- Seen while implementing, on the first captures: `healthy` was taken seconds
  after the Nodes of its workers became ready, and its MachineHealthCheck of
  the workers counted no Machine healthy yet; `paused` kept that count. Decided
  while implementing: a workload cluster is healthy, for `healthy` and for the
  states that start from it, once every MachineHealthCheck also counts the
  Machines that its selector targets, found as its controller finds them
  (core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:297-362),
  and reports them all healthy, each with `HealthCheckSucceeded` `True`. Both
  sets were captured again so; the other states change their clusters after
  that wait, and their sets were kept.
- Decided while implementing: a capture refuses a real project whose providers
  are not those of the pins, at their release, as `up` does, raises the limits
  of inotify as `up` does, checks that the first tier can give every object
  its generation before it writes a set, and writes the set with the modes of
  a checkout. A value that starts as a document marker, which yamlfmt quotes
  and yamllint then finds quoted for nothing, is written in a literal block,
  and a text with a line that starts with a tab in double quotes.
- Verified on 2026-11-25: both pull requests of the spec and the follow-up
  of the review of their fixes are merged, and every job of CI ran green on
  `main` after them, those of the fixtures and of the real project included.
  The spec has no manual check.
- From the maintainer's decision of 2026-11-26 (SPEC-0001, "Notes and
  deviations"), the sessions in Freelens run on 2.1.0 alone.
