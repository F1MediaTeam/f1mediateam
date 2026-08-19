"use server";

// Persistence for Keyword Lab.
//
// The component was written against window.storage, which exists in Claude's
// sandbox and not in a browser. Rather than reshape the component, this
// exposes the same load/save pair it already expects — so the UI code is
// untouched and the data now survives a refresh, and is visible from the other
// Mac instead of living in one laptop's memory.
//
// Sites come from pulse_sites and keywords are mirrored into pulse_keywords,
// so anything tracked here also appears on that client's Rankings tab. One
// keyword list rather than two that quietly disagree.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/server";
import { filterClients } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { listSites } from "@/lib/pulse/sites";

export interface LabCheck {
  date: string;
  position: number | null;
  foundUrl: string | null;
  match: string;
  top: Array<{ pos: number; title: string; url: string }>;
}

export interface LabKeyword {
  id: string;
  k: string;
  v: number;
  i: string;
  kd: number;
  c: number;
  url: string;
  addedAt: string;
  checks: LabCheck[];
}

export interface LabProfile {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  keywords: LabKeyword[];
}

/** Everything the component needs, in the exact shape it already renders. */
export async function loadProfiles(): Promise<LabProfile[]> {
  const session = await requireAdmin();
  const allowed = await visibleClientIds(session);
  const [allClients, sites] = await Promise.all([data.listClients(), listSites(allowed)]);
  const clients = filterClients(allClients, allowed);
  if (sites.length === 0) return [];

  const supabase = await createServiceClient();
  const siteIds = sites.map((s) => s.id);

  const { data: kwRows } = await supabase
    .from("pulse_keywords")
    .select("id, site_id, phrase, volume, intent, kd, cpc, target_url, created_at")
    .in("site_id", siteIds)
    .order("volume", { ascending: false, nullsFirst: false })
    .limit(3000);

  const keywords =
    (kwRows as Array<{
      id: string; site_id: string; phrase: string; volume: number | null; intent: string | null;
      kd: number | null; cpc: number | null; target_url: string | null; created_at: string;
    }>) ?? [];

  const { data: checkRows } = keywords.length
    ? await supabase
        .from("pulse_rank_checks")
        .select("keyword_id, checked_at, position, ranking_url, match_type, top_results")
        .in("keyword_id", keywords.map((k) => k.id))
        .order("checked_at", { ascending: true })
        .limit(6000)
    : { data: [] };

  const checks =
    (checkRows as Array<{
      keyword_id: string; checked_at: string; position: number | null;
      ranking_url: string | null; match_type: string | null;
      top_results: Array<{ pos: number; title: string; url: string }>;
    }>) ?? [];

  const byKeyword = new Map<string, LabCheck[]>();
  for (const c of checks) {
    const list = byKeyword.get(c.keyword_id) ?? [];
    // Oldest first — the component reads the last element as "current".
    list.push({
      date: c.checked_at,
      position: c.position,
      foundUrl: c.ranking_url,
      match: c.match_type ?? "none",
      top: c.top_results ?? [],
    });
    byKeyword.set(c.keyword_id, list);
  }

  return sites.map((s) => {
    const client = clients.find((c) => c.id === s.client_id);
    return {
      id: s.id,
      name: client?.company_name ?? s.domain,
      domain: s.domain,
      createdAt: s.created_at,
      keywords: keywords
        .filter((k) => k.site_id === s.id)
        .map((k) => ({
          id: k.id,
          k: k.phrase,
          v: k.volume ?? 0,
          i: k.intent ?? "C",
          kd: k.kd ?? 0,
          c: Number(k.cpc ?? 0),
          url: k.target_url ?? `https://${s.domain}/`,
          addedAt: k.created_at,
          checks: byKeyword.get(k.id) ?? [],
        })),
    };
  });
}

export async function addKeywords(input: {
  siteId: string;
  items: Array<{ k: string; v: number; i: string; kd: number; c: number }>;
  targetUrl: string;
}): Promise<{ added: number; skipped: number; error: string | null }> {
  await requireAdmin();
  const supabase = await createServiceClient();

  const { data: site } = await supabase
    .from("pulse_sites")
    .select("id, domain")
    .eq("id", input.siteId)
    .maybeSingle();
  if (!site) return { added: 0, skipped: 0, error: "Unknown site." };

  const raw = input.targetUrl.trim();
  const target = !raw
    ? `https://${site.domain}/`
    : raw.startsWith("/")
      ? `https://${site.domain}${raw}`
      : /^https?:\/\//i.test(raw)
        ? raw
        : `https://${raw}`;

  const { data: existingRows } = await supabase
    .from("pulse_keywords")
    .select("phrase")
    .eq("site_id", input.siteId);
  const existing = new Set(
    ((existingRows as Array<{ phrase: string }>) ?? []).map((r) => r.phrase.toLowerCase()),
  );

  const fresh = input.items.filter((it) => !existing.has(it.k.trim().toLowerCase()));
  const skipped = input.items.length - fresh.length;
  if (fresh.length === 0) return { added: 0, skipped, error: null };

  const { error } = await supabase.from("pulse_keywords").insert(
    fresh.map((it) => ({
      site_id: input.siteId,
      phrase: it.k.trim().toLowerCase(),
      location_code: 2840,
      device: "desktop",
      volume: it.v,
      intent: ["T", "C", "I", "N"].includes(it.i) ? it.i : "C",
      kd: Math.min(100, Math.max(0, Math.round(it.kd))),
      cpc: it.c,
      target_url: target,
      researched_at: new Date().toISOString(),
      metrics_source: "ai_estimated",
    })),
  );
  if (error) return { added: 0, skipped, error: error.message };
  return { added: fresh.length, skipped, error: null };
}

export async function saveKeywordUrl(keywordId: string, url: string): Promise<void> {
  await requireAdmin();
  const supabase = await createServiceClient();
  await supabase.from("pulse_keywords").update({ target_url: url.trim() || null }).eq("id", keywordId);
}

export async function deleteKeyword(keywordId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createServiceClient();
  await supabase.from("pulse_keywords").delete().eq("id", keywordId);
}

export async function saveCheck(keywordId: string, check: LabCheck): Promise<void> {
  await requireAdmin();
  const supabase = await createServiceClient();
  await supabase.from("pulse_rank_checks").insert({
    keyword_id: keywordId,
    checked_at: check.date,
    position: check.position,
    ranking_url: check.foundUrl,
    match_type: check.match,
    top_results: check.top,
    source: "ai_search",
    serp_features: {},
  });
}
