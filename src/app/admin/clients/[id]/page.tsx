import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import MultiMetricCard from "@/components/shared/MultiMetricCard";
import SeoMetricsRow from "@/components/shared/SeoMetricsRow";
import SemrushGauges from "@/components/shared/SemrushGauges";
import OrganicKeywordsPanel from "@/components/shared/OrganicKeywordsPanel";
import ClientOnboardingPanel from "@/components/admin/ClientOnboardingPanel";
import SemrushInsights from "@/components/shared/SemrushInsights";
import WidgetBoard, { type WidgetSlot } from "@/components/shared/WidgetBoard";
import { buildSemrushChartData } from "@/lib/semrush-charts";
import { formatBytes, formatLocation } from "@/lib/utils";
import Time from "@/components/shared/Time";
import { setWidgetAction, disconnectConnectorAction, refreshConnectorAction, advanceContentAction, createContentAction, semrushDeepPullAction } from "@/app/admin/actions";
import CreateClientUserForm from "@/components/admin/CreateClientUserForm";
import AdminContentAddModal from "@/components/admin/AdminContentAddModal";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import LiveSyncTrigger from "@/components/admin/LiveSyncTrigger";
import type { ContentStage, SemrushReport } from "@/lib/types";

// A full Semrush deep pull fans out ~18 API calls; give the server action room.
export const maxDuration = 60;

