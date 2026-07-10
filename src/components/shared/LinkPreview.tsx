"use client";

// iMessage-style link preview for content-card URLs: the raw URL on top,
// then a card with a page image (Open Graph image, falling back to a live
// thum.io screenshot of the page) over a bar with the site name and domain.
// Degrades to just the URL row when the page can't be unfurled.

import { useEffect, useState } from "react";

interface Unfurl {
  url: string;
  domain: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
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

  // Screenshot fallback when the page has no OG image. wait/15 blocks the
  // request until the capture is ready instead of serving thum.io's gray
  // spinner placeholder (a white frame that clashes with the dark theme).
  const imageSrc =
    data?.image ?? `https://image.thum.io/get/wait/15/width/1200/crop/800/${url}`;

  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline break-all"
      >
        {url} ↗
      </a>

      {!failed ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-xl overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition"
        >
          {!imgFailed ? (
            <div className="relative h-64 bg-[var(--color-bg-hover)]">
              {!imgLoaded ? (
                // Theme-matched skeleton while the capture/OG image loads —
                // shimmer only, never a raw white frame.
                <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-[var(--color-bg-hover)] to-[var(--color-bg-elev)] grid place-items-center">
                  <span className="text-xs tracking-widest uppercase text-[var(--color-text-subtle)]">
                    Loading preview…
                  </span>
                </div>
              ) : null}
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
            <div className="text-xs text-[var(--color-text-muted)] truncate">
              {data?.domain ?? ""}
            </div>
            {data?.description ? (
              <div className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">
                {data.description}
              </div>
            ) : null}
          </div>
        </a>
      ) : null}
    </div>
  );
}
