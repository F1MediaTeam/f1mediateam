// Direct speed audit — measures a page by actually fetching it, no API key.
//
// Why this exists alongside pagespeed.ts: Google's PageSpeed Insights API is
// the better tool (it runs real Lighthouse and reports real-user Core Web
// Vitals), but it cannot be called without an API key. The anonymous path
// shares one Google-wide project whose daily quota is permanently exhausted —
// every keyless call returns 429 immediately. So PSI is an upgrade that
// switches on when PAGESPEED_API_KEY is present, and this is what the tool
// runs the rest of the time.
//
// What this measures is real but different from Lighthouse, and the UI says so:
// we fetch the HTML, parse out the subresources, fetch those too, and time and
// weigh everything. That yields honest transfer-level facts — time to first
// byte, page weight, request count, what's uncompressed, what's oversized —
// which is where most site-speed problems actually live. It does NOT render the
// page, so it cannot produce LCP, CLS, or INP; anything we can't measure, we
// don't show.
//
// Timings are taken from this server, not from a phone on a cell network. They
// are a consistent basis for comparison and for tracking a site over time, not
// a simulation of a user's device.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { isBlockedHost } from "./url-guard";
import type { Verdict } from "./pagespeed";

export type { Verdict };

export type ResourceKind = "html" | "script" | "style" | "image" | "font" | "other";
export type Severity = "critical" | "warning" | "ok";

export interface ResourceRow {
  url: string;
  kind: ResourceKind;
  /** bytes actually received over the wire, compression included */
  bytes: number;
  /** bytes after decompression, so we can tell how much compression is saving */
  decodedBytes: number;
  ms: number;
  status: number;
  /** gzip / br / etc., or null when the server sent it uncompressed */
  encoding: string | null;
  /** max-age in seconds parsed from cache-control, null when absent */
  cacheSeconds: number | null;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** the specific files this is about, worst first */
  items?: string[];
}

export interface AuditMetric {
  id: string;
  label: string;
  value: number;
  display: string;
  verdict: Verdict;
  hint: string;
}

export interface KindGroup {
  kind: ResourceKind;
  count: number;
  bytes: number;
}

export interface SpeedAudit {
  url: string;
  /** where we ended up after redirects, if different */
  finalUrl: string;
  redirects: string[];
  score: number;
  metrics: AuditMetric[];
  findings: Finding[];
  groups: KindGroup[];
  /** heaviest resources, biggest first */
  largest: ResourceRow[];
  totalBytes: number;
  totalRequests: number;
  /** true when we stopped fetching subresources before the page was exhausted */
  truncated: boolean;
  fetchedAt: string;
}

// How much work one run is allowed to do. A page with 300 images should not be
// able to hold a serverless function open until it's killed mid-response.
const MAX_RESOURCES = 45;
const CONCURRENCY = 8;
const RESOURCE_TIMEOUT_MS = 8_000;
const HTML_TIMEOUT_MS = 15_000;
const TOTAL_BUDGET_MS = 32_000;
const MAX_BODY_BYTES = 6_000_000;
const MAX_REDIRECTS = 5;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Safari/537.36 F1MediaTeam-SpeedAudit/1.0";

// [good ceiling, needs-improvement ceiling]; above the second is poor.
const THRESHOLDS: Record<string, [number, number]> = {
  TTFB: [800, 1800],
  HTML: [1000, 2500],
  TOTAL: [3000, 6000],
  WEIGHT: [1_600_000, 4_000_000],
  REQUESTS: [30, 70],
};

function judge(id: string, value: number): Verdict {
  const t = THRESHOLDS[id];
  if (!t) return "good";
  if (value <= t[0]) return "good";
  if (value <= t[1]) return "needs-improvement";
  return "poor";
}

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);

function bytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n >= 1000) return `${Math.round(n / 1000)} KB`;
  return `${n} B`;
}

