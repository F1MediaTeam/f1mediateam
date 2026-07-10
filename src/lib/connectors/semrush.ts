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
    const apikey = process.env.SEMRUSH_API_KEY ?? creds?.access_token;
    if (!apikey) throw new Error("Semrush API key missing — set SEMRUSH_API_KEY env var or paste a per-client key");
    const domain = creds?.account_label;
    if (!domain) throw new Error("Semrush domain missing — reconnect with the client's domain");

    const snapshots: SyncResult["snapshots"] = [];
    const meta = { domain, source_provider: "semrush" };
    const today = new Date().toISOString().slice(0, 10);

    // --- Historical rank pull is expensive (~600 units). Only fetch on Sunday
    //     or when there's no existing history for this client. Daily syncs
    //     skip this and rely on the cheap domain_rank current call below.
    const isSunday = new Date().getUTCDay() === 0;
    const force = ctx.token.meta && ctx.token.meta.force_history === true;
    const hasHistory = await data.hasSemrushHistory(ctx.clientId);
    const wantHistory = isSunday || !hasHistory || force;
    if (wantHistory) {
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
      for (const row of rows) {
        const captured_at = parseSemrushDate(row.Dt);
        snapshots.push({ source: "semrush", metric: "semrush_organic_keywords", value: row.Or, captured_at, is_baseline: false, meta });
        snapshots.push({ source: "semrush", metric: "semrush_organic_traffic",  value: row.Ot, captured_at, is_baseline: false, meta });
        snapshots.push({ source: "semrush", metric: "semrush_organic_cost",     value: row.Oc, captured_at, is_baseline: false, meta });
        snapshots.push({ source: "semrush", metric: "semrush_paid_keywords",    value: row.Ad, captured_at, is_baseline: false, meta });
        snapshots.push({ source: "semrush", metric: "semrush_paid_traffic",     value: row.At, captured_at, is_baseline: false, meta });
        snapshots.push({ source: "semrush", metric: "semrush_paid_cost",        value: row.Ac, captured_at, is_baseline: false, meta });
      }
    }

    // --- Current (daily) snapshot via domain_rank — overwrites today's row so the
    //     dashboard reflects today's organic numbers, not last month's bucket.
    const current = await fetchDomainRankCurrent(domain, apikey);
    if (current) {
      snapshots.push({ source: "semrush", metric: "semrush_organic_keywords", value: current.Or, captured_at: today, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_organic_traffic",  value: current.Ot, captured_at: today, is_baseline: false, meta });
    }

    // --- Backlinks overview (~40 units).
    const backlinks = await fetchBacklinksOverview(domain, apikey);
    if (backlinks) {
      snapshots.push({ source: "semrush", metric: "semrush_backlinks",          value: backlinks.total,       captured_at: today, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_referring_domains",  value: backlinks.domains_num, captured_at: today, is_baseline: false, meta });
      snapshots.push({ source: "semrush", metric: "semrush_authority_score",    value: backlinks.ascore,      captured_at: today, is_baseline: false, meta });
    }

    // --- Site Audit health score — requires per-client Site Audit project.
    //     Project ID is stored on the token's meta.site_audit_project_id.
    //     If no project ID, fall back to a manual override value.
    // NOTE: the four headline gauges (site_health, visibility, ai_visibility,
    // mentions) are written under source "manual", NOT "semrush". They are
    // point-in-time values that can't be re-derived from the SEMrush history
    // API, so they must survive the Sunday replace-the-source full pull —
    // deleteSnapshotsForSource("semrush") leaves them untouched.
    const siteAuditId = readNumericMeta(ctx.token.meta, "site_audit_project_id");
    if (siteAuditId) {
      const sa = await fetchSiteAuditScore(siteAuditId, apikey);
      if (sa != null) {
        snapshots.push({ source: "manual", metric: "site_health", value: sa, captured_at: today, is_baseline: false, meta });
      }
    } else {
      const sh = readNumericMeta(ctx.token.meta, "site_health_value");
      if (sh != null) {
        snapshots.push({ source: "manual", metric: "site_health", value: sh, captured_at: today, is_baseline: false, meta: { ...meta, manual: true } });
      }
    }

    // --- Position Tracking visibility — requires per-client tracking campaign.
    //     Campaign ID stored on token.meta.position_tracking_campaign_id.
    //     If no campaign ID, fall back to a manual override value.
    const trackId = readNumericMeta(ctx.token.meta, "position_tracking_campaign_id");
    if (trackId) {
      const vis = await fetchPositionTrackingVisibility(trackId, apikey);
      if (vis != null) {
        snapshots.push({ source: "manual", metric: "visibility", value: vis, captured_at: today, is_baseline: false, meta });
      }
    } else {
      const vis = readNumericMeta(ctx.token.meta, "visibility_value");
      if (vis != null) {
        snapshots.push({ source: "manual", metric: "visibility", value: vis, captured_at: today, is_baseline: false, meta: { ...meta, manual: true } });
      }
    }

    // --- AI Visibility + Mentions: no public SEMrush API endpoint. Admin sets
    //     the value on the token meta (copied from the SEMrush One UI) and the
    //     sync writes it as today's snapshot so the dashboard stays in step.
    const aiVis = readNumericMeta(ctx.token.meta, "ai_visibility_value");
    if (aiVis != null) {
      snapshots.push({ source: "manual", metric: "ai_visibility", value: aiVis, captured_at: today, is_baseline: false, meta: { ...meta, manual: true } });
    }
    const mentions = readNumericMeta(ctx.token.meta, "mentions_value");
    if (mentions != null) {
      snapshots.push({ source: "manual", metric: "mentions", value: mentions, captured_at: today, is_baseline: false, meta: { ...meta, manual: true } });
    }

    const effectiveAsOf = snapshots.length
      ? snapshots[snapshots.length - 1].captured_at
      : today;
    // Replace the full SEMrush dataset only when we just pulled the full history
    // (Sundays, or first-time sync). On daily syncs we just upsert today's rows.
    return { snapshots, effectiveAsOf, ...(wantHistory ? { replaceSource: "semrush" as const } : {}) };
  },
};

function readNumericMeta(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!meta) return null;
  const v = meta[key];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface BacklinksOverview {
  ascore: number;
  total: number;
  domains_num: number;
}

interface DomainRankCurrent {
  Or: number;
  Ot: number;
}

/** Current (today) domain_rank — cheap (~10 units). Replaces the monthly bucket value with today's number. */
async function fetchDomainRankCurrent(domain: string, apikey: string): Promise<DomainRankCurrent | null> {
  const params = new URLSearchParams({
    type: "domain_rank",
    domain,
    database: "us",
    export_columns: "Or,Ot",
    key: apikey,
  });
  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  if (!text || text.startsWith("ERROR")) return null;
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(";");
  return { Or: Number(cols[0] || 0), Ot: Number(cols[1] || 0) };
}

/**
 * Site Audit health score from the Projects API. The endpoint returns issue
 * counts (errors/warnings/notices) and page status (healthy/broken). Semrush's
 * "Site Health" % is the share of healthy pages; we approximate the same.
 * 100 units per call. Requires a Site Audit project for the client.
 */
async function fetchSiteAuditScore(projectId: number, apikey: string): Promise<number | null> {
  const url = `https://api.semrush.com/reports/v1/projects/${projectId}/siteaudit/info?key=${encodeURIComponent(apikey)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const crawled = Number(payload.pages_crawled ?? 0);
  const healthy = Number(payload.healthy ?? 0);
  if (crawled > 0) return Math.round((healthy / crawled) * 100);
  // Fallback: derive from issue counts so a fresh audit without page stats still scores.
  const errors = Number(payload.errors ?? 0);
  const warnings = Number(payload.warnings ?? 0);
  const notices = Number(payload.notices ?? 0);
  const penalty = Math.min(100, errors * 5 + warnings * 2 + notices * 0.5);
  return Math.max(0, Math.round(100 - penalty));
}

/**
 * Position Tracking organic_overview report — returns the campaign's visibility
 * index for today. ~100 units. Requires a Position Tracking campaign.
 */
async function fetchPositionTrackingVisibility(campaignId: number, apikey: string): Promise<number | null> {
  const params = new URLSearchParams({
    action: "report",
    type: "tracking_overview_organic",
    key: apikey,
    project_id: String(campaignId),
    export_columns: "Vi",
  });
  let res: Response;
  try {
    res = await fetch(`https://api.semrush.com/reports/v1/projects/${campaignId}/tracking/?${params.toString()}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  if (!text || text.startsWith("ERROR")) return null;
  // Two-line CSV: header, then a single row of Vi
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(";");
  const vi = Number(cols[0] || 0);
  return Number.isFinite(vi) ? vi : null;
}

/** Single-row backlinks overview from Semrush. Null on plan/quota failure. */
async function fetchBacklinksOverview(domain: string, apikey: string): Promise<BacklinksOverview | null> {
  const params = new URLSearchParams({
    type: "backlinks_overview",
    target: domain,
    target_type: "root_domain",
    export_columns: "ascore,total,domains_num",
    key: apikey,
  });
  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  if (!text || text.startsWith("ERROR")) return null;
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(";");
  return {
    ascore: Number(cols[0] || 0),
    total: Number(cols[1] || 0),
    domains_num: Number(cols[2] || 0),
  };
}

export { normalizeDomain };

// ---------------------------------------------------------------------------
// Organic keyword list (domain_organic report). Unlike the metric snapshots,
// this is the actual ranked keyword phrases — fetched live (not stored) since
// it's large and only needed on demand. Default sort is by traffic share desc.
// ---------------------------------------------------------------------------

export interface OrganicKeyword {
  phrase: string;
  position: number;
  volume: number;
  cpc: number;
  trafficPct: number;
  url: string;
}

export async function fetchOrganicKeywords(apikey: string, domain: string, limit = 250): Promise<OrganicKeyword[]> {
  const params = new URLSearchParams({
    type: "domain_organic",
    key: apikey,
    domain: normalizeDomain(domain),
    database: "us",
    display_limit: String(Math.max(1, Math.min(limit, 1000))),
    export_columns: "Ph,Po,Nq,Cp,Tr,Ur",
  });
  const res = await fetch(`${BASE}?${params.toString()}`);
  const text = await res.text();
  if (!res.ok || text.startsWith("ERROR")) {
    throw new Error(`Semrush domain_organic failed: ${text.trim().slice(0, 140)}`);
  }
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  // Columns come back in the order we requested (header uses display names).
  return lines.slice(1).map((line) => {
    const c = line.split(";");
    return {
      phrase: c[0] ?? "",
      position: Number(c[1] ?? 0),
      volume: Number(c[2] ?? 0),
      cpc: Number(c[3] ?? 0),
      trafficPct: Number(c[4] ?? 0),
      url: c[5] ?? "",
    };
  });
}

/** Resolve a client's stored SEMrush key + domain and fetch their keywords. */
export async function fetchClientOrganicKeywords(clientId: string, limit = 250): Promise<OrganicKeyword[]> {
  const connectors = await data.listConnectors(clientId);
  const token = connectors.find((c) => c.provider === "semrush");
  if (!token) return [];
  const creds = await data.getConnectorWithCredentials(token.id);
  const apikey = process.env.SEMRUSH_API_KEY ?? creds?.access_token;
  if (!apikey || !creds?.account_label) return [];
  return fetchOrganicKeywords(apikey, creds.account_label, limit);
}

// ===========================================================================
// DEEP PULL — fetch the full Semrush catalog (Analytics domain + keyword +
// Backlinks API + best-effort .Trends) for one client, on demand.
//
// Each report is fetched independently and parsed by its returned HEADER row
// (so the stored records are keyed by Semrush's own column labels — robust to
// column-set drift). Failures are captured per-report so a partial pull still
// records everything that succeeded. Display limits are deliberately bounded
// per report to keep API-unit spend sane (~100k+ units for a full pull).
//
// Endpoint bases:
//   Analytics (domain/keyword): https://api.semrush.com/
//   Backlinks API:              https://api.semrush.com/analytics/v1/
//   Trends (.Trends add-on):    https://api.semrush.com/analytics/ta/api/v3/
// ===========================================================================

const BACKLINKS_BASE = "https://api.semrush.com/analytics/v1/";

export interface DeepPullReport {
  report_type: string;
  label: string;
  rows: Record<string, string>[];
  row_count: number;
  units_estimate: number;
  error: string | null;
}

/** Parse Semrush ';'-CSV keyed by the returned header labels. */
function parseCsvRows(text: string): { rows: Record<string, string>[]; error: string | null } {
  const t = text.trim();
  if (!t) return { rows: [], error: null };
  if (t.startsWith("ERROR")) {
    const line = t.split(/\r?\n/)[0];
    // "ERROR 50 :: NOTHING FOUND" just means the report has no data for this
    // domain (e.g. no paid keywords) — record it as empty, not a failure.
    if (/NOTHING FOUND/i.test(line)) return { rows: [], error: null };
    return { rows: [], error: line.slice(0, 160) };
  }
  const lines = t.split(/\r?\n/);
  if (lines.length < 2) return { rows: [], error: null };
  const headers = lines[0].split(";").map((h) => h.trim());
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(";");
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (cells[i] ?? "").trim()));
    return o;
  });
  return { rows, error: null };
}

