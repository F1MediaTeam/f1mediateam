// One designated colour per client, resolved in one place.
//
// Before this, two pages each kept their own five-colour list and picked from
// it by the client's *index in the list*. That meant a client's colour silently
// changed whenever another client was added or renamed — so "Buckets of Ink is
// cyan" could never be true for long, and the dashboard and the calendar could
// disagree with each other.
//
// Now: a colour is stored on the client (`ui_color`). If none is set, one is
// derived from the client's id, which never changes. Either way a client has
// exactly one colour everywhere in the app, forever.

export interface ClientColor {
  /** the colour itself, #rrggbb */
  hex: string;
  /** solid fill — use with `onSolid` for text sitting on top */
  solid: string;
  /** black or white, whichever stays readable on `solid` */
  onSolid: string;
  /** faint wash for large surfaces, safe under body text in either theme */
  tint: string;
  /** visible edge that works on both light and dark grounds */
  border: string;
}

/**
 * Twelve hues, evenly spread and distinguishable at the size of a calendar
 * chip. Mid-tone on purpose: each has to stay legible against the dark
 * (#07090c) and light (#e8ecf2) canvases without a per-theme variant.
 */
export const CLIENT_PALETTE = [
  "#22b8cf", // cyan
  "#e5484d", // red
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ec4899", // pink
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
  "#64748b", // slate
] as const;

/** F1 Media's own internal events — deliberately neutral, never a client hue. */
const INTERNAL_HEX = "#8b95a5";

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * WCAG relative luminance — decides whether text on this colour should be
 * black or white. Guessing by hue alone gets amber and lime wrong.
 */
function luminance(hex: string): number {
  const srgb = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function colorFromHex(hex: string): ClientColor {
  const clean = hex.trim().toLowerCase();
  const [r, g, b] = channels(clean);
  return {
    hex: clean,
    solid: clean,
    onSolid: luminance(clean) > 0.45 ? "#0b0f14" : "#ffffff",
    tint: `rgba(${r}, ${g}, ${b}, 0.16)`,
    border: `rgba(${r}, ${g}, ${b}, 0.45)`,
  };
}

/**
 * FNV-1a over the client's uuid. Any stable hash would do; the point is that
 * it depends only on the id, so the colour survives new clients, renames, and
 * re-sorting.
 */
function hashToIndex(id: string, buckets: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % buckets;
}

/** The colour for one client: what was chosen, else a stable one from its id. */
export function clientColor(
  client: { id: string; ui_color?: string | null } | null | undefined,
): ClientColor {
  if (!client) return colorFromHex(INTERNAL_HEX);
  if (isHexColor(client.ui_color)) return colorFromHex(client.ui_color);
  return colorFromHex(CLIENT_PALETTE[hashToIndex(client.id, CLIENT_PALETTE.length)]);
}

/** Colour for an event that belongs to no client (F1 Media internal). */
export const INTERNAL_COLOR: ClientColor = colorFromHex(INTERNAL_HEX);

/**
 * Look one up by id from a list already loaded on the page — the common case
 * on the dashboard and calendar, where events carry a client_id.
 */
export function clientColorById(
  id: string | null | undefined,
  clients: Array<{ id: string; ui_color?: string | null }>,
): ClientColor {
  if (!id) return INTERNAL_COLOR;
  return clientColor(clients.find((c) => c.id === id) ?? { id });
}
