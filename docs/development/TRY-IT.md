# Try it

The demo of the extension is the cluster of the real project of the test
environment ([TESTING.md](TESTING.md)): a kind cluster where Cluster API runs at
the release the extension follows, with two workload clusters of its
development provider. Everything in it is local and synthetic, and goes away
with one command.

This first part brings the demo up and down. How to walk through the views on
it comes with the views.

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

## Take it down

```sh
pnpm demo:down
```

It deletes the kind cluster of the demo and the containers of its workload
clusters, and the cluster of the definitions too when it is up, and says so
when something could not be deleted. A kind cluster of the same name that the
scripts did not create from their state folder is left in place. It leaves
the downloads in the private state, for the next run.
