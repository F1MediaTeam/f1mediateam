"use server";

import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { discoverKeywords, type DiscoveredKeyword } from "@/lib/pulse/keyword-discovery";
import { revalidatePath } from "next/cache";

export interface SiteOption {
  id: string;
  domain: string;
  label: string;
}

export async function listSitesAction(): Promise<SiteOption[]> {
  await requireAdmin();
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("pulse_sites")
    .select("id, domain, clients(company_name)")
    .order("domain");
  return (
    (data as Array<{ id: string; domain: string; clients: { company_name: string } | { company_name: string }[] | null }>) ?? []
  ).map((s) => {
    const c = Array.isArray(s.clients) ? s.clients[0] : s.clients;
    return { id: s.id, domain: s.domain, label: c?.company_name ?? s.domain };
  });
}

export async function discoverAction(
  _prev: { seed: string; results: DiscoveredKeyword[]; error: string | null },
  formData: FormData,
): Promise<{ seed: string; results: DiscoveredKeyword[]; error: string | null }> {
  await requireAdmin();
  const seed = String(formData.get("seed") ?? "").trim();
  if (!seed) return { seed: "", results: [], error: "Enter a keyword to expand." };
  try {
    const results = await discoverKeywords(seed);
    if (results.length === 0) {
      return { seed, results: [], error: "Google returned no suggestions for that phrase." };
    }
    return { seed, results, error: null };
  } catch (err) {
    return { seed, results: [], error: err instanceof Error ? err.message : "Discovery failed." };
  }
}

/** Attach chosen keywords to a client, with the page they should rank. */
export async function trackForSiteAction(
  _prev: { message: string | null; error: string | null },
  formData: FormData,
): Promise<{ message: string | null; error: string | null }> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const phrases = formData.getAll("phrase").map(String).filter(Boolean);
  const rawTarget = String(formData.get("targetUrl") ?? "").trim();
  if (!siteId) return { message: null, error: "Pick a client first." };
  if (phrases.length === 0) return { message: null, error: "Select at least one keyword." };

  const supabase = await createServiceClient();
  const { data: site } = await supabase
    .from("pulse_sites")
    .select("id, domain")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return { message: null, error: "Unknown client." };

  // A bare path attaches to the client's own domain; blank means the homepage.
  const domain = (site as { domain: string }).domain;
  const target = !rawTarget
    ? `https://${domain}/`
    : rawTarget.startsWith("/")
      ? `https://${domain}${rawTarget}`
      : /^https?:\/\//i.test(rawTarget)
        ? rawTarget
        : `https://${rawTarget}`;

  const rows = phrases.map((phrase) => ({
    site_id: siteId,
    phrase: phrase.slice(0, 200),
    location_code: 2840,
    device: "desktop",
    is_active: true,
    target_url: target,
    metrics_source: "measured",
  }));

  // The real constraint is all four columns, not just site and phrase — the
  // same phrase can be tracked for a different location or device.
  const { error } = await supabase
    .from("pulse_keywords")
    .upsert(rows, { onConflict: "site_id,phrase,location_code,device" });
  if (error) return { message: null, error: error.message };

  revalidatePath(`/admin/pulse/${siteId}`);
  revalidatePath("/admin/pulse/keyword-lab");
  return {
    message: `Tracking ${phrases.length} keyword${phrases.length === 1 ? "" : "s"} for ${domain}, targeting ${target}.`,
    error: null,
  };
}
