"use client";

// "+ Add" calendar event modal for admins. Same UX as the client one but
// includes a client picker (plus an "F1 Media internal" sentinel) and posts
// to the admin createCalendarAction. Centered popup, dim backdrop, closes on
// Escape / backdrop click / submit.

import { APP_TZ_LABEL } from "@/lib/timezone";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import FileDropZone from "@/components/shared/FileDropZone";
import type { AssignablePerson } from "@/lib/types";

interface ClientOption {
  id: string;
  company_name: string;
}

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  clients: ClientOption[];
  /** everyone who can be cc'd / assigned (admins + client users) */
  people?: AssignablePerson[];
}

export default function AdminCalendarAddModal({ action, clients, people = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");

  const shownPeople = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    return q ? people.filter((p) => p.label.toLowerCase().includes(q)) : people;
  }, [people, peopleQuery]);

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
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] px-3 h-9 text-sm font-medium hover:opacity-90 transition"
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

            <form action={action} onSubmit={() => setOpen(false)} className="space-y-3.5" encType="multipart/form-data">
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
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                  Starts — Phoenix time ({APP_TZ_LABEL})
                </span>
                <input name="starts_at" type="datetime-local" required className={field} />
              </label>
              <input
                name="url"
                type="url"
                placeholder="Link (e.g. Google Meet, Zoom, or docs URL)"
                className={field}
              />
              <textarea name="notes" rows={3} placeholder="Notes (optional)" className={field} />

              {people.length > 0 ? (
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                    Assign / cc (they&apos;ll get a notification)
                  </label>
                  <input
                    value={peopleQuery}
                    onChange={(e) => setPeopleQuery(e.target.value)}
                    placeholder="Search people…"
                    className={field + " mb-2"}
                  />
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-2">
                    {shownPeople.length === 0 ? (
                      <div className="px-1 py-2 text-xs text-[var(--color-text-subtle)]">No matches.</div>
                    ) : (
                      shownPeople.map((p) => (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--color-bg-hover)]"
                        >
                          <input
                            type="checkbox"
                            name="assignee_ids"
                            value={p.id}
                            className="accent-[var(--color-accent)]"
                          />
                          <span className="truncate">{p.label}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Attachments (optional)
                </label>
                <FileDropZone label="Drag files or photos here, or click to browse" />
              </div>
              <Button type="submit" className="w-full">Add to calendar</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
