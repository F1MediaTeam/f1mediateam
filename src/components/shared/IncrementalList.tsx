"use client";

// Shows the first N children and reveals more in batches on demand, so a
// column with 60 posted cards doesn't scroll forever.
//
// Children are rendered by the server component that wraps them, so the cards
// keep their modals and server actions — this only decides how many of the
// already-built nodes get mounted.

import { Children, useState } from "react";

export default function IncrementalList({
  children,
  step = 10,
}: {
  children: React.ReactNode;
  /** how many to show initially, and how many each click adds */
  step?: number;
}) {
  const items = Children.toArray(children);
  const [shown, setShown] = useState(step);
  const remaining = items.length - shown;

  return (
    <>
      {items.slice(0, shown)}
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + step)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
        >
          Load {Math.min(step, remaining)} more
          <span className="ml-1 text-[var(--color-text-subtle)]">({remaining} left)</span>
        </button>
      ) : null}
    </>
  );
}
