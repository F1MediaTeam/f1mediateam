// Server-side data fetcher. Loads the full 90-day series for a single metric
// and hands it to the client-rendered MetricChartCard, which owns the range
// selector + chart interactivity.

import MetricChartCard from "./MetricChartCard";
import { data } from "@/lib/data";

interface Props {
  clientId: string;
  metric: string;
  label: string;
  hint?: string;
  /** for metrics where lower is better (e.g. avg_position) */
  invert?: boolean;
  /** Defaults are inferred per metric. Pass to override. */
  aggregation?: "sum" | "average";
  unit?: string;
}

// Per-metric defaults: counts are summed, ratios are averaged.
function defaultAggregation(metric: string): "sum" | "average" {
  return ["avg_position", "ctr", "visibility"].includes(metric) ? "average" : "sum";
}
function defaultUnit(metric: string): string {
  if (metric === "ctr") return "%";
  return "";
}

export default async function MetricCompare({
  clientId,
  metric,
  label,
  hint,
  invert = false,
  aggregation,
  unit,
}: Props) {
  const series = await data.listSnapshots({ clientId, metric });
  if (!series.length) return null;

  return (
    <MetricChartCard
      label={label}
      hint={hint}
      invert={invert}
      aggregation={aggregation ?? defaultAggregation(metric)}
      unit={unit ?? defaultUnit(metric)}
      series={series.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
    />
  );
}
