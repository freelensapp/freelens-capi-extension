# Scaling up, held by the preflight checks

A Cluster with a managed topology, from the template `development` of the
release, with one control plane Machine and one worker, made at the version of
Kubernetes `workloadKubernetesUpgradeFrom` of the pins. Its topology leaves the
replicas of its MachineDeployment to the MachineDeployment, as with an
autoscaler, and its KubeadmControlPlaneTemplate runs `sleep 150` before kubeadm,
as in `provisioning`, so that an upgrade of its control plane lasts. Its
`spec.topology.version` is changed to `workloadKubernetesVersion`, and its
MachineDeployment scaled to two workers: while the control plane upgrades, the
preflight checks of the MachineSet hold the new worker, `ControlPlaneIsStable`
and those of the skew between its version and that of the control plane, and the
MachineSet and the MachineDeployment report `ScalingUp` `True` with fewer
Machines than their replicas. Captured while the checks hold it.

The objects of the namespace `freelens-capi-scaling-up-held` of the real project
of the test environment, Cluster API `v1.14.4` with its development provider,
made at Kubernetes `v1.36.4`, upgrading to `v1.37.0`, as its controllers and its
webhooks wrote them, read at `v1beta2`.
`pnpm e2e:fixtures:capture scaling-up-held` captures them again, and
`pnpm e2e:fixtures:up scaling-up-held` applies them to the cluster of the
definitions (`docs/development/TESTING.md`).

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
