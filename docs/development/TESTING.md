# Testing

How the extension is tested, and the test environment that the tests and the
demo run on. The method is the one of the Freelens extension kit (its
`docs/testing.md` and `docs/safety.md`); the environment is specified in
[SPEC-0002](../specs/SPEC-0002-test-environment.md), and the facts of Cluster
API behind it in [SPEC-0001](../specs/SPEC-0001-reconnaissance.md).

## Layers

| Layer                   | Runs on                                                                  | Proves                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Unit                    | Vitest, with the stub of `@freelensapp/extensions` of the template       | Pure functions: the status model, the parsers, and the checks and decisions of the scripts of the test environment     |
| Integration in Freelens | The harness of the template: Freelens dev over CDP, a kind cluster       | That the extension installs and activates with no error in either process, and the views against the objects of a tier |
| With the real project   | The second tier: Cluster API at the pinned release, with its controllers | What only a controller answers: that what the extension writes is accepted and acted on, and what real objects hold    |
| Pre-review pass         | The demo cluster, before the review of a milestone                       | Every view in a dark and in a light theme, with its report (a spec of its own, in M1)                                  |
| Manual                  | The maintainer, in a real Freelens                                       | What cannot be automated, and judgment                                                                                 |

`pnpm test:unit` runs the unit tests: the files `src/**/*.test.{ts,tsx}` and
`test/**/*.test.ts`. `test/environment.test.ts` tests the scripts of the test
environment without a cluster and without the network: the pins and the
workflow that pins kind and Kubernetes, the check of a local API server and of
the node that publishes it, the local Docker, the check of a digest and the
cache of the downloads, the state folder, its lock and the kubeconfig of the
user, the environment of a command, the containers that `down` deletes and
what it decides, the command line, the limits of inotify, and what the scripts
take from the files of a release. SPEC-0002 lists its cases.
`pnpm test:integration` runs the integration tests of the template, described
in `AGENTS.md`.

## The test environment

Two tiers, each a kind cluster of its own name, with the version of kind that
the integration workflow pins and the version of Kubernetes of the pins, one
that Cluster API supports for a management cluster.

### The definitions alone

`pnpm e2e:cluster:up:definitions` creates the kind cluster
`freelens-capi-definitions` and applies the definitions that the projects
publish, taken as they are from their files:

- from the assets of the release of Cluster API, those of
  `core-components.yaml`, `bootstrap-components.yaml`,
  `control-plane-components.yaml` and
  `infrastructure-components-development.yaml`, the development provider,
  which stands for any infrastructure provider;
- those of `operator-components.yaml`, of the release of the Cluster API
  Operator;
- the `Provider` of the inventory of clusterctl, from the source of Cluster API
  at the commit of the tag, since no asset of the release carries it.

The definitions keep what the build of the release gives them: the conversion
webhook, whose Service does not exist on this cluster, and the contract labels
of the kubeadm providers (SPEC-0001 R4.108 to R4.111). Nothing runs that
reconciles, converts or admits an object, so a request at `v1beta2`, the
storage version, works, and one at another version fails (R4.115). The
command waits until every definition is `Established`. Run again, it applies
the same definitions to the same cluster.

### The real project

`pnpm e2e:cluster:up` creates the kind cluster `freelens-capi-management`,
whose node mounts the socket of Docker, and installs Cluster API with the
pinned clusterctl, as the quick start of the book does but on a cluster of one
IP family, IPv4: cert-manager, the core, the kubeadm bootstrap and control
plane providers and the development infrastructure provider, with
`ClusterTopology` on. clusterctl reads every manifest from a local repository
that the scripts write at each run from the files they checked, and downloads
nothing itself.

It then creates two workload clusters in the namespace `default`, each with one
control plane, from the templates of the release, at the version of
Kubernetes that the pins give the workload clusters:

