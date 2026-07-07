// Inline workGallery image URLs as data: URIs so the pptx builder can embed
// them. Runs server-side just before generateDeck — the preview and the
// stored/exported JSON keep the lightweight URLs; only the render pays the
// fetch. Every failure (dead link, oversized file, non-image response) just
// leaves that item without `data`, and the builder skips its cell — imagery
// must never tank the deck.

import type { MonthlyContent } from "./deck-builder";

const MAX_IMAGE_BYTES = 4_000_000; // matches the preview editor's upload cap
const FETCH_TIMEOUT_MS = 10_000;

// Only formats every PowerPoint build renders. WebP/SVG/HEIC embed fine in
// the zip but show as broken cells on older Office — worse in a live meeting
// than the image being absent from the deck (it still shows in the preview).
const EMBEDDABLE = new Set(["image/png", "image/jpeg", "image/gif"]);

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

function mimeFor(url: string, contentType: string | null): string | null {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return EMBEDDABLE.has(ct) ? ct : null;
  // Some CDNs serve images as octet-stream — fall back to the extension.
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return m ? EXT_MIME[m[1].toLowerCase()] ?? null : null;
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const mime = mimeFor(url, res.headers.get("content-type"));
    if (!mime) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Mutates content.workGallery in place, filling `data` from `image` URLs. */
export async function inlineWorkGalleryImages(content: MonthlyContent): Promise<void> {
  const gallery = content.workGallery;
  if (!Array.isArray(gallery) || gallery.length === 0) return;
  await Promise.all(
    gallery.map(async (g) => {
      if (!g || typeof g !== "object") return;
      if (typeof g.data === "string" && g.data.startsWith("data:image/")) return; // already inlined
      if (typeof g.image !== "string" || !/^https?:\/\//i.test(g.image)) return;
      const data = await fetchAsDataUri(g.image);
      if (data) g.data = data;
    }),
  );
}
