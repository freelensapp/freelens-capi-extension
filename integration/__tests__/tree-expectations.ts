// The expected trees of the Clusters of the fixtures of SPEC-0002 (SPEC-0005, "Tests", "Unit"), written by hand from
// the sets and never computed by the code that they test, so that a defect of that code cannot write its own
// expectation. The unit tests of the tree and the session of the tree in Freelens both read them, as
// `restricted-access.ts` serves both its unit test and its session.
//
// Each tree is an outline, one row for each node, indented by two spaces for each level under the Cluster:
//
// - an object: its kind and its name, then, for an object of a provider, its role in the words of SPEC-0003 in
//   parentheses;
// - a row made from a reference whose object the tree does not find, or cannot read: the same, then `[not found]` or
//   `[not read]`;
// - a virtual node: its words, `Control plane`, `Workers`, `Templates`, `Add-ons`, `Health checks`, `Other objects`;
// - the node of a kind that cannot be read: the noun of its kind and `[not read]`;
// - a resource of a ClusterResourceSet: its kind and its name, then how the binding of the Cluster records it,
//   `[applied]`, `[not applied]`, `[in no binding]`, or `[not read]` when the bindings cannot be read.
//
// The claim of the set `no-status` names its Cluster in `spec.clusterName`, as the dry run that captures the set writes
// it (SPEC-0005, P21), so its tree holds the claim and its IPAddress, under Other objects, since the claim has no owner.
//
// Beside the trees, what the sessions of the tree in Freelens read, written the same way (SPEC-0005, "Tests", "In
// Freelens", "With a restricted identity"): the marks of step 1, the expansion at first and the counts of step 2, the
// searches of step 7, the writes of step 6 and the counts after each, and the trees of the restricted cases 6 to 9.
// `test/tree-expectations.test.ts` checks each against what the model and the tree give the fixtures, so that a session
// that does not find them in the page finds a fault of the page.

// The namespace and the name of the Cluster of each state (docs/development/TESTING.md, "The fixtures").
export const TREE_CLUSTERS: Readonly<Record<string, string>> = {
  deleting: "freelens-capi-deleting",
  healthy: "freelens-capi-healthy",
  "machine-pool-without-machines": "freelens-capi-pool-without-machines",
  "machine-pools": "freelens-capi-machine-pools",
  "machine-without-node": "freelens-capi-without-node",
  "no-status": "freelens-capi-no-status",
  paused: "freelens-capi-paused",
  provisioning: "freelens-capi-provisioning",
  remediation: "freelens-capi-remediation",
  "rolling-out": "freelens-capi-rolling-out",
  "scaling-down": "freelens-capi-scaling-down",
  "scaling-up": "freelens-capi-scaling-up",
  "scaling-up-held": "freelens-capi-scaling-up-held",
  upgrading: "freelens-capi-upgrading",
  "without-topology": "freelens-capi-without-topology",
};

