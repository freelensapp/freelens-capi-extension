/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { detailsAddressOf } from "../common/views/details-address";
import { treeParams } from "../common/views/tree-address";
import { Cluster } from "./api/cluster/cluster-v1beta2";
import {
  withDetailsErrorBoundary,
  withMenuItemErrorBoundary,
  withPageErrorBoundary,
} from "./components/error-boundary";
import { ClusterPanel } from "./details/cluster-details-v1beta2";
import { ClusterApiIcon } from "./icons/cluster-api";
import { ClusterTreePage } from "./pages/cluster-tree-page";
import { ClustersPage } from "./pages/clusters-page-v1beta2";
import { CLUSTERS_PAGE, TREE_PAGE } from "./pages/page-ids";

import type { Common } from "@freelensapp/extensions";

// The page of the Clusters, its id in the address of the page and the target of its sidebar entries; and the page of
// the tree of a Cluster (SPEC-0005, P1).
export { CLUSTERS_PAGE, TREE_PAGE };

// The root entry of the sidebar of the extension (SPEC-0004, P4).
export const ROOT_MENU = "cluster-api";

// Every page, panel, menu item and preference renders inside an error boundary, so that an error it throws stays in its
// place: the host's nearest boundary would replace the whole root window or the whole cluster view (the table in
// "Renderer Components" of AGENTS.md). Each registration field is mapped through its wrapper, so an entry added to it
// is wrapped too.
export default class CapiRenderer extends Renderer.LensExtension {
  // The details of a Cluster at v1beta2 in the details of the host, after its metadata and before its custom resource
  // section and its events: priority 250, so order 50 (SPEC-0004, P16). The panel opens the details of another
  // Cluster through the parameter of the page (P6), and the tree of its Cluster, at a node or at its root, through the
  // parameters of the page of the tree (SPEC-0005, P3, P5).
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
    Renderer.K8sApi.detailsFor(Cluster, {
      priority: 250,
      Details: (props) => (
        <ClusterPanel {...props} extension={this} openCluster={this.openCluster} openTree={this.openTree} />
      ),
    }),
  ].map((registration) => withDetailsErrorBoundary(this, registration));

  // The page of the Clusters (SPEC-0004, "The page and its sidebar entry"), its component made once, here, and given
  // the extension from the registration, since the host passes a page its parameters alone (AGENTS.md, "Renderer
  // Components"), with the parameter `details`, the address of the Cluster whose details are open (P6). The page of the
  // tree of a Cluster, with no entry in the sidebar, and its parameters `cluster`, the address of its Cluster, and
  // `details`, the node whose details are open (SPEC-0005, P1, P2).
  clusterPages: Renderer.LensExtension["clusterPages"] = Array.of<Renderer.LensExtension["clusterPages"][number]>(
    {
      id: CLUSTERS_PAGE,
      params: { details: "" },
      components: {
        Page: (props: Common.Types.PageComponentProps) => <ClustersPage {...props} extension={this} />,
      },
    },
    {
      id: TREE_PAGE,
      params: { cluster: "", details: "" },
      components: {
        Page: (props: Common.Types.PageComponentProps) => <ClusterTreePage {...props} extension={this} />,
      },
    },
  ).map((registration) => withPageErrorBoundary(this, registration));

  // The root entry, "Cluster API", with its icon and the page of the Clusters as its target, on every cluster, so
  // that the page says why a cluster has none; and its one child, text only (SPEC-0004, P4). The icon only passes its
  // props and a fixed SVG to the `Icon` of the host, and is left with no boundary (AGENTS.md, "Renderer Components").
  clusterPageMenus: Renderer.LensExtension["clusterPageMenus"] = [
    {
      id: ROOT_MENU,
      title: "Cluster API",
      target: { pageId: CLUSTERS_PAGE },
      components: {
        Icon: ClusterApiIcon,
      },
    },
    {
      id: CLUSTERS_PAGE,
      parentId: ROOT_MENU,
      title: Cluster.crd.title,
      target: { pageId: CLUSTERS_PAGE },
      components: {},
    },
  ];

  // The model of Cluster at v1beta2, so that the Custom Resources tree of the host does not list the Clusters a second
  // time next to the page; their list and details of the host stay reachable by their address (SPEC-0001, A7, R7.13).
  // The models of the context of SPEC-0004, P1 have no page and stay out of it.
  customResources = [Cluster];

  kubeObjectMenuItems: Renderer.LensExtension["kubeObjectMenuItems"] = [].map((registration) =>
    withMenuItemErrorBoundary(this, registration),
  );

  // Opens the details of a Cluster, from a view that is not on the page of the Clusters (P6).
  readonly openCluster = (namespace: string, name: string): void => {
    void this.navigate(CLUSTERS_PAGE, { details: detailsAddressOf(namespace, name) });
  };

  // Opens the tree of a Cluster, at a node with its details when one is named (SPEC-0005, P2, P3, P5). The navigation
  // of the extension builds the address of the page from these parameters alone.
  readonly openTree = (namespace: string, name: string, node = ""): void => {
    void this.navigate(TREE_PAGE, treeParams(namespace, name, node));
  };
}
