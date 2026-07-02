import { MultiLineChart } from "f1-media";

// Deterministic SEO daily series: linear trend + sine wobble + weekend dip.
// `phase` decorrelates the wobble between series so shapes don't overlap.
function seoSeries(
  days: number,
  start: number,
  end: number,
  noise: number,
  weekendDip = 0,
  phase = 0,
): { date: string; value: number }[] {
  const last = Date.UTC(2026, 6, 1); // Jul 1 2026
  const pts: { date: string; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    const t = days > 1 ? i / (days - 1) : 1;
    const trend = start + (end - start) * t;
    const wobble =
      Math.sin(i * 0.9 + phase) * 0.55 + Math.sin(i * 2.3 + phase * 1.7) * 0.45;
    const day = new Date(last - (days - 1 - i) * 86400000);
    const dow = day.getUTCDay();
    const dip = weekendDip && (dow === 0 || dow === 6) ? -weekendDip : 0;
    const value = Math.max(0, trend + wobble * noise + dip);
    pts.push({ date: day.toISOString().slice(0, 10), value: Math.round(value * 10) / 10 });
  }
  return pts;
}

export function SearchTrendsLast30Days() {
  const series = [
    { key: "clicks", color: "#3f8e84", visible: true, points: seoSeries(30, 34, 68, 6, 8) },
    { key: "impressions", color: "#8ab4f8", visible: true, points: seoSeries(30, 1100, 2700, 180, 260, 2.4) },
    { key: "avg_position", color: "#b48ce0", visible: true, points: seoSeries(30, 21.5, 9.4, 1.1, 0, 4.8) },
  ];
  return (
    <div style={{ maxWidth: 640 }}>
      <MultiLineChart series={series} width={800} height={300} />
    </div>
  );
}
