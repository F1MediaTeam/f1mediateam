// Streaming chat endpoint for the admin Claude assistant.
//
// Matches the app's existing Anthropic integration (raw fetch, x-api-key) but
// streams: the browser gets tokens as they're generated instead of waiting for
// the whole reply. Admin-only. Uses Claude Opus 4.8 with adaptive thinking —
// only the visible text is forwarded to the client; thinking deltas are
// dropped, so the reply appears once reasoning finishes.

import { requireAdmin } from "@/lib/auth/session";

export const maxDuration = 60;

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are Claude, a helpful assistant embedded in the F1 Media Team admin console. F1 Media Team is an SEO and digital marketing agency that manages SEO, content, reporting, and client relationships for its clients. Be concise and practical. When asked to write copy, drafts, or marketing content, produce it directly. You do not have access to the app's data or client records unless the user pastes them in.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response("ANTHROPIC_API_KEY is not set on this environment.", { status: 500 });
  }

  let messages: ChatMessage[];
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    messages = (body.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
  } catch {
    return new Response("Bad request body.", { status: 400 });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response("Send at least one message ending with a user turn.", { status: 400 });
  }

  const upstream = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      stream: true,
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`Claude API error (${upstream.status}): ${detail || upstream.statusText}`, {
      status: 502,
    });
  }

  // Parse the Anthropic SSE stream and re-emit just the assistant text as a
  // plain text stream — the client reads it with a simple reader loop.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by blank lines; each has a `data:` line.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const json = line.slice(5).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const evt = JSON.parse(json) as {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              // Only forward visible text — ignore thinking deltas.
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch {
              // skip a malformed frame rather than aborting the whole stream
            }
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[The connection was interrupted.]"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
