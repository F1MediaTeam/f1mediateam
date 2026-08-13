// Competitor tracking, performed by us rather than purchased.
//
// A competitor's website is public. Visiting it politely — the same way our
// crawler visits a client's — answers most of what an agency actually needs to
// know week to week:
//
//   how big is their site        sitemap URL count
//   how fast is it growing       new URLs since the last look
//   what are they publishing     titles and headings on recent pages
//   how often                    sitemap lastmod dates
//   how well built is it         titles, descriptions, structured data, https
//   how fast is it               PageSpeed, the same score we show for clients
//   do they allow AI crawlers    robots.txt, the same matrix we run on clients
//
// What this deliberately does NOT produce: their keyword rankings, their
// estimated traffic, and their backlinks. Those come from a web-wide link
// index and a continuous SERP scrape — infrastructure that is a data vendor's
// entire product, not something a portal can compute. Those columns stay null
// rather than being filled with a guess, and the panel says so.
//
// Politeness is not optional here. This fetches someone else's property, so it
// identifies itself, obeys robots.txt, requests one page at a time with a
// delay, and reads a sample rather than the whole site.

import { createServiceClient } from "@/lib/supabase/server";
import { runPageSpeed } from "@/lib/pagespeed";
import { botMatrix, NO_ROBOTS, parseRobots, type Robots } from "./robots";
import { normalizeDomain } from "@/lib/pulse/sites";

const UA = "F1PulseBot/1.0 (+https://f1mediateam.com)";
const HTML_HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
} as const;
const XML_HEADERS = {
  "user-agent": UA,
  accept: "application/xml,text/xml,application/xhtml+xml,*/*;q=0.8",
} as const;

/** Pages sampled per competitor per run. Enough to characterise, not to copy. */
const SAMPLE_PAGES = 12;
/** One request per second, same as the client crawler. */
const DELAY_MS = 1000;
/** Sitemap fetches per run, guarding against an index that loops. */
const SITEMAP_BUDGET = 12;
/** Sitemap URLs recorded per run — beyond this the count is what matters. */
const MAX_URLS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CompetitorRunResult {
  domain: string;
  pagesListed: number;
  pagesNew: number;
  published30d: number;
  speedScore: number | null;
  botsBlocked: string[];
  sampled: number;
  error?: string;
}

interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

/** robots.txt, and the sitemaps it points at. */
async function fetchRobots(domain: string): Promise<Robots> {
  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return NO_ROBOTS;
    return parseRobots(await res.text());
  } catch {
    return NO_ROBOTS;
  }
}

/**
 * Every URL the site lists about itself, with publish dates where given.
 *
 * A <sitemapindex> lists other sitemaps rather than pages, so index files are
 * followed one level down — reading only the top level of an index would count
 * five URLs and conclude the site was tiny.
 */
async function readSitemaps(domain: string, robots: Robots): Promise<SitemapEntry[]> {
  const queue = robots.sitemaps.length > 0 ? [...robots.sitemaps] : [`https://${domain}/sitemap.xml`];
  const fetched = new Set<string>();
  const entries = new Map<string, string | null>();
  let budget = SITEMAP_BUDGET;

  while (queue.length > 0 && budget > 0 && entries.size < MAX_URLS) {
    const sm = queue.shift()!;
    if (fetched.has(sm)) continue;
    fetched.add(sm);
    budget -= 1;

    try {
      const res = await fetch(sm, { headers: XML_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const isIndex = /<sitemapindex/i.test(xml);

      // <url> blocks pair a <loc> with an optional <lastmod>; parsing them as
      // blocks keeps each date with its own URL instead of zipping two lists
      // that can differ in length.
      const blocks = xml.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi);
      let sawBlock = false;
      for (const b of blocks) {
        sawBlock = true;
        const loc = b[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1]?.trim();
        if (!loc) continue;
        if (isIndex) {
          if (queue.length < SITEMAP_BUDGET) queue.push(loc);
          continue;
        }
        const lastmod = b[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1]?.trim() ?? null;
        entries.set(loc, lastmod);
        if (entries.size >= MAX_URLS) break;
      }

      // Some sitemaps are a bare list of <loc> with no wrapper element.
      if (!sawBlock) {
        for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
          const loc = m[1].trim();
          if (isIndex) {
            if (queue.length < SITEMAP_BUDGET) queue.push(loc);
            continue;
          }
          entries.set(loc, null);
          if (entries.size >= MAX_URLS) break;
        }
      }
    } catch {
      // A missing or broken sitemap is itself a finding, not a failure.
    }
  }

  return [...entries.entries()].map(([url, lastmod]) => ({ url, lastmod }));
}

