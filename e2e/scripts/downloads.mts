/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The files that the scripts of the test environment download: each one from the official source of its
// project, kept in the cache of the private state, and checked against its pin before it is used.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertDigest, sha256 } from "./checks.mts";
import { CLUSTER_API_ASSETS, CLUSTER_API_SOURCES } from "./pins.mts";

import type { ClusterApiAsset, ClusterApiSource, Pins } from "./pins.mts";

// A pinned file: what the scripts call it, its URL, its copy in the cache, and its SHA-256.
export interface PinnedFile {
  name: string;
  url: string;
  file: string;
  digest: string;
  executable: boolean;
}

export function releaseAsset(pins: Pins, downloads: string, asset: ClusterApiAsset): PinnedFile {
  const { version } = pins.clusterApi;

  return {
    name: `${asset} of Cluster API ${version}`,
    url: `https://github.com/kubernetes-sigs/cluster-api/releases/download/${version}/${asset}`,
    file: join(downloads, "cluster-api", version, asset),
    digest: pins.clusterApi.assets[asset],
    executable: asset.startsWith("clusterctl-"),
  };
}

export function sourceFile(pins: Pins, downloads: string, path: ClusterApiSource): PinnedFile {
  const { commit } = pins.clusterApi;

  return {
    name: `${path} of Cluster API at ${commit.slice(0, 12)}`,
    url: `https://raw.githubusercontent.com/kubernetes-sigs/cluster-api/${commit}/${path}`,
    file: join(downloads, "cluster-api", commit, path),
    digest: pins.clusterApi.sources[path],
    executable: false,
  };
}

export function operatorComponents(pins: Pins, downloads: string): PinnedFile {
  const { version, assets } = pins.clusterApiOperator;

  return {
    name: `operator-components.yaml of the Cluster API Operator ${version}`,
    url: `https://github.com/kubernetes-sigs/cluster-api-operator/releases/download/${version}/operator-components.yaml`,
    file: join(downloads, "cluster-api-operator", version, "operator-components.yaml"),
    digest: assets["operator-components.yaml"],
    executable: false,
  };
}

export function certManagerComponents(pins: Pins, downloads: string): PinnedFile {
  const { version, assets } = pins.certManager;

  return {
    name: `cert-manager.yaml of cert-manager ${version}`,
    url: `https://github.com/cert-manager/cert-manager/releases/download/${version}/cert-manager.yaml`,
    file: join(downloads, "cert-manager", version, "cert-manager.yaml"),
    digest: assets["cert-manager.yaml"],
    executable: false,
  };
}

// The package of the Sveltos extension for Freelens, as the npm registry publishes it (SPEC-0004, P29).
export function sveltosExtensionPackage(pins: Pins, downloads: string): PinnedFile {
  const { version, sha256 } = pins.sveltos.extension;

  return {
    name: `the package of @freelensapp/sveltos-extension ${version}`,
    url: `https://registry.npmjs.org/@freelensapp/sveltos-extension/-/sveltos-extension-${version}.tgz`,
    file: join(downloads, "sveltos-extension", version, `sveltos-extension-${version}.tgz`),
    digest: sha256,
    executable: false,
  };
}

// The chart of Sveltos, as its release on GitHub publishes it, whose definitions the session of S6 applies
// (SPEC-0004, P29).
export function sveltosChart(pins: Pins, downloads: string): PinnedFile {
  const { version, sha256 } = pins.sveltos.chart;

  return {
    name: `the chart projectsveltos ${version}`,
    url: `https://github.com/projectsveltos/helm-charts/releases/download/projectsveltos-${version}/projectsveltos-${version}.tgz`,
    file: join(downloads, "projectsveltos", version, `projectsveltos-${version}.tgz`),
    digest: sha256,
    executable: false,
  };
}

// Every file that the pins name, once each.
export function everyPinnedFile(pins: Pins, downloads: string): PinnedFile[] {
  return [
    ...CLUSTER_API_ASSETS.map((asset) => releaseAsset(pins, downloads, asset)),
    ...CLUSTER_API_SOURCES.map((path) => sourceFile(pins, downloads, path)),
    operatorComponents(pins, downloads),
    certManagerComponents(pins, downloads),
    sveltosExtensionPackage(pins, downloads),
    sveltosChart(pins, downloads),
  ];
}

// What a download needs of `fetch`.
export type Fetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface PinnedContentOptions {
  fetch?: Fetch;
  // Downloads the file even when the cache has it with its digest: what the check of the pins does, to
  // compare the pins with what the projects publish.
  fresh?: boolean;
  log?: (line: string) => void;
  // Milliseconds between two attempts of a download that failed.
  retryDelay?: number;
}

// The content of a pinned file: from the cache when it is there with its digest, otherwise downloaded and
// checked before it is kept, in a file that replaces the one of the cache whole. A file of the cache whose
// digest is not the pinned one, changed or cut short, is removed. A download whose digest is not the pinned
// one is not kept. The content returned is the one that was checked.
export async function pinnedContent(pinned: PinnedFile, options: PinnedContentOptions = {}): Promise<Buffer> {
  const { fetch = globalThis.fetch, log = console.log, retryDelay = 5_000 } = options;

  if (existsSync(pinned.file)) {
    const cached = readFileSync(pinned.file);

    if (sha256(cached) !== pinned.digest) rmSync(pinned.file);
    else if (!options.fresh) return cached;
  }

  log(`Downloading ${pinned.name}`);

  let content: Buffer | undefined;

  for (let attempt = 1; !content; attempt++) {
    try {
      const response = await fetch(pinned.url, { signal: AbortSignal.timeout(10 * 60_000) });

      if (!response.ok) throw new Error(`${pinned.url} answered ${response.status}`);
      content = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Downloading ${pinned.name} failed: ${error instanceof Error ? error.message : error}`);
      }
      await delay(retryDelay);
    }
  }
  assertDigest(pinned.name, content, pinned.digest);
  mkdirSync(dirname(pinned.file), { recursive: true, mode: 0o700 });
  writeFileSync(`${pinned.file}.part`, content, { mode: pinned.executable ? 0o700 : 0o600 });
  renameSync(`${pinned.file}.part`, pinned.file);
  return content;
}
