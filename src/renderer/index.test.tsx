// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Common, host } from "../../test/freelens-extensions";
import { Cluster } from "./api/cluster/cluster-v1beta2";
import CapiRenderer, { CLUSTERS_PAGE, ROOT_MENU } from "./index";

import type { Renderer } from "@freelensapp/extensions";

// The cases of SPEC-0004, "Tests", "Unit", `index.test.tsx`, for the registrations of the first pull request: the page
// of the Clusters inside the error boundary of the template, the root entry of the sidebar with its icon and its one
// child of text (P4), `customResources` with the model of Cluster alone (SPEC-0001, A7), and no API registered by the
// extension, at any version (SPEC-0001, R7.31).

function extension(): Renderer.LensExtension {
  return new (CapiRenderer as unknown as new (manifest: { name: string }) => Renderer.LensExtension)({
    name: "@freelensapp/capi-extension",
  });
}

beforeEach(() => {
  host.reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the registrations of the renderer", () => {
  it("register one page, the page of the Clusters", () => {
    const renderer = extension();

    expect(renderer.clusterPages.map((page) => page.id)).toEqual([CLUSTERS_PAGE]);
    expect(CLUSTERS_PAGE).toBe("clusters");
  });

  it("register the root entry, Cluster API, with its icon and the page as its target, and one child of text", () => {
    const [root, ...children] = extension().clusterPageMenus;

    expect(root).toMatchObject({ id: ROOT_MENU, title: "Cluster API", target: { pageId: CLUSTERS_PAGE } });
    expect(root.components.Icon).toBeTypeOf("function");
    expect(root.parentId).toBeUndefined();
    expect(root.visible).toBeUndefined();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      parentId: ROOT_MENU,
      title: "Workload Clusters",
      target: { pageId: CLUSTERS_PAGE },
    });
    expect(children[0].components.Icon).toBeUndefined();
  });

  it("render the page inside the error boundary of the template, which keeps an error of the page in its place", () => {
    const { Page } = extension().clusterPages[0].components;

    // A definition that the page cannot read makes it throw as it renders.
    runInAction(() => {
      host.crdStore.items = [{}];
    });
    Common.logger.error.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <>
        <Page params={{}} />
        <p>sidebar</p>
      </>,
    );

    expect(screen.getByText(/^TypeError: /)).toBeDefined();
    expect(screen.getByText("sidebar")).toBeDefined();
    expect(Common.logger.error).toHaveBeenCalledTimes(1);
  });

  it("list in customResources the model of Cluster alone, and no model of the context", () => {
    expect(extension().customResources).toEqual([Cluster]);
  });

  it("register no details and no menu item yet, which come with the details of the second pull request", () => {
    const renderer = extension();

    expect(renderer.kubeObjectDetailItems).toEqual([]);
    expect(renderer.kubeObjectMenuItems).toEqual([]);
  });

  it("register no API, at v1beta1 or at any other version", () => {
    extension();

    expect(host.builtApis).toEqual([]);
    expect(host.apis.size).toBe(0);
  });
});
