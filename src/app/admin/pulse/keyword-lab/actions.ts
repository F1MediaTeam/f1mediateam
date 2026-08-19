"use server";

// The two paid calls, held server-side.
//
// These exist because the component originally called api.anthropic.com from
// the browser. That needs a key, and a key shipped to the browser is a key
// anyone can spend — so the call moved back here and the component keeps the
// same inputs and gets the same shapes returned.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { staffRoleOf } from "@/lib/permissions";
import { analyzeKeyword, checkRank, spendSummary } from "@/lib/pulse/keyword-lab";

/** Spending money is a narrower permission than reading a panel. */
async function requireSpender(): Promise<string | null> {
  const session = await requireAdmin();
  const profile = await data.getProfile(session.user_id);
  const role = staffRoleOf(profile);
  if (role === "contractor" || role === "specialist") {
    return "Only owners and managers can run paid research.";
  }
  return null;
}

export async function analyzeAction(seed: string): Promise<{
  error: string | null;
  result?: { kw: string; vol: number; intent: string; kd: number; cpc: number; trend: string; related: Array<{ k: string; v: number; i: string; kd: number; c: number }> };
  costUsd?: number;
}> {
  const denied = await requireSpender();
  if (denied) return { error: denied };

  try {
    const r = await analyzeKeyword(seed);
    return {
      error: null,
      costUsd: r.costUsd,
      result: { kw: r.kw, vol: r.vol, intent: r.intent, kd: r.kd, cpc: r.cpc, trend: r.trend, related: r.related },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not analyze that keyword." };
  }
}

export async function rankCheckAction(input: {
  keyword: string;
  targetUrl: string;
  domain: string;
}): Promise<{
  error: string | null;
  check?: { date: string; position: number | null; foundUrl: string | null; match: string; top: Array<{ pos: number; title: string; url: string }> };
  costUsd?: number;
}> {
  const denied = await requireSpender();
  if (denied) return { error: denied };

  try {
    const r = await checkRank(input.keyword, input.targetUrl, input.domain);
    return {
      error: null,
      costUsd: r.costUsd,
      // Named to match what the component already renders.
      check: { date: r.checkedAt, position: r.position, foundUrl: r.foundUrl, match: r.match, top: r.top },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Rank check failed." };
  }
}

export async function currentSpend() {
  await requireAdmin();
  return spendSummary();
}
