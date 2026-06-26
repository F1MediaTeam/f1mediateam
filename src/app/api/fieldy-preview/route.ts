// GET /api/fieldy-preview?client_id=...&range=28d
//
// Returns the same Fieldy data the monthly-report synthesis sees: every
// conversation in the window that mentions the client, with the title, start
// time, summary (key points), structured notes (next-steps etc.), and tags.
// Admin-only. Used by the "Preview Fieldy pull" button on /admin/reports so
// you can verify what Claude will receive as FIELDY_TRANSCRIPT before
// burning a render.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { fieldyConfigured, fieldyMeetingsInWindow } from "@/lib/connectors/fieldy";
import { resolveRange } from "@/lib/deck/ai-narrative";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  await requireAdmin();

  if (!fieldyConfigured()) {
    return Response.json({ error: "FIELDY_API_KEY is not set on this environment." }, { status: 200 });
  }

  const url = request.nextUrl;
  const clientId = url.searchParams.get("client_id") || "";
  if (!clientId) return Response.json({ error: "client_id required" }, { status: 400 });

  const client = await data.getClient(clientId);
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

  const today = todayIso("America/Los_Angeles");
  const window = resolveRange(
    url.searchParams.get("range") || "28d",
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    today,
  );

  let notes;
  try {
    notes = await fieldyMeetingsInWindow(window.fromIso, window.toIso);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fieldy fetch failed" }, { status: 200 });
  }

  // Only meetings that mention this client anywhere in their title/summary/notes.
  // (Mirrors the filter the /api/monthly-report route uses so the preview matches
  // what synthesis actually sees.)
  const needle = client.company_name.toLowerCase();
  const matched = notes.filter((n) =>
    [n.title, n.summary, n.content].some((s) => (s ?? "").toLowerCase().includes(needle)),
  );

  return Response.json({
    client: { id: client.id, name: client.company_name },
    window: { from: window.fromIso, to: window.toIso, label: window.label },
    totals: { conversationsInWindow: notes.length, mentioningClient: matched.length },
    meetings: matched.map((n) => ({
      id: n.id,
      title: n.title,
      startTime: n.startTime,
      keywords: n.keywords,
      summary: n.summary,
      content: n.content,
    })),
    unmatched: notes
      .filter((n) => !matched.includes(n))
      .map((n) => ({ id: n.id, title: n.title, startTime: n.startTime })),
  });
}
