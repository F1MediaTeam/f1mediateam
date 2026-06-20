// PDF report builder. Every export section funnels through buildSectionPdf
// so client-facing files share one look: branded cover, KPI tiles, embedded
// PNG charts, then a paginated data table.

import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import sharp from "sharp";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

// brand palette mirrors the dashboard + the (now removed) XLSX report
const BRAND = {
  ink: "#0B0F19",
  paper: "#FFFFFF",
  accent: "#14B8A6",
  muted: "#6B7280",
  rule: "#E5E7EB",
  rowAlt: "#F8FAFC",
  ok: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
};

const style = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 40, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 10, color: BRAND.ink },

  // ---------- Hero header (logo top-left, date range top-right, huge title) ----------
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  logo: { width: 180, height: 72, objectFit: "contain" },
  topDate: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND.ink },
  hero: { fontSize: 48, fontFamily: "Helvetica-Bold", color: BRAND.ink, textAlign: "center", marginTop: 18, marginBottom: 22 },

  // ---------- KPI grid (mock-style: 5 columns × 2 rows, sparse) ----------
  kpiGrid: { flexDirection: "column", borderTopWidth: 1, borderLeftWidth: 1, borderColor: BRAND.ink, marginBottom: 28 },
  kpiGridRow: { flexDirection: "row" },
  kpiCell: {
    flex: 1, height: 56,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BRAND.ink,
    paddingHorizontal: 10, paddingVertical: 8,
    justifyContent: "flex-start",
  },
  kpiCellEmpty: {
    flex: 1, height: 56,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: BRAND.ink,
  },
  kpiCellLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND.ink, marginBottom: 4 },
  kpiCellValue: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center" },

  // ---------- "Graphs" section heading ----------
  graphsHeading: { fontSize: 28, fontFamily: "Helvetica-Bold", color: BRAND.ink, marginBottom: 12 },
  chart: { width: "100%", marginBottom: 16 },

  // ---------- Lede + breakdowns (cover extras) ----------
  lede: { fontSize: 10, color: BRAND.muted, marginTop: 4, marginBottom: 12, lineHeight: 1.45 },
  breakdownTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND.muted, letterSpacing: 1, marginTop: 4, marginBottom: 6 },
  breakdownTable: { borderTopWidth: 1, borderColor: BRAND.rule, marginBottom: 16 },
  breakdownRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: BRAND.rule, paddingVertical: 6, paddingHorizontal: 8 },
  breakdownRowAlt: { backgroundColor: BRAND.rowAlt },
  breakdownLabel: { flexGrow: 1, fontSize: 10, color: BRAND.ink },
  breakdownValue: { fontSize: 10, color: BRAND.ink, fontFamily: "Helvetica-Bold", textAlign: "right", minWidth: 60 },

  // ---------- Detail page ----------
  detailHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  detailLogo: { width: 110, height: 44, objectFit: "contain", marginRight: 14 },
  detailTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND.ink, flexGrow: 1 },
  detailMeta: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND.ink, textAlign: "right" },
  divider: { height: 1, backgroundColor: BRAND.rule, marginBottom: 14, marginTop: 4 },

  tableHeader: { flexDirection: "row", backgroundColor: BRAND.ink },
  tableHeaderCell: { paddingVertical: 7, paddingHorizontal: 6, color: BRAND.paper, fontSize: 9, fontFamily: "Helvetica-Bold" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: BRAND.rule, minHeight: 22 },
  tableRowAlt: { backgroundColor: BRAND.rowAlt },
  tableCell: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 9, color: BRAND.ink },

  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center" },

  footer: {
    position: "absolute", left: 36, right: 36, bottom: 18,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: BRAND.muted, borderTopWidth: 0.5, borderColor: BRAND.rule, paddingTop: 6,
  },

  empty: { textAlign: "center", color: BRAND.muted, fontSize: 11, marginTop: 60 },
});

// =========================================================================
// Logo
// =========================================================================

