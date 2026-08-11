// The branded client report — a month on one page, built to print.
//
// Deliberately plain: no tabs, no controls, nothing interactive. Ctrl-P gives a
// clean PDF with the wordmark on top and "Prepared by F1 Media Team" at the
// bottom. No third-party provider is named anywhere on it.

import { notFound } from "next/navigation";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { clientColor } from "@/lib/client-color";
import { visibleClientIds } from "@/lib/permissions.server";
import { getSite } from "@/lib/pulse/sites";
import { backlinkPanel, healthPanel, rankPanel, trafficPanel } from "@/lib/pulse/dashboard";

export const dynamic = "force-dynamic";

const CONVERSION_LABEL: Record<string, string> = {
  tel_click: "Phone taps",
  mailto_click: "Email clicks",
  outbound_click: "Outbound clicks",
  form_submit: "Form submissions",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function PulseReportPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireAdmin();
  const { siteId } = await params;

  const site = await getSite(siteId);
  if (!site) notFound();
  const allowed = await visibleClientIds(session);
  if (allowed !== null && !allowed.includes(site.client_id)) notFound();

  const clients = await data.listClients();
  const client = clients.find((c) => c.id === site.client_id);
  const colour = client ? clientColor(client) : null;

  const [traffic, ranks, backlinks, health] = await Promise.all([
    trafficPanel(siteId, "30d"),
    rankPanel(siteId),
    backlinkPanel(siteId),
    healthPanel(siteId),
  ]);

  const period = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const movers = ranks
    .filter((r) => r.position !== null && r.previous !== null && r.previous !== r.position)
    .map((r) => ({ ...r, delta: (r.previous as number) - (r.position as number) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 10);
  const blockedBots = health.bots.filter((b) => !b.allowed);

  return (
    <div className="mx-auto max-w-[840px] bg-[var(--color-bg-card)] px-8 py-10 print:max-w-none print:px-0">
      <header className="mb-8 flex items-end justify-between gap-4 border-b-2 pb-5" style={{ borderColor: colour?.hex ?? "var(--color-accent)" }}>
        <div>
          <span className="relative block h-8 w-[130px]">
            <Image src="/logo.png" alt="F1 Media Team" fill sizes="130px" className="logo-dark object-contain object-left" />
            <Image src="/logo-light.png" alt="F1 Media Team" fill sizes="130px" className="logo-light object-contain object-left" />
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{client?.company_name}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{site.domain}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Reporting period</div>
          <div className="text-sm font-semibold">{period}</div>
          <div className="mt-1 text-[10px] text-[var(--color-text-subtle)]">Last 30 days</div>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Traffic</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Visitors" value={traffic.totals.visitors} />
          <Stat label="Pageviews" value={traffic.totals.pageviews} />
          <Stat label="Sessions" value={traffic.totals.sessions} />
          <Stat label="Avg. engagement" value={`${traffic.totals.avgEngagementSec}s`} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Enquiries</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {traffic.conversions.map((c) => (
            <Stat key={c.kind} label={CONVERSION_LABEL[c.kind] ?? c.kind} value={c.count} />
          ))}
        </div>
      </section>

      {movers.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Ranking movement</h2>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                <th className="pb-2 font-normal">Keyword</th>
                <th className="pb-2 text-right font-normal">Was</th>
                <th className="pb-2 text-right font-normal">Now</th>
                <th className="pb-2 text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {movers.map((r) => (
                <tr key={r.keywordId} className="border-t border-[var(--color-border)]">
                  <td className="py-1.5">{r.phrase}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--color-text-muted)]">{r.previous}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{r.position}</td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: r.delta > 0 ? "var(--color-ok)" : "var(--color-bad)" }}>
                    {r.delta > 0 ? "↑" : "↓"}{Math.abs(r.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Backlinks</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Live" value={backlinks.total} />
            <Stat label="New" value={backlinks.fresh.length} />
            <Stat label="Lost" value={backlinks.lost.length} />
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Site health</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Errors" value={health.counts.errors} />
            <Stat label="Warnings" value={health.counts.warnings} />
            <Stat label="Pages" value={String(health.crawl?.pages_crawled ?? 0)} />
          </div>
        </div>
      </section>

      {health.bots.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            AI and search crawler access
          </h2>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {blockedBots.length === 0
              ? `All ${health.bots.length} tracked search and AI crawlers can reach this site.`
              : `${blockedBots.length} of ${health.bots.length} crawlers are blocked: ${blockedBots.map((b) => String(b.bot)).join(", ")}.`}
          </p>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-[var(--color-border)] pt-4 text-[11px] text-[var(--color-text-subtle)]">
        Prepared by F1 Media Team · {period} · {site.domain}
      </footer>
    </div>
  );
}
