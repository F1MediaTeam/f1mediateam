// One site, in detail: Traffic, Rankings, Backlinks, Site health, Search.
//
// Tabs are URL state rather than component state, so a tab is linkable, a
// refresh keeps you where you were, and each tab's data is fetched on the
// server only when that tab is actually open.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import Time from "@/components/shared/Time";
import { clientColor } from "@/lib/client-color";
import { visibleClientIds } from "@/lib/permissions.server";
import { getSite } from "@/lib/pulse/sites";
import {
  backlinkPanel,
  competitorPanel,
  gscRankPanel,
  referralPanel,
  healthPanel,
  indexPanel,
  lastRuns,
  localPanel,
  opportunityPanel,
  psiPanel,
  rankPanel,
  trafficPanel,
  type Range,
} from "@/lib/pulse/dashboard";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import { signalsPanel } from "@/lib/pulse/signals";
import PullReportButton from "@/components/admin/pulse/PullReportButton";
import RefreshButton from "@/components/admin/pulse/RefreshButton";
import Sparkline from "@/components/admin/pulse/Sparkline";
import KeywordManager, { KeywordRowActions } from "@/components/admin/pulse/KeywordManager";
import CsvButton from "@/components/admin/pulse/CsvButton";
import TrafficChart from "@/components/admin/pulse/TrafficChart";
import BarList from "@/components/admin/pulse/BarList";
import VitalMeter from "@/components/admin/pulse/VitalMeter";
import { BUCKET_LABEL } from "@/lib/pulse/collectors/index-inspector";
import { AddCompetitor, RemoveCompetitor } from "@/components/admin/pulse/CompetitorManager";
import GscPropertyForm from "@/components/admin/pulse/GscPropertyForm";
import PaidFeatureNotice from "@/components/admin/pulse/PaidFeatureNotice";
import { hasPaidData, PAID_FEATURES } from "@/lib/pulse/mode";
import SiteProfileForm from "@/components/admin/pulse/SiteProfileForm";
import { installGuide, PRIVACY_SENTENCE, locationLabels } from "@/lib/pulse/onboarding";

export const dynamic = "force-dynamic";

const TABS = ["traffic", "rankings", "backlinks", "ai", "health", "visitors", "index", "opportunities", "competitors", "local", "search", "setup"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  traffic: "Traffic",
  rankings: "Rankings",
  backlinks: "Backlinks",
  ai: "AI visibility",
  health: "Site health",
  visitors: "Visitor issues",
  index: "Index health",
  opportunities: "Opportunities",
  competitors: "Competitors",
  local: "Local",
  search: "Search data",
  setup: "Setup",
};

/** Plain English for the client-facing category names. */
const CATEGORY_LABEL: Record<string, string> = {
  strike_distance: "Nearly ranking",
  content: "Content",
  technical: "Technical",
  schema: "Structured data",
  links: "Internal links",
  cwv: "Speed",
};

const RANGES: Range[] = ["24h", "7d", "30d", "90d"];

const SEVERITY_COLOR: Record<string, string> = {
  error: "var(--color-bad)",
  warning: "var(--color-warn)",
  notice: "var(--color-text-subtle)",
};

const CONVERSION_LABEL: Record<string, string> = {
  tel_click: "Phone taps",
  mailto_click: "Email clicks",
  outbound_click: "Outbound clicks",
  form_submit: "Form submissions",
};

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-panel="" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

