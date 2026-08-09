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
    id: "carbon",
    name: "Carbon",
    blurb: "The original dark. Teal accent on near-black.",
    mode: "dark",
    swatch: { bg: "#07090c", card: "#11161d", accent: "#3f8e84" },
  },
  {
    id: "fog",
    name: "Fog",
    blurb: "The light grey canvas the site has used until now.",
    mode: "light",
    swatch: { bg: "#e8ecf2", card: "#f6f8fb", accent: "#3f8e84" },
  },
  {
    id: "paper",
    name: "Paper",
    blurb: "Clean white. Best for screen-sharing and bright rooms.",
    mode: "light",
    swatch: { bg: "#ffffff", card: "#f7f9fb", accent: "#3f8e84" },
  },
  {
    id: "ink",
    name: "Ink",
    blurb: "True black, maximum contrast.",
    mode: "dark",
    swatch: { bg: "#000000", card: "#101010", accent: "#3f8e84" },
  },
  {
    id: "redline",
    name: "Redline",
    blurb: "F1 Media red on the light grey canvas.",
    mode: "light",
    swatch: { bg: "#e8ecf2", card: "#f6f8fb", accent: "#c20500" },
  },
  {
    id: "redline-dark",
    name: "Redline Dark",
    blurb: "F1 Media red on near-black.",
    mode: "dark",
    swatch: { bg: "#0a0708", card: "#171113", accent: "#e10600" },
  },
];

export const DEFAULT_THEME = "carbon";

/**
 * The light/dark counterpart of each theme, used by the sun/moon toggle. Paired
 * by character rather than jumping everyone back to Carbon: someone working in
 * Redline Dark wants Redline in daylight, not the teal default.
 */
export const THEME_COUNTERPART: Record<string, string> = {
  carbon: "fog",
  fog: "carbon",
  ink: "paper",
  paper: "ink",
  redline: "redline-dark",
  "redline-dark": "redline",
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
 * Accepts what's in localStorage and returns a real theme. Handles the two
 * legacy values ("dark" / "light") that predate named themes, so nobody's
 * saved preference resets when this ships.
 */
export function resolveTheme(stored: string | null | undefined): Theme {
  if (stored === "dark") return THEMES[0];
  if (stored === "light") return THEMES[1];
  return THEMES.find((t) => t.id === stored) ?? THEMES[0];
}
