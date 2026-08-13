// POST /api/pulse/ingest — the only endpoint the tag talks to.
//
// This is public and unauthenticated by necessity: it is called by anonymous
// browsers on client sites. So it treats every field as hostile, and it answers
// 204 to everything. A rejected beacon and an accepted one are indistinguishable
// from outside, which means the endpoint cannot be used to probe which site keys
// exist or which origins are registered.
//
// The privacy invariants live here, not in policy:
//   - the IP is read from the request, used for country and as hash input, and
//     never written anywhere. There is no column for it and no log line prints it.
//   - the salt rotating daily means an identifier cannot outlive a day.
//   - the tag sends no field values, and this route reads none.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sessionHash, visitorHash } from "@/lib/pulse/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Always 204 — see the note above about not leaking which keys are real. */
const OK = () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });

export function OPTIONS() {
  return OK();
}

const MAX_BODY = 8_000;
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|pingdom|curl|wget|python|node-fetch|axios|semrush|ahrefs|dataforseo/i;

// Per-instance rate limiting. Serverless means this is per warm instance rather
// than global, so it throttles a single abusive client rather than enforcing a
// hard fleet-wide cap — enough to keep one browser from flooding a site's data
// without adding a shared store to the hot path.
const seen = new Map<string, { n: number; until: number }>();
const RATE_LIMIT = 120; // beacons per minute per IP per site
function rateLimited(key: string): boolean {
  const now = Date.now();
  const row = seen.get(key);
  if (!row || now > row.until) {
    seen.set(key, { n: 1, until: now + 60_000 });
    if (seen.size > 5_000) {
      for (const [k, v] of seen) if (now > v.until) seen.delete(k);
    }
    return false;
  }
  row.n += 1;
  return row.n > RATE_LIMIT;
}

