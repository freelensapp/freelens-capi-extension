/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The YAML of the fixtures of the test environment: Kubernetes objects written as kubectl writes them, with
// block mappings, sequences unindented under their key, keys in alphabetical order, and quotes only where a
// value needs them, as the rule quoted-strings of .yamllint.yaml asks. What it writes is a fixed point of
// yamlfmt with the .yamlfmt.yaml of integration/fixtures: a value that yamlfmt would fold at its line width is
// a literal block instead. It reads what it writes, and what yamlfmt makes of it; it is not a parser of any
// YAML, and refuses what it does not know.

// The max_line_length of integration/fixtures/.yamlfmt.yaml: yamlfmt breaks a plain or a double-quoted value
// at a space that comes after it.
export const LINE_WIDTH = 120;

// The plain values that YAML 1.1 reads as something other than a string, as yamllint resolves them, and as
// kubectl reads them: booleans, floats, integers, null, timestamps, and the merge and value keys.
const NOT_A_STRING = [
  /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
  /^(?:[-+]?[0-9][0-9_]*\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/,
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/,
  /^(?:~|null|Null|NULL)$/,
  /^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?)$/,
  /^(?:<<|=)$/,
];

// The characters that every reader of the fixtures takes as they are in a plain or a literal value: the
// printable ones of the Basic Multilingual Plane, without the line breaks of YAML and the byte order mark.
const PRINTABLE = /^[\u0020-\u007e\u00a0-\u2027\u202a-\ud7ff\ue000-\ufefe\uff00-\ufffd]*$/;

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Whether a string can be written as a plain value: one that both yamllint and yamlfmt read back as the same
// string, which yamllint then refuses to see quoted.
export function plainAllowed(value: string): boolean {
  if (value === "" || !PRINTABLE.test(value) || NOT_A_STRING.some((pattern) => pattern.test(value))) return false;
  if (value.startsWith(" ") || value.endsWith(" ") || value.endsWith(":")) return false;
  if (value.includes(": ") || value.includes(" #")) return false;
  if (/^[,[\]{}#&*!|>'"%@`]/.test(value)) return false;
  // `-`, `?` and `:` start a plain value only when a character other than a space follows them.
  if (/^[-?:]( |$)/.test(value)) return false;
  // yamlfmt quotes a value that starts as a document marker does, and yamllint finds those quotes redundant:
  // such a value is written in a literal block.
  return !startsAsDocumentMarker(value);
}

function startsAsDocumentMarker(value: string): boolean {
  return /^(---|\.\.\.)/.test(value);
}

// Whether a string can be a literal block: printable, with no space before a line break or at its end, with
// no line break that a reader would take as another, which yamlfmt otherwise writes in double quotes, and
// with no line that starts with a tab, which a reader takes for an indentation.
function literalAllowed(value: string): boolean {
  return (
    value !== "" &&
    value.split("\n").every((line) => PRINTABLE.test(line.replaceAll("\t", " "))) &&
    !/[ \t](\n|$)/.test(value) &&
    !/^ *\t/m.test(value) &&
    !value.endsWith("\n\n")
  );
}

// The escapes of a double-quoted value, those that yamlfmt writes.
const ESCAPES: Record<string, string> = {
  "\0": "\\0",
  "\u0007": "\\a",
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\u000b": "\\v",
  "\f": "\\f",
  "\r": "\\r",
  "\u001b": "\\e",
  '"': '\\"',
  "\\": "\\\\",
  "\u0085": "\\N",
  "\u00a0": "\\_",
  "\u2028": "\\L",
  "\u2029": "\\P",
};

function doubleQuoted(value: string): string {
  let text = '"';

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (ESCAPES[character]) text += ESCAPES[character];
    else if (PRINTABLE.test(character)) text += character;
    else if (code <= 0xff) text += `\\x${code.toString(16).toUpperCase().padStart(2, "0")}`;
    else if (code <= 0xffff) text += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
    else text += `\\U${code.toString(16).toUpperCase().padStart(8, "0")}`;
  }
  return `${text}"`;
}

// Whether a value written from `column` stays on its line: yamlfmt breaks it at a space past the line width.
function fits(text: string, column: number): boolean {
  const space = text.lastIndexOf(" ");

  return space < 0 || column + space <= LINE_WIDTH;
}

// The lines of a literal block, under its header, which keeps or strips its last line break. A text that starts
// with a space or a line break would need an indentation indicator, which the fixtures do not use: it is
// written in double quotes.
function literal(value: string, indent: number): { header: string; lines: string[] } | undefined {
  if (!literalAllowed(value) || value.startsWith(" ") || value.startsWith("\n")) return undefined;

  const body = value.endsWith("\n") ? value.slice(0, -1) : value;

  return {
    header: value.endsWith("\n") ? "|" : "|-",
    lines: body.split("\n").map((line) => (line ? `${" ".repeat(indent + 2)}${line}` : "")),
  };
}

function key(name: string): string {
  return plainAllowed(name) ? name : doubleQuoted(name);
}

// Writes a scalar after `prefix`, the indentation and the key or the dash of its line.
function scalar(value: unknown, prefix: string, indent: number, lines: string[]): void {
  if (value === null) {
    lines.push(`${prefix} null`);
  } else if (typeof value === "boolean") {
    lines.push(`${prefix} ${value}`);
  } else if (typeof value === "number") {
    if (!Number.isFinite(value) || /e/i.test(String(value))) throw new Error(`The number ${value} is not written`);
    lines.push(`${prefix} ${value}`);
  } else if (typeof value === "string") {
    const column = prefix.length + 1;
    const block = literal(value, indent);

    if (!value.includes("\n") && plainAllowed(value) && fits(value, column)) {
      lines.push(`${prefix} ${value}`);
    } else if (block && (value.includes("\n") || startsAsDocumentMarker(value) || !fits(doubleQuoted(value), column))) {
      lines.push(`${prefix} ${block.header}`, ...block.lines);
    } else {
      lines.push(`${prefix} ${doubleQuoted(value)}`);
    }
  } else {
    throw new Error(`A value of type ${typeof value} is not written`);
  }
}

function mapping(object: Record<string, unknown>, indent: number, lines: string[]): void {
  for (const name of Object.keys(object).sort()) {
    const value = object[name];

    if (value === undefined) continue;
    node(value, `${" ".repeat(indent)}${key(name)}:`, indent, lines, false);
  }
}

// Writes a value after `prefix`: a mapping indented under it, a sequence unindented under it, a scalar on its
// line.
function node(value: unknown, prefix: string, indent: number, lines: string[], sequenceItem: boolean): void {
  if (isMapping(value)) {
    if (!Object.keys(value).length) {
      lines.push(`${prefix} {}`);
    } else if (sequenceItem) {
      // The first entry of a mapping that is an item of a sequence goes on the line of its dash.
      const nested: string[] = [];

      mapping(value, indent + 2, nested);
      lines.push(`${prefix} ${nested[0].trimStart()}`, ...nested.slice(1));
    } else {
      lines.push(prefix);
      mapping(value, indent + 2, lines);
    }
  } else if (Array.isArray(value)) {
    if (!value.length) {
      lines.push(`${prefix} []`);
    } else if (sequenceItem) {
      throw new Error("A sequence inside a sequence is not written");
    } else {
      lines.push(prefix);
      for (const item of value) node(item, `${" ".repeat(indent)}-`, indent, lines, true);
    }
  } else {
    // The lines of a literal block go two columns in from its key or from its dash.
    scalar(value, prefix, indent, lines);
  }
}

// The text of a file of documents, each one a mapping, separated by `---`.
export function stringifyDocuments(documents: readonly unknown[]): string {
  return documents
    .map((document) => {
      if (!isMapping(document)) throw new Error("A document is not a mapping");

      const lines: string[] = [];

      mapping(document, 0, lines);
      return `${lines.join("\n")}\n`;
    })
    .join("---\n");
}

// A line of a document: its number, its indentation and its text after the indentation.
interface Line {
  number: number;
  indent: number;
  text: string;
}

// The lines of a document, read one at a time. `peek` skips the empty lines and the comments, which only the
// literal blocks keep, through `raw`.
class Reader {
  private index = 0;
  private readonly lines: Line[];

  constructor(lines: Line[]) {
    this.lines = lines;
  }

  peek(): Line | undefined {
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];

      if (line.text !== "" && !line.text.startsWith("#")) return line;
      this.index++;
    }
    return undefined;
  }

  next(): void {
    this.index++;
  }

  // The next line as it is, empty or not.
  raw(): Line | undefined {
    return this.lines[this.index];
  }

  // Replaces the current line: the dash of a sequence item becomes the indentation of the mapping after it.
  replace(indent: number, text: string): void {
    this.lines[this.index] = { ...this.lines[this.index], indent, text };
  }
}

