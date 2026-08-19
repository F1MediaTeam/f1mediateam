// Keyword Lab — research keywords, then track the ones worth chasing.
//
// Sites come from pulse_sites and keywords go to pulse_keywords, so this is a
// different view onto the data the Rankings tab already shows rather than a
// second system that drifts from it.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import KeywordLab from "@/components/admin/pulse/KeywordLab";
import { clientColor } from "@/lib/client-color";
import { filterClients } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { listSites } from "@/lib/pulse/sites";
import { createServiceClient } from "@/lib/supabase/server";
import { spendSummary, ESTIMATED_COST } from "@/lib/pulse/keyword-lab";

export const dynamic = "force-dynamic";

export default async function KeywordLabPage() {
  const session = await requireAdmin();
  const allowed = await visibleClientIds(session);
  const [allClients, sites, spend] = await Promise.all([
    data.listClients(),
    listSites(allowed),
    spendSummary(),
  ]);
  const clients = filterClients(allClients, allowed);

  // Everything already tracked, with its latest two checks so the table can
  // show a position and whether it moved.
  const supabase = await createServiceClient();
  const { data: kwRows } = await supabase
    .from("pulse_keywords")
    .select("id, site_id, phrase, volume, intent, kd, cpc, target_url, metrics_source, is_active")
    .in("site_id", sites.length ? sites.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("volume", { ascending: false, nullsFirst: false })
    .limit(2000);

  const keywords =
    (kwRows as Array<{
      id: string;
      site_id: string;
      phrase: string;
      volume: number | null;
      intent: string | null;
      kd: number | null;
      cpc: number | null;
      target_url: string | null;
      metrics_source: string;
      is_active: boolean;
    }>) ?? [];

  const { data: checkRows } = keywords.length
    ? await supabase
        .from("pulse_rank_checks")
        .select("keyword_id, checked_at, position, ranking_url, match_type, top_results, source")
        .in(
          "keyword_id",
          keywords.map((k) => k.id),
        )
        .order("checked_at", { ascending: false })
        .limit(4000)
    : { data: [] };

  const checks =
    (checkRows as Array<{
      keyword_id: string;
      checked_at: string;
      position: number | null;
      ranking_url: string | null;
      match_type: string | null;
      top_results: Array<{ pos: number; title: string; url: string }>;
      source: string;
    }>) ?? [];

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          subtitle="Research a keyword, then track the ones worth chasing."
          crumb={
            <div className="mb-1">
              <Link
                href="/admin/pulse"
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ← All sites
              </Link>
            </div>
          }
        />

        <KeywordLab
          sites={sites.map((s) => {
            const client = clients.find((c) => c.id === s.client_id);
            return {
              id: s.id,
              domain: s.domain,
              clientName: client?.company_name ?? s.domain,
              colour: client ? clientColor(client).hex : null,
            };
          })}
          keywords={keywords}
          checks={checks}
          spend={spend}
          costs={ESTIMATED_COST}
        />
      </div>
    </AdminShell>
  );
}
