import { describe, expect, it } from "vitest";
import { fixtureSet, ofKind, STATES } from "../../../../test/fixture-sets";
import { Cluster } from "./cluster-v1beta2";

import type { ClusterObject } from "../../../common/status/index";
import type {
  Condition,
  ContractVersionedObjectReference,
  MachineHealthCheckRemediationTemplateReference,
  MachineReadinessGate,
  MachineTaint,
  ObjectMeta,
  StatusUpgradePlanVersion,
  StatusVersion,
  UnhealthyMachineCondition,
  UnhealthyNodeCondition,
  V1Beta1Condition,
} from "../types";
import type {
  APIEndpoint,
  ClusterAvailabilityGate,
  ClusterClassRef,
  ClusterControlPlaneStatus,
  ClusterDeprecatedStatus,
  ClusterInitializationStatus,
  ClusterNetwork,
  ClusterSpec,
  ClusterStatus,
  ClusterV1Beta1DeprecatedStatus,
  ClusterVariable,
  ControlPlaneTopology,
  ControlPlaneTopologyHealthCheck,
  ControlPlaneTopologyHealthCheckChecks,
  ControlPlaneTopologyHealthCheckRemediation,
  ControlPlaneTopologyHealthCheckRemediationTriggerIf,
  ControlPlaneTopologyMachineDeletionSpec,
  ControlPlaneTopologyRolloutSpec,
  ControlPlaneVariables,
  FailureDomain,
  MachineDeploymentTopology,
  MachineDeploymentTopologyHealthCheck,
  MachineDeploymentTopologyHealthCheckChecks,
  MachineDeploymentTopologyHealthCheckRemediation,
  MachineDeploymentTopologyHealthCheckRemediationTriggerIf,
  MachineDeploymentTopologyMachineDeletionSpec,
  MachineDeploymentTopologyRolloutSpec,
  MachineDeploymentTopologyRolloutStrategy,
  MachineDeploymentTopologyRolloutStrategyRollingUpdate,
  MachineDeploymentVariables,
  MachinePoolTopology,
  MachinePoolTopologyMachineDeletionSpec,
  MachinePoolVariables,
  NetworkRanges,
  Topology,
  WorkersStatus,
  WorkersTopology,
} from "./cluster-v1beta2";

// The cases of SPEC-0004, "Tests", "Unit", `cluster-v1beta2.test.ts`: the static metadata of the model, and its types,
// written from the schema of Cluster API v1.14.4 (core/config/crd/bases/cluster.x-k8s.io_clusters.yaml).

describe("the model of a Cluster at v1beta2", () => {
  it("has the static metadata of the definition, and the title of the page", () => {
    expect(Cluster.kind).toBe("Cluster");
    expect(Cluster.namespaced).toBe(true);
    expect(Cluster.apiBase).toBe("/apis/cluster.x-k8s.io/v1beta2/clusters");
    expect(Cluster.crd).toEqual({
      apiVersions: ["cluster.x-k8s.io/v1beta2"],
      plural: "clusters",
      singular: "cluster",
      shortNames: ["cl"],
      title: "Workload Clusters",
    });
  });
});

// The shape of an interface, checked against it by the type check: every key of the interface, each required as the
// interface makes it, and the kind of its value. The test reads the Clusters of the fixtures against it: a field that
// the interface does not declare, a required one missing, or a value of another kind fails it.
type Shape =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | { readonly list: Shape }
  | { readonly map: "string" }
  | { readonly union: readonly string[] }
  | { readonly fields: Readonly<Record<string, { readonly required: boolean; readonly value: Shape }>> };

type ShapeOf<T> = {
  readonly [K in keyof T]-?: { readonly required: {} extends Pick<T, K> ? false : true; readonly value: Shape };
};

function fields<T>(shape: ShapeOf<T>): Shape {
  return { fields: shape as Readonly<Record<string, { readonly required: boolean; readonly value: Shape }>> };
}

const listOf = (value: Shape): Shape => ({ list: value });
const STATUS: Shape = { union: ["True", "False", "Unknown"] };
const MAP: Shape = { map: "string" };
const INT_OR_STRING: Shape = "json";

