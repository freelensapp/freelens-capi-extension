/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the scripts of the test environment give kind, kubectl and clusterctl: made from the pinned files of
// the projects, and, for the states of the fixtures that no template of a release gives, objects that the
// scripts write from the schemas of the release.

import { ensure } from "./checks.mts";

import type { ClusterApiAsset } from "./pins.mts";

// The definitions of a file of a release, each one as its text: every document whose top-level kind is
// CustomResourceDefinition, unchanged, with its conversion webhook and its labels. The files of the releases
// are written by kustomize, which separates the documents with a `---` line and writes the top-level keys of
// each at the start of a line.
export function customResourceDefinitions(text: string): string[] {
  return text
    .split(/^---[ \t]*$/m)
    .filter((document) => {
      const kinds = [...document.matchAll(/^kind:[ \t]*(\S+)[ \t]*$/gm)].map((match) => match[1]);

      ensure(kinds.length <= 1, `A document of a release file has ${kinds.length} kinds`);
      return kinds[0] === "CustomResourceDefinition";
    })
    .map((document) => {
      ensure(
        /^apiVersion:[ \t]*apiextensions\.k8s\.io\/v1[ \t]*$/m.test(document),
        "A definition of a release file is not apiextensions.k8s.io/v1",
      );
      return `${document.replace(/^\n/, "").replace(/\n*$/, "")}\n`;
    });
}

// The CIDRs of the pods of the workload clusters, those of the configuration of the tests of Cluster API for
// the development provider (`test/e2e/config/docker.yaml` at the tag): the IPv4 one is the default of the
// templates of the release, and kindnet routes both.
export const WORKLOAD_POD_CIDRS = { ipv4: "192.168.0.0/16", ipv6: "fd00:100:96::/48" } as const;

// The network add-on of the workload clusters: the kindnet manifest of the tests of Cluster API, with the
// CIDRs in place of its two variables.
export function kindnetManifest(text: string): string {
  const variables = {
    "${DOCKER_POD_CIDRS}": WORKLOAD_POD_CIDRS.ipv4,
    "${DOCKER_POD_IPV6_CIDRS}": WORKLOAD_POD_CIDRS.ipv6,
  };
  let manifest = text;

  for (const [variable, value] of Object.entries(variables)) {
    ensure(manifest.includes(variable), `kindnet.yaml does not have ${variable}`);
    manifest = manifest.replaceAll(variable, value);
  }
  ensure(!manifest.includes("${"), "kindnet.yaml has a variable that the scripts do not set");
  return manifest;
}

// The configuration of a kind cluster of one node, as JSON, which kind reads as YAML. The node of the
// real project mounts the socket of Docker, where the development provider creates the workload clusters.
export function kindConfiguration(dockerSocket: boolean): string {
  const node = dockerSocket
    ? {
        role: "control-plane",
        extraMounts: [{ hostPath: "/var/run/docker.sock", containerPath: "/var/run/docker.sock" }],
      }
    : { role: "control-plane" };

  return `${JSON.stringify({ kind: "Cluster", apiVersion: "kind.x-k8s.io/v1alpha4", nodes: [node] }, null, 2)}\n`;
}

// The label of the Clusters that get kindnet: the selector of the ClusterResourceSet, and the label that the
// scripts give a workload cluster, as `kubectl label` takes it.
export const KINDNET_LABEL = { key: "cni", value: "kindnet" } as const;

export function kindnetLabelArgument(): string {
  return `${KINDNET_LABEL.key}=${KINDNET_LABEL.value}`;
}

// The ConfigMap with the kindnet manifest, and the ClusterResourceSet that applies it, once, to every
// Cluster of the namespace that has the label of kindnet.
export function kindnetResources(manifest: string, namespace: string): string {
  const items = [
    {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "cni-kindnet", namespace },
      data: { "kindnet.yaml": manifest },
    },
    {
      apiVersion: "addons.cluster.x-k8s.io/v1beta2",
      kind: "ClusterResourceSet",
      metadata: { name: "cni-kindnet", namespace },
      spec: {
        strategy: "ApplyOnce",
        clusterSelector: { matchLabels: { [KINDNET_LABEL.key]: KINDNET_LABEL.value } },
        resources: [{ kind: "ConfigMap", name: "cni-kindnet" }],
      },
    },
  ];

  return JSON.stringify({ apiVersion: "v1", kind: "List", items });
}

