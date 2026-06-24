"use client";

// "+ Add" calendar event modal for admins. Same UX as the client one but
// includes a client picker (plus an "F1 Media internal" sentinel) and posts
// to the admin createCalendarAction. Centered popup, dim backdrop, closes on
// Escape / backdrop click / submit.

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

export default function AdminCalendarAddModal({ action, clients }: Props) {
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
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] text-black px-3 h-9 text-sm font-medium hover:opacity-90 transition"
      >
        + Add
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
              <h3 className="text-lg font-semibold">Add to calendar</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition"
              >
                ×
              </button>
            </div>

            <form action={action} onSubmit={() => setOpen(false)} className="space-y-3.5">
              <select name="client_id" defaultValue="internal" className={field} required>
                <option value="internal">F1 Media (internal)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
              <input name="title" required placeholder="Title" className={field} />
              <select name="type" defaultValue="meeting" className={field}>
                <option value="meeting">Meeting</option>
                <option value="deadline">Deadline</option>
              </select>
              <input name="starts_at" type="datetime-local" required className={field} />
              <textarea name="notes" rows={3} placeholder="Notes (optional)" className={field} />
              <Button type="submit" className="w-full">Add to calendar</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