function fail(line: Line | undefined, message: string): never {
  throw new Error(`Line ${line ? line.number : "end"}: ${message}`);
}

function isSequenceItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

// The value of a plain scalar: the booleans, the integers, the decimal numbers and null as the emitter writes
// them, every other value a string, and a value that YAML 1.1 would read as another type refused.
function plainValue(text: string, line: Line): unknown {
  if (text === "null") return null;
  if (text === "true" || text === "false") return text === "true";
  if (/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text)) return Number(text);
  if (NOT_A_STRING.some((pattern) => pattern.test(text))) {
    fail(line, `the plain value ${text} is one that YAML 1.1 does not read as a string`);
  }
  return text;
}

// The escape of a double-quoted value that starts at `index`, and its length.
function unescape(text: string, index: number, line: Line): [string, number] {
  const next = text[index + 1];
  const simple: Record<string, string> = {
    "0": "\0",
    a: "\u0007",
    b: "\b",
    t: "\t",
    "\t": "\t",
    n: "\n",
    v: "\u000b",
    f: "\f",
    r: "\r",
    e: "\u001b",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    N: "\u0085",
    _: "\u00a0",
    L: "\u2028",
    P: "\u2029",
  };

  if (next !== undefined && simple[next] !== undefined) return [simple[next], 2];

  const length = { x: 2, u: 4, U: 8 }[next ?? ""];
  const digits = length ? text.slice(index + 2, index + 2 + length) : "";

  if (!length || !/^[0-9a-fA-F]+$/.test(digits) || digits.length !== length) fail(line, "an escape is not valid");
  return [String.fromCodePoint(Number.parseInt(digits, 16)), 2 + length];
}

