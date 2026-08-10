"use client";

// Save and restore the whole look, from a place that is always reachable.
//
// The crosshair panel already had these buttons, but the panel only exists
// while an element is selected — so "put it back the way I liked it" needed a
// pick first, which is the wrong order when the thing you want to undo is the
// pick you just made. Settings is always there.
//
// It also saves theme and style overrides together. They used to be separate,
// so restoring could bring back the overrides while leaving a different theme
// underneath them, which is not the look anyone saved.

import { useState, useTransition } from "react";
import { BookmarkCheck, RotateCcw, Undo2 } from "lucide-react";
import { applyTheme, currentTheme } from "@/lib/themes";
import {
  restoreLookDefaultAction,
  restoreOriginalStylesAction,
  saveLookDefaultAction,
} from "@/app/admin/style-actions";

export default function DefaultLookCard({ savedAt }: { savedAt: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(savedAt);
  const [pending, startTransition] = useTransition();

  function save() {
    setNote(null);
    startTransition(async () => {
      const res = await saveLookDefaultAction(currentTheme().id);
      if (res.error) return setNote(res.error);
      setSaved(new Date().toISOString());
      setNote("Saved. This is what Restore will bring back.");
    });
  }

  function restore() {
    setNote(null);
    startTransition(async () => {
      const res = await restoreLookDefaultAction();
      if (res.error) return setNote(res.error);
      if (res.themeId) applyTheme(res.themeId);
      setNote("Back to your saved default.");
    });
  }

  function restoreOriginal() {
    setNote(null);
    startTransition(async () => {
      const res = await restoreOriginalStylesAction();
      setNote(res.error ?? "Original design restored. Your default is still saved.");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        Captures the theme and every style change together. Experiment freely — Restore puts
        the whole look back exactly as it was when you last saved it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-accent)] disabled:opacity-40"
        >
          <BookmarkCheck size={14} /> Set as default
        </button>
        <button
          type="button"
          onClick={restore}
          disabled={pending || !saved}
          title={saved ? undefined : "Nothing saved yet"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)] disabled:opacity-40"
        >
          <Undo2 size={14} /> Restore my default
        </button>
        <button
          type="button"
          onClick={restoreOriginal}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
        >
          <RotateCcw size={13} /> Restore original design
        </button>
      </div>

      <p className="text-[11px] text-[var(--color-text-subtle)]">
        {pending
          ? "Working…"
          : (note ??
            (saved
              ? `Default saved ${new Date(saved).toLocaleString()}.`
              : "No default saved yet — set one and you can always come back to it."))}
      </p>
    </div>
  );
}
