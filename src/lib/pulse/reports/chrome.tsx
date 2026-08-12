// Report Center — shared document chrome.
//
// Every F1 Pulse report is built from these pieces, so a Rankings PDF and a
// Monthly PDF are recognisably the same document family. The templates supply
// content; this file owns the cover, the running header, the footer, section
// framing, and the source labels.
//
// React-PDF, not headless Chromium: it is already installed and already renders
// four other PDFs in this repo, and it needs no ~50MB browser binary in the
// lambda. The cost of that choice is real and worth stating — React-PDF does not
// render HTML, so the on-screen report view and the PDF share data and design
// tokens, never components. They are two renderers of one design, kept in step
// by the palette and spacing constants below.

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

// ---------------------------------------------------------------- palette

/**
 * Print-tuned F1 palette. `accentPrint` rather than the on-screen `#e11d2e`:
 * the screen red is slightly out of gamut for CMYK and muddies when a client
 * prints the PDF on an office laser.
 */
export const REPORT = {
  accent: "#E42130",
  ink: "#272727",
  inkSoft: "#5A5F66",
  inkFaint: "#8B9099",
  rule: "#E3E6EA",
  ruleSoft: "#F0F2F5",
  paper: "#FFFFFF",
  panel: "#FAFBFC",
  ok: "#1B7F4B",
  warn: "#B26A00",
  bad: "#C0392B",
} as const;

/** One spacing scale, so sections stack predictably across templates. */
export const SP = { xs: 4, sm: 8, md: 14, lg: 22, xl: 32 } as const;

const PAGE_PAD = { top: 54, bottom: 46, left: 42, right: 42 };

// ---------------------------------------------------------------- styles

