// F1 Pulse — overview.
//
// One card per site: who is on it right now, today against yesterday, rank
// movement, and health. Sites needing attention sort first, because a list
// ordered by name buries the one that is down.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import Time from "@/components/shared/Time";
import { clientColor } from "@/lib/client-color";
import { filterClients } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { listSites, snippetFor } from "@/lib/pulse/sites";
import { lastRuns, overviewCards, portfolioExtras } from "@/lib/pulse/dashboard";
import { pulseOrigin } from "./actions";
import PulseAddSite from "@/components/admin/PulseAddSite";
import PulseInstallCard from "@/components/admin/PulseInstallCard";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import PortfolioTable, { type PortfolioRow } from "@/components/admin/pulse/PortfolioTable";
import RefreshButton from "@/components/admin/pulse/RefreshButton";
import LiveVisitors from "@/components/admin/pulse/LiveVisitors";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Awaiting first visit", tone: "var(--color-warn)" },
  live: { label: "Live", tone: "var(--color-ok)" },
  tag_missing: { label: "Tag missing", tone: "var(--color-warn)" },
  down: { label: "Site down", tone: "var(--color-bad)" },
};

/** Down first, then tag problems, then not-yet-installed, then the healthy. */
const URGENCY: Record<string, number> = { down: 0, tag_missing: 1, pending: 2, live: 3 };

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <span className="text-[var(--color-text-subtle)]">—</span>;
  // No percentage against a zero baseline: "+300%" from 1 to 4 visitors is
  // technically true and completely useless.
  if (before === 0) return <span style={{ color: "var(--color-ok)" }}>new</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span style={{ color: up ? "var(--color-ok)" : "var(--color-bad)" }}>
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export default async function PulsePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  // Cards for glancing at one client, table for "which of these needs me
  // today". URL state so a chosen view survives a refresh and is linkable.
  const view = sp.view === "table" ? "table" : "cards";
  const allowed = await visibleClientIds(session);
  const [allClients, origin] = await Promise.all([data.listClients(), pulseOrigin()]);
  const clients = filterClients(allClients, allowed);
  const sites = await listSites(allowed);
  const [cards, runs, extras] = await Promise.all([
    overviewCards(sites.map((s) => s.id)),
    lastRuns(null),
    portfolioExtras(sites.map((s) => s.id)),
  ]);

  const cardFor = (id: string) => cards.find((c) => c.siteId === id);
  const clientOf = (id: string) => clients.find((c) => c.id === id);

  const ordered = [...sites].sort(
    (a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9) || a.domain.localeCompare(b.domain),
  );
  const pending = ordered.filter((s) => s.status === "pending");
  const installed = ordered.filter((s) => s.status !== "pending");

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          subtitle="First-party, cookieless analytics for every client site."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/pulse?view=${view === "table" ? "cards" : "table"}`}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                {view === "table" ? "Card view" : "Table view"}
              </Link>
              <Link
                href="/admin/pulse/feed"
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Live feed
              </Link>
              <Link
                href="/admin/pulse/reports"
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Reports
              </Link>
              <RefreshButton collector="heartbeat" lastUpdated={runs.get("heartbeat")?.finishedAt} label="Refresh all" />
              {/* Search Console deletes anything older than 16 months, so this
                  is a one-time capture per client — and needs re-running each
                  time another client's Google account is connected. */}
              <RefreshButton
                collector="backfill"
                lastUpdated={runs.get("backfill")?.finishedAt}
                label="Import search history"
              />
              <PulseAddSite
                clients={clients.map((c) => ({
                  id: c.id,
                  company_name: c.company_name,
                  ui_color: c.ui_color ?? null,
                  websites: c.websites,
                }))}
              />
            </div>
          }
        />

        {sites.length === 0 ? (
          <Card>
            <CardBody>
              <div className="py-12 text-center">
                <div className="text-sm font-medium">No sites yet</div>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Add a client site to generate its key and install snippet. Nothing is measured
                  until the snippet is on the site and someone visits it.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {installed.length > 0 && view === "table" ? (
          <div className="mb-8">
            <PortfolioTable
              rows={installed.map((site): PortfolioRow => {
                const card = cardFor(site.id);
                const client = clientOf(site.client_id);
                const extra = extras.get(site.id);
                return {
                  siteId: site.id,
                  domain: site.domain,
                  clientName: client?.company_name ?? site.domain,
                  colour: client ? clientColor(client).hex : null,
                  status: site.status,
                  live: card?.liveVisitors ?? 0,
                  visitors: card?.today.visitors ?? 0,
                  visitorsPrev: card?.yesterday.visitors ?? 0,
                  conversions: card?.today.conversions ?? 0,
                  clicks: extra?.clicks ?? 0,
                  clicksPrev: extra?.clicksPrev ?? 0,
                  errors: card?.health.errors ?? 0,
                  opportunities: extra?.opportunities ?? 0,
                  strikeDistance: extra?.strikeDistance ?? 0,
                  indexed: extra?.indexed ?? null,
                  indexTotal: extra?.indexTotal ?? null,
                  competitors: extra?.competitors ?? 0,
                };
              })}
            />
          </div>
        ) : null}

        {installed.length > 0 && view === "cards" ? (
          <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {installed.map((site) => {
              const card = cardFor(site.id);
              const client = clientOf(site.client_id);
              const colour = client ? clientColor(client) : null;
              const status = STATUS[site.status] ?? STATUS.pending;
              const extra = extras.get(site.id);
              return (
                <div
                  key={site.id}
                  data-panel=""
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                  style={colour ? ({ "--panel-outline": colour.hex } as React.CSSProperties) : undefined}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/pulse/${site.id}`}
                        className="flex items-center gap-2 text-sm font-semibold hover:underline"
                      >
                        {colour ? (
                          <span aria-hidden className="h-3 w-3 shrink-0 rounded" style={{ background: colour.hex }} />
                        ) : null}
                        <span className="truncate">{client?.company_name ?? site.domain}</span>
                      </Link>
                      <div className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                        {site.domain}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                      style={{ background: `color-mix(in srgb, ${status.tone} 15%, transparent)`, color: status.tone }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="mb-3 flex items-end justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        On the site now
                      </div>
                      <div className="mt-0.5">
                        <LiveVisitors siteId={site.id} initial={card?.liveVisitors ?? 0} />
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-[var(--color-text-muted)]">
                      <div>
                        {card?.today.visitors ?? 0} today{" "}
                        <Delta now={card?.today.visitors ?? 0} before={card?.yesterday.visitors ?? 0} />
                      </div>
                      <div>{card?.today.conversions ?? 0} conversions</div>
                    </div>
                  </div>

                  {/* Free-source signals: what Google is doing with the site,
                      and what work is waiting. Real data, no subscription. */}
                  <div className="mb-3 grid grid-cols-3 gap-2 border-b border-[var(--color-border)] pb-3 text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                        Search clicks
                      </div>
                      <div className="mt-0.5 text-xs font-semibold tabular-nums">
                        {extra && (extra.clicks > 0 || extra.clicksPrev > 0) ? (
                          <>
                            {extra.clicks.toLocaleString()}{" "}
                            <Delta now={extra.clicks} before={extra.clicksPrev} />
                          </>
                        ) : (
                          <span className="font-normal text-[var(--color-text-subtle)]">—</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">30 days</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                        In Google
                      </div>
                      <div className="mt-0.5 text-xs font-semibold tabular-nums">
                        {extra?.indexed === null || extra === undefined ? (
                          <span className="font-normal text-[var(--color-text-subtle)]">—</span>
                        ) : (
                          <>
                            {extra.indexed}
                            <span className="font-normal text-[var(--color-text-subtle)]">
                              /{extra.indexTotal}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">pages</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                        To do
                      </div>
                      <div className="mt-0.5 text-xs font-semibold tabular-nums">
                        {extra && extra.opportunities > 0 ? (
                          extra.opportunities
                        ) : (
                          <span className="font-normal text-[var(--color-text-subtle)]">—</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">
                        {extra && extra.strikeDistance > 0 ? `${extra.strikeDistance} near page 1` : "opportunities"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Ranks</div>
                      <div className="mt-0.5 text-xs">
                        <span style={{ color: "var(--color-ok)" }}>↑{card?.ranks.improved ?? 0}</span>{" "}
                        <span style={{ color: "var(--color-bad)" }}>↓{card?.ranks.declined ?? 0}</span>
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">
                        of {card?.ranks.tracked ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Crawl</div>
                      <div
                        className="mt-0.5 text-xs"
                        style={{ color: (card?.health.errors ?? 0) > 0 ? "var(--color-bad)" : "var(--color-ok)" }}
                      >
                        {card?.health.errors ?? 0} errors
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">
                        {card?.health.lastCrawl ? <Time iso={card.health.lastCrawl} dateOnly /> : "never"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">AI bots</div>
                      <div
                        className="mt-0.5 text-xs"
                        style={{ color: (card?.health.botsBlocked ?? 0) > 0 ? "var(--color-warn)" : "var(--color-ok)" }}
                      >
                        {card?.health.botsBlocked ?? 0} blocked
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">of 10</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Sites still waiting on their snippet keep the install card in view —
            it is the only thing anyone needs from them. */}
        {pending.map((site) => {
          const client = clientOf(site.client_id);
          const colour = client ? clientColor(client) : null;
          return (
            <Card
              key={site.id}
              className="mb-4"
              {...(colour ? { style: { "--panel-outline": colour.hex } as React.CSSProperties } : {})}
            >
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {colour ? <span aria-hidden className="h-3.5 w-3.5 rounded" style={{ background: colour.hex }} /> : null}
                    <span>{client?.company_name ?? "Unknown client"}</span>
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">{site.domain}</span>
                  </span>
                }
                subtitle="Waiting for the snippet to go live"
              />
              <CardBody>
                <PulseInstallCard
                  siteId={site.id}
                  domain={site.domain}
                  snippet={snippetFor(site.site_key, origin)}
                  status={site.status}
                />
              </CardBody>
            </Card>
          );
        })}
      </div>
    </AdminShell>
  );
}
