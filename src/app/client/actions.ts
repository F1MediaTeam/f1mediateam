"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

export async function addClientContentAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const link = String(formData.get("link") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim() || null;
  await data.createClientContent({
    client_id: session.client_id,
    title,
    body,
    link,
    created_by: session.user_id,
  });
  // Persist any dropped files alongside the content card. Best-effort: if any
  // single file fails to upload, the card itself is still created.
  const { persistAttachments } = await import("@/lib/attachments");
  await persistAttachments({
    formData,
    client_id: session.client_id,
    uploaded_by: session.user_id,
    category: "content-submission",
  });
  revalidatePath("/client/content");
  revalidatePath("/admin/content");
  revalidatePath("/client/files");
  revalidatePath(`/admin/clients/${session.client_id}`);
}

// Sentinel-encode an optional URL into the notes column so the schema doesn't
// need a migration; the calendar UI parses "[URL] <link>" out of the first
// line for clickable rendering.
function composeEventNotes(url: string, body: string): string | null {
  const u = url.trim();
  const b = body.trim();
  if (u && b) return `[URL] ${u}\n\n${b}`;
  if (u) return `[URL] ${u}`;
  if (b) return b;
  return null;
}

export async function createClientCalendarEventAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const title = String(formData.get("title") ?? "").trim();
  const starts_at = String(formData.get("starts_at") ?? "").trim();
  const type = String(formData.get("type") ?? "meeting").trim() as "meeting" | "deadline";
  const url = String(formData.get("url") ?? "").trim();
  const rawNotes = String(formData.get("notes") ?? "").trim();
  const notes = composeEventNotes(url, rawNotes);
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

// Signed URL to download a row from the `files` table (e.g. submitted
// onboarding PDF). Verifies the file belongs to the requesting client.
export async function getFileDownloadUrl(fileId: string): Promise<string | null> {
  const session = await requireClient();
  if (!session.client_id) return null;
  const supabase = await createServiceClient();
  const { data: row } = await supabase
    .from("files")
    .select("storage_path, client_id")
    .eq("id", fileId)
    .maybeSingle();
  const r = row as { storage_path: string; client_id: string } | null;
  if (!r || r.client_id !== session.client_id) return null;
  const { data: signed } = await supabase.storage
    .from("client-attachments")
    .createSignedUrl(r.storage_path, 300);
  return signed?.signedUrl ?? null;
}

// ---------- messages (client → admin) ----------

const MAX_MESSAGE_LEN = 4000;
const MSG_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB per file
const MSG_MAX_ATTACHMENTS = 10;

/**
 * Direct-to-storage upload path: mint one signed upload URL per file so the
 * browser can PUT the bytes straight to Supabase Storage. Bypasses Vercel's
 * platform request-body cap (which cuts the connection before Next.js even
 * sees big multipart uploads).
 */
export async function createClientMessageUploadSlots(
  input: { files: Array<{ name: string; size: number; mime_type: string }> },
): Promise<{ error: string | null; slots?: Array<{ path: string; token: string; signedUrl: string; name: string; mime_type: string; size: number }> }> {
  const session = await requireClient();
  if (!session.client_id) return { error: "No client linked to this session." };
  if (!Array.isArray(input.files) || input.files.length === 0) return { error: "No files." };
  if (input.files.length > MSG_MAX_ATTACHMENTS) {
    return { error: `Too many attachments (max ${MSG_MAX_ATTACHMENTS} per message).` };
  }
  for (const f of input.files) {
    if (!f || typeof f.size !== "number" || f.size <= 0) return { error: "Invalid file." };
    if (f.size > MSG_MAX_ATTACHMENT_BYTES) {
      return { error: `File "${f.name}" is too big (max 50 MB).` };
    }
  }

  const supabase = await createServiceClient();
  const slots: Array<{ path: string; token: string; signedUrl: string; name: string; mime_type: string; size: number }> = [];
  for (const f of input.files) {
    const safeName = f.name.replace(/[^\w.\-]/g, "_").slice(0, 120) || "file";
    const path = `messages/${session.client_id}/${randomUUID()}-${safeName}`;
    const { data: signed, error } = await supabase.storage
      .from("client-attachments")
      .createSignedUploadUrl(path);
    if (error || !signed) return { error: `Failed to create upload URL: ${error?.message ?? "unknown"}` };
    slots.push({
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      name: f.name,
      mime_type: f.mime_type || "application/octet-stream",
      size: f.size,
    });
  }
  return { error: null, slots };
}

