"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { BLOCK_CATEGORIES, HTML_BLOCKS, type BlockCategory, type HtmlBlock } from "@/lib/html-blocks";

// Admin-only visual HTML editor. Paste, upload, or drop a page; the live preview
// is immediately editable. Type into it, restyle any element through the
// inspector, drag blocks in from the palette, then download the result. No
// network round-trip — everything happens in the browser.
//
// The preview is always editable, which fixes the sandbox: designMode needs
// contentDocument access, so the frame gets allow-same-origin. That means
// allow-scripts must never be added — the pair would let pasted markup script
// the admin app itself. Scripts in the previewed page therefore don't run here;
// they survive untouched in the code and in the download.
const SANDBOX = "allow-same-origin";

// Selection outline and drop indicator live in an injected stylesheet keyed off
// data attributes, never inline styles, so `serialize` can strip every trace of
// the editor by removing one <style> and a couple of attributes.
const CHROME_ID = "__f1-editor-chrome";
const SEL_ATTR = "data-f1-selected";
const DROP_ATTR = "data-f1-drop";
const CHROME_CSS = `
[${SEL_ATTR}]{outline:2px solid #3f8e84 !important;outline-offset:1px !important}
[${DROP_ATTR}]{outline:2px dashed #3f8e84 !important;outline-offset:2px !important}
`;

type Status = "idle" | "typing" | "editing" | "synced";

const STATUS_TEXT: Record<Status, string> = {
  idle: "Empty",
  typing: "Rendering…",
  editing: "Editing…",
  synced: "In sync",
};

const BLOCKS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
  { value: "blockquote", label: "Quote" },
  { value: "pre", label: "Code block" },
];

