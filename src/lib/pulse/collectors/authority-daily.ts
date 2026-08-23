// Daily authority scoring for every domain Pulse knows about.
//
// This is the automated half of the authority picture, and it is worth being
// precise about why it exists in this shape.
//
// A browser extension cannot be driven from a server: it lives in Chrome on
// somebody's machine, has no API, and no headless entry point. So the parts of
// authority that come from an extension arrive by CSV import, by hand, when
// somebody chooses to run a search.
//
// What CAN run every day without anybody touching it is Open PageRank — a free
// API over the Common Crawl link graph, 30,000 domains a month, no card. It
// covers every client and every tracked competitor in one pass, so the score
// moves on its own instead of only when somebody remembers to export.
//
// Where a SEOquake import has supplied referring domains, that number is used
// and the score reflects both halves. Where it has not, the score is honest
// about resting on traffic and domain strength alone.

import { createServiceClient } from "@/lib/supabase/server";
import { openPageRank, scoreFromInputs } from "@/lib/pulse/authority";

export interface AuthorityDailyResult {
  scored: number;
  skipped: number;
  note?: string;
}

/** Open PageRank allows 100 domains per request; stay well under it. */
const BATCH = 50;

export async function runAuthorityDaily(): Promise<AuthorityDailyResult> {
  if (!process.env.OPENPAGERANK_API_KEY) {
    return {
      scored: 0,
      skipped: 0,
      note: "OPENPAGERANK_API_KEY is not set — see domcop.com/openpagerank for a free key.",
    };
  }

  const supabase = await createServiceClient();

  // Every domain we track: clients and the competitors registered against them.
  const { data: domains } = await supabase
    .from("pulse_domains")
    .select("id, domain")
    .limit(500);

  const rows = (domains as Array<{ id: string; domain: string }>) ?? [];
  if (rows.length === 0) return { scored: 0, skipped: 0, note: "No domains registered." };

  let scored = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    for (const row of rows.slice(i, i + BATCH)) {
      const opr = await openPageRank(row.domain);
      if (opr === null) {
        skipped += 1;
        continue;
      }

      // Traffic and referring domains from whatever the last snapshot knew, so
      // a daily authority run does not quietly discard a SEOquake import.
      const { data: last } = await supabase
        .from("pulse_domain_snapshots")
        .select("ref_domains, est_traffic")
        .eq("domain_id", row.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const prev = (last as { ref_domains: number | null; est_traffic: number | null } | null) ?? null;
      const result = scoreFromInputs({
        est_referring_domains: prev?.ref_domains ?? 0,
        est_avg_donor_authority: opr,
        est_dofollow_ratio: 0.75,
        est_monthly_organic_traffic: prev?.est_traffic ?? 0,
      });

      await supabase.from("pulse_domain_snapshots").insert({
        domain_id: row.id,
        authority_score: Math.round(result.score),
        ref_domains: prev?.ref_domains ?? null,
        est_traffic: prev?.est_traffic ?? null,
        source: "openpagerank",
        mocked: false,
        measured: {
          open_page_rank: Math.round(opr * 10) / 10,
          link_power: Math.round(result.lp01 * 100),
          traffic_component: Math.round(result.tr01 * 100),
          penalties: result.flags.map((f) => f.name),
          scored_at: new Date().toISOString(),
        },
      });
      scored += 1;
    }
  }

  return { scored, skipped };
}
