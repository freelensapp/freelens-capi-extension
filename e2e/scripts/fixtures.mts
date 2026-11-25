/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The fixtures of the first tier: sets of objects of Cluster API, each in a state that the views tell apart,
// captured from the second tier. A captured object loses what the API server adds, keeps every time as an
// offset from the moment of the capture, written from CAPTURE_TIME, and leaves out what SPEC-0001 A3 forbids
// showing; applied to the first tier, its times move to the moment of the run, its status is written through
// the status subresource, and a deleting object is held by the finalizer of the scripts. The functions here
// are pure; the commands that use them on a cluster are in commands.mts.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensure } from "./checks.mts";
import { parseDocuments, stringifyDocuments } from "./yaml.mts";

// The moment from which every fixture writes its times: each time of a captured object is this one plus its
// offset from the capture. The tests of the status model take it as their `now`.
export const CAPTURE_TIME = "2026-01-01T00:00:00Z";

// The finalizer that holds a deleting object of a fixture on the first tier, where no controller removes the
// finalizers of the project either; `fixtures-down` removes it, with every other one.
export const FIXTURE_FINALIZER = "test-environment.freelens.app/fixture";

export const FIXTURES_FOLDER = "integration/fixtures";

// The kinds of a fixture, each at the version that the extension requests, as kubectl names them: those of
// the core, of the kubeadm providers, of the development provider and of the inventory of clusterctl. The
// Secrets and the ConfigMaps of a state are not among them, and neither are the kinds without a namespace.
export const FIXTURE_RESOURCES = [
  "clusters.v1beta2.cluster.x-k8s.io",
  "clusterclasses.v1beta2.cluster.x-k8s.io",
  "machines.v1beta2.cluster.x-k8s.io",
  "machinesets.v1beta2.cluster.x-k8s.io",
  "machinedeployments.v1beta2.cluster.x-k8s.io",
  "machinepools.v1beta2.cluster.x-k8s.io",
  "machinehealthchecks.v1beta2.cluster.x-k8s.io",
  "machinedrainrules.v1beta2.cluster.x-k8s.io",
  "clusterresourcesets.v1beta2.addons.cluster.x-k8s.io",
  "clusterresourcesetbindings.v1beta2.addons.cluster.x-k8s.io",
  "ipaddresses.v1beta2.ipam.cluster.x-k8s.io",
  "ipaddressclaims.v1beta2.ipam.cluster.x-k8s.io",
  "kubeadmconfigs.v1beta2.bootstrap.cluster.x-k8s.io",
  "kubeadmconfigtemplates.v1beta2.bootstrap.cluster.x-k8s.io",
  "kubeadmcontrolplanes.v1beta2.controlplane.cluster.x-k8s.io",
  "kubeadmcontrolplanetemplates.v1beta2.controlplane.cluster.x-k8s.io",
  "devclusters.v1beta2.infrastructure.cluster.x-k8s.io",
  "devclustertemplates.v1beta2.infrastructure.cluster.x-k8s.io",
  "devmachines.v1beta2.infrastructure.cluster.x-k8s.io",
  "devmachinetemplates.v1beta2.infrastructure.cluster.x-k8s.io",
  "devmachinepools.v1beta2.infrastructure.cluster.x-k8s.io",
  "devmachinepooltemplates.v1beta2.infrastructure.cluster.x-k8s.io",
  "dockerclusters.v1beta2.infrastructure.cluster.x-k8s.io",
  "dockerclustertemplates.v1beta2.infrastructure.cluster.x-k8s.io",
  "dockermachines.v1beta2.infrastructure.cluster.x-k8s.io",
  "dockermachinetemplates.v1beta2.infrastructure.cluster.x-k8s.io",
  "dockermachinepools.v1beta2.infrastructure.cluster.x-k8s.io",
  "dockermachinepooltemplates.v1beta2.infrastructure.cluster.x-k8s.io",
  // The inventory of clusterctl, which has only this version and no status.
  "providers.v1alpha3.clusterctl.cluster.x-k8s.io",
] as const;

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid?: string;
  controller?: boolean;
  blockOwnerDeletion?: boolean;
}

