import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import Time from "@/components/shared/Time";
import { formatLocation } from "@/lib/utils";

interface ActivityRow {
  id: string;
  ts: string;
  kind: "admin_login" | "view_as";
  client_id: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  active?: boolean; // for view-as that hasn't ended yet
}

export default async function AdminAudit() {
  const session = await requireAdmin();

  const [allLogins, myImpersonations, clients] = await Promise.all([
    data.listAudit(),
    data.listImpersonations({ adminId: session.user_id, limit: 200 }),
    data.listClients(),
  ]);

  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.company_name ?? "—" : "—";

  // My own activity = my login_audit rows + my view-as sessions, merged.
  const myLogins = allLogins.filter((r) => r.user_id === session.user_id);
  const myActivity: ActivityRow[] = [
    ...myLogins.map((r) => ({
      id: "L" + r.id,
      ts: r.logged_in_at,
      kind: "admin_login" as const,
      client_id: null,
      city: r.city,
      region: r.region,
      country: r.country,
    })),
    ...myImpersonations.map((r) => ({
      id: "V" + r.id,
      ts: r.started_at,
      kind: "view_as" as const,
      client_id: r.client_id,
      city: r.city,
      region: r.region,
      country: r.country,
      active: !r.ended_at,
    })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  // Client-side sign-ins (everyone else) — admin still sees these for visibility.
  const clientLogins = allLogins.filter((r) => r.user_id !== session.user_id);

  return (
    <AdminShell session={session} active="/admin/audit">
      <div className="px-8 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Audit</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Activity log</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Your own admin sign-ins and view-as sessions are at the top. Client portal sign-ins are listed below.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader
            title="My activity"
            subtitle={`${myActivity.length} events — admin sign-ins + view-as customer sessions`}
          />
          <CardBody>
            {myActivity.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)] py-4 text-center">
                Nothing recorded yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Side</th>
                    <th className="py-2 pr-4">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {myActivity.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        <Time iso={r.ts} />
                      </td>
                      <td className="py-2.5 pr-4">
                        {r.kind === "admin_login" ? (
                          <Pill>Sign-in</Pill>
                        ) : (
                          <Pill tone="accent">
                            View-as{r.active ? " · active" : ""}
                          </Pill>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {r.kind === "admin_login"
                          ? "Admin dashboard"
                          : clientName(r.client_id)}
                      </td>
                      <td className="py-2.5 pr-4">{formatLocation(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Client sign-ins"
            subtitle={`${clientLogins.length} events — every successful customer sign-in`}
          />
          <CardBody>
            {clientLogins.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)] py-4 text-center">
                No client sign-ins yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {clientLogins.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs"><Time iso={r.logged_in_at} /></td>
                      <td className="py-2.5 pr-4">{clientName(r.client_id)}</td>
                      <td className="py-2.5 pr-4">{formatLocation(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