const objectMeta = fields<ObjectMeta>({
  labels: { required: false, value: MAP },
  annotations: { required: false, value: MAP },
});
const reference = fields<ContractVersionedObjectReference>({
  kind: { required: true, value: "string" },
  name: { required: true, value: "string" },
  apiGroup: { required: true, value: "string" },
});
const taint = fields<MachineTaint>({
  key: { required: true, value: "string" },
  value: { required: false, value: "string" },
  effect: { required: true, value: { union: ["NoSchedule", "PreferNoSchedule", "NoExecute"] } },
  propagation: { required: true, value: { union: ["Always", "OnInitialization"] } },
});
const readinessGate = fields<MachineReadinessGate>({
  conditionType: { required: true, value: "string" },
  polarity: { required: false, value: { union: ["Positive", "Negative"] } },
});
const nodeCondition = fields<UnhealthyNodeCondition>({
  type: { required: true, value: "string" },
  status: { required: true, value: "string" },
  timeoutSeconds: { required: true, value: "number" },
});
const machineCondition = fields<UnhealthyMachineCondition>({
  type: { required: true, value: "string" },
  status: { required: true, value: STATUS },
  timeoutSeconds: { required: true, value: "number" },
});
const templateRef = fields<MachineHealthCheckRemediationTemplateReference>({
  kind: { required: true, value: "string" },
  name: { required: true, value: "string" },
  apiVersion: { required: true, value: "string" },
});
const variable = fields<ClusterVariable>({
  name: { required: true, value: "string" },
  value: { required: true, value: "json" },
});
const overrides = { overrides: { required: false, value: listOf(variable) } } as const;
const deletion = {
  nodeDrainTimeoutSeconds: { required: false, value: "number" },
  nodeVolumeDetachTimeoutSeconds: { required: false, value: "number" },
  nodeDeletionTimeoutSeconds: { required: false, value: "number" },
} as const;

const controlPlaneTopology = fields<ControlPlaneTopology>({
  metadata: { required: false, value: objectMeta },
  replicas: { required: false, value: "number" },
  rollout: {
    required: false,
    value: fields<ControlPlaneTopologyRolloutSpec>({ after: { required: false, value: "string" } }),
  },
  healthCheck: {
    required: false,
    value: fields<ControlPlaneTopologyHealthCheck>({
      enabled: { required: false, value: "boolean" },
      checks: {
        required: false,
        value: fields<ControlPlaneTopologyHealthCheckChecks>({
          nodeStartupTimeoutSeconds: { required: false, value: "number" },
          unhealthyNodeConditions: { required: false, value: listOf(nodeCondition) },
          unhealthyMachineConditions: { required: false, value: listOf(machineCondition) },
        }),
      },
      remediation: {
        required: false,
        value: fields<ControlPlaneTopologyHealthCheckRemediation>({
          triggerIf: {
            required: false,
            value: fields<ControlPlaneTopologyHealthCheckRemediationTriggerIf>({
              unhealthyLessThanOrEqualTo: { required: false, value: INT_OR_STRING },
              unhealthyInRange: { required: false, value: "string" },
            }),
          },
          templateRef: { required: false, value: templateRef },
        }),
      },
    }),
  },
  deletion: { required: false, value: fields<ControlPlaneTopologyMachineDeletionSpec>(deletion) },
  taints: { required: false, value: listOf(taint) },
  readinessGates: { required: false, value: listOf(readinessGate) },
  variables: { required: false, value: fields<ControlPlaneVariables>(overrides) },
});

const deploymentTopology = fields<MachineDeploymentTopology>({
  metadata: { required: false, value: objectMeta },
  class: { required: true, value: "string" },
  name: { required: true, value: "string" },
  failureDomain: { required: false, value: "string" },
  replicas: { required: false, value: "number" },
  healthCheck: {
    required: false,
    value: fields<MachineDeploymentTopologyHealthCheck>({
      enabled: { required: false, value: "boolean" },
      checks: {
        required: false,
        value: fields<MachineDeploymentTopologyHealthCheckChecks>({
          nodeStartupTimeoutSeconds: { required: false, value: "number" },
          unhealthyNodeConditions: { required: false, value: listOf(nodeCondition) },
          unhealthyMachineConditions: { required: false, value: listOf(machineCondition) },
        }),
      },
      remediation: {
        required: false,
        value: fields<MachineDeploymentTopologyHealthCheckRemediation>({
          maxInFlight: { required: false, value: INT_OR_STRING },
          triggerIf: {
            required: false,
            value: fields<MachineDeploymentTopologyHealthCheckRemediationTriggerIf>({
              unhealthyLessThanOrEqualTo: { required: false, value: INT_OR_STRING },
              unhealthyInRange: { required: false, value: "string" },
            }),
          },
          templateRef: { required: false, value: templateRef },
        }),
      },
    }),
  },
  deletion: {
    required: false,
    value: fields<MachineDeploymentTopologyMachineDeletionSpec>({
      order: { required: false, value: { union: ["Random", "Newest", "Oldest"] } },
      ...deletion,
    }),
  },
  taints: { required: false, value: listOf(taint) },
  minReadySeconds: { required: false, value: "number" },
  readinessGates: { required: false, value: listOf(readinessGate) },
  rollout: {
    required: false,
    value: fields<MachineDeploymentTopologyRolloutSpec>({
      after: { required: false, value: "string" },
      strategy: {
        required: false,
        value: fields<MachineDeploymentTopologyRolloutStrategy>({
          type: { required: true, value: { union: ["RollingUpdate", "OnDelete"] } },
          rollingUpdate: {
            required: false,
            value: fields<MachineDeploymentTopologyRolloutStrategyRollingUpdate>({
              maxUnavailable: { required: false, value: INT_OR_STRING },
              maxSurge: { required: false, value: INT_OR_STRING },
            }),
          },
        }),
      },
    }),
  },
  variables: { required: false, value: fields<MachineDeploymentVariables>(overrides) },
});

