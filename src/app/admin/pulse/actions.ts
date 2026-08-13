"use server";

// Server actions behind the F1 Pulse screens. Each re-checks the admin role —
// the UI is admin-only but that is a client component and can't be trusted.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { staffRoleOf } from "@/lib/permissions";
import { checkInstallation, createSite, getSite, normalizeDomain } from "@/lib/pulse/sites";
import { createServiceClient } from "@/lib/supabase/server";

export async function addPulseSiteAction(input: {
  clientId: string;
  domain: string;
  crawlExclusions: string;
}): Promise<{ error: string | null; siteId?: string }> {
  await requireAdmin();
  if (!input.clientId) return { error: "Pick a client." };

  const exclusions = input.crawlExclusions
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const { site, error } = await createSite({
    clientId: input.clientId,
    domain: input.domain,
    crawlExclusions: exclusions,
  });
  if (error || !site) return { error: error ?? "Couldn't add that site." };

  revalidatePath("/admin/pulse");
  return { error: null, siteId: site.id };
}

export async function checkInstallAction(
  siteId: string,
): Promise<{ error: string | null; installed?: boolean; reason?: string }> {
  const session = await requireAdmin();
  const profile = await data.getProfile(session.user_id);
  if (staffRoleOf(profile) === "contractor") {
    return { error: "Contractors can view but not run checks." };
  }

  const site = await getSite(siteId);
  if (!site) return { error: "Unknown site." };

  const result = await checkInstallation(site);
  revalidatePath("/admin/pulse");
  return { error: null, installed: result.installed, reason: result.reason };
}

/**
 * The origin the snippet should point at.
 *
 * Pinned, deliberately not taken from the request. A snippet is pasted once
 * into someone else's footer and may not be touched again for years — if the
 * install card were opened on a preview deployment, the request host would
 * bake a `*.vercel.app` URL into a live client site that dies with that
 * deployment. The request host is only trusted on localhost, where there is
 * no production origin to point at.
 */
export async function pulseOrigin(): Promise<string> {
  const pinned = process.env.PULSE_TAG_ORIGIN;
  if (pinned) return pinned.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (/^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host)) {
    const proto = h.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }
  return "https://f1mediateam.com";
}

// --- keywords ---

export async function addKeywordAction(input: {
  siteId: string;
  phrase: string;
}): Promise<{ error: string | null }> {
  await requireAdmin();
  const phrase = input.phrase.trim().toLowerCase();
  if (!phrase || phrase.length > 120) return { error: "Enter a keyword." };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pulse_keywords")
    .insert({ site_id: input.siteId, phrase });
  if (error) {
    if (error.code === "23505") return { error: "Already tracking that phrase." };
    return { error: error.message };
  }
  revalidatePath(`/admin/pulse/${input.siteId}`);
  return { error: null };
}

export async function toggleKeywordAction(
  keywordId: string,
  isActive: boolean,
): Promise<{ error: string | null }> {
  await requireAdmin();
  const supabase = await createServiceClient();
  // Pausing keeps every stored check — only future runs skip it.
  const { error } = await supabase
    .from("pulse_keywords")
    .update({ is_active: isActive })
    .eq("id", keywordId);
  revalidatePath("/admin/pulse", "layout");
  return { error: error?.message ?? null };
}

export async function removeKeywordAction(keywordId: string): Promise<{ error: string | null }> {
  await requireAdmin();
  const supabase = await createServiceClient();
  // Rank checks cascade with the keyword — deleting really does discard the
  // history, which is why the UI asks twice.
  const { error } = await supabase.from("pulse_keywords").delete().eq("id", keywordId);
  revalidatePath("/admin/pulse", "layout");
  return { error: error?.message ?? null };
}

// --- competitors ---

/**
 * Track a competitor domain for one client site.
 *
 * The domain row is shared: two clients watching the same competitor point at
 * one pulse_domains row and therefore one set of measurements, so we visit
 * that competitor's server once rather than once per client.
 */
export async function addCompetitorAction(input: {
  siteId: string;
  domain: string;
}): Promise<{ error: string | null }> {
  await requireAdmin();
  const domain = normalizeDomain(input.domain);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { error: "That doesn't look like a domain." };
  }

  const supabase = await createServiceClient();

  const site = await getSite(input.siteId);
  if (!site) return { error: "Unknown site." };
  if (site.domain === domain) return { error: "That's this client's own site." };

  // Upsert rather than insert: the domain may already exist because another
  // client tracks it, or because it is itself a client of ours.
  const { data: existing } = await supabase
    .from("pulse_domains")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();

  let domainId = existing?.id as string | undefined;
  if (!domainId) {
    const { data: created, error } = await supabase
      .from("pulse_domains")
      .insert({ domain, kind: "competitor" })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Couldn't add that domain." };
    domainId = created.id as string;
  }

  const { error: linkError } = await supabase
    .from("pulse_competitors")
    .upsert({ site_id: input.siteId, domain_id: domainId, is_active: true }, { onConflict: "site_id,domain_id" });
  if (linkError) return { error: linkError.message };

  revalidatePath(`/admin/pulse/${input.siteId}`);
  return { error: null };
}

export async function removeCompetitorAction(input: {
  siteId: string;
  domainId: string;
}): Promise<{ error: string | null }> {
  await requireAdmin();
  const supabase = await createServiceClient();
  // Unlink rather than delete the domain: its measurements stay, so re-adding
  // it later restores the history instead of starting from nothing.
  const { error } = await supabase
    .from("pulse_competitors")
    .delete()
    .eq("site_id", input.siteId)
    .eq("domain_id", input.domainId);
  revalidatePath(`/admin/pulse/${input.siteId}`);
  return { error: error?.message ?? null };
}
