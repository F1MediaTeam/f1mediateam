// One Core Web Vital, against Google's own thresholds.
//
// A number alone doesn't say whether 2.4 seconds is good. The meter shows where
// the value sits between the good and poor boundaries, so the verdict is
// readable without knowing the thresholds by heart.
//
// Status colour is never the only signal — every meter carries a written verdict
// beside it, which is what makes it legible to a colourblind reader and in print.

const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

const MEANING: Record<string, string> = {
  LCP: "Largest paint",
  INP: "Responsiveness",
  CLS: "Layout stability",
  FCP: "First paint",
  TTFB: "Server response",
};

const TONE = {
  good: { color: "var(--color-ok)", label: "Good" },
  "needs-improvement": { color: "var(--color-warn)", label: "Needs work" },
  poor: { color: "var(--color-bad)", label: "Poor" },
} as const;

export default function VitalMeter({
  metric,
  p75,
  verdict,
}: {
  metric: string;
  p75: number;
  verdict: "good" | "needs-improvement" | "poor";
}) {
  const [good, poor] = THRESHOLDS[metric] ?? [1, 2];
  const tone = TONE[verdict];
  // The scale runs to 1.5× the poor boundary so a bad value still lands on the
  // track instead of pinning at the end and losing its magnitude.
  const scaleMax = poor * 1.5;
  const pos = Math.min(100, (p75 / scaleMax) * 100);

  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{metric}</span>
        <span className="text-[9px] uppercase tracking-wider" style={{ color: tone.color }}>
          {tone.label}
        </span>
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">
        {metric === "CLS" ? p75.toFixed(3) : p75 >= 1000 ? `${(p75 / 1000).toFixed(2)}s` : `${Math.round(p75)}ms`}
      </div>

      {/* Track: green up to the good boundary, amber to the poor one, red beyond. */}
      <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div style={{ width: `${(good / scaleMax) * 100}%`, background: "var(--color-ok)", opacity: 0.28 }} />
          <div style={{ width: `${((poor - good) / scaleMax) * 100}%`, background: "var(--color-warn)", opacity: 0.28 }} />
          <div className="flex-1" style={{ background: "var(--color-bad)", opacity: 0.28 }} />
        </div>
        <div
          className="absolute top-[-2px] h-[10px] w-[3px] rounded-full"
          style={{ left: `calc(${pos}% - 1.5px)`, background: tone.color }}
        />
      </div>
      <div className="mt-1 text-[9px] text-[var(--color-text-subtle)]">{MEANING[metric] ?? metric}</div>
    </div>
  );
}
