// Google OAuth callback. Receives ?code=...&state=<nonce>:<clientId>:<provider>
// 1. Verify CSRF nonce matches the cookie we set in /start.
// 2. Exchange code for tokens.
// 3. Auto-pick an account_label (first verified site / first GA4 property).
// 4. Upsert connector_tokens (encrypted).
// 5. Redirect back to /admin/clients/[id].

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { exchangeAuthCode, listGscSites, listGa4Properties } from "@/lib/connectors/google-oauth";
import { data } from "@/lib/data";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "oauth_state_nonce";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(new URL(`/admin?oauth_error=${encodeURIComponent(err)}`, url));
  }
  if (!code || !stateParam) {
    return new Response("missing code or state", { status: 400 });
  }

  const [nonce, clientId, provider] = stateParam.split(":");
  if (!nonce || !clientId || !provider) {
    return new Response("malformed state", { status: 400 });
  }

  const cookieNonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return new Response("CSRF nonce mismatch", { status: 400 });
  }

  const exchanged = await exchangeAuthCode(code);

  let account_label = "";
  if (provider === "gsc") {
    const sites = await listGscSites(exchanged.access_token);
    account_label = sites[0] ?? "";
    if (!account_label) {
      return NextResponse.redirect(
        new URL(`/admin/clients/${clientId}?oauth_error=${encodeURIComponent("No verified GSC sites on this Google account")}`, url),
      );
    }
  } else if (provider === "ga4") {
    const props = await listGa4Properties(exchanged.access_token);
    account_label = props[0]?.propertyId ?? "";
    if (!account_label) {
      return NextResponse.redirect(
        new URL(`/admin/clients/${clientId}?oauth_error=${encodeURIComponent("No GA4 properties on this Google account")}`, url),
      );
    }
  } else {
    return new Response(`unsupported provider: ${provider}`, { status: 400 });
  }

  await data.upsertConnectorToken({
    client_id: clientId,
    provider,
    account_label,
    access_token: exchanged.access_token,
    refresh_token: exchanged.refresh_token,
    expires_at: exchanged.expires_at,
    scopes: exchanged.scopes,
    meta: {},
  });

  const res = NextResponse.redirect(new URL(`/admin/clients/${clientId}?oauth_connected=${provider}`, url));
  res.cookies.delete(NONCE_COOKIE);
  return res;
}
