"use client";

// One keyword view with four ways of looking at it, instead of four panels
// stacked down the page.
//
//   Working on    what somebody chose for this client, with the page it targets
//   Ranking       everything Google already shows this site for
//   Opportunities proven demand sitting where nobody clicks
//   Potential     searches around these topics the site does not appear for
//
// The first three come from the same measured set and share a filter bar, so
// moving between them keeps your search and intent filter. The fourth needs a
// round trip to Google, so it stays behind a button.

import { useMemo, useState } from "react";
import { Search, Printer, Download, ExternalLink, Loader2, Check } from "lucide-react";
import type { KeywordsPanel as PanelData, RankingKeyword } from "@/lib/pulse/keywords-shared";
import type { Opportunity } from "@/lib/pulse/keyword-gaps";
import { isQuestion } from "@/lib/pulse/keywords-shared";
import { addTrackedAction } from "@/app/admin/pulse/[siteId]/gaps/actions";
import KeywordGaps from "./KeywordGaps";
import TrackedKeywords from "./TrackedKeywords";

const INTENT: Record<string, { label: string; bg: string; fg: string }> = {
  T: { label: "Transactional", bg: "rgba(63,142,132,.16)", fg: "var(--color-accent)" },
  C: { label: "Commercial", bg: "rgba(217,164,65,.16)", fg: "#d9a441" },
  I: { label: "Informational", bg: "rgba(96,165,250,.16)", fg: "#60a5fa" },
  N: { label: "Navigational", bg: "rgba(167,139,250,.16)", fg: "#a78bfa" },
};

const fmt = (n: number) => n.toLocaleString("en-US");

function IntentChip({ code }: { code: string }) {
  const m = INTENT[code] ?? INTENT.C;
  return (
    <span title={m.label} className="inline-flex h-5 w-6 items-center justify-center rounded text-xs font-bold"
          style={{ background: m.bg, color: m.fg }}>{code}</span>
  );
}

function Pos({ position }: { position: number }) {
  const tone = position <= 3 ? "var(--color-up)" : position <= 10 ? "var(--color-accent)" : position <= 20 ? "#d9a441" : undefined;
  return <span className="font-semibold tabular-nums" style={{ color: tone }}>{position.toFixed(1)}</span>;
}


/**
 * The page a keyword is meant to win, editable from wherever you are.
 *
 * A keyword with no page assigned is the common case on the ranking tab —
 * Google decided that pairing, nobody here did. Assigning one from this cell
 * starts tracking it, so the two lists stay one list rather than drifting.
 */
function PageCell({
  siteId,
  domain,
  phrase,
  targetUrl,
}: {
  siteId: string;
  domain: string;
  phrase: string;
  targetUrl: string | null;
}) {
  const [v, setV] = useState(targetUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (v.trim() === (targetUrl ?? "")) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("siteId", siteId);
    fd.set("phrase", phrase);
    fd.set("targetUrl", v.trim());
    await addTrackedAction(fd);
    setSaving(false);
    setSaved(true);
  }

  return (
    <span className="flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => { setV(e.target.value); setSaved(false); }}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="link a page…"
        title={v || `Assign the page that should rank for "${phrase}"`}
        className="w-40 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-[var(--color-text-muted)] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:text-[var(--color-text)]"
      />
      {saving ? <Loader2 size={11} className="animate-spin text-[var(--color-text-subtle)]" /> : null}
      {saved && !saving ? <Check size={11} style={{ color: "var(--color-up)" }} /> : null}
      {v && !saving && v.startsWith("http") ? (
        <a href={v} target="_blank" rel="noreferrer" title={v}
           className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent)]">
          <ExternalLink size={11} />
        </a>
      ) : null}
    </span>
  );
}


/**
 * The page Google actually ranks, as a link you can open.
 *
 * When it differs from the page somebody assigned, that mismatch is flagged —
 * it usually means a dedicated page was written and Google kept ranking the
 * homepage anyway, which is a fixable problem that is invisible until the two
 * are shown side by side.
 */
