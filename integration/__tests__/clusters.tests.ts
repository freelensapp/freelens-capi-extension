/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The session of the list of Clusters (SPEC-0004, "Tests", "In Freelens, on the definitions and the fixtures"), on
// the cluster of the definitions of Cluster API with the fixtures of every state of SPEC-0002, each state in its
// namespace, which the integration workflow applies with `pnpm e2e:fixtures:up all` (P33). It checks what the first
// pull request of SPEC-0004 brings: the rows of the page and their marks, A7 and the half of S5 that concerns the
// list, a list that stays live, the Custom Resources tree of the host, and that the frame of the cluster only reads.
// The details, the panel in the details of the host and the references come with the second pull request.
//
// The session writes to the cluster of the tests alone, a label on two Clusters of the fixtures, which it removes at
// its end, also when a check failed, and records the version that each of its writes gave, so that the check of
// "Safety" can tell them from a write of the frame. With TEST_PLANT_WRITE set, it patches a label of a fixture from
// the frame of the cluster, through the API of the host, and both checks of "Safety" fail: the run that shows them
// failing once.

import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_RESOURCES, FIXTURES_FOLDER, readFixtureSet } from "../../e2e/scripts/fixtures.mts";
import { statesOf } from "../../e2e/scripts/states.mts";
import {
  appReady,
  connectApp,
  disconnectKindCluster,
  hostLists,
  installExtension,
  kubectl,
  openExtensionPage,
  openKindCluster,
  recordRequests,
  selectNamespaces,
} from "./extension-helpers";

import type { Frame, Locator } from "playwright";

import type { KubeObject } from "../../e2e/scripts/fixtures.mts";
import type { AppSession, SentRequest } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };

const states = statesOf(["all"]);
const namespaces = states.map((state) => state.namespace);

// The Cluster of each state, from the files of the fixtures, which the page lists.
const clusters = new Map(
  states.map((state) => {
    const objects = readFixtureSet(path.resolve(import.meta.dirname, "..", "..", FIXTURES_FOLDER, state.name));
    const cluster = objects.find((object) => object.kind === "Cluster") as KubeObject;

    return [state.name, { namespace: state.namespace, cluster }];
  }),
);

function clusterOf(state: string): { namespace: string; name: string; cluster: KubeObject } {
  const entry = clusters.get(state);

  if (!entry) {
    throw new Error(`No Cluster in the fixtures of ${state}`);
  }

  return { namespace: entry.namespace, name: entry.cluster.metadata.name, cluster: entry.cluster };
}

// What the row of the Cluster of each state shows, by the table of SPEC-0003, "The fixtures of SPEC-0002 give these
// results", and, for `machine-without-node`, whose fixture has its `Available` `True`, as the model gives it on the
// fixture (SPEC-0004, "Notes and deviations"): the word of its health, the tones that the table allows it at the time
// of the session, which the workflow runs minutes after it applied the fixtures, so within or past a threshold, its
// activities, in the order of the closed set, the word stale, and how many MachinePools of unknown health. A Cluster
// that is deleting has no health.
interface ExpectedRow {
  state: string;
  health: string;
  tones: string[];
  activities: string[];
  stale: boolean;
  poolsUnknown: number;
}

const IN_FLIGHT = ["info", "warning"];

