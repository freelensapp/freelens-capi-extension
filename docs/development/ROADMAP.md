# Roadmap

Goal for v1.0.0: an operator who runs clusters with Cluster API opens the
management cluster in Freelens and sees, live, every cluster, its health and
the reason behind it, down to each machine and each object of a provider.
From the same views they do the everyday operations, each behind a
confirmation that says what it changes. No other interface for Cluster API
shows more, or shows it more clearly.

Approved by the maintainer on 2026-11-22, together with SPEC-0001.

This file is the single source of truth for scope and progress. Update it in
every pull request that starts, completes or re-scopes a feature. Nothing
moves out of the agreed scope without a decision recorded here.

The extension is built for Freelens 2.1.0. It follows Cluster API `v1.14.4`,
reviewed in [SPEC-0001](../specs/SPEC-0001-reconnaissance.md).

## Releases

- **`1.0.0-0`**: a prerelease of M1 to M3, without an announcement, only to
  try the release workflows and the installation from the official package.
- **`1.0.0`**: M1 to M4, the first release.

## Feature inventory and milestones

Derived from the reconnaissance: the kinds of Cluster API at `v1.14.4`, its
own tool `clusterctl`, and what its users do with them, checked against the
features of the other interfaces for Cluster API, each of which is here or
out of scope with a reason.

Status values: `Planned`, `Draft` (the spec is written, not approved),
`Approved`, `In PR`, `Done`.

### M1 - The fleet (read-only)

| Feature                                                                                                                                                                                                                                                                                                             | Spec                                                | Status                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------- |
| Reconnaissance, and how the extension reaches a cluster                                                                                                                                                                                                                                                             | [SPEC-0001](../specs/SPEC-0001-reconnaissance.md)   | Done                       |
| Test environment: the definitions with fixtures for the views, and the real project with its development provider for the actions and the demo, in two pull requests: the scripts and the pins first, then the fixtures and the jobs of CI                                                                          | [SPEC-0002](../specs/SPEC-0002-test-environment.md) | Done                       |
| The status model: health, activity and the weight of a condition, with the parsers of SPEC-0001, in three pull requests: the parsers first, then the model, then its cases on the fixtures and the trial on the real project                                                                                        | [SPEC-0003](../specs/SPEC-0003-status-model.md)     | In PR, the second of three |
| Clusters: list and details, with health, activity, control plane and workers, conditions and topology, in three pull requests: the models, the reads and the list first, then the details, then the sessions with restricted identities and with the real project, with the documents that the whole view completes | [SPEC-0004](../specs/SPEC-0004-clusters.md)         | In PR, the first of three  |
| The tree of a Cluster: every object that makes it, those of the providers included, live, with the state and the reason of each                                                                                                                                                                                     | SPEC-0005                                           | Planned                    |
| The overview of a management cluster: what is wrong and where, what is changing, the providers, and what it shows where Cluster API is not installed                                                                                                                                                                | SPEC-0006                                           | Planned                    |
| The pass before a milestone review: every view in a dark and in a light theme, checked and photographed, with its report, and the walkthrough of the demo                                                                                                                                                           | SPEC-0007                                           | Planned                    |

Exit of M1: on a management cluster, a user sees every Cluster live, its
health with the reason, and the tree of each one, in a dark and in a light
theme.

### M2 - Every kind (read-only)

