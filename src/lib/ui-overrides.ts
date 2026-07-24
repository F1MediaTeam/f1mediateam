// Style-inspector overrides: types, sanitizing, and CSS generation.
//
// Pure module — no React, no Supabase — so the same code runs on the server
// (rendering the <style> block) and in the browser (live preview while the
// admin drags a color picker).

export type OverrideScope = "token" | "group" | "element";

export interface UiOverride {
  scope: OverrideScope;
  /** token name (--color-bg-card), class signature, or data-style-id */
  selector: string;
  styles: Record<string, string>;
}

/** Every property the inspector panel is allowed to set, camelCase → CSS. */
export const EDITABLE_PROPS = {
  color: "color",
  backgroundColor: "background-color",
  borderColor: "border-color",
  borderWidth: "border-width",
  borderStyle: "border-style",
  borderRadius: "border-radius",
  fontSize: "font-size",
  fontWeight: "font-weight",
  fontFamily: "font-family",
  fontStyle: "font-style",
  letterSpacing: "letter-spacing",
  textTransform: "text-transform",
  textDecoration: "text-decoration",
  opacity: "opacity",
  // Repositioning is done with translate() rather than top/left so an element
  // can be nudged anywhere without pulling its neighbours around.
  transform: "transform",
} as const;

export type EditableProp = keyof typeof EDITABLE_PROPS;

/** The design tokens in globals.css that the "everything using this" scope
 *  can retarget. Kept explicit so the panel can offer a fixed dropdown and a
 *  typo can never write an unknown custom property. */
export const THEME_TOKENS = [
  "--color-bg",
  "--color-bg-elev",
  "--color-bg-card",
  "--color-bg-hover",
  "--color-border",
  "--color-border-strong",
  "--color-text",
  "--color-text-muted",
  "--color-text-subtle",
  "--color-accent",
  "--color-accent-dim",
  "--color-accent-soft",
  "--color-on-accent",
  "--color-up",
  "--color-down",
] as const;

// --- sanitizing -------------------------------------------------------------
//
// Only admins can write overrides, but the values still land inside a <style>
// tag, so a stray "}" or "</style>" would let a saved override escape its rule
// and restyle anything. Both selector and value are validated, not escaped —
// anything suspicious is dropped rather than mangled into something that still
// parses.

const FORBIDDEN = /[{}<>;@\\]|\/\*|\*\//;

/** Selectors are built by the client from tag names, classes, and data
 *  attributes. Allow exactly that alphabet and nothing else. */
export function isSafeSelector(selector: string): boolean {
  if (!selector || selector.length > 300) return false;
  if (FORBIDDEN.test(selector)) return false;
  return /^[A-Za-z0-9_\-[\]="'.:#>~+,()\s]+$/.test(selector);
}

/** Token names must be one of ours — never an arbitrary custom property. */
export function isSafeToken(name: string): boolean {
  return (THEME_TOKENS as readonly string[]).includes(name);
}

/** Values are colors, lengths, keywords, and font stacks. */
export function isSafeValue(value: string): boolean {
  if (!value || value.length > 200) return false;
  if (FORBIDDEN.test(value)) return false;
  if (/url\s*\(|expression\s*\(|import/i.test(value)) return false;
  return /^[A-Za-z0-9_\-#%.,()'"\s/]+$/.test(value);
}

/** Drop unknown properties and unsafe values. Returns only what's writable. */
export function sanitizeStyles(styles: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(styles ?? {})) {
    if (!(key in EDITABLE_PROPS)) continue;
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!isSafeValue(value)) continue;
    out[key] = value;
  }
  return out;
}

/** Validate a whole override. Returns null when it can't be made safe. */
export function sanitizeOverride(input: {
  scope: string;
  selector: string;
  styles: Record<string, unknown>;
}): UiOverride | null {
  const scope = input.scope as OverrideScope;
  if (scope !== "token" && scope !== "group" && scope !== "element") return null;

  const selector = (input.selector ?? "").trim();
  if (scope === "token" ? !isSafeToken(selector) : !isSafeSelector(selector)) return null;

  const styles = sanitizeStyles(input.styles);
  if (Object.keys(styles).length === 0) return null;

  return { scope, selector, styles };
}

// --- CSS generation ---------------------------------------------------------

function declarations(styles: Record<string, string>, important: boolean): string {
  return Object.entries(styles)
    .map(([key, value]) => {
      const prop = EDITABLE_PROPS[key as EditableProp];
      return `${prop}:${value}${important ? " !important" : ""}`;
    })
    .join(";");
}

/** One override → one CSS rule. */
export function overrideToCss(override: UiOverride): string {
  const { scope, selector, styles } = override;

  if (scope === "token") {
    // Tokens carry a value, not a property list — the panel stores it under
    // `color`. Both :root and :root[data-theme="light"] are targeted so the
    // change lands on the dark and light palettes together, and the rule sits
    // after globals.css so equal specificity resolves in our favour.
    const value = styles.color ?? styles.backgroundColor;
    if (!value) return "";
    return `:root,:root[data-theme="light"]{${selector}:${value}}`;
  }

  if (scope === "element") {
    // !important is required: Tailwind utilities like bg-[var(--color-bg-elev)]
    // are single-class rules that would otherwise tie and win on source order.
    return `[data-style-id="${selector}"]{${declarations(styles, true)}}`;
  }

  return `${selector}{${declarations(styles, true)}}`;
}

/** Full stylesheet for a set of overrides. Tokens are emitted first so that
 *  element and group rules can still override the palette they cascade from. */
export function buildOverrideCss(overrides: UiOverride[]): string {
  const tokens = overrides.filter((o) => o.scope === "token");
  const rest = overrides.filter((o) => o.scope !== "token");
  return [...tokens, ...rest]
    .map(overrideToCss)
    .filter(Boolean)
    .join("\n");
}
