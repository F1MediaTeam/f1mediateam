// Charts rendered natively in react-pdf via <Svg>. PDF text uses built-in
// Helvetica so we don't depend on system fonts in the Vercel runtime
// (which is why the previous sharp-rasterized charts came back as boxes).

import React from "react";
import {
  Svg,
  G,
  Path,
  Rect,
  Circle,
  Line,
  Text as PdfText,
  Defs,
  LinearGradient,
  Stop,
} from "@react-pdf/renderer";

// react-pdf's SVG <Text> works with fontSize/fontFamily/fontWeight at runtime,
// but its TypeScript types only expose SVGPresentationAttributes. Wrap it so
// the chart code can pass these props naturally.
type SvgTextProps = {
  x: number;
  y: number;
  fontSize?: number;
  fontWeight?: "normal" | "bold" | number;
  fill?: string;
  textAnchor?: "start" | "middle" | "end";
  children: React.ReactNode;
};
function SvgText({ x, y, fontSize, fontWeight, fill, textAnchor, children }: SvgTextProps) {
  const T = PdfText as unknown as React.ComponentType<{
    x: number; y: number; fontSize?: number; fontWeight?: "normal" | "bold" | number;
    fill?: string; textAnchor?: "start" | "middle" | "end"; children: React.ReactNode;
  }>;
  return <T x={x} y={y} fontSize={fontSize} fontWeight={fontWeight} fill={fill} textAnchor={textAnchor}>{children}</T>;
}

// LETTER page is 612pt wide. With 36pt margins each side, the content area is
// 540pt. Render every chart at that width so it spans the page; height scales
// proportionally to each chart's viewBox aspect.
const DISPLAY_WIDTH = 540;

export const PALETTE = {
  ink: "#0B0F19",
  paper: "#FFFFFF",
  accent: "#14B8A6",
  muted: "#6B7280",
  rule: "#E5E7EB",
  ok: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
  series: ["#14B8A6", "#6366F1", "#F59E0B", "#EF4444", "#22C55E", "#8B5CF6"],
};

// ---------- helpers ----------

/**
 * "Nice" axis bounds + gridlines that fully contain [dataMin, dataMax]: the top
 * tick sits at/above the data and the bottom at/below it, so a line or bar never
 * spills past the last labelled gridline. `floorZero` pins the bottom to 0 for
 * non-negative data (counts, traffic, etc.).
 */
function niceAxis(
  dataMin: number,
  dataMax: number,
  opts: { floorZero?: boolean } = {},
  count = 4,
): { yMin: number; yMax: number; ticks: number[] } {
  const pinZero = Boolean(opts.floorZero) && dataMin >= 0;
  const pad = (dataMax - dataMin) * 0.08 || 1;
  const lo = pinZero ? 0 : dataMin - pad;
  const hi = dataMax + pad;
  let step = 1;
  if (hi > lo) {
    const rough = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    step = nice * mag;
  }
  const yMin = pinZero ? 0 : Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
  return { yMin, yMax, ticks };
}

