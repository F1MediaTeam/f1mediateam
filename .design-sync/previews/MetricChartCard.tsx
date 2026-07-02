import { MetricChartCard } from "f1-media";

// Deterministic 90-day SEO snapshot series (oldest → newest).
function snapshots(
  days: number,
  start: number,
  end: number,
  noise: number,
  weekendDip = 0,
): { captured_at: string; value: number }[] {
  const last = Date.UTC(2026, 6, 1); // Jul 1 2026
  const pts: { captured_at: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const t = days > 1 ? i / (days - 1) : 1;
    const trend = start + (end - start) * t;
    const wobble = Math.sin(i * 0.9) * 0.55 + Math.sin(i * 2.3) * 0.45;
    const day = new Date(last - (days - 1 - i) * 86400000);
    const dow = day.getUTCDay();
    const dip = weekendDip && (dow === 0 || dow === 6) ? -weekendDip : 0;
    const value = Math.max(0, trend + wobble * noise + dip);
    pts.push({ captured_at: day.toISOString().slice(0, 10), value: Math.round(value * 10) / 10 });
  }
  return pts;
}

export function OrganicClicks() {
  return (
    <MetricChartCard
      label="Clicks"
      hint="Google Search Console — organic clicks per day"
      aggregation="sum"
      series={snapshots(90, 26, 74, 7, 9)}
    />
  );
}

export function AverageCtr() {
  return (
    <MetricChartCard
      label="Average CTR"
      hint="Clicks ÷ impressions across all queries"
      aggregation="average"
      unit="%"
      series={snapshots(90, 2.1, 3.6, 0.25)}
    />
  );
}
