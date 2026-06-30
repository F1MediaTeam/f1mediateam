"use client";

import { useTransition } from "react";
import { reopenOnboardingAction } from "@/app/admin/actions";

export default function ReopenOnboardingButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => reopenOnboardingAction(fd))}
      onSubmit={(e) => {
        if (
          !confirm(
            `Re-open onboarding for ${clientName}? Their saved answers and submitted PDF will be cleared, and the onboarding wizard will appear next time they open the dashboard.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
      >
        {pending ? "Re-opening…" : "Re-open onboarding"}
      </button>
    </form>
  );
}
