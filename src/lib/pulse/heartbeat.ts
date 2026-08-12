// Heartbeat — is the site up, and is the tag still on it?
//
// Silence is ambiguous on its own: no beacons for hours could mean the site is
// down, the tag was removed during a redeploy, or simply that nobody visited a
// quiet site overnight. So silence only triggers a *look*; the fetch is what
// decides which of those it is.

import { createServiceClient } from "@/lib/supabase/server";
import type { PulseSite } from "@/lib/pulse/sites";

/** How long a live site may go quiet before we go and check on it. */
const SILENCE_HOURS = 6;

export interface HeartbeatResult {
  siteId: string;
  domain: string;
  checked: boolean;
  status: PulseSite["status"];
  changed: boolean;
  note: string;
}

export async function runHeartbeat(site: PulseSite): Promise<HeartbeatResult> {
  const supabase = await createServiceClient();
  const quietSince = site.last_beacon_at ? Date.now() - Date.parse(site.last_beacon_at) : Infinity;
  const quiet = quietSince > SILENCE_HOURS * 3_600_000;

  // A site that has never reported is 'pending', not 'down' — nothing has gone
  // wrong, it just hasn't been installed yet.
  if (site.status === "pending") {
    return { siteId: site.id, domain: site.domain, checked: false, status: "pending", changed: false, note: "Awaiting first beacon." };
  }
  if (!quiet) {
    return { siteId: site.id, domain: site.domain, checked: false, status: site.status, changed: false, note: "Beacons arriving normally." };
  }

  let reachable = false;
  let tagPresent = false;
  try {
    const res = await fetch(`https://${site.domain}/`, {
      // Accept headers matter: some hosts answer 406 to a bare User-Agent and
      // the site would read as down forever.
      headers: {
        "user-agent": "F1PulseBot/1.0 (+https://f1mediateam.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    reachable = res.ok;
    if (res.ok) {
      const html = await res.text();
      tagPresent = html.includes(site.site_key) || /\/f1\.js/.test(html);
    }
  } catch {
    reachable = false;
  }

  const next: PulseSite["status"] = !reachable ? "down" : tagPresent ? "live" : "tag_missing";
  const changed = next !== site.status;

  if (changed) {
    await supabase.from("pulse_sites").update({ status: next }).eq("id", site.id);

    // One event per transition, never per check — otherwise a site that is down
    // for a day fills the feed with the same alert every hour.
    const events: Record<string, { kind: string; severity: string; title: string }> = {
      down: { kind: "site_down", severity: "critical", title: `${site.domain} is unreachable` },
      tag_missing: { kind: "tag_missing", severity: "warning", title: `Tag missing on ${site.domain}` },
      live: {
        kind: site.status === "down" ? "site_recovered" : "tag_detected",
        severity: "good",
        title: site.status === "down" ? `${site.domain} is back up` : `Tag is back on ${site.domain}`,
      },
    };
    const e = events[next];
    if (e) {
      await supabase.from("pulse_feed_events").insert({
        site_id: site.id,
        kind: e.kind,
        severity: e.severity,
        title: e.title,
        payload: { previous: site.status, quiet_hours: Math.round(quietSince / 3_600_000) },
      });
    }
  }

  return {
    siteId: site.id,
    domain: site.domain,
    checked: true,
    status: next,
    changed,
    note: !reachable
      ? "Site did not respond."
      : tagPresent
        ? "Site up, tag present — just quiet."
        : "Site up but the tag is gone.",
  };
}
