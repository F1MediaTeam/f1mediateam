"use client";

// "Fieldy" — single button that opens a panel listing every Fieldy
// conversation in a date window. Multi-select cards. Clicking "Use N for
// this deck" writes the selected IDs into a hidden field on the parent
// monthly-report form so the existing Claude pipeline pulls key points
// from EXACTLY those conversations as FIELDY_TRANSCRIPT.
//
// The Fieldy key never reaches the browser — the list call is proxied
// through /api/fieldy/conversations which holds the key server-side.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";

interface Conversation {
  id: string;
  title: string;
  date: string;
  summary: string;
  keywords: string[];
  hasContent: boolean;
  /** Fuzzy name-match against the selected client (server-side). */
  matchesClient?: boolean;
}

interface ListResp {
  window?: { from: string; to: string };
  count?: number;
  conversations?: Conversation[];
  error?: string;
}

interface Props {
  /** Selected client's company name — scopes the list + default filter. */
  clientName?: string;
  /** The report window (ISO dates) — the panel's default range follows it. */
  windowFrom?: string;
  windowTo?: string;
  /** Changes when the client changes: committed picks are cleared, since a
   *  conversation curated for client A must never ride into client B's deck. */
  resetKey?: string;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function FieldyPanelButton({ clientName, windowFrom, windowTo, resetKey }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(windowFrom ?? isoDaysAgo(30));
  const [to, setTo] = useState(windowTo ?? isoToday());
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<ListResp | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenCount, setChosenCount] = useState(0); // how many are committed to the parent form
  const [onlyClient, setOnlyClient] = useState(true);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const cacheRef = useRef<{ key: string; data: ListResp; at: number } | null>(null);
  const prevResetKey = useRef(resetKey);

