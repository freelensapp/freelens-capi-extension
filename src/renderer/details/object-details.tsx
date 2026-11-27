/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The details of a node of the tree of a Cluster other than its root (SPEC-0005, P17, P20), from the pure functions of
// `src/common/views/node-details.ts`: the metadata of the host, the place of the node, its status, the facts of its
// kind and its conditions, each section hidden when it has nothing to show and inside an error boundary of its own, so
// that an error in one leaves the others and the tree. A node of the tree that they name, the object above it, an
// owner that the tree holds, a template, a target, a name in a message, opens its own details in the same drawer, with
// no navigation away (P5), and a target that the tree does not hold is text, with why in its tooltip, as the details
// of a Cluster show a reference that opens nothing (SPEC-0004, P18); an object of a provider links to the details of
// the host, at the version of its contract, which open over these (SPEC-0001, A6).

import { Renderer } from "@freelensapp/extensions";
import { MarkView } from "../components/marks";
import styles from "./cluster-details.module.scss";
import {
  ActivityMarks,
  AnnotationsRow,
  AnswerView,
  ConditionsView,
  CountersRow,
  Deprecated,
  FailureRows,
  HealthMark,
  HostMeta,
  IssuesRow,
  Lines,
  Marks,
  NotesRow,
  Pending,
  Section,
  Since,
  TextButton,
  ToneRow,
} from "./cluster-details-v1beta2";

import type { Fact, NodeActivity, NodeDetails, NodePause, NodeStatusSection } from "../../common/views/node-details";
import type { MessageLinks, ViewHost } from "./cluster-details-v1beta2";

const {
  Component: { DrawerItem, DrawerTitle, MaybeLink, NamespaceSelectBadge, WithTooltip },
  Navigation,
} = Renderer;

const PAUSE_WORDS: Readonly<Record<NodePause, string>> = {
  own: "Paused by its own annotation cluster.x-k8s.io/paused",
  cluster: "Paused by spec.paused of its Cluster, which reaches every object of it whose controller honours it",
  both: "Paused by its own annotation cluster.x-k8s.io/paused and by spec.paused of its Cluster",
};

function capitalized(words: string): string {
  return words === "" ? words : `${words[0].toUpperCase()}${words.slice(1)}`;
}

// The metadata of the host, with the namespace as its badge and the owners as links to their nodes or as text, each
// where the host puts it, and, for the kinds of P20, the annotations in a row of their own (P5, P20).
function MetadataSection({ details, openNode }: { details: NodeDetails; openNode: (node: string) => void }) {
  const { node, metadata } = details;

  if (metadata === undefined || node.form !== "object") return null;

  const object = node.object as unknown as Renderer.K8sApi.KubeObject;
  const { annotations, owners, namespace } = metadata;

  return (
    <div data-testid="capi-node-section-metadata">
      <HostMeta object={object} shown={["creationTimestamp", "deletionTimestamp", "name"]} />
      {namespace === undefined ? null : (
        <DrawerItem name="Namespace" data-testid="capi-details-namespace">
          <NamespaceSelectBadge namespace={namespace} />
        </DrawerItem>
      )}
      <HostMeta
        object={object}
        shown={annotations === undefined ? ["labels", "annotations", "finalizers"] : ["labels"]}
      />
      {annotations === undefined ? null : <AnnotationsRow annotations={annotations} />}
      {annotations === undefined ? null : <HostMeta object={object} shown={["finalizers"]} />}
      {owners.length === 0 ? null : (
        <DrawerItem name="Controlled By" data-testid="capi-details-owners">
          {owners.map((owner) => (
            <p key={`${owner.kind}/${owner.name}`} data-testid="capi-node-owner">
              {`${owner.kind} `}
              {owner.node === undefined ? (
                owner.name
              ) : (
                <TextButton onOpen={() => openNode(owner.node as string)}>{owner.name}</TextButton>
              )}
            </p>
          ))}
        </DrawerItem>
      )}
      <HostMeta object={object} shown={["managedFields"]} />
    </div>
  );
}

