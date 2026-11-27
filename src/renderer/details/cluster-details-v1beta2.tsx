/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The details of a Cluster at v1beta2 (SPEC-0004, "The details", P15 to P18, P27, P31, P32), in two places:
//
// - the details of the extension, which a row of the page opens: the `Drawer` of the host that the page renders over
//   its list, with the metadata of the host first, the owners as text and the namespace as the namespace badge (P32);
// - the panel in the details of the host, registered with `kubeObjectDetailItems` at priority 250, after the metadata
//   of the host, without them (P16).
//
// Both show the same content, each section hidden when it has nothing to show and inside an error boundary of its
// own: the row Tree, Status, Control plane, Workers, Infrastructure, Topology, Network and Conditions. Every mark of
// state comes from the status model (SPEC-0003), through the pure functions of `src/common/views/cluster-details.ts`.
// The same content is the details of the root of the tree of a Cluster, with no row Tree, since the tree is under them
// (SPEC-0005, P3, P17).
//
// A view of one Cluster takes its Cluster and its context from the stores of the page when the page reads the
// namespace of the Cluster, and otherwise reads both through stores of its own (P31). It shows its Cluster from those
// stores, and not the object that the host hands the panel, which follows only while a subscription of the host covers
// its namespace. It evaluates the model with the time of each render, and again at the earliest time that a result
// names.
//
// A reference to an object of Cluster API of the Cluster opens the tree of the Cluster at its node, with its details
// (SPEC-0005, P3, P5): the row Tree opens it at its root, and the KubeadmControlPlane, the MachineDeployments, the
// MachinePools, the MachineSets and the worker Machines among the parts, the ClusterClass, and a name in a message that
// names an object of Cluster API of the Cluster that the view read open it at their node; never the details of the
// host, whose menu SPEC-0001, A7 keeps away. An object of a provider that the view read is a link to the details of the
// host, at the version of its contract, which open over the details of the extension. The metadata of the details of
// the extension leave the annotations out of those of the host, and show them in a row of their own, every one but the
// one that `kubectl apply` writes, whose presence alone they say; the topology names its variables, never their values
// (SPEC-0005, P20).

