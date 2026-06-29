// Standalone, no-auth preview of the onboarding wizard. Renders the popup
// in preview mode (Submit is a no-op). Visit at /onboarding-preview — no
// login, no client data touched. Useful for iterating on the form locally
// (`npm run dev` → http://localhost:3000/onboarding-preview).

import { DISCLAIMER_VERSION } from "@/lib/types";
import OnboardingGate from "@/components/client/OnboardingGate";

export const dynamic = "force-static";

export default function OnboardingPreview() {
  return (
    <>
      <div className="fixed top-3 left-3 z-[60] flex items-center gap-2 rounded-full border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-700 backdrop-blur">
        <span className="rounded-full bg-amber-400/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest">Preview</span>
        Onboarding wizard · submit is a no-op
      </div>
      <OnboardingGate version={DISCLAIMER_VERSION} userName="Preview User" preview />
    </>
  );
}