async function semrushFetch(url: string): Promise<{ rows: Record<string, string>[]; error: string | null }> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) return { rows: [], error: `HTTP ${res.status}: ${text.trim().slice(0, 140)}` };
    return parseCsvRows(text);
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "fetch failed" };
  }
}

interface SpecCtx {
  apikey: string;
  domain: string;
  database: string;
  seedPhrase: string;
}

interface ReportSpec {
  key: string;
  label: string;
  unitsPerLine: number;
  // Build the request URL, or return null to skip (e.g. no seed phrase yet).
  build: (ctx: SpecCtx) => string | null;
}

function analyticsUrl(ctx: SpecCtx, type: string, columns: string, extra: Record<string, string>): string {
  const p = new URLSearchParams({
    type,
    key: ctx.apikey,
    database: ctx.database,
    export_columns: columns,
    ...extra,
  });
  return `${BASE}?${p.toString()}`;
}

function backlinksUrl(ctx: SpecCtx, type: string, columns: string, displayLimit: number): string {
  const p = new URLSearchParams({
    type,
    key: ctx.apikey,
    target: ctx.domain,
    target_type: "root_domain",
    export_columns: columns,
    display_limit: String(displayLimit),
  });
  return `${BACKLINKS_BASE}?${p.toString()}`;
}

