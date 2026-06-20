// High-fidelity time-series chart with continuous press-and-drag scrubber.
// Pure inline SVG; no chart library. The scrubber interpolates between
// daily data points so you can see the value at any X position, with
// smooth CSS transitions for the dot + tooltip pill as you move.

"use client";

import { useRef, useState, type PointerEvent } from "react";
import { formatNumber } from "@/lib/utils";

interface Point {
  date: string; // ISO YYYY-MM-DD
  value: number;
}

interface Props {
  points: Point[];
  width?: number;
  height?: number;
  /** Optional dashed reference line (e.g. baseline value) */
  baseline?: number;
  /** Lower is better (avg_position) — API compat; doesn't change color */
  invert?: boolean;
  /** Format Y-axis labels and tooltip values */
  formatter?: (v: number) => string;
  /** Show min/max markers */
  showExtrema?: boolean;
}

function formatTick(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

/** Render an interpolated point's date + hour, e.g. "Jun 7 · 6:00 PM". */
function formatInterpolatedDate(d1: string, d2: string, t: number): string {
  const epoch = (iso: string) => Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  const ms = epoch(d1) + t * (epoch(d2) - epoch(d1));
  const date = new Date(ms);
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const hours24 = date.getUTCHours();
  const hour12 = ((hours24 + 11) % 12) + 1;
  const ampm = hours24 >= 12 ? "PM" : "AM";
  return `${month} ${day} · ${hour12}:00 ${ampm}`;
}

// Catmull-Rom → cubic Bézier. Control-point Y is clamped to [yLo, yHi] (the
// plot area) so the spline can't overshoot past the data — e.g. dip below the
// 0 axis when the line drops sharply to zero. A cubic Bézier stays within the
// convex hull of its control points, so clamping them bounds the whole curve.
function smoothPath(pts: { x: number; y: number }[], yLo: number, yHi: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const clampY = (y: number) => Math.max(yLo, Math.min(yHi, y));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const rough = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = nice * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

export default function TrendChart({
  points,
  width = 800,
  height = 260,
  baseline,
  formatter,
  showExtrema = true,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // continuous index in [0, points.length - 1]; null when not scrubbing
  const [activeFloat, setActiveFloat] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const downRef = useRef<{ x: number; moved: boolean; priorPin: number | null } | null>(null);

  if (!points.length) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[var(--color-text-muted)]">
        No data yet.
      </div>
    );
  }

  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const W = width - padL - padR;
  const H = height - padT - padB;

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values, baseline ?? Infinity);
  const dataMax = Math.max(...values, baseline ?? -Infinity);
  // Tight padding — 5% above/below; counts (everything ≥ 0) get clamped to 0.
  const pad = (dataMax - dataMin) * 0.05 || 1;
  const allNonNegative = dataMin >= 0;
  const yMin = allNonNegative ? 0 : dataMin - pad;
  const yMax = dataMax + pad;
  const yTicks = niceTicks(yMin, yMax, 4).filter((t) => t >= yMin && t <= yMax);

  const xCoord = (i: number) =>
    padL + (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const yCoord = (v: number) => padT + H - ((v - yMin) / (yMax - yMin || 1)) * H;

  const pts = points.map((p, i) => ({ x: xCoord(i), y: yCoord(p.value) }));
  const linePath = smoothPath(pts, padT, padT + H);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padT + H} L ${pts[0].x} ${padT + H} Z`;

  const lineColor = "var(--color-up)";
  const fmt = formatter ?? ((v: number) => formatNumber(v, { maximumFractionDigits: 1 }));

  const xTickIdx: number[] = (() => {
    const n = points.length;
    if (n <= 1) return [0];
    if (n <= 4) return points.map((_, i) => i);
    return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  })();

  // Translate a pointer event into a continuous index (float, not snapped).
  function floatFromPointer(e: PointerEvent<SVGSVGElement>): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * width;
    if (points.length === 1) return 0;
    const ratio = (localX - padL) / W;
    const f = ratio * (points.length - 1);
    return Math.max(0, Math.min(points.length - 1, f));
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const f = floatFromPointer(e);
    setActiveFloat(f);
    // Remember the prior pin so a tap on the same point still toggles off,
    // but clear the live pin so any drag starts on a clean graph.
    downRef.current = { x: e.clientX, moved: false, priorPin: pinnedIdx };
    setPinnedIdx(null);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    if (downRef.current && Math.abs(e.clientX - downRef.current.x) > 4) {
      downRef.current.moved = true;
    }
    setActiveFloat(floatFromPointer(e));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may have been released already
    }
    setDragging(false);
    const down = downRef.current;
    downRef.current = null;
    if (down && !down.moved && activeFloat !== null) {
      // Tap: snap to nearest day; tapping the same day toggles off.
      const snapped = Math.round(activeFloat);
      setPinnedIdx(down.priorPin === snapped ? null : snapped);
    }
    // Drag release leaves pinnedIdx null — graph returns to its clean state.
    setActiveFloat(null);
  };

  // Compute the visible scrubber. Live drag (activeFloat) takes priority,
  // otherwise show the pinned day (set by a click). The Y position evaluates
  // the same Catmull-Rom cubic Bezier we draw, so the dot sits exactly on the
  // curve (linear interpolation would float off in valleys/peaks).
  let active: { x: number; y: number; value: number; dateLabel: string } | null = null;
  const liveFloat = activeFloat !== null ? activeFloat : pinnedIdx !== null ? pinnedIdx : null;
  if (liveFloat !== null) {
    const lo = Math.max(0, Math.min(points.length - 1, Math.floor(liveFloat)));
    const hi = Math.min(lo + 1, points.length - 1);
    const t = liveFloat - lo;

    const p0 = pts[Math.max(0, lo - 1)];
    const p1 = pts[lo];
    const p2 = pts[hi];
    const p3 = pts[Math.min(points.length - 1, hi + 1)];
    // Match the clamped control points used to draw the curve so the scrubber
    // dot sits exactly on the rendered line (no float below the axis).
    const clampY = (y: number) => Math.max(padT, Math.min(padT + H, y));
    const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
    const u = 1 - t;
    const yA = u * u * u * p1.y + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * p2.y;
    const xA = p1.x + t * (p2.x - p1.x);
    const vA = points[lo].value + t * (points[hi].value - points[lo].value);
    const dateLabel =
      lo === hi
        ? formatInterpolatedDate(points[lo].date, points[lo].date, 0)
        : formatInterpolatedDate(points[lo].date, points[hi].date, t);
    active = { x: xA, y: yA, value: vA, dateLabel };
  }

  const gradId = `trend-grad-${Math.round((width + height) * 100)}`;

  const tipW = 260;
  const tipH = 84;
  const tipX = active ? Math.max(padL, Math.min(padL + W - tipW, active.x - tipW / 2)) : 0;
  const tipY = active ? Math.max(padT, active.y - tipH - 16) : 0;

  return (
    <svg
      ref={svgRef}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="overflow-visible w-full h-auto touch-none select-none cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
          <stop offset="65%" stopColor={lineColor} stopOpacity="0.08" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
        <style>{`
          .scrub-group { transition: transform 70ms linear; }
        `}</style>
      </defs>

      {/* Y gridlines + labels */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={padL + W}
            y1={yCoord(t)}
            y2={yCoord(t)}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.5}
          />
          <text
            x={padL - 8}
            y={yCoord(t) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--color-text-muted)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {fmt(t)}
          </text>
        </g>
      ))}

      {/* Baseline */}
      {baseline !== undefined ? (
        <g>
          <line
            x1={padL}
            x2={padL + W}
            y1={yCoord(baseline)}
            y2={yCoord(baseline)}
            stroke="var(--color-border-strong)"
            strokeDasharray="4 4"
            strokeWidth={1.25}
          />
          <text
            x={padL + W - 4}
            y={yCoord(baseline) - 4}
            textAnchor="end"
            fontSize={9}
            fill="var(--color-text-muted)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            letterSpacing="0.05em"
          >
            BASELINE
          </text>
        </g>
      ) : null}

      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Per-day dots — for short ranges show every day; for long ranges
          (>60 points) only show dots at the labeled x-axis positions plus
          any currently-pinned point, to keep the chart legible. */}
      {(() => {
        const dense = points.length <= 60;
        const tickSet = new Set(xTickIdx);
        return pts.map((p, i) => {
          if (!dense && pinnedIdx !== i && !tickSet.has(i)) return null;
          return (
            <circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r={pinnedIdx === i ? 5.5 : 4}
              fill={pinnedIdx === i ? lineColor : "var(--color-bg-card)"}
              stroke={lineColor}
              strokeWidth={1.75}
            />
          );
        });
      })()}


      {!active ? (
        <>
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={5} fill={lineColor} />
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={9} fill={lineColor} opacity={0.18} />
        </>
      ) : null}

      {xTickIdx.map((i) => (
        <text
          key={i}
          x={xCoord(i)}
          y={padT + H + 18}
          textAnchor="middle"
          fontSize={10}
          fill="var(--color-text-muted)"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {formatTick(points[i].date)}
        </text>
      ))}

      {/* Scrubber — each moving piece is wrapped in a <g transform="translate(...)">
          and animates via `transform` (cross-browser smooth) instead of attribute
          interpolation on x/y/cx/cy. */}
      {active ? (
        <g pointerEvents="none">
          {/* vertical dashed guide */}
          <g className="scrub-group" transform={`translate(${active.x} 0)`}>
            <line
              x1={0}
              x2={0}
              y1={padT}
              y2={padT + H}
              stroke={lineColor}
              strokeOpacity={0.45}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </g>

          {/* dot + halo */}
          <g className="scrub-group" transform={`translate(${active.x} ${active.y})`}>
            <circle cx={0} cy={0} r={9} fill={lineColor} opacity={0.25} />
            <circle cx={0} cy={0} r={5} fill={lineColor} />
          </g>

          {/* tooltip pill */}
          <g className="scrub-group" transform={`translate(${tipX} ${tipY})`}>
            <rect
              x={0}
              y={0}
              width={tipW}
              height={tipH}
              rx={8}
              fill="var(--color-bg-card)"
              stroke="var(--color-border-strong)"
            />
            <text
              x={tipW / 2}
              y={36}
              textAnchor="middle"
              fontSize={26}
              fill="var(--color-text)"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight={600}
            >
              {fmt(active.value)}
            </text>
            <text
              x={tipW / 2}
              y={64}
              textAnchor="middle"
              fontSize={14}
              fill="var(--color-text-muted)"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              letterSpacing="0.04em"
            >
              {active.dateLabel.toUpperCase()}
            </text>
          </g>
        </g>
      ) : null}
    </svg>
  );
}
