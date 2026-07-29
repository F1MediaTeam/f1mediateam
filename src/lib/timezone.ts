// The calendar runs on Phoenix time.
//
// Arizona doesn't observe daylight saving, so America/Phoenix is MST (UTC-7)
// all year — it lines up with Pacific in summer and Mountain in winter, which
// is exactly the kind of thing that quietly breaks date math. Nothing below
// hardcodes -7 though: every offset is derived from the IANA database at the
// instant in question, so a DST-observing zone would still be handled right.
//
// The rules this module exists to enforce:
//
//   * A `datetime-local` input has no timezone. Parsing it with `new Date()`
//     resolves it against the *server's* zone — UTC on Vercel — which stores
//     every event 7 hours early. Use `wallTimeToUtcIso` instead.
//   * `iso.slice(0, 10)` is the UTC date, not the Phoenix date. Anything at or
//     after 5pm Phoenix has already rolled over in UTC, so slicing buckets
//     evening events onto tomorrow. Use `tzDateKey`.
//   * "Today" computed on the server is UTC's today. Use `tzTodayKey`.

export const APP_TZ = "America/Phoenix";

/** Short label to show beside a time so nobody has to guess the zone. */
export const APP_TZ_LABEL = "MST";

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTz(date: Date, tz: string): Parts {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23", // avoids the "24" that hour12:false can emit at midnight
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    hour: Number(fields.hour),
    minute: Number(fields.minute),
    second: Number(fields.second),
  };
}

/** How far ahead of UTC `tz` is at this instant, in milliseconds. */
export function tzOffsetMs(date: Date, tz: string = APP_TZ): number {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Strip sub-second noise so the difference is a clean offset.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Turn a `datetime-local` value ("2026-07-30T14:00") into the UTC instant that
 * wall-clock time refers to in `tz`. Returns null if the value isn't parseable,
 * so callers can reject the submission instead of storing a bogus date.
 */
export function wallTimeToUtcIso(wall: string, tz: string = APP_TZ): string | null {
  const m = wall.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;

  // Treat the wall time as if it were UTC, then slide it back by the zone's
  // offset. The offset has to be sampled at roughly the right instant, so we
  // sample twice: once at the naive guess, once at the corrected result. Only
  // a DST boundary makes those differ, and Phoenix has none.
  const naive = Date.UTC(+y, +mo - 1, +d, +hh, +mm, ss ? +ss : 0);
  const firstPass = naive - tzOffsetMs(new Date(naive), tz);
  const settled = naive - tzOffsetMs(new Date(firstPass), tz);

  const out = new Date(settled);
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

/**
 * The reverse: a stored UTC instant as a `datetime-local` value in `tz`, for
 * prefilling an edit form so it shows the time the user originally entered.
 */
export function utcIsoToWallTime(iso: string, tz: string = APP_TZ): string {
  const p = partsInTz(new Date(iso), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" for the calendar day this instant falls on in `tz`. */
export function tzDateKey(iso: string | Date, tz: string = APP_TZ): string {
  const p = partsInTz(typeof iso === "string" ? new Date(iso) : iso, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today's "YYYY-MM-DD" in `tz` — server and browser agree on this. */
export function tzTodayKey(tz: string = APP_TZ): string {
  return tzDateKey(new Date(), tz);
}

/** Calendar-date pieces of "now" in `tz`, for building a month grid. */
export function tzNow(tz: string = APP_TZ): Parts {
  return partsInTz(new Date(), tz);
}

/** Shift a "YYYY-MM-DD" key by whole days, staying on the calendar. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${out.getUTCFullYear()}-${pad(out.getUTCMonth() + 1)}-${pad(out.getUTCDate())}`;
}

/**
 * The 42-cell (6×7, Sunday-aligned) month grid around today in `tz`.
 *
 * Built from Phoenix's idea of the current month, so the grid doesn't jump to
 * next month during the evening hours when UTC has already rolled over. The
 * UTC math inside is just a neutral calendar calculator — these are plain
 * dates, not instants.
 */
export function buildMonthGrid(tz: string = APP_TZ): {
  days: string[];
  monthLabel: string;
  monthKey: string;
} {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { year, month } = tzNow(tz);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startDay = first.getUTCDay();

  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - startDay + i));
    days.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }

  return {
    days,
    monthLabel: first.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    monthKey: `${year}-${pad(month)}`,
  };
}

/** Format an instant in `tz`. Same output on the server and in the browser. */
export function formatInTz(
  iso: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  tz: string = APP_TZ,
): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { ...opts, timeZone: tz });
}

/** Formatted instant with the zone spelled out, e.g. "Jul 30, 2026, 2:00 PM MST". */
export function formatInTzWithZone(
  iso: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
  tz: string = APP_TZ,
): string {
  const text = formatInTz(iso, opts, tz);
  return text === "—" ? text : `${text} ${APP_TZ_LABEL}`;
}
