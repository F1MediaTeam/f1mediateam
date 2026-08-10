import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { signOutAction } from "@/app/login/actions";
import { data } from "@/lib/data";
import Time from "@/components/shared/Time";
import DropdownCard from "@/components/shared/DropdownCard";
import { formatLocation } from "@/lib/utils";
import ThemePicker from "@/components/admin/ThemePicker";
import DefaultLookCard from "@/components/admin/DefaultLookCard";
import StaffTable from "@/components/admin/StaffTable";
import { canManageStaff, staffRoleOf } from "@/lib/permissions";
import { getDefaultTheme } from "@/lib/app-settings";

export default async function AdminSettings() {
  const session = await requireAdmin();
  const audit = await data.listAudit({ userId: session.user_id, limit: 12 });
  const defaultTheme = await getDefaultTheme();
  const [staff, clients, assignments, meProfile] = await Promise.all([
    data.listStaff(),
    data.listClients(),
    data.listAllAssignments(),
    data.getProfile(session.user_id),
  ]);
  // saved_at drives the "Restore" button's enabled state, so a look can't be
  // restored before one has been saved.
  let savedLookAt: string | null = null;
  try {
    savedLookAt = (await data.getUiDefault()).saved_at;
  } catch {
    savedLookAt = null;
  }

  return (
    <AdminShell session={session} active="/admin/settings">
      <div className="px-8 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Admin
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Settings</h1>
        </div>

        <Card className="mb-6">
          <CardHeader title="Account" subtitle="Your admin profile" />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Name
                </div>
                <div className="mt-1 font-medium">{session.full_name ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Email
                </div>
                <div className="mt-1 font-medium">{session.email}</div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Preferences — the home for per-person settings. Themes first; more
            will be added here as the console grows. */}
        <Card className="mb-6">
          <CardHeader
            title="Preferences"
            subtitle="How the console looks and behaves for you. Saved to this browser."
          />
          <CardBody>
            <div className="mb-3 text-sm font-medium">Theme</div>
            <ThemePicker defaultTheme={defaultTheme} />

            <div className="mt-6 border-t border-[var(--color-border)] pt-5">
              <div className="mb-1 text-sm font-medium">Saved look</div>
              <DefaultLookCard savedAt={savedLookAt} />
            </div>
          </CardBody>
        </Card>

        {/* Employees — who works here and what each of them can see. */}
        <Card className="mb-6">
          <CardHeader
            title="Employees"
            subtitle="Roles, and which clients each person can see"
          />
          <CardBody>
            <StaffTable
              staff={staff.map((p) => ({
                id: p.id,
                email: p.email,
                full_name: p.full_name,
                staff_role: p.staff_role ?? null,
              }))}
              clients={clients.map((c) => ({
                id: c.id,
                company_name: c.company_name,
                ui_color: c.ui_color ?? null,
              }))}
              assignments={assignments}
              canManage={canManageStaff(staffRoleOf(meProfile))}
              currentUserId={session.user_id}
            />
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardHeader
            title="Integrations"
            subtitle="Wired-up data sources used across all clients"
          />
          <CardBody>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
                <div>
                  <div className="font-medium">Google Search Console</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    OAuth client: f1mediateam-prod · scope: webmasters.readonly
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-up)]">
                  Configured
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
                <div>
                  <div className="font-medium">Google Analytics 4</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    Same OAuth client · scope: analytics.readonly
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-up)]">
                  Configured
                </span>
              </div>
            </div>
            <div className="mt-4 text-xs text-[var(--color-text-muted)]">
              Per-client connections live on each client&apos;s profile under{" "}
              <span className="text-[var(--color-text)]">Data connectors</span>.
            </div>
          </CardBody>
        </Card>

        <DropdownCard
          className="mb-6"
          title="Recent sign-ins"
          subtitle={`Latest ${audit.length} sign-ins to this admin account`}
        >
          {audit.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)]">No history yet.</div>
          ) : (
            <div className="space-y-1.5">
              {audit.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs">
                  <span className="font-mono"><Time iso={a.logged_in_at} /></span>
                  <span className="text-[var(--color-text-muted)]">{formatLocation(a)}</span>
                </div>
              ))}
            </div>
          )}
        </DropdownCard>

        <Card>
          <CardHeader title="Session" subtitle="Sign out of the admin console" />
          <CardBody>
            <form action={signOutAction}>
              <Button type="submit" variant="danger">Sign out</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
