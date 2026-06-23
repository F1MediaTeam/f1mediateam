"use client";

// "+ Add client" modal. Same UX as the calendar modal but with client-specific
// fields. Posts to the admin createClientAction.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

interface Props {
  action: (formData: FormData) => void | Promise<void>;
}

export default function AdminClientAddModal({ action }: Props) {
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
        + Add client
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
              <h3 className="text-lg font-semibold">Add a new client</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-white transition"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Creates a new tenant. You can assign portal users to it from the client&apos;s profile page.
            </p>
            <form action={action} onSubmit={() => setOpen(false)} className="space-y-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Company name
                </label>
                <input name="company_name" required placeholder="e.g. Northwind Industries" className={field} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Join date
                </label>
                <input name="join_date" type="date" className={field} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Websites
                </label>
                <input name="websites" placeholder="northwind.com, blog.northwind.com" className={field} />
                <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">Comma-separated. Used by GSC + SEMrush connectors.</p>
              </div>
              <Button type="submit" className="w-full">Add client</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
