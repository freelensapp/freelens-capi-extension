/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The words of the views that the closed sets of SPEC-0003 give (DESIGN.md, "Words").

import type { ActivityName, ProviderRole } from "../status/index";

// The activities in the order of the closed set of SPEC-0003, "The closed sets", in which the views list them and
// the list sorts its rows (SPEC-0004, P28). The order is the model's: a unit test compares the two.
export const ACTIVITY_ORDER = [
  "Deleting",
  "Paused",
  "Rollout paused",
  "Provisioning",
  "Upgrading",
  "Rolling out",
  "Scaling up",
  "Scaling down",
  "Remediating",
  "Updating",
  "Replacing",
] as const satisfies readonly ActivityName[];

// Every activity of the model is in the order: a name that the model adds and that is missing here fails the type
// check.
type Missing = Exclude<ActivityName, (typeof ACTIVITY_ORDER)[number]>;
const COVERS_EVERY_ACTIVITY: [Missing] extends [never] ? true : never = true;

void COVERS_EVERY_ACTIVITY;

// The roles of the objects of a provider, in the words of the closed set of SPEC-0003, the eight of `ProviderRole`
// (SPEC-0003, P15; DESIGN.md, "Words"), which the tree writes after the name of such an object (SPEC-0005, P9).
export const ROLE_WORDS = {
  "infrastructure-cluster": "infrastructure cluster",
  "control-plane": "control plane",
  "infrastructure-machine": "infrastructure machine",
  "bootstrap-config": "bootstrap config",
  "infrastructure-machine-pool": "infrastructure machine pool",
  "ipam-pool": "IPAM pool",
  "remediation-request": "remediation request",
  template: "template",
} as const satisfies Record<ProviderRole, string>;
