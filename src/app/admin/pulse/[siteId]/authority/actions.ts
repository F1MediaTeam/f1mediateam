"use server";

import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSeoquakeCsv } from "@/lib/pulse/seoquake-import";
import { revalidatePath } from "next/cache";

/**
 * Take a SEOquake SERP export and keep what it knows about every domain in it.
 *
 * One export covers a whole result page, so a single upload records the client
 * and every competitor ranking against them for that search. Stored as domain
 * snapshots, which is where competitor figures already live — so the numbers
 * arrive somewhere the rest of Pulse can already read them rather than in a
 * private corner of the authority panel.
 */
export async function importSeoquakeAction(
  _prev: { message: string | null; error: string | null },
  formData: FormData,
): Promise<{ message: string | null; error: string | null }> {
  await requireAdmin();
  const siteId = String(formData.get("siteId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: null, error: "Choose the CSV you exported from SEOquake." };
  }
  if (file.size > 5_000_000) {
    return { message: null, error: "That file is over 5MB — is it the SERP export?" };
  }

  const { rows, error } = parseSeoquakeCsv(await file.text());
  if (error) return { message: null, error };

  const supabase = await createServiceClient();
  let recorded = 0;

  for (const row of rows) {
    // Nothing worth storing if the export carried no figures for this result.
    if (row.referringDomains === null && row.googleIndex === null && row.rank === null) continue;

    const { data: existing } = await supabase
      .from("pulse_domains")
      .select("id")
      .eq("domain", row.domain)
      .maybeSingle();

    let domainId = (existing as { id: string } | null)?.id ?? null;
    if (!domainId) {
      const { data: made } = await supabase
        .from("pulse_domains")
        .insert({ domain: row.domain })
        .select("id")
        .single();
      domainId = (made as { id: string } | null)?.id ?? null;
    }
    if (!domainId) continue;

    const { error: insErr } = await supabase.from("pulse_domain_snapshots").insert({
      domain_id: domainId,
      ref_domains: row.referringDomains,
      // Marked as its origin rather than as ours: these are SEOquake's figures,
      // which are Semrush's figures, and a panel should be able to say so.
      source: "seoquake",
      mocked: false,
      measured: {
        google_index: row.googleIndex,
        serp_position: row.position,
        rank: row.rank,
        title: row.title,
        imported_at: new Date().toISOString(),
      },
    });
    if (!insErr) recorded += 1;
  }

  if (siteId) revalidatePath(`/admin/pulse/${siteId}`);
  return {
    message: `Read ${rows.length} results and recorded figures for ${recorded} domain${recorded === 1 ? "" : "s"}.`,
    error: null,
  };
}
