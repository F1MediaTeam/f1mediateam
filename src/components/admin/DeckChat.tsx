"use client";

// Claude chat panel for the Reports deck preview. The admin types a
// natural-language instruction ("make the summary punchier") and/or attaches
// screenshots — paste straight from the clipboard, or pick files — and we
// POST the current MonthlyContent + instruction + images to
// /api/monthly-report/revise. Claude reads the images (a slide screenshot to
// change, numbers to incorporate, a photo of notes) and returns revised
// content, which re-renders the slide previews live via onChange.
//
// Attachment pipeline: files are decoded and downscaled on a canvas (long
// edge capped, JPEG re-encode for anything big) so the request body stays
// well under Vercel's 4.5 MB function-payload cap. Reads happen in
// selection order and Send is gated until they finish, so the images Claude
// sees are exactly the ones on screen.
//
// Lives inside the GenerateReportForm <form>, so: no `name` attributes
// (keeps chat text out of the report FormData) and every button is
// type="button" so nothing here submits the parent form.

import { useRef, useState } from "react";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

interface Msg {
  role: "user" | "assistant";
  text: string;
  imageCount?: number;
  isError?: boolean;
}

interface Attachment {
  media_type: string;
  data: string; // base64, no data: prefix
  previewUrl: string;
}

interface Props {
  content: MonthlyContent;
  onChange: (content: MonthlyContent) => void;
  className?: string;
}

const SUGGESTIONS = [
  "Make the executive summary punchier",
  "Shorten every bullet to one line",
  "Make What's Next more specific",
];

const MAX_IMAGES = 5;
// Total base64 chars across all attachments — the deck JSON rides in the
// same body, so leave generous headroom under the 4.5 MB platform cap.
const MAX_TOTAL_BASE64 = 2_500_000;
// Files up to this size are sent as-is (keeps small PNG screenshots crisp);
// bigger ones are downscaled + JPEG re-encoded.
const PASSTHROUGH_BYTES = 400_000;
const MAX_EDGE_PX = 1600;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not decode image"));
    };
    img.src = url;
  });
}

// Decode → downscale → re-encode. Falls back to the original bytes when the
// file is already small.
async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.size <= PASSTHROUGH_BYTES) {
    const url = await readAsDataUrl(file);
    return { media_type: file.type, data: url.split(",")[1] ?? "", previewUrl: url };
  }
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // White backing so transparent PNGs don't turn black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: url.split(",")[1] ?? "", previewUrl: url };
}

export default function DeckChat({ content, onChange, className }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingReads, setPendingReads] = useState(0);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function chatError(text: string) {
    setMessages((m) => [...m, { role: "assistant", text, isError: true }]);
  }

  async function addFiles(files: FileList | File[]) {
    const picked = Array.from(files).filter((f) => IMAGE_TYPES.includes(f.type) && f.size > 0);
    if (!picked.length) return;
    setPendingReads((p) => p + 1);
    try {
      // Sequential, so attachments land in the order they were chosen.
      for (const file of picked) {
        let att: Attachment;
        try {
          att = await fileToAttachment(file);
        } catch {
          chatError(`Couldn't read "${file.name || "image"}" — try a different file.`);
          continue;
        }
        // Object holder because the assignment happens inside the state
        // updater, which TS's control-flow analysis can't see.
        const outcome = { verdict: "ok" as "ok" | "count" | "size" };
        setAttachments((a) => {
          if (a.length >= MAX_IMAGES) {
            outcome.verdict = "count";
            return a;
          }
          const total = a.reduce((n, x) => n + x.data.length, 0) + att.data.length;
          if (total > MAX_TOTAL_BASE64) {
            outcome.verdict = "size";
            return a;
          }
          return [...a, att];
        });
        if (outcome.verdict === "count") {
          chatError(`Up to ${MAX_IMAGES} images per message — remove one to add another.`);
          break;
        }
        if (outcome.verdict === "size") {
          chatError("That image would make the message too large — remove one or use a smaller screenshot.");
        }
      }
    } finally {
      setPendingReads((p) => p - 1);
    }
  }

  async function send(instruction: string) {
    const trimmed = instruction.trim();
    if ((!trimmed && attachments.length === 0) || busy || pendingReads > 0) return;
    const sentAttachments = attachments;
    const images = sentAttachments.map(({ media_type, data }) => ({ media_type, data }));
    setInput("");
    setAttachments([]);
    setMessages((m) => [
      ...m,
      { role: "user", text: trimmed || "(images attached)", imageCount: images.length || undefined },
    ]);
    setBusy(true);
    try {
      const res = await fetch("/api/monthly-report/revise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, instruction: trimmed, images }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const json = (await res.json()) as { note: string; content: MonthlyContent };
      onChange(json.content);
      setMessages((m) => [...m, { role: "assistant", text: json.note }]);
    } catch (err) {
      // Give the images back so a retry doesn't mean re-attaching everything.
      if (sentAttachments.length) setAttachments((a) => (a.length ? a : sentAttachments));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Something went wrong — try again.",
          isError: true,
        },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <Sparkles size={15} className="text-[var(--color-accent)]" />
        <span className="text-sm font-semibold">Edit with Claude</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px] max-h-[420px]">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              Ask for changes in plain English — the slides update instantly. Paste or attach
              screenshots (a slide to change, numbers to add, even a photo of notes) and Claude
              reads them. Numbers are never invented.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left text-xs rounded-lg border border-[var(--color-border)] px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={cn(
                  "max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-text)]"
                    : m.isError
                      ? "border border-red-500/40 bg-red-500/10 text-red-300"
                      : "border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]",
                )}
              >
                {m.text}
                {m.imageCount ? (
                  <span className="block mt-1 text-[10px] text-[var(--color-text-muted)]">
                    📎 {m.imageCount} image{m.imageCount > 1 ? "s" : ""} attached
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] animate-spin" />
            Editing the deck…
          </div>
        ) : null}
      </div>

      <div className="border-t border-[var(--color-border)] p-3">
        {attachments.length > 0 || pendingReads > 0 ? (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {attachments.map((a, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.previewUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover ring-1 ring-[var(--color-border)]"
                />
                <button
                  type="button"
                  onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-300"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {pendingReads > 0 ? (
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] animate-spin" />
                processing image…
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach images"
            title="Attach screenshots or photos"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] transition"
          >
            <ImagePlus size={15} />
          </button>
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              // Excel/Word copies carry BOTH text and a rendered image — in
              // that case keep the text (default paste) and skip the image.
              const hasText = Boolean(e.clipboardData.getData("text/plain"));
              const files = Array.from(e.clipboardData.files ?? []);
              if (files.length && !hasText) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="e.g. Reword the intro — or paste a screenshot…"
            className="flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={busy || pendingReads > 0 || (!input.trim() && attachments.length === 0)}
            className="h-9 rounded-lg bg-[var(--color-accent)] px-4 text-xs font-medium text-[var(--color-on-accent)] hover:brightness-110 disabled:opacity-50 transition"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
          Enter to send · Shift+Enter for a new line · paste screenshots directly · up to {MAX_IMAGES} images
        </p>
      </div>
    </div>
  );
}