// A provider of the local repository of clusterctl: its name and type for clusterctl, and the label of its
// folder, `{repository}/{label}/{version}/{components file}`, which clusterctl requires to be the label it
// gives the provider.
export interface RepositoryProvider {
  name: string;
  type: "CoreProvider" | "BootstrapProvider" | "ControlPlaneProvider" | "InfrastructureProvider";
  label: string;
  // An asset of the release, so that the type check refuses a name that the pins do not have.
  components: ClusterApiAsset;
}

export const PROVIDERS: readonly RepositoryProvider[] = [
  { name: "cluster-api", type: "CoreProvider", label: "cluster-api", components: "core-components.yaml" },
  { name: "kubeadm", type: "BootstrapProvider", label: "bootstrap-kubeadm", components: "bootstrap-components.yaml" },
  {
    name: "kubeadm",
    type: "ControlPlaneProvider",
    label: "control-plane-kubeadm",
    components: "control-plane-components.yaml",
  },
  {
    name: "docker",
    type: "InfrastructureProvider",
    label: "infrastructure-docker",
    components: "infrastructure-components-development.yaml",
  },
];

// The configuration of clusterctl, as JSON, which it reads as YAML: every provider and cert-manager from the
// local repository, where the scripts put the files they checked, and an overrides folder of their own, so
// that no override of the user applies.
export function clusterctlConfiguration(
  repository: string,
  overrides: string,
  versions: { clusterApi: string; certManager: string },
): string {
  return `${JSON.stringify(
    {
      providers: PROVIDERS.map((provider) => ({
        name: provider.name,
        type: provider.type,
        url: `${repository}/${provider.label}/${versions.clusterApi}/${provider.components}`,
      })),
      "cert-manager": { url: `${repository}/cert-manager/${versions.certManager}/cert-manager.yaml` },
      overridesFolder: overrides,
    },
    null,
    2,
  )}\n`;
}

const CORE = "cluster.x-k8s.io";
const ADDONS = "addons.cluster.x-k8s.io";
const BOOTSTRAP = "bootstrap.cluster.x-k8s.io";
const CONTROL_PLANE = "controlplane.cluster.x-k8s.io";
const INFRASTRUCTURE = "infrastructure.cluster.x-k8s.io";
const IPAM = "ipam.cluster.x-k8s.io";

// A Kubernetes object of a kind at v1beta2 of its group.
function object(group: string, kind: string, name: string, namespace: string, fields: Record<string, unknown>) {
  return { apiVersion: `${group}/v1beta2`, kind, metadata: { name, namespace }, ...fields };
}

function reference(apiGroup: string, kind: string, name: string) {
  return { apiGroup, kind, name };
}

// The arguments of kubelet that the templates of the release give the nodes of the development provider: no
// eviction for a disk that is fuller than the defaults of kubelet allow, as kind does for its own nodes.
const KUBELET_ARGUMENTS = [
  { name: "eviction-hard", value: "nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%" },
];

// The network of a workload cluster: the CIDRs of the templates of the release.
const CLUSTER_NETWORK = {
  pods: { cidrBlocks: [WORKLOAD_POD_CIDRS.ipv4] },
  services: { cidrBlocks: ["10.128.0.0/12"] },
  serviceDomain: "cluster.local",
};

