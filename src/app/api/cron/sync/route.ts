// Scheduled connector sync.
// On Vercel: register this as a cron job in vercel.json (e.g. daily at 09:00).
// Locally: hit it from your browser to simulate.
//
// Auth: requires `CRON_SECRET` header (Vercel cron jobs send Authorization: Bearer <secret>).

import { NextRequest } from "next/server";
import { data } from "@/lib/data";
import { getConnector } from "@/lib/connectors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const clients = await data.listClients();
  const results: Array<{ client: string; provider: string; status: string }> = [];

  for (const client of clients) {
    const tokens = await data.listConnectors(client.id);
    for (const token of tokens) {
      const c = getConnector(token.provider);
      if (!c) continue;
      try {
        const { snapshots, effectiveAsOf, replaceSource } = await c.sync({ clientId: client.id, token });
        if (replaceSource && snapshots.length) await data.deleteSnapshotsBySource(client.id, replaceSource);
        await data.writeSnapshots(snapshots.map((s) => ({ ...s, client_id: client.id })));
        await data.touchConnectorSync(token.id, `ok @ ${effectiveAsOf} (${snapshots.length} rows)`);
        results.push({ client: client.company_name, provider: token.provider, status: "ok" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        await data.touchConnectorSync(token.id, `error: ${msg}`);
        results.push({ client: client.company_name, provider: token.provider, status: msg });
      }
    }
  }

  return Response.json({ ran_at: new Date().toISOString(), results });
}
