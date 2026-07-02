import { TrendChart } from "f1-media";

// Deterministic SEO time series: linear trend + layered sine wobble + weekend dip.
function seoSeries(
  days: number,
  start: number,
  end: number,
  noise: number,
  weekendDip = 0,
): { date: string; value: number }[] {
  const last = Date.UTC(2026, 6, 1); // Jul 1 2026
  const pts: { date: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const t = days > 1 ? i / (days - 1) : 1;
    const trend = start + (end - start) * t;
    const wobble = Math.sin(i * 0.9) * 0.55 + Math.sin(i * 2.3) * 0.45;
    const day = new Date(last - (days - 1 - i) * 86400000);
    const dow = day.getUTCDay();
    const dip = weekendDip && (dow === 0 || dow === 6) ? -weekendDip : 0;
    const value = Math.max(0, trend + wobble * noise + dip);
    pts.push({ date: day.toISOString().slice(0, 10), value: Math.round(value * 10) / 10 });
  }
  return pts;
}

export function ClicksLast30Days() {
  const points = seoSeries(30, 34, 68, 6, 9);
  return (
    <div style={{ maxWidth: 640 }}>
      <TrendChart points={points} baseline={points[0].value} />
    </div>
  );
}

export function AvgPositionImproving() {
  const points = seoSeries(60, 24.6, 8.2, 1.4);
  return (
    <div style={{ maxWidth: 640 }}>
      <TrendChart
        points={points}
        baseline={20}
        invert
        formatter={(v) => v.toFixed(1)}
      />
    </div>
  );
}
