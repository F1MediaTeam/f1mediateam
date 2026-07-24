// Auto-populate a client's Semrush data the first time their profile is
// opened. Called on mount from the client page when the deep-data section is
// empty. Deliberately pulls ONLY when there's no data yet — a Semrush deep
// pull burns ~100k+ API units, so it must not run on every visit (the
// per-connector /api/sync/client route exempts Semrush for the same reason).
// Refreshes after the first pull are handled by the cron.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { syncSemrushDeepPull } from "@/lib/connectors/semrush";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // fetch()-only endpoint: return 401 rather than requireAdmin()'s redirect.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const clientId = new URL(request.url).searchParams.get("client_id");
  if (!clientId) return new Response("client_id required", { status: 400 });

  // Only pull when the section is genuinely empty. If any report is already
  // stored (even an errored one), leave it alone — the cron owns refreshes.
  const existing = await data.listSemrushReports(clientId);
  if (existing.length > 0) {
    return Response.json({ pulled: false, reason: "already-populated" });
  }

  const result = await syncSemrushDeepPull(clientId);
  if (!result) {
    return Response.json({ pulled: false, reason: "not-connected" });
  }
  return Response.json({ pulled: true, reports: result.reports, units: result.units });
}
