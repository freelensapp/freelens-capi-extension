/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// A notice of the reads of a page (SPEC-0004, P25, P34): what could not be read, or how the list is read, in words
// and on the page, never in a tooltip alone, with the message of each answer as the cluster wrote it, and the time of
// an event of the past through the date component of the host.

import { Renderer } from "@freelensapp/extensions";
import styles from "./notice.module.scss";

import type { Notice } from "../../common/views/read-state";

const {
  Component: { Icon, LocaleDate },
} = Renderer;

export interface NoticeViewProps {
  notice: Notice;
  inPlaceOfRows?: boolean;
}

export function NoticeView({ notice, inPlaceOfRows = false }: NoticeViewProps) {
  const classes = [styles.notice, notice.tone === "info" ? styles.info : "", inPlaceOfRows ? styles.inPlaceOfRows : ""];

  return (
    <div
      role="status"
      className={classes.filter((name) => name !== "").join(" ")}
      data-testid={`capi-notice-${notice.id.replace(/[^a-z0-9-]/gi, "-")}`}
    >
      <Icon material={notice.tone === "info" ? "info_outline" : "warning"} small />
      <div>
        <div className={styles.title}>
          {notice.title}
          {notice.at === undefined ? null : (
            <>
              {", at "}
              <LocaleDate date={new Date(notice.at)} />
            </>
          )}
        </div>
        {notice.messages.map((message, index) => (
          <p key={`message-${index}`} className={styles.message}>
            {message}
          </p>
        ))}
        {notice.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
