// Plain-English explanations behind the ⓘ on every metric tile.
//
// Written for a client reading their own dashboard, not for an SEO — say what
// the number is, then why it's worth caring about. The same text serves the
// admin side so nobody has to explain these on a call twice.

export interface MetricExplainer {
  /** what the number counts */
  what: string;
  /** why it matters / how to read a change in it */
  why: string;
  /** shown when lower numbers are better, so nobody reads a drop as bad news */
  lowerIsBetter?: boolean;
}

export const METRIC_GLOSSARY: Record<string, MetricExplainer> = {
  // --- Google Search Console ---
  clicks: {
    what: "How many times someone clicked through to your site from Google's natural (organic) search results. This does not include paid ads — it's traffic your site earned on its own.",
    why: "This is the closest thing to a bottom line for SEO. Rising clicks mean more people are finding and choosing your site without you paying for the visit, and that traffic keeps arriving whether or not you're spending on ads.",
  },
  impressions: {
    what: "How many times one of your pages showed up in someone's Google search results naturally — not as a paid ad — whether or not they clicked.",
    why: "This measures how visible you are. If impressions climb while clicks stay flat, you're being found for the right topics but the title and description aren't earning the click yet.",
  },
  // Position metrics stay deliberately terse.
  position: {
    what: "Your average ranking spot in Google's natural results, averaged across your whole site.",
    why: "Lower is better.",
    lowerIsBetter: true,
  },

  // --- Google Analytics 4 ---
  sessions: {
    what: "The number of visits to your site. One person browsing several pages in one sitting counts as a single session.",
    why: "This is your broadest traffic measure — it counts every source, not just search: social, direct, referrals and ads included. Useful for seeing overall trends and the effect of a campaign.",
  },
  active_users: {
    what: "The number of distinct people who visited, rather than the number of visits.",
    why: "Sitting next to Sessions, this tells you whether people come back. Sessions well above active users means the same visitors are returning repeatedly — a sign the content is worth coming back to.",
  },
  conversions: {
    what: "How many times a visitor completed an action that counts as a win — a form fill, a phone call, a purchase. Exactly what counts is whatever has been set up to be tracked in your analytics.",
    why: "The number that ties traffic to actual business results.",
  },

  // --- Bing Webmaster Tools ---
  bing_clicks: {
    what: "How many times someone clicked through to your site from Bing's natural search results. Like the Google figure, this excludes paid ads.",
    why: "Bing is a separate search engine with its own audience, so these visits are on top of what Google sends. Tracking it separately shows traffic you'd otherwise miss.",
  },
  bing_impressions: {
    what: "How many times one of your pages showed up in someone's Bing search results naturally — not as a paid ad — whether or not they clicked.",
    why: "This measures how visible you are on Bing. If impressions climb while clicks stay flat, you're being found for the right topics.",
  },
  bing_avg_click_position: {
    what: "Your average spot on Bing when someone clicked your result.",
    why: "Lower is better.",
    lowerIsBetter: true,
  },
  // Position metrics stay deliberately terse — see bing_avg_click_position.
  bing_avg_impression_position: {
    what: "Your average spot on Bing across every result you appeared in.",
    why: "Lower is better.",
    lowerIsBetter: true,
  },

  // --- Semrush insight widgets (keys match the widget ids) ---
  authority: {
    what: "Semrush's 0\u2013100 estimate of how strong your site looks to search engines, based mainly on how many quality sites link to you.",
    why: "This is a third-party score, not a Google number. It's most useful as a rough benchmark against competitors rather than a target to hit.",
  },
  positions: {
    what: "How many of your keywords sit in each ranking band \u2014 1\u20133, 4\u201310, 11\u201320 and so on.",
    why: "Shows where your rankings are concentrated. Terms sitting in 11\u201320 are the closest to reaching the first page.",
  },
  "top-keywords": {
    what: "The search terms bringing you the most organic traffic, with each one's share of that traffic.",
    why: "Tells you what your site is actually being found for, which isn't always what you'd expect it to be found for.",
  },
  "backlink-profile": {
    what: "The split between follow and nofollow links pointing at your site. Follow links pass ranking credit to you; nofollow links don't.",
    why: "A natural profile has a mix of both. The follow share is the portion carrying SEO value.",
  },
  "ref-domains": {
    what: "The websites linking to you most often, ranked by how many links each one sends.",
    why: "Links from many different sites generally count for more than many links from a single site.",
  },
  competitors: {
    what: "Other sites ranking for the same search terms as you, ranked by how many keywords you have in common.",
    why: "These are who you're up against in search results, which can differ from who you think of as your business competitors.",
  },
};

export function explainMetric(key: string): MetricExplainer | null {
  return METRIC_GLOSSARY[key] ?? null;
}
