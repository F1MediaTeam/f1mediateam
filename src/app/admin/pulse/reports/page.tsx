// F1 Pulse — Report Center.
//
// Two halves: what you can generate, and what you already have. The catalog is
// honest about which templates are live and which are waiting on collectors
// that don't exist yet, because a button that produces an invented number is
// worse than a button that isn't there.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import Time from "@/components/shared/Time";
import { clientColor } from "@/lib/client-color";
import { filterClients } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { listSites } from "@/lib/pulse/sites";
import { createServiceClient } from "@/lib/supabase/server";
import { TEMPLATES, templateById } from "@/lib/pulse/reports/core";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import PullReportButton from "@/components/admin/pulse/PullReportButton";

export const dynamic = "force-dynamic";

interface ReportRow {
  id: string;
  site_id: string | null;
  domain: string;
  template: string;
  range_label: string;
  status: string;
  mocked: boolean;
  file_size: number | null;
  csv_paths: string[];
  created_at: string;
}

function size(bytes: number | null): string {
  if (!bytes) return "—";
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const STATUS_TONE: Record<string, string> = {
  ready: "var(--color-ok)",
  rendering: "var(--color-warn)",
  queued: "var(--color-warn)",
  failed: "var(--color-bad)",
};

export default async function ReportCenterPage() {
  const session = await requireAdmin();
  const allowed = await visibleClientIds(session);
  const [allClients, sites] = await Promise.all([data.listClients(), listSites(allowed)]);
  const clients = filterClients(allClients, allowed);

  const supabase = await createServiceClient();
  const visibleSiteIds = new Set(sites.map((s) => s.id));
  const { data: rawReports } = await supabase
    .from("pulse_reports")
    .select("id, site_id, domain, template, range_label, status, mocked, file_size, csv_paths, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  const reports = ((rawReports as ReportRow[]) ?? []).filter(
    (r) => !r.site_id || visibleSiteIds.has(r.site_id),
  );

  const clientFor = (siteId: string | null) => {
    const site = sites.find((s) => s.id === siteId);
    return clients.find((c) => c.id === site?.client_id);
  };

  const live = TEMPLATES.filter((t) => t.live);
  const pending = TEMPLATES.filter((t) => !t.live);

  return (
    <AdminShell session={session}>
      <PulseHeader subtitle="Branded PDFs with CSV companions, generated from the same numbers the dashboard shows." />

      <h2 className="mb-4 text-lg font-semibold">Report Center</h2>

      {sites.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              No Pulse sites yet.{" "}
              <Link href="/admin/pulse" className="underline">
                Add a site
              </Link>{" "}
              and reports become available as soon as it starts collecting.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ---------- generate ---------- */}
          <Card data-panel>
            <CardHeader title="Pull a report" />
            <CardBody>
              <div className="flex flex-col gap-4">
                {sites.map((site) => {
                  const client = clients.find((c) => c.id === site.client_id);
                  const color = clientColor(client ?? { id: site.client_id });
                  return (
                    <div
                      key={site.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: color.hex }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: color.solid, color: color.onSolid }}
                          >
                            {client?.company_name ?? site.domain}
                          </span>
                          <p className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">
                            {site.domain}
                          </p>
                        </div>
                      </div>
                      <PullReportButton siteId={site.id} template="monthly" label="Monthly report" />
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* ---------- catalog ---------- */}
          <Card data-panel>
            <CardHeader title="Report types" />
            <CardBody>
              <ul className="flex flex-col gap-2.5">
                {live.map((t) => (
                  <li key={t.id} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--color-ok)" }}
                      aria-hidden
                    />
                    <div>
                      <p className="text-xs font-medium">{t.name}</p>
                      <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                        {t.blurb}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {pending.length > 0 ? (
                <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Waiting on collectors
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {pending.map((t) => (
                      <li key={t.id} className="text-[11px] text-[var(--color-text-subtle)]">
                        {t.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ---------- history ---------- */}
      <Card data-panel className="mt-4">
        <CardHeader title="Generated reports" />
        <CardBody>
          {reports.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Nothing generated yet. Reports you pull are kept here so a client can be sent the
              same file twice without it being rebuilt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Report</th>
                    <th className="pb-2 font-medium">Period</th>
                    <th className="pb-2 font-medium">Generated</th>
                    <th className="pb-2 text-right font-medium">Size</th>
                    <th className="pb-2 text-right font-medium">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const client = clientFor(r.site_id);
                    const color = clientColor(client ?? { id: r.site_id ?? r.domain });
                    const tpl = templateById(r.template);
                    return (
                      <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-2">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: color.solid, color: color.onSolid }}
                          >
                            {client?.company_name ?? r.domain}
                          </span>
                        </td>
                        <td className="py-2">
                          {tpl?.name ?? r.template}
                          {r.mocked ? (
                            <span
                              className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
                              style={{ background: "var(--color-warn)", color: "#fff" }}
                            >
                              Sample
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-[var(--color-text-muted)]">{r.range_label}</td>
                        <td className="py-2 text-[var(--color-text-muted)]">
                          <Time iso={r.created_at} />
                        </td>
                        <td className="py-2 text-right tabular-nums text-[var(--color-text-muted)]">
                          {size(r.file_size)}
                        </td>
                        <td className="py-2 text-right">
                          {r.status === "ready" ? (
                            <span className="inline-flex items-center gap-2">
                              <a
                                href={`/api/pulse/reports/${r.id}/download?file=pdf`}
                                className="font-medium underline"
                              >
                                PDF
                              </a>
                              {(r.csv_paths ?? []).map((p, i) => (
                                <a
                                  key={p}
                                  href={`/api/pulse/reports/${r.id}/download?file=csv&i=${i}`}
                                  className="text-[var(--color-text-muted)] underline"
                                  title={p.split("/").pop()}
                                >
                                  CSV{(r.csv_paths ?? []).length > 1 ? ` ${i + 1}` : ""}
                                </a>
                              ))}
                            </span>
                          ) : (
                            <span style={{ color: STATUS_TONE[r.status] ?? "var(--color-text-muted)" }}>
                              {r.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </AdminShell>
  );
}
