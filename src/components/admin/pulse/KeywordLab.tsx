"use client";

// Keyword Lab.
//
// Two halves. Research estimates what a keyword is worth; Tracking measures
// where a site actually ranks for the ones you kept. The distinction runs
// through the whole component because the two carry different weight: an
// estimate is a guess good enough to choose between two keywords, and a check
// is something you can show a client.
//
// Nothing here calls an AI provider. Every paid call goes through a server
// action, because a key in the browser is a key anyone can spend.

import { Fragment, useState, useMemo, useTransition } from "react";
import {
  Search, Download, RefreshCw, TrendingUp, TrendingDown, Minus, ArrowUpDown,
  ArrowUp, ArrowDown, ChevronRight, ChevronDown, X, Plus, Target, ExternalLink, Loader2,
} from "lucide-react";
import {
  analyzeAction, checkRankAction, removeKeywordAction, setTargetUrlAction, trackKeywordsAction,
} from "@/app/admin/pulse/keyword-lab/actions";

/* ------------------------------- types ------------------------------- */

interface Site { id: string; domain: string; clientName: string; colour: string | null }
interface KeywordRow {
  id: string; site_id: string; phrase: string; volume: number | null; intent: string | null;
  kd: number | null; cpc: number | null; target_url: string | null; metrics_source: string; is_active: boolean;
}
interface CheckRow {
  keyword_id: string; checked_at: string; position: number | null; ranking_url: string | null;
  match_type: string | null; top_results: Array<{ pos: number; title: string; url: string }>; source: string;
}
/** Kept in step with the server's Intent union. Declared here rather than
 *  imported so nothing in this client file can reach into the server module. */
type Intent = "T" | "C" | "I" | "N";
interface Metrics { k: string; v: number; i: Intent; kd: number; c: number }
interface Analysis {
  kw: string; vol: number; intent: Intent; kd: number; cpc: number;
  trend: string; related: Metrics[]; costUsd: number;
}
interface Spend { monthUsd: number; budgetUsd: number; remainingUsd: number; overBudget: boolean }

/* ------------------------------ helpers ------------------------------ */

const INTENT: Record<string, { label: string; tone: string }> = {
  T: { label: "Ready to buy", tone: "var(--color-ok)" },
  C: { label: "Comparing options", tone: "var(--color-warn)" },
  I: { label: "Looking for information", tone: "var(--color-text-muted)" },
  N: { label: "Looking for a specific site", tone: "var(--color-accent)" },
};

function kdInfo(kd: number) {
  if (kd < 15) return { label: "Very easy", hex: "#10b981" };
  if (kd < 30) return { label: "Easy", hex: "#22c55e" };
  if (kd < 50) return { label: "Possible", hex: "#eab308" };
  if (kd < 70) return { label: "Difficult", hex: "#f97316" };
  if (kd < 85) return { label: "Hard", hex: "#ef4444" };
  return { label: "Very hard", hex: "#b91c1c" };
}

const fmt = (n: number | null) => (typeof n === "number" && !isNaN(n) ? n.toLocaleString("en-US") : "—");
const weeklyOf = (v: number) => Math.round(v / 4.33);
const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

const STOP = new Set(["a","an","the","and","or","of","to","in","on","at","for","is","are","do","does","me","my","you","your","it","with","i"]);
const QWORDS = new Set(["how","what","why","when","where","who","which","can","do","does","is","are","should","will"]);
const isQuestion = (k: string) => QWORDS.has(k.toLowerCase().trim().split(/\s+/)[0]);

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const dateShort = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return "—"; } };

const EXAMPLES = ["screen printing near me", "custom embroidered hats", "asset protection trust", "dtf transfers wholesale"];

/* --------------------------- small components ------------------------ */

function KdDonut({ kd }: { kd: number }) {
  const info = kdInfo(kd);
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--color-border)" strokeWidth="3.8" />
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke={info.hex} strokeWidth="3.8"
          strokeDasharray={`${kd}, 100`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-semibold tabular-nums">{kd}</span>
      </div>
    </div>
  );
}