// A beacon carrying a valid key from an unregistered host is refused silently,
// which is right for security and terrible for diagnosis: a storefront served
// from a host nobody registered looks exactly like a tag that was never pasted.
// So the refusal itself gets recorded — the hostname only, no visitor data —
// once per site per host per day. Same per-instance caveat as the rate limiter:
// a cold start may re-report, which is a duplicate feed row, not a leak.
const reportedOrigins = new Map<string, number>();
function shouldReportOrigin(siteId: string, host: string): boolean {
  const key = `${siteId}:${host}:${Math.floor(Date.now() / 86_400_000)}`;
  const now = Date.now();
  if (reportedOrigins.has(key)) return false;
  reportedOrigins.set(key, now);
  if (reportedOrigins.size > 1_000) {
    for (const [k, t] of reportedOrigins) if (now - t > 86_400_000) reportedOrigins.delete(k);
  }
  return true;
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** apex and www are the same site; anything else has to be registered. */
function originAllowed(host: string | null, domain: string, allowed: string[]): boolean {
  if (!host) return false;
  const bare = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
  if (host === bare || host === `www.${bare}`) return true;
  return allowed.some((a) => {
    const clean = a.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    return host === clean || host === `www.${clean}`;
  });
}

function deviceFrom(width: unknown, ua: string): "desktop" | "mobile" | "tablet" {
  const w = typeof width === "number" ? width : 0;
  if (/iPad|Tablet/i.test(ua) || (w >= 768 && w < 1024)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua) || (w > 0 && w < 768)) return "mobile";
  return "desktop";
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return OK();

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return OK();
    }

    const siteKey = str(body.k, 40);
    const kind = str(body.t, 4);
    if (!siteKey || !kind) return OK();

    const ua = request.headers.get("user-agent") ?? "";
    if (!ua || BOT_UA.test(ua)) return OK();

    const supabase = await createServiceClient();
    const { data: site } = await supabase
      .from("pulse_sites")
      .select("id, domain, allowed_origins, status")
      .eq("site_key", siteKey)
      .maybeSingle();
    if (!site) return OK();

    // The key identifies; the origin authorises. A key lifted from a client's
    // page source is useless from anywhere else.
    const origin = hostOf(request.headers.get("origin")) ?? hostOf(request.headers.get("referer"));
    if (!originAllowed(origin, site.domain as string, (site.allowed_origins as string[]) ?? [])) {
      // Still discarded, still a 204 — but now it is visible in the feed, so
      // "installed but no data" has an answer instead of being a dead end.
      if (origin && shouldReportOrigin(site.id as string, origin)) {
        await supabase.from("pulse_feed_events").insert({
          site_id: site.id,
          kind: "tag_origin_rejected",
          severity: "warning",
          title: `Beacons rejected from ${origin}`,
          payload: { host: origin, registered: site.domain },
        });
      }
      return OK();
    }

    // Used for country and as hash input. Never stored, never logged.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "0.0.0.0";
    if (rateLimited(`${site.id}:${ip}`)) return OK();

    // Vercel resolves geography at the edge, so we never do a lookup against
    // the IP ourselves — one less place it could be recorded.
    const country = request.headers.get("x-vercel-ip-country") ?? null;

    const visitor = visitorHash(site.id as string, ip, ua);
    const session = sessionHash(visitor);
    const path = str(body.p, 400) ?? "/";
    const device = deviceFrom(body.w, ua);

    if (kind === "pv") {
      const referrer = str(body.r, 400);
      await supabase.from("pulse_pageviews").insert({
        site_id: site.id,
        path,
        referrer,
        referrer_domain: hostOf(referrer),
        utm_source: str(body.us, 120),
        utm_medium: str(body.um, 120),
        utm_campaign: str(body.uc, 120),
        device_type: device,
        country,
        visitor_hash: visitor,
        session_hash: session,
      });

      // First beacon from a pending site is the install confirming itself.
      const patch: Record<string, unknown> = { last_beacon_at: new Date().toISOString() };
      if (site.status !== "live") {
        patch.status = "live";
        await supabase.from("pulse_feed_events").insert({
          site_id: site.id,
          kind: "tag_detected",
          severity: "good",
          title: `Tag is live on ${site.domain}`,
          payload: { path },
        });
      }
      await supabase.from("pulse_sites").update(patch).eq("id", site.id);
      return OK();
    }

    if (kind === "cv") {
      const conversionKind = str(body.c, 20);
      const allowedKinds = ["tel_click", "mailto_click", "outbound_click", "form_submit"];
      if (!conversionKind || !allowedKinds.includes(conversionKind)) return OK();
      await supabase.from("pulse_conversions").insert({
        site_id: site.id,
        path,
        kind: conversionKind,
        // An outbound domain or a form's id/name. The tag sends nothing else,
        // and the cap makes sure nothing large can be smuggled through.
        target: str(body.g, 120),
        session_hash: session,
      });
      return OK();
    }

    if (kind === "end") {
      const engagement = typeof body.e === "number" && body.e >= 0 ? Math.round(body.e) : null;
      if (engagement !== null) {
        // Attach the time to the pageview it belongs to rather than storing a
        // second row: this is the same view, finally finished.
        const { data: recent } = await supabase
          .from("pulse_pageviews")
          .select("id")
          .eq("site_id", site.id)
          .eq("session_hash", session)
          .eq("path", path)
          .order("ts", { ascending: false })
          .limit(1);
        const row = recent?.[0];
        if (row) {
          await supabase
            .from("pulse_pageviews")
            .update({ engagement_ms: Math.min(engagement, 1_800_000) })
            .eq("id", row.id);
        }
      }

      const vitals = body.v;
      if (vitals && typeof vitals === "object") {
        const names = ["LCP", "CLS", "INP", "TTFB", "FCP"] as const;
        const rows = names
          .map((metric) => ({ metric, value: (vitals as Record<string, unknown>)[metric] }))
          .filter((r) => typeof r.value === "number" && Number.isFinite(r.value))
          .map((r) => ({
            site_id: site.id,
            path,
            metric: r.metric,
            value: r.value as number,
            device_type: device,
          }));
        if (rows.length > 0) await supabase.from("pulse_web_vitals").insert(rows);
      }
      return OK();
    }

    return OK();
  } catch {
    // Silence is the contract: a failure here must never become a visible error
    // on a client's website.
    return OK();
  }
}