export default async function ClientProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const oauthError = typeof sp.oauth_error === "string" ? sp.oauth_error : null;
  const oauthConnected = typeof sp.oauth_connected === "string" ? sp.oauth_connected : null;
  const providerLabel: Record<string, string> = {
    gsc: "Google Search Console",
    ga4: "Google Analytics 4",
    bing: "Bing Webmaster Tools",
    semrush: "Semrush",
  };
  const client = await data.getClient(id);
  if (!client) notFound();

  const [tasks, events, files, audit, content, connectors, customerUser, semrushReports] = await Promise.all([
    data.listTasks({ clientId: id }),
    data.listCalendar({ clientId: id }),
    data.listFiles(id),
    data.listAudit({ clientId: id, limit: 8 }),
    data.listContent({ clientId: id }),
    data.listConnectors(id),
    data.getClientUser(id),
    data.listSemrushReports(id),
  ]);
  const semrushConnected = connectors.some((c) => c.provider === "semrush");
  const semrushUnits = semrushReports.reduce((a, r) => a + (Number((r.meta as Record<string, unknown>)?.units_estimate) || 0), 0);
  const semrushLastPulled = semrushReports.reduce<string | null>((acc, r) => (!acc || r.pulled_at > acc ? r.pulled_at : acc), null);

  const stageMeta: { stage: ContentStage; label: string; tone: "warn" | "accent" | "ok" }[] = [
    { stage: "proposed", label: "Proposed", tone: "warn" },
    { stage: "pending",  label: "Pending",  tone: "accent" },
    { stage: "posted",   label: "Posted",   tone: "ok" },
  ];

  return (
    <AdminShell session={session} active="/admin/clients">
      <LiveSyncTrigger clientId={id} />
      <div className="px-8 py-8 max-w-[1600px]">
        <Link href="/admin/clients" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          ← All clients
        </Link>
        <div className="mt-2 mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{client.company_name}</h1>
            <div className="mt-1 text-sm text-[var(--color-text-muted)] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Joined <Time iso={client.join_date} dateOnly /></span>
              {client.websites.map((w) => (
                <a
                  key={w}
                  href={w}
                  className="hover:text-[var(--color-accent)]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {w.replace(/^https?:\/\//, "")} ↗
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <ImpersonateButton clientId={client.id} clientName={client.company_name} />
          </div>
        </div>

        {oauthError ? (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <div className="font-medium">Connection failed</div>
            <div className="mt-0.5 text-red-200/80">{oauthError}</div>
          </div>
        ) : null}

        {oauthConnected ? (
          <div className="mb-6 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            Connected to {providerLabel[oauthConnected] ?? oauthConnected}.
          </div>
        ) : null}

        {customerUser ? (
          <div className="mb-8">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
                  Content board
                </div>
                <h2 className="text-lg font-semibold tracking-tight mt-0.5">
                  {content.length} {content.length === 1 ? "card" : "cards"} for {client.company_name}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <AdminContentAddModal
                  action={createContentAction}
                  lockedClient={{ id: client.id, company_name: client.company_name }}
                />
                <Link
                  href={`/admin/content?client=${client.id}`}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Open full board →
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {stageMeta.map(({ stage, label, tone }) => {
                const col = content.filter((c) => c.stage === stage);
                return (
                  <Card key={stage}>
                    <CardHeader
                      title={<Pill tone={tone}>{label}</Pill>}
                      right={<span className="font-mono text-xs text-[var(--color-text-muted)]">{col.length}</span>}
                    />
                    <CardBody className="space-y-2">
                      {col.length === 0 ? (
                        <div className="text-xs text-[var(--color-text-subtle)] text-center py-6">Empty.</div>
                      ) : (
                        col.map((card) => {
                          return (
                            <div
                              key={card.id}
                              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
                            >
                              <div className="text-sm font-medium leading-snug">{card.title}</div>
                              {card.body ? (
                                <div className="mt-2 text-xs text-[var(--color-text-muted)] line-clamp-3">{card.body}</div>
                              ) : null}
                              <div className="mt-3 flex items-center gap-1.5">
                                {stage !== "proposed" ? (
                                  <form action={advanceContentAction}>
                                    <input type="hidden" name="id" value={card.id} />
                                    <input type="hidden" name="direction" value="back" />
                                    <Button size="sm" variant="ghost" type="submit">← Back</Button>
                                  </form>
                                ) : null}
                                {stage !== "posted" ? (
                                  <form action={advanceContentAction}>
                                    <input type="hidden" name="id" value={card.id} />
                                    <input type="hidden" name="direction" value="forward" />
                                    <Button size="sm" type="submit">
                                      {stage === "proposed" ? "Approve →" : "Mark posted →"}
                                    </Button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Card className="mb-8">
            <CardHeader
              title="Customer account"
              subtitle="Create the login the customer will use. Share the initial password — they can change it after signing in."
            />
            <CardBody>
              <CreateClientUserForm clientId={client.id} />
            </CardBody>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 mb-8">
          <MultiMetricCard
            clientId={id}
            title="Organic Search Performance"
            metrics={[
              { metric: "clicks",       label: "Total clicks",      color: "#60a5fa" },
              { metric: "impressions",  label: "Total impressions", color: "#a78bfa" },
              { metric: "avg_position", label: "Average position",  color: "#f59e0b", aggregation: "average", invert: true },
              { metric: "ctr",          label: "CTR",               color: "#34d399", aggregation: "average", unit: "%" },
            ]}
          />
          <MultiMetricCard
            clientId={id}
            title="Site Traffic"
            metrics={[
              { metric: "sessions",     label: "Sessions",     color: "#22d3ee" },
              { metric: "active_users", label: "Active users", color: "#f472b6" },
              { metric: "conversions",  label: "Conversions",  color: "#facc15" },
            ]}
          />
          <MultiMetricCard
            clientId={id}
            title="Organic Performance"
            metrics={[
              { metric: "bing_clicks",                  label: "Clicks",            color: "#60a5fa" },
              { metric: "bing_impressions",             label: "Impressions",       color: "#a78bfa" },
              { metric: "bing_avg_click_position",      label: "Avg click position", color: "#f59e0b", aggregation: "average", invert: true },
              { metric: "bing_avg_impression_position", label: "Avg impr position",  color: "#fb7185", aggregation: "average", invert: true },
            ]}
          />
          <SeoMetricsRow clientId={id} />
          <SemrushGauges clientId={id} />
          <OrganicKeywordsPanel clientId={id} />
          <ClientOnboardingPanel clientId={id} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader title="Data connectors" subtitle="Live sync sources" />
            <CardBody className="space-y-2">
              {[
                { provider: "gsc",     label: "Google Search Console", connectHref: `/api/oauth/google/start?provider=gsc&client_id=${client.id}` },
                { provider: "ga4",     label: "Google Analytics 4",    connectHref: `/api/oauth/google/start?provider=ga4&client_id=${client.id}` },
                { provider: "bing",    label: "Bing Webmaster Tools",  connectHref: `/admin/clients/${client.id}/connect/bing` },
                { provider: "semrush", label: "Semrush",               connectHref: `/admin/clients/${client.id}/connect/semrush` },
              ].map(({ provider, label, connectHref }) => {
                const c = connectors.find((x) => x.provider === provider);
                const lastSyncedLabel = c?.last_synced_at
                  ? `Last sync ${new Date(c.last_synced_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
                  : "Never synced";
                const statusIsError = (c?.last_sync_status ?? "").toLowerCase().startsWith("error");
                return (
                  <div
                    key={provider}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{label}</div>
                      {c ? (
                        <div className="flex items-center gap-1.5">
                          <form action={refreshConnectorAction}>
                            <input type="hidden" name="client_id" value={client.id} />
                            <input type="hidden" name="provider" value={provider} />
                            <Button size="sm" variant="secondary" type="submit">Refresh</Button>
                          </form>
                          <form action={disconnectConnectorAction}>
                            <input type="hidden" name="client_id" value={client.id} />
                            <input type="hidden" name="provider" value={provider} />
                            <Button size="sm" variant="danger" type="submit">Disconnect</Button>
                          </form>
                        </div>
                      ) : (
                        <a
                          href={connectHref}
                          className="rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:brightness-110 px-3 h-8 text-xs font-medium inline-flex items-center"
                        >
                          Connect
                        </a>
                      )}
                    </div>
                    {c ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono">
                        <span className="text-[var(--color-text-muted)]">{lastSyncedLabel}</span>
                        {c.last_sync_status ? (
                          <span className={statusIsError ? "text-red-400" : "text-[var(--color-text-muted)]"}>
                            · {c.last_sync_status}
                          </span>
                        ) : null}
                        {c.account_label ? (
                          <span className="text-[var(--color-text-subtle)]">· {c.account_label}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" subtitle="Open tasks + upcoming" />
            <CardBody>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
                  <div className="text-[11px] uppercase text-[var(--color-text-muted)]">Open tasks</div>
                  <div className="mt-1 text-xl font-semibold">{tasks.filter(t => t.status === "open").length}</div>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
                  <div className="text-[11px] uppercase text-[var(--color-text-muted)]">Events</div>
                  <div className="mt-1 text-xl font-semibold">{events.length}</div>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
                  <div className="text-[11px] uppercase text-[var(--color-text-muted)]">Files</div>
                  <div className="mt-1 text-xl font-semibold">{files.length}</div>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
                  <div className="text-[11px] uppercase text-[var(--color-text-muted)]">Last login</div>
                  <div className="mt-1 text-xs font-mono">{audit[0] ? <Time iso={audit[0].logged_in_at} /> : "—"}</div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader title="Client dashboard widgets" subtitle="What the client sees in their portal" />
            <CardBody className="space-y-2">
              {(["rankings","traffic","content","files","calendar"] as const).map((w) => {
                const enabled = client.config.widgets[w];
                return (
                  <div key={w} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2">
                    <div className="text-sm capitalize">{w}</div>
                    <form action={setWidgetAction}>
                      <input type="hidden" name="client_id" value={client.id} />
                      <input type="hidden" name="widget" value={w} />
                      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
                      <button
                        className={
                          "px-3 py-1 rounded-md text-xs " +
                          (enabled
                            ? "border border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                            : "border border-[var(--color-border-strong)] text-[var(--color-text-muted)]")
                        }
                      >
                        {enabled ? "Enabled" : "Hidden"}
                      </button>
                    </form>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent logins" subtitle="Per-client audit trail" />
            <CardBody className="space-y-2">
              {audit.length === 0 ? (
                <div className="text-xs text-[var(--color-text-muted)]">No logins yet.</div>
              ) : (
                audit.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs">
                    <span className="font-mono"><Time iso={a.logged_in_at} /></span>
                    <span className="text-[var(--color-text-muted)]">{formatLocation(a)}</span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader
            title="Semrush — deep data"
            subtitle={
              semrushLastPulled
                ? `Full catalog · ~${semrushUnits.toLocaleString()} units last pull`
                : "Pull the full Semrush catalog on demand — keywords, competitors, backlinks, and more"
            }
            right={
              semrushConnected ? (
                <form action={semrushDeepPullAction}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <Button size="sm" type="submit">
                    {semrushLastPulled ? "Re-run deep pull" : "Run deep pull"}
                  </Button>
                </form>
              ) : (
                <Link
                  href={`/admin/clients/${client.id}/connect/semrush`}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Connect Semrush →
                </Link>
              )
            }
          />
          <CardBody>
            {!semrushConnected ? (
              <div className="text-xs text-[var(--color-text-muted)]">
                Connect Semrush (API key + domain) to enable the deep pull.
              </div>
            ) : semrushReports.length === 0 ? (
              <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                <p>
                  No deep pull yet. One run fetches organic &amp; paid keywords, competitors, ad copies, the full
                  backlink profile (overview, backlinks, referring domains/IPs, anchors, indexed pages, competitors,
                  Authority Score history), seeded keyword research, and — best-effort — Traffic Analytics.
                </p>
                <p className="text-amber-400">Heads up: a full pull can use ~100k+ Semrush API units and takes ~30–60s.</p>
              </div>
            ) : (
              <>
                <div className="mb-3 font-mono text-[11px] text-[var(--color-text-subtle)]">
                  Last pulled <Time iso={semrushLastPulled!} /> · ~{semrushUnits.toLocaleString()} units
                </div>
                <SemrushInsights data={buildSemrushChartData(semrushReports)} />
                <div className="mt-6 mb-2 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  Raw reports
                </div>
                <WidgetBoard
                  storageKey={`f1.semrush-raw-reports.layout.v1.${id}`}
                  gridClassName="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:auto-rows-fr"
                  widgets={semrushReports.map((r) => {
                    const meta = (r.meta ?? {}) as Record<string, unknown>;
                    const label = (meta.label as string) ?? r.report_type;
                    return {
                      id: r.report_type,
                      label,
                      node: <SemrushReportCard r={r} />,
                    } satisfies WidgetSlot;
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Files" subtitle={`${files.length} items`} />
          <CardBody className="space-y-1.5">
            {files.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)]">No files uploaded.</div>
            ) : (
              files.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <Pill>{f.category ?? "other"}</Pill>
                    <span className="truncate">{f.filename}</span>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] font-mono">
                    {formatBytes(f.size_bytes)}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}

function SemrushReportCard({ r }: { r: SemrushReport }) {
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  const label = (meta.label as string) ?? r.report_type;
  const err = meta.error as string | null | undefined;
  const units = Number(meta.units_estimate) || 0;
  const headers = r.rows[0] ? Object.keys(r.rows[0]).slice(0, 5) : [];
  return (
    <div className="h-full flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{label}</div>
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{r.row_count} rows</span>
      </div>
      {err ? <div className="mt-1 text-[11px] text-red-400">⚠ {err}</div> : null}
      {headers.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[var(--color-text-muted)]">
                {headers.map((h) => (
                  <th key={h} className="pr-3 pb-1 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-t border-[var(--color-border)]">
                  {headers.map((h) => (
                    <td key={h} className="max-w-[160px] truncate pr-3 py-1">{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {r.row_count > 5 ? (
            <div className="mt-1 text-[10px] text-[var(--color-text-subtle)]">+{r.row_count - 5} more rows stored</div>
          ) : null}
        </div>
      ) : !err ? (
        <div className="mt-2 text-[11px] text-[var(--color-text-subtle)]">No rows returned.</div>
      ) : null}
      <div className="mt-1.5 font-mono text-[10px] text-[var(--color-text-subtle)]">
        ~{units.toLocaleString()} units · pulled <Time iso={r.pulled_at} />
      </div>
    </div>
  );
}
