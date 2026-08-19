// Keyword Lab — research and rank checking, server-side only.
//
// Everything here runs on the server for one non-negotiable reason: these calls
// need ANTHROPIC_API_KEY, and a key in the browser is a key anyone can spend.
// The original module called api.anthropic.com straight from the component,
// which works inside Claude's own sandbox because the call is proxied there and
// fails — or leaks — anywhere else. Nothing in this file may ever be imported
// by a client component.
//
// Two kinds of number come out of here, and conflating them would be the whole
// credibility of the tool:
//
//   the rank check is MEASURED. Claude searches, reads the results, and reports
//   what position the page held. The list it read is stored so the answer can
//   be audited rather than believed.
//
//   volume, difficulty and cost-per-click are AI-ESTIMATED. Claude does not
//   have Google's volume data. They are calibrated guesses, useful for deciding
//   which of two keywords to chase and unsafe to put in front of a client as
//   fact.
//
// Every paid call is priced and written to pulse_ai_spend before its result is
// returned, so a monthly ceiling is enforceable rather than aspirational.

import { createServiceClient } from "@/lib/supabase/server";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

/**
 * Sonnet rather than Opus, deliberately. This is a high-volume, low-judgement
 * task — estimate a number, read a result list — and Sonnet does it at a fifth
 * of the cost. On a tool that might run hundreds of checks a month that is the
 * difference between a rounding error and a line item.
 */
const MODEL = "claude-sonnet-4-6";

/** Published rates, USD per million tokens. Used only to estimate the bill. */
const PRICE_IN = 3 / 1_000_000;
const PRICE_OUT = 15 / 1_000_000;
/** Web search is billed per search, not per token. */
const PRICE_SEARCH = 10 / 1_000;

/** Default monthly ceiling. Override with PULSE_AI_BUDGET_USD. */
const DEFAULT_BUDGET = 25;

export type Intent = "T" | "C" | "I" | "N";

export interface KeywordMetrics {
  k: string;
  v: number;
  i: Intent;
  kd: number;
  c: number;
}

export interface AnalyzeResult {
  kw: string;
  vol: number;
  intent: Intent;
  kd: number;
  cpc: number;
  trend: "rising" | "stable" | "declining";
  related: KeywordMetrics[];
  /** What this call cost, so the UI can show it rather than hide it. */
  costUsd: number;
}

export interface RankCheckResult {
  checkedAt: string;
  position: number | null;
  foundUrl: string | null;
  match: "exact" | "domain" | "none";
  top: Array<{ pos: number; title: string; url: string }>;
  costUsd: number;
}

// --------------------------------------------------------------- utilities

const num = (x: unknown) => Math.max(0, Math.round(Number(x) || 0));
const clampKd = (x: unknown) => Math.min(100, num(x));

