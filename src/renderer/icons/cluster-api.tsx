/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The icon of the root entry of the sidebar (SPEC-0004, P4): drawn for this extension, a management cluster over the
// clusters it runs, monochrome and with no fill of its own, so that the host colors it, and no logo of the project.

import { Renderer } from "@freelensapp/extensions";
import svgIcon from "./cluster-api.svg?raw";

const {
  Component: { Icon },
} = Renderer;

export function ClusterApiIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} svg={svgIcon} />;
}
