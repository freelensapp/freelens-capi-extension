// The check of the safety of the model (SPEC-0003, "Safety", and "Tests", "Unit"): the modules of
// src/common/status/ and src/common/parsers/, the test files left out, import nothing from outside the two folders,
// send no request, read no clock, set no timer, read no storage, and read none of the fields of R3.36, which hold a
// join token, a password, the content of a file or the credentials of a discovery (SPEC-0001, A3). The program of
// src/common/ already has neither the DOM nor Node; this check keeps out what that program still allows. The test
// reads the files with the modules of Node, which tests may import (AGENTS.md, "Biome"). Each pattern is tried on a
// line written for it, so that a pattern that matches nothing cannot pass for a clean tree.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const COMMON = resolve(import.meta.dirname, "..");
const FOLDERS = ["status", "parsers"].map((folder) => join(COMMON, folder));

interface Module {
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

function modules(): Module[] {
  return FOLDERS.flatMap((folder) =>
    readdirSync(folder)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => {
        const path = join(folder, file);

        return { name: relative(COMMON, path), path, source: readFileSync(path, "utf8") };
      }),
  );
}

// The modules that a source imports or exports from, statically, dynamically or with `require`.
const IMPORTS = [
  /\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
];

function importsOf(source: string): string[] {
  return IMPORTS.flatMap((pattern) => [...source.matchAll(pattern)].map((found) => found[1]));
}

// Whether a module that a file imports lies in one of the two folders: a relative path that resolves inside them.
function staysInside(file: string, specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;

  const target = resolve(file, "..", specifier);

  return FOLDERS.some((folder) => target.startsWith(folder + sep));
}

const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["fetch", /\bfetch\s*\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["setTimeout", /\bsetTimeout\b/],
  ["setInterval", /\bsetInterval\b/],
  ["Date.now", /\bDate\s*\.\s*now\b/],
  ["new Date()", /\bnew\s+Date\s*\(\s*\)/],
  ["localStorage", /\blocalStorage\b/],
  ["indexedDB", /\bindexedDB\b/],
];

function forbiddenIn(source: string): string[] {
  return FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

// The fields of R3.36 lie under these names in the spec of a KubeadmConfig, of a KubeadmControlPlane and of their
// templates. They are matched wherever they are read or declared, as a property by a dot, an optional chain or a key
// in brackets, as the key of an object or of a type, or as a name taken by destructuring: the paths matched from
// `spec`, `spec.files` included, are among them, and so is a read through a cast.
const SECRET_NAMES = "files|users|initConfiguration|joinConfiguration|kubeadmConfigSpec";
const SECRET_FIELD = new RegExp(
  [
    `(?:\\?\\.|\\.)\\s*(?:${SECRET_NAMES})\\b`,
    `\\[\\s*["'\`](?:${SECRET_NAMES})["'\`]\\s*\\]`,
    `\\b(?:${SECRET_NAMES})\\s*\\??\\s*:`,
    `[{,]\\s*(?:${SECRET_NAMES})\\s*[,}=]`,
  ].join("|"),
);

describe("the purity of the model", () => {
  const all = modules();

  it("reads the modules of both folders, and no test file", () => {
    const names = all.map((module) => module.name);

    expect(names).toEqual(expect.arrayContaining([join("status", "index.ts"), join("parsers", "time.ts")]));
    expect(names.some((name) => name.endsWith(".test.ts"))).toBe(false);
  });

  it("finds no import from outside the two folders", () => {
    const outside = all.flatMap((module) =>
      importsOf(module.source)
        .filter((specifier) => !staysInside(module.path, specifier))
        .map((specifier) => `${module.name}: ${specifier}`),
    );

    expect(outside).toEqual([]);
  });

  it("finds no request, clock, timer or storage", () => {
    expect(all.flatMap((module) => forbiddenIn(module.source).map((name) => `${module.name}: ${name}`))).toEqual([]);
  });

  it("finds no field of R3.36", () => {
    expect(all.filter((module) => SECRET_FIELD.test(module.source)).map((module) => module.name)).toEqual([]);
  });
});

describe("the patterns of the check, each on a line written for it", () => {
  it("finds an import from outside the folders, and none from inside them", () => {
    const file = join(FOLDERS[0], "example.ts");
    const source = [
      'import { readFileSync } from "node:fs";',
      'import type { Renderer } from "@freelensapp/extensions";',
      'export { thing } from "../../renderer/thing";',
      'const lazy = await import("../main/index");',
      'const old = require("electron");',
      'import "./side-effect-of-status";',
      'import { parseTime } from "../parsers/time";',
      'import type { Note } from "./health";',
    ].join("\n");

    expect(importsOf(source).filter((specifier) => !staysInside(file, specifier))).toEqual([
      "node:fs",
      "@freelensapp/extensions",
      "../../renderer/thing",
      "../main/index",
      "electron",
    ]);
  });

  it.each([
    ["fetch", 'const answer = await fetch("/apis");'],
    ["XMLHttpRequest", "const request = new XMLHttpRequest();"],
    ["WebSocket", 'const socket = new WebSocket("wss://example");'],
    ["setTimeout", "setTimeout(refresh, 1000);"],
    ["setInterval", "const timer = setInterval(refresh, 1000);"],
    ["Date.now", "const now = Date.now();"],
    ["new Date()", "const now = new Date();"],
    ["localStorage", 'localStorage.getItem("health");'],
    ["indexedDB", 'indexedDB.open("model");'],
  ])("finds %s", (name, line) => {
    expect(forbiddenIn(line)).toEqual([name]);
  });

  it("finds no clock in a date built from a time that the project wrote", () => {
    expect(forbiddenIn("const instant = new Date(text).getTime();")).toEqual([]);
  });

  it.each([
    "object.spec.files",
    "object.spec?.joinConfiguration",
    "spec.kubeadmConfigSpec.users",
    "spec . initConfiguration",
    'spec["users"]',
    "spec?.['files']",
    "(input.spec as Spec)?.joinConfiguration",
    "readonly kubeadmConfigSpec?: unknown;",
    "const { files } = spec;",
  ])("finds the field of R3.36 in %s", (line) => {
    expect(line).toMatch(SECRET_FIELD);
  });

  it("finds no field of R3.36 in the fields that the rules read, nor in words of the comments", () => {
    expect("spec.replicas spec.version spec.filesystem status.profiles // the users of a cluster").not.toMatch(
      SECRET_FIELD,
    );
  });
});
