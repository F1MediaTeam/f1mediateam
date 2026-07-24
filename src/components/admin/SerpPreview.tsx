"use client";

// SERP snippet preview. Type a page title, URL, and meta description; see a
// rough render of the Google result plus length guidance.
//
// Google truncates by pixel width, not character count, so a hidden canvas
// measures the title/description the way the search page roughly does. The
// limits below are the widely-used desktop thresholds.

import { useEffect, useMemo, useRef, useState } from "react";

const TITLE_PX = 580;
const DESC_PX = 920;

function measurer() {
  // One reusable canvas context. Guard for SSR where canvas is absent.
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  return c.getContext("2d");
}

export default function SerpPreview() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    ctxRef.current = measurer();
  }, []);

  const width = (text: string, font: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return text.length * 8; // rough fallback pre-hydration
    ctx.font = font;
    return Math.round(ctx.measureText(text).width);
  };

  const titlePx = useMemo(() => width(title || "Example page title", "20px Arial"), [title]);
  const descPx = useMemo(() => width(desc || "", "14px Arial"), [desc]);

  const titleShown = titlePx > TITLE_PX;
  const descShown = descPx > DESC_PX;

  const displayUrl = (() => {
    const raw = url.trim();
    if (!raw) return "https://clientsite.com › page";
    try {
      const u = new URL(raw.match(/^https?:\/\//i) ? raw : `https://${raw}`);
      return `${u.hostname}${u.pathname.replace(/\/$/, "").replace(/\//g, " › ")}`;
    } catch {
      return raw;
    }
  })();

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";

  function Gauge({ px, limit, label }: { px: number; limit: number; label: string }) {
    const over = px > limit;
    return (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[var(--color-text-subtle)]">{label}</span>
        <span className={over ? "font-semibold text-amber-400" : "text-[var(--color-text-muted)]"}>
          {px}/{limit}px {over ? "· will be cut off" : "· fits"}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Page title
          </label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Best DTF Printers for Small Shops | Client Co" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Page URL
          </label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://clientsite.com/dtf-printers" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Meta description
          </label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="A short, compelling summary of the page…" className={field + " resize-y"} />
        </div>
        <div className="space-y-1 rounded-lg border border-[var(--color-border)] p-2.5">
          <Gauge px={titlePx} limit={TITLE_PX} label="Title width" />
          <Gauge px={descPx} limit={DESC_PX} label="Description width" />
        </div>
      </div>

      {/* Result preview */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Google result preview
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <div className="truncate text-[13px] text-[#4d5156]">{displayUrl}</div>
          <div
            className="mt-0.5 text-[18px] leading-snug text-[#1a0dab]"
            style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {title || "Example page title"}
          </div>
          <div
            className="mt-1 text-[13px] leading-snug text-[#4d5156]"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {desc || "Your meta description shows here. Google may rewrite it, but this is a close approximation of the snippet."}
          </div>
        </div>
        {(titleShown || descShown) ? (
          <p className="mt-2 text-[11px] text-amber-400">
            {titleShown ? "Title" : ""}
            {titleShown && descShown ? " and description" : descShown ? "Description" : ""} may be
            truncated on desktop results.
          </p>
        ) : null}
      </div>
    </div>
  );
}
