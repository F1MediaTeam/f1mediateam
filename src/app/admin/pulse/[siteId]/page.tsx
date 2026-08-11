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
  healthPanel,
  lastRuns,
  rankPanel,
  trafficPanel,
  type Range,
} from "@/lib/pulse/dashboard";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import RefreshButton from "@/components/admin/pulse/RefreshButton";
import Sparkline from "@/components/admin/pulse/Sparkline";
import KeywordManager, { KeywordRowActions } from "@/components/admin/pulse/KeywordManager";
import CsvButton from "@/components/admin/pulse/CsvButton";
import TrafficChart from "@/components/admin/pulse/TrafficChart";
import BarList from "@/components/admin/pulse/BarList";
import VitalMeter from "@/components/admin/pulse/VitalMeter";

export const dynamic = "force-dynamic";

const TABS = ["traffic", "rankings", "backlinks", "health", "search"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  traffic: "Traffic",
  rankings: "Rankings",
  backlinks: "Backlinks",
  health: "Site health",
  search: "Search data",
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
  const ranks = tab === "rankings" ? await rankPanel(siteId) : null;
  const backlinks = tab === "backlinks" ? await backlinkPanel(siteId) : null;
  const health = tab === "health" ? await healthPanel(siteId) : null;

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
            <Link
              href={`/admin/pulse/${siteId}/report`}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Client report
            </Link>
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
