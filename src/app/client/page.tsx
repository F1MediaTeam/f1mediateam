// The "shared" client dashboard. Same component for every client; widgets
// shown/hidden by client.config.widgets.

import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import { createClientCalendarEventAction } from "./actions";
import { isoDate, formatDateTime } from "@/lib/utils";
import MetricCompare from "@/components/shared/MetricCompare";
import Time from "@/components/shared/Time";

export default async function ClientHome() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const widgets = client.config.widgets;
  const events = await data.listCalendar({ clientId: client.id });

  const upcomingMeetings = [...events]
    .filter((e) => e.type === "meeting" && e.starts_at >= new Date().toISOString())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4);

  // Build the month grid for the current month (6 rows × 7 days)
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDayIdx = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startDayIdx);
  const monthDays: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    monthDays.push(d);
  }
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const todayIso = isoDate();
  const eventsByDay = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.starts_at.slice(0, 10);
    const arr = eventsByDay.get(key) ?? [];
    arr.push(e);
    eventsByDay.set(key, arr);
  }

  return (
    <ClientShell session={session} client={client} active="/client">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Overview
        </div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Welcome back.</h1>
      </div>

      {widgets.calendar ? (
        <Card className="mb-10">
          <CardHeader
            title={`Calendar · ${monthLabel}`}
            right={
              <details className="relative">
                <summary className="list-none cursor-pointer">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] text-black px-3 h-8 text-xs font-medium">
                    + Add
                  </span>
                </summary>
                <div className="absolute right-0 mt-2 w-72 z-10 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] p-3 shadow-xl">
                  <form action={createClientCalendarEventAction} className="space-y-2">
                    <input
                      name="title"
                      required
                      placeholder="Title"
                      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-xs"
                    />
                    <select
                      name="type"
                      defaultValue="meeting"
                      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-xs"
                    >
                      <option value="meeting">Meeting</option>
                      <option value="deadline">Deadline</option>
                    </select>
                    <input
                      name="starts_at"
                      type="datetime-local"
                      required
                      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-xs"
                    />
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Notes (optional)"
                      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-xs"
                    />
                    <Button size="sm" type="submit" className="w-full">Add to calendar</Button>
                  </form>
                </div>
              </details>
            }
          />
          <CardBody>
            <div className="grid grid-cols-7 text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="px-2 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-6">
              {monthDays.map((d) => {
                const key = isoDate(d);
                const isCurrentMonth = d.getMonth() === now.getMonth();
                const isToday = key === todayIso;
                const dayEvents = eventsByDay.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={
                      "rounded-lg border p-2 min-h-[80px] " +
                      (isCurrentMonth
                        ? "border-[var(--color-border)] bg-[var(--color-bg-elev)]"
                        : "border-[var(--color-border)]/40 bg-[var(--color-bg-elev)]/40 opacity-50")
                    }
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className={isToday ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-text-muted)]"}>
                        {d.getDate()}
                      </span>
                      {isToday ? (
                        <span className="text-[9px] uppercase text-[var(--color-accent)] tracking-widest">
                          Today
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 2).map((e) => (
                        <div
                          key={e.id}
                          title={`${e.title} — ${formatDateTime(e.starts_at)}`}
                          className="truncate text-[11px] rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300"
                        >
                          {e.type === "deadline" ? "◆ " : "● "}{e.title}
                        </div>
                      ))}
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
      ) : null}

      {widgets.calendar && upcomingMeetings.length > 0 ? (
        <Card className="mb-10">
          <CardHeader title="Meetings" />
          <CardBody className="space-y-2">
            {upcomingMeetings.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)]">Nothing scheduled.</div>
            ) : (
              upcomingMeetings.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-sm">
                  <span>{e.title}</span>
                  <span className="font-mono text-xs text-[var(--color-text-muted)]"><Time iso={e.starts_at} /></span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      ) : null}

      {widgets.rankings ? (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Search performance</h2>
            <Pill>Google Search Console</Pill>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <MetricCompare clientId={client.id} metric="clicks"       label="Organic clicks" />
            <MetricCompare clientId={client.id} metric="impressions"  label="Impressions" />
            <MetricCompare clientId={client.id} metric="avg_position" label="Average position" hint="Lower is better" invert />
            <MetricCompare clientId={client.id} metric="visibility"   label="Search visibility" hint="Estimated visibility score" />
          </div>
        </section>
      ) : null}

      {widgets.traffic ? (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Site traffic</h2>
            <Pill>Google Analytics 4</Pill>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <MetricCompare clientId={client.id} metric="sessions" label="Sessions" />
          </div>
        </section>
      ) : null}

    </ClientShell>
  );
}
