// Keyword Lab — free by construction.
//
// There is deliberately no Anthropic call in this file, and no key is read
// anywhere in the module. That is the guarantee: Keyword Lab cannot bill
// anything, because there is no code path that could.
//
// The research itself happens where it is already free — inside Claude, using
// the prompt below — and the answer is pasted back here. What the portal adds
// is the part a chat window is bad at: remembering, tracking over months, and
// putting the numbers next to everything else about that client.
//
// Positions come from Search Console, which is free and is Google's own
// measurement of where the site actually ranked.

/** The prompt to paste into Claude. Lives here so the tool and the prompt
 *  can never drift apart. */
export function researchPrompt(seed: string): string {
  const q = String(seed || "").replace(/["\\]/g, "").trim();
  return `You are the estimation engine inside an SEO keyword research tool. Analyze this seed keyword for Google US search: "${q}"

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
}

export type Intent = "T" | "C" | "I" | "N";

export interface KeywordMetrics { k: string; v: number; i: Intent; kd: number; c: number }

export interface Analysis {
  kw: string;
  vol: number;
  intent: Intent;
  kd: number;
  cpc: number;
  trend: "rising" | "stable" | "declining";
  related: KeywordMetrics[];
}

const num = (x: unknown) => Math.max(0, Math.round(Number(x) || 0));
const clampKd = (x: unknown) => Math.min(100, num(x));

export function resolveTarget(raw: string | null | undefined, domain: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return `https://${domain}/`;
  if (s.startsWith("/")) return `https://${domain}${s}`;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/**
 * Read pasted JSON that may be fenced, prefixed with commentary, or cut off.
 *
 * People paste whatever the chat gave them, including the sentence before the
 * JSON and sometimes a response that ran out of room mid-array. Throwing away
 * fifteen good keywords because the sixteenth lost its closing brace helps
 * nobody, so a truncated array is salvaged at the last complete element.
 */
function parseLoose(text: string): Record<string, unknown> | null {
  const clean = text.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    /* keep going */
  }
  const start = clean.indexOf("{");
  if (start >= 0) {
    const body = clean.slice(start);
    try {
      return JSON.parse(body);
    } catch {
      /* keep going */
    }
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

/** Turn a pasted response into the shape the table renders. */
export function parseAnalysis(pasted: string): { result: Analysis | null; error: string | null } {
  if (!pasted.trim()) return { result: null, error: "Paste the response from Claude first." };

  const parsed = parseLoose(pasted);
  if (!parsed) {
    return {
      result: null,
      error: "That does not look like the JSON response. Copy everything Claude replied with, including the opening brace.",
    };
  }

  const kw = String(parsed.kw ?? "").trim();
  if (!kw) return { result: null, error: "The response has no keyword in it — check you copied the whole reply." };

  const seen = new Set([kw.toLowerCase()]);
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

  const result: Analysis = {
    kw,
    vol: num(parsed.vol),
    intent: (["T", "C", "I", "N"].includes(String(parsed.intent)) ? parsed.intent : "C") as Intent,
    kd: clampKd(parsed.kd),
    cpc: Number(parsed.cpc) || 0,
    trend: (["rising", "stable", "declining"].includes(String(parsed.trend))
      ? parsed.trend
      : "stable") as Analysis["trend"],
    related,
  };

  if (!result.vol && result.related.length === 0) {
    return { result: null, error: "The response parsed but contained no numbers. Try running the prompt again." };
  }
  return { result, error: null };
}