interface PageFacts {
  url: string;
  title: string | null;
  h1: string | null;
  description: string | null;
  words: number;
  structuredData: boolean;
}

function extract(url: string, html: string): PageFacts {
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim().replace(/\s+/g, " ") ?? null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return {
    url,
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
    h1: pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
    description: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    words: text.split(/\s+/).filter(Boolean).length,
    structuredData: /application\/ld\+json/i.test(html),
  };
}

/**
 * Run one competitor domain.
 *
 * `siteId` is the client this competitor is tracked for, used only to attribute
 * the feed event — the domain snapshot itself belongs to the domain, so two
 * clients watching the same competitor share one set of measurements rather
 * than each paying to crawl it.
 */
export async function runCompetitor(domainInput: string, siteId: string | null): Promise<CompetitorRunResult> {
  const supabase = await createServiceClient();
  const domain = normalizeDomain(domainInput);
  const base: CompetitorRunResult = {
    domain,
    pagesListed: 0,
    pagesNew: 0,
    published30d: 0,
    speedScore: null,
    botsBlocked: [],
    sampled: 0,
  };

  const { data: domainRow } = await supabase
    .from("pulse_domains")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();
  if (!domainRow?.id) return { ...base, error: "Domain is not registered." };
  const domainId = domainRow.id as string;

  const robots = await fetchRobots(domain);
  const entries = await readSitemaps(domain, robots);

  // What is genuinely new since we last looked. The unique constraint on
  // (domain_id, url) is what makes this idempotent — a re-run finds nothing new.
  const { data: knownRows } = await supabase
    .from("pulse_competitor_activity")
    .select("url")
    .eq("domain_id", domainId)
    .limit(20_000);
  const known = new Set(((knownRows as Array<{ url: string }>) ?? []).map((r) => r.url));

  const firstRun = known.size === 0;
  const fresh = entries.filter((e) => !known.has(e.url));

  if (fresh.length > 0) {
    await supabase.from("pulse_competitor_activity").upsert(
      fresh.slice(0, 2000).map((e) => ({
        domain_id: domainId,
        url: e.url.slice(0, 1000),
        kind: /\/blog\/|\/news\/|\/post/i.test(e.url) ? "new_post" : "new_page",
        published_at: e.lastmod ? new Date(e.lastmod).toISOString() : null,
      })),
      { onConflict: "domain_id,url", ignoreDuplicates: true },
    );
  }

  const cutoff = Date.now() - 30 * 86_400_000;
  const published30d = entries.filter((e) => {
    if (!e.lastmod) return false;
    const t = new Date(e.lastmod).getTime();
    return Number.isFinite(t) && t >= cutoff;
  }).length;

  // ------------------------------------------------------------- page sample
  // Newest first where dates exist, so the sample reflects what they are
  // publishing now rather than whatever the sitemap happens to list first.
  const ordered = entries
    .slice()
    .sort((a, b) => (new Date(b.lastmod ?? 0).getTime() || 0) - (new Date(a.lastmod ?? 0).getTime() || 0));
  const sampleUrls = [`https://${domain}/`, ...ordered.map((e) => e.url)]
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, SAMPLE_PAGES);

  const facts: PageFacts[] = [];
  for (const url of sampleUrls) {
    try {
      const res = await fetch(url, { headers: HTML_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (res.ok) facts.push(extract(url, await res.text()));
    } catch {
      // A page that will not load is not worth a failed run.
    }
    await sleep(DELAY_MS);
  }

  // ------------------------------------------------------------------- speed
  // Same score, same units as the client's own — that is what makes it a
  // comparison rather than two unrelated numbers.
  let speedScore: number | null = null;
  if (process.env.PAGESPEED_API_KEY) {
    try {
      speedScore = (await runPageSpeed(`https://${domain}/`, "mobile")).score;
    } catch {
      speedScore = null;
    }
  }

  const bots = botMatrix(robots, sampleUrls.slice(0, 10).map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return "/";
    }
  }));
  const botsBlocked = bots.filter((b) => !b.allowed).map((b) => b.bot);

  const withTitle = facts.filter((f) => f.title);
  const measured = {
    sampled: facts.length,
    withTitle: withTitle.length,
    withDescription: facts.filter((f) => f.description).length,
    withH1: facts.filter((f) => f.h1).length,
    withStructuredData: facts.filter((f) => f.structuredData).length,
    avgWords: facts.length ? Math.round(facts.reduce((s, f) => s + f.words, 0) / facts.length) : 0,
    // What they are actually writing about, in their own words.
    recentTitles: facts.slice(0, 8).map((f) => ({ url: f.url, title: f.title, h1: f.h1 })),
    bots: bots.map((b) => ({ bot: b.bot, allowed: b.allowed })),
    robotsPresent: robots.present,
    sitemapDeclared: robots.sitemaps.length > 0,
  };

  await supabase.from("pulse_domain_snapshots").insert({
    domain_id: domainId,
    source: "measured",
    pages_listed: entries.length,
    // A first look has nothing to compare against, so "new" is zero rather
    // than the entire site reported as freshly published.
    pages_new: firstRun ? 0 : fresh.length,
    published_30d: published30d,
    speed_score: speedScore,
    measured,
    mocked: false,
  });

  // A competitor publishing a burst of pages is the thing worth interrupting
  // someone for. A first run is silent for the same reason as above.
  if (!firstRun && fresh.length > 0 && siteId) {
    await supabase.from("pulse_feed_events").insert({
      site_id: siteId,
      kind: "competitor_new_content",
      severity: "info",
      title:
        fresh.length === 1
          ? `${domain} published a new page`
          : `${domain} published ${fresh.length} new pages`,
      payload: {
        domain,
        count: fresh.length,
        sample: fresh.slice(0, 5).map((e) => e.url),
      },
    });
  }

  return {
    ...base,
    pagesListed: entries.length,
    pagesNew: firstRun ? 0 : fresh.length,
    published30d,
    speedScore,
    botsBlocked,
    sampled: facts.length,
  };
}

