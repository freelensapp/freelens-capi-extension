/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The session of the Clusters on the real project (SPEC-0004, "With the real project", `clusters-real.tests.ts`), a
// session of the real tier, which the job of the real project of test-environment.yaml runs in Freelens dev on each
// release of the integration tests, and nothing else runs (P33). It opens the cluster of the real project, through the
// copy of the kubeconfig of the scripts that the profile of Freelens dev syncs, and compares what the view says of its
// two workload clusters with what `clusterctl describe cluster`, the tool of the project, prints of them, run by the
// scripts with the pinned clusterctl and the kubeconfig of the scripts (kit, `docs/testing.md`, "Domain correctness"):
//
// 1. the details of `freelens-capi-md` and the row of its Cluster give the same status and reason of `Available`, and
//    the counters of the control plane and of the workers add up to the replicas and to the available, ready and up to
//    date Machines of the row (SPEC-0001, R4.22);
// 2. `freelens-capi-mp` reads Degraded, with `ControlPlaneMachinesReady` among its issues, while the row of its Cluster
//    gives its `Available` as `True` (SPEC-0001, H1);
// 3. the topology of both Clusters: the class `quick-start`, the version of the pins, and a MachineDeployment for one
//    and a MachinePool for the other.
//
// The objects of the real project change as its controllers write them, so each comparison reads both sides again
// until they agree, within its time. The session reads the cluster alone, and writes nothing to it. It reaches the
// cluster through the scripts of the test environment, which check the target before every request, and fails on any
// error that either process logs.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openRealProject } from "../../e2e/scripts/commands.mts";
import {
  appReady,
  connectApp,
  disconnectKindCluster,
  installExtension,
  navigateCluster,
  openExtensionPage,
  openKindCluster,
  selectNamespaces,
} from "./extension-helpers";
import { countersOf, describedCluster, summaryOf, summedCounters } from "./real-project-checks";

import type { Frame, Locator } from "playwright";

import type { RealProjectSession } from "../../e2e/scripts/commands.mts";
import type { AppSession } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };
// The time within which the view and the tool agree on objects that the controllers still write.
const settleTimeout = { timeout: 10 * 60 * 1000, interval: 5 * 1000 };

// The workload clusters of the real project, in the namespace where `pnpm e2e:cluster:up` makes them (TESTING.md, "The
// real project").
const NAMESPACE = "default";
const MD = "freelens-capi-md";
const MP = "freelens-capi-mp";

