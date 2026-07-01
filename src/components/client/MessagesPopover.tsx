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

interface MessageRow {
  id: string;
  from_role: "client" | "admin";
  body: string;
  created_at: string;
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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
    if (!trimmed || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("body", trimmed);
    startTransition(async () => {
      const result = await sendClientMessageAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Optimistic append with server timestamp when we got one back.
      const localRow: MessageRow = {
        id: result.id ?? crypto.randomUUID(),
        from_role: "client",
        body: trimmed,
        created_at: result.created_at ?? new Date().toISOString(),
      };
      setMessages((prev) => [...prev, localRow]);
      setBody("");
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    });
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
          {/* Header — F1 avatar + title + presence dot */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]">
            <F1Avatar />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">F1 Media Team</span>
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                  aria-label="Online"
                  title="Online"
                />
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                Your account manager
              </div>
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
                    time={fmt(m.created_at)}
                    grouped={grouped}
                  />
                );
              })
            )}
          </div>

          {/* Compose — pill input with inline send */}
          <form
            onSubmit={submit}
            className="border-t border-[var(--color-border)] p-3 bg-[var(--color-bg-elev)]"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--color-accent)]/40 focus-within:border-[var(--color-accent)]/50 transition">
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
                className="flex-1 bg-transparent text-sm resize-none max-h-32 min-h-[22px] focus:outline-none placeholder:text-[var(--color-text-muted)]"
                disabled={pending}
              />
              <button
                type="submit"
                disabled={pending || body.trim().length === 0}
                aria-label={pending ? "Sending" : "Send message"}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
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
    </div>
  );
}

// ---------- Bubble + avatar primitives ----------

function MessageRow({
  from,
  body,
  time,
  grouped,
}: {
  from: "client" | "admin";
  body: string;
  time: string;
  grouped: boolean;
}) {
  const isClient = from === "client";
  return (
    <div className={"flex items-end gap-2 " + (isClient ? "justify-end" : "justify-start")}>
      {!isClient ? (
        <div className={"shrink-0 " + (grouped ? "invisible" : "")}>
          <F1Avatar size={26} />
        </div>
      ) : null}
      <div className={"flex flex-col " + (isClient ? "items-end" : "items-start") + " max-w-[78%]"}>
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
        <div className="mt-1 px-1 text-[10px] text-[var(--color-text-subtle)] font-mono">
          {time}
        </div>
      </div>
    </div>
  );
}

function F1Avatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-gradient-to-br from-[#E11D48] to-[#0F172A] flex items-center justify-center text-white font-bold shadow-sm ring-1 ring-black/10"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      F1
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  );
}
