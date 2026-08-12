// Monthly Performance Report — the client-facing deliverable.
//
// Ordered the way a client reads, not the way the data is collected: what
// changed, then what it produced (conversions), then why (search and rankings),
// then the technical work behind it (site health). A section with no data says
// so plainly instead of printing a zero that looks like a result.

import { renderToBuffer } from "@react-pdf/renderer";
import { Text, View } from "@react-pdf/renderer";
import { LineChart } from "@/lib/chart-pdf";
import {
  Highlights, KpiRow, ReportDocument, ReportPage, Section, Table, REPORT, SP,
  sourceLine, type Col, type Kpi, type ReportMeta,
} from "../chrome";
import { delta, num, pct, dur, toCsv, type ResolvedRange } from "../core";
import { conversionLabel, issueLabel, type MonthlyData } from "../data";
import { monthlyHighlights } from "../highlights";

export interface MonthlyInput {
  meta: ReportMeta;
  range: ResolvedRange;
  data: MonthlyData;
  /** The client's own colour, so the chart carries their identity. */
  accent: string;
  /** Filenames of the CSV companions, referenced from truncated tables. */
  csvNames: { pages: string; queries: string; rankings: string; issues: string };
}

const SEVERITY_COLOR: Record<string, string> = {
  error: REPORT.bad,
  warning: REPORT.warn,
  notice: REPORT.inkFaint,
};

/** Shortens a URL path for a table cell without losing the meaningful end. */
function shortPath(p: string, max = 52): string {
  if (p.length <= max) return p;
  return `${p.slice(0, max - 14)}…${p.slice(-13)}`;
}

