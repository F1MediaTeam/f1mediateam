// Shared attachment handling. Reads File entries off a FormData (under a given
// field name), uploads each to Supabase Storage under the client's prefix, and
// records a row in the `files` table. Safe to call from any server action that
// already has `client_id` + `uploaded_by`. Files are best-effort: a single bad
// file doesn't abort the parent action; we just log and skip it.

import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { usingMock } from "@/lib/data";

const BUCKET = "client-attachments";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

function extFromName(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

export interface PersistedAttachment {
  storage_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
}

/** Pull files off FormData[name], upload + insert files rows. Returns the persisted set. */
export async function persistAttachments(args: {
  formData: FormData;
  fieldName?: string;
  client_id: string;
  uploaded_by?: string | null;
  category?: string | null;
}): Promise<PersistedAttachment[]> {
  const { formData, fieldName = "attachments", client_id, uploaded_by = null, category = null } = args;

  const entries = formData.getAll(fieldName);
  const files: File[] = entries.filter((e): e is File => e instanceof File && e.size > 0);
  if (files.length === 0) return [];

  // Mock mode: skip storage entirely. Useful for `npm run dev` without Supabase.
  if (usingMock) return [];

  const supabase = await createServiceClient();
  const out: PersistedAttachment[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      console.warn(`attachment ${file.name} skipped — exceeds ${MAX_BYTES} bytes`);
      continue;
    }
    const storage_path = `${client_id}/${randomUUID()}.${extFromName(file.name)}`;
    try {
      const arrayBuf = await file.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storage_path, arrayBuf, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadErr) {
        console.error(`attachment upload failed: ${uploadErr.message}`);
        continue;
      }
      const { error: insertErr } = await supabase.from("files").insert({
        client_id,
        filename: file.name,
        storage_path,
        mime_type: file.type || null,
        size_bytes: file.size,
        category,
        uploaded_by,
      });
      if (insertErr) {
        console.error(`attachment files row failed: ${insertErr.message}`);
        // Best-effort: try to delete the orphaned storage object.
        await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => undefined);
        continue;
      }
      out.push({
        storage_path,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
      });
    } catch (e) {
      console.error("attachment processing failed", e);
    }
  }

  return out;
}
