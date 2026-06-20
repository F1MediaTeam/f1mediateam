// PDF export endpoint. Every section produces a polished, client-presentable
// PDF with a brand cover page, KPI tiles, embedded charts, and a styled
// data table.
//
// GET /api/export/<clientId>/<section>?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=America/Los_Angeles
//
// Sections: tasks, calendar, content, content_events, metrics, audit, files,
// onboarding, admin_access. Admin-only. Date range optional.

import React from "react";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import {
  buildSectionPdf,
  STAGE_BADGE,
  STATUS_BADGE,
  ROLE_BADGE,
  TYPE_BADGE,
  type ColumnDef,
  type SectionKpi,
  type ChartNode,
} from "@/lib/pdf-report";
import { DashboardCard, LineChart, BarChart, DonutChart, GaugeGrid, PALETTE } from "@/lib/chart-pdf";
import { todayIso } from "@/lib/utils";
import type {
  Task,
  CalendarEvent,
  ContentCard,
  FileRecord,
  LoginAudit,
  AdminImpersonation,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// react-pdf + sharp need Node APIs.
export const runtime = "nodejs";
// PDF rendering with charts can take a few seconds.
export const maxDuration = 60;

const ALLOWED = [
  "tasks", "calendar", "content", "content_events",
  "metrics", "audit", "files", "onboarding", "admin_access",
] as const;
type Section = (typeof ALLOWED)[number];

function isSection(s: string): s is Section {
  return (ALLOWED as readonly string[]).includes(s);
}

function pdfResponse(name: string, buf: Buffer) {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

function trimText(s: string | null | undefined, n = 80): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatBytes(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let val = v;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function pctChange(current: number, prev: number, lowerBetter = false): number | null {
  if (prev === 0) return null;
  const raw = (current - prev) / Math.abs(prev);
  return lowerBetter ? -raw : raw;
}

function splitHalves<T>(rows: T[]): { first: T[]; second: T[] } {
  const mid = Math.floor(rows.length / 2);
  return { first: rows.slice(0, mid), second: rows.slice(mid) };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; section: string }> },
) {
  await requireAdmin();
  const { clientId, section } = await params;
  if (!isSection(section)) {
    return new Response(`Unknown section "${section}"`, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || undefined;
  const to = sp.get("to") || undefined;
  let tz = sp.get("tz") || "America/Los_Angeles";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "America/Los_Angeles";
  }

  const client = await data.getClient(clientId);
  if (!client) return new Response("Client not found", { status: 404 });

  const slug = client.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const range = `${from ?? "all"}_to_${to ?? "now"}`;
  const generatedAt = new Date();

  let buf: Buffer;

  switch (section) {
    case "metrics": {
      // Before reading, sync every connector that has data older than ~30 min.
      // This guarantees the report reflects what's actually live in the APIs
      // even if the admin hasn't hit "Refresh" in the UI.
      try {
        const { getConnector } = await import("@/lib/connectors");
        const tokens = await data.listConnectors(clientId);
        const STALE = 30 * 60 * 1000;
        for (const token of tokens) {
          const last = token.last_synced_at ? new Date(token.last_synced_at).getTime() : 0;
          if (Date.now() - last < STALE) continue;
          const connector = getConnector(token.provider);
          if (!connector) continue;
          try {
            const { snapshots, effectiveAsOf, replaceSource } = await connector.sync({ clientId, token });
            if (replaceSource && snapshots.length) await data.deleteSnapshotsBySource(clientId, replaceSource);
            await data.writeSnapshots(snapshots.map((s) => ({ ...s, client_id: clientId })));
            await data.touchConnectorSync(token.id, `ok @ ${effectiveAsOf} (${snapshots.length} rows)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown error";
            await data.touchConnectorSync(token.id, `error: ${msg}`);
          }
        }
      } catch {
        // Sync is best-effort — fall through to whatever data we already have.
      }

      // Every metric every connector writes — one DashboardCard each.
      type MetricDef = {
        metric: string;
        label: string;        // short label for the KPI grid
        cardTitle: string;    // big title on the chart card
        source: string;       // subtitle under the title
        agg: "sum" | "avg";
        lowerBetter?: boolean;
        kind: "int" | "money" | "decimal";
      };
      const defs: MetricDef[] = [
        // Google Search Console
        { metric: "clicks",                       label: "GSC Clicks",          cardTitle: "Organic clicks",            source: "From Google Search Console",  agg: "sum", kind: "int" },
        { metric: "impressions",                  label: "GSC Impressions",     cardTitle: "Impressions",               source: "From Google Search Console",  agg: "sum", kind: "int" },
        { metric: "avg_position",                 label: "Avg. Position",       cardTitle: "Average position",          source: "From Google Search Console",  agg: "avg", lowerBetter: true, kind: "decimal" },
        // Google Analytics
        { metric: "sessions",                     label: "GA4 Sessions",        cardTitle: "Sessions",                  source: "From Google Analytics 4",     agg: "sum", kind: "int" },
        // Bing Webmaster
        { metric: "bing_clicks",                  label: "Bing Clicks",         cardTitle: "Bing organic clicks",       source: "From Bing Webmaster Tools",   agg: "sum", kind: "int" },
        { metric: "bing_impressions",             label: "Bing Impressions",    cardTitle: "Bing impressions",          source: "From Bing Webmaster Tools",   agg: "sum", kind: "int" },
        { metric: "bing_avg_click_position",      label: "Bing Click Pos.",     cardTitle: "Bing avg. click position",  source: "From Bing Webmaster Tools",   agg: "avg", lowerBetter: true, kind: "decimal" },
        { metric: "bing_avg_impression_position", label: "Bing Impr. Pos.",     cardTitle: "Bing avg. impression position", source: "From Bing Webmaster Tools", agg: "avg", lowerBetter: true, kind: "decimal" },
        // SEMrush
        { metric: "semrush_organic_keywords",     label: "SEMrush Org. Kw",     cardTitle: "Organic keywords",          source: "From SEMrush",                agg: "avg", kind: "int" },
        { metric: "semrush_organic_traffic",      label: "SEMrush Org. Traffic", cardTitle: "Estimated organic traffic", source: "From SEMrush",               agg: "avg", kind: "int" },
        { metric: "semrush_organic_cost",         label: "SEMrush Org. Value",  cardTitle: "Estimated organic value",   source: "From SEMrush · USD",          agg: "avg", kind: "money" },
        { metric: "semrush_paid_keywords",        label: "SEMrush Paid Kw",     cardTitle: "Paid keywords",             source: "From SEMrush",                agg: "avg", kind: "int" },
        { metric: "semrush_paid_traffic",         label: "SEMrush Paid Traffic", cardTitle: "Estimated paid traffic",    source: "From SEMrush",               agg: "avg", kind: "int" },
        { metric: "semrush_paid_cost",            label: "SEMrush Paid Spend",  cardTitle: "Estimated paid spend",      source: "From SEMrush · USD",          agg: "avg", kind: "money" },
      ];

      // Every metric is scoped to the report's selected time frame so the data
      // and the date label agree. SEMrush is the exception in cadence: it's
      // monthly (stamped mid-month), so a short daily window can fall between
      // its points. Snap the SEMrush window start back to the first of that
      // month so any month the report overlaps still shows up. Also drop
      // anything dated after today (viewer tz) — a future date is never real.
      const todayStr = todayIso(tz);
      const semrushFrom = from ? `${from.slice(0, 7)}-01` : from;
      const all = (await Promise.all(
        defs.map((d) =>
          d.metric.startsWith("semrush_")
            ? data.listSnapshots({ clientId, metric: d.metric, from: semrushFrom, to })
            : data.listSnapshots({ clientId, metric: d.metric, from, to }),
        ),
      )).map((series) => series.filter((s) => s.captured_at <= todayStr));
      const semrushDefs = defs.filter((d) => d.metric.startsWith("semrush_"));
      const snapshots = all.flat();
      const sortedDates = snapshots.map((s) => s.captured_at).sort();
      const effectiveFrom = from ?? sortedDates[0] ?? generatedAt.toISOString().slice(0, 10);
      const effectiveTo = to ?? sortedDates[sortedDates.length - 1] ?? generatedAt.toISOString().slice(0, 10);

      const fmtDateShort = (iso: string) =>
        new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
      const fmtVal = (v: number, def: MetricDef) => {
        if (def.kind === "money") return `$${Math.round(v).toLocaleString("en-US")}`;
        if (def.kind === "decimal") return v.toFixed(1);
        return Math.round(v).toLocaleString("en-US");
      };

      // KPI grid: one representative card per source — keeps the 5×2 grid
      // readable while still summarising every connector's headline trend.
      const kpiPicks: { defIdx: number; label: string }[] = [
        { defIdx: defs.findIndex((d) => d.metric === "clicks"),                  label: "Google Search" },
        { defIdx: defs.findIndex((d) => d.metric === "sessions"),                label: "Google Analytics" },
        { defIdx: defs.findIndex((d) => d.metric === "bing_clicks"),             label: "Bing Webmaster" },
        { defIdx: defs.findIndex((d) => d.metric === "semrush_organic_traffic"), label: "SEMrush" },
        { defIdx: defs.findIndex((d) => d.metric === "avg_position"),            label: "Avg. Position" },
      ];
      const kpis: SectionKpi[] = kpiPicks.map(({ defIdx, label }) => {
        if (defIdx < 0) return { label, value: "—" };
        const def = defs[defIdx];
        const values = all[defIdx].map((s) => Number(s.value));
        if (values.length === 0) return { label, value: "—" };
        const halves = splitHalves(values);
        const firstAgg = def.agg === "sum"
          ? halves.first.reduce((a, b) => a + b, 0)
          : (halves.first.length ? halves.first.reduce((a, b) => a + b, 0) / halves.first.length : 0);
        const secondAgg = def.agg === "sum"
          ? halves.second.reduce((a, b) => a + b, 0)
          : (halves.second.length ? halves.second.reduce((a, b) => a + b, 0) / halves.second.length : 0);
        const trend = pctChange(secondAgg, firstAgg, def.lowerBetter);
        if (trend === null) return { label, value: "—" };
        const sign = trend > 0 ? "+" : "";
        return {
          label,
          value: `${sign}${(trend * 100).toFixed(0)}%`,
          tone: trend > 0.005 ? "ok" : trend < -0.005 ? "bad" : "neutral",
        };
      });

      // Dashboard-style trend card per Google/Bing metric with data. SEMrush is
      // monthly (sparse), so it's rendered as a grid of gauges below instead.
      const trendCharts: ChartNode[] = [];
      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        if (def.metric.startsWith("semrush_")) continue;
        const series = all[i];
        if (series.length === 0) continue;
        const values = series.map((s) => Number(s.value));
        const total = values.reduce((a, b) => a + b, 0);
        const avg = total / values.length;
        const baselineVal = values[0];
        const currentVal = values[values.length - 1];
        const trendRaw = pctChange(currentVal, baselineVal, false);
        trendCharts.push({
          title: def.cardTitle,
          node: (
            <DashboardCard
              title={def.cardTitle}
              source={def.source}
              series={series.map((s) => ({ date: s.captured_at, value: Number(s.value) }))}
              totalLabel={def.agg === "sum" ? "TOTAL" : "AVERAGE"}
              totalValue={fmtVal(def.agg === "sum" ? total : avg, def)}
              baselineLabel="BASELINE"
              baselineValue={fmtVal(baselineVal, def)}
              baselineDate={fmtDateShort(series[0].captured_at)}
              currentLabel="CURRENT"
              currentValue={fmtVal(currentVal, def)}
              currentDate={fmtDateShort(series[series.length - 1].captured_at)}
              deltaPct={trendRaw === null ? undefined : trendRaw}
              lowerBetter={def.lowerBetter}
            />
          ),
        });
      }

      // SEMrush → a grid of radial gauges (monthly data reads better as dials).
      // Each dial shows the latest value in the window against a "nice" scale
      // (rounded up from the window's max) so the arc is never pinned full.
      const gaugeNiceCeil = (max: number) => {
        if (max <= 0) return 1;
        const rough = max / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / mag;
        const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
        return Math.ceil(max / step) * step;
      };
      const fmtGauge = (v: number, money: boolean) => {
        const n = v >= 10_000
          ? v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
          : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
        return money ? `$${n}` : n;
      };
      const semrushGauges = semrushDefs.map((d) => {
        const series = all[defs.indexOf(d)];
        const money = d.kind === "money";
        if (series.length === 0) return { label: d.cardTitle, valueText: "—", scaleText: "", frac: 0 };
        const current = Number(series[series.length - 1].value);
        const windowMax = Math.max(...series.map((s) => Number(s.value)), 0);
        const scaleMax = gaugeNiceCeil(windowMax);
        const frac = scaleMax > 0 ? Math.max(0, Math.min(1, current / scaleMax)) : 0;
        return { label: d.cardTitle, valueText: fmtGauge(current, money), scaleText: "", frac };
      });
      if (semrushGauges.length) {
        trendCharts.push({
          title: "SEMrush",
          node: <GaugeGrid title="SEMrush" source="From SEMrush · latest value in the selected window" gauges={semrushGauges} />,
        });
      }

      // Daily wide table — limit to the daily-cadence metrics (GSC + GA4 + Bing).
      // SEMrush is monthly and would scatter sparse cells across the grid; its
      // numbers already live on the per-card "TOTAL/BASELINE/CURRENT" tiles.
      const dailyDefs = defs.filter((d) => !d.metric.startsWith("semrush_"));
      const dailyAll = dailyDefs.map((d) => all[defs.indexOf(d)]);
      const dateSet = new Set<string>();
      for (const series of dailyAll) for (const s of series) dateSet.add(s.captured_at);
      const dates = [...dateSet].sort();
      const byMetricDate = dailyAll.map((series) => {
        const m = new Map<string, number>();
        for (const r of series) m.set(r.captured_at, Number(r.value));
        return m;
      });
      type DailyRow = { date: string; values: (number | undefined)[] };
      const dailyRows: DailyRow[] = dates.map((d) => ({
        date: d,
        values: byMetricDate.map((m) => m.get(d)),
      }));

      const cols: ColumnDef<DailyRow>[] = [
        { header: "Date", kind: "date", get: (r) => r.date, flex: 1.4 },
        ...dailyDefs.map((d, i) => ({
          header: d.label,
          kind: (d.kind === "decimal" ? "text" : "int") as ColumnDef<DailyRow>["kind"],
          get: (r: DailyRow) => {
            const v = r.values[i];
            if (v === undefined) return "";
            if (d.kind === "decimal") return v.toFixed(1);
            return v;
          },
          flex: 1.2,
        })),
      ];

      // SEMrush reports monthly, so it gets its own table on a dedicated page
      // rather than scattering sparse cells across the daily grid above. One
      // column per SEMrush metric, one row per month it has data.
      const semrushSeries = semrushDefs.map((d) => all[defs.indexOf(d)]);
      const semrushDateSet = new Set<string>();
      for (const series of semrushSeries) for (const s of series) semrushDateSet.add(s.captured_at);
      const semrushDates = [...semrushDateSet].sort();
      const semrushByMetricDate = semrushSeries.map((series) => {
        const m = new Map<string, number>();
        for (const r of series) m.set(r.captured_at, Number(r.value));
        return m;
      });
      const semrushCols: ColumnDef<Record<string, unknown>>[] = [
        { header: "Month", kind: "date", get: (r) => r.date as string, flex: 1.4 },
        ...semrushDefs.map((d) => ({
          header: d.label,
          kind: (d.kind === "money" ? "money" : "int") as ColumnDef<Record<string, unknown>>["kind"],
          get: (r: Record<string, unknown>) => r[d.metric] ?? "",
          flex: 1.3,
        })),
      ];
      const semrushRows: Record<string, unknown>[] = semrushDates.map((date) => {
        const row: Record<string, unknown> = { date };
        semrushDefs.forEach((d, i) => {
          const v = semrushByMetricDate[i].get(date);
          row[d.metric] = v === undefined ? "" : v;
        });
        return row;
      });
      // SEMrush is monthly, so it gets its own table (one row per month that
      // overlaps the window) rather than scattering across the daily grid. Label
      // the page with the actual span of the SEMrush rows shown so its header
      // dates match its data.
      const extraTables = semrushRows.length
        ? [{
            title: "SEMrush — Monthly detail",
            columns: semrushCols,
            rows: semrushRows,
            fromIso: semrushDates[0],
            toIso: semrushDates[semrushDates.length - 1],
          }]
        : undefined;

      buf = await buildSectionPdf<DailyRow>({
        companyName: client.company_name,
        fromIso: effectiveFrom,
        toIso: effectiveTo,
        generatedAt,
        tz,
        sectionTitle: "Performance Report",
        kpis,
        columns: cols,
        rows: dailyRows,
        charts: trendCharts,
        extraTables,
        landscape: true,
      });
      return pdfResponse(`${slug}-performance-report-${effectiveFrom}_to_${effectiveTo}.pdf`, buf);
    }

    case "tasks": {
      const all = (await data.listTasks({ clientId })).filter((t) => {
        if (from && (t.due_date ?? "") < from) return false;
        if (to && (t.due_date ?? "") > to) return false;
        return true;
      });
      const open = all.filter((t) => t.status === "open").length;
      const done = all.filter((t) => t.status === "done").length;
      const today = new Date().toISOString().slice(0, 10);
      const overdue = all.filter((t) => t.status === "open" && t.due_date && t.due_date < today).length;
      const completionRate = all.length ? (done / all.length) : 0;

      const kpis: SectionKpi[] = [
        { label: "Total Tasks", value: all.length, format: "int" },
        { label: "Open", value: open, format: "int", tone: open > 0 ? "warn" : "neutral" },
        { label: "Done", value: done, format: "int", tone: "ok" },
        { label: "Overdue", value: overdue, format: "int", tone: overdue > 0 ? "bad" : "neutral" },
        { label: "Completion", value: completionRate, format: "pct", tone: completionRate >= 0.5 ? "ok" : "warn" },
      ];

      const cols: ColumnDef<Task>[] = [
        { header: "Title", kind: "text", get: (t) => t.title, flex: 3 },
        { header: "Status", kind: "badge", get: (t) => t.status, badgeFor: (v) => STATUS_BADGE[String(v)] ?? null },
        { header: "Due", kind: "date", get: (t) => t.due_date },
        { header: "Updated", kind: "datetime", get: (t) => t.updated_at, flex: 2 },
        { header: "Notes", kind: "long", get: (t) => t.notes },
      ];

      const statusChartNode = (
        <DonutChart
          title="Status breakdown"
          subtitle="Open vs. completed"
          data={[
            { label: "Done", value: done, color: PALETTE.ok },
            { label: "Open", value: open - overdue, color: PALETTE.accent },
            { label: "Overdue", value: overdue, color: PALETTE.bad },
          ].filter((d) => d.value > 0)}
          centerValue={`${Math.round(completionRate * 100)}%`}
          centerLabel="DONE"
        />
      );

      buf = await buildSectionPdf<Task>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Tasks Report",
        sectionLede: "Every action item tracked for this client during the selected window.",
        kpis,
        columns: cols,
        rows: all,
        charts: [{ title: "Task status", node: statusChartNode }],
      });
      break;
    }

    case "calendar": {
      const events = await data.listCalendar({ clientId, from, to });
      const meetings = events.filter((e) => e.type === "meeting").length;
      const deadlines = events.filter((e) => e.type === "deadline").length;
      const nowIso = new Date().toISOString();
      const upcoming = events.filter((e) => e.starts_at >= nowIso).length;

      const kpis: SectionKpi[] = [
        { label: "Total Events", value: events.length, format: "int" },
        { label: "Meetings", value: meetings, format: "int" },
        { label: "Deadlines", value: deadlines, format: "int", tone: deadlines > 0 ? "warn" : "neutral" },
        { label: "Upcoming", value: upcoming, format: "int", tone: "ok" },
      ];

      const cols: ColumnDef<CalendarEvent>[] = [
        { header: "Type", kind: "badge", get: (e) => e.type, badgeFor: (v) => TYPE_BADGE[String(v)] ?? null },
        { header: "Title", kind: "text", get: (e) => e.title, flex: 3 },
        { header: "Starts", kind: "datetime", get: (e) => e.starts_at, flex: 2 },
        { header: "Ends", kind: "datetime", get: (e) => e.ends_at, flex: 2 },
        { header: "Notes", kind: "long", get: (e) => e.notes },
      ];

      const monthCounts = new Map<string, { meetings: number; deadlines: number }>();
      for (const e of events) {
        const key = e.starts_at.slice(0, 7);
        const cur = monthCounts.get(key) ?? { meetings: 0, deadlines: 0 };
        if (e.type === "meeting") cur.meetings++; else cur.deadlines++;
        monthCounts.set(key, cur);
      }
      const months = [...monthCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const monthLabel = (k: string) => {
        const [y, m] = k.split("-");
        return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", { timeZone: "UTC", month: "short", year: "2-digit" });
      };
      const charts: ChartNode[] = [];
      if (months.length > 0) {
        charts.push({
          title: "Events per month",
          node: (
            <BarChart
              title="Events per month"
              subtitle={`${meetings} meetings · ${deadlines} deadlines`}
              data={months.map(([k, v]) => ({ label: monthLabel(k), value: v.meetings + v.deadlines, color: PALETTE.accent }))}
            />
          ),
        });
      }
      charts.push({
        title: "Type mix",
        node: (
          <DonutChart
            title="Type mix"
            subtitle="Meetings vs. deadlines"
            data={[
              { label: "Meetings", value: meetings, color: PALETTE.accent },
              { label: "Deadlines", value: deadlines, color: PALETTE.warn },
            ].filter((d) => d.value > 0)}
            centerValue={String(events.length)}
            centerLabel="EVENTS"
          />
        ),
      });

      buf = await buildSectionPdf<CalendarEvent>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Calendar Report",
        sectionLede: "Meetings and deadlines on the books for this client.",
        kpis,
        columns: cols,
        rows: events,
        charts,
      });
      break;
    }

    case "content": {
      const cards = (await data.listContent({ clientId })).filter((c) => {
        if (from && c.created_at.slice(0, 10) < from) return false;
        if (to && c.created_at.slice(0, 10) > to) return false;
        return true;
      });
      const proposed = cards.filter((c) => c.stage === "proposed").length;
      const pending  = cards.filter((c) => c.stage === "pending").length;
      const posted   = cards.filter((c) => c.stage === "posted").length;

      const kpis: SectionKpi[] = [
        { label: "Total Cards", value: cards.length, format: "int" },
        { label: "Proposed", value: proposed, format: "int", tone: proposed > 0 ? "warn" : "neutral" },
        { label: "Pending", value: pending, format: "int" },
        { label: "Posted", value: posted, format: "int", tone: "ok" },
      ];

      const cols: ColumnDef<ContentCard>[] = [
        { header: "Title", kind: "text", get: (c) => c.title, flex: 3 },
        { header: "Stage", kind: "badge", get: (c) => c.stage, badgeFor: (v) => STAGE_BADGE[String(v)] ?? null },
        { header: "Updated", kind: "datetime", get: (c) => c.updated_at, flex: 2 },
        { header: "Body", kind: "long", get: (c) => c.body },
      ];

      buf = await buildSectionPdf<ContentCard>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Content Cards Report",
        sectionLede: "Every content card created for this client, with its current approval stage.",
        kpis,
        columns: cols,
        rows: cards,
      });
      break;
    }

    case "content_events": {
      const supabase = await createClient();
      let q = supabase
        .from("content_card_events")
        .select("id, card_id, from_stage, to_stage, actor_role, actor_user_id, note, created_at, content_cards!inner(client_id, title)")
        .eq("content_cards.client_id", clientId)
        .order("created_at", { ascending: true });
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      const { data: result } = await q;

      type EventRow = {
        id: string; card_id: string;
        from_stage: string | null; to_stage: string;
        actor_role: string; actor_user_id: string | null;
        note: string | null; created_at: string;
        card_title: string;
      };

      const rows: EventRow[] = ((result ?? []) as unknown as Array<{
        id: string; card_id: string;
        from_stage: string | null; to_stage: string;
        actor_role: string; actor_user_id: string | null;
        note: string | null; created_at: string;
        content_cards: { title: string } | { title: string }[];
      }>).map((e) => {
        const card = Array.isArray(e.content_cards) ? e.content_cards[0] : e.content_cards;
        return {
          id: e.id,
          card_id: e.card_id,
          from_stage: e.from_stage,
          to_stage: e.to_stage,
          actor_role: e.actor_role,
          actor_user_id: e.actor_user_id,
          note: e.note,
          created_at: e.created_at,
          card_title: card?.title ?? "",
        };
      });

      const byAdmin  = rows.filter((r) => r.actor_role === "admin").length;
      const byClient = rows.filter((r) => r.actor_role === "client").length;
      const uniqueCards = new Set(rows.map((r) => r.card_id)).size;
      const changeRequests = rows.filter((r) => (r.note ?? "").startsWith("CHANGES REQUESTED")).length;

      const transitionCounts: Record<string, number> = {};
      for (const r of rows) {
        const key = `${r.from_stage ?? "—"} → ${r.to_stage}`;
        transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
      }
      const transitions = Object.entries(transitionCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value }));

      const kpis: SectionKpi[] = [
        { label: "Total Events", value: rows.length, format: "int" },
        { label: "Cards Touched", value: uniqueCards, format: "int" },
        { label: "By Admin", value: byAdmin, format: "int" },
        { label: "By Client", value: byClient, format: "int", tone: "ok" },
        { label: "Change Requests", value: changeRequests, format: "int", tone: changeRequests > 0 ? "warn" : "neutral" },
      ];

      const cols: ColumnDef<EventRow>[] = [
        { header: "When", kind: "datetime", get: (e) => e.created_at, flex: 2 },
        { header: "Card", kind: "text", get: (e) => trimText(e.card_title, 60), flex: 3 },
        { header: "From", kind: "badge", get: (e) => e.from_stage ?? "—", badgeFor: (v) => STAGE_BADGE[String(v)] ?? null },
        { header: "To", kind: "badge", get: (e) => e.to_stage, badgeFor: (v) => STAGE_BADGE[String(v)] ?? null },
        { header: "Actor", kind: "badge", get: (e) => e.actor_role, badgeFor: (v) => ROLE_BADGE[String(v)] ?? null },
        { header: "Note", kind: "long", get: (e) => e.note },
      ];

      const perDay = new Map<string, number>();
      for (const r of rows) {
        const k = new Date(r.created_at).toISOString().slice(0, 10);
        perDay.set(k, (perDay.get(k) ?? 0) + 1);
      }
      const dailySeries = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const charts: ChartNode[] = [];
      if (dailySeries.length > 0) {
        charts.push({
          title: "Events per day",
          node: (
            <LineChart
              title="Events per day"
              subtitle="Every stage move counts as one event"
              series={[{ label: "Events", points: dailySeries.map(([date, value]) => ({ date, value })) }]}
            />
          ),
        });
      }
      if (transitions.length > 0) {
        charts.push({
          title: "Stage transitions",
          node: (
            <BarChart
              title="Stage transitions"
              subtitle="Which moves happened most"
              data={transitions.map((t, i) => ({ label: t.label, value: t.value, color: PALETTE.series[i % PALETTE.series.length] }))}
            />
          ),
        });
      }
      if (byAdmin + byClient > 0) {
        charts.push({
          title: "Admin vs. client",
          node: (
            <DonutChart
              title="Who moved what"
              subtitle="Admin vs. client activity"
              data={[
                { label: "Admin", value: byAdmin, color: "#6366F1" },
                { label: "Client", value: byClient, color: PALETTE.ok },
              ].filter((d) => d.value > 0)}
              centerValue={String(rows.length)}
              centerLabel="EVENTS"
            />
          ),
        });
      }

      buf = await buildSectionPdf<EventRow>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Content Activity Log",
        sectionLede: "Every approval, push-back, and posting event recorded on this client's content cards.",
        kpis,
        columns: cols,
        rows,
        breakdowns: transitions.length ? [{ title: "Stage transitions", pairs: transitions }] : undefined,
        charts,
      });
      break;
    }

    case "audit": {
      const rowsIn = (await data.listAudit({ clientId })).filter((r) => {
        if (from && r.logged_in_at.slice(0, 10) < from) return false;
        if (to && r.logged_in_at.slice(0, 10) > to) return false;
        return true;
      });
      const uniqueUsers = new Set(rowsIn.map((r) => r.user_id).filter(Boolean)).size;
      const uniqueCities = new Set(rowsIn.map((r) => r.city).filter(Boolean)).size;
      const latest = rowsIn.reduce<string | null>((acc, r) => (acc && acc > r.logged_in_at ? acc : r.logged_in_at), null);

      const kpis: SectionKpi[] = [
        { label: "Total Logins", value: rowsIn.length, format: "int" },
        { label: "Distinct Users", value: uniqueUsers, format: "int" },
        { label: "Distinct Cities", value: uniqueCities, format: "int" },
        { label: "Latest Login", value: latest ? new Date(latest).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—" },
      ];

      const cols: ColumnDef<LoginAudit>[] = [
        { header: "Logged In", kind: "datetime", get: (r) => r.logged_in_at, flex: 2 },
        { header: "User", kind: "id", get: (r) => r.user_id },
        { header: "City", kind: "text", get: (r) => r.city },
        { header: "Region", kind: "text", get: (r) => r.region },
        { header: "Country", kind: "text", get: (r) => r.country },
        { header: "IP", kind: "id", get: (r) => r.ip },
      ];

      buf = await buildSectionPdf<LoginAudit>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Login Audit",
        sectionLede: "Every successful sign-in by users associated with this client.",
        kpis,
        columns: cols,
        rows: rowsIn,
      });
      break;
    }

    case "files": {
      const files = (await data.listFiles(clientId)).filter((f) => {
        if (from && f.created_at.slice(0, 10) < from) return false;
        if (to && f.created_at.slice(0, 10) > to) return false;
        return true;
      });
      const totalBytes = files.reduce((sum, f) => sum + Number(f.size_bytes ?? 0), 0);
      const categories: Record<string, number> = {};
      for (const f of files) {
        const k = f.category ?? "uncategorized";
        categories[k] = (categories[k] ?? 0) + 1;
      }
      const breakdown = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value }));

      const kpis: SectionKpi[] = [
        { label: "Total Files", value: files.length, format: "int" },
        { label: "Total Size", value: formatBytes(totalBytes) },
        { label: "Categories", value: Object.keys(categories).length, format: "int" },
      ];

      const cols: ColumnDef<FileRecord>[] = [
        { header: "Filename", kind: "text", get: (f) => f.filename, flex: 3 },
        { header: "Category", kind: "text", get: (f) => f.category },
        { header: "Size", kind: "bytes", get: (f) => f.size_bytes },
        { header: "Type", kind: "text", get: (f) => f.mime_type },
        { header: "Uploaded", kind: "datetime", get: (f) => f.created_at, flex: 2 },
      ];

      const charts: ChartNode[] = [];
      if (breakdown.length > 0) {
        charts.push({
          title: "Files by category",
          node: (
            <DonutChart
              title="Files by category"
              data={breakdown.map((b, i) => ({ label: b.label, value: Number(b.value), color: PALETTE.series[i % PALETTE.series.length] }))}
              centerValue={String(files.length)}
              centerLabel="FILES"
            />
          ),
        });
      }

      buf = await buildSectionPdf<FileRecord>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Files Report",
        sectionLede: "Every file shared with or uploaded for this client.",
        kpis,
        columns: cols,
        rows: files,
        breakdowns: breakdown.length ? [{ title: "By category", pairs: breakdown }] : undefined,
        charts,
      });
      break;
    }

    case "onboarding": {
      const ob = await data.getOnboarding(clientId);
      type Pair = { field: string; value: string };
      const flat: Pair[] = [];
      if (ob) {
        const walk = (prefix: string, val: unknown) => {
          if (val === null || val === undefined) return;
          if (typeof val !== "object") {
            flat.push({ field: prefix, value: String(val) });
            return;
          }
          for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            walk(prefix ? `${prefix}.${k}` : k, v);
          }
        };
        walk("", ob.data);
        flat.push({ field: "accepted_terms", value: String(ob.accepted_terms) });
        flat.push({ field: "submitted_at", value: ob.submitted_at });
        flat.push({ field: "terms_version", value: ob.terms_version });
      }

      const kpis: SectionKpi[] = ob
        ? [
            { label: "Fields Captured", value: flat.length, format: "int" },
            { label: "Terms Accepted", value: ob.accepted_terms ? "Yes" : "No", tone: ob.accepted_terms ? "ok" : "bad" },
            { label: "Submitted", value: new Date(ob.submitted_at).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) },
            { label: "Terms Version", value: ob.terms_version },
          ]
        : [{ label: "Status", value: "Not submitted", tone: "warn" }];

      const cols: ColumnDef<Pair>[] = [
        { header: "Field", kind: "text", get: (p) => p.field, flex: 2 },
        { header: "Value", kind: "long", get: (p) => p.value, flex: 3 },
      ];

      buf = await buildSectionPdf<Pair>({
        companyName: client.company_name,
        generatedAt,
        tz,
        sectionTitle: "Onboarding Report",
        sectionLede: ob
          ? "Every answer this client provided during onboarding, in flattened form."
          : "This client has not completed onboarding yet.",
        kpis,
        columns: cols,
        rows: flat,
      });
      break;
    }

    case "admin_access": {
      const sessions = (await data.listImpersonations({ clientId })).filter((r) => {
        if (from && r.started_at.slice(0, 10) < from) return false;
        if (to && r.started_at.slice(0, 10) > to) return false;
        return true;
      });
      const distinct = new Set(sessions.map((s) => s.admin_user_id).filter(Boolean)).size;
      const last = sessions.reduce<string | null>((acc, r) => (acc && acc > r.started_at ? acc : r.started_at), null);
      const active = sessions.filter((s) => !s.ended_at).length;

      const kpis: SectionKpi[] = [
        { label: "Total Sessions", value: sessions.length, format: "int" },
        { label: "Distinct Admins", value: distinct, format: "int" },
        { label: "Active Now", value: active, format: "int", tone: active > 0 ? "warn" : "neutral" },
        { label: "Last Session", value: last ? new Date(last).toLocaleString("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }) : "—" },
      ];

      const cols: ColumnDef<AdminImpersonation>[] = [
        { header: "Started", kind: "datetime", get: (r) => r.started_at, flex: 2 },
        { header: "Ended", kind: "datetime", get: (r) => r.ended_at, flex: 2 },
        { header: "Admin", kind: "id", get: (r) => r.admin_user_id },
        { header: "City", kind: "text", get: (r) => r.city },
        { header: "Region", kind: "text", get: (r) => r.region },
        { header: "Country", kind: "text", get: (r) => r.country },
      ];

      const perDay = new Map<string, number>();
      for (const s of sessions) {
        const k = new Date(s.started_at).toISOString().slice(0, 10);
        perDay.set(k, (perDay.get(k) ?? 0) + 1);
      }
      const daily = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const charts: ChartNode[] = [];
      if (daily.length > 0) {
        charts.push({
          title: "Sessions per day",
          node: (
            <LineChart
              title="Sessions per day"
              subtitle="Each admin view-as-customer session"
              series={[{ label: "Sessions", points: daily.map(([date, value]) => ({ date, value })) }]}
            />
          ),
        });
      }

      buf = await buildSectionPdf<AdminImpersonation>({
        companyName: client.company_name,
        fromIso: from,
        toIso: to,
        generatedAt,
        tz,
        sectionTitle: "Admin Access Log",
        sectionLede: "Every time an F1 Media admin entered this client's portal under view-as-customer mode.",
        kpis,
        columns: cols,
        rows: sessions,
        charts,
      });
      break;
    }
  }

  return pdfResponse(`${slug}-${section}-${range}.pdf`, buf!);
}
