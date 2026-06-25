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

  const brand = {
    tier: (field(fd, "tier") || "foundation") as "foundation" | "growth" | "domination",
    tone: (field(fd, "tone") || "professional") as "professional" | "conversational" | "technical" | "friendly",
    industry: field(fd, "industry") || undefined,
    services: field(fd, "services") || undefined,
    driveFolderUrl: field(fd, "drive_folder_url") || undefined,
  };

  let narrative;
  try {
    narrative = await generateNarrative(client, window, brand);
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
      title: `Search performance — ${window.label}`,
      paragraphs: paragraphs(s.gscNote),
      stats,
    });
  }

  // Embed the actual GSC daily clicks + impressions chart for the same window
  // so the slide carries the data, not just the narrative about it.
  const [gscClicksSeries, gscImprSeries] = await Promise.all([
    data.listSnapshots({ clientId, metric: "clicks" }),
    data.listSnapshots({ clientId, metric: "impressions" }),
  ]);
  const inWindow = (s: { captured_at: string }) =>
    s.captured_at >= window.fromIso && s.captured_at <= window.toIso;
  const clicksPoints = gscClicksSeries.filter(inWindow);
  const imprPoints = gscImprSeries.filter(inWindow);
  if (clicksPoints.length > 1) {
    slides.push({
      kind: "line_chart",
      kicker: "Performance",
      title: `Search performance — ${window.label}`,
      chartTitle: "Daily organic clicks",
      chartSubtitle: `${window.fromIso} → ${window.toIso}`,
      series: [
        { label: "Clicks", points: clicksPoints.map((p) => ({ date: p.captured_at, value: p.value })) },
      ],
    });
  }
  if (imprPoints.length > 1) {
    slides.push({
      kind: "line_chart",
      kicker: "Performance",
      title: `Search performance — ${window.label}`,
      chartTitle: "Daily impressions",
      chartSubtitle: `${window.fromIso} → ${window.toIso}`,
      series: [
        { label: "Impressions", points: imprPoints.map((p) => ({ date: p.captured_at, value: p.value })) },
      ],
    });
  }

  // GA4 sessions chart, when we have data.
  const sessionsSeries = (await data.listSnapshots({ clientId, metric: "sessions" })).filter(inWindow);
  if (sessionsSeries.length > 1) {
    slides.push({
      kind: "line_chart",
      kicker: "Traffic",
      title: `Site traffic — ${window.label}`,
      chartTitle: "Daily sessions",
      chartSubtitle: `${window.fromIso} → ${window.toIso}`,
      series: [
        { label: "Sessions", points: sessionsSeries.map((p) => ({ date: p.captured_at, value: p.value })) },
      ],
    });
  }

  // Bing performance chart.
  const bingClicks = (await data.listSnapshots({ clientId, metric: "bing_clicks" })).filter(inWindow);
  if (bingClicks.length > 1) {
    slides.push({
      kind: "line_chart",
      kicker: "Performance",
      title: `Bing performance — ${window.label}`,
      chartTitle: "Daily Bing organic clicks",
      chartSubtitle: `${window.fromIso} → ${window.toIso}`,
      series: [
        { label: "Bing clicks", points: bingClicks.map((p) => ({ date: p.captured_at, value: p.value })) },
      ],
    });
  }

  // Semrush authority score history (uses the full series, not just the window —
  // the trend is more useful at the multi-month scale).
  const authority = await data.listSnapshots({ clientId, metric: "semrush_authority_score" });
  if (authority.length > 1) {
    slides.push({
      kind: "line_chart",
      kicker: "Authority",
      title: "Authority Score over time",
      chartTitle: "Domain Authority Score",
      chartSubtitle: "Higher = stronger backlink profile",
      series: [
        { label: "Authority", points: authority.map((p) => ({ date: p.captured_at, value: p.value })) },
      ],
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
