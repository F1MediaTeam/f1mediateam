"use client";

// Reusable drag-and-drop file zone with click-to-pick fallback.
// Renders a hidden <input type="file" name={name} multiple /> so the files
// submit with the surrounding <form action={action}>. Selected files are
// listed below the drop area; click × to remove one before submitting.

import { useRef, useState, type DragEvent } from "react";

interface Props {
  name?: string;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropZone({
  name = "attachments",
  accept,
  multiple = true,
  label = "Drop files here, or click to browse",
  hint = "Images, PDFs, documents — anything",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  // Mirror the in-state list back onto the <input>'s FileList so the form
  // submission picks up only the files the user has chosen to keep.
  function syncInput(next: File[]) {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    inputRef.current.files = dt.files;
  }

  function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const next = multiple ? [...prev, ...arr] : arr.slice(0, 1);
      syncInput(next);
      return next;
    });
  }

  function removeAt(idx: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      syncInput(next);
      return next;
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={
          "group cursor-pointer rounded-xl border-2 border-dashed transition px-4 py-6 text-center " +
          (dragging
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-[var(--color-border-strong)] bg-[var(--color-bg)] hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-bg-elev)]")
        }
      >
        <div className="mx-auto mb-2 grid place-items-center w-10 h-10 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] text-[var(--color-text-muted)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 8 5-5 5 5" />
            <rect x="3" y="15" width="18" height="6" rx="2" />
          </svg>
        </div>
        <div className="text-sm font-medium text-[var(--color-text)]">{label}</div>
        {hint ? <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{hint}</div> : null}
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.currentTarget.files?.length) addFiles(e.currentTarget.files);
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs"
            >
              <span className="text-[var(--color-text-muted)]">📄</span>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${f.name}`}
                className="text-[var(--color-text-muted)] hover:text-red-300 transition"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
