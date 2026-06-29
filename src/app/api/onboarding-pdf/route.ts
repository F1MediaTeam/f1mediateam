// On-demand onboarding PDF render. No Supabase storage involved — we read
// the client_onboarding row, render the PDF in-memory, and stream it back
// as application/pdf. The client portal's Settings download button hits
// this route.

import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/session";
import { data as dataAdapter } from "@/lib/data";
import { DISCLAIMER_VERSION } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireClient();
  if (!session.client_id) {
    return NextResponse.json({ error: "no client" }, { status: 403 });
  }

  const ob = await dataAdapter.getOnboarding(session.client_id);
  if (!ob) {
    return NextResponse.json({ error: "no onboarding submission" }, { status: 404 });
  }

  const client = await dataAdapter.getClient(session.client_id);
  const meta = ((ob.data as { _submit_meta?: Record<string, unknown> })?._submit_meta ?? {}) as {
    timezone?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    ip?: string | null;
  };
  const locationParts = [meta.city, meta.region, meta.country].filter(Boolean) as string[];

  const { renderOnboardingPdf } = await import("@/lib/onboarding-pdf");
  const buf = await renderOnboardingPdf({
    clientName: client?.company_name ?? "Client",
    submittedAt: ob.submitted_at ?? new Date().toISOString(),
    data: ob.data as Parameters<typeof renderOnboardingPdf>[0]["data"],
    termsVersion: ob.terms_version || DISCLAIMER_VERSION,
    submittedLocation: locationParts.length > 0 ? locationParts.join(", ") : null,
    submittedIp: meta.ip ?? null,
    submittedTimezone: meta.timezone ?? null,
  });

  const safeName = (client?.company_name ?? "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stamp = new Date(ob.submitted_at ?? Date.now()).toISOString().slice(0, 10);
  const filename = `f1-onboarding-${safeName}-${stamp}.pdf`;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
