// "What changed" — the box a client actually reads.
//
// Generated from the numbers rather than written by hand, but written to be
// read aloud in a meeting: no jargon, no metric names the client didn't ask
// for, and never a percentage without the counts behind it.
//
// Rules that keep it honest:
//   - a change below the noise floor isn't reported as a change
//   - a percentage on a tiny base is stated as counts instead ("4 more visitors",
//     not "up 400%")
//   - bad news appears too; a highlights box that only ever contains wins is
//     one the client learns to skip

import { conversionLabel, type MonthlyData } from "./data";
import { delta, num, plural, type ResolvedRange } from "./core";

/** Below this, month-to-month movement is noise, not a trend. */
const NOISE_FLOOR_PCT = 5;
/** Under this many events, a percentage is more misleading than the raw count. */
const SMALL_BASE = 30;

function movement(
  label: string,
  current: number,
  previous: number,
  prevLabel: string,
  unit: { one: string; many: string },
): string | null {
  if (current === 0 && previous === 0) return null;

  if (previous === 0) {
    return `${label} started being recorded this period — ${plural(current, unit.one, unit.many)}.`;
  }

  const d = delta(current, previous);
  if (d === null) return null;

  const dir = d > 0 ? "up" : "down";
  const diff = Math.abs(current - previous);

  // Small bases: report the difference, not the ratio.
  if (Math.max(current, previous) < SMALL_BASE) {
    if (diff === 0) return null;
    return `${label} ${dir} by ${plural(diff, unit.one, unit.many)} — ${num(current)} this period against ${num(previous)} in ${prevLabel}.`;
  }

  if (Math.abs(d) < NOISE_FLOOR_PCT) {
    return `${label} held steady at ${num(current)} (${num(previous)} in ${prevLabel}).`;
  }

  return `${label} ${dir} ${Math.abs(d).toFixed(0)}% — ${num(current)} against ${num(previous)} in ${prevLabel}.`;
}

export function monthlyHighlights(d: MonthlyData, range: ResolvedRange): string[] {
  const out: string[] = [];
  const prev = range.prevLabel;

  const visitors = movement("Visitors", d.traffic.visitors, d.prevTraffic.visitors, prev, {
    one: "visitor",
    many: "visitors",
  });
  if (visitors) out.push(visitors);

  if (d.search && d.prevSearch) {
    const clicks = movement("Clicks from Google search", d.search.clicks, d.prevSearch.clicks, prev, {
      one: "click",
      many: "clicks",
    });
    if (clicks) out.push(clicks);

    // A position improvement is a *decrease*, which is the single most
    // misread number in SEO reporting — so it's spelled out in words.
    const posChange = d.prevSearch.position - d.search.position;
    if (Math.abs(posChange) >= 0.5) {
      out.push(
        posChange > 0
          ? `Average position in Google improved from ${d.prevSearch.position.toFixed(1)} to ${d.search.position.toFixed(1)} — closer to the top of page one.`
          : `Average position in Google slipped from ${d.prevSearch.position.toFixed(1)} to ${d.search.position.toFixed(1)}.`,
      );
    }
  }

  if (d.visibilityNow) {
    const v = d.visibilityNow;
    if (v.improved > 0 || v.declined > 0) {
      const parts: string[] = [];
      if (v.improved > 0) parts.push(`${plural(v.improved, "keyword", "keywords")} moved up`);
      if (v.declined > 0) parts.push(`${plural(v.declined, "keyword", "keywords")} moved down`);
      out.push(
        `${parts.join(" and ")} by three or more places. ${num(v.top10)} of ${num(v.tracked)} tracked terms now sit on page one.`,
      );
    } else if (v.ranked > 0) {
      out.push(
        `Rankings were stable this period — ${num(v.top10)} of ${num(v.tracked)} tracked terms on page one.`,
      );
    }
  }

  // Conversions matter more to a client than pageviews, so they outrank the
  // traffic-shape bullets even though they come later in the document.
  const topConv = [...d.conversions].sort((a, b) => b.count - a.count)[0];
  if (topConv && topConv.count > 0) {
    const line = movement(conversionLabel(topConv.kind), topConv.count, topConv.prev, prev, {
      one: "time",
      many: "times",
    });
    if (line) out.push(line);
  }

  if (d.health) {
    // The score and the error count are separate facts, and the sentence has to
    // work when only one of them exists — "Site Health is —/100" is worse than
    // saying nothing.
    const scored = d.health.score !== null;
    if (d.health.errors > 0) {
      out.push(
        scored
          ? `Site Health is ${d.health.score}/100 across ${num(d.health.pages)} pages, with ${plural(d.health.errors, "error", "errors")} worth fixing.`
          : `The crawl of ${num(d.health.pages)} pages found ${plural(d.health.errors, "error", "errors")} worth fixing.`,
      );
    } else if (scored) {
      out.push(
        `Site Health is ${d.health.score}/100 across ${num(d.health.pages)} pages with no errors outstanding.`,
      );
    }
  }

  if (d.brandSplit?.configured && d.brandSplit.nonBranded.clicks + d.brandSplit.branded.clicks > 0) {
    const nb = d.brandSplit.nonBranded.clicks;
    const total = nb + d.brandSplit.branded.clicks;
    const share = (nb / total) * 100;
    out.push(
      `${share.toFixed(0)}% of search clicks came from people who weren't searching for the business by name — ${plural(nb, "click", "clicks")} from new demand.`,
    );
  }

  return out.slice(0, 6);
}
