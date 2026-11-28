# SPEC-0028: Clusters with another control plane, proven with Kamaji

- **Status:** Approved
- **Milestone:** `M1` (see [ROADMAP.md](../development/ROADMAP.md))
- **Reviewed project:** Cluster API `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`; the Kamaji control plane provider
  `v0.22.0`, commit `c1d313e440a21bdea2448b531084fe7a034ac876`; and Kamaji
  `26.9.3-edge`, commit `0ac808bf990a29ff22e397d90d680c45b84d53e2`
- **Freelens:** 2.1.0, tag `v2.1.0`, the lowest release that
  `engines.freelens`, `^2.1.0`, admits, and the one that the jobs of CI run
  (SPEC-0001, A8, as amended on 2026-11-26)
- **Dependencies:** [SPEC-0001](SPEC-0001-reconnaissance.md), approved;
  [SPEC-0002](SPEC-0002-test-environment.md),
  [SPEC-0003](SPEC-0003-status-model.md) and [SPEC-0004](SPEC-0004-clusters.md),
  verified on `main`; and [SPEC-0005](SPEC-0005-cluster-tree.md), approved, its
  first part on `main`, whose tree this spec extends, so that it is implemented
  after it, as the roadmap places it (ROADMAP.md:43-44)
- **Approval:** Approved on 2026-11-27 under the maintainer's delegation for
  the work inside M1, after four independent reviews and probes of the
  provider on kind and of the host with the Kamaji extension in Freelens 2.1.0
  ("The provider, as run", "The host, as probed"); the exception of P16 to
  SPEC-0001, A2 and A3 as the maintainer decided on 2026-11-26; it is reviewed
  with the rest of M1 at its review

## Goal

An operator whose Clusters take their control plane from a provider other than
kubeadm, such as Kamaji, sees them in the list, the details and the tree of M1
as the project reports them: their health and what it rests on, what the control
plane is doing or why that cannot be read, its counters in the unit that it
counts, and its version. From the details of such a control plane, the operator
reaches its tenant through the Kamaji extension of the organization. The views
only read.

## Upstream reference

