// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Common, host } from "../../test/freelens-extensions";
import { Cluster } from "./api/cluster/cluster-v1beta2";
import CapiRenderer, { CLUSTERS_PAGE, ROOT_MENU } from "./index";

import type { Renderer, Common as Sdk } from "@freelensapp/extensions";

import type * as PageModule from "./pages/clusters-page-v1beta2";

// The props that the registration gives the page of the Clusters, recorded around the page itself.
const pageProps = vi.hoisted(() => [] as unknown[]);

vi.mock("./pages/clusters-page-v1beta2", async (importOriginal) => {
  const actual = await importOriginal<typeof PageModule>();

  return {
    ...actual,
    ClustersPage: (props: PageModule.ClustersPageProps) => {
      pageProps.push(props);
      return <actual.ClustersPage {...props} />;
    },
  };
});

// The cases of SPEC-0004, "Tests", "Unit", `index.test.tsx`: one page with the parameter `details` (P6), inside the
// error boundary of the template; the root entry of the sidebar with its icon and its one child of text (P4); the
// details of Cluster at v1beta2 alone, at priority 250, through `withDetailsErrorBoundary` (P16); `customResources`
// with the model of Cluster alone (SPEC-0001, A7); and no API registered by the extension, at any version (SPEC-0001,
// R7.31).

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
  it("register one page, the page of the Clusters, with the parameter details, given the extension from the registration", () => {
    const renderer = extension();
    const { Page } = renderer.clusterPages[0].components;
    const params = { details: { get: () => "" } } as unknown as Sdk.Types.PageComponentProps["params"];

    expect(renderer.clusterPages.map((page) => page.id)).toEqual([CLUSTERS_PAGE]);
    expect(CLUSTERS_PAGE).toBe("clusters");
    // The address of the Cluster whose details are open, `<namespace>/<name>`, empty while none is (P6).
    expect(renderer.clusterPages[0].params).toEqual({ details: "" });

    pageProps.length = 0;
    render(<Page params={params} />);

    expect(pageProps).toEqual([{ params, extension: renderer }]);
    expect((pageProps[0] as PageModule.ClustersPageProps).extension).toBe(renderer);
    expect((pageProps[0] as PageModule.ClustersPageProps).params).toBe(params);
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

  it("register the details of Cluster at v1beta2 alone, at priority 250, and no menu item", () => {
    const renderer = extension();
    const [details, ...others] = renderer.kubeObjectDetailItems;

    expect(others).toEqual([]);
    expect(details).toMatchObject({ kind: "Cluster", apiVersions: ["cluster.x-k8s.io/v1beta2"], priority: 250 });
    // The host orders the items of its details by 300 less the priority: 50, after its metadata, at 0, and before its
    // custom resource section, at 100, and its events, last (P16).
    expect(300 - (details.priority ?? 50)).toBe(50);
    expect(renderer.kubeObjectMenuItems).toEqual([]);
  });

  it("render the panel inside the error boundary of the template, which keeps an error of the panel in its place", () => {
    const { Details } = extension().kubeObjectDetailItems[0].components;
    // An object whose namespace cannot be read makes the panel throw as it renders.
    const object = {
      getNs: () => {
        throw new TypeError("no namespace");
      },
      getName: () => "a-cluster",
    } as unknown as Renderer.K8sApi.KubeObject;

    Common.logger.error.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <>
        <Details object={object} />
        <p>the details of the host</p>
      </>,
    );

    expect(screen.getByText("TypeError: no namespace")).toBeDefined();
    expect(screen.getByText("the details of the host")).toBeDefined();
    expect(Common.logger.error).toHaveBeenCalledTimes(1);
  });

  it("open the details of another Cluster from the panel through the parameter of the page (P6)", () => {
    const renderer = extension() as Renderer.LensExtension & { openCluster(namespace: string, name: string): void };

    renderer.openCluster("freelens-capi-healthy", "freelens-capi-healthy");

    expect(host.navigateExtension).toHaveBeenCalledWith(CLUSTERS_PAGE, {
      details: "freelens-capi-healthy/freelens-capi-healthy",
    });
  });

  it("register no API, at v1beta1 or at any other version", () => {
    extension();

    expect(host.builtApis).toEqual([]);
    expect(host.apis.size).toBe(0);
  });
});
