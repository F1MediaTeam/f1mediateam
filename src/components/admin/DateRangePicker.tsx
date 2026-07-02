"use client";

// On-brand date-range picker for the report generator's custom time frame.
// Replaces the unstylable native <input type="date"> popup: one trigger
// button opens a popover calendar (two months on desktop, one on mobile);
// click a start day then an end day. Emits plain hidden inputs so the
// parent <form>'s FormData sees `from`/`to` as ISO dates exactly like the
// native inputs did.

import { useEffect, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  fromName: string;
  toName: string;
  defaultFrom?: string; // ISO yyyy-MM-dd
  defaultTo?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function Month({
  month,
  from,
  to,
  hovered,
  onPick,
  onHover,
}: {
  month: Date;
  from: string | null;
  to: string | null;
  hovered: string | null;
  onPick: (day: string) => void;
  onHover: (day: string | null) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
  const today = new Date();
  // While picking the end date, preview the band up to the hovered day.
  const rangeEnd = to ?? (from && hovered && hovered > from ? hovered : null);

  return (
    <div className="w-[308px]">
      <div className="text-base font-semibold text-center mb-4">
        {format(month, "MMMM yyyy")}
      </div>
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="h-9 grid place-items-center text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1.5" onMouseLeave={() => onHover(null)}>
        {days.map((day) => {
          if (!isSameMonth(day, month)) {
            return <div key={iso(day)} className="h-10" />;
          }
          const dayIso = iso(day);
          const isStart = from === dayIso;
          const isEnd = (to ?? rangeEnd) === dayIso && !isStart;
          const inBand =
            from && rangeEnd && dayIso > from && dayIso < rangeEnd;

          return (
            <button
              key={dayIso}
              type="button"
              onClick={() => onPick(dayIso)}
              onMouseEnter={() => onHover(dayIso)}
              className={cn(
                "h-10 w-10 mx-auto grid place-items-center rounded-lg text-[15px] tabular-nums transition",
                isStart || isEnd
                  ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] font-semibold"
                  : inBand
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-text)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]",
                isSameDay(day, today) && !isStart && !isEnd
                  ? "ring-1 ring-inset ring-[var(--color-accent)]/50"
                  : null,
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({ fromName, toName, defaultFrom, defaultTo }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(defaultFrom || null);
  const [to, setTo] = useState<string | null>(defaultTo || null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(defaultFrom ? parseISO(defaultFrom) : new Date()),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(day: string) {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
    } else if (day < from) {
      setFrom(day);
    } else {
      setTo(day);
      setOpen(false);
    }
  }

  const label =
    from && to
      ? `${format(parseISO(from), "MMM d, yyyy")} – ${format(parseISO(to), "MMM d, yyyy")}`
      : from
        ? `${format(parseISO(from), "MMM d, yyyy")} – pick end date`
        : "Select dates…";

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={fromName} value={from ?? ""} />
      <input type="hidden" name={toName} value={to ?? ""} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-12 items-center gap-2.5 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 text-sm font-medium transition hover:bg-[var(--color-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40",
          !from && "text-[var(--color-text-muted)]",
        )}
      >
        <Calendar size={16} className="text-[var(--color-accent)]" />
        <span className="tabular-nums">{label}</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-xl shadow-black/40 p-6">
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="absolute left-6 top-5 h-9 w-9 grid place-items-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="absolute right-6 top-5 h-9 w-9 grid place-items-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex gap-10">
            <Month
              month={viewMonth}
              from={from}
              to={to}
              hovered={hovered}
              onPick={pick}
              onHover={setHovered}
            />
            <div className="hidden sm:block">
              <Month
                month={addMonths(viewMonth, 1)}
                from={from}
                to={to}
                hovered={hovered}
                onPick={pick}
                onHover={setHovered}
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => {
                setFrom(null);
                setTo(null);
              }}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
            >
              Clear
            </button>
            <span className="text-xs text-[var(--color-text-muted)]">
              {!from
                ? "Pick a start date"
                : !to
                  ? "Now pick the end date"
                  : `${format(parseISO(from), "MMM d")} – ${format(parseISO(to), "MMM d, yyyy")}`}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
