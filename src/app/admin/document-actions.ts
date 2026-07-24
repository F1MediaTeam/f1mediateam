"use server";

// Server actions for the admin document library. Every one re-checks admin —
// the UI is admin-only but that can't be trusted on its own.
//
// Uploads go straight to the private 'documents' bucket via the service
// client, then a row is inserted. A null client_id targets the shared F1
// Media Team folder.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { data, usingMock } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "documents";
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per document

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 150) || "file";
}

export async function uploadDocumentsAction(
  formData: FormData,
): Promise<{ error: string | null; uploaded?: number }> {
  const session = await requireAdmin();

  // "f1" (or empty) → the shared F1 Media Team folder (client_id null).
  const raw = String(formData.get("client_id") ?? "").trim();
  const clientId = raw && raw !== "f1" ? raw : null;
  const signed = String(formData.get("signed") ?? "") === "on";

  const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "No files were selected." };

  // Mock mode: record metadata only, no storage.
  if (usingMock) {
    for (const f of files) {
      await data.recordDocument({
        client_id: clientId,
        filename: f.name,
        storage_path: `mock/${randomUUID()}`,
        mime_type: f.type || null,
        size_bytes: f.size,
        signed,
        uploaded_by: session.user_id,
      });
    }
    revalidatePath("/admin/documents");
    return { error: null, uploaded: files.length };
  }

  const supabase = await createServiceClient();
  let uploaded = 0;
  const skipped: string[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      skipped.push(`${file.name} (over 50 MB)`);
      continue;
    }
    const folder = clientId ?? "f1-media";
    const path = `${folder}/${randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      skipped.push(`${file.name} (${upErr.message})`);
      continue;
    }
    await data.recordDocument({
      client_id: clientId,
      filename: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      signed,
      uploaded_by: session.user_id,
    });
    uploaded++;
  }

  revalidatePath("/admin/documents");
  if (uploaded === 0) return { error: `Nothing uploaded. ${skipped.join("; ")}` };
  return {
    error: skipped.length ? `Uploaded ${uploaded}; skipped ${skipped.join("; ")}` : null,
    uploaded,
  };
}

export async function deleteDocumentAction(id: string): Promise<{ error: string | null }> {
  await requireAdmin();
  const ok = await data.deleteDocument(id);
  revalidatePath("/admin/documents");
  return { error: ok ? null : "Couldn't delete that document." };
}

export async function toggleDocumentSignedAction(
  id: string,
  signed: boolean,
): Promise<{ error: string | null }> {
  await requireAdmin();
  await data.setDocumentSigned(id, signed);
  revalidatePath("/admin/documents");
  return { error: null };
}

export async function getDocumentDownloadUrl(id: string): Promise<string | null> {
  await requireAdmin();
  return data.documentDownloadUrl(id);
}
