/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The restricted session of the Clusters (SPEC-0004, "Tests", "In Freelens, on the definitions and the fixtures",
// `clusters-restricted.tests.ts`; P23), on the cluster of the definitions with the fixtures of every state, which the
// integration workflow applies (P33). It opens the page of the Clusters as a second identity, which it makes on that
// cluster, and changes what that identity may read from one step to the next:
//
// 1. the Clusters refused in the namespace of `paused` alone: Partial, with the mark of the host for the failure of its
//    load; over the whole cluster: Restricted; in the namespace of `healthy`: its Clusters; refused in both: Restricted,
//    "not counted" in the place of the count, next to the mark of the host (P25, P26);
// 2. the Machines refused in the namespace of `paused` alone, then in both: the Clusters of both, a notice that names
//    the Machines, with the permission, and activities that read Unknown, never Idle (P25);
// 4. every kind of the page over the whole cluster, and no watch of every resource of the core group: the notice of a
//    list that the host reads once and does not follow, and none with one namespace, where a label that kubectl sets
//    reaches the search with no reload (P34);
// 3. S2, with an identity that may not list the definitions: a link to the infrastructure cluster when it may get its
//    definition by its name, else text with the reason and the permission (P3).
//
// Case 3 runs last: the host lists the definitions as the frame of a cluster starts, and keeps what that list gave, so
// the identity that may not list them is tried in a frame that the session loads again once its access refuses them.
//
// The identity is a ServiceAccount in a namespace of its own, with a token from a TokenRequest, which the session
// writes, with the API server and the authority of the kubeconfig of the scripts, into a kubeconfig file in the folder
// that TEST_RESTRICTED_KUBECONFIG_FOLDER names, which the profile of Freelens dev syncs (TESTING.md, "Safety"). Every
// step grants what it allows through roles that read alone, and waits until the cluster answers so for the identity.
// The session writes only to the cluster of the definitions, through the scripts of the test environment, which check
// the target before every request. A refusal that a case expects is left out of the errors when it arrives, by its
// status and its address, the frame that sent it and the page that frame shows; any other refusal, and any other
// error, fails the session. Its end, also when a case failed, deletes the file, every object of RBAC, the
// ServiceAccount and its namespace, and checks that they are gone. The token is never logged.

import { existsSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDefinitions } from "../../e2e/scripts/commands.mts";
import { FIXTURES_FOLDER, readFixtureSet } from "../../e2e/scripts/fixtures.mts";
import { statesOf } from "../../e2e/scripts/states.mts";
import {
  appReady,
  catalogLists,
  connectApp,
  disconnectCluster,
  extensionName,
  installExtension,
  navigateCluster,
  openCluster,
  openExtensionPage,
  reloadClusterFrame,
  selectNamespaces,
} from "./extension-helpers";
import {
  accessObjects,
  accessReviews,
  CONTROL_PLANE_DEFINITION,
  extraObjects,
  IDENTITY,
  IDENTITY_USER,
  INFRASTRUCTURE_DEFINITION,
  identityObjects,
  kubeconfigOf,
  listPath,
  PAGE_KINDS,
  permissionsOf,
  refusedDefinitions,
  refusedLists,
  wrongAnswers,
} from "./restricted-access";

import type { Frame, Locator } from "playwright";

import type { DefinitionsSession } from "../../e2e/scripts/commands.mts";
import type { AppSession } from "./extension-helpers";
import type { Access, Kind, ObjectKey } from "./restricted-access";

const viewTimeout = { timeout: 60 * 1000 };
const stepTimeout = 300 * 1000;

const repository = path.resolve(import.meta.dirname, "..", "..");

// The name of the Cluster of a state of the fixtures, from its files.
function clusterOf(state: string): string {
  const cluster = readFixtureSet(path.join(repository, FIXTURES_FOLDER, state)).find(
    (object) => object.kind === "Cluster",
  );

  if (!cluster) {
    throw new Error(`No Cluster in the fixtures of ${state}`);
  }
  return cluster.metadata.name;
}

const [healthyState, pausedState] = statesOf(["healthy", "paused"]);
const HEALTHY = healthyState.namespace;
const PAUSED = pausedState.namespace;
const HEALTHY_CLUSTER = clusterOf("healthy");
const PAUSED_CLUSTER = clusterOf("paused");
const FIXTURE_CLUSTERS = statesOf(["all"])
  .map((state) => clusterOf(state.name))
  .sort();

const CLUSTERS = PAGE_KINDS.find((kind) => kind.plural === "clusters") as Kind;
const MACHINES = PAGE_KINDS.find((kind) => kind.plural === "machines") as Kind;

// The accesses of the cases, in the order in which the session grants them.
const CLUSTERS_IN_PAUSED: Access = {
  scope: "namespaces",
  refused: [{ plural: "clusters", namespace: PAUSED }],
  definitions: "list",
};
const CLUSTERS_IN_BOTH: Access = {
  scope: "namespaces",
  refused: [
    { plural: "clusters", namespace: HEALTHY },
    { plural: "clusters", namespace: PAUSED },
  ],
  definitions: "list",
};
const MACHINES_IN_PAUSED: Access = {
  scope: "namespaces",
  refused: [{ plural: "machines", namespace: PAUSED }],
  definitions: "list",
};
const MACHINES_IN_BOTH: Access = {
  scope: "namespaces",
  refused: [
    { plural: "machines", namespace: HEALTHY },
    { plural: "machines", namespace: PAUSED },
  ],
  definitions: "list",
};
const OVER_THE_CLUSTER: Access = { scope: "cluster" };
const DEFINITIONS_BY_NAME: Access = {
  scope: "namespaces",
  refused: [],
  definitions: [CONTROL_PLANE_DEFINITION, INFRASTRUCTURE_DEFINITION],
};
const INFRASTRUCTURE_DEFINITION_REFUSED: Access = {
  scope: "namespaces",
  refused: [],
  definitions: [CONTROL_PLANE_DEFINITION],
};

// The page of the Clusters in the frame of a cluster.
const PAGE = `/extension/${extensionName.replace("@", "").replace("/", "--")}/clusters`;

// What the notices of the page say of a refusal (src/common/views/read-state.ts).
const LIST_PERMISSION =
  "Listing them takes get, list and watch on clusters of cluster.x-k8s.io, in those namespaces or over the whole cluster.";
const MACHINES_PERMISSION =
  "Reading them takes get, list and watch on machines of cluster.x-k8s.io, in those namespaces or over the whole cluster.";
const MACHINES_NOTE =
  "Until they can be read, the Clusters of those namespaces are evaluated without them, which the status model notes: their activities read Unknown where their Machines count, never Idle.";
const NOT_FOLLOWED_LINES = [
  "A change reaches it when the namespace filter changes or the page opens again.",
  "Freelens follows a list read over the whole cluster only for a user who may watch every resource of the core group over the whole cluster.",
  "A selection that leaves out a namespace is read and watched namespace by namespace.",
];

// The folder whose kubeconfig files the profile of Freelens dev syncs, for the identity of the session.
const folder = process.env.TEST_RESTRICTED_KUBECONFIG_FOLDER;

function list(items: readonly unknown[]): string {
  return JSON.stringify({ apiVersion: "v1", kind: "List", items });
}

// Why the session cannot run here, or nothing when it can: a folder that the profile syncs, outside the repository,
// where the token of the identity never ends up in a commit.
function folderProblem(): string | undefined {
  if (!folder) {
    return "TEST_RESTRICTED_KUBECONFIG_FOLDER names no folder that the profile of Freelens dev syncs";
  }
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    return `${folder}, which TEST_RESTRICTED_KUBECONFIG_FOLDER names, is not a folder`;
  }

  const relative = path.relative(realpathSync(repository), realpathSync(folder));

  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `${folder} is inside the repository, where the token of the identity could end up in a commit`;
  }
  return undefined;
}

