"use client";

// Connect a site to its Search Console property.
//
// This is the one step the footer snippet cannot grant. The snippet proves the
// tag is installed; only Google can say whether we are allowed to ask about a
// property, and it says so by answering a real request. So the button does not
// merely save the string — it performs one inspection and reports what Google
// actually said.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { verifyGscPropertyAction } from "@/app/admin/pulse/actions";

export default function GscPropertyForm({
  siteId,
  domain,
  current,
  connected,
}: {
  siteId: string;
  domain: string;
  current: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const [property, setProperty] = useState(current ?? `sc-domain:${domain}`);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(connected);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await verifyGscPropertyAction({ siteId, property });
      setOk(res.connected);
      setError(res.error);
      if (res.connected) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        Search Console addresses a site one of two ways, and they are not interchangeable. A{" "}
        <strong>domain property</strong> is <code className="font-mono">sc-domain:{domain}</code>. A{" "}
        <strong>URL-prefix property</strong> is the exact address including the trailing slash, such as{" "}
        <code className="font-mono">https://www.{domain}/</code>. Use whichever is verified in that
        client&apos;s Search Console.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          aria-label="Search Console property"
          disabled={pending}
          className="min-w-[260px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 font-mono text-xs"
        />
        <button
          type="submit"
          disabled={pending || !property.trim()}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          {pending ? "Checking…" : "Verify connection"}
        </button>
      </div>

      {ok && !error ? (
        <p className="text-[11px]" style={{ color: "var(--color-ok)" }}>
          Connected — Google answered for this property.
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-bad)" }} role="alert">
          {error}
        </p>
      ) : null}

      <p className="text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
        No service account is needed. This uses the Google connection this client already authorised for
        Search Console — the same permission covers index inspection. The only requirement is that whoever
        authorised it is an owner or full user of the property rather than a restricted one.
      </p>
    </form>
  );
}