export interface ObjectMetadata {
  name: string;
  namespace?: string;
  generation?: number;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  finalizers?: string[];
  ownerReferences?: OwnerReference[];
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  [field: string]: unknown;
}

// An object as the API server returns it, or as a fixture holds it.
export interface KubeObject {
  apiVersion: string;
  kind: string;
  metadata: ObjectMetadata;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [field: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The group of an API version, empty for the core group.
export function groupOf(apiVersion: string): string {
  return apiVersion.includes("/") ? apiVersion.split("/")[0] : "";
}

// An object by its group, kind, namespace and name, which is what an owner reference names in its namespace.
export function objectKey(object: {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string };
}) {
  return `${groupOf(object.apiVersion)}/${object.kind}/${object.metadata.namespace ?? ""}/${object.metadata.name}`;
}

// A time as Kubernetes writes it: RFC 3339, in seconds or with a fraction, in UTC or with an offset.
const TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const TIME_INSIDE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export function isTime(value: string): boolean {
  const match = TIME.exec(value);

  if (!match) return false;

  // A date that exists, which Date.parse would otherwise roll over, such as 30 February.
  const [year, month, day, hour, minute, second] = match[1].split(/[-T:]/).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

// A time moved by a whole number of seconds, written in UTC as Kubernetes writes it, with its fraction.
export function shiftTime(value: string, seconds: number): string {
  const match = TIME.exec(value);

  ensure(match && isTime(value) && Number.isInteger(seconds), `${value} is not a time that the scripts move`);

  const moved = new Date(Date.parse(`${match[1]}${match[3]}`) + seconds * 1000);

  ensure(!Number.isNaN(moved.getTime()), `${value} is not a time that the scripts move`);
  return `${moved.toISOString().slice(0, 19)}${match[2] ?? ""}Z`;
}

// A value with every time moved by a number of seconds: every string that is a time, wherever it is, keys
// left as they are.
export function shiftTimes<Value>(value: Value, seconds: number): Value {
  if (typeof value === "string") return (isTime(value) ? shiftTime(value, seconds) : value) as Value;
  if (Array.isArray(value)) return value.map((item) => shiftTimes(item, seconds)) as Value;
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftTimes(item, seconds)])) as Value;
  }
  return value;
}

// The paths of the strings that hold a time inside a text, which no shift reaches.
export function timesInsideText(value: unknown, path = ""): string[] {
  if (typeof value === "string") return !isTime(value) && TIME_INSIDE.test(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => timesInsideText(item, `${path}[${index}]`));
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => timesInsideText(item, `${path}.${key}`));
  return [];
}

// The seconds between two times.
export function secondsBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 1000);
}

// The order of two names by their code units, as `sort()` orders strings: the same in every locale, where
// `localeCompare` follows the language of the system, which can count two letters as one.
export function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The kubeadm configuration of each kind of the kubeadm providers that holds one, by its path in the object.
const KUBEADM_CONFIGURATIONS: Record<string, string[]> = {
  "bootstrap.cluster.x-k8s.io/KubeadmConfig": ["spec"],
  "bootstrap.cluster.x-k8s.io/KubeadmConfigTemplate": ["spec", "template", "spec"],
  "controlplane.cluster.x-k8s.io/KubeadmControlPlane": ["spec", "kubeadmConfigSpec"],
  "controlplane.cluster.x-k8s.io/KubeadmControlPlaneTemplate": ["spec", "template", "spec", "kubeadmConfigSpec"],
};

function at(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((item, key) => (isRecord(item) ? item[key] : undefined), value);
}

// Removes a field, and returns its path when it was there.
function leaveOut(parent: unknown, field: string, path: string): string[] {
  if (!isRecord(parent) || !(field in parent)) return [];
  delete parent[field];
  return [path];
}

