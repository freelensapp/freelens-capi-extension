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
