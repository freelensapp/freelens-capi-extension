// The rule of a ClusterResourceSet and of its binding (SPEC-0003, "Tests", "Unit", and "The rule of each kind",
// ClusterResourceSet; P12; SPEC-0001, R2.84, R2.85 and H1): `ResourcesApplied` with what each binding records,
// Cluster by Cluster; a resource missing from a binding or not applied in it; the binding of a Cluster that cannot be
// reached yet, Unhealthy, in the tone of progress while that Cluster is in its first provisioning and in that of its
// health after it (D2), and an `InternalError` with no such binding; a set that applied to no Cluster; and the
// bindings that the view did not give. The objects come from the fixtures of SPEC-0002 (test/status-objects.ts); a
// case that changes one says what it changes.

import { describe, expect, it } from "vitest";
import {
  contextOf,
  healthy,
  noStatus,
  paused,
  provisioning,
  withCondition,
  withSpec,
} from "../../../test/status-objects";
import { statusOf } from "./index";

import type { BindingInput, ClusterObject, ClusterResourceSetBindingObject, KubeObjectData } from "./index";

function statusWith(set: KubeObjectData, bindings?: readonly BindingInput[]) {
  return statusOf(set, contextOf({ bindings }));
}

function boundTo(binding: ClusterResourceSetBindingObject): BindingInput {
  return { binding };
}

// The binding of healthy, with its one entry changed as a case says.
function bindingWith(resources: readonly Record<string, unknown>[]): ClusterResourceSetBindingObject {
  return withSpec(healthy.binding, {
    bindings: [{ clusterResourceSetName: "cni-kindnet", resources }],
  });
}

describe("a ClusterResourceSet (P12)", () => {
  it("reads Healthy when ResourcesApplied is True and its binding applied every resource, Cluster by Cluster", () => {
    expect(statusWith(healthy.clusterResourceSet, [boundTo(healthy.binding)]).health).toEqual({
      health: "Healthy",
      restsOn: {
        form: "bindings",
        condition: expect.objectContaining({ type: "ResourcesApplied", status: "True" }),
        clusters: [
          {
            cluster: "freelens-capi-healthy",
            resources: [{ kind: "ConfigMap", name: "cni-kindnet", state: "applied" }],
          },
        ],
      },
      issues: [],
    });
  });

  it("reads Degraded when a binding has no entry for one of its resources, which the project sets True", () => {
    // The binding of healthy without the entry of the resource, as the project records a resource it skipped.
    expect(statusWith(healthy.clusterResourceSet, [boundTo(bindingWith([]))]).health).toMatchObject({
      health: "Degraded",
      issues: [
        {
          form: "resource",
          cluster: "freelens-capi-healthy",
          kind: "ConfigMap",
          name: "cni-kindnet",
          state: "missing",
        },
      ],
    });
  });

  it("reads Degraded when a binding records a resource that failed to apply", () => {
    // The binding of healthy with its entry changed to `applied` false.
    const failed = bindingWith([{ kind: "ConfigMap", name: "cni-kindnet", applied: false }]);

    expect(statusWith(healthy.clusterResourceSet, [boundTo(failed)]).health).toMatchObject({
      health: "Degraded",
      issues: [{ form: "resource", name: "cni-kindnet", state: "not applied" }],
    });
  });

  it("reads Unhealthy for the binding of a Cluster that cannot be reached yet, as the project says", () => {
    expect(statusWith(provisioning.clusterResourceSet, [boundTo(provisioning.binding)]).health).toMatchObject({
      health: "Unhealthy",
      restsOn: {
        form: "bindings",
        condition: { status: "False", reason: "InternalError" },
        clusters: [{ cluster: "freelens-capi-provisioning", resources: [{ name: "cni-kindnet", state: "missing" }] }],
      },
    });
  });

  it("reads Unhealthy in the tone of progress while that Cluster is in its first provisioning, and of its health after it", () => {
    // The Cluster of provisioning, and the same Cluster once its control plane is initialized: its
    // `ControlPlaneInitialized` changed to `True`.
    const initialized = withCondition(provisioning.cluster, "ControlPlaneInitialized", {
      status: "True",
      reason: "Initialized",
    });
    const bound = (cluster: ClusterObject) =>
      statusWith(provisioning.clusterResourceSet, [{ binding: provisioning.binding, cluster }]);

    expect(bound(provisioning.cluster)).toMatchObject({
      health: { health: "Unhealthy" },
      tone: { tone: "progress", setBy: { heldBy: { kind: "Cluster", name: "freelens-capi-provisioning" } } },
    });
    expect(bound(initialized)).toMatchObject({ health: { health: "Unhealthy" }, tone: { tone: "health" } });
  });

  it("reads Unhealthy for an InternalError with no such binding, in the tone of its health", () => {
    const status = statusWith(provisioning.clusterResourceSet, []);

    expect(status.health).toMatchObject({ health: "Unhealthy", restsOn: { clusters: [] }, issues: [] });
    expect(status.tone.tone).toBe("health");
    expect(status.notes).toEqual([]);
  });

  it("reads only the entries of its own name, in the bindings of its namespace", () => {
    const other = withSpec(healthy.binding, {
      bindings: [{ clusterResourceSetName: "another-set", resources: [] }],
    });

    expect(statusWith(healthy.clusterResourceSet, [boundTo(other)]).health).toMatchObject({
      health: "Healthy",
      restsOn: { clusters: [] },
    });
  });

  it("reads Unknown, with the note, when no binding holds an entry for it and it has no ResourcesApplied", () => {
    const status = statusWith(noStatus.clusterResourceSet, [boundTo(noStatus.binding)]);

    expect(status.health).toMatchObject({ health: "Unknown", restsOn: { form: "bindings", condition: undefined } });
    expect(status.notes).toEqual([{ code: "applied-to-no-cluster" }]);
  });

  it("rests on ResourcesApplied alone, with the note, when the view gave no bindings", () => {
    const status = statusWith(healthy.clusterResourceSet);

    expect(status.health).toEqual({
      health: "Healthy",
      restsOn: { form: "bindings", condition: expect.objectContaining({ status: "True" }), clusters: undefined },
      issues: [],
    });
    expect(status.notes).toEqual([{ code: "input-not-given", input: "bindings" }]);
    expect(statusWith(provisioning.clusterResourceSet).health.health).toBe("Unhealthy");
    expect(statusWith(noStatus.clusterResourceSet).notes).toEqual([{ code: "input-not-given", input: "bindings" }]);
  });

  it("reads Unknown a binding of the wrong type, and notes it", () => {
    const broken = withSpec(healthy.binding, { bindings: "cni-kindnet" });
    const status = statusWith(healthy.clusterResourceSet, [boundTo(broken)]);

    expect(status.health.health).toBe("Unknown");
    expect(status.notes).toEqual([{ code: "field-unreadable", field: "bindings.spec.bindings" }]);
  });

  it("honours only its own annotation of pause, and applies to a paused Cluster", () => {
    expect(statusOf(paused.clusterResourceSet, contextOf({ cluster: paused.cluster, bindings: [] })).freshness).toEqual(
      [],
    );
  });
});

describe("a ClusterResourceSetBinding", () => {
  it("has no health, since what it records is in its spec", () => {
    expect(statusOf(healthy.binding, contextOf()).health).toEqual({ health: "none", because: "no status" });
  });
});