// The cluster of the definitions through the scripts, which check it before every request; outside CI the session skips
// with a warning when it cannot run, in CI it fails instead.
async function open(): Promise<DefinitionsSession | undefined> {
  let reason = folderProblem();

  if (reason === undefined) {
    try {
      return await openDefinitions();
    } catch (error) {
      reason = `the cluster of the definitions cannot be reached through the scripts: ${error instanceof Error ? error.message : error}`;
    }
  }
  if (process.env.CI) {
    throw new Error(`Cannot run the restricted session: ${reason}`);
  }
  console.warn(`Skipping the restricted session: ${reason}`);
  return undefined;
}

const definitions = (await appReady({ cluster: false })) ? await open() : undefined;

describe.skipIf(definitions === undefined)("the Clusters for a user who may read only part of the cluster", () => {
  const cluster = definitions as DefinitionsSession;
  const file = path.join(folder ?? "", IDENTITY.file);
  let session: AppSession | undefined;
  let frame: Frame | undefined;
  let frameHost = "";
  // The label of case 4, while it is set.
  let labelled: string | undefined;

  function opened(): { session: AppSession; frame: Frame } {
    if (!session || !frame) {
      throw new Error("The cluster of the identity is not open");
    }
    return { session, frame };
  }

  // The objects of RBAC that the session made, as the cluster lists them by the label of the session.
  function existingObjects(): ObjectKey[] {
    return cluster
      .kubectl([
        "get",
        "clusterroles.rbac.authorization.k8s.io,clusterrolebindings.rbac.authorization.k8s.io,rolebindings.rbac.authorization.k8s.io",
        "--all-namespaces",
        "--selector",
        `${IDENTITY.label}=${IDENTITY.labelValue}`,
        "--output",
        'jsonpath={range .items[*]}{.kind}{"\\t"}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\n"}{end}',
      ])
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [kind, namespace, name] = line.split("\t");

        return { kind, namespace, name };
      });
  }

  function deleteObject({ kind, namespace, name }: ObjectKey) {
    cluster.kubectl([
      "delete",
      `${kind.toLowerCase()}s.rbac.authorization.k8s.io`,
      name,
      ...(namespace ? ["--namespace", namespace] : []),
      "--ignore-not-found",
    ]);
  }

  // Grants an access: its objects applied, those of the access before it deleted, and then every permission that it
  // decides asked of the cluster, in one batch of SubjectAccessReviews, until the cluster answers each as the access
  // does, so that the next read of the identity sees it.
  async function grant(next: Access) {
    const objects = accessObjects(next);
    const permissions = permissionsOf(next);

    cluster.apply(list(objects));
    for (const extra of extraObjects(existingObjects(), objects)) deleteObject(extra);
    await expect
      .poll(
        () =>
          wrongAnswers(
            permissions,
            JSON.parse(
              cluster.kubectl(["create", "--output", "json", "--filename", "-"], {
                input: list(accessReviews(permissions)),
              }),
            ),
          ),
        { timeout: 120 * 1000, interval: 1000 },
      )
      .toEqual([]);
  }

  // The message of the refusal of a request of the identity, as the cluster writes it, which the page shows.
  function refusalMessage(path: string): string {
    const { status, stderr } = cluster.impersonate(IDENTITY_USER, ["get", "--raw", path]);
    const message = /^Error from server \(Forbidden\): (.+)$/m.exec(stderr)?.[1]?.trim();

    if (status === 0 || message === undefined) {
      throw new Error(`The cluster does not refuse ${path} to the identity`);
    }
    return message;
  }

  // Leaves out, while a case runs, the refusals of the lists and of the gets that it expects from the frame of the
  // cluster of the identity, while that frame shows the page of the Clusters.
  function expectRefusals(paths: readonly string[]): () => void {
    return opened().session.expectRefusals(paths.map((path) => ({ frameHost, page: PAGE, path })));
  }

  // The page of the Clusters, open with its list.
  async function openPage(): Promise<Locator> {
    const { frame } = opened();

    await openExtensionPage(frame, "clusters");

    const page = frame.getByTestId("capi-clusters-page");

    await page.locator(".TableHead").waitFor(viewTimeout);
    return page;
  }

  // The names of the Clusters that the list shows, sorted.
  async function listedNames(page: Locator): Promise<string[]> {
    return (await page.getByTestId("capi-cluster-name").allTextContents()).map((name) => name.trim()).sort();
  }

  // The words of the activities of the row of a Cluster.
  async function activitiesOf(page: Locator, name: string): Promise<(string | null)[]> {
    const row = page
      .locator(".TableRow")
      .filter({ has: opened().frame.getByTestId("capi-cluster-name").getByText(name, { exact: true }) });

    await row.getByTestId("capi-cluster-activity").first().waitFor(viewTimeout);
    return row
      .getByTestId("capi-cluster-activity")
      .evaluateAll((marks) => marks.map((mark) => mark.dataset.word ?? null));
  }

  // Whether an element comes before the table of the layout, as a notice over the list does.
  function beforeTheTable(notice: Locator): Promise<boolean> {
    return notice.evaluate((element) => {
      const table = element.closest('[data-testid="capi-clusters-page"]')?.querySelector(".TableHead");

      return (
        table !== null &&
        table !== undefined &&
        (element.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      );
    });
  }

  // The namespace `default` alone, where every access lets the identity read every kind, and the empty list of the host,
  // once its load has ended: the state between two steps, so that no read of the step before runs on.
  async function settle(page: Locator) {
    await selectNamespaces(opened().frame, ["default"]);
    await page.locator(".NoItems").waitFor(viewTimeout);
    await expect.poll(() => page.locator('[data-testid^="capi-notice-"]').count(), viewTimeout).toBe(0);
  }

  // Sets or removes a label of the Cluster of healthy with a merge patch.
  function patchLabel(key: string, value: string | null) {
    cluster.kubectl([
      "patch",
      "clusters.v1beta2.cluster.x-k8s.io",
      HEALTHY_CLUSTER,
      "--namespace",
      HEALTHY,
      "--type",
      "merge",
      "--patch",
      JSON.stringify({ metadata: { labels: { [key]: value } } }),
    ]);
  }

  // Removes what a run that was killed left: the file, every object of RBAC of the session, and its namespace.
  function removeLeftovers() {
    rmSync(file, { force: true });
    for (const object of existingObjects()) deleteObject(object);
    cluster.kubectl(["delete", "namespace", IDENTITY.namespace, "--ignore-not-found", "--wait", "--timeout", "180s"], {
      timeout: 4 * 60 * 1000,
    });
  }

  beforeAll(async () => {
    removeLeftovers();
    cluster.apply(list(identityObjects()));
    await grant(CLUSTERS_IN_PAUSED);

    // The token of the identity goes from kubectl into the file alone.
    const token = cluster
      .kubectl(["create", "token", IDENTITY.serviceAccount, "--namespace", IDENTITY.namespace, "--duration", "3600s"])
      .trim();
    const { server, certificateAuthorityData } = cluster.apiServer();

    writeFileSync(file, kubeconfigOf(server, certificateAuthorityData, token), { mode: 0o600 });

    session = await connectApp();
    await installExtension(session);

    const app = session;

    await expect
      .poll(() => catalogLists(app, IDENTITY.context), {
        timeout: 120 * 1000,
        message: `The catalog does not list ${IDENTITY.context}: add the folder ${folder} in Kubeconfig Syncs of the profile of Freelens dev`,
      })
      .toBe(true);
    frame = await openCluster(session, IDENTITY.context);
    frameHost = new URL(frame.url()).host;
  }, stepTimeout);

  afterAll(async () => {
    // Every step of the end runs whatever failed before it; what failed is thrown once the end is done.
    const failures: unknown[] = [];
    const attempt = async <T>(step: () => T | Promise<T>, otherwise: T): Promise<T> => {
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

    if (labelled !== undefined) {
      const key = labelled;

      await attempt(() => patchLabel(key, null), undefined);
    }
    if (session) {
      const app = session;

      await attempt(() => disconnectCluster(app, IDENTITY.context), undefined);
      await attempt(() => app.close(), undefined);
    }
    await attempt(() => rmSync(file, { force: true }), undefined);
    await attempt(() => {
      for (const object of existingObjects()) deleteObject(object);
      cluster.kubectl(
        ["delete", "namespace", IDENTITY.namespace, "--ignore-not-found", "--wait", "--timeout", "180s"],
        { timeout: 4 * 60 * 1000 },
      );
    }, undefined);

    // What the session made is gone: the file, the objects of RBAC, and the namespace with its ServiceAccount.
    const left = await attempt(
      () => [
        ...(existsSync(file) ? [file] : []),
        ...existingObjects().map((object) => `${object.kind} ${object.namespace}/${object.name}`),
        ...cluster
          .kubectl(["get", "namespace", IDENTITY.namespace, "--ignore-not-found", "--output", "name"])
          .split("\n")
          .filter((line) => line.length > 0),
      ],
      [] as string[],
    );

    await attempt(() => cluster.close(), undefined);

    const failed = [
      ...(errors.length === 0 ? [] : [`The app logged errors:\n${errors.join("\n")}`]),
      ...(left.length === 0 ? [] : [`The session left:\n${left.join("\n")}`]),
      ...failures.map(
        (failure) => `The end of the session failed: ${failure instanceof Error ? failure.message : String(failure)}`,
      ),
    ];

    if (failed.length > 0) {
      throw new Error(
        `${failed.length === 1 ? "A check" : `${failed.length} checks`} at the end of the session failed:\n\n${failed.join("\n\n")}`,
      );
    }
  }, stepTimeout);

  it(
    "case 1: the Clusters refused in the namespace of paused alone give Partial, over the whole cluster and in both namespaces Restricted (P25, P26)",
    async () => {
      const { session, frame } = opened();
      const stop = expectRefusals([
        ...refusedLists(CLUSTERS_IN_PAUSED, [HEALTHY, PAUSED]),
        ...refusedLists(CLUSTERS_IN_PAUSED, "every"),
        ...refusedLists(CLUSTERS_IN_BOTH, [HEALTHY, PAUSED]),
      ]);
      const page = await openPage();

      try {
        // Refused in the namespace of paused alone: the Clusters of healthy, and over them the notice of Partial, with
        // the message of the answer and the permission, and in the header the mark of the host for the failure of its
        // load.
        await selectNamespaces(frame, [HEALTHY, PAUSED]);

        const partial = page.getByTestId("capi-notice-list-partial");

        await partial.waitFor(viewTimeout);
        await expect.poll(() => listedNames(page), viewTimeout).toEqual([HEALTHY_CLUSTER]);
        expect(await beforeTheTable(partial)).toBe(true);
        expect(await partial.textContent()).toContain("The Clusters could not all be read");
        expect(await partial.textContent()).toContain(refusalMessage(listPath(CLUSTERS, PAUSED)));
        expect(await partial.textContent()).toContain(LIST_PERMISSION);
        await page.locator(".header .load-error").waitFor(viewTimeout);

        // Every namespace selected, which the host reads over the whole cluster, where grants in namespaces do not
        // reach: Restricted, never the empty list, with the message of the answer, which says that the user may not
        // list the Clusters over the whole cluster, and "not counted" next to the mark of the host.
        await selectNamespaces(frame, []);

        const restricted = page.getByTestId("capi-notice-list-restricted");

        await restricted.waitFor(viewTimeout);
        expect(await restricted.textContent()).toContain(
          "You may not list the Clusters over the whole cluster, which is how Freelens reads every namespace",
        );
        expect(await restricted.textContent()).toContain(refusalMessage(listPath(CLUSTERS)));
        expect(await restricted.textContent()).toContain(LIST_PERMISSION);
        expect(await restricted.textContent()).toContain(
          "Select in the namespace filter the namespaces whose Clusters you may read.",
        );
        await page.locator(".header").getByTestId("capi-clusters-not-counted").waitFor(viewTimeout);
        await page.locator(".header .load-error").waitFor(viewTimeout);
        expect(await listedNames(page)).toEqual([]);
        expect(await page.locator(".NoItems").count()).toBe(0);

        // The namespace of healthy alone: its Clusters, and no notice.
        await selectNamespaces(frame, [HEALTHY]);
        await expect.poll(() => listedNames(page), viewTimeout).toEqual([HEALTHY_CLUSTER]);
        await expect.poll(() => page.locator('[data-testid^="capi-notice-list-"]').count(), viewTimeout).toBe(0);

        // Refused in both namespaces: Restricted, with the message of each answer, and "not counted" next to the mark of
        // the host.
        await settle(page);
        await grant(CLUSTERS_IN_BOTH);
        await selectNamespaces(frame, [HEALTHY, PAUSED]);
        await restricted.waitFor(viewTimeout);
        expect(await restricted.textContent()).toContain(
          "You may not list the Clusters of the namespaces that the filter selects",
        );
        for (const namespace of [HEALTHY, PAUSED]) {
          expect(await restricted.textContent()).toContain(refusalMessage(listPath(CLUSTERS, namespace)));
        }
        expect(await restricted.textContent()).toContain(LIST_PERMISSION);
        await page.locator(".header").getByTestId("capi-clusters-not-counted").waitFor(viewTimeout);
        await page.locator(".header .load-error").waitFor(viewTimeout);
        expect(await listedNames(page)).toEqual([]);
        expect(await page.locator(".NoItems").count()).toBe(0);
        expect(await session.errors()).toEqual([]);
      } finally {
        await settle(page);
        stop();
      }
    },
    stepTimeout,
  );

  it(
    "case 2: the Machines refused in the namespace of paused, then in both, leave the Clusters listed with activities Unknown, never Idle (P25)",
    async () => {
      const { session, frame } = opened();
      const stop = expectRefusals([
        ...refusedLists(MACHINES_IN_PAUSED, [HEALTHY, PAUSED]),
        ...refusedLists(MACHINES_IN_BOTH, [HEALTHY, PAUSED]),
      ]);
      const page = await openPage();

      try {
        for (const step of [MACHINES_IN_PAUSED, MACHINES_IN_BOTH]) {
          await settle(page);
          await grant(step);
          await selectNamespaces(frame, [HEALTHY, PAUSED]);

          // The Clusters of both namespaces, and over them a notice that names the Machines, with the message of each
          // answer, the permission, and what reads Unknown because of them.
          const notice = page.getByTestId("capi-notice-kind-Machine");
          const refused = step === MACHINES_IN_PAUSED ? [PAUSED] : [HEALTHY, PAUSED];

          await notice.waitFor(viewTimeout);
          await expect.poll(() => listedNames(page), viewTimeout).toEqual([HEALTHY_CLUSTER, PAUSED_CLUSTER].sort());
          expect(await beforeTheTable(notice)).toBe(true);
          expect(await notice.textContent()).toContain("The Machines could not all be read");
          for (const namespace of refused) {
            expect(await notice.textContent()).toContain(refusalMessage(listPath(MACHINES, namespace)));
          }
          expect(await notice.textContent()).toContain(MACHINES_PERMISSION);
          expect(await notice.textContent()).toContain(MACHINES_NOTE);

          // The activities of both Clusters read Unknown, given no Machines, and never Idle: the Cluster of paused keeps
          // its pause, which reads no Machine (SPEC-0003, "The closed sets").
          await expect.poll(() => activitiesOf(page, HEALTHY_CLUSTER), viewTimeout).toEqual(["Unknown"]);
          await expect.poll(() => activitiesOf(page, PAUSED_CLUSTER), viewTimeout).toEqual(["Paused", "Unknown"]);

          // The details of the Cluster of healthy say that the Machines could not be read, why, and the permission.
          await page
            .locator(".TableRow")
            .filter({ has: frame.getByTestId("capi-cluster-name").getByText(HEALTHY_CLUSTER, { exact: true }) })
            .getByTestId("capi-cluster-name")
            .locator("button")
            .click();

          const failure = frame.getByTestId("capi-cluster-details").getByTestId("capi-details-read-failure");

          await failure.first().waitFor(viewTimeout);
          expect(await failure.first().textContent()).toContain("The Machines could not be read");
          expect(await failure.first().textContent()).toContain(
            "Reading them takes get, list and watch on machines of cluster.x-k8s.io.",
          );
          await frame.page().keyboard.press("Escape");
          await frame.getByTestId("capi-cluster-details").waitFor({ state: "detached", ...viewTimeout });
        }
        expect(await session.errors()).toEqual([]);
      } finally {
        await settle(page);
        stop();
      }
    },
    stepTimeout,
  );

  it(
    "case 4: a list read over the whole cluster, which the host does not follow, says so, and a list of one namespace follows a label (P34)",
    async () => {
      const { session, frame } = opened();
      const page = await openPage();
      const key = "freelens-capi-restricted";
      const value = `session-${Date.now()}`;

      await settle(page);
      await grant(OVER_THE_CLUSTER);

      // Every namespace selected: the Clusters of the fixtures, and above them the notice that the list was read once,
      // at its time, over the whole cluster, and is not followed: the identity may not watch every resource of the core
      // group over the whole cluster, `isGlobalWatchEnabled()` false.
      await selectNamespaces(frame, []);

      const notice = page.getByTestId("capi-notice-list-not-followed");

      await notice.waitFor(viewTimeout);
      await expect.poll(() => listedNames(page), viewTimeout).toEqual(FIXTURE_CLUSTERS);
      expect(await beforeTheTable(notice)).toBe(true);
      expect(await notice.textContent()).toMatch(
        /This list was read once, at .+, over the whole cluster, and is not followed/,
      );
      for (const line of NOT_FOLLOWED_LINES) expect(await notice.textContent()).toContain(line);

      // The namespace of healthy alone, read and watched in that namespace: no notice, and a label that kubectl sets
      // reaches the search with no reload.
      await selectNamespaces(frame, [HEALTHY]);
      await expect.poll(() => notice.count(), viewTimeout).toBe(0);
      await expect.poll(() => listedNames(page), viewTimeout).toEqual([HEALTHY_CLUSTER]);
      labelled = key;
      try {
        patchLabel(key, value);
        await page.locator('input[placeholder^="Search"]').fill(`${key}=${value}`);
        await expect.poll(() => listedNames(page), viewTimeout).toEqual([HEALTHY_CLUSTER]);
        await page.locator('input[placeholder^="Search"]').fill("");
      } finally {
        patchLabel(key, null);
        labelled = undefined;
      }
      await settle(page);
      expect(await session.errors()).toEqual([]);
    },
    stepTimeout,
  );

  it(
    "case 3: a user who may not list the definitions sees the infrastructure cluster as a link when it may get its definition by its name, else as text with the reason and the permission (S2, P3)",
    async () => {
      const { session, frame } = opened();
      const address = `${HEALTHY}/${HEALTHY_CLUSTER}`;
      const details = frame.getByTestId("capi-cluster-details");
      const reference = details.getByTestId("capi-details-infrastructure-reference");
      // The list of the definitions that the host makes as the frame starts, and the get of the definition of the
      // infrastructure cluster once the identity may not read it.
      const stop = expectRefusals([
        ...refusedDefinitions(DEFINITIONS_BY_NAME),
        ...refusedDefinitions(INFRASTRUCTURE_DEFINITION_REFUSED),
      ]);

      try {
        await settle(await openPage());
        await grant(DEFINITIONS_BY_NAME);
        // A frame of its own, whose host lists the definitions as it starts, and may not.
        await reloadClusterFrame(frame);

        const page = frame.getByTestId("capi-clusters-page");

        await page.locator(".TableHead").waitFor(viewTimeout);

        // The details of the Cluster of healthy, whose namespace the page does not read, by their address: they read
        // the definitions of the kinds that the Cluster names by their names, and the infrastructure cluster is a link.
        await navigateCluster(frame, `${PAGE}?details=${encodeURIComponent(address)}`);
        await reference.locator("a").waitFor(viewTimeout);
        expect((await reference.textContent())?.trim()).toMatch(/^DevCluster \S+$/);
        await frame.page().keyboard.press("Escape");
        await details.waitFor({ state: "detached", ...viewTimeout });

        // The definition of the infrastructure cluster refused: text, with the reason, the permission and the message
        // of the answer.
        await grant(INFRASTRUCTURE_DEFINITION_REFUSED);
        await navigateCluster(frame, `${PAGE}?details=${encodeURIComponent(address)}`);

        const unread = details.getByTestId("capi-details-infrastructure-reference-unread");

        await unread.waitFor(viewTimeout);
        expect(await reference.locator("a").count()).toBe(0);
        expect((await reference.textContent())?.trim()).toMatch(/^DevCluster \S+$/);
        expect(await unread.textContent()).toContain(
          "Not read. Its definition could not be read: reading it takes get on customresourcedefinitions of apiextensions.k8s.io, for that definition.",
        );
        expect(await unread.textContent()).toContain(
          refusalMessage(`/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${INFRASTRUCTURE_DEFINITION}`),
        );
        await frame.page().keyboard.press("Escape");
        await details.waitFor({ state: "detached", ...viewTimeout });
        expect(await session.errors()).toEqual([]);
      } finally {
        stop();
      }
    },
    stepTimeout,
  );
});
