// Reading a SEOquake export.
//
// SEOquake is a browser extension with no API, and it is owned by Semrush — so
// it cannot be called from a server and its numbers are Semrush's numbers. What
// it does have is an Export CSV button on the SERP overlay, and that export is
// genuinely useful: one search produces a row per result, each carrying that
// domain's link and index figures. In other words, one export gives you the
// client AND every competitor ranking against them for that search.
//
// So this is an importer, not an integration. Somebody runs the search with the
// extension on, exports, and uploads the file. That is a manual step and there
// is no honest way around it, but it is a manual step that yields real data for
// a whole result page at once.
//
// The parser is deliberately forgiving about column names. SEOquake's headers
// change with which parameters are switched on, and a rigid parser would reject
// a perfectly good export because somebody enabled a different column.

export interface SeoquakeRow {
  url: string;
  domain: string;
  position: number | null;
  /** Referring domains pointing at this result's domain. */
  referringDomains: number | null;
  /** Pages of this domain in Google's index. */
  googleIndex: number | null;
  /** Whatever rank column the export carried, kept as reported. */
  rank: number | null;
  title: string | null;
}

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  // Exports carry "1,234", "1.2K", "n/a" and empty cells.
  const clean = v.replace(/[",\s]/g, "").toLowerCase();
  if (!clean || clean === "n/a" || clean === "-") return null;
  const mult = clean.endsWith("k") ? 1_000 : clean.endsWith("m") ? 1_000_000 : 1;
  const n = parseFloat(clean.replace(/[km]$/, ""));
  return Number.isFinite(n) ? n * mult : null;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Split a CSV line, honouring quoted fields containing commas. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Find a column by trying several names.
 *
 * SEOquake labels the same figure differently depending on version and which
 * parameters are enabled, so matching is by substring against a list rather
 * than by exact header.
 */
function columnIndex(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const i = lower.findIndex((h) => h.includes(cand));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseSeoquakeCsv(text: string): { rows: SeoquakeRow[]; error: string | null } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], error: "That file has no rows in it." };

  // SEOquake sometimes writes a title line above the header.
  const headerIdx = lines.findIndex((l) => /url|link|address/i.test(l) && l.includes(","));
  if (headerIdx === -1) {
    return { rows: [], error: "No URL column found — is this the SERP export rather than a different report?" };
  }

  const headers = splitLine(lines[headerIdx]);
  const iUrl = columnIndex(headers, ["url", "link", "address"]);
  const iPos = columnIndex(headers, ["pos", "rank in serp", "#"]);
  const iRef = columnIndex(headers, ["referring domain", "ref domain", "refdomains", "domains"]);
  const iIdx = columnIndex(headers, ["google index", "index", "pages"]);
  const iRank = columnIndex(headers, ["rank", "authority", "semrush"]);
  const iTitle = columnIndex(headers, ["title", "name"]);

  if (iUrl === -1) return { rows: [], error: "No URL column found in that export." };

  const rows: SeoquakeRow[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitLine(line);
    const url = (cells[iUrl] ?? "").trim().replace(/^"|"$/g, "");
    if (!/^https?:\/\//i.test(url)) continue;
    const domain = hostOf(url);
    if (!domain) continue;
    rows.push({
      url,
      domain,
      position: iPos >= 0 ? num(cells[iPos]) : null,
      referringDomains: iRef >= 0 ? num(cells[iRef]) : null,
      googleIndex: iIdx >= 0 ? num(cells[iIdx]) : null,
      rank: iRank >= 0 ? num(cells[iRank]) : null,
      title: iTitle >= 0 ? (cells[iTitle] ?? "").trim() || null : null,
    });
  }

  if (rows.length === 0) {
    return { rows: [], error: "Found the header but no result rows with a URL in them." };
  }
  return { rows, error: null };
}
