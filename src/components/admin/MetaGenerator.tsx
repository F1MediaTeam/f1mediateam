"use client";

// Title & meta description generator. Pick a client, describe the page, add
// its target keywords, and Claude drafts a few title + meta-description
// options with live length guidance and copy buttons.

import { useState, useTransition } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import { generateMetaAction, type MetaSuggestion } from "@/app/admin/tool-actions";

const TITLE_MAX = 60;
const DESC_MAX = 160;

export default function MetaGenerator({
  clients,
}: {
  clients: { id: string; company_name: string }[];
}) {
  const [clientId, setClientId] = useState("");
  const [page, setPage] = useState("");
  const [keywords, setKeywords] = useState("");
  const [results, setResults] = useState<MetaSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    if (!keywords.trim()) {
      setError("Add at least one keyword.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await generateMetaAction({ clientId, page, keywords });
      if (res.error) {
        setError(res.error);
        setResults(null);
      } else {
        setResults(res.suggestions ?? []);
      }
    });
  }

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Client (optional)
          </label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={field}>
            <option value="">No specific client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Page (what it&apos;s about, or its URL)
          </label>
          <input
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="e.g. DTF printer product page"
            className={field}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Target keywords
        </label>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={2}
          placeholder="dtf printer, direct to film printer, best dtf printer for small shops"
          className={field + " resize-y"}
        />
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}

      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-on-accent)] disabled:opacity-40"
      >
        <Sparkles size={15} />
        {pending ? "Generating…" : "Generate"}
      </button>

      {results && results.length > 0 ? (
        <div className="space-y-3 pt-1">
          {results.map((s, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                Option {i + 1}
              </div>
              <Row label="Title" value={s.title} max={TITLE_MAX} />
              <div className="mt-2">
                <Row label="Meta description" value={s.description} max={DESC_MAX} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, max }: { label: string; value: string; max: number }) {
  const [copied, setCopied] = useState(false);
  const over = value.length > max;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">{label}</span>
        <span className={"text-[11px] " + (over ? "font-semibold text-amber-400" : "text-[var(--color-text-muted)]")}>
          {value.length}/{max}
          {over ? " · too long" : ""}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm text-[var(--color-text)]">{value}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy"
          className="shrink-0 rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
