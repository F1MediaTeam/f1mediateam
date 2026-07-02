"use client";

// Deck editor for /admin/meetings/[id]. Wraps the read-only SlideDeck preview
// with editing: reorder/remove slides, edit per-kind text fields, insert
// uploaded image slides, live-preview every change, then Save (persists the
// customized deck on the meeting row), Reset (back to the live auto-generated
// deck), or Download PDF.
//
// The deck state here is the same serializable Slide[] the generator emits —
// saving stores it verbatim in meetings.deck.

import { useRef, useState, useTransition } from "react";
import type { Slide } from "@/lib/slides";
import SlideDeck from "@/components/admin/SlideDeck";
import { Button, Pill } from "@/components/ui";
import { saveDeckAction, resetDeckAction, uploadSlideImageAction } from "@/app/admin/meetings/actions";

const KIND_LABEL: Record<Slide["kind"], string> = {
  cover: "Cover",
  kpi: "KPIs",
  trend: "Trend",
  content: "Content",
  events: "Events",
  tasks: "Tasks",
  image: "Image",
  closing: "Recap",
};

const field =
  "mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm";
const fieldLabel = "block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]";

export default function DeckEditor({
  meetingId,
  initialSlides,
  customized,
}: {
  meetingId: string;
  initialSlides: Slide[];
  customized: boolean;
}) {
  const [deck, setDeck] = useState<Slide[]>(initialSlides);
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Remount SlideDeck when the selection or content changes so the preview
  // always shows the slide being edited.
  const [rev, setRev] = useState(0);

  const slide = deck[Math.min(sel, deck.length - 1)];

  function apply(next: Slide[], nextSel = sel) {
    setDeck(next);
    setSel(Math.max(0, Math.min(nextSel, next.length - 1)));
    setDirty(true);
    setStatus(null);
    setRev((r) => r + 1);
  }

  function patchSlide(patch: Partial<Slide>) {
    apply(deck.map((s, i) => (i === sel ? ({ ...s, ...patch } as Slide) : s)));
  }

  function move(dir: -1 | 1) {
    const to = sel + dir;
    if (to < 0 || to >= deck.length) return;
    const next = deck.slice();
    [next[sel], next[to]] = [next[to], next[sel]];
    apply(next, to);
  }

  function removeSlide() {
    if (deck.length <= 1) return;
    apply(deck.filter((_, i) => i !== sel));
  }

  async function onPickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setStatus("Uploading image…");
    const fd = new FormData();
    fd.set("meeting_id", meetingId);
    fd.set("file", file);
    const res = await uploadSlideImageAction(fd);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.url) {
      setStatus(res.error ?? "Upload failed.");
      return;
    }
    const img: Slide = {
      kind: "image",
      title: file.name.replace(/\.[a-z0-9]+$/i, ""),
      subtitle: "Uploaded",
      url: res.url,
      caption: null,
    };
    const next = deck.slice();
    next.splice(sel + 1, 0, img);
    apply(next, sel + 1);
    setStatus(null);
  }

  function save() {
    startTransition(async () => {
      const res = await saveDeckAction(meetingId, deck as unknown[]);
      if (res.ok) {
        setDirty(false);
        setStatus("Saved — this customized deck now drives Present and Download.");
      } else {
        setStatus(res.error ?? "Save failed.");
      }
    });
  }

  function reset() {
    if (!window.confirm("Discard the customized deck and go back to the live auto-generated one?")) return;
    startTransition(async () => {
      await resetDeckAction(meetingId);
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save deck"}
        </Button>
        <a
          href={`/api/meetings/${meetingId}/deck-pdf`}
          className="inline-flex items-center h-8 px-3 text-xs rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] font-medium"
        >
          Download PDF ↓
        </a>
        {customized || dirty ? (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex items-center h-8 px-3 text-xs rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10"
          >
            Reset to live data
          </button>
        ) : null}
        {dirty ? <Pill tone="warn">Unsaved changes</Pill> : customized ? <Pill tone="ok">Customized</Pill> : <Pill>Live data</Pill>}
      </div>
      {status ? <div className="text-xs text-[var(--color-text-muted)]">{status}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* slide list */}
        <div className="space-y-1.5">
          {deck.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSel(i);
                setRev((r) => r + 1);
              }}
              className={
                "w-full text-left rounded-lg border px-3 py-2 text-xs transition " +
                (i === sel
                  ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)]")
              }
            >
              <span className="font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
                {i + 1} · {KIND_LABEL[s.kind]}
              </span>
              <div className="truncate mt-0.5">{s.title}</div>
            </button>
          ))}
          <div className="flex items-center gap-1.5 pt-2">
            <button type="button" onClick={() => move(-1)} title="Move slide up" className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]">↑</button>
            <button type="button" onClick={() => move(1)} title="Move slide down" className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]">↓</button>
            <button type="button" onClick={removeSlide} title="Remove slide" className="rounded-md border border-red-500/40 text-red-300 px-2.5 py-1.5 text-xs hover:bg-red-500/10">×</button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ml-auto rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]"
            >
              + Image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files)}
            />
          </div>
        </div>

        {/* preview + per-slide edit form */}
        <div className="min-w-0 space-y-4">
          <SlideDeck key={`${rev}:${sel}`} slides={deck} mode="preview" initialIndex={sel} />

          {slide ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={fieldLabel}>
                Title
                <input className={field} value={slide.title} onChange={(e) => patchSlide({ title: e.target.value })} />
              </label>
              <label className={fieldLabel}>
                Eyebrow / subtitle
                <input className={field} value={slide.subtitle} onChange={(e) => patchSlide({ subtitle: e.target.value })} />
              </label>

              {slide.kind === "closing" ? (
                <label className={`${fieldLabel} sm:col-span-2`}>
                  Bullets (one per line)
                  <textarea
                    className={field}
                    rows={4}
                    value={slide.bullets.join("\n")}
                    onChange={(e) => patchSlide({ bullets: e.target.value.split("\n") } as Partial<Slide>)}
                  />
                </label>
              ) : null}

              {slide.kind === "image" ? (
                <label className={`${fieldLabel} sm:col-span-2`}>
                  Caption
                  <input
                    className={field}
                    value={slide.caption ?? ""}
                    onChange={(e) => patchSlide({ caption: e.target.value || null } as Partial<Slide>)}
                  />
                </label>
              ) : null}

              {slide.kind === "kpi" ? (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {slide.items.map((k, ki) => (
                    <div key={ki} className="rounded-lg border border-[var(--color-border)] p-2 grid grid-cols-3 gap-2">
                      <input
                        className={field + " mt-0"}
                        value={k.label}
                        aria-label="KPI label"
                        onChange={(e) => {
                          const items = slide.items.map((it, j) => (j === ki ? { ...it, label: e.target.value } : it));
                          patchSlide({ items } as Partial<Slide>);
                        }}
                      />
                      <input
                        className={field + " mt-0"}
                        value={k.value}
                        aria-label="KPI value"
                        onChange={(e) => {
                          const items = slide.items.map((it, j) => (j === ki ? { ...it, value: e.target.value } : it));
                          patchSlide({ items } as Partial<Slide>);
                        }}
                      />
                      <input
                        className={field + " mt-0"}
                        value={k.delta ?? ""}
                        placeholder="delta"
                        aria-label="KPI delta"
                        onChange={(e) => {
                          const items = slide.items.map((it, j) => (j === ki ? { ...it, delta: e.target.value || null } : it));
                          patchSlide({ items } as Partial<Slide>);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {slide.kind === "trend" || slide.kind === "content" || slide.kind === "events" || slide.kind === "tasks" ? (
                <div className="sm:col-span-2 text-[11px] text-[var(--color-text-muted)]">
                  Chart and list contents on this slide come from live client data — edit the
                  heading above, reorder it, or remove it.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
