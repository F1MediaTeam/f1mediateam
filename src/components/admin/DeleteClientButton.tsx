"use client";

import { deleteClientAction } from "@/app/admin/actions";

export default function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  return (
    <form
      action={deleteClientAction}
      onSubmit={(e) => {
        const input = window.prompt(
          `This will permanently delete "${clientName}" and ALL their data ` +
            `(tasks, calendar, content, files, snapshots, audit, connectors).\n\n` +
            `Type DELETE to confirm.`,
        );
        if (input !== "DELETE") {
          e.preventDefault();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="id" value={clientId} />
      <input type="hidden" name="confirm" value="DELETE" />
      <button
        type="submit"
        title={`Delete ${clientName}`}
        aria-label={`Delete ${clientName}`}
        className="h-8 w-8 grid place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)]/90 backdrop-blur text-[var(--color-text-muted)] hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 transition opacity-70 group-hover:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M3 3 L11 11 M11 3 L3 11"/>
        </svg>
      </button>
    </form>
  );
}
