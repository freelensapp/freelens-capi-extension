/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The words of the views that the closed sets of SPEC-0003 give (DESIGN.md, "Words").

import type { ActivityName } from "../status/index";

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