// Leaves out of a kubeadm configuration what SPEC-0001 A3 forbids showing, the fields of R3.36 that hold a
// secret in the object itself: the content of a file, a password, the bootstrap tokens of the initialization,
// which each carry their token, the token of a discovery, and the credentials of a discovery by a kubeconfig
// file. Each of them is optional in the schema, an entry of bootstrapTokens apart, which goes whole. Returns
// the paths it left out, from `where`.
function leaveOutOfKubeadmConfiguration(configuration: unknown, where: string): string[] {
  if (!isRecord(configuration)) return [];

  const files = Array.isArray(configuration.files) ? configuration.files : [];
  const users = Array.isArray(configuration.users) ? configuration.users : [];
  const discovery = at(configuration, ["joinConfiguration", "discovery"]);
  const user = at(discovery, ["file", "kubeConfig", "user"]);

  return [
    ...files.flatMap((file, index) => leaveOut(file, "content", `${where}.files[${index}].content`)),
    ...users.flatMap((entry, index) => leaveOut(entry, "passwd", `${where}.users[${index}].passwd`)),
    ...leaveOut(configuration.initConfiguration, "bootstrapTokens", `${where}.initConfiguration.bootstrapTokens`),
    ...leaveOut(
      at(discovery, ["bootstrapToken"]),
      "token",
      `${where}.joinConfiguration.discovery.bootstrapToken.token`,
    ),
    ...leaveOut(discovery, "tlsBootstrapToken", `${where}.joinConfiguration.discovery.tlsBootstrapToken`),
    ...leaveOut(
      at(user, ["authProvider"]),
      "config",
      `${where}.joinConfiguration.discovery.file.kubeConfig.user.authProvider.config`,
    ),
    ...leaveOut(at(user, ["exec"]), "env", `${where}.joinConfiguration.discovery.file.kubeConfig.user.exec.env`),
  ];
}

// Every number under a key named observedGeneration in a status: of the status itself, of each condition,
// and of the conditions a provider keeps for another version of the contract.
function observedGenerations(value: unknown, change?: (generation: number) => number): number[] {
  if (Array.isArray(value)) return value.flatMap((item) => observedGenerations(item, change));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    if (key === "observedGeneration" && typeof item === "number") {
      if (change) value[key] = change(item);
      return [item];
    }
    return observedGenerations(item, change);
  });
}

// The generation of an object kept as an offset too: the lowest generation that the first tier can give it,
// 1, or 2 for a deleting object, whose deletion the API server counts as a change, raised by the distance
// from its generation to the lowest one its status observed; every observed generation moves with it, so
// that each one is as far from the generation as in the capture. A generation of 1 is left out, as the API
// server writes it on creation.
export function normalizeGeneration(object: KubeObject): void {
  const generation = object.metadata.generation;

  if (generation === undefined) return;

  const observed = observedGenerations(object.status);
  const lowest = Math.min(generation, ...observed);

  ensure(
    observed.every((value) => value <= generation),
    `${objectKey(object)} observed a generation after its own, ${generation}`,
  );

  const normalized = Math.max(object.metadata.deletionTimestamp ? 2 : 1, 1 + generation - lowest);

  observedGenerations(object.status, (value) => value + normalized - generation);
  if (normalized === 1) delete object.metadata.generation;
  else object.metadata.generation = normalized;
}

// What kubelet reports of the machine that runs it, which for a node of the development provider is the
// machine of the capture, shared by every container on it: the version of its kernel, the identifier of its
// boot, and its swap. The schema requires the first two, which a fixture writes as these values.
export const HOST_KERNEL = "6.12.0-test-environment";
export const HOST_BOOT_ID = "00000000-0000-4000-8000-000000000000";

// The controllers of DevMachineTemplates and of DockerMachineTemplates write into `status.capacity` the
// processors and the memory of the Docker host, which for the real project of the test environment is the
// machine of the capture (test/infrastructure/docker/internal/controllers/devmachinetemplate_controller.go:65-88).
// A fixture writes these values in their place, the same for every template.
export const HOST_CAPACITY: Readonly<Record<string, string>> = { cpu: "4", memory: "8Gi" };

// The kinds whose status holds the capacity of the Docker host.
const HOST_CAPACITY_KINDS = new Set([
  "infrastructure.cluster.x-k8s.io/DevMachineTemplate",
  "infrastructure.cluster.x-k8s.io/DockerMachineTemplate",
]);

