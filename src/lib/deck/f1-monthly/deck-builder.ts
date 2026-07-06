// F1 Media monthly report deck builder — portable, server-safe.
//   const buf = await generateDeck(brand, content); // .pptx as Buffer
// Imports pptxgenjs in CJS form so it works in Vercel serverless. No disk
// writes. Recompresses the resulting zip via jszip so the .pptx is small.

import type { Buffer as NodeBuffer } from "node:buffer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
// pptxgenjs ships CJS — import as default to call `new pres()`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pptxgen = require("pptxgenjs");

export interface BrandConfig {
  name?: string;
  primary?: string;
  secondary?: string;
  tertiary?: string | null;
  displayFont?: string;
  bodyFont?: string;
  safeDisplayFont?: string;
  safeBodyFont?: string;
  logo?: string | null;
  logoData?: string | null; // data URI for base64 logo
}

export interface MonthlyContent {
  client?: string;
  website?: string;
  industry?: string;
  services?: string;
  reportPeriod?: string;
  meetingDate?: string;
  tier?: string; // "1" | "2" | "3" | tier full name
  brandKey?: string;
  executiveSummary?: { intro?: string; wins?: string[] };
  keywordRankings?: {
    note?: string;
    priorLabel?: string;
    currentLabel?: string;
    rows?: Array<{ keyword: string; url: string; prior: number; current: number }>;
  };
  competitiveSnapshot?: {
    competitors?: Array<{ domain: string; position: string }>;
    gaps?: { ahead?: string[]; close?: string[]; opportunity?: string[] };
    closing?: string;
  } | null;
  organicTraffic?: {
    clicks?: { value: string; prior?: string | null };
    impressions?: { value: string; prior?: string | null };
    ctr?: { value: string };
    avgPosition?: { value: string };
    note?: string;
    trend?: { labels: string[]; clicks: number[] } | null;
  };
  crossChannelAi?: {
    channels?: Array<{ name: string; metric: string }>;
    aiVisibility?: string[];
    note?: string;
  } | null;
  contentInsights?: {
    // The content-board story — what the client approved and what went live.
    // These two carry the slide; created/optimized are legacy fallbacks.
    posted?: string[];   // posted & live this period, with dates
    approved?: string[]; // approved (esp. by the customer) and queued to post
    pagesCreated?: string[];
    pagesOptimized?: string[];
    linking?: string;
  };
  photoBacklink?: {
    refreshes?: string[];
    backlinksBuilt?: string;
    toxicRemoved?: string;
    counts?: { disavowedDomains?: number | null };
  };
  postingSocial?: {
    flyers?: string;
    channels?: string[];
    youtube?: string;
    misc?: string;
    outOfScope?: string | null;
  };
  rankingDetail?: {
    topPages?: Array<{ url: string; clicks?: number; impressions?: number }>;
    aiOverview?: string;
  };
  whatsNext?: string[];
  questions?: { prompt?: string; contact?: string | null };
  // Per-slide headline overrides — short, data-specific takeaways written by
  // synthesis (and editable in the preview). Keyed by section; a missing key
  // falls back to the section's stock title.
  sectionTitles?: { [section: string]: string };
  // Optional extra charts the bot specifies as DATA (labels + numeric series).
  // Each renders as its own slide before "What's Next".
  charts?: Array<{
    title: string;
    type: "line" | "bar";
    source?: "GSC" | "GA4" | "SEMrush" | "Bing" | string;
    labels: string[];
    series: Array<{ name: string; values: number[] }>;
  }>;
  // Admin-uploaded images (added in the Reports preview editor). Each renders
  // as its own slide after the chart slides, before "What's Next".
  images?: Array<{ title?: string; caption?: string; data: string }>;
}

