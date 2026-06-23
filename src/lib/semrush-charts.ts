// Turns stored Semrush "deep pull" reports into compact, chart-ready datasets.
//
// The deep-pull rows are keyed by Semrush's own CSV header labels, which can
// vary (and aren't all verified live yet), so every field read here is
// tolerant: it matches candidate keys case-insensitively, then by substring.
// Anything it can't find degrades to null/empty so the UI just hides that chart.

import type { SemrushReport } from "@/lib/types";

export interface ChartSeries {
  label: string;
  value: number;
}

export interface SemrushChartData {
  authority: { date: string; value: number }[] | null; // Authority Score over time
  positions: ChartSeries[] | null;                      // organic keyword position buckets
  topKeywords: ChartSeries[] | null;                    // top organic keywords by traffic share
  backlinkProfile: { follow: number; nofollow: number } | null;
  refDomains: ChartSeries[] | null;                     // top referring domains by backlinks
  competitors: ChartSeries[] | null;                    // top organic competitors by common keywords
  pulledAt: string | null;
  hasAny: boolean;
}

type Row = Record<string, string>;

/** Find a key in a row by exact (case-insensitive) match, then substring. */
function keyOf(row: Row, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return undefined;
}

function num(row: Row, candidates: string[]): number {
  const k = keyOf(row, candidates);
  if (!k) return 0;
  const n = Number(String(row[k]).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function text(row: Row, candidates: string[]): string {
  const k = keyOf(row, candidates);
  return k ? String(row[k]) : "";
}

function rowsOf(reports: SemrushReport[], type: string): Row[] {
  const r = reports.find((x) => x.report_type === type);
  return r && Array.isArray(r.rows) ? (r.rows as Row[]) : [];
}

function normalizeDate(raw: string): string {
  const t = raw.trim();
  // Unix seconds (Semrush backlinks_historical) → ISO date.
  if (/^\d{10}$/.test(t)) return new Date(Number(t) * 1000).toISOString().slice(0, 10);
  if (/^\d{13}$/.test(t)) return new Date(Number(t)).toISOString().slice(0, 10);
  // "20240115" → "2024-01-15"
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  // Already ISO-ish
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return t;
}

export function buildSemrushChartData(reports: SemrushReport[]): SemrushChartData {
  // Authority Score history (line).
  const histRows = rowsOf(reports, "authority_history");
  const authority = histRows
    .map((r) => ({ date: normalizeDate(text(r, ["date"])), value: num(r, ["ascore", "authority score", "as"]) }))
    .filter((p) => p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Organic keyword position distribution (buckets) + top by traffic.
  const orgRows = rowsOf(reports, "organic_keywords");
  let positions: ChartSeries[] | null = null;
  let topKeywords: ChartSeries[] | null = null;
  if (orgRows.length) {
    const buckets = [
      { label: "1–3", min: 1, max: 3 },
      { label: "4–10", min: 4, max: 10 },
      { label: "11–20", min: 11, max: 20 },
      { label: "21–50", min: 21, max: 50 },
      { label: "51–100", min: 51, max: 100 },
    ];
    positions = buckets.map((b) => ({
      label: b.label,
      value: orgRows.filter((r) => {
        const p = num(r, ["position", "po"]);
        return p >= b.min && p <= b.max;
      }).length,
    }));

    topKeywords = orgRows
      .map((r) => ({
        label: text(r, ["keyword", "phrase", "ph"]) || "—",
        value: num(r, ["traffic (%)", "traffic %", "traffic", "tr"]),
      }))
      .filter((k) => k.label !== "—")
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    if (!topKeywords.some((k) => k.value > 0)) topKeywords = null;
  }

  // Backlink follow vs nofollow (donut) from the overview row.
  const ovRows = rowsOf(reports, "backlinks_overview");
  let backlinkProfile: { follow: number; nofollow: number } | null = null;
  if (ovRows.length) {
    const o = ovRows[0];
    const follow = num(o, ["follows_num", "follows", "dofollow"]);
    const nofollow = num(o, ["nofollows_num", "nofollows", "nofollow"]);
    if (follow > 0 || nofollow > 0) backlinkProfile = { follow, nofollow };
  }

  // Top referring domains by backlink count.
  const refRows = rowsOf(reports, "ref_domains");
  const refDomains = refRows.length
    ? refRows
        .map((r) => ({
          label: text(r, ["domain"]) || "—",
          value: num(r, ["backlinks_num", "backlinks num", "backlinks"]),
        }))
        .filter((d) => d.label !== "—")
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  // Top organic competitors by shared keywords.
  const compRows = rowsOf(reports, "organic_competitors");
  const competitors = compRows.length
    ? compRows
        .map((r) => ({
          label: text(r, ["domain", "dn"]) || "—",
          value: num(r, ["common keywords", "common", "np"]),
        }))
        .filter((c) => c.label !== "—")
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  const pulledAt = reports.reduce<string | null>(
    (acc, r) => (!acc || r.pulled_at > acc ? r.pulled_at : acc),
    null,
  );

  const posHasData = positions?.some((p) => p.value > 0) ?? false;

  return {
    authority: authority.length ? authority : null,
    positions: posHasData ? positions : null,
    topKeywords,
    backlinkProfile,
    refDomains: refDomains.length ? refDomains : null,
    competitors: competitors.length ? competitors : null,
    pulledAt,
    hasAny:
      authority.length > 0 ||
      posHasData ||
      !!topKeywords ||
      !!backlinkProfile ||
      refDomains.length > 0 ||
      competitors.length > 0,
  };
}
