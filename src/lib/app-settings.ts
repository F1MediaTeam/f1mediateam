// Install-wide settings, read and written without going through the `data`
// proxy.
//
// The mock adapter is exposed through a Proxy that promise-ifies every method.
// That works at request time, but the root layout reads the default theme
// during prerender, where the bundled module namespace makes the proxy's get
// trap violate an invariant ("read-only and non-configurable data property")
// and the build fails outright. This module talks to Supabase directly and
// keeps an in-memory value when Supabase isn't configured, so the layout has
// one dependable call on every path.

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_THEME, resolveTheme } from "@/lib/themes";

const memory = new Map<string, unknown>();

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * Read a setting. Never throws — a missing table, an unreachable database, or
 * a build with no credentials all fall back rather than taking down the page
 * that asked.
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (!configured) return (memory.get(key) as T) ?? fallback;
  try {
    // Service client: the default theme is needed on the login page, before
    // anyone is authenticated.
    const supabase = await createServiceClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const row = data as { value: T } | null;
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown, userId: string): Promise<void> {
  if (!configured) {
    memory.set(key, value);
    return;
  }
  // Authed client, so RLS still decides who may write.
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
}

const DEFAULT_THEME_KEY = "default_theme";

/** The theme a browser lands on when it hasn't chosen one of its own. */
export async function getDefaultTheme(): Promise<string> {
  const stored = await getSetting<string>(DEFAULT_THEME_KEY, DEFAULT_THEME);
  // Resolve through the registry so a theme that has since been renamed or
  // removed can't leave the site with an attribute matching no CSS block.
  return resolveTheme(stored).id;
}

export async function setDefaultTheme(themeId: string, userId: string): Promise<void> {
  await setSetting(DEFAULT_THEME_KEY, resolveTheme(themeId).id, userId);
}
