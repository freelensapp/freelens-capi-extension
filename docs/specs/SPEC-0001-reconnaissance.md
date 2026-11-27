# SPEC-0001: Reconnaissance

- **Status:** Approved
- **Milestone:** `M1`, the first milestone of the roadmap, which is written
  once this spec is approved
- **Reviewed project:** Cluster API `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`
- **Freelens:** 2.1.0, tag `v2.1.0`
- **Dependencies:** none
- **Approval:** Approved by the maintainer on 2026-11-22, with the roadmap,
  as drafted after its two independent reviews

This spec has no code of its own. It goes from Draft to Approved and stays
there: the specs that build on it carry the implementation.

## Goal

Fix the facts about Cluster API that every other spec of this extension
builds on, and the first decisions that follow from them: how the extension
reaches the data, what it never does, how the states of Cluster API map to
what the views show, and what can only be proven by trying.

## Upstream reference

The sources that were read, at the tag and commit of each. They are a
reference for behavior: nothing is copied from them. The types of the kinds
are written in the extension from the schemas of the release.

| Source                                     | At                          | License    | Read for                                                                                                                                                                                      |
| ------------------------------------------ | --------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubernetes-sigs/cluster-api`              | `v1.14.4`, `4356c154f4a7`   | Apache-2.0 | The reviewed release: the types in `api/`, the definitions in the `config/crd/bases` folders, the controllers, the webhooks, `util/conditions`, `cmd/clusterctl`, the book in `docs/book/src` |
| `kubernetes-sigs/cluster-api`              | `v1.15.0-beta.1`, `7c5d60c` | Apache-2.0 | Only what the next minor changes. A prerelease: nothing here relies on it                                                                                                                     |
| `kubernetes-sigs/cluster-api-operator`     | `v0.30.1`, `2b43298`        | Apache-2.0 | The kinds that stand for the inventory of `clusterctl` in a management cluster installed by the operator                                                                                      |
| `freelensapp/freelens`                     | `v2.1.0`, `c4700f9`         | MIT        | What the host shows and offers around custom resources, and the extension API                                                                                                                 |
| `freelensapp/freelens-example-extension`   | `5c75d60`                   | MIT        | The template this repository started from                                                                                                                                                     |
| `freelensapp/freelens-sveltos-extension`   | `v2.1.0`, `2fec578`         | MIT        | How it reads Cluster API Clusters, to stay consistent with it                                                                                                                                 |
| `freelensapp/freelens-kubeswift-extension` | `v1.0.0`, `49e92de`         | MIT        | The patterns for many kinds across API groups                                                                                                                                                 |
| `freelensapp/freelens-velero-extension`    | `v1.0.0`, `fd68262`         | MIT        | The patterns for protected writes and a test environment in two tiers                                                                                                                         |

In the digest, a path with no prefix is in `kubernetes-sigs/cluster-api` at
`v1.14.4`; any other path is prefixed with the name of its source and a
colon, and `freelens@v2.0.0` marks a file of Freelens at its tag `v2.0.0`.

## Scope

It covers the kinds that a management cluster holds at `v1.14.4`: the core,
the kubeadm bootstrap and control plane, IPAM, the runtime extensions and
the inventory of `clusterctl`, and the seven kinds of the Cluster API
Operator that stand for that inventory. It covers what their status holds,
what ties them together, what `clusterctl` does for each operation the
extension may offer, the endpoints and the permissions, and what Freelens
2.1.0 shows and offers around them.

It leaves to the specs that need them the kinds of each infrastructure
provider, and of control plane and bootstrap providers other than kubeadm:
the extension reads them through the contracts of the book, which R1 and R3
describe. The release `v1.15.0` is not out: what its prerelease changes is
listed, so that the drift watch at the start of each milestone knows what to
look for.

The open questions of the brief, and where each one is answered:

| Question of the brief                                  | Answered in        |
| ------------------------------------------------------ | ------------------ |
| 1. The fields of status, and when they are empty       | R2                 |
| 2. Condition types, reasons and summaries              | R2, H1 to H3       |
| 3. How `clusterctl describe cluster` builds the tree   | R4                 |
| 4. The version of a provider kind                      | R1, A2, S2         |
| 5. What Freelens shows without the extension           | R7, A7             |
| 6. The secrets of a control plane, and the permissions | R3, R6             |
| 7. A management cluster installed with the operator    | R1, R4             |
| 8. Definitions without controllers                     | R4, S1             |
| 9. What `v1.15` changes                                | R1, R2             |
| 10. How the Sveltos extension reads a `Cluster`        | R7, A9             |
| 11. A trademark sentence in the README                 | Left to the README |
| 12. The other software for Cluster API                 | The roadmap        |
| 13. Adding a cluster to the catalog                    | R7, A1, S3         |
| 14. What the host offers on these kinds                | R7, A7             |
| 15. `engines.freelens`                                 | R7, A8             |

The inventory of the features of the other software for Cluster API, which
the brief asks for, is kept outside this repository, where that software can
be named. The roadmap is checked against it.

## Digest

Numbered facts, each one a sentence with its source, as the upstream
reference says. "Inference:" marks a conclusion drawn from the code and not
read in it; "Spike:" marks what only a trial can prove, and the spike is in
the list below.

### R1. The surface

At v1.14.4 a management cluster holds the kinds below; where the Cluster API
Operator installed the providers, it also holds the operator's seven kinds.

| Group                           | Kind                        | Scope      | Versions served                                   | Short names   | Subresources                   | Source                                                                                                                                  |
| ------------------------------- | --------------------------- | ---------- | ------------------------------------------------- | ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `cluster.x-k8s.io`              | Cluster                     | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `cl`          | status                         | `core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:16-19, 39-40, 1861-1864, 3891-3894`                                               |
| `cluster.x-k8s.io`              | ClusterClass                | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `cc`          | status                         | `core/config/crd/bases/cluster.x-k8s.io_clusterclasses.yaml:16-19, 26-27, 2731-2734, 5517-5520`                                         |
| `cluster.x-k8s.io`              | Machine                     | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `ma`          | status                         | `core/config/crd/bases/cluster.x-k8s.io_machines.yaml:16-19, 46-47, 725-728, 1478-1481`                                                 |
| `cluster.x-k8s.io`              | MachineSet                  | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `ms`          | status, scale with selector    | `core/config/crd/bases/cluster.x-k8s.io_machinesets.yaml:16-19, 51-52, 750-757, 1517-1524`                                              |
| `cluster.x-k8s.io`              | MachineDeployment           | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `md`          | status, scale with selector    | `core/config/crd/bases/cluster.x-k8s.io_machinedeployments.yaml:16-19, 60-61, 858-865, 1723-1730`                                       |
| `cluster.x-k8s.io`              | MachinePool                 | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `mp`          | status, scale without selector | `core/config/crd/bases/cluster.x-k8s.io_machinepools.yaml:16-19, 48-49, 710-716, 1451-1457`                                             |
| `cluster.x-k8s.io`              | MachineHealthCheck          | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `mhc`, `mhcs` | status                         | `core/config/crd/bases/cluster.x-k8s.io_machinehealthchecks.yaml:16-20, 43-44, 453-456, 932-935`                                        |
| `cluster.x-k8s.io`              | MachineDrainRule            | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | none          | none                           | `core/config/crd/bases/cluster.x-k8s.io_machinedrainrules.yaml:17, 32-33, 395-397, 773-775`                                             |
| `addons.cluster.x-k8s.io`       | ClusterResourceSet          | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | none          | status                         | `core/config/crd/bases/addons.cluster.x-k8s.io_clusterresourcesets.yaml:17, 24-25, 268-271, 546-549`                                    |
| `addons.cluster.x-k8s.io`       | ClusterResourceSetBinding   | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | none          | status on v1beta1 only         | `core/config/crd/bases/addons.cluster.x-k8s.io_clusterresourcesetbindings.yaml:17, 24-25, 121-124, 235-237`                             |
| `bootstrap.cluster.x-k8s.io`    | KubeadmConfig               | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | none          | status                         | `bootstrap/kubeadm/config/crd/bases/bootstrap.cluster.x-k8s.io_kubeadmconfigs.yaml:17, 28-29, 2326-2329, 4915-4918`                     |
| `bootstrap.cluster.x-k8s.io`    | KubeadmConfigTemplate       | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | none          | none                           | `bootstrap/kubeadm/config/crd/bases/bootstrap.cluster.x-k8s.io_kubeadmconfigtemplates.yaml:17, 24-25, 2249-2251, 4739-4741`             |
| `controlplane.cluster.x-k8s.io` | KubeadmControlPlane         | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | `kcp`         | status, scale with selector    | `controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:16-19, 66-67, 2863-2870, 5998-6005`      |
| `controlplane.cluster.x-k8s.io` | KubeadmControlPlaneTemplate | Namespaced | v1beta1 (deprecated), v1beta2 (storage)           | none          | none                           | `controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanetemplates.yaml:17, 24-25, 2519-2521, 5321-5323` |
| `ipam.cluster.x-k8s.io`         | IPAddress                   | Namespaced | v1alpha1, v1beta1 (deprecated), v1beta2 (storage) | none          | none                           | `core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddresses.yaml:17, 36, 118-120, 138-139, 221-223, 340-342`                               |
| `ipam.cluster.x-k8s.io`         | IPAddressClaim              | Namespaced | v1alpha1, v1beta1 (deprecated), v1beta2 (storage) | none          | status                         | `core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddressclaims.yaml:17, 32, 153-156, 170-171, 366-369, 604-607`                           |
| `runtime.cluster.x-k8s.io`      | ExtensionConfig             | Cluster    | v1alpha1 (deprecated), v1beta2 (storage)          | `ext`         | status                         | `core/config/crd/bases/runtime.cluster.x-k8s.io_extensionconfigs.yaml:16-19, 26-27, 359-362, 728-731`                                   |
| `clusterctl.cluster.x-k8s.io`   | Provider                    | Namespaced | v1alpha3 (storage)                                | none          | none                           | `cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml:17, 33, 74-76`                                              |
| `operator.cluster.x-k8s.io`     | CoreProvider                | Namespaced | v1alpha2 (storage)                                | `cacp`        | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_coreproviders.yaml:14-17, 26, 3246-3249`                               |
| `operator.cluster.x-k8s.io`     | BootstrapProvider           | Namespaced | v1alpha2 (storage)                                | `cabp`        | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_bootstrapproviders.yaml:14-17, 26, 3246-3249`                          |
| `operator.cluster.x-k8s.io`     | ControlPlaneProvider        | Namespaced | v1alpha2 (storage)                                | `cacpp`       | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_controlplaneproviders.yaml:14-17, 26, 3248-3251`                       |
| `operator.cluster.x-k8s.io`     | InfrastructureProvider      | Namespaced | v1alpha2 (storage)                                | `caip`        | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_infrastructureproviders.yaml:14-17, 26, 3248-3251`                     |
| `operator.cluster.x-k8s.io`     | AddonProvider               | Namespaced | v1alpha2 (storage)                                | `caap`        | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_addonproviders.yaml:14-17, 26, 3246-3249`                              |
| `operator.cluster.x-k8s.io`     | IPAMProvider                | Namespaced | v1alpha2 (storage)                                | `caipamp`     | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_ipamproviders.yaml:14-17, 26, 3246-3249`                               |
| `operator.cluster.x-k8s.io`     | RuntimeExtensionProvider    | Namespaced | v1alpha2 (storage)                                | `carep`       | status                         | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_runtimeextensionproviders.yaml:14-17, 26, 3249-3252`                   |

**R1.1** The core provider installs thirteen of these definitions, the kubeadm
control plane and bootstrap providers two each, and clusterctl's own manifest
only Provider (core/config/crd/kustomization.yaml:4-17;
controlplane/kubeadm/config/crd/kustomization.yaml:11-13;
bootstrap/kubeadm/config/crd/kustomization.yaml:11-13;
cmd/clusterctl/config/crd/kustomization.yaml:4-6).

**R1.2** Every object of the three provider manifests, definitions included,
carries the label `cluster.x-k8s.io/provider` with the value `cluster-api`,
`control-plane-kubeadm` or `bootstrap-kubeadm`, and the three controllers run
by default in `capi-system`, `capi-kubeadm-control-plane-system` and
`capi-kubeadm-bootstrap-system`; `clusterctl init --target-namespace` moves
every namespaced component elsewhere, and the Cluster API Operator installs
into the namespace of its provider object
(core/config/default/kustomization.yaml:1-8;
controlplane/kubeadm/config/default/kustomization.yaml:1-8;
bootstrap/kubeadm/config/default/kustomization.yaml:2-9;
cmd/clusterctl/cmd/init.go:112-113;
cmd/clusterctl/client/repository/components.go:242-257;
cluster-api-operator:internal/controller/phase_load.go:93-94).

**R1.3** Every definition of the table but the operator's seven carries the
category `cluster-api`
(core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:11-12;
cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml:11-12;
cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_coreproviders.yaml:9-17).
Inference: a request for that category reaches every kind of the table but the
operator's, and the kinds of a provider only if its definitions declare the
category too.

**R1.4** Every definition that serves v1beta1 marks it `deprecated: true`, with
no custom warning, and stores v1beta2 (table;
core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:39-40, 1861-1862,
3891-3892). Inference: the API server adds its standard deprecation warning to
every request at v1beta1 (Kubernetes behavior, not in these sources).

**R1.5** The book's version table says v1beta1 is deprecated since v1.11 and
stops being served in v1.16, April 2027, and the v1.11.0 changelog records the
deprecation of the v1alpha1 and v1beta1 API packages
(docs/book/src/reference/versions.md:167; CHANGELOG/v1.11.0.md:84).

**R1.6** The v1.14 migration notes put the end of v1beta1 of the core, the
kubeadm bootstrap provider and KCP in v1.16, with every `status.deprecated`
field to follow; the v1.15.0-beta.1 notes give April 2027 for both, instead of
the August 2026 first planned
(docs/book/src/developer/providers/migrations/v1.13-to-v1.14.md:131-135;
cluster-api-v1.15.0-beta.1:docs/book/src/developer/providers/migrations/v1.14-to-v1.15.md:183-189).

**R1.7** IPAddress and IPAddressClaim also serve a v1alpha1 that their
definitions do not mark deprecated, and ExtensionConfig serves a deprecated
v1alpha1 and no v1beta1; the Go packages of both v1alpha1 versions are
deprecated, to be removed when support for v1beta1 is dropped
(core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddresses.yaml:36, 118-120;
core/config/crd/bases/runtime.cluster.x-k8s.io_extensionconfigs.yaml:26-27,
359-360; api/ipam/v1alpha1/doc.go:20; api/runtime/v1alpha1/doc.go:20).

**R1.8** Conversion: the `bases` files carry no conversion stanza, and the
release's kustomizations patch every core, KCP and kubeadm bootstrap definition
with `strategy: Webhook`, review version `v1` and path `/convert` on the
provider's `webhook-service` (core/config/crd/kustomization.yaml:20-35;
core/config/crd/patches/webhook_in_clusters.yaml:8-16;
controlplane/kubeadm/config/crd/kustomization.yaml:16-20;
bootstrap/kubeadm/config/crd/kustomization.yaml:16-20). Provider has one version
and no conversion
(cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml:33,
74-75).

**R1.9** Inference: with the release's definitions and no controller running, a
request at a version other than the stored one fails, because the conversion
webhook has no endpoint, while a request at v1beta2 for objects stored at
v1beta2 needs no conversion; with the bare `bases` files the API server converts
nothing but `apiVersion` (Kubernetes behavior, not in these sources;
core/config/crd/patches/webhook_in_clusters.yaml:8-16).

**R1.10** The v1beta2 printer columns are these, priority 10 in parentheses,
each row with its source; the v1beta1 ones are fewer on most kinds, as for the
Cluster, the same on MachineDrainRule, IPAddress and IPAddressClaim, and some
that v1beta2 lacks, such as MaxUnhealthy on MachineHealthCheck and API Server
Available, Updated and Unavailable on KCP
(core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:21-38, 1865-1935;
core/config/crd/bases/cluster.x-k8s.io_machinehealthchecks.yaml:22-42;
controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:21-66):

