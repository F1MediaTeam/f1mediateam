"use client";

// Domain Lookup — type a domain, get what can be measured about it.
//
// Deliberately reports only what was observed. There is no traffic estimate
// and no keyword list here, because neither can be measured from outside a
// site you do not control, and a modelled number sitting in a column of
// measured ones is how a report quietly starts lying to a client.

import { useActionState } from "react";
import { Loader2, Search } from "lucide-react";
import type { LookupResult } from "@/lib/pulse/lookup";
import { runLookupAction } from "@/app/admin/pulse/lookup/actions";

const card =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4";
const label =
  "text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]";

function Stat({ children, value, tone }: { children: React.ReactNode; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={card}>
      <div className={label}>{children}</div>
      <div
        className="mt-1.5 text-2xl font-semibold tabular-nums"
        style={{ color: tone === "good" ? "var(--color-up)" : tone === "bad" ? "var(--color-down)" : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function speedTone(score: number | null): "good" | "bad" | undefined {
  if (score == null) return undefined;
  return score >= 50 ? "good" : "bad";
}

export default function DomainLookup() {
  const [state, action, pending] = useActionState(runLookupAction, {
    result: null as LookupResult | null,
    error: null as string | null,
  });
  const r = state.result;

  return (
    <div className="space-y-6">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input
          name="domain"
          required
          placeholder="anydomain.com"
          className="min-w-[16rem] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-60"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {pending ? "Measuring…" : "Look up"}
        </button>
        <p className="w-full text-xs text-[var(--color-text-subtle)]">
          Works on any domain — a prospect, a competitor, or a client. Nothing is
          stored and nothing is charged. Takes about 20 seconds.
        </p>
      </form>

      {state.error ? (
        <div className="rounded-lg border border-[var(--color-down)]/40 bg-[var(--color-down)]/10 px-4 py-3 text-sm">
          {state.error}
        </div>
      ) : null}

      {r && !state.error ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{r.domain}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Measured {new Date(r.checkedAt).toLocaleString("en-US", { timeZone: "America/Phoenix" })} MST
              {r.platform ? ` · built on ${r.platform}` : ""}
              {r.redirectsTo ? ` · redirects to ${r.redirectsTo}` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat value={r.pagesListed.toLocaleString()}>Pages in sitemap</Stat>
            <Stat value={r.publishedLast30d == null ? "n/a" : String(r.publishedLast30d)}>
              Published, 30 days
            </Stat>
            <Stat value={r.publishedLast90d == null ? "n/a" : String(r.publishedLast90d)}>
              Published, 90 days
            </Stat>
            <Stat value={r.speedScore == null ? "—" : String(r.speedScore)} tone={speedTone(r.speedScore)}>
              Mobile speed
            </Stat>
          </div>

          {r.publishedLast30d == null && r.pagesListed > 0 ? (
            <p className="text-xs text-[var(--color-text-subtle)]">
              Publishing pace reads n/a because this platform stamps the same
              modified date across the whole sitemap, which makes the dates
              meaningless rather than merely imprecise.
            </p>
          ) : null}

          {r.issues.length > 0 ? (
            <div className={card}>
              <div className={label}>What we found</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {r.issues.map((issue) => (
                  <li key={issue} className="flex gap-2">
                    <span className="text-[var(--color-down)]">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className={card}>
              <div className={label}>What we found</div>
              <p className="mt-2 text-sm">Nothing obviously wrong on the pages sampled.</p>
            </div>
          )}

          <div className={card}>
            <div className={label}>Crawler access</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.botMatrix.map((b) => (
                <span
                  key={b.bot}
                  className="rounded-md px-2 py-1 text-[11px] font-medium"
                  style={{
                    background: b.allowed ? "var(--color-accent-soft)" : "rgba(220,38,38,.14)",
                    color: b.allowed ? "var(--color-accent)" : "var(--color-down)",
                  }}
                >
                  {b.bot} {b.allowed ? "allowed" : "blocked"}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-subtle)]">
              Read from robots.txt. Allowed means the homepage is reachable — a bot
              blocked only from a cart page still counts as allowed.
            </p>
          </div>

          <div className={card}>
            <div className={label}>Pages sampled ({r.pages.length})</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                    <th className="pb-2 pr-3 font-medium">Page</th>
                    <th className="pb-2 pr-3 font-medium">Title</th>
                    <th className="pb-2 pr-3 font-medium">Meta</th>
                    <th className="pb-2 pr-3 font-medium">H1</th>
                    <th className="pb-2 pr-3 font-medium">Words</th>
                    <th className="pb-2 font-medium">Schema</th>
                  </tr>
                </thead>
                <tbody>
                  {r.pages.map((p) => (
                    <tr key={p.url} className="border-t border-[var(--color-border)]">
                      <td className="py-2 pr-3">
                        <span className="block max-w-[16rem] truncate text-xs text-[var(--color-text-muted)]">
                          {p.url.replace(/^https?:\/\//, "")}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {p.title ? `${p.titleLength} chars` : <span className="text-[var(--color-down)]">missing</span>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {p.metaDescription ? `${p.metaLength} chars` : <span className="text-[var(--color-down)]">missing</span>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {p.h1Count === 1 ? "1" : <span className="text-[var(--color-down)]">{p.h1Count}</span>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{p.wordCount.toLocaleString()}</td>
                      <td className="py-2 text-xs text-[var(--color-text-muted)]">
                        {p.schemaTypes.length ? p.schemaTypes.slice(0, 3).join(", ") : "none"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-[var(--color-text-subtle)]">
            Every figure here was measured by fetching the site. There is no
            traffic or keyword estimate, because those cannot be measured from
            outside a site you do not control — only modelled, and a modelled
            number does not belong in a column of measured ones.
          </p>
        </div>
      ) : null}
    </div>
  );
}
