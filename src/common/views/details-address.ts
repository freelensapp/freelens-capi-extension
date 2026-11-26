/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The address of the details of a Cluster (SPEC-0004, P6): the parameter `details` of the page of the Clusters holds
// `<namespace>/<name>` of the Cluster whose details are open. The list sets it, closing the details clears it, and any
// view opens the details of a Cluster by navigating to the page with it. A namespace and a name hold no `/`, so a value
// that is not two names joined by one `/` names no Cluster: the details say so, with the value as written, and nothing
// is read for it.

export type DetailsAddress =
  // No details are open.
  | { readonly state: "closed" }
  | { readonly state: "cluster"; readonly namespace: string; readonly name: string }
  // A value that names no Cluster, as written.
  | { readonly state: "invalid"; readonly value: string };

export function parseDetailsAddress(value: string | undefined): DetailsAddress {
  if (value === undefined || value === "") return { state: "closed" };

  const parts = value.split("/");

  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return { state: "invalid", value };
  return { state: "cluster", namespace: parts[0], name: parts[1] };
}

// The value of the parameter for a Cluster.
export function detailsAddressOf(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}
