// POST /api/pulse/refresh/{collector}?siteId=…
//
// One entry point for every collector, hit by both the dashboard's Refresh
// buttons and the schedules. Two ways in:
//   - an admin session (the buttons)
//   - `Authorization: Bearer <CRON_SECRET>` (pg_cron via pg_net, and Vercel cron)
//
// Every invocation is written to pulse_runs whether it succeeds or fails, so
// "when did this last actually run" is answerable without reading logs.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/server";
import { staffRoleOf } from "@/lib/permissions";
import { getSite, listSites, type PulseSite } from "@/lib/pulse/sites";
import { runHeartbeat } from "@/lib/pulse/heartbeat";
import { runRanks } from "@/lib/pulse/collectors/ranks";
import { runBacklinks } from "@/lib/pulse/collectors/backlinks";
import { startCrawl, tickCrawl } from "@/lib/pulse/collectors/crawl";
import { runSearch } from "@/lib/pulse/collectors/search";
import { runBackfill } from "@/lib/pulse/collectors/backfill";
import { runOpportunities } from "@/lib/pulse/collectors/opportunities";
import { runPsi } from "@/lib/pulse/collectors/psi";
import { runLocal } from "@/lib/pulse/collectors/local";
import { runCompetitorsForSite } from "@/lib/pulse/collectors/competitors";
import { runIndexInspector } from "@/lib/pulse/collectors/index-inspector";
import { isMock } from "@/lib/pulse/providers/serp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COLLECTORS = [
  "heartbeat",
  "ranks",
  "backlinks",
  "crawl",
  "search",
  "backfill",
  "opportunities",
  "psi",
  "local",
  "competitors",
  "index",
] as const;
type Collector = (typeof COLLECTORS)[number];

async function authorize(request: NextRequest): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return { ok: true };

  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, reason: "Admins only." };

  // Contractors are view-only by decision — they can read every panel but not
  // spend API budget or hit client sites.
  const profile = await data.getProfile(session.user_id);
  if (staffRoleOf(profile) === "contractor") {
    return { ok: false, reason: "Contractors can view but not refresh." };
  }
  return { ok: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collector: string }> },
) {
  const { collector } = await params;
  if (!COLLECTORS.includes(collector as Collector)) {
    return Response.json({ error: `Unknown collector "${collector}".` }, { status: 404 });
  }

  const auth = await authorize(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 403 });

  const siteId = request.nextUrl.searchParams.get("siteId");
  const supabase = await createServiceClient();

  // No siteId means every site — that is how the schedule calls it.
  let sites: PulseSite[];
  if (siteId) {
    const one = await getSite(siteId);
    if (!one) return Response.json({ error: "Unknown site." }, { status: 404 });
    sites = [one];
  } else {
    sites = await listSites(null);
  }

  const { data: run } = await supabase
    .from("pulse_runs")
    .insert({ collector, site_id: siteId ?? null, mocked: false })
    .select("id")
    .single();

  try {
    let results: unknown[];

    if (collector === "heartbeat") {
      results = await Promise.all(sites.map((s) => runHeartbeat(s)));
    } else if (collector === "ranks") {
      // Sequential: each site is a burst of provider calls, and running four
      // sites at once is how a rate limit gets hit.
      results = [];
      for (const s of sites) results.push(await runRanks(s));
    } else if (collector === "backlinks") {
      results = [];
      for (const s of sites) results.push(await runBacklinks(s));
    } else if (collector === "backfill") {
      // 16 months × 2 dimensions of Google calls per site — sequential, or the
      // per-project quota is gone in one burst.
      results = [];
      for (const s of sites) results.push(await runBackfill(s));
    } else if (collector === "search") {
      results = [];
      for (const s of sites) results.push(await runSearch(s));
    } else if (collector === "psi") {
      // Lighthouse is slow — tens of seconds per URL — so sites run one after
      // another rather than racing each other into the route's time ceiling.
      results = [];
      for (const s of sites) results.push(await runPsi(s));
    } else if (collector === "index") {
      // Resumable like the crawler: each call works a slice of the sitemap and
      // reports what is left, because a large site cannot be inspected inside
      // one day's Search Console quota, let alone one function invocation.
      results = [];
      for (const s of sites) results.push(await runIndexInspector(s));
    } else if (collector === "competitors") {
      // Each competitor is someone else's server. Sequential across sites and
      // sequential within them, with the crawler's own one-per-second delay.
      results = [];
      for (const s of sites) results.push(await runCompetitorsForSite(s.id));
    } else if (collector === "local") {
      results = [];
      for (const s of sites) results.push(await runLocal(s));
    } else if (collector === "opportunities") {
      // One Search Console call per site plus local reads. Sequential for the
      // same reason as the other Google collectors: the quota is per project,
      // not per site.
      results = [];
      for (const s of sites) results.push(await runOpportunities(s));
    } else {
      // Crawl is resumable: this call opens a crawl (or resumes the running
      // one) and works a slice. The caller repeats until done is true, which
      // is what keeps a 33-minute crawl inside a 120-second function.
      results = [];
      for (const s of sites) {
        const { data: open } = await supabase
          .from("pulse_crawls")
          .select("id")
          .eq("site_id", s.id)
          .eq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1);
        const crawlId = (open?.[0]?.id as string) ?? (await startCrawl(s)).crawlId;
        results.push(await tickCrawl(s, crawlId));
      }
    }

    if (run) {
      await supabase
        .from("pulse_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          // Honest per-collector: ranks and backlinks follow the provider's
          // mock switch, Local reports its own (it mocks when a client has no
          // Business Profile connected even with credentials present), and
          // everything else reads real sources only.
          mocked:
            collector === "ranks" || collector === "backlinks"
              ? isMock()
              : results.some((r) => (r as { mocked?: boolean } | null)?.mocked === true),
          counts: { sites: sites.length, results: results.length },
        })
        .eq("id", run.id);
    }
    return Response.json({ ok: true, collector, mocked: isMock(), results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Collector failed.";
    if (run) {
      await supabase
        .from("pulse_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: message })
        .eq("id", run.id);
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