function kindOf(url: string, contentType: string | null): ResourceKind {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("html")) return "html";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "script";
  if (ct.includes("css")) return "style";
  if (ct.startsWith("image/")) return "image";
  if (ct.includes("font")) return "font";

  // No usable content-type — fall back to the extension.
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(m?js|jsx|ts)$/.test(path)) return "script";
  if (/\.css$/.test(path)) return "style";
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/.test(path)) return "image";
  if (/\.(woff2?|ttf|otf|eot)$/.test(path)) return "font";
  return "other";
}

function parseMaxAge(cacheControl: string | null): number | null {
  if (!cacheControl) return null;
  if (/no-store|no-cache/i.test(cacheControl)) return 0;
  const m = /max-age\s*=\s*(\d+)/i.exec(cacheControl);
  return m ? Number(m[1]) : null;
}

/** Absolute, http(s)-only, SSRF-safe, and not a data:/blob: URI. */
function safeResolve(raw: string, base: string): string | null {
  const href = raw.trim();
  if (!href || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("#")) {
    return null;
  }
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (isBlockedHost(u.hostname)) return null;
  u.hash = "";
  return u.toString();
}

interface ParsedHtml {
  resources: Array<{ url: string; kind: ResourceKind }>;
  blockingScripts: number;
  blockingStyles: number;
  imagesWithoutDimensions: number;
  totalImages: number;
  inlineScriptBytes: number;
  inlineStyleBytes: number;
}

/**
 * Pull subresources out of the HTML. A regex pass rather than a DOM parse —
 * the repo has no HTML parser and this only needs URLs and a few attribute
 * facts, where over-matching costs nothing (a bad URL just fails to resolve).
 */
function parseHtml(html: string, baseUrl: string): ParsedHtml {
  const seen = new Set<string>();
  const resources: Array<{ url: string; kind: ResourceKind }> = [];

  const add = (raw: string | undefined, kind: ResourceKind) => {
    if (!raw) return;
    const abs = safeResolve(raw, baseUrl);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    resources.push({ url: abs, kind });
  };

  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);

  // Scripts. A src'd <script> in <head> without async/defer blocks rendering.
  let blockingScripts = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src) continue;
    add(src, "script");
    const inHead = m.index !== undefined && m.index < head.length;
    if (inHead && !/\b(async|defer|type\s*=\s*["']module["'])/i.test(attrs)) blockingScripts += 1;
  }

  // Stylesheets. Every sync stylesheet in <head> is render-blocking by design.
  let blockingStyles = 0;
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = m[1];
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    if (rel.includes("stylesheet")) {
      add(href, "style");
      if (m.index !== undefined && m.index < head.length && !/\bmedia\s*=\s*["']print["']/i.test(attrs)) {
        blockingStyles += 1;
      }
    } else if (rel.includes("preload")) {
      const as = /\bas\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
      if (as === "font") add(href, "font");
      else if (as === "script") add(href, "script");
      else if (as === "style") add(href, "style");
      else if (as === "image") add(href, "image");
    } else if (rel.includes("icon")) {
      add(href, "image");
    }
  }

  // Images. srcset entries are "url 320w" pairs; the first candidate is enough
  // to size the asset — fetching every candidate would multiply the run.
  let totalImages = 0;
  let imagesWithoutDimensions = 0;
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];
    totalImages += 1;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const srcset = /\bsrcset\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    add(src ?? srcset?.split(",")[0]?.trim().split(/\s+/)[0], "image");
    const hasW = /\bwidth\s*=/i.test(attrs);
    const hasH = /\bheight\s*=/i.test(attrs);
    // Explicit dimensions (or an aspect-ratio style) let the browser reserve
    // space; without them the image pops in and shifts the layout.
    if (!(hasW && hasH) && !/aspect-ratio/i.test(attrs)) imagesWithoutDimensions += 1;
  }

  // Inline weight isn't a separate request, but it is bytes in the HTML and a
  // common reason a "small" page is slow.
  let inlineScriptBytes = 0;
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineScriptBytes += m[1].length;
  }
  let inlineStyleBytes = 0;
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    inlineStyleBytes += m[1].length;
  }

  return {
    resources,
    blockingScripts,
    blockingStyles,
    imagesWithoutDimensions,
    totalImages,
    inlineScriptBytes,
    inlineStyleBytes,
  };
}

