// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { CAPTURE, fixtureSet, ofKind, STATES } from "../../../test/fixture-sets";
import { Common, host, Renderer } from "../../../test/freelens-extensions";
import { APIS, serve } from "../../../test/host-stores";
import { hostObjects, keyOf, objectsOfStates, RESOLVED, sourceOf } from "../../../test/view-sources";
import { parseConditionMessage } from "../../common/parsers/condition-message";
import { clusterPartsOf, indexContext, StatusMemo } from "../../common/views/context";
import { reduceReads } from "../../common/views/read-state";
import { publishPageSource } from "../reads/cluster-source";
import styles from "./cluster-details.module.scss";
import { ClusterPanel, ClusterView } from "./cluster-details-v1beta2";

import type { Renderer as Sdk } from "@freelensapp/extensions";

import type { KubeObject } from "../../../e2e/scripts/fixtures.mts";
import type { HostObject } from "../../../test/host-stores";
import type { SourceOptions } from "../../../test/view-sources";
import type { MessageLine } from "../../common/parsers/condition-message";
import type { ClusterObject } from "../../common/status/index";
import type { ReadEvent } from "../../common/views/read-state";
import type { Cluster } from "../api/cluster/cluster-v1beta2";
import type { ClusterSource } from "../reads/cluster-source";

// The cases of SPEC-0004, "Tests", "Unit", `cluster-details-v1beta2.test.tsx`: the details of each Cluster of the
// fixtures of SPEC-0002, section by section, the references between the objects of a Cluster (P18), the metadata of
// the host (P32), the states of the reads (P25), and the panel in the details of the host (P16, P31). A value that the
// fixtures do not hold, such as a failure field or a pending hook, is written into a copy of a fixture, at this layer
// only.

const EXTENSION = new Renderer.LensExtension({ name: "@freelensapp/capi-extension" }) as unknown as Sdk.LensExtension;

const SECTIONS = [
  "metadata",
  "status",
  "control-plane",
  "workers",
  "infrastructure",
  "topology",
  "network",
  "conditions",
] as const;

type Fields = Record<string, any>;

function viewOf(
  source: ClusterSource,
  cluster: HostObject,
  metadata = true,
  openCluster = vi.fn(),
  openTree = vi.fn(),
) {
  return render(
    <ClusterView
      source={source}
      namespace={cluster.getNs() ?? ""}
      name={cluster.getName()}
      host={{ extension: EXTENSION, openCluster, openTree }}
      metadata={metadata}
    />,
  );
}

function clusterOf(objects: readonly HostObject[]): HostObject {
  const cluster = objects.find((object) => object.kind === "Cluster");

  if (cluster === undefined) throw new Error("No Cluster in the objects");
  return cluster;
}

// The objects of a state, with its Cluster changed by a function of a copy of it, and more objects.
function variantOf(state: string, change: (cluster: Fields) => void, more: KubeObject[] = []): HostObject[] {
  const objects = fixtureSet(state).map((object) => {
    if (object.kind !== "Cluster") return object;

    const copy = structuredClone(object) as unknown as Fields;

    change(copy);
    return copy as unknown as KubeObject;
  });

  return hostObjects([...objects, ...more]);
}

function sections(): string[] {
  return SECTIONS.filter((name) => screen.queryByTestId(`capi-details-section-${name}`) !== null);
}

// A row of the details, by its name.
function item(name: string, root: ParentNode = document): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>("[data-drawer-item]")].find(
    (element) => element.querySelector("[data-drawer-item-name]")?.textContent === name,
  );

  if (found === undefined) throw new Error(`No row ${name}`);
  return found;
}

// The value of a row of the details, without its name.
function valueOf(element: HTMLElement): string {
  return element.textContent?.slice(element.querySelector("[data-drawer-item-name]")?.textContent?.length ?? 0) ?? "";
}

// The tooltip of a component of the host, which the stub renders hidden next to it.
function tooltipOf(element: Element): string | null | undefined {
  const next = element.nextElementSibling;

  return next instanceof HTMLElement && next.hidden ? next.textContent : undefined;
}

// A worker Machine that the Cluster of machine-without-node owns, made from the Machine of its stand-alone MachineSet:
// the controller makes the Cluster the owner of a stand-alone Machine
// (core/reconcilers/machine/machine_controller.go:450-459).
function standAloneMachine(): KubeObject {
  const [machine] = ofKind<KubeObject>(fixtureSet("machine-without-node"), "Machine").filter((object) =>
    object.metadata.name.endsWith("-without-node-h5zrd"),
  );
  const copy = structuredClone(machine) as unknown as Fields;

  copy.metadata.name = "freelens-capi-without-node-stand-alone";
  copy.metadata.labels = { "cluster.x-k8s.io/cluster-name": "freelens-capi-without-node" };
  copy.metadata.ownerReferences = [
    { apiVersion: "cluster.x-k8s.io/v1beta2", kind: "Cluster", name: "freelens-capi-without-node" },
  ];
  return copy as unknown as KubeObject;
}

beforeEach(() => {
  host.reset();
  vi.setSystemTime(CAPTURE);
  Common.logger.error.mockClear();
  Renderer.Component.KubeObjectMeta.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the sections of the details (SPEC-0004, The details)", () => {
  // What each section rests on, from the fixture as written: the references, the status, the parts of the workers,
  // the topology and the network of the spec, and the conditions of the status.
  function expectedSections(objects: readonly HostObject[]): string[] {
    const cluster = clusterOf(objects) as unknown as { spec: Fields; status?: Fields };
    const { spec, status } = cluster;
    const parts = objects.some((object) => ["MachineDeployment", "MachinePool"].includes(object.kind ?? ""));

    return SECTIONS.filter((name) => {
      switch (name) {
        case "metadata":
        case "status":
          return true;
        case "control-plane":
          return spec.controlPlaneRef !== undefined || status !== undefined;
        case "workers":
          return status?.workers !== undefined || parts;
        case "infrastructure":
          return spec.infrastructureRef !== undefined || status !== undefined;
        case "topology":
          return spec.topology !== undefined;
        case "network":
          return spec.clusterNetwork !== undefined;
        case "conditions":
          return ((status?.conditions as unknown[] | undefined) ?? []).length > 0;
      }
    });
  }

  it.each(STATES)("are shown, or hidden when they have nothing to show, for the Cluster of %s", (state) => {
    const objects = objectsOfStates([state]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(sections()).toEqual(expectedSections(objects));
    expect(Common.logger.error).not.toHaveBeenCalled();
  });

  it("hide the topology of a Cluster without one, and the network of a Cluster that sets none", () => {
    const objects = variantOf("without-topology", (cluster) => {
      delete cluster.spec.clusterNetwork;
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(sections()).toEqual(["metadata", "status", "control-plane", "workers", "infrastructure", "conditions"]);
  });

  it("show the metadata of the host in the details of the extension alone, not in the panel", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects), clusterOf(objects), true);
    expect(sections()[0]).toBe("metadata");
    cleanup();

    viewOf(sourceOf(objects), clusterOf(objects), false);
    expect(sections()[0]).toBe("status");
  });
});

