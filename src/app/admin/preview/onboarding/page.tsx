// Standalone preview of the onboarding wizard for testing/iteration.
// Admin-only. Renders OnboardingGate in preview mode: every field works,
// red-outline validation runs, but Submit doesn't write to the database —
// it logs the captured payload to the browser console + shows an alert.
//
// Open at /admin/preview/onboarding from production or `npm run dev`.

import { requireAdmin } from "@/lib/auth/session";
import { DISCLAIMER_VERSION } from "@/lib/types";
import OnboardingGate from "@/components/client/OnboardingGate";

export const dynamic = "force-dynamic";

export default async function PreviewOnboarding() {
  const session = await requireAdmin();

  return (
    <>
      {/* Small toolbar to make it obvious this is the preview, with a quick
          link back to /admin. The OnboardingGate is fixed/inset-0, so this
          sits on top of the gate's backdrop in the top-left corner. */}
      <div
        className="fixed top-3 left-3 z-[60] flex items-center gap-2 rounded-full border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-200 backdrop-blur"
      >
        <span className="rounded-full bg-amber-400/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest">Preview</span>
        Onboarding wizard · submit is a no-op
        <a href="/admin" className="ml-2 underline hover:text-white">← Exit</a>
      </div>

      <OnboardingGate version={DISCLAIMER_VERSION} userName={session.full_name ?? session.email} preview />
    </>
  );
}
