// Generate a client meeting-presentation PDF from the admin's writeup form.
// POST (lots of free text) → returns a landscape slide-deck PDF.

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { buildPresentationPdf, type Slide } from "@/lib/presentation-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function paragraphs(s: string): string[] {
  return (s ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}
function bullets(s: string): string[] {
  return (s ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•●*]\s*/, "").trim())
    .filter(Boolean);
}
function field(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  await requireAdmin();
  const { clientId } = await params;
  const client = await data.getClient(clientId);
  if (!client) return new Response("Client not found", { status: 404 });

  const fd = await request.formData();
  const accent = field(fd, "accent") || "#14B8A6";
  const meetingDate = field(fd, "meeting_date") || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const logo = await logoDataUrl(field(fd, "logo_url"));

  const slides: Slide[] = [
    { kind: "title", companyName: client.company_name, meetingDate: `Meeting · ${meetingDate}`, logoDataUrl: logo },
  ];

  const addContent = (
    kicker: string,
    title: string,
    raw: string,
    opts: { asBullets?: boolean; stats?: { n: string; l: string }[]; note?: string } = {},
  ) => {
    const para = opts.note ? paragraphs(opts.note) : opts.asBullets ? [] : paragraphs(raw);
    const bul = opts.asBullets ? bullets(raw) : [];
    if (!para.length && !bul.length && !(opts.stats && opts.stats.length)) return;
    slides.push({ kind: "content", kicker, title, paragraphs: para, bullets: bul, stats: opts.stats });
  };

  addContent("Update", "Social Presence & Optimization", field(fd, "social"));
  addContent("What we've posted", "Recent Posts & Flyers", field(fd, "flyers"));
  addContent("Process", "Insights & Content Optimization Process", field(fd, "insights"));
  addContent("Process", "Photo & Backlink Optimization Process", field(fd, "backlinks"));
  addContent("Process", "Pages & Posting Optimization Process", field(fd, "pages"));

  // GSC stats slide — numbers + narrative note.
  const imprPrev = field(fd, "gsc_impr_prev");
  const imprCur = field(fd, "gsc_impr_cur");
  const clicks = field(fd, "gsc_clicks");
  const gscStats: { n: string; l: string }[] = [];
  if (imprPrev || imprCur) gscStats.push({ n: imprPrev && imprCur ? `${imprPrev} → ${imprCur}` : imprCur || imprPrev, l: "Impressions" });
  if (clicks) gscStats.push({ n: clicks, l: "Organic clicks (28 days)" });
  addContent("Performance", "GSC — Last 28 Days", "", { stats: gscStats, note: field(fd, "gsc_note") });

  addContent("Performance", "Webpage Ranking", field(fd, "ranking"));
  addContent("Roadmap", "What's Next", field(fd, "whats_next"), { asBullets: true });
  addContent("Recommendation", "What's Next — Recommendation", field(fd, "recommendation"));
  addContent("In progress", "Draft Pages", field(fd, "draft_pages"), { asBullets: true });

  slides.push({ kind: "closing", kicker: "Since our last meeting", title: "Questions?", subtitle: "Do you have any questions for me?" });

  const buf = await buildPresentationPdf({
    companyName: client.company_name,
    accent,
    brandFooter: "F1 MEDIA TEAM",
    slides,
  });

  const slug = client.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${slug}-meeting-deck.pdf"`,
      "cache-control": "no-store",
    },
  });
}
