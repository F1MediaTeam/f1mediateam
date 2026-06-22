"use client";

// GSC-style search performance dashboard for the client overview.
// Top row: time-frame pills (7d / 28d / 3mo / 1y / all). Below: four
// colored KPI tiles (clicks, impressions, CTR, avg position) — each is a
// toggleable series. Below: a single line chart that overlays whichever
// series are enabled. Mirrors the layout of Google Search Console's
// Performance page so clients land on something they already recognise.

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/utils";

interface Snapshot {
  captured_at: string;
  value: number;
}

interface TopRow {
  label: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Props {
  clicks: Snapshot[];
  impressions: Snapshot[];
  /** ctr in raw fraction (0–1) — multiplied by 100 for display */
  ctr: Snapshot[];
  position: Snapshot[];
  topQueries: TopRow[];
  /** Date the data was last refreshed by the sync job. */
  lastUpdated?: string;
}

const RANGES = [
  { value: "7d",  label: "7 days",   days: 7 },
  { value: "28d", label: "28 days",  days: 28 },
  { value: "3mo", label: "3 months", days: 90 },
  { value: "1y",  label: "1 year",   days: 365 },
  { value: "all", label: "All time", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["value"];

interface SeriesDef {
  id: "clicks" | "impressions" | "ctr" | "position";
  label: string;
  color: string;        // line color
  tile: string;         // tile background tailwind class
  ring: string;         // tile ring color
  fmt: (v: number) => string;
  invert?: boolean;     // lower = better
}

const SERIES: SeriesDef[] = [
  {
    id: "clicks", label: "Total clicks", color: "#3B82F6",
    tile: "bg-blue-500/20 border-blue-400/40", ring: "ring-blue-400/40",
    fmt: (v) => formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" }),
  },
  {
    id: "impressions", label: "Total impressions", color: "#8B5CF6",
    tile: "bg-purple-500/20 border-purple-400/40", ring: "ring-purple-400/40",
    fmt: (v) => formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" }),
  },
  {
    id: "ctr", label: "Average CTR", color: "#14B8A6",
    tile: "bg-teal-500/20 border-teal-400/40", ring: "ring-teal-400/40",
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    id: "position", label: "Average position", color: "#F59E0B",
    tile: "bg-amber-500/20 border-amber-400/40", ring: "ring-amber-400/40",
    fmt: (v) => v.toFixed(1),
    invert: true,
  },
];

// ---------- helpers ----------

function clipToRange(series: Snapshot[], days: number): Snapshot[] {
  if (!Number.isFinite(days)) return series;
  return series.slice(-days);
}

function summarize(series: Snapshot[], def: SeriesDef): { headline: number; sub: string | null } {
  if (series.length === 0) return { headline: 0, sub: null };
  if (def.id === "clicks" || def.id === "impressions") {
    const total = series.reduce((a, s) => a + s.value, 0);
    return { headline: total, sub: null };
  }
  // CTR + position: average across the window.
  const avg = series.reduce((a, s) => a + s.value, 0) / series.length;
  return { headline: avg, sub: null };
}

// ---------- chart ----------

interface ChartProps {
  series: { def: SeriesDef; points: Snapshot[] }[];
  enabled: Record<SeriesDef["id"], boolean>;
}

function MultiLineChart({ series, enabled }: ChartProps) {
  const W = 1100;
  const H = 360;
  const pad = { l: 16, r: 16, t: 16, b: 30 };

  const activeSeries = series.filter((s) => enabled[s.def.id]);
  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) set.add(p.captured_at);
    return Array.from(set).sort();
  }, [series]);

  if (allDates.length === 0 || activeSeries.length === 0) {
    return (
      <div className="h-[360px] grid place-items-center text-xs text-[var(--color-text-muted)]">
        {allDates.length === 0 ? "No data in this range." : "Select at least one metric above."}
      </div>
    );
  }

  // X scale: equally spaced points by date index.
  const x = (i: number) => pad.l + (i / Math.max(allDates.length - 1, 1)) * (W - pad.l - pad.r);

