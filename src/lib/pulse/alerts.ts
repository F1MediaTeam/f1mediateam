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
  /** Events folded into another alert rather than sent on their own. */
  collapsed: number;
}

/**
 * Send alerts for feed events nobody has been told about yet.
 *
 * Uses a marker on the event payload rather than a new column: the first pass
 * stamps `notified_at`, and later passes skip anything stamped. That keeps
 * this idempotent — running the dispatcher twice in an hour cannot email the
 * same outage twice — without another migration.
 *
 * The window used to be three hours, which was right when this was expected to
 * run hourly and silently wrong once it moved to a daily cron: events landing
 * in the other twenty-one hours aged out of the window before anything looked
 * at them, and because the window only ever moves forward they were never
 * reconsidered. Not a delayed alert — no alert, ever. Found by counting the
 * unstamped rows in production: eighty-one of them, going back ten days.
 *
 * So the window is now wide enough that a missed run cannot drop anything, and
 * the stamp — not the clock — is what stops a repeat. Widening it alone would
 * have turned the first run into a flood, which is presumably how it ended up
 * narrow in the first place, so events are collapsed to one alert per site per
 * kind. Twenty-four rejected-origin notices for one site is one thing worth
 * knowing, not twenty-four; the newest speaks for the group and the rest are
 * stamped silently.
 */
export async function dispatchAlerts({
  lookbackHours = 168,
  maxUrgentEmails = 10,
}: { lookbackHours?: number; maxUrgentEmails?: number } = {}): Promise<AlertResult> {
  const supabase = await createServiceClient();
  const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();

  const { data: rows } = await supabase
    .from("pulse_feed_events")
    .select("id, site_id, ts, kind, severity, title, payload")
    .gte("ts", since)
    .is("payload->>notified_at", null)
    .order("ts", { ascending: false })
    .limit(500);

  const events =
    (rows as Array<{
      id: number;
      site_id: string;
      ts: string;
      kind: string;
      severity: string;
      title: string;
      payload: Record<string, unknown>;
    }>) ?? [];

  // The query already excludes stamped rows; this also covers a payload where
  // the marker is present but not a string.
  const fresh = events.filter((e) => !e.payload?.notified_at);
  if (fresh.length === 0) {
    return { urgentSent: 0, queued: 0, considered: events.length, collapsed: 0 };
  }

  // One alert per site per kind. Rows arrive newest-first, so the first of
  // each group is the one that speaks for it.
  const groups = new Map<string, { lead: (typeof fresh)[number]; all: typeof fresh }>();
  for (const e of fresh) {
    const key = `${e.site_id}:${e.kind}`;
    const g = groups.get(key);
    if (g) g.all.push(e);
    else groups.set(key, { lead: e, all: [e] });
  }

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

  for (const { lead: e, all } of groups.values()) {
    const site = sites.get(e.site_id);
    if (!site) continue;

    // Stamped whatever happens below, so nothing is reconsidered tomorrow.
    const stampAll = () =>
      Promise.all(
        all.map((row) =>
          supabase
            .from("pulse_feed_events")
            .update({ payload: { ...row.payload, notified_at: new Date().toISOString() } })
            .eq("id", row.id),
        ),
      );

    // A refusal the ingest route already recognised as the client's own
    // preview host. Recorded, never emailed — it is the whitelist working.
    if (e.payload?.expected === true) {
      await stampAll();
      continue;
    }

    // "and 23 others" is the difference between a useful notice and a lie by
    // omission, so the count travels with the alert whenever it is above one.
    const more = all.length - 1;
    const suffix = more > 0 ? ` (and ${more} more like it)` : "";

    if (URGENT.has(e.kind)) {
      if (urgentSent >= maxUrgentEmails) {
        // A backlog this size is itself the story; mailing all of it helps
        // nobody. The rest stay unstamped so the next run picks them up.
        continue;
      }
      const subject = (SUBJECT[e.kind] ?? ((t: string) => t))(e.title, site.domain);
      await notifyAdmins({
        subject,
        heading: subject,
        body: `${e.title}${suffix}\n\nSite: ${site.domain}`,
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
          title: `${site.domain}: ${e.title}${suffix}`,
          detail: null,
        },
        {
          subject: `${site.domain}: ${e.title}`,
          heading: e.title,
          body: `Site: ${site.domain}${suffix ? `\n\n${more + 1} of these since ${new Date(all[all.length - 1].ts).toLocaleDateString("en-US")}.` : ""}`,
          ctaLabel: "Open in F1 Pulse",
          ctaPath: `/admin/pulse/${e.site_id}`,
        },
      );
      queued += 1;
    } else {
      // Feed-only. Still stamped, so it is never reconsidered.
    }

    await stampAll();
  }

  return {
    urgentSent,
    queued,
    considered: events.length,
    collapsed: events.length - groups.size,
  };
}
