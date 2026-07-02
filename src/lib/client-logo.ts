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

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { usingMock } from "@/lib/data";

const BUCKET = "client-attachments";

// Sign a storage URL and cache the result in Next.js's data cache, keyed by
// path. The URL is valid for 7 days; we cache for 6 days so the same URL is
// returned across requests, which means the browser's image cache + Vercel's
// edge cache both hit for the entire window. Without this every request would
// produce a fresh signed URL (new query string), invalidating browser cache
// and forcing a full re-download of every logo on every page load.
const signLogoUrl = unstable_cache(
  async (path: string): Promise<string | null> => {
    const supabase = await createServiceClient();
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    return signed?.signedUrl ?? null;
  },
  ["client-logo-signed-url"],
  { revalidate: 60 * 60 * 24 * 6, tags: ["client-logos"] },
);

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

// Per-request memoized: Shell is mounted by every /client/* page, and we don't
// want a fresh files-table query + signed-URL pair per render of the same path.
export const getClientBrandLogoUrls = cache(async (clientId: string, companyName?: string): Promise<ClientLogoUrls> => {
  // Mock mode has no storage bucket — static fallbacks only.
  if (usingMock) {
    return companyName ? getStaticBrandFallback(companyName) : { dark: null, light: null };
  }
  const filesClient = await createServiceClient();
  const { data: rows } = await filesClient
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

  // Cached signed URLs — stable across requests so the browser keeps the image
  // in its cache instead of redownloading on every navigation.
  const [dark, light] = await Promise.all([
    darkPick?.storage_path ? signLogoUrl(darkPick.storage_path) : null,
    lightPick?.storage_path ? signLogoUrl(lightPick.storage_path) : null,
  ]);
  return { dark, light };
});

// Batched variant: single files-table query for many clients, then sign in
// parallel. Used by the admin clients grid to avoid N parallel files queries
// (one per card) — drops it to 1 db round trip + 2N storage signs.
export async function getClientBrandLogoUrlsByClients(
  clients: Array<{ id: string; company_name: string }>,
): Promise<Map<string, ClientLogoUrls>> {
  const out = new Map<string, ClientLogoUrls>();
  if (clients.length === 0) return out;
  // Mock mode has no storage bucket — static fallbacks only.
  if (usingMock) {
    for (const c of clients) out.set(c.id, getStaticBrandFallback(c.company_name));
    return out;
  }
  const filesClient = await createServiceClient();
  const { data: rows } = await filesClient
    .from("files")
    .select("client_id, storage_path, mime_type, filename, created_at")
    .in("client_id", clients.map((c) => c.id))
    .eq("category", "onboarding-asset")
    .order("created_at", { ascending: false });

  // Bucket files per client_id.
  const filesByClient = new Map<string, Array<{ storage_path: string; filename: string; mime_type: string | null }>>();
  for (const c of clients) filesByClient.set(c.id, []);
  for (const r of (rows ?? []) as Array<{ client_id: string; storage_path: string; filename: string; mime_type: string | null }>) {
    filesByClient.get(r.client_id)?.push(r);
  }

  // For each client, classify + pick dark/light + queue the signing.
  type Job = { clientId: string; darkPath?: string; lightPath?: string };
  const jobs: Job[] = [];
  for (const c of clients) {
    const candidates = (filesByClient.get(c.id) ?? []).filter((r) => {
      const mt = (r.mime_type ?? "").toLowerCase();
      if (mt.startsWith("image/")) return true;
      return /\.(png|jpe?g|svg|webp|gif)$/i.test(r.filename ?? "");
    });
    if (candidates.length === 0) {
      out.set(c.id, getStaticBrandFallback(c.company_name));
      continue;
    }
    let darkPick: typeof candidates[number] | null = null;
    let lightPick: typeof candidates[number] | null = null;
    for (const cand of candidates) {
      const kind = classify(cand.filename ?? "");
      if (kind === "dark" && !darkPick) darkPick = cand;
      else if (kind === "light" && !lightPick) lightPick = cand;
      else if (kind === "any") {
        if (!darkPick) darkPick = cand;
        else if (!lightPick) lightPick = cand;
      }
      if (darkPick && lightPick) break;
    }
    if (darkPick && !lightPick) lightPick = darkPick;
    if (lightPick && !darkPick) darkPick = lightPick;
    jobs.push({ clientId: c.id, darkPath: darkPick?.storage_path, lightPath: lightPick?.storage_path });
  }

  const signed = await Promise.all(
    jobs.map(async (j) => ({
      clientId: j.clientId,
      dark: j.darkPath ? await signLogoUrl(j.darkPath) : null,
      light: j.lightPath ? await signLogoUrl(j.lightPath) : null,
    })),
  );
  for (const s of signed) out.set(s.clientId, { dark: s.dark, light: s.light });
  return out;
}
