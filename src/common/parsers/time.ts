/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The times of the objects of Cluster API, as Kubernetes writes them (SPEC-0003, "The parsers", P30): the
// transitions of the conditions, the times of the status of a Machine and of a KubeadmControlPlane, the time at
// which a ClusterResourceSetBinding last applied each resource, which its spec holds, the creation and the
// deletion of an object, and the annotation of the expiry of the certificates. A time is
// RFC 3339 with an upper case `T`, optional fractional seconds, and `Z` or a numeric offset, and every field is
// checked against the calendar: a date that does not exist is unavailable, never rolled over into another one.
// The instant is computed from the fields, with no clock and no date of the platform, which would roll it over.

export type ParsedTime =
  // A time of the calendar: the text as written, which the views hand to the components of the host, and the
  // instant, in milliseconds since the Unix epoch, which is what the model compares.
  | { state: "accepted"; text: string; instant: number }
  // Not written: absent, null or empty, which is how a time that the project left at zero reaches the views.
  | { state: "absent" }
  // Written, and no time of the calendar: the views show N/A, and never the current time in its place.
  | { state: "unavailable" };

// The date, the time, the optional fractional seconds, and `Z` or a numeric offset, each field of two digits but
// the year and the fraction.
const RFC_3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

// The days of a year that is not a leap year before the first day of each month.
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const MILLISECONDS_PER_DAY = 86_400_000;

// The zero time of Go, 0001-01-01T00:00:00Z: the value of a time that a program never set, which is no time of
// the life of an object.
const GO_ZERO_TIME = -62_135_596_800_000;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// The days from the first day of the year 0 to the first day of a year, in the Gregorian calendar extended
// backwards: 365 for each year, and one more for each leap year among those before it.
function daysBeforeYear(year: number): number {
  return year * 365 + Math.floor((year + 3) / 4) - Math.floor((year + 99) / 100) + Math.floor((year + 399) / 400);
}

// The days from 1970-01-01 to a date that exists.
function daysSinceEpoch(year: number, month: number, day: number): number {
  const leapDay = month > 2 && isLeapYear(year) ? 1 : 0;

  return daysBeforeYear(year) - daysBeforeYear(1970) + DAYS_BEFORE_MONTH[month - 1] + leapDay + day - 1;
}

// A time as Kubernetes writes it. A value of another type is unavailable, and nothing throws.
export function parseTime(value: unknown): ParsedTime {
  if (value === undefined || value === null || value === "") return { state: "absent" };
  if (typeof value !== "string") return { state: "unavailable" };

  const found = RFC_3339.exec(value);

  if (!found) return { state: "unavailable" };

  const [year, month, day, hour, minute, second] = found.slice(1, 7).map(Number);
  const [fraction = "", sign, offsetHours = "0", offsetMinutes = "0"] = found.slice(7);
  const offset = (sign === "-" ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000;

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { state: "unavailable" };
  if (hour > 23 || minute > 59 || second > 59) return { state: "unavailable" };
  if (Number(offsetHours) > 23 || Number(offsetMinutes) > 59) return { state: "unavailable" };

  // The fraction counts to the millisecond, and what is below it is dropped.
  const milliseconds = Number(fraction.slice(0, 3).padEnd(3, "0"));
  const instant =
    daysSinceEpoch(year, month, day) * MILLISECONDS_PER_DAY +
    ((hour * 60 + minute) * 60 + second) * 1000 +
    milliseconds -
    offset;

  if (instant === GO_ZERO_TIME) return { state: "unavailable" };
  return { state: "accepted", text: value, instant };
}
