// GET /api/cron/pulse — the only schedule F1 Pulse needs.
//
// Until now nothing ran on its own. Every collector fired only when someone
// clicked Refresh, which meant a client's site could be down for a week and
// the heartbeat that would have caught it simply never executed.
//
// Design: one hourly cron rather than a dozen entries. Vercel cron issues a
// GET, so this is a GET; the manual refresh endpoint stays POST and is
// untouched. Each tick does two things:
//
//   1. dispatch any alerts nobody has been told about
//   2. run the SINGLE most overdue collector
//
// One collector per tick is deliberate. The route ceiling is 300 seconds and
// a crawl slice alone can use two minutes; running everything for every site
// in one invocation is how a scheduler starts timing out and silently doing
// nothing. Twenty-four ticks a day is ample for cadences measured in days.
//
// Only FREE collectors are scheduled. Paid ones cost money per run and stay
// manual until there is a budget to approve.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { listSites, type PulseSite } from "@/lib/pulse/sites";
import { runHeartbeat } from "@/lib/pulse/heartbeat";
import { runSearch } from "@/lib/pulse/collectors/search";
import { runOpportunities } from "@/lib/pulse/collectors/opportunities";
import { runPsi } from "@/lib/pulse/collectors/psi";
import { runLocal } from "@/lib/pulse/collectors/local";
import { runCompetitorsForSite } from "@/lib/pulse/collectors/competitors";
import { runIndexInspector } from "@/lib/pulse/collectors/index-inspector";
import { startCrawl, tickCrawl } from "@/lib/pulse/collectors/crawl";
import { dispatchAlerts } from "@/lib/pulse/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * How often each free collector should run, in hours.
 *
 * Index state and competitor sites move slowly; checking them daily would
 * spend Google's quota and other people's bandwidth to learn nothing.
 */
const CADENCE_HOURS: Record<string, number> = {
  heartbeat: 6,
  search: 24,
  opportunities: 24,
  local: 24,
  crawl: 168,
  index: 168,
  competitors: 168,
  psi: 720,
};

/** Runs in the order a human would want them: uptime first, then the rest. */
const PRIORITY = ["heartbeat", "search", "opportunities", "crawl", "index", "competitors", "local", "psi"];

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }

  const supabase = await createServiceClient();
  const started = Date.now();

  // Alerts first, and always. It is cheap, and it is the whole reason the
  // other collectors are worth running.
  let alerts;
  try {
    alerts = await dispatchAlerts();
  } catch (err) {
    alerts = { error: err instanceof Error ? err.message : "alert dispatch failed" };
  }

  const sites = await listSites(null);
  if (sites.length === 0) {
    return Response.json({ ok: true, alerts, ran: null, note: "No sites registered." });
  }

  // When did each collector last finish? One query, not one per collector.
  const { data: runRows } = await supabase
    .from("pulse_runs")
    .select("collector, finished_at, ok")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(400);

  const lastRun = new Map<string, string>();
  for (const r of (runRows as Array<{ collector: string; finished_at: string }>) ?? []) {
    if (!lastRun.has(r.collector)) lastRun.set(r.collector, r.finished_at);
  }

  // An open crawl outranks everything: it is resumable by design and only
  // finishes if something keeps ticking it.
  const { data: openCrawl } = await supabase
    .from("pulse_crawls")
    .select("id, site_id")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let job: string | null = null;
  if (openCrawl?.id) {
    job = "crawl";
  } else {
    // Otherwise the most overdue collector wins, measured as a multiple of its
    // own cadence so a weekly job three days late does not jump a daily job
    // that is a day late.
    let worst = 0;
    for (const collector of PRIORITY) {
      const cadence = CADENCE_HOURS[collector];
      const last = lastRun.get(collector);
      const hoursSince = last ? (Date.now() - new Date(last).getTime()) / 3_600_000 : Infinity;
      const overdue = hoursSince / cadence;
      if (overdue >= 1 && overdue > worst) {
        worst = overdue;
        job = collector;
      }
    }
  }

  if (!job) {
    return Response.json({
      ok: true,
      alerts,
      ran: null,
      note: "Nothing due.",
      ms: Date.now() - started,
    });
  }

  const { data: run } = await supabase
    .from("pulse_runs")
    .insert({ collector: job, site_id: null, mocked: false })
    .select("id")
    .single();

  try {
    const results: unknown[] = [];

    if (job === "crawl") {
      // One site per tick. A crawl is a queue that drains over many calls.
      const target = openCrawl?.site_id
        ? sites.find((s) => s.id === openCrawl.site_id)
        : sites.find((s) => s.status === "live") ?? sites[0];
      if (target) {
        const crawlId = (openCrawl?.id as string) ?? (await startCrawl(target)).crawlId;
        results.push(await tickCrawl(target, crawlId));
      }
    } else {
      const live = sites.filter((s: PulseSite) => s.status !== "pending");
      const targets = live.length > 0 ? live : sites;
      for (const s of targets) {
        if (job === "heartbeat") results.push(await runHeartbeat(s));
        else if (job === "search") results.push(await runSearch(s));
        else if (job === "opportunities") results.push(await runOpportunities(s));
        else if (job === "local") results.push(await runLocal(s));
        else if (job === "index") results.push(await runIndexInspector(s));
        else if (job === "competitors") results.push(await runCompetitorsForSite(s.id));
        else if (job === "psi") results.push(await runPsi(s));
        // Stop before the ceiling rather than being killed mid-write.
        if (Date.now() - started > 240_000) break;
      }
    }

    if (run) {
      await supabase
        .from("pulse_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          counts: { sites: results.length, scheduled: true },
        })
        .eq("id", run.id);
    }

    return Response.json({ ok: true, alerts, ran: job, results: results.length, ms: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Collector failed.";
    if (run) {
      await supabase
        .from("pulse_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: message })
        .eq("id", run.id);
    }
    // 200 with an error body, deliberately: a non-2xx makes Vercel retry a
    // collector that just failed, which rarely helps and can double-spend.
    return Response.json({ ok: false, alerts, ran: job, error: message });
  }
}