| Kind                        | v1beta2 printer columns                                                                                                                                                                 | Source                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Cluster                     | ClusterClass, Available, CP Desired, (CP Current), (CP Ready), CP Available, CP Up-to-date, W Desired, (W Current), (W Ready), W Available, W Up-to-date, (Paused), Phase, Age, Version | `core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:1865-1935`                                                  |
| ClusterClass                | (Paused), Variables Ready, Age                                                                                                                                                          | `core/config/crd/bases/cluster.x-k8s.io_clusterclasses.yaml:2735-2748`                                            |
| Machine                     | Cluster, Node Name, (Provider ID), Failure domain, Ready, Available, Up-to-date, (Internal-IP), (External-IP), (OS-Image), (Paused), Phase, Age, Version                                | `core/config/crd/bases/cluster.x-k8s.io_machines.yaml:729-791`                                                    |
| MachineSet                  | Cluster, Desired, Current, Ready, Available, Up-to-date, (Paused), Age, Version                                                                                                         | `core/config/crd/bases/cluster.x-k8s.io_machinesets.yaml:758-795`                                                 |
| MachineDeployment           | Cluster, Available (the condition), Desired, Current, Ready, Available (the counter), Up-to-date, (Paused), Phase, Age, Version                                                         | `core/config/crd/bases/cluster.x-k8s.io_machinedeployments.yaml:866-911`                                          |
| MachinePool                 | Cluster, Desired, Current, Ready, Available, Up-to-date, (Paused), Phase, Age, Version                                                                                                  | `core/config/crd/bases/cluster.x-k8s.io_machinepools.yaml:717-759`                                                |
| MachineHealthCheck          | Cluster, Replicas (`expectedMachines`), Healthy (`currentHealthy`), (Paused), Age                                                                                                       | `core/config/crd/bases/cluster.x-k8s.io_machinehealthchecks.yaml:457-478`                                         |
| MachineDrainRule            | Behavior, Order (typed string, for an integer field), Age                                                                                                                               | `core/config/crd/bases/cluster.x-k8s.io_machinedrainrules.yaml:398-410`                                           |
| ClusterResourceSet          | Applied (`ResourcesApplied`), (Paused), Age                                                                                                                                             | `core/config/crd/bases/addons.cluster.x-k8s.io_clusterresourcesets.yaml:272-285`                                  |
| ClusterResourceSetBinding   | Cluster, Age                                                                                                                                                                            | `core/config/crd/bases/addons.cluster.x-k8s.io_clusterresourcesetbindings.yaml:125-133`                           |
| KubeadmConfig               | Cluster (from the label), (Paused), Data secret created, Age                                                                                                                            | `bootstrap/kubeadm/config/crd/bases/bootstrap.cluster.x-k8s.io_kubeadmconfigs.yaml:2330-2347`                     |
| KubeadmConfigTemplate       | ClusterClass and Cluster (from owner references), Age                                                                                                                                   | `bootstrap/kubeadm/config/crd/bases/bootstrap.cluster.x-k8s.io_kubeadmconfigtemplates.yaml:2252-2264`             |
| KubeadmControlPlane         | Cluster (from the label), Available (the condition), Desired, Current, Ready, Available (the counter), Up-to-date, (Paused), Initialized, Age, Version                                  | `controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:2871-2916`         |
| KubeadmControlPlaneTemplate | ClusterClass (from an owner reference), Age                                                                                                                                             | `controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanetemplates.yaml:2522-2530` |
| IPAddress                   | Address, Pool Name, Pool Kind, Age                                                                                                                                                      | `core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddresses.yaml:224-240`                                            |
| IPAddressClaim              | Pool Name, Pool Kind, Age                                                                                                                                                               | `core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddressclaims.yaml:370-382`                                        |
| ExtensionConfig             | (Paused), Discovered, Age                                                                                                                                                               | `core/config/crd/bases/runtime.cluster.x-k8s.io_extensionconfigs.yaml:363-376`                                    |
| Provider                    | Age, Type, Provider, Version                                                                                                                                                            | `cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml:19-32`                                |
| The seven operator kinds    | InstalledVersion, Ready                                                                                                                                                                 | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_coreproviders.yaml:19-25`                        |

**R1.11** Some column descriptions are stale: the Cluster `Phase` column still
lists `Failed`, and the description of the `Available` condition column of
MachineDeployment and KCP speaks of the Cluster
(core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:1924;
api/core/v1beta2/machinedeployment_types.go:585;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:874).

**R1.12** The clusterctl `Metadata` kind is never installed: its definition is
left out of the manifest because it is only the format of a provider's
`metadata.yaml` (cmd/clusterctl/config/crd/kustomization.yaml:6;
cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_metadata.yaml:9-17).

**R1.13** The Provider definition is in no provider manifest: clusterctl's
`init`, `delete`, `upgrade`, `move` and, when given no infrastructure provider
or no version, `generate cluster` create it on first use, with the label
`clusterctl.cluster.x-k8s.io/core: inventory`
(cmd/clusterctl/client/cluster/inventory.go:146-272;
cmd/clusterctl/client/init.go:109; cmd/clusterctl/client/delete.go:83;
cmd/clusterctl/client/upgrade.go:67, 154; cmd/clusterctl/client/move.go:152;
cmd/clusterctl/client/config.go:279-287, 307-316;
cmd/clusterctl/cmd/generate_cluster.go:188).

**R1.14** The Cluster API Operator creates no Provider object: it installs the
components without one and answers clusterctl's reads of Provider from its own
kinds (cluster-api-operator:internal/controller/phase_lifecycle.go:102-106;
cluster-api-operator:internal/controller/client_proxy.go:51-76). Inference: from
a search of the checkout, a management cluster installed only by the operator
has no Provider definition either, unless one of the clusterctl commands of
R1.13 was run against it.

**R1.15** The kinds of the infrastructure providers, and of any bootstrap,
control plane, IPAM pool or remediation provider other than the kubeadm ones,
are known only at run time; five contract-versioned references name them by
`apiGroup`, `kind` and `name`, with no version: Cluster `spec.infrastructureRef`
and `spec.controlPlaneRef`, Machine `spec.infrastructureRef` and
`spec.bootstrap.configRef`, and KCP
`spec.machineTemplate.spec.infrastructureRef`; a sixth, the `poolRef` of an
IPAddress or an IPAddressClaim, names an IPAM pool the same way
(api/core/v1beta2/common_types.go:390-417;
api/core/v1beta2/cluster_types.go:497, 502;
api/core/v1beta2/machine_types.go:431, 787;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:502;
api/ipam/v1beta2/ipaddress_types.go:31, 63-88;
api/ipam/v1beta2/ipaddressclaim_types.go:53).

**R1.16** Cluster API finds their version on the definition named
`<plural of the lowercase kind>.<group>`: it reads the label
`cluster.x-k8s.io/v1beta2` or, when that one is missing or empty,
`cluster.x-k8s.io/v1beta1`, ignores any other contract label, and takes the
latest of the versions that label lists, joined by `_`, in Kubernetes version
order (util/contract/contract.go:26-30;
internal/contract/version.go:47-54, 118-144, 173-181;
controllers/external/util.go:53-76).

**R1.17** The KCP and kubeadm bootstrap definitions carry
`cluster.x-k8s.io/v1beta1: v1beta1` and `cluster.x-k8s.io/v1beta2: v1beta2`, and
the core definitions carry no contract label
(controlplane/kubeadm/config/crd/kustomization.yaml:1-6;
bootstrap/kubeadm/config/crd/kustomization.yaml:1-6;
core/config/crd/kustomization.yaml:1-40).

**R1.18** Other references carry a version: ClusterClass `templateRef`s, and the
remediation `templateRef` of a MachineHealthCheck or of a topology health check,
hold `apiVersion`, `kind` and `name`, and MachinePool `status.nodeRefs` are core
references with `apiVersion` `v1`
(api/core/v1beta2/clusterclass_types.go:1559-1583;
api/core/v1beta2/machinehealthcheck_types.go:169-194;
api/core/v1beta2/cluster_types.go:806, 1101;
api/core/v1beta2/machinepool_types.go:123;
core/reconcilers/machinepool/machinepool_controller_noderef.go:218-223).

**R1.19** The repository also ships a development infrastructure provider of
twelve kinds in `infrastructure.cluster.x-k8s.io`, labelled for both contracts;
a management cluster holds them only when that provider is installed, and six of
them mark even v1beta2 deprecated and are planned for removal
(test/infrastructure/docker/config/crd/kustomization.yaml:1-6;
test/infrastructure/docker/config/crd/bases/infrastructure.cluster.x-k8s.io_dockerclusters.yaml:292-293;
docs/book/src/developer/providers/migrations/v1.13-to-v1.14.md:137).

**R1.20** The feature gates at v1.14.4 are a closed set: `MachinePool`,
`MachineSetPreflightChecks`, `PriorityQueue` and `ReconcilerRateLimiting` beta
and on; `MachineWaitForVolumeDetachConsiderVolumeAttachments` GA, on and
deprecated; `ClusterTopology`, `KubeadmBootstrapFormatIgnition`, `RuntimeSDK`,
`InPlaceUpdates` and `MachineTaintPropagation` alpha and off
(feature/feature.go:66-67, 100-112).

**R1.21** No API exposes the gates: each of the three managers takes them in a
`--feature-gates` argument filled from variables at install time, the core one
on the Deployment `capi-controller-manager`, in `capi-system` by default
(R1.2), and an operator object's `spec.manager.featureGates` holds only the
gates the user overrides, merged into that argument
(core/config/manager/manager.yaml:26;
controlplane/kubeadm/config/manager/manager.yaml:25;
bootstrap/kubeadm/config/manager/manager.yaml:25;
core/config/default/kustomization.yaml:1-3;
cluster-api-operator:api/v1alpha2/provider_types.go:193-196;
cluster-api-operator:internal/controller/component_customizer.go:275-290).
Inference: a view learns them only by reading those Deployments, which takes a
permission of its own, or from behavior.

**R1.22** The definitions are installed whatever the gates; what a gate turns
off is the writes the webhooks admit, the controllers that run, and steps of
controllers that do run: the wait for the `BeforeClusterDelete` hook needs both
`RuntimeSDK` and `ClusterTopology`, Cluster and KCP deletion wait for
MachinePools only with `MachinePool` on, and the KCP preflight checks and
remediation and the MachineSet preflight checks wait for a pending topology
version only with `ClusterTopology` on
(core/config/crd/kustomization.yaml:4-17; core/main.go:556-611, 702-711;
core/reconcilers/cluster/cluster_controller.go:347-353, 601-605, 660-662;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:730-737;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/preflight.go:74-90;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/remediation.go:182-196;
core/reconcilers/machineset/machineset_preflight.go:157-170, 232-236).

**R1.23** `ClusterTopology`: without it the webhooks refuse creating or updating
a ClusterClass, creating a KubeadmControlPlaneTemplate, and creating or updating
a Cluster with `spec.topology`, and the ClusterClass and topology controllers do
not run (core/webhooks/admission/clusterclass.go:90-98;
controlplane/kubeadm/webhooks/admission/kubeadmcontrolplanetemplate.go:54-62;
core/webhooks/admission/cluster.go:213-214, 236-248; core/main.go:556-598).

**R1.24** Inference: with `ClusterTopology` off, existing ClusterClasses and
topology Clusters stay readable, but nothing writes ClusterClass status or
`TopologyReconciled`, and the Cluster webhook refuses every update of a topology
Cluster's main resource, so deleting such a Cluster never finishes: removing
the Cluster's finalizer is such an update, and its topology-owned
MachineDeployments and MachineSets keep the topology finalizers that only the
stopped topology controllers remove (core/main.go:556-597;
core/webhooks/admission/cluster.go:155-217, 236-248;
core/reconcilers/cluster/cluster_controller.go:190, 501;
core/reconcilers/topology/machinedeployment/machinedeployment_controller.go:140,
199; core/reconcilers/topology/machineset/machineset_controller.go:147, 226).

**R1.25** `RuntimeSDK`: without it the webhook refuses creating or updating an
ExtensionConfig and a ClusterClass with `patches[].external`, the upgrade plan
of `upgrade.external` fails, and the ExtensionConfig controller, variable
discovery and the lifecycle hooks do not run
(core/webhooks/admission/extensionconfig.go:79-88;
core/webhooks/admission/patch_validation.go:123-130;
exp/topology/desiredstate/upgrade_plan.go:449-453; core/main.go:496-518,
600-611).

**R1.26** `MachinePool`: without it the validating webhook refuses creating and
updating a MachinePool, and its controller does not run; neither MachinePool
webhook is registered for deletion, so a delete is admitted, but a MachinePool
that holds its finalizer then stays terminating, since removing the finalizer,
by hand too, is an update the webhook refuses
(core/webhooks/admission/machinepool.go:51-52, 112-114, 121-130;
core/config/webhook/manifests.yaml:133-153, 416-436; core/main.go:702-711).

**R1.27** The other gates touch fields: `KubeadmBootstrapFormatIgnition` admits
`spec.format: ignition` and `spec.ignition` on KubeadmConfig and on KCP's
`spec.kubeadmConfigSpec`; `MachineTaintPropagation` admits `taints`, which
without it the webhooks of Machine, MachineSet, MachineDeployment, Cluster
topology, ClusterClass, KCP and its template refuse, and makes Machine
`spec.taints` reach the Nodes, while MachinePool template taints are refused
either way; `MachineSetPreflightChecks` runs the MachineSet preflight checks;
`InPlaceUpdates` lets MachineDeployments and KCP update Machines in place
(bootstrap/kubeadm/webhooks/admission/kubeadmconfig.go:83-88, 240-255;
controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane.go:88, 318;
controlplane/kubeadm/webhooks/admission/kubeadmcontrolplanetemplate.go:124;
internal/util/taints/validation.go:33-37;
core/webhooks/admission/machine.go:127;
core/webhooks/admission/machineset.go:222;
core/webhooks/admission/machinedeployment.go:240;
core/webhooks/admission/cluster.go:660-669;
core/webhooks/admission/clusterclass.go:519-528;
core/reconcilers/machine/machine_controller_noderef.go:338-345;
core/webhooks/admission/machinepool.go:171-176;
core/reconcilers/machineset/machineset_preflight.go:50-51;
core/reconcilers/machinedeployment/machinedeployment_rollout_rollingupdate.go:414-424;
controlplane/kubeadm/main.go:393). In the core manager `InPlaceUpdates` needs
`RuntimeSDK`: without it the Machine and MachineDeployment controllers fail
their setup and the manager exits (core/main.go:496-497, 650-662, 692-700;
core/reconcilers/machine/machine_controller.go:131-133;
core/reconcilers/machinedeployment/machinedeployment_controller.go:101-103).

**R1.28** v1.15.0-beta.1 keeps the surface: the nineteen definition files have
the same groups, kinds, scopes, versions, served, storage and deprecated flags,
short names, categories, subresources and printer columns as at v1.14.4
(cluster-api-v1.15.0-beta.1:core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:7-38;
cluster-api-v1.15.0-beta.1:controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:2871-2916).

**R1.29** At v1.15.0-beta.1 `ClusterTopology` and `MachineTaintPropagation`
become beta and on, `PriorityQueue` and `ReconcilerRateLimiting` GA, the GA
volume detach gate is removed, the gates move to the package `pkg/features`, and
two new alpha gates, off, are added: `ClusterClassInlineTemplates` and
`ClusterTopologyWorkerVersionPinning`
(cluster-api-v1.15.0-beta.1:pkg/features/features.go:113-123;
cluster-api-v1.15.0-beta.1:docs/book/src/developer/providers/migrations/v1.14-to-v1.15.md:21-25,
124, 156).

**R1.30** v1.15.0-beta.1 adds fields: worker `version` in Cluster topologies
(gate `ClusterTopologyWorkerVersionPinning`), an inline `template` next to a now
optional `templateRef` in ClusterClasses (gate `ClusterClassInlineTemplates`),
`checks.unhealthyExpressions` in MachineHealthChecks and topology health checks,
Machine `status.deletion.nodeDeletionStartTime`, from which the Node deletion
timeout now counts, and KubeadmConfig `spec.files[].defer`
(cluster-api-v1.15.0-beta.1:api/core/v1beta2/cluster_types.go:913-930,
1290-1307;
cluster-api-v1.15.0-beta.1:api/core/v1beta2/clusterclass_types.go:157-191;
cluster-api-v1.15.0-beta.1:api/core/v1beta2/machinehealthcheck_types.go:124-133;
cluster-api-v1.15.0-beta.1:api/core/v1beta2/machine_types.go:775-780;
cluster-api-v1.15.0-beta.1:api/bootstrap/kubeadm/v1beta2/kubeadmconfig_types.go:370-373).

**R1.31** v1.15.0-beta.1 removes, renames or deprecates no condition type or
reason; it adds the Machine `Updating` reasons `InPlaceUpdateBlocked` and
`InternalError`, the `RollingOut` reasons `WaitingForRolloutDecision` and
`RolloutBlocked` on MachineDeployment and KCP (and `InternalError` on KCP), and
the MachinePool condition `MachinesUpToDate`
(cluster-api-v1.15.0-beta.1:api/core/v1beta2/machine_types.go:203-207;
cluster-api-v1.15.0-beta.1:api/core/v1beta2/machinedeployment_types.go:163-172;
cluster-api-v1.15.0-beta.1:api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:250-259;
cluster-api-v1.15.0-beta.1:api/core/v1beta2/machinepool_types.go:62-84).

**R1.32** Messages change at v1.15.0-beta.1: the `ClusterUpgrading` message of
`TopologyReconciled` gains a colon after the version, and the KCP `ScalingUp`
and `ScalingDown` messages and its `Deleting` message for waiting workers are
reworded
(cluster-api-v1.15.0-beta.1:core/reconcilers/topology/cluster/status.go:228;
cluster-api-v1.15.0-beta.1:controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:369-373,
414-418;
cluster-api-v1.15.0-beta.1:controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:810).
Inference: a view that parses messages breaks across minors.

**R1.33** At v1.15.0-beta.1 MachinePools are still left out of the Cluster's
`WorkersAvailable`, `RollingOut`, `ScalingUp` and `ScalingDown`, MachinePool
infrastructure readiness reads `status.initialization.provisioned` first and no
longer goes back to false, and the topology finalizers of MachineSet and
MachineDeployment are no longer set
(cluster-api-v1.15.0-beta.1:core/reconcilers/cluster/cluster_controller_status.go:60-62,
82, 87-89;
cluster-api-v1.15.0-beta.1:core/reconcilers/machinepool/machinepool_controller_phases.go:373-375;
cluster-api-v1.15.0-beta.1:docs/book/src/developer/providers/migrations/v1.14-to-v1.15.md:106-111,
136-144).

### R2. What a status holds

When status is written

**R2.1** The controllers of Cluster, Machine, MachineSet, MachineDeployment,
MachinePool, KCP and ClusterResourceSet add their finalizer first and return,
so the first reconcile of a new object writes no status, while those of
MachineHealthCheck, KubeadmConfig, ClusterClass and ExtensionConfig add none
(R3.23); the Machine, MachineSet, MachineDeployment, MachinePool and
MachineHealthCheck controllers read the Cluster of `spec.clusterName` first,
so an object that names a missing Cluster gets neither a finalizer nor a
status (core/reconcilers/cluster/cluster_controller.go:152-155;
core/reconcilers/machine/machine_controller.go:213-221;
core/reconcilers/machineset/machineset_controller.go:195-203;
core/reconcilers/machinedeployment/machinedeployment_controller.go:162-170;
core/reconcilers/machinepool/machinepool_controller.go:149-159;
core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:194-198;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:223-226;
core/reconcilers/clusterresourceset/clusterresourceset_controller.go:135-138).

**R2.2** When the Cluster has `spec.paused: true` or the object has the
annotation `cluster.x-k8s.io/paused`, with any value, the controller writes only
the `Paused` condition and returns before computing status, so every other field
and condition keeps its last value (util/paused/paused.go:45-123;
util/annotations/helpers.go:42-45, 124-131;
core/reconcilers/cluster/cluster_controller.go:163-165;
core/reconcilers/machine/machine_controller.go:229-231).

**R2.3** ClusterClass, ExtensionConfig and ClusterResourceSet look only at their
own annotation, not at a Cluster's `spec.paused`, and the
ClusterResourceSetBinding controller only filters out the events of objects
that carry the annotation, so a ClusterResourceSet keeps applying its resources
to a paused Cluster
(core/reconcilers/clusterclass/clusterclass_controller.go:122-124;
core/reconcilers/extensionconfig/extensionconfig_controller.go:191;
core/reconcilers/clusterresourceset/clusterresourceset_controller.go:146-148,
170-193, 260-288;
core/reconcilers/clusterresourcesetbinding/clusterresourcesetbinding_controller.go:64;
util/predicates/generic_predicates.go:217-227).

**R2.4** While the Cluster is paused, the topology controller still writes
`TopologyReconciled` False `Paused`, from a deferred function registered before
that check (core/reconcilers/topology/cluster/cluster_controller.go:293-325;
core/reconcilers/topology/cluster/status.go:86-110).

**R2.5** `status.observedGeneration` is written only by a reconcile that ended
without error, on Cluster, ClusterClass, Machine, MachineSet, MachineDeployment,
MachinePool, MachineHealthCheck, KCP, KubeadmConfig and ClusterResourceSet
(core/reconcilers/cluster/cluster_controller.go:184-189;
core/reconcilers/clusterclass/clusterclass_controller.go:149-152;
core/reconcilers/machine/machine_controller.go:255-259;
core/reconcilers/machineset/machineset_controller.go:231-234;
core/reconcilers/machinedeployment/machinedeployment_controller.go:204-208;
core/reconcilers/machinepool/machinepool_controller.go:207-209;
core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:222-224;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:271-274;
bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:264-266;
core/reconcilers/clusterresourceset/clusterresourceset_controller.go:150-168).
Inference: `observedGeneration` below `metadata.generation` means a change not
yet processed, a failing reconcile or a pause.

**R2.6** ExtensionConfig and IPAddressClaim have no `status.observedGeneration`;
every v1beta2 condition carries its own `observedGeneration`, and its
`lastTransitionTime` changes only when its status changes, truncated to seconds
(api/runtime/v1beta2/extensionconfig_types.go:119-140;
api/ipam/v1beta2/ipaddressclaim_types.go:58-104;
util/conditions/setter.go:58-110).

**R2.7** Besides `lastTransitionTime`, the only times in these statuses are
Machine `lastUpdated`, `certificatesExpiryDate` and four `status.deletion` start
times, and KCP `lastRemediation.time`; the Binding's per-resource
`lastAppliedTime` sits in its spec (api/core/v1beta2/machine_types.go:585, 606,
733-753; api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:859;
api/addons/v1beta2/clusterresourcesetbinding_types.go:39).

Cluster

**R2.8** The Cluster controller computes the whole status in a deferred function
at the end of each reconcile, except while paused (R2.2), for a topology
Cluster whose ClusterClass cannot be read, where it returns an error before
registering that function, so that only `TopologyReconciled`, written by the
topology controller, changes, and when the contract version of its control
plane cannot be read, where it writes nothing, not even the phase
(core/reconcilers/cluster/cluster_controller.go:163-193;
core/reconcilers/cluster/cluster_controller_status.go:45-58;
core/reconcilers/topology/cluster/cluster_controller.go:336-340).

**R2.9** A topology Cluster whose refs the topology controller has not written
yet returns before its descendants are listed
(core/reconcilers/cluster/cluster_controller.go:213-219). Inference: in that
window the worker and Machine aggregates, `RollingOut`, `ScalingUp`,
`ScalingDown` and `Remediating` read Unknown `InternalError`
(core/reconcilers/cluster/cluster_controller_status.go:664-671, 795-802,
843-851, 895-902, 966-974, 1043-1051).

**R2.10** `status.initialization.infrastructureProvisioned` turns true once the
infrastructure cluster reports `status.initialization.provisioned`
(`status.ready` under the v1beta1 contract), or at once with no
`spec.infrastructureRef` while not deleting; it is nil before and never false
(core/reconcilers/cluster/cluster_controller_phases.go:145-152, 183-191,
241-245; internal/contract/infrastructure_cluster.go:58-69).

**R2.11** `status.initialization.controlPlaneInitialized` turns true once the
control plane reports `status.initialization.controlPlaneInitialized`
(`status.initialized` under the v1beta1 contract); it is written only with
`spec.controlPlaneRef`, nil before, never reset
(core/reconcilers/cluster/cluster_controller_phases.go:255-257, 287-295, 347).
Inference: with stand-alone control plane Machines it stays nil and only the
`ControlPlaneInitialized` condition turns True
(core/reconcilers/cluster/cluster_controller_status.go:630-650).

**R2.12** `status.controlPlane` copies `desiredReplicas`, `replicas`,
`readyReplicas`, `availableReplicas`, `upToDateReplicas` and `versions` from the
control plane object, all nil while it is missing or unreadable, and counts
Machines by condition for stand-alone control plane Machines
(core/reconcilers/cluster/cluster_controller_status.go:121-205). Inference: a
counter the provider stops reporting keeps its last value
(core/reconcilers/cluster/cluster_controller_status.go:141-168).

**R2.13** `status.workers` holds the same counters summed over MachinePools,
MachineDeployments, MachineSets owned by the Cluster and stand-alone worker
Machines; they are nil with no workers and not updated when listing fails, and a
nil `spec.replicas` adds nothing to `desiredReplicas`
(core/reconcilers/cluster/cluster_controller_status.go:208-308).

**R2.14** `status.controlPlane.upgradePlan` and `status.workers.upgradePlan` are
reset by every topology reconcile that computes the plan, and hold versions
only while an upgrade is pending, nil otherwise; a reconcile that does not get
to compute the plan keeps the last one
(core/reconcilers/topology/cluster/status.go:44-72;
exp/topology/desiredstate/desired_state.go:132-135;
exp/topology/desiredstate/upgrade_plan.go:105-108).

**R2.15** `status.failureDomains` is copied from the infrastructure cluster once
it is provisioned, set empty when the provider has no such field, and not
written before provisioning, while that object is deleting, or with no
`spec.infrastructureRef`
(core/reconcilers/cluster/cluster_controller_phases.go:145-153, 206-239).

**R2.16** `status.deprecated.v1beta1.failureReason` and `failureMessage` are
copied from the provider objects when not empty
(core/reconcilers/cluster/cluster_controller_phases.go:68-94). Inference: the
controller never clears them.

**R2.17** The Cluster phase is a closed set: `Pending` (first state),
`Provisioning` (an infrastructure or control plane ref is set), `Provisioned`
(infrastructure provisioned and a valid control plane endpoint), `Deleting`
(deletion requested), `Failed` (deprecated, never set, kept for conversion from
v1beta1) and `Unknown` (never written; the typed getter returns it for any other
value) (api/core/v1beta2/cluster_phase_types.go:31-61;
api/core/v1beta2/cluster_types.go:1460-1463, 1626-1640).

**R2.18** `setPhase`, its only writer, applies those rules in that order and the
last match wins; the type says no software should take decisions on the phase
(core/reconcilers/cluster/cluster_controller_status.go:97-119;
api/core/v1beta2/cluster_phase_types.go:19-28). Inference: a topology Cluster
stays `Pending` until its refs exist, and `Provisioned` falls back to
`Provisioning` if the endpoint becomes invalid
(core/reconcilers/cluster/cluster_controller_status.go:100-110).

**R2.19** The v1beta2 Cluster condition types are a closed set apart from
availability gate types; positive means True when healthy, negative means False
when normal, as R2.20 explains (api/core/v1beta2/cluster_types.go:43-477;
core/reconcilers/cluster/cluster_controller.go:248-265;
core/reconcilers/topology/cluster/status.go:85-338):

| Type                           | Polarity | Computed as | Meaning                                                                        |
| ------------------------------ | -------- | ----------- | ------------------------------------------------------------------------------ |
| `Available`                    | positive | summary     | the Cluster is available (R2.21)                                               |
| `TopologyReconciled`           | positive | own         | the managed topology is reconciled; topology Clusters only                     |
| `InfrastructureReady`          | positive | mirror      | the infrastructure cluster's `Ready`, or a fallback                            |
| `ControlPlaneInitialized`      | positive | own         | the control plane is initialized; once True it never changes                   |
| `ControlPlaneAvailable`        | positive | mirror      | the control plane's `Available`, or a fallback                                 |
| `WorkersAvailable`             | positive | aggregate   | the MachineDeployments' `Available`                                            |
| `ControlPlaneMachinesReady`    | positive | aggregate   | the control plane Machines' `Ready`                                            |
| `WorkerMachinesReady`          | positive | aggregate   | the worker Machines' `Ready`, MachinePool Machines left out                    |
| `ControlPlaneMachinesUpToDate` | positive | aggregate   | the control plane Machines' `UpToDate`                                         |
| `WorkerMachinesUpToDate`       | positive | aggregate   | the worker Machines' `UpToDate`                                                |
| `RemoteConnectionProbe`        | positive | own         | the workload cluster answers the probe                                         |
| `RollingOut`                   | negative | aggregate   | the control plane, if it reports it, or a MachineDeployment rolls out          |
| `ScalingUp`                    | negative | aggregate   | the control plane, a MachineDeployment or a Cluster-owned MachineSet scales up |
| `ScalingDown`                  | negative | aggregate   | the same, scaling down                                                         |
| `Remediating`                  | negative | aggregate   | a Machine is being remediated, MachinePool Machines left out                   |
| `Deleting`                     | negative | own         | the stage of the deletion                                                      |
| `Paused`                       | negative | own         | the Cluster is paused                                                          |

**R2.20** Polarity is declared only where conditions are merged: `Deleting`,
`Updating`, `RollingOut`, `ScalingUp`, `ScalingDown` and gates declared
`Negative` are merged as negative, every other merged type as positive, and
`Remediating` and `Paused` are never merged with a polarity and are False in the
normal state (core/reconcilers/cluster/cluster_controller_status.go:929-946,
1006-1023, 1083-1100, 1180-1203;
core/reconcilers/machine/machine_controller_status.go:752-790;
util/paused/paused.go:94-123). Inference: `Remediating` and `Paused` are
negative too, on every kind.

**R2.21** `Available` is the summary of the Cluster: it merges `Deleting`,
`RemoteConnectionProbe`, `InfrastructureReady`, `ControlPlaneAvailable`,
`WorkersAvailable` and `TopologyReconciled`, in that order, then the gates of
`spec.availabilityGates`, or of the ClusterClass when the Cluster's list is nil;
a missing `TopologyReconciled` is ignored only without a topology
(core/reconcilers/cluster/cluster_controller_status.go:1167-1225).

**R2.22** In that summary, while deleting, `InfrastructureReady` and
`ControlPlaneAvailable` with `ObjectDeleted` or `ObjectDoesNotExist` count as
information, and `TopologyReconciled` False counts as information unless its
reason is `ReconcileFailed` or `ClusterClassNotReconciled`; the reasons are
`Available`, `NotAvailable`, `AvailableUnknown`, and `InternalError` when the
summary fails (core/reconcilers/cluster/cluster_controller_status.go:1134-1165,
1210-1222). Inference: `Available` is False whenever the Cluster is deleting,
and can be True with a message during an upgrade.

**R2.23** The `TopologyReconciled` reasons are a closed set, checked in this
order: False `Paused`, False `ReconcileFailed` (with the error), False
`Deleting`, False `ClusterClassNotReconciled`, False `ClusterCreating` (a
`BeforeClusterCreate` hook blocks), False `ClusterUpgrading`,
`MachineDeploymentsUpgradeDeferred` or `MachinePoolsUpgradeDeferred`, else True
`ReconcileSucceeded`; the constants `ControlPlaneUpgradePending`,
`MachineDeploymentsCreatePending`, `MachineDeploymentsUpgradePending`,
`MachinePoolsUpgradePending`, `MachinePoolsCreatePending` and
`LifecycleHookBlocking` are deprecated and never set
(core/reconcilers/topology/cluster/status.go:85-338;
api/core/v1beta2/cluster_types.go:70-147).

**R2.24** Inference: `ClusterClassNotReconciled` is not reached in practice,
because the reconcile already fails on an unobserved class generation or a
`VariablesReady` that is missing or False, which gives `ReconcileFailed` with a
message about the ClusterClass
(core/reconcilers/topology/cluster/cluster_controller.go:342-353;
core/reconcilers/topology/cluster/status.go:112-132, 157-178).

**R2.25** The `Deleting` reasons are a closed set that reads as the progress of
a deletion: False `NotDeleting`, then True `WaitingForBeforeDeleteHook` (a
topology Cluster, with `RuntimeSDK` and `ClusterTopology` on),
`WaitingForWorkersDeletion` (the message lists what remains),
`WaitingForControlPlaneDeletion`, `WaitingForInfrastructureDeletion`,
`DeletionCompleted`, or `InternalError`
(api/core/v1beta2/cluster_types.go:443-477;
core/reconcilers/cluster/cluster_controller.go:341-504).

**R2.26** `InfrastructureReady` and `ControlPlaneAvailable` copy the status,
reason, message and `lastTransitionTime` of the provider's `Ready` and
`Available`, so their reasons are an open set; Cluster API's own are the True
and False fallbacks, `InvalidConditionReported`, `InternalError`,
`ObjectDoesNotExist` and `ObjectDeleted`, and an empty provider reason becomes
`NoReasonReported`, replaced by `Ready` or `Available` when the status is True
(core/reconcilers/cluster/cluster_controller_status.go:349-549;
util/conditions/getter.go:31-32, 238-253;
api/core/v1beta2/cluster_types.go:149-222).

**R2.27** Inference: a Cluster with neither a topology nor
`spec.infrastructureRef` gets `InfrastructureReady` Unknown `InternalError`, and
one with neither a topology nor `spec.controlPlaneRef` gets
`ControlPlaneAvailable` Unknown `InternalError`, so its `Available` never turns
True (core/reconcilers/cluster/cluster_controller_status.go:351, 396-405, 452,
497-506).

**R2.28** `ControlPlaneInitialized` reads the control plane object when
`spec.controlPlaneRef` is set, otherwise the first control plane Machine with a
Node; its reasons are True `Initialized`, False `NotInitialized`, Unknown
`InternalError` and `ObjectDoesNotExist`
(core/reconcilers/cluster/cluster_controller_status.go:551-658;
api/core/v1beta2/cluster_types.go:177-193, 216).

**R2.29** MachinePools are left out of `WorkersAvailable`, `RollingOut`,
`ScalingUp` and `ScalingDown`, and MachinePool Machines out of the worker
Machine aggregates and of `Remediating`; with no MachineDeployment,
`WorkersAvailable` is True `NoWorkers`
(core/reconcilers/cluster/cluster_controller_status.go:60-70, 82-90, 660-717).
Inference: a Cluster whose workers are all MachinePools reports
`WorkersAvailable` True `NoWorkers`.

**R2.30** `RemoteConnectionProbe` is False `ProbeFailed` once no probe has
succeeded for the grace period (`--remote-connection-grace-period`, default
50 s), True `ProbeSucceeded` otherwise; before the first successful probe,
until five probes have failed, it is set False only when absent, so after a
controller restart an old True stays until a probe succeeds or five fail
(core/reconcilers/cluster/cluster_controller_status.go:311-347;
core/main.go:195). Inference: it is the only input of the Cluster status read
from the workload cluster.

**R2.31** `Remediating` is True `Remediating` while a Machine that is not a
MachinePool Machine has `HealthCheckSucceeded` False and `OwnerRemediated`
False, with their `OwnerRemediated` messages, and otherwise False
`NotRemediating`, naming the unhealthy Machines that are not to be remediated
(core/reconcilers/cluster/cluster_controller_status.go:69-70, 90, 842-889,
1248-1275).

**R2.32** The reasons of the Cluster's other aggregates follow one pattern, an
issue, an unknown and an info reason plus `NoReplicas` or `NoWorkers` and
`InternalError`, and are listed with their constants
(api/core/v1beta2/cluster_types.go:224-441).

ClusterClass and ExtensionConfig

**R2.33** The ClusterClass condition types are a closed set: `VariablesReady`
(positive: the variables of the class and of its external patches are collected;
True `VariablesReady`, False `VariableDiscoveryFailed`), `RefVersionsUpToDate`
(positive: every template reference uses the latest version of its kind; True
`RefVersionsUpToDate`, False `RefVersionsNotUpToDate`, Unknown `InternalError`)
and `Paused` (negative) (api/core/v1beta2/clusterclass_types.go:32-66,
1614-1620;
core/reconcilers/clusterclass/clusterclass_controller_status.go:36-110).

**R2.34** A ClusterClass has no summary; what stands for one is the rule the
Cluster webhook and the topology controller apply: a class is reconciled when
`status.observedGeneration` equals `metadata.generation` and `VariablesReady`
exists and is not False (core/webhooks/admission/cluster.go:1015-1028;
core/reconcilers/topology/cluster/cluster_controller.go:343-353).

**R2.35** `status.variables` holds one entry per variable name with its
definitions, each `from` `inline` or a patch name, and `definitionsConflict`; a
failed discovery keeps the old content, and `observedGeneration` lags while a
referenced template is missing
(core/reconcilers/clusterclass/clusterclass_controller.go:149-152, 207-277,
284-352; api/core/v1beta2/clusterclass_types.go:1657-1706).

**R2.36** The ClusterClass has no finalizer, its controller returns before the
status update while it is deleting, and the webhook refuses its deletion while a
Cluster uses it
(core/reconcilers/clusterclass/clusterclass_controller.go:107-164;
core/webhooks/admission/clusterclass.go:73-88).

**R2.37** The ExtensionConfig conditions are `Discovered` (positive, the
summary: True `Discovered`, False `NotDiscovered` with the error) and `Paused`
(negative); `status.handlers` is rewritten by each successful discovery and kept
on failure, and the status is not written with `RuntimeSDK` off, while the
registry warms up, or when the CA named by
`runtime.cluster.x-k8s.io/inject-ca-from-secret` cannot be injected, which
leaves `Discovered` at its last value, True included, and only `Paused` is
written while paused (api/runtime/v1beta2/extensionconfig_types.go:122-128,
290-300; core/reconcilers/extensionconfig/extensionconfig_controller.go:146-211,
268-325, 357-386; core/main.go:600-611).

Machine

**R2.38** `status.initialization.infrastructureProvisioned` turns true once the
infrastructure machine is provisioned and reports a provider ID, and is never
written false; `status.initialization.bootstrapDataSecretCreated` turns true
once a data Secret is known, and is never written without
`spec.bootstrap.configRef`; `status.addresses` and `status.failureDomain` are
copied from the infrastructure machine from that point
(core/reconcilers/machine/machine_controller_phases.go:153-156, 177-239,
311-375).

**R2.39** `status.nodeRef` is set once, when a Node with the same
`spec.providerID` is found, and no code clears it; `status.nodeInfo` is copied
from that Node at each reconcile that finds it
(core/reconcilers/machine/machine_controller_noderef.go:71-119, 218-245;
core/reconcilers/machine/machine_controller.go:784-804). Inference: after the
Node is deleted, `nodeRef` and `nodeInfo` keep their old values.

**R2.40** `status.lastUpdated` is set at each phase change, and
`status.certificatesExpiryDate` only on Machines labelled
`cluster.x-k8s.io/control-plane`, from the annotation
`machine.cluster.x-k8s.io/certificates-expiry` on the Machine or its bootstrap
object, reset when neither has it
(core/reconcilers/machine/machine_controller_status.go:918-954;
core/reconcilers/machine/machine_controller_phases.go:383-420).

**R2.41** `status.deletion` holds `waitForPreDrainHookStartTime`,
`nodeDrainStartTime`, `waitForNodeVolumeDetachStartTime` and
`waitForPreTerminateHookStartTime`, each set when its stage starts and never
cleared; the first three run only when the Node may be deleted: with a
`nodeRef`, while neither the Cluster nor the control plane is deleting, and,
unless the control plane is externally managed, while an active control plane
Machine is left (core/reconcilers/machine/machine_controller.go:480-537,
572-618, 767-857). Inference: a Machine that never had a Node, or that is
deleted with its Cluster, shows at most `waitForPreTerminateHookStartTime`.

**R2.42** With the infrastructure never provisioned, `spec.providerID`,
`nodeRef`, `nodeInfo`, `addresses`, `failureDomain` and
`infrastructureProvisioned` stay empty, the phase is `Pending` or
`Provisioning`, and `NodeReady` and `NodeHealthy` are Unknown
`InspectionFailed`; provisioned with no Node yet, `nodeRef` and `nodeInfo` stay
empty, the phase is `Provisioned`, and the two are Unknown `InspectionFailed`
(core/reconcilers/machine/machine_controller_phases.go:311-375;
core/reconcilers/machine/machine_controller_status.go:400-412, 921-934).

**R2.43** The Machine phase is a closed set: `Pending`, `Provisioning`
(bootstrap data ready, infrastructure not), `Provisioned` (provider ID set),
`Running` (Node found and infrastructure provisioned), `Updating` (in-place
update), `Deleting`, `Deleted` (never set), `Failed` (deprecated, never set) and
`Unknown` (never written; returned for any other value); the rules run in that
order and the last match wins (api/core/v1beta2/machine_phase_types.go:30-72;
api/core/v1beta2/machine_types.go:600, 763-778;
core/reconcilers/machine/machine_controller_status.go:918-954).

**R2.44** Inference: a Machine never goes back to `Pending` and, as `nodeRef` is
never cleared, stays `Running` after its Node is deleted; `NodeHealthy` False
`NodeDeleted` is the signal
(core/reconcilers/machine/machine_controller_status.go:390-398, 921-939).

**R2.45** The Machine condition types are a closed set, readiness gate types
apart (api/core/v1beta2/machine_types.go:100-413, 557-562;
core/reconcilers/machine/machine_controller.go:359-369;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:355-439):

| Type                                                                                                                                                | Polarity            | Written by                         | Meaning                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Available`                                                                                                                                         | positive            | Machine                            | `Ready` has been True for `spec.minReadySeconds`                                                                                                                      |
| `Ready`                                                                                                                                             | positive            | Machine                            | the summary (R2.46)                                                                                                                                                   |
| `UpToDate`                                                                                                                                          | positive            | the owner (R2.52)                  | the Machine matches its owner's template, always True on a pool Machine that is not deleting; absent on stand-alone Machines and on those of a stand-alone MachineSet |
| `Updating`                                                                                                                                          | negative            | Machine                            | an in-place update runs                                                                                                                                               |
| `BootstrapConfigReady`                                                                                                                              | positive            | Machine, mirror                    | the bootstrap object's `Ready`                                                                                                                                        |
| `InfrastructureReady`                                                                                                                               | positive            | Machine, mirror                    | the infrastructure machine's `Ready`                                                                                                                                  |
| `NodeReady`                                                                                                                                         | positive            | Machine                            | the Node's `Ready`                                                                                                                                                    |
| `NodeHealthy`                                                                                                                                       | positive            | Machine                            | the Node's `Ready`, `MemoryPressure`, `DiskPressure` and `PIDPressure` are all normal                                                                                 |
| `HealthCheckSucceeded`                                                                                                                              | positive            | MachineHealthCheck                 | the Machine passes the health check                                                                                                                                   |
| `OwnerRemediated`                                                                                                                                   | False while present | MachineHealthCheck, then the owner | a remediation is pending; removed when the Machine is healthy again                                                                                                   |
| `ExternallyRemediated`                                                                                                                              | False while present | MachineHealthCheck                 | an external remediation is pending; with a remediation template only                                                                                                  |
| `Deleting`                                                                                                                                          | negative            | Machine                            | the stage of the deletion                                                                                                                                             |
| `Paused`                                                                                                                                            | negative            | Machine                            | the Machine is paused                                                                                                                                                 |
| `APIServerPodHealthy`, `ControllerManagerPodHealthy`, `SchedulerPodHealthy`, `EtcdPodHealthy`, `EtcdMemberHealthy`, `NodeKubeadmLabelsAndTaintsSet` | positive            | KCP, on its Machines               | the control plane components, etcd and the kubeadm labels and taints of that Node; the two etcd types with stacked etcd only                                          |

