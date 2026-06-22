// AI Meeting deck generator — the 3-box version.
//
// One page, three controls:
//   1. Client (select)
//   2. Time frame (preset / custom date range)
//   3. Generate (button) → submits to /api/meeting-deck → returns a PDF the
//      browser downloads as an attachment.
//
// The route handler does the heavy lifting: gathers the client's data, calls
// Claude to write the narrative slides, and feeds the result into the same
// presentation-pdf builder the manual flow used.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { aiConfigured } from "@/lib/deck/ai-narrative";
import { gammaConfigured } from "@/lib/connectors/gamma";

export default async function MeetingDeck({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const clients = await data.listClients();
  const defaultClient = sp.client && clients.some((c) => c.id === sp.client)
    ? sp.client
    : clients[0]?.id ?? "";

  const fieldCls =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
  const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

  const aiOk = aiConfigured();
  const gammaOk = gammaConfigured();

  return (
    <AdminShell session={session} active="/admin/meeting-deck">
      <div className="px-8 py-10 max-w-3xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Meeting deck
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Generate a client deck</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-3 max-w-xl">
            Pick a company, pick the time frame to pull data from, click Generate.
            Claude writes the narrative slides from that client&apos;s posted content,
            GSC numbers, drafts, and open tasks. The PDF downloads when it&apos;s ready
            — usually 15–30 seconds.
          </p>
        </div>

        {!aiOk ? (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm px-4 py-3">
            <strong>ANTHROPIC_API_KEY</strong> is not set on this environment.
            Generation will fail until you add it under Vercel → Project Settings
            → Environment Variables (uncheck &quot;Sensitive&quot; so the build
            picks it up).
          </div>
        ) : null}

        <form
          action="/api/meeting-deck"
          method="post"
          target="_blank"
          className="space-y-6"
        >
          <Card>
            <CardHeader title="Inputs" />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Company</label>
                  <select name="client_id" required defaultValue={defaultClient} className={fieldCls}>
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

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Custom from (only if &quot;Custom range&quot;)</label>
                  <input type="date" name="from" className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Custom to</label>
                  <input type="date" name="to" className={fieldCls} />
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--color-border)] pt-5">
                <details className="text-xs text-[var(--color-text-muted)]">
                  <summary className="cursor-pointer">Brand options (optional)</summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Accent color</label>
                      <input type="color" name="accent" defaultValue="#14B8A6" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Logo URL</label>
                      <input type="url" name="logo_url" placeholder="https://…/logo.png" className={fieldCls} />
                    </div>
                  </div>
                </details>
              </div>
            </CardBody>
          </Card>

          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="text-xs text-[var(--color-text-muted)]">
              Generation typically takes 15–30 seconds — the file downloads when it&apos;s ready.
            </div>
            <div className="flex gap-3">
              {gammaOk ? (
                <Button type="submit" name="output" value="gamma" variant="secondary" className="px-6">
                  Open in Gamma
                </Button>
              ) : null}
              <Button type="submit" name="output" value="pdf" className="px-8">
                Generate &amp; download
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
