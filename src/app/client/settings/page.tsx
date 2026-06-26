import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { setEmailPrefAction } from "../actions";
import Time from "@/components/shared/Time";
import { formatLocation } from "@/lib/utils";
import PasswordChangeForm from "@/components/client/PasswordChangeForm";
import ProfileForm from "@/components/client/ProfileForm";
import ClientOnboardingPanel from "@/components/admin/ClientOnboardingPanel";
import OnboardingDownloadsCard from "@/components/client/OnboardingDownloadsCard";

export default async function ClientSettings() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const [pref, audit, clientUser, allFiles] = await Promise.all([
    data.getEmailPref(session.user_id),
    // Filter by client_id — admin view-as never leaks into this list.
    data.listAudit({ clientId: session.client_id!, limit: 12 }),
    // The CUSTOMER-side user assigned to this client. When an admin is
    // impersonating, session.user_id is the admin — this fetches the actual
    // client portal account so we show their email, not the impersonator's.
    data.getClientUser(session.client_id!),
    data.listFiles(session.client_id!),
  ]);
  const onboardingFiles = allFiles
    .filter((f) => f.category === "onboarding" || f.category === "onboarding-asset")
    .map((f) => ({
      id: f.id,
      filename: f.filename,
      category: f.category ?? null,
      size_bytes: f.size_bytes,
      created_at: f.created_at,
    }));

  return (
    <ClientShell session={session} client={client} active="/client/settings">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Settings</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Account preferences</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Profile" subtitle="Your business name and account email" />
          <CardBody>
            <ProfileForm
              initialCompanyName={client.company_name}
              accountEmail={clientUser?.email ?? null}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Password" subtitle="Update the password you use to sign in" />
          <CardBody>
            <PasswordChangeForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Email" subtitle="Updates from your account manager" />
          <CardBody>
            <div className="text-sm text-[var(--color-text-muted)] mb-4">
              You are currently <span className={pref.opted_out ? "text-red-300" : "text-emerald-300"}>
                {pref.opted_out ? "opted out" : "subscribed"}
              </span>.
              {" "}Updated <Time iso={pref.updated_at} />.
            </div>
            <form action={setEmailPrefAction}>
              <input type="hidden" name="opted_out" value={pref.opted_out ? "false" : "true"} />
              <Button variant={pref.opted_out ? "primary" : "secondary"} type="submit">
                {pref.opted_out ? "Re-subscribe" : "Opt out of marketing email"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sign-in history" subtitle="Latest 12 sign-ins to your portal" />
          <CardBody className="space-y-1.5">
            {audit.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)]">No history yet.</div>
            ) : (
              audit.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs">
                  <span className="font-mono"><Time iso={a.logged_in_at} /></span>
                  <span className="text-[var(--color-text-muted)]">{formatLocation(a)}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <OnboardingDownloadsCard files={onboardingFiles} />
        <ClientOnboardingPanel clientId={client.id} />
      </div>
    </ClientShell>
  );
}
