"use client";

// Keyword-rankings table built from the stored Semrush `organic_keywords`
// deep-pull report. Columns: keyword, position (previous → current with
// movement arrow), search volume, CPC, traffic share, and the ranking URL.
// Searchable + sortable, client-side over the already-loaded rows.

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/utils";

type Row = Record<string, string>;

// Tolerant header lookup — Semrush column labels, with code fallbacks.
function keyOf(row: Row, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return undefined;
}
function num(row: Row, candidates: string[]): number {
  const k = keyOf(row, candidates);
  if (!k) return 0;
  const n = Number(String(row[k]).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function str(row: Row, candidates: string[]): string {
  const k = keyOf(row, candidates);
  return k ? String(row[k]) : "";
}

interface Kw {
  phrase: string;
  position: number;
  prev: number;
  volume: number;
  cpc: number;
  trafficPct: number;
  url: string;
}

type SortKey = "phrase" | "position" | "volume" | "trafficPct";

export default function SemrushKeywordsTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("trafficPct");
  const [asc, setAsc] = useState(false);
  const [limit, setLimit] = useState(50);

  const keywords: Kw[] = useMemo(
    () =>
      rows.map((r) => ({
        phrase: str(r, ["keyword", "phrase", "ph"]),
        position: num(r, ["position", "po"]),
        prev: num(r, ["previous position", "previous", "pp"]),
        volume: num(r, ["search volume", "volume", "nq"]),
        cpc: num(r, ["cpc", "cp"]),
        trafficPct: num(r, ["traffic (%)", "traffic %", "traffic", "tr"]),
        url: str(r, ["url", "ur"]),
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? keywords.filter((k) => k.phrase.toLowerCase().includes(q)) : keywords;
    const sorted = [...list].sort((a, b) => {
      let d: number;
      if (sort === "phrase") d = a.phrase.localeCompare(b.phrase);
      else d = (a[sort] as number) - (b[sort] as number);
      return asc ? d : -d;
    });
    return sorted;
  }, [keywords, query, sort, asc]);

  function sortBy(key: SortKey) {
    if (key === sort) setAsc((a) => !a);
    else {
      setSort(key);
      setAsc(key === "position" || key === "phrase"); // position: lower is better → asc
    }
  }
  const arrow = (key: SortKey) => (sort === key ? (asc ? " ↑" : " ↓") : "");

  const inputCls =
    "w-full sm:w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
  const th = (key: SortKey, label: string, align = "left") =>
    (
      <th
        className={`py-2 px-3 font-medium ${align === "right" ? "text-right" : "text-left"} cursor-pointer select-none hover:text-[var(--color-text)]`}
        onClick={() => sortBy(key)}
      >
        {label}
        {arrow(key)}
      </th>
    );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(50); }}
          placeholder="Filter keywords…"
          className={inputCls}
        />
        <span className="text-xs text-[var(--color-text-muted)] font-mono">
          {filtered.length.toLocaleString()} keyword{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]">
              {th("phrase", "Keyword")}
              {th("position", "Position", "right")}
              {th("volume", "Volume", "right")}
              <th className="py-2 px-3 font-medium text-right">CPC</th>
              {th("trafficPct", "Traffic %", "right")}
              <th className="py-2 px-3 font-medium text-left">URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]/60">
            {filtered.slice(0, limit).map((k, i) => {
              const moved = k.prev > 0 && k.position > 0 && k.prev !== k.position;
              const improved = moved && k.position < k.prev; // lower = better
              return (
                <tr key={i} className="hover:bg-[var(--color-bg-elev)]/50">
                  <td className="py-2 px-3 text-[var(--color-text)] max-w-[280px] truncate" title={k.phrase}>{k.phrase}</td>
                  <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                    {k.prev > 0 && moved ? (
                      <span className="text-[var(--color-text-muted)]">{k.prev} → </span>
                    ) : null}
                    <span className="text-[var(--color-text)]">{k.position || "—"}</span>
                    {moved ? (
                      <span className={improved ? "text-emerald-400" : "text-red-400"}>
                        {" "}{improved ? "▲" : "▼"}{Math.abs(k.prev - k.position)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--color-text-muted)]">{formatNumber(k.volume)}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--color-text-muted)]">{k.cpc ? `$${k.cpc.toFixed(2)}` : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--color-text-muted)]">{k.trafficPct ? `${k.trafficPct.toFixed(2)}%` : "—"}</td>
                  <td className="py-2 px-3 max-w-[260px] truncate">
                    {k.url ? (
                      <a href={k.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline" title={k.url}>
                        {k.url.replace(/^https?:\/\//, "").slice(0, 48)} ↗
                      </a>
                    ) : (
                      <span className="text-[var(--color-text-subtle)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-[var(--color-text-muted)]">No keywords match.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.length > limit ? (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + 100)}
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-4 py-2 text-xs font-medium"
          >
            Show more ({(filtered.length - limit).toLocaleString()} more)
          </button>
        </div>
      ) : null}
    </div>
  );
}
