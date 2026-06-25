// Google Search Console connector.
// Scope: https://www.googleapis.com/auth/webmasters.readonly
// Query: https://searchconsole.googleapis.com/v1/sites/{siteUrl}/searchAnalytics/query

import type { Connector, SyncContext, SyncResult } from "./index";
import { getValidAccessToken, listGscSites } from "./google-oauth";
import { data } from "@/lib/data";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

interface RowsResponse {
  rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
}

export const gscConnector: Connector = {
  provider: "gsc",
  label: "Google Search Console",

  buildAuthUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: SCOPE,
      state: `${state}:${clientId}:gsc`,
      // NOTE: do NOT pass include_granted_scopes=true. Incremental authorization
      // bundles old scopes into a new refresh token and revokes the prior one,
      // which kills the OTHER provider's stored refresh token. We need each
      // provider to hold an independent grant.
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const { access_token, credentials } = await getValidAccessToken(ctx.token.id);
    let siteUrl = credentials.account_label;
    if (!siteUrl) {
      const sites = await listGscSites(access_token);
      siteUrl = sites[0] ?? null;
    }
    if (!siteUrl) {
      throw new Error("No verified GSC sites available for this account");
    }

    // Default window: GSC's full history (~16 months). GSC data lags ~2 days.
    const today = new Date();
    const lag = new Date(today);
    lag.setDate(lag.getDate() - 2);
    const startDate = ctx.from ?? new Date(lag.getTime() - 479 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = ctx.to ?? lag.toISOString().slice(0, 10);

    const body = {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 25000,
    };
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GSC searchAnalytics failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as RowsResponse;

    const snapshots: SyncResult["snapshots"] = [];
    for (const row of json.rows ?? []) {
      const captured_at = row.keys[0];
      const baseMeta = { site: siteUrl, source_provider: "gsc" };
      snapshots.push({ source: "gsc", metric: "clicks",       value: row.clicks,      captured_at, is_baseline: false, meta: baseMeta });
      snapshots.push({ source: "gsc", metric: "impressions",  value: row.impressions, captured_at, is_baseline: false, meta: baseMeta });
      snapshots.push({ source: "gsc", metric: "avg_position", value: row.position,    captured_at, is_baseline: false, meta: baseMeta });
      snapshots.push({ source: "gsc", metric: "ctr",          value: row.ctr,         captured_at, is_baseline: false, meta: baseMeta });
    }

    return { snapshots, effectiveAsOf: endDate };
  },
};

export const GSC_SCOPE = SCOPE;

// ---------------------------------------------------------------------------
// On-demand breakdown queries (per page / per query). Unlike the daily snapshot
// sync above, these are NOT stored — they're fetched live for the date range
// the user is looking at right now, and we cap the row count tightly.
// ---------------------------------------------------------------------------

export interface GscBreakdownRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Resolve the client's GSC token + site URL once. */
async function resolveSite(clientId: string): Promise<{ access_token: string; siteUrl: string } | null> {
  const tokens = await data.listConnectors(clientId);
  const token = tokens.find((t) => t.provider === "gsc");
  if (!token) return null;
  const { access_token, credentials } = await getValidAccessToken(token.id);
  let siteUrl = credentials.account_label ?? null;
  if (!siteUrl) {
    const sites = await listGscSites(access_token);
    siteUrl = sites[0] ?? null;
  }
  if (!siteUrl) return null;
  return { access_token, siteUrl };
}

async function runBreakdown(
  ctx: { access_token: string; siteUrl: string },
  dimension: "page" | "query",
  from: string,
  to: string,
  limit: number,
): Promise<GscBreakdownRow[]> {
  const body = {
    startDate: from,
    endDate: to,
    dimensions: [dimension],
    rowLimit: Math.max(1, Math.min(limit, 1000)),
  };
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(ctx.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC ${dimension} breakdown failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
  return (json.rows ?? []).map((r) => ({
    key: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/** Top N pages by clicks for the client's site over [from, to]. */
export async function fetchClientGscPages(clientId: string, from: string, to: string, limit = 25): Promise<GscBreakdownRow[]> {
  const ctx = await resolveSite(clientId);
  if (!ctx) return [];
  return runBreakdown(ctx, "page", from, to, limit);
}

/** Top N queries by clicks for the client's site over [from, to]. */
export async function fetchClientGscQueries(clientId: string, from: string, to: string, limit = 25): Promise<GscBreakdownRow[]> {
  const ctx = await resolveSite(clientId);
  if (!ctx) return [];
  return runBreakdown(ctx, "query", from, to, limit);
}
