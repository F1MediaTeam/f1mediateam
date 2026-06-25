"use client";

// Generic "overlay multiple metrics on one chart" dashboard: range pills +
// colored checkbox KPI tiles + a single multi-line chart. This is the reusable
// core of the GSC search-performance view, without any source-specific
// breakdown tables — so it works for Bing (and any other multi-metric source).

import { useMemo, useState } from "react";

interface Pt {
  captured_at: string;
  value: number;
}

export interface DashSeries {
  id: string;
  label: string;
  color: string;        // line + value color
  tile: string;         // active tile bg/border tailwind classes
  ring: string;         // active tile ring
  data: Pt[];
  aggregate: "sum" | "average";
  fmt: (v: number) => string;
}

const RANGES = [
  { value: "7d",  label: "7 days",   days: 7 },
  { value: "28d", label: "28 days",  days: 28 },
  { value: "3mo", label: "3 months", days: 90 },
  { value: "1y",  label: "1 year",   days: 365 },
  { value: "all", label: "All time", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["value"];

function clip(series: Pt[], days: number): Pt[] {
  return Number.isFinite(days) ? series.slice(-days) : series;
}

function MultiLineChart({
  series,
  enabled,
}: {
  series: { def: DashSeries; points: Pt[] }[];
  enabled: Record<string, boolean>;
}) {
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

  const x = (i: number) => pad.l + (i / Math.max(allDates.length - 1, 1)) * (W - pad.l - pad.r);

  function pathFor(s: { def: DashSeries; points: Pt[] }): string {
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
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(127,136,150,0.25)" />
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

export default function MultiSeriesDashboard({
  series,
  lastUpdated,
}: {
  series: DashSeries[];
  lastUpdated?: string;
}) {
  const [range, setRange] = useState<RangeKey>("3mo");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(series.map((s) => [s.id, true])),
  );

  const days = RANGES.find((r) => r.value === range)!.days;
  const seriesData = useMemo(
    () => series.map((def) => ({ def, points: clip(def.data, days) })),
    [series, days],
  );

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RANGES.map((r) => {
            const active = range === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={
                  "shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition " +
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
        {lastUpdated ? (
          <div className="text-[11px] text-[var(--color-text-muted)] font-mono">Last update: {lastUpdated}</div>
        ) : null}
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {seriesData.map(({ def, points }) => {
            const headline =
              points.length === 0
                ? 0
                : def.aggregate === "average"
                  ? points.reduce((a, s) => a + s.value, 0) / points.length
                  : points.reduce((a, s) => a + s.value, 0);
            const on = enabled[def.id];
            const checkboxId = `ms-toggle-${def.id}`;
            return (
              <label
                key={def.id}
                htmlFor={checkboxId}
                className={
                  "relative cursor-pointer select-none text-left rounded-xl border px-4 py-3 transition flex flex-col " +
                  (on
                    ? `${def.tile} ring-2 ${def.ring} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]`
                    : "bg-[var(--color-bg)] border-[var(--color-border)] opacity-55 hover:opacity-80")
                }
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => setEnabled((e) => ({ ...e, [def.id]: !e[def.id] }))}
                />
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "inline-flex items-center justify-center w-5 h-5 rounded border-2 transition shrink-0 " +
                      (on ? "bg-white border-white text-black" : "bg-transparent border-white/50 text-transparent")
                    }
                    aria-hidden
                  >
                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                      <polyline points="4,11 8,15 16,5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: def.color }} aria-hidden />
                  <span className="text-sm text-[var(--color-text)] font-medium">{def.label}</span>
                </div>
                <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: def.color }}>
                  {def.fmt(headline)}
                </div>
              </label>
            );
          })}
        </div>

        <MultiLineChart series={seriesData} enabled={enabled} />
      </div>
    </div>
  );
}