const EXPECTED: ExpectedRow[] = [
  {
    state: "provisioning",
    health: "Unhealthy",
    tones: IN_FLIGHT,
    activities: ["Provisioning"],
    stale: false,
    poolsUnknown: 0,
  },
  { state: "healthy", health: "Healthy", tones: ["ok"], activities: ["Idle"], stale: false, poolsUnknown: 0 },
  {
    state: "machine-without-node",
    health: "Healthy",
    tones: ["ok"],
    activities: ["Idle"],
    stale: false,
    poolsUnknown: 0,
  },
  {
    state: "rolling-out",
    health: "Degraded",
    tones: IN_FLIGHT,
    activities: ["Provisioning", "Rolling out", "Scaling down"],
    stale: false,
    poolsUnknown: 0,
  },
  {
    state: "scaling-up",
    health: "Unhealthy",
    tones: IN_FLIGHT,
    activities: ["Provisioning", "Scaling up"],
    stale: false,
    poolsUnknown: 0,
  },
  {
    state: "scaling-up-held",
    health: "Unhealthy",
    tones: IN_FLIGHT,
    activities: ["Provisioning", "Upgrading", "Rolling out", "Scaling up", "Scaling down"],
    stale: false,
    poolsUnknown: 0,
  },
  {
    state: "scaling-down",
    health: "Degraded",
    tones: IN_FLIGHT,
    activities: ["Scaling down"],
    stale: false,
    poolsUnknown: 0,
  },
  { state: "paused", health: "Healthy", tones: ["ok"], activities: ["Paused"], stale: true, poolsUnknown: 0 },
  { state: "deleting", health: "N/A", tones: [], activities: ["Deleting"], stale: false, poolsUnknown: 0 },
  {
    state: "upgrading",
    health: "Degraded",
    tones: IN_FLIGHT,
    activities: ["Provisioning", "Upgrading", "Rolling out", "Scaling down"],
    stale: false,
    poolsUnknown: 0,
  },
  { state: "without-topology", health: "Healthy", tones: ["ok"], activities: ["Idle"], stale: false, poolsUnknown: 0 },
  {
    state: "machine-pools",
    health: "Degraded",
    tones: IN_FLIGHT,
    activities: ["Provisioning"],
    stale: false,
    poolsUnknown: 0,
  },
  {
    state: "machine-pool-without-machines",
    health: "Degraded",
    tones: IN_FLIGHT,
    activities: ["Provisioning"],
    stale: false,
    poolsUnknown: 1,
  },
  {
    state: "remediation",
    health: "Unhealthy",
    tones: IN_FLIGHT,
    activities: ["Provisioning", "Remediating"],
    stale: false,
    poolsUnknown: 0,
  },
  { state: "no-status", health: "Unknown", tones: ["vague"], activities: ["Unknown"], stale: false, poolsUnknown: 1 },
];

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields | undefined =>
  typeof value === "object" && value !== null ? (value as Fields) : undefined;

// The cells of the domain and the status, as the fixture writes them: the available of the desired Machines (P8), the
// version of the topology, else those of the control plane (P9), the class (R3.12), and the headline of the message of
// `Available`, else its reason (P11).
function cellsOf(cluster: KubeObject) {
  const status = fields(cluster.status);
  const spec = fields(cluster.spec);
  const counters = (part: string) => {
    const counted = fields(status?.[part]);
    const available = counted?.availableReplicas;
    const desired = counted?.desiredReplicas;

    return available === undefined && desired === undefined ? "N/A" : `${available ?? "N/A"}/${desired ?? "N/A"}`;
  };
  const topology = fields(spec?.topology);
  const classRef = fields(topology?.classRef);
  const available = ((status?.conditions as Fields[] | undefined) ?? []).find(
    (condition) => condition.type === "Available",
  );
  const headline = typeof available?.message === "string" ? available.message.split("\n")[0] : "";
  const versions = ((fields(status?.controlPlane)?.versions as Fields[] | undefined) ?? []).map(
    (entry) => entry.version,
  );

  return {
    controlPlane: counters("controlPlane"),
    workers: counters("workers"),
    version: typeof topology?.version === "string" ? topology.version : versions.length ? versions.join(", ") : "N/A",
    clusterClass:
      typeof classRef?.name !== "string"
        ? "N/A"
        : classRef.namespace && classRef.namespace !== cluster.metadata.namespace
          ? `${String(classRef.namespace)}/${classRef.name}`
          : classRef.name,
    status: available === undefined ? "N/A" : headline || String(available.reason),
  };
}

