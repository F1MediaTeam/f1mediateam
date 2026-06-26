"use client";

// "Preview Fieldy pull" button. Reads the same Company + Time frame + Custom
// from/to fields from the surrounding monthly-report form so the preview shows
// EXACTLY what Claude will receive as FIELDY_TRANSCRIPT. Opens a modal with a
// compact summary per matched meeting + a raw-JSON details toggle.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

interface FieldyMeeting {
  id: string;
  title: string;
  startTime: string;
  keywords: string[];
  summary: string;
  content: string;
}

interface FieldyPreview {
  client?: { id: string; name: string };
  window?: { from: string; to: string; label: string };
  totals?: { conversationsInWindow: number; mentioningClient: number };
  meetings?: FieldyMeeting[];
  unmatched?: Array<{ id: string; title: string; startTime: string }>;
  error?: string;
}

export default function FieldyPreviewButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FieldyPreview | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Pull Company / Time frame / Custom dates straight out of the parent form
  // so the preview matches whatever the user has selected for generation.
  async function load() {
    setLoading(true);
    setData(null);
    try {
      const form = rootRef.current?.closest("form");
      const fd = form ? new FormData(form) : new FormData();
      const params = new URLSearchParams();
      params.set("client_id", String(fd.get("client_id") ?? ""));
      params.set("range", String(fd.get("range") ?? "28d"));
      const from = String(fd.get("from") ?? "");
      const to = String(fd.get("to") ?? "");
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/fieldy-preview?${params.toString()}`);
      const json = (await res.json()) as FieldyPreview;
      setData(json);
    } catch (err) {
      setData({ error: err instanceof Error ? err.message : "Preview failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className="contents">
      <Button
        type="button"
        variant="secondary"
        className="px-6"
        onClick={() => {
          setOpen(true);
          if (!data) void load();
        }}
      >
        Preview Fieldy pull
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] p-6 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Fieldy preview</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-2.5 py-1 text-xs"
                >
                  Reload
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  ×
                </button>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              These are the conversations Claude will see as <code>FIELDY_TRANSCRIPT</code>. Only meetings that mention the selected company in title / summary / notes are included.
            </p>

            {loading ? (
              <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Pulling from Fieldy…</div>
            ) : data?.error ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{data.error}</div>
            ) : data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Stat label="Client" value={data.client?.name ?? "—"} />
                  <Stat label="Window" value={data.window ? `${data.window.from} → ${data.window.to}` : "—"} />
                  <Stat label="Conversations in window" value={String(data.totals?.conversationsInWindow ?? 0)} />
                  <Stat label="Mentioning client" value={String(data.totals?.mentioningClient ?? 0)} accent />
                </div>

                {(data.meetings ?? []).length === 0 ? (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
                    No Fieldy meetings mentioning {data.client?.name} in this window. Claude will receive an empty transcript and derive <code>whatsNext</code> conservatively from the numbers.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                    {data.meetings!.map((m) => (
                      <div key={m.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{m.title}</div>
                            {m.startTime ? (
                              <div className="text-[11px] font-mono text-[var(--color-text-muted)]">
                                {m.startTime.slice(0, 16).replace("T", " ")}
                              </div>
                            ) : null}
                          </div>
                          {m.keywords.length ? (
                            <div className="hidden sm:flex flex-wrap gap-1 justify-end max-w-[40%]">
                              {m.keywords.slice(0, 5).map((k) => (
                                <span key={k} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                                  {k}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {m.summary ? (
                          <div className="mt-2">
                            <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1">Key points</div>
                            <div className="text-xs whitespace-pre-wrap text-[var(--color-text)]/90">{m.summary}</div>
                          </div>
                        ) : null}

                        {m.content ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">Structured notes</summary>
                            <div className="mt-1 text-xs whitespace-pre-wrap text-[var(--color-text-muted)]">{m.content}</div>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {(data.unmatched ?? []).length > 0 ? (
                  <details className="text-xs text-[var(--color-text-muted)]">
                    <summary className="cursor-pointer">
                      Other Fieldy conversations in window ({data.unmatched!.length}) — not included because they don&apos;t mention the client
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4 list-disc">
                      {data.unmatched!.map((u) => (
                        <li key={u.id}>{u.startTime ? `${u.startTime.slice(0, 10)} · ` : ""}{u.title}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <details>
                  <summary
                    className="cursor-pointer text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]"
                    onClick={() => setShowRaw((v) => !v)}
                  >
                    Raw JSON {showRaw ? "▾" : "▸"}
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-[11px] font-mono">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: accent ? "var(--color-accent)" : "var(--color-border)",
        background: accent ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "var(--color-bg-elev)",
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
