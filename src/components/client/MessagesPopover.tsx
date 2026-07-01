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
          className="absolute right-0 top-full mt-2 z-40 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Message F1 Media</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                Anything you send goes to your account manager.
              </div>
            </div>
          </div>

          <div
            ref={listRef}
            className="flex-1 min-h-[220px] max-h-[400px] overflow-y-auto px-4 py-3 space-y-3 bg-[var(--color-bg)]"
          >
            {messages.length === 0 ? (
              <div className="text-center text-xs text-[var(--color-text-muted)] py-8">
                No messages yet. Say hi 👋
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    "flex " + (m.from_role === "client" ? "justify-end" : "justify-start")
                  }
                >
                  <div
                    className={
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug " +
                      (m.from_role === "client"
                        ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded-br-md"
                        : "bg-[var(--color-bg-elev)] text-[var(--color-text)] rounded-bl-md")
                    }
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div
                      className={
                        "mt-1 text-[10px] font-mono " +
                        (m.from_role === "client"
                          ? "text-[var(--color-on-accent)]/70"
                          : "text-[var(--color-text-muted)]")
                      }
                    >
                      {m.from_role === "client" ? "You" : "F1 Media"} · {fmt(m.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={submit} className="border-t border-[var(--color-border)] p-3 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement).requestSubmit();
                }
              }}
              rows={2}
              placeholder="Type a message… (Cmd/Ctrl+Enter to send)"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 resize-none"
              disabled={pending}
            />
            {error ? (
              <div className="text-[11px] text-red-400">{error}</div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="submit"
                disabled={pending || body.trim().length === 0}
                className="rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] px-4 py-1.5 text-xs font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