// The full catalog. Display limits are tuned to be generous but not reckless.
const REPORT_SPECS: ReportSpec[] = [
  // --- Domain Analytics ---
  {
    key: "organic_keywords", label: "Organic keywords", unitsPerLine: 10,
    build: (c) => analyticsUrl(c, "domain_organic", "Ph,Po,Pp,Nq,Cp,Co,Tr,Tc,Ur,Td", { domain: c.domain, display_limit: "1000" }),
  },
  {
    key: "paid_keywords", label: "Paid keywords", unitsPerLine: 20,
    build: (c) => analyticsUrl(c, "domain_adwords", "Ph,Po,Pp,Nq,Cp,Tr,Ur", { domain: c.domain, display_limit: "500" }),
  },
  {
    key: "organic_competitors", label: "Organic competitors", unitsPerLine: 40,
    build: (c) => analyticsUrl(c, "domain_organic_organic", "Dn,Cr,Np,Or,Ot,Oc,Ad", { domain: c.domain, display_limit: "100" }),
  },
  {
    key: "paid_competitors", label: "Paid competitors", unitsPerLine: 40,
    build: (c) => analyticsUrl(c, "domain_adwords_adwords", "Dn,Cr,Np,Ad,At,Ac", { domain: c.domain, display_limit: "100" }),
  },
  {
    key: "ad_copies", label: "Ad copies", unitsPerLine: 40,
    build: (c) => analyticsUrl(c, "domain_adwords_unique", "Ph,Tt,Ds,Vu,Ur", { domain: c.domain, display_limit: "100" }),
  },
  {
    key: "pla_keywords", label: "Shopping (PLA) keywords", unitsPerLine: 30,
    build: (c) => analyticsUrl(c, "domain_shopping", "Ph,Po,Pp,Pc,Tr,Ur", { domain: c.domain, display_limit: "200" }),
  },
  // --- Keyword research (seeded from the top organic keyword) ---
  {
    key: "keyword_overview", label: "Top keyword — overview", unitsPerLine: 10,
    build: (c) => (c.seedPhrase ? analyticsUrl(c, "phrase_this", "Ph,Nq,Cp,Co,Nr,Td", { phrase: c.seedPhrase }) : null),
  },
  {
    key: "related_keywords", label: "Related keywords", unitsPerLine: 40,
    build: (c) => (c.seedPhrase ? analyticsUrl(c, "phrase_related", "Ph,Nq,Cp,Co,Nr,Rr,Td", { phrase: c.seedPhrase, display_limit: "100" }) : null),
  },
  {
    key: "question_keywords", label: "Question keywords", unitsPerLine: 40,
    build: (c) => (c.seedPhrase ? analyticsUrl(c, "phrase_questions", "Ph,Nq,Cp,Co,Nr,Td", { phrase: c.seedPhrase, display_limit: "100" }) : null),
  },
  // --- Backlinks API ---
  {
    key: "backlinks_overview", label: "Backlinks overview", unitsPerLine: 45,
    build: (c) => backlinksUrl(c, "backlinks_overview", "ascore,total,domains_num,urls_num,ips_num,follows_num,nofollows_num,texts_num,images_num,forms_num,frames_num", 1),
  },
  {
    key: "authority_history", label: "Authority Score history", unitsPerLine: 40,
    build: (c) => backlinksUrl(c, "backlinks_historical", "date,ascore,domains_num,backlinks_num", 200),
  },
  {
    key: "backlinks", label: "Backlinks", unitsPerLine: 45,
    build: (c) => backlinksUrl(c, "backlinks", "source_url,source_title,target_url,anchor,page_ascore,first_seen,last_seen,nofollow", 500),
  },
  {
    key: "ref_domains", label: "Referring domains", unitsPerLine: 40,
    build: (c) => backlinksUrl(c, "backlinks_refdomains", "domain_ascore,domain,backlinks_num,first_seen,last_seen", 500),
  },
  {
    key: "ref_ips", label: "Referring IPs", unitsPerLine: 20,
    build: (c) => backlinksUrl(c, "backlinks_refips", "ip,country,domains_num,backlinks_num,first_seen,last_seen", 200),
  },
  {
    key: "anchors", label: "Anchors", unitsPerLine: 40,
    build: (c) => backlinksUrl(c, "backlinks_anchors", "anchor,domains_num,backlinks_num", 300),
  },
  {
    key: "indexed_pages", label: "Indexed pages", unitsPerLine: 40,
    build: (c) => backlinksUrl(c, "backlinks_pages", "source_url,domains_num,backlinks_num,last_seen", 300),
  },
  {
    key: "backlink_competitors", label: "Backlink competitors", unitsPerLine: 40,
    build: (c) => backlinksUrl(c, "backlinks_competitors", "neighbour,similarity,common_refdomains,domains_num,backlinks_num", 50),
  },
];

