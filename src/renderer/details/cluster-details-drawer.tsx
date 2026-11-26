/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The details of the extension (SPEC-0004, P15): the `Drawer` of the host, which the page of the Clusters renders over
// its list, open while the parameter `details` of the page names a Cluster (P6). Its title, "Cluster: <name>", the
// copy of the name, its width, which the details of the host share, and its closing are those of the host: it closes
// on its icon, on Escape, through a listener on the window, and on a click anywhere outside every drawer, which a
// click on a row does not reach, since the row stops the click as it handles it. Its toolbar stays empty until the
// actions of M3. The content renders inside an error boundary of its own, so that an error in the details leaves the
// list.
//
// Closing them by their icon or by Escape gives the focus back to the name of the Cluster in the list. A click outside
// closes them from a listener on the window, after the press of the click has given the focus to the control under
// it: the focus goes back to the name then only while it is still in the details or on the body of the page, so that
// a click on the search, or on any other control, keeps the focus where it landed. The drawer tells a click outside
// from the other ways of closing it by the click that the window sees first, in its capture phase.

import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { useEffect, useRef } from "react";
import { detailsAddressOf } from "../../common/views/details-address";
import { ErrorBoundary } from "../components/error-boundary";
import styles from "./cluster-details.module.scss";
import { SourcedClusterView } from "./cluster-details-v1beta2";

import type { DetailsAddress } from "../../common/views/details-address";
import type { ClusterSource } from "../reads/cluster-source";
import type { ViewHost } from "./cluster-details-v1beta2";

const {
  Component: { Drawer },
} = Renderer;

const DETAILS_TEST_ID = "capi-cluster-details";

export interface ClusterDetailsDrawerProps {
  readonly address: DetailsAddress;
  // The reads of the page, which the details take when the page reads the namespace of the Cluster (P31).
  readonly page: ClusterSource;
  readonly host: ViewHost;
  // Clears the parameter of the page.
  readonly close: () => void;
  // Gives the focus to the name of a Cluster in the list, by its address.
  readonly focusName: (address: string) => void;
}

function titleOf(address: DetailsAddress): string {
  if (address.state === "cluster") return `Cluster: ${address.name}`;
  return address.state === "invalid" ? "Cluster" : "";
}

export const ClusterDetailsDrawer = observer(({ address, page, host, close, focusName }: ClusterDetailsDrawerProps) => {
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
    const back = !outside || active === null || active === document.body || (drawer?.contains(active) ?? false);

    close();
    if (back && address.state === "cluster") focusName(detailsAddressOf(address.namespace, address.name));
  };

  return (
    <Drawer
      open={open}
      title={titleOf(address)}
      onClose={onClose}
      data-testid={DETAILS_TEST_ID}
      testIdForClose={`${DETAILS_TEST_ID}-close`}
    >
      {address.state === "cluster" ? (
        <ErrorBoundary extension={host.extension} resetKey={detailsAddressOf(address.namespace, address.name)}>
          <SourcedClusterView
            page={page}
            namespace={address.namespace}
            name={address.name}
            host={host}
            metadata={true}
          />
        </ErrorBoundary>
      ) : address.state === "invalid" ? (
        <div className={styles.state} role="status" data-testid="capi-details-invalid">
          {`The address names no Cluster: the value of details is "${address.value}", which is not <namespace>/<name>.`}
        </div>
      ) : null}
    </Drawer>
  );
});
