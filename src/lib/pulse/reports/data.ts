// Report Center — data gathering for absolute date windows.
//
// The dashboard reads relative ranges ("last 30 days" from now). A report reads
// a fixed window that must produce the same numbers when regenerated in six
// months, so none of this touches the clock: every bound comes from the
// ResolvedRange passed in.

import { createServiceClient } from "@/lib/supabase/server";
import { visibility, type VisibilitySummary } from "@/lib/pulse/visibility";
import { siteHealthScore } from "@/lib/pulse/collectors/crawl";
import { splitBranded, type BrandSplit, type ResolvedRange } from "./core";

/** Supabase range filters are half-open on the upper bound; `to` is inclusive. */
function endExclusive(to: string): string {
  return new Date(Date.parse(to) + 86_400_000).toISOString();
}

function startOf(from: string): string {
  return new Date(Date.parse(from)).toISOString();
}

export interface TrafficTotals {
  visitors: number;
  pageviews: number;
  sessions: number;
  avgEngagementSec: number;
  /** Sessions with exactly one pageview, as a percentage. */
  bounceRate: number;
}

export interface MonthlyData {
  traffic: TrafficTotals;
  prevTraffic: TrafficTotals;
  /** One point per day across the whole window, zero-filled. */
  series: Array<{ date: string; visitors: number; pageviews: number }>;
  topPages: Array<{ path: string; views: number; visitors: number }>;
  sources: Array<{ label: string; views: number }>;
  devices: Array<{ label: string; views: number }>;
  countries: Array<{ label: string; views: number }>;
  conversions: Array<{ kind: string; count: number; prev: number }>;

  search: { clicks: number; impressions: number; ctr: number; position: number } | null;
  prevSearch: { clicks: number; impressions: number; ctr: number; position: number } | null;
  topQueries: Array<{ term: string; clicks: number; impressions: number; ctr: number; position: number }>;
  brandSplit: BrandSplit | null;

  rankings: Array<{ phrase: string; position: number | null; prevPosition: number | null }>;
  visibilityNow: VisibilitySummary | null;
  visibilityPrev: VisibilitySummary | null;

  health: {
    score: number | null;
    pages: number;
    crawledAt: string | null;
    errors: number;
    warnings: number;
    notices: number;
    topIssues: Array<{ type: string; severity: string; count: number }>;
  } | null;

  /** Every dataset that had nothing, so the report can say so rather than imply zero. */
  missing: string[];
}

/**
 * Crawl issues in the client's language. A report that says `meta_description_
 * too_long` makes the reader do the translation, and a client who can't read
 * their own report can't approve the work it justifies.
 */
const ISSUE_LABEL: Record<string, string> = {
  mixed_content: "Insecure resources loaded on a secure page",
  missing_title: "Page has no title tag",
  missing_h1: "Page has no main heading",
  missing_meta_description: "Page has no meta description",
  meta_description_too_long: "Meta description will be cut off in search results",
  title_too_long: "Title will be cut off in search results",
  title_too_short: "Title is too short to describe the page",
  thin_content: "Page has very little content",
  no_structured_data: "Page has no structured data markup",
  noindex: "Page is blocked from search results",
};

export function issueLabel(type: string): string {
  return ISSUE_LABEL[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const NICE_KIND: Record<string, string> = {
  tel_click: "Phone clicks",
  mailto_click: "Email clicks",
  form_submit: "Form submissions",
  outbound_click: "Outbound clicks",
};

export function conversionLabel(kind: string): string {
  return NICE_KIND[kind] ?? kind;
}

function tally(rows: Array<Record<string, unknown>>, key: string, limit: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined || v === "") continue;
    const k = String(v);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, views]) => ({ label, views }));
}

/**
 * Zero-filled so a quiet Sunday shows as a dip rather than vanishing — a line
 * drawn only through days that had traffic overstates a flat month.
 */
function dailySeries(rows: Array<Record<string, unknown>>, from: string, to: string) {
  const byDay = new Map<string, { visitors: Set<string>; pageviews: number }>();
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    byDay.set(new Date(t).toISOString().slice(0, 10), { visitors: new Set(), pageviews: 0 });
  }
  for (const r of rows) {
    const day = String(r.ts).slice(0, 10);
    const b = byDay.get(day);
    if (!b) continue;
    b.visitors.add(String(r.visitor_hash));
    b.pageviews += 1;
  }
  return [...byDay.entries()].map(([date, b]) => ({
    date,
    visitors: b.visitors.size,
    pageviews: b.pageviews,
  }));
}

function totals(rows: Array<Record<string, unknown>>): TrafficTotals {
  const sessions = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.session_hash);
    sessions.set(k, (sessions.get(k) ?? 0) + 1);
  }
  const eng = rows.map((r) => Number(r.engagement_ms ?? 0)).filter((n) => n > 0);
  const single = [...sessions.values()].filter((n) => n === 1).length;

  return {
    visitors: new Set(rows.map((r) => String(r.visitor_hash))).size,
    pageviews: rows.length,
    sessions: sessions.size,
    avgEngagementSec: eng.length ? Math.round(eng.reduce((a, b) => a + b, 0) / eng.length / 1000) : 0,
    bounceRate: sessions.size ? (single / sessions.size) * 100 : 0,
  };
}

