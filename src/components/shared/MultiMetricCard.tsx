// Server-side fan-out. Fetches every metric series in parallel, drops empty
// ones, hands the rest to MultiMetricChartCard. If no metric has data, the
// whole card is hidden so empty source sections don't clutter the page.

import { data } from "@/lib/data";
import MultiMetricChartCard from "./MultiMetricChartCard";

interface MetricConfig {
  metric: string;
  label: string;
  color: string;
  unit?: string;
  aggregation?: "sum" | "average";
  invert?: boolean;
}

interface Props {
  clientId: string;
  title: string;
  hint?: string;
  metrics: MetricConfig[];
}

export default async function MultiMetricCard({ clientId, title, hint, metrics }: Props) {
  const series = await Promise.all(
    metrics.map(async (m) => ({
      meta: m,
      series: await data.listSnapshots({ clientId, metric: m.metric }),
    })),
  );

  const populated = series.filter((s) => s.series.length > 0);
  if (populated.length === 0) return null;

  return (
    <MultiMetricChartCard
      title={title}
      hint={hint}
      metrics={populated.map((s) => ({
        metric: s.meta.metric,
        label: s.meta.label,
        color: s.meta.color,
        unit: s.meta.unit,
        aggregation: s.meta.aggregation,
        invert: s.meta.invert,
        series: s.series.map((p) => ({ captured_at: p.captured_at, value: p.value })),
      }))}
    />
  );
}