  // On mount, pre-load any previously-committed IDs from the parent form's
  // hidden input — so reopening the panel shows the existing selection.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const input = form.querySelector<HTMLInputElement>('input[name="fieldy_ids"]');
    if (input?.value) {
      const ids = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      setSelected(new Set(ids));
      setChosenCount(ids.length);
    }
  }, []);

  // Follow the report window: when the meeting type or custom dates change,
  // the panel's default range tracks them (a manual range set inside the
  // panel still wins until the next change).
  useEffect(() => {
    setFrom(windowFrom ?? isoDaysAgo(30));
    setTo(windowTo ?? isoToday());
    cacheRef.current = null;
    setList(null);
  }, [windowFrom, windowTo]);

  // Client switched: clear committed picks + stale list.
  useEffect(() => {
    if (prevResetKey.current === resetKey) return;
    prevResetKey.current = resetKey;
    const form = rootRef.current?.closest("form");
    const input = form?.querySelector<HTMLInputElement>('input[name="fieldy_ids"]');
    if (input) input.value = "";
    setSelected(new Set());
    setChosenCount(0);
    setOnlyClient(true);
    cacheRef.current = null;
    setList(null);
  }, [resetKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function loadConversations(force = false) {
    const cacheKey = `${from}|${to}|${clientName ?? ""}`;
    if (!force && cacheRef.current && cacheRef.current.key === cacheKey && Date.now() - cacheRef.current.at < 60_000) {
      setList(cacheRef.current.data);
      return;
    }
    setLoading(true);
    setList(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (clientName) params.set("client", clientName);
      const res = await fetch(`/api/fieldy/conversations?${params.toString()}`);
      const json = (await res.json()) as ListResp;
      setList(json);
      cacheRef.current = { key: cacheKey, data: json, at: Date.now() };
    } catch (err) {
      setList({ error: err instanceof Error ? err.message : "Couldn't reach Fieldy" });
    } finally {
      setLoading(false);
    }
  }

  // What the list shows: with a client selected and the scope toggle on,
  // only that client's name-matched conversations — unless none match, in
  // which case show everything (the matcher is fuzzy; hiding all would read
  // as "no meetings exist").
  const all = list?.conversations ?? [];
  const matchCount = all.filter((c) => c.matchesClient).length;
  const scoped = Boolean(clientName) && onlyClient && matchCount > 0;
  const visible = scoped ? all.filter((c) => c.matchesClient) : all;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(visible.map((c) => c.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function commitSelection() {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    let input = form.querySelector<HTMLInputElement>('input[name="fieldy_ids"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "fieldy_ids";
      form.appendChild(input);
    }
    input.value = Array.from(selected).join(",");
    setChosenCount(selected.size);
    setOpen(false);
  }

  function clearSelection() {
    const form = rootRef.current?.closest("form");
    if (form) {
      const input = form.querySelector<HTMLInputElement>('input[name="fieldy_ids"]');
      if (input) input.value = "";
    }
    setSelected(new Set());
    setChosenCount(0);
  }

  return (
    <span ref={rootRef} className="contents">
      <Button
        type="button"
        variant="secondary"
        className="px-6"
        onClick={() => {
          setOpen(true);
          if (!list) void loadConversations();
        }}
      >
        Fieldy{chosenCount > 0 ? ` · ${chosenCount} selected` : ""}
      </Button>

      {/* Portaled to <body>: the builder card's entrance animation makes it a
          transform containing block, which would trap and clip this fixed
          overlay inside the card. */}
      {open ? createPortal(
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-4xl rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] p-6 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold">Fieldy</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Pick conversations. Their key points + notes are handed to the same Claude pipeline that writes the slide titles and body text for the .pptx below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ×
              </button>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-4 items-end">
              <label className="text-xs">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">From</div>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">To</div>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
              </label>
              <Button type="button" variant="secondary" onClick={() => void loadConversations(true)}>
                Reload
              </Button>
            </div>

            {/* List */}
            {loading ? (
              <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Pulling from Fieldy…</div>
            ) : list?.error ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{list.error}</div>
            ) : list?.conversations && list.conversations.length === 0 ? (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-8 text-sm text-[var(--color-text-muted)] text-center">
                No Fieldy conversations in this window.
                <div className="mt-2 text-xs">Widen the date range above and click Reload.</div>
              </div>
            ) : list?.conversations ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-[var(--color-text-muted)]">
                  <span>
                    {visible.length} conversation{visible.length === 1 ? "" : "s"}
                    {scoped ? ` for ${clientName}` : ""} ·{" "}
                    <strong className="text-[var(--color-text)]">{selected.size} selected</strong>
                  </span>
                  <div className="flex items-center gap-3">
                    {clientName ? (
                      matchCount > 0 ? (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={onlyClient}
                            onChange={(e) => setOnlyClient(e.target.checked)}
                            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                          />
                          Only {clientName} ({matchCount})
                        </label>
                      ) : (
                        <span className="text-amber-300/90">
                          None mention {clientName} by name — showing all
                        </span>
                      )
                    ) : null}
                    <button type="button" onClick={selectAll} className="underline hover:text-[var(--color-text)]">Select all</button>
                    <button type="button" onClick={clearAll} className="underline hover:text-[var(--color-text)]">Clear</button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 mb-4">
                  {visible.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-start gap-3 cursor-pointer rounded-lg border px-3 py-2.5 transition"
                        style={{
                          borderColor: on ? "var(--color-accent)" : "var(--color-border)",
                          background: on ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "var(--color-bg-elev)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(c.id)}
                          className="mt-1 h-4 w-4 accent-[var(--color-accent)] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="text-sm font-medium truncate">{c.title}</div>
                              {!scoped && clientName && c.matchesClient ? (
                                <span className="shrink-0 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                                  {clientName}
                                </span>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-[11px] font-mono text-[var(--color-text-muted)]">
                              {c.date ? c.date.slice(0, 10) : ""}
                            </div>
                          </div>
                          {c.summary ? (
                            <div className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">{c.summary}</div>
                          ) : null}
                          {c.keywords.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.keywords.slice(0, 6).map((k) => (
                                <span key={k} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">{k}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-end pt-2 border-t border-[var(--color-border)]">
              {chosenCount > 0 ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-[var(--color-text-muted)] hover:text-red-300 underline self-center md:self-auto"
                >
                  Clear committed selection
                </button>
              ) : null}
              <Button
                type="button"
                onClick={commitSelection}
                disabled={selected.size === 0}
                className="px-6"
              >
                Use {selected.size} for this deck
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </span>
  );
}
