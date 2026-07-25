"use client";

// "Organic keywords" list. Loads once on mount (from the client's stored deep
// pull, so it costs no API units) and stays visible — no show/hide toggle.
// Columns are sortable; a search box filters the list.

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { formatNumber } from "@/lib/utils";

interface Keyword {
  phrase: string;
  position: number;
  volume: number;
  cpc: number;
  trafficPct: number;
  url: string;
}

type SortKey = "position" | "volume" | "trafficPct";

// Stable module-scope wrapper so switching `embedded` doesn't remount children.
function EmbeddedWrap({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export default function OrganicKeywordsPanel({ clientId, embedded = false }: { clientId: string; embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [sort, setSort] = useState<SortKey>("trafficPct");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");

  // Load once on mount and keep the list visible.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/keywords/${clientId}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.error) setError(json.error);
        setKeywords(Array.isArray(json.keywords) ? json.keywords : []);
      } catch {
        if (!cancelled) setError("Failed to load keywords.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function sortBy(key: SortKey) {
    if (key === sort) setAsc((a) => !a);
    else {
      setSort(key);
      setAsc(key === "position"); // positions: low is good → default ascending
    }
  }

  const sorted = [...keywords].sort((a, b) => {
    const d = a[sort] - b[sort];
    return asc ? d : -d;
  });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter((k) => k.phrase.toLowerCase().includes(q) || k.url.toLowerCase().includes(q))
    : sorted;

  const arrow = (key: SortKey) => (sort === key ? (asc ? " ↑" : " ↓") : "");

  const Wrap = embedded ? EmbeddedWrap : Card;
  return (
    <Wrap>
      <CardHeader title={<span className="block text-center sm:text-left">Organic keywords</span>} />
      <CardBody>
          {loading ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-[var(--color-danger,#ef4444)]">{error}</div>
          ) : sorted.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">No organic keywords found.</div>
          ) : (
            <>
            {/* Search / filter across the loaded keyword list. */}
            <div className="mb-3 flex items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search keywords or URLs…"
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
              />
              <span className="shrink-0 whitespace-nowrap text-xs text-[var(--color-text-muted)]">
                {q ? `${filtered.length} of ${sorted.length}` : `${sorted.length} keywords`}
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                No keywords match &ldquo;{query}&rdquo;.
              </div>
            ) : (
            <div className="max-h-[520px] overflow-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--color-bg-elev)]">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="py-2 px-3">Keyword</th>
                    <th className="py-2 px-3 cursor-pointer select-none" onClick={() => sortBy("position")}>Pos.{arrow("position")}</th>
                    <th className="py-2 px-3 cursor-pointer select-none" onClick={() => sortBy("volume")}>Volume{arrow("volume")}</th>
                    <th className="py-2 px-3 cursor-pointer select-none" onClick={() => sortBy("trafficPct")}>Traffic %{arrow("trafficPct")}</th>
                    <th className="py-2 px-3">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filtered.map((k, i) => (
                    <tr key={i} className="hover:bg-[var(--color-bg-hover)]">
                      <td className="py-2 px-3 font-medium">{k.phrase}</td>
                      <td className="py-2 px-3 tabular-nums">{k.position}</td>
                      <td className="py-2 px-3 tabular-nums">{formatNumber(k.volume, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-3 tabular-nums">{k.trafficPct.toFixed(2)}%</td>
                      <td className="py-2 px-3 max-w-[280px] truncate">
                        <a href={k.url} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
                          {k.url.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            </>
          )}
        </CardBody>
    </Wrap>
  );
}
