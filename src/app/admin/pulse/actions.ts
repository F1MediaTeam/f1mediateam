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
import { getValidAccessToken } from "@/lib/connectors/google-oauth";
import { generateKeywords, generatePrompts, type BusinessProfile } from "@/lib/pulse/onboarding";

export async function addPulseSiteAction(input: {
  clientId: string;
  domain: string;
  crawlExclusions: string;
  /** Section 8 business profile — optional at onboarding, editable later. */
  industry?: string;
  services?: string;
  serviceAreas?: string;
  platform?: string;
  profileNotes?: string;
  /** Seed the generated keyword and prompt proposals straight away. */
  seedKeywords?: boolean;
}): Promise<{ error: string | null; siteId?: string; seeded?: { keywords: number; prompts: number } }> {
  await requireAdmin();
  if (!input.clientId) return { error: "Pick a client." };

  const exclusions = splitList(input.crawlExclusions);

  const { site, error } = await createSite({
    clientId: input.clientId,
    domain: input.domain,
    crawlExclusions: exclusions,
  });
  if (error || !site) return { error: error ?? "Couldn't add that site." };

  const profile = {
    industry: input.industry?.trim() || null,
    services: splitList(input.services ?? ""),
    serviceAreas: splitList(input.serviceAreas ?? ""),
    platform: input.platform?.trim() || null,
    notes: input.profileNotes?.trim() || null,
  };

  const supabase = await createServiceClient();
  await supabase
    .from("pulse_sites")
    .update({
      industry: profile.industry,
      services: profile.services,
      service_areas: profile.serviceAreas,
      platform: profile.platform,
      profile_notes: profile.notes,
    })
    .eq("id", site.id);

  let seeded = { keywords: 0, prompts: 0 };
  if (input.seedKeywords !== false) seeded = await seedFromProfile(site.id, profile);

  revalidatePath("/admin/pulse");
  return { error: null, siteId: site.id, seeded };
}

/** Split a textarea or comma list into clean entries. */
function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Write the generated proposals.
 *
 * Everything written here is a starting point the user is expected to edit —
 * which is why nothing is overwritten on a re-run: `ignoreDuplicates` means
 * re-seeding after editing the profile adds what is new and leaves alone
 * anything already reviewed, paused, or deleted.
 */
async function seedFromProfile(
  siteId: string,
  profile: BusinessProfile,
): Promise<{ keywords: number; prompts: number }> {
  const supabase = await createServiceClient();

  const keywords = generateKeywords(profile);
  const prompts = generatePrompts(profile);

  if (keywords.length > 0) {
    // The unique key is (site_id, phrase, location_code, device) — the same
    // phrase is legitimately tracked twice for two locations. The conflict
    // target has to name all four or Postgres rejects the statement, so the
    // defaults are written explicitly rather than left implied.
    await supabase.from("pulse_keywords").upsert(
      keywords.map((phrase) => ({
        site_id: siteId,
        phrase,
        location_code: 2840, // United States
        device: "desktop",
      })),
      { onConflict: "site_id,phrase,location_code,device", ignoreDuplicates: true },
    );
  }
  if (prompts.length > 0) {
    await supabase.from("pulse_ai_prompts").upsert(
      prompts.map((prompt) => ({ site_id: siteId, prompt })),
      { onConflict: "site_id,prompt", ignoreDuplicates: true },
    );
  }

  return { keywords: keywords.length, prompts: prompts.length };
}

/**
 * Update an existing site's profile, and optionally re-seed from it.
 *
 * This is the "add more information to clients I already have" path: the four
 * sites already registered were created before the profile existed, so they
 * carry none of it.
 */
export async function updateSiteProfileAction(input: {
  siteId: string;
  industry: string;
  services: string;
  serviceAreas: string;
  platform: string;
  profileNotes: string;
  crawlExclusions: string;
  reseed: boolean;
}): Promise<{ error: string | null; seeded?: { keywords: number; prompts: number } }> {
  await requireAdmin();

  const profile = {
    industry: input.industry.trim() || null,
    services: splitList(input.services),
    serviceAreas: splitList(input.serviceAreas),
    platform: input.platform.trim() || null,
    notes: input.profileNotes.trim() || null,
  };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pulse_sites")
    .update({
      industry: profile.industry,
      services: profile.services,
      service_areas: profile.serviceAreas,
      platform: profile.platform,
      profile_notes: profile.notes,
      crawl_exclusions: splitList(input.crawlExclusions),
    })
    .eq("id", input.siteId);
  if (error) return { error: error.message };

  const seeded = input.reseed ? await seedFromProfile(input.siteId, profile) : undefined;

  revalidatePath(`/admin/pulse/${input.siteId}`);
  revalidatePath("/admin/pulse");
  return { error: null, seeded };
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

// --- Search Console property (index inspector) ---

/**
 * Save the property id and prove it works in one step.
 *
 * Saving alone proves nothing — the string can be subtly wrong (a URL-prefix
 * property written as a domain property, or a missing trailing slash) and
 * Google answers 403 rather than 404, which reads like a permissions problem.
 * So this performs one real inspection against the homepage and only sets
 * gsc_connected when Google actually answers.
 */
export async function verifyGscPropertyAction(input: {
  siteId: string;
  property: string;
}): Promise<{ error: string | null; connected: boolean }> {
  await requireAdmin();
  const property = input.property.trim();
  if (!property) return { error: "Enter the property id.", connected: false };

  const site = await getSite(input.siteId);
  if (!site) return { error: "Unknown site.", connected: false };

  const supabase = await createServiceClient();
  await supabase.from("pulse_sites").update({ gsc_property: property }).eq("id", input.siteId);

  const connectors = await data.listConnectors(site.client_id);
  const token = connectors.find((c) => c.provider === "gsc");
  if (!token) {
    return {
      error: "This client has no Search Console connection yet — connect Google on the client's page first.",
      connected: false,
    };
  }

  try {
    const { access_token } = await getValidAccessToken(token.id);
    const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: `https://${site.domain}/`, siteUrl: property }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      const readable =
        res.status === 403
          ? "Google refused that property. Check it matches the verified property exactly — a domain property is \"sc-domain:example.com\", a URL-prefix property is \"https://www.example.com/\" including the trailing slash — and that the connected Google account is an owner or full user, not a restricted one."
          : res.status === 404
            ? "Google doesn't recognise that property for this account."
            : `Google returned ${res.status}: ${text.slice(0, 160)}`;
      await supabase.from("pulse_sites").update({ gsc_connected: false }).eq("id", input.siteId);
      return { error: readable, connected: false };
    }

    await supabase.from("pulse_sites").update({ gsc_connected: true }).eq("id", input.siteId);
    revalidatePath(`/admin/pulse/${input.siteId}`);
    return { error: null, connected: true };
  } catch (err) {
    await supabase.from("pulse_sites").update({ gsc_connected: false }).eq("id", input.siteId);
    return {
      error: err instanceof Error ? err.message : "Couldn't reach Search Console.",
      connected: false,
    };
  }
}