export function cleanDomain(d: string): string {
  return String(d || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Blank means the homepage; "/path" attaches to the site; else a full URL. */
export function resolveTarget(raw: string | null | undefined, domain: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return `https://${domain}/`;
  if (s.startsWith("/")) return `https://${domain}${s}`;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/**
 * Parse JSON that may be fenced, prefixed with commentary, or cut off.
 *
 * A truncated response is the common failure when a model hits its token
 * ceiling mid-array, and throwing away an otherwise good list of sixteen
 * keywords because the last one lost its closing brace helps nobody.
 */
function parseLoose(text: string): Record<string, unknown> | null {
  const clean = text.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    /* fall through */
  }
  const start = clean.indexOf("{");
  if (start >= 0) {
    const body = clean.slice(start);
    try {
      return JSON.parse(body);
    } catch {
      /* fall through */
    }
    // Salvage: close the array at the last complete element.
    const cut = body.lastIndexOf("},");
    if (cut > 0) {
      try {
        return JSON.parse(body.slice(0, cut + 1) + "]}");
      } catch {
        /* give up */
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ spend

export interface SpendSummary {
  monthUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  overBudget: boolean;
}

function budgetUsd(): number {
  const raw = Number(process.env.PULSE_AI_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET;
}

/** Spend so far this calendar month, against the ceiling. */
export async function spendSummary(): Promise<SpendSummary> {
  const supabase = await createServiceClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("pulse_ai_spend")
    .select("est_cost_usd")
    .gte("occurred_at", monthStart.toISOString())
    .limit(20_000);

  const monthUsd = ((data as Array<{ est_cost_usd: number }>) ?? []).reduce(
    (s, r) => s + Number(r.est_cost_usd || 0),
    0,
  );
  const budget = budgetUsd();
  return {
    monthUsd: Math.round(monthUsd * 1000) / 1000,
    budgetUsd: budget,
    remainingUsd: Math.max(0, Math.round((budget - monthUsd) * 1000) / 1000),
    overBudget: monthUsd >= budget,
  };
}

async function recordSpend(input: {
  feature: string;
  usage: { input_tokens?: number; output_tokens?: number };
  webSearches?: number;
  siteId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<number> {
  const inTok = input.usage.input_tokens ?? 0;
  const outTok = input.usage.output_tokens ?? 0;
  const searches = input.webSearches ?? 0;
  const cost = inTok * PRICE_IN + outTok * PRICE_OUT + searches * PRICE_SEARCH;

  const supabase = await createServiceClient();
  await supabase.from("pulse_ai_spend").insert({
    feature: input.feature,
    model: MODEL,
    input_tokens: inTok,
    output_tokens: outTok,
    web_searches: searches,
    est_cost_usd: Math.round(cost * 100_000) / 100_000,
    site_id: input.siteId ?? null,
    detail: input.detail ?? {},
  });

  return Math.round(cost * 100_000) / 100_000;
}

/** Roughly what one call of each kind costs, for showing before spending. */
export const ESTIMATED_COST = {
  analyze: 0.012,
  rankCheck: 0.035,
};

// ------------------------------------------------------------- the calls

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
  stop_reason?: string;
  error?: { message?: string };
}

async function callClaude(body: Record<string, unknown>): Promise<AnthropicResponse> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to the Vercel project's environment variables.",
    );
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, ...body }),
    signal: AbortSignal.timeout(120_000),
  });

  const json = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Anthropic returned ${res.status}`);
  }
  return json;
}

function textOf(json: AnthropicResponse): string {
  return (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/**
 * Estimate metrics for a seed keyword and propose related terms.
 *
 * No web search here — this is the model's own calibration, which is why it
 * costs about a cent and why the numbers are labelled as estimates everywhere
 * they appear.
 */
export async function analyzeKeyword(seed: string): Promise<AnalyzeResult> {
  const q = String(seed || "").replace(/["\\]/g, "").trim();
  if (!q) throw new Error("Enter a keyword.");

  const budget = await spendSummary();
  if (budget.overBudget) {
    throw new Error(
      `This month's research budget of $${budget.budgetUsd} is used up. Raise PULSE_AI_BUDGET_USD or wait for the month to roll over.`,
    );
  }

  const prompt = `You are the estimation engine inside an SEO keyword research tool. Analyze this seed keyword for Google US search: "${q}"

Respond with ONLY minified valid JSON (no markdown fences, no commentary) in exactly this shape:
{"kw":"${q}","vol":0,"intent":"T","kd":0,"cpc":0,"trend":"stable","related":[{"k":"","v":0,"i":"T","kd":0,"c":0}]}

Field rules:
- vol / v: estimated US monthly Google searches. Use realistic Google Ads volume buckets like 22200,14800,12100,9900,8100,6600,5400,4400,3600,2900,2400,1900,1600,1300,1000,880,720,590,480,390,320,260,210,170,140,110,90,70,50,40,30,20,10.
- intent / i: T (transactional), C (commercial investigation), I (informational), N (navigational).
- kd: keyword difficulty 0-100 to rank in the organic top 10. Local "near me" service terms usually 15-45, national head terms 45-85, niche long-tails 5-30.
- cpc / c: estimated US CPC in USD with 2 decimals.
- trend: "rising", "stable", or "declining" 12-month interest.
- related: exactly 16 keywords closely related to the seed (close variants, long-tails, and 2-3 question phrases). Never repeat the seed itself. Sort by v descending. Calibrate all values realistically relative to each other and to the seed.
Keep the entire response under 750 tokens. No trailing commas.`;

  const json = await callClaude({
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const costUsd = await recordSpend({
    feature: "keyword_analyze",
    usage: json.usage ?? {},
    detail: { seed: q },
  });

  const parsed = parseLoose(textOf(json));
  if (!parsed) throw new Error("Could not read the response. Try that keyword again.");

  const seen = new Set([q.toLowerCase()]);
  const related = (Array.isArray(parsed.related) ? parsed.related : [])
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object" && (r as { k?: unknown }).k))
    .map((r) => ({
      k: String(r.k).trim(),
      v: num(r.v),
      i: (["T", "C", "I", "N"].includes(String(r.i)) ? r.i : "C") as Intent,
      kd: clampKd(r.kd),
      c: Number(r.c) || 0,
    }))
    .filter((r) => {
      const key = r.k.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const result: AnalyzeResult = {
    kw: String(parsed.kw ?? q),
    vol: num(parsed.vol),
    intent: (["T", "C", "I", "N"].includes(String(parsed.intent)) ? parsed.intent : "C") as Intent,
    kd: clampKd(parsed.kd),
    cpc: Number(parsed.cpc) || 0,
    trend: (["rising", "stable", "declining"].includes(String(parsed.trend))
      ? parsed.trend
      : "stable") as AnalyzeResult["trend"],
    related,
    costUsd,
  };

  if (!result.vol && result.related.length === 0) {
    throw new Error("Nothing came back for that phrase. Check the wording and try again.");
  }
  return result;
}

/**
 * Read the live results for one keyword and find where the site sits.
 *
 * This one genuinely searches, which is why it costs about three cents and why
 * its answer is a measurement rather than an estimate. Non-localised desktop
 * results: a "near me" term will rank differently for a searcher standing in
 * the client's town, and the UI says so.
 */
export async function checkRank(
  keyword: string,
  targetUrl: string,
  domain: string,
  siteId?: string | null,
): Promise<RankCheckResult> {
  const budget = await spendSummary();
  if (budget.overBudget) {
    throw new Error(
      `This month's research budget of $${budget.budgetUsd} is used up. Raise PULSE_AI_BUDGET_USD or wait for the month to roll over.`,
    );
  }

  const prompt = `Use web search to find the current Google results for this exact query: "${keyword}"

Identify the top organic results in ranked order (exclude ads and map packs). Then respond with ONLY minified JSON, no markdown fences, no commentary, in exactly this shape:
{"top":[{"pos":1,"title":"short title","url":"https://..."}],"target":{"position":null,"found_url":null,"match":"none"}}

Target page: ${targetUrl}
Target domain: ${domain}

Rules:
- "top": up to 10 organic results in order, short titles (max 8 words each).
- If the exact target page appears (ignore trailing slash, www, and http/https differences), set target.position to its 1-based rank, found_url to that URL, match "exact".
- Else if any other page on the target domain appears, use that page's rank and URL with match "domain".
- Else target.position null, found_url null, match "none".
Keep the entire response under 700 tokens.`;

  const json = await callClaude({
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
    // The dated variant with dynamic filtering: results are filtered before
    // they reach the context window, which is both more accurate and cheaper
    // than pulling whole pages in.
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
  });

  const costUsd = await recordSpend({
    feature: "rank_check",
    usage: json.usage ?? {},
    webSearches: json.usage?.server_tool_use?.web_search_requests ?? 1,
    siteId: siteId ?? null,
    detail: { keyword, target: targetUrl },
  });

  const parsed = parseLoose(textOf(json));
  if (!parsed || !Array.isArray(parsed.top)) {
    throw new Error("Could not read the results for that keyword.");
  }

  const top = (parsed.top as Array<Record<string, unknown>>).slice(0, 10).map((t) => ({
    pos: num(t.pos),
    title: String(t.title ?? "").slice(0, 90),
    url: String(t.url ?? ""),
  }));

  const tRaw = (parsed.target ?? {}) as Record<string, unknown>;
  let position = tRaw.position == null ? null : Math.max(1, num(tRaw.position));
  let match = (["exact", "domain", "none"].includes(String(tRaw.match))
    ? tRaw.match
    : "none") as RankCheckResult["match"];
  let foundUrl = tRaw.found_url ? String(tRaw.found_url) : null;

  // Safety net: the model occasionally reports "none" while the domain is
  // plainly in the list it just returned, so the list is checked directly.
  if (position == null && domain) {
    const hit = top.find((t) => {
      const h = hostOf(t.url);
      return h === domain || h.endsWith(`.${domain}`);
    });
    if (hit) {
      position = hit.pos;
      foundUrl = hit.url;
      match = "domain";
    }
  }
  if (position == null) {
    match = "none";
    foundUrl = null;
  }

  return { checkedAt: new Date().toISOString(), position, foundUrl, match, top, costUsd };
}
