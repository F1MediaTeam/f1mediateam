// Find the most recent image uploaded as a brand asset for a client and return
// a short-lived signed URL for it. Used by surfaces that want to show a logo
// instead of (or alongside) the company name — admin clients grid, client
// dashboard chrome, etc. Returns null when nothing image-shaped has been
// uploaded, so callers can fall back to text.

import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "client-attachments";

export async function getClientBrandLogoUrl(clientId: string): Promise<string | null> {
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
    // some uploads come in without a mime — fall back to filename extension
    return /\.(png|jpe?g|svg|webp|gif)$/i.test(r.filename ?? "");
  });
  const pick = candidates[0];
  if (!pick) return null;

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pick.storage_path, 60 * 60);
  return signed?.signedUrl ?? null;
}
