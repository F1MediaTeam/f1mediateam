// Plain-English definitions for everything F1 Pulse measures.
//
// The test this has to pass: a business owner who has never heard the word
// "canonical" reads an entry and understands both what the number is and
// whether they should care. No acronym appears without being spelled out, and
// no definition leans on another piece of jargon to explain itself.
//
// This extends the portal's existing metric glossary rather than replacing it
// — that one covers Search Console and Analytics, this one covers what Pulse
// adds on top.

export interface GlossaryEntry {
  term: string;
  /** What the number literally counts. */
  what: string;
  /** Why it is worth caring about, and how to read a change in it. */
  why: string;
  /** Where the figure comes from — the Section 7 source class. */
  source: "measured" | "estimated" | "directional" | "computed";
  /** For F1's own composite scores, the formula in one line. */
  formula?: string;
}

export const GLOSSARY_GROUPS: Array<{ group: string; blurb: string; entries: GlossaryEntry[] }> = [
  {
    group: "Visitors",
    blurb: "Measured by the F1 tag on the client's own site — nobody else's data, and no cookies.",
    entries: [
      {
        term: "Visitors",
        what: "How many different people came to the site. Someone who visits three times in a day counts once.",
        why: "The plainest measure of reach. It counts people rather than page loads, so a rise means more humans, not busier ones.",
        source: "measured",
      },
      {
        term: "Pageviews",
        what: "How many pages were loaded in total, including the same person loading several.",
        why: "Read alongside visitors: many pageviews per visitor means people are exploring, few means they arrive and leave.",
        source: "measured",
      },
      {
        term: "Sessions",
        what: "One continuous visit. Leaving and coming back hours later starts a new one.",
        why: "The unit closest to 'a trip to the shop'. Useful when comparing how often people return.",
        source: "measured",
      },
      {
        term: "Actions (conversions)",
        what: "Someone tapped a phone number, clicked an email address, followed a link off the site, or submitted a form.",
        why: "The closest thing to a lead that a website can see by itself. It counts that something happened and where — never who, and never what they typed.",
        source: "measured",
      },
      {
        term: "Core Web Vitals",
        what: "How fast and stable the site felt to real visitors: how quickly the main content appeared, how quickly it responded, and how much it jumped around while loading.",
        why: "Google uses these in ranking, and people leave slow pages. Measured on actual visits rather than a test, so it reflects real phones on real connections.",
        source: "measured",
      },
    ],
  },
  {
    group: "Search",
    blurb: "Google's own figures for this site, from Search Console. About two days behind.",
    entries: [
      {
        term: "Clicks",
        what: "How many times someone clicked through from Google's normal (unpaid) results.",
        why: "Traffic the site earned rather than bought. It keeps arriving whether or not there is an ad budget.",
        source: "measured",
      },
      {
        term: "Impressions",
        what: "How many times a page appeared in someone's search results, whether or not they clicked.",
        why: "Visibility. Impressions climbing while clicks stay flat means people are seeing the site and choosing something else — usually a title and description problem.",
        source: "measured",
      },
      {
        term: "Position",
        what: "The average place the site appeared in search results, across everyone who saw it. Lower is better — 1 is the top.",
        why: "Averaged across every impression, so a page shown once in another state and a hundred times locally reports mostly the local result.",
        source: "measured",
      },
      {
        term: "Nearly ranking (strike distance)",
        what: "Searches where the site already appears around positions 4 to 20, with enough people searching to matter.",
        why: "Google already considers the page relevant. Closing the last few places is usually a title and a paragraph rather than a new page, which makes these the cheapest wins available.",
        source: "computed",
      },
      {
        term: "Pages competing with each other",
        what: "One search pulling in two or more pages from the same site.",
        why: "When several pages target one search they split the signals between them and none ranks as well as a single strong page would.",
        source: "computed",
      },
    ],
  },
  {
    group: "Being found",
    blurb: "Whether Google has accepted the site's pages at all. A page Google has not accepted cannot rank for anything.",
    entries: [
      {
        term: "In Google",
        what: "Pages Google has accepted into its index, out of the pages the site lists in its own sitemap.",
        why: "Ranking comes after indexing. A page Google declined is invisible no matter how good it is.",
        source: "measured",
      },
      {
        term: "Google looked and declined",
        what: "Google visited the page and chose not to list it.",
        why: "Usually a quality or duplication judgement rather than a technical fault. Thin, near-identical, or low-value pages end up here.",
        source: "measured",
      },
      {
        term: "Google hasn't visited yet",
        what: "Google knows the page exists but has not crawled it.",
        why: "Often just time on a new page. Persistent cases usually mean nothing links to it.",
        source: "measured",
      },
      {
        term: "Google chose a different version",
        what: "Google decided another page represents this content and listed that one instead.",
        why: "Not an error. It means two pages look like the same thing to Google, and it picked one.",
        source: "measured",
      },
      {
        term: "In Google, but nobody sees them",
        what: "Pages Google accepted that have had no appearances in search for 90 days.",
        why: "Not broken — simply answering nothing anyone searches for. Candidates for rewriting, merging, or removing.",
        source: "computed",
      },
    ],
  },
  {
    group: "Site health",
    blurb: "Found by our own crawler visiting the site the way a search engine would.",
    entries: [
      {
        term: "Site Health",
        what: "A single 0–100 score for how well the site is built, from the problems found while crawling it.",
        why: "One number to watch over time. A falling score means problems are being added faster than they are fixed.",
        source: "computed",
        formula:
          "Errors weigh more than warnings, warnings more than notices, and the total is scaled by how many pages were crawled so a big site is not punished for being big.",
      },
      {
        term: "AI crawler access",
        what: "Whether the site allows or blocks each search and AI crawler — Google, Bing, ChatGPT, Claude, Perplexity and others.",
        why: "Blocking an AI crawler removes the site from that assistant's answers. Sometimes deliberate, often accidental, and almost never noticed without checking.",
        source: "measured",
      },
      {
        term: "Lab test vs real visitors",
        what: "Two different speed measurements. The lab test is one simulated visit on a fixed machine; real visitors is what people actually experienced.",
        why: "They answer different questions and must never be averaged together. A quiet page has no real-visitor data at all, but can still be lab tested.",
        source: "measured",
      },
    ],
  },
  {
    group: "Competitors",
    blurb: "Measured by visiting competitors' public websites politely — never their private analytics.",
    entries: [
      {
        term: "Pages",
        what: "How many addresses a competitor lists in their own sitemap.",
        why: "A rough measure of size, and a useful one to watch: a page count climbing month after month is a competitor investing in content.",
        source: "measured",
      },
      {
        term: "Published (30 days)",
        what: "How many pages a competitor appears to have published in the last month.",
        why: "Shows 'n/a' when a site stamps every page with the same date on every rebuild, which some platforms do — a real number is better left blank than invented.",
        source: "measured",
      },
      {
        term: "Estimated traffic",
        what: "A model's guess at how many visitors a site gets, based on where it ranks.",
        why: "Never available for free, and never exact. It is a comparison tool between domains, not a count of real people.",
        source: "estimated",
      },
    ],
  },
];

/** Flat list, for search and for the report appendix. */
export const ALL_GLOSSARY: GlossaryEntry[] = GLOSSARY_GROUPS.flatMap((g) => g.entries);

export const SOURCE_LABEL: Record<GlossaryEntry["source"], { label: string; blurb: string }> = {
  measured: {
    label: "Measured",
    blurb: "Counted directly — by the F1 tag, by our crawler, or by Google about a site we are authorised on.",
  },
  computed: {
    label: "Computed",
    blurb: "Worked out from measured numbers using a rule written down in plain English, not a black box.",
  },
  estimated: {
    label: "Estimated",
    blurb: "Modelled by a data provider. Useful for comparing domains, never exact.",
  },
  directional: {
    label: "Directional",
    blurb: "Sampled rather than counted, so it moves between runs. Read the trend, not the number.",
  },
};