export const EXPECTED_TREES: Readonly<Record<string, string>> = {
  deleting: `
Cluster freelens-capi-deleting
  DevCluster freelens-capi-deleting-n2jlv (infrastructure cluster)
  KubeadmControlPlane freelens-capi-deleting-4kcdh
    Machine freelens-capi-deleting-4kcdh-cgs69
      DevMachine freelens-capi-deleting-4kcdh-cgs69 (infrastructure machine)
      KubeadmConfig freelens-capi-deleting-4kcdh-cgs69
    Templates
      DevMachineTemplate freelens-capi-deleting-bfsnx (template)
  Workers
    MachineDeployment freelens-capi-deleting-md-0-8dcql
      MachineSet freelens-capi-deleting-md-0-8dcql-vp49h
        Machine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw
          DevMachine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw (infrastructure machine)
          KubeadmConfig freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw
      Templates
        DevMachineTemplate freelens-capi-deleting-md-0-gq8t7 (template) [not found]
        KubeadmConfigTemplate freelens-capi-deleting-md-0-nddmd [not found]
  ClusterClass quick-start
  Health checks
    MachineHealthCheck freelens-capi-deleting-4kcdh
`,
  healthy: `
Cluster freelens-capi-healthy
  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)
  KubeadmControlPlane freelens-capi-healthy-d2lgq
    Machine freelens-capi-healthy-d2lgq-zqlcx
      DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine)
      KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx
    Templates
      DevMachineTemplate freelens-capi-healthy-rclml (template)
  Workers
    MachineDeployment freelens-capi-healthy-md-0-m9x7h
      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine)
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
      Templates
        DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)
        KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-healthy
  Health checks
    MachineHealthCheck freelens-capi-healthy-d2lgq
    MachineHealthCheck freelens-capi-healthy-md-0-m9x7h
`,
  "machine-pool-without-machines": `
Cluster freelens-capi-pool-without-machines
  DevCluster freelens-capi-pool-without-machines-gpth7 (infrastructure cluster)
  KubeadmControlPlane freelens-capi-pool-without-machines-xcx9m
    Machine freelens-capi-pool-without-machines-xcx9m-m5lvm
      DevMachine freelens-capi-pool-without-machines-xcx9m-m5lvm (infrastructure machine)
      KubeadmConfig freelens-capi-pool-without-machines-xcx9m-m5lvm
    Templates
      DevMachineTemplate freelens-capi-pool-without-machines-z92dz (template)
  Workers
    MachinePool freelens-capi-pool-without-machines-mp-0-s48vb
      DevMachinePool freelens-capi-pool-without-machines-mp-0-6cl2n (infrastructure machine pool)
      KubeadmConfig freelens-capi-pool-without-machines-mp-0-wl6nx
  ClusterClass quick-start
  Health checks
    MachineHealthCheck freelens-capi-pool-without-machines-xcx9m
`,
  "machine-pools": `
Cluster freelens-capi-machine-pools
  DevCluster freelens-capi-machine-pools-gpth7 (infrastructure cluster)
  KubeadmControlPlane freelens-capi-machine-pools-xcx9m
    Machine freelens-capi-machine-pools-xcx9m-m5lvm
      DevMachine freelens-capi-machine-pools-xcx9m-m5lvm (infrastructure machine)
      KubeadmConfig freelens-capi-machine-pools-xcx9m-m5lvm
    Templates
      DevMachineTemplate freelens-capi-machine-pools-z92dz (template)
  Workers
    MachinePool freelens-capi-machine-pools-mp-0-s48vb
      DevMachinePool freelens-capi-machine-pools-mp-0-6cl2n (infrastructure machine pool)
      KubeadmConfig freelens-capi-machine-pools-mp-0-wl6nx
      Machine worker-c6khcq
        DevMachine worker-c6khcq (infrastructure machine)
  ClusterClass quick-start
  Health checks
    MachineHealthCheck freelens-capi-machine-pools-xcx9m
`,
  "machine-without-node": `
Cluster freelens-capi-without-node
  DevCluster freelens-capi-without-node-gpbn8 (infrastructure cluster)
  KubeadmControlPlane freelens-capi-without-node-glvg7
    Machine freelens-capi-without-node-glvg7-tjzjx
      DevMachine freelens-capi-without-node-glvg7-tjzjx (infrastructure machine)
      KubeadmConfig freelens-capi-without-node-glvg7-tjzjx
    Templates
      DevMachineTemplate freelens-capi-without-node-klfx5 (template)
  Workers
    MachineDeployment freelens-capi-without-node-md-0-glbqj
      MachineSet freelens-capi-without-node-md-0-glbqj-j9nhm
        Machine freelens-capi-without-node-md-0-glbqj-j9nhm-whkkn
          DevMachine freelens-capi-without-node-md-0-glbqj-j9nhm-whkkn (infrastructure machine)
          KubeadmConfig freelens-capi-without-node-md-0-glbqj-j9nhm-whkkn
      Templates
        DevMachineTemplate freelens-capi-without-node-md-0-4hhsd (template)
        KubeadmConfigTemplate freelens-capi-without-node-md-0-p6vwb
    MachineSet freelens-capi-without-node-without-node
      Machine freelens-capi-without-node-without-node-h5zrd
        DevMachine freelens-capi-without-node-without-node-h5zrd (infrastructure machine)
        KubeadmConfig freelens-capi-without-node-without-node-h5zrd
      Templates
        DevMachineTemplate freelens-capi-without-node-without-node (template)
        KubeadmConfigTemplate freelens-capi-without-node-without-node
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-without-node
  Health checks
    MachineHealthCheck freelens-capi-without-node-glvg7
    MachineHealthCheck freelens-capi-without-node-md-0-glbqj
`,
  "no-status": `
Cluster freelens-capi-no-status
  DevCluster freelens-capi-no-status (infrastructure cluster)
  KubeadmControlPlane freelens-capi-no-status-control-plane
    Templates
      DevMachineTemplate freelens-capi-no-status-control-plane (template)
  Workers
    MachineDeployment freelens-capi-no-status-md-0
      Templates
        DevMachineTemplate freelens-capi-no-status-md-0 (template)
        KubeadmConfigTemplate freelens-capi-no-status-md-0
    MachinePool freelens-capi-no-status-mp-0
      DevMachinePool freelens-capi-no-status-mp-0 (infrastructure machine pool)
      KubeadmConfig freelens-capi-no-status-mp-0
  Add-ons
    ClusterResourceSet freelens-capi-no-status
      ConfigMap freelens-capi-no-status-add-on [in no binding]
    ClusterResourceSetBinding freelens-capi-no-status
  Health checks
    MachineHealthCheck freelens-capi-no-status-md-0
  Other objects
    MachineSet freelens-capi-no-status-set
    Machine freelens-capi-no-status-machine-0
      DevMachine freelens-capi-no-status-machine-0 (infrastructure machine)
      KubeadmConfig freelens-capi-no-status-machine-0
    IPAddressClaim freelens-capi-no-status
      IPAddress freelens-capi-no-status
`,
  paused: `
Cluster freelens-capi-paused
  DevCluster freelens-capi-paused-mb7z2 (infrastructure cluster)
  KubeadmControlPlane freelens-capi-paused-q6kg9
    Machine freelens-capi-paused-q6kg9-lsjbh
      DevMachine freelens-capi-paused-q6kg9-lsjbh (infrastructure machine)
      KubeadmConfig freelens-capi-paused-q6kg9-lsjbh
    Templates
      DevMachineTemplate freelens-capi-paused-wfb6c (template)
  Workers
    MachineDeployment freelens-capi-paused-md-0-vzf8f
      MachineSet freelens-capi-paused-md-0-vzf8f-62l5g
        Machine freelens-capi-paused-md-0-vzf8f-62l5g-w9zwm
          DevMachine freelens-capi-paused-md-0-vzf8f-62l5g-w9zwm (infrastructure machine)
          KubeadmConfig freelens-capi-paused-md-0-vzf8f-62l5g-w9zwm
      Templates
        DevMachineTemplate freelens-capi-paused-md-0-j4zdt (template)
        KubeadmConfigTemplate freelens-capi-paused-md-0-vzj4p
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-paused
  Health checks
    MachineHealthCheck freelens-capi-paused-md-0-vzf8f
    MachineHealthCheck freelens-capi-paused-q6kg9
`,
  provisioning: `
Cluster freelens-capi-provisioning
  DevCluster freelens-capi-provisioning-xh87n (infrastructure cluster)
  KubeadmControlPlane freelens-capi-provisioning-5cqww
    Machine freelens-capi-provisioning-5cqww-6fcc7
      DevMachine freelens-capi-provisioning-5cqww-6fcc7 (infrastructure machine)
      KubeadmConfig freelens-capi-provisioning-5cqww-6fcc7
    Templates
      DevMachineTemplate freelens-capi-provisioning-6g5gf (template)
  Workers
    MachineDeployment freelens-capi-provisioning-md-0-5cs96
      MachineSet freelens-capi-provisioning-md-0-5cs96-hbvpm
        Machine freelens-capi-provisioning-md-0-5cs96-hbvpm-c26hp
          DevMachine freelens-capi-provisioning-md-0-5cs96-hbvpm-c26hp (infrastructure machine)
          KubeadmConfig freelens-capi-provisioning-md-0-5cs96-hbvpm-c26hp
      Templates
        DevMachineTemplate freelens-capi-provisioning-md-0-zljrf (template)
        KubeadmConfigTemplate freelens-capi-provisioning-md-0-j4xt9
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [in no binding]
    ClusterResourceSetBinding freelens-capi-provisioning
  Health checks
    MachineHealthCheck freelens-capi-provisioning-5cqww
    MachineHealthCheck freelens-capi-provisioning-md-0-5cs96
`,
  remediation: `
Cluster freelens-capi-remediation
  DevCluster freelens-capi-remediation-7nlh5 (infrastructure cluster)
  KubeadmControlPlane freelens-capi-remediation-glx8b
    Machine freelens-capi-remediation-glx8b-42wn2
      DevMachine freelens-capi-remediation-glx8b-42wn2 (infrastructure machine)
      KubeadmConfig freelens-capi-remediation-glx8b-42wn2
    Templates
      DevMachineTemplate freelens-capi-remediation-qh2p9 (template)
  Workers
    MachineDeployment freelens-capi-remediation-md-0-qrjs5
      MachineSet freelens-capi-remediation-md-0-qrjs5-t4crs
        Machine freelens-capi-remediation-md-0-qrjs5-t4crs-4g8dq
          DevMachine freelens-capi-remediation-md-0-qrjs5-t4crs-4g8dq (infrastructure machine)
          KubeadmConfig freelens-capi-remediation-md-0-qrjs5-t4crs-4g8dq
        Machine freelens-capi-remediation-md-0-qrjs5-t4crs-bd642
          DevMachine freelens-capi-remediation-md-0-qrjs5-t4crs-bd642 (infrastructure machine)
          KubeadmConfig freelens-capi-remediation-md-0-qrjs5-t4crs-bd642
      Templates
        DevMachineTemplate freelens-capi-remediation-md-0-htkz6 (template)
        KubeadmConfigTemplate freelens-capi-remediation-md-0-vr2sc
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-remediation
  Health checks
    MachineHealthCheck freelens-capi-remediation-glx8b
    MachineHealthCheck freelens-capi-remediation-md-0-qrjs5
`,
  "rolling-out": `
Cluster freelens-capi-rolling-out
  DevCluster freelens-capi-rolling-out-c8hvj (infrastructure cluster)
  KubeadmControlPlane freelens-capi-rolling-out-hsfpd
    Machine freelens-capi-rolling-out-hsfpd-87hrn
      DevMachine freelens-capi-rolling-out-hsfpd-87hrn (infrastructure machine)
      KubeadmConfig freelens-capi-rolling-out-hsfpd-87hrn
    Templates
      DevMachineTemplate freelens-capi-rolling-out-xswzz (template)
  Workers
    MachineDeployment freelens-capi-rolling-out-md-0-t96dp
      MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t
        Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
          DevMachine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n (infrastructure machine)
          KubeadmConfig freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
      MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62
        Machine freelens-capi-rolling-out-md-0-t96dp-xkg62-kkdsc
          DevMachine freelens-capi-rolling-out-md-0-t96dp-xkg62-kkdsc (infrastructure machine)
          KubeadmConfig freelens-capi-rolling-out-md-0-t96dp-xkg62-kkdsc
        Machine freelens-capi-rolling-out-md-0-t96dp-xkg62-tfl6d
          DevMachine freelens-capi-rolling-out-md-0-t96dp-xkg62-tfl6d (infrastructure machine)
          KubeadmConfig freelens-capi-rolling-out-md-0-t96dp-xkg62-tfl6d
      Templates
        DevMachineTemplate freelens-capi-rolling-out-md-0-hcxz5 (template)
        KubeadmConfigTemplate freelens-capi-rolling-out-md-0-zq7j4
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-rolling-out
  Health checks
    MachineHealthCheck freelens-capi-rolling-out-hsfpd
    MachineHealthCheck freelens-capi-rolling-out-md-0-t96dp
`,
  "scaling-down": `
Cluster freelens-capi-scaling-down
  DevCluster freelens-capi-scaling-down-8pjvv (infrastructure cluster)
  KubeadmControlPlane freelens-capi-scaling-down-z8tnq
    Machine freelens-capi-scaling-down-z8tnq-pk8s5
      DevMachine freelens-capi-scaling-down-z8tnq-pk8s5 (infrastructure machine)
      KubeadmConfig freelens-capi-scaling-down-z8tnq-pk8s5
    Templates
      DevMachineTemplate freelens-capi-scaling-down-ffn87 (template)
  Workers
    MachineDeployment freelens-capi-scaling-down-md-0-97cl7
      MachineSet freelens-capi-scaling-down-md-0-97cl7-8p6v4
        Machine freelens-capi-scaling-down-md-0-97cl7-8p6v4-lt8mz
          DevMachine freelens-capi-scaling-down-md-0-97cl7-8p6v4-lt8mz (infrastructure machine)
          KubeadmConfig freelens-capi-scaling-down-md-0-97cl7-8p6v4-lt8mz
        Machine freelens-capi-scaling-down-md-0-97cl7-8p6v4-p7958
          DevMachine freelens-capi-scaling-down-md-0-97cl7-8p6v4-p7958 (infrastructure machine)
          KubeadmConfig freelens-capi-scaling-down-md-0-97cl7-8p6v4-p7958
      Templates
        DevMachineTemplate freelens-capi-scaling-down-md-0-wphq4 (template)
        KubeadmConfigTemplate freelens-capi-scaling-down-md-0-dq6kh
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-scaling-down
  Health checks
    MachineHealthCheck freelens-capi-scaling-down-md-0-97cl7
    MachineHealthCheck freelens-capi-scaling-down-z8tnq
`,
  "scaling-up": `
Cluster freelens-capi-scaling-up
  DevCluster freelens-capi-scaling-up-kd6h4 (infrastructure cluster)
  KubeadmControlPlane freelens-capi-scaling-up-dzqt7
    Machine freelens-capi-scaling-up-dzqt7-kr7ml
      DevMachine freelens-capi-scaling-up-dzqt7-kr7ml (infrastructure machine)
      KubeadmConfig freelens-capi-scaling-up-dzqt7-kr7ml
    Machine freelens-capi-scaling-up-dzqt7-ph4fc
      DevMachine freelens-capi-scaling-up-dzqt7-ph4fc (infrastructure machine)
      KubeadmConfig freelens-capi-scaling-up-dzqt7-ph4fc
    Templates
      DevMachineTemplate freelens-capi-scaling-up-bdtvf (template)
  Workers
    MachineDeployment freelens-capi-scaling-up-md-0-474jl
      MachineSet freelens-capi-scaling-up-md-0-474jl-xnzdc
        Machine freelens-capi-scaling-up-md-0-474jl-xnzdc-6lj5x
          DevMachine freelens-capi-scaling-up-md-0-474jl-xnzdc-6lj5x (infrastructure machine)
          KubeadmConfig freelens-capi-scaling-up-md-0-474jl-xnzdc-6lj5x
        Machine freelens-capi-scaling-up-md-0-474jl-xnzdc-gtgbd
          DevMachine freelens-capi-scaling-up-md-0-474jl-xnzdc-gtgbd (infrastructure machine)
          KubeadmConfig freelens-capi-scaling-up-md-0-474jl-xnzdc-gtgbd
      Templates
        DevMachineTemplate freelens-capi-scaling-up-md-0-x9wgf (template)
        KubeadmConfigTemplate freelens-capi-scaling-up-md-0-m25r6
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-scaling-up
  Health checks
    MachineHealthCheck freelens-capi-scaling-up-dzqt7
    MachineHealthCheck freelens-capi-scaling-up-md-0-474jl
`,
  "scaling-up-held": `
Cluster freelens-capi-scaling-up-held
  DevCluster freelens-capi-scaling-up-held-g67tx (infrastructure cluster)
  KubeadmControlPlane freelens-capi-scaling-up-held-jr7rd
    Machine freelens-capi-scaling-up-held-jr7rd-gztx4
      DevMachine freelens-capi-scaling-up-held-jr7rd-gztx4 (infrastructure machine)
      KubeadmConfig freelens-capi-scaling-up-held-jr7rd-gztx4
    Machine freelens-capi-scaling-up-held-jr7rd-phjh4
      DevMachine freelens-capi-scaling-up-held-jr7rd-phjh4 (infrastructure machine)
      KubeadmConfig freelens-capi-scaling-up-held-jr7rd-phjh4
    Templates
      DevMachineTemplate freelens-capi-scaling-up-held-xrhbq (template)
  Workers
    MachineDeployment freelens-capi-scaling-up-held-md-0-fn7vm
      MachineSet freelens-capi-scaling-up-held-md-0-fn7vm-v7kvn
        Machine freelens-capi-scaling-up-held-md-0-fn7vm-v7kvn-7zkkm
          DevMachine freelens-capi-scaling-up-held-md-0-fn7vm-v7kvn-7zkkm (infrastructure machine)
          KubeadmConfig freelens-capi-scaling-up-held-md-0-fn7vm-v7kvn-7zkkm
      Templates
        DevMachineTemplate freelens-capi-scaling-up-held-md-0-26ppv (template)
        KubeadmConfigTemplate freelens-capi-scaling-up-held-md-0-v4g27
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-scaling-up-held
  Health checks
    MachineHealthCheck freelens-capi-scaling-up-held-jr7rd
    MachineHealthCheck freelens-capi-scaling-up-held-md-0-fn7vm
`,
  upgrading: `
Cluster freelens-capi-upgrading
  DevCluster freelens-capi-upgrading-26j2r (infrastructure cluster)
  KubeadmControlPlane freelens-capi-upgrading-52g8b
    Machine freelens-capi-upgrading-52g8b-2xtlv
      DevMachine freelens-capi-upgrading-52g8b-2xtlv (infrastructure machine)
      KubeadmConfig freelens-capi-upgrading-52g8b-2xtlv
    Machine freelens-capi-upgrading-52g8b-xr8w4
      DevMachine freelens-capi-upgrading-52g8b-xr8w4 (infrastructure machine)
      KubeadmConfig freelens-capi-upgrading-52g8b-xr8w4
    Templates
      DevMachineTemplate freelens-capi-upgrading-fv7sr (template)
  Workers
    MachineDeployment freelens-capi-upgrading-md-0-82krw
      MachineSet freelens-capi-upgrading-md-0-82krw-g5cdv
        Machine freelens-capi-upgrading-md-0-82krw-g5cdv-zqqm9
          DevMachine freelens-capi-upgrading-md-0-82krw-g5cdv-zqqm9 (infrastructure machine)
          KubeadmConfig freelens-capi-upgrading-md-0-82krw-g5cdv-zqqm9
      Templates
        DevMachineTemplate freelens-capi-upgrading-md-0-8l4r4 (template)
        KubeadmConfigTemplate freelens-capi-upgrading-md-0-bnc5h
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-upgrading
  Health checks
    MachineHealthCheck freelens-capi-upgrading-52g8b
    MachineHealthCheck freelens-capi-upgrading-md-0-82krw
`,
  "without-topology": `
Cluster freelens-capi-without-topology
  DevCluster freelens-capi-without-topology (infrastructure cluster)
  KubeadmControlPlane freelens-capi-without-topology-control-plane
    Machine freelens-capi-without-topology-control-plane-jxdks
      DevMachine freelens-capi-without-topology-control-plane-jxdks (infrastructure machine)
      KubeadmConfig freelens-capi-without-topology-control-plane-jxdks
    Templates
      DevMachineTemplate freelens-capi-without-topology-control-plane (template)
  Workers
    MachineDeployment freelens-capi-without-topology-md-0
      MachineSet freelens-capi-without-topology-md-0-rpwxk
        Machine freelens-capi-without-topology-md-0-rpwxk-hghvs
          DevMachine freelens-capi-without-topology-md-0-rpwxk-hghvs (infrastructure machine)
          KubeadmConfig freelens-capi-without-topology-md-0-rpwxk-hghvs
        Machine freelens-capi-without-topology-md-0-rpwxk-mts4f
          DevMachine freelens-capi-without-topology-md-0-rpwxk-mts4f (infrastructure machine)
          KubeadmConfig freelens-capi-without-topology-md-0-rpwxk-mts4f
      Templates
        DevMachineTemplate freelens-capi-without-topology-md-0 (template)
        KubeadmConfigTemplate freelens-capi-without-topology-md-0
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-without-topology
`,
};

