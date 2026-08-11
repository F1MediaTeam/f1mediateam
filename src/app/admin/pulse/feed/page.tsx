// The cross-client activity feed.
//
// Everything the collectors noticed, newest first, filterable by client and by
// kind. This is the page you leave open — it answers "what changed?" without
// opening five client pages.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { clientColor } from "@/lib/client-color";
import { filterClients } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { listSites } from "@/lib/pulse/sites";
import { feedEvents } from "@/lib/pulse/dashboard";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import PulseFeedLive from "@/components/admin/pulse/PulseFeedLive";

export const dynamic = "force-dynamic";

const KINDS = [
  "rank_up", "rank_down", "backlink_new", "backlink_lost", "crawl_issues",
  "bot_block_change", "site_down", "site_recovered", "tag_missing", "tag_detected",
] as const;

export default async function PulseFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; kind?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;

  const allowed = await visibleClientIds(session);
  const clients = filterClients(await data.listClients(), allowed);
  const sites = await listSites(allowed);

  const scoped = sp.client ? sites.filter((s) => s.client_id === sp.client) : sites;
  const events = await feedEvents(scoped.map((s) => s.id), 200);
  const filtered = sp.kind ? events.filter((e) => e.kind === sp.kind) : events;

  const siteMeta = new Map(
    sites.map((s) => {
      const client = clients.find((c) => c.id === s.client_id);
      return [s.id, { domain: s.domain, name: client?.company_name ?? s.domain, colour: client ? clientColor(client).hex : "#8b95a5" }];
    }),
  );

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition " +
        (active
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
      }
    >
      {label}
    </Link>
  );

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          crumb={
            <Link href="/admin/pulse" className="mb-1 block text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              ← All sites
            </Link>
          }
          subtitle="Everything the collectors noticed, newest first."
        />

        <div className="mb-3 flex flex-wrap gap-1.5">
          {chip("All clients", "/admin/pulse/feed", !sp.client)}
          {clients.map((c) =>
            chip(c.company_name, `/admin/pulse/feed?client=${c.id}${sp.kind ? `&kind=${sp.kind}` : ""}`, sp.client === c.id),
          )}
        </div>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {chip("Everything", `/admin/pulse/feed${sp.client ? `?client=${sp.client}` : ""}`, !sp.kind)}
          {KINDS.map((k) =>
            chip(
              k.replace(/_/g, " "),
              `/admin/pulse/feed?${sp.client ? `client=${sp.client}&` : ""}kind=${k}`,
              sp.kind === k,
            ),
          )}
        </div>

        <PulseFeedLive
          siteIds={scoped.map((s) => s.id)}
          initial={filtered.map((e) => ({
            id: String(e.id),
            siteId: String(e.site_id),
            ts: String(e.ts),
            kind: String(e.kind),
            severity: String(e.severity),
            title: String(e.title),
          }))}
          sites={Object.fromEntries(siteMeta)}
          kindFilter={sp.kind ?? null}
        />
      </div>
    </AdminShell>
  );
}
