import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { DEFINITIONS } from "../../../test/host-stores";
import { DefinitionReads } from "./definitions";

import type { Renderer } from "@freelensapp/extensions";

import type { DefinitionsHost, DefinitionsStore } from "./definitions";

// The definitions that the page reads for the references of its Clusters (SPEC-0004, P3): from the store of
// definitions of the host while it gives them, else with a GET of one definition by its name, whose plural the API
// that the host registered from the discovery gives.

type HostObject = Renderer.K8sApi.KubeObject;

const KCP = { group: "controlplane.cluster.x-k8s.io", kind: "KubeadmControlPlane" };
const KCP_API = { apiBase: "/apis/controlplane.cluster.x-k8s.io/v1beta2/kubeadmcontrolplanes" };
const KCP_DEFINITION = "kubeadmcontrolplanes.controlplane.cluster.x-k8s.io";

// The host of a test: its store of definitions, its registry of APIs, and the GET of a definition.
function host(state: { isLoaded: boolean; failedLoading: boolean; items: readonly HostObject[] }) {
  const store: { -readonly [Key in keyof DefinitionsStore]: DefinitionsStore[Key] } = observable(
    { isLoaded: state.isLoaded, failedLoading: state.failedLoading, items: state.items },
    {},
    { deep: false },
  );
  const get = vi.fn<DefinitionsHost["get"]>(async () => DEFINITIONS[1] as unknown as HostObject);
  const findApi = vi.fn<DefinitionsHost["findApi"]>((group, kind) =>
    group === KCP.group && kind === KCP.kind ? KCP_API : undefined,
  );

  return { store, get, findApi, host: { store: () => store, findApi, get } satisfies DefinitionsHost };
}

// The `Status` of Kubernetes that the client of the host throws for a refused GET.
const REFUSED = new Error("Failed to get", {
  cause: { kind: "Status", code: 403, message: 'customresourcedefinitions.apiextensions.k8s.io "x" is forbidden' },
});

describe("the definitions of the references (P3)", () => {
  it("come from the store of definitions while it gives them, with no GET", () => {
    const { host: definitionsHost, get } = host({
      isLoaded: true,
      failedLoading: false,
      items: DEFINITIONS as unknown as HostObject[],
    });
    const reads = new DefinitionReads(definitionsHost);

    reads.request([KCP]);

    expect(get).not.toHaveBeenCalled();
    expect(reads.readOf(KCP.group, KCP.kind)).toMatchObject({ state: "read", definition: { kind: KCP.kind } });
    expect(reads.readOf("controlplane.example.test", "ExampleControlPlane")).toEqual({ state: "not-served" });
  });

  it("come from one GET for each name in a mount, named from the API that the host registered from the discovery", async () => {
    const { host: definitionsHost, get } = host({ isLoaded: false, failedLoading: true, items: [] });
    const reads = new DefinitionReads(definitionsHost);

    expect(reads.readOf(KCP.group, KCP.kind)).toEqual({ state: "pending" });

    reads.request([KCP]);
    reads.request([KCP, KCP]);
    await vi.waitFor(() => expect(reads.readOf(KCP.group, KCP.kind).state).toBe("read"));

    expect(get.mock.calls).toEqual([[KCP_DEFINITION]]);
  });

  it("say refused for a GET that the cluster refuses, and not served for a kind with no API, which it never asks for", async () => {
    const { host: definitionsHost, get } = host({ isLoaded: false, failedLoading: true, items: [] });
    const reads = new DefinitionReads(definitionsHost);

    get.mockRejectedValueOnce(REFUSED);
    reads.request([KCP, { group: "controlplane.example.test", kind: "ExampleControlPlane" }]);
    await vi.waitFor(() => expect(reads.readOf(KCP.group, KCP.kind).state).toBe("refused"));

    expect(reads.readOf(KCP.group, KCP.kind)).toMatchObject({ failure: { refused: true } });
    expect(reads.readOf("controlplane.example.test", "ExampleControlPlane")).toEqual({ state: "not-served" });
    expect(get.mock.calls).toEqual([[KCP_DEFINITION]]);
  });

  it("are asked for when the store of definitions fails after the first request, and not before", async () => {
    const {
      host: definitionsHost,
      get,
      store,
    } = host({
      isLoaded: true,
      failedLoading: false,
      items: DEFINITIONS as unknown as HostObject[],
    });
    const reads = new DefinitionReads(definitionsHost);

    reads.request([KCP]);
    expect(get).not.toHaveBeenCalled();

    runInAction(() => {
      store.items = [];
      store.failedLoading = true;
    });
    reads.request([KCP]);
    await vi.waitFor(() => expect(reads.readOf(KCP.group, KCP.kind).state).toBe("read"));

    expect(get.mock.calls).toEqual([[KCP_DEFINITION]]);
  });
});
