# A MachinePool whose provider keeps no Machines, written by hand

The one state of the fixtures that the development provider cannot show: it
keeps Machines for its pools, and a provider may keep none. This set is written
by hand from SPEC-0001 R2.66 to R2.69, and is no capture.

It starts from the set of `machine-pools`, a Cluster with a managed topology
whose only workers are a MachinePool of one worker, with no network add-on, so
that no Node becomes ready. It takes its objects into the namespace
`freelens-capi-pool-without-machines`, with that name in place of
`freelens-capi-machine-pools` wherever it was, and changes them so:

- The Machine of the pool and its DevMachine are not there, and the
  DevMachinePool does not set `status.infrastructureMachineKind`, the field
  that makes the controller of the MachinePool keep Machines for the pool
  (R2.67).
- Without Machines, the MachinePool reports in `status.readyReplicas` and
  `status.availableReplicas` its `status.replicas`, whatever the readiness of
  its Nodes, and in `status.upToDateReplicas` its `spec.replicas` (R2.67): 1,
  where the set of `machine-pools` counts its Machine, which is not ready, as
  0.
- What follows its Nodes stays as captured: the deprecated `v1beta1` counters
  and condition `ReplicasReady`, its Node not being ready, and so the phase
  `ScalingUp` (R2.66, R2.68, R2.69). Its only `v1beta2` condition is `Paused`.
- The Cluster sums the counters of its MachinePools in `status.workers`
  (R2.13), which say 1 ready and available worker as the MachinePool does. Its
  conditions are those of `machine-pools`: the summary of the project leaves
  the MachinePools out (R2.29).

Every time is written as its offset from `2026-01-01T00:00:00Z`, as in every
set of the fixtures, and the other changes of a capture are those of
`machine-pools`. A new capture of `machine-pools` does not change this set.
