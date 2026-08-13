// Every read the F1 Pulse dashboard makes.
//
// Kept in one module so a panel and its Refresh button can never disagree about
// where a number came from, and so the aggregates module in Phase 5 reuses
// these rather than writing a second set of queries against the same tables.

import { createServiceClient } from "@/lib/supabase/server";
import { data } from "@/lib/data";
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

/**
 * Index health: what Google has actually accepted, and what changed.
 *
 * Deadweight is computed by joining verdicts against pulse_search_terms rather
 * than against a second copy of page performance — same reasoning as
 * collectors/search.ts, which deliberately collects nothing. One source of
 * truth, so the two can never disagree. Requires migration 0028.
 */
export async function indexPanel(siteId: string) {
  const supabase = await createServiceClient();

  const { data: runRows } = await supabase
    .from("pulse_index_runs")
    .select("id, started_at, finished_at, status, urls_total, urls_inspected, buckets, mocked")
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .limit(12);

  const runs =
    (runRows as Array<{
      id: string;
      started_at: string;
      finished_at: string | null;
      status: string;
      urls_total: number;
      urls_inspected: number;
      buckets: Record<string, number>;
      mocked: boolean;
    }>) ?? [];

  const latest = runs[0] ?? null;
  const lastComplete = runs.find((r) => r.status === "done") ?? null;
  const previousComplete = runs.filter((r) => r.status === "done")[1] ?? null;

  if (!latest) {
    return {
      latest: null,
      buckets: [] as Array<{ bucket: string; count: number }>,
      problems: [] as Array<{ url: string; bucket: string; coverage_state: string | null; last_crawl_time: string | null }>,
      deadweight: [] as string[],
      fixed: null as number | null,
      regressed: null as number | null,
      indexed: 0,
      total: 0,
      mocked: false,
      history: [] as Array<{ at: string; indexed: number }>,
    };
  }

  const buckets = Object.entries(latest.buckets ?? {})
    .map(([bucket, count]) => ({ bucket, count: Number(count) }))
    .sort((a, b) => b.count - a.count);

  // The buckets someone can act on. "indexed" needs no action and would
  // otherwise dominate a list meant to be a to-do.
  const { data: problemRows } = await supabase
    .from("pulse_index_verdicts")
    .select("url, bucket, coverage_state, last_crawl_time")
    .eq("run_id", latest.id)
    .in("bucket", ["rejected", "not_crawled", "canonical_override", "blocked", "error", "redirect"])
    .limit(300);

  // Deadweight: Google accepted the page, and nobody has seen it in search.
  const { data: indexedRows } = await supabase
    .from("pulse_index_verdicts")
    .select("url")
    .eq("run_id", latest.id)
    .eq("bucket", "indexed")
    .limit(5000);

  const { data: seenRows } = await supabase
    .from("pulse_search_terms")
    .select("term, impressions")
    .eq("site_id", siteId)
    .eq("dimension", "page")
    .gte("period_start", new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))
    .limit(20_000);

  const withImpressions = new Set(
    ((seenRows as Array<{ term: string; impressions: number }>) ?? [])
      .filter((r) => r.impressions > 0)
      .map((r) => r.term.replace(/\/$/, "")),
  );
  // Only meaningful once search history exists — with an empty table every
  // indexed page would look like deadweight, which is the opposite of true.
  const deadweight =
    withImpressions.size === 0
      ? []
      : ((indexedRows as Array<{ url: string }>) ?? [])
          .map((r) => r.url)
          .filter((u) => !withImpressions.has(u.replace(/\/$/, "")))
          .slice(0, 100);

  const indexed = latest.buckets?.indexed ?? 0;
  const previousIndexed = previousComplete?.buckets?.indexed ?? null;
  const delta = previousIndexed === null ? null : indexed - previousIndexed;

  return {
    latest,
    lastComplete,
    buckets,
    problems:
      (problemRows as Array<{
        url: string;
        bucket: string;
        coverage_state: string | null;
        last_crawl_time: string | null;
      }>) ?? [],
    deadweight,
    fixed: delta !== null && delta > 0 ? delta : null,
    regressed: delta !== null && delta < 0 ? Math.abs(delta) : null,
    indexed,
    total: latest.urls_total ?? 0,
    mocked: latest.mocked,
    history: runs
      .filter((r) => r.status === "done")
      .slice()
      .reverse()
      .map((r) => ({ at: r.started_at, indexed: r.buckets?.indexed ?? 0 })),
  };
}

