import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import ReportFilters, { type ReportRange } from "@/components/admin/ReportFilters";
import ExportLinks from "@/components/admin/ExportLinks";
import { formatDate, formatNumber, formatPercentChange, isoDate } from "@/lib/utils";

type Range = ReportRange;

function rangeBounds(range: Range, from?: string, to?: string) {
  const today = new Date();
  const end = to ? new Date(to) : today;
  const start = from ? new Date(from) : new Date(today);
  if (!from) {
    if (range === "daily")   start.setDate(today.getDate());
    if (range === "weekly")  start.setDate(today.getDate() - 7);
    if (range === "monthly") start.setMonth(today.getMonth() - 1);
    if (range === "yearly")  start.setFullYear(today.getFullYear() - 1);
  }
  return { fromIso: isoDate(start), toIso: isoDate(end) };
}

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; range?: Range; from?: string; to?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const clients = await data.listClients();
  const clientId = sp.client ?? clients[0]?.id ?? "";
  const range = (sp.range ?? "monthly") as Range;
  const { fromIso, toIso } = rangeBounds(range, sp.from, sp.to);
  const client = clientId ? await data.getClient(clientId) : null;

  const metrics = ["clicks", "impressions", "sessions", "avg_position", "visibility"] as const;
  const seriesAll = await Promise.all(
    metrics.map((m) => data.listSnapshots({ clientId, metric: m, from: fromIso, to: toIso })),
  );
  const rows = metrics.map((m, i) => {
    const series = seriesAll[i];
    const first = series[0] ?? null;
    const last = series[series.length - 1] ?? null;
    const change = first && last ? formatPercentChange(first.value, last.value) : null;
    return { metric: m, first, last, change };
  });

  return (
    <AdminShell session={session} active="/admin/reports">
      <div className="px-8 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Reports</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Performance report</h1>
        </div>

        <Card className="mb-6">
          <CardBody className="pt-5">
            <ReportFilters
              clients={clients.map((c) => ({ id: c.id, company_name: c.company_name }))}
              defaultClientId={clientId}
              defaultRange={range}
              defaultFrom={sp.from ?? ""}
              defaultTo={sp.to ?? ""}
            />
          </CardBody>
        </Card>

        {client ? (
          <Card className="mb-6">
            <CardHeader
              title="Download report"
              subtitle="Each download is a polished, client-presentable PDF — brand cover page, KPI tiles, embedded charts, and a styled data table."
            />
            <CardBody>
              <ExportLinks
                clientId={client.id}
                fromIso={fromIso}
                toIso={toIso}
                spFrom={sp.from}
                spTo={sp.to}
                range={range}
                sections={[
                  ["metrics", "Rankings & traffic"],
                  ["content", "Content cards"],
                  ["content_events", "Approvals & posts (log)"],
                  ["tasks", "Tasks"],
                  ["calendar", "Calendar"],
                  ["audit", "Sign-in audit"],
                  ["admin_access", "Admin access sessions"],
                  ["files", "Files"],
                  ["onboarding", "Onboarding answers"],
                ]}
              />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={client ? `${client.company_name} — ${range}` : "—"}
            subtitle={`${formatDate(fromIso)} → ${formatDate(toIso)}`}
            right={
              <a
                href="javascript:window.print()"
                className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 py-1.5 text-xs"
              >
                Print / Save as PDF
              </a>
            }
          />
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  <th className="py-2 pr-4">Metric</th>
                  <th className="py-2 pr-4">Start</th>
                  <th className="py-2 pr-4">End</th>
                  <th className="py-2 pr-4">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => {
                  const invert = r.metric === "avg_position";
                  const dir = !r.change ? "flat"
                    : invert
                      ? (r.change.direction === "up" ? "down" : r.change.direction === "down" ? "up" : "flat")
                      : r.change.direction;
                  return (
                    <tr key={r.metric}>
                      <td className="py-3 pr-4 capitalize">{r.metric.replace("_", " ")}</td>
                      <td className="py-3 pr-4 font-mono">{r.first ? formatNumber(r.first.value, { maximumFractionDigits: 1 }) : "—"}</td>
                      <td className="py-3 pr-4 font-mono">{r.last  ? formatNumber(r.last.value,  { maximumFractionDigits: 1 }) : "—"}</td>
                      <td className="py-3 pr-4">
                        {r.change ? (
                          <Pill tone={dir === "up" ? "ok" : dir === "down" ? "danger" : "default"}>
                            {r.change.label}
                          </Pill>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