function MonthlyBody({ meta, range, data, accent, csvNames }: MonthlyInput) {
  const t = data.traffic;
  const p = data.prevTraffic;

  const trafficKpis: Kpi[] = [
    { label: "Visitors", value: num(t.visitors), delta: delta(t.visitors, p.visitors) },
    { label: "Pageviews", value: num(t.pageviews), delta: delta(t.pageviews, p.pageviews) },
    { label: "Sessions", value: num(t.sessions), delta: delta(t.sessions, p.sessions) },
    {
      label: "Avg. time on page",
      value: dur(t.avgEngagementSec),
      delta: delta(t.avgEngagementSec, p.avgEngagementSec),
    },
  ];

  const searchKpis: Kpi[] = data.search
    ? [
        {
          label: "Clicks",
          value: num(data.search.clicks),
          delta: data.prevSearch ? delta(data.search.clicks, data.prevSearch.clicks) : null,
        },
        {
          label: "Impressions",
          value: num(data.search.impressions),
          delta: data.prevSearch ? delta(data.search.impressions, data.prevSearch.impressions) : null,
        },
        {
          label: "Click-through rate",
          value: pct(data.search.ctr, 2),
          delta: data.prevSearch ? delta(data.search.ctr, data.prevSearch.ctr) : null,
        },
        {
          label: "Avg. position",
          value: data.search.position.toFixed(1),
          // Lower is better: a fall in position number is a rise in performance.
          delta: data.prevSearch ? delta(data.search.position, data.prevSearch.position) : null,
          invert: true,
        },
      ]
    : [];

  const pageCols: Col<MonthlyData["topPages"][number]>[] = [
    { header: "Page", width: 5, cell: (r) => shortPath(r.path) },
    { header: "Views", width: 1.1, align: "right", cell: (r) => num(r.views) },
    { header: "Visitors", width: 1.1, align: "right", cell: (r) => num(r.visitors) },
  ];

  const queryCols: Col<MonthlyData["topQueries"][number]>[] = [
    { header: "Search term", width: 4.4, cell: (r) => r.term },
    { header: "Clicks", width: 1, align: "right", cell: (r) => num(r.clicks) },
    { header: "Impr.", width: 1.1, align: "right", cell: (r) => num(r.impressions) },
    { header: "CTR", width: 1, align: "right", cell: (r) => pct(r.ctr, 1) },
    { header: "Pos.", width: 0.9, align: "right", cell: (r) => (r.position ? r.position.toFixed(1) : "—") },
  ];

  const rankCols: Col<MonthlyData["rankings"][number]>[] = [
    { header: "Keyword", width: 5, cell: (r) => r.phrase },
    {
      header: "Position",
      width: 1.2,
      align: "right",
      cell: (r) => (r.position === null ? "Not in top 100" : `#${r.position}`),
      color: (r) => (r.position !== null && r.position <= 10 ? REPORT.ok : undefined),
    },
    {
      header: "Change",
      width: 1.2,
      align: "right",
      cell: (r) => {
        if (r.position === null || r.prevPosition === null) return "—";
        const move = r.prevPosition - r.position;
        if (move === 0) return "No change";
        return `${move > 0 ? "▲" : "▼"} ${Math.abs(move)}`;
      },
      color: (r) => {
        if (r.position === null || r.prevPosition === null) return REPORT.inkFaint;
        const move = r.prevPosition - r.position;
        return move === 0 ? REPORT.inkFaint : move > 0 ? REPORT.ok : REPORT.bad;
      },
    },
  ];

  const issueCols: Col<{ type: string; severity: string; count: number }>[] = [
    { header: "Issue", width: 5, cell: (r) => issueLabel(r.type) },
    {
      header: "Severity",
      width: 1.4,
      cell: (r) => r.severity[0].toUpperCase() + r.severity.slice(1),
      color: (r) => SEVERITY_COLOR[r.severity],
    },
    { header: "Pages", width: 1, align: "right", cell: (r) => num(r.count) },
  ];

  const gscSource = sourceLine({
    provider: "Google Search Console",
    asOf: range.label,
    note: "Measured, not estimated",
  });
  const pulseSource = sourceLine({
    provider: "F1 Pulse first-party analytics",
    asOf: range.label,
    note: "Cookieless — no personal data collected",
  });

  return (
    <>
      {/* ---------- Page 1: what changed, and traffic ---------- */}
      <ReportPage meta={meta}>
        <Highlights items={monthlyHighlights(data, range)} />

        <Section
          title="Audience"
          subtitle={`People who visited ${meta.domain} during ${range.label}, compared with ${range.prevLabel}.`}
          source={pulseSource}
        >
          <KpiRow items={trafficKpis} />
          {data.series.length > 1 ? (
            <View style={{ marginTop: SP.sm }}>
              <LineChart
                title="Visitors and pageviews by day"
                series={[
                  {
                    label: "Visitors",
                    color: accent,
                    points: data.series.map((s) => ({ date: s.date, value: s.visitors })),
                  },
                  {
                    label: "Pageviews",
                    color: REPORT.inkFaint,
                    points: data.series.map((s) => ({ date: s.date, value: s.pageviews })),
                  },
                ]}
                width={510}
                height={220}
              />
            </View>
          ) : null}
        </Section>
      </ReportPage>

      {/* ---------- Page 2: what the traffic did ---------- */}
      <ReportPage meta={meta}>
        <Section
          title="Enquiries and actions"
          subtitle="Visitors who did something worth counting — called, emailed, or submitted a form."
          source={pulseSource}
        >
          <KpiRow
            items={data.conversions.map((c) => ({
              label: conversionLabel(c.kind),
              value: num(c.count),
              delta: delta(c.count, c.prev),
            }))}
          />
        </Section>

        <Section title="Most-visited pages" source={pulseSource}>
          <Table cols={pageCols} rows={data.topPages} limit={15} csvName={csvNames.pages} />
        </Section>

        <Section title="Where visitors came from" source={pulseSource}>
          <Table
            cols={[
              { header: "Source", width: 5, cell: (r: { label: string }) => r.label },
              { header: "Views", width: 1.2, align: "right", cell: (r: { views: number }) => num(r.views) },
            ] as Col<{ label: string; views: number }>[]}
            rows={data.sources}
            limit={10}
            emptyMessage="Every visit in this period arrived directly, with no referring site recorded."
          />
        </Section>
      </ReportPage>

      {/* ---------- Page 3: search ---------- */}
      <ReportPage meta={meta}>
        <Section
          title="Search performance"
          subtitle={
            data.search
              ? `How ${meta.domain} performed in Google's search results during ${range.label}.`
              : undefined
          }
          source={data.search ? gscSource : undefined}
        >
          {data.search ? (
            <KpiRow items={searchKpis} />
          ) : (
            <Table
              cols={[]}
              rows={[]}
              emptyMessage={`No Search Console history has been imported for ${meta.domain} yet. Once connected, this section shows clicks, impressions, click-through rate and average position — including the 16 months of history Google holds.`}
            />
          )}
        </Section>

        {data.brandSplit?.configured ? (
          <Section
            title="Brand demand vs new demand"
            subtitle="Searches for the business by name, against searches from people who didn't know it yet. Growth in the second column is the work SEO is paid to do."
            source={gscSource}
          >
            <KpiRow
              perRow={2}
              items={[
                {
                  label: "Branded clicks",
                  value: num(data.brandSplit.branded.clicks),
                },
                {
                  label: "Non-branded clicks",
                  value: num(data.brandSplit.nonBranded.clicks),
                },
              ]}
            />
          </Section>
        ) : null}

        {data.topQueries.length > 0 ? (
          <Section title="Top search terms" source={gscSource}>
            <Table cols={queryCols} rows={data.topQueries} limit={20} csvName={csvNames.queries} />
          </Section>
        ) : null}
      </ReportPage>

      {/* ---------- Page 4: rankings ---------- */}
      <ReportPage meta={meta}>
        <Section
          title="Tracked keyword rankings"
          subtitle={
            data.visibilityNow
              ? `Search Visibility is ${data.visibilityNow.index}% — a click-weighted score where 100% would mean every tracked term sits at #1.`
              : undefined
          }
          source={sourceLine({ provider: "F1 Pulse rank tracking", asOf: range.label })}
        >
          {data.visibilityNow ? (
            <View style={{ marginBottom: SP.sm }}>
              <KpiRow
                items={[
                  {
                    label: "Search visibility",
                    value: `${data.visibilityNow.index}%`,
                    delta: data.visibilityPrev
                      ? delta(data.visibilityNow.index, data.visibilityPrev.index)
                      : null,
                  },
                  // No delta: these are a snapshot of the tracked set, not a
                  // measure that a previous period gives meaning to.
                  { label: "In top 3", value: num(data.visibilityNow.top3), delta: undefined },
                  { label: "On page one", value: num(data.visibilityNow.top10), delta: undefined },
                  { label: "Terms tracked", value: num(data.visibilityNow.tracked), delta: undefined },
                ]}
              />
            </View>
          ) : null}
          <Table
            cols={rankCols}
            rows={data.rankings}
            limit={25}
            csvName={csvNames.rankings}
            emptyMessage="No keywords are being tracked for this site yet. Add the terms this business wants to be found for, and positions appear here from the next daily check."
          />
        </Section>
      </ReportPage>

      {/* ---------- Page 5: health, and what isn't here ---------- */}
      <ReportPage meta={meta}>
        <Section
          title="Site health"
          subtitle={
            data.health
              ? `Technical condition of the site, from the most recent full crawl of ${num(data.health.pages)} pages.`
              : undefined
          }
          source={
            data.health?.crawledAt
              ? sourceLine({
                  provider: "F1 Pulse crawler",
                  asOf: data.health.crawledAt.slice(0, 10),
                })
              : undefined
          }
        >
          {data.health ? (
            <>
              <KpiRow
                items={[
                  {
                    label: "F1 Site Health",
                    value: data.health.score === null ? "—" : `${data.health.score}/100`,
                    delta: undefined,
                  },
                  { label: "Errors", value: num(data.health.errors), delta: undefined },
                  { label: "Warnings", value: num(data.health.warnings), delta: undefined },
                  { label: "Pages crawled", value: num(data.health.pages), delta: undefined },
                ]}
              />
              <View style={{ marginTop: SP.sm }}>
                <Table cols={issueCols} rows={data.health.topIssues} limit={12} csvName={csvNames.issues} />
              </View>
            </>
          ) : (
            <Table
              cols={[]}
              rows={[]}
              emptyMessage="No completed crawl covers this period yet. The crawler runs on a schedule and results appear here once the first pass finishes."
            />
          )}
        </Section>

        {data.missing.length > 0 ? (
          <Section
            title="Not included in this report"
            subtitle="Stated openly so no section is mistaken for a zero."
          >
            {data.missing.map((m) => (
              <Text key={m} style={{ fontSize: 8.5, color: REPORT.inkSoft, marginBottom: 3, lineHeight: 1.45 }}>
                •  {m}
              </Text>
            ))}
          </Section>
        ) : null}
      </ReportPage>
    </>
  );
}

