"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import TrendChart from "@/components/shared/TrendChart";
import { formatNumber, formatPercentChange, formatDate } from "@/lib/utils";

interface Snapshot {
  captured_at: string;
  value: number;
}

interface Props {
  label: string;
  hint?: string;
  invert?: boolean;
  /** How to roll up the selected window. Sum for counts, average for ratios. */
  aggregation?: "sum" | "average";
  /** Append after the headline number, e.g. "%" for CTR. */
  unit?: string;
  /** Full 90-day series, oldest → newest. */
  series: Snapshot[];
}

const RANGES = [
  { value: "7d",  label: "7 days",   days: 7 },
  { value: "28d", label: "30 days",  days: 30 },
  { value: "90d", label: "3 months", days: 90 },
  { value: "1y",  label: "1 year",   days: 365 },
  { value: "all", label: "All time", days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["value"];

export default function MetricChartCard({
  label,
  hint,
  invert = false,
  aggregation = "sum",
  unit = "",
  series,
}: Props) {
  const [range, setRange] = useState<RangeKey>("28d");

  if (series.length === 0) return null;

  const days = RANGES.find((r) => r.value === range)!.days;
  const windowed = Number.isFinite(days) ? series.slice(-days) : series;
  if (windowed.length === 0) return null;

  const first = windowed[0];
  const last = windowed[windowed.length - 1];
  const change = formatPercentChange(first.value, last.value);
  const direction = invert
    ? change.direction === "up"
      ? "down"
      : change.direction === "down"
        ? "up"
        : "flat"
    : change.direction;
  const fmt = (v: number) => formatNumber(v, { maximumFractionDigits: 1 });

  // Aggregate the selected window (sum for counts, average for ratios).
  const sum = windowed.reduce((acc, s) => acc + s.value, 0);
  const aggregated = aggregation === "average" ? sum / windowed.length : sum;
  const aggregateLabel = aggregation === "average" ? "Average" : "Total";
  const fmtBig = (v: number) =>
    aggregation === "sum"
      ? formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" })
      : formatNumber(v, { maximumFractionDigits: 1 });

  return (
    <Card>
      <CardHeader
        title={label}
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
            <Pill tone={direction === "up" ? "ok" : direction === "down" ? "danger" : "default"}>
              {change.label}
            </Pill>
          </div>
        }
      />
      <CardBody>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="min-w-0 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] truncate">
              {aggregateLabel}
            </div>
            <div className="mt-1 text-base sm:text-xl font-semibold tabular-nums tracking-tight">
              {fmtBig(aggregated)}{unit}
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Baseline
            </div>
            <div className="mt-1 text-base sm:text-xl font-semibold tabular-nums">{fmt(first.value)}{unit}</div>
            <div className="text-[10px] text-[var(--color-text-subtle)] mt-0.5 truncate">
              {formatDate(first.captured_at)}
            </div>
          </div>
          <div className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Current
            </div>
            <div className="mt-1 text-base sm:text-xl font-semibold tabular-nums">{fmt(last.value)}{unit}</div>
            <div className="text-[10px] text-[var(--color-text-subtle)] mt-0.5 truncate">
              {formatDate(last.captured_at)}
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2 sm:p-4">
          <TrendChart
            points={windowed.map((s) => ({ date: s.captured_at, value: s.value }))}
            baseline={first.value}
            invert={invert}
            width={1400}
            height={440}
          />
        </div>
      </CardBody>
    </Card>
  );
}
