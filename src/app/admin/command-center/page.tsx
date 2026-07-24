// Command Center — the "who needs me today" screen.
//
// Three sections, all built from data that already exists elsewhere:
//   1. Needs attention — one row per client: pending approvals, unread
//      messages, connector health, tier, last report.
//   2. Connector health — a clients × sources grid flagging stale/failed feeds
//      before a client notices frozen charts.
//   3. Recent reports — the last generated decks across all clients.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import Time from "@/components/shared/Time";
import { TIER_LABELS } from "@/lib/types";
import type { ConnectorToken } from "@/lib/types";

// A feed is "stale" once it hasn't synced in this many days — enough that a
// client would start noticing their charts sitting still.
const STALE_DAYS = 3;
const PROVIDERS: { key: string; label: string }[] = [
  { key: "gsc", label: "Search Console" },
  { key: "ga4", label: "Analytics" },
  { key: "bing", label: "Bing" },
  { key: "semrush", label: "Semrush" },
];

type Health = "ok" | "stale" | "failed" | "missing";

function connectorHealth(c: ConnectorToken | undefined): Health {
  if (!c) return "missing";
  if (c.last_sync_status && /error|fail/i.test(c.last_sync_status)) return "failed";
  if (!c.last_synced_at) return "stale";
  const ageDays = (Date.now() - new Date(c.last_synced_at).getTime()) / 86_400_000;
  return ageDays > STALE_DAYS ? "stale" : "ok";
}

const HEALTH_STYLE: Record<Health, { dot: string; label: string; text: string }> = {
  ok:      { dot: "bg-[var(--color-accent)]",  label: "OK",      text: "text-[var(--color-accent)]" },
  stale:   { dot: "bg-amber-400",              label: "Stale",   text: "text-amber-400" },
  failed:  { dot: "bg-red-500",                label: "Failed",  text: "text-red-400" },
  missing: { dot: "bg-[var(--color-border-strong)]", label: "—",  text: "text-[var(--color-text-subtle)]" },
};

