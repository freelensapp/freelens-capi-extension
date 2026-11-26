// The check of "Safety" of SPEC-0004 ("Tests", "Unit", `read-only.test.ts`): the modules of the view, in
// src/renderer/ and src/common/views/, the test files left out, call no method that writes, of a store, of an API or of
// the client of the host, send no request other than a GET, and read none of the fields of R3.36, matched from
// `spec`, which hold a join token, a password, the content of a file or the credentials of a discovery (SPEC-0001, A3),
// as SPEC-0003 checks its own two folders. Each pattern is tried on a line written for it, so that a pattern that
// matches nothing cannot pass for a clean tree. The test reads the files with the modules of Node, which tests may
// import (AGENTS.md, "Biome").

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCES = join(process.cwd(), "src");
const FOLDERS = [join(SOURCES, "renderer"), join(SOURCES, "common", "views")];

interface Module {
  readonly name: string;
  readonly source: string;
}

function modulesOf(folder: string): Module[] {
  return readdirSync(folder).flatMap((file) => {
    const path = join(folder, file);

    if (statSync(path).isDirectory()) return modulesOf(path);
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || /\.d\.s?css\.ts$/.test(file)) return [];
    return [{ name: relative(SOURCES, path), source: readFileSync(path, "utf8") }];
  });
}

// A call of a method that writes: of a store of the host (`create`, `update`, `patch`, `remove`, `removeWithOptions`,
// `removeItems`, `removeSelectedItems`), of a `KubeApi` (`create`, `update`, `patch`, `delete`) or of its JSON client
// (`post`, `put`, `patch`, `del`); a request with a method other than GET; and a request of the view's own.
const WRITES: readonly (readonly [string, RegExp])[] = [
  [
    "a call of a method that writes",
    /\.\s*(?:create|update|patch|delete|del|post|put|remove|removeWithOptions|removeItems|removeSelectedItems)\s*\(/,
  ],
  ["a request other than a GET", /\bmethod\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i],
  ["a request of its own", /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
];

function writesIn(source: string): string[] {
  return WRITES.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

// The fields of R3.36 lie under these names in the spec of a KubeadmConfig, of a KubeadmControlPlane and of their
// templates, matched wherever they are read or declared, as SPEC-0003 matches them.
const SECRET_NAMES = "files|users|initConfiguration|joinConfiguration|kubeadmConfigSpec";
const SECRET_FIELD = new RegExp(
  [
    `(?:\\?\\.|\\.)\\s*(?:${SECRET_NAMES})\\b`,
    `\\[\\s*["'\`](?:${SECRET_NAMES})["'\`]\\s*\\]`,
    `\\b(?:${SECRET_NAMES})\\s*\\??\\s*:`,
    `[{,]\\s*(?:${SECRET_NAMES})\\s*[,}=]`,
  ].join("|"),
);

describe("the view only reads (SPEC-0004, Safety)", () => {
  const modules = FOLDERS.flatMap(modulesOf);

  it("reads the modules of the view, and no test file", () => {
    const names = modules.map((module) => module.name);

    expect(names).toEqual(
      expect.arrayContaining([
        join("renderer", "index.tsx"),
        join("renderer", "pages", "clusters-page-v1beta2.tsx"),
        join("renderer", "reads", "store-adapter.ts"),
        join("common", "views", "context.ts"),
      ]),
    );
    expect(names.some((name) => /\.test\./.test(name))).toBe(false);
  });

  it("finds no write and no request other than a GET", () => {
    expect(modules.flatMap((module) => writesIn(module.source).map((write) => `${module.name}: ${write}`))).toEqual([]);
  });

  it("finds no field of R3.36", () => {
    expect(modules.filter((module) => SECRET_FIELD.test(module.source)).map((module) => module.name)).toEqual([]);
  });
});

describe("the patterns of the check, each on a line written for it", () => {
  it.each([
    ["store.remove(cluster);"],
    ["void store.removeItems(selected);"],
    ["await api.delete({ name, namespace });"],
    ["await store.patch(cluster, { metadata: { labels } }, 'merge');"],
    ["await Renderer.K8sApi.crdApi.update({ name }, data);"],
    ["await client.post(url, { data });"],
    ["await request(url, { method: 'PATCH' });"],
    ['const answer = await fetch("/apis");'],
  ])("finds a write or a request in %s", (line) => {
    expect(writesIn(line)).not.toEqual([]);
  });

  it.each([
    ["const read = Renderer.K8sApi.crdApi.get({ name });"],
    ["const store = apiManager.getStore(api);"],
    ["void store.loadAll({ namespaces });"],
  ])("finds no write in the read %s", (line) => {
    expect(writesIn(line)).toEqual([]);
  });

  it.each([
    ["const config = cluster.spec.kubeadmConfigSpec;"],
    ["const files = object.spec?.files;"],
    ['const users = spec["users"];'],
    ["interface Spec { joinConfiguration?: unknown }"],
    ["const { initConfiguration } = spec;"],
  ])("finds a field of R3.36 in %s", (line) => {
    expect(SECRET_FIELD.test(line)).toBe(true);
  });
});
