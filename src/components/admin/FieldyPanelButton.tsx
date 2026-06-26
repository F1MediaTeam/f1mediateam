"use client";

// "Fieldy" — single button that opens a panel listing every Fieldy
// conversation in a date window. Multi-select cards → Generate slides via
// /api/fieldy/slides (Claude) → preview deck + Copy for Gamma markdown.
//
// The Fieldy key never reaches the browser — both calls go through our own
// API routes that hold the key server-side.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

interface Conversation {
  id: string;
  title: string;
  date: string;
  summary: string;
  keywords: string[];
  hasContent: boolean;
}

interface ListResp {
  window?: { from: string; to: string };
  count?: number;
  conversations?: Conversation[];
  error?: string;
}

interface DeckSlide {
  title: string;
  bullets: string[];
}
interface SlidesResp {
  deck?: { deckTitle: string; slides: DeckSlide[] };
  sourceCount?: number;
  sourceIds?: string[];
  error?: string;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function FieldyPanelButton() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoToday());
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<ListResp | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [slides, setSlides] = useState<SlidesResp | null>(null);
  const [copied, setCopied] = useState(false);
  const cacheRef = useRef<{ key: string; data: ListResp; at: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function loadConversations(force = false) {
    const cacheKey = `${from}|${to}`;
    if (!force && cacheRef.current && cacheRef.current.key === cacheKey && Date.now() - cacheRef.current.at < 60_000) {
      setList(cacheRef.current.data);
      return;
    }
    setLoading(true);
    setList(null);
    setSelected(new Set());
    setSlides(null);
    try {
      const params = new URLSearchParams({ from, to });
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    if (!list?.conversations) return;
    setSelected(new Set(list.conversations.map((c) => c.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  async function generateSlides() {
    setGenerating(true);
    setSlides(null);
    try {
      const res = await fetch("/api/fieldy/slides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), from, to }),
      });
      const json = (await res.json()) as SlidesResp;
      setSlides(json);
    } catch (err) {
      setSlides({ error: err instanceof Error ? err.message : "Slide generation failed" });
    } finally {
      setGenerating(false);
    }
  }

  function deckMarkdown(): string {
    if (!slides?.deck) return "";
    const { deckTitle, slides: ss } = slides.deck;
    const lines: string[] = [];
    if (deckTitle) lines.push(`# ${deckTitle}`, "");
    for (const s of ss) {
      lines.push(`## ${s.title}`);
      for (const b of s.bullets) lines.push(`- ${b}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  async function copyForGamma() {
    const md = deckMarkdown();
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // older browsers: open prompt as fallback
      window.prompt("Copy for Gamma — paste into Gamma → New → Paste in text:", md);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="px-6"
        onClick={() => {
          setOpen(true);
          if (!list) void loadConversations();
        }}
      >
        Fieldy
      </Button>

      {open ? (
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
                <p className="text-xs text-[var(--color-text-muted)]">Pick conversations · Claude shapes them into a slide deck · Copy for Gamma.</p>
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
                <div className="flex items-center justify-between mb-2 text-xs text-[var(--color-text-muted)]">
                  <span>
                    {list.conversations.length} conversation{list.conversations.length === 1 ? "" : "s"} ·
                    {" "}
                    <strong className="text-[var(--color-text)]">{selected.size} selected</strong>
                  </span>
                  <div className="flex gap-2">
                    <button type="button" onClick={selectAll} className="underline hover:text-[var(--color-text)]">Select all</button>
                    <button type="button" onClick={clearAll} className="underline hover:text-[var(--color-text)]">Clear</button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 mb-4">
                  {list.conversations.map((c) => {
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
                            <div className="text-sm font-medium truncate">{c.title}</div>
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

            {/* Generate + preview */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-end">
              <Button
                type="button"
                onClick={() => void generateSlides()}
                disabled={generating || selected.size === 0}
                className="px-6"
              >
                {generating ? "Generating…" : `Generate slides (${selected.size})`}
              </Button>
            </div>

            {slides?.error ? (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{slides.error}</div>
            ) : null}

            {slides?.deck ? (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">Deck preview</div>
                    <h4 className="text-base font-semibold mt-0.5">{slides.deck.deckTitle}</h4>
                    <div className="text-[11px] text-[var(--color-text-subtle)]">
                      {slides.deck.slides.length} slides from {slides.sourceCount} conversation{slides.sourceCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Button type="button" onClick={() => void copyForGamma()}>
                    {copied ? "Copied!" : "Copy for Gamma"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  {slides.deck.slides.map((s, i) => (
                    <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">Slide {i + 1}</div>
                      <div className="mt-0.5 text-sm font-semibold">{s.title}</div>
                      <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-muted)]">
                        {s.bullets.map((b, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="text-[var(--color-accent)]">•</span>
                            <span className="text-[var(--color-text)]/90">{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <details className="mt-3 text-xs text-[var(--color-text-muted)]">
                  <summary className="cursor-pointer">Markdown for Gamma</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-[11px] font-mono whitespace-pre-wrap">{deckMarkdown()}</pre>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
