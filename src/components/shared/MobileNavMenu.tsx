"use client";

// Mobile-only nav menu. On small screens the desktop sidebar/header nav is
// hidden, so this drop-down drawer is the only way to move between pages.
// Renders a hamburger button that toggles a full-width overlay listing each
// nav link; closes on backdrop click, link click, or Escape.

import Link from "next/link";
import { useEffect, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
}

interface Props {
  items: NavItem[];
  active?: string;
  /** Optional small heading above the link list (e.g. client company name). */
  heading?: string;
  /** Trigger button label for screen readers. */
  ariaLabel?: string;
}

export default function MobileNavMenu({ items, active, heading, ariaLabel = "Open menu" }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Prevent background scroll while the drawer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)]"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 right-0 w-72 max-w-[80vw] bg-[var(--color-bg-elev)] border-l border-[var(--color-border-strong)] shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                {heading ?? "Menu"}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ×
              </button>
            </div>
            <nav className="flex-1 flex flex-col gap-1 px-3 py-4 overflow-y-auto">
              {items.map((item) => {
                const isActive = active === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={
                      "px-4 py-3 rounded-lg text-base font-medium transition " +
                      (isActive
                        ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                        : "text-[var(--color-text)] bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-hover)]")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