function RankingPageCell({
  page,
  domain,
  assigned,
}: {
  page: string | null;
  domain: string;
  assigned: string | null;
}) {
  if (!page) {
    return (
      <span className="text-xs text-[var(--color-text-subtle)]" title="Run a refresh to pull query and page pairs from Search Console">
        —
      </span>
    );
  }
  const pretty = page.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(domain, "") || "/";
  const norm = (u: string) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const mismatch = Boolean(assigned) && norm(assigned as string) !== norm(page);

  return (
    <span className="flex items-center gap-1">
      <a
        href={page}
        target="_blank"
        rel="noreferrer"
        title={page}
        className="block max-w-[13rem] truncate text-xs text-[var(--color-accent)] hover:underline"
      >
        {pretty}
      </a>
      <ExternalLink size={10} className="shrink-0 text-[var(--color-text-subtle)]" />
      {mismatch ? (
        <span
          title={`Google ranks this page, but ${assigned} was assigned. Worth a look.`}
          className="shrink-0 rounded px-1 text-[9px] font-semibold uppercase"
          style={{ background: "rgba(217,164,65,.18)", color: "#d9a441" }}
        >
          differs
        </span>
      ) : null}
    </span>
  );
}

type View = "working" | "ranking" | "opportunities" | "potential";

