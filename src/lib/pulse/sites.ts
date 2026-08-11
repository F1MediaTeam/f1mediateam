// Site records and install verification.
//
// Everything here runs server-side with the service-role client: the pulse
// tables are RLS default-deny with no write policy, so writes have no other
// route in. Reads go through the same client for consistency — the caller has
// already been through requireAdmin().

import { createServiceClient } from "@/lib/supabase/server";

export interface PulseSite {
  id: string;
  client_id: string;
  domain: string;
  site_key: string;
  status: "pending" | "live" | "tag_missing" | "down";
  sitemap_url: string | null;
  crawl_exclusions: string[];
  allowed_origins: string[];
  crawl_page_cap: number;
  last_beacon_at: string | null;
  last_crawled_at: string | null;
  created_at: string;
}

/** Strip scheme, path, and www so a domain is stored one way only. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export async function listSites(clientIds: string[] | null): Promise<PulseSite[]> {
  const supabase = await createServiceClient();
  let q = supabase.from("pulse_sites").select("*").order("created_at", { ascending: true });
  // null means no restriction — see visibleClientIds().
  if (clientIds !== null) {
    if (clientIds.length === 0) return [];
    q = q.in("client_id", clientIds);
  }
  const { data } = await q;
  return (data as PulseSite[]) ?? [];
}

export async function getSite(id: string): Promise<PulseSite | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase.from("pulse_sites").select("*").eq("id", id).maybeSingle();
  return (data as PulseSite) ?? null;
}

export async function createSite(input: {
  clientId: string;
  domain: string;
  crawlExclusions?: string[];
}): Promise<{ site: PulseSite | null; error: string | null }> {
  const domain = normalizeDomain(input.domain);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { site: null, error: "That doesn't look like a domain." };
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("pulse_sites")
    .insert({
      client_id: input.clientId,
      domain,
      crawl_exclusions: input.crawlExclusions ?? [],
    })
    .select()
    .single();

  if (error) {
    // The unique constraint is on (client_id, domain); a duplicate is a
    // mistake worth naming rather than a failure worth surfacing raw.
    if (error.code === "23505") return { site: null, error: "That site is already set up." };
    return { site: null, error: error.message };
  }
  return { site: data as PulseSite, error: null };
}

/** The line pasted into a client's footer. One place, so it can't drift. */
export function snippetFor(siteKey: string, origin: string): string {
  return `<script defer src="${origin}/f1.js" data-site="${siteKey}"></script>`;
}

export interface InstallCheck {
  installed: boolean;
  reason: string;
  /** true when a real browser has already sent a beacon */
  beaconSeen: boolean;
  /** true when the tag was found in the served HTML */
  tagInHtml: boolean;
  statusCode: number | null;
}

/**
 * Two independent ways to prove an install, because either alone has a blind
 * spot: the HTML scan misses tags injected by a script or a tag manager, and
 * the beacon check misses a correct install nobody has visited yet. Either one
 * counts.
 */
export async function checkInstallation(site: PulseSite): Promise<InstallCheck> {
  const beaconSeen = Boolean(site.last_beacon_at);

  let tagInHtml = false;
  let statusCode: number | null = null;
  try {
    const res = await fetch(`https://${site.domain}/`, {
      headers: { "user-agent": "F1PulseBot/1.0 (+https://f1mediateam.com)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    statusCode = res.status;
    const html = await res.text();
    tagInHtml = html.includes(site.site_key) || /\/f1\.js/.test(html);
  } catch {
    statusCode = null;
  }

  const installed = beaconSeen || tagInHtml;
  const reason = beaconSeen
    ? "A real visit has already been recorded."
    : tagInHtml
      ? "The tag is in the page source, waiting on its first visitor."
      : statusCode === null
        ? "Couldn't reach the site to check."
        : "The tag isn't in the page source yet.";

  if (installed && site.status === "pending") {
    const supabase = await createServiceClient();
    await supabase.from("pulse_sites").update({ status: "live" }).eq("id", site.id);
    await supabase.from("pulse_feed_events").insert({
      site_id: site.id,
      kind: "tag_detected",
      severity: "good",
      title: `Tag detected on ${site.domain}`,
      payload: { via: beaconSeen ? "beacon" : "html" },
    });
  }

  return { installed, reason, beaconSeen, tagInHtml, statusCode };
}