// The real project through the scripts; outside CI the session skips with a warning when it is not up, in CI it fails
// instead.
async function open(): Promise<RealProjectSession | undefined> {
  try {
    return await openRealProject();
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn(
      `Skipping the session of the real project: it cannot be reached through the scripts: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
}

const project = (await appReady({ cluster: false })) ? await open() : undefined;

describe.skipIf(project === undefined)("the Clusters of the real project, against clusterctl", () => {
  const real = project as RealProjectSession;
  let session: AppSession | undefined;
  let frame: Frame | undefined;

  function opened(): { session: AppSession; frame: Frame } {
    if (!session || !frame) {
      throw new Error("The cluster of the real project is not open");
    }
    return { session, frame };
  }

  // The details of the extension of a Cluster of the real project, by their address (P6).
  async function detailsOf(name: string): Promise<Locator> {
    const { frame } = opened();

    await openExtensionPage(frame, "clusters");
    await frame.getByTestId("capi-clusters-page").locator(".TableHead").waitFor(viewTimeout);
    await navigateCluster(frame, `?details=${encodeURIComponent(`${NAMESPACE}/${name}`)}`);

    const drawer = frame.getByTestId("capi-cluster-details");

    await drawer.getByTestId("capi-details-section-status").waitFor(viewTimeout);
    return drawer;
  }

  // The text of the counters of a section of the details, `control-plane` or `workers`.
  async function countersIn(drawer: Locator, section: string): Promise<Map<string, number | undefined>> {
    const counters = drawer.getByTestId(`capi-details-section-${section}`).getByTestId("capi-details-counters");

    return countersOf((await counters.count()) === 0 ? "" : ((await counters.first().textContent()) ?? ""));
  }

  // The value of a row of a section of the details, by its name, as the host lays a row of a drawer out.
  function valueOf(section: Locator, name: string): Promise<string | null> {
    return section.evaluate((element, wanted) => {
      const item = [...element.querySelectorAll(".DrawerItem")].find(
        (each) => each.querySelector(":scope > .name")?.textContent?.trim() === wanted,
      );

      return item?.querySelector(":scope > .value")?.textContent?.trim() ?? null;
    }, name);
  }

  beforeAll(async () => {
    session = await connectApp();
    await installExtension(session);
    frame = await openKindCluster(session);
    await selectNamespaces(frame, [NAMESPACE]);
  }, 240 * 1000);

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
    // The errors stop being collected before the cluster is disconnected: what the app logs while it disconnects says
    // nothing about the extension.
    const errors = await attempt(async () => (await session?.stopCollecting()) ?? [], [] as string[]);

    if (session) {
      const app = session;

      await attempt(() => disconnectKindCluster(app), undefined);
      await attempt(() => app.close(), undefined);
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
  }, 240 * 1000);

  it(
    "gives freelens-capi-md the status and the reason of Available that clusterctl describe cluster gives, and counters that add up to its row (1; R4.22)",
    async () => {
      const drawer = await detailsOf(MD);
      const summary = drawer.getByTestId("capi-details-summary");

      // The view and the tool, each read again until they agree: what differs, cell by cell, empty once they do.
      await expect
        .poll(async () => {
          const described = describedCluster(await real.describeCluster(MD), NAMESPACE, MD);
          const said = summaryOf((await summary.locator(".value > div").first().textContent()) ?? "");
          const counted = summedCounters(
            await countersIn(drawer, "control-plane"),
            await countersIn(drawer, "workers"),
          );

          if (described === undefined) return [`clusterctl describe cluster gives no row of ${MD} with every cell`];
          if (said === undefined) return ["The details give no summary of Available"];
          return Object.entries({
            status: [said.status, described.status],
            reason: [said.reason, described.reason],
            replicas: [counted.replicas, described.replicas],
            available: [counted.available, described.available],
            ready: [counted.ready, described.ready],
            "up to date": [counted.upToDate, described.upToDate],
          })
            .filter(([, [view, tool]]) => view !== tool || view === "")
            .map(
              ([cell, [view, tool]]) => `${cell}: the view gives ${view || "nothing"}, clusterctl ${tool || "nothing"}`,
            );
        }, settleTimeout)
        .toEqual([]);
      await opened().frame.page().keyboard.press("Escape");
      expect(await opened().session.errors()).toEqual([]);
    },
    12 * 60 * 1000,
  );

  it(
    "reads freelens-capi-mp Degraded, with ControlPlaneMachinesReady among its issues, while clusterctl describe cluster gives its Available True (2; H1)",
    async () => {
      // The tool first: the Cluster of the MachinePool reports Available True once its control plane is available,
      // while its Machines are not ready.
      await expect
        .poll(async () => describedCluster(await real.describeCluster(MP), NAMESPACE, MP)?.status, settleTimeout)
        .toBe("True");

      const drawer = await detailsOf(MP);

      await expect
        .poll(async () => (await drawer.getByTestId("capi-details-health").textContent())?.trim(), settleTimeout)
        .toBe("Degraded");
      await expect
        .poll(async () => (await drawer.getByTestId("capi-details-issue").allTextContents()).join("\n"), viewTimeout)
        .toMatch(/^ControlPlaneMachinesReady: /m);
      await opened().frame.page().keyboard.press("Escape");
      expect(await opened().session.errors()).toEqual([]);
    },
    12 * 60 * 1000,
  );

  it("shows the topology of both Clusters: the class quick-start, their version, a MachineDeployment and a MachinePool (3)", async () => {
    for (const [name, part] of [
      [MD, "MachineDeployment"],
      [MP, "MachinePool"],
    ] as const) {
      const drawer = await detailsOf(name);
      const topology = drawer.getByTestId("capi-details-section-topology");

      await topology.waitFor(viewTimeout);
      expect((await topology.getByTestId("capi-details-class").locator(".value").textContent())?.trim(), name).toBe(
        "quick-start",
      );
      expect(await valueOf(topology, "Version"), name).toBe(real.kubernetesVersion);

      const parts = await topology
        .getByTestId("capi-details-topology-part")
        .evaluateAll((items) => items.map((item) => item.querySelector(":scope > .name")?.textContent?.trim() ?? ""));

      expect(
        parts.map((each) => each.split(" ")[0]),
        name,
      ).toEqual([part]);
      await opened().frame.page().keyboard.press("Escape");
    }
    expect(await opened().session.errors()).toEqual([]);
  });
});
