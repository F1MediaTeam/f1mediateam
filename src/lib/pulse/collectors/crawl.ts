// The site crawler — weekly, or on demand.
//
// Resumable by construction. A 2,000-page crawl at one request per second runs
// about 33 minutes against a 300-second function ceiling, so a crawl cannot be
// one call. `startCrawl` opens a crawl and seeds the frontier; `tickCrawl`
// claims a slice, works it, and returns. A schedule calls tick until the queue
// drains. A crashed invocation loses one slice, not the crawl.

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { PulseSite } from "@/lib/pulse/sites";
import { botMatrix, isAllowed, NO_ROBOTS, parseRobots, type Robots } from "./robots";

const UA = "F1PulseBot/1.0 (+https://f1mediateam.com)";

// Sending a User-Agent and nothing else gets a 406 from mod_security setups —
// ultimateassetprotection.com refuses exactly that request and answers a plain
// browser fine. Without these headers a healthy client site reads as permanently
// down, which is worse than not monitoring it at all.
const FETCH_HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
} as const;

const XML_HEADERS = {
  "user-agent": UA,
  accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.8",
} as const;
/** Pages per invocation. 25 at ~1/sec leaves headroom under the 120s route cap. */
const SLICE = 25;
const DELAY_MS = 1000;
const MAX_DEPTH = 6;

export interface CrawlIssue {
  url: string;
  type: string;
  severity: "error" | "warning" | "notice";
  detail: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getRobots(domain: string): Promise<Robots> {
  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: XML_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return NO_ROBOTS;
    return parseRobots(await res.text());
  } catch {
    return NO_ROBOTS;
  }
}

