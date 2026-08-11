// The F1 Pulse masthead — wordmark, product name, and whatever controls the
// page needs on the right.
//
// The wordmark uses the same theme-aware pair the rest of the console uses:
// both variants render and CSS shows the right one, so a theme switch is
// instant rather than waiting on a re-render or a JS hook.

import Image from "next/image";
import type { ReactNode } from "react";

export default function PulseHeader({
  subtitle,
  right,
  crumb,
}: {
  subtitle?: string;
  right?: ReactNode;
  crumb?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-3">
          {/* Both marks are rendered; globals.css hides the wrong one per theme. */}
          <span className="relative block h-7 w-[112px] shrink-0">
            <Image src="/logo.png" alt="F1 Media Team" fill sizes="112px" className="logo-dark object-contain object-left" priority />
            <Image src="/logo-light.png" alt="F1 Media Team" fill sizes="112px" className="logo-light object-contain object-left" priority />
          </span>
          <span className="h-5 w-px bg-[var(--color-border-strong)]" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">F1 Pulse</h1>
        </div>
        {crumb}
        {subtitle ? (
          <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