const poolTopology = fields<MachinePoolTopology>({
  metadata: { required: false, value: objectMeta },
  class: { required: true, value: "string" },
  name: { required: true, value: "string" },
  failureDomains: { required: false, value: listOf("string") },
  deletion: { required: false, value: fields<MachinePoolTopologyMachineDeletionSpec>(deletion) },
  taints: { required: false, value: listOf(taint) },
  minReadySeconds: { required: false, value: "number" },
  replicas: { required: false, value: "number" },
  variables: { required: false, value: fields<MachinePoolVariables>(overrides) },
});

const topology = fields<Topology>({
  classRef: {
    required: true,
    value: fields<ClusterClassRef>({
      name: { required: true, value: "string" },
      namespace: { required: false, value: "string" },
    }),
  },
  version: { required: true, value: "string" },
  controlPlane: { required: false, value: controlPlaneTopology },
  workers: {
    required: false,
    value: fields<WorkersTopology>({
      machineDeployments: { required: false, value: listOf(deploymentTopology) },
      machinePools: { required: false, value: listOf(poolTopology) },
    }),
  },
  variables: { required: false, value: listOf(variable) },
});

const ranges = fields<NetworkRanges>({ cidrBlocks: { required: true, value: listOf("string") } });

const spec = fields<ClusterSpec>({
  paused: { required: false, value: "boolean" },
  clusterNetwork: {
    required: false,
    value: fields<ClusterNetwork>({
      apiServerPort: { required: false, value: "number" },
      services: { required: false, value: ranges },
      pods: { required: false, value: ranges },
      serviceDomain: { required: false, value: "string" },
    }),
  },
  controlPlaneEndpoint: {
    required: false,
    value: fields<APIEndpoint>({
      host: { required: false, value: "string" },
      port: { required: false, value: "number" },
    }),
  },
  controlPlaneRef: { required: false, value: reference },
  infrastructureRef: { required: false, value: reference },
  topology: { required: false, value: topology },
  availabilityGates: {
    required: false,
    value: listOf(
      fields<ClusterAvailabilityGate>({
        conditionType: { required: true, value: "string" },
        polarity: { required: false, value: { union: ["Positive", "Negative"] } },
      }),
    ),
  },
});

const condition = fields<Condition>({
  type: { required: true, value: "string" },
  status: { required: true, value: STATUS },
  observedGeneration: { required: false, value: "number" },
  lastTransitionTime: { required: true, value: "string" },
  reason: { required: true, value: "string" },
  message: { required: true, value: "string" },
});

const replicaStatus = {
  desiredReplicas: { required: false, value: "number" },
  replicas: { required: false, value: "number" },
  upToDateReplicas: { required: false, value: "number" },
  readyReplicas: { required: false, value: "number" },
  availableReplicas: { required: false, value: "number" },
  versions: {
    required: false,
    value: listOf(
      fields<StatusVersion>({
        version: { required: true, value: "string" },
        replicas: { required: false, value: "number" },
      }),
    ),
  },
  upgradePlan: {
    required: false,
    value: listOf(fields<StatusUpgradePlanVersion>({ version: { required: true, value: "string" } })),
  },
} as const;

