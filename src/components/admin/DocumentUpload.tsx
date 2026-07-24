"use client";

// Drag-and-drop upload into the current folder. Wraps the shared FileDropZone
// and posts to uploadDocumentsAction with the folder's client_id (or "f1" for
// the shared folder) already filled in, plus an optional "mark as signed".

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import FileDropZone from "@/components/shared/FileDropZone";
import { uploadDocumentsAction } from "@/app/admin/document-actions";

export default function DocumentUpload({
  folderId,
  dirId,
  folderLabel,
}: {
  /** scope: client id, or "f1" for the F1 Media Team folder */
  folderId: string;
  /** current subfolder id, or null at the scope root */
  dirId?: string | null;
  folderLabel: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setNote(null);
    startTransition(async () => {
      const res = await uploadDocumentsAction(formData);
      setNote(res.error ?? `Uploaded ${res.uploaded} to ${folderLabel}.`);
    });
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="client_id" value={folderId} />
      <input type="hidden" name="folder_id" value={dirId ?? ""} />
      <FileDropZone
        name="documents"
        label={`Drop files into ${folderLabel}, or click to browse`}
        hint="Pricing sheets, tier breakdowns, contracts — up to 50 MB each"
      />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <input type="checkbox" name="signed" className="accent-[var(--color-accent)]" />
          These are signed documents
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {note ? <div className="text-xs text-[var(--color-text-muted)]">{note}</div> : null}
    </form>
  );
}