**R2.46** `Ready` is the summary of the Machine: it merges `Deleting` and
`Updating` (negative), `BootstrapConfigReady`, `InfrastructureReady`,
`NodeHealthy` and `HealthCheckSucceeded` (ignored when missing), then each
readiness gate with its polarity, a missing gate counting as Unknown;
`NodeReady` is not an input, and the reasons are `Ready`, `NotReady`,
`ReadyUnknown` and `InternalError`
(core/reconcilers/machine/machine_controller_status.go:516-543, 749-800;
api/core/v1beta2/machine_types.go:134-148).

**R2.47** While the Machine is deleting, `Ready` counts `BootstrapConfigReady`
and `InfrastructureReady` with `ObjectDeleted` or `ObjectDoesNotExist`, and
`NodeHealthy` with `NodeDeleted` or `NodeDoesNotExist`, as information, and
replaces the `Deleting` line with the deletion stage, marked "since more than
15m" after 15 minutes, and with the likely causes of the delay only at the
stage `DrainingNode` once the drain has run for 5 minutes
(core/reconcilers/machine/machine_controller_status.go:519-531, 795-872).

**R2.48** Readiness gate lines of the control plane components (types starting
with `APIServer`, `ControllerManager` or `Scheduler`, and `EtcdPodHealthy`) that
share a message collapse into one line in the `Ready` message
(core/reconcilers/machine/machine_controller_status.go:549-614).

**R2.49** The Machine `Deleting` reasons are a closed set in stage order: False
`NotDeleting`, then True `Deleting` (started), `WaitingForPreDrainHook`,
`DrainingNode`, `WaitingForVolumeDetach`, `WaitingForPreTerminateHook`,
`WaitingForInfrastructureDeletion`, `WaitingForBootstrapDeletion` and
`DeletionCompleted`, with `DeletingNode` and `InternalError` on errors
(api/core/v1beta2/machine_types.go:363-413;
core/reconcilers/machine/machine_controller.go:471-686).

**R2.50** `NodeReady` and `NodeHealthy` share their states without a Node:
Unknown `InspectionFailed` before the Cluster's infrastructure is provisioned or
its control plane initialized and while no Node is found, Unknown
`ConnectionDown` once the workload cluster is unreachable past
`--remote-conditions-grace-period` (default 5 min), and False `NodeDeleted` when
the Node disappears after `nodeRef` was set; the rest of their closed reason set
is listed with their constants
(core/reconcilers/machine/machine_controller_status.go:263-312, 380-412;
core/main.go:199; api/core/v1beta2/machine_types.go:261-295). Before the first
successful probe, and while the workload cluster is unreachable within that
grace period, they keep their last value, Unknown `ConnectionDown` being set
only when absent, so after a controller restart an old True stays
(core/reconcilers/machine/machine_controller_status.go:278-311).

**R2.51** `BootstrapConfigReady` and `InfrastructureReady` mirror the provider's
`Ready`, so their reasons are an open set; Cluster API's own are
`DataSecretProvided` (no `configRef`), `Ready`, `NotReady`,
`InvalidConditionReported`, `InternalError`, `ObjectDoesNotExist`,
`ObjectDeleted`, and `NoReasonReported` for a provider condition with an empty
reason that is not True
(core/reconcilers/machine/machine_controller_status.go:79-252;
util/conditions/getter.go:251-253;
api/core/v1beta2/machine_types.go:193-248).

**R2.52** `UpToDate` is written by the Machine controller for Machines of a
MachineDeployment's MachineSet, by the MachinePool controller for pool
Machines, which it sets True on every one that is not deleting without
comparing anything, and by KCP for its Machines; its reasons are `UpToDate`,
`NotUpToDate` (the message lists the differences: version, bootstrap,
infrastructure template, failure domain, rollout after; on a deleting pool
Machine, that it is being deleted) and `Updating` (an in-place update runs, or
the Node's kubelet version is not yet `spec.version`)
(core/reconcilers/machine/machine_controller_status.go:658-748;
core/reconcilers/machinepool/machinepool_controller.go:448-484;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:1114-1170;
api/core/v1beta2/machine_types.go:151-169).

**R2.53** The `HealthCheckSucceeded` reasons are a closed set: True
`HealthCheckSucceeded`; False `UnhealthyNode`, `UnhealthyMachine`,
`NodeStartupTimeout`, `NodeDeleted` and `HasRemediateAnnotation`
(api/core/v1beta2/machine_types.go:298-327).

**R2.54** `OwnerRemediated` is False `WaitingForRemediation` from the
MachineHealthCheck, then `CannotBeRemediated`, `RemediationDeferred` or
`MachineDeleting` from the owner, and `InternalError` from KCP
(api/core/v1beta2/machine_types.go:329-340;
api/core/v1beta2/machineset_types.go:226-240;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:307-321;
core/reconcilers/machineset/machineset_controller.go:1622-1661).

**R2.55** KCP makes its six Machine conditions readiness gates of every Machine
it creates, the two etcd ones only with managed etcd, so they feed `Ready`; each
has a closed set of reasons, listed with its constants
(controlplane/kubeadm/pkg/desiredstate/desired_state.go:63-75, 180-197;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:355-439).

MachineSet, MachineDeployment, MachinePool

**R2.56** The MachineSet status holds `selector`, `replicas` (owned Machines,
deleting ones included), `readyReplicas`, `availableReplicas` and
`upToDateReplicas` (Machines with that condition True, those in an in-place
update left out) and `versions`; the counters are not written when listing
Machines failed, and there is no phase
(core/reconcilers/machineset/machineset_controller_status.go:45-108;
api/core/v1beta2/machineset_types.go:300-351).

**R2.57** The MachineSet condition types are a closed set: `MachinesReady` and
`MachinesUpToDate` (positive aggregates of the Machines' `Ready` and `UpToDate`,
True `NoReplicas` without Machines), and `ScalingUp`, `ScalingDown`,
`Remediating`, `Deleting` and `Paused` (negative); all but `Paused` are Unknown
`InternalError` when listing Machines failed
(api/core/v1beta2/machineset_types.go:121-257, 303-304;
core/reconcilers/machineset/machineset_controller_status.go:113-434).

**R2.58** A MachineSet has no summary; what stands for one is `MachinesReady`
with the counters against `spec.replicas`, and the deprecated v1beta1 `Ready`, a
summary of `MachinesCreated`, `Resized` and `MachinesReady`
(core/reconcilers/machineset/machineset_controller.go:336-342;
api/core/v1beta2/machineset_types.go:303-304). Inference: on a stand-alone
MachineSet, whose Machines have no `UpToDate`, `MachinesUpToDate` turns Unknown
after 10 seconds
(core/reconcilers/machine/machine_controller_status.go:671-679;
core/reconcilers/machineset/machineset_controller_status.go:299-304).

**R2.59** The MachineSet `ScalingUp` message names what blocks a scale up,
failed preflight checks and missing templates; the preflight checks are a closed
set, `All`, `KubeadmVersionSkew`, `KubernetesVersionSkew`,
`ControlPlaneIsStable` and `ControlPlaneVersionSkew`
(core/reconcilers/machineset/machineset_controller_status.go:134-174;
api/core/v1beta2/common_types.go:222-260).

**R2.60** The MachineDeployment counters and `versions` are sums over its
MachineSets, nil while no MachineSet reports them, and not updated when listing
fails (core/reconcilers/machinedeployment/machinedeployment_status.go:46-100;
core/reconcilers/machinedeployment/mdutil/util.go:551-641).

**R2.61** The MachineDeployment phase is a closed set: `ScalingUp`,
`ScalingDown`, `Running`, `Failed` (deprecated, never set) and `Unknown`,
written when listing MachineSets failed or `spec.replicas` is nil; otherwise
deletion gives `ScalingDown`, and `spec.replicas` against the MachineSets'
replicas gives `Running`, `ScalingDown` or `ScalingUp`
(api/core/v1beta2/machinedeployment_types.go:473, 534-556;
core/reconcilers/machinedeployment/machinedeployment_status.go:102-126).
Inference: a surge rollout reads `ScalingDown`, and `Running` says nothing of
readiness.

**R2.62** The MachineDeployment condition types are a closed set: `Available`
(positive, the summary), `MachinesReady` and `MachinesUpToDate` (positive
aggregates over the Machines its selector matches), and `RollingOut`,
`ScalingUp`, `ScalingDown`, `Remediating`, `Deleting` and `Paused` (negative);
the field doc omits `RollingOut`, which the controller writes
(api/core/v1beta2/machinedeployment_types.go:76-233, 425-426;
core/reconcilers/machinedeployment/machinedeployment_controller.go:248-258).

**R2.63** `Available` is computed, not merged: True when
`status.availableReplicas` is at least `spec.replicas` minus `maxUnavailable` (0
for `OnDelete`), False `NotAvailable` otherwise, Unknown
`WaitingForAvailableReplicasSet` while that counter is nil,
`WaitingForReplicasSet` while `spec.replicas` is nil, and `InternalError` when
listing fails
(core/reconcilers/machinedeployment/machinedeployment_status.go:128-187).

**R2.64** `RollingOut` is True `RollingOut` when a Machine has `UpToDate` False,
with a message that counts those Machines and lists the causes, version first,
and False `NotRollingOut` otherwise
(core/reconcilers/machinedeployment/machinedeployment_status.go:190-242).

**R2.65** A MachineDeployment's `spec.paused` is not the `Paused` condition: it
stops new MachineSets, while the condition follows the Cluster's `spec.paused`
and the annotation (api/core/v1beta2/machinedeployment_types.go:292-294;
core/reconcilers/machinedeployment/machinedeployment_sync.go:42-81;
util/paused/paused.go:94-123).

**R2.66** At v1.14.4 MachinePool `initialization.infrastructureProvisioned` is
copied at each reconcile from the infrastructure pool's `status.ready` and can
go back to false, `replicas` comes from the infrastructure pool once
provisioned, `nodeRefs` lists the Nodes whose provider ID is in
`spec.providerIDList` and is not rewritten while the pool is deleting or while
no Node matches any listed provider ID, and the counters and `versions` are
skipped while the infrastructure pool is not loaded, which is always the case
during deletion
(core/reconcilers/machinepool/machinepool_controller_phases.go:284-329;
core/reconcilers/machinepool/machinepool_controller_noderef.go:60-143;
core/reconcilers/machinepool/machinepool_controller_status.go:35-38;
core/reconcilers/machinepool/machinepool_controller.go:219-226).

**R2.67** Without pool Machines, MachinePool `readyReplicas` and
`availableReplicas` equal `replicas`, whatever the readiness of the Nodes, and
`upToDateReplicas` equals `spec.replicas`; with them, the counters count the
Machines' conditions, `upToDateReplicas` thus every pool Machine that is not
deleting (R2.52), and pool Machines exist only when the infrastructure pool sets
`status.infrastructureMachineKind`
(core/reconcilers/machinepool/machinepool_controller_status.go:51-79;
core/reconcilers/machinepool/machinepool_controller_scope.go:51-62).

**R2.68** The MachinePool phase is a closed set: `Pending`, `Provisioning`,
`Provisioned` (Node refs found), `Running` (the deprecated v1beta1
`readyReplicas` equals `spec.replicas`), `ScalingUp`, `ScalingDown`, `Scaling`
(replicas managed outside Cluster API, annotation
`cluster.x-k8s.io/replicas-managed-by`), `Deleting`, `Failed` (deprecated, never
set) and `Unknown` (never written); once the infrastructure is provisioned and
`spec.replicas` is set, one of `Running`, `ScalingUp`, `ScalingDown` or
`Scaling` always replaces `Provisioned`
(api/core/v1beta2/machinepool_types.go:151, 254-300;
core/reconcilers/machinepool/machinepool_controller_phases.go:53-105).

**R2.69** A MachinePool has no summary: its v1beta2 condition constants are
commented out as not yet implemented and its controller writes only `Paused`;
what stands for one is the phase, the counters and the deprecated v1beta1
`Ready`, a summary of `BootstrapReady`, `InfrastructureReady` and
`ReplicasReady` (api/core/v1beta2/machinepool_types.go:31-65, 105-107;
core/reconcilers/machinepool/machinepool_controller.go:185-206). The v1beta1
`readyReplicas`, which decides `Running`, and `ReplicasReady` are not
recomputed while `readyReplicas`, `status.replicas` and the number of
`nodeRefs` are equal and those Nodes exist with the same name and UID, ready or
not (core/reconcilers/machinepool/machinepool_controller_noderef.go:65-101;
core/reconcilers/machinepool/machinepool_controller_phases.go:589-607).
Inference: a Node that turns NotReady leaves the pool `Running` and v1beta1
`ReplicasReady` True, and without pool Machines also the v1beta2 ready and
available counters, which copy `status.replicas` (R2.67).

MachineHealthCheck and MachineDrainRule

**R2.70** The MachineHealthCheck status holds `expectedMachines` (the targets:
the selected Machines minus those annotated `cluster.x-k8s.io/paused` or
`cluster.x-k8s.io/skip-remediation`), `targets` (their names, sorted),
`currentHealthy` and `remediationsAllowed`
(core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:268-285,
322, 388, 731-755;
core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:297-313).

**R2.71** A target is healthy only with no failed and no pending check, not
deleting and with a Node, and one that is neither healthy nor unhealthy, inside
a timeout, without a Node or deleting, keeps its last `HealthCheckSucceeded`
(core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:390-416).
Inference: Machines waiting for a Node or inside a timeout lower
`currentHealthy` and count against the limit.

**R2.72** The MachineHealthCheck conditions are `RemediationAllowed` (positive,
the summary: True `RemediationAllowed`, False `TooManyUnhealthy` when the
unhealthy count passes the limit or, with `triggerIf.unhealthyInRange`, falls
outside the range, above or below it) and `Paused` (negative), so with a range
that starts above zero a MachineHealthCheck reads False `TooManyUnhealthy`
while every target is healthy
(api/core/v1beta2/machinehealthcheck_types.go:26-39, 276-282;
core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:293-395,
731-755).

**R2.73** A MachineDrainRule, a KubeadmConfigTemplate and a
KubeadmControlPlaneTemplate have no status
(api/core/v1beta2/machinedrainrules_types.go:204-216;
api/bootstrap/kubeadm/v1beta2/kubeadmconfigtemplate_types.go:53-63;
api/controlplane/kubeadm/v1beta2/kubeadmcontrolplanetemplate_types.go:41-51).

KubeadmControlPlane and KubeadmConfig

**R2.74** KCP writes no status while it has no owner Cluster, while it adds its
finalizer, while it adopts Machines, or when its scope cannot be built
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:209-248).

**R2.75** KCP `selector` matches the label `cluster.x-k8s.io/cluster-name` of
its Cluster and the label `cluster.x-k8s.io/control-plane`; `replicas` counts
the Machines it owns, deleting ones included; `readyReplicas`,
`availableReplicas` and `upToDateReplicas` count their conditions; `versions`
lists each version, oldest first, and the deprecated `version` copies the
first, kept when the list is empty; until the Cluster's infrastructure is
provisioned and its endpoint is valid KCP sees no Machine, so `replicas` and
the counters are 0 and `versions` is empty
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:138-160,
212-230; util/collections/machine_filters.go:262-273;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:316-323).

**R2.76** KCP `initialization.controlPlaneInitialized` turns true once the
ConfigMap `kubeadm-config` exists in `kube-system` of the workload cluster and
is never reset; it stays unset while the only Machine is being remediated or
deleted, or while the workload cluster cannot be reached
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:176-210).

**R2.77** KCP `lastRemediation` comes from its annotation
`controlplane.cluster.x-k8s.io/remediation-in-progress`, else from the newest
`controlplane.cluster.x-k8s.io/remediation-for` on its Machines
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:809-836).
Inference: it stays empty until the first remediation and is never cleared.

**R2.78** The KCP condition types are a closed set
(api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:85-348;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:379-393;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:314-318,
366-370, 551-559, 726-729):

