// Turning a repeating event into the occurrences that fall in a window.
//
// The rule lives on the row; the occurrences are worked out when the calendar
// is read. That keeps "every Monday" a single editable thing instead of a
// hundred rows that drift apart the first time someone changes the time.
//
// Everything here counts in Phoenix calendar days rather than in milliseconds.
// Adding 7 × 24 hours to an instant happens to be right in Arizona, which has
// no daylight saving — and would silently move a 2pm meeting to 1pm twice a
// year anywhere else. Stepping the date and re-resolving the wall time is
// correct in either case, and costs nothing to do properly.

// Relative, not "@/lib/…", so the invariant tests can import this module
// directly under node. An alias only Next understands would mean testing a
// copy, which is how a guard quietly stops guarding anything.
import { APP_TZ, tzDateKey, utcIsoToWallTime, wallTimeToUtcIso } from "./timezone.ts";

export type Recurrence = "daily" | "weekly" | "biweekly" | "monthly";

export interface RecurringFields {
  starts_at: string;
  recurrence?: Recurrence | null;
  recurrence_until?: string | null;
  recurrence_skips?: string[] | null;
}

/** A hard ceiling on how many occurrences one event can contribute. */
const MAX_OCCURRENCES = 400;

const pad = (n: number) => String(n).padStart(2, "0");

/** Days in a month, where month is 1-based. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Step a "YYYY-MM-DD" forward by one interval.
 *
 * Monthly clamps to the end of a short month: a meeting on the 31st falls on
 * the 30th in a 30-day month and the 28th in February, rather than silently
 * skipping those months. Clamping is measured from the ORIGINAL day of month,
 * not the clamped one, so a 31st series does not collapse to the 28th of every
 * month for the rest of the year once it passes February.
 */
function step(dateKey: string, by: Recurrence, index: number, anchorDay: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);

  if (by === "monthly") {
    const total = (m - 1) + index;
    const year = y + Math.floor(total / 12);
    const month = (total % 12) + 1;
    const day = Math.min(anchorDay, daysInMonth(year, month));
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const days = by === "daily" ? 1 : by === "weekly" ? 7 : 14;
  const out = new Date(Date.UTC(y, m - 1, d + days * index));
  return `${out.getUTCFullYear()}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
}

/**
 * Every occurrence of `event` that starts within [windowStart, windowEnd],
 * as UTC instants, in order.
 *
 * A non-repeating event yields its own start if it falls in the window, so
 * callers can run everything through this without branching.
 */
export function expandOccurrences(
  event: RecurringFields,
  windowStart: string,
  windowEnd: string,
  tz: string = APP_TZ,
): string[] {
  const startsAt = event.starts_at;
  if (!event.recurrence) {
    return startsAt >= windowStart && startsAt <= windowEnd ? [startsAt] : [];
  }

  // The wall time is what repeats — "2pm every Tuesday", not "this many
  // milliseconds later".
  const wall = utcIsoToWallTime(startsAt, tz);
  const [firstDate, clock] = wall.split("T");
  const anchorDay = Number(firstDate.split("-")[2]);

  const skips = new Set(event.recurrence_skips ?? []);
  const endKey = windowEnd.slice(0, 10);
  const untilKey = event.recurrence_until ?? null;

  const out: string[] = [];
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const dateKey = step(firstDate, event.recurrence, i, anchorDay);

    // Past the window or past the series' own end — nothing later can qualify.
    if (dateKey > endKey) break;
    if (untilKey && dateKey > untilKey) break;

    if (skips.has(dateKey)) continue;

    const iso = wallTimeToUtcIso(`${dateKey}T${clock}`, tz);
    if (!iso) continue;
    if (iso < windowStart) continue;
    if (iso > windowEnd) break;

    out.push(iso);
  }
  return out;
}

/** True when this instant is one this series has had cancelled. */
export function isSkipped(event: RecurringFields, iso: string, tz: string = APP_TZ): boolean {
  return (event.recurrence_skips ?? []).includes(tzDateKey(iso, tz));
}

/** Plain-English label for a rule, for the event card. */
export function recurrenceLabel(r: Recurrence | null | undefined, until?: string | null): string {
  if (!r) return "";
  const base =
    r === "daily" ? "Every day"
    : r === "weekly" ? "Every week"
    : r === "biweekly" ? "Every 2 weeks"
    : "Every month";
  return until ? `${base} until ${until}` : base;
}
