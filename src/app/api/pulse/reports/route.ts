// POST /api/pulse/reports  — generate a report
// GET  /api/pulse/reports?siteId=… — list what's already been generated
//
// Synchronous by design. React-PDF has no browser to boot, and the Monthly
// report renders in roughly half a second against real client data, so a queue
// and a worker would be machinery for a problem that doesn't exist yet. The
// row is written before rendering starts, so a report that dies mid-render
// leaves a "failed" record with the reason rather than a silent nothing.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/server";
import { staffRoleOf } from "@/lib/permissions";
import { visibleClientIds } from "@/lib/permissions.server";
import { getSite } from "@/lib/pulse/sites";
import { clientColor } from "@/lib/client-color";
import {
  loadAgency, reportFilename, resolveRange, templateById,
  type RangeKind, type TemplateId,
} from "@/lib/pulse/reports/core";
import { gatherMonthly } from "@/lib/pulse/reports/data";
import { renderMonthly } from "@/lib/pulse/reports/templates/monthly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "pulse-reports";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const siteId = request.nextUrl.searchParams.get("siteId");
  const supabase = await createServiceClient();
  let query = supabase
    .from("pulse_reports")
    .select("id, site_id, domain, template, range_label, status, mocked, file_size, csv_paths, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (siteId) query = query.eq("site_id", siteId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A staffer who can't see a client can't see that client's reports either.
  const allowed = await visibleClientIds(session);
  if (allowed === null) return NextResponse.json({ reports: rows ?? [] });

  const { data: sites } = await supabase
    .from("pulse_sites").select("id, client_id").in("client_id", allowed);
  const visible = new Set((sites ?? []).map((s) => s.id as string));
  return NextResponse.json({
    reports: (rows ?? []).filter((r) => !r.site_id || visible.has(r.site_id as string)),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const profile = await data.getProfile(session.user_id);
  if (staffRoleOf(profile) === "contractor") {
    return NextResponse.json({ error: "Contractors can view but not generate." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: string;
    template?: TemplateId;
    range?: RangeKind;
    from?: string;
    to?: string;
    coverStyle?: "light" | "dark";
  };

  const template = templateById(body.template ?? "monthly");
  if (!template) {
    return NextResponse.json({ error: "Unknown report template." }, { status: 400 });
  }
  if (!template.live) {
    return NextResponse.json(
      { error: `${template.name} needs collectors that aren't built yet.` },
      { status: 409 },
    );
  }
  if (!body.siteId) {
    return NextResponse.json({ error: "siteId is required." }, { status: 400 });
  }

  const site = await getSite(body.siteId);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  const allowed = await visibleClientIds(session);
  if (allowed !== null && !allowed.includes(site.client_id)) {
    return NextResponse.json({ error: "Not your client." }, { status: 403 });
  }

  const client = (await data.listClients()).find((c) => c.id === site.client_id);
  const clientName = client?.company_name ?? site.domain;
  const agency = await loadAgency();

  // The clock is read exactly once, here, and passed down — so every date in
  // the document agrees with every other one even across a midnight boundary.
  const now = new Date();
  const range = resolveRange(
    body.range ?? "last_month",
    now,
    body.from && body.to ? { from: body.from, to: body.to } : undefined,
  );

  const supabase = await createServiceClient();
  const { data: row, error: insErr } = await supabase
    .from("pulse_reports")
    .insert({
      site_id: site.id,
      domain: site.domain,
      template: template.id,
      range_label: range.label,
      range_from: range.from,
      range_to: range.to,
      cover_style: body.coverStyle ?? "light",
      status: "rendering",
      created_by: session.user_id,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    return NextResponse.json({ error: insErr?.message ?? "Could not start report." }, { status: 500 });
  }
  const reportId = row.id as string;

  const fail = async (message: string) => {
    await supabase.from("pulse_reports").update({ status: "failed", error: message }).eq("id", reportId);
    return NextResponse.json({ error: message, reportId }, { status: 500 });
  };

  try {
    const gathered = await gatherMonthly(site.id, range, site.brand_terms ?? [], site.domain);

    const base = { agencyName: agency.name, clientName, range, template: template.id };
    const csvNames = {
      pages: reportFilename({ ...base, ext: "csv", suffix: "top pages" }),
      queries: reportFilename({ ...base, ext: "csv", suffix: "search terms" }),
      rankings: reportFilename({ ...base, ext: "csv", suffix: "rankings" }),
      issues: reportFilename({ ...base, ext: "csv", suffix: "site issues" }),
    };

    const { pdf, csvs } = await renderMonthly({
      meta: {
        agency,
        clientName,
        domain: site.domain,
        title: template.name,
        rangeLabel: range.label,
        // Formatted once here rather than inside the document, so a
        // regenerated report is byte-identical to the original.
        generatedOn: now.toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix",
        }),
        coverStyle: body.coverStyle ?? "light",
        mocked: false,
      },
      range,
      data: gathered,
      accent: clientColor(client ?? { id: site.client_id }).hex,
      csvNames,
    });

    // Foldered by report id: a regenerate never collides with an earlier run,
    // and deleting the row's folder deletes everything it produced.
    const pdfName = reportFilename({ ...base });
    const pdfPath = `${site.id}/${reportId}/${pdfName}`;

    const up = await supabase.storage
      .from(BUCKET)
      .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
    if (up.error) return await fail(`Upload failed: ${up.error.message}`);

    const csvPaths: string[] = [];
    for (const c of csvs) {
      const p = `${site.id}/${reportId}/${c.name}`;
      const r = await supabase.storage
        .from(BUCKET)
        .upload(p, c.content, { contentType: "text/csv", upsert: true });
      // A missing CSV companion is a degraded report, not a failed one — the
      // PDF is the deliverable and it is already stored.
      if (!r.error) csvPaths.push(p);
    }

    await supabase
      .from("pulse_reports")
      .update({
        status: "ready",
        storage_path: pdfPath,
        csv_paths: csvPaths,
        file_size: pdf.length,
        mocked: false,
      })
      .eq("id", reportId);

    return NextResponse.json({
      reportId,
      filename: pdfName,
      size: pdf.length,
      csvs: csvPaths.length,
      rangeLabel: range.label,
      missing: gathered.missing,
    });
  } catch (err) {
    return await fail(err instanceof Error ? err.message : "Report generation failed.");
  }
}