| Type                            | Polarity | Meaning                                                                                                                                                                                                                                                                              |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Available`                     | positive | the summary: False "Control plane not yet initialized" before initialization, then True when not deleting, `CertificatesAvailable` True, at least one Machine with healthy components, and etcd quorum when etcd is stacked; reasons `Available`, `NotAvailable`, `InspectionFailed` |
| `Initialized`                   | positive | mirrors `status.initialization.controlPlaneInitialized`                                                                                                                                                                                                                              |
| `CertificatesAvailable`         | positive | the cluster certificate Secrets exist                                                                                                                                                                                                                                                |
| `EtcdClusterHealthy`            | positive | sums up the Machines' `EtcdMemberHealthy` and the KCP-level etcd checks                                                                                                                                                                                                              |
| `ControlPlaneComponentsHealthy` | positive | sums up the Machines' pod conditions                                                                                                                                                                                                                                                 |
| `MachinesReady`                 | positive | aggregate of the Machines' `Ready`, True `NoReplicas` without Machines                                                                                                                                                                                                               |
| `MachinesUpToDate`              | positive | aggregate of the Machines' `UpToDate`                                                                                                                                                                                                                                                |
| `RollingOut`                    | negative | a Machine has `UpToDate` False                                                                                                                                                                                                                                                       |
| `ScalingUp`                     | negative | fewer Machines than `spec.replicas`; what blocks it appears only in the message                                                                                                                                                                                                      |
| `ScalingDown`                   | negative | more Machines than `spec.replicas`, or any Machine left while the KCP is deleting                                                                                                                                                                                                    |
| `Remediating`                   | negative | a Machine is being remediated                                                                                                                                                                                                                                                        |
| `Deleting`                      | negative | the stage of the deletion                                                                                                                                                                                                                                                            |
| `Paused`                        | negative | the KCP is paused                                                                                                                                                                                                                                                                    |

**R2.79** KCP has no v1beta2 `Ready`, and its field doc and the book's control
plane contract name an `EtcdClusterAvailable` type that does not exist
(api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:700-701;
docs/book/src/developer/providers/contracts/control-plane.md:764-766).

**R2.80** `EtcdClusterHealthy` and `ControlPlaneComponentsHealthy` are False
when any Machine or KCP-level check is False, the checks of a deleting Machine
being all False "Machine is deleting", else Unknown when any is Unknown, an
Unknown on a Machine with no provider ID counting as information, else True
(controlplane/kubeadm/pkg/workload_cluster_conditions.go:112-121, 553-582,
1086-1219). Before initialization they and KCP's Machine conditions are Unknown
`InspectionFailed`; while the workload cluster is unreachable they keep their
last value, True included, until `--remote-conditions-grace-period` (default
5 min) has passed since the later of the last successful probe and the
`Initialized` transition, then turn Unknown `ConnectionDown`
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:1019-1104;
controlplane/kubeadm/main.go:156). Inference: both go False during every scale
down or rollout of the control plane, and with external etcd
`EtcdClusterHealthy` can stay Unknown, as KCP no longer sets it there after the
early phases (controlplane/kubeadm/pkg/workload_cluster_conditions.go:56-64).

**R2.81** The KCP `Deleting` reasons are a closed set: False `NotDeleting`, then
True `WaitingForWorkersDeletion`, `WaitingForMachineDeletion`,
`DeletionCompleted` or `InternalError`; KCP first waits for every worker Machine
and MachinePool of the Cluster to be gone
(api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:327-348;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:694-813).

**R2.82** KubeadmConfig writes no status while it has no owner of kind Machine
or MachinePool or its Cluster does not exist; `status.dataSecretName` and
`initialization.dataSecretCreated` are set once the data Secret exists, and stay
empty while the Cluster's infrastructure is not provisioned, while the control
plane is not initialized for a joining Machine, and, until the Cluster's
`ControlPlaneInitialized` is True, for every control plane Machine but the one
holding the init lock
(bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:167-202,
289-354, 480-495, 1450-1451).

**R2.83** The KubeadmConfig condition types are a closed set: `Ready` (positive,
the summary of `DataSecretAvailable` and `CertificatesAvailable`; reasons
`Ready`, `NotReady`, `ReadyUnknown`), `DataSecretAvailable` (positive: True
`Available`, False `NotAvailable` while waiting for the infrastructure or the
control plane, and also when the bootstrap data cannot be built, which at
v1beta2 only the message tells apart, v1beta1 having
`DataSecretGenerationFailed`), `CertificatesAvailable` (positive: True
`Available`, Unknown `InternalError`) and `Paused` (negative); a Machine's
`BootstrapConfigReady` mirrors this `Ready`
(api/bootstrap/kubeadm/v1beta2/kubeadm_types.go:36-71;
bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:222-270,
292-297, 472-477, 574-596).

ClusterResourceSet, IPAM and providers

**R2.84** The ClusterResourceSet conditions are `ResourcesApplied` (positive,
the summary: True `Applied`, False `NotApplied`, `WrongSecretType` or
`InternalError`) and `Paused` (negative), and with no matching Cluster
`ResourcesApplied` is never set; a missing Secret or ConfigMap sets it False
`InternalError`, then the same call skips that resource, writes no Binding
entry for it and, when nothing else fails, sets it True `Applied`
(api/addons/v1beta2/clusterresourceset_types.go:26-43;
core/reconcilers/clusterresourceset/clusterresourceset_controller.go:146-193,
261-288, 318-329, 386-392, 443-452). Inference: it is set once per matching
Cluster in the same reconcile, so the last Cluster decides, a missing resource
never shows in it, even with one Cluster, and the Binding shows that resource
only by the absence of an entry
(core/reconcilers/clusterresourceset/clusterresourceset_controller.go:188-193).

**R2.85** A ClusterResourceSetBinding has no status: `spec.bindings` holds, for
each ClusterResourceSet, its resources with `applied`, `hash` and
`lastAppliedTime` (api/addons/v1beta2/clusterresourcesetbinding_types.go:26-58,
120-129).

**R2.86** An IPAddress has no status; IPAddressClaim `status.addressRef` and
`status.conditions` are written by the IPAM provider, not by Cluster API, and
its one condition, `Ready` (positive, the summary), has the failure reasons
`AllocationFailed`, `PoolNotReady` and `PoolExhausted` and no reason defined for
True (api/ipam/v1beta2/ipaddress_types.go:99-109;
api/ipam/v1beta2/ipaddressclaim_types.go:24-40, 58-104;
docs/book/src/developer/providers/contracts/ipam.md:44-49).

**R2.87** The clusterctl Provider has no status; its `type` is a closed set,
`CoreProvider`, `BootstrapProvider`, `InfrastructureProvider`,
`ControlPlaneProvider`, `IPAMProvider`, `RuntimeExtensionProvider` and
`AddonProvider`, any other value reading as unknown, next to `providerName`,
`version` and the deprecated `watchedNamespace`
(cmd/clusterctl/api/v1alpha3/provider_type.go:33-59, 92-141).

**R2.88** The operator's seven kinds share `status.contract` and
`status.installedVersion`, written after a successful install,
`status.observedGeneration` and the positive conditions `PreflightCheckPassed`,
`ProviderInstalled`, `ProviderUpgraded` and `Ready`; `Ready` is no summary: it
copies only the provider Deployment's `Available`, reason included, so its
reasons are an open set, is not written while `ProviderInstalled` is not True,
and is rewritten only when that status differs
(cluster-api-operator:api/v1alpha2/provider_types.go:301-318;
cluster-api-operator:api/v1alpha2/conditions_consts.go:20-84;
cluster-api-operator:internal/controller/phase_fetch.go:194-205;
cluster-api-operator:internal/controller/healthcheck/healthcheck_controller.go:160-209).
Inference: a failed preflight check or upgrade leaves `Ready` True while the
provider Deployment stays available.

How conditions roll up

**R2.89** A summary (`NewSummaryCondition`) merges several types of one object
in a given order, and a missing input counts as Unknown `NotYetReported` unless
the caller lists it as ignorable (util/conditions/summary.go:58-134;
util/conditions/mirror.go:26-29).

**R2.90** Each input is an issue (positive and False, or negative and True),
unknown (Unknown) or information; the result is False with any issue, else
Unknown with any unknown, else True, inverted for a negative target, and its
reason is the issue, unknown or info reason the caller gives
(util/conditions/merge_strategies.go:130-201, 229-252).

**R2.91** A summary message has one line per input, in input order,
`* <Type>: <message>`, or the reason when the message is empty; information
lines appear only when the result is True and carry a message, and multi-line
messages are indented under their line
(util/conditions/merge_strategies.go:356-388, 559-596).

**R2.92** An aggregate (`NewAggregateCondition`) merges one type over many
objects with the same rules, an object without the condition counting as Unknown
`NotYetReported`; its message holds at most three messages, each of one or more
lines, control plane Machines first, then issues, then unknown, each naming up
to three objects and counting the rest, and closes with a count of the other
objects with issues, unknown status or additional information
(util/conditions/aggregate.go:60-127;
util/conditions/merge_strategies.go:276-316, 391-522).

**R2.93** A mirror copies status, reason, message and `lastTransitionTime` of
the source condition, else the caller's fallback, else Unknown `NotYetReported`;
a provider's conditions are read from `status.v1beta2.conditions` when that list
is present, taken whole, else from `status.conditions`, and an empty reason
becomes `NoReasonReported`
(util/conditions/mirror.go:66-102; util/conditions/getter.go:31-32, 121-153,
238-259).

**R2.94** The controllers keep `status.conditions` in a fixed order:
`Available`, `Ready`, `UpToDate`, then the specific types, then gates and
unknown types alphabetically, and `Paused` and `Deleting` last
(util/conditions/sort.go:37-48, 98-137).

**R2.95** The v1beta1 conditions stay under
`status.deprecated.v1beta1.conditions`, with a `severity` (`Error`, `Warning`,
`Info` or empty) and some different names and reasons, such as
`TopologyReconcileFailed` for `ReconcileFailed` and `VariablesReconciled` for
`VariablesReady`; an object read at v1beta1 returns them as its
`status.conditions` (api/core/v1beta2/condition_types.go:29-42;
api/core/v1beta2/v1beta1_condition_consts.go:54-65, 290-364;
api/core/v1beta1/conversion.go:729-740).

What a controller or a webhook rewrites

**R2.96** The Cluster webhook adds `v` to `spec.topology.version` and fills the
topology variables and their overrides from the ClusterClass's
`status.variables`, which it skips when the class is missing or not reconciled
after polling for up to 2 s (core/webhooks/admission/cluster.go:86-138, 854-913,
984-1013).

**R2.97** The webhooks of Machine, MachineSet, MachineDeployment, MachinePool
and MachineHealthCheck add the label `cluster.x-k8s.io/cluster-name` and a `v`
before versions; they default Machine and MachinePool template
`nodeDeletionTimeoutSeconds` to 10, the MachineDeployment strategy to
`RollingUpdate` with `maxSurge` 1 and `maxUnavailable` 0, an empty selector to
`cluster.x-k8s.io/set-name` or `cluster.x-k8s.io/deployment-name` in selector
and template labels, and MachineHealthCheck `nodeStartupTimeoutSeconds` to 600;
the MachineDeployment webhook also always adds the cluster-name label to the
selector and the template labels
(core/webhooks/admission/machine.go:57-78;
core/webhooks/admission/machineset.go:71-121;
core/webhooks/admission/machinedeployment.go:69-137;
core/webhooks/admission/machinepool.go:63-104;
core/webhooks/admission/machinehealthcheck.go:68-79).

**R2.98** An unset `spec.replicas` on a MachineSet, MachineDeployment or
MachinePool is defaulted, even when a client removes it: with both annotations
`cluster.x-k8s.io/cluster-api-autoscaler-node-group-min-size` and
`cluster.x-k8s.io/cluster-api-autoscaler-node-group-max-size`, to the minimum
for a new object or the old value clamped into the range, else to 1
(core/webhooks/admission/machineset.go:307-401;
core/webhooks/admission/machinepool.go:187-257;
core/webhooks/admission/machinedeployment.go:360-430).

**R2.99** The KCP webhook defaults `spec.replicas` to 1, adds `v` to
`spec.version` and sets the strategy `RollingUpdate` with `maxSurge` 1 when
unset; the ExtensionConfig webhook defaults `spec.namespaceSelector` to `{}` and
a service port to 443; the ClusterResourceSet webhook defaults `spec.strategy`
to `ApplyOnce`; KubeadmConfig, ClusterClass and MachineDrainRule have
validating webhooks only
(controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane.go:66-80;
core/webhooks/admission/extensionconfig.go:55-67;
core/webhooks/admission/clusterresourceset.go:51-56;
bootstrap/kubeadm/webhooks/admission/kubeadmconfig.go:40-60;
core/webhooks/admission/clusterclass.go:47-54;
core/webhooks/admission/machinedrainrules.go:40, 62-85).

**R2.100** The Cluster controller writes `spec.controlPlaneEndpoint` from the
infrastructure cluster or the control plane while the Cluster's own is not
valid, and the topology controller writes `spec.infrastructureRef` and
`spec.controlPlaneRef` once
(core/reconcilers/cluster/cluster_controller_phases.go:217-228, 330-341;
exp/topology/desiredstate/desired_state.go:763-766). Inference: a provider
without that field gets an empty endpoint written over a partial user value.

**R2.101** The Machine controller writes `spec.providerID`,
`spec.bootstrap.dataSecretName` and, from a deprecated provider field,
`spec.failureDomain`; a MachineSet rewrites its Machines' readiness gates,
deletion timeouts, `minReadySeconds`, taints, labels and annotations in place; a
MachineDeployment rewrites its MachineSets' replicas, selector, template
metadata, deletion order and naming, and the template's `minReadySeconds`,
readiness gates, deletion timeouts and taints
(core/reconcilers/machine/machine_controller_phases.go:223-234, 349-374;
core/reconcilers/machineset/machineset_controller.go:1286-1302;
core/reconcilers/machinedeployment/machinedeployment_rollout_planner.go:268-334).

**R2.102** Under a managed topology the topology controller writes the control
plane's replicas and each MachineDeployment's `spec.replicas`, labels,
annotations, selector and template from the Cluster, and a nil topology
`replicas` leaves the field to someone else
(exp/topology/desiredstate/desired_state.go:431-433, 1041-1075;
api/core/v1beta2/cluster_types.go:910-915). Inference: with topology `replicas`
set, a direct change of a MachineDeployment's `spec.replicas` is reverted at the
next topology reconcile
(core/reconcilers/topology/cluster/reconcile_state.go:786-787).

**R2.103** A KubeadmConfig writes into its own spec the join discovery it
computes: `joinConfiguration.discovery.bootstrapToken.caCertHashes`,
`apiServerEndpoint`, a new `token`, and `unsafeSkipCAVerification: true` when no
hash is known
(bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:1275-1330).

**R2.104** The ExtensionConfig controller writes `spec.clientConfig.caBundle`
from the key `ca.crt` of the Secret named in the annotation
`runtime.cluster.x-k8s.io/inject-ca-from-secret`, and the MachinePool controller
copies `spec.providerIDList` from the infrastructure pool
(core/reconcilers/extensionconfig/extensionconfig_controller.go:297-325,
357-374; core/reconcilers/machinepool/machinepool_controller_phases.go:317-321,
336-337).

### R3. What ties objects together

Labels, owners and names

**R3.1** The label `cluster.x-k8s.io/cluster-name`, with the Cluster's name, is
set on the Cluster itself, its Machines, MachineSets, MachineDeployments,
MachinePools and MachineHealthChecks, the infrastructure cluster and control
plane it references, and the infrastructure machines, bootstrap configs and
Secrets made for it, but for the temporary `<cluster>-shim` Secret of R3.11,
which has no label (core/reconcilers/cluster/cluster_controller.go:331-338;
core/reconcilers/machine/machine_controller.go:462-466;
core/reconcilers/machineset/machineset_controller.go:516-519;
core/reconcilers/machinedeployment/machinedeployment_controller.go:281;
core/reconcilers/machinepool/machinepool_controller.go:243-246;
core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:231-234;
core/reconcilers/cluster/cluster_controller_phases.go:99-138;
core/reconcilers/machine/machine_controller_phases.go:134-139;
util/secret/certificates.go:377-379;
internal/topology/clustershim/clustershim.go:31-43).

**R3.2** Machine, MachineSet, MachineDeployment, MachinePool, MachineHealthCheck
and ClusterResourceSetBinding name their Cluster in `spec.clusterName`, in their
own namespace, immutable on the first five; an IPAddressClaim may
(core/reconcilers/machine/machine_controller.go:213;
core/reconcilers/machinedeployment/machinedeployment_controller.go:162;
core/webhooks/admission/machine.go:111-116;
core/webhooks/admission/machineset.go:179-198;
core/webhooks/admission/machinedeployment.go:205-224;
core/webhooks/admission/machinepool.go:142-160;
core/webhooks/admission/machinehealthcheck.go:123-128;
api/ipam/v1beta2/ipaddressclaim_types.go:45-49).

**R3.3** The Cluster controller gives the infrastructure cluster and the control
plane an owner reference to the Cluster, a controller one only on topology
Clusters; MachineDeployments, MachinePools, MachineHealthChecks, stand-alone
MachineSets and stand-alone Machines get a non-controller one, and so do the
templates that a MachineDeployment, a MachineSet or a KCP references, from
their controllers, and the topology's copy of the control plane's machine
template (core/reconcilers/cluster/cluster_controller_phases.go:99-138;
core/reconcilers/machinedeployment/machinedeployment_controller.go:283-289,
660-684;
core/reconcilers/machinepool/machinepool_controller.go:248-253;
core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:240-246;
core/reconcilers/machineset/machineset_controller.go:521-530, 1859-1900;
core/reconcilers/machine/machine_controller.go:450-460;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:128-158;
exp/topology/desiredstate/desired_state.go:306-316).

**R3.4** Controller references run down the chains: a MachineSet to its
MachineDeployment, a Machine to its MachineSet, MachinePool or KCP, and the
infrastructure machine and bootstrap config to their Machine, which replaces the
creator's temporary owner reference
(core/reconcilers/machinedeployment/machinedeployment_rollout_planner.go:278-279;
core/reconcilers/machineset/machineset_controller.go:1243-1244;
core/reconcilers/machinepool/machinepool_controller_phases.go:490-491;
controlplane/kubeadm/pkg/desiredstate/desired_state.go:138-145;
core/reconcilers/machine/machine_controller_phases.go:101-132).

**R3.5** A MachineDeployment adopts orphan MachineSets its selector matches and
a MachineSet orphan Machines, while KCP adopts stand-alone control plane
Machines and does nothing while a control plane Machine of the Cluster is not
its own
(core/reconcilers/machinedeployment/machinedeployment_controller.go:525-553;
core/reconcilers/machineset/machineset_controller.go:632-641;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:332-343,
1779-1849).

**R3.6** Labels mark the chains: `cluster.x-k8s.io/deployment-name` on a
MachineDeployment's MachineSets and Machines, `cluster.x-k8s.io/set-name` on a
MachineSet's Machines, `machine-template-hash` on each MachineSet that a
MachineDeployment computes, its selector and its Machines,
`cluster.x-k8s.io/pool-name` on MachinePool Machines;
`set-name` and `pool-name` become a hash beyond 63 characters
(core/reconcilers/machinedeployment/machinedeployment_rollout_planner.go:231-243,
301-313; core/reconcilers/machineset/machineset_controller.go:1350-1358;
core/reconcilers/machinepool/machinepool_controller_phases.go:524-526;
api/core/v1beta2/machine_types.go:39-48).

**R3.7** Control plane Machines carry `cluster.x-k8s.io/control-plane` with an
empty value, the only label the contract requires of a control plane provider,
and KCP's also carry `cluster.x-k8s.io/control-plane-name` (the KCP's name, a
hash beyond 63 characters)
(controlplane/kubeadm/pkg/desiredstate/desired_state.go:325-340;
api/core/v1beta2/machine_types.go:30-31, 50-52;
docs/book/src/developer/providers/contracts/control-plane.md:461-462).

**R3.8** A MachineSet is named after its MachineDeployment with a dash and five
random characters, cut to 58 before them; Machines follow
`{{ .machineSet.name }}-{{ .random }}` or
`{{ .kubeadmControlPlane.name }}-{{ .random }}` unless
`spec.machineNaming.template` says otherwise; the infrastructure machine and
bootstrap config take their Machine's name, and a MachinePool Machine its
infrastructure machine's
(core/reconcilers/machinedeployment/machinedeployment_sync.go:92-108;
core/reconcilers/machineset/machineset_controller.go:1225-1237, 1958-1966,
2036-2044; controlplane/kubeadm/pkg/desiredstate/desired_state.go:96-104;
core/reconcilers/machinepool/machinepool_controller_phases.go:487-489).

**R3.9** Under a topology, generated objects carry
`topology.cluster.x-k8s.io/owned`, MachineDeployments and MachinePools also
`topology.cluster.x-k8s.io/deployment-name` or
`topology.cluster.x-k8s.io/pool-name` with their topology name, in the template
labels too, and objects cloned from a template carry
`cluster.x-k8s.io/cloned-from-name` and `cluster.x-k8s.io/cloned-from-groupkind`
(exp/topology/desiredstate/desired_state.go:1049-1072, 1405-1408, 1559-1598;
controllers/external/util.go:215-236; api/core/v1beta2/common_types.go:32-37,
67-69, 130-136).

**R3.10** Topology names are `{{ .cluster.name }}-{{ .random }}` for the
infrastructure cluster and the control plane, and
`{{ .cluster.name }}-{{ .machineDeployment.topologyName }}-{{ .random }}` or its
MachinePool equivalent for workers, unless the class sets `naming.template`; a
name over 63 characters is cut to 58 plus 5 random characters
(exp/topology/desiredstate/desired_state.go:244-254, 342-351, 991-996,
1348-1353; internal/topology/names/names.go:31-33, 147-151).

**R3.11** While a topology is created, a temporary Secret `<cluster>-shim` of
type `cluster.x-k8s.io/secret`, with no data and a non-controller owner
reference to the Cluster, is an extra owner of the infrastructure cluster and
the control plane until the Cluster owns both
(internal/topology/clustershim/clustershim.go:31-43;
core/reconcilers/topology/cluster/reconcile_state.go:118-176).

**R3.12** A Cluster names its class in `spec.topology.classRef.name` and
`classRef.namespace`, the Cluster's namespace when empty, so a class can live in
another namespace; nothing on the class points back, and the controllers use an
index in memory (api/core/v1beta2/cluster_types.go:594-616, 1710-1718;
util/index/cluster.go:30-66). Inference: a view finds a class's Clusters only by
listing Clusters in all namespaces and matching name and effective namespace, as
the definition declares no selectable field.

**R3.13** A ClusterClass names its templates by `templateRef` in its own
namespace and adds to each a non-controller owner reference to itself; the
per-Cluster copy of the control plane machine template is named `<cluster>-`
plus five random characters and owned by the Cluster
(api/core/v1beta2/clusterclass_types.go:1558-1609;
core/reconcilers/clusterclass/clusterclass_controller.go:224-254, 448-474;
exp/topology/desiredstate/desired_state.go:276-317).

**R3.14** A ClusterClass names an extension handler as
`<handler>.<ExtensionConfig name>` in its external patches and upgrade plan
(api/core/v1beta2/clusterclass_types.go:1341-1345, 1495-1521;
internal/runtime/client/client.go:853-867).

**R3.15** A MachineHealthCheck targets the Machines of its namespace that match
`spec.selector` and the cluster-name label, minus those annotated
`cluster.x-k8s.io/paused` or `cluster.x-k8s.io/skip-remediation`; with a
remediation template it creates one request per unhealthy Machine, named as the
Machine, of the template's kind without `Template`, with a non-controller owner
reference to the Machine, and a request that already exists ends that pass,
before the unhealthy Machines that follow it
(core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:297-362;
core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:470-538).

**R3.16** Nothing links a MachineDrainRule: at drain time the rules of the
Machine's namespace that match the Machine and Cluster labels are sorted by name
and the first that matches a Pod wins, unless the Pod has the label
`cluster.x-k8s.io/drain` set to `skip` or `wait-completed`
(core/reconcilers/machine/drain/drain.go:168-219;
core/reconcilers/machine/drain/filters.go:284-336).

**R3.17** A ClusterResourceSet selects Clusters by `spec.clusterSelector` in its
namespace and names its resources there, giving each a non-controller owner
reference to itself; each Cluster gets one Binding with its own name and
namespace and `spec.clusterName`, one owner reference and one `spec.bindings`
entry per ClusterResourceSet, and no owner reference to the Cluster
(core/reconcilers/clusterresourceset/clusterresourceset_controller.go:261-288,
460-508;
core/reconcilers/clusterresourceset/clusterresourceset_helpers.go:108-144).
Inference: the objects it creates in the workload cluster carry no mark of it
(core/reconcilers/clusterresourceset/clusterresourceset_helpers.go:96-107).

**R3.18** By the IPAM contract, a claim names its Cluster in `spec.clusterName`
or the deprecated cluster-name label and should be controlled by the
infrastructure machine, and its IPAddress should have the claim's name, must be
controlled by the claim and owned by the pool, and is pointed to by the claim's
`status.addressRef`; the reliable link from an address to its claim is the
address's required `spec.claimRef.name`
(docs/book/src/developer/providers/contracts/ipam.md:38, 44-49, 75-76;
api/ipam/v1beta2/ipaddress_types.go:25-27, 53-61).

**R3.19** A clusterctl Provider is named by its manifest label, for example
`bootstrap-kubeadm`, in the provider's namespace, with the labels
`clusterctl.cluster.x-k8s.io`, `cluster.x-k8s.io/provider` and
`clusterctl.cluster.x-k8s.io/core: inventory`; an operator object is named by
the provider, `cluster-api` for the core one, and installs into its own
namespace (cmd/clusterctl/client/repository/components.go:120-138, 559-564;
cluster-api-operator:internal/controller/preflight_checks.go:85-91;
cluster-api-operator:internal/controller/phase_load.go:94).

**R3.20** Every component a provider installs, through clusterctl or through the
operator, carries `cluster.x-k8s.io/provider=<manifest label>`, with no version
(cmd/clusterctl/client/repository/components.go:260, 544-564;
cluster-api-operator:internal/controller/phase_fetch.go:58). Inference: a view
lists providers from both the Provider objects and the operator's kinds, and
falls back on this label.

**R3.21** Annotations a user sets to steer the controllers:
`cluster.x-k8s.io/paused`, `cluster.x-k8s.io/delete-machine`,
`cluster.x-k8s.io/remediate-machine`, `cluster.x-k8s.io/skip-remediation`,
`machine.cluster.x-k8s.io/exclude-node-draining`,
`machine.cluster.x-k8s.io/exclude-wait-for-node-volume-detach`, the prefixes
`pre-drain.delete.hook.machine.cluster.x-k8s.io` and
`pre-terminate.delete.hook.machine.cluster.x-k8s.io`,
`machineset.cluster.x-k8s.io/skip-preflight-checks`,
`cluster.x-k8s.io/replicas-managed-by`, the autoscaler's
`cluster.x-k8s.io/cluster-api-autoscaler-node-group-min-size` and `-max-size`,
`cluster.x-k8s.io/managed-by` on an infrastructure cluster,
`controlplane.cluster.x-k8s.io/skip-coredns` and `skip-kube-proxy` on KCP,
`runtime.cluster.x-k8s.io/inject-ca-from-secret` on an ExtensionConfig, and,
for topologies, `topology.cluster.x-k8s.io/upgrade-concurrency`,
`hold-upgrade-sequence` and `defer-upgrade`, the prefix
`before-upgrade.hook.cluster.cluster.x-k8s.io` and the two
`unsafe.topology.cluster.x-k8s.io/` checks
(api/core/v1beta2/common_types.go:43-77, 108-154, 164-219;
api/core/v1beta2/machine_types.go:33-37, 54-73;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:43-47;
api/runtime/v1beta2/extensionconfig_types.go:309-312).

**R3.22** Annotations the controllers keep:
`machinedeployment.clusters.x-k8s.io/revision` on MachineDeployments and
MachineSets, `machinedeployment.clusters.x-k8s.io/desired-replicas`,
`max-replicas` and `cluster.x-k8s.io/disable-machine-create` on MachineSets,
`controlplane.cluster.x-k8s.io/remediation-in-progress` on KCP and
`remediation-for` on its Machines, the pre-terminate hook
`pre-terminate.delete.hook.machine.cluster.x-k8s.io/kcp-cleanup` that KCP sets
on every Machine it creates, `machine.cluster.x-k8s.io/certificates-expiry`,
`runtime.cluster.x-k8s.io/pending-hooks`,
`runtime.cluster.x-k8s.io/ok-to-delete` and
`topology.internal.cluster.x-k8s.io/upgrade-step` on Clusters, and clusterctl's
`clusterctl.cluster.x-k8s.io/block-move`, which providers set on what cannot be
paused at once, and `delete-for-move`, which `clusterctl move` sets on what it
deletes from the source (api/core/v1beta2/machinedeployment_types.go:46-57;
api/core/v1beta2/common_types.go:39-41, 118;
core/reconcilers/machinedeployment/machinedeployment_rollout_planner.go:173-211;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:53-66;
controlplane/kubeadm/pkg/desiredstate/desired_state.go:133-135;
api/core/v1beta2/machine_types.go:75-79;
api/runtime/v1beta2/extensionconfig_types.go:317, 321;
internal/hooks/tracking.go:34-171;
cmd/clusterctl/api/v1alpha3/annotations.go:29-43).

**R3.23** The finalizers of these kinds are `cluster.cluster.x-k8s.io`,
`machine.cluster.x-k8s.io`, `cluster.x-k8s.io/machineset`,
`cluster.x-k8s.io/machinedeployment`, `machinepool.cluster.x-k8s.io`,
`kubeadm.controlplane.cluster.x-k8s.io` and `addons.cluster.x-k8s.io`, plus at
v1.14.4 the topology ones `machineset.topology.cluster.x-k8s.io` and
`machinedeployment.topology.cluster.x-k8s.io`; ClusterClass, ExtensionConfig,
KubeadmConfig, MachineHealthCheck and MachineDrainRule have none
(api/core/v1beta2/cluster_types.go:37; api/core/v1beta2/machine_types.go:28;
api/core/v1beta2/machineset_types.go:31, 35;
api/core/v1beta2/machinedeployment_types.go:27, 31;
api/core/v1beta2/machinepool_types.go:28;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:41;
api/addons/v1beta2/clusterresourceset_types.go:51).

The Secrets of a Cluster

**R3.24** The Secrets of a Cluster are named `<cluster>-<purpose>` in its
namespace, and the purposes are six: `kubeconfig`, `ca`, `etcd`, `sa`, `proxy`
and `apiserver-etcd-client`, the last supplied by the user
(util/secret/consts.go:35-57; util/secret/secret.go:52-54).

**R3.25** `<cluster>-kubeconfig` has type `cluster.x-k8s.io/secret`, the label
`cluster.x-k8s.io/cluster-name` and the kubeconfig under the key `value`
(util/kubeconfig/kubeconfig.go:145-162; util/secret/consts.go:22-23;
api/core/v1beta2/common_types.go:156-159).

**R3.26** With `spec.controlPlaneRef` the control plane provider creates
`<cluster>-kubeconfig`, KCP with a controller reference to itself once the
endpoint is set; without one, the Cluster controller creates it with a
non-controller owner reference to the Cluster
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:48-75;
core/reconcilers/cluster/cluster_controller_phases.go:352-382;
util/kubeconfig/kubeconfig.go:109-117). The book's control plane contract
requires that Secret of every control plane provider, for Cluster API's own
access and an operator's initial access, and says that it MUST not be shared
with other users or applications built on top of Cluster API, which should get
certificates of their own
(docs/book/src/developer/providers/contracts/control-plane.md:869-886).

**R3.27** `<cluster>-kubeconfig` holds administrator credentials: a client
certificate with common name `kubernetes-admin` in the group `system:masters`,
user `<cluster>-admin`, context `<cluster>-admin@<cluster>`
(util/kubeconfig/kubeconfig.go:57-105).

**R3.28** Its client certificate is valid one year, and KCP regenerates it when
less than half remains, only on a Secret it controls, leaving alone a Secret of
another type as user-provided (util/certs/consts.go:26, 30;
util/certs/types.go:74;
controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:81-115).
Inference: a copy of the kubeconfig taken out of the cluster no longer matches
the Secret after the next rotation, but keeps working until its own certificate
expires, one year after it was issued, since nothing in these sources revokes
it.

**R3.29** With stacked etcd the generated certificate Secrets are `<cluster>-ca`
(cluster CA), `<cluster>-sa` (service account key pair, not an authority),
`<cluster>-proxy` (front proxy CA) and `<cluster>-etcd` (etcd CA), each of type
`cluster.x-k8s.io/secret` with the label `cluster.x-k8s.io/cluster-name` and the
keys `tls.crt` and `tls.key` (util/secret/certificates.go:70-136, 372-390;
util/secret/consts.go:25-29).

**R3.30** With external etcd, `<cluster>-etcd` holds only the CA certificate and
`<cluster>-apiserver-etcd-client` the client certificate and key; both must
exist and are never generated (util/secret/certificates.go:119-132, 214-233,
421-425).

**R3.31** KCP generates the certificate Secrets with a controller reference to
itself until it is initialized, makes itself the controller of every one of
type `cluster.x-k8s.io/secret`, removing any other controller, the ownerless
and user-supplied ones included, while one of another type keeps its owners,
and after
initialization reports a missing one in `CertificatesAvailable` instead of
generating it; without a control plane reference, the first KubeadmConfig
generates them with a controller reference to itself
(controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:612-689,
1884-1918;
bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:535-550).

**R3.32** Inference: each generated certificate Secret holds a private key in
`tls.key`, and the keys of `-ca`, `-etcd`, `-proxy` and `-sa` each give control
of the workload cluster, so these Secrets are administrator grade like the
kubeconfig (util/secret/certificates.go:381-384).

**R3.33** Each KubeadmConfig has a bootstrap data Secret with its name, which is
its Machine's for a Machine (R3.8) and, under a topology, `<cluster>-<pool>-`
plus random characters for a MachinePool, of type `cluster.x-k8s.io/secret`,
with the label `cluster.x-k8s.io/cluster-name`, a controller reference to the
KubeadmConfig, and the keys `value` (the bootstrap data) and `format`
(bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:1407-1437;
internal/topology/names/names.go:166-169;
exp/topology/desiredstate/desired_state.go:1262).

**R3.34** The data Secret's `value` holds the files and passwords of the
KubeadmConfig, those referenced from Secrets resolved, and a joining Machine's
holds the join token; a control plane Machine's embeds the private keys of the
cluster and front proxy CAs, of the service account and, with stacked etcd, of
the etcd CA, or with external etcd the `apiserver-etcd-client` key instead,
with mode 0600
(bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:688-719,
1018-1090; util/secret/certificates.go:119-132, 395-464;
bootstrap/kubeadm/pkg/cloudinit/controlplane_join.go:51-61). Inference: a
control plane Machine's data Secret is administrator grade.

**R3.35** A join token lives in the workload cluster, as a bootstrap token
Secret in `kube-system` named from the token ID, valid 15 minutes by default
(`--bootstrap-token-ttl`) and extended until the Node joins; a MachinePool's
token is rotated even after its Nodes have joined, to stay fresh for later
scale ups, so its KubeadmConfig spec always holds a live token
(bootstrap/kubeadm/reconcilers/kubeadmconfig/token.go:33-68;
bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:69-70,
334-460; bootstrap/kubeadm/main.go:153-154).

**R3.36** These fields hold secrets in the object itself, in KubeadmConfig
`spec`, in KCP `spec.kubeadmConfigSpec` and in both templates, all in clear but
`users[].passwd`, which holds a password hash: `files[].content`,
`users[].passwd`, `initConfiguration.bootstrapTokens[].token`,
`joinConfiguration.discovery.bootstrapToken.token` (which the controller fills
in each KubeadmConfig), `joinConfiguration.discovery.tlsBootstrapToken`, and the
auth provider `config` and exec `env` of
`joinConfiguration.discovery.file.kubeConfig.user`; `files[].contentFrom.secret`
and `users[].passwdFrom.secret` point to a Secret instead
(api/bootstrap/kubeadm/v1beta2/kubeadmconfig_types.go:374-396, 428, 494-498;
api/bootstrap/kubeadm/v1beta2/kubeadm_types.go:101, 449, 694, 705, 846-902;
api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:464;
bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:1309-1322).

**R3.37** Other objects of a Cluster: the init lock, ConfigMap `<cluster>-lock`,
with the cluster-name label and a non-controller owner reference to the Cluster,
and the Secrets a ClusterResourceSet applies, which must have type
`addons.cluster.x-k8s.io/resource-set`
(bootstrap/kubeadm/pkg/locking/control_plane_init_mutex.go:152-191;
api/addons/v1beta2/clusterresourceset_types.go:46-48;
core/reconcilers/clusterresourceset/clusterresourceset_controller.go:478-480).

The Node of a Machine

**R3.38** A Machine finds its Node in the workload cluster by `spec.providerID`
against the Node's `spec.providerID` and records the name in
`status.nodeRef.name`; a MachinePool matches `spec.providerIDList` and records
`status.nodeRefs`
(core/reconcilers/machine/machine_controller_noderef.go:84-116, 218-245;
core/reconcilers/machinepool/machinepool_controller_noderef.go:165-231).

**R3.39** The Node points back with the annotations
`cluster.x-k8s.io/cluster-name`, `cluster.x-k8s.io/cluster-namespace`,
`cluster.x-k8s.io/machine` and, for a Machine with a controller,
`cluster.x-k8s.io/owner-kind` and `cluster.x-k8s.io/owner-name`; a MachinePool's
Node gets the same annotations, with the owner kind `MachinePool`, but
`cluster.x-k8s.io/machine`, which only a pool with MachinePool Machines adds,
through them (util/annotations/helpers.go:93-104;
api/core/v1beta2/common_types.go:84-106;
core/reconcilers/machinepool/machinepool_controller_noderef.go:234-264;
core/reconcilers/machine/machine_controller_noderef.go:121-122).

**R3.40** The Machine also syncs to its Node the labels under
`node-role.kubernetes.io`, `node-restriction.kubernetes.io` and
`node.cluster.x-k8s.io` and the annotations under `node.cluster.x-k8s.io`, plus
keys matching the manager's `--additional-sync-machine-labels` and
`--additional-sync-machine-annotations`, tracked in the Node annotations
`cluster.x-k8s.io/labels-from-machine` and
`cluster.x-k8s.io/annotations-from-machine` (util/labels/helpers.go:78-107;
util/annotations/helpers.go:105-119;
core/reconcilers/machine/machine_controller_noderef.go:252-333;
core/main.go:282-286).

**R3.41** Cluster API also marks Nodes with the label
`cluster.x-k8s.io/interruptible` when the infrastructure machine says so,
removes the taint `node.cluster.x-k8s.io/uninitialized:NoSchedule` at the first
sync, adds `node.cluster.x-k8s.io/outdated-revision:PreferNoSchedule` to Nodes
of an older MachineDeployment revision, and with `MachineTaintPropagation`
tracks Machine taints in `cluster.x-k8s.io/taints-from-machine`
(core/reconcilers/machine/machine_controller_noderef.go:129-141, 335-371,
488-505; api/core/v1beta2/common_types.go:102-103, 161-162, 262-301).

### R4. How the project's own tools do it

#### `clusterctl describe cluster`

**R4.1** `clusterctl describe cluster NAME` takes one Cluster, in the
namespace given with `-n`, else in the namespace of the kubeconfig
context, else in `default` (`cmd/clusterctl/cmd/describe_cluster.go:52-95`;
`cmd/clusterctl/client/describe.go:80-87`;
`cmd/clusterctl/client/cluster/proxy.go:93-118`).

**R4.2** Its flags default to: `--show-conditions` empty;
`--show-machinesets`, `--show-resourcesets`, `--show-templates` and
`--echo` false; `--grouping` true; `--v1beta2` true, and deprecated with
"this field will be removed when v1beta1 will be dropped."; `--color`
(`-c`) unset, and only when set does it force colors on or off
(`cmd/clusterctl/cmd/describe_cluster.go:97-114,162-164`).

**R4.3** Its first request is a GET of the definition
`clusters.cluster.x-k8s.io`, and it stops unless the storage version of
that definition is `v1beta2` (`cmd/clusterctl/client/describe.go:75-78`;
`cmd/clusterctl/client/cluster/inventory.go:409-434`).

**R4.4** Then, in this order, a GET of the Cluster, of its InfraCluster,
of the ClusterResourceSetBinding named after the Cluster (only with
`--show-resourcesets`) and of its ControlPlane
(`cmd/clusterctl/client/tree/discovery.go:73-118,357-373`;
`core/reconcilers/clusterresourceset/clusterresourceset_helpers.go:110-116`).

**R4.5** Then a LIST of Machines and a LIST of MachinePools in the
namespace of the Cluster, with the label
`cluster.x-k8s.io/cluster-name=<cluster>`; MachineDeployments and
MachineSets are listed the same way, but only when at least one Machine is
not a control plane Machine
(`cmd/clusterctl/client/tree/discovery.go:121-124,153-170,258-268,375-433`).

**R4.6** Each provider object (InfraCluster, ControlPlane, InfraMachine,
BootstrapConfig, and the BootstrapConfig and InfraMachinePool of a
MachinePool) takes two requests: a metadata-only GET of its definition,
named `<plural>.<group>`, for its contract label, then a GET of the object
at the version that label gives (`controllers/external/util.go:54-82`;
`internal/contract/version.go:116-144,170-181`;
`util/contract/contract.go:28-30`).

**R4.7** The ControlPlane takes one more metadata GET of its definition,
for its contract version; InfraMachine and BootstrapConfig are read for
every Machine that is visible when it is added, which includes the first
member of each group, removed with them once a second Machine joins it
(R4.17), and the Machines under an `Other` node that is never printed
(R4.34)
(`cmd/clusterctl/client/tree/discovery.go:108-114,126-143,177-188`;
`cmd/clusterctl/client/tree/tree.go:200-218,229-242`).

**R4.8** Any error reading a provider object or, with
`--show-resourcesets`, the ClusterResourceSetBinding, Forbidden included,
is dropped and the node left out; an error on the GET of the Cluster, on a
LIST, on the contract version of the ControlPlane or, with
`--show-templates`, on the version of a template stops the command
(`cmd/clusterctl/client/tree/discovery.go:93-96,103-104,132-140,194-195,341-347`;
`cmd/clusterctl/client/tree/discovery.go:79-81,108-111,121-124,153-156`;
`cmd/clusterctl/client/tree/discovery.go:216-236,260-268,289-305`).

**R4.9** After `describe`, as after every command, clusterctl checks for
a newer clusterctl, over the network when its local state file is missing
or older than a day, and rewrites that file, unless
`CLUSTERCTL_DISABLE_VERSIONCHECK` is `true`
(`cmd/clusterctl/cmd/root.go:64-85`;
`cmd/clusterctl/cmd/version_checker.go:153-199,249-271`). Inference:
describe sends only GET and LIST requests, only to the management cluster,
and writes nothing to any cluster
(`cmd/clusterctl/client/tree/discovery.go:72-192`).

**R4.10** The Cluster is the root. Under it come its InfraCluster (meta
name `ClusterInfrastructure`); with `--show-resourcesets`, a virtual
`ClusterResourceSets` node with one node per
`spec.bindings[].clusterResourceSetName`, built from the name and never
read; its ControlPlane (meta name `ControlPlane`), with the Machines that
carry the label `cluster.x-k8s.io/control-plane`, by presence; and a
virtual `Workers` node when there are worker Machines or MachinePools
(`cmd/clusterctl/client/tree/discovery.go:89-100,145-162,194-212`;
`util/util.go:133-136`; `cmd/clusterctl/client/tree/util.go:196-210`).

**R4.11** Under `Workers` come each MachineDeployment, with the Machines of
its MachineSets; each MachinePool, with its BootstrapConfig, its
InfraMachinePool (meta name `MachinePoolInfrastructure`) and its Machines;
and a virtual `Other` node for the Machines that matched nothing.
MachineSets and Machines are matched by their controller owner reference,
on group, kind and name, not on UID
(`cmd/clusterctl/client/tree/discovery.go:177-189,270-355,446-466`;
`util/util.go:372-379,397-404`).

**R4.12** Under each visible Machine come its InfraMachine (meta name
`MachineInfrastructure`) and its BootstrapConfig (meta name
`BootstrapConfig`); meta names are printed only for virtual nodes
(`cmd/clusterctl/client/tree/discovery.go:130-142`;
`internal/util/tree/tree.go:579-588`).

**R4.13** Siblings print by z-order, highest first, then by row name as a
string, and only the `Templates` node has a z-order, 1
(`internal/util/tree/tree.go:251-264`;
`cmd/clusterctl/client/tree/discovery.go:468-477`). Inference: group rows
and deleted rows start with a digit, a `!` or a color code, so they come
before the rows that start with a kind
(`internal/util/tree/tree.go:572-616`).

**R4.14** With `--grouping`, the default, the children of the
ControlPlane, of each MachinePool, and of each MachineDeployment (of each
MachineSet with `--show-machinesets`) are grouped
(`cmd/clusterctl/client/tree/tree.go:145-148,222-227`;
`cmd/clusterctl/client/tree/discovery.go:212,273-277,321,338`).

**R4.15** Two siblings merge when they have the same kind and the same
status and reason of `Available`, `Ready` and `UpToDate`, a missing
condition matching only a missing one. Inference: only Machines merge in
practice, since the other children of a grouping node differ in kind
(`cmd/clusterctl/client/tree/tree.go:170-198,285-303`).

**R4.16** A group is a virtual node of kind `<Kind>Group`, such as
`MachineGroup`, holding the sorted names of its members. Its `Ready` is a
member's, with no message and the oldest `lastTransitionTime`, and it
counts the members whose `Available`, `Ready` and `UpToDate` are True
(`cmd/clusterctl/client/tree/tree.go:318-372,445-479`).

**R4.17** Merged members leave the tree with their children, so the
InfraMachine and BootstrapConfig of grouped Machines are not shown
(`cmd/clusterctl/client/tree/tree.go:211-218,235-242`). In
v1.15.0-beta.1, Machines with a different `spec.version` are no longer
grouped together
(`cluster-api-v1.15.0-beta.1:cmd/clusterctl/client/tree/tree.go:159-162`).

**R4.18** Without `--echo`, the default, the InfraMachine and
BootstrapConfig of a Machine and the BootstrapConfig and InfraMachinePool
of a MachinePool are hidden when their `Ready` is True, or has the status
and reason of the parent's `Ready`
(`cmd/clusterctl/client/tree/tree.go:121-134`;
`cmd/clusterctl/client/tree/discovery.go:133,139,342,346`). Inference:
when neither has a `Ready`, they count as equal and the object is hidden
(`cmd/clusterctl/client/tree/tree.go:298-303`).

**R4.19** `--show-conditions` takes a list separated by commas, with no
spaces around the items, of `all`, kinds or `kind/name`, matched with no
regard to case; a `+` suffix keeps only the conditions that are not zero
(R4.28), which `--v1beta2=false` ignores
(`cmd/clusterctl/cmd/describe_cluster.go:128-135`;
`cmd/clusterctl/client/tree/tree.go:496-528`;
`cmd/clusterctl/client/tree/annotations.go:80-95`).

**R4.20** `--show-machinesets` puts the MachineSets between each
MachineDeployment and its Machines. `--show-templates` adds a `Templates`
node under the ControlPlane, with the template of
`spec.machineTemplate.spec.infrastructureRef`
(`spec.machineTemplate.infrastructureRef` under a v1beta1 contract), and
one under each MachineDeployment, with its bootstrap template when set and
its infrastructure template, but none for MachinePools or the ClusterClass
(`cmd/clusterctl/client/tree/discovery.go:214-253,279-329,335-355`).

**R4.21** The table has the columns NAME, REPLICAS, AVAILABLE, READY,
UP TO DATE, STATUS, REASON, SINCE and MESSAGE, with no borders and no
wrapping of its own (`internal/util/tree/tree.go:69-93,127`).

**R4.22** Each row fills its cells as follows, the counters being
AVAILABLE, READY and UP TO DATE, with the source of each row in its last
column:

| Node                                                              | STATUS, REASON, SINCE, MESSAGE | REPLICAS                                                                                           | Counters                                                                                                                          | Source                                                                            |
| ----------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cluster                                                           | `Available`                    | `replicas` of `status.controlPlane` plus `status.workers`, over the sum of their `desiredReplicas` | the sums of the same counters of `status.controlPlane` and `status.workers`                                                       | `internal/util/tree/tree.go:635-665`                                              |
| ControlPlane                                                      | `Available`, else `Ready`      | `status.replicas`/`spec.replicas`                                                                  | `status.availableReplicas`, `status.readyReplicas`, `status.upToDateReplicas` (`status.updatedReplicas` under a v1beta1 contract) | `internal/util/tree/tree.go:737-778`; `internal/contract/controlplane.go:212-261` |
| MachineDeployment                                                 | `Available`                    | `status.replicas`/`spec.replicas`, when `spec.replicas` is set                                     | `status.availableReplicas`, `status.readyReplicas`, `status.upToDateReplicas`                                                     | `internal/util/tree/tree.go:666-688`                                              |
| MachineSet                                                        | none                           | as MachineDeployment                                                                               | as MachineDeployment                                                                                                              | `internal/util/tree/tree.go:690-704`                                              |
| Machine                                                           | `Ready`                        | `1`                                                                                                | `0` or `1`, from `Available`, `Ready` and `UpToDate`                                                                              | `internal/util/tree/tree.go:706-735`                                              |
| Other provider object                                             | `Ready`                        | none                                                                                               | none                                                                                                                              | `internal/util/tree/tree.go:737-748`                                              |
| Group                                                             | its `Ready` (R4.16)            | none                                                                                               | the counts of R4.16                                                                                                               | `internal/util/tree/tree.go:780-795`                                              |
| MachinePool                                                       | none (R4.33)                   | none                                                                                               | none                                                                                                                              | `internal/util/tree/tree.go:632-799`                                              |
| `Workers`, `Other`, `ClusterResourceSets`, `Templates`, templates | none                           | none                                                                                               | none                                                                                                                              | `cmd/clusterctl/client/tree/util.go:177-210`                                      |

**R4.23** In the main row the condition is `Available` or `Ready`, both of
positive polarity: green when True, red when False, yellow when Unknown.
In the rows of conditions the colors swap for the seven negative types
`Paused`, `Deleting`, `RollingOut`, `ScalingUp`, `ScalingDown`, `Updating`
and `Remediating`, and any other status is gray
(`internal/util/tree/tree.go:349-357,817-836`;
`api/core/v1beta2/condition_consts.go:62-92`;
`api/core/v1beta2/machine_types.go:177`).

**R4.24** NAME is the tree prefix and `Kind namespace/name`; a virtual
node shows its meta name, else its name, and a group shows the count and
the plural kind, such as `3 Machines...`
(`internal/util/tree/tree.go:572-588`).

**R4.25** NAME then gets `, <version>`, from `spec.topology.version` for
a Cluster with a topology, `spec.version` for a ControlPlane (by
contract), `spec.template.spec.version` for MachineDeployment, MachineSet
and MachinePool, and `spec.version` for a Machine; an object with a
deletion timestamp gets the red prefix `!! DELETED !!`, but a group row
never does, and grouping ignores the deletion timestamp, so deleting
Machines whose conditions match show as `N Machines...` with no mark
(`internal/util/tree/tree.go:572-577,590-613`;
`cmd/clusterctl/client/tree/tree.go:156-218`).

**R4.26** MESSAGE is never cut: it wraps on whitespace before 100
characters, keeps line breaks and indents, indents by two more spaces under
`* ` bullets, and each extra line becomes an extra row; a group shows
`See a, b`, or `See a, b, ...` beyond two members
(`internal/util/tree/tree.go:171-231,840,845-878`).

**R4.27** SINCE is the time since the `lastTransitionTime` of the
condition shown; for a group, that of its oldest member
(`internal/util/tree/tree.go:839`;
`cmd/clusterctl/client/tree/tree.go:348`).

**R4.28** A node named in `--show-conditions` empties its STATUS, REASON,
SINCE and MESSAGE and is followed by one row per condition, in the stored
order, with the type in NAME. With the `+` suffix a condition is left out
when zero, that is with an empty message and the normal status of its
polarity, except `Available` and `Ready`; Unknown is never zero
(`internal/util/tree/tree.go:185-191,359-407,801-815`). With
`--v1beta2=false` the rows are the v1beta1 conditions but `Ready`, sorted
by type, and the suffix is ignored
(`cmd/clusterctl/client/tree/util.go:108-123`;
`internal/util/tree/tree.go:302-307,430-457`).

**R4.29** The conditions of a provider object are read from
`status.v1beta2.conditions` when present, else from `status.conditions`
(`util/conditions/getter.go:121-148`).

**R4.30** `--v1beta2=false` prints the deprecated v1beta1 conditions
instead, with the columns NAME, READY, SEVERITY, REASON, SINCE and
MESSAGE, and cuts messages at 100 bytes
(`cmd/clusterctl/cmd/describe_cluster.go:166-175`;
`internal/util/tree/tree.go:149,899-902`).

**R4.31** For a Cluster with a managed topology the only difference is
the version on its row: describe reads no ClusterClass, and finds the
MachineDeployments of the topology by the same label as any other
(`internal/util/tree/tree.go:591-594`;
`cmd/clusterctl/client/tree/discovery.go:72-192`).

**R4.32** Inference, a quirk: with no worker Machine no
MachineDeployment is listed, even one scaled to zero, and a MachineSet
that no MachineDeployment owns never appears, its Machines going under
`Other` (`cmd/clusterctl/client/tree/discovery.go:160-189,270-330`).

**R4.33** A MachinePool row shows only its name and version, since the
code of the rows has no case for MachinePool, still so in v1.15.0-beta.1
(`internal/util/tree/tree.go:632-799`;
`cluster-api-v1.15.0-beta.1:internal/util/tree/tree.go:632-799`).

**R4.34** Inference: when the ControlPlane cannot be read, Forbidden
included, its Machines lose their parent and go under `Other`, which
prints only when `Workers` exists
(`cmd/clusterctl/client/tree/discovery.go:146-151,158-162,177-181`).

**R4.35** A provider definition with no contract label hides its objects
without a word, and makes `--show-templates` fail with "cannot find any
versions matching contract versions"
(`cmd/clusterctl/client/tree/discovery.go:93-96,233-236,289-305`;
`internal/contract/version.go:143`).

#### `clusterctl get kubeconfig`

**R4.36** `clusterctl get kubeconfig NAME` sends the GET of R4.3, then a
GET of the Secret `<cluster>-kubeconfig` in the namespace found as in
R4.1, and prints its data key `value`; it never reads the Cluster
(`cmd/clusterctl/client/get_kubeconfig.go:45-61`;
`cmd/clusterctl/client/cluster/workload_cluster.go:46-61`;
`util/secret/secret.go:37-54`; `util/secret/consts.go:22-23`).

**R4.37** A missing key is an error, and any error, Forbidden included,
is reported as `"<name>-kubeconfig" not found in namespace "<ns>"`
followed by `: ` and the cause, so a Forbidden or a missing key `value`
still shows after the "not found" text
(`util/kubeconfig/kubeconfig.go:251-257`;
`cmd/clusterctl/client/cluster/workload_cluster.go:56-59`; `pkgerrors.Wrapf`
joins the two as
`core/reconcilers/extensionconfig/extensionconfig_controller.go:179` and
`core/reconcilers/extensionconfig/extensionconfig_controller_test.go:154`
show).

**R4.38** Inference: it needs `get` on `customresourcedefinitions`, which
can be limited to the name `clusters.cluster.x-k8s.io`, and `get` on the
one Secret, which can be limited by name
(`cmd/clusterctl/client/cluster/inventory.go:409-410`;
`util/secret/secret.go:38-46`).

**R4.39** The Secret that Cluster API generates has the type
`cluster.x-k8s.io/secret` and the label `cluster.x-k8s.io/cluster-name`.
KubeadmControlPlane creates it, as its controller owner, and renews it
(R6.11), but neither adopts nor renews a Secret of another type, such as
one the user supplied; the Cluster controller creates it only for a Cluster
with no `spec.controlPlaneRef`, once the endpoint is valid, and never
renews it (`util/kubeconfig/kubeconfig.go:144-162`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:48-126`;
`core/reconcilers/cluster/cluster_controller_phases.go:352-382`).

