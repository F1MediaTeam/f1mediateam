"use client";

// Collapsible "Organic keywords" dropdown. The live SEMrush list is fetched
// only the first time it's expanded (it costs API units), then cached in state.
// Columns are sortable; click a header to re-sort.

import { useState } from "react";
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

export default function OrganicKeywordsPanel({
  clientId,
  source = "SEMrush", // client portal passes "F1 Media Team" to white-label
}: {
  clientId: string;
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [sort, setSort] = useState<SortKey>("trafficPct");
  const [asc, setAsc] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/keywords/${clientId}`);
        const json = await res.json();
        if (json.error) setError(json.error);
        setKeywords(Array.isArray(json.keywords) ? json.keywords : []);
        setLoaded(true);
      } catch {
        setError("Failed to load keywords.");
      } finally {
        setLoading(false);
      }
    }
  }

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

  const arrow = (key: SortKey) => (sort === key ? (asc ? " ↑" : " ↓") : "");

  return (
    <Card>
      <CardHeader
        title="Organic keywords"
        subtitle={`From ${source} · top 250 by traffic share — live`}
        right={
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5"
          >
            {open ? "Hide" : "Show keywords"}
            <span className={"transition-transform " + (open ? "rotate-180" : "")}>▾</span>
          </button>
        }
      />
      {open ? (
        <CardBody>
          {loading ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Loading keywords from {source}…</div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-[var(--color-danger,#ef4444)]">{error}</div>
          ) : sorted.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">No organic keywords found.</div>
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
                  {sorted.map((k, i) => (
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
        </CardBody>
      ) : null}
    </Card>
  );
}
