// Authority scoring — Garrett's engine, fed measured inputs.
//
// The maths below is his, unchanged, including the constants: link power and
// traffic weighted 0.6/0.4, a gamma of 1.6, and the same penalty flags. His
// file said it plainly — "wire a backlink API into the same JSON shape to
// replace estimates with measured data; the math is unchanged" — so that is
// exactly what this does.
//
// What changed is where the inputs come from. The original asked Claude to
// research a domain and estimate its traffic and backlinks, which costs money
// per run and returns a guess. Two of the four inputs can be measured instead:
//
//   organic traffic     Search Console clicks, extrapolated to a month
//   donor authority     Open PageRank, a free API over the Common Crawl graph
//   referring domains   no free source — see below
//   dofollow ratio      no free source, so the engine's own 0.75 default holds
//
// Referring domains is the honest gap. Search Console's Links report has the
// number and Google publishes no API for it, so it is entered by hand from the
// monthly CSV export. Until somebody does that, the score is computed from
// traffic alone and says so, rather than quietly inventing a link profile.

export interface AuthorityInputs {
  est_referring_domains: number;
  est_avg_donor_authority: number;
  est_dofollow_ratio: number;
  est_monthly_organic_traffic: number;
  spam_signals?: string[];
}

export interface AuthorityFlag {
  name: string;
  pct: number;
}

export interface AuthorityResult {
  score: number;
  lp01: number;
  tr01: number;
  lpRaw: number;
  trRaw: number;
  mult: number;
  flags: AuthorityFlag[];
}

const LP_CEILING = 16.0;
const TR_CEILING = 8.5;
const W_LINK = 0.6;
const W_TRAFFIC = 0.4;
const GAMMA = 1.6;
const FLOOR = 0.2;

/** Garrett's engine, ported without changing a constant. */
export function scoreFromInputs(d: AuthorityInputs): AuthorityResult {
  const n = Math.max(0, d.est_referring_domains || 0);
  const auth = Math.min(100, Math.max(1, d.est_avg_donor_authority || 1));
  const df = Math.min(1, Math.max(0, d.est_dofollow_ratio ?? 0.75));
  const traffic = Math.max(0, d.est_monthly_organic_traffic || 0);

  const contribution = n * df * Math.pow(auth / 100, 2) * 100;
  const lpRaw = Math.log(1 + contribution);
  const trRaw = Math.log10(1 + traffic);
  const lp01 = Math.min(lpRaw / LP_CEILING, 1);
  const tr01 = Math.min(trRaw / TR_CEILING, 1);
  const base = W_LINK * lp01 + W_TRAFFIC * tr01;

  const flags: AuthorityFlag[] = [];
  if (n >= 20 && traffic < 50) flags.push({ name: "Links present, no organic traffic", pct: 35 });
  if (df > 0.9)
    flags.push({
      name: `Dofollow ratio ${Math.round(df * 100)}%`,
      pct: Math.round(Math.min(0.2, (df - 0.9) * 2) * 100),
    });
  if (lpRaw > 4 && traffic < 100) flags.push({ name: "Link/traffic imbalance", pct: 25 });
  (d.spam_signals ?? []).forEach((s) => flags.push({ name: s, pct: 10 }));

  const mult = Math.max(FLOOR, 1 - flags.reduce((s, f) => s + f.pct / 100, 0));
  const score = 100 * Math.pow(base * mult, GAMMA);
  return { score, lp01, tr01, lpRaw, trRaw, mult, flags };
}

export interface Grade {
  label: string;
  color: string;
  note: string;
}

export function gradeFor(s: number): Grade {
  if (s >= 70)
    return { label: "Elite", color: "#0F6E56", note: "Ranks for competitive head terms; links from this domain carry serious weight." };
  if (s >= 50)
    return { label: "Strong", color: "#0F6E56", note: "Can win competitive queries in its niche; a valuable link source." };
  if (s >= 30)
    return { label: "Established", color: "#534AB7", note: "Ranks reliably for mid-difficulty terms; solid link prospect." };
  if (s >= 15)
    return { label: "Emerging", color: "#854F0B", note: "Wins long-tail queries; needs authority to compete on head terms." };
  return { label: "Weak", color: "#A32D2D", note: "Minimal ranking power; content quality alone will not overcome the authority gap." };
}

