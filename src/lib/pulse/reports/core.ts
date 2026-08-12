// Report Center — ranges, filenames, CSV companions, and the template registry.
//
// Pure functions wherever possible: everything here is exercised by the
// acceptance gate, and a date helper that reads the clock internally can't be
// tested against a known answer. `today` is always passed in.

import { createServiceClient } from "@/lib/supabase/server";
import type { AgencyProfile } from "./chrome";

// ---------------------------------------------------------------- templates

export type TemplateId =
  | "monthly"
  | "traffic"
  | "site_audit"
  | "rankings"
  | "backlinks"
  | "domain_overview"
  | "ai_visibility"
  | "competitors";

export interface TemplateDef {
  id: TemplateId;
  name: string;
  /** One line, shown on the Report Center card. */
  blurb: string;
  /** Which Pulse tab's "Pull report" button generates it. */
  tab: string;
  /** False until the collector behind it exists — renders from mock, watermarked. */
  live: boolean;
}

/**
 * Build order, and honest about readiness. Six of the eight depend on Phase 3
 * collectors that don't exist yet; those render from mock data and are stamped
 * SAMPLE on every page rather than quietly showing invented numbers.
 */
export const TEMPLATES: TemplateDef[] = [
  {
    id: "monthly",
    name: "Monthly Performance Report",
    blurb: "The client-facing summary: traffic, search, rankings and site health for one month.",
    tab: "Overview",
    live: true,
  },
  {
    id: "traffic",
    name: "Traffic Report",
    blurb: "Visitors, pageviews, sources, top pages, devices and Core Web Vitals.",
    tab: "Traffic",
    live: true,
  },
  {
    id: "site_audit",
    name: "Site Audit",
    blurb: "F1 Site Health with every crawl issue grouped by severity, plus the fix.",
    tab: "Health",
    live: true,
  },
  {
    id: "rankings",
    name: "Rankings Report",
    blurb: "Tracked keyword positions, movement, and the CTR-weighted visibility index.",
    tab: "Rankings",
    live: true,
  },
  {
    id: "backlinks",
    name: "Backlink Report",
    blurb: "Referring domains, new and lost links, and F1 Link Quality buckets.",
    tab: "Backlinks",
    live: false,
  },
  {
    id: "domain_overview",
    name: "Domain Overview",
    blurb: "Authority, keyword footprint and estimated traffic for any domain.",
    tab: "Domains",
    live: false,
  },
  {
    id: "ai_visibility",
    name: "AI Search Visibility",
    blurb: "Where the brand appears across AI assistants and AI Overviews.",
    tab: "AI Visibility",
    live: false,
  },
  {
    id: "competitors",
    name: "Competitor Report",
    blurb: "Head-to-head visibility, shared keywords and gaps against tracked rivals.",
    tab: "Competitors",
    live: false,
  },
];

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

// ---------------------------------------------------------------- ranges

export type RangeKind = "last_month" | "last_30d" | "last_90d" | "this_month" | "custom";

export interface ResolvedRange {
  from: string;
  to: string;
  label: string;
  /** The like-for-like comparison window, for deltas. */
  prevFrom: string;
  prevTo: string;
  prevLabel: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function fmtDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

/**
 * `today` is injected so this is deterministic and testable.
 *
 * Default is last full month, not the last 30 days: a report labelled "July"
 * that silently includes three days of August invites an argument with the
 * client that the data can't win.
 */
export function resolveRange(
  kind: RangeKind,
  today: Date,
  custom?: { from: string; to: string },
): ResolvedRange {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  if (kind === "last_month") {
    const start = utc(y, m - 1, 1);
    const end = utc(y, m, 0);
    const pStart = utc(y, m - 2, 1);
    const pEnd = utc(y, m - 1, 0);
    return {
      from: iso(start),
      to: iso(end),
      label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
      prevFrom: iso(pStart),
      prevTo: iso(pEnd),
      prevLabel: `${MONTHS[pStart.getUTCMonth()]} ${pStart.getUTCFullYear()}`,
    };
  }

  if (kind === "this_month") {
    const start = utc(y, m, 1);
    // Month-to-date compared against the same number of days last month, so a
    // partial month isn't measured against a full one.
    const days = today.getUTCDate();
    const pStart = utc(y, m - 1, 1);
    const pEnd = utc(y, m - 1, days);
    return {
      from: iso(start),
      to: iso(today),
      label: `${MONTHS[m]} ${y} (month to date)`,
      prevFrom: iso(pStart),
      prevTo: iso(pEnd),
      prevLabel: `${MONTHS[pStart.getUTCMonth()]} 1–${days}`,
    };
  }

  if (kind === "last_30d" || kind === "last_90d") {
    const span = kind === "last_30d" ? 30 : 90;
    const end = utc(y, m, today.getUTCDate() - 1);
    const start = new Date(end.getTime() - (span - 1) * 86_400_000);
    const pEnd = new Date(start.getTime() - 86_400_000);
    const pStart = new Date(pEnd.getTime() - (span - 1) * 86_400_000);
    return {
      from: iso(start),
      to: iso(end),
      label: `Last ${span} days (${fmtDay(iso(start))} – ${fmtDay(iso(end))})`,
      prevFrom: iso(pStart),
      prevTo: iso(pEnd),
      prevLabel: `Previous ${span} days`,
    };
  }

  // custom
  const from = custom?.from ?? iso(utc(y, m - 1, 1));
  const to = custom?.to ?? iso(utc(y, m, 0));
  const span = Math.max(
    1,
    Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1,
  );
  const pEnd = new Date(Date.parse(from) - 86_400_000);
  const pStart = new Date(pEnd.getTime() - (span - 1) * 86_400_000);
  return {
    from,
    to,
    label: `${fmtDay(from)} – ${fmtDay(to)}`,
    prevFrom: iso(pStart),
    prevTo: iso(pEnd),
    prevLabel: `Previous ${span} days`,
  };
}

// ---------------------------------------------------------------- filenames

function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join("-");
}