function IntentChip({ code }: { code: string }) {
  const meta = INTENT[code] ?? INTENT.C;
  return (
    <span title={meta.label} className="inline-flex h-5 w-6 items-center justify-center rounded border text-[10px] font-bold"
      style={{ borderColor: meta.tone, color: meta.tone }}>
      {code}
    </span>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const map: Record<string, { icon: typeof TrendingUp; label: string; tone: string }> = {
    rising: { icon: TrendingUp, label: "Rising", tone: "var(--color-ok)" },
    declining: { icon: TrendingDown, label: "Declining", tone: "var(--color-bad)" },
    stable: { icon: Minus, label: "Steady", tone: "var(--color-text-muted)" },
  };
  const m = map[trend] ?? map.stable;
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{ borderColor: m.tone, color: m.tone }}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function PosBadge({ check }: { check: CheckRow | undefined }) {
  if (!check) return <span className="text-[var(--color-text-subtle)]">—</span>;
  if (check.position == null) {
    return <span className="text-[10px] text-[var(--color-text-subtle)]" title="Not in the top 10 organic results">&gt;10</span>;
  }
  const tone = check.position <= 3 ? "var(--color-ok)" : "var(--color-accent)";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex h-6 items-center rounded border px-2 text-xs font-semibold tabular-nums"
        style={{ borderColor: tone, color: tone }}>{check.position}</span>
      {check.match_type === "domain" && (
        <span style={{ color: "var(--color-warn)" }} title="A different page on the site is ranking, not the target">*</span>
      )}
    </span>
  );
}

function DeltaBadge({ checks }: { checks: CheckRow[] }) {
  if (checks.length < 2) return <span className="text-[10px] text-[var(--color-text-subtle)]">—</span>;
  const cur = checks[0].position;
  const prev = checks[1].position;
  if (prev == null && cur == null) return <span className="text-[10px] text-[var(--color-text-subtle)]">—</span>;
  if (prev == null) return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "var(--color-ok)" }}><ArrowUp className="h-3 w-3" /> in</span>;
  if (cur == null) return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "var(--color-bad)" }}><ArrowDown className="h-3 w-3" /> out</span>;
  const diff = prev - cur;
  if (diff === 0) return <span className="text-[10px] text-[var(--color-text-subtle)]">0</span>;
  const up = diff > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums" style={{ color: up ? "var(--color-ok)" : "var(--color-bad)" }}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />} {Math.abs(diff)}
    </span>
  );
}

/* ------------------------------- main -------------------------------- */

