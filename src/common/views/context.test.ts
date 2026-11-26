import { describe, expect, it } from "vitest";
import { CAPTURE, fixtureSet, ofKind, STATES } from "../../../test/fixture-sets";
import { clusterContextOf, clusterPartsOf, clusterRowOf, contextVersions, indexContext, StatusMemo } from "./context";
import { NO_READS, reduceReads } from "./read-state";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { ClusterObject, KubeObjectData, OperatorProviderObject } from "../status/index";
import type { ContextObjects } from "./context";
import type { ReadEvent, ReadFailure, ReadsState } from "./read-state";
import type { ResolvedReference } from "./references";

// The cases of SPEC-0004, "Tests", "Unit", `context.test.ts`: the context of the status model for each Cluster of the
// fixtures of SPEC-0002, built from the stores that the page reads, in the namespaces that each store has loaded.

const KEYS = {
  machines: "/apis/cluster.x-k8s.io/v1beta2/machines",
  machineSets: "/apis/cluster.x-k8s.io/v1beta2/machinesets",
  machineDeployments: "/apis/cluster.x-k8s.io/v1beta2/machinedeployments",
  machinePools: "/apis/cluster.x-k8s.io/v1beta2/machinepools",
  healthChecks: "/apis/cluster.x-k8s.io/v1beta2/machinehealthchecks",
  clusterClasses: "/apis/cluster.x-k8s.io/v1beta2/clusterclasses",
  kubeadmControlPlanes: "/apis/controlplane.cluster.x-k8s.io/v1beta2/kubeadmcontrolplanes",
  coreProviders: "/apis/operator.cluster.x-k8s.io/v1alpha2/coreproviders",
  infrastructureProviders: "/apis/operator.cluster.x-k8s.io/v1alpha2/infrastructureproviders",
} as const;

const KCP = "controlplane.cluster.x-k8s.io/KubeadmControlPlane";

