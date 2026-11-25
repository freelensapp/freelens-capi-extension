# A Cluster provisioning

A Cluster with a managed topology, from the template `development` of the
release, with one control plane Machine and one worker, captured while the
bootstrap of its first control plane Machine runs, before its control plane is
initialized: the development provider has provisioned the container of the
Machine, and runs the commands of its bootstrap inside it, which it counts in
the readiness of the infrastructure of the Machine. The scripts give the
KubeadmControlPlaneTemplate of its ClusterClass the command `sleep 150`, which
runs before kubeadm, so that this lasts: kubeadm takes a few seconds on a
machine with the images at hand, too few for two readings of the objects to
agree.

The objects of the namespace `freelens-capi-provisioning` of the real project of
the test environment, Cluster API `v1.14.4` with its development provider, at
Kubernetes `v1.37.0`, as its controllers and its webhooks wrote them, read at
`v1beta2`. `pnpm e2e:fixtures:capture provisioning` captures them again, and
`pnpm e2e:fixtures:up provisioning` applies them to the cluster of the
definitions (`docs/development/TESTING.md`).

Every time is written as its offset from the moment of the capture, from
`2026-01-01T00:00:00Z`, and every generation as its distance from the
generations that the status of its object observed. What the API server adds is
left out: the identifiers, the versions and the managed fields. So are the
Secrets and the ConfigMaps of the namespace. What the machine that ran the
capture tells of itself is not kept: the processors and the memory of the
machine, which the development provider writes into the capacity of each machine
template, are written as `cpu: "4"` and `memory: 8Gi`.

What SPEC-0001 A3 forbids showing is left out:
`KubeadmConfig spec.files[].content`,
`KubeadmControlPlane spec.kubeadmConfigSpec.files[].content`.
