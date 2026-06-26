// POST /api/monthly-report
//
// The F1 Media monthly report pipeline:
//   1. Pull STRUCTURED_DATA for the client + window (GSC totals + top pages,
//      content cards posted in window, SEMrush deep-pull rows, last login).
//   2. Pull FIELDY_TRANSCRIPT for the same window.
//   3. Send both to Claude with SYNTHESIS_SYSTEM_PROMPT → strict JSON content
//      object (see deck-builder MonthlyContent).
//   4. Render via generateDeck() → .pptx Buffer.
//   5. Upload to client-attachments storage under {client_id}/reports/...
//      and return the file directly as the form posted target=_blank.
//
// Tier + brand are read off the FormData (or the clients row if those columns
// exist post-migration). Output is `.pptx`.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { resolveRange } from "@/lib/deck/ai-narrative";
import { fieldyMeetingsInWindow, fieldyConfigured } from "@/lib/connectors/fieldy";
import { fetchClientGscPages } from "@/lib/connectors/gsc";
import { todayIso } from "@/lib/utils";
import { generateDeck, type BrandConfig, type MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";
import { SYNTHESIS_SYSTEM_PROMPT } from "@/lib/deck/f1-monthly/synthesis-prompt";
import brandConfigs from "@/lib/deck/f1-monthly/brand-configs.json";
import { createServiceClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_MODEL = "claude-opus-4-7";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ATTACHMENT_BUCKET = "client-attachments";

function field(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeTier(raw: string): "1" | "2" | "3" {
  const v = raw.toLowerCase();
  if (v.startsWith("3") || /domination/.test(v)) return "3";
  if (v.startsWith("2") || /growth|authority/.test(v)) return "2";
  return "1";
}

async function resolveBrand(formData: FormData, companyName: string): Promise<BrandConfig> {
  const brandKey = field(formData, "brand_key") || slugify(companyName);
  const known = (brandConfigs as Record<string, BrandConfig>)[brandKey];
  const base: BrandConfig = known
    ? { ...known }
    : { ...(brandConfigs as Record<string, BrandConfig>).default, name: companyName };

  // Form values override the file-stored config.
  const fp = field(formData, "accent") || field(formData, "brand_primary");
  const fs = field(formData, "brand_secondary");
  const ft = field(formData, "brand_tertiary");
  if (fp) base.primary = fp.replace(/^#/, "");
  if (fs) base.secondary = fs.replace(/^#/, "");
  if (ft) base.tertiary = ft.replace(/^#/, "");

  const logoUrl = field(formData, "logo_url");
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length < 4_000_000) {
          const ct = res.headers.get("content-type") || "image/png";
          base.logoData = `data:${ct};base64,${buf.toString("base64")}`;
        }
      }
    } catch {
      // ignore — slide just falls back to the company name in text
    }
  }
  return base;
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return String(Math.round(n));
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function inRange(captured: string, from: string, to: string): boolean {
  return captured >= from && captured <= to;
}

function sumInRange(series: { captured_at: string; value: number }[], from: string, to: string): number {
  return series.filter((s) => inRange(s.captured_at, from, to)).reduce((a, s) => a + s.value, 0);
}

function avgInRange(series: { captured_at: string; value: number }[], from: string, to: string): number | null {
  const w = series.filter((s) => inRange(s.captured_at, from, to));
  if (!w.length) return null;
  return w.reduce((a, s) => a + s.value, 0) / w.length;
}

interface ClaudeResp {
  content: Array<{ type: string; text?: string }>;
}

async function synthesize(structured: unknown, transcript: string): Promise<MonthlyContent> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const userMsg =
    "STRUCTURED_DATA (source of truth for all numbers):\n" +
    JSON.stringify(structured, null, 2) +
    "\n\nFIELDY_TRANSCRIPT (qualitative context only — never a metrics source):\n" +
    transcript +
    "\n\nReturn ONLY the content object as valid JSON.";

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ClaudeResp;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as MonthlyContent;
  } catch {
    throw new Error("Claude response was not valid JSON. First 200 chars: " + cleaned.slice(0, 200));
  }
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const fd = await request.formData();

  const clientId = field(fd, "client_id");
  if (!clientId) return new Response("client_id required", { status: 400 });

  const client = await data.getClient(clientId);
  if (!client) return new Response("Client not found", { status: 404 });

  const today = todayIso("America/Los_Angeles");
  const window = resolveRange(field(fd, "range") || "28d", field(fd, "from") || null, field(fd, "to") || null, today);

  // ---------- 1. STRUCTURED_DATA ----------
  const [
    clicksAll, imprAll, posAll, ctrAll,
    sessionsAll,
    contentCards,
    topPages,
    semrushReports,
  ] = await Promise.all([
    data.listSnapshots({ clientId, metric: "clicks" }),
    data.listSnapshots({ clientId, metric: "impressions" }),
    data.listSnapshots({ clientId, metric: "avg_position" }),
    data.listSnapshots({ clientId, metric: "ctr" }),
    data.listSnapshots({ clientId, metric: "sessions" }),
    data.listContent({ clientId }),
    fetchClientGscPages(clientId, window.fromIso, window.toIso, 8).catch(() => []),
    data.listSemrushReports(clientId).catch(() => []),
  ]);

  // Window totals
  const clicksCur = sumInRange(clicksAll, window.fromIso, window.toIso);
  const clicksPrev = sumInRange(clicksAll, window.prevFromIso, window.prevToIso);
  const imprCur = sumInRange(imprAll, window.fromIso, window.toIso);
  const imprPrev = sumInRange(imprAll, window.prevFromIso, window.prevToIso);
  const avgPosCur = avgInRange(posAll, window.fromIso, window.toIso);
  const ctrCur = avgInRange(ctrAll, window.fromIso, window.toIso);
  const sessionsCur = sumInRange(sessionsAll, window.fromIso, window.toIso);

  // Daily trend for slide 4 (use clicks)
  const trendPoints = clicksAll
    .filter((s) => inRange(s.captured_at, window.fromIso, window.toIso))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  // Content cards posted within the window (slide 5)
  const postedInWindow = contentCards.filter(
    (c) => c.stage === "posted" && c.updated_at.slice(0, 10) >= window.fromIso && c.updated_at.slice(0, 10) <= window.toIso,
  );
  const pipeline = contentCards.filter((c) => c.stage === "proposed" || c.stage === "pending");

  // Semrush insights extracted from the deep pull if present
  type SemrushReport = (typeof semrushReports)[number];
  const reportRows = (label: string): Array<Record<string, unknown>> => {
    const r: SemrushReport | undefined = semrushReports.find((rr) => {
      const meta = (rr.meta ?? {}) as Record<string, unknown>;
      const l = String(meta.label ?? rr.report_type).toLowerCase();
      return l.includes(label.toLowerCase());
    });
    return (r?.rows ?? []) as Array<Record<string, unknown>>;
  };
  const semrushCompetitors = reportRows("competitor").slice(0, 5);
  const semrushBacklinks = reportRows("backlink");

  // ---------- 2. FIELDY_TRANSCRIPT ----------
  let transcript = "";
  if (fieldyConfigured()) {
    try {
      const notes = await fieldyMeetingsInWindow(window.fromIso, window.toIso);
      const ours = notes.filter((n) =>
        [n.title, n.summary, n.content].some((s) =>
          (s ?? "").toLowerCase().includes(client.company_name.toLowerCase()),
        ),
      );
      transcript = ours
        .map((n) => `# ${n.title}${n.startTime ? ` (${n.startTime.slice(0, 10)})` : ""}\n${n.summary ?? ""}\n${n.content ?? ""}`)
        .join("\n\n---\n\n");
    } catch {
      transcript = "";
    }
  }

  // ---------- Read form overrides ----------
  const tier = normalizeTier(field(fd, "tier") || "1");
  const brand = await resolveBrand(fd, client.company_name);

  const structured = {
    client: {
      id: client.id,
      name: client.company_name,
      website: client.websites?.[0] ?? "",
      industry: field(fd, "industry"),
      services: field(fd, "services"),
      tier,
      brandKey: field(fd, "brand_key") || slugify(client.company_name),
    },
    period: {
      label: window.label,
      from: window.fromIso,
      to: window.toIso,
      priorFrom: window.prevFromIso,
      priorTo: window.prevToIso,
    },
    gsc: {
      windowLabel: window.label,
      clicks: { current: clicksCur, prior: clicksPrev, currentCompact: compact(clicksCur), priorCompact: compact(clicksPrev) },
      impressions: { current: imprCur, prior: imprPrev, currentCompact: compact(imprCur), priorCompact: compact(imprPrev) },
      avgPosition: avgPosCur != null ? Number(avgPosCur.toFixed(1)) : null,
      ctr: ctrCur != null ? pct(ctrCur, 2) : null,
      topPages: topPages.map((p) => ({ url: p.key, clicks: p.clicks, impressions: p.impressions, position: p.position })),
      trendDaily: trendPoints.map((p) => ({ date: p.captured_at, clicks: p.value })),
    },
    ga4: { sessionsInWindow: sessionsCur || null },
    content: {
      postedInWindow: postedInWindow.map((c) => ({ title: c.title, link: c.link, body: c.body, updated_at: c.updated_at })),
      pipeline: pipeline.map((c) => ({ stage: c.stage, title: c.title, link: c.link })),
    },
    semrush: {
      competitors: semrushCompetitors,
      backlinksOverviewRows: semrushBacklinks.slice(0, 5),
    },
  };

  let content: MonthlyContent;
  try {
    content = await synthesize(structured, transcript);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "synthesis failed";
    return new Response(`Synthesis failed: ${msg}`, { status: 502 });
  }

  // Defensive defaults — never let a missing field tank the render.
  content.client = content.client || client.company_name;
  content.tier = content.tier || tier;
  content.brandKey = content.brandKey || (field(fd, "brand_key") || slugify(client.company_name));
  if (!content.reportPeriod) content.reportPeriod = `${window.fromIso} → ${window.toIso}`;
  if (!content.meetingDate) content.meetingDate = today;

  // Dry-run: return the content object for inspection without rendering.
  if (field(fd, "dryrun") === "1") {
    return Response.json({ window, structured, content });
  }

  // ---------- 3. Build the .pptx ----------
  const buf = await generateDeck(brand, content);

  // ---------- 4. Persist alongside other client attachments ----------
  try {
    const supabase = await createServiceClient();
    const storagePath = `${clientId}/reports/${window.toIso}-${randomUUID()}.pptx`;
    await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: false,
    });
    await supabase.from("files").insert({
      client_id: clientId,
      filename: `${slugify(client.company_name)}-${window.toIso}-monthly-report.pptx`,
      storage_path: storagePath,
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size_bytes: buf.length,
      category: "monthly-report",
    });
  } catch (err) {
    console.error("monthly-report storage upload failed", err);
    // continue — the user still gets the download even if storage failed
  }

  const filename = `${slugify(client.company_name)}-${window.toIso}-monthly-report.pptx`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
