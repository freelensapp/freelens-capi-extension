// The rules of a ClusterClass and of an ExtensionConfig (SPEC-0003, "Tests", "Unit", and "The rule of each kind",
// ClusterClass and ExtensionConfig; P8; SPEC-0001, R2.33 to R2.37): what sums each up, what makes it Degraded, an
// older generation, which is a mark and, for a class, says that the topology of its Clusters is held, and the pause
// that each honours from its own annotation alone. The ClusterClass comes from the fixtures of SPEC-0002
// (test/status-objects.ts); the fixtures have no ExtensionConfig, since the test environment runs without RuntimeSDK,
// so its object is written from the schema of the release.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  noStatus,
  paused,
  withCondition,
  withMetadata,
  withoutCondition,
  withStatus,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { KubeObjectData } from "./index";

function statusIn(object: KubeObjectData) {
  return statusOf(object, contextOf());
}

const extensionConfig = {
  apiVersion: "runtime.cluster.x-k8s.io/v1beta2",
  kind: "ExtensionConfig",
  metadata: { name: "test-extension", generation: 1, creationTimestamp: "2025-12-31T23:58:00Z" },
  spec: {},
  status: {
    conditions: [
      {
        type: "Discovered",
        status: "True",
        observedGeneration: 1,
        lastTransitionTime: "2025-12-31T23:58:10Z",
        reason: "Discovered",
        message: "",
      },
      {
        type: "Paused",
        status: "False",
        observedGeneration: 1,
        lastTransitionTime: "2025-12-31T23:58:05Z",
        reason: "NotPaused",
        message: "",
      },
    ],
  },
};

describe("a ClusterClass", () => {
  it("reads Healthy when VariablesReady is True and RefVersionsUpToDate is not an issue", () => {
    expect(statusIn(healthy.clusterClass)).toMatchObject({
      health: { health: "Healthy", restsOn: { form: "condition", type: "VariablesReady" }, issues: [] },
      freshness: [],
      phase: undefined,
      notes: [],
    });
  });

  it("reads Degraded from RefVersionsUpToDate", () => {
    // The class of healthy whose templates do not use the latest version of their kinds.
    const outdated = withCondition(healthy.clusterClass, "RefVersionsUpToDate", {
      status: "False",
      reason: "RefVersionsNotUpToDate",
    });

    expect(statusIn(outdated).health).toMatchObject({
      health: "Degraded",
      issues: [{ form: "condition", type: "RefVersionsUpToDate" }],
    });
  });

  it("reads Unhealthy when VariablesReady is False, and Unknown while it is missing or Unknown", () => {
    const failed = withCondition(healthy.clusterClass, "VariablesReady", {
      status: "False",
      reason: "VariableDiscoveryFailed",
    });

    expect(statusIn(failed).health.health).toBe("Unhealthy");
    expect(statusIn(withoutCondition(healthy.clusterClass, "VariablesReady")).health.health).toBe("Unknown");
    expect(statusIn(withCondition(healthy.clusterClass, "VariablesReady", { status: "Unknown" })).health.health).toBe(
      "Unknown",
    );
    expect(statusIn(noStatus.clusterClass).health.health).toBe("Unknown");
  });

  it("keeps its health with an older generation, and marks that the topology of its Clusters is held (P8)", () => {
    // The class of healthy after a change of its spec that its controller has not observed: its generation raised.
    const changed = statusIn(withMetadata(healthy.clusterClass, { generation: 2 }));

    expect(changed.health.health).toBe("Healthy");
    expect(changed.freshness).toEqual([
      { cause: "Older generation", generation: 2, observedGeneration: 1, topologiesHeld: true },
    ]);
  });

  it("follows no pause of its Clusters, and reports Paused False when they are paused", () => {
    expect(statusOf(paused.clusterClass, contextOf({ cluster: paused.cluster })).freshness).toEqual([]);
  });
});

describe("an ExtensionConfig", () => {
  it("reads Healthy when Discovered is True", () => {
    expect(statusIn(extensionConfig)).toMatchObject({
      health: { health: "Healthy", restsOn: { form: "condition", type: "Discovered" }, issues: [] },
      freshness: [],
      phase: undefined,
    });
  });

  it("reads Unhealthy when Discovered is False, and Unknown while it is missing or it has no status", () => {
    const failed = withCondition(extensionConfig, "Discovered", { status: "False", reason: "NotDiscovered" });

    expect(statusIn(failed).health.health).toBe("Unhealthy");
    expect(statusIn(withoutCondition(extensionConfig, "Discovered")).health.health).toBe("Unknown");
    expect(statusIn({ ...extensionConfig, status: undefined }).health.health).toBe("Unknown");
  });

  it("is made Degraded by nothing else", () => {
    const another = withStatus(extensionConfig, {
      conditions: [
        ...extensionConfig.status.conditions,
        {
          type: "example.com/HandlersReady",
          status: "False",
          reason: "NotReady",
          message: "",
          lastTransitionTime: "2025-12-31T23:58:20Z",
        },
      ],
    });

    expect(statusIn(another).health).toMatchObject({ health: "Healthy", issues: [] });
  });

  it("marks a change of its spec that Discovered has not observed, from the generation of that condition", () => {
    const changed = statusIn(withMetadata(extensionConfig, { generation: 3 }));

    expect(changed.health.health).toBe("Healthy");
    expect(changed.freshness).toEqual([
      { cause: "Older generation", generation: 3, observedGeneration: 1, topologiesHeld: false },
    ]);
  });
});
