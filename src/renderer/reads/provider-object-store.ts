/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The store of the extension's own class for the objects of a kind of a provider, whose kind is known at run time
// alone, from the reference that names it (SPEC-0001, A6; SPEC-0004, P31): a control plane of another provider, or an
// infrastructure cluster. A view of one Cluster builds one, with the API that the host registered for that kind at the
// version of its contract, and never registers it, so that the store that the host returns for that API stays its own.

import { Renderer } from "@freelensapp/extensions";

export class ProviderObjectStore extends Renderer.K8sApi.KubeObjectStore {}