// The groups of the kinds that the view reads, whose requests the check of "Safety" reads.
const READ_GROUPS = [
  "cluster.x-k8s.io",
  "controlplane.cluster.x-k8s.io",
  "bootstrap.cluster.x-k8s.io",
  "infrastructure.cluster.x-k8s.io",
  "operator.cluster.x-k8s.io",
  "apiextensions.k8s.io",
];

function readsAGroupOfTheView(request: SentRequest): boolean {
  const pathname = URL.canParse(request.url) ? new URL(request.url).pathname : request.url;

  return READ_GROUPS.some((group) => pathname.includes(`/apis/${group}/`));
}

// The version of every object of the fixtures, by kind, namespace and name.
async function versionsOfFixtures(): Promise<Map<string, string>> {
  const listed = JSON.parse(
    await kubectl(["get", FIXTURE_RESOURCES.join(","), "--all-namespaces", "--output", "json"]),
  ) as { items: { kind: string; metadata: { namespace?: string; name: string; resourceVersion: string } }[] };

  return new Map(
    listed.items
      .filter((item) => namespaces.includes(item.metadata.namespace ?? ""))
      .map((item) => [`${item.kind}/${item.metadata.namespace}/${item.metadata.name}`, item.metadata.resourceVersion]),
  );
}