// A row of an outline: its depth under the Cluster and its text.
export interface OutlineRow {
  readonly depth: number;
  readonly text: string;
}

// The rows of an outline, in their order.
export function outlineRows(outline: string): OutlineRow[] {
  return outline
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const indentation = line.length - line.trimStart().length;

      return { depth: indentation / 2, text: line.trim() };
    });
}

// The marks that the session of the tree reads in step 1 (SPEC-0005, "Tests", "In Freelens", 1), for the objects to
// which the table of SPEC-0003 gives a row ("The fixtures of SPEC-0002 give these results"), each found by the text of
// its row in the outline, written by hand from that table as the session of the Clusters writes its own: the word of
// its health, N/A for an object with none, the tones that the table allows that health at the time of the session,
// which runs within 25 minutes of the apply of the fixtures, so within or past a threshold, its activities in their
// order, none for a kind with no status, whose cell says N/A, the word stale, and the note of the MachinePools of
// unknown health. The ClusterClass of `no-status` is in no tree, since its Cluster has no topology.
export interface ExpectedMarks {
  readonly text: string;
  readonly health: string;
  readonly tones: readonly string[];
  readonly activities: readonly string[];
  readonly stale?: boolean;
  readonly note?: string;
}

// The tones of an activity in flight, or of a health that it sets: that of progress within its threshold, and of a
// warning past it (SPEC-0003, P31).
export const IN_FLIGHT: readonly string[] = ["info", "warning"];

