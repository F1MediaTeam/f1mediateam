"use client";

// Crosshair style inspector for the admin console.
//
// Toggle it from the toolbar, hover to outline any element, click to freeze a
// selection, then edit its type, colors, and border in the bubble. Every edit
// previews instantly through a temporary <style> tag; Save writes it to the
// database and the change becomes live for the whole admin console.
//
// Three blast radii, chosen per edit:
//   element — one node carrying data-style-id (precise, survives re-renders)
//   group   — every node with an identical class attribute (e.g. all nav links)
//   token   — a design token in globals.css, so every consumer changes at once

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, X, RotateCcw, Check, BookmarkCheck, Move } from "lucide-react";
import {
  buildOverrideCss,
  THEME_TOKENS,
  type OverrideScope,
  type UiOverride,
} from "@/lib/ui-overrides";
import {
  saveStyleOverrideAction,
  setStyleDefaultAction,
  resetStyleToDefaultAction,
  restoreOriginalStylesAction,
} from "@/app/admin/style-actions";

const PREVIEW_STYLE_ID = "style-inspector-preview";

interface Target {
  element: HTMLElement;
  /** data-style-id on the element or its nearest ancestor, when present */
  styleId: string | null;
  /** exact-class-attribute selector matching every sibling of the same kind */
  groupSelector: string | null;
  /** token whose value already matches this element's background or text */
  tokenGuess: string;
  label: string;
  count: number;
}

const FONT_STACKS = [
  { label: "Theme default", value: "" },
  { label: "System sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Monospace", value: "ui-monospace, SFMono-Regular, monospace" },
];

// --- colour helpers ---------------------------------------------------------

