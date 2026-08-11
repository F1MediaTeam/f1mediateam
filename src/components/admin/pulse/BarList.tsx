// Ranked magnitudes — top pages, referrers, UTM sources.
//
// A bar per row rather than a bare number: the job is comparison, and a list of
// digits makes the reader do the arithmetic. One hue, more-is-longer, with the
// value direct-labelled so the bar never has to be measured against an axis.

export default function BarList({
  rows,
  accent,
  empty,
  mono,
}: {
  rows: Array<{ label: string; value: number }>;
  accent: string;
  empty: string;
  /** monospace the labels — right for URL paths, wrong for domain names */
  mono?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="group">
          <div className="mb-0.5 flex items-baseline justify-between gap-3">
            <span className={"min-w-0 flex-1 truncate text-[11px] " + (mono ? "font-mono" : "")} title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums">{r.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-hover)]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: accent, opacity: 0.85 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