/**
 * Referrer classification.
 *
 * The tag records where a visitor came from, which turns out to answer two
 * questions we otherwise have to buy: which links actually send people, and
 * whether AI assistants send anyone at all. It is a floor rather than a
 * census — only links someone clicked, only since the tag went live — and the
 * panels say so.
 */
const AI_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "you.com",
  "poe.com",
  "meta.ai",
  "grok.com",
  "x.ai",
];

const SEARCH_HOSTS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "ecosia.org",
  "search.brave.com",
  "yandex.",
  "baidu.com",
  "startpage.com",
  "qwant.com",
  "search.marcia",
];

const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "t.co",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "pinterest.",
  "reddit.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "nextdoor.com",
];

export type ReferrerKind = "ai" | "search" | "social" | "link";

/** Which bucket a referring host falls into. Order matters: AI before search,
 *  because gemini.google.com is Google but is not a search result. */
export function classifyReferrer(host: string): ReferrerKind {
  const h = host.toLowerCase();
  if (AI_HOSTS.some((a) => h === a || h.endsWith(`.${a}`) || h.includes(a))) return "ai";
  if (SEARCH_HOSTS.some((s) => h.includes(s))) return "search";
  if (SOCIAL_HOSTS.some((s) => h.includes(s))) return "social";
  return "link";
}

export interface ReferralRow {
  host: string;
  visits: number;
  people: number;
  kind: ReferrerKind;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Where visitors actually came from, split by kind.
 *
 * Self-referrals are dropped: a visitor moving between two pages of the
 * client's own site is navigation, not a link from anywhere.
 */
export async function referralPanel(siteId: string, domain: string, days = 90) {
  const supabase = await createServiceClient();
  const from = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: rows } = await supabase
    .from("pulse_pageviews")
    .select("referrer_domain, visitor_hash, ts")
    .eq("site_id", siteId)
    .gte("ts", from)
    .not("referrer_domain", "is", null)
    .limit(50_000);

  const all = (rows as Array<{ referrer_domain: string; visitor_hash: string; ts: string }>) ?? [];

  const bare = domain.replace(/^www\./, "").toLowerCase();
  const grouped = new Map<string, { visits: number; people: Set<string>; first: string; last: string }>();

  for (const r of all) {
    const host = (r.referrer_domain ?? "").toLowerCase();
    if (!host) continue;
    // The client's own site is not a referrer to itself.
    const hostBare = host.replace(/^www\./, "");
    if (hostBare === bare || hostBare.endsWith(`.${bare}`)) continue;

    const row = grouped.get(host) ?? { visits: 0, people: new Set<string>(), first: r.ts, last: r.ts };
    row.visits += 1;
    row.people.add(r.visitor_hash);
    if (r.ts < row.first) row.first = r.ts;
    if (r.ts > row.last) row.last = r.ts;
    grouped.set(host, row);
  }

  const list: ReferralRow[] = [...grouped.entries()]
    .map(([host, v]) => ({
      host,
      visits: v.visits,
      people: v.people.size,
      kind: classifyReferrer(host),
      firstSeen: v.first,
      lastSeen: v.last,
    }))
    .sort((a, b) => b.visits - a.visits);

  return {
    links: list.filter((r) => r.kind === "link"),
    ai: list.filter((r) => r.kind === "ai"),
    social: list.filter((r) => r.kind === "social"),
    search: list.filter((r) => r.kind === "search"),
    days,
    /** Total referred visits, so a panel can say how much it is describing. */
    totalReferred: list.reduce((s, r) => s + r.visits, 0),
  };
}

