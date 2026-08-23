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

  const [{ data: terms }, { data: kws }, { data: site }, { data: pairs }] = await Promise.all([
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
    // Whether Search Console is connected is a fact about the CLIENT, not a
    // flag on the site row. pulse_sites.gsc_connected was added for the Index
    // Inspector and nothing has ever set it, so reading it made the panel
    // announce "not connected" over a table of 956 measured keywords.
    supabase.from("pulse_sites").select("client_id").eq("id", siteId).maybeSingle(),
    // Which page Google actually ranks for each query, newest window first.
    supabase
      .from("pulse_search_terms")
      .select("term, page, period_start")
      .eq("site_id", siteId)
      .eq("dimension", "query_page")
      .order("period_start", { ascending: false })
      .limit(30_000),
  ]);

  const rankingPages = new Map<string, string>();
  for (const r of (pairs as Array<{ term: string; page: string | null }>) ?? []) {
    if (!r.page) continue;
    // Newest window sorted first, so the first sighting of a term wins.
    if (!rankingPages.has(r.term.toLowerCase())) rankingPages.set(r.term.toLowerCase(), r.page);
  }

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

  // Keyed by phrase so the ranking rows can carry the page they are assigned
  // to win, not just whether somebody ticked them.
  const trackedByPhrase = new Map(
    ((kws as Array<{ id: string; phrase: string; target_url: string | null }>) ?? []).map((k) => [
      k.phrase.toLowerCase(),
      k,
    ]),
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
        tracked: trackedByPhrase.has(phrase.toLowerCase()),
        targetUrl: trackedByPhrase.get(phrase.toLowerCase())?.target_url ?? null,
        rankingPage: rankingPages.get(phrase.toLowerCase()) ?? null,
        keywordId: trackedByPhrase.get(phrase.toLowerCase())?.id ?? null,
        history: hist,
        estVolume: estimateVolume(g.impr, position, days),
      };
    })
    .sort((a, b) => b.impressions - a.impressions);

  const byPhrase = new Map(ranking.map((r) => [r.phrase.toLowerCase(), r]));

  // For a tracked keyword with no data of its own, the closest search the site
  // DOES appear for. Scored on shared words, then on how well it ranks — a
  // strong position on a near-miss phrase is the thing worth knowing.
  const findNear = (phrase: string) => {
    const want = new Set(
      phrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2),
    );
    if (want.size === 0) return null;
    let best: { row: RankingKeyword; score: number } | null = null;
    for (const r of ranking) {
      const words = r.phrase.toLowerCase().split(/[^a-z0-9]+/);
      const overlap = words.filter((w) => want.has(w)).length;
      // Two shared words is the floor; one is a coincidence.
      if (overlap < 2) continue;
      const score = overlap * 100 - r.position;
      if (!best || score > best.score) best = { row: r, score };
    }
    return best ? best.row : null;
  };

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
    const near = m ? null : findNear(k.phrase);
    return {
      id: k.id,
      phrase: k.phrase,
      // Fall back to the page Google actually ranks. Somebody tracking a
      // keyword has already said which page matters; making them retype a URL
      // the data already knows is busywork.
      targetUrl: k.target_url ?? m?.rankingPage ?? null,
      rankingPage: m?.rankingPage ?? null,
      nearMatch: near
        ? { phrase: near.phrase, position: near.position, impressions: near.impressions, page: near.rankingPage }
        : null,
      position: m ? m.position : null,
      clicks: m ? m.clicks : 0,
      impressions: m ? m.impressions : 0,
      change: m ? m.change : null,
      estVolume: m ? m.estVolume : null,
      intent: k.intent ?? classifyIntent(k.phrase),
    };
  });

  const clientId = (site as { client_id: string } | null)?.client_id ?? null;
  let gscConnected = false;
  if (clientId) {
    const { data: token } = await supabase
      .from("connector_tokens")
      .select("id")
      .eq("client_id", clientId)
      .eq("provider", "gsc")
      .maybeSingle();
    gscConnected = Boolean(token);
  }

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
    gscConnected,
  };
}
