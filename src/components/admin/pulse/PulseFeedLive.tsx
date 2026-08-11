"use client";

// The feed list, with new events arriving live.
//
// Server-rendered first so the page is complete without JavaScript, then
// Realtime prepends anything new. New rows are marked briefly — a feed that
// silently reorders itself is hard to read.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FeedRow {
  id: string;
  siteId: string;
  ts: string;
  kind: string;
  severity: string;
  title: string;
}

const SEVERITY: Record<string, string> = {
  critical: "var(--color-bad)",
  warning: "var(--color-warn)",
  good: "var(--color-ok)",
  info: "var(--color-text-subtle)",
};

export default function PulseFeedLive({
  siteIds,
  initial,
  sites,
  kindFilter,
}: {
  siteIds: string[];
  initial: FeedRow[];
  sites: Record<string, { domain: string; name: string; colour: string }>;
  kindFilter: string | null;
}) {
  const [rows, setRows] = useState(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Re-sync when the server sends a different filtered set, or switching
  // filters would keep showing the previous one.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setRows(initial);
  }

  useEffect(() => {
    if (siteIds.length === 0) return;
    const supabase = createClient();
    const allowed = new Set(siteIds);

    const channel = supabase
      .channel("pulse-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pulse_feed_events" }, (payload) => {
        const e = payload.new as Record<string, unknown>;
        // Filtering client-side: a channel filter can only match one value, and
        // this page can be scoped to several sites at once.
        if (!allowed.has(String(e.site_id))) return;
        if (kindFilter && String(e.kind) !== kindFilter) return;
        const row: FeedRow = {
          id: String(e.id),
          siteId: String(e.site_id),
          ts: String(e.ts),
          kind: String(e.kind),
          severity: String(e.severity),
          title: String(e.title),
        };
        setRows((r) => [row, ...r].slice(0, 200));
        setFresh((f) => new Set(f).add(row.id));
        setTimeout(() => setFresh((f) => {
          const next = new Set(f);
          next.delete(row.id);
          return next;
        }), 6000);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [siteIds, kindFilter]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] py-12 text-center">
        <div className="text-sm font-medium">Nothing here yet</div>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--color-text-muted)]">
          Events appear as the collectors run — rank movements, new and lost backlinks, crawl
          results, crawler-access changes, and tag or uptime problems.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {rows.map((e) => {
        const site = sites[e.siteId];
        return (
          <li
            key={e.id}
            data-panel=""
            className={
              "flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2.5 transition " +
              (fresh.has(e.id) ? "ring-1 ring-[var(--color-accent)]" : "")
            }
          >
            <span
              aria-hidden
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: SEVERITY[e.severity] ?? SEVERITY.info }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium leading-snug">{e.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-text-subtle)]">
                {site ? (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: site.colour }} />
                    {site.name}
                  </span>
                ) : null}
                <span>·</span>
                <span className="font-mono">{e.kind.replace(/_/g, " ")}</span>
                <span>·</span>
                <span>{new Date(e.ts).toLocaleString()}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
