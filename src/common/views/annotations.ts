/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The annotations that the details of an object show in a row of their own, in place of those of the metadata of the
// host (SPEC-0005, P20): every annotation but the one that `kubectl apply` writes, which copies the spec of the object
// as it was applied, whose presence alone they say, as held and not shown. The spec of a KubeadmConfig, of its template
// and of a KubeadmControlPlane holds the join tokens, the passwords and the content of the files of SPEC-0001, R3.36,
// which the extension never shows (SPEC-0001, A3), and the spec of an object of a provider may hold the same.
//
// This module alone names that annotation in a view, and reads only whether an object holds it, with `Object.hasOwn`,
// never its value, which the check of Safety of `src/renderer/read-only.test.ts` asserts: the other annotations are
// read by their keys, once that one is left out.

import { fieldsOf, textOf } from "./objects";

import type { KubeObjectData } from "../status/index";

const LAST_APPLIED = "kubectl.kubernetes.io/last-applied-configuration";

export interface ShownAnnotations {
  // Every other annotation, by its key, in the order in which the object holds them.
  readonly shown: readonly { readonly key: string; readonly value: string }[];
  // The keys of the annotations that the object holds and that the details do not show.
  readonly held: readonly string[];
}

export function annotationsOf(object: KubeObjectData): ShownAnnotations {
  const annotations = fieldsOf(fieldsOf(object.metadata)?.annotations);

  if (annotations === undefined) return { shown: [], held: [] };

  const keys = Object.keys(annotations).filter((key) => key !== LAST_APPLIED);

  return {
    shown: keys.map((key) => ({ key, value: textOf(annotations[key]) ?? "" })),
    held: Object.hasOwn(annotations, LAST_APPLIED) ? [LAST_APPLIED] : [],
  };
}
