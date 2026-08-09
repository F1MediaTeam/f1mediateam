"use client";

// Speed check for any URL, on demand.
//
// The direct audit always renders — it's measured by fetching the page, so it
// needs no API key and always has something to say. Google's Lighthouse and
// real-user Core Web Vitals panels appear underneath only when the server has
// PAGESPEED_API_KEY configured, since PSI cannot be called without one.

import { useState } from "react";
import { Button } from "@/components/ui";
import type { PageSpeedReport, Verdict } from "@/lib/pagespeed";
import type { AuditMetric, Finding, ResourceRow, SpeedAudit } from "@/lib/speed-audit";
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

const SEVERITY: Record<Finding["severity"], { dot: string; text: string }> = {
  critical: { dot: "bg-red-500", text: "text-red-600 dark:text-red-300" },
  warning: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-300" },
  ok: { dot: "bg-[var(--color-border-strong)]", text: "text-[var(--color-text-muted)]" },
};

const KIND_LABEL: Record<string, string> = {
  html: "HTML",
  script: "JavaScript",
  style: "CSS",
  image: "Images",
  font: "Fonts",
  other: "Other",
};

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1000) return `${Math.round(n / 1000)} KB`;
  return `${n} B`;
}

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
  hint,
}: {
  label: string;
  display: string;
  verdict: Verdict;
  hint?: string;
}) {
  const tone = TONE[verdict];
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${tone.bg} ${tone.ring}`} title={hint}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone.text}`}>{display}</div>
    </div>
  );
}

function WeightBar({ audit }: { audit: SpeedAudit }) {
  const palette: Record<string, string> = {
    image: "bg-sky-500",
    script: "bg-violet-500",
    style: "bg-emerald-500",
    html: "bg-amber-500",
    font: "bg-rose-500",
    other: "bg-slate-400",
  };
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
        {audit.groups.map((g) => (
          <div
            key={g.kind}
            className={palette[g.kind] ?? palette.other}
            style={{ width: `${(g.bytes / Math.max(1, audit.totalBytes)) * 100}%` }}
            title={`${KIND_LABEL[g.kind] ?? g.kind}: ${formatBytes(g.bytes)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {audit.groups.map((g) => (
          <span key={g.kind} className="flex items-center gap-1.5 text-[11px]">
            <span className={`h-2 w-2 rounded-full ${palette[g.kind] ?? palette.other}`} />
            <span className="text-[var(--color-text-muted)]">
              {KIND_LABEL[g.kind] ?? g.kind} · {g.count} · {formatBytes(g.bytes)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const tone = SEVERITY[finding.severity];
  return (
    <li className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <div className="min-w-0">
          <div className={`text-xs font-semibold ${tone.text}`}>{finding.title}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {finding.detail}
          </p>
          {finding.items && finding.items.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {finding.items.map((item) => (
                <li
                  key={item}
                  className="truncate font-mono text-[10px] text-[var(--color-text-muted)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function LargestTable({ rows }: { rows: ResourceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-[11px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            <th className="pb-1.5 font-normal">File</th>
            <th className="pb-1.5 font-normal">Type</th>
            <th className="pb-1.5 text-right font-normal">Size</th>
            <th className="pb-1.5 text-right font-normal">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            let name = r.url;
            try {
              const u = new URL(r.url);
              name = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
            } catch {
              /* keep the raw string */
            }
            return (
              <tr key={r.url} className="border-t border-[var(--color-border)]">
                <td className="max-w-[220px] truncate py-1.5 pr-2 font-mono" title={r.url}>
                  {name}
                </td>
                <td className="py-1.5 pr-2 text-[var(--color-text-muted)]">
                  {KIND_LABEL[r.kind] ?? r.kind}
                  {r.encoding ? "" : r.kind === "script" || r.kind === "style" ? " · raw" : ""}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatBytes(r.bytes)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--color-text-muted)]">
                  {Math.round(r.ms)} ms
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditPanel({ audit }: { audit: SpeedAudit }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
      <div className="mb-4 flex items-center gap-4">
        <ScoreDial score={audit.score} />
        <div className="min-w-0">
          <div className="text-sm font-semibold">Measured directly</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            We fetched this page and everything it loads, and timed and weighed it. Not a
            Lighthouse score — a weighted read of the five numbers below.
          </p>
          {audit.redirects.length > 0 ? (
            <p className="mt-1 truncate text-[11px] text-amber-600 dark:text-amber-300">
              Redirected to {audit.finalUrl}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {audit.metrics.map((m: AuditMetric) => (
          <MetricPill
            key={m.id}
            label={m.label}
            display={m.display}
            verdict={m.verdict}
            hint={m.hint}
          />
        ))}
      </div>

      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        What the {formatBytes(audit.totalBytes)} is made of
      </div>
      <div className="mb-4">
        <WeightBar audit={audit} />
      </div>

      {audit.findings.length > 0 ? (
        <>
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Biggest wins
          </div>
          <ul className="mb-4 space-y-1.5">
            {audit.findings.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-300">
          Nothing obviously wrong — compression, image sizes, caching and render-blocking all look
          reasonable.
        </p>
      )}

      <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
        Heaviest files
      </div>
      <LargestTable rows={audit.largest} />

      {audit.truncated ? (
        <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
          This page loads more files than one run checks; the 45 largest-priority ones were
          measured, so real page weight is higher than shown.
        </p>
      ) : null}
    </div>
  );
}

function PsiPanel({ report }: { report: PageSpeedReport }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
      <div className="mb-4 flex items-center gap-4">
        {report.score !== null ? <ScoreDial score={report.score} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold capitalize">Lighthouse · {report.strategy}</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            Google&apos;s simulated load. 90+ is good, under 50 is poor.
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
          No real-user data for this URL — Chrome needs enough traffic before it reports Core Web
          Vitals. The lab numbers below still apply.
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
            Lighthouse opportunities
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
  const [audit, setAudit] = useState<SpeedAudit | null>(null);
  const [psi, setPsi] = useState<PageSpeedReport[]>([]);

  async function run() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setAudit(null);
    setPsi([]);
    try {
      const res = await fetch(`/api/pagespeed?url=${encodeURIComponent(url.trim())}`);
      const json = (await res.json()) as {
        audit?: SpeedAudit;
        psi?: PageSpeedReport[];
        error?: string;
      };
      if (!res.ok || !json.audit) throw new Error(json.error ?? "Speed check failed.");
      setAudit(json.audit);
      setPsi(json.psi ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speed check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!audit || !clientId) return;
    const mobile = psi.find((r) => r.strategy === "mobile");
    const pick = (id: string) =>
      mobile?.field?.find((m) => m.id === id)?.value ??
      mobile?.lab.find((m) => m.id === id)?.value ??
      null;
    const ttfb = audit.metrics.find((m) => m.id === "TTFB")?.value ?? 0;
    const res = await savePageSpeedSnapshotAction({
      clientId,
      audit: {
        score: audit.score,
        ttfbMs: Math.round(ttfb),
        totalBytes: audit.totalBytes,
        totalRequests: audit.totalRequests,
      },
      psi: mobile
        ? { score: mobile.score, lcp: pick("LCP"), cls: pick("CLS"), inp: pick("INP") }
        : null,
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
          Loading the page and everything on it — usually a few seconds.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {audit ? (
        <>
          <AuditPanel audit={audit} />

          {psi.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {psi.map((r) => (
                <PsiPanel key={r.strategy} report={r} />
              ))}
            </div>
          ) : null}

          {clients.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
              <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                Save result to
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
              <Button variant="secondary" size="sm" type="button" onClick={save} disabled={!clientId}>
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
