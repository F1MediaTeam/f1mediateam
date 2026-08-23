"use server";

import { requireAdmin } from "@/lib/auth/session";
import { keywordsPanel } from "@/lib/pulse/keywords-panel";
import { findGaps, trackGap, type KeywordGap } from "@/lib/pulse/keyword-gaps";
import { revalidatePath } from "next/cache";

/**
 * Fetched on demand rather than on page load.
 *
 * This makes eight requests to Google's autocomplete endpoint. Doing that
 * every time somebody opens the tab would be slow for them and rude to Google,
 * and most visits to this page are not about finding gaps.
 */
export async function findGapsAction(
  _prev: { gaps: KeywordGap[]; error: string | null },
  formData: FormData,
): Promise<{ gaps: KeywordGap[]; error: string | null }> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) return { gaps: [], error: "Missing site." };
  try {
    const panel = await keywordsPanel(siteId);
    if (panel.ranking.length === 0) {
      return { gaps: [], error: "No Search Console data yet, so there is nothing to expand from." };
    }
    return { gaps: await findGaps(siteId, panel.ranking), error: null };
  } catch (err) {
    return { gaps: [], error: err instanceof Error ? err.message : "Could not reach Google's suggestions." };
  }
}

export async function trackGapAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const phrase = String(formData.get("phrase") ?? "");
  if (!siteId || !phrase) return;
  await trackGap(siteId, phrase);
  revalidatePath(`/admin/pulse/${siteId}`);
}

/** Add one keyword by hand, with the page it should rank. */
export async function addTrackedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const phrase = String(formData.get("phrase") ?? "").trim();
  if (!siteId || !phrase) return;

  const { createServiceClient } = await import("@/lib/supabase/server");
  const supabase = await createServiceClient();
  const { data: site } = await supabase.from("pulse_sites").select("domain").eq("id", siteId).maybeSingle();
  const domain = (site as { domain: string } | null)?.domain ?? "";

  const raw = String(formData.get("targetUrl") ?? "").trim();
  const target = !raw
    ? `https://${domain}/`
    : raw.startsWith("/")
      ? `https://${domain}${raw}`
      : /^https?:\/\//i.test(raw)
        ? raw
        : `https://${raw}`;

  await supabase.from("pulse_keywords").upsert(
    {
      site_id: siteId,
      phrase: phrase.slice(0, 200),
      location_code: 2840,
      device: "desktop",
      is_active: true,
      target_url: target,
      metrics_source: "measured",
    },
    { onConflict: "site_id,phrase,location_code,device" },
  );
  revalidatePath(`/admin/pulse/${siteId}`);
}

/** Change which page a tracked keyword is meant to rank. */
export async function setTargetAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const keywordId = String(formData.get("keywordId") ?? "");
  const raw = String(formData.get("targetUrl") ?? "").trim();
  if (!siteId || !keywordId) return;

  const { createServiceClient } = await import("@/lib/supabase/server");
  const supabase = await createServiceClient();
  const { data: site } = await supabase.from("pulse_sites").select("domain").eq("id", siteId).maybeSingle();
  const domain = (site as { domain: string } | null)?.domain ?? "";

  const target = !raw
    ? null
    : raw.startsWith("/")
      ? `https://${domain}${raw}`
      : /^https?:\/\//i.test(raw)
        ? raw
        : `https://${raw}`;

  await supabase.from("pulse_keywords").update({ target_url: target }).eq("id", keywordId);
  revalidatePath(`/admin/pulse/${siteId}`);
}

/** Stop working on a keyword. Kept rather than deleted, so history survives. */
export async function untrackAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const keywordId = String(formData.get("keywordId") ?? "");
  if (!siteId || !keywordId) return;
  const { createServiceClient } = await import("@/lib/supabase/server");
  const supabase = await createServiceClient();
  await supabase.from("pulse_keywords").update({ is_active: false }).eq("id", keywordId);
  revalidatePath(`/admin/pulse/${siteId}`);
}
