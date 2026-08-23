// Keywords for one client, measured rather than modelled.
//
// Two lists, and the distinction between them is the whole point.
//
//   Tracked      phrases somebody deliberately chose to watch.
//   Ranking      every query Search Console has seen this site appear for.
//
// The second is far larger than people expect and is the reason a keyword
// subscription is mostly unnecessary here: Search Console reports real queries
// with Google's own average position, down past position 90. For one of these
// clients it lists more keywords than the paid deep pull returned.
//
// Nothing here is estimated. Position, clicks, impressions and CTR are all
// Google's own figures. Where a number cannot be measured — difficulty, for
// instance, which no free source publishes — it is absent rather than invented.

import { createServiceClient } from "@/lib/supabase/server";

export type { Intent, HistoryPoint, RankingKeyword, TrackedKeyword, KeywordsPanel } from "./keywords-shared";
export { classifyIntent, relatedTo, isQuestion, keywordGroups, trendOf, STOP } from "./keywords-shared";
import type { Intent, HistoryPoint, RankingKeyword, TrackedKeyword, KeywordsPanel } from "./keywords-shared";
import { classifyIntent, estimateVolume } from "./keywords-shared";







const round1 = (n: number) => Math.round(n * 10) / 10;

export async function keywordsPanel(siteId: string, days = 28): Promise<KeywordsPanel> {
  const supabase = await createServiceClient();
  const now = Date.now();
  const currentFrom = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const priorFrom = new Date(now - days * 2 * 86_400_000).toISOString().slice(0, 10);
  // Twelve weeks of history behind the two comparison windows, so the detail
  // row has a shape to show rather than two dots.
  const historyFrom = new Date(now - 84 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: terms }, { data: kws }, { data: site }] = await Promise.all([
    supabase
      .from("pulse_search_terms")
      .select("term, clicks, impressions, ctr, position, period_start")
      .eq("site_id", siteId)
      .eq("dimension", "query")
      .gte("period_start", historyFrom)
      .limit(120_000),
    supabase
      .from("pulse_keywords")
      .select("id, phrase, target_url, volume, intent")
      .eq("site_id", siteId)
      .eq("is_active", true),
    supabase.from("pulse_sites").select("gsc_connected").eq("id", siteId).maybeSingle(),
  ]);

  interface Term {
    term: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    period_start: string;
  }
  const rows = (terms as Term[]) ?? [];

  // Impression-weighted, because a query shown 900 times and once should not
  // average its two positions as equals.
  const agg = new Map<string, { clicks: number; impr: number; posWeighted: number; best: number }>();
  const prior = new Map<string, { impr: number; posWeighted: number }>();
  const history = new Map<string, Map<string, { pw: number; impr: number; clicks: number }>>();
  let lastUpdated: string | null = null;

  for (const r of rows) {
    if (!r.term) continue;

    // Every row feeds the history, including the ones outside the two
    // comparison windows — that is the point of pulling twelve weeks.
    const week = r.period_start;
    const perTerm = history.get(r.term) ?? new Map<string, { pw: number; impr: number; clicks: number }>();
    const cell = perTerm.get(week) ?? { pw: 0, impr: 0, clicks: 0 };
    cell.pw += (r.position ?? 0) * (r.impressions ?? 0);
    cell.impr += r.impressions ?? 0;
    cell.clicks += r.clicks ?? 0;
    perTerm.set(week, cell);
    history.set(r.term, perTerm);

    if (r.period_start < priorFrom) continue;
    const isCurrent = r.period_start >= currentFrom;
    if (isCurrent) {
      if (!lastUpdated || r.period_start > lastUpdated) lastUpdated = r.period_start;
      const g = agg.get(r.term) ?? { clicks: 0, impr: 0, posWeighted: 0, best: 999 };
      g.clicks += r.clicks ?? 0;
      g.impr += r.impressions ?? 0;
      g.posWeighted += (r.position ?? 0) * (r.impressions ?? 0);
      if (r.position && r.position < g.best) g.best = r.position;
      agg.set(r.term, g);
    } else {
      const g = prior.get(r.term) ?? { impr: 0, posWeighted: 0 };
      g.impr += r.impressions ?? 0;
      g.posWeighted += (r.position ?? 0) * (r.impressions ?? 0);
      prior.set(r.term, g);
    }
  }

  const trackedPhrases = new Set(
    ((kws as Array<{ phrase: string }>) ?? []).map((k) => k.phrase.toLowerCase()),
  );

  const ranking: RankingKeyword[] = [...agg.entries()]
    .filter(([, g]) => g.impr > 0)
    .map(([phrase, g]) => {
      const position = round1(g.posWeighted / g.impr);
      const p = prior.get(phrase);
      const priorPos = p && p.impr > 0 ? p.posWeighted / p.impr : null;
      const hist: HistoryPoint[] = [...(history.get(phrase) ?? new Map()).entries()]
        .filter(([, c]) => c.impr > 0)
        .map(([weekStart, c]) => ({
          weekStart,
          position: round1(c.pw / c.impr),
          clicks: c.clicks,
          impressions: c.impr,
        }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

      return {
        phrase,
        position,
        clicks: g.clicks,
        impressions: g.impr,
        ctr: g.impr > 0 ? round1((g.clicks / g.impr) * 100) : 0,
        change: priorPos === null ? null : round1(position - priorPos),
        best: g.best === 999 ? position : round1(g.best),
        intent: classifyIntent(phrase),
        tracked: trackedPhrases.has(phrase.toLowerCase()),
        history: hist,
        estVolume: estimateVolume(g.impr, position, days),
      };
    })
    .sort((a, b) => b.impressions - a.impressions);

  const byPhrase = new Map(ranking.map((r) => [r.phrase.toLowerCase(), r]));

  const tracked: TrackedKeyword[] = (
    (kws as Array<{
      id: string;
      phrase: string;
      target_url: string | null;
      volume: number | null;
      intent: Intent | null;
    }>) ?? []
  ).map((k) => {
    const m = byPhrase.get(k.phrase.toLowerCase());
    return {
      id: k.id,
      phrase: k.phrase,
      targetUrl: k.target_url,
      position: m ? m.position : null,
      clicks: m ? m.clicks : 0,
      impressions: m ? m.impressions : 0,
      change: m ? m.change : null,
      estVolume: m ? m.estVolume : null,
      intent: k.intent ?? classifyIntent(k.phrase),
    };
  });

  return {
    tracked,
    ranking,
    totals: {
      rankingCount: ranking.length,
      trackedCount: tracked.length,
      top3: ranking.filter((r) => r.position <= 3).length,
      top10: ranking.filter((r) => r.position <= 10).length,
      page2: ranking.filter((r) => r.position > 10 && r.position <= 20).length,
      impressions: ranking.reduce((s, r) => s + r.impressions, 0),
      clicks: ranking.reduce((s, r) => s + r.clicks, 0),
    },
    lastUpdated,
    gscConnected: Boolean((site as { gsc_connected?: boolean } | null)?.gsc_connected),
  };
}
