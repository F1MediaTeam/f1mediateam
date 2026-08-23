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

/**
 * The page for this keyword, as a link you can open.
 *
 * Reads in priority order: the page somebody assigned, the page Google
 * actually ranks, then a page on the site whose URL matches the keyword. The
 * last two are labelled, because "we found this" and "you chose this" are
 * different claims and a client report should not blur them.
 *
 * Click the link to open the page; click the pencil to change it.
 */
function TargetCell({
  siteId,
  domain,
  id,
  phrase,
  assigned,
  ranking,
  suggested,
}: {
  siteId: string;
  domain: string;
  id: string;
  phrase: string;
  assigned: string | null;
  ranking: string | null;
  suggested: string | null;
}) {
  const resolved = assigned ?? ranking ?? suggested;
  const source: "assigned" | "ranking" | "found" | null = assigned
    ? "assigned"
    : ranking
      ? "ranking"
      : suggested
        ? "found"
        : null;

  const [editing, setEditing] = useState(!resolved);
  const [v, setV] = useState(resolved ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const fd = new FormData();
    fd.set("siteId", siteId);
    fd.set("keywordId", id);
    fd.set("targetUrl", v.trim());
    await setTargetAction(fd);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={`/page-name — blank means ${domain}`}
          className="w-56 rounded border border-[var(--color-accent)] bg-[var(--color-bg-elev)] px-2 py-1 text-xs outline-none"
        />
        {saving ? <Loader2 size={11} className="animate-spin text-[var(--color-text-subtle)]" /> : null}
      </span>
    );
  }

  const pretty =
    (resolved ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(domain, "") || "/";

  return (
    <span className="flex items-center gap-1.5">
      <a
        href={resolved ?? "#"}
        target="_blank"
        rel="noreferrer"
        title={resolved ?? phrase}
        className="block max-w-[15rem] truncate text-xs text-[var(--color-accent)] hover:underline"
      >
        {pretty}
      </a>
      <ExternalLink size={10} className="shrink-0 text-[var(--color-text-subtle)]" />
      {source === "ranking" ? (
        <span title="This is the page Google currently ranks for this search"
              className="shrink-0 rounded px-1 text-[9px] font-semibold uppercase"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>ranking</span>
      ) : null}
      {source === "found" ? (
        <span title="Matched from this site's own pages by the words in the URL — confirm it is the right one"
              className="shrink-0 rounded px-1 text-[9px] font-semibold uppercase"
              style={{ background: "rgba(217,164,65,.18)", color: "#d9a441" }}>found</span>
      ) : null}
      <button
        onClick={() => setEditing(true)}
        title="Change the page"
        className="shrink-0 text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text)] print:hidden"
      >
        edit
      </button>
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
                <th className="px-3 py-2 font-medium">Page</th>
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
                  <td className="px-3 py-2 w-72">
                    <TargetCell
                      siteId={siteId}
                      domain={domain}
                      id={k.id}
                      phrase={k.phrase}
                      assigned={k.targetUrl}
                      ranking={k.rankingPage}
                      suggested={k.suggestedPage}
                    />
                  </td>
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
        Position, impressions and clicks come from Search Console. A page marked{" "}
        <strong>ranking</strong> is the one Google currently shows for that search;{" "}
        <strong>found</strong> means we matched a page on this site by the words in its URL — worth a
        glance before you trust it. Click any page to open it, or edit to point the keyword somewhere
        else.
      </p>
    </div>
  );
}