const OK: readonly string[] = ["ok"];
const VAGUE: readonly string[] = ["vague"];

// The tones of each activity of the fixtures, every one Progressing: Idle in the tone of progress, Unknown vague, Paused
// terminated, Deleting terminated within its threshold and a warning past it, and any other in flight (SPEC-0003, P31).
export function activityTones(word: string): readonly string[] {
  switch (word) {
    case "Idle":
      return ["info"];
    case "Unknown":
      return VAGUE;
    case "Paused":
      return ["terminated"];
    case "Deleting":
      return ["terminated", "warning"];
    default:
      return IN_FLIGHT;
  }
}

function healthyIdle(...texts: string[]): ExpectedMarks[] {
  return texts.map((text) => ({ text, health: "Healthy", tones: OK, activities: ["Idle"] }));
}

function noStatus(...texts: string[]): ExpectedMarks[] {
  return texts.map((text) => ({ text, health: "N/A", tones: [], activities: [] }));
}

function unknown(...texts: string[]): ExpectedMarks[] {
  return texts.map((text) => ({ text, health: "Unknown", tones: VAGUE, activities: ["Unknown"] }));
}

function deleting(...texts: string[]): ExpectedMarks[] {
  return texts.map((text) => ({ text, health: "N/A", tones: [], activities: ["Deleting"] }));
}

