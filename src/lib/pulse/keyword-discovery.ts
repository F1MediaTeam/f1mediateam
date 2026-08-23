// Keyword discovery, without a keyword database.
//
// The paid tools answer "show me millions of keywords" from an index they
// built by scraping search results for years. There is no free copy of that
// index, and there is no clever way around its absence.
//
// What is free is the thing the index was built to approximate: Google's own
// autocomplete, which is ordered by how often people actually type each
// phrase. Asked once it returns ten suggestions. Asked systematically — the
// seed, then the seed followed by each letter, then common question and
// commercial prefixes — it returns several hundred real searches for one term,
// which is enough to work from.
//
// What it does not return is search volume. None is invented here. Where a
// phrase happens to be one a client already appears for, Search Console's
// measured impressions are attached and labelled as measured; everything else
// carries Google's suggestion rank and nothing more.

import { createServiceClient } from "@/lib/supabase/server";
import { classifyIntent, type Intent } from "./keywords-shared";

export interface DiscoveredKeyword {
  phrase: string;
  intent: Intent;
  /** Best position in Google's suggestion lists. Lower means more typed. */
  rank: number;
  /** How many different expansions surfaced it. Repetition is a demand signal. */
  seenIn: number;
  /** Real impressions, when some client of ours already appears for this. */
  measuredImpressions: number | null;
  measuredPosition: number | null;
  /** The site that measurement came from, so the number is attributable. */
  measuredOn: string | null;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const PREFIXES = ["how to", "what is", "where to", "best", "cheap", "near me", "custom", "who"];

async function suggest(q: string): Promise<string[]> {
  try {
    const res = await fetch(
      "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=" +
        encodeURIComponent(q),
      {
        headers: { "user-agent": "Mozilla/5.0 (compatible; F1PulseBot/1.0)" },
        signal: AbortSignal.timeout(7_000),
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as [string, string[]];
    return Array.isArray(body?.[1]) ? body[1] : [];
  } catch {
    return [];
  }
}

/** Run in batches so one seed does not open forty sockets at once. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Every search Google will suggest around a seed phrase.
 *
 * Roughly 35 requests, which takes a few seconds — hence a button rather than
 * something that fires as somebody types.
 */
export async function discoverKeywords(seed: string): Promise<DiscoveredKeyword[]> {
  const q = seed.trim().toLowerCase();
  if (!q) return [];

  const queries = [
    q,
    ...ALPHABET.map((c) => `${q} ${c}`),
    ...PREFIXES.map((p) => (p === "near me" ? `${q} near me` : `${p} ${q}`)),
  ];

  const lists = await inBatches(queries, 8, suggest);

  // rank = the best position it ever held; seenIn = how many lists contained it.
  const found = new Map<string, { rank: number; seenIn: number }>();
  for (const list of lists) {
    list.forEach((phrase, i) => {
      const key = phrase.trim().toLowerCase();
      if (!key || key === q) return;
      const prev = found.get(key);
      if (prev) {
        prev.seenIn += 1;
        prev.rank = Math.min(prev.rank, i + 1);
      } else {
        found.set(key, { rank: i + 1, seenIn: 1 });
      }
    });
  }

  // Attach real numbers wherever we happen to have them. Most rows will not,
  // and showing an empty cell is the honest outcome.
  const supabase = await createServiceClient();
  const phrases = [...found.keys()];
  const measured = new Map<string, { impressions: number; position: number; domain: string }>();

  for (let i = 0; i < phrases.length; i += 200) {
    const { data } = await supabase
      .from("pulse_search_terms")
      .select("term, impressions, position, site_id, pulse_sites(domain)")
      .eq("dimension", "query")
      .in("term", phrases.slice(i, i + 200))
      .limit(2_000);

    for (const row of (data as Array<{
      term: string;
      impressions: number;
      position: number;
      pulse_sites: { domain: string } | { domain: string }[] | null;
    }>) ?? []) {
      const site = Array.isArray(row.pulse_sites) ? row.pulse_sites[0] : row.pulse_sites;
      const key = row.term.toLowerCase();
      const prev = measured.get(key);
      const impressions = (prev?.impressions ?? 0) + (row.impressions ?? 0);
      measured.set(key, {
        impressions,
        position: row.position ?? prev?.position ?? 0,
        domain: site?.domain ?? prev?.domain ?? "",
      });
    }
  }

  return [...found.entries()]
    .map(([phrase, meta]) => {
      const m = measured.get(phrase);
      return {
        phrase,
        intent: classifyIntent(phrase),
        rank: meta.rank,
        seenIn: meta.seenIn,
        measuredImpressions: m ? m.impressions : null,
        measuredPosition: m ? Math.round(m.position * 10) / 10 : null,
        measuredOn: m ? m.domain : null,
      };
    })
    .sort((a, b) => {
      // Anything with a real number first — those are the only rows where
      // demand is known rather than inferred.
      if ((a.measuredImpressions ?? -1) !== (b.measuredImpressions ?? -1))
        return (b.measuredImpressions ?? -1) - (a.measuredImpressions ?? -1);
      if (a.seenIn !== b.seenIn) return b.seenIn - a.seenIn;
      return a.rank - b.rank;
    });
}
