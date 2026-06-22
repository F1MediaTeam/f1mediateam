// AI-driven narrative writer for the client meeting deck.
//
// Given a client + date window, gathers everything we know about that client's
// last period (GSC/GA snapshots, posted content cards, drafts, open tasks)
// and asks Claude to produce a JSON object whose keys map 1:1 to the slide
// sections the existing PDF/Gamma renderers already expect. The route handler
// stays thin — it just calls this and feeds the result into the same builders
// the manual-paste form used.

import type { Client } from "@/lib/types";
import { data } from "@/lib/data";

const ANTHROPIC_MODEL = "claude-opus-4-7";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export interface NarrativeSections {
  social: string;
  flyers: string;
  insights: string;
  backlinks: string;
  pages: string;
  ranking: string;
  recommendation: string;
  gscNote: string;
  whatsNext: string[];   // bullets — one item per line in the rendered slide
}

export interface NarrativeOutput {
  sections: NarrativeSections;
  gsc: {
    imprPrev: string;
    imprCur: string;
    clicks: string;
    avgPosition?: string;
  };
  draftPages: string[];   // real URLs of proposed/pending content
}

export interface RangeWindow {
  fromIso: string;        // YYYY-MM-DD
  toIso: string;
  prevFromIso: string;    // same length window immediately before
  prevToIso: string;
  label: string;          // e.g. "Last 28 days"
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------------- formatting helpers ----------------

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 || n <= -10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

function sumWindow(
  series: { captured_at: string; value: number }[],
  from: string,
  to: string,
): number {
  return series
    .filter((s) => s.captured_at >= from && s.captured_at <= to)
    .reduce((a, s) => a + Number(s.value), 0);
}

function avgWindow(
  series: { captured_at: string; value: number }[],
  from: string,
  to: string,
): number | null {
  const rows = series.filter((s) => s.captured_at >= from && s.captured_at <= to);
  if (rows.length === 0) return null;
  return rows.reduce((a, s) => a + Number(s.value), 0) / rows.length;
}

// ---------------- data gathering ----------------

interface GatheredFacts {
  client: Client;
  window: RangeWindow;
  gscImprCur: number;
  gscImprPrev: number;
  gscClicksCur: number;
  gscClicksPrev: number;
  avgPositionCur: number | null;
  avgPositionPrev: number | null;
  postedInWindow: Array<{ title: string; body: string | null; link: string | null; created_at: string }>;
  pipeline: Array<{ title: string; body: string | null; link: string | null; stage: string }>;
  openTasks: Array<{ title: string; due: string | null }>;
}

async function gatherFacts(client: Client, window: RangeWindow): Promise<GatheredFacts> {
  const [impr, clicks, position, content, tasks] = await Promise.all([
    data.listSnapshots({ clientId: client.id, metric: "impressions" }),
    data.listSnapshots({ clientId: client.id, metric: "clicks" }),
    data.listSnapshots({ clientId: client.id, metric: "avg_position" }),
    data.listContent({ clientId: client.id }),
    data.listTasks({ clientId: client.id, status: "open" }),
  ]);

  const postedInWindow = content
    .filter((c) => c.stage === "posted")
    .filter((c) => {
      const day = c.created_at.slice(0, 10);
      return day >= window.fromIso && day <= window.toIso;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12)
    .map((c) => ({ title: c.title, body: c.body, link: c.link, created_at: c.created_at }));

  const pipeline = content
    .filter((c) => c.stage !== "posted")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10)
    .map((c) => ({ title: c.title, body: c.body, link: c.link, stage: c.stage }));

  return {
    client,
    window,
    gscImprCur: sumWindow(impr, window.fromIso, window.toIso),
    gscImprPrev: sumWindow(impr, window.prevFromIso, window.prevToIso),
    gscClicksCur: sumWindow(clicks, window.fromIso, window.toIso),
    gscClicksPrev: sumWindow(clicks, window.prevFromIso, window.prevToIso),
    avgPositionCur: avgWindow(position, window.fromIso, window.toIso),
    avgPositionPrev: avgWindow(position, window.prevFromIso, window.prevToIso),
    postedInWindow,
    pipeline,
    openTasks: tasks
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
      .slice(0, 10)
      .map((t) => ({ title: t.title, due: t.due_date })),
  };
}

// ---------------- prompt assembly ----------------

const SYSTEM_PROMPT = `You are a senior SEO/marketing strategist at F1 Media Team writing the
narrative copy for a client's monthly review presentation. Your voice mirrors
how an account lead talks to their client: clear, confident, professional,
plain-spoken. No hype, no buzzwords, no emoji. Reference the client by name.
Make every claim grounded in the data you are given — never invent links,
numbers, or work that wasn't done.

You will return strict JSON matching the schema in the user message. No prose
outside the JSON. No code fences.`;

function userPrompt(facts: GatheredFacts): string {
  const w = facts.window;
  const gscImprDelta = facts.gscImprPrev === 0
    ? "no prior comparison"
    : `${(((facts.gscImprCur - facts.gscImprPrev) / facts.gscImprPrev) * 100).toFixed(1)}% vs prior period`;
  const gscClicksDelta = facts.gscClicksPrev === 0
    ? "no prior comparison"
    : `${(((facts.gscClicksCur - facts.gscClicksPrev) / facts.gscClicksPrev) * 100).toFixed(1)}% vs prior period`;
  const posDelta =
    facts.avgPositionCur != null && facts.avgPositionPrev != null
      ? `from ${facts.avgPositionPrev.toFixed(1)} → ${facts.avgPositionCur.toFixed(1)} (lower = better)`
      : "n/a";

  const lines: string[] = [];
  lines.push(`Client: ${facts.client.company_name}`);
  lines.push(`Window: ${w.label} (${w.fromIso} → ${w.toIso})`);
  lines.push("");
  lines.push("HEADLINE METRICS");
  lines.push(`- Impressions: ${compact(facts.gscImprCur)} this period vs ${compact(facts.gscImprPrev)} prior — ${gscImprDelta}`);
  lines.push(`- Organic clicks: ${compact(facts.gscClicksCur)} this period vs ${compact(facts.gscClicksPrev)} prior — ${gscClicksDelta}`);
  lines.push(`- Avg. ranking position: ${posDelta}`);
  lines.push("");
  if (facts.postedInWindow.length) {
    lines.push("CONTENT POSTED THIS PERIOD");
    facts.postedInWindow.forEach((c) => {
      const day = c.created_at.slice(0, 10);
      lines.push(`- ${day} · ${c.title}${c.link ? ` (${c.link})` : ""}`);
      if (c.body) lines.push(`    ${c.body.slice(0, 200)}`);
    });
  } else {
    lines.push("CONTENT POSTED THIS PERIOD: none on record.");
  }
  lines.push("");
  if (facts.pipeline.length) {
    lines.push("DRAFTS / PIPELINE (proposed or pending approval)");
    facts.pipeline.forEach((c) => {
      lines.push(`- [${c.stage}] ${c.title}${c.link ? ` (${c.link})` : ""}`);
    });
  }
  lines.push("");
  if (facts.openTasks.length) {
    lines.push("OPEN INTERNAL TASKS");
    facts.openTasks.forEach((t) => {
      lines.push(`- ${t.title}${t.due ? ` (due ${t.due})` : ""}`);
    });
  }
  lines.push("");

  lines.push(`Write the meeting narrative for ${facts.client.company_name}. Match this voice
example (anonymized from a recent deck):

  "We've continued consistent posting of flyers across platforms and are
  actively sharing content on X (Twitter), which remains a strong channel for
  real-time indexing. We've also revisited the Insights section, optimizing
  the articles with beneficial internal and external linking that strengthens
  the authority of both the articles and the site. From the clicks and
  impressions we saw on the homestead-exemption page, we've been drafting
  similar pages for each state to expand visibility."

Return STRICT JSON, no markdown, matching this exact shape:

{
  "social": "1–3 paragraphs about posting cadence, platforms, podcast/YouTube work, anything content-distribution related. Plain-text paragraphs separated by a blank line.",
  "flyers": "1 short paragraph introducing what the flyer set demonstrates (don't list URLs — the slide shows them visually).",
  "insights": "1–3 paragraphs about insights-page work, article updates, internal linking. Reference real URLs from the posted/draft lists above when natural.",
  "backlinks": "1–3 paragraphs about backlink work, photo/page refresh efforts, removing toxic links.",
  "pages": "1–3 paragraphs about page-level optimization, technical fixes, recent rebuilds. Mention any out-of-scope work as a callout if there are open tasks suggesting it.",
  "ranking": "1–2 paragraphs framing the ranking movement honestly. If positions improved, say so. If volatile, name that. Mention that rankings shift with the algorithm.",
  "recommendation": "1 paragraph with a single concrete recommendation for next period — typically a templated page expansion or a new content cluster grounded in what performed well.",
  "gscNote": "1 paragraph interpreting the impressions/clicks numbers in context. Reference the actual numbers from HEADLINE METRICS above.",
  "whatsNext": ["3–5 short bullet phrases for next-period focus. Each item is one phrase. Action-oriented.", "..."]
}

Rules:
- Never invent a URL that isn't in the data above.
- Numbers in the gscNote must match HEADLINE METRICS exactly (use the compact
  forms like ${compact(facts.gscImprCur)} when referenced).
- If a section has no data to discuss (e.g. nothing posted), still write a
  short honest paragraph acknowledging the gap — do not fabricate work.
- Use the client's name (${facts.client.company_name}) naturally but sparingly.`);

  return lines.join("\n");
}

// ---------------- Anthropic call ----------------

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

async function callClaude(facts: GatheredFacts): Promise<NarrativeSections> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to the Vercel project's environment variables.");
  }

  const messages: AnthropicMessage[] = [{ role: "user", content: userPrompt(facts) }];

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2400,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${detail || res.statusText}`);
  }

  const body = (await res.json()) as AnthropicResponse;
  const text = body.content.map((b) => b.text ?? "").join("").trim();

  // Strip any accidental code fences just in case.
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned non-JSON output. First 200 chars: ${cleaned.slice(0, 200)}`);
  }

  const out = parsed as Partial<NarrativeSections>;
  return {
    social: String(out.social ?? "").trim(),
    flyers: String(out.flyers ?? "").trim(),
    insights: String(out.insights ?? "").trim(),
    backlinks: String(out.backlinks ?? "").trim(),
    pages: String(out.pages ?? "").trim(),
    ranking: String(out.ranking ?? "").trim(),
    recommendation: String(out.recommendation ?? "").trim(),
    gscNote: String(out.gscNote ?? "").trim(),
    whatsNext: Array.isArray(out.whatsNext) ? out.whatsNext.map((b) => String(b).trim()).filter(Boolean) : [],
  };
}

