// GET /api/report-readiness/[clientId]
//
// Pre-flight for the deck generator: which data sources will actually feed
// Claude for this client, and how fresh each one is. Rendered as a chips row
// on /admin/reports so the admin knows what the deck will be built from
// BEFORE burning a synthesis run on a client with no data.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { fieldyConfigured, fieldyMeetingsInWindow } from "@/lib/connectors/fieldy";
import { resolveRange, meetingMatchesClient } from "@/lib/deck/ai-narrative";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SourceStatus {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

function latestOf(series: Array<{ captured_at: string }>): string | null {
  return series.length ? series[series.length - 1].captured_at : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  // fetch()-only endpoint: return a proper 401 instead of requireAdmin()'s
  // redirect (which would hand the client a login page as a 200).
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  const { clientId } = await params;
  const client = await data.getClient(clientId);
  if (!client) return new Response("Client not found", { status: 404 });

  // The chips must answer "will THIS deck have data" — so they count within
  // the same window the deck will pull, not all-time. Same range resolution
  // as /api/monthly-report; "since_last" falls back to 28d here (close
  // enough for a pre-flight when no meeting is on record).
  const today = todayIso("America/Los_Angeles");
  const sp = req.nextUrl.searchParams;
  const rawRange = sp.get("range") || "28d";
  const window = resolveRange(
    rawRange === "since_last" ? "28d" : rawRange,
    sp.get("from"),
    sp.get("to"),
    today,
  );
  const inWin = (iso: string) => iso >= window.fromIso && iso <= window.toIso;

  const [clicks, sessions, bingClicks, semrushKeywords, semrushReports, onboarding, contentCards] =
    await Promise.all([
      data.listSnapshots({ clientId, metric: "clicks" }),
      data.listSnapshots({ clientId, metric: "sessions" }),
      data.listSnapshots({ clientId, metric: "bing_clicks" }),
      data.listSnapshots({ clientId, metric: "semrush_organic_keywords" }),
      data.listSemrushReports(clientId).catch(() => []),
      data.getOnboarding(clientId),
      data.listContent({ clientId }),
    ]);

  const clicksInWin = clicks.filter((s) => inWin(s.captured_at)).length;
  const sessionsInWin = sessions.filter((s) => inWin(s.captured_at)).length;
  const bingInWin = bingClicks.filter((s) => inWin(s.captured_at)).length;
  const posted = contentCards.filter((c) => c.stage === "posted").length;
  const postedInWin = contentCards.filter(
    (c) => c.stage === "posted" && inWin(c.updated_at.slice(0, 10)),
  ).length;

  // Fieldy: don't just check the key — check whether any conversation in the
  // window actually matches this client. Best-effort with a short budget.
  let fieldyDetail = "API key not configured";
  let fieldyOk = false;
  if (fieldyConfigured()) {
    try {
      const notes = await fieldyMeetingsInWindow(window.fromIso, window.toIso, 50);
      const matching = notes.filter((n) => meetingMatchesClient(n, client.company_name)).length;
      fieldyOk = matching > 0;
      fieldyDetail = matching
        ? `${matching} conversation${matching === 1 ? "" : "s"} mention this client in the window`
        : "connected — but no conversations mention this client in the window";
    } catch {
      fieldyOk = true; // key works in general; a transient fetch error shouldn't scare the operator
      fieldyDetail = "connected — couldn't pre-check this window (will retry at generate time)";
    }
  }

  const winLabel = window.label.toLowerCase();
  const sources: SourceStatus[] = [
    {
      key: "gsc",
      label: "Search Console",
      ok: clicksInWin > 0,
      detail: clicksInWin
        ? `${clicksInWin} days in ${winLabel} · latest ${latestOf(clicks)}`
        : clicks.length
          ? `no data in ${winLabel} (latest ${latestOf(clicks)})`
          : "no synced data",
    },
    {
      key: "ga4",
      label: "Google Analytics",
      ok: sessionsInWin > 0,
      detail: sessionsInWin
        ? `${sessionsInWin} days in ${winLabel} · latest ${latestOf(sessions)}`
        : sessions.length
          ? `no data in ${winLabel} (latest ${latestOf(sessions)})`
          : "no synced data",
    },
    {
      key: "bing",
      label: "Bing",
      ok: bingInWin > 0,
      detail: bingInWin
        ? `${bingInWin} days in ${winLabel}`
        : bingClicks.length
          ? `no data in ${winLabel} (latest ${latestOf(bingClicks)})`
          : "no synced data",
    },
    {
      key: "semrush",
      label: "SEMrush",
      ok: semrushKeywords.length > 0 || semrushReports.length > 0,
      detail: semrushReports.length
        ? `${semrushReports.length} deep-pull report${semrushReports.length === 1 ? "" : "s"}`
        : semrushKeywords.length
          ? "summary metrics only"
          : "no synced data",
    },
    {
      key: "onboarding",
      label: "Onboarding",
      ok: Boolean(onboarding),
      detail: onboarding ? "profile submitted" : "not submitted — deck voice will be generic",
    },
    {
      key: "fieldy",
      label: "Fieldy",
      ok: fieldyOk,
      detail: fieldyDetail,
    },
    {
      key: "content",
      label: "Content board",
      ok: postedInWin > 0 || posted > 0,
      detail: postedInWin
        ? `${postedInWin} posted in ${winLabel}`
        : posted
          ? `${posted} posted all-time, none in ${winLabel}`
          : "nothing posted yet",
    },
  ];

  return Response.json({ client: client.company_name, window: window.label, sources });
}
