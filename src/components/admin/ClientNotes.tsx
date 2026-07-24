"use client";

// Admin-only internal notes on a client. Autosaves on blur and shows a saved
// stamp, so it feels like a scratchpad rather than a form to remember to
// submit. Never rendered anywhere in the client portal.

import { useState, useTransition } from "react";
import { saveClientNotesAction } from "@/app/admin/actions";

export default function ClientNotes({
  clientId,
  initial,
}: {
  clientId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();

  function save() {
    if (value === saved) return;
    setStatus("saving");
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("notes", value);
    startTransition(async () => {
      await saveClientNotesAction(fd);
      setSaved(value);
      setStatus("saved");
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Internal notes · admin only
        </span>
        <span className="text-[10px] text-[var(--color-text-subtle)]">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Autosaves when you click away"}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
        }}
        onBlur={save}
        rows={5}
        placeholder="Call notes, account context, renewal dates — anything the client never sees."
        className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50"
      />
    </div>
  );
}
