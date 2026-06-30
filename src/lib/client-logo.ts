// Find brand-asset logos uploaded during onboarding for a client and return
// short-lived signed URLs for the light- and dark-theme variants. Falls back
// to hard-coded static SVGs in public/ for the legacy clients we shipped with
// before onboarding existed (matched by company-name substring).
//
// Filename heuristic, applied to the most recent ~20 brand-asset images:
//   * "light" / "white" / "for-dark" / "on-dark" → dark-theme variant
//       (logo is light-colored, designed to sit on a dark background)
//   * "dark"  / "black" / "for-light" / "on-light" → light-theme variant
//       (logo is dark-colored, designed to sit on a light background)
//   * anything else fills whichever variant is still missing
//
// If only one image exists, both variants resolve to it. Callers should render
// both <img> tags and toggle visibility via [data-theme] selectors so the
// theme switch is instant (no re-fetch).

import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "client-attachments";

export interface ClientLogoUrls {
  dark: string | null;  // shown on dark theme (logo art is light-colored)
  light: string | null; // shown on light theme (logo art is dark-colored)
}

function classify(filename: string): "dark" | "light" | "any" {
  const n = filename.toLowerCase();
  if (/(^|[\W_])(light|white|for-dark|on-dark)([\W_]|$)/.test(n)) return "dark";
  if (/(^|[\W_])(dark|black|for-light|on-light)([\W_]|$)/.test(n)) return "light";
  return "any";
}

// Static logos we shipped before the onboarding upload flow existed. The keys
// are matched as case-insensitive substrings against client.company_name.
const STATIC_FALLBACKS: Array<{ match: string; dark: string; light: string }> = [
  { match: "buckets",            dark: "/buckets-logo-dark.svg",     light: "/buckets-logo-light.svg" },
  { match: "precision graphics", dark: "/precision-graphics-logo.svg", light: "/precision-graphics-logo.svg" },
];

export function getStaticBrandFallback(companyName: string): ClientLogoUrls {
  const n = companyName.toLowerCase();
  const hit = STATIC_FALLBACKS.find((f) => n.includes(f.match));
  return hit ? { dark: hit.dark, light: hit.light } : { dark: null, light: null };
}

export async function getClientBrandLogoUrls(clientId: string, companyName?: string): Promise<ClientLogoUrls> {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("files")
    .select("storage_path, mime_type, filename, created_at")
    .eq("client_id", clientId)
    .eq("category", "onboarding-asset")
    .order("created_at", { ascending: false })
    .limit(20);

  const candidates = (rows ?? []).filter((r) => {
    const mt = (r.mime_type ?? "").toLowerCase();
    if (mt.startsWith("image/")) return true;
    return /\.(png|jpe?g|svg|webp|gif)$/i.test(r.filename ?? "");
  });
  if (candidates.length === 0) {
    return companyName ? getStaticBrandFallback(companyName) : { dark: null, light: null };
  }

  let darkPick: typeof candidates[number] | null = null;
  let lightPick: typeof candidates[number] | null = null;
  for (const c of candidates) {
    const kind = classify(c.filename ?? "");
    if (kind === "dark" && !darkPick) darkPick = c;
    else if (kind === "light" && !lightPick) lightPick = c;
    else if (kind === "any") {
      if (!darkPick) darkPick = c;
      else if (!lightPick) lightPick = c;
    }
    if (darkPick && lightPick) break;
  }
  // Single-logo fallback: same image used in both themes
  if (darkPick && !lightPick) lightPick = darkPick;
  if (lightPick && !darkPick) darkPick = lightPick;

  async function sign(path: string | undefined): Promise<string | null> {
    if (!path) return null;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    return signed?.signedUrl ?? null;
  }

  const [dark, light] = await Promise.all([sign(darkPick?.storage_path), sign(lightPick?.storage_path)]);
  return { dark, light };
}
