/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The stores that the page of the Clusters reads (SPEC-0004, "What the view reads", P1 to P3, P19): the store of the
// host for the Clusters, those of the kinds of the context that the cluster serves, those of the operator included
// (P2), each reached through its model, and those of the kinds of control plane that the references of the Clusters
// name, at the version that the contract of their definition gives (P3), found by kind and version among the APIs
// that the host registers. A kind that the cluster does not serve has no API, which the page tells with no request.
// Each store of the host comes once, however many kinds or references name it.

import { Renderer } from "@freelensapp/extensions";
import { resolveReference } from "../../common/views/references";
import { Cluster } from "../api/cluster/cluster-v1beta2";
import {
  ClusterClass,
  KubeadmControlPlane,
  Machine,
  MachineDeployment,
  MachineHealthCheck,
  MachinePool,
  MachineSet,
  OPERATOR_MODELS,
} from "../api/context/context-models";

import type { KindDescriptor, KindFeeds } from "../../common/views/read-state";
import type { ContractReference, ResolvedReference } from "../../common/views/references";
import type { ContextModel } from "../api/context/context-models";
import type { DefinitionReads } from "./definitions";
import type { HostStore } from "./store-adapter";

type HostObject = Renderer.K8sApi.KubeObject;

// A store of the host as the page reads it: through its adapter, and its items for the context of the model.
export type PageStore = HostStore<HostObject> & { readonly items: readonly HostObject[] };

type AnyStore = PageStore;

// A kind that the page reads, with its store when the cluster serves it.
export interface ReadKind extends KindDescriptor {
  readonly store: AnyStore | undefined;
}

// The kinds of the context, by model, with what the status model takes from each and the plural of its sentences.
const CONTEXT_KINDS: readonly (readonly [ContextModel, string, KindFeeds])[] = [
  [Machine, "Machines", "machines"],
  [MachineSet, "MachineSets", "machine-sets"],
  [MachineDeployment, "MachineDeployments", "parts"],
  [MachinePool, "MachinePools", "machine-pools"],
  [KubeadmControlPlane, "KubeadmControlPlanes", "parts"],
  [MachineHealthCheck, "MachineHealthChecks", "health-checks"],
  [ClusterClass, "ClusterClasses", "cluster-class"],
  ...OPERATOR_MODELS.map((model) => [model, `${model.kind}s`, "controllers"] as const),
];

// The store of the host for a model, when the host registered its API: `getStore()` throws for a kind that the
// cluster does not serve, as the page of a kind of the template expects.
export function storeOfModel(model: { getStore(): unknown }): AnyStore | undefined {
  try {
    return (model.getStore() as AnyStore | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

function descriptorOf(
  store: AnyStore | undefined,
  kind: string,
  noun: string,
  feeds: KindFeeds,
  group: string,
  resource: string,
): ReadKind {
  return { store, kind, noun, feeds, group, resource };
}

export function clustersKind(store: AnyStore): ReadKind & { readonly store: AnyStore } {
  return {
    store,
    kind: Cluster.kind,
    noun: "Clusters",
    feeds: "rows",
    group: "cluster.x-k8s.io",
    resource: Cluster.crd.plural,
  };
}

export interface ContextKinds {
  readonly machines: ReadKind;
  readonly machineSets: ReadKind;
  readonly machineDeployments: ReadKind;
  readonly machinePools: ReadKind;
  readonly kubeadmControlPlanes: ReadKind;
  readonly healthChecks: ReadKind;
  readonly clusterClasses: ReadKind;
  readonly operator: readonly ReadKind[];
}

export function contextKinds(): ContextKinds {
  const [
    machines,
    machineSets,
    machineDeployments,
    machinePools,
    kubeadmControlPlanes,
    healthChecks,
    clusterClasses,
    ...operator
  ] = CONTEXT_KINDS.map(([model, noun, feeds]) =>
    descriptorOf(
      storeOfModel(model),
      model.kind,
      noun,
      feeds,
      model.crd.apiVersions[0].split("/")[0],
      model.crd.plural,
    ),
  );

  return {
    machines,
    machineSets,
    machineDeployments,
    machinePools,
    kubeadmControlPlanes,
    healthChecks,
    clusterClasses,
    operator,
  };
}

// A kind of control plane that the references of the Clusters name, resolved through its definition.
export interface ControlPlaneKind extends ReadKind {
  readonly resolution: ResolvedReference;
}

// The kinds of control plane that the Clusters name, by `group/kind`, each with its store at the version of its
// contract when the host registered an API for it.
export function controlPlaneKinds(
  references: readonly ContractReference[],
  definitions: DefinitionReads,
): Map<string, ControlPlaneKind> {
  const kinds = new Map<string, ControlPlaneKind>();

  for (const reference of references) {
    const id = `${reference.apiGroup}/${reference.kind}`;

    if (kinds.has(id)) continue;

    const resolution = resolveReference(reference, definitions.readOf(reference.apiGroup, reference.kind));
    let store: AnyStore | undefined;

    if (resolution.state === "resolved") {
      const api = Renderer.K8sApi.apiManager.getApiByKind(reference.kind, resolution.apiVersion);

      store = api === undefined ? undefined : (Renderer.K8sApi.apiManager.getStore(api) as AnyStore | undefined);
    }
    kinds.set(id, {
      ...descriptorOf(
        store,
        reference.kind,
        `${reference.kind} objects`,
        "parts",
        reference.apiGroup,
        resolution.state === "resolved" ? resolution.plural : reference.kind.toLowerCase(),
      ),
      resolution,
    });
  }
  return kinds;
}

// Each store of the host once, in the order in which the page names them.
export function uniqueStores(kinds: readonly ReadKind[]): AnyStore[] {
  return [...new Set(kinds.map((kind) => kind.store).filter((store): store is AnyStore => store !== undefined))];
}
