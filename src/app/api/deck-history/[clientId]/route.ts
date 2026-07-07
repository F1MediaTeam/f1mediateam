// GET /api/deck-history/[clientId]        → recent decks (metadata only)
// GET /api/deck-history/[clientId]?deck=… → one deck's full content JSON
//
// Backs the Deck Studio's "Past decks" rail: every generated .pptx also
// persists its editable MonthlyContent (deck_reports, 0013), so a past deck
// can be reopened in the preview and re-rendered without a fresh synthesis.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  // fetch()-only endpoint: 401 beats requireAdmin()'s redirect here.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  const { clientId } = await params;

  const deckId = request.nextUrl.searchParams.get("deck");
  if (deckId) {
    const deck = await data.getDeckReport(deckId);
    if (!deck || deck.client_id !== clientId) {
      return new Response("Deck not found", { status: 404 });
    }
    return Response.json({ deck });
  }

  const decks = await data.listDeckReports(clientId, 12);
  return Response.json({ decks });
}
