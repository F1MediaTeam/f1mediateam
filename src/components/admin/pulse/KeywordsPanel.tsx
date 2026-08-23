"use client";

// Keyword Lab — Garrett's layout, wired to Search Console.
//
// The structure is his: a seed overview card with a donut and a row of stats, a
// Groups rail down the left, All/Questions tabs, a sortable table, rows that
// open into detail, selection and CSV export. What changed is where the numbers
// come from. The original modelled volume and difficulty and read positions off
// a scraped results page; this reads Google's own record of what this site
// actually appeared for.
//
// Two consequences worth stating plainly, because they change what the columns
// can honestly say:
//
//   * The donut shows click-through rate, not difficulty. Difficulty has no
//     free source, and inventing one to fill a circle is how a number nobody
//     can defend ends up in front of a client.
//   * "Related" means other searches this site already appears for that share
//     language with the seed — real queries with real positions, rather than a
//     vendor's suggestions.

import { useMemo, useState } from "react";
import {
  Search, Download, TrendingUp, TrendingDown, Minus, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronRight, ChevronDown, X, Printer,
} from "lucide-react";
import type { KeywordsPanel as PanelData, RankingKeyword, HistoryPoint } from "@/lib/pulse/keywords-shared";
import { relatedTo, isQuestion, keywordGroups, trendOf } from "@/lib/pulse/keywords-shared";

const INTENT: Record<string, { label: string; bg: string; fg: string }> = {
  T: { label: "Transactional", bg: "rgba(63,142,132,.16)", fg: "var(--color-accent)" },
  C: { label: "Commercial", bg: "rgba(217,164,65,.16)", fg: "#d9a441" },
  I: { label: "Informational", bg: "rgba(96,165,250,.16)", fg: "#60a5fa" },
  N: { label: "Navigational", bg: "rgba(167,139,250,.16)", fg: "#a78bfa" },
};

const fmt = (n: number) => n.toLocaleString("en-US");
const weeklyOf = (v: number) => Math.round(v / 4.33);
const threeMoOf = (v: number) => v * 3;

/** Position bands, borrowed from the original's difficulty bands. */
function posInfo(p: number) {
  if (p <= 3) return { label: "Top 3", hex: "#10b981" };
  if (p <= 10) return { label: "First page", hex: "#22c55e" };
  if (p <= 20) return { label: "Page 2", hex: "#eab308" };
  if (p <= 50) return { label: "Deep", hex: "#f97316" };
  return { label: "Barely visible", hex: "#ef4444" };
}

function Donut({ pct, hex }: { pct: number; hex: string }) {
  const r = 15.9155; // circumference is exactly 100
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-border)" strokeWidth="3.8" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={hex} strokeWidth="3.8"
                strokeDasharray={`${shown}, 100`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-bold tabular-nums">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-text-subtle)]">{label}</div>
      <div className={`${big ? "text-2xl font-bold" : "text-lg font-semibold"} tabular-nums`}>{value}</div>
    </div>
  );
}

function IntentChip({ code }: { code: string }) {
  const m = INTENT[code] ?? INTENT.C;
  return (
    <span title={m.label} className="inline-flex h-5 w-6 items-center justify-center rounded text-xs font-bold"
          style={{ background: m.bg, color: m.fg }}>
      {code}
    </span>
  );
}

function TrendBadge({ trend }: { trend: "rising" | "stable" | "declining" }) {
  const map = {
    rising: { Icon: TrendingUp, text: "Rising", fg: "var(--color-up)", bg: "var(--color-accent-soft)" },
    declining: { Icon: TrendingDown, text: "Declining", fg: "var(--color-down)", bg: "rgba(220,38,38,.14)" },
    stable: { Icon: Minus, text: "Stable", fg: "var(--color-text-muted)", bg: "var(--color-bg-hover)" },
  }[trend];
  const { Icon } = map;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ color: map.fg, background: map.bg }}>
      <Icon className="h-3 w-3" /> {map.text}
    </span>
  );
}

