// Index Inspector — is Google actually accepting these pages?
//
// Ranking is downstream of indexing. A page Google has not accepted cannot
// rank for anything however good it is, and nothing else in Pulse can see that
// state: the crawler reports what a page says about itself, and Search Console
// performance data only ever describes pages that already got in. A page that
// is silently excluded looks identical to a page nobody searches for.
//
// Free. The URL Inspection API costs nothing.
//
// Auth, and why there is no service account:
//   The addendum assumes a Google service account added by hand as a Full user
//   on each client's property — four separate manual steps, each blocked on
//   client access. It is unnecessary here. The portal already holds a per-
//   client OAuth grant for Search Console, and the scope it requests
//   (webmasters.readonly) is exactly the scope URL Inspection requires. So a
//   client already connected in the portal needs no further authorisation.
//   The one requirement that remains is Google's: whoever authorised must be
//   an owner or full user of the property, not a restricted one.
//
// Quotas are per property, per day: Google allows 2,000 inspections and 600
// per minute. This budgets under both, and resumes where it left off rather
// than restarting, because a large site cannot be inspected in one day.

import { createServiceClient } from "@/lib/supabase/server";
import { data } from "@/lib/data";
import { getValidAccessToken } from "@/lib/connectors/google-oauth";
import { fetchRobots, readSitemaps } from "./competitors";
import { isMock } from "@/lib/pulse/providers/serp";
import type { PulseSite } from "@/lib/pulse/sites";

const INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

/** Google's ceiling is 2,000/day per property; leaving headroom avoids a hard stop. */
const DAILY_BUDGET = 1800;
/** Google's ceiling is 600/minute. 8/second is comfortably inside it. */
const DELAY_MS = 125;
/** URLs per invocation — the route ceiling is 300s, so this leaves wide margin. */
const SLICE = 180;

export type Bucket =
  | "indexed"
  | "rejected"
  | "not_crawled"
  | "canonical_override"
  | "blocked"
  | "redirect"
  | "error"
  | "unknown";

/** Plain English, for a client reading their own report. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  indexed: "In Google",
  rejected: "Google looked and declined",
  not_crawled: "Google hasn't visited yet",
  canonical_override: "Google chose a different version",
  blocked: "Blocked from Google",
  redirect: "Redirects elsewhere",
  error: "Error when Google tried",
  unknown: "Unclear",
};

interface InspectionResult {
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  pageFetchState?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
}

/**
 * One verdict, from Google's several partly-overlapping status fields.
 *
 * Order matters here. A page can be both "blocked by robots" and "not
 * indexed", and reporting the second hides the cause; the reason someone can
 * act on always wins over the symptom.
 */
export function bucketFor(r: InspectionResult): Bucket {
  const coverage = (r.coverageState ?? "").toLowerCase();
  const fetchState = (r.pageFetchState ?? "").toUpperCase();
  const indexing = (r.indexingState ?? "").toUpperCase();
  const robots = (r.robotsTxtState ?? "").toUpperCase();

  // Cause before symptom.
  if (robots === "DISALLOWED" || indexing.startsWith("BLOCKED") || fetchState.startsWith("BLOCKED")) {
    return "blocked";
  }
  if (fetchState === "REDIRECT_ERROR" || coverage.includes("redirect")) return "redirect";
  if (
    fetchState === "NOT_FOUND" ||
    fetchState === "SOFT_404" ||
    fetchState === "ACCESS_DENIED" ||
    fetchState === "SERVER_ERROR" ||
    fetchState === "INTERNAL_CRAWL_ERROR" ||
    fetchState === "INVALID_URL"
  ) {
    return "error";
  }

  // Google indexed a different URL as the canonical one. The page is not
  // missing — it is being represented by another, which is a content decision
  // rather than a technical fault.
  if (
    r.googleCanonical &&
    r.userCanonical &&
    r.googleCanonical !== r.userCanonical &&
    !coverage.includes("submitted and indexed")
  ) {
    return "canonical_override";
  }

  if (r.verdict === "PASS" || coverage.includes("indexed")) {
    // "Crawled - currently not indexed" contains the word indexed and means
    // the opposite, so it has to be excluded explicitly.
    if (coverage.includes("not indexed")) {
      return coverage.includes("discovered") ? "not_crawled" : "rejected";
    }
    return "indexed";
  }

  if (coverage.includes("discovered") || !r.lastCrawlTime) return "not_crawled";
  if (coverage.includes("excluded") || coverage.includes("not indexed")) return "rejected";
  return "unknown";
}

