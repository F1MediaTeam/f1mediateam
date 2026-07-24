"use client";

// In-app Claude chat for the admin console. Streams the reply token-by-token
// from /api/admin/chat. Keeps the whole conversation in state and re-sends it
// each turn (the API is stateless), so follow-ups have context.

import { useEffect, useRef, useState } from "react";
import { Send, Trash2, User, Sparkles } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function ClaudeChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setStreaming(true);
    // Placeholder assistant message we fill in as tokens arrive.
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      // Drop the empty assistant bubble if nothing streamed.
      setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-[min(70vh,640px)] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[var(--color-text-muted)]">
            <Sparkles size={24} className="mb-2 text-[var(--color-accent)]" />
            <div className="font-medium text-[var(--color-text)]">Ask Claude anything</div>
            <p className="mt-1 max-w-sm text-xs">
              Draft client emails, brainstorm content ideas, rewrite copy, explain a metric. It doesn&apos;t
              see your app data — paste in anything you want it to work with.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={"flex gap-2.5 " + (m.role === "user" ? "flex-row-reverse" : "")}>
              <div
                className={
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
                  (m.role === "user"
                    ? "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
                    : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]")
                }
              >
                {m.role === "user" ? <User size={15} /> : <Sparkles size={15} />}
              </div>
              <div
                className={
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed " +
                  (m.role === "user"
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "bg-[var(--color-bg-card)] text-[var(--color-text)] border border-[var(--color-border)]")
                }
              >
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))
        )}
      </div>

      {error ? (
        <div className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-red-400">{error}</div>
      ) : null}

      {/* Composer */}
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message Claude…  (Enter to send, Shift+Enter for a new line)"
            className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          />
          <button
            type="button"
            onClick={send}
            disabled={streaming || !input.trim()}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] disabled:opacity-40"
            title="Send"
          >
            <Send size={16} />
          </button>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              disabled={streaming}
              title="Clear conversation"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