const s = StyleSheet.create({
  page: {
    paddingTop: PAGE_PAD.top,
    paddingBottom: PAGE_PAD.bottom,
    paddingLeft: PAGE_PAD.left,
    paddingRight: PAGE_PAD.right,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: REPORT.ink,
    backgroundColor: REPORT.paper,
  },

  // Running header — fixed, so it repeats on every page of a long table.
  header: {
    position: "absolute",
    top: 22,
    left: PAGE_PAD.left,
    right: PAGE_PAD.right,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: REPORT.rule,
  },
  headerLeft: { flexDirection: "column", maxWidth: "62%" },
  headerClient: { fontSize: 9, fontFamily: "Helvetica-Bold", color: REPORT.ink },
  headerTitle: { fontSize: 7.5, color: REPORT.inkFaint, marginTop: 1.5 },
  headerRight: { flexDirection: "column", alignItems: "flex-end" },
  headerAgency: { fontSize: 8, fontFamily: "Helvetica-Bold", color: REPORT.ink },
  headerMeta: { fontSize: 7, color: REPORT.inkFaint, marginTop: 1.5 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: PAGE_PAD.left,
    right: PAGE_PAD.right,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: REPORT.ruleSoft,
  },
  footerText: { fontSize: 7, color: REPORT.inkFaint },

  // Cover
  coverPage: { fontFamily: "Helvetica", padding: 0 },
  coverBand: { height: 6, backgroundColor: REPORT.accent },
  coverBody: { flexGrow: 1, paddingHorizontal: 54, paddingTop: 96 },
  coverEyebrow: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.6,
    color: REPORT.accent,
  },
  coverClient: { fontSize: 34, fontFamily: "Helvetica-Bold", marginTop: 18, lineHeight: 1.12 },
  coverTitle: { fontSize: 15, marginTop: 10 },
  coverRange: { fontSize: 10, marginTop: 22 },
  coverRule: { height: 2, width: 64, backgroundColor: REPORT.accent, marginTop: 26 },
  coverFooter: { paddingHorizontal: 54, paddingBottom: 48 },
  coverAgency: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  coverContact: { fontSize: 8.5, marginTop: 3 },

  // Sections
  sectionWrap: { marginBottom: SP.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: SP.sm },
  sectionTick: { width: 3, height: 13, backgroundColor: REPORT.accent, marginRight: 7 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  sectionSub: { fontSize: 8, color: REPORT.inkSoft, marginBottom: SP.sm, lineHeight: 1.45 },

  source: { fontSize: 6.5, color: REPORT.inkFaint, marginTop: SP.xs, lineHeight: 1.4 },

  // Highlights
  highlights: {
    backgroundColor: REPORT.panel,
    borderLeftWidth: 3,
    borderLeftColor: REPORT.accent,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: REPORT.rule,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    padding: 12,
    marginBottom: SP.lg,
  },
  highlightsTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    color: REPORT.inkSoft,
    marginBottom: 7,
  },
  highlightRow: { flexDirection: "row", marginBottom: 4.5 },
  highlightDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: REPORT.accent, marginTop: 4, marginRight: 7 },
  highlightText: { fontSize: 9, lineHeight: 1.42, flex: 1 },

  // KPIs
  kpiRow: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  kpiCell: { paddingHorizontal: 4, marginBottom: SP.sm },
  kpiBox: {
    borderWidth: 1,
    borderColor: REPORT.rule,
    borderRadius: 3,
    padding: 10,
    backgroundColor: REPORT.paper,
    height: 62,
  },
  kpiLabel: { fontSize: 6.5, letterSpacing: 0.7, color: REPORT.inkFaint, fontFamily: "Helvetica-Bold" },
  kpiValue: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 5 },
  kpiDelta: { fontSize: 7, marginTop: 3 },

  // Tables
  tHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: REPORT.ink,
    paddingBottom: 4,
    marginBottom: 1,
  },
  tHeadCell: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, color: REPORT.inkSoft },
  tRow: { flexDirection: "row", paddingVertical: 4.5, borderBottomWidth: 1, borderBottomColor: REPORT.ruleSoft },
  tCell: { fontSize: 8.5 },
  truncNote: { fontSize: 7, color: REPORT.inkFaint, marginTop: SP.sm, fontFamily: "Helvetica-Oblique" },

  empty: {
    borderWidth: 1,
    borderColor: REPORT.rule,
    borderStyle: "dashed",
    borderRadius: 3,
    padding: 16,
  },
  emptyText: { fontSize: 8.5, color: REPORT.inkSoft, textAlign: "center", lineHeight: 1.5 },

  watermark: {
    position: "absolute",
    top: 300,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 88,
    fontFamily: "Helvetica-Bold",
    color: REPORT.accent,
    opacity: 0.07,
    transform: "rotate(-28deg)",
  },
});

// ---------------------------------------------------------------- types

export interface AgencyProfile {
  name: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address_1?: string | null;
  address_2?: string | null;
}

export interface ReportMeta {
  agency: AgencyProfile;
  clientName: string;
  domain: string;
  /** e.g. "Monthly Performance Report" */
  title: string;
  /** e.g. "July 2026" */
  rangeLabel: string;
  /** ISO date the document was produced — passed in, never computed here. */
  generatedOn: string;
  coverStyle: "light" | "dark";
  /** Any mocked figure anywhere in the document ⇒ SAMPLE across every page. */
  mocked: boolean;
  /** Absolute or data-URI logo. Omitted rather than broken if unavailable. */
  logo?: string | null;
}

// ---------------------------------------------------------------- pieces

/** Repeats on every page. `fixed` is what makes it survive a table page-break. */
export function RunningHeader({ meta }: { meta: ReportMeta }) {
  return (
    <View style={s.header} fixed>
      <View style={s.headerLeft}>
        <Text style={s.headerClient}>{meta.clientName}</Text>
        <Text style={s.headerTitle}>
          {meta.title} · {meta.rangeLabel}
        </Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerAgency}>{meta.agency.name}</Text>
        {meta.agency.website ? <Text style={s.headerMeta}>{meta.agency.website}</Text> : null}
      </View>
    </View>
  );
}

