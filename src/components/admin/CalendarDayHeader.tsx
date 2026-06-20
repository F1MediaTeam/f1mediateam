// Day-cell header for the master calendar. The "today" highlight has to be
// computed on the client because the server runs in UTC — what UTC calls
// "today" can be tomorrow (or yesterday) in the viewer's local timezone.

"use client";

import { useEffect, useState } from "react";

interface Props {
  iso: string;       // YYYY-MM-DD for this cell
  dayNumber: number; // 1..31 for display
}

function localIsoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarDayHeader({ iso, dayNumber }: Props) {
  const [isToday, setIsToday] = useState(false);
  useEffect(() => {
    setIsToday(localIsoToday() === iso);
  }, [iso]);

  return (
    <div className="flex items-center justify-between text-[11px] mb-1">
      <span
        className={
          isToday
            ? "text-[var(--color-accent)] font-semibold"
            : "text-[var(--color-text-muted)]"
        }
      >
        {dayNumber}
      </span>
      {isToday ? (
        <span className="text-[9px] uppercase text-[var(--color-accent)] tracking-widest">
          Today
        </span>
      ) : null}
    </div>
  );
}
