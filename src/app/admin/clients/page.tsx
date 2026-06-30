import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { createClientAction } from "../actions";
import Time from "@/components/shared/Time";
import DeleteClientButton from "@/components/admin/DeleteClientButton";
import AdminClientAddModal from "@/components/admin/AdminClientAddModal";
import { getClientBrandLogoUrlsByClients, type ClientLogoUrls } from "@/lib/client-logo";
import type { Client } from "@/lib/types";

export default async function AdminClients() {
  const session = await requireAdmin();
  const clients = await data.listClients();
  // Batched: one files query for every client logo instead of N parallel
  // per-card queries. Signed URLs still happen per file but in parallel.
  const logosByClient = await getClientBrandLogoUrlsByClients(
    clients.map((c) => ({ id: c.id, company_name: c.company_name })),
  );

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
          {clients.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              logos={logosByClient.get(c.id) ?? { dark: null, light: null }}
            />
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

function ClientCard({ client: c, logos }: { client: Client; logos: ClientLogoUrls }) {

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

        <div className="my-5 flex h-40 items-center justify-center px-2">
          {logos.dark || logos.light ? (
            <>
              {logos.dark ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logos.dark}
                  alt={`${c.company_name} logo`}
                  className="logo-dark max-h-full max-w-full object-contain"
                />
              ) : null}
              {logos.light ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logos.light}
                  alt={`${c.company_name} logo`}
                  className="logo-light max-h-full max-w-full object-contain"
                />
              ) : null}
            </>
          ) : (
            <div className="text-2xl font-semibold tracking-tight text-center">
              {c.company_name}
            </div>
          )}
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
