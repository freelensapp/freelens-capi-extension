// The reading of the fields of an object (SPEC-0003, "States that are not the happy one", and "Where it lives"): a
// field that is absent or null reads as absent, one of the expected type is returned, and one of any other type reads
// as unreadable, never as a value; nothing throws. Each reader is tried on a value of each kind that an object of
// the API can hold.

import { describe, expect, it } from "vitest";
import {
  fieldOf,
  isFields,
  readCount,
  readEntry,
  readFields,
  readFlag,
  readList,
  readText,
  UNREADABLE,
} from "./fields";

// One value of each kind that JSON can hold, and what a view built wrong can pass.
const VALUES = {
  object: { name: "freelens-capi-healthy" },
  list: ["freelens-capi-healthy"],
  text: "freelens-capi-healthy",
  number: 3,
  flag: true,
} as const;

describe("the readers of a field", () => {
  it.each([
    ["readFields", readFields, "object"],
    ["readList", readList, "list"],
    ["readText", readText, "text"],
    ["readFlag", readFlag, "flag"],
    ["readCount", readCount, "number"],
  ] as const)(
    "%s reads absent and null as absent, its own kind as it is, and any other as unreadable",
    (_, read, own) => {
      expect(read(undefined)).toBeUndefined();
      expect(read(null)).toBeUndefined();
      for (const [kind, value] of Object.entries(VALUES)) {
        expect(read(value)).toBe(kind === own ? value : UNREADABLE);
      }
    },
  );

  it("reads an empty text, an empty list and an empty object as they are, not as absent", () => {
    expect(readText("")).toBe("");
    expect(readList([])).toEqual([]);
    expect(readFields({})).toEqual({});
  });

  it("reads as a count only an integer of 0 or more that keeps its value", () => {
    for (const count of [0, 1, Number.MAX_SAFE_INTEGER]) expect(readCount(count)).toBe(count);
    for (const count of [-1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, "3"]) {
      expect(readCount(count)).toBe(UNREADABLE);
    }
  });

  it("tells an object from a list, a text and null", () => {
    expect(isFields(VALUES.object)).toBe(true);
    for (const value of [VALUES.list, VALUES.text, VALUES.number, null, undefined]) expect(isFields(value)).toBe(false);
  });
});

describe("fieldOf", () => {
  it("reads a field of an object, and nothing under an object that is absent or unreadable", () => {
    expect(fieldOf(VALUES.object, "name")).toBe("freelens-capi-healthy");
    expect(fieldOf(VALUES.object, "namespace")).toBeUndefined();
    expect(fieldOf(undefined, "name")).toBeUndefined();
    expect(fieldOf(UNREADABLE, "name")).toBeUndefined();
    // A key that the symbol of an unreadable field would answer itself.
    expect(fieldOf(UNREADABLE, "description")).toBeUndefined();
  });
});

describe("readEntry", () => {
  const annotations = { "cluster.x-k8s.io/paused": "", "cluster.x-k8s.io/replicas-managed-by": 3 };

  it("reads the value of a key of a record of text, an empty one included", () => {
    expect(readEntry(annotations, "cluster.x-k8s.io/paused")).toBe("");
  });

  it("reads a key that the record does not hold as absent, one that it inherits included", () => {
    expect(readEntry(annotations, "cluster.x-k8s.io/skip-remediation")).toBeUndefined();
    expect(readEntry(annotations, "toString")).toBeUndefined();
    expect(readEntry(undefined, "cluster.x-k8s.io/paused")).toBeUndefined();
  });

  it("reads a record of the wrong type, and a value that is not text, as unreadable", () => {
    expect(readEntry("cluster.x-k8s.io/paused", "cluster.x-k8s.io/paused")).toBe(UNREADABLE);
    expect(readEntry([annotations], "cluster.x-k8s.io/paused")).toBe(UNREADABLE);
    expect(readEntry(annotations, "cluster.x-k8s.io/replicas-managed-by")).toBe(UNREADABLE);
  });
});
