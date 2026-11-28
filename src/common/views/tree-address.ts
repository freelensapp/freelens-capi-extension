/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The address of the tree of a Cluster (SPEC-0005, P2): the page `cluster-tree` has two parameters.
//
// - `cluster`, `<namespace>/<name>` of the Cluster, read as SPEC-0004 decided for the parameter `details` of the page of
//   the Clusters: a namespace, a DNS-1123 label, and a name, a DNS-1123 subdomain, joined by one `/`. A value that is
//   no such address names no Cluster, and nothing is read for it.
// - `details`, the node whose details are open, `<group>/<Kind>/<name>`, or `<group>/<Kind>/<namespace>/<name>` for the
//   one node that can live in another namespace than its Cluster, its ClusterClass; empty when no details are open. A
//   group, a kind and a name hold no `/`, so a value has three parts or four, none of them empty, `.` or `..`. Each
//   object is one row of the tree, so a value names one row; the value is only ever looked up among the nodes of the
//   tree, and never sent. A virtual node and an entry of a binding have no details and no address.
//
// Any view opens the tree of a Cluster at an object by navigating to the page `cluster-tree` with both, and at its root
// with `cluster` alone (P1, P2, P3, P5).

import { detailsAddressOf, parseDetailsAddress } from "./details-address";

// The Cluster that the parameter `cluster` names: none, for a page opened with no Cluster (P19, "No Cluster named"); a
// Cluster; or a value that names none, as written (P19, "An address with no Cluster").
export type TreeClusterAddress =
  | { readonly state: "none" }
  | { readonly state: "cluster"; readonly namespace: string; readonly name: string }
  | { readonly state: "invalid"; readonly value: string };

export function parseTreeCluster(value: string | undefined): TreeClusterAddress {
  const address = parseDetailsAddress(value);

  return address.state === "closed" ? { state: "none" } : address;
}

// The node that the parameter `details` names: none, when no details are open; a node, by its address, which is the
// identity of its node in the tree; or a value that names no node, as written (P19, "An address with no node").
export type NodeAddress =
  | { readonly state: "closed" }
  | {
      readonly state: "node";
      readonly id: string;
      readonly group: string;
      readonly kind: string;
      readonly name: string;
      // The namespace of a class that lives in another namespace than its Cluster.
      readonly namespace: string | undefined;
    }
  | { readonly state: "invalid"; readonly value: string };

function isPart(part: string): boolean {
  return part !== "" && part !== "." && part !== "..";
}

export function parseNodeAddress(value: string | undefined): NodeAddress {
  if (value === undefined || value === "") return { state: "closed" };

  const parts = value.split("/");

  if ((parts.length !== 3 && parts.length !== 4) || !parts.every(isPart)) return { state: "invalid", value };

  const [group, kind] = parts;
  const name = parts[parts.length - 1];
  const namespace = parts.length === 4 ? parts[2] : undefined;

  return { state: "node", id: addressOf(group, kind, name, namespace), group, kind, name, namespace };
}

// The address of a node (P2): `<group>/<Kind>/<name>`, or `<group>/<Kind>/<namespace>/<name>` for the class in another
// namespace than its Cluster. It is the identity of the node of that object in the tree.
export function addressOf(group: string, kind: string, name: string, namespace?: string): string {
  return namespace === undefined ? `${group}/${kind}/${name}` : `${group}/${kind}/${namespace}/${name}`;
}

// The parameters of the page that open the tree of a Cluster, at a node with its details when one is named (P2), and
// with no parameter `details` when none is: the navigation of the extension writes every parameter that it is given in
// the address, an empty one included, and the history of the host keeps its parameters without the empty ones, so it
// adds the address once more without it, and one Back would stay on the tree (SPEC-0005, "Notes and deviations").
export function treeParams(namespace: string, name: string, node = ""): { cluster: string; details?: string } {
  const cluster = detailsAddressOf(namespace, name);

  return node === "" ? { cluster } : { cluster, details: node };
}
