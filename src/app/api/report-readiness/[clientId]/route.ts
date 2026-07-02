// GET /api/report-readiness/[clientId]
//
// Pre-flight for the deck generator: which data sources will actually feed
// Claude for this client, and how fresh each one is. Rendered as a chips row
// on /admin/reports so the admin knows what the deck will be built from
// BEFORE burning a synthesis run on a client with no data.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { fieldyConfigured } from "@/lib/connectors/fieldy";

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
  _req: NextRequest,
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

  const posted = contentCards.filter((c) => c.stage === "posted").length;
  const sources: SourceStatus[] = [
    {
      key: "gsc",
      label: "Search Console",
      ok: clicks.length > 0,
      detail: clicks.length ? `${clicks.length} days · latest ${latestOf(clicks)}` : "no synced data",
    },
    {
      key: "ga4",
      label: "Google Analytics",
      ok: sessions.length > 0,
      detail: sessions.length ? `${sessions.length} days · latest ${latestOf(sessions)}` : "no synced data",
    },
    {
      key: "bing",
      label: "Bing",
      ok: bingClicks.length > 0,
      detail: bingClicks.length ? `latest ${latestOf(bingClicks)}` : "no synced data",
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
      ok: fieldyConfigured(),
      detail: fieldyConfigured()
        ? "connected — notes mentioning this client get pulled at generate time"
        : "API key not configured",
    },
    {
      key: "content",
      label: "Content board",
      ok: posted > 0,
      detail: posted ? `${posted} posted card${posted === 1 ? "" : "s"}` : "nothing posted yet",
    },
  ];

  return Response.json({ client: client.company_name, sources });
}
