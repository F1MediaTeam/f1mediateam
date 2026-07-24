"use client";

// The ⓘ on a metric tile. Click it for a plain-English explanation of what
// the number is and why it matters.
//
// Click rather than hover, so it works the same on a phone. The popover is
// position:fixed and measured off the button, so a tile with overflow hidden
// can't clip it.
//
// Every handler stops propagation and prevents default: these tiles are often
// <label> elements wrapping a checkbox, and without that, opening the tooltip
// would also toggle the series off the chart.

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { explainMetric } from "@/lib/metric-glossary";

export default function InfoTip({
  metric,
  label,
  className = "",
}: {
  /** key into METRIC_GLOSSARY */
  metric: string;
  /** metric name shown as the popover heading */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const info = explainMetric(metric);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Any outside click, scroll, or resize dismisses it — the popover is
    // pinned to a measured position and shouldn't drift away from its tile.
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing written for this metric yet — render nothing rather than an icon
  // that opens an empty box.
  if (!info) return null;

  const WIDTH = 280;

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // Keep the panel on screen when the tile sits near the right edge.
      const left = Math.min(Math.max(8, rect.left - WIDTH / 2 + rect.width / 2), window.innerWidth - WIDTH - 8);
      setPos({ top: rect.bottom + 8, left });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        className={
          "inline-flex shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] " +
          className
        }
      >
        <Info size={14} />
      </button>

      {open && pos ? (
        <div
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className="fixed z-[120] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 text-left shadow-2xl"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{label}</span>
            {info.lowerIsBetter ? (
              <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                Lower is better
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-[var(--color-text)]">{info.what}</p>
          <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {info.why}
          </p>
        </div>
      ) : null}
    </>
  );
}