| Feature                                                                                                                                                                      | Spec      | Status  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- |
| Machines: the Node, addresses, versions, certificate expiry, drain and deletion progress                                                                                     | SPEC-0008 | Planned |
| MachineDeployments and MachineSets: replicas, rollouts, the Machines of each                                                                                                 | SPEC-0009 | Planned |
| MachinePools: replicas and the Machines of each pool                                                                                                                         | SPEC-0010 | Planned |
| Control planes: KubeadmControlPlanes and their templates, with the members, the health of etcd and of the components, rollouts; any other control plane through the contract | SPEC-0011 | Planned |
| ClusterClasses and managed topologies: variables, patches, the Clusters of a class, versions and the upgrade plan                                                            | SPEC-0012 | Planned |
| Health checks and drain rules: MachineHealthChecks with their targets and remediations, MachineDrainRules                                                                    | SPEC-0013 | Planned |
| Bootstrap and add-ons: KubeadmConfigs and their templates, never showing the secrets they hold; ClusterResourceSets and what each applied to which Cluster                   | SPEC-0014 | Planned |
| IP addresses and runtime extensions: IPAddressClaims, IPAddresses, ExtensionConfigs                                                                                          | SPEC-0015 | Planned |
| The providers installed, from the inventory of `clusterctl` or from the Cluster API Operator, with versions and health                                                       | SPEC-0016 | Planned |
| Events of the objects, in their details and in the tree                                                                                                                      | SPEC-0017 | Planned |

Exit of M2: every kind that a management cluster holds has a view, every
list filters by Cluster and by state, and every feature of the inventory
that only reads is in.

### M3 - Actions (behind explicit confirmation)

| Feature                                                                                                                                                                              | Spec      | Status  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------- |
| Ground rules of the write actions, and the first action: scaling a control plane, a MachineDeployment, a MachineSet or a MachinePool, through the topology when it owns the replicas | SPEC-0018 | Planned |
| Pausing and resuming a Cluster, saying what each form reaches                                                                                                                        | SPEC-0019 | Planned |
| Restarting the rollout of a control plane or of a MachineDeployment                                                                                                                  | SPEC-0020 | Planned |
| Machines: deleting one, marking one to go first, forcing or skipping a remediation                                                                                                   | SPEC-0021 | Planned |
| The kubeconfig of a workload cluster: adding the cluster to Freelens, and downloading the file                                                                                       | SPEC-0022 | Planned |
| From a Machine to its Node in the workload cluster, and back, once that cluster is in Freelens                                                                                       | SPEC-0023 | Planned |
| Creating a Cluster from a ClusterClass, with a form built from its variables                                                                                                         | SPEC-0024 | Planned |
| Upgrading the Kubernetes version of a managed topology, with its plan and a preview                                                                                                  | SPEC-0025 | Planned |
| Deleting a Cluster, saying what goes with it                                                                                                                                         | SPEC-0026 | Planned |

The first write spec sets the ground rules of every action of the milestone.
Nothing in it ships without a test that reads the result back from the
cluster.

Exit of M3: every action in scope, each with its confirmation and its test
against the real project.

### M4 - The release

| Feature                                                                      | Spec      | Status  |
| ---------------------------------------------------------------------------- | --------- | ------- |
| README with screenshots and a demo video, the walkthrough, release readiness | SPEC-0027 | Planned |

Exit of M4: `1.0.0` published by the release workflow, installed from the
official package and tried there.

## Out of scope

- Installing, upgrading and deleting providers, and moving clusters to
  another management cluster: `clusterctl` and the Cluster API Operator do
  it, fetching components from the network. The extension shows the
  providers installed and their versions.
- A form to edit any field of a Cluster: the editor of the host edits any
  object, and the actions of M3 cover the everyday changes with their
  confirmations.
- Several management clusters in one view: each one is opened as a cluster
  of Freelens. Considered after `1.0.0`.
- The next versions of the providers, which `clusterctl upgrade plan`
  fetches from the network: the extension shows the versions installed.
- Importing a workload cluster into another platform: the extension adds it
  to Freelens.
- Links to the consoles of cloud providers: the provider ID of a Machine is
  shown and copied in one click.
- Searching inside one object: the editor of the host searches the YAML of
  any object.
- The metrics of the controllers: they need a port forward and a token of
  the user's own; considered after `1.0.0`.
- The logs of the controllers, filtered by object: the logs of their Pods
  are in the host.
- A catalog of known failures with advice: the views show the reason and the
  message that the project writes, which stay current with the project.

## Release criteria for v1.0.0

- Every milestone implemented, each feature behind an approved spec.
- Every feature covered by non-regression tests that run green in CI.
- The documents (specs, architecture, roadmap) aligned with what ships.
