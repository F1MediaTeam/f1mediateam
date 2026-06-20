"use client";

// A group of radial gauges that share one time-frame selector — used for the
// SEMrush metrics, whose monthly cadence makes a sparse trend line less useful
// than a clear "current value" dial. Each gauge windows the same way the trend
// charts do (slice the last N points) so the time-frame buttons behave
// identically to the graphs.

import { useState } from "react";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { formatNumber, formatPercentChange } from "@/lib/utils";

interface Snapshot {
  captured_at: string;
  value: number;
}

export interface GaugeMetric {
  metric: string;
  label: string;
  /** Format the value as USD currency. */
  money?: boolean;
}

interface Props {
  title: string;
  hint?: string;
  metrics: GaugeMetric[];
  seriesByMetric: Record<string, Snapshot[]>;
}

const RANGES = [
  { value: "7d",  label: "7 days",   days: 7 },
  { value: "28d", label: "30 days",  days: 30 },
  { value: "90d", label: "3 months", days: 90 },
  { value: "1y",  label: "1 year",   days: 365 },
  { value: "all", label: "All time", days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["value"];

/** A "nice" gridline step (1/2/5 × 10ⁿ) for a 0→max scale. */
function tickStep(max: number, count = 4): number {
  if (max <= 0) return 1;
  const rough = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}

/** Smallest "nice" round number ≥ v, so the gauge is never pinned exactly full. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const step = tickStep(v);
  return Math.ceil(v / step) * step;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

// 270° gauge: track runs from -135° (bottom-left) clockwise to +135°
// (bottom-right). Built from line segments so it renders identically anywhere.
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number, segments = 60): string {
  const [sx, sy] = polar(cx, cy, r, startDeg);
  if (endDeg <= startDeg) return `M ${sx.toFixed(2)} ${sy.toFixed(2)}`;
  let d = "";
  for (let i = 0; i <= segments; i++) {
    const a = startDeg + ((endDeg - startDeg) * i) / segments;
    const [x, y] = polar(cx, cy, r, a);
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

const START = -135;
const SWEEP = 270;

function Gauge({ metric, series, range }: { metric: GaugeMetric; series: Snapshot[]; range: RangeKey }) {
  const days = RANGES.find((r) => r.value === range)!.days;
  const windowed = Number.isFinite(days) ? series.slice(-days) : series;

  const fmt = (v: number) =>
    metric.money
      ? `$${formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" })}`
      : formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" });

  const W = 168;
  const H = 150;
  const cx = W / 2;
  const cy = 84;
  const r = 56;
  const track = arcPath(cx, cy, r, START, START + SWEEP);

  if (windowed.length === 0) {
    return (
      <div className="flex flex-col items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[180px]">
          <path d={track} fill="none" stroke="var(--color-border)" strokeWidth={11} strokeLinecap="round" />
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize={22} fill="var(--color-text-muted)" fontWeight={600}>—</text>
        </svg>
        <div className="text-xs text-[var(--color-text-muted)] text-center mt-1">{metric.label}</div>
        <div className="text-[10px] text-[var(--color-text-subtle)]">No data in range</div>
      </div>
    );
  }

  const current = windowed[windowed.length - 1].value;
  const first = windowed[0].value;
  const windowMax = Math.max(...windowed.map((s) => s.value), 0);
  const scaleMax = niceCeil(windowMax);
  const frac = scaleMax > 0 ? Math.max(0, Math.min(1, current / scaleMax)) : 0;
  const fill = arcPath(cx, cy, r, START, START + SWEEP * frac);
  const change = formatPercentChange(first, current);
  const lastDate = windowed[windowed.length - 1].captured_at;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[180px]">
        <path d={track} fill="none" stroke="var(--color-border)" strokeWidth={11} strokeLinecap="round" />
        {frac > 0 ? (
          <path d={fill} fill="none" stroke="var(--color-accent)" strokeWidth={11} strokeLinecap="round" />
        ) : null}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={26} fill="var(--color-text)" fontWeight={700} className="tabular-nums">
          {fmt(current)}
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize={9} fill="var(--color-text-subtle)" letterSpacing="0.06em">
          OF {fmt(scaleMax)}
        </text>
      </svg>
      <div className="text-xs font-medium text-center mt-1 leading-tight">{metric.label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <Pill tone={change.direction === "up" ? "ok" : change.direction === "down" ? "danger" : "default"}>
          {change.label}
        </Pill>
      </div>
      <div className="text-[10px] text-[var(--color-text-subtle)] mt-0.5">
        as of {new Date(lastDate + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

export default function MetricGaugeGroup({ title, hint, metrics, seriesByMetric }: Props) {
  const [range, setRange] = useState<RangeKey>("28d");

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={hint}
        right={
          <div className="inline-flex rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] p-1 gap-1">
            {RANGES.map((r) => {
              const active = range === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={
                    "px-2.5 py-1 text-[11px] font-medium rounded-md transition " +
                    (active
                      ? "bg-[var(--color-accent)] text-black"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
          {metrics.map((m) => (
            <Gauge key={m.metric} metric={m} series={seriesByMetric[m.metric] ?? []} range={range} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
