// Self-healing PDF render. The onboarding submit action tries to render
// and persist the PDF inline, but the render is wrapped in a try/catch so
// any failure (bucket missing, lambda timeout, react-pdf hiccup) silently
// drops the artifact. This helper is called at settings page load: if the
// client_onboarding row exists but no onboarding-category file does, it
// regenerates the PDF and inserts the file row. Failure here is logged
// but never throws — settings should still render.

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { data as dataAdapter } from "@/lib/data";
import { DISCLAIMER_VERSION } from "@/lib/types";

// Bump this when the PDF renderer changes structurally — settings page will
// wipe + regenerate any PDF whose filename predates the current version.
const PDF_RENDERER_VERSION = "v7";

export async function ensureOnboardingPdfPersisted(clientId: string): Promise<void> {
  try {
    const ob = await dataAdapter.getOnboarding(clientId);
    if (!ob) return;

    const service = await createServiceClient();
    const { data: existing } = await service
      .from("files")
      .select("id, filename, storage_path, size_bytes")
      .eq("client_id", clientId)
      .eq("category", "onboarding");
    const rows = (existing as { id: string; filename: string | null; storage_path: string; size_bytes: number | null }[] | null) ?? [];

    // Acceptable existing PDF = renamed with current version sentinel AND
    // non-trivial size (truncated renders are tiny — cover-only is ~3-5KB).
    const good = rows.find(
      (r) =>
        (r.filename ?? "").includes(PDF_RENDERER_VERSION) &&
        typeof r.size_bytes === "number" &&
        r.size_bytes > 15_000,
    );
    if (good) return;

    // Stale or partial PDFs: wipe both storage and the files row so we
    // can re-upload cleanly under a new path.
    for (const r of rows) {
      try {
        await service.storage.from("client-attachments").remove([r.storage_path]);
      } catch (e) {
        console.error("ensureOnboardingPdf cleanup storage remove failed:", e);
      }
      try {
        await service.from("files").delete().eq("id", r.id);
      } catch (e) {
        console.error("ensureOnboardingPdf cleanup files delete failed:", e);
      }
    }

    const client = await dataAdapter.getClient(clientId);
    const meta = ((ob.data as { _submit_meta?: Record<string, unknown> })?._submit_meta ?? {}) as {
      timezone?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
      ip?: string | null;
    };
    // Fallback for legacy rows that pre-date _submit_meta — use the current
    // request's edge headers, which will typically be the same client.
    let metaTimezone = meta.timezone ?? null;
    let metaCity = meta.city ?? null;
    let metaRegion = meta.region ?? null;
    let metaCountry = meta.country ?? null;
    let metaIp = meta.ip ?? null;
    if (!metaTimezone) {
      try {
        const hdrs = await headers();
        metaTimezone = hdrs.get("x-vercel-ip-timezone") || null;
        const c = hdrs.get("x-vercel-ip-city");
        metaCity = metaCity || (c ? decodeURIComponent(c) : null);
        metaRegion = metaRegion || hdrs.get("x-vercel-ip-country-region") || null;
        metaCountry = metaCountry || hdrs.get("x-vercel-ip-country") || null;
        metaIp = metaIp || hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null;
      } catch { /* outside a request context — fall through */ }
    }
    const locationParts = [metaCity, metaRegion, metaCountry].filter(Boolean) as string[];
    const { renderOnboardingPdf } = await import("@/lib/onboarding-pdf");
    const buf = await renderOnboardingPdf({
      clientName: client?.company_name ?? "Client",
      submittedAt: ob.submitted_at ?? new Date().toISOString(),
      data: ob.data as Parameters<typeof renderOnboardingPdf>[0]["data"],
      termsVersion: ob.terms_version || DISCLAIMER_VERSION,
      submittedLocation: locationParts.length > 0 ? locationParts.join(", ") : null,
      submittedIp: metaIp,
      submittedTimezone: metaTimezone,
    });
    console.log(`ensureOnboardingPdf rendered ${buf.length} bytes for ${clientId}`);
    if (buf.length < 15_000) {
      console.error(`ensureOnboardingPdf render produced suspiciously small PDF (${buf.length} bytes); aborting upload`);
      return;
    }
    const stamp = new Date(ob.submitted_at ?? Date.now()).toISOString().slice(0, 10);
    const path = `${clientId}/onboarding/${stamp}-onboarding-${PDF_RENDERER_VERSION}-${randomUUID()}.pdf`;
    const { error: uploadErr } = await service.storage
      .from("client-attachments")
      .upload(path, buf, { contentType: "application/pdf", upsert: false });
    if (uploadErr) {
      console.error("ensureOnboardingPdf upload failed:", uploadErr.message);
      return;
    }
    const { error: insertErr } = await service.from("files").insert({
      client_id: clientId,
      filename: `f1-onboarding-${stamp}-${PDF_RENDERER_VERSION}.pdf`,
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
