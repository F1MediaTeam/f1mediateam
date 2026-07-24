// The client portal's month calendar.
//
// Extracted from the Overview so the Content tab can show the same thing
// without a second copy drifting out of sync. Server component: it fetches
// its own attachment counts, so a caller only has to hand it the events and
// the "add event" action.

import { Card, CardBody } from "@/components/ui";
import CalendarAddModal from "@/components/client/CalendarAddModal";
import { data } from "@/lib/data";
import { isoDate, formatDateTime } from "@/lib/utils";
import { parseEventNotes } from "@/lib/calendar-event-url";
import type { CalendarEvent } from "@/lib/types";

export default async function ClientCalendar({
  events,
  action,
  className = "",
}: {
  events: CalendarEvent[];
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  // Attachment counts per event so a day cell can show a 📎 N badge.
  const attachments = await data.listAttachmentsForEvents(events.map((e) => e.id));
  const attCount = new Map<string, number>();
  for (const a of attachments) attCount.set(a.event_id, (attCount.get(a.event_id) ?? 0) + 1);

  // Month grid for the current month: 6 rows × 7 days, padded from the Sunday
  // before the 1st so the columns line up under the weekday headings.
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const monthDays: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    monthDays.push(d);
  }
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const todayIso = isoDate();

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.starts_at.slice(0, 10);
    const arr = eventsByDay.get(key) ?? [];
    arr.push(e);
    eventsByDay.set(key, arr);
  }

  return (
    <Card className={className}>
      <CardBody className="pt-5">
        {/* Centered month title with the + Add button right-aligned on the
            same row — matches the admin dashboard's calendar header. */}
        <div className="relative mb-4">
          <div className="text-center text-xl font-semibold tracking-tight">{monthLabel}</div>
          <div className="absolute top-0 right-0">
            <CalendarAddModal action={action} />
          </div>
        </div>
        <div className="grid grid-cols-7 text-[10px] sm:text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-0.5 sm:px-2 py-1 text-center sm:text-left">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-6">
          {monthDays.map((d) => {
            const key = isoDate(d);
            const isCurrentMonth = d.getMonth() === now.getMonth();
            const isToday = key === todayIso;
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <div
                key={key}
                // Today gets an accent fill and ring so it's findable at a
                // glance, not just a differently-coloured date number.
                className={
                  "rounded-md sm:rounded-lg border p-1 sm:p-2 min-h-[54px] sm:min-h-[80px] " +
                  (isToday
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] ring-2 ring-[var(--color-accent)] ring-inset"
                    : isCurrentMonth
                      ? "border-[var(--color-border)] bg-[var(--color-bg-elev)]"
                      : "border-[var(--color-border)]/40 bg-[var(--color-bg-elev)]/40 opacity-50")
                }
              >
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] mb-1">
                  <span
                    className={
                      isToday
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] font-semibold text-[var(--color-on-accent)]"
                        : "text-[var(--color-text-muted)]"
                    }
                  >
                    {d.getDate()}
                  </span>
                  {isToday ? (
                    <span className="text-[9px] uppercase text-[var(--color-accent)] tracking-widest font-semibold">
                      Today
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map((e) => {
                    const n = attCount.get(e.id) ?? 0;
                    const { url } = parseEventNotes(e.notes);
                    const cls =
                      "truncate text-[11px] rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 flex items-center gap-1";
                    const title = `${e.title} — ${formatDateTime(e.starts_at)}${n ? ` · ${n} attachment${n === 1 ? "" : "s"}` : ""}${url ? ` · ${url}` : ""}`;
                    const inner = (
                      <>
                        <span className="truncate flex-1">
                          {e.type === "deadline" ? "◆ " : "● "}
                          {e.title}
                        </span>
                        {url ? <span className="opacity-80 text-[9px]">↗</span> : null}
                        {n > 0 ? <span className="font-mono text-[9px] opacity-90">📎{n}</span> : null}
                      </>
                    );
                    return url ? (
                      <a
                        key={e.id}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={title}
                        className={cls + " hover:brightness-110"}
                      >
                        {inner}
                      </a>
                    ) : (
                      <div key={e.id} title={title} className={cls}>
                        {inner}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 ? (
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      +{dayEvents.length - 2} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
