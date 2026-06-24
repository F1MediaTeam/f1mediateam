// POST /api/meeting-deck
//
// Body (FormData):
//   client_id   — required
//   range       — 7d | 28d | 90d | ytd | custom (default 28d)
//   from, to    — used only when range=custom
//   accent      — optional hex color for the PDF
//   logo_url    — optional logo URL to embed on the cover slide
//   output      — pdf (default) | gamma
//
// Returns the rendered PDF as an attachment, or 303-redirects to the Gamma
// generation URL.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { buildPresentationPdf, type Slide } from "@/lib/presentation-pdf";
import { generateNarrative, resolveRange, aiConfigured } from "@/lib/deck/ai-narrative";
import { buildGammaBrief } from "@/lib/deck/gamma-brief";
import { createGeneration, gammaConfigured, generationUrl } from "@/lib/connectors/gamma";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function field(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function paragraphs(s: string): string[] {
  return (s ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

async function logoDataUrl(url: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 4_000_000) return undefined;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function prettyDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function numericDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : iso;
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const fd = await request.formData();

  const clientId = field(fd, "client_id");
  if (!clientId) return new Response("client_id is required", { status: 400 });

  const client = await data.getClient(clientId);
  if (!client) return new Response("Client not found", { status: 404 });

  if (!aiConfigured()) {
    return new Response(
      "ANTHROPIC_API_KEY is not configured on this environment. Add it under Vercel → Project Settings → Environment Variables (uncheck Sensitive) and redeploy.",
      { status: 503 },
    );
  }

  const today = todayIso("America/Los_Angeles");
  const window = resolveRange(
    field(fd, "range") || "28d",
    field(fd, "from") || null,
    field(fd, "to") || null,
    today,
  );

  let narrative;
  try {
    narrative = await generateNarrative(client, window);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Narrative generation failed";
    return new Response(msg, { status: 502 });
  }

  const output = field(fd, "output") || "pdf";

  // ---------- Gamma branch ----------
  if (output === "gamma") {
    if (!gammaConfigured()) {
      return new Response(
        "Gamma is not configured. Add GAMMA_API_KEY to enable Gamma generation.",
        { status: 503 },
      );
    }
    const brief = buildGammaBrief({
      companyName: client.company_name,
      meetingDate: numericDate(window.toIso),
      sections: {
        social: narrative.sections.social,
        flyers: narrative.sections.flyers,
        insights: narrative.sections.insights,
        backlinks: narrative.sections.backlinks,
        pages: narrative.sections.pages,
        ranking: narrative.sections.ranking,
        recommendation: narrative.sections.recommendation,
        gscNote: narrative.sections.gscNote,
      },
      gsc: narrative.gsc,
      whatsNext: narrative.sections.whatsNext,
      draftPages: narrative.draftPages,
    });
    try {
      const gen = await createGeneration(brief);
      return Response.redirect(generationUrl(gen.generationId), 303);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gamma generation failed";
      return new Response(msg, { status: 502 });
    }
  }

  // ---------- PDF branch ----------
  const accent = field(fd, "accent") || "#14B8A6";
  const logo = await logoDataUrl(field(fd, "logo_url"));
  const meetingLabel = `${window.label} · ${prettyDateLabel(window.toIso)}`;

  const s = narrative.sections;
  const slides: Slide[] = [];
  slides.push({
    kind: "title",
    companyName: client.company_name,
    meetingDate: meetingLabel,
    logoDataUrl: logo,
  });

  const addContent = (kicker: string, title: string, text: string) => {
    const para = paragraphs(text);
    if (para.length === 0) return;
    slides.push({ kind: "content", kicker, title, paragraphs: para });
  };

  addContent("Update", "Social Presence & Optimization", s.social);
  addContent("What we've posted", "Recent Posts & Flyers", s.flyers);
  addContent("Process", "Insights & Content Optimization Process", s.insights);
  addContent("Process", "Photo & Backlink Optimization Process", s.backlinks);
  addContent("Process", "Pages & Posting Optimization Process", s.pages);

  // GSC slide — real numbers as stat tiles + the AI's narrative note.
  const stats: { n: string; l: string }[] = [];
  if (narrative.gsc.imprCur && narrative.gsc.imprPrev) {
    stats.push({ n: `${narrative.gsc.imprPrev} → ${narrative.gsc.imprCur}`, l: "Impressions" });
  } else if (narrative.gsc.imprCur) {
    stats.push({ n: narrative.gsc.imprCur, l: "Impressions" });
  }
  if (narrative.gsc.clicks) {
    stats.push({ n: narrative.gsc.clicks, l: `Organic clicks (${window.label.toLowerCase()})` });
  }
  if (narrative.gsc.avgPosition) {
    stats.push({ n: narrative.gsc.avgPosition, l: "Avg. position" });
  }
  if (stats.length > 0 || s.gscNote) {
    slides.push({
      kind: "content",
      kicker: "Performance",
      title: `GSC — ${window.label}`,
      paragraphs: paragraphs(s.gscNote),
      stats,
    });
  }

  addContent("Performance", "Webpage Ranking", s.ranking);

  if (s.whatsNext.length > 0) {
    slides.push({
      kind: "content",
      kicker: "Roadmap",
      title: "What's Next",
      bullets: s.whatsNext,
    });
  }
  addContent("Recommendation", "What's Next — Recommendation", s.recommendation);

  if (narrative.draftPages.length > 0) {
    slides.push({
      kind: "content",
      kicker: "In progress",
      title: "Draft Pages",
      bullets: narrative.draftPages,
    });
  }

  slides.push({
    kind: "closing",
    kicker: "Since our last meeting",
    title: "Questions?",
    subtitle: "Do you have any questions for me?",
  });

  const buf = await buildPresentationPdf({
    companyName: client.company_name,
    accent,
    brandFooter: "F1 MEDIA TEAM",
    slides,
  });

  const slug = client.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug}-${window.toIso}-meeting-deck.pdf`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
