// Live organic-keyword list for a client (SEMrush domain_organic). Auth: a
// client can only fetch their own clientId; admins can fetch any. Called on
// demand from the collapsible "Organic keywords" panel so we don't burn
// SEMrush API units on every client-page load.

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { fetchClientOrganicKeywords } from "@/lib/connectors/semrush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await requireAuth();
  const { clientId } = await params;
  // Clients can only read their own keywords. Admins (including admins
  // currently impersonating a client) bypass.
  const isAdmin = session.role === "admin" || !!session.actual_admin_id;
  if (!isAdmin && session.client_id !== clientId) {
    return Response.json({ keywords: [], error: "Not authorized" }, { status: 200 });
  }
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
