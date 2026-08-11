// A small inline chart, hand-rolled.
//
// No chart library is installed and the repo hand-rolls its PDF charts already,
// so adding one for a 60-pixel sparkline would be a dependency for nothing.

export default function Sparkline({
  values,
  width = 96,
  height = 26,
  invert = false,
  color = "var(--color-accent)",
}: {
  /** null = no data for that point; the line breaks rather than dropping to zero */
  values: Array<number | null>;
  width?: number;
  height?: number;
  /** true for rankings, where a lower number is better and should sit higher */
  invert?: boolean;
  color?: string;
}) {
  const points = values.filter((v): v is number => v !== null);
  if (points.length < 2) {
    return (
      <span className="inline-block text-[10px] text-[var(--color-text-subtle)]" style={{ width }}>
        —
      </span>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);

  // Nulls break the path into separate segments instead of being drawn through,
  // so a gap in the data can't look like a plunge to zero.
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    const ratio = (v - min) / span;
    const y = invert ? 2 + ratio * (height - 4) : height - 2 - ratio * (height - 4);
    current.push(`${current.length === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const lastIndex = values.length - 1 - [...values].reverse().findIndex((v) => v !== null);
  const lastValue = values[lastIndex];
  const lastRatio = lastValue === null || lastValue === undefined ? 0 : (lastValue - min) / span;
  const lastY = invert ? 2 + lastRatio * (height - 4) : height - 2 - lastRatio * (height - 4);

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      {segments.map((d) => (
        <path key={d} d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      ))}
      {/* The endpoint is the number that matters — mark it. */}
      <circle cx={lastIndex * step} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}