#### Scaling

**R4.40** clusterctl has no command to scale; the book scales MachineSets
and MachineDeployments through `spec.replicas` or the scale subresource,
as in `kubectl scale machinedeployment foo --replicas=5`
(`cmd/clusterctl/cmd/alpha.go:32-34`; `cmd/clusterctl/cmd/rollout.go:58-60`;
`cmd/clusterctl/cmd/config.go:31`; `cmd/clusterctl/cmd/completion.go:122`;
`cmd/clusterctl/cmd/convert.go:75`; `cmd/clusterctl/cmd/delete.go:122`;
`cmd/clusterctl/cmd/describe.go:31`; `cmd/clusterctl/cmd/generate.go:31`;
`cmd/clusterctl/cmd/get.go:31`; `cmd/clusterctl/cmd/init.go:121-122`;
`cmd/clusterctl/cmd/move.go:98`; `cmd/clusterctl/cmd/upgrade.go:38-40`;
`cmd/clusterctl/cmd/version.go:54`;
`docs/book/src/tasks/automated-machine-management/scaling.md:7`).

**R4.41** At `v1beta2` the scale subresource exists on MachineDeployment,
MachineSet and KubeadmControlPlane, with
`labelSelectorPath: .status.selector`, and on MachinePool, without it
(`core/config/crd/bases/cluster.x-k8s.io_machinedeployments.yaml:1726-1729`;
`core/config/crd/bases/cluster.x-k8s.io_machinesets.yaml:1520-1523`;
`controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:6001-6004`;
`core/config/crd/bases/cluster.x-k8s.io_machinepools.yaml:1454-1456`).

**R4.42** Inference: a scale is one PATCH of `spec.replicas`, which needs
`patch` on the kind, or one PATCH of the `scale` subresource, which needs
`patch` on `<plural>/scale`. The book asks clients to Patch rather than
Update, since Update drops the fields that an older client does not know
(`docs/book/src/reference/versions.md:191-193`).

**R4.43** MachineDeployment: its controller sets the replicas of its
MachineSets, and the MachineSet controller creates or deletes Machines
(`core/reconcilers/machinedeployment/machinedeployment_controller.go:369-373`;
`core/reconcilers/machineset/machineset_controller.go:766-791`).

**R4.44** A MachineDeployment with `spec.paused: true` still scales,
through its `sync`, and only its rollouts stop
(`core/reconcilers/machinedeployment/machinedeployment_controller.go:331-343`;
`core/reconcilers/machinedeployment/machinedeployment_sync.go:40-42`).

**R4.45** A MachineSet scales down by deleting first the Machines already
deleting, then those with the annotation `cluster.x-k8s.io/delete-machine`,
by presence, then those in an in-place update, then the unhealthy ones,
with no Node, `NodeHealthy` False or `HealthCheckSucceeded` False, and
then by `spec.deletion.order`: `Random`, the default, `Newest` or
`Oldest`; the comments of that field's values still describe unhealthy
otherwise (`api/core/v1beta2/machineset_types.go:274`;
`core/reconcilers/machineset/machineset_deletion_order.go:48-191`).

**R4.46** Inference: a MachineSet counts its deleting Machines, so a
replacement starts only once a deleted Machine is gone, and a scale of a
MachineSet that a MachineDeployment owns is undone by the
MachineDeployment
(`core/reconcilers/machineset/machineset_controller.go:621-622,778`;
`core/reconcilers/machinedeployment/machinedeployment_controller.go:369-373`).

**R4.47** KubeadmControlPlane: a validating webhook on
`kubeadmcontrolplanes/scale`, with failure policy `Fail`, rejects replicas
of zero or less, and even replicas when etcd is stacked; an update of
`spec.replicas` meets the same rules
(`controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane_scale.go:43`;
`controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane_scale.go:66-75`;
`controlplane/kubeadm/config/webhook/manifests.yaml:34-53`;
`controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane.go:250-285`).

**R4.48** KubeadmControlPlane completes any rollout first, then adds or
removes one Machine at a time, after preflight checks. A scale down takes
the Machines with `cluster.x-k8s.io/delete-machine` if there are any, else
all of them, picks one in the failure domain with most Machines, and, with
stacked etcd, moves the etcd leadership off it before deleting it
(`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:530-581`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/scale.go:60-97`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/scale.go:137-200`).

**R4.49** MachinePool: the replicas go to the infrastructure provider,
which resizes the pool, and a pool has Machine objects only when its
provider opts in to MachinePool Machines; the annotation
`cluster.x-k8s.io/replicas-managed-by` says that something outside Cluster
API manages its scaling
(`docs/book/src/developer/providers/contracts/infra-machinepool.md:247-253`;
`docs/book/src/developer/providers/contracts/infra-machinepool.md:399-414`;
`docs/book/src/tasks/experimental-features/machine-pools.md:58-60`;
`api/core/v1beta2/common_types.go:181-185`).

**R4.50** Managed topology: the topology controller writes
`spec.topology.controlPlane.replicas` into the ControlPlane only when it is
set, and the `replicas` of each item of
`spec.topology.workers.machineDeployments` and
`spec.topology.workers.machinePools` into the objects it generates
(`exp/topology/desiredstate/desired_state.go:428-435,1074-1075,1415-1416`).

**R4.51** Unset, a `replicas` of the topology is not written to the
object it generates: the API says that an external entity, such as an
autoscaler, then manages those of a MachineDeployment or a MachinePool,
whose webhooks default the field to the autoscaler's bounds, else to 1
(R2.98), and that a control plane provider is assumed not to support it,
while the KubeadmControlPlane webhook defaults it to 1
(`api/core/v1beta2/cluster_types.go:628-633,910-915,1289-1294`;
`exp/topology/desiredstate/desired_state.go:428-435`;
`core/webhooks/admission/machinedeployment.go:360-430`;
`core/webhooks/admission/machinepool.go:187-257`;
`controlplane/kubeadm/webhooks/admission/kubeadmcontrolplane.go:68-71`).
Inference: with no autoscaler only the user then manages those replicas,
and a direct scale of such an object stays.

**R4.52** It writes with server-side apply, as field manager
`capi-topology`, forcing ownership, and it reconciles on any change of a
MachineDeployment, MachinePool, ControlPlane or InfraCluster that it owns
(`core/reconcilers/topology/cluster/structuredmerge/serversidepatchhelper.go:31-32`;
`core/reconcilers/topology/cluster/structuredmerge/serversidepatchhelper.go:142-161`;
`core/reconcilers/topology/cluster/cluster_controller.go:113-142,222-263`;
`core/reconcilers/topology/cluster/cluster_controller.go:419-442`).

**R4.53** Inference: a direct change of replicas that the topology sets
is put back at once, as the v1.15 book says in words, except while the
topology leaves the object alone: the control plane, a MachineDeployment
or a MachinePool pending an upgrade, a MachineDeployment that is deleting,
and anything while the Cluster is paused by the field or the annotation;
then a direct change stays and a new topology value waits too
(`core/reconcilers/topology/cluster/cluster_controller.go:127-133,312-315`;
`core/reconcilers/topology/cluster/reconcile_state.go:326-331,722-731,1020-1025`;
`cluster-api-v1.15.0-beta.1:docs/book/src/user/guide/lifecycle/scaling.md:94-96`).

**R4.54** The book scales a topology by patching the Cluster, with a JSON
patch at `/spec/topology/workers/machineDeployments/0/replicas` or at
`/spec/topology/controlPlane/replicas`; `kubectl scale` cannot target such
a Cluster
(`docs/book/src/tasks/experimental-features/cluster-class/operate-cluster.md:68-85`;
`docs/book/src/tasks/experimental-features/cluster-class/operate-cluster.md:154-160`;
`cluster-api-v1.15.0-beta.1:docs/book/src/user/guide/lifecycle/scaling.md:98-99`).

**R4.55** The worker lists of a topology are keyed by `name`
(`api/core/v1beta2/cluster_types.go:862-874`). Inference: a JSON merge
patch replaces such a list whole, so a write by index should first test
the `name` at that index, or use server-side apply, which the book warns
might lead to issues where several API versions are served, as for
Cluster (`docs/book/src/reference/versions.md:195-213`).

#### Pausing and resuming

**R4.56** `Cluster.spec.paused` "can be used to prevent controllers from
processing the Cluster and all its associated objects"; the annotation
`cluster.x-k8s.io/paused` "can be applied to any Cluster API object"
(`api/core/v1beta2/cluster_types.go:482-484`;
`api/core/v1beta2/common_types.go:108-113`).

**R4.57** An object is paused when its Cluster has `spec.paused: true` or
when the object itself has the annotation; the annotation works by
presence, so any value pauses, `"false"` included, and on a Cluster it
pauses only the Cluster (`util/paused/paused.go:94-123`;
`util/annotations/helpers.go:30-46,123-131`).

**R4.58** The controllers of Cluster, MachineDeployment, MachineSet,
Machine, MachinePool, MachineHealthCheck, KubeadmControlPlane and
KubeadmConfig honour both, and so do the topology controllers of
MachineDeployments and MachineSets, which keep their finalizers while
paused; those of ClusterResourceSet, ClusterClass and ExtensionConfig
honour only their own annotation, and the ClusterResourceSetBinding
controller only the annotation, through an event filter; the topology
controller stops on the field or on the annotation of the Cluster
(`core/reconcilers/cluster/cluster_controller.go:163`;
`core/reconcilers/topology/machinedeployment/machinedeployment_controller.go:144-148`;
`core/reconcilers/topology/machineset/machineset_controller.go:151-155`;
`core/reconcilers/clusterresourcesetbinding/clusterresourcesetbinding_controller.go:64`;
`core/reconcilers/machinedeployment/machinedeployment_controller.go:178`;
`core/reconcilers/machineset/machineset_controller.go:211`;
`core/reconcilers/machine/machine_controller.go:229`;
`core/reconcilers/machinepool/machinepool_controller.go:167`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:206`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:234`;
`bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:210`;
`core/reconcilers/clusterresourceset/clusterresourceset_controller.go:146`;
`core/reconcilers/clusterclass/clusterclass_controller.go:122`;
`core/reconcilers/extensionconfig/extensionconfig_controller.go:191`;
`core/reconcilers/topology/cluster/cluster_controller.go:312-315`).

**R4.59** A paused object has the condition `Paused` True, reason
`Paused`, with a message naming the cause; otherwise `Paused` is False,
reason `NotPaused` (`util/paused/paused.go:94-123`;
`api/core/v1beta2/condition_consts.go:92,173,176`).

**R4.60** The pause check comes before the deletion branch in the
controllers of Cluster, KubeadmControlPlane, MachineDeployment,
MachineSet, Machine, MachinePool and ClusterResourceSet, and in the
topology controllers of MachineDeployments and MachineSets, whose
finalizers keep an object deleted while paused, with its deletion
timestamp, until it is resumed; the ExtensionConfig controller handles a
deletion before its pause check
(`core/reconcilers/cluster/cluster_controller.go:163-165,201-209`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:234-236,299-302`;
`core/reconcilers/machinedeployment/machinedeployment_controller.go:178,215`;
`core/reconcilers/machineset/machineset_controller.go:211,261`;
`core/reconcilers/machine/machine_controller.go:229,274`;
`core/reconcilers/machinepool/machinepool_controller.go:167,220`;
`core/reconcilers/clusterresourceset/clusterresourceset_controller.go:146,184`;
`core/reconcilers/topology/machinedeployment/machinedeployment_controller.go:145,162`;
`core/reconcilers/topology/machineset/machineset_controller.go:152,158`;
`core/reconcilers/extensionconfig/extensionconfig_controller.go:166-170,191`).

**R4.61** clusterctl has no command to pause a Cluster: `clusterctl move`
pauses one with the merge patch `{"spec":{"paused":true}}`, and resumes it
with `{"spec":{"paused":null}}`, which drops the field
(`cmd/clusterctl/client/cluster/mover.go:592-619`).

**R4.62** `clusterctl alpha rollout pause`, `resume` and `restart` accept
only `machinedeployment` and `kubeadmcontrolplane`, skip the contract
check, and send a GET, a second GET and a PATCH, so they need `get` and
`patch` on the kind (`cmd/clusterctl/client/alpha/rollout.go:27-37`;
`cmd/clusterctl/client/rollout.go:72-121`;
`cmd/clusterctl/client/alpha/machinedeployment.go:32-75`;
`cmd/clusterctl/client/alpha/kubeadmcontrolplane.go:32-75`).

**R4.63** On a MachineDeployment, pause is the merge patch
`{"spec":{"paused":true}}` and resume `{"spec":{"paused":false}}`; on a
KubeadmControlPlane, pause sets the annotation to `"true"`, and resume is
a JSON patch `remove` of `/metadata/annotations/cluster.x-k8s.io~1paused`
(`cmd/clusterctl/client/alpha/rollout_pauser.go:65-75`;
`cmd/clusterctl/client/alpha/rollout_resumer.go:66-80`).

**R4.64** Both return an error on an object already in that state, while
the book says that they do nothing then, and that pause sets a field of
the spec (`cmd/clusterctl/client/alpha/rollout_pauser.go:42-44,53-55`;
`cmd/clusterctl/client/alpha/rollout_resumer.go:43-45,54-56`;
`docs/book/src/clusterctl/commands/alpha-rollout.md:24-36`).

**R4.65** Inference: `rollout pause` stops only the rollouts of a
MachineDeployment, not its scaling (R4.44), but the whole controller of a
KubeadmControlPlane, scaling and remediation included
(`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:234-236`).

#### Restarting a rollout

**R4.66** `clusterctl alpha rollout restart` merge-patches
`spec.rollout.after` with the current time of the client, in RFC 3339, on
a MachineDeployment or a KubeadmControlPlane, and refuses a paused object
or one whose `spec.rollout.after` is in the future
(`cmd/clusterctl/client/alpha/machinedeployment.go:50-54`;
`cmd/clusterctl/client/alpha/kubeadmcontrolplane.go:50-54`;
`cmd/clusterctl/client/alpha/rollout_restarter.go:32-66`).

**R4.67** `spec.rollout.after` asks for a rollout after that time, even
when nothing has changed
(`api/core/v1beta2/machinedeployment_types.go:300-307`;
`api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:575-582`).

**R4.68** The topology writes `rollout.after` on the ControlPlane and on
its MachineDeployments only from `spec.topology.controlPlane.rollout.after`
and from the `rollout.after` of each item of
`spec.topology.workers.machineDeployments`, and at `v1.14.4` a non-empty
`rollout` of such an item replaces the MachineDeployment's whole rollout,
`after` and `strategy` together, where v1.15.0-beta.1 sets them apart
(`exp/topology/desiredstate/desired_state.go:437-442,922-945`;
`api/core/v1beta2/cluster_types.go:637,695,968,1167`;
`cluster-api-v1.15.0-beta.1:exp/topology/desiredstate/desired_state.go:942-964`).
Inference: on what a topology owns, a restart belongs in those fields,
since a patch of the object lasts only while the topology leaves the field
unset, but at `v1.14.4` a restart written in a worker's `rollout.after`
alone drops the class's strategy, which the MachineDeployment webhook then
defaults to `RollingUpdate`, so a class's `OnDelete` is lost (same
sources; `core/webhooks/admission/machinedeployment.go:102-118`).

#### Deleting a Cluster

**R4.69** The book: "you must always delete the cluster object", because
deleting the whole template "might lead to pending resources to be cleaned
up manually" (`docs/book/src/user/quick-start.md:2184-2193`).

**R4.70** The request is one DELETE of the Cluster; the validating
webhook of Cluster is registered for DELETE, but checks nothing then
(`core/config/webhook/manifests.yaml:181-202`;
`core/webhooks/admission/cluster.go:150-153`).

**R4.71** The finalizer `cluster.cluster.x-k8s.io` holds the Cluster
while its controller deletes in steps, and the reason of its `Deleting`
condition names the step
(`api/core/v1beta2/cluster_types.go:35-37,443-477`;
`core/reconcilers/cluster/cluster_controller.go:152-155`).

**R4.72** `WaitingForBeforeDeleteHook`: with the RuntimeSDK and
ClusterTopology gates on, a Cluster with a topology first waits for its
BeforeClusterDelete hook
(`core/reconcilers/cluster/cluster_controller.go:345-353`).

**R4.73** Then, in one pass, it deletes the objects that have the
Cluster as owner: MachinePools (with the MachinePool gate on, the
default), MachineDeployments, and the MachineSets and worker Machines that
nothing else owns, plus the control plane Machines when there is no
`spec.controlPlaneRef`
(`core/reconcilers/cluster/cluster_controller.go:362-400,601-605,624-684`).

**R4.74** `WaitingForWorkersDeletion`: it waits until no
MachineDeployment, MachineSet, worker Machine or, with the MachinePool gate
on, MachinePool with its label is left, nor, with no
`spec.controlPlaneRef`, any control plane Machine, which the message then
lists first; a MachineDeployment deletes its MachineSets, and a MachineSet
its Machines
(`core/reconcilers/cluster/cluster_controller.go:402-416,517-580,601-605`;
`core/reconcilers/machinedeployment/machinedeployment_controller.go:475-502`;
`core/reconcilers/machineset/machineset_controller.go:573-600`).

**R4.75** `WaitingForControlPlaneDeletion`: it deletes the ControlPlane
and waits; KubeadmControlPlane waits for the workers to go, then deletes
all its Machines at once, after removing their pre-terminate hook, with no
handling of etcd members
(`core/reconcilers/cluster/cluster_controller.go:418-456`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:694-813`).

