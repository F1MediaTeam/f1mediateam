"use client";

// "Request changes" modal — replaces an Approve with a structured ask:
//   - the card's existing details (title / body / link) shown read-only
//   - big textarea for the change request
//   - drag-and-drop attachment zone (FileDropZone)
// Posts to requestChangesAction with id, note, attachments[].

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import FileDropZone from "@/components/shared/FileDropZone";

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  card: {
    id: string;
    title: string;
    body?: string | null;
    link?: string | null;
  };
}

export default function RequestChangesModal({ action, card }: Props) {
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
        className="inline-flex flex-1 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-transparent hover:bg-[var(--color-bg-hover)] px-3 h-8 text-xs font-medium text-[var(--color-text)] transition"
      >
        Request changes
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-xl rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] p-6 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Request changes</h3>
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
              Send this back to the F1 Media team with a note on what to change.
            </p>

            {/* Read-only card details */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-3 mb-4">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">Content</div>
              <div className="mt-1 text-sm font-medium text-[var(--color-text)]">{card.title}</div>
              {card.link ? (
                <a
                  href={card.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] text-[var(--color-accent)] hover:underline break-all"
                >
                  {card.link}
                </a>
              ) : null}
              {card.body ? (
                <div className="mt-2 text-xs text-[var(--color-text-muted)] whitespace-pre-wrap">{card.body}</div>
              ) : null}
            </div>

            <form action={action} onSubmit={() => setOpen(false)} className="space-y-3.5" encType="multipart/form-data">
              <input type="hidden" name="id" value={card.id} />
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  What needs to change?
                </label>
                <textarea
                  name="note"
                  required
                  rows={6}
                  placeholder="Be specific — what should we adjust, replace, or remove?"
                  className={field}
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Attachments
                </label>
                <FileDropZone
                  label="Drag files or photos here, or click to browse"
                  hint="Reference images, screenshots, revised copy — anything"
                />
              </div>
              <Button type="submit" className="w-full">Send change request</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
