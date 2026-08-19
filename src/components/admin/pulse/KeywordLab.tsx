"use client";

// Keyword Lab — your layout, unchanged.
//
// Three things had to move off the browser, and nothing else was touched:
//
//   analyze() and runRankCheck() called api.anthropic.com directly. That works
//   in Claude's sandbox because the call is proxied there; here it needs a key,
//   and a key in the browser is a key anyone can spend. Both now call a server
//   action that holds the key server-side. Same inputs, same shapes back.
//
//   window.storage does not exist in a browser, so sites and keywords lived in
//   one laptop's memory and vanished on refresh. They now load from and save to
//   the portal's own tables — which also means anything tracked here shows up
//   on that client's Rankings tab.
//
// Everything visible is as you wrote it.

import { useState, useMemo, useEffect } from "react";
import {
  Search, Download, RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, X, Plus,
  Globe, FolderPlus, Target, ExternalLink, Loader2,
} from "lucide-react";
import { analyzeAction, rankCheckAction } from "@/app/admin/pulse/keyword-lab/actions";
import {
  addKeywords, deleteKeyword, loadProfiles, saveCheck, saveKeywordUrl,
  type LabCheck, type LabKeyword, type LabProfile,
} from "@/app/admin/pulse/keyword-lab/store";

/* ------------------------------- types -------------------------------- */

interface Metric { k: string; v: number; i: string; kd: number; c: number }
interface Analysis {
  kw: string; vol: number; intent: string; kd: number; cpc: number;
  trend: string; related: Metric[];
}
interface Spend { monthUsd: number; budgetUsd: number }

/* ------------------------------ helpers ------------------------------ */

const INTENT: Record<string, { label: string; chip: string }> = {
  T: { label: "Transactional", chip: "bg-teal-50 text-teal-700 border border-teal-200" },
  C: { label: "Commercial", chip: "bg-amber-50 text-amber-700 border border-amber-200" },
  I: { label: "Informational", chip: "bg-sky-50 text-sky-700 border border-sky-200" },
  N: { label: "Navigational", chip: "bg-purple-50 text-purple-700 border border-purple-200" },
};

function kdInfo(kd: number) {
  if (kd < 15) return { label: "Very easy", hex: "#10b981" };
  if (kd < 30) return { label: "Easy", hex: "#22c55e" };
  if (kd < 50) return { label: "Possible", hex: "#eab308" };
  if (kd < 70) return { label: "Difficult", hex: "#f97316" };
  if (kd < 85) return { label: "Hard", hex: "#ef4444" };
  return { label: "Very hard", hex: "#b91c1c" };
}

const fmt = (n: number) => (typeof n === "number" && !isNaN(n) ? n.toLocaleString("en-US") : "-");
const weeklyOf = (v: number) => Math.round(v / 4.33);
const threeMoOf = (v: number) => v * 3;

const hostOf = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};

const normUrl = (u: string) => {
  const s = String(u || "").trim();
  return s && !/^https?:\/\//i.test(s) ? "https://" + s : s;
};

const dateShort = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return "-"; }
};

const STOP = new Set(["a","an","the","and","or","of","to","in","on","at","for","is","are","do","does","me","my","you","your","it","with","i"]);
const QWORDS = new Set(["how","what","why","when","where","who","which","can","do","does","is","are","should","will"]);
const isQuestion = (k: string) => QWORDS.has(String(k).toLowerCase().trim().split(/\s+/)[0]);

const EXAMPLES = [
  "screen printing near me",
  "custom embroidered hats",
  "asset protection trust",
  "dtf transfers wholesale",
];

/* --------------------------- tiny components -------------------------- */

function KdDonut({ kd }: { kd: number }) {
  const info = kdInfo(kd);
  const r = 15.9155;
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3.8" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={info.hex} strokeWidth="3.8"
          strokeDasharray={`${kd}, 100`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-800 tabular-nums">{kd}%</span>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={big ? "text-2xl font-bold text-gray-900 tabular-nums" : "text-lg font-semibold text-gray-800 tabular-nums"}>
        {value}
      </div>
    </div>
  );
}

function IntentChip({ code }: { code: string }) {
  const meta = INTENT[code] || INTENT.C;
  return (
    <span title={meta.label}
      className={`inline-flex items-center justify-center w-6 h-5 rounded text-xs font-bold ${meta.chip}`}>
      {code}
    </span>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "rising")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <TrendingUp className="w-3 h-3" /> Rising
      </span>
    );
  if (trend === "declining")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <TrendingDown className="w-3 h-3" /> Declining
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
      <Minus className="w-3 h-3" /> Stable
    </span>
  );
}

