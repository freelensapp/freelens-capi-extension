// The messages of the conditions (SPEC-0003, "Tests", "Unit", P27): the lines, nested by indentation, with the
// bullet and the subject of each line that the project composes, and every other line kept as text. Every case
// also checks that the lines, read in their order, give back the message: none is dropped, merged or reordered.

import { describe, expect, it } from "vitest";
import { parseConditionMessage } from "./condition-message";

import type { MessageLine, MessageSubject } from "./condition-message";

function line(
  written: string,
  indentation: number,
  bullet: boolean,
  text: string,
  subject?: MessageSubject,
  children: MessageLine[] = [],
): MessageLine {
  return { written, indentation, bullet, text, subject, children };
}

function flatten(lines: MessageLine[]): MessageLine[] {
  return lines.flatMap((each) => [each, ...flatten(each.children)]);
}

// The lines of a message, after checking that they give it back.
function linesOf(message: string): MessageLine[] {
  const parsed = parseConditionMessage(message);

  if (parsed.state !== "read") throw new Error("the message was not read");
  expect(
    flatten(parsed.lines)
      .map((each) => each.written)
      .join("\n"),
  ).toBe(message);
  expect(parsed.headline).toBe(message.split("\n")[0]);
  return parsed.lines;
}

describe("the message of a condition", () => {
  it("reads an empty message as no line", () => {
    expect(parseConditionMessage("")).toEqual({ state: "read", headline: undefined, lines: [] });
  });

  it("reads one line, which is the headline", () => {
    expect(parseConditionMessage("Waiting for spec.replicas set")).toEqual({
      state: "read",
      headline: "Waiting for spec.replicas set",
      lines: [line("Waiting for spec.replicas set", 0, false, "Waiting for spec.replicas set")],
    });
  });

  it("reads a summary of three bullets, each with its type", () => {
    const message = [
      "* InfrastructureReady: DockerCluster is not ready",
      "* ControlPlaneAvailable: Control plane not yet initialized",
      "* example.com/BackupReady: NoReasonReported",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line(
        "* InfrastructureReady: DockerCluster is not ready",
        0,
        true,
        "InfrastructureReady: DockerCluster is not ready",
        { form: "summary", text: "InfrastructureReady:", type: "InfrastructureReady" },
      ),
      line(
        "* ControlPlaneAvailable: Control plane not yet initialized",
        0,
        true,
        "ControlPlaneAvailable: Control plane not yet initialized",
        { form: "summary", text: "ControlPlaneAvailable:", type: "ControlPlaneAvailable" },
      ),
      line("* example.com/BackupReady: NoReasonReported", 0, true, "example.com/BackupReady: NoReasonReported", {
        form: "summary",
        text: "example.com/BackupReady:",
        type: "example.com/BackupReady",
      }),
    ]);
  });

  it("nests a message of several lines under its bullet", () => {
    const message = [
      "* NodeHealthy:",
      "  * Node.Ready: Kubelet stopped posting node status",
      "  * Node.MemoryPressure: Condition not yet reported",
      "* Deleting: Machine deletion in progress",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line("* NodeHealthy:", 0, true, "NodeHealthy:", { form: "summary", text: "NodeHealthy:", type: "NodeHealthy" }, [
        line(
          "  * Node.Ready: Kubelet stopped posting node status",
          2,
          true,
          "Node.Ready: Kubelet stopped posting node status",
          { form: "summary", text: "Node.Ready:", type: "Node.Ready" },
        ),
        line(
          "  * Node.MemoryPressure: Condition not yet reported",
          2,
          true,
          "Node.MemoryPressure: Condition not yet reported",
          { form: "summary", text: "Node.MemoryPressure:", type: "Node.MemoryPressure" },
        ),
      ]),
      line("* Deleting: Machine deletion in progress", 0, true, "Deleting: Machine deletion in progress", {
        form: "summary",
        text: "Deleting:",
        type: "Deleting",
      }),
    ]);
  });

  it("reads the three forms of a line of an aggregate, and the line that closes it", () => {
    const message = [
      "* Machine md-0-abc12: Node is not ready",
      "* Machines md-0-def34, md-0-ghi56: Waiting for a Node",
      "* Machines md-0-jkl78, md-0-mno90, md-0-pqr12, ... (2 more): Waiting for the infrastructure",
      "And 1 Machine with status unknown",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line("* Machine md-0-abc12: Node is not ready", 0, true, "Machine md-0-abc12: Node is not ready", {
        form: "aggregate",
        text: "Machine md-0-abc12:",
        kind: "Machine",
        names: ["md-0-abc12"],
        others: 0,
      }),
      line(
        "* Machines md-0-def34, md-0-ghi56: Waiting for a Node",
        0,
        true,
        "Machines md-0-def34, md-0-ghi56: Waiting for a Node",
        {
          form: "aggregate",
          text: "Machines md-0-def34, md-0-ghi56:",
          kind: "Machines",
          names: ["md-0-def34", "md-0-ghi56"],
          others: 0,
        },
      ),
      line(
        "* Machines md-0-jkl78, md-0-mno90, md-0-pqr12, ... (2 more): Waiting for the infrastructure",
        0,
        true,
        "Machines md-0-jkl78, md-0-mno90, md-0-pqr12, ... (2 more): Waiting for the infrastructure",
        {
          form: "aggregate",
          text: "Machines md-0-jkl78, md-0-mno90, md-0-pqr12, ... (2 more):",
          kind: "Machines",
          names: ["md-0-jkl78", "md-0-mno90", "md-0-pqr12"],
          others: 2,
        },
      ),
      line("And 1 Machine with status unknown", 0, false, "And 1 Machine with status unknown", {
        form: "closing",
        text: "And 1 Machine",
        kind: "Machine",
        count: 1,
      }),
    ]);
  });

  it("reads an aggregate that a summary indents under its line, whose closing line is a bullet", () => {
    const message = [
      "* MachinesReady:",
      "    * Machines cp-a, cp-b: Node is not ready",
      "  * And 2 MachineDeployments with other issues",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line(
        "* MachinesReady:",
        0,
        true,
        "MachinesReady:",
        { form: "summary", text: "MachinesReady:", type: "MachinesReady" },
        [
          line("    * Machines cp-a, cp-b: Node is not ready", 4, true, "Machines cp-a, cp-b: Node is not ready", {
            form: "aggregate",
            text: "Machines cp-a, cp-b:",
            kind: "Machines",
            names: ["cp-a", "cp-b"],
            others: 0,
          }),
          line(
            "  * And 2 MachineDeployments with other issues",
            2,
            true,
            "And 2 MachineDeployments with other issues",
            { form: "closing", text: "And 2 MachineDeployments", kind: "MachineDeployments", count: 2 },
          ),
        ],
      ),
    ]);
  });

  it("reads a headline followed by bullets, as a scale up that waits writes it", () => {
    const message = [
      "Scaling up from 1 to 3 replicas is blocked because:",
      "* waiting for a control plane Machine to complete deletion",
      "* waiting for etcd cluster to become healthy",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line(
        "Scaling up from 1 to 3 replicas is blocked because:",
        0,
        false,
        "Scaling up from 1 to 3 replicas is blocked because:",
      ),
      line(
        "* waiting for a control plane Machine to complete deletion",
        0,
        true,
        "waiting for a control plane Machine to complete deletion",
      ),
      line("* waiting for etcd cluster to become healthy", 0, true, "waiting for etcd cluster to become healthy"),
    ]);
  });

  it("nests the bullets of ClusterUpgrading under its headline, with no subject", () => {
    const message = [
      "Cluster is upgrading to v1.35.0",
      "  * Following hooks are blocking upgrade: BeforeClusterUpgrade: waiting",
      "  * KubeadmControlPlane upgrading to version v1.35.0",
      "  * MachineDeployments md-0, md-1 pending upgrade to version v1.35.0",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line("Cluster is upgrading to v1.35.0", 0, false, "Cluster is upgrading to v1.35.0", undefined, [
        line(
          "  * Following hooks are blocking upgrade: BeforeClusterUpgrade: waiting",
          2,
          true,
          "Following hooks are blocking upgrade: BeforeClusterUpgrade: waiting",
        ),
        line(
          "  * KubeadmControlPlane upgrading to version v1.35.0",
          2,
          true,
          "KubeadmControlPlane upgrading to version v1.35.0",
        ),
        line(
          "  * MachineDeployments md-0, md-1 pending upgrade to version v1.35.0",
          2,
          true,
          "MachineDeployments md-0, md-1 pending upgrade to version v1.35.0",
        ),
      ]),
    ]);
  });

  it("keeps as text, with their indentation, tabs, an odd indentation, a * with no space and a carriage return", () => {
    const message = [
      "Headline",
      "\t* Machine m-1: after a tab",
      "   * Machine m-2: after three spaces",
      "*Machine m-3: with no space",
      "* Machine m-4: before a carriage return\r",
      "* Machine m-5: after it",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line("Headline", 0, false, "Headline"),
      line("\t* Machine m-1: after a tab", 0, false, "\t* Machine m-1: after a tab", undefined, [
        line("   * Machine m-2: after three spaces", 3, false, "* Machine m-2: after three spaces"),
      ]),
      line("*Machine m-3: with no space", 0, false, "*Machine m-3: with no space"),
      line("* Machine m-4: before a carriage return\r", 0, false, "* Machine m-4: before a carriage return\r"),
      line("* Machine m-5: after it", 0, true, "Machine m-5: after it", {
        form: "aggregate",
        text: "Machine m-5:",
        kind: "Machine",
        names: ["m-5"],
        others: 0,
      }),
    ]);
  });

  it("splits a message only at a line feed, so that a carriage return makes no line", () => {
    expect(linesOf("First line\r\nSecond line\rstill the second")).toEqual([
      line("First line\r", 0, false, "First line\r"),
      line("Second line\rstill the second", 0, false, "Second line\rstill the second"),
    ]);
  });

  it("reads the shape of a summary or of an aggregate on a line without a bullet as no subject", () => {
    const message = [
      "NodeHealthy: Node is not ready",
      "Machine m-1: waiting",
      "  NodeHealthy: Node is not ready",
      "  Machine m-1: waiting",
      "And 2 Machines with other issues",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line("NodeHealthy: Node is not ready", 0, false, "NodeHealthy: Node is not ready"),
      line("Machine m-1: waiting", 0, false, "Machine m-1: waiting", undefined, [
        line("  NodeHealthy: Node is not ready", 2, false, "NodeHealthy: Node is not ready"),
        line("  Machine m-1: waiting", 2, false, "Machine m-1: waiting"),
      ]),
      line("And 2 Machines with other issues", 0, false, "And 2 Machines with other issues", {
        form: "closing",
        text: "And 2 Machines",
        kind: "Machines",
        count: 2,
      }),
    ]);
  });

  it("reads the Pods that the drain of a Machine names, as namespace and name, with no subject", () => {
    const message = [
      "Drain not completed yet (started at 2026-11-25T18:00:00Z):",
      "* Pod default/web-0: deletionTimestamp set, but still not removed from the Node",
      "* Pods default/web-1, default/web-2: waiting for completion",
      "* Pods default/api-1, default/api-2, default/api-3, ... (4 more): failed to evict Pod, timed out",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line(
        "Drain not completed yet (started at 2026-11-25T18:00:00Z):",
        0,
        false,
        "Drain not completed yet (started at 2026-11-25T18:00:00Z):",
      ),
      line(
        "* Pod default/web-0: deletionTimestamp set, but still not removed from the Node",
        0,
        true,
        "Pod default/web-0: deletionTimestamp set, but still not removed from the Node",
      ),
      line(
        "* Pods default/web-1, default/web-2: waiting for completion",
        0,
        true,
        "Pods default/web-1, default/web-2: waiting for completion",
      ),
      line(
        "* Pods default/api-1, default/api-2, default/api-3, ... (4 more): failed to evict Pod, timed out",
        0,
        true,
        "Pods default/api-1, default/api-2, default/api-3, ... (4 more): failed to evict Pod, timed out",
      ),
    ]);
  });

  it("reads a count up to 2^53 - 1, and a line with a larger one as no subject", () => {
    const message = [
      "* Machines a, b, c, ... (9007199254740991 more): at the limit",
      "* Machines a, b, c, ... (9007199254740992 more): past it",
      "And 9007199254740991 Machines at the limit",
      "And 9007199254740992 Machines past it",
    ].join("\n");

    expect(linesOf(message)).toEqual([
      line(
        "* Machines a, b, c, ... (9007199254740991 more): at the limit",
        0,
        true,
        "Machines a, b, c, ... (9007199254740991 more): at the limit",
        {
          form: "aggregate",
          text: "Machines a, b, c, ... (9007199254740991 more):",
          kind: "Machines",
          names: ["a", "b", "c"],
          others: 9007199254740991,
        },
      ),
      line(
        "* Machines a, b, c, ... (9007199254740992 more): past it",
        0,
        true,
        "Machines a, b, c, ... (9007199254740992 more): past it",
      ),
      line("And 9007199254740991 Machines at the limit", 0, false, "And 9007199254740991 Machines at the limit", {
        form: "closing",
        text: "And 9007199254740991 Machines",
        kind: "Machines",
        count: 9007199254740991,
      }),
      line("And 9007199254740992 Machines past it", 0, false, "And 9007199254740992 Machines past it"),
    ]);
  });

  it.todo(
    "for every message of the fixtures of SPEC-0002, as many lines out as in: added with the fixtures, in the third pull request of SPEC-0003",
  );

  it.each([
    ["a number", 3],
    ["null", null],
    ["absent", undefined],
    ["a list", ["* Ready: True"]],
  ])("reads %s as Unknown, and does not throw", (_, value) => {
    expect(parseConditionMessage(value)).toEqual({ state: "unknown" });
  });
});