export async function generateDeck(brand: BrandConfig, content: MonthlyContent): Promise<NodeBuffer> {
  const C = {
    primary: brand?.primary || "1A1A1A",
    secondary: brand?.secondary || "E63946",
    tertiary: brand?.tertiary || null,
    white: "FFFFFF",
    ink: "1F2430",
    muted: "6B7280",
    lightBg: "FFFFFF",
    panel: "F4F5F7",
    panelLine: "E5E7EB",
    good: "1B8A5A",
  };
  const DISPLAY = brand?.displayFont || "Century Schoolbook";
  const BODY = brand?.bodyFont || "Calibri";
  const SAFE_BODY = brand?.safeBodyFont || BODY;
  // Per-slide headline: synthesis/preview override first, stock title second.
  const st = (key: string, stock: string) => content?.sectionTitles?.[key] || stock;
  // Cover date line, matching the hand-built meeting decks: "7/6/2026 Meeting".
  // Falls back to the pretty period when there's no meeting date.
  const fmtMeetingLine = (c: MonthlyContent): string => {
    const m = String(c?.meetingDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${+m[2]}/${+m[3]}/${m[1]} Meeting`;
    return fmtPeriod(c?.reportPeriod || "");
  };
  // "2026-07-09 → 2026-07-17" → "July 9–17, 2026" (collapses shared month/year).
  const fmtPeriod = (period: string): string => {
    const m = period.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:→|to|-)\s*(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return period;
    const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const [, y1, mo1, d1, y2, mo2, d2] = m;
    const A = { y: +y1, mn: MN[+mo1 - 1], d: +d1 };
    const B = { y: +y2, mn: MN[+mo2 - 1], d: +d2 };
    if (A.y === B.y && A.mn === B.mn) return `${A.mn} ${A.d}–${B.d}, ${A.y}`;
    if (A.y === B.y) return `${A.mn} ${A.d} – ${B.mn} ${B.d}, ${A.y}`;
    return `${A.mn} ${A.d}, ${A.y} – ${B.mn} ${B.d}, ${B.y}`;
  };
  const rawTier = String(content?.tier || "1");
  const TIER = ["1", "2", "3"].includes(rawTier.charAt(0))
    ? rawTier.charAt(0)
    : /domination/i.test(rawTier)
      ? "3"
      : /growth|authority/i.test(rawTier)
        ? "2"
        : "1";

  const shadow = () => ({ type: "outer", color: "000000", blur: 7, offset: 3, angle: 90, opacity: 0.12 });

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  const PW = 13.3,
    PH = 7.5,
    M = 0.7;
  pres.author = "F1 Media Team";
  pres.title = `${content?.client || brand?.name || "Client"} — Monthly Performance Report`;

  // helpers
  const card = (slide: Any, x: number, y: number, w: number, h: number, fill = C.panel) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y, w, h,
      rectRadius: 0.08,
      fill: { color: fill },
      line: { color: C.panelLine, width: 1 },
      shadow: shadow(),
    });

  const brandMark = (slide: Any, onDark: boolean) => {
    const markW = 2.4, markH = 0.42, mx = PW - M - markW, my = 0.4;
    if (brand?.logoData) {
      slide.addImage({ data: brand.logoData, x: mx, y: my, w: markW, h: markH, sizing: { type: "contain", w: markW, h: markH } });
    } else {
      slide.addText((content?.client || brand?.name || "").toUpperCase(), {
        x: mx, y: my, w: markW, h: markH, margin: 0,
        align: "right", valign: "middle",
        fontFace: BODY, fontSize: 10, bold: true,
        color: onDark ? C.white : C.muted, charSpacing: 1,
      });
    }
  };

  const sectionTitle = (slide: Any, txt: string, num: string) => {
    slide.addText(`SLIDE ${num}`, { x: M, y: 0.45, w: 6, h: 0.3, margin: 0, fontFace: BODY, fontSize: 11, bold: true, color: C.secondary, charSpacing: 2 });
    slide.addText(txt, { x: M, y: 0.72, w: PW - 2 * M - 2.6, h: 0.75, margin: 0, fontFace: DISPLAY, fontSize: 32, bold: true, color: C.primary, valign: "top" });
    brandMark(slide, false);
  };

  const footer = (slide: Any) =>
    slide.addText(
      [
        { text: `${content?.client || brand?.name || ""}`, options: { color: C.muted } },
        { text: "   ·   ", options: { color: C.panelLine } },
        { text: `${content?.reportPeriod || ""}`, options: { color: C.muted } },
      ],
      { x: M, y: PH - 0.45, w: PW - 2 * M, h: 0.3, margin: 0, fontFace: BODY, fontSize: 9, align: "left" },
    );

  const bullets = (items: string[] | undefined, opts: { color?: string; fontSize?: number } = {}) =>
    (items || []).filter(Boolean).map((t, i, a) => ({
      text: typeof t === "string" ? t : String(t),
      options: { bullet: { code: "2022" }, breakLine: i !== a.length - 1, color: opts.color || C.ink, fontSize: opts.fontSize || 14, fontFace: BODY, paraSpaceAfter: 8 },
    }));

  const hcell = (center?: boolean) => ({ fill: { color: C.primary }, color: C.white, bold: true, fontFace: BODY, fontSize: 12, align: center ? "center" : "left", margin: [3, 5, 3, 5] });
  const bcell = (o: { color?: string; bold?: boolean; fontFace?: string; fontSize?: number; align?: string } = {}) => ({
    color: o.color || C.ink, bold: !!o.bold, fontFace: o.fontFace, fontSize: o.fontSize || 12, align: o.align || "left", margin: [3, 5, 3, 5], fill: { color: C.white },
  });
  // Accept string or {url}-object — Claude occasionally emits pagesCreated /
  // pagesOptimized as [{url, ...}] instead of ["/path", ...]. Coerce either
  // shape into a string before running the replace so we don't 500 on a
  // downstream .replace-on-non-string TypeError.
  const stripDomain = (u: unknown): string => {
    let s = "";
    if (typeof u === "string") s = u;
    else if (u && typeof u === "object" && "url" in u) {
      const inner = (u as { url: unknown }).url;
      if (typeof inner === "string") s = inner;
    }
    return s.replace(/^https?:\/\/[^/]+/, "");
  };

  // ===== SLIDE 1 — Title =====
  {
    // Minimal cover, laid out like the meeting decks the user builds by hand:
    // the client's logo huge and dead-center, one plain date line below —
    // on the brand-primary background.
    const s = pres.addSlide();
    s.background = { color: C.primary };
    if (brand?.logoData) {
      const lw = 8.4, lh = 3.1;
      s.addImage({ data: brand.logoData, x: (PW - lw) / 2, y: 1.55, w: lw, h: lh, sizing: { type: "contain", w: lw, h: lh } });
    } else {
      s.addText((content?.client || brand?.name || "").toUpperCase(), { x: M, y: 2.4, w: PW - 2 * M, h: 1.3, margin: 0, align: "center", fontFace: DISPLAY, fontSize: 54, bold: true, color: C.white, charSpacing: 1 });
    }
    s.addText(fmtMeetingLine(content), { x: M, y: 5.1, w: PW - 2 * M, h: 0.7, margin: 0, align: "center", fontFace: BODY, fontSize: 28, color: C.white });
  }

  // ===== SLIDE 2 — Executive Summary =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("executiveSummary", "Executive Summary"), "2");
    const es = content?.executiveSummary || {};
    if (es.intro) s.addText(es.intro, { x: M, y: 1.7, w: PW - 2 * M, h: 0.5, margin: 0, fontFace: BODY, fontSize: 15, italic: true, color: C.muted });
    const wins = (es.wins || []).slice(0, 5);
    const top = 2.4, gap = 0.15, h = Math.min(0.95, (PH - top - 0.7 - gap * (wins.length - 1)) / Math.max(wins.length, 1));
    wins.forEach((w, i) => {
      const y = top + i * (h + gap);
      card(s, M, y, PW - 2 * M, h, C.panel);
      s.addShape(pres.shapes.OVAL, { x: M + 0.25, y: y + h / 2 - 0.18, w: 0.36, h: 0.36, fill: { color: C.secondary } });
      s.addText(String(i + 1), { x: M + 0.25, y: y + h / 2 - 0.18, w: 0.36, h: 0.36, margin: 0, align: "center", valign: "middle", fontFace: BODY, fontSize: 14, bold: true, color: C.white });
      s.addText(w, { x: M + 0.85, y, w: PW - 2 * M - 1.1, h, margin: 0, valign: "middle", fontFace: BODY, fontSize: 15, color: C.ink });
    });
    footer(s);
  }

  // ===== SLIDE 3 — Keyword Rankings =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("keywordRankings", "Keyword Rankings"), "3");
    const kr = content?.keywordRankings || {};
    if (kr.note) s.addText(kr.note, { x: M, y: 1.65, w: PW - 2 * M, h: 0.4, margin: 0, fontFace: BODY, fontSize: 13, italic: true, color: C.muted });
    const fmtPos = (v: Any) => (v === 0 || v === "0" || v == null) ? "—" : (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));
    const head = [
      { text: "Keyword", options: hcell() }, { text: "URL", options: hcell() },
      { text: kr.priorLabel || "Prior", options: hcell(true) }, { text: kr.currentLabel || "Current", options: hcell(true) },
    ];
    const rows = (kr.rows || []).map((r) => {
      const improved = typeof r.prior === "number" && typeof r.current === "number" && r.current > 0 && r.prior > 0 && r.current < r.prior;
      return [
        { text: r.keyword || "", options: bcell() },
        { text: stripDomain(r.url), options: bcell({ color: C.muted, fontSize: 11 }) },
        { text: fmtPos(r.prior), options: bcell({ align: "center" }) },
        { text: fmtPos(r.current), options: bcell({ align: "center", color: improved ? C.good : C.ink, bold: improved }) },
      ];
    });
    if (rows.length) s.addTable([head, ...rows], { x: M, y: 2.2, w: PW - 2 * M, colW: [3.6, 5.1, 1.55, 1.55], border: { type: "solid", pt: 0.5, color: C.panelLine }, fontFace: SAFE_BODY, rowH: 0.42, valign: "middle" });
    footer(s);
  }

  // ===== SLIDE 3B — Competitive Snapshot (Tier 2 & 3) =====
  if (TIER !== "1" && content?.competitiveSnapshot) {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("competitiveSnapshot", "Competitive Snapshot"), "3B");
    const cs = content.competitiveSnapshot, colW = (PW - 2 * M - 0.4) / 2;
    card(s, M, 2.1, colW, 3.6);
    s.addText("Competitor Positions", { x: M + 0.25, y: 2.3, w: colW - 0.5, h: 0.4, margin: 0, fontFace: DISPLAY, fontSize: 18, bold: true, color: C.primary });
    s.addText((cs.competitors || []).map((c, i, a) => ({ text: `${c.domain} — ${c.position}`, options: { bullet: { code: "2022" }, breakLine: i !== a.length - 1, color: C.ink, fontSize: 13, fontFace: BODY, paraSpaceAfter: 8 } })), { x: M + 0.25, y: 2.8, w: colW - 0.5, h: 2.7, margin: 0, valign: "top" });
    const rx = M + colW + 0.4;
    card(s, rx, 2.1, colW, 3.6);
    s.addText("Gap Analysis", { x: rx + 0.25, y: 2.3, w: colW - 0.5, h: 0.4, margin: 0, fontFace: DISPLAY, fontSize: 18, bold: true, color: C.primary });
    const g = cs.gaps || {}, gapRuns: Any[] = [];
    const addGroup = (label: string, items: string[] | undefined, color: string) => {
      if (!items || !items.length) return;
      gapRuns.push({ text: label, options: { bold: true, color, fontSize: 13, fontFace: BODY, breakLine: true, paraSpaceBefore: 6 } });
      items.forEach((it) => gapRuns.push({ text: it, options: { bullet: { code: "2022", indent: 14 }, color: C.ink, fontSize: 12, fontFace: BODY, breakLine: true, indentLevel: 1 } }));
    };
    addGroup("Ahead", g.ahead, C.good);
    addGroup("Close", g.close, C.tertiary || C.secondary);
    addGroup("Opportunity", g.opportunity, C.secondary);
    s.addText(gapRuns, { x: rx + 0.25, y: 2.8, w: colW - 0.5, h: 2.7, margin: 0, valign: "top" });
    if (cs.closing) s.addText(cs.closing, { x: M, y: 5.9, w: PW - 2 * M, h: 0.6, margin: 0, fontFace: BODY, fontSize: 14, italic: true, color: C.muted });
    footer(s);
  }

  // ===== SLIDE 4 — Organic Traffic =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("organicTraffic", "Organic Traffic"), "4");
    const ot = content?.organicTraffic || {};
    const stats = [
      { label: "Total Clicks", o: ot.clicks }, { label: "Total Impressions", o: ot.impressions },
      { label: "Average CTR", o: ot.ctr }, { label: "Average Position", o: ot.avgPosition },
    ].filter((x) => x.o && x.o.value);
    const n = stats.length || 1, cw = (PW - 2 * M - 0.3 * (n - 1)) / n;
    stats.forEach((st, i) => {
      const x = M + i * (cw + 0.3);
      card(s, x, 2.1, cw, 1.9);
      s.addText(String(st.o!.value), { x, y: 2.35, w: cw, h: 0.9, margin: 0, align: "center", fontFace: DISPLAY, fontSize: 40, bold: true, color: C.primary });
      s.addText(st.label.toUpperCase(), { x, y: 3.25, w: cw, h: 0.3, margin: 0, align: "center", fontFace: BODY, fontSize: 11, bold: true, color: C.muted, charSpacing: 1 });
      const prior = (st.o as Any).prior;
      if (prior) s.addText(`${prior} → ${st.o!.value}`, { x, y: 3.55, w: cw, h: 0.3, margin: 0, align: "center", fontFace: BODY, fontSize: 11, color: C.good });
    });
    if (ot.trend && ot.trend.labels && ot.trend.clicks) {
      s.addChart(pres.charts.LINE, [{ name: "Clicks", labels: ot.trend.labels, values: ot.trend.clicks }], { x: M, y: 4.25, w: PW - 2 * M, h: 2.0, lineSize: 3, lineSmooth: true, chartColors: [C.secondary], showLegend: false, catAxisLabelColor: C.muted, valAxisLabelColor: C.muted, valGridLine: { color: C.panelLine, size: 0.5 }, catGridLine: { style: "none" }, chartArea: { fill: { color: C.white } } });
    } else if (ot.note) {
      s.addText(ot.note, { x: M, y: 4.5, w: PW - 2 * M, h: 0.8, margin: 0, fontFace: BODY, fontSize: 14, italic: true, color: C.muted });
    }
    footer(s);
  }

  // ===== SLIDE 4B — Cross-Channel & AI Visibility (Tier 3) =====
  if (TIER === "3" && content?.crossChannelAi) {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("crossChannelAi", "Cross-Channel & AI Visibility"), "4B");
    const cc = content.crossChannelAi, colW = (PW - 2 * M - 0.4) / 2;
    card(s, M, 2.1, colW, 3.6);
    s.addText("Cross-Channel Performance", { x: M + 0.25, y: 2.3, w: colW - 0.5, h: 0.4, margin: 0, fontFace: DISPLAY, fontSize: 18, bold: true, color: C.primary });
    s.addText((cc.channels || []).map((c, i, a) => ({ text: `${c.name}: ${c.metric}`, options: { bullet: { code: "2022" }, breakLine: i !== a.length - 1, color: C.ink, fontSize: 13, fontFace: BODY, paraSpaceAfter: 10 } })), { x: M + 0.25, y: 2.8, w: colW - 0.5, h: 2.7, margin: 0, valign: "top" });
    const rx = M + colW + 0.4;
    card(s, rx, 2.1, colW, 3.6);
    s.addText("AI Visibility", { x: rx + 0.25, y: 2.3, w: colW - 0.5, h: 0.4, margin: 0, fontFace: DISPLAY, fontSize: 18, bold: true, color: C.primary });
    s.addText((cc.aiVisibility || []).map((c, i, a) => ({ text: c, options: { bullet: { code: "2022" }, breakLine: i !== a.length - 1, color: C.ink, fontSize: 13, fontFace: BODY, paraSpaceAfter: 10 } })), { x: rx + 0.25, y: 2.8, w: colW - 0.5, h: 2.7, margin: 0, valign: "top" });
    if (cc.note) s.addText(cc.note, { x: M, y: 5.9, w: PW - 2 * M, h: 0.6, margin: 0, fontFace: BODY, fontSize: 14, italic: true, color: C.muted });
    footer(s);
  }

  // ===== SLIDE 5 — Content & Insights =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("contentInsights", "Content & Insights"), "5");
    const ci = content?.contentInsights || {}, colW = (PW - 2 * M - 0.4) / 2;
    // Content-board framing when available (posted / approved); legacy
    // created / optimized columns otherwise.
    const leftItems = ci.posted?.length ? ci.posted : ci.pagesCreated || [];
    const leftLabel = ci.posted?.length ? "Posted & Live" : "Pages Created";
    const rightItems = ci.approved?.length ? ci.approved : ci.pagesOptimized || [];
    const rightLabel = ci.approved?.length ? "Approved & Up Next" : "Pages Optimized";
    card(s, M, 2.1, colW, 3.4);
    s.addText(leftLabel, { x: M + 0.25, y: 2.3, w: colW - 0.5, h: 0.4, margin: 0, fontFace: DISPLAY, fontSize: 17, bold: true, color: C.primary });
    s.addText(bullets(leftItems.map(stripDomain), { fontSize: 13 }), { x: M + 0.25, y: 2.75, w: colW - 0.5, h: 2.5, margin: 0, valign: "top" });
    const rx = M + colW + 0.4;
    card(s, rx, 2.1, colW, 3.4);
    s.addText(rightLabel, { x: rx + 0.25, y: 2.3, w: colW - 0.5, h: 0.4, margin: 0, fontFace: DISPLAY, fontSize: 17, bold: true, color: C.primary });
    s.addText(bullets(rightItems.map(stripDomain), { fontSize: 13 }), { x: rx + 0.25, y: 2.75, w: colW - 0.5, h: 2.5, margin: 0, valign: "top" });
    if (ci.linking) s.addText(ci.linking, { x: M, y: 5.7, w: PW - 2 * M, h: 0.7, margin: 0, fontFace: BODY, fontSize: 14, italic: true, color: C.muted });
    footer(s);
  }

  // ===== SLIDE 6 — Photo & Backlink =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("photoBacklink", "Photo & Backlink Optimization"), "6");
    const pb = content?.photoBacklink || {}, items: string[] = [];
    if ((pb.refreshes || []).length) items.push("Page refreshes: " + (pb.refreshes || []).map(stripDomain).join(", "));
    if (pb.backlinksBuilt) items.push(pb.backlinksBuilt);
    if (pb.toxicRemoved) items.push(pb.toxicRemoved);
    if (pb.counts && pb.counts.disavowedDomains != null) items.push(`${pb.counts.disavowedDomains} domains disavowed to date`);
    card(s, M, 2.1, PW - 2 * M, 3.8);
    s.addText(bullets(items, { fontSize: 15 }), { x: M + 0.35, y: 2.4, w: PW - 2 * M - 0.7, h: 3.2, margin: 0, valign: "top" });
    footer(s);
  }

  // ===== SLIDE 7 — Pages & Posting / Social =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("postingSocial", "Pages & Posting / Social"), "7");
    const ps = content?.postingSocial || {}, items: string[] = [];
    if (ps.flyers) items.push(ps.flyers);
    if ((ps.channels || []).length) items.push("Active channels: " + (ps.channels || []).join(", "));
    if (ps.youtube) items.push(ps.youtube);
    if (ps.misc) items.push(ps.misc);
    card(s, M, 2.1, PW - 2 * M, ps.outOfScope ? 3.0 : 3.8);
    s.addText(bullets(items, { fontSize: 15 }), { x: M + 0.35, y: 2.4, w: PW - 2 * M - 0.7, h: 2.4, margin: 0, valign: "top" });
    if (ps.outOfScope) {
      card(s, M, 5.3, PW - 2 * M, 1.0, C.panel);
      s.addText("Out of scope (informational): ", { x: M + 0.35, y: 5.45, w: 3.2, h: 0.7, margin: 0, valign: "middle", fontFace: BODY, fontSize: 12, bold: true, color: C.secondary });
      s.addText(ps.outOfScope, { x: M + 3.2, y: 5.45, w: PW - 2 * M - 3.5, h: 0.7, margin: 0, valign: "middle", fontFace: BODY, fontSize: 12, color: C.ink });
    }
    footer(s);
  }

  // ===== SLIDE 8 — Webpage Ranking Detail =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("rankingDetail", "Webpage Ranking Detail"), "8");
    const rd = content?.rankingDetail || {}, tp = rd.topPages || [];
    if (tp.length) {
      const head = [{ text: "Top Page", options: hcell() }, { text: "Clicks", options: hcell(true) }, { text: "Impressions", options: hcell(true) }];
      const rows = tp.map((p) => [
        { text: stripDomain(p.url), options: bcell({ fontSize: 12 }) },
        { text: String(p.clicks ?? "—"), options: bcell({ align: "center" }) },
        { text: p.impressions != null ? Number(p.impressions).toLocaleString() : "—", options: bcell({ align: "center" }) },
      ]);
      s.addTable([head, ...rows], { x: M, y: 2.0, w: PW - 2 * M, colW: [8.0, 1.95, 1.95], border: { type: "solid", pt: 0.5, color: C.panelLine }, fontFace: SAFE_BODY, rowH: 0.4, valign: "middle" });
    }
    if (rd.aiOverview) {
      const yy = tp.length ? Math.min(2.0 + 0.4 * (tp.length + 1) + 0.3, 6.0) : 2.2;
      card(s, M, yy, PW - 2 * M, 0.9, C.panel);
      s.addText([{ text: "AI Overview:  ", options: { bold: true, color: C.secondary } }, { text: rd.aiOverview, options: { color: C.ink } }], { x: M + 0.35, y: yy, w: PW - 2 * M - 0.7, h: 0.9, margin: 0, valign: "middle", fontFace: BODY, fontSize: 13 });
    }
    footer(s);
  }

  // ===== Optional CHART SLIDES (between slide 8 and slide 9) =====
  // Each bot-specified chart becomes its own slide with title + chart + source.
  if (Array.isArray(content?.charts) && content.charts.length) {
    const palette = [C.secondary, C.primary, C.tertiary || C.good, C.good, C.muted];
    for (const chart of content.charts.slice(0, 6)) {
      if (!chart || !Array.isArray(chart.labels) || !Array.isArray(chart.series) || chart.series.length === 0) continue;
      const s = pres.addSlide();
      s.background = { color: C.lightBg };
      sectionTitle(s, chart.title || "Performance", "•");
      if (chart.source) {
        s.addText(`Source: ${chart.source}`, {
          x: M, y: 1.55, w: PW - 2 * M, h: 0.4, margin: 0,
          fontFace: BODY, fontSize: 12, italic: true, color: C.muted,
        });
      }
      const chartData = chart.series.map((srs, i) => ({
        name: srs.name || `Series ${i + 1}`,
        labels: chart.labels,
        values: (srs.values || []).map((v) => Number.isFinite(v) ? v : 0),
      }));
      const chartType = chart.type === "bar" ? pres.charts.BAR : pres.charts.LINE;
      s.addChart(chartType, chartData, {
        x: M, y: 2.05, w: PW - 2 * M, h: 4.6,
        chartColors: chartData.map((_, i) => palette[i % palette.length]),
        showLegend: chartData.length > 1,
        legendPos: "b",
        legendFontFace: BODY,
        legendFontSize: 11,
        catAxisLabelColor: C.muted,
        catAxisLabelFontSize: 10,
        valAxisLabelColor: C.muted,
        valAxisLabelFontSize: 10,
        valGridLine: { color: C.panelLine, size: 0.5 },
        catGridLine: { style: "none" },
        chartArea: { fill: { color: C.white } },
        ...(chart.type !== "bar" ? { lineSize: 3, lineSmooth: true } : { barGapWidthPct: 60 }),
      });
      footer(s);
    }
  }

  // ===== Optional IMAGE SLIDES (admin uploads from the preview editor) =====
  if (Array.isArray(content?.images) && content.images.length) {
    for (const img of content.images.slice(0, 8)) {
      if (!img || typeof img.data !== "string" || !img.data.startsWith("data:image/")) continue;
      const s = pres.addSlide();
      s.background = { color: C.lightBg };
      sectionTitle(s, img.title || "Snapshot", "•");
      s.addImage({
        data: img.data,
        x: M, y: 1.7, w: PW - 2 * M, h: PH - 2.6,
        sizing: { type: "contain", w: PW - 2 * M, h: PH - 2.6 },
      });
      if (img.caption) {
        s.addText(img.caption, {
          x: M, y: PH - 0.8, w: PW - 2 * M, h: 0.35, margin: 0,
          fontFace: BODY, fontSize: 11, italic: true, color: C.muted, align: "center",
        });
      }
      footer(s);
    }
  }

  // ===== SLIDE 9 — What's Next =====
  {
    const s = pres.addSlide();
    s.background = { color: C.lightBg };
    sectionTitle(s, st("whatsNext", "What's Next"), "9");
    const next = (content?.whatsNext || []).slice(0, 6);
    const top = 2.1, gap = 0.18, h = Math.min(0.85, (PH - top - 0.7 - gap * (next.length - 1)) / Math.max(next.length, 1));
    next.forEach((t, i) => {
      const y = top + i * (h + gap);
      card(s, M, y, PW - 2 * M, h, C.panel);
      s.addShape(pres.shapes.OVAL, { x: M + 0.25, y: y + h / 2 - 0.16, w: 0.32, h: 0.32, fill: { color: C.primary } });
      s.addText(String(i + 1), { x: M + 0.25, y: y + h / 2 - 0.16, w: 0.32, h: 0.32, margin: 0, align: "center", valign: "middle", fontFace: BODY, fontSize: 13, bold: true, color: C.white });
      s.addText(t, { x: M + 0.8, y, w: PW - 2 * M - 1.0, h, margin: 0, valign: "middle", fontFace: BODY, fontSize: 15, color: C.ink });
    });
    footer(s);
  }

  // ===== SLIDE 10 — Questions =====
  {
    const s = pres.addSlide();
    s.background = { color: C.primary };
    const q = content?.questions || {};
    s.addText("Questions?", { x: M, y: 2.6, w: PW - 2 * M, h: 1.0, margin: 0, fontFace: DISPLAY, fontSize: 52, bold: true, color: C.white });
    if (q.prompt) s.addText(q.prompt, { x: M, y: 3.8, w: PW - 2 * M, h: 0.6, margin: 0, fontFace: BODY, fontSize: 18, color: "C7CBD4" });
    if (q.contact) s.addText(q.contact, { x: M, y: PH - 0.7, w: PW - 2 * M, h: 0.3, margin: 0, fontFace: BODY, fontSize: 12, color: "9AA0AE" });
    s.addShape(pres.shapes.OVAL, { x: M, y: 2.4, w: 0.16, h: 0.16, fill: { color: C.secondary } });
    brandMark(s, true);
  }

  // ---------- recompress + return as Buffer ----------
  const raw: NodeBuffer = await pres.write({ outputType: "nodebuffer" });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(raw);
    return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  } catch {
    return raw; // recompression is an optimization; raw buffer is still a valid .pptx
  }
}
