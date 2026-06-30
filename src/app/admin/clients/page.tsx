import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Stat } from "@/components/ui";
import { formatPercentChange, formatNumber } from "@/lib/utils";
import { createClientAction } from "../actions";
import Time from "@/components/shared/Time";
import DeleteClientButton from "@/components/admin/DeleteClientButton";
import AdminClientAddModal from "@/components/admin/AdminClientAddModal";
import { getClientBrandLogoUrl } from "@/lib/client-logo";
import type { Client } from "@/lib/types";

export default async function AdminClients() {
  const session = await requireAdmin();
  const clients = await data.listClients();

  return (
    <AdminShell session={session} active="/admin/clients">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl">
        <div className="mb-8 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Clients</div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">
              {clients.length} {clients.length === 1 ? "active company" : "active companies"}
            </h1>
          </div>
          <AdminClientAddModal action={createClientAction} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {clients.map((c) => <ClientCard key={c.id} client={c} />)}
        </div>
      </div>
    </AdminShell>
  );
}

async function ClientCard({ client: c }: { client: Client }) {
  const [baselineClicks, latestClicks, baselineSess, latestSess, logoUrl] = await Promise.all([
    data.getBaseline(c.id, "clicks"),
    data.getLatest(c.id, "clicks"),
    data.getBaseline(c.id, "sessions"),
    data.getLatest(c.id, "sessions"),
    getClientBrandLogoUrl(c.id),
  ]);

  const clicksChange =
    baselineClicks && latestClicks
      ? formatPercentChange(baselineClicks.value, latestClicks.value)
      : null;
  const sessChange =
    baselineSess && latestSess
      ? formatPercentChange(baselineSess.value, latestSess.value)
      : null;

  const website = c.websites[0] ?? "";
  const websiteLabel = website.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="group relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-hover)] transition shadow-lg shadow-black/20">
      <Link href={`/admin/clients/${c.id}`} className="block px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs text-[var(--color-text-muted)]">
            Joined <Time iso={c.join_date} dateOnly />
          </div>
          {/* Spacer matches the DeleteClientButton's hit target so the date doesn't slide under it. */}
          <div className="w-8" aria-hidden />
        </div>

        <div className="my-5 flex h-24 items-center justify-center">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={`${c.company_name} logo`}
              width={220}
              height={88}
              unoptimized
              className="max-h-24 w-auto object-contain"
            />
          ) : (
            <div className="text-2xl font-semibold tracking-tight text-center">
              {c.company_name}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Stat
            label="Clicks"
            value={formatNumber(latestClicks?.value ?? 0)}
            trend={clicksChange ? { direction: clicksChange.direction, label: clicksChange.label } : undefined}
            sub={`vs ${formatNumber(baselineClicks?.value ?? 0)} baseline`}
          />
          <Stat
            label="Sessions"
            value={formatNumber(latestSess?.value ?? 0)}
            trend={sessChange ? { direction: sessChange.direction, label: sessChange.label } : undefined}
            sub={`vs ${formatNumber(baselineSess?.value ?? 0)} baseline`}
          />
        </div>

        <div className="text-xs text-[var(--color-text-muted)] flex items-center justify-between">
          <span>{websiteLabel}</span>
          <span className="text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition">
            Open →
          </span>
        </div>
      </Link>
      <div className="absolute top-4 right-4">
        <DeleteClientButton clientId={c.id} clientName={c.company_name} />
      </div>
    </div>
  );
}
