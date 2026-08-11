"use client";

// Live visitor count, updated by Supabase Realtime rather than polling.
//
// The server renders a count so the number is right on first paint; this then
// subscribes and adjusts it as beacons land. Without the server-rendered seed
// the card would flash zero on every navigation.
//
// It counts distinct visitors inside a five-minute window, holding the hashes
// locally and expiring them on a timer — so the number falls when people leave,
// not only when someone new arrives.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const WINDOW_MS = 5 * 60 * 1000;

export default function LiveVisitors({
  siteId,
  initial,
}: {
  siteId: string;
  initial: number;
}) {
  const [count, setCount] = useState(initial);
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const channel = supabase
      .channel(`pulse-live-${siteId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pulse_pageviews", filter: `site_id=eq.${siteId}` },
        (payload) => {
          if (cancelled) return;
          const hash = (payload.new as { visitor_hash?: string })?.visitor_hash;
          if (!hash) return;
          seen.current.set(hash, Date.now());
          setCount(seen.current.size);
        },
      )
      .subscribe();

    // Expire stale hashes so the count decays instead of only ever climbing.
    const timer = setInterval(() => {
      const cutoff = Date.now() - WINDOW_MS;
      let changed = false;
      for (const [hash, at] of seen.current) {
        if (at < cutoff) {
          seen.current.delete(hash);
          changed = true;
        }
      }
      if (changed) setCount(seen.current.size);
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [siteId]);

  const live = count > 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={"h-2 w-2 rounded-full " + (live ? "animate-pulse" : "")}
        style={{ background: live ? "var(--color-ok)" : "var(--color-text-subtle)" }}
        aria-hidden
      />
      <span className="text-2xl font-semibold tabular-nums">{count}</span>
    </span>
  );
}
