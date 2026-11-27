/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The details of a node of the tree of a Cluster (SPEC-0005, P17): the `Drawer` of the host, which the page of the tree
// renders over the tree, outside the box of its table, open while the parameter `details` of the page names a node
// (P2). Its title, `<Kind>: <name>`, the copy of the name, its width, which the details of the host share, and its
// closing are those of the host: it closes on its icon, on Escape, through a listener on the window, and on a click
// outside every drawer, which a click on a row does not reach, since the row stops the click as it handles it. Its
// toolbar stays empty until the actions of M3. Its content is computed and rendered inside an error boundary of its
// own, keyed by the node, so that an error in the details leaves the tree (P17, P19): the page hands it the function
// that computes what it shows, and its title comes from the address alone.
//
// The details of the root are those of a Cluster (SPEC-0004), from the read of the tree, with no row Tree; those of any
// other node, read or not, are those of `object-details.tsx`. A value that names no node says so, as written; a node
// that the tree does not hold says that no such object is in the tree of the Cluster, or that it is no longer, for one
// that was there, and shows the spinner while its kind loads (P19).
//
// The host gives the focus nowhere when the drawer closes (H11): the page gives it back to the element of the tree
// once the row of the node is in view. A click outside closes the drawer from a listener on the window, after the press
// of the click has given the focus to the control under it: the focus goes back to the tree then only while it is
// still in the details or on the body of the page, so that a click on the search, or on any other control, keeps the
// focus where it landed, as the details of a Cluster do (SPEC-0004, P15).

import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { useEffect, useRef } from "react";
import { ErrorBoundary } from "../components/error-boundary";
import styles from "./cluster-details.module.scss";
import { ClusterView } from "./cluster-details-v1beta2";
import { ObjectDetails } from "./object-details";

import type { NodeDetails } from "../../common/views/node-details";
import type { NodeAddress } from "../../common/views/tree-address";
import type { ClusterSource } from "../reads/cluster-source";
import type { MessageLinks, ViewHost } from "./cluster-details-v1beta2";

const {
  Component: { Drawer, Spinner },
} = Renderer;

const DETAILS_TEST_ID = "capi-tree-details";

// What the drawer shows of the node that the address names.
export type DrawerContent =
  // The tree is not shown yet, or the kind of the node is still being read.
  | { readonly state: "loading" }
  | { readonly state: "root" }
  | { readonly state: "node"; readonly details: NodeDetails }
  // The tree does not hold the node: never there, or no longer, for one that was there in this mount of the page.
  | { readonly state: "absent"; readonly gone: boolean };

export interface TreeDetailsDrawerProps {
  readonly address: NodeAddress;
  // What the drawer shows of the node of the address, computed inside the error boundary of the drawer.
  readonly contentOf: () => DrawerContent;
  // The Cluster of the tree, by its namespace and its name.
  readonly namespace: string;
  readonly name: string;
  // The read of the tree, which the details of the root take (SPEC-0005, P6, P17).
  readonly source: ClusterSource;
  readonly host: ViewHost;
  readonly links: MessageLinks;
  readonly openNode: (node: string) => void;
  // Closes the details, with whether the focus goes back to the tree.
  readonly close: (focusBack: boolean) => void;
}

// The title of the host, `<Kind>: <name>`, as the address names the node, with its namespace for the class read in
// another namespace, as its row names it; "Details" for an address that names no node.
function titleOf(address: NodeAddress): string {
  if (address.state === "closed") return "";
  if (address.state === "invalid") return "Details";
  return `${address.kind}: ${address.namespace === undefined ? address.name : `${address.namespace}/${address.name}`}`;
}

type BodyProps = Omit<TreeDetailsDrawerProps, "close" | "address"> & {
  readonly address: Extract<NodeAddress, { readonly state: "node" }>;
};

// What the drawer shows of the node of the address, computed here, inside the error boundary of the drawer: the
// spinner, that the node is not in the tree, the details of the root, or those of the node (P17, P19).
function DrawerBody({ address, contentOf, namespace, name, source, host, links, openNode }: BodyProps) {
  const content = contentOf();

  switch (content.state) {
    case "loading":
      return <Spinner center data-testid="capi-tree-details-loading" />;
    case "absent":
      return (
        <div className={styles.state} role="status" data-testid="capi-tree-details-absent">
          {content.gone
            ? `No such object is in the tree of the Cluster ${namespace}/${name} any longer: ${address.kind} ${address.name} was there, and is gone.`
            : `No such object is in the tree of the Cluster ${namespace}/${name}, which was read: ${address.kind} ${address.name}.`}
        </div>
      );
    case "root":
      return <ClusterView source={source} namespace={namespace} name={name} host={host} metadata={true} inTree />;
    case "node":
      return <ObjectDetails details={content.details} host={host} links={links} openNode={openNode} />;
  }
}

export const TreeDetailsDrawer = observer((props: TreeDetailsDrawerProps) => {
  const { address, close, ...body } = props;
  const { host } = props;
  const open = address.state !== "closed";
  // The target of the click that the window is dispatching, if any.
  const click = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = (event: MouseEvent) => {
      click.current = event.target;
      clearTimeout(timer);
      // Once every listener of the click has run.
      timer = setTimeout(() => {
        click.current = null;
      });
    };

    window.addEventListener("click", record, true);
    return () => {
      window.removeEventListener("click", record, true);
      clearTimeout(timer);
      click.current = null;
    };
  }, [open]);

  const onClose = () => {
    const drawer = document.querySelector(`[data-testid="${DETAILS_TEST_ID}"]`);
    const target = click.current;
    const outside = target instanceof Node && !(drawer?.contains(target) ?? false);
    const active = document.activeElement;

    close(!outside || active === null || active === document.body || (drawer?.contains(active) ?? false));
  };

  return (
    <Drawer
      open={open}
      title={titleOf(address)}
      onClose={onClose}
      data-testid={DETAILS_TEST_ID}
      testIdForClose={`${DETAILS_TEST_ID}-close`}
    >
      {address.state === "invalid" ? (
        <div className={styles.state} role="status" data-testid="capi-tree-details-invalid">
          {`The address names no object: the value of details is "${address.value}", which is not <group>/<Kind>/<name>, or <group>/<Kind>/<namespace>/<name> for a class in another namespace.`}
        </div>
      ) : address.state === "closed" ? null : (
        <ErrorBoundary extension={host.extension} resetKey={address.id}>
          <DrawerBody {...body} address={address} />
        </ErrorBoundary>
      )}
    </Drawer>
  );
});
