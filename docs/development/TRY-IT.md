# Try it

The demo of the extension is the cluster of the real project of the test
environment ([TESTING.md](TESTING.md)): a kind cluster where Cluster API runs at
the release the extension follows, with two workload clusters of its
development provider. Everything in it is local and synthetic, and goes away
with one command.

This page brings the demo up, installs the extension, walks through its views
on the demo, and takes it down. Each view adds its walk here; the pass that
precedes the review of a milestone comes with its own spec, SPEC-0007.

## What the machine needs

- Linux or macOS, on amd64 or arm64.
- Docker, local, running Linux containers, reached through its Unix socket,
  with the socket at `/var/run/docker.sock` on the host of the containers, as
  Docker Engine and Docker Desktop have it: the node of the management cluster
  mounts it, and the development provider creates the workload clusters
  through it. 4 processors and 8 GiB of memory for Docker; the scripts say
  when it has less.
- kind at the version of `kind_version` in
  `.github/workflows/integration-tests.yaml`: the scripts refuse another.
  kubectl within one minor version of the Kubernetes of the kind clusters,
  `managementKubernetes` in `e2e/environment/pins.json`.
- Node.js of `.nvmrc`, with corepack for pnpm.
- Access to GitHub, for the files of the releases, which the scripts download
  once and check against `e2e/environment/pins.json`, and to the registries of
  the images that the manifests of the releases name: `registry.k8s.io`,
  `gcr.io`, `quay.io` and Docker Hub.
- On Linux, `fs.inotify.max_user_instances` of at least 8192 and
  `fs.inotify.max_user_watches` of at least 1048576, the values of the
  troubleshooting page of the book of Cluster API. `pnpm demo:up` raises them
  with `sudo -n sysctl` when they are lower, until the next restart, or says
  that it could not. To keep them, put them in a file of `/etc/sysctl.d/`. On
  Docker Desktop for Linux, they are the limits of its virtual machine.

## Bring the demo up

```sh
pnpm install
pnpm demo:up
```

The first run takes a few minutes: it downloads the files of the releases,
creates the kind cluster `freelens-capi-management`, installs cert-manager and
Cluster API, whose images it pulls, and creates the two workload clusters. It
ends when the first one reports `Available` `True`, with the list of the
Clusters and the path of the kubeconfig of the demo, in the private state of
the scripts (`~/.local/state/freelens-capi-extension`, or the same folder
under `$XDG_STATE_HOME`):

```text
~/.local/state/freelens-capi-extension/freelens-capi-management/kubeconfig
```

Run again, it resumes where it stopped, and changes nothing that is already
there.

