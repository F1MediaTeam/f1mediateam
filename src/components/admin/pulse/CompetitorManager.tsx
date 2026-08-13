"use client";

// Add and remove the competitor domains tracked for one site.
//
// Removing unlinks rather than deletes: the measurements stay against the
// domain, so re-adding a competitor later restores its history instead of
// starting the record over.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCompetitorAction, removeCompetitorAction } from "@/app/admin/pulse/actions";

export function AddCompetitor({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = domain.trim();
    if (!value) return;
    start(async () => {
      const res = await addCompetitorAction({ siteId, domain: value });
      if (res.error) setError(res.error);
      else {
        setDomain("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="competitor.com"
          aria-label="Competitor domain"
          disabled={pending}
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-xs"
        />
        <button
          type="submit"
          disabled={pending || !domain.trim()}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Track competitor"}
        </button>
      </div>
      {error ? (
        <p className="text-[11px]" style={{ color: "var(--color-bad)" }} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function RemoveCompetitor({ siteId, domainId, domain }: { siteId: string; domainId: string; domain: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
      >
        Stop tracking
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[10px]">
      <span className="text-[var(--color-text-muted)]">Stop tracking {domain}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await removeCompetitorAction({ siteId, domainId });
            router.refresh();
          })
        }
        className="font-medium"
        style={{ color: "var(--color-bad)" }}
      >
        {pending ? "…" : "Yes"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-[var(--color-text-subtle)]">
        No
      </button>
    </span>
  );
}
