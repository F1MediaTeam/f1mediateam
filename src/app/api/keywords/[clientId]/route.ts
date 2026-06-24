// Live organic-keyword list for a client (SEMrush domain_organic). Admin-only.
// Called on demand from the collapsible "Organic keywords" panel so we don't
// burn SEMrush API units on every client-page load.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { fetchClientOrganicKeywords } from "@/lib/connectors/semrush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  await requireAdmin();
  const { clientId } = await params;
  try {
    const keywords = await fetchClientOrganicKeywords(clientId, 250);
    return Response.json({ keywords });
  } catch (err) {
    return Response.json(
      { keywords: [], error: err instanceof Error ? err.message : "Failed to load keywords" },
      { status: 200 },
    );
  }
}