const KCP_RESOLVED: ResolvedReference = {
  state: "resolved",
  reference: { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane", name: "" },
  apiVersion: "controlplane.cluster.x-k8s.io/v1beta2",
  plural: "kubeadmcontrolplanes",
  contract: "v1beta2",
  provider: "control-plane-kubeadm",
};

const NAMES_LABEL = "cluster.x-k8s.io/cluster-name";

// The metadata of an object as the host hands it, with the version that the API server gives it, which the model does
// not read and the key of a result does.
function hostMetadata(metadata: KubeObjectData["metadata"] & { resourceVersion?: string }): KubeObjectData["metadata"] {
  return metadata;
}

function namespacesOf(objects: readonly KubeObjectData[]): string[] {
  return [...new Set(objects.map((object) => object.metadata.namespace ?? ""))].sort();
}

// The state of the reads after a load of every kind of the context that ended in these namespaces, with the filter
// on the namespaces that it gives.
function readsOf(
  loaded: readonly string[],
  options: { filter?: readonly string[]; keys?: readonly string[]; failures?: Record<string, ReadFailure[]> } = {},
): ReadsState {
  const events: ReadEvent[] = [
    { type: "filter-changed", namespaces: [...(options.filter ?? loaded)], selectedAll: false },
  ];
  let id = 0;

  for (const key of options.keys ?? Object.values(KEYS)) {
    id++;
    events.push({ type: "load-started", kind: key, id, namespaces: [...loaded] });
    for (const failure of options.failures?.[key] ?? []) events.push({ type: "load-failed", kind: key, id, failure });
    events.push({ type: "load-ended", kind: key, id, overWholeCluster: false, followed: true, at: CAPTURE });
  }
  return events.reduce(reduceReads, NO_READS);
}

function objectsOf(objects: readonly KubeObjectData[], reads: ReadsState, operator = false): ContextObjects {
  const items = (kind: string) => objects.filter((object) => object.kind === kind) as never[];

  return {
    reads,
    machines: { key: KEYS.machines, items: items("Machine") },
    machineSets: { key: KEYS.machineSets, items: items("MachineSet") },
    machineDeployments: { key: KEYS.machineDeployments, items: items("MachineDeployment") },
    machinePools: { key: KEYS.machinePools, items: items("MachinePool") },
    healthChecks: { key: KEYS.healthChecks, items: items("MachineHealthCheck") },
    clusterClasses: { key: KEYS.clusterClasses, items: items("ClusterClass") },
    operator: operator
      ? [
          { key: KEYS.coreProviders, items: items("CoreProvider") },
          { key: KEYS.infrastructureProviders, items: items("InfrastructureProvider") },
        ]
      : [{ key: undefined, items: [] }],
    controlPlanes: new Map([
      [KCP, { key: KEYS.kubeadmControlPlanes, items: items("KubeadmControlPlane"), resolution: KCP_RESOLVED }],
    ]),
  };
}

function names(objects: readonly { readonly metadata: { readonly name: string } }[] | undefined): string[] | undefined {
  return objects?.map((object) => object.metadata.name).sort();
}

function partNames(statuses: readonly { readonly object: { readonly name: string | undefined } }[] | undefined) {
  return statuses?.map((status) => status.object.name).sort();
}

describe("the context of each Cluster of the fixtures (SPEC-0003, What it takes and returns)", () => {
  it.each(STATES)("gives the Cluster of %s what the model takes, found as the project finds it", (state) => {
    const objects = fixtureSet(state);
    const reads = readsOf(namespacesOf(objects));
    const index = indexContext(objectsOf(objects, reads));

    for (const cluster of ofKind<ClusterObject>(objects, "Cluster")) {
      const { name, namespace } = cluster.metadata;
      const labelled = (kind: string) =>
        ofKind<KubeObject>(objects, kind).filter(
          (object) => object.metadata.namespace === namespace && object.metadata.labels?.[NAMES_LABEL] === name,
        );
      const { context, inputs, pending } = clusterContextOf(index, cluster, CAPTURE, new StatusMemo());
      const controlPlaneRef = cluster.spec.controlPlaneRef;
      const classRef = cluster.spec.topology?.classRef;

      expect(pending).toBe(false);
      expect(names(context.machines)).toEqual(names(labelled("Machine")));
      expect(partNames(context.parts?.machineDeployments)).toEqual(names(labelled("MachineDeployment")));
      expect(partNames(context.machinePools)).toEqual(names(labelled("MachinePool")));
      expect(context.parts?.controlPlane?.object.name).toBe(controlPlaneRef?.name);
      expect(names(context.healthChecks)).toEqual(
        names(
          ofKind<KubeObject>(objects, "MachineHealthCheck").filter((check) => check.metadata.namespace === namespace),
        ),
      );
      expect(context.clusterClass?.metadata.name).toBe(classRef?.name);
      expect(context.controllers).toEqual({});
      expect(Object.values(inputs).every((input) => input === "given")).toBe(true);
    }
  });

  it("gives the Cluster of machine-pools Degraded, with its Available True, from the health of its MachinePool (H1)", () => {
    const objects = fixtureSet("machine-pools");
    const index = indexContext(objectsOf(objects, readsOf(namespacesOf(objects))));
    const [cluster] = ofKind<ClusterObject>(objects, "Cluster");
    const row = clusterRowOf(index, cluster, CAPTURE, new StatusMemo());

    expect(cluster.status?.conditions?.find((condition) => condition.type === "Available")?.status).toBe("True");
    expect(row.status.health).toMatchObject({ health: "Degraded" });
  });

  it("finds the Machines of a part by their owner, never by a label whose value can be a hash (SPEC-0001, R3.6)", () => {
    const objects = fixtureSet("healthy");
    const machine = ofKind<KubeObject>(objects, "Machine").find((each) =>
      each.metadata.ownerReferences?.some((owner) => owner.kind === "MachineSet"),
    ) as KubeObject;
    const owner = machine.metadata.ownerReferences?.find((each) => each.kind === "MachineSet");
    const hashed: KubeObject = {
      ...machine,
      metadata: {
        ...machine.metadata,
        name: `${machine.metadata.name}-hashed`,
        labels: { ...machine.metadata.labels, "cluster.x-k8s.io/set-name": "hash-a1b2c3d4e5" },
      },
    };
    const index = indexContext(objectsOf([...objects, hashed], readsOf(namespacesOf(objects))));
    const owned = index.machinesByController.get(
      `${machine.metadata.namespace}/cluster.x-k8s.io/MachineSet/${owner?.name}`,
    );

    expect(names(owned)).toContain(`${machine.metadata.name}-hashed`);
    expect(
      index.machinesByController.has(`${machine.metadata.namespace}/cluster.x-k8s.io/MachineSet/hash-a1b2c3d4e5`),
    ).toBe(false);
  });

  it("keeps apart the objects of two Clusters of one name in two namespaces", () => {
    const objects = fixtureSet("healthy");
    const copies = objects.map((object) => ({ ...object, metadata: { ...object.metadata, namespace: "elsewhere" } }));
    const both = [...objects, ...copies];
    const index = indexContext(objectsOf(both, readsOf(namespacesOf(both))));
    const [own, copy] = ofKind<ClusterObject>(both, "Cluster");
    const ownContext = clusterContextOf(index, own, CAPTURE, new StatusMemo()).context;
    const copyContext = clusterContextOf(index, copy, CAPTURE, new StatusMemo()).context;

    expect(ownContext.machines?.every((machine) => machine.metadata.namespace === "freelens-capi-healthy")).toBe(true);
    expect(copyContext.machines?.every((machine) => machine.metadata.namespace === "elsewhere")).toBe(true);
    expect(ownContext.machines).toHaveLength(3);
    expect(copyContext.machines).toHaveLength(3);
  });
});

describe("an input that is not read (P19, P25)", () => {
  const healthy = fixtureSet("healthy");
  const paused = fixtureSet("paused");
  const both = [...healthy, ...paused];
  const namespaces = namespacesOf(both);

  it("is left out while its namespace is not loaded, never given empty, and the marks show the spinner", () => {
    const reads = readsOf(namespaces, { keys: Object.values(KEYS).filter((key) => key !== KEYS.machines) });
    const [cluster] = ofKind<ClusterObject>(healthy, "Cluster");
    const { context, inputs, pending } = clusterContextOf(
      indexContext(objectsOf(both, reads)),
      cluster,
      CAPTURE,
      new StatusMemo(),
    );

    expect(context.machines).toBeUndefined();
    expect(inputs.machines).toBe("pending");
    expect(pending).toBe(true);
  });

  it("is given to no Cluster of the namespaces of a load refused in one of them, whose activities read Unknown, never Idle", () => {
    const refused: ReadFailure = { refused: true, message: "machines.cluster.x-k8s.io is forbidden" };
    const reads = readsOf(namespaces, { failures: { [KEYS.machines]: [refused] } });
    const index = indexContext(objectsOf(both, reads));

    for (const cluster of ofKind<ClusterObject>(both, "Cluster")) {
      const row = clusterRowOf(index, cluster, CAPTURE, new StatusMemo());
      const { context, inputs, pending } = clusterContextOf(index, cluster, CAPTURE, new StatusMemo());

      expect(context.machines).toBeUndefined();
      expect(inputs.machines).toBe("held");
      expect(pending).toBe(false);
      expect(row.status.activities).toMatchObject({ state: "read", idle: false, unknown: true });
      // The parts of the Cluster, given no Machines either, say so in their results, which the details show.
      for (const part of [context.parts?.controlPlane, ...(context.parts?.machineDeployments ?? [])]) {
        expect(part?.activities).toMatchObject({ state: "read", unknown: true });
        expect(part?.notes).toContainEqual({ code: "input-not-given", input: "machines" });
      }
    }
  });

  it("is given again once a load of that kind ends with no failure", () => {
    const refused: ReadFailure = { refused: true, message: "machines.cluster.x-k8s.io is forbidden" };
    const held = readsOf(namespaces, { failures: { [KEYS.machines]: [refused] } });
    const read = reduceReads(reduceReads(held, { type: "load-started", kind: KEYS.machines, id: 99, namespaces }), {
      type: "load-ended",
      kind: KEYS.machines,
      id: 99,
      overWholeCluster: false,
      followed: true,
      at: CAPTURE,
    });
    const [cluster] = ofKind<ClusterObject>(healthy, "Cluster");

    expect(
      clusterContextOf(indexContext(objectsOf(both, read)), cluster, CAPTURE, new StatusMemo()).inputs.machines,
    ).toBe("given");
  });
});

describe("the objects of a namespace that a store has not loaded (P19)", () => {
  const objects = fixtureSet("healthy");
  const [cluster] = ofKind<ClusterObject>(objects, "Cluster");
  const namespace = cluster.metadata.namespace as string;
  const elsewhere: ClusterObject = {
    ...cluster,
    spec: {
      ...cluster.spec,
      topology: { classRef: { name: "quick-start", namespace: "classes" }, version: "v1.37.0" },
    },
  };
  const classElsewhere = ofKind<KubeObject>(objects, "ClusterClass").map((each) => ({
    ...each,
    metadata: { ...each.metadata, namespace: "classes" },
  }));
  const all = [...objects, ...classElsewhere];

  it("are not in the context when the filter no longer selects their namespace, though the store holds them", () => {
    const reads = reduceReads(readsOf([namespace, "classes"]), {
      type: "filter-changed",
      namespaces: [namespace],
      selectedAll: false,
    });
    const { context, inputs } = clusterContextOf(
      indexContext(objectsOf(all, reads)),
      elsewhere,
      CAPTURE,
      new StatusMemo(),
    );

    expect(context.clusterClass).toBeUndefined();
    expect(inputs.clusterClass).toBe("not-read");
  });

  it("are not in the context before the store has loaded their namespace", () => {
    const reads = readsOf([namespace], { filter: [namespace, "classes"] });
    const { context, inputs, pending } = clusterContextOf(
      indexContext(objectsOf(all, reads)),
      elsewhere,
      CAPTURE,
      new StatusMemo(),
    );

    expect(context.clusterClass).toBeUndefined();
    expect(inputs.clusterClass).toBe("pending");
    expect(pending).toBe(true);
  });
});

describe("the controllers (SPEC-0003, P24; SPEC-0004, P2)", () => {
  function provider(kind: string, name: string, namespace: string, ready: string): OperatorProviderObject {
    return {
      apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
      kind: kind as OperatorProviderObject["kind"],
      metadata: hostMetadata({ name, namespace, uid: `${kind}-${name}`, resourceVersion: "1" }),
      status: {
        conditions: [
          {
            type: "Ready",
            status: ready as "True",
            reason: "R",
            message: "",
            lastTransitionTime: "2025-12-31T23:00:00Z",
          },
        ],
      },
    };
  }

  const objects = fixtureSet("healthy");
  const [cluster] = ofKind<ClusterObject>(objects, "Cluster");
  const namespace = cluster.metadata.namespace as string;
  const core = provider("CoreProvider", "cluster-api", "capi-system", "True");
  const docker = provider("InfrastructureProvider", "docker", "capd-system", "False");

  it("come from the objects of the operator in the namespaces read, by the manifest label of each provider", () => {
    const all = [...objects, core, docker];
    const reads = readsOf([namespace, "capi-system", "capd-system"]);
    const { context } = clusterContextOf(indexContext(objectsOf(all, reads, true)), cluster, CAPTURE, new StatusMemo());

    expect(context.controllers).toEqual({
      "cluster-api": { available: true, since: "2025-12-31T23:00:00Z" },
      "infrastructure-docker": { available: false, since: "2025-12-31T23:00:00Z" },
    });
  });

  it("leave out a provider whose namespace is not read, and are none where the cluster serves no kind of the operator", () => {
    const all = [...objects, core, docker];
    const reads = readsOf([namespace, "capi-system"]);
    const { context } = clusterContextOf(indexContext(objectsOf(all, reads, true)), cluster, CAPTURE, new StatusMemo());
    const none = clusterContextOf(
      indexContext(objectsOf(objects, readsOf([namespace]))),
      cluster,
      CAPTURE,
      new StatusMemo(),
    );
    const row = clusterRowOf(
      indexContext(objectsOf(objects, readsOf([namespace]))),
      cluster,
      CAPTURE,
      new StatusMemo(),
    );

    expect(Object.keys(context.controllers ?? {})).toEqual(["cluster-api"]);
    expect(none.context.controllers).toEqual({});
    expect(row.status.notes).toContainEqual({ code: "controller-unknown", provider: "cluster-api" });
  });

  it("are not given by a view of one Cluster, which reads no kind of the operator, and the model notes them as not read (SPEC-0004, P31)", () => {
    const own = { ...objectsOf(objects, readsOf([namespace])), operator: undefined };
    const { context, inputs } = clusterContextOf(indexContext(own), cluster, CAPTURE, new StatusMemo());
    const row = clusterRowOf(indexContext(own), cluster, CAPTURE, new StatusMemo());

    expect(context.controllers).toBeUndefined();
    expect(inputs.controllers).toBe("not-read");
    expect(row.status.notes).toContainEqual({ code: "input-not-given", input: "controllers" });
    expect(row.status.notes).not.toContainEqual({ code: "controller-unknown", provider: "cluster-api" });
  });
});

describe("the key of a result (SPEC-0003, How a view uses it)", () => {
  const objects = fixtureSet("healthy");
  const paused = fixtureSet("paused");
  const all = [...objects, ...paused];
  const reads = readsOf(namespacesOf(all));
  const [cluster] = ofKind<ClusterObject>(objects, "Cluster");

  function keyWith(changed: readonly KubeObjectData[], operator: readonly OperatorProviderObject[] = []): string {
    return clusterContextOf(
      indexContext(objectsOf([...changed, ...operator], reads, operator.length > 0)),
      cluster,
      CAPTURE,
      new StatusMemo(),
    ).key;
  }

  function withVersion(object: KubeObject, resourceVersion: string): KubeObject {
    return { ...object, metadata: { ...object.metadata, resourceVersion } };
  }

  it("changes with the resourceVersion of any object of the context, and with nothing of another Cluster", () => {
    const base = keyWith(all);
    const machine = ofKind<KubeObject>(objects, "Machine")[0];
    const otherMachine = ofKind<KubeObject>(paused, "Machine")[0];

    expect(keyWith(all.map((object) => (object === machine ? withVersion(machine, "2") : object)))).not.toBe(base);
    expect(keyWith(all.map((object) => (object === otherMachine ? withVersion(otherMachine, "2") : object)))).toBe(
      base,
    );
    expect(keyWith([...all])).toBe(base);
  });

  it("changes with the version of the controllers", () => {
    const core: OperatorProviderObject = {
      apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
      kind: "CoreProvider",
      metadata: hostMetadata({
        name: "cluster-api",
        namespace: "freelens-capi-healthy",
        uid: "core",
        resourceVersion: "1",
      }),
    };
    const changed = { ...core, metadata: hostMetadata({ ...core.metadata, resourceVersion: "2" }) };

    expect(keyWith(all, [core])).not.toBe(keyWith(all, [changed]));
  });

  it("keeps a result until the time that it names, then computes it again", () => {
    const provisioning = fixtureSet("provisioning");
    const index = indexContext(objectsOf(provisioning, readsOf(namespacesOf(provisioning))));
    const [cluster] = ofKind<ClusterObject>(provisioning, "Cluster");
    const memo = new StatusMemo();
    const first = clusterRowOf(index, cluster, CAPTURE, memo);
    const computed = memo.computed;
    const changesAt = first.status.changesAt as number;

    expect(changesAt).toBeGreaterThan(CAPTURE);
    expect(clusterRowOf(index, cluster, changesAt - 1, memo).status).toBe(first.status);
    expect(memo.computed).toBe(computed);
    expect(clusterRowOf(index, cluster, changesAt, memo).status).not.toBe(first.status);
    expect(memo.computed).toBeGreaterThan(computed);
  });
});

describe("the indexes of the context", () => {
  it("are built once for each change of the stores, and the context of every row reads them, never the stores", () => {
    const objects = [...fixtureSet("healthy"), ...fixtureSet("paused"), ...fixtureSet("upgrading")];
    const contextObjects = objectsOf(objects, readsOf(namespacesOf(objects)));
    let reads = 0;
    const counted: ContextObjects = {
      ...contextObjects,
      machines: {
        key: contextObjects.machines.key,
        get items() {
          reads++;
          return contextObjects.machines.items;
        },
      },
    };
    const index = indexContext(counted);
    const afterIndex = reads;

    for (const cluster of ofKind<ClusterObject>(objects, "Cluster"))
      clusterRowOf(index, cluster, CAPTURE, new StatusMemo());

    expect(afterIndex).toBe(1);
    expect(reads).toBe(afterIndex);
  });

  it("are keyed on the version of every object they read and on how each reference resolves, never on an array", () => {
    const objects = fixtureSet("healthy");
    const contextObjects = objectsOf(objects, readsOf(namespacesOf(objects)));
    const versions = contextVersions(contextObjects);
    const [machine, ...others] = contextObjects.machines.items;
    const withMachines = (items: readonly KubeObjectData[]): ContextObjects => ({
      ...contextObjects,
      machines: { ...contextObjects.machines, items: items as never[] },
    });
    const kcp = contextObjects.controlPlanes.get(KCP) as NonNullable<
      ReturnType<typeof contextObjects.controlPlanes.get>
    >;

    // The same objects in a new array are the same key; a new version, an object more or less, are another.
    expect(contextVersions(withMachines([machine, ...others]))).toBe(versions);
    expect(
      contextVersions(
        withMachines([
          { ...machine, metadata: { ...machine.metadata, resourceVersion: "changed" } } as never,
          ...others,
        ]),
      ),
    ).not.toBe(versions);
    expect(contextVersions(withMachines(others))).not.toBe(versions);
    expect(
      contextVersions({
        ...contextObjects,
        controlPlanes: new Map([[KCP, { ...kcp, resolution: { state: "unresolved", reason: "refused" } as never }]]),
      }),
    ).not.toBe(versions);
  });
});

describe("the parts of a Cluster in its details (P17)", () => {
  const DEV = "infrastructure.cluster.x-k8s.io/DevCluster";
  const DEV_RESOLVED: ResolvedReference = {
    state: "resolved",
    reference: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: "" },
    apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
    plural: "devclusters",
    contract: "v1beta2",
    provider: "infrastructure-docker",
  };
  const DEV_KEY = "/apis/infrastructure.cluster.x-k8s.io/v1beta2/devclusters";

  // The objects of a state, with the kind of its infrastructure cluster, read in the namespaces of the state.
  function partsOf(objects: readonly KubeObjectData[]) {
    const reads = readsOf(namespacesOf(objects), { keys: [...Object.values(KEYS), DEV_KEY] });
    const contextObjects: ContextObjects = {
      ...objectsOf(objects, reads),
      infrastructures: new Map([
        [
          DEV,
          {
            key: DEV_KEY,
            items: objects.filter((object) => object.kind === "DevCluster") as never[],
            resolution: DEV_RESOLVED,
          },
        ],
      ]),
    };
    const cluster = objects.find((object) => object.kind === "Cluster") as ClusterObject;

    return clusterPartsOf(indexContext(contextObjects), cluster, CAPTURE, new StatusMemo());
  }

  // A worker Machine that the Cluster owns, from a Machine of the set, with the labels that the controller gives it.
  function ownedMachine(objects: readonly KubeObject[], name: string, labels: Record<string, string> = {}): KubeObject {
    const [machine] = ofKind<KubeObject>(objects, "Machine");
    const cluster = ofKind<ClusterObject>(objects, "Cluster")[0].metadata.name;
    const copy = structuredClone(machine) as unknown as { metadata: Record<string, unknown> };

    copy.metadata.name = name;
    copy.metadata.labels = { [NAMES_LABEL]: cluster, ...labels };
    copy.metadata.ownerReferences = [{ apiVersion: "cluster.x-k8s.io/v1beta2", kind: "Cluster", name: cluster }];
    return copy as unknown as KubeObject;
  }

  it("are the MachineSets that the Cluster owns, apart from those of its MachineDeployments", () => {
    const parts = partsOf(fixtureSet("machine-without-node"));

    expect(
      typeof parts.machineSets === "string"
        ? parts.machineSets
        : names(parts.machineSets.map((part) => part.object as never)),
    ).toEqual(["freelens-capi-without-node-without-node"]);
    expect(
      typeof parts.machineDeployments === "string"
        ? parts.machineDeployments
        : names(parts.machineDeployments.map((part) => part.object as never)),
    ).toEqual(["freelens-capi-without-node-md-0-glbqj"]);
  });

  it("are the worker Machines that the Cluster owns, and not those of its control plane or of a MachinePool", () => {
    const objects = fixtureSet("machine-without-node");
    const parts = partsOf([
      ...objects,
      ownedMachine(objects, "a-stand-alone-worker"),
      ownedMachine(objects, "of-the-control-plane", { "cluster.x-k8s.io/control-plane": "" }),
      ownedMachine(objects, "of-a-pool", { "cluster.x-k8s.io/pool-name": "a-pool" }),
    ]);

    expect(
      typeof parts.workerMachines === "string"
        ? parts.workerMachines
        : parts.workerMachines.map((part) => part.object.metadata.name),
    ).toEqual(["a-stand-alone-worker"]);
  });

  it("are the control plane Machines of a Cluster that names no control plane, and none for one that names it", () => {
    const objects = fixtureSet("without-topology");
    const unnamed = objects.map((object) => {
      if (object.kind !== "Cluster") return object;

      const copy = structuredClone(object) as unknown as { spec: Record<string, unknown> };

      delete copy.spec.controlPlaneRef;
      return copy as unknown as KubeObject;
    });
    const parts = partsOf(unnamed);
    const expected = ofKind<KubeObject>(objects, "Machine")
      .filter((machine) => machine.metadata.labels?.["cluster.x-k8s.io/control-plane"] !== undefined)
      .map((machine) => machine.metadata.name);

    expect(parts.controlPlane).toBeUndefined();
    expect(
      typeof parts.controlPlaneMachines === "string" || parts.controlPlaneMachines === undefined
        ? parts.controlPlaneMachines
        : parts.controlPlaneMachines.map((part) => part.object.metadata.name),
    ).toEqual(expected);
    expect(partsOf(objects).controlPlaneMachines).toBeUndefined();
  });

  it("are the infrastructure cluster, with the role and the contract that its reference gives, or how it is not read", () => {
    const objects = fixtureSet("healthy");
    const parts = partsOf(objects);
    const devCluster = ofKind<KubeObject>(objects, "DevCluster")[0];

    expect(typeof parts.infrastructure === "object" ? parts.infrastructure.object : parts.infrastructure).toBe(
      devCluster,
    );
    expect(typeof parts.infrastructure === "object" ? parts.infrastructure.status.health.health : undefined).toBe(
      "Healthy",
    );
    // An infrastructure cluster that the Cluster names and that is not in its namespace, which was read.
    expect(partsOf(objects.filter((object) => object.kind !== "DevCluster")).infrastructure).toBe("not-read");
  });

  it("show the spinner while their Machines are loading", () => {
    const objects = fixtureSet("machine-without-node");
    const reads = readsOf(namespacesOf(objects), { keys: Object.values(KEYS).filter((key) => key !== KEYS.machines) });
    const parts = clusterPartsOf(
      indexContext(objectsOf(objects, reads)),
      ofKind<ClusterObject>(objects, "Cluster")[0],
      CAPTURE,
      new StatusMemo(),
    );

    expect(
      typeof parts.machineSets === "string" ? parts.machineSets : parts.machineSets.map((part) => part.pending),
    ).toEqual([true]);
  });
});

describe("the key of the indexes and the infrastructure clusters", () => {
  it("changes with the objects of an infrastructure cluster and with how its reference resolves", () => {
    const objects = fixtureSet("healthy");
    const contextObjects = objectsOf(objects, readsOf(namespacesOf(objects)));
    const devClusters = ofKind<KubeObject>(objects, "DevCluster");
    const resolution: ResolvedReference = {
      state: "resolved",
      reference: { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: "" },
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta2",
      plural: "devclusters",
      contract: "v1beta2",
      provider: "infrastructure-docker",
    };
    const withDev = (items: readonly KubeObject[], resolved: ResolvedReference = resolution): ContextObjects => ({
      ...contextObjects,
      infrastructures: new Map([
        [
          "infrastructure.cluster.x-k8s.io/DevCluster",
          { key: "/apis/devclusters", items: items as never[], resolution: resolved },
        ],
      ]),
    });
    const versions = contextVersions(withDev(devClusters));

    expect(contextVersions(withDev([...devClusters]))).toBe(versions);
    expect(contextVersions(withDev([]))).not.toBe(versions);
    expect(contextVersions(withDev(devClusters, { ...resolution, state: "pending" } as never))).not.toBe(versions);
  });
});
