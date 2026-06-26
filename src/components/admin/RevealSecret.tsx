"use client";

// Masks a secret until the admin clicks "Show", then reveals it inline.
// Includes a copy-to-clipboard button so creds can be lifted without the
// raw value ever needing to scroll across the screen.

import { useState } from "react";

export default function RevealSecret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy:", value);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-[var(--color-text)] truncate" aria-label={shown ? "secret" : "hidden secret"}>
        {shown ? value : "•".repeat(Math.max(8, Math.min(value.length, 24)))}
      </span>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]"
      >
        {shown ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
