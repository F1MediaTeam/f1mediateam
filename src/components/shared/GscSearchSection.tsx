// Combined Google Search Console "Search performance" section — loads the
// clicks / impressions / avg-position / CTR series and hands them to the
// interactive GscDashboard (one multi-line chart with toggleable colored
// series). Shared by the client overview and the admin client detail page.

import { data } from "@/lib/data";
import { Pill } from "@/components/ui";
import GscDashboard from "@/components/shared/GscDashboard";

export default async function GscSearchSection({ clientId }: { clientId: string }) {
  const [clicks, impressions, position, ctr] = await Promise.all([
    data.listSnapshots({ clientId, metric: "clicks" }),
    data.listSnapshots({ clientId, metric: "impressions" }),
    data.listSnapshots({ clientId, metric: "avg_position" }),
    data.listSnapshots({ clientId, metric: "ctr" }),
  ]);

  // Nothing to show until at least one GSC series exists.
  if (!clicks.length && !impressions.length && !position.length) return null;

  const latest = [clicks, impressions, position]
    .flat()
    .map((s) => s.captured_at)
    .sort()
    .pop();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Search performance</h2>
        <Pill>Google Search Console</Pill>
      </div>
      <GscDashboard
        clientId={clientId}
        clicks={clicks.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
        impressions={impressions.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
        position={position.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
        ctr={ctr.map((s) => ({ captured_at: s.captured_at, value: s.value }))}
        lastUpdated={latest ?? undefined}
      />
    </section>
  );
}
