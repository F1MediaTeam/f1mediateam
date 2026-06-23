"use client";

// Bell icon + dropdown panel for the client header. Renders the bell with a
// red count badge, opens a small panel below the bell on click listing the
// pending notifications (content cards awaiting the client's approval).
// Closes on outside click, Escape, or selecting an item.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface NotificationItem {
  id: string;
  title: string;
  updated_at: string;
  body: string | null;
}

interface Props {
  items: NotificationItem[];
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function NotificationDropdown({ items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const count = items.length;

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={count > 0 ? `${count} pending approvals` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--color-bg-hover)] transition"
      >
        <span className="text-xl leading-none" aria-hidden>🔔</span>
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums shadow-sm ring-2 ring-[var(--color-bg-elev)]">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-card)] shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <span className="text-sm font-semibold">Notifications</span>
            <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
              {count} pending
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                Nothing new — you&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]/60">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/client/content`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 hover:bg-[var(--color-bg-hover)] transition"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-snug break-words">
                            {n.title}
                          </div>
                          {n.body ? (
                            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)] line-clamp-2">
                              {n.body}
                            </div>
                          ) : null}
                          <div className="mt-1 text-[10px] text-[var(--color-text-subtle)] font-mono">
                            Awaiting approval · {fmt(n.updated_at)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items.length > 0 ? (
            <Link
              href="/client/content"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-[var(--color-accent)] hover:underline px-4 py-3 border-t border-[var(--color-border)]"
            >
              See all in Content board →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
