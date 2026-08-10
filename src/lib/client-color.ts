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
 * Twelve true, saturated hues — no pastels. These are always painted as a
 * solid fill with black or white text on top, so they need to be strong enough
 * to identify a client at a glance from across a calendar, and they must read
 * the same on every theme from white through to black.
 */
export const CLIENT_PALETTE = [
  "#00b5d8", // cyan
  "#e11d2e", // red
  "#16a34a", // green
  "#0b74e5", // blue
  "#f97316", // orange
  "#7c3aed", // violet
  "#db2777", // magenta
  "#eab308", // yellow
  "#0d9488", // teal
  "#65a30d", // lime
  "#9333ea", // purple
  "#475569", // slate
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

/**
 * Black or white on this colour — whichever genuinely contrasts more.
 *
 * This was a brightness threshold, which put white text on every mid-tone.
 * On the neutral grey used for internal events that came out around 2.6:1 and
 * the titles were hard to read. Comparing the two WCAG ratios instead picks
 * black for mid and light colours — cyan, green, grey — and keeps white only
 * where black would genuinely be worse, like the deep brand red.
 */
function textOn(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onBlack >= onWhite ? "#0b0f14" : "#ffffff";
}

export function colorFromHex(hex: string): ClientColor {
  const clean = hex.trim().toLowerCase();
  const [r, g, b] = channels(clean);
  return {
    hex: clean,
    solid: clean,
    onSolid: textOn(clean),
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