export interface RenderedReport {
  pdf: Buffer;
  csvs: Array<{ name: string; content: string }>;
}

export async function renderMonthly(input: MonthlyInput): Promise<RenderedReport> {
  const pdf = await renderToBuffer(
    <ReportDocument meta={input.meta}>
      <MonthlyBody {...input} />
    </ReportDocument>,
  );

  // CSVs carry the full lists the PDF truncated — the PDF is for reading, the
  // CSV is for working.
  const csvs: Array<{ name: string; content: string }> = [];
  const d = input.data;

  if (d.topPages.length > 0) {
    csvs.push({
      name: input.csvNames.pages,
      content: toCsv(d.topPages, [
        { header: "Page", cell: (r) => r.path },
        { header: "Views", cell: (r) => r.views },
        { header: "Visitors", cell: (r) => r.visitors },
      ]),
    });
  }
  if (d.topQueries.length > 0) {
    csvs.push({
      name: input.csvNames.queries,
      content: toCsv(d.topQueries, [
        { header: "Search term", cell: (r) => r.term },
        { header: "Clicks", cell: (r) => r.clicks },
        { header: "Impressions", cell: (r) => r.impressions },
        { header: "CTR %", cell: (r) => r.ctr.toFixed(2) },
        { header: "Average position", cell: (r) => r.position.toFixed(1) },
      ]),
    });
  }
  if (d.rankings.length > 0) {
    csvs.push({
      name: input.csvNames.rankings,
      content: toCsv(d.rankings, [
        { header: "Keyword", cell: (r) => r.phrase },
        { header: "Position", cell: (r) => r.position ?? "Not in top 100" },
        { header: "Previous position", cell: (r) => r.prevPosition ?? "" },
        {
          header: "Change",
          cell: (r) =>
            r.position !== null && r.prevPosition !== null ? r.prevPosition - r.position : "",
        },
      ]),
    });
  }
  if (d.health && d.health.topIssues.length > 0) {
    csvs.push({
      name: input.csvNames.issues,
      content: toCsv(d.health.topIssues, [
        { header: "Issue", cell: (r) => issueLabel(r.type) },
        { header: "Severity", cell: (r) => r.severity },
        { header: "Pages affected", cell: (r) => r.count },
      ]),
    });
  }

  return { pdf, csvs };
}
