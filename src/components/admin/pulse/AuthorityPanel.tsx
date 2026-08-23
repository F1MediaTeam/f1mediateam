"use client";

// Authority score — Garrett's gauge and grading, fed measured inputs.
//
// The engine is his and unchanged. What differs is that every figure feeding it
// is labelled with where it came from, because the score is only as good as its
// weakest input and a client should be able to see which one that is.

import { useActionState } from "react";
import { Upload, Loader2, AlertCircle, Check } from "lucide-react";
import type { AuthorityReport } from "@/lib/pulse/authority";
import { importSeoquakeAction } from "@/app/admin/pulse/[siteId]/authority/actions";

const fmt = (x: number) =>
  x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "K" : Math.round(x).toLocaleString();

const SOURCE_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  measured: { text: "measured", bg: "var(--color-accent-soft)", fg: "var(--color-accent)" },
  estimated: { text: "estimated", bg: "rgba(217,164,65,.18)", fg: "#d9a441" },
  default: { text: "assumed", bg: "rgba(217,164,65,.18)", fg: "#d9a441" },
  missing: { text: "no data", bg: "rgba(220,38,38,.14)", fg: "var(--color-down)" },
};

/** Half-circle gauge, matching the original's geometry. */
function Gauge({ score, color }: { score: number; color: string }) {
  const angle = -180 + (score / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 100, cy = 100, r = 78;
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  const large = score > 50 ? 1 : 0;
  return (
    <svg viewBox="0 0 200 115" className="w-full max-w-[260px]">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none" stroke="var(--color-border)" strokeWidth="14" strokeLinecap="round" />
      {score > 0.5 && (
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${x} ${y}`}
              fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-[var(--color-text)]"
            style={{ fontSize: 34, fontWeight: 700 }}>
        {score.toFixed(1)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[var(--color-text-subtle)]"
            style={{ fontSize: 11 }}>
        out of 100
      </text>
    </svg>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-[var(--color-text-muted)]">{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
        <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: "var(--color-accent)" }} />
      </div>
    </div>
  );
}

export default function AuthorityPanel({
  report,
  siteId,
}: {
  report: AuthorityReport;
  siteId: string;
}) {
  const [state, action, pending] = useActionState(importSeoquakeAction, {
    message: null as string | null,
    error: null as string | null,
  });

  const { result, grade, inputs, sources, notes } = report;

  const rows: Array<[string, string, string]> = [
    ["Referring domains", fmt(inputs.est_referring_domains), sources.est_referring_domains ?? "missing"],
    ["Average donor authority", String(Math.round(inputs.est_avg_donor_authority)), sources.est_avg_donor_authority ?? "default"],
    ["Dofollow ratio", `${Math.round(inputs.est_dofollow_ratio * 100)}%`, sources.est_dofollow_ratio ?? "default"],
    ["Monthly organic traffic", fmt(inputs.est_monthly_organic_traffic), sources.est_monthly_organic_traffic ?? "missing"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <Gauge score={result.score} color={grade.color} />
        <div className="min-w-[16rem] flex-1">
          <div className="text-lg font-semibold" style={{ color: grade.color }}>{grade.label}</div>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{grade.note}</p>
          <div className="mt-4 space-y-2.5">
            <Bar label="Link power" value={result.lp01} />
            <Bar label="Traffic" value={result.tr01} />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Where it came from</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, source]) => {
              const s = SOURCE_LABEL[source] ?? SOURCE_LABEL.missing;
              return (
                <tr key={label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{value}</td>
                  <td className="px-3 py-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ background: s.bg, color: s.fg }}>{s.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.flags.length > 0 ? (
        <div className="rounded-lg border p-3"
             style={{ borderColor: "rgba(220,38,38,.3)", background: "rgba(220,38,38,.06)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-down)" }}>
            Penalties applied
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {result.flags.map((f) => (
              <li key={f.name} className="flex justify-between gap-3">
                <span>{f.name}</span>
                <span className="tabular-nums text-[var(--color-text-muted)]">−{f.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
          {notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      ) : null}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
        <div className="text-sm font-semibold">Import a SEOquake export</div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
          SEOquake has no API — it is a browser extension — but its SERP overlay has an{" "}
          <strong>Export CSV</strong> button, and that export carries link and index figures for
          every result on the page. So one search covers this client <em>and</em> every competitor
          ranking against them. Run the search with the extension on, export, and upload it here.
        </p>
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="file" name="file" accept=".csv,text/csv"
                 className="text-xs text-[var(--color-text-muted)] file:mr-2 file:rounded file:border file:border-[var(--color-border)] file:bg-transparent file:px-2 file:py-1 file:text-xs file:text-[var(--color-text)]" />
          <button type="submit" disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-on-accent)] disabled:opacity-60">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {pending ? "Reading…" : "Import"}
          </button>
        </form>
        {state.message ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--color-up)" }}>
            <Check size={12} /> {state.message}
          </p>
        ) : null}
        {state.error ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-down)]">
            <AlertCircle size={12} /> {state.error}
          </p>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text-subtle)]">
        The scoring engine is unchanged: link power and traffic weighted 60/40, raised to 1.6, with
        penalties for a link profile that earns no traffic. What each input is worth depends entirely
        on where it came from, which is why the table above says so rather than presenting one clean
        number.
      </p>
    </div>
  );
}
