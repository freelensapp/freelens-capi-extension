/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the scripts of the test environment need of the system they run on, and what they give the commands
// they run there.

import { ensure } from "./checks.mts";

import type { ClusterApiAsset } from "./pins.mts";

// The limits of inotify that the nodes of the workload clusters need on Linux, the values that the
// troubleshooting page of the book of Cluster API gives for its Docker provider: with fewer instances, their
// containers exit with code 255 as they start, and the health check of the ClusterClass replaces them again
// and again.
export const INOTIFY_LIMITS = { "fs.inotify.max_user_instances": 8192, "fs.inotify.max_user_watches": 1048576 };

// The settings that raise each limit lower than the one the workload clusters need, as `sysctl -w` takes
// them; none when every limit is high enough. A limit that cannot be read counts as lower.
export function inotifySettings(current: Record<string, number>): string[] {
  return Object.entries(INOTIFY_LIMITS)
    .filter(([key, wanted]) => !(current[key] >= wanted))
    .map(([key, wanted]) => `${key}=${wanted}`);
}

// The system and the processor of the cluster of the captures of SPEC-0028, where the scripts can set the kernel of the
// host as P3 asks and the pinned helm runs: Linux on amd64 alone, any other refused by its name (P2).
export function assertCapturesHost(platform: string, arch: string): void {
  ensure(
    platform === "linux" && arch === "x64",
    `The cluster of the captures runs on Linux on amd64 alone, where the scripts set the kernel of the host and the pinned helm runs, not on ${platform} ${arch}`,
  );
}

// The setting of the kernel of the host that the worker of a tenant of Kamaji needs (SPEC-0028, P3; L4): the value of
// `net.netfilter.nf_conntrack_max` that kube-proxy computes, 32768 for each processor and 131072 at least. kube-proxy
// writes it whenever it differs, which the container of a worker may not do, and then restarts again and again.
export const CONNTRACK_MAX = "net.netfilter.nf_conntrack_max";

export function conntrackMax(processors: number): number {
  return Math.max(32_768 * processors, 131_072);
}

// The setting that gives the host that value, as `sysctl -w` takes it, or none when it has it already. A value that
// cannot be read counts as another one.
export function conntrackSetting(current: number | undefined, processors: number): string | undefined {
  const wanted = conntrackMax(processors);

  return current === wanted ? undefined : `${CONNTRACK_MAX}=${wanted}`;
}

// What the scripts do to `net.netfilter.nf_conntrack_max` of the host, apart from what they decide, so that their
// decisions can be tested: its value, `sudo -n sysctl -w`, and the record of the value that the host had before the
// scripts changed it, in the folder of the cluster of the captures (SPEC-0028, P2, P3).
export interface ConntrackHost {
  // The value of the host, or undefined when it cannot be read.
  read(): number | undefined;
  // `sudo -n sysctl -w` of a setting, as it takes it; whether it set it.
  write(setting: string): boolean;
  // The text of the record, or undefined when there is none.
  recorded(): string | undefined;
  record(value: number): void;
  forget(): void;
  // The record, as a message names it.
  recordFile: string;
  log(line: string): void;
}

// Gives the host the value of `nf_conntrack_max` that kube-proxy computes, when it has another one, and then records
// the value that it had, the first time alone, so that `down` gives back the value from before the first change. A
// value that the scripts cannot set stops the command with the command that sets it, and leaves no record: `down` has
// nothing to give back then. A value that cannot be read is set all the same, with no record.
export function raiseConntrackMax(host: ConntrackHost, processors: number): void {
  const current = host.read();
  const setting = conntrackSetting(current, processors);

  if (!setting) return;
  ensure(
    host.write(setting),
    `Could not set ${setting} (sudo -n sysctl failed), which the workers of the tenants need: set it with sudo sysctl -w ${setting}, then run this command again${current === undefined ? "" : `. The host has ${current} now, which pnpm e2e:cluster:down does not give back then`}`,
  );
  if (current !== undefined && host.recorded() === undefined) host.record(current);
  host.log(
    `Set ${setting}, from ${current === undefined ? "a value that could not be read, which pnpm e2e:cluster:down cannot give back" : current}`,
  );
}

// Gives the host back the value of `nf_conntrack_max` that the record holds, and forgets the record: with no sudo when
// the host holds that value already, as after a reboot or once it was given back by hand, and otherwise with
// `sudo -n sysctl -w`. When that fails, the record stays, and the error names the command that gives the value back by
// hand, after which `down` forgets it.
export function restoreConntrackMax(host: ConntrackHost): void {
  const recorded = host.recorded();

  if (recorded === undefined) return;
  ensure(
    /^\d+$/.test(recorded.trim()),
    `${host.recordFile} does not hold a value of ${CONNTRACK_MAX}: remove it once the host has the value that you want`,
  );

  const value = Number(recorded.trim());
  const setting = `${CONNTRACK_MAX}=${value}`;

  if (host.read() === value) {
    host.log(`${CONNTRACK_MAX} has its value ${value} again`);
  } else {
    ensure(
      host.write(setting),
      `Could not give ${CONNTRACK_MAX} back its value ${value} (sudo -n sysctl failed): give it back with sudo sysctl -w ${setting}, then run pnpm e2e:cluster:down again`,
    );
    host.log(`Gave ${CONNTRACK_MAX} back its value ${value}`);
  }
  host.forget();
}

// The clusterctl of the release for the system and the processor that Node reports.
export function clusterctlAsset(platform: string, arch: string): ClusterApiAsset {
  ensure(
    (platform === "darwin" || platform === "linux") && (arch === "x64" || arch === "arm64"),
    `The scripts run on Linux and macOS, on amd64 and arm64, not on ${platform} ${arch}`,
  );
  return `clusterctl-${platform}-${arch === "x64" ? "amd64" : "arm64"}`;
}

// What a command run by the scripts inherits of their environment: what finds the tools and the local
// Docker. Nothing that would point a tool at another cluster, such as KUBECONFIG, or change what clusterctl
// installs, such as the variables that it substitutes in the components.
const INHERITED = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "DOCKER_HOST", "DOCKER_CONTEXT"];

// The environment of a command: the inherited variables, a kubeconfig of the scripts, or one that does not
// exist, never the one of the user, the cache of kubectl in the private state, and no kuberc, whose defaults
// could change what kubectl does; then `extra`.
export function childEnvironment(
  base: Record<string, string | undefined>,
  kubeconfig: string,
  kubectlCache: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const name of INHERITED) {
    const value = base[name];

    if (value !== undefined) variables[name] = value;
  }
  return { ...variables, KUBECONFIG: kubeconfig, KUBECACHEDIR: kubectlCache, KUBERC: "off", ...extra };
}