function PosBadge({ position }: { position: number }) {
  const info = posInfo(position);
  return (
    <span className="inline-flex h-6 items-center justify-center rounded px-2 text-sm font-semibold tabular-nums"
          style={{ background: `${info.hex}22`, color: info.hex }}>
      {position.toFixed(1)}
    </span>
  );
}

function DeltaBadge({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-[var(--color-text-subtle)]">new</span>;
  if (Math.abs(change) < 0.5) return <span className="text-xs text-[var(--color-text-subtle)]">—</span>;
  const better = change < 0; // position falls as it improves
  const Icon = better ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums"
          style={{ color: better ? "var(--color-up)" : "var(--color-down)" }}>
      <Icon className="h-3 w-3" /> {Math.abs(change).toFixed(1)}
    </span>
  );
}

/** Twelve weeks of position, drawn small. Lower is better, so the axis is flipped. */
function Spark({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return <span className="text-xs text-[var(--color-text-subtle)]">not enough history</span>;
  const w = 220, h = 44, pad = 3;
  const positions = history.map((p) => p.position);
  const min = Math.min(...positions), max = Math.max(...positions);
  const span = Math.max(1, max - min);
  const pts = history.map((p, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = pad + ((p.position - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="1.6" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2.5" fill="var(--color-accent)" />
    </svg>
  );
}

type SortField = "impressions" | "position" | "clicks" | "ctr";

export default function KeywordsPanel({ data, domain }: { data: PanelData; domain: string }) {
  const [seed, setSeed] = useState<RankingKeyword | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "questions">("all");
  const [group, setGroup] = useState<string | null>(null);
  const [sort, setSort] = useState<SortField>("impressions");
  const [desc, setDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  // The working set: everything, or the neighbourhood around a chosen seed.
  const base = useMemo(
    () => (seed ? relatedTo(seed.phrase, data.ranking, 200) : data.ranking),
    [seed, data.ranking],
  );

  const groups = useMemo(() => keywordGroups(base), [base]);

  const rows = useMemo(() => {
    let r = base;
    if (query.trim()) {
      const n = query.trim().toLowerCase();
      r = r.filter((x) => x.phrase.includes(n));
    }
    if (tab === "questions") r = r.filter((x) => isQuestion(x.phrase));
    if (group) r = r.filter((x) => x.phrase.toLowerCase().split(/[^a-z0-9]+/).includes(group));
    return [...r].sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]));
  }, [base, query, tab, group, sort, desc]);

  const questionCount = useMemo(() => base.filter((r) => isQuestion(r.phrase)).length, [base]);

  const totals = useMemo(() => {
    const impressions = base.reduce((s, r) => s + r.impressions, 0);
    const clicks = base.reduce((s, r) => s + r.clicks, 0);
    const avgPos = base.length ? base.reduce((s, r) => s + r.position, 0) / base.length : 0;
    return { count: base.length, impressions, clicks, avgPos };
  }, [base]);

  function toggleSort(f: SortField) {
    if (sort === f) setDesc((d) => !d);
    else { setSort(f); setDesc(f !== "position"); }
  }

  function toggleSel(k: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  const allShown = rows.length > 0 && rows.every((r) => selected.has(r.phrase));
  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allShown) rows.forEach((r) => n.delete(r.phrase));
      else rows.forEach((r) => n.add(r.phrase));
      return n;
    });
  }

  function exportCsv() {
    const chosen = rows.filter((r) => selected.size === 0 || selected.has(r.phrase));
    const lines = [
      ["Keyword", "Intent", "Position", "Change", "Best", "Clicks", "Impressions", "CTR %", "Trend"],
      ...chosen.map((r) => [
        r.phrase,
        INTENT[r.intent]?.label ?? r.intent,
        r.position.toFixed(1),
        r.change === null ? "new" : r.change.toFixed(1),
        r.best.toFixed(1),
        String(r.clicks),
        String(r.impressions),
        r.ctr.toFixed(1),
        trendOf(r.history),
      ]),
    ];
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${domain}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)] whitespace-nowrap";

  return (
    <div className="space-y-5">
      {/* ---- search + actions ---- */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex min-w-[16rem] flex-1 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
          <Search className="ml-3 h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${fmt(data.ranking.length)} keywords this site appears for…`}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          {query ? (
            <button onClick={() => setQuery("")} className="mr-2 p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <button onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          <Download className="h-4 w-4" /> Export{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      {/* ---- seed overview ---- */}
      {seed ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="min-w-40">
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">Selected keyword</div>
            <div className="mt-0.5 text-xl font-semibold">{seed.phrase}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: INTENT[seed.intent].bg, color: INTENT[seed.intent].fg }}>
                {seed.intent} <span className="font-medium">{INTENT[seed.intent].label}</span>
              </span>
              <TrendBadge trend={trendOf(seed.history)} />
              <button onClick={() => { setSeed(null); setGroup(null); }}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>
          <div className="hidden h-14 w-px bg-[var(--color-border)] md:block" />
          <Stat label="Weekly impressions" value={fmt(weeklyOf(seed.impressions))} />
          <Stat label="Impressions, 28 days" value={fmt(seed.impressions)} big />
          <Stat label="3-month pace" value={fmt(threeMoOf(seed.impressions))} />
          <div className="hidden h-14 w-px bg-[var(--color-border)] md:block" />
          <div className="flex items-center gap-3">
            <Donut pct={seed.ctr} hex={posInfo(seed.position).hex} />
            <div>
              <div className="font-semibold">Click-through</div>
              <div className="text-xs text-[var(--color-text-subtle)]">of people who saw it</div>
            </div>
          </div>
          <div className="hidden h-14 w-px bg-[var(--color-border)] md:block" />
          <div>
            <div className="text-xs text-[var(--color-text-subtle)]">Position</div>
            <div className="mt-1"><PosBadge position={seed.position} /></div>
            <div className="mt-1 text-xs text-[var(--color-text-subtle)]">{posInfo(seed.position).label}</div>
          </div>
          <Stat label="Clicks" value={fmt(seed.clicks)} />
        </div>
      ) : null}

      {/* ---- tabs ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1">
          <button onClick={() => setTab("all")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "all" ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]" : "text-[var(--color-text-muted)]"}`}>
            {seed ? "Related keywords" : "All keywords"}
          </button>
          <button onClick={() => setTab("questions")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === "questions" ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]" : "text-[var(--color-text-muted)]"}`}>
            Questions ({questionCount})
          </button>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {fmt(totals.count)} keywords · {fmt(totals.impressions)} impressions · {fmt(totals.clicks)} clicks · avg position {totals.avgPos.toFixed(1)}
        </div>
      </div>

      {/* ---- groups rail + table ---- */}
      <div className="flex items-start gap-4">
        <div className="hidden w-48 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] md:block print:hidden">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
            Groups
          </div>
          <button onClick={() => setGroup(null)}
            className={`flex w-full items-center justify-between px-3 py-2 text-sm ${group === null ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
            <span>All</span><span className="tabular-nums text-xs">{base.length}</span>
          </button>
          {groups.map(([w, c]) => (
            <button key={w} onClick={() => setGroup(group === w ? null : w)}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm ${group === w ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
              <span className="truncate pr-2">{w}</span><span className="tabular-nums text-xs">{c}</span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="w-8 px-3 py-2 print:hidden">
                    <input type="checkbox" className="h-4 w-4" checked={allShown} onChange={toggleAll} />
                  </th>
                  <th className="w-6 px-2 py-2 print:hidden" />
                  <th className={`${th} text-left`}>Keyword</th>
                  <th className={`${th} text-center`}>Intent</th>
                  <th className={`${th} text-right`}>
                    <button onClick={() => toggleSort("position")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                      Position <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className={`${th} text-center`}>Change</th>
                  <th className={`${th} text-right`}>Best</th>
                  <th className={`${th} text-right`}>
                    <button onClick={() => toggleSort("clicks")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                      Clicks <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className={`${th} text-right`}>
                    <button onClick={() => toggleSort("impressions")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                      Impressions <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className={`${th} text-right`}>
                    <button onClick={() => toggleSort("ctr")} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]">
                      CTR <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => {
                  const isOpen = open === r.phrase;
                  return (
                    <tr key={r.phrase} className="border-b border-[var(--color-border)] align-top last:border-0">
                      <td className="px-3 py-2 print:hidden">
                        <input type="checkbox" className="h-4 w-4" checked={selected.has(r.phrase)} onChange={() => toggleSel(r.phrase)} />
                      </td>
                      <td className="px-2 py-2 print:hidden">
                        <button onClick={() => setOpen(isOpen ? null : r.phrase)} className="p-0.5 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]" title="History">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2" colSpan={isOpen ? 8 : 1}>
                        <span className="flex items-center gap-1.5">
                          <button onClick={() => { setSeed(r); setGroup(null); setTab("all"); }}
                            className="max-w-[20rem] truncate text-left text-[var(--color-accent)] hover:underline" title="Show related keywords">
                            {r.phrase}
                          </button>
                          {r.tracked ? (
                            <span className="rounded px-1 text-[9px] font-semibold uppercase"
                                  style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>tracked</span>
                          ) : null}
                        </span>
                        {isOpen ? (
                          <div className="mt-3 grid gap-4 rounded-md bg-[var(--color-bg-elev)] p-3 md:grid-cols-2">
                            <div>
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
                                Position, last 12 weeks
                              </div>
                              <Spark history={r.history} />
                              <div className="mt-1 text-xs text-[var(--color-text-subtle)]">
                                Lower is better, so a line that falls is improving.
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
                                Weekly detail
                              </div>
                              <div className="max-h-32 space-y-0.5 overflow-y-auto text-xs">
                                {[...r.history].reverse().slice(0, 12).map((h) => (
                                  <div key={h.weekStart} className="flex items-center gap-3">
                                    <span className="w-20 shrink-0 tabular-nums text-[var(--color-text-subtle)]">{h.weekStart}</span>
                                    <span className="w-12 tabular-nums font-semibold">#{h.position.toFixed(1)}</span>
                                    <span className="tabular-nums text-[var(--color-text-muted)]">{fmt(h.impressions)} impr · {h.clicks} clicks</span>
                                  </div>
                                ))}
                                {r.history.length === 0 ? (
                                  <span className="text-[var(--color-text-subtle)]">No weekly history stored yet.</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                      {!isOpen ? (
                        <>
                          <td className="px-3 py-2 text-center"><IntentChip code={r.intent} /></td>
                          <td className="px-3 py-2 text-right"><PosBadge position={r.position} /></td>
                          <td className="px-3 py-2 text-center"><DeltaBadge change={r.change} /></td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-muted)]">{r.best.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(r.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(r.impressions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-muted)]">{r.ctr.toFixed(1)}%</td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
              Nothing matches this filter.
            </div>
          ) : null}
          {rows.length > 300 ? (
            <div className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-subtle)]">
              Showing the first 300 of {fmt(rows.length)}. Search or pick a group to narrow it.
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text-subtle)]">
        Every figure is Search Console&rsquo;s, for this client&rsquo;s own property, and runs about
        two days behind. Position is averaged across impressions, so a query shown once in Ohio and
        900 times in Phoenix reports mostly Phoenix. Intent is classified from the wording of the
        phrase rather than measured. There is no difficulty score because no free source publishes
        one — click a keyword to see what else this site ranks for around it.
      </p>
    </div>
  );
}
