// The large Cluster of the session of the tree (SPEC-0005, P22, "Tests", "Unit"), with no cluster: generated from the
// objects of `healthy`, in a namespace of its own, every copy named apart, every owner reference naming an object of the
// set, and the counters adding up to the Machines; and its tree, whose counts step 9 of the session reads.

import { describe, expect, it } from "vitest";
import { ownNamespaceProblem } from "../e2e/scripts/commands.mts";
import { applyPlan, creationLevels } from "../e2e/scripts/fixtures.mts";
import { FIXTURE_STATES } from "../e2e/scripts/states.mts";
import { LARGE_NAMESPACE, LARGE_WORKERS, largeCluster, workerName } from "../integration/__tests__/large-cluster";
import { buildTree, evaluateTree, indexTree } from "../src/common/views/cluster-tree";
import { StatusMemo } from "../src/common/views/context";
import { countsOf, countWords } from "../src/common/views/tree-rows";
import { CAPTURE, fixtureSet } from "./fixture-sets";
import { treeSourceOf } from "./tree-sources";

import type { KubeObject } from "../e2e/scripts/fixtures.mts";
import type { KubeObjectData } from "../src/common/status/index";

type Fields = Record<string, any>;

const large = largeCluster(fixtureSet("healthy"));

function ofKind(kind: string): KubeObject[] {
  return large.objects.filter((object) => object.kind === kind);
}

function find(kind: string, name: string): KubeObject {
  const found = large.objects.find((object) => object.kind === kind && object.metadata.name === name);

  if (found === undefined) throw new Error(`No ${kind} ${name} in the large Cluster`);
  return found;
}

const status = (object: KubeObject) => object.status as Fields;
const spec = (object: KubeObject) => object.spec as Fields;

