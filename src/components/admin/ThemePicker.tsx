"use client";

// The theme gallery in Settings → Preferences.
//
// Applies on click rather than behind a Save button — the whole point is to
// look at them side by side, and a preference that needs confirming makes
// comparing six of them tedious. The choice persists to localStorage, which is
// per-browser: it is a personal preference, not a company setting.

import { useState, useSyncExternalStore, useTransition } from "react";
import { BookmarkCheck, Check, Star } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { applyTheme, resolveTheme, THEMES } from "@/lib/themes";
import { setDefaultThemeAction } from "@/app/admin/style-actions";

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

export default function ThemePicker({ defaultTheme }: { defaultTheme: string }) {
  const active = useSyncExternalStore(subscribe, read, () => "charcoal");
  const mounted = useHydrated();
  const [savedDefault, setSavedDefault] = useState(defaultTheme);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function makeDefault() {
    setNote(null);
    startTransition(async () => {
      const res = await setDefaultThemeAction(active);
      if (res.error) {
        setNote(res.error);
        return;
      }
      setSavedDefault(active);
      setNote("Saved. New browsers and the login page start here.");
    });
  }

  // Grouped by family: nine tiles in one undifferentiated grid is a wall, and
  // the light/dark split is the first choice anyone actually makes.
  return (
    <div className="space-y-5">
      {(["light", "dark"] as const).map((mode) => (
        <div key={mode}>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            {mode === "light" ? "Light" : "Dark"}
          </div>
          <ThemeGrid
            themes={THEMES.filter((t) => t.mode === mode)}
            active={active}
            mounted={mounted}
            savedDefault={savedDefault}
          />
        </div>
      ))}

      {/* Locks the current pick in as the starting point for anyone who hasn't
          chosen one. Pressing it again after switching moves the default. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
        <button
          type="button"
          onClick={makeDefault}
          disabled={pending || (mounted && active === savedDefault)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-accent-soft)] disabled:opacity-40"
        >
          <BookmarkCheck size={14} />
          {mounted && active === savedDefault ? "This is the default" : "Set as default"}
        </button>
        <span className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {note ??
            "Your own choice is saved to this browser. The default is where everyone else starts."}
        </span>
      </div>
    </div>
  );
}

function ThemeGrid({
  themes,
  active,
  mounted,
  savedDefault,
}: {
  themes: typeof THEMES;
  active: string;
  mounted: boolean;
  savedDefault: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {themes.map((t) => {
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
              {t.id === savedDefault ? (
                <span
                  title="The install-wide default"
                  className="ml-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-[var(--color-text-subtle)]"
                >
                  <Star size={10} aria-hidden /> Default
                </span>
              ) : null}
              {selected ? (
                <Check
                  size={14}
                  className={(t.id === savedDefault ? "" : "ml-auto ") + "text-[var(--color-accent)]"}
                  aria-hidden
                />
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
