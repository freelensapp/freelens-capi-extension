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

// The definitions of a chart, from the files of the folder `crds` that its archive holds, unchanged, since helm does
// not template that folder, the files in the order of their paths: what the CI of the Sveltos extension applies of the
// chart of Sveltos (SPEC-0004, P29). A chart with no definition there is refused.
export function chartDefinitions(files: ReadonlyMap<string, Uint8Array>, chart: string): string[] {
  const folder = `${chart}/crds/`;
  const definitions = [...files.keys()]
    .filter((path) => path.startsWith(folder) && /\.ya?ml$/.test(path))
    .sort()
    .flatMap((path) => customResourceDefinitions(Buffer.from(files.get(path) ?? []).toString("utf8")));

  ensure(definitions.length, `The chart ${chart} has no definition in its folder crds`);
  return definitions;
}

// The name of a definition, from its text: the `name` of its `metadata`, `<plural>.<group>`, the name that kubectl
// applies and deletes it by. The keys of `metadata` are those at the indentation of its first line, two spaces or
// four, as the chart of Sveltos writes them. A session takes the names before it applies the definitions, so that its
// end deletes them also when the apply failed half way.
export function definitionName(definition: string): string {
  const metadata = /^metadata:[ \t]*\n((?:(?:[ \t]+[^\n]*|[ \t]*)\n)*)/m.exec(definition)?.[1] ?? "";
  const indent = /^( +)\S/m.exec(metadata)?.[1];
  const name =
    indent === undefined
      ? undefined
      : new RegExp(`^${indent}name:[ \\t]*["']?([a-z0-9][a-z0-9.-]*)["']?[ \\t]*$`, "m").exec(metadata)?.[1];

  ensure(name, "A definition has no name in its metadata");
  return name;
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

// The Kamaji control plane provider of the cluster of the captures (SPEC-0028, P3), in the local repository of
// clusterctl under the label that clusterctl gives it, with the files of its own release.
export const KAMAJI_PROVIDER = {
  name: "kamaji",
  type: "ControlPlaneProvider",
  label: "control-plane-kamaji",
  components: "control-plane-components.yaml",
} as const;

// The configuration of clusterctl, as JSON, which it reads as YAML: every provider and cert-manager from the
// local repository, where the scripts put the files they checked, and an overrides folder of their own, so
// that no override of the user applies. With the version of the Kamaji control plane provider, it names that
// provider too, for the cluster of the captures.
export function clusterctlConfiguration(
  repository: string,
  overrides: string,
  versions: { clusterApi: string; certManager: string; kamaji?: string },
): string {
  const kamaji = versions.kamaji
    ? [
        {
          name: KAMAJI_PROVIDER.name,
          type: KAMAJI_PROVIDER.type,
          url: `${repository}/${KAMAJI_PROVIDER.label}/${versions.kamaji}/${KAMAJI_PROVIDER.components}`,
        },
      ]
    : [];

  return `${JSON.stringify(
    {
      providers: [
        ...PROVIDERS.map((provider) => ({
          name: provider.name,
          type: provider.type,
          url: `${repository}/${provider.label}/${versions.clusterApi}/${provider.components}`,
        })),
        ...kamaji,
      ],
      "cert-manager": { url: `${repository}/cert-manager/${versions.certManager}/cert-manager.yaml` },
      overridesFolder: overrides,
    },
    null,
    2,
  )}\n`;
}

// The label by which clusterctl names the provider of each component that it installs, and by which the views find
// the controllers of a kind from its definition (SPEC-0003, P24).
const PROVIDER_LABEL = "cluster.x-k8s.io/provider";

// The definitions of a file of a release, each one as its text, with the label of PROVIDER_LABEL that clusterctl gives
// the components that it installs in place of the one of the release, as `control-plane-kamaji` for the `kamaji` of the
// release of the Kamaji control plane provider (SPEC-0028, P8). A definition with no such label among those of its
// metadata, or with it twice, is refused.
export function relabeledDefinitions(text: string, provider: string): string[] {
  return customResourceDefinitions(text).map((definition) => {
    const metadata = /^metadata:[ \t]*\n((?:(?:[ \t]+[^\n]*|[ \t]*)\n)*)/m.exec(definition);
    const label = new RegExp(`^([ \\t]+${PROVIDER_LABEL.replaceAll(".", "\\.")}:[ \\t]*)\\S+[ \\t]*$`, "gm");
    const found = [...(metadata?.[1] ?? "").matchAll(label)];

    ensure(
      metadata && found.length === 1,
      `The definition ${definitionName(definition)} does not have one label ${PROVIDER_LABEL} in its metadata`,
    );

    const start = metadata.index + metadata[0].length - metadata[1].length;

    return `${definition.slice(0, start)}${metadata[1].replace(label, `$1${provider}`)}${definition.slice(start + metadata[1].length)}`;
  });
}

// The address of the one address pool of MetalLB of the cluster of the captures, from the IPv4 subnet of the network
// of kind: 56 below its end, far from the addresses that Docker gives its containers from its start, as the probes
// took `<prefix>.255.200` of a /16 (SPEC-0028, P3, P4). A subnet that is not IPv4, or smaller than a /24, is refused.
export function poolAddress(subnet: string): string {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(subnet);
  const octets = match?.slice(1, 5).map(Number) ?? [];
  const prefix = Number(match?.[5]);

  ensure(
    match && octets.every((octet) => octet <= 255) && prefix >= 8 && prefix <= 24,
    `${subnet} is not an IPv4 subnet of a /24 or larger, which the pool of MetalLB takes an address of`,
  );

  const network = (octets.reduce((value, octet) => value * 256 + octet, 0) >>> (32 - prefix)) * 2 ** (32 - prefix);
  const address = network + 2 ** (32 - prefix) - 56;

  return [24, 16, 8, 0].map((shift) => Math.floor(address / 2 ** shift) % 256).join(".");
}

// The pool of MetalLB of the cluster of the captures, of one address, and the L2 advertisement of it: objects of the
// scripts, which give every tenant of Kamaji of type LoadBalancer that one address, known before the tenant exists
// (SPEC-0028, P3, P4).
export const METALLB_NAMESPACE = "metallb-system";
export const METALLB_POOL = "freelens-capi-kamaji";

export function metallbPool(address: string): string {
  return JSON.stringify({
    apiVersion: "v1",
    kind: "List",
    items: [
      {
        apiVersion: "metallb.io/v1beta1",
        kind: "IPAddressPool",
        metadata: { name: METALLB_POOL, namespace: METALLB_NAMESPACE },
        spec: { addresses: [`${address}/32`] },
      },
      {
        apiVersion: "metallb.io/v1beta1",
        kind: "L2Advertisement",
        metadata: { name: METALLB_POOL, namespace: METALLB_NAMESPACE },
        spec: { ipAddressPools: [METALLB_POOL] },
      },
    ],
  });
}

// The port of the API server of a tenant of Kamaji, the default of a TenantControlPlane, which the provider writes in
// the endpoint of its KamajiControlPlane.
export const TENANT_PORT = 6443;

// The address of the Service of CoreDNS of a tenant, in the service network of the Cluster (CLUSTER_NETWORK).
const TENANT_DNS_SERVICE = "10.128.0.10";

// A Cluster of Kamaji of the captures of SPEC-0028 (P1, P4), written from the schemas of the releases, as the probes
// wrote theirs: a DevCluster as its infrastructure cluster, with the endpoint of the tenant written when `address` is
// given, and a KamajiControlPlane of one replica, its Service of type LoadBalancer, the DataStore `default` of the chart
// of Kamaji, and the addons CoreDNS, with the address of its Service in the service network of the Cluster, and
// kube-proxy, which the kind does not default; with a worker, a MachineDeployment of one replica of the development
// provider, with the label of kindnet on the Cluster.
export function kamajiCluster(
  name: string,
  namespace: string,
  options: { version: string; address?: string; worker: boolean },
): unknown[] {
  const workers = `${name}-md-0`;
  const deployment = { [`${CORE}/cluster-name`]: name, [`${CORE}/deployment-name`]: workers };

  return [
    object(CORE, "Cluster", name, namespace, {
      metadata: {
        name,
        namespace,
        ...(options.worker ? { labels: { [KINDNET_LABEL.key]: KINDNET_LABEL.value } } : {}),
      },
      spec: {
        clusterNetwork: CLUSTER_NETWORK,
        controlPlaneRef: reference(CONTROL_PLANE, "KamajiControlPlane", name),
        infrastructureRef: reference(INFRASTRUCTURE, "DevCluster", name),
      },
    }),
    object(INFRASTRUCTURE, "DevCluster", name, namespace, {
      spec: {
        ...(options.address ? { controlPlaneEndpoint: { host: options.address, port: TENANT_PORT } } : {}),
        backend: { docker: {} },
      },
    }),
    {
      apiVersion: `${CONTROL_PLANE}/v1alpha2`,
      kind: "KamajiControlPlane",
      metadata: { name, namespace },
      spec: {
        dataStoreName: "default",
        addons: { coreDNS: { dnsServiceIPs: [TENANT_DNS_SERVICE] }, kubeProxy: {} },
        kubelet: { cgroupfs: "systemd", preferredAddressTypes: ["InternalIP"] },
        network: { serviceType: "LoadBalancer" },
        replicas: 1,
        version: options.version,
      },
    },
    ...(options.worker
      ? [
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
              replicas: 1,
              selector: { matchLabels: deployment },
              template: {
                metadata: { labels: deployment },
                spec: {
                  clusterName: name,
                  version: options.version,
                  bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfigTemplate", workers) },
                  infrastructureRef: reference(INFRASTRUCTURE, "DevMachineTemplate", workers),
                },
              },
            },
          }),
        ]
      : []),
  ];
}

