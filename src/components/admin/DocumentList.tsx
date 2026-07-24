"use client";

// One folder's documents: signed filter, per-row download / signed-toggle /
// delete. Download fetches a fresh short-lived signed URL on click rather than
// embedding one per row, so links can't leak or go stale in the HTML.

import { useState, useTransition } from "react";
import { Download, Trash2, FileText, Loader2 } from "lucide-react";
import {
  deleteDocumentAction,
  toggleDocumentSignedAction,
  getDocumentDownloadUrl,
} from "@/app/admin/document-actions";
import type { DocumentRecord } from "@/lib/types";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Filter = "all" | "signed" | "unsigned";

export default function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const shown = documents.filter((d) =>
    filter === "all" ? true : filter === "signed" ? d.signed : !d.signed,
  );

  async function download(id: string) {
    setBusyId(id);
    try {
      const url = await getDocumentDownloadUrl(id);
      if (url) window.open(url, "_blank");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSigned(d: DocumentRecord) {
    startTransition(() => {
      void toggleDocumentSignedAction(d.id, !d.signed);
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(() => {
      void deleteDocumentAction(id);
    });
  }

  const counts = {
    all: documents.length,
    signed: documents.filter((d) => d.signed).length,
    unsigned: documents.filter((d) => !d.signed).length,
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-1">
        {(["all", "signed", "unsigned"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition " +
              (filter === f
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                : "border border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]")
            }
          >
            {f} <span className="text-[var(--color-text-subtle)]">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-text-muted)]">
          {documents.length === 0
            ? "No documents in this folder yet. Drop files above to add them."
            : `No ${filter} documents.`}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5"
            >
              <FileText size={18} className="shrink-0 text-[var(--color-text-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.filename}</div>
                <div className="text-[11px] text-[var(--color-text-subtle)]">
                  {fmtSize(d.size_bytes)}
                  {d.size_bytes ? " · " : ""}
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleSigned(d)}
                title="Toggle signed status"
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition " +
                  (d.signed
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:brightness-110"
                    : "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
                }
              >
                {d.signed ? "Signed" : "Unsigned"}
              </button>

              <button
                type="button"
                onClick={() => download(d.id)}
                disabled={busyId === d.id}
                title="Download"
                className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
              >
                {busyId === d.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>

              <button
                type="button"
                onClick={() => remove(d.id, d.filename)}
                title="Delete"
                className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
