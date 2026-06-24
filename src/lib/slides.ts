// Slide deck generator. Pulls live data for a client + date range and
// produces a typed list of slides the renderer can iterate over.
//
// Slides are intentionally serializable (plain JSON) so the same deck can be
// streamed to the HTML viewer at /admin/meetings/[id]/present and, later,
// embedded in PDF exports if we wire that path.

import { data } from "@/lib/data";
import { formatNumber, formatPercentChange } from "@/lib/utils";
import type {
  CalendarEvent,
  Client,
  ContentCard,
  Meeting,
  MetricSnapshot,
  Task,
} from "@/lib/types";

// ---------------- types ----------------

export interface KpiItem {
  label: string;
  value: string;          // pre-formatted display value
  delta: string | null;   // "+12.3%" / "−4.5%" / "new" / null
  direction: "up" | "down" | "flat";
  // For metrics where lower-is-better (avg_position), "up" in raw delta means
  // "got worse" — the renderer should color by `direction` only, which is
  // already inverted here as appropriate.
}

export interface ChartPoint {
  date: string;   // ISO date
  value: number;
}

export interface ContentSlideItem {
  title: string;
  excerpt: string | null;
  link: string | null;
  date: string;          // ISO datetime
  stage: ContentCard["stage"];
}

export interface EventSlideItem {
  title: string;
  date: string;          // ISO datetime
  type: CalendarEvent["type"];
}

export interface TaskSlideItem {
  title: string;
  due: string | null;
  status: Task["status"];
}

export type Slide =
  | {
      kind: "cover";
      title: string;
      subtitle: string;
      date: string;
      rangeLabel: string;
      logoUrl: string | null;
    }
  | {
      kind: "kpi";
      title: string;
      subtitle: string;
      items: KpiItem[];
    }
  | {
      kind: "trend";
      title: string;
      subtitle: string;
      metricLabel: string;
      series: ChartPoint[];
      summaryLeft: { label: string; value: string };
      summaryRight: { label: string; value: string; delta: string | null; direction: "up" | "down" | "flat" };
    }
  | {
      kind: "content";
      title: string;
      subtitle: string;
      cards: ContentSlideItem[];
    }
  | {
      kind: "events";
      title: string;
      subtitle: string;
      items: EventSlideItem[];
    }
  | {
      kind: "tasks";
      title: string;
      subtitle: string;
      items: TaskSlideItem[];
    }
  | {
      kind: "closing";
      title: string;
      subtitle: string;
      bullets: string[];
    };

// ---------------- helpers ----------------

const METRIC_CONFIG = {
  clicks:       { label: "Clicks",         lowerBetter: false, decimals: 0 },
  impressions:  { label: "Impressions",    lowerBetter: false, decimals: 0 },
  sessions:     { label: "Sessions",       lowerBetter: false, decimals: 0 },
  avg_position: { label: "Avg. position",  lowerBetter: true,  decimals: 1 },
  visibility:   { label: "Visibility",     lowerBetter: false, decimals: 1 },
} as const;
type MetricKey = keyof typeof METRIC_CONFIG;

function fmt(metric: MetricKey, n: number): string {
  return formatNumber(n, { maximumFractionDigits: METRIC_CONFIG[metric].decimals });
}

function summarizeMetric(metric: MetricKey, series: MetricSnapshot[]): KpiItem | null {
  if (series.length === 0) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return null;

  const cfg = METRIC_CONFIG[metric];
  const change = formatPercentChange(first.value, last.value);
  // Invert direction for lower-is-better metrics so up = good in the UI.
  const direction =
    cfg.lowerBetter
      ? change.direction === "up"
        ? "down"
        : change.direction === "down"
        ? "up"
        : "flat"
      : change.direction;

  return {
    label: cfg.label,
    value: fmt(metric, last.value),
    delta: change.label === "—" ? null : change.label,
    direction,
  };
}

function rangeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return "All time";
  const fmtOne = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  if (from && to) return `${fmtOne(from)} → ${fmtOne(to)}`;
  if (from) return `from ${fmtOne(from)}`;
  return `through ${fmtOne(to as string)}`;
}