/** The four incident lists share a shape: where, what, how often, how many people. */
function SignalTable({
  rows,
  detailLabel,
}: {
  rows: Array<{ path: string; detail: string | null; count: number; people: number; lastSeen: string }>;
  detailLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            <th className="pb-2 pr-3 font-medium">Page</th>
            <th className="pb-2 pr-3 font-medium">{detailLabel}</th>
            <th className="pb-2 pr-3 font-medium">Times</th>
            <th className="pb-2 font-medium">People</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.path}|${r.detail ?? ""}`} className="border-t border-[var(--color-border)]">
              <td className="py-2 pr-3">
                <span className="block max-w-[16rem] truncate text-xs">{r.path}</span>
              </td>
              <td className="py-2 pr-3">
                <span className="block max-w-[22rem] truncate text-xs text-[var(--color-text-muted)]">
                  {r.detail ?? "—"}
                </span>
              </td>
              <td className="py-2 pr-3 tabular-nums">{r.count}</td>
              <td className="py-2 tabular-nums text-[var(--color-text-muted)]">{r.people}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Headline({ label, value, now, before, suffix }: {
  label: string; value: string | number; now?: number; before?: number; suffix?: string;
}) {
  // No percentage against a zero baseline — "+400%" off one visitor is noise.
  const delta =
    now !== undefined && before !== undefined && before > 0
      ? Math.round(((now - before) / before) * 100)
      : null;
  const isNew = now !== undefined && before === 0 && now > 0;

  return (
    <div data-panel="" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {suffix ? <span className="text-xs text-[var(--color-text-subtle)]">{suffix}</span> : null}
      </div>
      <div className="mt-0.5 text-[10px]">
        {isNew ? (
          <span style={{ color: "var(--color-ok)" }}>new this period</span>
        ) : delta === null ? (
          <span className="text-[var(--color-text-subtle)]">no earlier data to compare</span>
        ) : (
          <span style={{ color: delta >= 0 ? "var(--color-ok)" : "var(--color-bad)" }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs previous period
          </span>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">{children}</p>
  );
}

export default async function PulseSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const session = await requireAdmin();
  const { siteId } = await params;
  const sp = await searchParams;
  const tab = (TABS.includes(sp.tab as Tab) ? sp.tab : "traffic") as Tab;
  const range = (RANGES.includes(sp.range as Range) ? sp.range : "7d") as Range;

  const site = await getSite(siteId);
  if (!site) notFound();

  // A specialist must not reach another team's client by guessing a URL.
  const allowed = await visibleClientIds(session);
  if (allowed !== null && !allowed.includes(site.client_id)) notFound();

  const [clients, runs] = await Promise.all([data.listClients(), lastRuns(siteId)]);
  const client = clients.find((c) => c.id === site.client_id);
  const colour = client ? clientColor(client) : null;

  const traffic = tab === "traffic" ? await trafficPanel(siteId, range) : null;
  // Free Mode: paid rank tracking is off, so Rankings is fed by Search
  // Console — real Google-measured positions rather than invented ones.
  const paidData = hasPaidData();
  const ranks = tab === "rankings" && paidData ? await rankPanel(siteId) : null;
  const gscRanks =
    tab === "rankings" && !paidData ? await gscRankPanel(siteId, site.client_id) : null;
  const backlinks = tab === "backlinks" && paidData ? await backlinkPanel(siteId) : null;
  const health = tab === "health" ? await healthPanel(siteId) : null;
  const opps = tab === "opportunities" ? await opportunityPanel(siteId) : null;
  const psi = tab === "health" ? await psiPanel(siteId) : null;
  const local = tab === "local" ? await localPanel(siteId) : null;
  const competitors = tab === "competitors" ? await competitorPanel(siteId) : null;
  // The tag already records where every visitor came from, which answers two
  // questions we would otherwise have to buy: which links actually send
  // people, and whether AI assistants send anyone at all.
  const referrals =
    tab === "backlinks" || tab === "ai" ? await referralPanel(siteId, site.domain) : null;
  const indexHealth = tab === "index" ? await indexPanel(siteId) : null;
  const signals = tab === "visitors" ? await signalsPanel(siteId) : null;

  const tabHref = (t: Tab) => `/admin/pulse/${siteId}?tab=${t}${t === "traffic" ? `&range=${range}` : ""}`;

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div
        className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8"
        style={colour ? ({ "--panel-outline": colour.hex } as React.CSSProperties) : undefined}
      >
        <PulseHeader
          crumb={
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Link href="/admin/pulse" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                ← All sites
              </Link>
              {colour ? <span aria-hidden className="h-3 w-3 rounded" style={{ background: colour.hex }} /> : null}
              <span className="text-sm font-semibold">{client?.company_name ?? "Client"}</span>
              <span className="font-mono text-xs text-[var(--color-text-muted)]">{site.domain}</span>
            </div>
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/pulse/${siteId}/report`}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Client report
              </Link>
              {/* The on-screen report above is a web page; this is the branded
                  PDF with its CSV companions. */}
              <PullReportButton siteId={siteId} template="monthly" compact />
            </div>
          }
        />

        <div className="mb-5 flex flex-wrap gap-1.5 border-b border-[var(--color-border)] pb-3">
          {TABS.map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-medium transition " +
                (t === tab
                  ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]")
              }
            >
              {TAB_LABEL[t]}
            </Link>
          ))}
        </div>

        {/* ---------------- Traffic ---------------- */}
        {tab === "traffic" && traffic ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {RANGES.map((r) => (
                  <Link
                    key={r}
                    href={`/admin/pulse/${siteId}?tab=traffic&range=${r}`}
                    className={
                      "rounded-md border px-2.5 py-1 text-[11px] font-medium " +
                      (r === range
                        ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
                    }
                  >
                    {r}
                  </Link>
                ))}
              </div>
              <CsvButton
                filename={`${site.domain}-traffic-${range}`}
                rows={traffic.series.map((s) => ({ period: s.bucket, visitors: s.visitors, pageviews: s.pageviews }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Headline label="Visitors" value={traffic.totals.visitors} now={traffic.totals.visitors} before={traffic.previous.visitors} />
              <Headline label="Pageviews" value={traffic.totals.pageviews} now={traffic.totals.pageviews} before={traffic.previous.pageviews} />
              <Headline label="Sessions" value={traffic.totals.sessions} now={traffic.totals.sessions} before={traffic.previous.sessions} />
              <Headline label="Avg. engagement" value={traffic.totals.avgEngagementSec} suffix="sec" now={traffic.totals.avgEngagementSec} before={traffic.previous.avgEngagementSec} />
            </div>

            <Panel title={`Visitors and pageviews · last ${range}`}>
              <TrafficChart points={traffic.series} accent={colour?.hex ?? "#e11d2e"} hourly={range === "24h"} />
            </Panel>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Most visited pages">
                <BarList mono accent={colour?.hex ?? "#e11d2e"}
                  rows={traffic.topPages.map((p) => ({ label: p.path, value: p.views }))}
                  empty="No pages recorded yet." />
              </Panel>

              <Panel title="Where visitors came from">
                <BarList accent={colour?.hex ?? "#e11d2e"}
                  rows={traffic.topReferrers.map((r) => ({ label: r.domain, value: r.views }))}
                  empty="Nothing yet — all traffic so far arrived directly." />
              </Panel>

              <Panel title="Speed, as real visitors experienced it">
                {traffic.vitals.length === 0 ? (
                  <Empty>
                    No speed data yet. These are measured in real browsers as visitors leave a page,
                    so they appear once there is real traffic.
                  </Empty>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {traffic.vitals.map((v) => (
                        <VitalMeter key={v.metric} metric={v.metric} p75={v.p75} verdict={v.verdict} />
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                      The 75th percentile — the experience of the slowest quarter of visits, which is
                      what Google assesses. An average would hide them.
                    </p>
                  </>
                )}
              </Panel>

              <Panel title="Conversions">
                <ul className="space-y-1.5">
                  {traffic.conversions.map((c) => (
                    <li key={c.kind} className="flex items-center justify-between gap-3 text-xs">
                      <span>{CONVERSION_LABEL[c.kind] ?? c.kind}</span>
                      <span className="flex items-center gap-2">
                        {c.topTarget ? (
                          <span className="truncate text-[10px] text-[var(--color-text-subtle)]">{c.topTarget}</span>
                        ) : null}
                        <span className="tabular-nums font-semibold">{c.count}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                  Records that an action happened and where. No form field values are ever collected.
                </p>
              </Panel>
            </div>
          </div>
        ) : null}

        {/* ---------------- Rankings ---------------- */}
        {tab === "rankings" && gscRanks ? (
          <div className="space-y-4">
            <Panel
              title="Where this site ranks"
              right={<RefreshButton collector="search" siteId={siteId} lastUpdated={runs.get("search")?.finishedAt} />}
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                <strong>Google-measured.</strong> These are the searches people actually used to reach
                this site, and the average position it held across everyone who saw it — Google&apos;s own
                figures, about two days behind. Updated daily.
              </p>
              {!gscRanks.connected ? (
                <Empty>
                  Search Console isn&apos;t connected for this client yet. Connect Google on the
                  client&apos;s page and this fills in on the next sync.
                </Empty>
              ) : gscRanks.rows.length === 0 ? (
                <Empty>
                  No search data stored yet. It arrives with the nightly sync — or press Refresh above to
                  pull it now.
                </Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Search</th>
                        <th className="pb-2 text-right font-normal">Position</th>
                        <th className="pb-2 text-right font-normal">Change</th>
                        <th className="pb-2 text-right font-normal">Clicks</th>
                        <th className="pb-2 text-right font-normal">Impressions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscRanks.rows.slice(0, 60).map((r) => {
                        // Positions improve by going DOWN, so the arrow and the
                        // colour are deliberately inverted against the number.
                        const move =
                          r.previousPosition === null
                            ? null
                            : Math.round((r.previousPosition - r.position) * 10) / 10;
                        return (
                          <tr key={r.query} className="border-t border-[var(--color-border)]">
                            <td className="py-2 pr-3 font-medium">
                              <span className="block max-w-[260px] truncate">{r.query}</span>
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums">{r.position}</td>
                            <td className="py-2 text-right tabular-nums">
                              {move === null || move === 0 ? (
                                <span className="text-[var(--color-text-subtle)]">—</span>
                              ) : (
                                <span style={{ color: move > 0 ? "var(--color-ok)" : "var(--color-bad)" }}>
                                  {move > 0 ? "▲" : "▼"} {Math.abs(move)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
                            <td className="py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                              {r.impressions.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                    Change compares the last two weeks against the two before. Position is averaged across
                    every impression, so a query shown once in Ohio and 900 times in Phoenix reports mostly
                    Phoenix.
                  </p>
                </div>
              )}
            </Panel>

            <PaidFeatureNotice
              title="Track any keyword you choose"
              feature={PAID_FEATURES.rank_tracking}
              freeAlternative="The table above — the searches that already reach this site, measured by Google."
            />
            <PaidFeatureNotice
              title="AI Overviews and search features"
              feature={PAID_FEATURES.serp_features}
            />
            <PaidFeatureNotice
              title="Competitor positions and Share of Voice"
              feature={PAID_FEATURES.competitor_positions}
              freeAlternative="The Competitors tab tracks their size, publishing pace and speed — measured by us."
            />
          </div>
        ) : null}

        {tab === "rankings" && ranks ? (
          <div className="space-y-4">
            <Panel
              title="Tracked keywords"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <CsvButton
                    filename={`${site.domain}-rankings`}
                    rows={ranks.map((r) => ({
                      keyword: r.phrase,
                      position: r.position ?? "not in top 100",
                      previous: r.previous ?? "",
                      best: r.best ?? "",
                      url: r.rankingUrl ?? "",
                    }))}
                  />
                  <RefreshButton
                    collector="ranks"
                    siteId={siteId}
                    lastUpdated={runs.get("ranks")?.finishedAt}
                    mocked={runs.get("ranks")?.mocked}
                  />
                </div>
              }
            >
              <div className="mb-3">
                <KeywordManager siteId={siteId} count={ranks.filter((r) => r.isActive).length} />
              </div>

              {ranks.length === 0 ? (
                <Empty>No keywords tracked yet. Add one above and run a refresh.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Keyword</th>
                        <th className="pb-2 text-right font-normal">Position</th>
                        <th className="pb-2 text-right font-normal">Change</th>
                        <th className="pb-2 text-right font-normal">Best</th>
                        <th className="pb-2 font-normal">Trend</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranks.map((r) => {
                        const delta =
                          r.position !== null && r.previous !== null ? r.previous - r.position : null;
                        return (
                          <tr
                            key={r.keywordId}
                            className={"border-t border-[var(--color-border)] " + (r.isActive ? "" : "opacity-50")}
                          >
                            <td className="py-2 pr-3">
                              <div className="truncate">{r.phrase}</div>
                              {r.rankingUrl ? (
                                <div className="truncate font-mono text-[10px] text-[var(--color-text-subtle)]">
                                  {r.rankingUrl.replace(/^https?:\/\//, "")}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 text-right tabular-nums font-semibold">
                              {r.position ?? <span className="text-[var(--color-text-subtle)]">—</span>}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {delta === null || delta === 0 ? (
                                <span className="text-[var(--color-text-subtle)]">—</span>
                              ) : (
                                <span style={{ color: delta > 0 ? "var(--color-ok)" : "var(--color-bad)" }}>
                                  {delta > 0 ? "↑" : "↓"}
                                  {Math.abs(delta)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                              {r.best ?? "—"}
                            </td>
                            <td className="py-2">
                              {/* invert: a lower position is better, so it draws higher */}
                              <Sparkline values={r.history} invert color={colour?.hex} />
                            </td>
                            <td className="py-2 text-right">
                              <KeywordRowActions keywordId={r.keywordId} isActive={r.isActive} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        ) : null}

        {/* ---------------- Backlinks ---------------- */}
        {tab === "backlinks" && !paidData ? (
          <div className="space-y-4">
            <Panel
              title="Links that actually sent visitors"
              right={<span className="text-[10px] text-[var(--color-text-subtle)]">last 90 days · measured</span>}
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Every time someone arrives from another website, their browser says where they came
                from, and the F1 tag records it. So while we cannot list every link that exists, this is
                every link that <strong>actually sent a person</strong> — which is usually the more
                useful list, because a link nobody clicks is worth very little.
              </p>
              {!referrals || referrals.links.length === 0 ? (
                <Empty>
                  No referring sites yet. This fills in as people arrive from other websites — it only
                  counts visits since the tag went live.
                </Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Site</th>
                        <th className="pb-2 text-right font-normal">Visits</th>
                        <th className="pb-2 text-right font-normal">People</th>
                        <th className="pb-2 text-right font-normal">Most recent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.links.slice(0, 40).map((r) => (
                        <tr key={r.host} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3 font-medium">
                            <span className="block max-w-[260px] truncate">{r.host}</span>
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">{r.visits}</td>
                          <td className="py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                            {r.people}
                          </td>
                          <td className="py-2 text-right text-[10px] text-[var(--color-text-subtle)]">
                            <Time iso={r.lastSeen} dateOnly />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                A floor, not a census: it counts only links people clicked, only since the tag was
                installed, and some browsers hide where a visitor came from. Social networks and search
                engines are listed separately — social under Traffic, search on the Rankings tab.
              </p>
            </Panel>

            {referrals && referrals.social.length > 0 ? (
              <Panel title="Social referrals">
                <BarList
                  accent={colour?.hex ?? "#e11d2e"}
                  rows={referrals.social.map((r) => ({ label: r.host, value: r.visits }))}
                  empty="No social referrals recorded."
                />
              </Panel>
            ) : null}

            <PaidFeatureNotice
              title="Who links to this site"
              feature={PAID_FEATURES.backlinks}
              freeAlternative="Search Console shows a links report in its own interface — sign in to the client's account to read it by hand. Google publishes no way to pull it automatically, so it cannot appear here."
            />
            <Panel title="Why this one has no free version">
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                Everything else in F1 Pulse can be measured by visiting a site or asking Google about a
                site we are authorised on. Backlinks are different: knowing who links to this client
                means knowing about pages on other people&apos;s websites, which requires crawling a
                large share of the web and keeping an index of it. That index is the product a data
                vendor sells, so this is the one panel where the honest answer is that it has to be
                bought.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Two things partly cover the gap at no cost. The client&apos;s own Search Console
                interface lists its top linking sites — accurate but manual, and not exportable by API.
                And the <strong>Competitors</strong> tab already tracks what rival sites publish, which
                is often what you actually wanted to know when you asked about their links.
              </p>
            </Panel>
          </div>
        ) : null}

        {tab === "backlinks" && backlinks ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Live links", backlinks.total, "var(--color-text)"],
                ["New", backlinks.fresh.length, "var(--color-ok)"],
                ["Lost", backlinks.lost.length, "var(--color-bad)"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} data-panel="" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: String(tone) }}>
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>

            <Panel
              title="Backlinks"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <CsvButton
                    filename={`${site.domain}-backlinks`}
                    rows={backlinks.all.map((b) => ({
                      source: String(b.source_domain ?? ""),
                      url: String(b.source_url ?? ""),
                      anchor: String(b.anchor ?? ""),
                      status: String(b.status ?? ""),
                    }))}
                  />
                  <RefreshButton
                    collector="backlinks"
                    siteId={siteId}
                    lastUpdated={runs.get("backlinks")?.finishedAt}
                    mocked={runs.get("backlinks")?.mocked}
                  />
                </div>
              }
            >
              {backlinks.all.length === 0 ? (
                <Empty>No backlinks recorded yet. Run a refresh to populate this.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Source</th>
                        <th className="pb-2 font-normal">Anchor</th>
                        <th className="pb-2 font-normal">Status</th>
                        <th className="pb-2 text-right font-normal">Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backlinks.all.slice(0, 100).map((b) => (
                        <tr key={String(b.source_url)} className="border-t border-[var(--color-border)]">
                          <td className="max-w-[280px] truncate py-2 pr-3">{String(b.source_domain)}</td>
                          <td className="max-w-[200px] truncate py-2 pr-3 text-[var(--color-text-muted)]">
                            {String(b.anchor ?? "—") || "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                              style={{
                                color:
                                  b.status === "lost" ? "var(--color-bad)" : b.status === "new" ? "var(--color-ok)" : "var(--color-text-muted)",
                              }}
                            >
                              {String(b.status)}
                            </span>
                          </td>
                          <td className="py-2 text-right text-[var(--color-text-subtle)]">
                            <Time iso={String(b.last_seen)} dateOnly />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        ) : null}

        {/* ---------------- AI visibility ---------------- */}
        {tab === "ai" ? (
          <div className="space-y-4">
            <Panel
              title="AI assistants sending real visitors"
              right={<span className="text-[10px] text-[var(--color-text-subtle)]">last 90 days · measured</span>}
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                When someone asks ChatGPT, Perplexity, Gemini or Copilot a question and then clicks
                through to this site, the browser says which assistant sent them. This is the outcome
                that mention-tracking is a proxy for — not whether an assistant <em>talked</em> about
                the business, but whether it actually sent someone.
              </p>
              {!referrals || referrals.ai.length === 0 ? (
                <Empty>
                  No AI assistant has sent a visitor yet. This is measured, not sampled — when one does,
                  it appears here.
                </Empty>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Headline
                      label="Visits from AI"
                      value={referrals.ai.reduce((s, r) => s + r.visits, 0)}
                    />
                    <Headline label="People" value={referrals.ai.reduce((s, r) => s + r.people, 0)} />
                    <Headline label="Assistants" value={referrals.ai.length} />
                  </div>
                  <ul className="space-y-1.5">
                    {referrals.ai.map((r) => (
                      <li
                        key={r.host}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
                      >
                        <span className="font-medium">{r.host}</span>
                        <span className="flex items-center gap-3 text-[var(--color-text-muted)]">
                          <span className="tabular-nums">
                            {r.visits} visit{r.visits === 1 ? "" : "s"}
                          </span>
                          <span className="text-[10px] text-[var(--color-text-subtle)]">
                            latest <Time iso={r.lastSeen} dateOnly />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                Counts clicks through to the site, so it undercounts: someone who reads an answer
                mentioning the business and never clicks is invisible here. It costs nothing and it is
                real, which is the trade.
              </p>
            </Panel>

            <PaidFeatureNotice
              title="How often assistants mention this business"
              feature={PAID_FEATURES.ai_visibility}
              freeAlternative="The panel above — assistants that actually sent someone. Mention tracking additionally catches the people who read about the business and never clicked."
            />
          </div>
        ) : null}

        {/* ---------------- Site health ---------------- */}
        {tab === "health" && health ? (
          <div className="space-y-4">
            <Panel
              title="Crawl"
              right={
                <RefreshButton
                  collector="crawl"
                  siteId={siteId}
                  lastUpdated={runs.get("crawl")?.finishedAt}
                  label="Re-crawl"
                />
              }
            >
              {!health.crawl ? (
                <Empty>
                  This site has not been crawled yet. A crawl walks the sitemap a slice at a time —
                  press Re-crawl repeatedly, or leave it to the weekly schedule.
                </Empty>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Pages", String(health.crawl.pages_crawled ?? 0), "var(--color-text)"],
                      ["Errors", String(health.counts.errors), "var(--color-bad)"],
                      ["Warnings", String(health.counts.warnings), "var(--color-warn)"],
                      ["Notices", String(health.counts.notices), "var(--color-text-muted)"],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
                        <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: tone }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {health.issueGroups.length === 0 ? (
                    <Empty>No issues found.</Empty>
                  ) : (
                    <ul className="space-y-1.5">
                      {health.issueGroups.map((g) => (
                        <li key={g.type} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[g.severity] }} />
                            <span className="truncate">{g.type.replace(/_/g, " ")}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">{g.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Panel>

            <Panel title="AI and search crawler access">
              {health.bots.length === 0 ? (
                <Empty>Not checked yet — this is read from robots.txt during a crawl.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Crawler</th>
                        <th className="pb-2 font-normal">Homepage</th>
                        <th className="pb-2 font-normal">Blocked paths</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.bots.map((b) => (
                        <tr key={String(b.bot)} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3 font-medium">{String(b.bot)}</td>
                          <td className="py-2 pr-3">
                            <span style={{ color: b.allowed ? "var(--color-ok)" : "var(--color-bad)" }}>
                              {b.allowed ? "Allowed" : "Blocked"}
                            </span>
                          </td>
                          <td className="py-2 font-mono text-[10px] text-[var(--color-text-subtle)]">
                            {Array.isArray(b.blocked_sample_paths) && b.blocked_sample_paths.length > 0
                              ? (b.blocked_sample_paths as string[]).slice(0, 3).join("  ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                    &quot;Allowed&quot; means the crawler can reach the homepage. A crawler blocked only from
                    specific paths is still allowed overall.
                  </p>
                </div>
              )}
            </Panel>

            <Panel
              title="Speed — lab test vs real visitors"
              right={<RefreshButton collector="psi" siteId={siteId} lastUpdated={runs.get("psi")?.finishedAt} />}
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Two different measurements, never mixed. <strong>Lab</strong> is one simulated load on a
                fixed machine — always available, reproducible, and where the score and the fix list come
                from. <strong>Real visitors</strong> is what people actually experienced, which is what
                Google ranks on. A page with little traffic has no real-visitor data at all.
              </p>
              {!psi || psi.pages.length === 0 ? (
                <Empty>
                  No lab tests recorded yet. This needs a free PageSpeed Insights API key
                  (PAGESPEED_API_KEY) — without one the test is skipped rather than guessed at.
                </Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Page</th>
                        <th className="pb-2 text-right font-normal">Lab score</th>
                        <th className="pb-2 text-right font-normal">Real visitors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {psi.pages.map((p) => {
                        const score = (p.lab_scores as { score?: number | null })?.score ?? null;
                        const fieldVerdict = (p.lab_scores as { fieldVerdict?: string | null })?.fieldVerdict ?? null;
                        const tone =
                          score === null ? "var(--color-text-subtle)"
                            : score >= 90 ? "var(--color-ok)"
                            : score >= 50 ? "var(--color-warn)"
                            : "var(--color-bad)";
                        return (
                          <tr key={`${p.url}:${p.strategy}`} className="border-t border-[var(--color-border)]">
                            <td className="py-2 pr-3 font-mono text-[10px] text-[var(--color-text-subtle)]">
                              <span className="block max-w-[280px] truncate">{p.url}</span>
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums" style={{ color: tone }}>
                              {p.error ? "failed" : (score ?? "—")}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-muted)]">
                              {fieldVerdict
                                ? fieldVerdict === "good"
                                  ? "Good"
                                  : fieldVerdict === "needs-improvement"
                                    ? "Needs work"
                                    : "Poor"
                                : "not enough traffic"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                    Updated monthly and on demand. The Traffic tab shows this site&apos;s own Core Web
                    Vitals, measured by the F1 tag on every visit rather than sampled by Google.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        ) : null}

        {/* ---------------- Visitor issues ---------------- */}
        {tab === "visitors" && signals ? (
          <div className="space-y-4">
            <Panel
              title="What real visitors ran into"
              right={
                <span className="text-[10px] text-[var(--color-text-subtle)]">
                  last {signals.windowDays} days · measured
                </span>
              }
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Reported by the tag on this site, from people who were actually on it. A crawler
                tells you what exists and Google tells you what it indexed — only this tells you
                what happened to the person who showed up. Nothing here is estimated.
              </p>
              {signals.noData ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Nothing reported yet. Either the tag has not been installed, or nobody has hit a
                  problem since it was — the two look the same from here, so check the Setup tab
                  if the site has traffic.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Headline label="Script errors" value={signals.totals.errors} now={signals.totals.errors} before={0} />
                  <Headline label="Dead pages hit" value={signals.totals.notFound} now={signals.totals.notFound} before={0} />
                  <Headline label="Dead clicks" value={signals.totals.rageClicks} now={signals.totals.rageClicks} before={0} />
                  <Headline label="Slow loads" value={signals.totals.slowPages} now={signals.totals.slowPages} before={0} />
                </div>
              )}
            </Panel>

            {signals.errors.length > 0 ? (
              <Panel title="Their site is throwing errors">
                <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Script errors on real visits. These break buttons, forms and checkouts, and a
                  client almost never finds them on their own — their browser works.
                </p>
                <SignalTable rows={signals.errors} detailLabel="Error" />
              </Panel>
            ) : null}

            {signals.notFound.length > 0 ? (
              <Panel title="Dead pages people actually reached">
                <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Someone landed on a page that does not exist. A crawl can never find these — it
                  follows the sitemap, and these come from old links out on the web. The detail
                  column is where they came from, which is usually the thing worth fixing.
                </p>
                <SignalTable rows={signals.notFound} detailLabel="Came from" />
              </Panel>
            ) : null}

            {signals.rageClicks.length > 0 ? (
              <Panel title="Things that look clickable and are not">
                <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Three clicks in the same spot inside half a second. People do that when they
                  expect something to happen and nothing does.
                </p>
                <SignalTable rows={signals.rageClicks} detailLabel="Element" />
              </Panel>
            ) : null}

            {signals.slowPages.length > 0 ? (
              <Panel title="Slow for real people">
                <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Pages that took over four seconds to show their main content on a visitor&rsquo;s
                  own device. A speed test measures a robot in a datacentre; this measures customers.
                </p>
                <SignalTable rows={signals.slowPages} detailLabel="Metric" />
              </Panel>
            ) : null}

            {signals.scroll.length > 0 ? (
              <Panel title="How far down people actually get">
                <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  The median visitor on each page, so one parked tab cannot report a page as fully
                  read. A low number on a long page means the content below is not being seen.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 pr-3 font-medium">Page</th>
                        <th className="pb-2 pr-3 font-medium">Median scroll</th>
                        <th className="pb-2 font-medium">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signals.scroll.map((r) => (
                        <tr key={r.path} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3">
                            <span className="block max-w-[22rem] truncate text-xs">{r.path}</span>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{r.median}%</td>
                          <td className="py-2 tabular-nums text-[var(--color-text-muted)]">{r.views}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Visitor issues ---------------- */}
        {tab === "visitors" && signals ? (
          <div className="space-y-4">
            <Panel
              title="What real visitors ran into"
              right={<span className="text-[10px] text-[var(--color-text-subtle)]">last {signals.windowDays} days · measured</span>}
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Reported by the tag on this site, from people who were actually on it. A crawler
                tells you what exists and Google tells you what it indexed — only this tells you
                what happened to the person who showed up.
              </p>
              {signals.noData ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Nothing reported yet. Either nobody has hit a problem, or the tag is not
                  installed — those look identical from here, so check Setup if the site has traffic.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div><div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Script errors</div><div className="mt-1 text-2xl font-semibold tabular-nums">{signals.totals.errors}</div></div>
                  <div><div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Dead pages hit</div><div className="mt-1 text-2xl font-semibold tabular-nums">{signals.totals.notFound}</div></div>
                  <div><div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Dead clicks</div><div className="mt-1 text-2xl font-semibold tabular-nums">{signals.totals.rageClicks}</div></div>
                  <div><div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Slow loads</div><div className="mt-1 text-2xl font-semibold tabular-nums">{signals.totals.slowPages}</div></div>
                </div>
              )}
            </Panel>

            {signals.errors.length > 0 ? (
              <Panel title="Their site is throwing errors">
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">These break buttons, forms and checkouts. A client rarely finds them — their own browser works.</p>
                <SignalTable rows={signals.errors} detailLabel="Error" />
              </Panel>
            ) : null}

            {signals.notFound.length > 0 ? (
              <Panel title="Dead pages people actually reached">
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">A crawl can never find these — it follows the sitemap, and these come from old links out on the web.</p>
                <SignalTable rows={signals.notFound} detailLabel="Came from" />
              </Panel>
            ) : null}

            {signals.rageClicks.length > 0 ? (
              <Panel title="Things that look clickable and are not">
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">Three clicks in the same spot inside half a second.</p>
                <SignalTable rows={signals.rageClicks} detailLabel="Element" />
              </Panel>
            ) : null}

            {signals.slowPages.length > 0 ? (
              <Panel title="Slow for real people">
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">Over four seconds to show the main content, on a visitor&rsquo;s own device.</p>
                <SignalTable rows={signals.slowPages} detailLabel="Metric" />
              </Panel>
            ) : null}

            {signals.scroll.length > 0 ? (
              <Panel title="How far down people actually get">
                <p className="mb-3 text-xs text-[var(--color-text-muted)]">Median visitor per page, so one parked tab cannot report a page as fully read.</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead><tr className="text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                      <th className="pb-2 pr-3 font-medium">Page</th><th className="pb-2 pr-3 font-medium">Median scroll</th><th className="pb-2 font-medium">Views</th>
                    </tr></thead>
                    <tbody>
                      {signals.scroll.map((r) => (
                        <tr key={r.path} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3"><span className="block max-w-[22rem] truncate text-xs">{r.path}</span></td>
                          <td className="py-2 pr-3 tabular-nums">{r.median}%</td>
                          <td className="py-2 tabular-nums text-[var(--color-text-muted)]">{r.views}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Index health ---------------- */}
        {tab === "index" && indexHealth ? (
          <div className="space-y-4">
            {!site.gsc_connected ? (
              <Panel title="Connect Search Console">
                <GscPropertyForm
                  siteId={siteId}
                  domain={site.domain}
                  current={site.gsc_property}
                  connected={site.gsc_connected}
                />
              </Panel>
            ) : null}

            <Panel
              title="In Google"
              right={
                <div className="flex items-center gap-2">
                  {indexHealth.mocked ? (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                      style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}
                    >
                      Sample data
                    </span>
                  ) : null}
                  <RefreshButton collector="index" siteId={siteId} lastUpdated={runs.get("index")?.finishedAt} />
                </div>
              }
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                A page Google has not accepted cannot rank for anything, however good it is. Nothing else
                here can see that: the crawler reports what a page says about itself, and search data only
                describes pages that already got in.
              </p>

              {!indexHealth.latest ? (
                <Empty>
                  No inspection yet. Connect the property above, then press Refresh — a large site is
                  checked a slice at a time and resumes where it stopped.
                </Empty>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Headline label="In Google" value={indexHealth.indexed} />
                    <Headline label="Pages checked" value={indexHealth.latest.urls_inspected} />
                    <Headline label="Pages listed" value={indexHealth.total} />
                    <Headline
                      label={indexHealth.regressed ? "Dropped out" : "Newly in"}
                      value={indexHealth.regressed ?? indexHealth.fixed ?? 0}
                    />
                  </div>

                  {indexHealth.latest.status !== "done" ? (
                    <p className="mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
                       style={{ borderColor: "var(--color-warn)", color: "var(--color-text-muted)" }}>
                      {indexHealth.latest.status === "quota_paused"
                        ? "Paused on Google's daily limit. Press Refresh tomorrow and it continues from where it stopped."
                        : "Still working through the site. Press Refresh again to continue the run."}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <BarList
                      accent={colour?.hex ?? "#e11d2e"}
                      rows={indexHealth.buckets.map((b) => ({
                        label: BUCKET_LABEL[b.bucket as keyof typeof BUCKET_LABEL] ?? b.bucket,
                        value: b.count,
                      }))}
                      empty="Nothing inspected yet."
                    />
                  </div>
                </>
              )}
            </Panel>

            {indexHealth.problems.length > 0 ? (
              <Panel title="Pages Google has not accepted">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Page</th>
                        <th className="pb-2 font-normal">What happened</th>
                        <th className="pb-2 font-normal">Google&apos;s wording</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indexHealth.problems.slice(0, 60).map((p) => (
                        <tr key={p.url} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3 font-mono text-[10px] text-[var(--color-text-subtle)]">
                            <span className="block max-w-[240px] truncate">{p.url}</span>
                          </td>
                          <td className="py-2 pr-3">
                            {BUCKET_LABEL[p.bucket as keyof typeof BUCKET_LABEL] ?? p.bucket}
                          </td>
                          <td className="py-2 text-[10px] text-[var(--color-text-muted)]">
                            <span className="block max-w-[220px] truncate">{p.coverage_state ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}

            {indexHealth.deadweight.length > 0 ? (
              <Panel title="In Google, but nobody sees them">
                <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Google accepted these pages and they have had no impressions in 90 days. That is not a
                  technical fault — it means nothing is being searched that these pages answer. They are
                  candidates for rewriting, merging, or removing.
                </p>
                <ul className="space-y-1">
                  {indexHealth.deadweight.slice(0, 30).map((u) => (
                    <li
                      key={u}
                      className="truncate rounded-lg border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-text-subtle)]"
                    >
                      {u}
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Opportunities ---------------- */}
        {tab === "opportunities" && opps ? (
          <div className="space-y-4">
            <Panel
              title="Nearly ranking"
              right={
                <RefreshButton
                  collector="opportunities"
                  siteId={siteId}
                  lastUpdated={runs.get("opportunities")?.finishedAt}
                />
              }
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Searches where this site already appears on or near the first page. Google has
                decided the page is relevant — closing the last few positions is usually a title
                and copy job rather than a new page, which makes these the cheapest wins available.
              </p>
              {opps.strike.length === 0 ? (
                <Empty>
                  Nothing yet. This needs Search Console connected and about a month of data —
                  it recomputes every time the Opportunities refresh runs.
                </Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Search</th>
                        <th className="pb-2 font-normal">Page</th>
                        <th className="pb-2 text-right font-normal">Position</th>
                        <th className="pb-2 text-right font-normal">Impressions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opps.strike.slice(0, 30).map((o) => (
                        <tr key={o.id} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3 font-medium">{String(o.detail?.query ?? "—")}</td>
                          <td className="py-2 pr-3 font-mono text-[10px] text-[var(--color-text-subtle)]">
                            <span className="block max-w-[220px] truncate">{o.page}</span>
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {String(o.detail?.position ?? "—")}
                          </td>
                          <td className="py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                            {Number(o.detail?.impressions ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Work by type">
                {opps.byCategory.length === 0 ? (
                  <Empty>Nothing outstanding.</Empty>
                ) : (
                  <BarList
                    accent={colour?.hex ?? "#e11d2e"}
                    rows={opps.byCategory.map((c) => ({
                      label: CATEGORY_LABEL[c.category] ?? c.category,
                      value: c.count,
                    }))}
                    empty="Nothing outstanding."
                  />
                )}
              </Panel>

              <Panel title="Pages with the most to fix">
                {opps.topPages.length === 0 ? (
                  <Empty>Nothing outstanding.</Empty>
                ) : (
                  <BarList
                    mono
                    accent={colour?.hex ?? "#e11d2e"}
                    rows={opps.topPages.map((p) => ({ label: p.page, value: p.count }))}
                    empty="Nothing outstanding."
                  />
                )}
              </Panel>
            </div>

            <Panel title="Pages competing with each other">
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                When more than one page targets the same search, they split the signals between them
                and neither ranks as well as a single strong page would.
              </p>
              {opps.cannibalization.length === 0 ? (
                <Empty>No searches are pulling in more than one of this site&apos;s pages.</Empty>
              ) : (
                <ul className="space-y-2">
                  {opps.cannibalization.slice(0, 15).map((o) => (
                    <li key={o.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <div className="text-xs font-medium">{String(o.detail?.query ?? "—")}</div>
                      <div className="mt-1 space-y-0.5">
                        {(Array.isArray(o.detail?.pages) ? (o.detail.pages as Array<Record<string, unknown>>) : []).map(
                          (p, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-3 font-mono text-[10px] text-[var(--color-text-subtle)]"
                            >
                              <span className="truncate">{String(p.page)}</span>
                              <span className="shrink-0 tabular-nums">position {String(p.position)}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Speed">
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Measured on real visitors, at the 75th percentile — so a quarter of visits were at
                least this slow. This is field data, not a lab test.
              </p>
              {opps.cwv.length === 0 ? (
                <Empty>Every speed measure is inside Google&apos;s &quot;good&quot; threshold, or there isn&apos;t enough traffic to judge yet.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {opps.cwv.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
                    >
                      <span>{String(o.detail?.headline ?? o.detail?.metric ?? "—")}</span>
                      <span
                        className="shrink-0 tabular-nums"
                        style={{
                          color:
                            o.detail?.verdict === "poor" ? "var(--color-bad)" : "var(--color-warn)",
                        }}
                      >
                        {String(o.detail?.p75 ?? "—")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Everything else worth fixing">
              {opps.fixes.length === 0 ? (
                <Empty>Nothing outstanding from the last crawl.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {opps.fixes.slice(0, 40).map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: SEVERITY_COLOR[String(o.detail?.severity ?? "notice")] }}
                        />
                        <span className="truncate">{String(o.detail?.headline ?? o.category)}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-subtle)]">
                        <span className="block max-w-[200px] truncate">{o.page}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}

        {/* ---------------- Competitors ---------------- */}
        {tab === "competitors" && competitors ? (
          <div className="space-y-4">
            <Panel
              title="Tracked competitors"
              right={
                <RefreshButton
                  collector="competitors"
                  siteId={siteId}
                  lastUpdated={runs.get("competitors")?.finishedAt}
                />
              }
            >
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Everything here is measured by visiting the competitor&apos;s own site, politely and
                within the rules their robots.txt sets — no data is bought. That means we can tell you
                how big their site is, how fast it is growing, what they are publishing and how quickly
                their pages load. It also means we cannot tell you their keyword rankings, their traffic,
                or their backlinks: those come from a web-wide index that only a data vendor operates.
              </p>
              <AddCompetitor siteId={siteId} />
            </Panel>

            {competitors.competitors.length === 0 ? (
              <Panel title="No competitors yet">
                <Empty>
                  Add a competitor&apos;s domain above. The first check records a baseline; from then on
                  every run reports what changed.
                </Empty>
              </Panel>
            ) : (
              <Panel title="How they compare">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                        <th className="pb-2 font-normal">Competitor</th>
                        <th className="pb-2 text-right font-normal">Pages</th>
                        <th className="pb-2 text-right font-normal">Change</th>
                        <th className="pb-2 text-right font-normal">Published (30d)</th>
                        <th className="pb-2 text-right font-normal">Speed</th>
                        <th className="pb-2 text-right font-normal"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.competitors.map((c) => (
                        <tr key={c.domainId} className="border-t border-[var(--color-border)]">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{c.domain}</div>
                            <div className="text-[10px] text-[var(--color-text-subtle)]">
                              {c.capturedAt ? <Time iso={c.capturedAt} dateOnly /> : "not checked yet"}
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums font-semibold">
                            {c.pagesListed ?? "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {c.pagesDelta === null ? (
                              <span className="text-[var(--color-text-subtle)]">—</span>
                            ) : (
                              <span
                                style={{
                                  color:
                                    c.pagesDelta > 0
                                      ? "var(--color-warn)"
                                      : c.pagesDelta < 0
                                        ? "var(--color-text-muted)"
                                        : "var(--color-text-subtle)",
                                }}
                              >
                                {c.pagesDelta > 0 ? `+${c.pagesDelta}` : c.pagesDelta}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                            {c.published30d === null ? (
                              <span
                                className="text-[var(--color-text-subtle)]"
                                title="This site stamps every page with the same modified date, so its sitemap can't tell us what was actually published."
                              >
                                n/a
                              </span>
                            ) : (
                              c.published30d
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {c.speedScore === null ? (
                              <span className="text-[var(--color-text-subtle)]">—</span>
                            ) : (
                              <span
                                style={{
                                  color:
                                    c.speedScore >= 90
                                      ? "var(--color-ok)"
                                      : c.speedScore >= 50
                                        ? "var(--color-warn)"
                                        : "var(--color-bad)",
                                }}
                              >
                                {c.speedScore}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <RemoveCompetitor siteId={siteId} domainId={c.domainId} domain={c.domain} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                    &quot;Pages&quot; is how many URLs the site lists in its own sitemap — not how many
                    Google has indexed, which only that site&apos;s owner can see. A rising page count
                    with rising Published (30d) is a competitor investing in content.
                    Published shows <strong>n/a</strong> when a site stamps every page with the same
                    modified date, which some platforms do on every rebuild — a real number is better
                    left blank than invented.
                  </p>
                </div>
              </Panel>
            )}

            {competitors.competitors.filter((c) => Array.isArray((c.measured as { recentTitles?: unknown }).recentTitles)).length > 0 ? (
              <Panel title="What they have been publishing">
                <div className="space-y-3">
                  {competitors.competitors.map((c) => {
                    const titles = ((c.measured as { recentTitles?: Array<{ url: string; title: string | null }> })
                      .recentTitles ?? []).filter((t) => t.title);
                    if (titles.length === 0) return null;
                    return (
                      <div key={c.domainId}>
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                          {c.domain}
                        </div>
                        <ul className="space-y-1">
                          {titles.slice(0, 5).map((t) => (
                            <li
                              key={t.url}
                              className="truncate rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px]"
                            >
                              {t.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Local presence ---------------- */}
        {tab === "local" && local ? (
          <div className="space-y-4">
            <Panel
              title="Google Business Profile"
              right={
                <div className="flex items-center gap-2">
                  {local.mocked ? (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                      style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}
                    >
                      Sample data
                    </span>
                  ) : null}
                  <RefreshButton collector="local" siteId={siteId} lastUpdated={runs.get("local")?.finishedAt} />
                </div>
              }
            >
              {local.mocked ? (
                <p className="mb-3 rounded-lg border px-3 py-2 text-xs leading-relaxed"
                   style={{ borderColor: "var(--color-warn)", color: "var(--color-text-muted)" }}>
                  This is placeholder data. No Business Profile is connected for this client yet — connect
                  one on the client&apos;s page to replace every figure below with the real profile.
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Headline label="Rating" value={local.average ?? "—"} />
                <Headline label="Reviews" value={local.total} />
                <Headline label="Awaiting a reply" value={local.needsReply} />
                <Headline
                  label="Five star"
                  value={local.distribution.find((d) => d.stars === 5)?.count ?? 0}
                />
              </div>

              <div className="mt-4">
                <BarList
                  accent={colour?.hex ?? "#e11d2e"}
                  rows={local.distribution.map((d) => ({ label: `${d.stars} star`, value: d.count }))}
                  empty="No reviews recorded yet."
                />
              </div>
            </Panel>

            <Panel title="Recent reviews">
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Newest first. A review with no reply is worth answering — replying is the one lever the
                business fully controls, and it is visible to everyone who reads the profile afterwards.
              </p>
              {local.reviews.length === 0 ? (
                <Empty>No reviews yet.</Empty>
              ) : (
                <ul className="space-y-2">
                  {local.reviews.slice(0, 20).map((r) => (
                    <li key={r.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium">{r.author ?? "Anonymous"}</span>
                        <span
                          className="shrink-0 text-xs tabular-nums"
                          style={{
                            color:
                              (r.rating ?? 5) >= 4
                                ? "var(--color-ok)"
                                : (r.rating ?? 5) === 3
                                  ? "var(--color-warn)"
                                  : "var(--color-bad)",
                          }}
                        >
                          {r.rating ?? "—"} ★
                        </span>
                      </div>
                      {r.text ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{r.text}</p>
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-text-subtle)]">
                        <Time iso={r.created_at} dateOnly />
                        {r.reply_text ? (
                          <span style={{ color: "var(--color-ok)" }}>replied</span>
                        ) : (
                          <span style={{ color: "var(--color-warn)" }}>no reply yet</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}

        {/* ---------------- Setup ---------------- */}
        {tab === "setup" ? (
          <div className="space-y-4">
            <Panel title="About this business">
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Everything technical is derived from these answers — the keywords tracked, the questions
                buyers ask, where ranking is measured, and which install guide is shown. Nothing here is
                specific to any industry, so a client in any field is set up the same way.
              </p>
              <SiteProfileForm
                siteId={siteId}
                initial={{
                  industry: site.industry,
                  services: site.services ?? [],
                  serviceAreas: site.service_areas ?? [],
                  platform: site.platform,
                  profileNotes: site.profile_notes,
                  crawlExclusions: site.crawl_exclusions ?? [],
                }}
              />
            </Panel>

            <Panel title="Where ranking is measured">
              <ul className="flex flex-wrap gap-2">
                {locationLabels({
                  industry: site.industry,
                  services: site.services ?? [],
                  serviceAreas: site.service_areas ?? [],
                  platform: site.platform,
                  notes: site.profile_notes,
                }).map((l) => (
                  <li
                    key={l}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs"
                  >
                    {l}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                Taken from the service areas above. With none given, ranking is measured nationally.
              </p>
            </Panel>

            <Panel title="Installing the tag">
              <p className="mb-2 text-xs font-medium">
                Paste it immediately before the closing <code className="font-mono">&lt;/body&gt;</code> tag.
              </p>
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                That rule is true on every platform, including ones not listed here.
                {site.platform ? " For " + site.platform + ": " + installGuide(site.platform) : ""}
              </p>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
                <code className="block break-all font-mono text-[11px]">
                  {`<script defer src="https://f1mediateam.com/f1.js" data-site="${site.site_key}"></script>`}
                </code>
              </div>
            </Panel>

            <Panel title="For the client's privacy policy">
              <p className="mb-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Send this to the client to add to their privacy policy. It is accurate: the tag sets no
                cookies, stores nothing on the visitor&apos;s device, and collects no personal information.
              </p>
              <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 text-xs italic leading-relaxed">
                {PRIVACY_SENTENCE}
              </p>
            </Panel>

            {!site.gsc_connected ? (
              <Panel title="Search Console">
                <GscPropertyForm
                  siteId={siteId}
                  domain={site.domain}
                  current={site.gsc_property}
                  connected={site.gsc_connected}
                />
              </Panel>
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Search data ---------------- */}
        {tab === "search" ? (
          <Panel
            title="Search Console and Analytics"
            right={<RefreshButton collector="search" siteId={siteId} lastUpdated={runs.get("search")?.finishedAt} />}
          >
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              Search and Analytics data comes from the portal&apos;s existing nightly sync rather than a
              second copy kept here — one source of truth for the same numbers. The full breakdowns
              live on the client&apos;s own page.
            </p>
            <Link
              href={`/admin/clients/${site.client_id}`}
              className="mt-3 inline-block rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Open {client?.company_name ?? "client"} →
            </Link>
          </Panel>
        ) : null}
      </div>
    </AdminShell>
  );
}
