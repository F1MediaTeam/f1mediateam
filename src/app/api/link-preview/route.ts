// Link unfurl for content-card URLs. Fetches the page server-side (browsers
// can't — CORS) and returns Open Graph metadata the LinkPreview component
// renders as an iMessage-style card. Results are CDN-cached for a day.

import { NextResponse } from "next/server";
import { isBlockedHost } from "@/lib/url-guard";

export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 6_000;

function pickMeta(html: string, ...patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function metaTag(prop: string): RegExp[] {
  // content= can come before or after the property/name attribute.
  return [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ];
}

function decodeEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'");
}

// Social platforms get a special portrait "video card" treatment in the UI
// (per the user's reference designs). Detect the platform and whether the
// link is a video (play-button overlay) or an image post.
function detectSocial(u: URL): { provider: string; isVideo: boolean } | null {
  const h = u.hostname.replace(/^www\./, "").toLowerCase();
  const p = u.pathname;
  if (h.endsWith("tiktok.com")) return { provider: "TikTok", isVideo: true };
  if (h === "youtu.be" || h.endsWith("youtube.com")) return { provider: "YouTube", isVideo: true };
  if (h.endsWith("instagram.com")) {
    return { provider: "Instagram", isVideo: /\/(reel|reels|tv)\//.test(p) };
  }
  if (h.endsWith("facebook.com") || h === "fb.watch") {
    return { provider: "Facebook", isVideo: h === "fb.watch" || /\/(reel|watch|videos)/.test(p) };
  }
  return null;
}

/** TikTok/YouTube expose oEmbed without auth — far more reliable than
 *  scraping their bot-walled pages. Returns null on any failure. */
async function tryOembed(
  target: URL,
  provider: string,
): Promise<{ title: string | null; author: string | null; image: string | null } | null> {
  const endpoint =
    provider === "TikTok"
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(target.toString())}`
      : provider === "YouTube"
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target.toString())}`
        : null;
  if (!endpoint) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { title: j.title ?? null, author: j.author_name ?? null, image: j.thumbnail_url ?? null };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "unsupported url" }, { status: 400 });
  }

  const social = detectSocial(target);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        // Instagram/Facebook only serve OG tags to their own crawler UA;
        // everyone else gets a login wall. Other sites get a browser UA.
        "User-Agent":
          social && (social.provider === "Instagram" || social.provider === "Facebook")
            ? "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);

    const finalUrl = new URL(res.url || target.toString());
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);

    const title =
      pickMeta(html, ...metaTag("og:title")) ??
      pickMeta(html, /<title[^>]*>([^<]+)<\/title>/i);
    const siteName = pickMeta(html, ...metaTag("og:site_name"));
    const description =
      pickMeta(html, ...metaTag("og:description")) ??
      pickMeta(html, ...metaTag("description"));
    let image = pickMeta(html, ...metaTag("og:image")) ?? pickMeta(html, ...metaTag("twitter:image"));
    if (image) {
      try {
        image = new URL(decodeEntities(image), finalUrl).toString();
      } catch {
        image = null;
      }
    }

    let outTitle = title ? decodeEntities(title) : null;
    let outDesc = description ? decodeEntities(description) : null;
    let outImage = image;

    if (social) {
      // oEmbed beats scraping on TikTok/YouTube (their pages bot-wall).
      const oe = await tryOembed(target, social.provider);
      if (oe) {
        outImage = oe.image ?? outImage;
        outDesc = outDesc ?? oe.title;
        if (!outTitle) {
          outTitle = oe.author ? `${social.provider} · ${oe.author}` : social.provider;
        }
      }
      // IG/FB og:title reads `Author on Instagram: "caption…"` — the bold
      // line in the reference design is just the part before the colon.
      if (outTitle) {
        const m = outTitle.match(/^(.*? on (?:Instagram|Facebook)):/);
        if (m) outTitle = m[1];
      }
    }

    return NextResponse.json(
      {
        url: target.toString(),
        domain: finalUrl.hostname.replace(/^www\./, ""),
        siteName: siteName ? decodeEntities(siteName) : null,
        title: outTitle,
        description: outDesc,
        image: outImage,
        kind: social ? (social.isVideo ? "video" : "image") : "page",
        provider: social?.provider ?? null,
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    // Page fetch failed — social links can still unfurl via oEmbed.
    const oe = social ? await tryOembed(target, social.provider) : null;
    return NextResponse.json(
      {
        url: target.toString(),
        domain: target.hostname.replace(/^www\./, ""),
        siteName: null,
        title: oe?.author && social ? `${social.provider} · ${oe.author}` : null,
        description: oe?.title ?? null,
        image: oe?.image ?? null,
        kind: social ? (social.isVideo ? "video" : "image") : "page",
        provider: social?.provider ?? null,
      },
      { headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  }
}