import { Common, Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { annotationsOf } from "../../common/views/annotations";
import {
  clusterDetailsOf,
  readFailuresOf,
  subjectTarget,
  UNREAD_WORDS,
  weightTone,
} from "../../common/views/cluster-details";
import { CLUSTERS_PERMISSION, clusterViewOf } from "../../common/views/cluster-view";
import { clusterPartsOf, StatusMemo } from "../../common/views/context";
import { detailsAddressOf } from "../../common/views/details-address";
import { nameOf, namespaceOf } from "../../common/views/objects";
import { ErrorBoundary } from "../components/error-boundary";
import { Duration, Instant, MarkNote, MarkView } from "../components/marks";
import { CLUSTER_VIEW_KINDS, ClusterNamespaceRead } from "../reads/cluster-namespace-read";
import { mountedPageSource, readsNamespace } from "../reads/cluster-source";
import styles from "./cluster-details.module.scss";

import type { ReactNode } from "react";

import type { ClusterObject, ObjectStatus } from "../../common/status/index";
import type { ShownAnnotations } from "../../common/views/annotations";
import type { ActivityCell, HealthCell, Time, Tone } from "../../common/views/cluster-cells";
import type {
  Answer,
  ClusterDetails,
  ConditionView,
  ControlPlaneSection,
  Counter,
  InfrastructureSection,
  MessageLineView,
  NetworkSection,
  PartRow,
  ReadFailureView,
  ReferenceView,
  StatusSection,
  SubjectTarget,
  ToneSource,
  TopologySection,
  VersionCount,
  WorkersSection,
} from "../../common/views/cluster-details";
import type { ClusterViewState, Holds } from "../../common/views/cluster-view";
import type { ClusterParts } from "../../common/views/context";
import type { Cluster } from "../api/cluster/cluster-v1beta2";
import type { ClusterSource } from "../reads/cluster-source";

const {
  Component: {
    Badge,
    DrawerItem,
    DrawerTitle,
    KubeObjectMeta,
    LocaleDate,
    MaybeLink,
    NamespaceSelectBadge,
    Spinner,
    Table,
    TableCell,
    TableHead,
    TableRow,
    WithTooltip,
  },
  Navigation,
} = Renderer;

// The fields of the metadata that the host renders, in its order (kube-object-meta.tsx, at v2.1.0). The details of
// the extension render them in three parts, each with `hideFields` that leaves out every other field, so
// that the namespace, as the namespace badge, and the owners, as text, take the places that the host gives them,
// after the name and after the finalizers, in rows of their own (P32). The three that the host hides by default, which
// the prop replaces, stay hidden.
const META_FIELDS = [
  "creationTimestamp",
  "deletionTimestamp",
  "name",
  "namespace",
  "uid",
  "selfLink",
  "resourceVersion",
  "labels",
  "annotations",
  "finalizers",
  "ownerReferences",
  "managedFields",
] as const satisfies readonly Renderer.K8sApi.KubeMetaField[];

export type MetaField = (typeof META_FIELDS)[number];

export function HostMeta({ object, shown }: { object: Renderer.K8sApi.KubeObject; shown: readonly MetaField[] }) {
  return <KubeObjectMeta object={object} hideFields={META_FIELDS.filter((field) => !shown.includes(field))} />;
}

// The marks of a row of the details, side by side; unlike a cell of the list, a row of the details may take two lines.
export function Marks({ children }: { children: ReactNode }) {
  return <span className={styles.marks}>{children}</span>;
}

// What the view of one Cluster needs of the place that shows it.
export interface ViewHost {
  readonly extension: Renderer.LensExtension;
  // Opens the details of another Cluster, through the parameter of the page (P6).
  readonly openCluster: (namespace: string, name: string) => void;
  // Opens the tree of a Cluster, at a node with its details when one is named, by the address of the page of the tree
  // (SPEC-0005, P2, P3, P5); inside the page of the tree, a node of its Cluster is selected there, with no navigation.
  readonly openTree: (namespace: string, name: string, node?: string) => void;
}

// A button of the details that opens something of the extension: underlined, as the links of the details are, and a
// click on it stops at it, so that what holds it does not handle it as well.
export function TextButton({ onOpen, children, testId }: { onOpen: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      className={styles.textButton}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {children}
    </button>
  );
}

// What the names of the subjects of a message open, and how: the details of another Cluster, a node of the tree, or the
// details of the host of an object of a provider (P18; SPEC-0005, P5).
export interface MessageLinks {
  readonly target: (kind: string, name: string) => SubjectTarget;
  readonly openCluster: (namespace: string, name: string) => void;
  readonly openNode: (node: string) => void;
}

// The lines of a message as the project wrote them, each with its bullet, nested as the parser gives them, and the
// names of a subject as P18 shows them (SPEC-0003, P27).
export function Lines({ lines, links }: { lines: readonly MessageLineView[]; links: MessageLinks }) {
  if (lines.length === 0) return null;
  return (
    <ul className={styles.lines}>
      {lines.map((line, index) => (
        <li key={`${index}-${line.text}`}>
          <Line line={line} links={links} />
          <Lines lines={line.children} links={links} />
        </li>
      ))}
    </ul>
  );
}

function SubjectName({ kind, name, links }: { kind: string; name: string; links: MessageLinks }) {
  const target = links.target(kind, name);

  switch (target.form) {
    case "cluster":
      return <TextButton onOpen={() => links.openCluster(target.namespace, target.name)}>{name}</TextButton>;
    case "tree":
      return <TextButton onOpen={() => links.openNode(target.node)}>{name}</TextButton>;
    case "host":
      return (
        <MaybeLink to={Navigation.getDetailsUrl(target.selfLink)} onClick={(event) => event.stopPropagation()}>
          {name}
        </MaybeLink>
      );
    case "text":
      return <>{name}</>;
  }
}

function Line({ line, links }: { line: MessageLineView; links: MessageLinks }) {
  const bullet = line.bullet ? "* " : "";
  const { subject } = line;

  if (subject === undefined) return <span data-testid="capi-details-line">{`${bullet}${line.text}`}</span>;

  // The subject, `<Kind> <names>` and what follows the names in it, then the rest of the line, as written.
  const names = subject.names.join(", ");
  const afterNames = line.text.slice(subject.kind.length + 1 + names.length, subject.length);

  return (
    <span data-testid="capi-details-line">
      {`${bullet}${subject.kind} `}
      {subject.names.map((name, index) => (
        <React.Fragment key={name}>
          {index === 0 ? "" : ", "}
          <SubjectName kind={subject.kind} name={name} links={links} />
        </React.Fragment>
      ))}
      {afterNames}
      {line.text.slice(subject.length)}
    </span>
  );
}

// When something began, as an instant, and as a duration too for a mark of freshness (SPEC-0003, "Freshness").
export function Since({ since, lasting = false }: { since: Time | undefined; lasting?: boolean }) {
  if (since === undefined) return null;
  return (
    <span className={styles.since} data-testid="capi-details-since">
      {" since "}
      <Instant since={since} />
      {lasting ? (
        <>
          {", "}
          <Duration since={since} />
        </>
      ) : null}
    </span>
  );
}

export function Deprecated() {
  return <Badge small className={styles.label} label="deprecated" />;
}

export function Pending() {
  return <Spinner data-testid="capi-details-spinner" />;
}

export function HealthMark({ cell, testId }: { cell: HealthCell; testId: string }) {
  if (cell.mark === undefined) {
    return (
      <WithTooltip
        tooltip={cell.none === "deleting" ? "No health: it is deleting" : "No health: its kind has no status"}
        expandable={false}
        data-testid={testId}
      >
        N/A
      </WithTooltip>
    );
  }
  return <MarkView mark={cell.mark} data-testid={testId} />;
}

export function ActivityMarks({ cell, testId }: { cell: ActivityCell; testId: string }) {
  return (
    <Marks>
      {cell.marks.map((mark, index) => (
        <MarkView key={`${mark.word}-${index}`} mark={mark} data-testid={testId} />
      ))}
    </Marks>
  );
}

// The duration of a threshold, in the compact form of the host.
function threshold(seconds: number): string {
  return Common.Util.formatDuration(seconds * 1000);
}

// What a read that failed says (P25): that the kind could not be read, after a load that failed, and that it could not
// be read again, after a refresh that failed, an event of the past with its time.
function HoldWords({ noun, load, refresh }: { noun: string } & Holds) {
  return (
    <div>
      {load === undefined ? null : `The ${noun} could not be read`}
      {refresh === undefined ? null : (
        <>
          {load === undefined ? `The ${noun} could not be read again, at ` : ", and could not be read again at "}
          <LocaleDate date={new Date(refresh.at)} />
        </>
      )}
    </div>
  );
}

// The message of each answer, as the cluster wrote it, and the permission that a refusal takes.
function FailureMessages({ holds, permission }: { holds: Holds; permission: string }) {
  const failures = [...(holds.load?.failures ?? []), ...(holds.refresh?.failures ?? [])];

  return (
    <>
      {failures.map((failure, index) => (
        <p key={`failure-${index}`} className={styles.message}>
          {failure.message}
        </p>
      ))}
      {failures.some((failure) => failure.refused) ? <p>{`Reading them takes ${permission}.`}</p> : null}
    </>
  );
}

// A read of the namespace of the Cluster that failed (P25).
function ReadFailureLines({ view }: { view: ReadFailureView }) {
  const { descriptor } = view;

  return (
    <div className={styles.failure} data-testid="capi-details-read-failure">
      <HoldWords noun={descriptor.noun} load={view.load} refresh={view.refresh} />
      <FailureMessages
        holds={view}
        permission={`get, list and watch on ${descriptor.resource} of ${descriptor.group}`}
      />
    </div>
  );
}

const PAUSE_WORDS = {
  "spec.paused": "Paused by spec.paused, which reaches the Cluster and every object of it",
  annotation: "Paused by the annotation cluster.x-k8s.io/paused, which reaches the Cluster alone",
  both: "Paused by spec.paused, which reaches the Cluster and every object of it, and by the annotation cluster.x-k8s.io/paused",
} as const;

export function ToneRow({ status }: { status: { readonly toneSource: ToneSource | undefined } }) {
  const source = status.toneSource;

  if (source === undefined) return null;

  // The object that the activity is on: the one that makes it hold, else the one that holds it.
  const on = source.activity.source ?? source.heldBy;
  const holder = on.kind === undefined ? "" : ` of ${on.kind} ${on.name ?? ""}`;
  const limit =
    source.seconds === undefined
      ? ", whose start the project did not write, which counts as past its threshold"
      : source.tone === "progress"
        ? `: a warning after ${threshold(source.seconds)}`
        : `: past its threshold of ${threshold(source.seconds)}`;

  return (
    <DrawerItem name="Tone" data-testid="capi-details-tone">
      {source.tone === "progress" ? "In the tone of progress" : "In the tone of a warning"}
      {`, set by ${source.activity.name}${holder}${limit}`}
      {source.tone === "progress" && source.passesAt !== undefined ? (
        <>
          {", at "}
          <LocaleDate date={new Date(source.passesAt)} />
        </>
      ) : null}
    </DrawerItem>
  );
}

// The issues of a health: a condition with its reason, a MachinePool with its health, a Machine with its condition, or
// a resource of a ClusterResourceSet with its state.
export function IssuesRow({ issues }: { issues: StatusSection["issues"] }) {
  if (issues.length === 0) return null;
  return (
    <DrawerItem name="Issues" data-testid="capi-details-issues">
      {issues.map((issue, index) => (
        <div key={`issue-${index}`} data-testid="capi-details-issue">
          {issue.form === "condition"
            ? `${issue.type}: ${issue.condition?.status ?? "not written"}${issue.condition?.reason === undefined ? "" : `, ${issue.condition.reason}`}`
            : issue.form === "machine-pool"
              ? `MachinePool ${issue.name ?? ""}: ${issue.health}`
              : issue.form === "machine"
                ? `Machine ${issue.name ?? ""}: ${issue.condition.type} ${issue.condition.status ?? ""}`
                : `${issue.kind} ${issue.name}: ${issue.state}`}
        </div>
      ))}
    </DrawerItem>
  );
}

export function NotesRow({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <DrawerItem name="Notes" data-testid="capi-details-notes">
      {notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
    </DrawerItem>
  );
}

// The failure fields of the deprecated status, with their label (SPEC-0001, A5).
export function FailureRows({ failure }: { failure: StatusSection["failure"] }) {
  return (
    <>
      {failure?.reason === undefined ? null : (
        <DrawerItem name="Failure reason" data-testid="capi-details-failure-reason">
          {failure.reason}
          <Deprecated />
        </DrawerItem>
      )}
      {failure?.message === undefined ? null : (
        <DrawerItem name="Failure message" data-testid="capi-details-failure-message">
          <span className={styles.message}>{failure.message}</span>
          <Deprecated />
        </DrawerItem>
      )}
    </>
  );
}

function StatusView({ details, links }: { details: ClusterDetails; links: MessageLinks }) {
  const status = details.status;
  const { health, summary } = status;

  return (
    <div data-testid="capi-details-section-status">
      <DrawerTitle>Status</DrawerTitle>
      <DrawerItem name="Health">
        {details.pending ? (
          <Pending />
        ) : (
          <Marks>
            <HealthMark cell={health} testId="capi-details-health" />
            {/* The mark of freshness next to the health, as in the list; its causes are in the row of freshness. */}
            {health.stale.length === 0 ? null : (
              <MarkView mark={{ word: "stale", tone: "vague" }} data-testid="capi-details-health-stale" />
            )}
            {health.poolsUnknown === 0 ? null : (
              <MarkNote>
                {health.poolsUnknown === 1 ? "1 MachinePool" : `${health.poolsUnknown} MachinePools`} of unknown health
              </MarkNote>
            )}
          </Marks>
        )}
      </DrawerItem>
      {status.restsOnType === undefined ? null : (
        <DrawerItem name="Rests on" data-testid="capi-details-rests-on">
          {status.restsOn === undefined
            ? `${status.restsOnType}, not written yet`
            : `${status.restsOnType}: ${status.restsOn.status ?? "N/A"}`}
        </DrawerItem>
      )}
      {details.pending ? null : <ToneRow status={status} />}
      <DrawerItem name="Activities">
        {details.pending ? (
          <Pending />
        ) : (
          <div className={styles.activities}>
            {status.activities.map((view) => (
              <div key={view.activity.name} data-testid="capi-details-activity-row">
                <MarkView mark={view.mark} data-testid="capi-details-activity" />
                <Since since={view.since} />
                {view.source === undefined ? null : (
                  <span>{` from ${view.source.kind ?? ""} ${view.source.name ?? ""}`}</span>
                )}
                {view.pause === undefined ? null : (
                  <div data-testid="capi-details-pause">{PAUSE_WORDS[view.pause]}</div>
                )}
                {view.stage === undefined ? null : (
                  <div data-testid="capi-details-stage">
                    {view.activity.name === "Deleting" ? "Stage: " : "TopologyReconciled: "}
                    {view.stage.reason ?? "N/A"}
                    <Lines lines={view.stage.lines} links={links} />
                  </div>
                )}
              </div>
            ))}
            {status.otherActivities.length === 0 ? null : (
              <Marks>
                {status.otherActivities.map((mark) => (
                  <MarkView key={mark.word} mark={mark} data-testid="capi-details-activity" />
                ))}
              </Marks>
            )}
          </div>
        )}
      </DrawerItem>
      {details.pending || (health.stale.length === 0 && status.reads.length === 0) ? null : (
        <DrawerItem name="Freshness" data-testid="capi-details-freshness">
          {health.stale.map((cause) => (
            <div key={cause.cause} data-testid="capi-details-stale">
              <MarkView mark={{ word: "stale", tone: "vague" }} />
              {` ${cause.cause}`}
              {cause.detail === undefined ? "" : `, ${cause.detail}`}
              <Since since={cause.since} lasting />
            </div>
          ))}
          {status.reads.map((view) => (
            <ReadFailureLines key={view.descriptor.kind} view={view} />
          ))}
        </DrawerItem>
      )}
      {summary === undefined ? null : (
        <DrawerItem name="Summary" data-testid="capi-details-summary">
          <div>
            {`Available: ${summary.status ?? "N/A"}, ${summary.reason ?? "N/A"}`}
            <Since since={status.summarySince} />
          </div>
          <Lines lines={status.summaryLines} links={links} />
        </DrawerItem>
      )}
      {details.pending ? null : <IssuesRow issues={status.issues} />}
      {details.pending ? null : <NotesRow notes={status.notes} />}
      {status.phase === undefined ? null : (
        <DrawerItem name="Phase" data-testid="capi-details-phase">
          {status.phase.written}
          {status.phase.deprecated ? <Deprecated /> : null}
          <p className={styles.remark}>The project tells no software to decide on the phase of a Cluster.</p>
        </DrawerItem>
      )}
      <FailureRows failure={status.failure} />
    </div>
  );
}

// A reference: to an object of Cluster API, a button that opens the tree of the Cluster at its node, read or not,
// since the tree holds a row for it and says why when it cannot read it (SPEC-0005, P5, P12); to an object of a
// provider, a link to the details of the host when the view read it, and otherwise its kind and its name as text, with
// its group, and why it opens nothing, in its tooltip (P18).
function ReferenceText({
  reference,
  testId,
  openNode,
}: {
  reference: ReferenceView;
  testId: string;
  openNode: (node: string) => void;
}) {
  const { kind, name, group, read } = reference;
  const { node } = reference;

  if (node !== undefined) {
    return (
      <span data-testid={testId}>
        {`${kind} `}
        <TextButton onOpen={() => openNode(node)}>{name}</TextButton>
      </span>
    );
  }
  if (reference.selfLink !== undefined) {
    return (
      <span data-testid={testId}>
        {`${kind} `}
        <MaybeLink to={Navigation.getDetailsUrl(reference.selfLink)} onClick={(event) => event.stopPropagation()}>
          {name}
        </MaybeLink>
      </span>
    );
  }

  const why = read.state === "unread" ? UNREAD_WORDS[read.reason] : undefined;

  return (
    <WithTooltip tooltip={why === undefined ? group : `${group}. ${why}`} expandable={false} data-testid={testId}>
      {`${kind} ${name}`}
    </WithTooltip>
  );
}

// The rows of a reference: the object, and its health, with its activities for the control plane; the infrastructure
// cluster shows its health alone, as "The details" give it.
function ReferenceRows({
  reference,
  testId,
  openNode,
  activities = true,
}: {
  reference: ReferenceView;
  testId: string;
  openNode: (node: string) => void;
  activities?: boolean;
}) {
  const { read } = reference;

  return (
    <>
      <DrawerItem name="Object">
        <ReferenceText reference={reference} testId={testId} openNode={openNode} />
      </DrawerItem>
      {read.state === "pending" || (read.state === "found" && read.part.pending) ? (
        <DrawerItem name="Health">
          <Pending />
        </DrawerItem>
      ) : read.state === "unread" ? (
        <DrawerItem name="Health" data-testid={`${testId}-unread`}>
          {read.reason === "not-found" ? UNREAD_WORDS[read.reason] : `Not read. ${UNREAD_WORDS[read.reason]}`}
          {read.failures.map((failure, index) => (
            <p key={`failure-${index}`} className={styles.message}>
              {failure.message}
            </p>
          ))}
        </DrawerItem>
      ) : (
        <>
          <DrawerItem name="Health">
            <HealthMark cell={read.health} testId={`${testId}-health`} />
          </DrawerItem>
          {activities ? (
            <DrawerItem name="Activities">
              <ActivityMarks cell={read.activity} testId={`${testId}-activity`} />
            </DrawerItem>
          ) : null}
        </>
      )}
    </>
  );
}

function machines(count: number): string {
  return count === 1 ? "1 Machine" : `${count} Machines`;
}

export function CountersRow({ counters }: { counters: readonly Counter[] | undefined }) {
  if (counters === undefined) return null;
  return (
    <DrawerItem name="Machines" data-testid="capi-details-counters">
      {counters.map((counter, index) => (
        <React.Fragment key={counter.label}>
          {index === 0 ? "" : ", "}
          {counter.count === undefined ? (
            <WithTooltip tooltip="Not written yet" expandable={false}>{`N/A ${counter.label}`}</WithTooltip>
          ) : (
            `${counter.count} ${counter.label}`
          )}
        </React.Fragment>
      ))}
    </DrawerItem>
  );
}

function VersionsRow({ versions }: { versions: readonly VersionCount[] }) {
  if (versions.length === 0) return null;
  return (
    <DrawerItem name="Versions" data-testid="capi-details-versions">
      {versions
        .map((entry) =>
          entry.replicas === undefined ? entry.version : `${entry.version}: ${machines(entry.replicas)}`,
        )
        .join(", ")}
    </DrawerItem>
  );
}

// Yes, No or Unknown (P27): in the tone of the weight of the condition it reads, when it reads one.
export function AnswerView({ answer, tone }: { answer: Answer; tone?: Tone }) {
  const word =
    tone === undefined ? (
      <span data-testid="capi-details-answer">{answer.answer}</span>
    ) : (
      <MarkView mark={{ word: answer.answer, tone }} data-testid="capi-details-answer" />
    );

  if (answer.answer === "Yes") {
    return (
      <>
        {word}
        <Since since={answer.since} />
      </>
    );
  }
  if (answer.answer === "No") {
    return (
      <>
        {word}
        {answer.reason === undefined ? null : ` (${answer.reason})`}
      </>
    );
  }
  return (
    <>
      <WithTooltip
        tooltip={answer.written ? `Reason: ${answer.reason ?? "N/A"}` : "This Cluster reports none yet"}
        expandable={false}
      >
        {word}
      </WithTooltip>
      {answer.written && answer.reason !== undefined ? ` (${answer.reason})` : null}
    </>
  );
}

// One row for each part (P17): its kind, and its name, a button that opens the tree of the Cluster at its node
// (SPEC-0005, P5), what the model computes for it, and the available replicas of the desired.
function PartsTable({
  rows,
  testId,
  openNode,
}: {
  rows: readonly PartRow[];
  testId: string;
  openNode: (node: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <Table className={styles.table} scrollable={false} data-testid={testId}>
      <TableHead flat sticky={false}>
        <TableCell className={styles.kind}>Kind</TableCell>
        <TableCell className={styles.partName}>Name</TableCell>
        <TableCell className={styles.health}>Health</TableCell>
        <TableCell className={styles.activity}>Activity</TableCell>
        <TableCell className={styles.replicas}>Available</TableCell>
      </TableHead>
      {rows.map((row) => (
        <TableRow key={`${row.kind}/${row.name}`} data-testid="capi-details-part">
          <TableCell className={styles.kind}>{row.kind}</TableCell>
          <TableCell className={styles.partName}>
            <WithTooltip tooltip={row.name} expandable={false} data-testid="capi-details-part-name">
              <TextButton onOpen={() => openNode(row.node)}>{row.name}</TextButton>
            </WithTooltip>
          </TableCell>
          <TableCell className={styles.health}>
            {row.pending ? <Pending /> : <HealthMark cell={row.health} testId="capi-details-part-health" />}
          </TableCell>
          <TableCell className={styles.activity}>
            {row.pending ? <Pending /> : <ActivityMarks cell={row.activity} testId="capi-details-part-activity" />}
          </TableCell>
          <TableCell className={styles.replicas} data-testid="capi-details-part-replicas">
            {row.available === undefined && row.desired === undefined
              ? "N/A"
              : `${row.available ?? "N/A"}/${row.desired ?? "N/A"}`}
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
}

function ControlPlaneView({ section, openNode }: { section: ControlPlaneSection; openNode: (node: string) => void }) {
  const rows = section.machines;

  return (
    <div data-testid="capi-details-section-control-plane">
      <DrawerTitle>Control plane</DrawerTitle>
      {section.reference === undefined ? null : (
        <ReferenceRows
          reference={section.reference}
          testId="capi-details-control-plane-reference"
          openNode={openNode}
        />
      )}
      {rows === undefined ? null : rows.state === "rows" ? (
        <PartsTable rows={rows.rows} testId="capi-details-control-plane-machines" openNode={openNode} />
      ) : rows.state === "pending" ? (
        <Pending />
      ) : (
        <p className={styles.remark}>Its control plane Machines could not be read.</p>
      )}
      <CountersRow counters={section.counters} />
      <VersionsRow versions={section.versions} />
      <DrawerItem name="Initialized" data-testid="capi-details-initialized">
        <AnswerView
          answer={section.initialized}
          tone={section.initializedCondition === undefined ? "vague" : weightTone(section.initializedCondition.weight)}
        />
      </DrawerItem>
      {section.endpoint === undefined ? null : (
        <DrawerItem name="Endpoint" data-testid="capi-details-endpoint">
          {section.endpoint}
        </DrawerItem>
      )}
    </div>
  );
}

function WorkersView({ section, openNode }: { section: WorkersSection; openNode: (node: string) => void }) {
  return (
    <div data-testid="capi-details-section-workers">
      <DrawerTitle>Workers</DrawerTitle>
      <CountersRow counters={section.counters} />
      <VersionsRow versions={section.versions} />
      <PartsTable rows={section.rows} testId="capi-details-workers" openNode={openNode} />
      {section.pending ? <Pending /> : null}
      {section.unread ? <p className={styles.remark}>Some of its parts could not be read.</p> : null}
      {section.rows
        .filter((row) => row.withoutMachines)
        .map((pool) => (
          <p key={pool.name} className={styles.remark} data-testid="capi-details-pool-remark">
            {`MachinePool ${pool.name} has no Machines: its counters count the instances of its provider, whatever the readiness of their Nodes.`}
          </p>
        ))}
    </div>
  );
}

function InfrastructureView({
  section,
  openNode,
}: {
  section: InfrastructureSection;
  openNode: (node: string) => void;
}) {
  return (
    <div data-testid="capi-details-section-infrastructure">
      <DrawerTitle>Infrastructure</DrawerTitle>
      {section.reference === undefined ? null : (
        <ReferenceRows
          reference={section.reference}
          testId="capi-details-infrastructure-reference"
          openNode={openNode}
          activities={false}
        />
      )}
      <DrawerItem name="Provisioned" data-testid="capi-details-provisioned">
        <AnswerView answer={section.provisioned} />
      </DrawerItem>
      {section.failureDomains.length === 0 ? null : (
        <DrawerItem name="Failure domains" data-testid="capi-details-failure-domains">
          {section.failureDomains.map((domain) => (
            <div key={domain.name}>
              {domain.name}
              {domain.controlPlane === true ? ", for the control plane" : ", not for the control plane"}
            </div>
          ))}
        </DrawerItem>
      )}
    </div>
  );
}

function Replicas({ count }: { count: number | undefined }) {
  return count === undefined ? (
    <WithTooltip tooltip="The topology does not set it" expandable={false}>
      N/A
    </WithTooltip>
  ) : (
    <>{String(count)}</>
  );
}

function TopologyView({ section, openNode }: { section: TopologySection; openNode: (node: string) => void }) {
  return (
    <div data-testid="capi-details-section-topology">
      <DrawerTitle>Topology</DrawerTitle>
      <DrawerItem name="Class" data-testid="capi-details-class">
        <TextButton onOpen={() => openNode(section.classNode)}>
          {section.classNamespace === undefined ? section.className : `${section.classNamespace}/${section.className}`}
        </TextButton>
      </DrawerItem>
      {section.version === undefined ? null : <DrawerItem name="Version">{section.version}</DrawerItem>}
      <DrawerItem name="Control plane replicas">
        <Replicas count={section.controlPlaneReplicas} />
      </DrawerItem>
      {section.parts.map((part) => (
        <DrawerItem
          key={`${part.kind}/${part.name}`}
          name={`${part.kind} ${part.name}`}
          data-testid="capi-details-topology-part"
        >
          {`Class ${part.className}, replicas `}
          <Replicas count={part.replicas} />
        </DrawerItem>
      ))}
      {section.variableNames.length === 0 ? null : (
        <DrawerItem name="Variables" data-testid="capi-details-variables">
          {section.variableNames.join(", ")}
        </DrawerItem>
      )}
      <DrawerItem name="Pending hooks" data-testid="capi-details-hooks">
        {section.hooks === undefined
          ? "The annotation of the pending hooks holds no list"
          : section.hooks.items.length === 0
            ? "None"
            : section.hooks.items.map((item, index) => (
                <React.Fragment key={item.name}>
                  {index === 0 ? "" : ", "}
                  {item.name}
                  {item.known ? "" : " (unknown)"}
                </React.Fragment>
              ))}
      </DrawerItem>
    </div>
  );
}

function NetworkView({ section }: { section: NetworkSection }) {
  return (
    <div data-testid="capi-details-section-network">
      <DrawerTitle>Network</DrawerTitle>
      {section.apiServerPort === undefined ? null : (
        <DrawerItem name="API server port">{String(section.apiServerPort)}</DrawerItem>
      )}
      {section.pods.length === 0 ? null : <DrawerItem name="Pods">{section.pods.join(", ")}</DrawerItem>}
      {section.services.length === 0 ? null : <DrawerItem name="Services">{section.services.join(", ")}</DrawerItem>}
      {section.serviceDomain === undefined ? null : (
        <DrawerItem name="Service domain">{section.serviceDomain}</DrawerItem>
      )}
    </div>
  );
}

// A name with a chance to break between its words, as `ControlPlaneMachinesUpToDate` before each capital that follows
// a lowercase letter or a digit, or after a `.`, `-`, `_` or `/`, so that a long one wraps in the column of the labels
// (the stylesheet says why); the text stays the name as written.
function Breakable({ text }: { text: string }) {
  const words = text.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[./_-])/);

  return (
    <>
      {words.map((word, index) => (
        <React.Fragment key={`${index}-${word}`}>
          {index === 0 ? null : <wbr />}
          {word}
        </React.Fragment>
      ))}
    </>
  );
}

// Each condition in the order that the controllers keep, with its weight as a mark, a negative one at rest never in
// the tone of an issue (SPEC-0001, H3).
export function ConditionsView({ conditions, links }: { conditions: readonly ConditionView[]; links: MessageLinks }) {
  return (
    <div data-testid="capi-details-section-conditions">
      <DrawerTitle>Conditions</DrawerTitle>
      {conditions.map((view) => {
        const { condition } = view;

        return (
          <DrawerItem
            key={condition.type}
            name={<Breakable text={condition.type} />}
            className={styles.condition}
            data-testid="capi-details-condition"
          >
            <Marks>
              <MarkView
                mark={{ word: condition.weight, tone: weightTone(condition.weight) }}
                data-testid="capi-details-weight"
              />
              <span>{`${condition.status ?? "N/A"}, ${condition.reason ?? "N/A"}`}</span>
              {condition.olderGeneration ? (
                <MarkView
                  mark={{ word: "older generation", tone: "vague" }}
                  data-testid="capi-details-older-generation"
                />
              ) : null}
            </Marks>
            <Since since={view.since} />
            <Lines lines={view.lines} links={links} />
          </DrawerItem>
        );
      })}
    </div>
  );
}

// The annotations that the details show in a row of their own, in place of those of the metadata of the host (SPEC-0005,
// P20): every one but those that they hold and do not show, whose presence alone they say.
export function AnnotationsRow({ annotations }: { annotations: ShownAnnotations }) {
  if (annotations.shown.length === 0 && annotations.held.length === 0) return null;
  return (
    <DrawerItem name="Annotations" data-testid="capi-details-annotations">
      {annotations.shown.map(({ key, value }) => (
        <div key={key} className={styles.annotation}>{`${key}=${value}`}</div>
      ))}
      {annotations.held.map((key) => (
        <div key={key} className={styles.annotation} data-testid="capi-details-annotation-held">
          {`${key}: held, and not shown, since it copies the spec of the object as it was applied`}
        </div>
      ))}
    </DrawerItem>
  );
}

// The metadata of the host, with the namespace as its badge, which selects it in the filter, the owners as text, each
// where the host puts it (P32), and the annotations in a row of their own, after the labels (SPEC-0005, P20).
function MetadataView({ cluster }: { cluster: Renderer.K8sApi.KubeObject }) {
  const owners = cluster.getOwnerRefs();
  const namespace = cluster.getNs();

  return (
    <div data-testid="capi-details-section-metadata">
      <HostMeta object={cluster} shown={["creationTimestamp", "deletionTimestamp", "name"]} />
      {namespace === undefined ? null : (
        <DrawerItem name="Namespace" data-testid="capi-details-namespace">
          <NamespaceSelectBadge namespace={namespace} />
        </DrawerItem>
      )}
      <HostMeta object={cluster} shown={["labels"]} />
      <AnnotationsRow annotations={annotationsOf(cluster as unknown as ClusterObject)} />
      <HostMeta object={cluster} shown={["finalizers"]} />
      {owners.length === 0 ? null : (
        <DrawerItem name="Controlled By" data-testid="capi-details-owners">
          {owners.map((owner) => (
            <p key={`${owner.kind}/${owner.name}`}>{`${owner.kind} ${owner.name}`}</p>
          ))}
        </DrawerItem>
      )}
      <HostMeta object={cluster} shown={["managedFields"]} />
    </div>
  );
}

export function Section({ host, resetKey, children }: { host: ViewHost; resetKey: unknown; children: ReactNode }) {
  return (
    <ErrorBoundary extension={host.extension} resetKey={resetKey}>
      {children}
    </ErrorBoundary>
  );
}

interface ViewStateProps {
  readonly namespace: string;
  readonly name: string;
  readonly view: Exclude<ClusterViewState<ClusterObject>, { state: "found" }>;
}

// The state of a view whose Cluster is not shown: still loading, not found, or a namespace that could not be read.
function ViewState({ namespace, name, view }: ViewStateProps) {
  if (view.state === "pending") return <Spinner center data-testid="capi-details-loading" />;
  if (view.state === "not-found") {
    return (
      <div className={styles.state} role="status" data-testid="capi-details-not-found">
        {`No Cluster ${detailsAddressOf(namespace, name)} is in the namespace ${namespace}, which was read.`}
      </div>
    );
  }
  return (
    <div className={styles.state} role="status" data-testid="capi-details-not-read">
      {view.refused && view.refresh === undefined ? (
        <div>{`The namespace ${namespace} cannot be read: you may not list its Clusters.`}</div>
      ) : (
        <HoldWords noun={`Clusters of the namespace ${namespace}`} load={view.load} refresh={view.refresh} />
      )}
      <FailureMessages
        holds={view}
        permission={`${CLUSTERS_PERMISSION}, in that namespace or over the whole cluster`}
      />
    </div>
  );
}

// The statuses of the Cluster and of each of its parts, for the time that they name.
function statusesOf(parts: ClusterParts): ObjectStatus[] {
  const single = [parts.controlPlane, parts.infrastructure].flatMap((part) =>
    part === undefined || typeof part === "string" ? [] : [part.status],
  );
  const lists = [
    parts.machineDeployments,
    parts.machinePools,
    parts.machineSets,
    parts.workerMachines,
    parts.controlPlaneMachines,
  ].flatMap((found) => (found === undefined || typeof found === "string" ? [] : found.map((part) => part.status)));

  return [parts.row.status, ...single, ...lists];
}

export interface ClusterViewProps {
  readonly source: ClusterSource;
  readonly namespace: string;
  readonly name: string;
  readonly host: ViewHost;
  // The metadata of the host, which the details of the extension show and the panel leaves to the host (P16, P32).
  readonly metadata: boolean;
  // The details of the root of the tree of the Cluster, which leave out the row Tree, since the tree is under them
  // (SPEC-0005, P3, P17).
  readonly inTree?: boolean;
}

interface ContentProps extends ClusterViewProps {
  readonly cluster: ClusterObject;
}

// The row Tree, before the Status (SPEC-0005, P3): a button that opens the page of the tree on the Cluster.
function TreeRowView({ namespace, name, host }: { namespace: string; name: string; host: ViewHost }) {
  return (
    <div data-testid="capi-details-section-tree">
      <DrawerItem name="Tree" data-testid="capi-details-tree">
        <TextButton onOpen={() => host.openTree(namespace, name)} testId="capi-details-open-tree">
          Open the tree of this Cluster
        </TextButton>
      </DrawerItem>
    </div>
  );
}

// The sections of the details of a Cluster that the view found, each inside an error boundary of its own.
const ClusterContent = observer(({ source, namespace, name, cluster, host, metadata, inTree }: ContentProps) => {
  const [memo] = useState(() => new StatusMemo());
  const [, setTick] = useState(0);
  const now = Date.now();

  memo.sweep();

  // The indexes of the source, built again only when what they read changes; those of the page when the details take
  // its reads.
  const index = source.index();
  const parts = clusterPartsOf(index, cluster, now, memo);
  // The Cluster is found, so its namespace was read: a hold of the Clusters, from a read of another namespace, is no
  // failure of these details (P25).
  const clustersKey = source.clusters().key;
  const failures = readFailuresOf(
    source.reads,
    source.kinds().filter((kind) => kind.key !== clustersKey),
    namespace,
  );
  // The Clusters that the view read in the namespace of the Cluster, which a message may name as a link (P18).
  const readClusters = source
    .clusters()
    .items.filter((item) => namespaceOf(item) === namespace)
    .flatMap((item) => nameOf(item) ?? []);
  const details = clusterDetailsOf(parts, index, failures, readClusters);
  // A node of the tree of this Cluster, with its details (SPEC-0005, P5).
  const openNode = (node: string) => host.openTree(namespace, name, node);
  const links: MessageLinks = {
    target: (kind, subject) => subjectTarget(details, kind, subject),
    openCluster: host.openCluster,
    openNode,
  };
  const next = statusesOf(parts)
    .map((status) => status.changesAt)
    .filter((instant): instant is number => instant !== undefined && instant > now)
    .reduce<number | undefined>(
      (earliest, instant) => (earliest === undefined ? instant : Math.min(earliest, instant)),
      undefined,
    );

  // The model is evaluated again at the earliest time that a result names, and not at every tick.
  useEffect(() => {
    if (next === undefined) return undefined;

    const timer = setTimeout(() => setTick((tick) => tick + 1), Math.max(0, next - Date.now()));

    return () => clearTimeout(timer);
  }, [next]);

  return (
    <>
      {metadata ? (
        <Section host={host} resetKey={cluster}>
          <MetadataView cluster={cluster as unknown as Renderer.K8sApi.KubeObject} />
        </Section>
      ) : null}
      {inTree === true ? null : (
        <Section host={host} resetKey={cluster}>
          <TreeRowView namespace={namespace} name={name} host={host} />
        </Section>
      )}
      <Section host={host} resetKey={cluster}>
        <StatusView details={details} links={links} />
      </Section>
      {details.controlPlane === undefined ? null : (
        <Section host={host} resetKey={cluster}>
          <ControlPlaneView section={details.controlPlane} openNode={openNode} />
        </Section>
      )}
      {details.workers === undefined ? null : (
        <Section host={host} resetKey={cluster}>
          <WorkersView section={details.workers} openNode={openNode} />
        </Section>
      )}
      {details.infrastructure === undefined ? null : (
        <Section host={host} resetKey={cluster}>
          <InfrastructureView section={details.infrastructure} openNode={openNode} />
        </Section>
      )}
      {details.topology === undefined ? null : (
        <Section host={host} resetKey={cluster}>
          <TopologyView section={details.topology} openNode={openNode} />
        </Section>
      )}
      {details.network === undefined ? null : (
        <Section host={host} resetKey={cluster}>
          <NetworkView section={details.network} />
        </Section>
      )}
      {details.conditions === undefined ? null : (
        <Section host={host} resetKey={cluster}>
          <ConditionsView conditions={details.conditions} links={links} />
        </Section>
      )}
    </>
  );
});

// The view of one Cluster: its state, or its sections, from the reads of a source. The sections render inside an
// error boundary of their own, with the Cluster as its key of reset, which the host replaces when the Cluster changes,
// so that an error in the details leaves the list (P15).
export const ClusterView = observer((props: ClusterViewProps) => {
  const { source, namespace, name, host } = props;
  const view = clusterViewOf(source.reads, source.clusters(), namespace, name);

  return (
    <div className={styles.details} data-testid="capi-cluster-details-view">
      {view.state === "found" ? (
        <ErrorBoundary extension={host.extension} resetKey={view.cluster}>
          <ClusterContent {...props} cluster={view.cluster} />
        </ErrorBoundary>
      ) : (
        <ViewState namespace={namespace} name={name} view={view} />
      )}
    </div>
  );
});

// A view of one Cluster that reads its namespace through stores of its own (P31): the reads are made once for the
// view, and run while it is mounted, from the effect that it opens.
const OwnClusterView = observer((props: Omit<ClusterViewProps, "source">) => {
  const [read] = useState(() => new ClusterNamespaceRead(props.namespace, props.name, CLUSTER_VIEW_KINDS));

  useEffect(() => read.start(), [read]);

  return <ClusterView {...props} source={read} />;
});

// The view of one Cluster from the reads of a page when that page reads the namespace of the Cluster, and otherwise
// from stores of its own: the details of the extension take the reads of their page, and the panel in the details of
// the host those of the page that is mounted, when one is.
export const SourcedClusterView = observer((props: Omit<ClusterViewProps, "source"> & { page?: ClusterSource }) => {
  const { page, ...view } = props;
  const source = page ?? mountedPageSource();

  if (source !== undefined && readsNamespace(source, view.namespace)) return <ClusterView {...view} source={source} />;
  return <OwnClusterView key={detailsAddressOf(view.namespace, view.name)} {...view} />;
});

export interface ClusterPanelProps extends Renderer.Component.KubeObjectDetailsProps<Cluster> {
  readonly extension: Renderer.LensExtension;
  readonly openCluster: ViewHost["openCluster"];
  readonly openTree: ViewHost["openTree"];
}

// The panel in the details of the host (P16): the same content, after the metadata of the host, without them. It
// reads the namespace and the name of the object that the host hands it, and shows the Cluster from its reads. Its row
// Tree and its references to the objects of Cluster API open the page of the tree with the navigation of the
// extension, which builds the address of the page from its parameters alone, so the details of the host close as the
// tree opens (SPEC-0005, P3).
export const ClusterPanel = observer(({ object, extension, openCluster, openTree }: ClusterPanelProps) => (
  <SourcedClusterView
    namespace={object.getNs() ?? ""}
    name={object.getName()}
    host={{ extension, openCluster, openTree }}
    metadata={false}
  />
));
