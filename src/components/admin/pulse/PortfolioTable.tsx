"use client";

// The Portfolio Overview as a sortable table.
//
// Cards are better for glancing at one client; a table is better for the
// question this view actually gets used for — "which of these needs me today".
// Sorting is client-side because the whole portfolio is already loaded: an
// agency with hundreds of clients would want server-side sorting, and this
// comment is where that decision gets revisited.
//
// Every column here is measured or computed from free sources. Nothing is
// estimated, so the table needs no source-class legend.

import Link from "next/link";
import { useState } from "react";

export interface PortfolioRow {
  siteId: string;
  domain: string;
  clientName: string;
  colour: string | null;
  status: string;
  live: number;
  visitors: number;
  visitorsPrev: number;
  conversions: number;
  clicks: number;
  clicksPrev: number;
  errors: number;
  opportunities: number;
  strikeDistance: number;
  indexed: number | null;
  indexTotal: number | null;
  competitors: number;
}

type SortKey =
  | "clientName"
  | "live"
  | "visitors"
  | "conversions"
  | "clicks"
  | "errors"
  | "opportunities"
  | "indexed";

const COLUMNS: Array<{ key: SortKey; label: string; help: string; numeric: boolean }> = [
  { key: "clientName", label: "Client", help: "The client and the site being measured.", numeric: false },
  { key: "live", label: "Now", help: "People on the site in the last five minutes.", numeric: true },
  { key: "visitors", label: "Visitors", help: "Unique visitors today, against yesterday.", numeric: true },
  { key: "conversions", label: "Actions", help: "Phone taps, email clicks, outbound clicks and form submissions today.", numeric: true },
  { key: "clicks", label: "Search clicks", help: "Clicks from Google in the last 30 days, against the 30 before. Measured by Google.", numeric: true },
  { key: "indexed", label: "In Google", help: "Pages Google has accepted, out of the pages the site lists.", numeric: true },
  { key: "opportunities", label: "To do", help: "Open opportunities. The number in brackets is keywords sitting just off page one.", numeric: true },
  { key: "errors", label: "Errors", help: "Errors found in the last crawl.", numeric: true },
];

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <span className="text-[var(--color-text-subtle)]">—</span>;
  if (before === 0) return <span style={{ color: "var(--color-ok)" }}>new</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-[var(--color-text-subtle)]">flat</span>;
  return (
    <span style={{ color: pct > 0 ? "var(--color-ok)" : "var(--color-bad)" }}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export default function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  const [sort, setSort] = useState<SortKey>("live");
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    if (sort === "clientName") {
      const cmp = a.clientName.localeCompare(b.clientName);
      return asc ? cmp : -cmp;
    }
    const av = sort === "indexed" ? (a.indexed ?? -1) : (a[sort] as number);
    const bv = sort === "indexed" ? (b.indexed ?? -1) : (b[sort] as number);
    return asc ? av - bv : bv - av;
  });

  function toggle(key: SortKey) {
    if (key === sort) setAsc(!asc);
    else {
      setSort(key);
      // Names read naturally A–Z; every number is more useful biggest-first.
      setAsc(key === "clientName");
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                title={c.help}
                className={`px-3 py-2.5 text-[10px] font-normal uppercase tracking-widest text-[var(--color-text-subtle)] ${
                  c.numeric ? "text-right" : "text-left"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  className="hover:text-[var(--color-text)]"
                >
                  {c.label}
                  {sort === c.key ? <span aria-hidden> {asc ? "▲" : "▼"}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.siteId} className="border-b border-[var(--color-border)] last:border-0">
              <td className="px-3 py-2.5">
                <Link href={`/admin/pulse/${r.siteId}`} className="flex items-center gap-2">
                  {r.colour ? (
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: r.colour }} />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.clientName}</span>
                    <span className="block truncate font-mono text-[10px] text-[var(--color-text-subtle)]">
                      {r.domain}
                    </span>
                  </span>
                </Link>
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.live > 0 ? (
                  <span style={{ color: "var(--color-ok)" }}>{r.live}</span>
                ) : (
                  <span className="text-[var(--color-text-subtle)]">0</span>
                )}
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums">
                <span className="font-semibold">{r.visitors.toLocaleString()}</span>
                <span className="ml-1.5 text-[10px]">
                  <Delta now={r.visitors} before={r.visitorsPrev} />
                </span>
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums">{r.conversions.toLocaleString()}</td>

              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.clicks === 0 && r.clicksPrev === 0 ? (
                  <span className="text-[var(--color-text-subtle)]">—</span>
                ) : (
                  <>
                    <span className="font-semibold">{r.clicks.toLocaleString()}</span>
                    <span className="ml-1.5 text-[10px]">
                      <Delta now={r.clicks} before={r.clicksPrev} />
                    </span>
                  </>
                )}
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.indexed === null ? (
                  <span className="text-[var(--color-text-subtle)]">—</span>
                ) : (
                  <span>
                    {r.indexed}
                    <span className="text-[var(--color-text-subtle)]">/{r.indexTotal}</span>
                  </span>
                )}
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.opportunities === 0 ? (
                  <span className="text-[var(--color-text-subtle)]">—</span>
                ) : (
                  <>
                    {r.opportunities}
                    {r.strikeDistance > 0 ? (
                      <span className="ml-1 text-[10px] text-[var(--color-text-subtle)]">
                        ({r.strikeDistance})
                      </span>
                    ) : null}
                  </>
                )}
              </td>

              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.errors > 0 ? (
                  <span style={{ color: "var(--color-bad)" }}>{r.errors}</span>
                ) : (
                  <span className="text-[var(--color-text-subtle)]">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-[var(--color-border)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
        Every column here is measured — by the F1 tag, by our crawler, or by Google. Nothing on this
        table is estimated. Search clicks and In Google come from Search Console and lag about two days.
      </p>
    </div>
  );
}