export interface IndexRunResult {
  siteId: string;
  domain: string;
  runId: string | null;
  inspected: number;
  remaining: number;
  done: boolean;
  buckets: Record<string, number>;
  mocked: boolean;
  skipped?: string;
}

/** Stable pseudo-random, so a mocked site does not reshuffle between runs. */
function seed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 10_000) / 10_000;
}

/** A plausible distribution, so the panel is complete without credentials. */
function mockBucket(url: string): Bucket {
  const s = seed(url);
  if (s < 0.72) return "indexed";
  if (s < 0.82) return "not_crawled";
  if (s < 0.9) return "rejected";
  if (s < 0.95) return "canonical_override";
  if (s < 0.98) return "blocked";
  return "error";
}

async function inspectOne(
  token: string,
  property: string,
  url: string,
): Promise<{ result: InspectionResult; quotaHit: boolean }> {
  const res = await fetch(INSPECT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
    signal: AbortSignal.timeout(30_000),
  });

  // 429 is the daily or per-minute quota. It is not a failure — it is the
  // signal to stop and resume tomorrow, which is why it is distinguished from
  // every other error rather than thrown.
  if (res.status === 429) return { result: {}, quotaHit: true };

  if (!res.ok) {
    const text = await res.text();
    const hint =
      res.status === 403
        ? " — check gsc_property matches the verified property exactly, and that the connected Google user is an owner or full user rather than restricted."
        : "";
    throw new Error(`URL Inspection ${res.status}: ${text.slice(0, 200)}${hint}`);
  }

  const json = (await res.json()) as {
    inspectionResult?: { indexStatusResult?: InspectionResult };
  };
  return { result: json.inspectionResult?.indexStatusResult ?? {}, quotaHit: false };
}