// Stacks rather than single faces, so the downloaded file still renders sanely
// on a machine that doesn't have the first choice installed.
const FONTS = [
  { value: "'DM Sans', system-ui, sans-serif", label: "DM Sans" },
  { value: "system-ui, -apple-system, sans-serif", label: "System sans" },
  { value: "Georgia, 'Times New Roman', serif", label: "Serif" },
  { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica" },
  { value: "'Courier New', ui-monospace, monospace", label: "Monospace" },
];

const SHADOWS = [
  { value: "none", label: "None" },
  { value: "0 1px 2px rgba(0,0,0,.18)", label: "Subtle" },
  { value: "0 6px 16px -6px rgba(0,0,0,.35)", label: "Soft" },
  { value: "0 18px 40px -18px rgba(0,0,0,.55)", label: "Deep" },
  { value: "0 0 0 1px rgba(63,142,132,.5), 0 0 24px rgba(63,142,132,.35)", label: "Glow" },
];

const GRADIENTS = [
  { value: "linear-gradient(135deg,#3f8e84,#7ce7ff)", label: "Teal → sky" },
  { value: "linear-gradient(135deg,#a78bfa,#ff8fab)", label: "Violet → rose" },
  { value: "linear-gradient(135deg,#0f1620,#1b3a5c)", label: "Midnight" },
  { value: "linear-gradient(135deg,#f6f9fb,#dfe8ee)", label: "Paper" },
  { value: "conic-gradient(from 180deg,#a78bfa,#7ce7ff,#8ef0dc,#a78bfa)", label: "Iridescent" },
];

const STARTER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Untitled page</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px; line-height: 1.6; color: #16202a; }
    h1 { font-size: 28px; margin: 0 0 8px; }
  </style>
</head>
<body>
  <h1>Edit me in the preview</h1>
  <p>Click this sentence and start typing, or drag a block in from the palette.</p>
</body>
</html>`;

// Chromium-only screen colour sampler. Feature-detected before use.
type EyeDropperInstance = { open: () => Promise<{ sRGBHex: string }> };
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperInstance;
  }
}

function toHex(color: string, fallback = "#000000") {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Everything the inspector shows for the selected element. */
interface Box {
  tag: string;
  width: string;
  height: string;
  padding: [string, string, string, string];
  margin: [string, string, string, string];
  background: string;
  color: string;
  borderWidth: string;
  borderStyle: string;
  borderColor: string;
  radius: string;
  shadow: string;
  fontSize: string;
  fontWeight: string;
  textAlign: string;
  display: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  gap: string;
  opacity: string;
}

/** Computed lengths for the number inputs. Anything non-numeric — "normal",
 *  a percentage radius, "auto" — becomes blank rather than an invalid value. */
const px = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "";
};

function readBox(el: HTMLElement, win: Window): Box {
  const cs = win.getComputedStyle(el);
  const inline = el.style;
  // Prefer what's authored inline; fall back to the computed value so the
  // controls open showing what you actually see on screen.
  const pick = (prop: keyof CSSStyleDeclaration, computed: string) =>
    (inline[prop] as string) || computed;

  return {
    tag: el.tagName.toLowerCase(),
    width: inline.width || "",
    height: inline.height || "",
    padding: [
      px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft),
    ],
    margin: [
      px(cs.marginTop), px(cs.marginRight), px(cs.marginBottom), px(cs.marginLeft),
    ],
    background: toHex(cs.backgroundColor, "#ffffff"),
    color: toHex(cs.color, "#000000"),
    borderWidth: px(cs.borderTopWidth) || "0",
    borderStyle: cs.borderTopStyle === "none" ? "solid" : cs.borderTopStyle,
    borderColor: toHex(cs.borderTopColor, "#27333f"),
    radius: px(cs.borderTopLeftRadius) || "0",
    shadow: inline.boxShadow || "none",
    fontSize: px(cs.fontSize),
    fontWeight: pick("fontWeight", cs.fontWeight),
    textAlign: pick("textAlign", cs.textAlign),
    display: pick("display", cs.display),
    flexDirection: pick("flexDirection", cs.flexDirection),
    justifyContent: pick("justifyContent", cs.justifyContent),
    alignItems: pick("alignItems", cs.alignItems),
    gap: px(cs.gap) || "0",
    opacity: cs.opacity || "1",
  };
}

export default function HtmlTools() {
  const [html, setHtml] = useState(STARTER);
  // What the frame is seeded with. Only changes on a deliberate reseed — driving
  // srcDoc off `html` would reload the document on every keystroke.
  const [seed, setSeed] = useState(STARTER);
  const [frameKey, setFrameKey] = useState(0);
  const [filename, setFilename] = useState("page.html");
  const [status, setStatus] = useState<Status>("synced");
  const [leftTab, setLeftTab] = useState<"code" | "blocks">("code");
  const [category, setCategory] = useState<BlockCategory>("Text");
  const [blockQuery, setBlockQuery] = useState("");
  const [fontColor, setFontColor] = useState("#16202a");
  const [markerColor, setMarkerColor] = useState("#ffe27a");
  const [sizePx, setSizePx] = useState(16);
  const [dropping, setDropping] = useState(false);
  const [box, setBox] = useState<Box | null>(null);

  const hasEyeDropper = useSyncExternalStore(
    () => () => {},
    () => typeof window.EyeDropper === "function",
    () => false,
  );

  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const savedRange = useRef<Range | null>(null);
  const selected = useRef<HTMLElement | null>(null);
  const dragBlock = useRef<HtmlBlock | null>(null);
  const dropTarget = useRef<HTMLElement | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    },
    [],
  );

  const frameDoc = () => frame.current?.contentDocument ?? null;
  const frameWin = () => frame.current?.contentWindow ?? null;

  // Read the frame back out as a complete HTML document, with every trace of
  // the editor's own chrome removed first.
  const serialize = useCallback(() => {
    const doc = frameDoc();
    if (!doc?.documentElement) return null;

    const chrome = doc.getElementById(CHROME_ID);
    const sel = doc.querySelector(`[${SEL_ATTR}]`);
    const drop = doc.querySelector(`[${DROP_ATTR}]`);
    chrome?.remove();
    sel?.removeAttribute(SEL_ATTR);
    drop?.removeAttribute(DROP_ATTR);

    const type = doc.doctype;
    const prefix = type
      ? `<!DOCTYPE ${type.name}${type.publicId ? ` PUBLIC "${type.publicId}"` : ""}${
          type.systemId ? `${type.publicId ? "" : " SYSTEM"} "${type.systemId}"` : ""
        }>\n`
      : "";
    const out = prefix + doc.documentElement.outerHTML;

    if (chrome) doc.head?.appendChild(chrome);
    sel?.setAttribute(SEL_ATTR, "");
    drop?.setAttribute(DROP_ATTR, "");
    return out;
  }, []);

  const syncFromFrame = useCallback(() => {
    const next = serialize();
    if (next === null) return;
    setHtml(next);
    setStatus("synced");
  }, [serialize]);

  const refreshBox = useCallback(() => {
    const el = selected.current;
    const win = frameWin();
    if (el && win) setBox(readBox(el, win));
  }, []);

  const select = useCallback(
    (el: HTMLElement | null) => {
      const doc = frameDoc();
      doc?.querySelector(`[${SEL_ATTR}]`)?.removeAttribute(SEL_ATTR);
      selected.current = el;
      if (!el) {
        setBox(null);
        return;
      }
      el.setAttribute(SEL_ATTR, "");
      const win = frameWin();
      if (win) setBox(readBox(el, win));
    },
    [],
  );

  // Track the caret so toolbar clicks (which blur the frame) can restore it, and
  // mirror the selection's own size / colour back into the text rail.
  const rememberSelection = useCallback(() => {
    const doc = frameDoc();
    const sel = doc?.getSelection();
    if (!doc || !sel?.rangeCount) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();

    const node = sel.anchorNode;
    const el = (node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | null;
    const style = el ? frameWin()?.getComputedStyle(el) : null;
    if (!style) return;
    const size = Math.round(parseFloat(style.fontSize));
    if (Number.isFinite(size)) setSizePx(size);
    setFontColor((prev) => toHex(style.color, prev));
  }, []);

  // ---- inserting blocks -------------------------------------------------

  const insertBlockHtml = useCallback(
    (markup: string, at?: HTMLElement | null) => {
      const doc = frameDoc();
      if (!doc?.body) return;
      const holder = doc.createElement("div");
      holder.innerHTML = markup;
      const frag = doc.createDocumentFragment();
      while (holder.firstChild) frag.appendChild(holder.firstChild);
      const first = frag.firstElementChild as HTMLElement | null;

      const anchor = at && at !== doc.body && at !== doc.documentElement ? at : null;
      if (anchor?.parentNode) anchor.parentNode.insertBefore(frag, anchor.nextSibling);
      else doc.body.appendChild(frag);

      if (first) {
        select(first);
        first.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      syncFromFrame();
    },
    [select, syncFromFrame],
  );

  function clearDropMark() {
    dropTarget.current?.removeAttribute(DROP_ATTR);
    dropTarget.current = null;
  }

  // Wire the frame up once its seeded document has parsed.
  function onFrameLoad() {
    const doc = frameDoc();
    if (!doc) return;

    doc.designMode = "on";
    doc.execCommand("styleWithCSS", false, "true"); // inline styles, not <font> tags

    if (!doc.getElementById(CHROME_ID)) {
      const style = doc.createElement("style");
      style.id = CHROME_ID;
      style.textContent = CHROME_CSS;
      doc.head?.appendChild(style);
    }

    doc.addEventListener("input", () => {
      setStatus("editing");
      syncFromFrame();
    });
    doc.addEventListener("selectionchange", rememberSelection);
    doc.addEventListener("mouseup", rememberSelection);
    doc.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.nodeType === 1) select(target);
    });

    // Blocks dragged from the palette land here. designMode would otherwise
    // treat the drop as a text insertion, hence preventDefault on both events.
    doc.addEventListener("dragover", (e) => {
      if (!dragBlock.current) return;
      e.preventDefault();
      const over = doc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (over === dropTarget.current) return;
      clearDropMark();
      if (over && over !== doc.documentElement) {
        over.setAttribute(DROP_ATTR, "");
        dropTarget.current = over;
      }
    });
    doc.addEventListener("dragleave", clearDropMark);
    doc.addEventListener("drop", (e) => {
      const block = dragBlock.current;
      if (!block) return;
      e.preventDefault();
      const over = doc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      clearDropMark();
      dragBlock.current = null;
      insertBlockHtml(block.html, over);
    });

    frameWin()?.focus();
  }

  // ---- text formatting --------------------------------------------------

  function focusSelection() {
    const doc = frameDoc();
    if (!doc) return null;
    frameWin()?.focus();
    const sel = doc.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    return doc;
  }

  function exec(command: string, value?: string) {
    const doc = focusSelection();
    if (!doc) return;
    doc.execCommand("styleWithCSS", false, "true");
    doc.execCommand(command, false, value);
    rememberSelection();
    syncFromFrame();
  }

  // execCommand("fontSize") only speaks the legacy 1–7 scale, so ask it for
  // <font size="7"> tags and rewrite the ones it just made into real px spans.
  function applyFontSize(value: number) {
    const doc = focusSelection();
    if (!doc || !Number.isFinite(value)) return;
    const size = Math.min(400, Math.max(1, Math.round(value)));
    setSizePx(size);

    const range = savedRange.current;
    const host = (
      range?.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range?.commonAncestorContainer.parentElement
    ) as HTMLElement | null;
    const owned = host?.closest("span[data-fs]") as HTMLElement | null;
    if (owned && range && owned.textContent === range.toString()) {
      owned.style.fontSize = `${size}px`;
      syncFromFrame();
      return;
    }

    const before = new Set(doc.querySelectorAll('font[size="7"]'));
    doc.execCommand("styleWithCSS", false, "false");
    doc.execCommand("fontSize", false, "7");
    doc.execCommand("styleWithCSS", false, "true");

    doc.querySelectorAll('font[size="7"]').forEach((node) => {
      if (before.has(node)) return; // pre-existing markup from the pasted page
      const span = doc.createElement("span");
      span.dataset.fs = "";
      span.style.fontSize = `${size}px`;
      while (node.firstChild) span.appendChild(node.firstChild);
      node.replaceWith(span);
    });

    rememberSelection();
    syncFromFrame();
  }

  async function pickColor(apply: (hex: string) => void) {
    if (!window.EyeDropper) return;
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      apply(sRGBHex);
    } catch {
      // Escape pressed — nothing to do
    }
  }

  function insertLink() {
    const selectedText = savedRange.current?.toString() ?? "";
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const safe = /^(https?:|mailto:|tel:|#|\/)/i.test(url) ? url : `https://${url}`;
    if (selectedText) exec("createLink", safe);
    else
      exec(
        "insertHTML",
        `<a href="${safe.replace(/"/g, "&quot;")}">${safe.replace(/[<>&]/g, "")}</a>`,
      );
  }

  function insertImageUrl() {
    const url = window.prompt("Image URL", "https://");
    if (url) exec("insertImage", url);
  }

  async function onInsertImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Inlined as a data URI so the downloaded .html stays self-contained.
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    exec("insertImage", dataUri);
  }

  // ---- element inspector -------------------------------------------------

  function setStyle(prop: string, value: string) {
    const el = selected.current;
    if (!el) return;
    if (value === "") el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
    refreshBox();
    syncFromFrame();
  }

  function setSide(prop: "padding" | "margin", index: number, value: string) {
    const sides = ["top", "right", "bottom", "left"] as const;
    setStyle(`${prop}-${sides[index]}`, value === "" ? "" : `${value}px`);
  }

  function selectParent() {
    const el = selected.current?.parentElement;
    if (el && el.tagName !== "HTML") select(el);
  }

  function duplicateElement() {
    const el = selected.current;
    if (!el?.parentNode) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute(SEL_ATTR);
    el.parentNode.insertBefore(clone, el.nextSibling);
    select(clone);
    syncFromFrame();
  }

  function moveElement(delta: -1 | 1) {
    const el = selected.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const sibling = delta < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!sibling) return;
    if (delta < 0) parent.insertBefore(el, sibling);
    else parent.insertBefore(sibling, el);
    syncFromFrame();
  }

  function removeElement() {
    const el = selected.current;
    if (!el || el.tagName === "BODY") return;
    const parent = el.parentElement;
    select(null);
    el.remove();
    if (parent && parent.tagName !== "HTML") select(parent);
    syncFromFrame();
  }

  // ---- document plumbing -------------------------------------------------

  const reseed = useCallback((next: string) => {
    setSeed(next);
    savedRange.current = null;
    selected.current = null;
    setBox(null);
    setFrameKey((k) => k + 1);
    setStatus(next.trim() ? "synced" : "idle");
  }, []);

  function onSourceChange(next: string) {
    setHtml(next);
    setStatus(next.trim() ? "typing" : "idle");
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => reseed(next), 300);
  }

  function load(next: string, name?: string) {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    setHtml(next);
    if (name) setFilename(name);
    reseed(next);
  }

  function download() {
    const current = serialize() ?? html;
    const name = (filename.trim() || "page.html").replace(/[^\w.-]+/g, "-");
    const withExt = /\.html?$/i.test(name) ? name : `${name}.html`;
    const blob = new Blob([current], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = withExt;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) load(await file.text(), file.name);
    e.target.value = "";
  }

  async function onDropFile(e: React.DragEvent) {
    e.preventDefault();
    setDropping(false);
    const file = e.dataTransfer.files?.[0];
    if (file) load(await file.text(), file.name);
  }

  const empty = !html.trim();
  const shownBlocks = (() => {
    const q = blockQuery.trim().toLowerCase();
    if (q) return HTML_BLOCKS.filter((b) => b.name.toLowerCase().includes(q));
    return HTML_BLOCKS.filter((b) => b.category === category);
  })();

  // ---- styling -----------------------------------------------------------

  const pane =
    "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-[var(--color-bg)] transition-colors";
  const bar =
    "flex min-h-[46px] flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2";
  const label =
    "font-mono text-[10.5px] uppercase tracking-[0.13em] text-[var(--color-text-muted)]";
  const tool =
    "inline-grid h-[30px] min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs leading-none text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40";
  const picker =
    "h-[30px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-border-strong)] disabled:opacity-40";
  const numeric = `${picker} w-[52px] text-center font-mono`;
  const well =
    "relative inline-grid h-[30px] w-[30px] place-items-center overflow-hidden rounded-md border border-[var(--color-border)]";
  const wellInput =
    "absolute -inset-2 h-[150%] w-[150%] cursor-pointer border-0 bg-transparent p-0";
  const divider = "mx-1 h-5 w-px bg-[var(--color-border)]";
  const stop = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ================= left: code / blocks ================= */}
        <section
          className={`${pane} ${dropping ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}
          onDragEnter={(e) => {
            if (dragBlock.current) return; // palette drag, not a file
            e.preventDefault();
            setDropping(true);
          }}
          onDragOver={(e) => {
            if (!dragBlock.current) e.preventDefault();
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDropFile}
        >
          <div className={bar}>
            <div className="mr-auto inline-flex rounded-lg border border-[var(--color-border)] p-0.5">
              {(["code", "blocks"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLeftTab(t)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    leftTab === t
                      ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {leftTab === "code" ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => fileInput.current?.click()}
                >
                  Upload .html
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".html,.htm,text/html"
                  onChange={onUpload}
                  className="hidden"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => load("")}
                  disabled={empty}
                >
                  Clear
                </Button>
              </>
            ) : (
              <span className={label}>{HTML_BLOCKS.length} blocks</span>
            )}
          </div>

          {leftTab === "code" ? (
            <textarea
              value={html}
              onChange={(e) => onSourceChange(e.target.value)}
              spellCheck={false}
              placeholder="Paste or type HTML here, or drop a .html file…"
              className="min-h-[520px] w-full flex-1 resize-y border-0 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
            />
          ) : (
            <div className="flex min-h-[520px] flex-col">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2">
                {BLOCK_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategory(c);
                      setBlockQuery("");
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      category === c && !blockQuery
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <input
                  value={blockQuery}
                  onChange={(e) => setBlockQuery(e.target.value)}
                  placeholder="Search…"
                  className={`${picker} ml-auto w-28`}
                />
              </div>

              <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3">
                {shownBlocks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    draggable
                    title={`${b.hint} — drag onto the preview, or click to append`}
                    onDragStart={(e) => {
                      dragBlock.current = b;
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", b.name);
                    }}
                    onDragEnd={() => {
                      dragBlock.current = null;
                      clearDropMark();
                    }}
                    onClick={() => insertBlockHtml(b.html, selected.current)}
                    className="cursor-grab rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-2.5 text-left transition-colors hover:border-[var(--color-accent)] active:cursor-grabbing"
                  >
                    <div className="truncate text-xs font-medium text-[var(--color-text)]">
                      {b.name}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[var(--color-text-muted)]">
                      {b.hint}
                    </div>
                  </button>
                ))}
                {shownBlocks.length === 0 && (
                  <div className="col-span-2 px-1 py-6 text-center text-xs text-[var(--color-text-subtle)]">
                    No blocks match.
                  </div>
                )}
              </div>

              <p className="border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                Drag a block onto the preview to drop it after whatever you&apos;re hovering, or
                click it to place it after the current selection. Each block is self-contained
                HTML + CSS, so it keeps working in the downloaded file.
              </p>
            </div>
          )}
        </section>

        {/* ================= right: preview ================= */}
        <section className={`${pane} border-[var(--color-border)]`}>
          <div className={bar}>
            <span className={`${label} mr-auto`}>Live preview — editable</span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-[var(--color-accent)]">
              Click any element to style it
            </span>
          </div>

          {/* ---- text rail ---- */}
          <div
            role="toolbar"
            aria-label="Text formatting"
            className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2"
          >
            <button type="button" className={`${tool} font-bold`} title="Bold" onMouseDown={stop} onClick={() => exec("bold")}>B</button>
            <button type="button" className={`${tool} font-serif italic`} title="Italic" onMouseDown={stop} onClick={() => exec("italic")}>I</button>
            <button type="button" className={`${tool} underline`} title="Underline" onMouseDown={stop} onClick={() => exec("underline")}>U</button>
            <button type="button" className={`${tool} line-through`} title="Strikethrough" onMouseDown={stop} onClick={() => exec("strikeThrough")}>S</button>

            <span aria-hidden="true" className={divider} />

            <select
              className={picker}
              value=""
              aria-label="Text style"
              onMouseDown={rememberSelection}
              onChange={(e) => {
                if (e.target.value) exec("formatBlock", `<${e.target.value}>`);
                e.target.value = "";
              }}
            >
              <option value="">Style…</option>
              {BLOCKS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>

            <select
              className={picker}
              value=""
              aria-label="Font"
              onMouseDown={rememberSelection}
              onChange={(e) => {
                if (e.target.value) exec("fontName", e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Font…</option>
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>

            <span className="inline-flex items-center gap-1">
              <button type="button" className={tool} title="Smaller" onMouseDown={stop} onClick={() => applyFontSize(sizePx - 1)}>−</button>
              <input
                type="number"
                min={1}
                max={400}
                value={sizePx}
                aria-label="Font size in pixels"
                className={numeric}
                onMouseDown={rememberSelection}
                onChange={(e) => setSizePx(Number(e.target.value))}
                onBlur={() => applyFontSize(sizePx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFontSize(sizePx);
                  }
                }}
              />
              <span className={label}>px</span>
              <button type="button" className={tool} title="Larger" onMouseDown={stop} onClick={() => applyFontSize(sizePx + 1)}>+</button>
            </span>

            <span aria-hidden="true" className={divider} />

            <label className={well} title="Text colour">
              <span className="pointer-events-none absolute bottom-0.5 text-[9px] font-bold leading-none">A</span>
              <input
                type="color"
                value={fontColor}
                aria-label="Text colour"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setFontColor(e.target.value);
                  exec("foreColor", e.target.value);
                }}
                className={wellInput}
              />
            </label>
            <label className={well} title="Highlight colour">
              <input
                type="color"
                value={markerColor}
                aria-label="Highlight colour"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setMarkerColor(e.target.value);
                  exec("hiliteColor", e.target.value);
                }}
                className={wellInput}
              />
            </label>
            <button
              type="button"
              className={tool}
              title={hasEyeDropper ? "Eyedropper — sample any colour on screen" : "Eyedropper needs Chrome or Edge"}
              disabled={!hasEyeDropper}
              onMouseDown={stop}
              onClick={() => pickColor((hex) => { setFontColor(hex); exec("foreColor", hex); })}
            >
              ⌖
            </button>

            <span aria-hidden="true" className={divider} />

            <button type="button" className={tool} title="Insert link" onMouseDown={stop} onClick={insertLink}>🔗</button>
            <button type="button" className={tool} title="Remove link" onMouseDown={stop} onClick={() => exec("unlink")}>⛓</button>
            <button type="button" className={tool} title="Insert image from a file" onMouseDown={stop} onClick={() => imageInput.current?.click()}>🖼</button>
            <input ref={imageInput} type="file" accept="image/*" onChange={onInsertImageFile} className="hidden" />
            <button type="button" className={tool} title="Insert image from a URL" onMouseDown={stop} onClick={insertImageUrl}>🌐</button>
            <button type="button" className={tool} title="Horizontal rule" onMouseDown={stop} onClick={() => exec("insertHorizontalRule")}>―</button>

            <span aria-hidden="true" className={divider} />

            <button type="button" className={tool} title="Align left" onMouseDown={stop} onClick={() => exec("justifyLeft")}>⇤</button>
            <button type="button" className={tool} title="Align centre" onMouseDown={stop} onClick={() => exec("justifyCenter")}>↔</button>
            <button type="button" className={tool} title="Align right" onMouseDown={stop} onClick={() => exec("justifyRight")}>⇥</button>
            <button type="button" className={tool} title="Bulleted list" onMouseDown={stop} onClick={() => exec("insertUnorderedList")}>•</button>
            <button type="button" className={tool} title="Numbered list" onMouseDown={stop} onClick={() => exec("insertOrderedList")}>1.</button>

            <span aria-hidden="true" className={divider} />

            <button type="button" className={tool} title="Clear formatting" onMouseDown={stop} onClick={() => exec("removeFormat")}>⌫</button>
            <button type="button" className={tool} title="Undo" onMouseDown={stop} onClick={() => exec("undo")}>↺</button>
            <button type="button" className={tool} title="Redo" onMouseDown={stop} onClick={() => exec("redo")}>↻</button>
          </div>

          {/* ---- element inspector ---- */}
          {box && (
            <div className="max-h-[300px] space-y-2.5 overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-accent)]">
                  &lt;{box.tag}&gt;
                </span>
                <button type="button" className={tool} title="Select parent element" onMouseDown={stop} onClick={selectParent}>↰ Parent</button>
                <button type="button" className={tool} title="Move up" onMouseDown={stop} onClick={() => moveElement(-1)}>↑</button>
                <button type="button" className={tool} title="Move down" onMouseDown={stop} onClick={() => moveElement(1)}>↓</button>
                <button type="button" className={tool} title="Duplicate" onMouseDown={stop} onClick={duplicateElement}>⧉</button>
                <button type="button" className={`${tool} text-[#c0392b]`} title="Delete element" onMouseDown={stop} onClick={removeElement}>Delete</button>
                <button type="button" className={`${tool} ml-auto`} title="Deselect" onMouseDown={stop} onClick={() => select(null)}>Done</button>
              </div>

              {/* size */}
              <Row label="Size">
                <input className={`${picker} w-20 font-mono`} placeholder="width" value={box.width}
                  onChange={(e) => setStyle("width", e.target.value)} aria-label="Width" />
                <input className={`${picker} w-20 font-mono`} placeholder="height" value={box.height}
                  onChange={(e) => setStyle("height", e.target.value)} aria-label="Height" />
                <span className="text-[10.5px] text-[var(--color-text-subtle)]">px, %, rem, auto</span>
              </Row>

              {/* padding / margin */}
              <Row label="Padding">
                {box.padding.map((v, i) => (
                  <input key={i} type="number" className={numeric} value={v}
                    aria-label={`Padding ${["top", "right", "bottom", "left"][i]}`}
                    onChange={(e) => setSide("padding", i, e.target.value)} />
                ))}
                <span className="text-[10.5px] text-[var(--color-text-subtle)]">T R B L</span>
              </Row>
              <Row label="Margin">
                {box.margin.map((v, i) => (
                  <input key={i} type="number" className={numeric} value={v}
                    aria-label={`Margin ${["top", "right", "bottom", "left"][i]}`}
                    onChange={(e) => setSide("margin", i, e.target.value)} />
                ))}
                <span className="text-[10.5px] text-[var(--color-text-subtle)]">T R B L</span>
              </Row>

              {/* background + text colour */}
              <Row label="Fill">
                <label className={well} title="Background colour">
                  <input type="color" value={box.background} aria-label="Background colour"
                    onChange={(e) => setStyle("background-color", e.target.value)} className={wellInput} />
                </label>
                <button type="button" className={tool} title="Sample a background colour from screen"
                  disabled={!hasEyeDropper} onMouseDown={stop}
                  onClick={() => pickColor((hex) => setStyle("background-color", hex))}>⌖</button>
                <select className={picker} value="" aria-label="Gradient"
                  onChange={(e) => { if (e.target.value) setStyle("background-image", e.target.value); e.target.value = ""; }}>
                  <option value="">Gradient…</option>
                  {GRADIENTS.map((g) => <option key={g.label} value={g.value}>{g.label}</option>)}
                </select>
                <button type="button" className={tool} title="Remove background image"
                  onMouseDown={stop} onClick={() => setStyle("background-image", "")}>✕ bg</button>
                <label className={well} title="Text colour">
                  <span className="pointer-events-none absolute bottom-0.5 text-[9px] font-bold leading-none">A</span>
                  <input type="color" value={box.color} aria-label="Element text colour"
                    onChange={(e) => setStyle("color", e.target.value)} className={wellInput} />
                </label>
              </Row>

              {/* border */}
              <Row label="Border">
                <input type="number" className={numeric} value={box.borderWidth} aria-label="Border width"
                  onChange={(e) => {
                    setStyle("border-width", `${e.target.value || 0}px`);
                    setStyle("border-style", box.borderStyle || "solid");
                  }} />
                <select className={picker} value={box.borderStyle} aria-label="Border style"
                  onChange={(e) => setStyle("border-style", e.target.value)}>
                  {["solid", "dashed", "dotted", "double", "none"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <label className={well} title="Border colour">
                  <input type="color" value={box.borderColor} aria-label="Border colour"
                    onChange={(e) => setStyle("border-color", e.target.value)} className={wellInput} />
                </label>
                <span className={label}>Radius</span>
                <input type="number" className={numeric} value={box.radius} aria-label="Corner radius"
                  onChange={(e) => setStyle("border-radius", `${e.target.value || 0}px`)} />
              </Row>

              {/* layout */}
              <Row label="Layout">
                <select className={picker} value={box.display} aria-label="Display"
                  onChange={(e) => setStyle("display", e.target.value)}>
                  {["block", "inline", "inline-block", "flex", "inline-flex", "grid", "none"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {(box.display === "flex" || box.display === "inline-flex") && (
                  <>
                    <select className={picker} value={box.flexDirection} aria-label="Flex direction"
                      onChange={(e) => setStyle("flex-direction", e.target.value)}>
                      {["row", "row-reverse", "column", "column-reverse"].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select className={picker} value={box.justifyContent} aria-label="Justify content"
                      onChange={(e) => setStyle("justify-content", e.target.value)}>
                      {["flex-start", "center", "flex-end", "space-between", "space-around"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <select className={picker} value={box.alignItems} aria-label="Align items"
                      onChange={(e) => setStyle("align-items", e.target.value)}>
                      {["stretch", "flex-start", "center", "flex-end", "baseline"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <span className={label}>Gap</span>
                    <input type="number" className={numeric} value={box.gap} aria-label="Gap"
                      onChange={(e) => setStyle("gap", `${e.target.value || 0}px`)} />
                  </>
                )}
              </Row>

              {/* finish */}
              <Row label="Finish">
                <select className={picker} value={box.shadow} aria-label="Shadow"
                  onChange={(e) => setStyle("box-shadow", e.target.value === "none" ? "" : e.target.value)}>
                  {SHADOWS.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
                </select>
                <span className={label}>Opacity</span>
                <input type="range" min={0} max={100} value={Math.round(Number(box.opacity) * 100)}
                  aria-label="Opacity" className="h-[30px] w-24 accent-[var(--color-accent)]"
                  onChange={(e) => setStyle("opacity", String(Number(e.target.value) / 100))} />
                <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
                  {Math.round(Number(box.opacity) * 100)}%
                </span>
                <button type="button" className={tool} title="Strip every inline style from this element"
                  onMouseDown={stop}
                  onClick={() => { selected.current?.removeAttribute("style"); refreshBox(); syncFromFrame(); }}>
                  Reset styles
                </button>
              </Row>
            </div>
          )}

          <div className="relative bg-white">
            <iframe
              key={frameKey}
              ref={frame}
              title="HTML preview (editable)"
              srcDoc={seed}
              sandbox={SANDBOX}
              onLoad={onFrameLoad}
              className="block h-[620px] w-full border-0 bg-white"
            />
            {empty && (
              <div className="pointer-events-none absolute inset-0 grid place-content-center px-6 text-center text-[13.5px] text-[#8496a3]">
                Nothing to preview yet
              </div>
            )}
          </div>

          <p className="border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
            Click any element to select it — the inspector above edits its box, background, border,
            and layout. Click text and type to rewrite it. Scripts in the page don&apos;t run while
            it&apos;s editable, but they stay in the code and in the download.
          </p>
        </section>
      </div>

      {/* ================= footer ================= */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          className="h-10 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 font-mono text-xs outline-none focus:border-[var(--color-border-strong)]"
          aria-label="Download filename"
        />
        <Button variant="primary" size="md" type="button" onClick={download} disabled={empty}>
          Download .html
        </Button>
        <span
          className={`ml-auto inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider ${
            status === "synced"
              ? "text-[var(--color-accent)]"
              : status === "idle"
                ? "text-[var(--color-text-muted)]"
                : "text-[#b3541e]"
          }`}
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] rounded-full ${
              status === "synced"
                ? "bg-[var(--color-accent)]"
                : status === "idle"
                  ? "bg-[var(--color-text-muted)]"
                  : "bg-[#b3541e]"
            }`}
          />
          {STATUS_TEXT[status]}
        </span>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.13em] text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}
