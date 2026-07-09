import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { signOutAction } from "@/app/login/actions";
import { data } from "@/lib/data";
import Time from "@/components/shared/Time";
import DropdownCard from "@/components/shared/DropdownCard";
import { formatLocation } from "@/lib/utils";

export default async function AdminSettings() {
  const session = await requireAdmin();
  const audit = await data.listAudit({ userId: session.user_id, limit: 12 });

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

        <Card className="mb-6">
          <CardHeader
            title="Sync schedule"
            subtitle="When backend syncs run automatically"
          />
          <CardBody className="text-sm space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
              <div>Daily background sync</div>
              <span className="text-xs font-mono text-[var(--color-text-muted)]">09:00 UTC</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
              <div>On-visit freshen</div>
              <span className="text-xs text-[var(--color-text-muted)]">
                fires if connector stale &gt; 30 min
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-2">
              Want hourly background sync? Vercel Pro plan unlocks per-minute cron schedules.
            </div>
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardHeader title="Build" subtitle="Deployment metadata" />
          <CardBody className="text-sm space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
              <div>Domain</div>
              <span className="font-mono text-xs">f1mediateam.com</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
              <div>Environment</div>
              <span className="font-mono text-xs">{process.env.VERCEL_ENV ?? "development"}</span>
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