describe("the status (SPEC-0004, The details, 1)", () => {
  it("names the activity that sets the tone, its threshold and the instant it turns, and turns then", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(CAPTURE);

    const objects = objectsOfStates(["provisioning"]);
    const source = sourceOf(objects);
    const cluster = clusterOf(objects) as unknown as ClusterObject;
    const parts = clusterPartsOf(indexContext(source.objects()), cluster, CAPTURE, new StatusMemo());
    const threshold = parts.row.status.tone.setBy?.activity.threshold;
    const passesAt = threshold?.passesAt ?? 0;

    viewOf(source, clusterOf(objects));

    expect(threshold?.seconds).toBe(1800);
    expect(valueOf(screen.getByTestId("capi-details-tone"))).toBe(
      `In the tone of progress, set by Provisioning of Cluster freelens-capi-provisioning: a warning after 30m, at ${new Date(passesAt).toISOString()}`,
    );

    act(() => {
      vi.advanceTimersByTime(passesAt - CAPTURE + 1000);
    });

    expect(valueOf(screen.getByTestId("capi-details-tone"))).toBe(
      "In the tone of a warning, set by Provisioning of Cluster freelens-capi-provisioning: past its threshold of 30m",
    );
  });

  it("names the object of the activity that sets the tone, when it is a part of the Cluster", () => {
    const objects = objectsOfStates(["machine-pool-without-machines"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(valueOf(screen.getByTestId("capi-details-tone"))).toMatch(
      /^In the tone of progress, set by Provisioning of KubeadmControlPlane freelens-capi-pool-without-machines-xcx9m: a warning after 10m, at /,
    );
  });

  it("shows the activities, each with its state, the instant it started, how long it has lasted and its tone", () => {
    const objects = objectsOfStates(["upgrading"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const rows = screen.getAllByTestId("capi-details-activity-row");
    const marks = screen.getAllByTestId("capi-details-activity");

    expect(marks.map((mark) => mark.getAttribute("data-word"))).toEqual([
      "Provisioning",
      "Upgrading",
      "Rolling out",
      "Scaling down",
    ]);
    expect(marks.every((mark) => ["info", "warning"].includes(mark.getAttribute("data-tone") ?? ""))).toBe(true);
    for (const row of rows) {
      expect(within(row).getByTestId("host-duration")).toBeDefined();
      expect(within(row).getByTestId("capi-details-since").textContent).toMatch(/^ since \d{4}-/);
    }
  });

  it("shows the stage of a deletion, the reason of Deleting and its message, and no health", () => {
    const objects = objectsOfStates(["deleting"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const stage = screen.getByTestId("capi-details-stage");

    expect(stage.textContent).toMatch(/^Stage: WaitingForWorkersDeletion\* MachineDeployments: /);
    expect(within(stage).getAllByTestId("capi-details-line")[0].textContent).toBe(
      "* MachineDeployments: freelens-capi-deleting-md-0-8dcql",
    );
    expect(screen.getByTestId("capi-details-health").textContent).toBe("N/A");
    expect(tooltipOf(screen.getByTestId("capi-details-health"))).toBe("No health: it is deleting");
  });

  it("shows the reason of TopologyReconciled and its message for an upgrade", () => {
    const objects = objectsOfStates(["upgrading"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const upgrading = screen
      .getAllByTestId("capi-details-activity-row")
      .find((row) => within(row).getByTestId("capi-details-activity").getAttribute("data-word") === "Upgrading");

    expect(within(upgrading as HTMLElement).getByTestId("capi-details-stage").textContent).toMatch(
      /^TopologyReconciled: ClusterUpgradingCluster is upgrading to v1\.37\.0/,
    );
  });

  it.each([
    ["spec.paused", () => undefined, "Paused by spec.paused, which reaches the Cluster and every object of it"],
    [
      "the annotation",
      (cluster: Fields) => {
        delete cluster.spec.paused;
        cluster.metadata.annotations = { ...cluster.metadata.annotations, "cluster.x-k8s.io/paused": "" };
      },
      "Paused by the annotation cluster.x-k8s.io/paused, which reaches the Cluster alone",
    ],
    [
      "both",
      (cluster: Fields) => {
        cluster.metadata.annotations = { ...cluster.metadata.annotations, "cluster.x-k8s.io/paused": "true" };
      },
      "Paused by spec.paused, which reaches the Cluster and every object of it, and by the annotation cluster.x-k8s.io/paused",
    ],
  ])("says the form of a pause, %s, and what it reaches", (_form, change, words) => {
    const objects = variantOf("paused", change);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(screen.getByTestId("capi-details-pause").textContent).toBe(words);
  });

  it("shows each mark of freshness with when it began, as an instant and a duration", () => {
    const objects = objectsOfStates(["paused"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const stale = screen.getByTestId("capi-details-stale");

    expect(stale.textContent).toMatch(/^stale Paused since \d{4}-.*, \d{4}-/);
    expect(within(stale).getByTestId("host-duration")).toBeDefined();
  });

  it("shows the mark of freshness next to the health, its causes in a row of their own (P12; SPEC-0003, Freshness)", () => {
    const objects = objectsOfStates(["paused"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(within(item("Health")).getByTestId("capi-details-health-stale").getAttribute("data-word")).toBe("stale");
    expect(screen.getByTestId("capi-details-stale").textContent).toMatch(/^stale Paused/);
    cleanup();

    const healthy = objectsOfStates(["healthy"]);

    viewOf(sourceOf(healthy), clusterOf(healthy));

    expect(within(item("Health")).queryByTestId("capi-details-health-stale")).toBeNull();
  });

  it("shows the failure fields and the phase Failed with their label deprecated", () => {
    const objects = variantOf("healthy", (cluster) => {
      cluster.status.phase = "Failed";
      cluster.status.deprecated = {
        v1beta1: {
          ...cluster.status.deprecated?.v1beta1,
          failureReason: "InvalidConfiguration",
          failureMessage: "the infrastructure refused it",
        },
      };
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(valueOf(screen.getByTestId("capi-details-failure-reason"))).toBe("InvalidConfigurationdeprecated");
    expect(valueOf(screen.getByTestId("capi-details-failure-message"))).toBe("the infrastructure refused itdeprecated");
    expect(valueOf(screen.getByTestId("capi-details-phase"))).toBe(
      "FaileddeprecatedThe project tells no software to decide on the phase of a Cluster.",
    );
  });

  it("hides the failure fields when they are unset, and shows the phase as written with its remark", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(screen.queryByTestId("capi-details-failure-reason")).toBeNull();
    expect(screen.queryByTestId("capi-details-failure-message")).toBeNull();
    expect(valueOf(screen.getByTestId("capi-details-phase"))).toBe(
      "ProvisionedThe project tells no software to decide on the phase of a Cluster.",
    );
  });

  it("shows the health, the condition it rests on, and the count of the MachinePools of unknown health", () => {
    const objects = objectsOfStates(["machine-pool-without-machines"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(valueOf(item("Health"))).toBe("Degraded1 MachinePool of unknown health");
    expect(valueOf(screen.getByTestId("capi-details-rests-on"))).toBe("Available: True");
  });

  it("shows the summary, its status, its reason, the instant of its transition and its message, nested", () => {
    const objects = objectsOfStates(["upgrading"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const summary = screen.getByTestId("capi-details-summary");
    const [first] = within(summary).getAllByRole("listitem");

    expect(valueOf(summary)).toMatch(/^Available: True, Available since 2025-12-31T23:59:37Z\* ControlPlaneAvailable:/);
    expect(
      within(first)
        .getAllByTestId("capi-details-line")
        .map((line) => line.textContent),
    ).toEqual([
      "* ControlPlaneAvailable:",
      "* 1 of 2 Machines has healthy control plane components, at least 1 required",
    ]);
  });

  it("lists the issues, a condition with its reason or a MachinePool with its health, and the notes of the model", () => {
    const objects = objectsOfStates(["machine-pools"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(screen.getAllByTestId("capi-details-issue").map((issue) => issue.textContent)).toEqual([
      "ControlPlaneMachinesReady: False, NotReady",
      "MachinePool freelens-capi-machine-pools-mp-0-s48vb: Unhealthy",
    ]);
    expect(valueOf(screen.getByTestId("capi-details-notes"))).toBe(
      "The availability of the controller of cluster-api is not known.",
    );
  });

  it("shows the spinner, never Unknown, in the place of the marks whose inputs are still loading", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects, { pending: ["machines"] }), clusterOf(objects));

    expect(within(item("Health")).getByTestId("capi-details-spinner")).toBeDefined();
    expect(within(item("Activities")).getByTestId("capi-details-spinner")).toBeDefined();
    expect(screen.queryByTestId("capi-details-health")).toBeNull();
    expect(screen.queryAllByTestId("capi-details-activity")).toEqual([]);
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("says that a refresh failed, as an event of the past with its time and its reason, never stale (P25)", () => {
    const objects = objectsOfStates(["healthy"]);
    const failure = { refused: false, message: "the list after the watch expired failed" };

    viewOf(sourceOf(objects, { refreshes: { machines: failure } }), clusterOf(objects));

    const read = screen.getByTestId("capi-details-read-failure");

    expect(read.textContent).toBe(
      `The Machines could not be read again, at ${new Date(CAPTURE + 60_000).toISOString()}${failure.message}`,
    );
    expect(screen.queryByTestId("capi-details-stale")).toBeNull();
  });

  it("says that a kind could not be read, with the message of the answer and the permission of a refusal", () => {
    const objects = objectsOfStates(["healthy"]);
    const failure = { refused: true, message: 'machines.cluster.x-k8s.io is forbidden in "freelens-capi-healthy"' };

    viewOf(sourceOf(objects, { failures: { machines: [failure] } }), clusterOf(objects));

    expect(screen.getByTestId("capi-details-read-failure").textContent).toBe(
      `The Machines could not be read${failure.message}Reading them takes get, list and watch on machines of cluster.x-k8s.io.`,
    );
  });
});

describe("the control plane and the infrastructure (SPEC-0004, The details, 2 and 4; P27)", () => {
  function initialized(change?: (condition: Fields) => void): HTMLElement {
    const objects = variantOf("healthy", (cluster) => {
      const condition = cluster.status.conditions.find(
        (entry: { type: string }) => entry.type === "ControlPlaneInitialized",
      );

      change?.(condition);
    });

    viewOf(sourceOf(objects), clusterOf(objects));
    return screen.getByTestId("capi-details-initialized");
  }

  it("reads Initialized Yes, since its transition, in the tone of its weight", () => {
    const answer = within(initialized()).getByTestId("capi-details-answer");

    expect(valueOf(screen.getByTestId("capi-details-initialized"))).toMatch(/^Yes since 2025-12-31T23:59:05Z$/);
    expect(answer.getAttribute("data-tone")).toBe("ok");
  });

  it("reads Initialized No when ControlPlaneInitialized is False", () => {
    const row = initialized((condition) => Object.assign(condition, { status: "False", reason: "NotInitialized" }));

    expect(valueOf(row)).toBe("No (NotInitialized)");
    expect(within(row).getByTestId("capi-details-answer").getAttribute("data-tone")).toBe("error");
  });

  it("reads Initialized Unknown, with its reason, when ControlPlaneInitialized is Unknown with InternalError", () => {
    const row = initialized((condition) => Object.assign(condition, { status: "Unknown", reason: "InternalError" }));

    expect(valueOf(row)).toMatch(/^Unknown/);
    expect(valueOf(row)).toContain("(InternalError)");
    expect(within(row).getByTestId("capi-details-answer").getAttribute("data-tone")).toBe("vague");
  });

  it("reads Initialized Unknown when the Cluster has not written it yet, with the tooltip that it reports none", () => {
    const objects = objectsOfStates(["no-status"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const row = screen.getByTestId("capi-details-initialized");

    expect(within(row).getByTestId("capi-details-answer").getAttribute("data-word")).toBe("Unknown");
    expect(row.textContent).toContain("This Cluster reports none yet");
  });

  it.each([
    ["Yes once it is true", "healthy", undefined, "Yes"],
    [
      "No while it is unset on a Cluster that has a status",
      "healthy",
      (cluster: Fields) => {
        cluster.status.initialization = { controlPlaneInitialized: true };
      },
      "No",
    ],
    ["Unknown while the Cluster has no status", "no-status", undefined, "Unknown"],
  ])("reads Provisioned %s", (_case, state, change, words) => {
    const objects = change === undefined ? objectsOfStates([state]) : variantOf(state, change);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(within(screen.getByTestId("capi-details-provisioned")).getByTestId("capi-details-answer").textContent).toBe(
      words,
    );
  });

  it("shows the counters of the control plane, N/A for one not written, its versions and its endpoint", () => {
    const objects = variantOf("upgrading", (cluster) => {
      delete cluster.status.controlPlane.upToDateReplicas;
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    const plane = screen.getByTestId("capi-details-section-control-plane");

    expect(valueOf(within(plane).getByTestId("capi-details-counters"))).toBe(
      "1 desired, 2 current, 1 ready, 1 available, N/A up to dateNot written yet",
    );
    expect(valueOf(within(plane).getByTestId("capi-details-versions"))).toBe("v1.36.4: 1 Machine, v1.37.0: 1 Machine");
    expect(valueOf(within(plane).getByTestId("capi-details-endpoint"))).toBe("172.19.0.13:6443");
  });

  it("shows the control plane object with its health and its activities", () => {
    const objects = objectsOfStates(["upgrading"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const plane = screen.getByTestId("capi-details-section-control-plane");

    expect(within(plane).getByTestId("capi-details-control-plane-reference").textContent).toBe(
      "KubeadmControlPlane freelens-capi-upgrading-52g8b",
    );
    expect(within(plane).getByTestId("capi-details-control-plane-reference-health").getAttribute("data-word")).toBe(
      "Degraded",
    );
    expect(
      within(plane)
        .getAllByTestId("capi-details-control-plane-reference-activity")
        .map((mark) => mark.getAttribute("data-word")),
    ).toEqual(["Provisioning", "Upgrading", "Rolling out", "Scaling down"]);
  });

  it("shows the control plane Machines of a Cluster that names no control plane as its rows (SPEC-0001, R3.7)", () => {
    const objects = variantOf("without-topology", (cluster) => {
      delete cluster.spec.controlPlaneRef;
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    const rows = within(screen.getByTestId("capi-details-control-plane-machines")).getAllByTestId("capi-details-part");

    expect(rows.map((row) => within(row).getByTestId("capi-details-part-name").textContent)).toEqual(
      ofKind<KubeObject>(fixtureSet("without-topology"), "Machine")
        .filter((machine) => machine.metadata.labels?.["cluster.x-k8s.io/control-plane"] !== undefined)
        .map((machine) => machine.metadata.name),
    );
  });

  it("shows the failure domains, each with whether it suits the control plane", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const domains = valueOf(screen.getByTestId("capi-details-failure-domains"));

    expect(domains).toMatch(/^fd1, for the control plane/);
    expect(domains).toContain("fd6, not for the control plane");
  });
});

describe("the workers (SPEC-0004, The details, 3; P17)", () => {
  it("give one row to each part that the Cluster sums, a MachineSet and a worker Machine that it owns included", () => {
    const objects = variantOf("machine-without-node", () => undefined, [standAloneMachine()]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const rows = within(screen.getByTestId("capi-details-workers")).getAllByTestId("capi-details-part");
    const column = (testId: string) => rows.map((row) => within(row).getByTestId(testId).textContent);

    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      "MachineDeployment",
      "MachineSet",
      "Machine",
    ]);
    expect(column("capi-details-part-name")).toEqual([
      "freelens-capi-without-node-md-0-glbqj",
      "freelens-capi-without-node-without-node",
      "freelens-capi-without-node-stand-alone",
    ]);
    expect(column("capi-details-part-replicas")).toEqual(["1/1", "0/1", "0/1"]);

    // Each row shows what the model computes for its object (SPEC-0003, "How a view uses it").
    const source = sourceOf(objects);
    const parts = clusterPartsOf(
      indexContext(source.objects()),
      clusterOf(objects) as unknown as ClusterObject,
      CAPTURE,
      new StatusMemo(),
    );
    const computed = [parts.machineDeployments, parts.machineSets, parts.workerMachines].flatMap((found) =>
      typeof found === "string" ? [] : found.map((part) => part.status.health.health),
    );

    expect(rows.map((row) => within(row).getByTestId("capi-details-part-health").getAttribute("data-word"))).toEqual(
      computed,
    );
  });

  it("leave out the MachineSet of a MachineDeployment, which the Cluster does not own, and its Machines", () => {
    const objects = objectsOfStates(["machine-without-node"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const names = within(screen.getByTestId("capi-details-workers"))
      .getAllByTestId("capi-details-part-name")
      .map((name) => name.textContent);

    expect(names).not.toContain("freelens-capi-without-node-md-0-glbqj-j9nhm");
    expect(names).not.toContain("freelens-capi-without-node-without-node-h5zrd");
  });

  it("show the counters and the versions of the workers", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const workers = screen.getByTestId("capi-details-section-workers");

    expect(valueOf(within(workers).getByTestId("capi-details-counters"))).toBe(
      "2 desired, 2 current, 2 ready, 2 available, 2 up to date",
    );
    expect(valueOf(within(workers).getByTestId("capi-details-versions"))).toBe("v1.37.0: 2 Machines");
  });

  it("say that a MachinePool with no Machines counts the instances of its provider", () => {
    const objects = objectsOfStates(["machine-pool-without-machines"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(screen.getByTestId("capi-details-pool-remark").textContent).toBe(
      "MachinePool freelens-capi-pool-without-machines-mp-0-s48vb has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.",
    );
  });
});

describe("the references between the objects of a Cluster (P18, P32; SPEC-0005, P3, P5)", () => {
  // A reference to an object of Cluster API of the Cluster: a button that opens the tree of the Cluster at its node,
  // with its details, as the maintainer decided for the KubeadmControlPlane, the MachineDeployments, the MachinePools
  // and the ClusterClass, and as SPEC-0005 proposes for the MachineSets, the worker Machines and a name in a message
  // (P5); never a link, and never the details of the host.
  // A name that opens nothing: plain text, with no element of the role link, and a click on it opens nothing.
  function expectText(element: HTMLElement) {
    expect(within(element).queryByRole("link")).toBeNull();
    expect(within(element).queryByRole("button")).toBeNull();
    expect(element.closest("a")).toBeNull();
    fireEvent.click(element);
    expect(host.navigate).not.toHaveBeenCalled();
    expect(host.showDetails).not.toHaveBeenCalled();
  }

  function expectTreeButton(element: HTMLElement, openTree: ReturnType<typeof vi.fn>, cluster: string, node: string) {
    expect(within(element).queryByRole("link")).toBeNull();
    expect(element.closest("a")).toBeNull();
    fireEvent.click(within(element).getByRole("button"));
    expect(openTree).toHaveBeenLastCalledWith(cluster, cluster, node);
    expect(host.navigate).not.toHaveBeenCalled();
    expect(host.showDetails).not.toHaveBeenCalled();
  }

  it("show the KubeadmControlPlane, the parts of the workers and the ClusterClass as buttons that open the tree at their node", () => {
    const openCluster = vi.fn();
    const openTree = vi.fn();
    const cluster = "freelens-capi-without-node";
    // The parts: a MachineDeployment, a MachineSet and a stand-alone worker Machine that the Cluster owns.
    const objects = variantOf("machine-without-node", () => undefined, [standAloneMachine()]);

    viewOf(sourceOf(objects), clusterOf(objects), true, openCluster, openTree);

    expectTreeButton(
      screen.getByTestId("capi-details-control-plane-reference"),
      openTree,
      cluster,
      "controlplane.cluster.x-k8s.io/KubeadmControlPlane/freelens-capi-without-node-glvg7",
    );
    expect(screen.getAllByTestId("capi-details-part-name").map((name) => name.textContent)).toEqual([
      "freelens-capi-without-node-md-0-glbqj",
      "freelens-capi-without-node-without-node",
      "freelens-capi-without-node-stand-alone",
    ]);

    const [deployment, set, machine] = screen.getAllByTestId("capi-details-part-name");

    expectTreeButton(
      deployment,
      openTree,
      cluster,
      "cluster.x-k8s.io/MachineDeployment/freelens-capi-without-node-md-0-glbqj",
    );
    expectTreeButton(set, openTree, cluster, "cluster.x-k8s.io/MachineSet/freelens-capi-without-node-without-node");
    expectTreeButton(machine, openTree, cluster, "cluster.x-k8s.io/Machine/freelens-capi-without-node-stand-alone");
    expectTreeButton(
      screen.getByTestId("capi-details-class"),
      openTree,
      cluster,
      "cluster.x-k8s.io/ClusterClass/quick-start",
    );
    expect(openCluster).not.toHaveBeenCalled();
  });

  it("open the ClusterClass that the Cluster names in another namespace at its node, by that namespace and its name", () => {
    const openTree = vi.fn();
    const objects = variantOf("healthy", (cluster) => {
      ((cluster.spec as Fields).topology as { classRef: { namespace?: string } }).classRef.namespace =
        "freelens-capi-classes";
    });

    viewOf(sourceOf(objects), clusterOf(objects), true, vi.fn(), openTree);

    expect(screen.getByTestId("capi-details-class").textContent).toMatch(/freelens-capi-classes\/quick-start/);
    expectTreeButton(
      screen.getByTestId("capi-details-class"),
      openTree,
      "freelens-capi-healthy",
      "cluster.x-k8s.io/ClusterClass/freelens-capi-classes/quick-start",
    );
  });

  it("show a MachinePool among the parts and a Machine named in a message as buttons that open the tree at their node", () => {
    const openCluster = vi.fn();
    const openTree = vi.fn();
    const cluster = "freelens-capi-machine-pools";
    const objects = objectsOfStates(["machine-pools"]);

    viewOf(sourceOf(objects), clusterOf(objects), true, openCluster, openTree);

    const [pool] = screen.getAllByTestId("capi-details-part-name");

    expectTreeButton(pool, openTree, cluster, `cluster.x-k8s.io/MachinePool/${pool.textContent}`);

    const line = screen
      .getAllByTestId("capi-details-line")
      .find((element) => element.textContent?.startsWith("* Machine freelens-capi-machine-pools-"));
    const machine = /^\* Machine (\S+):/.exec(line?.textContent ?? "")?.[1] ?? "";

    expect(line).toBeDefined();
    expectTreeButton(line as HTMLElement, openTree, cluster, `cluster.x-k8s.io/Machine/${machine}`);
    expect(openCluster).not.toHaveBeenCalled();
  });

  it("open the page of the tree from the row Tree, before the Status, in the details and in the panel", () => {
    const openTree = vi.fn();
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects), clusterOf(objects), true, vi.fn(), openTree);

    const sections = [...document.querySelectorAll("[data-testid^='capi-details-section-']")].map((section) =>
      section.getAttribute("data-testid"),
    );

    expect(sections.indexOf("capi-details-section-tree")).toBe(sections.indexOf("capi-details-section-status") - 1);
    expect(screen.getByTestId("capi-details-open-tree").textContent).toBe("Open the tree of this Cluster");
    fireEvent.click(screen.getByTestId("capi-details-open-tree"));
    expect(openTree).toHaveBeenCalledWith("freelens-capi-healthy", "freelens-capi-healthy");
  });

  it("leave the row Tree out of the details of the root of the tree, which the tree is under (SPEC-0005, P3)", () => {
    const objects = objectsOfStates(["healthy"]);
    const cluster = clusterOf(objects);

    render(
      <ClusterView
        source={sourceOf(objects)}
        namespace={cluster.getNs() ?? ""}
        name={cluster.getName()}
        host={{ extension: EXTENSION, openCluster: vi.fn(), openTree: vi.fn() }}
        metadata={true}
        inTree
      />,
    );

    expect(screen.queryByTestId("capi-details-section-tree")).toBeNull();
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
  });

  it("show a Cluster named in a message as a button that opens its details only when the view read it", () => {
    const openCluster = vi.fn();
    const objects = variantOf("healthy", (cluster) => {
      cluster.status.conditions.push({
        type: "ExampleGate",
        status: "False",
        reason: "Waiting",
        message: "* Cluster freelens-capi-healthy: waiting\n* Cluster not-read-here: waiting",
        lastTransitionTime: "2025-12-31T23:59:00Z",
      });
    });

    viewOf(sourceOf(objects), clusterOf(objects), true, openCluster);

    const lines = screen.getAllByTestId("capi-details-line");
    const read = lines.find((line) => line.textContent === "* Cluster freelens-capi-healthy: waiting");
    const unread = lines.find((line) => line.textContent === "* Cluster not-read-here: waiting");

    fireEvent.click(within(read as HTMLElement).getByRole("button"));
    expect(openCluster).toHaveBeenCalledWith("freelens-capi-healthy", "freelens-capi-healthy");
    expect(within(unread as HTMLElement).queryByRole("button")).toBeNull();
    expectText(unread as HTMLElement);
  });

  it("show the infrastructure cluster as a link to the details of the host, at the version of its contract", () => {
    const objects = objectsOfStates(["healthy"]);
    const devCluster = objects.find((object) => object.kind === "DevCluster") as HostObject;

    viewOf(sourceOf(objects), clusterOf(objects));

    const reference = screen.getByTestId("capi-details-infrastructure-reference");
    const link = within(reference).getByRole("link");

    expect(reference.textContent).toBe(`DevCluster ${devCluster.getName()}`);
    expect(link.textContent).toBe(devCluster.getName());
    fireEvent.click(link);
    expect(host.navigate).toHaveBeenCalledWith(`?kube-details=${encodeURIComponent(devCluster.selfLink)}`);
    expect(screen.getByTestId("capi-details-infrastructure-reference-health").getAttribute("data-word")).toBe(
      "Healthy",
    );
    // With its health alone, as "The details" give it.
    expect(screen.queryAllByTestId("capi-details-infrastructure-reference-activity")).toEqual([]);
  });

  it.each([
    [
      "its definition refused",
      { state: "unresolved", reason: "definition-refused", failure: { refused: true, message: "forbidden" } },
      /Its definition could not be read: reading it takes get on customresourcedefinitions of apiextensions\.k8s\.io/,
    ],
    [
      "a definition that names no version that the parser knows",
      { state: "unresolved", reason: "no-known-version", failure: undefined },
      /Its definition names no version of the contract that this extension knows/,
    ],
    [
      "a kind that the cluster does not serve",
      { state: "unresolved", reason: "not-served", failure: undefined },
      /This cluster serves no such kind/,
    ],
  ])("show the infrastructure cluster as text, with why, for %s", (_case, resolution, why) => {
    const objects = objectsOfStates(["healthy"]);
    const reference = { apiGroup: "infrastructure.cluster.x-k8s.io", kind: "DevCluster", name: "" };
    const options: SourceOptions = { resolutions: { devClusters: { ...resolution, reference } as never } };

    viewOf(sourceOf(objects, options), clusterOf(objects));

    const text = screen.getByTestId("capi-details-infrastructure-reference");

    expect(within(text).queryByRole("link")).toBeNull();
    expect(tooltipOf(text)).toMatch(/^infrastructure\.cluster\.x-k8s\.io\. /);
    expect(tooltipOf(text)).toMatch(why);
    expect(screen.getByTestId("capi-details-infrastructure-reference-unread").textContent).toMatch(why);
  });

  it("show as text, with why, an infrastructure cluster that is not in the namespace, which was read", () => {
    const objects = objectsOfStates(["healthy"]).filter((object) => object.kind !== "DevCluster");

    viewOf(sourceOf(objects), clusterOf(objects));

    const text = screen.getByTestId("capi-details-infrastructure-reference");

    expect(within(text).queryByRole("link")).toBeNull();
    expect(tooltipOf(text)).toBe("infrastructure.cluster.x-k8s.io. No such object is in the namespace of the Cluster.");
    // The namespace was read: the row says that the object is not there, and not that it was not read.
    expect(valueOf(screen.getByTestId("capi-details-infrastructure-reference-unread"))).toBe(
      "No such object is in the namespace of the Cluster.",
    );
  });

  it("show as text, with why, an infrastructure cluster whose kind the cluster has, but not at the version of its contract", () => {
    const objects = objectsOfStates(["healthy"]);
    const page = sourceOf(objects);
    // The definition names a version of the contract that the host registered no API for: no store of the kind.
    const without = {
      ...page.objects(),
      infrastructures: new Map([
        ["infrastructure.cluster.x-k8s.io/DevCluster", { key: undefined, items: [], resolution: RESOLVED.devClusters }],
      ]),
    };

    viewOf({ ...page, objects: () => without, index: () => indexContext(without) }, clusterOf(objects));

    const words =
      "This cluster does not serve this kind at the version that the contract label of its definition names.";

    expect(tooltipOf(screen.getByTestId("capi-details-infrastructure-reference"))).toBe(
      `infrastructure.cluster.x-k8s.io. ${words}`,
    );
    expect(valueOf(screen.getByTestId("capi-details-infrastructure-reference-unread"))).toBe(`Not read. ${words}`);
  });

  it("show the metadata of the host with the namespace and the owners hidden there, as the badge and as text where the host puts them", () => {
    const objects = variantOf("healthy", (cluster) => {
      cluster.metadata.ownerReferences = [{ apiVersion: "example.com/v1", kind: "Owner", name: "owner-of-it" }];
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    const metadata = screen.getByTestId("capi-details-section-metadata");
    const parts = [...metadata.children].map(
      (part) => part.getAttribute("data-fields") ?? part.getAttribute("data-testid"),
    );

    // The metadata of the host in four parts, each with the fields that it shows in the order of the host, the
    // namespace after the name, the annotations after the labels and the owners after the finalizers, in rows of their
    // own; none shows the namespace, the owners, the annotations, or the three fields that the host hides by default.
    // A Cluster with no annotation shows no row of them (SPEC-0005, P20).
    expect(parts).toEqual([
      "creationTimestamp deletionTimestamp name",
      "capi-details-namespace",
      "labels",
      "finalizers",
      "capi-details-owners",
      "managedFields",
    ]);
    for (const [props] of Renderer.Component.KubeObjectMeta.mock.calls.slice(-4)) {
      expect(props.hideFields).toEqual(
        expect.arrayContaining(["uid", "resourceVersion", "selfLink", "namespace", "ownerReferences", "annotations"]),
      );
    }
    expect(within(metadata).queryAllByRole("link")).toEqual([]);
    expect(within(screen.getByTestId("capi-details-namespace")).getByTestId("host-namespace").textContent).toBe(
      "freelens-capi-healthy",
    );
    expect(valueOf(screen.getByTestId("capi-details-owners"))).toBe("Owner owner-of-it");
  });
});

describe("what the details of a Cluster never show (SPEC-0005, P20)", () => {
  it("show the annotations in a row of their own, the one that kubectl apply writes held and not shown", () => {
    const applied = JSON.stringify({ spec: { topology: { variables: [{ name: "token", value: "s3cr3t" }] } } });
    const objects = variantOf("healthy", (cluster) => {
      cluster.metadata.annotations = {
        "example.com/owner": "team-a",
        "kubectl.kubernetes.io/last-applied-configuration": applied,
      };
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    const row = screen.getByTestId("capi-details-annotations");

    expect(valueOf(row)).toMatch(/^example\.com\/owner=team-a/);
    expect(screen.getByTestId("capi-details-annotation-held").textContent).toMatch(
      /^kubectl\.kubernetes\.io\/last-applied-configuration: held, and not shown/,
    );
    expect(document.body.textContent).not.toMatch(/s3cr3t/);
    // The metadata of the host show no annotation: every part leaves them out.
    for (const [props] of Renderer.Component.KubeObjectMeta.mock.calls.slice(-4)) {
      expect(props.hideFields).toContain("annotations");
    }
  });

  it("name the variables of the topology, never their values", () => {
    const objects = objectsOfStates(["healthy"]);
    const cluster = fixtureSet("healthy").find((object) => object.kind === "Cluster") as unknown as {
      spec: { topology: { variables?: { name: string; value: unknown }[] } };
    };
    const names = (cluster.spec.topology.variables ?? []).map((variable) => variable.name);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(names.length).toBeGreaterThan(0);
    expect(valueOf(screen.getByTestId("capi-details-variables"))).toBe(names.join(", "));
    for (const variable of cluster.spec.topology.variables ?? []) {
      expect(document.body.textContent).not.toContain(JSON.stringify(variable.value));
    }
  });
});

describe("the topology, the network and the conditions (SPEC-0004, The details, 5 to 7)", () => {
  it("show the class, the version, the replicas, each part of the topology and the pending hooks, an unknown one kept", () => {
    const objects = variantOf("upgrading", (cluster) => {
      cluster.metadata.annotations = {
        ...cluster.metadata.annotations,
        "runtime.cluster.x-k8s.io/pending-hooks": "AfterClusterUpgrade,NotAHookOfThisRelease",
      };
      delete cluster.spec.topology.workers.machineDeployments[0].replicas;
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    const topology = screen.getByTestId("capi-details-section-topology");
    const part = screen.getByTestId("capi-details-topology-part");

    expect(valueOf(screen.getByTestId("capi-details-class"))).toBe("quick-start");
    expect(valueOf(item("Version", topology))).toBe("v1.37.0");
    expect(valueOf(item("Control plane replicas", topology))).toBe("1");
    expect(valueOf(screen.getByTestId("capi-details-hooks"))).toBe(
      "AfterClusterUpgrade, NotAHookOfThisRelease (unknown)",
    );
    expect(valueOf(part)).toBe("Class default-worker, replicas N/AThe topology does not set it");
    expect(part.querySelector("[data-drawer-item-name]")?.textContent).toBe("MachineDeployment md-0");
  });

  it("show no pending hook when the annotation is not there", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(valueOf(screen.getByTestId("capi-details-hooks"))).toBe("None");
  });

  it("show the class with its namespace when it is not that of the Cluster", () => {
    const objects = variantOf("healthy", (cluster) => {
      cluster.spec.topology.classRef.namespace = "classes";
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    expect(valueOf(screen.getByTestId("capi-details-class"))).toBe("classes/quick-start");
  });

  it("show the network, each row hidden when unset", () => {
    const objects = variantOf("healthy", (cluster) => {
      cluster.spec.clusterNetwork = { apiServerPort: 6443, pods: { cidrBlocks: ["192.168.0.0/16"] } };
    });

    viewOf(sourceOf(objects), clusterOf(objects));

    const names = [
      ...screen.getByTestId("capi-details-section-network").querySelectorAll("[data-drawer-item-name]"),
    ].map((name) => name.textContent);

    expect(names).toEqual(["API server port", "Pods"]);
    expect(valueOf(item("Pods"))).toBe("192.168.0.0/16");
  });

  it("list the conditions in their stored order, each with its weight, a negative one at rest never in the tone of an issue", () => {
    const objects = objectsOfStates(["healthy"]);
    const stored = (clusterOf(objects) as unknown as { status: { conditions: { type: string }[] } }).status.conditions;

    viewOf(sourceOf(objects), clusterOf(objects));

    const rows = screen.getAllByTestId("capi-details-condition");
    const weight = (type: string) =>
      within(
        rows.find((row) => row.querySelector("[data-drawer-item-name]")?.textContent === type) as HTMLElement,
      ).getByTestId("capi-details-weight");

    expect(rows.map((row) => row.querySelector("[data-drawer-item-name]")?.textContent)).toEqual(
      stored.map((condition) => condition.type),
    );
    expect(weight("Available").getAttribute("data-word")).toBe("Ok");
    expect(weight("Available").getAttribute("data-tone")).toBe("ok");
    for (const type of ["Paused", "Deleting", "RollingOut", "ScalingUp"]) {
      expect(weight(type).getAttribute("data-word"), type).toBe("At rest");
      expect(weight(type).getAttribute("data-tone"), type).toBe("info");
    }
  });

  it("mark a condition that describes an older generation", () => {
    const objects = objectsOfStates(["deleting"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const initialized = screen
      .getAllByTestId("capi-details-condition")
      .find((row) => row.querySelector("[data-drawer-item-name]")?.textContent === "ControlPlaneInitialized");

    expect(within(initialized as HTMLElement).getByTestId("capi-details-older-generation")).toBeDefined();
  });

  it("give a long name of a condition a chance to break before each of its words, in a row whose label wraps", () => {
    const objects = objectsOfStates(["upgrading"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const row = screen
      .getAllByTestId("capi-details-condition")
      .find(
        (element) => element.querySelector("[data-drawer-item-name]")?.textContent === "ControlPlaneMachinesUpToDate",
      ) as HTMLElement;

    // The name as written, with a chance to break before each of its words, and the class whose label wraps in the
    // column of the labels (the stylesheet, and its case of styles.test.ts).
    expect(row.querySelector("[data-drawer-item-name]")?.innerHTML).toBe(
      "Control<wbr>Plane<wbr>Machines<wbr>Up<wbr>To<wbr>Date",
    );
    expect(row.className.split(" ")).toContain(styles.condition);
  });

  it("nest the lines of a message as the parser gives them, the names of a subject as text", () => {
    const objects = objectsOfStates(["upgrading"]);

    viewOf(sourceOf(objects), clusterOf(objects));

    const topology = screen
      .getAllByTestId("capi-details-condition")
      .find((row) => row.querySelector("[data-drawer-item-name]")?.textContent === "TopologyReconciled") as HTMLElement;
    const [first] = within(topology).getAllByRole("listitem");
    const nested = within(first).getAllByRole("listitem");

    expect(within(first).getAllByTestId("capi-details-line")[0].textContent).toBe("Cluster is upgrading to v1.37.0");
    expect(nested.map((line) => line.textContent)).toEqual([
      "* KubeadmControlPlane upgrading to version v1.37.0",
      "* MachineDeployment freelens-capi-upgrading-md-0-82krw pending upgrade to version v1.37.0",
    ]);
    expect(within(topology).queryByRole("link")).toBeNull();
  });
});

describe("the lines of a message (SPEC-0003, P27; DESIGN.md, Words)", () => {
  // The lines of a message as the parser gives them, each as the project wrote it, without its indentation, with the
  // depth at which the parser nests it.
  function writtenLines(message: unknown): { text: string; depth: number }[] {
    const parsed = parseConditionMessage(message);
    const lines: { text: string; depth: number }[] = [];
    const walk = (items: readonly MessageLine[], depth: number) => {
      for (const item of items) {
        lines.push({ text: item.written.trim(), depth });
        walk(item.children, depth + 1);
      }
    };

    if (parsed.state === "read") walk(parsed.lines, 0);
    return lines;
  }

  // The lines that a row of the details shows, each with the depth of the list that holds it.
  function shownLines(row: HTMLElement): { text: string; depth: number }[] {
    return within(row)
      .queryAllByTestId("capi-details-line")
      .map((line) => {
        let depth = -1;

        for (
          let element: HTMLElement | null = line;
          element !== null && element !== row;
          element = element.parentElement
        ) {
          if (element.tagName === "UL") depth++;
        }
        return { text: line.textContent ?? "", depth };
      });
  }

  it.each(STATES)(
    "show every line of each condition of %s as the project wrote it, nested as the parser gives it",
    (state) => {
      const objects = objectsOfStates([state]);
      const conditions =
        (clusterOf(objects) as unknown as { status?: { conditions?: { type: string; message?: string }[] } }).status
          ?.conditions ?? [];

      viewOf(sourceOf(objects), clusterOf(objects));

      const rows = screen.queryAllByTestId("capi-details-condition");

      for (const condition of conditions) {
        const row = rows.find(
          (element) => element.querySelector("[data-drawer-item-name]")?.textContent === condition.type,
        ) as HTMLElement;

        expect(shownLines(row), `${state}: ${condition.type}`).toEqual(writtenLines(condition.message ?? ""));
      }
    },
  );
});

describe("an error in the details", () => {
  it("shows the error page in the place of its section alone, and leaves the list", () => {
    const objects = objectsOfStates(["healthy"]);

    const metadata = Renderer.Component.KubeObjectMeta.getMockImplementation();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Renderer.Component.KubeObjectMeta.mockImplementation(() => {
      throw new TypeError("the metadata failed");
    });
    onTestFinished(() => {
      if (metadata !== undefined) Renderer.Component.KubeObjectMeta.mockImplementation(metadata);
    });
    render(
      <>
        <ClusterView
          source={sourceOf(objects)}
          namespace="freelens-capi-healthy"
          name="freelens-capi-healthy"
          host={{ extension: EXTENSION, openCluster: vi.fn(), openTree: vi.fn() }}
          metadata={true}
        />
        <p>the list</p>
      </>,
    );

    expect(screen.getByText("TypeError: the metadata failed")).toBeDefined();
    expect(screen.queryByTestId("capi-details-section-metadata")).toBeNull();
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(screen.getByText("the list")).toBeDefined();
    expect(Common.logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("an error in the row Tree (SPEC-0005, P3)", () => {
  it("shows the error page in the place of the row Tree alone, inside an error boundary of its own, and keeps the sections", () => {
    const objects = objectsOfStates(["healthy"]);
    const item = Renderer.Component.DrawerItem.getMockImplementation();

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Renderer.Component.DrawerItem.mockImplementation((props) => {
      if (props.name === "Tree") throw new TypeError("the row Tree failed");
      return item === undefined ? null : item(props);
    });
    onTestFinished(() => {
      if (item !== undefined) Renderer.Component.DrawerItem.mockImplementation(item);
    });
    viewOf(sourceOf(objects), clusterOf(objects));

    expect(screen.getByText("TypeError: the row Tree failed")).toBeDefined();
    expect(screen.queryByTestId("capi-details-section-tree")).toBeNull();
    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(screen.getByTestId("capi-details-section-metadata")).toBeDefined();
    expect(Common.logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("the states of a view of one Cluster (P25)", () => {
  it("show the spinner while the Clusters of its namespace are not read", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(sourceOf(objects, { pending: ["clusters"] }), clusterOf(objects));

    expect(screen.getByTestId("capi-details-loading")).toBeDefined();
    expect(sections()).toEqual([]);
  });

  it("say that no Cluster of its name is in its namespace, which was read", () => {
    const objects = objectsOfStates(["healthy"]);

    render(
      <ClusterView
        source={sourceOf(objects)}
        namespace="freelens-capi-healthy"
        name="gone"
        host={{ extension: EXTENSION, openCluster: vi.fn(), openTree: vi.fn() }}
        metadata={true}
      />,
    );

    expect(screen.getByTestId("capi-details-not-found").textContent).toBe(
      "No Cluster freelens-capi-healthy/gone is in the namespace freelens-capi-healthy, which was read.",
    );
  });

  // The host empties the namespace whose list failed: its store holds no Cluster of it.
  function withoutCluster(objects: readonly HostObject[]): HostObject[] {
    return objects.filter((object) => object.kind !== "Cluster");
  }

  it("say that its namespace cannot be read, with the message of the answer and the permission", () => {
    const objects = objectsOfStates(["healthy"]);
    const failure = { refused: true, message: 'clusters.cluster.x-k8s.io is forbidden in "freelens-capi-healthy"' };

    viewOf(sourceOf(withoutCluster(objects), { failures: { clusters: [failure] } }), clusterOf(objects));

    expect(screen.getByTestId("capi-details-not-read").textContent).toBe(
      `The namespace freelens-capi-healthy cannot be read: you may not list its Clusters.${failure.message}Reading them takes get, list and watch on clusters of cluster.x-k8s.io, in that namespace or over the whole cluster.`,
    );
  });

  it("say that the Clusters of its namespace could not be read again, with the time of the refresh", () => {
    const objects = objectsOfStates(["healthy"]);
    const failure = { refused: false, message: "the list after the watch expired failed" };

    viewOf(sourceOf(withoutCluster(objects), { refreshes: { clusters: failure } }), clusterOf(objects));

    expect(screen.getByTestId("capi-details-not-read").textContent).toBe(
      `The Clusters of the namespace freelens-capi-healthy could not be read again, at ${new Date(CAPTURE + 60_000).toISOString()}${failure.message}`,
    );
  });

  it("show a Cluster that its store holds while a read that failed in another namespace holds the Clusters back, with no failure of the Clusters (P25, Partial)", () => {
    const objects = objectsOfStates(["healthy", "paused"]);
    const failure = { refused: true, message: 'clusters.cluster.x-k8s.io is forbidden in "freelens-capi-paused"' };
    // The load of both namespaces was refused in that of paused, which the host emptied.
    const source = sourceOf(
      objects.filter((object) => !(object.kind === "Cluster" && object.getNs() === "freelens-capi-paused")),
      { failures: { clusters: [failure] } },
    );
    const healthy = objects.find((object) => object.kind === "Cluster" && object.getNs() === "freelens-capi-healthy");

    viewOf(source, healthy as HostObject);

    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(screen.queryByTestId("capi-details-not-read")).toBeNull();
    expect(
      screen.queryAllByTestId("capi-details-read-failure").filter((read) => read.textContent?.includes("Clusters")),
    ).toEqual([]);
  });

  it("show a Cluster that its store holds after a refresh of the Clusters failed", () => {
    const objects = objectsOfStates(["healthy"]);

    viewOf(
      sourceOf(objects, {
        refreshes: { clusters: { refused: false, message: "the list after the watch expired failed" } },
      }),
      clusterOf(objects),
    );

    expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    expect(screen.queryByTestId("capi-details-not-read")).toBeNull();
  });
});

describe("the panel in the details of the host (P16, P31)", () => {
  function panel(object: HostObject) {
    return render(
      <ClusterPanel
        object={object as unknown as Cluster}
        extension={EXTENSION}
        openCluster={vi.fn()}
        openTree={vi.fn()}
      />,
    );
  }

  // The objects that the stores of the extension's own class read, by the base of their API.
  function serveOwn(objects: readonly HostObject[]) {
    for (const api of Object.values(APIS)) {
      host.cluster.set(api.apiBase, { items: objects.filter((object) => object.kind === api.kind), failures: [] });
    }
  }

  it("takes its Cluster and its context from the reads of the page when the page reads its namespace", () => {
    const objects = objectsOfStates(["healthy"]);
    const built = host.builtStores.length;
    const unpublish = publishPageSource(sourceOf(objects));

    try {
      panel(clusterOf(objects));

      expect(sections()).toEqual([
        "status",
        "control-plane",
        "workers",
        "infrastructure",
        "topology",
        "network",
        "conditions",
      ]);
      expect(host.builtStores.length).toBe(built);
    } finally {
      unpublish();
    }
  });

  it("reads with stores of its own while the read of the page over the whole cluster is not followed (P34, P16)", async () => {
    serve();

    const objects = objectsOfStates(["healthy"]);
    const built = host.builtStores.length;
    const page = sourceOf(objects);
    // The page read the Clusters once over the whole cluster, and the host does not follow them.
    const reads = (
      [
        { type: "load-started", kind: keyOf("clusters"), id: 99, namespaces: ["freelens-capi-healthy"] },
        { type: "load-ended", kind: keyOf("clusters"), id: 99, overWholeCluster: true, followed: false, at: CAPTURE },
      ] satisfies ReadEvent[]
    ).reduce(reduceReads, page.reads);
    const unpublish = publishPageSource({ ...page, reads });

    serveOwn(objects);

    try {
      panel(clusterOf(objects));
      await act(async () => undefined);

      expect(host.builtStores.length).toBeGreaterThan(built);
      expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
    } finally {
      unpublish();
    }
  });

  it("reads its Cluster and its namespace through stores of its own otherwise, and stops when it unmounts", async () => {
    const stores = serve();
    const objects = objectsOfStates(["healthy"]);
    const built = host.builtStores.length;
    // A page is mounted, and its filter leaves out the namespace of the Cluster.
    const unpublish = publishPageSource(sourceOf([], { filter: ["default"], loaded: ["default"] }));

    serveOwn(objects);

    try {
      const { unmount } = panel(clusterOf(objects));

      await act(async () => undefined);

      const own = host.builtStores.slice(built) as {
        api: { apiBase: string };
        loadAll: ReturnType<typeof vi.fn>;
        subscribe: ReturnType<typeof vi.fn>;
      }[];

      expect(own.map((store) => store.api.apiBase)).toContain(APIS.clusters.apiBase);
      expect(screen.getByTestId("capi-details-section-status")).toBeDefined();
      // The kinds of the operator are not read for the view, and the model notes the controllers as not read.
      expect(screen.getByTestId("capi-details-notes").textContent).toContain(
        "Not read, so not given to the status model: the availability of the controllers of its providers.",
      );
      for (const store of own) expect(store.loadAll.mock.calls[0][0].namespaces).toEqual(["freelens-capi-healthy"]);
      expect(host.registerStore).not.toHaveBeenCalled();
      expect(stores.clusters?.loadAll).not.toHaveBeenCalled();

      const controller = own[0].subscribe.mock.calls[0][0].abortController as AbortController;

      expect(controller.signal.aborted).toBe(false);
      unmount();
      expect(controller.signal.aborted).toBe(true);
    } finally {
      unpublish();
    }
  });
});