describe.skipIf(!(await appReady({ cluster: true, namespace: namespaces[0] })))("the list of Clusters", () => {
  let session: AppSession | undefined;
  let frame: Frame | undefined;
  let recorder: ReturnType<typeof recordRequests> | undefined;
  let before: Map<string, string> | undefined;
  // The version that each write of the session itself gave an object, by kind, namespace and name.
  const ownWrites = new Map<string, string>();
  // The labels that the session set, which it removes at its end.
  const labelled: { namespace: string; name: string; key: string }[] = [];

  async function label(state: string, key: string, value: string) {
    const { namespace, name } = clusterOf(state);
    const version = await kubectl([
      "label",
      "clusters.v1beta2.cluster.x-k8s.io",
      name,
      "--namespace",
      namespace,
      `${key}=${value}`,
      "--overwrite",
      "--output",
      "jsonpath={.metadata.resourceVersion}",
    ]);

    labelled.push({ namespace, name, key });
    ownWrites.set(`Cluster/${namespace}/${name}`, version);
  }

  function opened(): Frame {
    if (!session || !frame) {
      throw new Error("The cluster is not open");
    }

    return frame;
  }

  // The page of the Clusters, open with its list.
  async function openPage(): Promise<Locator> {
    const cluster = opened();

    await openExtensionPage(cluster, "clusters");

    const page = cluster.getByTestId("capi-clusters-page");

    await page.locator(".TableHead").waitFor(viewTimeout);
    return page;
  }

  // The row of a Cluster, found by a search of its name, once its marks of state no longer show the spinner.
  async function rowOf(page: Locator, name: string): Promise<Locator> {
    await page.locator('input[placeholder^="Search"]').fill(name);

    const row = page
      .locator(".TableRow")
      .filter({ has: page.getByTestId("capi-cluster-name").getByText(name, { exact: true }) });

    await row.getByTestId("capi-cluster-health").waitFor(viewTimeout);
    return row;
  }

  beforeAll(async () => {
    before = await versionsOfFixtures();
    session = await connectApp();
    recorder = recordRequests(session.window);
    await installExtension(session);
    frame = await openKindCluster(session);
  }, 240 * 1000);

  afterAll(async () => {
    // The errors stop being collected before the cluster is disconnected: what the app logs while it disconnects says
    // nothing about the extension.
    const errors = (await session?.stopCollecting()) ?? [];
    const requests = recorder?.requests() ?? [];

    recorder?.stop();

    // The versions are read before the session removes its labels, so that a write of the frame after one of the
    // session shows.
    const after = await versionsOfFixtures();
    const changed = [...(before ?? new Map<string, string>())]
      .filter(([key, version]) => after.get(key) !== (ownWrites.get(key) ?? version))
      .map(([key]) => key);

    // The labels go, also when a check failed.
    for (const { namespace, name, key } of labelled) {
      await kubectl(["label", "clusters.v1beta2.cluster.x-k8s.io", name, "--namespace", namespace, `${key}-`]);
    }

    if (session) {
      await disconnectKindCluster(session);
      await session.close();
    }

    expect(errors).toEqual([]);
    // The check of "Safety": every request of the frame to the groups that the view reads is a GET, and every object
    // of the fixtures has the version it had before, or the one that a write of the session gave it.
    expect(requests.filter(readsAGroupOfTheView).filter((request) => request.method !== "GET")).toEqual([]);
    expect(changed).toEqual([]);
  }, 240 * 1000);

  it("lists every Cluster of the fixtures with the marks that the status model gives its state (1)", async () => {
    await selectNamespaces(opened(), namespaces);

    const page = await openPage();

    for (const expected of EXPECTED) {
      const { name, cluster } = clusterOf(expected.state);
      const row = await rowOf(page, name);
      const health = row.getByTestId("capi-cluster-health");
      const activities = await row.getByTestId("capi-cluster-activity").allTextContents();
      const cells = cellsOf(cluster);

      expect((await health.textContent())?.trim(), expected.state).toBe(expected.health);
      if (expected.tones.length) {
        expect(expected.tones, expected.state).toContain(await health.getAttribute("data-tone"));
      }
      expect(activities.length, expected.state).toBe(expected.activities.length);
      expected.activities.forEach((activity, index) => {
        expect(activities[index]?.startsWith(activity), `${expected.state}: ${activities[index]}`).toBe(true);
      });
      expect(await row.getByTestId("capi-cluster-stale").count(), expected.state).toBe(expected.stale ? 1 : 0);
      expect(await row.getByText(/MachinePools? of unknown health/).count(), expected.state).toBe(
        expected.poolsUnknown ? 1 : 0,
      );
      expect((await row.getByTestId("capi-cluster-control-plane").textContent())?.trim()).toBe(cells.controlPlane);
      expect((await row.getByTestId("capi-cluster-workers").textContent())?.trim()).toBe(cells.workers);
      expect((await row.getByTestId("capi-cluster-version").textContent())?.trim()).toBe(cells.version);
      expect((await row.getByTestId("capi-cluster-class").textContent())?.trim()).toBe(cells.clusterClass);
      expect((await row.getByTestId("capi-cluster-status").textContent())?.trim()).toBe(cells.status);
    }

    // The Cluster of machine-pools reads Degraded while the project gives its Available True (H1).
    const available = (
      clusterOf("machine-pools").cluster.status as { conditions: { type: string; status: string }[] }
    ).conditions.find((condition) => condition.type === "Available");

    expect(available?.status).toBe("True");
    expect(await session?.errors()).toEqual([]);
  });

  it("has no selection, no menu and no details of the host, on a right click or a click (2; A7, S5)", async () => {
    const cluster = opened();

    await selectNamespaces(cluster, [clusterOf("healthy").namespace]);

    const page = await openPage();
    const row = await rowOf(page, clusterOf("healthy").name);
    const frames = () =>
      cluster.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    expect(await page.locator(".TableCell.checkbox").count()).toBe(0);
    expect(await page.locator(".TableRow .TableCell.menu").count()).toBe(0);
    expect(await page.locator(".TableHead .TableCell.menu").count()).toBe(1);

    await row.click({ button: "right" });
    await frames();
    expect(await cluster.locator(".Menu.MenuActions, .KubeObjectMenu").count()).toBe(0);

    await row.click();
    await frames();
    expect(new URL(cluster.url()).searchParams.has("kube-details")).toBe(false);
    expect(await cluster.locator(".KubeObjectDetails").count()).toBe(0);
    expect(await session?.errors()).toEqual([]);
  });

  it("shows no remove button, with the Cluster selected in the list of the host, before or after a click (3; P19, S5)", async () => {
    const cluster = opened();
    const { namespace, name } = clusterOf("healthy");

    await hostLists(cluster, { group: "cluster.x-k8s.io", plural: "clusters" }, namespace, [name]);

    const hostRow = cluster
      .locator(".TableRow")
      .filter({ has: cluster.locator(".TableCell.name").getByText(name, { exact: true }) });

    await hostRow.locator(".TableCell.checkbox").click();
    // The list of the host offers the removal of what its store holds selected.
    await cluster.locator(".AddRemoveButtons .remove-button").waitFor(viewTimeout);

    const page = await openPage();
    const row = await rowOf(page, name);

    expect(await cluster.locator(".AddRemoveButtons .remove-button").count()).toBe(0);
    await row.click();
    expect(await cluster.locator(".AddRemoveButtons .remove-button").count()).toBe(0);
    expect(await session?.errors()).toEqual([]);
  });

  it("stays live: a label that kubectl sets is found by the search, also in a namespace that the filter adds (6; P14, P19)", async () => {
    const cluster = opened();
    const value = `session-${Date.now()}`;

    await selectNamespaces(cluster, [clusterOf("healthy").namespace, clusterOf("paused").namespace]);

    const page = await openPage();
    const search = page.locator('input[placeholder^="Search"]');

    await rowOf(page, clusterOf("healthy").name);
    await label("healthy", "freelens-capi-session", value);
    await search.fill(`freelens-capi-session=${value}`);
    await page
      .getByTestId("capi-cluster-name")
      .getByText(clusterOf("healthy").name, { exact: true })
      .waitFor(viewTimeout);

    await selectNamespaces(cluster, [
      clusterOf("healthy").namespace,
      clusterOf("paused").namespace,
      clusterOf("without-topology").namespace,
    ]);
    await label("without-topology", "freelens-capi-session", `${value}-later`);
    await search.fill(`freelens-capi-session=${value}-later`);
    await page
      .getByTestId("capi-cluster-name")
      .getByText(clusterOf("without-topology").name, { exact: true })
      .waitFor(viewTimeout);
    expect(await session?.errors()).toEqual([]);
  });

  it("leaves no entry for the Clusters in the Custom Resources tree of the host (7; A7, R7.13)", async () => {
    const cluster = opened();
    const group = "sidebar-item-custom-resource-group-cluster.x-k8s.io";
    const expand = (id: string) =>
      cluster.evaluate((target) => {
        const link = document.querySelector<HTMLElement>(`[data-testid="link-for-${target}"]`);

        if (!link) {
          throw new Error(`No entry ${target} in the sidebar`);
        }
        link.click();
      }, id);

    if (!(await cluster.getByTestId(group).count())) {
      await expand("sidebar-item-custom-resources");
    }
    await cluster.getByTestId(group).waitFor(viewTimeout);
    if (!(await cluster.getByTestId(`${group}/machines`).count())) {
      await expand(group);
    }
    await cluster.getByTestId(`${group}/machines`).waitFor(viewTimeout);

    expect(await cluster.getByTestId(`${group}/clusters`).count()).toBe(0);
    expect(await session?.errors()).toEqual([]);
  });

  it.runIf(process.env.TEST_PLANT_WRITE)(
    "plants a write from the frame of the cluster, which the checks of Safety see (8)",
    async () => {
      const { namespace, name } = clusterOf("healthy");

      await opened().evaluate(
        async ({ namespace, name }) => {
          const api = globalThis.FreelensExtensionApi.Renderer?.K8sApi.apiManager.getApi(
            (item) => item.kind === "Cluster" && item.apiVersionWithGroup === "cluster.x-k8s.io/v1beta2",
          );

          await api?.patch(
            { name, namespace },
            { metadata: { labels: { "freelens-capi-planted": "write" } } },
            "merge",
          );
        },
        { namespace, name },
      );
      labelled.push({ namespace, name, key: "freelens-capi-planted" });
    },
  );
});
