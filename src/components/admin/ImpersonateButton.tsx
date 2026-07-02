"use client";

import { useTransition } from "react";
import { startImpersonateAction } from "@/app/admin/actions";

export default function ImpersonateButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [pending] = useTransition();
  return (
    <form
      action={startImpersonateAction}
      onSubmit={(e) => {
        if (!window.confirm(
          `Open ${clientName}'s dashboard as them?\n\n` +
          `Actions you take while viewing as ${clientName} are logged. ` +
          `${clientName}'s settings page will show that admin accessed their account.`,
        )) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 text-[var(--color-accent)] px-4 py-2 text-sm font-medium transition disabled:opacity-60"
      >
        {pending ? "Opening…" : "View as customer →"}
      </button>
    </form>
  );
}