// A double-quoted value, which may go on over the next lines, as yamlfmt folds a long one: a line break
// between two lines is a space, each empty line a line break, an escaped line break nothing, and the spaces
// around a line break are not part of the value. Returns the value and what follows the closing quote.
function doubleQuotedValue(reader: Reader, first: Line, start: string): [string, string] {
  let line = first;
  let text = start.slice(1);
  let value = "";

  for (;;) {
    let index = 0;
    let escapedBreak = false;
    // The length of the value without the spaces that end its line, which a line break folds away.
    let kept = value.length;

    while (index < text.length) {
      const character = text[index];

      if (character === '"') return [value, text.slice(index + 1)];
      if (character === "\\" && index === text.length - 1) {
        escapedBreak = true;
        break;
      }
      if (character === "\\") {
        const [decoded, length] = unescape(text, index, line);

        value += decoded;
        index += length;
        kept = value.length;
      } else {
        value += character;
        index++;
        if (character !== " " && character !== "\t") kept = value.length;
      }
    }
    // An escaped line break keeps the spaces before it.
    if (!escapedBreak) value = value.slice(0, kept);

    let empty = 0;

    reader.next();
    while (reader.raw()?.text === "") {
      empty++;
      reader.next();
    }

    const next = reader.raw();

    if (!next) fail(line, "a double-quoted value is not closed");
    value += empty ? "\n".repeat(empty) : escapedBreak ? "" : " ";
    line = next;
    text = next.text;
  }
}

