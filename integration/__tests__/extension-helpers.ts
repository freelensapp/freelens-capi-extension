/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The code the integration test sessions share. The sessions attach to
// Freelens started with `pnpm dev` from a freelensapp/freelens checkout, over
// the Chrome DevTools Protocol port that script opens, and drive its renderer
// with Playwright. Its name does not match `*.tests.ts`, so Vitest does not
// collect it as a test file.

import { execFile, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { API_KUBE_PREFIX, isExpectedRefusal, isExpectedThrottling } from "./expected-refusals";

import type { Browser, ConsoleMessage, Frame, Locator, Page, Request } from "playwright";

import type { ExpectedRefusal, ExpectedThrottling, FailedResponse } from "./expected-refusals";

export const extensionName = "@freelensapp/capi-extension";

// The root of this checkout, installed in place and read for the manifests.
const extensionDir = path.resolve(import.meta.dirname, "..", "..");

// The CDP endpoint of Freelens dev: `pnpm dev` of Freelens starts Electron
// with `--remoteDebuggingPort 9223`.
const cdpUrl = process.env.FREELENS_CDP_URL || "http://127.0.0.1:9223";

// The log of the main process, which CDP does not carry: the output of
// `pnpm dev` of Freelens, or its `lens.log`. Without it only the renderer's
// errors are checked.
const mainLogFile = process.env.FREELENS_MAIN_LOG;

// The kind cluster the sessions run against.
export const kindClusterName = process.env.TEST_KIND_CLUSTER_NAME || "kind";

const viewTimeout = { timeout: 60 * 1000 };

// Connecting a cluster starts its proxy and loads its frame.
const clusterTimeout = { timeout: 120 * 1000 };

const ansiEscapePattern = /\u001b\[[0-9;]*m/g;

// The Kubernetes proxy of Freelens logs a request that the renderer aborts as
// an error. Freelens dev renders in React.StrictMode, which mounts every view
// twice and aborts the requests of the first mount, so the line comes and goes
// with the timing of a run. It names no request, and says nothing about the
// extension.
const abortedProxyRequestPattern = /proxy_server\.go:\d+\] Error while proxying request: context canceled$/;

// Freelens dev serves the renderer's modules from the Vite dev server through
// a route of its main process, which logs a request that fails as a warning:
// its keep-alive agent at times reuses a socket that the dev server is closing,
// and the request fails with ECONNRESET. The route answers it with a 502, which
// Chromium logs as "Failed to load resource"; such an error is left out when
// the main log has the failed request for its URL. When the module belongs to
// Monaco's editor worker, which a YAML view starts, the worker does not load,
// and Monaco rethrows its `error` event, an `Event` without a stack. Such a
// page error is left out when the main log has a failed request. When the
// module belongs to the cluster frame, the frame does not render, and
// `openKindCluster` loads it again. None of it says anything about the
// extension.
const devFileRouteFailurePattern = /\[DEV-FILE-ROUTE\]: request for (\S+) failed: /;

const badGatewayPattern = /^Failed to load resource: the server responded with a status of 502\b/;

// The list of the host for a custom resource keys its columns by the names of
// the printer columns of the CRD, and a CRD may give two columns one name: at
// v1beta2, MachineDeployment and KubeadmControlPlane of Cluster API name both
// their condition `Available` and their count of available replicas
// `Available`. React logs the repeated key as an error in Freelens dev, at
// every render of the list. Each such error is decided as it arrives, in the
// handler of the message, on the address of the frame that logged it as
// Playwright last saw it, which follows the navigations of the frame in order
// with its messages: it is left out only when that frame shows the list of the
// host for a custom resource, `/crd/<group>/<plural>`, with no details panel
// open, and its key is one that the list gives two columns, as the host makes
// its columns from the CRD. The keys of a list are read before the session
// opens it; for a list that the session finds open, such as one that Freelens
// restores, they are read when its first message arrives, and that decision
// waits for them. Any other repeated key counts, those of the extension's own
// views included, and so does one that a details panel or another page logs,
// or one whose list could not be read.
const repeatedKeyPattern = /^Encountered two children with the same key, `%s`\. .*:\$(\S+)$/;

// The address of the list of the host for a custom resource.
const hostListPattern = /^\/crd\/([^/]+)\/([^/]+)$/;

/** The path of a URL, without its query, as the dev file route logs it. */
const urlPath = (url: string) => (URL.canParse(url) ? new URL(url).pathname : url.replace(/[?#].*$/, ""));

// Chromium logs every response that is not a success as "Failed to load resource", with its status and with the
// address of the request as the location of the message.
const failedResourcePattern = /^Failed to load resource: the server responded with a status of (\d{3})\b/;

/** An address in one form, so that the location of a message and the address of its request compare. */
const sameAddress = (url: string) => (URL.canParse(url) ? new URL(url).href : url);

/**
 * A connection to Freelens dev, with the errors that either process logs.
 */
export interface AppSession {
  browser: Browser;
  /** The root frame's page, where the catalog, the extensions and the preferences render. */
  window: Page;
  /** The errors logged so far, once the messages that arrived are described and decided. */
  errors(): Promise<string[]>;
  /** The paths of the requests that the dev file route failed so far, in order, one entry per failure. */
  devFileRouteFailures(): string[];
  /**
   * Leaves out of the errors the refusals that a step of a session expects, from now until the returned function is
   * called (`expected-refusals.ts`); each refusal left out is kept, which `refusalsLeftOut` gives.
   */
  expectRefusals(refusals: readonly ExpectedRefusal[]): () => void;
  /**
   * Leaves out of the errors the throttling of the requests of another extension that a session expects, from now
   * until the returned function is called (`expected-refusals.ts`).
   */
  expectThrottling(throttling: readonly ExpectedThrottling[]): () => void;
  /** The refusals and the throttling left out so far, each as its status and its address. */
  refusalsLeftOut(): string[];
  /** Stops collecting errors; returns every error logged until then. */
  stopCollecting(): Promise<string[]>;
  /** Stops collecting errors, unless stopped already, and closes the connection; returns every error collected. */
  close(): Promise<string[]>;
}

/**
 * Whether Freelens dev answers on its CDP endpoint, the kind cluster is
 * reachable, and, for a session that opens the fixtures of a state, their
 * namespace is there. Outside CI a session skips with a warning otherwise; in
 * CI the run fails, so that a mistake in the workflow does not turn into a
 * silent skip.
 */
export async function appReady({ cluster, namespace }: { cluster: boolean; namespace?: string }): Promise<boolean> {
  let reason: string | undefined;

  try {
    const response = await fetch(new URL("/json/version", cdpUrl), { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      reason = `${cdpUrl} answered ${response.status}`;
    }
  } catch (error) {
    reason = `Freelens dev does not answer on ${cdpUrl}: ${error instanceof Error ? error.message : error}`;
  }

  if (!reason && cluster) {
    if (spawnSync("kubectl", ["--context", `kind-${kindClusterName}`, "get", "--raw", "/readyz"]).status !== 0) {
      reason = `the kind cluster ${kindClusterName} is not reachable`;
    } else if (
      namespace &&
      spawnSync("kubectl", ["--context", `kind-${kindClusterName}`, "get", "namespace", namespace]).status !== 0
    ) {
      reason = `the kind cluster ${kindClusterName} has no namespace ${namespace}: apply its fixtures first`;
    }
  }

  if (!reason) {
    return true;
  }

  if (process.env.CI) {
    throw new Error(`Cannot run the integration tests: ${reason}`);
  }

  console.warn(`Skipping the integration tests: ${reason}`);

  return false;
}

/**
 * Describes the arguments of a console message, read in the page: an `Error`
 * by its stack, an `ErrorEvent` by its message, location and error, another
 * `Event` by its type and target, anything else as JSON.
 */
async function describeConsoleArgs(msg: ConsoleMessage): Promise<string> {
  const descriptions = await Promise.all(
    msg.args().map((arg) =>
      arg
        .evaluate((value) => {
          if (value instanceof Error) {
            return value.stack ?? `${value.name}: ${value.message}`;
          }

          if (value instanceof ErrorEvent) {
            const stack = value.error instanceof Error ? ` ${value.error.stack}` : "";

            return `${value.type} event: ${value.message} (${value.filename}:${value.lineno}:${value.colno})${stack}`;
          }

          if (value instanceof Event) {
            return `${value.type} event of ${value.target?.constructor.name ?? "no target"}`;
          }

          try {
            return JSON.stringify(value) ?? String(value);
          } catch {
            return String(value);
          }
        })
        .catch((error) => `<argument not readable: ${error instanceof Error ? error.message : error}>`),
    ),
  );

  // A message of the browser itself, such as a resource or a worker that
  // failed to load, has no arguments; its time ties it to the main log.
  return descriptions.length
    ? descriptions.join(" ")
    : `<empty message without arguments, at ${new Date(msg.timestamp()).toISOString()}>`;
}

/**
 * Collects the errors of the renderer's console, of every frame, and the
 * lines of the main log written after the session started.
 */
function collectErrors(window: Page) {
  // An entry is undefined once a repeated key is found to be the host's.
  const errorLogs: (string | undefined)[] = [];
  // The descriptions of messages and the decisions on repeated keys that are
  // not done yet; none of them rejects.
  const pending: Promise<void>[] = [];
  // The thrown `Event`s, kept apart until the main log tells whether the dev
  // file route failed a request.
  const workerLoadErrors: string[] = [];
  // The 502s, kept apart until the main log tells whether the dev file route
  // failed the request for their URL.
  const badGatewayErrors: { path: string; text: string }[] = [];
  // The paths of the requests that the dev file route failed.
  const devFileRouteFailures: string[] = [];
  // The refusals and the throttling that a step of the session expects, while it runs, and those left out.
  const expectedRefusals = new Set<readonly ExpectedRefusal[]>();
  const expectedThrottling = new Set<readonly ExpectedThrottling[]>();
  const refusalsLeftOut: string[] = [];
  // The methods of the requests that the renderer sent to each address of the API of a cluster: Playwright reports a
  // request before the answer to it, and so before the message of a refusal.
  const methodsByAddress = new Map<string, string[]>();
  let mainLogOffset = mainLogFile && fs.existsSync(mainLogFile) ? fs.statSync(mainLogFile).size : 0;

  const onRequest = (request: Request) => {
    const address = sameAddress(request.url());

    if (URL.canParse(address) && new URL(address).pathname.startsWith(`${API_KUBE_PREFIX}/`)) {
      methodsByAddress.set(address, [...(methodsByAddress.get(address) ?? []), request.method()]);
    }
  };

  // Whether a request that the server refused or throttled is one that a step expects (`isExpectedRefusal`,
  // `isExpectedThrottling`): by its status and its address, by the methods of the requests sent there, GETs alone, and
  // by the frame that sent it, found by the host of the address, with the page that this frame shows, as Playwright
  // last saw its address.
  const isExpected = (status: string, url: string) => {
    const address = sameAddress(url);
    const host = URL.canParse(address) ? new URL(address).host : undefined;
    const frame = window.frames().find((item) => URL.canParse(item.url()) && new URL(item.url()).host === host);
    const response: FailedResponse = {
      status,
      url: address,
      methods: methodsByAddress.get(address) ?? [],
      page: frame === undefined ? undefined : new URL(frame.url()).pathname,
    };

    return (
      isExpectedRefusal([...expectedRefusals].flat(), response) ||
      isExpectedThrottling([...expectedThrottling].flat(), response)
    );
  };

  // Chromium logs every response that is not a success as "Failed to load
  // resource", whose text has no URL, so the location of the message is added.
  // The text of a message is the preview of its arguments: the class name of
  // an object, such as `ErrorEvent`, or nothing at all. Such a message is
  // described from its arguments, read from the page after the event, and
  // `settle()` waits for that. A message of a worker names the worker.
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const { url, lineNumber, columnNumber } = msg.location();
      const worker = msg.worker();
      const location = `${url ? ` (${url}:${lineNumber}:${columnNumber})` : ""}${worker ? ` (worker ${worker.url()})` : ""}`;
      const text = msg.text().replaceAll(ansiEscapePattern, "");

      if (url && badGatewayPattern.test(text)) {
        badGatewayErrors.push({ path: urlPath(url), text: `[renderer] ${text}${location}` });

        return;
      }

      const failedResource = failedResourcePattern.exec(text);

      if (url && failedResource && isExpected(failedResource[1], url)) {
        refusalsLeftOut.push(`${failedResource[1]} ${url}`);

        return;
      }

      const entry = `[renderer] ${text}${location}`;
      const repeatedKey = repeatedKeyPattern.exec(text)?.[1];

      if (repeatedKey) {
        decideRepeatedKey(entry, repeatedKey, hostListShown(window, url));

        return;
      }

      const index = errorLogs.push(entry) - 1;

      if (!text.trim() || /^[A-Z]\w*$/.test(text)) {
        pending.push(
          describeConsoleArgs(msg).then((description) => {
            errorLogs[index] = `[renderer] ${description}${location}`;
          }),
        );
      }
    }
  };

  // A repeated key, on the list that its frame showed when it arrived: left
  // out when that list gives the key two columns, at once when the keys of the
  // list are known, after they are read otherwise.
  const decideRepeatedKey = (entry: string, key: string, list: HostList | undefined) => {
    const keys = list && knownRepeatedKeys.get(definitionOf(list));

    if (!list || keys) {
      if (!keys?.includes(key)) {
        errorLogs.push(entry);
      }

      return;
    }

    const index = errorLogs.push(entry) - 1;

    pending.push(
      repeatedKeysOfList(list).then(
        (read) => {
          if (read.includes(key)) {
            errorLogs[index] = undefined;
          }
        },
        (error) => {
          errorLogs[index] =
            `${entry} (not decided: the keys of its list could not be read: ${error instanceof Error ? error.message : error})`;
        },
      ),
    );
  };

  // Playwright gives an uncaught value that is not an `Error`, such as an
  // `Event`, an empty stack and its description as the message, so such an
  // error is described by its name and message, and its time ties it to the
  // main log.
  const onPageError = (error: Error) => {
    if (error.stack) {
      errorLogs.push(`[renderer] ${error.stack}`);

      return;
    }

    const description = [error.name, error.message].filter(Boolean).join(": ") || "<empty>";
    const text = `[renderer] uncaught ${description} without a stack, at ${new Date().toISOString()}`;

    if (error.message === "Event" && !error.name) {
      workerLoadErrors.push(text);
    } else {
      errorLogs.push(text);
    }
  };

  // A line of the main log starts with its level, in the file and on the
  // console alike, after the task prefix that turbo adds to the output of
  // `pnpm dev` when it streams it (`freelens:dev: `). Electron's IPC send
  // errors (`Error sending from <name>:`) have no level and count too ("Rules
  // That Fail Silently" in AGENTS.md).
  const readMainLog = () => {
    if (!mainLogFile || !fs.existsSync(mainLogFile)) {
      return;
    }

    const size = fs.statSync(mainLogFile).size;

    // A rotated log starts again from the beginning.
    if (size < mainLogOffset) {
      mainLogOffset = 0;
    }

    if (size === mainLogOffset) {
      return;
    }

    const fd = fs.openSync(mainLogFile, "r");

    try {
      const buffer = Buffer.alloc(size - mainLogOffset);

      fs.readSync(fd, buffer, 0, buffer.length, mainLogOffset);
      mainLogOffset = size;

      for (const line of buffer.toString("utf8").split("\n")) {
        const text = line.replaceAll(ansiEscapePattern, "");

        const devFileRouteFailure = devFileRouteFailurePattern.exec(text);

        if (devFileRouteFailure?.[1]) {
          devFileRouteFailures.push(urlPath(devFileRouteFailure[1]));
        }

        if (
          /^(?:[\w@/.-]+:[\w:-]+: )?\s*(?:error:|Error sending from \w+:)/.test(text) &&
          !abortedProxyRequestPattern.test(text.trim())
        ) {
          errorLogs.push(`[main] ${text.trim()}`);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  };

  window.on("request", onRequest);
  window.on("console", onConsole);
  window.on("pageerror", onPageError);

  return {
    errors: () => {
      readMainLog();

      const failedPaths = new Set(devFileRouteFailures);
      const unexplainedBadGateways = badGatewayErrors
        .filter(({ path }) => !failedPaths.has(path))
        .map(({ text }) => text);
      return [
        ...errorLogs.filter((text) => text !== undefined),
        ...unexplainedBadGateways,
        ...(failedPaths.size ? [] : workerLoadErrors),
      ];
    },
    devFileRouteFailures: () => {
      readMainLog();

      return [...devFileRouteFailures];
    },
    expectRefusals: (refusals: readonly ExpectedRefusal[]) => {
      const entry = [...refusals];

      expectedRefusals.add(entry);

      return () => {
        expectedRefusals.delete(entry);
      };
    },
    expectThrottling: (throttling: readonly ExpectedThrottling[]) => {
      const entry = [...throttling];

      expectedThrottling.add(entry);

      return () => {
        expectedThrottling.delete(entry);
      };
    },
    refusalsLeftOut: () => [...refusalsLeftOut],
    // Waits until no description and no decision is pending, those that start
    // while it waits included.
    settle: async () => {
      while (pending.length) {
        await Promise.all(pending.splice(0));
      }
    },
    stop: () => {
      window.off("request", onRequest);
      window.off("console", onConsole);
      window.off("pageerror", onPageError);
    },
  };
}

/**
 * Connects to Freelens dev and collects the errors either process logs until
 * the session stops collecting or is closed. Closing a browser connected over
 * CDP closes only the connection; the app keeps running.
 */
export async function connectApp(): Promise<AppSession> {
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const window = await rootPage(browser);
    const collector = collectErrors(window);
    let collected: Promise<string[]> | undefined;

    const stopCollecting = () => {
      collected ??= (async () => {
        try {
          await collector.settle();

          return collector.errors();
        } finally {
          collector.stop();
        }
      })();

      return collected;
    };

    return {
      browser,
      window,
      errors: async () => {
        await collector.settle();

        return collector.errors();
      },
      devFileRouteFailures: collector.devFileRouteFailures,
      expectRefusals: collector.expectRefusals,
      expectThrottling: collector.expectThrottling,
      refusalsLeftOut: collector.refusalsLeftOut,
      stopCollecting,
      close: async () => {
        try {
          return await stopCollecting();
        } finally {
          await browser.close();
        }
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * The page of the root frame: `https://renderer.freelens.app`, on the port of
 * the app's proxy. A cluster renders in an iframe of it, on
 * `<clusterId>.renderer.freelens.app`.
 */
async function rootPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + viewTimeout.timeout;

  while (Date.now() < deadline) {
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => URL.canParse(page.url()) && new URL(page.url()).hostname === "renderer.freelens.app");

    if (page) {
      await page.waitForFunction(() => globalThis.FreelensExtensionApi?.Renderer !== undefined, null, viewTimeout);

      return page;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No Freelens window on ${cdpUrl}`);
}

/**
 * Navigates the root frame with `Renderer.Navigation.navigate` of the
 * extension API: the application menu, which the packaged-app tests click,
 * belongs to the main process, which CDP does not reach.
 */
async function navigate(window: Page, url: string) {
  console.log(`navigate to ${url}`);
  await window.evaluate((url) => {
    const renderer = globalThis.FreelensExtensionApi.Renderer;

    if (!renderer) {
      throw new Error("The page has no Renderer API");
    }

    renderer.Navigation.navigate(url);
  }, url);
}

/**
 * Dismisses the notifications, so that one still in its enter animation does
 * not intercept pointer events on the elements behind it.
 *
 * The selector matches only the close buttons inside the notifications area,
 * and any notification id: one created with an id of its own does not start
 * with `notification_`. The `CloseButton` component of Freelens is not one of
 * them; it closes the Extensions and Preferences pages (`SettingLayout`), and
 * clicking it there would leave the page.
 */
async function dismissNotifications(window: Page) {
  const notificationCloseSelector = '.Notifications [data-testid^="close-notification-for-"]';

  for (let attempt = 0; attempt < 10; attempt++) {
    const closeButtons = await window.$$(notificationCloseSelector);

    if (closeButtons.length === 0) break;

    for (const closeButton of closeButtons) {
      await closeButton.click({ force: true }).catch(() => {});
    }

    await window.waitForTimeout(200);
  }
}

/**
 * Uninstalls an extension, this one unless another is named, from the
 * Extensions page, from wherever it was installed. An extension installed in
 * place is forgotten, its directory stays.
 */
async function uninstallExtension(window: Page, row: Locator, name = extensionName) {
  console.log(`uninstall ${name}`);
  await row.locator('[id^="menu-actions-for-installed-extensions-for-"]').click();
  await window.locator(".MenuActions .MenuItem").getByText("Uninstall", { exact: true }).click();
  await window.getByTestId("confirmation-dialog").getByTestId("confirm").click();
  await row.waitFor({ state: "detached", ...viewTimeout });
}

/**
 * Installs this checkout in place from the Extensions page and waits until it
 * is enabled. An installation of the checkout that is already enabled is
 * kept, unless `reinstall` is set; any other installation of the extension is
 * uninstalled first.
 */
export async function installExtension({ window }: AppSession, { reinstall = false } = {}) {
  await navigate(window, "/extensions");

  const table = window.getByTestId("extensions-table");
  const row = table.locator("tbody tr", { hasText: extensionName });
  const enabled = row.locator("td").nth(2).getByText("Enabled", { exact: true });

  // Once the extensions are discovered, the page shows the table, or a notice
  // in its place when no extension is installed, as in a fresh profile.
  await table.or(window.getByText("There are no extensions installed.", { exact: true })).waitFor(viewTimeout);

  if (await row.count()) {
    // An extension loaded in place reads "development" in the version column,
    // with the directory in its title.
    const inPlace = await row.locator(`[title="Loaded from ${extensionDir}"]`).count();

    if (!reinstall && inPlace && (await enabled.count())) {
      console.log(`${extensionName} is installed from ${extensionDir}`);

      return;
    }

    await uninstallExtension(window, row);
  }

  // A notification left by the uninstall or by a rebuild can cover the
  // Install button.
  await dismissNotifications(window);

  console.log(`install ${extensionDir}`);
  await window.getByPlaceholder("Name, URL, or path to a package or directory").fill(extensionDir);
  await window.getByRole("button", { name: "Install", exact: true }).click();

  // A directory is loaded in place only after a confirmation.
  await window.getByTestId("confirmation-dialog").getByTestId("confirm").click(viewTimeout);

  // The status column reads "Incompatible" if the host refuses
  // `engines.freelens`.
  await enabled.waitFor(viewTimeout);
  await dismissNotifications(window);
}

/**
 * The row of an extension in the table of the Extensions page, by its name,
 * once the page shows the table, or the notice of no extension in its place.
 */
async function extensionRow(window: Page, name: string): Promise<Locator> {
  await navigate(window, "/extensions");

  const table = window.getByTestId("extensions-table");

  await table.or(window.getByText("There are no extensions installed.", { exact: true })).waitFor(viewTimeout);

  return table.locator("tbody tr", { hasText: name });
}

/**
 * Installs an extension from a tarball on the disk, as the Extensions page
 * installs a release tarball, and waits until it is enabled: the host checks
 * the tarball against the `.sha256` beside it and enables a build that it
 * verified (freelens:packages/core/src/renderer/components/extensions/attempt-install/install-from-file.injectable.tsx).
 * Any installation of that extension is uninstalled first.
 */
export async function installExtensionFile({ window }: AppSession, file: string, name: string) {
  const row = await extensionRow(window, name);

  if (await row.count()) {
    await uninstallExtension(window, row, name);
  }

  await dismissNotifications(window);

  console.log(`install ${file}`);
  await window.getByPlaceholder("Name, URL, or path to a package or directory").fill(file);
  await window.getByRole("button", { name: "Install", exact: true }).click();
  await row.locator("td").nth(2).getByText("Enabled", { exact: true }).waitFor(viewTimeout);
  await dismissNotifications(window);
}

/**
 * Whether the Extensions page lists an extension as enabled.
 */
export async function extensionEnabled({ window }: AppSession, name: string): Promise<boolean> {
  const row = await extensionRow(window, name);

  return (await row.locator("td").nth(2).getByText("Enabled", { exact: true }).count()) > 0;
}

/**
 * Uninstalls an extension by its name from the Extensions page, when the page
 * lists it.
 */
export async function uninstallExtensionNamed({ window }: AppSession, name: string) {
  const row = await extensionRow(window, name);

  if (await row.count()) {
    await uninstallExtension(window, row, name);
  }
}

/**
 * Records the watches of a group of the API that the renderer says have
 * failed: the client of the host logs a watch that the server answered with
 * an error, or whose stream broke, as a warning, and one that threw as an
 * error, each with the path of the watch in the API of the cluster
 * (freelens:packages/utility-features/kube-api/src/kube-api.ts:854, 981, 990).
 */
export function recordWatchFailures(window: Page, group: string): { failures(): string[]; stop(): void } {
  const failures: string[] = [];
  const pattern = /\bwatch \(\S+\) (?:error response|stream error|threw) (\/\S+)/;
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "warning" && msg.type() !== "error") {
      return;
    }

    const watch = pattern.exec(msg.text().replaceAll(ansiEscapePattern, ""));

    if (watch?.[1].startsWith(`/apis/${group}/`)) {
      failures.push(watch[0]);
    }
  };

  window.on("console", onConsole);

  return {
    failures: () => [...failures],
    stop: () => window.off("console", onConsole),
  };
}

/**
 * Opens the kind cluster of the sessions, by its name in the catalog,
 * `kind-<name>` (see `openCluster`).
 */
export async function openKindCluster(session: AppSession): Promise<Frame> {
  return openCluster(session, `kind-${kindClusterName}`);
}

/**
 * Opens a cluster of the catalog: finds its entity in the catalog of the root
 * frame by its name, the name of its context, navigates to it, and waits until
 * its frame shows its sidebar. The catalog lists the cluster once the
 * kubeconfig sync of the profile has read the file that holds it. A frame that
 * did not render, after the dev file route of Freelens dev failed a request,
 * is loaded again once.
 */
export async function openCluster(session: AppSession, name: string): Promise<Frame> {
  const { window } = session;
  const failuresBefore = session.devFileRouteFailures().length;
  const found = await window.waitForFunction(
    (name) =>
      globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities
        .getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster")
        .find((entity) => entity.getName() === name)
        ?.getId(),
    name,
    clusterTimeout,
  );
  const id = await found.jsonValue();

  await navigate(window, `/cluster/${id}`);

  const element = await window.waitForSelector(`#cluster-frame-${id}`, clusterTimeout);
  const frame = await element.contentFrame();

  if (!frame) {
    throw new Error(`The cluster ${name} has no frame`);
  }

  try {
    await frame.waitForSelector("[data-testid=cluster-sidebar]", clusterTimeout);
  } catch (error) {
    if (session.devFileRouteFailures().length === failuresBefore) {
      throw error;
    }

    console.log(`the frame of ${name} did not render after a failed request of the dev file route: loading it again`);
    await frame.evaluate(() => globalThis.location.reload());
    await frame.waitForSelector("[data-testid=cluster-sidebar]", clusterTimeout);
  }

  return frame;
}

/**
 * Disconnects the kind cluster of the sessions with the `disconnect()` of
 * its entity in the catalog.
 */
export async function disconnectKindCluster(session: AppSession) {
  await disconnectCluster(session, `kind-${kindClusterName}`);
}

/**
 * Disconnects a cluster of the catalog, by its name, with the `disconnect()`
 * of its entity.
 */
export async function disconnectCluster({ window }: AppSession, name: string) {
  await window.evaluate(async (name) => {
    const entity = globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities
      .getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster")
      .find((item) => item.getName() === name) as { disconnect?: () => Promise<void> } | undefined;

    await entity?.disconnect?.();
  }, name);
}

/**
 * Whether the catalog of the root frame lists a cluster of that name: the
 * kubeconfig sync of the profile lists the clusters of a file that it reads,
 * and drops them when the file goes.
 */
export async function catalogLists({ window }: AppSession, name: string): Promise<boolean> {
  return window.evaluate(
    (name) =>
      globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities
        .getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster")
        .some((entity) => entity.getName() === name) ?? false,
    name,
  );
}

/**
 * Loads the frame of a cluster again, as a reload of its page does, and waits
 * until the new document shows the sidebar: the frame starts again, its stores
 * and the APIs of the host with them, while the cluster stays connected. The
 * old document is marked, so that the sidebar it still shows is not taken for
 * the new one. A frame that did not render, after the dev file route of
 * Freelens dev failed a request, is loaded again once, as `openCluster` does.
 * The frame shows what the host makes of its address as it starts, which may be
 * its start page: a session opens the page that it reads itself.
 */
export async function reloadClusterFrame(session: AppSession, frame: Frame) {
  const failuresBefore = session.devFileRouteFailures().length;
  const reload = async () => {
    await frame.evaluate(() => {
      document.documentElement.dataset.capiReloading = "";
      setTimeout(() => globalThis.location.reload(), 0);
    });
    await frame.waitForSelector("html:not([data-capi-reloading]) [data-testid=cluster-sidebar]", clusterTimeout);
  };

  console.log("load the frame of the cluster again");
  try {
    await reload();
  } catch (error) {
    if (session.devFileRouteFailures().length === failuresBefore) {
      throw error;
    }

    console.log("the frame did not render after a failed request of the dev file route: loading it again");
    await reload();
  }
}

/**
 * Goes to an address of the cluster frame, as a link of the host would: the
 * frame follows its history only on a `popstate` event.
 */
export async function navigateCluster(frame: Frame, address: string) {
  console.log(`navigate the cluster frame to ${address}`);
  await frame.evaluate((target) => {
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, address);
}

/**
 * Points the namespace filter of the host at one namespace, unless it shows
 * it already. The lists of the host show the namespaces of its filter, and a
 * new cluster shows only `default`.
 */
async function selectHostNamespace(frame: Frame, namespace: string) {
  const filtered = frame.locator(`[data-testid="namespace-select-filter"] >> text="Namespace: ${namespace}"`);
  const select = await frame.waitForSelector(".NamespaceSelect", viewTimeout);

  if (await filtered.count()) {
    return;
  }

  await select.click();
  await select.type(namespace);

  const option = frame.locator(".Select__option").filter({ has: frame.locator(`span:text-is("${namespace}")`) });

  if (await option.count()) {
    await option.first().click();
  } else {
    await select.press("Enter");
  }

  // The menu does not close on select, and would cover the table underneath.
  if (await frame.locator(".Select__menu").count()) {
    await select.click();
  }

  await filtered.waitFor(viewTimeout);
}

/**
 * The order of two versions of a CRD by the priority that Kubernetes gives
 * them, highest first: a version named as `v1`, `v1beta2` or `v1alpha3` before
 * any other, GA before beta before alpha, then the higher major and minor
 * version; any other name after them, by its code units.
 */
function byVersionPriority(left: string, right: string): number {
  const rank = (name: string) => {
    const match = /^v(\d+)(?:(alpha|beta)(\d+))?$/.exec(name);

    return match && [{ alpha: 0, beta: 1 }[match[2] ?? ""] ?? 2, Number(match[1]), Number(match[3] ?? 0)];
  };
  const [a, b] = [rank(left), rank(right)];

  if (a && b) {
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  }

  if (a || b) {
    return a ? -1 : 1;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

/** A list of the host for a custom resource, by the group and the plural of its address. */
interface HostList {
  group: string;
  plural: string;
}

const definitionOf = (list: HostList) => `${list.plural}.${list.group}`;

const execFileAsync = promisify(execFile);

// The keys that the list of the host for each custom resource gives two
// columns, by its definition: the reads that have started, so that a list is
// read once, and those that are done, which the handler of a message reads
// without waiting.
const repeatedKeysOfLists = new Map<string, Promise<string[]>>();
const knownRepeatedKeys = new Map<string, string[]>();

interface PrinterVersion {
  name: string;
  served: boolean;
  storage: boolean;
  additionalPrinterColumns?: { name: string; priority?: number }[];
}

/**
 * The keys that the list of the host for a custom resource gives two columns
 * or more, as the host makes its columns from the CRD: the name, the namespace
 * of a namespaced resource, the printer columns of the version that it reads,
 * the stored one when it is served, else the served one of the highest
 * priority, without those of a priority above 0, which it shows in the
 * details, and without an age, and the age.
 */
function keysRepeatedBy(spec: { scope: string; versions: PrinterVersion[] }): string[] {
  const stored = spec.versions.find((version) => version.storage);
  const [served] = spec.versions
    .filter((version) => version.served)
    .sort((left, right) => byVersionPriority(left.name, right.name));
  const version = stored?.served ? stored : (served ?? stored);
  const keys = [
    "name",
    ...(spec.scope === "Namespaced" ? ["namespace"] : []),
    ...(version?.additionalPrinterColumns ?? [])
      .filter((column) => column.name.toLowerCase() !== "age" && !column.priority)
      .map((column) => column.name),
    "age",
  ];

  return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
}

/**
 * The keys that a list of the host repeats, read from its CRD on the kind
 * cluster once, without blocking the session. A read that fails rejects, and
 * the next one tries again.
 */
function repeatedKeysOfList(list: HostList): Promise<string[]> {
  const definition = definitionOf(list);
  const started = repeatedKeysOfLists.get(definition);

  if (started) {
    return started;
  }

  const read = execFileAsync(
    "kubectl",
    ["--context", `kind-${kindClusterName}`, "get", "customresourcedefinition", definition, "--output", "json"],
    { encoding: "utf8", timeout: viewTimeout.timeout },
  ).then(({ stdout }) => {
    const keys = keysRepeatedBy((JSON.parse(stdout) as { spec: { scope: string; versions: PrinterVersion[] } }).spec);

    knownRepeatedKeys.set(definition, keys);

    return keys;
  });

  read.catch(() => repeatedKeysOfLists.delete(definition));
  repeatedKeysOfLists.set(definition, read);

  return read;
}

/**
 * The list of the host that the frame of a script shows, from the address of
 * the frame as Playwright last saw it, which follows the navigations of the
 * frame in order with its console messages: the list for a custom resource,
 * `/crd/<group>/<plural>`, with no details panel open (no `kube-details` in
 * the address). The frame is found by the host of the script, each frame of
 * the app having a host of its own; nothing when none is found.
 */
function hostListShown(window: Page, scriptUrl: string): HostList | undefined {
  const host = URL.canParse(scriptUrl) ? new URL(scriptUrl).host : undefined;
  const frame = window.frames().find((item) => URL.canParse(item.url()) && new URL(item.url()).host === host);

  if (!frame) {
    return undefined;
  }

  const address = new URL(frame.url());
  const list = hostListPattern.exec(address.pathname);

  return list && !address.searchParams.has("kube-details") ? { group: list[1], plural: list[2] } : undefined;
}

/**
 * Waits until the host has imported the renderer of the extension in a frame:
 * once it has, it links there the stylesheet of the extension,
 * `dist/renderer.css`, and then it activates the extension. So this proves the
 * import; an error that the activation logs later fails the session when its
 * teardown checks the errors again. It needs the extension to ship that
 * stylesheet, and fails at once, saying so, when the build has none.
 */
export async function extensionLoadedIn(frame: Frame) {
  const stylesheet = path.join(extensionDir, "dist", "renderer.css");

  if (!fs.existsSync(stylesheet)) {
    throw new Error(
      `${stylesheet} is missing, and the host links the stylesheet of the extension in a frame only when the extension ships one: build the extension, or check its loading another way if it has no CSS`,
    );
  }

  await frame
    .locator(`link[data-freelens-extension="${extensionName}"]`)
    .waitFor({ state: "attached", ...viewTimeout });
}

/**
 * Opens the list that the host has of a custom resource, by its address,
 * with its namespace filter on `namespace`, and waits for a row whose name is
 * each name, in the cell of the name. The keys that the list repeats are read
 * before it opens, so that its messages are decided as they arrive.
 */
export async function hostLists(frame: Frame, resource: HostList, namespace: string, names: readonly string[]) {
  await repeatedKeysOfList(resource);
  await navigateCluster(frame, `/crd/${resource.group}/${resource.plural}`);
  await selectHostNamespace(frame, namespace);

  for (const name of names) {
    await frame
      .locator(".TableRow .TableCell.name")
      .getByText(name, { exact: true })
      .first()
      .waitFor({ state: "visible", ...viewTimeout });
  }
}

/**
 * Runs kubectl on the kind cluster of the sessions, by its context, and gives
 * its output. A run never acts on the current context.
 */
export async function kubectl(args: readonly string[]): Promise<string> {
  // The objects of every state of the fixtures are more than the default buffer of a child process, 1 MiB, holds.
  const { stdout } = await execFileAsync("kubectl", ["--context", `kind-${kindClusterName}`, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: viewTimeout.timeout,
  });

  return stdout;
}

/**
 * The address of a page of an extension in the cluster frame,
 * `/extension/<name>/<pageId>`, with the `@` of the name of the extension
 * dropped and its `/` turned into `--`, as the host makes it
 * (freelens:packages/core/src/renderer/routes/for-extension.ts:11-15;
 * freelens:packages/core/src/extensions/lens-extension.ts:125-127).
 */
export function extensionPageAddress(pageId: string, extension = extensionName): string {
  return `/extension/${extension.replace("@", "").replace("/", "--")}/${pageId}`;
}

/**
 * Opens a page of an extension in the cluster frame by its address: a page of
 * this extension, unless another is named.
 */
export async function openExtensionPage(frame: Frame, pageId: string, extension = extensionName) {
  await navigateCluster(frame, extensionPageAddress(pageId, extension));
}

/**
 * Selects namespaces in the filter of the host, through the store of
 * namespaces that the extension API gives the frame: every namespace of the
 * cluster with none given, which the host then reads over the whole cluster.
 */
export async function selectNamespaces(frame: Frame, namespaces: readonly string[]) {
  console.log(`select the namespaces ${namespaces.length ? namespaces.join(", ") : "of the whole cluster"}`);
  await frame.evaluate(
    (names: string[]) => {
      const store = globalThis.FreelensExtensionApi.Renderer?.K8sApi.namespaceStore;

      if (!store) {
        throw new Error("The frame has no store of namespaces");
      }

      if (names.length) {
        store.selectNamespaces(names);
      } else {
        store.selectAll();
      }
    },
    [...namespaces],
  );
}

/** A request that the renderer sent, by its method and its address, and when the session saw it go. */
export interface SentRequest {
  method: string;
  url: string;
  /** The time at which Playwright reported it, in milliseconds since the epoch. */
  at: number;
}

/**
 * Records the requests that the renderer sends, those of the frame of a cluster
 * included, which Playwright reports on the page of the root frame.
 */
export function recordRequests(window: Page): { requests(): SentRequest[]; stop(): void } {
  const sent: SentRequest[] = [];
  const onRequest = (request: { method(): string; url(): string }) => {
    sent.push({ method: request.method(), url: request.url(), at: Date.now() });
  };

  window.on("request", onRequest);

  return {
    requests: () => [...sent],
    stop: () => window.off("request", onRequest),
  };
}
