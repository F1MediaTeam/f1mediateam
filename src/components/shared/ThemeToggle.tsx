"use client";

// Light/dark theme switch. The actual theme is applied by flipping data-theme
// and data-mode on <html> (see globals.css + the no-flash script in
// layout.tsx); this just swaps to the counterpart theme and persists it.
//
// With six named themes this no longer toggles between two values — it moves
// to the opposite-mode partner of whatever is on, so Redline Dark goes to
// Redline rather than dumping the user back on the teal default. The full set
// lives in Settings → Preferences.

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { applyTheme, resolveTheme, THEME_COUNTERPART } from "@/lib/themes";

// The <html data-theme> attribute is the source of truth (set by the
// no-flash script in layout.tsx). Subscribe to it directly so this button
// re-renders on any theme change without duplicating the value in state.
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function readTheme(): string {
  return resolveTheme(document.documentElement.getAttribute("data-theme")).id;
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const themeId = useSyncExternalStore(subscribeToTheme, readTheme, () => "carbon");
  const mounted = useHydrated();
  const isDark = resolveTheme(themeId).mode === "dark";

  function toggle() {
    applyTheme(THEME_COUNTERPART[themeId] ?? "fog");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors " +
        className
      }
    >
      {/* Render after mount so the icon matches the resolved theme (no SSR mismatch). */}
      {mounted && isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
