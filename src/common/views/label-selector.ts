/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The selection of the Clusters of a ClusterResourceSet (SPEC-0005, P7), read as its controller reads its
// `spec.clusterSelector` (core/reconcilers/clusterresourceset/clusterresourceset_controller.go:260-288): a label
// selector of Kubernetes, whose `matchLabels` each ask a label of that value, and whose `matchExpressions` each ask, by
// their operator, a label with one of their values (In), with none of them or no such label (NotIn), the label
// (Exists), or no such label (DoesNotExist). An empty or absent selector selects no Cluster, as the controller decides,
// unlike a selector of Kubernetes elsewhere; and so does one that Kubernetes refuses to convert, since the controller
// then selects nothing (clusterresourceset_controller.go:265-268): an operator that it does not know, In or NotIn with
// no values, Exists or DoesNotExist with some, a field that is not of its type, a key that is not the key of a label,
// or a value that is not the value of a label, as the syntax of the labels of Kubernetes gives them. The admission
// webhook of the project refuses such a selector (core/webhooks/admission/clusterresourceset.go:78-84), which a
// cluster without that webhook may hold.

import { fieldsOf, isFields, listOf, textOf } from "./objects";

import type { Fields } from "./objects";

type Requirement = (labels: Fields) => boolean;

// A name of a label key, and a value of a label: 63 characters at most, letters and digits at its two ends, letters,
// digits, `-`, `_` and `.` between them; a value may also be empty. The prefix of a key, before its one `/`, is a DNS
// subdomain of 253 characters at most: lowercase letters, digits, `-` and `.`, each of its parts with a letter or a
// digit at its two ends.
const NAME = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;
const SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

function isName(text: string): boolean {
  return text.length <= 63 && NAME.test(text);
}

function isKey(key: string): boolean {
  const parts = key.split("/");

  if (parts.length > 2) return false;
  if (parts.length === 2 && (parts[0].length > 253 || !SUBDOMAIN.test(parts[0]))) return false;
  return isName(parts[parts.length - 1]);
}

function isValue(value: string): boolean {
  return value === "" || isName(value);
}

function has(labels: Fields, key: string): boolean {
  return Object.hasOwn(labels, key) && typeof labels[key] === "string";
}

// A requirement of `matchExpressions`, or undefined for one that Kubernetes refuses.
function requirementOf(value: unknown): Requirement | undefined {
  const fields = fieldsOf(value);
  const key = textOf(fields?.key);
  const operator = textOf(fields?.operator);
  const written = fields?.values;
  const values = listOf(written);

  if (key === undefined || operator === undefined || !isKey(key)) return undefined;
  if (written !== undefined && !Array.isArray(written)) return undefined;
  if (values.some((entry) => typeof entry !== "string" || !isValue(entry))) return undefined;
  switch (operator) {
    case "In":
      return values.length === 0 ? undefined : (labels) => has(labels, key) && values.includes(labels[key]);
    case "NotIn":
      return values.length === 0 ? undefined : (labels) => !has(labels, key) || !values.includes(labels[key]);
    case "Exists":
      return values.length > 0 ? undefined : (labels) => has(labels, key);
    case "DoesNotExist":
      return values.length > 0 ? undefined : (labels) => !has(labels, key);
    default:
      return undefined;
  }
}

// The requirements of a selector: one for each label of `matchLabels`, and one for each expression; undefined when
// Kubernetes refuses the selector.
function requirementsOf(selector: unknown): Requirement[] | undefined {
  const fields = fieldsOf(selector);
  const matchLabels = fields?.matchLabels;
  const matchExpressions = fields?.matchExpressions;

  if (matchLabels !== undefined && !isFields(matchLabels)) return undefined;
  if (matchExpressions !== undefined && !Array.isArray(matchExpressions)) return undefined;

  const labels = Object.entries(fieldsOf(matchLabels) ?? {});

  if (labels.some(([key, value]) => typeof value !== "string" || !isKey(key) || !isValue(value))) return undefined;

  const expressions = listOf(matchExpressions).map(requirementOf);

  if (expressions.includes(undefined)) return undefined;
  return [
    ...labels.map(
      ([key, value]): Requirement =>
        (written) =>
          has(written, key) && written[key] === value,
    ),
    ...(expressions as Requirement[]),
  ];
}

// Whether a selector of a ClusterResourceSet selects a Cluster with these labels.
export function selectorSelects(selector: unknown, labels: unknown): boolean {
  const requirements = requirementsOf(selector);
  const written = fieldsOf(labels) ?? {};

  if (requirements === undefined || requirements.length === 0) return false;
  return requirements.every((requirement) => requirement(written));
}
