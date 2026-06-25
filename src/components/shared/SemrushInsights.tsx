// Visualizes the Semrush "deep pull" data as charts. Client component so it can
// compose TrendChart (which needs a `formatter` function prop — functions can't
// cross the server→client boundary). Each panel hides itself when its data is
// absent, so a partial pull still renders cleanly. The `data` prop is compact
// (precomputed server-side by buildSemrushChartData), so serialization is cheap.

"use client";

import TrendChart from "@/components/shared/TrendChart";
import WidgetBoard, { type WidgetSlot } from "@/components/shared/WidgetBoard";
import type { SemrushChartData, ChartSeries } from "@/lib/semrush-charts";

// Compact sparkline for the AuthorityScoreCard. Pure inline SVG, no axes,
// no interaction — meant to give a quick visual trend under the stat tiles.
function Sparkline({ points, color = "var(--color-accent)", height = 56 }: { points: { date: string; value: number }[]; color?: string; height?: number }) {
  if (!points.length) return null;
  const W = 600;
  const padY = 4;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const xs = points.map((_, i) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W));
  const ys = points.map((p) => padY + (1 - (p.value - lo) / span) * (height - padY * 2));
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < points.length; i++) d += ` L ${xs[i]} ${ys[i]}`;
  const areaD = `${d} L ${xs[xs.length - 1]} ${height} L ${xs[0]} ${height} Z`;
  const gradId = `spark-grad-${Math.round(W + height)}`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={color} />
    </svg>
  );
}

function AuthorityScoreCard({ points }: { points: { date: string; value: number }[] }) {
  if (points.length === 0) {
    return <div className="text-xs text-[var(--color-text-muted)]">No data.</div>;
  }
  const current = points[points.length - 1].value;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  // Circular progress ring — like SEMrush's own UI. The score (0-100) fills
  // a circle of arc; the number sits centered inside.
  const pct = Math.max(0, Math.min(1, current / 100));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="h-full grid place-items-center">
      <svg viewBox="0 0 100 100" className="w-44 h-44 sm:w-52 sm:h-52">
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--color-bg)" strokeWidth={10} />
        <circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={10}
          strokeDasharray={`${pct * c} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text
          x={50}
          y={49}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={22}
          fontWeight={600}
          fill="var(--color-text)"
        >
          {fmt(current)}
        </text>
        <text
          x={50}
          y={66}
          textAnchor="middle"
          fontSize={5}
          letterSpacing="0.5"
          fill="var(--color-text-muted)"
        >
          OUT OF 100
        </text>
      </svg>
    </div>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  // h-full + flex-col so every panel fills its grid cell to the same height,
  // and the body region absorbs any extra space below the header.
  return (
    <div className="h-full flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="mb-3">
        <div className="text-sm font-medium">{title}</div>
        {subtitle ? <div className="text-[11px] text-[var(--color-text-muted)]">{subtitle}</div> : null}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function HBars({ series, accent = "var(--color-accent)" }: { series: ChartSeries[]; accent?: string }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <div className="space-y-1.5">
      {series.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-28 shrink-0 truncate text-[var(--color-text-muted)]" title={s.label}>
            {s.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--color-bg)]">
            <div className="h-full rounded" style={{ width: `${(s.value / max) * 100}%`, backgroundColor: accent }} />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-[var(--color-text-muted)]">{fmt(s.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ follow, nofollow }: { follow: number; nofollow: number }) {
  const total = follow + nofollow;
  const pct = total ? follow / total : 0;
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    // Center in both axes and fill the parent panel body so the donut sits
    // visually balanced inside the card.
    <div className="h-full w-full flex items-center justify-center gap-6 sm:gap-8">
      <svg viewBox="0 0 100 100" className="h-40 w-40 sm:h-44 sm:w-44 shrink-0">
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--color-bg)" strokeWidth={14} />
        <circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={14}
          strokeDasharray={`${pct * c} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x={50} y={48} textAnchor="middle" fontSize={18} fontWeight={600} fill="var(--color-text)">
          {Math.round(pct * 100)}%
        </text>
        <text x={50} y={62} textAnchor="middle" fontSize={8} fill="var(--color-text-muted)">
          follow
        </text>
      </svg>
      <div className="space-y-2 text-xs min-w-[8rem]">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-[var(--color-accent)]" />
          <span className="text-[var(--color-text-muted)]">Follow</span>
          <span className="ml-auto font-mono">{fmt(follow)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-[var(--color-bg)] border border-[var(--color-border-strong)]" />
          <span className="text-[var(--color-text-muted)]">Nofollow</span>
          <span className="ml-auto font-mono">{fmt(nofollow)}</span>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] pt-2">
          <span className="text-[var(--color-text-muted)]">Total</span>
          <span className="ml-auto font-mono">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

export default function SemrushInsights({ data }: { data: SemrushChartData }) {
  if (!data.hasAny) {
    return (
      <div className="text-xs text-[var(--color-text-muted)]">
        No Semrush data to chart yet. Run a deep pull to populate these graphs.
      </div>
    );
  }

  // Each panel becomes a widget slot. The WidgetBoard wrapper gives every
  // tile a hover-revealed drag handle + × button and persists the order /
  // hidden set to localStorage. We only include panels that have data — the
  // user can still hide ones they don't care about and bring them back via
  // the + Add widget pills.
  const widgets: WidgetSlot[] = [];
  if (data.authority) {
    widgets.push({
      id: "authority",
      label: "Authority Score",
      node: (
        <Panel title="Authority Score" subtitle="Current score">
          <AuthorityScoreCard points={data.authority} />
        </Panel>
      ),
    });
  }
  if (data.positions) {
    widgets.push({
      id: "positions",
      label: "Keyword positions",
      node: (
        <Panel title="Keyword positions" subtitle="Organic keywords by ranking bucket">
          <HBars series={data.positions} />
        </Panel>
      ),
    });
  }
  if (data.topKeywords) {
    widgets.push({
      id: "top-keywords",
      label: "Top keywords",
      node: (
        <Panel title="Top keywords" subtitle="By share of organic traffic">
          <HBars series={data.topKeywords} />
        </Panel>
      ),
    });
  }
  if (data.backlinkProfile) {
    widgets.push({
      id: "backlink-profile",
      label: "Backlink profile",
      node: (
        <Panel title="Backlink profile" subtitle="Follow vs nofollow">
          <Donut follow={data.backlinkProfile.follow} nofollow={data.backlinkProfile.nofollow} />
        </Panel>
      ),
    });
  }
  if (data.refDomains) {
    widgets.push({
      id: "ref-domains",
      label: "Top referring domains",
      node: (
        <Panel title="Top referring domains" subtitle="By number of backlinks">
          <HBars series={data.refDomains} accent="var(--color-up)" />
        </Panel>
      ),
    });
  }
  if (data.competitors) {
    widgets.push({
      id: "competitors",
      label: "Organic competitors",
      node: (
        <Panel title="Organic competitors" subtitle="By shared keywords">
          <HBars series={data.competitors} accent="var(--color-up)" />
        </Panel>
      ),
    });
  }

  return (
    <WidgetBoard
      storageKey="f1.semrush-insights.layout.v1"
      widgets={widgets}
      gridClassName="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:auto-rows-fr"
    />
  );
}
