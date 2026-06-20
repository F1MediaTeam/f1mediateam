import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { DISCLAIMER_VERSION } from "@/lib/types";
import OnboardingGate from "@/components/client/OnboardingGate";
import { signOutAction } from "@/app/login/actions";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "client") redirect("/admin");

  // Signed in but not yet assigned to a company — show a pending message
  // rather than looping back to login.
  if (!session.client_id) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="text-xs font-mono uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
            Account pending
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            You don't have a company assigned yet
          </h1>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Your account manager needs to link your sign-in to a client company.
            Once that's done, refresh this page to see your dashboard.
          </p>
          <form action={signOutAction} className="mt-6">
            <button className="text-xs text-[var(--color-text-muted)] hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  // While impersonating, don't show the onboarding gate to the admin.
  if (session.is_impersonating) {
    return <>{children}</>;
  }

  const accepted = await data.hasAcceptedDisclaimer(session.user_id, DISCLAIMER_VERSION);
  return (
    <>
      {!accepted ? (
        <OnboardingGate
          version={DISCLAIMER_VERSION}
          userName={session.full_name ?? session.email}
        />
      ) : null}
      {children}
    </>
  );
}
