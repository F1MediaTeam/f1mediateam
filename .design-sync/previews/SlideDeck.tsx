import { SlideDeck } from "f1-media";

// Deck shaped exactly like src/lib/slides.ts buildDeck() output for a
// realistic client review. SlideDeck shows one slide at a time, so each
// story starts at a different initialIndex.
const deck = [
  {
    kind: "cover",
    title: "Q3 Performance Review",
    subtitle: "Northwind HVAC",
    date: "2026-06-30T16:00:00Z",
    rangeLabel: "Apr 1, 2026 → Jun 30, 2026",
    logoUrl: null,
  },
  {
    kind: "kpi",
    title: "Headline numbers",
    subtitle: "Apr 1, 2026 → Jun 30, 2026 · Northwind HVAC",
    items: [
      // Values kept ≤5 chars: KpiSlide puts 4+ items in grid-cols-5, and at
      // preview width (720px) longer font-mono text-4xl values clip the tile.
      { label: "Clicks", value: "1,284", delta: "+12.4%", direction: "up" },
      { label: "Impressions", value: "48.2K", delta: "+8.1%", direction: "up" },
      // avg_position is lower-is-better; slides.ts already inverts direction,
      // so a −1.3 improvement arrives here as direction "up".
      { label: "Avg. position", value: "6.8", delta: "−1.3", direction: "up" },
      { label: "Sessions", value: "3,412", delta: null, direction: "flat" },
    ],
  },
  {
    kind: "closing",
    title: "Recap & questions",
    subtitle: "Northwind HVAC",
    bullets: [
      "3 of 4 headline metrics trending up",
      "6 pieces of content shipped this quarter",
      "4 open tasks to drive next-period results",
      "Thanks for the partnership — questions?",
    ],
  },
];

export function Cover() {
  return (
    <div style={{ maxWidth: 720 }}>
      <SlideDeck slides={deck} mode="preview" initialIndex={0} />
    </div>
  );
}

export function Kpis() {
  return (
    <div style={{ maxWidth: 720 }}>
      <SlideDeck slides={deck} mode="preview" initialIndex={1} />
    </div>
  );
}

export function Closing() {
  return (
    <div style={{ maxWidth: 720 }}>
      <SlideDeck slides={deck} mode="preview" initialIndex={2} />
    </div>
  );
}
