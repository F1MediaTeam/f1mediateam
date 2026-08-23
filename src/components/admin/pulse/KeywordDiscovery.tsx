"use client";

// Keyword discovery — type a phrase, get every search Google will suggest
// around it, then send the useful ones to a client.
//
// There is no volume column, and that is deliberate. Volume comes from an index
// built by scraping search results for years; no free copy of it exists, and a
// made-up number in that column would be planned around. What is here instead:
// how prominently Google suggests each phrase, how many different expansions
// surfaced it, and — where one of our own clients already appears for it —
// Search Console's measured impressions, labelled as measured.

import { useActionState, useMemo, useState } from "react";
import { Search, Loader2, Target, Check, AlertCircle } from "lucide-react";
import type { DiscoveredKeyword } from "@/lib/pulse/keyword-discovery";
import { discoverAction, trackForSiteAction, type SiteOption } from "@/app/admin/pulse/keyword-lab/discover";

const INTENT: Record<string, { label: string; bg: string; fg: string }> = {
  T: { label: "Transactional", bg: "rgba(63,142,132,.16)", fg: "var(--color-accent)" },
  C: { label: "Commercial", bg: "rgba(217,164,65,.16)", fg: "#d9a441" },
  I: { label: "Informational", bg: "rgba(96,165,250,.16)", fg: "#60a5fa" },
  N: { label: "Navigational", bg: "rgba(167,139,250,.16)", fg: "#a78bfa" },
};

export default function KeywordDiscovery({ sites }: { sites: SiteOption[] }) {
  const [state, discover, searching] = useActionState(discoverAction, {
    seed: "",
    results: [] as DiscoveredKeyword[],
    error: null as string | null,
  });
  const [track, trackAction, tracking] = useActionState(trackForSiteAction, {
    message: null as string | null,
    error: null as string | null,
  });

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [intent, setIntent] = useState("all");
  const [onlyMeasured, setOnlyMeasured] = useState(false);

  const rows = useMemo(() => {
    let r = state.results;
    if (filter.trim()) r = r.filter((x) => x.phrase.includes(filter.trim().toLowerCase()));
    if (intent !== "all") r = r.filter((x) => x.intent === intent);
    if (onlyMeasured) r = r.filter((x) => x.measuredImpressions !== null);
    return r;
  }, [state.results, filter, intent, onlyMeasured]);

  const toggle = (p: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const allShown = rows.length > 0 && rows.every((r) => picked.has(r.phrase));
  const measuredCount = state.results.filter((r) => r.measuredImpressions !== null).length;

  const field =
    "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm outline-none";

  return (
    <div className="space-y-5">
      <form action={discover} className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[18rem] flex-1 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
          <Search size={15} className="ml-3 shrink-0 text-[var(--color-text-subtle)]" />
          <input
            name="seed"
            required
            defaultValue={state.seed}
            placeholder="A phrase your client sells — custom embroidery, asset protection trust…"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-60"
        >
          {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {searching ? "Asking Google…" : "Expand"}
        </button>
      </form>

      {state.error ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-down)]">
          <AlertCircle size={14} /> {state.error}
        </p>
      ) : null}

      {searching ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          Running about 35 queries against Google&rsquo;s autocomplete — the seed, the seed followed by
          each letter of the alphabet, and the usual question and buying prefixes. Takes a few seconds.
        </p>
      ) : null}

      {state.results.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${state.results.length} keywords…`}
              className={`${field} min-w-[12rem] flex-1`}
            />
            <select value={intent} onChange={(e) => setIntent(e.target.value)} className={field}>
              <option value="all">All intents</option>
              {Object.entries(INTENT).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {measuredCount > 0 ? (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <input type="checkbox" checked={onlyMeasured} onChange={(e) => setOnlyMeasured(e.target.checked)} />
                Only ones we have real data for ({measuredCount})
              </label>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {state.results.length} real searches Google suggests around &ldquo;{state.seed}&rdquo;.
            &ldquo;Repeats&rdquo; is how many different expansions surfaced the phrase — a rough
            popularity signal, not a volume. Rows with impressions are ones a client of yours already
            appears for, and those numbers are Google&rsquo;s.
          </p>

          <form action={trackAction} className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allShown}
                        onChange={() =>
                          setPicked((prev) => {
                            const n = new Set(prev);
                            if (allShown) rows.forEach((r) => n.delete(r.phrase));
                            else rows.forEach((r) => n.add(r.phrase));
                            return n;
                          })
                        }
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Keyword</th>
                    <th className="px-3 py-2 font-medium">Intent</th>
                    <th className="px-3 py-2 font-medium">Repeats</th>
                    <th className="px-3 py-2 font-medium">Impressions</th>
                    <th className="px-3 py-2 font-medium">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr key={r.phrase} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          name="phrase"
                          value={r.phrase}
                          checked={picked.has(r.phrase)}
                          onChange={() => toggle(r.phrase)}
                        />
                      </td>
                      <td className="px-3 py-2">{r.phrase}</td>
                      <td className="px-3 py-2">
                        <span
                          title={INTENT[r.intent].label}
                          className="inline-flex h-5 w-6 items-center justify-center rounded text-xs font-bold"
                          style={{ background: INTENT[r.intent].bg, color: INTENT[r.intent].fg }}
                        >
                          {r.intent}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">{r.seenIn}×</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.measuredImpressions === null ? (
                          <span className="text-[var(--color-text-subtle)]">—</span>
                        ) : (
                          <span title={`Measured on ${r.measuredOn}`} style={{ color: "var(--color-accent)" }}>
                            {r.measuredImpressions.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">
                        {r.measuredPosition === null ? "—" : r.measuredPosition.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                  Track for
                </label>
                <select name="siteId" required className={field}>
                  <option value="">Choose a client…</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} — {s.domain}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[14rem] flex-1">
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                  Page that should rank (optional)
                </label>
                <input
                  name="targetUrl"
                  placeholder="/embroidery or a full URL — blank means the homepage"
                  className={`${field} w-full`}
                />
              </div>
              <button
                type="submit"
                disabled={tracking || picked.size === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-40"
              >
                {tracking ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} />}
                Track {picked.size > 0 ? picked.size : ""} for this client
              </button>
            </div>
          </form>

          {track.message ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: "var(--color-up)" }}>
              <Check size={14} /> {track.message} It will appear on that client&rsquo;s Keyword Lab tab.
            </p>
          ) : null}
          {track.error ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-down)]">
              <AlertCircle size={14} /> {track.error}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
