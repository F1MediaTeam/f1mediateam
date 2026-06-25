// Google OAuth callback. Receives ?code=...&state=<nonce>:<clientId>:<provider>
// 1. Verify CSRF nonce matches the cookie we set in /start.
// 2. Exchange code for tokens.
// 3. Auto-pick an account_label (first verified site / first GA4 property).
// 4. Upsert connector_tokens (encrypted).
// 5. Redirect back to /admin/clients/[id].
//
// Any failure during this chain is converted into a redirect with
// ?oauth_error=<msg> so the UI can show it instead of dumping a 500.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { exchangeAuthCode, listGscSites, listGa4Properties } from "@/lib/connectors/google-oauth";
import { data } from "@/lib/data";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "oauth_state_nonce";

function errorRedirect(reqUrl: URL, clientId: string | null, message: string) {
  const target = clientId
    ? new URL(`/admin/clients/${clientId}?oauth_error=${encodeURIComponent(message)}`, reqUrl)
    : new URL(`/admin?oauth_error=${encodeURIComponent(message)}`, reqUrl);
  const res = NextResponse.redirect(target);
  res.cookies.delete(NONCE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  await requireAdmin();

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return errorRedirect(url, null, `Google returned: ${err}`);
  }
  if (!code || !stateParam) {
    return errorRedirect(url, null, "Missing code or state from Google");
  }

  const [nonce, clientId, provider] = stateParam.split(":");
  if (!nonce || !clientId || !provider) {
    return errorRedirect(url, null, "Malformed OAuth state");
  }

  const cookieNonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return errorRedirect(url, clientId, "CSRF nonce mismatch — try clicking Connect again");
  }

  try {
    const exchanged = await exchangeAuthCode(code);

    let account_label = "";
    if (provider === "gsc") {
      const sites = await listGscSites(exchanged.access_token);
      account_label = sites[0] ?? "";
      if (!account_label) {
        return errorRedirect(url, clientId, "No verified GSC sites on this Google account");
      }
    } else if (provider === "ga4") {
      const props = await listGa4Properties(exchanged.access_token);
      account_label = props[0]?.propertyId ?? "";
      if (!account_label) {
        return errorRedirect(url, clientId, "No GA4 properties on this Google account");
      }
    } else {
      return errorRedirect(url, clientId, `Unsupported provider: ${provider}`);
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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("OAuth callback failed", e);
    return errorRedirect(url, clientId, message);
  }
}