// The name of the ResourceQuota of the scripts that holds a state of the captures of SPEC-0028 (P5).
export const QUOTA_NAME = "test-environment";

// A ResourceQuota on Pods of the scripts in the namespace of a state, which allows `pods` Pods: the one that the tenant
// has, so that its Deployment can make no Pod of a scale or of a rollout, or none, so that it has no ready replica
// (SPEC-0028, P5; L24).
export function podQuota(namespace: string, pods: number): string {
  return JSON.stringify({
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: { name: QUOTA_NAME, namespace },
    spec: { hard: { pods: String(pods) } },
  });
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

// One object of each kind of the fixtures, those that have a status and those that have none, two of
// DevMachineTemplate and of KubeadmConfig, and none of the Docker kinds of the development provider, which no
// template of the release uses, as a user writes it: no controller has reconciled one of them, so none has a
// status yet. They make one Cluster without a topology, whose parts name each other, and its ClusterClass, with
// a fictitious pool of addresses, and a claim of an address of that Cluster, which names it in `spec.clusterName`, as
// a user writes a claim of a Cluster (SPEC-0005, P21).
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
    object(IPAM, "IPAddressClaim", name, namespace, { spec: { clusterName: name, poolRef: addresses } }),
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

// The trial of S7 of SPEC-0001 on the real project (SPEC-0003, "With the real project: S7", P32): a namespace of its
// own, and two workload clusters in it, named as the scripts name theirs, which `down` deletes with the others.
export const S7 = {
  namespace: "freelens-capi-s7",
  // Case 1: a Cluster with neither reference nor topology, only ever sent as a server-side dry run.
  noReference: "freelens-capi-s7-no-reference",
  // Case 2: an infrastructure reference only, and one control plane Machine of its own.
  infrastructureOnly: "freelens-capi-s7-infra-only",
  // Case 3: a control plane reference only, to a KubeadmControlPlane of one replica.
  controlPlaneOnly: "freelens-capi-s7-cp-only",
} as const;

// Case 1 of S7: a Cluster with neither `spec.controlPlaneRef`, `spec.infrastructureRef` nor `spec.topology`, which
// the webhook of Cluster refuses (core/webhooks/admission/cluster.go:183-191). Its `spec` has a field, its network:
// one with no field is refused before, by the schema, whose `spec` has `minProperties: 1`.
export function s7ClusterWithNoReference(): unknown {
  return object(CORE, "Cluster", S7.noReference, S7.namespace, { spec: { clusterNetwork: CLUSTER_NETWORK } });
}

// Cases 2 and 3 of S7, written from the schemas of the release, with the end-to-end test of the project that adopts
// a control plane Machine as a reference for their shape only
// (test/e2e/data/infrastructure-docker/main/cluster-template-kcp-adoption/step1/cluster-with-cp0.yaml):
// - a Cluster with `spec.infrastructureRef` to a DevCluster, no `spec.controlPlaneRef` and no topology, with the label
//   of kindnet, and one control plane Machine with its KubeadmConfig and its DevMachine;
// - a Cluster with `spec.controlPlaneRef` to a KubeadmControlPlane of one replica, no `spec.infrastructureRef` and no
//   topology.
export function s7Clusters(version: string): unknown[] {
  const { namespace, infrastructureOnly: infrastructure, controlPlaneOnly: controlPlane } = S7;
  const machine = `${infrastructure}-control-plane-0`;
  const controlPlaneLabel = { [`${CORE}/control-plane`]: "" };
  const nodeRegistration = { nodeRegistration: { kubeletExtraArgs: KUBELET_ARGUMENTS } };

  return [
    object(INFRASTRUCTURE, "DevCluster", infrastructure, namespace, { spec: { backend: { docker: {} } } }),
    object(CORE, "Cluster", infrastructure, namespace, {
      metadata: { name: infrastructure, namespace, labels: { [KINDNET_LABEL.key]: KINDNET_LABEL.value } },
      spec: {
        clusterNetwork: CLUSTER_NETWORK,
        infrastructureRef: reference(INFRASTRUCTURE, "DevCluster", infrastructure),
      },
    }),
    object(INFRASTRUCTURE, "DevMachine", machine, namespace, {
      metadata: { name: machine, namespace, labels: controlPlaneLabel },
      spec: { backend: { docker: {} } },
    }),
    object(BOOTSTRAP, "KubeadmConfig", machine, namespace, {
      metadata: { name: machine, namespace, labels: controlPlaneLabel },
      spec: { initConfiguration: nodeRegistration },
    }),
    object(CORE, "Machine", machine, namespace, {
      metadata: { name: machine, namespace, labels: controlPlaneLabel },
      spec: {
        clusterName: infrastructure,
        version,
        bootstrap: { configRef: reference(BOOTSTRAP, "KubeadmConfig", machine) },
        infrastructureRef: reference(INFRASTRUCTURE, "DevMachine", machine),
      },
    }),
    object(INFRASTRUCTURE, "DevMachineTemplate", controlPlane, namespace, {
      spec: { template: { spec: { backend: { docker: {} } } } },
    }),
    object(CONTROL_PLANE, "KubeadmControlPlane", controlPlane, namespace, {
      spec: {
        replicas: 1,
        version,
        machineTemplate: { spec: { infrastructureRef: reference(INFRASTRUCTURE, "DevMachineTemplate", controlPlane) } },
        kubeadmConfigSpec: { initConfiguration: nodeRegistration, joinConfiguration: nodeRegistration },
      },
    }),
    object(CORE, "Cluster", controlPlane, namespace, {
      spec: {
        clusterNetwork: CLUSTER_NETWORK,
        controlPlaneRef: reference(CONTROL_PLANE, "KubeadmControlPlane", controlPlane),
      },
    }),
  ];
}
