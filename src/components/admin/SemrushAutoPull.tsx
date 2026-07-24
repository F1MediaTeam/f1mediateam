"use client";

// Fills the Semrush deep-data section automatically the first time a client's
// profile is opened, so the admin never has to click "Run deep pull". Fires
// only when the section is empty (the route also guards this), then refreshes
// the page so the reports render. A full pull takes ~30-60s.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SemrushAutoPull({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"pulling" | "failed">("pulling");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sync/semrush?client_id=${encodeURIComponent(clientId)}`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (body?.pulled) router.refresh();
        else if (!body) setStatus("failed");
        else router.refresh(); // already-populated or not-connected — reflect current state
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, router]);

  if (status === "failed") {
    return (
      <div className="text-xs text-[var(--color-text-muted)]">
        Couldn&apos;t load Semrush data automatically. Use &ldquo;Run deep pull&rdquo; above to try again.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
      <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
      Loading every Semrush report for this client… this takes ~30–60 seconds.
    </div>
  );
}