/**
 * A referrer that *is* the site is internal navigation, not a traffic source.
 * Left in, it ranks first in "Where visitors came from" and tells the client
 * their best channel is their own website.
 */
function isSelfReferral(referrer: string, domain: string): boolean {
  const strip = (d: string) => d.toLowerCase().replace(/^www\./, "");
  const r = strip(referrer);
  const d = strip(domain);
  return r === d || r.endsWith(`.${d}`);
}

export async function gatherMonthly(
  siteId: string,
  range: ResolvedRange,
  brandTerms: string[],
  /** Needed to recognise the site's own domain in the referrer list. */
  siteDomain: string,
): Promise<MonthlyData> {
  const supabase = await createServiceClient();
  const missing: string[] = [];

  const PV_COLS =
    "ts, path, referrer_domain, utm_source, device_type, country, visitor_hash, session_hash, engagement_ms";

  const [pvRes, prevPvRes, convRes, prevConvRes, termRes, prevTermRes, kwRes, crawlRes] =
    await Promise.all([
      supabase.from("pulse_pageviews").select(PV_COLS).eq("site_id", siteId)
        .gte("ts", startOf(range.from)).lt("ts", endExclusive(range.to)).limit(50000),
      supabase.from("pulse_pageviews").select("visitor_hash, session_hash, engagement_ms").eq("site_id", siteId)
        .gte("ts", startOf(range.prevFrom)).lt("ts", endExclusive(range.prevTo)).limit(50000),
      supabase.from("pulse_conversions").select("kind").eq("site_id", siteId)
        .gte("ts", startOf(range.from)).lt("ts", endExclusive(range.to)).limit(20000),
      supabase.from("pulse_conversions").select("kind").eq("site_id", siteId)
        .gte("ts", startOf(range.prevFrom)).lt("ts", endExclusive(range.prevTo)).limit(20000),
      supabase.from("pulse_search_terms").select("term, clicks, impressions, ctr, position")
        .eq("site_id", siteId).eq("dimension", "query")
        .gte("period_start", range.from).lte("period_start", range.to).limit(5000),
      supabase.from("pulse_search_terms").select("clicks, impressions, ctr, position")
        .eq("site_id", siteId).eq("dimension", "query")
        .gte("period_start", range.prevFrom).lte("period_start", range.prevTo).limit(5000),
      supabase.from("pulse_keywords").select("id, phrase").eq("site_id", siteId).eq("is_active", true).limit(500),
      // "done" — the crawler's own vocabulary (running/done/failed/cancelled).
      supabase.from("pulse_crawls").select("id, finished_at, pages_crawled, health_score")
        .eq("site_id", siteId).eq("status", "done")
        .lt("finished_at", endExclusive(range.to))
        .order("finished_at", { ascending: false }).limit(1),
    ]);

  const pv = (pvRes.data as Array<Record<string, unknown>>) ?? [];
  const prevPv = (prevPvRes.data as Array<Record<string, unknown>>) ?? [];
  if (pv.length === 0) missing.push("Site analytics (no visits recorded in this window)");

  // Visitors per page needs a second pass — a Map of Sets, since a tally by
  // pageview would count one person reading a page five times as five people.
  const pageVisitors = new Map<string, Set<string>>();
  for (const r of pv) {
    const p = String(r.path);
    if (!pageVisitors.has(p)) pageVisitors.set(p, new Set());
    pageVisitors.get(p)!.add(String(r.visitor_hash));
  }

  const conv = (convRes.data as Array<{ kind: string }>) ?? [];
  const prevConv = (prevConvRes.data as Array<{ kind: string }>) ?? [];
  const conversions = ["tel_click", "mailto_click", "form_submit", "outbound_click"].map((kind) => ({
    kind,
    count: conv.filter((c) => c.kind === kind).length,
    prev: prevConv.filter((c) => c.kind === kind).length,
  }));

  // ---- Search Console
  const terms = (termRes.data as Array<{
    term: string; clicks: number; impressions: number; ctr: number | null; position: number | null;
  }>) ?? [];
  const prevTerms = (prevTermRes.data as Array<{
    clicks: number; impressions: number; ctr: number | null; position: number | null;
  }>) ?? [];

  const rollup = (rows: Array<{ clicks: number; impressions: number; position: number | null }>) => {
    if (rows.length === 0) return null;
    const clicks = rows.reduce((a, r) => a + r.clicks, 0);
    const impressions = rows.reduce((a, r) => a + r.impressions, 0);
    // Position is averaged weighted by impressions: an unweighted mean lets a
    // term with three impressions at #98 drag the whole average down.
    const impr = rows.reduce((a, r) => a + r.impressions, 0) || 1;
    const position = rows.reduce((a, r) => a + (r.position ?? 0) * r.impressions, 0) / impr;
    return {
      clicks,
      impressions,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      position,
    };
  };

  const search = rollup(terms);
  if (!search) missing.push("Search Console (no history imported for this window)");

  // ---- Rankings
  const keywords = (kwRes.data as Array<{ id: string; phrase: string }>) ?? [];
  let rankings: MonthlyData["rankings"] = [];
  let visibilityNow: VisibilitySummary | null = null;
  let visibilityPrev: VisibilitySummary | null = null;

  if (keywords.length > 0) {
    const ids = keywords.map((k) => k.id);
    const [endRes, startRes] = await Promise.all([
      supabase.from("pulse_rank_checks").select("keyword_id, position, checked_at")
        .in("keyword_id", ids).lt("checked_at", endExclusive(range.to))
        .order("checked_at", { ascending: false }).limit(5000),
      supabase.from("pulse_rank_checks").select("keyword_id, position, checked_at")
        .in("keyword_id", ids).lt("checked_at", endExclusive(range.prevTo))
        .order("checked_at", { ascending: false }).limit(5000),
    ]);

    // Rows arrive newest-first, so the first hit per keyword is its latest
    // check within the window.
    const latest = (rows: Array<{ keyword_id: string; position: number | null }>) => {
      const m = new Map<string, number | null>();
      for (const r of rows) if (!m.has(r.keyword_id)) m.set(r.keyword_id, r.position);
      return m;
    };
    const now = latest((endRes.data as never[]) ?? []);
    const before = latest((startRes.data as never[]) ?? []);

    rankings = keywords
      .map((k) => ({
        phrase: k.phrase,
        position: now.get(k.id) ?? null,
        prevPosition: before.get(k.id) ?? null,
      }))
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

    const positions = rankings.map((r) => r.position).filter((p): p is number => p !== null);
    if (positions.length > 0) {
      visibilityNow = visibility(
        rankings.map((r) => ({ position: r.position, previous: r.prevPosition })),
      );
      // The baseline summary has no baseline of its own, so improved/declined
      // are meaningless on it — only its index is read.
      visibilityPrev = visibility(
        rankings.map((r) => ({ position: r.prevPosition, previous: null })),
      );
    } else {
      missing.push("Keyword rankings (tracked, but no positions recorded yet)");
    }
  } else {
    missing.push("Keyword rankings (no keywords tracked for this site)");
  }

  // ---- Site health
  const crawl = ((crawlRes.data as Array<{
    id: string; finished_at: string; pages_crawled: number; health_score: number | null;
  }>) ?? [])[0];

  let health: MonthlyData["health"] = null;
  if (crawl) {
    const { data: issueRows } = await supabase
      .from("pulse_crawl_issues").select("type, severity").eq("crawl_id", crawl.id).limit(20000);
    const issues = (issueRows as Array<{ type: string; severity: string }>) ?? [];
    const bySeverity = (s: string) => issues.filter((i) => i.severity === s).length;

    const grouped = new Map<string, { type: string; severity: string; count: number }>();
    for (const i of issues) {
      const key = `${i.severity}|${i.type}`;
      const g = grouped.get(key) ?? { type: i.type, severity: i.severity, count: 0 };
      g.count += 1;
      grouped.set(key, g);
    }
    const order = { error: 0, warning: 1, notice: 2 } as Record<string, number>;

    // Crawls that predate the health_score column have none stored. Recomputing
    // from the issues we already loaded costs nothing and is the same formula
    // the collector uses, so an old crawl reports the same number a new one
    // would rather than a permanent "—".
    const score =
      crawl.health_score ??
      (crawl.pages_crawled > 0
        ? siteHealthScore(crawl.pages_crawled, {
            errors: bySeverity("error"),
            warnings: bySeverity("warning"),
            notices: bySeverity("notice"),
          })
        : null);

    health = {
      score,
      pages: crawl.pages_crawled,
      crawledAt: crawl.finished_at,
      errors: bySeverity("error"),
      warnings: bySeverity("warning"),
      notices: bySeverity("notice"),
      topIssues: [...grouped.values()].sort(
        (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || b.count - a.count,
      ),
    };
  } else {
    missing.push("Site audit (no completed crawl on or before this period)");
  }

  return {
    traffic: totals(pv),
    prevTraffic: totals(prevPv),
    series: dailySeries(pv, range.from, range.to),
    topPages: tally(pv, "path", 15).map((p) => ({
      path: p.label,
      views: p.views,
      visitors: pageVisitors.get(p.label)?.size ?? 0,
    })),
    sources: tally(
      pv.filter((r) => r.referrer_domain && !isSelfReferral(String(r.referrer_domain), siteDomain)),
      "referrer_domain",
      10,
    ),
    devices: tally(pv, "device_type", 5),
    countries: tally(pv, "country", 8),
    conversions,
    search,
    prevSearch: rollup(prevTerms),
    topQueries: terms
      .map((t) => ({
        term: t.term,
        clicks: t.clicks,
        impressions: t.impressions,
        ctr: (t.ctr ?? 0) * 100,
        position: t.position ?? 0,
      }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
    brandSplit: terms.length ? splitBranded(terms, brandTerms) : null,
    rankings,
    visibilityNow,
    visibilityPrev,
    health,
    missing,
  };
}