/** Where each input came from, so a client report can be honest about it. */
export type InputSource = "measured" | "estimated" | "default" | "missing";

export interface AuthorityReport {
  domain: string;
  result: AuthorityResult;
  grade: Grade;
  inputs: AuthorityInputs;
  sources: Partial<Record<keyof AuthorityInputs, InputSource>>;
  notes: string[];
}

/**
 * Domain strength from Open PageRank.
 *
 * Free, 30,000 domains a month, no card. Built on the Common Crawl link graph,
 * so it is a real measurement of a real link graph rather than a vendor's
 * proprietary invention — and unlike Semrush's Authority Score, the method is
 * published. Returns 0-10, which the engine wants as 0-100.
 */
export async function openPageRank(domain: string): Promise<number | null> {
  const key = process.env.OPENPAGERANK_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://openpagerank.com/api/v1.0/getPageRank?domains%5B%5D=${encodeURIComponent(domain)}`,
      { headers: { "API-OPR": key }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      response?: Array<{ page_rank_decimal?: number; status_code?: number }>;
    };
    const row = body.response?.[0];
    if (!row || row.status_code !== 200) return null;
    const decimal = Number(row.page_rank_decimal);
    return Number.isFinite(decimal) ? decimal * 10 : null;
  } catch {
    return null;
  }
}

/**
 * Build an authority report for one site from what we can actually measure.
 *
 * Traffic is Search Console clicks over the last 28 days scaled to a month —
 * real clicks, not an estimate of them. Donor authority comes from Open
 * PageRank when a key is configured. Referring domains has no free source and
 * is read from pulse_domain_snapshots if a number was ever recorded there;
 * otherwise it stays zero and the report says the score is traffic-only.
 */
export async function authorityReport(siteId: string): Promise<AuthorityReport | null> {
  const { createServiceClient } = await import("@/lib/supabase/server");
  const supabase = await createServiceClient();

  const { data: site } = await supabase
    .from("pulse_sites")
    .select("id, domain")
    .eq("id", siteId)
    .maybeSingle();
  if (!site) return null;
  const domain = (site as { domain: string }).domain;

  const from = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const { data: terms } = await supabase
    .from("pulse_search_terms")
    .select("clicks")
    .eq("site_id", siteId)
    .eq("dimension", "page")
    .gte("period_start", from)
    .limit(30_000);

  const clicks28 = ((terms as Array<{ clicks: number }>) ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
  const monthlyTraffic = Math.round((clicks28 / 28) * 30);

  // Referring domains, if any snapshot ever captured one. Snapshots hang off
  // pulse_domains rather than the site, because the same domain can be both a
  // client and somebody else's competitor.
  const { data: domRow } = await supabase
    .from("pulse_domains")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();

  let referring = 0;
  if (domRow) {
    const { data: snap } = await supabase
      .from("pulse_domain_snapshots")
      .select("ref_domains, captured_at")
      .eq("domain_id", (domRow as { id: string }).id)
      .not("ref_domains", "is", null)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    referring = Number((snap as { ref_domains: number } | null)?.ref_domains ?? 0) || 0;
  }

  const opr = await openPageRank(domain);

  const notes: string[] = [];
  const sources: Partial<Record<keyof AuthorityInputs, InputSource>> = {
    est_monthly_organic_traffic: clicks28 > 0 ? "measured" : "missing",
    est_avg_donor_authority: opr !== null ? "measured" : "default",
    est_referring_domains: referring > 0 ? "measured" : "missing",
    est_dofollow_ratio: "default",
  };

  if (clicks28 === 0) notes.push("No Search Console clicks in the last 28 days, so the traffic half of the score is zero.");
  if (opr === null) notes.push("Open PageRank is not configured, so donor authority falls back to a neutral 50. Add a free OPENPAGERANK_API_KEY to measure it.");
  if (referring === 0) notes.push("No referring-domain count recorded. Google publishes no API for its Links report, so this comes from the monthly Search Console CSV export — until then the score reflects traffic only.");

  const inputs: AuthorityInputs = {
    est_referring_domains: referring,
    est_avg_donor_authority: opr ?? 50,
    est_dofollow_ratio: 0.75,
    est_monthly_organic_traffic: monthlyTraffic,
  };

  const result = scoreFromInputs(inputs);
  return { domain, result, grade: gradeFor(result.score), inputs, sources, notes };
}
