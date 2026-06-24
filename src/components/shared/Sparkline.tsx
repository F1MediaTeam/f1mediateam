// Minimal inline-SVG sparkline. Dependency-free.
// Used for baseline-vs-now trend lines.

interface Props {
  values: number[];
  width?: number;
  height?: number;
  invert?: boolean; // for metrics where lower is better (e.g. avg_position)
  baseline?: number;
}

export default function Sparkline({
  values,
  width = 220,
  height = 60,
  invert = false,
  baseline,
}: Props) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const toY = (v: number) => {
    const t = (v - min) / range;
    return invert ? 4 + t * (height - 8) : height - 4 - t * (height - 8);
  };
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const path = values.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${toY(v)}`).join(" ");
  const last = values[values.length - 1];
  const first = values[0];

  // Improving = last is "better" than first; for invert metrics, lower is better.
  const improving = invert ? last < first : last > first;
  const stroke = improving ? "var(--color-up)" : "var(--color-down)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`spk-${stroke.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline !== undefined ? (
        <line
          x1={0}
          x2={width}
          y1={toY(baseline)}
          y2={toY(baseline)}
          stroke="var(--color-border-strong)"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
      ) : null}
      <path
        d={`${path} L ${width} ${height} L 0 ${height} Z`}
        fill={`url(#spk-${stroke.replace(/[^a-z]/gi, "")})`}
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
