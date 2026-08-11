// Rank collector — daily.
//
// Movement is computed against the previous stored check rather than against
// "yesterday": a missed run must not read as a 30-place crash, and a keyword
// added today has nothing to compare to and correctly reports no movement.

import { createServiceClient } from "@/lib/supabase/server";
import { fetchRanks } from "@/lib/pulse/providers/serp";
import type { PulseSite } from "@/lib/pulse/sites";

export interface RankRunResult {
  siteId: string;
  domain: string;
  checked: number;
  improved: number;
  declined: number;
  entered: number;
  mocked: boolean;
}

/** A move worth telling someone about. Smaller drift is SERP noise. */
const NOTABLE = 3;

export async function runRanks(site: PulseSite): Promise<RankRunResult> {
  const supabase = await createServiceClient();

  const { data: keywords } = await supabase
    .from("pulse_keywords")
    .select("id, phrase, location_code")
    .eq("site_id", site.id)
    .eq("is_active", true);

  const list = (keywords as Array<{ id: string; phrase: string; location_code: number }>) ?? [];
  if (list.length === 0) {
    return { siteId: site.id, domain: site.domain, checked: 0, improved: 0, declined: 0, entered: 0, mocked: false };
  }

  // Previous position per keyword, read before writing the new ones.
  const previous = new Map<string, number | null>();
  for (const k of list) {
    const { data } = await supabase
      .from("pulse_rank_checks")
      .select("position")
      .eq("keyword_id", k.id)
      .order("checked_at", { ascending: false })
      .limit(1);
    previous.set(k.id, (data?.[0]?.position as number | null) ?? null);
  }

  const { results, mocked } = await fetchRanks(
    site.domain,
    list.map((k) => k.phrase),
    list[0].location_code,
  );
  const byPhrase = new Map(results.map((r) => [r.phrase, r]));

  const rows = list.map((k) => {
    const r = byPhrase.get(k.phrase);
    return {
      keyword_id: k.id,
      position: r?.position ?? null,
      ranking_url: r?.rankingUrl ?? null,
      serp_features: r?.serpFeatures ?? {},
    };
  });
  if (rows.length > 0) await supabase.from("pulse_rank_checks").insert(rows);

  let improved = 0;
  let declined = 0;
  let entered = 0;
  const events: Array<Record<string, unknown>> = [];

  for (const k of list) {
    const before = previous.get(k.id) ?? null;
    const after = byPhrase.get(k.phrase)?.position ?? null;
    if (after === null && before === null) continue;

    // Entering or leaving the top 100 is a state change, not a delta — there is
    // no meaningful number of places moved when one side is "nowhere".
    if (before === null && after !== null) {
      entered += 1;
      events.push({
        site_id: site.id,
        kind: "rank_up",
        severity: "good",
        title: `"${k.phrase}" entered the rankings at #${after}`,
        payload: { phrase: k.phrase, from: null, to: after },
      });
      continue;
    }
    if (before !== null && after === null) {
      declined += 1;
      events.push({
        site_id: site.id,
        kind: "rank_down",
        severity: "warning",
        title: `"${k.phrase}" dropped out of the top 100`,
        payload: { phrase: k.phrase, from: before, to: null },
      });
      continue;
    }
    if (before === null || after === null) continue;

    const delta = before - after; // positive = moved up the page
    if (delta >= NOTABLE) {
      improved += 1;
      // Reaching the first page is worth flagging louder than the same-sized
      // move from 60 to 55, which changes nothing in practice.
      const top10 = after <= 10 && before > 10;
      events.push({
        site_id: site.id,
        kind: "rank_up",
        severity: "good",
        title: top10
          ? `"${k.phrase}" reached page one at #${after}`
          : `"${k.phrase}" up ${delta} to #${after}`,
        payload: { phrase: k.phrase, from: before, to: after, delta, entered_top_10: top10 },
      });
    } else if (-delta >= NOTABLE) {
      declined += 1;
      const leftTop10 = before <= 10 && after > 10;
      events.push({
        site_id: site.id,
        kind: "rank_down",
        severity: leftTop10 ? "warning" : "info",
        title: leftTop10
          ? `"${k.phrase}" fell off page one to #${after}`
          : `"${k.phrase}" down ${-delta} to #${after}`,
        payload: { phrase: k.phrase, from: before, to: after, delta, left_top_10: leftTop10 },
      });
    }
  }

  if (events.length > 0) await supabase.from("pulse_feed_events").insert(events);

  return { siteId: site.id, domain: site.domain, checked: list.length, improved, declined, entered, mocked };
}
