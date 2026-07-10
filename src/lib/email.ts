// Resend-backed client notification emails.
//
// notifyClient(clientId, …) resolves the customer account for a company,
// honors their email_prefs opt-out, and sends a branded notification with a
// CTA back into the portal. Fire it AFTER the state change it announces and
// never let it fail the calling action — email is best-effort.
//
// Activation: set RESEND_API_KEY (and verify the sending domain in Resend).
// Without the key every call is a logged no-op, so the feature is safe to
// ship ahead of the key existing. Optional overrides: EMAIL_FROM,
// NEXT_PUBLIC_SITE_URL.

import { createServiceClient } from "@/lib/supabase/server";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface NotificationEmail {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  /** Path within the portal, e.g. "/client" — joined onto the site URL. */
  ctaPath: string;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://f1mediateam.com";
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Light, card-on-gray layout — reads as native in Gmail/Outlook (which are
// white) instead of a full-bleed dark slab. Tables + inline styles only, for
// email-client compatibility. Logo is the 8.6 KB /email-logo.png cut.
function renderHtml(n: NotificationEmail): string {
  const url = siteUrl() + n.ctaPath;
  const logo = siteUrl() + "/email-logo.png";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f6;">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr><td align="center" style="padding:0 0 24px;">
            <img src="${logo}" alt="F1 Media Team" height="44" style="height:44px;width:auto;display:block;" />
          </td></tr>
          <tr><td style="background:#ffffff;border:1px solid #e4e8ec;border-radius:12px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:4px;background:#e10600;font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr><td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:21px;line-height:1.35;color:#14181d;">${escapeHtml(n.heading)}</h1>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#4a5560;white-space:pre-wrap;">${escapeHtml(n.body)}</p>
                <a href="${url}"
                   style="display:inline-block;background:#e10600;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:8px;">
                  ${escapeHtml(n.ctaLabel)}
                </a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding:24px 24px 0;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#8a94a0;">
              You're receiving this because you have an F1 Media Team client portal account.<br/>
              Turn off email notifications any time in your portal's Settings.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Low-level send. Returns true if Resend accepted the email. */
export async function sendEmail(to: string, n: NotificationEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping:", n.subject, "→", to);
    return false;
  }
  const from = process.env.EMAIL_FROM ?? "F1 Media Team <notifications@f1mediateam.com>";
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: n.subject, html: renderHtml(n) }),
  });
  if (!res.ok) {
    console.error("[email] Resend rejected:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

/** Company name for email copy. Empty string if the client can't be found —
 *  callers should degrade gracefully ("A client" etc.), never block the send. */
export async function clientCompanyName(clientId: string): Promise<string> {
  try {
    const supabase = await createServiceClient();
    const { data: row } = await supabase
      .from("clients")
      .select("company_name")
      .eq("id", clientId)
      .maybeSingle();
    return row?.company_name ?? "";
  } catch {
    return "";
  }
}

/** Notify every admin account. Used for client-initiated changes (approvals,
 *  change requests, messages, submissions) so the team can act fast. Honors
 *  each admin's email_prefs opt-out. Never throws. */
export async function notifyAdmins(n: NotificationEmail): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { data: admins } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("role", "admin");
    if (!admins?.length) return;

    const { data: prefs } = await supabase
      .from("email_prefs")
      .select("user_id,opted_out")
      .in("user_id", admins.map((a) => a.id));
    const optedOut = new Set(
      (prefs ?? []).filter((p) => p.opted_out).map((p) => p.user_id),
    );

    await Promise.all(
      admins
        .filter((a) => a.email && !optedOut.has(a.id))
        .map((a) => sendEmail(a.email as string, n)),
    );
  } catch (err) {
    console.error("[email] notifyAdmins failed:", err);
  }
}

/** Notify the customer account attached to a client company. Resolves the
 *  recipient + opt-out via the service role (the caller's session often has
 *  no RLS access to another user's email_prefs), then sends. Never throws. */
export async function notifyClient(clientId: string, n: NotificationEmail): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { data: user } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("client_id", clientId)
      .eq("role", "client")
      .maybeSingle();
    if (!user?.email) return;

    const { data: pref } = await supabase
      .from("email_prefs")
      .select("opted_out")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pref?.opted_out) return;

    await sendEmail(user.email, n);
  } catch (err) {
    console.error("[email] notifyClient failed:", err);
  }
}
