"use client";

// Keywords for one client — searchable, sortable, printable.
//
// Every figure is Google's own. Position is impression-weighted across the
// window, which matters more than it sounds: a query shown 900 times in
// Phoenix and once in Ohio should not average those two positions as equals.
//
// There is no difficulty column. No free source publishes one, and a number
// invented to fill a column is worse than an empty column, because somebody
// will plan around it.

import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Printer, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KeywordsPanel as PanelData, RankingKeyword } from "@/lib/pulse/keywords-panel";

const INTENT_LABEL: Record<string, string> = {
  T: "Transactional",
  C: "Commercial",
  I: "Informational",
  N: "Navigational",
};

type SortField = "impressions" | "position" | "clicks" | "ctr";

function Delta({ change }: { change: number | null }) {
  if (change === null) return <span className="text-[var(--color-text-subtle)]">new</span>;
  // Position improves as the number falls, so a negative change is good news.
  if (Math.abs(change) < 0.5)
    return (
      <span className="inline-flex items-center gap-1 text-[var(--color-text-subtle)]">
        <Minus size={12} /> —
      </span>
    );
  const better = change < 0;
  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums"
      style={{ color: better ? "var(--color-up)" : "var(--color-down)" }}
    >
      {better ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(change).toFixed(1)}
    </span>
  );
}

function PosCell({ position }: { position: number }) {
  const tone =
    position <= 3 ? "var(--color-up)" : position <= 10 ? "var(--color-accent)" : undefined;
  return (
    <span className="font-semibold tabular-nums" style={{ color: tone }}>
      {position.toFixed(1)}
    </span>
  );
}

export default function KeywordsPanel({ data, domain }: { data: PanelData; domain: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortField>("impressions");
  const [desc, setDesc] = useState(true);
  const [intent, setIntent] = useState<string>("all");
  const [onlyTracked, setOnlyTracked] = useState(false);

  const rows = useMemo(() => {
    let r: RankingKeyword[] = data.ranking;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      r = r.filter((x) => x.phrase.includes(needle));
    }
    if (intent !== "all") r = r.filter((x) => x.intent === intent);
    if (onlyTracked) r = r.filter((x) => x.tracked);
    return [...r].sort((a, b) => {
      const d = a[sort] - b[sort];
      return desc ? -d : d;
    });
  }, [data.ranking, q, sort, desc, intent, onlyTracked]);

  const toggle = (f: SortField) => {
    if (sort === f) setDesc((d) => !d);
    else {
      setSort(f);
      setDesc(f !== "position"); // position sorts best-first by default
    }
  };

  const th = "pb-2 pr-3 text-left text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-subtle)]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex min-w-[14rem] flex-1 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2">
          <Search size={14} className="text-[var(--color-text-subtle)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${data.totals.rankingCount.toLocaleString()} keywords…`}
            className="w-full bg-transparent px-2 py-2 text-sm outline-none"
          />
        </div>

        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-2 text-sm"
        >
          <option value="all">All intents</option>
          {Object.entries(INTENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <input type="checkbox" checked={onlyTracked} onChange={(e) => setOnlyTracked(e.target.checked)} />
          Tracked only
        </label>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <Printer size={14} /> Print
        </button>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Showing {rows.length.toLocaleString()} of {data.totals.rankingCount.toLocaleString()} keywords
        {domain ? ` for ${domain}` : ""}. Position is Google&rsquo;s own average, weighted by
        impressions. Intent is classified from the phrase, not measured.
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={th}>Keyword</th>
              <th className={th}>Intent</th>
              <th className={th}>
                <button onClick={() => toggle("position")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                  Position <ArrowUpDown size={11} />
                </button>
              </th>
              <th className={th}>Change</th>
              <th className={th}>Best</th>
              <th className={th}>
                <button onClick={() => toggle("clicks")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                  Clicks <ArrowUpDown size={11} />
                </button>
              </th>
              <th className={th}>
                <button onClick={() => toggle("impressions")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                  Impressions <ArrowUpDown size={11} />
                </button>
              </th>
              <th className={th}>
                <button onClick={() => toggle("ctr")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                  CTR <ArrowUpDown size={11} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((r) => (
              <tr key={r.phrase} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span className="block max-w-[20rem] truncate">{r.phrase}</span>
                    {r.tracked ? (
                      <span
                        title="Tracked keyword"
                        className="rounded px-1 text-[9px] font-semibold uppercase"
                        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                      >
                        tracked
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span title={INTENT_LABEL[r.intent]} className="text-xs text-[var(--color-text-muted)]">
                    {r.intent}
                  </span>
                </td>
                <td className="py-2 pr-3"><PosCell position={r.position} /></td>
                <td className="py-2 pr-3 text-xs"><Delta change={r.change} /></td>
                <td className="py-2 pr-3 tabular-nums text-[var(--color-text-muted)]">{r.best.toFixed(1)}</td>
                <td className="py-2 pr-3 tabular-nums">{r.clicks.toLocaleString()}</td>
                <td className="py-2 pr-3 tabular-nums">{r.impressions.toLocaleString()}</td>
                <td className="py-2 pr-3 tabular-nums text-[var(--color-text-muted)]">{r.ctr.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 400 ? (
        <p className="text-xs text-[var(--color-text-subtle)]">
          Showing the first 400. Narrow it with the search box rather than scrolling — the rest are
          there, they are just further down the tail.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
          Nothing matches that filter.
        </p>
      ) : null}
    </div>
  );
}
