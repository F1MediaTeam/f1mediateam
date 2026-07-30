"use client";

// Core Web Vitals check for a client URL, on demand.
//
// Mobile and desktop run in parallel because they're separate Lighthouse runs
// and each takes a while — sequentially this would feel broken. Results are
// kept side by side rather than behind a toggle, since the interesting thing is
// usually the gap between them.

import { useState } from "react";
import { Button } from "@/components/ui";
import type { PageSpeedReport, Strategy, Verdict } from "@/lib/pagespeed";
import { savePageSpeedSnapshotAction } from "@/app/admin/actions";

interface ClientOption {
  id: string;
  company_name: string;
}

const TONE: Record<Verdict, { text: string; bg: string; ring: string; label: string }> = {
  good: {
    text: "text-emerald-600 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    label: "Good",
  },
  "needs-improvement": {
    text: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    label: "Needs work",
  },
  poor: {
    text: "text-red-600 dark:text-red-300",
    bg: "bg-red-500/10",
    ring: "ring-red-500/30",
    label: "Poor",
  },
};

function scoreVerdict(score: number): Verdict {
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

function ScoreDial({ score }: { score: number }) {
  const tone = TONE[scoreVerdict(score)];
  const circumference = 2 * Math.PI * 34;
  return (
    <div className="relative grid h-[88px] w-[88px] shrink-0 place-items-center">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r="34" fill="none" strokeWidth="7" className="stroke-[var(--color-border)]" />
        <circle
          cx="44"
          cy="44"
          r="34"
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={`${tone.text} transition-[stroke-dashoffset] duration-700`}
          stroke="currentColor"
        />
      </svg>
      <span className={`absolute text-xl font-semibold tabular-nums ${tone.text}`}>{score}</span>
    </div>
  );
}

function MetricPill({
  label,
  display,
  verdict,
}: {
  label: string;
  display: string;
  verdict: Verdict;
}) {
  const tone = TONE[verdict];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${tone.bg} ${tone.ring}`}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone.text}`}>{display}</div>
    </div>
  );
}

function ReportPanel({ report }: { report: PageSpeedReport }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
      <div className="mb-4 flex items-center gap-4">
        {report.score !== null ? <ScoreDial score={report.score} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold capitalize">{report.strategy}</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            Performance score from a simulated load. 90+ is good, under 50 is poor.
          </p>
        </div>
      </div>

      {report.field ? (
        <>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
              Real users · last 28 days
            </span>
            {report.fieldVerdict ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${TONE[report.fieldVerdict].bg} ${TONE[report.fieldVerdict].text}`}
              >
                {TONE[report.fieldVerdict].label}
              </span>
            ) : null}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {report.field.map((m) => (
              <MetricPill key={m.id} label={m.id} display={m.display} verdict={m.verdict} />
            ))}
          </div>
        </>
      ) : (
        <p className="mb-4 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          No real-user data for this URL — Chrome needs enough traffic before it
          reports Core Web Vitals. The lab numbers below still apply.
        </p>
      )}

      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        Lab · simulated load
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {report.lab.map((m) => (
          <MetricPill key={m.id} label={m.id} display={m.display} verdict={m.verdict} />
        ))}
      </div>

      {report.opportunities.length > 0 ? (
        <>
          <div className="mb-1.5 mt-4 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Biggest wins
          </div>
          <ul className="space-y-1.5">
            {report.opportunities.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium">{o.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--color-accent)]">
                    −{(o.savingsMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                  {o.description}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function PageSpeedCheck({ clients = [] }: { clients?: ClientOption[] }) {
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reports, setReports] = useState<PageSpeedReport[]>([]);

  async function run() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setReports([]);
    try {
      const fetchOne = async (strategy: Strategy) => {
        const res = await fetch(
          `/api/pagespeed?url=${encodeURIComponent(url.trim())}&strategy=${strategy}`,
        );
        const json = (await res.json()) as { report?: PageSpeedReport; error?: string };
        if (!res.ok || !json.report) throw new Error(json.error ?? "PageSpeed check failed.");
        return json.report;
      };
      // Both strategies at once — each is a full Lighthouse run.
      const [mobile, desktop] = await Promise.all([fetchOne("mobile"), fetchOne("desktop")]);
      setReports([mobile, desktop]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PageSpeed check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const mobile = reports.find((r) => r.strategy === "mobile");
    if (!mobile || !clientId) return;
    const pick = (id: string) =>
      mobile.field?.find((m) => m.id === id)?.value ??
      mobile.lab.find((m) => m.id === id)?.value ??
      null;
    const res = await savePageSpeedSnapshotAction({
      clientId,
      score: mobile.score,
      lcp: pick("LCP"),
      cls: pick("CLS"),
      inp: pick("INP"),
    });
    setNote(res.error ?? "Saved — it'll trend with the client's other metrics.");
  }

  const field =
    "h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 text-sm outline-none focus:border-[var(--color-border-strong)]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) run();
          }}
          placeholder="https://clientsite.com/page"
          aria-label="URL to check"
          className={`${field} min-w-[240px] flex-1 font-mono text-xs`}
        />
        <Button variant="primary" size="md" type="button" onClick={run} disabled={busy || !url.trim()}>
          {busy ? "Running…" : "Check speed"}
        </Button>
      </div>

      {busy ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          Running mobile and desktop — a cold Lighthouse run takes 20–40 seconds.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {reports.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {reports.map((r) => (
              <ReportPanel key={r.strategy} report={r} />
            ))}
          </div>

          {clients.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
              <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                Save mobile result to
              </span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-label="Client to save this run against"
                className={`${field} text-xs`}
              >
                <option value="">Choose a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={save}
                disabled={!clientId}
              >
                Save snapshot
              </Button>
              {note ? (
                <span className="text-[11px] text-[var(--color-text-muted)]">{note}</span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
