// Google Search Console connector.
// Scope: https://www.googleapis.com/auth/webmasters.readonly
// Query: https://searchconsole.googleapis.com/v1/sites/{siteUrl}/searchAnalytics/query

import type { Connector, SyncContext, SyncResult } from "./index";
import { getValidAccessToken, listGscSites } from "./google-oauth";

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
      include_granted_scopes: "true",
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
