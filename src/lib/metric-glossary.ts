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
  // Avg. Position deliberately has no entry: it reads as self-explanatory, so
  // the tile shows a "lower is better" hint instead of an ⓘ. InfoTip renders
  // nothing for a metric that isn't listed here, so leaving it out is what
  // removes the icon.

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
};

export function explainMetric(key: string): MetricExplainer | null {
  return METRIC_GLOSSARY[key] ?? null;
}