const status = fields<ClusterStatus>({
  conditions: { required: false, value: listOf(condition) },
  initialization: {
    required: false,
    value: fields<ClusterInitializationStatus>({
      infrastructureProvisioned: { required: false, value: "boolean" },
      controlPlaneInitialized: { required: false, value: "boolean" },
    }),
  },
  controlPlane: { required: false, value: fields<ClusterControlPlaneStatus>(replicaStatus) },
  workers: { required: false, value: fields<WorkersStatus>(replicaStatus) },
  failureDomains: {
    required: false,
    value: listOf(
      fields<FailureDomain>({
        name: { required: true, value: "string" },
        controlPlane: { required: false, value: "boolean" },
        attributes: { required: false, value: MAP },
      }),
    ),
  },
  phase: {
    required: false,
    value: { union: ["Pending", "Provisioning", "Provisioned", "Deleting", "Failed", "Unknown"] },
  },
  observedGeneration: { required: false, value: "number" },
  deprecated: {
    required: false,
    value: fields<ClusterDeprecatedStatus>({
      v1beta1: {
        required: false,
        value: fields<ClusterV1Beta1DeprecatedStatus>({
          conditions: {
            required: false,
            value: listOf(
              fields<V1Beta1Condition>({
                type: { required: true, value: "string" },
                status: { required: true, value: "string" },
                severity: { required: false, value: "string" },
                lastTransitionTime: { required: true, value: "string" },
                reason: { required: false, value: "string" },
                message: { required: false, value: "string" },
              }),
            ),
          },
          failureReason: { required: false, value: "string" },
          failureMessage: { required: false, value: "string" },
        }),
      },
    }),
  },
});

// What of a value does not fit a shape, by its path.
function misfits(value: unknown, shape: Shape, path: string): string[] {
  if (shape === "json") return [];
  if (shape === "string" || shape === "number" || shape === "boolean") {
    return typeof value === shape ? [] : [`${path}: ${typeof value}, not ${shape}`];
  }
  if ("union" in shape)
    return shape.union.includes(value as string) ? [] : [`${path}: ${String(value)} is not in the union`];
  if ("list" in shape) {
    return Array.isArray(value)
      ? value.flatMap((item, index) => misfits(item, shape.list, `${path}[${index}]`))
      : [`${path}: not a list`];
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path}: not an object`];

  const record = value as Record<string, unknown>;

  if ("map" in shape) return Object.entries(record).flatMap(([key, item]) => misfits(item, "string", `${path}.${key}`));
  return [
    ...Object.keys(record)
      .filter((key) => !(key in shape.fields))
      .map((key) => `${path}.${key}: not declared`),
    ...Object.entries(shape.fields).flatMap(([key, field]) =>
      record[key] === undefined
        ? field.required
          ? [`${path}.${key}: required and missing`]
          : []
        : misfits(record[key], field.value, `${path}.${key}`),
    ),
  ];
}

describe("the types of a Cluster", () => {
  it.each(STATES)("fit every Cluster of %s, read at v1beta2: no field undeclared, no required one missing", (state) => {
    for (const cluster of ofKind<{ apiVersion: string; spec: unknown; status?: unknown }>(
      fixtureSet(state),
      "Cluster",
    )) {
      expect(cluster.apiVersion).toBe("cluster.x-k8s.io/v1beta2");
      expect([
        ...misfits(cluster.spec, spec, "spec"),
        ...(cluster.status === undefined ? [] : misfits(cluster.status, status, "status")),
      ]).toEqual([]);
    }
  });

  it("reads a field that the types do not declare, and a required one missing, as misfits", () => {
    expect(misfits({ topology: { classRef: { name: "a" }, version: "v1", extra: 1 } }, spec, "spec")).toEqual([
      "spec.topology.extra: not declared",
    ]);
    expect(misfits({ controlPlaneRef: { kind: "K", name: "n" } }, spec, "spec")).toEqual([
      "spec.controlPlaneRef.apiGroup: required and missing",
    ]);
  });

  it("fit the input of the rule of Cluster of SPEC-0003, and refuse what the schema requires missing", () => {
    const asInput = (cluster: Cluster): ClusterObject => cluster;
    const reference = { apiGroup: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane", name: "a" };

    expect(asInput).toBeTypeOf("function");

    // @ts-expect-error: a Cluster has a spec (crd:3888)
    const noSpec: Cluster["spec"] = undefined;
    // @ts-expect-error: a topology names its class (crd:3492)
    const noClass: Topology = { version: "v1.37.0" };
    // @ts-expect-error: a topology has a version (crd:3492)
    const noVersion: Topology = { classRef: { name: "quick-start" } };
    // @ts-expect-error: a reference names its group (crd:2101)
    const noGroup: ContractVersionedObjectReference = { kind: reference.kind, name: reference.name };
    // @ts-expect-error: a reference names its kind (crd:2101)
    const noKind: ContractVersionedObjectReference = { apiGroup: reference.apiGroup, name: reference.name };
    // @ts-expect-error: a reference names its object (crd:2137)
    const noName: ContractVersionedObjectReference = { apiGroup: reference.apiGroup, kind: reference.kind };

    expect([noSpec, noClass, noVersion, noGroup, noKind, noName]).toHaveLength(6);
  });
});
