/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The session of the Clusters (SPEC-0004, "Tests", "In Freelens, on the definitions and the fixtures"), on the
// cluster of the definitions of Cluster API with the fixtures of every state of SPEC-0002, each state in its
// namespace, which the integration workflow applies with `pnpm e2e:fixtures:up all` (P33). It checks the rows of the
// page and their marks, A7 and S5, the details of the extension and their focus, the panel in the details of the
// host, the references between the objects of a Cluster, the sections of the details of the states that have their
// own, a list and details that stay live, the Custom Resources tree of the host, and that the frame of the cluster
// only reads.
//
// The session writes to the cluster of the tests alone: a label on three Clusters of the fixtures, which it removes
// at its end, and the annotation `cluster.x-k8s.io/paused` on one, which it removes at the end of its step, both also
// when a check failed. It records the version that the answer to each of its writes gives, so that the check of
// "Safety" can tell them from a write of the frame, and fails at once when a version that it records is the one
// before the write, which a write always changes. With TEST_PLANT_WRITE set, it patches a label of a fixture from the
// frame of the cluster, through the API of the host, and both checks of "Safety" fail: the run that shows them
// failing once.
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
  navigateCluster,
  openExtensionPage,
  openKindCluster,
  recordRequests,
  selectNamespaces,
} from "./extension-helpers";

import type { Frame, Locator } from "playwright";

import type { KubeObject } from "../../e2e/scripts/fixtures.mts";
import type { AppSession, SentRequest } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };

// The test id of the details of the extension, the drawer over the page of the Clusters (P15).
const DETAILS = "capi-cluster-details";

// The title of a drawer of the host, without the icon that copies it, which the drawer renders after it; null while
// the drawer is not open.
function titleOf(drawer: Locator): Promise<string | null> {
  return drawer.locator(".drawer-title-text").evaluateAll((elements) => elements[0]?.firstChild?.textContent ?? null);
}

const states = statesOf(["all"]);
const namespaces = states.map((state) => state.namespace);

// The objects of each state, from the files of the fixtures, and the Cluster among them, which the page lists.
const clusters = new Map(
  states.map((state) => {
    const objects = readFixtureSet(path.resolve(import.meta.dirname, "..", "..", FIXTURES_FOLDER, state.name));
    const cluster = objects.find((object) => object.kind === "Cluster") as KubeObject;

    return [state.name, { namespace: state.namespace, cluster, objects }];
  }),
);

interface FixtureCluster {
  namespace: string;
  name: string;
  // The parameter `details` of the page that opens the details of the Cluster (P6).
  address: string;
  cluster: KubeObject;
  objects: KubeObject[];
}

