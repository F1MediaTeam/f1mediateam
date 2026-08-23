// Pure keyword helpers — no database, no server imports.
//
// Split out because the panel component needs these in the browser, and the
// module they used to live in also opens a service-role Supabase client. That
// import graph pulled server-only code into the client bundle and failed the
// build, which is the good outcome: the alternative is shipping a service key
// to a browser.

export type Intent = "T" | "C" | "I" | "N";

export interface HistoryPoint {
  weekStart: string;
  position: number;
  clicks: number;
  impressions: number;
}

/**
 * Share of searchers who ever lay eyes on a given position.
 *
 * Almost everyone who searches sees page one, a quarter go to page two, and
 * the tail falls away fast after that. These are industry-average figures, not
 * measurements, and they exist for one purpose: turning an impression count
 * into an estimate of how many people searched at all.
 */
function visibilityAt(position: number): number {
  if (position <= 10) return 1.0;
  if (position <= 20) return 0.25;
  if (position <= 30) return 0.12;
  if (position <= 50) return 0.06;
  return 0.03;
}

/**
 * Roughly how many people search this a month.
 *
 * Not a vendor's number and not a guess pulled from nothing: impressions are
 * Google's own count of how often it showed this site for the query, and
 * position is Google's own average. Dividing one by how many searchers ever
 * reach that position gives the size of the audience behind it.
 *
 * At position 3 the estimate is nearly the impression count itself, because
 * almost everyone who searched saw it. At position 45 it is a multiple, because
 * most people never scrolled that far. The further down the ranking, the softer
 * the number — which is why it is labelled estimated everywhere it appears and
 * never sits in the same column as a measured one.
 */
export function estimateVolume(impressions: number, position: number, windowDays = 28): number {
  if (impressions <= 0) return 0;
  const perWindow = impressions / visibilityAt(position);
  return Math.round((perWindow / windowDays) * 30);
}

export interface RankingKeyword {
  phrase: string;
  position: number;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Change in position against the previous period. Negative is an improvement. */
  change: number | null;
  best: number;
  intent: Intent;
  tracked: boolean;
  /** Week-by-week position, oldest first. Drives the trend and the detail row. */
  history: HistoryPoint[];
  /** Estimated monthly searches, computed from measured impressions. */
  estVolume: number;
  /** The page this keyword is assigned to win, when somebody has assigned one. */
  targetUrl: string | null;
  /** Row id in pulse_keywords, present only when tracked. */
  keywordId: string | null;
}

export interface TrackedKeyword {
  id: string;
  phrase: string;
  targetUrl: string | null;
  /** Null when Search Console has never seen this site appear for it. */
  position: number | null;
  clicks: number;
  impressions: number;
  change: number | null;
  /** Estimated monthly searches when Search Console has data for it. */
  estVolume: number | null;
  intent: Intent;
}

export interface KeywordsPanel {
  tracked: TrackedKeyword[];
  ranking: RankingKeyword[];
  totals: {
    rankingCount: number;
    trackedCount: number;
    top3: number;
    top10: number;
    page2: number;
    impressions: number;
    clicks: number;
  };
  lastUpdated: string | null;
  gscConnected: boolean;
}

/**
 * Search intent from the shape of the phrase.
 *
 * A heuristic, and labelled as one wherever it is shown. It exists because
 * sorting a thousand queries by what the person wanted is genuinely useful and
 * the alternative was paying for the same guess.
 */
export function classifyIntent(phrase: string): Intent {
  const p = phrase.toLowerCase();
  if (/^(who|what|why|when|where|how|can|does|do|is|are|should)\b/.test(p)) return "I";
  if (/\b(vs|versus|best|top|review|reviews|compare|cheapest|alternative)\b/.test(p)) return "C";
  if (/\b(buy|order|price|pricing|cost|quote|near me|for sale|hire|shop|custom)\b/.test(p)) return "T";
  // A brand or a domain-looking phrase is somebody trying to get to a place.
  if (/\.(com|net|org)\b/.test(p) || p.split(/\s+/).length === 1) return "N";
  return "C";
}

/**
 * Keywords related to a seed, taken from what this site already appears for.
 *
 * The paid version of this asks a vendor's index "what else is like this
 * phrase". This asks the client's own Search Console the better question:
 * which of the searches already reaching this site share language with it.
 * The answers are real queries with real positions, not suggestions.
 */
export function relatedTo(seed: string, all: RankingKeyword[], limit = 40): RankingKeyword[] {
  const tokens = new Set(
    seed.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)),
  );
  if (tokens.size === 0) return [];
  return all
    .filter((r) => r.phrase.toLowerCase() !== seed.toLowerCase())
    .map((r) => {
      const words = r.phrase.toLowerCase().split(/[^a-z0-9]+/);
      const overlap = words.filter((w) => tokens.has(w)).length;
      return { row: r, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.row.impressions - a.row.impressions)
    .slice(0, limit)
    .map((x) => x.row);
}

/** Words that carry no grouping signal. */
export const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for",
  "is", "are", "do", "does", "me", "my", "you", "your", "it", "with", "i",
  "near", "best",
]);

const QWORDS = new Set([
  "how", "what", "why", "when", "where", "who", "which",
  "can", "do", "does", "is", "are", "should", "will",
]);

/** Is this phrase a question? Drives the Questions tab. */
export function isQuestion(phrase: string): boolean {
  return QWORDS.has(phrase.toLowerCase().trim().split(/\s+/)[0]);
}

/**
 * The recurring words across a keyword set, for the Groups sidebar.
 *
 * Counted over real queries, so a group is a thing people actually search for
 * on this site rather than a topic somebody imagined.
 */
export function keywordGroups(rows: RankingKeyword[], min = 2, limit = 14): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const words = new Set(
      r.phrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)),
    );
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * Direction of travel over the last few weeks.
 *
 * Compares the mean of the most recent third against the oldest third rather
 * than first-versus-last, so one noisy week does not flip a verdict.
 */
export function trendOf(history: HistoryPoint[]): "rising" | "stable" | "declining" {
  if (history.length < 4) return "stable";
  const third = Math.max(1, Math.floor(history.length / 3));
  const mean = (xs: HistoryPoint[]) => xs.reduce((s, h) => s + h.position, 0) / xs.length;
  const older = mean(history.slice(0, third));
  const newer = mean(history.slice(-third));
  const delta = older - newer; // position falls as things improve
  if (delta > 1.5) return "rising";
  if (delta < -1.5) return "declining";
  return "stable";
}