export default function KeywordLabTabs({
  data,
  opportunities,
  siteId,
  domain,
}: {
  data: PanelData;
  opportunities: Opportunity[];
  siteId: string;
  domain: string;
}) {
  const [view, setView] = useState<View>("working");
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState("all");
  const [questionsOnly, setQuestionsOnly] = useState(false);
  const [sort, setSort] = useState<"estVolume" | "position" | "impressions" | "clicks">("estVolume");

  const filtered = useMemo(() => {
    let r: RankingKeyword[] = data.ranking;
    if (q.trim()) r = r.filter((x) => x.phrase.includes(q.trim().toLowerCase()));
    if (intent !== "all") r = r.filter((x) => x.intent === intent);
    if (questionsOnly) r = r.filter((x) => isQuestion(x.phrase));
    return [...r].sort((a, b) => (sort === "position" ? a.position - b.position : b[sort] - a[sort]));
  }, [data.ranking, q, intent, questionsOnly, sort]);

  const byPhrase = useMemo(
    () => new Map(data.ranking.map((r) => [r.phrase, r])),
    [data.ranking],
  );

  const filteredOpps = useMemo(() => {
    let o = opportunities;
    if (q.trim()) o = o.filter((x) => x.phrase.includes(q.trim().toLowerCase()));
    return o;
  }, [opportunities, q]);

  function exportCsv(rows: RankingKeyword[]) {
    const lines = [
      ["Keyword", "Intent", "Est. monthly searches", "Position", "Change", "Best", "Clicks", "Impressions", "CTR %", "Tracked"],
      ...rows.map((r) => [
        r.phrase, INTENT[r.intent]?.label ?? r.intent, String(r.estVolume), r.position.toFixed(1),
        r.change === null ? "new" : r.change.toFixed(1), r.best.toFixed(1),
        String(r.clicks), String(r.impressions), r.ctr.toFixed(1), r.tracked ? "yes" : "no",
      ]),
    ];
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${domain}-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const TABS: Array<[View, string, number | null]> = [
    ["working", "Working on", data.totals.trackedCount],
    ["ranking", "Already ranking", data.totals.rankingCount],
    ["opportunities", "Opportunities", opportunities.length],
    ["potential", "Potential", null],
  ];

  const th = "px-3 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-subtle)] whitespace-nowrap";
  const field = "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm outline-none";

  return (
    <div className="space-y-4">
      {/* sub-tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] print:hidden">
        {TABS.map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              view === id
                ? "border-[var(--color-accent)] text-[var(--color-text)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {label}
            {count !== null ? (
              <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                    style={{ background: "var(--color-bg-hover)" }}>{fmt(count)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* shared filters — the measured views only */}
      {view !== "potential" && view !== "working" ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex min-w-[14rem] flex-1 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
            <Search size={14} className="ml-3 shrink-0 text-[var(--color-text-subtle)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Filter keywords…"
                   className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none" />
          </div>
          {view === "ranking" ? (
            <>
              <select value={intent} onChange={(e) => setIntent(e.target.value)} className={field}>
                <option value="all">All intents</option>
                {Object.entries(INTENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={field}>
                <option value="estVolume">Sort by est. searches</option>
                <option value="impressions">Sort by impressions</option>
                <option value="position">Sort by position</option>
                <option value="clicks">Sort by clicks</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <input type="checkbox" checked={questionsOnly} onChange={(e) => setQuestionsOnly(e.target.checked)} />
                Questions only
              </label>
              <button onClick={() => exportCsv(filtered)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                <Download size={14} /> Export
              </button>
            </>
          ) : null}
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <Printer size={14} /> Print
          </button>
        </div>
      ) : null}

      {/* ---- working on ---- */}
      {view === "working" ? (
        <TrackedKeywords siteId={siteId} domain={domain} tracked={data.tracked} />
      ) : null}

      {/* ---- already ranking ---- */}
      {view === "ranking" ? (
        <>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {fmt(filtered.length)} of {fmt(data.totals.rankingCount)} searches Google already shows this
            site for. &ldquo;Page Google ranks&rdquo; is the URL Search Console reports as the one
            actually appearing; &ldquo;page it should win&rdquo; is the one you assigned. When those
            differ the row says so, and that gap is usually the thing worth fixing. Position, clicks
            and impressions are Google&rsquo;s own; estimated searches is computed from impressions
            and position, so it softens the deeper the ranking.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full min-w-[50rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={th}>Keyword</th>
                  <th className={th}>Page Google ranks</th>
                  <th className={th}>Page it should win</th>
                  <th className={th}>Intent</th>
                  <th className={th}>Est. searches/mo</th>
                  <th className={th}>Position</th>
                  <th className={th}>Best</th>
                  <th className={th}>Clicks</th>
                  <th className={th}>Impressions</th>
                  <th className={th}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r) => (
                  <tr key={r.phrase} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <span className="block max-w-[18rem] truncate">{r.phrase}</span>
                        {r.tracked ? (
                          <span className="rounded px-1 text-[9px] font-semibold uppercase"
                                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>tracked</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <RankingPageCell page={r.rankingPage} domain={domain} assigned={r.targetUrl} />
                    </td>
                    <td className="px-3 py-2">
                      <PageCell siteId={siteId} domain={domain} phrase={r.phrase} targetUrl={r.targetUrl} />
                    </td>
                    <td className="px-3 py-2"><IntentChip code={r.intent} /></td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                      ~{fmt(r.estVolume)}
                    </td>
                    <td className="px-3 py-2"><Pos position={r.position} /></td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">{r.best.toFixed(1)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.clicks)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(r.impressions)}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">{r.ctr.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 300 ? (
            <p className="text-xs text-[var(--color-text-subtle)]">
              Showing the first 300 of {fmt(filtered.length)}. Narrow it with the filter.
            </p>
          ) : null}
        </>
      ) : null}

      {/* ---- opportunities ---- */}
      {view === "opportunities" ? (
        <>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            Searches Google already shows this site for, at a position nobody clicks. The demand is
            proven, so only the ranking is missing. Ranked by clicks a month each would add at
            position five — which is why a big keyword already sitting at position two is not here.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className={th}>Keyword</th>
                  <th className={th}>Page it should win</th>
                  <th className={th}>Position</th>
                  <th className={th}>Impressions</th>
                  <th className={th}>Clicks now</th>
                  <th className={th}>Could gain</th>
                  <th className={th}>Why</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpps.map((o) => (
                  <tr key={o.phrase} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-medium"><span className="block max-w-[15rem] truncate">{o.phrase}</span></td>
                    <td className="px-3 py-2">
                      <PageCell siteId={siteId} domain={domain} phrase={o.phrase}
                                targetUrl={byPhrase.get(o.phrase)?.targetUrl ?? null} />
                    </td>
                    <td className="px-3 py-2"><Pos position={o.position} /></td>
                    <td className="px-3 py-2 tabular-nums">{fmt(o.impressions)}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">{o.clicks}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--color-up)" }}>+{o.clicksIfImproved}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]"><span className="block max-w-[20rem]">{o.reason}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* ---- potential ---- */}
      {view === "potential" ? (
        <>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            Searches people make around this client&rsquo;s strongest topics that the site does
            <strong> not</strong> appear for. Ideas come from Google&rsquo;s own autocomplete, so they
            are real searches — but there is no impression data behind them yet, which is exactly what
            makes them potential rather than measured.
          </p>
          <KeywordGaps siteId={siteId} />
        </>
      ) : null}
    </div>
  );
}
