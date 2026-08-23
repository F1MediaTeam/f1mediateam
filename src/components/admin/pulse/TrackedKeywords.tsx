"use client";

// Keywords somebody deliberately chose to work on for this client, with the
// page each one is meant to rank.
//
// Separate from the big list of everything the site happens to appear for,
// because they answer different questions. That list is what Google decided;
// this is what we decided, and it is the one a client is shown.

import { useState } from "react";
import { ExternalLink, Trash2, Plus, Loader2 } from "lucide-react";
import type { TrackedKeyword } from "@/lib/pulse/keywords-shared";
import { addTrackedAction, setTargetAction, untrackAction } from "@/app/admin/pulse/[siteId]/gaps/actions";

function PositionCell({ position }: { position: number | null }) {
  if (position === null)
    return (
      <span
        className="text-xs text-[var(--color-text-subtle)]"
        title="Search Console has recorded no impressions for this exact phrase"
      >
        no data yet
      </span>
    );
  const tone = position <= 3 ? "var(--color-up)" : position <= 10 ? "var(--color-accent)" : undefined;
  return <span className="font-semibold tabular-nums" style={{ color: tone }}>{position.toFixed(1)}</span>;
}

function TargetCell({ siteId, id, value }: { siteId: string; id: string; value: string | null }) {
  const [v, setV] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (v === (value ?? "")) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("siteId", siteId);
    fd.set("keywordId", id);
    fd.set("targetUrl", v);
    await setTargetAction(fd);
    setSaving(false);
  }

  return (
    <span className="flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="/page-that-should-rank"
        className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs text-[var(--color-text-muted)] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent)]"
      />
      {saving ? <Loader2 size={12} className="animate-spin text-[var(--color-text-subtle)]" /> : null}
      {v && !saving ? (
        <a href={v.startsWith("http") ? v : undefined} target="_blank" rel="noreferrer"
           className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent)]" title="Open">
          <ExternalLink size={12} />
        </a>
      ) : null}
    </span>
  );
}

export default function TrackedKeywords({
  siteId,
  domain,
  tracked,
}: {
  siteId: string;
  domain: string;
  tracked: TrackedKeyword[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <form
        action={async (fd) => { setAdding(true); await addTrackedAction(fd); setAdding(false); }}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="siteId" value={siteId} />
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Keyword to work on
          </label>
          <input
            name="phrase"
            required
            placeholder="custom embroidery phoenix"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Page that should rank
          </label>
          <input
            name="targetUrl"
            placeholder={`/embroidery — blank means ${domain}`}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-60"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
        </button>
      </form>

      {tracked.length === 0 ? (
        <p className="py-4 text-sm text-[var(--color-text-muted)]">
          Nothing tracked for this client yet. Add one above, or send a batch over from the Keyword
          Lab discovery page.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                <th className="px-3 py-2 font-medium">Keyword</th>
                <th className="px-3 py-2 font-medium">Page that should rank</th>
                <th className="px-3 py-2 font-medium">Position</th>
                <th className="px-3 py-2 font-medium">Impressions</th>
                <th className="px-3 py-2 font-medium">Clicks</th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tracked.map((k) => (
                <tr key={k.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                  <td className="px-3 py-2 font-medium">
                    {k.phrase}
                    {k.nearMatch ? (
                      <div className="mt-1 text-xs font-normal leading-relaxed text-[var(--color-text-muted)]">
                        Nobody searches this exact phrase, but this site ranks{" "}
                        <strong style={{ color: k.nearMatch.position <= 10 ? "var(--color-up)" : undefined }}>
                          #{k.nearMatch.position.toFixed(1)}
                        </strong>{" "}
                        for <strong>&ldquo;{k.nearMatch.phrase}&rdquo;</strong>
                        {k.nearMatch.impressions ? ` (${k.nearMatch.impressions} impressions)` : ""}.
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 w-72"><TargetCell siteId={siteId} id={k.id} value={k.targetUrl} /></td>
                  <td className="px-3 py-2"><PositionCell position={k.position} /></td>
                  <td className="px-3 py-2 tabular-nums">{k.impressions.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--color-text-muted)]">{k.clicks}</td>
                  <td className="px-3 py-2">
                    <form action={untrackAction}>
                      <input type="hidden" name="siteId" value={siteId} />
                      <input type="hidden" name="keywordId" value={k.id} />
                      <button type="submit" title="Stop tracking"
                              className="text-[var(--color-text-subtle)] hover:text-[var(--color-down)]">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--color-text-subtle)]">
        Position, impressions and clicks come from Search Console. &ldquo;Not ranking yet&rdquo; means
        Google has not recorded this site appearing for that search — which is the honest state for a
        keyword you have only just started working on.
      </p>
    </div>
  );
}
