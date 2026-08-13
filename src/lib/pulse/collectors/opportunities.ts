// Opportunities — the work worth doing next, computed rather than bought.
//
// Every finding here comes from data the platform already has: Search Console
// (free), the crawler (our own bandwidth), and Core Web Vitals from the tag.
// No paid API is involved, which is why this runs for real while rankings sit
// in mock mode.
//
// Four producers:
//
//   strike_distance  queries ranking 4-20 with real impressions, mapped to the
//                    page that ranks. Google already considers the page
//                    relevant; the gap to page one is usually a title, an
//                    intro paragraph, or an internal link — not a rewrite.
//   cannibalization  one query pulling in two or more of the client's own
//                    pages, so they split signals and neither wins.
//   content/technical/schema   crawl issues, grouped by the kind of work they
//                    imply rather than by the checker that found them.
//   cwv              Core Web Vitals failing Google's own p75 thresholds,
//                    measured on real visitors rather than a lab test.
//
// Recompute is idempotent by fingerprint, which is what lets an opportunity
// marked "done" or "dismissed" survive the next run instead of reappearing
// every week like it was never dealt with.

import { createServiceClient } from "@/lib/supabase/server";
import { data } from "@/lib/data";
import { fetchClientGscQueryPagePairs, type GscQueryPageRow } from "@/lib/connectors/gsc";
import { VITAL_THRESHOLDS } from "@/lib/pulse/dashboard";
import type { PulseSite } from "@/lib/pulse/sites";

export type OpportunityCategory =
  | "content"
  | "technical"
  | "schema"
  | "links"
  | "cwv"
  | "strike_distance";

/** Positions worth chasing. Above 3 is already won; past 20 is a different job. */
const STRIKE_MIN_POSITION = 4;
const STRIKE_MAX_POSITION = 20;
/**
 * Impressions over the window before a query counts. Without a floor the list
 * fills with one-impression noise from the long tail, and a list nobody trusts
 * gets ignored entirely.
 */
const STRIKE_MIN_IMPRESSIONS = 30;
/** Days of Search Console history to read. Four weeks smooths weekly cycles. */
const WINDOW_DAYS = 28;
/** Pages competing on one query before it counts as cannibalization. */
const CANNIBAL_MIN_PAGES = 2;
/** A competing page needs this share of the query's impressions to count. */
const CANNIBAL_MIN_SHARE = 0.1;

/** Crawl issue type → the kind of work fixing it actually is. */
const ISSUE_CATEGORY: Record<string, OpportunityCategory> = {
  missing_title: "content",
  title_too_long: "content",
  title_too_short: "content",
  missing_meta_description: "content",
  meta_description_too_long: "content",
  missing_h1: "content",
  thin_content: "content",
  broken_page: "technical",
  unreachable: "technical",
  mixed_content: "technical",
  noindex: "technical",
  no_structured_data: "schema",
};

/** Plain English, for a client reading their own dashboard. */
const ISSUE_LABEL: Record<string, string> = {
  missing_title: "No page title",
  title_too_long: "Page title too long to show fully in Google",
  title_too_short: "Page title too short to say much",
  missing_meta_description: "No description for Google to show under the link",
  meta_description_too_long: "Description too long to show fully",
  missing_h1: "No main heading",
  thin_content: "Very little text on the page",
  broken_page: "Page returns an error",
  unreachable: "Page could not be reached",
  mixed_content: "Insecure content on a secure page",
  noindex: "Page tells Google not to list it",
  no_structured_data: "No structured data for rich results",
};

export interface OpportunityRunResult {
  siteId: string;
  domain: string;
  strikeDistance: number;
  cannibalization: number;
  byCategory: Record<string, number>;
  created: number;
  skipped?: string;
}

