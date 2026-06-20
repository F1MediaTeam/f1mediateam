import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { todayIso } from "@/lib/utils";

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 2).replace(/\.00$/, "")}K`;
  return String(Math.round(n));
}

// Sum a metric over [from, to] inclusive (YYYY-MM-DD strings).
function sumWindow(series: { captured_at: string; value: number }[], from: string, to: string): number {
  return series.filter((s) => s.captured_at >= from && s.captured_at <= to).reduce((a, s) => a + Number(s.value), 0);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function PresentationBuilder({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const client = await data.getClient(id);
  if (!client) return null;

  // Pre-fill GSC: last 28 days vs the previous 28 days.
  const [impr, clicks] = await Promise.all([
    data.listSnapshots({ clientId: id, metric: "impressions" }),
    data.listSnapshots({ clientId: id, metric: "clicks" }),
  ]);
  const today = todayIso("America/Los_Angeles");
  const curFrom = shiftDays(today, -27);
  const prevFrom = shiftDays(today, -55);
  const prevTo = shiftDays(today, -28);
  const imprCur = compact(sumWindow(impr, curFrom, today));
  const imprPrev = compact(sumWindow(impr, prevFrom, prevTo));
  const clicksCur = compact(sumWindow(clicks, curFrom, today));

  const fieldCls =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
  const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

  return (
    <AdminShell session={session} active="/admin/clients">
      <div className="px-8 py-8 max-w-4xl">
        <Link href={`/admin/clients/${id}`} className="text-xs text-[var(--color-text-muted)] hover:text-white">
          ← Back to {client.company_name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2 mb-1">Meeting deck</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          Fill in this meeting&apos;s writeup. GSC numbers are pre-filled from {client.company_name}&apos;s data — edit
          anything, then generate a branded slide deck (PDF). Leave a section blank to skip its slide.
        </p>

        {/* Native POST → returns the PDF in a new tab. */}
        <form action={`/api/presentation/${id}`} method="post" target="_blank" className="space-y-6">
          <Card>
            <CardHeader title="Cover & brand" />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Meeting date</label>
                  <input type="date" name="meeting_date" defaultValue={today} className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Brand accent</label>
                  <input type="color" name="accent" defaultValue="#14B8A6" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
                </div>
                <div>
                  <label className={labelCls}>Logo URL (optional)</label>
                  <input type="url" name="logo_url" placeholder="https://…/logo.png" className={fieldCls} />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Narrative slides" subtitle="One slide each — paste your writeup; blank lines = new paragraph" />
            <CardBody className="space-y-4">
              {[
                ["social", "Social Presence & Optimization"],
                ["flyers", "Recent Posts & Flyers"],
                ["insights", "Insights & Content Optimization Process"],
                ["backlinks", "Photo & Backlink Optimization Process"],
                ["pages", "Pages & Posting Optimization Process"],
                ["ranking", "Webpage Ranking"],
                ["recommendation", "What's Next — Recommendation"],
              ].map(([name, label]) => (
                <div key={name}>
                  <label className={labelCls}>{label}</label>
                  <textarea name={name} rows={4} className={fieldCls} />
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="GSC — Last 28 Days" subtitle="Pre-filled from data; edit as needed" />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Impressions — previous</label>
                  <input name="gsc_impr_prev" defaultValue={imprPrev} className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Impressions — current</label>
                  <input name="gsc_impr_cur" defaultValue={imprCur} className={fieldCls} />
                </div>
                <div>
                  <label className={labelCls}>Organic clicks</label>
                  <input name="gsc_clicks" defaultValue={clicksCur} className={fieldCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>GSC note</label>
                <textarea name="gsc_note" rows={3} className={fieldCls} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lists" subtitle="One item per line" />
            <CardBody className="space-y-4">
              <div>
                <label className={labelCls}>What&apos;s Next (bullets)</label>
                <textarea name="whats_next" rows={5} className={fieldCls} placeholder={"Ongoing Page Optimization\nAuthority Building & Internal Linking\nLocal Visibility Expansion"} />
              </div>
              <div>
                <label className={labelCls}>Draft Pages (one URL per line)</label>
                <textarea name="draft_pages" rows={5} className={fieldCls} placeholder={"https://example.com/page-one\nhttps://example.com/page-two"} />
              </div>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" className="px-8">Generate deck (PDF)</Button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