const POOL_NOTE = "1 MachinePool of unknown health";

export const EXPECTED_MARKS: Readonly<Record<string, readonly ExpectedMarks[]>> = {
  provisioning: [
    {
      text: "Cluster freelens-capi-provisioning",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning"],
    },
    {
      text: "KubeadmControlPlane freelens-capi-provisioning-5cqww",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning"],
    },
    {
      text: "DevMachine freelens-capi-provisioning-5cqww-6fcc7 (infrastructure machine)",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Idle"],
    },
    { text: "ClusterResourceSet cni-kindnet", health: "Unhealthy", tones: IN_FLIGHT, activities: ["Idle"] },
    ...healthyIdle(
      "MachineHealthCheck freelens-capi-provisioning-5cqww",
      "MachineHealthCheck freelens-capi-provisioning-md-0-5cs96",
    ),
  ],
  healthy: [
    ...healthyIdle(
      "Cluster freelens-capi-healthy",
      "KubeadmControlPlane freelens-capi-healthy-d2lgq",
      "MachineDeployment freelens-capi-healthy-md-0-m9x7h",
      "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb",
      "Machine freelens-capi-healthy-d2lgq-zqlcx",
      "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
      "KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg",
      "KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9",
    ),
    ...noStatus(
      "DevMachineTemplate freelens-capi-healthy-rclml (template)",
      "DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)",
      "KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v",
      "ClusterResourceSetBinding freelens-capi-healthy",
    ),
  ],
  "machine-without-node": [
    {
      text: "Machine freelens-capi-without-node-without-node-h5zrd",
      health: "Unknown",
      tones: VAGUE,
      activities: ["Provisioning"],
    },
    {
      text: "MachineSet freelens-capi-without-node-without-node",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning"],
    },
    ...healthyIdle("Cluster freelens-capi-without-node"),
  ],
  "rolling-out": [
    ...["MachineDeployment freelens-capi-rolling-out-md-0-t96dp", "Cluster freelens-capi-rolling-out"].map((text) => ({
      text,
      health: "Degraded",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Rolling out", "Scaling down"],
    })),
    ...healthyIdle(
      "Machine freelens-capi-rolling-out-md-0-t96dp-xkg62-kkdsc",
      "Machine freelens-capi-rolling-out-md-0-t96dp-xkg62-tfl6d",
      "MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62",
    ),
  ],
  "scaling-up-held": [
    ...[
      "MachineDeployment freelens-capi-scaling-up-held-md-0-fn7vm",
      "MachineSet freelens-capi-scaling-up-held-md-0-fn7vm-v7kvn",
    ].map((text) => ({ text, health: "Unhealthy", tones: IN_FLIGHT, activities: ["Scaling up"] })),
    {
      text: "Cluster freelens-capi-scaling-up-held",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Upgrading", "Rolling out", "Scaling up", "Scaling down"],
    },
  ],
  "scaling-up": [
    {
      text: "MachineDeployment freelens-capi-scaling-up-md-0-474jl",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning"],
    },
    {
      text: "Cluster freelens-capi-scaling-up",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Scaling up"],
    },
  ],
  "scaling-down": [
    ...["MachineDeployment freelens-capi-scaling-down-md-0-97cl7", "Cluster freelens-capi-scaling-down"].map(
      (text) => ({ text, health: "Degraded", tones: IN_FLIGHT, activities: ["Scaling down"] }),
    ),
    ...deleting("Machine freelens-capi-scaling-down-md-0-97cl7-8p6v4-lt8mz"),
  ],
  paused: [
    ...[
      "Cluster freelens-capi-paused",
      "DevCluster freelens-capi-paused-mb7z2 (infrastructure cluster)",
      "KubeadmControlPlane freelens-capi-paused-q6kg9",
      "Machine freelens-capi-paused-q6kg9-lsjbh",
      "DevMachine freelens-capi-paused-q6kg9-lsjbh (infrastructure machine)",
      "KubeadmConfig freelens-capi-paused-q6kg9-lsjbh",
      "MachineDeployment freelens-capi-paused-md-0-vzf8f",
      "MachineSet freelens-capi-paused-md-0-vzf8f-62l5g",
      "Machine freelens-capi-paused-md-0-vzf8f-62l5g-w9zwm",
      "DevMachine freelens-capi-paused-md-0-vzf8f-62l5g-w9zwm (infrastructure machine)",
      "KubeadmConfig freelens-capi-paused-md-0-vzf8f-62l5g-w9zwm",
      "MachineHealthCheck freelens-capi-paused-md-0-vzf8f",
      "MachineHealthCheck freelens-capi-paused-q6kg9",
    ].map((text) => ({ text, health: "Healthy", tones: OK, activities: ["Paused"], stale: true })),
    ...healthyIdle("ClusterClass quick-start", "ClusterResourceSet cni-kindnet"),
  ],
  deleting: deleting("Cluster freelens-capi-deleting", "MachineDeployment freelens-capi-deleting-md-0-8dcql"),
  upgrading: ["Cluster freelens-capi-upgrading", "KubeadmControlPlane freelens-capi-upgrading-52g8b"].map((text) => ({
    text,
    health: "Degraded",
    tones: IN_FLIGHT,
    activities: ["Provisioning", "Upgrading", "Rolling out", "Scaling down"],
  })),
  "without-topology": healthyIdle("Cluster freelens-capi-without-topology"),
  "machine-pools": [
    { text: "Cluster freelens-capi-machine-pools", health: "Degraded", tones: IN_FLIGHT, activities: ["Provisioning"] },
    {
      text: "MachinePool freelens-capi-machine-pools-mp-0-s48vb",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Unknown"],
    },
  ],
  "machine-pool-without-machines": [
    {
      text: "MachinePool freelens-capi-pool-without-machines-mp-0-s48vb",
      health: "Unknown",
      tones: VAGUE,
      activities: ["Unknown"],
    },
    {
      text: "Cluster freelens-capi-pool-without-machines",
      health: "Degraded",
      tones: IN_FLIGHT,
      activities: ["Provisioning"],
      note: POOL_NOTE,
    },
  ],
  remediation: [
    {
      text: "Machine freelens-capi-remediation-md-0-qrjs5-t4crs-bd642",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Remediating"],
    },
    ...[
      "MachineSet freelens-capi-remediation-md-0-qrjs5-t4crs",
      "MachineDeployment freelens-capi-remediation-md-0-qrjs5",
    ].map((text) => ({
      text,
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Remediating", "Replacing"],
    })),
    ...deleting("Machine freelens-capi-remediation-md-0-qrjs5-t4crs-4g8dq"),
    {
      text: "MachineHealthCheck freelens-capi-remediation-md-0-qrjs5",
      health: "Degraded",
      tones: ["warning"],
      activities: ["Idle"],
    },
    {
      text: "Cluster freelens-capi-remediation",
      health: "Unhealthy",
      tones: IN_FLIGHT,
      activities: ["Provisioning", "Remediating"],
    },
  ],
  "no-status": [
    { ...unknown("Cluster freelens-capi-no-status")[0], note: POOL_NOTE },
    ...unknown(
      "Machine freelens-capi-no-status-machine-0",
      "MachinePool freelens-capi-no-status-mp-0",
      "KubeadmControlPlane freelens-capi-no-status-control-plane",
      "KubeadmConfig freelens-capi-no-status-machine-0",
      "KubeadmConfig freelens-capi-no-status-mp-0",
      "MachineDeployment freelens-capi-no-status-md-0",
      "MachineSet freelens-capi-no-status-set",
      "MachineHealthCheck freelens-capi-no-status-md-0",
      "ClusterResourceSet freelens-capi-no-status",
      "IPAddressClaim freelens-capi-no-status",
    ),
    ...noStatus(
      "DevMachineTemplate freelens-capi-no-status-control-plane (template)",
      "DevMachineTemplate freelens-capi-no-status-md-0 (template)",
      "KubeadmConfigTemplate freelens-capi-no-status-md-0",
      "ClusterResourceSetBinding freelens-capi-no-status",
      "IPAddress freelens-capi-no-status",
    ),
  ],
};

