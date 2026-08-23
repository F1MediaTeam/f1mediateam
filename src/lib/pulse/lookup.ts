// Domain Lookup — everything measurable about any domain, for nothing.
//
// Point it at a site nobody has connected, nobody has verified, and nobody has
// given us access to, and it reports what can be established by fetching the
// site the way any visitor or crawler would. That is the honest ceiling on a
// domain you do not control, and it is a lot further than it sounds.
//
// What it deliberately does NOT do is estimate traffic or keyword rankings.
// Those cannot be measured from outside — they can only be modelled from a
// scraped search index — and a modelled number presented next to measured ones
// is how a report starts lying. Every figure below was observed.
//
// Nothing is written to the database. This is a lookup, not a subscription:
// somebody types a domain, gets an answer, and no row is created for a company
// that has not agreed to anything.

import { fetchRobots, readSitemaps, type SitemapEntry } from "./collectors/competitors";
import { botMatrix, type BotVerdict } from "./collectors/robots";
import { runPageSpeed } from "@/lib/pagespeed";

const UA = "F1PulseBot/1.0 (+https://f1mediateam.com/bot)";

/** Pages sampled for on-page checks. Enough to characterise, few enough to be polite. */
const SAMPLE = 5;

/** Above this share of pages sharing one lastmod date, the dates are worthless. */
const SITEWIDE_REGEN_RATIO = 0.8;

export interface PageFinding {
  url: string;
  status: number | null;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaLength: number;
  h1: string | null;
  h1Count: number;
  schemaTypes: string[];
  wordCount: number;
}

export interface LookupResult {
  domain: string;
  checkedAt: string;

  reachable: boolean;
  httpsOk: boolean;
  redirectsTo: string | null;
  serverError: string | null;

  robotsPresent: boolean;
  sitemapsDeclared: number;
  pagesListed: number;
  /** null when lastmod is stamped site-wide and therefore means nothing. */
  publishedLast30d: number | null;
  publishedLast90d: number | null;
  newestPage: string | null;

  platform: string | null;
  botsBlocked: string[];
  botMatrix: BotVerdict[];

  speedScore: number | null;
  speedNote: string | null;

  pages: PageFinding[];
  issues: string[];
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "");
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .trim();

const pick = (html: string, re: RegExp): string | null => {
  const m = html.match(re);
  return m ? decodeEntities(m[1]).slice(0, 300) : null;
};

/** Is this URL likely to be a page a person reads, rather than a feed or asset? */
function looksLikePage(url: string): boolean {
  return !/\.(xml|json|txt|pdf|jpe?g|png|gif|webp|svg|css|js|ico|zip|mp4|webm)(\?|$)/i.test(url);
}

async function fetchPage(url: string): Promise<{ status: number | null; html: string }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return { status: res.status, html: "" };
    return { status: res.status, html: (await res.text()).slice(0, 400_000) };
  } catch {
    return { status: null, html: "" };
  }
}

