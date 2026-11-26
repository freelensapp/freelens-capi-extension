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

// The case of SPEC-0005, "Tests", "Unit", `definitions.test.ts` (P23): the refresh of the tree forgets the reads that
// were refused or failed, and asks again for those alone.
describe("the definitions after a refresh (SPEC-0005, P23)", () => {
  const DEV_CLUSTER = { group: "infrastructure.cluster.x-k8s.io", kind: "DevCluster" };
  const DEV_MACHINE = { group: "infrastructure.cluster.x-k8s.io", kind: "DevMachine" };
  const APIS: Record<string, { apiBase: string }> = {
    [`${KCP.group}/${KCP.kind}`]: KCP_API,
    [`${DEV_CLUSTER.group}/${DEV_CLUSTER.kind}`]: {
      apiBase: "/apis/infrastructure.cluster.x-k8s.io/v1beta2/devclusters",
    },
    [`${DEV_MACHINE.group}/${DEV_MACHINE.kind}`]: {
      apiBase: "/apis/infrastructure.cluster.x-k8s.io/v1beta2/devmachines",
    },
  };

  it("are asked again when they were refused or failed, and a definition that was read keeps its read", async () => {
    const { host: definitionsHost, get, findApi } = host({ isLoaded: false, failedLoading: true, items: [] });

    findApi.mockImplementation((group, kind) => APIS[`${group}/${kind}`]);
    get.mockImplementation(async (name) => {
      if (name.startsWith("devclusters.")) throw REFUSED;
      if (name.startsWith("devmachines.")) throw new Error("Failed to get: connection reset");
      return DEFINITIONS[1] as unknown as HostObject;
    });

    const reads = new DefinitionReads(definitionsHost);

    reads.request([KCP, DEV_CLUSTER, DEV_MACHINE]);
    await vi.waitFor(() => expect(reads.readOf(DEV_MACHINE.group, DEV_MACHINE.kind).state).toBe("failed"));
    expect(reads.readOf(DEV_CLUSTER.group, DEV_CLUSTER.kind).state).toBe("refused");
    expect(reads.readOf(KCP.group, KCP.kind).state).toBe("read");
    get.mockClear();

    reads.forgetFailures();

    expect(reads.readOf(KCP.group, KCP.kind).state).toBe("read");
    expect(reads.readOf(DEV_CLUSTER.group, DEV_CLUSTER.kind).state).toBe("pending");

    reads.request([KCP, DEV_CLUSTER, DEV_MACHINE]);
    await vi.waitFor(() => expect(reads.readOf(DEV_CLUSTER.group, DEV_CLUSTER.kind).state).toBe("refused"));

    expect(get.mock.calls.map(([name]) => name).sort()).toEqual([
      "devclusters.infrastructure.cluster.x-k8s.io",
      "devmachines.infrastructure.cluster.x-k8s.io",
    ]);
  });
});