// Whether an object is of a kind whose status holds the capacity of the Docker host.
export function holdsHostCapacity(object: KubeObject): boolean {
  return HOST_CAPACITY_KINDS.has(`${groupOf(object.apiVersion)}/${object.kind}`);
}

// Replaces what the machine of the capture tells of itself, and nothing else: the kernel and the boot in the
// Node information of a Machine, whose swap it leaves out, and the capacity of a machine template. The
// identifiers of the machine and of the system, which kind makes for each container, and the architecture,
// which names only a family of processors, are kept.
function withoutTheHost(object: KubeObject): void {
  const nodeInfo = object.status?.nodeInfo;

  if (holdsHostCapacity(object) && isRecord(object.status?.capacity)) {
    object.status.capacity = { ...HOST_CAPACITY };
  }
  if (!isRecord(nodeInfo)) return;
  nodeInfo.kernelVersion = HOST_KERNEL;
  nodeInfo.bootID = HOST_BOOT_ID;
  delete nodeInfo.swap;
}

// The annotation where kubectl keeps the last configuration it applied, which can hold any field of the
// object, those that A3 forbids showing included.
const LAST_APPLIED = "kubectl.kubernetes.io/last-applied-configuration";

// A captured object, as a fixture holds it: without what the API server adds (its identifier, its version,
// its managed fields, the identifier of each owner, the grace period of a deletion, the finalizer of the
// scripts), with its generation as normalizeGeneration says, without what the machine of the capture told its
// Nodes, without the fields that SPEC-0001 A3 forbids showing, and with every time moved by `seconds`, from
// the moment of the capture to CAPTURE_TIME. A Secret is refused. Returns the object and the paths of what it
// left out of A3.
export function cleanObject(captured: KubeObject, seconds: number): { object: KubeObject; leftOut: string[] } {
  ensure(captured.kind !== "Secret", `${objectKey(captured)} is a Secret, which no fixture holds`);

  const object = structuredClone(captured);
  const { metadata } = object;

  for (const field of ["uid", "resourceVersion", "managedFields", "selfLink", "deletionGracePeriodSeconds"]) {
    delete metadata[field];
  }
  if (metadata.annotations) {
    delete metadata.annotations[LAST_APPLIED];
    if (!Object.keys(metadata.annotations).length) delete metadata.annotations;
  }
  if (metadata.finalizers) {
    metadata.finalizers = metadata.finalizers.filter((finalizer) => finalizer !== FIXTURE_FINALIZER);
    if (!metadata.finalizers.length) delete metadata.finalizers;
  }
  for (const owner of metadata.ownerReferences ?? []) delete owner.uid;
  normalizeGeneration(object);
  withoutTheHost(object);

  const path = KUBEADM_CONFIGURATIONS[`${groupOf(object.apiVersion)}/${object.kind}`];
  const leftOut = path ? leaveOutOfKubeadmConfiguration(at(object, path), path.join(".")) : [];

  return { object: shiftTimes(object, seconds), leftOut };
}

// The objects of a fixture in the order of their creation: each level holds the objects whose owners are in
// the levels before it, so that the first tier gives every owner its identifier before its dependents name
// it. An owner that is not in the set, and a cycle of owners, are refused.
export function creationLevels<Item extends KubeObject>(objects: readonly Item[]): Item[][] {
  const keys = new Set(objects.map(objectKey));
  const ownersOf = (object: KubeObject) =>
    (object.metadata.ownerReferences ?? []).map((owner) =>
      objectKey({ apiVersion: owner.apiVersion, kind: owner.kind, metadata: { ...object.metadata, name: owner.name } }),
    );

  for (const object of objects) {
    for (const owner of ownersOf(object)) {
      ensure(keys.has(owner), `${objectKey(object)} is owned by ${owner}, which the fixture does not hold`);
    }
  }

  const levels: Item[][] = [];
  const created = new Set<string>();
  let left = [...objects];

  while (left.length) {
    const level = left.filter((object) => ownersOf(object).every((owner) => created.has(owner)));

    ensure(level.length, `The owners of ${left.map(objectKey).join(", ")} make a cycle`);
    for (const object of level) created.add(objectKey(object));
    levels.push(level);
    left = left.filter((object) => !level.includes(object));
  }
  return levels;
}

