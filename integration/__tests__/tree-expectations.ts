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
// The set `no-status` holds no IPAddressClaim of its Cluster until its capture gives its claim `spec.clusterName`
// (SPEC-0005, P21); the unit case of P21 writes that field meanwhile.

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
