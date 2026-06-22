// The "shared" client dashboard. Same component for every client; widgets
// shown/hidden by client.config.widgets.

import Link from "next/link";
import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { createClientCalendarEventAction } from "./actions";
import { isoDate, formatDateTime } from "@/lib/utils";
import MetricCompare from "@/components/shared/MetricCompare";
import CalendarAddModal from "@/components/client/CalendarAddModal";
import Time from "@/components/shared/Time";
import type { ContentCard } from "@/lib/types";

export default async function ClientHome() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const widgets = client.config.widgets;
  const [events, content] = await Promise.all([
    data.listCalendar({ clientId: client.id }),
    data.listContent({ clientId: client.id }),
  ]);

  // Count attachments per event so the calendar grid can show a 📎 N badge.
  const attachments = await data.listAttachmentsForEvents(events.map((e) => e.id));
  const attCount = new Map<string, number>();
  for (const a of attachments) attCount.set(a.event_id, (attCount.get(a.event_id) ?? 0) + 1);

  // Three-column status preview: proposed = awaiting approval, pending =
  // approved & being posted, posted = live. Most recent first per column.
  const byStage = {
    proposed: content.filter((c) => c.stage === "proposed").sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    pending:  content.filter((c) => c.stage === "pending").sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    posted:   content.filter((c) => c.stage === "posted").sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  };

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

      {widgets.content ? (
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <StatusColumn
            tone="warn"
            label="Awaiting Your Approval"
            cards={byStage.proposed}
            companyName={client.company_name}
            seeAllHref="/client/content"
          />
          <StatusColumn
            tone="accent"
            label="Approved — Being Posted"
            cards={byStage.pending}
            companyName={client.company_name}
            seeAllHref="/client/content"
          />
          <StatusColumn
            tone="ok"
            label="Live"
            cards={byStage.posted}
            companyName={client.company_name}
            seeAllHref="/client/content"
          />
        </div>
      ) : null}

      {widgets.calendar ? (
        <Card className="mb-10">
          <CardHeader
            title={`Calendar · ${monthLabel}`}
            right={<CalendarAddModal action={createClientCalendarEventAction} />}
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
                      {dayEvents.slice(0, 2).map((e) => {
                        const n = attCount.get(e.id) ?? 0;
                        return (
                          <div
                            key={e.id}
                            title={`${e.title} — ${formatDateTime(e.starts_at)}${n ? ` · ${n} attachment${n === 1 ? "" : "s"}` : ""}`}
                            className="truncate text-[11px] rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 flex items-center gap-1"
                          >
                            <span className="truncate flex-1">{e.type === "deadline" ? "◆ " : "● "}{e.title}</span>
                            {n > 0 ? <span className="font-mono text-[9px] opacity-90">📎{n}</span> : null}
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

// One of the three status columns at the top of the overview. Renders the
// stage pill + count, then up to 3 most-recent cards. Clickable area sends
// the client to the full /client/content board.
function StatusColumn({
  tone,
  label,
  cards,
  companyName,
  seeAllHref,
}: {
  tone: "warn" | "accent" | "ok";
  label: string;
  cards: ContentCard[];
  companyName: string;
  seeAllHref: string;
}) {
  const visible = cards.slice(0, 3);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={<Pill tone={tone}>{label}</Pill>}
        right={<span className="font-mono text-xs text-[var(--color-text-muted)]">{cards.length}</span>}
      />
      <CardBody className="space-y-2">
        {visible.length === 0 ? (
          <div className="text-xs text-[var(--color-text-subtle)] italic">Empty.</div>
        ) : (
          visible.map((card) => (
            <div
              key={card.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
            >
              <div className="text-sm font-medium leading-snug">{card.title}</div>
              <div className="mt-1 text-[11px] text-[var(--color-text-muted)] font-mono">
                {companyName} · updated <Time iso={card.updated_at} />
              </div>
              {card.body ? (
                <div className="mt-1.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
                  {card.body}
                </div>
              ) : null}
              {card.link ? (
                <a
                  href={card.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-[var(--color-accent)] hover:underline"
                >
                  {card.link.replace(/^https?:\/\//, "")} ↗
                </a>
              ) : null}
            </div>
          ))
        )}
        {cards.length > visible.length ? (
          <Link
            href={seeAllHref}
            className="block text-center text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)] pt-1"
          >
            See all {cards.length} →
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}
