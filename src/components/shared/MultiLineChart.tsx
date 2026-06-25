"use client";

// Multi-line time-series chart. Each series is normalized to its own [min,max]
// so lines with very different scales (e.g. impressions in 100k's vs avg
// position around 13) can be visually compared as shape trends. Press-and-drag
// scrubber matches TrendChart — no live free-hover follow.

import { useRef, useState, type PointerEvent } from "react";

export interface ChartSeries {
  key: string;
  color: string;
  visible: boolean;
  points: { date: string; value: number }[];
}

interface Props {
  series: ChartSeries[];
  width?: number;
  height?: number;
  /** Reported on press/drag/release; null when not scrubbing. */
  onHover?: (idx: number | null) => void;
}

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
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function MultiLineChart({ series, width = 1400, height = 380, onHover }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const downRef = useRef<{ x: number; moved: boolean; priorPin: number | null } | null>(null);

  // Longest visible series acts as the x-axis.
  const xMaster = series
    .filter((s) => s.visible && s.points.length)
    .reduce((acc, s) => (s.points.length > acc.length ? s.points : acc), [] as ChartSeries["points"]);

  const padL = 30;
  const padR = 30;
  const padT = 24;
  const padB = 28;
  const W = width - padL - padR;
  const H = height - padT - padB;

  if (xMaster.length === 0) {
    return (
      <div
        className="grid place-items-center text-xs text-[var(--color-text-subtle)]"
        style={{ height }}
      >
        No metric selected.
      </div>
    );
  }

  // Single point — render the dot, skip the curve.
  const singlePoint = xMaster.length === 1;
  const xCoord = (i: number) =>
    singlePoint ? padL + W / 2 : padL + (i / (xMaster.length - 1)) * W;

  function normalize(s: ChartSeries) {
    const vals = s.points.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    return s.points.map((p, i) => ({
      x: xCoord(i),
      y: singlePoint ? padT + H / 2 : padT + 4 + (1 - (p.value - lo) / span) * (H - 8),
    }));
  }

  function idxFromPointer(e: PointerEvent<SVGSVGElement>): number {
    const node = ref.current;
    if (!node) return 0;
    const r = node.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * width;
    if (singlePoint) return 0;
    const ratio = (x - padL) / W;
    return Math.max(0, Math.min(xMaster.length - 1, Math.round(ratio * (xMaster.length - 1))));
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const i = idxFromPointer(e);
    setActiveIdx(i);
    onHover?.(i);
    downRef.current = { x: e.clientX, moved: false, priorPin: pinnedIdx };
    setPinnedIdx(null);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    if (downRef.current && Math.abs(e.clientX - downRef.current.x) > 4) {
      downRef.current.moved = true;
    }
    const i = idxFromPointer(e);
    setActiveIdx(i);
    onHover?.(i);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* already released */ }
    setDragging(false);
    const down = downRef.current;
    downRef.current = null;
    if (down && !down.moved && activeIdx !== null) {
      const next = down.priorPin === activeIdx ? null : activeIdx;
      setPinnedIdx(next);
      onHover?.(next);
    } else {
      onHover?.(pinnedIdx);
    }
    setActiveIdx(null);
  };

  // The displayed scrubber index: live drag > pinned > none.
  const scrubIdx = activeIdx !== null ? activeIdx : pinnedIdx;

  const xTickCount = 5;
  const xTickIdx = singlePoint
    ? [0]
    : Array.from({ length: xTickCount }, (_, i) =>
        Math.round((i / (xTickCount - 1)) * (xMaster.length - 1)),
      );

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="touch-none select-none cursor-crosshair"
    >
      <line x1={padL} x2={padL + W} y1={padT + H} y2={padT + H} stroke="var(--color-border)" strokeWidth={1} />

      {/* Series lines (or dots for single point) */}
      {series.map((s) => {
        if (!s.visible || s.points.length === 0) return null;
        const pts = normalize(s);
        if (singlePoint) {
          return <circle key={s.key} cx={pts[0].x} cy={pts[0].y} r={5} fill={s.color} />;
        }
        const d = smoothPath(pts, padT, padT + H);
        return (
          <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        );
      })}

      {/* Scrubber crosshair + per-line dots */}
      {scrubIdx !== null ? (
        <>
          <line
            x1={xCoord(scrubIdx)}
            x2={xCoord(scrubIdx)}
            y1={padT}
            y2={padT + H}
            stroke="var(--color-text-muted)"
            strokeOpacity={0.4}
            strokeDasharray="3 3"
          />
          {series.map((s) => {
            if (!s.visible || !s.points[scrubIdx]) return null;
            const pts = normalize(s);
            const p = pts[scrubIdx];
            return <circle key={`dot-${s.key}`} cx={p.x} cy={p.y} r={4.5} fill={s.color} stroke={s.color} strokeWidth={1.5} />;
          })}
        </>
      ) : null}

      {/* X tick labels */}
      {xTickIdx.map((i) => {
        const d = xMaster[i]?.date ?? "";
        const [, m, day] = d.split("-");
        return (
          <text
            key={i}
            x={xCoord(i)}
            y={padT + H + 18}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-text-muted)"
            fontFamily="var(--font-sans, system-ui)"
          >
            {`${Number(m)}/${Number(day)}`}
          </text>
        );
      })}
    </svg>
  );
}
