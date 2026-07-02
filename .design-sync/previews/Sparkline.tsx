import { Sparkline } from "f1-media";

// Deterministic mini-series: linear trend + sine wobble (no Math.random).
function spark(days: number, start: number, end: number, noise: number): number[] {
  const vals: number[] = [];
  for (let i = 0; i < days; i++) {
    const t = days > 1 ? i / (days - 1) : 1;
    const trend = start + (end - start) * t;
    const wobble = Math.sin(i * 1.1) * 0.6 + Math.sin(i * 2.7) * 0.4;
    vals.push(Math.max(0, Math.round((trend + wobble * noise) * 10) / 10));
  }
  return vals;
}

export function ClicksRising() {
  return <Sparkline values={spark(30, 28, 64, 5)} baseline={28} />;
}

export function AvgPositionImproving() {
  // Lower is better — invert flips both orientation and up/down coloring.
  return <Sparkline values={spark(30, 23.4, 8.1, 1.2)} invert baseline={15} />;
}

export function ImpressionsDipping() {
  return <Sparkline values={spark(30, 2600, 1900, 140)} />;
}
