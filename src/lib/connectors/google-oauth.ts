// Shared Google OAuth helpers used by gsc + ga4 connectors.

import { data } from "@/lib/data";
import type { ConnectorCredentials } from "@/lib/data/supabase-adapter";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
}

export interface ExchangedToken {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scopes: string[];
}

function redirectUri(): string {
  const uri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!uri) throw new Error("GOOGLE_OAUTH_REDIRECT_URI missing");
  return uri;
}

export async function exchangeAuthCode(code: string): Promise<ExchangedToken> {
  const client_id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const client_secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET missing");
  }
  const body = new URLSearchParams({
    code,
    client_id,
    client_secret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    scopes: json.scope ? json.scope.split(" ") : [],
  };
}

async function refreshAccessToken(refresh_token: string): Promise<{ access_token: string; expires_at: string }> {
  const client_id = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const client_secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const body = new URLSearchParams({
    refresh_token,
    client_id,
    client_secret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  return {
    access_token: json.access_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

/**
 * Returns a still-valid access token for the given connector id.
 * Refreshes (and persists the new access token) when the stored one is
 * within 60s of expiry.
 */
export async function getValidAccessToken(connectorId: string): Promise<{ access_token: string; credentials: ConnectorCredentials }> {
  const credentials = await data.getConnectorWithCredentials(connectorId);
  if (!credentials) throw new Error(`connector ${connectorId} not found`);
  if (!credentials.access_token) throw new Error(`connector ${connectorId} has no access token`);

  const expiresAt = credentials.expires_at ? new Date(credentials.expires_at).getTime() : 0;
  const stale = expiresAt - Date.now() < 60_000;

  if (stale && credentials.refresh_token) {
    const refreshed = await refreshAccessToken(credentials.refresh_token);
    await data.updateConnectorAccessToken(connectorId, refreshed.access_token, refreshed.expires_at);
    return { access_token: refreshed.access_token, credentials: { ...credentials, access_token: refreshed.access_token, expires_at: refreshed.expires_at } };
  }
  return { access_token: credentials.access_token, credentials };
}

/** List GSC sites the connected user has access to. */
export async function listGscSites(access_token: string): Promise<string[]> {
  const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`GSC sites list failed (${res.status})`);
  const json = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
  return (json.siteEntry ?? [])
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => s.siteUrl);
}

/** List GA4 properties the connected user has access to. */
export async function listGa4Properties(access_token: string): Promise<Array<{ name: string; propertyId: string; displayName: string }>> {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 list properties failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    accountSummaries?: Array<{
      propertySummaries?: Array<{ property: string; displayName: string }>;
    }>;
  };
  const out: Array<{ name: string; propertyId: string; displayName: string }> = [];
  for (const acct of json.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      out.push({
        name: p.property,
        propertyId: p.property.replace(/^properties\//, ""),
        displayName: p.displayName,
      });
    }
  }
  return out;
}
