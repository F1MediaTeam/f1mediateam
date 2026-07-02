// GET /api/meetings/[id]/deck-pdf
//
// Renders the meeting's deck — the saved customized deck when one exists,
// otherwise the live auto-generated one — as a landscape PDF attachment.
// This is the "Download" behind the deck editor, so what the admin previewed
// (edits, image slides, reordering) is exactly what exports.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { buildDeck, type Slide } from "@/lib/slides";
import { deckToPdfSlides } from "@/lib/deck-to-pdf";
import { buildPresentationPdf } from "@/lib/presentation-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const meeting = await data.getMeeting(id);
  if (!meeting) return new Response("Meeting not found", { status: 404 });
  const client = await data.getClient(meeting.client_id);
  if (!client) return new Response("Client not found", { status: 404 });

  const deck =
    (meeting.deck as Slide[] | null | undefined) ?? (await buildDeck({ meeting, client }));

  const pdf = await buildPresentationPdf({
    companyName: client.company_name,
    accent: "#3F8E84",
    brandFooter: "F1 Media Team",
    slides: deckToPdfSlides(deck),
  });

  const filename = `${client.company_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-meeting-deck.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
