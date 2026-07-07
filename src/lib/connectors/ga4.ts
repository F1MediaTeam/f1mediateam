// Google Analytics 4 connector.
// Scope: https://www.googleapis.com/auth/analytics.readonly
// Query: https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport

import type { Connector, SyncContext, SyncResult } from "./index";
import { getValidAccessToken } from "./google-oauth";
import { data } from "@/lib/data";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

interface RunReportResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

export const ga4Connector: Connector = {
  provider: "ga4",
  label: "Google Analytics 4",

  buildAuthUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: SCOPE,
      state: `${state}:${clientId}:ga4`,
      // NOTE: see gsc.ts — include_granted_scopes=true revokes the other
      // provider's refresh token via incremental-authorization rotation.
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const { access_token, credentials } = await getValidAccessToken(ctx.token.id);
    const propertyId = credentials.account_label;
    if (!propertyId) {
      throw new Error("GA4 propertyId missing — reconnect to pick a property");
    }

    const today = new Date();
    const yest = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    // Ask for up to 26 months; GA4 returns whatever the property's retention allows.
    const startDate = ctx.from ?? new Date(yest.getTime() - 789 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = ctx.to ?? yest.toISOString().slice(0, 10);

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "conversions" },
      ],
    };
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
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
      throw new Error(`GA4 runReport failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as RunReportResponse;

    const snapshots: SyncResult["snapshots"] = [];
    for (const row of json.rows ?? []) {
      // GA4 'date' dimension comes back as YYYYMMDD; convert to YYYY-MM-DD.
      const raw = row.dimensionValues[0]?.value ?? "";
      const captured_at = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
      const baseMeta = { property: propertyId, source_provider: "ga4" };
      const metrics = ["sessions", "active_users", "conversions"];
      row.metricValues.forEach((mv, i) => {
        snapshots.push({
          source: "ga4",
          metric: metrics[i],
          value: Number(mv.value),
          captured_at,
          is_baseline: false,
          meta: baseMeta,
        });
      });
    }

    return { snapshots, effectiveAsOf: endDate };
  },
};

export const GA4_SCOPE = SCOPE;

// ---------------------------------------------------------------------------
// On-demand breakdown queries (channel mix / landing pages). Like the GSC
// breakdowns, these are NOT stored — fetched live for the report window with
// a tight row cap. Answers the meeting question "where is the traffic
// actually coming from", which site totals alone cannot.
// ---------------------------------------------------------------------------

export interface Ga4BreakdownRow {
  key: string;
  sessions: number;
  activeUsers: number;
  conversions: number;
}

async function resolveProperty(clientId: string): Promise<{ access_token: string; propertyId: string } | null> {
  const tokens = await data.listConnectors(clientId);
  const token = tokens.find((t) => t.provider === "ga4");
  if (!token) return null;
  const { access_token, credentials } = await getValidAccessToken(token.id);
  const propertyId = credentials.account_label;
  if (!propertyId) return null;
  return { access_token, propertyId };
}

async function runGa4Breakdown(
  ctx: { access_token: string; propertyId: string },
  dimension: "sessionDefaultChannelGroup" | "landingPagePlusQueryString",
  from: string,
  to: string,
  limit: number,
): Promise<Ga4BreakdownRow[]> {
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "conversions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: String(Math.max(1, Math.min(limit, 50))),
  };
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${ctx.propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 ${dimension} breakdown failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as RunReportResponse;
  return (json.rows ?? []).map((r) => ({
    key: r.dimensionValues[0]?.value ?? "",
    sessions: Number(r.metricValues[0]?.value ?? 0),
    activeUsers: Number(r.metricValues[1]?.value ?? 0),
    conversions: Number(r.metricValues[2]?.value ?? 0),
  }));
}

/** Sessions by default channel group (Organic Search, Direct, Referral, …). */
export async function fetchGa4Channels(clientId: string, from: string, to: string, limit = 8): Promise<Ga4BreakdownRow[]> {
  const ctx = await resolveProperty(clientId);
  if (!ctx) return [];
  return runGa4Breakdown(ctx, "sessionDefaultChannelGroup", from, to, limit);
}

/** Top landing pages by sessions. */
export async function fetchGa4LandingPages(clientId: string, from: string, to: string, limit = 10): Promise<Ga4BreakdownRow[]> {
  const ctx = await resolveProperty(clientId);
  if (!ctx) return [];
  return runGa4Breakdown(ctx, "landingPagePlusQueryString", from, to, limit);
}
