"use client";

// The traffic chart.
//
// Two series that share a unit (counts of people and counts of page loads), so
// they share one axis — never a second y-scale. Pageviews is the filled area
// because it's the larger and quieter number; visitors is the line on top,
// because that's the one anyone actually reads.
//
// Hand-drawn SVG rather than a chart library: the repo has none, and this needs
// a grid, an axis, a crosshair and a tooltip — about 120 lines — where a library
// would be a dependency and a bundle for one chart.

import { useState } from "react";

export interface Point {
  bucket: string;
  visitors: number;
  pageviews: number;
}

const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

/** Axis ceilings on 1/2/5×10ⁿ so labels read as round numbers. */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 5, 10].find((s) => v <= s * mag) ?? 10;
  return step * mag;
}

function label(bucket: string, hourly: boolean): string {
  if (hourly) {
    const h = Number(bucket.slice(11, 13));
    return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  }
  const [y, m, d] = bucket.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TrafficChart({
  points,
  accent,
  hourly,
}: {
  points: Point[];
  /** the client's own colour — identity, and the single hue of this chart */
  accent: string;
  hourly: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--color-border)]">
        <p className="max-w-xs text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
          No visits recorded in this window yet. Once the snippet is live, traffic appears here
          within seconds of the first visitor.
        </p>
      </div>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(1, ...points.map((p) => p.pageviews)));
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : i * stepX);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const areaPath =
    `M ${x(0)} ${y(0)} ` +
    points.map((p, i) => `L ${x(i).toFixed(1)} ${y(p.pageviews).toFixed(1)}`).join(" ") +
    ` L ${x(points.length - 1)} ${y(0)} Z`;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.visitors).toFixed(1)}`)
    .join(" ");

  // Four gridlines is enough to read a value off; more becomes a cage.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  // Roughly six x-labels regardless of range, so 90 days doesn't overlap.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
          <span className="h-[2px] w-4 rounded-full" style={{ background: accent }} /> Visitors
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: accent, opacity: 0.18 }} /> Pageviews
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label={`Traffic over time. ${points.length} points, peak ${max} pageviews.`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grid — recessive: it should be findable, not visible. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                stroke="var(--color-border)" strokeWidth="1" opacity="0.5"
              />
              <text
                x={PAD.left - 6} y={y(t) + 3} textAnchor="end"
                className="fill-[var(--color-text-subtle)]" style={{ fontSize: 9 }}
              >
                {t}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={accent} opacity="0.16" />
          <path d={linePath} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text
                key={p.bucket} x={x(i)} y={H - 6} textAnchor="middle"
                className="fill-[var(--color-text-subtle)]" style={{ fontSize: 9 }}
              >
                {label(p.bucket, hourly)}
              </text>
            ) : null,
          )}

          {/* Crosshair */}
          {hover !== null ? (
            <>
              <line
                x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH}
                stroke="var(--color-border-strong)" strokeWidth="1"
              />
              <circle cx={x(hover)} cy={y(points[hover].visitors)} r="4.5" fill={accent}
                stroke="var(--color-bg-card)" strokeWidth="2" />
            </>
          ) : null}

          {/* Invisible hit targets, wider than the marks so hovering is easy. */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.bucket}`}
              x={x(i) - Math.max(6, stepX / 2)} y={PAD.top}
              width={Math.max(12, stepX)} height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-1.5 shadow-lg"
            style={{
              // Flip to the left near the right edge so the tooltip never clips.
              left: `${((hover! / Math.max(1, points.length - 1)) * 100).toFixed(1)}%`,
              transform: hover! > points.length / 2 ? "translateX(-105%)" : "translateX(5%)",
            }}
          >
            <div className="text-[10px] font-medium">{label(active.bucket, hourly)}</div>
            <div className="mt-0.5 text-[11px] tabular-nums">
              <span className="font-semibold">{active.visitors}</span>{" "}
              <span className="text-[var(--color-text-muted)]">visitors</span>
            </div>
            <div className="text-[11px] tabular-nums">
              <span className="font-semibold">{active.pageviews}</span>{" "}
              <span className="text-[var(--color-text-muted)]">pageviews</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
