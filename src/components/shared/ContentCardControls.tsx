"use client";

// Bundles together the per-card UI affordances that need React state:
//   - 3-dot menu in the top-right
//   - Edit modal (admin) or Request-Changes modal (client) launched from it
//   - The "Delete" action (admin) which submits a hidden form
//
// The page passes the card data + which role this user is + the right
// server actions; this component decides what items to show in the menu.

import { useEffect, useRef, useState } from "react";
import ContentActionsMenu, { type ActionItem } from "./ContentActionsMenu";

interface CardLite {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  stage: string;
}

interface Props {
  card: CardLite;
  role: "admin" | "client";
  // Bound to <form action={...}> server actions.
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction?: (formData: FormData) => void | Promise<void>; // admin only
  requestChangesAction?: (formData: FormData) => void | Promise<void>; // client only
}

export default function ContentCardControls({ card, role, updateAction, deleteAction, requestChangesAction }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement | null>(null);

  // Build the menu items. Admin has Edit + Delete. Client only sees the menu
  // on a proposed (awaiting-approval) card and can Request changes.
  const items: ActionItem[] = [];
  if (role === "admin") {
    items.push({ label: "Edit", onSelect: () => setEditOpen(true) });
    if (deleteAction) {
      items.push({
        label: "Delete",
        tone: "danger",
        onSelect: () => {
          if (typeof window !== "undefined" && !window.confirm("Delete this card?")) return;
          deleteFormRef.current?.requestSubmit();
        },
      });
    }
  } else {
    // Client side: only show menu on proposed cards.
    if (card.stage === "proposed" && requestChangesAction) {
      items.push({ label: "Request changes", onSelect: () => setRequestOpen(true) });
    }
  }

  return (
    <>
      <ContentActionsMenu items={items} />

      {/* Hidden delete form so the menu item can submit it via requestSubmit. */}
      {role === "admin" && deleteAction ? (
        <form ref={deleteFormRef} action={deleteAction} className="hidden">
          <input type="hidden" name="id" value={card.id} />
        </form>
      ) : null}

      {editOpen ? (
        <EditModal
          card={card}
          action={updateAction}
          onClose={() => setEditOpen(false)}
        />
      ) : null}

      {requestOpen && requestChangesAction ? (
        <RequestChangesModal
          cardId={card.id}
          cardTitle={card.title}
          action={requestChangesAction}
          onClose={() => setRequestOpen(false)}
        />
      ) : null}
    </>
  );
}

// ---------------- Edit modal ----------------

function EditModal({
  card,
  action,
  onClose,
}: {
  card: CardLite;
  action: (formData: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50";

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] p-6 shadow-2xl my-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">Edit content</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]">×</button>
        </div>
        <form action={action} onSubmit={onClose} className="space-y-3.5">
          <input type="hidden" name="id" value={card.id} />
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">Title</label>
            <input name="title" required defaultValue={card.title} className={field} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">Link (optional)</label>
            <input name="link" defaultValue={card.link ?? ""} placeholder="https://…" className={field} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">Body</label>
            <textarea name="body" rows={6} defaultValue={card.body ?? ""} className={field} />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--color-accent)] text-black hover:opacity-90 px-4 py-2.5 text-sm font-medium"
          >
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------- Request Changes modal (client) ----------------

function RequestChangesModal({
  cardId,
  cardTitle,
  action,
  onClose,
}: {
  cardId: string;
  cardTitle: string;
  action: (formData: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function pick(picked: FileList | File[] | null | undefined) {
    if (!picked) return;
    const arr = Array.from(picked).filter((f) => f.size <= 25 * 1024 * 1024);
    const next = [...files, ...arr];
    setFiles(next);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
    }
  }
  function removeFile(i: number) {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
    }
  }

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50";

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-3xl rounded-2xl border border-amber-500/40 bg-[var(--color-bg-card)] p-8 shadow-2xl my-auto"
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-2xl font-semibold tracking-tight">Request changes</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-3xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] -mt-2">×</button>
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mb-6 truncate">On: {cardTitle}</p>

        <form action={action} onSubmit={onClose} encType="multipart/form-data" className="space-y-5">
          <input type="hidden" name="id" value={cardId} />
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">What needs to change?</label>
            <textarea name="note" required rows={6} placeholder="Tell the F1 Media team what to tweak…" className={field + " text-base"} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">Attach files (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              name="attachments"
              multiple
              accept="*/*"
              className="hidden"
              onChange={(e) => pick(e.target.files)}
            />
            {files.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
                className="rounded-xl border-2 border-dashed border-[var(--color-border-strong)] px-6 py-16 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition flex flex-col items-center justify-center gap-3 min-h-[200px]"
              >
                <span className="text-4xl" aria-hidden>📎</span>
                <div className="text-base font-medium text-[var(--color-text)]">
                  Click to upload or drag files here
                </div>
                <div className="text-xs text-[var(--color-text-muted)] max-w-sm">
                  Screenshots of what to change, edited drafts, any file type — up to 25 MB each.
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-4">
                <ul className="space-y-2 mb-3">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xl shrink-0" aria-hidden>📎</span>
                        <div className="min-w-0">
                          <div className="truncate">{f.name}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                            {f.size < 1024 ? `${f.size} B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(0)} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
                          </div>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`} className="text-[var(--color-text-muted)] hover:text-red-300 text-xl leading-none">×</button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-[var(--color-border-strong)] px-3 py-2.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition"
                >
                  + Add another file
                </button>
              </div>
            )}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-amber-500 text-black hover:bg-amber-400 px-4 py-3 text-base font-semibold"
          >
            Send to F1 Media
          </button>
        </form>
      </div>
    </div>
  );
}
