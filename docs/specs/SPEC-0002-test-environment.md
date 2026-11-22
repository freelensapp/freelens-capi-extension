# SPEC-0002: Test environment

- **Status:** Approved
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
  come with the fixtures, in the second pull request.
- In Freelens, on the definitions and the fixtures: the extension installs
  and activates with no error in either process, and the host lists the
  objects of every fixture.
- With the real project: `pnpm e2e:cluster:up` reaches workload clusters
  whose Cluster reports `Available` `True`, run again it resumes, and
  `pnpm e2e:cluster:down` leaves no container and no cluster behind.
- The fixtures: a test applies each fixture to the first tier, reads every
  object back at `v1beta2`, and compares it with the file.

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
