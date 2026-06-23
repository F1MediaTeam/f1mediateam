"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { data, usingMock } from "@/lib/data";
import { requireClient } from "@/lib/auth/session";
import { createClient as createSupabase, createServiceClient } from "@/lib/supabase/server";
import { DISCLAIMER_VERSION } from "@/lib/types";

const ATTACHMENT_BUCKET = "calendar-attachments";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Persist a single uploaded file under <clientId>/<eventId>/<uuid>-<filename>
// in the calendar-attachments bucket and write its metadata row. Returns
// silently on any failure so a flaky upload doesn't roll back the event itself.
async function persistAttachment(
  file: File,
  ctx: { clientId: string; eventId: string; userId: string | null },
): Promise<void> {
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_ATTACHMENT_BYTES) return;
  if (usingMock) {
    // Mock mode has no storage bucket — record metadata only so the dev UI
    // still shows the attachment name, even though the bytes aren't stored.
    await data.recordEventAttachment({
      event_id: ctx.eventId,
      storage_path: `mock://${ctx.clientId}/${ctx.eventId}/${file.name}`,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: ctx.userId,
    });
    return;
  }
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
    const path = `${ctx.clientId}/${ctx.eventId}/${randomUUID()}-${safeName}`;
    const supabase = await createServiceClient();
    const buf = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      console.error("attachment upload failed", upErr);
      return;
    }
    await data.recordEventAttachment({
      event_id: ctx.eventId,
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: ctx.userId,
    });
  } catch (e) {
    console.error("attachment persist failed", e);
  }
}

export async function acceptDisclaimerAction() {
  const session = await requireClient();
  await data.recordDisclaimer(session.user_id, DISCLAIMER_VERSION);
  revalidatePath("/client");
}

export async function approveContentAction(formData: FormData) {
  const session = await requireClient();
  const id = String(formData.get("id") ?? "");
  await data.moveContentStage(id, "forward", {
    user_id: session.user_id,
    role: session.role,
    client_id: session.client_id,
  });
  revalidatePath("/client/content");
}

export async function requestChangesAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const id = String(formData.get("id") ?? "");
  const noteText = String(formData.get("note") ?? "").trim();
  if (!noteText) return;

  // Upload any attached files to the same calendar-attachments bucket the
  // calendar uses (client folder is already RLS-isolated). Storage paths get
  // appended to the change-request note so the admin sees them when reviewing
  // the card's activity log.
  const uploadedPaths: string[] = [];
  const files = formData.getAll("attachments");
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > 25 * 1024 * 1024) continue;
    if (usingMock) {
      uploadedPaths.push(`mock://${session.client_id}/content/${id}/${f.name}`);
      continue;
    }
    try {
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
      const path = `${session.client_id}/content/${id}/${randomUUID()}-${safeName}`;
      const supabase = await createServiceClient();
      const buf = await f.arrayBuffer();
      const { error } = await supabase.storage
        .from("calendar-attachments")
        .upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: false });
      if (!error) uploadedPaths.push(path);
    } catch (e) {
      console.error("change-request file upload failed", e);
    }
  }

  // Compose the note with attachment markers the admin UI can later parse.
  const note = uploadedPaths.length
    ? `${noteText}\n\n${uploadedPaths.map((p) => `[ATTACH:${p}]`).join("\n")}`
    : noteText;

  await data.rejectContent(
    id,
    { user_id: session.user_id, role: session.role, client_id: session.client_id },
    note,
  );
  revalidatePath("/client/content");
  revalidatePath("/client");
}

export async function createClientCalendarEventAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const title = String(formData.get("title") ?? "").trim();
  const starts_at = String(formData.get("starts_at") ?? "").trim();
  const type = String(formData.get("type") ?? "meeting").trim() as "meeting" | "deadline";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!title || !starts_at) return;
  const created = await data.createCalendarEvent({
    client_id: session.client_id,
    title,
    starts_at: new Date(starts_at).toISOString(),
    ends_at: null,
    notes,
    type,
    created_by: session.user_id,
  });

  // Attachments come in as repeated entries with name="attachments".
  if (created) {
    const files = formData.getAll("attachments");
    for (const f of files) {
      if (f instanceof File) {
        await persistAttachment(f, {
          clientId: session.client_id,
          eventId: created.id,
          userId: session.user_id,
        });
      }
    }
  }

  revalidatePath("/client");
}

// Generate a short-lived signed URL the browser can use to download an
// attachment. RLS on calendar_event_attachments ensures the requesting
// session can read this row in the first place.
export async function getAttachmentDownloadUrl(attachmentId: string): Promise<string | null> {
  const session = await requireClient();
  if (!session.client_id) return null;
  const supabase = await createSupabase();
  const { data: row } = await supabase
    .from("calendar_event_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  const path = (row as { storage_path: string } | null)?.storage_path;
  if (!path || path.startsWith("mock://")) return null;
  const { data: signed } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 300);
  return signed?.signedUrl ?? null;
}

export async function setEmailPrefAction(formData: FormData) {
  const session = await requireClient();
  const opted = String(formData.get("opted_out") ?? "false") === "true";
  await data.setEmailPref(session.user_id, opted);
  revalidatePath("/client/settings");
}

export async function changePasswordAction(
  _prev: { error: string | null; ok?: string | null },
  formData: FormData,
): Promise<{ error: string | null; ok?: string | null }> {
  await requireClient();
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) return { error: "Password must be at least 8 characters.", ok: null };
  if (next !== confirm) return { error: "Passwords don't match.", ok: null };
  const supabase = await createSupabase();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/client/settings");
  return { error: null, ok: "Password updated." };
}

export async function submitOnboardingAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const accepted = String(formData.get("accepted_terms") ?? "") === "on";
  if (!accepted) return;
  const dataField = String(formData.get("data") ?? "{}");
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(dataField); } catch { parsed = {}; }

  const supabase = await createSupabase();
  await supabase
    .from("client_onboarding")
    .upsert(
      {
        client_id: session.client_id,
        submitted_by: session.user_id,
        data: parsed,
        terms_version: DISCLAIMER_VERSION,
        accepted_terms: true,
      },
      { onConflict: "client_id" },
    );
  // also satisfy the legacy disclaimer for callers that still check it
  await data.recordDisclaimer(session.user_id, DISCLAIMER_VERSION);
  revalidatePath("/client");
}
