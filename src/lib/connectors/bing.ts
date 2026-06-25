// Bing Webmaster Tools connector.
// Auth: API key (no OAuth). The user pastes a key from BWT → Settings → API Access.
// Endpoints (JSON variant):
//   GET /GetUserSites?apikey=…
//   GET /GetRankAndTrafficStats?siteUrl=…&apikey=…

import type { Connector, SyncContext, SyncResult } from "./index";
import { data } from "@/lib/data";

const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

interface RankAndTrafficRow {
  Date: string | number; // varies — see parseBingDate
  Clicks: number;
  Impressions: number;
  AvgClickPosition?: number;
  AvgImpressionPosition?: number;
}

interface SiteEntry {
  Url: string;
  IsVerified?: boolean;
}

/**
 * Bing has shipped several date formats over the years. Accept any of:
 *   - `/Date(1700000000000)/`        (legacy ASP.NET wrapper)
 *   - `/Date(1700000000000-0700)/`   (ASP.NET wrapper with a timezone offset)
 *   - `1700000000000`                (raw epoch ms)
 *   - `2026-06-19`                   (ISO date)
 *   - `2026-06-19T00:00:00Z`         (ISO datetime)
 * Throw if none parse — silently falling back to today would make every row
 * share a captured_at and the dedupe in writeSnapshots collapses the series
 * to a single point.
 */
function parseBingDate(d: string | number): string {
  if (typeof d === "number") return new Date(d).toISOString().slice(0, 10);
  const asString = String(d);
  // ASP.NET `/Date(ms)/` — Bing often appends a timezone offset, e.g.
  // `/Date(1741762080000-0700)/`. The captured group is the UTC epoch in ms;
  // the trailing offset is annotation only, so we ignore it and read the UTC
  // date (matching how the offset-less form has always been parsed).
  const aspnet = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//.exec(asString);
  if (aspnet) return new Date(parseInt(aspnet[1], 10)).toISOString().slice(0, 10);
  // ISO date / datetime
  const parsed = new Date(asString);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  // Raw epoch ms as a string
  const asNum = Number(asString);
  if (Number.isFinite(asNum)) return new Date(asNum).toISOString().slice(0, 10);
  throw new Error(`Bing returned an unrecognized Date format: ${JSON.stringify(d)}`);
}

export async function listBingSites(apikey: string): Promise<string[]> {
  const res = await fetch(`${BING_BASE}/GetUserSites?apikey=${encodeURIComponent(apikey)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bing GetUserSites failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { d?: SiteEntry[] };
  const sites = json.d ?? [];
  return sites.filter((s) => s.IsVerified !== false).map((s) => s.Url);
}

export const bingConnector: Connector = {
  provider: "bing",
  label: "Bing Webmaster Tools",

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const creds = await data.getConnectorWithCredentials(ctx.token.id);
    // Per-client key wins; env var is the default for clients without one.
    // This lets us use one agency key for most clients, while clients whose
    // sites are verified under a different Bing account use their own key.
    const apikey = creds?.access_token || process.env.BING_API_KEY;
    if (!apikey) throw new Error("Bing API key missing — set BING_API_KEY env var or paste a per-client key");
    let siteUrl = creds?.account_label ?? null;
    if (!siteUrl) {
      const sites = await listBingSites(apikey);
      siteUrl = sites[0] ?? null;
    }
    if (!siteUrl) throw new Error("No verified Bing sites available");

    const url = `${BING_BASE}/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(apikey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bing GetRankAndTrafficStats failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { d?: RankAndTrafficRow[] };

    const snapshots: SyncResult["snapshots"] = [];
    for (const row of json.d ?? []) {
      const captured_at = parseBingDate(row.Date);
      const meta = { site: siteUrl, source_provider: "bing" };
      snapshots.push({ source: "bing", metric: "bing_clicks",      value: row.Clicks,      captured_at, is_baseline: false, meta });
      snapshots.push({ source: "bing", metric: "bing_impressions", value: row.Impressions, captured_at, is_baseline: false, meta });
      if (typeof row.AvgClickPosition === "number") {
        snapshots.push({ source: "bing", metric: "bing_avg_click_position", value: row.AvgClickPosition, captured_at, is_baseline: false, meta });
      }
      if (typeof row.AvgImpressionPosition === "number") {
        snapshots.push({ source: "bing", metric: "bing_avg_impression_position", value: row.AvgImpressionPosition, captured_at, is_baseline: false, meta });
      }
    }
    const effectiveAsOf = snapshots.length
      ? snapshots[snapshots.length - 1].captured_at
      : new Date().toISOString().slice(0, 10);
    return { snapshots, effectiveAsOf };
  },
};
