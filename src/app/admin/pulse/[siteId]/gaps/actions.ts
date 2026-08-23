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