// Note: Traffic Analytics (.Trends) is a separate paid Semrush add-on with a
// different API surface; it's intentionally not part of the deep pull (it 400s
// without the add-on). Re-add a spec here if the plan includes .Trends.

async function runSpec(spec: ReportSpec, ctx: SpecCtx): Promise<DeepPullReport> {
  const url = spec.build(ctx);
  if (!url) {
    return { report_type: spec.key, label: spec.label, rows: [], row_count: 0, units_estimate: 0, error: "skipped (no seed keyword)" };
  }
  const { rows, error } = await semrushFetch(url);
  return {
    report_type: spec.key,
    label: spec.label,
    rows,
    row_count: rows.length,
    units_estimate: error ? 0 : Math.max(spec.unitsPerLine, rows.length * spec.unitsPerLine),
    error,
  };
}

// Bounded-concurrency map so we don't hammer Semrush's rate limit.
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

/**
 * Pull the entire Semrush catalog for one domain. Runs the organic-keywords
 * report first to derive a seed phrase for the keyword-research reports, then
 * fans the rest out with bounded concurrency. Never throws — every report's
 * success/failure is captured in its DeepPullReport.
 */
export async function semrushDeepPull(apikey: string, rawDomain: string, database = "us"): Promise<DeepPullReport[]> {
  const domain = normalizeDomain(rawDomain);
  const baseCtx: SpecCtx = { apikey, domain, database, seedPhrase: "" };

  // 1. Organic keywords first → seed phrase for keyword research.
  const organicSpec = REPORT_SPECS[0];
  const organic = await runSpec(organicSpec, baseCtx);
  const seedPhrase = organic.rows[0] ? String(Object.values(organic.rows[0])[0] ?? "") : "";
  const ctx: SpecCtx = { ...baseCtx, seedPhrase };

  // 2. Everything else (skip the organic spec we already ran), plus Trends.
  const rest = REPORT_SPECS.slice(1);
  const results = await pool(rest, 4, (spec) => runSpec(spec, ctx));

  return [organic, ...results];
}

