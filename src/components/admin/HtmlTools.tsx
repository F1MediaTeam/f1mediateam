"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

// Admin-only HTML previewer + editor + downloader. Paste, upload, or drop HTML,
// see it render live, optionally type straight into the preview, then download
// the result. No network or server round-trip — everything happens in-browser.
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
type Status = "idle" | "typing" | "editing" | "synced";

const STATUS_TEXT: Record<Status, string> = {
  idle: "Empty",
  typing: "Rendering…",
  editing: "Editing…",
  synced: "In sync",
};

const SWATCHES = [
  { hex: "#16202a", label: "Near black" },
  { hex: "#5d6e7c", label: "Grey" },
  { hex: "#c0392b", label: "Red" },
  { hex: "#b3541e", label: "Rust" },
  { hex: "#3f8e84", label: "Brand teal" },
  { hex: "#1f6fb2", label: "Blue" },
  { hex: "#6b4fa8", label: "Violet" },
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
  <p>Turn on <b>Edit preview</b>, then click this sentence and start typing.</p>
</body>
</html>`;

export default function HtmlTools() {
  const [html, setHtml] = useState(STARTER);
  // What the preview frame actually shows. Lags `html` by a debounce so typing
  // in the code pane doesn't reload the iframe on every keystroke.
  const [rendered, setRendered] = useState(STARTER);
  const [filename, setFilename] = useState("page.html");
  const [mode, setMode] = useState<Mode>("preview");
  const [status, setStatus] = useState<Status>("synced");
  const [color, setColor] = useState("#3f8e84");
  const [dropping, setDropping] = useState(false);
  // Bumping this remounts the edit frame, reseeding it from the code pane.
  const [editKey, setEditKey] = useState(0);

  const fileInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const savedRange = useRef<Range | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    },
    [],
  );

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

  // Preview -> code. Deliberately does not touch `rendered`: rewriting the
  // frame's own srcDoc mid-edit would reload it and drop the cursor.
  const syncFromFrame = useCallback(() => {
    const next = serialize();
    if (next === null) return;
    setHtml(next);
    setStatus("synced");
  }, [serialize]);

  const rememberSelection = useCallback(() => {
    const sel = frameDoc()?.getSelection();
    if (sel?.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const markEditing = useCallback(() => setStatus("editing"), []);

  // Wire up designMode once the seeded document has parsed.
  function onEditFrameLoad() {
    const doc = frameDoc();
    if (!doc) return;
    doc.designMode = "on";
    doc.execCommand("styleWithCSS", false, "true"); // inline styles, not <font> tags
    doc.addEventListener("input", markEditing);
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

  // Point the preview at `next` and reseed the edit frame if it's open.
  const reseed = useCallback((next: string, editable: boolean) => {
    setRendered(next);
    savedRange.current = null;
    if (editable) setEditKey((k) => k + 1);
    setStatus(next.trim() ? "synced" : "idle");
  }, []);

  function toggleMode() {
    if (mode === "edit") {
      const current = serialize() ?? html; // don't lose the last keystroke
      setHtml(current);
      setRendered(current);
      savedRange.current = null;
      setMode("preview");
      setStatus(current.trim() ? "synced" : "idle");
      return;
    }
    setMode("edit");
    reseed(html, true);
  }

  function onSourceChange(next: string) {
    setHtml(next);
    setStatus(next.trim() ? "typing" : "idle");
    // Typing in the code pane wins: re-render (and reseed the editable frame)
    // once typing settles.
    if (renderTimer.current) clearTimeout(renderTimer.current);
    const editable = mode === "edit";
    renderTimer.current = setTimeout(() => reseed(next, editable), 220);
  }

  function load(next: string, name?: string) {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    setHtml(next);
    if (name) setFilename(name);
    reseed(next, mode === "edit");
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
    if (file) load(await file.text(), file.name);
    e.target.value = ""; // allow re-uploading the same file
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropping(false);
    const file = e.dataTransfer.files?.[0];
    if (file) load(await file.text(), file.name);
  }

  const editing = mode === "edit";
  const empty = !html.trim();

  const pane =
    "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-[var(--color-bg)] transition-colors";
  const bar =
    "flex min-h-[46px] flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2";
  const label =
    "text-[10.5px] font-mono uppercase tracking-[0.13em] text-[var(--color-text-muted)]";
  const tool =
    "inline-grid h-[30px] min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs leading-none text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent";
  const picker =
    "h-[30px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-border-strong)] disabled:opacity-40";

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
            <span className={`${label} mr-auto`}>Live preview</span>
            <button
              type="button"
              onClick={toggleMode}
              aria-pressed={editing}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className={`flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2 ${
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

            <span className={label}>Color</span>
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
              className="relative inline-grid h-[30px] w-[30px] place-items-center overflow-hidden rounded-md border border-[var(--color-border)]"
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

          <div className="relative bg-white">
            {editing ? (
              <iframe
                key={`edit-${editKey}`}
                ref={frame}
                title="HTML preview (editable)"
                srcDoc={rendered}
                sandbox={SANDBOX.edit}
                onLoad={onEditFrameLoad}
                className="block h-[620px] w-full border-0 bg-white"
              />
            ) : (
              <iframe
                key="preview"
                ref={frame}
                title="HTML preview"
                srcDoc={rendered}
                sandbox={SANDBOX.preview}
                className="block h-[620px] w-full border-0 bg-white"
              />
            )}
            {editing && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_2px_var(--color-accent)]"
              />
            )}
            {empty && (
              <div className="pointer-events-none absolute inset-0 grid place-content-center px-6 text-center text-[13.5px] text-[#8496a3]">
                Nothing to preview yet
              </div>
            )}
          </div>

          <p className="border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
            {editing
              ? "Click any text in the preview and type — the code updates as you go. Select text first to recolour or restyle it. Scripts are disabled while editing."
              : "Scripts in the previewed page run here. Turn on Edit preview to type directly into it."}
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
