"use client";

// Light/dark theme switch. The actual theme is applied by flipping
// data-theme on <html> (see globals.css + the no-flash script in layout.tsx);
// this just toggles it and persists the choice to localStorage.

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";

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

function readTheme(): "dark" | "light" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => "dark" as const);
  const mounted = useHydrated();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private mode / storage disabled — theme still applies for this session
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors " +
        className
      }
    >
      {/* Render after mount so the icon matches the resolved theme (no SSR mismatch). */}
      {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