// ---------------- public entry point ----------------

export async function generateNarrative(
  client: Client,
  window: RangeWindow,
): Promise<NarrativeOutput> {
  const facts = await gatherFacts(client, window);
  const sections = await callClaude(facts);

  const draftPages = facts.pipeline
    .map((p) => p.link)
    .filter((l): l is string => Boolean(l && /^https?:\/\//.test(l)));

  return {
    sections,
    gsc: {
      imprPrev: compact(facts.gscImprPrev),
      imprCur: compact(facts.gscImprCur),
      clicks: compact(facts.gscClicksCur),
      avgPosition: facts.avgPositionCur != null ? facts.avgPositionCur.toFixed(1) : undefined,
    },
    draftPages,
  };
}

// ---------------- range helpers ----------------

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function resolveRange(
  preset: string,
  customFrom: string | null,
  customTo: string | null,
  todayIso: string,
): RangeWindow {
  const today = todayIso;
  let fromIso: string;
  let toIso: string;
  let label: string;

  switch (preset) {
    case "7d":
      fromIso = shiftDays(today, -6);
      toIso = today;
      label = "Last 7 days";
      break;
    case "90d":
      fromIso = shiftDays(today, -89);
      toIso = today;
      label = "Last 90 days";
      break;
    case "ytd": {
      const y = today.slice(0, 4);
      fromIso = `${y}-01-01`;
      toIso = today;
      label = "Year to date";
      break;
    }
    case "custom":
      fromIso = customFrom || shiftDays(today, -27);
      toIso = customTo || today;
      label = `${fromIso} → ${toIso}`;
      break;
    case "28d":
    default:
      fromIso = shiftDays(today, -27);
      toIso = today;
      label = "Last 28 days";
      break;
  }

  // Previous comparable window (same length, immediately preceding).
  const fromD = new Date(fromIso + "T00:00:00Z");
  const toD = new Date(toIso + "T00:00:00Z");
  const lengthDays = Math.round((toD.getTime() - fromD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevToIso = shiftDays(fromIso, -1);
  const prevFromIso = shiftDays(prevToIso, -(lengthDays - 1));

  return { fromIso, toIso, prevFromIso, prevToIso, label };
}
