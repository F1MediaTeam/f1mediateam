// POST /api/monthly-report/revise
//
// Chat-driven edits to a synthesized MonthlyContent object. The Reports
// preview UI sends the current deck content + a natural-language instruction
// ("make the summary punchier", "drop slide 4's second bullet"); Claude
// returns the full revised content object plus a one-line note describing
// what changed. No data is re-pulled — this edits exactly what the admin
// is looking at, so numbers can't drift from the original synthesis.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const ANTHROPIC_MODEL = "claude-opus-4-8";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const REVISE_SYSTEM_PROMPT = `You edit the content JSON for a client-facing SEO report deck (F1 Media). You receive CURRENT_CONTENT (the deck's full content object), INSTRUCTION (what the admin wants changed), and possibly attached IMAGES.

Rules:
- Apply ONLY what the instruction asks for. Preserve every other field byte-for-byte — same keys, same order, same values.
- Never invent, alter, or estimate metrics/numbers unless the instruction (or an attached image) explicitly supplies new values. The numbers came from real analytics data.
- Keep the same overall JSON shape. Do not add new top-level keys. Setting an optional section to null removes that slide.
- IMAGES: the admin may attach screenshots or photos — a screenshot of a slide they want changed, a screenshot of data/numbers to incorporate, a reference for wording, or a photo of handwritten notes. Read them carefully and treat their contents as part of the instruction. If an image contains data the admin asks to include, transcribe it faithfully — never estimate what you can't read clearly; say so in the note instead.
- Tone: professional, client-friendly, confident but factual.
- If the instruction is ambiguous, make the most reasonable interpretation and say what you assumed in the note.
- If the instruction can't be applied to this content (e.g. references a slide that doesn't exist), return the content unchanged and explain why in the note.

Return ONLY valid JSON, no markdown fences, shaped exactly as:
{"note": "<one sentence describing what you changed>", "content": { ...the full revised content object... }}`;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGES = 5;
// Total base64 across all images. Keeps the request body under Vercel's
// 4.5 MB function-payload cap (deck JSON included) and each image under
// Anthropic's per-image limit. The client downscales before sending; this
// is the backstop for other callers.
const MAX_TOTAL_IMAGE_CHARS = 3_000_000;

interface ClaudeResp {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

export async function POST(request: NextRequest) {
  // fetch()-only endpoint: 401 beats requireAdmin()'s redirect-to-login here.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response("ANTHROPIC_API_KEY is not set", { status: 500 });

  let body: {
    content?: unknown;
    instruction?: string;
    images?: Array<{ media_type?: string; data?: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const instruction = (body.instruction ?? "").trim();
  if (!body.content || typeof body.content !== "object") {
    return new Response("content object required", { status: 400 });
  }
  if (!instruction && !(body.images ?? []).length) {
    return new Response("instruction required", { status: 400 });
  }

  const userText =
    "CURRENT_CONTENT:\n" + JSON.stringify(body.content, null, 2) +
    "\n\nINSTRUCTION:\n" + (instruction || "(see attached images)") +
    "\n\nReturn ONLY the {note, content} JSON object.";

  // Attached screenshots/photos become vision blocks ahead of the text.
  const validImages = (body.images ?? [])
    .filter((img) => img && typeof img.data === "string" && img.data.length > 0)
    .filter((img) => ALLOWED_IMAGE_TYPES.has(img.media_type ?? ""))
    .slice(0, MAX_IMAGES);
  const totalImageChars = validImages.reduce((a, img) => a + (img.data?.length ?? 0), 0);
  if (totalImageChars > MAX_TOTAL_IMAGE_CHARS) {
    return new Response(
      "Attached images are too large in total — try fewer or smaller screenshots.",
      { status: 413 },
    );
  }
  const imageBlocks = validImages.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.media_type, data: img.data },
  }));

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
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text" as const, text: userText }],
        },
      ],
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
