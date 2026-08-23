"use client";

// Keywords this site does not appear for.
//
// Ideas come from Google's own autocomplete, seeded with the client's strongest
// existing keywords, so the suggestions stay in the business they are actually
// in. Ordered by how prominently Google suggests each one, which is a real
// frequency signal — but it is not search volume, and no volume is shown here
// because none is available for free and inventing one would be worse than the
// gap it filled.

import { useActionState } from "react";
import { Loader2, Sparkles, Plus, Check } from "lucide-react";
import type { KeywordGap } from "@/lib/pulse/keyword-gaps";
import { findGapsAction, trackGapAction } from "@/app/admin/pulse/[siteId]/gaps/actions";

export default function KeywordGaps({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(findGapsAction, {
    gaps: [] as KeywordGap[],
    error: null as string | null,
  });

  const missing = state.gaps.filter((g) => !g.alreadyRanks);
  const covered = state.gaps.filter((g) => g.alreadyRanks);

  return (
    <div className="space-y-4">
      <form action={action}>
        <input type="hidden" name="siteId" value={siteId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-60"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {pending ? "Asking Google…" : state.gaps.length ? "Look again" : "Find keywords we're missing"}
        </button>
      </form>

      {state.error ? (
        <p className="text-xs text-[var(--color-down)]">{state.error}</p>
      ) : null}

      {state.gaps.length > 0 ? (
        <>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {missing.length} searches people make around this client&rsquo;s strongest keywords that the
            site does <strong>not</strong> currently appear for, and {covered.length} it already does.
            Ordered by how prominently Google suggests each one. There is no volume column because no
            free source publishes one — Google&rsquo;s ordering is the demand signal here, and it is
            directional rather than measured.
          </p>

          {missing.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[38rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                    <th className="px-3 py-2 font-medium">Search we don&rsquo;t show up for</th>
                    <th className="px-3 py-2 font-medium">Suggested from</th>
                    <th className="px-3 py-2 font-medium">Google&rsquo;s order</th>
                    <th className="px-3 py-2 font-medium">Track</th>
                  </tr>
                </thead>
                <tbody>
                  {missing.map((g) => (
                    <tr key={g.phrase} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2 font-medium">{g.phrase}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{g.seed}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">#{g.rank}</td>
                      <td className="px-3 py-2">
                        <form action={trackGapAction}>
                          <input type="hidden" name="siteId" value={siteId} />
                          <input type="hidden" name="phrase" value={g.phrase} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          >
                            <Plus size={12} /> Track
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {covered.length > 0 ? (
            <details className="rounded-lg border border-[var(--color-border)] p-3">
              <summary className="cursor-pointer text-xs font-medium text-[var(--color-text-muted)]">
                {covered.length} of Google&rsquo;s suggestions this site already ranks for
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {covered.map((g) => (
                  <span
                    key={g.phrase}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                  >
                    <Check size={11} /> {g.phrase}
                    {g.currentPosition ? ` · #${g.currentPosition.toFixed(0)}` : ""}
                  </span>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