interface Fetched {
  status: number;
  header: (name: string) => string | null;
  /** ms to response headers — time to first byte */
  ttfbMs: number;
  /** ms to finish reading the body */
  totalMs: number;
  /** bytes actually received over the wire, still compressed */
  transferBytes: number;
  /** bytes after decompression — what the browser has to parse */
  decodedBytes: number;
  body: string | null;
  finalUrl: string;
  redirects: string[];
}

function decompress(buf: Buffer, encoding: string | null): Buffer {
  try {
    if (!encoding) return buf;
    const e = encoding.toLowerCase();
    if (e.includes("br")) return brotliDecompressSync(buf);
    if (e.includes("gzip")) return gunzipSync(buf);
    if (e.includes("deflate")) return inflateSync(buf);
  } catch {
    // A body that won't decompress is still worth its byte count.
  }
  return buf;
}

/**
 * GET one URL over raw node:http(s), timing headers separately from the body
 * and following redirects by hand.
 *
 * Deliberately not `fetch`: undici transparently gunzips and does not report
 * how many bytes actually arrived, so on the very common setup of compression
 * plus chunked encoding (no content-length) the only size available is the
 * decompressed one. That overstated page weight roughly threefold on the first
 * site tested. Reading the socket ourselves gives the real transfer size, and
 * we decompress afterwards only for the HTML, which we need as text.
 *
 * `wantBody` keeps the bytes only for the document — subresources are counted
 * and discarded so a large asset never accumulates in memory.
 */
function rawGet(startUrl: string, timeoutMs: number, wantBody: boolean): Promise<Fetched> {
  const redirects: string[] = [];
  const started = performance.now();

  const attempt = (url: string, hop: number): Promise<Fetched> =>
    new Promise<Fetched>((resolveRaw, rejectRaw) => {
      // Tearing down a request to follow a redirect, and hitting the body cap,
      // can both fire a late 'error' or 'close' after the outcome is already
      // decided. First settlement wins; the rest are ignored.
      let settled = false;
      const resolve = (value: Fetched) => {
        if (settled) return;
        settled = true;
        resolveRaw(value);
      };
      const reject = (err: unknown) => {
        if (settled) return;
        settled = true;
        rejectRaw(err);
      };

      let target: URL;
      try {
        target = new URL(url);
      } catch {
        reject(new Error("Invalid URL."));
        return;
      }

      const send = target.protocol === "http:" ? httpRequest : httpsRequest;
      const req = send(
        target,
        {
          method: "GET",
          headers: {
            "user-agent": UA,
            accept: wantBody
              ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
              : "*/*",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "en-US,en;q=0.9",
          },
        },
        (res) => {
          const ttfbMs = performance.now() - started;
          const status = res.statusCode ?? 0;
          const header = (name: string) => {
            const v = res.headers[name.toLowerCase()];
            return Array.isArray(v) ? v.join(", ") : (v ?? null);
          };

          // Redirect: abandon this response and chase the next hop.
          if (status >= 300 && status < 400 && header("location") && hop < MAX_REDIRECTS) {
            const next = safeResolve(header("location") as string, url);
            if (next && next !== url) {
              // Hand off to the next hop before tearing this one down, so the
              // teardown's own events can't settle the promise first.
              settled = true;
              redirects.push(next);
              res.resume();
              req.destroy();
              attempt(next, hop + 1).then(resolveRaw, rejectRaw);
              return;
            }
          }

          let transferBytes = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            transferBytes += chunk.length;
            if (wantBody) chunks.push(chunk);
            // Stop pulling once an asset is absurdly large; its size is already
            // the finding, and the rest tells us nothing.
            if (transferBytes > MAX_BODY_BYTES) {
              res.destroy();
            }
          });
          res.on("end", () => {
            const raw = wantBody ? Buffer.concat(chunks) : Buffer.alloc(0);
            const decoded = wantBody ? decompress(raw, header("content-encoding")) : raw;
            resolve({
              status,
              header,
              ttfbMs,
              totalMs: performance.now() - started,
              transferBytes,
              // Only the document is decompressed; for everything else the
              // declared length is the best decoded figure available.
              decodedBytes: wantBody
                ? decoded.byteLength
                : Number(header("content-length")) || transferBytes,
              body: wantBody ? decoded.toString("utf8") : null,
              finalUrl: url,
              redirects,
            });
          });
          res.on("error", reject);
          // res.destroy() above fires 'close' without 'end'.
          res.on("close", () => {
            if (transferBytes > MAX_BODY_BYTES) {
              resolve({
                status,
                header,
                ttfbMs,
                totalMs: performance.now() - started,
                transferBytes,
                decodedBytes: transferBytes,
                body: null,
                finalUrl: url,
                redirects,
              });
            }
          });
        },
      );

      req.setTimeout(timeoutMs, () => req.destroy(new Error("Timed out.")));
      req.on("error", reject);
      req.end();
    });

  return attempt(startUrl, 0);
}

