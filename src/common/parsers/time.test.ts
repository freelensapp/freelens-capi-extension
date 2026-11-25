// The times as Kubernetes writes them (SPEC-0003, "Tests", "Unit", P30): what is accepted, with its instant;
// what is absent; and what is unavailable, never rolled over into another date and never replaced by a guess.

import { describe, expect, it } from "vitest";
import { parseTime } from "./time";

describe("a time", () => {
  it("reads a time as Kubernetes writes it", () => {
    expect(parseTime("2026-11-25T18:39:48Z")).toEqual({
      state: "accepted",
      text: "2026-11-25T18:39:48Z",
      instant: Date.UTC(2026, 10, 25, 18, 39, 48),
    });
  });

  it("reads fractional seconds and an offset, as the annotation of the expiry of the certificates may carry", () => {
    expect(parseTime("2027-11-25T19:39:48.123456+01:00")).toEqual({
      state: "accepted",
      text: "2027-11-25T19:39:48.123456+01:00",
      instant: Date.UTC(2027, 10, 25, 18, 39, 48, 123),
    });
    expect(parseTime("2027-11-25T13:09:48.5-05:30")).toEqual({
      state: "accepted",
      text: "2027-11-25T13:09:48.5-05:30",
      instant: Date.UTC(2027, 10, 25, 18, 39, 48, 500),
    });
  });

  it("drops the digits of a fraction below the millisecond, and never rounds them up", () => {
    expect(parseTime("2027-11-25T18:39:48.9995Z")).toMatchObject({
      state: "accepted",
      instant: Date.UTC(2027, 10, 25, 18, 39, 48, 999),
    });
    expect(parseTime("2027-11-25T18:39:48.0009Z")).toMatchObject({
      state: "accepted",
      instant: Date.UTC(2027, 10, 25, 18, 39, 48),
    });
  });

  it("counts a time before 1970 and one far ahead, since it reads no clock", () => {
    expect(parseTime("1969-12-31T23:59:59.250Z")).toMatchObject({ state: "accepted", instant: -750 });
    expect(parseTime("9999-12-31T23:59:59Z")).toMatchObject({
      state: "accepted",
      instant: Date.UTC(9999, 11, 31, 23, 59, 59),
    });
  });

  it.each([
    ["an absent time", undefined],
    ["null", null],
    ["an empty time", ""],
  ])("reads %s as Absent", (_, value) => {
    expect(parseTime(value)).toEqual({ state: "absent" });
  });

  it.each([
    ["30 February", "2026-02-30T00:00:00Z"],
    ["29 February of a year that is not a leap year", "2026-02-29T00:00:00Z"],
    ["29 February of a century that is not a leap year", "2100-02-29T00:00:00Z"],
    ["31 April", "2026-04-31T00:00:00Z"],
    ["a month 13", "2026-13-01T00:00:00Z"],
    ["a month 0", "2026-00-10T00:00:00Z"],
    ["a day 0", "2026-11-00T00:00:00Z"],
    ["an hour 24", "2026-11-25T24:00:00Z"],
    ["a minute 60", "2026-11-25T18:60:00Z"],
    ["a second 60", "2026-12-31T23:59:60Z"],
    ["an offset of 24 hours", "2026-11-25T18:39:48+24:00"],
    ["an offset of 60 minutes", "2026-11-25T18:39:48+01:60"],
  ])("reads %s as Unavailable, never rolled over", (_, value) => {
    expect(parseTime(value)).toEqual({ state: "unavailable" });
  });

  it("accepts 29 February of a leap year", () => {
    expect(parseTime("2028-02-29T12:00:00Z")).toMatchObject({
      state: "accepted",
      instant: Date.UTC(2028, 1, 29, 12),
    });
    expect(parseTime("2000-02-29T12:00:00Z")).toMatchObject({
      state: "accepted",
      instant: Date.UTC(2000, 1, 29, 12),
    });
    expect(parseTime("2028-03-01T00:00:00Z")).toMatchObject({ instant: Date.UTC(2028, 2, 1) });
  });

  it.each([
    ["a lower case t", "2026-11-25t18:39:48Z"],
    ["a lower case z", "2026-11-25T18:39:48z"],
    ["a space in place of the T", "2026-11-25 18:39:48Z"],
    ["a date with no time", "2026-11-25"],
    ["a time with no seconds", "2026-11-25T18:39Z"],
    ["a time with no zone", "2026-11-25T18:39:48"],
    ["a dot with no fraction", "2026-11-25T18:39:48.Z"],
    ["a number", 1_764_095_988],
    ["a number written as text", "1764095988"],
  ])("reads %s as Unavailable", (_, value) => {
    expect(parseTime(value)).toEqual({ state: "unavailable" });
  });

  it("reads the zero time of Go as Unavailable, however it is written", () => {
    expect(parseTime("0001-01-01T00:00:00Z")).toEqual({ state: "unavailable" });
    expect(parseTime("0001-01-01T01:00:00+01:00")).toEqual({ state: "unavailable" });
    expect(parseTime("0001-01-01T00:00:01Z")).toEqual({
      state: "accepted",
      text: "0001-01-01T00:00:01Z",
      instant: -62_135_596_799_000,
    });
  });

  it.each([
    ["true", true],
    ["an object", { time: "2026-11-25T18:39:48Z" }],
    ["a list", ["2026-11-25T18:39:48Z"]],
  ])("reads %s as Unavailable, and does not throw", (_, value) => {
    expect(parseTime(value)).toEqual({ state: "unavailable" });
  });
});