| Workload cluster   | Template (flavor) | Workers                   | Network add-on                           | Becomes                       |
| ------------------ | ----------------- | ------------------------- | ---------------------------------------- | ----------------------------- |
| `freelens-capi-md` | `development`     | 2, in a MachineDeployment | kindnet, applied by a ClusterResourceSet | `Available` `True`            |
| `freelens-capi-mp` | `development-mp`  | 1, in a MachinePool       | none                                     | Nodes that never become ready |

kindnet is the manifest of the tests of Cluster API
(`test/e2e/data/cni/kindnet/kindnet.yaml`), with the CIDRs of their
configuration for the development provider. The ClusterResourceSet applies it
once to every Cluster of the namespace labelled `cni: kindnet`, which the
scripts set on `freelens-capi-md`. The second workload cluster has no network
add-on on purpose: it holds the MachinePool case of SPEC-0001, H1.

The command waits until `freelens-capi-md` reports `Available` `True`, saying
how far it is once a minute, and gives up after twenty minutes. A request that
fails meanwhile is tried again until then; a target that the checks refuse
stops the wait at once. Run again, it resumes: it uses the kind cluster that
it created, installs only the providers missing from the inventory of
clusterctl, creates only the workload clusters that do not exist, and waits
again.

### Commands

| Command                           | What it does                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm e2e:cluster:up`             | The real project, as above. Run again, it resumes                                                                         |
| `pnpm e2e:cluster:up:definitions` | The definitions alone, as above                                                                                           |
| `pnpm e2e:cluster:down`           | Deletes the kind clusters that the scripts created and the containers of their workload clusters, and checks what is left |
| `pnpm e2e:pins:check`             | Downloads every pinned file from its source and checks it against its pin, with no cluster and no Docker                  |
| `pnpm demo:up`                    | `pnpm e2e:cluster:up`, then says how to open the cluster in Freelens ([TRY-IT.md](TRY-IT.md))                             |
| `pnpm demo:down`                  | `pnpm e2e:cluster:down`                                                                                                   |

The two tiers have different names and can be up at the same time. The demo
is the cluster of the real project.

The scripts are `e2e/scripts/*.mts`, run by Node as they are.
`environment.mts` is the entry that the scripts of `package.json` run, and
`commands.mts` has the commands; the others are what the commands use, and
what the unit tests check: `pins.mts` reads the pins, `checks.mts` has the
checks, `downloads.mts` the pinned files and their cache, `state.mts` the state
folder, its lock and the kubeconfig of the user, `host.mts` what the scripts
need of the system and give the commands they run, and `manifests.mts` what
they give kind, kubectl and clusterctl.

## The pins

`e2e/environment/pins.json` holds the version of every project that the
scripts download from, and the SHA-256 of every file:

- Cluster API: the release, the commit of its tag, the version of Kubernetes
  of the workload clusters, the components of the four providers, the
  templates and the ClusterClass of the development provider, `metadata.yaml`,
  clusterctl for Linux and macOS on amd64 and arm64, and the two files of the
  source at the commit, the `Provider` definition and the kindnet manifest;
- the Kubernetes of the kind clusters, `managementKubernetes`: the tag of
  `kindest/node`, and the minor versions that the release of Cluster API
  supports for a management cluster, which it declares in `supported`;
- the Cluster API Operator: the release and `operator-components.yaml`;
- cert-manager: the version that the pinned clusterctl installs by default,
  and `cert-manager.yaml`.

The version of kind is the `kind_version` of the env of
`.github/workflows/integration-tests.yaml`, which the scripts read from there:
it is pinned once, for the integration tests of the template and for the
environment. The versions of Kubernetes are pinned apart from the template,
each one within what the release of Cluster API supports in the table of
versions of its book (`docs/book/src/reference/versions.md` at the tag): the
two kind clusters, which stand for management clusters, take the version of
`managementKubernetes`, from `v1.33` to `v1.37` for `v1.14.4`, and the
workload clusters the version of the pins for them, one that the release
supports for workload clusters. So the `kubernetes_version` of the workflow,
which Renovate moves for the template, does not take the environment past what
Cluster API supports. The scripts refuse a version of `managementKubernetes`
outside the range that it declares, and a unit test checks that the rule of
Renovate allows the same range.

The scripts refuse a pins file with a missing, unknown or malformed entry, and
check every file against its digest before they use it: when they download it,
and every time they read it from their cache. clusterctl reports the release
and the commit it was built from, and the scripts check both against the pins.

Renovate follows the versions of Cluster API and of the operator, and the tag
of `kindest/node` of the kind clusters within its range (a custom manager in
`.renovaterc.json` reads the `datasource`, `depName` and `version` of each
object, which follow each other in this order, and a rule allows only the
minor versions of the range), and the version of kind through the comment of
the workflow. A pull request of Renovate that changes the version of a release
leaves the digests of the old release, and the workflow `e2e-pins-check.yaml`,
which runs `pnpm e2e:pins:check` on every change to the pins or to the
scripts, fails until the new ones are recorded in the same pull request. The
digests come from the records of GitHub, the commit from the tag:

```sh
# The digest of every asset of a release, as the pins write it.
gh release view <tag> --repo kubernetes-sigs/cluster-api --json assets \
  --jq '.assets[] | [.name, (.digest | ltrimstr("sha256:"))] | @tsv'
gh release view <tag> --repo kubernetes-sigs/cluster-api-operator --json assets \
  --jq '.assets[] | select(.name == "operator-components.yaml") | .digest | ltrimstr("sha256:")'
gh release view <tag> --repo cert-manager/cert-manager --json assets \
  --jq '.assets[] | select(.name == "cert-manager.yaml") | .digest | ltrimstr("sha256:")'
# The commit of a tag, also of an annotated one.
gh api repos/kubernetes-sigs/cluster-api/commits/<tag> --jq .sha
# The digest of a file of the source at that commit.
curl -fsSL https://raw.githubusercontent.com/kubernetes-sigs/cluster-api/<commit>/<path> | shasum -a 256
```

`pnpm e2e:pins:check` then reports every file that does not match, with the
digest it found. cert-manager and the Kubernetes of the workload clusters have
no Renovate entry: they change with Cluster API, to the version of cert-manager
that the new clusterctl installs by default, which clusterctl looks for in the
folder of that version and does not find while the pins name another, and to a
version of Kubernetes that the new release supports for workload clusters. The
range of `managementKubernetes`, in the pins and in the rule of Renovate,
changes with Cluster API too.

## Safety

The scripts follow the rules of the kit for development and tests, and those
of SPEC-0002:

- **A private state folder.** `$XDG_STATE_HOME/freelens-capi-extension`, or
  `~/.local/state/freelens-capi-extension`, readable by the user alone, refused
  when it is a symbolic link or inside the repository. It holds, for each kind
  cluster, a kubeconfig and the record of its node, and the cache of the
  downloads, the local repository and configuration of clusterctl and the cache
  of kubectl. One run at a time uses it, under a lock; a lock left by a run
  that was killed is taken over.
- **Names global to the Docker daemon.** The names of the kind clusters,
  `freelens-capi-definitions` and `freelens-capi-management`, and of the
  workload clusters, `freelens-capi-md` and `freelens-capi-mp`, are those of
  containers and labels of the Docker daemon, which every user and every state
  folder on it shares. When the scripts create a kind cluster, they record the
  ID of its node container in the state folder; they use a kind cluster again
  only when the state folder has its kubeconfig and that record, and refuse one
  of the same name that they did not create from it.
- **A kubeconfig of their own, one context.** kind writes it there, and no
  command of the scripts reads another: every command they run gets that
  kubeconfig, or one that does not exist, no kuberc, and nothing else of the
  environment of the user but what finds the tools and the local Docker.
  clusterctl gets a home and a configuration folder of the scripts, and their
  configuration file. Before every request the scripts check the kubeconfig:
  one context, which is current; one cluster, over HTTPS, on a loopback address
  with a port, verified with the authority that kind generated and through no
  proxy; one user, the client certificate of kind. Then the node: the container
  that they recorded, named and labelled as kind does, running, and publishing
  the API server on that address and port. They refuse anything else.
- **The kubeconfig of the user is never written.** The scripts never point a
  command at it. They fingerprint it before and after each run, failed or not,
  and report a change, which only another program can have made.
- **The local Docker.** Every command that uses Docker, `down` and `demo`
  included, first refuses a Docker reached other than through a Unix socket,
  by `DOCKER_HOST` or by the current context, and one that does not run Linux
  containers.
- **Official files, pinned.** Cluster API comes from the assets of its release
  and the source at the commit of its tag, checked by digest. Nothing of it is
  copied into the repository, patched or rebuilt.
- **`down` deletes what `up` created, and nothing else.** It deletes a kind
  cluster of the scripts only when its node is the container that the state
  folder recorded, the cluster of the real project first, so that no
  controller creates a node of a workload cluster again; a cluster of the same
  name made by anyone else is left in place. Then the containers of the
  workload clusters, with their volumes, only when the state folder records
  the cluster of the real project that created them. The development provider
  gives each of them the labels of kind, `io.x-k8s.kind.cluster` with the name
  of the workload cluster, which is why kind lists the workload clusters too,
  and `io.x-k8s.kind.role`, `control-plane`, `worker` or
  `external-load-balancer`; and it names each one after the workload cluster,
  `<cluster>-lb` for the load balancer and `<cluster>-<machine>` for a node,
  never as kind names the nodes of a kind cluster. `down` finds them by the
  first label; when one of them is not so named or has another role, it leaves
  every container of that workload cluster in place, and fails. When the kind
  clusters cannot be listed, it deletes nothing. It tries every step, checks
  what is left, and fails, saying which step failed, when one did; it then
  keeps the state, for the next run to try again.
- **The limits of inotify, on Linux.** The nodes of the workload clusters need
  more instances of inotify than some systems give: with too few, their
  containers exit with code 255 as they start, and the health check of the
  ClusterClass replaces them again and again. `up` raises them to the values
  of the troubleshooting page of the book of Cluster API,
  `fs.inotify.max_user_instances` to 8192 and `fs.inotify.max_user_watches` to
  1048576, when they are lower, with `sudo -n sysctl`, or says that it could
  not and that the workload clusters may fail.

What the scripts cannot see:

- **The workload clusters are published on the network.** kind publishes the
  API server of its node on the loopback address alone, and the development
  provider does the same for the control plane Machines of the workload
  clusters, but it publishes the load balancer of each workload cluster on
  every address of the machine, with ports that Docker picks: the API server,
  and the statistics of HAProxy. The API servers ask for the client
  certificates of their clusters, which only the management cluster holds;
  keep the demo down on a network you do not trust.
- **The socket that the provider uses.** The scripts check that the node of
  the management cluster mounts `/var/run/docker.sock`, by the place where it
  is mounted, not by the daemon behind it. Where two daemons run on one
  machine, such as a rootless one beside the rootful one, the development
  provider creates the workload clusters on the daemon of that path on the
  host of the node, which may not be the one the scripts inspect; then `down`
  finds none of its containers and reports nothing left. On Docker Desktop for
  Linux, the limits of inotify that matter are those of its virtual machine,
  not of the host the scripts raise them on.
- **The images.** The node image of the kind clusters is `kindest/node` at the
  version of `managementKubernetes`, and the development provider takes the
  image of the nodes of the workload clusters by their version of Kubernetes,
  both by tag, as the integration workflow does. The images that the manifests of the releases name, of the
  controllers, of cert-manager, of kindnet and of the load balancer, are
  pulled by the tags the manifests give them. The digests pin the manifests,
  which name the images.

`down` leaves in the state folder the cache of the downloads, which the next
run checks before using it, the local repository and configuration of
clusterctl, which every run writes again, and the cache of kubectl; in the
cache of Docker, the images it pulled for the nodes and the load balancers;
and the `kind` network of Docker, which kind shares between all its clusters.
Removing the state folder removes what it holds.
