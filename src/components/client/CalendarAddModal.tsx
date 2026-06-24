"use client";

// Centered "Add to calendar" modal — replaces the small anchored dropdown with
// a proper screen-centered popup over a dimmed backdrop. Closes on backdrop
// click, the × button, Escape, or after submitting.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

interface Props {
  action: (formData: FormData) => void | Promise<void>;
}

// Cap each file at 25 MB and the whole batch around 50 MB so a single
// submit doesn't choke a serverless function.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export default function CalendarAddModal({ action }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  function handlePickedFiles(picked: FileList | File[] | null | undefined) {
    if (!picked) return;
    const incoming = Array.from(picked);
    const next: File[] = [...files];
    let totalAfter = files.reduce((sum, f) => sum + f.size, 0);
    for (const f of incoming) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB — limit is 25 MB per file.`);
        continue;
      }
      if (totalAfter + f.size > MAX_TOTAL_BYTES) {
        setError("Total attachment size would exceed 50 MB. Drop one of the larger files.");
        continue;
      }
      next.push(f);
      totalAfter += f.size;
    }
    setFiles(next);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
    }
  }

  function removeFile(idx: number) {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
    }
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] text-black px-3 h-8 text-xs font-medium hover:opacity-90 transition"
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

            <form
              action={action}
              onSubmit={() => setOpen(false)}
              encType="multipart/form-data"
              className="space-y-3.5"
            >
              <input name="title" required placeholder="Title" className={field} />
              <select name="type" defaultValue="meeting" className={field}>
                <option value="meeting">Meeting</option>
                <option value="deadline">Deadline</option>
              </select>
              <input name="starts_at" type="datetime-local" required className={field} />
              <textarea name="notes" rows={3} placeholder="Notes (optional)" className={field} />

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                    Attachments
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] px-2.5 py-1 text-xs"
                  >
                    <span className="text-base leading-none">+</span> Upload file
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  name="attachments"
                  multiple
                  accept="*/*"
                  className="hidden"
                  onChange={(e) => handlePickedFiles(e.target.files)}
                />

                {files.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handlePickedFiles(e.dataTransfer.files);
                    }}
                    className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-4 text-xs text-[var(--color-text-muted)] text-center cursor-pointer hover:bg-[var(--color-bg-hover)]"
                  >
                    Click the +, or drag files here. PDFs, spreadsheets, images, any file type · up to 25 MB each.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {files.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate">{f.name}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                            {fmtBytes(f.size)} · {f.type || "application/octet-stream"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          aria-label={`Remove ${f.name}`}
                          className="text-[var(--color-text-muted)] hover:text-red-300 text-base leading-none"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
              </div>

              <Button type="submit" className="w-full">Add to calendar</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