/**
 * `F1-Media-Team_Precision-Graphics_Monthly_2026-07.pdf`
 *
 * Agency first so a client's download folder groups every F1 deliverable
 * together; the date last and ISO-ordered so the folder sorts chronologically.
 */
export function reportFilename(opts: {
  agencyName: string;
  clientName: string;
  template: TemplateId;
  range: ResolvedRange;
  ext?: string;
  /** Distinguishes CSV companions: "top-pages" ⇒ `…_2026-07_top-pages.csv`. */
  suffix?: string;
}): string {
  const t = templateById(opts.template);
  const name = slug(t ? t.name.replace(/ Report$/, "") : opts.template);
  // A whole calendar month is identified by the month alone; anything else
  // needs both endpoints. The `to` must be the month's *last* day, not merely
  // inside it — otherwise an August month-to-date report and the final August
  // report would share a filename and silently overwrite each other.
  const [fy, fm] = opts.range.from.split("-").map(Number);
  const lastDay = new Date(Date.UTC(fy, fm, 0)).toISOString().slice(0, 10);
  const isWholeMonth = opts.range.from.endsWith("-01") && opts.range.to === lastDay;
  const stamp = isWholeMonth ? opts.range.from.slice(0, 7) : `${opts.range.from}_${opts.range.to}`;

  return [
    slug(opts.agencyName),
    slug(opts.clientName),
    name,
    stamp,
    opts.suffix ? slug(opts.suffix).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join("_") + `.${opts.ext ?? "pdf"}`;
}

// ---------------------------------------------------------------- CSV

/**
 * RFC 4180 quoting. The leading-character guard blocks CSV injection: a query
 * beginning `=`, `+`, `-` or `@` is executed as a formula when the client opens
 * the file in Excel, and search queries are attacker-supplied text.
 */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let sv = String(v);
  if (/^[=+\-@\t\r]/.test(sv)) sv = `'${sv}`;
  return /[",\n\r]/.test(sv) ? `"${sv.replace(/"/g, '""')}"` : sv;
}

export function toCsv<T>(
  rows: T[],
  cols: Array<{ header: string; cell: (r: T) => unknown }>,
): string {
  const head = cols.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(c.cell(r))).join(","));
  // CRLF: Excel on Windows is the most common destination for these.
  return [head, ...body].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- branded split

/**
 * Substring match, lowercased on both sides. Deliberately not word-boundary
 * matching: "bucketsofink" has to catch "bucketsofink.com" and "buckets of ink
 * tempe" alike, and a client's brand appears glued to other words far more often
 * than it appears as a clean standalone token.
 */
export function isBranded(query: string, brandTerms: string[]): boolean {
  if (brandTerms.length === 0) return false;
  const q = query.toLowerCase();
  return brandTerms.some((t) => t && q.includes(t.toLowerCase()));
}

export interface BrandSplit {
  branded: { clicks: number; impressions: number; terms: number };
  nonBranded: { clicks: number; impressions: number; terms: number };
  /** False when no brand terms are configured — the split is then meaningless. */
  configured: boolean;
}

export function splitBranded(
  rows: Array<{ term: string; clicks: number; impressions: number }>,
  brandTerms: string[],
): BrandSplit {
  const acc: BrandSplit = {
    branded: { clicks: 0, impressions: 0, terms: 0 },
    nonBranded: { clicks: 0, impressions: 0, terms: 0 },
    configured: brandTerms.length > 0,
  };
  for (const r of rows) {
    const b = isBranded(r.term, brandTerms) ? acc.branded : acc.nonBranded;
    b.clicks += r.clicks;
    b.impressions += r.impressions;
    b.terms += 1;
  }
  return acc;
}

// ---------------------------------------------------------------- agency

const FALLBACK_AGENCY: AgencyProfile = { name: "F1 Media Team", website: "f1mediateam.com" };

export async function loadAgency(): Promise<AgencyProfile> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("pulse_agency_profile")
    .select("name, website, email, phone, address_1, address_2")
    .eq("id", 1)
    .maybeSingle();
  return (data as AgencyProfile | null) ?? FALLBACK_AGENCY;
}

// ---------------------------------------------------------------- formatting

export function num(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function dur(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Percentage change, guarding the divide-by-zero that makes "∞%" appear. */
export function delta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Plural agreement, including the verb — "1 person was" vs "4 people were". */
export function plural(n: number, one: string, many: string): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}
