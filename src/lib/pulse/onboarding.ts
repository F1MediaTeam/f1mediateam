// Turning a business profile into a starting point.
//
// Section 8's requirement is that signing a client in an unrelated industry
// needs zero code changes. That holds here because nothing below knows what a
// print shop or a law firm is — it only knows that a business sells services,
// in places, and that people search for services in places.
//
// Everything is generated from patterns rather than an API. That is not a
// compromise forced by the budget: a starter list exists to be edited, and a
// deterministic list is one you can reason about and correct. It also means
// onboarding a client costs nothing and works with no credentials at all.
//
// The output is explicitly a proposal. Every generated item is marked EDIT ME
// in the UI, because a keyword list nobody reviewed is worse than no list —
// it looks like a decision when it is a guess.

export interface BusinessProfile {
  /** What they do, in a few plain words. */
  industry: string | null;
  /** The specific things they sell. */
  services: string[];
  /** Where. Empty means national — the documented Section 8 default. */
  serviceAreas: string[];
  platform: string | null;
  notes: string | null;
}

export const PLATFORM_PRESETS = [
  "WordPress",
  "Shopify",
  "Wix",
  "Squarespace",
  "Webflow",
  "DecoNetwork",
  "Custom / other",
] as const;

/**
 * Where the snippet goes, per platform.
 *
 * The universal rule leads every time because it is true everywhere; the
 * per-platform note only saves someone hunting for the right settings screen.
 * A platform we have never heard of still gets the universal rule, which is
 * the whole point of leading with it.
 */
export const INSTALL_GUIDES: Record<string, string> = {
  WordPress:
    "Appearance → Theme File Editor → footer.php, immediately before </body>. If a caching or optimisation plugin is active, clear its cache afterwards or the old page keeps being served.",
  Shopify:
    "Online Store → Themes → … → Edit code → layout/theme.liquid, immediately before </body>.",
  Wix: "Settings → Custom Code → Add Custom Code, set to load on all pages, placed in Body – end.",
  Squarespace:
    "Settings → Advanced → Code Injection → Footer.",
  Webflow:
    "Project Settings → Custom Code → Footer Code, then publish — custom code only goes live on publish.",
  DecoNetwork:
    "Website → Settings → Custom Scripts (or the theme footer). Note the storefront may run on a different hostname from the main site; if beacons are rejected, the Live feed will name the host to register.",
  "Custom / other":
    "Paste it into the site's shared footer template, immediately before the closing </body> tag.",
};

/** The line the client should add to their own privacy policy. */
export const PRIVACY_SENTENCE =
  "This site uses privacy-friendly, first-party, cookieless analytics provided by F1 Media Team. No personal information is collected and no tracking cookies are used.";

function clean(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map(clean)
    .filter((s) => s.length > 2 && s.length <= 90)
    .filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}

/**
 * Starter keywords: services crossed with places, plus the phrasings people
 * actually use when they are ready to buy.
 *
 * With no service area given the crosses are dropped rather than faked with a
 * placeholder — a national business searching "service near me" is a different
 * query from "service in Tempe", and inventing a city would be worse than
 * offering fewer keywords.
 */
export function generateKeywords(profile: BusinessProfile, limit = 15): string[] {
  const services = unique(profile.services);
  const areas = unique(profile.serviceAreas);
  if (services.length === 0) return [];

  const out: string[] = [];

  // Service + place is the highest-intent shape there is, so it goes first.
  for (const area of areas) {
    for (const service of services) {
      out.push(`${service} ${area}`);
    }
  }

  // The bare service terms — broader, slower, and worth tracking anyway.
  for (const service of services) out.push(service);

  // How people phrase it when they are choosing rather than researching.
  const qualifiers = areas.length > 0
    ? ["near me", "best", "custom"]
    : ["online", "wholesale", "custom", "best"];
  for (const service of services.slice(0, 4)) {
    for (const q of qualifiers.slice(0, 2)) {
      // Skip a qualifier the service already contains, or a wholesaler whose
      // service is "wholesale heat transfers" gets offered "wholesale
      // wholesale heat transfers" — which nobody has ever typed.
      if (service.includes(q)) continue;
      out.push(q === "near me" ? `${service} ${q}` : `${q} ${service}`);
    }
  }

  return unique(out).slice(0, limit);
}

/**
 * Buyer questions — what someone would actually type or ask an assistant when
 * they are looking for this business.
 *
 * Used as the AI-visibility prompt set. Phrased as questions rather than
 * keywords because that is how people talk to assistants, and a prompt set
 * written like a keyword list measures the wrong thing.
 */
export function generatePrompts(profile: BusinessProfile, limit = 15): string[] {
  const services = unique(profile.services);
  const areas = unique(profile.serviceAreas);
  const industry = profile.industry ? clean(profile.industry) : null;
  if (services.length === 0 && !industry) return [];

  const subjects = services.length > 0 ? services : [industry!];
  const place = areas[0] ?? null;
  const out: string[] = [];

  // "who is the best <service>" reads wrong for anything that isn't a trade —
  // "who is the best dental implants" — so the subject is always attached to a
  // noun. This phrasing works whether the service is a job, a product, or a
  // treatment, which is what makes it safe for a client in any industry.
  for (const s of subjects) {
    if (place) {
      out.push(`who offers the best ${s} in ${place}`);
      out.push(`where can i get ${s} in ${place}`);
      out.push(`how much does ${s} cost in ${place}`);
    } else {
      out.push(`who offers the best ${s}`);
      out.push(`where can i get ${s} online`);
      out.push(`how much does ${s} cost`);
    }
  }

  if (industry) {
    out.push(place ? `recommend a ${industry} company in ${place}` : `recommend a ${industry} company`);
    out.push(`what should i look for when choosing a ${industry} company`);
  }

  return unique(out).slice(0, limit);
}

/**
 * Location codes for rank tracking, derived from the service areas.
 *
 * National when none is given — the Section 8 default, stated here rather than
 * left implicit so the reason a client is tracked nationally is legible.
 */
export function locationLabels(profile: BusinessProfile): string[] {
  const areas = unique(profile.serviceAreas);
  return areas.length > 0 ? areas : ["United States (national)"];
}

/** The install quick-guide for a platform, falling back to the universal rule. */
export function installGuide(platform: string | null): string {
  if (!platform) return INSTALL_GUIDES["Custom / other"];
  return INSTALL_GUIDES[platform] ?? INSTALL_GUIDES["Custom / other"];
}
