/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The rules of what providers serve (SPEC-0003, "The rule of each kind", ClusterResourceSet, IPAM and providers,
// and Objects of a provider; SPEC-0001, R2.86 to R2.88, R1.15 and H1): an IPAddressClaim, whose status the IPAM
// provider writes; the seven kinds of the Cluster API Operator; the objects of a provider, by the role that the
// reference naming them gives; and the kinds of this group with no status, IPAddress and the `Provider` of
// `clusterctl`.
//
// - IPAddressClaim: `Ready`, else `status.addressRef` (P13). The contract of the book asks a `Ready` of the pool
//   only, and asks the provider to set the address on the claim, so a claim with no `Ready` and an address is
//   Healthy, and one with neither is Unknown.
// - The kinds of the operator (P14): their `Ready` copies only the `Available` of the Deployment of the provider, so
//   with `Ready` the kind is Healthy only when `PreflightCheckPassed`, `ProviderInstalled` and `Ready` are all
//   `True`, Unhealthy when `Ready` is `False`, and Degraded when `Ready` is `True` and another of the three is not;
//   a `Ready` that is `Unknown` gives Unknown, as point 2 says. `Ready` is not written while `ProviderInstalled` is
//   not `True`: with no `Ready`, the kind is Unhealthy when `ProviderInstalled` is `False`, or
//   `PreflightCheckPassed` is `False` for another reason than the wait for the core provider, and Unknown
//   otherwise. `ProviderUpgraded` counts by point 3 while `status.installedVersion` differs from `spec.version`;
//   once they match it is stale, no issue, At rest, and noted.
// - The objects of a provider (P15): `Ready` sums them up, `Available` else `Ready` for a control plane, and every
//   other condition of positive polarity makes them Degraded. A remediation request is Unknown, since no contract
//   of the book names a condition of it, and a template of a provider has no status (P16).

import { conditionOf, upgradeSettled } from "./conditions";
import { fieldOf, readFields, readText, UNREADABLE } from "./fields";
import { everyOtherCondition, noStatusRule, summaryHealth, summaryTypeOf, unknownHealth, wordOf } from "./health";

import type { WeightedCondition } from "./conditions";
import type { Health, HealthInput, HealthOutcome, Issue, KindRule, Note, PauseRequest } from "./health";
import type { OperatorKind, ProviderRole } from "./types";

function ipAddressClaimHealth(input: HealthInput): HealthOutcome {
  if (conditionOf(input.conditions, "Ready") !== undefined) {
    return { health: summaryHealth(input.conditions, "Ready", () => false), notes: [] };
  }

  const name = readText(fieldOf(readFields(fieldOf(input.status, "addressRef")), "name"));
  const address = name === UNREADABLE || name === "" ? undefined : name;
  const restsOn = { form: "address", address } as const;
  const notes: Note[] = name === UNREADABLE ? [{ code: "field-unreadable", field: "status.addressRef.name" }] : [];

  return { health: address === undefined ? unknownHealth(restsOn) : { health: "Healthy", restsOn, issues: [] }, notes };
}

export const IP_ADDRESS_CLAIM_RULE: KindRule = {
  kind: "IPAddressClaim",
  apiVersion: "ipam.cluster.x-k8s.io/v1beta2",
  hasStatus: true,
  summary: ["Ready"],
  provider: "from-context",
  pause: "cluster",
  observedGeneration: "summary",
  followsWorkloadCluster: false,
  deprecatedFailure: false,
  health: ipAddressClaimHealth,
};

export const IP_ADDRESS_RULE: KindRule = noStatusRule("IPAddress", "ipam.cluster.x-k8s.io/v1beta2");

export const CLUSTERCTL_PROVIDER_RULE: KindRule = noStatusRule("Provider", "clusterctl.cluster.x-k8s.io/v1alpha3");

// The kinds of the operator

// The wait for the core provider, which the operator treats as no error (P14;
// cluster-api-operator:internal/controller/preflight_checks.go:51, 147-158).
const WAITING_FOR_CORE_PROVIDER = "WaitingForCoreProviderReady";

// A condition that the rule of the operator wants `True`, and that is not.
function notTrue(conditions: readonly WeightedCondition[], type: string): Issue[] {
  const condition = conditionOf(conditions, type);

  return condition?.status === "True" ? [] : [{ form: "condition", type, condition }];
}

function operatorHealth(input: HealthInput): HealthOutcome {
  const { conditions } = input;
  const ready = conditionOf(conditions, "Ready");
  const installed = conditionOf(conditions, "ProviderInstalled");
  const preflight = conditionOf(conditions, "PreflightCheckPassed");
  const upgraded = conditionOf(conditions, "ProviderUpgraded");
  const settled = upgradeSettled(input.object);
  const notes: Note[] =
    upgraded?.status === "False" && settled ? [{ code: "stale-condition", type: "ProviderUpgraded" }] : [];
  const restsOn = (type: string, condition: WeightedCondition | undefined) =>
    ({ form: "condition", type, condition }) as const;

  if (ready !== undefined) {
    const issues = [
      ...notTrue(conditions, "PreflightCheckPassed"),
      ...notTrue(conditions, "ProviderInstalled"),
      ...(upgraded?.weight === "Issue"
        ? [{ form: "condition", type: "ProviderUpgraded", condition: upgraded } as const]
        : []),
    ];

    return { health: { health: wordOf(ready, issues), restsOn: restsOn("Ready", ready), issues }, notes };
  }

  let health: Health = unknownHealth(restsOn("Ready", undefined));

  if (installed?.status === "False") {
    health = { health: "Unhealthy", restsOn: restsOn("ProviderInstalled", installed), issues: [] };
  } else if (preflight?.status === "False" && preflight.reason !== WAITING_FOR_CORE_PROVIDER) {
    health = { health: "Unhealthy", restsOn: restsOn("PreflightCheckPassed", preflight), issues: [] };
  }
  return { health, notes };
}

function operatorRule(kind: OperatorKind): KindRule {
  return {
    kind,
    apiVersion: "operator.cluster.x-k8s.io/v1alpha2",
    hasStatus: true,
    summary: ["Ready"],
    provider: undefined,
    pause: "none",
    observedGeneration: "status",
    followsWorkloadCluster: false,
    deprecatedFailure: false,
    health: operatorHealth,
  };
}

export const OPERATOR_RULES: readonly KindRule[] = (
  [
    "CoreProvider",
    "BootstrapProvider",
    "ControlPlaneProvider",
    "InfrastructureProvider",
    "AddonProvider",
    "IPAMProvider",
    "RuntimeExtensionProvider",
  ] as const
).map(operatorRule);

// The objects of a provider

// The roles whose contracts ask their controllers to honour the request of a pause, as the kinds of Cluster API do
// (P19): those of an infrastructure cluster, machine and machine pool, of a control plane and of a bootstrap config
// (docs/book/src/developer/providers/contracts/bootstrap-config.md:474-476).
const PAUSED_BY_REQUEST: readonly ProviderRole[] = [
  "infrastructure-cluster",
  "infrastructure-machine",
  "infrastructure-machine-pool",
  "control-plane",
  "bootstrap-config",
];

function providerHealth(rule: KindRule): (input: HealthInput) => HealthOutcome {
  return (input) => {
    if (rule.role === "remediation-request") {
      return { health: unknownHealth(), notes: [{ code: "no-contract-status" }] };
    }

    const summary = summaryTypeOf(rule, input.conditions) ?? "Ready";

    return { health: summaryHealth(input.conditions, summary, everyOtherCondition), notes: [] };
  };
}

// The rule of an object of a provider, from its role. Its conditions are read as those of an object of a provider
// (conditions.ts), its pause as its contract asks, and its generation from its status, else from its summary.
export function providerRule(kind: string, role: ProviderRole): KindRule {
  if (role === "template") return noStatusRule(kind, undefined, role);

  const pause: PauseRequest = PAUSED_BY_REQUEST.includes(role) ? "object-or-cluster" : "none";
  const rule: KindRule = {
    kind,
    role,
    hasStatus: true,
    summary: role === "control-plane" ? ["Available", "Ready"] : role === "remediation-request" ? [] : ["Ready"],
    provider: "from-context",
    pause,
    observedGeneration: "status-else-summary",
    followsWorkloadCluster: role === "control-plane",
    deprecatedFailure: false,
  };

  return { ...rule, health: providerHealth(rule) };
}