// The rows that the tree of a Cluster shows when it opens, by the expansion at first (P13), as an outline, the rows
// that it shows collapsed, every other row with rows under it being expanded, and the counts that each row that holds
// objects shows, by its text (P11), for the three states of step 2 of the session. Each text is the row of one node in
// these rows.
export interface FirstExpansion {
  readonly outline: string;
  readonly collapsed: readonly string[];
  readonly counts: Readonly<Record<string, string>>;
}

export const FIRST_EXPANSIONS: Readonly<Record<string, FirstExpansion>> = {
  healthy: {
    outline: `
Cluster freelens-capi-healthy
  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)
  KubeadmControlPlane freelens-capi-healthy-d2lgq
  Workers
  ClusterClass quick-start
  Add-ons
  Health checks
`,
    collapsed: ["KubeadmControlPlane freelens-capi-healthy-d2lgq", "Workers", "Add-ons", "Health checks"],
    counts: {
      "Cluster freelens-capi-healthy": "21 objects: 17 Healthy, 4 with no health",
      "KubeadmControlPlane freelens-capi-healthy-d2lgq": "4 objects: 3 Healthy, 1 with no health",
      Workers: "10 objects: 8 Healthy, 2 with no health",
      "Add-ons": "2 objects: 1 Healthy, 1 with no health",
      "Health checks": "2 objects: 2 Healthy",
    },
  },
  "rolling-out": {
    outline: `
Cluster freelens-capi-rolling-out
  DevCluster freelens-capi-rolling-out-c8hvj (infrastructure cluster)
  KubeadmControlPlane freelens-capi-rolling-out-hsfpd
  Workers
    MachineDeployment freelens-capi-rolling-out-md-0-t96dp
      MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t
        Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
          DevMachine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n (infrastructure machine)
          KubeadmConfig freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
      MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62
      Templates
  ClusterClass quick-start
  Add-ons
  Health checks
`,
    collapsed: [
      "KubeadmControlPlane freelens-capi-rolling-out-hsfpd",
      "MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62",
      "Templates",
      "Add-ons",
      "Health checks",
    ],
    counts: {
      "Cluster freelens-capi-rolling-out": "25 objects: 2 Unhealthy, 1 Degraded, 18 Healthy, 4 with no health",
      "KubeadmControlPlane freelens-capi-rolling-out-hsfpd": "4 objects: 3 Healthy, 1 with no health",
      Workers: "14 objects: 2 Unhealthy, 1 Degraded, 9 Healthy, 2 with no health",
      "MachineDeployment freelens-capi-rolling-out-md-0-t96dp": "13 objects: 2 Unhealthy, 9 Healthy, 2 with no health",
      "MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t": "3 objects: 1 Unhealthy, 2 Healthy",
      "Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n": "2 objects: 2 Healthy",
      "MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62": "6 objects: 6 Healthy",
      Templates: "2 objects: 2 with no health",
      "Add-ons": "2 objects: 1 Healthy, 1 with no health",
      "Health checks": "2 objects: 2 Healthy",
    },
  },
  deleting: {
    outline: `
Cluster freelens-capi-deleting
  DevCluster freelens-capi-deleting-n2jlv (infrastructure cluster)
  KubeadmControlPlane freelens-capi-deleting-4kcdh
  Workers
    MachineDeployment freelens-capi-deleting-md-0-8dcql
      MachineSet freelens-capi-deleting-md-0-8dcql-vp49h
        Machine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw
          DevMachine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw (infrastructure machine)
          KubeadmConfig freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw
      Templates
        DevMachineTemplate freelens-capi-deleting-md-0-gq8t7 (template) [not found]
        KubeadmConfigTemplate freelens-capi-deleting-md-0-nddmd [not found]
  ClusterClass quick-start
  Health checks
`,
    collapsed: ["KubeadmControlPlane freelens-capi-deleting-4kcdh", "Health checks"],
    counts: {
      "Cluster freelens-capi-deleting": "15 objects: 2 not found, 9 Healthy, 4 with no health",
      "KubeadmControlPlane freelens-capi-deleting-4kcdh": "4 objects: 3 Healthy, 1 with no health",
      Workers: "7 objects: 2 not found, 2 Healthy, 3 with no health",
      "MachineDeployment freelens-capi-deleting-md-0-8dcql": "6 objects: 2 not found, 2 Healthy, 2 with no health",
      "MachineSet freelens-capi-deleting-md-0-8dcql-vp49h": "3 objects: 2 Healthy, 1 with no health",
      "Machine freelens-capi-deleting-md-0-8dcql-vp49h-nwsqw": "2 objects: 2 Healthy",
      Templates: "2 objects: 2 not found",
      "Health checks": "1 object: 1 Healthy",
    },
  },
};