// A field that the first tier can change back and forth to give an object a generation above 1, which the API
// server sets on creation and raises with each change of the spec, by kind: an optional field that no rule of
// the definition keeps from changing and that the schema does not default, which the scripts set to a value
// that the schema accepts, or unset. The captures need one for these kinds alone, and an apply refuses a set
// that needs one for another.
const GENERATION_TOGGLES: Record<string, { path: string[]; other: (value: unknown) => unknown }> = {
  "cluster.x-k8s.io/Cluster": { path: ["spec", "paused"], other: (value) => (value === true ? undefined : true) },
  "cluster.x-k8s.io/Machine": {
    path: ["spec", "minReadySeconds"],
    other: (value) => (value === undefined ? 0 : undefined),
  },
  // The development provider writes the provider ID of a DevMachine into its spec once it has created it.
  "infrastructure.cluster.x-k8s.io/DevMachine": {
    path: ["spec", "backend", "docker", "bootstrapTimeout"],
    other: (value) => (value === undefined ? "5m0s" : undefined),
  },
};

// What the first tier does with an object of a fixture: create `create`, then make each change of `changes`
// to its spec, which each raise its generation by one, then write `status` through the status subresource,
// then delete it when `deleting`, which raises its generation once more. Its times are moved by the seconds
// from CAPTURE_TIME to the moment of the run.
export interface AppliedObject {
  key: string;
  create: KubeObject;
  changes: Record<string, unknown>[];
  status?: Record<string, unknown>;
  deleting: boolean;
}

// A copy of a value with the field at `path` set, or removed when the value is undefined.
function withField(value: unknown, path: readonly string[], field: unknown): Record<string, unknown> {
  const copy: Record<string, unknown> = isRecord(value) ? { ...value } : {};
  const [key, ...rest] = path;

  if (rest.length) copy[key] = withField(copy[key], rest, field);
  else if (field === undefined) delete copy[key];
  else copy[key] = field;
  return copy;
}

// The merge patch that sets the field at `path`, or removes it when the value is undefined.
function patchOf(path: readonly string[], field: unknown): Record<string, unknown> {
  return path.reduceRight<unknown>((value, key) => ({ [key]: value }), field ?? null) as Record<string, unknown>;
}

// How the first tier gets an object of a fixture to the state of the file: its times moved by `seconds`, what
// only the API server sets (its times of creation and deletion, its generation) left to the API server, the
// finalizer of the scripts added to a deleting object, and the changes that give it the generation of the
// file.
export function applyPlan(fixture: KubeObject, seconds: number): AppliedObject {
  const object = shiftTimes(fixture, seconds);
  const { status, ...rest } = object;
  const deleting = object.metadata.deletionTimestamp !== undefined;
  const create: KubeObject = { ...rest, metadata: { ...object.metadata } };
  const generation = object.metadata.generation ?? 1;
  const changesNeeded = generation - 1 - (deleting ? 1 : 0);
  const changes: Record<string, unknown>[] = [];

  for (const field of ["creationTimestamp", "deletionTimestamp", "generation"]) delete create.metadata[field];
  if (deleting) create.metadata.finalizers = [...(create.metadata.finalizers ?? []), FIXTURE_FINALIZER];
  ensure(changesNeeded >= 0, `${objectKey(fixture)} has generation ${generation}, below what its deletion gives it`);
  if (changesNeeded > 0) {
    const toggle = GENERATION_TOGGLES[`${groupOf(fixture.apiVersion)}/${fixture.kind}`];

    ensure(
      toggle,
      `${objectKey(fixture)} has generation ${generation}, which the scripts cannot give a ${fixture.kind} on the first tier`,
    );

    const value = at(create, toggle.path);
    const other = toggle.other(value);
    const [top, ...rest] = toggle.path;

    // The value of the file is the last one: an odd number of changes starts from the other value.
    if (changesNeeded % 2 === 1) create[top] = withField(create[top], rest, other);
    for (let change = 1; change <= changesNeeded; change++) {
      changes.push(patchOf(toggle.path, (changesNeeded - change) % 2 === 0 ? value : other));
    }
  }
  return { key: objectKey(fixture), create, changes, status, deleting };
}

