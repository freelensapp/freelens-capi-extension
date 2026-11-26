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
// its end, also when a check failed, and records the version that the answer to each of its writes gives, so that
// the check of "Safety" can tell them from a write of the frame; it fails at once when a version that it records is
// the one before the write, which a write always changes. With TEST_PLANT_WRITE set, it patches a label of a fixture
// from the frame of the cluster, through the API of the host, and both checks of "Safety" fail: the run that shows
// them failing once.
//
// Step 1 holds while the fixtures are young: the first change of the words of a row of the fixtures comes 28 minutes
// after their times, when three states end their Provisioning (SPEC-0004, "Notes and deviations"). The session fails
// at its start, saying so, when the Clusters of the fixtures were created more than 25 minutes before it.

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

// The minutes after the apply of the fixtures within which step 1 holds.
const WINDOW_MINUTES = 25;

// The tones of each activity of the fixtures, every one Progressing: one in flight in the tone of progress within its
// threshold and of a warning past it, Deleting in that of a deletion within its threshold (SPEC-0003, P31).
const ACTIVITY_TONES: Record<string, string[]> = {
  Idle: ["info"],
  Unknown: ["vague"],
  Paused: ["terminated"],
  Deleting: ["terminated", "warning"],
};

function activityTones(word: string): string[] {
  return ACTIVITY_TONES[word] ?? IN_FLIGHT;
}

// The titles of the columns, in their order (P7).
const TITLES = [
  "Name",
  "Namespace",
  "Control plane",
  "Workers",
  "Version",
  "ClusterClass",
  "Activity",
  "Condition",
  "Status",
  "Age",
];

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

// The headline of a message (P11): its first line, without its indentation and bullet; when that line is a subject
// with no words of its own, such as `* WorkersAvailable:`, the subject and the first line under it with words, each
// without its indentation and bullet.
function headlineOf(message: string): string {
  const [first, ...rest] = message.split("\n");
  const bare = (line: string) => line.trim().replace(/^\* /, "");

  if (!/^\* \S+:$/.test(first)) return bare(first);

  const under: string[] = [];

  for (const line of rest) {
    if (!line.startsWith(" ")) break;
    under.push(line);
  }

  const worded = under.map(bare).find((text) => text !== "" && !text.endsWith(":"));

  return worded === undefined ? bare(first) : `${bare(first)} ${worded}`;
}

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
  const headline = typeof available?.message === "string" ? headlineOf(available.message) : "";
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
  // Only the four fields that the check needs, one object a line: the objects of every state as JSON are more than
  // the default buffer of a child process holds.
  const listed = await kubectl([
    "get",
    FIXTURE_RESOURCES.join(","),
    "--all-namespaces",
    "--output",
    'jsonpath={range .items[*]}{.kind}{"\\t"}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\t"}{.metadata.resourceVersion}{"\\n"}{end}',
  ]);

  return new Map(
    listed
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.split("\t"))
      .filter(([, namespace]) => namespaces.includes(namespace ?? ""))
      .map(([kind, namespace, name, version]) => [`${kind}/${namespace}/${name}`, version ?? ""]),
  );
}

// The version of a Cluster of the fixtures.
async function versionOf(namespace: string, name: string): Promise<string> {
  return kubectl([
    "get",
    "clusters.v1beta2.cluster.x-k8s.io",
    name,
    "--namespace",
    namespace,
    "--output",
    "jsonpath={.metadata.resourceVersion}",
  ]);
}