function formatTickValue(v: number): string {
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("en-US");
  if (Math.abs(v) < 1) return v.toFixed(2);
  if (Math.abs(v) < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Catmull-Rom → cubic Bézier. Control-point Y is clamped to the plot area
// [yLo, yHi] so the spline can't overshoot past the data (e.g. dip below the
// 0 axis on a sharp drop to zero); a cubic Bézier stays within the convex hull
// of its control points, so clamping them bounds the whole curve.
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
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ---------- shared types ----------

export interface LinePoint { date: string; value: number; }
export interface LineSeries { label: string; color?: string; points: LinePoint[]; }
export interface BarDatum { label: string; value: number; color?: string; }

// =========================================================================
// Dashboard-style chart card (matches the in-app TrendChart look)
// =========================================================================

export interface DashboardCardProps {
  title: string;            // e.g. "Organic clicks"
  source?: string;          // "From Google Search Console"
  series: LinePoint[];
  totalLabel?: string;
  totalValue?: string;
  baselineLabel?: string;
  baselineValue?: string;
  baselineDate?: string;
  currentLabel?: string;
  currentValue?: string;
  currentDate?: string;
  deltaPct?: number;        // signed; raw fraction (not percent)
  lowerBetter?: boolean;
  width?: number;
  height?: number;
}

export function DashboardCard(props: DashboardCardProps) {
  // width/height define the viewBox coordinate space (internal layout). The
  // <Svg> below scales to the container's pt width via "100%", so this is just
  // the design canvas — not literal pt size on the page.
  const width = props.width ?? 1100;
  const height = props.height ?? 520;

  const padX = 36;
  const padTop = 40;
  const titleY = padTop + 24;
  const sourceY = titleY + 22;
  const tilesY = sourceY + 36;
  const tileH = 86;
  const chartTop = tilesY + tileH + 24;
  const chartBottom = height - 60;
  const chartLeft = padX + 12;
  const chartRight = width - padX - 12;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  const cardBg = "#FFFFFF";
  const cardBorder = "#E5E7EB";
  const tileBorder = "#E5E7EB";
  const textMain = "#0F172A";
  const textMuted = "#475569";
  const textLabel = "#64748B";
  const lineColor = "#15803D";

  // Empty
  if (props.series.length === 0) {
    return (
      <Svg width={DISPLAY_WIDTH} height={Math.round(DISPLAY_WIDTH * height / width)} viewBox={`0 0 ${width} ${height}`}>
        <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={16} ry={16} fill={cardBg} stroke={cardBorder} />
        <SvgText x={padX} y={titleY} fontSize={22} fill={textMain}>{props.title}</SvgText>
        {props.source ? <SvgText x={padX} y={sourceY} fontSize={12} fill={textMuted}>{props.source}</SvgText> : null}
        <SvgText x={width / 2} y={(chartTop + chartBottom) / 2} fontSize={14} fill={textMuted} textAnchor="middle">No data in the selected range.</SvgText>
      </Svg>
    );
  }

  const values = props.series.map((p) => p.value);
  const { yMin, yMax, ticks: yTicks } = niceAxis(Math.min(...values), Math.max(...values), { floorZero: true });

  const xCoord = (i: number) =>
    chartLeft + (props.series.length === 1 ? chartW / 2 : (i / (props.series.length - 1)) * chartW);
  const yCoord = (v: number) => chartTop + chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;

  const pts = props.series.map((p, i) => ({ x: xCoord(i), y: yCoord(p.value) }));
  const linePath = smoothPath(pts, chartTop, chartBottom);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${chartBottom} L ${pts[0].x} ${chartBottom} Z`;

  const baselineV = Number((props.baselineValue ?? String(props.series[0]?.value ?? "")).replace(/,/g, ""));
  const showBaseline = Number.isFinite(baselineV) && baselineV >= yMin && baselineV <= yMax;

  const xTickIdx = (() => {
    const n = props.series.length;
    if (n <= 1) return [0];
    if (n <= 4) return props.series.map((_, i) => i);
    return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  })();

  // Delta pill
  const renderDelta = () => {
    if (props.deltaPct === undefined || props.deltaPct === null) return null;
    const signed = props.lowerBetter ? -props.deltaPct : props.deltaPct;
    const pct = props.deltaPct * 100;
    const sign = pct > 0 ? "+" : "";
    const txt = `${sign}${pct.toFixed(1)}%`;
    const fill = signed > 0 ? "#DCFCE7" : signed < 0 ? "#FEE2E2" : "#F3F4F6";
    const color = signed > 0 ? "#15803D" : signed < 0 ? "#B91C1C" : textMuted;
    const w = 76; const h = 26;
    const x = width - padX - w;
    const y = padTop + 6;
    return (
      <G>
        <Rect x={x} y={y} width={w} height={h} rx={13} fill={fill} />
        <SvgText x={x + w / 2} y={y + 18} fontSize={13} fill={color} textAnchor="middle">{txt}</SvgText>
      </G>
    );
  };

  // Stat tiles
  const tileGap = 14;
  const tileW = Math.floor((chartRight - chartLeft - tileGap * 2) / 3);

  const renderTile = (i: number, label: string, value?: string, sub?: string) => {
    const x = chartLeft + i * (tileW + tileGap);
    return (
      <G key={i}>
        <Rect x={x} y={tilesY} width={tileW} height={tileH} rx={10} fill="transparent" stroke={tileBorder} />
        <SvgText x={x + 16} y={tilesY + 22} fontSize={10} fill={textLabel}>{label.toUpperCase()}</SvgText>
        <SvgText x={x + 16} y={tilesY + 54} fontSize={24} fill={textMain}>{value ?? "—"}</SvgText>
        {sub ? <SvgText x={x + 16} y={tilesY + 74} fontSize={10} fill={textMuted}>{sub}</SvgText> : null}
      </G>
    );
  };

  const gradId = `g-${Math.round((width + height) * 100 + props.series.length)}`;

  return (
    <Svg width={DISPLAY_WIDTH} height={Math.round(DISPLAY_WIDTH * height / width)} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={lineColor} stopOpacity={0.45} />
          <Stop offset="65%" stopColor={lineColor} stopOpacity={0.10} />
          <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={16} ry={16} fill={cardBg} stroke={cardBorder} />

      <SvgText x={padX} y={titleY} fontSize={22} fill={textMain}>{props.title}</SvgText>
      {props.source ? <SvgText x={padX} y={sourceY} fontSize={12} fill={textMuted}>{props.source}</SvgText> : null}
      {renderDelta()}

      {renderTile(0, props.totalLabel ?? "TOTAL", props.totalValue)}
      {renderTile(1, props.baselineLabel ?? "BASELINE", props.baselineValue, props.baselineDate)}
      {renderTile(2, props.currentLabel ?? "CURRENT", props.currentValue, props.currentDate)}

      {/* Gridlines + y-axis labels */}
      {yTicks.map((t, i) => (
        <G key={i}>
          <Line x1={chartLeft} x2={chartRight} y1={yCoord(t)} y2={yCoord(t)} stroke={textMuted} strokeOpacity={0.18} strokeDasharray="2 4" />
          <SvgText x={chartLeft - 8} y={yCoord(t) + 3} fontSize={11} fill={textMuted} textAnchor="end">
            {formatTickValue(t)}
          </SvgText>
        </G>
      ))}

      {/* Baseline rule */}
      {showBaseline ? (
        <Line x1={chartLeft} x2={chartRight} y1={yCoord(baselineV)} y2={yCoord(baselineV)} stroke={textMuted} strokeOpacity={0.45} strokeDasharray="4 4" />
      ) : null}

      {/* Area + line */}
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {pts.map((p, i) =>
        i === pts.length - 1 ? (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={11} fill={lineColor} fillOpacity={0.2} />
            <Circle cx={p.x} cy={p.y} r={6} fill={lineColor} />
          </G>
        ) : (
          <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={lineColor} />
        ),
      )}

      {/* X-axis labels */}
      {xTickIdx.map((i) => {
        const d = props.series[i].date;
        const [, mo, day] = d.split("-");
        return (
          <SvgText key={i} x={xCoord(i)} y={chartBottom + 22} fontSize={11} fill={textMuted} textAnchor="middle">
            {`${Number(mo)}/${Number(day)}`}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Light line chart (sections other than metrics)
// =========================================================================

export interface LineChartProps {
  title: string;
  subtitle?: string;
  series: LineSeries[];
  width?: number;
  height?: number;
}

export function LineChart(props: LineChartProps) {
  const width = props.width ?? 720;
  const height = props.height ?? 280;
  const m = { t: 44, r: 24, b: 48, l: 56 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;

  const allDates = Array.from(new Set(props.series.flatMap((s) => s.points.map((p) => p.date)))).sort();
  const allValues = props.series.flatMap((s) => s.points.map((p) => p.value));

  if (allDates.length === 0 || allValues.length === 0) {
    return <EmptyChart title={props.title} width={width} height={height} />;
  }

  const { yMin, yMax, ticks: yTicks } = niceAxis(Math.min(...allValues), Math.max(...allValues), { floorZero: true });

  const xCoord = (i: number) =>
    m.l + (allDates.length === 1 ? W / 2 : (i / (allDates.length - 1)) * W);
  const yCoord = (v: number) => m.t + H - ((v - yMin) / (yMax - yMin || 1)) * H;

  const xTickIdx = (() => {
    const n = allDates.length;
    if (n <= 1) return [0];
    if (n <= 4) return allDates.map((_, i) => i);
    return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  })();

  return (
    <Svg width={DISPLAY_WIDTH} height={Math.round(DISPLAY_WIDTH * height / width)} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={PALETTE.paper} />
      <SvgText x={m.l} y={20} fontSize={14} fill={PALETTE.ink}>{props.title}</SvgText>
      {props.subtitle ? <SvgText x={m.l} y={34} fontSize={10} fill={PALETTE.muted}>{props.subtitle}</SvgText> : null}

      {yTicks.map((t, i) => (
        <G key={i}>
          <Line x1={m.l} x2={m.l + W} y1={yCoord(t)} y2={yCoord(t)} stroke={PALETTE.rule} strokeDasharray="2 4" />
          <SvgText x={m.l - 8} y={yCoord(t) + 3} fontSize={10} fill={PALETTE.muted} textAnchor="end">{formatTickValue(t)}</SvgText>
        </G>
      ))}

      {props.series.map((s, sIdx) => {
        const color = s.color ?? PALETTE.series[sIdx % PALETTE.series.length];
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        const sPts = allDates
          .map((d, i) => (byDate.has(d) ? { x: xCoord(i), y: yCoord(byDate.get(d)!) } : null))
          .filter((p): p is { x: number; y: number } => p !== null);
        if (sPts.length === 0) return null;
        const path = sPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
        const last = sPts[sPts.length - 1];
        return (
          <G key={sIdx}>
            <Path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {sPts.map((p, j) => <Circle key={j} cx={p.x} cy={p.y} r={2.5} fill={color} />)}
            <Circle cx={last.x} cy={last.y} r={9} fill={color} fillOpacity={0.2} />
            <Circle cx={last.x} cy={last.y} r={5} fill={color} />
          </G>
        );
      })}

      {xTickIdx.map((i) => {
        const d = allDates[i];
        const [, mo, day] = d.split("-");
        return (
          <SvgText key={i} x={xCoord(i)} y={m.t + H + 18} fontSize={10} fill={PALETTE.muted} textAnchor="middle">
            {`${Number(mo)}/${Number(day)}`}
          </SvgText>
        );
      })}

      {props.series.length > 1 ? props.series.map((s, i) => {
        const color = s.color ?? PALETTE.series[i % PALETTE.series.length];
        const lx = m.l + i * 130;
        return (
          <G key={i}>
            <Rect x={lx} y={height - 22} width={10} height={10} rx={2} fill={color} />
            <SvgText x={lx + 16} y={height - 13} fontSize={10} fill={PALETTE.muted}>{s.label}</SvgText>
          </G>
        );
      }) : null}
    </Svg>
  );
}

// =========================================================================
// Light bar chart
// =========================================================================

export interface BarChartProps {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  width?: number;
  height?: number;
}

export function BarChart(props: BarChartProps) {
  const width = props.width ?? 720;
  const height = props.height ?? 280;
  const m = { t: 44, r: 24, b: 64, l: 56 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;

  if (props.data.length === 0) {
    return <EmptyChart title={props.title} width={width} height={height} />;
  }

  const values = props.data.map((d) => d.value);
  const { yMin, yMax, ticks: yTicks } = niceAxis(0, Math.max(...values, 0), { floorZero: true });

  const slot = W / props.data.length;
  const barWidth = Math.min(slot * 0.65, 60);
  const yCoord = (v: number) => m.t + H - ((v - yMin) / (yMax - yMin || 1)) * H;

  return (
    <Svg width={DISPLAY_WIDTH} height={Math.round(DISPLAY_WIDTH * height / width)} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={PALETTE.paper} />
      <SvgText x={m.l} y={20} fontSize={14} fill={PALETTE.ink}>{props.title}</SvgText>
      {props.subtitle ? <SvgText x={m.l} y={34} fontSize={10} fill={PALETTE.muted}>{props.subtitle}</SvgText> : null}

      {yTicks.map((t, i) => (
        <G key={i}>
          <Line x1={m.l} x2={m.l + W} y1={yCoord(t)} y2={yCoord(t)} stroke={PALETTE.rule} strokeDasharray="2 4" />
          <SvgText x={m.l - 8} y={yCoord(t) + 3} fontSize={10} fill={PALETTE.muted} textAnchor="end">{formatTickValue(t)}</SvgText>
        </G>
      ))}

      {props.data.map((d, i) => {
        const color = d.color ?? PALETTE.series[i % PALETTE.series.length];
        const x = m.l + i * slot + (slot - barWidth) / 2;
        const y = yCoord(d.value);
        const h = m.t + H - y;
        const labelX = m.l + i * slot + slot / 2;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barWidth} height={h} rx={3} fill={color} />
            <SvgText x={labelX} y={y - 6} fontSize={11} fill={PALETTE.ink} textAnchor="middle">{formatTickValue(d.value)}</SvgText>
            <SvgText x={labelX} y={m.t + H + 16} fontSize={10} fill={PALETTE.muted} textAnchor="middle">{truncate(d.label, 16)}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Donut chart
// =========================================================================

export interface DonutChartProps {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  centerValue?: string;
  centerLabel?: string;
  width?: number;
  height?: number;
}

export function DonutChart(props: DonutChartProps) {
  const width = props.width ?? 600;
  const height = props.height ?? 280;
  const total = props.data.reduce((acc, d) => acc + Math.max(0, d.value), 0);

  if (total === 0) return <EmptyChart title={props.title} width={width} height={height} />;

  const cx = 140;
  const cy = 156;
  const rOuter = 96;
  const rInner = 58;

  // Precompute slice paths with a running angle (kept out of the render closure
  // so eslint-plugin-react-hooks/immutability is happy).
  const visible = props.data.filter((d) => d.value > 0);
  const slices: { d: string; color: string }[] = [];
  {
    let angle = -Math.PI / 2;
    visible.forEach((d, i) => {
      const frac = d.value / total;
      const end = angle + frac * Math.PI * 2;
      const color = d.color ?? PALETTE.series[i % PALETTE.series.length];
      const large = end - angle > Math.PI ? 1 : 0;
      const x1 = cx + rOuter * Math.cos(angle);
      const y1 = cy + rOuter * Math.sin(angle);
      const x2 = cx + rOuter * Math.cos(end);
      const y2 = cy + rOuter * Math.sin(end);
      const x3 = cx + rInner * Math.cos(end);
      const y3 = cy + rInner * Math.sin(end);
      const x4 = cx + rInner * Math.cos(angle);
      const y4 = cy + rInner * Math.sin(angle);
      slices.push({
        d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`,
        color,
      });
      angle = end;
    });
  }

  return (
    <Svg width={DISPLAY_WIDTH} height={Math.round(DISPLAY_WIDTH * height / width)} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={PALETTE.paper} />
      <SvgText x={24} y={20} fontSize={14} fill={PALETTE.ink}>{props.title}</SvgText>
      {props.subtitle ? <SvgText x={24} y={34} fontSize={10} fill={PALETTE.muted}>{props.subtitle}</SvgText> : null}

      {slices.map((s, i) => <Path key={i} d={s.d} fill={s.color} />)}

      <SvgText x={cx} y={cy + 4} fontSize={22} fill={PALETTE.ink} textAnchor="middle">{props.centerValue ?? formatTickValue(total)}</SvgText>
      <SvgText x={cx} y={cy + 22} fontSize={9} fill={PALETTE.muted} textAnchor="middle">{(props.centerLabel ?? "TOTAL").toUpperCase()}</SvgText>

      {props.data.map((d, i) => {
        const color = d.color ?? PALETTE.series[i % PALETTE.series.length];
        const pct = total === 0 ? 0 : Math.round((d.value / total) * 100);
        const y = 64 + i * 22;
        return (
          <G key={i}>
            <Rect x={280} y={y - 9} width={12} height={12} rx={2} fill={color} />
            <SvgText x={300} y={y + 1} fontSize={12} fill={PALETTE.ink}>{truncate(d.label, 22)}</SvgText>
            <SvgText x={460} y={y + 1} fontSize={12} fill={PALETTE.muted} textAnchor="end">{`${formatTickValue(d.value)} · ${pct}%`}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Radial gauge grid (SEMrush) — monthly data reads better as dials than as a
// sparse trend line.
// =========================================================================

// 270° gauge geometry: 0° = top, clockwise. Track runs -135° → +135°.
const GAUGE_START = -135;
const GAUGE_SWEEP = 270;
function gaugePolar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}
function gaugeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [sx, sy] = gaugePolar(cx, cy, r, startDeg);
  const [ex, ey] = gaugePolar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

export interface GaugeDatum {
  label: string;
  valueText: string;
  scaleText: string;
  /** 0–1 fill fraction. */
  frac: number;
}
export interface GaugeGridProps {
  title: string;
  source?: string;
  gauges: GaugeDatum[];
  width?: number;
  height?: number;
}

export function GaugeGrid(props: GaugeGridProps) {
  const cols = 3;
  const rows = Math.max(1, Math.ceil(props.gauges.length / cols));
  const width = props.width ?? 1100;
  const height = props.height ?? 120 + rows * 220;

  const cardBg = "#0F1620";
  const cardBorder = "#1F2937";
  const trackColor = "#1F2937";
  const accent = "#22C55E";
  const textMain = "#F8FAFC";
  const textMuted = "#94A3B8";
  const textLabel = "#64748B";

  const padX = 40;
  const gridTop = 104;
  const cellW = (width - 2 * padX) / cols;
  const cellH = (height - gridTop - 24) / rows;
  const r = 66;
  const sw = 14;

  return (
    <Svg width={DISPLAY_WIDTH} height={Math.round((DISPLAY_WIDTH * height) / width)} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={16} ry={16} fill={cardBg} stroke={cardBorder} />
      <SvgText x={padX} y={46} fontSize={22} fill={textMain}>{props.title}</SvgText>
      {props.source ? <SvgText x={padX} y={66} fontSize={12} fill={textMuted}>{props.source}</SvgText> : null}

      {props.gauges.map((g, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = padX + cellW * col + cellW / 2;
        const top = gridTop + cellH * row;
        const cy = top + 92;
        const frac = Math.max(0, Math.min(1, g.frac));
        return (
          <G key={i}>
            <Path d={gaugeArc(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP)} fill="none" stroke={trackColor} strokeWidth={sw} strokeLinecap="round" />
            {frac > 0 ? (
              <Path d={gaugeArc(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP * frac)} fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
            ) : null}
            <SvgText x={cx} y={cy + 11} fontSize={30} fontWeight={700} fill={textMain} textAnchor="middle">{g.valueText}</SvgText>
            {g.scaleText ? <SvgText x={cx} y={cy + 30} fontSize={11} fill={textLabel} textAnchor="middle">{g.scaleText}</SvgText> : null}
            <SvgText x={cx} y={top + 196} fontSize={15} fill={textMuted} textAnchor="middle">{g.label}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Empty placeholder
// =========================================================================

function EmptyChart({ title, width, height }: { title: string; width: number; height: number }) {
  return (
    <Svg width={DISPLAY_WIDTH} height={Math.round(DISPLAY_WIDTH * height / width)} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={PALETTE.paper} />
      <SvgText x={24} y={20} fontSize={14} fill={PALETTE.ink}>{title}</SvgText>
      <SvgText x={width / 2} y={height / 2} fontSize={12} fill={PALETTE.muted} textAnchor="middle">No data in the selected range.</SvgText>
    </Svg>
  );
}
