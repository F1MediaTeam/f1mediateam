"use server";

// Server actions behind the F1 Pulse screens. Each re-checks the admin role —
// the UI is admin-only but that is a client component and can't be trusted.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { staffRoleOf } from "@/lib/permissions";
import { checkInstallation, createSite, getSite } from "@/lib/pulse/sites";

export async function addPulseSiteAction(input: {
  clientId: string;
  domain: string;
  crawlExclusions: string;
}): Promise<{ error: string | null; siteId?: string }> {
  await requireAdmin();
  if (!input.clientId) return { error: "Pick a client." };

  const exclusions = input.crawlExclusions
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const { site, error } = await createSite({
    clientId: input.clientId,
    domain: input.domain,
    crawlExclusions: exclusions,
  });
  if (error || !site) return { error: error ?? "Couldn't add that site." };

  revalidatePath("/admin/pulse");
  return { error: null, siteId: site.id };
}

export async function checkInstallAction(
  siteId: string,
): Promise<{ error: string | null; installed?: boolean; reason?: string }> {
  const session = await requireAdmin();
  const profile = await data.getProfile(session.user_id);
  if (staffRoleOf(profile) === "contractor") {
    return { error: "Contractors can view but not run checks." };
  }

  const site = await getSite(siteId);
  if (!site) return { error: "Unknown site." };

  const result = await checkInstallation(site);
  revalidatePath("/admin/pulse");
  return { error: null, installed: result.installed, reason: result.reason };
}

/** The origin the snippet should point at, taken from the live request. */
export async function pulseOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "f1mediateam.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
