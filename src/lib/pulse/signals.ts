// What real visitors ran into, summarised for the client's page.
//
// Everything here comes from people who were actually on the site. That is the
// distinction worth holding onto: a crawler tells you what exists, Google
// tells you what it indexed, and only this tells you what happened to the
// person who showed up.

import { createServiceClient } from "@/lib/supabase/server";

export interface SignalRow {
  path: string;
  detail: string | null;
  count: number;
  people: number;
  lastSeen: string;
}

export interface ScrollRow {
  path: string;
  median: number;
  views: number;
}

export interface SignalsPanel {
  windowDays: number;
  errors: SignalRow[];
  notFound: SignalRow[];
  rageClicks: SignalRow[];
  slowPages: SignalRow[];
  scroll: ScrollRow[];
  totals: { errors: number; notFound: number; rageClicks: number; slowPages: number };
  /** True when the tag has never sent a signal — a different thing from "no problems". */
  noData: boolean;
}

interface Raw {
  kind: string;
  path: string;
  detail: string | null;
  value: number | null;
  session_hash: string | null;
  ts: string;
}

/** Group by path+detail, because one broken script reports on every page. */
function group(rows: Raw[]): SignalRow[] {
  const map = new Map<string, { path: string; detail: string | null; count: number; people: Set<string>; last: string }>();
  for (const r of rows) {
    const key = `${r.path}|${r.detail ?? ""}`;
    const g = map.get(key) ?? { path: r.path, detail: r.detail, count: 0, people: new Set<string>(), last: r.ts };
    g.count += 1;
    if (r.session_hash) g.people.add(r.session_hash);
    if (r.ts > g.last) g.last = r.ts;
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => ({ path: g.path, detail: g.detail, count: g.count, people: g.people.size, lastSeen: g.last }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Median rather than mean.
 *
 * One person who opens a page and leaves it parked at the bottom would drag a
 * mean to 100% and report a page as fully read that nobody reads.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

export async function signalsPanel(siteId: string, windowDays = 30): Promise<SignalsPanel> {
  const supabase = await createServiceClient();
  const from = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const { data } = await supabase
    .from("pulse_signals")
    .select("kind, path, detail, value, session_hash, ts")
    .eq("site_id", siteId)
    .gte("ts", from)
    .order("ts", { ascending: false })
    .limit(20_000);

  const rows = (data as Raw[]) ?? [];
  const of = (kind: string) => rows.filter((r) => r.kind === kind);

  // Scroll depth is a distribution, not a list of incidents.
  const scrollByPath = new Map<string, number[]>();
  for (const r of of("scroll_depth")) {
    if (r.value == null) continue;
    const list = scrollByPath.get(r.path) ?? [];
    list.push(Number(r.value));
    scrollByPath.set(r.path, list);
  }
  const scroll: ScrollRow[] = [...scrollByPath.entries()]
    .map(([path, values]) => ({ path, median: median(values), views: values.length }))
    // Two readings is not a distribution; reporting it as one invites a
    // decision it cannot support.
    .filter((r) => r.views >= 3)
    .sort((a, b) => a.median - b.median)
    .slice(0, 12);

  const errors = group(of("js_error")).slice(0, 12);
  const notFound = group(of("not_found")).slice(0, 12);
  const rageClicks = group(of("rage_click")).slice(0, 12);
  const slowPages = group(of("slow_page")).slice(0, 12);

  return {
    windowDays,
    errors,
    notFound,
    rageClicks,
    slowPages,
    scroll,
    totals: {
      errors: of("js_error").length,
      notFound: of("not_found").length,
      rageClicks: of("rage_click").length,
      slowPages: of("slow_page").length,
    },
    noData: rows.length === 0,
  };
}
