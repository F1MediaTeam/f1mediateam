// PageSpeed lab tests — a controlled measurement, next to the real one.
//
// The tag already measures Core Web Vitals on actual visitors, which is what
// Google ranks on. This measures something different and complementary: a
// single simulated load on a fixed machine and connection. Its value is that
// it is reproducible and always available — a page nobody visited this month
// has no field data at all, but it can still be tested — and it is the only
// place the performance score and the specific improvement list come from.
//
// The two must never be blended. Field data is what people experienced; lab
// data is what one simulated visit experienced. The panel labels which is
// which, per the Section 7 honesty rules.
//
// Free: PageSpeed Insights costs nothing. It needs PAGESPEED_API_KEY in
// practice — the anonymous quota is shared Google-wide and permanently
// exhausted — and the repo already has that variable, the client, and the
// threshold table, so this composes them rather than adding a second copy.

import { createServiceClient } from "@/lib/supabase/server";
import { runPageSpeed, type Strategy } from "@/lib/pagespeed";
import type { PulseSite } from "@/lib/pulse/sites";

/**
 * Pages tested per site per run.
 *
 * Lighthouse takes tens of seconds per URL, and the route ceiling is 300s. Six
 * URLs across two strategies would blow through it, so this tests the pages
 * that matter on mobile — which is what Google indexes and ranks on — and
 * leaves desktop to the on-demand check that already exists on the Tools page.
 */
const MAX_PAGES = 4;
const STRATEGY: Strategy = "mobile";

export interface PsiRunResult {
  siteId: string;
  domain: string;
  tested: number;
  failed: number;
  pages: Array<{ url: string; score: number | null; error?: string }>;
  skipped?: string;
}

/**
 * The pages worth testing: the homepage, plus whatever visitors actually go
 * to. Testing a page nobody visits produces a number nobody needs.
 */
async function keyPages(site: PulseSite): Promise<string[]> {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("pulse_pageviews")
    .select("path")
    .eq("site_id", site.id)
    .gte("ts", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .limit(5000);

  const counts = new Map<string, number>();
  for (const r of (rows as Array<{ path: string }>) ?? []) {
    if (!r.path || !r.path.startsWith("/")) continue;
    counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => path);
  // Homepage always, even with no traffic yet — it is the page every other
  // measurement is anchored to.
  const paths = ["/", ...ranked.filter((p) => p !== "/")].slice(0, MAX_PAGES);
  return paths.map((p) => `https://${site.domain}${p}`);
}

export async function runPsi(site: PulseSite): Promise<PsiRunResult> {
  const supabase = await createServiceClient();
  const base = { siteId: site.id, domain: site.domain, tested: 0, failed: 0, pages: [] as PsiRunResult["pages"] };

  if (!process.env.PAGESPEED_API_KEY) {
    // Deliberately not mocked. A fabricated speed score is the one number a
    // client might act on by spending money with a developer, and "we haven't
    // set the key up yet" is a better answer than a plausible invention.
    return { ...base, skipped: "PAGESPEED_API_KEY is not set — see the README for the free key." };
  }

  const urls = await keyPages(site);
  const pages: PsiRunResult["pages"] = [];
  let failed = 0;

  for (const url of urls) {
    try {
      const report = await runPageSpeed(url, STRATEGY);
      await supabase.from("pulse_psi_checks").insert({
        site_id: site.id,
        url,
        strategy: STRATEGY,
        lab_scores: {
          score: report.score,
          lab: report.lab,
          // Kept alongside for context, clearly separated — the panel reads
          // `lab` for the lab column and `field` for the comparison, never
          // averaging the two into one figure.
          field: report.field,
          fieldVerdict: report.fieldVerdict,
          opportunities: report.opportunities.slice(0, 8),
        },
      });
      pages.push({ url, score: report.score });
    } catch (err) {
      const message = err instanceof Error ? err.message : "PageSpeed failed.";
      failed += 1;
      // Recorded rather than dropped: a page that consistently fails the test
      // is itself a finding, and an empty panel with no explanation is not.
      await supabase.from("pulse_psi_checks").insert({
        site_id: site.id,
        url,
        strategy: STRATEGY,
        lab_scores: {},
        error: message.slice(0, 500),
      });
      pages.push({ url, score: null, error: message });
    }
  }

  return { ...base, tested: pages.length - failed, failed, pages };
}
