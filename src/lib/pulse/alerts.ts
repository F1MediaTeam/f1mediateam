// Telling someone when it matters.
//
// Nine collectors write feed events and, until now, nothing read them. A feed
// event nobody sees is worth nothing — a client's site could have been down
// for a week and Pulse would have recorded it faithfully and told no one.
//
// Two speeds, deliberately:
//
//   urgent    emailed immediately. Something is broken or losing the client
//             money right now, and an hour matters.
//   digest    queued into the portal's existing notification_events table and
//             folded into the batched email that already goes out. Worth
//             knowing, not worth interrupting someone for.
//
// Everything else is feed-only. A crawl finding 40 missing meta descriptions
// is real work, but emailing it teaches people to ignore emails from us.

import { createServiceClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/lib/email";
import { queueEvent } from "@/lib/notify-queue";

/** Broken, or actively costing the client. Emailed on sight. */
const URGENT = new Set(["site_down", "tag_missing", "bot_block_change", "pages_regressed"]);

/** Worth knowing by the next digest. */
const DIGEST = new Set([
  "site_recovered",
  "tag_detected",
  "tag_origin_rejected",
  "review_new",
  "opportunity_new",
  "cannibalization_found",
  "competitor_new_content",
  "index_run_completed",
  "pages_fixed",
]);

/** Plain English, because the subject line is often all anyone reads. */
const SUBJECT: Record<string, (title: string, domain: string) => string> = {
  site_down: (_t, d) => `${d} is not responding`,
  tag_missing: (_t, d) => `Analytics tag missing on ${d}`,
  bot_block_change: (_t, d) => `Crawler access changed on ${d}`,
  pages_regressed: (t, d) => `${d}: ${t}`,
};

export interface AlertResult {
  urgentSent: number;
  queued: number;
  considered: number;
}

/**
 * Send alerts for feed events nobody has been told about yet.
 *
 * Uses a marker on the event payload rather than a new column: the first pass
 * stamps `notified_at`, and later passes skip anything stamped. That keeps
 * this idempotent — running the dispatcher twice in an hour cannot email the
 * same outage twice — without another migration.
 */
export async function dispatchAlerts(sinceMinutes = 180): Promise<AlertResult> {
  const supabase = await createServiceClient();
  const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();

  const { data: rows } = await supabase
    .from("pulse_feed_events")
    .select("id, site_id, ts, kind, severity, title, payload")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(200);

  const events =
    (rows as Array<{
      id: number;
      site_id: string;
      kind: string;
      severity: string;
      title: string;
      payload: Record<string, unknown>;
    }>) ?? [];

  const fresh = events.filter((e) => !e.payload?.notified_at);
  if (fresh.length === 0) return { urgentSent: 0, queued: 0, considered: events.length };

  // One lookup for every site involved rather than one per event.
  const siteIds = [...new Set(fresh.map((e) => e.site_id))];
  const { data: siteRows } = await supabase
    .from("pulse_sites")
    .select("id, domain, client_id")
    .in("id", siteIds);
  const sites = new Map(
    ((siteRows as Array<{ id: string; domain: string; client_id: string }>) ?? []).map((s) => [s.id, s]),
  );

  let urgentSent = 0;
  let queued = 0;

  for (const e of fresh) {
    const site = sites.get(e.site_id);
    if (!site) continue;

    if (URGENT.has(e.kind)) {
      const subject = (SUBJECT[e.kind] ?? ((t: string) => t))(e.title, site.domain);
      await notifyAdmins({
        subject,
        heading: subject,
        body: `${e.title}\n\nSite: ${site.domain}`,
        ctaLabel: "Open in F1 Pulse",
        ctaPath: `/admin/pulse/${e.site_id}`,
      });
      urgentSent += 1;
    } else if (DIGEST.has(e.kind)) {
      await queueEvent(
        {
          client_id: site.client_id,
          audience: "admin",
          kind: "pulse_alert",
          title: `${site.domain}: ${e.title}`,
          detail: null,
        },
        {
          subject: `${site.domain}: ${e.title}`,
          heading: e.title,
          body: `Site: ${site.domain}`,
          ctaLabel: "Open in F1 Pulse",
          ctaPath: `/admin/pulse/${e.site_id}`,
        },
      );
      queued += 1;
    } else {
      // Feed-only. Still stamped, so it is never reconsidered.
    }

    await supabase
      .from("pulse_feed_events")
      .update({ payload: { ...e.payload, notified_at: new Date().toISOString() } })
      .eq("id", e.id);
  }

  return { urgentSent, queued, considered: events.length };
}
