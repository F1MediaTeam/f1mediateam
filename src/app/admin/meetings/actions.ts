"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { data, usingMock } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import type { Meeting } from "@/lib/types";

const BUCKET = "meeting-assets";
const MAX_BYTES = 5 * 1024 * 1024;

function extFor(mime: string, name: string): string {
  const fromName = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/gif") return "gif";
  return "bin";
}

// Upload the file to Supabase Storage when available; fall back to inlining
// as a data URI for the mock adapter so /admin/meetings works in any env.
async function persistLogo(file: File, meetingId: string): Promise<string | null> {
  if (file.size === 0) return null;
  if (file.size > MAX_BYTES) return null;
  if (!file.type.startsWith("image/")) return null;

  if (usingMock) {
    const buf = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buf.toString("base64")}`;
  }

  const supabase = await createServiceClient();
  const path = `${meetingId}/${randomUUID()}.${extFor(file.type, file.name)}`;
  const arrayBuf = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuf, {
      contentType: file.type,
      upsert: true,
    });
  if (error) {
    console.error("logo upload failed", error);
    return null;
  }
  return path;
}

async function removeStoredLogo(logoPath: string | null) {
  if (!logoPath) return;
  if (logoPath.startsWith("data:") || logoPath.startsWith("http")) return;
  if (usingMock) return;
  try {
    const supabase = await createServiceClient();
    await supabase.storage.from(BUCKET).remove([logoPath]);
  } catch (e) {
    console.error("logo remove failed", e);
  }
}

// --- create ---

export async function createMeetingAction(formData: FormData) {
  const session = await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const scheduledRaw = String(formData.get("scheduled_at") ?? "").trim();
  const range_from = String(formData.get("range_from") ?? "").trim() || null;
  const range_to = String(formData.get("range_to") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!client_id || !title) return;

  const scheduled_at = scheduledRaw
    ? new Date(scheduledRaw).toISOString()
    : new Date().toISOString();

  const created = await data.createMeeting({
    client_id,
    title,
    scheduled_at,
    range_from,
    range_to,
    notes,
    created_by: session.user_id,
  });
  if (!created) return;

  // Optional logo upload during create.
  const logoFile = formData.get("logo_file");
  if (logoFile instanceof File && logoFile.size > 0) {
    const logoPath = await persistLogo(logoFile, created.id);
    if (logoPath) await data.updateMeeting(created.id, { logo_path: logoPath });
  }

  revalidatePath("/admin/meetings");
  redirect(`/admin/meetings/${created.id}`);
}

// --- update (meeting metadata + logo) ---

export async function updateMeetingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = (await data.getMeeting(id)) as Meeting | null;
  if (!existing) return;

  const title = String(formData.get("title") ?? "").trim() || existing.title;
  const scheduledRaw = String(formData.get("scheduled_at") ?? "").trim();
  const range_from = String(formData.get("range_from") ?? "").trim() || null;
  const range_to = String(formData.get("range_to") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const patch: Partial<Meeting> = {
    title,
    range_from,
    range_to,
    notes,
  };
  if (scheduledRaw) patch.scheduled_at = new Date(scheduledRaw).toISOString();

  // Logo handling: clear flag wins over a new file.
  const shouldClear = String(formData.get("logo_clear") ?? "") === "1";
  const logoFile = formData.get("logo_file");

  if (shouldClear) {
    await removeStoredLogo(existing.logo_path);
    patch.logo_path = null;
  } else if (logoFile instanceof File && logoFile.size > 0) {
    const newPath = await persistLogo(logoFile, id);
    if (newPath) {
      // Best-effort cleanup of the prior logo so we don't accumulate orphans.
      if (existing.logo_path && existing.logo_path !== newPath) {
        await removeStoredLogo(existing.logo_path);
      }
      patch.logo_path = newPath;
    }
  }

  await data.updateMeeting(id, patch);
  revalidatePath(`/admin/meetings/${id}`);
  revalidatePath("/admin/meetings");
}

export async function deleteMeetingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const m = await data.getMeeting(id);
  if (m?.logo_path) await removeStoredLogo(m.logo_path);
  await data.deleteMeeting(id);
  revalidatePath("/admin/meetings");
  redirect("/admin/meetings");
}
