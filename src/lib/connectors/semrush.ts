// Semrush connector — API-key auth (paste key from My Profile → API Units).
// Endpoint we use: domain_ranks_history — historical monthly snapshots of
//   organic keyword count, estimated organic traffic, paid keyword count,
//   estimated paid traffic, etc.  ~10 units per row returned (Business plan).
// Docs: https://www.semrush.com/api-analytics/

import type { Connector, SyncContext, SyncResult } from "./index";
import { data } from "@/lib/data";

const BASE = "https://api.semrush.com/";

// Columns we request, in order. Semrush honors this order in its response but
// labels the header with display names ("Date", "Organic Keywords", …) rather
// than these short codes — so we parse by POSITION, not by header name.
const EXPORT_COLUMNS = ["Dt", "Or", "Ot", "Oc", "Ad", "At", "Ac"] as const;

interface DomainHistRow {
  Dt: string; // YYYYMMDD15  (Semrush stamps each monthly snapshot)
  Or: number; // Organic keywords
  Ot: number; // Organic traffic (est.)
  Oc: number; // Organic cost (est. $)
  Ad: number; // Paid keywords
  At: number; // Paid traffic (est.)
  Ac: number; // Paid cost (est. $)
}

/** Strip protocol/path so "https://www.example.com/" → "example.com". */
function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
}

function parseSemrushDate(raw: string): string {
  // "20240115" → "2024-01-15"
  if (raw.length < 8) return new Date().toISOString().slice(0, 10);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * Semrush returns `;`-delimited CSV. The first row is a header, but it uses
 * human-readable labels ("Date", "Organic Keywords", …) instead of the short
 * codes we requested — so we ignore the header and map each data row by
 * POSITION against EXPORT_COLUMNS (Semrush returns columns in request order).
 * Empty bodies and "ERROR ..." strings are also possible.
 */
function parseSemrushCsv(text: string): DomainHistRow[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("ERROR")) return [];
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const cell: Record<string, string> = {};
    EXPORT_COLUMNS.forEach((code, i) => (cell[code] = cols[i] ?? ""));
    return {
      Dt: cell.Dt,
      Or: Number(cell.Or || 0),
      Ot: Number(cell.Ot || 0),
      Oc: Number(cell.Oc || 0),
      Ad: Number(cell.Ad || 0),
      At: Number(cell.At || 0),
      Ac: Number(cell.Ac || 0),
    };
  });
}

export async function testSemrushKey(apikey: string): Promise<{ ok: true; remainingUnits: number | null }> {
  // Cheapest call — domain_ranks for a single domain just to confirm auth works.
  const params = new URLSearchParams({
    type: "domain_ranks",
    domain: "google.com",
    database: "us",
    export_columns: "Dn,Rk",
    key: apikey,
  });
  const res = await fetch(`${BASE}?${params.toString()}`);
  const text = await res.text();
  if (text.startsWith("ERROR")) throw new Error(`Semrush rejected key: ${text.trim()}`);
  const remaining = Number(res.headers.get("X-Units-Limit") ?? "") || null;
  return { ok: true, remainingUnits: remaining };
}

export const semrushConnector: Connector = {
  provider: "semrush",
  label: "Semrush",

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const creds = await data.getConnectorWithCredentials(ctx.token.id);
    if (!creds?.access_token) throw new Error("Semrush API key missing");
    const apikey = creds.access_token;
    const domain = creds.account_label;
    if (!domain) throw new Error("Semrush domain missing — reconnect with the client's domain");

    const params = new URLSearchParams({
      // Semrush v3 renamed the historical endpoint — singular "rank", not "ranks".
      type: "domain_rank_history",
      domain,
      database: "us",
      export_columns: EXPORT_COLUMNS.join(","),
      key: apikey,
    });
    const res = await fetch(`${BASE}?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Semrush domain_rank_history failed (${res.status}): ${text}`);
    }
    const rows = parseSemrushCsv(await res.text());

    const snapshots: SyncResult["snapshots"] = [];
    for (const row of rows) {
      const captured_at = parseSemrushDate(row.Dt);
      const meta = { domain, source_provider: "semrush" };
      snapshots.push({ source: "semrush", metric: "semrush_organic_keywords", value: row.Or, captured_at, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_organic_traffic",  value: row.Ot, captured_at, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_organic_cost",     value: row.Oc, captured_at, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_paid_keywords",    value: row.Ad, captured_at, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_paid_traffic",     value: row.At, captured_at, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_paid_cost",        value: row.Ac, captured_at, is_baseline: false, meta });
    }
    const effectiveAsOf = snapshots.length
      ? snapshots[snapshots.length - 1].captured_at
      : new Date().toISOString().slice(0, 10);
    // SEMrush returns the full monthly history on every call, so replace the
    // client's existing SEMrush rows rather than accumulating — this purges any
    // stale rows a past parsing bug may have written.
    return { snapshots, effectiveAsOf, replaceSource: "semrush" };
  },
};

export { normalizeDomain };
