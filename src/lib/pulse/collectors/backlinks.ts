// Backlink collector — weekly, or on demand.
//
// The interesting output is the diff, not the list. A link that is still there
// is not news; one that appeared or vanished since last week is. So every run
// reconciles the returned set against what we already hold:
//
//   in the response, not in the table   → new
//   in both                             → live, last_seen bumped
//   in the table, not in the response   → lost
//
// A provider returning nothing is treated as a failed run rather than "every
// link died overnight", which would otherwise fire a lost event for every row
// we hold and bury a real loss in the noise.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchBacklinks } from "@/lib/pulse/providers/serp";
import type { PulseSite } from "@/lib/pulse/sites";

export interface BacklinkRunResult {
  siteId: string;
  domain: string;
  total: number;
  added: number;
  lost: number;
  mocked: boolean;
  skipped?: string;
}

export async function runBacklinks(site: PulseSite): Promise<BacklinkRunResult> {
  const supabase = await createServiceClient();
  const { results, mocked } = await fetchBacklinks(site.domain);

  const { data: existingRows } = await supabase
    .from("pulse_backlinks")
    .select("id, source_url, status")
    .eq("site_id", site.id);
  const existing = (existingRows as Array<{ id: string; source_url: string; status: string }>) ?? [];

  if (results.length === 0 && existing.length > 0) {
    return {
      siteId: site.id,
      domain: site.domain,
      total: existing.length,
      added: 0,
      lost: 0,
      mocked,
      skipped: "Provider returned nothing — kept the existing set rather than marking every link lost.",
    };
  }

  const now = new Date().toISOString();
  const seenUrls = new Set(results.map((r) => r.sourceUrl));
  const knownUrls = new Map(existing.map((e) => [e.source_url, e]));

  const fresh = results.filter((r) => !knownUrls.has(r.sourceUrl));
  const returning = results.filter((r) => knownUrls.get(r.sourceUrl)?.status === "lost");

  // Everything present goes in as live; the ones we had not seen before are
  // marked new so the dashboard can list this week's arrivals.
  const upserts = results.map((r) => ({
    site_id: site.id,
    source_url: r.sourceUrl,
    source_domain: r.sourceDomain,
    target_url: r.targetUrl,
    anchor: r.anchor,
    last_seen: now,
    status: knownUrls.has(r.sourceUrl) ? "live" : "new",
    metrics: r.metrics,
  }));
  if (upserts.length > 0) {
    await supabase.from("pulse_backlinks").upsert(upserts, { onConflict: "site_id,source_url" });
  }

  const goneIds = existing.filter((e) => e.status !== "lost" && !seenUrls.has(e.source_url)).map((e) => e.id);
  if (goneIds.length > 0) {
    await supabase.from("pulse_backlinks").update({ status: "lost" }).in("id", goneIds);
  }

  const events: Array<Record<string, unknown>> = [];
  if (fresh.length > 0) {
    // One event for the batch. Fifty separate rows for fifty new links is a
    // feed nobody reads.
    events.push({
      site_id: site.id,
      kind: "backlink_new",
      severity: "good",
      title:
        fresh.length === 1
          ? `New backlink from ${fresh[0].sourceDomain}`
          : `${fresh.length} new backlinks`,
      payload: { domains: fresh.slice(0, 10).map((f) => f.sourceDomain), count: fresh.length },
    });
  }
  if (goneIds.length > 0) {
    events.push({
      site_id: site.id,
      kind: "backlink_lost",
      severity: "warning",
      title: goneIds.length === 1 ? "A backlink was lost" : `${goneIds.length} backlinks lost`,
      payload: { count: goneIds.length },
    });
  }
  if (events.length > 0) await supabase.from("pulse_feed_events").insert(events);

  return {
    siteId: site.id,
    domain: site.domain,
    total: results.length,
    added: fresh.length + returning.length,
    lost: goneIds.length,
    mocked,
  };
}