| Namespace                                                                                          | What is in it                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cert-manager`                                                                                     | cert-manager, which the webhooks of Cluster API need                                                                                                                                                                                               |
| `capi-system`, `capi-kubeadm-bootstrap-system`, `capi-kubeadm-control-plane-system`, `capd-system` | The controller of the core, of the kubeadm bootstrap and control plane providers and of the development provider, each with its `Provider` in the inventory of clusterctl                                                                          |
| `default`                                                                                          | The ClusterClass `quick-start` and its templates; `freelens-capi-md`, `Available`, with a MachineDeployment of two workers and kindnet; `freelens-capi-mp`, with a MachinePool of one worker and no network add-on, whose Nodes never become ready |

To open it in Freelens, add the kubeconfig above in Kubeconfig Syncs of the
Kubernetes preferences, then open `kind-freelens-capi-management` from the
catalog. The kubeconfig holds this cluster alone.

The development provider publishes the load balancer of each workload cluster
on every address of the machine: its API server, and the statistics of
HAProxy. The API servers ask for client certificates, which only the
management cluster holds, but keep the demo down on a network you do not
trust.

## Install the extension

The extension has no release yet: install it from this checkout, as
"From a directory" in the [README](../../README.md) says.

```sh
pnpm build
```

On the Extensions page of Freelens, enter the path of the checkout, the
directory with `package.json`, press Install, and confirm that it loads in
place. The table lists it as enabled. Then open `kind-freelens-capi-management`
from the catalog, as above.

## Walk through the Clusters

The view of the Clusters ([SPEC-0004](../specs/SPEC-0004-clusters.md)) reads
and writes nothing; what each part shows is in
[DESIGN.md](DESIGN.md).

1. **The page.** In the sidebar of the cluster, "Cluster API", then "Workload
   Clusters". Select `default` in the namespace filter: the page lists
   `freelens-capi-md` and `freelens-capi-mp`. Look at:
   - the counters of the control plane and of the workers, the available
     Machines of the desired, every counter in the tooltip;
   - the version and the ClusterClass, `quick-start`;
   - the activities, Idle once a Cluster has settled, each one in flight with
     its duration while it is provisioning;
   - the health: `freelens-capi-md` Healthy; `freelens-capi-mp` Degraded,
     while the project writes its `Available` as `True`: its MachinePool has no
     network add-on, so its Nodes never become ready;
   - the status, the headline of the message of `Available`, whole in the
     tooltip;
   - the row has no checkbox and no menu, a right click opens nothing, and
     the search finds a Cluster by its name, a label as `key=value`, its health
     or its version.
2. **The details.** A click on a row, or Enter on a name that Tab reaches,
   opens the details of the extension, "Cluster: `<name>`". Look at the
   health, the condition it rests on and what sets its tone; the activities
   with their start; the summary, with its message nested; the issues of
   `freelens-capi-mp`, `ControlPlaneMachinesReady` among them; the control
   plane and the workers part by part, each with its own health; the
   infrastructure, whose DevCluster is a link to the details of Freelens at
   the version of its contract, over those of the extension, while the control
   plane, each part, the ClusterClass and the names of the objects of Cluster
   API in the lines of a message open the tree of the Cluster at their object,
   with its details; the topology, the network and the conditions, each with
   its weight. Escape, the close icon, or a click outside closes them.
3. **The details of Freelens.** Freelens keeps its own list and details of the
   Clusters, which open from the definition `clusters.cluster.x-k8s.io`, under
   "Custom Resources", "Definitions", or from the command palette. In its
   details of a Cluster, the panel of the extension follows the metadata of
   Freelens, before its own section of the resource and the events, with the
   same content.
4. **The same Clusters from the tool of the project.** The clusterctl of the
   release is in the cache of the scripts, which checked it against its pin,
   named for the system and the architecture of the machine,
   `clusterctl-linux-amd64` below, `clusterctl-darwin-arm64` on macOS on
   arm64:

   ```sh
   state=~/.local/state/freelens-capi-extension
   CLUSTERCTL_DISABLE_VERSIONCHECK=true \
     "$state"/downloads/cluster-api/v1.14.4/clusterctl-linux-amd64 describe cluster freelens-capi-md \
     --kubeconfig "$state"/freelens-capi-management/kubeconfig
   ```

   `CLUSTERCTL_DISABLE_VERSIONCHECK=true` keeps clusterctl from asking GitHub
   for a newer release and from writing the state of that check in your home,
   as the scripts do.

   It gives the status and the reason of `Available` that the details give,
   and counters that add up to those of the control plane and of the workers.
5. **Every state.** The demo holds two Clusters. The cluster of the
   definitions holds one for each state that the view tells apart,
   provisioning, rolling out, scaling, paused, deleting, upgrading, with
   MachinePools, under remediation, with no status and more, each in a
   namespace of its own ([TESTING.md](TESTING.md), "The fixtures"):

   ```sh
   pnpm e2e:cluster:up:definitions
   pnpm e2e:fixtures:up all
   ```

   Add its kubeconfig,
   `~/.local/state/freelens-capi-extension/freelens-capi-definitions/kubeconfig`,
   in Kubeconfig Syncs, open `kind-freelens-capi-definitions`, and select the
   namespaces of the states in the filter. Their times move to the moment of
   the apply, so the marks of the states in flight hold for a while after it.

## Walk through the tree of a Cluster

The tree of a Cluster ([SPEC-0005](../specs/SPEC-0005-cluster-tree.md)) reads
and writes nothing; what each part shows is in [DESIGN.md](DESIGN.md).

1. **The way in.** Open the details of `freelens-capi-md` and press "Open the
   tree of this Cluster" in their row Tree: the page "Cluster Tree:
   freelens-capi-md, default". The control plane, the parts of the workers and
   the ClusterClass of the details, and the names of the objects of Cluster API
   in the lines of a message, open the same tree at their object, with its
   details; so do the same buttons in the panel of the details of Freelens.
2. **The rows.** The Cluster, then what it names and holds: its DevCluster, its
   KubeadmControlPlane with its Machines, each with its DevMachine and its
   KubeadmConfig, and its templates; Workers, with the MachineDeployment, its
   MachineSets and their Machines; the ClusterClass; Add-ons, with the
   ClusterResourceSet of kindnet and what its binding records it applied; and
   Health checks. Each row shows its replicas, its version, its activities, its
   health and the counts of the objects that it holds, by health, and its
   status, each whole in its tooltip. The tree opens with the Cluster expanded
   and every node expanded under which, or at which, an object needs a look:
   its health Unhealthy, Degraded or Unknown; an activity other than Idle and
   Paused, or Paused by its own annotation; a mark of freshness other than
   Paused; or it could not be read or was not found. What is all Healthy and
   Idle stays collapsed, with its counts.
3. **The details and the keys.** A click on a row, or Enter, opens the details
   of its object over the tree: where it sits and why, its status, its facts,
   and, for a DevMachine, a link to the details of Freelens. Tab reaches the
   tree; Down and Up, Right and Left, Home, End, Page Up and Page Down move
   through it and expand or collapse; Escape closes the details, with the row
   of their object in view.
4. **The search and the refresh.** The search keeps the rows whose words hold
   the words searched, with those above them, and says how many nodes match;
   cleared, the tree is as it was. The refresh in the header reads the tree
   again.
5. **The same tree from the tool of the project.** With the clusterctl of the
   walk of the Clusters, and the flags that show every object on a row of its
   own:

   ```sh
   state=~/.local/state/freelens-capi-extension
   CLUSTERCTL_DISABLE_VERSIONCHECK=true \
     "$state"/downloads/cluster-api/v1.14.4/clusterctl-linux-amd64 describe cluster freelens-capi-md \
     --show-machinesets --show-templates --show-resourcesets --echo --grouping=false \
     --kubeconfig "$state"/freelens-capi-management/kubeconfig
   ```

   Every row of an object that it prints is a row of the tree, under the same
   object; the tree adds what the tool leaves out, the ClusterClass, the
   MachineHealthChecks, the binding and the resources of the ClusterResourceSet.
6. **Every state.** On the cluster of the definitions, the tree of the Cluster
   of each state shows what that state holds: the objects not found of
   `deleting`, the Paused of `paused`, the remediation of `remediation`, and,
   in `no-status`, an IPAddressClaim of the Cluster and its address under Other
   objects.

## Take it down

```sh
pnpm demo:down
```

It deletes the kind cluster of the demo and the containers of its workload
clusters, those that a capture of the fixtures left included, and the cluster
of the definitions too when it is up, and says so when something could not be
deleted. A kind cluster of the same name that the
scripts did not create from their state folder is left in place. It leaves
the downloads in the private state, for the next run.
