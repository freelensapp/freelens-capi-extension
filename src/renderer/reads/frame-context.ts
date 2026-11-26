/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The context of the frame of the cluster (SPEC-0004, P34), which the extension API gives only through the public
// getter `context` of a store of the extension's own class: the namespaces that the filter selects, whether it selects
// every namespace, `isLoadingAll(namespaces)`, whether a load of those namespaces reads them over the whole cluster,
// and `isGlobalWatchEnabled()`, whether the host may watch every resource of the core group over the whole cluster,
// which it asks the cluster as it connects and again later, with no request of the page.
//
// The page builds one `ClusterStore` for it, once in the frame of a cluster, also when it mounts twice, with the API
// of Clusters at v1beta2 that the host registered, and never loads, registers or subscribes it: the store that the
// page reads stays the host's. Of it the page reads `context` alone. Built so in Freelens dev at v2.0.0 and v2.1.0,
// such a store sent no request and logged nothing (SPEC-0004, P34).

import { ClusterStore } from "../api/cluster/cluster-v1beta2";

import type { ClusterApi } from "../api/cluster/cluster-v1beta2";

export type FrameContext = ClusterStore["context"];

let frameStore: ClusterStore | undefined;

// The context of the frame, from the one store built for it in this frame.
export function frameContextOf(api: ClusterApi): FrameContext {
  frameStore ??= new ClusterStore(api);
  return frameStore.context;
}