/** Run `worker` over `items`, at most `limit` at a time. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

function isTextual(kind: ResourceKind): boolean {
  return kind === "script" || kind === "style" || kind === "html";
}

function shortName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? `${last}${u.search ? "?…" : ""}` : u.hostname;
  } catch {
    return url;
  }
}

/**
 * Turn the measurements into a 0–100 headline. Deliberately not a Lighthouse
 * score and labelled as such in the UI — it's a weighted read of the five
 * things we actually measured, so that two runs of the same site are
 * comparable and a regression is visible.
 */
function scoreFrom(metrics: AuditMetric[]): number {
  const weights: Record<string, number> = {
    TTFB: 0.3,
    HTML: 0.15,
    TOTAL: 0.25,
    WEIGHT: 0.2,
    REQUESTS: 0.1,
  };
  let total = 0;
  let used = 0;
  for (const m of metrics) {
    const w = weights[m.id];
    if (!w) continue;
    const t = THRESHOLDS[m.id];
    if (!t) continue;
    // Linear inside each band: full marks at the good ceiling, 50 at the
    // needs-improvement ceiling, tailing to 0 at twice that.
    let points: number;
    if (m.value <= t[0]) points = 100 - (m.value / t[0]) * 10;
    else if (m.value <= t[1]) points = 90 - ((m.value - t[0]) / (t[1] - t[0])) * 40;
    else points = Math.max(0, 50 - ((m.value - t[1]) / t[1]) * 50);
    total += points * w;
    used += w;
  }
  return used > 0 ? Math.round(total / used) : 0;
}

