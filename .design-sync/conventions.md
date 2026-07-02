# F1 Media — build conventions

F1 Media is a **dark-first** SEO/marketing client-reporting brand. Every screen
sits on the dark app canvas; there is no light theme in designs unless asked.

## Page setup

Root every design in a dark canvas container — the components are transparent
and expect it:

```jsx
<div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] p-8"
     style={{ fontFamily: "var(--font-sans)" }}>
  …
</div>
```

DM Sans is the only typeface (weights 400 / 700 / 800 — intermediate weights
snap to 700). `var(--font-sans)` resolves to it.

## Styling idiom: Tailwind utilities + CSS-variable tokens

Style with Tailwind classes using the brand tokens in arbitrary-value form —
this is how the entire codebase is written. The tokens (all defined in
`styles.css`):

| Token | Use |
|---|---|
| `--color-bg` / `--color-bg-elev` / `--color-bg-card` / `--color-bg-hover` | page canvas / raised surface / card surface / hover surface |
| `--color-border` / `--color-border-strong` | 1px hairlines / emphasized borders |
| `--color-text` / `--color-text-muted` / `--color-text-subtle` | primary / secondary / faint text |
| `--color-accent` (+ `-dim`, `-soft`) | the brand teal — links, active states, primary actions |
| `--color-on-accent` | text on teal fills (black) |
| `--color-up` / `--color-down` | metric deltas: good (teal) / bad (red) |

Recurring patterns from the codebase: surfaces are
`rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)]`;
eyebrow/kicker labels are
`text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]`;
numbers use `tabular-nums`. `emerald-*` utility shades are remapped to the
brand teal — using them is on-brand, never green.

## Components

Compose from the library first: `Card` + `CardHeader` (title/subtitle/right) +
`CardBody` for every panel; `Stat` for KPI tiles (its `trend.direction` is
pre-inverted — color by direction only); `Pill` for statuses (all tones except
`danger` render brand teal by design); `Button` variants primary/secondary/
ghost/danger; `TrendChart`/`Sparkline`/`MultiLineChart` and the Metric* cards
for data viz; `SlideDeck` renders typed slide decks (see its `.prompt.md` for
the `Slide` union). `EmptyState` for zero-data panels. Read each component's
`.prompt.md` and `.d.ts` before use.

## Example: a dashboard panel

```jsx
<Card className="max-w-xl">
  <CardHeader title="SEO Snapshot" subtitle="Northwind HVAC — last 30 days"
              right={<Pill tone="ok">Synced</Pill>} />
  <CardBody>
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Clicks" value="1,284"
            trend={{ direction: "up", label: "+12.4%" }} sub="vs previous period" />
      <Stat label="Avg position" value="8.2"
            trend={{ direction: "down", label: "−1.3" }} sub="lower is better" />
    </div>
  </CardBody>
</Card>
```
