// Kick off Google OAuth for a specific client + provider (gsc | ga4).
// Admin clicks "Connect" → /api/oauth/google/start?provider=gsc&client_id=…
// We set a CSRF nonce cookie and redirect to Google's authorization URL.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth/session";
import { getConnector } from "@/lib/connectors";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "oauth_state_nonce";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const provider = req.nextUrl.searchParams.get("provider");
  const client_id = req.nextUrl.searchParams.get("client_id");
  if (!provider || !client_id) {
    return new Response("provider and client_id required", { status: 400 });
  }

  const connector = getConnector(provider);
  if (!connector?.buildAuthUrl) {
    return new Response(`unknown provider: ${provider}`, { status: 400 });
  }

  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    return new Response("GOOGLE_OAUTH_REDIRECT_URI not configured", { status: 500 });
  }

  const nonce = randomBytes(16).toString("hex");
  const authUrl = connector.buildAuthUrl({ clientId: client_id, redirectUri, state: nonce });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
