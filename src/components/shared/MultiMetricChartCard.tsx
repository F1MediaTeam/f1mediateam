"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import MultiLineChart, { type ChartSeries } from "@/components/shared/MultiLineChart";
import { formatNumber } from "@/lib/utils";

export interface MetricSeriesInput {
  metric: string;
  label: string;
  color: string;
  unit?: string;
  aggregation?: "sum" | "average";
  invert?: boolean;
  series: { captured_at: string; value: number }[];
}

interface Props {
  title: string;
  hint?: string;
  metrics: MetricSeriesInput[];
}

const RANGES = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "28d", label: "28 days", days: 28 },
  { value: "90d", label: "3 months", days: 90 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "all", label: "All time", days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["value"];

function fmt(v: number, m: MetricSeriesInput): string {
  const compact = (m.aggregation ?? "sum") === "sum" && v >= 10_000;
  return (
    formatNumber(v, {
      maximumFractionDigits: 1,
      notation: compact ? "compact" : "standard",
    }) + (m.unit ?? "")
  );
}

export default function MultiMetricChartCard({ title, hint, metrics }: Props) {
  const [range, setRange] = useState<RangeKey>("28d");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const days = RANGES.find((r) => r.value === range)!.days;

  // Window the series + compute aggregate per metric for the current range.
  const windowed = useMemo(() => {
    return metrics.map((m) => {
      const ws = Number.isFinite(days) ? m.series.slice(-days) : m.series;
      const sum = ws.reduce((a, p) => a + p.value, 0);
      const aggregated = (m.aggregation ?? "sum") === "average"
        ? ws.length
          ? sum / ws.length
          : 0
        : sum;
      return { meta: m, points: ws, aggregated };
    });
  }, [metrics, days]);

  const lastDate = windowed
    .map((w) => w.points[w.points.length - 1]?.captured_at ?? "")
    .filter(Boolean)
    .sort()
    .at(-1);

  const series: ChartSeries[] = windowed.map((w) => ({
    key: w.meta.metric,
    color: w.meta.color,
    visible: !hidden.has(w.meta.metric),
    points: w.points.map((p) => ({ date: p.captured_at, value: p.value })),
  }));

  function toggle(metric: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) next.delete(metric);
      else next.add(metric);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={hint}
        right={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {RANGES.map((r) => {
                const active = range === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRange(r.value)}
                    className={
                      "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition " +
                      (active
                        ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
                    }
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            {lastDate ? (
              <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                Last update: {lastDate}
              </span>
            ) : null}
          </div>
        }
      />
      <CardBody>
        {/* KPI tiles — one per metric, with toggle checkbox + colored dot. */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
          {windowed.map((w) => {
            const m = w.meta;
            const on = !hidden.has(m.metric);
            // hoverIdx is a continuous float during drag — linearly interpolate
            // between adjacent points so the KPI glides instead of jumping.
            let hoverValue: number | undefined = undefined;
            let hoverDate: string | undefined = undefined;
            if (hoverIdx !== null && w.points.length > 0) {
              const lo = Math.max(0, Math.min(w.points.length - 1, Math.floor(hoverIdx)));
              const hi = Math.min(lo + 1, w.points.length - 1);
              const t = hoverIdx - lo;
              const a = w.points[lo];
              const b = w.points[hi];
              hoverValue = a.value + t * (b.value - a.value);
              hoverDate = t < 0.5 ? a.captured_at : b.captured_at;
            }
            const displayValue = hoverValue ?? w.aggregated;
            return (
              <button
                key={m.metric}
                type="button"
                onClick={() => toggle(m.metric)}
                style={{
                  borderColor: on ? `${m.color}66` : "var(--color-border)",
                  background: on ? `${m.color}10` : "var(--color-bg-elev)",
                }}
                className="text-left rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 transition hover:brightness-110"
                aria-pressed={on}
                title={on ? `Hide ${m.label}` : `Show ${m.label}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid place-items-center w-4 h-4 rounded border"
                    style={{
                      borderColor: on ? m.color : "var(--color-border-strong)",
                      background: on ? m.color : "transparent",
                    }}
                  >
                    {on ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5.2L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                  <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] truncate">
                    {m.label}
                  </span>
                </div>
                <div
                  className="mt-1.5 text-base sm:text-xl font-semibold tabular-nums"
                  style={{ color: on ? m.color : "var(--color-text-muted)" }}
                >
                  {fmt(displayValue, m)}
                </div>
                {hoverDate ? (
                  <div className="text-[10px] text-[var(--color-text-subtle)] mt-0.5 truncate">
                    {hoverDate}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2 sm:p-4">
          <MultiLineChart series={series} onHover={setHoverIdx} />
        </div>
      </CardBody>
    </Card>
  );
}
