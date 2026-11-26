/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The names of the variables of a Cluster, and of the variables and the patches of a ClusterClass, which their details
// show, and nothing else of them (SPEC-0005, P20): what a Cluster sets for a variable can carry the fields that
// SPEC-0001, A3 never shows and whatever a user writes there, and the patches of a class write fields into its
// templates. This module alone reads them in a view, for their names, which the check of Safety of
// `src/renderer/read-only.test.ts` asserts; the names come from `spec.topology` of a Cluster
// (api/core/v1beta2/cluster_types.go:586, 1332) and from `spec` of a ClusterClass
// (api/core/v1beta2/clusterclass_types.go:128, 137, 890, 1298).

import { fieldsOf, groupOf, listOf, textOf } from "./objects";

import type { KubeObjectData } from "../status/index";

// The names alone, under names that the check of Safety does not take for a read of the variables or the patches.
export interface VariableNames {
  readonly variableNames: readonly string[];
  readonly patchNames: readonly string[];
}

const NONE: VariableNames = { variableNames: [], patchNames: [] };

// The names of the entries of a list, each once, in their order; an entry with no name is left out.
function namesOf(list: unknown): string[] {
  const names = listOf(list).flatMap((entry) => {
    const name = textOf(fieldsOf(entry)?.name);

    return name === undefined || name === "" ? [] : [name];
  });

  return [...new Set(names)];
}

export function variableNamesOf(object: KubeObjectData): VariableNames {
  const spec = fieldsOf(object.spec);

  if (groupOf(textOf(object.apiVersion) ?? "") !== "cluster.x-k8s.io") return NONE;
  switch (textOf(object.kind)) {
    case "Cluster":
      return { variableNames: namesOf(fieldsOf(spec?.topology)?.variables), patchNames: [] };
    case "ClusterClass":
      return { variableNames: namesOf(spec?.variables), patchNames: namesOf(spec?.patches) };
    default:
      return NONE;
  }
}
