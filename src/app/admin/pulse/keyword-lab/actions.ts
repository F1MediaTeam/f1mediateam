"use server";

// Server actions behind Keyword Lab.
//
// Every one re-checks the admin role. The UI is admin-only but it is a client
// component and cannot be trusted, and these actions spend money — which makes
// them a more attractive target than a read.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { staffRoleOf } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { getSite } from "@/lib/pulse/sites";
import {
  analyzeKeyword,
  checkRank,
  resolveTarget,
  spendSummary,
  type AnalyzeResult,
  type KeywordMetrics,
  type SpendSummary,
} from "@/lib/pulse/keyword-lab";

/** Spending is a manager decision, not something every seat can trigger. */
async function requireSpender(): Promise<{ ok: boolean; reason?: string }> {
  const session = await requireAdmin();
  const profile = await data.getProfile(session.user_id);
  const role = staffRoleOf(profile);
  if (role === "contractor" || role === "specialist") {
    return { ok: false, reason: "Only owners and managers can run paid research." };
  }
  return { ok: true };
}

export async function analyzeAction(
  seed: string,
): Promise<{ error: string | null; result?: AnalyzeResult; spend?: SpendSummary }> {
  const gate = await requireSpender();
  if (!gate.ok) return { error: gate.reason ?? "Not allowed." };

  try {
    const result = await analyzeKeyword(seed);
    return { error: null, result, spend: await spendSummary() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not analyze that keyword." };
  }
}

/**
 * Track keywords against a site.
 *
 * Writes to pulse_keywords — the same table the Rankings tab reads — so
 * anything added here is tracked everywhere rather than only inside this tool.
 */
export async function trackKeywordsAction(input: {
  siteId: string;
  keywords: KeywordMetrics[];
  targetUrl: string;
}): Promise<{ error: string | null; added?: number; skipped?: number }> {
  await requireAdmin();
  const site = await getSite(input.siteId);
  if (!site) return { error: "Unknown site." };
  if (input.keywords.length === 0) return { error: "Nothing selected." };

  const supabase = await createServiceClient();
  const target = resolveTarget(input.targetUrl, site.domain);

  const { data: existingRows } = await supabase
    .from("pulse_keywords")
    .select("phrase")
    .eq("site_id", input.siteId);
  const existing = new Set(
    ((existingRows as Array<{ phrase: string }>) ?? []).map((r) => r.phrase.toLowerCase()),
  );

  const fresh = input.keywords.filter((k) => !existing.has(k.k.trim().toLowerCase()));
  const skipped = input.keywords.length - fresh.length;
  if (fresh.length === 0) return { error: null, added: 0, skipped };

  const { error } = await supabase.from("pulse_keywords").insert(
    fresh.map((k) => ({
      site_id: input.siteId,
      phrase: k.k.trim().toLowerCase(),
      location_code: 2840,
      device: "desktop",
      volume: k.v,
      intent: k.i,
      kd: k.kd,
      cpc: k.c,
      target_url: target,
      researched_at: new Date().toISOString(),
      metrics_source: "ai_estimated",
    })),
  );
  if (error) return { error: error.message };

  revalidatePath(`/admin/pulse/${input.siteId}`);
  revalidatePath("/admin/pulse/keyword-lab");
  return { error: null, added: fresh.length, skipped };
}

export async function setTargetUrlAction(input: {
  keywordId: string;
  url: string;
}): Promise<{ error: string | null }> {
  await requireAdmin();
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pulse_keywords")
    .update({ target_url: input.url.trim() || null })
    .eq("id", input.keywordId);
  revalidatePath("/admin/pulse/keyword-lab");
  return { error: error?.message ?? null };
}

/**
 * Check one keyword's live position and store it.
 *
 * The result goes to pulse_rank_checks, so the Rankings tab's history and this
 * tool's history are the same history rather than two that disagree.
 */
export async function checkRankAction(input: {
  keywordId: string;
}): Promise<{ error: string | null; position?: number | null; match?: string; costUsd?: number }> {
  const gate = await requireSpender();
  if (!gate.ok) return { error: gate.reason ?? "Not allowed." };

  const supabase = await createServiceClient();
  const { data: kw } = await supabase
    .from("pulse_keywords")
    .select("id, phrase, target_url, site_id")
    .eq("id", input.keywordId)
    .maybeSingle();
  if (!kw) return { error: "Unknown keyword." };

  const site = await getSite(kw.site_id as string);
  if (!site) return { error: "Unknown site." };

  try {
    const result = await checkRank(
      kw.phrase as string,
      resolveTarget(kw.target_url as string | null, site.domain),
      site.domain,
      site.id,
    );

    await supabase.from("pulse_rank_checks").insert({
      keyword_id: kw.id,
      checked_at: result.checkedAt,
      position: result.position,
      ranking_url: result.foundUrl,
      match_type: result.match,
      top_results: result.top,
      source: "ai_search",
      serp_features: {},
    });

    revalidatePath("/admin/pulse/keyword-lab");
    return { error: null, position: result.position, match: result.match, costUsd: result.costUsd };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Rank check failed." };
  }
}

export async function removeKeywordAction(keywordId: string): Promise<{ error: string | null }> {
  await requireAdmin();
  const supabase = await createServiceClient();
  // Rank checks cascade with the keyword, so this really does discard the
  // history — which is why the UI asks twice.
  const { error } = await supabase.from("pulse_keywords").delete().eq("id", keywordId);
  revalidatePath("/admin/pulse/keyword-lab");
  return { error: error?.message ?? null };
}