  // Each metric gets its own Y scale so wildly different ranges (clicks vs CTR)
  // can coexist visually. We don't render numeric Y ticks since each line has
  // its own meaning — the colored KPI tile above shows the value.
  function pathFor(s: { def: SeriesDef; points: Snapshot[] }): string {
    const byDate = new Map(s.points.map((p) => [p.captured_at, p.value]));
    const vals = s.points.map((p) => p.value);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, min + 1);
    const range = max - min || 1;
    const top = pad.t + 8;
    const bot = H - pad.b - 4;
    const y = (v: number) => bot - ((v - min) / range) * (bot - top);
    const parts: string[] = [];
    let started = false;
    allDates.forEach((d, i) => {
      const v = byDate.get(d);
      if (v === undefined) return;
      parts.push(`${started ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
      started = true;
    });
    return parts.join(" ");
  }

  // Date label picks: first, ~1/4, ~1/2, ~3/4, last
  const labelIdx = (() => {
    const n = allDates.length;
    if (n <= 1) return [0];
    if (n <= 5) return allDates.map((_, i) => i);
    return [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  })();

  const fmtDate = (iso: string) => {
    const [, mo, day] = iso.split("-");
    return `${Number(mo)}/${Number(day)}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[360px]">
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.10)" />
      {activeSeries.map((s) => (
        <path key={s.def.id} d={pathFor(s)} fill="none" stroke={s.def.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          fontSize={10}
          fill="#7f8896"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {fmtDate(allDates[i])}
        </text>
      ))}
    </svg>
  );
}

// ---------- main ----------

export default function GscDashboard(props: Props) {
  const [range, setRange] = useState<RangeKey>("3mo");
  const [enabled, setEnabled] = useState<Record<SeriesDef["id"], boolean>>({
    clicks: true,
    impressions: true,
    ctr: true,
    position: true,
  });

  const days = RANGES.find((r) => r.value === range)!.days;

  const seriesData = useMemo(() => {
    const inputs: Record<SeriesDef["id"], Snapshot[]> = {
      clicks: props.clicks,
      impressions: props.impressions,
      ctr: props.ctr,
      position: props.position,
    };
    return SERIES.map((def) => ({
      def,
      points: clipToRange(inputs[def.id], days),
    }));
  }, [props.clicks, props.impressions, props.ctr, props.position, days]);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 overflow-hidden">
      {/* Range pills row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)]">
        <div className="inline-flex rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-1 gap-1">
          {RANGES.map((r) => {
            const active = range === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={
                  "px-3 py-1 text-xs font-medium rounded-md transition " +
                  (active
                    ? "bg-[var(--color-accent)] text-black"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
                }
              >
                {active ? "✓ " : ""}{r.label}
              </button>
            );
          })}
        </div>
        {props.lastUpdated ? (
          <div className="text-[11px] text-[var(--color-text-muted)] font-mono">
            Last update: {props.lastUpdated}
          </div>
        ) : null}
      </div>

      {/* KPI tiles + chart */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {seriesData.map(({ def, points }) => {
            const { headline } = summarize(points, def);
            const on = enabled[def.id];
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => setEnabled((e) => ({ ...e, [def.id]: !e[def.id] }))}
                className={
                  "text-left rounded-xl border px-4 py-3 transition relative " +
                  (on
                    ? `${def.tile} ring-1 ${def.ring}`
                    : "bg-[var(--color-bg)] border-[var(--color-border)] opacity-60")
                }
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className={
                      "inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border " +
                      (on ? "border-white/70 bg-white/20" : "border-white/30")
                    }
                    aria-hidden
                  >
                    {on ? <span className="text-[9px] leading-none">✓</span> : null}
                  </span>
                  <span className="text-[var(--color-text)] font-medium">{def.label}</span>
                </div>
                <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: def.color }}>
                  {def.fmt(headline)}
                </div>
              </button>
            );
          })}
        </div>

        <MultiLineChart series={seriesData} enabled={enabled} />
      </div>

      {/* Queries tab */}
      <div className="border-t border-[var(--color-border)]">
        <div className="flex items-center gap-6 px-4 pt-3 text-[11px] uppercase tracking-wider">
          <span className="text-[var(--color-text)] border-b-2 border-[var(--color-accent)] pb-2 -mb-px">
            Queries
          </span>
          <span className="text-[var(--color-text-subtle)] pb-2 cursor-not-allowed" title="Coming soon">Pages</span>
          <span className="text-[var(--color-text-subtle)] pb-2 cursor-not-allowed" title="Coming soon">Days</span>
        </div>
        <div className="p-4">
          {props.topQueries.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)] py-6 text-center">
              No keyword data yet. SEMrush sync hasn&apos;t produced results for this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                    <th className="py-2 pr-4 font-medium">Top queries</th>
                    <th className="py-2 px-4 font-medium text-right">Clicks</th>
                    <th className="py-2 px-4 font-medium text-right">Impressions</th>
                    <th className="py-2 px-4 font-medium text-right">CTR</th>
                    <th className="py-2 pl-4 font-medium text-right">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]/60">
                  {props.topQueries.slice(0, 15).map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 text-[var(--color-text)]">{r.label}</td>
                      <td className="py-2 px-4 text-right font-mono text-blue-300">{formatNumber(r.clicks)}</td>
                      <td className="py-2 px-4 text-right font-mono text-purple-300">{formatNumber(r.impressions)}</td>
                      <td className="py-2 px-4 text-right font-mono text-teal-300">{(r.ctr * 100).toFixed(1)}%</td>
                      <td className="py-2 pl-4 text-right font-mono text-amber-300">{r.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
