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

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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
    id: "clicks", label: "Clicks", color: "#3B82F6",
    tile: "bg-blue-500/20 border-blue-400/40", ring: "ring-blue-400/60",
    fmt: (v) => formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" }),
  },
  {
    id: "impressions", label: "Impressions", color: "#8B5CF6",
    tile: "bg-purple-500/20 border-purple-400/40", ring: "ring-purple-400/60",
    fmt: (v) => formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" }),
  },
  {
    id: "position", label: "Avg. Position", color: "#F59E0B",
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
  // Tight internal padding so the plotted lines can push closer to the top /
  // bottom of the SVG and use more of the available height.
  const pad = { l: 16, r: 16, t: 6, b: 28 };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeFloat, setActiveFloat] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const downRef = useRef<{ x: number; moved: boolean; priorPin: number | null } | null>(null);

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

  // Per-series Y normalization. Build a date→value lookup AND a per-series
  // normalized y-coordinate getter so the scrubber dot can sit exactly on
  // the line at a continuous float index (linear between adjacent points).
  type Norm = { byDate: Map<string, number>; y: (v: number) => number };
  function normFor(s: { def: SeriesDef; points: Snapshot[] }): Norm {
    const byDate = new Map(s.points.map((p) => [p.captured_at, p.value]));
    const vals = s.points.map((p) => p.value);
    // True min/max of the actual data (was clamped to 0, which meant a
    // Clicks series varying between 200-400 got plotted on a 0-400 scale and
    // sat in the middle 50% of the chart with dead space above). Adding a
    // small 5% padding above/below the true range so the peaks and troughs
    // don't kiss the plot edges.
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const spread = Math.max(rawMax - rawMin, 1);
    const min = rawMin - spread * 0.05;
    const max = rawMax + spread * 0.05;
    const range = max - min || 1;
    const top = pad.t;
    const bot = H - pad.b;
    const y = (v: number) => bot - ((v - min) / range) * (bot - top);
    return { byDate, y };
  }

  // Catmull-Rom → cubic Bezier through the actual data points (skipping
  // dates where this series has no value). Control points are clamped to the
  // plot area so the curve can't overshoot the box on steep drops.
  function pathFor(s: { def: SeriesDef; points: Snapshot[] }, norm: Norm): string {
    const pts: { x: number; y: number }[] = [];
    allDates.forEach((d, i) => {
      const v = norm.byDate.get(d);
      if (v === undefined) return;
      pts.push({ x: x(i), y: norm.y(v) });
    });
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    const top = pad.t;
    const bot = H - pad.b;
    const clampY = (y: number) => Math.max(top, Math.min(bot, y));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  // Continuous float index (not snapped) from pointer position.
  function floatFromPointer(e: PointerEvent<SVGSVGElement>): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    if (allDates.length === 1) return 0;
    const ratio = (localX - pad.l) / (W - pad.l - pad.r);
    return Math.max(0, Math.min(allDates.length - 1, ratio * (allDates.length - 1)));
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const f = floatFromPointer(e);
    setActiveFloat(f);
    onScrub?.(f);
    downRef.current = { x: e.clientX, moved: false, priorPin: pinnedIdx };
    setPinnedIdx(null);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    if (downRef.current && Math.abs(e.clientX - downRef.current.x) > 4) {
      downRef.current.moved = true;
    }
    const f = floatFromPointer(e);
    setActiveFloat(f);
    onScrub?.(f);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    setDragging(false);
    const down = downRef.current;
    downRef.current = null;
    if (down && !down.moved && activeFloat !== null) {
      const snapped = Math.round(activeFloat);
      const next = down.priorPin === snapped ? null : snapped;
      setPinnedIdx(next);
      onScrub?.(next);
    } else {
      onScrub?.(pinnedIdx);
    }
    setActiveFloat(null);
  };

  // Scrubber position (continuous): live drag wins, then pin.
  const scrubFloat = activeFloat !== null ? activeFloat : pinnedIdx;

  // Linear-interpolate a series' value at a continuous float index.
  function interpAt(s: { def: SeriesDef; points: Snapshot[] }, f: number): { value: number | null; y: number | null } {
    const norm = normFor(s);
    const lo = Math.max(0, Math.min(allDates.length - 1, Math.floor(f)));
    const hi = Math.min(lo + 1, allDates.length - 1);
    const t = f - lo;
    const vLo = norm.byDate.get(allDates[lo]);
    const vHi = norm.byDate.get(allDates[hi]);
    if (vLo === undefined || vHi === undefined) return { value: null, y: null };
    const v = vLo + t * (vHi - vLo);
    return { value: v, y: norm.y(v) };
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

  const scrubX = scrubFloat !== null ? (() => {
    const lo = Math.max(0, Math.min(allDates.length - 1, Math.floor(scrubFloat)));
    const hi = Math.min(lo + 1, allDates.length - 1);
    const t = scrubFloat - lo;
    return x(lo) + t * (x(hi) - x(lo));
  })() : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[540px] sm:h-[400px] touch-none select-none cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.10)" />
      {activeSeries.map((s) => {
        const norm = normFor(s);
        return (
          <path
            key={s.def.id}
            d={pathFor(s, norm)}
            fill="none"
            stroke={s.def.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {scrubFloat !== null && scrubX !== null ? (
        <>
          <line
            x1={scrubX}
            x2={scrubX}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--color-text-muted)"
            strokeOpacity={0.4}
            strokeDasharray="3 3"
          />
          {activeSeries.map((s) => {
            const { y } = interpAt(s, scrubFloat);
            if (y === null) return null;
            return (
              <circle key={`dot-${s.def.id}`} cx={scrubX} cy={y} r={5} fill={s.def.color} stroke={s.def.color} strokeWidth={1.5} />
            );
          })}
        </>
      ) : null}

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
  // Float index reported by the chart while scrubbing; null when idle.
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

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
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5">
          {seriesData.map(({ def, points }) => {
            const { headline: aggregate } = summarize(points, def);
            // Build the shared date list (same logic the chart uses) so the
            // scrub float index maps to the right point in this series.
            let interpolated: number | null = null;
            if (scrubIdx !== null && points.length) {
              const allDates = Array.from(new Set(seriesData.flatMap((s) => s.points.map((p) => p.captured_at)))).sort();
              const lo = Math.max(0, Math.min(allDates.length - 1, Math.floor(scrubIdx)));
              const hi = Math.min(lo + 1, allDates.length - 1);
              const t = scrubIdx - lo;
              const byDate = new Map(points.map((p) => [p.captured_at, p.value]));
              const vLo = byDate.get(allDates[lo]);
              const vHi = byDate.get(allDates[hi]);
              if (vLo !== undefined && vHi !== undefined) interpolated = vLo + t * (vHi - vLo);
            }
            const headline = interpolated ?? aggregate;
            const on = enabled[def.id];
            const checkboxId = `series-toggle-${def.id}`;
            return (
              <label
                key={def.id}
                htmlFor={checkboxId}
                className={
                  "relative cursor-pointer select-none text-left rounded-lg sm:rounded-xl border px-2 py-2 sm:px-4 sm:py-3 transition flex flex-col " +
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
                <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                  {/* Visible checkbox */}
                  <span
                    className={
                      "inline-flex items-center justify-center w-3.5 h-3.5 sm:w-5 sm:h-5 rounded border-2 transition shrink-0 " +
                      (on ? "bg-white border-white text-black" : "bg-transparent border-white/50 text-transparent")
                    }
                    aria-hidden
                  >
                    <svg viewBox="0 0 20 20" className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                      <polyline points="4,11 8,15 16,5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {/* Color swatch + label */}
                  <span
                    className="inline-block w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: def.color }}
                    aria-hidden
                  />
                  <span className="text-[10px] sm:text-sm text-[var(--color-text)] font-medium truncate">{def.label}</span>
                </div>
                <div className="mt-1 sm:mt-2 text-lg sm:text-3xl font-semibold tabular-nums" style={{ color: def.color }}>
                  {def.fmt(headline)}
                </div>
              </label>
            );
          })}
        </div>

        <MultiLineChart series={seriesData} enabled={enabled} onScrub={setScrubIdx} />
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

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  // The last completed fetch, tagged with the request key it answered.
  // A tab/range change makes the tag stale, which reads as "loading" below —
  // no synchronous state resets inside the effect needed.
  const [fetched, setFetched] = useState<{
    key: string;
    rows: TopRow[] | null;
    error: string | null;
  }>({ key: "", rows: null, error: null });

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

  // days uses local snapshot data — no fetch.
  const requestKey = tab === "days" ? null : `${tab}:${clientId}:${from}:${to}`;

  // Fetch breakdown for the active tab + range.
  useEffect(() => {
    if (!requestKey || tab === "days") return;
    let cancelled = false;
    const dimension = tab === "pages" ? "pages" : "queries";
    fetch(`/api/gsc-breakdown/${clientId}?dimension=${dimension}&from=${from}&to=${to}`)
      .then(async (res) => {
        const body = (await res.json()) as { rows: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>; error?: string };
        if (cancelled) return;
        setFetched({
          key: requestKey,
          rows: (body.rows ?? []).map((r) => ({
            label: r.key,
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          })),
          error: body.error ?? null,
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setFetched({ key: requestKey, rows: [], error: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, tab, clientId, from, to]);

  const fresh = requestKey !== null && fetched.key === requestKey;
  const rows = fresh ? fetched.rows : null;
  const error = fresh ? fetched.error : null;
  const loading = requestKey !== null && !fresh;

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

  return (
    <div className="border-t border-[var(--color-border)]">
      <div className="flex items-center gap-6 px-4 pt-3">
        <TabButton active={tab === "queries"} onClick={() => setTab("queries")} label="Queries" />
        <TabButton active={tab === "pages"} onClick={() => setTab("pages")} label="Pages" />
        <TabButton active={tab === "days"} onClick={() => setTab("days")} label="Days" />
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
