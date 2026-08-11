"use client";

// Per-panel refresh. Every panel has one, with its own loading state and a
// last-updated stamp, because "is this number stale?" is the first question
// anyone asks of a dashboard.
//
// Safe to spam: the collectors are idempotent, and a second click while one is
// in flight is ignored rather than queued.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function RefreshButton({
  collector,
  siteId,
  lastUpdated,
  mocked,
  label,
}: {
  collector: string;
  siteId?: string;
  lastUpdated?: string | null;
  mocked?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const url = `/api/pulse/refresh/${collector}${siteId ? `?siteId=${siteId}` : ""}`;
      const res = await fetch(url, { method: "POST" });
      const json = (await res.json()) as { error?: string; done?: boolean };
      if (!res.ok) setNote(json.error ?? "Refresh failed.");
      else startTransition(() => router.refresh());
    } catch {
      setNote("Refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-text)] disabled:opacity-50"
      >
        <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        {busy ? "Refreshing…" : (label ?? "Refresh")}
      </button>
      <span className="text-[10px] text-[var(--color-text-subtle)]">
        {note ??
          (lastUpdated
            ? `Updated ${new Date(lastUpdated).toLocaleString()}`
            : "Never run")}
      </span>
      {mocked ? (
        <span className="rounded-full bg-[var(--color-warn-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-warn)]">
          Sample data
        </span>
      ) : null}
    </div>
  );
}
