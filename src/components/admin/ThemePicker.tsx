"use client";

// The theme gallery in Settings → Preferences.
//
// Applies on click rather than behind a Save button — the whole point is to
// look at them side by side, and a preference that needs confirming makes
// comparing six of them tedious. The choice persists to localStorage, which is
// per-browser: it is a personal preference, not a company setting.

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { applyTheme, resolveTheme, THEMES } from "@/lib/themes";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function read(): string {
  return resolveTheme(document.documentElement.getAttribute("data-theme")).id;
}

export default function ThemePicker() {
  const active = useSyncExternalStore(subscribe, read, () => "carbon");
  const mounted = useHydrated();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {THEMES.map((t) => {
        const selected = mounted && t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTheme(t.id)}
            aria-pressed={selected}
            className={
              "group rounded-xl border p-3 text-left transition " +
              (selected
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] bg-[var(--color-bg-elev)] hover:border-[var(--color-border-strong)]")
            }
          >
            {/* A miniature of the app: canvas, a card on it, and the accent. */}
            <div
              className="mb-3 flex h-16 items-center gap-2 rounded-lg border border-black/10 px-3"
              style={{ background: t.swatch.bg }}
            >
              <div
                className="h-9 flex-1 rounded-md border border-black/10"
                style={{ background: t.swatch.card }}
              />
              <div className="h-9 w-9 shrink-0 rounded-md" style={{ background: t.swatch.accent }} />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{t.name}</span>
              <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {t.mode}
              </span>
              {selected ? (
                <Check size={14} className="ml-auto text-[var(--color-accent)]" aria-hidden />
              ) : null}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              {t.blurb}
            </p>
          </button>
        );
      })}
    </div>
  );
}