export interface PortfolioExtras {
  siteId: string;
  /** Search Console clicks and impressions, last 30 days vs the 30 before. */
  clicks: number;
  clicksPrev: number;
  impressions: number;
  /** Open opportunities, and how many are the high-value strike-distance kind. */
  opportunities: number;
  strikeDistance: number;
  /** Index health from the most recent completed inspection. */
  indexed: number | null;
  indexTotal: number | null;
  /** Competitors actively tracked for this site. */
  competitors: number;
}

/**
 * The free-data columns for the Portfolio Overview.
 *
 * Deliberately one query per concern across every site at once rather than
 * per-site loops — the overview is the first screen loaded and a per-site
 * fan-out makes it slower with every client signed.
 */
export async function portfolioExtras(siteIds: string[]): Promise<Map<string, PortfolioExtras>> {
  const out = new Map<string, PortfolioExtras>();
  if (siteIds.length === 0) return out;

  const supabase = await createServiceClient();
  const from30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const from60 = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

  const [termsRes, oppsRes, runsRes, compsRes] = await Promise.all([
    supabase
      .from("pulse_search_terms")
      .select("site_id, clicks, impressions, period_start")
      .in("site_id", siteIds)
      .eq("dimension", "query")
      .eq("granularity", "day")
      .gte("period_start", from60)
      .limit(40_000),
    supabase
      .from("pulse_opportunities")
      .select("site_id, category, status")
      .in("site_id", siteIds)
      .eq("status", "open")
      .limit(20_000),
    supabase
      .from("pulse_index_runs")
      .select("site_id, buckets, urls_total, status, started_at")
      .in("site_id", siteIds)
      .eq("status", "done")
      .order("started_at", { ascending: false })
      .limit(200),
    supabase
      .from("pulse_competitors")
      .select("site_id, is_active")
      .in("site_id", siteIds)
      .eq("is_active", true)
      .limit(2000),
  ]);

  const terms =
    (termsRes.data as Array<{ site_id: string; clicks: number; impressions: number; period_start: string }>) ?? [];
  const opps = (oppsRes.data as Array<{ site_id: string; category: string }>) ?? [];
  const runs =
    (runsRes.data as Array<{ site_id: string; buckets: Record<string, number>; urls_total: number }>) ?? [];
  const comps = (compsRes.data as Array<{ site_id: string }>) ?? [];

  // Newest completed index run wins; the query is already newest-first.
  const newestRun = new Map<string, { buckets: Record<string, number>; urls_total: number }>();
  for (const r of runs) if (!newestRun.has(r.site_id)) newestRun.set(r.site_id, r);

  for (const siteId of siteIds) {
    const mine = terms.filter((t) => t.site_id === siteId);
    const recent = mine.filter((t) => t.period_start >= from30);
    const prior = mine.filter((t) => t.period_start < from30);
    const myOpps = opps.filter((o) => o.site_id === siteId);
    const run = newestRun.get(siteId);

    out.set(siteId, {
      siteId,
      clicks: recent.reduce((s, t) => s + t.clicks, 0),
      clicksPrev: prior.reduce((s, t) => s + t.clicks, 0),
      impressions: recent.reduce((s, t) => s + t.impressions, 0),
      opportunities: myOpps.length,
      strikeDistance: myOpps.filter((o) => o.category === "strike_distance").length,
      indexed: run ? (run.buckets?.indexed ?? 0) : null,
      indexTotal: run ? run.urls_total : null,
      competitors: comps.filter((c) => c.site_id === siteId).length,
    });
  }

  return out;
}

export interface GscRankRow {
  query: string;
  position: number;
  previousPosition: number | null;
  clicks: number;
  impressions: number;
  ctr: number;
}

/**
 * The Free Mode Rankings surface: real positions, measured by Google.
 *
 * This is a genuinely different thing from paid rank tracking and the UI must
 * say so. Paid tracking answers "where do I rank for the keywords I chose" —
 * including keywords nobody has ever found the site with. This answers "where
 * did I actually rank for the searches that reached me", averaged across
 * everyone who saw it, lagging about two days.
 *
 * The trade is real but the data is not a downgrade: these are Google's own
 * numbers for searches that genuinely happened, rather than a sample of one
 * search from one location.
 */
