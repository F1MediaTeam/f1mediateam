// Every read the F1 Pulse dashboard makes.
//
// Kept in one module so a panel and its Refresh button can never disagree about
// where a number came from, and so the aggregates module in Phase 5 reuses
// these rather than writing a second set of queries against the same tables.

import { createServiceClient } from "@/lib/supabase/server";
import { visibility, type VisibilitySummary } from "@/lib/pulse/visibility";

export type Range = "24h" | "7d" | "30d" | "90d";

export const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 168, "30d": 720, "90d": 2160 };

function since(range: Range): string {
  return new Date(Date.now() - RANGE_HOURS[range] * 3_600_000).toISOString();
}

// Google's own thresholds. Pass/needs-work/fail, not a made-up score.
export const VITAL_THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export interface OverviewCard {
  siteId: string;
  clientId: string;
  domain: string;
  status: string;
  liveVisitors: number;
  today: { visitors: number; pageviews: number; conversions: number };
  yesterday: { visitors: number; pageviews: number };
  ranks: { improved: number; declined: number; tracked: number };
  health: { errors: number; botsBlocked: number; lastCrawl: string | null };
  lastBeaconAt: string | null;
}

/** "Right now" is the last five minutes — long enough to be stable, short
 *  enough that the number means someone is actually on the site. */
const LIVE_WINDOW_MS = 5 * 60 * 1000;

