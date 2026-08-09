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
    id: "chalk",
    name: "Chalk",
    blurb: "Pure white. Best for bright rooms and screen-sharing.",
    mode: "light",
    swatch: { bg: "#ffffff", card: "#f5f7f9", accent: "#c8102e" },
  },
  {
    id: "fog",
    name: "Fog",
    blurb: "Light grey — the canvas the site has always used.",
    mode: "light",
    swatch: { bg: "#e8ecf2", card: "#f6f8fb", accent: "#c8102e" },
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Mid grey. Dark, without the weight of black.",
    mode: "dark",
    swatch: { bg: "#33383f", card: "#424951", accent: "#ff2d3f" },
  },
  {
    id: "charcoal",
    name: "Charcoal",
    blurb: "Deep neutral grey. The default.",
    mode: "dark",
    swatch: { bg: "#16181c", card: "#22262c", accent: "#ff2d3f" },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    blurb: "True black, maximum contrast.",
    mode: "dark",
    swatch: { bg: "#000000", card: "#101010", accent: "#ff2d3f" },
  },
  {
    id: "redline",
    name: "Redline",
    blurb: "F1 red, carried into the background itself.",
    mode: "dark",
    swatch: { bg: "#120809", card: "#211215", accent: "#ff2d3f" },
  },
];

export const DEFAULT_THEME = "charcoal";

/**
 * The light/dark counterpart of each theme, used by the sun/moon toggle. Paired
 * by weight rather than jumping everyone back to one default — Fog's dark twin
 * is the similarly mid-toned Graphite, not black.
 */
export const THEME_COUNTERPART: Record<string, string> = {
  chalk: "charcoal",
  fog: "graphite",
  graphite: "fog",
  charcoal: "chalk",
  obsidian: "chalk",
  redline: "fog",
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
  "redline-dark": "redline",
};

export function resolveTheme(stored: string | null | undefined): Theme {
  const id = stored ? (LEGACY[stored] ?? stored) : DEFAULT_THEME;
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}
