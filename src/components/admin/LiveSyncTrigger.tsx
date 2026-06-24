"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  clientId: string;
}

/**
 * On mount, hits the freshen endpoint for this client. The endpoint is
 * itself rate-limited (only re-syncs connectors stale > 30 min), so it's
 * safe to invoke on every profile visit. Once it finishes, we refresh the
 * route so the new snapshots show up.
 */
export default function LiveSyncTrigger({ clientId }: Props) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sync/client?client_id=${encodeURIComponent(clientId)}`, { method: "POST" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        const did = (data.results ?? []).some((r: { status: string }) => r.status === "synced");
        if (did) router.refresh();
      })
      .catch(() => { /* silent — admin can hit Refresh manually if needed */ });
    return () => {
      cancelled = true;
    };
  }, [clientId, router]);
  return null;
}
