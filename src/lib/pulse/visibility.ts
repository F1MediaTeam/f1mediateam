// F1 Search Visibility — one number for "are we winning".
//
// A rank table with sixty rows doesn't answer that question; you have to read
// it. This collapses the whole tracked set into a 0-100% score by asking: of
// all the clicks theoretically available across these keywords, what share do
// our positions earn?
//
// That is why it is CTR-weighted rather than an average position. Moving from
// #9 to #7 barely changes an average and barely changes traffic. Moving from #4
// to #2 barely changes an average and roughly doubles traffic. The score
// follows the traffic, which is the thing anyone actually cares about.
//
// Our own composite, documented here, never presented as anyone else's metric.

/**
 * Share of clicks a position typically earns, position 1..10.
 * Industry-observed averages — directional, and the same curve for everyone, so
 * the score is comparable across clients and over time even if any single
 * client's real CTR differs.
 */
const CTR_CURVE = [0.284, 0.152, 0.099, 0.071, 0.052, 0.041, 0.033, 0.028, 0.024, 0.021];

/** Positions 11-20 still earn a little; beyond 20 is effectively invisible. */
function ctrAt(position: number | null): number {
  if (position === null || position < 1) return 0;
  if (position <= 10) return CTR_CURVE[Math.round(position) - 1];
  if (position <= 20) return 0.01;
  if (position <= 50) return 0.002;
  return 0;
}

export interface VisibilitySummary {
  /** 0-100. 100 means every tracked keyword sits at #1. */
  index: number;
  top3: number;
  top10: number;
  tracked: number;
  ranked: number;
  improved: number;
  declined: number;
}

export function visibility(
  rows: Array<{ position: number | null; previous: number | null }>,
): VisibilitySummary {
  const tracked = rows.length;
  if (tracked === 0) {
    return { index: 0, top3: 0, top10: 0, tracked: 0, ranked: 0, improved: 0, declined: 0 };
  }

  // The ceiling is every keyword at #1 — so the score reads as "share of the
  // best possible outcome", not a share of some arbitrary total.
  const earned = rows.reduce((sum, r) => sum + ctrAt(r.position), 0);
  const ceiling = tracked * CTR_CURVE[0];

  let improved = 0;
  let declined = 0;
  for (const r of rows) {
    if (r.position === null || r.previous === null) continue;
    if (r.previous - r.position >= 3) improved += 1;
    else if (r.position - r.previous >= 3) declined += 1;
  }

  return {
    index: Math.round((earned / ceiling) * 1000) / 10,
    top3: rows.filter((r) => r.position !== null && r.position <= 3).length,
    top10: rows.filter((r) => r.position !== null && r.position <= 10).length,
    tracked,
    ranked: rows.filter((r) => r.position !== null).length,
    improved,
    declined,
  };
}
