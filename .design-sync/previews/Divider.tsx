import { Divider } from "f1-media";

export function BetweenParagraphs() {
  return (
    <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="text-sm text-[var(--color-text-muted)]">
        Organic clicks are up 12% month over month, driven mostly by the new
        service-area pages.
      </p>
      <Divider />
      <p className="text-sm text-[var(--color-text-muted)]">
        Next up: refresh the five oldest blog posts and re-submit them for
        indexing.
      </p>
    </div>
  );
}

export function BetweenListRows() {
  return (
    <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div className="text-sm font-medium">Northwind HVAC</div>
        <div className="text-xs text-[var(--color-text-muted)]">Report delivered June 3</div>
      </div>
      <Divider />
      <div>
        <div className="text-sm font-medium">Acme Roofing</div>
        <div className="text-xs text-[var(--color-text-muted)]">Report due June 5</div>
      </div>
    </div>
  );
}