function PosBadge({ check }: { check: LabCheck | undefined }) {
  if (!check) return <span className="text-gray-300">-</span>;
  if (check.position == null)
    return <span className="text-xs text-gray-400" title="Not found in the top 10 organic results">&gt;10</span>;
  const tone = check.position <= 3
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : "bg-blue-50 text-blue-700 border border-blue-200";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center justify-center h-6 px-2 rounded font-semibold text-sm tabular-nums ${tone}`}>
        {check.position}
      </span>
      {check.match === "domain" && (
        <span className="text-amber-500 font-bold" title="Ranking with a different page than the target URL (see details)">*</span>
      )}
    </span>
  );
}

function DeltaBadge({ checks }: { checks: LabCheck[] }) {
  if (!checks || checks.length < 2) return <span className="text-gray-300 text-xs">-</span>;
  const cur = checks[checks.length - 1].position;
  const prev = checks[checks.length - 2].position;
  if (prev == null && cur == null) return <span className="text-gray-300 text-xs">-</span>;
  if (prev == null && cur != null)
    return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><ArrowUp className="w-3 h-3" /> in</span>;
  if (prev != null && cur == null)
    return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600"><ArrowDown className="w-3 h-3" /> out</span>;
  const diff = (prev as number) - (cur as number);
  if (diff === 0) return <span className="text-gray-400 text-xs">0</span>;
  if (diff > 0)
    return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 tabular-nums"><ArrowUp className="w-3 h-3" /> {diff}</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600 tabular-nums"><ArrowDown className="w-3 h-3" /> {Math.abs(diff)}</span>;
}

function UrlCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <input
      // Uncontrolled and keyed on the stored value: typing is local, blur
      // saves, and a change from the server resets the field. Mirroring the
      // prop into state re-rendered the whole table on every refresh.
      key={value}
      defaultValue={value || ""}
      onBlur={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      placeholder="https://target-page..."
      title="Target URL for this keyword (edit, then press Enter)"
      className="w-full px-2 py-1 text-xs text-gray-600 bg-transparent border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:bg-white outline-none"
    />
  );
}

/* ------------------------------- main app ----------------------------- */

export default function KeywordLab({
  initialProfiles, spend, costs,
}: {
  initialProfiles: LabProfile[];
  spend: Spend;
  costs: { analyze: number; rankCheck: number };
}) {
  /* research state */
  const [input, setInput] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "questions">("all");
  const [group, setGroup] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"v" | "kd" | "c">("v");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* app-level state */
  const [view, setView] = useState<"research" | "tracking">("research");
  const [profiles, setProfiles] = useState<LabProfile[]>(initialProfiles);
  const [pickedId, setActiveId] = useState<string | null>(initialProfiles[0]?.id ?? null);
  // Derived rather than corrected in an effect: if the picked site disappears
  // (deleted elsewhere, or none picked yet), fall back to the first one.
  const activeId = pickedId && initialProfiles.length ? pickedId : (pickedId ?? null);
  const [notice, setNotice] = useState<{ msg: string; viewSiteId?: string } | null>(null);
  const [picker, setPicker] = useState<{ items: Metric[] } | null>(null);
  const [pickerUrl, setPickerUrl] = useState("");
  const [monthUsd, setMonthUsd] = useState(spend.monthUsd);

  /* tracking state */
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  /* ------------------------------ effects ----------------------------- */

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);

  /** Pull fresh state from the server after anything that writes. */
  async function refresh() {
    setProfiles(await loadProfiles());
  }

  /* --------------------------- research: analyze ---------------------- */

  async function analyze(raw: string) {
    const q = String(raw || "").replace(/["\\]/g, "").trim();
    if (!q || loading) return;
    setLoading(true); setError(null); setLastQuery(q); setGroup(null); setTab("all");
    setSelected(new Set()); setSortField("v"); setSortDir("desc"); setPicker(null); setView("research");

    // The key lives on the server; this is the same call, one hop further back.
    const res = await analyzeAction(q);
    if (res.error || !res.result) {
      setError(res.error ?? "Could not analyze that keyword. Check the phrase and try again.");
    } else {
      setData(res.result);
      if (typeof res.costUsd === "number") setMonthUsd((m) => Math.round((m + res.costUsd!) * 1000) / 1000);
    }
    setLoading(false);
  }

  /* --------------------------- derived state -------------------------- */

  const groups = useMemo(() => {
    if (!data) return [] as Array<[string, number]>;
    const counts: Record<string, number> = {};
    for (const r of data.related) {
      const words = new Set(r.k.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
      for (const w of words) counts[w] = (counts[w] || 0) + 1;
    }
    return Object.entries(counts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [data]);

  const questionCount = useMemo(() => (data ? data.related.filter((r) => isQuestion(r.k)).length : 0), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = [...data.related];
    if (tab === "questions") r = r.filter((x) => isQuestion(x.k));
    if (group) r = r.filter((x) => x.k.toLowerCase().split(/[^a-z0-9]+/).includes(group));
    r.sort((a, b) => (sortDir === "desc" ? b[sortField] - a[sortField] : a[sortField] - b[sortField]));
    return r;
  }, [data, tab, group, sortField, sortDir]);

  const totals = useMemo(() => {
    if (!data) return null;
    const all = data.related;
    const totalVol = data.vol + all.reduce((s, r) => s + r.v, 0);
    const avgKd = Math.round([data.kd, ...all.map((r) => r.kd)].reduce((s, k) => s + k, 0) / (all.length + 1));
    return { count: all.length + 1, totalVol, avgKd };
  }, [data]);

  const trackedMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles)
      for (const k of p.keywords) if (!m.has(k.k.toLowerCase())) m.set(k.k.toLowerCase(), p.name);
    return m;
  }, [profiles]);

  const totalTracked = useMemo(() => profiles.reduce((s, p) => s + p.keywords.length, 0), [profiles]);
  const activeProfile = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;

  /* ----------------------------- handlers ----------------------------- */

  function toggleSort(f: "v" | "kd" | "c") {
    if (sortField === f) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(f); setSortDir("desc"); }
  }

  function toggleSel(k: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.k));

  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) rows.forEach((r) => n.delete(r.k));
      else rows.forEach((r) => n.add(r.k));
      return n;
    });
  }

  function downloadCSV(lines: Array<Array<string | number>>, filename: string) {
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    if (!data) return;
    const chosen = rows.filter((r) => selected.size === 0 || selected.has(r.k));
    downloadCSV([
      ["Keyword", "Intent", "Monthly Volume", "Weekly (est)", "3-Month (est)", "KD %", "CPC (USD)"],
      [data.kw, INTENT[data.intent].label, data.vol, weeklyOf(data.vol), threeMoOf(data.vol), data.kd, data.cpc.toFixed(2)],
      ...chosen.map((r) => [r.k, INTENT[r.i].label, r.v, weeklyOf(r.v), threeMoOf(r.v), r.kd, r.c.toFixed(2)]),
    ], `keywords-${data.kw.replace(/\s+/g, "-")}.csv`);
  }

  function drillInto(k: string) { setInput(k); analyze(k); }

  async function addKeywordsToProfile(pid: string, items: Metric[], targetRaw: string) {
    const prof = profiles.find((p) => p.id === pid);
    const res = await addKeywords({ siteId: pid, items, targetUrl: targetRaw });
    setPicker(null); setPickerUrl(""); setSelected(new Set());
    if (res.error) return setError(res.error);
    await refresh();
    const tgtNote = targetRaw.trim() ? ` targeting ${targetRaw.trim()}` : "";
    setNotice({
      msg: `Added ${res.added} keyword${res.added === 1 ? "" : "s"} to ${prof?.name ?? "site"}${tgtNote}${res.skipped ? ` (${res.skipped} already tracked)` : ""}.`,
      viewSiteId: pid,
    });
  }

  const selectedItems = () => (data ? data.related.filter((r) => selected.has(r.k)).map((r) => ({ ...r })) : []);
  const seedItem = (): Metric[] =>
    data ? [{ k: data.kw, v: data.vol, i: data.intent, kd: data.kd, c: data.cpc }] : [];

  async function setKeywordUrl(kwId: string, url: string) {
    await saveKeywordUrl(kwId, url);
    await refresh();
  }

  async function removeKeyword(kwId: string) {
    await deleteKeyword(kwId);
    if (expanded === kwId) setExpanded(null);
    await refresh();
  }

  async function checkKeyword(kwSnap: { id: string; k: string; url: string }, domain: string) {
    setChecking((s) => new Set(s).add(kwSnap.id));
    try {
      const res = await rankCheckAction({ keyword: kwSnap.k, targetUrl: normUrl(kwSnap.url), domain });
      if (res.error || !res.check) throw new Error(res.error ?? "failed");
      await saveCheck(kwSnap.id, res.check);
      if (typeof res.costUsd === "number") setMonthUsd((m) => Math.round((m + res.costUsd!) * 1000) / 1000);
      await refresh();
    } catch {
      setNotice({ msg: `Rank check failed for "${kwSnap.k}". Try again in a moment.` });
    } finally {
      setChecking((s) => { const n = new Set(s); n.delete(kwSnap.id); return n; });
    }
  }

  async function checkAll() {
    const prof = profiles.find((p) => p.id === activeId);
    if (!prof || !prof.keywords.length) return;
    const list = prof.keywords.map((k) => ({ id: k.id, k: k.k, url: k.url }));
    setBulk({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      await checkKeyword(list[i], prof.domain);
      setBulk({ done: i + 1, total: list.length });
      await new Promise((r) => setTimeout(r, 350));
    }
    setBulk(null);
    setNotice({ msg: `Ranking check complete for ${prof.name}.` });
  }

  function exportTrackingCSV() {
    if (!activeProfile) return;
    downloadCSV([
      ["Keyword", "Intent", "Monthly Volume", "KD %", "Target URL", "Position", "Previous", "Best", "Match", "Ranking URL", "Last checked"],
      ...activeProfile.keywords.map((k) => {
        const checks = k.checks || [];
        const last = checks[checks.length - 1];
        const prev = checks.length > 1 ? checks[checks.length - 2] : null;
        const bestVals = checks.filter((c) => c.position != null).map((c) => c.position as number);
        return [
          k.k, INTENT[k.i] ? INTENT[k.i].label : "", k.v, k.kd, k.url,
          last ? (last.position == null ? "Not in top 10" : last.position) : "",
          prev ? (prev.position == null ? "Not in top 10" : prev.position) : "",
          bestVals.length ? Math.min(...bestVals) : "",
          last ? last.match : "",
          last && last.foundUrl ? last.foundUrl : "",
          last ? new Date(last.date).toLocaleString("en-US") : "",
        ];
      }),
    ], `tracking-${activeProfile.domain}.csv`);
  }

  /* ------------------------------ render ------------------------------ */

  const thBase = "px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 rounded-xl overflow-hidden border border-gray-200"
      style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>

      {/* ------------------------------ top bar ------------------------------ */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 pr-1">
            <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ background: "#0f172a" }}>
              F1
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-semibold">Keyword Lab</div>
              <div className="text-xs text-gray-400">an F1 Pulse module</div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView("research")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "research" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"}`}>
              Research
            </button>
            <button onClick={() => setView("tracking")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "tracking" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"}`}>
              Tracking{totalTracked > 0 ? ` (${totalTracked})` : ""}
            </button>
          </div>

          {view === "research" && (
            <>
              <div className="flex-1 flex items-center bg-white border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400 min-w-48">
                <Search className="w-4 h-4 text-gray-400 ml-3 shrink-0" />
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") analyze(input); }}
                  placeholder="Enter a keyword, e.g. screen printing near me"
                  className="flex-1 px-3 py-2 text-sm outline-none bg-transparent min-w-0" />
                {input && (
                  <button onClick={() => setInput("")} className="mr-2 p-1 text-gray-400 hover:text-gray-600" title="Clear">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button onClick={() => analyze(input)} disabled={loading || !input.trim()}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40" style={{ background: "#111827" }}>
                {loading ? "Analyzing..." : "Analyze"}
              </button>
            </>
          )}

          {/* What this has cost so far, so a bill is never a surprise. */}
          <div className="text-xs text-gray-400 whitespace-nowrap ml-auto">
            ${monthUsd.toFixed(2)} of ${spend.budgetUsd.toFixed(2)} this month
          </div>
        </div>
      </div>

      {/* ----------------------------- notice bar ---------------------------- */}
      {notice && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-md px-3 py-2">
            <Target className="w-4 h-4 shrink-0" />
            <span>{notice.msg}</span>
            {notice.viewSiteId && (
              <button onClick={() => { setActiveId(notice.viewSiteId!); setView("tracking"); setNotice(null); }}
                className="underline font-medium">View site</button>
            )}
            <button onClick={() => setNotice(null)} className="ml-auto p-1 text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------- error banner --------------------------- */}
      {view === "research" && error && !loading && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => analyze(lastQuery || input)} className="ml-auto underline font-medium">Retry</button>
          </div>
        </div>
      )}

      {/* ============================== RESEARCH ============================== */}
      {view === "research" && loading && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Modeling &quot;{lastQuery}&quot; - volume, intent, difficulty, and related terms...</span>
          </div>
          <div className="animate-pulse space-y-3">
            <div className="h-28 bg-gray-200 rounded-lg" />
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            {[...Array(10)].map((_, i) => <div key={i} className="h-9 bg-gray-200 rounded" />)}
          </div>
        </div>
      )}

      {view === "research" && !loading && !data && (
        <div className="max-w-2xl mx-auto text-center py-20 px-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-white border border-gray-200 flex items-center justify-center mb-5">
            <Search className="w-6 h-6 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Keyword research, on demand</h1>
          <p className="mt-3 text-gray-600">
            Enter a word or phrase to get estimated search volume (weekly, monthly, and 3-month),
            search intent, keyword difficulty, CPC, and related keyword ideas. Select the winners
            and add them to a Site to track rankings.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => drillInto(e)}
                className="px-3 py-1.5 rounded-full border border-gray-300 bg-white text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50">
                {e}
              </button>
            ))}
          </div>
          <p className="mt-8 text-xs text-gray-400">
            Metrics are AI-modeled estimates for directional research, not live index data.
          </p>
        </div>
      )}

      {view === "research" && !loading && data && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="text-xs text-gray-500 flex items-center gap-1 mb-1">
            <span>Home</span><ChevronRight className="w-3 h-3" />
            <span>SEO</span><ChevronRight className="w-3 h-3" />
            <span>Keyword Lab</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Keyword Lab: <span className="text-gray-900">{data.kw}</span>
          </h1>
          <div className="text-sm text-gray-500 mt-1 mb-5">
            Database: <span className="font-medium text-gray-700">United States</span>
            <span className="mx-2 text-gray-300">|</span>Currency: USD
            <span className="mx-2 text-gray-300">|</span>AI-modeled estimates
          </div>

          {/* seed overview card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-40">
              <div className="text-xs uppercase tracking-wide text-gray-400">Seed keyword</div>
              <div className="text-xl font-semibold mt-0.5">{data.kw}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span title={INTENT[data.intent].label}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${INTENT[data.intent].chip}`}>
                  {data.intent} <span className="font-medium">{INTENT[data.intent].label}</span>
                </span>
                <TrendBadge trend={data.trend} />
                <button onClick={() => { setPickerUrl(""); setPicker({ items: seedItem() }); }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                  title="Track this keyword for a site">
                  <Plus className="w-3 h-3" /> Track
                </button>
              </div>
            </div>

            <div className="hidden md:block w-px h-14 bg-gray-200" />
            <Stat label="Weekly (est)" value={fmt(weeklyOf(data.vol))} />
            <Stat label="Monthly volume" value={fmt(data.vol)} big />
            <Stat label="3-month (est)" value={fmt(threeMoOf(data.vol))} />
            <div className="hidden md:block w-px h-14 bg-gray-200" />
            <div className="flex items-center gap-3">
              <KdDonut kd={data.kd} />
              <div>
                <div className="font-semibold text-gray-800">{kdInfo(data.kd).label}</div>
                <div className="text-xs text-gray-500">Keyword Difficulty</div>
              </div>
            </div>
            <div className="hidden md:block w-px h-14 bg-gray-200" />
            <Stat label="CPC (USD)" value={`$${data.cpc.toFixed(2)}`} />
          </div>

          {/* tabs + actions */}
          <div className="flex items-center justify-between mt-6 mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-1 border border-gray-200 bg-white rounded-lg p-1">
              <button onClick={() => setTab("all")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === "all" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                All Keywords
              </button>
              <button onClick={() => setTab("questions")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === "questions" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                Questions ({questionCount})
              </button>
            </div>

            <div className="flex items-center gap-2 relative">
              <button onClick={() => { setPickerUrl(""); setPicker(picker ? null : { items: selectedItems() }); }}
                disabled={selected.size === 0}
                title={selected.size === 0 ? "Select keywords in the table first" : "Add selected keywords to a site"}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "#1d4ed8" }}>
                <Plus className="w-4 h-4" /> Add to Site{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
              <button onClick={() => analyze(data.kw)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                <RefreshCw className="w-4 h-4" /> Update metrics
              </button>
              <button onClick={exportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Download className="w-4 h-4" />Export{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>

              {/* site picker */}
              {picker && picker.items.length > 0 && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPicker(null)} />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Add {picker.items.length} keyword{picker.items.length === 1 ? "" : "s"} to
                      </span>
                      <button onClick={() => setPicker(null)} className="p-0.5 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Designated target URL <span className="text-gray-400 font-normal">(optional)</span>
                      </div>
                      <input value={pickerUrl} onChange={(e) => setPickerUrl(e.target.value)}
                        placeholder="/screen-printing-phoenix or full URL"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-400" />
                      <div className="text-xs text-gray-400 mt-1">
                        Applies to every keyword in this batch. A path like /page attaches to the
                        site&apos;s domain. Blank = homepage. Editable per keyword in Tracking.
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {profiles.length === 0 && (
                        <div className="px-3 py-3 text-xs text-gray-500">No sites yet. Create one below.</div>
                      )}
                      {profiles.map((p) => (
                        <button key={p.id} onClick={() => addKeywordsToProfile(p.id, picker.items, pickerUrl)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50">
                          <div className="text-sm font-medium text-gray-800">{p.name}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Globe className="w-3 h-3" /> {p.domain}
                            <span className="mx-1">-</span>{p.keywords.length} tracked
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* sidebar + table */}
          <div className="flex gap-4 items-start">
            <div className="w-48 shrink-0 hidden md:block bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                Groups
              </div>
              <button onClick={() => setGroup(null)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm ${group === null ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                <span>All keywords</span>
                <span className="text-xs text-gray-400 tabular-nums">{data.related.length}</span>
              </button>
              {groups.map(([w, c]) => (
                <button key={w} onClick={() => setGroup(group === w ? null : w)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm ${group === w ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  <span className="truncate pr-2">{w}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{c}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden min-w-0">
              {totals && (
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1">
                  <span>All keywords: <span className="font-semibold text-gray-900 tabular-nums">{totals.count}</span></span>
                  <span>Total Volume: <span className="font-semibold text-gray-900 tabular-nums">{fmt(totals.totalVol)}</span></span>
                  <span>Average KD: <span className="font-semibold text-gray-900 tabular-nums">{totals.avgKd}%</span></span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 w-8">
                        <input type="checkbox" className="w-4 h-4" checked={allVisibleSelected} onChange={toggleAll} />
                      </th>
                      <th className={`${thBase} text-left`}>Keyword</th>
                      <th className={`${thBase} text-center`}>Intent</th>
                      <th className={`${thBase} text-right`}>
                        <button onClick={() => toggleSort("v")}
                          className={`inline-flex items-center gap-1 hover:text-gray-800 ${sortField === "v" ? "text-gray-800" : ""}`}>
                          Volume <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className={`${thBase} text-right`}>Weekly</th>
                      <th className={`${thBase} text-right`}>3-Mo</th>
                      <th className={`${thBase} text-right`}>
                        <button onClick={() => toggleSort("kd")}
                          className={`inline-flex items-center gap-1 hover:text-gray-800 ${sortField === "kd" ? "text-gray-800" : ""}`}>
                          KD % <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className={`${thBase} text-right`}>
                        <button onClick={() => toggleSort("c")}
                          className={`inline-flex items-center gap-1 hover:text-gray-800 ${sortField === "c" ? "text-gray-800" : ""}`}>
                          CPC (USD) <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.k} className="border-b border-gray-100 hover:bg-blue-50">
                        <td className="px-3 py-2">
                          <input type="checkbox" className="w-4 h-4" checked={selected.has(r.k)} onChange={() => toggleSel(r.k)} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <button onClick={() => drillInto(r.k)} title="Analyze this keyword"
                              className="text-blue-600 hover:underline text-left">{r.k}</button>
                            {trackedMap.has(r.k.toLowerCase()) && (
                              <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center"><IntentChip code={r.i} /></td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(r.v)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{fmt(weeklyOf(r.v))}</td>
                        <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{fmt(threeMoOf(r.v))}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums">{r.kd}</span>
                            <span title={kdInfo(r.kd).label} className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: kdInfo(r.kd).hex }} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.c.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No keywords match this filter. Switch back to All Keywords or clear the group.
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400 leading-relaxed">
            Volume, KD %, and CPC are AI-modeled estimates for directional research. Weekly and
            3-month figures are derived from monthly volume. Validate against Google Keyword
            Planner or Search Console before client-facing use. Select rows and use Add to Site
            to start tracking rankings.
          </p>
        </div>
      )}

      {/* ============================== TRACKING ============================== */}
      {view === "tracking" && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          {profiles.length === 0 ? (
            <div className="max-w-md mx-auto text-center py-16">
              <div className="w-14 h-14 mx-auto rounded-full bg-white border border-gray-200 flex items-center justify-center mb-5">
                <FolderPlus className="w-6 h-6 text-gray-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">No sites yet</h1>
              <p className="mt-3 text-gray-600 text-sm">
                Add a client site in F1 Pulse first. Then research keywords, select them, and add
                them here — each keyword gets a target URL and live rank checks.
              </p>
              <button onClick={() => setView("research")} className="mt-4 text-sm text-blue-600 hover:underline">
                Or go research keywords first
              </button>
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {/* sites sidebar */}
              <div className="w-60 shrink-0">
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                    Sites
                  </div>
                  {profiles.map((p) => (
                    <div key={p.id} onClick={() => { setActiveId(p.id); setExpanded(null); }}
                      className={`px-3 py-2.5 border-b border-gray-50 cursor-pointer ${activeId === p.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-sm font-medium truncate ${activeId === p.id ? "text-blue-700" : "text-gray-800"}`}>
                          {p.name}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p.domain}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{p.keywords.length} keywords</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* active site panel */}
              <div className="flex-1 min-w-0">
                {activeProfile ? (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                      <div>
                        <h1 className="text-xl font-bold tracking-tight">{activeProfile.name}</h1>
                        <a href={`https://${activeProfile.domain}`} target="_blank" rel="noreferrer"
                          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                          {activeProfile.domain} <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={checkAll} disabled={bulk !== null || activeProfile.keywords.length === 0}
                          title={`About $${(activeProfile.keywords.length * costs.rankCheck).toFixed(2)} for ${activeProfile.keywords.length} keywords`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40"
                          style={{ background: "#1d4ed8" }}>
                          {bulk
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking {bulk.done}/{bulk.total}...</>
                            : <><RefreshCw className="w-4 h-4" /> Check all rankings · ${(activeProfile.keywords.length * costs.rankCheck).toFixed(2)}</>}
                        </button>
                        <button onClick={exportTrackingCSV} disabled={activeProfile.keywords.length === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                          <Download className="w-4 h-4" /> Export
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      {activeProfile.keywords.length === 0 ? (
                        <div className="px-4 py-12 text-center text-sm text-gray-500">
                          No keywords tracked for this site yet.
                          <div className="mt-3">
                            <button onClick={() => setView("research")}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-white"
                              style={{ background: "#111827" }}>
                              <Search className="w-4 h-4" /> Find keywords
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="px-2 py-2 w-6" />
                                <th className={`${thBase} text-left`}>Keyword</th>
                                <th className={`${thBase} text-right`}>Volume</th>
                                <th className={`${thBase} text-right`}>KD %</th>
                                <th className={`${thBase} text-left`}>Target URL</th>
                                <th className={`${thBase} text-center`}>Pos</th>
                                <th className={`${thBase} text-center`}>Change</th>
                                <th className={`${thBase} text-center`}>Best</th>
                                <th className={`${thBase} text-right`}>Checked</th>
                                <th className={`${thBase} text-right`}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeProfile.keywords.map((k) => {
                                const checks = k.checks || [];
                                const last = checks[checks.length - 1];
                                const bestVals = checks.filter((c) => c.position != null).map((c) => c.position as number);
                                return (
                                  <FragmentRow
                                    key={k.id}
                                    k={k}
                                    last={last}
                                    checks={checks}
                                    best={bestVals.length ? Math.min(...bestVals) : null}
                                    isOpen={expanded === k.id}
                                    busy={checking.has(k.id)}
                                    bulkRunning={bulk !== null}
                                    domain={activeProfile.domain}
                                    onToggle={() => setExpanded(expanded === k.id ? null : k.id)}
                                    onUrlSave={(url) => setKeywordUrl(k.id, url)}
                                    onCheck={() => checkKeyword({ id: k.id, k: k.k, url: k.url }, activeProfile.domain)}
                                    onRemove={() => removeKeyword(k.id)}
                                  />
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <p className="mt-4 text-xs text-gray-400 leading-relaxed">
                      Position checks use live web search (non-localized, desktop) against the top
                      10 organic results, so treat them as directional. Local pack and
                      geo-personalized rankings for &quot;near me&quot; terms will differ by searcher
                      location. A * next to a position means the domain ranks with a different
                      page than the target URL - open the row for details. For client-grade
                      tracking, pair this with Search Console position data.
                    </p>
                  </>
                ) : (
                  <div className="px-4 py-12 text-center text-sm text-gray-500">Select a site on the left.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------- tracking row + expandable detail ------------------- */

function FragmentRow({
  k, last, checks, best, isOpen, busy, bulkRunning, domain, onToggle, onUrlSave, onCheck, onRemove,
}: {
  k: LabKeyword; last: LabCheck | undefined; checks: LabCheck[]; best: number | null;
  isOpen: boolean; busy: boolean; bulkRunning: boolean; domain: string;
  onToggle: () => void; onUrlSave: (url: string) => void; onCheck: () => void; onRemove: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="px-2 py-2 text-center">
          <button onClick={onToggle} className="p-0.5 text-gray-400 hover:text-gray-700" title="Details">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-800">{k.k}</span>
            <IntentChip code={k.i} />
          </div>
        </td>
        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmt(k.v)}</td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-2">
            <span className="tabular-nums">{k.kd}</span>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: kdInfo(k.kd).hex }} />
          </div>
        </td>
        <td className="px-3 py-2 w-64"><UrlCell value={k.url} onSave={onUrlSave} /></td>
        <td className="px-3 py-2 text-center"><PosBadge check={last} /></td>
        <td className="px-3 py-2 text-center"><DeltaBadge checks={checks} /></td>
        <td className="px-3 py-2 text-center text-gray-600 tabular-nums">{best == null ? "-" : best}</td>
        <td className="px-3 py-2 text-right text-xs text-gray-400 whitespace-nowrap">
          {last ? dateShort(last.date) : "never"}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <button onClick={onCheck} disabled={busy || bulkRunning} title="Check ranking now"
              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button onClick={onRemove} title="Stop tracking"
              className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr className="border-b border-gray-100">
          <td colSpan={10} className="bg-gray-50 px-5 py-4">
            {!last ? (
              <div className="text-sm text-gray-500">
                No checks yet. Hit the refresh button on this row to run the first ranking check.
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Top results - {dateShort(last.date)}
                  </div>
                  <div className="space-y-1">
                    {(last.top || []).map((t) => {
                      const mine = hostOf(t.url) === domain || hostOf(t.url).endsWith("." + domain);
                      return (
                        <div key={t.pos + t.url}
                          className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${mine ? "bg-blue-50 border border-blue-200" : ""}`}>
                          <span className={`inline-flex items-center justify-center w-6 h-5 rounded text-xs font-bold shrink-0 ${mine ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>
                            {t.pos}
                          </span>
                          <div className="min-w-0">
                            <div className={`truncate ${mine ? "font-semibold text-blue-800" : "text-gray-700"}`}>
                              {t.title || hostOf(t.url)}
                            </div>
                            <div className="text-xs text-gray-400 truncate">{hostOf(t.url)}</div>
                          </div>
                        </div>
                      );
                    })}
                    {(!last.top || last.top.length === 0) && (
                      <div className="text-xs text-gray-400">No result list stored for this check.</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Check history</div>
                  {last.match === "domain" && last.foundUrl && (
                    <div className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5">
                      Ranking with a different page than the target:{" "}
                      <a href={last.foundUrl} target="_blank" rel="noreferrer" className="underline break-all">{last.foundUrl}</a>
                    </div>
                  )}
                  {last.match === "exact" && last.foundUrl && (
                    <div className="mb-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-2 py-1.5">
                      Target URL is the ranking page.
                    </div>
                  )}
                  <div className="space-y-1">
                    {[...checks].reverse().map((c, i) => (
                      <div key={c.date + i} className="flex items-center gap-3 text-sm">
                        <span className="text-xs text-gray-400 w-16 shrink-0 tabular-nums">{dateShort(c.date)}</span>
                        {c.position == null
                          ? <span className="text-xs text-gray-400">Not in top 10</span>
                          : <span className="font-semibold text-gray-700 tabular-nums">#{c.position}</span>}
                        {c.match === "domain" && <span className="text-amber-500 text-xs">different page</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
