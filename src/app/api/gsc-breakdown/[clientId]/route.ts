// GET /api/gsc-breakdown/[clientId]?dimension=pages|queries&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns top rows from GSC's searchAnalytics endpoint with the requested
// dimension. Used by the client dashboard's Pages/Queries tabs to populate
// on-demand without baking the data into the daily snapshot store.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fetchClientGscPages, fetchClientGscQueries } from "@/lib/connectors/gsc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { clientId } = await params;

  // Admins can pull any client; clients can only pull their own.
  if (session.role !== "admin" && session.client_id !== clientId) {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const dimension = sp.get("dimension") === "pages" ? "pages" : "queries";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("from and to must be YYYY-MM-DD", { status: 400 });
  }

  try {
    const rows = dimension === "pages"
      ? await fetchClientGscPages(clientId, from, to, 25)
      : await fetchClientGscQueries(clientId, from, to, 25);
    return Response.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GSC fetch failed";
    return Response.json({ rows: [], error: msg }, { status: 200 });
  }
}