**R4.76** `WaitingForInfrastructureDeletion`: it deletes the
InfraCluster and waits; then, `DeletionCompleted`, it removes its
finalizer (`core/reconcilers/cluster/cluster_controller.go:458-503`).

**R4.77** While the Cluster is deleting, its Machines skip the pre-drain
hooks, the drain, the wait for volumes and the deletion of the Node:
nothing is evicted first
(`core/reconcilers/machine/machine_controller.go:480-497,767-772`).

**R4.78** A MachineDeployment of a topology also deletes, before its
topology finalizer goes, its templates no longer in use and the
MachineHealthCheck of the same name
(`core/reconcilers/topology/machinedeployment/machinedeployment_controller.go:171-202`).

**R4.79** Inference: Kubernetes garbage collection then removes what had
the deleted objects as owner, such as the MachineHealthChecks of the
Cluster and the kubeconfig and certificate Secrets of the
KubeadmControlPlane, which makes itself the controller of every one of
type `cluster.x-k8s.io/secret` in place of any other, those the user
supplied included; only a Secret of another type stays
(`core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:240-246`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:55-67,102-126`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:619-621,670,1884-1918`;
`util/secret/certificates.go:388-390`).

#### Deleting a Machine, and marking one for deletion

**R4.80** The request is one DELETE of the Machine; the finalizer
`machine.cluster.x-k8s.io` holds it
(`api/core/v1beta2/machine_types.go:27-28`).

**R4.81** Its controller then, in order: waits for the pre-drain hooks,
annotations with the prefix
`pre-drain.delete.hook.machine.cluster.x-k8s.io`; drains the Node; waits
for its volumes to detach; waits for the pre-terminate hooks, prefix
`pre-terminate.delete.hook.machine.cluster.x-k8s.io`; deletes the
InfraMachine, then the BootstrapConfig, waiting for each; deletes the
Node; and removes its finalizer
(`core/reconcilers/machine/machine_controller.go:471-686`;
`api/core/v1beta2/machine_types.go:58,73`).

**R4.82** The progress is the reason and the message of the `Deleting`
condition of the Machine, from `WaitingForPreDrainHook` to
`DeletionCompleted` (`api/core/v1beta2/machine_types.go:363-414`;
`core/reconcilers/machine/machine_controller.go:476-478,543-544`).

**R4.83** The drain is skipped with the annotation
`machine.cluster.x-k8s.io/exclude-node-draining`, after
`spec.deletion.nodeDrainTimeoutSeconds`, once the pre-terminate hooks have
started, or when the InfraMachine is gone or deleting. The wait for
volumes is skipped with the annotation
`machine.cluster.x-k8s.io/exclude-wait-for-node-volume-detach`, after
`spec.deletion.nodeVolumeDetachTimeoutSeconds`, and in the same two cases
as the drain; both end when the Node is not found, and the wait for
volumes also when the Node is unreachable
(`core/reconcilers/machine/machine_controller.go:688-728,873-877,975-990`;
`api/core/v1beta2/machine_types.go:34,37`).

**R4.84** The pre-drain hooks, the drain, the wait for volumes and the
deletion of the Node are all skipped when the Cluster or the ControlPlane
is deleting, when the Machine has no Node, or when no control plane
Machine is left, a count that a control plane reporting
`status.externalManagedControlPlane` skips, so the Nodes of such a cluster
are still drained and deleted
(`core/reconcilers/machine/machine_controller.go:480-497,767-857`;
`util/util.go:104-110`).

**R4.85** The book describes the drain: cordon the Node; skip DaemonSet
and mirror Pods and the Pods labelled `cluster.x-k8s.io/drain=skip`; wait
for the Pods labelled `cluster.x-k8s.io/drain=wait-completed`; evict the
others within their disruption budgets, every 20 seconds; MachineDrainRules
can set the behavior and the order of Pods
(`docs/book/src/tasks/automated-machine-management/machine_deletions.md:38-72`).