let logoPromise: Promise<Buffer> | null = null;
async function getLogoPng(): Promise<Buffer> {
  if (!logoPromise) {
    logoPromise = (async () => {
      const file = await readFile(path.join(process.cwd(), "public", "logo-dark.png"));
      // The mark has real alpha on a transparent field — flatten onto white so
      // the field renders white in the PDF while the dark/red strokes stay.
      // Then crop to the mark area and resize at 2× display height for crispness.
      return sharp(file)
        .flatten({ background: "#FFFFFF" })
        .extract({ left: 96, top: 320, width: 832, height: 384 })
        .resize({ height: 220, withoutEnlargement: true })
        .png()
        .toBuffer();
    })();
  }
  return logoPromise;
}

// =========================================================================
// Public types
// =========================================================================

export type ColumnKind = "text" | "long" | "id" | "date" | "datetime" | "int" | "money" | "bytes" | "badge";

export interface ColumnDef<T> {
  header: string;
  kind: ColumnKind;
  get: (row: T) => unknown;
  /** Flex weight for the column (default 1, except long=3, id=2). */
  flex?: number;
  badgeFor?: (v: unknown) => { fill: string; text: string } | null;
}

export interface SectionKpi {
  label: string;
  value: string | number;
  format?: "int" | "pct" | "money";
  tone?: "neutral" | "ok" | "warn" | "bad";
}

// Charts are now react-pdf elements (built natively in SVG primitives). The
// older PNG path produced boxes on the Vercel runtime because libvips had no
// fonts; native react-pdf SVG uses PDF's built-in Helvetica.
export interface ChartNode {
  title?: string;
  node: React.ReactElement;
}

// An additional, self-contained data table rendered on its own page after the
// primary detail table. Used when a section mixes data cadences (e.g. daily
// GSC/Bing vs. monthly SEMrush) that don't belong in the same grid.
export interface ExtraTable {
  title: string;
  columns: ColumnDef<Record<string, unknown>>[];
  rows: Record<string, unknown>[];
}

export interface SectionInput<T> {
  companyName: string;
  fromIso?: string;
  toIso?: string;
  generatedAt: Date;
  tz: string;
  sectionTitle: string;
  sectionLede?: string;
  kpis: SectionKpi[];
  columns: ColumnDef<T>[];
  rows: T[];
  breakdowns?: { title: string; pairs: Array<{ label: string; value: string | number }> }[];
  charts?: ChartNode[];
  /** Extra tables, each on its own page after the primary detail table. */
  extraTables?: ExtraTable[];
  /** Render the detail tables in landscape (for wide, many-column tables so
   *  headers fit on one line). Cover/graphs page stays portrait. */
  landscape?: boolean;
}

// =========================================================================
// Badge palettes (re-exported so call sites match the previous API)
// =========================================================================

export const STAGE_BADGE: Record<string, { fill: string; text: string }> = {
  proposed: { fill: "#FEF3C7", text: "#92400E" },
  pending:  { fill: "#DBEAFE", text: "#1E3A8A" },
  posted:   { fill: "#D1FAE5", text: "#065F46" },
};
export const STATUS_BADGE: Record<string, { fill: string; text: string }> = {
  open: { fill: "#FEF3C7", text: "#92400E" },
  done: { fill: "#D1FAE5", text: "#065F46" },
};
export const ROLE_BADGE: Record<string, { fill: string; text: string }> = {
  admin:  { fill: "#E0E7FF", text: "#3730A3" },
  client: { fill: "#D1FAE5", text: "#065F46" },
};
export const TYPE_BADGE: Record<string, { fill: string; text: string }> = {
  meeting:  { fill: "#E0E7FF", text: "#3730A3" },
  deadline: { fill: "#FEE2E2", text: "#991B1B" },
};

// =========================================================================
// Helpers
// =========================================================================

function fmtDateTimeIn(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
}

