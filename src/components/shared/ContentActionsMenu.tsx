"use client";

// Three-dot menu in the top-right of every content card.
// The caller passes a list of menu items (label + onClick handler). Renders
// a small popover anchored to the trigger; closes on outside click / Escape.

import { useEffect, useRef, useState } from "react";

export interface ActionItem {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
}

interface Props {
  items: ActionItem[];
  ariaLabel?: string;
}

export default function ContentActionsMenu({ items, ariaLabel = "Card actions" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="h-7 w-7 grid place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-hover)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 min-w-[160px] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] shadow-xl py-1"
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              className={
                "block w-full text-left px-3 py-2 text-sm transition " +
                (item.tone === "danger"
                  ? "text-red-300 hover:bg-red-500/10"
                  : "text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
