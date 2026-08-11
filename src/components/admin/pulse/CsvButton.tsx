"use client";

// CSV export with an F1 Media Team attribution line.
//
// Built in the browser from data already on the page — no export endpoint, so
// what you download is exactly what you were looking at.

import { Download } from "lucide-react";

function escape(value: unknown): string {
  const s = String(value ?? "");
  // Quote anything containing a delimiter, quote or newline; double inner quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CsvButton({
  rows,
  filename,
}: {
  rows: Array<Record<string, unknown>>;
  filename: string;
}) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      `# F1 Pulse — prepared by F1 Media Team — ${new Date().toLocaleDateString()}`,
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
    >
      <Download size={12} /> CSV
    </button>
  );
}
