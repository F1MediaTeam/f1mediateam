"use client";

// UTM campaign link builder. Everything is in-browser — type a URL and the
// campaign params, get a tagged link with a copy button. Existing query params
// on the base URL are preserved; the utm_* keys are added or replaced.

import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";

const FIELDS: { key: string; label: string; placeholder: string; required?: boolean }[] = [
  { key: "utm_source", label: "Source", placeholder: "google, facebook, newsletter", required: true },
  { key: "utm_medium", label: "Medium", placeholder: "cpc, social, email", required: true },
  { key: "utm_campaign", label: "Campaign", placeholder: "spring_sale", required: true },
  { key: "utm_term", label: "Term (optional)", placeholder: "running+shoes" },
  { key: "utm_content", label: "Content (optional)", placeholder: "logolink, textlink" },
];

export default function UtmBuilder() {
  const [base, setBase] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const { link, error } = useMemo(() => {
    const raw = base.trim();
    if (!raw) return { link: "", error: null };
    let url: URL;
    try {
      url = new URL(raw.match(/^https?:\/\//i) ? raw : `https://${raw}`);
    } catch {
      return { link: "", error: "That doesn't look like a valid URL." };
    }
    for (const f of FIELDS) {
      const v = (vals[f.key] ?? "").trim();
      if (v) url.searchParams.set(f.key, v);
    }
    return { link: url.toString(), error: null };
  }, [base, vals]);

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Destination URL
        </label>
        <input
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="https://clientsite.com/landing"
          className={field}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
              {f.label}
            </label>
            <input
              value={vals[f.key] ?? ""}
              onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className={field}
            />
          </div>
        ))}
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}

      {link ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Tagged link
          </div>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all text-xs text-[var(--color-accent)]">{link}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