// Sets or removes a label of a Cluster of the fixtures, and gives the version that the answer to the write gives it.
// `kubectl label` prints the object as it read it before the write, so the session writes with a merge patch, whose
// answer is the object that the write made.
async function patchLabel(namespace: string, name: string, key: string, value: string | null): Promise<string> {
  return kubectl([
    "patch",
    "clusters.v1beta2.cluster.x-k8s.io",
    name,
    "--namespace",
    namespace,
    "--type",
    "merge",
    "--patch",
    JSON.stringify({ metadata: { labels: { [key]: value } } }),
    "--output",
    "jsonpath={.metadata.resourceVersion}",
  ]);
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
    const before = await versionOf(namespace, name);

    labelled.push({ namespace, name, key });

    const version = await patchLabel(namespace, name, key, value);

    // A write always changes the version: one recorded as it was before would make the check of "Safety" take the
    // write of the session for one of the frame.
    if (version === "" || version === before) {
      throw new Error(
        `The label of ${namespace}/${name} gave the version ${version || "(none)"}, which it had before the write: the session cannot record its own write`,
      );
    }
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

  // The row of a Cluster, found by a search of its name, once the list shows only the rows that the search keeps and
  // the marks of the row no longer show the spinner. The search of the host filters the list 250 ms after its input
  // changes (freelens:packages/core/src/renderer/components/input/search-input-url.tsx:41): until then the row is where
  // the whole list has it, and a hover or a click there lands on nothing once the row moves to the top.
  async function rowOf(page: Locator, name: string): Promise<Locator> {
    await page.locator('input[placeholder^="Search"]').fill(name);
    await expect
      .poll(async () => {
        const names = await page.getByTestId("capi-cluster-name").allTextContents();

        return names.length > 0 && names.every((listed) => listed.includes(name));
      }, viewTimeout)
      .toBe(true);

    // The locator inside a row starts from the frame: one that starts from the page, an ancestor of the rows, finds
    // nothing inside a row.
    const row = page
      .locator(".TableRow")
      .filter({ has: opened().getByTestId("capi-cluster-name").getByText(name, { exact: true }) });

    await row.getByTestId("capi-cluster-health").waitFor(viewTimeout);
    return row;
  }

  // The tooltip that a hover of an element shows, once it is visible. The pointer leaves the frame first, so that the
  // tooltip of a hover before it is gone.
  // The tooltip of a target, once the pointer is on it: at its start when the host lays something over the rest of it,
  // as the sort icon of a head cell, which shows only under the pointer, lies over a title that its column cuts.
  async function tooltipOf(target: Locator, { atStart = false } = {}): Promise<Locator> {
    const cluster = opened();

    await session?.window.mouse.move(5, 5);
    await expect.poll(() => cluster.locator('[role="tooltip"]').count(), viewTimeout).toBe(0);

    const box = atStart ? await target.boundingBox() : null;

    await target.hover(box === null ? undefined : { position: { x: Math.min(4, box.width / 2), y: box.height / 2 } });

    const tooltip = cluster.locator('[role="tooltip"].visible');

    await tooltip.waitFor(viewTimeout);
    return tooltip;
  }

  // The lines of the tooltip of a cell, each a block of its own.
  async function linesOf(target: Locator): Promise<string[]> {
    return (await (await tooltipOf(target)).locator(":scope > div > div").allTextContents()).map((line) => line.trim());
  }

  beforeAll(async () => {
    const { namespace, name } = clusterOf("healthy");
    const created = Date.parse(
      await kubectl([
        "get",
        "clusters.v1beta2.cluster.x-k8s.io",
        name,
        "--namespace",
        namespace,
        "--output",
        "jsonpath={.metadata.creationTimestamp}",
      ]),
    );
    const minutes = (Date.now() - created) / 60000;

    if (!(minutes <= WINDOW_MINUTES)) {
      throw new Error(
        `The fixtures were applied ${Math.round(minutes)} minutes ago: step 1 holds for ${WINDOW_MINUTES} minutes after the apply. Apply them again with pnpm e2e:fixtures:up all`,
      );
    }
    before = await versionsOfFixtures();
    session = await connectApp();
    recorder = recordRequests(session.window);
    await installExtension(session);
    frame = await openKindCluster(session);
  }, 240 * 1000);

  afterAll(async () => {
    // Every step of the end runs whatever failed before it: the labels go, the cluster is disconnected and the
    // connection closed; what failed is thrown once the end is done.
    const failures: unknown[] = [];
    const attempt = async <T>(step: () => Promise<T>, otherwise: T): Promise<T> => {
      try {
        return await step();
      } catch (error) {
        failures.push(error);
        return otherwise;
      }
    };

    // The errors stop being collected before the cluster is disconnected: what the app logs while it disconnects says
    // nothing about the extension.
    const errors = await attempt(async () => (await session?.stopCollecting()) ?? [], [] as string[]);
    const requests = recorder?.requests() ?? [];

    recorder?.stop();

    // The versions are read before the session removes its labels, so that a write of the frame after one of the
    // session shows.
    const after = await attempt(versionsOfFixtures, undefined);
    const changed =
      after === undefined
        ? []
        : [...(before ?? new Map<string, string>())]
            .filter(([key, version]) => after.get(key) !== (ownWrites.get(key) ?? version))
            .map(([key]) => key);

    for (const { namespace, name, key } of labelled) {
      await attempt(() => patchLabel(namespace, name, key, null), "");
    }

    if (session) {
      const opened = session;

      await attempt(() => disconnectKindCluster(opened), undefined);
      await attempt(() => opened.close(), undefined);
    }

    // Every check of the end is reported, each that failed in one error, so that a write planted from the frame fails
    // both checks of "Safety" and shows both.
    const writes = requests.filter(readsAGroupOfTheView).filter((request) => request.method !== "GET");
    const failed = [
      ...(errors.length === 0 ? [] : [`The app logged errors:\n${errors.join("\n")}`]),
      // The check of "Safety": every request of the frame to the groups that the view reads is a GET, and every object
      // of the fixtures has the version it had before, or the one that a write of the session gave it.
      ...(writes.length === 0
        ? []
        : [
            `The frame sent requests other than a GET:\n${writes.map((write) => `${write.method} ${write.url}`).join("\n")}`,
          ]),
      ...(changed.length === 0 ? [] : [`Objects of the fixtures changed their version:\n${changed.join("\n")}`]),
      ...failures.map(
        (failure) => `The end of the session failed: ${failure instanceof Error ? failure.message : String(failure)}`,
      ),
    ];

    if (failed.length > 0) {
      throw new Error(
        `${failed.length === 1 ? "A check" : `${failed.length} checks`} at the end of the session failed:\n\n${failed.join("\n\n")}`,
      );
    }
  }, 240 * 1000);

  it("lists every Cluster of the fixtures with the marks that the status model gives its state (1)", async () => {
    await selectNamespaces(opened(), namespaces);

    const page = await openPage();

    for (const expected of EXPECTED) {
      const { name, cluster } = clusterOf(expected.state);
      const row = await rowOf(page, name);
      const health = row.getByTestId("capi-cluster-health");
      const activities = await row.getByTestId("capi-cluster-activity").evaluateAll((marks) =>
        marks.map((mark) => ({
          word: mark.getAttribute("data-word"),
          state: mark.getAttribute("data-state"),
          tone: mark.getAttribute("data-tone"),
        })),
      );
      const cells = cellsOf(cluster);

      expect((await health.textContent())?.trim(), expected.state).toBe(expected.health);
      if (expected.tones.length) {
        expect(expected.tones, expected.state).toContain(await health.getAttribute("data-tone"));
      }
      // Every activity of the fixtures is Progressing, which the mark leaves unsaid: its state is empty.
      expect(
        activities.map(({ word, state }) => [word, state]),
        expected.state,
      ).toEqual(expected.activities.map((word) => [word, ""]));
      for (const { word, tone } of activities) {
        expect(activityTones(word ?? ""), `${expected.state}: ${word}`).toContain(tone);
      }
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

  it("shows in the tooltip of a cell what the cell cuts: each activity, the health with stale and its note, the status (1; P11, P12)", async () => {
    const cluster = opened();

    await selectNamespaces(cluster, namespaces);

    const page = await openPage();
    const held = EXPECTED.find((row) => row.state === "scaling-up-held")?.activities ?? [];
    const activities = await linesOf(
      (await rowOf(page, clusterOf("scaling-up-held").name)).getByTestId("capi-cluster-activity").first(),
    );

    // Every activity, also those that the cell cuts, with its duration and its start.
    expect(activities).toHaveLength(held.length);
    held.forEach((word, index) => {
      expect(activities[index], word).toMatch(new RegExp(`^${word}, for \\S+, since \\S.*$`));
    });

    const paused = await linesOf((await rowOf(page, clusterOf("paused").name)).getByTestId("capi-cluster-health"));

    expect(paused).toHaveLength(2);
    expect(paused[0]).toBe("Healthy");
    expect(paused[1]).toMatch(/^Stale: Paused, since \S.*$/);
    expect(
      await linesOf(
        (await rowOf(page, clusterOf("machine-pool-without-machines").name)).getByTestId("capi-cluster-health"),
      ),
    ).toEqual(["Degraded", "1 MachinePool of unknown health"]);

    // The whole message of Available, each line as the cluster wrote it, nested.
    const message = (
      clusterOf("upgrading").cluster.status as { conditions: { type: string; message?: string }[] }
    ).conditions.find((condition) => condition.type === "Available")?.message;

    expect(await linesOf((await rowOf(page, clusterOf("upgrading").name)).getByTestId("capi-cluster-status"))).toEqual(
      (message ?? "").split("\n").map((line) => line.trim()),
    );

    await session?.window.mouse.move(5, 5);
    await page.locator('input[placeholder^="Search"]').fill("");
    expect(await session?.errors()).toEqual([]);
  });

  it("cuts a title of the head that its column does not hold with an ellipsis, and lines a note up with the marks of its cell (1; P7, P12)", async () => {
    const cluster = opened();

    await selectNamespaces(cluster, namespaces);

    const page = await openPage();
    const heads = page.getByTestId("capi-clusters-head");

    await heads.first().waitFor(viewTimeout);

    // Each title ends inside its cell, so that what its column does not hold is cut by its badge, with an ellipsis,
    // and not by the cell.
    const titles = await heads.evaluateAll((badges) =>
      badges.map((badge) => {
        const cell = badge.closest(".TableCell");
        const end = cell
          ? cell.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(cell).paddingRight)
          : Number.NaN;

        return {
          title: badge.textContent ?? "",
          inside: badge.getBoundingClientRect().right <= end + 0.5,
          cut: badge.scrollWidth > badge.clientWidth,
          ellipsis: getComputedStyle(badge).textOverflow === "ellipsis",
        };
      }),
    );

    expect(titles.map(({ title }) => title)).toEqual(TITLES);
    expect(titles.filter(({ inside }) => !inside).map(({ title }) => title)).toEqual([]);
    expect(titles.filter(({ cut, ellipsis }) => cut && !ellipsis).map(({ title }) => title)).toEqual([]);

    // A title that its badge cuts is whole in its tooltip.
    for (const { title } of titles.filter(({ cut }) => cut)) {
      expect(
        await (await tooltipOf(heads.filter({ hasText: new RegExp(`^${title}$`) }), { atStart: true })).textContent(),
      ).toBe(title);
    }

    // The note of the MachinePools of unknown health stands at the middle of the line of its cell, as the marks do.
    const condition = (await rowOf(page, clusterOf("machine-pool-without-machines").name)).getByTestId(
      "capi-cluster-condition",
    );
    const middles = await condition.evaluate((cell) => {
      const middle = (element: Element | null | undefined) => {
        const box = element?.getBoundingClientRect();

        return box === undefined ? Number.NaN : box.top + box.height / 2;
      };
      const note = [...cell.querySelectorAll("span")].find(
        (span) => span.textContent === "1 MachinePool of unknown health",
      );

      return { mark: middle(cell.querySelector('[data-testid="capi-cluster-health"]')), note: middle(note) };
    });

    expect(Math.abs(middles.note - middles.mark), JSON.stringify(middles)).toBeLessThanOrEqual(1.5);

    await session?.window.mouse.move(5, 5);
    await page.locator('input[placeholder^="Search"]').fill("");
    expect(await session?.errors()).toEqual([]);
  });

  it("has no selection, no menu and no details of the host, on a right click or a click (2; A7, S5)", async () => {
    const cluster = opened();

    await selectNamespaces(cluster, [clusterOf("healthy").namespace]);

    const page = await openPage();
    const row = await rowOf(page, clusterOf("healthy").name);
    const frames = () =>
      cluster.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    // The rows keep the cell of the menu that the header always has, empty, so that the columns line up.
    expect(await page.locator(".TableCell.checkbox").count()).toBe(0);
    expect(await page.locator(".TableRow .TableCell.menu").count()).toBe(await page.locator(".TableRow").count());
    expect(await row.locator(".TableCell.menu").textContent()).toBe("");
    expect(await row.locator(".TableCell.menu button, .TableCell.menu .Icon").count()).toBe(0);
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
    await cluster.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
