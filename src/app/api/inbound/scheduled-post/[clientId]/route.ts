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
import { data, usingMock } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The webhook runs unauthenticated (only the shared secret guards it), so a
// normal anon-key Supabase client gets blocked by RLS on the clients table.
// Use the service-role client to verify the client exists, then fall back to
// the standard adapter for the insert — RLS on content_cards allows inserts
// when called via the service role, and the mock adapter already permits
// writes without auth.
async function clientExists(clientId: string): Promise<boolean> {
  if (usingMock) {
    const c = await data.getClient(clientId);
    return Boolean(c);
  }
  try {
    const supabase = await createServiceClient();
    const { data: row } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    return Boolean(row);
  } catch {
    return false;
  }
}

// Insert via the service client so the unauthenticated webhook can write to
// content_cards (RLS would otherwise block).
async function insertCardServiceRole(input: {
  client_id: string;
  title: string;
  body: string | null;
  link: string | null;
}): Promise<{ id: string } | null> {
  if (usingMock) {
    const card = await data.createContent({
      client_id: input.client_id,
      title: input.title,
      body: input.body,
      link: input.link,
      created_by: null,
    });
    return card ? { id: card.id } : null;
  }
  const supabase = await createServiceClient();
  const { data: row, error } = await supabase
    .from("content_cards")
    .insert({
      client_id: input.client_id,
      title: input.title,
      body: input.body,
      link: input.link,
      stage: "proposed",
    })
    .select("id")
    .single();
  if (error) {
    console.error("inbound createContent failed", error);
    return null;
  }
  return row as { id: string };
}

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
  if (!(await clientExists(clientId))) {
    return Response.json({ error: "Client not found" }, { status: 404 });
  }

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
    const created = await insertCardServiceRole({
      client_id: clientId,
      title,
      body: cardBody,
      link: postUrl || null,
    });
    if (!created) {
      return Response.json({ error: "createContent failed" }, { status: 500 });
    }
    return Response.json({ ok: true, card_id: created.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "createContent failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