export function RunningFooter({ meta }: { meta: ReportMeta }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        {meta.domain} · Generated {meta.generatedOn}
        {meta.mocked ? " · SAMPLE DATA — not for client delivery" : ""}
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

/**
 * Stamped on every page when any figure is mocked. Deliberately hard to remove
 * by accident: a sample that reaches a client unmarked is worse than no report.
 */
export function SampleWatermark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Text style={s.watermark} fixed>
      SAMPLE
    </Text>
  );
}

/** A standard content page with header, footer and watermark already wired. */
export function ReportPage({ meta, children }: { meta: ReportMeta; children: ReactNode }) {
  return (
    <Page size="LETTER" style={s.page} wrap>
      <RunningHeader meta={meta} />
      <SampleWatermark show={meta.mocked} />
      {children}
      <RunningFooter meta={meta} />
    </Page>
  );
}

export function Cover({ meta }: { meta: ReportMeta }) {
  const dark = meta.coverStyle === "dark";
  const bg = dark ? REPORT.ink : REPORT.paper;
  const fg = dark ? REPORT.paper : REPORT.ink;
  const soft = dark ? "#A8ADB5" : REPORT.inkSoft;

  const contact = [meta.agency.website, meta.agency.email, meta.agency.phone].filter(Boolean);
  const address = [meta.agency.address_1, meta.agency.address_2].filter(Boolean);

  return (
    <Page size="LETTER" style={[s.coverPage, { backgroundColor: bg }]}>
      <View style={s.coverBand} />
      <SampleWatermark show={meta.mocked} />

      <View style={s.coverBody}>
        {meta.logo ? (
          <Image src={meta.logo} style={{ width: 118, marginBottom: 34 }} />
        ) : null}
        <Text style={s.coverEyebrow}>F1 PULSE</Text>
        <Text style={[s.coverClient, { color: fg }]}>{meta.clientName}</Text>
        <Text style={[s.coverTitle, { color: soft }]}>{meta.title}</Text>
        <View style={s.coverRule} />
        <Text style={[s.coverRange, { color: fg }]}>{meta.rangeLabel}</Text>
        <Text style={[s.coverContact, { color: soft, marginTop: 6 }]}>{meta.domain}</Text>
      </View>

      <View style={s.coverFooter}>
        <Text style={[s.coverAgency, { color: fg }]}>{meta.agency.name}</Text>
        {contact.length ? (
          <Text style={[s.coverContact, { color: soft }]}>{contact.join("  ·  ")}</Text>
        ) : null}
        {address.length ? (
          <Text style={[s.coverContact, { color: soft }]}>{address.join(", ")}</Text>
        ) : null}
        <Text style={[s.coverContact, { color: soft, marginTop: 8 }]}>
          Prepared {meta.generatedOn}
          {meta.mocked ? "  ·  SAMPLE DATA — not for client delivery" : ""}
        </Text>
      </View>
    </Page>
  );
}

export function Section({
  title,
  subtitle,
  source,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Where these numbers came from. Required by the data-honesty rule below. */
  source?: string;
  children: ReactNode;
}) {
  return (
    <View style={s.sectionWrap} wrap={false}>
      <View style={s.sectionHead}>
        <View style={s.sectionTick} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      {children}
      {source ? <Text style={s.source}>{source}</Text> : null}
    </View>
  );
}

/**
 * Data honesty, §7. Every figure carries its provenance, and a measured number
 * is never allowed to look like an estimated one. `asOf` is passed in rather
 * than read from the clock so a re-render of the same report is byte-identical.
 */
export function sourceLine(opts: {
  provider: string;
  asOf?: string;
  estimated?: boolean;
  note?: string;
}): string {
  const parts = [`Source: ${opts.provider}`];
  if (opts.asOf) parts.push(`as of ${opts.asOf}`);
  if (opts.estimated) parts.push("Estimated — third-party model, not measured");
  if (opts.note) parts.push(opts.note);
  return parts.join(" · ");
}

