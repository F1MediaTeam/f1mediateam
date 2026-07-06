// GET /api/fieldy/conversations?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50
//
// Server-side proxy that lists ALL Fieldy conversations in a window. The
// Fieldy API key never leaves this function — the browser only sees the
// trimmed shape: { id, title, date, summary, keywords, hasContent }.
// Admin-only.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fieldyConfigured, fieldyMeetingsInWindow } from "@/lib/connectors/fieldy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  // fetch()-only endpoint: 401 beats requireAdmin()'s redirect-to-login here.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!fieldyConfigured()) {
    return Response.json({ error: "FIELDY_API_KEY is not set on this environment." }, { status: 200 });
  }

  const url = request.nextUrl;
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);

  const from = url.searchParams.get("from") || isoDate(defaultFrom);
  const to = url.searchParams.get("to") || isoDate(now);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 100);

  try {
    const notes = await fieldyMeetingsInWindow(from, to, limit);
    const conversations = notes.map((n) => ({
      id: n.id,
      title: n.title,
      date: n.startTime,
      summary: n.summary,
      keywords: n.keywords,
      hasContent: Boolean(n.content),
    }));
    return Response.json({
      window: { from, to },
      count: conversations.length,
      conversations,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to reach Fieldy" },
      { status: 200 },
    );
  }
}
