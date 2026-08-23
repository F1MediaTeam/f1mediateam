"use server";

import { requireAdmin } from "@/lib/auth/session";
import { lookupDomain, type LookupResult } from "@/lib/pulse/lookup";

export async function runLookupAction(
  _prev: { result: LookupResult | null; error: string | null },
  formData: FormData,
): Promise<{ result: LookupResult | null; error: string | null }> {
  await requireAdmin();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!domain) return { result: null, error: "Enter a domain." };
  try {
    const result = await lookupDomain(domain);
    if (result.serverError) return { result, error: result.serverError };
    return { result, error: null };
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : "Lookup failed." };
  }
}