// A workload cluster without a managed topology, which no template of the release makes: a Cluster that names
// its infrastructure and its control plane, one control plane Machine of a KubeadmControlPlane and two worker
// Machines of a MachineDeployment, of the development provider, with the label of kindnet.
export function clusterWithoutTopology(name: string, namespace: string, version: string): unknown[] {
  const controlPlane = `${name}-control-plane`;
  const workers = `${name}-md-0`;

  return [
    object(CORE, "Cluster", name, namespace, {
      metadata: { name, namespace, labels: { [KINDNET_LABEL.key]: KINDNET_LABEL.value } },
      spec: {
        clusterNetwork: CLUSTER_NETWORK,
        infrastructureRef: reference(INFRASTRUCTURE, "DevCluster", name),
        controlPlaneRef: reference(CONTROL_PLANE, "KubeadmControlPlane", controlPlane),
      },
    }),
    object(INFRASTRUCTURE, "DevCluster", name, namespace, { spec: { backend: { docker: {} } } }),
    object(INFRASTRUCTURE, "DevMachineTemplate", controlPlane, namespace, {
      spec: { template: { spec: { backend: { docker: {} } } } },
    }),
    object(CONTROL_PLANE, "KubeadmControlPlane", controlPlane, namespace, {
      spec: {
        replicas: 1,
        version,
        machineTemplate: { spec: { infrastructureRef: reference(INFRASTRUCTURE, "DevMachineTemplate", controlPlane) } },
        kubeadmConfigSpec: {
          initConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } },
          joinConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } },
        },
      },
    }),
    object(INFRASTRUCTURE, "DevMachineTemplate", workers, namespace, {
      spec: { template: { spec: { backend: { docker: {} } } } },
    }),
    object(BOOTSTRAP, "KubeadmConfigTemplate", workers, namespace, {
      spec: {
        template: { spec: { joinConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } } } },
      },
    }),
    object(CORE, "MachineDeployment", workers, namespace, {
      spec: {
        clusterName: name,
        replicas: 2,
        selector: { matchLabels: { [`${CORE}/deployment-name`]: workers } },
        template: {
          metadata: { labels: { [`${CORE}/deployment-name`]: workers } },
          spec: {
            clusterName: name,
            version,
            bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfigTemplate", workers) },
            infrastructureRef: reference(INFRASTRUCTURE, "DevMachineTemplate", workers),
          },
        },
      },
    }),
  ];
}

// The provider ID that kubelet gives the Node of a Machine that never finds it: the Machine looks for its own,
// which the development provider sets on a Node only when the Node has none.
export const FOREIGN_PROVIDER_ID = "test-environment:///a-node-of-no-machine";

// A MachineSet of one Machine, apart from the topology of its Cluster, whose Node registers with a provider ID
// that is not the one of its Machine, so that the Machine, provisioned, never gets a Node.
export function machineSetWithoutNode(cluster: string, namespace: string, version: string): unknown[] {
  const name = `${cluster}-without-node`;

  return [
    object(BOOTSTRAP, "KubeadmConfigTemplate", name, namespace, {
      spec: {
        template: {
          spec: {
            joinConfiguration: {
              nodeRegistration: {
                kubeletExtraArgs: [...KUBELET_ARGUMENTS, { name: "provider-id", value: FOREIGN_PROVIDER_ID }],
              },
            },
          },
        },
      },
    }),
    object(INFRASTRUCTURE, "DevMachineTemplate", name, namespace, {
      spec: { template: { spec: { backend: { docker: {} } } } },
    }),
    object(CORE, "MachineSet", name, namespace, {
      spec: {
        clusterName: cluster,
        replicas: 1,
        selector: { matchLabels: { [`${CORE}/set-name`]: name } },
        template: {
          metadata: { labels: { [`${CORE}/set-name`]: name } },
          spec: {
            clusterName: cluster,
            version,
            bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfigTemplate", name) },
            infrastructureRef: reference(INFRASTRUCTURE, "DevMachineTemplate", name),
          },
        },
      },
    }),
  ];
}

