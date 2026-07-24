"use server";

// Server actions for the admin Tools utilities.

import { requireAdmin } from "@/lib/auth/session";

export interface RedirectHop {
  url: string;
  status: number;
  location: string | null;
}

export interface RedirectResult {
  chain: RedirectHop[];
  finalUrl: string | null;
  error: string | null;
}

const MAX_HOPS = 10;

// The checker fetches an arbitrary URL server-side, so block anything that
// isn't a public http(s) host — no localhost, no private ranges, no other
// schemes. Admin-only, but this keeps it from being used to probe internal
// services.
function isPublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return u;
}

export async function checkRedirectsAction(input: string): Promise<RedirectResult> {
  await requireAdmin();

  const raw = input.trim();
  const start = isPublicHttpUrl(raw.match(/^https?:\/\//i) ? raw : `https://${raw}`);
  if (!start) return { chain: [], finalUrl: null, error: "Enter a valid public http(s) URL." };

  const chain: RedirectHop[] = [];
  let current = start.toString();

  for (let i = 0; i < MAX_HOPS; i++) {
    const validated = isPublicHttpUrl(current);
    if (!validated) {
      return { chain, finalUrl: null, error: "Redirected to a non-public address — stopped." };
    }

    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "F1MediaTeam-redirect-checker" },
      });
    } catch {
      return { chain, finalUrl: null, error: `Couldn't reach ${current}.` };
    } finally {
      clearTimeout(timer);
    }

    const location = res.headers.get("location");
    chain.push({ url: current, status: res.status, location });

    const isRedirect = res.status >= 300 && res.status < 400 && location;
    if (!isRedirect) {
      return { chain, finalUrl: current, error: null };
    }

    // Resolve relative Location headers against the current URL.
    try {
      current = new URL(location, current).toString();
    } catch {
      return { chain, finalUrl: null, error: `Bad redirect target: ${location}` };
    }
  }

  return { chain, finalUrl: null, error: `Stopped after ${MAX_HOPS} redirects — possible loop.` };
}