export async function gscRankPanel(siteId: string, clientId: string): Promise<{
  rows: GscRankRow[];
  connected: boolean;
  from: string;
  to: string;
}> {
  const connectors = await data.listConnectors(clientId);
  const connected = connectors.some((c: { provider: string }) => c.provider === "gsc");
  // Google's data is incomplete for the last couple of days, so the window
  // ends two days back rather than today — otherwise every position looks
  // like it moved every morning.
  const to = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  if (!connected) return { rows: [], connected: false, from, to };

  const supabase = await createServiceClient();

  // Read from the stored daily rows the forward-fill maintains rather than
  // calling Google on every page view. Same numbers, no quota spent, and the
  // page stays fast.
  const { data: rows } = await supabase
    .from("pulse_search_terms")
    .select("term, clicks, impressions, ctr, position, period_start")
    .eq("site_id", siteId)
    .eq("dimension", "query")
    .eq("granularity", "day")
    .gte("period_start", from)
    .limit(20_000);

  const all =
    (rows as Array<{
      term: string;
      clicks: number;
      impressions: number;
      ctr: number | null;
      position: number | null;
      period_start: string;
    }>) ?? [];

  if (all.length === 0) return { rows: [], connected: true, from, to };

  // Split the window in half so "moved up / moved down" compares two equal
  // periods rather than one day against a month.
  const midpoint = new Date(Date.now() - 16 * 86_400_000).toISOString().slice(0, 10);

  const agg = new Map<
    string,
    { clicks: number; impressions: number; posSum: number; posWeight: number; prevSum: number; prevWeight: number }
  >();

  for (const r of all) {
    const row = agg.get(r.term) ?? {
      clicks: 0,
      impressions: 0,
      posSum: 0,
      posWeight: 0,
      prevSum: 0,
      prevWeight: 0,
    };
    const recent = r.period_start >= midpoint;
    if (recent) {
      row.clicks += r.clicks;
      row.impressions += r.impressions;
      // Weighted by impressions: a position held on 900 impressions describes
      // the query better than one held on a single impression.
      if (r.position !== null) {
        row.posSum += r.position * Math.max(1, r.impressions);
        row.posWeight += Math.max(1, r.impressions);
      }
    } else if (r.position !== null) {
      row.prevSum += r.position * Math.max(1, r.impressions);
      row.prevWeight += Math.max(1, r.impressions);
    }
    agg.set(r.term, row);
  }

  const out: GscRankRow[] = [...agg.entries()]
    .filter(([, v]) => v.posWeight > 0)
    .map(([query, v]) => ({
      query,
      position: Math.round((v.posSum / v.posWeight) * 10) / 10,
      previousPosition: v.prevWeight > 0 ? Math.round((v.prevSum / v.prevWeight) * 10) / 10 : null,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 200);

  return { rows: out, connected: true, from, to };
}

export interface CompetitorRow {
  domainId: string;
  domain: string;
  capturedAt: string | null;
  pagesListed: number | null;
  pagesNew: number | null;
  published30d: number | null;
  speedScore: number | null;
  measured: Record<string, unknown>;
  /** Change in listed pages since the previous snapshot. */
  pagesDelta: number | null;
}

/**
 * Competitors for one site, with the latest measurements and the movement
 * since the snapshot before it.
 *
 * Everything here is measured by us. The vendor columns on the same table
 * (est_traffic, authority_score, ref_domains) are deliberately not read —
 * they are null, and a panel that reads them would imply we know something we
 * do not. Requires migration 0027.
 */
export async function competitorPanel(siteId: string) {
  const supabase = await createServiceClient();

  const { data: links } = await supabase
    .from("pulse_competitors")
    .select("domain_id, is_active, pulse_domains!inner(id, domain)")
    .eq("site_id", siteId)
    .eq("is_active", true);

  type Joined = {
    domain_id: string;
    pulse_domains: { id: string; domain: string } | Array<{ id: string; domain: string }> | null;
  };
  const domains = ((links as unknown as Joined[]) ?? [])
    .map((r) => {
      const d = Array.isArray(r.pulse_domains) ? r.pulse_domains[0] : r.pulse_domains;
      return d ? { domainId: r.domain_id, domain: d.domain } : null;
    })
    .filter((d): d is { domainId: string; domain: string } => d !== null);

  if (domains.length === 0) {
    return { competitors: [] as CompetitorRow[], lastChecked: null as string | null };
  }

  const { data: snapshots } = await supabase
    .from("pulse_domain_snapshots")
    .select("domain_id, captured_at, pages_listed, pages_new, published_30d, speed_score, measured")
    .in(
      "domain_id",
      domains.map((d) => d.domainId),
    )
    .eq("source", "measured")
    .order("captured_at", { ascending: false })
    .limit(400);

  const rows =
    (snapshots as Array<{
      domain_id: string;
      captured_at: string;
      pages_listed: number | null;
      pages_new: number | null;
      published_30d: number | null;
      speed_score: number | null;
      measured: Record<string, unknown>;
    }>) ?? [];

  const competitors: CompetitorRow[] = domains.map((d) => {
    const mine = rows.filter((r) => r.domain_id === d.domainId);
    const latest = mine[0] ?? null;
    const previous = mine[1] ?? null;
    return {
      domainId: d.domainId,
      domain: d.domain,
      capturedAt: latest?.captured_at ?? null,
      pagesListed: latest?.pages_listed ?? null,
      pagesNew: latest?.pages_new ?? null,
      published30d: latest?.published_30d ?? null,
      speedScore: latest?.speed_score ?? null,
      measured: latest?.measured ?? {},
      pagesDelta:
        latest?.pages_listed != null && previous?.pages_listed != null
          ? latest.pages_listed - previous.pages_listed
          : null,
    };
  });

  return {
    competitors: competitors.sort((a, b) => (b.pagesListed ?? 0) - (a.pagesListed ?? 0)),
    lastChecked: rows[0]?.captured_at ?? null,
  };
}

/**
 * Lab speed tests, newest per URL.
 *
 * Deliberately separate from the vitals in trafficPanel: those are the tag's
 * own measurements of real visitors, these are a simulated load. The panel
 * shows both and never averages them, per the source-class rules.
 */
export async function psiPanel(siteId: string) {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("pulse_psi_checks")
    .select("url, strategy, fetched_at, lab_scores, error")
    .eq("site_id", siteId)
    .order("fetched_at", { ascending: false })
    .limit(60);

  const all =
    (rows as Array<{
      url: string;
      strategy: string;
      fetched_at: string;
      lab_scores: Record<string, unknown>;
      error: string | null;
    }>) ?? [];

  // One row per URL — the most recent test is the only one worth showing.
  const seen = new Set<string>();
  const latest = all.filter((r) => {
    const key = `${r.url}:${r.strategy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    pages: latest,
    lastChecked: all[0]?.fetched_at ?? null,
    configured: latest.length > 0,
  };
}

export async function localPanel(siteId: string) {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("pulse_reviews")
    .select("id, review_id, rating, author, text, reply_text, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(50);

  const reviews =
    (rows as Array<{
      id: number;
      review_id: string;
      rating: number | null;
      author: string | null;
      text: string | null;
      reply_text: string | null;
      created_at: string;
    }>) ?? [];

  const rated = reviews.filter((r) => typeof r.rating === "number");
  const average =
    rated.length > 0 ? Math.round((rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null;

  // A review with no owner reply is an open task, and the low-rated ones are
  // the ones worth answering first.
  const needsReply = reviews.filter((r) => !r.reply_text);

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => r.rating === stars).length,
  }));

  // Mock rows are written with a recognisable id prefix by the collector, so
  // the panel can badge itself without a second lookup.
  const mocked = reviews.length > 0 && reviews.every((r) => r.review_id.startsWith("mock-"));

  return {
    reviews,
    average,
    total: reviews.length,
    needsReply: needsReply.length,
    distribution,
    mocked,
    newest: reviews[0]?.created_at ?? null,
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
