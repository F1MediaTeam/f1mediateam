// Link unfurl for content-card URLs. Fetches the page server-side (browsers
// can't — CORS) and returns Open Graph metadata the LinkPreview component
// renders as an iMessage-style card. Results are CDN-cached for a day.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 6_000;

// Refuse anything that could point the server at internal infrastructure.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "[::1]") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        // Some sites hide OG tags from unknown agents; present as a browser.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
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

    return NextResponse.json(
      {
        url: target.toString(),
        domain: finalUrl.hostname.replace(/^www\./, ""),
        siteName: siteName ? decodeEntities(siteName) : null,
        title: title ? decodeEntities(title) : null,
        description: description ? decodeEntities(description) : null,
        image,
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    // Unreachable page — still return the domain so the card can render.
    return NextResponse.json(
      {
        url: target.toString(),
        domain: target.hostname.replace(/^www\./, ""),
        siteName: null,
        title: null,
        description: null,
        image: null,
      },
      { headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  }
}
