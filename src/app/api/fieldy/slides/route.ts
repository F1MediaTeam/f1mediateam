// POST /api/fieldy/slides
// body: { ids: string[], from?: YYYY-MM-DD, to?: YYYY-MM-DD, deckTitle?: string }
//
// Takes selected conversation IDs, pulls the full transcripts back through
// the Fieldy connector, sends them to Claude with a tight slide-shaping
// prompt, and returns structured slide JSON the browser can preview + copy
// to Gamma. Admin-only.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { fieldyConfigured, fieldyMeetingsInWindow } from "@/lib/connectors/fieldy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_MODEL = "claude-opus-4-7";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a slide-shaping assistant for F1 Media Team.

Input: one or more meeting transcripts (Fieldy conversation memory).
Output: a clean slide deck as STRICT JSON — no prose outside the JSON, no
markdown fences, no preamble.

Schema:
{
  "deckTitle": string,
  "slides": [
    { "title": string, "bullets": string[] }
  ]
}

Rules:
- Lead with the most important decisions, commitments, and outcomes.
- Each slide title is a short phrase (≤ 7 words).
- 3–6 bullets per slide. Each bullet is a complete, scannable thought (≤ 18 words).
- Aim for 6–12 slides depending on the source density.
- Always include a "Next steps" slide at the end with concrete owners + deadlines
  when the transcript names them; if not, list the action items verbatim.
- Don't fabricate names, numbers, or commitments that aren't in the transcripts.
- Don't include filler like "Introductions" or "Small talk" unless it materially shaped the meeting.
- Plain text only — no emoji, no markdown formatting characters inside titles/bullets.

Return the JSON object only.`;

interface ClaudeResp {
  content: Array<{ type: string; text?: string }>;
}

async function callClaude(payload: string): Promise<{ deckTitle: string; slides: { title: string; bullets: string[] }[] }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set on this environment.");

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: payload }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ClaudeResp;
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Claude response was not valid JSON. First 200 chars: " + cleaned.slice(0, 200));
  }
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  if (!fieldyConfigured()) {
    return Response.json({ error: "FIELDY_API_KEY is not set." }, { status: 200 });
  }

  let body: { ids?: string[]; from?: string; to?: string; deckTitle?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === "string" && s.length > 0) : [];
  if (ids.length === 0) {
    return Response.json({ error: "Pick at least one conversation." }, { status: 400 });
  }

  // Pull the same window the panel listed from — we then filter by selected
  // IDs. Default to a wide window so a stale list still resolves.
  const now = new Date();
  const wide = new Date(now);
  wide.setUTCDate(wide.getUTCDate() - 180);
  const from = body.from || wide.toISOString().slice(0, 10);
  const to = body.to || now.toISOString().slice(0, 10);

  let notes;
  try {
    notes = await fieldyMeetingsInWindow(from, to, 100);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to reach Fieldy" }, { status: 200 });
  }

  const selected = notes.filter((n) => ids.includes(n.id));
  if (selected.length === 0) {
    return Response.json({ error: "Selected conversations weren't found in the current window — widen the date range." }, { status: 200 });
  }

  const payload =
    (body.deckTitle ? `Working deck title (you may refine it): ${body.deckTitle}\n\n` : "") +
    "Transcripts to convert into slides:\n\n" +
    selected
      .map(
        (n) =>
          `# ${n.title}${n.startTime ? `  (${n.startTime.slice(0, 10)})` : ""}\n` +
          (n.summary ? `Summary:\n${n.summary}\n\n` : "") +
          (n.content ? `Notes:\n${n.content}\n\n` : ""),
      )
      .join("\n---\n\n");

  try {
    const deck = await callClaude(payload);
    return Response.json({
      deck,
      sourceCount: selected.length,
      sourceIds: selected.map((n) => n.id),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Slide generation failed" }, { status: 200 });
  }
}
