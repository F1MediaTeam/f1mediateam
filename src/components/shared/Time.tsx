// Timestamp formatter pinned to the company timezone (Phoenix).
//
// It used to render UTC on the server and switch to the viewer's local zone
// after hydration, which meant a meeting read differently depending on who was
// looking, and flashed a wrong time on first paint. Formatting in a fixed zone
// makes the server and client output identical — no hydration dance needed —
// and means "3:00 PM" means the same thing to everyone on the team.

import { APP_TZ, APP_TZ_LABEL } from "@/lib/timezone";

interface Props {
  iso: string | null | undefined;
  dateOnly?: boolean;
  /** append "MST" — worth it anywhere someone might act on the time */
  withZone?: boolean;
}

function fmt(iso: string, dateOnly: boolean): string {
  // Date-only strings (YYYY-MM-DD) carry no instant, so pin them to UTC and
  // format in UTC — that round-trips the same calendar date in any zone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    });
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (dateOnly) {
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: APP_TZ,
    });
  }
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: APP_TZ,
  });
}

export default function Time({ iso, dateOnly = false, withZone = false }: Props) {
  if (!iso) return <>—</>;
  const text = fmt(iso, dateOnly);
  const suffix = withZone && !dateOnly && text !== "—" ? ` ${APP_TZ_LABEL}` : "";
  return (
    <time dateTime={iso}>
      {text}
      {suffix}
    </time>
  );
}
