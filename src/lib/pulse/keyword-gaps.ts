// Low-hanging fruit, in the two places it actually hides.
//
// The first is inside a client's own Search Console data and is the more
// valuable of the two: keywords Google already shows this site for, hundreds of
// times, at a position nobody clicks. The demand is proven — Google measured it
// — and the only thing missing is a few positions. Nothing has to be guessed to
// find these, which is why they lead.
//
// The second is what the site does NOT appear for. That needs a source of
// keyword ideas, and Google's own autocomplete is one: free, no key, and
// ordered by how often people actually type each phrase. What it does not give
// is search volume, so none is shown. A ranked list of real searches with an
// honest "no volume available" beats a table of invented numbers.

import { createServiceClient } from "@/lib/supabase/server";
import type { RankingKeyword } from "./keywords-shared";

/**
 * Share of searchers who click at each position.
 *
 * Industry-average curve — directional, not measured, and the estimate is
 * labelled everywhere it surfaces. It is used only to rank opportunities
 * against each other, which it does well even if any single figure is off.
 */
const CTR_BY_POSITION: number[] = [
  0, 0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.032, 0.028, 0.025,
];
function ctrAt(position: number): number {
  const p = Math.round(position);
  if (p <= 10) return CTR_BY_POSITION[Math.max(1, p)];
  if (p <= 20) return 0.011;
  if (p <= 30) return 0.006;
  if (p <= 50) return 0.003;
  return 0.001;
}

export type OpportunityKind = "striking_distance" | "untapped" | "weak_ctr";

export interface Opportunity {
  phrase: string;
  kind: OpportunityKind;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  /** Clicks a month this could add if it reached position 5. Computed. */
  clicksIfImproved: number;
  reason: string;
}

const TARGET_POSITION = 5;

/**
 * Rank what is already earning impressions by how much is being left behind.
 *
 * Sorting by impressions alone puts the biggest keyword on top even when it is
 * already at position 2 and nothing more can be won. Sorting by the gap between
 * what it earns now and what it would earn a few positions higher puts the
 * winnable ones on top, which is the actual question.
 */
export function findOpportunities(ranking: RankingKeyword[], limit = 30): Opportunity[] {
  const out: Opportunity[] = [];

  for (const r of ranking) {
    // Below a handful of impressions there is no demand to act on, only noise.
    if (r.impressions < 10) continue;

    const currentCtr = r.impressions > 0 ? r.clicks / r.impressions : 0;
    const gain = Math.round(r.impressions * Math.max(0, ctrAt(TARGET_POSITION) - ctrAt(r.position)));

    if (r.position > 10 && r.position <= 20) {
      out.push({
        phrase: r.phrase, kind: "striking_distance", position: r.position,
        impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, clicksIfImproved: gain,
        reason: `Page 2. Google already shows this ${r.impressions.toLocaleString()} times — a few positions puts it where people click.`,
      });
    } else if (r.position > 20 && r.position <= 50) {
      out.push({
        phrase: r.phrase, kind: "untapped", position: r.position,
        impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, clicksIfImproved: gain,
        reason: `Real demand at position ${r.position.toFixed(0)}. Further out, but the audience is proven.`,
      });
    } else if (r.position <= 10 && r.impressions >= 40 && currentCtr < ctrAt(r.position) * 0.5) {
      // On page one and still not clicked. The ranking is not the problem.
      out.push({
        phrase: r.phrase, kind: "weak_ctr", position: r.position,
        impressions: r.impressions, clicks: r.clicks, ctr: r.ctr,
        clicksIfImproved: Math.round(r.impressions * ctrAt(r.position)) - r.clicks,
        reason: `Position ${r.position.toFixed(1)} but only ${r.ctr.toFixed(1)}% click. The title and description are doing the losing, not the ranking.`,
      });
    }
  }

  return out.sort((a, b) => b.clicksIfImproved - a.clicksIfImproved).slice(0, limit);
}

export interface KeywordGap {
  phrase: string;
  /** Where Google placed it in its own suggestions. Lower means more typed. */
  rank: number;
  seed: string;
  /** True when this site already appears for it — then it is not a gap. */
  alreadyRanks: boolean;
  currentPosition: number | null;
}

/**
 * Ask Google what people type around a phrase.
 *
 * Autocomplete is free, needs no key, and is ordered by real query frequency.
 * It gives ideas and only ideas — there is no volume in the response and none
 * is invented here.
 */
async function suggest(seed: string): Promise<string[]> {
  try {
    const url =
      "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=" +
      encodeURIComponent(seed);
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; F1PulseBot/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as [string, string[]];
    return Array.isArray(body?.[1]) ? body[1] : [];
  } catch {
    return [];
  }
}

/**
 * Searches people make around this site's own best keywords, marked with
 * whether the site already appears for them.
 *
 * Seeds are the client's top keywords by impressions rather than a phrase
 * somebody typed, so the suggestions stay in the business the client is
 * actually in.
 */
export async function findGaps(
  siteId: string,
  ranking: RankingKeyword[],
  seedCount = 8,
): Promise<KeywordGap[]> {
  const known = new Map(ranking.map((r) => [r.phrase.toLowerCase(), r]));

  // Seed from the strongest demand, and skip near-duplicates so eight requests
  // do not all explore the same corner.
  const seeds: string[] = [];
  for (const r of [...ranking].sort((a, b) => b.impressions - a.impressions)) {
    if (seeds.length >= seedCount) break;
    const first = r.phrase.split(/\s+/).slice(0, 2).join(" ");
    if (seeds.some((s) => s.startsWith(first))) continue;
    seeds.push(r.phrase);
  }

  const lists = await Promise.all(seeds.map(async (s) => ({ seed: s, items: await suggest(s) })));

  const seen = new Set<string>();
  const gaps: KeywordGap[] = [];
  for (const { seed, items } of lists) {
    items.forEach((phrase, i) => {
      const key = phrase.toLowerCase().trim();
      if (!key || key === seed.toLowerCase() || seen.has(key)) return;
      seen.add(key);
      const match = known.get(key);
      gaps.push({
        phrase,
        rank: i + 1,
        seed,
        alreadyRanks: Boolean(match),
        currentPosition: match ? match.position : null,
      });
    });
  }

  // Not-yet-ranking first, then by how prominently Google suggests it.
  return gaps.sort((a, b) => {
    if (a.alreadyRanks !== b.alreadyRanks) return a.alreadyRanks ? 1 : -1;
    return a.rank - b.rank;
  });
}

/** Record a gap as a tracked keyword so it shows up on the Rankings tab. */
export async function trackGap(siteId: string, phrase: string): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from("pulse_keywords").upsert(
    {
      site_id: siteId,
      phrase: phrase.trim().slice(0, 200),
      location_code: 2840,
      device: "desktop",
      is_active: true,
      metrics_source: "measured",
    },
    { onConflict: "site_id,phrase,location_code,device" },
  );
}
