// GET /api/cron/query-pages — pull "which page ranks for which query" only.
//
// The full scheduled run does nine collectors and takes minutes. This does one
// thing, so it can be triggered on its own and finish inside a sane timeout —
// which matters because the Keyword Lab shows a dash in the "Page Google
// ranks" column until it has run at least once, and waiting for tomorrow's
// cron to answer "which URL ranks for this keyword" is a poor answer.
//
// Auth: Authorization: Bearer <CRON_SECRET>, same as every other cron route.

import { NextRequest } from "next/server";
import { listSites, type PulseSite } from "@/lib/pulse/sites";
import { runQueryPages } from "@/lib/pulse/collectors/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const started = Date.now();
  const sites = await listSites(null);
  const ran: Array<{ domain: string; pairs: number; skipped?: string }> = [];

  for (const s of sites as PulseSite[]) {
    // Leave room to answer rather than being killed mid-write.
    if (Date.now() - started > 240_000) break;
    try {
      const r = await runQueryPages(s);
      ran.push({ domain: r.domain, pairs: r.pairs, skipped: r.skipped });
    } catch (err) {
      ran.push({
        domain: s.domain,
        pairs: 0,
        skipped: err instanceof Error ? err.message : "failed",
      });
    }
  }

  return Response.json({ ok: true, ran, ms: Date.now() - started });
}
