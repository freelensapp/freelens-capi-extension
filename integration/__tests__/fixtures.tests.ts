/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Opens the cluster of the definitions of Cluster API with the fixtures of one
// state on it, `healthy` unless TEST_FIXTURE_STATE names another, and checks
// that the extension activates there with no error in either process and that
// the host lists every object of the fixtures. The cluster, its definitions
// and the fixtures are those of the scripts of the test environment
// (docs/development/TESTING.md): the integration workflow makes them before
// it starts Freelens dev, as `pnpm e2e:cluster:up:definitions` and
// `pnpm e2e:fixtures:up <state>` do. The session changes nothing on the
// cluster.

import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_RESOURCES, FIXTURES_FOLDER, groupOf, readFixtureSet } from "../../e2e/scripts/fixtures.mts";
import { statesOf } from "../../e2e/scripts/states.mts";
import {
  appReady,
  connectApp,
  disconnectKindCluster,
  extensionLoadedIn,
  hostLists,
  installExtension,
  openKindCluster,
} from "./extension-helpers";

import type { Frame } from "playwright";

import type { AppSession } from "./extension-helpers";

const [state] = statesOf([process.env.TEST_FIXTURE_STATE || "healthy"]);
const objects = readFixtureSet(path.resolve(import.meta.dirname, "..", "..", FIXTURES_FOLDER, state.name));

// The resource of a kind in the host, by the group of its version and its plural, which FIXTURE_RESOURCES
// names as kubectl does: `<plural>.<version>.<group>`.
function resourceOf(apiVersion: string, kind: string): { group: string; plural: string } {
  const group = groupOf(apiVersion);
  const singular = kind.toLowerCase();
  const resource = FIXTURE_RESOURCES.find((item) => {
    const [plural, , ...rest] = item.split(".");

    return rest.join(".") === group && (plural === `${singular}s` || plural === `${singular}es`);
  });

  if (!resource) {
    throw new Error(`${kind} of ${group} is not a kind of the fixtures`);
  }

  return { group, plural: resource.split(".")[0] };
}

// The names of the objects of each kind of the fixtures, by kind.
const kinds = [...new Set(objects.map((object) => `${object.apiVersion} ${object.kind}`))].sort().map((key) => {
  const [apiVersion, kind] = key.split(" ");

  return {
    kind,
    resource: resourceOf(apiVersion, kind),
    names: objects
      .filter((object) => object.apiVersion === apiVersion && object.kind === kind)
      .map((object) => object.metadata.name),
  };
});

describe.skipIf(!(await appReady({ cluster: true, namespace: state.namespace })))(
  `the fixtures of ${state.name}`,
  () => {
    let session: AppSession | undefined;
    let frame: Frame | undefined;

    beforeAll(async () => {
      session = await connectApp();
      await installExtension(session);
      frame = await openKindCluster(session);
    }, 240 * 1000);

    afterAll(async () => {
      // The errors stop being collected before the cluster is disconnected:
      // what the app logs while it disconnects says nothing about the
      // extension.
      const errors = (await session?.stopCollecting()) ?? [];

      if (session) {
        await disconnectKindCluster(session);
        await session.close();
      }

      expect(errors).toEqual([]);
    });

    it("activates the extension on the cluster with no error in either process", async () => {
      if (!session || !frame) {
        throw new Error("The cluster is not open");
      }

      await extensionLoadedIn(frame);
      expect(await session.errors()).toEqual([]);
    });

    it.each(kinds)("lists every $kind of the fixtures in the host", async ({ resource, names }) => {
      if (!session || !frame) {
        throw new Error("The cluster is not open");
      }

      await hostLists(frame, resource, state.namespace, names);
      expect(await session.errors()).toEqual([]);
    });
  },
);
