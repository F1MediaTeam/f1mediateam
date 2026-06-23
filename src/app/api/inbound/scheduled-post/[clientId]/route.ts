// POST /api/inbound/scheduled-post/[clientId]
//
// Generic inbound webhook for any external scheduling tool (Buffer, Later,
// Hootsuite, Zapier, Make, n8n, etc.). Posts a content_cards row in the
// "proposed" stage so the client sees it in their Awaiting-Approval column
// and the notification bell counts it.
//
// Auth: shared-secret in the Authorization header.
//   Authorization: Bearer <INBOUND_WEBHOOK_SECRET>
//
// Body (JSON):
//   {
//     "caption":      "Caption / body text",      // required
//     "media_url":    "https://…/image.jpg",      // optional
//     "post_url":     "https://…",                // optional (live link)
//     "scheduled_at": "2026-06-30T10:00:00Z",     // optional
//     "source":       "buffer" | "later" | "manual" | "instagram" | …  // optional
//   }
//
// Response: { ok: true, card_id: "<uuid>" } on 200, or { error } on 4xx/5xx.

import { NextRequest } from "next/server";
import { data } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface InboundPayload {
  caption?: unknown;
  media_url?: unknown;
  post_url?: unknown;
  scheduled_at?: unknown;
  source?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  if (!expected) {
    return Response.json(
      { error: "INBOUND_WEBHOOK_SECRET is not set on this environment." },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await params;
  const client = await data.getClient(clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

  let body: InboundPayload;
  try {
    body = (await request.json()) as InboundPayload;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const caption = str(body.caption);
  if (!caption) {
    return Response.json({ error: "caption is required" }, { status: 400 });
  }
  const mediaUrl = str(body.media_url);
  const postUrl = str(body.post_url);
  const scheduledAt = str(body.scheduled_at);
  const source = str(body.source) || "scheduled";

  // Compose the card body so the detail modal can render the media preview.
  // ContentDetailModal already extracts image URLs from markdown ![]() and
  // [ATTACH:] markers, so embedding the media_url here gives us a thumbnail
  // automatically without a new schema.
  const bodyLines: string[] = [caption];
  if (mediaUrl) bodyLines.push("", `![](${mediaUrl})`);
  bodyLines.push("", `— scheduled via ${source}${scheduledAt ? ` for ${scheduledAt}` : ""}`);
  const cardBody = bodyLines.join("\n");

  // Title: first ~80 chars of the caption, single line.
  const title = caption.replace(/\s+/g, " ").slice(0, 80);

  try {
    const created = await data.createContent({
      client_id: clientId,
      title,
      body: cardBody,
      link: postUrl || null,
      created_by: null,
    });
    return Response.json({ ok: true, card_id: created?.id ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "createContent failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
