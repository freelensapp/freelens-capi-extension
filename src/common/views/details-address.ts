/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The address of the details of a Cluster (SPEC-0004, P6): the parameter `details` of the page of the Clusters holds
// `<namespace>/<name>` of the Cluster whose details are open. The list sets it, closing the details clears it, and any
// view opens the details of a Cluster by navigating to the page with it. A namespace is a DNS-1123 label and the name
// of a Cluster a DNS-1123 subdomain, as the API server takes them, so a value that is not such a namespace and such a
// name joined by one `/` names no Cluster: the details say so, with the value as written, and nothing is read for it.
// The host joins the namespace into the path of its requests as it is, so a value such as `../x` would otherwise
// read over the whole cluster.

export type DetailsAddress =
  // No details are open.
  | { readonly state: "closed" }
  | { readonly state: "cluster"; readonly namespace: string; readonly name: string }
  // A value that names no Cluster, as written.
  | { readonly state: "invalid"; readonly value: string };

// A DNS-1123 label, of at most 63 characters, and a DNS-1123 subdomain, of at most 253: lowercase letters, digits and
// `-`, starting and ending with a letter or a digit, the labels of a subdomain joined by `.`. Neither is `.` or `..`.
const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

function isNamespace(value: string): boolean {
  return value.length <= 63 && LABEL.test(value);
}

function isName(value: string): boolean {
  return value.length <= 253 && SUBDOMAIN.test(value);
}

export function parseDetailsAddress(value: string | undefined): DetailsAddress {
  if (value === undefined || value === "") return { state: "closed" };

  const parts = value.split("/");

  if (parts.length !== 2 || !isNamespace(parts[0]) || !isName(parts[1])) return { state: "invalid", value };
  return { state: "cluster", namespace: parts[0], name: parts[1] };
}

// The value of the parameter for a Cluster.
export function detailsAddressOf(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}
