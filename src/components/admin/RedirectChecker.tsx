"use client";

// Redirect & status checker. Enter a URL, see the full redirect chain and the
// status code at each hop, so redirect loops and broken links surface during
// an audit. The fetch runs server-side (checkRedirectsAction).

import { useState, useTransition } from "react";
import { ArrowDown } from "lucide-react";
import { checkRedirectsAction, type RedirectResult } from "@/app/admin/tool-actions";

function statusStyle(status: number): string {
  if (status >= 200 && status < 300) return "bg-[var(--color-accent-soft)] text-[var(--color-accent)]";
  if (status >= 300 && status < 400) return "bg-amber-500/15 text-amber-400";
  return "bg-red-500/15 text-red-400";
}

export default function RedirectChecker() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<RedirectResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!url.trim()) return;
    startTransition(async () => {
      setResult(await checkRedirectsAction(url));
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="https://clientsite.com/old-page"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
        />
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-on-accent)] disabled:opacity-40"
        >
          {pending ? "Checking…" : "Check"}
        </button>
      </div>

      {result?.error ? <div className="text-xs text-red-400">{result.error}</div> : null}

      {result && result.chain.length > 0 ? (
        <div className="space-y-1.5">
          {result.chain.map((hop, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2">
                <span className={"shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold " + statusStyle(hop.status)}>
                  {hop.status}
                </span>
                <code className="min-w-0 flex-1 break-all text-xs text-[var(--color-text-muted)]">{hop.url}</code>
              </div>
              {i < result.chain.length - 1 ? (
                <div className="flex justify-center py-0.5 text-[var(--color-text-subtle)]">
                  <ArrowDown size={13} />
                </div>
              ) : null}
            </div>
          ))}
          {result.finalUrl && result.chain.length > 1 ? (
            <p className="pt-1 text-[11px] text-[var(--color-text-subtle)]">
              {result.chain.length - 1} redirect{result.chain.length - 1 === 1 ? "" : "s"} to the final page.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