// A literal block: the lines indented under the line of its header, or as its indicator says.
function literalValue(reader: Reader, header: string, line: Line, parentIndent: number): string {
  const match = /^\|(?:([1-9])([+-]?)|([+-]?)([1-9]?))$/.exec(header);

  if (!match) fail(line, `the block header ${header} is not one that the fixtures use`);

  const indicator = Number(match[1] ?? match[4]) || 0;
  const chomping = match[2] || match[3] || "";
  const body: string[] = [];
  let indent = indicator ? parentIndent + indicator : 0;

  reader.next();
  for (;;) {
    const next = reader.raw();

    if (!next) break;
    if (next.text === "") {
      body.push("");
      reader.next();
      continue;
    }
    if (!indent) indent = next.indent;
    if (next.indent < indent || indent <= parentIndent) break;
    body.push(`${" ".repeat(next.indent - indent)}${next.text}`);
    reader.next();
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  if (chomping === "+") fail(line, "a literal block that keeps its last line breaks is not one that the fixtures use");

  const content = body.join("\n");

  return chomping === "-" || content === "" ? content : `${content}\n`;
}

// A plain value, which may go on over the lines indented more than `parentIndent`, as yamlfmt folds a long
// one: a line break between two lines is a space, an empty line a line break.
function plainScalar(reader: Reader, line: Line, text: string, parentIndent: number): unknown {
  let value = text.replace(/\s+#.*$/, "");
  let breaks = 0;

  reader.next();
  for (;;) {
    const next = reader.raw();

    if (!next) break;
    if (next.text === "") {
      breaks++;
      reader.next();
      continue;
    }
    if (next.indent <= parentIndent || next.text.startsWith("#")) break;
    value += breaks ? "\n".repeat(breaks) : " ";
    value += next.text.replace(/\s+#.*$/, "");
    breaks = 0;
    reader.next();
  }
  return plainValue(value, line);
}

// A scalar whose text starts on `line`, after a key or a dash at `parentIndent`.
function scalarValue(reader: Reader, line: Line, text: string, parentIndent: number): unknown {
  if (text === "{}" || text === "[]") {
    reader.next();
    return text === "{}" ? {} : [];
  }
  if (text.startsWith("|")) return literalValue(reader, text, line, parentIndent);
  if (text.startsWith('"')) {
    const [value, rest] = doubleQuotedValue(reader, line, text);

    if (rest.trim() !== "" && !rest.trim().startsWith("#")) fail(line, "text follows a double-quoted value");
    reader.next();
    return value;
  }
  if (/^[>'&*!{[]/.test(text)) fail(line, `the value ${text} is in a form that the fixtures do not use`);
  return plainScalar(reader, line, text, parentIndent);
}

// The key of a line of a mapping, and the text after its colon, or undefined when the line is not one.
function splitKey(text: string): [string, string] | undefined {
  if (text.startsWith('"')) {
    const end = /^"(?:[^"\\]|\\.)*"/.exec(text);

    if (!end || !/^:( |$)/.test(text.slice(end[0].length))) return undefined;
    return [JSON.parse(end[0]) as string, text.slice(end[0].length + 1).trim()];
  }

  const colon = text.search(/:( |$)/);

  if (colon <= 0 || /^[-?] /.test(text)) return undefined;
  return [text.slice(0, colon), text.slice(colon + 1).trim()];
}

function mappingValue(reader: Reader, indent: number): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  for (;;) {
    const line = reader.peek();

    if (!line || line.indent < indent || (line.indent === indent && isSequenceItem(line.text))) break;
    if (line.indent > indent) fail(line, "the line is indented more than its mapping");

    const entry = splitKey(line.text);

    if (!entry) fail(line, "the line is not a key of a mapping");

    const [name, rest] = entry;

    if (Object.hasOwn(object, name)) fail(line, `the key ${name} is there twice`);
    if (rest === "" || rest.startsWith("#")) {
      reader.next();

      const next = reader.peek();

      if (next && next.indent > indent) object[name] = blockValue(reader);
      else if (next && next.indent === indent && isSequenceItem(next.text))
        object[name] = sequenceValue(reader, indent);
      else object[name] = null;
    } else {
      object[name] = scalarValue(reader, line, rest, indent);
    }
  }
  return object;
}

function sequenceValue(reader: Reader, indent: number): unknown[] {
  const items: unknown[] = [];

  for (;;) {
    const line = reader.peek();

    if (!line || line.indent !== indent || !isSequenceItem(line.text)) break;

    const rest = line.text.slice(1).trimStart();

    if (rest === "") {
      reader.next();

      const next = reader.peek();

      items.push(next && next.indent > indent ? blockValue(reader) : null);
    } else if (splitKey(rest)) {
      // A mapping whose first entry is on the line of the dash.
      reader.replace(indent + line.text.length - rest.length, rest);
      items.push(mappingValue(reader, indent + line.text.length - rest.length));
    } else if (isSequenceItem(rest)) {
      fail(line, "a sequence inside a sequence is not one that the fixtures use");
    } else {
      items.push(scalarValue(reader, line, rest, indent));
    }
  }
  return items;
}

function blockValue(reader: Reader): unknown {
  const line = reader.peek() as Line;

  return isSequenceItem(line.text) ? sequenceValue(reader, line.indent) : mappingValue(reader, line.indent);
}

// The documents of a file, each one a mapping.
export function parseDocuments(text: string): Record<string, unknown>[] {
  if (text.includes("\r")) throw new Error("The text has a carriage return");

  const documents: Line[][] = [[]];

  text.split("\n").forEach((content, index) => {
    if (/^---\s*$/.test(content)) {
      documents.push([]);
      return;
    }
    if (/^ *\t/.test(content)) throw new Error(`Line ${index + 1}: a tab indents it`);

    const stripped = content.replace(/^ +/, "");

    documents[documents.length - 1].push({
      number: index + 1,
      indent: content.length - stripped.length,
      text: stripped.trim() === "" ? "" : stripped,
    });
  });

  return documents.flatMap((lines) => {
    const reader = new Reader(lines);
    const first = reader.peek();

    if (!first) return [];
    if (first.indent !== 0 || isSequenceItem(first.text)) fail(first, "a document is not a mapping");

    const document = mappingValue(reader, 0);
    const rest = reader.peek();

    if (rest) fail(rest, "the line is not part of its document");
    return [document];
  });
}
