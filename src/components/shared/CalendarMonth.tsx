"use client";

// One interactive month grid for every calendar in the app (client overview,
// client content tab, admin dashboard, admin master calendar).
//
// - Today is highlighted in the accent color.
// - Clicking any day selects it (a ring highlight) and lists that day's events
//   below the grid.
// - Clicking any event — in a cell or in the day list — opens a detail popup
//   with the time, type, client, notes, link, and attachment count.
//
// "Today" is computed in the browser's local timezone: the server runs in UTC,
// so a server-computed "today" can be off by a day for the viewer.

import { useState, type ReactNode } from "react";
import { X, Calendar as CalIcon, ExternalLink, Paperclip } from "lucide-react";
import { parseEventNotes } from "@/lib/calendar-event-url";
import { useHydrated } from "@/lib/use-hydrated";

export interface CalEvent {
  id: string;
  title: string;
  type: "meeting" | "deadline";
  starts_at: string;
  notes: string | null;
  /** company name, when the calendar spans multiple clients (admin) */
  clientLabel?: string | null;
  /** attachment count for a 📎 badge */
  attachmentCount?: number;
  /** tailwind chip classes, e.g. "bg-sky-500/10 text-sky-300"; defaults to emerald */
  chipClass?: string;
}

function localIsoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDayLabel(iso: string): string {
  // Parse as a local date (avoid the UTC shift a bare `new Date("YYYY-MM-DD")` causes).
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const DEFAULT_CHIP = "bg-emerald-500/10 text-emerald-300";

export default function CalendarMonth({
  days,
  monthKey,
  events,
  minCellHeight = "min-h-[54px] sm:min-h-[80px]",
  maxPerCell = 3,
  addSlot,
  monthLabel,
}: {
  /** 42 ISO date strings (Sun-aligned 6×7 grid) */
  days: string[];
  /** "YYYY-MM" of the displayed month — cells outside it are dimmed */
  monthKey: string;
  events: CalEvent[];
  minCellHeight?: string;
  maxPerCell?: number;
  /** the "+ Add" control, rendered top-right */
  addSlot?: ReactNode;
  monthLabel?: string;
}) {
  const hydrated = useHydrated();
  const todayIso = hydrated ? localIsoToday() : "";
  const [selected, setSelected] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null);

  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const key = e.starts_at.slice(0, 10);
    const arr = byDay.get(key) ?? [];
    arr.push(e);
    byDay.set(key, arr);
  }

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  function Chip({ e }: { e: CalEvent }) {
    const { url } = parseEventNotes(e.notes);
    return (
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          setOpenEvent(e);
        }}
        title={`${e.title} — ${fmtDateTime(e.starts_at)}`}
        className={
          "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] transition hover:brightness-125 " +
          (e.chipClass ?? DEFAULT_CHIP)
        }
      >
        <span className="truncate">
          {e.type === "deadline" ? "◆ " : "● "}
          {e.title}
        </span>
        {url ? <span className="ml-0.5 opacity-70">↗</span> : null}
        {e.attachmentCount ? <span className="ml-0.5 font-mono text-[9px] opacity-90">📎{e.attachmentCount}</span> : null}
      </button>
    );
  }

  return (
    <div>
      {monthLabel ? (
        <div className="relative mb-4">
          <div className="text-center text-xl font-semibold tracking-tight">{monthLabel}</div>
          {addSlot ? <div className="absolute top-0 right-0">{addSlot}</div> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-7 text-[10px] sm:text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-0.5 sm:px-2 py-1 text-center sm:text-left">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((key) => {
          const inMonth = key.slice(0, 7) === monthKey;
          const isToday = key === todayIso;
          const isSelected = key === selected;
          const dayEvents = byDay.get(key) ?? [];
          const dayNum = Number(key.slice(8, 10));
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(isSelected ? null : key)}
              className={
                "rounded-md sm:rounded-lg border p-1 sm:p-2 text-left transition " +
                minCellHeight +
                " " +
                (isSelected
                  ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-inset bg-[var(--color-accent-soft)]"
                  : isToday
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] ring-2 ring-[var(--color-accent)] ring-inset"
                    : inMonth
                      ? "border-[var(--color-border)] bg-[var(--color-bg-elev)] hover:border-[var(--color-border-strong)]"
                      : "border-[var(--color-border)]/40 bg-[var(--color-bg-elev)]/40 opacity-50 hover:opacity-80")
              }
            >
              <div className="mb-1 flex items-center justify-between text-[10px] sm:text-[11px]">
                <span
                  className={
                    isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] font-semibold text-[var(--color-on-accent)]"
                      : "text-[var(--color-text-muted)]"
                  }
                >
                  {dayNum}
                </span>
                {isToday ? (
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--color-accent)]">
                    Today
                  </span>
                ) : null}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, maxPerCell).map((e) => (
                  <Chip key={e.id} e={e} />
                ))}
                {dayEvents.length > maxPerCell ? (
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    +{dayEvents.length - maxPerCell} more
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected-day list */}
      {selected ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{fmtDayLabel(selected)}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <X size={15} />
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="py-2 text-xs text-[var(--color-text-subtle)]">Nothing scheduled this day.</div>
          ) : (
            <div className="space-y-1.5">
              {selectedEvents
                .slice()
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                .map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setOpenEvent(e)}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-left hover:border-[var(--color-border-strong)]"
                  >
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {e.type === "deadline" ? "◆" : "●"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-subtle)]">
                      {new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Event detail popup */}
      {openEvent ? (
        <EventDetail event={openEvent} onClose={() => setOpenEvent(null)} />
      ) : null}
    </div>
  );
}

function EventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const { url, body } = parseEventNotes(event.notes);
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                (event.type === "deadline"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]")
              }
            >
              {event.type}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={18} />
          </button>
        </div>

        <h3 className="text-lg font-semibold leading-snug">{event.title}</h3>

        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <CalIcon size={15} className="shrink-0" />
            <span>{fmtDateTime(event.starts_at)}</span>
          </div>
          {event.clientLabel ? (
            <div className="text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text-subtle)]">Client:</span> {event.clientLabel}
            </div>
          ) : null}
          {event.attachmentCount ? (
            <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <Paperclip size={14} />
              {event.attachmentCount} attachment{event.attachmentCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>

        {body ? (
          <p className="mt-3 whitespace-pre-wrap border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-text)]">
            {body}
          </p>
        ) : null}

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-on-accent)]"
          >
            <ExternalLink size={15} /> Open link
          </a>
        ) : null}
      </div>
    </div>
  );
}
