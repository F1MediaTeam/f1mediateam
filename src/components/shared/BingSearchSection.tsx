// Combined Bing Webmaster Tools section — overlays Bing clicks, impressions,
// and average click position on one toggleable multi-line chart (same view as
// the GSC search-performance section). Renders nothing if the client has no
// Bing data. Shared by the client overview and the admin client detail page.

import { data } from "@/lib/data";
import { Pill } from "@/components/ui";
import MultiSeriesDashboard, { type DashSeries } from "@/components/shared/MultiSeriesDashboard";
import { formatNumber } from "@/lib/utils";

const intFmt = (v: number) =>
  formatNumber(v, { maximumFractionDigits: 0, notation: v >= 10_000 ? "compact" : "standard" });

export default async function BingSearchSection({ clientId }: { clientId: string }) {
  const [clicks, impressions, position] = await Promise.all([
    data.listSnapshots({ clientId, metric: "bing_clicks" }),
    data.listSnapshots({ clientId, metric: "bing_impressions" }),
    data.listSnapshots({ clientId, metric: "bing_avg_click_position" }),
  ]);

  if (!clicks.length && !impressions.length && !position.length) return null;

  const latest = [clicks, impressions, position]
    .flat()
    .map((s) => s.captured_at)
    .sort()
    .pop();

  const toPts = (s: typeof clicks) => s.map((r) => ({ captured_at: r.captured_at, value: r.value }));

  const series: DashSeries[] = [
    {
      id: "bing_clicks", label: "Bing clicks", color: "#3B82F6",
      tile: "bg-blue-500/20 border-blue-400/40", ring: "ring-blue-400/60",
      data: toPts(clicks), aggregate: "sum", fmt: intFmt,
    },
    {
      id: "bing_impressions", label: "Bing impressions", color: "#8B5CF6",
      tile: "bg-purple-500/20 border-purple-400/40", ring: "ring-purple-400/60",
      data: toPts(impressions), aggregate: "sum", fmt: intFmt,
    },
    {
      id: "bing_position", label: "Avg. click position", color: "#F59E0B",
      tile: "bg-amber-500/20 border-amber-400/40", ring: "ring-amber-400/60",
      data: toPts(position), aggregate: "average", fmt: (v) => v.toFixed(1),
    },
  ];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Bing search performance</h2>
        <Pill>Bing Webmaster Tools</Pill>
      </div>
      <MultiSeriesDashboard series={series} lastUpdated={latest ?? undefined} />
    </section>
  );
}
