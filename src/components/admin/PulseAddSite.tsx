"use client";

// Add a site to F1 Pulse. Deliberately three fields: the client it belongs to,
// the domain, and anything the crawler should skip. Everything else — the key,
// the snippet, the allowed origins — is derived, because a field nobody
// understands is a field that gets filled in wrong.

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { clientColor } from "@/lib/client-color";
import { addPulseSiteAction } from "@/app/admin/pulse/actions";

export default function PulseAddSite({
  clients,
}: {
  clients: Array<{ id: string; company_name: string; ui_color?: string | null; websites?: string[] }>;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [domain, setDomain] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pickClient(id: string) {
    setClientId(id);
    // Prefill from the client record rather than making someone retype a domain
    // the portal already knows.
    const c = clients.find((x) => x.id === id);
    const first = c?.websites?.[0];
    if (first && !domain) {
      setDomain(first.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addPulseSiteAction({ clientId, domain, crawlExclusions: exclusions });
      if (res.error) return setError(res.error);
      setOpen(false);
      setClientId("");
      setDomain("");
      setExclusions("");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-accent)]"
      >
        <Plus size={14} /> Add client site
      </button>
    );
  }

  const field =
    "h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 text-sm outline-none focus:border-[var(--color-border-strong)]";

  return (
    <div
      data-panel=""
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Client
          </span>
          <select value={clientId} onChange={(e) => pickClient(e.target.value)} className={field}>
            <option value="">Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Domain
          </span>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className={`${field} font-mono text-xs`}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Don&apos;t crawl these paths <span className="normal-case tracking-normal">(one per line)</span>
        </span>
        <textarea
          value={exclusions}
          onChange={(e) => setExclusions(e.target.value)}
          rows={2}
          placeholder="/designer/"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--color-border-strong)]"
        />
      </label>

      {clientId ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded"
            style={{ background: clientColor(clients.find((c) => c.id === clientId)!).hex }}
          />
          This site will carry {clients.find((c) => c.id === clientId)?.company_name}&apos;s colour.
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[11px] text-[var(--color-bad)]">{error}</p> : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !clientId || !domain.trim()}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-accent)] disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add site"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
