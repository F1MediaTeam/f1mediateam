// Screenshot proxy for link previews. thum.io serves an animated-GIF spinner
// placeholder while a capture is still rendering — ugly mid-state in the UI.
// Real captures are PNG, so we poll server-side until the content-type stops
// being a gif and only then respond; the browser goes straight from our
// skeleton to the finished screenshot. Successful captures are CDN-cached.

import { NextResponse } from "next/server";
import { isBlockedHost } from "@/lib/url-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_MS = 3_000;
const DEADLINE_MS = 40_000;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return new NextResponse("unsupported url", { status: 400 });
  }

  const shotUrl = `https://image.thum.io/get/width/1200/crop/800/${target.toString()}`;
  const deadline = Date.now() + DEADLINE_MS;
  let last: Response | null = null;

  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(shotUrl, { cache: "no-store" });
    } catch {
      return new NextResponse("upstream unreachable", { status: 502 });
    }
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && !type.includes("gif")) {
      return new NextResponse(await res.arrayBuffer(), {
        headers: {
          "Content-Type": type || "image/png",
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    }
    last = res;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  // Capture never finished — pass through whatever we last got, barely cached
  // so the next open retries.
  if (last) {
    return new NextResponse(await last.arrayBuffer(), {
      headers: {
        "Content-Type": last.headers.get("content-type") ?? "image/gif",
        "Cache-Control": "public, s-maxage=60",
      },
    });
  }
  return new NextResponse("unavailable", { status: 502 });
}
