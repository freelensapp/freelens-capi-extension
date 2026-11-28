/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The marks of state of the views (SPEC-0004, P21; DESIGN.md, "Tones and their tokens"): the `Badge` of the host,
// with its word and the class of its tone. An activity reads its name, its state when it is not Progressing, and how
// long it has lasted, through the duration component of the host.
//
// A cell of the list holds its marks on one line (kit, `docs/design.md`, "Lists"; SPEC-0004, P12): what does not fit
// is cut with an ellipsis, and the tooltip of the cell carries the whole content, each mark in words, so that no mark
// of the cell has a tooltip of its own.

import { Renderer } from "@freelensapp/extensions";
import styles from "./marks.module.scss";

import type { ReactElement, ReactNode } from "react";

import type { Mark, Time } from "../../common/views/cluster-cells";

const {
  Component: { Badge, LocaleDate, ReactiveDuration, Spinner },
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
  // The tooltip of a mark that stands alone; a mark in a cell of the list has none, the cell has its own.
  tooltip?: ReactElement;
  "data-testid"?: string;
}

// The words of a mark, its state included, and its duration.
function MarkLabel({ mark }: { mark: Mark }) {
  return (
    <>
      {mark.word}
      {mark.state === undefined ? null : ` ${mark.state}`}
      {mark.since === undefined ? null : (
        <>
          {" "}
          <Duration since={mark.since} />
        </>
      )}
    </>
  );
}

// A mark of state. Its word and its state are also its attributes, which the sessions in Freelens read.
export function MarkView({ mark, tooltip, "data-testid": testId }: MarkViewProps) {
  return (
    <Badge
      className={`${styles.mark} ${styles[mark.tone]}`}
      data-tone={mark.tone}
      data-word={mark.word}
      data-state={mark.state ?? ""}
      data-testid={testId}
      expandable={false}
      label={<MarkLabel mark={mark} />}
      tooltip={tooltip}
    />
  );
}

// A mark in the words of a tooltip: its word, its state, and since when, for how long.
export function MarkLine({ mark }: { mark: Mark }) {
  return (
    <div>
      {mark.word}
      {mark.state === undefined ? null : ` ${mark.state}`}
      {mark.since === undefined ? null : (
        <>
          {", for "}
          <Duration since={mark.since} />
          {", since "}
          <Instant since={mark.since} />
        </>
      )}
    </div>
  );
}

export interface MarksCellProps {
  children: ReactNode;
  // The whole content of the cell, in words.
  tooltip: ReactNode;
  // A class of the view that holds the cell, beside the class of a cell of marks.
  className?: string;
  "data-testid"?: string;
}

// The marks of a cell, side by side on one line, in a flat badge of the host that keeps its line, cuts what does not
// fit with an ellipsis and never expands on a click, with the whole content of the cell in its tooltip.
export function MarksCell({ children, tooltip, className, "data-testid": testId }: MarksCellProps) {
  return (
    <Badge
      className={className === undefined ? styles.cell : `${styles.cell} ${className}`}
      flat
      expandable={false}
      label={<>{children}</>}
      tooltip={<div className={styles.tooltip}>{tooltip}</div>}
      data-testid={testId}
    />
  );
}

// A note next to the marks of a cell, such as the count of the MachinePools of unknown health.
export function MarkNote({ children }: { children: ReactNode }) {
  return <span className={styles.note}>{children}</span>;
}

// The spinner of the host in a cell of marks, for a part of the cell that still waits for its inputs: a note of the
// cell, which stands apart from the parts next to it and at the middle of the line, as the other notes do.
export function MarkSpinner({ "data-testid": testId }: { "data-testid"?: string }) {
  return <Spinner className={styles.note} data-testid={testId} />;
}
