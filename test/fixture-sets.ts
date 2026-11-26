// The fixtures of SPEC-0002 as the unit tests of the views read them (SPEC-0004, "Tests", "Unit"): the objects of
// each state, from the YAML files of `integration/fixtures/<state>/`, read with the module of the scripts of the
// test environment that writes them. Every time of a fixture is its offset from the moment of the capture,
// 2026-01-01T00:00:00Z, which is `CAPTURE`, the `now` of a test that reads them.

import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFixtureSet } from "../e2e/scripts/fixtures.mts";

import type { KubeObject } from "../e2e/scripts/fixtures.mts";

export const CAPTURE = Date.UTC(2026, 0, 1);

// The folder of the fixtures, next to this file. In the environment of jsdom the address of a module is not a file
// one, and the folder is found from the root of the repository, where Vitest runs.
const HERE = import.meta.url.startsWith("file:")
  ? dirname(fileURLToPath(import.meta.url))
  : join(process.cwd(), "test");
const FOLDER = join(HERE, "..", "integration", "fixtures");

// The states of the fixtures, in the order of their folders.
export const STATES: readonly string[] = readdirSync(FOLDER)
  .filter((name) => !name.startsWith(".") && statSync(join(FOLDER, name)).isDirectory())
  .sort();

export function fixtureSet(state: string): KubeObject[] {
  return readFixtureSet(join(FOLDER, state));
}

// The objects of a kind of a set.
export function ofKind<T = KubeObject>(objects: readonly KubeObject[], kind: string): T[] {
  return objects.filter((object) => object.kind === kind) as unknown as T[];
}
