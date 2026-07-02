import { MetricGaugeGroup } from "f1-media";

// Deterministic monthly-cadence SEMrush-style snapshots (oldest → newest).
function snapshots(
  count: number,
  start: number,
  end: number,
  noise: number,
): { captured_at: string; value: number }[] {
  const pts: { captured_at: string; value: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 1;
    const trend = start + (end - start) * t;
    const wobble = Math.sin(i * 1.3) * 0.6 + Math.sin(i * 2.9) * 0.4;
    // First of each month, ending Jun 2026.
    const d = new Date(Date.UTC(2026, 5 - (count - 1 - i), 1));
    pts.push({
      captured_at: d.toISOString().slice(0, 10),
      value: Math.max(0, Math.round(trend + wobble * noise)),
    });
  }
  return pts;
}

export function SemrushOverview() {
  return (
    <MetricGaugeGroup
      title="Domain overview"
      hint="SEMrush — refreshed monthly"
      metrics={[
        { metric: "authority_score", label: "Authority score" },
        { metric: "organic_keywords", label: "Organic keywords" },
        { metric: "organic_traffic", label: "Organic traffic" },
        { metric: "traffic_cost", label: "Traffic cost", money: true },
        { metric: "backlinks", label: "Backlinks" },
        { metric: "ref_domains", label: "Referring domains" },
      ]}
      seriesByMetric={{
        authority_score: snapshots(8, 24, 37, 1),
        organic_keywords: snapshots(8, 310, 585, 14),
        organic_traffic: snapshots(8, 820, 2140, 90),
        traffic_cost: snapshots(8, 1400, 3900, 160),
        backlinks: snapshots(8, 5200, 8900, 220),
        ref_domains: snapshots(8, 142, 231, 6),
      }}
    />
  );
}
