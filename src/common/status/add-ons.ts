/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rule of a ClusterResourceSet, and its binding, which has no status (SPEC-0003, "The rule of each kind",
// ClusterResourceSet; SPEC-0001, R2.84, R2.85, R3.17 and H1).
//
// `ResourcesApplied` sums it up, with its bindings (P12). The project sets it `True` with a resource missing, and
// records that resource only by the absence of an entry in the binding of the Cluster (R2.84), while a failed apply
// records `applied` false. So a ClusterResourceSet whose `ResourcesApplied` is `True` is Degraded when, in a binding
// that holds an entry for it, a resource of its `spec.resources` has no entry or has `applied` false, and Healthy
// otherwise, with the result Cluster by Cluster. With no entry in any binding and no `ResourcesApplied`, it is
// Unknown, with the note that it applied to no Cluster; without the bindings from the view, its health rests on
// `ResourcesApplied` alone, with the note that they were not read.
//
// The controller writes the entry of a Cluster before it tries to reach it, and reports one that it cannot reach
// yet as `ResourcesApplied` `False` `InternalError`, the reason it also writes when it cannot list the Clusters or
// read a resource: the ClusterResourceSet then reads Unhealthy, as the project says (D1).

import { conditionOf } from "./conditions";
import { fieldOf, readFields, readFlag, readList, readText, UNREADABLE } from "./fields";
import { identityOf, noStatusRule, unknownHealth, wordOf } from "./health";

import type { Fields, Unreadable } from "./fields";
import type { AppliedToCluster, HealthBasis, HealthInput, HealthOutcome, Issue, KindRule, Note } from "./health";
import type { BindingInput } from "./types";

interface Resource {
  readonly kind: string;
  readonly name: string;
}

type ResourceState = AppliedToCluster["resources"][number];

// A list of objects, each read as fields; unreadable when the list or one of its entries is.
function readEntries(value: unknown): readonly Fields[] | Unreadable {
  const list = readList(value);
  const entries: Fields[] = [];

  if (list === UNREADABLE) return UNREADABLE;
  for (const entry of list ?? []) {
    const fields = readFields(entry);

    if (fields === undefined || fields === UNREADABLE) return UNREADABLE;
    entries.push(fields);
  }
  return entries;
}

// A kind and a name, as `spec.resources` and the entries of a binding name a resource.
function resourceOf(fields: Fields): Resource | Unreadable {
  const kind = readText(fields.kind);
  const name = readText(fields.name);

  return typeof kind === "string" && typeof name === "string" ? { kind, name } : UNREADABLE;
}

function resourcesOf(input: HealthInput): readonly Resource[] | Unreadable {
  const entries = readEntries(fieldOf(input.spec, "resources"));
  const resources = entries === UNREADABLE ? [] : entries.map(resourceOf);

  return entries === UNREADABLE || resources.includes(UNREADABLE) ? UNREADABLE : (resources as Resource[]);
}

// What the binding of one Cluster records for a resource: missing without an entry, else its `applied`.
function stateOf(resource: Resource, recorded: readonly Fields[]): ResourceState | Unreadable {
  const entry = recorded.find((fields) => {
    const named = resourceOf(fields);

    return named !== UNREADABLE && named.kind === resource.kind && named.name === resource.name;
  });
  const applied = readFlag(entry?.applied);

  if (applied === UNREADABLE) return UNREADABLE;
  return { ...resource, state: entry === undefined ? "missing" : applied === true ? "applied" : "not applied" };
}

// What the binding of one Cluster records for the ClusterResourceSet: undefined when it holds no entry for it.
function appliedTo(
  input: BindingInput,
  owner: string,
  resources: readonly Resource[],
): AppliedToCluster | undefined | Unreadable {
  const spec = readFields(input.binding.spec);
  const cluster = readText(fieldOf(spec, "clusterName"));
  const entries = readEntries(fieldOf(spec, "bindings"));

  if (spec === UNREADABLE || cluster === UNREADABLE || entries === UNREADABLE) return UNREADABLE;

  const entry = entries.find((fields) => readText(fields.clusterResourceSetName) === owner);
  const recorded = readEntries(entry?.resources);

  if (entry === undefined) return undefined;
  if (recorded === UNREADABLE) return UNREADABLE;

  const states = resources.map((resource) => stateOf(resource, recorded));

  return states.includes(UNREADABLE) ? UNREADABLE : { cluster, resources: states as ResourceState[] };
}

function clusterResourceSetHealth(input: HealthInput): HealthOutcome {
  const condition = conditionOf(input.conditions, "ResourcesApplied");
  const resources = resourcesOf(input);
  const bindings = input.context.bindings;
  const owner = identityOf(input.object).name;

  if (resources === UNREADABLE) {
    return { health: unknownHealth(), notes: [{ code: "field-unreadable", field: "spec.resources" }] };
  }
  if (bindings === undefined) {
    const restsOn: HealthBasis = { form: "bindings", condition, clusters: undefined };

    return {
      health: { health: wordOf(condition, []), restsOn, issues: [] },
      notes: [{ code: "input-not-given", input: "bindings" }],
    };
  }

  const clusters: AppliedToCluster[] = [];

  for (const binding of bindings) {
    const applied = owner === undefined ? undefined : appliedTo(binding, owner, resources);

    if (applied === UNREADABLE) {
      return { health: unknownHealth(), notes: [{ code: "field-unreadable", field: "bindings.spec.bindings" }] };
    }
    if (applied !== undefined) clusters.push(applied);
  }

  const restsOn: HealthBasis = { form: "bindings", condition, clusters };
  const issues: Issue[] = clusters.flatMap(({ cluster, resources: states }) =>
    states
      .filter(({ state }) => state !== "applied")
      .map(({ kind, name, state }) => ({
        form: "resource",
        cluster,
        kind,
        name,
        state: state as "not applied" | "missing",
      })),
  );
  const notes: Note[] = condition === undefined && clusters.length === 0 ? [{ code: "applied-to-no-cluster" }] : [];

  return { health: { health: wordOf(condition, issues), restsOn, issues }, notes };
}

export const CLUSTER_RESOURCE_SET_RULE: KindRule = {
  kind: "ClusterResourceSet",
  apiVersion: "addons.cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["ResourcesApplied"],
  provider: "cluster-api",
  pause: "object",
  observedGeneration: "status",
  followsWorkloadCluster: false,
  deprecatedFailure: false,
  health: clusterResourceSetHealth,
};

export const CLUSTER_RESOURCE_SET_BINDING_RULE: KindRule = noStatusRule(
  "ClusterResourceSetBinding",
  "addons.cluster.x-k8s.io/v1beta2",
);
