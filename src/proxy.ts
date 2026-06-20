// Project-level proxy (formerly Next.js middleware).
// Refreshes the Supabase access token on every request so navigating
// across server components doesn't expire mid-session.

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, and the logo image.
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\..*).*)",
  ],
};
