"use client";

// Logo upload control. Replaces the old "paste a URL" input — clicking the
// dashed "+" circle opens the OS file picker, drag-and-drop is supported,
// and the preview shows the currently selected (or already-saved) image
// with a small "remove" affordance.
//
// The component is uncontrolled-friendly: it manages its own preview state
// while syncing a hidden <input name="logo_file"> + <input name="logo_clear">
// inside whatever <form> wraps it, so server actions just read FormData.

import { useRef, useState, useEffect } from "react";

interface Props {
  /** Public URL of the currently-saved logo, if any. */
  initialUrl?: string | null;
  /** Form field names — defaults match the meeting actions. */
  fileFieldName?: string;
  clearFieldName?: string;
  /** Display size in px (square). */
  size?: number;
  /** Optional label text under the upload zone. */
  helperText?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — Supabase Storage caps free at 50MB total.
const ACCEPTED = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";

export default function LogoUpload({
  initialUrl,
  fileFieldName = "logo_file",
  clearFieldName = "logo_clear",
  size = 168,
  helperText = "PNG, JPG, WebP, SVG · up to 5 MB",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [shouldClear, setShouldClear] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke any blob URLs we created so we don't leak.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is 5 MB.`);
      return;
    }
    setError(null);

    // Replace any prior blob URL.
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setPreviewUrl(url);
    setShouldClear(false);

    // Sync the file into the hidden input so the form submits it.
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
    }
  }

  function onClick() {
    inputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0]);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function onRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = "";
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
    setPreviewUrl(null);
    setShouldClear(true);
    setError(null);
  }

  return (
    <div className="flex items-center gap-5">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{ width: size, height: size }}
        className={
          "relative grid place-items-center rounded-full border-2 border-dashed " +
          "transition-colors cursor-pointer select-none " +
          (dragging
            ? "border-emerald-400/70 bg-emerald-500/10"
            : previewUrl
            ? "border-[var(--color-border-strong)] bg-[var(--color-bg-elev)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:border-emerald-400/60 hover:bg-emerald-500/5")
        }
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Logo preview"
              className="w-full h-full rounded-full object-cover"
            />
            <button
              type="button"
              onClick={onRemove}
              title="Remove logo"
              className="absolute -top-1 -right-1 h-7 w-7 grid place-items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-red-300 hover:border-red-500/50 shadow"
            >
              ×
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center text-[var(--color-text-muted)]">
            <span className="text-5xl leading-none font-light">+</span>
            <span className="mt-2 text-[11px] uppercase tracking-wider">Upload logo</span>
          </div>
        )}
        <input
          ref={inputRef}
          name={fileFieldName}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={onChange}
        />
        {/* Sentinel: present when the user clicked "remove" so the server action
            knows to null out the existing logo. */}
        {shouldClear ? <input type="hidden" name={clearFieldName} value="1" /> : null}
      </div>
      <div className="text-xs text-[var(--color-text-muted)] max-w-[14rem]">
        <div>Click the circle or drag a file from your desktop.</div>
        <div className="mt-1">{helperText}</div>
        {error ? <div className="mt-2 text-red-300">{error}</div> : null}
      </div>
    </div>
  );
}
