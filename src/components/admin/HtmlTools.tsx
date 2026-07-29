"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

// Admin-only HTML previewer + WYSIWYG editor + downloader. Paste, upload, or drop
// HTML and the live preview is immediately editable — type in it, restyle it,
// drop in images and links — and every change writes straight back to the code.
// No network or server round-trip: everything happens in the browser.
//
// The preview is always editable, which forces the sandbox: designMode needs
// contentDocument access, so the frame gets allow-same-origin. That means
// allow-scripts must never be added — the pair would let pasted markup script
// the admin app itself. Scripts in the previewed page therefore never run here;
// they're still preserved in the code and in the download.
const SANDBOX = "allow-same-origin";

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
  <p>Click this sentence and start typing — the code on the left updates as you go.</p>
</body>
</html>`;

// Chromium-only screen colour sampler. Feature-detected before use.
type EyeDropperInstance = { open: () => Promise<{ sRGBHex: string }> };
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperInstance;
  }
}

function toHex(color: string, fallback: string) {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

export default function HtmlTools() {
  const [html, setHtml] = useState(STARTER);
  // What the frame is seeded with. Only changes on a deliberate reseed — driving
  // srcDoc off `html` would reload the document on every keystroke and yank the
  // cursor out of the preview.
  const [seed, setSeed] = useState(STARTER);
  const [frameKey, setFrameKey] = useState(0);
  const [filename, setFilename] = useState("page.html");
  const [status, setStatus] = useState<Status>("synced");
  const [fontColor, setFontColor] = useState("#16202a");
  const [markerColor, setMarkerColor] = useState("#ffe27a");
  const [sizePx, setSizePx] = useState(16);
  const [dropping, setDropping] = useState(false);
  // Chromium-only, and absent during SSR — read it as an external value so the
  // server and first client render agree.
  const hasEyeDropper = useSyncExternalStore(
    () => () => {},
    () => typeof window.EyeDropper === "function",
    () => false,
  );
  // Set while an <img> in the preview is selected, which reveals its controls.
  const [imageWidth, setImageWidth] = useState<number | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const savedRange = useRef<Range | null>(null);
  const selectedImage = useRef<HTMLImageElement | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    },
    [],
  );

  const frameDoc = () => frame.current?.contentDocument ?? null;

  // Read the frame back out as a complete HTML document. The selection outline we
  // paint on a clicked image is ours, not the user's — drop it while serializing
  // so it never reaches the code pane or the download.
  const serialize = useCallback(() => {
    const doc = frameDoc();
    if (!doc?.documentElement) return null;
    const marked = selectedImage.current;
    marked?.style.removeProperty("outline");
    const type = doc.doctype;
    const prefix = type
      ? `<!DOCTYPE ${type.name}${type.publicId ? ` PUBLIC "${type.publicId}"` : ""}${
          type.systemId ? `${type.publicId ? "" : " SYSTEM"} "${type.systemId}"` : ""
        }>\n`
      : "";
    const out = prefix + doc.documentElement.outerHTML;
    if (marked) marked.style.outline = "2px solid #3f8e84";
    return out;
  }, []);

  // Preview -> code. Deliberately leaves `seed` alone so the frame isn't reloaded
  // out from under the cursor.
  const syncFromFrame = useCallback(() => {
    const next = serialize();
    if (next === null) return;
    setHtml(next);
    setStatus("synced");
  }, [serialize]);

  // Track the caret so toolbar clicks (which blur the frame) can restore it, and
  // mirror the selection's own font size / colour back into the rail.
  const rememberSelection = useCallback(() => {
    const doc = frameDoc();
    const sel = doc?.getSelection();
    if (!doc || !sel?.rangeCount) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();

    const node = sel.anchorNode;
    const el = (node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | null;
    if (!el) return;
    const style = frame.current?.contentWindow?.getComputedStyle(el);
    if (!style) return;
    const px = Math.round(parseFloat(style.fontSize));
    if (Number.isFinite(px)) setSizePx(px);
    setFontColor((prev) => toHex(style.color, prev));
  }, []);

  function selectImage(img: HTMLImageElement | null) {
    selectedImage.current?.style.removeProperty("outline");
    selectedImage.current = img;
    if (!img) {
      setImageWidth(null);
      return;
    }
    img.style.outline = "2px solid #3f8e84";
    setImageWidth(Math.round(img.getBoundingClientRect().width) || null);
  }

  // Wire up designMode once the seeded document has parsed.
  function onFrameLoad() {
    const doc = frameDoc();
    if (!doc) return;
    doc.designMode = "on";
    doc.execCommand("styleWithCSS", false, "true"); // inline styles, not <font> tags
    doc.addEventListener("input", () => {
      setStatus("editing");
      syncFromFrame();
    });
    doc.addEventListener("selectionchange", rememberSelection);
    doc.addEventListener("mouseup", rememberSelection);
    doc.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      selectImage(target?.tagName === "IMG" ? (target as HTMLImageElement) : null);
    });
    frame.current?.contentWindow?.focus();
  }

  // Put the caret back where it was, since clicking a control blurs the frame.
  function focusSelection() {
    const doc = frameDoc();
    if (!doc) return null;
    frame.current?.contentWindow?.focus();
    const sel = doc.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    return doc;
  }

  // Run a formatting command against the current selection.
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
  function applyFontSize(px: number) {
    const doc = focusSelection();
    if (!doc || !Number.isFinite(px)) return;
    const size = Math.min(400, Math.max(1, Math.round(px)));
    setSizePx(size); // the stepper buttons drive this, so reflect it right away

    // Re-styling text we already sized: just update the span in place, so
    // stepping the control doesn't nest a new wrapper on every click.
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
      // user pressed Escape — nothing to do
    }
  }

  function insertLink() {
    const doc = frameDoc();
    if (!doc) return;
    const selected = savedRange.current?.toString() ?? "";
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    const safe = /^(https?:|mailto:|tel:|#|\/)/i.test(url) ? url : `https://${url}`;
    if (selected) exec("createLink", safe);
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
    e.target.value = ""; // allow re-picking the same file
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

  function resizeImage(px: number) {
    const img = selectedImage.current;
    if (!img || !Number.isFinite(px)) return;
    const width = Math.max(8, Math.round(px));
    img.style.width = `${width}px`;
    img.style.height = "auto";
    setImageWidth(width);
    syncFromFrame();
  }

  function alignImage(value: "left" | "center" | "right") {
    const img = selectedImage.current;
    if (!img) return;
    img.style.display = value === "center" ? "block" : "inline";
    img.style.float = value === "center" ? "none" : value;
    img.style.margin = value === "center" ? "12px auto" : "12px";
    syncFromFrame();
  }

  function removeImage() {
    const img = selectedImage.current;
    if (!img) return;
    selectImage(null);
    img.remove();
    syncFromFrame();
  }

  // Point the preview at `next`, remounting the frame so designMode re-arms.
  const reseed = useCallback((next: string) => {
    setSeed(next);
    savedRange.current = null;
    selectedImage.current = null;
    setImageWidth(null);
    setFrameKey((k) => k + 1);
    setStatus(next.trim() ? "synced" : "idle");
  }, []);

  function onSourceChange(next: string) {
    setHtml(next);
    setStatus(next.trim() ? "typing" : "idle");
    // Typing in the code pane wins: re-render the preview once typing settles.
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

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropping(false);
    const file = e.dataTransfer.files?.[0];
    if (file) load(await file.text(), file.name);
  }

  const empty = !html.trim();

  const pane =
    "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-[var(--color-bg)] transition-colors";
  const bar =
    "flex min-h-[46px] flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2";
  const label =
    "font-mono text-[10.5px] uppercase tracking-[0.13em] text-[var(--color-text-muted)]";
  const tool =
    "inline-grid h-[30px] min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs leading-none text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]";
  const picker =
    "h-[30px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-border-strong)]";
  const numeric = `${picker} w-14 text-center font-mono`;
  const well =
    "relative inline-grid h-[30px] w-[30px] place-items-center overflow-hidden rounded-md border border-[var(--color-border)]";
  const wellInput =
    "absolute -inset-2 h-[150%] w-[150%] cursor-pointer border-0 bg-transparent p-0";
  const divider = "mx-1 h-5 w-px bg-[var(--color-border)]";
  const stop = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ---------------- source ---------------- */}
        <section
          className={`${pane} ${dropping ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
        >
          <div className={bar}>
            <span className={`${label} mr-auto`}>Code</span>
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
          </div>

          <textarea
            value={html}
            onChange={(e) => onSourceChange(e.target.value)}
            spellCheck={false}
            placeholder="Paste or type HTML here, or drop a .html file…"
            className="min-h-[460px] w-full flex-1 resize-y border-0 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          />
        </section>

        {/* ---------------- preview ---------------- */}
        <section className={`${pane} border-[var(--color-border)]`}>
          <div className={bar}>
            <span className={`${label} mr-auto`}>Live preview — editable</span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-[var(--color-accent)]">
              Click anywhere and type
            </span>
          </div>

          {/* Formatting rail */}
          <div
            role="toolbar"
            aria-label="Formatting"
            className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2"
          >
            <button type="button" className={`${tool} font-bold`} title="Bold" onMouseDown={stop} onClick={() => exec("bold")}>
              B
            </button>
            <button type="button" className={`${tool} font-serif italic`} title="Italic" onMouseDown={stop} onClick={() => exec("italic")}>
              I
            </button>
            <button type="button" className={`${tool} underline`} title="Underline" onMouseDown={stop} onClick={() => exec("underline")}>
              U
            </button>
            <button type="button" className={`${tool} line-through`} title="Strikethrough" onMouseDown={stop} onClick={() => exec("strikeThrough")}>
              S
            </button>

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
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
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
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* exact px size */}
            <span className="inline-flex items-center gap-1">
              <button type="button" className={tool} title="Smaller" onMouseDown={stop} onClick={() => applyFontSize(sizePx - 1)}>
                −
              </button>
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
              <button type="button" className={tool} title="Larger" onMouseDown={stop} onClick={() => applyFontSize(sizePx + 1)}>
                +
              </button>
            </span>

            <span aria-hidden="true" className={divider} />

            {/* colour: full wheel via the OS picker, plus a screen eyedropper */}
            <label className={well} title="Text colour">
              <span className="pointer-events-none absolute bottom-0.5 text-[9px] font-bold leading-none">
                A
              </span>
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
              title={
                hasEyeDropper
                  ? "Eyedropper — sample any colour on screen for the text"
                  : "Eyedropper needs Chrome or Edge"
              }
              disabled={!hasEyeDropper}
              onMouseDown={stop}
              onClick={() =>
                pickColor((hex) => {
                  setFontColor(hex);
                  exec("foreColor", hex);
                })
              }
            >
              ⌖
            </button>

            <span aria-hidden="true" className={divider} />

            {/* insert */}
            <button type="button" className={tool} title="Insert link" onMouseDown={stop} onClick={insertLink}>
              🔗
            </button>
            <button type="button" className={tool} title="Remove link" onMouseDown={stop} onClick={() => exec("unlink")}>
              ⛓
            </button>
            <button
              type="button"
              className={tool}
              title="Insert image from a file (embedded in the HTML)"
              onMouseDown={stop}
              onClick={() => imageInput.current?.click()}
            >
              🖼
            </button>
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              onChange={onInsertImageFile}
              className="hidden"
            />
            <button type="button" className={tool} title="Insert image from a URL" onMouseDown={stop} onClick={insertImageUrl}>
              🌐
            </button>
            <button type="button" className={tool} title="Horizontal rule" onMouseDown={stop} onClick={() => exec("insertHorizontalRule")}>
              ―
            </button>

            <span aria-hidden="true" className={divider} />

            {/* layout */}
            <button type="button" className={tool} title="Align left" onMouseDown={stop} onClick={() => exec("justifyLeft")}>
              ⇤
            </button>
            <button type="button" className={tool} title="Align centre" onMouseDown={stop} onClick={() => exec("justifyCenter")}>
              ↔
            </button>
            <button type="button" className={tool} title="Align right" onMouseDown={stop} onClick={() => exec("justifyRight")}>
              ⇥
            </button>
            <button type="button" className={tool} title="Bulleted list" onMouseDown={stop} onClick={() => exec("insertUnorderedList")}>
              •
            </button>
            <button type="button" className={tool} title="Numbered list" onMouseDown={stop} onClick={() => exec("insertOrderedList")}>
              1.
            </button>
            <button type="button" className={tool} title="Outdent" onMouseDown={stop} onClick={() => exec("outdent")}>
              ⇤|
            </button>
            <button type="button" className={tool} title="Indent" onMouseDown={stop} onClick={() => exec("indent")}>
              |⇥
            </button>

            <span aria-hidden="true" className={divider} />

            <button type="button" className={tool} title="Clear formatting" onMouseDown={stop} onClick={() => exec("removeFormat")}>
              ⌫
            </button>
            <button type="button" className={tool} title="Undo" onMouseDown={stop} onClick={() => exec("undo")}>
              ↺
            </button>
            <button type="button" className={tool} title="Redo" onMouseDown={stop} onClick={() => exec("redo")}>
              ↻
            </button>
          </div>

          {/* Image rail — appears when an image in the preview is clicked */}
          {imageWidth !== null && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2">
              <span className={label}>Image</span>
              <input
                type="number"
                min={8}
                value={imageWidth}
                aria-label="Image width in pixels"
                className={numeric}
                onChange={(e) => setImageWidth(Number(e.target.value))}
                onBlur={() => resizeImage(imageWidth)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    resizeImage(imageWidth);
                  }
                }}
              />
              <span className={label}>px wide</span>
              <button type="button" className={tool} title="Float left" onMouseDown={stop} onClick={() => alignImage("left")}>
                ⇤
              </button>
              <button type="button" className={tool} title="Centre" onMouseDown={stop} onClick={() => alignImage("center")}>
                ↔
              </button>
              <button type="button" className={tool} title="Float right" onMouseDown={stop} onClick={() => alignImage("right")}>
                ⇥
              </button>
              <button type="button" className={`${tool} text-[#c0392b]`} title="Delete image" onMouseDown={stop} onClick={removeImage}>
                Delete
              </button>
              <button type="button" className={`${tool} ml-auto`} title="Deselect" onMouseDown={stop} onClick={() => selectImage(null)}>
                Done
              </button>
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
            Click any text and type; select text first to restyle it. Click an image to resize,
            align, or delete it. Scripts in the page don&apos;t run while it&apos;s editable, but
            they stay in the code and in the download.
          </p>
        </section>
      </div>

      {/* ---------------- footer ---------------- */}
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