describe("the large Cluster of the session of the tree (P22)", () => {
  it("is the Cluster of healthy in a namespace of its own, the namespace of no state, every object in it", () => {
    expect(large.namespace).toBe(LARGE_NAMESPACE);
    expect(FIXTURE_STATES.map((state) => state.namespace)).not.toContain(LARGE_NAMESPACE);
    expect(ownNamespaceProblem(LARGE_NAMESPACE)).toBeUndefined();
    expect(large.objects.filter((object) => object.metadata.namespace !== LARGE_NAMESPACE)).toEqual([]);
    expect(large.cluster).toBe("freelens-capi-healthy");
    expect(ofKind("Cluster").map((cluster) => cluster.metadata.name)).toEqual([large.cluster]);
  });

  it("holds the 300 workers that the probe made, 922 objects: 301 Machines, DevMachines and KubeadmConfigs, and the 19 other objects of healthy", () => {
    const healthy = fixtureSet("healthy");
    const workerKinds = ["Machine", "DevMachine", "KubeadmConfig"];

    expect(LARGE_WORKERS).toBe(300);
    expect(large.workers).toHaveLength(300);
    expect(large.objects).toHaveLength(922);
    for (const kind of workerKinds) expect(ofKind(kind), kind).toHaveLength(301);
    expect(large.objects.filter((object) => !workerKinds.includes(object.kind))).toHaveLength(19);
    // The other objects are those of healthy, under their names.
    expect(
      large.objects
        .filter((object) => !workerKinds.includes(object.kind))
        .map((object) => `${object.kind}/${object.metadata.name}`)
        .sort(),
    ).toEqual(
      healthy
        .filter((object) => !workerKinds.includes(object.kind))
        .map((object) => `${object.kind}/${object.metadata.name}`)
        .sort(),
    );
  });

  it("names every copy apart, each Machine with its infrastructure machine and its bootstrap config, named as it and owned by it, and nothing of the worker it copies", () => {
    for (const kind of ["Machine", "DevMachine", "KubeadmConfig"]) {
      const names = ofKind(kind).map((object) => object.metadata.name);

      expect(new Set(names).size, kind).toBe(names.length);
    }
    for (const name of large.workers) {
      const machine = find("Machine", name);
      const devMachine = find("DevMachine", name);
      const config = find("KubeadmConfig", name);

      expect(spec(machine).infrastructureRef).toMatchObject({ kind: "DevMachine", name });
      expect(spec(machine).bootstrap.configRef).toMatchObject({ kind: "KubeadmConfig", name });
      expect(spec(machine).providerID).toBe(`docker:////${name}`);
      expect(status(machine).nodeRef).toEqual({ name });
      expect(machine.metadata.ownerReferences).toEqual([
        expect.objectContaining({ kind: "MachineSet", name: large.machineSet, controller: true }),
      ]);
      for (const owned of [devMachine, config]) {
        expect(owned.metadata.ownerReferences, owned.kind).toEqual([
          expect.objectContaining({ kind: "Machine", name, controller: true }),
        ]);
      }
      // No copy names the worker of healthy that it copies.
      expect(JSON.stringify([machine, devMachine, config])).not.toContain("m5gtb-2xxxg");
    }
    expect(large.objects.map((object) => JSON.stringify(object)).join("\n")).not.toContain("m5gtb-5pzv9");
  });

  it("has every owner reference naming an object of the set, so that the scripts apply it owners first, and every object the first tier can give its generation", () => {
    const keys = new Set(large.objects.map((object) => `${object.kind}/${object.metadata.name}`));

    for (const object of large.objects) {
      for (const owner of object.metadata.ownerReferences ?? []) {
        expect(keys.has(`${owner.kind}/${owner.name}`), `${object.kind} ${object.metadata.name}`).toBe(true);
      }
      expect(() => applyPlan(object, 0)).not.toThrow();
    }
    expect(() => creationLevels(large.objects)).not.toThrow();
  });

  it("has counters that add up to its Machines: of the MachineDeployment, of the MachineSet, of the topology and the workers of the Cluster, and of the check of the workers", () => {
    const workers = large.objects.filter(
      (object) =>
        object.kind === "Machine" &&
        object.metadata.ownerReferences?.some((owner) => owner.kind === "MachineSet" && owner.controller === true),
    );
    const deployment = find("MachineDeployment", large.machineDeployment);
    const set = find("MachineSet", large.machineSet);
    const cluster = find("Cluster", large.cluster);
    const counted = workers.length;

    expect(counted).toBe(300);
    for (const object of [deployment, set]) {
      expect(spec(object).replicas, object.kind).toBe(counted);
      for (const counter of ["replicas", "availableReplicas", "readyReplicas", "upToDateReplicas"]) {
        expect(status(object)[counter], `${object.kind} ${counter}`).toBe(counted);
      }
      expect(status(object).versions, object.kind).toEqual([{ replicas: counted, version: "v1.37.0" }]);
    }
    expect(status(deployment).deprecated.v1beta1).toMatchObject({
      availableReplicas: counted,
      readyReplicas: counted,
      updatedReplicas: counted,
      unavailableReplicas: 0,
    });
    expect(status(set).deprecated.v1beta1).toMatchObject({
      availableReplicas: counted,
      fullyLabeledReplicas: counted,
      readyReplicas: counted,
    });
    expect(set.metadata.annotations).toMatchObject({
      "machinedeployment.clusters.x-k8s.io/desired-replicas": "300",
      "machinedeployment.clusters.x-k8s.io/max-replicas": "301",
    });
    expect(spec(cluster).topology.workers.machineDeployments.map((part: Fields) => part.replicas)).toEqual([counted]);
    expect(status(cluster).workers).toEqual({
      availableReplicas: counted,
      desiredReplicas: counted,
      readyReplicas: counted,
      replicas: counted,
      upToDateReplicas: counted,
      versions: [{ replicas: counted, version: "v1.37.0" }],
    });
    // The control plane keeps its one Machine.
    expect(status(cluster).controlPlane).toMatchObject({ desiredReplicas: 1, replicas: 1 });

    const [check] = ofKind("MachineHealthCheck").filter((object) => object.metadata.name === large.machineDeployment);

    expect(status(check)).toMatchObject({
      currentHealthy: counted,
      expectedMachines: counted,
      remediationsAllowed: counted,
    });
    expect(status(check).targets).toEqual(workers.map((machine) => machine.metadata.name).sort());
  });

  it("numbers its workers so that their names sort in the order of their numbers, the two hundredth by its number", () => {
    expect([...large.workers].sort()).toEqual(large.workers);
    expect(large.workers[0]).toBe(`${large.machineSet}-001`);
    expect(large.workers[199]).toBe(workerName(large.machineSet, 200));
    expect(large.workers[199]).toBe("freelens-capi-healthy-md-0-m9x7h-m5gtb-200");
    expect(workerName("set", 7, 30)).toBe("set-07");
  });

  it("gives a tree whose MachineSet holds its 300 Machines, 900 objects, and whose MachineDeployment holds 903, with the MachineSet and its 2 templates (step 9; P11)", () => {
    const objects = large.objects as unknown as KubeObjectData[];
    const source = treeSourceOf(objects, { cluster: { namespace: LARGE_NAMESPACE, name: large.cluster } });
    const index = indexTree(source.clusters, source.objects);
    const outcome = buildTree(index, LARGE_NAMESPACE, large.cluster);

    if (outcome.state !== "found") throw new Error(`No tree of the large Cluster: ${outcome.state}`);

    const { tree } = outcome;
    const counts = countsOf(tree, evaluateTree(tree, index, CAPTURE, new StatusMemo()));
    const set = `cluster.x-k8s.io/MachineSet/${large.machineSet}`;
    const deployment = `cluster.x-k8s.io/MachineDeployment/${large.machineDeployment}`;
    const words = (id: string) => {
      const count = counts.get(id);

      if (count === undefined) throw new Error(`No counts of ${id}`);
      return countWords(count);
    };

    expect(tree.nodes.get(set)?.children.map((child) => child.id)).toEqual(
      large.workers.map((name) => `cluster.x-k8s.io/Machine/${name}`),
    );
    expect(words(set)).toBe("900 objects: 900 Healthy");
    expect(words(deployment)).toBe("903 objects: 901 Healthy, 2 with no health");
  });
});
