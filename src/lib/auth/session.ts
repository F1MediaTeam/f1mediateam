// Auth session reader. Reads the current Supabase user + profile row and
// returns the Session shape used everywhere in the app.

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { data, usingMock } from "@/lib/data";
import type { Session } from "@/lib/data";
import {
  readImpersonation,
  clearImpersonation,
  endImpersonationRow,
} from "@/lib/auth/impersonate";

// Mock mode: keep the legacy custom cookie path so `npm run dev` without
// Supabase env vars still works for local UI tinkering.
const MOCK_COOKIE = "f1_session";
const ONE_WEEK = 60 * 60 * 24 * 7;
function encodeMock(s: Session): string {
  return Buffer.from(JSON.stringify(s), "utf-8").toString("base64url");
}
function decodeMock(v: string): Session | null {
  try {
    return JSON.parse(Buffer.from(v, "base64url").toString("utf-8")) as Session;
  } catch {
    return null;
  }
}

// React.cache() dedupes within a single React render: layout + page + Shell
// all call getSession() but only one Supabase auth.getUser() + profiles read
// fires per request now.
export const getSession = cache(_getSession);

async function _getSession(): Promise<Session | null> {
  if (usingMock) {
    const jar = await cookies();
    const c = jar.get(MOCK_COOKIE);
    if (!c) return null;
    return decodeMock(c.value);
  }

  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;

  const profile = await data.getProfile(userData.user.id);
  if (!profile) return null;

  // If the real user is an admin and they have an active "view-as" cookie,
  // present the session as if they were a client of that company. Their UI
  // routes to /client, but their actual auth row stays admin (so RLS still
  // sees them as admin and shows all the company's data).
  if (profile.role === "admin") {
    const imp = await readImpersonation();
    if (imp && imp.admin_user_id === profile.id) {
      return {
        user_id: profile.id,
        role: "client",
        client_id: imp.client_id,
        email: profile.email,
        full_name: profile.full_name,
        is_impersonating: true,
        actual_admin_id: profile.id,
        impersonation_id: imp.impersonation_id,
      };
    }
  }

  return {
    user_id: profile.id,
    role: profile.role,
    client_id: profile.client_id,
    email: profile.email,
    full_name: profile.full_name,
  };
}

export async function setMockSession(s: Session): Promise<void> {
  if (!usingMock) return;
  const jar = await cookies();
  jar.set({
    name: MOCK_COOKIE,
    value: encodeMock(s),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_WEEK,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSession(): Promise<void> {
  if (usingMock) {
    const jar = await cookies();
    jar.delete(MOCK_COOKIE);
    return;
  }
  // If we're signing out mid-impersonation, end the impersonation row + clear
  // the cookie too — otherwise the next sign-in reactivates view-as mode.
  const imp = await readImpersonation();
  if (imp) {
    try { await endImpersonationRow(imp.impersonation_id); } catch { /* best effort */ }
    await clearImpersonation();
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "admin") redirect("/client");
  return s;
}

export async function requireClient(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "client" || !s.client_id) redirect("/client");
  return s;
}

export async function requireAuth(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function captureLoginAudit(session: Session) {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    null;
  const ua = hdrs.get("user-agent");
  const city = hdrs.get("x-vercel-ip-city");
  const region = hdrs.get("x-vercel-ip-country-region");
  const country = hdrs.get("x-vercel-ip-country");
  await data.logLogin(session, {
    ip,
    user_agent: ua,
    city: city ? decodeURIComponent(city) : null,
    region: region || null,
    country: country || null,
  });
}