function analysePage(url: string, status: number | null, html: string): PageFinding {
  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "")),
  );

  const schemaTypes = [
    ...new Set(
      [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]).filter(Boolean),
    ),
  ].slice(0, 12);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const wordCount = (text.match(/\b[a-z']{2,}\b/gi) ?? []).length;

  return {
    url,
    status,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaLength: metaDescription?.length ?? 0,
    h1: h1s[0] ?? null,
    h1Count: h1s.length,
    schemaTypes,
    wordCount,
  };
}

/** Platform, when the page says so plainly. Never guessed. */
function detectPlatform(html: string): string | null {
  const gen = pick(html, /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i);
  if (gen) return gen;
  if (/cdn\.shopify\.com/i.test(html)) return "Shopify";
  if (/wp-content|wp-includes/i.test(html)) return "WordPress";
  if (/static\.wixstatic\.com/i.test(html)) return "Wix";
  if (/squarespace/i.test(html)) return "Squarespace";
  if (/secure-decoration\.com|deconetwork/i.test(html)) return "DecoNetwork";
  if (/_next\/static/i.test(html)) return "Next.js";
  return null;
}

function countSince(entries: SitemapEntry[], days: number): number {
  const cutoff = Date.now() - days * 86_400_000;
  return entries.filter((e) => e.lastmod && new Date(e.lastmod).getTime() >= cutoff).length;
}

/**
 * Everything measurable about a domain, without permission and without cost.
 */
export async function lookupDomain(input: string): Promise<LookupResult> {
  const domain = normalizeDomain(input);
  const checkedAt = new Date().toISOString();

  const result: LookupResult = {
    domain,
    checkedAt,
    reachable: false,
    httpsOk: false,
    redirectsTo: null,
    serverError: null,
    robotsPresent: false,
    sitemapsDeclared: 0,
    pagesListed: 0,
    publishedLast30d: null,
    publishedLast90d: null,
    newestPage: null,
    platform: null,
    botsBlocked: [],
    botMatrix: [],
    speedScore: null,
    speedNote: null,
    pages: [],
    issues: [],
  };

  if (!domain || !domain.includes(".")) {
    result.serverError = "That does not look like a domain.";
    return result;
  }

  // --- Is it there at all, and does HTTPS work?
  let home: { status: number | null; html: string };
  try {
    const res = await fetch(`https://${domain}/`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    result.reachable = true;
    result.httpsOk = res.ok || res.status < 400;
    const landed = new URL(res.url).hostname.replace(/^www\./, "");
    if (landed !== domain) result.redirectsTo = landed;
    const type = res.headers.get("content-type") ?? "";
    home = { status: res.status, html: type.includes("html") ? (await res.text()).slice(0, 400_000) : "" };
  } catch (err) {
    result.serverError = err instanceof Error ? err.message : "Could not reach the site over HTTPS.";
    return result;
  }

  result.platform = detectPlatform(home.html);

  // --- robots.txt and sitemaps
  const robots = await fetchRobots(domain);
  result.robotsPresent = robots.present;
  result.sitemapsDeclared = robots.sitemaps.length;

  const entries = await readSitemaps(domain, robots);
  const pageEntries = entries.filter((e) => looksLikePage(e.url));
  result.pagesListed = pageEntries.length;

  // --- Publishing pace, unless the platform rewrites every date at once.
  const dated = pageEntries.filter((e) => e.lastmod);
  if (dated.length > 0) {
    const byDay = new Map<string, number>();
    for (const e of dated) {
      const d = e.lastmod!.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const biggest = Math.max(...byDay.values());
    // One date covering nearly the whole sitemap is a platform stamping
    // everything on deploy, not a burst of writing. Reporting it as output
    // would be flatly wrong, so it reports nothing instead.
    if (biggest / dated.length < SITEWIDE_REGEN_RATIO) {
      result.publishedLast30d = countSince(pageEntries, 30);
      result.publishedLast90d = countSince(pageEntries, 90);
      const newest = dated
        .map((e) => e.lastmod!)
        .sort()
        .pop();
      result.newestPage = newest ? newest.slice(0, 10) : null;
    }
  }

  // --- Who is allowed to crawl, including the AI crawlers.
  const samplePaths = pageEntries.slice(0, 20).map((e) => {
    try {
      return new URL(e.url).pathname;
    } catch {
      return "/";
    }
  });
  result.botMatrix = botMatrix(robots, samplePaths.length ? samplePaths : ["/"]);
  result.botsBlocked = result.botMatrix.filter((b) => !b.allowed).map((b) => b.bot);

  // --- On-page quality on a small sample, homepage always included.
  const targets = [
    `https://${domain}/`,
    ...pageEntries
      .map((e) => e.url)
      .filter((u) => !/^https?:\/\/(www\.)?[^/]+\/?$/.test(u))
      .slice(0, SAMPLE - 1),
  ];

  result.pages.push(analysePage(targets[0], home.status, home.html));
  for (const url of targets.slice(1)) {
    const { status, html } = await fetchPage(url);
    if (html) result.pages.push(analysePage(url, status, html));
  }

  // --- Speed, from Google's own measurement of the homepage.
  try {
    const psi = await runPageSpeed(`https://${domain}/`, "mobile");
    result.speedScore = psi.score;
  } catch (err) {
    result.speedNote = err instanceof Error ? err.message : "PageSpeed did not answer.";
  }

  // --- Findings, in plain language, only where they were observed.
  const issues: string[] = [];
  if (!result.httpsOk) issues.push("The site did not answer cleanly over HTTPS.");
  if (result.redirectsTo) issues.push(`Redirects to ${result.redirectsTo}.`);
  if (!result.robotsPresent) issues.push("No robots.txt, so crawler rules are undeclared.");
  if (result.sitemapsDeclared === 0) issues.push("No sitemap declared in robots.txt.");
  if (result.pagesListed === 0) issues.push("No pages found in a sitemap.");
  if (result.botsBlocked.length > 0) issues.push(`Blocks ${result.botsBlocked.join(", ")}.`);

  const missingTitle = result.pages.filter((p) => !p.title).length;
  const longTitle = result.pages.filter((p) => p.titleLength > 60).length;
  const missingMeta = result.pages.filter((p) => !p.metaDescription).length;
  const noH1 = result.pages.filter((p) => p.h1Count === 0).length;
  const manyH1 = result.pages.filter((p) => p.h1Count > 1).length;
  const thin = result.pages.filter((p) => p.wordCount < 250).length;
  const noSchema = result.pages.filter((p) => p.schemaTypes.length === 0).length;

  const n = result.pages.length || 1;
  if (missingTitle) issues.push(`${missingTitle} of ${n} sampled pages have no title tag.`);
  if (longTitle) issues.push(`${longTitle} of ${n} have a title over 60 characters, so Google truncates it.`);
  if (missingMeta) issues.push(`${missingMeta} of ${n} have no meta description.`);
  if (noH1) issues.push(`${noH1} of ${n} have no H1 heading.`);
  if (manyH1) issues.push(`${manyH1} of ${n} have more than one H1.`);
  if (thin) issues.push(`${thin} of ${n} have under 250 words.`);
  if (noSchema) issues.push(`${noSchema} of ${n} carry no structured data.`);
  if (result.speedScore != null && result.speedScore < 50)
    issues.push(`Mobile speed score is ${result.speedScore} out of 100.`);

  result.issues = issues;
  return result;
}