**R4.86** Inference: deleting a Machine that a MachineSet or a
KubeadmControlPlane owns replaces it, since the owner creates Machines up
to `spec.replicas`, unless the MachineSet carries
`cluster.x-k8s.io/disable-machine-create: "true"`, as a MachineDeployment
marks its old MachineSets under the `OnDelete` strategy
(`core/reconcilers/machineset/machineset_controller.go:778-789`;
`core/reconcilers/machinedeployment/machinedeployment_rollout_planner.go:203-211`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/kubeadmcontrolplane_controller.go:556-570`).

**R4.87** A Machine is marked for deletion with the annotation
`cluster.x-k8s.io/delete-machine`, by presence, which MachineSet and
KubeadmControlPlane read first on a scale down (R4.45, R4.48). Inference:
the mark deletes nothing by itself
(`api/core/v1beta2/common_types.go:126-128`;
`controlplane/kubeadm/pkg/control_plane.go:198-204`).

**R4.88** In a MachineDeployment the choice of the MachineSet to scale
down may pass a marked Machine by; the v1.14 book calls the mark a label,
while the code reads an annotation, as the v1.15 book says
(`docs/book/src/tasks/automated-machine-management/scaling.md:9-11`;
`core/reconcilers/machineset/machineset_deletion_order.go:55`;
`cluster-api-v1.15.0-beta.1:docs/book/src/user/guide/lifecycle/scaling.md:35`).

#### Forcing and skipping a remediation

**R4.89** Forcing: with the annotation
`cluster.x-k8s.io/remediate-machine`, by presence, the MachineHealthCheck
marks the Machine at once, `HealthCheckSucceeded` False with reason
`HasRemediateAnnotation`; the mark is not a remediation: outside
`spec.remediation.triggerIf` the MachineHealthCheck sets no
`OwnerRemediated`, and the owner still applies its own limits, a
MachineSet that is not the current revision, `maxInFlight` and its
preflight checks, or the rules of KubeadmControlPlane
(`api/core/v1beta2/common_types.go:141-142`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:80-92`;
`util/annotations/helpers.go:54-56`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:288-369`;
`core/reconcilers/machineset/machineset_controller.go:1680-1734,1759-1793`;
`docs/book/src/tasks/automated-machine-management/healthchecking.md:240-247`).

**R4.90** Inference: it acts only on a Machine that a MachineHealthCheck
selects, since only those are checked
(`core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:295-313`).

**R4.91** Only the Machines of a MachineSet or of a KubeadmControlPlane
can be remediated, by their owner, and both owners take the annotated
Machines first; with `spec.remediation.templateRef` the MachineHealthCheck
instead creates an external remediation request and sets
`ExternallyRemediated`, and the owner does not remediate
(`docs/book/src/tasks/automated-machine-management/healthchecking.md:239`;
`core/reconcilers/machineset/machineset_controller.go:2058-2069`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/remediation.go:383-419`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:470-539`).

**R4.92** Skipping: the annotation `cluster.x-k8s.io/skip-remediation`
or `cluster.x-k8s.io/paused` on the Machine takes it out of the targets,
and `cluster.x-k8s.io/paused` on the MachineHealthCheck stops its marking;
neither stops a Machine already marked, which its MachineSet or
KubeadmControlPlane still remediates, since they select on
`HealthCheckSucceeded` False and `OwnerRemediated` False and read neither
annotation; only `spec.paused` on the Cluster, or a pause of the owner,
stops that
(`core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:297-313,455-467`;
`docs/book/src/tasks/automated-machine-management/healthchecking.md:226-233`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:206`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_controller.go:467`;
`core/reconcilers/machineset/machineset_controller.go:1663-1665`;
`util/collections/machine_filters.go:155-160`;
`controlplane/kubeadm/pkg/control_plane.go:352-355`).

**R4.93** KubeadmControlPlane counts retries with
`controlplane.cluster.x-k8s.io/remediation-for` on the replacement Machine
and `controlplane.cluster.x-k8s.io/remediation-in-progress` on itself; to
retry after `maxRetry`, the book suggests raising `maxRetry`, or removing
the first annotation
(`api/controlplane/kubeadm/v1beta2/kubeadm_control_plane_types.go:53,60`;
`docs/book/src/tasks/automated-machine-management/healthchecking.md:154-159`).

**R4.94** Inference: marking, forcing and skipping are each one PATCH of
the annotations of the Machine, which needs `patch` on `machines`
(`api/core/v1beta2/common_types.go:126-142`).

#### The operations on providers

**R4.95** `clusterctl move` checks the providers of the target, builds a
graph of the objects of every definition labelled
`clusterctl.cluster.x-k8s.io` and of every Secret and ConfigMap, a Secret
with no owner being tied to its Cluster by its name, and refuses paused
Clusters and ClusterClasses, Clusters still provisioning and Machines with
no Node (`cmd/clusterctl/client/cluster/mover.go:75-104,189-280,338-353`;
`cmd/clusterctl/client/cluster/objectgraph.go:404-408,698-721`).
Inference: the kubeconfig and certificate Secrets move with their Cluster,
copied to the target and deleted from the source, those the user supplied
included (same sources).

**R4.96** It pauses the source Clusters and ClusterClasses, waits about
two minutes for any `clusterctl.cluster.x-k8s.io/block-move` annotation to
go, creates every object in the target, then annotates each source object
with `clusterctl.cluster.x-k8s.io/delete-for-move`, deletes it and clears
its finalizers, and resumes the target; cluster-scoped objects and what
they own, and, when move is given a namespace, the ClusterClasses outside
it or used from outside it, with their templates, are copied but never
deleted from the source
(`cmd/clusterctl/client/cluster/mover.go:355-419,685-743,1253-1314`;
`cmd/clusterctl/client/cluster/objectgraph.go:797-849`).

**R4.97** The book warns that move was built for the bootstrap case, is
not a backup tool, assumes a stable cluster and never restores `status`
(`docs/book/src/clusterctl/commands/move.md:43-71`). Inference: an
interrupted move can leave Clusters paused or objects in both clusters,
and with the finalizers cleared no controller of the source cleans
anything up (`cmd/clusterctl/client/cluster/mover.go:355-419,1297-1312`).

**R4.98** `clusterctl init` creates the definition of the inventory if it
is missing, installs the certificate manager that the webhooks need if it
is missing (version `v1.21.3` by default), then creates or merge-patches
every component of each provider and its `Provider` object
(`cmd/clusterctl/client/init.go:93-175`;
`cmd/clusterctl/client/config/cert_manager_client.go:32-38`;
`cmd/clusterctl/client/cluster/installer.go:111-124`;
`cmd/clusterctl/client/cluster/components.go:78-131`).

**R4.99** `clusterctl upgrade plan` checks the contract, accepting
`v1beta1` too, creates the definition of the inventory if it is missing,
lists the `Provider` objects and reads release metadata from the
repositories of the providers (`cmd/clusterctl/client/upgrade.go:53-74`;
`cmd/clusterctl/client/cluster/inventory.go:146-227`;
`cmd/clusterctl/client/cluster/upgrader.go:99-156`).

**R4.100** `clusterctl upgrade apply` upgrades the certificate manager
when needed, scales to zero the Deployment of every provider it upgrades,
those with a next version, deletes their old components but keeps the
definitions, the namespace and the inventory, installs the new ones and
updates the inventory
(`cmd/clusterctl/client/upgrade.go:147-165`;
`cmd/clusterctl/client/cluster/upgrader.go:371-467`).

**R4.101** While it runs, the controllers and their conversion and
admission webhooks are down; flags that are not in the components are
lost; and the core and kubeadm providers cannot skip more than three
minors (`cmd/clusterctl/client/cluster/upgrader.go:377-431`;
`docs/book/src/clusterctl/commands/upgrade.md:90-99`).

**R4.102** `clusterctl delete` finds, through the discovery of every API
resource, the objects labelled `clusterctl.cluster.x-k8s.io` and
`cluster.x-k8s.io/provider=<provider>`, and deletes them, keeping the
definitions and the namespace unless given `--include-crd` or
`--include-namespace`
(`cmd/clusterctl/client/cluster/components.go:133-238`;
`cmd/clusterctl/client/cluster/proxy.go:220-309`).

**R4.103** Its help warns that removing providers orphans what they
manage, with possible ongoing costs; `--include-namespace` deletes every
object of the namespace; and `--include-crd` refuses to start while
objects of those definitions exist, although the book says that it
deletes them (`cmd/clusterctl/cmd/delete.go:53-82`;
`docs/book/src/clusterctl/commands/delete.md:14-34`;
`cmd/clusterctl/client/delete.go:160-171`;
`cmd/clusterctl/client/cluster/components.go:262-312`).

**R4.104** Inference: `init`, `upgrade`, `move` and `delete` need rights
over the whole management cluster: the discovery of every resource, every
definition, namespaces, cluster roles and webhook configurations
(`cmd/clusterctl/client/cluster/proxy.go:220-309`;
`cmd/clusterctl/client/cluster/components.go:78-131`;
`cmd/clusterctl/client/cluster/mover.go:1253-1314`).

#### Previewing a change of topology

**R4.105** No command of `v1.14.4` plans or previews a change of
topology: `alpha` holds only `rollout`, and
`clusterctl alpha topology plan`, deprecated in v1.7, was removed in v1.11
(`cmd/clusterctl/cmd/alpha.go:30-35`; `CHANGELOG/v1.7.0-rc.0.md:175`;
`CHANGELOG/v1.11.0.md:79`).

**R4.106** During the upgrade of a topology,
`status.controlPlane.upgradePlan` and `status.workers.upgradePlan` list
the versions still to apply; the table of the book on the effects of each
change is the only preview that it documents
(`api/core/v1beta2/cluster_types.go:1563-1574,1606-1618`;
`docs/book/src/tasks/experimental-features/cluster-class/change-clusterclass.md:138-163`).

**R4.107** Inference: a server-side dry run of a patch of the Cluster
runs only the admission webhooks of Cluster, not the topology controller,
so it checks the change but shows none of its effects; the annotation
`topology.cluster.x-k8s.io/dry-run` is internal to the topology
controller. Spike: what such a dry run returns
(`core/config/webhook/manifests.yaml:1-27,176-202`;
`api/core/v1beta2/common_types.go:172-179`).

#### The definitions without their controllers

**R4.108** The release uploads everything in `out/`:
`core-components.yaml`, `bootstrap-components.yaml` and
`control-plane-components.yaml`, built from `core/config/default`,
`bootstrap/kubeadm/config/default` and
`controlplane/kubeadm/config/default`, their concatenation
`cluster-api-components.yaml`, `metadata.yaml`, `runtime-sdk-openapi.yaml`,
the clusterctl binaries and, for the development infrastructure provider
and test runtime extension, `infrastructure-components-development.yaml`
with its cluster templates and
`runtime-extension-components-development.yaml`
(`Makefile:1039,1055-1076,1105-1139`;
`.github/workflows/release.yaml:108-119`).

**R4.109** The definitions in `config/crd/bases` have no
`spec.conversion`; the build patches all 13 core definitions with
`strategy: Webhook`, at the path `/convert` of the webhook Service of the
release (`core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:1-20`;
`core/config/crd/kustomization.yaml:20-35`;
`core/config/crd/patches/webhook_in_clusters.yaml:1-16`). Inference: that
Service is `capi-webhook-service` in `capi-system`, port 443
(`core/config/crd/kustomizeconfig.yaml:1-14`;
`core/config/default/kustomization.yaml:1-3`;
`core/config/webhook/service.yaml:1-9`).

**R4.110** The build also annotates the definitions and the webhook
configurations with `cert-manager.io/inject-ca-from`, and adds a
self-signed `Issuer` and a `Certificate` whose Secret is
`capi-webhook-service-cert`
(`core/config/default/kustomization.yaml:31-123`;
`core/config/default/webhookcainjection_patch.yaml:1-16`;
`core/config/certmanager/certificate.yaml:1-27`). Inference: without the
certificate manager that reads them, the CA bundle of the conversion
webhook stays empty (same sources).

**R4.111** In the build the kubeadm definitions get the contract labels
`cluster.x-k8s.io/v1beta1: v1beta1` and
`cluster.x-k8s.io/v1beta2: v1beta2`, and the core ones get none
(`controlplane/kubeadm/config/crd/kustomization.yaml:1-6`;
`bootstrap/kubeadm/config/crd/kustomization.yaml:1-6`;
`core/config/crd/kustomization.yaml:1-40`).

**R4.112** The core and kubeadm definitions serve `v1beta1`, deprecated,
and `v1beta2`, the storage version, except ExtensionConfig, which serves
`v1alpha1`, deprecated, and `v1beta2`, and no `v1beta1`; IPAddress and
IPAddressClaim also serve `v1alpha1` (R1.7); the `Provider` of clusterctl
has only `v1alpha3`
(`core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:39-40,1861-1862`;
`core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:1936,3891-3892`;
`core/config/crd/bases/runtime.cluster.x-k8s.io_extensionconfigs.yaml:26-27,359-360`;
`core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddresses.yaml:36,118-119`;
`core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddressclaims.yaml:32,153-154`;
`cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml:33,74-75`).

**R4.113** Converting a `v1beta2` object down to `v1beta1` rebuilds the
`apiVersion` of each of its references from the contract labels of the
definition referenced, so it needs those labels
(`core/main.go:742-746`; `core/webhooks/conversion/common.go:106-120`).

**R4.114** Every admission webhook of the release has
`failurePolicy: Fail`; only Cluster, ClusterClass, IPAddress and
IPAddressClaim have one on DELETE, and the only one on a subresource is on
`kubeadmcontrolplanes/scale`
(`core/config/webhook/manifests.yaml:14,188,199,221,306,328`;
`controlplane/kubeadm/config/webhook/manifests.yaml:14,41,52,61,82`;
`bootstrap/kubeadm/config/webhook/manifests.yaml:14,40,61`).

**R4.115** Inference: with the definitions alone and no controllers,
reads, watches and writes at `v1beta2` of objects stored at `v1beta2` need
no webhook, while any request at `v1beta1` or `v1alpha1` needs the
conversion webhook
(`core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:3891-3892`;
`core/config/crd/patches/webhook_in_clusters.yaml:8-16`).

**R4.116** Inference: with the webhook configurations of the release
installed and no manager behind them, every create and update of a kind
that they cover, every delete of the four kinds of R4.114 and every update
of `kubeadmcontrolplanes/scale` fails
(`core/config/webhook/manifests.yaml:1-27,176-202`;
`controlplane/kubeadm/config/webhook/manifests.yaml:29-53`).

**R4.117** Inference: with the definitions alone, objects get none of
the webhooks' defaulting and validation, though the API server still
applies each schema, with its types, enums, patterns, required fields,
defaults and CEL rules, so fixtures must pass it; nothing writes their
`status`, and nothing adds or removes finalizers, so an object given a
finalizer and then deleted stays with its deletion timestamp
(`core/config/webhook/manifests.yaml:1-27`;
`core/reconcilers/cluster/cluster_controller.go:152-155,498-503`;
`core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:2280-2292`;
`controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:3013-3015,3053`;
`core/config/crd/bases/cluster.x-k8s.io_clusterclasses.yaml:3907`).

**R4.118** The test environment of the project installs the definitions
of `config/crd/bases`, which carry no contract label, has envtest
configure conversion webhooks on them (`IgnoreSchemeConvertible`), and
runs the conversion and admission webhooks in its own manager, failing a
run on a conversion webhook panic; in v1.15.0-beta.1 it copies the
contract labels onto the kubeadm definitions, since without them
conversion fails with "cannot find any versions matching contract
versions" (`internal/test/envtest/environment.go:284-325,404-410,742-747`;
`internal/test/envtest/webhooks.go:79-88`;
`cluster-api-v1.15.0-beta.1:internal/test/envtest/environment.go:491-512`).

**R4.119** With the ClusterTopology gate off, the webhook of ClusterClass
refuses to create or update one
(`core/webhooks/admission/clusterclass.go:90-98`;
`core/config/manager/manager.yaml:26`). Inference: a test environment with
the controllers needs the gate on to hold ClusterClass objects (same
sources).

**R4.120** Spike: with the definitions of the release and no webhook
Service, which requests fail; with the bases, whose conversion is the
default one of Kubernetes, what a `v1beta1` read returns; and whether the
views need the contract labels added to the kubeadm definitions
(`core/config/crd/kustomization.yaml:20-35`;
`cluster-api-v1.15.0-beta.1:internal/test/envtest/environment.go:491-512`).

**R4.121** In v1.15.0-beta.1 these are unchanged: `get kubeconfig`, the
steps of the deletion of a Cluster, the rules that skip a remediation,
the pause checks, the rollout commands and the handling of replicas by
the topology
(`cluster-api-v1.15.0-beta.1:cmd/clusterctl/client/cluster/workload_cluster.go:46-61`;
`cluster-api-v1.15.0-beta.1:core/reconcilers/cluster/cluster_controller.go:349`;
`cluster-api-v1.15.0-beta.1:core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:492-502`;
`cluster-api-v1.15.0-beta.1:core/reconcilers/machinedeployment/machinedeployment_controller.go:189,355`;
`cluster-api-v1.15.0-beta.1:cmd/clusterctl/client/alpha/rollout_pauser.go:65-75`;
`cluster-api-v1.15.0-beta.1:exp/topology/desiredstate/desired_state.go:440-446,1094,1443`).

### R5. Other endpoints

**R5.1** Each manager of the release, core, kubeadm control plane and
kubeadm bootstrap, serves its diagnostics at `--diagnostics-address`,
`:8443` by default, on a container port named `metrics`;
`--insecure-diagnostics` defaults to false
(`util/flags/manager.go:84-90`; `controlplane/kubeadm/main.go:214`;
`bootstrap/kubeadm/main.go:171`;
`core/config/manager/manager.yaml:24-25,42-48`;
`controlplane/kubeadm/config/manager/manager.yaml:23-24,42-46`;
`bootstrap/kubeadm/config/manager/manager.yaml:23-24,43-47`).

**R5.2** By default that endpoint is HTTPS, with TLS 1.2 at least, behind
a filter that authenticates and authorizes each request
(`filters.WithAuthenticationAndAuthorization`), and it also serves
`/debug/pprof/` and `/debug/flags/v`, which sets the log level
(`util/flags/manager.go:63-66,134-153`).

**R5.3** To authorize callers, the managers may create `tokenreviews` and
`subjectaccessreviews` (`core/main.go:293-295`;
`core/config/rbac/role.yaml:99-110`).

**R5.4** The book: scraping needs a bearer token whose identity may
`get` the non-resource URL `/metrics`, pprof needs `get` on
`/debug/pprof/*` and the log level `put` on `/debug/flags/v`; it reaches
the endpoint through a port-forward to
`deployments/capi-controller-manager` in `capi-system`, and skips the
check of the self-signed certificate
(`docs/book/src/tasks/diagnostics.md:32-49,55-93`;
`docs/book/src/tasks/diagnostics.md:104-130,152-178`).

**R5.5** With `--insecure-diagnostics=true` the endpoint is plain HTTP,
with no authentication or authorization and no pprof or log-level
handler; the book's example binds it to `localhost:8080`
(`util/flags/manager.go:127-133`;
`docs/book/src/tasks/diagnostics.md:16-30`).

**R5.6** Health: `--health-addr`, `:9440` by default, container port
`healthz`, probed by the Deployment over HTTP at `/readyz` and
`/healthz`; in each manager the only check is `webhook`, which passes once
the webhook server has started (`core/main.go:279-280,420-430`;
`controlplane/kubeadm/main.go:202,331-340`;
`bootstrap/kubeadm/main.go:168,278-287`;
`core/config/manager/manager.yaml:42-56`). Inference: it asks for no
credentials, since the probes send none (same sources).

**R5.7** A profiler on `--profiler-address` is off by default
(`core/main.go:189-190`; `docs/book/src/reference/ports.md:8`).

**R5.8** Webhooks: each manager listens on `--webhook-port`, 9443, with
the certificate of a Secret (`capi-webhook-service-cert`,
`capi-kubeadm-control-plane-webhook-service-cert`,
`capi-kubeadm-bootstrap-webhook-service-cert`), behind a Service
`webhook-service`, in the release `capi-webhook-service`,
`capi-kubeadm-control-plane-webhook-service` and
`capi-kubeadm-bootstrap-webhook-service`, that maps port 443 to it; the
webhook configurations point the API server at that Service
(`core/main.go:261-271`;
`core/config/default/kustomization.yaml:1-3`;
`controlplane/kubeadm/config/default/kustomization.yaml:1-3`;
`bootstrap/kubeadm/config/default/kustomization.yaml:2-4`;
`controlplane/kubeadm/main.go:184`; `bootstrap/kubeadm/main.go:156`;
`core/config/default/manager_webhook_patch.yaml:9-22`;
`core/config/webhook/service.yaml:1-9`;
`controlplane/kubeadm/config/certmanager/certificate.yaml:25`;
`bootstrap/kubeadm/config/certmanager/certificate.yaml:25`;
`core/config/webhook/manifests.yaml:9-13`).

**R5.9** Runtime extensions are servers outside the release that the
core manager calls, and with the `InPlaceUpdates` gate, off by default,
the kubeadm control plane manager too, each as an HTTPS client, at
`spec.clientConfig.url` or at a Service, port 443 by default, checking
`caBundle` and optionally sending the client certificate of its own flags;
the annotation `runtime.cluster.x-k8s.io/inject-ca-from-secret` fills the
CA from a Secret, and RuntimeSDK is off by default
(`api/runtime/v1beta2/extensionconfig_types.go:66-112,309-312`;
`core/main.go:273-277`; `feature/feature.go:109-110`;
`controlplane/kubeadm/main.go:196-200,392-425`).

**R5.10** The only Service in the configurations of core, kubeadm control
plane and kubeadm bootstrap is `webhook-service`, with the prefix of each
provider in the release (R5.8), and the metrics configuration of
`core/config/metrics` is not part of the release: no Service exposes 8443
or 9440
(`core/config/default/kustomization.yaml:10-16`;
`core/config/webhook/service.yaml:1-9`;
`controlplane/kubeadm/config/webhook/service.yaml:2-10`;
`bootstrap/kubeadm/config/webhook/service.yaml:2-10`).

**R5.11** Inference: so the service proxy of the API server cannot reach
the metrics or the health endpoint; its pod proxy can reach a pod but
passes no token of the caller, so the secure endpoint refuses; a
port-forward with a token of the user's own identity, allowed `get` on
`/metrics`, works with no credential of the controller, the port-forward
itself being a request on the `portforward` subresource of the
controller's pod, a grant of its own in the controller's namespace that R6
does not list (`util/flags/manager.go:134-141`;
`docs/book/src/tasks/diagnostics.md:85-93`;
`controlplane/kubeadm/pkg/proxy/dial.go:98-112`).

**R5.12** Spike: through Freelens, reading the metrics of a controller
with a port-forward and a token, and with a client certificate, which
gives no bearer token to present
(`docs/book/src/tasks/diagnostics.md:85-93`).

**R5.13** In v1.15.0-beta.1 the diagnostics flags and the ports are the
same (`cluster-api-v1.15.0-beta.1:util/flags/manager.go:84-90`;
`cluster-api-v1.15.0-beta.1:core/config/manager/manager.yaml:24-25,42-48`).

### R6. Permissions

**R6.1** The release ships roles for its controllers only. Core has a
ClusterRole `manager-role`, a ClusterRole `aggregated-manager-role` that
aggregates every ClusterRole labelled
`cluster.x-k8s.io/aggregate-to-manager: "true"` and is bound to the
ServiceAccount `manager`, and a Role for leader election; the kubeadm
control plane does the same with
`kubeadm.controlplane.cluster.x-k8s.io/aggregate-to-manager`, and kubeadm
bootstrap binds `manager-role` directly; the release prefixes these names
with `capi-`, `capi-kubeadm-control-plane-` or `capi-kubeadm-bootstrap-`,
as in `capi-manager-role` and the ServiceAccount `capi-manager`
(`core/config/rbac/kustomization.yaml:3-9`;
`core/config/default/kustomization.yaml:1-3`;
`controlplane/kubeadm/config/default/kustomization.yaml:1-3`;
`bootstrap/kubeadm/config/default/kustomization.yaml:2-4`;
`core/config/rbac/aggregated_role.yaml:1-8`;
`core/config/default/manager_role_aggregation_patch.yaml:1-15`;
`controlplane/kubeadm/config/rbac/aggregated_role.yaml:1-8`;
`bootstrap/kubeadm/config/rbac/role_binding.yaml:1-12`).

**R6.2** None is meant for users: no ClusterRole in the checkout carries
`rbac.authorization.k8s.io/aggregate-to-view`, `-edit` or `-admin`, and
clusterctl ships only the definition of `Provider`
(`core/config/default/manager_role_aggregation_patch.yaml:1-6`;
`cmd/clusterctl/config/crd/kustomization.yaml:4-6`). Inference: the
Kubernetes roles `view`, `edit` and `admin` grant no Cluster API kind, so
an administrator has to grant them
(`core/config/rbac/aggregated_role.yaml:5-8`).

**R6.3** The ClusterRole in `core/config/metrics`, which reads Cluster
API kinds, serves the development observability setup, in the namespace
`observability`, and is not part of the release
(`core/config/metrics/crd-clusterrole.yaml:1-12`;
`core/config/metrics/kustomization.yaml:1-5`;
`core/config/default/kustomization.yaml:10-16`).

**R6.4** Inference, from the scope and the plural of each definition: the
reads of the views need the grants below, with `get`, `list` and `watch`
unless the row says otherwise, and the source of each row in its last
column:

| Read                                | Group                                                          | Resources                                                                                                                                                 | Scope                                                                                                          | Source                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The core kinds                      | `cluster.x-k8s.io`                                             | `clusters`, `clusterclasses`, `machines`, `machinesets`, `machinedeployments`, `machinepools`, `machinehealthchecks`, `machinedrainrules`                 | Namespaced                                                                                                     | `core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:15-19`; `core/config/crd/bases/cluster.x-k8s.io_machinedrainrules.yaml:15-17`     |
| Add-ons                             | `addons.cluster.x-k8s.io`                                      | `clusterresourcesets`, `clusterresourcesetbindings`                                                                                                       | Namespaced                                                                                                     | `core/config/crd/bases/addons.cluster.x-k8s.io_clusterresourcesetbindings.yaml:15-17`                                                   |
| Kubeadm control plane               | `controlplane.cluster.x-k8s.io`                                | `kubeadmcontrolplanes`, `kubeadmcontrolplanetemplates`                                                                                                    | Namespaced                                                                                                     | `controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:15-19`                                   |
| Kubeadm bootstrap                   | `bootstrap.cluster.x-k8s.io`                                   | `kubeadmconfigs`, `kubeadmconfigtemplates`                                                                                                                | Namespaced                                                                                                     | `bootstrap/kubeadm/config/crd/bases/bootstrap.cluster.x-k8s.io_kubeadmconfigs.yaml:15-17`                                               |
| IP addresses                        | `ipam.cluster.x-k8s.io`                                        | `ipaddresses`, `ipaddressclaims`                                                                                                                          | Namespaced                                                                                                     | `core/config/crd/bases/ipam.cluster.x-k8s.io_ipaddresses.yaml:15-17`                                                                    |
| Runtime extensions                  | `runtime.cluster.x-k8s.io`                                     | `extensionconfigs`                                                                                                                                        | Cluster                                                                                                        | `core/config/crd/bases/runtime.cluster.x-k8s.io_extensionconfigs.yaml:15-19`                                                            |
| Installed providers                 | `clusterctl.cluster.x-k8s.io`                                  | `providers`                                                                                                                                               | Namespaced                                                                                                     | `cmd/clusterctl/config/crd/bases/clusterctl.cluster.x-k8s.io_providers.yaml:15-17`                                                      |
| Providers installed by the operator | `operator.cluster.x-k8s.io`                                    | `coreproviders`, `bootstrapproviders`, `controlplaneproviders`, `infrastructureproviders`, `addonproviders`, `ipamproviders`, `runtimeextensionproviders` | Namespaced                                                                                                     | `cluster-api-operator:config/crd/bases/operator.cluster.x-k8s.io_coreproviders.yaml:9-17`                                               |
| Provider objects                    | each provider group, such as `infrastructure.cluster.x-k8s.io` | the plural of each provider kind                                                                                                                          | Namespaced, in the namespace of the Cluster, or of its ClusterClass for the templates of the class (inference) | `core/config/rbac/role.yaml:54-68`; `cmd/clusterctl/client/tree/discovery.go:93`; `api/core/v1beta2/cluster_types.go:606-607,1711-1717` |
| Version of a provider kind (R6.5)   | `apiextensions.k8s.io`                                         | `customresourcedefinitions`, `get` only, by name                                                                                                          | Cluster                                                                                                        | `internal/contract/version.go:170-181`                                                                                                  |
| Events of the objects               | core group                                                     | `events`, `list` and `watch`                                                                                                                              | Namespaced                                                                                                     | `core/reconcilers/cluster/cluster_controller.go:502`                                                                                    |
| The kubeconfig actions              | core group                                                     | `secrets`, `get` only, limited to `<cluster>-kubeconfig`                                                                                                  | Namespaced                                                                                                     | `util/secret/secret.go:37-54`                                                                                                           |

**R6.5** The version of a provider kind needs `get` on
`customresourcedefinitions`, cluster scoped, which can be limited to the
names `<plural>.<group>`; clusterctl reads only their metadata
(`internal/contract/version.go:170-181`;
`util/contract/contract.go:26-30`). Inference: API discovery does not
carry the contract labels, so without the definitions only the versions
that a provider group serves can be known
(`internal/contract/version.go:116-144`).

**R6.6** Inference: without a grant the API server answers 403
Forbidden. clusterctl then stops `describe` at the GET of R4.3, at the GET
of the Cluster or at any LIST, hides a provider object or the
ClusterResourceSetBinding it may not read (R4.8, R4.34), and reports a
Secret it may not read with the "not found" text of R4.37 followed by the
Forbidden cause
(`cmd/clusterctl/client/cluster/inventory.go:410-415`;
`cmd/clusterctl/client/tree/discovery.go:79-81,93-96,121-124,194-195`;
`cmd/clusterctl/client/cluster/workload_cluster.go:56-59`).

**R6.7** Inference, per command: `describe` needs `get` on definitions
and on `clusters`, `list` on `machines`, `machinepools`,
`machinedeployments` and `machinesets`, `get` on the provider kinds and,
with `--show-resourcesets`, on `clusterresourcesetbindings`;
`get kubeconfig` needs what R4.38 says; `alpha rollout` needs `get` and
`patch` on `machinedeployments` or `kubeadmcontrolplanes`
(`cmd/clusterctl/client/tree/discovery.go:72-192`;
`cmd/clusterctl/client/alpha/machinedeployment.go:32-75`;
`cmd/clusterctl/client/alpha/kubeadmcontrolplane.go:32-75`).

**R6.8** The Secrets of a Cluster are `<cluster>-kubeconfig`, key
`value`, `<cluster>-ca`, `-etcd`, `-sa`, `-proxy` and
`-apiserver-etcd-client`, keys `tls.crt` and `tls.key`, but `-etcd` with
only `tls.crt` under external etcd, and the bootstrap data Secret of each
KubeadmConfig, keys `value` and `format`; those that Cluster API creates
have the type `cluster.x-k8s.io/secret` and the label
`cluster.x-k8s.io/cluster-name`, while those the book has a user create
are of type `kubernetes.io/tls` or `Opaque`, and the external etcd ones
carry no label; R3.24 to R3.34 have them in full
(`util/secret/consts.go:21-58`; `util/secret/certificates.go:119-132,372-386`;
`util/kubeconfig/kubeconfig.go:144-162`;
`bootstrap/kubeadm/reconcilers/kubeadmconfig/kubeadmconfig_controller.go:1415-1437`;
`docs/book/src/tasks/external-etcd.md:55-68`;
`docs/book/src/tasks/certs/using-custom-certificates.md:14,26-33`).
Inference: a view that selects these Secrets by type or label misses those
a user created.

**R6.9** Inference: RBAC cannot select Secrets by label, so listing the
Secrets of a Cluster needs `list` on every Secret of the namespace, with
their contents; reading one needs `get`, which can be limited by name
(`util/secret/secret.go:37-54`).

**R6.10** The kubeconfig that KubeadmControlPlane or the Cluster
controller writes holds a client certificate with the common name
`kubernetes-admin` and the organization `system:masters`, the user
`<cluster>-admin` and the context `<cluster>-admin@<cluster>`, valid for
one year (`util/kubeconfig/kubeconfig.go:56-106`;
`util/certs/types.go:74`; `util/certs/consts.go:25-26`).

**R6.11** KubeadmControlPlane renews that certificate when less than half
of its year is left, only in a Secret of type `cluster.x-k8s.io/secret`
that it controls; the Cluster controller never renews the Secret it
creates, so with no control plane reference that certificate expires after
a year
(`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:77-106`;
`util/certs/consts.go:28-30`; `util/certs/types.go:74`;
`core/reconcilers/cluster/cluster_controller_phases.go:352-382`).
Inference: a copy already taken keeps its access until it expires, since a
client certificate is not revoked (same sources).

**R6.12** The book's control plane contract says that this Secret MUST
not be shared with other users or applications built on top of Cluster
API (R3.26;
`docs/book/src/developer/providers/contracts/control-plane.md:872-874`).
Inference: whoever reads that Secret is administrator of the workload
cluster, since Kubernetes lets `system:masters` bypass authorization; so
`get` on it is administrator access to the workload cluster, whatever role
grants it (`util/kubeconfig/kubeconfig.go:58-62`).

**R6.13** In v1.15.0-beta.1 the RBAC folders of core, kubeadm control
plane and kubeadm bootstrap are unchanged
(`cluster-api-v1.15.0-beta.1:core/config/rbac/role.yaml:1-6`).

### R7. The host

What Freelens 2.1.0 shows and offers

**R7.1** Freelens shows every custom resource under the sidebar item Custom
Resources: first Definitions, then one entry per API group, then one item per
kind, titled by splitting the kind at its capitals and hidden when the user may
not list it
(freelens:packages/core/src/renderer/components/custom-resources/sidebar-item.injectable.tsx:20-29;
freelens:packages/core/src/renderer/components/custom-resource-definitions/sidebar-item.injectable.ts:20-25;
freelens:packages/core/src/renderer/components/custom-resource-definitions/groups-sidebar-items-computed.injectable.ts:36-83).

**R7.2** Groups and kinds come from the definitions, or, when listing
definitions is refused, from the cluster's discovery, and a kind known only from
discovery gets no printer columns
(freelens:packages/core/src/renderer/components/custom-resource-definitions/groups-sidebar-items-computed.injectable.ts:100-118;
freelens:packages/core/src/renderer/components/custom-resources/discovered-custom-resources.injectable.ts:47-61;
freelens:packages/core/src/renderer/components/custom-resources/view.tsx:90-105).
Inference: each Cluster API group is an entry of its own, placed alphabetically
among the cluster's other groups.

**R7.3** One list view serves every definition: Name, Namespace for a namespaced
one, the printer columns of the listed version with priority 0 or unset, a
column named age dropped, and Age; titles are the names in start case, values
and sorting come from each column's JSONPath, and rows are selectable
(freelens:packages/core/src/renderer/components/custom-resources/view.tsx:112-171;
freelens:packages/kube-object/src/specifics/custom-resource-definition.ts:285-289;
freelens:packages/core/src/renderer/components/item-object-list/list-layout.tsx:152).

**R7.4** Inference: from R1.10, the host's lists show the columns without
priority, among them two titled Available on MachineDeployment and KCP, one for
the condition and one for the counter
(core/config/crd/bases/cluster.x-k8s.io_machinedeployments.yaml:866-911;
controlplane/kubeadm/config/crd/bases/controlplane.cluster.x-k8s.io_kubeadmcontrolplanes.yaml:2871-2916).
Whether the host's JSONPath conversion renders the condition filters and the
escaped label key of these columns was not verified
(freelens:packages/utility-features/utilities/src/jsonPath.ts:104-123).

**R7.5** The drawer of an object shows the metadata section, then the host's
custom resource section with every printer column of the listed version whatever
its priority, but for one named age, and a badge per entry of
`status.conditions`, then the events, with the object's menu in its toolbar
(freelens:packages/core/src/renderer/components/kube-object-details/kube-object-details.tsx:58-80;
freelens:packages/core/src/renderer/components/kube-object-details/custom-resource-detail-item.injectable.tsx:22-48;
freelens:packages/core/src/renderer/components/custom-resources/details.tsx:100-108;
freelens:packages/kube-object/src/specifics/custom-resource-definition.ts:285-289).

**R7.6** A condition badge gets the error class when its status is False or
Unknown and is disabled when False, and otherwise the classes of its type and
reason, of which only `Accepted`, `Available`, `Succeeded`, `Success` and
`Ready` have a color; badges are sorted newest `lastTransitionTime` first
(freelens:packages/core/src/renderer/components/kube-object-conditions/components.tsx:35-40;
freelens:packages/core/src/renderer/components/custom-resources/details.scss:7-23;
freelens:packages/core/src/renderer/components/kube-object-conditions/kube-object-conditions-drawer.tsx:37-46;
freelens:packages/core/src/renderer/components/kube-object-conditions/utils.ts:27-35).
Inference: the drawer paints every negative condition of R2 in its normal False
state as an error, `Paused`, `Deleting`, `RollingOut`, `ScalingUp`,
`ScalingDown`, `Remediating` and `Updating`, and the same conditions True, in
their abnormal state, as neutral badges.

**R7.7** The menu of an object, in a list row and in the drawer, offers Edit and
one delete item: Delete when the object is not terminating, Force Finalize when
it is terminating with finalizers, and Delete when terminating without; Force
Delete is for Pods only
(freelens:packages/core/src/renderer/components/kube-object-menu/kube-object-menu.tsx:116-178,
207-289).

**R7.8** Delete confirms with its title, the kind, `namespace/name` and the
cluster's name, asks for no typed name, and deletes with Background propagation;
Force Finalize sends a merge patch that empties `metadata.finalizers`
(freelens:packages/core/src/renderer/components/kube-object-menu/kube-object-menu.tsx:102-114,
252-264;
freelens:packages/core/src/renderer/components/kube-object-menu/kube-object-delete-service.injectable.ts:10,
30-56; freelens:packages/utility-features/kube-api/src/kube-api.ts:789).

**R7.9** Inference: neither dialog says what the deletion cascades to, and Force
Finalize on a terminating Cluster, Machine or KCP drops the finalizer its
controller needs to finish the deletion flow of R2.25, R2.49 or R2.81, leaving
behind what that flow had not yet deleted
(freelens:packages/core/src/renderer/components/kube-object-menu/kube-object-delete-service.injectable.ts:45-56;
core/reconcilers/cluster/cluster_controller.go:341-504;
core/reconcilers/machine/machine_controller.go:471-686).

**R7.10** Edit opens an editor tab with no confirmation, saves a JSON patch
computed from the edited YAML, and adds the annotation
`freelens.app/resource-version` with the API version the object was saved at,
such as `v1beta2`, which the host reads back to load and save the object at
that version
(freelens:packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx:117-128,
161-190, 365-382, 411-466). Inference: on a MachineDeployment, Cluster API
copies that annotation to its MachineSets, which take every MachineDeployment
annotation but a short skip list
(core/reconcilers/machinedeployment/mdutil/util.go:134-147, 183-197).

**R7.11** With rows selected, a list offers Remove selected items, whose dialog
names up to five objects and neither their kind, their namespace nor the cluster
(freelens:packages/core/src/renderer/components/item-object-list/content.tsx:408-453,
584-592).

**R7.12** No Scale is offered on a custom resource with a scale subresource: the
host's Scale items are on Deployments and ReplicaSets, the `/scale` helpers of
`KubeApi` are protected, and an extension reaches the subresource through
`KubeJsonApi.forCluster`
(freelens:packages/core/src/renderer/components/workloads-deployments/deployment-menu.tsx:50;
freelens:packages/utility-features/kube-api/src/kube-api.ts:717-749;
freelens:docs/extensions/migrating-from-v1.md:1218-1225).

What an extension changes

**R7.13** `customResources` takes the extension's model classes and, while the
extension is enabled for the cluster, removes those kinds from the Custom
Resources tree, and a group left empty with them; nothing else changes, and the
host's list, details and route stay reachable by URL, from the definition, from
the command palette and from favorites (freelens:docs/extensions/api.md:837-861;
freelens:packages/core/src/renderer/components/custom-resource-definitions/groups-sidebar-items-computed.injectable.ts:84-90).

**R7.14** No contract replaces the host's details or menu: its custom resource
section stays on every known definition, and an extension's details render next
to it at order `300 - (priority || 50)`, so a priority of 0 counts as 50; on
its own pages an extension replaces the row menu, the row selection and the
drawer through the props of `KubeObjectListLayout`
(freelens:packages/core/src/renderer/components/kube-object-details/custom-resource-detail-item.injectable.tsx:46;
freelens:packages/core/src/renderer/components/kube-object-details/kube-object-detail-items/kube-object-detail-item-registrator.injectable.ts:43-61;
freelens:packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx:293-313).

**R7.15** Menu items, detail items and context menu handlers are registered when
the extension registers, for a kind and a list of apiVersions, and match exactly
(freelens:packages/core/src/renderer/components/kube-object-menu/kube-object-menu-registration.ts:12-35;
freelens:docs/extensions/api.md:775-795). Inference: a provider kind met only at
run time gets no registration unless listed beforehand, so provider objects are
best shown inside the extension's own views.

Versions and definitions at run time

**R7.16** The host lists a definition at its storage version when that version
is served, otherwise at the served version of highest Kubernetes priority, and
says so when the listed version is not served
(freelens:packages/kube-object/src/specifics/custom-resource-definition.ts:197-243;
freelens:packages/core/src/renderer/components/custom-resources/view.tsx:174-181).
Inference: from R1, it lists every Cluster API definition at v1beta2, Provider
at v1alpha3 and the operator's kinds at v1alpha2.

**R7.17** For each definition the host registers one API per served version,
plus the listed one, each with its own store, and built-in or extension APIs win
over them for the same `apiBase`
(freelens:packages/core/src/renderer/before-frame-starts/runnables/setup-auto-crd-api-creations.injectable.ts:62-76;
freelens:packages/core/src/common/k8s-api/api-manager/api-manager.ts:41-63,
162-175). Inference: resolving an API does not prove that a version is served,
and a class per version loads and watches the same objects once per version.

**R7.18** An extension reads the definitions at run time from
`Renderer.K8sApi.crdStore`, the host's own store: `getByGroup` and
`getByObject`, and on a definition `getServedVersions()`, by priority,
`getPreferredVersion()`, `getStoredVersions()` and `metadata.labels`, which hold
the contract labels of R1.16
(freelens:packages/core/src/extensions/renderer-api/k8s-api.ts:74, 110;
freelens:packages/core/src/renderer/components/custom-resource-definitions/store.ts:44-58;
freelens:packages/kube-object/src/specifics/custom-resource-definition.ts:169-275).
Inference: when the user may not list definitions, the store fails and the
labels are out of reach
(freelens:packages/core/src/renderer/components/custom-resources/discovered-custom-resources.injectable.ts:47-61).

**R7.19** From the renderer, `KubeJsonApi.forCluster(clusterId)` reads discovery
at `/apis/<group>`, and a `KubeApi` with `checkPreferredVersion` takes
discovery's preferred version; the host's link helper assumes `v1` for a
reference with no version
(freelens:packages/core/src/extensions/common-api/k8s-api.ts:163-171;
freelens:packages/utility-features/kube-api/src/kube-api.ts:73-105, 442-497;
freelens:packages/core/src/common/k8s-api/api-manager/api-manager.ts:180-206).
Inference: the extension resolves the version of a provider reference before it
links or reads it.

**R7.20** `Renderer.K8sApi` already exports a model named `Cluster`, for
`/apis/cluster.k8s.io/v1alpha1/clusters`, which is not Cluster API's group, and
the host has a root sidebar item titled Cluster
(freelens:packages/kube-object/src/specifics/cluster.ts:50-53;
freelens:packages/core/src/renderer/components/cluster/cluster-overview-sidebar-item.injectable.tsx:22-28).

Adding a cluster to the catalog

**R7.21** Only the main process can add a cluster to the catalog: the main
extension class has `addCatalogSource(id, source)` and
`removeCatalogSource(id)`, the renderer's has only catalog filters, and the host
takes as a cluster an entity of class `KubernetesCluster` with `kubeconfigPath`
and `kubeconfigContext`
(freelens:packages/core/src/extensions/lens-main-extension.ts:66-76;
freelens:packages/core/src/extensions/lens-renderer-extension.ts:168-192;
freelens:packages/core/src/common/catalog-entities/kubernetes-cluster.ts:37-85).

**R7.22** The host connects by spawning its proxy with `--kubeconfig <path>`, so
the kubeconfig must be a file on disk; the host's add-cluster page writes it
under `<userData>/kubeconfigs/` with mode 0600 from the renderer, where an
extension has no guarantee of file access, and no API adds a kubeconfig sync
entry
(freelens:packages/core/src/main/freelens-k8s-proxy/create-freelens-k8s-proxy.injectable.ts:175-184;
freelens:packages/core/src/renderer/components/add-cluster/add-cluster.tsx:95-116;
freelens:docs/extensions/api.md:189-193;
freelens:packages/core/src/extensions/common-api/app.ts:31-40).

**R7.23** `addCatalogSource` is exported but not documented in api.md, whose C14
makes every exported symbol public for the major, and a cluster whose entity
leaves the catalog is disconnected (freelens:docs/extensions/api.md:863-868,
1342-1347;
freelens:packages/core/src/main/cluster/disconnect-clusters-removed-from-catalog.injectable.ts:16-52).
Inference: an extension adds a workload cluster by reading
`<cluster>-kubeconfig`, writing it from main to a file in its own folder,
publishing a `KubernetesCluster` and removing the source in `onDeactivate`; no
host test or document covers this path end to end.

**R7.24** Once in the catalog, a cluster is reached from any frame with
`forCluster`; outside the catalog, only through a client of the extension's own
(freelens:docs/extensions/migrating-from-v1.md:1173-1184, 1324-1355). Inference:
every other read of this extension, on the management cluster, goes through the
host's stores in the renderer, so the main process is needed only to add a
workload cluster to the catalog or to query one outside it
(freelens:packages/core/src/extensions/common-api/k8s-api.ts:184-195).

What 2.1.0 adds

**R7.25** 2.1.0 adds, absent at v2.0.0, `Common.Credentials` (string values up
to 64 KiB, encrypted at rest, no clear-text fallback, meant for credentials of
services outside the cluster), new `Common.Types` helpers,
`Common.App.Preferences.getOverviewStyle()`, and renderer components among which
`StatusCard`, `CapacityCard`, `CopyToClipboardIcon`, `CopyableInput`,
`CopyableMonacoEditor`, `SecretCertificates`, `ErrorBoundary`, `OrderableList`
and `VirtualList` (freelens:docs/extensions/api.md:438-517, 532-647;
freelens:packages/core/src/extensions/common-api/index.ts:14, 23;
freelens:packages/core/src/extensions/common-api/types.ts:7-18;
freelens:packages/core/src/extensions/common-api/app.ts:34-39;
freelens:packages/core/src/extensions/renderer-api/components.ts:37-181;
freelens@v2.0.0:packages/core/src/extensions/common-api/index.ts:10-18;
freelens@v2.0.0:packages/core/src/extensions/common-api/types.ts:1-54;
freelens@v2.0.0:packages/core/src/extensions/common-api/app.ts:28-30;
freelens@v2.0.0:packages/core/src/extensions/renderer-api/components.ts:1-180).

**R7.26** `engines.freelens` is the only enforced gate: only MAJOR.MINOR are
read and rebuilt as `^major.minor`, so `^2.1.0` requires 2.1
(freelens:docs/extensions/api.md:1310-1331;
freelens:packages/core/src/extensions/extension-discovery/is-compatible-extension/is-compatible-extension.ts:15-38).
Inference: on a 2.0 host a member added in 2.1.0 is undefined at run time, so an
extension that uses one declares `^2.1.0` or guards each use.

**R7.27** The template declares `^2.0.0` while it compiles against
`@freelensapp/extensions` 2.1.0, and the KubeSwift, Velero and Sveltos
extensions declare `^2.0.0` (freelens-example-extension:package.json:17, 70;
freelens-kubeswift-extension:package.json:17;
freelens-velero-extension:package.json:17;
freelens-sveltos-extension:package.json:17).

How the Sveltos extension reads Cluster API Clusters

**R7.28** The Sveltos extension reads Clusters through a model fixed at
`cluster.x-k8s.io/v1beta1` and the host's v1beta1 store, and reads
`spec.paused`, `spec.topology.version`, `status.phase`,
`status.controlPlaneReady`, `status.infrastructureReady` and the `Ready`
condition
(freelens-sveltos-extension:src/renderer/api/capi/cluster-v1beta1.ts:5-36;
freelens-sveltos-extension:src/renderer/pages/sveltos-clusters-page.tsx:201-203).

**R7.29** The Sveltos extension counts a Cluster ready from the `Ready`
condition, else from both `controlPlaneReady` and `infrastructureReady`, shows
the phase where it shows a connection status, and offers its Cluster API switch
only where v1beta1 is served
(freelens-sveltos-extension:src/renderer/api/capi/cluster-v1beta1.ts:38-57;
freelens-sveltos-extension:README.md:290-292). Inference: at v1beta1
`status.conditions` are the deprecated v1beta1 conditions and
`controlPlaneReady` is v1beta2's `controlPlaneInitialized`, so its ready is the
v1beta1 `Ready` summary of control plane and infrastructure, narrower than
v1beta2 `Available` (api/core/v1beta1/conversion.go:729-744;
core/reconcilers/cluster/cluster_controller.go:230-237).

**R7.30** The Sveltos extension never pauses a Cluster, does not list it in
`customResources` and gives it no details or menu item; to look into a workload
cluster it reads the Secret `<cluster>-kubeconfig`, key `value`, in the renderer
and sends it to main, which queries the server with its own HTTPS client,
without the proxy settings, and refuses `exec` and `auth-provider` users
(freelens-sveltos-extension:README.md:280-295;
freelens-sveltos-extension:src/renderer/index.tsx:130-139, 305-321;
freelens-sveltos-extension:src/renderer/api/helm-release.ts:20-63;
freelens-sveltos-extension:src/main/helm-release.ts:69-140).

**R7.31** Inference: as the host keeps a store per version, the Sveltos
extension at v1beta1 and a Cluster API extension at v1beta2 watch the same
Clusters twice when both views are open, and an API the Cluster API extension
registered for `/apis/cluster.x-k8s.io/v1beta1/clusters` would become the store
the Sveltos extension reads
(freelens:packages/core/src/renderer/before-frame-starts/runnables/setup-auto-crd-api-creations.injectable.ts:62-76;
freelens:packages/core/src/common/k8s-api/api-manager/api-manager.ts:41-63).

**R7.32** The Sveltos extension's CI installs the Cluster definition of
v1.10.10, called the last release that serves v1beta1, from a `config/crd/bases`
path, while the Cluster definition of v1.14.4 and v1.15.0-beta.1 still serves
v1beta1 and lives under `core/config/crd/bases`
(freelens-sveltos-extension:.github/workflows/integration-tests.yaml:274-282;
core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:39-40, 1861). Inference:
the CI comment reflects the moved path, and the Sveltos extension loses its
Cluster API view when v1.16 stops serving v1beta1 (R1.5).

### Corrections to the brief

Every `[check]` of the brief, and every other fact of it that the
reconnaissance settles, confirmed, corrected or made precise. The sections
named are those of the brief.

**C1** Section 3, `[check]` "the providers other than the kubeadm ones live in
repositories of their own": confirmed, with one more exception. The releases
of kubernetes-sigs/cluster-api also carry a development infrastructure
provider: clusterctl takes the core, the kubeadm bootstrap and control plane
providers and that one from them, and every other provider from a repository
of its own (`cmd/clusterctl/client/config/providers_client.go:164-193,
372-373, 409-410`).

**C2** Section 3, `[check]` "the permissions each one needs": settled by
inference, since the pages of clusterctl in the book name no permission: R6.7
for `describe`, `get kubeconfig` and `alpha rollout`, R4.104 for `init`,
`upgrade`, `move` and `delete`.

**C3** Section 3, `[check]` whether the README needs a trademark sentence, and
"nothing about trademarks is in the repository": the second is corrected. The
logos folder of the project puts the use of any trademark or logo under the
trademark policy of the Linux Foundation, and quotes its guidelines against
implying sponsorship or endorsement (`docs/logos/README.md:15`;
`docs/logos/LICENSE.md:1-13`). The first is left to the spec of the README.

**C4** Section 3, the kinds: corrected in three points. The definitions are in
`core/config/crd/bases`, `bootstrap/kubeadm/config/crd/bases`,
`controlplane/kubeadm/config/crd/bases` and `cmd/clusterctl/config/crd/bases`.
ExtensionConfig serves `v1alpha1`, deprecated, and `v1beta2`, and no
`v1beta1`; IPAddress and IPAddressClaim also serve `v1alpha1`, which their
definitions do not mark deprecated, while the Go packages of both `v1alpha1`
versions are deprecated, to be removed when support for `v1beta1` is dropped
(`api/ipam/v1alpha1/doc.go:20`; `api/runtime/v1alpha1/doc.go:20`; R1.7). The
clusterctl kind `Metadata` is never installed: it is a file format of the
repositories of providers (R1).

**C5** Section 3, "a reference to one holds a group, a kind and a name, with no
version": corrected. That holds for the contract-versioned references of
R1.15, while the `templateRef`s of a ClusterClass and of a remediation carry
an `apiVersion`, and the `status.nodeRefs` of a MachinePool carry `apiVersion`
`v1` (`api/core/v1beta2/common_types.go:390-417`;
`api/core/v1beta2/clusterclass_types.go:1559-1583`;
`api/core/v1beta2/machinehealthcheck_types.go:169-194`;
`api/core/v1beta2/machinepool_types.go:123`).

**C6** Section 3, "the version is read from labels on the definition of that
kind", and section 5, "the labels of the definitions, or API discovery":
confirmed, with three precisions. Only the definitions of providers carry the
labels: the kubeadm ones get them in the build of the release, and the core
ones have none. The code reads the label `cluster.x-k8s.io/v1beta2`, else
`cluster.x-k8s.io/v1beta1`, ignores any other contract label, and takes the
highest version in it, where the book says "the last available version in the
list" (R1.16, R4.6, R4.111; `internal/contract/version.go:47-54, 116-144`;
`docs/book/src/developer/providers/contracts/infra-cluster.md:145-146`).
Discovery gives the versions served, and only the labels say which one the
contract uses (R6.5).

**C7** Section 3, "they read: `clusterctl describe cluster` ...;
`clusterctl get kubeconfig` ...; `upgrade plan`": corrected for `upgrade
plan`, which creates the definition of the inventory when it is missing
(R4.99). `describe cluster` and `get kubeconfig` only read, and only the
management cluster, though like every command they then check for a newer
clusterctl, over the network, and write a local file, unless
`CLUSTERCTL_DISABLE_VERSIONCHECK` is `true` (R4.9, R4.36).

**C8** Section 3, "they write to the management cluster: `init`, `upgrade
apply`, `delete`, `move`, `alpha rollout restart`, `pause` and `resume`":
corrected. `pause` and `resume` are `alpha rollout pause` and `resume`, for
MachineDeployment and KubeadmControlPlane only, and on KubeadmControlPlane they
set and remove an annotation. No command pauses a Cluster, which only `move`
does, internally (R4.61 to R4.63).

**C9** Section 3, "five more hold certificate authorities and keys":
corrected. With stacked etcd the control plane provider generates four
certificate Secrets, `-ca`, `-sa`, `-proxy` and `-etcd`, of which `-sa` holds
the key pair of the service account tokens and no authority. With external
etcd, `-etcd` holds only the certificate of the authority and
`-apiserver-etcd-client` the client pair, both supplied by the user
(`util/secret/consts.go:35-57`; `util/secret/certificates.go:86-132`; R3.24
to R3.31).

**C10** Section 3, "`<cluster>-kubeconfig` holds the kubeconfig of the workload
cluster": made precise. With a `controlPlaneRef`, the control plane provider
creates it, and KubeadmControlPlane renews its certificate, as the book's
contract asks of a provider that uses client certificates; without one, the
Cluster controller creates it and never renews it. The type, the label and the
renewal hold only for a Secret that Cluster API generates (R4.39, R6.11;
`core/reconcilers/cluster/cluster_controller_phases.go:352-382`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/helpers.go:48-126`;
`docs/book/src/developer/providers/contracts/control-plane.md:869-886`). It
gives administrator access to the workload cluster, and the book's contract
says that it MUST not be shared with other users or applications built on top
of Cluster API (R3.26, R6.10 to R6.12).

**C11** Section 3, `v1beta1` "deprecated since v1.11, and stops being served in
v1.16, tentatively April 2027": confirmed for the core and kubeadm kinds by the
table of versions, which gives both v1.16 and April 2027. The
`status.deprecated` fields go with it
(`docs/book/src/reference/versions.md:164-167`; R1.5, R1.6).

**C12** Section 3, the feature gates: confirmed at `v1.14.4`, in the code and in
the arguments of the manager. The definitions are installed whatever the
gates, so the kinds are always served, and the gates decide the writes the
webhooks admit, which controllers run and some steps of those that do (R1.22).
At v1.15.0-beta.1 `ClusterTopology` is beta and on by default
(`feature/feature.go:100-112`; `core/config/manager/manager.yaml:26`;
`core/config/crd/kustomization.yaml:4-17`;
`cluster-api-v1.15.0-beta.1:pkg/features/features.go:115`).

**C13** Section 3, the clusterctl `Provider`, "the inventory that clusterctl
keeps": made precise. A management cluster installed only by the Cluster API
Operator holds no Provider object, and the seven kinds of the operator stand
for it (`cluster-api-operator:internal/controller/phase_lifecycle.go:102-106`;
R1.14).

**C14** Section 4, the Sveltos extension lists Cluster API `Cluster` objects at
`v1beta1`: confirmed by its code, which also reads the Secret
`<cluster>-kubeconfig` of a Cluster, only when the user opens one of its Helm
add-ons, to query the workload cluster from its main process
(`freelens-sveltos-extension:src/renderer/api/capi/cluster-v1beta1.ts:23-36`;
`freelens-sveltos-extension:src/renderer/api/helm-release.ts:20-63`;
`freelens-sveltos-extension:src/renderer/components/helm-release-view.tsx:57-73`;
`freelens-sveltos-extension:src/renderer/pages/sveltos-clusters-page.tsx:270-287`).

**C15** Section 5, `[check]` "what the views show is a Kubernetes object of the
management cluster that Freelens has open": confirmed for every kind of R1, and
for the tools of the project, which read only the management cluster (R4.9,
R4.36). What Cluster API reads or writes in the workload cluster lives there:
the Nodes of Machines and of MachinePools, the Secrets of the join tokens, the
objects a ClusterResourceSet applies (R3.17), and what KCP reads or edits, its
static Pods, the `kubeadm-config` ConfigMap, the RBAC bindings kubeadm needs,
kube-proxy, CoreDNS and the etcd members. The conditions computed from the
workload cluster reach the views as fields of objects of the management cluster
(`core/reconcilers/machine/machine_controller_noderef.go:77-84`;
`core/reconcilers/machinepool/machinepool_controller_noderef.go:109-149`;
`bootstrap/kubeadm/reconcilers/kubeadmconfig/token.go:46-52`;
`core/reconcilers/clusterresourceset/clusterresourceset_controller.go:374,
423`; `controlplane/kubeadm/pkg/workload_cluster_conditions.go:462-715`;
`controlplane/kubeadm/reconcilers/kubeadmcontrolplane/status.go:179-205`;
`controlplane/kubeadm/pkg/workload_cluster.go:175, 355`;
`controlplane/kubeadm/pkg/workload_cluster_rbac.go:67-100`;
`controlplane/kubeadm/pkg/workload_cluster_coredns.go:79`;
`controlplane/kubeadm/pkg/workload_cluster_etcd.go:54, 94`).

**C16** Section 5, the reference extensions "target Freelens `^2.0.0`", and "a
main process only if a spec needs one, for example to add a cluster to the
catalog": both confirmed, and adding a cluster to the catalog does need the
main process (`freelens-kubeswift-extension:package.json:17`;
`freelens-velero-extension:package.json:17`;
`freelens:packages/core/src/extensions/lens-main-extension.ts:66-76`; R7.21
to R7.24).

**C17** Section 6, `[check]` "changing replicas, which creates or destroys
machines": confirmed for MachineSet, for MachineDeployment through its
MachineSets, and for KubeadmControlPlane one Machine at a time after preflight
checks. For a MachinePool the infrastructure provider resizes the pool, and
Machine objects exist only with MachinePool Machines. On an object that a
topology owns, a direct change of replicas that the topology sets is put back,
except while the topology leaves that object alone; replicas that it does not
set, defaulted by the webhooks, keep a direct change (R4.43 to R4.53;
`core/reconcilers/machinepool/machinepool_controller_phases.go:352-358`).

**C18** Section 6, `[check]` "changing the topology of a Cluster, which rolls
the whole cluster": corrected. A version change rolls one component at a time,
the control plane first; a change of the spec of a template rolls only the
control plane or the MachineDeployments that use it; metadata, timeouts,
`minReadySeconds`, readiness gates and taints are applied in place, although
another page of the book says that changing the labels and annotations of
Machines needs a rollout; replicas only scale
(`core/reconcilers/topology/cluster/status.go:81-83`;
`docs/book/src/tasks/experimental-features/cluster-class/change-clusterclass.md:140-163`;
`docs/book/src/tasks/experimental-features/cluster-class/operate-cluster.md:50,
232-234`; `core/reconcilers/machinedeployment/mdutil/util.go:361-446`;
`controlplane/kubeadm/pkg/filters.go:53-112`).

**C19** Section 6, "pausing, which stops the controllers, and the annotations
that mark a machine as the first to delete on a scale down, or as unhealthy":
made precise. `spec.paused` of a Cluster stops the controllers of its
objects, but four ignore the field: those of ClusterResourceSet, which keeps
applying its resources to a paused Cluster, ClusterClass, ExtensionConfig and
ClusterResourceSetBinding (R2.3, R4.58). The annotation
`cluster.x-k8s.io/paused` stops only those of the object it is on, by its
presence whatever its value, and on a Machine also takes it out of every
MachineHealthCheck's targets (R2.70). `spec.paused` of a MachineDeployment
stops only its rollouts. `cluster.x-k8s.io/delete-machine` only orders the
next scale down, after the Machines already deleting.
`cluster.x-k8s.io/remediate-machine` makes a MachineHealthCheck mark the
Machine unhealthy at once, acts only where a MachineHealthCheck selects the
Machine, and leaves the remediation to the owner, within `triggerIf` and the
owner's own limits. The annotations `cluster.x-k8s.io/skip-remediation` and
`cluster.x-k8s.io/paused` on the Machine, or the latter on the
MachineHealthCheck, stop only that marking: a Machine already marked is still
remediated, unless the Cluster or the owner is paused
(R4.44, R4.57, R4.58, R4.87, R4.89, R4.90, R4.92;
`core/reconcilers/machineset/machineset_deletion_order.go:37-57`;
`core/reconcilers/machinehealthcheck/machinehealthcheck_targets.go:81-92`).

**C20** Section 6, "deleting a Cluster, which deletes its machines and the
infrastructure behind them": confirmed, in the order of R4.72 to R4.76. The
Nodes are not drained while the Cluster is deleting, and a paused Cluster is
not deleted until it is resumed (R4.77, R4.60).

**C21** Section 6, "`clusterctl move`, `init`, `upgrade apply` and `delete`":
confirmed as dangerous, for the reasons of R4.95 to R4.104.

**C22** Section 6, "reading the secrets of section 3, which give administrator
access to a workload cluster": confirmed for `<cluster>-kubeconfig` (R6.10 to
R6.12), which the book's contract says MUST not be shared with other users or
applications built on top of Cluster API (R3.26), for the certificate Secrets,
whose private keys give full control of the workload cluster, except `-etcd`
with external etcd, which then holds no key while `-apiserver-etcd-client`
holds the client key the API server uses for etcd, and for the bootstrap data
Secret of a control plane Machine, which embeds the same keys (R3.29 to
R3.34, R6.8).

**C23** Section 7, "the definitions and the controllers are files of the
release": confirmed. Three of its files are built from the `config/default`
folders and a fourth concatenates them (R4.108), and they bring the conversion
webhook, the injection of the certificate authority and the contract labels of
the kubeadm kinds, all missing from the bases (R4.109 to R4.111).

## Architecture decisions

- **A1. Renderer only, with one known exception.** Every view, and every
  write to the management cluster, runs in the renderer through the API of
  the cluster that the user has open in Freelens. The main process comes
  with the first spec that needs it. Only one action is known to: adding a
  workload cluster to the catalog of Freelens, because the host connects a
  cluster only from a kubeconfig file on disk, and only the main process can
  add an entity to the catalog (R7). Saving a kubeconfig to a file the user
  chooses is settled by its spec, after S4.
- **A2. The ways to the data, in order of preference.**
  1. The Kubernetes API of the management cluster that Freelens has open,
     through the stores of the host, one for each kind, watched rather than
     polled: the kinds of Cluster API at `v1beta2`, the `Provider` of
     `clusterctl` at `v1alpha3` and the kinds of the Cluster API Operator at
     `v1alpha2`, the only versions these two serve (R1).
  2. The definitions of the kinds, for the version of a provider kind that a
     reference names by group and kind only: the label
     `cluster.x-k8s.io/v1beta2`, else `cluster.x-k8s.io/v1beta1`, of the
     definition, and the highest version in its value (R1.16). The
     definition is read by its name, which needs no right to list
     definitions; without the right to read it, the reference is shown as
     group, kind and name, with no link (S2).
  3. The events of the objects, for the history that a status does not keep
     (R2).
  4. The Secret `<cluster>-kubeconfig`, inside the two kubeconfig actions
     only, after their confirmation (A14).

  Not used: the metrics and health endpoints of the controllers (R5, S9);
  the workload clusters, whose state reaches the management cluster through
  the conditions the controllers write (R2); the fields under
  `status.deprecated`, apart from two: the readiness of a MachinePool, which
  writes no health condition at `v1beta2` in this release (R2, H1), and the
  failure fields of A5.
- **A3. What the extension never does.**
  - It never writes to a workload cluster.
  - It never writes a `status`, never removes a finalizer and never sets an
    annotation that turns off a check of a webhook.
  - It never reads a Secret outside the two kubeconfig actions, and never
    shows or logs the content of a Secret, the bootstrap data of a machine,
    or the fields of KubeadmConfig, KubeadmControlPlane and their templates
    that hold a join token, a password, the content of a file, or the
    credentials of a discovery by kubeconfig file (R3.36).
  - It never writes without a spec of its own and a confirmation that names
    the target.
  - It never requests a version of a kind other than the one A2 names.
- **A4. The contracts of the project as typed modules.** The types of each
  kind are written from the schemas of the release, not generated from its
  Go types or clients. A tested parser stands for every value that is not a
  plain field: the value of a contract label, versions joined by `_`; the
  messages of conditions, which are lists of bullet lines with nested lines
  (R2); Kubernetes versions with their leading `v`, for comparison; the
  annotations that hold lists, such as the pending hooks of a Cluster (R3);
  and the times of status, in RFC 3339.
- **A5. Deprecated forms are shown with a label and never generated.**
  Objects created at `v1beta1` reach the views converted to `v1beta2` by the
  project (R1). The failure reason and message under `status.deprecated`,
  which the controllers still write at this release when a provider of the
  `v1beta1` contract reports them or when the infrastructure disappears
  after provisioning (R2), are shown with a "deprecated" label, as the
  evidence they are. The phase `Failed`, which no controller sets, is shown
  the same way if an object carries it. The extension never writes them.
- **A6. Pages for the kinds of the project, provider objects inside them.**
  The extension registers pages for the kinds that Cluster API installs. The
  kinds of a provider are known only at run time (R1): they are shown inside
  the views of the extension as the objects a reference names, with their
  conditions and the fields of the contract, and a link to the page of the
  host for the object.
- **A7. The paths of the host on these kinds.** The host lists every custom
  resource and offers edit, delete, force finalize and bulk removal on each
  object, in its rows and in the menu of its details drawer, and an
  extension cannot take its pages away (R7). The pages of the extension take
  out the row selection and the row menu of the host, and open their own
  details rather than the drawer of the host, so that the menu of the host is
  not one click away from them (S5). Their own paths follow the rules of the
  first write spec. The kinds the extension gives a page are listed in
  `customResources`, so that the sidebar does not show them twice.
- **A8. `engines.freelens`.** It becomes `^2.1.0` in the first pull request
  that uses a member added in Freelens 2.1.0, and that pull request removes
  Freelens 2.0.0 from the integration tests. Until then it stays `^2.0.0`, as
  in the template (R7). The maintainer amended it on 2026-11-26 ("Notes and
  deviations").
- **A9. The Sveltos extension.** It reads `Cluster` at `v1beta1` through the
  host, and this extension reads `v1beta2`: the host keeps one store for each
  version, with no shared state (R7). It counts a Cluster ready from its
  `v1beta1` `Ready`, a narrower rule than the health of H1, so this
  extension does not take its words for a different rule. S6 tries both
  together.
- **A10. Feature gates are not read.** No API exposes them (R1). The views
  never assume that ClusterClass, managed topologies, MachinePools, the
  runtime extensions or in-place updates are in use: they follow the objects
  that exist.
- **A11. Writes on what a topology owns go to the topology.** A managed
  topology owns the replicas of the control plane, of a MachineDeployment
  and of a MachinePool when `Cluster.spec.topology` sets them, and the
  rollout of the control plane and of a MachineDeployment when it sets it
  (R4). The controller of the topology puts back a value written on the
  object itself, except while that object is pending an upgrade, while a
  MachineDeployment is deleting and while the Cluster is paused, when it
  touches nothing (R4). So an action on what the topology owns writes the
  field of `Cluster.spec.topology`, and says so in its confirmation. When
  the topology leaves the replicas unset, the defaulting webhook of the
  object sets them, and nothing owns them unless an autoscaler does, as its
  annotations say (R4): the action then writes the object, and says who else
  may change it. At this release, a `rollout` written in the topology of a
  MachineDeployment replaces its whole rollout, the strategy included (R4,
  S10).
- **A12. Permissions are stated, not assumed.** The release ships roles for
  its controllers only (R6). The views need to read the kinds of R1, the
  operator's included, in the namespaces of the Clusters and of their
  ClusterClasses; to read a definition by its name, for a provider reference
  (A2); and the events. The kubeconfig actions need to read one Secret, which
  administers the workload cluster. The README of the extension says which
  permissions each part needs.
- **A13. One Cluster, one namespace.** The objects of a Cluster live in its
  namespace, apart from its ClusterClass and the templates of the class
  (R3). A view of one Cluster loads them there, whatever namespaces the user
  has selected in the host: by the label `cluster.x-k8s.io/cluster-name`
  where the project sets it; by `spec.clusterName`, for a
  ClusterResourceSetBinding and an IPAddressClaim; by the references of its
  objects, for templates; and by matching selectors, for the
  ClusterResourceSets and MachineDrainRules that apply to it (R3).
- **A14. The kubeconfig of a workload cluster.** The contract of the book
  lets operators use the Secret `<cluster>-kubeconfig` for an initial access,
  and says it must not be shared with other users or with applications built
  on Cluster API (R3.26). The two actions of the brief hand it only to the
  user who asked, who is reading it with their own rights, never to anyone
  else; their confirmation says it is an administrator credential for an
  initial access, and that a lasting access is better given by a
  certificate of the user's own. Its content never reaches the screen or a
  log.

## Status model

The model lives in pure functions that the lists, the details and the
overview share, so that they never disagree. Health and activity are two
independent marks, as the design rules of the kit ask: an object can be
healthy and rolling out, or unhealthy and provisioning.

- **H1. Health, a closed set of four, for the kinds that have a status.**
  - **Healthy**: the condition that sums up the object is `True`, and no
    other condition of positive polarity is `False`.
  - **Degraded**: the summary is `True`, and another condition of positive
    polarity is `False`, an issue the summary leaves out.
  - **Unhealthy**: the summary is `False`.
  - **Unknown**: the summary is `Unknown` or missing, or the object has no
    status yet.

  A condition of negative polarity that is `True` is an activity (H2), never
  an issue of health, and a condition that is `Unknown` other than the
  summary changes nothing, since some stay `Unknown` on healthy objects
  (R2). The rule that names the summary of each kind is in R2; these
  exceptions hold:
  - A kind with no status, such as a template, a MachineDrainRule or an
    IPAddress, has no health.
  - A MachinePool writes no health condition at `v1beta2` in this release;
    its `v1beta2` counters copy the count of instances of its provider, and
    its deprecated `v1beta1` readiness does not follow a Node that turns not
    ready after joining, unless its provider keeps Machines for the pool
    (R2.66 to R2.69). So its health comes from those Machines when they
    exist, and is Unknown otherwise, with the reason said next to it.
  - The `Available` of a Cluster leaves out its MachinePools, the readiness
    of its control plane Machines, its stand-alone Machines and the
    Machines of its MachineSets, and the readiness of Machines within the
    `maxUnavailable` of a MachineDeployment (R2). So a Cluster is at most
    Degraded when one of them reports an issue, and one whose MachinePools
    are Unknown says so next to its health.
  - A ClusterResourceSet can end `ResourcesApplied` `True` with a resource
    missing (R2.84): its health is read from its bindings, Cluster by
    Cluster.
  - A MachineHealthCheck reports `RemediationAllowed` `False` also when too
    few Machines are unhealthy for its range, none included (R2.72): its
    health counts its unhealthy targets, and the remediation allowed or not
    is shown apart.
  - A provider installed by the operator keeps `Ready` `True` after a failed
    preflight check or upgrade (R2.88): it is Healthy only when
    `PreflightCheckPassed`, `ProviderInstalled` and `Ready` are all `True`.
  - Some conditions of positive polarity go `False` during a normal rollout
    or scale down, such as those of the health of etcd and of the
    components of a control plane while a Machine is deleted (R2.80). They
    do not make the object Degraded while that activity lasts; the spec of
    the status model names them.
  - A deleting object has no health: its activity is Deleting, and the
    reason of its `Deleting` condition says how far it is.

  An unknown value is Unknown, never Healthy. Health is marked stale, not
  changed, when the object is paused, since its controllers stop writing;
  when its status describes an older generation than its spec; when the
  controller of its kind is not available; and, for the conditions computed
  from a workload cluster, while that cluster cannot be reached, since they
  keep their last value for a grace period (R2.80). The views say so next to
  it. The spec of the status model, in M1, turns these rules into the rule of
  each kind, with its tests.
- **H2. Activity, a closed set.** What the object is doing, apart from its
  health, from its conditions and fields, never from its phase alone, which
  the project itself warns against (R2):
  - **Deleting**, from the deletion timestamp;
  - **Paused**, from the `Paused` condition;
  - **Rollout paused**, a MachineDeployment whose `spec.paused` holds its
    rollouts while `RollingOut` is `True` (R2);
  - **Provisioning**, a Cluster until its control plane is initialized, a
    Machine until it has a Node, a MachinePool until it reports its Nodes;
  - **Upgrading**, a Cluster whose `TopologyReconciled` has the reason
    `ClusterUpgrading` or an `UpgradeDeferred` reason, and a control plane
    whose versions in status differ from the version in its spec;
  - **Rolling out**, **Scaling up**, **Scaling down**, **Remediating**,
    **Updating**, from the conditions of the same names, `True`;
  - **Idle**, when none holds.

  An object can do more than one at a time, and the views show them all.
  An activity whose reason or message says that it failed or is blocked,
  such as `InPlaceUpdateFailed`, or an upgrade whose message names a
  blocking hook, is shown as blocked, not as progress (R2, R4). The views
  show how long an activity has lasted. An object that is provisioning and
  Unhealthy is shown as provisioning until it passes the time the project
  allows a Node to start, then as Unhealthy (R2).
- **H3. The weight of a condition, in the list of the conditions of an
  object.** A condition of positive polarity is an issue when `False`; one of
  negative polarity is an activity when `True` and at rest when `False`; any
  condition is unknown when `Unknown`. The types of negative polarity are a
  closed set: `Paused`, `Deleting`, `RollingOut`, `ScalingUp`, `ScalingDown`,
  `Remediating` and `Updating`, which the source does not declare as such
  (R2.20). A type that is not in it, such as an availability gate or a
  condition of a provider, is positive unless its gate says otherwise. A
  `TopologyReconciled` that is `False` with a reason other than
  `ReconcileFailed` and `ClusterClassNotReconciled` is an activity, as the
  project counts it (R2).

## Spikes

- **S1.** The definitions of the release, installed without their
  controllers, serve objects at `v1beta2`, their storage version, without
  the conversion webhook, and fail only for a request at another version
  (R4.115 to R4.120). Tried by the spec of the test environment.
- **S2.** The renderer reads a definition by its name through the host, for
  its contract labels, with a user who may read definitions but not list
  them, and the fallback to text works for a user who may not read them.
  Tried by the first spec that shows a provider object.
- **S3.** A `KubernetesCluster` added from the main process with
  `addCatalogSource`, which the extension documents of Freelens do not
  describe, connects in Freelens 2.1.0 and goes away with the extension.
  Tried by the spec that adds a workload cluster to the catalog.
- **S4.** A kubeconfig is saved to a file the user chooses without its
  content reaching the screen, the renderer logs or the main logs. Tried by
  the spec of the download.
- **S5.** The pages of the extension take out the row selection and the row
  menu of the host and open their own details, and the details panel of the
  extension sits next to the panel of the host, on its own pages, in the
  right order. Tried by the first list page.
- **S6.** With the Sveltos extension installed, both extensions show the
  same Clusters, and neither watch disturbs the other. Tried by the first
  view of Clusters.
- **S7.** The inference of R2.27: a Cluster with no reference and no
  topology reports `Unknown` on the conditions of the missing parts, and so
  never `Available`. Tried on a running management cluster by the spec of
  the status model: by hand on 2026-11-25, and by its test of the real tier,
  which asserts it once its run in CI has passed ("Notes and deviations").
- **S8.** How a change of the topology of a Cluster is previewed before it
  is applied. A dry run of the patch on the server runs the webhooks of the
  Cluster, not the controller of the topology (R4): it checks the change,
  and shows none of its effects. Tried by the spec of the upgrade of a
  managed topology.
- **S9.** Reading the metrics of a controller through a port forward with a
  token of the user's own, and what happens for a user who logs in with a
  client certificate (R5.12). Not needed by any view of `1.0.0` (A2); tried
  by the spec that adds the metrics, if the roadmap adds one.
- **S10.** Restarting the rollout of a MachineDeployment that a topology
  owns keeps its strategy (A11). Tried by the spec of the restart.

## Versions

- Cluster API: `v1.14.4`, commit
  `4356c154f4a76b8939748ef7ebc2d0793ffe47e8`, the latest stable release on
  2026-11-22. `v1.15.0-beta.1` is the latest prerelease.
- Kubernetes of the test cluster: `1.37.0`, which `v1.14` supports for a
  management cluster from `v1.14.1` (`docs/book/src/reference/versions.md:375`).
  The spec of the test environment fixes it.
- Freelens: 2.1.0, tag `v2.1.0`, commit `c4700f9`.
- The template: `5c75d60`. The kit: `v0.1.2`.

## Notes and deviations

- The template of the kit has no section for the facts of the host. They are
  R7, because the brief asks about them (questions 5, 13, 14 and 15).
- Seen on 2026-11-22, decided while implementing: on a kind cluster with
  Kubernetes 1.37.0, Cluster API `v1.14.4` and its development provider, a
  Cluster whose only workers were a MachinePool, none of whose Nodes was
  ready, and whose control plane Machine was not ready either, reported
  `Available` `True`, `WorkersAvailable` `True` with the reason `NoWorkers`,
  and `ControlPlaneMachinesReady` `False`. Its MachinePool reported only
  `Paused` at `v1beta2`, and `Ready` `False` among its deprecated `v1beta1`
  conditions. The development provider keeps Machines for its pools, so
  there the counters of the pool followed the readiness of its Machines,
  which is not the general case (H1).
- Seen on 2026-11-25, in the trial of S7 by hand on the real tier of the test
  environment (SPEC-0003, P32), Cluster API `v1.14.4` with its development
  provider, which the test of S7 of the real tier
  (`test/real-project/s7.tests.ts`) asserts only once its run in CI has
  passed, as SPEC-0003 records: the inference of R2.27 holds, on the two
  Clusters that the webhook of Cluster lets through, since it refuses one with
  neither reference nor topology on the field `spec`
  (core/webhooks/admission/cluster.go:183-191). A Cluster with an
  infrastructure reference only reported `ControlPlaneAvailable` `Unknown`
  `InternalError`, and one with a control plane reference only
  `InfrastructureReady` `Unknown` `InternalError`, for the 15 minutes of the
  trial; neither reported `Available` `True`. It made R2.26 precise: a
  condition that the Cluster mirrors takes the `lastTransitionTime` of the
  condition of its provider when it is first written from a provider that
  reports it and whenever its own status changes; otherwise it keeps its last
  transition, and one first written from a fallback, while the provider
  reports none yet, takes the time of that write
  (util/conditions/mirror.go:76-77; util/conditions/setter.go:62-64, 101-110).
  The `ControlPlaneAvailable` `False` of the second Cluster kept the time of
  the fallback that the Cluster wrote two seconds after its creation, before
  its KubeadmControlPlane had an `Available`, which that wrote two seconds
  later, with the reason and the message that the mirror then copied; the
  `InfrastructureReady` of the first Cluster, which turned `True`, took the
  time of the `Ready` of its infrastructure cluster.
- Decided by the maintainer on 2026-11-26, amending A8: from the pull request
  that records this decision, `engines.freelens` is `^2.1.0` and the jobs of
  CI run Freelens 2.1.0 alone, without waiting for a pull request that uses a
  member added in 2.1.0. The extension follows the latest release of Freelens,
  and it has no release yet.
- Amended by SPEC-0028, as the maintainer decided on 2026-11-26: A2 and A3 have
  one exception. The extension reads the TenantControlPlanes of
  `kamaji.clastix.io` at `v1alpha1`, for their name, their namespace and their
  owner references only, only while the Kamaji extension of the organization,
  `@freelensapp/kamaji-extension`, is enabled, and never their Secrets, so that
  the details of a Cluster whose control plane is a KamajiControlPlane link its
  tenant (SPEC-0028, P14 to P17). It is the one kind of another project that the
  extension reads, and the rule of A3 that the extension never requests a
  version of a kind other than the one A2 names admits this version of this
  kind, and no other.