export async function runIndexInspector(site: PulseSite & { gsc_property?: string | null }): Promise<IndexRunResult> {
  const supabase = await createServiceClient();
  const base: IndexRunResult = {
    siteId: site.id,
    domain: site.domain,
    runId: null,
    inspected: 0,
    remaining: 0,
    done: false,
    buckets: {},
    mocked: false,
  };

  const connectors = await data.listConnectors(site.client_id);
  const token = connectors.find((c) => c.provider === "gsc");
  const property = site.gsc_property ?? null;
  const mocked = isMock() || !token || !property;

  // ------------------------------------------------------------ resume or open
  const { data: openRun } = await supabase
    .from("pulse_index_runs")
    .select("id, urls_total, urls_inspected")
    .eq("site_id", site.id)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let runId = (openRun?.id as string) ?? null;
  let alreadyInspected = (openRun?.urls_inspected as number) ?? 0;

  // The URL list comes from the site's own sitemap — the same source the
  // crawler seeds from, so the two agree about what the site claims to have.
  const robots = await fetchRobots(site.domain);
  const entries = await readSitemaps(site.domain, robots);
  const urls = entries.map((e) => e.url).slice(0, DAILY_BUDGET);

  if (urls.length === 0) {
    return { ...base, mocked, skipped: "No sitemap URLs found for this site." };
  }

  if (!runId) {
    const { data: created, error } = await supabase
      .from("pulse_index_runs")
      .insert({ site_id: site.id, urls_total: urls.length, status: "running", mocked })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not start an index run.");
    runId = created.id as string;
    alreadyInspected = 0;
  }

  // Which URLs this run already covered, so a resume continues rather than
  // re-inspecting and burning the day's quota on work already done.
  const { data: doneRows } = await supabase
    .from("pulse_index_verdicts")
    .select("url")
    .eq("run_id", runId)
    .limit(20_000);
  const done = new Set(((doneRows as Array<{ url: string }>) ?? []).map((r) => r.url));
  const pending = urls.filter((u) => !done.has(u));
  const slice = pending.slice(0, SLICE);

  // ----------------------------------------------------------------- inspect
  let accessToken = "";
  if (!mocked && token) {
    accessToken = (await getValidAccessToken(token.id)).access_token;
  }

  const verdicts: Array<Record<string, unknown>> = [];
  let quotaPaused = false;

  for (const url of slice) {
    if (mocked) {
      verdicts.push({
        run_id: runId,
        site_id: site.id,
        url: url.slice(0, 1000),
        bucket: mockBucket(url),
        coverage_state: "Sample data — no Search Console property connected",
      });
      continue;
    }

    try {
      const { result, quotaHit } = await inspectOne(accessToken, property!, url);
      if (quotaHit) {
        quotaPaused = true;
        break;
      }
      verdicts.push({
        run_id: runId,
        site_id: site.id,
        url: url.slice(0, 1000),
        bucket: bucketFor(result),
        coverage_state: result.coverageState ?? null,
        indexing_state: result.indexingState ?? null,
        robots_state: result.robotsTxtState ?? null,
        page_fetch_state: result.pageFetchState ?? null,
        last_crawl_time: result.lastCrawlTime ?? null,
        google_canonical: result.googleCanonical ?? null,
        user_canonical: result.userCanonical ?? null,
      });
    } catch (err) {
      // One URL failing should not abandon the rest of the slice; the failure
      // is recorded as its own verdict so it is visible rather than missing.
      verdicts.push({
        run_id: runId,
        site_id: site.id,
        url: url.slice(0, 1000),
        bucket: "error",
        coverage_state: (err instanceof Error ? err.message : "Inspection failed").slice(0, 300),
      });
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  if (verdicts.length > 0) {
    await supabase.from("pulse_index_verdicts").upsert(verdicts, { onConflict: "run_id,url" });
  }

  // ---------------------------------------------------------------- tally up
  const { data: allRows } = await supabase
    .from("pulse_index_verdicts")
    .select("bucket")
    .eq("run_id", runId)
    .limit(20_000);
  const buckets: Record<string, number> = {};
  for (const r of (allRows as Array<{ bucket: string }>) ?? []) {
    buckets[r.bucket] = (buckets[r.bucket] ?? 0) + 1;
  }

  const inspectedTotal = alreadyInspected + verdicts.length;
  const remaining = Math.max(0, pending.length - verdicts.length);
  const finished = remaining === 0 && !quotaPaused;

  await supabase
    .from("pulse_index_runs")
    .update({
      urls_inspected: inspectedTotal,
      urls_total: urls.length,
      buckets,
      status: finished ? "done" : quotaPaused ? "quota_paused" : "running",
      finished_at: finished || quotaPaused ? new Date().toISOString() : null,
      mocked,
    })
    .eq("id", runId);

  // ------------------------------------------------------------ feed events
  // Only on completion. A run that spans three days should announce itself
  // once, at the end, not every time a slice finishes.
  if (finished) {
    const previous = await previousRunBuckets(site.id, runId);
    const nowIndexed = buckets.indexed ?? 0;
    const wasIndexed = previous?.indexed ?? null;

    await supabase.from("pulse_feed_events").insert({
      site_id: site.id,
      kind: "index_run_completed",
      severity: "info",
      title: `${nowIndexed} of ${urls.length} pages are in Google`,
      payload: { buckets, total: urls.length, mocked },
    });

    if (wasIndexed !== null && nowIndexed !== wasIndexed) {
      const delta = nowIndexed - wasIndexed;
      await supabase.from("pulse_feed_events").insert({
        site_id: site.id,
        kind: delta > 0 ? "pages_fixed" : "pages_regressed",
        severity: delta > 0 ? "good" : "warning",
        title:
          delta > 0
            ? `${delta} more page${delta === 1 ? "" : "s"} now in Google`
            : `${Math.abs(delta)} page${Math.abs(delta) === 1 ? "" : "s"} dropped out of Google`,
        payload: { from: wasIndexed, to: nowIndexed, mocked },
      });
    }
  }

  return {
    ...base,
    runId,
    inspected: verdicts.length,
    remaining,
    done: finished,
    buckets,
    mocked,
  };
}

/** Bucket counts from the run before this one, for the fixed/regressed line. */
async function previousRunBuckets(
  siteId: string,
  currentRunId: string,
): Promise<Record<string, number> | null> {
  const supabase = await createServiceClient();
  const { data: rows } = await supabase
    .from("pulse_index_runs")
    .select("id, buckets, status")
    .eq("site_id", siteId)
    .eq("status", "done")
    .neq("id", currentRunId)
    .order("started_at", { ascending: false })
    .limit(1);
  const prev = (rows as Array<{ buckets: Record<string, number> }>)?.[0];
  return prev?.buckets ?? null;
}