export interface Kpi {
  label: string;
  value: string;
  /**
   * Three distinct states, and the difference matters on the page:
   *   number    — show the change
   *   null      — this metric is comparable, but there's no baseline yet
   *   undefined — comparison is meaningless here (a count of tracked terms),
   *               so no line is drawn at all rather than "No prior period"
   *               repeated under every card.
   */
  delta?: number | null;
  /** For metrics where down is good (bounce rate, errors, load time). */
  invert?: boolean;
}

export function KpiRow({ items, perRow = 4 }: { items: Kpi[]; perRow?: number }) {
  if (items.length === 0) return null;
  const width = `${100 / perRow}%`;

  return (
    <View style={s.kpiRow}>
      {items.map((k) => {
        const comparable = k.delta !== undefined;
        const has = typeof k.delta === "number" && Number.isFinite(k.delta);
        // A delta is only good or bad relative to the metric's direction —
        // a 20% rise in errors is not a win.
        const good = has ? (k.invert ? k.delta! < 0 : k.delta! > 0) : false;
        const flat = has && Math.abs(k.delta!) < 0.5;
        const color = !has || flat ? REPORT.inkFaint : good ? REPORT.ok : REPORT.bad;
        const arrow = !has || flat ? "" : k.delta! > 0 ? "▲ " : "▼ ";

        return (
          <View key={k.label} style={[s.kpiCell, { width }]}>
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>{k.label.toUpperCase()}</Text>
              <Text style={s.kpiValue}>{k.value}</Text>
              {comparable ? (
                <Text style={[s.kpiDelta, { color }]}>
                  {has ? `${arrow}${Math.abs(k.delta!).toFixed(1)}%` : "No prior period"}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function Highlights({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.highlights} wrap={false}>
      <Text style={s.highlightsTitle}>WHAT CHANGED</Text>
      {items.map((t, i) => (
        <View key={i} style={s.highlightRow}>
          <View style={s.highlightDot} />
          <Text style={s.highlightText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export interface Col<T> {
  header: string;
  /** Flex weight within the row. */
  width: number;
  align?: "left" | "right";
  cell: (row: T) => string;
  color?: (row: T) => string | undefined;
}

export function Table<T>({
  cols,
  rows,
  /** Rows beyond this go to the CSV companion rather than bloating the PDF. */
  limit = 25,
  csvName,
  emptyMessage,
}: {
  cols: Col<T>[];
  rows: T[];
  limit?: number;
  csvName?: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>{emptyMessage ?? "No data for this period."}</Text>
      </View>
    );
  }

  const shown = rows.slice(0, limit);

  return (
    <View>
      <View style={s.tHead} fixed>
        {cols.map((c) => (
          <Text
            key={c.header}
            style={[s.tHeadCell, { flex: c.width, textAlign: c.align ?? "left" }]}
          >
            {c.header.toUpperCase()}
          </Text>
        ))}
      </View>

      {shown.map((r, i) => (
        <View key={i} style={s.tRow} wrap={false}>
          {cols.map((c) => (
            <Text
              key={c.header}
              style={[
                s.tCell,
                { flex: c.width, textAlign: c.align ?? "left", color: c.color?.(r) ?? REPORT.ink },
              ]}
            >
              {c.cell(r)}
            </Text>
          ))}
        </View>
      ))}

      {rows.length > shown.length ? (
        <Text style={s.truncNote}>
          Showing {shown.length} of {rows.length.toLocaleString("en-US")}.
          {csvName ? ` Full list in ${csvName}.` : ""}
        </Text>
      ) : null}
    </View>
  );
}

/** Wraps a template's pages into a titled document with consistent metadata. */
export function ReportDocument({ meta, children }: { meta: ReportMeta; children: ReactNode }) {
  return (
    <Document
      title={`${meta.clientName} — ${meta.title} — ${meta.rangeLabel}`}
      author={meta.agency.name}
      subject={`${meta.title} for ${meta.domain}`}
      creator="F1 Pulse"
      producer="F1 Pulse"
    >
      <Cover meta={meta} />
      {children}
    </Document>
  );
}
