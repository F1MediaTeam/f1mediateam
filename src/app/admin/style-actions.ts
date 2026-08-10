"use server";

// Server actions behind the crosshair style inspector. Every one of these
// re-checks the admin role — the inspector UI is admin-only, but that's a
// client component and can't be trusted on its own.

import { revalidatePath } from "next/cache";
import { data } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/session";
import { sanitizeOverride } from "@/lib/ui-overrides";
import { getDefaultTheme, setDefaultTheme } from "@/lib/app-settings";

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

/**
 * Save the whole look — theme *and* style overrides — as the default.
 *
 * These were two separate saves that could drift: the overrides had a
 * checkpoint, the theme had a default, and nothing kept them in step. One
 * button now captures both, so going back to "the one I liked" restores the
 * look that was actually on screen rather than half of it.
 */
export async function saveLookDefaultAction(themeId: string): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  try {
    await data.saveUiDefault(session.user_id);
    await setDefaultTheme(themeId, session.user_id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the default." };
  }
  revalidatePath("/", "layout");
  return { error: null };
}

/**
 * Go back to the saved default. Returns the theme id so the caller can apply
 * it in the browser — the theme lives in localStorage, which the server can't
 * reach.
 */
export async function restoreLookDefaultAction(): Promise<{
  error: string | null;
  themeId: string | null;
}> {
  const session = await requireAdmin();
  try {
    await data.resetUiToDefault(session.user_id);
    const themeId = await getDefaultTheme();
    revalidatePath("/", "layout");
    return { error: null, themeId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Couldn't restore the default.",
      themeId: null,
    };
  }
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

/**
 * Make a theme the install-wide default.
 *
 * The theme each person is looking at lives in their own browser, so this
 * can't reach out and change it for them. What it sets is the starting point:
 * any browser that hasn't picked a theme lands here, including the login page
 * and every new machine. Pressing it again with a different theme selected
 * moves the default — that's the "reinstate it as the new default" case.
 */
export async function setDefaultThemeAction(themeId: string): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  if (!/^[a-z0-9-]{1,32}$/.test(themeId)) return { error: "Unknown theme." };
  try {
    await setDefaultTheme(themeId, session.user_id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the default." };
  }
  // The default is read in the root layout, so everything has to revalidate.
  revalidatePath("/", "layout");
  return { error: null };
}
