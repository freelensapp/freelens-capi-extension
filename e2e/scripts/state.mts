/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The private state of the scripts of the test environment: its folder, the lock that lets one run at a time
// use it, and the fingerprints of the kubeconfig files of the user, which no run may change.

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ensure, sha256 } from "./checks.mts";

// Whether `path` is `folder` or inside it.
export function isInside(folder: string, path: string): boolean {
  const rest = relative(folder, path);

  return rest === "" || (!isAbsolute(rest) && rest !== ".." && !rest.startsWith(`..${sep}`));
}

// The state folder: `freelens-capi-extension` in $XDG_STATE_HOME when it is an absolute path, as the XDG
// specification asks, or in ~/.local/state.
export function stateFolder(env: Record<string, string | undefined>, home: string): string {
  const base =
    env.XDG_STATE_HOME && isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : join(home, ".local", "state");

  return join(base, "freelens-capi-extension");
}

// Creates the state folder for the user alone, and refuses it when it is a symbolic link or inside the
// repository, where a file of it could end up in a commit.
export function preparePrivateFolder(folder: string, repository: string): void {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  ensure(!lstatSync(folder).isSymbolicLink(), `${folder} is a symbolic link`);
  ensure(!isInside(realpathSync(repository), realpathSync(folder)), `${folder} is inside the repository`);
  chmodSync(folder, 0o700);
}

// The process that a lock file names, when it names one.
function holderOf(file: string): number | undefined {
  try {
    const pid = Number(readFileSync(file, "utf8").trim());

    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

// Creates a lock file that names this process, only when the file does not exist.
function create(file: string, pid: number): boolean {
  try {
    writeFileSync(file, String(pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

// One run at a time. The lock is `run.lock`, created only when it does not exist, with the process that
// holds it. A lock whose process is gone, left by a run that was killed, is taken over under a second lock,
// `run.lock.takeover`, also created only when it does not exist: of two runs that find the same stale lock,
// one takes it over, and the other finds a lock held by a live process, or the takeover going on. The
// release removes the lock only while it names this process.
export function takeLock(folder: string, pid: number, alive: (pid: number) => boolean): () => void {
  const file = join(folder, "run.lock");

  if (!create(file, pid)) {
    const holder = holderOf(file);

    ensure(holder === undefined || !alive(holder), `Another run of the scripts, process ${holder}, is going on`);

    const takeover = join(folder, "run.lock.takeover");

    if (!create(takeover, pid)) {
      const taker = holderOf(takeover);

      ensure(
        taker !== undefined && !alive(taker),
        `Another run of the scripts is taking over the lock of process ${holder}`,
      );
      throw new Error(`${takeover} names process ${taker}, which is gone: remove it, once no run is going on`);
    }
    try {
      ensure(holderOf(file) === holder, "Another run of the scripts took the lock");
      if (existsSync(file)) {
        // The stale lock is replaced whole: no other run creates the lock while it exists, and none takes it
        // over while this one holds the takeover.
        writeFileSync(`${file}.${pid}`, String(pid), { mode: 0o600 });
        renameSync(`${file}.${pid}`, file);
      } else {
        // Released meanwhile: created as any free lock is.
        ensure(create(file, pid), "Another run of the scripts took the lock");
      }
    } finally {
      rmSync(takeover, { force: true });
    }
  }
  return () => {
    if (holderOf(file) === pid) rmSync(file, { force: true });
  };
}

// The kubeconfig files of the user, from KUBECONFIG or ~/.kube/config, leaving out those of the scripts,
// which a user may have listed there.
export function kubeconfigFiles(env: Record<string, string | undefined>, home: string, state: string): string[] {
  return (env.KUBECONFIG || join(home, ".kube", "config"))
    .split(delimiter)
    .filter(Boolean)
    .filter((file) => !isInside(state, resolve(file)));
}

// The content of each file, by its SHA-256, or `absent`.
export function fingerprints(files: string[]): Map<string, string> {
  return new Map(files.map((file) => [file, existsSync(file) ? sha256(readFileSync(file)) : "absent"]));
}

// The files whose fingerprint changed between two readings.
export function changedFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...before.keys()].filter((file) => before.get(file) !== after.get(file));
}
