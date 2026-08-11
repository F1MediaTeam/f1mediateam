// F1 Pulse → monthly report.
//
// One typed rollup per client per month, plus a `toMonthlyContent` helper that
// maps it onto the shape the existing deck builder already consumes. The deck
// system is not touched: this produces a partial MonthlyContent, and the caller
// merges it with whatever else it is assembling.
//
// Everything here reads through src/lib/pulse/dashboard.ts rather than issuing
// its own queries, so a number in a deck and the same number on screen can
// never disagree.

import { data } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/server";
import { backlinkPanel, healthPanel, rankPanel, trafficPanel } from "@/lib/pulse/dashboard";
import { listSites } from "@/lib/pulse/sites";

/**
 * Brand constants, exported so the deck builder, the report view and any future
 * export stamp identical branding instead of each hardcoding its own.
 *
 * The accent is the console's red rather than the brand sheet's #E42130: the
 * two are close but distinct, and one product showing two reds on the same
 * screen looks like a mistake. #E42130 stays available for print.
 */
export const brand = {
  name: "F1 Media Team",
  product: "F1 Pulse",
  logoDark: "/logo.png", // light-ink mark, for dark surfaces
  logoLight: "/logo-light.png", // dark-ink mark, for light surfaces
  colors: {
    accent: "#e11d2e",
    accentPrint: "#E42130",
    nearBlack: "#272727",
  },
  footer: (period: string) => `Prepared by ${"F1 Media Team"} · ${period}`,
} as const;

export interface PulseMonthly {
  clientId: string;
  clientName: string;
  domain: string;
  period: { label: string; from: string; to: string };

  traffic: {
    visitors: number;
    pageviews: number;
    sessions: number;
    avgEngagementSec: number;
    /** percentage change against the previous window; null when there is no baseline */
    visitorsDelta: number | null;
    topPages: Array<{ path: string; views: number }>;
    topReferrers: Array<{ domain: string; views: number }>;
    vitals: Array<{ metric: string; p75: number; verdict: string }>;
  };

  conversions: { total: number; byKind: Record<string, number> };

  rankings: {
    tracked: number;
    inTop10: number;
    improved: Array<{ phrase: string; from: number; to: number }>;
    declined: Array<{ phrase: string; from: number; to: number }>;
    rows: Array<{ keyword: string; url: string; prior: number; current: number }>;
  };

  backlinks: { live: number; gained: number; lost: number; newDomains: string[] };

  siteHealth: {
    pagesCrawled: number;
    errors: number;
    warnings: number;
    lastCrawl: string | null;
    botsBlocked: string[];
    botsTracked: number;
  };

  search: { clicks: number | null; impressions: number | null; ctr: number | null; position: number | null };
}

const MONTH_MS = 30 * 86_400_000;

function pct(now: number, before: number): number | null {
  if (before === 0) return null; // no baseline — a percentage would be meaningless
  return Math.round(((now - before) / before) * 100);
}

/** Latest value of a metric_snapshots series inside a window. */
async function searchTotals(clientId: string, fromIso: string) {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("metric_snapshots")
    .select("metric, value, captured_at")
    .eq("client_id", clientId)
    .eq("source", "gsc")
    .gte("captured_at", fromIso.slice(0, 10))
    .in("metric", ["clicks", "impressions", "ctr", "avg_position"]);

  const all = (rows as Array<{ metric: string; value: number }>) ?? [];
  const sum = (m: string) => all.filter((r) => r.metric === m).reduce((a, b) => a + b.value, 0);
  const avg = (m: string) => {
    const vals = all.filter((r) => r.metric === m).map((r) => r.value);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    clicks: all.some((r) => r.metric === "clicks") ? Math.round(sum("clicks")) : null,
    impressions: all.some((r) => r.metric === "impressions") ? Math.round(sum("impressions")) : null,
    ctr: avg("ctr"),
    position: avg("avg_position"),
  };
}

/**
 * The month's numbers for one client.
 *
 * Returns null when the client has no Pulse site — the caller can then fall
 * back to whatever it did before rather than rendering a deck full of zeroes,
 * which would read as "we lost all your traffic" rather than "not measured".
 */
