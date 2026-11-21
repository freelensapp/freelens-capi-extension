/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import {
  withDetailsErrorBoundary,
  withMenuItemErrorBoundary,
  withPageErrorBoundary,
} from "./components/error-boundary";

// Every page, panel, menu item and preference renders inside an error boundary, so that an error it throws stays in its
// place: the host's nearest boundary would replace the whole root window or the whole cluster view (the table in
// "Renderer Components" of AGENTS.md). Each registration field is mapped through its wrapper, so an entry added to it
// is wrapped too. The extension registers nothing yet: each feature adds its entries with its spec.
export default class CapiRenderer extends Renderer.LensExtension {
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [].map((registration) =>
    withDetailsErrorBoundary(this, registration),
  );

  clusterPages: Renderer.LensExtension["clusterPages"] = [].map((registration) =>
    withPageErrorBoundary(this, registration),
  );

  kubeObjectMenuItems: Renderer.LensExtension["kubeObjectMenuItems"] = [].map((registration) =>
    withMenuItemErrorBoundary(this, registration),
  );
}
