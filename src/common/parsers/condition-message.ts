/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The messages of the conditions of Cluster API (SPEC-0003, "The parsers", P27; SPEC-0001, R2.91 and R2.92). A
// message is split into lines at each `\n`, and only there. Each line keeps its indentation and its text, and a
// line indented under another is its child, as the project indents a message of several lines under its bullet
// (util/conditions/merge_strategies.go:559-596). The first line is the headline that a list shows.
//
// A line has the shape that the project composes when its indentation is an even number of spaces and it does not
// end in a carriage return. On such a line, `* ` right after the indentation is a bullet, and the subject that
// starts a line the project composes is read:
//
// - `* <Type>:`, a line of a summary, with the type of the condition it sums up
//   (util/conditions/merge_strategies.go:374-379);
// - `* <Kind> <name>:`, `* <Kinds> <a>, <b>:` or `* <Kinds> <a>, <b>, <c>, ... (<n> more):`, a line of an
//   aggregate, with the kind as written, the names of the objects of the management cluster, and the count of
//   the others (util/conditions/merge_strategies.go:490-494);
// - `And <n> <Kind or Kinds> <text>`, the line that closes an aggregate, with the kind and the count
//   (util/conditions/merge_strategies.go:513-516), also as a bullet, which it becomes once a summary indents the
//   aggregate under its own line.
//
// A count is read up to 2^53 - 1 only, so that it keeps its value: a line with a larger one reads no subject.
//
// Any other line, with an odd indentation, a carriage return at its end, or a tab or a `*` with no space where the
// bullet would be, is kept as text with its indentation: no bullet and no subject. No line is dropped, merged or
// reordered, and the parser gives no meaning to any text: the views show the message as the project wrote it, and
// link the names of a subject.

export type MessageSubject =
  // `* <Type>:`: the type of the condition.
  | { form: "summary"; text: string; type: string }
  // `* <Kind> <name>:` and its plural forms: the kind as written, singular or plural, the names, and the count of
  // the other objects of the same message, 0 when the line names them all.
  | { form: "aggregate"; text: string; kind: string; names: string[]; others: number }
  // `And <n> <Kind or Kinds>`: the kind as written, and the count of the objects it closes the aggregate with.
  | { form: "closing"; text: string; kind: string; count: number };

export interface MessageLine {
  // The line as the message holds it.
  written: string;
  // The spaces it starts with.
  indentation: number;
  // Whether it is a bullet: `* ` after its indentation, on a line of the shape that the project composes.
  bullet: boolean;
  // The line after its indentation and its bullet.
  text: string;
  // The subject that starts the text of a line that the project composes; `subject.text` is that start.
  subject?: MessageSubject;
  // The lines indented under it, in their order.
  children: MessageLine[];
}

export type ConditionMessage =
  // The lines of the message, nested, and its first line; an empty message has no line.
  | { state: "read"; headline: string | undefined; lines: MessageLine[] }
  // A message that is not a string.
  | { state: "unknown" };

// `<Type>:`, with the type of a condition as the definitions of the release allow it: an optional prefix of a
// domain and a slash, then letters, digits, `-`, `_` and `.`, starting and ending with a letter or a digit
// (core/config/crd/bases/cluster.x-k8s.io_clusters.yaml:3552).
const SUMMARY =
  /^((?:[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*\/)?[A-Za-z0-9](?:[-A-Za-z0-9_.]*[A-Za-z0-9])?):(?= |$)/;

// `<Kind> <a>:` to `<Kinds> <a>, <b>, <c>:`. A kind starts with a capital letter. A name holds no white space,
// comma or colon, which the line puts around the names, and no slash, which no name of an object of the
// management cluster holds: the drain of a Machine writes lines of the same shape for the Pods of its Node,
// named `<namespace>/<name>` (core/reconcilers/machine/drain/drain.go:482-483, 505, 528-529, 550-553), Pods of
// the workload cluster that the extension never reads, so such a line reads no subject.
const AGGREGATE = /^([A-Z][0-9A-Za-z]*) ([^\s,:/]+(?:, [^\s,:/]+){0,2}):(?= |$)/;

// `<Kinds> <a>, <b>, <c>, ... (<n> more):`, which names three objects and counts the others.
const AGGREGATE_OF_MORE = /^([A-Z][0-9A-Za-z]*) ([^\s,:/]+, [^\s,:/]+, [^\s,:/]+), \.\.\. \(([1-9]\d*) more\):(?= |$)/;

// `And <n> <Kind or Kinds>`, followed by its text.
const CLOSING = /^And ([1-9]\d*) ([A-Z][0-9A-Za-z]*)(?= \S)/;

// A count, `undefined` above 2^53 - 1.
function countOf(digits: string): number | undefined {
  const count = Number(digits);

  return count <= Number.MAX_SAFE_INTEGER ? count : undefined;
}

function subjectOf(text: string, bullet: boolean): MessageSubject | undefined {
  const closing = CLOSING.exec(text);
  const count = closing ? countOf(closing[1]) : undefined;

  if (closing && count !== undefined) return { form: "closing", text: closing[0], kind: closing[2], count };
  if (!bullet) return undefined;

  const more = AGGREGATE_OF_MORE.exec(text);
  const others = more ? countOf(more[3]) : undefined;

  if (more && others !== undefined) {
    return { form: "aggregate", text: more[0], kind: more[1], names: more[2].split(", "), others };
  }

  const aggregate = AGGREGATE.exec(text);

  if (aggregate) {
    return { form: "aggregate", text: aggregate[0], kind: aggregate[1], names: aggregate[2].split(", "), others: 0 };
  }

  const summary = SUMMARY.exec(text);

  return summary ? { form: "summary", text: summary[0], type: summary[1] } : undefined;
}

function readLine(written: string): MessageLine {
  let indentation = 0;

  while (written[indentation] === " ") indentation++;

  const rest = written.slice(indentation);
  const composed = indentation % 2 === 0 && !written.endsWith("\r");

  if (!composed) return { written, indentation, bullet: false, text: rest, children: [] };

  const bullet = rest.startsWith("* ");
  const text = bullet ? rest.slice(2) : rest;

  return { written, indentation, bullet, text, subject: subjectOf(text, bullet), children: [] };
}

// The lines of the message of a condition, nested by indentation: a line is the child of the nearest line before
// it that is indented less. A value that is not a string is unknown, and nothing throws.
export function parseConditionMessage(value: unknown): ConditionMessage {
  if (typeof value !== "string") return { state: "unknown" };
  if (value === "") return { state: "read", headline: undefined, lines: [] };

  const lines: MessageLine[] = [];
  // The lines that a next line can be indented under, the nearest last.
  const parents: MessageLine[] = [];

  for (const written of value.split("\n")) {
    const line = readLine(written);

    while (parents.length > 0 && parents[parents.length - 1].indentation >= line.indentation) parents.pop();
    (parents.length > 0 ? parents[parents.length - 1].children : lines).push(line);
    parents.push(line);
  }
  return { state: "read", headline: lines[0].written, lines };
}