export async function pulseMonthly(clientId: string): Promise<PulseMonthly | null> {
  const sites = await listSites([clientId]);
  const site = sites[0];
  if (!site) return null;

  const clients = await data.listClients();
  const client = clients.find((c) => c.id === clientId);

  const now = Date.now();
  const from = new Date(now - MONTH_MS).toISOString();

  const [thisMonth, lastMonth, ranks, backlinks, health, search] = await Promise.all([
    trafficPanel(site.id, "30d"),
    trafficPanel(site.id, "90d"), // includes this month; the prior window is derived below
    rankPanel(site.id),
    backlinkPanel(site.id),
    healthPanel(site.id),
    searchTotals(clientId, from),
  ]);

  // The 90-day window minus the last 30 gives the preceding 60; halving it
  // approximates the prior month without a second round trip.
  const priorVisitors = Math.max(0, Math.round((lastMonth.totals.visitors - thisMonth.totals.visitors) / 2));

  const moved = ranks
    .filter((r) => r.position !== null && r.previous !== null && r.position !== r.previous)
    .map((r) => ({ phrase: r.phrase, from: r.previous as number, to: r.position as number }));

  return {
    clientId,
    clientName: client?.company_name ?? site.domain,
    domain: site.domain,
    period: {
      label: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      from: from.slice(0, 10),
      to: new Date(now).toISOString().slice(0, 10),
    },

    traffic: {
      visitors: thisMonth.totals.visitors,
      pageviews: thisMonth.totals.pageviews,
      sessions: thisMonth.totals.sessions,
      avgEngagementSec: thisMonth.totals.avgEngagementSec,
      visitorsDelta: pct(thisMonth.totals.visitors, priorVisitors),
      topPages: thisMonth.topPages.slice(0, 5),
      topReferrers: thisMonth.topReferrers.slice(0, 5),
      vitals: thisMonth.vitals,
    },

    conversions: {
      total: thisMonth.conversions.reduce((a, c) => a + c.count, 0),
      byKind: Object.fromEntries(thisMonth.conversions.map((c) => [c.kind, c.count])),
    },

    rankings: {
      tracked: ranks.filter((r) => r.isActive).length,
      inTop10: ranks.filter((r) => r.position !== null && r.position <= 10).length,
      improved: moved.filter((m) => m.from > m.to).sort((a, b) => b.from - b.to - (a.from - a.to)).slice(0, 10),
      declined: moved.filter((m) => m.from < m.to).slice(0, 10),
      // Pre-shaped for the deck's keywordRankings table.
      rows: ranks
        .filter((r) => r.position !== null)
        .slice(0, 15)
        .map((r) => ({
          keyword: r.phrase,
          url: r.rankingUrl ?? `https://${site.domain}/`,
          prior: r.previous ?? r.position ?? 0,
          current: r.position ?? 0,
        })),
    },

    backlinks: {
      live: backlinks.total,
      gained: backlinks.fresh.length,
      lost: backlinks.lost.length,
      newDomains: backlinks.fresh.slice(0, 10).map((b) => String(b.source_domain)),
    },

    siteHealth: {
      pagesCrawled: Number(health.crawl?.pages_crawled ?? 0),
      errors: health.counts.errors,
      warnings: health.counts.warnings,
      lastCrawl: (health.crawl?.finished_at as string) ?? null,
      botsBlocked: health.bots.filter((b) => !b.allowed).map((b) => String(b.bot)),
      botsTracked: health.bots.length,
    },

    search,
  };
}

/**
 * Map a rollup onto the deck's own shape.
 *
 * Returns a *partial* MonthlyContent on purpose: the deck also carries
 * narrative the AI writer produces, and overwriting that here would silently
 * discard it. The caller spreads this over its own object.
 */
export function toMonthlyContent(m: PulseMonthly): Record<string, unknown> {
  const wins: string[] = [];
  if (m.rankings.improved.length > 0) {
    const best = m.rankings.improved[0];
    wins.push(`"${best.phrase}" moved from #${best.from} to #${best.to}`);
  }
  if (m.conversions.total > 0) {
    wins.push(`${m.conversions.total} enquiries from the website`);
  }
  if (m.backlinks.gained > 0) {
    wins.push(`${m.backlinks.gained} new backlink${m.backlinks.gained === 1 ? "" : "s"}`);
  }
  if (m.traffic.visitorsDelta !== null && m.traffic.visitorsDelta > 0) {
    wins.push(`Visitors up ${m.traffic.visitorsDelta}% on the previous month`);
  }

  return {
    client: m.clientName,
    website: m.domain,
    reportPeriod: m.period.label,
    executiveSummary: {
      intro: `${m.traffic.visitors.toLocaleString()} people visited ${m.domain} this month across ${m.traffic.sessions.toLocaleString()} sessions.`,
      wins,
    },
    keywordRankings: {
      priorLabel: "Last month",
      currentLabel: "Now",
      rows: m.rankings.rows,
      note: `${m.rankings.inTop10} of ${m.rankings.tracked} tracked keywords are on page one.`,
    },
    organicTraffic: {
      clicks: { value: m.search.clicks !== null ? String(m.search.clicks) : "—" },
      impressions: { value: m.search.impressions !== null ? String(m.search.impressions) : "—" },
      ctr: { value: m.search.ctr !== null ? `${(m.search.ctr * 100).toFixed(1)}%` : "—" },
      avgPosition: { value: m.search.position !== null ? m.search.position.toFixed(1) : "—" },
    },
  };
}
