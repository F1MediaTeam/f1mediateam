"use server";

import { revalidatePath } from "next/cache";
import { data } from "@/lib/data";
import { requireClient } from "@/lib/auth/session";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { DISCLAIMER_VERSION } from "@/lib/types";

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
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;
  await data.rejectContent(
    id,
    { user_id: session.user_id, role: session.role, client_id: session.client_id },
    note,
  );
  revalidatePath("/client/content");
}

export async function createClientCalendarEventAction(formData: FormData) {
  const session = await requireClient();
  if (!session.client_id) return;
  const title = String(formData.get("title") ?? "").trim();
  const starts_at = String(formData.get("starts_at") ?? "").trim();
  const type = String(formData.get("type") ?? "meeting").trim() as "meeting" | "deadline";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!title || !starts_at) return;
  await data.createCalendarEvent({
    client_id: session.client_id,
    title,
    starts_at: new Date(starts_at).toISOString(),
    ends_at: null,
    notes,
    type,
    created_by: session.user_id,
  });
  revalidatePath("/client");
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
