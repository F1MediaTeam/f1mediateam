// Google PageSpeed Insights (Lighthouse + CrUX) for the admin Tools page.
//
// Two different things come back from one call, and they answer different
// questions:
//
//   field (CrUX)  what real Chrome users actually experienced on this URL over
//                 the last 28 days. This is what Core Web Vitals are assessed
//                 on, and what ranking uses. Only exists once a URL has enough
//                 traffic — a quiet client page will have none.
//   lab           a single simulated load in a controlled environment. Always
//                 available, reproducible, and the only place the performance
//                 score and the improvement opportunities come from. It is not
//                 what users experienced.
//
// PAGESPEED_API_KEY is required in practice. The API technically answers
// unauthenticated, but that path shares one Google-wide project whose daily
// quota is exhausted around the clock — every anonymous call observed during
// development came back 429. A key is free from the Google Cloud console
// (enable "PageSpeed Insights API", then create an API key).

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type Strategy = "mobile" | "desktop";
export type Verdict = "good" | "needs-improvement" | "poor";

export interface MetricReading {
  id: string;
  label: string;
  /** raw number in the metric's own unit (ms, or unitless for CLS) */
  value: number;
  display: string;
  verdict: Verdict;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  /** estimated milliseconds saved */
  savingsMs: number;
}

export interface PageSpeedReport {
  url: string;
  strategy: Strategy;
  /** 0–100, from the lab run */
  score: number | null;
  /** real-user data, when Chrome has enough samples for this URL */
  field: MetricReading[] | null;
  fieldVerdict: Verdict | null;
  /** simulated load — always present */
  lab: MetricReading[];
  opportunities: Opportunity[];
  fetchedAt: string;
}

// Google's own Core Web Vitals thresholds. [good ceiling, needs-improvement
// ceiling] — above the second number is poor.
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
  TBT: [200, 600],
  SI: [3400, 5800],
};

function judge(id: string, value: number): Verdict {
  const t = THRESHOLDS[id];
  if (!t) return "good";
  if (value <= t[0]) return "good";
  if (value <= t[1]) return "needs-improvement";
  return "poor";
}

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

interface CruxMetric {
  percentile?: number;
  category?: string;
}

interface PsiResponse {
  loadingExperience?: {
    overall_category?: string;
    metrics?: Record<string, CruxMetric>;
  };
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<
      string,
      {
        title?: string;
        description?: string;
        numericValue?: number;
        displayValue?: string;
        score?: number | null;
        details?: { overallSavingsMs?: number };
      }
    >;
  };
  error?: { message?: string };
}

function cruxVerdict(category: string | undefined): Verdict {
  if (category === "FAST") return "good";
  if (category === "AVERAGE") return "needs-improvement";
  if (category === "SLOW") return "poor";
  return "needs-improvement";
}

export async function runPageSpeed(url: string, strategy: Strategy): Promise<PageSpeedReport> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);

  // A cold Lighthouse run on a heavy page genuinely takes half a minute.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("PageSpeed timed out — the page took too long to load.");
    }
    throw err;
  }
  clearTimeout(timeout);

  const json = (await res.json()) as PsiResponse;
  if (!res.ok) {
    const detail = json.error?.message ?? `HTTP ${res.status}`;
    // The unauthenticated quota is the overwhelmingly likely cause of a 429.
    if (res.status === 429) {
      throw new Error(
        "PageSpeed rate limit hit. Set PAGESPEED_API_KEY for a higher quota, or retry shortly.",
      );
    }
    throw new Error(detail);
  }

  // ---- field data (real users, may be absent) ----
  const crux = json.loadingExperience;
  const cruxMetrics = crux?.metrics ?? {};
  const fieldSpec: Array<[string, string, string]> = [
    ["LARGEST_CONTENTFUL_PAINT_MS", "LCP", "Largest Contentful Paint"],
    ["INTERACTION_TO_NEXT_PAINT", "INP", "Interaction to Next Paint"],
    ["CUMULATIVE_LAYOUT_SHIFT_SCORE", "CLS", "Cumulative Layout Shift"],
    ["FIRST_CONTENTFUL_PAINT_MS", "FCP", "First Contentful Paint"],
    ["EXPERIMENTAL_TIME_TO_FIRST_BYTE", "TTFB", "Time to First Byte"],
  ];
  const field: MetricReading[] = [];
  for (const [key_, id, labelText] of fieldSpec) {
    const m = cruxMetrics[key_];
    if (m?.percentile === undefined) continue;
    // CrUX reports CLS ×100 as an integer; everything else is milliseconds.
    const value = id === "CLS" ? m.percentile / 100 : m.percentile;
    field.push({
      id,
      label: labelText,
      value,
      display: id === "CLS" ? value.toFixed(3) : ms(value),
      verdict: m.category ? cruxVerdict(m.category) : judge(id, value),
    });
  }

  // ---- lab data (always present) ----
  const audits = json.lighthouseResult?.audits ?? {};
  const labSpec: Array<[string, string, string]> = [
    ["largest-contentful-paint", "LCP", "Largest Contentful Paint"],
    ["first-contentful-paint", "FCP", "First Contentful Paint"],
    ["total-blocking-time", "TBT", "Total Blocking Time"],
    ["cumulative-layout-shift", "CLS", "Cumulative Layout Shift"],
    ["speed-index", "SI", "Speed Index"],
    ["server-response-time", "TTFB", "Server Response Time"],
  ];
  const lab: MetricReading[] = [];
  for (const [auditId, id, labelText] of labSpec) {
    const a = audits[auditId];
    if (a?.numericValue === undefined) continue;
    lab.push({
      id,
      label: labelText,
      value: a.numericValue,
      display: a.displayValue ?? (id === "CLS" ? a.numericValue.toFixed(3) : ms(a.numericValue)),
      verdict: judge(id, a.numericValue),
    });
  }

  // ---- opportunities, biggest win first ----
  const opportunities: Opportunity[] = Object.entries(audits)
    .map(([id, a]) => ({
      id,
      title: a.title ?? id,
      // Lighthouse descriptions carry markdown links; strip to plain text.
      description: (a.description ?? "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
      savingsMs: a.details?.overallSavingsMs ?? 0,
    }))
    .filter((o) => o.savingsMs >= 50)
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 8);

  const rawScore = json.lighthouseResult?.categories?.performance?.score;

  return {
    url,
    strategy,
    score: typeof rawScore === "number" ? Math.round(rawScore * 100) : null,
    field: field.length > 0 ? field : null,
    fieldVerdict: crux?.overall_category ? cruxVerdict(crux.overall_category) : null,
    lab,
    opportunities,
    fetchedAt: new Date().toISOString(),
  };
}