// The place of the node: its role, the object above it, a link to its node, and the field by which the tree found it,
// as "Infrastructure machine of Machine m-1, by spec.infrastructureRef"; or why no rule placed it (P7, P17).
function PlaceSection({ details, openNode }: { details: NodeDetails; openNode: (node: string) => void }) {
  const { place } = details;
  const { of } = place;

  return (
    <div data-testid="capi-node-section-place">
      <DrawerTitle>Place</DrawerTitle>
      <DrawerItem name="Place" data-testid="capi-node-place">
        {capitalized(place.role)}
        {of === undefined ? null : (
          <>
            {" of "}
            <TextButton onOpen={() => openNode(of.node)}>{of.text}</TextButton>
          </>
        )}
        {place.under === undefined ? null : `, under ${place.under}`}
        {place.by === undefined ? null : `, by ${place.by}`}
      </DrawerItem>
      {place.reason === undefined ? null : (
        <DrawerItem name="Why there" data-testid="capi-node-reason">
          {place.reason}
        </DrawerItem>
      )}
    </div>
  );
}

function ActivityRow({ activity, links }: { activity: NodeActivity; links: MessageLinks }) {
  return (
    <div data-testid="capi-details-activity-row">
      <MarkView mark={activity.mark} data-testid="capi-details-activity" />
      <Since since={activity.since} />
      {activity.source === undefined ? null : (
        <span>{` from ${activity.source.kind ?? ""} ${activity.source.name ?? ""}`}</span>
      )}
      {activity.pause === undefined ? null : <div data-testid="capi-details-pause">{PAUSE_WORDS[activity.pause]}</div>}
      {activity.stage === undefined ? null : (
        <div data-testid="capi-details-stage">
          {"Stage: "}
          {activity.stage.reason ?? "N/A"}
          <Lines lines={activity.stage.lines} links={links} />
        </div>
      )}
    </div>
  );
}

// The status of the node, as the details of a Cluster show theirs (P17).
function StatusSection({ status, links }: { status: NodeStatusSection; links: MessageLinks }) {
  const { health, summary } = status;

  return (
    <div data-testid="capi-node-section-status">
      <DrawerTitle>Status</DrawerTitle>
      <DrawerItem name="Health">
        {status.pending ? (
          <Pending />
        ) : (
          <Marks>
            <HealthMark cell={health} testId="capi-details-health" />
            {health.stale.length === 0 ? null : (
              <MarkView mark={{ word: "stale", tone: "vague" }} data-testid="capi-details-health-stale" />
            )}
          </Marks>
        )}
      </DrawerItem>
      {status.pending ? null : (
        <DrawerItem name="Rests on" data-testid="capi-details-rests-on">
          {status.restsOn.text}
        </DrawerItem>
      )}
      {status.pending ? null : <ToneRow status={status} />}
      <DrawerItem name="Activities">
        {status.pending ? (
          <Pending />
        ) : (
          <div className={styles.activities}>
            {status.activities.map((activity) => (
              <ActivityRow key={activity.name} activity={activity} links={links} />
            ))}
            {status.otherActivities.length === 0 ? null : (
              <ActivityMarks cell={{ marks: status.otherActivities, sort: 0 }} testId="capi-details-activity" />
            )}
          </div>
        )}
      </DrawerItem>
      {status.pending || health.stale.length === 0 ? null : (
        <DrawerItem name="Freshness" data-testid="capi-details-freshness">
          {health.stale.map((cause) => (
            <div key={cause.cause} data-testid="capi-details-stale">
              <MarkView mark={{ word: "stale", tone: "vague" }} />
              {` ${cause.cause}`}
              {cause.detail === undefined ? "" : `, ${cause.detail}`}
              <Since since={cause.since} lasting />
            </div>
          ))}
        </DrawerItem>
      )}
      {summary === undefined ? null : (
        <DrawerItem name="Summary" data-testid="capi-details-summary">
          <div>
            {`${summary.type}: ${summary.status ?? "N/A"}, ${summary.reason ?? "N/A"}`}
            <Since since={summary.since} />
          </div>
          <Lines lines={summary.lines} links={links} />
        </DrawerItem>
      )}
      {status.pending ? null : <IssuesRow issues={status.issues} />}
      {status.pending ? null : <NotesRow notes={status.notes} />}
      {status.phase === undefined ? null : (
        <DrawerItem name="Phase" data-testid="capi-details-phase">
          {status.phase.written}
          {status.phase.deprecated ? <Deprecated /> : null}
          {status.phase.remark === undefined ? null : <p className={styles.remark}>{status.phase.remark}</p>}
        </DrawerItem>
      )}
      <FailureRows failure={status.failure} />
    </div>
  );
}