export async function overviewCards(siteIds: string[]): Promise<OverviewCard[]> {
  if (siteIds.length === 0) return [];
  const supabase = await createServiceClient();

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const liveSince = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();

  const [sitesRes, viewsRes, convRes, keywordsRes, crawlsRes, botsRes] = await Promise.all([
    supabase.from("pulse_sites").select("id, client_id, domain, status, last_beacon_at, last_crawled_at").in("id", siteIds),
    supabase.from("pulse_pageviews").select("site_id, ts, visitor_hash").in("site_id", siteIds).gte("ts", twoDaysAgo),
    supabase.from("pulse_conversions").select("site_id, ts").in("site_id", siteIds).gte("ts", dayAgo),
    supabase.from("pulse_keywords").select("id, site_id").in("site_id", siteIds).eq("is_active", true),
    supabase.from("pulse_crawls").select("id, site_id, finished_at").in("site_id", siteIds).eq("status", "done").order("finished_at", { ascending: false }),
    supabase.from("pulse_bot_access").select("site_id, bot, allowed, checked_at").in("site_id", siteIds).order("checked_at", { ascending: false }),
  ]);

  const views = (viewsRes.data as Array<{ site_id: string; ts: string; visitor_hash: string }>) ?? [];
  const convs = (convRes.data as Array<{ site_id: string }>) ?? [];
  const keywords = (keywordsRes.data as Array<{ id: string; site_id: string }>) ?? [];
  const crawls = (crawlsRes.data as Array<{ id: string; site_id: string; finished_at: string }>) ?? [];
  const bots = (botsRes.data as Array<{ site_id: string; bot: string; allowed: boolean }>) ?? [];

  // Rank movement for the whole set in two queries rather than two per keyword.
  const keywordIds = keywords.map((k) => k.id);
  const { data: checkRows } = keywordIds.length
    ? await supabase
        .from("pulse_rank_checks")
        .select("keyword_id, position, checked_at")
        .in("keyword_id", keywordIds)
        .order("checked_at", { ascending: false })
        .limit(keywordIds.length * 4)
    : { data: [] };
  const checks = (checkRows as Array<{ keyword_id: string; position: number | null }>) ?? [];

  const latest = new Map<string, number | null>();
  const prior = new Map<string, number | null>();
  for (const c of checks) {
    if (!latest.has(c.keyword_id)) latest.set(c.keyword_id, c.position);
    else if (!prior.has(c.keyword_id)) prior.set(c.keyword_id, c.position);
  }

  // The most recent crawl per site, and its error count.
  const newestCrawl = new Map<string, { id: string; finished_at: string }>();
  for (const c of crawls) if (!newestCrawl.has(c.site_id)) newestCrawl.set(c.site_id, c);
  const crawlIds = [...newestCrawl.values()].map((c) => c.id);
  const { data: issueRows } = crawlIds.length
    ? await supabase.from("pulse_crawl_issues").select("crawl_id, severity").in("crawl_id", crawlIds).eq("severity", "error")
    : { data: [] };
  const errorsByCrawl = new Map<string, number>();
  for (const i of (issueRows as Array<{ crawl_id: string }>) ?? []) {
    errorsByCrawl.set(i.crawl_id, (errorsByCrawl.get(i.crawl_id) ?? 0) + 1);
  }

  return ((sitesRes.data as Array<Record<string, string | null>>) ?? []).map((s) => {
    const siteId = s.id as string;
    const mine = views.filter((v) => v.site_id === siteId);
    const todayViews = mine.filter((v) => v.ts >= dayAgo);
    const yesterdayViews = mine.filter((v) => v.ts < dayAgo);

    const myKeywords = keywords.filter((k) => k.site_id === siteId);
    let improved = 0;
    let declined = 0;
    for (const k of myKeywords) {
      const now = latest.get(k.id);
      const before = prior.get(k.id);
      if (now == null || before == null) continue;
      if (before - now >= 3) improved += 1;
      else if (now - before >= 3) declined += 1;
    }

    // One row per bot — the query is newest-first, so the first sighting of
    // each bot is its current state.
    const seenBots = new Set<string>();
    let botsBlocked = 0;
    for (const b of bots.filter((b) => b.site_id === siteId)) {
      if (seenBots.has(b.bot)) continue;
      seenBots.add(b.bot);
      if (!b.allowed) botsBlocked += 1;
    }

    const crawl = newestCrawl.get(siteId);
    return {
      siteId,
      clientId: s.client_id as string,
      domain: s.domain as string,
      status: s.status as string,
      liveVisitors: new Set(mine.filter((v) => v.ts >= liveSince).map((v) => v.visitor_hash)).size,
      today: {
        visitors: new Set(todayViews.map((v) => v.visitor_hash)).size,
        pageviews: todayViews.length,
        conversions: convs.filter((c) => c.site_id === siteId).length,
      },
      yesterday: {
        visitors: new Set(yesterdayViews.map((v) => v.visitor_hash)).size,
        pageviews: yesterdayViews.length,
      },
      ranks: { improved, declined, tracked: myKeywords.length },
      health: { errors: crawl ? (errorsByCrawl.get(crawl.id) ?? 0) : 0, botsBlocked, lastCrawl: crawl?.finished_at ?? null },
      lastBeaconAt: s.last_beacon_at as string | null,
    };
  });
}

export interface TrafficPanel {
  series: Array<{ bucket: string; visitors: number; pageviews: number }>;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ domain: string; views: number }>;
  utms: Array<{ label: string; views: number }>;
  vitals: Array<{ metric: string; p75: number; verdict: "good" | "needs-improvement" | "poor" }>;
  conversions: Array<{ kind: string; count: number; topTarget: string | null }>;
  totals: { visitors: number; pageviews: number; sessions: number; avgEngagementSec: number };
  /** the same window immediately before this one, for deltas */
  previous: { visitors: number; pageviews: number; sessions: number; avgEngagementSec: number };
}

