"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

// Admin-only HTML previewer + downloader. Paste or upload HTML, see it render
// live in a sandboxed iframe, then download it as a .html file. No network or
// server round-trip — everything happens in the browser.
export default function HtmlTools() {
  const [html, setHtml] = useState("");
  const [filename, setFilename] = useState("page.html");
  const fileInput = useRef<HTMLInputElement>(null);

  function download() {
    const name = (filename.trim() || "page.html").replace(/[^\w.-]+/g, "-");
    const withExt = /\.html?$/i.test(name) ? name : `${name}.html`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
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
    setHtml(await file.text());
    if (file.name) setFilename(file.name);
    e.target.value = ""; // allow re-uploading the same file
  }

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
            onClick={() => setHtml("")}
            disabled={!html}
          >
            Clear
          </Button>
        </div>

        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
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
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
          Live preview
        </div>
        <iframe
          title="HTML preview"
          srcDoc={html}
          // No allow-same-origin: scripts in the previewed HTML run but cannot
          // reach the admin app's origin, cookies, or DOM.
          sandbox="allow-scripts allow-modals allow-forms allow-popups"
          className="h-[420px] w-full rounded-xl border border-[var(--color-border)] bg-white"
        />
      </div>
    </div>
  );
}
