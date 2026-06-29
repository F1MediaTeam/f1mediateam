// Self-healing PDF render. The onboarding submit action tries to render
// and persist the PDF inline, but the render is wrapped in a try/catch so
// any failure (bucket missing, lambda timeout, react-pdf hiccup) silently
// drops the artifact. This helper is called at settings page load: if the
// client_onboarding row exists but no onboarding-category file does, it
// regenerates the PDF and inserts the file row. Failure here is logged
// but never throws — settings should still render.

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { data as dataAdapter } from "@/lib/data";
import { DISCLAIMER_VERSION } from "@/lib/types";

export async function ensureOnboardingPdfPersisted(clientId: string): Promise<void> {
  try {
    // 1. Has the client actually submitted onboarding?
    const ob = await dataAdapter.getOnboarding(clientId);
    if (!ob) return;

    // 2. Do we already have a persisted PDF for it?
    const service = await createServiceClient();
    const { data: existing } = await service
      .from("files")
      .select("id")
      .eq("client_id", clientId)
      .eq("category", "onboarding")
      .limit(1);
    if (existing && existing.length > 0) return;

    // 3. Render + upload + insert.
    const client = await dataAdapter.getClient(clientId);
    const { renderOnboardingPdf } = await import("@/lib/onboarding-pdf");
    const buf = await renderOnboardingPdf({
      clientName: client?.company_name ?? "Client",
      submittedAt: ob.submitted_at ?? new Date().toISOString(),
      data: ob.data as Parameters<typeof renderOnboardingPdf>[0]["data"],
      termsVersion: ob.terms_version || DISCLAIMER_VERSION,
    });
    const stamp = new Date(ob.submitted_at ?? Date.now()).toISOString().slice(0, 10);
    const path = `${clientId}/onboarding/${stamp}-onboarding-${randomUUID()}.pdf`;
    const { error: uploadErr } = await service.storage
      .from("client-attachments")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (uploadErr) {
      console.error("ensureOnboardingPdf upload failed:", uploadErr.message);
      return;
    }
    const { error: insertErr } = await service.from("files").insert({
      client_id: clientId,
      filename: `f1-onboarding-${stamp}.pdf`,
      storage_path: path,
      mime_type: "application/pdf",
      size_bytes: buf.length,
      category: "onboarding",
      uploaded_by: ob.submitted_by,
    });
    if (insertErr) {
      console.error("ensureOnboardingPdf files insert failed:", insertErr.message);
    }
  } catch (e) {
    console.error("ensureOnboardingPdf unexpected error:", e);
  }
}
