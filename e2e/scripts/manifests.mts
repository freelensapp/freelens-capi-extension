/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the scripts of the test environment give kind, kubectl and clusterctl, made from the pinned files of
// the projects and from nothing else.

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
