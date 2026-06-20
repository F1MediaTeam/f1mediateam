"use server";

import { redirect } from "next/navigation";
import { data, usingMock } from "@/lib/data";
import { setMockSession, captureLoginAudit, clearSession } from "@/lib/auth/session";
import { clearImpersonation } from "@/lib/auth/impersonate";
import type { LoginState } from "./types";

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  // Defense-in-depth: kill any stale impersonation cookie before signing in,
  // so the new session can never accidentally land in view-as mode.
  if (!usingMock) await clearImpersonation();

  const session = await data.signIn(email, password);
  if (!session) return { error: "Invalid email or password." };

  if (usingMock) await setMockSession(session);
  await captureLoginAudit(session);

  if (session.role === "admin") redirect("/admin");
  redirect("/client");
}

export async function signUpAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (usingMock) {
    return { error: "Sign-up is only available with Supabase enabled. Use the demo accounts." };
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim() || undefined;
  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const { session, error } = await data.signUp(email, password, fullName);
  if (error) return { error };
  if (!session) return { info: "Check your email for a confirmation link, then sign in.", error: null };

  await captureLoginAudit(session);
  if (session.role === "admin") redirect("/admin");
  redirect("/client");
}

export async function signOutAction() {
  await clearSession();
  redirect("/login");
}