function fmtDateOnly(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function fmtInt(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "";
}

function fmtBytes(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let val = n;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtKpi(kpi: SectionKpi): string {
  if (typeof kpi.value === "number") {
    if (kpi.format === "pct") return `${Math.round(kpi.value * 100)}%`;
    if (kpi.format === "money") return `$${kpi.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return kpi.value.toLocaleString("en-US");
  }
  return String(kpi.value);
}

function kpiTone(kpi: SectionKpi): string {
  switch (kpi.tone) {
    case "ok":   return BRAND.ok;
    case "warn": return BRAND.warn;
    case "bad":  return BRAND.bad;
    default:     return BRAND.ink;
  }
}

function flexFor(kind: ColumnKind, override?: number): number {
  if (override !== undefined) return override;
  switch (kind) {
    case "id": return 2;
    case "long": return 3;
    case "datetime": return 2;
    case "badge": return 1;
    default: return 1.5;
  }
}

function alignFor(kind: ColumnKind): "left" | "right" | "center" {
  if (kind === "int" || kind === "money" || kind === "bytes") return "right";
  if (kind === "badge") return "center";
  return "left";
}

// =========================================================================
// Cells
// =========================================================================

function Cell<T>({ col, row, tz }: { col: ColumnDef<T>; row: T; tz: string }) {
  const raw = col.get(row);
  const align = alignFor(col.kind);
  const flex = flexFor(col.kind, col.flex);

  if (raw === null || raw === undefined || raw === "") {
    return (
      <View style={[style.tableCell, { flex, alignItems: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }]}>
        <Text style={{ color: BRAND.muted, fontFamily: "Helvetica-Oblique" }}>—</Text>
      </View>
    );
  }

  if (col.kind === "badge") {
    const badge = col.badgeFor?.(raw);
    return (
      <View style={[style.tableCell, { flex, alignItems: "center" }]}>
        <Text style={[
          style.badge,
          { backgroundColor: badge?.fill ?? BRAND.rowAlt, color: badge?.text ?? BRAND.ink },
        ]}>{String(raw)}</Text>
      </View>
    );
  }

  let display: string;
  let extra: { fontFamily?: string; color?: string; fontSize?: number } = {};
  switch (col.kind) {
    case "datetime":
      display = fmtDateTimeIn(String(raw), tz); break;
    case "date":
      display = fmtDateOnly(raw); break;
    case "id":
      display = String(raw); extra = { fontFamily: "Courier", color: BRAND.muted, fontSize: 8 }; break;
    case "int":
      display = fmtInt(raw); break;
    case "money":
      display = `$${Number(raw).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; break;
    case "bytes":
      display = fmtBytes(raw); break;
    case "long":
      display = String(raw); break;
    case "text":
    default:
      display = String(raw); break;
  }

  return (
    <View style={[style.tableCell, { flex, alignItems: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }]}>
      <Text style={extra}>{display}</Text>
    </View>
  );
}

// =========================================================================
// PDF document
// =========================================================================

function fmtTopDate(fromIso?: string, toIso?: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  };
  if (fromIso && toIso) return `${fmt(fromIso)} - ${fmt(toIso)}`;
  if (fromIso) return `Since ${fmt(fromIso)}`;
  if (toIso) return `Through ${fmt(toIso)}`;
  return "All time";
}

function KpiGrid({ kpis }: { kpis: SectionKpi[] }) {
  // 5-col × 2-row grid, sparse — extra cells render as empty boxes to match
  // the mockup look.
  const COLS = 5;
  const ROWS = 2;
  const total = COLS * ROWS;
  const padded: (SectionKpi | null)[] = [...kpis];
  while (padded.length < total) padded.push(null);

  return (
    <View style={style.kpiGrid}>
      {[0, 1].map((rowIdx) => (
        <View key={rowIdx} style={style.kpiGridRow}>
          {padded.slice(rowIdx * COLS, rowIdx * COLS + COLS).map((k, colIdx) =>
            k ? (
              <View key={colIdx} style={style.kpiCell}>
                <Text style={style.kpiCellLabel}>{k.label}</Text>
                <Text style={[style.kpiCellValue, { color: kpiTone(k) }]}>{fmtKpi(k)}</Text>
              </View>
            ) : (
              <View key={colIdx} style={style.kpiCellEmpty} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function TablePage<T>({
  title,
  columns,
  rows,
  tz,
  fromIso,
  toIso,
  logoBase64,
  footer,
  orientation = "portrait",
}: {
  title: string;
  columns: ColumnDef<T>[];
  rows: T[];
  tz: string;
  fromIso?: string;
  toIso?: string;
  logoBase64: string;
  footer: React.ReactElement;
  orientation?: "portrait" | "landscape";
}) {
  // Landscape pages are used for wide many-column tables; tighten the header
  // font/padding there so long headers ("GSC Impressions") stay on one line.
  const landscape = orientation === "landscape";
  const headerExtra = landscape ? { fontSize: 8, paddingHorizontal: 4 } : {};
  return (
    <Page size="LETTER" orientation={orientation} style={style.page}>
      <View style={style.detailHeader}>
        <Image src={logoBase64} style={style.detailLogo} />
        <Text style={style.detailTitle}>{title}</Text>
        <Text style={style.detailMeta}>{fmtTopDate(fromIso, toIso)}</Text>
      </View>
      <View style={style.divider} />

      {/* Header row (repeats on every overflow page) */}
      <View style={style.tableHeader} fixed>
        {columns.map((c, i) => {
          const flex = flexFor(c.kind, c.flex);
          const align = alignFor(c.kind);
          return (
            <Text key={i} style={[style.tableHeaderCell, headerExtra, { flex, textAlign: align }]}>
              {c.header}
            </Text>
          );
        })}
      </View>

      {/* Body */}
      {rows.length === 0 ? (
        <Text style={style.empty}>Nothing to report in this window.</Text>
      ) : (
        rows.map((row, i) => (
          <View key={i} style={[style.tableRow, i % 2 === 1 ? style.tableRowAlt : {}]} wrap={false}>
            {columns.map((c, j) => (
              <Cell key={j} col={c} row={row} tz={tz} />
            ))}
          </View>
        ))
      )}

      {footer}
    </Page>
  );
}

function ReportDocument<T>({
  input,
  logoBase64,
}: {
  input: SectionInput<T>;
  logoBase64: string;
}) {
  const generatedLabel = input.generatedAt.toLocaleString("en-US", { timeZone: input.tz, dateStyle: "long", timeStyle: "short" });

  const Footer = (
    <View style={style.footer} fixed>
      <Text>F1 Media · {input.companyName} · Generated {generatedLabel}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );

  const hasCharts = (input.charts ?? []).length > 0;

  return (
    <Document title={`${input.companyName} — ${input.sectionTitle}`} author="F1 Media">
      {/* Cover / summary page */}
      <Page size="LETTER" style={style.page}>
        <View style={style.topBar}>
          <Image src={logoBase64} style={style.logo} />
          <Text style={style.topDate}>{fmtTopDate(input.fromIso, input.toIso)}</Text>
        </View>

        <Text style={style.hero}>{input.sectionTitle}</Text>

        <KpiGrid kpis={input.kpis} />

        {input.sectionLede ? <Text style={style.lede}>{input.sectionLede}</Text> : null}

        {(input.breakdowns ?? []).map((b, bi) => (
          <View key={bi}>
            <Text style={style.breakdownTitle}>{b.title.toUpperCase()}</Text>
            <View style={style.breakdownTable}>
              {b.pairs.map((p, i) => (
                <View key={i} style={[style.breakdownRow, i % 2 === 1 ? style.breakdownRowAlt : {}]}>
                  <Text style={style.breakdownLabel}>{p.label}</Text>
                  <Text style={style.breakdownValue}>
                    {typeof p.value === "number" ? p.value.toLocaleString("en-US") : p.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {hasCharts ? <Text style={style.graphsHeading}>Graphs</Text> : null}
        {(input.charts ?? []).map((c, i) => (
          <View key={i} wrap={false} style={style.chart}>
            {c.node}
          </View>
        ))}

        {Footer}
      </Page>

      {/* Detail page(s) — primary table first, then any extra tables. */}
      <TablePage
        title={`${input.sectionTitle} — Detail`}
        columns={input.columns}
        rows={input.rows}
        tz={input.tz}
        fromIso={input.fromIso}
        toIso={input.toIso}
        logoBase64={logoBase64}
        footer={Footer}
        orientation={input.landscape ? "landscape" : "portrait"}
      />
      {(input.extraTables ?? []).map((t, i) => (
        <TablePage
          key={i}
          title={t.title}
          columns={t.columns}
          rows={t.rows}
          tz={input.tz}
          fromIso={input.fromIso}
          toIso={input.toIso}
          logoBase64={logoBase64}
          footer={Footer}
          orientation={input.landscape ? "landscape" : "portrait"}
        />
      ))}
    </Document>
  );
}

// =========================================================================
// Entry point
// =========================================================================

export async function buildSectionPdf<T>(input: SectionInput<T>): Promise<Buffer> {
  const logoPng = await getLogoPng();
  const logoBase64 = `data:image/png;base64,${logoPng.toString("base64")}`;
  return renderToBuffer(<ReportDocument input={input} logoBase64={logoBase64} />);
}
