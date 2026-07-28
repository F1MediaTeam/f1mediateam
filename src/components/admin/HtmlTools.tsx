"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui";

// Admin-only HTML previewer + editor + downloader. Paste or upload HTML, see it
// render live, optionally edit it straight in the preview, then download it as a
// .html file. No network or server round-trip — everything happens in the browser.
//
// Two preview modes, and the sandbox differs between them on purpose:
//
//   "preview"  scripts run, but the frame has no same-origin access, so pasted
//              HTML can never reach the admin app's cookies or DOM.
//   "edit"     we need contentDocument access to turn on designMode, which means
//              allow-same-origin — so allow-scripts is dropped. Untrusted markup
//              gets no way to execute while it can see our origin.
//
// Never grant allow-scripts and allow-same-origin together here: that combination
// lets the previewed document script the admin app itself.
const SANDBOX = {
  preview: "allow-scripts allow-modals allow-forms allow-popups",
  edit: "allow-same-origin",
} as const;

type Mode = keyof typeof SANDBOX;

const SWATCHES = [
  { hex: "#0f172a", label: "Near black" },
  { hex: "#5a6573", label: "Grey" },
  { hex: "#3f8e84", label: "Brand teal" },
  { hex: "#dc2626", label: "Red" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#2563eb", label: "Blue" },
  { hex: "#7c3aed", label: "Violet" },
  { hex: "#ffffff", label: "White" },
];

const BLOCKS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "blockquote", label: "Quote" },
  { value: "pre", label: "Code block" },
];

const SIZES = [
  { value: "1", label: "Tiny" },
  { value: "2", label: "Small" },
  { value: "3", label: "Normal" },
  { value: "5", label: "Large" },
  { value: "7", label: "Huge" },
];