The sources were read at the tag and commit of each. They are a reference for
behavior and for the domain: no code, text or style is copied from them. The
facts of Cluster API come from SPEC-0001, the rules of status from SPEC-0003,
and the reads, the list, the details and the tree from SPEC-0004 and SPEC-0005,
which every rule below cites. The provider, Kamaji and the Kamaji extension are
sources that SPEC-0001 did not read: they were read for this spec, at a tag and
a commit written down here, before it uses them (kit, `docs/specs.md`, "Adding
to the scope"), and "The provider and Kamaji, as read" states their facts, each
with its source.

| Source                                              | Tag           | Commit         | Date of the commit        | License    | Read for                                                                                                                                                                                 |
| --------------------------------------------------- | ------------- | -------------- | ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubernetes-sigs/cluster-api`                       | `v1.14.4`     | `4356c154f4a7` | 2026-11-03 08:29:50 +0000 | Apache-2.0 | What core does with a control plane of a provider, and with a workload cluster that stops answering; the contract of a control plane in the book (SPEC-0001)                             |
| `clastix/cluster-api-control-plane-provider-kamaji` | `v0.22.0`     | `c1d313e440a2` | 2026-11-04 15:19:07 +0100 | Apache-2.0 | Its two kinds, their definitions, its controller, its gates, its roles and its components                                                                                                |
| `clastix/kamaji`                                    | `26.9.3-edge` | `0ac808bf990a` | 2026-09-12 10:18:35 +0200 | Apache-2.0 | The TenantControlPlane, its status and the state that Kamaji computes, its webhook of versions, its definitions and its chart                                                            |
| `freelensapp/freelens-kamaji-extension`             | `v2.0.1`      | `87266d15cb4a` | 2026-11-11 16:23:03 +0100 | MIT        | Its pages, its registrations, the panel and the menu item of a TenantControlPlane, and how it reads the kind                                                                             |
| `freelensapp/freelens`                              | `v2.1.0`      | `c4700f9`      | 2026-11-21 11:31:49 +0100 | MIT        | The extension API: the enabled extensions, the address of a page, the details of the host, and the APIs that it registers from the discovery for a user who may not list the definitions |
| `freelensapp/freelens`                              | `v2.0.0`      | `b9b53e1`      | 2026-10-28 12:23:32 +0100 | MIT        | The removal of an extension, which explains a fix of `v2.1.0` that P15 relies on; no release that this extension supports                                                                |

How each pin was taken:

- The provider at `v0.22.0`, the release that the reading of 2026-11-26 took,
  whose `metadata.yaml` maps its series `0.22` to the contract `v1beta2`
  (provider:config/metadata.yaml:7-10). It builds against Cluster API `v1.13.4`
  (provider:go.mod:16), not the `v1.14.4` of this extension: both serve the
  contract `v1beta2`, and the probe ran it with core `v1.14.4` (L2).
- Kamaji at the commit that the provider requires, a pseudo-version
  (provider:go.mod:6), which the tag `26.9.3-edge` names, and which no `replace`
  of the provider changes: its one block of them replaces modules of `k8s.io`
  alone (provider:go.mod:116-139). Kamaji publishes edge releases alone, and the
  provider pins none of them as stable (provider:README.md:86-89), so the pin
  follows the provider and not the latest release of Kamaji.
- The Kamaji extension at `v2.0.1`, the release that the same reading took,
  `@freelensapp/kamaji-extension` 2.0.1, which declares `engines.freelens`
  `^2.0.0` (kamaji-extension:package.json:2-3, 15-18), so it admits Freelens
  2.1.0, on which it loaded with no error (H6).

As in SPEC-0003, SPEC-0004 and SPEC-0005, a path with no prefix is in
`kubernetes-sigs/cluster-api` at `v1.14.4`, and any other path is prefixed with
the name of its source and a colon: `provider:` for the Kamaji control plane
provider at `v0.22.0`, `kamaji:` for Kamaji at `26.9.3-edge`,
`kamaji-extension:` for the Kamaji extension at `v2.0.1`, `freelens:` for
Freelens at `v2.1.0`, and `freelens@v2.0.0:` for Freelens at that tag, cited
only to explain a fix of `v2.1.0`. `kit` is the Freelens extension kit at
`v0.1.5`. The files of this repository are named by their path in it, and its
documents by their name and a section, as the other specs name them. The files
below, whose paths do not fit in a line, are cited by their name, with the
prefix of their source:

| Name                                                                              | Path                                                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `provider:types.go`                                                               | `api/v1alpha2/kamajicontrolplane_types.go`                                                            |
| `provider:template_types.go`                                                      | `api/v1alpha2/kamajicontrolplanetemplate_types.go`                                                    |
| `provider:condition-types.go`                                                     | `api/v1alpha2/kamajicontrolplane_conditions.go`                                                       |
| `provider:conditions.go`                                                          | `controllers/conditions.go`                                                                           |
| `provider:controller.go`                                                          | `controllers/kamajicontrolplane_controller.go`                                                        |
| `provider:tcp.go`                                                                 | `controllers/kamajicontrolplane_controller_tcp.go`                                                    |
| `provider:resources.go`                                                           | `controllers/kamajicontrolplane_controller_resources.go`                                              |
| `provider:cluster_patch.go`                                                       | `controllers/kamajicontrolplane_controller_cluster_patch.go`                                          |
| `provider:finalizer.go`                                                           | `controllers/kamajicontrolplane_finalizer.go`                                                         |
| `provider:externalreference.go`                                                   | `controllers/kamajicontrolplane_controller_externalreference.go`                                      |
| `provider:name_generator.go`                                                      | `pkg/externalclusterreference/name_generator.go`                                                      |
| `provider:crd.yaml`                                                               | `config/crd/bases/controlplane.cluster.x-k8s.io_kamajicontrolplanes.yaml`                             |
| `provider:template_crd.yaml`                                                      | `config/crd/bases/controlplane.cluster.x-k8s.io_kamajicontrolplanetemplates.yaml`                     |
| `provider:components.yaml`                                                        | `config/control-plane-components.yaml`                                                                |
| `provider:leader_election_role.yaml`                                              | `config/rbac/leader_election_role.yaml`                                                               |
| `provider:e2e.yaml`                                                               | `.github/workflows/e2e.yaml`                                                                          |
| `provider:targetcluster.yaml`                                                     | `.github/workflows/assets/targetcluster-controlplane.yaml`                                            |
| `kamaji:tcp_status.go`                                                            | `api/v1alpha1/tenantcontrolplane_status.go`                                                           |
| `kamaji:tcp_types.go`                                                             | `api/v1alpha1/tenantcontrolplane_types.go`                                                            |
| `kamaji:tcp_funcs.go`                                                             | `api/v1alpha1/tenantcontrolplane_funcs.go`                                                            |
| `kamaji:tcp_controller.go`                                                        | `controllers/tenantcontrolplane_controller.go`                                                        |
| `kamaji:soot_manager.go`                                                          | `controllers/soot/manager.go`                                                                         |
| `kamaji:resource.go`                                                              | `internal/resources/resource.go`                                                                      |
| `kamaji:k8s_deployment_resource.go`                                               | `internal/resources/k8s_deployment_resource.go`                                                       |
| `kamaji:k8s_service_resource.go`                                                  | `internal/resources/k8s_service_resource.go`                                                          |
| `kamaji:kubeadm_config.go`, `kamaji:kubeadm_phases.go`, `kamaji:kubeadm_utils.go` | `internal/resources/kubeadm_config.go`, `kubeadm_phases.go` and `kubeadm_utils.go` beside it          |
| `kamaji:egress.go`                                                                | `internal/resources/konnectivity/egress_selector_configuration_resource.go`                           |
| `kamaji:datastore_setup.go`                                                       | `internal/resources/datastore/datastore_setup.go`                                                     |
| `kamaji:tcp_version.go`                                                           | `internal/webhook/handlers/tcp_version.go`                                                            |
| `kamaji:kubeadm_version.go`                                                       | `internal/upgrade/kubeadm_version.go`                                                                 |
| `kamaji:cmd.go`                                                                   | `cmd/manager/cmd.go`                                                                                  |
| `kamaji:deployment.go`                                                            | `internal/builders/controlplane/deployment.go`                                                        |
| `kamaji:tcp_crd.yaml`                                                             | `charts/kamaji/crds/kamaji.clastix.io_tenantcontrolplanes.yaml`                                       |
| `kamaji:datastore_crd.yaml`                                                       | `charts/kamaji/crds/kamaji.clastix.io_datastores.yaml`                                                |
| `kamaji:Chart.yaml`, `kamaji:Chart.lock`, `kamaji:values.yaml`                    | `charts/kamaji/Chart.yaml`, `Chart.lock` and `values.yaml` beside it                                  |
| `kamaji:helm.yaml`                                                                | `.github/workflows/helm.yaml`                                                                         |
| `kamaji-extension:index.tsx`                                                      | `src/renderer/index.tsx`                                                                              |
| `kamaji-extension:tenant-details.tsx`                                             | `src/renderer/details/tenant-details.tsx`                                                             |
| `kamaji-extension:kamaji-menu-item.tsx`                                           | `src/renderer/components/kamaji-menu-item.tsx`                                                        |
| `kamaji-extension:tenants-page.tsx`                                               | `src/renderer/pages/tenants/tenants-page.tsx`                                                         |
| `kamaji-extension:tenant-control-plane.ts`                                        | `src/renderer/k8s/tenant-control-plane-v1alpha1.ts`                                                   |
| `freelens:app.ts`                                                                 | `packages/core/src/extensions/common-api/app.ts`                                                      |
| `freelens:enabled-extensions.injectable.ts`                                       | `packages/core/src/features/extensions/enabled/common/enabled-extensions.injectable.ts`               |
| `freelens:update-state.injectable.ts`                                             | `packages/core/src/features/extensions/enabled/common/update-state.injectable.ts`                     |
| `freelens:load-storage.injectable.ts`                                             | `packages/core/src/features/extensions/enabled/renderer/load-storage.injectable.ts`                   |
| `freelens:tokens.ts`                                                              | `packages/core/src/renderer/before-frame-starts/tokens.ts`                                            |
| `freelens:extension-loader.ts`                                                    | `packages/core/src/extensions/extension-loader/extension-loader.ts`                                   |
| `freelens:api.md`                                                                 | `docs/extensions/api.md`                                                                              |
| `freelens:for-extension.ts`                                                       | `packages/core/src/renderer/routes/for-extension.ts`                                                  |
| `freelens:lens-extension.ts`                                                      | `packages/core/src/extensions/lens-extension.ts`                                                      |
| `freelens:navigation.ts`                                                          | `packages/core/src/extensions/renderer-api/navigation.ts`                                             |
| `freelens:get-details-url.injectable.ts`                                          | `packages/core/src/renderer/components/kube-detail-params/get-details-url.injectable.ts`              |
| `freelens:list-layout.tsx`                                                        | `packages/core/src/renderer/components/item-object-list/list-layout.tsx`                              |
| `freelens:drawer.tsx`                                                             | `packages/core/src/renderer/components/drawer/drawer.tsx`                                             |
| `freelens:definitions.injectable.ts`                                              | `packages/core/src/renderer/components/custom-resource-definitions/definitions.injectable.ts`         |
| `freelens:setup-auto-crd-api-creations.injectable.ts`                             | `packages/core/src/renderer/before-frame-starts/runnables/setup-auto-crd-api-creations.injectable.ts` |
| `control-plane.md`                                                                | `docs/book/src/developer/providers/contracts/control-plane.md`                                        |
| `controlplane.go`                                                                 | `internal/contract/controlplane.go`                                                                   |
| `cluster_controller_status.go`                                                    | `core/reconcilers/cluster/cluster_controller_status.go`                                               |
| `cluster_controller_phases.go`                                                    | `core/reconcilers/cluster/cluster_controller_phases.go`                                               |
| `machine_controller.go`                                                           | `core/reconcilers/machine/machine_controller.go`                                                      |
| `machine_controller_status.go`                                                    | `core/reconcilers/machine/machine_controller_status.go`                                               |
| `dockercluster_backend.go`                                                        | `test/infrastructure/docker/internal/controllers/backends/docker/dockercluster_backend.go`            |

A rule that SPEC-0001, SPEC-0002, SPEC-0003, SPEC-0004, SPEC-0005 and the kit do
not settle is marked "Proposed:" with its reason and the facts it rests on, and
numbered from P1; a decision of the maintainer is recorded as the maintainer's,
with its date, in the rule that it settles, as in P16. A rule of another spec is
cited with its spec, as "SPEC-0004, P8", and so are the decisions of SPEC-0001,
as "SPEC-0001, A3", and the facts of SPEC-0005, as "SPEC-0005, H20", so that the
series never mix. The facts read in the sources of this spec are numbered from
K1 in "The provider and Kamaji, as read"; those of the two probes that ran the
provider on kind from L1 in "The provider, as run"; and those of the probe of
the host in Freelens 2.1.0 from H1 in "The host, as probed"; each is cited by
its number, as "(K6)", "(L9)" or "(H8)". A fact K that a probe confirms cites
it, and one that a probe corrected says so. A number is never reused: a rule or
a fact that goes keeps its number, with the word "Dropped" and its reason, so
that the reviews of the drafts still read. No rule waits for a probe or for the
job of the captures, which cannot run before the approval: its workflow reaches
`main` in the first pull request of the implementation (P7). Each rule stands on
the facts, and where no probe reached, on the code that the facts K state, as
the rule says (kit, `docs/specs.md`, "Evidence"). Every rule here is listed
again under "Notes and deviations", with what it adds to the kit or to the specs
before it, or how it departs from them, and "Changes to the approved specs"
holds the text that each approved spec gains. No question is open: the one point
that the maintainer could see otherwise, where the review of M1 looks at the
Kamaji Clusters, has a reasonable default, which P19 proposes (kit,
`docs/specs.md`, "Evidence").

## Scope

The roadmap gives this item, after the tree of a Cluster: a Cluster with the
control plane of another provider, proven with Kamaji, its objects captured once
from the provider on kind and shown in the list, the details and the tree of M1;
the corrections that its facts call for, the activity of a control plane that
writes no condition of activity, the counters of a control plane with no
Machines, and its version; and the link to its tenant through the Kamaji
extension of the organization, with a test of the two extensions together
(ROADMAP.md:44, "Changes of scope").

Included:

- The fixtures of a Cluster with a KamajiControlPlane, in nine states that the
  probes reached and that the views tell apart (P1), captured once from the
  provider on a kind cluster of their own (P2 to P6), by a job of CI that runs
  only when it is dispatched (P7), applied to the cluster of the definitions
  with the others, and checked there (P8).
- The views of M1 with such a control plane: the activity (P9), the words of its
  counters (P10), the version of its Cluster (P11), its section in the details
  of a Cluster (P12) and its node in the tree (P13).
- The tenant of a KamajiControlPlane: how the view finds it (P14), how it knows
  that the Kamaji extension is there (P15), what it reads, as the maintainer
  decided (P16), and the row that links it or says why it does not (P17).
- The session of the two extensions together (P18), and the sessions of
  SPEC-0004 and SPEC-0005 on the new states, on Freelens 2.1.0.
- Where the review of M1 looks at the Kamaji Clusters (P19).
- The documents that change, each in the pull request that changes what it says
  (kit, `docs/process.md`, "The loop"). In the pull request of this spec, as the
  kit asks and as SPEC-0005 did: DESIGN.md, whose new rules this draft holds in
  a copy (kit, `docs/design.md`, "How it is enforced"); the "Notes and
  deviations" of SPEC-0001, SPEC-0002, SPEC-0003, SPEC-0004 and SPEC-0005, each
  with the text that "Changes to the approved specs" gives it (kit,
  `docs/specs.md`, "Evidence"); and the row of the roadmap. In the pull requests
  of the implementation ("Notes and deviations"): TESTING.md, the states, the
  cluster of the captures and its commands, the pins, the jobs of CI, and its
  sentence on what no workflow uploads (P7); AGENTS.md, "Common Commands" and
  "Workflows", for the commands of the captures, the new session and the job of
  the captures; ARCHITECTURE.md, "What it reads", and the README,
  "Permissions", for the TenantControlPlanes; TRY-IT.md, for the Kamaji
  Clusters; and the row of the roadmap again.

Excluded:

- The view of a KamajiControlPlane itself and of its template, the fields of its
  spec, its datastore, its network, its addons and its deployment: SPEC-0011
  ("Changes of scope"; ROADMAP.md:59).
- A control plane in another cluster, a KamajiControlPlane whose tenant is
  deployed elsewhere: SPEC-0011 ("Changes of scope"). The views of M1 say that
  it is elsewhere, and look for no tenant of it (P14, P17).
- The TenantControlPlane, its DataStore, its Deployment, its Pods and its state
  as Kamaji computes it: the Kamaji extension shows them, which the row of P17
  reaches; no view of this extension shows a status of them (P13).
- A Cluster with a managed topology made from a class with a
  KamajiControlPlaneTemplate: its version comes from its topology, as for any
  Cluster (SPEC-0004, P9); the classes are SPEC-0012.
- The actions of M3 on such a control plane: its scale subresource (K4) is a
  fact for SPEC-0018, and the absence of a field of the contract for a rollout
  (K3) one for SPEC-0020.
- A fixed job of CI with the provider: the capture runs once, when it is
  dispatched (P7).

## The provider and Kamaji, as read

What the reading of the sources of this spec found, each fact with its source.
The probes of "The provider, as run" ran what the rules rest on, and each fact
that they saw cites them.

- **K1. The kinds.** KamajiControlPlane and KamajiControlPlaneTemplate are in
  `controlplane.cluster.x-k8s.io`, at `v1alpha2` alone
  (provider:api/v1alpha2/groupversion_info.go:17), which the definition serves
  and stores (provider:crd.yaml:39, 9353-9354). Both are namespaced
  (provider:crd.yaml:20; provider:template_crd.yaml:20), of the categories
  `cluster-api` and `kamaji` (provider:crd.yaml:11-13), with the short names
  `ktcp` and `ktcpt` (provider:crd.yaml:17-18; provider:types.go:337;
  provider:template_types.go:18).
- **K2. The contract.** The definitions that the release publishes carry the
  labels `cluster.x-k8s.io/v1beta2: v1alpha2` and
  `cluster.x-k8s.io/provider: kamaji` (provider:components.yaml:20-22):
  kustomize adds the first to the files of the definitions
  (provider:config/crd/kustomization.yaml:26-29), and the second to every object
  of the components (provider:config/default/kustomization.yaml:11-13).
  clusterctl gives every component that it installs the label
  `cluster.x-k8s.io/provider` that names the provider with its type,
  `control-plane-kamaji` here, in place of the `kamaji` of the release, and the
  label `clusterctl.cluster.x-k8s.io`
  (cmd/clusterctl/client/repository/components.go:260, 544-563;
  cmd/clusterctl/api/v1alpha3/labels.go:45-50), the label by which SPEC-0003,
  P24 finds the controller of a kind from its definition; the release files of
  the providers of SPEC-0002 carry the label that clusterctl gives them, as
  `control-plane-kubeadm`
  (controlplane/kubeadm/config/default/kustomization.yaml:8). The series `0.22`
  serves the contract `v1beta2` (provider:config/metadata.yaml:7-10), which
  clusterctl read so when it installed the provider (L2). So a reference to a
  KamajiControlPlane resolves to `v1alpha2` (SPEC-0001, R1.16; SPEC-0004, P3).
- **K3. Its spec.** `spec.replicas`, 2 by default (provider:types.go:170-173);
  `spec.version`, required (:174-175); `spec.controlPlaneEndpoint` (:168-169);
  `spec.network.serviceType`, `LoadBalancer` by default (:117-118);
  `spec.addons`, which has no default, the addons that Kamaji installs in the
  tenant, among them CoreDNS, with the addresses of its Service,
  `dnsServiceIPs`, and kube-proxy (:151-163, 223-224;
  kamaji:tcp_types.go:497-506), which the provider copies into the
  TenantControlPlane (provider:tcp.go:89-101), where `spec.kubelet` has one
  (provider:types.go:239-241); and `spec.deployment.externalClusterReference`,
  which names the Secret of a kubeconfig of another cluster and a namespace
  there, by its four fields `kubeconfigSecretName`, `kubeconfigSecretKey`,
  `kubeconfigSecretNamespace` and `deploymentNamespace` (:195-198, 249-264). The
  spec has no `machineTemplate` and no field of a rollout (:165-176, 209-247).
- **K4. Its status.** `initialization.controlPlaneInitialized`, `ready`,
  `readyReplicas`, `replicas`, `selector`, `availableReplicas`,
  `upToDateReplicas`, `externalManagedControlPlane`, `true` by default, the
  failure fields, `version`, a single string with no `omitempty`, and
  `conditions` (provider:types.go:266-271, 300-333); a status requires
  `externalManagedControlPlane`, `ready` and `version`
  (provider:crd.yaml:9347-9350), and the first defaults to `true` also when a
  status is written without it through the subresource (L6). The kind has the
  subresources `status` and `scale` (provider:types.go:336-338;
  provider:crd.yaml:9355-9360).
- **K5. Its conditions.** Ten types, a closed list:
  `FoundExternalReferenceClient`, `TenantControlPlaneCreated`,
  `TenantControlPlaneAddressReady`, `ControlPlaneEndpointPatched`,
  `InfrastructureClusterPatched`, `KamajiControlPlaneIsInitialized`,
  `KamajiControlPlaneIsReady`, `KubeadmResourcesCreated`, `Available` and
  `Paused` (provider:condition-types.go:8-19). None of `RollingOut`,
  `ScalingUp`, `ScalingDown`, `Remediating`, `MachinesReady` or
  `MachinesUpToDate`, which the probes saw in no state (L17, L22). A tracked
  step writes its condition `True` `Succeeded` with no message, or `False` with
  its error as message, `Failed` when the error asks to enqueue back and
  `Pending` otherwise, at the generation of the object
  (provider:conditions.go:14-50). `Available` is `True` `Available` or `False`
  `NotAvailable`, from `status.ready`, with no message
  (provider:controller.go:356-366). `Paused` is written `True` `Paused` by a
  reconcile that finds the Cluster or the object paused, and removed by the next
  one that does not (:101-121, 132). The provider watches its
  KamajiControlPlanes, the Secrets it owns and its TenantControlPlanes, not the
  Clusters (:406-422), and takes events from a channel too (:411), which only
  its controller of external cluster references feeds
  (provider:controllers/externalclusterreference_controller.go:200-209), a
  controller that runs only under the gate `ExternalClusterReference` or
  `ExternalClusterReferenceCrossNamespace` (provider:main.go:145-168); and its
  filter drops every event of an object that carries the annotation
  `cluster.x-k8s.io/paused` (provider:controller.go:413;
  util/predicates/generic_predicates.go:194-224): so a pause, and its end, reach
  the condition only at the next event of those objects, and a pause by the
  annotation not at all, as the probe saw (L15). The probe saw the conditions
  written in the order of L9.
- **K6. The reconcile.** In this order, returning at each wait
  (provider:controller.go:167-291): it makes the TenantControlPlane (:170-174);
  waits for its address, `TenantControlPlaneAddressReady` `False` `Pending`
  meanwhile (:187-201; provider:controllers/errors.go:12); writes its own
  `spec.controlPlaneEndpoint` (:205-209); patches the infrastructure cluster
  unless the gate `SkipInfraClusterPatch` is on (:231-247); waits for the
  endpoint of the Cluster, its infrastructure and a state of the tenant
  (:252-268); is initialized once the tenant is first `Ready` (:270-291); copies
  the counters of the Deployment of the tenant, `upToDateReplicas` from its
  `updatedReplicas`, and its own `status.version` from the version that the
  tenant has installed (:293-305); makes the Secrets of the contract,
  `KubeadmResourcesCreated`, which waits for the kubeconfig and the certificate
  authority of the tenant (:321-339; provider:resources.go:28-32, 46-50); then
  `ready` is true while the tenant is `Ready` or `Upgrading`, and otherwise
  `KamajiControlPlaneIsReady` is `False` `Failed` with "TenantControlPlane in"
  its state "status, enqueue back" (:341-354), and it reconciles again a second
  later (:368-373). A step that fails leaves its condition `False` and
  `Available` as the last reconcile that ended left it (:134-142, 176-180),
  which the probe saw for a version that Kamaji refuses (L12); the condition of
  that step observes the generation of the object, and the others keep the
  generation that they observed then (:134-142, 170-179). The
  KamajiControlPlane waits for an owner reference of its Cluster first (:76-82).
  The probe saw these steps in this order (L7 to L9).
- **K7. The infrastructure cluster and the gates.** The provider patches the
  endpoint of an infrastructure cluster of a fixed list of kinds, checks it
  without a patch on two of them, Metal3Cluster and MetalStackCluster
  (provider:cluster_patch.go:128-131), patches those that
  `--dynamic-infrastructure-clusters` names when the gate
  `DynamicInfrastructureClusterPatch` is on, and stops on any other with
  "unsupported infrastructure provider" (provider:cluster_patch.go:105-152). Its
  role grants it Secrets, Clusters, KamajiControlPlanes, the infrastructure
  clusters of that list and TenantControlPlanes
  (provider:config/rbac/role.yaml:1-99), and its role of leader election
  ConfigMaps, Leases and Events (provider:leader_election_role.yaml:13-44), and
  nothing else. Its four gates, `ExternalClusterReference`,
  `ExternalClusterReferenceCrossNamespace`, `SkipInfraClusterPatch` and
  `DynamicInfrastructureClusterPatch`, are alpha and off by default
  (provider:pkg/features/features.go:6-21; provider:main.go:79-103), set by
  variables of clusterctl in the components of the release,
  `CACPPK_SKIP_INFRA_CLUSTER_PATCH` among them
  (provider:components.yaml:18035-18036), and the list of dynamic clusters is
  refused without its gate (provider:main.go:118-121). The probe ran both gates
  that concern a DevCluster (L5).
- **K8. The tenant.** The provider makes a TenantControlPlane with the name and
  the namespace of the KamajiControlPlane (provider:tcp.go:31-34), its labels
  (:59), which carry `cluster.x-k8s.io/cluster-name`, since core sets that label
  and its owner reference on the control plane
  (cluster_controller_phases.go:99-135), its annotations but the last applied
  one (provider:tcp.go:47-57), its replicas (:81), its version with a leading
  `v` (:83-88), its deployment strategy (:241), and an owner reference to the
  KamajiControlPlane with the flag of controller (:253-255), which the probe saw
  (L16). No field of the KamajiControlPlane names it (provider:types.go:165-176,
  209-247, 300-333). The provider watches the TenantControlPlanes it owns when
  the cluster serves the kind as it starts (provider:controller.go:420-422), so
  the probe installed Kamaji first (L1).
- **K9. A tenant in another cluster.** With
  `spec.deployment.externalClusterReference`, the TenantControlPlane is
  `kcp-<uid of the KamajiControlPlane>` in the namespace of the deployment, in
  the cluster of that kubeconfig (provider:name_generator.go:27-29;
  provider:tcp.go:41-44), with no owner reference (:253-255); the provider then
  holds a finalizer of its own, and only then (provider:finalizer.go:20-49;
  provider:controller.go:148-166). It needs the gate `ExternalClusterReference`
  (K7), without which the provider fails and makes no tenant anywhere
  (provider:externalreference.go:34-36; provider:controller.go:148-159). The
  probe did not try it (L20).
- **K10. The kind of a tenant.** TenantControlPlane is in `kamaji.clastix.io`,
  namespaced, at `v1alpha1` alone, served and stored, with the subresources
  `status` and `scale` and a conversion stanza of the strategy `Webhook`
  (kamaji:tcp_crd.yaml:9, 13, 19, 50, 10628-10637), and the printer columns
  Version, Installed Version, Status, Control-Plane endpoint, Kubeconfig,
  Datastore and Age (kamaji:tcp_types.go:583-589). Its status holds no condition
  of its own, but its own `observedGeneration`, which Kamaji writes at the end
  of a reconcile that succeeds (kamaji:tcp_status.go:164-167;
  kamaji:tcp_controller.go:288-303), and, under `status.kubernetesResources`:
  the version that the tenant runs, with its state (K11); the status of its
  Deployment, with the `observedGeneration` of the Deployment, conditions that
  carry none, and the time of the last update of it by Kamaji; and the status of
  its Service, with no `observedGeneration` of its own, its conditions carrying
  one each, and with no port of its load balancer, which Kamaji strips
  (kamaji:tcp_status.go:187-196, 221-243; kamaji:tcp_crd.yaml:9880-9974,
  10415-10562; kamaji:k8s_service_resource.go:51). The second probe saw the
  `observedGeneration` of the Deployment one above the generation of the
  TenantControlPlane in every settled state (L27). It names Secrets and
  ConfigMaps, with times and checksums of their content: the checksums of the
  Secrets of the tenant, and those of three ConfigMaps, its kubeadm
  configuration, the phase of its bootstrap token, derived from that
  configuration, and the egress configuration of konnectivity
  (kamaji:tcp_status.go:14-161; kamaji:kubeadm_config.go:72-76;
  kamaji:kubeadm_phases.go:130, 247; kamaji:kubeadm_utils.go:117, 223;
  kamaji:egress.go:84-87). Kamaji adds two finalizers to a TenantControlPlane,
  `finalizer.kamaji.clastix.io` and `finalizer.kamaji.clastix.io/soot`
  (kamaji:datastore_setup.go:102; kamaji:soot_manager.go:235), which the probe
  saw (L16). The DataStore is a kind with no namespace
  (kamaji:datastore_crd.yaml:16).
- **K11. The state of a tenant.** Kamaji writes one of `Unknown`,
  `Provisioning`, `Sleeping`, `WriteLimited`, `CertificateAuthorityRotating`,
  `Upgrading`, `Migrating`, `Ready` and `NotReady`
  (kamaji:tcp_status.go:198-211), `Provisioning` by default (:216). It computes
  it in this order: `Sleeping` while the spec of the tenant asks for 0 replicas,
  `NotReady` while its Deployment has no ready replica, `WriteLimited` while its
  spec limits the writes, `Ready` with no rollout of its Deployment in progress,
  `Upgrading` while the version of the spec differs from the one recorded,
  `Provisioning` while none is recorded, and `Unknown` otherwise
  (kamaji:k8s_deployment_resource.go:85-102, 148-160). A rollout is in progress
  for any difference between the desired replicas and the ready, the updated or
  the current ones, an unavailable one, or a generation not yet observed
  (:122-146). The version is recorded only while the tenant is `Ready` or
  `Sleeping` (:104-109). Read in the code, while the version of its spec
  differs from the one recorded, a reconcile updates its status with the time
  of the write under `status.kubernetesResources.deployment` (:39-43, 104-117;
  kamaji:resource.go:104-115), and a write of its status starts another
  reconcile, the TenantControlPlane being watched with no filter
  (kamaji:tcp_controller.go:261-275, 352). Corrected by the second probe: in an
  upgrade held by a quota, nothing wrote the TenantControlPlane for two
  minutes, that time moving only with a change of the status of the Deployment
  (L25). The probes saw `Unknown` during a scale, `Upgrading`, `Sleeping` and
  `NotReady` (L10, L11, L13, L14, L24).
- **K12. Its rollouts.** Unless the KamajiControlPlane gives a strategy, Kamaji
  rolls a tenant out blue and green, with a surge of 100% and no replica
  unavailable (kamaji:deployment.go:193-216; provider:tcp.go:241), whose
  counters the probe saw, the current ones above the desired (L11), and which a
  quota of one Pod holds, the new Pod refused and the old one kept (L24).
- **K13. Its address.** The address of a tenant is the one written in its spec,
  else the cluster address of its Service of type `ClusterIP`, else the address
  of a `LoadBalancer`, an error while it has none (kamaji:tcp_funcs.go:58-83),
  from which Kamaji writes its endpoint (kamaji:k8s_service_resource.go:50-62).
  Kamaji gives a Service of type `LoadBalancer` no address of its own
  (kamaji:k8s_service_resource.go:145-169), so a tenant waits for its load
  balancer, as the probes saw (L8, L28).
- **K14. The chart and the provider's own test.** The chart of Kamaji names the
  version `0.0.0+latest` (kamaji:Chart.yaml:20) and the subchart `kamaji-etcd`
  at `>=0.15.0` (:21-25), which its lock pins at `0.15.0`
  (kamaji:Chart.lock:1-5), the lock from which Kamaji's own CI builds the chart
  (kamaji:helm.yaml:30-33) and from which the probe built it (L1); its values
  give the DataStore `default` (kamaji:values.yaml:99), an issuer of
  cert-manager (:101-108), the subchart with cert-manager (:113-129), and
  telemetry unless it is disabled (:131-133). The provider's own end-to-end test
  installs cert-manager and that chart with Helm, then the providers with
  `clusterctl init` (provider:e2e.yaml:83-128), and a Cluster with one replica,
  the DataStore `default`, a `LoadBalancer` and the version `1.34.1`
  (provider:targetcluster.yaml:31-64).
- **K15. No Machine.** The provider makes no Machine: its role grants it nothing
  on Machines (K7), and what it makes for the contract are the
  TenantControlPlane and two Secrets of the Cluster, its kubeconfig and its
  certificate authority (provider:resources.go:25-59). Completed by the probe:
  it writes the second by a create or an update, and leaves the Secret of that
  name as it is when its first owner is a TenantControlPlane
  (provider:resources.go:79-82); with a KamajiControlPlane named as its Cluster,
  that name is the Secret of the certificate authority that Kamaji makes for the
  tenant, owned by the TenantControlPlane, which the provider then leaves (L18).
- **K16. What core does with it.** The Cluster copies the counters of its
  control plane and its `status.versions`, and nothing else for the versions
  (cluster_controller_status.go:126-173). With no control plane Machine,
  `ControlPlaneMachinesReady` and `ControlPlaneMachinesUpToDate` are `True`
  `NoReplicas` (:719-760, 805-811;
  `api/core/v1beta2/cluster_types.go:264-265, 311-312`). The `RollingOut`,
  `ScalingUp` and `ScalingDown` of the Cluster consider the control plane only
  when it writes the condition (:906-911, 976-982, 1053-1059).
  `ControlPlaneAvailable` mirrors its `Available` (:450-470;
  control-plane.md:756), and `ControlPlaneInitialized` reads the field of its
  contract (cluster_controller_status.go:551-600). The Cluster takes the first
  valid endpoint that it reads, of its infrastructure cluster or of its control
  plane (cluster_controller_phases.go:211-228, 324-341). The probes saw each of
  these (L4, L17, L28). A Cluster with no infrastructure cluster is never
  reported available (SPEC-0001, R2.27), which no probe made.
- **K17. The contract.** A control plane may count replicas of its instances
  (control-plane.md:67, 309-313); one whose instances are Machines MUST have
  `spec.machineTemplate` (:69, 459-472). `status.versions` is the preferred
  source of its versions, and `status.version` a fallback that the contract
  deprecates (:413, 433-446). The Cluster reads `RollingOut`, `ScalingUp` and
  `ScalingDown` of a control plane that implements them (:768-769). The project
  reads the current version of a control plane from `status.versions`, else
  `status.version` (controlplane.go:355-372), and for its checks of provisioning
  and of upgrades it takes an empty `status.version` as none, and sees an
  upgrade when `spec.version` comes after one of the entries of
  `status.versions`, else after `status.version` (:274-352, 289-291, 313-330,
  342-344); its one check of a scale from the counters, any of which differs
  from `spec.replicas`, serves its end-to-end tests alone (:374-382).
- **K18. The development provider.** A DevCluster writes the address of its load
  balancer into its endpoint only when none is written, then reports itself
  provisioned (dockercluster_backend.go:100-111), which the probes saw (L4, L8,
  L28).
- **K19. The Kamaji extension.** `@freelensapp/kamaji-extension` 2.0.1, MIT
  (kamaji-extension:package.json:2-3, 20). It registers the pages
  `kamaji-tenants-page` and `kamaji-datastores-page` under the menu Kamaji
  (kamaji-extension:index.tsx:26-64), lists TenantControlPlane and DataStore in
  `customResources` (:66-68), and registers a menu item and a details panel for
  TenantControlPlane and a panel for DataStore (:70-85). The panel reads the
  object alone (kamaji-extension:tenant-details.tsx:20-95), and shows the
  conditions of the Deployment of the tenant
  (kamaji-extension:tenant-control-plane.ts:550-553;
  kamaji-extension:tenant-details.tsx:26-29, 39-47). The menu item saves the
  admin kubeconfig of the tenant from a Secret, on a click
  (kamaji-extension:kamaji-menu-item.tsx:29-60). Its Tenants page reads the
  store of the host for TenantControlPlanes at `v1alpha1`
  (kamaji-extension:tenants-page.tsx:44-56;
  kamaji-extension:tenant-control-plane.ts:454-476), and it registers no API.
  That page shows the columns Name, Namespace, Status, Pods, Endpoint, Version,
  Datastore and Age, its search matches the words of those columns alone
  (kamaji-extension:tenants-page.tsx:29-38, 95-116), and the list of the host
  adds nothing to the search (freelens:list-layout.tsx:264-276). The probe of
  the host saw on 2.1.0 its two pages under the entry Kamaji, the panel of a
  TenantControlPlane, the icon of its menu item in the toolbar of the details
  of the host, never pressed, the Tenants page with those columns and that
  search, and no request of its own while its pages were closed (H6, H8 to
  H10); not the panel of a DataStore, the item saving a kubeconfig, or the
  conditions of a Deployment in the panel, the status written by hand for the
  probe holding none (H1, H11).
- **K20. The host: addresses and details.** A page of an extension is at
  `/extension/<id>/<page>`, the id being the name of its package without `@` and
  with `/` as `--` (freelens:for-extension.ts:11-15;
  freelens:lens-extension.ts:27-28, 125-127).
  `Renderer.Navigation.getDetailsUrl(selfLink)` puts an object in the parameter
  of the details of the host and keeps the other parameters
  (freelens:navigation.ts:51; freelens:get-details-url.injectable.ts:21-36). The
  probe of the host saw both (H8, H9).
- **K21. The host: the enabled extensions.** `Common.App.getEnabledExtensions()`
  (freelens:app.ts:41) returns the names of the extensions whose state is
  enabled, as a computed value of mobx
  (freelens:enabled-extensions.injectable.ts:12-23), from the state that main
  writes, the name of each extension being that of its manifest
  (freelens:extension-loader.ts:285-296, 525-529), and that every frame loads
  and follows (freelens:load-storage.injectable.ts:12-22;
  freelens:tokens.ts:26-28). Freelens 2.1.0 sets an extension that is removed to
  disabled in that state (freelens:extension-loader.ts:437-445), which 2.0.0 did
  not do, that state being merged into and never deleted
  (freelens@v2.0.0:extension-loader.ts:419-425;
  freelens:update-state.injectable.ts:23), so on 2.1.0 the list drops an
  extension that is uninstalled (H5). The documents of the extension API list
  `App` among the members of `Common` (freelens:api.md:259) and make every
  member that the namespaces export public and stable for the major
  (freelens:api.md:1342-1347); no page of them describes
  `getEnabledExtensions()`. The probe of the host saw the list follow every
  change at once (H4, H5).
- **K22. The versions of a tenant.** Kamaji refuses a TenantControlPlane whose
  version is above the minor that it supports, `v1.37`, from its
  `KubeadmVersion`, `v1.37.0`, the patch ignored, at its creation and at an
  update, and, at an update, a downgrade and a jump of more than one minor
  (kamaji:tcp_version.go:23-45, 59-97; kamaji:kubeadm_version.go:7), in a check
  that its manager registers among the webhooks of a TenantControlPlane
  (kamaji:cmd.go:251-255). The probe saw the first two refusals, and the
  versions that run (L3).
- **K23. A workload cluster that stops answering.** Once a probe of the workload
  cluster has succeeded, core writes `RemoteConnectionProbe` `False`
  `ProbeFailed` after a grace period, 50 seconds by default, with the message
  `Remote connection probe failed, probe last succeeded at` and the time of the
  last probe that succeeded, in RFC 3339 (cluster_controller_status.go:311-339;
  core/main.go:195), which the message of the `Available` of the Cluster repeats
  on its line of that condition (L14, L23); that time does not move while the
  probe keeps failing (L23). The conditions `NodeReady` and `NodeHealthy` of a
  Machine keep their value for a grace period of 5 minutes by default, counted
  from the later of the last probe that succeeded and the initialization of the
  control plane, then turn `Unknown` `ConnectionDown`, with the message
  `Last successful probe at` and that time (core/main.go:199): core wakes the
  Machine controller at the end of that grace, the cache of the cluster sending
  it an event once the last probe that succeeded is that old
  (machine_controller.go:164;
  controllers/clustercache/cluster_cache.go:293-297), and the controller then
  writes both conditions with one time, that of the last probe that succeeded,
  the time of the message of the Cluster (machine_controller_status.go:291-297,
  426-431). Read in the code of core, a time is written inside the message of a
  condition in three other places alone: a drain, a wait for the detach of
  volumes, and the `spec.rollout.after` of a MachineDeployment
  (machine_controller.go:544, 585, 1329;
  core/reconcilers/machine/drain/drain.go:474;
  core/reconcilers/machinedeployment/mdutil/util.go:534), which only a Machine
  that is deleted and a MachineDeployment with that field reach. No probe saw a
  Machine past that grace (L13, L29).

## The provider, as run

What only the running provider shows, this spec takes from two probes on kind,
which ran the provider with core, the development provider and Kamaji as the job
of the captures would (P2 to P7). The first made four runs, one step by step and
three of a script, two of them from scratch and one with a watch on every write
of the status of the KamajiControlPlane and of its TenantControlPlane: its facts
are L1 to L20. The second made the same environment again, to see how a capture
reaches, holds and reads each state: its facts are L21 to L29. Each fact says
what was done and what it showed. The probes are no test of this spec: the job
of the captures runs again what its rules rest on, and a state that does not
hold as its rule says fails its capture, which then writes no set (P5). For what
the probes did not reach (L20, L29), each rule that needs it says what it stands
on instead. Their times are those of the machine that ran them, not those of a
runner of CI.

- **L1. What ran.** A kind cluster of one node, `kindest/node` `v1.37.0`, the
  `managementKubernetes` of the pins, with the socket of Docker mounted, made
  with kind `v0.33.0`, the version of the integration workflow, as the scripts
  make the cluster of the real project. On it, in this order: clusterctl
  `v1.14.4` installed the core, the kubeadm bootstrap and control plane
  providers and the development provider at `v1.14.4`, from a local repository
  of files checked against the pins of this extension, which brought
  cert-manager `v1.21.3`, the version of the pins; MetalLB `v0.15.2`, the
  `config/manifests/metallb-native.yaml` of that tag, then a pool of one address
  of the network of kind and an L2 advertisement, the pool applied again until
  the webhook of MetalLB answered; Kamaji, with helm `v3.19.0`, from its chart
  at the tag `26.9.3-edge`, taken by a sparse clone checked against the commit
  of the tag, whose subchart `kamaji-etcd` `helm dependency build` took at
  `0.15.0`, the version that the `Chart.lock` of the chart names (K14), checked
  against its digest, installed in `kamaji-system` with `image.tag`
  `26.9.3-edge`, `image.pullPolicy` `IfNotPresent`, `telemetry.disabled` `true`
  and `resources` unset, which brought the DataStore `default`, an etcd of three
  replicas; and the provider `v0.22.0`, with
  `clusterctl init --control-plane kamaji:v0.22.0` from that local repository,
  which held its two files of the release, `control-plane-components.yaml` and
  `metadata.yaml`, with `CACPPK_SKIP_INFRA_CLUSTER_PATCH=true`, the gate
  `SkipInfraClusterPatch`. Kamaji came before the provider, since the provider
  asks the discovery once, as it starts, whether the cluster serves
  TenantControlPlanes, and watches them only if it does
  (provider:controller.go:420-421; K8). Every file that the probe downloaded was
  checked against its SHA-256 before its use, those that the pins of this
  extension do not hold against the digests that P3 lists, and the archive of
  `kamaji-etcd` once `helm dependency build` had downloaded it; the files of the
  chart of Kamaji, taken by the clone, were checked against the commit of their
  tag alone. Each state was read, with `kubectl get -o yaml`, as soon as a test
  on its objects held; the settled ones once core had also copied the counters
  of the KamajiControlPlane into the Cluster.
- **L2. The provider on core `v1.14.4`.** clusterctl `v1.14.4` installed the
  provider from its local repository, whose `metadata.yaml` maps the series
  `0.22` to the contract `v1beta2` (K2), and every step of the probe ran with
  it, with no error of the contract: the initialization, `Available`, a worker
  that joined, scales, an upgrade, a pause and a deletion.
  `clusterctl init --wait-providers` returned after 1 s, before the pod of the
  provider had pulled its image; the probe then waited for the Deployment of the
  provider: the command and that wait took 16 to 21 s together in the runs of
  the script.
- **L3. The versions of a tenant.** Kamaji `26.9.3-edge` compares the major and
  the minor of a version with its `KubeadmVersion`, `v1.37.0`, and ignores the
  patch (K22). In a server-side dry run of the creation of a TenantControlPlane,
  which created nothing, `v1.37.0`, `v1.37.9`, `1.37.0` with no `v`, `v1.36.4`,
  `v1.35.0`, `v1.33.0` and `v1.30.0` were accepted, with no lower bound, and
  `v1.38.0` was refused, "unable to create a TenantControlPlane with a
  Kubernetes version greater than the supported one, actually v1.37"; at an
  update, `v1.38.0` and a downgrade from `v1.37.0` to `v1.36.4` were refused,
  the second with "unable to downgrade a TenantControlPlane from 1.37.0 to
  1.36.0". Tenants ran at `v1.36.4`, at `v1.37.0` by an upgrade from it, and at
  `v1.37.0` made so, with no worker (L5). A KamajiControlPlane set to `v1.38.0`
  is accepted by its own API, and the update of its TenantControlPlane that the
  provider then makes is refused (L12).
- **L4. A worker of the development provider.** A MachineDeployment of the
  development provider of one replica at `v1.36.4` joined a tenant at `v1.36.4`,
  whose KamajiControlPlane named two addons, which the kind does not default
  (K3): CoreDNS, with the address of its Service in the service network of the
  Cluster, and kube-proxy. The Node of its Machine became Ready, and stayed
  Ready through the upgrade of the tenant to `v1.37.0`. It took two more things
  that the defaults do not give:
  - The endpoint of the DevCluster written to the address of the tenant before
    the DevCluster is reconciled. The development provider fills an empty
    endpoint with the address of its own load balancer (K18), and core copies
    into the Cluster the first endpoint that it finds (K16): a tenant still
    waiting for its address gave its Cluster the address of that load balancer,
    which a worker would have joined.
  - `net.netfilter.nf_conntrack_max` on the host at the value that kube-proxy
    computes, 32768 for each processor and 131072 at least. The kube-proxy of
    the tenant writes it when it differs, which the container of a worker may
    not do ("open /proc/sys/net/netfilter/nf_conntrack_max: permission denied"):
    kube-proxy then restarted again and again, kindnet could not reach the first
    address of the service network of the Cluster, and the Node stayed
    `NotReady` ("cni plugin not initialized"). Set before, the Node of the
    worker was Ready 69 to 71 s after the apply.
- **L5. The gates.** `SkipInfraClusterPatch` works with the development provider
  and the release as it is. With `DynamicInfrastructureClusterPatch` and
  `--dynamic-infrastructure-clusters=DevCluster` instead, the release grants the
  provider no verb on `devclusters`, and a KamajiControlPlane stayed at
  `TenantControlPlaneAddressReady` `False` `Pending` for the 90 s observed, its
  TenantControlPlane `Ready`, at `v1.37.0`, with an endpoint and no condition of
  an error; the cause, read in the code and not in the log of the provider: the
  provider reads the infrastructure cluster as an unstructured object through
  its cache (provider:cluster_patch.go:82-101; provider:main.go:132), whose
  informer cannot list them. With a ClusterRole of the probe that granted `get`,
  `list`, `watch` and `patch` on `devclusters` to the ServiceAccount of the
  provider, `InfrastructureClusterPatched` turned `True`, and `Available` `True`
  within 5 s. That gate needs a role that the release does not ship, and the
  first needs no role; with either, a worker joins only with the written
  endpoint of L4.
- **L6. `externalManagedControlPlane`.** The provider never writes it, and every
  status that it wrote read `true`. On a KamajiControlPlane that no controller
  writes, with no owner reference, a status written through the subresource
  without the field, with it `null`, or with it removed, read back `true`, and
  `false` written so stayed `false`. The definition requires
  `externalManagedControlPlane`, `ready` and `version` in a status and defaults
  the first to `true`, and a status without `ready` was refused (K4).
- **L7. Provisioning.** Four seconds after the apply of a Cluster whose
  DevCluster had the endpoint of L4: the KamajiControlPlane had its first three
  conditions `True` `Succeeded`, `TenantControlPlaneCreated`,
  `TenantControlPlaneAddressReady` and `ControlPlaneEndpointPatched`, `ready`
  `false`, `version` `""`, `externalManagedControlPlane` `true`, and no
  `initialization`, no counter and no `Available`; its TenantControlPlane was
  `Provisioning`, with its endpoint already. The Cluster was `Provisioning` and
  copied `desiredReplicas` alone of the counters of its control plane; its
  `ControlPlaneAvailable` was `False` `NotAvailable`, "KamajiControlPlane
  status.initialization.controlPlaneInitialized is false", its `Available`
  `False` from its `RemoteConnectionProbe`, "Remote connection not established
  yet", and its `ScalingUp` `True` came from its MachineDeployment. In the run
  step by step, the TenantControlPlane went `Provisioning`, `NotReady` and
  `Ready`, and the KamajiControlPlane was `Available` 26 s after the apply.
- **L8. A tenant with no address.** A second Cluster, made while the one address
  of the pool was taken, with no endpoint written in its DevCluster and no
  worker: its KamajiControlPlane waited at `TenantControlPlaneAddressReady`
  `False` `Pending`, "Control Plane Endpoint is not yet available since
  unprocessed by Kamaji", after `TenantControlPlaneCreated` `True` and with no
  other condition, `ready` `false` and `version` `""`; its TenantControlPlane
  had no status, and its Service of type `LoadBalancer` no ingress. The Cluster
  was `Provisioning`, with `desiredReplicas` 1 alone of the counters of its
  control plane, `WorkersAvailable` `True` `NoWorkers`, and its
  `ControlPlaneAvailable` and its `Available` as in L7. The state lasts as long
  as no address is given; with the load balancer answering at once, the flow of
  L7 passes it in under 3 s. In the run step by step, 8 s after the apply, its
  DevCluster and its Cluster held the address of the load balancer of the
  development provider as their endpoint (L4).
- **L9. Available.** Every condition of the KamajiControlPlane `True`, in this
  order: `TenantControlPlaneCreated`, `TenantControlPlaneAddressReady`,
  `ControlPlaneEndpointPatched`, `KamajiControlPlaneIsInitialized`,
  `KubeadmResourcesCreated`, `KamajiControlPlaneIsReady` and `Available`; its
  counters 1, 1, 1 and 1, from the Deployment of the tenant, which counts Pods,
  not Machines; its `version` written. The Cluster `Available` `True`, the
  counters of its control plane copied and no `versions` for it, the workers
  alone having theirs; `ControlPlaneMachinesReady` and
  `ControlPlaneMachinesUpToDate` `True` `NoReplicas`; and the Machine of its
  worker `NodeReady` `True`. From the apply, the KamajiControlPlane was
  `Available` in 26 s, and the Node of the worker Ready and the Cluster
  `Available` in 69 to 71 s in the runs of the script.
- **L10. A scale.** Up from 1 to 3, through the subresource `scale`: the
  KamajiControlPlane wrote `ready` `false`, `KamajiControlPlaneIsReady` `False`
  `Failed`, "TenantControlPlane in Unknown status, enqueue back", and
  `Available` `False` `NotAvailable`, with 3, 1, 1 and 3 as its current, ready,
  available and up to date replicas; the TenantControlPlane was `Unknown`; the
  Cluster copied 3 desired and those counters, its `ControlPlaneAvailable` and
  its `Available` turned `False` `NotAvailable` a few seconds later, and its
  `ScalingUp` stayed `False`, core taking no scale from a control plane that
  writes none. It lasted 9 to 12 s, for 1 to 3 and for 1 to 2, and the scale
  settled at 3 replicas, every condition `True`, 12 s after the command. Down,
  the KamajiControlPlane wrote the same for under a second, a few writes within
  one second in the watch, which a reading every 1 or 2 s never saw.
- **L11. An upgrade.** From `v1.36.4` to `v1.37.0`: `spec.version` `v1.37.0` and
  `status.version` `v1.36.4` until the tenant was `Ready` again, `Available`
  `True` throughout, the TenantControlPlane `Upgrading`, and the counters of a
  Deployment in a rollout, 2, 1, 1 and 1 for 1 desired, copied as such into the
  Cluster; with 2 replicas, the watch saw 4, 2, 2 and 2, then 4, 4, 4 and 2, and
  `upToDateReplicas` 0 for a moment. It settled in 11 to 12 s. Core copied the
  counters into the Cluster some seconds after the KamajiControlPlane settled:
  one run of the script read the settled state with the Cluster still holding
  the surge, 2 replicas and 1 up to date, while the KamajiControlPlane read 1,
  1, 1 and 1, and the script then waited for the copy.
- **L12. A version that Kamaji refuses.** The KamajiControlPlane set to
  `v1.38.0` (L3): the webhook of Kamaji refused the update of its
  TenantControlPlane by the provider, `TenantControlPlaneCreated` turned `False`
  `Pending`, "cannot create or update TenantControlPlane: admission webhook
  "vtenantcontrolplane.kb.io" denied the request: unable to upgrade to a version
  greater than the supported one (v1.37)", and `Available` stayed `True`, from
  the last reconcile that ended: a condition of positive polarity `False` while
  `Available` is `True`, the partial reconcile of K6. The TenantControlPlane
  stayed `Ready` at `v1.37.0`.
- **L13. Scaled to 0.** `spec.replicas` 0: the TenantControlPlane `Sleeping`,
  with no counter of its Deployment; the counters of the KamajiControlPlane 0,
  written and not absent, `ready` `false`, `KamajiControlPlaneIsReady` `False`
  `Failed`, "TenantControlPlane in Sleeping status, enqueue back", and
  `Available` `False`; the Cluster with the counters of its control plane at 0
  and `ControlPlaneAvailable` `False`. It was reached 1 to 4 s after the
  command. In the run step by step, the `RemoteConnectionProbe` of the Cluster
  turned `False` about 40 s later, while the Machine of the worker kept
  `NodeReady` `True`, as last read (K23).
- **L14. Back from 0.** In the run step by step, back to 1: the
  TenantControlPlane `NotReady` until its Pod was ready; the KamajiControlPlane
  `Available` `False`, `KamajiControlPlaneIsReady` `False` `Failed`,
  "TenantControlPlane in NotReady status, enqueue back", with 1, 0, 0 and 1 as
  its current, ready, available and up to date replicas; the
  `RemoteConnectionProbe` of the Cluster `False` `ProbeFailed`, "Remote
  connection probe failed, probe last succeeded at" and a time, which the
  message of its `Available` repeated on its line of that condition (K23). The
  KamajiControlPlane was `Available` 12 s after the command, and the Cluster 26
  s after, once its probe connected again; 13 s in the runs of the script.
- **L15. Paused.** With `spec.paused` of the Cluster, then an update of the
  KamajiControlPlane, an annotation: the provider wrote `Paused` `True` `Paused`
  and stopped there, and core wrote the `Paused` `True` of the Cluster. With
  `spec.paused` and no event of the KamajiControlPlane, in the run step by step:
  70 s after, the KamajiControlPlane had no `Paused`, which came with its first
  update and stayed after the Cluster was resumed, until its next update, 16 s
  observed; the provider watching no Cluster (K5), a KamajiControlPlane can show
  `Paused` with its Cluster not paused, and the reverse. With the annotation
  `cluster.x-k8s.io/paused` on the KamajiControlPlane: no condition was written
  (K5), and a scale to 2 made then stayed unapplied for 30 s, `spec.replicas` 2
  and the TenantControlPlane at 1, and was applied 13 s after the annotation was
  removed.
- **L16. Deleting.** The Cluster deleted, in the run step by step: `Deleting`
  `True` `WaitingForWorkersDeletion` and `ScalingDown` `True` from its workers,
  the Machine deleting and the KamajiControlPlane untouched; then
  `WaitingForControlPlaneDeletion`; then `ControlPlaneAvailable` `False`
  `ObjectDeleted`, with `WaitingForInfrastructureDeletion`; all gone in 13 s; a
  tenant that was never initialized reads `ObjectDoesNotExist` instead of
  `ObjectDeleted`. With the KamajiControlPlane held by a finalizer of the probe:
  it has no finalizer of its own, its tenant being in the same cluster (K9), and
  the Cluster owns it by an owner reference with no `controller`; the provider
  writes nothing on a KamajiControlPlane that is deleting, whose status stays
  the last one, `Available` `True`; the Cluster read `Deleting` `True`
  `WaitingForControlPlaneDeletion`, `Available` `False` and
  `ControlPlaneAvailable` still `True`, its workers gone; the
  TenantControlPlane, with the finalizers `finalizer.kamaji.clastix.io` and
  `finalizer.kamaji.clastix.io/soot` (K10) and the KamajiControlPlane as its
  owner with the flag of controller (K8), went only once the KamajiControlPlane
  was gone, every object 2 to 3 s after the hold was removed.
- **L17. What core writes on the Cluster.** The conditions and the counters of
  the control plane in the status of the Cluster, state by state:

| State                                       | Counters of the control plane: desired, current, ready, available, up to date | `ControlPlaneInitialized` | `ControlPlaneAvailable`              | `Available`            | `RemoteConnectionProbe` |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------- | ------------------------------------ | ---------------------- | ----------------------- |
| Provisioning (L7)                           | 1, none                                                                       | `False` `NotInitialized`  | `False` `NotAvailable`               | `False` `NotAvailable` | `False` `ProbeFailed`   |
| Available (L9)                              | 1, 1, 1, 1, 1                                                                 | `True` `Initialized`      | `True` `Available`                   | `True` `Available`     | `True` `ProbeSucceeded` |
| A scale up (L10)                            | 3, 3, 1, 1, 3                                                                 | `True`                    | `False` `NotAvailable`               | `False` `NotAvailable` | `True`                  |
| An upgrade (L11)                            | 1, 2, 1, 1, 1                                                                 | `True`                    | `True` `Available`                   | `True`                 | `True`                  |
| A version refused (L12)                     | 1, 1, 1, 1, 1                                                                 | `True`                    | `True` `Available`                   | `True`                 | `True`                  |
| Scaled to 0 (L13)                           | 0, 0, 0, 0, 0                                                                 | `True`                    | `False` `NotAvailable`               | `False`                | `True`, then `False`    |
| Back from 0 (L14)                           | 1, 1, 0, 0, 1                                                                 | `True`                    | `False` `NotAvailable`               | `False`                | `False` `ProbeFailed`   |
| Deleting, the KamajiControlPlane held (L16) | 1, 1, 1, 1, 1                                                                 | `True`                    | `True`, then `False` `ObjectDeleted` | `False` `NotAvailable` | `True`                  |

In every state: `ControlPlaneMachinesReady` and `ControlPlaneMachinesUpToDate`
`True` `NoReplicas`; no `versions` in `status.controlPlane`, while
`status.workers.versions` lists those of the workers; `RollingOut`, `ScalingUp`
and `ScalingDown` from the workers alone, `ScalingUp` while the
MachineDeployment starts and `ScalingDown` while it is deleted, never from the
control plane; and the printer column `VERSION` of the Cluster empty (K16).

- **L18. What the provider and Kamaji make.** The provider made the
  TenantControlPlane and the Secret `<cluster>-kubeconfig`, of the type
  `cluster.x-k8s.io/secret`, owned by the KamajiControlPlane, with the label
  `cluster.x-k8s.io/cluster-name` and the key `value`. It writes
  `<cluster>-ca`, owned by the KamajiControlPlane, with `tls.crt` and
  `tls.key`, by a create or an update, and leaves the Secret of that name as it
  is when its first owner is a TenantControlPlane (provider:resources.go:79-82):
  with the KamajiControlPlane named as its Cluster, as in the probe,
  `<cluster>-ca` is the Secret of Kamaji itself, owned by the
  TenantControlPlane, with `ca.crt`, `ca.key`, `tls.crt` and `tls.key` and no
  label of Cluster API, which the provider left as it was, and which the kubeadm
  bootstrap of the worker used. Kamaji made the Deployment, the Service and
  eleven Secrets of the tenant, each owned by the TenantControlPlane.
- **L19. The times, and the images.** The runs of the script took, in seconds:
  the downloads 8, the chart of Kamaji and its dependency 3, the kind cluster 31
  to 32, the first `clusterctl init` 38 to 39, MetalLB 25 to 53, the chart of
  Kamaji 45 to 46, and the provider with its Deployment 16 to 21, so 172 to 196
  for the whole `up`; the states of one tenant, from its apply to its deletion,
  140 to 143; and `down` about 2. A whole run took about 5.5 minutes. The run
  step by step took 18 s for the downloads, 33 for the kind cluster and 49 for
  the first `clusterctl init`. The machine held the images of the kind nodes
  `v1.37.0` and `v1.36.4` and of the load balancer of the development provider
  before the probe; every other image was pulled at each run, each kind node
  being new: the controllers of Cluster API, of the development provider, of
  cert-manager and of MetalLB, etcd, and the images of the tenant at `v1.36.4`
  and `v1.37.0`, by the node of the cluster; kindnet, the kube-proxy of
  `v1.37.0` at the upgrade and the CoreDNS of the tenant, whose tag was not
  recorded, by the worker. Four pulls of each run came from Docker Hub, which
  limits pulls with no login: the images of the provider, of Kamaji,
  `clastix/kubectl:v1.37` and kindnet.
- **L20. What the probe did not reach.** A runner of CI, its times, and whether
  its kernel lets the container of a worker write `nf_conntrack_max`, which the
  probe set on the host anyway; tenant versions other than `v1.36.4` and
  `v1.37.0` run, the others accepted by a dry run alone, and the refusal of an
  upgrade that skips a minor, read in the code (K22); the log of the provider
  under the gate of L5, whose cause is read in the code; a tenant in another
  cluster (K9), the exposures by Ingress and by Gateway, and the failures of the
  Pods of a tenant, `NotReady` seen only while it came back from 0 (L14); the
  CoreDNS image of the tenant; a Cluster with no endpoint written in its
  DevCluster that became available, which L28 reached; and objects cleaned as
  fixtures, its readings being raw, with the addresses of its network and the
  names of its machine.
- **L21. What ran, the second time.** The environment of L1, made again by the
  same steps and with the same pins, the four providers of the pins among those
  that clusterctl installed, with a pool of two addresses of the network of kind
  in place of one. On it, three Clusters closer to the fixtures of P1 than that
  of L4: each with a DevCluster with no endpoint written and no worker, and a
  KamajiControlPlane of one replica at `v1.36.4`, its Service of type
  `LoadBalancer`, the default (K3), the provider running with the gate
  `SkipInfraClusterPatch` (L5). The first went through provisioning, available
  and the three holds of L24; the second through a plain upgrade to `v1.37.0`, a
  scale to 0, the way back and a deletion, its KamajiControlPlane held by a
  finalizer of the probe; the third was applied while both addresses were taken.
  A reading was one `kubectl get` of the KamajiControlPlane, the
  TenantControlPlane and the Cluster of a state, with their managed fields; a
  pair, two readings 2 s apart; and a state was read in ten pairs, one every
  6 s, over a minute, what changed between two readings diffed by its path
  afterwards, with the manager and the time of each write. In every state, once
  its three objects were saved, the clusterctl `v1.14.4` of L1 ran
  `clusterctl describe cluster`, with no check of a newer version and with no
  terminal, so with no color, once with its default flags and once with
  `--show-conditions all`. `up` took 178 s, and the whole probe 19 minutes, each
  hold kept for two minutes.
- **L22. What `clusterctl describe cluster` prints.** With its default flags,
  three rows for such a Cluster: the Cluster, then its DevCluster and its
  KamajiControlPlane, the KamajiControlPlane first of the two once it is
  deleted; never the TenantControlPlane. The row of the KamajiControlPlane is
  named `KamajiControlPlane <namespace>/<name>, <version>`, the version of its
  `spec.version`, read through the contract
  (internal/util/tree/tree.go:595-599): `v1.37.0` during an upgrade, while its
  `status.version` is still `v1.36.4`. Its REPLICAS is its `status.replicas`
  over its `spec.replicas`, its AVAILABLE, READY and UP TO DATE are the counters
  of its status, and its STATUS, REASON and SINCE are those of its `Available`
  (tree.go:737-779), with no MESSAGE in any state, the provider writing
  `Available` with no message (K5); before the provider writes its counters and
  its `Available`, the row holds its name and its version alone. The row of the
  Cluster sums the counters of its control plane and of its workers, a cell
  staying empty while neither writes its counter (tree.go:632-666); its STATUS,
  REASON and SINCE are those of its `Available`, and its MESSAGE lists, one per
  line, the conditions that make it `False`. A deleting object has
  `!! DELETED !!` before its name (tree.go:611-613). SINCE is an age, as `1s`
  or `4m5s`; the one time of a clock in the output is inside the message of a
  probe that failed (L23), which the default output wraps onto a second line.
  `--show-conditions all` adds every condition of the three objects, with its
  status, its reason, its age and its message, as
  `TenantControlPlane in Sleeping status, enqueue back` for the
  `KamajiControlPlaneIsReady` of a tenant at 0 replicas. The rows, state by
  state:

| State                                                       | The row of the Cluster: REPLICAS, AVAILABLE, READY, UP TO DATE, STATUS and REASON                                                                                                        | The row of the KamajiControlPlane                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Provisioning, and a tenant with no address                  | `0/1`, the next three cells empty, `False` `NotAvailable`, its MESSAGE three lines: the probe not established yet, the infrastructure not provisioned, the control plane not initialized | Its name and `v1.36.4` alone                                           |
| Available                                                   | `1/1`, `1`, `1`, `1`, `True` `Available`                                                                                                                                                 | The same                                                               |
| A scale from 1 to 3 held by a quota (L24)                   | `1/3`, `1`, `1`, `1`, `False` `NotAvailable`                                                                                                                                             | The same, at `v1.36.4`                                                 |
| A plain upgrade                                             | `1/1`, `1`, `1`, `1`, `True` `Available`                                                                                                                                                 | `1/1`, then `2/1` a second later, at `v1.37.0`                         |
| An upgrade held by a quota (L24)                            | `1/1`, `1`, `1`, `0`, `True` `Available`                                                                                                                                                 | The same, at `v1.37.0`                                                 |
| Scaled to 0                                                 | `0/0`, `0`, `0`, `0`, `False` `NotAvailable`                                                                                                                                             | The same                                                               |
| Zero Pods held by a quota (L24)                             | `0/1`, `0`, `0`, `0`, `False` `NotAvailable`                                                                                                                                             | The same                                                               |
| Either of the last two, once the probe of core failed (L23) | The same, the line of the probe first in its MESSAGE, with its time                                                                                                                      | The same                                                               |
| Deleting, the KamajiControlPlane held                       | `!! DELETED !!` before its name, `1/1`, `1`, `1`, `1`, `False` `NotAvailable`, its MESSAGE `* Deleting: Waiting for KamajiControlPlane to be deleted`                                    | `!! DELETED !!` before its name, the same counters, `True` `Available` |

The two runs of a state, a second apart, printed the same rows, but in the plain
upgrade, whose KamajiControlPlane read `1/1` and then `2/1`, the surge of its
rollout (L25).

- **L23. Core's probe of a tenant that stops answering.** Scaled to 0, the
  tenant was `Sleeping` in 1 s, while the probe still read `True`; 48 s after
  the scale, the `RemoteConnectionProbe` of the Cluster turned `False`
  `ProbeFailed`, with the message
  `Remote connection probe failed, probe last succeeded at` and the time of the
  last probe that succeeded, 2 s before the scale, written in RFC 3339, in UTC,
  to the second, with a `Z` and no fraction (K23). A minute later the condition
  was the same, byte for byte, and the Cluster at the same version: the time
  does not move while the probe keeps failing, and the state holds still. The
  message of the `Available` of the Cluster lists that line first, with the
  same text. The zero Pods of L24 gave the same, 49 s after the Pods were
  deleted, and the Cluster was not written again in the 1 min 45 s that
  followed. Before a first success, the message is
  `Remote connection not established yet`, with no time, as in provisioning and
  for a tenant with no address. In every state read, those two messages, once
  the probe has failed, are the only texts of the three objects that hold a
  time.
- **L24. The holds of a ResourceQuota.** A ResourceQuota on Pods in the
  namespace of a tenant, where its Deployment had its Pods and Kamaji made no
  other Pod. At 1 Pod, a scale of the KamajiControlPlane from 1 to 3 held in 1 s
  and for the two minutes watched, with no write of the KamajiControlPlane, of
  the TenantControlPlane or of the Cluster: the KamajiControlPlane `ready`
  `false`, `KamajiControlPlaneIsReady` `False` `Failed`, "TenantControlPlane in
  Unknown status, enqueue back", `Available` `False` `NotAvailable`, and 1, 1, 1
  and 1 of 3 as its current, ready, available and up to date replicas; the
  TenantControlPlane `Unknown`; the Cluster with 3 desired and 1 of each other
  counter of its control plane, its `ControlPlaneAvailable` and its `Available`
  `False` `NotAvailable`, and its probe `True`. At 1 Pod, an upgrade to
  `v1.37.0` held in the same way, since the rollout of K12, with no replica
  unavailable, needs a Pod beyond the quota and keeps the old one: the
  KamajiControlPlane `ready`, every condition `True`, with 1, 1, 1 and 0 up to
  date, `spec.version` `v1.37.0` after `status.version` `v1.36.4`; the
  TenantControlPlane `Upgrading`; the Cluster `Available` `True`, with no
  `RollingOut` from its control plane. At 0 Pods, the Pods of the tenant then
  deleted, the TenantControlPlane was `NotReady` in 1 s, the KamajiControlPlane
  at 0, 0, 0 and 0 of 1, with "TenantControlPlane in NotReady status, enqueue
  back" and `Available` `False`, and the probe of core failed 49 s later (L23).
  In each, the status of the Deployment, which the TenantControlPlane copies,
  held a `ReplicaFailure` `True` `FailedCreate`, whose message names the quota
  and the Pod that the quota refused, by its name, which ends in a random
  suffix; it kept the text of the first refusal after the Pods that it counts
  had ended. Once a quota was deleted, the rollout went on only after the
  back-off of its ReplicaSet, which no event woke: 54 s after an upgrade held
  two minutes, and 136 s after zero Pods held 2.5 minutes.
- **L25. What settles.** In the scale and in the upgrade held by a quota, ten
  pairs of ten were equal, the three objects at the same versions for the two
  minutes: Kamaji did not write the TenantControlPlane, and the time of its last
  update, under `status.kubernetesResources.deployment`, moved only with a
  change of the status of the Deployment. With zero Pods, nine pairs of ten were
  equal: Kamaji wrote the TenantControlPlane as the deleted Pods ended, its
  `terminatingReplicas` going down for about 30 s, and core wrote the Cluster
  once, as the probe failed (L23); then nothing moved. A plain upgrade, with no
  quota, lasted about 11 s, and eight pairs of ten were equal: core copied the
  surge of the rollout into the Cluster and back (L11), and Kamaji wrote the
  TenantControlPlane once more, some 30 s after the end, as the old Pod ended;
  the three objects were at the same versions together for some 10 s alone,
  between those writes, so that readings 2 s apart catch such a state by chance
  alone. Every change that ended Pods of a tenant was followed by that write of
  `terminatingReplicas`, some 30 s later, once the KamajiControlPlane and the
  Cluster had settled.
- **L26. The controller of Kamaji at 0.** Once the zero Pods held, the
  Deployment of the controller of Kamaji was scaled to 0: its Pod went in 1 s,
  ten pairs of ten were equal, and neither the provider nor core wrote anything.
  Scaled back to 1, it was ready in 11 s, and its first reconcile of the tenant
  wrote nothing. It was not tried in the other holds, where nothing wrote.
- **L27. The generations.** In every settled state, the
  `status.observedGeneration` of the TenantControlPlane equalled its generation,
  and `status.kubernetesResources.deployment.observedGeneration` was the
  generation of its Deployment, one above that of the TenantControlPlane: 2 for
  1, 3 for 2, 4 for 3 and 5 for 4. Kamaji makes the Deployment and updates it
  once more before the status of the tenant settles, then once for each change
  of the spec of the TenantControlPlane. The two were equal only at the start of
  a change: in provisioning, when the TenantControlPlane had no
  `status.observedGeneration` of its own yet; and in the first second of a plain
  upgrade, when its own was one behind. The KamajiControlPlane has no
  `status.observedGeneration`, its conditions observing its generation, or one
  below it once it is deleted; the `status.observedGeneration` of the Cluster
  equalled its generation.
- **L28. A Cluster with no endpoint written.** With no endpoint written in its
  DevCluster and no worker, a Cluster of Kamaji was `Available` `True`, its
  probe included, 37 s after its apply. The development provider made a load
  balancer for it and wrote the address of that load balancer as the endpoint of
  the DevCluster, which the Cluster took (K16, K18), while the endpoint of the
  KamajiControlPlane was that of its tenant; core probed the tenant all the
  same, through the Secret `<cluster>-kubeconfig`, which the provider makes from
  the kubeconfig that Kamaji writes for the tenant
  (provider:resources.go:130-186). The container of that load balancer goes
  with its DevCluster; one whose Cluster was not deleted before the kind cluster
  stayed, until the probe removed it. A Cluster had its first conditions of
  provisioning 4 s after its apply, and one whose tenant got no address had
  `TenantControlPlaneAddressReady` `False` `Pending` 2 s after its own.
- **L29. What the second probe did not reach.** A runner of CI, and captures at
  the same time; a worker, which none of its Clusters had, so neither the states
  of P1 with their worker nor the conditions of the Nodes of a worker past their
  grace (K23); the deadline of progress of the Deployment of a tenant, which
  Kamaji leaves to the default of Kubernetes, 600 s, setting none in the
  Deployment that it builds (kamaji:deployment.go), past which the Deployment
  turns `Progressing` `False` (Kubernetes behavior, not in these sources), the
  holds lasting two minutes; the controller of Kamaji at 0 in the other holds; a
  pause; and the scripts of this extension, which did not run on its objects, so
  that what their cleaning refuses is read in their code against the objects
  saved.

## The host, as probed

What only the running application shows of the host and of the Kamaji extension,
this revision takes from a probe in Freelens 2.1.0, with a page of this
extension made for it, which the repository does not keep. These are its facts,
H1 to H11, each with what was done and what it showed, which the rules cite by
their number. The probe is no test of this spec: the sessions check again, on
the views themselves, the facts that its rules rest on (Tests).

- **H1. What ran.** Freelens dev at `v2.1.0`, with a fresh profile for each
  sequence of steps, seeded with one sync entry, a copy of the kubeconfig of the
  scripts, the Dark theme, and the root page set to 1280 by 900 CSS pixels at a
  scale of 1; the cluster of the definitions, with the fixtures of `healthy`
  and, applied by a server-side apply, the definitions of the TenantControlPlane
  and of the DataStore from the chart of Kamaji at its commit, and that of the
  KamajiControlPlane from the source of the provider at `v0.22.0`, without the
  labels of the release, which no view read in the probe. In a namespace of its
  own: a KamajiControlPlane of one replica at `v1.36.4`, its status written as
  in L9 but with no condition, and a TenantControlPlane of the same name, with
  the label `cluster.x-k8s.io/cluster-name` and an owner reference to it with
  the flags of controller and of `blockOwnerDeletion`, its spec as the provider
  makes it, and its status a few fields written by hand as Kamaji writes them
  once `Ready`: the version `v1.36.4` and its state `Ready`, the counters of its
  Deployment with no condition, its endpoint, the name of the Secret of its
  admin kubeconfig and its DataStore; no controller of Kamaji or of the provider
  ran, and no Secret was made. This extension, at `main` `84855e7` with the page
  of the probe, installed in place, and the Kamaji extension installed from the
  file of its package with its `.sha256` beside it, as S6 installs another
  extension (SPEC-0004, P29). A session with the helpers of the integration
  tests drove the Extensions page of the root frame and the page of the probe
  with real input, and read the list of the enabled extensions in both frames,
  the state that the host saved in the profile, the sidebar, the drawers, the
  address of the frame, the metrics of the API server for `kamaji.clastix.io`,
  and every error that either process logged.
- **H2. The package.** `@freelensapp/kamaji-extension` 2.0.1 from the npm
  registry, 214,815 bytes, SHA-256
  `ace9d244f04af7ddc4fee7b7a914d9f406942e4d6b2e151a44d1f6049aa94fe4`; its
  `dist.integrity` of the registry, a SHA-512, and its `dist.shasum`, a SHA-1,
  both computed again from the file and the same. It holds 8 files,
  `package.json`, `README.md`, `LICENSE` and `dist/`; its `engines` are `node`
  `>= 24.0.0` and `freelens` `^2.0.0`; its one dependency is `yaml`; and it has
  none of the scripts `preinstall`, `install`, `postinstall` and `prepare`. The
  provenance that the registry attaches to it was not checked.
- **H3. The page of the probe.** A page of the cluster that showed
  `Common.App.getEnabledExtensions()`, read in an `observer` of its own, and
  recorded each value that it rendered, with its time, and each value that a
  plain read every 100 ms outside any reaction found; and a `Drawer` of the
  host, open while a parameter of the page said so, holding two links to the
  TenantControlPlane: `Renderer.Component.MaybeLink` to
  `Renderer.Navigation.getDetailsUrl` of its `selfLink`, as P17 builds it, and
  an anchor that called `Renderer.Navigation.showDetails` of it. Neither link
  stopped its click. The button that opened the drawer had to stop its own:
  otherwise the click reached the window, where the `Drawer` of the host, open
  by then, took it for a click outside any drawer and closed at once
  (freelens:drawer.tsx:148-168).
- **H4. Both enabled.** The page printed
  `["@freelensapp/capi-extension", "@freelensapp/kamaji-extension"]`, in the
  order of the installs, the same list as the root frame; the state that the
  host saved held both with `enabled: true`; and the sidebar of the cluster had
  the entries Custom Resources, Cluster API and Kamaji. Freelens dev renders in
  `React.StrictMode`, so the effect of the observer ran twice at the mount, with
  the same value.
- **H5. A disable, an enable, an uninstall.** A disable and an enable on the
  Extensions page reached the page of the probe with no reload: its observer
  rendered the new list 2 to 6 ms before the click on the menu item returned,
  five times out of five, and the plain read saw it in the same milliseconds;
  the saved state turned `enabled` to `false` and back, and the entry Kamaji of
  the sidebar went and came back. A disabled extension stayed out of the list
  after a reload of the frame and after a restart of the application, its row
  "Disabled". An uninstall of the Kamaji extension while enabled took its name
  out of the list at once, 353 ms before the helper that removed its row
  returned, and the list stayed without it after a reload and after a restart;
  the saved state kept its entry with `enabled: false`, which the list leaves
  out, and the same file installed again came back enabled and verified.
  Disabled and then uninstalled, the same: the list without it at once, after a
  reload and after a restart, in two profiles.
- **H6. Loading.** At every install, the Kamaji extension 2.0.1 showed "2.0.1,
  verified" and "Enabled" on the Extensions page, and loaded with no error in
  either process: the collector of the errors of the integration tests reported
  none in any step, and no line that names it was a warning or an error. The
  main process logged `[EXTENSION-DISCOVERY] added extension` and
  `[EXTENSION]: enabled @freelensapp/kamaji-extension@2.0.1`, each frame
  `[EXTENSION]: enabled`, and a disable `deleting extension instance` and
  `disabled` in each.
- **H7. A page of the Kamaji extension while it is disabled.** The address of
  its Tenants page, opened while the Kamaji extension was disabled, sent the
  frame to `/overview` of the host; disabled while that page was open, the frame
  went to `/overview` too, and the watch that the page held ended within 15 s.
- **H8. The details of the host over a drawer.** Both links of H3, the Kamaji
  extension enabled and then disabled, in the same sequence: a click on a link
  opened the details of the host for the TenantControlPlane over the drawer of
  the page, which stayed under them at the same place and size, 725 by 839 px;
  the address kept the parameters of the page and added `kube-details` with the
  `selfLink`. Enabled, the details showed, in this order: the metadata, Created,
  Name, Namespace, Labels, Controlled By, the KamajiControlPlane as a link, and
  Managed Fields; the custom resource section of the host, with the printer
  columns Version, Installed Version, Status, Control Plane Endpoint, Kubeconfig
  and Datastore; the panel of the Kamaji extension, with API Version, Kind,
  Control Plane Replicas, Ready Pods, Control Plane Service Type, Pod CIDRs,
  Service CIDRs, Data Store, Storage Driver and Write Permissions, which hides
  the fields that the printer columns show; and Events. Their toolbar held a
  download icon of the Kamaji extension, its item that saves the kubeconfig of
  the tenant, which reads a Secret (K19), beside the edit, delete and close
  icons of the host; it was never pressed. Disabled: the same details with no
  panel and no download icon. No error in either case. The close icon of the
  host closed its details alone: the drawer of the page showed again, its
  parameter still in the address. One Escape closed both, cleared both
  parameters, and left the focus on the body. The click on a link reached the
  content of the drawer and the window with its default prevented, inside a
  `.Drawer`, so the `Drawer` of the page did not take it for a click outside and
  stayed open, in all four cases.
- **H9. The Tenants page.** At its address (K20), with every namespace selected:
  the title "Kamaji Tenant Control Planes"; the columns, after a checkbox, Name,
  Namespace, Status, Pods, Endpoint, Version, Datastore and Age, and the menu of
  the row; an add button. It listed the TenantControlPlane with its status as
  written, nothing on the page saying that no controller ran. A label set with
  kubectl while the page was open showed nowhere on it: no column holds labels,
  and its search for the value of the label left no row, "No items found", while
  a search for the name kept it. A click on the name opened the details of the
  host, whose Labels showed it, the panel of the Kamaji extension below the
  custom resource section; a click on the first cell, the checkbox, selected the
  row and opened nothing. Its Datastores page showed "Kamaji Datastores", the
  columns Name, Driver, Endpoints, Ready, Used By and Age, and no item.
- **H10. The requests of the Kamaji extension.** From the metrics of the API
  server, before and after windows of 5 to 30 s: the Kamaji extension listed
  TenantControlPlanes at `v1alpha1` over the whole cluster once, every namespace
  being selected, and kept one watch, while its Tenants page was open, and
  DataStores in the same way while its Datastores page was open; it requested
  nothing of `kamaji.clastix.io` while its pages were closed, nothing from its
  panel in the details of the host in 30 s, and nothing once disabled or
  uninstalled, after a reload and after a restart too. No request of the
  application was answered with a refusal, a throttling or an error. Two watches
  of the group over the whole cluster, one for each kind, were open before
  Freelens dev first connected the cluster and stayed open throughout: those of
  another client of the API server, whose metrics count every client, so that
  the requests are told apart by the gauge of the watches and by their timing.
- **H11. What the probe did not reach.** Freelens 2.0.0, which this extension
  does not support; an extension enabled but not loaded, or not compatible; the
  tree of SPEC-0005, and so the details of the host over the drawer of a node,
  which SPEC-0005, H20 probed for a DevCluster; the reads of P16 and the row
  Tenant, which are not written yet; the menu item that saves a kubeconfig,
  never pressed, the panel of a DataStore and the dialog that creates a tenant;
  an identity other than that of kind, so no refusal; which client sent each
  request; the provenance of the package; a packaged Freelens, since only
  Freelens dev ran; and other themes and widths than the dark theme at 1280
  by 900.

## Design

### No new view

The task is the one of SPEC-0004 and SPEC-0005: notice the Clusters that are not
healthy, understand one, and find the part that carries it (SPEC-0004, "A list
with its details, and why"; SPEC-0005, "Why a tree"). A Cluster with a control
plane of another provider is one more Cluster of those views. So this spec adds
no page, panel or menu item: the list and the details stay the standard view of
SPEC-0004, and the tree the ad hoc view of SPEC-0005, and this spec gives them
the rows and the words that such a control plane needs (kit, `docs/process.md`,
"The design question every spec answers"). The way to the tenant is a link to
the details of the host, where the Kamaji extension shows its panel (P17), as an
object of a provider is linked (SPEC-0001, A6).

### What the views show today

The views of SPEC-0004, at `main`, read a KamajiControlPlane through the generic
contract, and no fixture holds one (ROADMAP.md, "Changes of scope"). Read in the
code, with the facts above:

| Part                          | What it shows today                                                                                                                                                                                                                                                                                                                                                   | Why                                                                                                                                  | This spec                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| The reference                 | Resolved to `v1alpha2`, a link to the details of the host                                                                                                                                                                                                                                                                                                             | K2; L2; SPEC-0004, P3, P18                                                                                                           | Unchanged                |
| The health                    | Unknown before `Available` is written; Healthy with `Available` and every tracked condition `True`; Unhealthy while it scales up, 9 to 12 s, for under a second while it scales down, at 0 replicas and while it comes back from 0, never while it upgrades; Degraded when a reconcile fails a step after an `Available` `True`, as for a version that Kamaji refuses | K5, K6, K11; L7 to L14, L24; `src/common/status/providers.ts:186-202`                                                                | Unchanged: SPEC-0003, D1 |
| The activity                  | Provisioning until it is initialized; Upgrading from its versions, also for a version that Kamaji refuses; Paused from its request or its condition; Deleting, alone; Unknown next to the others, for it and for its Cluster, with no note that says why                                                                                                              | K5, K17; L12, L15, L17; `src/common/status/activity.ts:1079-1144, 1030-1077, 1279-1289, 1308-1316`; SPEC-0003, P1, P19               | P9                       |
| The counters                  | The available of the desired, as `1/1`, or `N/A/1` before the control plane writes its counters, and in the tooltip and the details each counter in Machines, where they count the Pods of the tenant, the surge of an upgrade included                                                                                                                               | L7 to L11, L17; `src/common/views/cluster-cells.ts:43-89`; `src/renderer/details/cluster-details-v1beta2.tsx:551-571`; SPEC-0004, P8 | P10                      |
| The version, with no topology | N/A for good, "Control plane: N/A, not written yet", as the printer column of the project, which is empty                                                                                                                                                                                                                                                             | K4, K16; L17; `src/common/views/cluster-cells.ts:130-146`; SPEC-0004, P9                                                             | P11                      |
| The tree                      | As SPEC-0005 specifies it, built at `main` `48784f5` by `src/common/views/cluster-tree.ts`, its page not on `main` yet: the control plane a leaf, with no Machine, and no template, since `controlPlaneTemplateOf` gives no reference without `spec.machineTemplate`; the tenant read nowhere                                                                         | K3, K15; `src/common/views/references.ts:244-266`; SPEC-0005, P6, P7                                                                 | P13                      |
| The tenant                    | Nothing leads to it                                                                                                                                                                                                                                                                                                                                                   | K8                                                                                                                                   | P14 to P17               |
| A tenant in another cluster   | Visible only through the KamajiControlPlane                                                                                                                                                                                                                                                                                                                           | K9                                                                                                                                   | P14, P17; SPEC-0011      |

The health stays as the project reports it. A KamajiControlPlane whose tenant
scales up is Unhealthy until the new replicas are ready, since Kamaji calls that
rollout `Unknown` and the provider then reports `Available` `False` (K6, K11;
L10, L24); one scaled to 0, or with no replica ready, is Unhealthy, since such a
tenant is not ready for the provider (K6, K11; L13, L14, L24). The health is
always the verdict of the project, never held while a change is in flight
(SPEC-0003, D1), and the kit forbids a health held without a bound (kit,
`docs/design.md`, "Status"): the captures of `kamaji-scaling`,
`kamaji-sleeping` and `kamaji-not-ready` show it (P1), and the details show
the message of `KamajiControlPlaneIsReady`, which names the state of the tenant
(K6). Nothing is proposed for it.

### The fixtures

**P1.** Proposed: the fixtures of a Cluster with a KamajiControlPlane are nine
sets, each a state that the probes reached and that the views of M1 tell apart,
captured from the provider (P2 to P7). What each shows is what the probes saw
(L7 to L17, L22 to L25) and the code read gives; the capture decides, and the
tables of the tests are written from the captured sets, never from this table
(Tests). Every KamajiControlPlane of the sets has one replica, where the kind
defaults two, and its Service of type `LoadBalancer`, the default, as both
probes made theirs (K3; L8 to L10, L21); and it names the two addons that the
KamajiControlPlane of the first probe named, which the kind does not default, so
that a worker joins its tenant as that worker joined (K3; L4): CoreDNS, with the
address of its Service in the service network of the Cluster, and kube-proxy:

| State                    | Namespace                              | How the job brings the provider into it, and holds it there                                                                                                                                                                                                                                                                                                                                                                       | What the views tell apart                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kamaji-provisioning`    | `freelens-capi-kamaji-provisioning`    | A Cluster with a KamajiControlPlane and no worker, whose tenant gets no address: within the same capture, a helper Cluster of Kamaji of the scripts, in a namespace of its own, takes the one address of the pool first, as both probes held the state (L8, L21); its DevCluster has no endpoint written, so the development provider gives it its load balancer (L8, L28); it holds as long as the helper keeps the address (P5) | The control plane Unknown, with no `Available`, `TenantControlPlaneAddressReady` `False` `Pending`, Provisioning, `N/A/1` (P10), its version N/A, not written yet (P11); its Cluster Unhealthy and Provisioning (L8, L17, L22)                                                                                                                      |
| `kamaji-healthy`         | `freelens-capi-kamaji-healthy`         | A Cluster with a KamajiControlPlane at `v1.36.4`, its DevCluster with the endpoint of the tenant written (P4), and one worker, a MachineDeployment at `v1.36.4` with kindnet, once every condition is at its normal value, the Node of the worker is ready, and core has copied the counters of the control plane into the Cluster (L4, L9, L11)                                                                                  | Healthy; `1/1` in replicas (P10); the version that the control plane reports, `v1.36.4` (P11); the activity Unknown with its cause (P9); the tenant (P17); the worker, as for any Cluster                                                                                                                                                           |
| `kamaji-scaling`         | `freelens-capi-kamaji-scaling`         | From `kamaji-healthy`, a ResourceQuota of the scripts of one Pod, the one that the tenant has, then three replicas through the subresource `scale`, which the quota holds (L24)                                                                                                                                                                                                                                                   | Unhealthy, `NotAvailable`, `1/3`, and `KamajiControlPlaneIsReady` `False` `Failed` with the state `Unknown` of the tenant (L24)                                                                                                                                                                                                                     |
| `kamaji-upgrading`       | `freelens-capi-kamaji-upgrading`       | From `kamaji-healthy`, the same quota, then `spec.version` `v1.37.0`: the quota keeps the Pod that the rollout adds from being made, and holds the upgrade, which settles (K12; L24, L25)                                                                                                                                                                                                                                         | Healthy and Upgrading, `spec.version` after `status.version` `v1.36.4`, the old version still shown (P11), no replica up to date (L24)                                                                                                                                                                                                              |
| `kamaji-version-refused` | `freelens-capi-kamaji-version-refused` | From `kamaji-healthy`, `spec.version` `v1.38.0`, which the webhook of Kamaji refuses to the provider (K22; L3, L12); it holds by itself                                                                                                                                                                                                                                                                                           | Degraded, from `TenantControlPlaneCreated` `False` `Pending` with `Available` `True`; the mark Older generation, its `Available` observing the generation before the change (K6; SPEC-0003, "Freshness"; `src/common/status/providers.ts:197`); and Upgrading, `spec.version` after `status.version`, as the project reads it (K17; SPEC-0003, P28) |
| `kamaji-sleeping`        | `freelens-capi-kamaji-sleeping`        | From `kamaji-healthy`, `spec.replicas` 0, which Kamaji keeps `Sleeping` (K11; L13); read once every controller has reported: the probe of core failed (L23) and, past their grace, the Node conditions of its worker Machine `Unknown` `ConnectionDown` (K23; P5)                                                                                                                                                                 | Unhealthy at `0/0`, `KamajiControlPlaneIsReady` `False` with the state `Sleeping`, and the mark of SPEC-0003, P25 on the control plane and on the objects of the workers (K23; L13, L23)                                                                                                                                                            |
| `kamaji-not-ready`       | `freelens-capi-kamaji-not-ready`       | From `kamaji-healthy`, a ResourceQuota of the scripts of zero Pods, then the Pods of the tenant deleted, so that its Deployment has no ready replica and can make none (K11; L24); read as `kamaji-sleeping` is read (P5)                                                                                                                                                                                                         | Unhealthy at `0/1`, `KamajiControlPlaneIsReady` `False` with the state `NotReady`, and the mark of SPEC-0003, P25, as on `kamaji-sleeping` (K23; L23, L24)                                                                                                                                                                                          |
| `kamaji-paused`          | `freelens-capi-kamaji-paused`          | From `kamaji-healthy`, `spec.paused` of the Cluster, read before any event of the KamajiControlPlane, which then has no `Paused`, as P5 says (K5; L15, L25)                                                                                                                                                                                                                                                                       | The Cluster Paused, and its control plane Paused from its request, with no time (SPEC-0003, P19)                                                                                                                                                                                                                                                    |
| `kamaji-deleting`        | `freelens-capi-kamaji-deleting`        | From `kamaji-healthy`, the Cluster deleted, after its KamajiControlPlane got the finalizer of the scripts, `test-environment.freelens.app/fixture`, which holds it; read once the worker is gone (L16, L22)                                                                                                                                                                                                                       | The Cluster Deleting at `WaitingForControlPlaneDeletion`, its workers gone; the control plane deleting, with no health, its status the last that the provider wrote, `Available` `True`, and the mark Older generation, its deletion a change that the provider, writing nothing on it, never observes (L16, L22, L27)                              |

Every state has a DevCluster as the infrastructure cluster of its Cluster (P4).
Every state but `kamaji-provisioning` is made with one worker, a
MachineDeployment of the development provider with kindnet, which joins its
tenant as the worker of the probe joined (L4), so that the views show a Cluster
of Kamaji with its workers, as any Cluster; every set holds it but those of
`kamaji-provisioning` and of `kamaji-deleting`, read once it is gone, so seven
sets hold a worker. The second probe made its Clusters with no worker, to hold
and read the states of the control plane alone (L21): the objects of a worker
settle with their Cluster, and the readings of P5 take them with the others,
two readings agreeing on every object of the namespace. The provider makes no
Machine of the control plane (K15). These states are not captured, each for its
reason:

- **The provisioning of L7**, the flow in which the tenant gets its address: it
  gives the marks of `kamaji-provisioning` with no condition `False`, and
  changes within seconds as the tenant comes up (L7).
- **The other pauses**: the condition `Paused` that the provider writes at an
  event of the KamajiControlPlane, which stays after its Cluster is resumed, and
  the annotation on the KamajiControlPlane itself, for which it writes none
  (L15). Unit cases write them, from `kamaji-paused` and from `kamaji-healthy`,
  the field that each changes said in it.
- **A deletion while the workers go**: the set `deleting` of SPEC-0002 shows a
  Cluster whose workers go, and with Kamaji it lasts the 13 s of L16.
- **A scale and an upgrade with no quota, and the way back from 0** (L10, L11,
  L14, L25): they pass in seconds, and readings 2 s apart catch them by chance
  alone; `kamaji-scaling`, `kamaji-upgrading` and `kamaji-not-ready` hold what
  the views tell apart of them.
- **A tenant in another cluster** (K9): SPEC-0011. A unit case writes
  `spec.deployment.externalClusterReference` on the KamajiControlPlane of
  `kamaji-healthy`, for the row of P17.

The reasons: the kit asks each static object to cover a state that the views
tell apart, and to carry only what the controller writes in it (kit,
`docs/testing.md`, "The test environment has two tiers"); a state written by
hand would be a second exception to the rule of SPEC-0002, which writes one set
by hand alone, and says so in its file (SPEC-0002, "Design"). The nine states
give the views every health, Degraded included, every activity that such a
control plane can show, Provisioning, Upgrading, Paused, Deleting and Unknown,
its counters written and not, the version of its Cluster as P11 reads it, the
mark of SPEC-0003, P25, and the mark Older generation (L7 to L17, L22 to
L25).

**P2.** Proposed: the captures run on a kind cluster of their own,
`freelens-capi-kamaji`, which `pnpm e2e:cluster:up:kamaji` creates as the
scripts create the cluster of the real project, with the socket of Docker and
the same checks before every request (TESTING.md, "Safety"), on Linux on amd64
alone, where the scripts can set the kernel of the host as P3 asks and the
pinned helm runs (P3): its commands refuse any other system or processor and
name the one that they found, as the scripts refuse a system on which they do
not run (`e2e/scripts/host.mts:28-34`); `pnpm e2e:cluster:down` deletes it, with
the containers of its workload clusters, and gives the setting of P3 back the
value that it had. Not on the cluster of the real project: its checks refuse a
provider at another release than the pins of Cluster API, in `up`, in a capture
and in the tests of the real tier (`e2e/scripts/commands.mts:537-553`), and the
release of the provider is `v0.22.0` ("Upstream reference"); and the demo stays
as `up` makes it.

**P3.** Proposed: the cluster of the captures installs what the probes
installed (L1, L21), in this order, each file that the scripts download checked
against its SHA-256 in the pins before its use, as every file of the scripts
(TESTING.md, "The pins"):

1. kind at the version of the integration workflow, with the node of
   `managementKubernetes` of the pins, as the other kind clusters (TESTING.md,
   "The test environment");
2. Cluster API at `v1.14.4` with the pinned clusterctl, from the local
   repository of checked files that the scripts write, as for the real project
   (TESTING.md, "The real project"): the core, the kubeadm bootstrap and control
   plane providers and the development provider, the four of `PROVIDERS`
   (`e2e/scripts/manifests.mts:145-160`), which bring cert-manager at the
   version of the pins. All four, though no Kamaji state holds a
   KubeadmControlPlane: clusterctl adds the kubeadm control plane provider by
   itself only when no control plane provider is named
   (cmd/clusterctl/client/init.go:284-295), and a capture reads a namespace
   through the kinds of the fixtures, those of that provider among them, in one
   `kubectl get` that a kind that the cluster does not serve would make fail
   whole (P6);
3. MetalLB `v0.15.2`, its `metallb-native.yaml`, then a pool of one address of
   the network of kind and an L2 advertisement, objects of the scripts, the pool
   applied again until the webhook of MetalLB answers (L1): the address of every
   tenant, known before the tenant exists (P4);
4. Kamaji at `26.9.3-edge`, with the pinned helm, from the files of its chart at
   the commit of that tag, since the version of the chart, `0.0.0+latest`, names
   no release (K14): each file downloaded at that commit and checked against its
   digest, as the scripts take the files of the source of Cluster API
   (`e2e/scripts/downloads.mts:38-48`), where the probes took the chart by a
   clone checked against the commit (L1); then, as the probes did,
   `helm dependency build`, which downloads the subchart `kamaji-etcd` at
   `0.15.0`, the version that its `Chart.lock` names (K14), from the repository
   that the lock names, and the scripts check the downloaded archive against its
   pin before the install (L1); installed with the image of the tag,
   `image.pullPolicy` `IfNotPresent`, the telemetry of the chart disabled, so
   that a capture sends nothing out, and `resources` unset, as the probes
   installed it, with the DataStore `default` that it brings (L1); the scripts
   then wait for its Deployment and its DataStore;
5. the Kamaji control plane provider at `v0.22.0`, with
   `clusterctl init --control-plane kamaji:v0.22.0` from that local repository,
   which holds its `control-plane-components.yaml` and its `metadata.yaml` of
   the release, with the gate of P4; after Kamaji, so that it watches the
   TenantControlPlanes that it owns (K8; L1); the scripts then wait for its
   Deployment, since clusterctl returns before its image is pulled (L2);
6. on the host, before any worker joins, `net.netfilter.nf_conntrack_max` at the
   value that kube-proxy computes, 32768 for each processor and 131072 at least,
   with `sudo -n sysctl`, as the scripts raise the limits of inotify
   (`e2e/scripts/commands.mts:369-400`): without it no worker became Ready on
   the machine of the probe, the kube-proxy of the tenant failing to write it
   from the container of the worker (L4); whether the kernel of a runner lets
   it, no probe tried (L20), and the scripts set it there all the same.

The pins hold, besides those of SPEC-0002:

| What                              | Version                                                          | File, and where it comes from                                                                        | SHA-256                                                            |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| The Kamaji control plane provider | `v0.22.0`                                                        | `control-plane-components.yaml`, an asset of the release                                             | `b038237c4dfe0890e4fc90cc905ab33247b0680bc96e103f6d42b9553d63aa8d` |
| The Kamaji control plane provider | `v0.22.0`                                                        | `metadata.yaml`, an asset of the release                                                             | `281b1b1922dff2bea51db25373e28a9f9d5bb35d8393b22c0031a412057b7061` |
| MetalLB                           | `v0.15.2`                                                        | `config/manifests/metallb-native.yaml` of `metallb/metallb` at the tag                               | `a1b04c376fb39c93265f551fe23716a3ae6e09b790edb3bf257d3fc784c35a18` |
| helm                              | `v3.19.0`                                                        | `helm-v3.19.0-linux-amd64.tar.gz` from `get.helm.sh`, which publishes its `.sha256sum` beside it     | `a7f81ce08007091b86d8bd696eb4d86b8d0f2e1b9f6c714be62f82f96a594496` |
| The chart of Kamaji               | `26.9.3-edge`, commit `0ac808bf990a29ff22e397d90d680c45b84d53e2` | each file of `charts/kamaji` at the commit, the definitions of the first tier among them (P8)        | the digest of each, which the pull request records                 |
| `kamaji-etcd`                     | `0.15.0`, as `Chart.lock` names it                               | `kamaji-etcd-0.15.0.tgz` from `https://clastix.github.io/charts`, the repository that the lock names | `b8e88d5f535c0d328b46a3ffb5b543d0056e9370cb503e5a11e998d1f555f209` |
| The Kamaji extension (P18)        | `2.0.1`                                                          | the package `@freelensapp/kamaji-extension` from the npm registry                                    | `ace9d244f04af7ddc4fee7b7a914d9f406942e4d6b2e151a44d1f6049aa94fe4` |

The digests of the table are those of the files that the probes downloaded and
checked (L1, H2); those of the files of the chart, which the probes checked by
the commit of their tag alone (L1), the pull request computes from the files at
that commit. It records every digest from the records of each project, as
TESTING.md says of every pin ("The pins"), and `pnpm e2e:pins:check` checks
them. The pin of helm is for Linux on amd64 alone, the system and the processor
of the runner of P7, on which alone the cluster of the captures runs (P2). The
images that the manifests and the chart name are pulled by their tags, as the
images of SPEC-0002 are (SPEC-0002, "Notes and deviations"). A rule of Renovate
follows none of them: they change with the spec that reads them again, as the
provider and Kamaji do.

A capture checks the providers of that cluster as SPEC-0002 checks those of the
real project (`e2e/scripts/commands.mts:537-553`): `PROVIDERS`, and the Kamaji
control plane provider at its pin, `v0.22.0`, and nothing else; one of them
missing, or at another release, refuses the capture, as on the real project.

The tenants run the versions of the pins for workload clusters, as the probes
ran them: each Kamaji Cluster, its tenant and its worker, is made at
`workloadKubernetesUpgradeFrom`, `v1.36.4`, and `kamaji-upgrading` upgrades its
tenant to `workloadKubernetesVersion`, `v1.37.0` (L3, L4, L11, L21, L24).
Kamaji admits both, and refuses `v1.38.0`, which `kamaji-version-refused` asks
for (K22; L3). No other version is needed, and none is pinned for Kamaji.

**P4.** Proposed: the Cluster of every state names a DevCluster of the
development provider as its infrastructure cluster, and the provider runs with
its gate `SkipInfraClusterPatch`, through `CACPPK_SKIP_INFRA_CLUSTER_PATCH`
(K7), as the probes ran it (L5, L21). A Cluster with no infrastructure cluster
is never reported available (K16), so it would show no healthy state; the
provider patches no DevCluster, a kind that its list does not hold, and stops on
it without a gate (K7); the gate leaves the DevCluster to its own provider,
which provisions it, and asks nothing of the provider but a variable of its
components, where `DynamicInfrastructureClusterPatch` needs a role that the
release does not ship (L5). The DevCluster of every state but
`kamaji-provisioning` is made with its endpoint written, the one address of the
pool and the port of the tenant, so that the endpoint of its Cluster is the
address of its tenant: the development provider fills an empty endpoint with its
own load balancer (K18), which core copies into the Cluster first (K16), and
which a worker would join (L4). With no worker, a Cluster whose DevCluster has
no endpoint written still becomes available, its endpoint that load balancer,
core probing the tenant through the kubeconfig that the provider makes (L28):
the endpoint is written for the worker alone. The address is known before the
tenant exists, the pool having one (P3), so the captures that give their tenant
an address run one at a time (P5). The DevCluster of `kamaji-provisioning`,
whose tenant gets no address and which has no worker, has none written, and its
Cluster takes the load balancer of the development provider, as both probes saw
it (L8, L28), which the README of the set says. No view reads more into an
endpoint than the row Endpoint, as written (SPEC-0004, "The details").

**P5.** Proposed: the states are reached and held as the table of P1 says, one
capture at a time, as P4 asks, each read once two readings agree, as SPEC-0002
reads its own (TESTING.md, "Capturing them again"), and once every controller
that reports on the state has reported, as the kit asks of a capture (kit,
`docs/testing.md`, "The test environment has two tiers"), after the waits that
the probes needed. A state that does not hold as this rule says fails its
capture, which writes no set (TESTING.md, "Capturing them again"): its wait
stops the capture at once when the state can no longer be reached
(`e2e/scripts/states.mts:290-291, 314-316`), and at its deadline while the check
of the state fails (:333-342); a state that passes its check while its objects
keep changing is read again with no deadline of its own (:317-331), until the
limit of the job cuts the run (P7). The waits:

- the Deployment of each controller that the cluster of the captures installs,
  and the webhook of MetalLB, which answers after its Deployment (L1, L2);
- for `kamaji-provisioning`, before the Cluster of the state is applied, the
  KamajiControlPlane of the helper Cluster of the scripts with
  `TenantControlPlaneAddressReady` `True`, its tenant holding the one address of
  the pool (L7, L8, L21);
- for `kamaji-healthy` and every state that starts from it, the Cluster
  `Available` `True`, the Node of its worker ready, every condition at its
  normal value, as SPEC-0002 waits for `healthy` (TESTING.md, "Capturing them
  again"), and the counters of the control plane in the status of the Cluster
  equal to those of the KamajiControlPlane, which core copies some seconds after
  the control plane settles (L9, L11);
- for a state reached by a change that ends Pods of the tenant,
  `kamaji-sleeping` and `kamaji-not-ready`, no Pod of the tenant still ending:
  the `terminatingReplicas` of its Deployment, which the TenantControlPlane
  copies, at 0 or absent, since Kamaji writes it once more some 30 s after the
  change (L25);
- for `kamaji-sleeping` and `kamaji-not-ready`, whose tenant stops answering,
  the probe of core failed, `RemoteConnectionProbe` `False` with the words of a
  probe that failed after a success (K23), which came some 50 s after the change
  (L23); and then, past their grace, five minutes by default from the last probe
  that succeeded, the conditions `NodeReady` and `NodeHealthy` of the worker
  Machine `Unknown` `ConnectionDown`, with the time of that probe in their
  message, which core writes at the end of the grace, its cache of the cluster
  waking the Machine controller, both with one time, that of the message of the
  Cluster (K23), and the objects of the worker that sum them up after it. So the
  sets hold what every controller reports of a tenant that no longer answers,
  and the views show the mark of SPEC-0003, P25 (P1); the capture moves the time
  inside the messages of those conditions of core (P6). No other time of core
  comes into a text of these states: core writes one in three other places
  alone, a drain, a wait for the detach of volumes and the `spec.rollout.after`
  of a MachineDeployment, which these states do not reach, no Machine of theirs
  being deleted and no MachineDeployment of theirs having that field (K23); and
  a capture refuses any other time inside a text before it writes a set
  (`e2e/scripts/commands.mts:971-973`). No probe had a worker past that grace
  (L29): the second probe saw the Cluster of such a state, with no worker, hold
  still once its probe had failed (L23), and the code of core gives what the
  objects of a worker then hold (K23). The grace makes each of these two states
  wait some five minutes after its change, and so the job some ten minutes
  longer, the captures running one at a time (P7).

Four states hold by themselves: `kamaji-healthy`; `kamaji-sleeping`, which
Kamaji keeps `Sleeping` (K11), the time of its failed probe not moving (L23);
`kamaji-version-refused`, whose update the webhook of Kamaji keeps refusing
(L12); and `kamaji-paused`, for its readings. The provider writes `Paused` only
at an event of the KamajiControlPlane, of a Secret that it owns or of its
tenant, its channel of events being fed only under gates that P4 leaves off, and
watches no Cluster (K5); it reconciles a KamajiControlPlane again by itself only
while a step waits or fails, its tenant not ready among them
(provider:controller.go:200, 255-267, 290, 333, 372, 382; K6); and in a state
that had settled, nothing wrote the KamajiControlPlane or its TenantControlPlane
in the two minutes that the second probe watched each hold (L25), as the
KamajiControlPlane of the first probe had no `Paused` 70 s after the pause of
its Cluster, with no event of its own (L15). The readings of `kamaji-paused`,
taken once every controller but the provider has reported the pause, some
seconds after it, the provider being the one controller that this state holds
from reporting it, fall well inside that window; a `Paused` that its
KamajiControlPlane gets meanwhile ends the state, and its wait then stops the
capture, as the wait of a state that can no longer be reached does.
`kamaji-provisioning` holds as long as its tenant gets no address, which the
helper Cluster ensures: within the one capture of that state, the scripts make
first a helper Cluster of Kamaji with no worker, in a namespace of its own,
whose tenant takes the one address of the pool, then the Cluster of the state,
whose tenant waits for one, as both probes held the state (L8, L21); the capture
reads the namespace of the state alone, and deletes both Clusters, so that the
captures still run one at a time. `kamaji-scaling`, `kamaji-upgrading` and
`kamaji-not-ready` hold by a ResourceQuota of the scripts on Pods, made in the
namespace of the state before the change, that allows the one Pod that the
tenant has then, or none for `kamaji-not-ready`, whose Pods the scripts then
delete: the Deployment of the tenant cannot make the Pods of the change, so
Kamaji keeps its rollout in progress, or its tenant with no ready replica (K11),
and, once it settled, nothing wrote the three objects in the two minutes that
the second probe watched each hold, nor, in the hold of zero Pods, when the
controller of Kamaji was stopped and started again, Kamaji making no other Pod
in that namespace (L24 to L26), as `sleep 150` and the hooks of the scripts make
the states of SPEC-0002 last (TESTING.md, "Capturing them again"). A hold longer
than the deadline of progress of the Deployment of the tenant, 600 s by default,
which Kamaji does not set, was not seen (L29): every state held by a quota is
read well within it, `kamaji-not-ready` some five minutes after its change. The
capture never lifts a quota within a state, since the rollout would go on only
after the back-off of its ReplicaSet (L24). `kamaji-deleting` holds by the
finalizer of the scripts on its KamajiControlPlane (L16, L22), which the capture
removes, as it removes its hooks, before it deletes the workload cluster
(`e2e/scripts/commands.mts:1012-1058`). The README of each set says how its
state was held, and the capture deletes the quota with the workload cluster.

**P6.** Proposed: a capture of a Kamaji state reads the kinds of the fixtures of
SPEC-0002 (`e2e/scripts/fixtures.mts:31-62`) and
`kamajicontrolplanes.v1alpha2.controlplane.cluster.x-k8s.io` and
`tenantcontrolplanes.v1alpha1.kamaji.clastix.io`; never a Secret, a ConfigMap, a
Deployment, a Service or a Pod, and never the DataStore, which has no namespace
(K10; TESTING.md, "The fixtures"). The scripts name the two kinds of Kamaji on
the two clusters that serve them, the cluster of the captures and the cluster of
the definitions (P8), and on no other: `kubectl get` refuses a list that names a
type that the server does not serve (kubectl behavior, not in these sources),
and the scripts read a namespace with one `kubectl get` over all the kinds
(`e2e/scripts/states.mts:268-275`), which would then read nothing. They name
them there in the three places that read a namespace: the apply of the fixtures,
which writes each status onto the object that it reads back
(`e2e/scripts/commands.mts:1420-1429`); their removal, which removes the
finalizers of every object that it reads, those of Kamaji on a
TenantControlPlane included (`e2e/scripts/commands.mts:1350-1363`; K10; L16);
and the round trip, which compares what it reads
(`e2e/scripts/commands.mts:1464-1467`).

It cleans each object as SPEC-0002 cleans it: what the API server adds left out,
every time as its offset from the moment of the capture, every generation as its
distance from those that its status observed, every owner in the set and no time
inside a text, each checked (TESTING.md, "The fixtures", "Capturing them
again"), with these changes, each a case of the tests of the cleaning (Tests):

- **The times of the probe of core.** Once its probe of a workload cluster has
  failed after a success, core writes the time of the last probe that succeeded
  in two messages: `Remote connection probe failed, probe last succeeded at` and
  a time, in the `RemoteConnectionProbe` of the Cluster and on the line of that
  condition in the message of its `Available` (K23; L23); and
  `Last successful probe at` and a time, in the `NodeReady` and the
  `NodeHealthy` of a Machine past their grace (K23). Each is matched by its own
  words, wherever a message holds them, those that repeat them included, and its
  time moves as the time of a field moves, in a capture and on the first tier
  alike. That time, the same in both, is that of the last probe that succeeded
  (K23), which did not move while the probe kept failing (L23), so the set holds
  still. Every other time inside a text is still refused
  (`e2e/scripts/fixtures.mts:160-166`). `kamaji-sleeping` and `kamaji-not-ready`
  hold those words, which no set of SPEC-0002 holds. It changes SPEC-0002
  ("Changes to the approved specs").
- **The generations of a TenantControlPlane.** The rule on generations reads its
  own `status.observedGeneration` alone, and keeps as captured every other
  `observedGeneration` of its status, that of its Deployment, under
  `status.kubernetesResources.deployment`, and those of the conditions of its
  Service (K10). The first is the generation of the Deployment, one above that
  of the TenantControlPlane in every settled state (L27): the rule as it stands
  would refuse every TenantControlPlane, as an object that observed a
  generation after its own (`e2e/scripts/fixtures.mts:230-267`). Its own
  `status.observedGeneration` equalled its generation in every settled state
  (L27). The KamajiControlPlane follows the rule as every object, its
  conditions observing its own generation (K5; L27), and so does the
  Cluster.
- **The checksums.** Every `checksum` in the status of a TenantControlPlane, of
  a Secret or of a ConfigMap (K10), gets one fixed value, as the capture
  replaces the identifier of a boot (`e2e/scripts/fixtures.mts:269-273`): they
  are made from the content of Secrets and of ConfigMaps, which no fixture
  holds, and nothing reads them; the names of those Secrets and ConfigMaps stay,
  as names.
- **The name of a refused Pod.** The message of the `ReplicaFailure` of the
  Deployment of a tenant that a quota holds names the Pod that the quota
  refused, by a name with a random suffix, the same while the state holds
  (L24): it is kept as captured, as the names that the controllers generate
  are, and a new capture changes it.
- **The machine of the capture.** The statuses of the Kamaji kinds and of the
  Cluster hold addresses, the endpoint of the tenant and the address of its
  Service, from the pool of P3, and the endpoint of the DevCluster: each one of
  the network of kind of the run, as those of the development provider are. The
  capture keeps them as SPEC-0002 keeps those, and replaces what the machine of
  the capture tells of itself as SPEC-0002 replaces it, the kernel, the boot and
  the swap of the Nodes of the worker Machines and the capacity of the machine
  templates, so that no set names anything of that machine (TESTING.md, "The
  fixtures"; kit, `docs/testing.md`, "The test environment has two tiers").

Each set is a folder of `integration/fixtures/` named as its state, as
`integration/fixtures/kamaji-healthy/`, with a YAML file for each kind of its
objects, as every set has (TESTING.md, "The fixtures"): `cluster.yaml`,
`devcluster.yaml`, `kamajicontrolplane.yaml` and `tenantcontrolplane.yaml`, and,
for a state made with a worker, the files of the objects of the worker that its
namespace still holds when it is read: its MachineDeployment, MachineSet,
Machine, DevMachine and KubeadmConfig, their templates, and the
ClusterResourceSet of kindnet with its binding. The README of each set, written
by the scripts, says how its state was reached and held; the versions of Cluster
API, of the provider, of Kamaji, and of Kubernetes of the tenant and of the
worker, as the README of every set says its own
(`integration/fixtures/healthy/README.md:10-12`); the endpoint of P4; the run of
CI that captured it; the SHA-256 of each YAML file of the set as the capture
wrote it; and the row that `clusterctl describe cluster` printed for its
Cluster. The scripts run that command with the pinned clusterctl, no check of a
newer version and no terminal, as SPEC-0004 runs it (SPEC-0004, "With the real
project"), right after the second reading, and read the namespace a third time:
when an object changed meanwhile, the readings start again, so that the row is
that of the moment of the set, two runs a second apart having differed while a
state changed (L22). Of its output they keep the six cells of the row of the
Cluster alone, REPLICAS, AVAILABLE, READY, UP TO DATE, STATUS and REASON, as
the session of the real tier reads them
(`integration/__tests__/real-project-checks.ts:13-53`), which hold no time and
no address: SINCE, an age, and MESSAGE, which holds the time of a failed probe,
are left out (L22). They read each cell by the column that the line of the
header names, so that a cell that clusterctl leaves empty, as the counters of
`kamaji-provisioning`, stays empty, and they find the row of a deleting Cluster
by its name after `!! DELETED !!` (L22), where the parser of the real tier,
which splits a row at its spaces, leaves a row with an empty cell unread
(`integration/__tests__/real-project-checks.ts:31-53`). A unit case compares
them with the details (Tests): the kit compares what a view says with what the
tool of the project reports (kit, `docs/testing.md`, "Domain correctness"), and
no job runs the provider after the capture.

**P7.** Proposed: the capture runs in CI, in a workflow of its own,
`kamaji-capture.yaml`, which runs only when it is dispatched, on a branch made
for it, and never on a pull request, on `main` or at night: on `ubuntu-24.04`,
an amd64 runner, the processor of the machine of the other captures (SPEC-0002,
"Notes and deviations"). It runs `pnpm e2e:cluster:up:kamaji` (P2, P3), captures
the Kamaji states with `pnpm e2e:fixtures:capture:kamaji all`, one at a time
(P5), prints the SHA-256 of each file that it wrote, uploads the folders of the
Kamaji sets as an artifact of the run, and then runs `pnpm e2e:cluster:down` and
checks that no kind cluster and no container of the scripts is left.
`pnpm e2e:fixtures:capture:kamaji` takes the Kamaji states, named or `all`, on
the cluster of the captures alone; `pnpm e2e:fixtures:capture all`, on the real
project, leaves them out, and says so, as it leaves out the set written by hand
(TESTING.md, "Capturing them again"). The Kamaji states join the states that
`all` names for the other commands and for the tests, `statesOf(["all"])`
(`e2e/scripts/states.mts:995-1008`), only with their folders; until then the
capture command alone knows them ("Notes and deviations"). The artifact holds
those folders alone, which go into the repository anyway: never the state folder
of the scripts, a kubeconfig or a Secret. It departs from TESTING.md,
"Continuous integration", which says that no workflow uploads "the state folder
of the scripts, a kubeconfig or any file of a cluster" (TESTING.md:470-471): the
sets are files of a cluster, cleaned (P6), and the pull request that adds the
workflow amends that sentence. A static test of the workflow checks that it runs
on dispatch alone and that its artifact holds the folders of the Kamaji sets
alone (Tests).

GitHub runs a workflow on `workflow_dispatch` only when its file is on the
default branch (GitHub documentation, "Events that trigger workflows",
`workflow_dispatch`). So the workflow reaches `main` in a pull request of its
own, with the scripts of the cluster of the captures, the pins, the reads and
the cleaning of P6, the toggles of P8 and the definitions of the provider and of
Kamaji on the first tier, which those reads need (P8), before the pull request
that commits the sets, which a run dispatched on a branch made for it captures;
that pull request commits the sets after a review of their diff, as every new
capture asks (TESTING.md, "Capturing them again"), and the digests of each
README are those that the log of the run printed. The implementation follows
that order ("Notes and deviations").

The job has 60 minutes, about twice what it would take from the times of the
probes, on their machine: some 30 minutes, `up` about 3 minutes (L19, L21), each
state with a worker about a minute and a half from its apply to its reading (L4,
L9), `kamaji-sleeping` and `kamaji-not-ready` some six and a half minutes each,
the grace of P5 included, and the deletion of each workload cluster. No probe
ran on a runner (L20, L29): the limit is revised from the durations of the runs
of the job, as TESTING.md sets the limit of every job from the durations of its
runs ("Continuous integration"), and a run that it cuts fails, the limit then
raised from the log of that run. The images of the provider, of Kamaji, of
`clastix/kubectl` and of kindnet come from Docker Hub at every run, the first
two before any state; so, on a runner that does not hold them, do the images of
the kind nodes, `kindest/node` at `v1.37.0` and at `v1.36.4`, and that of the
load balancer of the development provider, `kindest/haproxy`
(test/infrastructure/docker/internal/loadbalancer/const.go:20-27), which the
machine of the probes held before them (L19). Docker Hub limits the pulls with
no login (L19): a pull that it refuses fails the job, which is dispatched again
once the limit of those pulls has reset. It runs again by hand when the pins of
Cluster API, of the provider or of Kamaji change. The reasons: the roadmap asks
the objects to be captured once (ROADMAP.md:44); a runner makes the machine of
the capture one that names nothing real, as the captures of SPEC-0002 do; and
the cost of a live provider stays out of every run of CI, where the first tier
needs only the definitions and the fixtures (kit, `docs/testing.md`, "The test
environment has two tiers").

**P8.** Proposed: on the first tier, `pnpm e2e:cluster:up:definitions` applies,
besides those of SPEC-0002, the definitions of the provider, the documents of
kind `CustomResourceDefinition` of its `control-plane-components.yaml`, with
their contract label as it is and the label `cluster.x-k8s.io/provider` that
clusterctl gives the components that it installs, `control-plane-kamaji`, in
place of the `kamaji` of the release (K2), as the definitions of SPEC-0002 carry
the label that clusterctl gives their provider (K2), since SPEC-0003, P24 finds
the controllers of a kind by that label; and those of the TenantControlPlane and
of the DataStore, from the files of the chart of Kamaji at its commit (P3; K10),
as they are; each file checked against its pin, by a server-side apply as the
others (SPEC-0002, "Notes and deviations"). They come in the pull request that
makes the scripts name the two kinds of Kamaji on that cluster (P6), whose reads
need them ("Notes and deviations"). The conversion webhook of the
TenantControlPlane and its annotation of cert-manager have there what those of
Cluster API have: a request at its one version, which is the stored one, needs
no conversion (K10), as SPEC-0001, R4.115 infers of the definitions of Cluster
API at theirs, and as the probe of the host read and listed TenantControlPlanes
on that cluster (H1, H8, H9). The DataStore holds no object; its definition
makes the cluster serve both kinds of the Kamaji extension, as a cluster with
Kamaji does (K19; H9). `pnpm e2e:fixtures:up all` applies the nine sets with the
others, each in its namespace, a TenantControlPlane after the KamajiControlPlane
that owns it, and the scripts read the two kinds of Kamaji there (P6). A Kamaji
object whose status observed an older generation needs a field of its spec to
set and unset there, as a Cluster, a Machine and a DevMachine have one
(`e2e/scripts/fixtures.mts:376-392`; TESTING.md, "On the first tier"), since the
apply refuses an object of another kind that needs one
(`e2e/scripts/fixtures.mts:438-444`), and so does a capture, which makes the
plan of every object before it writes its set (`e2e/scripts/commands.mts:981`).
The pull request of the scripts adds two, made as those are, an optional field
that no rule of the definition keeps from changing and that the schema does not
default, set to a value that the schema accepts and unset: for a
KamajiControlPlane, `spec.dataStoreSchema`, a string
(provider:crd.yaml:1182-1185), which `kamaji-version-refused` needs, its
`Available` observing the generation before the change (K6; P1); and for a
TenantControlPlane, `spec.dataStoreOverrides`, a list
(kamaji:tcp_crd.yaml:8739-8751), which no state of the probes would need, its
own `status.observedGeneration` equal to its generation (L27).

Two checks keep the files as they were captured, and a record backs them:

- `pnpm e2e:fixtures:check`, the round trip of every set through the API server,
  its schema and its rules of CEL included, in the job of the fixtures of
  `test-environment.yaml` (TESTING.md, "On the first tier", "Continuous
  integration");
- the cases of `test/environment.test.ts` on the sets of the repository: each
  written as the scripts write it, its README as they write it, every owner in
  the set, nothing that a cleaning leaves out (SPEC-0002, "Tests"); and, for the
  Kamaji sets, from the pull request that commits them, no checksum but the
  fixed value of P6, and each file against the SHA-256 that its README holds,
  seen failing once on a file changed for the purpose. That check proves that a
  file and the digest that its README holds agree, so that a file changed alone
  fails; it does not prove that the file is the one that the capture wrote,
  since a file changed with its digest passes;
- and the record: the log of the run that captured them, which printed the
  digests of the files that it wrote (P7). Only that log tells a file changed
  with its digest from the file captured, and no test reads it: the review of
  the pull request that commits the sets compares the digests of each README
  with those of the log.

The tests that read every state take the nine sets as they are, from the pull
request that commits them, which changes each of them with the sets ("Notes and
deviations"): the check that the folders of the fixtures are the states
(`src/common/status/fixtures.test.ts:158-185`), the states that the unit tests
read (`test/fixture-sets.ts`), the states of the scripts
(`e2e/scripts/states.mts:464`), the sessions that read every state, and the
round trip. The tests of the tree of SPEC-0005 read every state too: its
expected trees must cover every folder of the fixtures
(`src/common/views/cluster-tree.test.ts:113-115`), so that `TREE_CLUSTERS` and
`EXPECTED_TREES` (`integration/__tests__/tree-expectations.ts:21-37, 39-455`)
gain the Cluster and the expected tree of each Kamaji set, and the cases that
build the tree of every state build theirs
(`src/common/views/cluster-tree.test.ts:117-135`;
`src/common/views/tree-rows.test.ts:375`); and the read of the tree of every
state (`src/renderer/reads/cluster-namespace-read.test.tsx:998-1016`) runs on a
stub of the host that serves the definitions of Cluster API and of the
development provider alone (:418-424), on which the control plane of a Kamaji
state would resolve as not served and fail the check of its rows (:1013), so
that the stub gains the definition of the KamajiControlPlane, with the labels of
P8, and its API at `v1alpha2` (`test/host-stores.ts:58-80, 154-195`). That is
what this spec wants: every view of M1 shows a Cluster of Kamaji next to the
others.

### The views of M1 with such a control plane

**P9.** Proposed: SPEC-0003, P1 stays for a control plane of a provider that has
none of `RollingOut`, `ScalingUp` and `ScalingDown`: its activity is Unknown,
next to those that hold, and so is that of its Cluster. What changes is that the
model says why. It gives such a control plane a note, `activities-not-written`,
with the three types, and its Cluster the same note with the kind and the name
of its control plane. The note goes with that Unknown: a control plane or a
Cluster that is deleting holds Deleting alone, with no Unknown and so no note,
as every object that is deleting does (SPEC-0003, "Notes and deviations";
`src/common/status/activity.ts:1407-1411`), as on `kamaji-deleting`. The note
says what the model sees, the conditions of the object as it is, and never that
its provider writes none, which one object cannot show
(`src/common/status/activity.ts:1308-1316`): "This control plane has none of the
conditions RollingOut, ScalingUp and ScalingDown, so whether it rolls out or
scales cannot be read." The details show it among the notes of the model
(SPEC-0004, "The details"; SPEC-0005, P17), and the tooltip of the cell of the
activity, in the list and in the tree, which lists the marks of the cell
(`src/renderer/pages/clusters-page-v1beta2.tsx:364-375`), says it next to the
activity Unknown, for this note alone, since no mark in a cell has a tooltip of
its own (DESIGN.md, "The status model in lists and details"). The reasons, from
the facts:

- **The source does not exist.** The provider writes none of the three: its
  conditions are a closed list (K5), and the probe saw none of them in any state
  (L17). So for Kamaji the Unknown is for good, but while the object is
  deleting, and today it has no cause that a view can show, since the model
  marks the source unread and writes no note
  (`src/common/status/activity.ts:1308-1316`), where a missing value says why
  when the reason is known (DESIGN.md, "Words").
- **The counters cannot stand in for them.** They copy the Deployment of the
  tenant (K6), which Kamaji rolls out blue and green, a second set of Pods next
  to the first (K12): `status.replicas` above `spec.replicas` is then a rollout,
  as the probe saw in an upgrade (L11), which the reading of the scale of a
  MachinePool would call a scale down (SPEC-0003, P20). In a scale up the
  Deployment counts the new Pods at once, 3 current while 1 is ready (L10), so
  the counters tell no scale that ends from one that waits. The one reading of a
  scale from the counters that the project has calls any difference a scale, and
  serves its end-to-end tests alone (K17).
- **What Kamaji knows does not reach a field.** Its state of the tenant, which
  tells an upgrade from another rollout (K11), reaches the KamajiControlPlane
  only as `ready` and as the message of `KamajiControlPlaneIsReady` (K6; L10,
  L11), and no rule reads a message for meaning but those that SPEC-0003 names
  (SPEC-0003, P18).
- **The Cluster.** The project leaves such a control plane out of the
  `RollingOut`, `ScalingUp` and `ScalingDown` of its Cluster (K16), which the
  probe saw come from the workers alone (L17); Idle would claim that the control
  plane does nothing, a guess that the kit forbids (kit, `docs/design.md`,
  "Status"; SPEC-0003, P1).

What can be read of such a control plane is shown, as the probe saw it (L7 to
L17): Provisioning until the field of its contract says that it is initialized
(SPEC-0003, P17); Upgrading from its versions (SPEC-0003, P28; K4, K17), also
when Kamaji refuses the version of its spec, since the project reads the
versions alone (L12); Deleting; and Paused from its condition or its request
(SPEC-0003, P19). So a KamajiControlPlane reads Paused as soon as its Cluster is
paused, from the request, before the provider writes the condition, which it
writes only at an event of the KamajiControlPlane, of a Secret that it owns or
of its tenant, or, under the gates of an external cluster reference, of its
channel (K5; L15); after its Cluster is resumed, it reads Paused from the
condition that the provider left, until such an event removes it, while its
Cluster no longer does, as the provider wrote it; the details show that
condition with its time, and the Cluster its own `Paused`. A provider that
writes one of the three conditions gets no note. It adds a note to SPEC-0003,
P1, and changes no result of the model but its notes, and adds the words of that
note to the tooltip of the cell of SPEC-0004, P7 and P12, and of the tree
("Changes to the approved specs").

**P10.** Proposed: the counters of a control plane carry the word of what it
counts, as far as the view knows it, by one rule for the list, the details and
the tree:

- a KubeadmControlPlane counts Machines, known by the kind that the reference
  of the Cluster names, whether the view has read its object or not, so that
  its counters show no spinner for their word; and so do the control plane
  Machines of a Cluster with no control plane reference, which the Cluster
  counts itself (cluster_controller_status.go:182-205);
- a control plane of any other kind shows the spinner of the host in the place
  of its counters while its object still loads, as the place of a mark whose
  inputs still load does (`src/common/views/context.ts:561`; DESIGN.md, "The
  status model in lists and details"); then the word that its object gives,
  Machines when that object has `spec.machineTemplate`, which the contract asks
  of a control plane whose instances are Machines (K17), and replicas when it
  has none; and replicas when the view cannot read it, refused, failed or not
  found, the neutral word, since replicas is the word of the fields of the
  contract and of the counters of the Cluster and says nothing of what a replica
  is (K17; SPEC-0001, R2.12);
- the count of each entry of the versions of the control plane, in the tooltip
  of the cell of the version and in the row Versions, takes the same word
  (`src/common/views/cluster-cells.ts:126-128`;
  `src/renderer/details/cluster-details-v1beta2.tsx:573-584`).

The version follows P11: that of the topology or of
`status.controlPlane.versions` first, whatever the object of the control plane,
and the spinner only when neither gives one and that object still loads.

The view reads the presence of `spec.machineTemplate`, on the object of the
control plane that the context resolves (`src/common/views/context.ts:551-592`),
and of the fields under it those alone that SPEC-0005, P6 reads for the tree.
So, for a KamajiControlPlane: the cell of the control plane in the list reads
`1/1`, or `N/A/1` before the control plane writes its counters, when the Cluster
copies `desiredReplicas` alone (L7, L8, L17), with "Desired: 1 replica" in its
tooltip, and "N/A, not written yet" for each counter not written; the details
head the row of the counters "Replicas" and write "1 desired, 1 current, 1
ready, 1 available, 1 up to date"; and the tree says replicas in the tooltip of
the cell Replicas of the node of the control plane and in its details
(SPEC-0005, P9, P17). For Kamaji a replica is a Pod of the Deployment of the
tenant, the surge of an upgrade included (K6; L9, L11), which the contract does
not say, so the views do not either. Today the views say Machines for a control
plane that makes none (K15); the conditions of the control plane Machines of its
Cluster are `True` `NoReplicas` (K16; L17), which the details show as written.
It departs from SPEC-0004, P8 and "The details", and from DESIGN.md ("Words"),
which name Machines for every counter ("Changes to the approved specs").

**P11.** Proposed: a Cluster with no version in its topology and none in
`status.controlPlane.versions` shows the version that its control plane reports
by its contract, its `status.versions`, else its `status.version`, read from the
object of the control plane that the context resolves
(`src/common/views/context.ts:551-592`), as the project reads the current
version of a control plane for its own checks (K17). An empty `status.version`
is no version, as the project reads it (controlplane.go:289-291, 342-344) and as
SPEC-0003, P28 reads it: the provider writes `version` at every update of the
status, the field having no `omitempty`, and leaves it empty until the control
plane is initialized (provider:types.go:330-331; provider:controller.go:134-142,
293-305; L7, L8), so the cell shows N/A, with the tooltip "Control plane: N/A,
not written yet" (kit, `docs/design.md`, "Lists"). The cell shows a version as
it shows the versions of a Cluster (SPEC-0004, P9), and the list sorts on it
(SPEC-0004, P28); its tooltip says where it comes from, as "Control plane:
v1.36.4, as the control plane reports it in status.version, a field that the
contract deprecates". The details show it in the row Versions of the section
Control plane, followed by the name of its field, `status.version`, and the
label "deprecated" (kit, `docs/design.md`, "Status"; SPEC-0001, A5), with no
number of replicas, which that field does not hold (K4). With no version in the
topology or in `status.controlPlane.versions`, the cell shows the spinner while
the object of the control plane still loads, and N/A, with the tooltip that the
control plane was not read, when the view cannot read it; "N/A, not written yet"
is the tooltip of the cell alone, and the details, with no version to show, show
no row Versions, as they do today for a Cluster whose control plane reports none
(`src/renderer/details/cluster-details-v1beta2.tsx:573-575`). The cell of the
list leaves the label to its tooltip, since a label in a cell of one line would
read as a word on the version itself. The reasons: the Cluster copies
`status.versions` alone (K16), the provider writes `status.version` alone, the
version that its tenant has installed (K4, K6), and the probes saw the Cluster
hold no version of its control plane, and the printer column `VERSION` of the
project empty (L17): without the rule, a Cluster of Kamaji with no managed
topology shows N/A for good, with the words "not written yet", which is not true
once its control plane wrote the version, in the field that the contract keeps
as a fallback (K17). During an upgrade it shows the version installed, `v1.36.4`
while `spec.version` reads `v1.37.0`, until the tenant is `Ready` again (K11;
L11, L24), as `status.versions` would show the oldest. It departs from
SPEC-0004, P9, and from the kit for the place of the label in the list, which
DESIGN.md records ("Changes to the approved specs").

**P12.** Proposed: in the details of a Cluster whose control plane is of a
provider, in the drawer and in the panel in the details of the host (SPEC-0004,
P16), the section Control plane shows, as SPEC-0004 gives it ("The details"):
the object, a link to the details of the host, with its health and its
activities; then, for a KamajiControlPlane, the row Tenant of P17; the counters,
in the word of P10, or its spinner while the object of a control plane of
another kind than KubeadmControlPlane still loads; the versions of P11;
Initialized; and the endpoint. Nothing else of the spec of a
KamajiControlPlane: its datastore, its network, its addons and its deployment
are its own view, SPEC-0011 (ROADMAP.md, "Changes of scope"). The health that
the section shows is that of the project, as the probes saw it: Unknown before
`Available` (L7, L8), Unhealthy while the tenant scales up, at 0 replicas and
with no replica ready (L10, L13, L14, L24), Degraded for a version that Kamaji
refuses (L12), Healthy otherwise (L9, L11, L24), and none while it is deleting
(SPEC-0003, "The closed sets"; L16).

**P13.** Proposed: in the tree of SPEC-0005, the node of such a control plane
has no node under it, and no row says that something is missing. It names no
machine template (K3), so the field of its contract that the tree reads for a
template, `spec.machineTemplate.spec.infrastructureRef` at `v1beta2`, and
nothing else under `spec.machineTemplate` (SPEC-0005, P6), is absent, which the
tree reads as no template, never as a template not found (SPEC-0005, P6, P12);
and it makes no Machine (K15). The workers of a Cluster of Kamaji are nodes as
those of any Cluster (SPEC-0005, P7). The TenantControlPlane is no node either:
SPEC-0005, P8 gains it, an object of Kamaji that no field of the contract names,
which the tree reads only for the row Tenant of the details of its control plane
(P16). The last rows of SPEC-0005, P7, which place an object labelled with the
name of the Cluster by its owner, leave it out, though it can carry that label
(K8): the model knows no rule for its kind and would give it no health but
Unknown (SPEC-0003, P15), and its state is what the Kamaji extension shows
(K19). Its kind is no kind of the tree either, so a read of it that is refused
or fails at its first load, or that is held back after a refresh that failed
(SPEC-0005, P23), makes no node of its kind under the Cluster, the node that
SPEC-0005, P12 makes for a kind of the tree in those cases: the row Tenant says
it (P17), and the notice of the tree for that kind, which says that the details
of the node of the control plane show the tenant as text, with the reason, and
names no node of it (P16). The details of the node of the control plane
(SPEC-0005, P17) show the counters of P10, the versions of P11, the row Tenant
of P17, and the link to the details of the host of the control plane itself
(SPEC-0001, A6). It departs from SPEC-0005, P7, P8 and P12, and from its note on
the words of the notices of the tree, and adds to P6, P9, P13 and P17 ("Changes
to the approved specs").

### The link to the tenant

**P14.** Proposed: the tenant of a KamajiControlPlane is the TenantControlPlane
of `kamaji.clastix.io` with the same name, in the same namespace, whose owner
reference with the flag of controller names that KamajiControlPlane by its
group, its kind and its name, as the provider makes it (K8; L16), and as the
views match an owner (SPEC-0005, P7). The name finds it; the owner reference
tells it from a TenantControlPlane of the same name that the provider did not
make. No field of the KamajiControlPlane names it (K8), so nothing else finds
it. A KamajiControlPlane with `spec.deployment.externalClusterReference` names a
cluster of its own for its tenant, under another name and with no owner
reference (K9): the view reads that the field is there, looks for no tenant of
it, whatever the store of its namespace holds, and says so (P17). It never reads
the Secret that the field names, nor any field under it, which name that Secret
and its namespace (K3; SPEC-0001, A3).

**P15.** Proposed: the extension knows that the Kamaji extension is there from
`Common.App.getEnabledExtensions()` of the extension API (K21): the Kamaji
extension is there while the list holds `@freelensapp/kamaji-extension`, the
name of its package (K19; H4). No page of the documents of the host describes a
way to know whether another extension is installed; they list `App` among the
members of `Common`, and make every member that the namespaces export public and
stable for the major, and `getEnabledExtensions()` is such a member (K21). It is
the least fragile way:

- it is a member of the extension API, and not a fact of the DOM or of a route
  of the host, which no API gives: the address of a page of the Kamaji extension
  can be built (K20), but nothing says whether a route is there, and a disabled
  extension sends its address to `/overview` (H7); its entries in the sidebar
  are elements of the host; and what an extension registers in the details of
  the host is read by no API;
- it names an extension by the name of its package, which the Kamaji extension
  publishes (K19), and both frames gave the same list at every reading (K21;
  H4);
- it follows what the user does, at once and with no reload: a disable and an
  enable reached an observer before the click on the menu item returned, and an
  uninstall before the helper that removed its row returned, and the list kept
  its value across a reload of the frame and a restart (H5). Freelens 2.1.0 sets
  a removed extension to disabled (freelens:extension-loader.ts:437-445): its
  saved state keeps the entry of an uninstalled extension with `enabled: false`,
  which the list leaves out (H5).

An extension that is enabled but did not load, or does not run on the release of
the host, stays in the list, which reads the state that the host saved and not
what loaded (K21): the link then opens the details of the host with no panel of
the Kamaji extension, which still show the object, as the probe saw them for a
disabled one (H8). That case needs a build that fails to load, which no probe
and no session runs (H11): it stands on the source of the host (K21) and on
what the probe saw of the details with no panel (H8).

The views read it while they render, in an observer, since it is observable
(K21), so that the row of P17 follows an extension enabled, disabled or
uninstalled with no reload (H5). "Enabled" is what the row needs, not
"installed": a disabled extension shows no panel (H8).

**P16.** Decided by the maintainer on 2026-11-26, on the exception to SPEC-0001,
A2 and A3 that the first draft of this spec proposed in this rule: the extension
reads the TenantControlPlanes of `kamaji.clastix.io` at `v1alpha1`, for their
name, their namespace and their owner references only, only while the Kamaji
extension is enabled (P15), and never their Secrets. Nothing wider: no other
kind of Kamaji, no other version, no other field of a TenantControlPlane, and no
kind of another project. SPEC-0001 records it in its "Notes and deviations", in
the pull request of this spec ("Changes to the approved specs").

Proposed, as what the decision asks of the views: while the Kamaji extension is
enabled, a view that shows the details of a Cluster whose control plane
reference names a KamajiControlPlane of `controlplane.cluster.x-k8s.io` reads
the TenantControlPlanes at `kamaji.clastix.io/v1alpha1`, the one version of the
kind (K10), which the provider writes (provider:tcp.go:12, 31-34), through the
APIs that the host registers for a definition (SPEC-0001, R7.17), once the
cluster is known to serve the kind at that version, in these views:

- the page of the Clusters, for the details over its list, through the store of
  the host for that kind and version, as a dependent store of its list, which
  joins once a Cluster of the namespaces read names such a control plane, as the
  stores of the kinds of the providers join (SPEC-0004, P3, P19, "Notes and
  deviations"), and leaves when the Kamaji extension is disabled or uninstalled;
- the view of one Cluster that reads with stores of its own, and the tree,
  through a store of their own on the namespace of the Cluster, built with the
  API that the host registered for the kind, never registered, as for the kinds
  of a provider (SPEC-0004, P31; SPEC-0005, P6). That store is one of the read
  of one Cluster, `ClusterNamespaceRead`, beside the models and the references
  that its kinds give, `ViewKinds`
  (`src/renderer/reads/cluster-namespace-read.ts:138-143, 194-239`), since the
  TenantControlPlane is neither a kind of Cluster API that a model reads nor the
  kind of a provider that a reference names; the read builds it once its first
  loads have ended (:552-569), so that its load is never one of them: the tree,
  which waits for the first load of every store that the read has built
  (SPEC-0005, P13), never waits for it, and the row Tenant shows the spinner of
  the host until that load ends, for that load alone.

The cluster is known to serve the kind from the store of definitions of the
host, or, when that store cannot be read, from the API of the kind at that
version that the host then registers from the discovery of the cluster, which
the view looks up in the registry of the host with no request, as SPEC-0004, P20
tells whether the cluster serves Clusters, and as the reads of the definitions
look up the API of a kind (`src/renderer/reads/definitions.ts:80`; P17). Each
reads the name, the namespace and the owner references of a TenantControlPlane,
and types no other field. A read that is refused or fails folds into the states
of SPEC-0004, P25, with a new value of `KindFeeds`, `tenant`, whose notice says
that the details show the tenant of such a control plane as text, with the
reason, until it can be read. The tree says it in its own notices, those of
`treeNotices` (`src/common/views/read-state.ts:538-550`), whose lines say of
every kind that the tree reads and holds back, the Clusters apart, that its
nodes in the tree read as not read (:495-507): for `tenant`, its notice says
that the details of the node of such a control plane show the tenant as text,
with the reason, until it can be read, and names no node, since the
TenantControlPlanes are no nodes of the tree (P13). When the cluster serves no
TenantControlPlane at `v1alpha1`, as its definitions say once read, or, when
they cannot be read, as the APIs that the host registers from its discovery say,
no store is built, and the row says so (P17). Without the Kamaji extension,
nothing of the kind is read. The gate holds on Freelens 2.1.0: the list drops
the name of the Kamaji extension at a disable and at an uninstall, at once, and
keeps it out after a reload of the frame and a restart (H5). The reads
themselves are checked by the unit cases and by the sessions of the Clusters and
of P18, as every rule (Tests). The extension reads no definition of Kamaji by
its name: SPEC-0001, A2 reads a definition by its name only for the kind of a
provider that a reference names, and the decided terms hold nothing more;
whether the cluster serves the kind needs no such read (P17). The reasons: a
link is shown only when its target is in the store that the view read
(SPEC-0004, P18), and the kit calls a link that fails a defect (kit,
`docs/design.md`, "Details"), so the link of the roadmap needs the tenant read;
and a user who does not use the Kamaji extension is asked for no permission on a
kind of Kamaji, and shown no refusal of one. ARCHITECTURE.md ("What it reads")
and the README ("Permissions") say it in the same pull request: `get`, `list`
and `watch` on `tenantcontrolplanes` of `kamaji.clastix.io` in the namespaces
that the views read, those that the filter of the page selects, or the whole
cluster when it selects every namespace, and the namespace of a Cluster whose
details read with stores of their own (SPEC-0004, P19, P31; README.md:62-66),
while the Kamaji extension is enabled, and nothing more.

**P17.** Proposed: the details of a Cluster whose control plane is a
KamajiControlPlane, in the drawer and in the panel, and the details of its node
in the tree, show a row Tenant after the object of the control plane, in the
first of these cases that holds:

| Case                                                                                                                                                                                                          | The row                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec.deployment.externalClusterReference` set, whatever the extension                                                                                                                                        | Text: this control plane names a cluster of its own for its tenant, which this view does not follow; no tenant is looked for, whatever the view reads of its namespace (P14)                                                |
| The Kamaji extension not enabled                                                                                                                                                                              | Text: the tenant shows in the Kamaji extension, `@freelensapp/kamaji-extension`, which is not enabled here, and which the Extensions page of Freelens installs and enables; nothing is read                                 |
| Enabled, the definitions of the cluster still loading                                                                                                                                                         | The spinner of the host                                                                                                                                                                                                     |
| Enabled, and the definitions, read, serve no TenantControlPlane at `v1alpha1`                                                                                                                                 | Text: this cluster serves no TenantControlPlane at `kamaji.clastix.io/v1alpha1`                                                                                                                                             |
| Enabled, the definitions not listed, a user who may not list them or their list failed, and no API of TenantControlPlanes at `v1alpha1` among those that the host registers from the discovery of the cluster | Text: this cluster serves no TenantControlPlane at `kamaji.clastix.io/v1alpha1`, as its discovery lists the kinds that it serves, its definitions not being listed here (SPEC-0004, P20); nothing is requested for it       |
| Enabled, served, the kind still loading in that namespace                                                                                                                                                     | The spinner of the host                                                                                                                                                                                                     |
| Enabled, served, the kind not read in that namespace                                                                                                                                                          | "Not read.", the reason and the permission, `get`, `list` and `watch` on `tenantcontrolplanes` of `kamaji.clastix.io` in that namespace, as a reference that cannot be read says it (SPEC-0004, P18; DESIGN.md, "Words")    |
| Enabled, read, and no such tenant in that namespace                                                                                                                                                           | Text, `TenantControlPlane <name>`, and the reason: no TenantControlPlane of this control plane is in its namespace, which was read                                                                                          |
| Enabled, read, the tenant found (P14)                                                                                                                                                                         | `TenantControlPlane <name>`, the name a link to the details of the host for it, `Renderer.Navigation.getDetailsUrl` of its `selfLink`, `/apis/kamaji.clastix.io/v1alpha1/namespaces/<namespace>/tenantcontrolplanes/<name>` |

Whether the cluster serves the kind is read from the store of definitions of the
host, as it tells it: still loading, loaded with or without the definition at
`v1alpha1`, or failed (`src/renderer/reads/definitions.ts:68-78`), the host
listing and watching the definitions itself
(freelens:definitions.injectable.ts:28-40); and, once that store has failed,
from the APIs that the host then registers from the discovery of the cluster,
for a user who may not list the definitions
(freelens:setup-auto-crd-api-creations.injectable.ts:43-54), looked up in its
registry with no request, as SPEC-0004, P20 reads them for the Clusters
(`src/renderer/reads/definitions.ts:80`); the extension reads no definition of
Kamaji by its name (P16). For a user who may not list the definitions, the row
says what the view read, the discovery of the cluster, and claims no limit of
the host. So no row says that the cluster serves no TenantControlPlane before
the host knows the kinds that it serves, which the kit forbids: "Still checking
is not the same as not installed" (kit, `docs/design.md`, "States that are not
the happy one"). The row shows once the view has read the KamajiControlPlane:
while its reference cannot be read, the reference says why, as SPEC-0004, P18
says it, and there is no row Tenant, since the view cannot tell whether the
tenant is in another cluster. The name in the case not found is the one that the
provider gives the tenant, that of the KamajiControlPlane (K8).

The link opens the details of the host over the details of the extension, which
stay under them at their place, as the link to an object of a provider does
(SPEC-0004, P18), and as the probe of the host saw for a TenantControlPlane,
through `getDetailsUrl` and through `showDetails` alike (H8). There the details
show the metadata of the host, then its custom resource section, with the
printer columns of the kind, then the panel of the Kamaji extension, which hides
what those columns show, then the events (K10, K19; H8). The close icon of the
host closes its details alone and shows the details of the extension again,
their parameter still in the address; one Escape closes both and clears both
parameters (H8). Over the page of the Clusters, the focus then goes back to the
name that opened the details of the extension, as SPEC-0004, P15 asks of their
closing by Escape: the extension gives it back once both have closed, whatever
the order in which the two drawers close on that Escape, each through its own
listener on the window (SPEC-0004, P18), where today its details give it back as
they close (`src/renderer/details/cluster-details-drawer.tsx:80-89`); the probe
saw the focus on the body over a drawer of its own, which gave it back to
nothing (H8). The toolbar of those details holds, while the Kamaji extension is
enabled, its icon that saves the kubeconfig of the tenant, which reads a Secret
(K19; H8): that is the Kamaji extension's own action, which "Safety" covers.
Over the tree, the details of the host behave as SPEC-0005 settles for its links
to them: they open over the drawer of the node and keep the parameters of the
page, the close icon of the host shows the details of the node again, one Escape
closes both, and a click on a row, or an Escape in the empty search, closes
those of the host first (SPEC-0005, P5, P15, P17; SPEC-0005, H20; K20). A click
on the link stops at the link, so that no row under it opens its details as well
(kit, `docs/design.md`, "Lists"; SPEC-0004, P18). The links of the probe of the
host did not stop their click, which reached the window with its default
prevented, and the `Drawer` of the host did not take it for a click outside, so
that the details under them stayed open (H8).

The reasons: the roadmap gives the way to the tenant through the Kamaji
extension of the organization (ROADMAP.md:44), whose panel is the view of a
tenant (K19), and the details of the host are where it registers that panel
(K19; H8); its page of tenants takes no parameter, selects no tenant and shows
no label (K19, K20; H9), so a link to it would leave the user to look for the
tenant again. Without the Kamaji extension, nothing of this extension needs the
tenant (P16), and the text says where it shows, with the name of the package in
the text itself, since nothing important lives only in a tooltip (kit,
`docs/design.md`, "Interaction and performance"). It departs from the kit, which
asks a reference to be a link when its target exists (kit, `docs/design.md`,
"Details"; kit, `docs/review.md`, "The pre-review pass"), for a tenant while the
Kamaji extension is not enabled, as SPEC-0004 departs for its own references
(SPEC-0004, P18), which DESIGN.md records.

### The states that are not the happy one

The views keep the states of SPEC-0004 and SPEC-0005 as they are, and add these:

| State                                                                             | What a view does                                                                                                                                                                                                                                                                                                                                                            | Decided from             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| The definitions of the cluster still loading, the Kamaji extension enabled        | The row Tenant shows the spinner of the host, and no store of TenantControlPlanes is built yet                                                                                                                                                                                                                                                                              | P16, P17                 |
| The definitions of the cluster not listed, the Kamaji extension enabled           | Whether the cluster serves TenantControlPlanes at `v1alpha1` comes from the APIs that the host registers from its discovery, looked up with no request: with one, the store is built and the row Tenant follows as when the definitions are read; with none, the row says that the cluster serves none, as its discovery lists the kinds; no definition is read by its name | P16, P17; SPEC-0004, P20 |
| The TenantControlPlanes refused or failed in a namespace                          | The notice of SPEC-0004, P25 for the kind, with the value `tenant` of `KindFeeds`, and, in the tree, its notice among those of `treeNotices`, which says that the details of the node of the control plane show the tenant as text and names no node; the row Tenant as P17 says; no node of their kind                                                                     | P13, P16; SPEC-0004, P25 |
| A refresh of the tree that fails on them                                          | The notice of the tree, which names no node of them, and the kind held back (SPEC-0005, P23); the row Tenant says that it is not read; no node of their kind                                                                                                                                                                                                                | P13, P16; SPEC-0005, P23 |
| The Kamaji extension disabled or uninstalled while a view is open                 | The row Tenant turns to its text with no reload, and the store of P16 leaves the page                                                                                                                                                                                                                                                                                       | P15, P16; H5             |
| The cluster serves no TenantControlPlane                                          | No store, no notice; the row says so                                                                                                                                                                                                                                                                                                                                        | P16, P17                 |
| A KamajiControlPlane that names a cluster of its own for its tenant               | The row says so; no tenant is looked for, whatever the store of its namespace holds, and nothing under `spec.deployment.externalClusterReference` is read                                                                                                                                                                                                                   | P14, P17                 |
| A control plane of another kind than KubeadmControlPlane whose object still loads | The spinner in the place of its counters, and of its version when neither the topology nor `status.controlPlane.versions` gives one                                                                                                                                                                                                                                         | P10, P11                 |
| A control plane whose object is not read                                          | Its counters in replicas, or in Machines for a KubeadmControlPlane (P10); its version as the Cluster gives it, else N/A with the tooltip that the control plane was not read (P11); no row Tenant, and its reference as SPEC-0004, P18 says it                                                                                                                              | P10, P11, P17            |

### The demo of the review

**P19.** Proposed: the review of M1 looks at the Kamaji Clusters on the cluster
of the definitions, with their fixtures, and the demo of `pnpm demo:up` stays as
it is. TRY-IT.md gains a walk through them: `pnpm e2e:cluster:up:definitions`,
`pnpm e2e:fixtures:up` of the nine states, and that cluster opened in Freelens;
SPEC-0007 says whether its pass runs there too. The reasons: the review is held
on the demo, the cluster of the real project (kit, `docs/review.md`, "The demo
cluster and its walkthrough"; TRY-IT.md), which runs no Kamaji (P2); the roadmap
asks the objects to be captured once (ROADMAP.md:44), and a live Kamaji in the
demo would add the stack of P3 to the machine of the review, a cluster that the
scripts keep up for it, a setting of its kernel (P3), and its time to
`pnpm demo:up` (L19); and the fixtures show the nine states of P1 at once, which
a live provider shows one at a time.

### The theme

The view authors no color: the marks of the Kamaji Clusters are those of
SPEC-0003, P31, applied as SPEC-0004, P21 says, and the row Tenant is a link of
the host or text. The pull request checks the views on the Kamaji states in the
dark and the light variant of the `freelens` theme of 2.1.0 and in a theme that
is not the default, its High Contrast theme, dark and light, with the
screenshots of that check (kit, `docs/design.md`, "Theme", "How it is enforced";
Manual verification).

### Safety

- **What it reads.** A KamajiControlPlane as a control plane of a provider,
  through its contract (SPEC-0004, P3), and, of its spec, the presence of
  `spec.machineTemplate`, with the fields under it that SPEC-0005, P6 reads
  (P10, P13), and the presence of `spec.deployment.externalClusterReference`
  (P14), never a field under it. The TenantControlPlanes at
  `kamaji.clastix.io/v1alpha1`, their name, their namespace and their owner
  references, only while the Kamaji extension is enabled, and never their
  Secrets, within the terms that the maintainer decided; through the stores that
  P16 proposes. No definition of Kamaji by its name: whether the cluster serves
  the kind comes from the store of definitions of the host, or, when that store
  cannot be read, from the APIs that the host registers from the discovery of
  the cluster (P16, P17). Never a Secret: not the kubeconfig of another cluster
  that a KamajiControlPlane names (K3), and not the Secrets that the provider
  and Kamaji make for a Cluster and a tenant (K10, K15; L18; SPEC-0001, A3).
  Never the workload cluster: the tenant is an object of the management cluster.
- **What it writes.** Nothing: no create, no patch, no delete, and no request
  that creates an object (kit, `docs/safety.md`, "Writing").
- **What the link reaches.** The details of the host of a TenantControlPlane
  carry the menu of the host and, while the Kamaji extension is enabled, in
  their toolbar, the icon of the Kamaji extension that saves the admin
  kubeconfig of the tenant from a Secret, on a click (K19; H8). That is the
  Kamaji extension's own action, one click away from the details that the link
  opens, as the menu of the host is from the details of every object of a
  provider (SPEC-0001, A6); its page of tenants holds its button that creates a
  tenant (H9). This extension reads no Secret for them, offers no such action of
  its own before SPEC-0022, whose action asks for a confirmation (SPEC-0001,
  A14), and its sessions press none of them, and never an icon of a toolbar by
  its position, where that icon sits beside the edit and the delete of the host
  (H8).
- **The fixtures.** Captured from a kind cluster of CI, of synthetic objects,
  with no Secret, no ConfigMap and no checksum of either, nothing that the
  machine of the capture tells of itself (P6), and a chart of Kamaji with its
  telemetry disabled (P3): nothing of a real environment, and nothing sent out
  (kit, `docs/safety.md`, "Data of real environments").
- **How the tests prove it.** The read-only check of SPEC-0004 and SPEC-0005
  (`src/renderer/read-only.test.ts`) gains two cases: one that fails on a module
  of the views that names the API of Secrets of the host, `secretsApi`, or
  requests the plural `secrets`; and one that fails on a module that reads or
  declares one of the four names under `externalClusterReference`,
  `kubeconfigSecretName`, `kubeconfigSecretKey`, `kubeconfigSecretNamespace` and
  `deploymentNamespace` (K3), wherever it reads or declares it, as the check of
  R3.36 matches its names (`src/renderer/read-only.test.ts:47-57`). The one
  function that says whether that field is there reads its parent with
  `Object.hasOwn` and names none of the four. Each case is seen failing once on
  a line planted for the purpose, the line printed (kit, `docs/testing.md`,
  "Checks worth trusting"). In Freelens, every request that the frame of the
  cluster sends to the groups that the views read, `kamaji.clastix.io` included,
  is a GET, a list or a watch, and no request of the frame reads a Secret, in
  the sessions on the Kamaji states and in that of P18. No request of the frame
  goes to `kamaji.clastix.io` in the session of the Clusters, which installs no
  Kamaji extension, nor in that of P18 between the disable of the Kamaji
  extension in its step 6 and its enable, the condition of P16. Each check is
  seen failing once on a run planted for it: the first on a run in which the
  session patches a label of a fixture from the frame (SPEC-0004, "Safety"); the
  second on a run of its own in which the session reads the Secrets of the
  namespace of `kamaji-healthy` from the frame, since a patch of a label reads
  no Secret; and each of the last two on a run in which the session lists the
  TenantControlPlanes of that namespace from the frame, in the window that the
  check reads (kit, `docs/testing.md`, "Checks worth trusting").

## Tests

### Unit

The cases start from the objects of the nine sets, read with the YAML reader of
the scripts, as those of SPEC-0003, SPEC-0004 and SPEC-0005 do
(`test/fixture-sets.ts`), and a value that the schema rejects, or a state not
captured (P1), is written at this layer only, with the field that the case
changes said in it (kit, `docs/testing.md`, "The test environment has two
tiers"). The expected results are written by hand from the captured sets, and
never computed by the code that they test. Each new case is seen failing once
against the code before the change that it checks, the broken line printed (kit,
`docs/testing.md`, "Checks worth trusting"). A case that checks what no change
of this spec touches passes on that code: it is seen failing once against a
break planted for the purpose, a line of the code that it checks changed, which
the case names below and its run prints; so is a case that names another code to
fail against.

- `src/common/status/fixtures.test.ts`: the nine states among the folders of the
  fixtures; rows of the table of SPEC-0003 ("The fixtures of SPEC-0002 give
  these results") for the Cluster, the KamajiControlPlane, the DevCluster and
  the objects of the worker of each state, the KamajiControlPlane with the role
  control plane and the contract `v1beta2` of its definition, and `controllers`
  with the provider `control-plane-kamaji` available, the label of its
  definitions on the first tier (K2; P8): health, tone, activities, marks and
  notes, at the capture and past the threshold, as that table reads every state,
  the mark of SPEC-0003, P25 on `kamaji-sleeping` and `kamaji-not-ready` and the
  mark Older generation on `kamaji-version-refused` and `kamaji-deleting`
  included. The TenantControlPlane is evaluated by no rule: no view shows its
  status (P13). The note of P9 fails on the code before the change; what no
  change touches is seen failing once against its own break: the health and the
  tone against the summary of a control plane of a provider cut to `["Ready"]`
  (`src/common/status/providers.ts:194`), which the Kamaji control planes,
  writing `Available` and no `Ready`, do not have; the activity Unknown against
  the line that leaves the activity of such a control plane unread taken out
  (`src/common/status/activity.ts:1314`); the mark of SPEC-0003, P25 against
  `unreachableOf` returning no mark from its first line
  (`src/common/status/freshness.ts:197`); and the mark Older generation against
  the generation of an object of a provider read from its status alone,
  `"status"` in place of `"status-else-summary"`
  (`src/common/status/providers.ts:197`), the KamajiControlPlane having no
  `status.observedGeneration` (L27).
- `src/common/status/activity.test.ts` (P9): the note `activities-not-written`
  on the KamajiControlPlane of each state but `kamaji-deleting`, with its three
  types and its words, and on its Cluster, with the kind and the name of the
  control plane; none on the KamajiControlPlane and the Cluster of
  `kamaji-deleting`, which hold Deleting alone (SPEC-0003, "Notes and
  deviations"), none on a control plane of a provider that writes one of the
  three, written by the case, and none on a KubeadmControlPlane; the activity
  Unknown as before, next to Provisioning on `kamaji-provisioning`, to Upgrading
  on `kamaji-upgrading` and on `kamaji-version-refused`, and to Paused on
  `kamaji-paused`, from the request; Paused from the condition that the provider
  left once the Cluster is resumed, and from the annotation on the
  KamajiControlPlane, each written by the case. The note is seen failing once
  against a model without it, and the cases with no note against a model that
  gives it to every control plane, whatever its conditions, its kind and its
  deletion. The activities, which no change touches, are each seen failing once
  against its own break: the Unknown against the line that leaves the activity
  of such a control plane unread taken out
  (`src/common/status/activity.ts:1314`); Provisioning against the call that
  reads the field of its contract taken out (:1309); Upgrading against the call
  that reads the upgrade of a control plane taken out (:1315); Paused from the
  request and from the annotation against `"control-plane"` taken out of the
  roles that a request of a pause reaches
  (`src/common/status/providers.ts:164-170`); and Paused from the condition
  against the line that reads the condition `Paused` taken out
  (`src/common/status/freshness.ts:121`).
- `src/common/views/cluster-cells.test.ts` (P9, P10, P11): the counters of the
  control plane in replicas for each Kamaji state, in the tooltip of the cell,
  `1/3` on `kamaji-scaling`, `0/0` on `kamaji-sleeping`, `0/1` on
  `kamaji-not-ready`, and `N/A/1` on `kamaji-provisioning`, with "Desired: 1
  replica" and "N/A, not written yet"; in Machines for a KubeadmControlPlane,
  read, loading and not read, with no spinner, for the control plane Machines of
  a Cluster with no reference, and for a control plane of a provider whose
  object has `spec.machineTemplate`, written by the case; for a control plane of
  another kind, the spinner while its object loads and replicas when it is not
  read; the count of a version in the same word, replicas for a control plane of
  another kind, written by the case; the version of each Kamaji Cluster from the
  `status.version` of its control plane, its tooltip with the field and the word
  "deprecated", and no label in the cell; N/A, not written yet, for an empty
  `status.version`, on `kamaji-provisioning`; from the `status.versions` of the
  control plane when the case writes them, oldest first; the versions of the
  Cluster before either, and the version of its topology before all, with no
  spinner when either gives a version, and the spinner when neither does and the
  object of the control plane loads; the sort on the version shown; the tooltip
  of the activity with the words of the note. Each is seen failing once against
  the cells of SPEC-0004, but what those cells already give, which is seen
  failing once against a break of the new rule, printed: Machines for a
  KubeadmControlPlane, read, loading or not, against its word taken from its
  object as for any other kind; Machines for a Cluster with no reference against
  the word of a control plane that is not read given to it; Machines for an
  object with `spec.machineTemplate` against the word taken from the kind alone;
  N/A for an empty `status.version` against an empty version taken as one; and
  the versions of the Cluster and of the topology first, with no spinner,
  against the version of the control plane read before them, and against the
  spinner shown whenever the object of the control plane loads.
- `src/common/views/cluster-details.test.ts` (P10, P11, P12, P17): the section
  Control plane of each Kamaji state, its counters headed Replicas, each counter
  written, as "1 desired, N/A current" on `kamaji-provisioning`, or the spinner;
  its row Versions with the label, and none when no version is read;
  Initialized; the endpoint; the row Tenant in each case of the table of P17, in
  its order, from the read state that the case gives, the definitions loading,
  read with the kind served or not, and not listed with an API of the kind from
  the discovery or with none, included. What no change touches is seen failing
  once against its own break, printed: no row Versions on `kamaji-provisioning`
  against an empty `status.version` taken as a version; Initialized against the
  `Available` of the Cluster read in place of its `ControlPlaneInitialized`
  (`src/common/views/cluster-details.ts:516`); and the endpoint against its port
  left out (:638).
- `src/common/views/tenant.test.ts` (P14, P17), the tests of a new pure module,
  `src/common/views/tenant.ts`: the tenant of each Kamaji state found by its
  name, its namespace and its owner reference of controller; a
  TenantControlPlane of the same name with no flag of controller, or naming
  another object, not found; another namespace not looked in; the field
  `spec.deployment.externalClusterReference`, written by the case on the
  KamajiControlPlane of `kamaji-healthy`, said as a cluster of its own, with
  nothing looked for, whatever the tenants of the namespace; each answer of P17;
  seen failing once against a finder by the name alone.
- `src/common/views/references.test.ts`: the reference to the KamajiControlPlane
  of each set resolves to `controlplane.cluster.x-k8s.io/v1alpha2` from the
  labels of its definition (K2), seen failing once against the name of the
  contract taken for the version, `contract.contract` in place of
  `contract.version` (`src/common/views/references.ts:399`), which the cases of
  SPEC-0004 do not see, their kinds being served at the version that names their
  contract; KamajiControlPlane, of the group `controlplane.cluster.x-k8s.io`,
  and TenantControlPlane, of `kamaji.clastix.io`, join the kinds of a provider,
  not of Cluster API, in the table of the cases of SPEC-0005, P5
  (`src/common/views/references.test.ts:270-279`), which already holds an
  `ExampleControlPlane` of that group (:272), each seen failing once against its
  own break of `isClusterApiKind` at `src/common/views/references.ts:152`: the
  first against every kind of `controlplane.cluster.x-k8s.io` taken for one of
  Cluster API, its group alone telling it, and the second against the default of
  SPEC-0005, P5 turned, a kind that `CLUSTER_API_KINDS` does not hold taken for
  one of Cluster API.
- `src/common/views/context.test.ts`: the control plane of each Kamaji Cluster
  in `parts`, with its role and its contract, seen failing once against the role
  taken out of the context of the control plane
  (`src/common/views/context.ts:586`), which the cases of a KubeadmControlPlane,
  a kind that the model knows by itself, do not see; the presence of
  `spec.machineTemplate` read, and nothing under it but the field that
  SPEC-0005, P6 reads.
- `src/common/views/read-state.test.ts` (P13, P16): the value `tenant` of
  `KindFeeds` and its notice in the list; its notice in the tree, among those of
  `treeNotices`, which says that the details of the node of the control plane
  show the tenant as text, with the reason, and names no node, `tenant` being
  none of the values whose notice in the tree says that their nodes read as not
  read (`src/common/views/read-state.test.ts:558-573`); a refusal of the
  TenantControlPlanes in one namespace, given to no Cluster of the other.
- `src/renderer/reads/page-reads.test.ts` and
  `src/renderer/reads/cluster-namespace-read.test.tsx` (P15, P16): the store of
  the TenantControlPlanes joins the page only while the Kamaji extension is
  enabled, the cluster serves the kind at `v1alpha1`, as the store of
  definitions says, or, once that store has failed, as an API of the kind at
  that version that the host registered from the discovery says, and a Cluster
  read names a KamajiControlPlane, and leaves when the extension is disabled or
  uninstalled; no store when neither says so, seen failing once against reads
  that build it whatever the definitions and the discovery say, and no request
  of a definition by its name when the store of definitions failed, seen failing
  once against reads that get the definition by its name then; the reads of one
  Cluster and of the tree build theirs under the same conditions, never
  registered, once their first loads have ended, which end without it, seen
  failing once against a read that builds it with the store of the
  KamajiControlPlanes; on the stub of the SDK, whose
  `Common.App.getEnabledExtensions()` reads an observable, as `getStore` does
  for the page of the Clusters (AGENTS.md, "CRD KubeObject Pattern";
  `test/freelens-extensions.ts`).
- `src/renderer/details/cluster-details-v1beta2.test.tsx` (P10, P11, P17): the
  row Tenant a link with the extension enabled, `MaybeLink` to the address of
  the details of the host at `v1alpha1`, whose click stops there; text with the
  extension disabled, the name of the package in the text, and the row that
  follows the change with no remount; the heading Replicas; the row Versions
  with the label.
- `src/common/views/cluster-tree.test.ts` (P13), a test of the tree of
  SPEC-0005: the tree of each Kamaji set against its expected tree, written in
  `integration/__tests__/tree-expectations.ts` with the Cluster of its state,
  which the cases of every state read
  (`src/common/views/cluster-tree.test.ts:113-119`; P8): the control plane a
  leaf, with no node Templates and none not found, and the workers as those of
  any Cluster; from the reads of P16, TenantControlPlane among the kinds of
  which no state has a node (`src/common/views/cluster-tree.test.ts:121-135`),
  and no node of its kind when its read is refused or fails at its first load,
  or is held back after a refresh that failed, each written by the case. The
  tree of SPEC-0005 already gives each, so each is seen failing once against a
  break of the tree, printed: an absent
  `spec.machineTemplate.spec.infrastructureRef` taken for a template not found
  (`src/common/views/references.ts:258-263`); the TenantControlPlanes that the
  tree reads for the row Tenant put into the kinds that `indexTree` indexes
  (`src/common/views/cluster-tree.ts:542-580`), whose index by Cluster
  (:568-579) gives them to the last rows of SPEC-0005, P7; and their kind
  counted among those kinds, which `kindReadOf` (:593-624) reads as not read and
  `placeKinds` (:1761-1791) turns into the node of SPEC-0005, P12 when its read
  is refused, fails or is held back.
- `src/common/views/node-details.test.ts` (P13, P17), a test of the tree of
  SPEC-0005: the details of the node of the KamajiControlPlane with the
  counters, the versions and the row Tenant.
- `src/common/views/tree-cells.test.ts` (P10), a test of the tree of SPEC-0005:
  the cell Replicas in replicas.
- `src/renderer/read-only.test.ts`: the two cases of "Safety", each seen failing
  on a planted line.
- `test/environment.test.ts` (P2 to P8), each case in the pull request that
  brings what it checks ("Notes and deviations"): the pins of the provider, of
  MetalLB, of helm, of the files of the chart of Kamaji, of `kamaji-etcd` and of
  the Kamaji extension, each refused without its digest, as the other pins; the
  archive of `kamaji-etcd` that `helm dependency build` downloads checked
  against its pin before the install, seen failing once on an archive changed
  for the purpose; the cluster of the captures, its record, its checks, on Linux
  on amd64 alone, any other system or processor refused by name, and the setting
  of `nf_conntrack_max` raised and given back; the providers of that cluster,
  `PROVIDERS` and the Kamaji control plane provider at its pin, and one missing,
  one at another release and one more each refused; the commands,
  `pnpm e2e:fixtures:capture:kamaji` with the Kamaji states alone, and
  `pnpm e2e:fixtures:capture all` with none of them, which it says, seen failing
  once against the Kamaji states in the list that `capture all` takes; the nine
  states, how each is reached, held and waited for, the KamajiControlPlane of
  each with one replica, its Service of type `LoadBalancer` and the addons
  CoreDNS and kube-proxy (P1), the helper Cluster of `kamaji-provisioning` in a
  namespace of its own, which the capture does not read, and its wait, the quota
  of the scripts, the wait of `kamaji-paused`, which stops the capture when its
  KamajiControlPlane has `Paused`, the finalizer on the KamajiControlPlane, the
  grace of the Machines for `kamaji-sleeping` and `kamaji-not-ready`, and their
  removal with the workload cluster, the helper deleted with the Cluster of its
  state; the kinds that a capture reads, the two of Kamaji on the cluster of the
  captures and on the cluster of the definitions, and none of them on the
  cluster of the real project, seen failing once against the two kinds named on
  every cluster; the definitions of the provider on the first tier with the
  label `control-plane-kamaji`; the toggles of a KamajiControlPlane and of a
  TenantControlPlane, each set and unset on an object of the generation that it
  gives, seen failing once against the toggles of SPEC-0002, which refuse a
  KamajiControlPlane whose `Available` observed the generation before its own,
  which the case writes as the set of `kamaji-version-refused` will hold one,
  the set coming in a later pull request; the cleaning of a TenantControlPlane,
  every checksum replaced and the names of its Secrets and ConfigMaps kept, its
  own `status.observedGeneration` read and every other `observedGeneration` of
  its status kept, also one above its generation, seen failing once against the
  rule of SPEC-0002, which refuses it; the two messages of core with their times
  moved, on a capture and on an apply alike,
  `Remote connection probe failed, probe last succeeded at` in the
  `RemoteConnectionProbe` and in the message of the `Available` of a Cluster,
  and `Last successful probe at` in the `NodeReady` and the `NodeHealthy` of a
  Machine and in a message that repeats it, and every other time inside a text
  still refused, seen failing once against the cleaning of SPEC-0002, which
  refuses those words; the README of a Kamaji set with the versions, the run,
  the SHA-256 of each file and the six cells of the row of
  `clusterctl describe cluster`, read by the columns of its header from outputs
  of the command that the case writes, a cell left empty by clusterctl kept
  empty and a deleting Cluster found after `!! DELETED !!`; each file of the
  Kamaji sets of the repository against those digests, seen failing once on a
  changed file, and no checksum in those sets but the fixed value of P6, seen
  failing once on a checksum written for the purpose; and the workflow of the
  captures, read as a file: run on `workflow_dispatch` alone, and an artifact of
  the folders of the Kamaji sets alone, seen failing once on a workflow changed
  for the purpose.
- `test/kamaji-describe.test.ts` (P6): for each Kamaji state, the row of the
  Cluster that `clusterctl describe cluster` printed at its capture, from the
  README of its set, against the details computed from the set: the status and
  the reason of `Available`, and the counters of the control plane and of the
  workers summed as the project sums them, a cell empty where neither writes
  its counter, as on `kamaji-provisioning`, as the session of the real tier
  compares them (`summedCounters` of
  `integration/__tests__/real-project-checks.ts:76-100`); seen failing once on
  a README whose cells were changed for the purpose.
- `test/restricted-access.test.ts`: the grants of the restricted identity cover
  the KamajiControlPlanes in the namespaces of the Kamaji states, in every
  access, and the definition `kamajicontrolplanes.controlplane.cluster.x-k8s.io`
  is among those read by their names, granted in both accesses of case 3.

### In Freelens, on the definitions and the fixtures

The sessions of SPEC-0004 and SPEC-0005 read the nine states as they read the
others, on the cluster of the definitions, in the integration workflow, on
Freelens 2.1.0, the release of its matrix (SPEC-0004, P33; SPEC-0001, A8), and
each fails on any error that either process logs (AGENTS.md, "Workflows"):

1. `integration/__tests__/clusters.tests.ts`: the row of the Cluster of each
   Kamaji state, its health, its tone, its activities, with Unknown and the
   words of its tooltip on every state but `kamaji-deleting`, whose Cluster
   holds Deleting alone (P9), its counters with replicas in their tooltip, its
   version from the control plane with its tooltip, and its status, as the table
   of the unit cases gives them at the time of the session, `N/A/1` and the
   version N/A with the tooltip "Control plane: N/A, not written yet" on
   `kamaji-provisioning`; the details of `kamaji-healthy`: the section Control
   plane with its link to the details of the host of the KamajiControlPlane at
   `v1alpha2`, its counters headed Replicas, the row Versions with the label,
   and the row Tenant as the text of an extension not enabled, since this
   session installs no Kamaji extension; the details of `kamaji-provisioning`,
   its counters "1 desired" and N/A for each other, and no row Versions; those
   of `kamaji-sleeping`, each counter 0 and the mark of SPEC-0003, P25 on the
   control plane; and, by `recordRequests`
   (`integration/__tests__/extension-helpers.ts:1238-1254`), that no request of
   the frame goes to `kamaji.clastix.io` while the session runs, the condition
   of P16 while the Kamaji extension is not installed, seen failing once on a
   run planted for it ("Safety").
2. `integration/__tests__/cluster-tree.tests.ts`: the tree of `kamaji-healthy`,
   the node of the KamajiControlPlane a leaf, its role, its replicas and its
   version, its workers, no node of a TenantControlPlane, and its details with
   the row Tenant as text.
3. `integration/__tests__/clusters-restricted.tests.ts`: its grants cover the
   KamajiControlPlanes in the namespaces of the Kamaji states, so that no other
   refusal arrives when a step reads them, as case 4 does over the whole cluster
   (SPEC-0004, P23). Case 3, S2, is for a reference to a kind of a provider that
   a user who may not list the definitions resolves through the definition read
   by its name (SPEC-0004, "A7, S5, S6 and S2"). As it stands, it reads
   `default` with the page and the namespace of `healthy` with the details of
   its Cluster (`integration/__tests__/clusters-restricted.tests.ts:713-765`),
   so no Kamaji Cluster and no GET of
   `kamajicontrolplanes.controlplane.cluster.x-k8s.io` is in it. That definition
   goes among its grants, in both of its accesses, as that of the
   KubeadmControlPlane is
   (`integration/__tests__/clusters-restricted.tests.ts:142-151`;
   `integration/__tests__/restricted-access.ts:91-95`), and the case opens the
   details of the Cluster of `kamaji-healthy` too, in its first step: its
   control plane is a link to the details of the host for the KamajiControlPlane
   at `v1alpha2`, from the contract label of its definition read by its name,
   the one reference of a second provider in the role of control plane that S2
   then shows; and its row Tenant says that the Kamaji extension is not enabled,
   the case of P17 that this identity is shown, since the session installs no
   Kamaji extension. Among the grants and not the refusals: the second step of
   the case already shows a definition refused by its name, on the DevCluster,
   and a refusal of the definition of the KamajiControlPlane would show the same
   words for another kind. The rows of P17 for definitions that cannot be listed
   or a kind that cannot be read need the Kamaji extension enabled under a
   restricted identity, which no session runs: they come from the APIs that the
   host registers from the discovery (SPEC-0004, P20) and from the read states
   of SPEC-0004, P25, which this session shows for the other kinds, and the unit
   cases check them (Unit).
4. The read-only checks of each, with the groups of the Kamaji kinds, and the
   check that no request reads a Secret, each seen failing on its own planted
   run ("Safety").
5. `integration/__tests__/fixtures.tests.ts`: it opens each state that
   `TEST_FIXTURE_STATE` names, which the integration workflow sets to
   `healthy,kamaji-healthy`, and finds the kind of each object through the kinds
   that the scripts read on the cluster of the definitions, the two of Kamaji
   among them (P6), so that every run checks that the host lists the
   KamajiControlPlane and the TenantControlPlane of `kamaji-healthy`; today it
   opens one state and finds each kind through the kinds of the fixtures alone
   (`integration/__tests__/fixtures.tests.ts:36-53`;
   `.github/workflows/integration-tests.yaml:349-356`).

### The two extensions together

**P18.** Proposed: a session of the integration tests,
`integration/__tests__/clusters-kamaji.tests.ts`, tries this extension next to
the Kamaji extension, as SPEC-0004, P29 tries S6 next to another extension of
the organization, on the cluster of the definitions with the fixtures, in the
integration workflow, on Freelens 2.1.0: the kind of the tenant is served at its
one version there (P8; H1), so it needs neither the real project nor a
conversion. The Kamaji extension is `@freelensapp/kamaji-extension` 2.0.1 (K19),
from the file of its package on the npm registry, which the scripts download and
check against its pin, with a `.sha256` beside it, so that the host installs it
as a build that it verified, as S6 installs its package (SPEC-0004, "Notes and
deviations"; H1, H2). It runs in the app that the sessions share: on Freelens
2.1.0 an uninstall leaves the list of the enabled extensions without the Kamaji
extension, at once, after a reload and after a restart, whether it was disabled
first or not (H5), so no session after it sees it.

1. It installs the Kamaji extension from that file, next to this checkout.
   Expected: both enabled, "2.0.1, verified", and no error in either process
   (H6).
2. It opens the details of the Cluster of `kamaji-healthy` from the page of the
   Clusters, the global filter of namespaces selecting its namespace alone.
   Expected: the row Tenant is the link of P17; a click opens the details of the
   host for the TenantControlPlane at `kamaji.clastix.io/v1alpha1` over those of
   the extension, with the custom resource section of the host, found by a
   printer column of the kind, and after it the panel of the Kamaji extension,
   found by an item of its own, Write Permissions (H8); the close icon of the
   host shows the details of the extension again, their parameter still in the
   address; and one Escape closes both, clears both parameters (H8), and leaves
   the focus on the name of the Cluster in the list, which opened the details
   of the extension (P17; SPEC-0004, P15), seen failing once on a build whose
   details give no focus back on that Escape.
3. The same from the tree of `kamaji-healthy`, from the details of the node of
   the KamajiControlPlane, over the drawer of the tree. Expected what SPEC-0005
   settles for its links to the details of the host, and nothing more: the row
   Tenant is the link; the details of the host for the TenantControlPlane open
   over the drawer of the tree, with the panel of the Kamaji extension, the
   parameters of the page kept; the close icon of the host shows the details of
   the node again; and one Escape closes both (P17; SPEC-0005, P5, P17). The
   focus over the tree, a click on a row under the details of the host and an
   Escape in the search are left to the session of the tree, which checks them
   on the link of a DevMachine (SPEC-0005, "Tests").
4. It opens the page of the tenants of the Kamaji extension, at the address of
   its own extension (K20; `openExtensionPage` with its name). Expected: it
   lists the TenantControlPlane of `kamaji-healthy`, the page reading the global
   filter of namespaces that step 2 set
   (kamaji-extension:tenants-page.tsx:85-117), found by the cell of its name,
   never by the first cell of its row, which is a checkbox (H9).
5. It opens again the details of the host for the tenant from the row Tenant,
   sets a label on that TenantControlPlane with kubectl, then removes it.
   Expected: the details of the host show the label, and then no longer, with no
   reload: they follow their object while a subscription covers its namespace
   (SPEC-0004, P31), here the store of TenantControlPlanes of the page of the
   Clusters, which watches the namespace that the filter selects (P16); the row
   Tenant stays a link; and no watch of `kamaji.clastix.io` or of
   `cluster.x-k8s.io` fails, which the client of the host logs
   (`recordWatchFailures`). The page of the tenants is checked for listing the
   tenant alone (step 4): it shows no label, in a column or through its search
   (H9). The session records its write, and the removal of the label, by the
   version that the answer of the server carries, as the session of the Clusters
   records its own (SPEC-0004, "Notes and deviations").
6. It disables the Kamaji extension from the Extensions page, then enables it
   again, with the details of the host closed and no page of the Kamaji
   extension open in the frame of the cluster, which shows the page of the
   Clusters with the details of `kamaji-healthy`.
   Expected: the row Tenant turns to the text of P17 with no reload, and back to
   the link (H5); and, by `recordRequests`, no request of the frame goes to
   `kamaji.clastix.io` from the disable to the enable, the store of P16 having
   left and the Kamaji extension, its pages closed, requesting nothing (H10),
   seen failing once on a run planted for it ("Safety"). A page of the Kamaji
   extension open in the frame would send the frame to `/overview` at the
   disable (H7), which the step avoids.
7. The read-only checks of "Safety", with `kamaji.clastix.io` among the groups
   that the views read: every request of the frame to them a GET, a list or a
   watch, and no request of the frame for a Secret.
8. At its end, also when a step failed, it removes the label and uninstalls the
   Kamaji extension, which leaves the list clean on Freelens 2.1.0 with no
   disable before it (H5).

The session never presses an icon of the toolbar of the details of the host by
its position: there the icon of the Kamaji extension that saves the kubeconfig
of a tenant, which reads a Secret, sits beside the edit and the delete of the
host (H8); it finds the close icon of those details by what it is, never by its
place among the icons, or closes them by Escape, and presses nothing on the page
of the tenants but the cell of a name (H9). The Kamaji extension requests
`kamaji.clastix.io` only while one of its pages is open, one list and one watch
of each kind, over the whole cluster when every namespace is selected, nothing
from its panel or with its pages closed, and nothing once disabled or
uninstalled, and the probe saw no refusal or throttling answered to the
application (H10). A refusal or a throttling that the API server answers to a
request of the Kamaji extension, if a run shows one, is decided by the frame and
the page that logged it, as it arrives, and left out only when it is that
extension's alone (kit, `docs/testing.md`, "Checks worth trusting"), never by
the group of the request, since `kamaji.clastix.io` is a group that this view
reads too (P16), where S6 could leave out the groups of its other extension,
which this view does not read (SPEC-0004, "Notes and deviations"). The pins hold
the Kamaji extension as they hold the extension of S6: its version as it numbers
it and the SHA-256 of its file (P3), with no rule of Renovate (TESTING.md, "The
pins"). The reasons: the roadmap asks a test of the two extensions together
(ROADMAP.md:44), and the kit codifies what can be codified and verifies nothing
only once (kit, `docs/testing.md`, "Non-regression policy").

### With the real project

None. The real project runs no Kamaji (P2), and no job runs the provider after
the capture (P7). The job of the capture checks each state as it captures it, by
the wait of each state (P5), and records the row that
`clusterctl describe cluster` prints of it, which a unit case compares with the
details (P6).

### Manual verification

None but the check of the themes (kit, `docs/design.md`, "How it is enforced"),
whose screenshots come from a machine at hand that runs the application, or from
CI when no machine at hand runs it (kit, `docs/testing.md`, "What runs when"):
then the sessions of the Clusters, of the tree and of P18 run from a branch made
for it, with one job for each theme, set in the profile of Freelens dev before
it starts, and the branch is deleted once the screenshots are read. In the
`freelens` theme of 2.1.0, dark and light, and in its High Contrast theme, dark
and light, they take the screenshots of the list with the Kamaji Clusters, of
the details of `kamaji-healthy`, `kamaji-scaling`, `kamaji-provisioning` and
`kamaji-version-refused`, of the tree of `kamaji-healthy`, and, from P18, of the
row Tenant as a link and of the details of the host of the tenant over those of
the extension. The pull request shows them in a comment, until the pass before
the review of M1 runs it (SPEC-0007). The fixtures are synthetic, so the
screenshots carry no data of a real environment (kit, `docs/safety.md`, "Data of
real environments").

## Changes to the approved specs

The pull request of this spec adds to the "Notes and deviations" of each
approved spec, as its last entry, the text that follows the name of that spec
below, which takes effect with the implementation of the rule that it names, as
the kit asks of a change to an approved spec (kit, `docs/specs.md`, "Evidence"),
and lists these documents among those that it changes. This spec assumes
`engines.freelens` `^2.1.0` and the jobs of CI on Freelens 2.1.0 alone, by the
decision of 2026-11-26 that SPEC-0001, A8 records in a pull request of its own,
before this one; it changes nothing of A8.

- **SPEC-0001**: Amended by SPEC-0028, as the maintainer decided on 2026-11-26:
  A2 and A3 have one exception. The extension reads the TenantControlPlanes of
  `kamaji.clastix.io` at `v1alpha1`, for their name, their namespace and their
  owner references only, only while the Kamaji extension of the organization,
  `@freelensapp/kamaji-extension`, is enabled, and never their Secrets, so that
  the details of a Cluster whose control plane is a KamajiControlPlane link its
  tenant (SPEC-0028, P14 to P17). It is the one kind of another project that the
  extension reads, and the rule of A3 that the extension never requests a
  version of a kind other than the one A2 names admits this version of this
  kind, and no other.
- **SPEC-0002**: Amended by SPEC-0028, for the captures of a Cluster with a
  KamajiControlPlane, each a departure from this spec that the rule of
  SPEC-0028 that it names says:
  - a cluster of the captures of its own, `freelens-capi-kamaji`, made by
    `pnpm e2e:cluster:up:kamaji` on Linux on amd64 alone, with the providers of
    the pins and the Kamaji control plane provider at its pin and nothing else,
    whose states `pnpm e2e:fixtures:capture:kamaji` captures one at a time,
    while `pnpm e2e:fixtures:capture all` leaves them out (SPEC-0028, P2, P3,
    P5, P7);
  - on the host of that cluster, `net.netfilter.nf_conntrack_max`, which the
    scripts write and give back at `down`: a second setting of the kernel
    beside the limits of inotify that they raise, and a write beyond the kind
    cluster and the containers of its workload clusters, to which "Safety"
    keeps them ("Design"; SPEC-0028, P2, P3);
  - pins of other projects with no rule of Renovate, each with its digest: the
    provider, MetalLB, helm, the files of the chart of Kamaji, `kamaji-etcd` and
    the Kamaji extension, which change with the spec that reads them again
    ("Design", "The pins"; SPEC-0028, P3, P18);
  - on the first tier, definitions of other projects than Cluster API: those
    of the Kamaji control plane provider, with the label
    `cluster.x-k8s.io/provider` that clusterctl gives them,
    `control-plane-kamaji`, in place of that of its release, and those of the
    TenantControlPlane and of the DataStore, as the chart of Kamaji has them
    ("Design", "The first tier, the definitions alone"; SPEC-0028, P8);
  - the two kinds of Kamaji read on the two clusters that serve them alone
    (SPEC-0028, P6);
  - a field of the spec to set and unset on the first tier for a
    KamajiControlPlane, `spec.dataStoreSchema`, and for a TenantControlPlane,
    `spec.dataStoreOverrides`, beside those of a Cluster, a Machine and a
    DevMachine, which the apply refuses today for another kind ("Notes and
    deviations"; SPEC-0028, P8);
  - three changes of the cleaning, each with its case: the time of the last
    probe that succeeded, in the words that core writes once its probe of a
    workload cluster has failed after a success,
    `Remote connection probe failed, probe last succeeded at` and
    `Last successful probe at`, each matched by its own words, moves as the
    time of a field, and every other time inside a text is still refused; the
    rule on generations reads the `status.observedGeneration` of a
    TenantControlPlane alone, and keeps every other `observedGeneration` of its
    status as captured; and every checksum in the status of a
    TenantControlPlane gets one fixed value (SPEC-0028, P6);
  - the holds of the Kamaji states, objects of the scripts in the namespace of
    each, a ResourceQuota on Pods and the finalizer
    `test-environment.freelens.app/fixture` on a KamajiControlPlane, which the
    capture removes before it deletes the workload cluster, as it removes its
    hooks; and, within the capture of `kamaji-provisioning`, a helper Cluster
    of the scripts in a namespace of its own, which the capture does not read,
    whose tenant takes the one address of the pool, deleted with the Cluster of
    the state (SPEC-0028, P5);
  - the two states whose workload cluster stops answering read past the grace
    of the conditions of the Nodes of their Machines (SPEC-0028, P5);
  - in the README of each Kamaji set, the SHA-256 of each of its files, against
    which a case checks the files, and the six cells of the row of
    `clusterctl describe cluster` (SPEC-0028, P6, P8);
  - a workflow that uploads the folders of the sets, for which TESTING.md
    amends its sentence on what no workflow uploads (SPEC-0028, P7);
  - the session of the fixtures opens two states at each run, `healthy` and
    `kamaji-healthy`, which the integration workflow names in
    `TEST_FIXTURE_STATE`, and finds the kind of each object through the kinds
    that the scripts read on the cluster of the definitions, the two of Kamaji
    among them ("Notes and deviations"; SPEC-0028, "Tests").
- **SPEC-0003**: Amended by SPEC-0028, P9, for P1: a control plane of a provider
  that has none of `RollingOut`, `ScalingUp` and `ScalingDown`, and its Cluster,
  keep the activity Unknown, and the model gives each, with that Unknown, a
  note, `activities-not-written`, with the three types and, for the Cluster, the
  kind and the name of its control plane; one that is deleting holds Deleting
  alone, with no note; no result changes but the notes.
- **SPEC-0004**: Amended by SPEC-0028:
  - the tooltip of the cell of the activity says the note
    `activities-not-written` of SPEC-0003, P1, next to the activity Unknown,
    for that note alone (P7, P12; SPEC-0028, P9);
  - the counters of a control plane carry the word of what it counts: a
    KubeadmControlPlane, Machines, by its kind, read or not, with no spinner
    for the word, and so the control plane Machines of a Cluster with no
    reference; a control plane of another kind, the spinner while its object
    loads, then the word that its object gives, Machines when it has
    `spec.machineTemplate` and replicas when it has none, and replicas when it
    cannot be read; the count of a version takes the same word (P8, P9, "The
    details"; SPEC-0028, P10);
  - a Cluster with no version in its topology and none in
    `status.controlPlane.versions` shows the `status.versions`, else the
    `status.version` when it is not empty, of its control plane, with the label
    "deprecated" for the second in the details and in the tooltip of the cell,
    and the spinner only when neither the topology nor
    `status.controlPlane.versions` gives a version and that object loads (P9,
    "The details"; SPEC-0028, P11);
  - the section Control plane of the details gains the row Tenant for a
    KamajiControlPlane ("The details"; SPEC-0028, P12, P17), a link to the
    details of the host for an object of another project while the Kamaji
    extension is enabled, and text otherwise (P18; SPEC-0028, P17);
  - one Escape that closes the details of the host over those of the extension
    gives the focus back to the name that opened the latter once both have
    closed, whatever their order (P15, P18; SPEC-0028, P17);
  - the views read the TenantControlPlanes within the terms that the maintainer
    decided (SPEC-0001, "Notes and deviations"); as SPEC-0028 proposes, through
    a dependent store of the page and the stores of a view of one Cluster,
    `KindFeeds` gaining `tenant`; whether the cluster serves their kind comes
    from the store of definitions of the host, or, when that store cannot be
    read, from the APIs that the host registers from the discovery of the
    cluster, as P20 reads them, and no definition of Kamaji is read by its name
    ("What the view reads", P19, P20, P25, P31; SPEC-0028, P16, P17);
  - they read, of the spec of a control plane of a provider, the presence of
    `spec.machineTemplate`, and, of the spec of a KamajiControlPlane, the
    presence of `spec.deployment.externalClusterReference` and no field under
    it ("What the view reads", "Safety"; SPEC-0028, P10, P14);
  - the restricted session grants the KamajiControlPlanes, and reads their
    definition by its name in its case 3 (P23; SPEC-0028, "Tests").
- **SPEC-0005**: Amended by SPEC-0028, P13: the TenantControlPlane of a
  KamajiControlPlane is no node (P8), the last rows of P7 leave it out, and its
  kind, which is no kind of the tree, makes no node when its read is refused or
  fails at its first load, or is held back after a refresh that failed, unlike a
  kind of P12; the tree reads the TenantControlPlanes for the row Tenant of the
  details of a control plane (P6, P17), through a store that the read of one
  Cluster builds once its first loads have ended, their kind being none of those
  whose first loads the tree waits for (P13; SPEC-0028, P16); the notice of the
  tree for their kind says that the details of the node of the control plane
  show the tenant as text, with the reason, until it can be read, and names no
  node of it, an exception to the note of this spec on the words of the notices
  of the tree, those of `treeNotices` (SPEC-0028, P16); the tooltip of the cell
  of the activity says the note of SPEC-0028, P9, as in the list; the cell
  Replicas of a control plane and its details take the word of SPEC-0028, P10,
  and the versions in the details of its node follow SPEC-0028, P11 (P9, P17).
  The Kamaji sets of SPEC-0028 hold a control plane of a provider at the
  contract `v1beta2`, which "Notes and deviations" lists among the captures
  still missing: only the one at `v1beta1` stays missing.

## Notes and deviations

Filled during implementation.

Every rule below is proposed in this draft for the approval to confirm or
reopen, and listed for the review of the milestone, but for P16, whose exception
the maintainer decided on 2026-11-26, which is the maintainer's. Each adds to
the kit, to SPEC-0001, SPEC-0002, SPEC-0003, SPEC-0004 or SPEC-0005, or departs
from them, and the last column says why. No row waits for a probe or for the job
of the captures (kit, `docs/specs.md`, "Evidence").

| Rule | What the kit, SPEC-0001 to SPEC-0005 or AGENTS.md say                                                                                                                                                                                         | What the rule adds or changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | A static object covers a state that the views tell apart, and carries only what the controller writes (kit, "The test environment has two tiers"); one set by hand (SPEC-0002)                                                                | Nine captured states of a Cluster with a KamajiControlPlane of one replica, a Service of type `LoadBalancer` and the addons CoreDNS and kube-proxy, which the kind does not default, seven of them with a worker; the provisioning of L7, the other pauses, a deletion with its workers, a scale and an upgrade with no quota, the way back from 0 and a tenant elsewhere at the unit layer or left out                                                                                                                   | The probes reached these nine and the views tell them apart (L7 to L17, L22 to L25); the worker of the probe joined with those addons (L4); the others add nothing of Kamaji to the sets, pass in seconds, or are SPEC-0011                                                                                                                                                                                                           |
| P2   | One cluster of the real project, whose checks refuse providers at another release (TESTING.md)                                                                                                                                                | A kind cluster of its own for the captures, on Linux on amd64 alone, any other refused by name, deleted by `down`, which gives the setting of the host back                                                                                                                                                                                                                                                                                                                                                               | The provider is at its own release; the demo stays as `up` makes it; the setting of P3 needs the host, and the pin of helm is for Linux on amd64                                                                                                                                                                                                                                                                                      |
| P3   | The pins of SPEC-0002                                                                                                                                                                                                                         | The four providers of the real tier, MetalLB and a pool of one address, Kamaji from its chart with the `kamaji-etcd` that `helm dependency build` downloads, checked before the install, and its telemetry off, the provider from its release, helm, all pinned with digests and with no rule of Renovate; `nf_conntrack_max` on the host; the check of the providers with the Kamaji one; the tenants at the versions of the pins                                                                                        | What the probes installed, which ran (L1 to L4, L21); a capture reads the kinds of every provider of the pins; no worker joined in the probe without the setting, which no runner tried (L4, L20)                                                                                                                                                                                                                                     |
| P4   | None                                                                                                                                                                                                                                          | A DevCluster for every Cluster, the gate `SkipInfraClusterPatch`, and the endpoint of the tenant written in the DevCluster of every state but `kamaji-provisioning`                                                                                                                                                                                                                                                                                                                                                       | A Cluster with no infrastructure cluster is never available; the provider stops on a DevCluster without a gate; the other gate needs a role the release lacks; a worker joins the endpoint that core copies first, which a Cluster with no worker does without (L4, L5, L28)                                                                                                                                                          |
| P5   | The scripts make short states last, each set saying how (TESTING.md); a state is captured once every controller has reported (kit, "The test environment has two tiers")                                                                      | One capture at a time; the waits of the probes; a helper Cluster that takes the address within the capture of `kamaji-provisioning`, a ResourceQuota of the scripts, 0 replicas, a pause with no event, a finalizer of the scripts; two states read past the grace of their Machines, once the probe of core has failed                                                                                                                                                                                                   | Each holds what the provider writes in that state long enough to read twice (L8, L10 to L16, L21, L23 to L26); with no event, the provider writes nothing on a KamajiControlPlane that settled (K5, K6; L15, L25); core writes the conditions of a Machine past its grace with the one time that the capture moves, and no other time of core reaches these states (K23); a state that does not hold fails its capture                |
| P6   | The cleaning of a capture (SPEC-0002; TESTING.md)                                                                                                                                                                                             | The two kinds of Kamaji read on the clusters that serve them; the times of the probe of core moved, in its two messages; the generation of a TenantControlPlane read from its own `status.observedGeneration`, every other kept; every checksum replaced; a README with the versions, the run, the digests and the six cells of the row of `clusterctl describe cluster`                                                                                                                                                  | A list that names a kind not served fails whole; core writes the time of its last probe in a text, which does not move (L23); the generation under the TenantControlPlane is that of its Deployment, one above its own (L27); the checksums come from Secrets and ConfigMaps; the digests tie each file to its README; the six cells hold no time and no address (L22)                                                                |
| P7   | The jobs of the two tiers (SPEC-0002; TESTING.md); no workflow uploads a file of a cluster (TESTING.md:470-471)                                                                                                                               | A workflow dispatched by hand, which uploads the folders of the sets alone, on `main` in a pull request of its own before the sets; the sentence of TESTING.md amended; a static test; 60 minutes; a refusal of Docker Hub fails it, and it is dispatched again                                                                                                                                                                                                                                                           | The roadmap captures the objects once; GitHub dispatches a workflow only from the default branch; a runner names nothing real; its limit is revised from the durations of its runs, as TESTING.md sets every limit                                                                                                                                                                                                                    |
| P8   | The definitions of SPEC-0002 on the first tier, as their releases have them; a field to toggle for a Cluster, a Machine and a DevMachine (SPEC-0002)                                                                                          | The definitions of the provider, with the label that clusterctl gives them, and of Kamaji there, in the first pull request; the nine sets applied with the others; a field to toggle for a KamajiControlPlane and for a TenantControlPlane; two checks of the files, and the log of the capture                                                                                                                                                                                                                           | The views read the Kamaji Clusters next to the others; the reads of the scripts name the kinds of Kamaji there; SPEC-0003, P24 finds a controller by that label; `kamaji-version-refused` needs the first toggle; a file changed without its digest fails, and only the log shows one changed with it; the probe of the host read TenantControlPlanes there (H1)                                                                      |
| P9   | Unknown for a control plane that writes no activity, and for its Cluster (SPEC-0003, P1)                                                                                                                                                      | The same Unknown, with the note `activities-not-written` and its words in the tooltip of the cell and in the details, and Deleting alone on an object that is deleting; Paused as the probe saw it                                                                                                                                                                                                                                                                                                                        | The provider never writes them (L17); the counters cannot stand in; Idle would be a guess; the Unknown had no cause                                                                                                                                                                                                                                                                                                                   |
| P10  | Counters in Machines (SPEC-0004, P8; DESIGN.md)                                                                                                                                                                                               | The word of what a control plane counts: Machines for a KubeadmControlPlane, read or not, with no spinner, and for an object with `spec.machineTemplate`; for a control plane of another kind, the spinner while its object loads, and replicas when it has none or is not read; the same word for a version                                                                                                                                                                                                              | The contract asks `spec.machineTemplate` of a control plane of Machines; replicas is the word of the contract and claims nothing; the Kamaji counters count Pods (L9, L11)                                                                                                                                                                                                                                                            |
| P11  | The version of the topology, else `status.controlPlane.versions` (SPEC-0004, P9); a deprecated form with a label (kit, "Status")                                                                                                              | Else the `status.versions`, then a `status.version` that is not empty, of the control plane, the spinner only when neither the topology nor `status.controlPlane.versions` gives one and that object loads; the label in the details, and in the tooltip of the cell                                                                                                                                                                                                                                                      | The Cluster copies `status.versions` alone and the provider writes `status.version` alone (L17, L22); the project reads the version so, and an empty one as none; a label in the cell would read as a word on the version                                                                                                                                                                                                             |
| P12  | The section Control plane (SPEC-0004, "The details")                                                                                                                                                                                          | The row Tenant, the counters of P10, the versions of P11; no field of the spec of a KamajiControlPlane                                                                                                                                                                                                                                                                                                                                                                                                                    | Its own view is SPEC-0011                                                                                                                                                                                                                                                                                                                                                                                                             |
| P13  | A control plane with its Machines and its template; objects labelled with the Cluster placed by their owners; a node for a kind that cannot be read (SPEC-0005, P6, P7, P12)                                                                  | A leaf with no node not found; the TenantControlPlane no node, in P8 of SPEC-0005, and its kind no node when its read is refused, fails or is held back after a refresh that failed, which the notice of the tree says without a node                                                                                                                                                                                                                                                                                     | It names no template and makes no Machine; the model has no rule for the tenant, which the Kamaji extension shows; the row Tenant and the notice of the tree say a refusal                                                                                                                                                                                                                                                            |
| P14  | Owners by group, kind and name (SPEC-0005, P7)                                                                                                                                                                                                | The tenant by its name, its namespace and its owner reference of controller; one elsewhere said, never looked for whatever the store of its namespace holds, its Secret never read                                                                                                                                                                                                                                                                                                                                        | No field names it; the owner reference tells the provider's from another of the same name (L16)                                                                                                                                                                                                                                                                                                                                       |
| P15  | None                                                                                                                                                                                                                                          | `Common.App.getEnabledExtensions()`, read in an observer                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No page of the documents of the host describes a way; it is a public member, names extensions by their package, and follows a disable, an enable and an uninstall at once (H4, H5); an extension enabled but not loaded stays in it, from the source of the host (K21; H8)                                                                                                                                                            |
| P16  | The kinds and versions of SPEC-0001, A2 and A3; a definition read by its name only for a kind that a reference names (SPEC-0001, A2)                                                                                                          | Decided by the maintainer on 2026-11-26: TenantControlPlanes at `kamaji.clastix.io/v1alpha1`, name, namespace and owners, while the Kamaji extension is enabled, never their Secrets; Proposed: read in the page, and in the reads of one Cluster through a store built once their first loads have ended; `KindFeeds` gains `tenant`; and whether the cluster serves the kind comes from the store of definitions, or, when it cannot be read, from the APIs that the host registers from the discovery, with no request | The exception as decided; a link needs its target read; no permission is asked and no refusal shown without the Kamaji extension, whose name leaves the list at a disable or an uninstall (H5); A2 and the decided terms give no read of a definition of Kamaji by its name, and SPEC-0004, P20 reads the APIs of the host with no request; the tree waits for the first load of every store that its read has built (SPEC-0005, P13) |
| P17  | A reference is a link when its target exists (kit, "Details"; kit, "The pre-review pass"); a link to the details of the host for an object of a provider (SPEC-0001, A6); the focus back on the name that opened the details (SPEC-0004, P15) | The row Tenant: a link to the details of the host, where the Kamaji extension shows its panel, while it is enabled; text that says why otherwise, the package named in the text; no row of a kind not served before the host knows the kinds that it serves, from its definitions or, for a user who may not list them, from its discovery; the focus back on the name once both details have closed on one Escape                                                                                                        | The roadmap gives the way through the Kamaji extension; its page selects no tenant and shows no label (H9); without it nothing needs the tenant; the details of the host over a drawer behave as P17 says (H8), and over the tree as SPEC-0005 settles; nothing settles the order in which one Escape closes both. It departs from the kit while the Kamaji extension is not enabled                                                  |
| P18  | Nothing is verified only once (kit, "Non-regression policy"); S6 (SPEC-0004, P29)                                                                                                                                                             | A session of the two extensions together on the first tier, on Freelens 2.1.0, the Kamaji extension from its pinned package, in the shared app; the focus after one Escape; the label checked in the details of the host; no request of `kamaji.clastix.io` while the Kamaji extension is disabled; no icon of a toolbar pressed by its position                                                                                                                                                                          | The roadmap asks it; the kind of the tenant needs no conversion there; an uninstall leaves the list clean (H5); the page shows no label (H9); the toolbar holds an action that reads a Secret (H8); step 3 checks what SPEC-0005 settles over the tree, and nothing more                                                                                                                                                              |
| P19  | The review of a milestone on the demo of `pnpm demo:up` (kit, `docs/review.md`)                                                                                                                                                               | The Kamaji Clusters looked at on the cluster of the definitions, with their fixtures; a walk in TRY-IT.md                                                                                                                                                                                                                                                                                                                                                                                                                 | The demo runs no Kamaji; the roadmap captures the objects once; a live stack would weigh on every review                                                                                                                                                                                                                                                                                                                              |

Decided by the maintainer on 2026-11-26, on the exception that the first draft
proposed in P16: the extension reads the TenantControlPlanes of
`kamaji.clastix.io` at `v1alpha1`, for their name, their namespace and their
owner references only, only while the Kamaji extension is enabled, and never
their Secrets; nothing wider. SPEC-0001 records the exception in its "Notes and
deviations" ("Changes to the approved specs").

Nothing waits for the job of the captures, which cannot run before the approval:
its workflow reaches `main` in the first pull request of the implementation
(P7), and no pull request of the implementation is opened before the approval
(kit, `docs/process.md`, "The loop"). What the probes did not reach stands on
the facts, each in its rule: the tenant of `kamaji-provisioning` gets no address
by a helper Cluster within its capture, as both probes held the state (P5; L8,
L21); `kamaji-paused` holds for its readings, the provider writing nothing on a
KamajiControlPlane that settled, with no event of it (P5; K5, K6; L15, L25);
`kamaji-sleeping` and `kamaji-not-ready` are read past the grace of their
Machines, whose conditions core then writes with the one time that the capture
moves, the capture refusing any other time inside a text (P5, P6; K23); and the
job has 60 minutes, a limit revised from the durations of its runs, as
TESTING.md sets every limit (P7). The second probe settled the rest: the quota
holds `kamaji-scaling`, `kamaji-upgrading` and `kamaji-not-ready`, and
`kamaji-upgrading` settles, held by it (L24, L25); the generation that the
Deployment of a tenant observed is one above that of its TenantControlPlane in
every settled state, whose own `status.observedGeneration` equals its generation
(L27); and `clusterctl describe cluster` prints what P6 keeps of it (L22).

Nothing waits for the probe of the host. What it did not reach (H11) is decided
as each rule says: an extension enabled but not loaded stands on the source of
the host and on the details with no panel that the probe saw (P15); the reads of
P16 and the row Tenant are checked by the unit cases and the sessions, as every
rule (P16, P17); over the tree, the details of the host behave as SPEC-0005
settles for its links, which step 3 of P18 checks, and nothing more (P17, P18);
and the restricted session checks the row Tenant that it is shown, the rows for
definitions that cannot be listed or a kind that cannot be read coming from the
APIs that the host registers from the discovery (SPEC-0004, P20) and from the
read states of SPEC-0004, P25, which the unit cases check (Tests). The probe ran
Freelens dev alone, as the sessions do, not a packaged Freelens.

Captures still missing, as SPEC-0005 lists its own (SPEC-0005, "Notes and
deviations"): a tenant in another cluster, for SPEC-0011; a control plane of a
provider at the contract `v1beta1`, which SPEC-0005 already lists, the Kamaji
sets holding one at `v1beta2` ("Changes to the approved specs").

Proposed: the spec is implemented in three pull requests, in this order, since
GitHub dispatches the workflow of the captures only from the default branch
(P7), each leaving every job of CI green. DESIGN.md takes the copy that this
draft holds in the pull request of this spec, as DESIGN.md and the kit ask and
as SPEC-0005 did (kit, `docs/design.md`, "How it is enforced"), and each pull
request updates the row of the roadmap (kit, `docs/specs.md`, "The roadmap").

1. **The captures, with no set.** The cluster of the captures and its commands
   (P2, P3); the pins of P3 but that of the Kamaji extension, with their checks;
   the reads of the scripts that name the two kinds of Kamaji (P6); the cleaning
   of P6; the toggles of P8; the definitions of the provider, with the label of
   P8, and of Kamaji on the first tier; the workflow of the captures and its
   static test (P7); the cases of `test/environment.test.ts` on what it brings,
   each case going in the pull request that brings what it checks: here every
   case of that file that "Tests" lists but three, that of the toggles included,
   which writes a KamajiControlPlane as the set of `kamaji-version-refused` will
   hold one, its `Available` observing the generation before its own, since that
   set comes later; the three are the two cases on the Kamaji sets of the
   repository, no checksum but the fixed value of P6 and each file against the
   digests of its README, which come with the sets (2), and the case of the pin
   of the Kamaji extension, which comes with that pin (3); and what TESTING.md
   and AGENTS.md say of them. The nine states are known to
   `pnpm e2e:fixtures:capture:kamaji` alone, in a list of their own, and not to
   `statesOf(["all"])` (`e2e/scripts/states.mts:995-1008`). It needs the
   definitions on the first tier because its reads name the kinds of Kamaji
   there, in one `kubectl get` that would fail whole without them (P6): with
   both in it, `pnpm e2e:fixtures:up all` in the integration workflow and
   `pnpm e2e:fixtures:check` in `test-environment.yaml` read every namespace as
   before. No session reads a Kamaji state, since none is in `all`, and the
   workflow of the captures runs on no pull request (P7).
2. **The sets and the corrections of the views.** The nine sets, from a run of
   that workflow dispatched on a branch made for it, which join
   `statesOf(["all"])` with all that their joining needs: the commands, which
   keep them out of `pnpm e2e:fixtures:capture all` on the real project (P7);
   the check of the folders of the fixtures and the states that the unit tests
   read (P8); the expectations of the sessions that read every state, that of
   the Clusters (`integration/__tests__/clusters.tests.ts:60-71`) and that of
   the tree; the expected trees of the nine sets, with the Clusters of their
   states (`integration/__tests__/tree-expectations.ts:21-37, 39-455`), which
   the unit cases of the tree read for every state
   (`src/common/views/cluster-tree.test.ts:113-135`), and the definition of the
   KamajiControlPlane, with the labels of P8, and its API at `v1alpha2` in the
   stub of the host (`test/host-stores.ts:58-80, 154-195`), without which the
   read of the tree of every state would take the control plane of a Kamaji
   state for one not served
   (`src/renderer/reads/cluster-namespace-read.test.tsx:998-1016`; P8); the
   grant of the restricted identity on `kamajicontrolplanes`, without which its
   case 4, which lists the Clusters of every state over the whole cluster and
   requires no error, would be refused the list of the KamajiControlPlanes that
   a Kamaji Cluster names
   (`integration/__tests__/clusters-restricted.tests.ts:107-109, 663-708`;
   SPEC-0004, P23), and that on their definition by its name, for its case 3;
   the session of the fixtures on `healthy,kamaji-healthy`; the checks of the
   files (P8), with the two cases of `test/environment.test.ts` on the Kamaji
   sets, no checksum but the fixed value of P6 and each file against the digests
   of its README, and the comparison of the row of `clusterctl describe cluster`
   of each README with the details (`test/kamaji-describe.test.ts`); and the
   corrections of the views, P9 to P13, with their unit cases and the
   expectations of the sessions on the new states (Tests). No view of this
   extension reads a TenantControlPlane in it, the session of the fixtures alone
   listing the one of `kamaji-healthy` through the list of the host for its
   kind, and every session that reads every state knows the nine.
3. **The tenant.** The reads of P16 and the row Tenant with its link (P14 to
   P17), their unit cases, those of the tree on the TenantControlPlanes among
   them (P13), the row Tenant in the sessions of the Clusters, of the tree and
   of case 3 of the restricted session, the check that nothing of
   `kamaji.clastix.io` is requested while the Kamaji extension is not installed,
   the session of the two extensions together with the pin of the Kamaji
   extension and its case of `test/environment.test.ts` (P18), and the documents
   that the tenant completes: ARCHITECTURE.md, the README and TRY-IT.md. The
   restricted session installs no Kamaji extension, so its identity needs no
   grant on the TenantControlPlanes, and each session that the row Tenant
   reaches changes with it.

The first pull request, the captures with no set, implements the list of its
item above, and these were decided while implementing it:

- Decided while implementing: the pins of P3 are five objects of the pins file,
  each refused without its digest, as the others: `kamajiProvider`, its release
  and the SHA-256 of its two files; `kamaji`, its edge release, the one kind of
  release that it publishes, the commit of that tag, and the SHA-256 of each of
  the 27 files of `charts/kamaji` at that commit, by its path, each path inside
  that folder, `Chart.yaml`, `Chart.lock`, `values.yaml` and the two definitions
  of P8 required among them; `kamajiEtcd`, `metallb` and `helm`, each one file
  with its version and its SHA-256. The digests of the chart were computed from
  the blobs at the commit, and `pnpm e2e:pins:check` downloads each file from
  its source and checks it; the digest of `kamaji-etcd` is the `digest` that the
  index of `https://clastix.github.io/charts` records for its archive, from
  which `pnpm e2e:pins:check` downloads it.
- Decided while implementing: `helm dependency build` takes the repository that
  the lock names only once `helm repo add` has added it, which the scripts do
  in the homes of helm in their state folder, so that no repository of the user
  applies; the folder `charts` of the chart must then hold the pinned archive
  alone, checked against its pin, and the pinned helm must report the version
  of its pin.
- Decided while implementing: the third definition of the folder `crds` of the
  chart, that of the KubeconfigGenerator, is not applied on the first tier,
  which P8 does not name; the first tier takes from the release of the provider
  every document of kind `CustomResourceDefinition`, the KamajiControlPlane and
  its template, each with its label `cluster.x-k8s.io/provider` given the
  value `control-plane-kamaji`, and refuses a definition without one such label
  in its metadata.
- Decided while implementing: the one address of the pool of MetalLB is 56
  below the end of the IPv4 subnet of the network `kind`, `<prefix>.255.200` of
  a /16 as the probes took it, and a subnet smaller than a /24 or not IPv4 is
  refused; the pool and its L2 advertisement are applied again every 2 s, 60
  times at most, once the controller and the speaker of MetalLB have rolled
  out; the DataStore `default` is waited for by its `status.ready`.
- Decided while implementing: the scripts give the host the value of
  `net.netfilter.nf_conntrack_max` that kube-proxy computes whenever the host
  has another one, a higher one too, since kube-proxy writes it whenever it
  differs (L4); they count the processors that Node lists; they record the
  value from before their first change in the folder of the cluster of the
  captures, once the new one is set, so that a value that `sudo -n sysctl`
  could not set leaves no record; and a value that they cannot set stops the
  command, where the limits of inotify only warn, since no worker becomes ready
  without it (L4), with the command that sets it by hand. `down` gives it back,
  with no sudo and forgetting the record when the host holds that value
  already, and fails, keeping the state, when it cannot, with the command that
  gives it back by hand; it gives it back also when it stops before it deletes
  anything, because Docker is not the local one or does not answer, or kind
  cannot list its clusters, since that deletes nothing and reaches no cluster,
  and for that it checks Docker itself, under the lock of the run.
  `pnpm e2e:fixtures:capture:kamaji` sets it too, once it has checked the
  cluster of the captures and its providers, before which it changes nothing of
  the host, and refuses any system but Linux on amd64, as
  `pnpm e2e:cluster:up:kamaji`.
- Decided while implementing: a Cluster of a Kamaji state is named as its
  namespace, as the clusters of the captures of SPEC-0002 are, and so are its
  KamajiControlPlane and its tenant; the KamajiControlPlane names the DataStore
  `default`, the address `10.128.0.10` for the Service of CoreDNS in the service
  network of the Cluster, and the `kubelet` of the first probe, `cgroupfs`
  `systemd` and the address type `InternalIP`, with which its worker joined
  (L4). `kamaji-version-refused` asks for the minor after
  `workloadKubernetesVersion` of the pins, `v1.38.0`, computed and not pinned.
- Decided while implementing: the waits of P5, state by state, in
  `e2e/scripts/kamaji.mts`: `kamaji-provisioning` once its DevCluster is
  provisioned, the Cluster `InfrastructureReady` `True`, its tenant made and
  waiting at `TenantControlPlaneAddressReady` `False` `Pending`, stopped when
  the tenant gets an address; `kamaji-scaling` and `kamaji-upgrading` once the
  Deployment of the tenant reports the Pod that the quota refused,
  `ReplicaFailure` `True`, stopped when the change went through;
  `kamaji-not-ready` deletes the Pods of the tenant by the selector that its
  TenantControlPlane writes; and the objects that sum up a worker Machine past
  its grace are its `Ready`, the `MachinesReady` of its MachineSet and of its
  MachineDeployment and the `WorkerMachinesReady` of its Cluster, each no longer
  `True` (K23).
- Decided while implementing: the cases of the nine states take each check
  that a state waits for, in `e2e/scripts/kamaji.mts` and in the rules of
  SPEC-0002 that P5 takes for `kamaji-healthy` and `kamaji-paused`, as a wait
  of its own: for each, readings that miss that check alone, held for the three
  readings of a capture, before the readings of the state, which the capture
  reads, each case seen failing once against that check broken alone; with the
  wait of the states that start from `kamaji-healthy` before their change, that
  of the helper of `kamaji-provisioning`, and the `missed` of every state that
  has one.
- Decided while implementing: `clusterctl describe cluster` runs with its
  default flags once two readings agree, and the third reading follows it; the
  README writes the six cells as a list, a cell that the tool leaves empty as
  `empty`, and the digests of the files as a list; the run of CI is the address
  of the run and of its attempt, from the variables that GitHub Actions sets,
  and a set captured outside CI says so.
- Decided while implementing: the fixed value of a checksum is
  `00000000000000000000000000000000`, given to every string that is not empty
  under a key `checksum` in the status of a TenantControlPlane; an empty one,
  no checksum, stays. The toggles of P8 set `spec.dataStoreSchema` to
  `test-environment` and `spec.dataStoreOverrides` to an empty list.
- Decided while implementing: `capture-kamaji` has its own list of states,
  `KAMAJI_STATES`; every other command refuses a Kamaji state, naming the one
  that takes it, and `capture` says, as it starts, that it leaves them out. The
  artifact of the workflow names the nine folders one by one, with
  `if-no-files-found: error`, and a step prints the SHA-256 of each file of the
  sets from outside the scripts, besides the scripts.
- Seen while implementing, on a machine at hand with Linux on amd64, where the
  machine shut its Linux down between two commands and its Docker started the
  node of the cluster of the captures again: the webhooks of Cluster API
  refused the first apply of a capture, and the Kamaji control plane provider,
  started again with the node, watched no TenantControlPlane, its log naming no
  source of that kind (K8), so that the scale of `kamaji-scaling` never reached
  its KamajiControlPlane. Decided while implementing: before its first state,
  the capture waits for every Deployment of the controllers of the cluster,
  starts the provider again once the cluster serves TenantControlPlanes, and
  sends a server-side dry run of the objects of a Cluster of Kamaji until the
  webhooks answer; and it removes the workload clusters of every Kamaji state
  and of the helper, which a run that was stopped can leave holding the one
  address of the pool. In CI the node does not start again between the two
  commands, and the start of the provider costs some seconds.
- Seen while implementing, on that machine, with the scripts of this pull
  request: `pnpm e2e:cluster:up:kamaji` took about five minutes, and the nine
  states were captured one at a time, each set passing every check that the
  unit cases make of the sets of the repository, written as the scripts write
  it, every owner in it, nothing that a cleaning leaves out, no time inside a
  text, a generation that the first tier can give each object, no checksum but
  the fixed value, and each file the one whose SHA-256 its README holds. In
  shape: `kamaji-provisioning`, four objects, its KamajiControlPlane with
  `TenantControlPlaneCreated` `True` and `TenantControlPlaneAddressReady` `False`
  `Pending` alone, no counter and an empty version, its tenant with no status,
  its Cluster with `desiredReplicas` 1 alone, and the row `0/1`, three cells
  empty, `False` `NotAvailable`; its Cluster at the phase Provisioned, its
  DevCluster provisioned, where the first probe read it Provisioning 8 s after
  its apply (L8). Every state with a worker, thirteen objects, but
  `kamaji-deleting`, seven, its worker gone with its ClusterResourceSetBinding,
  its Cluster at `WaitingForControlPlaneDeletion`, and its KamajiControlPlane
  deleting at generation 2, its conditions and `Available` `True` observing 1.
  `kamaji-scaling` at 3 asked and 1 of each counter, `Unknown`, the quota having
  refused a Pod; `kamaji-upgrading` with no replica up to date and its old
  version, `Upgrading`, `Available` `True`; `kamaji-version-refused` with
  `TenantControlPlaneCreated` `False` `Pending` observing generation 2 and
  `Available` `True` observing 1; `kamaji-sleeping` and `kamaji-not-ready` at 0
  of 0 and 0 of 1, the probe of core failed and the worker Machine `Unknown`
  `ConnectionDown` past its grace, the time of the last probe moved in their
  messages; `kamaji-paused` with no `Paused` on its KamajiControlPlane. The
  sets stay out of the repository: those to commit come from a run of the
  workflow of the captures (P7).

The first revision of this draft took the facts of the first probe of the
provider, L1 to L20, and of the probe of the host, H1 to H11, and the two
reviews of the first draft, of 14 findings and of 25; the second took the facts
of the second probe of the provider, L21 to L29, and the two halves of the
second review, of 21 findings and of 20; the third took the third review, of 12
findings, and left no rule waiting for the job of the captures; and the fourth
took the last review, of 10 findings, with the first part of SPEC-0005 on
`main`. Each finding was checked against its source before it was applied. They
changed the facts K2, K3, K5, K6, K7, K10, K11, K15, K16, K19 and K23, and K11
says what the second probe corrected. The first draft named Freelens 2.0.0 too;
the decision on `engines.freelens` leaves 2.1.0 alone (SPEC-0001, A8), on which
an extension that is uninstalled leaves the list of the enabled ones (K21; H5).

Facts for later specs, which this spec decides nothing about: a
KamajiControlPlane has the subresource `scale` (K4), for SPEC-0018, and no field
of the contract for a rollout (K3), for SPEC-0020: the contract reads
`spec.rollout.after` of a control plane (controlplane.go:201-206).
