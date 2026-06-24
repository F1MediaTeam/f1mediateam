import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { CardBody, CardHeader, Stat } from "@/components/ui";
import { formatPercentChange, formatNumber } from "@/lib/utils";
import { createClientAction } from "../actions";
import Time from "@/components/shared/Time";
import DeleteClientButton from "@/components/admin/DeleteClientButton";
import AdminClientAddModal from "@/components/admin/AdminClientAddModal";
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
  const [baselineClicks, latestClicks, baselineSess, latestSess] = await Promise.all([
    data.getBaseline(c.id, "clicks"),
    data.getLatest(c.id, "clicks"),
    data.getBaseline(c.id, "sessions"),
    data.getLatest(c.id, "sessions"),
  ]);

  const clicksChange =
    baselineClicks && latestClicks
      ? formatPercentChange(baselineClicks.value, latestClicks.value)
      : null;
  const sessChange =
    baselineSess && latestSess
      ? formatPercentChange(baselineSess.value, latestSess.value)
      : null;

  return (
    <div className="group relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-hover)] transition shadow-lg shadow-black/20">
      <Link href={`/admin/clients/${c.id}`} className="block">
        <CardHeader
          title={c.company_name}
          subtitle={<>Joined <Time iso={c.join_date} dateOnly /></>}
        />
        <CardBody>
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
            <span>{c.websites[0] ?? ""}</span>
            <span className="text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition">
              Open →
            </span>
          </div>
        </CardBody>
      </Link>
      <div className="absolute top-4 right-4">
        <DeleteClientButton clientId={c.id} clientName={c.company_name} />
      </div>
    </div>
  );
}
