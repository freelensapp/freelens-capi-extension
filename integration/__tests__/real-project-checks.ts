/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// What the session of the real project compares (SPEC-0004, "With the real project", `clusters-real.tests.ts`), as
// pure functions, which its unit test checks with no cluster: the row of a Cluster that `clusterctl describe cluster`
// prints, the counters that the details of the extension show, and the row that those counters give, summed as the
// project sums them (SPEC-0001, R4.21, R4.22). Its name does not match `*.tests.ts`, so Vitest does not collect it as a
// session.

// The cells of the row of a Cluster in the table of `clusterctl describe cluster`: REPLICAS, the current of the
// desired Machines, AVAILABLE, READY and UP TO DATE, and the STATUS and REASON of its `Available` (R4.21, R4.22).
export interface DescribedCluster {
  readonly replicas: string;
  readonly available: string;
  readonly ready: string;
  readonly upToDate: string;
  readonly status: string;
  readonly reason: string;
}

// The escape sequences of the colors of a terminal, which clusterctl writes only to one.
const COLORS = /\u001b\[[0-9;]*m/g;

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The row of a Cluster in what `clusterctl describe cluster` prints: the line whose name is `Cluster <namespace>/<name>`,
// then the version of its topology when it has one, then its cells, at least two spaces apart, the table having no
// border (R4.21, R4.24, R4.25); undefined when no line is the row of that Cluster, or when one of its cells is not
// written yet. clusterctl leaves a cell empty, with no mark in its place, when no part writes its counter (R4.22),
// and the status when it shows the conditions of the Cluster in rows of their own (R4.28), which the scripts do not
// ask for: the cells after an empty one then move to the left, and the cell of the status holds no longer True,
// False or Unknown.
export function describedCluster(output: string, namespace: string, name: string): DescribedCluster | undefined {
  const row = new RegExp(`^Cluster ${escaped(`${namespace}/${name}`)}(?:, \\S+)?(?= {2,})(.*)$`);

  for (const line of output.replaceAll(COLORS, "").split("\n")) {
    const found = row.exec(line.trim());

    if (found === null) continue;

    const [replicas, available, ready, upToDate, status, reason] = found[1].trim().split(/ {2,}/);

    return /^(True|False|Unknown)$/.test(status ?? "") && reason
      ? { replicas, available, ready, upToDate, status, reason }
      : undefined;
  }
  return undefined;
}

// The counters of the control plane or of the workers, as the details of the extension write them: each count with its
// label, such as `3 desired`, or `N/A up to date` for one not written, separated by commas.
export function countersOf(text: string): Map<string, number | undefined> {
  const counters = new Map<string, number | undefined>();

  for (const part of text.split(",")) {
    const counter = /^\s*(\d+|N\/A) (.+?)\s*$/.exec(part);

    if (counter) counters.set(counter[2], counter[1] === "N/A" ? undefined : Number(counter[1]));
  }
  return counters;
}

// The sum of a counter of the control plane and of the workers, as clusterctl sums it: a counter not written counts as
// zero, and the cell is empty when neither part writes it (R4.22).
function sum(controlPlane: Map<string, number | undefined>, workers: Map<string, number | undefined>, label: string) {
  const one = controlPlane.get(label);
  const other = workers.get(label);

  return one === undefined && other === undefined ? "" : String((one ?? 0) + (other ?? 0));
}

// The counters of the row of a Cluster that the counters of its control plane and of its workers give, as the
// project sums them: REPLICAS the current of the desired, and AVAILABLE, READY and UP TO DATE (R4.22).
export function summedCounters(
  controlPlane: Map<string, number | undefined>,
  workers: Map<string, number | undefined>,
): Pick<DescribedCluster, "replicas" | "available" | "ready" | "upToDate"> {
  const current = sum(controlPlane, workers, "current");
  const desired = sum(controlPlane, workers, "desired");

  return {
    replicas: current === "" && desired === "" ? "" : `${current || "0"}/${desired || "0"}`,
    available: sum(controlPlane, workers, "available"),
    ready: sum(controlPlane, workers, "ready"),
    upToDate: sum(controlPlane, workers, "up to date"),
  };
}

// The status and the reason of `Available`, from the line of the summary of the details: `Available: <status>, <reason>`.
export function summaryOf(text: string): { status: string; reason: string } | undefined {
  const summary = /^Available: (\S+), (\S+)/.exec(text.trim());

  return summary === null ? undefined : { status: summary[1], reason: summary[2] };
}
