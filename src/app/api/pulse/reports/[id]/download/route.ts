// GET /api/pulse/reports/{id}/download?file=pdf|csv&i=0
//
// The bucket is private, so nothing is served directly: this mints a signed URL
// with a short life and redirects to it. The requested file must be one this
// report actually produced — a caller can't pass an arbitrary storage path and
// have it signed, which is how a private bucket usually ends up readable.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { visibleClientIds } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "pulse-reports";
/** Long enough to click, short enough that a copied link goes stale. */
const TTL_SECONDS = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: report } = await supabase
    .from("pulse_reports")
    .select("id, site_id, status, storage_path, csv_paths")
    .eq("id", id)
    .maybeSingle();

  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  if (report.status !== "ready" || !report.storage_path) {
    return NextResponse.json({ error: "That report isn't ready." }, { status: 409 });
  }

  // Same visibility rule as the list: a staffer restricted to some clients
  // can't download another client's report by knowing its id.
  const allowed = await visibleClientIds(session);
  if (allowed !== null && report.site_id) {
    const { data: site } = await supabase
      .from("pulse_sites").select("client_id").eq("id", report.site_id).maybeSingle();
    if (!site || !allowed.includes(site.client_id as string)) {
      return NextResponse.json({ error: "Not your client." }, { status: 403 });
    }
  }

  const which = request.nextUrl.searchParams.get("file") ?? "pdf";
  const csvPaths = (report.csv_paths as string[]) ?? [];

  let path: string | undefined;
  if (which === "pdf") {
    path = report.storage_path as string;
  } else if (which === "csv") {
    const i = Number(request.nextUrl.searchParams.get("i") ?? "0");
    path = Number.isInteger(i) ? csvPaths[i] : undefined;
  }
  if (!path) return NextResponse.json({ error: "No such file on this report." }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    // `download` sets the Content-Disposition so the browser saves the file
    // under its report name rather than opening a tab named by a UUID.
    .createSignedUrl(path, TTL_SECONDS, { download: path.split("/").pop() });

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Could not sign URL." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
