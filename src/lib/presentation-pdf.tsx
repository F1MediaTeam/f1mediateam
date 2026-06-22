// Client meeting-presentation builder — a landscape slide deck (one Page per
// slide) generated from the admin's per-meeting writeup. Neutral dark base with
// a per-client accent color so each company's deck carries their brand.
//
// Slide kinds supported (see Slide union):
//   - title         cover
//   - content       narrative paragraphs / bullets / optional stat tiles
//   - kpi_snapshot  four-tile headline-number grid (this period vs last)
//   - line_chart    embedded SVG line chart (clicks/impressions over time)
//   - bar_chart     embedded SVG bar chart (top keywords/pages by volume)
//   - ranking_table keyword/page rows with before → after position
//   - content_grid  posted content cards w/ titles + links + dates
//   - closing       big-text closing slide
//
// All chart slides reuse the SVG primitives from chart-pdf.tsx so we never
// rasterize (matters in the Vercel runtime — no sharp, no system fonts).

import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { LineChart, BarChart, type LineSeries, type BarDatum } from "@/lib/chart-pdf";

const BASE = {
  ink: "#0B0F19",
  panel: "#0F1620",
  border: "#1F2937",
  text: "#F8FAFC",
  body: "#CBD5E1",
  muted: "#94A3B8",
  subtle: "#64748B",
  up: "#34D399",
  down: "#F87171",
};

export interface StatTile {
  n: string;
  l: string;
  /** Optional sub-line under the value (e.g. "+12.3% vs prior"). */
  sub?: string;
  /** Tone of the sub-line ("up" = green, "down" = red, "flat" = muted). */
  tone?: "up" | "down" | "flat";
}

export interface RankingRow {
  keyword: string;
  url?: string;
  before?: string | number;
  after?: string | number;
  /** Display only — if you've already computed the change label, pass it here. */
  change?: string;
  changeTone?: "up" | "down" | "flat";
}

export interface ContentCard {
  title: string;
  link?: string;
  date?: string;          // ISO or display label
  body?: string;
  badge?: string;         // e.g. stage label
}

export type Slide =
  | { kind: "title"; companyName: string; meetingDate: string; logoDataUrl?: string }
  | {
      kind: "content";
      kicker?: string;
      title: string;
      paragraphs?: string[];
      bullets?: string[];
      stats?: StatTile[];
    }
  | {
      kind: "kpi_snapshot";
      kicker?: string;
      title: string;
      tiles: StatTile[];   // 3–6 tiles render in a row, wrapping if needed
      footnote?: string;
    }
  | {
      kind: "line_chart";
      kicker?: string;
      title: string;
      chartTitle: string;
      chartSubtitle?: string;
      series: LineSeries[];
      paragraphs?: string[];
    }
  | {
      kind: "bar_chart";
      kicker?: string;
      title: string;
      chartTitle: string;
      chartSubtitle?: string;
      data: BarDatum[];
      paragraphs?: string[];
    }
  | {
      kind: "ranking_table";
      kicker?: string;
      title: string;
      rows: RankingRow[];
      footnote?: string;
    }
  | {
      kind: "content_grid";
      kicker?: string;
      title: string;
      cards: ContentCard[];
      footnote?: string;
    }
  | { kind: "closing"; kicker?: string; title: string; subtitle?: string };

export interface PresentationInput {
  companyName: string;
  accent: string;
  brandFooter?: string;
  slides: Slide[];
}

