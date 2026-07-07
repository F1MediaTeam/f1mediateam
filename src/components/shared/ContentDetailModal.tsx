"use client";

// Full-detail popup for a content card. Mounted on top of the page with a
// blurry backdrop. Shows everything we have about the card: title, body,
// link with preview, stage badge, created/updated timestamps, and the full
// event log (every stage move + change-request note).
//
// Triggered by a button (the card itself wraps this component in a button
// that opens the modal). Closes on Escape / backdrop click / × button.

"use client";

import { useEffect, useState } from "react";

interface EventRow {
  id: string;
  created_at: string;
  from_stage: string | null;
  to_stage: string;
  actor_role: string;
  note: string | null;
}

export interface ContentDetailModalProps {
  triggerLabel: React.ReactNode;
  triggerClassName?: string;
  card: {
    id: string;
    title: string;
    body: string | null;
    link: string | null;
    stage: string;
    created_at: string;
    updated_at: string;
  };
  companyName: string;
  events: EventRow[];
}

const STAGE_LABEL: Record<string, { label: string; tone: string }> = {
  proposed: { label: "Awaiting approval", tone: "border-amber-500/40 text-amber-300 bg-amber-500/10" },
  pending:  { label: "Approved — being posted", tone: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" },
  posted:   { label: "Live", tone: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" },
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Pull anything that looks like an image link out of the body so we can show
// thumbnails. Markers we recognise: bare image URLs, markdown ![alt](url),
// [ATTACH:image/...] markers from the calendar-attachments scheme.
function extractImages(body: string | null): string[] {
  if (!body) return [];
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  // Marker contexts (markdown image / ATTACH) declare "this is an image" —
  // no extension needed (scheduler CDN URLs often carry none) and query
  // strings are KEPT (signed URLs 403 without their signature params).
  const marked = /(?:\!\[[^\]]*\]\(|\[ATTACH:)\s*(https?:\/\/[^\s\)\]]+)/gi;
  while ((m = marked.exec(body)) !== null) urls.push(m[1]);
  // Bare URLs still need an image extension so ordinary links don't match.
  const bare = /(?:^|\s)(https?:\/\/[^\s\)\]]+\.(?:png|jpe?g|gif|webp|svg|heic)(?:\?[^\s\)\]]*)?)/gi;
  while ((m = bare.exec(body)) !== null) urls.push(m[1]);
  return Array.from(new Set(urls));
}

export default function ContentDetailModal(props: ContentDetailModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const stageMeta = STAGE_LABEL[props.card.stage] ?? { label: props.card.stage, tone: "border-[var(--color-border)] text-[var(--color-text-muted)]" };
  const images = extractImages(props.card.body);

  return (
    <>
      {/* Trigger — invisible button wrapping whatever the caller passed. We
          render as a <button> not a <div> so it's keyboard-accessible. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={props.triggerClassName ?? "block w-full text-left"}
      >
        {props.triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-6 sm:pt-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-2xl rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] shadow-2xl my-auto"
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
              <div className="min-w-0">
                <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider mb-2 ${stageMeta.tone}`}>
                  {stageMeta.label}
                </div>
                <h2 className="text-xl font-semibold tracking-tight break-words">{props.card.title}</h2>
                <div className="mt-1 text-xs text-[var(--color-text-muted)] font-mono">
                  {props.companyName} · created {fmt(props.card.created_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition shrink-0"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {props.card.body ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                    Body
                  </div>
                  <div className="text-sm leading-relaxed text-[var(--color-text)] whitespace-pre-wrap break-words">
                    {props.card.body}
                  </div>
                </div>
              ) : null}

              {images.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                    Images
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-32 object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {props.card.link ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                    Link
                  </div>
                  <a
                    href={props.card.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline break-all"
                  >
                    {props.card.link} ↗
                  </a>
                </div>
              ) : null}

              {props.events.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                    Activity
                  </div>
                  <ul className="space-y-2">
                    {props.events.map((e) => {
                      const isChangeRequest = (e.note ?? "").startsWith("CHANGES REQUESTED");
                      const noteText = isChangeRequest ? (e.note ?? "").replace(/^CHANGES REQUESTED:\s*/, "") : e.note;
                      return (
                        <li
                          key={e.id}
                          className={
                            "rounded-lg border p-3 " +
                            (isChangeRequest
                              ? "border-amber-500/40 bg-amber-500/5"
                              : "border-[var(--color-border)] bg-[var(--color-bg-elev)]")
                          }
                        >
                          <div className="text-[10px] font-mono text-[var(--color-text-muted)]">
                            {fmt(e.created_at)} · {e.actor_role}{e.from_stage ? ` · ${e.from_stage} → ${e.to_stage}` : ` · ${e.to_stage}`}
                          </div>
                          {noteText ? (
                            <div className={"mt-1 text-sm whitespace-pre-wrap break-words " + (isChangeRequest ? "text-amber-200" : "text-[var(--color-text-muted)]")}>
                              {isChangeRequest ? "⚠ Changes requested: " : ""}{noteText}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="text-[10px] text-[var(--color-text-subtle)] font-mono">
                Last updated {fmt(props.card.updated_at)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
