# Objects with no status

One object of each kind of the fixtures, two of DevMachineTemplate and of
KubeadmConfig, and none of the Docker kinds of the development provider, which
no template of the release uses, as a user writes it, before any controller
reconciles it, so with no status: the scripts send them to the real project in a
server-side dry run of their creation, which its webhooks default and validate
and which stores nothing, and keep what the API server answers. They make one
Cluster without a topology, whose parts name each other, and a ClusterClass. No
ExtensionConfig is among them: the real project of the test environment runs
without the feature RuntimeSDK, without which its webhook refuses one.

What the real project of the test environment, Cluster API `v1.14.4` with its
development provider, answered to a server-side dry run of the creation of the
objects in the namespace `freelens-capi-no-status`, which name Kubernetes
`v1.37.0`: defaulted and validated by its webhooks, and stored and reconciled by
nothing. Each one is at `v1beta2`, the Provider of clusterctl at `v1alpha3`, its
only version. `pnpm e2e:fixtures:capture no-status` captures them again, and
`pnpm e2e:fixtures:up no-status` applies them to the cluster of the definitions
(`docs/development/TESTING.md`).

Every time is written as its offset from the moment of the capture, from
`2026-01-01T00:00:00Z`, and every generation as its distance from the
generations that the status of its object observed. What the API server adds is
left out: the identifiers, the versions and the managed fields.

No field that SPEC-0001 A3 forbids showing is in these objects.
