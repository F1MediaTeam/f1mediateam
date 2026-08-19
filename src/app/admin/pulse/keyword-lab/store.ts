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

  // Positions come from Search Console — Google's own measurement of where
  // each page actually ranked, already synced nightly and costing nothing.
  //
  // The trade, stated plainly because it decides what the column means: this
  // only knows about searches people actually used to reach the site. A
  // keyword nobody has found them with yet has no row here, and shows as
  // never checked rather than as a position of zero.
  const { data: termRows } = await supabase
    .from("pulse_search_terms")
    .select("site_id, term, position, period_start, impressions")
    .in("site_id", siteIds)
    .eq("dimension", "query")
    .not("position", "is", null)
    .gte("period_start", new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10))
    .limit(40_000);

  const terms =
    (termRows as Array<{
      site_id: string; term: string; position: number; period_start: string; impressions: number;
    }>) ?? [];

  // One weekly figure per phrase, impression-weighted, so a position held on
  // 900 impressions describes the week better than one held on a single view.
  const weekly = new Map<string, Map<string, { sum: number; weight: number }>>();
  for (const t of terms) {
    const key = `${t.site_id}|${t.term.toLowerCase()}`;
    const d = new Date(t.period_start);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const week = d.toISOString().slice(0, 10);
    const byWeek = weekly.get(key) ?? new Map();
    const cell = byWeek.get(week) ?? { sum: 0, weight: 0 };
    const w = Math.max(1, t.impressions);
    cell.sum += t.position * w;
    cell.weight += w;
    byWeek.set(week, cell);
    weekly.set(key, byWeek);
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
        .map((k) => {
          const byWeek = weekly.get(`${s.id}|${k.phrase.toLowerCase()}`);
          const checks: LabCheck[] = byWeek
            ? [...byWeek.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([week, cell]) => ({
                  date: `${week}T00:00:00.000Z`,
                  position: Math.round((cell.sum / cell.weight) * 10) / 10,
                  foundUrl: null,
                  match: "gsc",
                  top: [],
                }))
            : [];
          return {
            id: k.id,
            k: k.phrase,
            v: k.volume ?? 0,
            i: k.intent ?? "C",
            kd: k.kd ?? 0,
            c: Number(k.cpc ?? 0),
            url: k.target_url ?? `https://${s.domain}/`,
            addedAt: k.created_at,
            checks,
          };
        }),
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
