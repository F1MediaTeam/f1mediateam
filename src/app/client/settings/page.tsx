import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { setEmailPrefAction } from "../actions";
import { signOutAction } from "@/app/login/actions";
import Time from "@/components/shared/Time";
import OnboardingDownloadsCard from "@/components/client/OnboardingDownloadsCard";
import SignInHistoryCard from "@/components/client/SignInHistoryCard";

export default async function ClientSettings() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const [pref, audit, clientUser, onboarding] = await Promise.all([
    data.getEmailPref(session.user_id),
    // Filter by client_id — admin view-as never leaks into this list.
    data.listAudit({ clientId: session.client_id!, limit: 500 }),
    // The CUSTOMER-side user assigned to this client. When an admin is
    // impersonating, session.user_id is the admin — this fetches the actual
    // client portal account so we show their email, not the impersonator's.
    data.getClientUser(session.client_id!),
    data.getOnboarding(session.client_id!),
  ]);

  return (
    <ClientShell session={session} client={client} active="/client/settings">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Settings</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Account preferences</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="Account"
            subtitle="Your portal account details. Contact your F1 Media account manager to change any of these."
          />
          <CardBody className="space-y-4">
            <ReadOnlyField label="Business name" value={client.company_name} />
            <ReadOnlyField label="Account email" value={clientUser?.email ?? "—"} />
            <ReadOnlyField label="Password" value={"•".repeat(12)} mono />
            <div className="flex justify-end pt-2">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg border border-red-600 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 hover:border-red-700 transition-colors"
                >
                  Sign out
                </button>
              </form>
            </div>
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

      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <SignInHistoryCard audit={audit} />
        <OnboardingDownloadsCard
          hasOnboarding={Boolean(onboarding)}
          clientName={client.company_name}
          submittedAt={onboarding?.submitted_at ?? null}
        />
      </div>

    </ClientShell>
  );
}

function ReadOnlyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
        {label}
      </div>
      <div
        className={
          "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-sm text-[var(--color-text)] select-none" +
          (mono ? " font-mono tracking-[0.2em]" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
