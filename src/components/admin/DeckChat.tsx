"use client";

// Claude chat panel for the Reports deck preview. The admin types a
// natural-language instruction ("make the summary punchier", "remove the
// second win"); we POST the current MonthlyContent + instruction to
// /api/monthly-report/revise and apply the revised content via onChange,
// which re-renders the slide previews live.
//
// Lives inside the GenerateReportForm <form>, so: no `name` attributes
// (keeps chat text out of the report FormData) and the send button is
// type="button" so it never submits the parent form.

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

interface Msg {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
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

export default function DeckChat({ content, onChange, className }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function send(instruction: string) {
    const trimmed = instruction.trim();
    if (!trimmed || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setBusy(true);
    try {
      const res = await fetch("/api/monthly-report/revise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, instruction: trimmed }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const json = (await res.json()) as { note: string; content: MonthlyContent };
      onChange(json.content);
      setMessages((m) => [...m, { role: "assistant", text: json.note }]);
    } catch (err) {
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
              Ask for changes in plain English — Claude edits the deck content and the slides
              update instantly. Numbers are never invented, only reworded or removed.
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
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="e.g. Reword the intro to mention the July promo…"
            className="flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="h-9 rounded-lg bg-[var(--color-accent)] px-4 text-xs font-medium text-[var(--color-on-accent)] hover:brightness-110 disabled:opacity-50 transition"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
