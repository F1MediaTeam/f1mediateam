# design-sync notes — f1-media

- Next.js app, not a packaged library: no dist. Entry is the committed barrel
  `.design-sync/entry.tsx` (cfg.entry) — keep in step with componentSrcMap.
- `cssEntry` points at the Tailwind-compiled app stylesheet under
  `.next/static/chunks/*.css` — the HASH CHANGES per `next build`. On re-sync,
  re-locate it (`find .next/static -name "*.css"`) and update cfg.cssEntry.
- Dark-first DS: app CSS sets `color-scheme: dark`, harness body is white →
  previews wrap in `PreviewFrame` (`.design-sync/preview-frame.tsx`, wired via
  cfg.provider + cfg.extraEntries). Don't remove it or ghost buttons vanish.
- Excluded as app-coupled (import server data adapter / next runtime):
  GscDashboard, SemrushInsights, OrganicKeywordsPanel, WidgetBoard,
  MetricCompare, MultiMetricCard, SemrushGauges, SeoMetricsRow, modals,
  MobileNavMenu.
- DM Sans ships from @fontsource/dm-sans 400/700/800 via cfg.extraFonts
  (app itself uses next/font — no @font-face to scrape from source).

## Known render warns
- Capture sheets show a tall dark band below each story: page canvas painted
  by `color-scheme: dark` beyond the body's white box — harness artifact, not
  a component defect.

## Re-sync risks
- cfg.cssEntry hash goes stale on every `next build` — re-locate before build.
- `.design-sync/entry.tsx` and componentSrcMap must stay in step with any
  component adds/renames in src/components.
- PreviewFrame relies on `bg-[var(--color-bg)]` / `text-[var(--color-text)]`
  utilities existing in the compiled app CSS — if the app stops using them,
  the frame renders unstyled.

## Preview-authoring gotchas (folded from wave learnings, 2026-07-02)
- Harness serves no app `/public` assets: Logo preview sets `--logo-img` to a
  data URI of the downscaled real logo. If more components need public assets,
  consider copying them during capture.
- Time fixtures: avoid midnight-UTC ISO datetimes (local-tz hydration shifts
  the day) — use noon-UTC or bare `YYYY-MM-DD`.
- MultiLineChart/MultiMetricChartCard colors must be hex strings (alpha is
  string-concatenated, `var(...)` breaks); give synthetic series distinct
  phases or per-series normalization collapses them onto one curve.
- TrendChart always strokes `var(--color-up)` (`invert` is API-compat only);
  Sparkline is the one that respects `invert`.
- Metric* cards default to the 28/30-day range button — feed ≥90 daily points;
  dates must be `YYYY-MM-DD`; integer values for sum-aggregated counts.
- MultiMetricChartCard: inner MultiLineChart has a fixed 380px height → card
  is ~750px tall; handled via cfg.overrides cardMode single + viewport.
- SlideDeck fits at maxWidth 720, no override needed. KpiSlide grid jumps
  3→5 cols at 4+ items; >5-char KPI values clip; keep values ≤5 chars.
- Full-width primitives (Input/Textarea/Select/EmptyState) need a maxWidth
  wrapper in previews or they stretch across the whole frame.
