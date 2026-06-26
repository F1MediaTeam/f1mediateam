// Reports page — F1 Media monthly .pptx generator.
//
// The legacy filter card, per-section PDF exports, historical metric table,
// and old Claude→Gamma meeting-deck form have been retired. This page is the
// single SOP entry point: pick a client + window, run the synthesis pipeline,
// download the on-brand PowerPoint deck.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { aiConfigured } from "@/lib/deck/ai-narrative";
import FieldyPanelButton from "@/components/admin/FieldyPanelButton";

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const clients = await data.listClients();
  const clientId = sp.client ?? clients[0]?.id ?? "";

  const aiOk = aiConfigured();
  const fieldCls = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
  const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

  return (
    <AdminShell session={session} active="/admin/reports">
      <div className="px-8 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Reports</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Monthly meeting deck</h1>
        </div>

        {!aiOk ? (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm px-4 py-3">
            <strong>ANTHROPIC_API_KEY</strong> is not set on this environment. The .pptx generator will fail until you add it under Vercel → Project Settings → Environment Variables.
          </div>
        ) : null}

        <Card className="mb-8">
          <CardHeader
            title="Generate F1 monthly .pptx"
            subtitle="The SOP path: structured Supabase data + Fieldy transcript → Claude synthesis → on-brand PowerPoint deck. Saves a copy to client-attachments."
          />
          <CardBody>
            <form action="/api/monthly-report" method="post" target="_blank" className="space-y-5">
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
                  <select name="tier" defaultValue="1" className={fieldCls}>
                    <option value="1">1 — Foundation Visibility (10 slides)</option>
                    <option value="2">2 — Growth &amp; Authority (11)</option>
                    <option value="3">3 — Market Domination (12)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Brand key</label>
                  <input type="text" name="brand_key" placeholder="bucketsofink, precisiongraphics, skabelund, f1, default…" className={fieldCls} />
                  <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">
                    Looks up colors + fonts in <code>brand-configs.json</code>. Leave blank to derive from the company name.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Industry</label>
                  <input type="text" name="industry" placeholder="DTF &amp; Embroidery Supplies / E-Commerce" className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Services</label>
                  <input type="text" name="services" placeholder="SEO, Web Dev, Backlink Management" className={fieldCls} />
                </div>
              </div>
              <details className="text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-4">
                <summary className="cursor-pointer">Brand overrides (optional — beats brand_key)</summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Primary</label>
                    <input type="color" name="brand_primary" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                  </div>
                  <div>
                    <label className={labelCls}>Secondary</label>
                    <input type="color" name="brand_secondary" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                  </div>
                  <div>
                    <label className={labelCls}>Tertiary</label>
                    <input type="color" name="brand_tertiary" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelCls}>Logo URL</label>
                    <input type="url" name="logo_url" placeholder="https://…/logo.png" className={fieldCls} />
                  </div>
                </div>
              </details>
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-end pt-2">
                <FieldyPanelButton />
                <Button type="submit" name="dryrun" value="1" variant="secondary" className="px-6">
                  Dry-run (return JSON)
                </Button>
                <Button type="submit" className="px-8">
                  Generate .pptx
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
