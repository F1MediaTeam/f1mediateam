// Client meeting-presentation builder — a landscape slide deck (one Page per
// slide) generated from the admin's per-meeting writeup. Neutral dark base with
// a per-client accent color so each company's deck carries their brand.

import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const BASE = {
  ink: "#0B0F19",
  panel: "#0F1620",
  border: "#1F2937",
  text: "#F8FAFC",
  body: "#CBD5E1",
  muted: "#94A3B8",
  subtle: "#64748B",
};

export interface StatTile {
  n: string;
  l: string;
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
    paddingVertical: 54,
    paddingHorizontal: 64,
    fontFamily: "Helvetica",
    flexDirection: "column",
    justifyContent: "center",
  },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  kicker: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 },
  title: { fontSize: 30, fontFamily: "Helvetica-Bold", color: BASE.text, letterSpacing: -0.4, marginBottom: 16, lineHeight: 1.1 },
  para: { fontSize: 12.5, color: BASE.body, lineHeight: 1.55, marginBottom: 9, maxWidth: 620 },
  bulletRow: { flexDirection: "row", marginBottom: 8, maxWidth: 640 },
  bulletDot: { width: 7, height: 7, borderRadius: 2, marginTop: 5, marginRight: 10 },
  bulletText: { fontSize: 12.5, color: BASE.body, lineHeight: 1.45, flex: 1 },
  statRow: { flexDirection: "row", gap: 14, marginBottom: 16, marginTop: 4 },
  stat: { borderWidth: 1, borderColor: BASE.border, backgroundColor: BASE.panel, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, minWidth: 150 },
  statN: { fontSize: 26, fontFamily: "Helvetica-Bold", color: BASE.text },
  statL: { fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: BASE.subtle, marginTop: 4 },

  titleSlide: { alignItems: "center", justifyContent: "center" },
  logo: { maxHeight: 120, maxWidth: 360, objectFit: "contain", marginBottom: 28 },
  company: { fontSize: 34, fontFamily: "Helvetica-Bold", color: BASE.text, textAlign: "center", letterSpacing: -0.3 },
  accentRule: { width: 64, height: 4, borderRadius: 2, marginTop: 22, marginBottom: 22 },
  meetingDate: { fontSize: 16, color: BASE.muted, textAlign: "center" },

  closingTitle: { fontSize: 46, fontFamily: "Helvetica-Bold", color: BASE.text, textAlign: "center", letterSpacing: -0.6 },
  closingSub: { fontSize: 14, color: BASE.muted, textAlign: "center", marginTop: 14 },

  footer: { position: "absolute", left: 64, bottom: 28, fontSize: 8, letterSpacing: 1, color: BASE.subtle },
  pageNo: { position: "absolute", right: 64, bottom: 28, fontSize: 9, color: BASE.subtle },
});

function ContentSlide({ slide, accent }: { slide: Extract<Slide, { kind: "content" }>; accent: string }) {
  return (
    <>
      {slide.kicker ? <Text style={[style.kicker, { color: accent }]}>{slide.kicker}</Text> : null}
      <Text style={style.title}>{slide.title}</Text>
      {slide.stats && slide.stats.length ? (
        <View style={style.statRow}>
          {slide.stats.map((s, i) => (
            <View key={i} style={style.stat}>
              <Text style={style.statN}>{s.n}</Text>
              <Text style={style.statL}>{s.l}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {(slide.paragraphs ?? []).map((p, i) => (
        <Text key={i} style={style.para}>{p}</Text>
      ))}
      {(slide.bullets ?? []).map((b, i) => (
        <View key={i} style={style.bulletRow}>
          <View style={[style.bulletDot, { backgroundColor: accent }]} />
          <Text style={style.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

function Deck({ input }: { input: PresentationInput }) {
  const accent = input.accent || "#14B8A6";
  return (
    <Document title={`${input.companyName} — Meeting Deck`} author="F1 Media">
      {input.slides.map((slide, i) => (
        <Page key={i} size="LETTER" orientation="landscape" style={[style.page, slide.kind !== "content" ? style.titleSlide : {}]}>
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
          ) : (
            <ContentSlide slide={slide} accent={accent} />
          )}

          {input.brandFooter ? <Text style={style.footer}>{input.brandFooter}</Text> : null}
          <Text style={style.pageNo} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </Page>
      ))}
    </Document>
  );
}

export async function buildPresentationPdf(input: PresentationInput): Promise<Buffer> {
  return renderToBuffer(<Deck input={input} />);
}
