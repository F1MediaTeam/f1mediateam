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
// Every date here is a Phoenix date. Two traps this avoids:
//   * `starts_at.slice(0, 10)` is the UTC date, so anything from 5pm Phoenix
//     onward would be filed under tomorrow.
//   * "Today" from the server is UTC's today, and from the browser it's the
//     viewer's today. Both can disagree with Phoenix, so we ask for Phoenix
//     explicitly — which also means server and client render identically.

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X, Calendar as CalIcon, ExternalLink, Paperclip } from "lucide-react";
import { parseEventNotes } from "@/lib/calendar-event-url";
import { formatInTzWithZone, tzDateKey, tzTodayKey, wallTimeToUtcIso, utcIsoToWallTime } from "@/lib/timezone";

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
  /** the client's brand color as a CSS background (hex, hsl, or gradient) —
   *  drives a colored dot on the chip and a swatch in the detail popup so an
   *  event reads as belonging to a specific client */
  accentColor?: string;
  /** the client's designated colour applied to the chip itself, so the block
   *  behind the text identifies the client at a glance. Takes precedence over
   *  chipClass when set. */
  chipStyle?: { background: string; color: string; borderColor: string };
}

function fmtDateTime(iso: string): string {
  return formatInTzWithZone(iso, {
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
  reschedule,
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
  /** when provided, events can be dragged to another day to reschedule them */
  reschedule?: (id: string, newStartIso: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const todayIso = tzTodayKey();
  const [selected, setSelected] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<CalEvent | null>(null);

  // Local copy so a drag reschedules optimistically; re-synced when the server
  // sends fresh events after router.refresh().
  const [items, setItems] = useState(events);
  // Re-sync during render rather than in an effect: an effect would paint the
  // stale list first, so a reverted drag would visibly flicker back.
  const [lastEvents, setLastEvents] = useState(events);
  if (events !== lastEvents) {
    setLastEvents(events);
    setItems(events);
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const byDay = new Map<string, CalEvent[]>();
  for (const e of items) {
    const key = tzDateKey(e.starts_at);
    const arr = byDay.get(key) ?? [];
    arr.push(e);
    byDay.set(key, arr);
  }

  function handleDrop(targetKey: string) {
    setDragOverDay(null);
    const id = dragId;
    setDragId(null);
    if (!id || !reschedule) return;
    const ev = items.find((e) => e.id === id);
    if (!ev || tzDateKey(ev.starts_at) === targetKey) return;
    // Keep the Phoenix time-of-day and move only the Phoenix date, then convert
    // back to UTC. Splicing the UTC time onto the new key would shift an
    // evening event by a day, since its UTC date is already tomorrow.
    const wallTime = utcIsoToWallTime(ev.starts_at).slice(11); // "HH:mm"
    const newStart = wallTimeToUtcIso(`${targetKey}T${wallTime}`);
    if (!newStart) return;
    const prev = items;
    setItems((list) => list.map((e) => (e.id === id ? { ...e, starts_at: newStart } : e)));
    setNote(null);
    reschedule(id, newStart).then((res) => {
      if (res?.error) {
        setItems(prev); // revert on failure
        setNote(res.error);
      } else {
        router.refresh();
      }
    });
  }

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  function Chip({ e }: { e: CalEvent }) {
    const { url } = parseEventNotes(e.notes);
    return (
      <button
        type="button"
        draggable={Boolean(reschedule)}
        onDragStart={(ev) => {
          ev.dataTransfer.effectAllowed = "move";
          ev.dataTransfer.setData("text/plain", e.id);
          setDragId(e.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDragOverDay(null);
        }}
        onClick={(ev) => {
          ev.stopPropagation();
          setOpenEvent(e);
        }}
        title={reschedule ? `${e.title} — drag to another day to reschedule` : `${e.title} — ${fmtDateTime(e.starts_at)}`}
        style={
          e.chipStyle
            ? { background: e.chipStyle.background, color: e.chipStyle.color, borderLeft: `3px solid ${e.chipStyle.borderColor}` }
            : undefined
        }
        className={
          "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] transition hover:brightness-125 " +
          (reschedule ? "cursor-grab active:cursor-grabbing " : "") +
          (e.chipStyle ? "" : (e.chipClass ?? DEFAULT_CHIP))
        }
      >
        <span className="flex items-center gap-1 truncate">
          {e.chipStyle ? (
            // The chip itself already carries the client's colour; a dot would
            // just repeat it.
            <span aria-hidden>{e.type === "deadline" ? "◆" : "●"}</span>
          ) : e.accentColor ? (
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: e.accentColor }}
            />
          ) : (
            <span aria-hidden>{e.type === "deadline" ? "◆" : "●"}</span>
          )}
          <span className="truncate">{e.title}</span>
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
              onDragOver={
                reschedule
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverDay !== key) setDragOverDay(key);
                    }
                  : undefined
              }
              onDragLeave={reschedule ? () => setDragOverDay((d) => (d === key ? null : d)) : undefined}
              onDrop={reschedule ? () => handleDrop(key) : undefined}
              className={
                "rounded-md sm:rounded-lg border p-1 sm:p-2 text-left transition " +
                minCellHeight +
                " " +
                (dragOverDay === key
                  ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-inset bg-[var(--color-accent)]/20"
                  : isSelected
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

      {reschedule ? (
        <p className="mt-2 text-[11px] text-[var(--color-text-subtle)]">
          Tip: drag an event to another day to reschedule it.
        </p>
      ) : null}
      {note ? <p className="mt-1 text-[11px] text-red-400">{note}</p> : null}

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
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl"
      >
        {/* Client color bar across the top — themes the card for that client. */}
        {event.accentColor ? (
          <div className="h-1.5 w-full" style={{ background: event.accentColor }} />
        ) : null}
        <div className="p-5">
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
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              {event.accentColor ? (
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: event.accentColor }}
                />
              ) : null}
              <span>
                <span className="text-[var(--color-text-subtle)]">Client:</span> {event.clientLabel}
              </span>
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
    </div>
  );
}
