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
workflow that pins kind, the check of a local API server and of the node that
publishes it, the local Docker, the check of a digest and the cache of the
downloads, the state folder, its lock and the kubeconfig of the user, the
environment of a command, the containers that `down` deletes and what it
decides, the providers of the real project against the pins, the command line,
the limits of inotify, what the scripts take from the files of a release, the
fixtures: the shift of their times, the cleaning of a captured object, their
apply, their YAML, their states and the sets of the repository, and the objects
of the trial of S7 ("Tests of the real tier"). SPEC-0002 lists its cases, and
SPEC-0003 those of the trial of S7 ("Tests", "With the real project: S7"). The
status model is read on the fixtures by `src/common/status/fixtures.test.ts`
(SPEC-0003, "Tests"). `pnpm test:integration` runs the integration tests,
described in `AGENTS.md`: the session of the template, which installs the
extension, the session of the fixtures, the sessions of the Clusters of
SPEC-0004, that of the fixtures of every state and the restricted one, which
opens the page as a second identity, and the session of the tree of a Cluster
of SPEC-0005, on the fixtures of every state and on a large Cluster that it
makes, with the cases of the tree in the restricted session ("Continuous
integration", "Safety"). What the sessions of the tree read and decide, and
the expectations that they read, are tested with no app by
`test/tree-outline.test.ts`, `test/tree-checks.test.ts` and
`test/tree-expectations.test.ts`, the large Cluster by
`test/large-cluster.test.ts`, the second identity by
`test/restricted-access.test.ts`, and what the sessions of the real tier
compare by `test/real-project-checks.test.ts`. `pnpm test:real-project` runs
the tests of the real tier, and `pnpm test:integration:real-project` the
sessions of the real tier in Freelens dev ("Tests of the real tier").

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

| Command                                | What it does                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm e2e:cluster:up`                  | The real project, as above. Run again, it resumes                                                                         |
| `pnpm e2e:cluster:up:definitions`      | The definitions alone, as above                                                                                           |
| `pnpm e2e:cluster:down`                | Deletes the kind clusters that the scripts created and the containers of their workload clusters, and checks what is left |
| `pnpm e2e:pins:check`                  | Downloads every pinned file from its source and checks it against its pin, with no cluster and no Docker                  |
| `pnpm demo:up`                         | `pnpm e2e:cluster:up`, then says how to open the cluster in Freelens ([TRY-IT.md](TRY-IT.md))                             |
| `pnpm demo:down`                       | `pnpm e2e:cluster:down`                                                                                                   |
| `pnpm e2e:fixtures:capture <state>...` | Captures the fixtures of each state named, or of every state with `all`, from the real project ("The fixtures")           |
| `pnpm e2e:fixtures:up <state>...`      | Applies the fixtures of each state named, or of every state with `all`, to the cluster of the definitions                 |
| `pnpm e2e:fixtures:down [<state>...]`  | Removes them from it, those of every state when it is given none                                                          |
| `pnpm e2e:fixtures:check [<state>...]` | Applies the fixtures of each state, reads them back and compares them with their files, then removes them                 |

The two tiers have different names and can be up at the same time. The demo
is the cluster of the real project.

The scripts are `e2e/scripts/*.mts`, run by Node as they are.
`environment.mts` is the entry that the scripts of `package.json` run, and
`commands.mts` has the commands; the others are what the commands use, and
what the unit tests check: `pins.mts` reads the pins, `checks.mts` has the
checks, `downloads.mts` the pinned files and their cache, `state.mts` the state
folder, its lock and the kubeconfig of the user, `host.mts` what the scripts
need of the system and give the commands they run, `manifests.mts` what they
give kind, kubectl and clusterctl, `states.mts` the states of the fixtures and
how each one is captured, `fixtures.mts` what a capture and an apply do to an
object, and `yaml.mts` the YAML of the fixtures.

## The fixtures

The first tier has no object of its own: the fixtures give it the objects of
Cluster API in the states that the views tell apart, as the real project wrote
them. Each state is a folder of `integration/fixtures/`, with a `README.md` that
says how the state was reached and a YAML file for each kind of its objects,
which live in a namespace of their own, named as the workload cluster of the
state, so that the fixtures of every state can be on the first tier at once.

| State                           | Namespace                             | How the real project was brought into it                                                                                                              |
| ------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisioning`                  | `freelens-capi-provisioning`          | A Cluster with a managed topology, its control plane held before kubeadm by a command that the scripts give its template                              |
| `healthy`                       | `freelens-capi-healthy`               | A Cluster with a managed topology, two workers and kindnet, once every condition is at its normal value and every Machine is checked healthy          |
| `machine-without-node`          | `freelens-capi-without-node`          | A MachineSet beside the topology, whose Node registers with a provider ID that is not the one of its Machine                                          |
| `rolling-out`                   | `freelens-capi-rolling-out`           | `clusterctl alpha rollout restart` of the MachineDeployment, while a new Machine starts                                                               |
| `scaling-up`                    | `freelens-capi-scaling-up`            | The topology asks for three control plane Machines and a second worker, while they start                                                              |
| `scaling-up-held`               | `freelens-capi-scaling-up-held`       | The MachineDeployment scaled by its own replicas while the control plane upgrades, which the preflight checks of the MachineSet hold                  |
| `scaling-down`                  | `freelens-capi-scaling-down`          | The topology asks for one worker of two, while a pre-drain hook of the scripts holds the deletion of the other                                        |
| `paused`                        | `freelens-capi-paused`                | `spec.paused` of the Cluster                                                                                                                          |
| `deleting`                      | `freelens-capi-deleting`              | The Cluster deleted, while a pre-terminate hook of the scripts holds a worker                                                                         |
| `upgrading`                     | `freelens-capi-upgrading`             | The version of the topology moved from `workloadKubernetesUpgradeFrom` of the pins to `workloadKubernetesVersion`, while the control plane rolls out  |
| `without-topology`              | `freelens-capi-without-topology`      | A Cluster that names its parts, written by the scripts from the schemas, once every condition is at its normal value                                  |
| `machine-pools`                 | `freelens-capi-machine-pools`         | A Cluster whose only workers are a MachinePool, with no network add-on                                                                                |
| `machine-pool-without-machines` | `freelens-capi-pool-without-machines` | Written by hand, from SPEC-0001 R2.66 to R2.69: a MachinePool whose provider keeps no Machines, which the development provider cannot show            |
| `remediation`                   | `freelens-capi-remediation`           | Both workers marked for remediation with `maxInFlight` 1: one remediated, its deletion held by a hook of the scripts, the other deferred              |
| `no-status`                     | `freelens-capi-no-status`             | One or two objects of each kind but the Docker kinds, as a user writes them, in a server-side dry run of their creation, the claim naming its Cluster |

The files are YAML as kubectl writes it, with the keys in order and the
sequences unindented under their key, quotes only where a value needs them, as
the rule `quoted-strings` of `.yamllint.yaml` asks, and in the format that
yamlfmt keeps with `integration/fixtures/.yamlfmt.yaml`: a long value, and one
that starts as a document marker, which yamlfmt would quote and yamllint would
find quoted for nothing, in a literal block, and a text that a literal block
cannot hold, such as a line that starts with a tab, in double quotes.
`trunk check` passes on them as they are written.
`e2e/scripts/yaml.mts` writes them and reads them, with no dependency, and so
can the tests of the views and of the status model.

A captured object is what the real project wrote, with these changes, which
the README of each set repeats:

- Every time is its offset from the moment of the capture, written from
  `2026-01-01T00:00:00Z`, `CAPTURE_TIME` of `e2e/scripts/fixtures.mts`: that is
  the moment of the capture, the `now` of a test that reads the files. Every
  string that is a time moves, in a status, a spec or an annotation; a capture
  refuses an object with a time inside a text, which no shift would reach.
- Every generation is its distance from the generations that the status of its
  object observed: the lowest generation that the first tier can give the
  object, 1, or 2 for a deleting one, whose deletion the API server counts as a
  change, raised by that distance, and every observed generation moved with it.
  A generation of 1 is not written, as the API server writes it on creation.
- What the API server adds is left out: the identifier of the object and those
  of its owners, its version, its managed fields, the grace period of its
  deletion.
- What SPEC-0001 A3 forbids showing is left out of KubeadmConfig,
  KubeadmControlPlane and their templates: the content of a file, a password,
  the bootstrap tokens of an initialization, the token of a discovery and the
  credentials of a discovery by a kubeconfig file. Each of them is optional in
  the schema, an entry of the bootstrap tokens apart, which goes whole. The
  Secrets and the ConfigMaps of a namespace are not read.
- What the machine that ran the capture tells of itself is not kept. Every
  Node of the development provider is a container of that machine, so the
  version of the kernel and the identifier of the boot in the `nodeInfo` of
  each Machine are those of the machine, which a fixture replaces with
  `6.12.0-test-environment` and `00000000-0000-4000-8000-000000000000`, and its
  swap is left out. The identifiers of the machine and of the system there are
  those that kind makes for each container, and are kept, and so is the
  architecture, which names only a family of processors. The development
  provider writes the processors and the memory of the machine into
  `status.capacity` of every DevMachineTemplate, and of every
  DockerMachineTemplate, which a fixture replaces with `cpu: "4"` and
  `memory: 8Gi`, `HOST_CAPACITY` of `e2e/scripts/fixtures.mts`, the same for
  every template.
- Nothing else is renamed: the names are those of the workload clusters of the
  captures, and the addresses those of the network of Docker that ran them.

### Capturing them again

`pnpm e2e:fixtures:capture <state>...` brings the real project into each state
named, or into every captured state with `all`, and writes its set; the real
project must be up (`pnpm e2e:cluster:up`). Each capture makes a workload
cluster of its own in the namespace of its state, from a template of the release
or from objects of the scripts, brings it into its state by what a user or the
project itself does, takes the objects of the namespace once they hold the state
and two readings of them agree, and deletes the cluster; three captures run at a
time. Like `up`, a capture raises the limits of inotify, and refuses a real
project without the providers of the pins or with one at another release, whose
controllers would write the sets under the name of the pins. A capture checks
what it writes, every object in the namespace of its state, every owner in the
set, no time inside a text, a generation that the first tier can give each
object, and files that read back as the objects, writes them with the modes of
a checkout, and leaves the set of a capture that fails as it was. A new capture
is a new moment of the real project, with new names: review the diff of the
sets before committing it.

A workload cluster is healthy, for `healthy` and for the states that start from
it, when its Cluster reports `Available` `True`, every Machine has a Node,
every condition is at its normal value, `True` for a positive one and `False`
for a negative one, and every MachineHealthCheck counts the Machines that its
selector targets, found from the selector as its controller finds them, and
reports them all healthy, each with `HealthCheckSucceeded` `True`. A
MachineHealthCheck that has not counted them yet does not pass, and `paused`
keeps their count as healthy too.

Two states last a few seconds on a machine that has the images at hand, too few
for two readings to agree, and the scripts make them last. The control plane of
`provisioning` runs `sleep 150` before kubeadm, a command that they give the
KubeadmControlPlaneTemplate of its ClusterClass. The Machine of
`machine-without-node` never gets a Node: the bootstrap template of its
MachineSet gives kubelet a provider ID of its own, and the development provider
sets the provider ID of a Node only when it has none. Their sets show both.

`machine-pool-without-machines` is written by hand. It starts from the set of
`machine-pools`, in a namespace of its own and with the names of its own
Cluster, without the Machines of the pool and what they own, and gives the
MachinePool and its infrastructure pool the status that R2.66 to R2.69 say a
provider that keeps no Machines leaves them. A new capture of `machine-pools`
does not change it.

### On the first tier

`pnpm e2e:fixtures:up <state>...`, or `all`, applies the sets to the cluster of
the definitions, each one in place of what its namespace held: the objects
first, each owner before the objects it owns, which take its identifier; then
the changes to a spec that give an object the generation of its file, one field
set and unset, `spec.paused` of a Cluster, `spec.minReadySeconds` of a Machine
or `spec.backend.docker.bootstrapTimeout` of a DevMachine, the kinds that need
them; then the status of each object, through the status subresource; then the
deletion of each deleting object. Every time moves from `CAPTURE_TIME` to the
moment of the run. The finalizers of the project hold a deleting object there,
since no controller removes them, and so does the finalizer of the scripts,
`test-environment.freelens.app/fixture`, which they add to it. Two times are the
API server's: the creation of every object, at the moment of the run, and the
deletion of a deleting one, at the moment the scripts delete it.

`pnpm e2e:fixtures:down`, with states or for every state, removes every
finalizer of the objects of each set, the one of the scripts and those of the
project, then deletes its namespace. `pnpm e2e:cluster:down` deletes the whole
cluster, the fixtures with it.

`pnpm e2e:fixtures:check`, with states or for every state, is the round trip:
it applies each set, reads every object back at the version of its file,
cleans it as a capture does, compares it with its file, field by field, the
two times of the API server apart, and removes the set. The API server applies
the schema of each definition to every object and to its status, its CEL rules
included, so a fixture that does not pass it fails there; no schema is changed.

### The large Cluster of the session of the tree

The session of the tree of a Cluster tries the tree on a Cluster of 300
Machines (SPEC-0005, P16, P22), which is no state of the fixtures: no capture
can make 300 Machines on a runner, and the set is 2.8 MB of files. The session
makes it at run time, in its last step, from the objects of `healthy`, read from
their files, with `largeCluster` of `integration/__tests__/large-cluster.ts`:
the Cluster of `healthy` with its objects in the namespace
`freelens-capi-tree-large`, the namespace of no state, its two workers replaced
by 300 copies of the first, each with its infrastructure machine and its
bootstrap config, named apart in the order of their numbers and owned by its
own objects, and the counters of its MachineDeployment, of its MachineSet, of
its topology and of its workers, and the targets of its check of the workers,
counting the copies: 922 objects. It applies them as `pnpm e2e:fixtures:up`
applies a state, with `applyObjects` of `e2e/scripts/commands.mts`, and removes
them as `pnpm e2e:fixtures:down` removes one, with `removeObjects`, both through
the session that `openDefinitions` gives, with the target checked before every
request, and both refusing, before any request, a namespace that is not one of
the scripts, that is the namespace of a state, or that is the namespace of the
second identity of the restricted session. The step that applies it has
180 s and the hook that deletes it 240 s, three times what a local kind cluster
took; the session logs both times, and the time of its step, which the first
run in CI measured at 46.5 s, 85.4 s and 6.0 s. Vitest fails such a hook once it
returns past its limit, and cannot cut one that hangs, since the hooks run
kubectl synchronously: the timeouts of the scripts bound each of their requests
instead, two minutes, and six for the deletion of the namespace. It deletes the
namespace at its end, also when a step failed, as it deletes first one that a
run that was killed left, and checks that it is gone.

## Tests of the real tier

What only a controller answers is tried on the real project by the tests of
the real tier: `pnpm test:real-project` runs the files
`test/real-project/**/*.tests.ts`, one at a time, with
`vitest.real-project.config.ts`. The job of the real project of
`test-environment.yaml` runs it once the real project is up, before it takes the
environment down, and nothing else runs it: neither `pnpm test:unit` nor the
integration workflow. Outside CI a test skips with a warning when the real
project cannot be reached through the scripts; in CI it fails instead.

A test of the real tier reaches the cluster of the real project through the
scripts, with `openRealProject` of `e2e/scripts/commands.mts`, as a command of
the scripts reaches it: it sets the private umask of the scripts, checks the
local Docker, takes the lock of the state folder, runs the checks that a capture
runs before it makes workload clusters, the tools and the limits of inotify
among them, refuses a real project without the providers of the pins or with one
at another release, and checks the target before every request, so that it
refuses any other cluster. A refusal of the checks of the target throws a
`TargetRefusal`, which a test does not retry, while a request that fails may
succeed later. Closing the session that it returns releases the lock and reports
a change to the kubeconfig of the user. A test writes only to that cluster, in a
namespace of its own, which it deletes at its end with its objects, as it
deletes first one that a run that was killed left. Vitest runs each file in a
process of its own, since a worker thread cannot set the umask.

The one test of the real tier, `test/real-project/s7.tests.ts`, tries S7 of
SPEC-0001 as SPEC-0003 tries it (P32), in the namespace `freelens-capi-s7`: a
server-side dry run of a Cluster with neither reference nor topology, which the
webhook of Cluster refuses; a Cluster with an infrastructure reference only and
one control plane Machine of its own, labelled for kindnet, which the
ClusterResourceSet of kindnet in the namespace applies; and a Cluster with a
control plane reference only, to a KubeadmControlPlane of one replica. It reads
the namespace every five seconds until the Cluster with an infrastructure
reference has settled, its probe succeeded and its control plane initialized,
and four minutes have passed since the creation of both Clusters, ten minutes
after the creation at most. A reading that fails is taken again until then, as
the waits of the scripts take theirs, and a refusal of the checks of the target
ends the test at once. It checks every reading against what the trial by hand
saw, the reading of the status model included, with the expectations of
`s7-expectations.ts`, from the first full status of each object, but for what a
controller writes a moment after the rest, which an expectation derives from the
reading or asserts once written. Their unit tests check them on readings rebuilt
from that trial, from the first run in CI and from the code of the release, and
on readings that contradict each row (SPEC-0003, "With the real project: S7").

The first run of the test in CI, in the job of the real project dispatched on
the branch that added it, passed its first and third cases and failed the second
at +6.361s: its Cluster had a generation that its status had not observed yet,
which the model marks as an older generation, as it should, while the
expectation wanted no mark. The expectations now derive that mark from each
reading, and two more expectations follow the code where the trial could not see
it (SPEC-0003, "Notes and deviations"). The test asserts what it checks only
once its run in CI has passed. The whole job took about 8 minutes on a warm
cache.

The workload cluster of the second case has containers of its own, which `down`
deletes, by their label, as it deletes those of the captures, when a run that
was killed left them.

### The sessions of the real tier in Freelens

Three sessions of the integration tests open the cluster of the real project in
Freelens dev, through a copy of the kubeconfig of the scripts that the profile
syncs, and reach it themselves through the scripts, with `openRealProject`, as
a test of the real tier does: `pnpm test:integration:real-project` runs them,
with `vitest.integration-real-project.config.ts`, and `pnpm test:integration`
leaves them out (SPEC-0004, "With the real project"; P29, P33; SPEC-0005, "With
the real project").

- `integration/__tests__/clusters-real.tests.ts` compares what the view says
  of `freelens-capi-md` and `freelens-capi-mp` with what
  `clusterctl describe cluster`, the tool of the project, prints of them, run by
  the scripts with the pinned clusterctl and no check for a newer one: the
  status and the reason of `Available` of `freelens-capi-md`, and the counters
  of its control plane and of its workers, from the value of their items, which
  add up to its row; `freelens-capi-mp` Degraded, with
  `ControlPlaneMachinesReady` among its issues, once the tool gives its
  `Available` as `True`; and, read once, the topology of both. The comparison
  and the waits read both sides again, five minutes at most, until they agree,
  since the controllers still write the objects. It writes nothing.
- `integration/__tests__/clusters-sveltos.tests.ts` is S6 of SPEC-0001: it
  installs the Sveltos extension `2.1.0` from the file of its package on the
  npm registry, with the `.sha256` beside it that Freelens checks it against,
  and applies the definitions of the chart `projectsveltos` `1.16.1`, the files
  of its folder `crds`, both downloaded by the scripts and checked against
  their pins ("The pins"), by the names that it takes from their manifests
  first; both pages, each opened at the address of its own extension, then list
  the same Clusters, a label that kubectl sets reaches both when they open, and
  a label set and removed with one page open reaches that page through its
  watch, and the other when it opens, with no failed watch of the group of
  Cluster API. The page of the Sveltos extension reloads its lists every 30
  seconds, so an update that it shows counts only when no list of the Clusters
  without a watch went between the write and the update; when one did, the step
  makes its write again, three times at most, and says so. A 429 that the API
  server answers to a GET of the Sveltos extension to the groups of its own
  kinds, `*.projectsveltos.io`, is not an error of this view, and S6 leaves it
  out; one to a group that this view reads counts.
- `integration/__tests__/cluster-tree-real.tests.ts` compares the tree of
  `freelens-capi-md` and of `freelens-capi-mp`, every node expanded, with what
  `clusterctl describe cluster` prints of them with `--show-machinesets`,
  `--show-templates`, `--show-resourcesets`, `--echo` and `--grouping=false`,
  which show every object on a row of its own: every row of an object a node of
  the tree under the node of the row that holds it, at its depth, the virtual
  rows of the tool read as the nodes Workers, Add-ons and Templates; every other
  node of a kind that the tool leaves out; for every row with a status, the
  condition that the health of its node rests on, from the summary of its
  details; and the counters of the control plane and of the MachineDeployment,
  from the tooltip of their cell Replicas. Each comparison reads both sides
  again, five minutes at most, until they agree. It writes nothing.

They write only to the cluster of the real project, through the scripts, and
undo what they write at their end, also when a step failed: the session of S6
writes the label `tier` on `freelens-capi-md` and the definitions of Sveltos,
which it deletes by their names, with `--ignore-not-found`, after it uninstalls
the Sveltos extension. Outside CI each skips with a warning when Freelens dev
does not answer or the real project cannot be reached through the scripts; in
CI it fails instead. Run locally, S6 uninstalls any installation of the Sveltos
extension that the profile of Freelens dev has, and leaves none.

## Continuous integration

- `integration-tests.yaml`, on every pull request and push to `main`: the kind
  cluster of its sessions is the cluster of the definitions, which the workflow
  creates with `pnpm e2e:cluster:up:definitions` before it starts Freelens dev
  with a profile that syncs two entries, the kubeconfig of the scripts, which
  holds that cluster alone, and the folder of the restricted session, empty,
  readable by the runner user alone, in `RUNNER_TEMP`, which
  `TEST_RESTRICTED_KUBECONFIG_FOLDER` names; and to which
  it applies the fixtures of every state, `pnpm e2e:fixtures:up all`, each in
  the namespace of its state, once Freelens dev answers, as its last step
  before the tests: the session of the Clusters checks the marks that the
  fixtures give within 25 minutes of their apply (SPEC-0004, P33, "Notes and
  deviations"). The session of the
  fixtures, `integration/__tests__/fixtures.tests.ts`, opens that cluster and
  checks that the host imports the extension in the frame of the cluster with
  no error in either process, and that it lists every object of the set of
  `healthy`, in the list of its kind, by the cell of its name;
  `TEST_FIXTURE_STATE` names another state. The session of the Clusters,
  `integration/__tests__/clusters.tests.ts`, reads the fixtures of every state
  at once in the page of the extension, its details and the panel in the
  details of the host; it writes a label on three Clusters of the fixtures and
  the annotation `cluster.x-k8s.io/paused` on one, and removes them, also when
  a check failed (`AGENTS.md`). The restricted session,
  `integration/__tests__/clusters-restricted.tests.ts`, opens the same page as
  a second identity that it makes on that cluster, which may read part of it,
  and the page of the tree of the Cluster of `healthy`, and deletes it at its
  end ("Safety"). The session of the tree, `integration/__tests__/cluster-tree.tests.ts`,
  opens the tree of the Cluster of every state, with its expansion, its
  details, its keys, its states that are not the happy one and its search,
  reads it in the tree of accessibility of Chromium, follows it live through
  writes of its own on `healthy`, which it undoes, and tries the large Cluster
  ("The large Cluster of the session of the tree", "Safety"). The job has an
  hour, and its step of the tests 25 minutes, the window of the marks of the
  fixtures, limits set from the durations of the runs: in CI the job took 5
  minutes, and its step of the tests 3.3, with a case that waited its 60
  seconds, before the session of the tree; with it, the first run of its pull
  request took 10 minutes, and the step of the tests 7.8, three cases failing,
  one after its wait of 60 seconds (SPEC-0005, P22). A step that
  reaches its limit fails, as a case that reaches its own does, and loses the
  report of the sessions after it, which a run of one file gives again.
  The list of the host keys its columns by the names of the printer columns,
  and the definitions of MachineDeployment and KubeadmControlPlane at
  `v1beta2` name two columns `Available`, so React logs a repeated key in
  Freelens dev. The session decides each such error as it arrives, on the
  address that the frame that logged it had then: it leaves it out only when
  that address is the list of the host for a custom resource, with no details
  panel open, and the key is a column that the list repeats, as the host makes
  its columns from the definition; any other repeated key counts (`AGENTS.md`).
  The session of the template installs the extension, as before.
- `test-environment.yaml`, when the scripts, the pins, the fixtures, the
  toolchain, the main process and the shared modules, `src/main/` and
  `src/common/`, which the tests and the sessions of the real tier load, the
  view, `src/renderer/`, and the build that makes the extension that the
  sessions install, `vite.config.mjs` and `build/`, the unit tests of the
  sources left out, the tests of the real tier, or the sessions of the real
  tier and what they import change, on every push to `main` and every night
  (SPEC-0004, P33, "Notes and deviations"; kit, `docs/testing.md`, "What runs
  when"). The paths start
  both of its jobs, the fixtures too. Its job of the fixtures runs
  `pnpm e2e:fixtures:check` on the cluster of the definitions. Its job of the
  real project is a matrix of the releases of Freelens of the integration
  tests, `v2.1.0` alone, each job with a real project of its own: it
  runs `pnpm e2e:cluster:up`, checks that `freelens-capi-md` reports
  `Available` `True`, runs `pnpm e2e:cluster:up` again, which resumes, then the
  tests of the real tier, `pnpm test:real-project`, within a quarter of an hour
  of their own; then it builds Freelens dev at its release, as
  `integration-tests.yaml` builds it, starts it with a profile that syncs a
  copy of the kubeconfig of the scripts for the cluster of the real project
  alone, and runs the sessions of the real tier in Freelens,
  `pnpm test:integration:real-project`, within 40 minutes; then
  `pnpm e2e:cluster:down`, and it checks that no kind cluster and no container
  of the scripts is left. Each job has the two hours of SPEC-0004, P33, limits
  set from the durations of the runs: in CI a job took 8 to 10 minutes with
  sessions that settled at once, the real project up in 2.5 and the tests of
  the real tier in 4.5, and 22 when its sessions waited their polls of 10
  minutes. A step that reaches its limit fails, as a case that reaches its own
  does, and loses the report of the sessions after it, which a run of one file
  gives again. A step of the tests cut by its limit leaves their
  workload clusters to `pnpm e2e:cluster:down`, which deletes them with the
  others. A new push to a pull request cancels the jobs of the real project
  that still run for it, each release in a group of its own, so that the jobs
  of a run do not cancel each other; the runs of `main` and of the night are
  never cancelled. The job of the real project saves the cache of pnpm, which
  the job of the fixtures restores under the same key, and the caches that the
  steps taken from `integration-tests.yaml` keep name the runner of this job.
- `e2e-pins-check.yaml`, on every change to the pins or to the scripts:
  `pnpm e2e:pins:check`.

No workflow uploads the state folder of the scripts, a kubeconfig or any file
of a cluster.

## The pins

`e2e/environment/pins.json` holds the version of every project that the
scripts download from, and the SHA-256 of every file:

- Cluster API: the release, the commit of its tag, the version of Kubernetes
  of the workload clusters and an earlier one, which the captures of
  `upgrading` and `scaling-up-held` start their workload clusters at, the
  components of the four providers, the templates and the ClusterClass of the
  development provider, `metadata.yaml`, clusterctl for Linux and macOS on
  amd64 and arm64, and the two files of the source at the commit, the
  `Provider` definition and the kindnet manifest;
- the Kubernetes of the kind clusters, `managementKubernetes`: the tag of
  `kindest/node`, and the minor versions that the release of Cluster API
  supports for a management cluster, which it declares in `supported`;
- the Cluster API Operator: the release and `operator-components.yaml`;
- cert-manager: the version that the pinned clusterctl installs by default,
  and `cert-manager.yaml`;
- S6 of SPEC-0001 (SPEC-0004, P29): the package of the Sveltos extension,
  `@freelensapp/sveltos-extension` at the release that SPEC-0001 read, as the
  npm registry publishes it, and the chart of Sveltos, `projectsveltos` at the
  release whose definitions the CI of that extension applies, as its release
  on GitHub publishes it, each with its version as its project numbers it and
  the SHA-256 of its file.

The version of kind is the `kind_version` of the env of
`.github/workflows/integration-tests.yaml`, which the scripts read from there:
it is pinned once, for the integration tests and for the environment. The
versions of Kubernetes are pinned in the pins alone, each one within what the
release of Cluster API supports in the table of versions of its book
(`docs/book/src/reference/versions.md` at the tag): the two kind clusters,
which stand for management clusters, take the version of
`managementKubernetes`, from `v1.33` to `v1.37` for `v1.14.4`, and the workload
clusters the versions of the pins for them, which the release supports for
workload clusters. The kind cluster of the integration tests is the cluster of
the definitions, so it takes its version from the pins too. The scripts refuse
a version of `managementKubernetes` outside the range that it declares, and a
unit test checks that the rule of Renovate allows the same range.

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
changes with Cluster API too. The pins of S6 have no Renovate entry either:
they are the releases that the specs read, and change with them. The digest of
each is that of its file, as the scripts download it:

```sh
curl -fsSL https://registry.npmjs.org/@freelensapp/sveltos-extension/-/sveltos-extension-<version>.tgz | shasum -a 256
curl -fsSL https://github.com/projectsveltos/helm-charts/releases/download/projectsveltos-<version>/projectsveltos-<version>.tgz | shasum -a 256
```

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
- **The clusters of the captures.** A capture of the fixtures makes its
  workload cluster on the cluster of the real project, named as the namespace
  of its state, such as `freelens-capi-healthy`, and deletes it at its end,
  whether it succeeded or not; the hooks of the scripts that it gives the
  annotations of Machines, named `test-environment`, it removes first, and a
  paused Cluster it resumes. `down` deletes the containers of these clusters as
  it deletes those of the demo, by their label, when the state folder records
  the cluster of the real project, so a capture that was killed leaves nothing
  behind it once the environment is taken down. The same holds for the workload
  clusters of the test of S7, named `freelens-capi-s7-infra-only` and
  `freelens-capi-s7-cp-only`, which it deletes at its end with their namespace.
- **The limits of inotify, on Linux.** The nodes of the workload clusters need
  more instances of inotify than some systems give: with too few, their
  containers exit with code 255 as they start, and the health check of the
  ClusterClass replaces them again and again. `up` and a capture of the
  fixtures raise them to the values of the troubleshooting page of the book of
  Cluster API, `fs.inotify.max_user_instances` to 8192 and
  `fs.inotify.max_user_watches` to 1048576, when they are lower, with
  `sudo -n sysctl`, or say that they could not and that the workload clusters
  may fail.

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
  both by tag. The images that the manifests of the releases name, of the
  controllers, of cert-manager, of kindnet and of the load balancer, are
  pulled by the tags the manifests give them. The digests pin the manifests,
  which name the images.

`down` leaves in the state folder the cache of the downloads, which the next
run checks before using it, the local repository and configuration of
clusterctl, which every run writes again, and the cache of kubectl; in the
cache of Docker, the images it pulled for the nodes and the load balancers;
and the `kind` network of Docker, which kind shares between all its clusters.
Removing the state folder removes what it holds.

### The writes of the session of the tree

The session of the tree of a Cluster writes to the cluster of the definitions
alone, through the scripts, with `openDefinitions`, under the lock of the state
folder, with the target checked before every request (SPEC-0005, "Tests", "In
Freelens", 6, 9): on the objects of `healthy`, the annotation
`cluster.x-k8s.io/paused` of a worker Machine, a Machine of its own,
`freelens-capi-healthy-d2lgq-a0000`, and the condition `Ready` of another
worker through the status subresource; and the large Cluster in its namespace
("The large Cluster of the session of the tree"). It records the version that
the answer to each write gives, and fails at once when it is the one before
the write, so that its check of "Safety" tells its writes from those of the
frame. It undoes each write at the end of its part, also when a check failed,
and its end undoes what a part could not; it checks that its Machine and the
namespace of the large Cluster are gone. A run that was killed in step 6 can
leave a write on `healthy`, which the next apply of the fixtures replaces.

### The second identity of the restricted session

The restricted session of SPEC-0004 (P23) opens the page of the Clusters, and
the page of the tree of a Cluster (SPEC-0005, "With a restricted identity"), as
a user who may read part of the cluster of the definitions. It is the one
session with a kubeconfig other than those of the scripts, which never read
it, and it follows these rules:

- **Written to the cluster of the definitions alone, through the scripts.** It
  reaches that cluster with `openDefinitions` of `e2e/scripts/commands.mts`,
  under the lock of the state folder, with the target checked before every
  request, as a command of the scripts. It makes a namespace of its own,
  `freelens-capi-restricted`, with a ServiceAccount, and ClusterRoles with
  their bindings, every object with the label
  `test-environment.freelens.app/session=restricted`. It asks the cluster what
  the identity may do with SubjectAccessReviews, which store nothing.
- **Roles that read alone.** Every role grants `get`, `list` and `watch` at
  most, the role of the definitions read by their names `get` alone, never on
  a Secret and never on every resource. Each step of a case grants what it
  allows, and the session reads again only once the cluster answers so. Every
  step lets the identity list and watch the namespaces over the whole cluster,
  as the frame of a cluster does, and read in `default` what the start page of
  Freelens reads there for a user who may not list the Nodes, the overview of
  the workloads, and every kind that the page and the tree of a Cluster read,
  with those of the providers of the fixtures; read by their names, the
  definitions are those of the control plane and of the infrastructure cluster
  that the Clusters name, and those of the infrastructure machines and of their
  templates that the tree of `healthy` reads. A step that refuses a kind
  in a namespace that the frame read before loads the frame again, which then
  keeps no version from which a watch of that namespace would start, so that
  the only reads refused are the lists and the gets that its cases expect,
  which the session checks arrived, and never a watch (SPEC-0004, "Notes and
  deviations").
- **A token that stays on the machine.** The token comes from a TokenRequest
  and lasts an hour. It goes from kubectl into a kubeconfig file alone,
  `freelens-capi-restricted.kubeconfig`, readable by its user alone, with the
  API server and the authority of the kubeconfig of the scripts and one
  context of its own name, in the folder that
  `TEST_RESTRICTED_KUBECONFIG_FOLDER` names, which the profile of Freelens dev
  syncs; the session refuses a folder inside the repository. It is never
  logged, and the folder is never uploaded as an artifact of CI: no workflow
  uploads one. Locally, make a folder outside every repository, readable by you
  alone, add it once in Kubeconfig Syncs of the profile of Freelens dev, and
  name it in the variable; without it the session skips with a warning, and in
  CI it fails.
- **Its end.** At its end, also when a case failed, the session disconnects the
  cluster of the identity, deletes the file, every object with its label, and
  the namespace with its ServiceAccount, and checks that they are gone. A run
  that was killed leaves them to the next, which deletes them first.
- **Local runs.** The profile of Freelens dev keeps the namespaces that the
  filter selects for the cluster of the identity, so a run that was killed in
  a case can leave it on namespaces that the next run refuses at its start,
  where it grants the first access: select `default` for that cluster, or start
  Freelens dev on a fresh profile. With the results of a run before, Vitest runs
  first the files that failed in it, so after a failed run of the restricted
  session the session of the Clusters can start more than 25 minutes after the
  fixtures were applied, and fails at its start, saying so: apply them again
  first, `pnpm e2e:fixtures:up all`. In CI neither happens: the profile is
  fresh, and no results of a run before are kept.
