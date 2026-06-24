// Cookie-based admin "view as customer" mode.
//
// The cookie holds { admin_user_id, client_id, impersonation_id }. While
// present, getSession() returns a Session where role='client' + client_id is
// the impersonated company, but is_impersonating=true so UIs can show a
// banner and we don't pollute the customer-facing audit log.

import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

const COOKIE = "f1_impersonate";
const MAX_AGE = 60 * 60 * 8; // 8h cap

export interface ImpersonationPayload {
  admin_user_id: string;
  client_id: string;
  impersonation_id: string;
}

function encode(p: ImpersonationPayload): string {
  return Buffer.from(JSON.stringify(p), "utf-8").toString("base64url");
}
function decode(v: string): ImpersonationPayload | null {
  try { return JSON.parse(Buffer.from(v, "base64url").toString("utf-8")) as ImpersonationPayload; }
  catch { return null; }
}

export async function readImpersonation(): Promise<ImpersonationPayload | null> {
  const jar = await cookies();
  const c = jar.get(COOKIE);
  if (!c) return null;
  return decode(c.value);
}

export async function setImpersonation(p: ImpersonationPayload) {
  const jar = await cookies();
  jar.set({
    name: COOKIE, value: encode(p),
    httpOnly: true, sameSite: "lax", path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearImpersonation() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function startImpersonationRow(adminUserId: string, clientId: string): Promise<string> {
  const supabase = await createServiceClient();
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    null;
  const city = hdrs.get("x-vercel-ip-city");
  const region = hdrs.get("x-vercel-ip-country-region");
  const country = hdrs.get("x-vercel-ip-country");
  const { data: row, error } = await supabase
    .from("admin_impersonations")
    .insert({
      admin_user_id: adminUserId,
      client_id: clientId,
      ip,
      city: city ? decodeURIComponent(city) : null,
      region: region || null,
      country: country || null,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Failed to start impersonation");
  return row.id as string;
}

export async function endImpersonationRow(impersonationId: string) {
  const supabase = await createServiceClient();
  await supabase
    .from("admin_impersonations")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", impersonationId)
    .is("ended_at", null);
}