export default function KeywordLab({
  sites, keywords, checks, spend, costs,
}: {
  sites: Site[]; keywords: KeywordRow[]; checks: CheckRow[];
  spend: Spend; costs: { analyze: number; rankCheck: number };
}) {
  const [view, setView] = useState<"research" | "tracking">(keywords.length > 0 ? "tracking" : "research");
  const [input, setInput] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "questions">("all");
  const [group, setGroup] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"v" | "kd" | "c">("v");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const [pickerUrl, setPickerUrl] = useState("");
  const [activeSite, setActiveSite] = useState<string | null>(sites[0]?.id ?? null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [liveSpend, setLiveSpend] = useState(spend);
  const [pending, start] = useTransition();

  const checksFor = useMemo(() => {
    const m = new Map<string, CheckRow[]>();
    for (const c of checks) {
      const list = m.get(c.keyword_id) ?? [];
      list.push(c);
      m.set(c.keyword_id, list);
    }
    return m;
  }, [checks]);

  const trackedPhrases = useMemo(() => new Set(keywords.map((k) => k.phrase.toLowerCase())), [keywords]);

  function analyze(seed: string) {
    const q = seed.trim();
    if (!q || pending) return;
    setError(null); setNotice(null); setData(null); setSelected(new Set()); setGroup(null); setTab("all");
    setView("research");
    start(async () => {
      const res = await analyzeAction(q);
      if (res.error) return setError(res.error);
      setData(res.result ?? null);
      if (res.spend) setLiveSpend(res.spend);
    });
  }

  const groups = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const r of data.related) {
      const words = new Set(r.k.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
      for (const w of words) counts[w] = (counts[w] ?? 0) + 1;
    }
    return Object.entries(counts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = [...data.related];
    if (tab === "questions") r = r.filter((x) => isQuestion(x.k));
    if (group) r = r.filter((x) => x.k.toLowerCase().split(/[^a-z0-9]+/).includes(group));
    r.sort((a, b) => (sortDir === "desc" ? b[sortField] - a[sortField] : a[sortField] - b[sortField]));
    return r;
  }, [data, tab, group, sortField, sortDir]);

  function toggleSort(f: "v" | "kd" | "c") {
    if (sortField === f) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(f); setSortDir("desc"); }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.k));

  function track(siteId: string) {
    if (!data) return;
    const items = data.related.filter((r) => selected.has(r.k));
    const chosen = items.length > 0 ? items : [{ k: data.kw, v: data.vol, i: data.intent, kd: data.kd, c: data.cpc }];
    start(async () => {
      const res = await trackKeywordsAction({ siteId, keywords: chosen, targetUrl: pickerUrl });
      setPicker(false); setPickerUrl(""); setSelected(new Set());
      if (res.error) return setError(res.error);
      setNotice(
        `Tracking ${res.added} keyword${res.added === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} already tracked)` : ""}. They appear on that site's Rankings tab too.`,
      );
    });
  }

  function runCheck(keywordId: string) {
    setBusy((s) => new Set(s).add(keywordId));
    start(async () => {
      const res = await checkRankAction({ keywordId });
      setBusy((s) => { const n = new Set(s); n.delete(keywordId); return n; });
      if (res.error) setError(res.error);
      else if (typeof res.costUsd === "number") {
        setLiveSpend((p) => ({ ...p, monthUsd: Math.round((p.monthUsd + res.costUsd!) * 1000) / 1000 }));
      }
    });
  }

  const siteKeywords = keywords.filter((k) => k.site_id === activeSite);

  async function checkAll() {
    const list = siteKeywords.map((k) => k.id);
    if (list.length === 0) return;
    setBulk({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const res = await checkRankAction({ keywordId: list[i] });
      if (res.error) { setError(res.error); break; }
      setBulk({ done: i + 1, total: list.length });
    }
    setBulk(null);
    setNotice("Ranking check complete.");
  }

  function exportCsv() {
    const site = sites.find((s) => s.id === activeSite);
    const lines = [
      ["Keyword", "Intent", "Est. volume", "KD", "Target URL", "Position", "Match", "Ranking URL", "Checked"],
      ...siteKeywords.map((k) => {
        const c = checksFor.get(k.id)?.[0];
        return [
          k.phrase, k.intent ?? "", k.volume ?? "", k.kd ?? "", k.target_url ?? "",
          c ? (c.position == null ? "Not in top 10" : c.position) : "",
          c?.match_type ?? "", c?.ranking_url ?? "", c ? new Date(c.checked_at).toLocaleString("en-US") : "",
        ];
      }),
    ];
    const csv = [
      ...lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
      "",
      '"Volume and difficulty are AI-estimated, not Google data. Positions are read from live search results."',
      '"Prepared by F1 Media Team"',
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${site?.domain ?? "site"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "px-3 py-2 text-[10px] font-normal uppercase tracking-widest text-[var(--color-text-subtle)]";
  const panel = "rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]";

  return (
    <div>
      {/* -------------------------- header row -------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
          {(["research", "tracking"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                view === v ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}>
              {v === "research" ? "Research" : `Tracking${keywords.length ? ` (${keywords.length})` : ""}`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--color-text-subtle)]">
          <span>
            This month: <span className="tabular-nums text-[var(--color-text-muted)]">{money(liveSpend.monthUsd)}</span>
            {" of "}
            <span className="tabular-nums">{money(liveSpend.budgetUsd)}</span>
          </span>
          <span className="h-3 w-px bg-[var(--color-border)]" />
          <span>research {money(costs.analyze)} · check {money(costs.rankCheck)}</span>
        </div>
      </div>

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--color-ok)", color: "var(--color-text-muted)" }}>
          <Target className="h-4 w-4 shrink-0" style={{ color: "var(--color-ok)" }} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--color-bad)", color: "var(--color-bad)" }} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* =========================== RESEARCH =========================== */}
      {view === "research" && (
        <div className="space-y-4">
          <div className={`${panel} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-[260px] flex-1 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
                <Search className="ml-3 h-4 w-4 shrink-0 text-[var(--color-text-subtle)]" />
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") analyze(input); }}
                  placeholder="A keyword, e.g. screen printing near me"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" />
              </div>
              <button type="button" onClick={() => analyze(input)} disabled={pending || !input.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {pending ? "Working…" : `Research · ${money(costs.analyze)}`}
              </button>
            </div>
            {!data && !pending && (
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} type="button" onClick={() => { setInput(e); analyze(e); }}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {pending && !data && (
            <div className={`${panel} p-8 text-center text-xs text-[var(--color-text-muted)]`}>
              <RefreshCw className="mx-auto mb-2 h-4 w-4 animate-spin" />
              Estimating volume, intent, difficulty and related terms…
            </div>
          )}

          {data && (
            <>
              {/* seed card */}
              <div className={`${panel} flex flex-wrap items-center gap-x-8 gap-y-4 p-4`}>
                <div className="min-w-[180px]">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Keyword</div>
                  <div className="mt-0.5 text-lg font-semibold">{data.kw}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <IntentChip code={data.intent} />
                    <span className="text-[10px] text-[var(--color-text-muted)]">{INTENT[data.intent]?.label}</span>
                    <TrendBadge trend={data.trend} />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Searches a month</div>
                  <div className="text-2xl font-semibold tabular-nums">{fmt(data.vol)}</div>
                  <div className="text-[10px] text-[var(--color-text-subtle)]">about {fmt(weeklyOf(data.vol))} a week</div>
                </div>
                <div className="flex items-center gap-3">
                  <KdDonut kd={data.kd} />
                  <div>
                    <div className="text-xs font-semibold">{kdInfo(data.kd).label}</div>
                    <div className="text-[10px] text-[var(--color-text-subtle)]">to reach the top 10</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">Ad cost per click</div>
                  <div className="text-lg font-semibold tabular-nums">${data.cpc.toFixed(2)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
                These figures are estimated by AI, not read from Google. They are calibrated well enough to
                choose between two keywords and are not accurate enough to put in front of a client as fact.
                Positions on the Tracking tab are different — those are read from live search results.
              </div>

              {/* actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
                  <button type="button" onClick={() => setTab("all")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "all" ? "bg-[var(--color-bg-hover)]" : "text-[var(--color-text-muted)]"}`}>
                    All ideas ({data.related.length})
                  </button>
                  <button type="button" onClick={() => setTab("questions")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "questions" ? "bg-[var(--color-bg-hover)]" : "text-[var(--color-text-muted)]"}`}>
                    Questions ({data.related.filter((r) => isQuestion(r.k)).length})
                  </button>
                </div>

                <div className="relative flex items-center gap-2">
                  <button type="button" onClick={() => setPicker(!picker)} disabled={sites.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> Track{selected.size > 0 ? ` ${selected.size}` : " this"}
                  </button>

                  {picker && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setPicker(false)} />
                      <div className={`absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden ${panel} shadow-lg`}>
                        <div className="border-b border-[var(--color-border)] px-3 py-2">
                          <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                            Page it should rank
                          </div>
                          <input value={pickerUrl} onChange={(e) => setPickerUrl(e.target.value)}
                            placeholder="/screen-printing  ·  blank = homepage"
                            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 text-[11px] outline-none" />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {sites.map((s) => (
                            <button key={s.id} type="button" onClick={() => track(s.id)}
                              className="flex w-full items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left last:border-0 hover:bg-[var(--color-bg-hover)]">
                              {s.colour && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: s.colour }} />}
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-medium">{s.clientName}</span>
                                <span className="block truncate font-mono text-[10px] text-[var(--color-text-subtle)]">{s.domain}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* table + groups */}
              <div className="flex items-start gap-4">
                {groups.length > 0 && (
                  <div className={`hidden w-44 shrink-0 overflow-hidden md:block ${panel}`}>
                    <div className="border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                      Themes
                    </div>
                    <button type="button" onClick={() => setGroup(null)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-xs ${group === null ? "bg-[var(--color-bg-hover)] font-medium" : "text-[var(--color-text-muted)]"}`}>
                      <span>Everything</span><span className="tabular-nums">{data.related.length}</span>
                    </button>
                    {groups.map(([w, c]) => (
                      <button key={w} type="button" onClick={() => setGroup(group === w ? null : w)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-xs ${group === w ? "bg-[var(--color-bg-hover)] font-medium" : "text-[var(--color-text-muted)]"}`}>
                        <span className="truncate pr-2">{w}</span><span className="tabular-nums">{c}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className={`min-w-0 flex-1 overflow-hidden ${panel}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="w-8 px-3 py-2">
                            <input type="checkbox" checked={allSelected}
                              onChange={() => setSelected((prev) => {
                                const n = new Set(prev);
                                if (allSelected) rows.forEach((r) => n.delete(r.k));
                                else rows.forEach((r) => n.add(r.k));
                                return n;
                              })} />
                          </th>
                          <th className={th}>Keyword</th>
                          <th className={`${th} text-center`}>Intent</th>
                          <th className={`${th} text-right`}>
                            <button type="button" onClick={() => toggleSort("v")} className="inline-flex items-center gap-1">
                              Searches <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className={`${th} text-right`}>
                            <button type="button" onClick={() => toggleSort("kd")} className="inline-flex items-center gap-1">
                              Difficulty <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className={`${th} text-right`}>
                            <button type="button" onClick={() => toggleSort("c")} className="inline-flex items-center gap-1">
                              CPC <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.k} className="border-b border-[var(--color-border)] last:border-0">
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={selected.has(r.k)}
                                onChange={() => setSelected((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(r.k)) n.delete(r.k); else n.add(r.k);
                                  return n;
                                })} />
                            </td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <button type="button" onClick={() => { setInput(r.k); analyze(r.k); }}
                                  className="text-left hover:underline" style={{ color: "var(--color-accent)" }}>
                                  {r.k}
                                </button>
                                {trackedPhrases.has(r.k.toLowerCase()) && (
                                  <Target className="h-3 w-3 shrink-0" style={{ color: "var(--color-ok)" }} />
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center"><IntentChip code={r.i} /></td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.v)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <span className="tabular-nums">{r.kd}</span>
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: kdInfo(r.kd).hex }} />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-muted)]">${r.c.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================== TRACKING =========================== */}
      {view === "tracking" && (
        <div className="flex items-start gap-4">
          <div className={`w-52 shrink-0 overflow-hidden ${panel}`}>
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
              Sites
            </div>
            {sites.map((s) => {
              const n = keywords.filter((k) => k.site_id === s.id).length;
              return (
                <button key={s.id} type="button" onClick={() => { setActiveSite(s.id); setExpanded(null); }}
                  className={`flex w-full items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5 text-left last:border-0 ${
                    activeSite === s.id ? "bg-[var(--color-bg-hover)]" : ""
                  }`}>
                  {s.colour && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: s.colour }} />}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{s.clientName}</span>
                    <span className="block text-[10px] text-[var(--color-text-subtle)]">{n} keyword{n === 1 ? "" : "s"}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <a href={`https://${sites.find((s) => s.id === activeSite)?.domain ?? ""}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs" style={{ color: "var(--color-accent)" }}>
                {sites.find((s) => s.id === activeSite)?.domain} <ExternalLink className="h-3 w-3" />
              </a>
              <div className="flex items-center gap-2">
                <button type="button" onClick={checkAll} disabled={bulk !== null || siteKeywords.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  title={`About ${money(siteKeywords.length * costs.rankCheck)} for ${siteKeywords.length} keywords`}>
                  {bulk ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {bulk.done}/{bulk.total}</>
                        : <><RefreshCw className="h-3.5 w-3.5" /> Check all · {money(siteKeywords.length * costs.rankCheck)}</>}
                </button>
                <button type="button" onClick={exportCsv} disabled={siteKeywords.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </div>
            </div>

            <div className={`overflow-hidden ${panel}`}>
              {siteKeywords.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-[var(--color-text-muted)]">
                  Nothing tracked for this site yet. Research a keyword and press Track.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="w-6 px-2 py-2" />
                        <th className={th}>Keyword</th>
                        <th className={`${th} text-right`}>Searches</th>
                        <th className={`${th} text-right`}>Difficulty</th>
                        <th className={th}>Target page</th>
                        <th className={`${th} text-center`}>Position</th>
                        <th className={`${th} text-center`}>Change</th>
                        <th className={`${th} text-right`}>Checked</th>
                        <th className={`${th} text-right`} />
                      </tr>
                    </thead>
                    <tbody>
                      {siteKeywords.map((k) => {
                        const kchecks = checksFor.get(k.id) ?? [];
                        const last = kchecks[0];
                        const open = expanded === k.id;
                        const working = busy.has(k.id);
                        return (
                          <Fragment key={k.id}>
                            <tr className="border-b border-[var(--color-border)]">
                              <td className="px-2 py-2 text-center">
                                <button type="button" onClick={() => setExpanded(open ? null : k.id)}
                                  className="text-[var(--color-text-subtle)]">
                                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <span className="flex items-center gap-1.5">
                                  <span className="font-medium">{k.phrase}</span>
                                  {k.intent && <IntentChip code={k.intent} />}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-text-muted)]">{fmt(k.volume)}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="tabular-nums">{k.kd ?? "—"}</span>
                                  {k.kd != null && <span className="h-2 w-2 rounded-full" style={{ background: kdInfo(k.kd).hex }} />}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input defaultValue={k.target_url ?? ""} placeholder="homepage"
                                  onBlur={(e) => {
                                    if (e.target.value !== (k.target_url ?? "")) {
                                      start(async () => { await setTargetUrlAction({ keywordId: k.id, url: e.target.value }); });
                                    }
                                  }}
                                  className="w-full max-w-[200px] truncate rounded border border-transparent bg-transparent px-1.5 py-1 font-mono text-[10px] text-[var(--color-text-subtle)] hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none" />
                              </td>
                              <td className="px-3 py-2 text-center"><PosBadge check={last} /></td>
                              <td className="px-3 py-2 text-center"><DeltaBadge checks={kchecks} /></td>
                              <td className="px-3 py-2 text-right text-[10px] text-[var(--color-text-subtle)]">
                                {last ? dateShort(last.checked_at) : "never"}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-1">
                                  <button type="button" onClick={() => runCheck(k.id)} disabled={working || bulk !== null}
                                    title={`Check now · about ${money(costs.rankCheck)}`}
                                    className="rounded border border-[var(--color-border)] p-1.5 text-[var(--color-text-subtle)] hover:text-[var(--color-text)] disabled:opacity-40">
                                    {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                  </button>
                                  <button type="button"
                                    onClick={() => start(async () => { await removeKeywordAction(k.id); })}
                                    title="Stop tracking — this discards its history"
                                    className="rounded border border-[var(--color-border)] p-1.5 text-[var(--color-text-subtle)] hover:text-[var(--color-bad)]">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {open && (
                              <tr className="border-b border-[var(--color-border)]">
                                <td colSpan={9} className="bg-[var(--color-bg-elev)] px-5 py-4">
                                  {!last ? (
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                      Not checked yet. Press the refresh button on this row to read the live results.
                                    </p>
                                  ) : (
                                    <div className="grid gap-5 md:grid-cols-2">
                                      <div>
                                        <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                                          Who ranks — {dateShort(last.checked_at)}
                                        </div>
                                        <div className="space-y-1">
                                          {(last.top_results ?? []).map((t) => {
                                            const domain = sites.find((s) => s.id === k.site_id)?.domain ?? "";
                                            const mine = hostOf(t.url) === domain || hostOf(t.url).endsWith(`.${domain}`);
                                            return (
                                              <div key={`${t.pos}-${t.url}`}
                                                className={`flex items-start gap-2 rounded px-2 py-1 text-[11px] ${mine ? "border" : ""}`}
                                                style={mine ? { borderColor: "var(--color-accent)" } : undefined}>
                                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                                                  style={{ background: mine ? "var(--color-accent)" : "var(--color-bg-hover)", color: mine ? "#fff" : "var(--color-text-muted)" }}>
                                                  {t.pos}
                                                </span>
                                                <span className="min-w-0">
                                                  <span className="block truncate">{t.title || hostOf(t.url)}</span>
                                                  <span className="block truncate text-[10px] text-[var(--color-text-subtle)]">{hostOf(t.url)}</span>
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">History</div>
                                        {last.match_type === "domain" && last.ranking_url && (
                                          <p className="mb-2 rounded border px-2 py-1.5 text-[10px] leading-relaxed"
                                            style={{ borderColor: "var(--color-warn)", color: "var(--color-text-muted)" }}>
                                            A different page is ranking, not the target: <span className="break-all">{last.ranking_url}</span>
                                          </p>
                                        )}
                                        <div className="space-y-1">
                                          {kchecks.map((c) => (
                                            <div key={c.checked_at} className="flex items-center gap-3 text-[11px]">
                                              <span className="w-14 shrink-0 tabular-nums text-[var(--color-text-subtle)]">{dateShort(c.checked_at)}</span>
                                              {c.position == null
                                                ? <span className="text-[var(--color-text-subtle)]">not in top 10</span>
                                                : <span className="font-semibold tabular-nums">#{c.position}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
              Positions are read from live search results, desktop and non-localised. A &quot;near me&quot; term
              will rank differently for someone standing in the client&apos;s town, so treat those as directional.
              A <span style={{ color: "var(--color-warn)" }}>*</span> means the site ranks with a different page
              than the target — open the row to see which.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
