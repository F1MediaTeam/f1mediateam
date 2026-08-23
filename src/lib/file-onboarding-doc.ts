// Put the completed onboarding packet where somebody would look for it.
//
// The packet renders its PDF on demand at /api/onboarding-pdf and stores
// nothing, while the Documents library reads a `documents` table and its own
// bucket. So a client could finish the whole packet and their On-Boarding
// folder would still read "0 documents". Both halves worked; they had simply
// never been introduced.
//
// This renders the packet once and files it, so the signed record sits in the
// folder somebody would think to open.

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { data as dataAdapter } from "@/lib/data";
import { DISCLAIMER_VERSION } from "@/lib/types";

const FOLDER_NAME = "On-Boarding";

/** The client's On-Boarding folder, creating it the first time. */
async function ensureFolder(clientId: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data: existing } = await supabase
    .from("document_folders")
    .select("id")
    .eq("client_id", clientId)
    .is("parent_id", null)
    .ilike("name", FOLDER_NAME)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: made } = await supabase
    .from("document_folders")
    .insert({ client_id: clientId, parent_id: null, name: FOLDER_NAME })
    .select("id")
    .single();
  return (made as { id: string } | null)?.id ?? null;
}

/**
 * Render a client's onboarding packet and file it in their Documents library.
 *
 * Idempotent by filename: called twice, the second call finds the document
 * already there and stops. Safe to run on submit and safe to backfill with.
 */
export async function fileOnboardingIntoDocuments(
  clientId: string,
): Promise<{ filed: boolean; reason?: string }> {
  const supabase = await createServiceClient();

  const ob = await dataAdapter.getOnboarding(clientId);
  if (!ob) return { filed: false, reason: "This client has not submitted the packet." };

  const { data: clientRow } = await supabase
    .from("clients")
    .select("company_name")
    .eq("id", clientId)
    .maybeSingle();
  const clientName = (clientRow as { company_name: string } | null)?.company_name ?? "Client";

  const stamp = new Date(ob.submitted_at ?? Date.now()).toISOString().slice(0, 10);
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug}-onboarding-${stamp}.pdf`;

  const folderId = await ensureFolder(clientId);
  if (!folderId) return { filed: false, reason: "Could not create the On-Boarding folder." };

  const { data: already } = await supabase
    .from("documents")
    .select("id")
    .eq("client_id", clientId)
    .eq("folder_id", folderId)
    .eq("filename", filename)
    .maybeSingle();
  if (already) return { filed: false, reason: "Already filed." };

  // Location and timezone were captured at submit time and live on the row,
  // so the rendered document says where and when it was accepted rather than
  // where this code happened to run.
  const meta = ((ob.data as Record<string, unknown>)?._submit_meta ?? {}) as {
    timezone?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    ip?: string | null;
  };
  const where = [meta.city, meta.region, meta.country].filter(Boolean).join(", ");

  const { renderOnboardingPdf } = await import("@/lib/onboarding-pdf");
  const buf = await renderOnboardingPdf({
    clientName,
    submittedAt: ob.submitted_at ?? new Date().toISOString(),
    data: ob.data as Parameters<typeof renderOnboardingPdf>[0]["data"],
    termsVersion: ob.terms_version || DISCLAIMER_VERSION,
    submittedLocation: where || null,
    submittedIp: meta.ip ?? null,
    submittedTimezone: meta.timezone ?? null,
  });

  // A cover-page-only render is a few kilobytes. Filing one would look like
  // success and read like a blank packet.
  if (!buf || buf.length < 15_000) {
    return { filed: false, reason: `Render produced only ${buf?.length ?? 0} bytes; not filing it.` };
  }

  const destPath = `${clientId}/onboarding/${randomUUID()}.pdf`;
  const { error: upError } = await supabase.storage
    .from("documents")
    .upload(destPath, buf, { contentType: "application/pdf", upsert: false });
  if (upError) return { filed: false, reason: upError.message };

  const { error: insError } = await supabase.from("documents").insert({
    client_id: clientId,
    folder_id: folderId,
    filename,
    storage_path: destPath,
    mime_type: "application/pdf",
    size_bytes: buf.length,
    // The packet carries an accepted-terms flag, so this is a signed document.
    signed: true,
  });
  if (insError) {
    // Never leave an orphan object behind when the row fails.
    await supabase.storage.from("documents").remove([destPath]);
    return { filed: false, reason: insError.message };
  }

  return { filed: true };
}
