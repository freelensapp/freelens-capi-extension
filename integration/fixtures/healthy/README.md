# Provisioned and healthy, with a managed topology

A Cluster with a managed topology, from the template `development` of the
release, with one control plane Machine, two workers of a MachineDeployment, and
kindnet applied by a ClusterResourceSet, captured once every condition of every
object is at its normal value, `True` for a positive one and `False` for a
negative one, every Machine has a Node, and every MachineHealthCheck reports
every Machine that its selector targets healthy.

The objects of the namespace `freelens-capi-healthy` of the real project of the
test environment, Cluster API `v1.14.4` with its development provider, at
Kubernetes `v1.37.0`, as its controllers and its webhooks wrote them, read at
`v1beta2`. `pnpm e2e:fixtures:capture healthy` captures them again, and
`pnpm e2e:fixtures:up healthy` applies them to the cluster of the definitions
(`docs/development/TESTING.md`).

Every time is written as its offset from the moment of the capture, from
`2026-01-01T00:00:00Z`, and every generation as its distance from the
generations that the status of its object observed. What the API server adds is
left out: the identifiers, the versions and the managed fields. So are the
Secrets and the ConfigMaps of the namespace. What the machine that ran the
capture tells of itself is not kept: the kernel and the boot of each Node are
`6.12.0-test-environment` and `00000000-0000-4000-8000-000000000000`, its swap
is left out, and its architecture is kept; the processors and the memory of the
machine, which the development provider writes into the capacity of each machine
template, are written as `cpu: "4"` and `memory: 8Gi`.

What SPEC-0001 A3 forbids showing is left out:
`KubeadmConfig spec.files[].content`,
`KubeadmConfig spec.joinConfiguration.discovery.bootstrapToken.token`,
`KubeadmControlPlane spec.kubeadmConfigSpec.files[].content`.