/** Resolve a client's stored Semrush key + domain and run a full deep pull. */
export async function semrushDeepPullForClient(clientId: string): Promise<{ domain: string; reports: DeepPullReport[] } | null> {
  const connectors = await data.listConnectors(clientId);
  const token = connectors.find((c) => c.provider === "semrush");
  if (!token) return null;
  const creds = await data.getConnectorWithCredentials(token.id);
  const apikey = process.env.SEMRUSH_API_KEY ?? creds?.access_token;
  if (!apikey || !creds?.account_label) return null;
  const domain = normalizeDomain(creds.account_label);
  const reports = await semrushDeepPull(apikey, domain);
  return { domain, reports };
}

/**
 * Run a deep pull for one client AND persist every report. Shared by the admin
 * "Run deep pull" button and the monthly cron. Returns null if the client has
 * no Semrush connector. Estimated units are summed across reports.
 */
export async function syncSemrushDeepPull(
  clientId: string,
): Promise<{ domain: string; reports: number; units: number } | null> {
  const result = await semrushDeepPullForClient(clientId);
  if (!result) return null;
  let units = 0;
  for (const r of result.reports) {
    units += r.units_estimate;
    await data.upsertSemrushReport({
      client_id: clientId,
      report_type: r.report_type,
      rows: r.rows,
      meta: {
        label: r.label,
        domain: result.domain,
        row_count: r.row_count,
        units_estimate: r.units_estimate,
        error: r.error,
      },
    });
  }
  return { domain: result.domain, reports: result.reports.length, units };
}
