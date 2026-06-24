"use client";

// "+ Add content" modal for admins. Drafts a new content card in the
// "Proposed" stage that the client then approves.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

interface ClientOption {
  id: string;
  company_name: string;
}

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  clients: ClientOption[];
}

export default function AdminContentAddModal({ action, clients }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] text-black px-4 h-9 text-sm font-medium hover:opacity-90 transition"
      >
        + Add content
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] p-6 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">New content card</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Drafted by you, sent to the client as <strong>Proposed</strong>.
            </p>
            <form action={action} onSubmit={() => setOpen(false)} className="space-y-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Client
                </label>
                <select name="client_id" required defaultValue={clients[0]?.id ?? ""} className={field}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Title
                </label>
                <input name="title" required placeholder="What is this content?" className={field} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Link (optional)
                </label>
                <input name="link" placeholder="https://…" className={field} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Notes / body
                </label>
                <textarea name="body" rows={4} placeholder="What's in this card? What should the client see?" className={field} />
              </div>
              <Button type="submit" className="w-full">Add content</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