// The objects that kubectl printed in JSON: one, a List, or several one after the other, as it prints the
// objects of a list that it created.
export function printedObjects(text: string): KubeObject[] {
  const values: unknown[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      if (depth === 0) start = index;
      depth++;
    } else if (character === "}" || character === "]") {
      depth--;
      if (depth === 0) values.push(JSON.parse(text.slice(start, index + 1)));
    } else {
      ensure(depth > 0 || /\s/.test(character), "kubectl printed something other than JSON");
    }
  }
  ensure(depth === 0 && !inString, "kubectl printed JSON that does not end");
  return values.flatMap((value) =>
    isRecord(value) && value.kind === "List" && Array.isArray(value.items)
      ? (value.items as KubeObject[])
      : [value as KubeObject],
  );
}

// The paths where two values differ.
export function differences(expected: unknown, actual: unknown, path = ""): string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return [`${path}: ${expected.length} items, and ${actual.length} read back`];
    return expected.flatMap((item, index) => differences(item, actual[index], `${path}[${index}]`));
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();

    return keys.flatMap((key) => differences(expected[key], actual[key], `${path}.${key}`));
  }
  return Object.is(expected, actual)
    ? []
    : [`${path}: ${JSON.stringify(expected)}, and ${JSON.stringify(actual)} read back`];
}

// The differences between the objects of a fixture set and those read back from the first tier: an object
// missing or one that the set does not hold, and every field that differs, apart from the times of creation
// and of deletion, which the API server writes at the moment of the run; that an object is deleting still
// counts.
export function roundTripDifferences(expected: readonly KubeObject[], actual: readonly KubeObject[]): string[] {
  const comparable = (object: KubeObject) => {
    const copy = structuredClone(object);

    delete copy.metadata.creationTimestamp;
    copy.metadata.deletionTimestamp = copy.metadata.deletionTimestamp ? "set by the API server" : undefined;
    return copy;
  };
  const read = new Map(actual.map((object) => [objectKey(object), object]));
  const found: string[] = [];

  for (const object of expected) {
    const key = objectKey(object);
    const back = read.get(key);

    if (!back) {
      found.push(`${key}: not read back`);
      continue;
    }
    read.delete(key);
    found.push(...differences(comparable(object), comparable(back)).map((path) => `${key}${path}`));
  }
  for (const key of read.keys()) found.push(`${key}: read back, and not in the fixture set`);
  return found;
}

// The name of the file of a kind in a fixture set.
export function fileOf(object: KubeObject): string {
  return `${object.kind.toLowerCase()}.yaml`;
}

// Objects in the order of their names, as a file of a fixture set holds them.
export function inNameOrder<Item extends KubeObject>(objects: readonly Item[]): Item[] {
  return [...objects].sort((a, b) => byCodeUnits(a.metadata.name, b.metadata.name));
}

// The files of a fixture set, by name: one per kind, with its objects in the order of their names.
export function fixtureFiles(objects: readonly KubeObject[]): Map<string, string> {
  const byFile = new Map<string, KubeObject[]>();

  for (const object of objects) byFile.set(fileOf(object), [...(byFile.get(fileOf(object)) ?? []), object]);
  return new Map(
    [...byFile.entries()]
      .sort(([a], [b]) => byCodeUnits(a, b))
      .map(([file, items]) => [file, stringifyDocuments(inNameOrder(items))]),
  );
}

// The objects of a fixture set, from the YAML files of its folder.
export function readFixtureSet(folder: string): KubeObject[] {
  const objects = readdirSync(folder)
    .filter((file) => file.endsWith(".yaml") && !file.startsWith("."))
    .sort()
    .flatMap((file) => parseDocuments(readFileSync(join(folder, file), "utf8")) as unknown as KubeObject[]);

  for (const object of objects) {
    ensure(
      typeof object.apiVersion === "string" &&
        typeof object.kind === "string" &&
        isRecord(object.metadata) &&
        typeof object.metadata.name === "string",
      `An object of ${folder} has no apiVersion, kind or name`,
    );
  }
  return objects;
}
