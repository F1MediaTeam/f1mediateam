"use client";

// Lists the client's submitted onboarding PDFs + any brand assets they
// uploaded during onboarding. Each row downloads via a server-issued
// signed URL so the storage path stays private.

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { getFileDownloadUrl } from "@/app/client/actions";

export interface OnboardingFile {
  id: string;
  filename: string;
  category: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface Props {
  files: OnboardingFile[];
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OnboardingDownloadsCard({ files }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(id: string) {
    setBusyId(id);
    try {
      const url = await getFileDownloadUrl(id);
      if (url) window.open(url, "_blank");
    } finally {
      setBusyId(null);
    }
  }

  const pdf = files.find((f) => f.category === "onboarding");
  const assets = files.filter((f) => f.category === "onboarding-asset");

  return (
    <Card>
      <CardHeader
        title="Submitted onboarding"
        subtitle="Your completed answers as a PDF, plus any brand assets you uploaded"
      />
      <CardBody className="space-y-2">
        {!pdf && assets.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)]">
            No onboarding has been submitted yet. Complete the onboarding wizard to download a copy of your answers as a PDF.
          </div>
        ) : null}

        {pdf ? (
          <button
            type="button"
            onClick={() => download(pdf.id)}
            disabled={busyId === pdf.id}
            className="w-full flex items-center justify-between rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 px-3 py-3 text-sm transition"
          >
            <div className="flex items-center gap-3">
              <span aria-hidden>📄</span>
              <div className="text-left">
                <div className="font-medium">{pdf.filename}</div>
                <div className="text-[11px] text-[var(--color-text-muted)] font-mono">
                  Submitted {new Date(pdf.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })} · {formatSize(pdf.size_bytes)}
                </div>
              </div>
            </div>
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
              {busyId === pdf.id ? "Opening…" : "Download"}
            </span>
          </button>
        ) : null}

        {assets.length > 0 ? (
          <div className="pt-2">
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">Brand assets</div>
            <div className="space-y-1.5">
              {assets.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => download(f.id)}
                  disabled={busyId === f.id}
                  className="w-full flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 py-2 text-xs"
                >
                  <span className="truncate">{f.filename}</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)] ml-2">
                    {busyId === f.id ? "Opening…" : formatSize(f.size_bytes)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
