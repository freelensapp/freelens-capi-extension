# @freelensapp/capi-extension

[![Home](https://img.shields.io/badge/%F0%9F%8F%A0-freelens.app-02a7a0)](https://freelens.app)
[![GitHub](https://img.shields.io/github/stars/freelensapp/freelens?style=flat&label=GitHub%20%E2%AD%90)](https://github.com/freelensapp/freelens)
[![DeepWiki](https://img.shields.io/badge/Ask-DeepWiki-blue)](https://deepwiki.com/freelensapp/freelens-capi-extension)
[![Release](https://img.shields.io/github/v/release/freelensapp/freelens-capi-extension?display_name=tag&sort=semver)](https://github.com/freelensapp/freelens-capi-extension)
[![npm](https://img.shields.io/npm/v/@freelensapp/capi-extension.svg)](https://www.npmjs.com/package/@freelensapp/capi-extension)
[![Integration tests](https://github.com/freelensapp/freelens-capi-extension/actions/workflows/integration-tests.yaml/badge.svg?branch=main)](https://github.com/freelensapp/freelens-capi-extension/actions/workflows/integration-tests.yaml)

## Overview

The Freelens extension for [Cluster API](https://cluster-api.sigs.k8s.io/):
the clusters that a management cluster manages, with their machines, control
planes and providers, in [Freelens](https://freelens.app).

It is in development and has no release yet. It reads, and writes nothing.

In the sidebar of a cluster, the entry "Cluster API" opens "Workload
Clusters": the Clusters of the namespaces that the namespace filter selects,
live. Each row shows the available Machines of the desired ones of its control
plane and of its workers, its version and its ClusterClass, then its state in
three columns: what the Cluster is doing and for how long, its health in the
words of the project with a mark when that health is stale, and the headline
of the message of its `Available` condition, whole in the tooltip. A click on a
row, or Enter on its name, opens the details of the Cluster: its health, the
condition it rests on and what sets its tone, its activities, its control plane
and its workers part by part, its infrastructure, its topology, its network,
and its conditions, each with its weight. The same details show in the details
that Freelens opens for a Cluster, after its metadata. A read that the cluster
refuses or that fails is said as such, with the permission it takes, never as
an empty list.

The row Tree of the details opens the tree of the Cluster, "Cluster Tree":
every object that makes the Cluster, those of its providers included, one row
each, under the object or the group that holds it, as `clusterctl describe
cluster` places them, live. Each row shows its replicas, its version, its
activities, its health with how many objects of each health it holds, and its
status; the tree opens on the objects that need a look. A click on a row, or
Enter, opens the details of its object over the tree; the keys of a tree move
through it; the search keeps the rows that match and those above them; and the
refresh in the header reads the whole tree again. A node that cannot be read
says why, with the permission it takes.

## Requirements

- Freelens >= 2.1.0
- Cluster API that serves `cluster.x-k8s.io/v1beta2`, from v1.11; the
  extension follows the release v1.14.4

## Supported APIs

### cluster.x-k8s.io

| API Version | Kind      | Scope      | Description                                               |
| ----------- | --------- | ---------- | --------------------------------------------------------- |
| v1beta2     | `Cluster` | Namespaced | The workload clusters: a page with their list and details |

The definitions are those of the release of Cluster API, which `clusterctl
init` or the Cluster API Operator installs. To try the extension, the demo
cluster of the test environment runs Cluster API with two workload clusters on
kind ([TRY-IT.md](docs/development/TRY-IT.md)), and the cluster of the
definitions holds the objects of every state that the views tell apart
(`pnpm e2e:cluster:up:definitions` and `pnpm e2e:fixtures:up all`,
[TESTING.md](docs/development/TESTING.md)).

## Permissions

The extension writes nothing: it sends no request that creates, changes or
deletes an object, and offers none of the actions of Freelens that would, such
as the removal of the selected rows. It reads through the connection of
Freelens, with the permissions of the user of the cluster, and asks for none.

These are the requests that the page of the Clusters sends, in the namespaces
that the namespace filter selects, or over the whole cluster when it selects
every namespace, and the details of a Cluster in its namespace. Each needs
`get`, `list` and `watch` on its resources in those namespaces, or over the
whole cluster:

| Read                                                                                            | Group                           | Resources                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Clusters, the rows of the page                                                              | `cluster.x-k8s.io`              | `clusters`                                                                                                                                                |
| What the status of a Cluster rests on: its Machines, its parts, its health checks and its class | `cluster.x-k8s.io`              | `machines`, `machinesets`, `machinedeployments`, `machinepools`, `machinehealthchecks`, `clusterclasses`                                                  |
| The kubeadm control plane                                                                       | `controlplane.cluster.x-k8s.io` | `kubeadmcontrolplanes`                                                                                                                                    |
| The availability of the controllers, where the Cluster API Operator installed them              | `operator.cluster.x-k8s.io`     | `coreproviders`, `bootstrapproviders`, `controlplaneproviders`, `infrastructureproviders`, `addonproviders`, `ipamproviders`, `runtimeextensionproviders` |
| The control plane and the infrastructure cluster that a Cluster names, of any provider          | the group of each provider      | the plural of each kind                                                                                                                                   |

The tree of a Cluster reads the same kinds and these, in the namespace of its
Cluster alone, whatever namespaces the filter selects, and its ClusterClass in
the namespace that the class reference of the Cluster names, each needing
`get`, `list` and `watch` there:

| Read                                                                                                                                       | Group                        | Resources                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------- |
| The bootstrap configs of the Machines and of the MachinePools, and their templates                                                         | `bootstrap.cluster.x-k8s.io` | `kubeadmconfigs`, `kubeadmconfigtemplates`          |
| The add-ons of the Cluster and what each applied to it                                                                                     | `addons.cluster.x-k8s.io`    | `clusterresourcesets`, `clusterresourcesetbindings` |
| The addresses that the objects of the Cluster claim                                                                                        | `ipam.cluster.x-k8s.io`      | `ipaddressclaims`, `ipaddresses`                    |
| The objects of the providers that the objects of the Cluster name: infrastructure machines and machine pools, templates, bootstrap configs | the group of each provider   | the plural of each kind                             |

The version of the kind of a provider comes from the contract label of its
definition. Freelens lists the definitions itself; for a user who may not list
them, the extension reads the definition of each kind that a Cluster names by
its name, which needs `get` on `customresourcedefinitions` of
`apiextensions.k8s.io`, which may be limited to those names, such as
`devclusters.infrastructure.cluster.x-k8s.io`. Without it, a reference shows as
text and says why. The tree reads the definition of each kind of a provider
that its objects name the same way, such as
`devmachines.infrastructure.cluster.x-k8s.io` and
`devmachinetemplates.infrastructure.cluster.x-k8s.io`; without it, the nodes of
that kind say why. A read refused in some namespaces leaves out what it could
not read and says so, with the message of the cluster and the permission it
takes; in the tree, the nodes of a kind that cannot be read say so, under a
node of their kind.

Freelens follows a list that it reads over the whole cluster only for a user
who may watch every resource of the core group over the whole cluster; for any
other user the page says that the list was read once and is not followed, and
a selection that leaves out a namespace is read and watched namespace by
namespace. Freelens itself reads the namespaces for its filter.

The extension never reads a Secret, never reads a Cluster at a version other
than `v1beta2`, reads no field of the spec of a KubeadmControlPlane but its
replicas, its version and the reference to the template of its Machines, and
no field of the spec of a KubeadmConfig or of its template. The list of
`kubeadmconfigs` that the tree reads returns, in clear, the join tokens and the
content of the files that the spec of each KubeadmConfig holds: the extension
types none of those fields and shows none of them.

## Install

Open Freelens and go to Extensions (`ctrl`+`shift`+`E` or
`cmd`+`shift`+`E`). The field at the top takes a package name, the URL of a
tarball, or the path to a tarball or a directory.

### From the registry

Enter `@freelensapp/capi-extension` and press Install.

Alternatively, open the following URL in the browser to install directly:

[freelens://app/extensions/install/%40freelensapp%2Fcapi-extension](freelens://app/extensions/install/%40freelensapp%2Fcapi-extension)

### From a release tarball

Each [release](https://github.com/freelensapp/freelens-capi-extension/releases)
has the extension as `freelensapp-capi-extension-<version>.tgz`, with its
checksum in `freelensapp-capi-extension-<version>.tgz.sha256`.

- Enter the URL of the `.tgz` asset and press Install. Freelens downloads the
  `.tgz.sha256` next to it and checks the tarball against it.
- Or download both files into one directory and enter the path to the `.tgz`,
  or drop the `.tgz` on the Freelens window. Freelens checks it against the
  `.tgz.sha256` next to it.

### From a directory

Build the extension (see below), then enter the path to your checkout, the
directory with `package.json`, and press Install. Freelens runs the extension
from that directory, from the files in `dist/`, and lists it as unverified.
This is how you work on the extension: see
[Development loop](#development-loop).

## Build from the source

### Prerequisites

Use [NVM](https://github.com/nvm-sh/nvm),
[mise-en-place](https://mise.jdx.dev/), or
[windows-nvm](https://github.com/coreybutler/nvm-windows) to install the
Node.js version in `.nvmrc`.

From the root of this repository:

```sh
nvm install
# or
mise install
# or
winget install CoreyButler.NVMforWindows
nvm install "$(cat .nvmrc)"
nvm use "$(cat .nvmrc)"
```

Install pnpm:

```sh
corepack install
# or
curl -fsSL https://get.pnpm.io/install.sh | sh -
# or
winget install pnpm.pnpm
```

### Build extension

```sh
pnpm install
pnpm build
```

The extension is built into `dist/`. To pack it into a tarball:

```sh
pnpm pack
```

One script to bump the prerelease version, build and pack the extension for
testing:

```sh
pnpm pack:dev
```

The tarball is placed in the current directory. Install it as described in
[From a release tarball](#from-a-release-tarball).

### Development loop

Install the extension from your checkout once, as described in
[From a directory](#from-a-directory), then run:

```sh
pnpm dev
```

It rebuilds the extension whenever a source file changes, and Freelens
reloads the extension after each rebuild, without a restart and without
packing. Stop it with `ctrl`+`C`.

Neither `pnpm build` nor `pnpm dev` type-checks; run `pnpm type:check` for
that. A change to `main` or `renderer` in `package.json` needs Freelens
restarted once.

To check the extension in Freelens with an AI agent, see "Checking the
Extension in Freelens Dev" in [AGENTS.md](AGENTS.md).

### Check the code

```sh
pnpm type:check
pnpm test:unit
pnpm lint:check
pnpm knip:check
```

and, for the formats that Biome does not cover:

```sh
pnpm trunk:check
```

### Integration tests

The integration tests drive Freelens dev, started from a
[freelensapp/freelens](https://github.com/freelensapp/freelens) checkout,
against a [kind](https://kind.sigs.k8s.io/) cluster. In the Freelens checkout:

```sh
pnpm dev
```

Freelens dev lists no cluster until a kubeconfig is added in Preferences >
Kubernetes > Kubeconfig Syncs. Add one with the kind cluster, for example:

```sh
kubectl config view --minify --flatten --context kind-kind > ~/kind-kind.kubeconfig
```

Then, with the kind cluster running, in the extension repository:

```sh
pnpm build
pnpm test:integration
```

The tests install the checkout in place, replacing any other installation of
the extension in Freelens dev. Use a kind cluster with nothing worth keeping.
Without Freelens dev or the cluster the tests are skipped. The session of the
tree writes to the cluster of the definitions through the scripts of the test
environment: an annotation, a Machine and a condition of the objects of
`healthy`, which it undoes, and a Cluster of 300 Machines in a namespace of its
own, which it deletes.

Optional variables:

- `TEST_KIND_CLUSTER_NAME`: the kind cluster, `kind` by default, used
  through the context `kind-<name>`.
- `FREELENS_CDP_URL`: the CDP endpoint of Freelens dev,
  `http://127.0.0.1:9223` by default.
- `FREELENS_MAIN_LOG`: a log of the main process to check for errors, such
  as its `lens.log`. Without it only the renderer's errors are checked.
- `TEST_RESTRICTED_KUBECONFIG_FOLDER`: a folder outside the repository that
  Kubeconfig Syncs lists, where the restricted session writes the kubeconfig
  of a second identity and deletes it at its end. Without it that session is
  skipped.
- `TEST_SCREENSHOTS_DIR`: a folder where the session of the tree and the
  restricted session take their screenshots of the themes. Without it they
  take none.
- `TEST_THEME` and `TEST_THEME_VARIANT`: the theme and the variant, `dark` or
  `light`, that the profile of Freelens dev names, which the session of the
  tree checks that Freelens applied.

The sessions that need the cluster of the real project run with
`pnpm test:integration:real-project`; one of them installs the Sveltos
extension next to this one, and uninstalls any installation of it that the
profile of Freelens dev has, leaving none. How the test environment brings
each cluster up, and what each session needs, is in
[TESTING.md](docs/development/TESTING.md).

## License

Copyright (c) 2026 Freelens Authors.

[MIT License](https://opensource.org/licenses/MIT)
