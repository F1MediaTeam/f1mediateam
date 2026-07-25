"use server";

// Server actions for the admin Tools utilities.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";

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

// ---- Title & meta description generator ----

export interface MetaSuggestion {
  title: string;
  description: string;
}

export interface MetaResult {
  error: string | null;
  suggestions?: MetaSuggestion[];
}

const META_SYSTEM = `You are an expert SEO copywriter. You write page titles and meta descriptions that are accurate, compelling, and follow Google's length guidance: titles about 50-60 characters (never over 60), meta descriptions about 140-155 characters (never over 160). Titles naturally include the primary keyword near the front; descriptions read like a benefit-led sentence or two and end with a soft call to action where it fits. Do not keyword-stuff. Do not use quotation marks around the whole title. Return ONLY valid JSON.`;

export async function generateMetaAction(input: {
  clientId: string;
  page: string;
  keywords: string;
}): Promise<MetaResult> {
  await requireAdmin();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: "ANTHROPIC_API_KEY is not set on this environment." };

  const page = input.page.trim();
  const keywords = input.keywords.trim();
  if (!keywords) return { error: "Add at least one keyword." };

  const client = input.clientId ? await data.getClient(input.clientId) : null;
  const brand = client
    ? `Client: ${client.company_name}${client.websites?.[0] ? ` (${client.websites[0]})` : ""}.`
    : "No specific client selected.";

  const userPrompt = [
    brand,
    page ? `The page is about: ${page}.` : "",
    `Target keywords for this page: ${keywords}.`,
    ``,
    `Write 3 distinct options. Each option is one page title and one meta description for THIS page, working the keywords in naturally.`,
    `Return JSON exactly like: {"suggestions":[{"title":"...","description":"..."},{"title":"...","description":"..."},{"title":"...","description":"..."}]}`,
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        system: META_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch {
    return { error: "Couldn't reach the AI service. Try again." };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { error: `AI error (${res.status}): ${detail.slice(0, 200) || res.statusText}` };
  }

  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (body.content ?? []).map((b) => b.text ?? "").join("").trim();
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as { suggestions?: MetaSuggestion[] };
    const suggestions = (parsed.suggestions ?? [])
      .filter((s) => s && typeof s.title === "string" && typeof s.description === "string")
      .map((s) => ({ title: s.title.trim(), description: s.description.trim() }));
    if (suggestions.length === 0) return { error: "The AI didn't return usable suggestions. Try again." };
    return { error: null, suggestions };
  } catch {
    return { error: "The AI returned an unexpected format. Try again." };
  }
}
