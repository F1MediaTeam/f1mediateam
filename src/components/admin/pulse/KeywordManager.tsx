"use client";

// Add, pause and remove tracked keywords.
//
// Pause rather than delete is the default action: removing a keyword throws
// away its rank history, and someone pausing a seasonal phrase almost never
// means "lose the last six months of positions".

import { useState, useTransition } from "react";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { addKeywordAction, removeKeywordAction, toggleKeywordAction } from "@/app/admin/pulse/actions";

export default function KeywordManager({
  siteId,
  count,
}: {
  siteId: string;
  count: number;
}) {
  const [phrase, setPhrase] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const value = phrase.trim();
    if (!value) return;
    setNote(null);
    startTransition(async () => {
      const res = await addKeywordAction({ siteId, phrase: value });
      if (res.error) setNote(res.error);
      else setPhrase("");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !pending) add();
        }}
        placeholder="Add a keyword to track"
        className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 text-xs outline-none focus:border-[var(--color-border-strong)]"
      />
      <button
        type="button"
        onClick={add}
        disabled={pending || !phrase.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[11px] font-semibold text-[var(--color-on-accent)] disabled:opacity-50"
      >
        <Plus size={13} /> Add
      </button>
      <span className="text-[10px] text-[var(--color-text-subtle)]">
        {note ?? `${count} tracked`}
      </span>
    </div>
  );
}

export function KeywordRowActions({
  keywordId,
  isActive,
}: {
  keywordId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        title={isActive ? "Pause tracking — keeps the history" : "Resume tracking"}
        disabled={pending}
        onClick={() => startTransition(async () => { await toggleKeywordAction(keywordId, !isActive); })}
        className="rounded p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)] disabled:opacity-50"
      >
        {isActive ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button
        type="button"
        title={confirming ? "Click again to delete the keyword and its history" : "Remove"}
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 4000);
            return;
          }
          startTransition(async () => { await removeKeywordAction(keywordId); });
        }}
        className={
          "rounded p-1 disabled:opacity-50 " +
          (confirming ? "text-[var(--color-bad)]" : "text-[var(--color-text-subtle)] hover:text-[var(--color-bad)]")
        }
      >
        <Trash2 size={12} />
      </button>
    </span>
  );
}