export async function sendClientMessageAction(
  formData: FormData,
): Promise<{ error: string | null; id?: string; created_at?: string }> {
  const session = await requireClient();
  if (!session.client_id) return { error: "No client linked to this session." };
  const client_id = String(formData.get("client_id") ?? "");
  // Belt-and-suspenders: form value must match the session's client_id so an
  // admin impersonating a client can't post to a different account by
  // hand-forging the form.
  if (client_id !== session.client_id) return { error: "Client mismatch." };
  const body = String(formData.get("body") ?? "").trim();

  // Attachments were already uploaded directly to Supabase Storage via signed
  // upload URLs. The client passes back the metadata as JSON so we can attach
  // it to the message row without pumping file bytes through Vercel.
  let attachments: Array<{ path: string; name: string; mime_type: string; size: number }> = [];
  const attachmentsJson = String(formData.get("attachments_meta") ?? "").trim();
  if (attachmentsJson) {
    try {
      const parsed = JSON.parse(attachmentsJson) as Array<{ path: string; name: string; mime_type: string; size: number }>;
      if (!Array.isArray(parsed)) throw new Error("expected array");
      if (parsed.length > MSG_MAX_ATTACHMENTS) {
        return { error: `Too many attachments (max ${MSG_MAX_ATTACHMENTS} per message).` };
      }
      attachments = parsed.filter(
        (a) => a && typeof a.path === "string" && a.path.startsWith(`messages/${session.client_id}/`),
      );
    } catch {
      return { error: "Malformed attachments payload." };
    }
  }

  if (!body && attachments.length === 0) return { error: "Message can't be empty." };
  if (body.length > MAX_MESSAGE_LEN) return { error: `Message too long (max ${MAX_MESSAGE_LEN} characters).` };

  try {
    const row = await data.sendMessage({
      client_id: session.client_id,
      from_user_id: session.user_id,
      from_role: "client",
      body,
      attachments,
    });
    revalidatePath("/client");
    revalidatePath("/client/content");
    revalidatePath("/client/settings");
    revalidatePath(`/admin/messages`);
    revalidatePath(`/admin/clients/${session.client_id}`);
    return { error: null, id: row?.id, created_at: row?.created_at };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Send failed." };
  }
}

export async function markClientMessagesReadAction(formData: FormData): Promise<void> {
  const session = await requireClient();
  if (!session.client_id) return;
  const client_id = String(formData.get("client_id") ?? "");
  if (client_id !== session.client_id) return;
  await data.markMessagesRead(session.client_id, "client");
  revalidatePath("/client");
}

export async function setEmailPrefAction(formData: FormData) {
  const session = await requireClient();
  const opted = String(formData.get("opted_out") ?? "false") === "true";
  await data.setEmailPref(session.user_id, opted);
  revalidatePath("/client/settings");
}

export async function submitOnboardingAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const accepted = String(formData.get("accepted_terms") ?? "") === "on";
  if (!accepted) return;
  const dataField = String(formData.get("data") ?? "{}");
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(dataField); } catch { parsed = {}; }

  // Capture submission context (timezone + location) so the PDF can be
  // regenerated later with the correct local time even when the heal-on-
  // load runs from a different request.
  const _hdrs = await headers();
  const _city = _hdrs.get("x-vercel-ip-city");
  const _region = _hdrs.get("x-vercel-ip-country-region");
  const _country = _hdrs.get("x-vercel-ip-country");
  const _ip =
    _hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    _hdrs.get("x-real-ip") ||
    null;
  const _tz = _hdrs.get("x-vercel-ip-timezone");
  parsed._submit_meta = {
    timezone: _tz || null,
    city: _city ? decodeURIComponent(_city) : null,
    region: _region || null,
    country: _country || null,
    ip: _ip,
  };

  const supabase = await createSupabase();
  const { data: row } = await supabase
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
    )
    .select()
    .single();
  // also satisfy the legacy disclaimer for callers that still check it
  await data.recordDisclaimer(session.user_id, DISCLAIMER_VERSION);

  // PDF is no longer pre-rendered on submit — the client portal's Settings
  // page links to /api/onboarding-pdf which renders on demand from this row.
  // We still keep submit-time meta on `parsed._submit_meta` so the on-demand
  // render can label the timestamp with the right timezone / location.
  void row;

  // Brand assets are uploaded independently — if PDF generation fails for
  // any reason, we still want the client's logo / brand files in storage so
  // they appear in the header and in Settings.
  try {
    const assets = formData.getAll("brand_assets");
    if (Array.isArray(assets) && assets.length > 0) {
      const { persistAttachments } = await import("@/lib/attachments");
      await persistAttachments({
        formData,
        fieldName: "brand_assets",
        client_id: session.client_id,
        uploaded_by: session.user_id,
        category: "onboarding-asset",
      });
    }
  } catch (e) {
    console.error("onboarding brand-asset persist failed", e);
  }

  revalidatePath("/client");
  revalidatePath("/client/settings");
  revalidatePath("/client/files");
  revalidatePath(`/admin/clients/${session.client_id}`);
  // Drop the client straight into their dashboard — the OnboardingGate
  // will no longer mount because hasAcceptedDisclaimer is now true, and
  // the saved PDF appears under Settings → Onboarding downloads.
  redirect("/client");
}

// Local helper type to keep the action file's import surface tight.
type OnboardingDataLike = Parameters<typeof import("@/lib/onboarding-pdf").renderOnboardingPdf>[0]["data"];
