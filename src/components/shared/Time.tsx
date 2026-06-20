// Client-side timestamp formatter. Server-rendered HTML uses UTC so initial
// markup is deterministic (no hydration mismatch); after mount, the useEffect
// swaps in the viewer's local timezone.

"use client";

import { useEffect, useState } from "react";

interface Props {
  iso: string | null | undefined;
  dateOnly?: boolean;
}

function fmt(iso: string, dateOnly: boolean, locale?: string, timeZone?: string) {
  // Date-only strings (YYYY-MM-DD) — parse as local midnight so a UTC midnight
  // doesn't shift into the previous calendar day in eastern timezones.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  const d = new Date(iso);
  if (dateOnly) {
    return d.toLocaleDateString(locale, {
      month: "short", day: "numeric", year: "numeric", timeZone,
    });
  }
  return d.toLocaleString(locale, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone,
  });
}

export default function Time({ iso, dateOnly = false }: Props) {
  // Server + first-pass client render use UTC so SSR markup matches the initial
  // client render exactly. The useEffect below then upgrades to local TZ.
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    setText(fmt(iso, dateOnly));
  }, [iso, dateOnly]);

  if (!iso) return <>—</>;
  const initial = fmt(iso, dateOnly, "en-US", "UTC");
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text ?? initial}
    </time>
  );
}
