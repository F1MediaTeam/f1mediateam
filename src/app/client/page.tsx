// The "shared" client dashboard. Same component for every client; widgets
// shown/hidden by client.config.widgets.

import Link from "next/link";
import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import { createClientCalendarEventAction } from "./actions";
import MultiMetricCard from "@/components/shared/MultiMetricCard";
import GscDashboard from "@/components/shared/GscDashboard";
import OrganicKeywordsPanel from "@/components/shared/OrganicKeywordsPanel";
import SemrushInsights from "@/components/shared/SemrushInsights";
import { buildSemrushChartData } from "@/lib/semrush-charts";
import RequestChangesModal from "@/components/client/RequestChangesModal";
import ContentDetailModal from "@/components/shared/ContentDetailModal";
import ClientCalendar from "@/components/client/ClientCalendar";
import Time from "@/components/shared/Time";
import { approveContentAction, requestChangesAction } from "./actions";
import { visibleCards } from "@/lib/content-visibility";
import type { ContentCard, ContentCardEvent } from "@/lib/types";

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

  // Stage history + attached images per content card — the detail popup
  // shows the same activity log and inline images the admin side gets.
  const [contentEventsByCard, contentImagesByCard] = await Promise.all([
    data.listContentEventsByCards(content.map((c) => c.id)),
    data.listContentImagesByCards(content.map((c) => c.id)),
  ]);

  // Three-column status preview: proposed = awaiting approval, pending =
  // approved & being posted, posted = live. Most recent first per column.
  // Posted cards past the cutoff are dropped here too, so the overview agrees
  // with the content board instead of showing a higher Live count.
  const onBoard = visibleCards(content);
  const byStage = {
    proposed: onBoard.filter((c) => c.stage === "proposed").sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    pending:  onBoard.filter((c) => c.stage === "pending").sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    posted:   onBoard.filter((c) => c.stage === "posted").sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  };

  const upcomingMeetings = [...events]
    .filter((e) => e.type === "meeting" && e.starts_at >= new Date().toISOString())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4);

  return (
    <ClientShell session={session} client={client} active="/client">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Overview
        </div>
        <h1 className="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight">Welcome back.</h1>
      </div>

      {widgets.content ? (
        <div className="mb-10 grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <StatusColumn
            tone="warn"
            label="Awaiting Your Approval"
            cards={byStage.proposed}
            companyName={client.company_name}
            seeAllHref="/client/content"
            eventsByCard={contentEventsByCard}
            imagesByCard={contentImagesByCard}
          />
          <StatusColumn
            tone="accent"
            label="Approved — Being Posted"
            cards={byStage.pending}
            companyName={client.company_name}
            seeAllHref="/client/content"
            eventsByCard={contentEventsByCard}
            imagesByCard={contentImagesByCard}
          />
          <StatusColumn
            tone="ok"
            label="Live"
            cards={byStage.posted}
            companyName={client.company_name}
            seeAllHref="/client/content"
            eventsByCard={contentEventsByCard}
            imagesByCard={contentImagesByCard}
          />
        </div>
      ) : null}

      {widgets.calendar ? (
        <ClientCalendar
          events={events}
          action={createClientCalendarEventAction}
          className="mb-10"
        />
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
              <OrganicKeywordsPanel clientId={client.id} embedded />
            </div>
          ) : (
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">SEO insights</h2>
            </div>
          )}
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
  // One round trip for all four series (was four parallel queries).
  const grouped = await data.listSnapshotsByMetrics({
    clientId,
    metrics: ["clicks", "impressions", "avg_position", "ctr"],
  });
  const clicks = grouped.get("clicks") ?? [];
  const impressions = grouped.get("impressions") ?? [];
  const position = grouped.get("avg_position") ?? [];
  const ctr = grouped.get("ctr") ?? [];

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
  eventsByCard,
  imagesByCard,
}: {
  tone: "warn" | "accent" | "ok";
  label: string;
  cards: ContentCard[];
  companyName: string;
  seeAllHref: string;
  eventsByCard: Map<string, ContentCardEvent[]>;
  imagesByCard: Map<string, string[]>;
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
              <ContentDetailModal
                triggerClassName="block w-full text-left"
                card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage, created_at: card.created_at, updated_at: card.updated_at }}
                companyName={companyName}
                events={(eventsByCard.get(card.id) ?? []).map((e) => ({
                  id: e.id,
                  created_at: e.created_at,
                  from_stage: e.from_stage,
                  to_stage: e.to_stage,
                  actor_role: e.actor_role,
                  note: e.note,
                }))}
                attachmentImages={imagesByCard.get(card.id) ?? []}
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
              {card.stage === "proposed" ? (
                <div className="mt-3 flex items-center gap-2">
                  <form action={approveContentAction} className="flex-1">
                    <input type="hidden" name="id" value={card.id} />
                    <Button size="sm" type="submit" className="w-full">Approve</Button>
                  </form>
                  <RequestChangesModal
                    action={requestChangesAction}
                    card={{ id: card.id, title: card.title, body: card.body, link: card.link }}
                  />
                </div>
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