const style = StyleSheet.create({
  page: {
    backgroundColor: BASE.ink,
    color: BASE.text,
    paddingVertical: 46,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    flexDirection: "column",
  },
  pageCenter: { justifyContent: "center", alignItems: "center" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  kicker: { fontSize: 10, fontFamily: "Helvetica-Bold", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 },
  title: { fontSize: 28, fontFamily: "Helvetica-Bold", color: BASE.text, letterSpacing: -0.4, marginBottom: 14, lineHeight: 1.1 },
  para: { fontSize: 12, color: BASE.body, lineHeight: 1.55, marginBottom: 8, maxWidth: 700 },
  bulletRow: { flexDirection: "row", marginBottom: 7, maxWidth: 700 },
  bulletDot: { width: 6, height: 6, borderRadius: 2, marginTop: 6, marginRight: 9 },
  bulletText: { fontSize: 12, color: BASE.body, lineHeight: 1.45, flex: 1 },

  // Stat tiles (also used by kpi_snapshot)
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14, marginTop: 4 },
  stat: {
    borderWidth: 1, borderColor: BASE.border, backgroundColor: BASE.panel,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
    minWidth: 150, flexGrow: 1, flexBasis: "22%",
  },
  statN: { fontSize: 24, fontFamily: "Helvetica-Bold", color: BASE.text },
  statL: { fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: BASE.subtle, marginTop: 4 },
  statSub: { fontSize: 9, marginTop: 4, color: BASE.muted },

  // Cover
  titleSlide: { alignItems: "center", justifyContent: "center" },
  logo: { maxHeight: 120, maxWidth: 360, objectFit: "contain", marginBottom: 24 },
  company: { fontSize: 36, fontFamily: "Helvetica-Bold", color: BASE.text, textAlign: "center", letterSpacing: -0.3 },
  accentRule: { width: 64, height: 4, borderRadius: 2, marginTop: 22, marginBottom: 22 },
  meetingDate: { fontSize: 16, color: BASE.muted, textAlign: "center" },

  // Closing
  closingTitle: { fontSize: 46, fontFamily: "Helvetica-Bold", color: BASE.text, textAlign: "center", letterSpacing: -0.6 },
  closingSub: { fontSize: 14, color: BASE.muted, textAlign: "center", marginTop: 14 },

  footer: { position: "absolute", left: 56, bottom: 24, fontSize: 8, letterSpacing: 1, color: BASE.subtle },
  pageNo: { position: "absolute", right: 56, bottom: 24, fontSize: 9, color: BASE.subtle },

  // Chart wrapper (chart-pdf components render at their own viewBox, but the
  // outer <View> here ensures consistent padding around them on the slide.)
  chartFrame: { borderWidth: 1, borderColor: BASE.border, borderRadius: 12, padding: 8, backgroundColor: BASE.panel, marginBottom: 12 },

  // Ranking table
  tblHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BASE.border, paddingBottom: 6, marginBottom: 4 },
  tblRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#1A2030" },
  tblColKw: { flex: 4, fontSize: 11, color: BASE.body },
  tblColUrl: { flex: 5, fontSize: 9, color: BASE.muted },
  tblColPos: { flex: 1.5, fontSize: 11, color: BASE.body, textAlign: "right" },
  tblColDelta: { flex: 1.5, fontSize: 11, textAlign: "right" },
  tblColH: { fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: BASE.subtle },

  // Content cards grid
  cardsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  contentCard: {
    width: "31%", minHeight: 90, padding: 10,
    borderWidth: 1, borderColor: BASE.border, backgroundColor: BASE.panel, borderRadius: 10,
  },
  cardBadge: { alignSelf: "flex-start", fontSize: 7.5, letterSpacing: 1, textTransform: "uppercase",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 6 },
  cardTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BASE.text, marginBottom: 4, lineHeight: 1.3 },
  cardBody: { fontSize: 9.5, color: BASE.muted, lineHeight: 1.4 },
  cardMeta: { marginTop: 6, fontSize: 8, color: BASE.subtle },

  footnote: { fontSize: 9, color: BASE.subtle, marginTop: 8, fontStyle: "italic" },
});

// ---------------- shared sub-renderers ----------------

function Header({ kicker, title, accent }: { kicker?: string; title: string; accent: string }) {
  return (
    <>
      {kicker ? <Text style={[style.kicker, { color: accent }]}>{kicker}</Text> : null}
      <Text style={style.title}>{title}</Text>
    </>
  );
}

