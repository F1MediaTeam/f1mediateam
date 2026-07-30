// GET /api/pagespeed?url=<page>&strategy=mobile|desktop
//
// Runs Google PageSpeed Insights for one URL. Admin-only, and the target is
// checked against the shared SSRF guard first — this makes the server fetch a
// caller-supplied address, so it must never be pointable at internal hosts.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { isBlockedHost } from "@/lib/url-guard";
import { runPageSpeed, type Strategy } from "@/lib/pagespeed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Lighthouse is slow; give it room rather than truncating a real result.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  await requireAdmin();

  const raw = request.nextUrl.searchParams.get("url")?.trim();
  const strategy: Strategy =
    request.nextUrl.searchParams.get("strategy") === "desktop" ? "desktop" : "mobile";

  if (!raw) return Response.json({ error: "Enter a URL." }, { status: 400 });

  // Check this before running: the anonymous quota is permanently exhausted, so
  // without a key the only outcome is a 429 after a long wait.
  if (!process.env.PAGESPEED_API_KEY) {
    return Response.json(
      {
        error:
          "PAGESPEED_API_KEY isn't set. Create a free key in Google Cloud (enable the PageSpeed Insights API), add it to the Vercel project, and redeploy.",
        needsKey: true,
      },
      { status: 503 },
    );
  }

  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return Response.json({ error: "That doesn't look like a URL." }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return Response.json({ error: "That address can't be checked." }, { status: 400 });
  }

  try {
    const report = await runPageSpeed(target.toString(), strategy);
    return Response.json({ report });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "PageSpeed check failed." },
      { status: 502 },
    );
  }
}
