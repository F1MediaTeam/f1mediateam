// GET /api/fieldy/conversations?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&client=Name
//
// Server-side proxy that lists Fieldy conversations in a window. The
// Fieldy API key never leaves this function — the browser only sees the
// trimmed shape: { id, title, date, summary, keywords, hasContent,
// matchesClient }. `client` (a company name) marks which conversations
// name-match that client so the picker can scope its list; all rows are
// still returned because the name matcher is fuzzy and a client meeting
// doesn't always say the client's name out loud.
// Admin-only.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fieldyConfigured, fieldyMeetingsInWindow } from "@/lib/connectors/fieldy";
import { meetingMatchesClient } from "@/lib/deck/ai-narrative";

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
  const clientName = (url.searchParams.get("client") ?? "").trim();

  try {
    const notes = await fieldyMeetingsInWindow(from, to, limit);
    const conversations = notes.map((n) => ({
      id: n.id,
      title: n.title,
      date: n.startTime,
      summary: n.summary,
      keywords: n.keywords,
      hasContent: Boolean(n.content),
      matchesClient: clientName ? meetingMatchesClient(n, clientName) : undefined,
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
