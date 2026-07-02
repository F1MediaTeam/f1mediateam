import { MultiMetricChartCard } from "f1-media";

// Deterministic 90-day SEO snapshot series (oldest → newest).
// `phase` decorrelates wobble between series; `decimals` keeps counts integral.
function snapshots(
  days: number,
  start: number,
  end: number,
  noise: number,
  weekendDip = 0,
  phase = 0,
  decimals = 0,
): { captured_at: string; value: number }[] {
  const last = Date.UTC(2026, 6, 1); // Jul 1 2026
  const scale = Math.pow(10, decimals);
  const pts: { captured_at: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const t = days > 1 ? i / (days - 1) : 1;
    const trend = start + (end - start) * t;
    const wobble =
      Math.sin(i * 0.9 + phase) * 0.55 + Math.sin(i * 2.3 + phase * 1.7) * 0.45;
    const day = new Date(last - (days - 1 - i) * 86400000);
    const dow = day.getUTCDay();
    const dip = weekendDip && (dow === 0 || dow === 6) ? -weekendDip : 0;
    const value = Math.max(0, trend + wobble * noise + dip);
    pts.push({ captured_at: day.toISOString().slice(0, 10), value: Math.round(value * scale) / scale });
  }
  return pts;
}

export function SearchPerformance() {
  return (
    <MultiMetricChartCard
      title="Search performance"
      hint="Google Search Console — all queries, all pages"
      metrics={[
        {
          metric: "clicks",
          label: "Clicks",
          color: "#3f8e84",
          aggregation: "sum",
          series: snapshots(90, 26, 74, 7, 9),
        },
        {
          metric: "impressions",
          label: "Impressions",
          color: "#8ab4f8",
          aggregation: "sum",
          series: snapshots(90, 950, 2850, 190, 280, 2.4),
        },
        {
          metric: "ctr",
          label: "Avg CTR",
          color: "#e0b45c",
          unit: "%",
          aggregation: "average",
          series: snapshots(90, 2.1, 3.6, 0.25, 0, 3.6, 2),
        },
        {
          metric: "avg_position",
          label: "Avg position",
          color: "#b48ce0",
          aggregation: "average",
          invert: true,
          series: snapshots(90, 24.8, 8.3, 1.3, 0, 4.8, 1),
        },
      ]}
    />
  );
}
