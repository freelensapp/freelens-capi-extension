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
  Operator at `v1alpha2`, through the stores of the host, watched;
- the objects of the providers that those kinds reference, at the version
  that the contract label of their definition gives;
- the definitions of those kinds, each read by its name, for those labels;
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
  page are listed in `customResources`.
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
  of the Cluster: by the label `cluster.x-k8s.io/cluster-name`, by
  `spec.clusterName`, by the references of its objects and by the selectors
  that match it.
- **Freelens.** `engines.freelens` is `^2.0.0`, as in the template, until
  the first pull request that uses a member added in Freelens 2.1.0.
