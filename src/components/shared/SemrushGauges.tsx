// Server wrapper: loads every SEMrush metric's full series and hands them to
// the client-rendered MetricGaugeGroup, which owns the time-frame selector.

import MetricGaugeGroup, { type GaugeMetric } from "./MetricGaugeGroup";
import { data } from "@/lib/data";

const SEMRUSH_METRICS: GaugeMetric[] = [
  { metric: "semrush_organic_keywords", label: "Organic keywords" },
  { metric: "semrush_organic_traffic",  label: "Est. organic traffic" },
  { metric: "semrush_organic_cost",     label: "Est. organic value", money: true },
  { metric: "semrush_paid_keywords",    label: "Paid keywords" },
  { metric: "semrush_paid_traffic",     label: "Est. paid traffic" },
  { metric: "semrush_paid_cost",        label: "Est. paid spend", money: true },
];

export default async function SemrushGauges({
  clientId,
  // Admin sees the real source; the client portal white-labels these.
  title = "SEMrush",
  hint = "From SEMrush · monthly — pick a time frame to scope the dials",
}: {
  clientId: string;
  title?: string;
  hint?: string;
}) {
  const seriesList = await Promise.all(
    SEMRUSH_METRICS.map((m) => data.listSnapshots({ clientId, metric: m.metric })),
  );
  const seriesByMetric: Record<string, { captured_at: string; value: number }[]> = {};
  SEMRUSH_METRICS.forEach((m, i) => {
    seriesByMetric[m.metric] = seriesList[i].map((s) => ({ captured_at: s.captured_at, value: s.value }));
  });

  // If SEMrush has no data at all, render nothing (no connector / not synced).
  if (Object.values(seriesByMetric).every((s) => s.length === 0)) return null;

  return (
    <MetricGaugeGroup
      title={title}
      hint={hint}
      metrics={SEMRUSH_METRICS}
      seriesByMetric={seriesByMetric}
    />
  );
}