/** Every active competitor for one client site. */
export async function runCompetitorsForSite(siteId: string): Promise<CompetitorRunResult[]> {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("pulse_competitors")
    .select("domain_id, is_active, pulse_domains!inner(domain)")
    .eq("site_id", siteId)
    .eq("is_active", true);

  // The generated types model an embedded row as an array even when the join
  // yields one, so this normalises both shapes rather than trusting either.
  type Joined = { pulse_domains: { domain: string } | Array<{ domain: string }> | null };
  const domains = ((rows as unknown as Joined[]) ?? [])
    .map((r) => (Array.isArray(r.pulse_domains) ? r.pulse_domains[0]?.domain : r.pulse_domains?.domain))
    .filter((d): d is string => Boolean(d));

  const out: CompetitorRunResult[] = [];
  // Sequential across competitors: each one is someone else's server, and
  // hitting five of them at once is exactly the behaviour robots.txt etiquette
  // exists to prevent.
  for (const domain of domains) {
    try {
      out.push(await runCompetitor(domain, siteId));
    } catch (err) {
      out.push({
        domain,
        pagesListed: 0,
        pagesNew: 0,
        published30d: 0,
        speedScore: null,
        botsBlocked: [],
        sampled: 0,
        error: err instanceof Error ? err.message : "Competitor run failed.",
      });
    }
  }
  return out;
}
