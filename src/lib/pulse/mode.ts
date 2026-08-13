// Free Mode — the $0 operating tier.
//
// Every surface in Pulse is either fed by something we can get for nothing, or
// by something a data vendor sells. This module is the single place that
// decides which, so no panel has to guess and no two panels can disagree.
//
// The rule that matters most: in Free Mode a paid surface shows what it would
// add and what it would cost. It does NOT show invented numbers. Mock data is
// for building and demonstrating, never for a launched platform — a plausible
// fake number in front of a client is worse than an honest gap, because the
// gap can be questioned and the fake cannot.

/** Where a number came from, per master Section 7. */
export type SourceClass = "measured" | "estimated" | "directional";

export interface PaidFeature {
  /** What the client gains, in plain words. */
  adds: string;
  /** Roughly what it costs per month, so the trade is legible. */
  cost: string;
  /** Why it cannot be done for free — stated so nobody re-litigates it. */
  why: string;
}

/**
 * Paid-data surfaces, with the reason each one needs a vendor.
 *
 * Every entry here was checked rather than assumed. The backlinks entry in
 * particular contradicts the build script, which expected Search Console's
 * links report to cover it for free — Google exposes that report only in the
 * web interface. The API surface is searchAnalytics, sitemaps, sites and
 * urlInspection, and none of them return inbound links.
 */
export const PAID_FEATURES: Record<string, PaidFeature> = {
  rank_tracking: {
    adds: "Daily position tracking for any keyword you choose, on desktop and mobile, with the exact ranking page and the SERP features around it.",
    cost: "about $20–40/month",
    why: "Positions for keywords you pick have to be read from live search results. Search Console only reports the queries people actually used to reach the site.",
  },
  serp_features: {
    adds: "Whether an AI Overview, map pack, or featured snippet appears for each keyword, and whether this site is cited in it.",
    cost: "included with rank tracking",
    why: "Requires reading the full search results page, which no free Google API returns.",
  },
  competitor_positions: {
    adds: "Where competitors rank on this client's keyword set, and Share of Voice between them.",
    cost: "no extra cost once rank tracking is on",
    why: "Extracted from the same search results as rank tracking, so it needs that first.",
  },
  backlinks: {
    adds: "Who links to this site, new and lost links, anchor text, and link quality scoring.",
    cost: "about $15–30/month",
    why: "Google shows a links report in the Search Console interface but provides no API for it, so it cannot be read automatically. A backlink index requires crawling the whole web.",
  },
  domain_intelligence: {
    adds: "Estimated traffic, what that traffic would cost in ads, total ranking keywords, and an authority score — for this site and its competitors.",
    cost: "about $10–20/month",
    why: "Modelled from a keyword database and a link index that only a data vendor operates.",
  },
  keyword_research: {
    adds: "Search volume, difficulty and cost-per-click for any keyword, plus keyword ideas and gap analysis against competitors.",
    cost: "about $10–20/month",
    why: "Search volume is licensed data. Google's own free tools give ranges only, and not by API.",
  },
  ai_visibility: {
    adds: "How often ChatGPT, Gemini, Claude and Perplexity mention this business when someone asks a buying question.",
    cost: "about $1–5/month",
    why: "Each check is a paid API call to the assistant being measured. This is the cheapest paid feature by a wide margin.",
  },
};

/** True when real SERP/backlink/keyword data can be bought and used. */
export function hasPaidData(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

/** True when at least one AI platform can actually be measured. */
export function hasAiPlatform(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.PERPLEXITY_API_KEY ||
      process.env.ANTHROPIC_API_KEY,
  );
}

/**
 * Mock mode is now opt-in only.
 *
 * It used to switch itself on whenever credentials were missing, which is
 * right while building and wrong once launched: a live platform would quietly
 * fill its most important tabs with invented numbers. Free Mode is the real
 * launch state, so absent credentials now mean "show the upgrade state",
 * and fake data requires someone to deliberately ask for it.
 */
export function mockEnabled(): boolean {
  return process.env.PULSE_MOCK === "true";
}

/** Free Mode is simply "running for real, without paid data". */
export function inFreeMode(): boolean {
  return !hasPaidData() && !mockEnabled();
}
