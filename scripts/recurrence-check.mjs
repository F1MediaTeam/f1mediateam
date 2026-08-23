#!/usr/bin/env node
//
// Repeating calendar events.
//
// The thing worth testing is that a repeating time stays the time a person
// chose. Everything else here is bookkeeping.

import { expandOccurrences, recurrenceLabel } from "../src/lib/calendar-recurrence.ts";
import { wallTimeToUtcIso, utcIsoToWallTime } from "../src/lib/timezone.ts";

let fail = 0;
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${g}\n        want ${w}`);
};

const at = (wall) => wallTimeToUtcIso(wall);
const clockOf = (iso) => utcIsoToWallTime(iso).slice(11);
const dayOf = (iso) => utcIsoToWallTime(iso).slice(0, 10);

console.log("\nCalendar — repeating events\n");

// A weekly 2pm standup, across a whole year, must be 2pm every single time.
// This is the test that would catch millisecond arithmetic in a DST zone.
const weekly = { starts_at: at("2026-01-06T14:00"), recurrence: "weekly" };
const year = expandOccurrences(weekly, at("2026-01-01T00:00"), at("2026-12-31T23:59"));
t("weekly runs all year", year.length, 52);
t("every occurrence is still 2pm", [...new Set(year.map(clockOf))], ["14:00"]);
t("every occurrence is a Tuesday",
  [...new Set(year.map((i) => new Date(dayOf(i) + "T12:00:00Z").getUTCDay()))], [2]);

// One-offs go through the same path so callers never branch.
const once = { starts_at: at("2026-03-10T09:00"), recurrence: null };
t("one-off inside the window", expandOccurrences(once, at("2026-03-01T00:00"), at("2026-03-31T23:59")).length, 1);
t("one-off outside the window", expandOccurrences(once, at("2026-04-01T00:00"), at("2026-04-30T23:59")).length, 0);

// Monthly on the 31st. Clamping must be measured from the original day, or a
// series collapses to the 28th for the rest of the year after February.
const monthly = { starts_at: at("2026-01-31T10:00"), recurrence: "monthly" };
const months = expandOccurrences(monthly, at("2026-01-01T00:00"), at("2026-06-30T23:59")).map(dayOf);
t("monthly clamps short months without collapsing",
  months, ["2026-01-31","2026-02-28","2026-03-31","2026-04-30","2026-05-31","2026-06-30"]);

// Ending a series.
const ending = { starts_at: at("2026-01-05T08:00"), recurrence: "weekly", recurrence_until: "2026-02-02" };
t("recurrence_until stops it",
  expandOccurrences(ending, at("2026-01-01T00:00"), at("2026-12-31T23:59")).map(dayOf),
  ["2026-01-05","2026-01-12","2026-01-19","2026-01-26","2026-02-02"]);

// Cancelling a single occurrence.
const skipped = { starts_at: at("2026-01-05T08:00"), recurrence: "weekly",
                  recurrence_until: "2026-01-26", recurrence_skips: ["2026-01-12"] };
t("a cancelled occurrence is dropped, the rest survive",
  expandOccurrences(skipped, at("2026-01-01T00:00"), at("2026-12-31T23:59")).map(dayOf),
  ["2026-01-05","2026-01-19","2026-01-26"]);

// A window in the middle of a long-running series.
const march = expandOccurrences(weekly, at("2026-03-01T00:00"), at("2026-03-31T23:59")).map(dayOf);
t("mid-series window returns only that month",
  march, ["2026-03-03","2026-03-10","2026-03-17","2026-03-24","2026-03-31"]);

// Biweekly and daily.
t("biweekly steps 14 days",
  expandOccurrences({ starts_at: at("2026-01-01T12:00"), recurrence: "biweekly" },
    at("2026-01-01T00:00"), at("2026-02-15T23:59")).map(dayOf),
  ["2026-01-01","2026-01-15","2026-01-29","2026-02-12"]);
t("daily fills the window",
  expandOccurrences({ starts_at: at("2026-01-01T12:00"), recurrence: "daily" },
    at("2026-01-01T00:00"), at("2026-01-05T23:59")).length, 5);

// An evening event must not leak into the next Phoenix day. 8pm MST is 03:00Z.
const evening = { starts_at: at("2026-07-06T20:00"), recurrence: "weekly" };
t("8pm weekly stays on its own Phoenix day",
  expandOccurrences(evening, at("2026-07-01T00:00"), at("2026-07-31T23:59")).map(dayOf),
  ["2026-07-06","2026-07-13","2026-07-20","2026-07-27"]);

// Labels.
t("label reads plainly", recurrenceLabel("biweekly"), "Every 2 weeks");
t("label carries the end date", recurrenceLabel("weekly", "2026-02-02"), "Every week until 2026-02-02");
t("no rule, no label", recurrenceLabel(null), "");

console.log(`\n${fail === 0 ? "all passed" : fail + " failed"}\n`);
process.exit(fail ? 1 : 0);