/** Same-host, http(s), fragment-free, and not excluded. */
function normalizeUrl(href: string, base: string, domain: string, exclusions: string[]): string | null {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== domain.replace(/^www\./, "").toLowerCase()) return null;
    u.hash = "";
    const path = u.pathname + u.search;
    if (exclusions.some((ex) => ex && path.startsWith(ex))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const tag = (html: string, re: RegExp): string | null => {
  const m = re.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
};

export async function startCrawl(site: PulseSite): Promise<{ crawlId: string; seeded: number }> {
  const supabase = await createServiceClient();
  const robots = await getRobots(site.domain);

  const { data: crawl } = await supabase
    .from("pulse_crawls")
    .insert({ site_id: site.id })
    .select("id")
    .single();
  const crawlId = (crawl as { id: string }).id;

  // Seed from the sitemap when there is one, otherwise breadth-first from the
  // homepage. None of these three client sites declares a sitemap, so the
  // fallback is the normal path, not the exception.
  const seeds = new Set<string>([`https://${site.domain}/`]);
  // A <sitemapindex> lists other sitemaps rather than pages — CobraFlex's has
  // five entries, none of which is a page. Reading only the top level would
  // seed five URLs and silently miss the entire site, so index files are
  // followed one level down.
  const queue = site.sitemap_url ? [site.sitemap_url] : [...robots.sitemaps];
  const fetched = new Set<string>();
  let budget = 12; // index + children; a guard against a sitemap loop

  while (queue.length > 0 && budget > 0 && seeds.size < site.crawl_page_cap) {
    const sm = queue.shift()!;
    if (fetched.has(sm)) continue;
    fetched.add(sm);
    budget -= 1;
    try {
      const res = await fetch(sm, { headers: XML_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const isIndex = /<sitemapindex/i.test(xml);
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        const raw = m[1].trim();
        if (isIndex) {
          if (queue.length < 12) queue.push(raw);
          continue;
        }
        const u = normalizeUrl(raw, `https://${site.domain}/`, site.domain, site.crawl_exclusions);
        if (u) seeds.add(u);
        if (seeds.size >= site.crawl_page_cap) break;
      }
    } catch {
      // A broken sitemap just means we fall back to link discovery.
    }
  }

  const rows = [...seeds].map((url) => ({ crawl_id: crawlId, url, depth: 0 }));
  await supabase.from("pulse_crawl_queue").upsert(rows, { onConflict: "crawl_id,url" });

  // The bot matrix is a property of robots.txt, not of any page, so it is
  // computed once at the start rather than per crawled page.
  await recordBotMatrix(site, robots, [...seeds].slice(0, 25).map((u) => new URL(u).pathname));

  return { crawlId, seeded: rows.length };
}

async function recordBotMatrix(site: PulseSite, robots: Robots, samplePaths: string[]) {
  const supabase = await createServiceClient();
  const verdicts = botMatrix(robots, samplePaths);

  // Compare against the last check so a change is reported once, when it
  // happens, rather than every week forever.
  const { data: prevRows } = await supabase
    .from("pulse_bot_access")
    .select("bot, allowed, checked_at")
    .eq("site_id", site.id)
    .order("checked_at", { ascending: false })
    .limit(TRACKED_COUNT);
  const previous = new Map<string, boolean>();
  for (const r of (prevRows as Array<{ bot: string; allowed: boolean }>) ?? []) {
    if (!previous.has(r.bot)) previous.set(r.bot, r.allowed);
  }

  await supabase.from("pulse_bot_access").insert(
    verdicts.map((v) => ({
      site_id: site.id,
      bot: v.bot,
      allowed: v.allowed,
      blocked_sample_paths: v.blockedSamplePaths,
    })),
  );

  const changes = verdicts.filter((v) => previous.has(v.bot) && previous.get(v.bot) !== v.allowed);
  if (changes.length > 0) {
    await supabase.from("pulse_feed_events").insert({
      site_id: site.id,
      kind: "bot_block_change",
      severity: changes.some((c) => !c.allowed) ? "warning" : "good",
      title:
        changes.length === 1
          ? `${changes[0].bot} is now ${changes[0].allowed ? "allowed" : "blocked"} on ${site.domain}`
          : `${changes.length} crawler permissions changed on ${site.domain}`,
      payload: { changes: changes.map((c) => ({ bot: c.bot, allowed: c.allowed })) },
    });
  }
}

const TRACKED_COUNT = 10;

export interface TickResult {
  crawlId: string;
  processed: number;
  remaining: number;
  done: boolean;
}

export async function tickCrawl(site: PulseSite, crawlId: string): Promise<TickResult> {
  const supabase = await createServiceClient();
  const robots = await getRobots(site.domain);

  const { data: crawlRow } = await supabase
    .from("pulse_crawls")
    .select("pages_crawled, status")
    .eq("id", crawlId)
    .single();
  const alreadyCrawled = (crawlRow as { pages_crawled: number })?.pages_crawled ?? 0;

  const budget = Math.max(0, Math.min(SLICE, site.crawl_page_cap - alreadyCrawled));
  const { data: batch } = await supabase
    .from("pulse_crawl_queue")
    .select("id, url, depth")
    .eq("crawl_id", crawlId)
    .eq("state", "queued")
    .order("depth", { ascending: true })
    .limit(budget);

  const items = (batch as Array<{ id: number; url: string; depth: number }>) ?? [];
  if (items.length === 0 || budget === 0) {
    await finishCrawl(site, crawlId);
    return { crawlId, processed: 0, remaining: 0, done: true };
  }

  await supabase
    .from("pulse_crawl_queue")
    .update({ state: "active", claimed_at: new Date().toISOString() })
    .in("id", items.map((i) => i.id));

  const pages: Array<Record<string, unknown>> = [];
  const issues: CrawlIssue[] = [];
  const discovered = new Map<string, number>();

  for (const item of items) {
    const path = new URL(item.url).pathname;
    if (!isAllowed(robots, "F1PulseBot", path)) {
      await supabase.from("pulse_crawl_queue").update({ state: "done" }).eq("id", item.id);
      continue;
    }

    let status: number | null = null;
    let html = "";
    try {
      const res = await fetch(item.url, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("html")) html = await res.text();
    } catch {
      status = null;
    }

    if (status === null || status >= 400) {
      issues.push({
        url: item.url,
        type: status === null ? "unreachable" : "broken_page",
        severity: "error",
        detail: { status_code: status },
      });
      await supabase.from("pulse_crawl_queue").update({ state: "error" }).eq("id", item.id);
      await sleep(DELAY_MS);
      continue;
    }

    const title = tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? null;
    const h1 = tag(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
    const robotsMeta = /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
    const words = text.split(/\s+/).filter((w) => w.length > 1).length;

    let linksOut = 0;
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
      const next = normalizeUrl(m[1], item.url, site.domain, site.crawl_exclusions);
      if (!next) continue;
      linksOut += 1;
      if (item.depth + 1 <= MAX_DEPTH && !discovered.has(next)) discovered.set(next, item.depth + 1);
    }

    pages.push({
      crawl_id: crawlId,
      url: item.url,
      status_code: status,
      title,
      meta_description: description,
      h1,
      canonical,
      robots_meta: robotsMeta,
      word_count: words,
      depth: item.depth,
      internal_links_out: linksOut,
      // Content hash makes duplicate-page detection a group-by rather than an
      // O(n²) comparison of every page against every other.
      content_hash: createHash("sha1").update(text.slice(0, 20_000)).digest("hex").slice(0, 16),
    });

    if (!title) issues.push({ url: item.url, type: "missing_title", severity: "error", detail: {} });
    else if (title.length > 60) issues.push({ url: item.url, type: "title_too_long", severity: "notice", detail: { length: title.length } });
    else if (title.length < 15) issues.push({ url: item.url, type: "title_too_short", severity: "notice", detail: { length: title.length } });

    if (!description) issues.push({ url: item.url, type: "missing_meta_description", severity: "warning", detail: {} });
    else if (description.length > 160) issues.push({ url: item.url, type: "meta_description_too_long", severity: "notice", detail: { length: description.length } });

    if (!h1) issues.push({ url: item.url, type: "missing_h1", severity: "warning", detail: {} });
    if (robotsMeta && /noindex/i.test(robotsMeta)) {
      issues.push({ url: item.url, type: "noindex", severity: "warning", detail: { robots: robotsMeta } });
    }
    if (!/application\/ld\+json/i.test(html)) {
      issues.push({ url: item.url, type: "no_structured_data", severity: "notice", detail: {} });
    }
    // http:// assets on an https page are blocked by the browser outright.
    if (/(?:src|href)=["']http:\/\//i.test(html)) {
      issues.push({ url: item.url, type: "mixed_content", severity: "error", detail: {} });
    }
    if (words < 150) {
      issues.push({ url: item.url, type: "thin_content", severity: "notice", detail: { word_count: words } });
    }

    await supabase.from("pulse_crawl_queue").update({ state: "done" }).eq("id", item.id);
    await sleep(DELAY_MS);
  }

  if (pages.length > 0) await supabase.from("pulse_crawl_pages").insert(pages);
  if (issues.length > 0) await supabase.from("pulse_crawl_issues").insert(issues.map((i) => ({ crawl_id: crawlId, ...i })));

  if (discovered.size > 0 && alreadyCrawled + pages.length < site.crawl_page_cap) {
    await supabase.from("pulse_crawl_queue").upsert(
      [...discovered].map(([url, depth]) => ({ crawl_id: crawlId, url, depth })),
      { onConflict: "crawl_id,url", ignoreDuplicates: true },
    );
  }

  await supabase
    .from("pulse_crawls")
    .update({ pages_crawled: alreadyCrawled + pages.length })
    .eq("id", crawlId);

  const { count } = await supabase
    .from("pulse_crawl_queue")
    .select("id", { count: "exact", head: true })
    .eq("crawl_id", crawlId)
    .eq("state", "queued");

  const remaining = count ?? 0;
  if (remaining === 0) await finishCrawl(site, crawlId);

  return { crawlId, processed: pages.length, remaining, done: remaining === 0 };
}

/**
 * F1 Site Health, 0-100.
 *
 * 100 minus weighted issue density, where an error costs three times a warning
 * and twelve times a notice — a broken page matters, a short meta description
 * does not. Normalised per page so a 2,000-page site isn't punished for scale,
 * and clamped so a catastrophic crawl floors at 0 rather than going negative.
 *
 * Deliberately our own number, documented here, and never presented as anyone
 * else's score.
 */
export function siteHealthScore(
  pages: number,
  counts: { errors: number; warnings: number; notices: number },
): number {
  if (pages <= 0) return 100;
  const weighted = counts.errors * 3 + counts.warnings * 1 + counts.notices * 0.25;
  // One weighted issue per page ≈ 40 points off; the curve is steep at first so
  // the difference between a clean site and a slightly broken one is visible.
  const density = weighted / pages;
  return Math.max(0, Math.min(100, Math.round(100 - density * 40)));
}

async function finishCrawl(site: PulseSite, crawlId: string) {
  const supabase = await createServiceClient();
  const { data: crawl } = await supabase
    .from("pulse_crawls")
    .select("pages_crawled, status")
    .eq("id", crawlId)
    .single();
  if ((crawl as { status: string })?.status !== "running") return;

  await supabase
    .from("pulse_crawls")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", crawlId);
  await supabase.from("pulse_sites").update({ last_crawled_at: new Date().toISOString() }).eq("id", site.id);

  const { data: issueRows } = await supabase
    .from("pulse_crawl_issues")
    .select("severity")
    .eq("crawl_id", crawlId);
  const all = (issueRows as Array<{ severity: string }>) ?? [];
  const errors = all.filter((i) => i.severity === "error").length;
  const warnings = all.filter((i) => i.severity === "warning").length;
  const notices = all.length - errors - warnings;
  const pages = (crawl as { pages_crawled: number })?.pages_crawled ?? 0;
  const health = siteHealthScore(pages, { errors, warnings, notices });
  await supabase.from("pulse_crawls").update({ health_score: health }).eq("id", crawlId);

  // One event per crawl, not per issue — 400 notices would otherwise bury
  // everything else in the feed.
  await supabase.from("pulse_feed_events").insert({
    site_id: site.id,
    kind: "crawl_issues",
    severity: errors > 0 ? "warning" : "info",
    title:
      all.length === 0
        ? `${site.domain} crawled clean — health 100`
        : `${site.domain} health ${health}/100 — ${errors} errors, ${warnings} warnings`,
    payload: { pages, errors, warnings, notices, health_score: health },
  });
}