// One object of each kind of the fixtures, those that have a status and those that have none, but the Docker
// kinds of the development provider, which no template of the release uses, as a user writes it: no controller
// has reconciled one of them, so none has a status yet. They make one Cluster without a topology, whose parts
// name each other, and its ClusterClass, with a fictitious pool of addresses.
export function objectsWithoutStatus(
  name: string,
  namespace: string,
  versions: { kubernetes: string; clusterApi: string },
): unknown[] {
  const version = versions.kubernetes;
  const controlPlane = `${name}-control-plane`;
  const workers = `${name}-md-0`;
  const pool = `${name}-mp-0`;
  const machine = `${name}-machine-0`;
  const set = `${name}-set`;
  const addresses = reference("ipam.test-environment.freelens.app", "AddressPool", name);
  const machineSpec = (bootstrap: string, infrastructure: string) => ({
    clusterName: name,
    version,
    bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfigTemplate", bootstrap) },
    infrastructureRef: reference(INFRASTRUCTURE, "DevMachineTemplate", infrastructure),
  });

  return [
    ...clusterWithoutTopology(name, namespace, version),
    object(CORE, "MachineSet", set, namespace, {
      spec: {
        clusterName: name,
        replicas: 1,
        selector: { matchLabels: { [`${CORE}/set-name`]: set } },
        template: { metadata: { labels: { [`${CORE}/set-name`]: set } }, spec: machineSpec(workers, workers) },
      },
    }),
    object(CORE, "Machine", machine, namespace, {
      spec: {
        clusterName: name,
        version,
        bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfig", machine) },
        infrastructureRef: reference(INFRASTRUCTURE, "DevMachine", machine),
      },
    }),
    object(BOOTSTRAP, "KubeadmConfig", machine, namespace, {
      spec: { joinConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } } },
    }),
    object(INFRASTRUCTURE, "DevMachine", machine, namespace, { spec: { backend: { docker: {} } } }),
    object(CORE, "MachinePool", pool, namespace, {
      spec: {
        clusterName: name,
        replicas: 1,
        template: {
          spec: {
            clusterName: name,
            version,
            bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfig", pool) },
            infrastructureRef: reference(INFRASTRUCTURE, "DevMachinePool", pool),
          },
        },
      },
    }),
    object(BOOTSTRAP, "KubeadmConfig", pool, namespace, {
      spec: { joinConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } } },
    }),
    object(INFRASTRUCTURE, "DevMachinePool", pool, namespace, { spec: { backend: { docker: {} } } }),
    object(INFRASTRUCTURE, "DevMachinePoolTemplate", pool, namespace, {
      spec: { template: { spec: { backend: { docker: {} } } } },
    }),
    object(INFRASTRUCTURE, "DevClusterTemplate", name, namespace, {
      spec: { template: { spec: { backend: { docker: {} } } } },
    }),
    object(CONTROL_PLANE, "KubeadmControlPlaneTemplate", controlPlane, namespace, {
      spec: {
        template: {
          spec: {
            kubeadmConfigSpec: {
              initConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } },
              joinConfiguration: { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } },
            },
          },
        },
      },
    }),
    object(CORE, "ClusterClass", name, namespace, {
      spec: {
        controlPlane: {
          templateRef: {
            apiVersion: `${CONTROL_PLANE}/v1beta2`,
            kind: "KubeadmControlPlaneTemplate",
            name: controlPlane,
          },
          machineInfrastructure: {
            templateRef: { apiVersion: `${INFRASTRUCTURE}/v1beta2`, kind: "DevMachineTemplate", name: controlPlane },
          },
        },
        infrastructure: {
          templateRef: { apiVersion: `${INFRASTRUCTURE}/v1beta2`, kind: "DevClusterTemplate", name },
        },
        workers: {
          machineDeployments: [
            {
              class: "default-worker",
              bootstrap: {
                templateRef: { apiVersion: `${BOOTSTRAP}/v1beta2`, kind: "KubeadmConfigTemplate", name: workers },
              },
              infrastructure: {
                templateRef: { apiVersion: `${INFRASTRUCTURE}/v1beta2`, kind: "DevMachineTemplate", name: workers },
              },
            },
          ],
        },
      },
    }),
    object(CORE, "MachineHealthCheck", workers, namespace, {
      spec: {
        clusterName: name,
        selector: { matchLabels: { [`${CORE}/deployment-name`]: workers } },
        checks: {
          nodeStartupTimeoutSeconds: 600,
          unhealthyNodeConditions: [{ type: "Ready", status: "Unknown", timeoutSeconds: 300 }],
        },
      },
    }),
    object(CORE, "MachineDrainRule", name, namespace, {
      spec: { drain: { behavior: "Skip" }, machines: [{ selector: {} }], pods: [{ selector: {} }] },
    }),
    object(ADDONS, "ClusterResourceSet", name, namespace, {
      spec: {
        clusterSelector: { matchLabels: { [KINDNET_LABEL.key]: KINDNET_LABEL.value } },
        resources: [{ kind: "ConfigMap", name: `${name}-add-on` }],
      },
    }),
    object(ADDONS, "ClusterResourceSetBinding", name, namespace, { spec: { clusterName: name } }),
    object(IPAM, "IPAddressClaim", name, namespace, { spec: { poolRef: addresses } }),
    object(IPAM, "IPAddress", name, namespace, {
      spec: { address: "10.0.0.10", prefix: 24, gateway: "10.0.0.1", claimRef: { name }, poolRef: addresses },
    }),
    {
      apiVersion: "clusterctl.cluster.x-k8s.io/v1alpha3",
      kind: "Provider",
      metadata: { name: "infrastructure-docker", namespace },
      providerName: "docker",
      type: "InfrastructureProvider",
      version: versions.clusterApi,
    },
  ];
}
