/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The reading of the fields of an object, with a check of the type of each (SPEC-0003, "States that are not the
// happy one"). The model never takes the types of types.ts on trust: a field that is absent or null reads as
// absent, one of the expected type is returned, and one of any other type reads as unreadable, which the rules turn
// into Unknown and a note, and never into a pass or a zero. Nothing here throws.

// A field of the wrong type: a status that is not an object, conditions that are not a list, a negative count. A
// symbol, so that no value that an object holds can be taken for it.
export const UNREADABLE: unique symbol = Symbol("unreadable");

export type Unreadable = typeof UNREADABLE;

export type Fields = Readonly<Record<string, unknown>>;

// Whether a value is an object that is not a list.
export function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readFields(value: unknown): Fields | undefined | Unreadable {
  if (value === undefined || value === null) return undefined;
  return isFields(value) ? value : UNREADABLE;
}

export function readList(value: unknown): readonly unknown[] | undefined | Unreadable {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : UNREADABLE;
}

export function readText(value: unknown): string | undefined | Unreadable {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : UNREADABLE;
}

export function readFlag(value: unknown): boolean | undefined | Unreadable {
  if (value === undefined || value === null) return undefined;
  return typeof value === "boolean" ? value : UNREADABLE;
}

// A count, such as a number of replicas or a generation: an integer of 0 or more that keeps its value, so not above
// 2^53 - 1, as the parsers read every number (SPEC-0003, "Notes and deviations").
export function readCount(value: unknown): number | undefined | Unreadable {
  if (value === undefined || value === null) return undefined;
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : UNREADABLE;
}

// A field of an object that may itself be absent or unreadable: what is under an unreadable object is absent, and
// the object is reported once, by whoever read it.
export function fieldOf(fields: Fields | undefined | Unreadable, key: string): unknown {
  return fields === undefined || fields === UNREADABLE ? undefined : fields[key];
}

// The value of a key of the labels or of the annotations of an object, which are records of text. A record of the
// wrong type, or a value that is not text, is unreadable.
export function readEntry(record: unknown, key: string): string | undefined | Unreadable {
  const fields = readFields(record);

  if (fields === UNREADABLE) return UNREADABLE;
  if (fields === undefined || !Object.hasOwn(fields, key)) return undefined;
  return readText(fields[key]);
}
