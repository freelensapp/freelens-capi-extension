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
  seen failing on a broken case.
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
