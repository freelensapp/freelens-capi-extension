/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The files of an archive that a project publishes as a gzipped tar, such as the chart of a project, read in memory
// with no dependency and no file written: the POSIX ustar format, with the extended headers of pax and the long names
// of GNU, which the tools that pack them write for a path that does not fit in its header. Only regular files are
// kept, by their path in the archive.

import { gunzipSync } from "node:zlib";
import { ensure } from "./checks.mts";

const BLOCK = 512;

// A text field of a header: its bytes up to the first NUL.
function textField(block: Uint8Array, start: number, length: number): string {
  const field = Buffer.from(block.subarray(start, start + length));
  const end = field.indexOf(0);

  return field.subarray(0, end < 0 ? field.length : end).toString("utf8");
}

// A number field of a header: octal digits, padded with spaces or NUL. A size in the base-256 form of GNU, for a
// file of 8 GiB or more, is refused, as no archive that the scripts read holds one.
function octalField(block: Uint8Array, start: number, length: number, what: string): number {
  const value = textField(block, start, length).trim();

  ensure(/^[0-7]+$/.test(value), `The ${what} of an entry of the archive is not an octal number`);
  return Number.parseInt(value, 8);
}

// The checksum of a header, as the format defines it: the sum of its bytes, its own field counted as spaces.
export function headerChecksum(block: Uint8Array): number {
  let sum = 0;

  for (let index = 0; index < BLOCK; index++) sum += index >= 148 && index < 156 ? 0x20 : block[index];
  return sum;
}

// The records of an extended header of pax, each `<length> <key>=<value>` and a newline, the length counting the
// whole record.
function paxRecords(data: Uint8Array): Map<string, string> {
  const records = new Map<string, string>();
  const bytes = Buffer.from(data);
  let offset = 0;

  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);

    ensure(space > offset, "An extended header of the archive is not a list of records");

    const length = Number(bytes.subarray(offset, space).toString("utf8"));
    const record = bytes.subarray(space + 1, offset + length).toString("utf8");
    const equals = record.indexOf("=");

    ensure(
      Number.isInteger(length) && length > 0 && equals > 0 && record.endsWith("\n"),
      "An extended header of the archive has a record that is not one",
    );
    records.set(record.slice(0, equals), record.slice(equals + 1, -1));
    offset += length;
  }
  return records;
}

// The regular files of a gzipped tar archive, by their path in it. A header whose checksum does not match, an archive
// cut short and a number that is not one are refused.
export function filesOfTarball(gzipped: Uint8Array): Map<string, Buffer> {
  const archive = gunzipSync(gzipped);
  const files = new Map<string, Buffer>();
  // The path that a pax header or a long name of GNU gives the entry that follows it.
  let nextPath: string | undefined;
  let offset = 0;

  for (;;) {
    ensure(offset + BLOCK <= archive.length, "The archive is cut short: it does not end with an empty block");

    const header = archive.subarray(offset, offset + BLOCK);

    if (header.every((byte) => byte === 0)) break;
    ensure(
      octalField(header, 148, 8, "checksum") === headerChecksum(header),
      "An entry of the archive does not match the checksum of its header",
    );

    const size = octalField(header, 124, 12, "size");
    const start = offset + BLOCK;
    const data = archive.subarray(start, start + size);
    // A flag of NUL is a regular file, as the first versions of the format wrote it.
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
    // The prefix of a path, in the POSIX form of the format alone, whose magic is `ustar` and version `00`.
    const posix = textField(header, 257, 6) === "ustar" && textField(header, 263, 2) === "00";
    const prefix = posix ? textField(header, 345, 155) : "";
    const name = textField(header, 0, 100);

    ensure(data.length === size, "The archive is cut short: an entry has less data than its header says");
    offset = start + Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x") {
      nextPath = paxRecords(data).get("path") ?? nextPath;
      continue;
    }
    if (type === "L") {
      nextPath = textField(data, 0, data.length);
      continue;
    }
    if (type === "0" || type === "7") files.set(nextPath ?? (prefix ? `${prefix}/${name}` : name), Buffer.from(data));
    nextPath = undefined;
  }
  return files;
}