/** Parse "#abc", "#aabbcc", or "rgb(a)" into channels. */
function parseColor(input: string): [number, number, number] | null {
  const value = input.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => parseFloat(p));
    if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  }
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, or null when either colour can't be parsed. */
function contrastRatio(fg: string, bg: string): number | null {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Normalise a computed colour to hex so <input type="color"> accepts it. */
function toHex(input: string): string {
  const rgb = parseColor(input);
  if (!rgb) return "#000000";
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

/** Read an element's current translate() offset out of its computed matrix,
 *  so dragging continues from where a saved override already put it. */
function readOffset(el: HTMLElement): { x: number; y: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return { x: 0, y: 0 };
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return { x: 0, y: 0 };
  const parts = m[1].split(",").map((p) => parseFloat(p));
  return parts.length >= 6 ? { x: parts[4] || 0, y: parts[5] || 0 } : { x: 0, y: 0 };
}

// --- target resolution ------------------------------------------------------

function describe(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").trim().slice(0, 28);
  return text ? `${tag} · "${text}"` : tag;
}

function resolveTarget(el: HTMLElement): Target {
  const withId = el.closest<HTMLElement>("[data-style-id]");
  const styleId = withId?.dataset.styleId ?? null;

  // Exact class-attribute match is the most durable "everything like this"
  // selector available: it needs no CSS escaping of Tailwind's bracket syntax
  // and never drifts the way an nth-child path does when content changes.
  const className = el.getAttribute("class") ?? "";
  const safeClass = className && !/["\\]/.test(className) ? className : null;
  const groupSelector = safeClass ? `[class="${safeClass}"]` : null;

  let count = 1;
  if (groupSelector) {
    try {
      count = document.querySelectorAll(groupSelector).length;
    } catch {
      count = 1;
    }
  }

  // Guess which token this element already draws from, so the "everything
  // using this" option starts on something meaningful.
  const computed = getComputedStyle(el);
  const rootStyle = getComputedStyle(document.documentElement);
  let tokenGuess = "--color-accent";
  for (const token of THEME_TOKENS) {
    const tokenValue = rootStyle.getPropertyValue(token).trim();
    if (!tokenValue) continue;
    const hex = toHex(tokenValue);
    if (hex === toHex(computed.backgroundColor) || hex === toHex(computed.color)) {
      tokenGuess = token;
      break;
    }
  }

  return { element: el, styleId, groupSelector, tokenGuess, label: describe(el), count };
}

// --- component --------------------------------------------------------------

export default function StyleInspector() {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [scope, setScope] = useState<OverrideScope>("group");
  const [token, setToken] = useState<string>("--color-accent");
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const previewRef = useRef<HTMLStyleElement | null>(null);

  // Drag-to-move. `offset` is the live translate(); `base*` are captured at
  // selection time so the drag handle can be positioned arithmetically rather
  // than re-measuring the element mid-drag.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [baseOffset, setBaseOffset] = useState({ x: 0, y: 0 });
  const [baseRect, setBaseRect] = useState<DOMRect | null>(null);
  const dragFrom = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const stop = useCallback(() => {
    setPicking(false);
    setHoverRect(null);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setStyles({});
    setHoverRect(null);
    setNote(null);
    setOffset({ x: 0, y: 0 });
    setBaseOffset({ x: 0, y: 0 });
    setBaseRect(null);
  }, []);

  // Hover-to-outline while picking. Anything inside the inspector's own UI is
  // skipped so the panel can't select itself.
  useEffect(() => {
    if (!picking) return;

    function onMove(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el.closest("[data-inspector]")) return setHoverRect(null);
      setHoverRect(el.getBoundingClientRect());
    }

    function onClick(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el.closest("[data-inspector]")) return;
      e.preventDefault();
      e.stopPropagation();
      const resolved = resolveTarget(el);
      setTarget(resolved);
      setToken(resolved.tokenGuess);
      setScope(resolved.groupSelector ? "group" : resolved.styleId ? "element" : "token");
      const computed = getComputedStyle(el);
      setStyles({
        color: toHex(computed.color),
        backgroundColor: toHex(computed.backgroundColor),
      });
      const current = readOffset(el);
      setOffset(current);
      setBaseOffset(current);
      setBaseRect(el.getBoundingClientRect());
      stop();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") stop();
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.body.style.cursor = "crosshair";
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.cursor = "";
    };
  }, [picking, stop]);

  // The override being edited right now, or null when it isn't targetable.
  const draft = useMemo<UiOverride | null>(() => {
    if (!target) return null;
    const selector =
      scope === "token" ? token : scope === "element" ? target.styleId : target.groupSelector;
    if (!selector) return null;
    // A move is written whenever the element sits somewhere other than where
    // the stylesheet puts it — including back at 0,0, which is how "Reset
    // position" cancels a previously saved translate().
    const moved = offset.x !== 0 || offset.y !== 0;
    const hadOffset = baseOffset.x !== 0 || baseOffset.y !== 0;
    const payload =
      scope === "token"
        ? { color: styles.color ?? "" }
        : {
            ...styles,
            ...(moved || hadOffset
              ? { transform: `translate(${Math.round(offset.x)}px, ${Math.round(offset.y)}px)` }
              : {}),
          };
    const filled = Object.fromEntries(Object.entries(payload).filter(([, v]) => v));
    if (Object.keys(filled).length === 0) return null;
    return { scope, selector, styles: filled };
  }, [target, scope, token, styles, offset, baseOffset]);

  // Live preview — same CSS generator the server uses, so what you see while
  // dragging is exactly what gets written.
  useEffect(() => {
    let tag = previewRef.current;
    if (!tag) {
      tag = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
      if (!tag) {
        tag = document.createElement("style");
        tag.id = PREVIEW_STYLE_ID;
        document.head.appendChild(tag);
      }
      previewRef.current = tag;
    }
    tag.textContent = draft ? buildOverrideCss([draft]) : "";
  }, [draft]);

  useEffect(() => {
    return () => {
      document.getElementById(PREVIEW_STYLE_ID)?.remove();
    };
  }, []);

  function set(prop: string, value: string) {
    setStyles((prev) => ({ ...prev, [prop]: value }));
  }

  // Dragging the handle moves the element live; arrow keys nudge it a pixel at
  // a time (10 with Shift) once something is selected.
  useEffect(() => {
    if (!target) return;

    function onMove(e: MouseEvent) {
      const from = dragFrom.current;
      if (!from) return;
      e.preventDefault();
      setOffset({ x: from.ox + (e.clientX - from.px), y: from.oy + (e.clientY - from.py) });
    }

    function onUp() {
      dragFrom.current = null;
    }

    function onKey(e: KeyboardEvent) {
      const focused = e.target as HTMLElement | null;
      // Don't hijack arrows while typing a hex value in the panel.
      if (focused && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = nudge[e.key];
      if (!delta) return;
      e.preventDefault();
      setOffset((o) => ({ x: o.x + delta[0], y: o.y + delta[1] }));
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [target]);

  async function run(fn: () => Promise<{ error: string | null }>, okMessage: string) {
    setBusy(true);
    setNote(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setNote(error);
    setNote(okMessage);
    router.refresh();
  }

  async function save() {
    if (!draft) return;
    // Clear the preview first so the saved rule isn't briefly doubled up.
    await run(() => saveStyleOverrideAction(draft), "Saved and live.");
    close();
  }

  const ratio =
    styles.color && styles.backgroundColor
      ? contrastRatio(styles.color, styles.backgroundColor)
      : null;

  const scopeOptions: Array<{ value: OverrideScope; label: string; hint: string; ok: boolean }> = [
    {
      value: "element",
      label: "Just this one",
      hint: target?.styleId ? `#${target.styleId}` : "needs a data-style-id",
      ok: Boolean(target?.styleId),
    },
    {
      value: "group",
      label: "Everything like it",
      hint: target ? `${target.count} match${target.count === 1 ? "" : "es"}` : "",
      ok: Boolean(target?.groupSelector),
    },
    {
      value: "token",
      label: "Every use of the token",
      hint: "site-wide, both themes",
      ok: true,
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => (picking ? stop() : (close(), setPicking(true)))}
        title="Style inspector — click any element to restyle it"
        aria-pressed={picking}
        data-inspector
        className={
          "flex items-center justify-center w-9 h-9 rounded-lg border transition " +
          (picking
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
        }
      >
        <Crosshair size={16} />
      </button>

      {/* Hover outline. pointer-events:none so it never eats the click. */}
      {picking && hoverRect ? (
        <div
          data-inspector
          className="fixed z-[100] pointer-events-none border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/10 rounded"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      ) : null}

      {picking ? (
        <div
          data-inspector
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[101] rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-xs text-[var(--color-text-muted)] shadow-lg"
        >
          Click any element to restyle it · <kbd>Esc</kbd> to cancel
        </div>
      ) : null}

      {/* Drag handle sitting exactly over the selected element. Positioned from
          the rect captured at selection plus the offset moved since, so it
          tracks the element without re-measuring during the drag. */}
      {target && baseRect && scope !== "token" ? (
        <div
          data-inspector
          onMouseDown={(e) => {
            e.preventDefault();
            dragFrom.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
          }}
          title="Drag to move · arrow keys to nudge"
          className="fixed z-[101] cursor-move rounded border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/5"
          style={{
            top: baseRect.top + (offset.y - baseOffset.y),
            left: baseRect.left + (offset.x - baseOffset.x),
            width: baseRect.width,
            height: baseRect.height,
          }}
        >
          <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-on-accent)]">
            <Move size={10} className="mr-1 inline" />
            {Math.round(offset.x)}, {Math.round(offset.y)}
          </span>
        </div>
      ) : null}

      {target ? (
        <div
          data-inspector
          className="fixed right-5 top-20 z-[102] w-[330px] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                Selected
              </div>
              <div className="truncate text-sm font-medium">{target.label}</div>
            </div>
            <button
              type="button"
              onClick={close}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <Field label="Change">
              <div className="space-y-1">
                {scopeOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs " +
                      (opt.ok
                        ? "cursor-pointer hover:bg-[var(--color-bg-hover)]"
                        : "opacity-40 cursor-not-allowed")
                    }
                  >
                    <input
                      type="radio"
                      name="style-scope"
                      checked={scope === opt.value}
                      disabled={!opt.ok}
                      onChange={() => setScope(opt.value)}
                    />
                    <span className="flex-1">{opt.label}</span>
                    <span className="text-[10px] text-[var(--color-text-subtle)]">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </Field>

            {scope === "token" ? (
              <Field label="Token">
                <select
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 text-xs"
                >
                  {THEME_TOKENS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">
                  Applies to light and dark together.
                </p>
              </Field>
            ) : null}

            {scope !== "token" ? (
              <Field label="Position">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-2">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--color-text-muted)]">
                      Drag the dashed box, or nudge:
                    </span>
                    <span className="font-mono text-[var(--color-text-subtle)]">
                      {Math.round(offset.x)}, {Math.round(offset.y)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="grid grid-cols-3 gap-0.5">
                      <span />
                      <Nudge label="↑" onClick={() => setOffset((o) => ({ ...o, y: o.y - 1 }))} />
                      <span />
                      <Nudge label="←" onClick={() => setOffset((o) => ({ ...o, x: o.x - 1 }))} />
                      <span />
                      <Nudge label="→" onClick={() => setOffset((o) => ({ ...o, x: o.x + 1 }))} />
                      <span />
                      <Nudge label="↓" onClick={() => setOffset((o) => ({ ...o, y: o.y + 1 }))} />
                      <span />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOffset({ x: 0, y: 0 })}
                      className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    >
                      Reset position
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--color-text-subtle)]">
                    Arrow keys nudge 1px · hold Shift for 10px
                  </p>
                </div>
              </Field>
            ) : null}

            <ColorField
              label={scope === "token" ? "Token value" : "Text"}
              value={styles.color ?? ""}
              onChange={(v) => set("color", v)}
            />

            {scope !== "token" ? (
              <>
                <ColorField
                  label="Background"
                  value={styles.backgroundColor ?? ""}
                  onChange={(v) => set("backgroundColor", v)}
                />

                {ratio !== null ? (
                  <div
                    className={
                      "rounded-lg px-2 py-1.5 text-[10px] " +
                      (ratio >= 4.5
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                        : "bg-red-500/10 text-red-400")
                    }
                  >
                    Contrast {ratio.toFixed(1)}:1 —{" "}
                    {ratio >= 4.5 ? "readable" : "too low, hard to read"}
                  </div>
                ) : null}

                <ColorField
                  label="Border"
                  value={styles.borderColor ?? ""}
                  onChange={(v) => set("borderColor", v)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Border width">
                    <UnitInput value={styles.borderWidth ?? ""} onChange={(v) => set("borderWidth", v)} />
                  </Field>
                  <Field label="Corner radius">
                    <UnitInput value={styles.borderRadius ?? ""} onChange={(v) => set("borderRadius", v)} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Font size">
                    <UnitInput value={styles.fontSize ?? ""} onChange={(v) => set("fontSize", v)} />
                  </Field>
                  <Field label="Weight">
                    <select
                      value={styles.fontWeight ?? ""}
                      onChange={(e) => set("fontWeight", e.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Unchanged</option>
                      <option value="400">Normal</option>
                      <option value="500">Medium</option>
                      <option value="600">Semibold</option>
                      <option value="700">Bold</option>
                      <option value="800">Extra bold</option>
                    </select>
                  </Field>
                </div>

                <Field label="Font">
                  <select
                    value={styles.fontFamily ?? ""}
                    onChange={(e) => set("fontFamily", e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 text-xs"
                  >
                    {FONT_STACKS.map((f) => (
                      <option key={f.label} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Letter case">
                  <select
                    value={styles.textTransform ?? ""}
                    onChange={(e) => set("textTransform", e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 text-xs"
                  >
                    <option value="">Unchanged</option>
                    <option value="none">Normal</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="capitalize">Capitalize</option>
                    <option value="lowercase">lowercase</option>
                  </select>
                </Field>
              </>
            ) : null}
          </div>

          {note ? (
            <div className="px-4 pb-2 text-[11px] text-[var(--color-text-muted)]">{note}</div>
          ) : null}

          <div className="space-y-2 border-t border-[var(--color-border)] px-4 py-3">
            <button
              type="button"
              disabled={!draft || busy}
              onClick={save}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-accent)] disabled:opacity-40"
            >
              <Check size={14} /> Save — goes live
            </button>

            {/* The checkpoint button: locks in everything currently applied so
                later experiments can always be rolled back to this point. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => run(setStyleDefaultAction, "Saved as your default.")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)] disabled:opacity-40"
            >
              <BookmarkCheck size={14} /> Set as default
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(resetStyleToDefaultAction, "Back to your default.")}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2 py-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
              >
                <RotateCcw size={12} /> Reset
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(restoreOriginalStylesAction, "Original design restored.")}
                className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
              >
                Restore original
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// --- small field primitives -------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
        />
        <input
          type="text"
          value={value}
          placeholder="unchanged"
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 font-mono text-xs"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            title="Leave unchanged"
            className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
    </Field>
  );
}

function Nudge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-6 w-6 rounded border border-[var(--color-border)] text-[11px] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
    >
      {label}
    </button>
  );
}

/** Number input that stores a px string, blank meaning "leave alone". */
function UnitInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      placeholder="unchanged"
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (!raw) return onChange("");
        onChange(/^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw);
      }}
      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5 text-xs"
    />
  );
}
