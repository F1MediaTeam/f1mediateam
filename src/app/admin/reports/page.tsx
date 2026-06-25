import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import ReportFilters, { type ReportRange } from "@/components/admin/ReportFilters";
import ExportLinks from "@/components/admin/ExportLinks";
import { formatDate, formatNumber, formatPercentChange, todayIso } from "@/lib/utils";
import { aiConfigured } from "@/lib/deck/ai-narrative";
import { gammaConfigured } from "@/lib/connectors/gamma";

type Range = ReportRange;

function rangeBounds(range: Range, tz: string, from?: string, to?: string): { fromIso?: string; toIso?: string } {
  // "All time" → no bounds, so every query pulls the full history and the
  // header reads "All time".
  if (range === "all") return {};
  // Anchor on "today" in the viewer's timezone (as UTC midnight of that local
  // date) and do all arithmetic in UTC so we never roll into a future day.
  const today = new Date(todayIso(tz) + "T00:00:00Z");
  const end = to ? new Date(to + "T00:00:00Z") : today;
  const start = from ? new Date(from + "T00:00:00Z") : new Date(today);
  if (!from) {
    if (range === "weekly")  start.setUTCDate(start.getUTCDate() - 7);
    if (range === "monthly") start.setUTCMonth(start.getUTCMonth() - 1);
    if (range === "yearly")  start.setUTCFullYear(start.getUTCFullYear() - 1);
    // daily: start stays at today
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { fromIso: iso(start), toIso: iso(end) };
}

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; range?: Range; from?: string; to?: string; tz?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const clients = await data.listClients();
  const clientId = sp.client ?? clients[0]?.id ?? "";
  const range = (sp.range ?? "monthly") as Range;
  const tz = sp.tz || "America/Los_Angeles";
  const { fromIso, toIso } = rangeBounds(range, tz, sp.from, sp.to);
  const client = clientId ? await data.getClient(clientId) : null;

  // Every connector's headline metrics — Google, Bing, and SEMrush. `invert`
  // marks metrics where a lower number is better (search-result positions).
  const metricDefs: { metric: string; label: string; invert?: boolean }[] = [
    { metric: "clicks",                   label: "Organic clicks (GSC)" },
    { metric: "impressions",              label: "Impressions (GSC)" },
    { metric: "avg_position",             label: "Avg. position (GSC)", invert: true },
    { metric: "sessions",                 label: "Sessions (GA4)" },
    { metric: "visibility",               label: "Visibility" },
    { metric: "bing_clicks",              label: "Bing clicks" },
    { metric: "bing_impressions",         label: "Bing impressions" },
    { metric: "bing_avg_click_position",  label: "Bing avg. click position", invert: true },
    { metric: "semrush_organic_keywords", label: "SEMrush organic keywords" },
    { metric: "semrush_organic_traffic",  label: "SEMrush organic traffic" },
    { metric: "semrush_organic_cost",     label: "SEMrush organic value ($)" },
    { metric: "semrush_paid_keywords",    label: "SEMrush paid keywords" },
    { metric: "semrush_paid_traffic",     label: "SEMrush paid traffic" },
  ];
  const seriesAll = await Promise.all(
    metricDefs.map((d) => data.listSnapshots({ clientId, metric: d.metric, from: fromIso, to: toIso })),
  );
  const rows = metricDefs.map((d, i) => {
    const series = seriesAll[i];
    const first = series[0] ?? null;
    const last = series[series.length - 1] ?? null;
    const change = first && last ? formatPercentChange(first.value, last.value) : null;
    return { metric: d.metric, label: d.label, invert: d.invert ?? false, first, last, change };
  });

  const aiOk = aiConfigured();
  const gammaOk = gammaConfigured();
  const fieldCls = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
  const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

  return (
    <AdminShell session={session} active="/admin/reports">
      <div className="px-8 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Reports</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Performance report</h1>
        </div>

        {/* ─────────── Meeting deck (formerly /admin/meeting-deck) ─────────── */}
        {!aiOk ? (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm px-4 py-3">
            <strong>ANTHROPIC_API_KEY</strong> is not set on this environment. Meeting deck generation will fail until you add it under Vercel → Project Settings → Environment Variables.
          </div>
        ) : null}
        <Card className="mb-8">
          <CardHeader
            title="Meeting deck"
            subtitle="Pick a company + time frame. Claude writes the narrative slides from that client's posted content, GSC numbers, drafts, open tasks, and any Fieldy meeting notes mentioning them in the window. PDF downloads when ready (15–30s)."
          />
          <CardBody>
            <form action="/api/meeting-deck" method="post" target="_blank" className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Company</label>
                  <select name="client_id" required defaultValue={clientId} className={fieldCls}>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Time frame</label>
                  <select name="range" defaultValue="28d" className={fieldCls}>
                    <option value="7d">Last 7 days</option>
                    <option value="28d">Last 28 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="ytd">Year to date</option>
                    <option value="custom">Custom range…</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Custom from</label>
                  <input type="date" name="from" className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Custom to</label>
                  <input type="date" name="to" className={fieldCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Tier</label>
                  <select name="tier" defaultValue="foundation" className={fieldCls}>
                    <option value="foundation">Foundation Visibility</option>
                    <option value="growth">Growth &amp; Authority</option>
                    <option value="domination">Market Domination</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tone</label>
                  <select name="tone" defaultValue="professional" className={fieldCls}>
                    <option value="professional">Professional</option>
                    <option value="conversational">Conversational</option>
                    <option value="technical">Technical</option>
                    <option value="friendly">Friendly</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Industry (optional)</label>
                  <input type="text" name="industry" placeholder="DTF &amp; Embroidery Supplies / E-Commerce" className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Services (optional)</label>
                  <input type="text" name="services" placeholder="SEO, Web Dev, Backlink Management" className={fieldCls} />
                </div>
              </div>
              <details className="text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-4">
                <summary className="cursor-pointer">Brand &amp; assets (optional)</summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Primary color</label>
                    <input type="color" name="accent" defaultValue="#14B8A6" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                  </div>
                  <div>
                    <label className={labelCls}>Secondary</label>
                    <input type="color" name="brand_secondary" defaultValue="#E63946" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                  </div>
                  <div>
                    <label className={labelCls}>Tertiary</label>
                    <input type="color" name="brand_tertiary" defaultValue="#F4A261" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelCls}>Logo URL</label>
                    <input type="url" name="logo_url" placeholder="https://…/logo.png" className={fieldCls} />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelCls}>Google Drive folder (optional)</label>
                    <input type="url" name="drive_folder_url" placeholder="https://drive.google.com/…" className={fieldCls} />
                    <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">Where you keep GSC / GA4 exports, screenshots, deliverables logs. Used as a reference link inside the prompt.</p>
                  </div>
                </div>
              </details>
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-end pt-2">
                {gammaOk ? (
                  <Button type="submit" name="output" value="gamma" variant="secondary" className="px-6">
                    Open in Gamma
                  </Button>
                ) : null}
                <Button type="submit" name="output" value="pdf" className="px-8">
                  Generate &amp; download
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* ─────────── Performance report (filters + export) ─────────── */}
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
                  ["keywords", "Organic keywords"],
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
            subtitle={fromIso && toIso ? `${formatDate(fromIso)} → ${formatDate(toIso)}` : "All time"}
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
                  const invert = r.invert;
                  const dir = !r.change ? "flat"
                    : invert
                      ? (r.change.direction === "up" ? "down" : r.change.direction === "down" ? "up" : "flat")
                      : r.change.direction;
                  return (
                    <tr key={r.metric}>
                      <td className="py-3 pr-4">{r.label}</td>
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
