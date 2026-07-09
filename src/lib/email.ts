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

function renderHtml(n: NotificationEmail): string {
  const url = siteUrl() + n.ctaPath;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.18em;color:#e8edf2;margin-bottom:28px;">
        F1 <span style="color:#e10600;">|</span> MEDIA TEAM
      </div>
      <div style="background:#11161d;border:1px solid #232b36;border-radius:16px;padding:28px;">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#e8edf2;">${escapeHtml(n.heading)}</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9aa7b4;white-space:pre-wrap;">${escapeHtml(n.body)}</p>
        <a href="${url}"
           style="display:inline-block;background:#3f8e84;color:#04110f;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:10px;">
          ${escapeHtml(n.ctaLabel)}
        </a>
      </div>
      <p style="margin:20px 4px 0;font-size:11px;line-height:1.6;color:#5c6875;">
        You're receiving this because you have an F1 Media Team client portal account.
        Turn off email notifications any time in your portal's Settings.
      </p>
    </div>
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
