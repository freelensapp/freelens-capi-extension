/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The pages of the extension in the frame of a cluster as the sessions open them, as pure data and functions, which
// their unit test checks with no app: the address of a page, and the entry of the sidebar of the frame that a session
// waits for before it opens one. A frame that starts draws its sidebar before it loads the extensions, which it does
// not wait for, and the host takes an address that no route that it has enabled serves to its start page; it enables
// the pages of an extension in a frame, and shows the entries of the extension in the sidebar of the frame, under one
// condition, once it has loaded the extension there (SPEC-0004 and SPEC-0005, "Notes and deviations"). Its name does
// not match `*.tests.ts`, so Vitest does not collect it as a session.

// The name of the package of the extension.
export const extensionName = "@freelensapp/capi-extension";

// The id of the root entry of the extension in the sidebar, "Cluster API", which the extension registers on every
// cluster (`ROOT_MENU` of `src/renderer/index.tsx`; SPEC-0004, P4).
export const ROOT_ENTRY = "cluster-api";

// The name of an extension as the host writes it in the address of its pages and in the ids of its entries of the
// sidebar: without its `@`, and with `--` for its `/` (freelens:packages/core/src/extensions/lens-extension.ts:125-127).
function sanitizedName(extension: string): string {
  return extension.replace("@", "").replace("/", "--");
}

/**
 * The address of a page of an extension in the cluster frame,
 * `/extension/<name>/<pageId>`, with the `@` of the name of the extension
 * dropped and its `/` turned into `--`, as the host makes it
 * (freelens:packages/core/src/renderer/routes/for-extension.ts:11-15;
 * freelens:packages/core/src/extensions/lens-extension.ts:125-127).
 */
export function extensionPageAddress(pageId: string, extension = extensionName): string {
  return `/extension/${sanitizedName(extension)}/${pageId}`;
}

/**
 * The test id of the entry of the sidebar of the frame that a session waits
 * for before it opens an address there: for a page of the extension, the root
 * entry of the extension, `sidebar-item-`, the name of the extension and the
 * id of the entry, as the host makes it
 * (freelens:packages/core/src/renderer/components/layout/extension-sidebar-item-registrator.injectable.tsx:46-48;
 * freelens:packages/core/src/extensions/lens-extension.ts:137-139), which the
 * host shows under the condition that enables the pages of the extension in
 * the frame (the same file, line 65;
 * freelens:packages/core/src/renderer/routes/extension-route-registrator.injectable.tsx:44-54);
 * none for any other address, such as a list of the host or a page of another
 * extension.
 */
export function entryBeforeOpening(address: string): string | undefined {
  const path = address.replace(/[?#].*$/, "");

  return path.startsWith(extensionPageAddress(""))
    ? `sidebar-item-${sanitizedName(extensionName)}-${ROOT_ENTRY}`
    : undefined;
}