interface Draft {
  page: string;
  category: OpportunityCategory;
  fingerprint: string;
  detail: Record<string, unknown>;
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Path only — the full URL makes fingerprints brittle across http/https/www. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

export async function runOpportunities(site: PulseSite): Promise<OpportunityRunResult> {
  const supabase = await createServiceClient();
  const base = {
    siteId: site.id,
    domain: site.domain,
    strikeDistance: 0,
    cannibalization: 0,
    byCategory: {} as Record<string, number>,
    created: 0,
  };

  const drafts: Draft[] = [];

  // ---------------------------------------------------------- search-derived
  // Both search producers need query/page pairs, so one fetch serves both.
  // Without a Google connection they are simply skipped — the crawl and vitals
  // producers below still run, so the panel is useful either way.
  const connectors = await data.listConnectors(site.client_id);
  const hasGsc = connectors.some((c) => c.provider === "gsc");

  if (hasGsc) {
    let pairs: GscQueryPageRow[];
    try {
      pairs = await fetchClientGscQueryPagePairs(site.client_id, isoDaysAgo(WINDOW_DAYS + 2), isoDaysAgo(2));
    } catch {
      pairs = [];
    }

    const byQuery = new Map<string, GscQueryPageRow[]>();
    for (const row of pairs) {
      if (!row.query || !row.page) continue;
      const list = byQuery.get(row.query) ?? [];
      list.push(row);
      byQuery.set(row.query, list);
    }

    for (const [query, rows] of byQuery) {
      const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
      if (impressions < STRIKE_MIN_IMPRESSIONS) continue;

      // The page that actually ranks best is the one to improve.
      const best = rows.reduce((a, b) => (a.position <= b.position ? a : b));

      if (best.position >= STRIKE_MIN_POSITION && best.position <= STRIKE_MAX_POSITION) {
        drafts.push({
          page: pathOf(best.page),
          category: "strike_distance",
          fingerprint: `strike:${query}`,
          detail: {
            query,
            position: Math.round(best.position * 10) / 10,
            impressions,
            clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
            headline: `"${query}" sits at position ${Math.round(best.position)} with ${impressions.toLocaleString()} impressions`,
            why: "Google already ranks this page for this search. Moving it into the top three is usually a title and copy job, not a new page.",
          },
        });
      }

      // Cannibalization: more than one of our own pages drawing real
      // impressions on the same query. A page with a trivial share is Google
      // sampling alternatives, not a page genuinely competing.
      const competing = rows.filter((r) => r.impressions >= impressions * CANNIBAL_MIN_SHARE);
      if (competing.length >= CANNIBAL_MIN_PAGES) {
        drafts.push({
          page: pathOf(best.page),
          category: "content",
          fingerprint: `cannibal:${query}`,
          detail: {
            query,
            kind: "cannibalization",
            pages: competing.map((r) => ({
              page: pathOf(r.page),
              impressions: r.impressions,
              position: Math.round(r.position * 10) / 10,
            })),
            headline: `${competing.length} of your pages compete for "${query}"`,
            why: "When several pages target one search, they split the signals between them and none ranks as well as one strong page would.",
          },
        });
      }
    }
  }

  // ------------------------------------------------------------ crawl-derived
  const { data: lastCrawl } = await supabase
    .from("pulse_crawls")
    .select("id")
    .eq("site_id", site.id)
    .eq("status", "done")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCrawl?.id) {
    const { data: issueRows } = await supabase
      .from("pulse_crawl_issues")
      .select("url, type, severity, detail")
      .eq("crawl_id", lastCrawl.id)
      .limit(5000);

    for (const issue of (issueRows as Array<{ url: string; type: string; severity: string; detail: unknown }>) ?? []) {
      const category = ISSUE_CATEGORY[issue.type];
      // An unmapped type is a checker we added without deciding what kind of
      // work it implies. Skipping is honest; guessing a category is not.
      if (!category) continue;
      const page = pathOf(issue.url);
      drafts.push({
        page,
        category,
        fingerprint: `crawl:${issue.type}:${page}`,
        detail: {
          issue: issue.type,
          severity: issue.severity,
          headline: ISSUE_LABEL[issue.type] ?? issue.type.replace(/_/g, " "),
          crawl_detail: issue.detail,
        },
      });
    }
  }

  // ------------------------------------------------------------ vitals-derived
  // Real visitors, not a lab test — these are the speeds people actually had.
  const { data: vitalRows } = await supabase
    .from("pulse_web_vitals")
    .select("metric, value")
    .eq("site_id", site.id)
    .gte("ts", new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString())
    .limit(20_000);

