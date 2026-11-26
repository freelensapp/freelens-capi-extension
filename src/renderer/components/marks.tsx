/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The marks of state of the views (SPEC-0004, P21; DESIGN.md, "Tones and their tokens"): the `Badge` of the host,
// with its word and the class of its tone. An activity reads its name, its state when it is not Progressing, and how
// long it has lasted, through the duration component of the host, whose tooltip gives the instant it started.

import { Renderer } from "@freelensapp/extensions";
import styles from "./marks.module.scss";

import type { ReactElement, ReactNode } from "react";

import type { Mark, Time } from "../../common/views/cluster-cells";

const {
  Component: { Badge, LocaleDate, ReactiveDuration },
} = Renderer;

// The time that a mark started, as a duration, or N/A for a time that the project wrote and that is not valid.
export function Duration({ since }: { since: Time }) {
  return since.state === "written" ? <ReactiveDuration timestamp={since.text} /> : <>N/A</>;
}

// When a time started, for a tooltip.
export function Instant({ since }: { since: Time }) {
  return since.state === "written" ? (
    <LocaleDate date={since.text} />
  ) : (
    <>N/A: the project wrote a time that is not valid</>
  );
}

export interface MarkViewProps {
  mark: Mark;
  tooltip?: ReactElement;
  "data-testid"?: string;
}

export function MarkView({ mark, tooltip, "data-testid": testId }: MarkViewProps) {
  const since = mark.since;
  const label = (
    <>
      {mark.word}
      {mark.state === undefined ? null : ` ${mark.state}`}
      {since === undefined ? null : (
        <>
          {" "}
          <Duration since={since} />
        </>
      )}
    </>
  );
  const sinceTooltip =
    since === undefined ? undefined : (
      <>
        Since <Instant since={since} />
      </>
    );

  return (
    <Badge
      className={`${styles.mark} ${styles[mark.tone]}`}
      data-tone={mark.tone}
      data-testid={testId}
      expandable={false}
      label={label}
      tooltip={tooltip ?? sinceTooltip}
    />
  );
}

// The marks of a cell, side by side.
export function Marks({ children }: { children: ReactNode }) {
  return <div className={styles.marks}>{children}</div>;
}

export function MarkNote({ children }: { children: ReactNode }) {
  return <span className={styles.note}>{children}</span>;
}
