// The named themes, in one place.
//
// Shared by the pre-paint script in layout.tsx and the picker in
// Settings → Preferences, so the two can't drift. Adding a theme means adding
// a block in globals.css and an entry here — nothing else.

export type ThemeMode = "light" | "dark";

export interface Theme {
  id: string;
  name: string;
  /** one line, shown under the name in the picker */
  blurb: string;
  mode: ThemeMode;
  /** the three colours drawn in the picker's preview tile */
  swatch: { bg: string; card: string; accent: string };
}

export const THEMES: Theme[] = [
  {
    id: "studio",
    name: "Studio",
    blurb: "The house look — grey page, white panels, black rail, F1 red.",
    mode: "light",
    swatch: { bg: "#bcc5d0", card: "#ffffff", accent: "#e11d2e" },
  },
  {
    id: "chalk",
    name: "Chalk",
    blurb: "Pure white. Best for bright rooms and screen-sharing.",
    mode: "light",
    swatch: { bg: "#ffffff", card: "#f5f7f9", accent: "#c8102e" },
  },
  {
    id: "chalk-panel",
    name: "Chalk Panel",
    blurb: "White page, grey panels. Every block reads as its own object.",
    mode: "light",
    swatch: { bg: "#ffffff", card: "#eef1f5", accent: "#c8102e" },
  },
  {
    id: "fog",
    name: "Fog",
    blurb: "Light grey — the canvas the site has always used.",
    mode: "light",
    swatch: { bg: "#e8ecf2", card: "#f6f8fb", accent: "#c8102e" },
  },
  {
    id: "graphite-panel",
    name: "Graphite Panel",
    blurb: "Grey page, white panels. The sharpest separation of the three.",
    mode: "light",
    swatch: { bg: "#b9c1ca", card: "#ffffff", accent: "#c8102e" },
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Mid grey, with panels lifted well clear of the page.",
    mode: "dark",
    swatch: { bg: "#2b3037", card: "#414851", accent: "#ff2d3f" },
  },
  {
    id: "graphite-deep",
    name: "Graphite Deep",
    blurb: "The same idea, pitched darker.",
    mode: "dark",
    swatch: { bg: "#1f2429", card: "#323942", accent: "#ff2d3f" },
  },
  {
    id: "charcoal",
    name: "Charcoal",
    blurb: "Deep neutral grey. The default.",
    mode: "dark",
    swatch: { bg: "#16181c", card: "#22262c", accent: "#ff2d3f" },
  },
  {
    id: "obsidian-panel",
    name: "Obsidian Panel",
    blurb: "Black page, grey panels lifted clear of it.",
    mode: "dark",
    swatch: { bg: "#000000", card: "#2b2b2b", accent: "#ff2d3f" },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    blurb: "True black throughout. Cheapest on OLED.",
    mode: "dark",
    swatch: { bg: "#000000", card: "#101010", accent: "#ff2d3f" },
  },
];

export const DEFAULT_THEME = "studio";

/**
 * The light/dark counterpart of each theme, used by the sun/moon toggle. Paired
 * by weight rather than jumping everyone back to one default — Fog's dark twin
 * is the similarly mid-toned Graphite, not black.
 */
export const THEME_COUNTERPART: Record<string, string> = {
  studio: "obsidian-panel",
  chalk: "charcoal",
  "chalk-panel": "obsidian-panel",
  fog: "graphite-deep",
  "graphite-panel": "graphite",
  graphite: "graphite-panel",
  "graphite-deep": "fog",
  charcoal: "chalk",
  "obsidian-panel": "chalk-panel",
  obsidian: "chalk",
};

/** Read the theme currently on <html>. Safe to call only in the browser. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return THEMES[0];
  return resolveTheme(document.documentElement.getAttribute("data-theme"));
}

/** Apply a theme to the document and remember it. */
export function applyTheme(id: string): Theme {
  const theme = resolveTheme(id);
  if (typeof document !== "undefined") {
    const el = document.documentElement;
    el.setAttribute("data-theme", theme.id);
    el.setAttribute("data-mode", theme.mode);
  }
  try {
    localStorage.setItem("theme", theme.id);
  } catch {
    // private mode / storage disabled — the theme still applies this session
  }
  return theme;
}

/**
 * Accepts whatever is in localStorage and returns a real theme. Maps the two
 * pre-named-theme values ("dark" / "light") and the first-pass names, so no
 * saved preference resets when the set changes.
 */
const LEGACY: Record<string, string> = {
  dark: "charcoal",
  light: "fog",
  carbon: "charcoal",
  paper: "chalk",
  ink: "obsidian",
  // Redline was dropped; anyone on it lands on the default rather than a
  // blank attribute that would fall through to no theme at all.
  redline: "charcoal",
  "redline-dark": "charcoal",
};

export function resolveTheme(stored: string | null | undefined): Theme {
  const id = stored ? (LEGACY[stored] ?? stored) : DEFAULT_THEME;
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}
