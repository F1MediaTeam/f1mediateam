// Search Console history backfill.
//
// Google keeps 16 months and then deletes, permanently. Everything before that
// is unrecoverable from any source, so this runs once per client to capture it
// before it expires — and every day it isn't run, another day falls off the end.
//
// Monthly rather than daily, deliberately: daily granularity across 16 months
// would be ~480 requests per client per dimension, and the reporting question
// this exists to answer — "how does this month compare with the same month last
// year" — is a monthly one. Going forward the nightly sync writes daily rows
// into the same table, which is why granularity is stored per row.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchClientGscPages, fetchClientGscQueries } from "@/lib/connectors/gsc";
import { data } from "@/lib/data";
import type { PulseSite } from "@/lib/pulse/sites";

export interface BackfillResult {
  siteId: string;
  domain: string;
  months: number;
  queryRows: number;
  pageRows: number;
  skipped?: string;
}

/** Google's own retention edge, with a few days of slack. */
const RETENTION_DAYS = 480;
/** Terms per month per dimension. The long tail is mostly single impressions. */
const TERMS_PER_MONTH = 200;

function monthWindows(): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  const now = new Date();
  const floor = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  // Walk back month by month from the start of the current month.
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  while (cursor >= floor) {
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    out.push({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return out;
}

export async function runBackfill(site: PulseSite): Promise<BackfillResult> {
  const supabase = await createServiceClient();
  const base = { siteId: site.id, domain: site.domain, months: 0, queryRows: 0, pageRows: 0 };

  // Without a Google connection there is nothing to pull, and that is a
  // different problem from "no data" — say which.
  const connectors = await data.listConnectors(site.client_id);
  if (!connectors.some((c) => c.provider === "gsc")) {
    return { ...base, skipped: "No Search Console connection for this client." };
  }

  const windows = monthWindows();
  let queryRows = 0;
  let pageRows = 0;

  for (const w of windows) {
    // Sequential on purpose: Google rate-limits per project, and a burst of 32
    // parallel requests across five clients is how that quota gets spent.
    for (const dimension of ["query", "page"] as const) {
      let rows;
      try {
        rows =
          dimension === "query"
            ? await fetchClientGscQueries(site.client_id, w.start, w.end, TERMS_PER_MONTH)
            : await fetchClientGscPages(site.client_id, w.start, w.end, TERMS_PER_MONTH);
      } catch {
        // A single month failing shouldn't abandon the other fifteen.
        continue;
      }
      if (rows.length === 0) continue;

      const payload = rows.map((r) => ({
        site_id: site.id,
        period_start: w.start,
        granularity: "month",
        dimension,
        // The unique key includes the term, so an over-long URL would break the
        // upsert rather than simply storing awkwardly.
        term: r.key.slice(0, 500),
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr: r.ctr,
        position: r.position,
      }));

      // Idempotent: re-running the backfill refreshes rather than duplicates,
      // which matters because it will be run more than once while testing.
      await supabase
        .from("pulse_search_terms")
        .upsert(payload, { onConflict: "site_id,period_start,granularity,dimension,term" });

      if (dimension === "query") queryRows += payload.length;
      else pageRows += payload.length;
    }
  }

  return { ...base, months: windows.length, queryRows, pageRows };
}