// The searches of step 7 of the session, on the tree of `rolling-out` as it opens (P15): the words, how many nodes
// match, those whose own words hold them, never those whose counts alone do, and the rows that the search shows, the
// rows that match and the rows above them.
export interface ExpectedSearch {
  readonly words: string;
  readonly matches: number;
  readonly outline: string;
}

export const ROLLING_OUT_SEARCHES: readonly ExpectedSearch[] = [
  {
    words: "Unhealthy",
    matches: 2,
    outline: `
Cluster freelens-capi-rolling-out
  Workers
    MachineDeployment freelens-capi-rolling-out-md-0-t96dp
      MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t
        Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
`,
  },
  {
    words: "v1.37.0",
    matches: 10,
    outline: `
Cluster freelens-capi-rolling-out
  KubeadmControlPlane freelens-capi-rolling-out-hsfpd
    Machine freelens-capi-rolling-out-hsfpd-87hrn
  Workers
    MachineDeployment freelens-capi-rolling-out-md-0-t96dp
      MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t
        Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
      MachineSet freelens-capi-rolling-out-md-0-t96dp-xkg62
        Machine freelens-capi-rolling-out-md-0-t96dp-xkg62-kkdsc
        Machine freelens-capi-rolling-out-md-0-t96dp-xkg62-tfl6d
`,
  },
  {
    words: "freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n",
    matches: 3,
    outline: `
Cluster freelens-capi-rolling-out
  Workers
    MachineDeployment freelens-capi-rolling-out-md-0-t96dp
      MachineSet freelens-capi-rolling-out-md-0-t96dp-k525t
        Machine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
          DevMachine freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n (infrastructure machine)
          KubeadmConfig freelens-capi-rolling-out-md-0-t96dp-k525t-b5t8n
`,
  },
];

