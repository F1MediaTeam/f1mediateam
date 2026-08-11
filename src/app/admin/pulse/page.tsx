// F1 Pulse — the sites list and install flow.
//
// Phase 2 scope: getting a tag onto a site and proving it works. The live
// dashboard, per-client tabs and feed arrive in Phase 4; this page is the front
// door and the place a new site is registered.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import Time from "@/components/shared/Time";
import { clientColor } from "@/lib/client-color";
import { filterClients } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { listSites, snippetFor } from "@/lib/pulse/sites";
import { pulseOrigin } from "./actions";
import PulseAddSite from "@/components/admin/PulseAddSite";
import PulseInstallCard from "@/components/admin/PulseInstallCard";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Awaiting first visit", tone: "var(--color-warn)" },
  live: { label: "Live", tone: "var(--color-ok)" },
  tag_missing: { label: "Tag missing", tone: "var(--color-warn)" },
  down: { label: "Site down", tone: "var(--color-bad)" },
};

export default async function PulsePage() {
  const session = await requireAdmin();
  const allowed = await visibleClientIds(session);
  const [allClients, origin] = await Promise.all([data.listClients(), pulseOrigin()]);
  const clients = filterClients(allClients, allowed);
  const sites = await listSites(allowed);

  const clientOf = (id: string) => clients.find((c) => c.id === id);

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              F1 Media Team
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">F1 Pulse</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
              First-party, cookieless analytics. One line in a client&apos;s footer turns on live
              visitor data, conversion tracking, and the server-side collectors.
            </p>
          </div>
          <PulseAddSite
            clients={clients.map((c) => ({
              id: c.id,
              company_name: c.company_name,
              ui_color: c.ui_color ?? null,
              websites: c.websites,
            }))}
          />
        </div>

        {sites.length === 0 ? (
          <Card>
            <CardBody>
              <div className="py-10 text-center">
                <div className="text-sm font-medium">No sites yet</div>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--color-text-muted)]">
                  Add a client site to generate its key and install snippet. Nothing is measured
                  until the snippet is on the site and someone visits it.
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => {
              const client = clientOf(site.client_id);
              const colour = client ? clientColor(client) : null;
              const status = STATUS[site.status] ?? STATUS.pending;
              return (
                <Card
                  key={site.id}
                  className="overflow-hidden"
                  // Panels inside inherit the client's colour, as everywhere else.
                  {...(colour
                    ? { style: { "--panel-outline": colour.hex } as React.CSSProperties }
                    : {})}
                >
                  <CardHeader
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {colour ? (
                          <span
                            aria-hidden
                            className="inline-block h-3.5 w-3.5 rounded"
                            style={{ background: colour.hex }}
                          />
                        ) : null}
                        <span>{client?.company_name ?? "Unknown client"}</span>
                        <span className="font-mono text-xs text-[var(--color-text-muted)]">
                          {site.domain}
                        </span>
                      </span>
                    }
                    subtitle={
                      site.last_beacon_at ? (
                        <>
                          Last beacon <Time iso={site.last_beacon_at} />
                        </>
                      ) : (
                        "No visits recorded yet"
                      )
                    }
                    right={
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: `color-mix(in srgb, ${status.tone} 15%, transparent)`, color: status.tone }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.tone }} />
                        {status.label}
                      </span>
                    }
                  />
                  <CardBody>
                    <PulseInstallCard
                      siteId={site.id}
                      domain={site.domain}
                      snippet={snippetFor(site.site_key, origin)}
                      status={site.status}
                    />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
