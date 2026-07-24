"use server";

// Server actions behind the crosshair style inspector. Every one of these
// re-checks the admin role — the inspector UI is admin-only, but that's a
// client component and can't be trusted on its own.

import { revalidatePath } from "next/cache";
import { data } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/session";
import { sanitizeOverride } from "@/lib/ui-overrides";

// The override <style> block renders from the admin layout, so the whole
// /admin subtree has to revalidate for a change to show everywhere.
function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

export async function saveStyleOverrideAction(input: {
  scope: string;
  selector: string;
  styles: Record<string, string>;
}): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  const override = sanitizeOverride(input);
  if (!override) {
    return { error: "That style couldn't be saved — unrecognized target or value." };
  }
  try {
    await data.upsertUiOverride(override, session.user_id);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return { error: `Couldn't save: ${detail}. Has migration 0015 been applied?` };
  }
  revalidateAdmin();
  return { error: null };
}

/** Clear one target's override, leaving everything else in place. */
export async function clearStyleOverrideAction(
  scope: string,
  selector: string,
): Promise<{ error: string | null }> {
  await requireAdmin();
  await data.deleteUiOverride(scope, selector);
  revalidateAdmin();
  return { error: null };
}

/** "Set as default" — snapshot everything currently applied so later edits
 *  can always be rolled back to this point. */
export async function setStyleDefaultAction(): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  await data.saveUiDefault(session.user_id);
  revalidateAdmin();
  return { error: null };
}

/** "Reset" — discard edits made since the last "Set as default". */
export async function resetStyleToDefaultAction(): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  await data.resetUiToDefault(session.user_id);
  revalidateAdmin();
  return { error: null };
}

/** "Restore original" — drop every override and fall back to globals.css. */
export async function restoreOriginalStylesAction(): Promise<{ error: string | null }> {
  await requireAdmin();
  await data.clearUiOverrides();
  revalidateAdmin();
  return { error: null };
}
