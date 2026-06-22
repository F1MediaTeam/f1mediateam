// Single horizontal row of clickable SEO metric cards, modeled after
// the SEMrush domain-overview strip ("AI Visibility · Mentions · Site
// Health · Visibility · Organic Traffic · Organic Keywords · Backlinks").
//
// Each card surfaces the current value + a delta vs. the previous snapshot.
// Clicking a card navigates to /client/seo/<slug>, which shows the
// drill-in graphs for that metric. Metrics we don't yet collect (AI
// Visibility, Mentions, Site Health, Backlinks) are rendered with a
// "Coming soon" placeholder.

import Link from "next/link";
import { data } from "@/lib/data";
import { formatNumber, formatPercentChange } from "@/lib/utils";

interface MetricDef {
  slug: string;
  label: string;
  /** Metric name in metric_snapshots, or null when we don't sync this yet. */
  source: string | null;
  /** Format the headline value. */
  fmt?: (v: number) => string;
  /** Lower is better (we don't have any here yet, kept for parity). */
  invert?: boolean;
  /** Suffix appended to the value, e.g. "%". */
  unit?: string;
}

const METRICS: MetricDef[] = [
  { slug: "ai-visibility", label: "AI Visibility", source: null },
  { slug: "mentions",      label: "Mentions",      source: null },
  { slug: "site-health",   label: "Site Health",   source: null, unit: "%" },
  { slug: "visibility",    label: "Visibility",    source: "visibility", unit: "%", fmt: (v) => v.toFixed(2) },
  { slug: "organic-traffic",  label: "Organic Traffic",  source: "semrush_organic_traffic" },
  { slug: "organic-keywords", label: "Organic Keywords", source: "semrush_organic_keywords" },
  { slug: "backlinks",        label: "Backlinks",        source: null },
];

function compact(v: number): string {
  if (Math.abs(v) >= 1000) return formatNumber(v, { maximumFractionDigits: 1, notation: "compact" });
  return formatNumber(v, { maximumFractionDigits: 0 });
}

export default async function SeoMetricsRow({ clientId }: { clientId: string }) {
  // Pull current/previous values per metric in parallel so the row renders fast.
  const values = await Promise.all(
    METRICS.map(async (m) => {
      if (!m.source) return { metric: m, cur: null as number | null, prev: null as number | null, when: null as string | null };
      const series = await data.listSnapshots({ clientId, metric: m.source });
      if (series.length === 0) return { metric: m, cur: null, prev: null, when: null };
      const cur = series[series.length - 1];
      const prev = series.length > 1 ? series[series.length - 2] : null;
      return {
        metric: m,
        cur: cur.value,
        prev: prev ? prev.value : null,
        when: cur.captured_at,
      };
    }),
  );

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
          SEO snapshot
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
          Tap any card to open its detail view
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {values.map(({ metric, cur, prev, when }) => {
          const change =
            cur != null && prev != null ? formatPercentChange(prev, cur) : null;
          const dir = change
            ? metric.invert
              ? change.direction === "up"
                ? "down"
                : change.direction === "down"
                ? "up"
                : "flat"
              : change.direction
            : "flat";
          const tone =
            dir === "up" ? "text-emerald-300" : dir === "down" ? "text-red-300" : "text-[var(--color-text-muted)]";

          const headline = cur == null
            ? "—"
            : metric.fmt
              ? `${metric.fmt(cur)}${metric.unit ?? ""}`
              : `${compact(cur)}${metric.unit ?? ""}`;

          return (
            <Link
              key={metric.slug}
              href={`/client/seo/${metric.slug}`}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-accent)]/40 px-3 py-3 transition flex flex-col"
            >
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] truncate">
                {metric.label}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--color-text)]">
                {headline}
              </div>
              {change ? (
                <div className={`mt-1 text-[11px] font-mono ${tone}`}>
                  {change.label}
                </div>
              ) : metric.source ? (
                <div className="mt-1 text-[10px] text-[var(--color-text-subtle)]">No history yet</div>
              ) : (
                <div className="mt-1 text-[10px] text-[var(--color-text-subtle)] italic">Coming soon</div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
