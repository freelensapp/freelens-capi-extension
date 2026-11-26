/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// S6 of SPEC-0001 (SPEC-0004, "With the real project", `clusters-sveltos.tests.ts`; P29), a session of the real tier,
// which the job of the real project of test-environment.yaml runs in Freelens dev on each release of the integration
// tests, and nothing else runs (P33): with the Sveltos extension installed next to this one, both list the same
// Clusters, and neither watch disturbs the other. The Sveltos extension reads the Clusters at `v1beta1`, which only the
// conversion webhook of the real project serves, and this one at `v1beta2`, each through a store of the host of its own.
//
// 1. It installs the Sveltos extension from the file of its official package, which the scripts download and check
//    against its pin, from the Extensions page, with the `.sha256` beside it that the host checks it against, and
//    applies to the cluster of the real project the definitions of the chart of Sveltos of the pins, checked against
//    its pin, and nothing else of Sveltos.
// 2. Both pages list `freelens-capi-md` and `freelens-capi-mp` in `default`, and nothing else.
// 3. A label `tier=dev` that kubectl sets on `freelens-capi-md` reaches the search of both pages when they open.
// 4. The label removed with this page open reaches it at once; set again with the page of the Sveltos extension open,
//    it reaches that page through its watch, and this page, which closed with the label removed, when it opens; removed
//    again with the page of the Sveltos extension open, it reaches that page through its watch, and this page, which
//    closed with the label set, when it opens. The page of the Sveltos extension also reloads its lists every 30
//    seconds, so an update that it shows counts only when no list of the Clusters without a watch went between the write
//    and the update; when one did, the step makes its write again, three times at most, and says so.
// 5. At its end, also when a step failed, it removes the label, uninstalls the Sveltos extension, and deletes the
//    definitions of Sveltos by the names that it took from their manifests before it applied them.
//
// It writes to the cluster of the real project alone, through the scripts of the test environment, which check the
// target before every request, and fails on any error that either process logs, a failed watch of `cluster.x-k8s.io`
// included, which the client of the host logs as a warning.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openRealProject } from "../../e2e/scripts/commands.mts";
import { definitionName } from "../../e2e/scripts/manifests.mts";
import {
  appReady,
  connectApp,
  disconnectKindCluster,
  extensionEnabled,
  extensionName,
  installExtension,
  installExtensionFile,
  openExtensionPage,
  openKindCluster,
  recordRequests,
  recordWatchFailures,
  selectNamespaces,
  uninstallExtensionNamed,
} from "./extension-helpers";
import { clusterListsBetween } from "./real-project-checks";

import type { Frame, Locator } from "playwright";

import type { RealProjectSession } from "../../e2e/scripts/commands.mts";
import type { AppSession } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };
// The time within which a page that is open follows a write through its watch, which brings it in a second or two.
const followTimeout = { timeout: 20 * 1000 };

// The time from which a list of the page of the Sveltos extension can still answer after a write: two seconds before it.
const LIST_ANSWER_MARGIN = 2 * 1000;
// The times that a step makes its write again when the page of the Sveltos extension reloaded its lists meanwhile.
const FOLLOW_ATTEMPTS = 3;

const SVELTOS = "@freelensapp/sveltos-extension";
// The resource of the definitions, which the session deletes by their names.
const DEFINITIONS = "customresourcedefinitions.apiextensions.k8s.io";
const NAMESPACE = "default";
const MD = "freelens-capi-md";
const MP = "freelens-capi-mp";
const LABEL = { key: "tier", value: "dev" };
// The searches of the two pages: the Sveltos extension reads `key: value` as a label and its value
// (freelens-sveltos-extension:src/renderer/api/search-query.ts:14-47), and this one matches the labels as `key=value`
// (SPEC-0004, P14).
const SVELTOS_SEARCH = `${LABEL.key}: ${LABEL.value}`;
const OWN_SEARCH = `${LABEL.key}=${LABEL.value}`;