export async function runSpeedAudit(startUrl: string): Promise<SpeedAudit> {
  const deadline = performance.now() + TOTAL_BUDGET_MS;

  const doc = await rawGet(startUrl, HTML_TIMEOUT_MS, true);
  if (doc.status >= 400) {
    throw new Error(`The page returned HTTP ${doc.status}.`);
  }
  const contentType = doc.header("content-type");
  if (!doc.body || !(contentType ?? "").toLowerCase().includes("html")) {
    throw new Error("That URL didn't return an HTML page.");
  }

  const chain = doc.redirects;
  const finalUrl = doc.finalUrl;
  const parsed = parseHtml(doc.body, finalUrl);

  const htmlRow: ResourceRow = {
    url: finalUrl,
    kind: "html",
    bytes: doc.transferBytes,
    decodedBytes: doc.decodedBytes,
    ms: doc.totalMs,
    status: doc.status,
    encoding: doc.header("content-encoding"),
    cacheSeconds: parseMaxAge(doc.header("cache-control")),
  };

  const queue = parsed.resources.slice(0, MAX_RESOURCES);
  const truncated = parsed.resources.length > MAX_RESOURCES;

  const settled = await pooled(queue, CONCURRENCY, async (item): Promise<ResourceRow | null> => {
    if (performance.now() > deadline) return null;
    try {
      const r = await rawGet(item.url, RESOURCE_TIMEOUT_MS, false);
      return {
        url: item.url,
        kind: kindOf(item.url, r.header("content-type")) || item.kind,
        bytes: r.transferBytes,
        decodedBytes: r.decodedBytes,
        ms: r.totalMs,
        status: r.status,
        encoding: r.header("content-encoding"),
        cacheSeconds: parseMaxAge(r.header("cache-control")),
      };
    } catch {
      // A single asset failing (timeout, TLS, 404) shouldn't sink the report.
      return null;
    }
  });

  const rows: ResourceRow[] = [htmlRow, ...settled.filter((r): r is ResourceRow => r !== null)];
  const ok = rows.filter((r) => r.status < 400);

  const totalBytes = ok.reduce((sum, r) => sum + r.bytes, 0);
  const totalRequests = rows.length;
  // Subresources were fetched concurrently, so the wall-clock for the batch is
  // its slowest member, not the sum — plus the document that had to land first.
  const slowestAsset = Math.max(0, ...settled.filter(Boolean).map((r) => (r as ResourceRow).ms));
  const totalMs = doc.totalMs + slowestAsset;

  const metrics: AuditMetric[] = [
    {
      id: "TTFB",
      label: "Time to first byte",
      value: doc.ttfbMs,
      display: ms(doc.ttfbMs),
      verdict: judge("TTFB", doc.ttfbMs),
      hint: "How long the server thought before sending anything. Hosting and backend work.",
    },
    {
      id: "HTML",
      label: "HTML delivered",
      value: doc.totalMs,
      display: ms(doc.totalMs),
      verdict: judge("HTML", doc.totalMs),
      hint: "First byte through to the last byte of the page's own markup.",
    },
    {
      id: "TOTAL",
      label: "All assets in",
      value: totalMs,
      display: ms(totalMs),
      verdict: judge("TOTAL", totalMs),
      hint: "Document plus the slowest of its scripts, styles, images and fonts.",
    },
    {
      id: "WEIGHT",
      label: "Page weight",
      value: totalBytes,
      display: bytes(totalBytes),
      verdict: judge("WEIGHT", totalBytes),
      hint: "Total transferred. Over ~1.6 MB starts to hurt on mobile data.",
    },
    {
      id: "REQUESTS",
      label: "Requests",
      value: totalRequests,
      display: String(totalRequests),
      verdict: judge("REQUESTS", totalRequests),
      hint: "Every file the browser has to ask for before the page is done.",
    },
  ];

  // ---- findings, worst first ----
  const findings: Finding[] = [];

  if (chain.length > 0) {
    findings.push({
      id: "redirects",
      severity: chain.length > 1 ? "critical" : "warning",
      title: `${chain.length} redirect${chain.length > 1 ? "s" : ""} before the page loads`,
      detail:
        "Each hop is a full round trip before anything renders. Point links and any canonical URL straight at the final address.",
      items: chain,
    });
  }

  const uncompressed = ok
    .filter((r) => isTextual(r.kind) && !r.encoding && r.decodedBytes > 10_000)
    .sort((a, b) => b.decodedBytes - a.decodedBytes);
  if (uncompressed.length > 0) {
    const wasted = uncompressed.reduce((s, r) => s + r.decodedBytes, 0);
    findings.push({
      id: "compression",
      severity: "critical",
      title: `${uncompressed.length} text file${uncompressed.length > 1 ? "s are" : " is"} sent uncompressed`,
      detail: `${bytes(wasted)} of HTML, CSS and JavaScript with no gzip or brotli. Turning compression on at the host typically cuts these by 70–80% and is the cheapest win available.`,
      items: uncompressed.slice(0, 6).map((r) => `${shortName(r.url)} — ${bytes(r.decodedBytes)}`),
    });
  }

  const heavyImages = ok
    .filter((r) => r.kind === "image" && r.bytes > 300_000)
    .sort((a, b) => b.bytes - a.bytes);
  if (heavyImages.length > 0) {
    findings.push({
      id: "heavy-images",
      severity: "critical",
      title: `${heavyImages.length} oversized image${heavyImages.length > 1 ? "s" : ""}`,
      detail:
        "Anything over 300 KB is almost always a full-resolution upload that was never resized for the web. Resize to the size it actually displays at, then compress.",
      items: heavyImages.slice(0, 6).map((r) => `${shortName(r.url)} — ${bytes(r.bytes)}`),
    });
  }

  const legacyImages = ok
    .filter((r) => r.kind === "image" && r.bytes > 100_000 && /\.(png|jpe?g)(\?|$)/i.test(r.url))
    .sort((a, b) => b.bytes - a.bytes);
  if (legacyImages.length > 0) {
    findings.push({
      id: "image-format",
      severity: "warning",
      title: `${legacyImages.length} image${legacyImages.length > 1 ? "s" : ""} in an older format`,
      detail:
        "These are JPEG or PNG. WebP or AVIF hold the same quality at roughly a third of the size, and every browser in use supports them.",
      items: legacyImages.slice(0, 6).map((r) => `${shortName(r.url)} — ${bytes(r.bytes)}`),
    });
  }

  if (parsed.blockingScripts > 0) {
    findings.push({
      id: "blocking-scripts",
      severity: parsed.blockingScripts > 2 ? "critical" : "warning",
      title: `${parsed.blockingScripts} script${parsed.blockingScripts > 1 ? "s block" : " blocks"} rendering`,
      detail:
        "Scripts in the <head> without async or defer stop the browser drawing anything until they finish downloading and running. Add defer unless the script must run first.",
    });
  }

  if (parsed.blockingStyles > 3) {
    findings.push({
      id: "blocking-styles",
      severity: "warning",
      title: `${parsed.blockingStyles} stylesheets load before anything renders`,
      detail:
        "Every one is a round trip the first paint waits on. Combining them, or inlining the critical rules, brings the first paint forward.",
    });
  }

  const uncached = ok
    .filter((r) => r.kind !== "html" && (r.cacheSeconds === null || r.cacheSeconds < 86_400))
    .sort((a, b) => b.bytes - a.bytes);
  if (uncached.length >= 3) {
    findings.push({
      id: "caching",
      severity: "warning",
      title: `${uncached.length} assets aren't cached for repeat visits`,
      detail:
        "No cache-control, or under a day. Returning visitors re-download them every time. Static files with versioned names can safely be cached for a year.",
      items: uncached.slice(0, 6).map((r) => shortName(r.url)),
    });
  }

  if (parsed.imagesWithoutDimensions > 0) {
    findings.push({
      id: "image-dimensions",
      severity: parsed.imagesWithoutDimensions > 5 ? "warning" : "ok",
      title: `${parsed.imagesWithoutDimensions} of ${parsed.totalImages} images have no width and height`,
      detail:
        "Without dimensions the browser can't reserve space, so the page jumps as each image arrives. That jumping is what Google measures as layout shift.",
    });
  }

  const inlineTotal = parsed.inlineScriptBytes + parsed.inlineStyleBytes;
  if (inlineTotal > 100_000) {
    findings.push({
      id: "inline-weight",
      severity: "warning",
      title: `${bytes(inlineTotal)} of inline script and style in the HTML`,
      detail:
        "Inline code can't be cached separately, so it's re-sent on every single page view. Move the bulk of it into files.",
    });
  }

  const broken = rows.filter((r) => r.status >= 400);
  if (broken.length > 0) {
    findings.push({
      id: "broken",
      severity: "warning",
      title: `${broken.length} asset${broken.length > 1 ? "s" : ""} failed to load`,
      detail: "The browser still spends a request discovering these are missing.",
      items: broken.slice(0, 6).map((r) => `${shortName(r.url)} — HTTP ${r.status}`),
    });
  }

  const severityRank: Record<Severity, number> = { critical: 0, warning: 1, ok: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const groupMap = new Map<ResourceKind, KindGroup>();
  for (const r of ok) {
    const g = groupMap.get(r.kind) ?? { kind: r.kind, count: 0, bytes: 0 };
    g.count += 1;
    g.bytes += r.bytes;
    groupMap.set(r.kind, g);
  }

  return {
    url: startUrl,
    finalUrl,
    redirects: chain,
    score: scoreFrom(metrics),
    metrics,
    findings,
    groups: [...groupMap.values()].sort((a, b) => b.bytes - a.bytes),
    largest: [...ok].sort((a, b) => b.bytes - a.bytes).slice(0, 8),
    totalBytes,
    totalRequests,
    truncated,
    fetchedAt: new Date().toISOString(),
  };
}
