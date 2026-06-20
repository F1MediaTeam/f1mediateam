// Server-side Supabase client.
// Use in Server Components, Server Actions, and Route Handlers.
// Reads + writes auth cookies via Next.js's async cookies() API.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This is OK — middleware will refresh the session on the next request.
          }
        },
      },
    },
  );
}

// Service-role client for admin-only operations (bypasses RLS).
// Only call this from server actions / route handlers that have already
// authorized the caller. Never expose this to the browser.
export async function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for service-role operations. " +
        "Grab it from Supabase Dashboard → Project Settings → API → Secret keys.",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* no-op — service role doesn't need a user session */ },
      },
    },
  );
}
