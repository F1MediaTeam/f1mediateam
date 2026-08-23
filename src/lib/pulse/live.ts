// Who is on the site right now.
//
// Built from the tag's own beacons, so it needs no third party and works on
// any site the snippet is pasted into. A "visitor" here is a session hash — a
// per-site, per-day identifier that cannot be tied back to a person or joined
// against another client's data. That is enough to say "two people are reading
// the pricing page" and deliberately not enough to say who they are.
//
// There is no IP anywhere in this file, and there is no column to put one in.

import { createServiceClient } from "@/lib/supabase/server";

/** Someone counts as present if a beacon arrived in this window. */
const LIVE_WINDOW_MINUTES = 5;

export interface LiveVisitor {
  sessionHash: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  /** Referrer for the first page of the visit. */
  arrivedFrom: string | null;
  firstSeen: string;
  lastSeen: string;
  /** Seconds between the first and last beacon of this visit. */
  durationSeconds: number;
  /** Pages in the order they were viewed. */
  path: string[];
  /** Links and buttons they hit, newest first. */
  actions: Array<{ kind: string; target: string | null; ts: string }>;
}

export interface LivePanel {
  windowMinutes: number;
  active: number;
  visitors: LiveVisitor[];
  /** Last 24h, for context beside the live count. */
  todayVisitors: number;
  todayPageviews: number;
}

interface PvRow {
  session_hash: string | null;
  path: string;
  ts: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  referrer_domain: string | null;
  engagement_ms: number | null;
}

export async function livePanel(siteId: string): Promise<LivePanel> {
  const supabase = await createServiceClient();
  const now = Date.now();
  const liveFrom = new Date(now - LIVE_WINDOW_MINUTES * 60_000).toISOString();
  const dayFrom = new Date(now - 86_400_000).toISOString();

  const [{ data: recent }, { data: day }, { data: conv }] = await Promise.all([
    supabase
      .from("pulse_pageviews")
      .select("session_hash, path, ts, country, region, city, device_type, referrer_domain, engagement_ms")
      .eq("site_id", siteId)
      .gte("ts", liveFrom)
      .order("ts", { ascending: true })
      .limit(2_000),
    supabase
      .from("pulse_pageviews")
      .select("session_hash")
      .eq("site_id", siteId)
      .gte("ts", dayFrom)
      .limit(50_000),
    supabase
      .from("pulse_conversions")
      .select("session_hash, kind, target, ts")
      .eq("site_id", siteId)
      .gte("ts", liveFrom)
      .order("ts", { ascending: false })
      .limit(500),
  ]);

  const rows = (recent as PvRow[]) ?? [];
  const actionsBySession = new Map<string, LiveVisitor["actions"]>();
  for (const c of (conv as Array<{ session_hash: string | null; kind: string; target: string | null; ts: string }>) ?? []) {
    if (!c.session_hash) continue;
    const list = actionsBySession.get(c.session_hash) ?? [];
    list.push({ kind: c.kind, target: c.target, ts: c.ts });
    actionsBySession.set(c.session_hash, list);
  }

  const bySession = new Map<string, LiveVisitor>();
  for (const r of rows) {
    if (!r.session_hash) continue;
    const v = bySession.get(r.session_hash);
    if (!v) {
      bySession.set(r.session_hash, {
        sessionHash: r.session_hash,
        country: r.country,
        region: r.region,
        city: r.city,
        device: r.device_type,
        arrivedFrom: r.referrer_domain,
        firstSeen: r.ts,
        lastSeen: r.ts,
        durationSeconds: 0,
        path: [r.path],
        actions: actionsBySession.get(r.session_hash) ?? [],
      });
    } else {
      v.lastSeen = r.ts;
      // Consecutive beacons for the same page are one view, not two.
      if (v.path[v.path.length - 1] !== r.path) v.path.push(r.path);
      // Geography can arrive on a later beacon if an earlier one lacked it.
      v.country ??= r.country;
      v.region ??= r.region;
      v.city ??= r.city;
    }
  }

  const visitors = [...bySession.values()]
    .map((v) => ({
      ...v,
      durationSeconds: Math.max(
        0,
        Math.round((new Date(v.lastSeen).getTime() - new Date(v.firstSeen).getTime()) / 1000),
      ),
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  const dayRows = (day as Array<{ session_hash: string | null }>) ?? [];
  return {
    windowMinutes: LIVE_WINDOW_MINUTES,
    active: visitors.length,
    visitors,
    todayVisitors: new Set(dayRows.map((d) => d.session_hash).filter(Boolean)).size,
    todayPageviews: dayRows.length,
  };
}
