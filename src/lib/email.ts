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

// "Minimal letter" layout (the design the user picked from three variants):
// pure white, small logo, thin red rule, no card chrome — reads like a short
// personal note rather than an automated notification. Tables + inline styles
// only, for email-client compatibility. Logo is the 8.6 KB /email-logo.png cut.
function renderHtml(n: NotificationEmail): string {
  const url = siteUrl() + n.ctaPath;
  const logo = siteUrl() + "/email-logo.png";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:52px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <tr><td style="padding:0 0 18px;">
            <img src="${logo}" alt="F1 Media Team" height="30" style="height:30px;width:auto;display:block;" />
          </td></tr>
          <tr><td style="height:2px;background:#e10600;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:34px 0 0;">
            <h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#14181d;">${escapeHtml(n.heading)}</h1>
            <p style="margin:0 0 30px;font-size:15px;line-height:1.75;color:#3d4750;white-space:pre-wrap;">${escapeHtml(n.body)}</p>
            <a href="${url}"
               style="display:inline-block;background:#e10600;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:999px;">
              ${escapeHtml(n.ctaLabel)}
            </a>
          </td></tr>
          <tr><td style="padding:44px 0 0;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#9aa3ad;">
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

/** The acting user's display name (profiles.full_name), or null if unset —
 *  callers pick their own fallback ("F1 Media Team" etc.). */
export async function userDisplayName(userId: string): Promise<string | null> {
  try {
    const supabase = await createServiceClient();
    const { data: row } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    return row?.full_name ?? null;
  } catch {
    return null;
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
