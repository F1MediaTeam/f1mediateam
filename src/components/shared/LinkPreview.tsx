"use client";

// iMessage-style link preview for content-card URLs: the raw URL on top,
// then a clickable card.
//
// Two layouts (per the user's reference designs):
//  - page:   full-width landscape — page image (OG image, else a proxied
//            thum.io screenshot) over a site-name + domain bar.
//  - social: portrait 9:16 card (TikTok / Instagram / Facebook / YouTube)
//            with a play-button overlay for videos, then a bar with the
//            caption, the bold "Author on Platform" line, and the domain.
//
// Degrades to just the URL row when the page can't be unfurled.

import { useEffect, useState } from "react";

interface Unfurl {
  url: string;
  domain: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  kind: "page" | "video" | "image";
  provider: string | null;
}

function PlayOverlay() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-black/45">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-[var(--color-bg-hover)] to-[var(--color-bg-elev)] grid place-items-center">
      <span className="text-xs tracking-widest uppercase text-[var(--color-text-subtle)]">
        Loading preview…
      </span>
    </div>
  );
}

export default function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<Unfurl | null>(null);
  const [failed, setFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    setImgFailed(false);
    setImgLoaded(false);
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Unfurl) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [url]);

  const isSocial = data != null && data.kind !== "page" && data.provider != null;

  // Screenshot fallback when the page has no OG image, proxied through our
  // /shot route which holds the response until the capture is actually ready
  // (thum.io otherwise serves an animated spinner placeholder mid-render).
  const imageSrc =
    data?.image ?? `/api/link-preview/shot?url=${encodeURIComponent(url)}`;

  const urlRow = (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline break-all"
    >
      {url} ↗
    </a>
  );

  if (failed) return <div className="space-y-2">{urlRow}</div>;

  if (isSocial) {
    return (
      <div className="space-y-2">
        {urlRow}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full max-w-[280px] rounded-xl overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition"
        >
          {!imgFailed ? (
            <div className="relative aspect-[9/14] bg-[var(--color-bg-hover)]">
              {!imgLoaded ? <Skeleton /> : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt=""
                className={
                  "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 " +
                  (imgLoaded ? "opacity-100" : "opacity-0")
                }
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgFailed(true)}
              />
              {imgLoaded && data.kind === "video" ? <PlayOverlay /> : null}
            </div>
          ) : null}
          <div className="px-4 py-3 bg-[var(--color-bg-hover)] space-y-1.5">
            {data.description ? (
              <div className="text-sm leading-snug text-[var(--color-text)] line-clamp-2">
                {data.description}
              </div>
            ) : null}
            <div className="text-sm font-semibold text-[var(--color-text)] truncate">
              {data.title ?? data.provider}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] truncate">{data.domain}</div>
          </div>
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {urlRow}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full rounded-xl overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition"
      >
        {!imgFailed ? (
          <div className="relative h-64 bg-[var(--color-bg-hover)]">
            {!imgLoaded ? <Skeleton /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              className={
                "w-full h-64 object-cover object-top transition-opacity duration-300 " +
                (imgLoaded ? "opacity-100" : "opacity-0")
              }
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : null}
        <div className="px-4 py-3 bg-[var(--color-bg-hover)]">
          <div className="text-sm font-semibold text-[var(--color-text)] truncate">
            {data?.siteName ?? data?.title ?? (data?.domain || "Loading preview…")}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] truncate">{data?.domain ?? ""}</div>
          {data?.description ? (
            <div className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">
              {data.description}
            </div>
          ) : null}
        </div>
      </a>
    </div>
  );
}
