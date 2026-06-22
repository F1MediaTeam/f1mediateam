// Assembles a client meeting deck into a Gamma "Generate" brief.
//
// Mirrors the Skabelund monthly-review structure (the same section order the
// PDF builder in presentation-pdf.tsx uses), but emits Markdown for Gamma in
// `preserve` mode with explicit `---` card breaks.
//
// Hard constraint: Gamma caps `inputTextBreaks` generations at 10 cards. The
// canonical layout below is already <=10 (Title + up to 8 body cards +
// Questions); buildGammaBrief enforces the cap defensively as a backstop.

const MAX_CARDS = 10;
const DEFAULT_THEME = "howlite"; // clean white/black — closest to the existing deck style

export interface DeckBriefInput {
  companyName: string;
  /** Pre-formatted, e.g. "6/22/2026". */
  meetingDate: string;
  themeId?: string;
  /** Narrative sections — raw multiline text; blank lines separate paragraphs. */
  sections: {
    social?: string;
    flyers?: string;
    insights?: string;
    backlinks?: string;
    pages?: string;
    ranking?: string;
    recommendation?: string;
    gscNote?: string;
  };
  /** GSC headline numbers (already display-formatted, e.g. "64.2K"). */
  gsc?: {
    imprPrev?: string;
    imprCur?: string;
    clicks?: string;
    avgPosition?: string;
    ctr?: string;
  };
  /** Optional keyword position table for the Webpage Ranking card. */
  rankingTable?: Array<{ keyword: string; url?: string; before?: string; after?: string }>;
  whatsNext?: string[];
  draftPages?: string[];
}

export interface GammaBrief {
  inputText: string;
  textMode: "preserve";
  format: "presentation";
  cardSplit: "inputTextBreaks";
  themeId: string;
  title: string;
}

function paragraphs(s?: string): string[] {
  return (s ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function bulletLines(s?: string): string[] {
  return (s ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•●*]\s*/, "").trim())
    .filter(Boolean);
}

/** One card = a heading plus body blocks, joined with blank lines. */
function card(heading: string, ...blocks: string[]): string {
  return [`# ${heading}`, ...blocks.filter(Boolean)].join("\n\n");
}

function gscStatLine(gsc: NonNullable<DeckBriefInput["gsc"]>): string {
  const parts: string[] = [];
  if (gsc.clicks) parts.push(`${gsc.clicks} clicks`);
  if (gsc.imprCur) parts.push(`${gsc.imprCur} impressions`);
  if (gsc.ctr) parts.push(`${gsc.ctr} CTR`);
  if (gsc.avgPosition) parts.push(`avg position ${gsc.avgPosition}`);
  return parts.length ? `**${parts.join(" · ")}**` : "";
}

function rankingTableMd(rows: NonNullable<DeckBriefInput["rankingTable"]>): string {
  if (!rows.length) return "";
  const head = "| Keyword | Page | Before | After |\n|---|---|---|---|";
  const body = rows
    .map((r) => `| ${r.keyword} | ${r.url ?? ""} | ${r.before ?? "—"} | ${r.after ?? "—"} |`)
    .join("\n");
  return `${head}\n${body}`;
}

export function buildGammaBrief(input: DeckBriefInput): GammaBrief {
  const s = input.sections;
  const cards: string[] = [];

  // 1. Title (always)
  cards.push(card(input.companyName, `${input.meetingDate} Meeting`));

  // 2. Social Presence & Optimization (flyers folded in to stay within 10)
  const socialBlocks = paragraphs(s.social);
  const flyerBullets = bulletLines(s.flyers);
  if (flyerBullets.length > 1) {
    // Flyers given as a list — render as one tight bullet block.
    socialBlocks.push(flyerBullets.map((b) => `- ${b}`).join("\n"));
  } else {
    socialBlocks.push(...paragraphs(s.flyers));
  }
  if (socialBlocks.length) cards.push(card("Social Presence & Optimization", ...socialBlocks));

  // 3. Insights & Content Optimization Process
  if (paragraphs(s.insights).length) {
    cards.push(card("Insights & Content Optimization Process", ...paragraphs(s.insights)));
  }

  // 4. Photo & Backlink Optimization Process
  if (paragraphs(s.backlinks).length) {
    cards.push(card("Photo & Backlink Optimization Process", ...paragraphs(s.backlinks)));
  }

  // 5. Pages & Posting Optimization Process
  if (paragraphs(s.pages).length) {
    cards.push(card("Pages & Posting Optimization Process", ...paragraphs(s.pages)));
  }

  // 6. GSC — Last 28 Days (stats + narrative)
  const gsc = input.gsc ?? {};
  const gscBlocks: string[] = [];
  if (gsc.imprPrev && gsc.imprCur) {
    gscBlocks.push(`Impressions grew from ${gsc.imprPrev} to ${gsc.imprCur} over the period.`);
  }
  gscBlocks.push(...paragraphs(s.gscNote));
  const statLine = gscStatLine(gsc);
  if (statLine) gscBlocks.push(statLine);
  if (gscBlocks.length) cards.push(card("GSC — Last 28 Days", ...gscBlocks));

  // 7. Webpage Ranking (narrative + optional table)
  const rankingBlocks = [...paragraphs(s.ranking)];
  const table = rankingTableMd(input.rankingTable ?? []);
  if (table) rankingBlocks.push(table);
  if (rankingBlocks.length) cards.push(card("Webpage Ranking", ...rankingBlocks));

  // 8. What's Next (bullets + recommendation folded in)
  const nextBlocks: string[] = [];
  const next = (input.whatsNext ?? []).filter(Boolean);
  if (next.length) nextBlocks.push(next.map((b) => `- ${b}`).join("\n"));
  nextBlocks.push(...paragraphs(s.recommendation));
  if (nextBlocks.length) cards.push(card("What's Next", ...nextBlocks));

  // 9. Draft Pages
  const drafts = (input.draftPages ?? []).filter(Boolean);
  if (drafts.length) cards.push(card("Draft Pages", drafts.map((d) => `- ${d}`).join("\n")));

  // 10. Questions (always last)
  const closing = card("Since Our Last Meeting — Questions?", "- Do you have any questions for me?");

  // Enforce the 10-card cap: keep Title first + Questions last, trim body cards
  // from the end (lowest priority) if we somehow overflow.
  let body = cards.slice(1);
  if (1 + body.length + 1 > MAX_CARDS) {
    body = body.slice(0, MAX_CARDS - 2);
  }
  const ordered = [cards[0], ...body, closing];

  return {
    inputText: ordered.join("\n\n---\n\n"),
    textMode: "preserve",
    format: "presentation",
    cardSplit: "inputTextBreaks",
    themeId: input.themeId || DEFAULT_THEME,
    title: `${input.companyName} — ${input.meetingDate} Meeting`,
  };
}
