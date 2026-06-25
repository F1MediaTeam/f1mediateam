// The "shared" client dashboard. Same component for every client; widgets
// shown/hidden by client.config.widgets.

import Link from "next/link";
import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { createClientCalendarEventAction } from "./actions";
import { isoDate, formatDateTime } from "@/lib/utils";
import MultiMetricCard from "@/components/shared/MultiMetricCard";
import GscDashboard from "@/components/shared/GscDashboard";
import SeoMetricsRow from "@/components/shared/SeoMetricsRow";
import OrganicKeywordsPanel from "@/components/shared/OrganicKeywordsPanel";
import SemrushInsights from "@/components/shared/SemrushInsights";
import { buildSemrushChartData } from "@/lib/semrush-charts";
import ContentCardControls from "@/components/shared/ContentCardControls";
import ContentDetailModal from "@/components/shared/ContentDetailModal";
import CalendarAddModal from "@/components/client/CalendarAddModal";
import Time from "@/components/shared/Time";
import { approveContentAction, requestChangesAction } from "./actions";
import { parseEventNotes } from "@/lib/calendar-event-url";
import type { ContentCard } from "@/lib/types";

export default async function ClientHome() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const widgets = client.config.widgets;
  const [events, content, semrushReports] = await Promise.all([
    data.listCalendar({ clientId: client.id }),
    data.listContent({ clientId: client.id }),
    data.listSemrushReports(client.id),
  ]);
  const semrushChart = buildSemrushChartData(semrushReports);

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
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
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
          <CardBody className="pt-5">
            {/* Centered month title with the + Add button right-aligned on the
                same row — matches the admin dashboard's calendar header. */}
            <div className="relative mb-4">
              <div className="text-center text-xl font-semibold tracking-tight">{monthLabel}</div>
              <div className="absolute top-0 right-0">
                <CalendarAddModal action={createClientCalendarEventAction} />
              </div>
            </div>
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
                        const { url } = parseEventNotes(e.notes);
                        const cls = "truncate text-[11px] rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 flex items-center gap-1";
                        const title = `${e.title} — ${formatDateTime(e.starts_at)}${n ? ` · ${n} attachment${n === 1 ? "" : "s"}` : ""}${url ? ` · ${url}` : ""}`;
                        const inner = (
                          <>
                            <span className="truncate flex-1">{e.type === "deadline" ? "◆ " : "● "}{e.title}</span>
                            {url ? <span className="opacity-80 text-[9px]">↗</span> : null}
                            {n > 0 ? <span className="font-mono text-[9px] opacity-90">📎{n}</span> : null}
                          </>
                        );
                        return url ? (
                          <a key={e.id} href={url} target="_blank" rel="noopener noreferrer" title={title} className={cls + " hover:brightness-110"}>
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

      {(widgets.rankings || widgets.traffic) ? (
        <section className="mb-10">
          {widgets.rankings ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] mb-6">
              <div className="px-5 py-4 text-center border-b border-[var(--color-border)]">
                <h2 className="text-2xl font-semibold tracking-tight">SEO insights</h2>
              </div>
              <div className="p-5">
                <SeoMetricsRow clientId={client.id} embedded />
              </div>
            </div>
          ) : (
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">SEO insights</h2>
            </div>
          )}
          {widgets.rankings ? (
            <div className="mb-6">
              <OrganicKeywordsPanel clientId={client.id} />
            </div>
          ) : null}
          <div className="space-y-6">
            {widgets.rankings ? (
              <GscSearchSection clientId={client.id} />
            ) : null}
            {widgets.traffic ? (
              <MultiMetricCard
                clientId={client.id}
                title="Site Traffic"
                metrics={[
                  { metric: "sessions",     label: "Sessions",     color: "#22d3ee" },
                  { metric: "active_users", label: "Active users", color: "#f472b6" },
                  { metric: "conversions",  label: "Conversions",  color: "#facc15" },
                ]}
              />
            ) : null}
            {widgets.rankings ? (
              <MultiMetricCard
                clientId={client.id}
                title="Organic Performance"
                metrics={[
                  { metric: "bing_clicks",                  label: "Clicks",             color: "#60a5fa" },
                  { metric: "bing_impressions",             label: "Impressions",        color: "#a78bfa" },
                  { metric: "bing_avg_click_position",      label: "Avg click position", color: "#f59e0b", aggregation: "average", invert: true },
                  { metric: "bing_avg_impression_position", label: "Avg impr position",  color: "#fb7185", aggregation: "average", invert: true },
                ]}
              />
            ) : null}
            {widgets.rankings && semrushChart.hasAny ? (
              <SemrushInsights data={semrushChart} />
            ) : null}
          </div>
        </section>
      ) : null}

    </ClientShell>
  );
}

// GSC-style search-performance section. Loads the four time-series (clicks,
// impressions, ctr, avg position) plus a top-queries table (SEMrush) and
// hands them to the interactive dashboard component. Falls back gracefully
// when SEMrush isn't configured.
async function GscSearchSection({ clientId }: { clientId: string }) {
  const [clicks, impressions, position, ctr] = await Promise.all([
    data.listSnapshots({ clientId, metric: "clicks" }),
    data.listSnapshots({ clientId, metric: "impressions" }),
    data.listSnapshots({ clientId, metric: "avg_position" }),
    data.listSnapshots({ clientId, metric: "ctr" }),
  ]);

  // Most recent snapshot date across all series.
  const latest = [clicks, impressions, position]
    .flat()
    .map((s) => s.captured_at)
    .sort()
    .pop();

  return (
    <GscDashboard
      clientId={clientId}
      clicks={clicks.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
      impressions={impressions.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
      position={position.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
      ctr={ctr.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
      lastUpdated={latest ?? undefined}
    />
  );
}

// One of the three status columns at the top of the overview. Each card is
// click-to-detail, with a 3-dot actions menu in its top-right for proposed
// cards (Request changes). Count label dropped per design.
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
    <Card className="flex flex-col h-full">
      <CardHeader title={<Pill tone={tone}>{label}</Pill>} />
      <CardBody className="space-y-2 flex-1">
        {visible.length === 0 ? (
          <div className="text-xs text-[var(--color-text-subtle)] italic">Empty.</div>
        ) : (
          visible.map((card) => (
            <div
              key={card.id}
              className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
            >
              <div className="absolute top-2 right-2">
                <ContentCardControls
                  card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage }}
                  role="client"
                  updateAction={approveContentAction}
                  requestChangesAction={requestChangesAction}
                />
              </div>
              <ContentDetailModal
                triggerClassName="block w-full text-left pr-8"
                card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage, created_at: card.created_at, updated_at: card.updated_at }}
                companyName={companyName}
                events={[]}
                triggerLabel={
                  <>
                    <div className="text-sm font-medium leading-snug break-words">{card.title}</div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-muted)] font-mono">
                      {companyName} · updated <Time iso={card.updated_at} />
                    </div>
                    {card.body ? (
                      <div className="mt-1.5 text-xs text-[var(--color-text-muted)] line-clamp-2 break-words">
                        {card.body}
                      </div>
                    ) : null}
                    <div className="mt-2 text-[10px] text-[var(--color-accent)] opacity-70">Click for details ↗</div>
                  </>
                }
              />
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