export default async function CommandCenter() {
  const session = await requireAdmin();

  const [clients, allContent, unread, connectors, reports] = await Promise.all([
    data.listClients(),
    data.listContent(),
    data.listUnreadCountsByClient(),
    data.listAllConnectors(),
    data.listRecentReports(15),
  ]);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company_name ?? "—";

  // Pending approvals per client (proposed content still awaiting the client).
  const pendingByClient = new Map<string, number>();
  for (const card of allContent) {
    if (card.stage === "proposed") pendingByClient.set(card.client_id, (pendingByClient.get(card.client_id) ?? 0) + 1);
  }

  // Connectors keyed by client → provider.
  const connByClient = new Map<string, Map<string, ConnectorToken>>();
  for (const c of connectors) {
    const m = connByClient.get(c.client_id) ?? new Map();
    m.set(c.provider, c);
    connByClient.set(c.client_id, m);
  }

  // Last report date per client.
  const lastReportByClient = new Map<string, string>();
  for (const r of reports) {
    if (!lastReportByClient.has(r.client_id)) lastReportByClient.set(r.client_id, r.created_at);
  }

  // Health summary per client: worst status wins for the row badge.
  function rowHealth(clientId: string): Health {
    const m = connByClient.get(clientId);
    const statuses = PROVIDERS.map((p) => connectorHealth(m?.get(p.key)));
    if (statuses.includes("failed")) return "failed";
    if (statuses.includes("stale")) return "stale";
    if (statuses.every((s) => s === "missing")) return "missing";
    return "ok";
  }

  // Sort clients so the ones needing attention float up.
  const ranked = [...clients].sort((a, b) => {
    const score = (id: string) =>
      (pendingByClient.get(id) ?? 0) +
      (unread.get(id) ?? 0) * 2 +
      (rowHealth(id) === "failed" ? 100 : rowHealth(id) === "stale" ? 20 : 0);
    return score(b.id) - score(a.id);
  });

  return (
    <AdminShell session={session} active="/admin/command-center">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1600px] mx-auto">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Command center
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Who needs you today</h1>
        </div>

        {/* 1. Needs attention */}
        <Card className="mb-6">
          <CardHeader title="Clients" subtitle="Sorted by what needs attention" />
          <CardBody className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Tier</th>
                    <th className="px-4 py-2 font-medium text-center">Approvals</th>
                    <th className="px-4 py-2 font-medium text-center">Unread</th>
                    <th className="px-4 py-2 font-medium">Feeds</th>
                    <th className="px-4 py-2 font-medium">Last report</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((c) => {
                    const pending = pendingByClient.get(c.id) ?? 0;
                    const msgs = unread.get(c.id) ?? 0;
                    const h = HEALTH_STYLE[rowHealth(c.id)];
                    const last = lastReportByClient.get(c.id);
                    return (
                      <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-hover)]">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/clients/${c.id}`} className="font-medium hover:text-[var(--color-accent)]">
                            {c.company_name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                          {c.tier ? TIER_LABELS[c.tier].replace(/ —.*/, "") : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {pending > 0 ? (
                            <span className="inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">
                              {pending}
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-subtle)]">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {msgs > 0 ? (
                            <span className="inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                              {msgs}
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-subtle)]">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={"inline-flex items-center gap-1.5 text-xs " + h.text}>
                            <span className={"h-2 w-2 rounded-full " + h.dot} />
                            {h.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                          {last ? <Time iso={last} dateOnly /> : <span className="text-[var(--color-text-subtle)]">Never</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start">
          {/* 2. Connector health matrix */}
          <Card>
            <CardHeader title="Data feeds" subtitle={`Flagged after ${STALE_DAYS} days without a sync`} />
            <CardBody className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                      <th className="px-4 py-2 font-medium">Client</th>
                      {PROVIDERS.map((p) => (
                        <th key={p.key} className="px-2 py-2 font-medium text-center">{p.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => {
                      const m = connByClient.get(c.id);
                      return (
                        <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="px-4 py-2.5">
                            <Link href={`/admin/clients/${c.id}`} className="hover:text-[var(--color-accent)]">
                              {c.company_name}
                            </Link>
                          </td>
                          {PROVIDERS.map((p) => {
                            const conn = m?.get(p.key);
                            const h = connectorHealth(conn);
                            const st = HEALTH_STYLE[h];
                            return (
                              <td key={p.key} className="px-2 py-2.5 text-center">
                                <span
                                  title={
                                    conn?.last_synced_at
                                      ? `Last synced ${new Date(conn.last_synced_at).toLocaleString()}`
                                      : h === "missing"
                                        ? "Not connected"
                                        : "Never synced"
                                  }
                                  className={"inline-block h-2.5 w-2.5 rounded-full " + st.dot}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3 px-4 py-3 text-[10px] text-[var(--color-text-subtle)]">
                {(["ok", "stale", "failed", "missing"] as Health[]).map((h) => (
                  <span key={h} className="inline-flex items-center gap-1.5">
                    <span className={"h-2 w-2 rounded-full " + HEALTH_STYLE[h].dot} />
                    {h === "ok" ? "Synced" : h === "missing" ? "Not connected" : HEALTH_STYLE[h].label}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* 3. Recent reports */}
          <Card>
            <CardHeader title="Recent reports" subtitle="Latest generated decks" />
            <CardBody className="space-y-2">
              {reports.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                  No reports generated yet.
                </div>
              ) : (
                reports.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link href={`/admin/clients/${r.client_id}`} className="text-sm font-medium hover:text-[var(--color-accent)]">
                        {clientName(r.client_id)}
                      </Link>
                      <div className="text-[11px] text-[var(--color-text-subtle)] capitalize">
                        {r.report_type.replace(/[-_]/g, " ")}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-[var(--color-text-muted)]">
                      <Time iso={r.created_at} dateOnly />
                    </span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