export async function trafficPanel(siteId: string, range: Range): Promise<TrafficPanel> {
  const supabase = await createServiceClient();
  const from = since(range);
  // The window immediately before this one — same length, so "up 18%" compares
  // like with like rather than against an arbitrary baseline.
  const prevFrom = new Date(Date.now() - RANGE_HOURS[range] * 2 * 3_600_000).toISOString();

  const [viewsRes, vitalsRes, convRes, prevRes] = await Promise.all([
    supabase.from("pulse_pageviews").select("ts, path, referrer_domain, utm_source, utm_medium, visitor_hash, session_hash, engagement_ms").eq("site_id", siteId).gte("ts", from).order("ts", { ascending: true }).limit(20000),
    supabase.from("pulse_web_vitals").select("metric, value").eq("site_id", siteId).gte("ts", from).limit(20000),
    supabase.from("pulse_conversions").select("kind, target").eq("site_id", siteId).gte("ts", from).limit(20000),
    supabase.from("pulse_pageviews").select("visitor_hash, session_hash, engagement_ms").eq("site_id", siteId).gte("ts", prevFrom).lt("ts", from).limit(20000),
  ]);

  const views = (viewsRes.data as Array<Record<string, string | number | null>>) ?? [];

  // Hourly for a day, daily beyond — 90 daily points read well, 2,160 hourly
  // ones do not.
  const hourly = range === "24h";
  const buckets = new Map<string, { visitors: Set<string>; pageviews: number }>();
  for (const v of views) {
    const ts = String(v.ts);
    const key = hourly ? ts.slice(0, 13) + ":00" : ts.slice(0, 10);
    const b = buckets.get(key) ?? { visitors: new Set<string>(), pageviews: 0 };
    b.visitors.add(String(v.visitor_hash));
    b.pageviews += 1;
    buckets.set(key, b);
  }

  const count = <T extends string>(rows: Array<Record<string, unknown>>, key: string) => {
    const m = new Map<T, number>();
    for (const r of rows) {
      const val = r[key];
      if (!val) continue;
      m.set(val as T, (m.get(val as T) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const vitalRows = (vitalsRes.data as Array<{ metric: string; value: number }>) ?? [];
  const vitals = Object.keys(VITAL_THRESHOLDS)
    .map((metric) => {
      const values = vitalRows.filter((v) => v.metric === metric).map((v) => v.value).sort((a, b) => a - b);
      if (values.length === 0) return null;
      // p75 is what Core Web Vitals is assessed on — an average hides the
      // quarter of visits having the worst time.
      const p75 = values[Math.floor(values.length * 0.75)] ?? values[values.length - 1];
      const [good, poor] = VITAL_THRESHOLDS[metric];
      return {
        metric,
        p75: Math.round(p75 * 1000) / 1000,
        verdict: (p75 <= good
          ? "good"
          : p75 <= poor
            ? "needs-improvement"
            : "poor") as "good" | "needs-improvement" | "poor",
      };
    })
    .filter(Boolean) as TrafficPanel["vitals"];

  const convRows = (convRes.data as Array<{ kind: string; target: string | null }>) ?? [];
  const conversions = ["tel_click", "mailto_click", "outbound_click", "form_submit"].map((kind) => {
    const rows = convRows.filter((c) => c.kind === kind);
    const targets = count(rows as unknown as Array<Record<string, unknown>>, "target");
    return { kind, count: rows.length, topTarget: (targets[0]?.[0] as string) ?? null };
  });

  const engagements = views.map((v) => Number(v.engagement_ms ?? 0)).filter((n) => n > 0);

  const prev = (prevRes.data as Array<Record<string, unknown>>) ?? [];
  const prevEngagements = prev.map((v) => Number(v.engagement_ms ?? 0)).filter((n) => n > 0);

  return {
    series: [...buckets.entries()].sort().map(([bucket, b]) => ({ bucket, visitors: b.visitors.size, pageviews: b.pageviews })),
    topPages: count(views, "path").slice(0, 12).map(([path, views_]) => ({ path: path as string, views: views_ })),
    topReferrers: count(views, "referrer_domain").slice(0, 10).map(([domain, views_]) => ({ domain: domain as string, views: views_ })),
    utms: count(views, "utm_source").slice(0, 8).map(([label, views_]) => ({ label: label as string, views: views_ })),
    vitals,
    conversions,
    totals: {
      visitors: new Set(views.map((v) => String(v.visitor_hash))).size,
      pageviews: views.length,
      sessions: new Set(views.map((v) => String(v.session_hash))).size,
      avgEngagementSec: engagements.length ? Math.round(engagements.reduce((a, b) => a + b, 0) / engagements.length / 1000) : 0,
    },
    previous: {
      visitors: new Set(prev.map((v) => String(v.visitor_hash))).size,
      pageviews: prev.length,
      sessions: new Set(prev.map((v) => String(v.session_hash))).size,
      avgEngagementSec: prevEngagements.length
        ? Math.round(prevEngagements.reduce((a, b) => a + b, 0) / prevEngagements.length / 1000)
        : 0,
    },
  };
}

export interface RankRow {
  keywordId: string;
  phrase: string;
  position: number | null;
  previous: number | null;
  best: number | null;
  rankingUrl: string | null;
  history: Array<number | null>;
  isActive: boolean;
}

/** The whole tracked set as one score, for the headline and the trend. */
export async function visibilityFor(siteId: string): Promise<VisibilitySummary> {
  const rows = await rankPanel(siteId);
  return visibility(rows.map((r) => ({ position: r.position, previous: r.previous })));
}

export async function rankPanel(siteId: string): Promise<RankRow[]> {
  const supabase = await createServiceClient();
  const { data: kwRows } = await supabase
    .from("pulse_keywords")
    .select("id, phrase, is_active")
    .eq("site_id", siteId)
    .order("phrase", { ascending: true });
  const keywords = (kwRows as Array<{ id: string; phrase: string; is_active: boolean }>) ?? [];
  if (keywords.length === 0) return [];

  const { data: checkRows } = await supabase
    .from("pulse_rank_checks")
    .select("keyword_id, position, ranking_url, checked_at")
    .in("keyword_id", keywords.map((k) => k.id))
    .order("checked_at", { ascending: false })
    .limit(keywords.length * 40);
  const checks = (checkRows as Array<{ keyword_id: string; position: number | null; ranking_url: string | null }>) ?? [];

  return keywords.map((k) => {
    const mine = checks.filter((c) => c.keyword_id === k.id);
    const positions = mine.map((c) => c.position);
    const ranked = positions.filter((p): p is number => p !== null);
    return {
      keywordId: k.id,
      phrase: k.phrase,
      position: positions[0] ?? null,
      previous: positions[1] ?? null,
      best: ranked.length ? Math.min(...ranked) : null,
      rankingUrl: mine[0]?.ranking_url ?? null,
      // Oldest-to-newest so the sparkline reads left to right.
      history: positions.slice(0, 30).reverse(),
      isActive: k.is_active,
    };
  });
}

export async function backlinkPanel(siteId: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("pulse_backlinks")
    .select("source_url, source_domain, anchor, status, first_seen, last_seen, metrics")
    .eq("site_id", siteId)
    .order("last_seen", { ascending: false })
    .limit(500);
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  return {
    total: rows.filter((r) => r.status !== "lost").length,
    fresh: rows.filter((r) => r.status === "new"),
    lost: rows.filter((r) => r.status === "lost"),
    all: rows,
  };
}

export async function healthPanel(siteId: string) {
  const supabase = await createServiceClient();
  const { data: crawlRows } = await supabase
    .from("pulse_crawls")
    .select("id, started_at, finished_at, status, pages_crawled")
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .limit(1);
  const crawl = (crawlRows as Array<Record<string, unknown>>)?.[0] ?? null;

  const { data: issueRows } = crawl
    ? await supabase.from("pulse_crawl_issues").select("url, type, severity, detail").eq("crawl_id", crawl.id as string).limit(1000)
    : { data: [] };

  const { data: botRows } = await supabase
    .from("pulse_bot_access")
    .select("bot, allowed, blocked_sample_paths, checked_at")
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(40);

  const seen = new Set<string>();
  const bots = ((botRows as Array<Record<string, unknown>>) ?? []).filter((b) => {
    if (seen.has(b.bot as string)) return false;
    seen.add(b.bot as string);
    return true;
  });

  const issues = (issueRows as Array<Record<string, unknown>>) ?? [];
  const byType = new Map<string, { type: string; severity: string; count: number; sample: string }>();
  for (const i of issues) {
    const key = i.type as string;
    const row = byType.get(key) ?? { type: key, severity: i.severity as string, count: 0, sample: i.url as string };
    row.count += 1;
    byType.set(key, row);
  }

  return {
    crawl,
    bots,
    issueGroups: [...byType.values()].sort(
      (a, b) =>
        ({ error: 0, warning: 1, notice: 2 })[a.severity as "error"] -
          ({ error: 0, warning: 1, notice: 2 })[b.severity as "error"] || b.count - a.count,
    ),
    counts: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      notices: issues.filter((i) => i.severity === "notice").length,
    },
  };
}

export interface OpportunityRow {
  id: number;
  page: string;
  category: string;
  status: string;
  computed_at: string;
  detail: Record<string, unknown>;
}

/**
 * Everything the Opportunities tab reads.
 *
 * Open findings only by default — a list that keeps showing work you already
 * did is a list you stop opening. Dismissed and done rows stay in the table so
 * a recompute can't resurrect them; they're counted here but not listed.
 */
export async function opportunityPanel(siteId: string) {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("pulse_opportunities")
    .select("id, page, category, status, computed_at, detail")
    .eq("site_id", siteId)
    .order("computed_at", { ascending: false })
    .limit(2000);

  const all = (rows as OpportunityRow[]) ?? [];
  const open = all.filter((r) => r.status === "open");

  // Strike-distance first, ordered by impressions: the biggest audience
  // closest to page one is the most valuable hour of work available.
  const strike = open
    .filter((r) => r.category === "strike_distance")
    .sort((a, b) => Number(b.detail?.impressions ?? 0) - Number(a.detail?.impressions ?? 0));

  const cannibalization = open.filter((r) => r.detail?.kind === "cannibalization");

  const byCategory = new Map<string, number>();
  for (const r of open) {
    if (r.detail?.kind === "cannibalization") continue; // counted on its own
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }

  // Which pages carry the most fixable work — the fix-this-page-first list.
  const byPage = new Map<string, number>();
  for (const r of open) {
    if (r.category === "strike_distance" || r.category === "cwv") continue;
    byPage.set(r.page, (byPage.get(r.page) ?? 0) + 1);
  }

  return {
    strike,
    cannibalization,
    cwv: open.filter((r) => r.category === "cwv"),
    fixes: open.filter(
      (r) => r.category !== "strike_distance" && r.category !== "cwv" && r.detail?.kind !== "cannibalization",
    ),
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    topPages: [...byPage.entries()].map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    counts: {
      open: open.length,
      done: all.filter((r) => r.status === "done").length,
      dismissed: all.filter((r) => r.status === "dismissed").length,
    },
    lastComputed: all[0]?.computed_at ?? null,
  };
}

export async function feedEvents(siteIds: string[], limit = 100) {
  if (siteIds.length === 0) return [];
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("pulse_feed_events")
    .select("id, site_id, ts, kind, severity, title, payload")
    .in("site_id", siteIds)
    .order("ts", { ascending: false })
    .limit(limit);
  return (data as Array<Record<string, unknown>>) ?? [];
}

/** When each collector last completed, for the "Last updated" stamps. */
export async function lastRuns(siteId: string | null) {
  const supabase = await createServiceClient();
  let q = supabase
    .from("pulse_runs")
    .select("collector, finished_at, ok, mocked, site_id")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(60);
  if (siteId) q = q.or(`site_id.eq.${siteId},site_id.is.null`);
  const { data } = await q;

  const out = new Map<string, { finishedAt: string; ok: boolean; mocked: boolean }>();
  for (const r of (data as Array<Record<string, unknown>>) ?? []) {
    const c = r.collector as string;
    if (!out.has(c)) out.set(c, { finishedAt: r.finished_at as string, ok: Boolean(r.ok), mocked: Boolean(r.mocked) });
  }
  return out;
}