function StatTiles({ tiles }: { tiles: StatTile[] }) {
  if (!tiles.length) return null;
  return (
    <View style={style.statRow}>
      {tiles.map((s, i) => {
        const subColor = s.tone === "up" ? BASE.up : s.tone === "down" ? BASE.down : BASE.muted;
        return (
          <View key={i} style={style.stat}>
            <Text style={style.statN}>{s.n}</Text>
            <Text style={style.statL}>{s.l}</Text>
            {s.sub ? <Text style={[style.statSub, { color: subColor }]}>{s.sub}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function ParagraphsBlock({ paragraphs }: { paragraphs?: string[] }) {
  if (!paragraphs || paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((p, i) => <Text key={i} style={style.para}>{p}</Text>)}
    </>
  );
}

function BulletsBlock({ bullets, accent }: { bullets?: string[]; accent: string }) {
  if (!bullets || bullets.length === 0) return null;
  return (
    <>
      {bullets.map((b, i) => (
        <View key={i} style={style.bulletRow}>
          <View style={[style.bulletDot, { backgroundColor: accent }]} />
          <Text style={style.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

// ---------------- per-kind renderers ----------------

function ContentSlide({ slide, accent }: { slide: Extract<Slide, { kind: "content" }>; accent: string }) {
  return (
    <>
      <Header kicker={slide.kicker} title={slide.title} accent={accent} />
      {slide.stats?.length ? <StatTiles tiles={slide.stats} /> : null}
      <ParagraphsBlock paragraphs={slide.paragraphs} />
      <BulletsBlock bullets={slide.bullets} accent={accent} />
    </>
  );
}

function KpiSlide({ slide, accent }: { slide: Extract<Slide, { kind: "kpi_snapshot" }>; accent: string }) {
  return (
    <>
      <Header kicker={slide.kicker} title={slide.title} accent={accent} />
      <StatTiles tiles={slide.tiles} />
      {slide.footnote ? <Text style={style.footnote}>{slide.footnote}</Text> : null}
    </>
  );
}

function LineChartSlide({ slide, accent }: { slide: Extract<Slide, { kind: "line_chart" }>; accent: string }) {
  return (
    <>
      <Header kicker={slide.kicker} title={slide.title} accent={accent} />
      <View style={style.chartFrame}>
        <LineChart title={slide.chartTitle} subtitle={slide.chartSubtitle} series={slide.series} />
      </View>
      <ParagraphsBlock paragraphs={slide.paragraphs} />
    </>
  );
}

function BarChartSlide({ slide, accent }: { slide: Extract<Slide, { kind: "bar_chart" }>; accent: string }) {
  return (
    <>
      <Header kicker={slide.kicker} title={slide.title} accent={accent} />
      <View style={style.chartFrame}>
        <BarChart title={slide.chartTitle} subtitle={slide.chartSubtitle} data={slide.data} />
      </View>
      <ParagraphsBlock paragraphs={slide.paragraphs} />
    </>
  );
}

function RankingTableSlide({ slide, accent }: { slide: Extract<Slide, { kind: "ranking_table" }>; accent: string }) {
  return (
    <>
      <Header kicker={slide.kicker} title={slide.title} accent={accent} />
      <View style={style.tblHead}>
        <Text style={[style.tblColKw, style.tblColH]}>Keyword</Text>
        <Text style={[style.tblColUrl, style.tblColH]}>Page</Text>
        <Text style={[style.tblColPos, style.tblColH]}>Before</Text>
        <Text style={[style.tblColPos, style.tblColH]}>After</Text>
        <Text style={[style.tblColDelta, style.tblColH]}>Change</Text>
      </View>
      {slide.rows.slice(0, 12).map((r, i) => {
        const tone = r.changeTone === "up" ? BASE.up : r.changeTone === "down" ? BASE.down : BASE.muted;
        return (
          <View key={i} style={style.tblRow}>
            <Text style={style.tblColKw} wrap={false}>{r.keyword}</Text>
            <Text style={style.tblColUrl} wrap={false}>{r.url ? r.url.replace(/^https?:\/\//, "") : ""}</Text>
            <Text style={style.tblColPos}>{r.before ?? "—"}</Text>
            <Text style={style.tblColPos}>{r.after ?? "—"}</Text>
            <Text style={[style.tblColDelta, { color: tone }]}>{r.change ?? "—"}</Text>
          </View>
        );
      })}
      {slide.footnote ? <Text style={style.footnote}>{slide.footnote}</Text> : null}
    </>
  );
}

function ContentGridSlide({ slide, accent }: { slide: Extract<Slide, { kind: "content_grid" }>; accent: string }) {
  return (
    <>
      <Header kicker={slide.kicker} title={slide.title} accent={accent} />
      <View style={style.cardsRow}>
        {slide.cards.slice(0, 9).map((c, i) => (
          <View key={i} style={style.contentCard}>
            {c.badge ? (
              <Text style={[style.cardBadge, { backgroundColor: accent, color: "#000" }]}>{c.badge}</Text>
            ) : null}
            <Text style={style.cardTitle}>{c.title}</Text>
            {c.body ? <Text style={style.cardBody}>{c.body.length > 120 ? c.body.slice(0, 118) + "…" : c.body}</Text> : null}
            <Text style={style.cardMeta}>
              {c.date ?? ""}
              {c.date && c.link ? "  ·  " : ""}
              {c.link ? c.link.replace(/^https?:\/\//, "").slice(0, 40) : ""}
            </Text>
          </View>
        ))}
      </View>
      {slide.footnote ? <Text style={style.footnote}>{slide.footnote}</Text> : null}
    </>
  );
}

// ---------------- top-level deck ----------------

function Deck({ input }: { input: PresentationInput }) {
  const accent = input.accent || "#14B8A6";
  return (
    <Document title={`${input.companyName} — Meeting Deck`} author="F1 Media">
      {input.slides.map((slide, i) => {
        const isCentered = slide.kind === "title" || slide.kind === "closing";
        return (
          <Page
            key={i}
            size="LETTER"
            orientation="landscape"
            style={[style.page, isCentered ? style.pageCenter : {}]}
          >
            <View style={[style.topBar, { backgroundColor: accent }]} fixed />

            {slide.kind === "title" ? (
              <>
                {slide.logoDataUrl ? <Image src={slide.logoDataUrl} style={style.logo} /> : null}
                <Text style={style.company}>{slide.companyName}</Text>
                <View style={[style.accentRule, { backgroundColor: accent }]} />
                <Text style={style.meetingDate}>{slide.meetingDate}</Text>
              </>
            ) : slide.kind === "closing" ? (
              <>
                {slide.kicker ? <Text style={[style.kicker, { color: accent, textAlign: "center" }]}>{slide.kicker}</Text> : null}
                <Text style={style.closingTitle}>{slide.title}</Text>
                {slide.subtitle ? <Text style={style.closingSub}>{slide.subtitle}</Text> : null}
              </>
            ) : slide.kind === "content" ? (
              <ContentSlide slide={slide} accent={accent} />
            ) : slide.kind === "kpi_snapshot" ? (
              <KpiSlide slide={slide} accent={accent} />
            ) : slide.kind === "line_chart" ? (
              <LineChartSlide slide={slide} accent={accent} />
            ) : slide.kind === "bar_chart" ? (
              <BarChartSlide slide={slide} accent={accent} />
            ) : slide.kind === "ranking_table" ? (
              <RankingTableSlide slide={slide} accent={accent} />
            ) : slide.kind === "content_grid" ? (
              <ContentGridSlide slide={slide} accent={accent} />
            ) : null}

            {input.brandFooter ? <Text style={style.footer}>{input.brandFooter}</Text> : null}
            <Text style={style.pageNo} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </Page>
        );
      })}
    </Document>
  );
}

export async function buildPresentationPdf(input: PresentationInput): Promise<Buffer> {
  return renderToBuffer(<Deck input={input} />);
}