function clusterOf(state: string): FixtureCluster {
  const entry = clusters.get(state);

  if (!entry) {
    throw new Error(`No Cluster in the fixtures of ${state}`);
  }

  const { namespace, cluster, objects } = entry;

  return { namespace, name: cluster.metadata.name, address: `${namespace}/${cluster.metadata.name}`, cluster, objects };
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

// A condition of a Cluster of the fixtures, by its type.
function conditionOf(cluster: KubeObject, type: string): Fields | undefined {
  return ((fields(cluster.status)?.conditions as Fields[] | undefined) ?? []).find(
    (condition) => condition.type === type,
  );
}

// The sections of the details of a Cluster, in their order (SPEC-0004, "The details"), each shown when it has
// something to show, from its fixture as written: the metadata and the status always, the control plane and the
// infrastructure with their reference or a status, the workers with their counters or a part to count, the topology
// and the network with their fields of the spec, and the conditions with one.
const SECTIONS = [
  "metadata",
  "status",
  "control-plane",
  "workers",
  "infrastructure",
  "topology",
  "network",
  "conditions",
];

function sectionsOf({ cluster, objects }: FixtureCluster): string[] {
  const spec = fields(cluster.spec);
  const status = fields(cluster.status);
  const parts = objects.some((object) => object.kind === "MachineDeployment" || object.kind === "MachinePool");
  const shown: Record<string, boolean> = {
    metadata: true,
    status: true,
    "control-plane": spec?.controlPlaneRef !== undefined || status !== undefined,
    workers: status?.workers !== undefined || parts,
    infrastructure: spec?.infrastructureRef !== undefined || status !== undefined,
    topology: spec?.topology !== undefined,
    network: spec?.clusterNetwork !== undefined,
    conditions: ((status?.conditions as unknown[] | undefined) ?? []).length > 0,
  };

  return SECTIONS.filter((section) => shown[section]);
}

const PAUSED_ANNOTATION = "cluster.x-k8s.io/paused";

// What the details say of the form of a pause (SPEC-0004, "The details", 1; SPEC-0003, P19).
const PAUSE_WORDS = {
  spec: "Paused by spec.paused, which reaches the Cluster and every object of it",
  annotation: `Paused by the annotation ${PAUSED_ANNOTATION}, which reaches the Cluster alone`,
  both: `Paused by spec.paused, which reaches the Cluster and every object of it, and by the annotation ${PAUSED_ANNOTATION}`,
};

// The words of the form of the pause of a Cluster of the fixtures, from `spec.paused` and the annotation.
function pauseWordsOf(cluster: KubeObject): string | undefined {
  const bySpec = fields(cluster.spec)?.paused === true;
  const byAnnotation = cluster.metadata.annotations?.[PAUSED_ANNOTATION] !== undefined;

  if (bySpec && byAnnotation) return PAUSE_WORDS.both;
  if (bySpec) return PAUSE_WORDS.spec;
  return byAnnotation ? PAUSE_WORDS.annotation : undefined;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The definition of a kind as the cluster serves it: its plural, and the versions that its label of the contract
// `v1beta2` lists, one of which the details of the host of an object of the kind are opened at (SPEC-0004, P18;
// SPEC-0001, R1.16).
async function definitionOfKind(group: string, kind: string): Promise<{ plural: string; versions: string[] }> {
  const listed = await kubectl([
    "get",
    "customresourcedefinitions.apiextensions.k8s.io",
    "--output",
    'jsonpath={range .items[*]}{.metadata.name}{"\\t"}{.spec.group}{"\\t"}{.spec.names.kind}{"\\n"}{end}',
  ]);
  const name = listed
    .split("\n")
    .map((line) => line.split("\t"))
    .find(([, itemGroup, itemKind]) => itemGroup === group && itemKind === kind)?.[0];

  if (name === undefined) {
    throw new Error(`The cluster serves no definition of ${kind} of ${group}`);
  }

  const definition = JSON.parse(
    await kubectl(["get", "customresourcedefinitions.apiextensions.k8s.io", name, "--output", "json"]),
  ) as { metadata: { labels?: Record<string, string> }; spec: { names: { plural: string } } };
  const label = definition.metadata.labels?.["cluster.x-k8s.io/v1beta2"];

  if (!label) {
    throw new Error(`The definition ${name} has no label of the contract v1beta2`);
  }

  return { plural: definition.spec.names.plural, versions: label.split("_") };
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

type MetadataField = "labels" | "annotations";

// Sets or removes a label or an annotation of a Cluster of the fixtures, and gives the version that the answer to the
// write gives it. `kubectl label` and `kubectl annotate` print the object as they read it before the write, so the
// session writes with a merge patch, whose answer is the object that the write made.
async function patchMetadata(
  namespace: string,
  name: string,
  field: MetadataField,
  key: string,
  value: string | null,
): Promise<string> {
  return kubectl([
    "patch",
    "clusters.v1beta2.cluster.x-k8s.io",
    name,
    "--namespace",
    namespace,
    "--type",
    "merge",
    "--patch",
    JSON.stringify({ metadata: { [field]: { [key]: value } } }),
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
  // The labels and the annotations that the session set and did not remove yet, which its end removes.
  const written: { namespace: string; name: string; field: MetadataField; key: string }[] = [];

  // Sets or removes a label or an annotation of the Cluster of a state, and records the version that the answer to
  // the write gives it.
  async function write(state: string, field: MetadataField, key: string, value: string | null) {
    const { namespace, name } = clusterOf(state);
    const before = await versionOf(namespace, name);
    const version = await patchMetadata(namespace, name, field, key, value);

    // A write always changes the version: one recorded as it was before would make the check of "Safety" take the
    // write of the session for one of the frame.
    if (version === "" || version === before) {
      throw new Error(
        `The write of ${field} of ${namespace}/${name} gave the version ${version || "(none)"}, which it had before the write: the session cannot record its own write`,
      );
    }
    ownWrites.set(`Cluster/${namespace}/${name}`, version);
  }

  async function label(state: string, key: string, value: string) {
    const { namespace, name } = clusterOf(state);

    written.push({ namespace, name, field: "labels", key });
    await write(state, "labels", key, value);
  }

  // Runs a check with an annotation set on the Cluster of a state, and removes the annotation after it, also when the
  // check failed; the end of the session removes it when that removal fails.
  async function withAnnotation(state: string, key: string, check: () => Promise<void>) {
    const { namespace, name } = clusterOf(state);
    const entry = { namespace, name, field: "annotations" as const, key };
    const failures: unknown[] = [];

    written.push(entry);
    await write(state, "annotations", key, "");
    try {
      await check();
    } catch (error) {
      failures.push(error);
    }
    try {
      await write(state, "annotations", key, null);
      written.splice(written.indexOf(entry), 1);
    } catch (error) {
      failures.push(error);
    }

    if (failures.length > 1) throw new AggregateError(failures, `The check with the annotation ${key} failed`);
    if (failures.length === 1) throw failures[0];
  }

  function opened(): Frame {
    if (!session || !frame) {
      throw new Error("The cluster is not open");
    }

    return frame;
  }

  // Two frames of the cluster frame, once the click or the key before them has rendered what it changes.
  async function frames() {
    await opened().evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
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

    const row = rowNamed(page, name);

    await row.getByTestId("capi-cluster-health").waitFor(viewTimeout);
    return row;
  }

  // The row of a Cluster that the list shows, by its name. The locator inside a row starts from the frame: one that
  // starts from the page, an ancestor of the rows, finds nothing inside a row.
  function rowNamed(page: Locator, name: string): Locator {
    return page
      .locator(".TableRow")
      .filter({ has: opened().getByTestId("capi-cluster-name").getByText(name, { exact: true }) });
  }

  // The cell of the name in a row of the page, by the name that it holds. A cell of the list of the extension carries
  // the class that the CSS module of the page exports for its column, which the build names, and not the id of its
  // column, which the cells of a list of the host carry: `.TableCell.name` finds nothing on the page, as the first run
  // in CI showed.
  function nameCellOf(row: Locator): Locator {
    return row.locator(".TableCell").filter({ has: opened().getByTestId("capi-cluster-name") });
  }

  // Waits until the list shows the rows of these Clusters and no other, once the search applies: the search of the host
  // filters the list 250 ms after its input changes, and until then the rows that it leaves out are still listed.
  async function listsOnly(page: Locator, ...names: string[]) {
    await expect
      .poll(async () => {
        const listed = await page.getByTestId("capi-cluster-name").allTextContents();

        return listed.length === names.length && names.every((name) => listed.some((text) => text.includes(name)));
      }, viewTimeout)
      .toBe(true);
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

  // The name of the Cluster of a row, the button that opens its details (P13).
  function nameOf(row: Locator): Locator {
    return row.getByTestId("capi-cluster-name").locator("button");
  }

  // The details of the extension, once they show the Cluster of a name: the drawer whose title names it (P15).
  async function detailsOf(name: string): Promise<Locator> {
    const drawer = opened().getByTestId(DETAILS);

    await expect.poll(() => titleOf(drawer), viewTimeout).toBe(`Cluster: ${name}`);
    return drawer;
  }

  // Waits until the details of the extension are closed: the drawer leaves the page once it has slid out.
  async function closed() {
    await opened()
      .getByTestId(DETAILS)
      .waitFor({ state: "detached", ...viewTimeout });
  }

  // The address of the Cluster whose name in the list has the focus, or null when no name has it.
  function focusedName(): Promise<string | null> {
    return opened().evaluate(() =>
      document.activeElement instanceof HTMLElement ? (document.activeElement.dataset.capiCluster ?? null) : null,
    );
  }

  // The parameters of the address of the frame: `details`, of the details of the extension (P6), and `kube-details`, of
  // those of the host.
  function addressOf(): { details: string | null; kubeDetails: string | null } {
    const params = new URL(opened().url()).searchParams;

    return { details: params.get("details"), kubeDetails: params.get("kube-details") };
  }

  // The drawer that shows at the middle of the details of the extension: theirs, or those of the host over them.
  function drawerOnTop(): Promise<string> {
    return opened().evaluate((testId) => {
      const own = document.querySelector(`[data-testid="${testId}"]`);

      if (!own) return "none";

      const box = own.getBoundingClientRect();
      const shown = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest(".Drawer");

      if (shown === own) return "extension";
      return shown?.classList.contains("KubeObjectDetails") ? "host" : "other";
    }, DETAILS);
  }

  // The sections of the details of the extension that show, in their order.
  function sectionsShown(drawer: Locator): Promise<string[]> {
    return drawer
      .locator('[data-testid^="capi-details-section-"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-testid")?.replace("capi-details-section-", "") ?? ""),
      );
  }

  // The words of the activities of the details, in their order.
  function activitiesShown(drawer: Locator): Promise<(string | null)[]> {
    return drawer
      .getByTestId("capi-details-activity")
      .evaluateAll((marks) => marks.map((mark) => mark.getAttribute("data-word")));
  }

  // The row of an activity in the details, by its word.
  function activityRow(drawer: Locator, word: string): Locator {
    return drawer
      .getByTestId("capi-details-activity-row")
      .filter({ has: opened().locator(`[data-testid="capi-details-activity"][data-word="${word}"]`) });
  }

  // The sections of the details of the host, in their order on the page, by the first element of each: the metadata of
  // the host, the panel of the extension, the custom resource section of the host and its events (P16).
  function hostSections(): Promise<string[]> {
    return opened().evaluate(() => {
      const content = document.querySelector(".KubeObjectDetails .drawer-content");
      const items = [...(content?.querySelectorAll(".DrawerItem") ?? [])];
      const titles = [...(content?.querySelectorAll(".DrawerTitle") ?? [])];
      const sections: [string, Element | null | undefined][] = [
        ["metadata", items.find((item) => item.querySelector(":scope > .name")?.textContent === "Created")],
        ["panel", content?.querySelector('[data-testid="capi-cluster-details-view"]')],
        ["custom resource", content?.querySelector(".CustomResourceDetails")],
        ["events", titles.find((title) => title.textContent?.trim() === "Events")],
      ];

      return sections
        .filter((entry): entry is [string, Element] => entry[1] instanceof Element)
        .sort(([, one], [, other]) => (one.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .map(([name]) => name);
    });
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
    // Every step of the end runs whatever failed before it: the labels go, with an annotation that its step could not
    // remove, the cluster is disconnected and the connection closed; what failed is thrown once the end is done.
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

    for (const { namespace, name, field, key } of written) {
      await attempt(() => patchMetadata(namespace, name, field, key, null), "");
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

  it("has no selection and no menu, and a click opens the details of the extension, not those of the host (2; A7, S5, P6)", async () => {
    const cluster = opened();
    const healthy = clusterOf("healthy");

    await selectNamespaces(cluster, [healthy.namespace]);

    const page = await openPage();
    const row = await rowOf(page, healthy.name);

    // The rows keep the cell of the menu that the header always has, empty, so that the columns line up.
    expect(await page.locator(".TableCell.checkbox").count()).toBe(0);
    expect(await page.locator(".TableRow .TableCell.menu").count()).toBe(await page.locator(".TableRow").count());
    expect(await row.locator(".TableCell.menu").textContent()).toBe("");
    expect(await row.locator(".TableCell.menu button, .TableCell.menu .Icon").count()).toBe(0);
    expect(await page.locator(".TableHead .TableCell.menu").count()).toBe(1);

    await row.click({ button: "right" });
    await frames();
    expect(await cluster.locator(".Menu.MenuActions, .KubeObjectMenu").count()).toBe(0);

    // The details of the extension, titled with the name of the Cluster, which the address names in `details`.
    await row.click();
    await detailsOf(healthy.name);
    expect(addressOf()).toEqual({ details: healthy.address, kubeDetails: null });
    expect(await cluster.locator(".KubeObjectDetails").count()).toBe(0);
    expect(await session?.errors()).toEqual([]);
  });

  it(
    "shows the Cluster of each row clicked, and closes on the title of the page and on Escape with the focus back on its name (2; P13, P15)",
    async () => {
      const cluster = opened();
      const keyboard = cluster.page().keyboard;
      const healthy = clusterOf("healthy");
      const paused = clusterOf("paused");

      await selectNamespaces(cluster, [healthy.namespace, paused.namespace]);

      const page = await openPage();
      const search = page.locator('input[placeholder^="Search"]');

      // Both rows at once, with a search that keeps them both, the start of their names: in the first run in CI, the
      // search that had found the row of healthy alone was in the field again when the step clicked the row of paused.
      await search.fill("freelens-capi-");
      await listsOnly(page, healthy.name, paused.name);

      const first = rowNamed(page, healthy.name);
      const second = rowNamed(page, paused.name);

      await first.getByTestId("capi-cluster-health").waitFor(viewTimeout);
      await second.getByTestId("capi-cluster-health").waitFor(viewTimeout);

      // A click on a row, then on another, which the details cover but for its start: they show the Cluster of the
      // row clicked.
      await first.click();
      await detailsOf(healthy.name);
      await nameCellOf(second).click({ position: { x: 2, y: 2 } });
      await detailsOf(paused.name);
      expect(addressOf()).toEqual({ details: paused.address, kubeDetails: null });

      // A click on the title of the page closes them, and the focus goes back to the name.
      await page.locator(".header .title").click();
      await closed();
      expect(addressOf().details).toBeNull();
      expect(await focusedName()).toBe(paused.address);

      // The search is at the end of the header, which the details cover once they have slid in: a click there lands
      // in the details, which stay open, with the focus out of the search. Escape closes them, and the focus goes back
      // to the name. The drawer of the host slides in over 100 ms from the right, so the step waits until the middle of
      // the search lies under the details before it clicks there.
      await first.click();

      const drawer = await detailsOf(healthy.name);
      const under = () =>
        search.evaluate((input) => {
          const area = input.getBoundingClientRect();

          return (
            document
              .elementFromPoint(area.x + area.width / 2, area.y + area.height / 2)
              ?.closest(".Drawer")
              ?.getAttribute("data-testid") ?? null
          );
        });

      await expect.poll(under, viewTimeout).toBe(DETAILS);

      const box = await search.boundingBox();

      if (!box) throw new Error("The search has no box");
      await cluster.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await frames();
      expect(await titleOf(drawer)).toBe(`Cluster: ${healthy.name}`);
      expect(await search.evaluate((input) => document.activeElement === input)).toBe(false);
      await keyboard.press("Escape");
      await closed();
      expect(await focusedName()).toBe(healthy.address);

      // With the details closed, the search takes what is typed after a click on it, and the list shows what it keeps.
      // The click selects what the search holds, which the typing replaces.
      await search.click({ clickCount: 3 });
      await keyboard.type(paused.name);
      expect(await search.inputValue()).toBe(paused.name);
      expect(await cluster.getByTestId(DETAILS).count()).toBe(0);
      await listsOnly(page, paused.name);

      // Tab reaches a name, and Enter opens its details.
      let focused: string | null = null;

      for (let presses = 0; presses < 20 && focused === null; presses++) {
        await keyboard.press("Tab");
        focused = await focusedName();
      }
      expect(focused).toBe(paused.address);
      await keyboard.press("Enter");
      await detailsOf(paused.name);
      await keyboard.press("Escape");
      await closed();
      expect(await focusedName()).toBe(paused.address);
      expect(await session?.errors()).toEqual([]);
    },
    240 * 1000,
  );

  it("shows no remove button, with the Cluster selected in the list of the host, before or after a click (3; P19, S5)", async () => {
    const cluster = opened();
    const { namespace, name } = clusterOf("healthy");

    await selectNamespaces(cluster, [namespace]);
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
    await frames();
    expect(await cluster.locator(".AddRemoveButtons .remove-button").count()).toBe(0);
    expect(await session?.errors()).toEqual([]);
  });

  it(
    "shows its panel in the details of the host after their metadata, and follows the Cluster that nothing of the host watches (3; P16, P31)",
    async () => {
      const cluster = opened();
      const healthy = clusterOf("healthy");
      const selfLink = `/apis/cluster.x-k8s.io/v1beta2/namespaces/${healthy.namespace}/clusters/${healthy.name}`;
      const hostDetails = cluster.locator(".KubeObjectDetails");
      const panel = hostDetails.getByTestId("capi-cluster-details-view");
      const resourceSection = hostDetails.locator(".CustomResourceDetails");

      // The list of the host of the Clusters with `default` alone selected, so that nothing of the host reads the
      // namespace of the Cluster, and its details opened from their address.
      await selectNamespaces(cluster, ["default"]);
      await hostLists(cluster, { group: "cluster.x-k8s.io", plural: "clusters" }, "default", []);
      await navigateCluster(cluster, `?kube-details=${encodeURIComponent(selfLink)}`);
      await panel.getByTestId("capi-details-activity").first().waitFor(viewTimeout);
      await resourceSection.waitFor(viewTimeout);
      expect(await hostSections()).toEqual(["metadata", "panel", "custom resource", "events"]);

      // The annotation that pauses the Cluster reaches the panel, which reads the namespace with stores of its own, with
      // no reload, while the metadata and the custom resource section of the host keep the Cluster as they first read it.
      const annotation = hostDetails.locator(`[title^="${PAUSED_ANNOTATION}"]`);
      const resource = await resourceSection.innerText();

      expect(await annotation.count()).toBe(0);
      await withAnnotation("healthy", PAUSED_ANNOTATION, async () => {
        await activityRow(panel, "Paused").waitFor(viewTimeout);
        expect(await panel.getByTestId("capi-details-pause").textContent()).toBe(PAUSE_WORDS.annotation);
        expect(await annotation.count()).toBe(0);
        expect(await resourceSection.innerText()).toBe(resource);
      });
      expect(await session?.errors()).toEqual([]);
    },
    240 * 1000,
  );

  it(
    "opens the details of the host of the infrastructure cluster from its link, and shows the other references as text (4; P18, P32, S2)",
    async () => {
      const cluster = opened();
      const keyboard = cluster.page().keyboard;
      const rollingOut = clusterOf("rolling-out");
      const spec = fields(rollingOut.cluster.spec);
      const infrastructure = fields(spec?.infrastructureRef);
      const controlPlane = fields(spec?.controlPlaneRef);
      const group = String(infrastructure?.apiGroup);
      const kind = String(infrastructure?.kind);
      const infrastructureName = String(infrastructure?.name);
      const definition = await definitionOfKind(group, kind);
      const hostDetails = cluster.locator(".KubeObjectDetails");

      // Two namespaces, so that the badge of the namespace, at the end, has a filter to change.
      await selectNamespaces(cluster, [rollingOut.namespace, clusterOf("healthy").namespace]);

      const page = await openPage();
      const row = await rowOf(page, rollingOut.name);

      await nameOf(row).click();

      const drawer = await detailsOf(rollingOut.name);
      const link = drawer.getByTestId("capi-details-infrastructure-reference").locator("a");
      const openHostDetails = async () => {
        await link.click();
        await expect.poll(() => titleOf(hostDetails), viewTimeout).toBe(`${kind}: ${infrastructureName}`);
        await expect.poll(drawerOnTop, viewTimeout).toBe("host");
      };

      // The link opens the details of the host of the object of the provider, at a version of the contract label of
      // its definition, over those of the Cluster, which the address keeps.
      await openHostDetails();

      const { details, kubeDetails } = addressOf();
      const target = new RegExp(
        `^/apis/${escaped(group)}/([^/]+)/namespaces/${escaped(rollingOut.namespace)}/${escaped(definition.plural)}/${escaped(infrastructureName)}$`,
      ).exec(kubeDetails ?? "");

      expect(details).toBe(rollingOut.address);
      expect(target, kubeDetails ?? "no details of the host").not.toBeNull();
      expect(definition.versions).toContain(target?.[1]);

      // The close icon of the details of the host shows those of the Cluster again. The address then has no parameter
      // of the details of the host, on both releases, as the first run in CI showed; an empty one would say the same.
      await hostDetails.locator('.drawer-title [data-icon-name="close"]').click();
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await expect.poll(drawerOnTop, viewTimeout).toBe("extension");
      expect(await titleOf(drawer)).toBe(`Cluster: ${rollingOut.name}`);
      expect(addressOf().details).toBe(rollingOut.address);
      expect(addressOf().kubeDetails ?? "").toBe("");

      // One Escape closes both.
      await openHostDetails();
      await keyboard.press("Escape");
      await hostDetails.waitFor({ state: "detached", ...viewTimeout });
      await closed();
      expect(addressOf().details).toBeNull();

      // The control plane, the parts of the workers, the class and the names in the lines of a message are text; the
      // metadata has no link, its namespace being the badge of the host (P32); and a click on one opens nothing. No
      // Cluster of the fixtures has an owner, so the owners are left to the unit test.
      await nameOf(row).click();
      await detailsOf(rollingOut.name);

      const controlPlaneReference = drawer.getByTestId("capi-details-control-plane-reference");
      const parts = drawer.getByTestId("capi-details-part-name");
      const clusterClass = drawer.getByTestId("capi-details-class");
      const lines = drawer.getByTestId("capi-details-line");
      const [deployment] = rollingOut.objects.filter((object) => object.kind === "MachineDeployment");
      const named = lines.filter({ hasText: deployment.metadata.name });
      const controls = (locator: Locator) => locator.locator("a, button").count();

      await parts.first().waitFor(viewTimeout);
      expect((await controlPlaneReference.textContent())?.trim()).toBe(`${controlPlane?.kind} ${controlPlane?.name}`);
      expect(await controls(controlPlaneReference)).toBe(0);
      expect(await controls(parts)).toBe(0);
      expect(await controls(clusterClass)).toBe(0);
      expect(await named.count()).toBeGreaterThan(0);
      expect(await controls(lines)).toBe(0);
      expect(rollingOut.cluster.metadata.ownerReferences).toBeUndefined();
      expect(await drawer.getByTestId("capi-details-owners").count()).toBe(0);
      expect(await drawer.getByTestId("capi-details-section-metadata").locator("a").count()).toBe(0);
      expect((await drawer.getByTestId("capi-details-namespace").locator(".value").textContent())?.trim()).toBe(
        rollingOut.namespace,
      );

      for (const target of [controlPlaneReference, parts.first(), clusterClass, named.first()]) {
        const text = (await target.textContent()) ?? "";

        await target.click();
        await frames();
        expect(addressOf().details, text).toBe(rollingOut.address);
        expect(addressOf().kubeDetails ?? "", text).toBe("");
        expect(await hostDetails.count(), text).toBe(0);
        expect(await titleOf(drawer), text).toBe(`Cluster: ${rollingOut.name}`);
      }

      // The namespace is the badge of the host, which selects that namespace alone in the filter (P32): plain text
      // would leave both namespaces selected.
      await drawer.getByTestId("capi-details-namespace").getByText(rollingOut.namespace, { exact: true }).click();
      await expect
        .poll(
          () =>
            cluster.evaluate(() => [
              ...(globalThis.FreelensExtensionApi.Renderer?.K8sApi.namespaceStore.contextNamespaces ?? []),
            ]),
          viewTimeout,
        )
        .toEqual([rollingOut.namespace]);

      await keyboard.press("Escape");
      await closed();
      expect(await session?.errors()).toEqual([]);
    },
    240 * 1000,
  );

  it(
    "shows the sections that the details give the Clusters of paused, deleting, upgrading, without-topology and remediation (5)",
    async () => {
      const cluster = opened();
      const shown = ["paused", "deleting", "upgrading", "without-topology", "remediation"];

      await selectNamespaces(
        cluster,
        shown.map((state) => clusterOf(state).namespace),
      );

      const page = await openPage();

      for (const state of shown) {
        const fixture = clusterOf(state);
        const row = await rowOf(page, fixture.name);

        await nameOf(row).click();

        const drawer = await detailsOf(fixture.name);

        await drawer.getByTestId("capi-details-activity").first().waitFor(viewTimeout);
        expect(await sectionsShown(drawer), state).toEqual(sectionsOf(fixture));
        expect(await activitiesShown(drawer), state).toEqual(EXPECTED.find((row) => row.state === state)?.activities);

        if (state === "paused") {
          // The form of the pause, and the instant it began.
          const paused = activityRow(drawer, "Paused");

          expect(await paused.getByTestId("capi-details-pause").textContent()).toBe(pauseWordsOf(fixture.cluster));
          expect(await paused.getByTestId("capi-details-since").textContent()).toMatch(/^ since (?!N\/A)\S/);
        }

        if (state === "deleting") {
          // The stage of the deletion, the reason of Deleting, and no health.
          expect((await drawer.getByTestId("capi-details-health").textContent())?.trim()).toBe("N/A");
          expect(await activityRow(drawer, "Deleting").getByTestId("capi-details-stage").textContent()).toMatch(
            new RegExp(`^Stage: ${escaped(String(conditionOf(fixture.cluster, "Deleting")?.reason))}`),
          );
        }

        if (state === "upgrading") {
          // The reason of TopologyReconciled for the upgrade, next to the topology that the sections show.
          expect(await activityRow(drawer, "Upgrading").getByTestId("capi-details-stage").textContent()).toMatch(
            new RegExp(
              `^TopologyReconciled: ${escaped(String(conditionOf(fixture.cluster, "TopologyReconciled")?.reason))}`,
            ),
          );
        }
      }

      await cluster.page().keyboard.press("Escape");
      await closed();
      expect(await session?.errors()).toEqual([]);
    },
    240 * 1000,
  );

  it(
    "stays live: a label that kubectl sets reaches the search and the details of a Cluster outside the namespaces of the page, also in a namespace that the filter adds (6; P14, P19, P31)",
    async () => {
      const cluster = opened();
      const value = `session-${Date.now()}`;
      const upgrading = clusterOf("upgrading");

      await selectNamespaces(cluster, [clusterOf("healthy").namespace, clusterOf("paused").namespace]);

      const page = await openPage();
      const search = page.locator('input[placeholder^="Search"]');

      await rowOf(page, clusterOf("healthy").name);

      // The details of the Cluster of upgrading, opened by their address: the page does not read its namespace, so the
      // details read it with stores of their own, which load it and then watch it (P31).
      const sent = recorder?.requests().length ?? 0;

      await navigateCluster(cluster, `?details=${encodeURIComponent(upgrading.address)}`);

      const drawer = await detailsOf(upgrading.name);

      await drawer.getByTestId("capi-details-activity").first().waitFor(viewTimeout);

      // The loads and the watches of the Clusters of its namespace that the frame sent since the details opened.
      const ownReads = (watch: boolean) =>
        (recorder?.requests() ?? [])
          .slice(sent)
          .filter((request) => URL.canParse(request.url))
          .map((request) => new URL(request.url))
          .filter(
            (url) =>
              url.pathname.endsWith(`/apis/cluster.x-k8s.io/v1beta2/namespaces/${upgrading.namespace}/clusters`) &&
              url.searchParams.has("watch") === watch,
          ).length;

      await expect.poll(() => ownReads(false), viewTimeout).toBeGreaterThan(0);
      await expect.poll(() => ownReads(true), viewTimeout).toBeGreaterThan(0);

      await label("healthy", "freelens-capi-session", value);
      await search.fill(`freelens-capi-session=${value}`);
      await listsOnly(page, clusterOf("healthy").name);

      // A label set on the Cluster of upgrading reaches the metadata of its details.
      await label("upgrading", "freelens-capi-session", `${value}-details`);
      await drawer
        .getByTestId("capi-details-section-metadata")
        .locator(`[title="freelens-capi-session=${value}-details"]`)
        .waitFor(viewTimeout);

      await selectNamespaces(cluster, [
        clusterOf("healthy").namespace,
        clusterOf("paused").namespace,
        clusterOf("without-topology").namespace,
      ]);
      await label("without-topology", "freelens-capi-session", `${value}-later`);
      await search.fill(`freelens-capi-session=${value}-later`);
      await listsOnly(page, clusterOf("without-topology").name);
      expect(await session?.errors()).toEqual([]);
    },
    240 * 1000,
  );

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
      written.push({ namespace, name, field: "labels", key: "freelens-capi-planted" });
    },
  );
});
