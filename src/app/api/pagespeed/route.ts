// GET /api/pagespeed?url=<page>
//
// Speed check for one URL. Admin-only, and the target is checked against the
// shared SSRF guard first — this makes the server fetch a caller-supplied
// address, so it must never be pointable at internal hosts.
//
// Always runs the direct audit (src/lib/speed-audit.ts), which measures the
// page by fetching it and needs no credentials. When PAGESPEED_API_KEY is set
// it additionally runs Google PageSpeed Insights for mobile and desktop, which
// adds the Lighthouse score and real-user Core Web Vitals. PSI is an
// enhancement, never a prerequisite: without a key it is simply omitted, and
// if it fails the audit is still returned.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { isBlockedHost } from "@/lib/url-guard";
import { runPageSpeed, type PageSpeedReport } from "@/lib/pagespeed";
import { runSpeedAudit } from "@/lib/speed-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Lighthouse is slow; give it room rather than truncating a real result.
export const maxDuration = 60;

/** Node's socket errors are unreadable to anyone who isn't a developer. */
function readableError(err: unknown, hostname: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (/ENOTFOUND|EAI_AGAIN/.test(raw)) return `Couldn't find ${hostname}. Check the address.`;
  if (/ECONNREFUSED/.test(raw)) return `${hostname} refused the connection.`;
  if (/ECONNRESET|EPIPE/.test(raw)) return `${hostname} closed the connection mid-request.`;
  if (/CERT|SSL|TLS|altnames/i.test(raw)) return `${hostname} has an HTTPS certificate problem.`;
  if (/Timed out|ETIMEDOUT/i.test(raw)) return `${hostname} took too long to respond.`;
  return raw || "Couldn't load that page.";
}

export async function GET(request: NextRequest) {
  await requireAdmin();

  const raw = request.nextUrl.searchParams.get("url")?.trim();

  if (!raw) return Response.json({ error: "Enter a URL." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return Response.json({ error: "That doesn't look like a URL." }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return Response.json({ error: "That address can't be checked." }, { status: 400 });
  }

  const href = target.toString();

  let audit;
  try {
    audit = await runSpeedAudit(href);
  } catch (err) {
    return Response.json({ error: readableError(err, target.hostname) }, { status: 502 });
  }

  // PSI is best-effort on top. Each strategy is a full Lighthouse run, so they
  // go in parallel; either failing just drops that panel.
  let psi: PageSpeedReport[] = [];
  if (process.env.PAGESPEED_API_KEY) {
    const settled = await Promise.allSettled([
      runPageSpeed(href, "mobile"),
      runPageSpeed(href, "desktop"),
    ]);
    psi = settled
      .filter((r): r is PromiseFulfilledResult<PageSpeedReport> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  return Response.json({ audit, psi });
}
