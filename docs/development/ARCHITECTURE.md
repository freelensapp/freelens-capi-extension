# Architecture

How the extension reaches Cluster API, what runs in which process, and the
decisions that the specs share, as they are now. A spec records a decision
when it is taken; this document follows when a later spec changes one. The
facts behind each decision are in
[SPEC-0001](../specs/SPEC-0001-reconnaissance.md).

## What it reads

The management cluster that the user has open in Freelens, and nothing
else:

- the kinds that Cluster API `v1.14.4` installs, at `v1beta2` only, the
  `Provider` of `clusterctl` at `v1alpha3` and the kinds of the Cluster API
  Operator at `v1alpha2`, through the stores of the host, watched, in the
  namespaces that the filter of the host selects;
- for a view of one Cluster whose namespace the page does not read, the same
  kinds in that namespace alone, through stores of the extension's own class,
  one for each kind, which the host never holds (SPEC-0004, P31);
- for the tree of a Cluster, always through stores of its own, those kinds and
  the bootstrap configs and their templates, the ClusterResourceSets and their
  bindings, and the IPAddressClaims and the IPAddresses, in the namespace of the
  Cluster, and its ClusterClass in the namespace that its class reference names
  (SPEC-0005, P6);
- the objects of the providers that those kinds reference, at the version
  that the contract label of their definition gives;
- the definitions of those kinds, from the store of definitions of the host,
  or each read by its name when the user may not list them, for those labels;
- the events of the objects.

It never reads a workload cluster, and never a Secret outside the two
kubeconfig actions, which hand it only to the user who asked.

## Processes

| Process  | What runs there                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Renderer | Every view, and every write to the management cluster                                                                     |
| Main     | Nothing yet. It comes with the first spec that needs it: adding a workload cluster to the catalog of Freelens is known to |

## Shared decisions

- **Versions.** Only `v1beta2` of a Cluster API kind is requested. Objects
  created at `v1beta1` reach the views converted by the project. Deprecated
  forms are shown with a label and never written.
- **Provider objects.** Their kinds are known only at run time. They are
  shown inside the views of the extension, through the references that name
  them; without access to the definitions, a reference is shown as text.
- **Status.** Health, activity and the weight of each condition come from
  pure functions that the lists, the details and the overview share
  (SPEC-0001, H1 to H3). An unknown value is Unknown, never Healthy.
- **The host.** The pages of the extension take out the row selection and
  the row menu of the host and open their own details; the kinds that have a
  page are listed in `customResources`. The page of the tree of a Cluster has no
  list layout of the host: it draws the `Table` of the host with virtual rows,
  inside an element of its own with the role `treegrid`, which takes the keys
  and the focus and owns the rows that the list draws (SPEC-0005, P9, P18).
- **The stores of the host.** A page reads its stores as the host reads those
  of its own lists: the list layout of the host subscribes the store of the
  page and, as its dependent stores, those of the kinds that its model reads,
  one load of the namespaces of the filter and its watch for each, again when
  the filter changes. Each store reaches the layout through one adapter of the
  page, which passes the reads of the store, tells the page each load and each
  failure, and selects nothing and removes nothing. The page loads nothing
  itself, takes its rows and the context of the model from the namespaces that
  each store has loaded, and says in words every read that the cluster refused
  or that failed (SPEC-0004, P19, P25). The page also builds one store of the
  class of its model, once in the frame of the cluster, and never loads,
  registers or subscribes it: its public `context` is the one way in which the
  extension API tells whether the host follows a list that it reads over the
  whole cluster, which the page says when it does not (SPEC-0004, P34).
- **The stores of a view of one Cluster.** The details of a Cluster, and the
  panel in the details of the host, take their Cluster and its context from
  the stores of the page when the filter of the page selects the namespace of
  the Cluster. Otherwise they read that namespace through stores of their own:
  one of the class of the model of each kind, and one of a generic class for
  each kind of a provider that the Cluster names, each built with the API that
  the host registered for its kind, never registered, loaded once on that
  namespace and then watched, until the view closes (SPEC-0004, P31). The page
  of the tree of a Cluster reads through such stores always, with the kinds of
  the tree, the kinds of the providers that the references of what it read name
  and its ClusterClass, as one read whose kinds are a parameter; it shows the
  tree once the first load of each has ended, and its refresh loads every store
  again, keeping what they hold until each answers (SPEC-0005, P6, P13, P23).
- **The kinds of the operator.** They are read as every other kind, in the
  namespaces of the filter. Where the filter leaves out the namespace of a
  provider, the status model notes that the availability of its controller is
  not known, and marks nothing (SPEC-0004, P2).
- **Writes.** Each write has its own spec and a confirmation that names its
  target. A write on what a managed topology owns goes to the topology of
  the Cluster. The extension never writes a `status`, never removes a
  finalizer and never turns off a check of a webhook.
- **Secrets.** The content of a Secret, of bootstrap data, and the fields of
  KubeadmConfig and KubeadmControlPlane that hold a join token, a password
  or the content of a file are never shown and never logged.
- **Feature gates.** They are not read. The views follow the objects that
  exist.
- **Namespaces.** A view of one Cluster loads its objects in the namespace
  of the Cluster, whatever namespaces the filter selects: by the label
  `cluster.x-k8s.io/cluster-name`, by `spec.clusterName`, by the references
  of its objects and by the selectors that match it. Through stores of its
  own, it reads that namespace alone: a ClusterClass in another namespace and
  the kinds of the operator are not read for it, and the status model notes
  them (SPEC-0004, P31). The tree of a Cluster reads its ClusterClass in the
  namespace that the class reference names, which may be another (SPEC-0005,
  P6).
- **Freelens.** `engines.freelens` is `^2.1.0`, and the jobs of CI run
  Freelens 2.1.0 alone: the extension follows the latest release of Freelens
  (SPEC-0001, A8, amended in its "Notes and deviations").
