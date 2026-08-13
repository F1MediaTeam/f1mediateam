"use client";

// "Pull report" — on every Pulse tab and on the Report Center.
//
// Generation is synchronous and takes about a second, so there is no queue to
// poll and no spinner-then-notification dance: the button holds a pending state
// and the file downloads when it's done. Anything the report couldn't include
// is reported back rather than left for the user to notice in the PDF.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type ReportRange = "last_month" | "this_month" | "last_30d" | "last_90d";

const RANGE_LABEL: Record<ReportRange, string> = {
  last_month: "Last full month",
  this_month: "This month so far",
  last_30d: "Last 30 days",
  last_90d: "Last 90 days",
};

export default function PullReportButton({
  siteId,
  template = "monthly",
  label = "Pull report",
  showRange = true,
  compact = false,
}: {
  siteId: string;
  template?: string;
  label?: string;
  showRange?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [range, setRange] = useState<ReportRange>("last_month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function pull() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/pulse/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, template, range }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Report failed.");
        return;
      }

      // Navigating the tab to the download URL starts the file transfer without
      // leaving the page — the route redirects to a short-lived signed URL.
      window.location.href = `/api/pulse/reports/${body.reportId}/download?file=pdf`;

      const missing = (body.missing as string[]) ?? [];
      setNote(
        missing.length
          ? `Ready — ${body.rangeLabel}. Not included: ${missing.length} section${missing.length === 1 ? "" : "s"}.`
          : `Ready — ${body.rangeLabel}.`,
      );
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "inline-flex items-center gap-2" : "flex flex-col gap-1.5"}>
      <div className="inline-flex items-center gap-2">
        {showRange ? (
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as ReportRange)}
            disabled={busy}
            aria-label="Report period"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1.5 text-xs"
          >
            {(Object.keys(RANGE_LABEL) as ReportRange[]).map((r) => (
              <option key={r} value={r}>
                {RANGE_LABEL[r]}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          onClick={pull}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {busy ? "Building…" : label}
        </button>
      </div>

      {error ? (
        <p className="text-[11px]" style={{ color: "var(--color-bad)" }} role="alert">
          {error}
        </p>
      ) : null}
      {note && !error ? (
        <p className="text-[11px] text-[var(--color-text-muted)]">{note}</p>
      ) : null}
    </div>
  );
}
