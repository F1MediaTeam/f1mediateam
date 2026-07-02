// POST /api/monthly-report/revise
//
// Chat-driven edits to a synthesized MonthlyContent object. The Reports
// preview UI sends the current deck content + a natural-language instruction
// ("make the summary punchier", "drop slide 4's second bullet"); Claude
// returns the full revised content object plus a one-line note describing
// what changed. No data is re-pulled — this edits exactly what the admin
// is looking at, so numbers can't drift from the original synthesis.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const ANTHROPIC_MODEL = "claude-opus-4-8";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const REVISE_SYSTEM_PROMPT = `You edit the content JSON for a client-facing monthly SEO report deck (F1 Media). You receive CURRENT_CONTENT (the deck's full content object) and INSTRUCTION (what the admin wants changed).

Rules:
- Apply ONLY what the instruction asks for. Preserve every other field byte-for-byte — same keys, same order, same values.
- Never invent, alter, or estimate metrics/numbers unless the instruction explicitly supplies new values. The numbers came from real analytics data.
- Keep the same overall JSON shape. Do not add new top-level keys. Setting an optional section to null removes that slide.
- Tone: professional, client-friendly, confident but factual.
- If the instruction is ambiguous, make the most reasonable interpretation and say what you assumed in the note.
- If the instruction can't be applied to this content (e.g. references a slide that doesn't exist), return the content unchanged and explain why in the note.

Return ONLY valid JSON, no markdown fences, shaped exactly as:
{"note": "<one sentence describing what you changed>", "content": { ...the full revised content object... }}`;

interface ClaudeResp {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response("ANTHROPIC_API_KEY is not set", { status: 500 });

  let body: { content?: unknown; instruction?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const instruction = (body.instruction ?? "").trim();
  if (!body.content || typeof body.content !== "object") {
    return new Response("content object required", { status: 400 });
  }
  if (!instruction) return new Response("instruction required", { status: 400 });

  const userMsg =
    "CURRENT_CONTENT:\n" + JSON.stringify(body.content, null, 2) +
    "\n\nINSTRUCTION:\n" + instruction +
    "\n\nReturn ONLY the {note, content} JSON object.";

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      // Full deck JSON back out plus headroom — same reasoning as the
      // synthesis route's 16k.
      max_tokens: 16000,
      system: REVISE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return new Response(`Anthropic ${res.status}: ${text.slice(0, 300)}`, { status: 502 });
  }

  const json = (await res.json()) as ClaudeResp;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();

  let parsed: { note?: string; content?: MonthlyContent };
  try {
    parsed = JSON.parse(cleaned) as { note?: string; content?: MonthlyContent };
  } catch {
    const hint = json.stop_reason === "max_tokens" ? " (response was cut off)" : "";
    return new Response(`Claude response was not valid JSON${hint}.`, { status: 502 });
  }
  if (!parsed.content || typeof parsed.content !== "object") {
    return new Response("Claude response was missing the revised content.", { status: 502 });
  }

  return Response.json({
    note: parsed.note ?? "Applied your changes.",
    content: parsed.content,
  });
}