// The real project through the scripts; outside CI the session skips with a warning when it is not up, in CI it fails
// instead.
async function open(): Promise<RealProjectSession | undefined> {
  try {
    return await openRealProject();
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn(
      `Skipping S6: the real project cannot be reached through the scripts: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
}

const project = (await appReady({ cluster: false })) ? await open() : undefined;

describe.skipIf(project === undefined)("S6: the Clusters with the Sveltos extension installed", () => {
  const real = project as RealProjectSession;
  let session: AppSession | undefined;
  let frame: Frame | undefined;
  let watches: ReturnType<typeof recordWatchFailures> | undefined;
  let requests: ReturnType<typeof recordRequests> | undefined;
  // The folder of the package of the Sveltos extension and of its `.sha256`, outside every repository.
  let folder: string | undefined;
  // The names of the definitions of Sveltos, taken from their manifests before the session applies them, and what
  // kubectl said that it applied.
  let definitions: string[] = [];
  let applied: string[] = [];
  // Set before the write of the label, so that the end removes a label whose write failed half way.
  let labelled = false;

  function opened(): { session: AppSession; frame: Frame } {
    if (!session || !frame) {
      throw new Error("The cluster of the real project is not open");
    }
    return { session, frame };
  }

  function setLabel(value: string | null) {
    if (value !== null) {
      labelled = true;
    }
    real.kubectl([
      "label",
      "clusters.v1beta2.cluster.x-k8s.io",
      MD,
      "--namespace",
      NAMESPACE,
      ...(value === null ? [`${LABEL.key}-`] : [`${LABEL.key}=${value}`, "--overwrite"]),
    ]);
    if (value === null) {
      labelled = false;
    }
  }

  // The page of the Clusters of the Sveltos extension, by the name of that extension, switched to the Clusters of
  // Cluster API.
  async function openSveltosPage(): Promise<Locator> {
    const { frame } = opened();

    await openExtensionPage(frame, "sveltos-clusters", SVELTOS);
    await frame.getByRole("button", { name: "ClusterAPI", exact: true }).click(viewTimeout);
    return frame.locator('input[placeholder="cloudProvider: aws, tier: dev"]');
  }

  // The Clusters that the page of the Sveltos extension lists, each as `<namespace>/<name>`, from the cells of the name
  // and of the namespace of its table, sorted.
  function sveltosRows(): Promise<string[]> {
    return opened()
      .frame.locator(".TableRow")
      .evaluateAll((rows) =>
        rows
          .map((row) => [...row.querySelectorAll("span[title]")].map((cell) => cell.getAttribute("title") ?? ""))
          .filter((cells) => cells.length >= 2)
          .map(([name, namespace]) => `${namespace}/${name}`)
          .sort(),
      );
  }

  // The page of the Clusters of this extension.
  async function openOwnPage(): Promise<Locator> {
    const { frame } = opened();

    await openExtensionPage(frame, "clusters");

    const page = frame.getByTestId("capi-clusters-page");

    await page.locator(".TableHead").waitFor(viewTimeout);
    return page.locator('input[placeholder^="Search"]');
  }

  // The Clusters that the page of this extension lists, each as `<namespace>/<name>`, from the cell of the name and the
  // one after it, the namespace badge, sorted.
  function ownRows(): Promise<string[]> {
    return opened()
      .frame.getByTestId("capi-clusters-page")
      .locator(".TableRow")
      .evaluateAll((rows) =>
        rows
          .map((row) => {
            const name = row.querySelector('[data-testid="capi-cluster-name"]');
            const namespace = name?.closest(".TableCell")?.nextElementSibling?.textContent?.trim();

            return name === null ? "" : `${namespace}/${name.textContent?.trim()}`;
          })
          .filter((row) => row !== "")
          .sort(),
      );
  }

  // Writes the label, or removes it, with the page of the Sveltos extension open, and waits until that page shows
  // `expected`. The update counts only when no list of the Clusters without a watch went from two seconds before the
  // write, whose answer could come after it, to the update, so that it came through the watch of the page and not
  // through its reload every 30 seconds; when one did, the write is undone and made again, three times at most.
  async function sveltosFollows(value: string | null, expected: readonly string[], before: readonly string[]) {
    for (let attempt = 1; ; attempt++) {
      const from = Date.now() - LIST_ANSWER_MARGIN;

      setLabel(value);
      await expect.poll(sveltosRows, followTimeout).toEqual(expected);

      const lists = clusterListsBetween(requests?.requests() ?? [], from, Date.now());

      if (lists.length === 0) {
        return;
      }
      if (attempt === FOLLOW_ATTEMPTS) {
        throw new Error(
          `The page of the Sveltos extension listed the Clusters between the write and the update ${FOLLOW_ATTEMPTS} times, so its watch was never seen alone: ${lists.map((list) => list.url).join(", ")}`,
        );
      }
      console.log(
        `the page of the Sveltos extension listed the Clusters between the write and the update, attempt ${attempt} of ${FOLLOW_ATTEMPTS}: the step makes its write again`,
      );
      setLabel(value === null ? LABEL.value : null);
      await expect.poll(sveltosRows, followTimeout).toEqual(before);
    }
  }

  beforeAll(async () => {
    const sveltos = await real.sveltos();

    // The package, as checked against its pin, with the `.sha256` that the host checks it against, in the format of
    // `sha256sum`.
    folder = mkdtempSync(path.join(tmpdir(), "freelens-capi-sveltos-"));
    writeFileSync(path.join(folder, sveltos.extension.file), sveltos.extension.content);
    writeFileSync(
      path.join(folder, `${sveltos.extension.file}.sha256`),
      `${sveltos.extension.sha256}  ${sveltos.extension.file}\n`,
    );

    session = await connectApp();
    watches = recordWatchFailures(session.window, "cluster.x-k8s.io");
    requests = recordRequests(session.window);
    await installExtension(session);
    await installExtensionFile(session, path.join(folder, sveltos.extension.file), SVELTOS);

    // The names first, so that the end deletes the definitions also when the apply failed half way.
    definitions = sveltos.definitions.map(definitionName);
    applied = real.apply(sveltos.definitions.join("---\n"));
    real.kubectl(
      [
        "wait",
        ...definitions.map((name) => `${DEFINITIONS}/${name}`),
        "--for",
        "condition=Established",
        "--timeout",
        "180s",
      ],
      { timeout: 4 * 60 * 1000 },
    );

    frame = await openKindCluster(session);
    await selectNamespaces(frame, [NAMESPACE]);
  }, 300 * 1000);

  afterAll(async () => {
    const failures: unknown[] = [];
    const attempt = async <T>(step: () => T | Promise<T>, otherwise: T): Promise<T> => {
      try {
        return await step();
      } catch (error) {
        failures.push(error);
        return otherwise;
      }
    };
    // The errors stop being collected before the cleanup: what the app logs while an extension goes away and the
    // cluster is disconnected says nothing about this one.
    const errors = await attempt(async () => (await session?.stopCollecting()) ?? [], [] as string[]);

    watches?.stop();
    requests?.stop();
    if (labelled) await attempt(() => setLabel(null), undefined);
    if (session) {
      const app = session;

      await attempt(() => uninstallExtensionNamed(app, SVELTOS), undefined);
    }
    if (definitions.length > 0) {
      await attempt(
        () =>
          real.kubectl(["delete", DEFINITIONS, ...definitions, "--ignore-not-found", "--wait", "--timeout", "180s"], {
            timeout: 4 * 60 * 1000,
          }),
        "",
      );
    }
    if (session) {
      const app = session;

      await attempt(() => disconnectKindCluster(app), undefined);
      await attempt(() => app.close(), undefined);
    }
    if (folder) {
      const made = folder;

      await attempt(() => rmSync(made, { recursive: true, force: true }), undefined);
    }
    await attempt(() => real.close(), undefined);

    const failed = [
      ...(errors.length === 0 ? [] : [`The app logged errors:\n${errors.join("\n")}`]),
      ...failures.map(
        (failure) => `The end of the session failed: ${failure instanceof Error ? failure.message : String(failure)}`,
      ),
    ];

    if (failed.length > 0) {
      throw new Error(`${failed.length} checks at the end of the session failed:\n\n${failed.join("\n\n")}`);
    }
  }, 300 * 1000);

  it("installs the Sveltos extension next to this one, and applies the definitions of Sveltos, with no error (1)", async () => {
    const { session } = opened();

    expect(await extensionEnabled(session, extensionName)).toBe(true);
    expect(await extensionEnabled(session, SVELTOS)).toBe(true);
    // kubectl applied the definitions of the names that the session took from their manifests, and no other.
    expect([...applied].sort()).toEqual(
      definitions.map((name) => `customresourcedefinition.apiextensions.k8s.io/${name}`).sort(),
    );
    expect(definitions).toContain("sveltosclusters.lib.projectsveltos.io");

    for (const name of definitions) {
      expect(
        real.kubectl([
          "get",
          `${DEFINITIONS}/${name}`,
          "--output",
          'jsonpath={.status.conditions[?(@.type=="Established")].status}',
        ]),
        name,
      ).toBe("True");
    }
    // The extensions page left, back to the cluster, whose frame the host keeps.
    frame = await openKindCluster(session);
    expect(await session.errors()).toEqual([]);
  });

  it("lists freelens-capi-md and freelens-capi-mp in default, and nothing else, in both pages (2)", async () => {
    const expected = [`${NAMESPACE}/${MD}`, `${NAMESPACE}/${MP}`];

    await openSveltosPage();
    await expect.poll(sveltosRows, viewTimeout).toEqual(expected);
    await openOwnPage();
    await expect.poll(ownRows, viewTimeout).toEqual(expected);
    expect(watches?.failures()).toEqual([]);
    expect(await opened().session.errors()).toEqual([]);
  });

  it("finds the label tier=dev that kubectl sets on freelens-capi-md in the search of both pages, when each opens (3)", async () => {
    setLabel(LABEL.value);

    const sveltosSearch = await openSveltosPage();

    await sveltosSearch.fill(SVELTOS_SEARCH);
    await expect.poll(sveltosRows, viewTimeout).toEqual([`${NAMESPACE}/${MD}`]);

    const ownSearch = await openOwnPage();

    await ownSearch.fill(OWN_SEARCH);
    await expect.poll(ownRows, viewTimeout).toEqual([`${NAMESPACE}/${MD}`]);
    expect(watches?.failures()).toEqual([]);
    expect(await opened().session.errors()).toEqual([]);
  });

  it(
    "follows the label in the page that is open, through its watch, and shows it in the other when it opens, both ways round (4)",
    async () => {
      const md = [`${NAMESPACE}/${MD}`];

      // This page open on the label of 3: its removal reaches the page at once. The list layout of the host reads again
      // only when the filter changes or the page opens, so the update came through the watch.
      const ownSearch = await openOwnPage();

      await ownSearch.fill(OWN_SEARCH);
      await expect.poll(ownRows, viewTimeout).toEqual(md);
      setLabel(null);
      await expect.poll(ownRows, followTimeout).toEqual([]);

      // The page of the Sveltos extension shows the removal when it opens, although it closed with the label set, and
      // the label set again with that page open reaches it through its watch.
      const sveltosSearch = await openSveltosPage();

      await sveltosSearch.fill(SVELTOS_SEARCH);
      await expect.poll(sveltosRows, viewTimeout).toEqual([]);
      await sveltosFollows(LABEL.value, md, []);

      // This page shows the label when it opens, although it closed with the label removed, and closes with it set.
      const searchAgain = await openOwnPage();

      await searchAgain.fill(OWN_SEARCH);
      await expect.poll(ownRows, viewTimeout).toEqual(md);

      // The label removed with the page of the Sveltos extension open reaches it through its watch, and this page, which
      // closed with the label set, shows the removal when it opens.
      const sveltosAgain = await openSveltosPage();

      await sveltosAgain.fill(SVELTOS_SEARCH);
      await expect.poll(sveltosRows, viewTimeout).toEqual(md);
      await sveltosFollows(null, [], md);

      const lastSearch = await openOwnPage();

      await lastSearch.fill(OWN_SEARCH);
      await expect.poll(ownRows, viewTimeout).toEqual([]);
      await lastSearch.fill("");
      await expect.poll(ownRows, viewTimeout).toEqual([`${NAMESPACE}/${MD}`, `${NAMESPACE}/${MP}`]);

      // Neither watch disturbed the other: no watch of the group of Cluster API failed, and no process logged an error.
      expect(watches?.failures()).toEqual([]);
      expect(await opened().session.errors()).toEqual([]);
    },
    // Eleven waits of a minute at most, for a page that opens or its rows, and those of the pages that follow a write,
    // twenty seconds each: one here, and three for each write that the page of the Sveltos extension follows, the
    // write and the two that it may make again, with their undoing.
    15 * 60 * 1000,
  );
});
