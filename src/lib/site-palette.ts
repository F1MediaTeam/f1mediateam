// The colours already in use on the site, for the style inspector to offer.
//
// Read live from the document rather than hard-coded, so the list always
// reflects the active theme *and* any overrides already saved. Picking from
// here is how a change stays consistent: matching "the card colour" by eye
// produces a near-miss that then has to be corrected everywhere, whereas
// picking the token's actual value produces an exact match.

import { CLIENT_PALETTE } from "@/lib/client-color";

export interface Swatch {
  /** what to show on hover — the token name, or the client's company */
  label: string;
  /** the resolved value, always #rrggbb so <input type="color"> accepts it */
  hex: string;
}

export interface SwatchGroup {
  title: string;
  swatches: Swatch[];
}

/** Tokens worth offering, in the order they're most often reached for. */
const TOKEN_GROUPS: Array<{ title: string; tokens: Array<[string, string]> }> = [
  {
    title: "Surfaces",
    tokens: [
      ["--color-bg", "Page"],
      ["--color-bg-elev", "Raised"],
      ["--color-bg-card", "Card"],
      ["--color-bg-hover", "Hover"],
      ["--color-border", "Border"],
      ["--color-border-strong", "Border strong"],
    ],
  },
  {
    title: "Text",
    tokens: [
      ["--color-text", "Text"],
      ["--color-text-muted", "Muted"],
      ["--color-text-subtle", "Subtle"],
    ],
  },
  {
    title: "Accent & status",
    tokens: [
      ["--color-accent", "Accent"],
      ["--color-accent-dim", "Accent dim"],
      ["--color-on-accent", "On accent"],
      ["--color-ok", "Good"],
      ["--color-warn", "Warning"],
      ["--color-bad", "Bad"],
    ],
  },
];

/** rgb()/rgba()/hex → #rrggbb. Returns null for anything unparseable. */
function normalise(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1];
    return (
      "#" +
      (h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h)
    ).toLowerCase();
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    return (
      "#" +
      parts
        .slice(0, 3)
        .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return null;
}

/**
 * Build the palette from the live document.
 *
 * `clients` is passed in rather than fetched: the inspector is mounted in the
 * admin layout on every page, and it should not be issuing its own query on
 * every render just to populate a colour list.
 */
export function sitePalette(
  clients: Array<{ company_name: string; hex: string }> = [],
  hidden: string[] = [],
): SwatchGroup[] {
  const groups: SwatchGroup[] = [];
  if (typeof document === "undefined") return groups;
  const isHidden = new Set(hidden.map((h) => h.toLowerCase()));

  const computed = getComputedStyle(document.documentElement);

  for (const group of TOKEN_GROUPS) {
    const swatches: Swatch[] = [];
    const seen = new Set<string>();
    for (const [token, label] of group.tokens) {
      const hex = normalise(computed.getPropertyValue(token));
      // Skip duplicates within a group — several tokens legitimately resolve
      // to the same value in some themes, and a row of identical chips is
      // noise, not choice.
      if (!hex || seen.has(hex) || isHidden.has(hex)) continue;
      seen.add(hex);
      swatches.push({ label, hex });
    }
    if (swatches.length > 0) groups.push({ title: group.title, swatches });
  }

  const visibleClients = clients.filter((c) => !isHidden.has(c.hex.toLowerCase()));
  if (visibleClients.length > 0) {
    groups.push({
      title: "Clients",
      swatches: visibleClients.map((c) => ({ label: c.company_name, hex: c.hex })),
    });
  }

  const spare = CLIENT_PALETTE.filter((hex) => !isHidden.has(hex));
  if (spare.length > 0) {
    groups.push({
      title: "Client palette",
      swatches: spare.map((hex) => ({ label: hex, hex })),
    });
  }

  return groups;
}