  const vitals = (vitalRows as Array<{ metric: string; value: number }>) ?? [];
  for (const [metric, [good, poor]] of Object.entries(VITAL_THRESHOLDS)) {
    const values = vitals.filter((v) => v.metric === metric).map((v) => v.value).sort((a, b) => a - b);
    // Below this there isn't enough traffic for a p75 to mean anything.
    if (values.length < 20) continue;
    const p75 = values[Math.floor(values.length * 0.75)] ?? values[values.length - 1];
    if (p75 <= good) continue;

    drafts.push({
      page: "/",
      category: "cwv",
      fingerprint: `cwv:${metric}`,
      detail: {
        metric,
        p75: Math.round(p75 * 1000) / 1000,
        threshold: good,
        verdict: p75 <= poor ? "needs-improvement" : "poor",
        sample: values.length,
        headline: `${metric} is ${p75 <= poor ? "slower than ideal" : "failing"} for real visitors`,
        why: "Measured on the people who actually visited, at the 75th percentile — so a quarter of visits were at least this slow.",
      },
    });
  }

  if (drafts.length === 0) {
    return { ...base, skipped: hasGsc ? undefined : "No Search Console connection; crawl and vitals produced nothing." };
  }

  // ------------------------------------------------------------------ persist
  // Which fingerprints already exist decides what is genuinely new — and only
  // genuinely new findings are worth a feed event.
  const { data: existingRows } = await supabase
    .from("pulse_opportunities")
    .select("fingerprint")
    .eq("site_id", site.id);
  const existing = new Set(((existingRows as Array<{ fingerprint: string }>) ?? []).map((r) => r.fingerprint));

  // Collapse duplicate fingerprints before writing.
  //
  // Postgres refuses an upsert whose batch touches the same row twice — "ON
  // CONFLICT DO UPDATE command cannot affect row a second time" — and it is
  // easy to produce one here without noticing: pathOf() drops query strings,
  // so /page?a=1 and /page?a=2 are one page as far as a fingerprint is
  // concerned, and a crawl that flagged both produced two identical keys.
  // Deduping here rather than making fingerprints URL-exact is deliberate: the
  // same fault on the same page is one piece of work, not two.
  const unique = new Map<string, Draft>();
  for (const d of drafts) if (!unique.has(d.fingerprint)) unique.set(d.fingerprint, d);
  const deduped = [...unique.values()];

  const computedAt = new Date().toISOString();
  const payload = deduped.map((d) => ({
    site_id: site.id,
    computed_at: computedAt,
    page: d.page.slice(0, 500),
    category: d.category,
    detail: d.detail,
    fingerprint: d.fingerprint.slice(0, 500),
  }));

  // Upsert on the fingerprint, deliberately not touching `status`: a finding
  // the user already marked done stays done, with refreshed numbers.
  const { error } = await supabase
    .from("pulse_opportunities")
    .upsert(payload, { onConflict: "site_id,fingerprint", ignoreDuplicates: false });
  if (error) throw new Error(`Could not store opportunities: ${error.message}`);

  const fresh = deduped.filter((d) => !existing.has(d.fingerprint));
  const byCategory: Record<string, number> = {};
  for (const d of deduped) byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;

  const strikeDistance = deduped.filter((d) => d.category === "strike_distance").length;
  const cannibalization = deduped.filter((d) => d.detail.kind === "cannibalization").length;

  // ------------------------------------------------------------- feed events
  // One aggregated event, not one per finding — a crawl that surfaces 200
  // missing descriptions would otherwise bury every other event in the feed.
  const freshStrike = fresh.filter((d) => d.category === "strike_distance");
  if (freshStrike.length > 0) {
    const best = freshStrike
      .slice()
      .sort((a, b) => Number(b.detail.impressions ?? 0) - Number(a.detail.impressions ?? 0))[0];
    await supabase.from("pulse_feed_events").insert({
      site_id: site.id,
      kind: "opportunity_new",
      severity: "good",
      title:
        freshStrike.length === 1
          ? `New opportunity: ${best.detail.query}`
          : `${freshStrike.length} new keyword opportunities`,
      payload: { category: "strike_distance", count: freshStrike.length, top: best.detail },
    });
  }

  const freshCannibal = fresh.filter((d) => d.detail.kind === "cannibalization");
  if (freshCannibal.length > 0) {
    await supabase.from("pulse_feed_events").insert({
      site_id: site.id,
      kind: "cannibalization_found",
      severity: "warning",
      title:
        freshCannibal.length === 1
          ? `Two pages compete for "${freshCannibal[0].detail.query}"`
          : `${freshCannibal.length} searches have your pages competing`,
      payload: { count: freshCannibal.length, queries: freshCannibal.slice(0, 10).map((d) => d.detail.query) },
    });
  }

  return {
    ...base,
    strikeDistance,
    cannibalization,
    byCategory,
    created: fresh.length,
  };
}