function publicLogoUrl(logoPath: string | null, supabaseUrl?: string | null): string | null {
  if (!logoPath) return null;
  // If the row was created with a fully-qualified URL (legacy) or a data URI,
  // pass it straight through.
  if (logoPath.startsWith("http://") || logoPath.startsWith("https://") || logoPath.startsWith("data:")) {
    return logoPath;
  }
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/meeting-assets/${logoPath}`;
}

// ---------------- main ----------------

export interface BuildDeckInput {
  meeting: Meeting;
  client: Client;
}

export async function buildDeck({ meeting, client }: BuildDeckInput): Promise<Slide[]> {
  const from = meeting.range_from ?? null;
  const to = meeting.range_to ?? null;

  const metricsToShow: MetricKey[] = ["clicks", "impressions", "sessions", "avg_position", "visibility"];

  const [allMetrics, content, calendar, tasks] = await Promise.all([
    Promise.all(
      metricsToShow.map((metric) =>
        data.listSnapshots({
          clientId: client.id,
          metric,
          from: from ?? undefined,
          to: to ?? undefined,
        }),
      ),
    ),
    data.listContent({ clientId: client.id }),
    data.listCalendar({ clientId: client.id }),
    data.listTasks({ clientId: client.id }),
  ]);

  // KPI tiles
  const kpiItems: KpiItem[] = [];
  metricsToShow.forEach((m, i) => {
    const summary = summarizeMetric(m, allMetrics[i]);
    if (summary) kpiItems.push(summary);
  });

  // Trend slides: one per metric that has at least 2 data points
  const trendSlides: Slide[] = [];
  metricsToShow.forEach((m, i) => {
    const series = allMetrics[i];
    if (series.length < 2) return;
    const first = series[0];
    const last = series[series.length - 1];
    const change = formatPercentChange(first.value, last.value);
    const cfg = METRIC_CONFIG[m];
    const direction =
      cfg.lowerBetter
        ? change.direction === "up"
          ? "down"
          : change.direction === "down"
          ? "up"
          : "flat"
        : change.direction;
    trendSlides.push({
      kind: "trend",
      title: `${cfg.label} over time`,
      subtitle: cfg.lowerBetter
        ? `Lower is better — ${client.company_name}`
        : `${client.company_name}`,
      metricLabel: cfg.label,
      series: series.map((s) => ({ date: s.captured_at, value: s.value })),
      summaryLeft: { label: "Start of period", value: fmt(m, first.value) },
      summaryRight: {
        label: "Latest",
        value: fmt(m, last.value),
        delta: change.label === "—" ? null : change.label,
        direction,
      },
    });
  });

  // Content highlights: posted cards in the date range (or last 10)
  const postedCards = content
    .filter((c) => c.stage === "posted")
    .filter((c) => {
      if (!from && !to) return true;
      const d = c.created_at.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  const contentSlide: Slide | null =
    postedCards.length === 0
      ? null
      : {
          kind: "content",
          title: "What we shipped",
          subtitle: `${postedCards.length} posted item${postedCards.length === 1 ? "" : "s"}`,
          cards: postedCards.map((c) => ({
            title: c.title,
            excerpt: c.body ? c.body.slice(0, 220) : null,
            link: c.link,
            date: c.created_at,
            stage: c.stage,
          })),
        };

  // Pipeline (proposed + pending) — what's next
  const pipelineCards = content
    .filter((c) => c.stage !== "posted")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6);

  const pipelineSlide: Slide | null =
    pipelineCards.length === 0
      ? null
      : {
          kind: "content",
          title: "In the pipeline",
          subtitle: `${pipelineCards.length} item${pipelineCards.length === 1 ? "" : "s"} awaiting approval or in draft`,
          cards: pipelineCards.map((c) => ({
            title: c.title,
            excerpt: c.body ? c.body.slice(0, 220) : null,
            link: c.link,
            date: c.updated_at,
            stage: c.stage,
          })),
        };

  // Upcoming calendar events (next 6 from today onward)
  const todayIso = new Date().toISOString();
  const upcoming = calendar
    .filter((e) => e.starts_at >= todayIso)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 6);

  const eventsSlide: Slide | null =
    upcoming.length === 0
      ? null
      : {
          kind: "events",
          title: "Upcoming milestones",
          subtitle: "Meetings & deadlines on the calendar",
          items: upcoming.map((e) => ({ title: e.title, date: e.starts_at, type: e.type })),
        };

  // Open tasks → next steps
  const openTasks = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 8);

  const tasksSlide: Slide | null =
    openTasks.length === 0
      ? null
      : {
          kind: "tasks",
          title: "Next steps",
          subtitle: `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}`,
          items: openTasks.map((t) => ({
            title: t.title,
            due: t.due_date,
            status: t.status,
          })),
        };

  // Cover
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const logoUrl = publicLogoUrl(meeting.logo_path, supabaseUrl);

  const coverSlide: Slide = {
    kind: "cover",
    title: meeting.title || `${client.company_name} — performance review`,
    subtitle: client.company_name,
    date: meeting.scheduled_at,
    rangeLabel: rangeLabel(from, to),
    logoUrl,
  };

  const kpiSlide: Slide | null =
    kpiItems.length === 0
      ? null
      : {
          kind: "kpi",
          title: "Headline numbers",
          subtitle: `${rangeLabel(from, to)} · ${client.company_name}`,
          items: kpiItems,
        };

  // Closing — pull notes if provided, else generic recap
  const closingBullets: string[] = [];
  if (kpiItems.length > 0) {
    const wins = kpiItems.filter((k) => k.direction === "up");
    if (wins.length > 0) {
      closingBullets.push(
        `${wins.length} of ${kpiItems.length} headline metric${kpiItems.length === 1 ? "" : "s"} trending up`,
      );
    }
  }
  if (postedCards.length > 0) {
    closingBullets.push(`${postedCards.length} piece${postedCards.length === 1 ? "" : "s"} of content shipped`);
  }
  if (pipelineCards.length > 0) {
    closingBullets.push(`${pipelineCards.length} more in the pipeline for next sprint`);
  }
  if (openTasks.length > 0) {
    closingBullets.push(`${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} to drive next-period results`);
  }
  if (meeting.notes) {
    meeting.notes
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-•\s]+/, "").trim())
      .filter(Boolean)
      .forEach((l) => closingBullets.push(l));
  }
  if (closingBullets.length === 0) closingBullets.push("Thanks for the partnership — questions?");

  const closingSlide: Slide = {
    kind: "closing",
    title: "Recap & questions",
    subtitle: client.company_name,
    bullets: closingBullets,
  };

  const slides: Slide[] = [coverSlide];
  if (kpiSlide) slides.push(kpiSlide);
  slides.push(...trendSlides);
  if (contentSlide) slides.push(contentSlide);
  if (pipelineSlide) slides.push(pipelineSlide);
  if (eventsSlide) slides.push(eventsSlide);
  if (tasksSlide) slides.push(tasksSlide);
  slides.push(closingSlide);
  return slides;
}

export function logoUrlFor(meeting: Meeting): string | null {
  return publicLogoUrl(meeting.logo_path, process.env.NEXT_PUBLIC_SUPABASE_URL ?? null);
}
