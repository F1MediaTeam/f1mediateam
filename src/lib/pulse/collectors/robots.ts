// robots.txt parsing, and the AI-bot access matrix.
//
// Two jobs from one fetch. We have to read robots.txt anyway to crawl politely,
// and the same file answers the question clients increasingly ask: can the AI
// crawlers see my site?
//
// Group matching follows the spec's actual rule, which is easy to get wrong:
// a bot obeys the group whose user-agent matches it most specifically, and
// falls back to `*` only when no named group matches at all. A site that
// blocks GPTBot but allows `*` must not read as "allowed" because the wildcard
// group was found first.

export interface RobotsGroup {
  agents: string[];
  allow: string[];
  disallow: string[];
}

export interface Robots {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** false when robots.txt could not be fetched — everything is allowed then */
  present: boolean;
}

/** The bots clients ask about: search, then the AI crawlers and assistants. */
export const TRACKED_BOTS = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
] as const;

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive user-agent lines share one group of rules.
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !acceptingAgents) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
        acceptingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      acceptingAgents = false;
      if (!current) {
        current = { agents: ["*"], allow: [], disallow: [] };
        groups.push(current);
      }
      if (value) current[field === "allow" ? "allow" : "disallow"].push(value);
      // An empty Disallow means "nothing is disallowed" — ignoring the line is
      // correct, since an empty pattern would otherwise match every path.
    } else if (field === "sitemap") {
      sitemaps.push(value);
    }
  }

  return { groups, sitemaps, present: true };
}

export const NO_ROBOTS: Robots = { groups: [], sitemaps: [], present: false };

/** The group governing this agent: most specific named match, else `*`. */
function groupFor(robots: Robots, agent: string): RobotsGroup | null {
  const needle = agent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLen = -1;

  for (const g of robots.groups) {
    for (const a of g.agents) {
      if (a === "*") continue;
      if (needle.includes(a) && a.length > bestLen) {
        best = g;
        bestLen = a.length;
      }
    }
  }
  if (best) return best;
  return robots.groups.find((g) => g.agents.includes("*")) ?? null;
}

/** robots.txt wildcard matching: `*` any run, `$` anchors the end. */
function patternMatches(pattern: string, path: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$$/, "$");
  try {
    return new RegExp("^" + escaped).test(path);
  } catch {
    return false;
  }
}

export function isAllowed(robots: Robots, agent: string, path: string): boolean {
  if (!robots.present) return true;
  const group = groupFor(robots, agent);
  if (!group) return true;

  // Longest match wins, and Allow beats Disallow at equal length — the tie-break
  // that lets a site disallow a directory but allow one file inside it.
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const p of group.allow) if (patternMatches(p, path) && p.length > bestAllow) bestAllow = p.length;
  for (const p of group.disallow) if (patternMatches(p, path) && p.length > bestDisallow) bestDisallow = p.length;

  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

export interface BotVerdict {
  bot: string;
  allowed: boolean;
  blockedSamplePaths: string[];
}

/**
 * Can each tracked bot reach the site?
 *
 * "Allowed" means the homepage is reachable. A bot blocked only from /cart/ is
 * still allowed — reporting it as blocked would cry wolf on every ecommerce
 * site. The sample paths show what it can't reach.
 */
export function botMatrix(robots: Robots, samplePaths: string[]): BotVerdict[] {
  const paths = samplePaths.length > 0 ? samplePaths : ["/"];
  return TRACKED_BOTS.map((bot) => {
    const blocked = paths.filter((p) => !isAllowed(robots, bot, p));
    return {
      bot,
      allowed: isAllowed(robots, bot, "/"),
      blockedSamplePaths: blocked.slice(0, 8),
    };
  });
}