// What a node that cannot be read says, with the message of each answer (P12), or the spinner while its kind loads.
function UnreadSection({ details }: { details: NodeDetails }) {
  return (
    <div data-testid="capi-node-section-status">
      <DrawerTitle>Status</DrawerTitle>
      {details.unread === undefined ? (
        <Pending />
      ) : (
        <DrawerItem name="Read" data-testid="capi-node-unread">
          {details.unread.words}
          {details.unread.messages.map((message, index) => (
            <p key={`message-${index}`} className={styles.message}>
              {message}
            </p>
          ))}
        </DrawerItem>
      )}
    </div>
  );
}

function FactValue({
  fact,
  openNode,
}: {
  fact: Exclude<Fact, { form: "counters" }>;
  openNode: (node: string) => void;
}) {
  switch (fact.form) {
    case "text":
      return fact.tooltip === undefined ? (
        <>{fact.text}</>
      ) : (
        <WithTooltip tooltip={fact.tooltip} expandable={false} data-testid="capi-node-fact-text">
          {fact.text}
        </WithTooltip>
      );
    case "links":
      return (
        <>
          {fact.links.map((link) => (
            <div key={`${link.node}-${link.field ?? ""}`} data-testid="capi-node-link">
              <TextButton onOpen={() => openNode(link.node)}>{link.text}</TextButton>
              {link.field === undefined ? null : `, by ${link.field}`}
            </div>
          ))}
          {(fact.texts ?? []).map((entry) => (
            <div key={entry.text}>
              <WithTooltip tooltip={entry.why} expandable={false} data-testid="capi-node-unheld">
                {entry.text}
              </WithTooltip>
            </div>
          ))}
        </>
      );
    case "answer":
      return (
        <>
          <AnswerView answer={fact.answer} />
          {` (${fact.field})`}
        </>
      );
    case "host":
      return (
        <MaybeLink to={Navigation.getDetailsUrl(fact.selfLink)} onClick={(event) => event.stopPropagation()}>
          {fact.text}
        </MaybeLink>
      );
    case "list":
      return (
        <>
          {fact.items.map((item, index) => (
            <div key={`${index}-${item}`}>{item}</div>
          ))}
        </>
      );
  }
}

// The facts of the kind of the node (P17).
function FactsSection({ details, openNode }: { details: NodeDetails; openNode: (node: string) => void }) {
  return (
    <div data-testid="capi-node-section-facts">
      <DrawerTitle>{details.node.kind}</DrawerTitle>
      {details.facts.map((fact) =>
        fact.form === "counters" ? (
          <CountersRow key={fact.name} counters={fact.counters} />
        ) : (
          <DrawerItem key={fact.name} name={fact.name} data-testid="capi-node-fact">
            <FactValue fact={fact} openNode={openNode} />
          </DrawerItem>
        ),
      )}
    </div>
  );
}

export interface ObjectDetailsProps {
  readonly details: NodeDetails;
  readonly host: ViewHost;
  // What the names in a message open.
  readonly links: MessageLinks;
  // Selects a node of the tree and opens its details, in the same page (P5).
  readonly openNode: (node: string) => void;
}

// The sections of the details of a node, each inside an error boundary of its own, keyed by the object of the node,
// which a watch replaces when it changes.
export function ObjectDetails({ details, host, links, openNode }: ObjectDetailsProps) {
  const resetKey = details.node.form === "object" ? details.node.object : details.node;

  return (
    <div className={styles.details} data-testid="capi-node-details">
      {details.metadata === undefined ? null : (
        <Section host={host} resetKey={resetKey}>
          <MetadataSection details={details} openNode={openNode} />
        </Section>
      )}
      <Section host={host} resetKey={resetKey}>
        <PlaceSection details={details} openNode={openNode} />
      </Section>
      <Section host={host} resetKey={resetKey}>
        {details.status === undefined ? (
          details.node.form === "object" ? (
            <Pending />
          ) : (
            <UnreadSection details={details} />
          )
        ) : (
          <StatusSection status={details.status} links={links} />
        )}
      </Section>
      {details.facts.length === 0 ? null : (
        <Section host={host} resetKey={resetKey}>
          <FactsSection details={details} openNode={openNode} />
        </Section>
      )}
      {details.conditions === undefined || details.conditions.length === 0 ? null : (
        <Section host={host} resetKey={resetKey}>
          <ConditionsView conditions={details.conditions} links={links} />
        </Section>
      )}
    </div>
  );
}
