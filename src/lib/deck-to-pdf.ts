// Maps the meetings deck (serializable Slide[] from lib/slides — what
// SlideDeck renders and what a customized meeting stores in meetings.deck)
// onto presentation-pdf's slide union, so "Download PDF" exports exactly the
// deck the admin previewed, edits included.

import type { Slide as DeckSlide } from "@/lib/slides";
import type { Slide as PdfSlide, StatTile } from "@/lib/presentation-pdf";

function kpiTiles(items: Extract<DeckSlide, { kind: "kpi" }>["items"]): StatTile[] {
  return items.map((k) => ({
    n: k.value,
    l: k.label,
    sub: k.delta ?? undefined,
    tone: k.direction,
  }));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function deckToPdfSlides(deck: DeckSlide[]): PdfSlide[] {
  const out: PdfSlide[] = [];
  for (const s of deck) {
    switch (s.kind) {
      case "cover":
        out.push({
          kind: "title",
          companyName: s.title,
          meetingDate: `${fmtDate(s.date)} · ${s.rangeLabel}`,
          logoDataUrl: s.logoUrl ?? undefined,
        });
        break;
      case "kpi":
        out.push({ kind: "kpi_snapshot", kicker: s.subtitle, title: s.title, tiles: kpiTiles(s.items) });
        break;
      case "trend":
        out.push({
          kind: "line_chart",
          kicker: s.subtitle,
          title: s.title,
          chartTitle: s.metricLabel,
          series: [{ label: s.metricLabel, points: s.series.map((p) => ({ date: p.date, value: p.value })) }],
          paragraphs: [
            `${s.summaryLeft.label}: ${s.summaryLeft.value} · ${s.summaryRight.label}: ${s.summaryRight.value}` +
              (s.summaryRight.delta ? ` (${s.summaryRight.delta})` : ""),
          ],
        });
        break;
      case "content":
        out.push({
          kind: "content_grid",
          kicker: s.subtitle,
          title: s.title,
          cards: s.cards.map((c) => ({
            title: c.title,
            link: c.link ?? undefined,
            date: fmtDate(c.date),
            body: c.excerpt ?? undefined,
            badge: c.stage,
          })),
        });
        break;
      case "events":
        out.push({
          kind: "content",
          kicker: s.subtitle,
          title: s.title,
          bullets: s.items.map((e) => `${e.type === "deadline" ? "◆" : "●"} ${e.title} — ${fmtDate(e.date)}`),
        });
        break;
      case "tasks":
        out.push({
          kind: "content",
          kicker: s.subtitle,
          title: s.title,
          bullets: s.items.map((t) => `${t.status === "done" ? "✓" : "○"} ${t.title}${t.due ? ` — due ${fmtDate(t.due)}` : ""}`),
        });
        break;
      case "image":
        out.push({ kind: "image", kicker: s.subtitle, title: s.title, url: s.url, caption: s.caption ?? undefined });
        break;
      case "closing":
        out.push({
          kind: "content",
          kicker: s.subtitle,
          title: s.title,
          bullets: s.bullets,
        });
        break;
    }
  }
  return out;
}