// The trees of the Cluster of `healthy` that the restricted session reads with a kind that the identity may not read
// in the namespace of `healthy`, or a definition that it may not get (SPEC-0005, "With a restricted identity", 6 to
// 9), every node expanded: the KubeadmConfigs refused, read under their Machines as not read and with the node of their
// kind under the Cluster, with no row under it; the Machines refused, the node of their kind holding the Machines that
// own the KubeadmConfigs of the set, each with its KubeadmConfig, and no DevMachine, whose kind only the Machines name;
// the ClusterResourceSetBindings refused, the node of their kind under the Cluster and the resource of the
// ClusterResourceSet not read; and the definition of the DevMachines refused, their nodes not read and the node of the
// kind, which stands for the DevMachines that no Machine names.
export const RESTRICTED_TREES: Readonly<Record<string, string>> = {
  "kubeadmconfigs-refused": `
Cluster freelens-capi-healthy
  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)
  KubeadmControlPlane freelens-capi-healthy-d2lgq
    Machine freelens-capi-healthy-d2lgq-zqlcx
      DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine)
      KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx [not read]
    Templates
      DevMachineTemplate freelens-capi-healthy-rclml (template)
  Workers
    MachineDeployment freelens-capi-healthy-md-0-m9x7h
      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [not read]
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine)
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 [not read]
      Templates
        DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)
        KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-healthy
  Health checks
    MachineHealthCheck freelens-capi-healthy-d2lgq
    MachineHealthCheck freelens-capi-healthy-md-0-m9x7h
  KubeadmConfigs [not read]
`,
  "machines-refused": `
Cluster freelens-capi-healthy
  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)
  KubeadmControlPlane freelens-capi-healthy-d2lgq
    Templates
      DevMachineTemplate freelens-capi-healthy-rclml (template)
  Workers
    MachineDeployment freelens-capi-healthy-md-0-m9x7h
      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb
      Templates
        DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)
        KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-healthy
  Health checks
    MachineHealthCheck freelens-capi-healthy-d2lgq
    MachineHealthCheck freelens-capi-healthy-md-0-m9x7h
  Machines [not read]
    Machine freelens-capi-healthy-d2lgq-zqlcx [not read]
      KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx
    Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg [not read]
      KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
    Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 [not read]
      KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
`,
  "bindings-refused": `
Cluster freelens-capi-healthy
  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)
  KubeadmControlPlane freelens-capi-healthy-d2lgq
    Machine freelens-capi-healthy-d2lgq-zqlcx
      DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine)
      KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx
    Templates
      DevMachineTemplate freelens-capi-healthy-rclml (template)
  Workers
    MachineDeployment freelens-capi-healthy-md-0-m9x7h
      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine)
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine)
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
      Templates
        DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)
        KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [not read]
  Health checks
    MachineHealthCheck freelens-capi-healthy-d2lgq
    MachineHealthCheck freelens-capi-healthy-md-0-m9x7h
  ClusterResourceSetBindings [not read]
`,
  "machine-definition-refused": `
Cluster freelens-capi-healthy
  DevCluster freelens-capi-healthy-8fgcf (infrastructure cluster)
  KubeadmControlPlane freelens-capi-healthy-d2lgq
    Machine freelens-capi-healthy-d2lgq-zqlcx
      DevMachine freelens-capi-healthy-d2lgq-zqlcx (infrastructure machine) [not read]
      KubeadmConfig freelens-capi-healthy-d2lgq-zqlcx
    Templates
      DevMachineTemplate freelens-capi-healthy-rclml (template)
  Workers
    MachineDeployment freelens-capi-healthy-md-0-m9x7h
      MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg (infrastructure machine) [not read]
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg
        Machine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
          DevMachine freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9 (infrastructure machine) [not read]
          KubeadmConfig freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9
      Templates
        DevMachineTemplate freelens-capi-healthy-md-0-xp9c7 (template)
        KubeadmConfigTemplate freelens-capi-healthy-md-0-2wh2v
  ClusterClass quick-start
  Add-ons
    ClusterResourceSet cni-kindnet
      ConfigMap cni-kindnet [applied]
    ClusterResourceSetBinding freelens-capi-healthy
  Health checks
    MachineHealthCheck freelens-capi-healthy-d2lgq
    MachineHealthCheck freelens-capi-healthy-md-0-m9x7h
  DevMachine objects [not read]
`,
};

// The writes of step 6 of the session, on the objects of `healthy` (SPEC-0005, "Tests", "In Freelens", 6), and what the
// tree of its Cluster says after each: the annotation `cluster.x-k8s.io/paused` on a worker Machine, which makes it
// Paused and stale, and the objects above it count it stale; a Machine with the labels of the Cluster and of its
// control plane and no owner, named to sort before `freelens-capi-healthy-d2lgq-zqlcx`, the Machine of the control
// plane of the set, whose infrastructure machine is not there; and the condition `Ready` `False` on another worker
// Machine, which makes it Unhealthy, and the objects above it count it.
export const LIVE_NAMESPACE = "freelens-capi-healthy";
export const PAUSED_WORKER = "freelens-capi-healthy-md-0-m9x7h-m5gtb-2xxxg";
export const NOT_READY_WORKER = "freelens-capi-healthy-md-0-m9x7h-m5gtb-5pzv9";
export const CREATED_MACHINE = "freelens-capi-healthy-d2lgq-a0000";

// The Machine that step 6 creates, as kubectl creates it.
export function createdMachine(): {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace: string; labels: Record<string, string> };
  spec: Record<string, unknown>;
} {
  return {
    apiVersion: "cluster.x-k8s.io/v1beta2",
    kind: "Machine",
    metadata: {
      name: CREATED_MACHINE,
      namespace: LIVE_NAMESPACE,
      labels: { "cluster.x-k8s.io/cluster-name": TREE_CLUSTERS.healthy, "cluster.x-k8s.io/control-plane": "" },
    },
    spec: {
      clusterName: TREE_CLUSTERS.healthy,
      bootstrap: { dataSecretName: CREATED_MACHINE },
      infrastructureRef: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevMachine", name: CREATED_MACHINE },
      version: "v1.37.0",
    },
  };
}

// The row that the created Machine adds, first under the KubeadmControlPlane (P7, P14), by its text: a node that a watch
// adds comes collapsed, since only the user expands once the tree is shown (P13), with the counts of what it holds, its
// infrastructure machine, which is not found (P11, P12).
export const CREATED_ROW = {
  text: `Machine ${CREATED_MACHINE}`,
  expanded: "false",
  counts: "1 object: 1 not found",
} as const;

// The row under the created Machine once the session expands it, by its text.
export const CREATED_CHILD = `DevMachine ${CREATED_MACHINE} (infrastructure machine) [not found]`;

// The condition `Ready` that step 6 writes on NOT_READY_WORKER through the status subresource, in place of its own.
export const NOT_READY = {
  type: "Ready",
  status: "False",
  reason: "NotReady",
  message: "Ready set to False by the session of the tree",
} as const;

// The counts of the nodes above a worker Machine (P11), by the texts of their rows: with the annotation on
// PAUSED_WORKER, and with the condition on NOT_READY_WORKER.
export const PAUSED_COUNTS: Readonly<Record<string, string>> = {
  "Cluster freelens-capi-healthy": "21 objects: 17 Healthy (1 stale), 4 with no health",
  Workers: "10 objects: 8 Healthy (1 stale), 2 with no health",
  "MachineDeployment freelens-capi-healthy-md-0-m9x7h": "9 objects: 7 Healthy (1 stale), 2 with no health",
  "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb": "6 objects: 6 Healthy (1 stale)",
};

export const NOT_READY_COUNTS: Readonly<Record<string, string>> = {
  "Cluster freelens-capi-healthy": "21 objects: 1 Unhealthy, 16 Healthy, 4 with no health",
  Workers: "10 objects: 1 Unhealthy, 7 Healthy, 2 with no health",
  "MachineDeployment freelens-capi-healthy-md-0-m9x7h": "9 objects: 1 Unhealthy, 6 Healthy, 2 with no health",
  "MachineSet freelens-capi-healthy-md-0-m9x7h-m5gtb": "6 objects: 1 Unhealthy, 5 Healthy",
};
