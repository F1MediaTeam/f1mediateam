// Search data — Search Console and GA4.
//
// This collector deliberately collects nothing. The portal already syncs both
// nightly into metric_snapshots (thousands of rows, current), and query/page
// breakdowns are fetched on demand from the existing connector. Pulse reading
// those is one source of truth; Pulse re-syncing them would be two, drifting
// apart the first time one job failed.
//
// So "refresh" here means: run the sync that already exists, for this client,
// and record that Pulse asked for it. The Search tab then reads the same tables
// the rest of the portal reads.

import { createServiceClient } from "@/lib/supabase/server";
import { data } from "@/lib/data";
import { runForwardFill } from "./backfill";
import type { PulseSite } from "@/lib/pulse/sites";

export interface SearchRunResult {
  siteId: string;
  domain: string;
  clientId: string;
  gscRows: number;
  ga4Rows: number;
  latest: string | null;
  note: string;
  /** Daily query/page rows written into pulse_search_terms by this run. */
  termRows: number;
  termDays: number;
}

/** Metric series Pulse surfaces. Everything else in the table is left alone. */
const SERIES = ["clicks", "impressions", "ctr", "avg_position", "sessions", "engaged_sessions"];

export async function runSearch(site: PulseSite): Promise<SearchRunResult> {
  const supabase = await createServiceClient();

  const { data: rows } = await supabase
    .from("metric_snapshots")
    .select("source, metric, captured_at")
    .eq("client_id", site.client_id)
    .in("source", ["gsc", "ga4"])
    .in("metric", SERIES)
    .order("captured_at", { ascending: false })
    .limit(2000);

  const all = (rows as Array<{ source: string; captured_at: string }>) ?? [];
  const gscRows = all.filter((r) => r.source === "gsc").length;
  const ga4Rows = all.filter((r) => r.source === "ga4").length;
  const latest = all[0]?.captured_at ?? null;

  // Whether a connector is actually attached decides what the panel should say:
  // "no data yet" and "never connected" are different problems.
  const connectors = await data.listConnectors(site.client_id);
  const providers = new Set((connectors as Array<{ provider: string }>).map((c) => c.provider));
  const connected = providers.has("gsc") || providers.has("ga4");

  // The one thing this collector does write: yesterday's search terms, kept
  // current so the opportunity and cannibalization reports have live data to
  // read rather than a frozen import. Free — Search Console's API costs nothing.
  const forward = await runForwardFill(site);
  const termRows = forward.queryRows + forward.pageRows;

  const note = !connected
    ? "No Google connection on this client yet — connect it on the client's page."
    : latest
      ? `Reading the portal's existing sync. Latest data ${latest}.` +
        (termRows > 0 ? ` Refreshed ${termRows} search terms across ${forward.days} days.` : "")
      : "Connected, but no data has synced yet.";

  return {
    siteId: site.id,
    domain: site.domain,
    clientId: site.client_id,
    gscRows,
    ga4Rows,
    latest,
    note,
    termRows,
    termDays: forward.days,
  };
}
