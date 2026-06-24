// Background "freshen if stale" sync for a single client.
// Called from the admin client profile page on mount — non-blocking, idempotent.
// Skips connectors that synced within STALE_AFTER_MS to avoid hammering Google.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { getConnector } from "@/lib/connectors";

export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(request: NextRequest) {
  await requireAdmin();
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) return new Response("client_id required", { status: 400 });

  const tokens = await data.listConnectors(clientId);
  const results: Array<{ provider: string; status: string }> = [];

  for (const token of tokens) {
    // Semrush burns API units per call — exempt it from on-visit freshen so
    // we only ever sync once a day via the cron. Manual reconnect still works.
    if (token.provider === "semrush") {
      results.push({ provider: token.provider, status: "cron-only" });
      continue;
    }
    const last = token.last_synced_at ? new Date(token.last_synced_at).getTime() : 0;
    if (Date.now() - last < STALE_AFTER_MS) {
      results.push({ provider: token.provider, status: "fresh" });
      continue;
    }
    const connector = getConnector(token.provider);
    if (!connector) continue;
    try {
      const { snapshots, effectiveAsOf } = await connector.sync({ clientId, token });
      await data.writeSnapshots(snapshots.map((s) => ({ ...s, client_id: clientId })));
      await data.touchConnectorSync(token.id, `ok @ ${effectiveAsOf} (${snapshots.length} rows)`);
      results.push({ provider: token.provider, status: "synced" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      await data.touchConnectorSync(token.id, `error: ${msg}`);
      results.push({ provider: token.provider, status: `error: ${msg}` });
    }
  }

  return Response.json({ ran_at: new Date().toISOString(), results });
}
