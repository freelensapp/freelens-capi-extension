// S7 of SPEC-0001 tried on the real project (SPEC-0003, "With the real project: S7", P32): a test of the real tier of
// SPEC-0002, which the job of the real project of test-environment.yaml runs before it takes the environment down,
// and nothing else runs (docs/development/TESTING.md, "Tests of the real tier"). It reaches the cluster of the real
// project through the scripts of the test environment, which check it before every request and refuse any other,
// and writes to it alone, in a namespace of its own that it deletes at the end with its objects:
//
// 1. a server-side dry run of a Cluster with neither reference nor topology;
// 2. a Cluster with an infrastructure reference only, labelled for kindnet, which the ClusterResourceSet of the
//    namespace applies, with one control plane Machine of its own;
// 3. a Cluster with a control plane reference only, to a KubeadmControlPlane of one replica.
//
// It reads the namespace every five seconds until case 2 settles and the watch of s7-expectations.ts ends, then
// checks every reading against what the trial by hand saw. Outside CI it skips with a warning when the real project
// is not up; in CI (`CI` set) it fails instead.

import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, it } from "vitest";
import { openRealProject } from "../../e2e/scripts/commands.mts";
import { S7, s7Clusters, s7ClusterWithNoReference } from "../../e2e/scripts/manifests.mts";
import { readNamespace } from "../../e2e/scripts/states.mts";
import { conditionOf } from "../status-views";
import { expectCase1, expectCase2, expectCase3, SETTLE_SECONDS, WATCH_SECONDS } from "./s7-expectations";

import type { RealProjectSession } from "../../e2e/scripts/commands.mts";
import type { OwnerReference } from "../../e2e/scripts/fixtures.mts";
import type { S7Reading } from "./s7-expectations";

const SECOND = 1000;
const READ_EVERY = 5 * SECOND;
const CLUSTER = "clusters.v1beta2.cluster.x-k8s.io";

async function open(): Promise<RealProjectSession | undefined> {
  try {
    return await openRealProject();
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn(`S7 is skipped: the real project cannot be reached through the scripts: ${(error as Error).message}`);
    return undefined;
  }
}

const project = await open();

function list(items: readonly unknown[]): string {
  return JSON.stringify({ apiVersion: "v1", kind: "List", items });
}

function namespaceExists(session: RealProjectSession): boolean {
  return session.kubectl(["get", "namespace", S7.namespace, "--ignore-not-found", "--output", "name"]).trim() !== "";
}

// Removes the namespace of the trial, the Clusters first, so that their controllers take their workload clusters
// down, as a capture removes its own (TESTING.md, "Safety"): the trial by hand saw them gone in 19 seconds.
function removeNamespace(session: RealProjectSession): void {
  if (!namespaceExists(session)) return;
  session.kubectl(["delete", CLUSTER, "--all", "--namespace", S7.namespace, "--wait", "--timeout", "300s"], {
    timeout: 6 * 60 * SECOND,
  });
  session.kubectl(["delete", "namespace", S7.namespace, "--wait", "--timeout", "300s"], { timeout: 6 * 60 * SECOND });
}

// Case 1: the server-side dry run, which stores nothing. Its refusal, as kubectl reports it; empty when it is
// accepted, which the expectation refuses.
function dryRunOfNoReference(session: RealProjectSession): string {
  try {
    session.kubectl(["create", "--dry-run=server", "--output", "name", "--filename", "-"], {
      input: JSON.stringify(s7ClusterWithNoReference()),
    });
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

// The owners of the Secret of the kubeconfig of a Cluster, by its name and its metadata alone; undefined when there
// is none. Its content is never read.
function kubeconfigOwners(session: RealProjectSession, cluster: string): OwnerReference[] | undefined {
  const [name, owners = ""] = session
    .kubectl([
      ...["get", "secret", `${cluster}-kubeconfig`, "--namespace", S7.namespace, "--ignore-not-found"],
      ...["--output", 'jsonpath={.metadata.name}{"\\n"}{.metadata.ownerReferences}'],
    ])
    .split("\n");

  if (name.trim() === "") return undefined;
  return owners.trim() === "" ? [] : (JSON.parse(owners) as OwnerReference[]);
}

function readTrial(session: RealProjectSession): S7Reading {
  const at = Date.now();

  return {
    at,
    objects: readNamespace(session.kubectl, S7.namespace),
    kubeconfigs: Object.fromEntries(
      [S7.infrastructureOnly, S7.controlPlaneOnly].map((cluster) => [cluster, kubeconfigOwners(session, cluster)]),
    ),
  };
}

// Whether the watch of a reading is over: case 2 has settled, its probe succeeded and its control plane initialized,
// and WATCH_SECONDS have passed since the creation of both Clusters, as the API server wrote it.
function watched(reading: S7Reading): boolean {
  const clusters = [S7.infrastructureOnly, S7.controlPlaneOnly].map((name) =>
    reading.objects.find((object) => object.kind === "Cluster" && object.metadata.name === name),
  );
  const [infrastructure] = clusters;

  return (
    clusters.every(
      (cluster) =>
        cluster !== undefined &&
        reading.at - Date.parse(String(cluster.metadata.creationTimestamp)) >= WATCH_SECONDS * SECOND,
    ) &&
    infrastructure !== undefined &&
    conditionOf(infrastructure, "RemoteConnectionProbe")?.status === "True" &&
    conditionOf(infrastructure, "ControlPlaneInitialized")?.status === "True"
  );
}

// Reads the namespace until the watch is over, or until the time that the trial justifies has passed, when the
// expectations say what was missing.
async function watch(session: RealProjectSession, readings: S7Reading[], from: number): Promise<void> {
  const deadline = from + (SETTLE_SECONDS + WATCH_SECONDS) * SECOND;

  for (;;) {
    const reading = readTrial(session);

    readings.push(reading);
    if (watched(reading) || reading.at >= deadline) return;
    await delay(READ_EVERY);
  }
}

describe.skipIf(project === undefined)("S7 on the real project", () => {
  const session = project as RealProjectSession;
  const readings: S7Reading[] = [];
  let refusal = "";

  beforeAll(
    async () => {
      // A namespace left by a run that was killed goes first.
      removeNamespace(session);
      session.kubectl(["create", "namespace", S7.namespace]);
      // The ClusterResourceSet of kindnet selects the Clusters of its own namespace only
      // (core/reconcilers/clusterresourceset/clusterresourceset_controller.go:276), so the trial has its own, as each
      // capture of the fixtures has.
      session.apply(session.kindnet(S7.namespace));
      refusal = dryRunOfNoReference(session);

      const from = Date.now();

      session.kubectl(["create", "--filename", "-"], { input: list(s7Clusters(session.kubernetesVersion)) });
      await watch(session, readings, from);
    },
    (SETTLE_SECONDS + WATCH_SECONDS + 7 * 60) * SECOND,
  );

  afterAll(
    () => {
      try {
        removeNamespace(session);
      } finally {
        session.close();
      }
    },
    15 * 60 * SECOND,
  );

  it("case 1: a Cluster with neither reference nor topology is refused by the webhook of Cluster, and nothing is written", () => {
    expectCase1(refusal, readings);
  });

  it("case 2: an infrastructure reference only: never available, Unknown once the probe succeeds, and Idle once its control plane is initialized", () => {
    expectCase2(readings);
  });

  it("case 3: a control plane reference only: Unhealthy, Provisioning for good, and Scaling up for good with no endpoint", () => {
    expectCase3(readings);
  });
});
