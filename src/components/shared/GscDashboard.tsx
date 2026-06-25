"use client";

// GSC-style search performance dashboard for the client overview.
// Top row: time-frame pills (7d / 28d / 3mo / 1y / all). Below: three
// colored KPI tiles (clicks, impressions, avg position) — each is a
// checkbox-toggled series. Below: a single line chart that overlays
// whichever series are enabled. Mirrors the layout of Google Search
// Console's Performance page so clients land on something familiar.
//
// Tabs at the bottom — Queries / Pages / Days — fetch their data when
// activated. Queries and Pages call /api/gsc-breakdown for the current
// range; Days reads the daily snapshots already passed in as props.

import { useEffect, useMemo, useState } from "react";
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
  clientId: string;
  clicks: Snapshot[];
  impressions: Snapshot[];
  position: Snapshot[];
  /** CTR snapshots — used for the Days table only, not graphed. Optional. */
  ctr?: Snapshot[];
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
  id: "clicks" | "impressions" | "position";
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
    tile: "bg-blue-500/20 border-blue-400/40", ring: "ring-blue-400/60",
    fmt: (v) => formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" }),
  },
  {
    id: "impressions", label: "Total impressions", color: "#8B5CF6",
    tile: "bg-purple-500/20 border-purple-400/40", ring: "ring-purple-400/60",
    fmt: (v) => formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" }),
  },
  {
    id: "position", label: "Average position", color: "#F59E0B",
    tile: "bg-amber-500/20 border-amber-400/40", ring: "ring-amber-400/60",
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
  onScrub?: (idx: number | null) => void;
}

function MultiLineChart({ series, enabled, onScrub }: ChartProps) {
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
    position: true,
  });

  const days = RANGES.find((r) => r.value === range)!.days;

  const seriesData = useMemo(() => {
    const inputs: Record<SeriesDef["id"], Snapshot[]> = {
      clicks: props.clicks,
      impressions: props.impressions,
      position: props.position,
    };
    return SERIES.map((def) => ({
      def,
      points: clipToRange(inputs[def.id], days),
    }));
  }, [props.clicks, props.impressions, props.position, days]);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      {/* Range pills row */}
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
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {seriesData.map(({ def, points }) => {
            const { headline } = summarize(points, def);
            const on = enabled[def.id];
            const checkboxId = `series-toggle-${def.id}`;
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
                  {/* Visible checkbox */}
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
                  {/* Color swatch + label */}
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: def.color }}
                    aria-hidden
                  />
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

      <BreakdownTabs
        clientId={props.clientId}
        days={days}
        clicks={props.clicks}
        impressions={props.impressions}
        position={props.position}
        ctr={props.ctr}
      />
    </div>
  );
}

// ---------- bottom tabs (Queries / Pages / Days) ----------

type TabKey = "queries" | "pages" | "days";

function BreakdownTabs({
  clientId,
  days,
  clicks,
  impressions,
  position,
  ctr,
}: {
  clientId: string;
  days: number;
  clicks: Snapshot[];
  impressions: Snapshot[];
  position: Snapshot[];
  ctr?: Snapshot[];
}) {
  const [tab, setTab] = useState<TabKey>("queries");
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the current window's from/to. The dashboard's range pills above
  // control `days`, so we use today minus that many days. For the "all time"
  // case we cap at GSC's hard limit (~16 months).
  const { from, to } = useMemo(() => {
    const today = new Date();
    today.setUTCDate(today.getUTCDate() - 2); // GSC has ~2 day lag
    const span = Number.isFinite(days) ? days : 480;
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - span);
    return { from: start.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  }, [days]);

  // Fetch breakdown for the active tab + range.
  useEffect(() => {
    if (tab === "days") return; // days uses local snapshot data
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows(null);
    const dimension = tab === "pages" ? "pages" : "queries";
    fetch(`/api/gsc-breakdown/${clientId}?dimension=${dimension}&from=${from}&to=${to}`)
      .then(async (res) => {
        const body = (await res.json()) as { rows: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>; error?: string };
        if (cancelled) return;
        if (body.error) setError(body.error);
        setRows((body.rows ?? []).map((r) => ({
          label: r.key,
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        })));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, clientId, from, to]);

  // Days tab — assemble per-day rows from the snapshots we already have.
  const daysRows: TopRow[] = useMemo(() => {
    if (tab !== "days") return [];
    const span = Number.isFinite(days) ? days : Math.max(clicks.length, impressions.length);
    const clicksWin = clicks.slice(-span);
    const imprWin = impressions.slice(-span);
    const posWin = position.slice(-span);
    const ctrWin = (ctr ?? []).slice(-span);
    const idx = new Map<string, TopRow>();
    for (const s of imprWin) idx.set(s.captured_at, { label: s.captured_at, clicks: 0, impressions: s.value, ctr: 0, position: 0 });
    for (const s of clicksWin) { const r = idx.get(s.captured_at) ?? { label: s.captured_at, clicks: 0, impressions: 0, ctr: 0, position: 0 }; r.clicks = s.value; idx.set(s.captured_at, r); }
    for (const s of posWin) { const r = idx.get(s.captured_at); if (r) r.position = s.value; }
    for (const s of ctrWin) { const r = idx.get(s.captured_at); if (r) r.ctr = s.value; }
    // Derive CTR if not present.
    for (const r of idx.values()) {
      if (r.ctr === 0 && r.impressions > 0) r.ctr = r.clicks / r.impressions;
    }
    return Array.from(idx.values()).sort((a, b) => b.label.localeCompare(a.label));
  }, [tab, days, clicks, impressions, position, ctr]);

  const activeRows = tab === "days" ? daysRows : (rows ?? []);
  const labelHeader = tab === "queries" ? "Top queries" : tab === "pages" ? "Top pages" : "Date";

  function TabButton({ id, label }: { id: TabKey; label: string }) {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={
          "pb-2 -mb-px text-[11px] uppercase tracking-wider transition " +
          (active
            ? "text-[var(--color-text)] border-b-2 border-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
        }
      >
        {label}
      </button>
    );
  }

  return (
    <div className="border-t border-[var(--color-border)]">
      <div className="flex items-center gap-6 px-4 pt-3">
        <TabButton id="queries" label="Queries" />
        <TabButton id="pages" label="Pages" />
        <TabButton id="days" label="Days" />
      </div>
      <div className="p-4">
        {loading ? (
          <div className="text-xs text-[var(--color-text-muted)] py-6 text-center">Loading…</div>
        ) : error && activeRows.length === 0 ? (
          <div className="text-xs text-red-300 py-6 text-center">{error}</div>
        ) : activeRows.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)] py-6 text-center">
            {tab === "days"
              ? "No daily snapshots in this range yet — the sync hasn't produced data."
              : "No data yet. GSC sync may not be connected for this client."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <th className="py-2 pr-4 font-medium">{labelHeader}</th>
                  <th className="py-2 px-4 font-medium text-right">Clicks</th>
                  <th className="py-2 px-4 font-medium text-right">Impressions</th>
                  <th className="py-2 px-4 font-medium text-right">CTR</th>
                  <th className="py-2 pl-4 font-medium text-right">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/60">
                {activeRows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 text-[var(--color-text)]">
                      {tab === "pages" ? (
                        <a href={r.label} target="_blank" rel="noreferrer" className="hover:underline text-emerald-300">
                          {r.label.replace(/^https?:\/\//, "").slice(0, 70)}
                        </a>
                      ) : (
                        r.label
                      )}
                    </td>
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
  );
}
