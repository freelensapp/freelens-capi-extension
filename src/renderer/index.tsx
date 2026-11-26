/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { Cluster } from "./api/cluster/cluster-v1beta2";
import {
  withDetailsErrorBoundary,
  withMenuItemErrorBoundary,
  withPageErrorBoundary,
} from "./components/error-boundary";
import { ClusterApiIcon } from "./icons/cluster-api";
import { ClustersPage } from "./pages/clusters-page-v1beta2";

// The page of the Clusters, its id in the address of the page and the target of its sidebar entries.
export const CLUSTERS_PAGE = "clusters";

// The root entry of the sidebar of the extension (SPEC-0004, P4).
export const ROOT_MENU = "cluster-api";

// Every page, panel, menu item and preference renders inside an error boundary, so that an error it throws stays in its
// place: the host's nearest boundary would replace the whole root window or the whole cluster view (the table in
// "Renderer Components" of AGENTS.md). Each registration field is mapped through its wrapper, so an entry added to it
// is wrapped too.
export default class CapiRenderer extends Renderer.LensExtension {
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [].map((registration) =>
    withDetailsErrorBoundary(this, registration),
  );

  // The page of the Clusters (SPEC-0004, "The page and its sidebar entry"), its component made once, here.
  clusterPages: Renderer.LensExtension["clusterPages"] = [
    {
      id: CLUSTERS_PAGE,
      components: {
        Page: () => <ClustersPage />,
      },
    },
  ].map((registration) => withPageErrorBoundary(this, registration));

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
}