export default function HtmlTools() {
  const [html, setHtml] = useState("");
  const [filename, setFilename] = useState("page.html");
  const [mode, setMode] = useState<Mode>("preview");
  // Bumping this remounts the edit frame, reseeding it from the code pane.
  const [editKey, setEditKey] = useState(0);
  const [color, setColor] = useState("#3f8e84");

  const fileInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // The edit frame is seeded from `seed`, which only changes when we deliberately
  // reseed it — never from the frame's own edits. Driving srcDoc off `html` would
  // reload the document on every keystroke and yank the cursor.
  const [seed, setSeed] = useState("");
  const savedRange = useRef<Range | null>(null);
  const reseedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frameDoc = () => frame.current?.contentDocument ?? null;

  // Read the edit frame back out as a complete HTML document.
  const serialize = useCallback(() => {
    const doc = frameDoc();
    if (!doc?.documentElement) return null;
    const type = doc.doctype;
    const prefix = type
      ? `<!DOCTYPE ${type.name}${type.publicId ? ` PUBLIC "${type.publicId}"` : ""}${
          type.systemId ? `${type.publicId ? "" : " SYSTEM"} "${type.systemId}"` : ""
        }>\n`
      : "";
    return prefix + doc.documentElement.outerHTML;
  }, []);

  const syncFromFrame = useCallback(() => {
    const next = serialize();
    if (next !== null) setHtml(next);
  }, [serialize]);

  const rememberSelection = useCallback(() => {
    const sel = frameDoc()?.getSelection();
    if (sel?.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
  }, []);

  // Wire up designMode once the seeded document has parsed.
  function onEditFrameLoad() {
    const doc = frameDoc();
    if (!doc) return;
    doc.designMode = "on";
    doc.execCommand("styleWithCSS", false, "true"); // inline styles, not <font> tags
    doc.addEventListener("input", syncFromFrame);
    doc.addEventListener("selectionchange", rememberSelection);
    doc.addEventListener("mouseup", rememberSelection);
    frame.current?.contentWindow?.focus();
  }

  // Run a formatting command against the current selection in the edit frame.
  function exec(command: string, value?: string) {
    const doc = frameDoc();
    if (!doc || mode !== "edit") return;

    frame.current?.contentWindow?.focus();
    // Clicking a toolbar control blurs the frame; put the selection back first.
    const sel = doc.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }

    doc.execCommand("styleWithCSS", false, "true");
    doc.execCommand(command, false, value);
    rememberSelection();
    syncFromFrame();
  }

  function toggleMode() {
    if (mode === "edit") {
      syncFromFrame(); // don't lose the last keystroke on the way out
      savedRange.current = null;
      setMode("preview");
      return;
    }
    setSeed(html);
    setEditKey((k) => k + 1);
    setMode("edit");
  }

  function onSourceChange(next: string) {
    setHtml(next);
    if (mode !== "edit") return;
    // Typing in the code pane wins: reseed the editable frame once typing settles.
    if (reseedTimer.current) clearTimeout(reseedTimer.current);
    reseedTimer.current = setTimeout(() => {
      setSeed(next);
      savedRange.current = null;
      setEditKey((k) => k + 1);
    }, 500);
  }

  function download() {
    const current = mode === "edit" ? (serialize() ?? html) : html;
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
    if (!file) return;
    const text = await file.text();
    setHtml(text);
    if (file.name) setFilename(file.name);
    if (mode === "edit") {
      setSeed(text);
      setEditKey((k) => k + 1);
    }
    e.target.value = ""; // allow re-uploading the same file
  }

  function clear() {
    setHtml("");
    setSeed("");
    savedRange.current = null;
    if (mode === "edit") setEditKey((k) => k + 1);
  }

  const editing = mode === "edit";
  const tool =
    "inline-grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs leading-none text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent";
  const picker =
    "h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-border-strong)] disabled:opacity-40";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Editor / source */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
            onClick={clear}
            disabled={!html}
          >
            Clear
          </Button>
        </div>

        <textarea
          value={html}
          onChange={(e) => onSourceChange(e.target.value)}
          spellCheck={false}
          placeholder="Paste or type HTML here…"
          className="h-[420px] w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 font-mono text-xs leading-relaxed outline-none focus:border-[var(--color-border-strong)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="h-10 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 font-mono text-xs outline-none focus:border-[var(--color-border-strong)]"
            aria-label="Download filename"
          />
          <Button variant="primary" size="md" type="button" onClick={download} disabled={!html}>
            Download .html
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
            Live preview
          </div>
          <button
            type="button"
            onClick={toggleMode}
            aria-pressed={editing}
            disabled={!html}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              editing
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                editing ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-subtle)]"
              }`}
            />
            Edit preview
          </button>
        </div>

        {/* Formatting rail — only meaningful while the frame is editable */}
        <div
          role="toolbar"
          aria-label="Formatting"
          className={`flex flex-wrap items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-1.5 ${
            editing ? "" : "opacity-45"
          }`}
        >
          <button type="button" className={`${tool} font-bold`} disabled={!editing} title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>
            B
          </button>
          <button type="button" className={`${tool} font-serif italic`} disabled={!editing} title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>
            I
          </button>
          <button type="button" className={`${tool} underline`} disabled={!editing} title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}>
            U
          </button>
          <button type="button" className={`${tool} line-through`} disabled={!editing} title="Strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("strikeThrough")}>
            S
          </button>

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--color-border)]" />

          <select
            className={picker}
            disabled={!editing}
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
            disabled={!editing}
            value=""
            aria-label="Text size"
            onMouseDown={rememberSelection}
            onChange={(e) => {
              if (e.target.value) exec("fontSize", e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Size…</option>
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--color-border)]" />

          {SWATCHES.map((s) => (
            <button
              key={s.hex}
              type="button"
              title={`Text colour — ${s.label}`}
              aria-label={`Text colour ${s.label}`}
              disabled={!editing}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setColor(s.hex);
                exec("foreColor", s.hex);
              }}
              className="h-5 w-5 rounded-full border border-[var(--color-border-strong)] disabled:opacity-40"
              style={{ background: s.hex }}
            />
          ))}
          <label
            className="relative inline-grid h-8 w-8 place-items-center overflow-hidden rounded-md border border-[var(--color-border)]"
            title="Custom text colour"
          >
            <input
              type="color"
              value={color}
              disabled={!editing}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                setColor(e.target.value);
                exec("foreColor", e.target.value);
              }}
              className="absolute -inset-2 h-[150%] w-[150%] cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed"
            />
          </label>
          <button type="button" className={tool} disabled={!editing} title="Highlight" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("hiliteColor", "#ffe27a")}>
            ▮
          </button>

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--color-border)]" />

          <button type="button" className={tool} disabled={!editing} title="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("removeFormat")}>
            ⌫
          </button>
          <button type="button" className={tool} disabled={!editing} title="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("undo")}>
            ↺
          </button>
          <button type="button" className={tool} disabled={!editing} title="Redo" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("redo")}>
            ↻
          </button>
        </div>

        {editing ? (
          <iframe
            key={`edit-${editKey}`}
            ref={frame}
            title="HTML preview (editable)"
            srcDoc={seed}
            sandbox={SANDBOX.edit}
            onLoad={onEditFrameLoad}
            className="h-[420px] w-full rounded-xl border-2 border-[var(--color-accent)] bg-white"
          />
        ) : (
          <iframe
            key="preview"
            ref={frame}
            title="HTML preview"
            srcDoc={html}
            sandbox={SANDBOX.preview}
            className="h-[420px] w-full rounded-xl border border-[var(--color-border)] bg-white"
          />
        )}

        <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {editing
            ? "Click any text in the preview and type — the code updates as you go. Select text first to recolour or restyle it. Scripts in the page are disabled while editing."
            : "Scripts in the previewed page run here. Turn on Edit preview to type directly into it."}
        </p>
      </div>
    </div>
  );
}
