import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { connectSemrushDomainAction, updateSemrushMetaAction } from "@/app/admin/actions";

export default async function ConnectSemrushPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const client = await data.getClient(id);
  if (!client) return null;
  const defaultDomain = (client.websites ?? [])[0] ?? "";
  const tokens = await data.listConnectors(id);
  const semrushToken = tokens.find((t) => t.provider === "semrush");
  const meta = (semrushToken?.meta ?? {}) as Record<string, unknown>;
  const m = {
    site_audit_project_id: meta.site_audit_project_id == null ? "" : String(meta.site_audit_project_id),
    position_tracking_campaign_id: meta.position_tracking_campaign_id == null ? "" : String(meta.position_tracking_campaign_id),
    ai_visibility_value: meta.ai_visibility_value == null ? "" : String(meta.ai_visibility_value),
    mentions_value: meta.mentions_value == null ? "" : String(meta.mentions_value),
    site_health_value: meta.site_health_value == null ? "" : String(meta.site_health_value),
    visibility_value: meta.visibility_value == null ? "" : String(meta.visibility_value),
  };

  return (
    <AdminShell session={session} active="/admin/clients">
      <div className="px-8 py-8 max-w-2xl">
        <Link
          href={`/admin/clients/${id}`}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ← Back to {client.company_name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2 mb-1">
          Connect Semrush
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          Confirm {client.company_name}&apos;s domain. Your agency Semrush API key is
          used automatically — no per-client paste.
        </p>

        <Card>
          <CardHeader title="Domain" subtitle={process.env.SEMRUSH_API_KEY ? "Using your agency SEMRUSH_API_KEY" : "Missing SEMRUSH_API_KEY env var"} />
          <CardBody>
            <form action={connectSemrushDomainAction} className="space-y-3">
              <input type="hidden" name="client_id" value={id} />
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Domain
                </label>
                <input
                  type="text"
                  name="domain"
                  defaultValue={defaultDomain}
                  placeholder="bucketsofink.com"
                  required
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit">Connect</Button>
                <Link
                  href={`/admin/clients/${id}`}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-3 py-2"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </CardBody>
        </Card>

        {semrushToken ? (
          <Card className="mt-6">
            <CardHeader
              title="SEO Snapshot sources"
              subtitle="Auto-fills the AI Visibility, Mentions, Site Health, and Visibility cards. Stored on the connector token, applied on the next sync."
            />
            <CardBody>
              <form action={updateSemrushMetaAction} className="space-y-4">
                <input type="hidden" name="client_id" value={id} />
                <input type="hidden" name="token_id" value={semrushToken.id} />

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                    Site Audit project ID
                  </label>
                  <input
                    type="number"
                    name="site_audit_project_id"
                    defaultValue={m.site_audit_project_id}
                    placeholder="e.g. 1234567"
                    className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
                    From SEMrush → Projects → {client.company_name} → Site Audit. URL ends in /projects/&lt;ID&gt;/siteaudit. Drives the Site Health card.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                    Position Tracking campaign ID
                  </label>
                  <input
                    type="number"
                    name="position_tracking_campaign_id"
                    defaultValue={m.position_tracking_campaign_id}
                    placeholder="e.g. 1234567"
                    className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
                    From SEMrush → Projects → Position Tracking. Drives the Visibility card.
                  </p>
                </div>

                <div className="border-t border-[var(--color-border)] pt-4">
                  <p className="text-[11px] text-[var(--color-text-subtle)] mb-3">
                    Manual snapshot overrides. Copy the numbers straight from the
                    SEMrush One UI for {client.company_name}. The next sync writes
                    each as today&apos;s value. Use these when the corresponding
                    project / campaign ID above isn&apos;t set.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                        AI Visibility
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="ai_visibility_value"
                        defaultValue={m.ai_visibility_value}
                        placeholder="e.g. 16"
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                        Mentions
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="mentions_value"
                        defaultValue={m.mentions_value}
                        placeholder="e.g. 51"
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                        Site Health (%)
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="site_health_value"
                        defaultValue={m.site_health_value}
                        placeholder="e.g. 80"
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                        Visibility (%)
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="visibility_value"
                        defaultValue={m.visibility_value}
                        placeholder="e.g. 3.32"
                        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
