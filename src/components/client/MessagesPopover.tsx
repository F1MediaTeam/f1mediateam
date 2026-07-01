"use client";

// Chat-bubble icon + slide-down thread panel in the client-portal header.
// The popover shows the full two-way thread with the F1 Media admin,
// oldest → newest, and a compose textarea at the bottom. Opening the panel
// marks incoming admin messages as read.

import { useEffect, useRef, useState, useTransition } from "react";
import {
  sendClientMessageAction,
  markClientMessagesReadAction,
} from "@/app/client/actions";
import ImageLightbox from "@/components/shared/ImageLightbox";

interface Attachment {
  path: string;
  name: string;
  mime_type: string;
  size: number;
  url: string | null;
}

interface MessageRow {
  id: string;
  from_role: "client" | "admin";
  body: string;
  created_at: string;
  attachments?: Attachment[];
}

interface Props {
  clientId: string;
  userId: string;
  initialUnread: number;
  initialMessages: MessageRow[];
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function MessagesPopover({ clientId, userId, initialUnread, initialMessages }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [unread, setUnread] = useState(initialUnread);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Mark admin messages as read whenever the panel opens with unread items.
  useEffect(() => {
    if (open && unread > 0) {
      const fd = new FormData();
      fd.set("client_id", clientId);
      startTransition(async () => {
        try {
          await markClientMessagesReadAction(fd);
          setUnread(0);
        } catch {
          // best effort
        }
      });
    }
    // Scroll thread to bottom on open + on new messages.
    if (open) {
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    }
  }, [open, unread, clientId]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = body.trim();
    if ((!trimmed && files.length === 0) || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("body", trimmed);
    for (const f of files) fd.append("attachments", f);
    startTransition(async () => {
      const result = await sendClientMessageAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Optimistic append. Attachments show as local blob previews until the
      // server-signed URL comes back on the next refresh.
      const localRow: MessageRow = {
        id: result.id ?? crypto.randomUUID(),
        from_role: "client",
        body: trimmed,
        created_at: result.created_at ?? new Date().toISOString(),
        attachments: files.map((f) => ({
          path: "",
          name: f.name,
          mime_type: f.type || "application/octet-stream",
          size: f.size,
          url: URL.createObjectURL(f),
        })),
      };
      setMessages((prev) => [...prev, localRow]);
      setBody("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    });
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    setFiles((prev) => [...prev, ...incoming].slice(0, 10));
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }
  // touch userId so it doesn't lint as unused (kept in the signature for
  // future features that reference the sender directly).
  void userId;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={unread > 0 ? `${unread} new messages from F1 Media` : "Messages"}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--color-bg-hover)] transition"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--color-text)]"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums shadow-sm ring-2 ring-[var(--color-bg-elev)]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Messages with F1 Media"
          className="absolute right-0 top-full mt-2 z-40 w-[540px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header — F1 Media Team logo + title + presence dot */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]">
            <F1Avatar size={38} />
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <span className="text-sm font-semibold truncate">F1 Media Team</span>
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                aria-label="Online"
                title="Online"
              />
            </div>
          </div>

          {/* Thread */}
          <div
            ref={listRef}
            className="flex-1 min-h-[440px] max-h-[65vh] overflow-y-auto px-5 py-5 space-y-3 bg-[var(--color-bg)]"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <F1Avatar size={44} />
                <div className="mt-3 text-sm font-medium">Say hello to F1 Media Team</div>
                <div className="mt-1 text-xs text-[var(--color-text-muted)] max-w-[240px]">
                  Ask a question, share a link, or send an update — replies land here.
                </div>
              </div>
            ) : (
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const grouped = prev && prev.from_role === m.from_role &&
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
                return (
                  <MessageRow
                    key={m.id}
                    from={m.from_role}
                    body={m.body}
                    attachments={m.attachments ?? []}
                    time={fmt(m.created_at)}
                    grouped={grouped}
                    onPreview={(src, alt) => setPreview({ src, alt })}
                  />
                );
              })
            )}
          </div>

          {/* Compose */}
          <form
            onSubmit={submit}
            className="border-t border-[var(--color-border)] p-3 bg-[var(--color-bg-elev)]"
          >
            {/* Attached-file chips shown above the pill. */}
            {files.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <AttachmentChip key={i} file={f} onRemove={() => removeFile(i)} />
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] pl-1.5 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-[var(--color-accent)]/40 focus-within:border-[var(--color-accent)]/50 transition">
              {/* Attach button — opens native file picker */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
                title="Attach photos or files"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition"
                disabled={pending}
              >
                <PlusIcon />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement).requestSubmit();
                  }
                }}
                rows={1}
                placeholder="Type a message…"
                className="flex-1 bg-transparent text-sm resize-none max-h-32 focus:outline-none placeholder:text-[var(--color-text-muted)] py-1.5 leading-[1.4] self-center"
                disabled={pending}
              />

              <button
                type="submit"
                disabled={pending || (body.trim().length === 0 && files.length === 0)}
                aria-label={pending ? "Sending" : "Send message"}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {pending ? (
                  <span className="inline-block w-3 h-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
                ) : (
                  <SendIcon />
                )}
              </button>
            </div>
            {error ? (
              <div className="mt-2 text-[11px] text-red-400">{error}</div>
            ) : (
              <div className="mt-2 text-[10px] text-[var(--color-text-subtle)] text-right">
                Cmd/Ctrl+Enter to send
              </div>
            )}
          </form>
        </div>
      ) : null}

      {preview ? (
        <ImageLightbox src={preview.src} alt={preview.alt} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}

// ---------- Bubble + avatar primitives ----------

function MessageRow({
  from,
  body,
  attachments,
  time,
  grouped,
  onPreview,
}: {
  from: "client" | "admin";
  body: string;
  attachments: Attachment[];
  time: string;
  grouped: boolean;
  onPreview: (src: string, alt: string) => void;
}) {
  // grouped is kept in the signature for future spacing tweaks between
  // rapid-fire messages from the same side.
  void grouped;
  const isClient = from === "client";
  const images = attachments.filter((a) => a.mime_type.startsWith("image/") && a.url);
  const nonImages = attachments.filter((a) => !a.mime_type.startsWith("image/") && a.url);
  const hasBody = body.trim().length > 0;
  return (
    <div className={"flex " + (isClient ? "justify-end" : "justify-start")}>
      <div className={"flex flex-col " + (isClient ? "items-end" : "items-start") + " max-w-[78%] gap-1.5"}>
        {images.length > 0 ? (
          <div className={"flex gap-1.5 flex-wrap " + (isClient ? "justify-end" : "justify-start")}>
            {images.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => a.url && onPreview(a.url, a.name)}
                className="block rounded-xl overflow-hidden border border-[var(--color-border)] hover:opacity-90 transition cursor-zoom-in checker-bg"
                style={{ width: 240, height: 180 }}
                aria-label={`Preview ${a.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url ?? undefined}
                  alt={a.name}
                  className="w-full h-full object-contain"
                />
              </button>
            ))}
          </div>
        ) : null}
        {nonImages.length > 0 ? (
          <div className={"flex flex-col gap-1 " + (isClient ? "items-end" : "items-start")}>
            {nonImages.map((a, i) => (
              <a
                key={i}
                href={a.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className={
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs border transition " +
                  (isClient
                    ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-text)] hover:bg-[var(--color-accent)]/20"
                    : "bg-[var(--color-bg-elev)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]")
                }
              >
                <FileIcon />
                <div className="min-w-0 max-w-[180px]">
                  <div className="truncate">{a.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-mono">{formatBytes(a.size)}</div>
                </div>
              </a>
            ))}
          </div>
        ) : null}
        {hasBody ? (
          <div
            className={
              "px-3.5 py-2 text-sm leading-snug shadow-sm " +
              (isClient
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded-2xl rounded-br-md"
                : "bg-[var(--color-bg-elev)] text-[var(--color-text)] border border-[var(--color-border)] rounded-2xl rounded-bl-md")
            }
          >
            <div className="whitespace-pre-wrap break-words">{body}</div>
          </div>
        ) : null}
        <div className="mt-0.5 px-1 text-[10px] text-[var(--color-text-subtle)] font-mono">
          {time}
        </div>
      </div>
    </div>
  );
}

function F1Avatar({ size = 40 }: { size?: number }) {
  // Circular profile-picture treatment: white circle with the dark-art F1
  // Media Team lockup (/logo-light.png) center-cropped inside. Always use the
  // dark variant since the circle background is white — the theme-driven
  // /logo.png would be a light mark that vanishes on white.
  return (
    <span
      className="shrink-0 relative inline-flex items-center justify-center rounded-full overflow-hidden ring-1 ring-black/10 shadow-sm bg-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-light.png"
        alt=""
        className="absolute inset-0 w-full h-full object-contain p-1.5"
      />
    </span>
  );
}

function SendIcon() {
  // Upward arrow — classic iMessage-style send affordance.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] pl-1.5 pr-2 py-1 text-xs">
      {isImage && preview ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={preview} alt={file.name} className="w-8 h-8 rounded-md object-cover" />
      ) : (
        <span className="w-8 h-8 rounded-md bg-[var(--color-bg-elev)] flex items-center justify-center text-[var(--color-text-muted)]">
          <FileIcon />
        </span>
      )}
      <div className="min-w-0 max-w-[140px]">
        <div className="truncate">{file.name}</div>
        <div className="text-[10px] text-[var(--color-text-muted)] font-mono">{formatBytes(file.size)}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="ml-1 text-[var(--color-text-muted)] hover:text-red-500 text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}
