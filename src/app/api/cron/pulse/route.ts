// GET /api/cron/pulse — the only schedule F1 Pulse needs.
//
// Until now nothing ran on its own. Every collector fired only when someone
// clicked Refresh, which meant a client's site could be down for a week and
// the heartbeat that would have caught it simply never executed.
//
// Design: one daily cron. Vercel cron issues a GET, so this is a GET; the
// manual refresh endpoint stays POST and is untouched.
//
// Once a day rather than hourly because the plan this runs on allows two cron
// jobs on a once-daily schedule. That constraint shapes the whole route: a
// single run has to accomplish what an hourly tick would have spread out, so
// instead of picking one collector it works through as many as the time
// budget allows, cheapest and most urgent first, and stops cleanly when the
// budget runs low rather than being killed mid-write.
//
//   1. dispatch any alerts nobody has been told about
//   2. run every overdue collector it has time for, in priority order
//   3. spend whatever is left ticking an open crawl
//
// The crawl is the reason step 3 exists. It is a queue that drains over many
// calls, and with only one invocation a day it would otherwise take weeks to
// finish a large site.
//
// Only FREE collectors are scheduled. Paid ones cost money per run and stay
// manual until there is a budget to approve.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { listSites, type PulseSite } from "@/lib/pulse/sites";
import { runHeartbeat } from "@/lib/pulse/heartbeat";
import { runSearch } from "@/lib/pulse/collectors/search";
import { runQueryPages } from "@/lib/pulse/collectors/backfill";
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

  // Which collectors are actually due, in the order a human would want them:
  // uptime first, then the cheap daily reads, then the weekly and monthly.
  const due = PRIORITY.filter((collector) => {
    const last = lastRun.get(collector);
    if (!last) return true;
    const hoursSince = (Date.now() - new Date(last).getTime()) / 3_600_000;
    return hoursSince >= CADENCE_HOURS[collector];
  });

  const { data: openCrawl } = await supabase
    .from("pulse_crawls")
    .select("id, site_id")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (due.length === 0 && !openCrawl?.id) {
    return Response.json({ ok: true, alerts, ran: [], note: "Nothing due.", ms: Date.now() - started });
  }

  const { data: run } = await supabase
    .from("pulse_runs")
    .insert({ collector: "scheduled", site_id: null, mocked: false })
    .select("id")
    .single();

  /** Leave room to finish writing and answer before the 300s ceiling. */
  const budgetLeft = () => 250_000 - (Date.now() - started);

  const ran: Array<{ collector: string; sites: number; error?: string }> = [];

  try {
    const live = sites.filter((s: PulseSite) => s.status !== "pending");
    const targets = live.length > 0 ? live : sites;

    for (const job of due) {
      if (budgetLeft() < 30_000) break;
      let count = 0;
      try {
        for (const s of targets) {
          if (budgetLeft() < 20_000) break;
          if (job === "heartbeat") await runHeartbeat(s);
          else if (job === "search") {
            await runSearch(s);
            // Query and page pairs ride along with the search pull: same
            // connection, same window, and the Keyword Lab is wrong without it.
            await runQueryPages(s);
          }
          else if (job === "opportunities") await runOpportunities(s);
          else if (job === "local") await runLocal(s);
          else if (job === "index") await runIndexInspector(s);
          else if (job === "competitors") await runCompetitorsForSite(s.id);
          else if (job === "psi") await runPsi(s);
          else if (job === "crawl") continue; // handled below
          count += 1;
        }
        ran.push({ collector: job, sites: count });
      } catch (err) {
        // One collector failing must not cost every collector after it.
        ran.push({
          collector: job,
          sites: count,
          error: err instanceof Error ? err.message : "failed",
        });
      }

      // Each collector records its own completion so cadence tracking stays
      // per-collector rather than lumped under one scheduled run.
      await supabase
        .from("pulse_runs")
        .insert({
          collector: job,
          site_id: null,
          mocked: false,
          finished_at: new Date().toISOString(),
          ok: true,
          counts: { sites: count, scheduled: true },
        });
    }

    // Whatever time is left goes to draining an open crawl. With one run a
    // day this is the difference between a large site finishing this week and
    // finishing next month.
    let crawlTicks = 0;
    const crawlSite = openCrawl?.site_id
      ? sites.find((s) => s.id === openCrawl.site_id)
      : due.includes("crawl")
        ? (sites.find((s) => s.status === "live") ?? sites[0])
        : null;

    if (crawlSite) {
      let crawlId = (openCrawl?.id as string) ?? null;
      while (budgetLeft() > 60_000) {
        if (!crawlId) crawlId = (await startCrawl(crawlSite)).crawlId;
        const tick = await tickCrawl(crawlSite, crawlId);
        crawlTicks += 1;
        if ((tick as { done?: boolean }).done) break;
      }
      if (crawlTicks > 0) ran.push({ collector: "crawl", sites: crawlTicks });
    }

    if (run) {
      await supabase
        .from("pulse_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          counts: { jobs: ran.length, crawlTicks },
        })
        .eq("id", run.id);
    }

    return Response.json({ ok: true, alerts, ran, ms: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduled run failed.";
    if (run) {
      await supabase
        .from("pulse_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: message })
        .eq("id", run.id);
    }
    // 200 with an error body, deliberately: a non-2xx makes Vercel retry a
    // run that just failed, which rarely helps and can double-spend.
    return Response.json({ ok: false, alerts, ran, error: message });
  }
}
