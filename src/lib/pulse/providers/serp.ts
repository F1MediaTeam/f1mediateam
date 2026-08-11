// The rank/backlink provider, behind one interface.
//
// Real credentials and mock data are the same shape, so nothing downstream —
// collectors, dashboard, aggregates — knows or cares which is in play. Adding
// credentials later changes nothing but this file.
//
// Mock data is deterministic per keyword: the same phrase always produces the
// same position, and movement between runs comes from the day, not from a
// random number. A demo that reshuffles every refresh teaches nobody anything,
// and a flaky mock is indistinguishable from a broken collector.

import { createHash } from "node:crypto";

export interface RankResult {
  phrase: string;
  position: number | null; // null = outside the top 100
  rankingUrl: string | null;
  serpFeatures: Record<string, boolean>;
}

export interface BacklinkResult {
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string | null;
  anchor: string | null;
  metrics: Record<string, unknown>;
}

export function isMock(): boolean {
  if (process.env.PULSE_MOCK === "true") return true;
  return !(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

/** Stable 0–1 from a string, so mock output is reproducible. */
function seed(input: string): number {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 8);
  return parseInt(hex, 16) / 0xffffffff;
}

/** Day number — the only thing that moves mock positions between runs. */
function today(): number {
  return Math.floor(Date.now() / 86_400_000);
}

// ---------------------------------------------------------------- ranks

function mockRank(domain: string, phrase: string): RankResult {
  const base = seed(`${domain}|${phrase}`);

  // A fifth of tracked phrases sit outside the top 100 — realistic for a
  // starter list, and it exercises the null-position path in the UI.
  if (base > 0.8) {
    return { phrase, position: null, rankingUrl: null, serpFeatures: {} };
  }

  // Anchor position from the phrase, then drift a little day to day so
  // movement, sparklines and the rank_up/rank_down events have something true
  // to compute from.
  const anchor = 1 + Math.floor(base * 45);
  const drift = Math.round((seed(`${phrase}|${today()}`) - 0.5) * 6);
  const position = Math.min(100, Math.max(1, anchor + drift));

  const slug = phrase.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    phrase,
    position,
    rankingUrl: `https://${domain}/${slug}`,
    serpFeatures: {
      local_pack: base > 0.55,
      people_also_ask: base > 0.35,
      image_pack: base > 0.7,
    },
  };
}

export async function fetchRanks(
  domain: string,
  phrases: string[],
  locationCode: number,
): Promise<{ results: RankResult[]; mocked: boolean }> {
  if (isMock()) {
    return { results: phrases.map((p) => mockRank(domain, p)), mocked: true };
  }

  // Real path. Kept deliberately small: one task per phrase, read the first
  // 100 organic results, find our domain. Anything richer belongs in the
  // provider's own response, not in an interpretation layer here.
  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
  ).toString("base64");

  const results: RankResult[] = [];
  for (const phrase of phrases) {
    try {
      const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
        body: JSON.stringify([
          { keyword: phrase, location_code: locationCode, language_code: "en", device: "desktop", depth: 100 },
        ]),
        signal: AbortSignal.timeout(60_000),
      });
      const json = (await res.json()) as {
        tasks?: Array<{ result?: Array<{ items?: Array<Record<string, unknown>> }> }>;
      };
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];

      let position: number | null = null;
      let rankingUrl: string | null = null;
      const features: Record<string, boolean> = {};

      for (const item of items) {
        const type = String(item.type ?? "");
        if (type !== "organic") {
          features[type] = true;
          continue;
        }
        const url = String(item.url ?? "");
        if (!position && url.includes(domain)) {
          position = Number(item.rank_absolute ?? item.rank_group ?? 0) || null;
          rankingUrl = url;
        }
      }
      results.push({ phrase, position, rankingUrl, serpFeatures: features });
    } catch {
      // One phrase failing must not lose the other fourteen.
      results.push({ phrase, position: null, rankingUrl: null, serpFeatures: {} });
    }
  }
  return { results, mocked: false };
}

// ------------------------------------------------------------ backlinks

function mockBacklinks(domain: string): BacklinkResult[] {
  const sources = [
    "yelp.com", "bbb.org", "facebook.com", "mapquest.com", "yellowpages.com",
    "azcentral.com", "thumbtack.com", "angi.com", "manta.com", "chamberofcommerce.com",
    "local.com", "brownbook.net", "hotfrog.com", "cylex.us.com", "merchantcircle.com",
  ];
  const day = today();
  // The set drifts slowly: the window moves one source every few days, so each
  // weekly run produces a small, believable new/lost diff rather than churn.
  const offset = Math.floor(day / 3) % sources.length;
  const window = [...sources.slice(offset), ...sources.slice(0, offset)].slice(0, 11);

  return window.map((host) => {
    const s = seed(`${domain}|${host}`);
    return {
      sourceUrl: `https://${host}/biz/${domain.split(".")[0]}`,
      sourceDomain: host,
      targetUrl: `https://${domain}/`,
      anchor: s > 0.6 ? domain.split(".")[0] : s > 0.3 ? "visit website" : "",
      metrics: {
        domain_rank: Math.round(20 + s * 70),
        backlink_spam_score: Math.round(s * 12),
        dofollow: s > 0.25,
      },
    };
  });
}

export async function fetchBacklinks(
  domain: string,
): Promise<{ results: BacklinkResult[]; mocked: boolean }> {
  if (isMock()) return { results: mockBacklinks(domain), mocked: true };

  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
  ).toString("base64");

  try {
    const res = await fetch("https://api.dataforseo.com/v3/backlinks/backlinks/live", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify([{ target: domain, limit: 500, mode: "as_is" }]),
      signal: AbortSignal.timeout(90_000),
    });
    const json = (await res.json()) as {
      tasks?: Array<{ result?: Array<{ items?: Array<Record<string, unknown>> }> }>;
    };
    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    return {
      results: items.map((i) => ({
        sourceUrl: String(i.url_from ?? ""),
        sourceDomain: String(i.domain_from ?? ""),
        targetUrl: String(i.url_to ?? "") || null,
        anchor: (i.anchor as string) ?? null,
        // Stored exactly as returned — no derived authority score of our own.
        metrics: {
          domain_rank: i.domain_from_rank,
          backlink_spam_score: i.backlink_spam_score,
          dofollow: i.dofollow,
        },
      })).filter((b) => b.sourceUrl && b.sourceDomain),
      mocked: false,
    };
  } catch {
    return { results: [], mocked: false };
  }
}
